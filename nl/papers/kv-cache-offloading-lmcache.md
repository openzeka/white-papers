---
title: Offloading van de KV-cache met LMCache bij LLM-inferentie
parent: White Papers
nav_order: 11
lang: nl
page_id: kv-cache-offloading-lmcache
date: 2026-10-21
card_tag: "LLM-benchmark"
description: >-
  Wat LMCache aan vLLM toevoegt wanneer dezelfde contexten terugkomen: een
  drietraps KV-cache (GPU, CPU, NVMe) op DGX Spark, gemeten TTFT — 1.95× bij
  hergebruik, 3.3× na een herstart van de service — en de instellingen en
  grenzen die daarbij horen.
permalink: /papers/kv-cache-offloading-lmcache/
last_modified_date: 2026-10-21
toc: true
---

> **Publicatiedatum:** oktober 2026
> **Reikwijdte:** Wat er verandert aan time to first token (TTFT) wanneer LMCache aan vLLM wordt toegevoegd op een workload (workload) die dezelfde contexten opnieuw verwerkt: de drie cachelagen en hoe een lookup werkt, een A/B-meting met drie herhalingen op DGX Spark met `nvidia/Qwen3.6-35B-A3B-NVFP4`, wat diskrecords bijdragen na een herstart van de service, en de instellingen die u voor productiegebruik moet controleren.
> **Opmerking:** De gemeten versnellingen gelden voor het model, de hardware, de cache-instellingen en de workload met hergebruik uit de secties 1–3. Bij workloads zonder hergebruikte contexten moet u niet op dezelfde verhouding rekenen.

{% include company/block.html name="prepared_by" %}

---

{:.no_toc}
## Inhoudsopgave

* TOC
{:toc}

---

## Managementsamenvatting

- **De vraag.** Wat gebeurt er met TTFT wanneer LMCache aan vLLM wordt toegevoegd op een workload waarin dezelfde 8,000-token-contexten in latere rondes terugkomen? LMCache bewaart eerder berekende KV-cachedata in lagen buiten het GPU-geheugen en laadt die opnieuw in in plaats van ze opnieuw te berekenen; de versnelling hangt af van hoeveel hergebruikt kan worden en wat het opnieuw inladen kost.
- **De setup.** NVIDIA DGX Spark (GB10, SM 12.1, 121 GB unified memory) die `nvidia/Qwen3.6-35B-A3B-NVFP4` serveert — 22 GB in NVFP4, een hybride Mamba/GDN- en MoE-architectuur, 35B totale en 3B actieve parameters — met vLLM 0.25.1 + LMCache 0.5.1. De workload bestaat uit 665 contexten van 8,000 tokens, ongeveer 5.3 miljoen tokens, twee keer verwerkt: één keer om de cache te vullen, één keer om te meten. Verzoeken worden sequentieel gestuurd, telkens één tegelijk.
- **Het meetresultaat.** De mediaan van TTFT over drie herhalingen daalt van **1,279.1 ms** met alleen vLLM naar **655.2 ms** met vLLM + LMCache — een **versnelling van 1.95×**, ongeveer 49% lagere TTFT. Alle drie de herhalingen bevestigen elkaar: 1,276–1,289 ms tegenover 653–656 ms.
- **Waarom het hier geldt.** De werkverzameling is ongeveer 63 GB tegenover een GPU-KV-cache (fp8) van 55.31 GiB; de GPU-cache alleen kan dus niet alles bevatten. In de tweede ronde wordt data daarom uit CPU-geheugen en van disk opnieuw ingeladen in plaats van opnieuw berekend. Bij workloads waarin contexten maar één keer worden gebruikt, moet u deze winst niet verwachten.
- **Na een herstart van de service.** Als de diskrecords er nog zijn en overeenkomen, is dezelfde workload in **2.61 s** klaar in plaats van de **8.51 s** van een koude start — ongeveer **3.3×**. Een record op disk helpt alleen als het bij het verzoek past en met succes wordt opnieuw ingeladen.
- **Meerdere vLLM-instanties die één cache delen** is wat de multi-process-architectuur (MP) mogelijk maakt, maar dat is hier niet gemeten: het experiment draaide met één enkele vLLM-instantie. Het verdelen van verzoeken over instanties is een apart mechanisme; LMCache is op zich geen loadbalancer.

---

## 1. Doel en methode

### 1.1. Onderzoeksvraag

Dit experiment meet wat er verandert aan de time to first token (TTFT) wanneer LMCache aan vLLM wordt toegevoegd, op een workload die dezelfde contexten opnieuw verwerkt.

LMCache wil de noodzaak om een context opnieuw te verwerken verminderen door eerder berekende KV-cachedata ook buiten het GPU-geheugen te bewaren. De versnelling die het oplevert hangt echter af van of de gecachte data hergebruikt kan worden en van wat het opnieuw inladen kost.

### 1.2. Workload

De test gebruikt 665 verschillende contexten van elk 8,000 tokens — samen ongeveer 5.3 miljoen tokens.

