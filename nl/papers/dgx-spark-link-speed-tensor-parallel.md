---
title: Netwerklinksnelheid voor tensorparallelle inferentie op DGX Sparks (200G vs 100G)
parent: White Papers
nav_order: 12
lang: nl
page_id: dgx-spark-link-speed-tensor-parallel
date: 2026-10-15
card_tag: "Technische gids"
description: >-
  Hoeveel netwerkbandbreedte een tensorparallel DGX Spark-cluster werkelijk gebruikt, en
  wat het kost om elke DGX Spark op 100G in plaats van 200G te laten draaien: het mechanisme,
  een schatting op basis van de architectuur van het model, en metingen met GLM-5.3 op TP8 en met
  GLM-5.3-Flash op TP4 over echte 100G-links.
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

- **De vraag:** een DGX Spark-cluster dat één model met tensorparallellisme over meerdere systemen bedient, heeft snelle switchpoorten nodig. Met 200 Gb/s per Spark verbindt een MikroTik CRS812 4 tot 6 Sparks; met 100 Gb/s verbindt hij er 8. Een CRS804 verbindt 8 Sparks op 200 Gb/s of 16 op 100 Gb/s. Deze paper onderzoekt wat 100 Gb/s per Spark kost aan inferentiesnelheid.
- **Hoe tensorparallellisme het netwerk gebruikt:** elke Spark bevat een achtste van elke gewichtsmatrix en berekent dus maar een deel van elk resultaat. Twee keer per laag tellen de Sparks hun deelresultaten via het netwerk bij elkaar op, in een bewerking die *all-reduce* heet en die NCCL, de communicatiebibliotheek, voor de grote overdrachten waar het hier om gaat als *ring* uitvoert. Terwijl de prompt wordt verwerkt (*prefill*), zijn de gegevens die in elke all-reduce worden opgeteld groot; terwijl het antwoord wordt gegenereerd (*decode*), zijn ze klein.
- **De schatting:** de overdrachten tijdens prefill zijn groot genoeg om op de volle linksnelheid te lopen, dus een gehalveerde link maakt ze langer en vertraagt het eerste token. Voor GLM-5.3 op TP8 geeft de schatting op basis van de architectuur van het model op 100 Gb/s ten hoogste **0.135 s extra tijd tot het eerste token (TTFT) per 1,000 prompttokens**. De overdrachten tijdens decode zijn te klein om de linksnelheid ertoe te laten doen.
- **Gebruikt het cluster de volle 200 Gb/s? Ja en nee.** Gemeten met een resolutie van een milliseconde bereikt het prefill-verkeer 150–200 Gb/s in bursts van enkele milliseconden. Gemiddeld over één seconde is hetzelfde verkeer ongeveer 40 Gb/s, en decode blijft op enkele Gb/s.
- **Gemeten** met GLM-5.3 op TP8, 200 Gb/s tegenover een geëmuleerde 100 Gb/s-link (die tot 109 Gb/s draagt):
  - **de decodesnelheid verandert niet** (−2.3% tot +4.3%, binnen de variatie tussen testrondes);
  - **de TTFT neemt toe met 12.6–13.9%** voor afzonderlijke prompts van 8K–64K tokens, ongeveer **0.11 s per 1,000 prompttokens**, dicht bij de schatting;
  - wanneer **vier lange prompts tegelijk binnenkomen**, neemt de TTFT van elk verzoek toe met **17.9–22.5%**;
  - **korte prompts worden niet beïnvloed** (+1% bij 1K tokens).
- **100 Gb/s uitproberen voordat u kabels koopt:** door NCCL te beperken tot een van de twee netwerkinterfaces van elke Spark wordt een 100 Gb/s-link geëmuleerd op de bestaande 200 Gb/s-bekabeling. Een workload die zo draait, met het resultaat omgerekend naar een echte link, laat zien wat 100 Gb/s die workload zou kosten voordat er iets aan de hardware verandert.
- **Een echte 100 Gb/s-link**, opgebouwd met een 4 × 100G-breakoutkabel, draagt ongeveer 98 Gb/s en zou er ten hoogste nog 3–4 procentpunt aan toevoegen.
- **Gemeten op echte 100 Gb/s-links** met GLM-5.3-Flash op TP4 op 4 Sparks kwam het eerste token van een prompt van 8K tokens 0.39 s later, tegenover een schatting van ten hoogste 0.38 s, en veranderde de decodesnelheid niet. Om Sparks naar 100 Gb/s over te zetten hoeft er op de Sparks zelf niets te veranderen, maar na het omkabelen moeten ze opnieuw worden opgestart.
- **Conclusie:** 100 Gb/s is redelijk voor tensorparallelle DGX Spark-clusters tot en met TP8. Wie een TP8-cluster van 8 Sparks van 200 Gb/s- naar 100 Gb/s-links overzet, kan verwachten dat het eerste token **bij een zeer lange prompt ten hoogste ongeveer 20% later komt**, en **ten hoogste ongeveer 30% later wanneer meerdere zeer lange prompts tegelijk binnenkomen**. Op TP4 met vier Sparks volgde de op echte links gemeten vertraging dezelfde schatting. Korte tot middellange prompts merken geen verschil, en zodra het antwoord begint, **stroomt het in hetzelfde tempo**. Gebruik op 16 Sparks twee TP8-clusters in plaats van één TP16-cluster: de vertraging neemt toe met de TP-grootte.

---

## 1. Inleiding

Eén DGX Spark heeft 128 GB unified memory. Modellen die groter zijn, worden bediend door ze te verdelen over meerdere Sparks die via hun ConnectX-7-netwerkadapters en een switch met elkaar verbonden zijn. Bij **tensorparallellisme** wordt elke laag van het model over alle Sparks verdeeld, zodat ze voor elk token dat het model verwerkt vele malen gegevens uitwisselen, en elke stap van de inferentie op het netwerk wacht.

Daarmee wordt de switch een ontwerpbeslissing. Door elke Spark op 100 Gb/s in plaats van 200 Gb/s te laten draaien, kan een kleinere switch hetzelfde cluster bedienen, of dezelfde switch twee keer zoveel Sparks. Of dat aanvaardbaar is, hangt af van hoeveel tensorparallelle inferentie vertraagt wanneer de link tussen de Sparks half zo snel is.

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

De CRS804 en CRS812 hebben 400 Gb/s QSFP-DD-poorten. Een breakoutkabel splitst zo'n poort in meerdere tragere links, één per Spark:

| Switch | 400G QSFP-DD-poorten | Sparks op 200 Gb/s (2 × 200G per poort) | Sparks op 100 Gb/s (4 × 100G per poort) |
|---|---|---|---|
| MikroTik CRS812 | 2 (plus 2 × 200G QSFP56) | 4 (6 met de QSFP56-poorten) | **8** |
| MikroTik CRS804 | 4 | **8** | **16** |

Met 100 Gb/s per Spark past een cluster van 8 Sparks op een CRS812, en kan een CRS804 16 Sparks bedienen.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/network-topology.png' | relative_url }}" alt="CRS812 met 8 Sparks op 100 Gb/s, CRS804 met 8 Sparks op 200 Gb/s en met 16 Sparks op 100 Gb/s" width="820"/></p>
<sub><i>Figuur 1: Breakoutopties, één link per DGX Spark.</i></sub>

---

## 3. Hoe tensorparallellisme het netwerk gebruikt

### 3.1. Het model opsplitsen

Bij tensorparallellisme met 8 Sparks (TP8) wordt elke grote gewichtsmatrix van het model in 8 stukken gesneden, en bevat elke Spark één stuk. In de attentionblokken worden de attention-heads over de Sparks verdeeld. In de feed-forward- en Mixture-of-Experts-blokken (MoE) worden ook de matrices van elke expert opgesplitst, zodat elke Spark een deel van elke expert bevat. Elke Spark leest alleen zijn eigen achtste van de gewichten uit zijn eigen geheugen. Daardoor past een model dat groter is dan één Spark, en draait het sneller dan wanneer elke Spark alles zou moeten lezen.

### 3.2. Deelresultaten en de all-reduce

