---
title: Conditional memory en offloading bij LLM-inferentie
parent: White Papers
nav_order: 2
lang: nl
page_id: conditional-memory-offloading
date: 2026-09-29
card_tag: "Technische gids"
description: >-
  Hoe de modelarchitectuur bepaalt wat in het GPU-geheugen moet blijven en wat naar
  systeem-RAM of NVMe kan: conditional memory, de geheugenhiërarchieën van DGX Spark,
  RTX PRO 6000 en DGX B300, en meetresultaten met DeepSeek-V4.1-Flash en
  Qwen3.8-Flash-Next.
permalink: /papers/conditional-memory-offloading/
last_modified_date: 2026-09-29
toc: true
---

> **Publicatiedatum:** september 2026
> **Reikwijdte:** Hoe een LLM tijdens inferentie geheugen gebruikt, welke architectuurkeuzes dat veranderen, hoe de geheugenhiërarchieën van DGX Spark, RTX PRO 6000 en DGX B300 van elkaar verschillen, en wat offloading wel en niet kan bereiken — beoordeeld aan de hand van OpenZeka-metingen van DeepSeek-V4.1-Flash en Qwen3.8-Flash-Next.
> **Opmerking:** Modelnamen, softwareversies en meetresultaten zijn geldig per september 2026. De ondersteuning voor offloading in inferentie-engines verandert snel; de blijvende vraag is hoeveel data elke stap nodig heeft en wanneer die data er moet zijn.

---

{:.no_toc}
## Inhoudsopgave

* TOC
{:toc}

---

## Managementsamenvatting

- **Begin bij het geheugenbudget.** Onze [Handleiding voor lokaal LLM-gebruik]({{ '/papers/yerel-llm-rehberi/' | relative_url }}) behandelt VRAM als de centrale beperking bij de dimensionering. Conditional memory verandert welke modelparameters in het GPU-geheugen moeten blijven.
- **Niet elke parameter wordt bij elk token gelezen.** Sommige recente modellen, waaronder de twee die hier worden onderzocht, voegen toe wat DeepSeek **conditional memory** noemt: grote opzoektabellen (lookup tables) met gehashte n-gram-embeddings (*Engram* in DeepSeek-V4.1-Flash, de *n-gram embedding table* in Qwen3.8-Flash-Next, in SGLang PLE genoemd). Elk token heeft slechts enkele kilobytes aan embeddingdata nodig, en de benodigde rijen zijn vóór de forward pass al uit de token-ID's af te leiden.
- **Opslagbehoefte en geheugenverkeer verschillen.** Grote tabellen leveren per token maar een paar rijen. Kleine overdrachten en prefetching maken offloading met weinig overhead mogelijk, terwijl het herhaaldelijk verplaatsen van actieve gewichtsmatrices of attention-caches veel zwaarder is.
- **Waar de tabel terechtkan, hangt af van het geheugenontwerp van het apparaat.** Op **DGX Spark** (unified memory) zijn systeem-RAM en GPU-geheugen dezelfde pool; de tabel staat daarom op NVMe, met vaak gebruikte pagina's in het RAM gecachet. Op **RTX PRO 6000** (dedicated GPU-geheugen) gaat de tabel via PCIe naar pinned systeem-RAM. Op **DGX B300** heeft de DeepSeek-configuratie met vier GPU's genoeg GPU-geheugen om ook de tabellen te bevatten.
- **Meetresultaten:** de geteste configuratie van het 763B-model DeepSeek-V4.1-Flash draait op 4× DGX Spark doordat de Engram-tabellen van 196B parameters op NVMe worden geplaatst; op 8× DGX Spark verhoogde het verplaatsen ervan naar NVMe de gerapporteerde KV-cachetoewijzing met ~21 GB per node en de geconfigureerde contextlimiet van 300K naar 1M tokens. Qwen3.8-Flash-Next, met een gekwantiseerde checkpoint van 132.7 GB, draait op één DGX Spark en op één RTX PRO 6000, met gemeten prestaties die geschikt zijn voor interactief gebruik bij de hieronder besproken niveaus van gelijktijdigheid (concurrency).
- **Twee praktische uitkomsten.** De twee configuraties op 8× DGX Spark laten de afweging zien tussen Engram in het geheugen houden en Engram op schijf plaatsen. De run op 4× Spark en de Qwen-runs op één apparaat tonen aan dat checkpoints die groter zijn dan het geheugen dat voor modelgewichten beschikbaar is, bruikbaar kunnen worden geserveerd.
- **Gevolg voor de dimensionering:** neem de overige modelgewichten, de KV-cache, de recurrente toestand en de runtimebuffers op in het budget voor GPU-geheugen; neem geoffloade tabellen op in het budget voor systeem-RAM of NVMe. Als meer modellen dit ontwerp overnemen, zou hetzelfde apparaat grotere modellen kunnen draaien dan het GPU-geheugen alleen doet vermoeden.

---

## 1. Inleiding

De [Handleiding voor lokaal LLM-gebruik]({{ '/papers/yerel-llm-rehberi/' | relative_url }}) begint de hardwaredimensionering bij het GPU-geheugen: modelgewichten, KV-cache, recurrente toestand en runtimebuffers moeten erin passen. Conditional memory voegt aan dat budget een nuttig onderscheid toe. Sommige aangeleerde parameters vormen grote tabellen waaruit elk token slechts een paar rijen ophaalt; door die tabellen buiten het GPU-geheugen te houden, kan een model dat eerder te groot was op hetzelfde apparaat praktisch bruikbaar worden.