Het experiment verloopt in twee rondes:

- **Ronde 1 — de cache vullen:** de contexten worden verwerkt en cacherecords worden aangemaakt.
- **Ronde 2 — de prestaties meten:** dezelfde contexten worden opnieuw bezocht en TTFT wordt gemeten.

De vergelijking gebruikt twee scenario's:

- **Scenario A:** alleen vLLM.
- **Scenario B:** vLLM + LMCache.

Verzoeken worden sequentieel gestuurd en er wordt er maar één tegelijk verwerkt. Zo blijven de resultaten zo veel mogelijk gescheiden van de extra effecten die gelijktijdige verzoeken zouden veroorzaken.

---

## 2. Installatie en cache-architectuur

### 2.1. Cachelagen

In deze setup wordt de cache over drie lagen beheerd.

| Laag | Capaciteit | Taak |
| --- | --- | --- |
| L0 | 55.31 GiB GPU-KV-cache (`fp8`) | De snelste cache; vLLM bewaart die in het GPU-geheugen |
| L1 | 20 GB CPU-geheugen | Tussencache buiten de GPU |
| L2 | NVMe-SSD; `fs`-adapter met `use_odirect=true` | De laag waar KV-data op disk wordt bewaard |

De basisfunctie van LMCache is herbruikbare KV-data in deze lagen te bewaren en die, wanneer ze nodig is, opnieuw in te laden vanuit de cache in plaats van opnieuw te berekenen.

**Lookup in de cache:** De data van een verzoek wordt eerst in de GPU-cache (L0) gezocht, daarna in CPU-geheugen (L1) en in de disklag (L2). Metadata en indexinformatie bepalen of er een record op disk staat. Wanneer er een record wordt gevonden, moeten de KV-data zelf nog worden gelezen en overgedragen. Dat er een record op disk staat, betekent dus niet dat het gratis en meteen de GPU bereikt.

**Opslaan van KV-data:** Tijdens het experiment werd waargenomen dat de berekende KV-data naar L1 werd geschreven, terwijl het schrijven naar L2 asynchronisch doorging. Het aandeel van diskschrijven in de TTFT-meting wordt daarom laag geacht. Deze waarneming betekent niet dat diskschrijven voor elke workload of elk recordformaat niets kost.

Bij koude verzoeken werd het aantal schrijfbewerkingen naar disk dat over ongeveer 25 verzoeken werd waargenomen, gerapporteerd als ongeveer drie bestanden per verzoek. Deze meting is beperkt tot de gebruikte experimentele omstandigheden.

**Eviction uit de cache:** wanneer het L1-gebruik de ingestelde drempel bereikt, begint eviction. De waarde van `--eviction-ratio` bepaalt hoeveel geheugen in elke evictionronde wordt leeggemaakt. Het experiment gebruikte de waarde `0.99`. Dit is niet de instelling die voor productie wordt aanbevolen.

**Records die zich op disk opstapelen:** Met de gebruikte `fs`-adapter werd in dit experiment zowel het automatisch verwijderen van oude records als het zichzelf terugwinnen van diskspace niet waargenomen. Bij een controle op 19 oktober 2026 stonden er nog ongeveer 377 records en 32 GB aan data van de periode 6–15 oktober op disk.

Deze waarneming laat zien dat diskrecords zich in de gebruikte configuratie kunnen opstapelen. Hoe de zoekkosten veranderen naarmate het aantal records groeit, moet apart worden gemeten.

### 2.2. Instellingen die tijdens het experiment vastbleven

| Instelling | Waarde |
| --- | --- |
| KV-datatype en blokgrootte | `fp8`, `block_size=2144`, `--chunk-size 2144` |
| Tokenlimiet voor gebundelde prefill | `--max-num-batched-tokens 4287` (`2N−1`) |
| Hybride modelcache | `--mamba-cache-mode align` |
| vLLM-prefix-cache | `--enable-prefix-caching` |
| Evictionbeleid | `LRU` |
| Evictiondrempel | `--eviction-trigger-watermark 0.80` |
| Evictionratio | `--eviction-ratio 0.99` |
| Speculatieve decodering | MTP, 3 speculatieve tokens |
| Wachttijd tussen rondes | 5 seconden |
| Wachttijd nadat de container start | 10 seconden |

> **Belangrijk:** `--eviction-ratio 0.99` werd gebruikt om in het experiment expliciet te maken dat de cache over zijn capaciteit gaat. Met de standaardwaarde `0.20` die in productie wordt gebruikt, kan het evictiongedrag anders zijn.

### 2.3. Startopdrachten

#### Scenario A — alleen vLLM

