---
title: De eerste open-gewichtsalternatieven voor Jev
parent: White Papers
nav_order: 10
lang: nl
page_id: jev-open-weight-alternatives
date: 2026-10-06
card_tag: "Technische gids"
description: >-
  Zes open-weight typed-decision-modellen, vergeleken op één NVIDIA DGX Spark
  (GB10) via één gedeelde state + questions-interface en één set van 25
  vragen: nauwkeurigheid, kalibratie, gevoeligheid voor de optievolgorde en
  latentie — plus welk model bij welke taak past.
permalink: /papers/jev-open-weight-alternatives/
last_modified_date: 2026-10-06
toc: true
---

{% include company/block.html name="prepared_by" %}

> **Publicatiedatum:** oktober 2026 (het concept waar dit uit voortkomt is gedateerd 5 oktober 2026)
> **Reikwijdte:** Wat een typed-decision-model doet, welke open-weight modellen de aanpak vandaag volgen, hoe zes daarvan zich verhouden op één NVIDIA DGX Spark via één gedeelde interface en één set van 25 vragen, en hoe u er een kiest.
> **Opmerking:** Modelnamen, licenties en gemeten waarden gelden per oktober 2026. De set is bewust klein: het is een smoketest die de vorm van het veld toont, geen wetenschappelijke benchmark.

---

{:.no_toc}
## Inhoudsopgave

* TOC
{:toc}

---

## Managementsamenvatting

- **Wat het is.** TypeSafe **Jev** is een gesloten SaaS die *typed decisions* levert in plaats van chat: het neemt een `state` (tekst, afbeelding, logregel ...) en een set vragen, en beantwoordt die allemaal in één doorloop met **gekalibreerde kansen** — geen chain-of-thought, geen vrije tekst om te verwerken. Gedurende 2026 verscheen een **eerste generatie open-weight modellen** die dezelfde aanpak volgt.
- **Hoe ze vergeleken zijn.** Zes ervan draaien zij aan zij op één **NVIDIA DGX Spark (GB10)**, via één gedeelde `state + questions`-interface en één gedeelde set van 25 vragen: 10 `noul`, 10 `choice`, 5 `score`.
- **Nauwkeurigheid:** `openjev` (27B) lost de set op met 20/20 en verreweg de beste kalibratie (ECE 0.008) — tegen de prijs van 27B aan gewichten, ~190 ms en een **CC BY-NC 4.0**-licentie (niet-commercieel).
- **Praktische standaardkeuze:** `NeoHorse-Jev-4B` haalt diezelfde nauwkeurigheid **4x sneller** (44 ms) onder **Apache 2.0**, en levert zijn eigen Python-runtime.
- **Multimodaal:** `Jev-Omni` is de enige open-weight optie (afbeelding + audio + video).
- **Algemeen beeld:** `noul` / `choice` zijn solide, `score` is overal het zwakste primitief, en bij echt dubbelzinnige zinnen komen de onafhankelijke modellen uit op **dezelfde bias**.

---

## 1. Wat is een typed decision / System 1?

Een typed-decision-model chat niet. Het doet precies dit:

```
[state]      customer message · log line · screenshot · JSON row …
[questions]  {"department": {"type": "choice", "criteria": {billing: …, technical: …}}}
[answers]    {"department": {"label": "billing",
                             "probabilities": {"billing": 0.94, "technical": 0.04, …}}}
```

Er zijn drie vraagtypes, en die worden allemaal in **één forward pass** beantwoord —
geen chain-of-thought, geen vrije tekst om te verwerken. Vandaar ~10–200 ms per beslissing
en kansen die van nature **gekalibreerd** zijn:

| Primitief | Vraag | Uitvoer |
|---|---|---|
| `noul` | "Vraagt de klant om een terugbetaling?" | `true` / `false` plus kansen |
| `choice` | "Welke afdeling moet dit verzoek afhandelen?" | label plus kans per optie |
| `score` | "Hoe dringend is dit verzoek?" | ordinale niveauscore (bijv. 0–3) |

Wat de vergelijking eerlijk maakt, is dat elk model via **dezelfde invoer-/uitvoervorm**
wordt aangestuurd: elk zit achter één adapter (`scripts/jevclient.py`), zodat de aanroep
altijd `predict(state, questions)` is.