Deze paper volgt dat onderscheid van **architectuur tot deployment**: waarom attention, experts en embeddings verschillende toegangspatronen hebben; hoe die patronen offloading beïnvloeden; en wat de runs van OpenZeka met DeepSeek-V4.1-Flash en Qwen3.8-Flash-Next op DGX Spark en RTX PRO 6000 aantonen. DGX B300 dient in de hardwarebespreking als voorbeeld van een systeem met gescheiden CPU- en GPU-geheugen.

De nadruk ligt op het mechanisme en de gevolgen ervan voor de dimensionering. Opstartinstructies staan in de gelinkte deploymentpapers en het SGLang-cookbook.

---

## 2. Hoe een LLM geheugen gebruikt

### 2.1. Geheugencapaciteit, bandbreedte en latentie

**Geheugencapaciteit** bepaalt hoeveel data erin past; **geheugenbandbreedte (bandwidth)** bepaalt hoe snel die data gelezen kan worden. Offloading maakt GPU-geheugen vrij door data in systeem-RAM of opslag te plaatsen, die via een tragere verbinding wordt benaderd. Of dat goed werkt, hangt af van het aantal bytes dat elke stap nodig heeft, de latentie (latency) van de toegang en de vraag of het ophalen kan overlappen met nuttig rekenwerk.

Een tabel van 50 GB die per token een paar kilobytes levert, vergt veel minder dataoverdracht dan 50 GB aan matrices die herhaaldelijk in berekeningen worden gebruikt. De opslagbehoefte alleen zegt niets over wat het kost om een van beide uit het GPU-geheugen te halen.

### 2.2. Wat tijdens inferentie geheugen inneemt

Het geheugenbudget uit §4.3 van de Handleiding voor lokaal LLM-gebruik blijft van toepassing:

> **Totaal geheugen = Modelgewichten + KV-cache + Recurrente toestand + Activaties + Overhead**

| Component | Wat het is | Groeit met |
|---|---|---|
| **Modelgewichten** | De parameters: attention-projecties, experts, embeddings, output-head | Modelgrootte en precisie |
| **KV-cache** | Gecachete keys en values, opgeslagen zodat attention-lagen ze niet opnieuw hoeven te berekenen | Contextlengte × gelijktijdige verzoeken |
| **Recurrente toestand** | Geheugen van vaste grootte van linear-attention-lagen (bijv. Gated DeltaNet), plus servingbuffers en bewaarde kopieën | Actieve verzoeken, cachebeleid en instellingen voor speculatieve decodering |
| **Activaties en overhead** | Tijdelijke buffers, CUDA-context, fragmentatie van de allocator | Batch- en promptgroottes, engine-instellingen |

Deze paper voegt één onderscheid aan de tabel toe: **niet alle modelgewichten gedragen zich hetzelfde.** Sommige worden als volledige matrices gebruikt; andere leveren alleen geselecteerde rijen. Sectie 3 legt uit welke welke zijn.

### 2.3. Waarom vaak benaderde data dicht bij de GPU blijft

**Prefill (verwerking van de prompt)** verwerkt de invoertokens; **decode (tokengeneratie)** produceert het antwoord. Bij kleine batchgroottes domineert het lezen van gewichten vaak de decode, waardoor geheugenbandbreedte een bruikbare eerste schatting geeft:

> **Geheugengebonden decodesnelheid (tokens/s) ≈ Effectieve geheugenbandbreedte (bytes/s) ÷ Gelezen bytes per gegenereerd token**

Ook rekenkracht, kerneloverhead, communicatie en de toegang tot KV-cache of recurrente toestand kunnen de snelheid beperken. Batching en speculatieve decodering (speculative decoding) hergebruiken gewichten over meerdere tokens, dus een gewicht wordt niet per se voor elk uitvoertoken opnieuw gelezen.

Door vaak benaderde data in het GPU-geheugen te houden, blijft een tragere overdracht buiten het uitvoeringspad. Uitvoering op de CPU en het streamen van gewichten kunnen grotere modellen aan de praat krijgen, maar de prestaties hangen dan af van de werklast en de implementatie. Conditional memory biedt een andere mogelijkheid: het rekenwerk blijft op de GPU, terwijl een kleine hoeveelheid data wordt opgehaald uit een veel grotere tabel in systeem-RAM of opslag.

---

## 3. Architectuur en geheugentoegang

### 3.1. Standaard attention en MoE: wat wordt er bij elke stap gelezen?

In een Transformer wordt de huidige representatie van een token vermenigvuldigd met aangeleerde matrices om een **query, key en value** te vormen. De query wordt vergeleken met de keys van het huidige en de voorgaande tokens. Na normalisatie bepalen de attention-gewichten hoe hun value-vectoren worden gecombineerd. De uitvoer gaat daarna door verdere projecties en een feed-forward-netwerk.

Dit leidt tot twee verschillende eisen aan het geheugen:

