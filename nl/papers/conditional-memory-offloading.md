---
title: Engram-offloading bij LLM-inferentie
parent: White Papers
nav_order: 2
lang: nl
page_id: conditional-memory-offloading
date: 2026-09-29
card_tag: "Technische gids"
description: >-
  Engram-tabellen zijn groot, maar per token worden er maar een paar rijen uit
  gelezen; daarom kunnen ze van het GPU-geheugen naar systeem-RAM of NVMe. Wat
  dat betekent op DGX Spark, RTX PRO 6000 en DGX B300, en meetresultaten met
  DeepSeek-V4.1-Flash en Qwen3.8-Flash-Next.
permalink: /papers/conditional-memory-offloading/
last_modified_date: 2026-10-05
toc: true
---

> **Publicatiedatum:** september 2026 (herzien in oktober 2026)
> **Reikwijdte:** Wat Engram-tabellen zijn, waarom hun toegangspatroon het mogelijk maakt ze buiten het GPU-geheugen te plaatsen, waar ze terechtkunnen op DGX Spark, RTX PRO 6000 en DGX B300, en wat offloading ervan oplevert. Beoordeeld aan de hand van OpenZeka-metingen van DeepSeek-V4.1-Flash en Qwen3.8-Flash-Next.
> **Opmerking:** Modelnamen, softwareversies en meetresultaten zijn geldig per september 2026. De ondersteuning voor offloading in inferentie-engines verandert snel; de blijvende vraag is hoeveel data elke stap nodig heeft en wanneer die data er moet zijn.

---

{:.no_toc}
## Inhoudsopgave

* TOC
{:toc}

---

## Managementsamenvatting

- **Twee recente modellen bevatten een zeer grote embeddingtabel.** DeepSeek-V4.1-Flash (*Engram*) en Qwen3.8-Flash-Next (*n-gram-embeddings*, in SGLang PLE genoemd) voegen allebei een opzoektabel (lookup table) toe met aangeleerde vectoren, geadresseerd via korte reeksen invoertokens; deze paper noemt beide **Engram-tabellen**. De tabel van DeepSeek bevat 196B parameters, die van Qwen 51B.
- **De tabel is groot, maar wordt conditioneel gelezen.** Per token worden alleen de paar rijen gelezen die bij de recente tokens passen: ongeveer 2.5 KB voor Qwen en 12 KB voor DeepSeek. De rest van de tabel wordt niet aangeraakt. De Engram-paper van DeepSeek noemt dit *conditional memory*.
- **Dat toegangspatroon maakt offloading mogelijk.** Een tabel die veel opslag maar heel weinig bandbreedte vraagt, kan naar een tragere, grotere geheugenlaag (systeem-RAM of NVMe), terwijl het rekenwerk op de GPU blijft. De rijadressen volgen uit token-ID's, zijn dus bekend voordat de laag draait, en de rijen kunnen vooraf worden opgehaald. Het GPU-geheugen bevat dan de rest van het model, zodat een groter model op hetzelfde apparaat past.
- **Waar de tabel terechtkomt, hangt af van het geheugenontwerp van het apparaat.** Op **DGX Spark** (unified memory) zijn systeem-RAM en GPU-geheugen dezelfde pool; de tabel gaat daarom naar NVMe. Op **RTX PRO 6000** (dedicated GPU-geheugen) gaat hij via PCIe naar pinned systeem-RAM. Op **DGX B300** heeft de DeepSeek-configuratie met vier GPU's genoeg GPU-geheugen om hem te bevatten.
- **Meetresultaten:** de geteste configuratie van het 763B-model DeepSeek-V4.1-Flash draait op 4× DGX Spark doordat de Engram-tabellen op NVMe worden geplaatst; op 8× DGX Spark verhoogde het verplaatsen ervan naar NVMe de gerapporteerde KV-cachetoewijzing met ~21 GB per node en de geconfigureerde contextlimiet van 300K naar 1M tokens. Qwen3.8-Flash-Next, met een gekwantiseerde checkpoint van 132.7 GB, draait op één DGX Spark en op één RTX PRO 6000, met gemeten prestaties die geschikt zijn voor interactief gebruik bij de hieronder besproken niveaus van gelijktijdigheid (concurrency).
- **Wat het oplevert:** een model met een Artificial Analysis Intelligence Index van 39.8 draait op **één DGX Spark met 28.5 tok/s per verzoek**, voor naar schatting 8 chat- of 3 agentische gebruikers, en op **één RTX PRO 6000 met 155.8 tok/s**, voor naar schatting 64 chat- of 24 agentische gebruikers (schattingen van de [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}); sectie 6.2).
- **Gevolg voor de dimensionering:** budgetteer GPU-geheugen voor de overige gewichten, de KV-cache, de recurrente toestand en de runtimebuffers; budgetteer de geoffloade tabel in systeem-RAM of NVMe. Als meer modellen dit ontwerp overnemen, zou hetzelfde apparaat grotere modellen kunnen draaien dan het GPU-geheugen alleen doet vermoeden.

---

## 1. Inleiding

De [Handleiding voor lokaal LLM-gebruik]({{ '/papers/local-llm-guide/' | relative_url }}) dimensioneert hardware op basis van GPU-geheugen: modelgewichten, KV-cache, recurrente toestand en runtimebuffers moeten erin passen. Dat budget behandelt alle gewichten gelijk. Engram-tabellen zijn een uitzondering: ze vormen een groot deel van de parameters, maar elk token leest er maar een heel klein deel van. Door ze buiten het GPU-geheugen te houden, kan een model dat anders te groot is op hetzelfde apparaat praktisch bruikbaar worden.

Deze paper zet eerst tegenover elkaar wat een LLM voor elk token berekent en wat het alleen opzoekt, en wat dat voor het geheugen betekent (sectie 2); daarna waar de tabel op elk apparaat kan worden geplaatst (sectie 3) en wat de OpenZeka-runs van DeepSeek-V4.1-Flash en Qwen3.8-Flash-Next op DGX Spark en RTX PRO 6000 laten zien (secties 4 en 5). Startinstructies staan in de gelinkte deploymentpapers en het SGLang-cookbook.

