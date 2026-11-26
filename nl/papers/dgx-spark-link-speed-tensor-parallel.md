---
title: Netwerklinksnelheid voor tensorparallelle inferentie op DGX Sparks (200G vs 100G)
parent: White Papers
nav_order: 12
lang: nl
page_id: dgx-spark-link-speed-tensor-parallel
date: 2026-10-15
card_tag: "Technische gids"
description: >-
  Hoeveel netwerkbandbreedte gebruikt een tensorparallel DGX Spark-cluster, en wat betekent
  een verlaging van 200G naar 100G per Spark voor de inferentiesnelheid? Deze paper beschrijft
  het mechanisme en vergelijkt een schatting op basis van de modelarchitectuur met metingen van GLM-5.3 op TP8 en GLM-5.3-Flash
  op TP4 met echte 100G-links.
permalink: /papers/dgx-spark-link-speed-tensor-parallel/
last_modified_date: 2026-11-23
toc: true
---

> **Publicatiedatum:** oktober 2026
> **Reikwijdte:** Hoe tensorparallelle (TP) inferentie het netwerk tussen DGX Spark-systemen gebruikt, hoe u het effect van een gehalveerde linksnelheid schat op basis van de architectuur van het model en de instellingen van de inferentie-engine, een gemeten vergelijking van 200 Gb/s-links en geëmuleerde 100 Gb/s-links op 8× DGX Spark met GLM-5.3 op TP8, en van 200 Gb/s-links en echte 100 Gb/s-links op 4× DGX Spark met GLM-5.3-Flash op TP4.
> **Opmerking:** De metingen gelden voor de modellen, de inferentie-engines, de versies en de instellingen in Secties 7 en 12. De schattingsmethode van Secties 3–6 is overdraagbaar naar andere modellen en instellingen; de gemeten getallen zijn dat niet.

{% include company/block.html name="prepared_by" %}

---

{:.no_toc}
## Inhoudsopgave

* TOC
{:toc}

---

## Managementsamenvatting

- **Capaciteit van de switch.** Op de twee 400G-poorten van een CRS812 kunt u 4 Sparks aansluiten bij 200 Gb/s per Spark of 8 Sparks bij 100 Gb/s per Spark. Voor een CRS804 zijn de aantallen respectievelijk 8 en 16. Wat betekent die keuze voor de tijd die een gebruiker op een antwoord wacht?
- **Netwerkverkeer bij tensorparallellisme.** In de configuratie met acht Sparks bevat elke Spark een achtste van de verdeelde gewichten en berekent hij een deel van de uitvoer van elke laag. Twee keer per laag tellen de Sparks hun deelresultaten via het netwerk bij elkaar op met een *all-reduce*. Voor grote overdrachten gaat de schatting uit van een *ring*. Bij het verwerken van de prompt (*prefill*) telt elke all-reduce veel gegevens op. Bij het genereren van het antwoord (*decode*) gaat het om een kleine hoeveelheid.
- **De schatting.** Grote prefill-overdrachten kunnen de link volledig benutten. Bij halvering van de linksnelheid duren ze langer en komt het eerste token later. Voor GLM-5.3 op TP8 geeft de modelarchitectuur bij 100 Gb/s een bovengrens van **0.135 s extra wachttijd tot het eerste token (TTFT) per 1,000 prompttokens**. De overdrachten tijdens decode zijn zo klein dat de halvering in deze tests geen meetbaar verlies aan streamingsnelheid opleverde.
- **Piekverkeer en gemiddeld verkeer.** Tijdens prefill bereikt het verkeer 150–200 Gb/s in bursts van enkele milliseconden. Voor de lange prompt uit het voorbeeld is het hoogste gemiddelde over één seconde ongeveer 40 Gb/s. Tijdens decode bedraagt het verkeer gemiddeld enkele Gb/s.
- **Gemeten** met GLM-5.3 op TP8, 200 Gb/s tegenover een geëmuleerde 100 Gb/s-link (die tot 109 Gb/s draagt):
  - **De decodesnelheid bleef in de praktijk gelijk** (−2.3% tot +4.3% over de tests).
  - Voor afzonderlijke prompts van 8K–64K tokens **nam de TTFT met 12.6–13.9% toe**. Dat is ongeveer **0.11 s per 1,000 prompttokens**, dicht bij de schatting.
  - Wanneer **vier lange prompts tegelijk binnenkwamen**, nam de gemiddelde TTFT per verzoek met **17.9–22.5%** toe.
  - **korte prompts worden niet beïnvloed** (+1% bij 1K tokens).
- **Testen vóór het omkabelen.** Beperk NCCL op de bestaande 200 Gb/s-bekabeling tot één netwerkinterface per Spark. Vergelijk dezelfde workload bij beide instellingen en schat met het gemeten aantal prefill-bytes de extra vertraging op een echte link.
- **Projectie voor echte links.** Bij de gemeten netto-overdrachtssnelheid van ongeveer 98 Gb/s voorspelt het model op TP8 tot circa 18% extra TTFT voor één lange prompt. Voor vier gelijktijdige lange prompts is dat tot circa 28% voor de gemiddelde TTFT per verzoek, uitgaande van vergelijkbare scheduling.
- **Gemeten op echte 100 Gb/s-links.** Met GLM-5.3-Flash op TP4 over 4 Sparks kwam het eerste token van een prompt van 8K tokens 0.39 s later, tegenover een schatting van ten hoogste 0.38 s. De decodesnelheid bleef gelijk. Vier Sparks delen één breakoutkabel. Alleen de instellingen van de bijbehorende switchaansluiting veranderen. Start de Sparks na het omkabelen opnieuw op.
- **Conclusie.** Voor tensorparallelle inferentie op DGX Sparks tot en met TP8 is 100 Gb/s een praktische keuze als de workload de extra wachttijd bij een lange prompt toelaat. Zodra het antwoord begint, verschijnen de tokens in hetzelfde tempo. Bij de korte prompt op TP8 was er geen meetbare vertraging. Voor een prompt van 8K op TP4 week de op de modelarchitectuur gebaseerde schatting op echte links hooguit 0.01 s af van de gemeten extra wachttijd. Gebruik bij 16 Sparks twee TP8-clusters en controleer of de switch op alle poorten tegelijk op volle snelheid kan doorsturen.

---

## 1. Inleiding

Eén DGX Spark heeft 128 GB unified memory. Modellen die groter zijn, worden bediend door ze te verdelen over meerdere Sparks die via hun ConnectX-7-netwerkadapters en een switch met elkaar verbonden zijn. Bij **tensorparallellisme** wordt elke laag van het model over alle Sparks verdeeld, zodat ze voor elk token dat het model verwerkt vele malen gegevens uitwisselen, en elke stap van de inferentie op het netwerk wacht.

De linksnelheid bepaalt dus mede welke switch u nodig hebt. Bij 100 Gb/s per Spark in plaats van 200 Gb/s volstaat een kleinere switch voor hetzelfde cluster, of kunt u per breakoutaansluiting twee keer zoveel Sparks aansluiten. Of dat aanvaardbaar is, hangt af van de vertraging die de halvering van de linksnelheid bij tensorparallelle inferentie veroorzaakt.

Deel I van deze paper (Secties 2–6) beschrijft wat tensorparallellisme over het netwerk stuurt, waarom het verwerken van de prompt en het genereren van het antwoord het netwerk heel verschillend belasten, en hoe u het effect van een gehalveerde linksnelheid schat op basis van alleen de architectuur van het model, de instellingen van de inferentie-engine en de linksnelheid. Deel II (Secties 7–10) laat zien hoe u een 100 Gb/s-link emuleert op de bestaande 200 Gb/s-bekabeling, zodat een workload op 100 Gb/s kan worden uitgeprobeerd voordat er een kabel wordt gekocht; het past de emulatie toe op 8× DGX Spark die GLM-5.3 op TP8 bedienen, vergelijkt de resultaten met de schatting en rekent ze om naar een echte 100 Gb/s-kabel. Deel III (Secties 11–13) is de volgende stap zodra het geëmuleerde resultaat aanvaardbaar is: het bouwt echte 100 Gb/s-links op voor 4 Sparks en meet daarop GLM-5.3-Flash op TP4. Sectie 14 geeft het dimensioneringsantwoord voor clusters van 4, 8 en 16 Sparks.

---

# Deel I: Theorie

## 2. Het DGX Spark-netwerk

### 2.1. De ConnectX-7-adapter en zijn twee PCIe-links

Elke DGX Spark heeft een ConnectX-7-netwerkadapter met twee QSFP-poorten. De clusters in deze paper gebruiken één poort per Spark, met een kabel naar de switch op een nominale linksnelheid van 200 Gb/s.

De adapter is via PCIe Gen5 met de GB10-chip verbonden, over twee aparte links van elk vier lanes (×4). Eén ×4-link draagt iets meer dan 100 Gb/s aan gegevens (Sectie 7.3), niet genoeg om in zijn eentje een 200 Gb/s-poort vol te houden; twee links samen kunnen dat wel. Linux ziet de adapter eenmaal per PCIe-link, zodat de ene fysieke poort twee keer verschijnt: als twee netwerkinterfaces (`enp1s0f1np1` en `enP2p1s0f1np1`), elk met een eigen RDMA-apparaat. Beide interfaces melden een linksnelheid van 200 Gb/s, omdat ze bij dezelfde poort horen, maar elk kan alleen verplaatsen wat zijn eigen PCIe-link draagt.

NCCL, de bibliotheek die de inferentie-engine gebruikt voor de communicatie tussen de Sparks, behandelt de twee RDMA-apparaten als twee aparte netwerkpaden en verdeelt zijn verkeer over beide; alleen samen halen ze de 200 Gb/s van de poort. Dezelfde opbouw maakt het mogelijk om 100 Gb/s uit te proberen zonder de hardware aan te raken: door NCCL tot een van de twee interfaces te beperken, wordt elke Spark beperkt tot wat één PCIe-link kan dragen, dicht bij wat een 100 Gb/s-link draagt (Sectie 7.3).

Het verkeer tussen de Sparks gebruikt RDMA (remote direct memory access): de adapter leest gegevens uit het geheugen van de verzendende applicatie en schrijft ze rechtstreeks in het geheugen van de ontvangende applicatie, zonder dat de gegevens door de netwerkstack van het besturingssysteem gaan. Dat houdt de vertraging van elke overdracht laag. Het is ook de reden dat de gebruikelijke Linux-netwerkstatistieken dit verkeer niet tonen (Bijlage A). Hier loopt RDMA over gewoon Ethernet met RoCE v2 (RDMA over Converged Ethernet, versie 2), dat RDMA-pakketten binnen UDP/IP transporteert.

### 2.2. De link is het traagste pad in het systeem

200 Gb/s is 25 GB/s. Een DGX Spark leest zijn eigen geheugen met 273 GB/s, ongeveer 11 keer sneller. Alles wat het netwerk tussen Sparks moet oversteken, beweegt dus veel langzamer dan alles wat een Spark uit zijn eigen geheugen leest. Daarom bepalen de hoeveelheid gegevens die tensorparallellisme over het netwerk stuurt, en de timing daarvan, hoeveel de linksnelheid ertoe doet.

### 2.3. Switches en breakoutopties

De CRS812 heeft twee 400G-QSFP-DD-poorten en twee afzonderlijke 200G-QSFP56-poorten. De CRS804 heeft vier 400G-QSFP-DD-poorten. De tabel geeft aan hoeveel Sparks u via de 400G-poorten kunt aansluiten met één breakoutkabel per poort en één Spark per kabeltak.

| Switch | Aantal 400G-poorten op de switch | Totaal aantal Sparks met een 2 × 200G-breakoutkabel per poort | Totaal aantal Sparks met een 4 × 100G-breakoutkabel per poort |
|---|---|---|---|
| MikroTik CRS812 | 2 | **4** | **8** |
| MikroTik CRS804 | 4 | **8** | **16** |

Voor TP4 bij 200 Gb/s per Spark sluit u op elk van de twee 400G-poorten van de CRS812 een 2 × 200G-breakoutkabel aan. Elke kabel verbindt twee Sparks met de switch. Met een 4 × 100G-kabel per poort kunt u op dezelfde switch acht Sparks aansluiten bij 100 Gb/s per Spark.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/network-topology.png' | relative_url }}" alt="CRS812 met 8 Sparks op 100 Gb/s, CRS804 met 8 Sparks op 200 Gb/s en met 16 Sparks op 100 Gb/s" width="820"/></p>
<sub><i>Figuur 1: Breakoutopties, één link per DGX Spark.</i></sub>

---

## 3. Hoe tensorparallellisme het netwerk gebruikt

### 3.1. Het model opsplitsen

Bij tensorparallellisme met 8 Sparks (TP8) wordt elke tensorparallelle gewichtsmatrix in 8 delen gesplitst, en bevat elke Spark één stuk. In de attentionblokken worden de attention-heads over de Sparks verdeeld. In de feed-forward- en Mixture-of-Experts-blokken (MoE) worden ook de matrices van elke expert opgesplitst, zodat elke Spark een deel van elke expert bevat. Elke Spark leest alleen zijn eigen achtste van de gewichten uit zijn eigen geheugen. Daardoor past een model dat groter is dan één Spark, en draait het sneller dan wanneer elke Spark alles zou moeten lezen.

### 3.2. Deelresultaten en de all-reduce

Aan de uitgang van de attention- en feed-forwardblokken bevat elke Spark de gewichten voor een deel van de invoerdimensie. Daarmee berekent hij voor elke uitvoerwaarde een deelsom. Optellen van de acht deelsommen levert de volledige uitvoer op. Deze waarden zijn de *activaties* van het model. Ze vormen de vectoren die elk token op zijn weg door de lagen vertegenwoordigen. Bij GLM-5.3 bevat zo'n vector 6,144 waarden (de *verborgen dimensie*). Bij 4,096 tokens in één forward pass draagt elke Spark 4,096 × 6,144 deelwaarden bij. Bij 2 bytes per waarde is dat 50.3 MB.

