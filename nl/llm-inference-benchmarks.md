---
title: LLM Inference Benchmark Explorer
nav_order: 4
lang: nl
page_id: llm-inference-benchmarks
date: 2026-08-31 11:23:22 +0300
card_tag: "LLM-benchmark"
description: >-
  Verken de LLM-inferentiebenchmarks van OpenZeka op NVIDIA DGX Spark, DGX B300,
  RTX PRO 6000 Blackwell en Jetson Thor. Filter op model, aantal parameters,
  apparaat, kwantisatie en gelijktijdigheid, en stel uw eigen prestatiedoelen in.
permalink: /llm-inference-benchmarks/
last_modified_date: 2026-09-26
toc: false
---

# LLM Inference Benchmark Explorer

Vergelijk de inferentieprestaties (inference performance) van verschillende LLM-, hardware-
en serving-configuraties op één plek. Selecteer met de filters de configuraties
die u wilt vergelijken; de tabel wordt automatisch bijgewerkt wanneer u het
gelijktijdigheidsniveau of uw prestatiedoelen wijzigt. Klap een rij uit om de
gedetailleerde resultaten van die configuratie te bekijken.

<details class="bt-howto">
<summary>Hoe u de benchmark explorer gebruikt</summary>
<div class="bt-howto-body" markdown="1">

### Wat een rij is

Een rij is één **deploymentconfiguratie**: een model, op specifieke hardware, in
een specifiek getalformaat, geserveerd door een specifieke engine met een
specifieke instelling voor parallellisme en speculatieve decodering, end-to-end
gemeten. Hetzelfde model komt daardoor in meerdere rijen voor, en twee rijen zijn
pas direct vergelijkbaar als u weet welke van die instellingen tussen hen
verschillen.

### Filters en doelen hebben verschillende taken

**Filters bepalen welke rijen u ziet.** De filters voor model, aantal parameters,
apparaat, kwantisatie (quantization) en speculatieve decodering (speculative
decoding), en de schuifregelaars voor TPS, TTFT en capaciteit, tonen of verbergen
alleen rijen.

**Doelen en aannames bepalen wat de getallen zeggen.** Ze staan onder
*Prestatiedoelen en capaciteitsaannames*. Als u er één wijzigt, blijven de rijen
staan, maar worden Max C, beide capaciteitskolommen en de groene en rode kleuring
van elke rij opnieuw berekend.

### 1. Kies een gelijktijdigheidsniveau

Gelijktijdigheid (concurrency, C) is het aantal verzoeken waaraan het systeem op
hetzelfde moment werkt. De keuzelijst bepaalt welke meting de kolommen TPS en
TTFT tonen: C=1 is het beste geval dat één enkel verzoek ziet, en hogere waarden
tonen het systeem onder belasting. Rijen die niet op het gekozen niveau zijn
gemeten, worden verborgen, dus de lijst wordt korter naarmate C stijgt.

### 2. Verfijn en sorteer

Filters worden gecombineerd, en elke kolom is sorteerbaar. De leerzaamste
vergelijkingen wijzigen één enkele instelling: hetzelfde model in FP8 en in NVFP4,
dezelfde configuratie met en zonder speculatieve decodering, of vLLM tegenover
SGLang op dezelfde hardware.

### 3. Stel uw doelen in

Twee doelen bepalen welke snelheid acceptabel is: een maximale TTFT (standaard
1000 ms) en een minimale TPS per verzoek (standaard 20 tok/s). Een gemeten niveau
telt alleen als ondersteund wanneer het aan **beide** voldoet; een waarde precies
op een doel slaagt.

TTFT is het belangrijkst waar iemand wacht tot het antwoord begint, zoals bij
chat. TPS is het belangrijkst bij lange antwoorden, waar het wachten over het
hele antwoord is verdeeld. Om te zien hoe een TPS-waarde aanvoelt, streamt de
preview onder de doelen voorbeeldtekst met die snelheid.

### 4. Lees Max C en de capaciteitskolommen

**Max C** is de hoogste gemeten gelijktijdigheid die aan beide doelen voldoet.
Het telt gelijktijdige verzoeken. Een plus — **64+** — betekent dat de run zelfs
op het hoogste geteste niveau aan beide doelen voldeed, zodat het werkelijke
maximum niet is bereikt.

