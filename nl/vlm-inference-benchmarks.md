---
title: VLM Inference Benchmark Explorer
nav_order: 6
lang: nl
page_id: vlm-inference-benchmarks
date: 2026-10-06 12:00:00 +0300
card_tag: "VLM-benchmark"
description: >-
  Verken inferentiebenchmarks van vision-languagemodellen op RTX PRO 6000
  Blackwell, Jetson AGX Orin en Jetson Orin NX. Kies het beeldformaat, stel in
  hoe lang een camera op zijn antwoord mag wachten, en zie hoeveel camera's elke
  configuratie bijhoudt.
permalink: /vlm-inference-benchmarks/
last_modified_date: 2026-10-06
toc: false
---

# VLM Inference Benchmark Explorer

Hoeveel camera's kan dit apparaat met dit vision-languagemodel volgen? Kies het
beeldformaat dat uw camera's sturen en stel in hoe lang een camera op zijn
antwoord mag wachten; de tabel wordt bijgewerkt voor elke configuratie die we
hebben gemeten. Open een rij om de metingen voor elk aantal camera's, de
toelichting op de resultaten en een grafiek te zien.

<details class="bt-howto">
<summary>Hoe u de benchmark-explorer gebruikt</summary>
<div class="bt-howto-body" markdown="1">

### Wat een rij is

Een rij is één **deploymentconfiguratie**: een vision-languagemodel, op
specifieke hardware, in een specifiek getalformaat, geserveerd door een
specifieke engine, van begin tot eind gemeten. Hetzelfde model staat daarom in
meerdere rijen, en twee rijen zijn pas direct vergelijkbaar als u weet welke van
die instellingen tussen hen verschillen.

### Filters en het doel hebben een andere taak

**Filters bepalen welke rijen u ziet.** De filters voor apparaat, model, aantal
parameters, kwantisatie en engine, en de schuifregelaars voor responstijd en
camera's, tonen of verbergen alleen rijen.

**Het doel en de aanname bepalen wat de getallen zeggen.** Ze staan onder
*Prestatiedoel en aannames*. Als u er een wijzigt, blijven de rijen staan, maar
worden de responstijd, Max. camera's en de groene en rode kleuring van elke rij
opnieuw berekend.

### 1. Beschrijf uw camera's

Twee keuzeknoppen beschrijven de workload, en elk getal in de tabel wordt bij
die keuzes afgelezen:

- **Beeldformaat** — het formaat van elk beeld dat een camera stuurt: 480p,
  720p, 1080p of 2K.
- **Camera's** — hoeveel camera's op hetzelfde moment verzoeken sturen. Dit is
  de gelijktijdigheid (concurrency) waarbij het systeem is gemeten.

Rijen die bij de gekozen combinatie niet zijn gemeten, worden verborgen, en
gedimde knoppen markeren combinaties zonder meting. Meerdere camera's zijn
gemeten bij 480p, 720p en 1080p; 2K alleen met één camera.

### 2. Verfijnen en sorteren

Filters werken samen en elke kolom is sorteerbaar. De leerzaamste vergelijkingen
veranderen één instelling: één model in twee kwantisaties op één apparaat,
hetzelfde model onder llama.cpp en vLLM, of één model op twee apparaten.

### 3. Stel uw doel in

Het doel is **hoe lang een camera maximaal mag wachten tot zijn antwoord
begint** — standaard 3 seconden. Een responstijd die precies op het doel ligt,
slaagt.

Ernaast bepaalt **Beelden per camera** hoeveel beelden elk verzoek meestuurt:
standaard één momentopname, of meerdere frames van dezelfde camera samen, zoals
video vaak naar een vision-languagemodel wordt gestuurd. Meerdere beelden per
verzoek zijn alleen met één camera gemeten, dus met drie of vijf beelden kan
Max. camera's niet hoger zijn dan 1.

### 4. Lees Max. camera's af

**Max. camera's** is het hoogste gemeten aantal camera's waarbij het antwoord van
elke camera binnen uw doel begint en geen verzoek mislukte. Een plus —
**16+** — betekent dat de configuratie het doel haalde, zelfs bij het hoogste
aantal waarmee ze is getest, dus het werkelijke maximum is niet bereikt. 0
betekent dat zelfs één camera niet op tijd antwoord krijgt.