Een gewichtsmatrix op deze manier opsplitsen betekent dat geen enkele Spark een vermenigvuldiging alleen kan afmaken. Elke uitvoerwaarde van een laag is een lange som van producten van gewichten en invoer; met de gewichten in achten verdeeld, berekent elke Spark een achtste van die som. De betrokken waarden zijn de *activaties* van het model: de vectoren die elk token vertegenwoordigen terwijl het door de lagen gaat. GLM-5.3 stelt elk token voor als een vector van 6,144 waarden (zijn *verborgen dimensie*, hidden dimension). Voor een prompt die per 4,096 tokens tegelijk wordt verwerkt, houdt elke Spark uiteindelijk 4,096 × 6,144 deelwaarden over, oftewel 50.3 MB bij 2 bytes per waarde. Het eigenlijke resultaat is de som van de blokken van de acht Sparks, en elke Spark heeft die volledige som nodig voordat het model verder kan.

Die som maken is de taak van een **all-reduce**: *reduce* omdat de blokken worden gecombineerd (hier opgeteld), *all* omdat elke deelnemer het resultaat ontvangt. Een transformerlaag heeft er twee nodig, één na het attentionblok en één na het feed-forward- of MoE-blok, en er is er nog één nodig bij de input-embedding. Elke Spark wacht bij elke all-reduce tot alle acht hun bijdrage hebben geleverd, zodat het netwerk op het pad van elke laag ligt.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp-layer-allreduce.png' | relative_url }}" alt="Eén transformerlaag onder TP8 met zijn twee all-reduces, en de ring van 8 Sparks" width="820"/></p>
<sub><i>Figuur 2: Eén transformerlaag onder tensorparallellisme, en de ring-all-reduce tussen 8 Sparks.</i></sub>

### 3.3. Hoe de ring-all-reduce werkt

De directe aanpak, waarbij elke Spark zijn hele blok naar de andere zeven stuurt, zou elke Spark 7 × 50.3 MB laten versturen, en de belasting zou met elke extra Spark groeien. Voor overdrachten van deze omvang gebruikt NCCL in plaats daarvan een **ring** (Sectie 3.4). De Sparks worden in een cirkel gerangschikt, elk stuurt alleen naar de volgende, en elk blok wordt in evenveel segmenten gesneden als er Sparks zijn. Het werk verloopt dan in twee fasen, voor vier Sparks weergegeven in Figuur 3.

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

