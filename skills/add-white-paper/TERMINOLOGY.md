# Translating a white paper — rules and terminology

Every page exists in English (the source), Turkish and Dutch. English is
written first; the other two are translations of it. This file is how a
translation is made, so that every paper, and every translator, uses the same
words. Follow it for a new paper, a revised one, and any text on the explorers
or in the site's interface.

## What is never translated

Copy these **byte for byte** from the English file:

- **Code:** fenced code blocks — **comments inside them included** — and
  inline `code`: commands, file paths, flags, YAML, JSON, log output, error
  messages quoted from a tool. (Older Turkish pages translated some code
  comments; new translations do not.)
- **Liquid and HTML mechanics:** every `{% … %}` and `{{ … }}` tag, HTML tag
  names, attributes and classes (`<div class="product-card" markdown="1">`),
  image paths, link URLs.
- **The title of `papers/index.md` in every language: `White Papers`.** The
  sidebar puts a paper under the page whose title equals its `parent`; a
  translated title leaves that language's papers out of the menu.
- **Front matter keys and these values:** `parent`, `nav_order`, `page_id`,
  `date`, `permalink`, `last_modified_date`, `toc`, `layout`. `lang` is `tr` or
  `nl`.
- **Names:** products (DGX Spark, Jetson AGX Thor, RTX PRO 6000 Blackwell),
  models (Qwen3.6-27B, DeepSeek-V4.1-Flash), software (vLLM, SGLang, sparkrun,
  NCCL, Ollama), companies, benchmark names (TurkishMMLU, SWE-bench), and the
  two explorer names — see below.
- **Numbers, units and their format:** keep the English decimal point and
  thousands separator (`1.5 GB`, `12,000 tokens`), exactly as the tables,
  charts and benchmark data show them. Metric abbreviations stay: TTFT, TPS,
  ITL, RPS, p90, Max C, TP/DP/PP.

## What is translated

- **Prose, headings, table text, list items, image alt text and captions.**
- **Front matter:** `title`, `description`, `card_tag`.
- **The table of contents:** the link text is the translated heading, and the
  `#anchor` is the anchor of that translated heading as the site generates it —
  lowercase, spaces to hyphens, punctuation dropped, accented letters kept
  (`## Ön Koşullar` → `#ön-koşullar`; `## Vereisten` → `#vereisten`). Check
  every in-page link on the built page.
- **Images** stay the English files, even diagrams with English text in them,
  unless the paper already has language-specific versions.
- **Links between papers** keep their `{{ '/papers/x/' | relative_url }}` form;
  the site adds the language prefix.

Translate the meaning faithfully: every sentence, number, caveat and hedge of
the English appears in the translation, and nothing is added. Where a sentence
is awkward to carry over, restructure it, but keep what it claims.

**Register.** Turkish: formal *siz*. Dutch: formal *u*. Both technical and
direct, the tone of the Local LLM guide.

**First use of a translated technical term:** give the English in parentheses
the first time it appears in a paper — *çıkarım (inference)*, *doorvoer
(throughput)* — then use the translation alone.

## Terminology

Use the term in the language's column. Where the column repeats the English,
that language's technical writing keeps the English word; write it as shown
(Dutch joins an English or abbreviated first part with a hyphen: *KV-cache*,
*LLM-inferentie*).

