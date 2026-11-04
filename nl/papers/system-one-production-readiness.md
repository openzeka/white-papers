---
title: "System One in productie: besliskwaliteit, betrouwbaarheid en prestaties op DGX Spark met vLLM en SGLang"
parent: White Papers
nav_order: 14
lang: nl
page_id: system-one-production-readiness
date: 2026-11-04
card_tag: "Technische gids"
description: >-
  Zes typed-decision-modellen van 0.6B tot 27B geëvalueerd op één NVIDIA DGX
  Spark met vLLM en SGLang: Turkse nauwkeurigheid, kalibratie van het
  vertrouwen, parafraseconsistentie, multimodale grenzen, overdraagbaarheid
  tussen engines en de vertrouwensdrempels die een productiebeleid nodig heeft.
permalink: /papers/system-one-production-readiness/
last_modified_date: 2026-11-04
toc: true
---

{% include company/block.html name="prepared_by" %}

*Testplatform: NVIDIA DGX Spark (GB10) · Modellen: System One-familie · Rapportdatum: november 2026*

---

{:.no_toc}
## Inhoudsopgave

* TOC
{:toc}

---

## Managementsamenvatting

Deze studie evalueert de productiegereedheid van de System One-modelfamilie, die direct typed decisions produceert in plaats van vrije tekst. Tests over zes modellen, datasets met verschillende labelaanpakken en twee inferentie-engines leveren drie belangrijke bevindingen op.

Ten eerste, **hoewel de hoogste nauwkeurigheid over het algemeen bij de grotere modellen wordt behaald, bestaat er geen lineair verband tussen modelgrootte en nauwkeurigheid.** `d3-27b` bereikt 0.963 nauwkeurigheid op de Turkse TDB-dataset, terwijl het model met 0.6B parameters, `d3-edge`, op 0.336 blijft steken. Daarentegen benadert de 4B `d3-mini` met 0.887 nauwkeurigheid het 27B-model en gaat hij het 9B-model `clef-flash` (0.853) voorbij.

Ten tweede, **hoge nauwkeurigheid alleen betekent niet dat er betrouwbaar wordt beslist.** Zelfs in de 42 gevallen waarin het antwoord werkelijk dubbelzinnig is, produceren de modellen een gemiddelde maximale optiekans in het bereik 0.75–0.77. Het veld `confidence` mag daarom niet worden gelezen als een gekalibreerde schatting van de nauwkeurigheid; het moet worden behandeld als een signaal voor voorselectie (triage), gebruikt met drempels die op gelabelde gegevens zijn gevalideerd.

Ten derde, **de ondersteuning voor System One in inferentie-engines is nog volop in ontwikkeling, dus compatibiliteit moet per model afzonderlijk worden geverifieerd.** Met dezelfde client, datasets en modellenlijst produceerden `d3-27b`, `clef` en `clef-flash` op beide engines vrijwel dezelfde resultaten. In de geteste SGLang-ontwikkelimage daalde de TDB-nauwkeurigheid van `d3-mini` echter van 0.887 naar 0.280, en `d3-edge` wilde niet starten.

Dit resultaat toont niet aan dat de twee engines over het algemeen verschillende beslissingen nemen. De bevindingen wijzen erop dat de answer-code-uitlezing in de geteste SGLang-versie bij de kleine D3-modellen onjuist werkt. Het probleem moet daarom, op basis van het huidige bewijs, per model en versie worden beoordeeld. Desalniettemin moet elke combinatie van model, engine en versie vóór productie afzonderlijk worden geverifieerd, en moet deze acceptatietest bij elke versie-upgrade worden herhaald.

> **Belangrijkste bevindingen**
>
> 1. Op de Turkse TDB-set is de hoogste nauwkeurigheid `d3-27b` (0.963) en `clef` (0.944); de laagste is `d3-edge` (0.336).
> 2. De drempel `confidence ≥ 0.90` rondt voor `d3-27b` 87% van de 354 gescoorde gevallen automatisch af met een foutrisico van 1.3%.
> 3. De stabiliteit bij wijziging van de optievolgorde is bij alle modellen volledig (`flip = 0.0`), terwijl de parafraseconsistentie zelfs bij het beste model ongeveer 0.83 bedraagt.
> 4. In de beeld- en videotests beantwoordt alleen `d3-27b` alle 8 items correct; de gemeenschappelijke zwakte is het aflezen van exacte getallen uit een grafiek.
> 5. 27B-modellen kunnen op GB10 93–96 °C bereiken en het proces kan stilzwijgend beëindigen; een beschermd werkprotocol is verplicht.

**Reikwijdte.** Het rapport richt zich op de meetresultaten en de gevolgen daarvan voor productiebeslissingen. Installatiecommando's, API-gebruik, SDK-gerelateerde aandachtspunten en aanbevelingen voor probleemoplossing vallen buiten het bereik van dit rapport. Hardware- en softwareversies zijn vastgezet op de testomgeving. Resultaten die in een andere omgeving worden verkregen, moeten afzonderlijk worden gemeten en geverifieerd.

---

## 1. Probleem: van vrije tekst naar typed decisions