---

## 2. Rekenwerk versus conditional memory

### 2.1. Wat een LLM per token berekent, en wat dat van het GPU-geheugen vraagt

Een LLM genereert tekst token voor token. Elk nieuw token wordt omgezet in een vector en door alle lagen van het model gestuurd. In elke laag:

- **Attention** vergelijkt het token met de tokens ervoor. Om het verleden niet opnieuw te hoeven berekenen, worden hun keys en values bewaard in de **KV-cache**, die groeit met de contextlengte en het aantal gelijktijdige verzoeken.
- **Het feed-forward-netwerk** vermenigvuldigt de vector met grote aangeleerde gewichtsmatrices. In een Mixture-of-Experts-model (MoE) kiest een router per token een paar experts en worden alleen hun matrices gebruikt, maar elk daarvan volledig.

Eén token produceren betekent dus een volledige doorgang door het model: elke dense gewichtsmatrix, elke geselecteerde expert en de KV-cache worden **bij elke decodestap** gelezen. Daarom moeten ze allemaal in het GPU-geheugen staan: ze bij elke stap via een tragere verbinding lezen, zou van die verbinding het knelpunt maken. De geheugenbehoefte is daarom *gewichten + KV-cache + runtimebuffers*, en bij kleine batchgroottes is de decodesnelheid ruwweg *geheugenbandbreedte ÷ gelezen bytes per token*.

| Data | Gelezen per token | Indien buiten de GPU geplaatst |
|---|---|---|
| **Dense gewichten** | Elke matrix, bij elke stap | De overdrachtsverbinding wordt het knelpunt |
| **MoE-experts** | Geselecteerde experts, volledig; de selectie is pas tijdens de forward pass bekend | Kleinere actieve set, maar een miss is duur en er is weinig tijd vooraf |
| **KV-cache en recurrente toestand** | Bij elke decodestap gelezen (de recurrente toestand ook bijgewerkt); KV-verkeer groeit met de context | Lange contexten veroorzaken zwaar overdrachtsverkeer |
| **Engram-tabellen** | Een paar rijen, geadresseerd vanuit token-ID's | Kleine overdrachten die vooraf kunnen worden opgehaald |

De laatste rij is de uitzondering waar deze paper over gaat.

### 2.2. Wat "conditional" betekent, en wat het verandert aan de geheugenbehoefte