| English | Türkçe | Nederlands |
|---|---|---|
| inference | çıkarım | inferentie |
| inference engine | çıkarım motoru | inferentie-engine |
| engine (vLLM, SGLang) | motor | engine |
| memory | bellek | geheugen |
| unified memory | birleşik bellek (unified memory) | unified memory |
| host RAM / system RAM | sistem RAM'i | systeem-RAM |
| pinned memory | sabitlenmiş bellek | pinned memory |
| cache | önbellek | cache |
| KV cache | KV cache | KV-cache |
| KV cache memory | KV cache belleği | KV-cachegeheugen |
| page cache | sayfa önbelleği | paginacache |
| buffer | arabellek | buffer |
| allocation | tahsis | toewijzing |
| weights | ağırlıklar | gewichten |
| parameters | parametreler | parameters |
| quantization | kuantizasyon | kwantisatie |
| context length / window | bağlam uzunluğu / penceresi | contextlengte / contextvenster |
| token, prompt, prefill, decode, batch | *(English)* | *(English)* |
| embedding, checkpoint, attention | *(English)* | *(English)* |
| offloading; to offload | taşıma; taşımak — first use *taşıma (offloading)*; network "hardware offload" stays English | offloading; offloaden (geoffload) — never *uitbesteden* |
| conditional memory | conditional memory | conditional memory |
| conditional computation | conditional computation | conditional computation |
| Engram table | Engram tablosu | Engram-tabel |
| hash head | hash fonksiyonu (hash head) | hash-head |
| sparsity | seyreklik (sparsity) | sparsity |
| bottleneck | darboğaz | knelpunt |
| expert / router (MoE) | uzman / yönlendirici | expert / router |
| hidden state | gizli durum | verborgen toestand |
| forward pass | ileri yayılım | forward pass |
| prefetching | önceden getirme | prefetching |
| lookup table | arama tablosu | opzoektabel |
| speculative decoding | Spekülatif Kod Çözme | speculatieve decodering |
| tensor / pipeline / data parallelism | tensör / pipeline / veri paralelliği | tensor- / pipeline- / dataparallellisme |
| throughput | verim | doorvoer |
| latency | gecikme | latentie |
| bandwidth | bant genişliği | bandbreedte |
| concurrency | eşzamanlılık | gelijktijdigheid |
| concurrent requests | eşzamanlı istekler | gelijktijdige verzoeken |
| request | istek | verzoek |
| tokens per second | saniye başına token | tokens per seconde |
| aggregate TPS | toplam TPS | geaggregeerde TPS |
| capacity (users) | kapasite | capaciteit |
| chat / agentic user | sohbet / agentic kullanıcı | chat- / agentische gebruiker |
| target, threshold | hedef, eşik | doel, drempel |
| measurement, run | ölçüm, koşu | meting, run |
| benchmark | benchmark | benchmark |
| cluster | cluster | cluster |
| node | düğüm | node |
| switch, port, cable | switch, port, kablo | switch, poort, kabel |
| deployment | dağıtım | deployment |
| setup / installation | kurulum | installatie |
| setup guide | kurulum rehberi | installatiehandleiding |
| guide | rehber | handleiding |
| troubleshooting | sorun giderme | probleemoplossing |
| prerequisites | ön koşullar | vereisten |
| data center | veri merkezi | datacenter |
| edge | uç (edge) | edge |
| workstation | iş istasyonu | werkstation |
| graphics card | ekran kartı | grafische kaart |
| fine-tuning | fine-tuning | fine-tuning |
| open-weight model | açık ağırlıklı model | open-weight model |
| white paper | white paper | whitepaper |
| typed decision | typed decision | typed decision |
| calibration, calibrated | kalibrasyon, kalibre | kalibratie, gekalibreerd |
| primitive (`noul` / `choice` / `score`) | primitif | primitief |
| decision head | karar başlığı | besliskop |
| ordinal level score / index | sıralı seviye indeksi | ordinale niveauscore |
| rubric (level rubric) | rubrik | rubric |
| option-order sensitivity | şık sırasına duyarlılık | gevoeligheid voor de optievolgorde |
| flip rate | flip oranı | flippercentage |
| smoke test / smoke set | smoke test / smoke seti | smoketest / smoketestset |
| chain-of-thought | chain-of-thought | chain-of-thought |
| wire format, adapter, shim | *(English)* | *(English)* |
| calibration shim | kalibrasyon shim'i | kalibratieshim |
| licence (model / component licence) | lisans | licentie |
| ambiguous sentence; human-in-the-loop | belirsiz cümle; insan onayı | dubbelzinnige zin; mens in de lus |
| label, expected label | etiket, beklenen etiket | label, verwacht label |
| metric names (ECE, MAE, accuracy, flip, p50/p95) | *(English)* | *(English)* |
| appendix | ek | bijlage |

### More Dutch terms

Settled when the first Dutch set was translated. Turkish: use the term the
existing Turkish pages use.