De twee maken elk een andere afweging in tijd. Een ring doorloopt 2 × (N − 1) stappen na elkaar, zodat de vaste vertraging van elke stap optelt in verhouding tot het aantal Sparks; een boom heeft maar ongeveer log₂ N stappen omhoog en evenveel omlaag nodig. In bytes is de ring de zuinigste all-reduce die mogelijk is, en verstuurt elke Spark dezelfde hoeveelheid ([Patarasuk & Yuan, 2009](https://www.cs.fsu.edu/~xyuan/paper/09jpdc.pdf)); in een boom versturen Sparks op verschillende posities verschillende hoeveelheden, en de drukste versturen meer dan in een ring. De boom is sneller wanneer vaste vertragingen domineren, bij kleine overdrachten of veel Sparks; de ring is sneller wanneer het verplaatsen van de bytes domineert, bij grote overdrachten.

NCCL maakt deze keuze voor elke afzonderlijke all-reduce. Het schat de tijd van elk algoritme en elk overdrachtsprotocol als een vaste latentie plus de hoeveelheid gegevens gedeeld door een effectieve bandbreedte, op basis van de grootte van de overdracht, het aantal Sparks en de topologie die het detecteert, en voert de snelste uit ([Understanding NCCL tuning](https://developer.nvidia.com/blog/understanding-nccl-tuning-to-accelerate-gpu-to-gpu-communication); [Demystifying NCCL](https://arxiv.org/abs/2507.04786)). Tenzij een algoritme met `NCCL_ALGO` wordt afgedwongen, wat in geen van de runs in deze paper gebeurde, verandert de keuze tijdens de inferentie met de grootte van elke all-reduce. De blokken van 50.3 MB van de prefill zijn groot genoeg dat het verplaatsen van bytes domineert, en NCCL voert ze uit als ring; de kleine all-reduces van decode (Sectie 4.2) lopen mogelijk als boom. De linksnelheid doet er alleen toe voor de eerste soort, zodat de ringformule van Sectie 3.3 precies de overdrachten beschrijft die een tragere link vertraagt. De keuze is af te lezen uit het log van NCCL (`NCCL_DEBUG=INFO` met `NCCL_DEBUG_SUBSYS=TUNING`), of uit het verkeer: bij een ring verstuurt elke Spark hetzelfde aantal bytes (Sectie 13.2).

### 3.5. Wat er verandert met het aantal Sparks

Meer Sparks verdelen het rekenwerk, maar niet de gegevens die opgeteld moeten worden. Alleen de gewichten worden opgesplitst: elke Spark berekent een deel van de som voor elke uitvoerwaarde, dus zijn blok deelwaarden blijft 4,096 × 6,144 waarden (50.3 MB), of het model nu op twee Sparks draait of op zestien. Elke verdubbeling van de TP-grootte halveert het rekenwerk per Spark, terwijl de hoeveelheid die elke Spark per all-reduce verstuurt, 2 × (N − 1) / N keer het blok, licht toeneemt:

| TP-grootte | Rekenwerk per Spark | Verstuurd per Spark per all-reduce |
|---|---|---|
| TP2 | 1/2 van het model | 1.0 × 50.3 MB = 50.3 MB |
| TP4 | 1/4 | 1.5 × 50.3 MB = 75.5 MB |
| TP8 | 1/8 | 1.75 × 50.3 MB = 88.1 MB |
| TP16 | 1/16 | 1.875 × 50.3 MB = 94.3 MB |

Van TP8 naar TP16 gaan halveert dus de tijd die elke Spark aan rekenen besteedt, maar laat de tijd die hij aan versturen besteedt vrijwel gelijk, zodat het netwerk een groter deel van elke forward pass inneemt. Sectie 6.3 werkt uit wat dit betekent voor de linksnelheid.

---

## 4. Prefill en decode: twee verschillende belastingen voor het netwerk

Inferentie verloopt in twee fasen die het netwerk op tegengestelde manieren gebruiken. Hoeveel gegevens elke all-reduce draagt, hangt af van hoeveel tokens één forward pass door het model verwerkt, en dat bepalen de instellingen van de inferentie-engine; de waarden hieronder volgen de vLLM-configuratie die in Deel II is gebruikt.

### 4.1. Prefill: grote overdrachten op volle linksnelheid

Tijdens prefill verwerkt vLLM de prompt in prefill-chunks van maximaal 4,096 tokens per forward pass (`--max-num-batched-tokens 4096`), zodat elke all-reduce het blok van 50.3 MB uit Sectie 3.2 optelt en elke Spark 88.1 MB verstuurt:

| Linksnelheid | Tijd om 88.1 MB te versturen |
|---|---|
| 200 Gb/s | **3.5 ms** |
| 100 Gb/s | **7.0 ms** |

Elke overdracht heeft ook een vaste overhead in software, synchronisatie en netwerkhardware. Zelfs een royale 100 µs aan zulke overhead is klein naast deze tijden: op 200 Gb/s verplaatst de link in 100 µs maar 2.5 MB, tegenover de 88.1 MB die verstuurd moeten worden. De duur van een all-reduce tijdens prefill wordt dus vrijwel geheel bepaald door hoe snel de link bytes verplaatst; met andere woorden, de communicatie tijdens prefill is **bandbreedtegebonden**. Tussen de all-reduces berekenen de Sparks het volgende deel van de laag, dus het prefill-verkeer hoort te verschijnen als bursts van enkele milliseconden op of bij de volle linksnelheid, gescheiden door pauzes waarin wordt gerekend. Een gehalveerde linksnelheid verdubbelt de lengte van elke burst en vertraagt het eerste token.

### 4.2. Decode: kleine overdrachten, gedomineerd door vaste vertragingen

Tijdens decode verwerkt elke forward pass alleen het nieuwste token van elk verzoek. Met speculatieve decodering (speculative decoding) via multi-token prediction (MTP), zoals geconfigureerd in Deel II, controleert het model in dezelfde pass ook 4 drafttokens, zodat het per verzoek 5 tokens verwerkt. Elke all-reduce telt dan 5 × 6,144 × 2 bytes = **61 KB** op, waarvan elke Spark ongeveer **108 KB** verstuurt. Per forward pass, inclusief het verzamelen van de tokenscores van de uitvoerlaag, verstuurt elke Spark ongeveer **18 MB**.

Het versturen van 108 KB duurt 4.3 µs op 200 Gb/s en 8.7 µs op 100 Gb/s. De all-reduce doorloopt echter een reeks stappen, 14 in een ring van acht Sparks en minder in een boom (Sectie 3.4), en elke stap heeft een vaste vertraging in software, synchronisatie en netwerkhardware. RDMA-overdrachten tussen twee systemen duren in de orde van microseconden, zelfs voor kleine hoeveelheden gegevens, dus deze vertragingen tellen op tot meer dan de tijd die aan het versturen van bytes wordt besteed. De communicatie tijdens decode is daarom **latentiegebonden**, en de duur ervan hangt weinig af van de linksnelheid.

De totale hoeveelheid decode-verkeer is ook beperkt. Elke forward pass moet minstens de actieve gewichten van het model uit het geheugen lezen. GLM-5.3 heeft ongeveer 40 miljard actieve parameters per token, grotendeels opgeslagen in NVFP4, het 4-bits floating-pointformaat van NVIDIA, met ongeveer 4.5 bits per gewicht inclusief de schaalfactoren. Dat is ongeveer 2.8 GB per Spark, wat bij 273 GB/s minstens **10 ms** kost om te lezen. Zelfs als elke forward pass op die grens zou draaien, zou het decode-verkeer voor één verzoek op of onder ongeveer **14 Gb/s** blijven, ver onder 100 Gb/s, en een gehalveerde link zou ten hoogste 0.7 ms toevoegen aan elke pass van 10 ms of meer. In de praktijk voegt hij veel minder toe, omdat de overdrachten latentiegebonden zijn.

Het netwerk bepaalt dus hoe snel een prompt wordt gelezen, niet hoe snel het antwoord wordt geschreven. Workloads met lange prompts, zoals retrieval-augmented generation, lange documenten of agents met grote contexten, zijn waar de linksnelheid ertoe doet. Korte chatprompts raken haar nauwelijks, en de decodesnelheid hoort helemaal niet te veranderen.

---

## 5. Het effect van een gehalveerde link schatten

### 5.1. De bovengrens

Als elke overdracht tijdens prefill op de volle linksnelheid loopt en geen enkele overlapt met rekenwerk, dan voegt het verlagen van de linksnelheid van B_old naar B_new precies de extra tijd toe die nodig is om dezelfde bytes te versturen:

> **extra prefill-tijd ≤ prefill-bytes per Spark × (1 / B_new − 1 / B_old)**

Dit is een bovengrens: overdrachten die met rekenwerk overlappen of nooit de volle snelheid halen, voegen minder toe. Er zijn alleen de bytes per prompttoken uit Sectie 3.3 en de promptlengte voor nodig, en niets over hoe snel de Sparks rekenen.

Van 200 naar 100 Gb/s is (1/100 − 1/200) = 1/200, dus de extra tijd is gelijk aan de tijd die het versturen van de prefill-bytes op 200 Gb/s kost. Voor GLM-5.3 op TP8:

> **extra TTFT ≤ 3.38 MB × 8 bits ÷ 200 Gb/s = 0.135 s per 1,000 prompttokens**

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

Omdat de vertraging ten hoogste het netwerkaandeel van de prefill-tijd is, vergroot alles wat dat aandeel vergroot ook de vertraging.

### 6.1. Promptlengte

Elk prompttoken kost dezelfde 3.38 MB, dus de bytes groeien evenredig met de prompt. Het matrixrekenwerk groeit ook evenredig. Attention, dat elk token vergelijkt met de tokens ervoor, groeit sneller dan de prompt in een model waarin elk token naar de hele context kijkt; daar daalt het netwerkaandeel, en daarmee de procentuele vertraging, langzaam bij zeer lange prompts. GLM-5.3 gebruikt DeepSeek Sparse Attention (DSA), waarbij elk token naar een geselecteerde set van ongeveer 2,048 eerdere tokens kijkt, zodat het rekenwerk vrijwel evenredig met de prompt blijft en de **procentuele vertraging bij lange prompts ongeveer constant hoort te blijven**. In seconden blijft de vertraging in beide gevallen met de promptlengte groeien.

Korte prompts zijn anders. Een prompt van 1K tokens past in één kleine prefill-chunk, en elk van zijn all-reduces verstuurt slechts ongeveer 22 MB per Spark, minder dan een milliseconde op 200 Gb/s. Zulke korte overdrachten halen mogelijk niet de volle linksnelheid, en de vaste overhead van elke forward pass weegt zwaarder, zodat de grens het effect kan overschatten.

### 6.2. Meerdere verzoeken tegelijk

Wanneer meerdere prompts tegelijk binnenkomen, delen hun prefill-chunks de forward passes. De bytes per prompttoken blijven gelijk, maar het rekenwerk per token daalt, omdat elke prompt over een kortere context attention berekent en het werk in vollere batches verloopt. Er gaat meer tijd naar communicatie, dus de vertraging is groter dan bij één prompt met dezelfde totale lengte. De volgorde waarin de engine de prompts verwerkt, en het moment waarop de eerste ervan beginnen met genereren, beïnvloeden ook de eigen TTFT van elk verzoek.

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

GLM-5.3 is een groot MoE-model dat alle 8 Sparks nodig heeft, en dat is precies het geval waarin het clusternetwerk het meest uitmaakt.

### 7.3. 100 Gb/s emuleren op de bestaande kabels

Een 100 Gb/s-link kan worden uitgeprobeerd voordat er een 100G-kabel wordt gekocht. NCCL wordt zo geconfigureerd dat het op elke Spark maar een van de twee netwerkinterfaces gebruikt, door het tweede RDMA-apparaat in de omgeving van de inferentie-engine uit te sluiten:

```
NCCL_IB_HCA=^roceP2p1s0f1
```

(`ibdev2netdev` toont de namen van de RDMA-apparaten.) Er verandert niets fysiek, dus de kabels, switchpoorten en alle andere instellingen blijven gelijk, en het model opnieuw starten zonder deze instelling herstelt 200 Gb/s. De RDMA-tellers (Bijlage A) bevestigen dat al het verkeer over de ene overgebleven interface gaat; in elke geëmuleerde run van deze paper was dat zo.

Zo kan een workload op een bestaand 200 Gb/s-cluster op 100 Gb/s worden getest: laat hem één keer op 200 Gb/s en één keer geëmuleerd draaien, reken het verschil om naar een echte link (Sectie 9), en stap over op 100G-kabels (Sectie 11) als het resultaat aanvaardbaar is. Deel II past dit toe op GLM-5.3 op TP8 met het testplan van Sectie 7.4.

Eén interface draagt wat zijn PCIe Gen5 ×4-link toelaat: 4 lanes × 32 GT/s, door lijncodering (128b/130b) teruggebracht tot 126 Gb/s en door de overhead van PCIe-pakketten en flow control tot ongeveer **111 Gb/s**. Gemeten met `ib_write_bw` draagt één interface **109 Gb/s**. De geëmuleerde link is dus ongeveer 11% sneller dan een echte 100 Gb/s-link, die 98 Gb/s draagt (Sectie 12.3); Sectie 9 corrigeert voor het verschil.

Met B_new = 109 Gb/s in plaats van 100 wordt de grens van Sectie 5.1

> **extra prefill-tijd ≤ prefill-bytes × (1/109 − 1/200)**, ongeveer **0.11 s per 1,000 prompttokens** voor GLM-5.3 op TP8

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

Elke test liep één opwarmronde, die niet meetelt, en drie meetrondes. De uitvoer lag vast op precies 1,024 tokens, zodat elk verzoek evenveel decodewerk deed en de decodesnelheden direct vergelijkbaar zijn.

### 7.5. Wat er werd gemeten

- **TTFT (time to first token):** de tijd van het versturen van een verzoek tot het ontvangen van zijn eerste token. Voor P4 en P6 wordt ook de tijd gerapporteerd tot het laatste van de vier verzoeken zijn eerste token ontvangt; die omvat de bytes van alle vier prompts en is de grootheid die de schatting beschrijft.
- **Decodesnelheid:** hoe snel het antwoord stroomt, in tokens per seconde na het eerste token: (uitvoertokens − 1) ÷ (tijd van het laatste token − tijd van het eerste token). Een tokens-per-secondecijfer dat deelt door de hele verzoektijd, inclusief TTFT, wordt niet gebruikt voor vergelijkingen van decode, omdat het bij lange prompts daalt, ook wanneer de decodesnelheid niet verandert.
- **Netwerkverkeer:** bytes en snelheden uit de RDMA-tellers van de ConnectX-7 van één Spark (Bijlage A). Bij een ring-all-reduce verstuurt elke Spark dezelfde hoeveelheid, dus één Spark is representatief voor alle acht.

### 7.6. De runs vergelijkbaar houden

De prompts kwamen uit een vaste promptset en werden met een vaste random seed aangevuld tot de doellengte, zodat beide configuraties identieke prompts kregen. De aanvulling van elk verzoek was anders geordend, zodat de engine geen werk kon hergebruiken dat van een eerder verzoek in de cache stond. Diensten die niet voor de test nodig waren, werden op alle Sparks gestopt, en elke run begon pas nadat de link 10 seconden geen verkeer had gedragen. Verzoeken en verkeersmetingen kregen hun tijdstempel op dezelfde Spark en dezelfde klok, zodat het verkeer van de prefill en de decode van elk verzoek exact te scheiden is.

Alle meetrondes worden gebruikt en gerapporteerd als gemiddelden, met de spreiding over de rondes. De rondes waren consistent: binnen een test varieerden de prefill-tijden met ten hoogste 0.6 s voor afzonderlijke verzoeken en 1.2 s voor vier verzoeken.

---

## 8. Resultaten: 200 Gb/s versus geëmuleerde 100 Gb/s op TP8

### 8.1. Hoeveel van de 200 Gb/s het cluster gebruikt

Figuur 5 toont het verkeer dat één Spark verstuurt tijdens één verzoek van 8K tokens op het 200 Gb/s-cluster. Tijdens prefill wisselen bursts van enkele milliseconden bij de volle linksnelheid af met pauzes waarin de Sparks rekenen, zoals Sectie 4.1 beschrijft; in de inzoom van 200 ms is elke burst één all-reduce van de prefill. Na het eerste token is het decode-verkeer laag en gelijkmatig.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-200g-p2-annotated.png' | relative_url }}" alt="Eén verzoek van 8K tokens op 200 Gb/s: prefill-bursts, het eerste token en het decode-verkeer, met een inzoom van 200 ms binnen de prefill" width="820"/></p>
<sub><i>Figuur 5: Eén verzoek van 8K tokens op 200 Gb/s, verkeer verstuurd door één Spark in intervallen van 1 ms; daaronder een venster van 200 ms binnen de prefill.</i></sub>

Gemeten in intervallen van 1 ms bereiken de bursts van afzonderlijke prompts van 8K–64K ongeveer 150–180 Gb/s, en die van vier tegelijk binnenkomende prompts bijna 200 Gb/s. Gemiddeld over een hele prefill van 8K is het verkeer echter 37 Gb/s, omdat de link niets draagt terwijl de Sparks rekenen. Decode komt gemiddeld uit op ongeveer **3 Gb/s** voor één verzoek en ongeveer **6 Gb/s** voor vier, binnen de grenzen die in Sectie 4.2 zijn geschat. Het cluster gebruikt de volle 200 Gb/s, maar telkens slechts enkele milliseconden.

Het middelingsinterval bepaalt welk van deze twee beelden een meting laat zien. Dezelfde prefill van 8K geeft deze hoogste waarden:

| Middelingsinterval | Hoogste waarde |
|---|---|
| 1 ms | 181 Gb/s |
| 5 ms | 96 Gb/s |
| 100 ms | 44 Gb/s |
| 1 s | 40 Gb/s |
| hele prefill (gemiddelde) | 37 Gb/s |

Een switch die gemiddelden per seconde rapporteert, zou ongeveer 40 Gb/s laten zien en een vrijwel ongebruikte link suggereren. De bursts die de TTFT bepalen, zijn alleen zichtbaar met een resolutie van een milliseconde (Bijlage A).

### 8.2. Het verkeer in elke test

Figuren 6–11 tonen het verkeer dat één Spark verstuurt tijdens de drie meetrondes van elke test, met 200 Gb/s bovenaan en de geëmuleerde 100 Gb/s eronder, op dezelfde tijdas. De grijze band is de prefill, die eindigt bij het eerste token.

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

Wanneer vier prompts tegelijk binnenkomen, houdt de prefill de 200 Gb/s-link bijna volledig bezet, terwijl de geëmuleerde link de hele tijd op 109 Gb/s blijft. De tijd tot het laatste eerste token stijgt van 23.0 s naar 26.4 s. Het decode-verkeer is met vier verzoeken hoger, maar nog steeds ver onder beide linksnelheden.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p5-64k-200g-vs-100g.png' | relative_url }}" alt="Prompt van 64K tokens: netwerkverkeer op 200 Gb/s en geëmuleerde 100 Gb/s" width="820"/></p>
<sub><i>Figuur 10: P5, prompt van 64K tokens, 1 verzoek.</i></sub>

De prompt van 64K gedraagt zich als de prompt van 32K over twee keer de lengte: bursts van ongeveer 150–180 Gb/s op 200 Gb/s, op 109 Gb/s gehouden op de geëmuleerde link, en een TTFT die stijgt van 55.5 s naar 62.5 s. De drie rondes liggen binnen 0.2 s van elkaar.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p6-4x16k-200g-vs-100g.png' | relative_url }}" alt="Vier prompts van 16K tokens die tegelijk binnenkomen: netwerkverkeer op 200 Gb/s en geëmuleerde 100 Gb/s" width="820"/></p>
<sub><i>Figuur 11: P6, vier prompts van 16K tokens die tegelijk binnenkomen.</i></sub>

Met vier prompts van 16K houdt de prefill de 200 Gb/s-link ongeveer 46 s bijna volledig bezet, tegenover ongeveer 54 s op 109 Gb/s op de geëmuleerde link. De engine verwerkt de vier prompts in paren: de eerste twee ontvangen hun eerste tokens na ongeveer 22 s (200 Gb/s) en 27 s (geëmuleerd), de laatste twee na ongeveer 45 s en 54 s. Terwijl het tweede paar nog in prefill is, is het eerste paar al aan het decoderen.

### 8.3. Verkeer per prompttoken

Het gemeten prefill-verkeer was **3.54–3.60 MB per prompttoken** per Spark, 5–7% meer dan de 3.38 MB van Sectie 3.3. Het verschil bestaat uit de headers van de netwerkpakketten en een kleine hoeveelheid verkeer per verzoek. De bytes waren bij beide linksnelheden gelijk, wat bevestigt dat alleen de linksnelheid veranderde.

### 8.4. TTFT

Gemiddelden van drie rondes, met de spreiding over de rondes tussen haakjes; voor P4 en P6 de tijd tot het laatste van de vier verzoeken zijn eerste token ontvangt. De schatting voor de geëmuleerde link (Sectie 7.3) staat ter vergelijking vermeld.

| Test | 200 Gb/s | 100 Gb/s (geëmuleerd, 109 Gb/s) | Toename |
|---|---|---|---|
| P1: 1K | 0.96 s (0.91–0.99) | 0.97 s (0.94–1.00) | **+0.01 s (+1.1%)**, geen meetbaar verschil (schatting: ≤ +0.12 s) |
| P2: 8K | 6.36 s (6.21–6.56) | 7.24 s (7.14–7.45) | **+0.88 s (+13.9%)** (schatting: ≤ +0.92 s) |
| P3: 32K | 27.02 s (26.96–27.12) | 30.57 s (30.40–30.87) | **+3.55 s (+13.1%)** (schatting: ≤ +3.69 s) |
| P4: 4 × 8K, laatste eerste token | 23.00 s (22.61–23.19) | 26.44 s (26.20–26.59) | **+3.44 s (+15.0%)** (schatting: ≤ +3.69 s) |
| P5: 64K | 55.47 s (55.39–55.55) | 62.47 s (62.34–62.56) | **+6.99 s (+12.6%)** (schatting: ≤ +7.39 s) |
| P6: 4 × 16K, laatste eerste token | 45.82 s (45.36–46.52) | 54.26 s (54.08–54.60) | **+8.44 s (+18.4%)** (schatting: ≤ +7.39 s) |

Gemiddeld over de vier verzoeken van elke ronde steeg de TTFT van 16.49 s naar 20.21 s in P4 (**+22.5%**) en van 33.96 s naar 40.03 s in P6 (**+17.9%**). Dit zijn de grootste toenames die in een test zijn gemeten.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/measured-vs-predicted.png' | relative_url }}" alt="Extra prefill-tijd op 109 Gb/s: schatting tegenover meting, per test" width="820"/></p>
<sub><i>Figuur 12: Extra prefill-tijd wanneer de link van 200 naar 109 Gb/s daalt: schatting (Sectie 7.3) tegenover meting.</i></sub>

Voor afzonderlijke prompts van 8K–64K tokens en voor vier tegelijk binnenkomende prompts van 8K kwam de gemeten toename tot binnen enkele procenten van de schatting, iets eronder, zoals van een bovengrens te verwachten is: een klein deel van de overdrachten overlapt met rekenwerk. De schatting op basis van de architectuur van het model, de prefill-chunkgrootte van de engine en de linksnelheid voorspelt het effect van een tragere link dus goed, zonder enige meting van het rekenwerk. In seconden is de toename ongeveer **0.11 s per 1,000 prompttokens**.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/ttft-increase-vs-prompt.png' | relative_url }}" alt="Toename van de prefill-tijd tegenover het aantal prompttokens per ronde, gemeten en geschat" width="820"/></p>
<sub><i>Figuur 13: Toename van de prefill-tijd tegenover de promptgrootte, gemeten en geschat.</i></sub>

Voor één prompt blijft het percentage van 8K tot 64K tokens vrijwel constant (13.9%, 13.1% en 12.6%), zoals Sectie 6.1 verwacht voor een model met sparse attention; de lichte daling is het deel van het attentionwerk dat nog steeds sneller groeit dan de bytes. Wanneer meerdere prompts tegelijk binnenkomen, is het percentage bij dezelfde totale promptgrootte hoger, 15.0% voor vier prompts van 8K en 18.4% voor vier prompts van 16K, zoals Sectie 6.2 verwacht.

### 8.5. Decodesnelheid

| Test | 200 Gb/s | 100 Gb/s (geëmuleerd) | Verandering |
|---|---|---|---|
| P1: 1K | 22.4 tokens/s | 22.5 tokens/s | +0.5% |
| P2: 8K | 21.1 tokens/s | 20.6 tokens/s | −2.3% |
| P3: 32K | 18.7 tokens/s | 19.1 tokens/s | +2.0% |
| P4: 4 × 8K | 10.8 tokens/s per verzoek | 11.2 tokens/s per verzoek | +4.3% |
| P5: 64K | 21.1 tokens/s | 21.0 tokens/s | −0.4% |
| P6: 4 × 16K | 10.5 tokens/s per verzoek | 10.2 tokens/s per verzoek | −2.1% |

De veranderingen wijzen in beide richtingen en blijven binnen de variatie tussen rondes: de decodesnelheid hangt niet af van de linksnelheid, zoals Sectie 4.2 verwacht.

### 8.6. Waar de meting afwijkt van de schatting

**De prompt van 1K.** De schatting staat tot +0.12 s toe, en de meting laat +0.01 s zien. Elke all-reduce van een prompt van 1K verstuurt slechts ongeveer 22 MB per Spark, en de bursts bereiken zelfs op 200 Gb/s maar ongeveer 100 Gb/s (Figuur 6), minder dan wat de geëmuleerde link draagt. Zoals Sectie 6.1 voorziet, overschat de grens het effect voor korte prompts.

**Vier prompts van 16K die tegelijk binnenkomen.** Hier is de gemeten toename ongeveer 1 s groter dan de schatting. De schatting dekt de tijd die aan het versturen van bytes wordt besteed. In deze test verwerkte de engine de prompts in paren en begon hij het eerste paar al te decoderen terwijl het tweede paar nog in prefill was (Sectie 8.2), zodat decodewerk de forward passes van de resterende prefill deelde. Hoe langer die prefill duurt, hoe meer decodewerk erin valt, en de tijd tot het laatste eerste token groeit met meer dan alleen de extra overdrachtstijd. Dit effect van de scheduling van de engine valt buiten de schatting, en het kan de vertraging vergroten wanneer meerdere lange prompts tegelijk binnenkomen.

**Vier prompts van 8K die tegelijk binnenkomen.** De tijd tot het laatste eerste token bleef binnen de schatting, maar de volgorde waarin de engine de vier eerste tokens vrijgaf, verschilde tussen de twee linksnelheden. De TTFT van afzonderlijke verzoeken in zulke tests hangt daarom deels af van de scheduling, niet alleen van de link.

---

## 9. Van de geëmuleerde link naar een echte 100G-kabel

De geëmuleerde link draagt tot 109 Gb/s; een echte 100 Gb/s-link draagt 98 Gb/s (Sectie 12.3). Door de grens op dit verschil toe te passen, volgt het maximum dat een echte kabel aan de gemeten resultaten kan toevoegen:

> **aanvullende prefill-tijd ≤ gemeten prefill-bytes × (1/98 − 1/109)**

| Test | Geëmuleerde 100 Gb/s (gemeten) | Echte 100 Gb/s-kabel, ten hoogste |
|---|---|---|
| P1: 1K | +1.1% | +4.2% |
| P2: 8K | +13.9% | +17.6% |
| P3: 32K | +13.1% | +16.7% |
| P4: 4 × 8K, laatste eerste token | +15.0% | +19.1% |
| P5: 64K | +12.6% | +16.1% |
| P6: 4 × 16K, laatste eerste token | +18.4% | +22.6% |

Een echte 100 Gb/s-kabel zou dus ten hoogste 3–4 procentpunt slechter zijn dan de gemeten resultaten, en de decodesnelheid zou nog steeds onaangetast blijven. In seconden geeft de grens van Sectie 5.1 met 98 Gb/s ten hoogste 0.14 s per 1,000 prompttokens. Dezelfde omrekening geldt voor elke workload die op de geëmuleerde link wordt uitgeprobeerd: de gemeten prefill-bytes × (1/98 − 1/109) zijn het maximum dat een echte kabel toevoegt.

---

## 10. Projectie: hoe de vertraging verandert met de TP-grootte

Met de gemeten prefill van 8K op TP8 en 200 Gb/s als basislijn, en in de veronderstelling dat het rekenwerk gelijk over de Sparks wordt verdeeld, projecteert de grens van Sectie 5 het volgende voor een echte 100 Gb/s-link:

| TP-grootte | Geprojecteerde toename van de TTFT op 100 Gb/s, prompt van 8K |
|---|---|
| TP2 | ≤ 3% |
| TP4 | ≤ 8% |
| **TP8** | ≤ 17% (gemeten op de geëmuleerde link: 13.9%; echte kabel: ≤ 17.6%) |
| TP16 | ≤ 31% |

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp-projection.png' | relative_url }}" alt="Geprojecteerde TTFT-vertraging bij 100 Gb/s tegenover de TP-grootte" width="820"/></p>
<sub><i>Figuur 14: Geprojecteerde TTFT-vertraging van 100 Gb/s tegenover de TP-grootte (ter illustratie).</i></sub>

Dit is een projectie, geen meting: GLM-5.3 past niet op 2 of 4 Sparks, en vaste overhead wordt buiten beschouwing gelaten. Ze laat de richting en de globale omvang van het effect zien: bij TP16 zou de vertraging ongeveer twee keer zo groot zijn als bij TP8. Sectie 13.6 vergelijkt de projectie met een meting op TP4. Op 16 Sparks met 100 Gb/s houden twee TP8-clusters elk de vertraging die in deze paper is gemeten, terwijl één TP16-cluster die ongeveer zou verdubbelen.

---

# Deel III: Echte 100 Gb/s-links

## 11. Echte 100 Gb/s-links opbouwen

Wanneer het resultaat van een workload op de geëmuleerde link aanvaardbaar is, zijn echte 100 Gb/s-links de volgende stap. Dit deel bouwt ze op voor vier Sparks en meet ze, waarmee ook de emulatie en de schatting aan echte kabels worden getoetst.

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
   De eerste twee regels zetten de bestaande links om van vier lanes naar twee. De volgende twee schakelen de links in die op 200 Gb/s ongebruikt zijn, met dezelfde vaste snelheid, MTU en L2 MTU als de bestaande links, zodat frames van 9,000 bytes doorkomen. De laatste vier geven alle vier links de QoS-instellingen van de 200 Gb/s-links uit de [installatiehandleiding voor een cluster met 8 nodes]({{ '/papers/dgx-spark-8node-cluster-setup/' | relative_url }}), met de snelheid van de RoCE-wachtrij ingesteld op 100 Gbps; zonder deze instellingen zouden de twee nieuwe links RoCE-verkeer anders behandelen dan de oude. De wijziging raakt alleen deze aansluiting en herstart de switch niet.
7. **Start de vier Sparks opnieuw op** (Sectie 11.4).
8. **Verifieer de links** (Sectie 11.5).
9. **Start het model** met zijn ongewijzigde recipe, en controleer aan de hand van de RDMA-tellers (Bijlage A) dat beide netwerkinterfaces van elke Spark verkeer dragen.

Terug naar 200 Gb/s gaat in omgekeerde volgorde: stop het model, plaats de 2-wegkabels terug, pas de omgekeerde instellingen toe, start de Sparks opnieuw op en verifieer.

```
/interface ethernet set [find default-name=qsfp56-dd-3-1] auto-negotiation=no speed=200G-baseCR4 mtu=9000 l2mtu=9500
/interface ethernet set [find default-name=qsfp56-dd-3-5] auto-negotiation=no speed=200G-baseCR4 mtu=9000 l2mtu=9500
/interface ethernet set [find default-name=qsfp56-dd-3-3] auto-negotiation=yes mtu=1500 l2mtu=1584
/interface ethernet set [find default-name=qsfp56-dd-3-7] auto-negotiation=yes mtu=1500 l2mtu=1584
/interface ethernet switch qos port set qsfp56-dd-3-1 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
/interface ethernet switch qos port set qsfp56-dd-3-5 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
/interface ethernet switch qos port set qsfp56-dd-3-3 trust-l3=ignore pfc=disabled
/interface ethernet switch qos port unset qsfp56-dd-3-3 egress-rate-queue3
/interface ethernet switch qos port set qsfp56-dd-3-7 trust-l3=ignore pfc=disabled
/interface ethernet switch qos port unset qsfp56-dd-3-7 egress-rate-queue3
```

Dit zet `-3` en `-7` terug op hun fabrieksinstellingen; daarna was de `/export terse` van de switch identiek aan de export van vóór de wijziging. Beide richtingen kunnen als scripts op de switch worden opgeslagen (`/system/script`) en in één stap worden uitgevoerd. Op deze manier omschakelen verandert één aansluiting, terwijl het terugzetten van de back-up de hele configuratie zou vervangen en de switch zou herstarten, waardoor elke Spark erop enkele minuten onbereikbaar zou zijn. Elke richting kostte ongeveer 15 minuten handwerk.

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
| Spark naar Spark, `ping -M do -s 8972` | antwoorden op beide subnetten: frames van 9,000 bytes komen van begin tot eind door |
| Spark naar Spark, `ib_write_bw` | ongeveer 98 Gb/s (Sectie 12.3); ongeveer 13 Gb/s betekent dat een herstart nodig is |
| Switch, `/export terse` tegenover de export van stap 2 | alleen verschillen in de omgebouwde aansluiting |

In de test kwamen frames van 9,000 bytes door tussen elk geordend paar van de vier Sparks op beide subnetten, en werden er geen CRC-, symbool-, FEC- of RoCE-hertransmissiefouten, pauzeframes of verworpen pakketten in de switch geteld.

---

## 12. Testopzet op TP4

### 12.1. Alleen de link veranderen

GLM-5.3 past niet op vier Sparks, dus de echte 100 Gb/s-links werden gemeten met GLM-5.3-Flash op TP4. Net als in Sectie 7.1 was de linksnelheid het enige verschil tussen de twee configuraties: in beide werden dezelfde Sparks, hetzelfde model, dezelfde engine, dezelfde recipe, dezelfde prompts en hetzelfde testplan gebruikt, en alleen de kabel en de instellingen van één switchaansluiting veranderden.

### 12.2. Opstelling

| Onderdeel | Waarde |
|---|---|
| Systemen | 4× NVIDIA DGX Spark (GB10, 128 GB unified memory) |
| Switch | MikroTik CRS804: 2 × 200G-breakoutkabels (200 Gb/s); één 4 × 100G-breakoutkabel (100 Gb/s) |
| Model | GLM-5.3-Flash FP8 (`zai-org/GLM-5.3-Flash`): MoE; verborgen dimensie 4,096; 45 lagen |
| Engine | SGLang 0.5.22.dev7, PyTorch 2.13, NCCL 2.30.7 |
| Parallellisme | TP4: één modelinstantie over de 4 Sparks |
| Belangrijkste instellingen | prefill-chunks van 8,192 tokens, FP8-KV-cache, speculatieve decodering met DFlash (`incoai/GLM-5.3-Flash-DFlash2`, blokken van 8 drafttokens), Triton-attention, maximaal 8 gelijktijdige verzoeken |
| NCCL | beide RDMA-apparaten van elke Spark, RoCE v2, geen algoritme afgedwongen |

Met de ringformule van Sectie 3.3 kost elk prompttoken elke Spark

> (2 × 45 + 1) × 4,096 waarden × 2 bytes × 1.5 = **1.12 MB** aan netwerkverkeer,

een derde van de 3.38 MB van GLM-5.3 op TP8: het model heeft een kleinere verborgen dimensie en minder lagen, en op TP4 verstuurt elke Spark per all-reduce 1.5 keer zijn blok in plaats van 1.75 keer. Elke all-reduce van de prefill telt een blok van 8,192 × 4,096 waarden op, 67 MB bij 2 bytes per waarde, groot genoeg voor NCCL om hem als ring uit te voeren (Sectie 3.4).

### 12.3. De echte 100 Gb/s-link

RDMA-schrijfbandbreedte (`ib_write_bw`, berichten van 64 KB) en latentie (`ib_write_lat`) tussen twee Sparks, na een herstart:

| | 200 Gb/s | Geëmuleerde 100 Gb/s (Sectie 7.3) | Echte 100 Gb/s |
|---|---|---|---|
| Bandbreedte, één interface | 109 Gb/s | 109 Gb/s | 97.8 Gb/s |
| Bandbreedte, beide interfaces | 191–195 Gb/s | (alleen één interface) | 49.0 + 49.0 = 98.0 Gb/s |
| Latentie, 2 bytes | 2.49 µs | | 2.47 µs |
| Latentie, 8 KB | 4.78 µs | | 5.02 µs |

Een echte 100 Gb/s-link draagt ongeveer **98 Gb/s** aan gegevens, of er nu één interface of beide worden gebruikt, ongeveer 10% minder dan de geëmuleerde link. De latentie voor kleine berichten verandert niet; een bericht van 8 KB duurt 0.24 µs langer, de extra tijd om 8 KB op de halve linksnelheid te versturen.

Met B_new = 98 Gb/s wordt de grens van Sectie 5.1

> **extra prefill-tijd ≤ prefill-bytes × (1/98 − 1/200)**, ongeveer **0.047 s per 1,000 prompttokens** voor GLM-5.3-Flash op TP4

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

Figuren 16–20 tonen het verkeer dat één Spark verstuurt tijdens de drie meetrondes van elke test, met 200 Gb/s bovenaan en de echte 100 Gb/s eronder, op dezelfde tijdas. De grijze band is de prefill, die eindigt bij het eerste token.

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

Het gemeten prefill-verkeer was **1.14 MB per prompttoken** per Spark, 2% meer dan de 1.12 MB van Sectie 12.2, en gelijk bij beide linksnelheden. De vier Sparks verstuurden dezelfde hoeveelheid: over de hele run op 100 Gb/s elk 1,294 GB, gelijk tot op 0.02%. Bij een boom-all-reduce zouden twee van de vier Sparks twee keer zoveel hebben verstuurd als de andere twee (Figuur 4); de gelijke hoeveelheden bevestigen dat de all-reduces van de prefill als ring liepen.

### 13.3. TTFT

Gemiddelden van drie rondes, met de spreiding over de rondes tussen haakjes; voor P4 de tijd tot het laatste van de vier verzoeken zijn eerste token ontvangt.

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

Voor de afzonderlijke prompt van 8K is de gemeten toename gelijk aan de schatting: 0.39 s tegenover ten hoogste 0.38 s, ongeveer 0.048 s per 1,000 prompttokens. De schatting op basis van de architectuur van het model, de prefill-chunkgrootte van de engine en de linksnelheid houdt dus stand op echte 100 Gb/s-links en op TP4, zoals ze dat op de geëmuleerde link op TP8 deed.

In procenten daalt de toename van 12.6% bij 8K naar 7.1% bij 32K. De bytes groeien evenredig met de prompt, maar in deze configuratie groeit de prefill-tijd sneller (3.1 s bij 8K, 26.3 s bij 32K, 86 s bij 64K), zodat het netwerk een kleiner deel van een langere prefill inneemt, zoals Sectie 6.1 beschrijft voor een model waarvan het rekenwerk sneller groeit dan de prompt.

### 13.4. Decodesnelheid

| Test | 200 Gb/s | Echte 100 Gb/s | Verandering |
|---|---|---|---|
| P1: 1K | 31.5 tokens/s | 33.6 tokens/s | +6.8% |
| P2: 8K | 23.8 tokens/s | 24.6 tokens/s | +3.4% |
| P3: 32K | 15.6 tokens/s | 15.1 tokens/s | −3.3% |
| P4: 4 × 8K | 11.4 tokens/s per verzoek | 11.8 tokens/s per verzoek | +3.7% |
| P5: 64K | 12.0 tokens/s | 12.2 tokens/s | +2.2% |

De veranderingen wijzen in beide richtingen en blijven binnen de variatie tussen rondes, die groter is dan op TP8 omdat de snelheid van speculatieve decodering afhangt van hoeveel drafttokens worden geaccepteerd (in P2 op 200 Gb/s varieerden afzonderlijke rondes van 21.9 tot 25.8 tokens/s). De decodesnelheid hangt niet af van de linksnelheid, op de echte link net zo min als op de geëmuleerde.

### 13.5. Waar de meting afwijkt van de schatting

**De prompt van 1K.** Twee van de drie rondes duurden op de echte 100 Gb/s-link 0.70–0.71 s, tegenover 0.66–0.67 s op 200 Gb/s, binnen de schatting; de derde duurde 0.82 s. Omdat de bursts bij beide linksnelheden onder 100 Gb/s blijven (Figuur 16), vertraagt de link ze niet, en valt het verschil binnen de variatie tussen rondes.

**De prompt van 32K.** De toename ligt 0.35 s boven de schatting, 1.3% van de TTFT. De rondes bij elke linksnelheid liggen binnen 0.2 s van elkaar, dus dit is een werkelijk verschil tussen de twee runs, die op verschillende dagen met afzonderlijke starts van het model zijn uitgevoerd.

**Vier prompts van 8K die tegelijk binnenkomen.** De rondes op 200 Gb/s varieerden met 8.4 s, tegenover een verwacht effect van ten hoogste 1.5 s. De pauzes in Figuur 19 komen voort uit de manier waarop de engine de vier prompts inplande, die van ronde tot ronde verschilde, zoals in Sectie 8.6. Het resultaat zegt niets over de link.

**De prompt van 64K.** P5 op 200 Gb/s werd gemeten op een andere start van het model dan P1–P4 en kwam 2.6 s trager uit dan op de echte 100 Gb/s-link. Bij prompts van 64K is het netwerk goed voor slechts 3.5% van de prefill-tijd, zodat een klein verschil tussen starts zwaarder weegt dan het effect van de link.

### 13.6. De projectie naar TP-grootte

Sectie 10 projecteerde voor een prompt van 8K ten hoogste 8% op TP4, voor een model met de opbouw van GLM-5.3. GLM-5.3-Flash rekent per token veel minder, zodat het netwerk een groter deel van zijn prefill inneemt: zijn eigen schatting is ten hoogste 12.4%, en gemeten werd 12.6%. De geprojecteerde getallen horen bij GLM-5.3; de methode is overdraagbaar, met de bytes per prompttoken van het betreffende model en één gemeten TTFT op 200 Gb/s.

---

## 14. Is 100 Gb/s redelijk?

Ja, voor clusters tot en met TP8. Wie een TP8-cluster van 8 Sparks van 200 Gb/s- naar 100 Gb/s-links overzet:

> **Het eerste token komt bij een zeer lange prompt ten hoogste ongeveer 20% later, en ten hoogste ongeveer 30% later wanneer meerdere zeer lange prompts tegelijk binnenkomen. Korte tot middellange prompts merken geen verschil. Zodra het antwoord begint, stroomt het in hetzelfde tempo.**

| Workload | Gemeten (geëmuleerde 100 Gb/s) | Echte 100 Gb/s-kabel, ten hoogste |
|---|---|---|
| Chat met korte tot middellange prompts (rond 1K tokens) | geen meetbaar verschil | ongeveer +4% |
| Eén zeer lange prompt: RAG, lange documenten (8K–64K tokens) | TTFT +12.6–13.9% | TTFT +18% (ten hoogste 0.14 s per 1,000 prompttokens) |
| Meerdere zeer lange prompts die tegelijk binnenkomen | TTFT per verzoek +17.9–22.5% | TTFT per verzoek +28% |
| Decodesnelheid, in alle gevallen | ongewijzigd | ongewijzigd |

Dit zijn bovengrenzen voor de gemeten gevallen; in een gemengde workload zijn de meeste verzoeken korter of komen ze alleen binnen, en merken ze minder. Op echte 100 Gb/s-links op TP4 (Sectie 13) volgde de extra tijd tot het eerste token dezelfde schatting, en veranderde de decodesnelheid niet. Voor een specifieke workload geeft de geëmuleerde link van Sectie 7.3 het antwoord op het bestaande cluster, voordat er een kabel wordt gekocht.

Op 100 Gb/s, met één 4 × 100G-breakoutkabel per vier Sparks (Sectie 11), verbindt een **CRS812** 8 Sparks, genoeg voor één TP8-cluster, tegen de prijs van de langere wachttijd voor het eerste token bij lange prompts die hierboven is beschreven; het tempo waarin het antwoord stroomt, verandert niet.

Op TP4 delen vier Sparks één 4 × 100G-breakoutkabel op één switchaansluiting (Sectie 11). Met GLM-5.3-Flash kwam het eerste token van een prompt van 8K tokens op echte 100 Gb/s-links 12.6% later, zoals de schatting voorspelde, en de decodesnelheid veranderde niet (Sectie 13).

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
- ✗ **Draaiende Sparks omkabelen zonder ze opnieuw op te starten:** de links komen op de juiste snelheid op, maar kunnen maar ongeveer 13 Gb/s versturen.

### Checklist voor het plannen van het netwerk van een DGX Spark-cluster

- ☐ Is de TP-grootte per modelinstantie vastgesteld (TP4, TP8, of twee TP8-instanties op 16 Sparks)?
- ☐ Is de verwachte promptlengte bekend (chat, RAG, lange documenten)?
- ☐ Is er een TTFT-doel voor lange prompts?
- ☐ Is de vertraging van 100 Gb/s geschat (bytes per prompttoken × prompttokens ÷ 200 Gb/s, Sectie 5)?
- ☐ Is de workload gedraaid op de geëmuleerde 100 Gb/s-link (Sectie 7.3), en is het resultaat, omgerekend naar een echte link (Sectie 9), aanvaardbaar?
- ☐ Zijn de breakoutondersteuning en het opbouwen van de ConnectX-7-link op de geplande snelheid geverifieerd?
- ☐ Zijn de Sparks na het omkabelen opnieuw opgestart, en laat `ib_write_bw` ongeveer 98 Gb/s per 100 Gb/s-link zien?
- ☐ Wordt het RDMA-verkeer bewaakt met RDMA-tellers met een resolutie van een milliseconde?

---

## 16. Conclusie

Tensorparallelle inferentie over DGX Spark-systemen gebruikt het netwerk op twee heel verschillende manieren. Terwijl een prompt wordt verwerkt, verstuurt elke all-reduce tientallen megabytes per Spark, als ring, in bursts die een 200 Gb/s-link telkens enkele milliseconden vullen. Terwijl het antwoord wordt gegenereerd, zijn de all-reduces enkele honderden kilobytes of minder, en blijft het verkeer ver onder 100 Gb/s. Een gehalveerde linksnelheid laat de decodesnelheid daarom ongewijzigd en voegt een voorspelbare hoeveelheid toe aan het wachten op het eerste token.

Die hoeveelheid is te schatten op basis van alleen de architectuur van het model, de prefill-chunkgrootte van de engine en de linksnelheid: voor GLM-5.3 op TP8 ten hoogste 0.135 s per 1,000 prompttokens op 100 Gb/s. Gemeten op 8 Sparks met een geëmuleerde 100 Gb/s-link kregen afzonderlijke prompts van 8K–64K tokens hun eerste token 12.6–13.9% later, dicht bij de schatting; verzoeken die samen met andere lange prompts binnenkwamen 17.9–22.5% later; korte prompts en de decodesnelheid werden niet beïnvloed. Een echte 100 Gb/s-link, die ongeveer 98 Gb/s draagt, zou er ten hoogste nog 3–4 procentpunt aan toevoegen. Gemeten op echte 100 Gb/s-links met GLM-5.3-Flash op TP4 volgde de extra tijd tot het eerste token dezelfde schatting, en veranderde de decodesnelheid opnieuw niet.

Voor een TP8-cluster van 8 Sparks met 100 Gb/s-links **kunt u verwachten dat het eerste token bij een zeer lange prompt ten hoogste ongeveer 20% later komt en ten hoogste ongeveer 30% later wanneer meerdere zeer lange prompts tegelijk binnenkomen, zonder verschil voor korte tot middellange prompts en zonder verschil in hoe snel het antwoord stroomt.** Omdat de vertraging groeit met de TP-grootte, zijn 16 Sparks op 100 Gb/s het best te gebruiken als twee TP8-clusters. Voor elke andere workload kan dezelfde vergelijking op een bestaand 200 Gb/s-cluster worden gemaakt voordat er kabels worden gekocht, door 100 Gb/s te emuleren met één netwerkinterface per Spark en het resultaat om te rekenen naar een echte link.

---

## Bijlage A: RDMA-verkeer meten

Omdat RDMA de netwerkstack van het besturingssysteem omzeilt, tellen de gebruikelijke interfacestatistieken het niet mee. Het verkeer in deze studie werd afgelezen uit de RDMA-poorttellers van de ConnectX-7 (`port_xmit_data` en `port_rcv_data` onder `/sys/class/infiniband/`, in eenheden van 4 bytes) voor elk van de twee RDMA-apparaten, en per poort opgeteld. Een controle tegen de eigen bytetellers van de adapter kwam binnen 0.2% overeen.

Een kleine sampler las de tellers elke 1 ms op één Spark af en gaf elke aflezing een eigen tijdstempel, op dezelfde klok die de benchmark voor zijn verzoeken gebruikte. Snelheden over 1 ms en langere intervallen werden berekend door de bytes van elk bemonsteringsinterval te verdelen over de middelingsintervallen die het overlapt. De bytetellingen zijn exact, maar het tijdstip van elke aflezing is slechts tot ongeveer ±0.1–0.2 ms bekend, zodat één waarde over 1 ms een onzekerheid van ongeveer ±15–25% heeft; daarom liggen sommige waarden over 1 ms in de figuren iets boven de linksnelheid. Gemiddelden over 5 ms of langer zijn tot op enkele procenten nauwkeurig.

De keuze van het middelingsinterval verandert de hoogste waarde die een meting rapporteert, zoals Sectie 8.1 laat zien: hetzelfde verkeer piekt op 181 Gb/s in intervallen van 1 ms, 96 Gb/s in intervallen van 5 ms en 44 Gb/s in intervallen van 100 ms, terwijl het gemiddelde in alle gevallen gelijk is. Een piekwaarde heeft alleen betekenis samen met haar middelingsinterval.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/window-choice.png' | relative_url }}" alt="Hetzelfde prefill-verkeer van 8K, gemiddeld over intervallen van 1 ms, 5 ms en 100 ms" width="820"/></p>
<sub><i>Figuur A1: Hetzelfde prefill-verkeer, gemiddeld over intervallen van 1 ms, 5 ms en 100 ms.</i></sub>

De meting zelf had geen invloed op het netwerk: bandbreedte- en latentietests (`ib_write_bw`, `ib_write_lat`) met de sampler actief en gestopt lieten dezelfde bandbreedte zien (109.07, 109.08 en 109.15 Gb/s) en ten hoogste ongeveer 1% verschil in latentie. De sampler en de benchmarkdriver gebruikten samen ruim minder dan één van de 20 CPU-cores van de Spark.

---

## Bijlage B: Reproduceerbaarheid

| Onderdeel | Waarde |
|---|---|
| Testdriver | verstuurt de testverzoeken als streamingverzoeken naar de engine, geeft het eerste en elk volgend token van elk antwoord een tijdstempel, en registreert daarnaast de RDMA-tellers op dezelfde klok (Secties 7.4–7.6, Bijlage A) |
| Model | `Inferact/GLM-5.3-NVFP4` |
| Engine | vLLM `0.1.dev20133+gb5f995e73`, container `vllm-node-b12x`, NCCL 2.31.2 |
| Serve-instellingen | `--tensor-parallel-size 8`, `--max-num-batched-tokens 4096`, `--long-prefill-token-threshold 2048`, `--max-num-seqs 8`, `--max-model-len 262144`, `--kv-cache-dtype fp8`, `--gpu-memory-utilization 0.726`, `--enable-chunked-prefill`, `--enable-prefix-caching`; speculatieve decodering: MTP, 4 tokens, draft niet verdeeld |
| NCCL | `NCCL_IB_HCA` met beide RDMA-apparaten (200 Gb/s); tweede apparaat uitgesloten (emulatie van 100 Gb/s); RoCE v2, GID-index 3 |
| Plan | tests P1–P6 (Sectie 7.4), 1 opwarmronde en 3 meetrondes, vaste seed, 1,024 uitvoertokens |

Voor de TP4-metingen van Deel III:

| Onderdeel | Waarde |
|---|---|
| Model | `zai-org/GLM-5.3-Flash` (FP8), speculatief draftmodel `incoai/GLM-5.3-Flash-DFlash2` |
| Engine | SGLang 0.5.22.dev7 met pull request #36708, PyTorch 2.13, NCCL 2.30.7 |
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
- **Prefill-chunk:** Het deel van een prompt dat in één forward pass wordt verwerkt (hier maximaal 4,096 tokens).
- **RDMA:** Remote direct memory access: de netwerkadapter leest en schrijft rechtstreeks in het geheugen van applicaties, zonder dat de gegevens door de netwerkstack van het besturingssysteem gaan.
- **Ring-all-reduce:** Een all-reduce waarbij apparaten segmenten van de gegevens in een ring doorgeven; elk apparaat verstuurt in totaal 2 × (N − 1) / N keer de gegevens.
- **RoCE v2:** RDMA over Converged Ethernet, versie 2: RDMA-pakketten die binnen UDP/IP over standaard-Ethernet worden getransporteerd.
- **Tensorparallellisme (TP):** Het verdelen van elke gewichtsmatrix van een model over meerdere apparaten, die na elke stap hun deelresultaten combineren.
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

- **Schattingen:** Secties 3–6 gebruiken alleen de configuratie van het model, de instellingen van de engine en de linksnelheid; de grenzen zijn bovengrenzen. De projectie naar TP-grootte (Sectie 10) gebruikt de gemeten TP8-basislijn en dient ter illustratie.
- **Metingen:** Alle prestatiecijfers zijn gemeten op 8× DGX Spark met GLM-5.3 op TP8, zoals beschreven in Sectie 7, en op 4× DGX Spark met GLM-5.3-Flash op TP4, zoals beschreven in Sectie 12; het netwerkverkeer werd afgelezen uit de RDMA-tellers van de ConnectX-7 van één Spark (Bijlage A).
- **Emulatie:** Op TP8 werd 100 Gb/s op de bestaande kabels geëmuleerd door de communicatie te beperken tot een van de twee netwerkinterfaces van elke ConnectX-7-poort, die tot 109 Gb/s draagt; Sectie 9 rekent de resultaten om naar een echte 100G-kabel, die 98 Gb/s draagt. Op TP4 werden echte 100G-kabels gebruikt.
- **Actualiteit:** Engineversies en instellingen veranderen snel; de resultaten gelden voor de vermelde versies, met de stand van oktober 2026.

---

{% include company/block.html name="cta_logo" %}

**Laten we samen het netwerk van uw DGX Spark-cluster plannen.** Voor een dimensionering die rekening houdt met modelgrootte, tensorparallellisme en linksnelheid, {% include company/block.html name="contact_cta" %}