### 5. Open een rij

Klik op een rij om het volgende te zien:

- links, de metingen bij uw beeldformaat en aantal beelden voor elk getest
  aantal camera's, gemarkeerd als PASS of FAIL ten opzichte van uw doel;
- rechts, de resultaten in gewone taal toegelicht, bij de standaardinstellingen;
- daaronder, een grafiek van de responstijd naarmate er camera's bijkomen, één
  lijn per beeldformaat, met uw doel als stippellijn. Die verschijnt waar
  meerdere camera's zijn gemeten, dus met één beeld per camera.

De grafiek kan als PNG worden gedownload voor rapporten en presentaties.

### Waar te beginnen

**"Hoeveel camera's kan één Jetson AGX Orin volgen?"** Kies het apparaat, stel
het beeldformaat in dat uw camera's sturen en lees Max. camera's af. Zet de
schuifregelaar voor het minimum aantal camera's op het aantal dat u nodig hebt
om alleen de configuraties te zien die het bijhouden.

**"Is 1080p de moeite waard?"** Wissel van beeldformaat en kijk naar Max.
camera's, of open een rij: de grafiek heeft één lijn per beeldformaat.

**"Wat veranderen kwantisatie en de engine?"** Houd model en apparaat vast en
vergelijk de rijen die in die ene instelling verschillen: Qwen3-VL-8B-Instruct in
Q8_0 en Q4_K_M op Jetson AGX Orin, of Qwen3-VL-4B-Instruct onder llama.cpp en
vLLM op RTX PRO 6000. Door het aantal camera's te wijzigen, ziet u hoe het
verschil zich onder belasting ontwikkelt.

**"We hebben deze hardware al; wat kunnen we erop draaien?"** Begin met het
apparaatfilter, sorteer de overgebleven modellen op grootte of op Max. camera's,
en verfijn met de responstijd of het aantal camera's dat u nodig hebt.

</div>
</details>

<details class="bt-howto">
<summary>Wat de getallen betekenen en hoe ze worden berekend</summary>
<div class="bt-howto-body" markdown="1">

### Hoe de getallen zijn gemeten

Elk verzoek bevat één of meer foto's en de prompt *Describe the scene.*, en
vraagt om maximaal 128 tokens. De foto's zijn zestien vaste afbeeldingen, die
om beurten over de verzoeken worden verdeeld en geschaald naar 854×480 (480p),
1280×720 (720p), 1920×1080 (1080p) en 2560×1440 (2K), en als base64-beelden via
de OpenAI-compatibele chat-API worden verstuurd. Hugging Face-checkpoints werden
geserveerd met vLLM en GGUF-bestanden met llama.cpp.

Elke combinatie van beeldformaat, beelden per verzoek en aantal camera's wordt
afzonderlijk gemeten, na een opwarmronde die wordt weggegooid. De waarden zijn
gemiddelden van de gemeten verzoeken.

- **Meerdere camera's** zijn gemeten met één beeld per verzoek bij 480p, 720p
  en 1080p: 1, 2 en 4 camera's op Jetson Orin NX (tot 8 voor één configuratie),
  tot 8 op Jetson AGX Orin en tot 16 op RTX PRO 6000, met 8 verzoeken per niveau
  op een Jetson en 24 op RTX PRO 6000, en nooit meer camera's tegelijk in
  behandeling dan het niveau.
- **Eén camera** is gemeten bij alle vier formaten met één, drie en vijf beelden
  per verzoek, telkens 5 verzoeken (3 voor één configuratie). 2K en meerdere
  beelden per verzoek zijn alleen zo gemeten.

Een **token** is de eenheid die een model leest en schrijft, ongeveer driekwart
van een Engels woord. Ook een beeld wordt als tokens gelezen, en een groter beeld
wordt er meer.

### Responstijd