| English | Nederlands |
|---|---|
| management network / compute network | managementnetwerk / compute-netwerk |
| recipe (sparkrun) | recipe |
| container image | containerimage |
| storage | opslag |
| storage driver, traffic class, bonding, lossless, fabric, leaf/spine | *(English)* |
| hostname, mount point, shared folder | hostnaam, mountpoint, gedeelde map |
| passwordless sudo | sudo zonder wachtwoord |
| point-to-point / ring topology | point-to-point-topologie / ringtopologie |
| breakout cable, jumbo frame | breakoutkabel, jumboframe |
| health check | statuscontrole |
| performance tuning | prestatie-afstemming |
| deployed (a model) | uitgerold |
| workload, serving, reasoning, sparse/dense, all-reduce | *(English)* |
| scale-up / scale-out (architecture) | *(English)*; the verb *scale out* → uitschalen |
| air-cooled / liquid cooling | luchtgekoeld / vloeistofkoeling |
| power density, failure domain, lead time | vermogensdichtheid, storingsdomein, levertijd |
| AI factory | AI-fabriek |
| expert / model parallelism | expertparallellisme / modelparallellisme |
| draft model, acceptance ratio | draftmodel, acceptatieverhouding |
| memory-bound / compute-bound | geheugengebonden / rekengebonden |
| memory bandwidth | geheugenbandbreedte |
| evaluation set | evaluatieset |
| catastrophic forgetting | catastrofaal vergeten |
| hallucination | hallucinatie |
| data sovereignty | datasoevereiniteit |
| Total Cost of Ownership | totale eigendomskosten (TCO) |
| document Q&A | vraag en antwoord over documenten |
| gateway, air-gapped, fork, overhead, tool calling, learning rate, on-prem | *(English)* |
| bottleneck, saturation, trade-off | knelpunt, verzadiging, afweging |
| arithmetic intensity | rekenintensiteit |
| memory hierarchy / tier / footprint | geheugenhiërarchie / geheugenlaag / geheugenvoetafdruk |
| host memory (pinned host memory) | host-geheugen |
| headroom | reserve |
| sizing | dimensionering |
| recurrent state | recurrente toestand |
| model card | modelkaart |
| tail latency | staartlatentie |
| think time | denktijd |
| Little's Law | de wet van Little |
| break-even point | break-evenpunt |
| replica, load balancer, high availability | replica, loadbalancer, hoge beschikbaarheid (HA) |
| usage multiplier | gebruiksfactor |
| speed limit / memory limit | snelheidslimiet / geheugenlimiet |
| capability (score) | vaardigheid(sscore) — never *capaciteit*, which is users |
| sweep (of concurrency levels) | reeks (gelijktijdigheidsreeks) |
| frame rate, target FPS, frame drop | framerate, doel-FPS, frameverlies |
| detection model, precision, input resolution | detectiemodel, precisie, inputresolutie |
| video analytics | videoanalyse |
| embedded systems | embedded systemen |
| lower bound / upper bound | ondergrens / bovengrens |
| worked example | rekenvoorbeeld |
| Executive Summary | Managementsamenvatting |
| Glossary, Resources, Notes, Appendix | Woordenlijst, Bronnen, Opmerkingen, Bijlage |
| Lessons Learned | Geleerde lessen |
| Prepared by | Opgesteld door |

Keep in English: interface labels of other tools as they appear on screen
(GNOME's *Wired Settings*, *Apply*), tool output, the benchmark tool's metric
names when quoted (*Throughput (RPS)*), PASS/FAIL, and the Artificial Analysis
*Intelligence Index* / *Agentic Index*.

**Headings and anchors:** avoid Dutch headings that start a compound with a
dangling hyphen (*Systeem- en firmware-updates*): the site turns it into a
double hyphen in the anchor. Reword (*Updates van systeem en firmware*).

**The explorers:** Turkish translates their names — *LLM Çıkarım Benchmark
Gezgini*, *CV Çıkarım Benchmark Gezgini*. Dutch keeps the English product
names everywhere, titles included: *LLM Inference Benchmark Explorer*, *CV
Inference Benchmark Explorer*.

**`card_tag`** — reuse an existing one:

| English | Türkçe | Nederlands |
|---|---|---|
| Decision Guide | Karar Rehberi | Beslisgids |
| Technical Guide | Teknik Rehber | Technische gids |
| Architecture Comparison | Mimari Karşılaştırma | Architectuurvergelijking |
| Cluster Setup | Cluster Kurulumu | Clusterinstallatie |
| LLM Benchmark | LLM Benchmark | LLM-benchmark |
| LLM Scaling | LLM Ölçekleme | LLM-schaling |
| LLM Deployment | LLM Dağıtımı | LLM-deployment |
| CV Benchmark | CV Benchmark | CV-benchmark |

A term missing from these tables: choose the word the language's technical
press uses, use it the same way throughout the paper, and add it here in the
same change.

## Check it

```bash
python3 _tools/check_translation.py        # every translation against its English source
python3 _tools/check_papers.py             # twins, front matter, tables
```

`check_translation.py` compares each translation with its English source and
fails on any difference in code blocks, Liquid tags, image paths, link URLs,
table shape or heading structure, and on paragraphs left in English. After
building the site, check the in-page links too:

```bash
python3 _tools/check_translation.py --anchors _site
```