```bash
docker run -d --name bench-vllm-off \
  --gpus all --ipc=host --network host --shm-size 32g \
  --memory 112g --memory-swap 112g \
  -v /home/nvidia/.cache/huggingface:/home/nvidia/.cache/huggingface \
  -v /home/nvidia/.triton:/home/nvidia/.triton \
  -e HF_HOME=/home/nvidia/.cache/huggingface \
  -e HF_HUB_OFFLINE=1 \
  -e VLLM_USE_RUST_FRONTEND=1 \
  vllm/vllm-openai:latest \
  nvidia/Qwen3.6-35B-A3B-NVFP4 \
    --host 0.0.0.0 --port 8100 \
    --served-model-name qwen3.6-35b-a3b \
    --trust-remote-code --tensor-parallel-size 1 \
    --enable-auto-tool-choice --tool-call-parser qwen3_coder --reasoning-parser qwen3 \
    --mm-encoder-tp-mode data --language-model-only \
    --kv-cache-dtype fp8 --attention-backend flashinfer --moe-backend marlin \
    --gpu-memory-utilization 0.5 --max-model-len 262144 \
    --max-num-seqs 16 --max-num-batched-tokens 4287 \
    --enable-chunked-prefill --async-scheduling --enable-prompt-tokens-details \
    --mamba-cache-mode align --load-format fastsafetensors \
    --speculative-config '{"method":"mtp","num_speculative_tokens":3,"moe_backend":"triton"}' \
    --enable-prefix-caching
```

#### Scenario B — vLLM + LMCache

Eerst wordt de LMCache-server gestart:

```bash
docker run -d --name bench-lmcache \
  --gpus all --ipc=host --network host \
  -v /home/nvidia/kv-cash-exp/lmcache-l2:/home/nvidia/kv-cash-exp/lmcache-l2 \
  --entrypoint /usr/local/bin/lmcache \
  vllm/vllm-openai:latest \
  server --host 127.0.0.1 --port 5555 --http-port 8080 \
    --chunk-size 2144 \
    --l1-size-gb 20 --l1-init-size-gb 4 \
    --eviction-policy LRU --eviction-trigger-watermark 0.80 --eviction-ratio 0.99 \
    --supported-transfer-mode lmcache_driven \
    --l2-adapter '{"type":"fs","base_path":"/home/nvidia/kv-cash-exp/lmcache-l2","relative_tmp_dir":".tmp","use_odirect":true}'
```

Daarna wordt vLLM gestart met de model- en inferentie-instellingen van scenario A. Het enige verschil is de volgende verbindingsconfiguratie voor LMCache:

```bash
--kv-transfer-config '{"kv_connector":"LMCacheMPConnector","kv_role":"kv_both","kv_connector_extra_config":{"lmcache.mp.host":"127.0.0.1","lmcache.mp.port":5555,"lmcache.mp.mq_timeout":300}}'
```

Deze configuratie zorgt ervoor dat vLLM de multi-process-connector (MP) van LMCache gebruikt.

**Startvolgorde:** eerst wordt de LMCache-server gestart en wordt geverifieerd dat het eindpunt `/healthcheck` gezond antwoordt. Daarna wordt vLLM gestart en wordt 10 seconden gewacht voordat de meting begint.

**De scenario's uit elkaar houden:** In scenario A draait alleen `bench-vllm-off`; in scenario B draaien `bench-lmcache` en `bench-vllm-on`.

Na het experiment kunnen de containers worden verwijderd met:

```bash
docker rm -f bench-vllm-off bench-vllm-on bench-lmcache
```

---

## 3. Resultaten

De werkverzameling van ongeveer 63 GB overschrijdt de GPU-KV-cachecapaciteit van 55 GB. De prestatiemeting werd in de tweede ronde gedaan, toen dezelfde contexten opnieuw werden bezocht.

| Meting | A: alleen vLLM | B: vLLM + LMCache | Versnelling |
| --- | ---: | ---: | ---: |
| **Mediaan van TTFT over drie herhalingen** | **1,279.1 ms** | **655.2 ms** | **1.95×** |
| TTFT van de eerste meting | 1,461.6 ms | 743.0 ms | 1.97× |

De TTFT-bereiken die over de drie herhalingen werden waargenomen, zijn:

- **Scenario A:** 1,276–1,289 ms
- **Scenario B:** 653–656 ms

In alle drie de herhalingen kwam de TTFT van scenario B lager uit dan die van scenario A.

De resultaten laten zien dat LMCache onder deze experimentele omstandigheden de mediaan van TTFT met ongeveer 49% verlaagde. Anders gezegd: de time to first token verbeterde ongeveer 1.95×.

Dit resultaat geldt alleen voor het geteste model, de hardware, de cache-instellingen en de workload met hergebruik. Voor andere workloads moet niet op dezelfde versnellingsverhouding worden gerekend.

---

## 4. Beoordeling

### 4.1. TTFT daalt bij hergebruik van dezelfde contexten

Wanneer de werkverzameling de capaciteit van de GPU-KV-cache overschrijdt, kan het opnieuw inladen van eerder berekende KV-data uit een cache sneller zijn dan dezelfde context opnieuw berekenen.

In dit experiment werd de mediaan van TTFT over drie herhalingen gemeten als 1,279.1 ms in scenario A en 655.2 ms in scenario B: met LMCache ongeveer een **versnelling van 1.95×**.

