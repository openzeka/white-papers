---
title: CV Inference Benchmark Explorer
nav_order: 5
lang: nl
page_id: cv-inference-benchmarks
date: 2026-09-16 16:07:02 +0300
card_tag: "CV-benchmark"
description: >-
  Verken de inferentiebenchmarks voor computer vision van OpenZeka op NVIDIA
  GPU's en Jetson-apparaten. Kies een GPU en een detectiemodel om te zien welke
  framerate het volhoudt, hoe die daalt naarmate er camera's bijkomen, en hoeveel
  camera's het draagt bij uw doel-FPS.
permalink: /cv-inference-benchmarks/
last_modified_date: 2026-09-24
toc: false
---

# CV Inference Benchmark Explorer

Hoeveel camera's kan dit apparaat met dit model verwerken, en bij welke
framerate? Kies een apparaat en een model, stel de framerate in die u acceptabel
vindt, en de tabel geeft het antwoord voor elke configuratie die we hebben
gemeten. Klap een rij uit om de volledige camerareeks en de bijbehorende curve te
zien.

<details class="bt-howto">
<summary>Hoe u de benchmark explorer gebruikt</summary>
<div class="bt-howto-body" markdown="1">

### Wat een rij is

Een rij is een **volledige deploymentconfiguratie**, geen model: één
detectiemodel, in één precisie en inputresolutie, op één apparaat, geserveerd
door de Cordatus Inference Engine op DeepStream. Hetzelfde model komt daardoor één
keer voor per apparaat waarop het is gemeten, en het vergelijken van twee rijen is
pas zinvol als u weet welke van die kolommen tussen hen verschillen.

### Hoe de getallen zijn gemeten