Die som maken is de taak van een **all-reduce**: *reduce* omdat de blokken worden gecombineerd (hier opgeteld), *all* omdat elke deelnemer het resultaat ontvangt. In de hier gemodelleerde parallelle opstelling zijn er per laag twee nodig, één na het attentionblok en één na het feed-forward- of MoE-blok, en er is er nog één nodig bij de input-embedding. Elke Spark wacht bij elke all-reduce tot alle acht hun bijdrage hebben geleverd, zodat het netwerk op het pad van elke laag ligt.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp-layer-allreduce.png' | relative_url }}" alt="Eén transformerlaag onder TP8 met zijn twee all-reduces, en de ring van 8 Sparks" width="820"/></p>
<sub><i>Figuur 2: Eén transformerlaag onder tensorparallellisme, en de ring-all-reduce tussen 8 Sparks.</i></sub>

### 3.3. Hoe de ring-all-reduce werkt

Als elke Spark zijn hele blok rechtstreeks naar de andere zeven zou sturen, zou hij 7 × 50.3 MB versturen en zou de belasting met elke extra Spark toenemen. Voor overdrachten van deze omvang gaat de schatting ervan uit dat NCCL een **ring** gebruikt (Sectie 3.4). In deze logische ring stuurt elke Spark alleen naar zijn opvolger. Elk blok wordt verdeeld in evenveel segmenten als er Sparks zijn. Figuur 3 toont de twee fasen van de bewerking voor vier Sparks.

In de eerste fase, *reduce-scatter*, stuurt elke Spark in elke ringstap één segment naar de volgende Spark, en telt de ontvangende Spark het op bij zijn eigen kopie van dat segment. Elke Spark werkt tegelijk aan een ander segment, zodat na N − 1 ringstappen elke Spark de volledige som van precies één segment heeft. In de tweede fase, *all-gather*, gaan de voltooide segmenten nog een keer de ring rond, nu gekopieerd in plaats van opgeteld, tot na nog eens N − 1 ringstappen elke Spark de volledige som heeft.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/ring-allreduce-steps.png' | relative_url }}" alt="Ring-all-reduce tussen vier Sparks, stap voor stap: reduce-scatter in drie ringstappen, daarna all-gather in drie ringstappen" width="820"/></p>
<sub><i>Figuur 3: Ring-all-reduce tussen vier Sparks. Na de drie reduce-scatter-stappen heeft elke Spark één volledige som; na de drie all-gather-stappen heeft elke Spark ze alle vier.</i></sub>

In elk van de 2 × (N − 1) ringstappen verstuurt een Spark één segment, 1/N van zijn blok. Elke Spark verstuurt dus in totaal **2 × (N − 1) / N** keer het blok: 1.75× bij acht Sparks, en nooit meer dan 2×, hoeveel er ook meedoen. Voor GLM-5.3 op TP8 verstuurt elke Spark 1.75 × 50.3 MB = **88.1 MB** per all-reduce, in 14 ringstappen van ongeveer 6.3 MB. Omdat elke Spark dezelfde hoeveelheid verstuurt, is het verkeer dat op één Spark wordt gemeten representatief voor alle acht.

Opgeteld over alle all-reduces in het model (78 lagen × 2, plus 1) kost elk prompttoken elke Spark

> (2 × 78 + 1) × 6,144 waarden × 2 bytes × 1.75 = **3.38 MB** aan netwerkverkeer.

Deel II toetst dit getal aan het gemeten verkeer.

### 3.4. Ring of boom: welke all-reduce NCCL uitvoert

De ring is niet de enige manier om een all-reduce uit te voeren. Inferentie-engines hebben hun eigen all-reduce-kernels, maar die werken alleen tussen GPU's in één machine of één NVLink-domein, dus tussen DGX Sparks loopt elke all-reduce via NCCL ([vLLM](https://github.com/vllm-project/vllm/blob/main/vllm/distributed/device_communicators/custom_all_reduce.py), [SGLang](https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/distributed/parallel_state.py)). Naast de ring heeft NCCL een **boom**-algoritme (tree), en nog enkele algoritmen die speciale hardware vereisen: reductie in het netwerk door de switch (CollNet, met NVIDIA SHARP) of door een NVSwitch (NVLS). Nog een ander algoritme, PAT, wordt alleen voor andere collectieve bewerkingen gebruikt. Tussen DGX Sparks, elk met één GPU en verbonden via Ethernet, loopt een all-reduce daarom ofwel als ring, ofwel als boom ([NCCL-omgevingsvariabelen](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/env.html), `NCCL_ALGO`).