Wanneer een conventioneel taalmodel wordt uitgevoerd, leest het tekst en produceert het een vrij antwoord; de toepassing parseert dat antwoord vervolgens om er een beslissing uit te halen. Deze aanpak heeft twee structurele kosten: de parseerlaag is kwetsbaar en de waarschijnlijkheidsinformatie van het model gaat verloren. Het verschil tussen "ja" en "ja, maar…" kan alleen worden geschat door de gegenereerde tekst opnieuw te interpreteren.

System One (Jev) verwijdert deze stap. Het model krijgt een `state`-tekst en getypeerde vragen over die tekst; het produceert voor elke optie een genormaliseerde waarschijnlijkheid. Er zijn drie vraagtypen:

- **`choice`** — een keuze uit gedefinieerde opties.
- **`noul`** — een ja/nee-beslissing; het resultaat wordt afgelezen uit `P(yes)`.
- **`score`** — een verdeling over geordende niveaus; het resultaat is de niveauexpectatie, berekend als het gewogen gemiddelde van de verdeling.

Het uitvoerschema bestaat uit drie velden, die elk een andere vraag beantwoorden:

| Veld | Wat het zegt | Wat het niet zegt |
| --- | --- | --- |
| `probabilities` | De relatieve verdeling over de opties | Of die verdeling correct is |
| `confidence` | Het interne vertrouwen van het model in het gekozen antwoord | De kans dat het in de echte wereld correct is |
| `diagnostics.label_mass` | De totale waarschijnlijkheidsmassa die aan geldige labels is toegewezen | De kwaliteit van de verdeling binnen de labels |

Een `label_mass` onder 1 geeft aan dat een deel van de waarschijnlijkheidsmassa buiten de gedefinieerde opties is terechtgekomen en dat de beslissing mogelijk extra controle nodig heeft.

### 1.1. Drie uitleesmethoden

Hoewel de modellen dezelfde API delen, brengen ze de beslissing via verschillende mechanismen tot stand. Dat verschil bepaalt zowel de kosten als de manier waarop de uitvoer moet worden geïnterpreteerd.

| Strategie | Modelfamilie | Werkwijze | `label_mass` |
| --- | --- | --- | --- |
| **Answer-code-uitlezing** | `vllm-sr/d3` | Een afzonderlijke forward pass per vraag; opties worden gescoord via de logits van answer-codes en met softmax genormaliseerd | Vast op 1 |
| **Gezamenlijke schemakop** | `Cloudflare/clef`, `clef-flash` | Meerdere vragen worden in één prefill door een specifieke transformer-kop geëvalueerd | Vast op 1 |
| **Label-token-uitlezing** | `LiquidAI/d1-3B` | Het eerste token van het antwoord is het uitgangspunt; de logits van de relevante labels worden met softmax naar waarschijnlijkheden omgezet | Dynamisch |

De praktische gevolgen van het onderscheid zijn:

- **D3** doet een afzonderlijke pass per vraag, dus de verwerkingskosten stijgen naarmate het aantal vragen toeneemt.
- **CLEF** biedt een voordeel van één forward pass bij verzoeken met meerdere vragen; `usage.input_tokens` wordt over de gedeelde invoer gerapporteerd.
- **D1-3B** hoeft de waarschijnlijkheid niet alleen over geldige labels te verdelen, waardoor `label_mass` in deze familie een echt signaal is.

Het veld `instructions` kan niet in D3-verzoeken worden gebruikt; wanneer het wordt meegestuurd, wordt `400` geretourneerd en werkt het model met een vaste vraagsjabloon. Bij CLEF is `instructions` niet verplicht, maar `chat_template_kwargs` zorgde in deze studie voor afwijzing van het verzoek. CLEF en CLEF-Flash gebruiken dezelfde `joint_schema_model.py`-implementatie en dezelfde kopconfiguratie; het verschil zit in de omvang van de backbone (32×4096 en 64×5120).

---

## 2. Methode en de grenzen van het bewijs

De evaluatie omvat datasets met verschillende labelaanpakken, hoofdzakelijk een Turkse standaard met harde labels, een Turks voorbeeld met waarschijnlijkheidsverdelingen als labels, en een externe Engelse standaard. Deze datasets maken het mogelijk de modelprestaties aan verschillende maatstaven te toetsen.

| Dataset | Inhoud | Labelregime |
| --- | --- | --- |
| **TurkishDecisionBenchmark v0.2 public** | 396 gevallen: 354 gescoord + 42 dubbelzinnigheidscontroles | Eén juist antwoord; dubbelzinnige gevallen worden afzonderlijk gerapporteerd |
| **cisimcik-voorbeeld** | 120 Turkse vragen (40 `noul`, 40 `choice`, 40 `score`), seed 42 | Waarschijnlijkheidsverdeling van een beoordelaarspanel (soft label) |
| **JevBench-public-120** | 72 oorspronkelijke gevallen (36 parafraseparen) + 48 eenvoudige gevallen | Hard label; in de eenvoudige laag staat het antwoord expliciet in de tekst |
| **bench-tr (35)** | 25 + 10 Turkse workloadvragen | Verwachte antwoorden vóór de meting vastgelegd |
| **bench-images (8)** | Factuur, verkoopgrafiek, foutscherm, video van 4 seconden | 7 beeld- + 1 video-item |
| **limits (11)** | Programmatische grens- en robuustheidsscenario's | Gedragsobservatie |