- **Gewichten** worden tijdens de training aangeleerd en over verzoeken heen hergebruikt. Dense projecties en feed-forward-lagen gebruiken bij elke forward-stap grote matrices.
- **KV-cache** bevat de keys en values die voor het huidige gesprek zijn berekend. Volledige attention raadpleegt bij elke decodestap de voorgaande context, dus dit verkeer groeit met de contextlengte.

Voor snelle uitvoering op de GPU worden deze vaak benaderde matrices en actieve caches normaal gesproken in het GPU-geheugen gehouden. Ze offloaden kan, maar herhaalde overdrachten kunnen de inferentielatentie gaan domineren.

**Mixture-of-Experts (MoE)** verandert het feed-forward-deel: een router kiest voor elk token een paar expertnetwerken. Het totale aantal parameters bepaalt de opslagbehoefte, terwijl de gekozen experts een groot deel van het gewichtsverkeer bepalen. Dat vermindert het rekenwerk, maar een expert kiezen betekent nog steeds dat zijn matrices worden gebruikt. Een aangeleerde router kiest experts op basis van de huidige verborgen toestand (hidden state), dus de keuze is pas tijdens de forward pass bekend. Caching en prefetching van experts kunnen helpen, maar een cache-miss is veel duurder dan het ophalen van een paar embeddingrijen.

### 3.2. Attention-architecturen die de geheugenbehoefte verkleinen

Verschillende architectuurwijzigingen verkleinen de cache of de hoeveelheid die ervan wordt gelezen:

| Architectuur | Wat verandert | Gevolg voor de plaatsing in het geheugen |
|---|---|---|
| **Grouped-query attention (GQA)** | Meerdere query-heads delen keys en values | Kleinere KV-cache; de actieve cache wordt tijdens decode nog steeds geraadpleegd |
| **Gecomprimeerde / sparse attention** | Slaat gecomprimeerde representaties op of selecteert een deelverzameling van posities | Minder opslag of minder leesacties; selectie en cache-indeling bepalen de overdrachtskosten |
| **Linear-attention-hybrides** | Sommige lagen werken een recurrente toestand van vaste grootte bij in plaats van voor elk token een key en value te bewaren | Minder contextafhankelijke opslag; de toestand moet nog steeds bij elke stap worden gelezen en bijgewerkt |

Qwen3.8-Flash-Next gebruikt bijvoorbeeld Gated DeltaNet in drie van elke vier lagen en sparse attention in de overige lagen. DeepSeek-V4.1-Flash comprimeert en deelt attention-caches. Deze wijzigingen laten meer ruimte voor verzoeken, maar maken de resterende toestand op zichzelf niet goedkoop om te offloaden.

**Conditional memory is een extra component naast deze lagen.** Het voordeel bij offloading komt voort uit het hierna beschreven opzoekpatroon; het vereist niet dat attention-berekeningen van de GPU worden gehaald.

### 3.3. Conditional memory: van token-ID's naar aangeleerde vectoren

Een **embedding** is een aangeleerde vector van getallen. Een gewone input-embeddingtabel koppelt elk token-ID aan een rij. Conditional memory breidt dat idee uit naar korte reeksen tokens, of **n-grams**, en levert zo aangeleerde informatie over lokale tokencombinaties naast de representatie die het netwerk berekent.

