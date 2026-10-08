---
title: Apparaatadvies
nav_order: 7
lang: nl
page_id: device-advisor
date: 2026-10-06 16:00:00 +0300
card_tag: "Apparaatadvies"
description: >-
  Beschrijf uw camera's en kies een vision-language-model, dan noemt deze
  pagina het kleinste door ons gemeten apparaat dat het bijhoudt — en speelt
  de stroom daarna af als een live tijdlijn, zodat u ziet hoe vaak elke camera
  antwoord krijgt en hoeveel van haar frames het model ooit ziet.
permalink: /device-advisor/
last_modified_date: 2026-10-06
toc: false
---

# Apparaatadvies

Zeg hoeveel camera's u hebt, hoe groot hun beelden zijn en welk
vision-language-model u wilt draaien. Deze pagina antwoordt met het kleinste
door ons gemeten apparaat dat het bijhoudt, en speelt dat antwoord vervolgens
af: één baan per camera, een balk voor elk verzoek en de frames die zich
daartussen opstapelen.

Er draait niets achter. De tijdlijn is een projectie van metingen die al op
deze site gepubliceerd zijn, getekend op kloksnelheid.

<details class="bt-howto">
<summary>Hoe u deze pagina leest</summary>
<div class="bt-howto-body" markdown="1">

### Wat u kiest

**Model** — het vision-language-model dat u wilt draaien. Alleen modellen die
wij gemeten hebben, verschijnen hier.

**Beeldformaat** — hoe groot het beeld is dat elke camera stuurt: 480p, 720p,
1080p of 2K. Dit is verreweg de grootste hefboom op deze pagina. Een
vision-language-model besteedt het grootste deel van de wachttijd aan het lezen
van het beeld, dus van 720p naar 1080p gaan kan meer kosten dan het apparaat
wisselen.

**Camera's** — hoeveel camera's op hetzelfde moment verzoeken sturen. Elke
camera stuurt haar volgende verzoek zodra het vorige beantwoord is, dus het
aantal camera's is ook het aantal verzoeken dat onderweg is.

Onder *Meer opties* staan er nog drie: hoeveel frames elk verzoek draagt, hoe
lang een camera op het begin van haar antwoord mag wachten, en de beeldsnelheid
van de camera's zelf. Die laatste verandert geen enkele meting — het is wat
"één verzoek per vier seconden" omzet in "het model ziet één frame op tachtig".

### Wat de getallen betekenen

**Antwoord begint na** is de gemeten tijd tot het eerste token: hoe lang een
camera wacht voordat haar antwoord binnenkomt. Dit is het getal waartegen het
doel wordt gehouden, en dat de aanbeveling bepaalt.

**Antwoord elke** telt de schrijftijd van het antwoord erbij op, dus het is de
volledige heen-en-weer — en daarmee hoe vaak er naar een camera gekeken wordt.

**Frames die het model ziet** zet die heen-en-weer af tegen wat de camera
ondertussen heeft vastgelegd. Het is het getal waar mensen doorgaans van
opkijken: een camera die 20 frames per seconde streamt en elke vier seconden
antwoord krijgt, heeft tachtig frames voorbij zien gaan voor elk frame dat het
model las.

### Waarom dat apparaat

Apparaten die uw doel halen staan vooraan, **het kleinste eerst** — de bruikbare
aanbeveling is de minste hardware die het werk doet, niet de snelste machine in
het lab. Apparaten die het doel missen volgen daarna, het dichtstbijzijnde
eerst, zodat een net gemiste meting zichtbaar blijft in plaats van verborgen.
Klik er een aan om in plaats daarvan die stroom af te spelen.

Een kaart met *schatting* is geïnterpoleerd: de reeks is gemeten bij 1, 2, 4, 8
en 16 camera's, en uw aantal valt tussen twee daarvan in. Er wordt niets
geëxtrapoleerd voorbij het hoogste aantal waarop een configuratie werkelijk
getest is — de cameraschuif stopt waar de metingen stoppen.

### Wat de tijdlijn toont

De baan van elke camera is in tweeën gesplitst. De **bovenste rij** is één balk
per verzoek, over de volle duur ervan, met die duur erin vermeld. Een lijn in de
balk verdeelt die tijd in twee helften:

- **Donker, tot aan de lijn** — de wachttijd tot het eerste token, de gemeten
  TTFT. Bij één camera is dit het model dat de beelden leest: ze decoderen, de
  vision-encoder draaien en prefillen over de resulterende tokens. Bij meerdere
  camera's is het grotendeels het verzoek dat achter de andere in de wachtrij
  staat, en daarom groeit dit deel met het aantal camera's terwijl de beelden
  hetzelfde blijven.
- **Licht, na de lijn** — de rest van het antwoord schrijven: 128 tokens op de
  gemeten tokensnelheid.

De balken sluiten op elkaar aan, omdat de camera haar volgende verzoek stuurt
zodra het vorige antwoord af is — het apparaat staat nooit stil. De **onderste
rij** is dezelfde tijdspanne gezien vanaf de camera: de frames die zich
opstapelen voor het *volgende* verzoek. De pijl ertussen markeert het moment
waarop frames gekozen en aan het model gegeven worden.

De twee rijen delen met opzet één x-as. De verwerking van verzoek N en het
verzamelen voor verzoek N+1 gebeuren werkelijk in dezelfde seconden, en juist
die gelijktijdigheid is de reden dat de camera zo weinig ziet van wat ze heeft
vastgelegd.

Twee dingen in het beeld zijn geen meting, en beide zijn cosmetisch: de banen
zijn over één cyclus verspreid in plaats van gelijk te starten, en de timing van
elke baan varieert een paar procent rond het gemeten gemiddelde. De getallen
boven de tijdlijn zijn die gemiddelden zelf, onaangeroerd.

### Wat dit niet is

De metingen achter deze pagina gebruiken één vaste werklast — voorbeeldfoto's,
een korte prompt, antwoorden tot 128 tokens — en gemiddelden. Uw eigen camera's,
prompts en antwoordlengtes zullen afwijken, en in productie wegen de traagste
verzoeken zwaarder dan het gemiddelde. Behandel de uitkomst als een shortlist,
niet als een capaciteitsplan. De onderliggende cijfers, en elk voorbehoud dat
erbij hoort, staan op de
[VLM Inference Benchmark Explorer](/vlm-inference-benchmarks/).

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/device-advisor.css">

<div data-da-src="/assets/data/vlm-benchmarks.json" data-da-lang="nl"></div>

<script src="/assets/js/device-advisor.js"></script>
