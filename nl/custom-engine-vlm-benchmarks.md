---
title: Cordatus Custom Engine VLM Benchmark Explorer
nav_order: 8
lang: nl
page_id: custom-engine-vlm-benchmarks
date: 2026-10-27 12:00:00 +0300
card_tag: "Custom Engine-benchmark"
description: >-
  Hoeveel camera's kan een apparaat via de Cordatus custom engine draaien als
  een vision-languagemodel op een GPU-server ze beantwoordt? Gemeten op Jetson
  AGX Thor, Jetson AGX Orin 32GB Developer Kit en ASUS Ascent GX10, voor elk
  aantal frames dat met elke vraag wordt meegestuurd.
permalink: /custom-engine-vlm-benchmarks/
last_modified_date: 2026-10-27
toc: false
---

# Cordatus Custom Engine VLM Benchmark Explorer

Hoeveel camera's kan dit apparaat via de custom engine verwerken, en hoe vaak
krijgt elke camera een nieuw antwoord? Elke camera draait op het apparaat via
de Cordatus Stream Engine met `custom_engine_vlm`; de engine stuurt zijn frames
naar een vision-languagemodel op een aparte GPU-server en vraagt opnieuw zodra
het antwoord binnen is. Kies hoeveel frames met elke vraag meegaan, stel in hoe
lang een camera tussen twee antwoorden mag wachten, en de tabel antwoordt voor
elk apparaat dat we hebben gemeten. Klap een rij open voor de volledige
camerareeks, wat de VLM-server deed en de curve.

<details class="bt-howto">
<summary>Hoe u de benchmark explorer gebruikt</summary>
<div class="bt-howto-body" markdown="1">

### Wat een rij is

Een rij is een **apparaat dat de hele camerakant van de pijplijn draait** — de
Cordatus Stream Engine die elke camera decodeert en `custom_engine_vlm` die de
frames in vragen omzet — samen met de **VLM-server** die het bevraagt: één
model, in één getalformaat, geserveerd door één engine op één GPU. De VLM
draait niet op het apparaat. Alle apparaten op deze pagina bevroegen dezelfde
server, dus tussen hun rijen verandert alleen het apparaat.

### Hoe de cijfers zijn gemeten

Elk cijfer is een meting van OpenZeka, gedaan met de Custom Engine VLM
Benchmark-tool tegen Cordatus Stream Engine 3.0.12 met `custom_engine_vlm`, op
Jetson AGX Thor, een Jetson AGX Orin 32GB Developer Kit en een ASUS Ascent
GX10 (GB10). De VLM-server was Qwen3-VL-30B-A3B-Instruct in FP8, geserveerd met
vLLM op een RTX PRO 6000 Blackwell Workstation Edition.

Elke camera is **dezelfde 720p H.264-straatclip op 15 FPS**, via RTSP
afgespeeld vanaf het apparaat zelf, één stream per camera. De engine neemt van
elke camera vier frames per seconde, geschaald naar 960 pixels breed, decodeert
op de CPU en stuurt de frames als JPEG met de prompt *Describe the scene in one
sentence.* Alarmen staan uit. Elke camera heeft één vraag in behandeling: de
volgende vertrekt zodra het antwoord op de vorige binnen is.

Elke configuratie wordt over een oplopend aantal camera's gemeten — 1, 4, 8 en
16, daarna een deel van 24, 32, 40, 48, 64 en 128, afhankelijk van het
apparaat. Bij elk aantal start de tool de camera's, wacht tot elk ervan frames
levert, laat de pijplijn stabiliseren en leest dan **60 seconden** lang het
eigen verslag van de engine van elke vraag en elk antwoord (120 seconden voor
de ASUS Ascent GX10 met automatische frames). De metrics van de VLM-server en
de CPU en het geheugen van het apparaat worden over hetzelfde venster gelezen.

Een reeks stopt bij het eerste aantal camera's dat 3 seconden mist. De meeste
aantallen die het misten, zijn een tweede keer gemeten, en de tweede meting is
de getoonde. Een aantal waarbij niet elke camera binnen de toegestane tijd
opkwam, sluit de reeks af als mislukt. Een aantal waarbij geen enkele camera
opkwam, was een enginefout en geen meting, en is weggelaten.