**Chatcapaciteit** en **Agentische capaciteit** zetten dat om in een aantal
mensen en toetsen het aan het geheugen. Elk toont de kleinste van twee
schattingen, en het pictogram naast het getal geeft aan welke het heeft bepaald:

- een bliksemschicht — de snelheidsdoelen;
- een geheugenchip — het KV-cachegeheugen;
- een waarschuwingsdriehoek — de gekozen contextlengte is langer dan het model
  kan bevatten.

Een plus bij een capaciteitsgetal — **256+** — volgt uit een Max C met een plus:
de snelheid bepaalde het getal, maar de snelheidslimiet werd nooit bereikt, dus
het getal is een minimum. Sorteren en de filters voor minimale capaciteit
gebruiken het getal zelf.

Beweeg de muis over een getal voor een reden van één regel. *Wat de getallen
betekenen en hoe ze worden berekend*, hieronder, legt beide schattingen volledig
uit.

### 5. Open een rij

Klik op een rij om het volgende te zien:

- de volledige gelijktijdigheidsreeks, op elk niveau gemarkeerd als PASS of FAIL
  ten opzichte van uw doelen;
- een snelheidspreview voor elk gemeten niveau, zodat C=1 en C=32 met het oog
  kunnen worden vergeleken;
- een grafiek van TPS per verzoek, de snelheid die elke gebruiker ziet, tegenover
  geaggregeerde TPS, wat het systeem in totaal produceert — de afweging waartussen
  capaciteitsplanning zich beweegt;
- een korte capaciteitssamenvatting: wat elke limiet toelaat en hoeveel geheugen
  er overblijft voor de KV-cache;
- de notities van de run: cacheprecisie, kernels, geheugeninstellingen,
  speculatiediepte.

De grafiek kan als PNG worden gedownload voor rapporten en presentaties.

### Waar te beginnen

**"We willen dit model draaien voor een agentische workload die door 20 mensen
wordt gebruikt."** Selecteer het model en stel de minimale Agentische capaciteit
in op 20. Behoud de standaarddoelen voor een eerste schatting, of stem ze af op
uw toepassing. Wat overblijft, zijn de kandidaat-hardware- en
serving-configuraties.

**"Hoe presteert dit model op DGX B300 tegenover DGX Spark?"** Selecteer het
model en beide apparaatfamilies, en vergelijk vervolgens rijen waarvan
kwantisatie, engine, speculatieve decodering en parallellisme overeenkomen. Door
de gelijktijdigheid te wijzigen, ziet u hoe het verschil zich onder belasting
ontwikkelt.

**"Wat veranderen kwantisatie, speculatieve decodering of de engine
eigenlijk?"** Houd model en hardware vast en vergelijk de rijen die in die ene
instelling verschillen, zodat het effect niet wordt vermengd met een
hardwarewijziging.

**"We hebben deze hardware al; wat kunnen we erop draaien?"** Begin met het
apparaatfilter, sorteer de overgebleven modellen op vaardigheid of grootte, en
verfijn met de TPS, TTFT of capaciteit die u nodig hebt.

**"Welk model is capabel genoeg zonder onze limieten te overschrijden?"** Sorteer
op Intelligence Index, Agentic Index of aantal parameters om een shortlist van
modellen te maken, en pas daarna uw apparaat- en prestatie-eisen toe. Zo blijft
het kiezen van een model gescheiden van het dimensioneren van de infrastructuur,
in plaats van aan te nemen dat het snelste model het meest geschikt is.

</div>
</details>

<details class="bt-howto">
<summary>Wat de getallen betekenen en hoe ze worden berekend</summary>
<div class="bt-howto-body" markdown="1">

### Hoe de getallen zijn gemeten