TDB en de cisimcik-dataset dienen verschillende meetdoelen. TDB meet of het model één juist label kan vinden, terwijl cisimcik beoordeelt hoe dicht de door het model geproduceerde waarschijnlijkheidsverdeling bij de verdeling van het beoordelaarspanel komt. De nauwkeurigheidscijfers van de twee datasets mogen daarom **niet** direct worden vergeleken.

De tests zijn als een piramide opgebouwd; de onderste laag is een snelle gezondheidscontrole en de bovenste lagen zijn duurdere en uitgebreidere rondes. Deze structuur maakt het gemakkelijker om te isoleren in welke laag een probleem optreedt.

| Laag | Inhoud | Gereedschap |
| --- | --- | --- |
| L0 | Basale werking controleren | `systemone.py --example` |
| L1-STD | JevBench-public-120 | `bench.py --set jevbench` |
| L1-TR | TDB v0.2 public (396) | `bench_tdb.py` |
| L1-TR+ | cisimcik-voorbeeld (120) | `bench_cisim.py` |
| L2 | Beeld/video (8) | `bench_images.py` |
| L3 | Grens en robuustheid (11) | `limits.py` |
| L4 | Metrieken afleiden | `summary.py` |
| L5 | Gelijktijdigheid 1/8/64 | `concurrency.py` |
| L6 | Overeenstemming tussen engines | `xengine.py` |

Gemeten metrieken: nauwkeurigheid, groepsconsistentie (TDB-contrastvraaggroepen), fout bij hoog vertrouwen, gemiddelde waarschijnlijkheid van het juiste antwoord (mean gold p), overmatig vertrouwen bij dubbelzinnige gevallen, soft-label-Brier, Brier, genormaliseerde score-MAE, ECE(10), beslissingswijzigingspercentage (`flip`), p50/p95-latentie en `label_mass`.

De getallen in de tabellen zijn letterlijk uit de ruwe uitvoer overgenomen; de decimale punt is behouden.

**Testomgeving.** De tests zijn uitgevoerd op een NVIDIA DGX Spark (GB10, 121 GiB unified memory, aarch64). Aan de vLLM-kant zijn de image `vllm/vllm-openai:nightly` en de configuratie `--max-model-len 32768` gebruikt. Het GPU-geheugengebruik was 0.88 in de standaardtests en 0.78 met `--enforce-eager` in de beschermde tests van de 27B-modellen. SGLang-tests zijn uitgevoerd met de images `lmsysorg/sglang:dev` en `dev-clef` op poort 8001, met dezelfde clientscripts en dezelfde JSON-verzoeklichamen.