### Wat de parameters betekenen

**Interval** — hoe lang een camera gemiddeld tussen twee antwoorden wacht,
gemeten op de eigen klok van de engine. De tabel toont het voor de *traagste*
camera bij dat aantal, en dat is het cijfer dat tegen uw doel wordt gelegd: het
zegt hoe oud het nieuwste antwoord over een camera kan worden. Het gemiddelde
over alle camera's staat in de opengeklapte rij. Lager is beter.

**Frames per verzoek** — hoeveel videoframes met elke vraag meegaan.
*Automatisch* is de eigen keuze van de engine: maximaal drie voor deze prompt,
minder als er sinds het laatste antwoord minder nieuwe frames zijn
binnengekomen, dus het stijgt van ongeveer 1.5 bij één camera naar 3 zodra de
antwoorden trager worden. Een getal legt het vast; als er niet genoeg nieuwe
frames zijn binnengekomen, vult de engine het verzoek aan met frames die hij
bewaart. Meer frames geven het model meer te zien en maken elk verzoek zwaarder
— de prompt groeit van ongeveer 500 tokens bij één frame naar ongeveer 4,000
bij acht.

**Camera's** — het aantal camera's waarbij de cijfers van de rij zijn gemeten:
de zwaarste belasting gemeten bij of onder de cameragrens in het filterpaneel.

**Antwoorden / min** — antwoorden die de engine per minuut ontving, alle
camera's samen. Waar dit niet meer groeit als er camera's bijkomen, heeft de
keten zijn grens bereikt.

**Engine-CPU** — de CPU die de stream engine en de custom engine samen
gebruiken, in cores: 1.0 is één volledig bezette core. Het decoderen van elke
camera en het voorbereiden van elk verzoek gebeurt hier, en daarom groeit het
mee met het aantal camera's. **RAM / camera** is het geheugen van de engine
gedeeld door het aantal camera's. De engine gebruikt op het apparaat geen
GPU-geheugen.

**Op de VLM-server** — per verzoek: prompt- en uitvoertokens, de tijd tot het
eerste token, de tijd in de wachtrij, de gebruikte KV-cache, het hoogste aantal
tegelijk actieve verzoeken en het aandeel van de verzoeken van de server dat in
hetzelfde venster van andere clients kwam — het was een gedeelde server. De
cijfers van de server omvatten al zijn verzoeken, dus bij één of enkele
camera's, waar dat aandeel het grootst is, zijn ze vermengd met die van de
andere clients. Zodra verzoeken in de wachtrij komen, is de server de grens;
gebeurt dat niet en groeit het interval toch, dan is het apparaat de grens.

### 1. Kies de frames per verzoek

De keuze van frames in het filterpaneel bepaalt welke reeks elke rij toont,
zodat rijen alleen bij hetzelfde aantal frames worden vergeleken. Ze opent op
*Automatisch*. De tabel **Frames per verzoek** in een opengeklapte rij toont
elk aantal frames voor dat apparaat met zijn eigen Max. camera's; een rij daar
kiezen zet de hele tabel daarop.

### 2. Stel de cameragrens in

De schuifregelaar is een bovengrens, geen selectie. Hij verbergt alles wat
erboven is gemeten, en elke rij toont dan de zwaarste belasting die tot dat
aantal is gemeten. Stel hem in op het aantal camera's dat u wilt draaien.

### 3. Stel uw doelinterval in

Het doel is hoe lang een camera gemiddeld hoogstens tussen twee antwoorden mag
wachten om als bijgehouden te gelden. Het opent met elke opengeklapte rij en is
één waarde voor de hele tabel. De standaard is **3 seconden**, en de grens is
inclusief. Wijzigen herberekent de status van elke meting, de kleur van
Interval en Max. camera's.

### 4. Lees Max. camera's af

**Max. camera's** is het hoogste *gemeten* aantal camera's waarbij de traagste
camera uw doel nog haalt zonder mislukt verzoek, tot de cameragrens. Er wordt
niets geëxtrapoleerd, en het is geen belofte voor de aantallen tussen twee
metingen. Een **+** ernaast betekent dat het hoogste gemeten aantal het doel
nog haalde, dus de werkelijke grens ligt hoger. Als zelfs één camera het doel
mist, toont de kolom het doel in rood.