Elk getal is een meting van OpenZeka, gemaakt met de tool
[cordatus-benchmark](https://github.com/CordatusAI) tegen de Cordatus Inference
Engine, op NVIDIA Jetson Orin Nano, Jetson AGX Thor, GB10 (DGX Spark) en GeForce
RTX 3060 en RTX 3090. De verzameling groeit naarmate we meer apparaten en modellen
testen.

Elke camera is een **live 1080p H.264 IP-camera die met een vaste 20 FPS streamt**.
Elke configuratie wordt doorgemeten over een oplopend aantal camera's, doorgaans
1, 2, 4 en 8 en daarna in stappen van twee, tot 32. Niet elke configuratie heeft
elk aantal: een aantal dat niet is gemeten, of waarvan de meting is verworpen,
ontbreekt simpelweg in de reeks van die rij.

Voor elk aantal camera's start de tool een job, wacht tot elke camera de pipeline
bereikt en er frames binnenkomen, laat de pipeline stabiliseren, en bemonstert
daarna de profiler van de engine gedurende **30 seconden**. De tellers van de
engine vormen een voortschrijdend venster dat elke twee seconden wordt gereset,
dus de metingen worden per venster gegroepeerd, per venster wordt de meest
volgroeide meting bewaard, en vensters die te kort zijn om te vertrouwen worden
verworpen. De eigen placeholder-bron van de engine is van elk getal uitgesloten.

Twee soorten metingen bereiken deze pagina nooit. Een aantal camera's waarbij
niet elke camera daadwerkelijk streamde, valt af, omdat het minder camera's heeft
gemeten dan het label zegt. Hetzelfde geldt voor een resultaat waarin een camera
duidelijk sneller lijkt te worden verwerkt dan ze streamt, wat fysiek onmogelijk
is en op hetzelfde probleem wijst.

### Wat de parameters betekenen

**FPS (frames per seconde)** — hoeveel videoframes er per seconde worden
verwerkt.

**Camera's** — het aantal camera's waarbij de getallen van de rij zijn gemeten.
Elke rij rapporteert de zwaarste belasting waaronder ze is gemeten, op of onder de
cameralimiet in het filterpaneel, dus rijen kunnen hierin verschillen; daarom
staat het aantal naast de getallen in plaats van in een kop.

**FPS / camera** — de framerate waarmee elke camera wordt verwerkt, bij dat
aantal camera's. Dit is het getal om te lezen voor "houdt dit mijn camera's
bij". Hoger is beter, en 20 is het plafond, omdat de camera's dat versturen.

**Totale FPS** — de doorvoer (throughput) van de hele pipeline bij dat aantal
camera's: ruwweg FPS per camera × camera's.

**Drop %** — frames die de pipeline binnenkwamen maar er niet uitkwamen, als
aandeel van de input. Bijna nul is gezond. Kleine negatieve waarden komen ook
voor — iets meer frames uitgaand dan inkomend geteld tijdens het
bemonsteringsvenster — en betekenen hetzelfde als nul. Drop % wordt ter
informatie getoond; het heeft geen invloed op PASS/FAIL of Max. camera's.

**Inputresolutie** — de grootte waarnaar elk frame wordt geschaald voordat het
model het ziet, breedte × hoogte. Het is de eigen input van het model, niet die
van de camera: de camera's versturen 1080p, en de pipeline schaalt elk frame
omlaag. Een grotere input kost meer rekenwerk per frame.

**Precisie** — het getalformaat waarin de engine van het model is gebouwd,
getoond naast de modelnaam waar het is vastgelegd. INT8 slaat gewichten en
activaties op in 8-bits gehele getallen; een lagere precisie betekent doorgaans
snellere inferentie (inference), met enig risico voor de nauwkeurigheid.

**Apparaat** — de hardware waarop de pipeline draaide: een Jetson-module (Orin
Nano, AGX Thor), een op GB10 gebaseerde DGX Spark, of een GeForce-desktop-GPU. De
versies van DeepStream, CUDA en JetPack/L4T, en de CPU waar die is vastgelegd,
staan in de uitgeklapte rij.

### Twee onderscheiden om eerst goed te begrijpen

**Filters bepalen welke rijen verschijnen. Het doel verandert wat de getallen
betekenen.** Filteren op één apparaat maakt de tabel korter; het verhogen van de
doel-FPS laat het aantal rijen ongemoeid, maar berekent Max. camera's en het
PASS/FAIL-resultaat van elke meting opnieuw.

**FPS per camera en totale FPS beantwoorden verschillende vragen.** Camera's
toevoegen verhoogt het totaal meestal een tijdlang, zelfs terwijl elke camera
minder frames krijgt. Een apparaat kan op het totaal drukker en productiever
lijken terwijl al zijn camera's onder uw behoefte zijn gezakt, dus lees het getal
per camera voor "houdt het bij" en het totaal voor "hoe hard werkt het apparaat".

### 1. Stel de cameralimiet in

De schuifregelaar boven in het filterpaneel is een bovengrens, geen selectie. Hij
verbergt alles wat daarboven is gemeten en stopt bij het grootste aantal camera's
dat tot nu toe is gemeten. Stel hem in op 12, en elke rij rapporteert de zwaarste
belasting waarbij ze is gemeten tot 12 camera's — de reeks, de curve en de
streampreview volgen. Een configuratie waarvoor niets zo laag is gemeten, valt uit
de tabel tot de limiet weer wordt verhoogd.

Stel hem in op het aantal camera's dat u daadwerkelijk wilt draaien, en elke rij
beantwoordt uw vraag bij uw belasting.

### 2. Verfijn de configuraties

De apparaat- en modelfilters worden gecombineerd, en elke kolom is sorteerbaar —
zo kunt u de tabel benaderen vanuit de hardware, vanuit het model of vanuit de
framerate. De leerzaamste vergelijkingen wijzigen één variabele: hetzelfde model
op twee apparaten, of de vier YOLO11-groottes op hetzelfde apparaat.

### 3. Stel uw doel-FPS in

Het doel (target) is de framerate per camera die u acceptabel vindt. Het opent
met elke uitgeklapte rij, naast de reeks waarop het van toepassing is, en het is
één waarde voor de hele tabel: verschuift u het in één rij, dan verschuift het
voor alle rijen. De standaardwaarde is **15 FPS**, en de grens is **inclusief** —
precies 15.0 slaagt nog.

Een wijziging beoordeelt elke configuratie direct opnieuw. Ze werkt de groene en
rode kleuring van FPS / camera bij, het PASS/FAIL-resultaat op elk punt van de
uitgeklapte reeks, en Max. camera's.

Het juiste doel hangt af van waarvoor de video dient. Snel bewegende onderwerpen
— voertuigen, of alles wat u moet tellen of volgen — vragen meer frames dan
bevestigen dat er iemand in een ruimte aanwezig is. Omdat de camera's 20 FPS
versturen, kan een doel boven 20 in deze metingen niet worden gehaald.

### 4. Lees Max. camera's

**Max. camera's** is het hoogste *gemeten* aantal camera's waarbij de configuratie
uw doel nog haalt, tot de cameralimiet. Het wordt alleen uit de gemeten punten
afgeleid — er wordt niets geëxtrapoleerd — en als geen enkel gemeten punt het doel
haalt, is het 0.

Omdat u het doel zelf instelt, is Max. camera's geen vaste eigenschap van een
configuratie, en evenmin een belofte over de aantallen tussen twee metingen.

<div class="bt-howto-example" markdown="1">
**Voorbeeld.** PeopleNet op GB10 levert 15.5 FPS per camera bij 30 camera's en
14.1 bij 32, dus bij het standaarddoel van 15 FPS is Max. camera's 30. Verhoog het
doel naar 18 FPS en het daalt naar 26, het laatste aantal dat nog op 19.0 staat.
Intussen stopt de totale FPS met groeien: ongeveer 494 bij 26 en 28 camera's, 452
bij 32 — de extra camera's delen dezelfde doorvoer in plaats van eraan bij te
dragen.
</div>

Een **≥** naast het getal betekent dat het apparaat zijn eigen limiet nog niet had
bereikt: bij het grootste getoonde aantal camera's leverde het nog de 20 FPS van
de camera's, binnen 10%. Die getallen zijn ondergrenzen, geen plafonds. De ≥
hangt ook af van de cameralimiet — verlaag de limiet, en een apparaat dat bij 28
camera's terugvalt, toont ≥ bij 16, omdat het bij 16 nog bijhield.

### 5. Open een rij voor de details

De hele rij is klikbaar. Als u er een opent, ziet u de volledige camerareeks, met
PASS/FAIL dat aangeeft of uw doel bij elk aantal wordt gehaald — het gedrag dat
één enkel kerngetal verbergt.

Naast de reeks speelt een **streampreview** dezelfde korte clip twee keer naast
elkaar af: het linkerpaneel met de eigen 20 FPS van de camera, het rechter met de
framerate die die configuratie volhield. Het kiezen van een aantal camera's in de
reeks verandert het rechterpaneel, zodat de kosten van extra camera's zichtbaar
zijn in plaats van afgeleid. De clip toont snel bewegende voertuigen langs een
vaste camera, omdat framerate het makkelijkst te beoordelen is bij snelle
beweging. Het is geen beeldmateriaal van een benchmarkrun, en er wordt geen
detectie op uitgevoerd.

De grafiek bevat twee curves:

- **FPS per camera** — die meestal rond 20 blijft en daarna daalt zodra het
  apparaat geen marge meer heeft.
- **Totale FPS** — die met elke toegevoegde camera stijgt en daarna op hetzelfde
  punt afvlakt.

Het aantal camera's waarbij de twee curves van richting veranderen, is de
werkgrens van het apparaat voor dat model; de stippellijn markeert uw doel. De
hardware- en softwareversies van het apparaat, en de benchmarkruns waaruit de rij
afkomstig is, staan onder de grafiek.

### Waar te beginnen

**"We hebben 16 camera's nodig met PeopleNet op 15 FPS — welk apparaat?"**
Selecteer het model, stel de cameralimiet in op 16, en sorteer op FPS / camera.
Elke rij die 16 toont in de kolom Camera's en 15 of meer per camera, antwoordt
ja. Een rij met minder camera's is nooit bij 16 gemeten, dus die heeft de vraag
hoe dan ook niet beantwoord.

**"We hebben al een Jetson AGX Thor; welke YOLO11-grootte kunnen we ons
veroorloven?"** Selecteer het apparaat en sorteer op Max. camera's. De vier
groottes verschillen alleen in het model, dus het verschil ertussen is de prijs
van een groter model.

**"Hoe presteert hetzelfde model op verschillende hardware?"** Selecteer één
model en vergelijk de apparaten bij dezelfde cameralimiet. Door de limiet te
verschuiven, ziet u waar elk apparaat achterop begint te raken.

### Wat dit u niet vertelt

De tabel gebruikt bewust één vaste, vergelijkbare workload, zodat een eerste
vergelijking mogelijk is zonder een locatieonderzoek. Ze is **geen vervanging
voor een test op uw eigen camera's**.

Elk getal komt van live 1080p H.264-camera's op 20 FPS. Camera's met een andere
resolutie, codec of framerate veranderen de decodeer- en schaalbelasting. Een
productiepipeline voegt vaak tracking, secundaire classifiers, opname of analyse
toe bovenop detectie, en wat de gemeten pipeline niet draaide, zit niet in deze
getallen. Elke meting beslaat 30 seconden stabiele toestand, dus ze zegt niets
over het gedrag over uren — thermische limieten in een behuizing zonder
ventilator, bijvoorbeeld. En dit zijn alleen snelheidsmetingen: niets hier meet
hoe nauwkeurig een model detecteert.

Hogere aantallen camera's op de desktop-GPU's, waar de RTX 3060 en RTX 3090 bij
het hoogste geteste aantal nog bijhielden, vereisen een camerabron die niet eerder
opraakt dan de GPU. Die runs staan nog gepland, en de tabel groeit wanneer ze
binnen zijn.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/cv-benchmark-table.css">

<div data-cvbt-src="/assets/data/cv-benchmarks/index.json"
     data-cvbt-video="/assets/video/cv-preview.mp4"></div>

<p class="bt-attribution">Elk getal op deze pagina is een eigen meting van
OpenZeka op eigen hardware.</p>

{% include benchmark-jsonld.html kind="cv" %}
{% include cv-benchmark-links.html %}

<script src="/assets/js/cv-benchmark-table.nl.js"></script>