> **Referentie:** TypeSafe **Jev** (`jev-1.13.0`) is een gesloten SaaS: het
> `POST /v1/systemone`-eindpunt, **$0.042** per miljoen invoertokens (uitvoer gratis),
> 64k-context, **alleen tekst** als invoer. Het is met RLCD getraind op gekalibreerde
> beslissingen en serveert dezelfde gewichten aan elk account — geen fine-tuning per
> klant. Dit artikel probeert het niet te vervangen; het meet waar de eerste open-weight
> alternatieven vandaag staan. Elk open model hier imiteert Jev's wire format
> (`state + questions`); documentatie: [docs.typesafe.ai](https://docs.typesafe.ai/models).

---

## 2. De eerste generatie kandidaten

Vijf van de zes zijn Apache 2.0 — `openjev` is CC BY-NC 4.0, en `bekko-17m` heeft op zijn
modelkaart geen licentie toegewezen gekregen. Alle zes ondersteunen dezelfde drie
primitieven, maar ze draaien heel verschillend:

| # | Model | Omvang | Basisarchitectuur | Multimodaal | Uitvoerwijze | Licentie |
|---|---|---|---|---|---|---|
| 1 | `hotchpotch/bekko-system-one-v0-17m` | **17M** | ModernBERT / Ettin reranker | – | transformers (in-process) | niet toegewezen |
| 2 | `convaiinnovations/laya` | **421M** | ModernBERT-large, non-AR | – | pip + `laya-serve` | Apache 2.0 |
| 3 | `TokenRhythm/NeoHorse-Jev-4B` | **4B** | Qwen3.5-4B plus besliskop | 1 afbeelding | native wheel (`DecisionEngine`) | Apache 2.0 |
| 4 | `autotrust/JEV-9B` | **9B** (+40M LoRA) | Qwen3.5-9B bevroren backbone | – | vLLM + LoRA `jev-decision` | Apache 2.0 |
| 5 | `openjev/openjev` | **27B** | op Qwen3.5 gebaseerd, fp8 | afbeelding/DOM | vLLM + `helper/shim.py` | **CC BY-NC 4.0** |
| 6 | `akhilaaa3/Jev-Omni` | **12B** | Gemma 4 12B IT | **afbeelding + audio + video** | transformers | Apache 2.0 |

In het kort:

- **bekko-17m** — sub-milliseconde, gericht op CPU / browser / edge. Verreweg het
  kleinste lid.
- **laya** — 100+ talen, spotgoedkoop; `Router()` herkent de taal of de aanwijzing en
  kiest binnen een milliseconde het juiste checkpoint. `laya-serve` spreekt Jev's
  `/v1/systemone`-contract.
- **NeoHorse-Jev-4B** — levert zijn eigen Python-runtime (geen vLLM nodig), accepteert
  tekst plus één afbeelding. Het eenvoudigst te installeren "echte model".
- **JEV-9B** — System 1-beslissingsblok en System 2-tekstgeneratie op **één set
  gewichten**; interessant voor agentopstellingen.
- **openjev** — de volledigste beslissingsengine (tot 52 opties in één doorloop, DOM /
  schermafbeeldingen), maar hij wordt geserveerd als vLLM plus een aparte
  *kalibratieshim*.
- **Jev-Omni** — de enige echte multimodale optie; geladen via `trust_remote_code`.

### 2.1. Het ecosysteem: deze zes zijn een deel van de golf

De eerste generatie beperkt zich niet tot deze zes modellen. Onafhankelijke
ranglijsten laten een veel drukkere tabel zien:

- **[JevBench](https://github.com/fstandhartinger/jevbench)** — een bord met 95
  systemen (Imajev-4B, Plumb-4B, decider-4b, kev, djev, SemIf, reflex ...). Jev zelf
  staat daar 4e (63.29); het scoret 534 bevroren beslissingen langs de assen
  nauwkeurigheid, kalibratie, snelheid en kosten.
- **[S1MB](https://github.com/hotchpotch/S1MB)** — een mozaïek van 137 benchmarks; de
  drie primitieven heten er **exact hetzelfde**: *Choice / Noul / Score*. De TypeSafe
  Jev- en Bekko-adapters staan al in de adapterlijst — `bekko-17m` is hier de kleine
  vertegenwoordiger van dat ecosysteem.
- **[Jev Decision Index](https://huggingface.co/spaces/multimodalart/jev-decision-index)** —
  een door de community bijgehouden ranglijst.

Twee interessante observaties: (1) Jev zelf aanvaardt vandaag **alleen tekst** —
beslissingen op afbeelding / audio / video (`Jev-Omni`, NeoHorse hier) zijn een
uitbreiding *voorbij* de referentie; (2) deze borden melden gevoeligheid voor de
optievolgorde als een systematisch probleem (zie Sectie 4).

---

## 3. Platform en protocol

### 3.1. Platform

NVIDIA **DGX Spark (GB10)**: aarch64, 48 SM, compute capability 12.1, **130 GB unified
LPDDR5x**, Ubuntu 24.04, driver 580.173.02 / CUDA 13.0, ~3.7 TB NVMe. Het is een
desktopkast, dus de stack is Nvidia's standaard Linux-image en niet JetPack/L4T.

**Installatieval (kort):** de aarch64-`torch<2.13`-wheels op PyPI zijn
**alleen voor CPU**. Voor GPU-torch op GB10 moet u `torch==2.10.0+cu130` installeren via
`uv pip install --torch-backend cu130`; modelkaarten die `torch>=2.10,<2.11` vragen,
lopen hier meteen tegenaan. Elk model krijgt bovendien zijn eigen gepinde **venv**.

### 3.2. Testset

`scripts/bench-set.json` — 25 vragen met handmatig geschreven verwachte labels:

- **10 `noul`** (true/false) — terugbetalingen, phishing, prestatie-incidenten, enz.
- **10 `choice`** (4 opties, met beschrijvingscriteria) — c1..c4 delen het sjabloon
  "welke afdeling"; c5..c10 dekken andere taken.
- **5 `score`** — **4 ordinale niveaus** (`can wait / this week / today / right now`,
  0..3). Ontwerpnotitie: eerst is een rubric met 6 niveaus geprobeerd; het `score`-primitief
  van `laya` kon dat onderscheid niet leren, terwijl de rubric met 4 niveaus in elk model
  netjes scheidt.

`c4` is bewust lastig: *"I am applying for the backend engineering role. Where should
I send my CV?"* → verwacht `other`.

### 3.3. Metrieken

`scripts/bench.py <model> --shuffle 2` haalt elk model door dezelfde set en schrijft
één JSON-bestand.

| Metriek | Definitie |
|---|---|
| **accuracy** (noul / choice) | exacte overeenkomst met het menselijke label |
| **score MAE** | absolute fout tussen verwachte en voorspelde niveauscore (0–3) |
| **ECE (10 bins)** | Expected Calibration Error — "0.9 zeker" moet 9 van de 10 keer kloppen (lager is beter) |
| **flip** | het percentage antwoorden dat verandert wanneer de optievolgorde wordt geschud |
| **p50 / p95** | latentie van begin tot eind (cliëntzijde; HTTP inbegrepen, laden van het model niet) |

`--shuffle 2` doet 2 extra bevragingen per vraag (50 extra in totaal) om de
gevoeligheid voor de optievolgorde te meten. **Meetnotitie:** een eerdere versie van de
`flip`-metriek vergeleek scorelabels in niet-overeenkomende formaten (`"2"` versus
`"2.000"`), wat het percentage opblies; de labels zijn nu genormaliseerd en de meting is
opnieuw uitgevoerd.

---

## 4. Resultaten

| Model | noul (10) | choice (10) | score MAE | ECE | flip | p50 | p95 |
|---|---|---|---|---|---|---|---|
| **openjev** (27B) | **1.00** | **1.00** | **0.4** | **0.008** | 0.20 | 189.7 ms | 214.4 ms |
| **NeoHorse-Jev-4B** (4B) | **1.00** | **1.00** | 0.8 | 0.035 | 0.20 | **44.3 ms** | 57.6 ms |
| **Jev-Omni** (12B) | **1.00** | 0.90 | **0.4** | 0.045 | 0.22 | 143.7 ms | 162.6 ms |
| **JEV-9B** (9B + LoRA) | **1.00** | 0.90 | 0.6 | 0.022 | 0.20 | 99.6 ms | 109.7 ms |
| **laya** (421M) | 0.90 | 0.90 | 1.2 | 0.089 | 0.20 | **16.5 ms** | 18.0 ms |
| **bekko-17m** (17M) | 0.40 | **1.00** | 1.2 | 0.247 | 0.20 | **7.7 ms** | 10.1 ms |

*De getallen gelden voor deze 25 vragen — een smoketest, geen wetenschappelijke benchmark
(zie Sectie 6).*

**Lezing:**

- **openjev** maakt de set af (20/20, tekst) met de beste kalibratie met een ruime
  marge (ECE 0.008). p50 190 ms; de modelkaart meldt **~80 ms voor korte
  tekstbeslissingen** en ~210 ms voor een webstap (~1,460 tokens, 23 opties) op H100
  fp8. Het hier gerapporteerde getal is end-to-end (cliënt + shim + HTTP op GB10) en
  ligt in die band — de workloads zijn niet identiek, maar GB10 presteert in dezelfde
  klasse als H100. Kosten: 27B aan gewichten, CC-BY-NC.
- **NeoHorse-Jev-4B** haalt die nauwkeurigheid met een kant-en-klare runtime **~4x
  sneller** (44 ms) onder Apache 2.0 → de kandidaat "installeer het en gebruik het ook
  echt".
- **Jev-Omni** haalt 19/20 in één modaliteit en is het enige adres voor multimodale
  behoeften. De score MAE van 0.4 is de beste waarde (geldt alleen voor de rubric met 4
  niveaus).
- **JEV-9B** haalt 19/20 met de op één na beste kalibratie (ECE 0.022); System 1 +
  System 2 op één set gewichten is waardevol voor agentwerk.
- **laya** haalt 18/20 en is het snelst geserveerde model (16 ms); de zwakte bij `score`
  staat op de modelkaart. Nog steeds het juiste adres voor meertalig werk.
- **bekko-17m** scoort **10/10 bij `choice`** — opmerkelijk voor 17M — maar 4/10 bij
  `noul` (capaciteitsgrens). 7.7 ms maakt het tot een startpunt voor edge.

**Overstijgende patronen:**

- **`c4` bracht drie modellen precies dezelfde fout in** (allemaal `technical`, verwacht
  was `other`). Onafhankelijke modellen delen dezelfde bias bij dubbelzinnige zinnen —
  productiepijplijnen hebben nabij die grens een tweede controle of een mens in de lus
  nodig.
- **Gevoeligheid voor de optievolgorde is een systematisch probleem.** De `openjev`-
  modelkaart meldt een flippercentage van 2.3% na afstemming op 2,000 voorbeelden;
  JevBench meldt dat een klein open model op dezelfde taak van 72% naar 21% daalt
  wanneer de optievolgorde wordt omgedraaid. De hier gebruikte set heeft maar 2–4 opties
  per vraag, dus hogere percentages zijn te verwachten; gebruik in productie
  betrouwbaarheidsdrempels en leid antwoorden met lage zekerheid naar een tweede controle.
- **`score` is overal het zwakste primitief** (MAE 0.4–1.2). Bouw de productielogica op
  `noul` / `choice`; gebruik `score` alleen via drempels.
- **Kleine modellen leunen op de beschrijvingen van de opties.** De 10/10 van Bekko bij
  `choice` komt van zorgvuldig geschreven `criteria`-beschrijvingen — laat ze niet leeg.

---

## 5. Welk model, wanneer?

```
Need image / audio / video in the decision?
├── Text + 1 image, 44 ms   →  NeoHorse-Jev-4B      (Apache 2.0)
└── Audio + video           →  Jev-Omni             (12B, the only open multimodal)
└── No ↓

Runs on device / browser / CPU?
├── Yes →  bekko-17m        (17M; prefer `choice` over `noul`)
└── No ↓

10–100+ languages?
├── Yes →  laya             (Router, 16 ms; fine-tune on your data)
└── No ↓

Long documents / DOM / 50+ options, and best calibration?
├── Yes →  openjev          (27B, 190 ms, **CC-BY-NC**)
└── No ↓

Code generation + decision on one weight set?
├── Yes →  JEV-9B           (System 1 + 2, 100 ms)
└── Default →  NeoHorse-Jev-4B (44 ms, Apache 2.0)
```

**Licentiewaarschuwing:** `openjev` is gesloten voor commercieel gebruik (CC BY-NC 4.0 —
een commerciële licentie wordt apart verkocht); `bekko-17m` heeft op zijn modelkaart geen
licentie toegewezen gekregen, dus controleer de licenties van de onderdelen vóór
productie. De overige vier zijn Apache 2.0.

---

## 6. Beperkingen

1. **25 vragen = smoketest.** Statistische kracht is laag; `score` is met maar 5
   voorbeelden gepolst. Voor serieuze claims vergroot u de set (zie Sectie 7) en
   kruist u de uitkomst met onafhankelijke benchmarks:
   [Jev Decision Index](https://huggingface.co/spaces/multimodalart/jev-decision-index),
   [S1MB](https://github.com/hotchpotch/S1MB),
   [JevBench](https://github.com/fstandhartinger/jevbench),
   [decision-models-under-pressure](https://github.com/gazelle93/decision-models-under-pressure).
2. **Eén apparaat, één sessie.** GB10 is één meetpunt; latentie wordt aan de cliëntzijde
   gemeten (HTTP inbegrepen, laden van het model niet).
3. **Eén taal (Engelse invoer).** De meertalige claim van `laya` wordt door deze set niet
   op de proef gesteld.
4. **Multimodaal is niet geverifieerd.** `Jev-Omni` deed mee aan de test in één
   modaliteit; het pad via afbeelding / audio / video is bewust buiten beschouwing
   gelaten.
5. **flip is gevoelig voor het aantal opties.** Bij 2–4 opties heeft schudden een groot
   effect; de percentages van 2–7% op de modelkaarten komen uit tests met 20+ opties.
   Bovendien is de meting opnieuw uitgevoerd nadat de labelopmaakfout uit Sectie 3.3 was
   hersteld.

---

## 7. Reproduceerbaarheid

De run houdt alles onder één hoofdmap — één map met de gedownloade gewichten, één
gepinde virtuele omgeving per model — en wordt aangestuurd door een kleine set shell- en
Python-bestanden die de zes modellen achter één adapter plaatsen. De tabel hieronder
laat zien hoe die set eruitziet, zodat de run opnieuw opgebouwd kan worden:

```bash
# setup + download (once)
bash scripts/00-setup.sh
bash scripts/01-download.sh all

# bench all six models in one command (starts and stops servers itself)
nohup bash scripts/rerun-bench.sh > out/rerun-bench.log 2>&1 &
python3 scripts/summary.py        # summary table
```

| Script | Doel |
|---|---|
| `00-setup.sh` | 5 gepinde `uv`-venvs (`--torch-backend cu130`, installatie in serie) |
| `01-download.sh` | downloadt alle zes modellen naar `models/` |
| `02..07` | serveer- en smoketestscripts per model (laya :8102, jev9b :8104, openjev :8105+:8106) |
| `jevclient.py` | gedeelde adapterlaag `predict(state, questions)` (6 modellen) |
| `bench-set.json` | de gedeelde 25 vragen plus verwachte labels |
| `bench.py` | test voor één model (accuracy, MAE, ECE, flip, p50/p95) |
| `rerun-bench.sh` | draait alle zes modellen achter elkaar |
| `summary.py` | `out/bench-*.json` → samenvatting in één regel |

**Om de set te vergroten:** voeg `items` toe aan `bench-set.json` met hetzelfde schema
(`id`, `kind`, `state`, `question`, `criteria`, `expect`); `bench.py` vraagt geen
wijzigingen. Aanbevolen wordt de `score`-rubric op 4 niveaus te houden (zie Sectie 3.2).

---

## Bronnen

**Typed decisions en het referentiemodel:**

- TypeSafe Jev-modeldocumentatie — <https://docs.typesafe.ai/models>

**Onafhankelijke ranglijsten:**

- JevBench — <https://github.com/fstandhartinger/jevbench>
- S1MB — <https://github.com/hotchpotch/S1MB>
- Jev Decision Index — <https://huggingface.co/spaces/multimodalart/jev-decision-index>
- decision-models-under-pressure — <https://github.com/gazelle93/decision-models-under-pressure>

**Hardware:**

- NVIDIA DGX Spark — <https://www.nvidia.com/en-us/products/workstations/dgx-spark/>

**Verwante artikelen en gereedschap:**

- [Local LLM Usage Guide]({{ '/papers/local-llm-guide/' | relative_url }})
- [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }})

---

### Opmerkingen

- **Metingen:** accuracy, MAE, ECE, flip en latentie komen uit één run van de gedeelde
  set van 25 vragen op het platform uit Sectie 3.1, via één adapter per model. Latentie
  wordt aan de cliëntzijde en end-to-end gemeten: HTTP inbegrepen, laden van het model
  niet.
- **Reikwijdte van de set:** 25 vragen is een smoketest. De getallen beschrijven deze zes
  modellen op deze set; het is geen rangorde van het bredere veld — daarvoor zijn de
  onafhankelijke ranglijsten hierboven er.
- **Licenties:** open gewichten zijn niet hetzelfde als vrij gebruik. `openjev` is CC
  BY-NC 4.0 en gesloten voor commercieel gebruik; `bekko-17m` heeft op zijn modelkaart
  geen licentie toegewezen. Controleer de licenties van de onderdelen vóór productie.
- **Actualiteit:** modelversies, licenties en kalibratiewaarden gelden per oktober 2026.

---

{% include company/block.html name="cta_logo" %}

**Laten we uw infrastructuur voor beslissingsmodellen samen plannen.** Voor hulp bij het
kiezen, dimensioneren en uitrollen van een typed-decision-model op DGX Spark of Jetson,
{% include company/block.html name="contact_cta" %}