**Responstijd** is hoe lang een camera wacht tot zijn antwoord begint — de time
to first token (TTFT), in seconden. Bij een vision-languagemodel is dat vooral
het lezen van de beelden, dus het groeit met hun formaat en aantal, en met het
aantal camera's dat het apparaat deelt. Hoeveel het met het formaat groeit,
hangt af van het model: sommige zetten elk beeld om in een vast aantal tokens,
andere in meer tokens naarmate er meer pixels zijn. Lager is beter.

**TPS (tokens per seconde)** is hoe snel het antwoord daarna per camera wordt
geschreven. Het hangt nauwelijks van het beeld af en wordt ter informatie
getoond: Max. camera's wordt bepaald door de responstijd. Een lang antwoord
voegt zijn schrijftijd daar nog aan toe — 128 tokens bij 25 tokens per seconde
duren ongeveer vijf seconden langer.

### Max. camera's: het aantal camera's is de gelijktijdigheid

Een camera stuurt zijn volgende verzoek zodra het vorige is beantwoord, dus hij
heeft altijd precies één verzoek in behandeling. Het aantal gelijktijdige
verzoeken is daarom het aantal camera's.

Max. camera's is het hoogste **gemeten** aantal camera's waarbij de responstijd
uw doel haalt en geen verzoek mislukte. Alleen gemeten aantallen tellen, er
wordt niets geïnterpoleerd, en als geen enkel aantal slaagt, is de waarde 0.
Ze hangt af van uw doel en beweegt mee: bij 720p met één beeld per camera houdt
Cosmos3-Edge op Jetson AGX Orin 2 camera's bij bij 1 seconde en 8 — het hoogste
gemeten aantal, dus 8+ — bij 3 seconden.

### De kolommen die de opzet beschrijven

**Parameters** — het gepubliceerde totale aantal gewichten van het model,
inclusief de beeldencoder. Bij een mixture-of-expertsmodel is dit het totaal,
niet het deel dat per token actief is, omdat alles in het geheugen wordt
gehouden.

**Kwantisatie** — het getalformaat waarin de gewichten zijn opgeslagen. BF16 is
volledige precisie, FP8 gebruikt 8 bits en NVFP4 4 bits. Q8_0, Q4_K_M en Q4_0
zijn GGUF-formaten voor llama.cpp met ongeveer 8 en 4 bits per gewicht. Minder
bits betekent minder geheugen en meestal meer snelheid, met enig risico voor de
kwaliteit.

**Engine** — de serversoftware die het model laadt en verzoeken inplant. Ze
beïnvloedt de snelheid net zoveel als de hardware. Qwen3-VL-4B-Instruct op RTX
PRO 6000 begint bij 720p een enkele camera te antwoorden na 0.25 s onder
llama.cpp (Q8_0) en na 0.16 s onder vLLM (BF16); bij 16 camera's is het
verschil 1.09 s tegen 0.46 s.

**Apparaat** — Jetson Orin NX (16 GB) en Jetson AGX Orin (32 GB) zijn embedded
modules waarvan CPU en GPU één geheugen delen; RTX PRO 6000 Blackwell is een
werkstation-GPU met 96 GB, gemeten in de Workstation-editie van 600 W en de
Max-Q-editie van 300 W.

### Wat de getallen u niet vertellen

De tabel gebruikt één vaste workload — voorbeeldfoto's, een korte prompt,
antwoorden van maximaal 128 tokens — en gemiddelde waarden, zodat configuraties
zonder locatieonderzoek kunnen worden vergeleken. Ze is **geen vervanging voor
een test met uw eigen camera's en prompts**: andere beeldinhoud, langere prompts
of antwoorden, andere engine-instellingen en de traagste verzoeken in plaats van
het gemiddelde veranderen allemaal de werkelijke capaciteit. De responstijd is
de wachttijd tot het antwoord begint; een toepassing die het hele antwoord nodig
heeft, wacht ook op de schrijftijd, en een rij die alleen met één camera is
gemeten, zegt niets over hoe die zich met meerdere gedraagt.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/vlm-benchmark-table.css">

<div data-vlmbt-src="/assets/data/vlm-benchmarks.json"
     data-vlmbt-logo="/assets/images/benchmark-logo.png"></div>

{% include benchmark-jsonld.html kind="vlm" %}
{% include vlm-benchmark-explained.html %}

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/vlm-benchmark-table.nl.js"></script>