Dit resultaat is vooral belangrijk voor de volgende workloads:

- Agentsystemen waarin lange contexten over meerdere beurten worden gebruikt.
- Codeanalysetoepassingen waarin dezelfde codebase keer op keer wordt bekeken.
- Systemen waarin vergelijkbare contexten door verschillende gebruikers of sessies worden hergebruikt.

Omgekeerd moeten workloads waarin contexten maar één keer worden gebruikt, niet op dezelfde winst rekenen. Het werkelijke prestatieverschil wordt bepaald door de cachetrefkans (hit rate), de tijd om data opnieuw in te laden en de kosten van herberekening.

### 4.2. De bijdrage van de diskcache na een herstart van de service

Als de KV-records op disk bewaard blijven en overeenkomen met nieuwe verzoeken, kunnen ze na een herstart van de service nog steeds worden gebruikt. Eerder berekende data kan dan worden hergebruikt.

In dit experiment duurde dezelfde workload bij een koude start 8.51 s, en na een herstart met gebruik van de diskrecords 2.61 s — ongeveer een **versnelling van 3.3×**.

Dit resultaat laat zien dat de diskcache ook na een herstart kan blijven helpen. Het voordeel hangt echter af van het gedrag van de opslagdriver, van de geldigheid van de records en van het met succes terugladen van de data.

**Dat een record op disk staat, betekent niet dat het per se gebruikt kan worden.** Het record moet bij het verzoek passen en met succes worden opnieuw ingeladen.

### 4.3. Meerdere vLLM-instanties die één cache delen

De multi-process-architectuur (MP) stelt één LMCache-server in staat om meerdere vLLM-instanties te bedienen. Onder passende omstandigheden kunnen verschillende vLLM-instanties KV-records hergebruiken uit het gedeelde L1-CPU-geheugen of, als dat zo is geconfigureerd, uit de L2-disklaag.

Deze architectuur heeft drie belangrijke voordelen.

**1. De cache wordt gedeeld tussen vLLM-instanties.**

Een context die door de ene vLLM-instantie is verwerkt, kan onder passende omstandigheden ook in een verzoek van een andere vLLM-instantie worden gebruikt. De noodzaak om dezelfde context in elke instantie opnieuw te berekenen kan dan afnemen.

**2. Het GPU-geheugen wordt efficiënter gebruikt.**

De noodzaak om dezelfde contexten apart in de GPU-cache van elke vLLM-instantie te bewaren kan afnemen. Waar meerdere instanties van hetzelfde model draaien, kan deze aanpak de totale GPU-geheugenbehoefte verlagen.

LMCache neemt de GPU-geheugenbehoefte echter niet volledig weg. Het opnieuw inladen van data uit de cache vereist nog steeds geheugen om die naar de GPU over te dragen en te gebruiken.

**3. Het cachebeheer wordt gecentraliseerd.**

L1-capaciteit, L2-opslag en cachebewerkingen kunnen via een aparte LMCache-service worden beheerd. In systemen met meerdere inferentie-instanties kan deze aanpak het beheer eenvoudiger maken.

Om van deze voordelen te profiteren moeten de vLLM-instanties draaien met compatibele modellen, tokenizer, KV-indeling en cacheconfiguraties. Hoe verzoeken over de instanties worden verdeeld, de capaciteit van de LMCache-server en de geldigheid van de records beïnvloeden de prestaties eveneens.

**Belangrijke beperking:** LMCache op zich is geen loadbalancer. Het verdelen van verzoeken over vLLM-instanties moet door een apart mechanisme worden verzorgd. Meerdere instanties die op één LMCache-server aansluiten verhogen ook de belasting van CPU, geheugen, netwerk en disk. Naarmate het systeem groeit moeten deze bronnen worden gemonitord.

Dit experiment gebruikte één enkele vLLM-instantie. De bijdrage van gedeeld cachegebruik over meerdere instanties aan de prestaties is daarom niet direct gemeten. Deze mogelijkheid is een extra gebruiksoptie die de LMCache-architectuur kan bieden, geen prestatieresultaat dat door het experiment is bewezen.

### Globale beoordeling

Het experiment laat zien dat LMCache TTFT kan verlagen bij workloads die de capaciteit van de GPU-KV-cache overschrijden en dezelfde contexten hergebruiken.

De records op disk kunnen onder passende omstandigheden ook na een herstart van de service bruikbaar blijven. Meerdere vLLM-instanties die één cache delen kunnen bij grotere deployments extra voordelen opleveren. Om de prestatiebijdrage van dit laatste gebruiksscenario vast te stellen, is echter een aparte test met meerdere instanties nodig.

---

## 5. LMCache-installatie: te controleren instellingen en aanbevelingen voor productie

In deze sectie komen de vereisten uit de officiële documentatie voor de multi-process-installatie van LMCache en voor Qwen-hybride modellen aan bod, samen met de in het experiment gebruikte instellingen.