Een **embeddingtabel** koppelt een sleutel aan een aangeleerde vector. Een gewone input-embedding koppelt elk token-ID aan één rij. Een Engram-tabel doet hetzelfde voor korte reeksen tokens (**n-grams**). DeepSeek introduceerde dit als *Engram* in de [Engram-paper](https://arxiv.org/abs/2601.07372); Qwen noemt zijn versie n-gram-embeddings en SGLang noemt de tabel PLE. Deze paper noemt beide **Engram-tabellen**.

**Wat Engram voor het model doet.** Een groot deel van taal bestaat uit vaste, lokale patronen: namen, vaste uitdrukkingen, veelvoorkomende woordcombinaties. Een standaard-Transformer heeft daarvoor geen opzoekbewerking; hij reconstrueert ze voor elk token door rekenwerk in zijn eerste lagen. Engram slaat zulke patronen op in een aangeleerde tabel en haalt ze op door op te zoeken. De Engram-paper stelt dat hierdoor meer van de diepte van het netwerk overblijft voor reasoning, en presenteert het als een as van sparsity die MoE aanvult: MoE is *conditional computation* (alleen sommige experts rekenen), Engram is *conditional memory* (alleen sommige rijen worden gelezen).

*Conditional* betekent hier dus dat een rij alleen wordt gelezen wanneer de invoer erom vraagt. De tabel als geheel is groot, maar een token leest alleen de paar rijen die bij zijn recente tokens passen; de rest wordt niet aangeraakt. In de tabel wordt opgezocht, er wordt niet mee gerekend.

Dat splitst de geheugenbehoefte in tweeën:

- **Wat bij elk token in het rekenwerk wordt gebruikt** (gewichten, KV-cache) vraagt **capaciteit én bandbreedte**, en moet dus in het GPU-geheugen staan.
- **Wat alleen conditioneel wordt opgezocht** (de Engram-tabel) vraagt **capaciteit, maar bijna geen bandbreedte**, en kan dus naar een tragere, grotere geheugenlaag zoals systeem-RAM of NVMe.

| Eigenschap | Wat het betekent | Gevolg |
|---|---|---|
| **Grote opslag** | Tientallen tot honderden miljarden parameters | Neemt een groot deel van het GPU-geheugen in als de tabel daar blijft |
| **Sparse, conditionele toegang** | Een paar kilobytes per token, uit tientallen of honderden GB | Een tragere geheugenlaag is snel genoeg |
| **Adressen vroeg bekend** | Rijen worden gekozen op basis van token-ID's, niet van het rekenwerk van het model | Rijen kunnen worden opgehaald terwijl eerdere lagen draaien |

Het GPU-geheugen hoeft dan alleen het deel van het model te bevatten waarmee wordt gerekend, zodat een groter model op hetzelfde apparaat past. Ter vergelijking: Qwen3.8-Flash-Next leest bij elke decodestap gigabytes aan actieve gewichten, tegenover 2.5 KB uit zijn tabel.

### 2.3. Hoe het opzoeken werkt

1. **Vorm de sleutel.** Neem de recente token-ID's: twee voor een bigram, drie voor een trigram. De ID's `[a, b, c]` geven bijvoorbeeld de suffixen `[b, c]` en `[a, b, c]`.
2. **Hash naar de tabel.** Elke hash-head zet die reeks om in een rijadres. Meerdere heads leveren meerdere vectoren, zodat een botsing in één head weinig schaadt. Zoeken door alle rijen is niet nodig.
3. **Haal de rijen op.** Lees de geadresseerde rijen en voeg ze aaneen. De tabel is vaste aangeleerde data; het is geen gesprekscache of documentdatabase.
4. **Combineer op de GPU.** Projecties transformeren de opgehaalde vector, en een gate die uit de huidige verborgen toestand (hidden state) wordt berekend, bepaalt hoe sterk die bijdraagt. Alleen deze stap heeft de GPU nodig; de tabel zelf kan elders staan.

Het [n-gram-embeddingontwerp](https://arxiv.org/html/2608.30320#S2.SS3) van Qwen volgt dezelfde aanpak als de [Engram-architectuur](https://arxiv.org/html/2601.07372v2#S2).

| | Qwen3.8-Flash-Next | DeepSeek-V4.1-Flash |
|---|---|---|
| Tabelgrootte | ~51.2 GB (47.7 GiB), FP8 | ~196.6 GB, FP8 |
| Gelezen rijen per token | 16 (2 n-gram-ordes × 8 heads, één laag) | 48 (3 n-gram-ordes × 8 heads, twee lagen) |
| Gelezen bytes per token | 16 × 160 B ≈ **2.5 KB** | 48 × 256 B ≈ **12 KB** |

Rijen aan de tabel toevoegen voegt parameters toe zonder het aantal leesacties per token te verhogen.

**Waarom prefetching werkt.** Rijadressen hangen alleen af van token-ID's, en die zijn vóór de forward pass bekend: tijdens prefill de hele prompt, tijdens decode het huidige token. Door de tabel na de eerste lagen te plaatsen (laag 2 in Qwen en lagen 1 en 14 in DeepSeek, geteld vanaf nul), krijgt het ophalen tijd om met rekenwerk te overlappen. Of het op tijd klaar is, hangt af van de engine en de geheugenlaag.

---

## 3. Waar de tabel terechtkan

De kosten van een geoffloade leesactie zijn ruwweg **bytes ÷ bandbreedte van de verbinding**, plus latentie en softwareoverhead; alleen het deel dat niet achter rekenwerk verborgen blijft, vertraagt het model. Bij 2.5–12 KB per token verplaatst zelfs PCIe Gen5 x16 (theoretisch ongeveer 64 GB/s per richting) de rijen van een token ruim binnen een microseconde. Bij kleine, verspreide leesacties wegen latentie en caching zwaarder dan de piekbandbreedte, en bij bestandsgebaseerde tabellen telt ook of de pagina al in de cache staat.

Welke bestemming daadwerkelijk GPU-geheugen vrijmaakt, hangt af van het geheugenontwerp:

- **Dedicated GPU-geheugen (RTX PRO 6000, DGX B300).** De CPU heeft apart systeem-RAM, bereikbaar via PCIe. De tabel daarheen verplaatsen maakt GPU-geheugen vrij. De hier gebruikte implementatie plaatst hem in **pinned (page-locked) host-geheugen**, dat de GPU rechtstreeks kan lezen.
- **Unified memory (DGX Spark).** De CPU en GPU van de GB10 delen één pool van 128 GB LPDDR5X. Er is geen apart systeem-RAM; de tabel "in host-geheugen" plaatsen, gepind of niet, gebruikt dus nog steeds dezelfde 128 GB. Alleen door hem helemaal uit het geheugen te halen, naar lokale NVMe, komt er ruimte vrij. De GPU leest het memory-mapped bestand via de paginatabellen van de host; recent gebruikte pagina's blijven gecachet in de gedeelde pool.

| | DGX Spark (GB10) | RTX PRO 6000 Blackwell | DGX B300 |
|---|---|---|---|
| Geheugenontwerp | Pool van 128 GB, gedeeld door CPU en GPU | 96 GB dedicated GPU-geheugen, apart systeem-RAM | Acht GPU's met dedicated HBM, apart systeem-RAM |
| Bandbreedte van het GPU-geheugen | 273 GB/s | 1.79 TB/s | 8 TB/s per GPU |
| Locatie van de tabel | Lokale NVMe met een paginacache in het geheugen | Pinned systeem-RAM via PCIe | In het GPU-geheugen opgeslagen in de DeepSeek-configuratie met vier GPU's |
| Gevolg voor de dimensionering | Houd in de gedeelde pool rekening met besturingssysteem, paginacache en runtime | Budgetteer systeem-RAM los van GPU-geheugen | Voldoende GPU-geheugen voor deze checkpoints in configuraties met meerdere GPU's |

**Bewijs dat het mechanisme werkt.** In het H800-experiment uit de Engram-paper verlaagde het toevoegen van een tabel van 100B parameters in host-geheugen aan dense backbones van 4B en 8B de doorvoer (throughput) met slechts ongeveer 1.9% en 2.8%, waarbij het ophalen overlapte met het eerste blok ([Engram, §6.4](https://arxiv.org/html/2601.07372v2#S6.SS4)). Offloading verandert de waarden van de tabel niet: de GPU krijgt dezelfde rijen, dus het model berekent hetzelfde resultaat. De enige vraag is of de rijen op tijd aankomen.

---

## 4. De onderzochte modellen

### 4.1. DeepSeek-V4.1-Flash

| Eigenschap | Waarde |
|---|---|
| Totaal aantal parameters | 763B |
| — backbone | 552B |
| — Engram-embeddingtabellen | 196B |
| — vision-encoder, projector, draftmodel | ~15B |
| Actieve parameters per token | ~16B bij decode (~8B bij prefill) |
| Attention | Gecomprimeerde sparse attention met een sliding window van 128 tokens; KV-cache gedeeld over lagen |
| Engram | Laagindices 1 en 14 (vanaf nul geteld); bigrams, trigrams en 4-grams; 8 hash-heads per n-gram-orde; 256 waarden per rij |
| Maximale contextlengte | 1,048,576 tokens (ongeveer 1M) |
| Grootte van de checkpoint | 510.3 GB; gemengde precisie, waaronder FP8 voor dense en Engram-gewichten en FP4 voor experts |

De [modelkaart](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash) onderscheidt de backbone van 552B van Engram en de hulpmodules.

### 4.2. Qwen3.8-Flash-Next

| Eigenschap | Waarde |
|---|---|
| Parameters | 125B basismodel + 51B n-gram-embeddings + 4B module voor multi-token prediction (MTP) |
| Actieve parameters per token | 6B |
| Attention | 36 Gated DeltaNet-lagen en 12 Qwen Sparse Attention-lagen (QSA); QSA selecteert tot 512 blokken van vier tokens plus het laatste onvolledige blok |
| N-gram-tabel | Laagindex 2 (vanaf nul geteld); bigrams en trigrams; elk 8 hash-heads; 16 rijen van 160 waarden vormen een vector met 2,560 dimensies |
| Geconfigureerde contextlimiet | 262,144 tokens |
| Geserveerde checkpoint | `nvidia/Qwen3.8-Flash-Next-NVFP4`; 132.7 GB (123.6 GiB) aan safetensors-bestanden |
| Precisie van de gewichten | NVFP4 voor de gerouteerde experts in het hoofdmodel; BF16 voor attention en gedeelde experts; FP8 voor de gerouteerde MTP-experts en de n-gram-tabel |

### 4.3. Modelgrootte en geheugenbehoefte

| Model | Grootte van de checkpoint | Embeddingtabel | Rest van de checkpoint | Configuraties die hier offloading van de tabel vereisen |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 510.3 GB | ~196.6 GB | ~313.7 GB | 4× DGX Spark |
| Qwen3.8-Flash-Next, NVIDIA NVFP4 | 132.7 GB | ~51.2 GB (47.7 GiB) | ~81.5 GB | 1× DGX Spark; 1× RTX PRO 6000 |

GB betekent 10⁹ bytes en GiB 2³⁰ bytes. De checkpointgroottes zijn de totalen van de safetensors-bestanden bij de vastgelegde revisies (voor Qwen de [checkpointbestanden van NVIDIA](https://huggingface.co/nvidia/Qwen3.8-Flash-Next-NVFP4/tree/fc694b54fb0174e0913e6adf86691ef85a4ead47)). De resterende grootte is een aftreksom, geen meting van het GPU-geheugen na het laden; cijfers over het geheugen tijdens runtime staan in sectie 5.

Offloading verplaatst de tabel naar een andere geheugenlaag; ze blijft deel van het model. De kleinere configuraties kunnen dan de overige gewichten bevatten, samen met het geheugen dat voor inferentie nodig is.

---

## 5. Benchmarkresultaten

### 5.1. Methodologie

De onderstaande deploymentresultaten zijn OpenZeka-metingen, uitgevoerd met de open-source [CordatusAI LLM Benchmark Tool](https://github.com/CordatusAI/llm-benchmark), met ongeveer 128 invoertokens en een uitvoerlimiet van 128 tokens, tien rondes per niveau van gelijktijdigheid, waarbij gemiddelde waarden worden gerapporteerd. **Gelijktijdigheid (C)** is het aantal gelijktijdige verzoeken. **TTFT (time to first token)** omvat wachtrijtijd en promptverwerking; ook het eerste reasoning-token telt mee wanneer het wordt gestreamd. **TPS (tokens per seconde)** is het aantal uitvoertokens gedeeld door de totale verzoektijd, inclusief TTFT. Het wordt per verzoek gerapporteerd, niet als geaggregeerde doorvoer. Alle resultaten zijn ook beschikbaar in de [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}).

| Run | Hardware | Engine, tensorparallellisme (TP) | Speculatieve decodering | Locatie van de tabel |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 4× DGX Spark | vLLM, TP=4 | DSpark, k=5 | NVMe |
| DeepSeek-V4.1-Flash, 300K | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | In het geheugen |
| DeepSeek-V4.1-Flash, 1M | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | NVMe |
| Qwen3.8-Flash-Next | 1× DGX Spark | SGLang, TP=1 | MTP, 3 speculatieve stappen / 4 drafttokens | NVMe |
| Qwen3.8-Flash-Next | 1× RTX PRO 6000 | SGLang, TP=1 | MTP, 3 speculatieve stappen / 4 drafttokens | Pinned systeem-RAM |

De **twee DeepSeek-configuraties op 8× DGX Spark** vergelijken de plaatsing van de tabel op dezelfde hardware. De andere runs beantwoorden een andere dimensioneringsvraag: welke inferentieprestaties levert de configuratie zodra het model met offloading past? Hun resultaten worden hieronder afzonderlijk beoordeeld.

### 5.2. DeepSeek-V4.1-Flash op 4× DGX Spark: het model passend maken met Engram-on-disk

Verdeeld over vier nodes heeft de volledige checkpoint van 510 GB ongeveer 128 GB per node nodig — meer dan een DGX Spark aan het model kan geven zodra het besturingssysteem, de CUDA-context en de KV-cache zijn meegerekend. Met **Engram-on-disk** bewaart elke node zijn deel van de Engram-rijen op lokale NVMe en zet hij de rijen die elke stap nodig heeft vóór de forward pass klaar in het GPU-geheugen. De overige gewichten kunnen dan worden geladen, met de volgende benchmarkresultaten:

| Gelijktijdigheid (C) | TTFT (ms) | TPS per verzoek (tok/s) |
|---|---|---|
| 1 | 271.6 | 29.5 |
| 2 | 395.8 | 21.3 |
| 4 | 577.4 | 13.1 |
| 8 | 805.9 | 8.8 |

**Waarom dit nuttig is.** Een model met 763B parameters draait verdeeld over vier desktopapparaten met **29.5 tok/s per verzoek en 272 ms TTFT bij C=1**. Bij C=2 houdt het **21.3 tok/s en 396 ms TTFT** vast en haalt het daarmee de standaarddoelen van de Explorer: minstens 20 tok/s en hoogstens 1,000 ms TTFT. Hogere gelijktijdigheid blijft mogelijk, met 13.1 tok/s bij C=4 en 8.8 tok/s bij C=8, maar met tragere antwoorden. Voor deze werklast ondersteunt de configuratie interactief gebruik bij lage gelijktijdigheid.

### 5.3. DeepSeek-V4.1-Flash op 8× DGX Spark: de tabel in het geheugen versus op NVMe

Op acht nodes past de checkpoint in beide gevallen, zodat twee deploymentconfiguraties vergeleken kunnen worden. Op DGX Spark gebruikt een tabel in "host-geheugen" nog steeds de gedeelde geheugenpool van 128 GB. Door de tabel naar NVMe te verplaatsen, daalt dat gebruik, afgezien van gecachete pagina's en staging-buffers.

| Metriek | Engram in het geheugen | Engram op NVMe |
|---|---|---|
| Engram-geheugen per node (gerapporteerd) | 23.6 GB | Alleen rijen en staging-buffers |
| KV-cachetoewijzing per node (gerapporteerd) | ~8.7 GB | ~30 GB |
| Geconfigureerde contextlimiet | 300K tokens | **1M tokens** |
| TTFT bij C=1 | 213 ms | 199 ms |
| TPS per verzoek bij C=1 / C=8 (tok/s) | 36.0 / 13.6 | 33.3 / 11.7 |

**De praktische afweging:** de schijfconfiguratie biedt ongeveer **21 GB meer gerapporteerde KV-cachetoewijzing per node** en behoudt daarbij **33.3 tok/s bij C=1** en **11.7 tok/s per verzoek bij C=8**. Tegenover de configuratie in het geheugen is dat respectievelijk 7.5% en 14% minder TPS. De configuratie in het geheugen heeft een hogere gemeten TPS; de schijfconfiguratie laat meer geheugen over voor de KV-cache.

Dit is een vergelijking van de twee deploymentconfiguraties: ook contextlimieten, geheugeninstellingen en uitvoeringspaden verschillen (zie de [8×-paper]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/' | relative_url }})). De geconfigureerde contextlimiet stijgt van 300K naar 1M tokens. De benchmark gebruikte korte prompts en testte de maximale contextlengte niet.

### 5.4. Qwen3.8-Flash-Next op één DGX Spark: een checkpoint van 132.7 GB passend maken

De **NVIDIA NVFP4-checkpoint van 132.7 GB** kan niet volledig in het geheugen van één Spark worden gehouden naast het besturingssysteem, de KV-cache en de runtimebuffers. Door de **FP8-n-gram-tabel van 47.7 GiB** op te slaan in een memory-mapped bestand op lokale NVMe, kunnen de overige gewichten in unified memory blijven.

De GPU benadert de memory-mapped tabel via de paginatabellen van de CPU. Recent benaderde bestandspagina's blijven in unified memory, met in deze implementatie een budget van 8 GiB voor de paginacache. De configuratie laat ruwweg 12–18 GB over voor de pools van de KV-cache en de recurrente toestand, en beperkt het aantal lopende verzoeken tot acht.

| Gelijktijdigheid (C) | TTFT (ms) | TPS per verzoek (tok/s) |
|---|---|---|
| 1 | 301.9 | 28.5 |
| 2 | 392.7 | 23.6 |
| 4 | 566.0 | 17.1 |
| 8 | 762.6 | 11.8 |

**Waarom dit nuttig is.** Het model draait op één desktopapparaat met **28.5 tok/s en 302 ms TTFT bij C=1**. Bij C=2 levert het **23.6 tok/s per verzoek en 393 ms TTFT** en haalt het de standaarddoelen van de Explorer. Bij C=4 levert het nog **17.1 tok/s per verzoek**; bij C=8 11.8 tok/s. De gemiddelde TTFT blijft op elk getest niveau onder één seconde. De meetresultaten ondersteunen interactieve lokale inferentie bij lage gelijktijdigheid.

De opstarttijd is een operationeel aandachtspunt: deze implementatie herschrijft het tabelbestand bij elke start, wat ongeveer 10 minuten duurt bij een nieuw bestand of 55 minuten wanneer het eerder gevulde bestand nog aanwezig is. Dat is van belang bij herstarts, ook al levert de draaiende service de bovenstaande responssnelheden.

### 5.5. Qwen3.8-Flash-Next op één RTX PRO 6000: het model passend maken met offloading naar host-geheugen

Dezelfde **NVFP4-checkpoint van 132.7 GB** is groter dan het **dedicated geheugen van 96 GB** van de kaart. De offloading-implementatie met pinned memory plaatst de FP8-tabel van 47.7 GiB in het aparte systeem-RAM, zodat de overige modelgewichten op de GPU passen. De host heeft minstens 64 GB vrij nodig voor de pinned toewijzing en reserve; gevraagde rijen bereiken de GPU via PCIe.

Het cookbook rapporteert **8.3 GiB** toegewezen aan de pools van de KV-cache en de recurrente toestand. De geteste configuratie staat 16 lopende verzoeken toe, met een recurrente toestand in BF16 en een aangepast cachebeleid.

| Gelijktijdigheid (C) | TTFT (ms) | TPS per verzoek (tok/s) |
|---|---|---|
| 1 | 139.2 | 155.8 |
| 2 | 195.8 | 120.0 |
| 4 | 220.6 | 90.8 |
| 8 | 252.3 | 63.7 |
| 16 | 257.2 | 43.2 |
| 32 | 3,222.7 | 22.2 |

**Waarom dit nuttig is.** De deployment levert **155.8 tok/s bij C=1** en **43.2 tok/s per verzoek bij C=16**, met een gemiddelde TTFT onder 260 ms over dat hele bereik. Alle geteste niveaus tot en met C=16 halen de standaarddoelen van de Explorer voor latentie en TPS, terwijl een model wordt geserveerd waarvan de volledige checkpoint groter is dan het geheugen van de kaart. Bij C=32 komen verzoeken in de wachtrij achter de 16 lopende slots en stijgt de gemiddelde TTFT tot boven drie seconden; C=32 haalt het standaarddoel voor TTFT daarom niet, ook al blijft de TPS boven 20 tok/s.

Deze waarnemingen gelden voor de gemeten werklast met korte prompts. Langere prompts, uitvoerlengtes en gespreksgeschiedenissen moeten worden beoordeeld aan de hand van de latentiedoelen van de toepassing.

---

## 6. Bespreking

### 6.1. Geheugen versus NVMe wanneer het model al past

De DeepSeek-vergelijking op 8× Spark is nuttig bij de keuze hoe geheugen wordt toegewezen. Beide configuraties serveren hetzelfde model op dezelfde hardware: Engram in het geheugen houden geeft de hogere gemeten TPS, terwijl het verplaatsen naar schijf meer geheugen beschikbaar maakt voor de KV-cache. De keuze hangt ervan af of de toepassing de extra KV-cachecapaciteit genoeg waardeert om het waargenomen snelheidsverschil te accepteren. In de Explorer haalt de configuratie in het geheugen Max C = 4 (naar schatting 16 chat- of 6 agentische gebruikers) en de schijfconfiguratie Max C = 2 (8 chat- of 3 agentische gebruikers). De benchmark met korte prompts gebruikt de extra KV-cache van de schijfconfiguratie niet; die telt bij lange contexten.

### 6.2. Wat offloading mogelijk maakt: vaardigheid, snelheid en capaciteit

De keten is kort. De Engram-tabel verlaat het GPU-geheugen, de rest van het model past, en het apparaat serveert dan een model dat het anders niet zou kunnen bevatten. De [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}) vertaalt het resultaat naar planningstermen:

| Model (Intelligence Index) | Apparaat | Waarom het past | TPS per verzoek bij C=1 | Max C | Geschatte chatgebruikers | Geschatte agentische gebruikers |
|---|---|---|---|---|---|---|
| DeepSeek-V4.1-Flash (39.5) | 4× DGX Spark | ~196.6 GB aan Engram-tabellen op NVMe; de rest van de checkpoint van 510.3 GB is verdeeld over vier nodes van 128 GB | 29.5 tok/s | 2 | 8 | 3 |
| Qwen3.8-Flash-Next (39.8) | 1× DGX Spark | Tabel van 51.2 GB op NVMe; de rest van de checkpoint van 132.7 GB past in de pool van 128 GB | 28.5 tok/s | 2 | 8 | 3 |
| Qwen3.8-Flash-Next (39.8) | 1× RTX PRO 6000 | Tabel van 51.2 GB in systeem-RAM; de rest van de checkpoint van 132.7 GB past op de kaart van 96 GB | 155.8 tok/s | 16 | 64 | 24 |

Met andere woorden: omdat de Engram-tabel kan worden geoffload, draait een model met een Artificial Analysis Intelligence Index van 39.8 op **één DGX Spark met 28.5 tok/s**, genoeg voor naar schatting **8 chatgebruikers of 3 agentische gebruikers**. Op **één RTX PRO 6000** draait hetzelfde model met **155.8 tok/s** en haalt het naar schatting **64 chatgebruikers of 24 agentische gebruikers**. Een 763B-model met een index van 39.5 bedient op **vier DGX Sparks** naar schatting 8 chat- of 3 agentische gebruikers.

Zo leest u deze cijfers:

- **Max C** is de hoogste geteste gelijktijdigheid die aan de standaarddoelen van de Explorer voldoet: minstens 20 tok/s per verzoek en hoogstens 1,000 ms gemiddelde TTFT.
- **Gebruikersaantallen zijn een schatting, geen meting.** De Explorer vermenigvuldigt Max C met een standaard gebruiksfactor: ×4 voor chatgebruikers, die het grootste deel van de tijd lezen en typen (ongeveer een kwart van de tijd loopt er een verzoek), en ×1.5 voor agentische gebruikers, bij wie aan elkaar gekoppelde aanroepen ongeveer twee derde van de tijd een verzoek laten lopen.
- **Deze capaciteiten volgen alleen uit de snelheid.** De geheugenlimiet van de Explorer gaat ervan uit dat de hele checkpoint in het GPU-geheugen staat, en juist dat vermijdt offloading; voor deze runs berekent de Explorer er daarom geen. De eigen verzoeklimieten van de deployments (8 lopende verzoeken op DGX Spark, 16 op RTX PRO 6000) liggen op of boven Max C, dus het geheugen verlaagt de schatting niet.
- **De werklast was kort:** ongeveer 128 invoer- en 128 uitvoertokens. Langere prompts en gespreksgeschiedenissen verhogen de TTFT en verlagen de capaciteit.

*Intelligence Index v4.3, gepubliceerd door [Artificial Analysis](https://artificialanalysis.ai), opgehaald op 28 september 2026 en met bronvermelding overgenomen.* De index beschrijft het model, niet de gekwantiseerde deployment voor een bepaalde taak; beoordeel de geserveerde checkpoint ook op de beoogde taken.

### 6.3. Operationele vereisten

De volgende vereisten komen bovenop de opslag van de gedownloade checkpoint:

| Vereiste | DeepSeek-V4.1-Flash, DGX Spark | Qwen3.8-Flash-Next, DGX Spark | Qwen3.8-Flash-Next, RTX PRO 6000 |
|---|---|---|---|
| Extra opslag voor offloading | Engram-tabellen op de NVMe van elke node | ~51.2 GB (47.7 GiB) voor de tabel, plus vrije ruimte voor het laden | Niets buiten de checkpointbestanden |
| Host-geheugen | Staging-buffers in de gedeelde pool | Paginacache in de gedeelde pool | ≥64 GB vrij voor pinned toewijzing en reserve |
| Opstarten | Een gepatchte loader bereidt de tabellen op NVMe voor | Tabelbestand bij elke start geschreven (10–55 min) | Tabel in het RAM geladen |
| Softwareondersteuning | Vereiste communitypatches op GB10, waaronder het Engram-on-disk-pad | Bestandsgebaseerde offloading vereist de compatibele SGLang-build | Ondersteund in het image van het SGLang-cookbook |

---

## 7. Dimensioneren met Engram-tabellen

### 7.1. Het herziene geheugenbudget

Budgetteer voor ondersteunde modellen met Engram-tabellen het GPU-geheugen en de bestemming voor offloading afzonderlijk:

> **Benodigd GPU-geheugen (of unified memory) = Overige modelgewichten + KV-cache + Pools voor de recurrente toestand + Activaties + Offloadingbuffers en gecachete pagina's + Runtime-overhead**
>
> **Extra systeem-RAM of NVMe-opslag = Geoffloade tabellen + Laadbuffers / marge voor vrije ruimte**

Op Spark gebruikt ook het besturingssysteem unified memory. Gecachete bestandspagina's moeten in dat gedeelde budget worden meegerekend. Op een discrete GPU nemen gepinde tabellen apart systeem-RAM in. Vrijgekomen tabelruimte vertaalt zich daarom niet één-op-één in capaciteit voor verzoeken.

Gebruik het advies over reserve uit de Handleiding voor lokaal LLM-gebruik als planningsmarge en controleer daarna de werkelijke toewijzing en het piekgebruik van de engine. Een geconfigureerde geheugenfractie is niet uitwisselbaar met een vast percentage dat bij de checkpointgrootte wordt opgeteld.

### 7.2. Checklist voor dimensionering

- ☐ Bepaal de overige modelgewichten en de Engram-tabellen van de geserveerde checkpoint afzonderlijk, inclusief hun precisie.
- ☐ Controleer of de engine het model en de bestemming ondersteunt: pinned systeem-RAM of bestandsgebaseerde opslag in de hier onderzochte configuraties.
- ☐ Budgetteer resident caches, buffers en geheugen voor het besturingssysteem, naast de geoffloade tabel.
- ☐ Reserveer pools voor KV en recurrente toestand voor de vereiste context en gelijktijdigheid; controleer de effectieve limieten van de engine.
- ☐ Meet de responssnelheid voor die werklast, waar relevant inclusief opstarten en prestaties met een koude cache.
- ☐ Valideer de modelkwaliteit op de beoogde taken; een externe vaardigheidsscore is slechts een beginpunt.

Een dimensioneringsfout om te vermijden is alle offloading als gelijkwaardig te behandelen. Controleer **welke data wordt verplaatst, hoeveel ervan wordt benaderd en wanneer die er moet zijn** voordat u besluit of een groter model praktisch haalbaar is.

---

## 8. Conclusie en vooruitblik

**Samenvatting van de bevindingen:**

| Vraag | Antwoord |
|---|---|
| Kan de tabel het GPU-geheugen verlaten? | Ja — de tabellen zijn groot, maar elk token haalt slechts enkele kilobytes op, op vooraf bekende adressen |
| Waar gaat het naartoe? | Lokale NVMe op DGX Spark; apart pinned systeem-RAM op RTX PRO 6000 |
| Wat laat de vergelijking op dezelfde hardware zien? | Op 8× Spark rapporteert de schijfconfiguratie ~21 GB meer KV-cachetoewijzing per node, met 7.5% lagere TPS bij C=1 en 14% lagere TPS bij C=8 |
| Wat leveren de kleinere configuraties? | DeepSeek op 4× Spark: 29.5 tok/s bij C=1, naar schatting 8 chat- / 3 agentische gebruikers; Qwen op één Spark: 28.5 tok/s, 8 chat- / 3 agentische gebruikers; Qwen op RTX PRO 6000: 155.8 tok/s bij C=1 en 43.2 tok/s per verzoek bij C=16, 64 chat- / 24 agentische gebruikers |
| Wat levert het op? | Modellen die anders niet passen (763B op 4× DGX Spark, een checkpoint van 132.7 GB op één DGX Spark of RTX PRO 6000), en meer KV-capaciteit (geconfigureerde limiet 300K → 1M op 8× DGX Spark) |
| Wat kost het? | Opstarttijd, NVMe-ruimte of gepind systeem-RAM, en afhankelijkheid van ondersteuning in de engine |

**Vooruitblik.** Sommige recente architecturen scheiden wat berekend moet worden van wat alleen opgeslagen hoeft te worden. Mixture-of-Experts scheidde actieve van totale parameters; Engram-tabellen, zoals gebruikt in de twee hier onderzochte modellen, voegen een grote parameterpool toe waarvan het toegangspatroon past bij tragere geheugenlagen. Of andere modellen het overnemen, valt nog te bezien. Als dat gebeurt en inferentie-engines het ondersteunen, kan dezelfde hardware capabelere modellen draaien door systeem-RAM en opslag te gebruiken voor geschikte componenten. Om dat voordeel te benutten, zijn genoeg GPU-geheugen voor de overige gewichten en de verzoektoestand, efficiënte dataoverdrachten en een aanvaardbare gemeten latentie nodig.

---

## Woordenlijst (termen)

- **Actieve parameters:** Parameters die voor een token worden gebruikt; hun precisie en hergebruik bepalen mede het gewichtsverkeer.
- **Checkpoint:** Opgeslagen modelgewichten en bijbehorende metadata; bestandsgrootte en geheugengebruik tijdens runtime zijn verschillende grootheden.
- **Conditional memory:** De naam die DeepSeek gebruikt voor een Engram-tabel: de tabel is groot, maar een rij wordt alleen gelezen wanneer de invoertokens erom vragen.
- **Decode:** Stapsgewijze generatie van het antwoord; bij kleine batchgroottes vaak begrensd door de geheugenbandbreedte.
- **Embedding:** Een aangeleerde vector die een token of een reeks tokens representeert.
- **Engram:** De embeddingtabelmodule van DeepSeek, gebruikt in DeepSeek-V4.1-Flash.
- **Engram-tabel:** Een opzoektabel met aangeleerde vectoren, geadresseerd via gehashte n-grams van de invoertokens en in geselecteerde lagen gecombineerd met de verborgen toestand.
- **Gated DeltaNet:** Een linear-attention-laag die per verzoek een toestand van vaste grootte bijhoudt in plaats van een groeiende KV-cache.
- **Hash-head:** Een van meerdere onafhankelijke hashfuncties die een n-gram aan een rij van de tabel koppelen.
- **Verborgen toestand (hidden state):** De vectorrepresentatie van een token terwijl het door de lagen van het model gaat.
- **KV-cache:** Gecachete attention-keys en -values; de grootte hangt af van de attention-architectuur, de contextlengte, de precisie en het aantal gelijktijdige verzoeken.
- **Opzoektabel (lookup table):** Een tabel die wordt gelezen door de rijen op te halen die door een sleutel worden geadresseerd; Engram-tabellen worden zo gelezen.
- **Memory-mapped bestand:** Een bestand dat als geheugen toegankelijk is gemaakt; pagina's worden bij de eerste toegang van schijf geladen en in de paginacache bewaard.
- **N-gram:** Een reeks van n opeenvolgende tokens (bigram: 2, trigram: 3).
- **Offloading:** Een deel van de data van een model in een tragere, grotere geheugenlaag plaatsen (systeem-RAM, NVMe) in plaats van in het GPU-geheugen.
- **Paginacache (page cache):** De cache in het geheugen waarin het besturingssysteem recent gelezen bestandspagina's bewaart.
- **Pinned (page-locked) memory:** Host-geheugen dat het besturingssysteem niet mag verplaatsen of naar swap mag wegschrijven, zodat een discrete GPU het rechtstreeks kan lezen.
- **PLE-tabel:** De naam die SGLang gebruikt voor de n-gram-embeddingtabel van Qwen3.8-Flash-Next.
- **Prefetching:** Data ophalen voordat de laag die ze nodig heeft wordt uitgevoerd, zodat de overdracht met rekenwerk kan overlappen.
- **Prefill:** Verwerking van de prompt vóór de generatie van het antwoord; draagt samen met wachtrijtijd en andere overhead bij aan de TTFT.
- **Recurrente toestand (recurrent state):** Toestand van vaste grootte die een linear-attention-laag per reeks bijwerkt; serving kan extra kopieën vereisen voor caching en speculatieve decodering.
- **Totaal aantal parameters:** Alle parameters van het model; ze bepalen de eisen aan de geheugencapaciteit.
- **TPS (tokens per seconde):** Hier: uitvoertokens gedeeld door de totale verzoektijd, inclusief TTFT.
- **TTFT (time to first token):** De tijd van het indienen van een verzoek tot het eerste gestreamde token, inclusief een reasoning-token wanneer dat er is.
- **Unified memory:** Eén geheugenpool die door CPU en GPU wordt gedeeld, zoals in DGX Spark (GB10).

---

## Bronnen

> Hardwarecijfers volgen de NVIDIA-datasheets zoals gebruikt in de Handleiding voor lokaal LLM-gebruik. Architectuurdetails komen uit de modelkaarten, technische rapporten en modelconfiguraties. Inferentieresultaten zijn OpenZeka-metingen in de LLM Inference Benchmark Explorer; geheugentoewijzingen en waarnemingen over het opstarten komen uit de gelinkte deploymentrapporten en het SGLang-cookbook.

**Modellen en architectuur:**

- Modelkaart van DeepSeek-V4.1-Flash — <https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash>
- Technisch rapport van DeepSeek-V4.1-Flash — <https://arxiv.org/abs/2609.19969>
- Conditional Memory via Scalable Lookup: A New Axis of Sparsity for Large Language Models (Engram) — <https://arxiv.org/abs/2601.07372>
- Modelkaart van NVIDIA Qwen3.8-Flash-Next NVFP4, met uitsplitsing van de precisie — <https://huggingface.co/nvidia/Qwen3.8-Flash-Next-NVFP4>
- Modelkaart van Qwen3.8-Flash-Next — <https://huggingface.co/Qwen/Qwen3.8-Flash-Next>
- Technisch rapport van Qwen3.8-Flash-Next — <https://arxiv.org/abs/2608.30320>

**Inferentie-engines en offloading:**

- SGLang-cookbook, Qwen3.8-Flash-Next (geverifieerde configuraties voor één apparaat) — <https://docs.sglang.io/cookbook/autoregressive/Qwen/Qwen3.8-Flash-Next>
- SGLang: bestandsgebaseerde n-gram-tabel op DGX Spark — <https://github.com/sgl-project/sglang/pull/39126>

**Hardware:**

- NVIDIA DGX Spark — <https://www.nvidia.com/en-us/products/workstations/dgx-spark/>
- NVIDIA RTX PRO 6000 Blackwell Workstation Edition — <https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/>
- NVIDIA DGX B300 — <https://www.nvidia.com/en-us/data-center/dgx-b300/>

**Papers en tools van OpenZeka:**

- [Handleiding voor lokaal LLM-gebruik]({{ '/papers/local-llm-guide/' | relative_url }})
- [DeepSeek-V4.1-Flash-deployment op 4× DGX Spark]({{ '/papers/deepseek-v4.1-flash-4spark-deployment/' | relative_url }})
- [DeepSeek-V4.1-Flash-deployment op 8× DGX Spark met TP8]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/' | relative_url }})
- [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }})
- CordatusAI LLM Benchmark Tool — <https://github.com/CordatusAI/llm-benchmark>

**Vaardigheidsscores:**

- Artificial Analysis Intelligence Index — <https://artificialanalysis.ai>

---

### Opmerkingen

- **Metingen:** De snelheidscijfers van de deployments komen uit runs van OpenZeka met de CordatusAI LLM Benchmark Tool (ongeveer 128 invoertokens, tot 128 uitvoertokens, gemiddelde waarden). De opstartconfiguraties van DeepSeek-V4.1-Flash zijn gedocumenteerd in de twee DeepSeek-papers; de runs van Qwen3.8-Flash-Next gebruikten de geverifieerde configuraties voor één apparaat uit het SGLang-cookbook.
- **Schattingen:** Embeddingbytes per token zijn berekend uit de modelconfiguraties; het werkelijke geheugen- en opslagverkeer hangt af van caching en de granulariteit van de overdracht. Groottes van checkpointbestanden zijn geen metingen van het geheugen tijdens runtime.
- **Actualiteit:** De ondersteuning voor offloading in engines ontwikkelt zich snel; de hier beschreven flags en beperkingen zijn geldig per september 2026.

---

{% include company/block.html name="cta_logo" %}

**Laten we samen uw LLM-infrastructuur plannen.** Voor hardwaredimensionering die rekening houdt met modelarchitectuur, geheugenhiërarchie en offloading, {% include company/block.html name="contact_cta" %}