Elk TPS- en TTFT-getal is een meting van OpenZeka, uitgevoerd met de open-source
[CordatusAI LLM Benchmark Tool](https://github.com/CordatusAI/llm-benchmark) op
NVIDIA DGX B300, één tot acht DGX Spark-nodes, RTX PRO 6000 Blackwell en Jetson
AGX Thor.

Elke configuratie wordt gedraaid met **128 input-tokens en 128 output-tokens**,
tien rondes per gelijktijdigheidsniveau met prompts over verschillende
onderwerpen, bij `C = 1, 2, 4, 8, 16, 32, 64`. De tabel toont het **gemiddelde**
van de tien rondes. Een **token** is de eenheid die een model leest en schrijft,
ongeveer driekwart van een Engels woord.

### De gemeten kolommen

**TPS (tokens per seconde)** — hoe snel het antwoord op één verzoek wordt
geproduceerd bij de gekozen gelijktijdigheid. Het is een getal per verzoek: bij
C=8 krijgt elk van de acht verzoeken deze snelheid. De totale output van het
systeem is **geaggregeerde TPS = C × TPS**, getoond in de uitgeklapte rij. Hoger
is beter.

**TTFT (time to first token)** — hoe lang een verzoek wacht voordat het eerste
token aankomt. Dit omvat de tijd in de wachtrij en de prefill, de pass waarin het
model de volledige prompt leest. Lager is beter.

### De kolommen die de opstelling beschrijven

**Parameters** — het totale aantal gewichten in het model. Voor een
mixture-of-experts-model is dit het totaal, niet het deel dat per token actief
is, omdat alles in het geheugen moet worden gehouden.

**Intelligence Index** en **Agentic Index** — scores voor modelvaardigheid, gepubliceerd door
[Artificial Analysis](https://artificialanalysis.ai); hoger is beter. De eerste
combineert evaluaties van redeneren, programmeren, wetenschap en werk met lange
context; de tweede meet meerstappenwerk met tool calls. Beide beschrijven het
model, dus elke rij van één model draagt hetzelfde paar, ongeacht de hardware.
Waar meerdere instellingen voor redeneerinspanning zijn gescoord, wordt de
hoogste getoond, en een streepje betekent dat er geen score is gepubliceerd. De
waarden komen uit Intelligence Index v4.3, opgehaald op 28 september 2026. Scores
uit verschillende indexversies zijn niet vergelijkbaar — v4.2 en v4.3 voegden
moeilijkere taken toe, waardoor elk model lager scoort dan onder v4.1 — en voor
sommige oudere modellen is nog geen Agentic Index v4.3 beschikbaar. De Agentic
Index meet wat het model kan; Agentische capaciteit, verderop in de rij, schat
hoeveel mensen de hardware kan bedienen.

**Kwantisatie** — het getalformaat waarin de gewichten zijn opgeslagen. Minder
bits per gewicht betekent minder geheugen en meestal meer snelheid, met enig
risico voor de kwaliteit van de output. BF16 en FP16 zijn volledige precisie; FP8
en MXFP8 gebruiken 8 bits per gewicht; NVFP4, MXFP4, FP4, INT4 en AWQ gebruiken
er 4.

**Inferentie-engine** — de serversoftware die het model laadt en verzoeken
inplant, zoals vLLM of SGLang. Hetzelfde model op dezelfde hardware kan onder twee
engines meetbaar verschillend presteren.

**Speculatieve decodering** — het model maakt een concept van meerdere tokens
vooruit en controleert ze in één pass; de geaccepteerde tokens worden behouden,
zodat dezelfde output eerder aankomt. De kolom toont of een run het gebruikte;
het mechanisme en hoe ver vooruit het concepten maakte, staan in de notities van
de rij.

**TP / DP / PP** — hoe het model over GPU's of machines wordt verdeeld.
Tensorparallellisme (TP) verdeelt het werk binnen elke laag,
pipelineparallellisme (PP) plaatst verschillende lagen op verschillende
apparaten, en dataparallellisme (DP) draait meerdere volledige kopieën, die elk
hun eigen verzoeken bedienen.

### Max C

Max C is de hoogste **gemeten** gelijktijdigheid waarbij de gemiddelde TTFT en de
gemiddelde TPS beide aan uw doelen voldoen. Alleen gemeten niveaus tellen, er
wordt niets geïnterpoleerd, en als geen enkel niveau slaagt, is Max C 0. Het
hangt af van uw doelen en beweegt mee: dezelfde rij kan C=16 halen bij 20 tok/s
en slechts C=8 bij 30 tok/s.

### Van verzoeken naar mensen: de capaciteitskolommen

Max C telt verzoeken die op hetzelfde moment lopen. De capaciteitskolommen
schatten hoeveel **mensen** een configuratie kan bedienen. Een systeem kan eerst
tekortschieten in snelheid of in geheugen, dus elke kolom neemt de kleinste van
twee limieten:

**capaciteit = min(snelheidslimiet, KV-cachegeheugenlimiet)**

### De snelheidslimiet

**snelheidslimiet = floor(Max C × gebruiksfactor)**

Een persoon heeft niet voortdurend een verzoek lopen. Een chatgebruiker stuurt
een bericht, wacht op het antwoord, leest en typt dan een tijdje, en gebruikt
daartussen geen capaciteit. De gebruiksfactor is het aantal mensen dat
gemiddeld één verzoekplaats deelt. De chatstandaard van 4 gaat ervan uit dat een
chatgebruiker ongeveer een kwart van de tijd een verzoek heeft lopen. De
agentische standaard van 1.5 gaat ervan uit dat een agent er ongeveer twee derde
van de tijd een heeft lopen, omdat hij aanroepen aan elkaar koppelt terwijl hij
plant, tools uitvoert en resultaten controleert.

Met Max C = 8 is dat 8 × 4 = 32 chatgebruikers of 8 × 1.5 = 12 agentische
gebruikers.

### De KV-cachegeheugenlimiet

Terwijl een model een gesprek verwerkt, houdt het een **KV-cache** bij: voor elk
token tot dan toe de tussenresultaten die elke laag nodig heeft, zodat eerdere
tokens niet opnieuw hoeven te worden verwerkt. De cache groeit met de lengte van
het gesprek.

De snelheidsgetallen komen van prompts van 128 tokens, en een echte beurt is
alleen zo snel als het gesprek van de gebruiker nog in de cache staat, zodat
alleen het nieuwe bericht hoeft te worden verwerkt. De geheugenlimiet telt daarom
hoeveel volledige sessies van gebruikers tegelijk in de cache passen. Een sessie
is zo lang als de **contextlengte** (context length) die onder de aannames is
ingesteld — elk token dat ze bevat, geschiedenis en antwoorden inbegrepen:
standaard 16K voor chat, 64K voor agentisch werk, waarvan de sessies ook tool
calls en hun resultaten bevatten. Boven dat aantal draait het systeem nog steeds,
maar wacht een terugkerende gebruiker terwijl zijn gesprek opnieuw wordt
verwerkt.

Dit wordt per apparaat berekend — per GPU, of per node op DGX Spark:

1. **Geheugen voor de engine** = apparaatgeheugen × Geheugentoewijzing engine: 95%
   op een discrete GPU (DGX B300, RTX PRO 6000), 85% op unified memory (DGX Spark,
   Jetson Thor), waar het besturingssysteem dezelfde pool deelt.
2. **Ruimte voor gewichten en cache** = dat × Aandeel gewichten en KV-cache (90%).
   De overige 10% is werkgeheugen voor activaties en runtime-buffers.
3. **Vrij voor de KV-cache** = dat − de gewichten die op dit apparaat staan: de
   grootte van het checkpoint dat de run serveerde, verdeeld over de TP × PP
   apparaten waarover het is gesplitst.
4. **Eén sessie** = contextlengte × de cache per token van het model, opgeslagen
   in FP8 (één byte per waarde), plus een eventueel vast deel per sessie dat het
   model heeft (zie hieronder), verdeeld over de apparaten die de sessie delen.
5. **Gebruikers** = floor(vrij geheugen ÷ één sessie) × het aantal DP-kopieën.

De cache per token volgt uit de gepubliceerde configuratie van het model. Voor
een standaard transformer is dat 2 (een key en een value) × lagen × KV-heads ×
headgrootte.

<div class="bt-howto-example" markdown="1">
**Rekenvoorbeeld.** Een hypothetisch model met 32 lagen en 8 KV-heads van grootte
128, geserveerd als FP8-checkpoint van 32 GB op één GPU van 96 GB:

- geheugen voor de engine: 96 × 95% = 91.2 GB; ruimte voor gewichten en cache:
  91.2 × 90% = 82.08 GB
- vrij voor de KV-cache: 82.08 − 32 = 50.08 GB
- cache per token: 2 × 32 × 8 × 128 = 65,536 bytes, dus 50.08 GB bevat 764,160
  tokens
- chat: 764,160 ÷ 16,384 = 46 sessies; agentisch: 764,160 ÷ 65,536 = 11

Met Max C = 8 is de snelheidslimiet 32 chat- en 12 agentische gebruikers, dus de
tabel toont **32**, bepaald door snelheid, en **11**, bepaald door geheugen.
Verscherp de TTFT tot Max C daalt naar 4, en de snelheidslimiet wordt 16 en 6:
beide worden dan door snelheid bepaald.
</div>

### Hoe verschillende modelontwerpen worden behandeld

Modellen verschillen in wat ze per token bewaren, dus elke rij gebruikt de
getallen van het eigen model. Bijvoorbeeld:

- **Sliding-window-lagen** bewaren alleen hun meest recente tokens — de laatste
  128 of 1,024, bijvoorbeeld — zodat ze een vaste hoeveelheid per sessie kosten in
  plaats van ermee mee te groeien.
- **Linear-attention- en Mamba-lagen** bewaren een toestand van vaste grootte in
  plaats van een cache per token, eenmaal geteld voor elke sessie.
- **Gecomprimeerde caches**, zoals de MLA van DeepSeek, Kimi en GLM-5, slaan veel
  minder per token op, maar elke GPU houdt een volledige kopie, zodat het
  toevoegen van GPU's ze niet verdeelt.
- **Een standaardcache** wordt via zijn KV-heads over GPU's verdeeld; met meer
  GPU's dan heads worden de heads gekopieerd in plaats van verder verdeeld.

Sommige rijen tonen alleen de snelheidslimiet, en de uitgeklapte rij zegt
waarom: ofwel is het geserveerde checkpoint alleen al groter dan het geheugen dat
beschikbaar wordt verondersteld — de run gaf de engine meer geheugen dan de
standaardtoewijzing, of hield een deel van het model of zijn cache in
CPU-geheugen of op schijf — ofwel slaat het model zijn cache op een manier op die
deze schatting niet modelleert. Kiest u een contextlengte die langer is dan het
eigen **contextvenster** (context window) van een model, het maximum dat het kan
bevatten, dan kan het model zulke lange sessies helemaal niet bedienen: de
capaciteit toont een streepje met een waarschuwingsdriehoek.

### De resultaten lezen bij langere prompts

Het TTFT-doel geldt direct voor prompts van 128 tokens. Bij langere prompts stijgt
de TTFT ruwweg evenredig met hun lengte, omdat het prefill-werk met de prompt
meegroeit. TPS daalt langzamer: de hoofdkosten van het produceren van elk token,
de gewichtsmatrixvermenigvuldigingen, hangen niet af van de lengte van de prompt,
al groeien attention en het lezen van de cache wel mee met de context.

### Wat de getallen u niet vertellen

De tabel gebruikt één vaste workload, gemiddelde waarden, eenvoudige
gebruiksfactoren en een standaard geheugenberekening, zodat configuraties kunnen
worden vergeleken zonder eerst een verkeersmodel te bouwen. Ze is **geen
vervanging voor een productiebelastingstest**: staartlatentie, uiteenlopende
prompt- en outputlengtes, aankomstpatronen, ketens van agent-aanroepen en
prefix-deling veranderen allemaal de werkelijke capaciteit.

De geheugenlimiet is berekend, niet uit de engine uitgelezen. Engine-specifieke
opslagdetails — afronding op blokken, schaalfactoren, afzonderlijke cachepools,
experts verspreid over dataparallelle apparaten — kunnen haar in beide richtingen
verschuiven. Een sessie met 16K of 64K tokens zal ook een langere TTFT en een iets
lagere TPS zien dan deze metingen met 128 tokens. Capaciteit is het meest
betekenisvol waar er een volledige gelijktijdigheidsreeks achter staat; een rij
die alleen bij C=1 is gemeten, rust op één enkel meetpunt.

Geplande verfijningen zijn onder meer workloadfilters, snelheid gemeten bij
langere contexten, en capaciteitsschattingen op basis van gemeten latentie,
denktijd van gebruikers en de wet van Little.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">

<div data-bt-src="/assets/data/benchmarks.json"
     data-bt-logo="/assets/images/benchmark-logo.png"></div>

<p class="bt-attribution">De waarden van Intelligence Index en Agentic Index
worden gepubliceerd door <a href="https://artificialanalysis.ai" rel="noopener">Artificial Analysis</a>
en worden hier met bronvermelding overgenomen. Alle andere kolommen zijn eigen metingen van OpenZeka.</p>

{% include benchmark-jsonld.html kind="llm" %}
{% include benchmark-explained.html %}

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/benchmark-table.nl.js"></script>