**De instellingen uit het experiment zijn niet de instellingen die voor productie worden aanbevolen.** Vooral de evictionratio, de ondersteuning van hybride modellen en de levenscyclus van records moeten voor productiegebruik opnieuw worden beoordeeld.

Officiële bronnen:

- [LMCache — Deployment Guide](https://docs.lmcache.ai/mp/deployment.html)
- [LMCache — Configuration Reference](https://docs.lmcache.ai/mp/configuration.html)
- [LMCache — Qwen3.5 / Qwen3.6 / Qwen3.8 model recipe](https://docs.lmcache.ai/recipes/qwen3_5.html)
- [LMCache — Quick Start](https://docs.lmcache.ai/mp/quickstart.html)

### 5.1. Multi-processinstallatie en verbindingsinstellingen

In de MP-modus draait de LMCache-cacheserver als een apart proces naast het inferentieproces van vLLM. vLLM verbindt met die server via `LMCacheMPConnector`, zodat cachebeheer en opslagbewerkingen in een ander proces worden uitgevoerd.

| Onderwerp | Vereiste of uitleg |
| --- | --- |
| Connector | `LMCacheMPConnector` |
| KV-rol | `kv_role=kv_both` |
| Communicatie | Standaard ZMQ; standaardpoort `5555` |
| Statuscontrole via HTTP | Standaardpoort `8080` wanneer de HTTP-server is ingeschakeld; het eindpunt `/healthcheck` |
| Prometheus-metrics | Standaardpoort `9090` |
| Containernetwerk | `--network host` kan worden gebruikt voor verbindingen op dezelfde host |
| IPC | Traditionele CUDA-IPC-overdracht heeft `--ipc=host` nodig; geïsoleerde IPC is een aparte installatieoptie |

**Startvolgorde:** eerst moet de LMCache-server starten, daarna moet een geslaagde statuscontrole (health check) worden geverifieerd, en pas daarna mag vLLM draaien. Verifiëren dat de statuscontrole echt slaagt is betrouwbaarder dan een vaste tijd wachten.

De opties `--network host` en `--ipc=host` dienen verschillende doelen:

- Met `--network host` gebruikt de container de netwerkconfiguratie van de host. In dit experiment maakt het dat vLLM LMCache eenvoudig bereikt op `127.0.0.1:5555`.
- `--ipc=host` geeft toegang tot het gedeelde gebied `/dev/shm` in de traditionele IPC-configuratie en kan nodig zijn bij de betrokken CUDA-IPC-overdrachtsscenario's.

Deze twee opties zijn niet onderling uitwisselbaar.

#### De optie voor geïsoleerde IPC

Met de optie `--isolated-ipc` van LMCache kunnen twee containers werken zonder gedeelde `/dev/shm`-ruimte, gebruikmakend van de CUDA-IPC-mechanismen die dat ondersteunen.

Als deze optie wordt gebruikt:

- Moet de LMCache-server met `--isolated-ipc` worden gestart.
- Moet aan vLLM-kant `lmcache.mp.isolated_ipc=true` worden ingesteld.
- Moeten beide kanten dezelfde IPC-modus gebruiken. Niet overeenkomende modussen kunnen overdrachtfouten veroorzaken.
- Moet de compatibiliteit met de CUDA-geheugentoewijzer en met functies zoals de slaapstand van vLLM ook worden gecontroleerd.

U moet niet aannemen dat geïsoleerde IPC in elke setup sneller of geschikter is. Deze methode verschilt van de traditionele configuratie uit het experiment en moet apart worden getest.

### 5.2. Waar op te letten bij hybride Mamba/GDN-modellen

De betrokken modellen in de Qwen3.5-, Qwen3.6- en Qwen3.8-familie combineren full-attention-lagen met Mamba/Gated-DeltaNet-lagen (GDN).

In deze architecturen moeten niet alleen de klassieke attention-KV-blokken maar ook de terugkerende toestandsdata worden gecacht. Dat de instellingen van vLLM en LMCache met elkaar verenigbaar zijn, is daarom belangrijk.

In het betrokken recept voor hybride Qwen-modellen springen drie instellingen eruit:

1. `--mamba-cache-mode align` aan vLLM-kant.
2. `--enable-prefix-caching` aan vLLM-kant.
3. Een bij het model passende chunkgrootte en `--separate-object-groups` aan LMCache-kant.

#### Hoe wordt de blokgrootte N bepaald?

`N` is geen constante die voor elk model geldt. De waarde moet uit het model en de vLLM-configuratie worden bepaald.

Kijk in de startlogs van vLLM naar een regel als:

```text
Setting attention block size to N tokens
```

In dit experiment werd `N = 2144` gebruikt. Bij het reproduceren van het experiment moet deze waarde met de startlogs worden geverifieerd.

De waarden `784` en `544` die in de officiële recepten voor andere modellen worden gegeven, mogen niet direct op dit model worden toegepast.

#### Waarom is `--separate-object-groups` belangrijk?

Bij hybride modellen zorgt `--separate-object-groups` dat Mamba-toestandsdata in afzonderlijke cacheobjectgroepen wordt beheerd. Het betrokken recept voor hybride Qwen-modellen beschouwt deze optie als noodzakelijk.

In het hoofdexperiment werd deze optie uitgeschakeld gehouden. De reden is dat hij niet voorkomt in het prefix-suffix-tuner-benchmarkrecept van LMCache en er geen extra variabele in de hoofdvergelijking A/B gewenst was.

De optie is ook aan en uit getest. In die vergelijking werd geen meetbaar verschil in TTFT waargenomen; de mediaan van de versnelling bleef ongeveer 1.95×.

Dit resultaat betekent niet dat de optie onder alle omstandigheden zonder effect is. In de geteste workload werd geen prestatieverschil waargenomen; mogelijke effecten op de correctheid van records en op de cachetrefkans moeten apart worden beoordeeld.

**Aanbeveling:** Voor productiegebruik moet `--separate-object-groups` worden ingeschakeld om aan het officiële recept voor hybride Qwen-modellen te voldoen, en moeten correctheid en cachetrefkans opnieuw worden getest.

#### De instellingen `--chunk-size` en `--max-num-batched-tokens`

De waarde van `--chunk-size` van LMCache moet verenigbaar zijn met de gehanteerde blokgrootte die vLLM gebruikt. De connector kan de geconfigureerde minimale chunkgrootte verhogen tot een grotere waarde op basis van de KV-indeling van het model. Aan alleen de waarde op de opdrachtregel moet daarom niet worden vertrouwd; de startlogs moeten ook worden bekeken.

Bij hybride modellen beïnvloedt de instelling `--max-num-batched-tokens` of prefill en decode samen lopen.

| Waarde van `--max-num-batched-tokens` | Verwacht gedrag |
| --- | --- |
| `N` | Per schedulerstap kan er maar één blok aan budget overblijven. Het starten van de prefill van een nieuw verzoek terwijl decode doorgaat kan moeilijk worden, en de gelijktijdigheid (concurrency) kan sterk dalen. |
| Tussen `N` en `2N`; bijvoorbeeld `2N−1` | Laat per stap één blok progressie toe en laat tegelijk extra budget over voor prefill en decode samen. |
| `2N` of meer | Grotere prefillstappen zijn mogelijk. Maar de grenzen waarop de cachetoestand wordt opgeslagen kunnen zeldzamer worden en het hergebruik van prefixes grover. |

In dit experiment werd met `N = 2144` de waarde `2N−1 = 4287` gebruikt. Deze keuze sluit aan bij de aanpak in het betrokken recept voor hybride modellen. Bij een ander model of een andere blokgrootte moet de waarde opnieuw worden berekend.

Het betrokken recept voor hybride Qwen-modellen meldt ongeveer een vertraging van 7× in een test met lage cachetrefkans of een koude cache wanneer `max-num-batched-tokens=N` wordt gebruikt. Deze verhouding geldt niet voor elke workload; het is één voorbeeld van hoeveel het verlies aan gelijktijdigheid de prestaties onder bepaalde omstandigheden kan beïnvloeden.

**Extra controle:** Als bij de start van vLLM de fout `max_num_seqs exceeds available Mamba cache blocks` verschijnt, moet `--max-num-seqs` worden verlaagd of, als de geheugenlimieten dat toelaten, `--gpu-memory-utilization` worden verhoogd.

### 5.3. L1-capaciteit en het evictionbeleid

Bij het bepalen van de L1-capaciteit moet niet alleen aan LMCache worden gedacht, maar ook aan het geheugen dat het besturingssysteem, vLLM en andere processen nodig hebben.

Het verhogen van de L1-capaciteit kan de kans vergroten dat hergebruikte records in CPU-geheugen blijven en kan de noodzaak om L2 te benaderen verminderen. Maar een capaciteit die het beschikbare geheugen van het systeem overschrijdt, mag niet worden gekozen.

| Instelling | Uitleg en aanbeveling |
| --- | --- |
| `--l1-size-gb` | Moet worden ingesteld nadat er genoeg geheugen overblijft voor het besturingssysteem en vLLM. |
| `--l1-init-size-gb` | Bepaalt het L1-geheugen dat bij de start wordt gereserveerd. Het werkelijke geheugenverbruik moet samen met de capaciteit worden geverifieerd. |
| `--eviction-policy LRU` | Verwijdert eerst de records die het langst niet zijn gebruikt. |
| `--eviction-trigger-watermark 0.8` | Start eviction wanneer het L1-gebruik de drempel bereikt. De gedocumenteerde standaardwaarde is `0.8`. |
| `--eviction-ratio 0.2` | Bepaalt hoeveel geheugen in elke evictionronde wordt leeggemaakt. De gedocumenteerde standaardwaarde is `0.2`. |
| `--max-workers` | Stelt het aantal threads van de basiswerkpools in; de standaardwaarde is `1`. |
| `--max-gpu-workers` | Stelt de met de GPU verbonden werkpools bij. Moet op basis van de workload worden beoordeeld wanneer meerdere vLLM-instanties dezelfde LMCache-server gebruiken. |
| `--max-cpu-workers` | Stelt de werkpools voor lookup en ander CPU-intensief werk bij. |

Evictiondrempel en evictionratio hebben verschillende functies: de drempel bepaalt wanneer eviction begint; de ratio bepaalt hoeveel ruimte in elke evictionronde wordt vrijgemaakt.

Als eviction vaak voorkomt, moeten eerst de L1-capaciteit, de cachetrefkans en de geheugengebruikstrends worden bekeken. De drempel of de evictionratio kan waar nodig worden gewijzigd. Maar omdat deze wijzigingen beïnvloeden welke records de cache bewaart en hoe vaak L2 wordt geraadpleegd, moeten ze in de productieomgeving metend worden gekozen.

De ratio `0.99` uit dit experiment is gekozen om het overlopen van de cache expliciet te maken. U mag hem niet opvatten als de voor productie aanbevolen standaardwaarde.

### 5.4. Overdrachtsmodus en monitoring

LMCache MP biedt verschillende methoden om KV-data over te dragen:

- **`lmcache_driven`:** de LMCache-server beheert de STORE/RETRIEVE-overdracht. Ondersteunt CUDA IPC en gedeeld CPU-geheugen en is de standaard in een MP-setup.
- **`engine_driven`:** gebruikt de PREPARE/COMMIT-gebaseerde overdrachtsroute. Kan worden gebruikt bij CPU- of niet-CUDA-versnellersscenario's.
- **`auto`:** laadt beide overdrachtsroutes. Kan worden gebruikt in opstellingen waar workers van verschillende apparaattypen aansluiten.

De overdrachtsmodus moet worden gekozen op basis van de hardware- en connectoreisen. In dit experiment werd `lmcache_driven` gebruikt.

#### Statuscontrole en metrics

Nadat de LMCache-server start, moeten de volgende controles worden gedaan:

1. Verifieer dat het eindpunt `/healthcheck` gezond antwoordt.
2. Controleer of vLLM met succes met de LMCache-server is verbonden.
3. Bekijk in de startlogs hoe de chunkgrootte is bepaald en welke cacheopslagbewerkingen plaatsvinden.
4. Gebruik de Prometheus-metrics om het opslaan, het opnieuw inladen, de cachetrefkans en het geheugengebruik te volgen.
5. Gebruik `LMCACHE_LOG_LEVEL=DEBUG` bij een eerste installatie en tijdens debuggen. Ga in productie terug naar `INFO` zodra het systeem stabiel draait.

De Prometheus-metrics van de MP-server worden standaard op poort `9090` aangeboden. Dat die poort bereikbaar is bewijst echter op zich niet dat alle metrics correct worden verzameld. De toegang van het monitoringsysteem en de reikwijdte van de metingen moeten ook worden geverifieerd.

### 5.5. De levenscyclus van KV-records en diskbeheer

Dat KV-records op disk staan garandeert niet dat ze onbeperkt geldig en bruikbaar blijven. Het gedrag van de gebruikte opslagdriver bij het verwijderen van records, het evicten ervan en het terugwinnen van diskspace moet apart worden bekeken.

Met de `fs`-configuratie uit dit experiment werd waargenomen dat oude records zich opstapelen. In productie moeten daarom de volgende controles worden gedaan:

- Het schijfgebruik en de vrije ruimte moeten regelmatig worden gemonitord.
- De voorwaarden waaronder KV-records ongeldig worden moeten worden vastgesteld.
- De mechanismen voor verwijderen en ruimte terugwinnen die de driver ondersteunt moeten worden geverifieerd.
- Er moet worden getest dat oude records na een herstart van de service nog steeds te vinden zijn en met succes kunnen worden opnieuw ingeladen.
- Verschillende modellen, blokgroottes of incompatibele attention-backend-configuraties moeten worden verhinderd dezelfde records te gebruiken.

**Dat een record op disk staat, betekent niet dat er een cache-hit heeft plaatsgevonden.** Het record moet bij het verzoek passen, verenigbaar zijn met de configuratie en met succes worden opnieuw ingeladen.

### 5.6. Acceptatietest: opslaan en terughalen van KV-data

Alleen TTFT meten is voor productiegebruik niet genoeg. Er moet ook een acceptatietest komen die aantoont dat de cache echt records aanmaakt en die records in latere verzoeken gebruikt.

De aanbevolen teststappen zijn:

1. Start vLLM en LMCache met een vast model, tokenizer, attention-backend en blokconfiguratie.
2. Doe een eerste run met een vaste set verzoeken.
3. Verifieer uit de logs en metrics dat LMCache-records zijn aangemaakt.
4. Maak met de methode die de vLLM-versie ondersteunt de lokale prefix-cache van vLLM leeg. Controleer apart of de externe LMCache-records bewaard blijven. Het doel is om het opnieuw inladen te testen terwijl de LMCache-records behouden blijven.
5. Stuur dezelfde verzoeken nog eens en verifieer dat er LMCache-laadbewegingen plaatsvinden.
6. Leg TTFT en, waar mogelijk, de cachetrefkans vast.
7. Herhaal de test onder een koude cache, een warme cache en na een herstart van de service.

#### Controle op correctheid

Bij hybride GDN-modellen mag niet worden aangenomen dat gegenereerde tekst die uit de cache wordt opnieuw ingeladen token voor token identiek is aan koude generatie.

Het betrokken LMCache-recept houdt voor deze modellen equivalente scores aan in plaats van gelijkheid op bitniveau. Correctheidsevaluatie moet daarom met een testsuite die bij het model past en met vooraf vastgestelde toleranties gebeuren.

Als een API als `POST /reset_prefix_cache` wordt gebruikt, moet worden geverifieerd dat dit eindpunt in de betrokken vLLM-versie is ingeschakeld en dat de aanroep alleen de bedoelde lokale cache beïnvloedt. Zonder controle van versie en configuratie mag niet worden aangenomen dat deze aanroep de externe LMCache-records zeker bewaart.

### 5.7. Ondersteuningsstatus en beperkingen

| Onderwerp | Beoordeling |
| --- | --- |
| Gelijkheid op bitniveau | Niet gegarandeerd voor hybride GDN-modellen. Een correctheidsevaluatie op scoreniveau moet worden uitgevoerd. |
| Draagbaarheid van KV-data | Records hangen af van instellingen als de attention-backend en de blokgrootte van de kernel. Delen tussen verschillende configuraties mag niet zonder verificatie. |
| CacheGen en CacheBlend | Het betrokken recept voor hybride modellen vermeldt dat ze niet worden ondersteund. Opaque records op byte-niveau zijn mogelijk niet geschikt voor inhoudsgebaseerde bewerkingen. |
| Mamba-prefix-cache in de modus `align` | In het betrokken officiële recept als experimenteel gemarkeerd. |
| KV-data van beeld en video | Voor tekstgeneratie geverifieerd gedrag betekent niet dat ook cachen van beeld en video is geverifieerd. |
| Gebruik met SGLang | Wordt in het betrokken recept voor hybride Qwen-modellen niet gepresenteerd als een geverifieerde LMCache-integratie. |

Deze beperkingen betekenen niet dat LMCache in het algemeen niet werkt. Ze laten zien welke functies met welk model en welke integratie zijn geverifieerd. Productiebeslissingen moeten rekening houden met deze ondersteuningsomvang.

---

## 6. Grenzen van het experiment en generaliseerbaarheid

- De hoofdprestatiemeting is gedaan met synthetische verzoeken van elk 8,000 tokens. De resultaten vertegenwoordigen niet alle eigenschappen van echte chat- en code-inhoud.
- De test is beperkt tot drie herhalingen, één model en één hardwareconfiguratie. De verkregen versnellingsverhouding kan veranderen met andere modellen, gelijktijdigheidsniveaus of cache-instellingen.
- `--eviction-ratio 0.99` is een experimentele instelling die is gebruikt om het overlopen van de cache expliciet te maken. Met de standaardwaarde `0.20` die in productie wordt gebruikt, kan het cachegedrag anders zijn.
- Het bewaren van de diskrecords en de bijdrage die ze na een herstart van de service leveren hangen af van de opslagdriver en van de geldigheid van de records.
- Dit rapport meet vooral TTFT. Voor een productiebesluit moeten ook correctheid van de output, stabiliteit op lange termijn, geheugenverbruik en diskbeheer worden geverifieerd.
- De winst die meerdere vLLM-instanties die één LMCache-server gebruiken zouden kunnen opleveren is in dit experiment niet gemeten. Voor dit gebruiksscenario is een aparte test met meerdere instanties nodig.

---

## 7. Bronnen

1. LMCache — [Deployment Guide](https://docs.lmcache.ai/mp/deployment.html)
2. LMCache — [Configuration Reference](https://docs.lmcache.ai/mp/configuration.html)
3. LMCache — [Qwen3.5 / Qwen3.6 / Qwen3.8 model recipe](https://docs.lmcache.ai/recipes/qwen3_5.html)
4. LMCache — [Quick Start](https://docs.lmcache.ai/mp/quickstart.html)

De officiële documentatie is bekeken per oktober 2026. Omdat de MP-ondersteuning van LMCache en de ondersteuning van hybride modellen tussen versies kunnen veranderen, moet de compatibiliteit met de gebruikte versie en configuratie opnieuw worden gecontroleerd wanneer het experiment wordt gereproduceerd.

---

{% include company/block.html name="cta_logo" %}

**Laten we samen uw LLM-infrastructuur plannen.** Voor hardwaredimensionering en een cachearchitectuur die rekening houdt met KV-cachelagen en eviction, {% include company/block.html name="contact_cta" %}