Omdat de reeksen stopten bij het eerste aantal dat 3 seconden miste, kan een
ruimer doel alleen tot dat aantal worden gecontroleerd; de **+** markeert waar
dat een cijfer afkapt.

<div class="bt-howto-example" markdown="1">
**Voorbeeld.** Met automatische frames beantwoordt Jetson AGX Thor elk van 32
camera's binnen 2.30 s, dus Max. camera's is 32 bij het standaarddoel van 3 s.
Bij 40 camera's kwamen er binnen 900 seconden maar 39 op, wat de reeks afsluit.
Leg de frames vast op 4 en de grens daalt naar 24 (2.84 s), bij 8 frames naar 8
(1.25 s) — elk extra frame betaalt u in camera's.
</div>

### 5. Klap een rij open voor de details

De hele rij is klikbaar. Een opengeklapte rij toont de camerareeks met het
interval, de traagste camera, de verzoektijd, de werkelijk verstuurde frames,
de frames die de engine bereiken, de CPU en het geheugen van de engine en de
CPU van het apparaat, elk aantal gemarkeerd tegen uw doel; daarna dezelfde
aantallen van de kant van de VLM-server; de tabel met frames; de uitgelegde
resultaten; en een grafiek van het interval en de antwoorden per minuut tegen
het aantal camera's, met uw doel als stippellijn. De hardware- en
softwareversies en de benchmarkruns achter de rij staan aan het eind.

### Waar te beginnen

**"We hebben 16 camera's nodig die minstens elke 2 seconden antwoord krijgen —
welk apparaat?"** Zet de cameragrens op 16 en het doel op 2 s, en sorteer op
Interval. Elke rij die 16 camera's in het groen toont, zegt ja.

**"Hoeveel frames kunnen we ons veroorloven?"** Klap de rij van een apparaat
open en lees de tabel met frames: die toont hoe Max. camera's daalt naarmate
elke vraag meer frames meedraagt.

**"Is het apparaat of de VLM-server de grens?"** Klap de rij open en vergelijk
de twee tabellen. Op de Jetson-apparaten groeit het interval terwijl de server
nog geen wachtend verzoek heeft — daar is het apparaat de grens. Op de ASUS
Ascent GX10 met één of twee frames draait de server 32 verzoeken tegelijk en
zet hij de rest vanaf 64 camera's in de wachtrij: daar is de server de grens.

### Wat dit u niet vertelt

De tabel gebruikt één vaste werklast — één clip, een prompt van één zin,
alarmen uit — zodat apparaten zonder locatieonderzoek kunnen worden
vergeleken. Het is **geen vervanging voor een test met uw eigen camera's en
prompts**. Camera's met een andere resolutie of framerate veranderen de
decodeerbelasting; de alarmmodus, langere prompts of langere antwoorden
veranderen het verzoek; en een VLM-server die met ander werk wordt gedeeld, of
een andere server, verandert alles aan de kant van de server. De afgespeelde
camerastreams werden vanaf het apparaat zelf geserveerd, wat een deel van zijn
CPU kostte. De VLM draaide op een aparte server; een apparaat dat ook zijn
eigen VLM draait, deelt zijn GPU en geheugen ermee. Elke meting is 60 seconden
steady state, dus ze zegt niets over gedrag over uren. En dit zijn uitsluitend
snelheidsmetingen: niets hier meet hoe goed de antwoorden zijn.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/cv-benchmark-table.css">
<link rel="stylesheet" href="/assets/css/custom-engine-vlm-benchmark-table.css">

<div data-cevbt-src="/assets/data/custom-engine-vlm-benchmarks/index.json"></div>

<p class="bt-attribution">Elk getal op deze pagina is een eigen meting van
OpenZeka op eigen hardware.</p>

{% include benchmark-jsonld.html kind="cevlm" %}
{% include custom-engine-vlm-benchmark-explained.html %}

<script src="/assets/js/custom-engine-vlm-benchmark-table.nl.js"></script>