> **System One-ondersteuning is nieuw.** Volgens de registraties kwam de ondersteuning op 14 oktober 2026 in de vLLM-hoofdlijn (vllm#61565) en is die nog niet in releaseversies opgenomen; daarom is de `nightly`-image gebruikt. De ARM64-ondersteuning van nightly en de uitvoerbaarheid op DGX Spark zijn in deze omgeving geverifieerd, maar bij elke installatie moet worden gecontroleerd of de image de relevante wijziging bevat.

### 2.1. Grenzen van het bewijs

Niet elke bevinding hieronder weegt even zwaar. Weten hoeveel vertrouwen je in elk getal kunt stellen, is deel van het correct lezen van het resultaat.

- **Herhaalde rondes:** De belangrijkste TDB-, cisimcik- en JevBench-resultaten berusten op volledige testrondes; de 27B-resultaten zijn geverifieerd met een protocol dat in batches werd uitgevoerd en met samengevoegde bestanden.
- **Slechts op één engine gemeten:** Voor `tr-set` zijn `clef`, `clef-flash` en `d1-3b` alleen op SGLang uitgevoerd; deze drie modellen hebben geen vLLM-tegenhanger.
- **Kleine steekproef:** De beeld- en video-evaluatie bestaat uit 8 items; een verschil van één item verandert de rangorde.
- **Gedragsobservatie:** De `limits`-resultaten zijn niet statistisch; het zijn scenariogebaseerde API-gedragingen.
- **Waargenomen variatie:** De TDB-nauwkeurigheid van `clef-flash` ligt over verschillende rondes tussen 85.3% en 85.9%; in batchgewijze uitvoeringen werd een afwijking van ongeveer ±0.07 in de waarschijnlijkheidswaarden gerapporteerd.
- **Versieafhankelijkheid:** De System One-ondersteuning in beide engines berust op ontwikkelimages uit dezelfde periode. De resultaten gelden voor deze versies en deze hardware.

---

## 3. Besliskwaliteit: nauwkeurigheid, consistentie, taalgedrag

### 3.1. Externe Engelse standaard

Op JevBench-public-120 scoren alle modellen volledig op alle 48 eenvoudige vragen; de verschillen komen vooral naar voren in de 72 oorspronkelijke vragen.

| Model | acc_all (72) | noul | choice | score | easy (48) | Brier | ECE(10) | flip | paraphrase | p50/p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `d3-edge` | 0.819 | 0.708 | 0.917 | 0.750 | 1.000 | 0.271 | 0.083 | 0.0 | 0.667 | 9 / 11 |
| `d3-mini` | **1.000** | 1.000 | 1.000 | 1.000 | 1.000 | 0.012 | 0.032 | 0.0 | 0.833 | 50 / 52 |
| `d3-27b` | **1.000** | 1.000 | 1.000 | 1.000 | 1.000 | 0.004 | 0.012 | 0.0 | 0.833 | 289 / 299 |
| `clef-flash` | 0.972 | 1.000 | 0.944 | 1.000 | 1.000 | 0.044 | 0.058 | 0.0 | 0.833 | 112 / 116 |
| `clef` | **1.000** | 1.000 | 1.000 | 1.000 | 1.000 | 0.004 | 0.012 | 0.0 | 0.833 | 290 / 301 |
| `d1-3b` | 0.931 | 0.792 | 1.000 | 1.000 | 1.000 | 0.126 | 0.033 | 0.0 | 0.806 | 61 / 64 |

Twee observaties vallen op. Ten eerste is de `flip`-metriek bij elk model nul: wanneer de volgorde van de opties wordt gewijzigd, verandert de beslissing niet. Ten tweede is de `paraphrase`-metriek zelfs bij de beste modellen ongeveer 0.83. Dat wil zeggen: **dezelfde vraag in andere woorden kan de beslissing veranderen.** In toepassingen waar beslissingsconsistentie cruciaal is, moet deze test met gegevens van de eigen organisatie worden herhaald.

### 3.2. Turkse standaard met harde labels

In TDB wordt de hoogste nauwkeurigheid bij de 27B-modellen gezien, maar de rangorde is niet evenredig met de grootte: de 4B `d3-mini` (0.887) is beter dan de 9B `clef-flash` (0.853), terwijl het verschil tussen de 27B `d3-27b` en `d3-mini` veel kleiner is dan het verschil tussen 0.6B en 4B.

| Model | accuracy | group-cons | high-conf err | mean gold p | amb valid | amb max-p | Brier | ECE(10) | p50/p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `d3-27b` | **0.963** | **0.870** | 0.011 | **0.934** | 0.952 | 0.765 | **0.060** | 0.016 | 336 / 362 |
| `clef` | 0.944 | 0.797 | **0.006** | 0.865 | 0.976 | 0.747 | 0.102 | 0.047 | 351 / 386 |
| `clef-flash` | 0.853 | 0.638 | 0.011 | 0.753 | 0.905 | 0.715 | 0.232 | 0.060 | 115 / 125 |
| `d3-mini` | 0.887 | 0.710 | **0.006** | 0.795 | 0.905 | 0.754 | 0.183 | 0.047 | 59 / 64 |
| `d1-3b` | 0.545 | 0.159 | 0.020 | 0.468 | 0.667 | 0.550 | 0.588 | 0.113 | 66 / 86 |
| `d3-edge` | 0.336 | 0.029 | 0.065 | 0.327 | 0.619 | 0.635 | 0.867 | 0.295 | 10 / 14 |

De metrieken moeten met de volgende definities in gedachten worden geïnterpreteerd:

- **Groepsconsistentie** is het aandeel vraaggroepen dat over dezelfde situatie met tegengestelde formuleringen vraagt en volledig correct wordt beantwoord. Het laat zien of er consistent wordt beslist wanneer dezelfde situatie in andere of tegengestelde bewoordingen wordt aangeboden.
- **Fout bij hoog vertrouwen** is het aandeel onjuiste beslissingen dat met ten minste 0.90 vertrouwen wordt gegeven; dit moet in geautomatiseerde systemen ook worden gemonitord.
- **Overmatig vertrouwen bij dubbelzinnige gevallen** is, over de 42 controles, het percentage waarin een van de geldige antwoorden wordt gekozen en de hoogste gemiddelde waarschijnlijkheid in die gevallen.

`d3-mini` en `clef` hebben hetzelfde foutpercentage bij hoog vertrouwen (0.006); de groepsconsistentie van `clef` is echter duidelijk hoger (clef 0.797, `d3-mini` 0.710). Met andere woorden: vergelijkbaar "zeker zijn" betekent niet vergelijkbare consistentie.

### 3.3. Turks voorbeeld met waarschijnlijkheidslabels

In het cisimcik-voorbeeld is de referentie niet één juiste optie maar de verdeling van het beoordelaarspanel. De nauwkeurigheid hier is daarom niet vergelijkbaar met de TDB-nauwkeurigheid.

| Model | accuracy | noul | choice | score | score-MAE (norm) | mean gold p | p50/p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `clef` | **0.855** | 0.950 | 0.895 | 0.718 | 0.120 | 0.788 | 488 / 2221 |
| `d3-27b` | 0.840 | 0.975 | 0.850 | 0.692 | 0.114 | 0.810 | 451 / 2547 |
| `d3-mini` | 0.832 | 0.975 | 0.900 | 0.615 | 0.142 | 0.749 | 78 / 388 |
| `clef-flash` | 0.786 | 0.875 | 0.921 | 0.564 | 0.168 | 0.728 | 148 / 810 |
| `d1-3b` | 0.624 | 0.800 | 0.605 | 0.462 | 0.220 | 0.560 | 88 / 201 |
| `d3-edge` | 0.429 | 0.500 | 0.450 | 0.333 | 0.311 | 0.370 | 15 / 52 |

`score`-vragen zijn het type waar elk model het meest mee worstelt. In lange en complexe Turkse zakelijke teksten neigt het model ertoe tussen aangrenzende niveaus te verschuiven: het onderscheid tussen "gemiddeld" en "gemiddeld-hoog" kan niet betrouwbaar worden gemaakt. Hoewel `clef` met 0.718 de hoogste nauwkeurigheid behaalt, betekent dit niet dat een geordende schaal in productie automatisch kan worden gebruikt.

---

## 4. Vertrouwen en onzekerheid

### 4.1. Wat `confidence` niet zegt

`confidence` drukt de waarschijnlijkheid uit die het model voor zijn gekozen antwoord rapporteert; het geeft niet rechtstreeks aan hoe waarschijnlijk het is dat het antwoord daadwerkelijk correct is. Een hoge gerapporteerde zekerheid betekent daarom niet dat de beslissing noodzakelijkerwijs juist is.

In de 42 dubbelzinnigheidscontroles in TDB kozen de 27B-modellen in 95–98% van de gevallen een van de geldige opties; de hoogste gemiddelde waarschijnlijkheid van de gekozen opties lag in het bereik 0.75–0.77. Met andere woorden: de modellen **neigen ernaar één van de opties te kiezen in plaats van zich te onthouden**, en doen dat met relatief hoge waarschijnlijkheid. De mate van onzekerheid wordt in de API-uitvoer niet door een afzonderlijk veld rechtstreeks weergegeven.

`label_mass` vult deze leemte gedeeltelijk, maar alleen in de D1-familie. In D3 en CLEF is de waarde vast 1.0; daarom kan `label_mass` in deze families niet op zichzelf als veiligheidsfilter worden gebruikt. De praktische consequentie: **een `confidence`-drempel is noodzakelijk maar niet voldoende**; die moet op gelabelde gegevens worden gekalibreerd.

### 4.2. Dekking-risicoanalyse

De grens tussen automatische beslissing en menselijke beoordeling wordt niet bepaald door de algehele nauwkeurigheid maar door **het foutpercentage bij beslissingen met hoog vertrouwen**. De onderstaande tabel is berekend over de 354 gescoorde gevallen van TDB door de `confidence`-drempel te variëren.

| Model | `conf ≥ 0.8` | `conf ≥ 0.9` | `conf ≥ 0.95` |
| --- | --- | --- | --- |
| `d3-27b` | Dekking 0.92 · risico 0.021 | **Dekking 0.87 · risico 0.013** | Dekking 0.80 · risico 0.011 |
| `clef` | Dekking 0.85 · risico 0.023 | Dekking 0.69 · risico 0.008 | Dekking 0.48 · risico 0.006 |
| `clef-flash` | Dekking 0.68 · risico 0.046 | Dekking 0.49 · risico 0.023 | Dekking 0.25 · risico 0.000 |
| `d3-mini` | Dekking 0.68 · risico 0.021 | Dekking 0.56 · risico 0.010 | Dekking 0.43 · risico 0.007 |
| `d1-3b` | Dekking 0.22 · risico 0.195 | Dekking 0.12 · risico 0.122 | Dekking 0.03 · risico 0.000 |
| `d3-edge` | Dekking 0.25 · risico 0.596 | Dekking 0.12 · risico 0.523 | Dekking 0.07 · risico 0.360 |

*Dekking: het aandeel beslissingen dat de vertrouwensdrempel haalt, ten opzichte van alle beslissingen. Risico: het foutpercentage onder automatisch afgeronde beslissingen.*

Het belangrijkste onderscheid in de tabel is dat tussen `d3-27b` en `clef`. Bij de drempel 0.90 rondt `d3-27b` 87% van de gevallen af met 1.3% risico, terwijl `clef` 69% afrondt met 0.8% risico. Lager risico wordt verkregen ten koste van meer menselijke beoordeling; de keuze hangt af van de kosten van een onjuiste beslissing.

Voor `d3-edge` is `confidence` geen betrouwbare indicator: zelfs wanneer het model hoog vertrouwen rapporteert, blijft het foutpercentage in het bereik 0.36–0.60. `d1-3b` vertoont op vergelijkbare wijze hoog risico bij lage dekking.

Deze resultaten gelden alleen voor de gebruikte dataset en testomstandigheden. Als de verdeling van productiegegevens verandert, kunnen dezelfde dekkings- en risiconiveaus niet worden gegarandeerd. De drempels moeten daarom opnieuw worden gekalibreerd op de eigen gelabelde gegevens van de toepassing.

---

## 5. Multimodale invoer, grensgevallen, prestaties

### 5.1. Beeld en video

Beeld en video kunnen aan het veld `state` worden toegevoegd. In D3 en CLEF worden beelden verwerkt tot maximaal 1.6 megapixel en video's met 2 frames per seconde en maximaal 32 frames. D1 ondersteunt alleen beeld en verkleint beelden tot 1024×1024.

| Model | Juiste antwoorden | Opmerking |
| --- | --- | --- |
| `d3-27b` | **8/8** | Het enige model dat elk item correct beantwoordt |
| `d3-mini` | 7/8 | — |
| `clef` | 7/8 | — |
| `d1-3b` | 6/7 | Video niet ondersteund; g7 is niet uitgevoerd, verzoeken met `videos` gaven een fout |
| `clef-flash` | 6/8 | — |
| `d3-edge` | 6/8 | — |

De gemeenschappelijke zwakte is het item met code `g3`: een numerieke waarde uit een grafiek aflezen. Elk model behalve `d3-27b` beantwoordde deze vraag onjuist en produceerde verschillende waarden in het bereik 0.7–1.9. De modellen kunnen de algemene trend van de grafiek bepalen, maar hebben moeite met **het aflezen van exacte numerieke waarden**. In workflows waar numerieke nauwkeurigheid cruciaal is, moet de modeluitvoer daarom worden geverifieerd tegen een gegevensbron die onafhankelijk van het beeld is.

In de D3-familie wordt media één keer verwerkt en wordt de resulterende representatie voor alle vragen gedeeld. In de tests gaven 16 vragen in één verzoek en in 16 afzonderlijke verzoeken hetzelfde resultaat; bij beeldintensieve workloads verlaagt dit de kosten doordat herhaalde verwerking wordt vermeden.

### 5.2. Prestaties bij gelijktijdige verzoeken

| Model | 1 client | 8 clients |
| --- | --- | --- |
| `d3-edge` | 118.6 | 335.6 |
| `d1-3b` | 21.0 | 107.2 |
| `d3-mini` | 19.0 | 39.2 |
| `clef-flash` | 8.8 | 16.8 |
| `d3-27b` | 2.5 | 5.9 |
| `clef` | 3.1 | 4.9 |

De waarden zijn afgeronde verzoeken per seconde (req/s), gemeten met verzoeken van één vraag; voor latentie verwijzen we naar de p50/p95-kolommen in §3. Bij één verzoek hangt de latentie grotendeels af van de duur van één forward pass. Omdat D3 elke vraag in een afzonderlijke pass evalueert terwijl CLEF meerdere vragen in één forward pass kan evalueren, groeit het latentievoordeel van CLEF naarmate het aantal vragen toeneemt.

---

## 6. Overdraagbaarheid tussen engines: vLLM en SGLang

Wil een systeem niet van één inferentie-engine afhankelijk zijn, dan moet bekend zijn of dezelfde API dezelfde beslissing produceert. Dezelfde clientscripts, dezelfde datasets en dezelfde modellenlijst zijn op beide engines uitgevoerd. Deze sectie meet de overeenstemming tussen twee engines met vastgezette versies; zij doet geen uitspraak over het algemene gedrag van de engines.

*V: vLLM, S: SGLang.*

| Model | TDB (V→S) | cisimcik (V→S) | std72 (V→S) | tr-set (V→S) | vision-8 (V→S) | Overdraagbaarheid |
| --- | --- | --- | --- | --- | --- | --- |
| `d3-27b` | 0.963 → 0.966 | 0.840 → 0.840 | 1.000 → 1.000 | 0.943 → 0.943 | 1.000 → 1.000 | Ja (beschermde modus) |
| `clef` | 0.9435 → 0.9435 | 0.855 → 0.856 | 1.000 → 0.972 | — → 0.914\* | 0.875 → 0.875 | Ja |
| `clef-flash` | 0.853 → 0.853 | 0.786 → 0.782 | 0.972 → 0.972 | — → 0.857\* | 0.750 → 0.875 | Ja |
| `d1-3b` | 0.545 → 0.568 | 0.624 → 0.622 | 0.931 → 0.931 | — → 0.829\* | 0.857 → 0.875 | Ja |
| `d3-mini` | 0.887 → **0.280** ⚠ | 0.832 → **0.319** ⚠ | 1.000 → **0.292** ⚠ | 0.886 → **0.257** ⚠ | 0.875 → **0.250** ⚠ | Nee |
| `d3-edge` | 0.336 → ✗ | — → ✗ | 0.819 → ✗ | 0.800 → ✗ | 0.750 → ✗ | Nee |

\* `tr-set` is alleen op SGLang uitgevoerd; in deze rijen is er geen vLLM-tegenhanger. ✗: het model kon in SGLang niet worden gestart.

### 6.1. Verschillen op API-niveau

Dat dezelfde clientcode in de D1- en CLEF-families op beide engines hetzelfde resultaat oplevert, toont aan dat de waargenomen verschillen niet van de client afkomstig zijn. Er zijn echter mismatches op schemaniveau, en de client moet elk daarvan afzonderlijk afhandelen.

1. **Het veld `model` is verplicht in SGLang.** Wanneer het ontbreekt, wordt `422 Field required` geretourneerd; in vLLM is het optioneel. Een compatibele client moet de modelnaam via `/v1/models` ophalen en aan de body toevoegen.
2. **`confidence` komt mogelijk niet overeen met de waarschijnlijkheid van de gekozen optie.** In de SGLang-uitvoer is het voorbeeld `choice: "diger", confidence: 0.303, probabilities: {…, "diger": 0.536}` waargenomen. Volgens het schema zouden deze twee waarden gelijk moeten zijn. In SGLang mag `confidence` niet zonder verificatie in drempelberekeningen worden gebruikt.
3. **`probabilities` ontbreekt in `noul`-antwoorden.** Terwijl vLLM een verdeling `{yes, no}` retourneert, geeft SGLang alleen `{"type":"noul","noul":0.117}`. De ontbrekende waarschijnlijkheid kan worden afgeleid met `P(no) = 1 − P(yes)` omdat `noul` binair is.
4. **De locatie van `label_mass` verschilt.** vLLM retourneert het onder `diagnostics[qid].{label_mass, argmax_is_label}`, terwijl SGLang het in het veld `x_label_mass` per antwoord retourneert; bovendien ontbreekt het veld in de uitvoer van `d3-mini`. Een ontbrekende waarde mag niet stilzwijgend als geldig worden beschouwd.
5. **Foutcodes verschillen.** Een onbekend vraagveld retourneert `400` in vLLM en `422` in SGLang; `chat_template_kwargs` wordt in vLLM genegeerd met `200`, maar retourneert in SGLang `400`. Opties met dezelfde naam na afkapping worden in beide engines geaccepteerd; de grenzen voor opties, vragen en niveaus zijn gelijk.

### 6.2. Snelheid

| Model | SGLang req/s (1 / 8) | Ten opzichte van vLLM |
| --- | --- | --- |
| `d1-3b` | 27 / 63 | Ongeveer 1/4 van vLLM bij hoge belasting |
| `d3-mini` | 17 / 37 | Vergelijkbaar; daalt bij 64 clients |
| `clef-flash` | 8 / 15 | Gelijkspel |
| `d3-27b` | 3 / 7 | Iets hoger in beschermde modus |
| `clef` | 3 / 5 | Gelijk |

De vLLM-waarden staan in §5.2.

### 6.3. Conclusie

**De resultaten in deze sectie zijn compatibiliteitsobservaties die alleen voor de geteste versies zijn verkregen; ze mogen niet als een algemene overdraagbaarheidsregel worden geïnterpreteerd.** In de geteste versies produceerden de label-token-methode (D1) en de gezamenlijke-schemamethode (CLEF) op beide engines vergelijkbare resultaten; het 27B D3-model is compatibel in beschermde modus. De verslechtering bij de kleine D3-modellen betekent niet dat de engine deze methode in het algemeen niet ondersteunt. Wat zij laat zien, is dat de answer-code-implementatie in die ontwikkelimage bij kleine modellen onjuiste resultaten opleverde. Omdat de fout bij één model en één versie is waargenomen, kan over de oorzaak geen hard oordeel worden gegeven; numerieke precisie, het attention-pad en de schema-afbeelding moeten afzonderlijk worden onderzocht.

Elke combinatie van model, engine en versie moet daarom vóór productie een afzonderlijke verificatietest doorlopen, en de test moet worden herhaald wanneer de engineversie wordt opgewaardeerd. Qua prestaties kan SGLang bij één verzoek iets lagere latentie bieden, terwijl het batchvoordeel van vLLM bij hoge gelijktijdigheid op `d1-3B` duidelijk wordt.

---

## 7. Beslisgids voor productie

### 7.1. Modelkeuze

| Optie | Wanneer | Beperking |
| --- | --- | --- |
| **`d3-27b`** (27B) | Wanneer nauwkeurigheid cruciaal is; bij complexe invoer met beeld en video | ~340 ms latentie bij één verzoek |
| **`clef`** (27B) | Wanneer het voordeel van één forward pass nodig is bij verzoeken met meerdere vragen | ~98% van de nauwkeurigheid van `d3-27b` |
| **`clef-flash`** (9B) | 2–9 vragen per verzoek; wanneer de kosten van een onjuiste beslissing laag zijn | TDB 0.853 |
| **`d3-mini`** (4B) | Realtime voorfiltering; budget van ~50 ms | TDB `score` 0.615; onbruikbaar in de geteste SGLang-image |
| **`d1-3b`** (3B) | Labelen met hoog volume; budget van ~60 ms | TDB 0.545; LFM 1.0-licentie |
| **`d3-edge`** (0.6B) | Alleen eerste routering; wanneer de foutkosten zeer laag zijn | TDB 0.336; vertrouwensdrempel zinloos |

Het verband tussen grootte en nauwkeurigheid is niet uniform: `clef` (27B) en `d3-27b` (27B) hebben vergelijkbare nauwkeurigheid, terwijl `d3-mini` (4B) op TDB beter is dan de 9B `clef-flash`. De keuze hangt af van de uitleesmethode en de taak, niet van het aantal parameters.

### 7.2. Aanbevolen beslisbeleid

1. **Drempel:** Als startbeleid worden `confidence ≥ 0.90` en `label_mass ≥ 0.95` samen vereist. Voor `d3-27b` rondt dit ongeveer 87% van de 354 gevallen automatisch af met 1.3% risico. De drempels worden vóór ingebruikname met de toepassingsgegevens geverifieerd.
2. **Doorsturen naar menselijke beoordeling:** Wanneer `label_mass < 0.95`, gaat de beslissing naar menselijke beoordeling. In D3 en CLEF staat dit veld vast op 1.0 en is het dus op zichzelf niet voldoende; taakcategorieën met een hoog foutpercentage (`by_category`) en Turkse `score`-vragen worden ook doorgestuurd.
3. **Registratie:** `confidence` en, waar mogelijk, de waarschijnlijkheidsverdeling worden bij elke beslissing opgeslagen; de drempels worden op basis van nieuwe resultaten bijgewerkt en de dekking-risicoanalyse wordt met echte gegevens herhaald.
4. **Opnieuw bevragen:** Bij batchgewijze uitvoeringen en uitvoeringen die van de geheugentoestand afhangen, kunnen waarschijnlijkheden met ongeveer ±0.07 variëren. Beslissingen dicht bij de drempel worden vóór publicatie met één verzoek geverifieerd; waar mogelijk wordt een configuratie met deterministisch gedrag (`VLLM_BATCH_INVARIANT`) overwogen.
5. **Wat te vermijden:** Een productiebeslissing uitsluitend op `d3-edge` baseren; `confidence` als gekalibreerde nauwkeurigheid beschouwen; d1-3B in een Apache-2.0-compatibel product opnemen zonder de licentievoorwaarden te onderzoeken.

---

## 8. Risico's, licenties en conclusie

### 8.1. Geldigheidsgrenzen

- De resultaten gelden voor één hardwareconfiguratie (DGX Spark GB10), één geheugenconfiguratie en de ontwikkelimages van twee engines.
- De TDB- en cisimcik-labels zijn binnen het bereik van deze studie niet gewijzigd; de resultaten moeten opnieuw worden geproduceerd wanneer nieuwe versies verschijnen.
- De 27B-resultaten zijn verkregen met het beschermde protocol (GPU-geheugengebruik 0.78, `--enforce-eager`, batchgewijze uitvoering); latentie en stabiliteit kunnen bij andere instellingen veranderen.
- Voor `tr-set` zijn `clef`, `clef-flash` en `d1-3b` alleen op SGLang gemeten; voor deze drie modellen kan geen vergelijking tussen engines worden gemaakt.
- Resultaatbestanden van nul bytes zijn niet als voltooid geteld, en ontbrekende tests zijn opnieuw uitgevoerd met `FORCE=1`.
- Het gebruik van de TypeSafe SDK met de twee engines valt buiten dit bereik.

### 8.2. Licenties

Status geverifieerd aan de hand van Hugging Face-modelkaarten en repositorybestanden per november 2026:

| Model | Licentie | Basismodel |
| --- | --- | --- |
| `vllm-sr/d3` | **Apache-2.0** | Qwen/Qwen3.8-27B (Apache-2.0) |
| `vllm-sr/d3-mini` | **Apache-2.0** | Qwen/Qwen3.5-4B (Apache-2.0) |
| `vllm-sr/d3-edge` | **Apache-2.0** | Qwen/Qwen3.5-0.8B (Apache-2.0) |
| `Cloudflare/clef` | **Apache-2.0** | Qwen/Qwen3.8-27B |
| `Cloudflare/clef-flash` | **Apache-2.0** | Qwen3.5 (9B) |
| `LiquidAI/d1-3B` | **LFM 1.0** ⚠ | LiquidAI/LFM2.5-VL-3B |

De D3- en CLEF-families zijn onder Apache-2.0 gepubliceerd; toch moeten bij herdistributie en afgeleid werk, naast de modelkaart, ook het licentiebestand van de gebruikte versie en eventuele aanvullende voorwaarden worden onderzocht.

**d1-3B is niet Apache-2.0.** De rechten die gelden in software onder Apache-2.0 mogen niet ongewijzigd van toepassing worden verondersteld; vóór commerciële distributie of opname in een product moet de actuele licentietekst van Liquid AI worden onderzocht en, indien nodig, juridisch advies worden ingewonnen.

### 8.3. Conclusie

Deze evaluatie laat zien dat de System One-familie onder bepaalde voorwaarden in productie kan worden gebruikt, maar dat een betrouwbare deployment vereist dat **het model, de inferentie-engine en de hardware samen worden geverifieerd**.

- **Nauwkeurigheid** neemt toe met de grootte, maar modellen uit de 4B-klasse komen veel dichter bij 27B dan verwacht; de keuze moet op taak en uitleesmethode worden gebaseerd, niet op het aantal parameters.
- **Vertrouwen** is niet gekalibreerd; onzekerheid wordt niet in de uitvoer weergegeven. Automatische beslissingen moeten worden opgebouwd met op gelabelde gegevens gevalideerde drempels en met menselijke beoordeling.
- **Turks**: de zwakste punten zijn geordende `score`-vragen en parafraseconsistentie; beide moeten afzonderlijk met gegevens van de eigen organisatie worden getest.
- **Overeenstemming tussen engines** hangt af van het model en de engineversie: D1 en CLEF zijn overdraagbaar in de geteste versies, 27B D3 is overdraagbaar in beschermde modus, en de kleine D3-modellen werken niet in de geteste SGLang-image.
- **Hardware** is een echte grens: 27B-modellen kunnen op GB10 niet betrouwbaar worden uitgevoerd zonder een beschermd werkprotocol.

De beslissing om naar productie te gaan moet berusten op drempels die op toepassingsspecifieke gelabelde gegevens zijn geverifieerd, op continue monitoring van beslissingsregistraties en op afzonderlijke acceptatietests voor elke combinatie van model, engine en versie.