De boom van NCCL is een *dubbele binaire boom* (double binary tree). De gegevens worden in twee helften gesplitst, en elke helft wordt langs haar eigen binaire boom opgeteld: deelsommen stromen omhoog naar de wortel, en het resultaat stroomt weer naar beneden. De twee bomen zijn zo ingericht dat een Spark die in de ene boom gegevens doorgeeft, in de andere een blad is ([NCCL 2.4: dubbele binaire bomen](https://developer.nvidia.com/blog/massively-scale-deep-learning-training-nccl-2-4/)). Figuur 4 toont beide algoritmen voor vier Sparks.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/allreduce-ring-vs-tree.png' | relative_url }}" alt="All-reduce als ring en als dubbele binaire boom tussen vier Sparks, met de hoeveelheid die elke Spark verstuurt" width="820"/></p>
<sub><i>Figuur 4: All-reduce als ring en als boom tussen vier Sparks, met de hoeveelheid die elke Spark verstuurt als veelvoud van zijn blok.</i></sub>

Een ring doorloopt 2 × (N − 1) stappen achter elkaar. De vaste vertragingen van die stappen tellen op en groeien samen evenredig met het aantal Sparks. Bij een boom zijn er ongeveer log₂ N stappen naar de wortel en evenveel terug. De ring minimaliseert het aantal verzonden bytes en elke Spark verstuurt evenveel ([Patarasuk & Yuan, 2009](https://www.cs.fsu.edu/~xyuan/paper/09jpdc.pdf)). In een boom hangt de hoeveelheid af van de positie. De drukst bezette Sparks versturen meer dan in een ring. Bij kleine overdrachten of veel Sparks wegen de vaste vertragingen zwaar en is een boom doorgaans sneller. Bij grote overdrachten weegt de verzendtijd zwaarder en is een ring doorgaans sneller.

NCCL kiest voor elke afzonderlijke all-reduce een algoritme en een overdrachtsprotocol. Op basis van de overdrachtsgrootte, het aantal Sparks en de gedetecteerde topologie schat NCCL voor elke optie de vaste latentie plus de tijd om de gegevens met de effectieve bandbreedte te versturen. Het kiest de snelste optie volgens dat model ([Understanding NCCL tuning](https://developer.nvidia.com/blog/understanding-nccl-tuning-to-accelerate-gpu-to-gpu-communication), [Demystifying NCCL](https://arxiv.org/abs/2507.04786)). Wanneer het algoritme niet is vastgelegd met `NCCL_ALGO`, kan die keuze tijdens inferentie veranderen met de grootte van de all-reduce. In deze runs was geen algoritme vastgelegd. Voor de prefill-blokken van 50.3 MB gaat de schatting uit van een ring. Kleine decode-aanroepen (Sectie 4.2) kunnen een boom gebruiken. Met `NCCL_DEBUG=INFO` en `NCCL_DEBUG_SUBSYS=TUNING` kunt u de diagnostische uitvoer van NCCL voor de afstemming inschakelen. De verkeerstellers in Sectie 13.2 maken het mogelijk het ringmodel te toetsen aan het totale verkeer.

### 3.5. Wat er verandert met het aantal Sparks

Extra Sparks verdelen het rekenwerk. Bij elke rijparallelle uitvoer berekent iedere Spark echter nog steeds een deelsom voor elke uitvoerwaarde. Zijn blok bevat dus 4,096 × 6,144 waarden (50.3 MB), of het model nu op twee Sparks draait of op zestien. Bij een gelijkmatige verdeling halveert een verdubbeling van de TP-grootte het aantal rekenbewerkingen per Spark voor de verdeelde matrices. De hoeveelheid die elke Spark per all-reduce verstuurt, neemt licht toe en bedraagt 2 × (N − 1) / N keer de blokgrootte.

| TP-grootte | Rekenwerk per Spark | Verstuurd per Spark per all-reduce |
|---|---|---|
| TP2 | 1/2 van het model | 1.0 × 50.3 MB = 50.3 MB |
| TP4 | 1/4 | 1.5 × 50.3 MB = 75.5 MB |
| TP8 | 1/8 | 1.75 × 50.3 MB = 88.1 MB |
| TP16 | 1/16 | 1.875 × 50.3 MB = 94.3 MB |

Van TP8 naar TP16 halveert in dit model dus het verdeelde rekenwerk per Spark. De tijd die elke Spark aan verzenden besteedt, blijft vrijwel gelijk. Daardoor neemt het netwerk een groter deel van elke forward pass in beslag. Sectie 6.3 werkt uit wat dit voor de linksnelheid betekent.

---

## 4. Prefill en decode: twee verschillende belastingen voor het netwerk

De hoeveelheid gegevens per all-reduce hangt af van het aantal tokens dat de engine in één forward pass verwerkt. De voorbeelden hieronder gebruiken de vLLM-instellingen uit Deel II.

### 4.1. Prefill: grote overdrachten op volle linksnelheid

Tijdens prefill kan vLLM per forward pass maximaal 4,096 tokens in één batch verwerken (`--max-num-batched-tokens 4096`). Bij een volle batch telt elke all-reduce de blokken van 50.3 MB uit Sectie 3.2 op en verstuurt elke Spark 88.1 MB.

| Linksnelheid | Tijd om 88.1 MB te versturen |
|---|---|
| 200 Gb/s | **3.5 ms** |
| 100 Gb/s | **7.0 ms** |

Elke overdracht heeft ook een vaste overhead in software, synchronisatie en netwerkhardware. Zelfs een royale 100 µs aan zulke overhead is klein naast deze tijden: op 200 Gb/s verplaatst de link in 100 µs maar 2.5 MB, tegenover de 88.1 MB die verstuurd moeten worden. De duur van een all-reduce tijdens prefill wordt dus vrijwel geheel bepaald door hoe snel de link bytes verplaatst; met andere woorden, de communicatie tijdens prefill is **bandbreedtegebonden**. Tussen de all-reduces berekenen de Sparks het volgende deel van de laag, dus het prefill-verkeer hoort te verschijnen als bursts van enkele milliseconden op of bij de volle linksnelheid, gescheiden door pauzes waarin wordt gerekend. Een gehalveerde linksnelheid verdubbelt de lengte van elke burst en vertraagt het eerste token.

### 4.2. Decode: kleine overdrachten, gedomineerd door vaste vertragingen

Tijdens decode verwerkt elke forward pass alleen het nieuwste token van elk verzoek. Met speculatieve decodering (speculative decoding) via multi-token prediction (MTP), zoals geconfigureerd in Deel II, controleert het model in dezelfde pass ook 4 drafttokens, zodat het per verzoek 5 tokens verwerkt. Elke all-reduce telt dan 5 × 6,144 × 2 bytes = **61 KB** op. Volgens het ringmodel verstuurt elke Spark daarbij ongeveer **108 KB**. Per forward pass, inclusief het verzamelen van de tokenscores van de uitvoerlaag, verstuurt elke Spark ongeveer **18 MB**.

Het versturen van 108 KB duurt 4.3 µs op 200 Gb/s en 8.7 µs op 100 Gb/s. De all-reduce doorloopt echter een reeks stappen, 14 in een ring van acht Sparks en minder in een boom (Sectie 3.4), en elke stap heeft een vaste vertraging in software, synchronisatie en netwerkhardware. RDMA-overdrachten tussen twee systemen duren in de orde van microseconden, zelfs voor kleine hoeveelheden gegevens, dus deze vertragingen tellen op tot meer dan de tijd die aan het versturen van bytes wordt besteed. De communicatie tijdens decode is daarom **latentiegebonden**, en de duur ervan hangt weinig af van de linksnelheid.

De totale hoeveelheid decode-verkeer is ook beperkt. Elke forward pass moet minstens de actieve gewichten van het model uit het geheugen lezen. GLM-5.3 heeft ongeveer 40 miljard actieve parameters per token, grotendeels opgeslagen in NVFP4, het 4-bits floating-pointformaat van NVIDIA, met ongeveer 4.5 bits per gewicht inclusief de schaalfactoren. Dat is ongeveer 2.8 GB per Spark, wat bij 273 GB/s minstens **10 ms** kost om te lezen. Zelfs als elke forward pass op die grens zou draaien, zou het decode-verkeer voor één verzoek op of onder ongeveer **14 Gb/s** blijven, ver onder 100 Gb/s, en een gehalveerde link zou ten hoogste 0.7 ms toevoegen aan elke pass van 10 ms of meer. In de praktijk voegt hij veel minder toe, omdat de overdrachten latentiegebonden zijn.

Het netwerk bepaalt dus hoe snel een prompt wordt gelezen, niet hoe snel het antwoord wordt geschreven. Workloads met lange prompts, zoals retrieval-augmented generation, lange documenten of agents met grote contexten, zijn waar de linksnelheid ertoe doet. Korte chatprompts raken haar nauwelijks, en de decodesnelheid hoort helemaal niet te veranderen.

---

## 5. Het effect van een gehalveerde link schatten

### 5.1. De bovengrens

Als elke overdracht tijdens prefill op de volle linksnelheid loopt en geen enkele overlapt met rekenwerk, dan voegt het verlagen van de linksnelheid van B_old naar B_new precies de extra tijd toe die nodig is om dezelfde bytes te versturen:

> **extra prefill-tijd ≤ prefill-bytes per Spark × (1 / B_new − 1 / B_old)**

Dit is een bovengrens voor de extra overdrachtstijd bij een vast verkeersvolume, dezelfde collectieve algoritmen en scheduling, en dezelfde hoeveelheid werk buiten het netwerk. Overlap met rekenwerk kan een deel van die tijd opvangen. Gebruik het aantal bytes per prompttoken uit Sectie 3.3 en de promptlengte. Druk de hoeveelheid gegevens en beide linksnelheden uit in eenheden die bij elkaar passen. Als de scheduling of de efficiëntie van het protocol verandert, kan de gemeten TTFT buiten deze schatting vallen.

Van 200 naar 100 Gb/s is (1/100 − 1/200) = 1/200, dus de extra tijd is gelijk aan de tijd die het versturen van de prefill-bytes op 200 Gb/s kost. Voor GLM-5.3 op TP8:

> **Extra overdrachtstijd per 1,000 prompttokens ≤ (3.38 MB/token × 1,000 tokens × 8 bits/byte) ÷ 200 Gb/s ≈ 0.135 s.**

### 5.2. De zes testgevallen

| Test | Prompttokens | Prefill-bytes per Spark | Extra prefill-tijd, 200 → 100 Gb/s |
|---|---|---|---|
| P1: prompt van 1K, 1 verzoek | 1,024 | 3.5 GB | ≤ +0.14 s |
| P2: prompt van 8K, 1 verzoek | 8,192 | 27.7 GB | ≤ +1.11 s |
| P3: prompt van 32K, 1 verzoek | 32,768 | 110.6 GB | ≤ +4.43 s |
| P4: 4 prompts van 8K, tegelijk binnenkomend | 32,768 | 110.6 GB | ≤ +4.43 s |
| P5: prompt van 64K, 1 verzoek | 65,536 | 221.3 GB | ≤ +8.85 s |
| P6: 4 prompts van 16K, tegelijk binnenkomend | 65,536 | 221.3 GB | ≤ +8.85 s |

Voor de tests met vier verzoeken zijn de bytes die van alle vier prompts, en is de tijd die tot het laatste van de vier verzoeken zijn eerste token ontvangt.

### 5.3. Van seconden naar een percentage

Als aandeel van de TTFT wordt de grens

> **toename van de TTFT ≤ netwerkaandeel × (B_old / B_new − 1)**, wat voor 200 → 100 Gb/s eenvoudig **≤ netwerkaandeel** is,

waarbij het **netwerkaandeel** de tijd is die nodig is om de prefill-bytes op 200 Gb/s te versturen, gedeeld door de prefill-tijd.

De prefill-tijd zelf is niet betrouwbaar af te leiden uit de architectuur. Een berekening op basis van het aantal rekenkundige bewerkingen en de piekrekenkracht van de GB10 zou er een orde van grootte naast zitten, omdat de werkelijke snelheid afhangt van hoe efficiënt de kernels van de engine de MoE-experts, attention en scheduling afhandelen. Het percentage heeft daarom één gemeten invoer nodig, de TTFT op 200 Gb/s, die Deel II levert.

---

## 6. Wat de vertraging groter of kleiner maakt

Bij halvering van de nominale linksnelheid geeft een groter netwerkaandeel een grotere geschatte procentuele vertraging.

### 6.1. Promptlengte

Elk prompttoken kost dezelfde 3.38 MB, dus de bytes groeien evenredig met de prompt. Het matrixrekenwerk groeit ook evenredig. Attention, dat elk token vergelijkt met de tokens ervoor, groeit sneller dan de prompt in een model waarin elk token naar de hele context kijkt; daar daalt het netwerkaandeel, en daarmee de procentuele vertraging, langzaam bij zeer lange prompts. GLM-5.3 gebruikt DeepSeek Sparse Attention (DSA), waarbij elk token naar een geselecteerde set van ongeveer 2,048 eerdere tokens kijkt, zodat het rekenwerk vrijwel evenredig met de prompt blijft en de **procentuele vertraging bij lange prompts ongeveer constant hoort te blijven**. In seconden blijft de vertraging in beide gevallen met de promptlengte groeien.

Korte prompts zijn anders. Een prompt van 1K tokens past in één kleine prefill-chunk, en elk van zijn all-reduces verstuurt slechts ongeveer 22 MB per Spark, minder dan een milliseconde op 200 Gb/s. Zulke korte overdrachten halen mogelijk niet de volle linksnelheid, en de vaste overhead van elke forward pass weegt zwaarder, zodat de grens het effect kan overschatten.

### 6.2. Meerdere verzoeken tegelijk

Wanneer meerdere prompts tegelijk binnenkomen, verwerkt de engine hun prefill-chunks in dezelfde forward passes. Het aantal bytes per prompttoken blijft gelijk, maar elke prompt heeft een kortere attentioncontext dan één prompt van dezelfde totale lengte. Vollere batches kunnen ook de rekentijd per token verkorten. Communicatie neemt zo een groter deel van de tijd in beslag en de vertraging is groter dan bij één prompt van dezelfde totale lengte. De volgorde waarin de engine de prompts verwerkt en het moment waarop de eerste verzoeken tokens beginnen te genereren, beïnvloeden ook de TTFT per verzoek.

### 6.3. TP-grootte

Ten opzichte van TP8 veranderen de bytes per Spark per token en het rekenwerk per Spark als volgt:

| TP-grootte | Bytes per Spark | Rekenwerk per Spark |
|---|---|---|
| TP2 | 0.57× | 4× |
| TP4 | 0.86× | 2× |
| TP8 | 1× | 1× |
| TP16 | 1.07× | 0.5× |

Het netwerkaandeel, en daarmee de vertraging, groeit snel met de TP-grootte: een lagere linksnelheid is het makkelijkst te accepteren bij kleine TP-groottes en kost meer naarmate een model over meer Sparks wordt verdeeld. Sectie 10 zet hier getallen bij op basis van de gemeten TP8-basislijn.

---

# Deel II: Meting

## 7. Testopzet

### 7.1. Alleen de link veranderen

De vergelijking is alleen bruikbaar als de linksnelheid het enige verschil tussen de twee configuraties is. In beide werden hetzelfde model, dezelfde engine, dezelfde instellingen, dezelfde prompts en hetzelfde testplan gebruikt; alleen het netwerkpad veranderde.

### 7.2. Opstelling

| Onderdeel | Waarde |
|---|---|
| Systemen | 8× NVIDIA DGX Spark (GB10, 128 GB unified memory), driver 580.173.02 |
| Switch | MikroTik CRS804, 400G QSFP-DD-poorten in 2 × 200G-breakout |
| Model | GLM-5.3 NVFP4 (`Inferact/GLM-5.3-NVFP4`): MoE met 753B parameters, ongeveer 40B actief per token; verborgen dimensie 6,144; 78 lagen; DeepSeek Sparse Attention |
| Engine | vLLM `0.1.dev20133+gb5f995e73` (container `vllm-node-b12x`), PyTorch 2.13, NCCL 2.31.2, Ray |
| Parallellisme | TP8: één modelinstantie over alle 8 Sparks |
| Belangrijkste instellingen | prefill-chunks van maximaal 4,096 tokens, FP8-KV-cache, speculatieve decodering met MTP (4 drafttokens; het draftmodel wordt niet over de Sparks verdeeld en voegt dus geen netwerkverkeer toe), CUDA graphs, maximaal 8 gelijktijdige verzoeken |

De hier geteste GLM-5.3-configuratie gebruikt alle 8 Sparks. Door de vele collectieve bewerkingen is dit een geschikte workload om het effect van de linksnelheid te meten.

### 7.3. 100 Gb/s emuleren op de bestaande kabels

Een 100 Gb/s-link kan worden uitgeprobeerd voordat er een 100G-kabel wordt gekocht. NCCL wordt zo geconfigureerd dat het op elke Spark maar een van de twee netwerkinterfaces gebruikt, door het tweede RDMA-apparaat in de omgeving van de inferentie-engine uit te sluiten:

```
NCCL_IB_HCA=^roceP2p1s0f1
```

Zoek met `ibdev2netdev` op elke host de naam van het tweede RDMA-apparaat op en sluit dat apparaat uit. De bekabeling, switchpoorten en overige instellingen blijven gelijk. Als u het model zonder deze instelling opnieuw start, beschikt het weer over 200 Gb/s. De RDMA-tellers (Bijlage A) bevestigden in elke geëmuleerde run dat al het verkeer over de ene overgebleven interface liep.

Zo kan een workload op een bestaand 200 Gb/s-cluster op 100 Gb/s worden getest: laat hem één keer op 200 Gb/s en één keer geëmuleerd draaien, reken het verschil om naar een echte link (Sectie 9), en stap over op 100G-kabels (Sectie 11) als het resultaat aanvaardbaar is. Deel II past dit toe op GLM-5.3 op TP8 met het testplan van Sectie 7.4. De opensourcetool [netinfermon](https://github.com/openzeka/netinfermon) voert zo'n vergelijking uit: hetzelfde testplan tegen de inferentie-engine op beide linksnelheden, met het RDMA-verkeer vastgelegd op dezelfde klok (Bijlage A).

Eén interface draagt wat zijn PCIe Gen5 ×4-link toelaat: 4 lanes × 32 GT/s, door lijncodering (128b/130b) teruggebracht tot 126 Gb/s en door de overhead van PCIe-pakketten en flow control tot ongeveer **111 Gb/s**. Gemeten met `ib_write_bw` draagt één interface **109 Gb/s**. De geëmuleerde link is dus ongeveer 11% sneller dan een echte 100 Gb/s-link, die 98 Gb/s draagt (Sectie 12.3); Sectie 9 corrigeert voor het verschil.

Met B_new = 109 Gb/s in plaats van 100 wordt de grens van Sectie 5.1

> **Extra prefill-tijd ≤ aantal gigabits tijdens prefill per Spark × (1/109 − 1/200)**. Voor GLM-5.3 op TP8 is dit ongeveer **0.11 s per 1,000 prompttokens**.

| Test | Schatting, 200 → 100 Gb/s (Sectie 5.2) | Schatting, 200 → 109 Gb/s (dit experiment) |
|---|---|---|
| P1: 1K | ≤ +0.14 s | ≤ +0.12 s |
| P2: 8K | ≤ +1.11 s | ≤ +0.92 s |
| P3: 32K | ≤ +4.43 s | ≤ +3.69 s |
| P4: 4 × 8K | ≤ +4.43 s | ≤ +3.69 s |
| P5: 64K | ≤ +8.85 s | ≤ +7.39 s |
| P6: 4 × 16K | ≤ +8.85 s | ≤ +7.39 s |

Sectie 9 rekent de gemeten resultaten terug naar een echte 100 Gb/s-kabel, en Sectie 12.3 meet er een.

### 7.4. Testplan

| Test | Verzoeken | Prompt → uitvoertokens | Doel |
|---|---|---|---|
| P1 | 1 | 1,024 → 1,024 | een korte prompt, met kleine overdrachten |
| P2 | 1 | 8,192 → 1,024 | een typische lange prompt |
| P3 | 1 | 32,768 → 1,024 | een lang document |
| P4 | 4, tegelijk binnenkomend | 4 × 8,192 → 1,024 | meerdere verzoeken, dezelfde totale promptgrootte als P3 |
| P5 | 1 | 65,536 → 1,024 | een zeer lange prompt |
| P6 | 4, tegelijk binnenkomend | 4 × 16,384 → 1,024 | meerdere verzoeken, dezelfde totale promptgrootte als P5 |

Elke test bestond uit één opwarmronde die buiten de resultaten bleef, gevolgd door drie meetrondes. De promptlengtes in de tabel zijn streefwaarden. Elk verzoek produceerde precies 1,024 uitvoertokens. Daarmee was de hoeveelheid decode-werk per verzoek gelijk en zijn de decodesnelheden direct vergelijkbaar.

### 7.5. Wat er werd gemeten

- **TTFT (time to first token):** de tijd van het versturen van een verzoek tot het ontvangen van zijn eerste token. Voor P4 en P6 wordt ook de tijd gerapporteerd tot het laatste van de vier verzoeken zijn eerste token ontvangt; die omvat de bytes van alle vier prompts en is de grootheid die de schatting beschrijft.
- **Decodesnelheid:** hoe snel het antwoord stroomt, in tokens per seconde na het eerste token: (uitvoertokens − 1) ÷ (tijd van het laatste token − tijd van het eerste token). Een tokens-per-secondecijfer dat deelt door de hele verzoektijd, inclusief TTFT, wordt niet gebruikt voor vergelijkingen van decode, omdat het bij lange prompts daalt, ook wanneer de decodesnelheid niet verandert.
- **Netwerkverkeer:** bytes en snelheden uit de RDMA-tellers van de ConnectX-7 van één Spark (Bijlage A). Bij een ring-all-reduce verstuurt elke Spark dezelfde hoeveelheid, dus één Spark is representatief voor alle acht.

### 7.6. De runs vergelijkbaar houden

De prompts kwamen uit een vaste verzameling en werden met een vaste random seed aangevuld tot de beoogde lengte. Zo kregen beide configuraties dezelfde prompts. De volgorde van de opvulling verschilde per verzoek om hergebruik van prefixen te beperken. Op alle Sparks waren de voor de test overbodige diensten gestopt. Elke run begon pas nadat de link 10 seconden geen verkeer had gedragen. De verzoeken en verkeersmetingen kregen tijdstempels van dezelfde klok op dezelfde Spark. Zo zijn de tellerstanden te koppelen aan het eerste token van elk verzoek. Bij overlappende verzoeken registreren de tellers het gezamenlijke verkeer.

Alle meetrondes worden gebruikt en gerapporteerd als gemiddelden, met de spreiding over de rondes. De rondes waren consistent: binnen een test varieerden de prefill-tijden met ten hoogste 0.6 s voor afzonderlijke verzoeken en 1.2 s voor vier verzoeken.

---

## 8. Resultaten: 200 Gb/s versus geëmuleerde 100 Gb/s op TP8

### 8.1. Hoeveel van de 200 Gb/s het cluster gebruikt

Figuur 5 toont het verkeer dat één Spark verstuurt tijdens één verzoek van 8K tokens op het 200 Gb/s-cluster. Tijdens prefill wisselen bursts van enkele milliseconden bij vrijwel de volle linksnelheid af met pauzes waarin de Sparks rekenen, zoals Sectie 4.1 beschrijft; in de inzoom van 200 ms is elke burst één all-reduce van de prefill. Na het eerste token is het decode-verkeer laag en gelijkmatig.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-200g-p2-annotated.png' | relative_url }}" alt="Eén verzoek van 8K tokens op 200 Gb/s: prefill-bursts, het eerste token en het decode-verkeer, met een inzoom van 200 ms binnen de prefill" width="820"/></p>
<sub><i>Figuur 5: Eén verzoek van 8K tokens op 200 Gb/s, verkeer verstuurd door één Spark in intervallen van 1 ms; daaronder een venster van 200 ms binnen de prefill.</i></sub>

Gemeten in intervallen van 1 ms bereiken de bursts van afzonderlijke prompts van 8K–64K ongeveer 150–180 Gb/s, en die van vier tegelijk binnenkomende prompts bijna 200 Gb/s. Gemiddeld over een hele prefill van 8K is het verkeer echter 37 Gb/s, omdat de link niets draagt terwijl de Sparks rekenen. Decode komt gemiddeld uit op ongeveer **3 Gb/s** voor één verzoek en ongeveer **6 Gb/s** voor vier, binnen de grenzen die in Sectie 4.2 zijn geschat. Het cluster gebruikt de volle 200 Gb/s, maar telkens slechts enkele milliseconden.

Bij dezelfde prefill van 8K hangt de gemeten piekwaarde af van het middelingsinterval.

| Middelingsinterval | Hoogste waarde |
|---|---|
| 1 ms | 181 Gb/s |
| 5 ms | 96 Gb/s |
| 100 ms | 44 Gb/s |
| 1 s | 40 Gb/s |
| hele prefill (gemiddelde) | 37 Gb/s |

Een switch die gemiddelden per seconde rapporteert, zou ongeveer 40 Gb/s laten zien en een vrijwel ongebruikte link suggereren. De bursts die de TTFT bepalen, zijn alleen zichtbaar met een resolutie van een milliseconde (Bijlage A).

### 8.2. Het verkeer in elke test

Figuren 6–11 tonen het verkeer dat één Spark verstuurt tijdens de drie meetrondes van elke test. Boven staat 200 Gb/s en onder de geëmuleerde 100 Gb/s-link, met dezelfde tijdas. De grijze band geeft de prefill aan en eindigt in elke ronde zodra het laatste verzoek zijn eerste token ontvangt.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p1-1k-200g-vs-100g.png' | relative_url }}" alt="Prompt van 1K tokens: netwerkverkeer op 200 Gb/s en geëmuleerde 100 Gb/s" width="820"/></p>
<sub><i>Figuur 6: P1, prompt van 1K tokens, 1 verzoek.</i></sub>

Bij een prompt van 1K bereiken de prefill-bursts zelfs op het 200 Gb/s-cluster maar ongeveer 100 Gb/s, minder dan wat één interface kan dragen, dus de geëmuleerde link vertraagt ze niet. De TTFT is bij beide linksnelheden gelijk: 0.96 s en 0.97 s.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p2-8k-200g-vs-100g.png' | relative_url }}" alt="Prompt van 8K tokens: netwerkverkeer op 200 Gb/s en geëmuleerde 100 Gb/s" width="820"/></p>
<sub><i>Figuur 7: P2, prompt van 8K tokens, 1 verzoek.</i></sub>

Bij een prompt van 8K loopt de prefill op 200 Gb/s met ongeveer 150–180 Gb/s. Op de geëmuleerde link worden dezelfde bursts op ongeveer 105–109 Gb/s gehouden en duren ze langer, en de TTFT stijgt van 6.36 s naar 7.24 s. Het decode-verkeer ziet er in beide panelen hetzelfde uit.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p3-32k-200g-vs-100g.png' | relative_url }}" alt="Prompt van 32K tokens: netwerkverkeer op 200 Gb/s en geëmuleerde 100 Gb/s" width="820"/></p>
<sub><i>Figuur 8: P3, prompt van 32K tokens, 1 verzoek.</i></sub>

De prompt van 32K toont hetzelfde patroon over een langere prefill, waarbij de TTFT stijgt van 27.0 s naar 30.6 s.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p4-4x8k-200g-vs-100g.png' | relative_url }}" alt="Vier prompts van 8K tokens die tegelijk binnenkomen: netwerkverkeer op 200 Gb/s en geëmuleerde 100 Gb/s" width="820"/></p>
<sub><i>Figuur 9: P4, vier prompts van 8K tokens die tegelijk binnenkomen.</i></sub>

Bij vier gelijktijdige prompts naderen de prefill-bursts op beide interfaces samen 200 Gb/s. In de emulatie ligt de piek rond 109 Gb/s. Tussen de bursts draagt de link minder verkeer. De wachttijd tot het laatste verzoek zijn eerste token ontvangt, neemt toe van 23.0 s tot 26.4 s. Vier verzoeken geven meer decode-verkeer, maar dat blijft ruim onder beide linksnelheden.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p5-64k-200g-vs-100g.png' | relative_url }}" alt="Prompt van 64K tokens: netwerkverkeer op 200 Gb/s en geëmuleerde 100 Gb/s" width="820"/></p>
<sub><i>Figuur 10: P5, prompt van 64K tokens, 1 verzoek.</i></sub>

De prompt van 64K gedraagt zich als de prompt van 32K over twee keer de lengte: bursts van ongeveer 150–180 Gb/s op 200 Gb/s, op 109 Gb/s gehouden op de geëmuleerde link, en een TTFT die stijgt van 55.5 s naar 62.5 s. De drie rondes liggen binnen ongeveer 0.2 s van elkaar.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p6-4x16k-200g-vs-100g.png' | relative_url }}" alt="Vier prompts van 16K tokens die tegelijk binnenkomen: netwerkverkeer op 200 Gb/s en geëmuleerde 100 Gb/s" width="820"/></p>
<sub><i>Figuur 11: P6, vier prompts van 16K tokens die tegelijk binnenkomen.</i></sub>

Bij vier prompts van 16K treden er op de 200 Gb/s-link gedurende ongeveer 46 s prefill-bursts op. Op de geëmuleerde link van 109 Gb/s duurt dat ongeveer 54 s. De engine verwerkt de prompts in paren. Het eerste paar ontvangt zijn eerste tokens na ongeveer 22 s (200 Gb/s) en 27 s (geëmuleerd), het laatste paar na ongeveer 45 s en 54 s. Terwijl het tweede paar nog in prefill zit, genereert het eerste paar al tokens.

### 8.3. Verkeer per prompttoken

Over beide linkinstellingen verstuurde elke Spark tijdens prefill **3.53 tot 3.60 MB per prompttoken**. Dat is ongeveer 4–7% meer dan de 3.38 MB aan nuttige gegevens die Sectie 3.3 voor een ring berekent. De tellers registreren ook protocolverkeer en ander verkeer binnen het prefill-interval. Bij beide snelheden zijn vergelijkbare volumes gemeten, zoals te verwachten bij dezelfde workload.

### 8.4. TTFT

De tabel geeft het gemiddelde over drie rondes, met tussen haakjes het minimum en maximum. Bij P4 en P6 stopt de klok zodra het laatste van de vier verzoeken zijn eerste token ontvangt. De schattingen gebruiken de snelheid van de geëmuleerde link uit Sectie 7.3.

| Test | 200 Gb/s | 100 Gb/s (geëmuleerd, 109 Gb/s) | Toename |
|---|---|---|---|
| P1: 1K | 0.96 s (0.91–0.99) | 0.97 s (0.94–1.00) | **+0.01 s (+1.1%)**, geen meetbaar verschil (schatting: ≤ +0.12 s) |
| P2: 8K | 6.36 s (6.21–6.56) | 7.24 s (7.14–7.45) | **+0.88 s (+13.9%)** (schatting: ≤ +0.92 s) |
| P3: 32K | 27.02 s (26.96–27.12) | 30.57 s (30.40–30.87) | **+3.55 s (+13.1%)** (schatting: ≤ +3.69 s) |
| P4: 4 × 8K, laatste eerste token | 23.00 s (22.61–23.19) | 26.44 s (26.20–26.59) | **+3.44 s (+15.0%)** (schatting: ≤ +3.69 s) |
| P5: 64K | 55.47 s (55.39–55.55) | 62.47 s (62.34–62.56) | **+6.99 s (+12.6%)** (schatting: ≤ +7.39 s) |
| P6: 4 × 16K, laatste eerste token | 45.82 s (45.36–46.52) | 54.26 s (54.08–54.60) | **+8.44 s (+18.4%)** (schatting: ≤ +7.39 s) |

Gemiddeld over de vier verzoeken per ronde nam de TTFT bij P4 toe van 16.49 s tot 20.21 s (**+22.5%**) en bij P6 van 33.96 s tot 40.03 s (**+17.9%**). De gemiddelde procentuele toename per verzoek was bij vier prompts groter dan bij afzonderlijke prompts.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/measured-vs-predicted.png' | relative_url }}" alt="Extra prefill-tijd op 109 Gb/s: schatting tegenover meting, per test" width="820"/></p>
<sub><i>Figuur 12: Extra prefill-tijd wanneer de link van 200 naar 109 Gb/s daalt: schatting (Sectie 7.3) tegenover meting.</i></sub>

Voor afzonderlijke prompts van 8K–64K tokens en voor vier gelijktijdige prompts van 8K week de geschatte extra wachttijd tot het eerste token hooguit circa 7% af van de meting. Voor de schatting waren alleen de architectuur, de prefill-instellingen en de linksnelheden nodig. Bij vier prompts geldt de vergelijking voor het eerste token van het laatste verzoek. Bij de afzonderlijke lange prompts bedroeg de gemeten toename ongeveer **0.11 s per 1,000 prompttokens**.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/ttft-increase-vs-prompt.png' | relative_url }}" alt="Toename van de prefill-tijd tegenover het aantal prompttokens per ronde, gemeten en geschat" width="820"/></p>
<sub><i>Figuur 13: Toename van de prefill-tijd tegenover de promptgrootte, gemeten en geschat.</i></sub>

Bij één prompt blijft de procentuele toename tussen 8K en 64K tokens vrijwel constant (13.9%, 13.1% en 12.6%). Dat past bij de verwachting uit Sectie 6.1 voor een model met sparse attention. De oorzaak van de lichte daling is uit deze metingen niet af te leiden. Bij meerdere gelijktijdige prompts met dezelfde totale lengte ligt het percentage hoger, zoals Sectie 6.2 voorspelt. Het bedraagt 15.0% bij vier prompts van 8K en 18.4% bij vier prompts van 16K.

### 8.5. Decodesnelheid

| Test | 200 Gb/s | 100 Gb/s (geëmuleerd) | Verandering |
|---|---|---|---|
| P1: 1K | 22.4 tokens/s | 22.5 tokens/s | +0.5% |
| P2: 8K | 21.1 tokens/s | 20.6 tokens/s | −2.3% |
| P3: 32K | 18.7 tokens/s | 19.1 tokens/s | +2.0% |
| P4: 4 × 8K | 10.8 tokens/s per verzoek | 11.2 tokens/s per verzoek | +4.3% |
| P5: 64K | 21.1 tokens/s | 21.0 tokens/s | −0.4% |
| P6: 4 × 16K | 10.5 tokens/s per verzoek | 10.2 tokens/s per verzoek | −2.1% |

Halvering van de linksnelheid veranderde in de praktijk niets aan het tempo waarin het antwoord werd gestreamd. Over de zes tests varieerde de gemiddelde decodesnelheid op de geëmuleerde link van 2.3% lager tot 4.3% hoger.

### 8.6. Waar de meting afwijkt van de schatting

**De prompt van 1K.** De schatting staat tot +0.12 s toe, en de meting laat +0.01 s zien. Elke all-reduce van een prompt van 1K verstuurt slechts ongeveer 22 MB per Spark, en de bursts bereiken zelfs op 200 Gb/s maar ongeveer 100 Gb/s (Figuur 6), minder dan wat de geëmuleerde link draagt. Zoals Sectie 6.1 voorziet, overschat de grens het effect voor korte prompts.

**Vier prompts van 16K die tegelijk binnenkomen.** Hier is de gemeten toename ongeveer 1 s groter dan de schatting. De schatting dekt de tijd die aan het versturen van bytes wordt besteed. In deze test verwerkte de engine de prompts in paren en begon hij het eerste paar al te decoderen terwijl het tweede paar nog in prefill was (Sectie 8.2), zodat decodewerk de forward passes van de resterende prefill deelde. Hoe langer die prefill duurt, hoe meer decodewerk erin valt, en de tijd tot het laatste eerste token groeit met meer dan alleen de extra overdrachtstijd. Dit effect van de scheduling van de engine valt buiten de schatting, en het kan de vertraging vergroten wanneer meerdere lange prompts tegelijk binnenkomen.

**Vier prompts van 8K die tegelijk binnenkomen.** De tijd tot het laatste eerste token bleef binnen de schatting, maar de volgorde waarin de engine de vier eerste tokens vrijgaf, verschilde tussen de twee linksnelheden. De TTFT van afzonderlijke verzoeken in zulke tests hangt daarom deels af van de scheduling, niet alleen van de link.

---

## 9. Van de geëmuleerde link naar een echte 100G-kabel

De geëmuleerde link draagt tot 109 Gb/s; een echte 100 Gb/s-link draagt 98 Gb/s (Sectie 12.3). Door de grens op dit verschil toe te passen, volgt het maximum dat een echte kabel aan de gemeten resultaten kan toevoegen:

> **Extra overdrachtstijd (s) ≤ gemeten aantal prefill-bytes × 8 bits/byte × (1/98 − 1/109) / 10⁹**, met linksnelheden in Gb/s.

| Test | Geëmuleerde 100 Gb/s (gemeten) | Echte 100 Gb/s-kabel, ten hoogste |
|---|---|---|
| P1: 1K | +1.1% | +4.2% |
| P2: 8K | +13.9% | +17.6% |
| P3: 32K | +13.1% | +16.7% |
| P4: 4 × 8K, laatste eerste token | +15.0% | +19.1% |
| P5: 64K | +12.6% | +16.1% |
| P6: 4 × 16K, laatste eerste token | +18.4% | +22.6% |

Bij afzonderlijke prompts en bij het eerste token van het laatste verzoek in een batch voegt de omrekening ongeveer 3–4 procentpunt toe. Voor een conservatieve schatting van de gemiddelde TTFT per verzoek rekent u aan elk verzoek de volledige extra overdrachtstijd van de batch toe. Deel die tijd door de gemiddelde TTFT per verzoek bij 200 Gb/s. Als de scheduling vergelijkbaar blijft, komt de totale toename uit op ongeveer +28% voor vier prompts van 8K en +23% voor vier prompts van 16K. Voor één lange prompt geeft de modelarchitectuur bij 98 Gb/s een bovengrens van ongeveer 0.14 s per 1,000 prompttokens. Naar verwachting blijft de decodesnelheid op de echte link gelijk.

---

## 10. Projectie: hoe de vertraging verandert met de TP-grootte

Met de gemeten prefill-tijd voor 8K op TP8 bij 200 Gb/s als uitgangspunt geeft de bovengrens uit Sectie 5 de volgende projectie voor een nominale linksnelheid van 100 Gb/s. Daarbij is aangenomen dat het rekenwerk gelijkmatig over de Sparks wordt verdeeld. Sectie 9 rekent afzonderlijk met de gemeten netto-overdrachtssnelheid.

| TP-grootte | Geprojecteerde toename van de TTFT op 100 Gb/s, prompt van 8K |
|---|---|
| TP2 | ≤ 3% |
| TP4 | ≤ 8% |
| **TP8** | ≤ 17% (gemeten op de geëmuleerde link: 13.9%; echte kabel: ≤ 17.6%) |
| TP16 | ≤ 31% |

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp-projection.png' | relative_url }}" alt="Geprojecteerde TTFT-vertraging bij 100 Gb/s tegenover de TP-grootte" width="820"/></p>
<sub><i>Figuur 14: Geprojecteerde TTFT-vertraging van 100 Gb/s tegenover de TP-grootte (ter illustratie).</i></sub>

Dit is een projectie. GLM-5.3 is niet getest op 2 of 4 Sparks. Met de ingestelde geheugentoewijzing van de engine passen de gewichten niet op vier nodes. Vaste overhead blijft in de berekening buiten beschouwing. De projectie laat de richting en orde van grootte zien. Op TP16 zou de vertraging ongeveer twee keer zo groot zijn als op TP8. Sectie 13.6 vergelijkt de projectie met een meting op TP4. Op 16 Sparks bij 100 Gb/s zouden twee TP8-clusters zich elk als het gemeten cluster moeten gedragen, mits de switch het verkeer van beide tegelijk aankan. Eén TP16-cluster zou de vertraging ongeveer verdubbelen.

---

# Deel III: Echte 100 Gb/s-links

## 11. Echte 100 Gb/s-links opbouwen

Als de workload op de geëmuleerde link aan uw eisen voldoet, kunt u echte 100 Gb/s-links testen. Het experiment met vier Sparks laat zien hoe nauwkeurig dezelfde methode de extra wachttijd tot het eerste token op echte kabels voorspelt.

### 11.1. De kabel en de switchlinks

Een echte 100 Gb/s-link vervangt de 2 × 200G-breakoutkabel door een 4 × 100G-breakoutkabel. Op de MikroTik CRS804 (RouterOS 7.24.4) draagt elke 400G QSFP-DD-aansluiting acht lanes van 50 Gb/s, en de kabel bepaalt hoe die worden verdeeld:

| Kabel | Splitst één 400G-aansluiting in | Lanes per Spark | Snelheid per Spark | Sparks per aansluiting |
|---|---|---|---|---|
| FS QDD-400G-2QPC01, 1 m | 2 links | 4 | 200 Gb/s (`200G-baseCR4`) | 2 |
| FS QDD-400G-4QPC02, 2 m | 4 links | 2 | 100 Gb/s (`100G-baseCR2`) | 4 |

Beide zijn passieve koperen breakoutkabels (DAC), en beide links gebruiken RS-foutcorrectie (forward error correction, FEC91). De switch toont elke aansluiting als acht subinterfaces, één per lane (`qsfp56-dd-3-1` tot `qsfp56-dd-3-8` voor aansluiting 3), en noemt elke link naar de lane waarop hij begint: `-1` en `-5` met de 2-wegkabel, `-1`, `-3`, `-5` en `-7` met de 4-wegkabel. Alleen deze vier ondersteunen de modus `100G-baseCR2` met twee lanes.

Aan de Sparks verandert niets. Hun ConnectX-7-adapters ondersteunen en adverteren `100000baseCR2/Full`, de modus van één tak van de 4-wegkabel, en hun netwerkconfiguratie stelt alleen adressen en de MTU van 9,000 bytes in, zodat ze de snelheid volgen die de switch aanbiedt. Beide netwerkinterfaces van de poort blijven actief en delen de 100 Gb/s van de link, anders dan bij de emulatie van Sectie 7.3, waar een van beide op een 200 Gb/s-link buiten gebruik bleef.

### 11.2. Vier Sparks naar één aansluiting verplaatsen

Een 4-wegkabel verbindt vier Sparks met één aansluiting. In het testcluster zaten de vier Sparks die voor de test waren gekozen op 200 Gb/s verdeeld over drie aansluitingen: twee ervan deelden de kabel in aansluiting 3, en de andere twee deelden elk een kabel in aansluiting 2 en 4 met een Spark buiten de test. Aansluiting 3 werd omgebouwd. De 2-wegkabel ging eruit en de 4-wegkabel erin, en de andere twee Sparks werden alleen aan de kant van de Spark losgekoppeld, zodat hun kabels in aansluiting 2 en 4 bleven zitten en de partner-Sparks op 200 Gb/s bleven bedienen.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/real-100g-cabling.png' | relative_url }}" alt="Voor: vier Sparks op drie 2 × 200G-kabels; na: de vier Sparks op één 4 × 100G-kabel in aansluiting 3" width="820"/></p>
<sub><i>Figuur 15: De bekabeling op 200 Gb/s en op 100 Gb/s. Alleen aansluiting 3 verandert.</i></sub>

| Vraag | Antwoord |
|---|---|
| Moet elke tak van de kabel naar een bepaalde Spark gaan? | Nee. De adressen van de Sparks hangen niet af van de switchpoort. |
| Kan de kabel in een andere aansluiting? | Ja, met de instellingen van Sectie 11.3 toegepast op die aansluiting. |
| Zijn er precies vier Sparks nodig? | Nee. Ongebruikte takken blijven inactief. |
| Kunnen Sparks op 100 Gb/s en op 200 Gb/s samenwerken op één switch? | Ja. Een Spark op 200 Gb/s verstuurde 83.7 Gb/s naar een Spark op 100 Gb/s. |
| Wat moet overeenkomen? | Het kabeltype in een aansluiting en de instellingen van die aansluiting. |

### 11.3. De wijziging, stap voor stap

1. **Controleer of de switch beheerd kan worden.** De managementpoort van de CRS804 moet met het managementnetwerk verbonden zijn; zonder die verbinding blijft de switch verkeer doorsturen, maar kan hij niet worden geconfigureerd.
2. **Maak een back-up van de switchconfiguratie** met `/export terse file=before-100g` en `/system/backup/save name=before-100g`. De export is een leesbare lijst van alle instellingen, die later wordt gebruikt om de wijziging te controleren; de back-up is een volledige image voor noodgevallen.
3. **Stop het model.** Zijn verbindingen tussen de Sparks worden verbroken wanneer er kabels worden verplaatst.
4. **Kabel om.** Trek de 2-wegkabel uit de aansluiting, koppel de andere Sparks van de groep los aan de kant van de Spark, en steek de 4-wegkabel en zijn vier takken in. Elke Spark meldt het onderdeelnummer en de tak van de nieuwe kabel in `ethtool -m`.
5. **Controleer of de switch de kabel ziet.** Als de switch geen module in de aansluiting meldt (`sfp-module-present: no` in `/interface/ethernet/monitor`), zit het brede uiteinde niet volledig vast en moet het opnieuw worden ingestoken tot het vastklikt.
6. **Pas de instellingen van de aansluiting toe** (hier aansluiting 3):
   ```
   /interface ethernet set [find default-name=qsfp56-dd-3-1] speed=100G-baseCR2
   /interface ethernet set [find default-name=qsfp56-dd-3-5] speed=100G-baseCR2
   /interface ethernet set [find default-name=qsfp56-dd-3-3] auto-negotiation=no speed=100G-baseCR2 mtu=9000 l2mtu=9500
   /interface ethernet set [find default-name=qsfp56-dd-3-7] auto-negotiation=no speed=100G-baseCR2 mtu=9000 l2mtu=9500
   /interface ethernet switch qos port set qsfp56-dd-3-1 egress-rate-queue3=100Gbps
   /interface ethernet switch qos port set qsfp56-dd-3-5 egress-rate-queue3=100Gbps
   /interface ethernet switch qos port set qsfp56-dd-3-3 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=100Gbps
   /interface ethernet switch qos port set qsfp56-dd-3-7 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=100Gbps
   ```
   De eerste twee regels zetten de bestaande links om van vier lanes naar twee. De volgende twee schakelen de links in die op 200 Gb/s ongebruikt zijn, met dezelfde vaste snelheid, MTU en L2 MTU als de bestaande links, zodat IP-pakketten van 9,000 bytes doorkomen. De laatste vier geven alle vier links de QoS-instellingen van de 200 Gb/s-links uit de [installatiehandleiding voor een cluster met 8 nodes]({{ '/papers/dgx-spark-8node-cluster-setup/' | relative_url }}), met de snelheid van de RoCE-wachtrij ingesteld op 100 Gbps; zonder deze instellingen zouden de twee nieuwe links RoCE-verkeer anders behandelen dan de oude. De wijziging raakt alleen deze aansluiting en herstart de switch niet.
7. **Start de vier Sparks opnieuw op** (Sectie 11.4).
8. **Verifieer de links** (Sectie 11.5).
9. **Start het model** met zijn ongewijzigde recipe, en controleer aan de hand van de RDMA-tellers (Bijlage A) dat beide netwerkinterfaces van elke Spark verkeer dragen.

Terug naar 200 Gb/s gaat in omgekeerde volgorde: stop het model, plaats de 2-wegkabels terug, pas de omgekeerde instellingen toe, start de Sparks opnieuw op en verifieer.

```
/interface ethernet set [find default-name=qsfp56-dd-3-1] auto-negotiation=no speed=200G-baseCR4 mtu=9000 l2mtu=9500
/interface ethernet set [find default-name=qsfp56-dd-3-5] auto-negotiation=no speed=200G-baseCR4 mtu=9000 l2mtu=9500
/interface ethernet set [find default-name=qsfp56-dd-3-3] auto-negotiation=yes mtu=1500 l2mtu=1584 advertise=10M-baseT-half,10M-baseT-full,100M-baseT-half,100M-baseT-full,1G-baseT-half,1G-baseT-full,1G-baseX,2.5G-baseT,2.5G-baseX,5G-baseT,10G-baseT,10G-baseSR-LR,10G-baseCR,25G-baseSR-LR,25G-baseCR,50G-baseSR2-LR2,50G-baseCR2,50G-baseSR-LR,50G-baseCR,100G-baseSR2-LR2,100G-baseCR2
/interface ethernet set [find default-name=qsfp56-dd-3-7] auto-negotiation=yes mtu=1500 l2mtu=1584 advertise=10M-baseT-half,10M-baseT-full,100M-baseT-half,100M-baseT-full,1G-baseT-half,1G-baseT-full,1G-baseX,2.5G-baseT,2.5G-baseX,5G-baseT,10G-baseT,10G-baseSR-LR,10G-baseCR,25G-baseSR-LR,25G-baseCR,50G-baseSR2-LR2,50G-baseCR2,50G-baseSR-LR,50G-baseCR,100G-baseSR2-LR2,100G-baseCR2
/interface ethernet switch qos port set qsfp56-dd-3-1 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
/interface ethernet switch qos port set qsfp56-dd-3-5 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
/interface ethernet switch qos port set qsfp56-dd-3-3 trust-l3=ignore pfc=disabled
/interface ethernet switch qos port unset qsfp56-dd-3-3 egress-rate-queue3
/interface ethernet switch qos port set qsfp56-dd-3-7 trust-l3=ignore pfc=disabled
/interface ethernet switch qos port unset qsfp56-dd-3-7 egress-rate-queue3
```

Bij de geteste terugzetprocedure zijn ook de geadverteerde linkmodi op `-3` en `-7` hersteld. Na afloop kwam de uitvoer van `/export terse` overeen met de export van vóór de wijziging, afgezien van commentaar en lege regels. U kunt beide procedures op de switch als script opslaan (`/system/script`) en elk in één stap uitvoeren. Zo wijzigt u één aansluiting. Bij het terugzetten van de back-up zou de volledige configuratie worden vervangen en de switch opnieuw opstarten, waardoor alle aangesloten Sparks enkele minuten hun verbinding verliezen. Elke omschakeling vergde ongeveer 15 minuten werk.

Voor acht Sparks op 100 Gb/s komen dezelfde instellingen op twee aansluitingen, elk met een 4-wegkabel, waardoor de andere twee aansluitingen vrij blijven voor nog acht Sparks.

### 11.4. Opnieuw opstarten na het omkabelen

Nadat de 4-wegkabel in de draaiende Sparks was gestoken, meldden alle links 100 Gb/s en vertoonden ze geen fouten, maar elke Spark op de nieuwe kabel verstuurde slechts ongeveer 13.4 Gb/s per interface. Ontvangen verliep normaal.

De limiet was dezelfde met 1, 4 of 8 verbindingen, met of zonder de RoCE-traffic class, naar een Spark op dezelfde aansluiting of op een andere, en met de switchlink vast ingesteld of via auto-negotiation; de switch stuurde in hardware door bij 0–2% CPU-belasting, en op de Sparks was geen snelheidslimiet ingesteld. Op het moment dat de kabel werd ingestoken, logde de kernel van elk van de vier Sparks `mlx5_pcie_event ... Detected insufficient power on the PCIe slot (27W)`, een melding die elke Spark anders alleen bij het opstarten logt. Een openbaar bericht op het NVIDIA-ontwikkelaarsforum beschrijft hetzelfde symptoom na een hot swap op een ander cluster van 8 Sparks met 4 × 100G-breakouts.

Door de vier Sparks opnieuw op te starten, kwam de volle snelheid terug. Op een kabelwissel, in welke richting ook, volgt daarom een herstart van de Sparks op die kabel, of de wissel gebeurt terwijl de Sparks uitgeschakeld zijn. Een link die 100 of 200 Gb/s meldt maar in een bandbreedtetest ongeveer 13 Gb/s draagt, heeft een herstart nodig, geen nieuwe kabel.

### 11.5. De links verifiëren

| Waar | Waar u op let |
|---|---|
| Switch, lijst van interfaces | elke gebruikte link is actief |
| Switch, `/interface/ethernet/monitor` | `100Gbps`, `fec91`, het onderdeelnummer van de kabel |
| Switch, log | `link up (speed 100G, full duplex)` voor elke link |
| Elke Spark, `ethtool` op beide interfaces | `Speed: 100000Mb/s`, `Lanes: 2` |
| Tussen Sparks, `ping -M do -s 8972` | antwoord op beide subnetten bevestigt dat IPv4-pakketten van 9,000 bytes het hele traject doorlopen |
| Spark naar Spark, `ib_write_bw` | ongeveer 98 Gb/s (Sectie 12.3); ongeveer 13 Gb/s betekent dat een herstart nodig is |
| Switch, `/export terse` tegenover de export van stap 2 | alleen verschillen in de omgebouwde aansluiting |

In de test konden alle vier Sparks op beide subnetten onderling IP-pakketten van 9,000 bytes versturen en ontvangen. Er werden geen CRC-, symbool-, FEC- of RoCE-hertransmissiefouten geteld, evenmin als pauseframes of door de switch verworpen pakketten.

---

## 12. Testopzet op TP4

### 12.1. Alleen de link veranderen

Met de geheugentoewijzing van het TP8-recipe passen de gewichten van GLM-5.3 niet op vier Sparks. Daarom hebben we de echte 100 Gb/s-links gemeten met GLM-5.3-Flash op TP4. Net als in Sectie 7.1 was de linksnelheid de onderzochte variabele. Beide configuraties gebruikten dezelfde Sparks, hetzelfde model, dezelfde engine, hetzelfde recipe, dezelfde prompts en hetzelfde testplan. Alleen de kabel en de instellingen van één switchaansluiting veranderden.

### 12.2. Opstelling

| Onderdeel | Waarde |
|---|---|
| Systemen | 4× NVIDIA DGX Spark (GB10, 128 GB unified memory) |
| Switch | MikroTik CRS804: 2 × 200G-breakoutkabels (200 Gb/s); één 4 × 100G-breakoutkabel (100 Gb/s) |
| Model | GLM-5.3-Flash FP8 (`zai-org/GLM-5.3-Flash`): MoE; verborgen dimensie 4,096; 45 lagen |
| Engine | SGLang 0.5.22.dev7, PyTorch 2.13, NCCL 2.30.7 (geïnstalleerd met PyTorch) |
| Parallellisme | TP4: één modelinstantie over de 4 Sparks |
| Belangrijkste instellingen | prefill-chunks van 8,192 tokens, FP8-KV-cache, speculatieve decodering met DFlash (`incoai/GLM-5.3-Flash-DFlash2`, blokken van 8 drafttokens), Triton-attention, maximaal 8 gelijktijdige verzoeken |
| NCCL | beide RDMA-apparaten van elke Spark, RoCE v2, geen algoritme afgedwongen |

Met de ringformule van Sectie 3.3 kost elk prompttoken elke Spark

> (2 × 45 + 1) × 4,096 waarden × 2 bytes × 1.5 = **1.12 MB** aan netwerkverkeer,

een derde van de 3.38 MB van GLM-5.3 op TP8. Het model heeft een kleinere verborgen dimensie en minder lagen. Op TP4 verstuurt elke Spark per all-reduce 1.5 keer zijn blok in plaats van 1.75 keer. Bij een volle chunk telt elke prefill-all-reduce blokken van 8,192 × 4,096 waarden op. Bij 2 bytes per waarde is dat 67 MB. Voor deze blokken gaat de schatting uit van een ring (Sectie 3.4).

### 12.3. De echte 100 Gb/s-link

RDMA-schrijfbandbreedte (`ib_write_bw`, berichten van 64 KB) en latentie (`ib_write_lat`) tussen twee Sparks, na een herstart:

| | 200 Gb/s | Geëmuleerde 100 Gb/s (Sectie 7.3) | Echte 100 Gb/s |
|---|---|---|---|
| Bandbreedte, één interface | 109 Gb/s | 109 Gb/s | 97.8 Gb/s |
| Bandbreedte, beide interfaces | 191–195 Gb/s | (alleen één interface) | 49.0 + 49.0 = 98.0 Gb/s |
| Latentie, 2 bytes | 2.49 µs | | 2.47 µs |
| Latentie, 8 KB | 4.78 µs | | 5.02 µs |

Een echte 100 Gb/s-link draagt ongeveer **98 Gb/s** aan gegevens bij gebruik van één of beide interfaces. Dat is ongeveer 10% minder dan de geëmuleerde link. De latentie voor kleine berichten verandert niet. Bij een bericht van 8 KB is 0.24 µs extra latentie gemeten. Daarin tellen zowel de overdrachtstijd als de vaste vertragingen mee.

Met B_new = 98 Gb/s wordt de grens van Sectie 5.1

> **Extra prefill-tijd ≤ aantal gigabits tijdens prefill per Spark × (1/98 − 1/200)**. Voor GLM-5.3-Flash op TP4 is dit ongeveer **0.047 s per 1,000 prompttokens**.

| Test | Schatting, 200 → 98 Gb/s |
|---|---|
| P1: 1K | ≤ +0.05 s |
| P2: 8K | ≤ +0.38 s |
| P3: 32K | ≤ +1.53 s |
| P4: 4 × 8K | ≤ +1.53 s |
| P5: 64K | ≤ +3.05 s |
| P6: 4 × 16K | ≤ +3.05 s |

### 12.4. Testplan en metingen

Het testplan, de gemeten grootheden en de voorzorgsmaatregelen zijn die van Secties 7.4–7.6: tests P1 tot P6, elk met één opwarmronde en drie meetrondes, 1,024 uitvoertokens, identieke prompts, en de RDMA-tellers van één Spark, elke milliseconde geregistreerd op dezelfde klok als de verzoeken. De runs op 200 Gb/s en op 100 Gb/s vonden op opeenvolgende dagen plaats, elk met een eigen start van het model. Tijdens de run op 200 Gb/s viel bij één Spark de stroom uit in P5; P5 werd gemeten nadat het model opnieuw was gestart, en P6 werd op 200 Gb/s niet gemeten.

Bij beide linksnelheden verdeelde NCCL zijn verkeer gelijkmatig over de twee netwerkinterfaces van elke Spark (49.9% en 50.1%).

---

## 13. Resultaten: 200 Gb/s versus echte 100 Gb/s op TP4

### 13.1. Het verkeer in elke test

Figuren 16–20 tonen het verkeer dat één Spark verstuurt tijdens de drie meetrondes van elke test. Boven staat 200 Gb/s en onder de echte 100 Gb/s-link, met dezelfde tijdas. De grijze band geeft de prefill aan en eindigt in elke ronde zodra het laatste verzoek zijn eerste token ontvangt.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p1-1k-200g-vs-100g.png' | relative_url }}" alt="Prompt van 1K tokens op TP4: netwerkverkeer op 200 Gb/s en echte 100 Gb/s" width="820"/></p>
<sub><i>Figuur 16: P1, prompt van 1K tokens, 1 verzoek.</i></sub>

Bij een prompt van 1K bereiken de prefill-bursts bij beide linksnelheden ongeveer 70–80 Gb/s, minder dan wat de echte 100 Gb/s-link draagt.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p2-8k-200g-vs-100g.png' | relative_url }}" alt="Prompt van 8K tokens op TP4: netwerkverkeer op 200 Gb/s en echte 100 Gb/s" width="820"/></p>
<sub><i>Figuur 17: P2, prompt van 8K tokens, 1 verzoek.</i></sub>

Bij een prompt van 8K komen de prefill-bursts op 200 Gb/s dicht bij 200 Gb/s. Op de echte 100 Gb/s-link worden dezelfde bursts op de limiet van de link gehouden en duren ze langer, en de TTFT stijgt van 3.09 s naar 3.47 s. Het decode-verkeer ziet er in beide panelen hetzelfde uit.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p3-32k-200g-vs-100g.png' | relative_url }}" alt="Prompt van 32K tokens op TP4: netwerkverkeer op 200 Gb/s en echte 100 Gb/s" width="820"/></p>
<sub><i>Figuur 18: P3, prompt van 32K tokens, 1 verzoek.</i></sub>

De prompt van 32K toont hetzelfde patroon over een langere prefill, waarbij de TTFT stijgt van 26.29 s naar 28.17 s. De rondes bij elke linksnelheid liggen binnen 0.2 s van elkaar.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p4-4x8k-200g-vs-100g.png' | relative_url }}" alt="Vier prompts van 8K tokens die tegelijk binnenkomen op TP4: netwerkverkeer op 200 Gb/s en echte 100 Gb/s" width="820"/></p>
<sub><i>Figuur 19: P4, vier prompts van 8K tokens die tegelijk binnenkomen.</i></sub>

Wanneer vier prompts tegelijk binnenkomen, wordt de prefill van de eerste en de derde ronde op 200 Gb/s onderbroken door pauzes waarin de Spark niets verstuurt, en loopt de tijd tot het laatste eerste token per ronde uiteen van 11.8 s tot 20.2 s.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p5-64k-200g-vs-100g.png' | relative_url }}" alt="Prompt van 64K tokens op TP4: netwerkverkeer op 200 Gb/s en echte 100 Gb/s" width="820"/></p>
<sub><i>Figuur 20: P5, prompt van 64K tokens, 1 verzoek.</i></sub>

De prompt van 64K toont de bursts van P3 over een prefill van meer dan 80 s bij beide linksnelheden.

Gemiddeld over 5 ms bereiken de prefill-bursts vanaf P2 151–160 Gb/s op 200 Gb/s en 97.6–98.0 Gb/s op de echte 100 Gb/s-link, de limiet die in Sectie 12.3 is gemeten. Decode komt bij beide linksnelheden gemiddeld uit op 0.9–2.3 Gb/s.

### 13.2. Verkeer per prompttoken

Voor de lange prompts bedroeg het gemeten prefill-verkeer bij beide linksnelheden **1.14 MB per prompttoken** per Spark, 2% meer dan de 1.12 MB uit Sectie 12.2. Over de hele run bij 100 Gb/s verstuurde elk van de vier Sparks 1,294 GB. Het onderlinge verschil bedroeg hooguit 0.02%. Zowel het volume per token als de verdeling over de vier Sparks ondersteunen het ringmodel waarmee het prefill-verkeer is geschat.

### 13.3. TTFT

De tabel geeft het gemiddelde over drie rondes, met tussen haakjes het minimum en maximum. Bij P4 en P6 is dit de tijd tot het laatste van de vier verzoeken zijn eerste token ontvangt.

| Test | 200 Gb/s | Echte 100 Gb/s | Toename |
|---|---|---|---|
| P1: 1K | 0.67 s (0.66–0.67) | 0.74 s (0.70–0.82) | **+0.08 s (+11.4%)** (schatting: ≤ +0.05 s) |
| P2: 8K | 3.09 s (2.97–3.31) | 3.47 s (3.34–3.62) | **+0.39 s (+12.6%)** (schatting: ≤ +0.38 s) |
| P3: 32K | 26.29 s (26.27–26.33) | 28.17 s (28.11–28.28) | **+1.88 s (+7.1%)** (schatting: ≤ +1.53 s) |
| P4: 4 × 8K, laatste eerste token | 16.05 s (11.80–20.22) | 14.62 s (13.27–17.21) | −1.43 s (schatting: ≤ +1.53 s) |
| P5: 64K | 86.00 s (85.55–86.44) | 83.43 s (83.17–83.71) | −2.57 s (schatting: ≤ +3.05 s) |
| P6: 4 × 16K, laatste eerste token | niet gemeten | 44.89 s (41.03–48.77) | |

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp4-measured-vs-estimate.png' | relative_url }}" alt="Extra prefill-tijd op echte 100 Gb/s, TP4: schatting tegenover meting, per test" width="820"/></p>
<sub><i>Figuur 21: Extra prefill-tijd wanneer de link op TP4 van 200 naar echte 100 Gb/s daalt: schatting (Sectie 12.3) tegenover meting.</i></sub>

Voor de afzonderlijke prompt van 8K kwam de op de architectuur gebaseerde schatting op echte links tot op 0.01 s overeen met de gemeten extra wachttijd. Het eerste token kwam 0.39 s later, tegenover een schatting van 0.38 s. De gemeten vertraging bedroeg ongeveer 0.047 s per 1,000 prompttokens. Sectie 13.5 behandelt de andere promptlengtes.

In procenten daalt de toename van 12.6% bij 8K naar 7.1% bij 32K. De bytes groeien evenredig met de prompt, maar in deze configuratie groeit de prefill-tijd sneller (3.1 s bij 8K, 26.3 s bij 32K, 86 s bij 64K), zodat het netwerk een kleiner deel van een langere prefill inneemt, zoals Sectie 6.1 beschrijft voor een model waarvan het rekenwerk sneller groeit dan de prompt.

### 13.4. Decodesnelheid

| Test | 200 Gb/s | Echte 100 Gb/s | Verandering |
|---|---|---|---|
| P1: 1K | 31.5 tokens/s | 33.6 tokens/s | +6.8% |
| P2: 8K | 23.8 tokens/s | 24.6 tokens/s | +3.4% |
| P3: 32K | 15.6 tokens/s | 15.1 tokens/s | −3.3% |
| P4: 4 × 8K | 11.4 tokens/s per verzoek | 11.8 tokens/s per verzoek | +3.7% |
| P5: 64K | 12.0 tokens/s | 12.2 tokens/s | +2.2% |

Op de echte TP4-links bleef de decodesnelheid in de praktijk gelijk, net als bij de TP8-emulatie. De verschillen gingen in beide richtingen. Alleen al tussen de afzonderlijke rondes van P2 op 200 Gb/s varieerde de snelheid van 21.9 tot 25.8 tokens/s.

### 13.5. Waar de meting afwijkt van de schatting

**De prompt van 1K.** Op de echte 100 Gb/s-link duurden twee van de drie rondes 0.70–0.71 s, tegenover 0.66–0.67 s bij 200 Gb/s. Dat verschil viel binnen de schatting. De derde ronde duurde 0.82 s. De bursts bleven bij beide snelheden onder 100 Gb/s (Figuur 16). De TTFT nam bij de afzonderlijke modelstarts licht toe, maar de verkeersmeting geeft geen duidelijke aanwijzing dat de link een knelpunt was.

**De prompt van 32K.** De toename ligt 0.35 s boven de schatting, 1.3% van de TTFT. De rondes bij elke linksnelheid liggen binnen 0.2 s van elkaar, dus dit is een werkelijk verschil tussen de twee runs, die op verschillende dagen met afzonderlijke starts van het model zijn uitgevoerd.

**Vier prompts van 8K die tegelijk binnenkomen.** De rondes op 200 Gb/s varieerden met 8.4 s, tegenover een verwacht effect van ten hoogste 1.5 s. De pauzes in Figuur 19 komen voort uit de manier waarop de engine de vier prompts inplande, die van ronde tot ronde verschilde, zoals in Sectie 8.6. Het resultaat zegt niets over de link.

**De prompt van 64K.** P5 op 200 Gb/s werd gemeten op een andere start van het model dan P1–P4 en kwam 2.6 s trager uit dan op de echte 100 Gb/s-link. Bij prompts van 64K is het netwerk goed voor slechts 3.5% van de prefill-tijd, zodat een klein verschil tussen starts zwaarder weegt dan het effect van de link.

### 13.6. De projectie naar TP-grootte

Sectie 10 projecteerde voor een prompt van 8K ten hoogste 8% op TP4, voor een model met de opbouw van GLM-5.3. GLM-5.3-Flash rekent per token veel minder, zodat het netwerk een groter deel van zijn prefill inneemt: zijn eigen schatting is ten hoogste 12.4%, en gemeten werd 12.6%. De geprojecteerde getallen horen bij GLM-5.3; de methode is overdraagbaar, met de bytes per prompttoken van het betreffende model en één gemeten TTFT op 200 Gb/s.

---

## 14. Is 100 Gb/s redelijk?

Ja. Voor tensorparallelle DGX Spark-clusters tot en met TP8 is 100 Gb/s een praktische keuze als de extra wachttijd tot het eerste token binnen het TTFT-doel van de workload past.

> **Op de geëmuleerde link kwam het eerste token bij één lange prompt ongeveer 13–14% later. Bij vier gelijktijdige lange prompts steeg de gemiddelde TTFT per verzoek met ongeveer 18–23%. Voor een echte link lopen de overeenkomstige schattingen op tot ongeveer 18% en 28%. Bij de korte prompt op TP8 was geen meetbare vertraging te zien. Zodra het antwoord begon, verschenen de tokens bij beide TP-groottes in hetzelfde tempo.**

| Workload | Gemeten (geëmuleerde 100 Gb/s) | Echte 100 Gb/s-kabel, ten hoogste |
|---|---|---|
| Chat met een korte prompt (circa 1K tokens) | geen meetbaar verschil | ongeveer +4% |
| Eén zeer lange prompt: RAG, lange documenten (8K–64K tokens) | TTFT +12.6–13.9% | TTFT +18% (ten hoogste 0.14 s per 1,000 prompttokens) |
| Meerdere zeer lange prompts die tegelijk binnenkomen | TTFT per verzoek +17.9–22.5% | TTFT per verzoek +28% |
| Decodesnelheid, in alle gevallen | ongewijzigd | ongewijzigd |

Voor de kolom met echte links is de gemeten netto-overdrachtssnelheid toegepast op de TP8-workload, uitgaande van vergelijkbare scheduling. Om een andere workload te beoordelen voert u die op de bestaande kabels eerst met beide interfaces en vervolgens met één interface uit (Sectie 7.3). Gebruik voor de omrekening in Sectie 9 het gemeten aantal bytes en de gemeten TTFT.

Met één 4 × 100G-breakoutkabel per vier Sparks kunt u op de twee 400G-poorten van een **CRS812** acht Sparks aansluiten. Bij 200 Gb/s kunt u op dezelfde poorten vier Sparks aansluiten.

Bij TP4 bedroeg de **gemeten toename 0.39 s voor één prompt van 8K**. De schatting op basis van de GLM-5.3-Flash-architectuur en beide linksnelheden was 0.38 s. Vier Sparks delen één breakoutkabel. Alleen de bijbehorende aansluiting op de switch heeft nieuwe instellingen nodig. De netwerkconfiguratie van de Sparks blijft gelijk. Start de Sparks na het omkabelen opnieuw op (Sectie 11).

Op 100 Gb/s verbindt een **CRS804** 16 Sparks. Als twee TP8-clusters gebruikt, krijgt elk de link per Spark die in deze paper is gemeten, zodat de resultaten hierboven voor elk gelden, mits de switch op alle poorten tegelijk verkeer op volle snelheid kan doorsturen (nog te verifiëren). Eén TP16-cluster zou de vertraging ongeveer verdubbelen (Sectie 10) en wordt op 100 Gb/s niet aanbevolen.

200 Gb/s blijft de betere keuze wanneer lange prompts met krappe TTFT-doelen de workload domineren, wanneer veel gebruikers tegelijk lange prompts versturen, of wanneer een model over meer dan acht Sparks moet worden verdeeld.

---

## 15. Beperkingen en aandachtspunten

De metingen betreffen twee modellen en inferentie-engines, elk op één TP-grootte: GLM-5.3 met vLLM op TP8, en GLM-5.3-Flash met SGLang op TP4. Andere modellen, engines en instellingen versturen andere hoeveelheden gegevens en rekenen met andere snelheden; de schattingsmethode is overdraagbaar, maar de getallen moeten opnieuw worden berekend. Op TP8 werd het 100 Gb/s-geval geëmuleerd met één netwerkinterface; Sectie 9 begrenst het verschil met een echte link, die alleen op TP4 is gemeten. De projectie naar TP-grootte in Sectie 10 is een berekening, geen meting.

De 4 × 100G-breakout is geverifieerd op een CRS804 met FS QDD-400G-4QPC02-kabels. Controleer bij een andere switch of kabel of de switch 4 × 100G-breakout op zijn QSFP-DD-poorten ondersteunt in de geplande configuratie en of de ConnectX-7 van de DGX Spark met de gekozen breakoutkabel op 100 Gb/s een link opbouwt. Controleer bij 16 Sparks of de switch op alle poorten tegelijk verkeer op volle snelheid kan doorsturen.

### Veelgemaakte fouten bij het dimensioneren van het clusternetwerk

- ✗ **De verkeerde tellers aflezen:** standaard Linux-tools (`ip -s link`, `nload`, `sar`) zien geen RDMA-verkeer, en tonen tijdens inferentie dus een vrijwel ongebruikte link.
- ✗ **Het linkgebruik beoordelen op gemiddelden:** gemiddelden per seconde of per switchpoort verbergen de bursts van milliseconden die de TTFT bepalen.
- ✗ **Aannemen dat de halve linksnelheid de halve inferentiesnelheid betekent:** alleen de bursts tijdens prefill vertragen; decode niet.
- ✗ **Een model op 100 Gb/s over meer Sparks verdelen dan nodig is:** de vertraging groeit met de TP-grootte.
- ✗ **Draaiende Sparks omkabelen zonder ze opnieuw op te starten:** de links komen op de juiste snelheid op, maar kunnen maar ongeveer 13 Gb/s per interface versturen.

### Checklist voor het plannen van het netwerk van een DGX Spark-cluster

- ☐ Is de TP-grootte per modelinstantie vastgesteld (TP4, TP8, of twee TP8-instanties op 16 Sparks)?
- ☐ Is de verwachte promptlengte bekend (chat, RAG, lange documenten)?
- ☐ Is er een TTFT-doel voor lange prompts?
- ☐ Is de vertraging van 100 Gb/s geschat (bits per prompttoken × prompttokens ÷ 200 Gb/s, Sectie 5)?
- ☐ Is de workload gedraaid op de geëmuleerde 100 Gb/s-link (Sectie 7.3), en is het resultaat, omgerekend naar een echte link (Sectie 9), aanvaardbaar?
- ☐ Zijn de breakoutondersteuning en het opbouwen van de ConnectX-7-link op de geplande snelheid geverifieerd?
- ☐ Zijn de Sparks na het omkabelen opnieuw opgestart, en laat `ib_write_bw` ongeveer 98 Gb/s per 100 Gb/s-link zien?
- ☐ Wordt het RDMA-verkeer bewaakt met RDMA-tellers met een resolutie van een milliseconde?

---

## 16. Conclusie

Op de geteste DGX Sparks is 100 Gb/s praktisch inzetbaar voor tensorparallelle inferentie. Grote collectieve bewerkingen tijdens prefill benutten de link in korte bursts volledig. Bij een lagere linksnelheid komt het eerste token van een lange prompt daardoor later. Zodra het antwoord begint, verschijnen de tokens op TP4 en TP8 in hetzelfde tempo.

Vóór het omkabelen kunt u de extra wachttijd schatten uit het aantal bytes per prompttoken van het model en het verschil tussen de omgekeerde linksnelheden. Voor GLM-5.3 op TP8 geven de nominale snelheden ten hoogste 0.135 s extra overdrachtstijd per 1,000 prompttokens. Op de geëmuleerde link steeg de TTFT voor afzonderlijke prompts van 8K–64K tokens met 12.6–13.9%. Bij vier lange prompts tegelijk steeg de gemiddelde TTFT per verzoek met 17.9–22.5%. Bij 1K viel het verschil binnen de variatie tussen rondes. Op TP4 kwam het eerste token van één prompt van 8K op echte links 0.39 s later, dicht bij de geschatte 0.38 s.

Voor de op TP8 geteste workloads komt de schatting voor een echte link bij vergelijkbare scheduling uit op **maximaal ongeveer 18% extra TTFT voor één lange prompt en 28% meer gemiddelde TTFT per verzoek bij vier gelijktijdige lange prompts**. Test de workload op de bestaande 200 Gb/s-kabels voordat u een breakoutkabel kiest. Bij 100 Gb/s per Spark kunt u acht Sparks aansluiten op de twee 400G-poorten van een CRS812 en zestien op de vier 400G-poorten van een CRS804. Verdeel die zestien over twee TP8-clusters en controleer of de switch het verkeer op alle poorten tegelijk op volle snelheid kan doorsturen. Voor één model op TP16 is de verwachte vertraging groter.

---

## Bijlage A: RDMA-verkeer meten

Omdat RDMA de netwerkstack van het besturingssysteem omzeilt, tellen de gebruikelijke interfacestatistieken het niet mee. Het verkeer in deze studie werd afgelezen uit de RDMA-poorttellers van de ConnectX-7 (`port_xmit_data` en `port_rcv_data` onder `/sys/class/infiniband/`, in eenheden van 4 bytes) voor elk van de twee RDMA-apparaten, en per poort opgeteld. Een controle tegen de eigen bytetellers van de adapter kwam binnen 0.2% overeen.

Een kleine sampler las de tellers elke 1 ms op één Spark af en gaf elke aflezing een eigen tijdstempel, op dezelfde klok die de benchmark voor zijn verzoeken gebruikte. Snelheden over 1 ms en langere intervallen werden berekend door de bytes van elk bemonsteringsinterval te verdelen over de middelingsintervallen die het overlapt. Het verschil tussen twee tellerstanden geeft het aantal bytes in dat bemonsteringsinterval. Het tijdstip van elke aflezing is slechts tot ongeveer ±0.1–0.2 ms bekend, zodat één waarde over 1 ms een onzekerheid van ongeveer ±15–25% heeft; daarom liggen sommige waarden over 1 ms in de figuren iets boven de linksnelheid. Gemiddelden over 5 ms of langer zijn tot op enkele procenten nauwkeurig.

De keuze van het middelingsinterval verandert de hoogste waarde die een meting rapporteert, zoals Sectie 8.1 laat zien: hetzelfde verkeer piekt op 181 Gb/s in intervallen van 1 ms, 96 Gb/s in intervallen van 5 ms en 44 Gb/s in intervallen van 100 ms, terwijl het gemiddelde in alle gevallen gelijk is. Een piekwaarde heeft alleen betekenis samen met haar middelingsinterval.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/window-choice.png' | relative_url }}" alt="Hetzelfde prefill-verkeer van 8K, gemiddeld over intervallen van 1 ms, 5 ms en 100 ms" width="820"/></p>
<sub><i>Figuur A1: Hetzelfde prefill-verkeer, gemiddeld over intervallen van 1 ms, 5 ms en 100 ms.</i></sub>

De meting zelf had geen invloed op het netwerk: bandbreedte- en latentietests (`ib_write_bw`, `ib_write_lat`) met de sampler actief en gestopt lieten dezelfde bandbreedte zien (109.07, 109.08 en 109.15 Gb/s) en ten hoogste ongeveer 1% verschil in latentie. De sampler en de benchmarkdriver gebruikten samen ruim minder dan één van de 20 CPU-cores van de Spark.

De sampler en de testdriver van deze studie zijn beschikbaar als de opensourcetool [netinfermon](https://github.com/openzeka/netinfermon), die de RDMA-tellers van een ConnectX-7-adapter op milliseconderesolutie vastlegt terwijl hij een testplan tegen een inferentie-endpoint uitvoert.

---

## Bijlage B: Reproduceerbaarheid

| Onderdeel | Waarde |
|---|---|
| Testdriver | verstuurt de testverzoeken als streamingverzoeken naar de engine, geeft het eerste en elk volgend token van elk antwoord een tijdstempel, en registreert daarnaast de RDMA-tellers op dezelfde klok (Secties 7.4–7.6, Bijlage A); de verzoeken worden gegenereerd met de open-source [LLM Benchmark Tool](https://github.com/openzeka/llm-benchmark) |
| Model | `Inferact/GLM-5.3-NVFP4` |
| Engine | vLLM `0.1.dev20133+gb5f995e73`, container `vllm-node-b12x`, NCCL 2.31.2 |
| Serve-instellingen | `--tensor-parallel-size 8`, `--max-num-batched-tokens 4096`, `--long-prefill-token-threshold 2048`, `--max-num-seqs 8`, `--max-model-len 262144`, `--kv-cache-dtype fp8`, `--gpu-memory-utilization 0.726`, `--enable-chunked-prefill`, `--enable-prefix-caching`; speculatieve decodering: MTP, 4 tokens, draft niet verdeeld |
| NCCL | `NCCL_IB_HCA` met beide RDMA-apparaten (200 Gb/s); tweede apparaat uitgesloten (emulatie van 100 Gb/s); RoCE v2, GID-index 3 |
| Plan | tests P1–P6 (Sectie 7.4), 1 opwarmronde en 3 meetrondes, vaste seed, 1,024 uitvoertokens |

Voor de TP4-metingen van Deel III:

| Onderdeel | Waarde |
|---|---|
| Model | `zai-org/GLM-5.3-Flash` (FP8), speculatief draftmodel `incoai/GLM-5.3-Flash-DFlash2` |
| Engine | SGLang 0.5.22.dev7 met pull request #36708, PyTorch 2.13, NCCL 2.30.7 (geïnstalleerd met PyTorch) |
| Serve-instellingen | `--tp-size 4`, `--chunked-prefill-size 8192`, `--max-running-requests 8`, `--context-length 262144`, `--kv-cache-dtype fp8_e4m3`, `--mem-fraction-static 0.8`, `--attention-backend triton`; speculatieve decodering: `--speculative-algorithm DFLASH`, 8 drafttokens per blok |
| NCCL | `NCCL_IB_HCA` met beide RDMA-apparaten; RoCE v2, traffic class 106 |
| Netwerk | 200 Gb/s: FS QDD-400G-2QPC01 (2 × 200G); 100 Gb/s: FS QDD-400G-4QPC02 (4 × 100G); MikroTik CRS804, RouterOS 7.24.4 |
| Plan | als hierboven |

---

## Woordenlijst

- **Activaties:** De vectoren die elk token vertegenwoordigen terwijl het door de lagen van het model gaat.
- **All-reduce:** Een collectieve bewerking die gegevens optelt die in delen op elk apparaat staan, en elk apparaat de volledige som geeft.
- **Bandbreedtegebonden / latentiegebonden:** Een overdracht is bandbreedtegebonden wanneer haar duur wordt bepaald door hoe snel de link bytes verplaatst (grote overdrachten), en latentiegebonden wanneer die wordt bepaald door vaste vertragingen (kleine overdrachten).
- **Breakoutkabel:** Een kabel die één snelle switchpoort (bijvoorbeeld 400 Gb/s) splitst in meerdere tragere links (bijvoorbeeld 4 × 100 Gb/s).
- **ConnectX-7:** De netwerkadapter van NVIDIA die in de DGX Spark is ingebouwd.
- **Decode:** De fase die het antwoord genereert, één forward pass tegelijk.
- **FEC (forward error correction):** Redundante gegevens die op een link worden meegestuurd, zodat de ontvanger bitfouten kan corrigeren.
- **Decodesnelheid:** Hoe snel het antwoord stroomt: uitvoertokens per seconde na het eerste token.
- **Emulatie:** Het nabootsen van een situatie (hier een 100 Gb/s-link) op de echte hardware, in tegenstelling tot het modelleren ervan in software.
- **Forward pass:** Eén doorloop van de lagen van het model over de tokens die op dat moment worden verwerkt.
- **Verborgen dimensie:** De lengte van de vector die elk token binnen het model vertegenwoordigt (6,144 voor GLM-5.3).
- **MTP (multi-token prediction):** Een vorm van speculatieve decodering waarbij het model meerdere tokens als draft voorstelt, die vervolgens in één forward pass worden gecontroleerd.
- **NCCL:** De bibliotheek van NVIDIA voor communicatie tussen GPU's, die de inferentie-engine voor all-reduce gebruikt.
- **Netwerkinterface:** Wat het besturingssysteem ziet van een verbinding van een netwerkadapter; hier verschijnt elke ConnectX-7-poort als twee interfaces, één per PCIe-link.
- **Netwerkaandeel van de prefill-tijd:** De tijd die nodig is om de prefill-bytes op 200 Gb/s te versturen, gedeeld door de prefill-tijd.
- **Nominale linksnelheid:** De opgegeven snelheid van een link (hier 200 Gb/s), vóór protocoloverhead.
- **NVFP4:** Het 4-bits floating-pointgetalformaat van NVIDIA, met een schaalfactor die gedeeld wordt door elke groep van 16 waarden.
- **Prefill:** De fase die de prompt verwerkt vóór het eerste uitvoertoken.
- **QoS (quality of service):** Switchinstellingen die verkeer in klassen indelen en elke klasse anders behandelen; hier houden ze RoCE-verkeer in een eigen klasse.
- **Prefill-chunk:** Het deel van een prompt dat in één forward pass wordt verwerkt (maximaal 4,096 tokens in de TP8-configuratie).
- **RDMA:** Remote direct memory access: de netwerkadapter leest en schrijft rechtstreeks in het geheugen van applicaties, zonder dat de gegevens door de netwerkstack van het besturingssysteem gaan.
- **Ring-all-reduce:** Een all-reduce waarbij apparaten segmenten van de gegevens in een ring doorgeven; elk apparaat verstuurt in totaal 2 × (N − 1) / N keer de gegevens.
- **RoCE v2:** RDMA over Converged Ethernet, versie 2: RDMA-pakketten die binnen UDP/IP over standaard-Ethernet worden getransporteerd.
- **Tensorparallellisme (TP):** Het verdelen van de tensorbewerkingen van een model over meerdere apparaten, die na elke stap hun deelresultaten combineren.
- **Boom-all-reduce (tree all-reduce):** Een all-reduce waarbij deelsommen door een boom van apparaten omhoog stromen naar de wortel en het resultaat weer naar beneden stroomt; de vaste vertragingen groeien met log₂ N, maar apparaten versturen verschillende hoeveelheden. NCCL gebruikt twee zulke bomen, die elk de helft van de gegevens dragen (een dubbele binaire boom).
- **TTFT (time to first token):** De tijd van het versturen van een verzoek tot het ontvangen van het eerste token van het antwoord.

---

## Bronnen

**Hardware:**

- NVIDIA DGX Spark — <https://www.nvidia.com/en-us/products/workstations/dgx-spark/>
- Documentatie van de NVIDIA ConnectX-7-adapter — <https://docs.nvidia.com/networking/display/connectx7vpi/introduction>
- MikroTik CRS804 DDQ — <https://mikrotik.com/product/crs804_ddq>
- MikroTik CRS812 DDQ — <https://mikrotik.com/product/crs812_ddq>

**Model en software:**

- GLM-5.3 NVFP4-checkpoint — <https://huggingface.co/Inferact/GLM-5.3-NVFP4>
- GLM-5.3-Flash — <https://huggingface.co/zai-org/GLM-5.3-Flash>
- vLLM — <https://github.com/vllm-project/vllm>
- SGLang — <https://github.com/sgl-project/sglang>
- NCCL — <https://github.com/NVIDIA/nccl>
- perftest (`ib_write_bw`, `ib_write_lat`) — <https://github.com/linux-rdma/perftest>
- LLM Benchmark Tool — <https://github.com/openzeka/llm-benchmark>
- netinfermon (inferentiebenchmark met registratie van RDMA-verkeer) — <https://github.com/openzeka/netinfermon>

**All-reduce-algoritmen:**

- NCCL-omgevingsvariabelen (`NCCL_ALGO`, `NCCL_DEBUG_SUBSYS`) — <https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/env.html>
- Massively Scale Your Deep Learning Training with NCCL 2.4 (dubbele binaire bomen) — <https://developer.nvidia.com/blog/massively-scale-deep-learning-training-nccl-2-4/>
- Understanding NCCL Tuning to Accelerate GPU-to-GPU Communication — <https://developer.nvidia.com/blog/understanding-nccl-tuning-to-accelerate-gpu-to-gpu-communication>
- Demystifying NCCL: An In-depth Analysis of GPU Communication Protocols and Algorithms — <https://arxiv.org/abs/2507.04786>
- Patarasuk & Yuan, Bandwidth Optimal All-reduce Algorithms for Clusters of Workstations — <https://www.cs.fsu.edu/~xyuan/paper/09jpdc.pdf>

**Gerelateerde papers:**

- [Installatiehandleiding voor een DGX Spark AI-cluster met 8 nodes]({{ '/papers/dgx-spark-8node-cluster-setup/' | relative_url }})
- [Schaling van Qwen3.6-27B op een DGX Spark-cluster]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/' | relative_url }})
- [Handleiding voor lokaal LLM-gebruik]({{ '/papers/local-llm-guide/' | relative_url }})

---

### Opmerkingen

- **Schattingen:** Secties 3–6 gebruiken alleen de modelconfiguratie, de instellingen van de engine en de linksnelheid. De grenzen gelden voor de extra overdrachtstijd onder de genoemde aannames. De projectie naar TP-grootte (Sectie 10) gebruikt de gemeten TP8-basislijn en dient ter illustratie.
- **Metingen:** Alle prestatiecijfers zijn gemeten op 8× DGX Spark met GLM-5.3 op TP8, zoals beschreven in Sectie 7, en op 4× DGX Spark met GLM-5.3-Flash op TP4, zoals beschreven in Sectie 12; het netwerkverkeer werd afgelezen uit de RDMA-tellers van de ConnectX-7 van één Spark (Bijlage A).
- **Emulatie:** Op TP8 werd 100 Gb/s op de bestaande kabels geëmuleerd door de communicatie te beperken tot een van de twee netwerkinterfaces van elke ConnectX-7-poort, die tot 109 Gb/s draagt; Sectie 9 rekent de resultaten om naar een echte 100G-kabel, die 98 Gb/s draagt. Op TP4 werden echte 100G-kabels gebruikt.
- **Actualiteit:** Engineversies en instellingen veranderen snel; de resultaten gelden voor de vermelde versies, met de stand van oktober 2026.

---

{% include company/block.html name="cta_logo" %}

**Laten we samen het netwerk van uw DGX Spark-cluster plannen.** Voor een dimensionering die rekening houdt met modelgrootte, tensorparallellisme en linksnelheid, {% include company/block.html name="contact_cta" %}