De term werd door DeepSeek geïntroduceerd in de [Engram-paper](https://arxiv.org/abs/2601.07372) en is nog geen algemene naam voor de techniek: Qwen beschrijft zijn versie als n-gram-embeddings, en SGLang noemt de tabel PLE. Deze paper gebruikt voor beide *conditional memory*.

Het opzoeken en de berekening die het resultaat gebruikt, zijn afzonderlijke bewerkingen:

1. **Vorm de sleutel.** Neem de recente token-ID's: twee voor een bigram, drie voor een trigram. De ID's `[a, b, c]` geven bijvoorbeeld de suffixen `[b, c]` en `[a, b, c]`. Een token kan een woord zijn, een deel van een woord of een ander tekstfragment.
2. **Hash naar tabellen.** Elke hash-head zet die korte reeks om in een rijadres. Meerdere heads leveren meerdere aangeleerde vectoren, ook wanneer twee reeksen in één tabel botsen. Zoeken door alle rijen is niet nodig.
3. **Haal de embeddings op.** Lees de geadresseerde rijen en voeg ze aaneen. De tabel is aangeleerde modeldata, vast tijdens inferentie; het is geen gesprekscache of documentdatabase.
4. **Combineer met de verborgen toestand.** Projecties transformeren de opgehaalde vector; een gate die uit de huidige verborgen toestand wordt berekend, bepaalt hoe sterk die bijdraagt. Dezelfde opgehaalde rijen kunnen daardoor in verschillende contexten verschillend bijdragen. Deze berekening blijft op de GPU; de grote tabel kan elders staan.

Deze scheiding tussen het opzoeken van embeddings en contextafhankelijke gating wordt beschreven in de [Engram-architectuur](https://arxiv.org/html/2601.07372v2#S2). Het [n-gram-embeddingontwerp](https://arxiv.org/html/2608.30320#S2.SS3) van Qwen volgt in grote lijnen dezelfde aanpak.

**Voorbeeld — Qwen3.8-Flash-Next.** Elke invoerpositie leest zestien rijen (bigrams en trigrams, elk met acht hash-heads) van 160 FP8-waarden van één byte: ongeveer **2.5 KB**, uit een tabel van ongeveer **47.7 GiB**. Rijen aan de tabel toevoegen voegt aangeleerde parameters toe zonder het aantal leesacties per token te verhogen.

**Waarom prefetching mogelijk is.** Rijadressen hangen af van token-ID's, en die zijn vóór de forward pass beschikbaar. Een engine kan beginnen met het ophalen van rijen terwijl voorgaande GPU-lagen worden uitgevoerd. Bij gewone decode geldt dit voor het huidige, bekende token, niet voor onbekende toekomstige uitvoer. Tijdens prefill zijn alle prompt-ID's al beschikbaar. Plaatsing na de eerste lagen schept tijd waarin het ophalen kan overlappen met rekenwerk; of die overlap volstaat, hangt af van de engine en de geheugenlaag.

Gewone input-embeddings gebruiken ook rij-opzoekingen. Door de grote omvang van conditional-memorytabellen is het offloaden ervan bijzonder nuttig om de behoefte aan GPU-geheugen te verkleinen. Als input-embeddings hun gewichten delen met de uitvoerlaag, gebruikt die laag de tabel ook om scores voor het vocabulaire te berekenen; de geheugentoegang is daar dus anders dan bij een input-opzoeking.

### 3.4. Vergelijking: wat maakt offloading praktisch?

| Data | Toegangspatroon | Gevolg voor offloading |
|---|---|---|
| **Dense projecties en feed-forward-gewichten** | Grote matrixleesacties bij elke forward-stap | Het streamen van gewichten kan de overdrachtsverbinding op het kritieke pad plaatsen |
| **MoE-experts** | Alleen geselecteerde matrices, waarbij de selectie meestal van verborgen toestanden afhangt | Kleinere actieve set, maar dure misses en de selectie is minder ver vooraf bekend |
| **Actieve KV-cache** | Contextafhankelijke leesacties; volledige attention raadpleegt de voorgaande context | Lange contexten kunnen aanzienlijk overdrachtsverkeer veroorzaken |
| **Recurrente toestand** | Bij elke stap gelezen en bijgewerkt | Herhaalde lees- en schrijfacties kunnen overdrachtsoverhead veroorzaken |
| **Conditional-memorytabellen** | Een paar rijen, geadresseerd vanuit token-ID's | Kleine overdrachten en voorspelbare adressen maken prefetching mogelijk dat met rekenwerk overlapt |

> **Praktische conclusie:** Grote tabellen, kleine overdrachten en genoeg tijd om ze op te halen maken een component tot een goede kandidaat voor offloading. Conditional memory combineert kleine overdrachten met adressen die bekend zijn voordat de laag wordt uitgevoerd. Offloading van attention en experts vraagt om andere afwegingen.

---

## 4. De geheugenhiërarchie van de apparaten

### 4.1. Geheugenlagen

| Laag | Typische capaciteit | Toegangskenmerk |
|---|---|---|
| **GPU-geheugen** (HBM, GDDR, unified LPDDR) | Tientallen tot honderden GB per apparaat | Hoge bandbreedte voor herhaalde matrix- en cacheleesacties |
| **Systeem-RAM** op een systeem met discrete GPU | Honderden GB tot TB's | PCIe Gen5 x16 biedt theoretisch ongeveer 64 GB/s per richting, vóór protocol- en softwareoverhead |
| **Lokale NVMe** | Enkele TB | Grotere capaciteit; willekeurige toegang en page faults kosten meer dan leesacties uit resident geheugen |

De overdrachtstijd is ruwweg **bytes ÷ bandbreedte**, plus latentie en softwareoverhead; alleen het deel dat niet achter rekenwerk verborgen blijft, vertraagt het model. Bij kleine, verspreide leesacties kunnen latentie en caching zwaarder wegen dan de piekbandbreedte.

### 4.2. Unified memory versus dedicated GPU-geheugen

De geheugenarchitectuur bepaalt welke bestemming voor offloading daadwerkelijk GPU-geheugen vrijmaakt.

**Dedicated GPU-geheugen (RTX PRO 6000, DGX B300).** De GPU heeft zijn eigen geheugen; de CPU heeft apart systeem-RAM, dat via PCIe bereikbaar is. Een tabel van het GPU-geheugen naar systeem-RAM verplaatsen maakt GPU-geheugen vrij. De hier gebruikte offloading-implementatie plaatst de tabel in **pinned (page-locked) host-geheugen**, zodat de GPU rijen rechtstreeks kan verzamelen zonder dat het besturingssysteem die pagina's naar swap wegschrijft.

**Unified memory (DGX Spark).** De CPU en GPU van de GB10-chip delen één pool van 128 GB LPDDR5X, met cachecoherente toegang vanuit beide processors. Er is geen apart systeem-RAM: de tabel als CPU-geheugen toewijzen vermindert het gebruik van de gedeelde pool niet, en een tabel die in host-geheugen is gepind, verbruikt nog steeds dezelfde 128 GB. De bestandsgebaseerde implementatie maakt gebruik van de toegang van GB10 tot pageable geheugen via de paginatabellen van de host. De tabel staat op lokale NVMe; opgehaalde pagina's nemen zolang ze gecachet zijn nog steeds unified memory in. Slechts een deel van de tabel hoeft tegelijk in het RAM te blijven.

### 4.3. Vergelijking van de apparaten

| | DGX Spark (GB10) | RTX PRO 6000 Blackwell | DGX B300 |
|---|---|---|---|
| Geheugenontwerp | Pool van 128 GB, gedeeld door CPU en GPU | 96 GB dedicated GPU-geheugen, apart systeem-RAM | Acht GPU's met dedicated HBM, apart systeem-RAM |
| Bandbreedte van het GPU-geheugen | 273 GB/s | 1.79 TB/s | 8 TB/s per GPU |
| Locatie van de tabel | Lokale NVMe met een paginacache in het geheugen | Pinned systeem-RAM via PCIe | In het GPU-geheugen opgeslagen in de DeepSeek-configuratie met vier GPU's |
| Gevolg voor de dimensionering | Houd in de gedeelde pool rekening met besturingssysteem, paginacache en runtime | Budgetteer systeem-RAM los van GPU-geheugen | Voldoende GPU-geheugen voor deze checkpoints in configuraties met meerdere GPU's |

### 4.4. Waarom offloading van conditional memory weinig overhead kan hebben

Het overdragen van gigabytes aan actieve gewichten per stap kan een groot deel van de beschikbare PCIe-bandbreedte opslokken. De ~2.5 KB aan embeddingdata per tokenpositie van Qwen vergt veel minder overdrachtsbandbreedte. De adressen kunnen bovendien worden voorbereid vóór de laag die de embeddings gebruikt, zodat een asynchrone ophaalactie kan afronden terwijl andere lagen draaien.

Dat is de architecturale reden waarom **een grote tabel tegen lage kosten kan worden geoffload**. Het vereist wel een implementatie die het toegangspatroon benut. Systeem-RAM en NVMe zijn bovendien verschillende gevallen: een bestandsgebaseerde tabel kan een treffer in de paginacache opleveren of op de opslag moeten wachten. Paginaleesacties kunnen veel groter zijn dan de gevraagde rijen, en prefill, batching en speculatieve verificatie vermenigvuldigen het aantal posities dat wordt opgezocht.

**Aanwijzingen dat het mechanisme kan werken.** In het H800-experiment uit de Engram-paper verlaagde het toevoegen van een in host-geheugen geplaatste tabel van 100B parameters aan dense backbones van 4B en 8B de doorvoer (throughput) met ongeveer 1.9% en 2.8%, ten opzichte van hun respectievelijke baselines zonder Engram. De implementatie liet het ophalen overlappen met het eerste blok. Het resultaat geldt voor die implementatie met host-geheugen en die werklast ([Engram, §6.4](https://arxiv.org/html/2601.07372v2#S6.SS4)).

Een tabel offloaden zonder de waarden ervan te veranderen, behoudt de aangeleerde informatie: dezelfde rijen worden aan de GPU geleverd. De praktische vraag is of ze op tijd aankomen. Sectie 6 laat de keuzes zien die daaruit voor deployment volgen: een vergelijking tussen geheugen en NVMe op 8× DGX Spark, en bruikbare inferentie vanuit checkpoints die anders te groot zouden zijn, op kleinere configuraties.

---

## 5. De onderzochte modellen

### 5.1. DeepSeek-V4.1-Flash

| Eigenschap | Waarde |
|---|---|
| Totaal aantal parameters | 763B |
| — backbone | 552B |
| — Engram conditional memory | 196B |
| — vision-encoder, projector, draftmodel | ~15B |
| Actieve parameters per token | ~16B bij decode (~8B bij prefill) |
| Attention | Gecomprimeerde sparse attention met een sliding window van 128 tokens; KV-cache gedeeld over lagen |
| Engram | Laagindices 1 en 14 (vanaf nul geteld); bigrams, trigrams en 4-grams; 8 hash-heads per n-gram-orde; 256 waarden per rij |
| Maximale contextlengte | 1,048,576 tokens (ongeveer 1M) |
| Grootte van de checkpoint | 510.3 GB; gemengde precisie, waaronder FP8 voor dense en Engram-gewichten en FP4 voor experts |

De [modelkaart](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash) onderscheidt de backbone van 552B van Engram en de hulpmodules.

### 5.2. Qwen3.8-Flash-Next

| Eigenschap | Waarde |
|---|---|
| Parameters | 125B basismodel + 51B n-gram-embeddings + 4B module voor multi-token prediction (MTP) |
| Actieve parameters per token | 6B |
| Attention | 36 Gated DeltaNet-lagen en 12 Qwen Sparse Attention-lagen (QSA); QSA selecteert tot 512 blokken van vier tokens plus het laatste onvolledige blok |
| N-gram-tabel | Laagindex 2 (vanaf nul geteld); bigrams en trigrams; elk 8 hash-heads; 16 rijen van 160 waarden vormen een vector met 2,560 dimensies |
| Geconfigureerde contextlimiet | 262,144 tokens |
| Geserveerde checkpoint | `nvidia/Qwen3.8-Flash-Next-NVFP4`; 132.7 GB (123.6 GiB) aan safetensors-bestanden |
| Precisie van de gewichten | NVFP4 voor de gerouteerde experts in het hoofdmodel; BF16 voor attention en gedeelde experts; FP8 voor de gerouteerde MTP-experts en de n-gram-tabel |

### 5.3. Modelgrootte en geheugenbehoefte

| Model | Grootte van de checkpoint | Conditional-memorytabel | Rest van de checkpoint | Configuraties die hier offloading van de tabel vereisen |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 510.3 GB | ~196.6 GB | ~313.7 GB | 4× DGX Spark |
| Qwen3.8-Flash-Next, NVIDIA NVFP4 | 132.7 GB | ~51.2 GB (47.7 GiB) | ~81.5 GB | 1× DGX Spark; 1× RTX PRO 6000 |

GB betekent 10⁹ bytes en GiB 2³⁰ bytes. De checkpointgroottes zijn de totalen van de safetensors-bestanden bij de vastgelegde revisies (voor Qwen de [checkpointbestanden van NVIDIA](https://huggingface.co/nvidia/Qwen3.8-Flash-Next-NVFP4/tree/fc694b54fb0174e0913e6adf86691ef85a4ead47)). De resterende grootte is een aftreksom, geen meting van het GPU-geheugen na het laden; cijfers over het geheugen tijdens runtime staan in Sectie 6.

Offloading verplaatst de tabel naar een andere geheugenlaag; ze blijft deel van het model. De kleinere configuraties kunnen dan de overige gewichten bevatten, samen met het geheugen dat voor inferentie nodig is.

---

## 6. Benchmarkresultaten

### 6.1. Methodologie

De onderstaande deploymentresultaten zijn OpenZeka-metingen, uitgevoerd met de open-source [CordatusAI LLM Benchmark Tool](https://github.com/CordatusAI/llm-benchmark), met ongeveer 128 invoertokens en een uitvoerlimiet van 128 tokens, tien rondes per niveau van gelijktijdigheid, waarbij gemiddelde waarden worden gerapporteerd. **Gelijktijdigheid (C)** is het aantal gelijktijdige verzoeken. **TTFT (time to first token)** omvat wachtrijtijd en promptverwerking; ook het eerste reasoning-token telt mee wanneer het wordt gestreamd. **TPS (tokens per seconde)** is het aantal uitvoertokens gedeeld door de totale verzoektijd, inclusief TTFT. Het wordt per verzoek gerapporteerd, niet als geaggregeerde doorvoer. Alle resultaten zijn ook beschikbaar in de [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}).

| Run | Hardware | Engine, tensorparallellisme (TP) | Speculatieve decodering | Conditional memory |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 4× DGX Spark | vLLM, TP=4 | DSpark, k=5 | NVMe |
| DeepSeek-V4.1-Flash, 300K | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | In het geheugen |
| DeepSeek-V4.1-Flash, 1M | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | NVMe |
| Qwen3.8-Flash-Next | 1× DGX Spark | SGLang, TP=1 | MTP, 3 speculatieve stappen / 4 drafttokens | NVMe |
| Qwen3.8-Flash-Next | 1× RTX PRO 6000 | SGLang, TP=1 | MTP, 3 speculatieve stappen / 4 drafttokens | Pinned systeem-RAM |

De **twee DeepSeek-configuraties op 8× DGX Spark** vergelijken de plaatsing van de tabel op dezelfde hardware. De andere runs beantwoorden een andere dimensioneringsvraag: welke inferentieprestaties levert de configuratie zodra het model met offloading past? Hun resultaten worden hieronder afzonderlijk beoordeeld.

### 6.2. DeepSeek-V4.1-Flash op 4× DGX Spark: het model passend maken met Engram-on-disk

Verdeeld over vier nodes heeft de volledige checkpoint van 510 GB ongeveer 128 GB per node nodig — meer dan een DGX Spark aan het model kan geven zodra het besturingssysteem, de CUDA-context en de KV-cache zijn meegerekend. Met **Engram-on-disk** bewaart elke node zijn deel van de Engram-rijen op lokale NVMe en zet hij de rijen die elke stap nodig heeft vóór de forward pass klaar in het GPU-geheugen. De overige gewichten kunnen dan worden geladen, met de volgende benchmarkresultaten:

| Gelijktijdigheid (C) | TTFT (ms) | TPS per verzoek (tok/s) |
|---|---|---|
| 1 | 271.6 | 29.5 |
| 2 | 395.8 | 21.3 |
| 4 | 577.4 | 13.1 |
| 8 | 805.9 | 8.8 |

**Waarom dit nuttig is.** Een model met 763B parameters draait verdeeld over vier desktopapparaten met **29.5 tok/s per verzoek en 272 ms TTFT bij C=1**. Bij C=2 houdt het **21.3 tok/s en 396 ms TTFT** vast en haalt het daarmee de standaarddoelen van de Explorer: minstens 20 tok/s en hoogstens 1,000 ms TTFT. Hogere gelijktijdigheid blijft mogelijk, met 13.1 tok/s bij C=4 en 8.8 tok/s bij C=8, maar met tragere antwoorden. Voor deze werklast ondersteunt de configuratie interactief gebruik bij lage gelijktijdigheid.

### 6.3. DeepSeek-V4.1-Flash op 8× DGX Spark: de tabel in het geheugen versus op NVMe

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

### 6.4. Qwen3.8-Flash-Next op één DGX Spark: een checkpoint van 132.7 GB passend maken

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

### 6.5. Qwen3.8-Flash-Next op één RTX PRO 6000: het model passend maken met offloading naar host-geheugen

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

## 7. Bespreking

### 7.1. Geheugen versus NVMe wanneer het model al past

De DeepSeek-vergelijking op 8× Spark is nuttig bij de keuze hoe geheugen wordt toegewezen. Beide configuraties serveren hetzelfde model op dezelfde hardware: Engram in het geheugen houden geeft de hogere gemeten TPS, terwijl het verplaatsen naar schijf meer geheugen beschikbaar maakt voor de KV-cache. De keuze hangt ervan af of de toepassing de extra KV-cachecapaciteit genoeg waardeert om het waargenomen snelheidsverschil te accepteren.

### 7.2. Modellen draaien die groter zijn dan het GPU-geheugen

De DeepSeek-run op 4× Spark en de Qwen-runs op één apparaat laten een ander voordeel zien: hun checkpoints en geheugenbehoefte tijdens runtime zijn groter dan het beschikbare geheugen, maar het offloaden van de opzoektabellen maakt inferentie met bruikbare snelheden per verzoek mogelijk. De afzonderlijke resultaten in Sectie 6 tonen zowel de ervaring bij één verzoek als wat er gebeurt wanneer de gelijktijdigheid stijgt.

Voor planning per werklast biedt de [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}) de gemeten TTFT/TPS-curves en een toetsing aan doelen voor TTFT en TPS. De capaciteitsschattingen daarin zijn hulpmiddelen voor planning; controleer of een schatting rekening houdt met de werkelijke plaatsing van de tabel en de toestandspools voordat u haar op een run met offloading toepast. Gebruik de gemeten gelijktijdigheidsreeks om doelen voor latentie en TPS te controleren; valideer de geheugencapaciteit voor de offloadingconfiguratie afzonderlijk.

### 7.3. Modelvaardigheid

Qwen3.8-Flash-Next heeft volgens de vastgelegde gegevens van de Explorer een **Artificial Analysis Intelligence Index van 39.8**. Deze externe benchmarkscore biedt context voor de modelkeuze, naast de gemeten inferentieprestaties. Ze beschrijft het model; ze valideert niet de gekwantiseerde deployment voor een bepaalde taak.

*Intelligence Index v4.3, gepubliceerd door [Artificial Analysis](https://artificialanalysis.ai), opgehaald op 28 september 2026 en met bronvermelding overgenomen.*

Beoordeel de geserveerde checkpoint op de beoogde taken, naast de responssnelheid. De praktische winst is toegang tot een capabel model met prestaties die op het beschikbare apparaat aan de eisen van de toepassing voldoen.

### 7.4. Operationele vereisten

De volgende vereisten komen bovenop de opslag van de gedownloade checkpoint:

| Vereiste | DeepSeek-V4.1-Flash, DGX Spark | Qwen3.8-Flash-Next, DGX Spark | Qwen3.8-Flash-Next, RTX PRO 6000 |
|---|---|---|---|
| Extra opslag voor offloading | Engram-tabellen op de NVMe van elke node | ~51.2 GB (47.7 GiB) voor de tabel, plus vrije ruimte voor het laden | Niets buiten de checkpointbestanden |
| Host-geheugen | Staging-buffers in de gedeelde pool | Paginacache in de gedeelde pool | ≥64 GB vrij voor pinned toewijzing en reserve |
| Opstarten | Een gepatchte loader bereidt de tabellen op NVMe voor | Tabelbestand bij elke start geschreven (10–55 min) | Tabel in het RAM geladen |
| Softwareondersteuning | Vereiste communitypatches op GB10, waaronder het Engram-on-disk-pad | Bestandsgebaseerde offloading vereist de compatibele SGLang-build | Ondersteund in het image van het SGLang-cookbook |

---

## 8. Dimensioneren met conditional memory

### 8.1. Het herziene geheugenbudget

Budgetteer voor ondersteunde conditional-memorymodellen het GPU-geheugen en de bestemming voor offloading afzonderlijk:

> **Benodigd GPU-geheugen (of unified memory) = Overige modelgewichten + KV-cache + Pools voor de recurrente toestand + Activaties + Offloadingbuffers en gecachete pagina's + Runtime-overhead**
>
> **Extra systeem-RAM of NVMe-opslag = Geoffloade tabellen + Laadbuffers / marge voor vrije ruimte**

Op Spark gebruikt ook het besturingssysteem unified memory. Gecachete bestandspagina's moeten in dat gedeelde budget worden meegerekend. Op een discrete GPU nemen gepinde tabellen apart systeem-RAM in. Vrijgekomen tabelruimte vertaalt zich daarom niet één-op-één in capaciteit voor verzoeken.

Gebruik het advies over reserve uit de Handleiding voor lokaal LLM-gebruik als planningsmarge en controleer daarna de werkelijke toewijzing en het piekgebruik van de engine. Een geconfigureerde geheugenfractie is niet uitwisselbaar met een vast percentage dat bij de checkpointgrootte wordt opgeteld.

### 8.2. Checklist voor dimensionering

- ☐ Bepaal de overige modelgewichten en de conditional-memorytabellen van de geserveerde checkpoint afzonderlijk, inclusief hun precisie.
- ☐ Controleer of de engine het model en de bestemming ondersteunt: pinned systeem-RAM of bestandsgebaseerde opslag in de hier onderzochte configuraties.
- ☐ Budgetteer resident caches, buffers en geheugen voor het besturingssysteem, naast de geoffloade tabel.
- ☐ Reserveer pools voor KV en recurrente toestand voor de vereiste context en gelijktijdigheid; controleer de effectieve limieten van de engine.
- ☐ Meet de responssnelheid voor die werklast, waar relevant inclusief opstarten en prestaties met een koude cache.
- ☐ Valideer de modelkwaliteit op de beoogde taken; een externe vaardigheidsscore is slechts een beginpunt.

Een dimensioneringsfout om te vermijden is alle offloading als gelijkwaardig te behandelen. Controleer **welke data wordt verplaatst, hoeveel ervan wordt benaderd en wanneer die er moet zijn** voordat u besluit of een groter model praktisch haalbaar is.

---

## 9. Conclusie en vooruitblik

**Samenvatting van de bevindingen:**

| Vraag | Antwoord |
|---|---|
| Kan conditional memory het GPU-geheugen verlaten? | Ja — de tabellen zijn groot, maar elk token haalt slechts enkele kilobytes op, op vooraf bekende adressen |
| Waar gaat het naartoe? | Lokale NVMe op DGX Spark; apart pinned systeem-RAM op RTX PRO 6000 |
| Wat laat de vergelijking op dezelfde hardware zien? | Op 8× Spark rapporteert de schijfconfiguratie ~21 GB meer KV-cachetoewijzing per node, met 7.5% lagere TPS bij C=1 en 14% lagere TPS bij C=8 |
| Welke prestaties halen de kleinere configuraties? | DeepSeek op 4× Spark: 29.5 tok/s bij C=1; Qwen op één Spark: 28.5 tok/s bij C=1; Qwen op RTX PRO 6000: 43.2 tok/s per verzoek bij C=16 |
| Wat levert het op? | Modellen die anders niet passen (763B op 4× DGX Spark, een checkpoint van 132.7 GB op één DGX Spark of RTX PRO 6000), en meer KV-capaciteit (geconfigureerde limiet 300K → 1M op 8× DGX Spark) |
| Wat kost het? | Opstarttijd, NVMe-ruimte of gepind systeem-RAM, en afhankelijkheid van ondersteuning in de engine |

**Vooruitblik.** Sommige recente architecturen scheiden wat berekend moet worden van wat alleen opgeslagen hoeft te worden. Mixture-of-Experts scheidde actieve van totale parameters; conditional memory, zoals gebruikt in de twee hier onderzochte modellen, voegt een grote parameterpool toe waarvan het toegangspatroon past bij tragere geheugenlagen. Of andere modellen het overnemen, valt nog te bezien. Als dat gebeurt en inferentie-engines het ondersteunen, kan dezelfde hardware capabelere modellen draaien door systeem-RAM en opslag te gebruiken voor geschikte componenten. Om dat voordeel te benutten, zijn genoeg GPU-geheugen voor de overige gewichten en de verzoektoestand, efficiënte dataoverdrachten en een aanvaardbare gemeten latentie nodig.

---

## Woordenlijst (termen)

- **Actieve parameters:** Parameters die voor een token worden gebruikt; hun precisie en hergebruik bepalen mede het gewichtsverkeer.
- **Checkpoint:** Opgeslagen modelgewichten en bijbehorende metadata; bestandsgrootte en geheugengebruik tijdens runtime zijn verschillende grootheden.
- **Conditional memory:** Een opzoektabel met aangeleerde vectoren, geadresseerd via gehashte n-grams van de invoertokens en in geselecteerde lagen gecombineerd met de verborgen toestand. De term werd geïntroduceerd in de Engram-paper van DeepSeek.
- **Decode:** Stapsgewijze generatie van het antwoord; bij kleine batchgroottes vaak begrensd door de geheugenbandbreedte.
- **Embedding:** Een aangeleerde vector die een token of een reeks tokens representeert.
- **Engram:** De conditional-memorymodule van DeepSeek, gebruikt in DeepSeek-V4.1-Flash.
- **Gated DeltaNet:** Een linear-attention-laag die per verzoek een toestand van vaste grootte bijhoudt in plaats van een groeiende KV-cache.
- **Hash-head:** Een van meerdere onafhankelijke hashfuncties die een n-gram aan een rij van de tabel koppelen.
- **Verborgen toestand (hidden state):** De vectorrepresentatie van een token terwijl het door de lagen van het model gaat.
- **KV-cache:** Gecachete attention-keys en -values; de grootte hangt af van de attention-architectuur, de contextlengte, de precisie en het aantal gelijktijdige verzoeken.
- **Opzoektabel (lookup table):** Een tabel die wordt gelezen door de rijen op te halen die door een sleutel worden geadresseerd; conditional-memorytabellen worden zo gelezen.
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

- [Handleiding voor lokaal LLM-gebruik]({{ '/papers/yerel-llm-rehberi/' | relative_url }})
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
