---
title: Jev'e Açık Ağırlıklı İlk Alternatifler
parent: White Papers
nav_order: 10
lang: tr
page_id: jev-open-weight-alternatives
date: 2026-10-06
card_tag: "Teknik Rehber"
description: >-
  Altı açık ağırlıklı typed-decision modeli, tek bir NVIDIA DGX Spark (GB10)
  üzerinde ortak bir state + questions arayüzü ve 25 soruluk tek bir setle
  karşılaştırıldı: doğruluk, kalibrasyon, şık sırasına duyarlılık ve gecikme —
  ve hangi işe hangi modelin uyduğu.
permalink: /papers/jev-open-weight-alternatives/
last_modified_date: 2026-10-06
toc: true
---

{% include company/block.html name="prepared_by" %}

> **Yayın tarihi:** Ekim 2026 (kaynak taslak 5 Ekim 2026 tarihli)
> **Kapsam:** Bir typed-decision modelin ne yaptığı, yaklaşımı bugün izleyen açık ağırlıklı modeller, bunlardan altısının tek bir NVIDIA DGX Spark üzerinde ortak bir arayüz ve 25 soruluk tek bir setle nasıl karşılaştığı ve aralarından nasıl seçim yapılacağı.
> **Not:** Model adları, lisanslar ve ölçülen değerler Ekim 2026 itibarıyla geçerlidir. Set bilerek küçüktür: alanın genel görünümünü veren bir smoke testtir, bilimsel bir benchmark değildir.

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## Yönetici Özeti

- **Nedir.** TypeSafe **Jev**, sohbet yerine *typed decision* üreten kapalı bir SaaS'tir: bir `state` (metin, görüntü, log satırı ...) ve bir soru kümesi alır, hepsini **kalibre olasılıklarla** tek geçişte cevaplar — chain-of-thought yok, parse edilecek serbest metin yok. 2026 boyunca aynı yaklaşımı izleyen **ilk jenerasyon açık ağırlıklı modeller** çıkmaya başladı.
- **Nasıl karşılaştırıldı.** Bunlardan altısı, tek bir **NVIDIA DGX Spark (GB10)** üzerinde ortak bir `state + questions` arayüzü ve ortak 25 soruluk bir setle (10 `noul`, 10 `choice`, 5 `score`) yan yana ölçüldü.
- **Doğruluk:** `openjev` (27B) seti 20/20 tamamlar ve açık ara en iyi kalibrasyonu verir (ECE 0.008) — bedeli 27B ağırlık, ~190 ms ve **CC BY-NC 4.0** lisansıdır (ticari kullanıma kapalı).
- **Pratik varsayılan:** `NeoHorse-Jev-4B` aynı doğruluğu **4 kat hızlı** (44 ms) ve **Apache 2.0** ile verir, kendi Python runtime'ı ile gelir.
- **Multimodal:** açık ağırlıklılar içinde tek seçenek `Jev-Omni`'dir (görüntü + ses + video).
- **Genel desen:** `noul` / `choice` sağlamdır, `score` her modelde en zayıf primitiftir ve gerçekten belirsiz cümlelerde bağımsız modeller **aynı önyargıya** düşer.

---

## 1. Typed Decision / "System 1" Nedir?

Bir typed-decision modeli sohbet etmez. Şu tek şeyi yapar:

```
[state]      customer message · log line · screenshot · JSON row …
[questions]  {"department": {"type": "choice", "criteria": {billing: …, technical: …}}}
[answers]    {"department": {"label": "billing",
                             "probabilities": {"billing": 0.94, "technical": 0.04, …}}}
```

Üç soru tipi vardır ve hepsi **tek ileri yayılımda (forward pass)** cevaplanır —
chain-of-thought yok, parse edilecek serbest metin yok; dolayısıyla karar başına
~10–200 ms ve doğası gereği **kalibre** olasılıklar:

| Primitif | Soru | Çıktı |
|---|---|---|
| `noul` | "Müşteri iade istiyor mu?" | `true` / `false` + olasılıklar |
| `choice` | "Bu talebi hangi departman almalı?" | etiket + her şık için olasılık |
| `score` | "Bu talep ne kadar acil?" | sıralı seviye indeksi (ör. 0–3) |

Karşılaştırmayı adil kılan şey, tüm modellerin **aynı girdi-çıktı şekline** uydurulmasıdır:
her model tek bir adaptörün (`scripts/jevclient.py`) arkasına gizlenir, böylece çağrı
her zaman `predict(state, questions)` olur.

> **Referans:** TypeSafe **Jev** (`jev-1.13.0`) kapalı bir SaaS'tir: `POST /v1/systemone`
> uç noktası, milyon girdi token'ı başına **$0.042** (çıktı ücretsiz), 64k bağlam,
> girdi **yalnızca metin**. Kalibre kararlar için RLCD ile eğitilir ve tüm hesaplara
> aynı ağırlıklarla servis edilir — müşteri verisiyle fine-tune yok. Bu çalışma onun
> yerine geçmeyi denemez; açık ağırlıklı ilk alternatiflerin bugün nerede durduğunu ölçer.
> Buradaki açık modellerin hepsi Jev'in wire formatını (`state + questions`) taklit eder;
> doküman: [docs.typesafe.ai](https://docs.typesafe.ai/models).

---

## 2. İlk Jenerasyon Adaylar

Altı modelden beşi Apache 2.0'dır — `openjev` CC BY-NC 4.0'tir ve `bekko-17m`'nin model
kartında atanmış bir lisans yoktur. Hepsi aynı üç primitifi destekler, ancak çalışma
yolları çok farklıdır:

| # | Model | Boyut | Taban mimari | Multimodal | Çalışma yolu | Lisans |
|---|---|---|---|---|---|---|
| 1 | `hotchpotch/bekko-system-one-v0-17m` | **17M** | ModernBERT / Ettin reranker | – | transformers (in-process) | atanmamış |
| 2 | `convaiinnovations/laya` | **421M** | ModernBERT-large, non-AR | – | pip + `laya-serve` | Apache 2.0 |
| 3 | `TokenRhythm/NeoHorse-Jev-4B` | **4B** | Qwen3.5-4B + karar başlığı | 1 görsel | native wheel (`DecisionEngine`) | Apache 2.0 |
| 4 | `autotrust/JEV-9B` | **9B** (+40M LoRA) | Qwen3.5-9B donmuş backbone | – | vLLM + LoRA `jev-decision` | Apache 2.0 |
| 5 | `openjev/openjev` | **27B** | Qwen3.5 tabanlı, fp8 | görsel/DOM | vLLM + `helper/shim.py` | **CC BY-NC 4.0** |
| 6 | `akhilaaa3/Jev-Omni` | **12B** | Gemma 4 12B IT | **görüntü + ses + video** | transformers | Apache 2.0 |

Kısa karakterler:

- **bekko-17m** — milisaniye altı, CPU / tarayıcı / edge hedefi. Açık ara en küçük üye.
- **laya** — 100+ dil, çok ucuz; `Router()` dil/ipucu tespitiyle doğru checkpoint'i
  milisaniye altında seçer. `laya-serve`, Jev'in `/v1/systemone` sözleşmesini konuşur.
- **NeoHorse-Jev-4B** — kendi Python runtime'ı ile gelir (vLLM gerekmez), metin ve tek
  görsel kabul eder. Kurulumu en kolay "gerçek model".
- **JEV-9B** — System 1 karar bloğu ve System 2 metin üretimi **tek ağırlık kümesinde**;
  ajan kurguları için ilginç.
- **openjev** — en kapsamlı karar motoru (tek geçişte 52 şıkka kadar, DOM / ekran
  görüntüsü), ancak vLLM ve ayrı bir *kalibrasyon shim*'i olarak servis edilir.
- **Jev-Omni** — tek gerçek multimodal seçenek; `trust_remote_code` ile yüklenir.

### 2.1. Ekosistem: bu altılı, dalganın bir bölümü

İlk jenerasyon bu altı modelle sınırlı değildir. Bağımsız panolar çok daha kalabalık bir
tablo gösterir:

- **[JevBench](https://github.com/fstandhartinger/jevbench)** — 95 sistemlik bir pano
  (Imajev-4B, Plumb-4B, decider-4b, kev, djev, SemIf, reflex ...). Jev'in kendisi orada
  4. sıradadır (63.29); 534 dondurulmuş kararı doğruluk, kalibrasyon, hız ve maliyet
  eksenlerinde puanlar.
- **[S1MB](https://github.com/hotchpotch/S1MB)** — 137 benchmark'lık bir mozaik; üç
  primitifi **birebir aynı isimleri** taşır: *Choice / Noul / Score*. TypeSafe Jev ve
  Bekko adaptörleri zaten adaptör listesindedir — buradaki `bekko-17m` o ekosistemin
  küçük temsilcisidir.
- **[Jev Decision Index](https://huggingface.co/spaces/multimodalart/jev-decision-index)** —
  topluluk tarafından sürdürülen bir sıralama.

İki ilginç gözlem: (1) Jev'in kendisi bugün **yalnızca metin** kabul eder — görüntü / ses
/ video kararları (buradaki `Jev-Omni`, NeoHorse) referansın *ötesine* geçen bir uzantıdır;
(2) bu panolar şık sırasına duyarlılığı sistematik bir sorun olarak raporlar (Bölüm 4).

---

## 3. Ortam ve Protokol

### 3.1. Ortam

NVIDIA **DGX Spark (GB10)**: aarch64, 48 SM, compute capability 12.1, **130 GB birleşik
LPDDR5x**, Ubuntu 24.04, driver 580.173.02 / CUDA 13.0, ~3.7 TB NVMe. Masaüstü bir kutu
olduğundan yazılım yığını JetPack/L4T değil, NVIDIA'nın standart Linux imajıdır.

**Kurulum tuzağı (kısa):** PyPI'daki aarch64 `torch<2.13` tekerlekleri **CPU-only**'dir.
GB10'ta GPU'lu torch için `uv pip install --torch-backend cu130` ile
`torch==2.10.0+cu130` kurmalısınız; `torch>=2.10,<2.11` isteyen model kartları bu ikilemle
hemen karşılaşır. Her model ayrıca kendi pin'li **venv**'ini alır.

### 3.2. Test seti

`scripts/bench-set.json` — insan eliyle yazılmış beklenen etiketleriyle 25 soru:

- **10 `noul`** (true/false) — iade, oltalama, performans olayları vb.
- **10 `choice`** (4 şıklı, açıklama kriterleriyle) — c1..c4 aynı "hangi departman"
  şablonunu paylaşır; c5..c10 farklı görevleri kapsar.
- **5 `score`** — **4 sıralı seviye** (`can wait / this week / today / right now`,
  0..3). Tasarım notu: önce 6 seviyelik bir rubrik denendi; `laya`'nın `score` primitifi
  o ayrımı öğrenemedi, 4 seviyeli rubrik ise tüm modellerde temiz ayrışıyor.

`c4` bilerek zordur: *"I am applying for the backend engineering role. Where should
I send my CV?"* → beklenen `other`.

### 3.3. Metrikler

`scripts/bench.py <model> --shuffle 2` her modeli aynı setten geçirir ve tek bir JSON
dosyası yazar.

| Metrik | Tanım |
|---|---|
| **accuracy** (noul / choice) | insan etiketiyle tam eşleşme |
| **score MAE** | beklenen ve tahmin edilen seviye indeksi (0–3) arasındaki mutlak hata |
| **ECE (10 bin)** | Beklenen Kalibrasyon Hatası (Expected Calibration Error) — "0.9 eminim" dediğinde 10'da 9 doğru olmalı (düşük iyi) |
| **flip** | şıkların sırası karıştırıldığında cevabın değişme oranı |
| **p50 / p95** | uçtan uca gecikme (istemci tarafı; HTTP dahil, model yükleme hariç) |

`--shuffle 2`, şık sırasına duyarlılığı ölçmek için soru başına 2 ek sorgu yapar (toplam
50 ek). **Ölçüm notu:** `flip` metriğinin önceki bir sürümü score etiketlerini uyumsuz
biçimlerde karşılaştırıyordu (`"2"` vs `"2.000"`); bu, oranı olduğundan yüksek çıkarıyordu.
Etiketler artık normalize ediliyor ve ölçüm tekrarlandı.

---

## 4. Sonuçlar

| Model | noul (10) | choice (10) | score MAE | ECE | flip | p50 | p95 |
|---|---|---|---|---|---|---|---|
| **openjev** (27B) | **1.00** | **1.00** | **0.4** | **0.008** | 0.20 | 189.7 ms | 214.4 ms |
| **NeoHorse-Jev-4B** (4B) | **1.00** | **1.00** | 0.8 | 0.035 | 0.20 | **44.3 ms** | 57.6 ms |
| **Jev-Omni** (12B) | **1.00** | 0.90 | **0.4** | 0.045 | 0.22 | 143.7 ms | 162.6 ms |
| **JEV-9B** (9B + LoRA) | **1.00** | 0.90 | 0.6 | 0.022 | 0.20 | 99.6 ms | 109.7 ms |
| **laya** (421M) | 0.90 | 0.90 | 1.2 | 0.089 | 0.20 | **16.5 ms** | 18.0 ms |
| **bekko-17m** (17M) | 0.40 | **1.00** | 1.2 | 0.247 | 0.20 | **7.7 ms** | 10.1 ms |

*Sayılar bu 25 soru içindir — bir smoke setidir, bilimsel bir benchmark değildir (Bölüm 6).*

**Okuma:**

- **openjev** seti tamamlar (20/20, metin) ve kalibrasyonu açık ara en iyidir (ECE 0.008).
  p50 190 ms; model kartı, H100 fp8'te **kısa metin kararları için ~80 ms** ve bir web
  adımı için (~1,460 token, 23 şık) ~210 ms bildirir. Burada raporlanan değer uçtan ucadır
  (istemci + shim + HTTP, GB10) ve o bantta kalır — iş yükleri birebir aynı değildir, ama
  GB10 kendini H100 ile aynı mertebede gösterir. Bedel: 27B ağırlık, CC-BY-NC.
- **NeoHorse-Jev-4B** aynı doğruluğu hazır bir runtime ile **~4 kat hızlıda** (44 ms),
  Apache 2.0 altında verir → "kur ve gerçekten kullan" adayı.
- **Jev-Omni**, tek modalitede 19/20 ve multimodal ihtiyacın tek adresidir. 0.4 score MAE
  en iyi değerdir (yalnızca 4 seviyeli rubrik için geçerli).
- **JEV-9B** 19/20 ve ikinci en iyi kalibrasyon (ECE 0.022); tek ağırlık kümesinde
  System 1 + System 2 ajan işleri için değerlidir.
- **laya** 18/20 ve en hızlı servis edilen modeldir (16 ms); `score` zayıflığı model
  kartında yazılıdır. Yine de çok dilli işin doğru adresi.
- **bekko-17m** `choice`'ta **10/10** yapar — 17M için etkileyici — ama `noul`'da 4/10
  (kapasite sınırı). 7.7 ms onu bir edge başlangıcı yapar.

**Kesişimsel desenler:**

- **`c4` üç modeli birebir aynı hataya düşürdü** (hepsi `technical` dedi, beklenen `other`).
  Bağımsız modeller belirsiz cümlelerde aynı önyargıyı paylaşır — üretim hatlarında bu
  sınır yakınında ikinci kontrol / insan onayı gerekir.
- **Şık sırasına duyarlılık sistematik bir sorundur.** `openjev` model kartı, 2,000
  örnekle ayarlama sonrası %2.3 flip oranı bildirir; JevBench ise küçük bir açık modelin
  şık sırası ters çevrildiğinde aynı görevde %72'den %21'e düştüğünü raporlar. Buradaki
  sette soru başına yalnızca 2–4 şık var, dolayısıyla daha yüksek oranlar beklenir;
  üretimde güven eşikleri kullanın ve düşük güvenli cevapları ikinci kontrole yönlendirin.
- **`score` her yerde en zayıf primitiftir** (MAE 0.4–1.2). Üretim mantığını `noul` /
  `choice` üzerine kurun; `score`'u yalnızca eşiklerle kullanın.
- **Küçük modeller şık açıklamalarına güvenir.** Bekko'nun `choice`'taki 10/10'u özenle
  yazılmış `criteria` açıklamalarından gelir — boş bırakmayın.

---

## 5. Hangi Model, Ne Zaman?

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

**Lisans uyarısı:** `openjev` ticari kullanıma kapalıdır (CC BY-NC 4.0 — ticari lisans
ayrı satılır); `bekko-17m`'nin model kartında atanmış bir lisans yoktur, bu yüzden
üretim öncesi bileşen lisanslarına bakın. Kalan dördü Apache 2.0'dır.

---

## 6. Sınırlamalar

1. **25 soru = smoke seti.** İstatistiksel güç düşüktür; `score` yalnızca 5 örnekle
   yoklandı. Ciddi iddialar için seti büyütün (Bölüm 7) ve bağımsız benchmark'larla
   çapraz doğrulayın: [Jev Decision Index](https://huggingface.co/spaces/multimodalart/jev-decision-index),
   [S1MB](https://github.com/hotchpotch/S1MB),
   [JevBench](https://github.com/fstandhartinger/jevbench),
   [decision-models-under-pressure](https://github.com/gazelle93/decision-models-under-pressure).
2. **Tek cihaz, tek oturum.** GB10 tek bir ölçüm noktasıdır; gecikme istemci tarafında
   ölçülür (HTTP dahil, model yükleme hariç).
3. **Tek dil (İngilizce girdi).** `laya`'nın çok dilli iddiası bu sette denenmez.
4. **Multimodal doğrulanmadı.** `Jev-Omni` bench'e tek modalitede girdi; görüntü / ses /
   video yolu bilinçli olarak kapsam dışı bırakıldı.
5. **flip, şık sayısına duyarlıdır.** 2–4 şıkta karıştırmanın etkisi büyüktür; model
   kartlarındaki %2–7 aralıkları 20+ şıklı testlerden gelir. Ayrıca ölçüm, Bölüm 3.3'te
   anlatılan etiket-biçimi hatası düzeltildikten sonra tekrarlandı.

---

## 7. Tekrarlanabilirlik

Koşu, her şeyi tek bir kök dizin altında tutar: indirilen ağırlıklar için bir klasör,
model başına pin'li bir sanal ortam ve altı modeli tek bir adaptörün arkasına koyan
küçük bir shell ve Python dosyası kümesi. Her modele aynı yoldan gidilir — tek bir
`predict(state, questions)` çağrısıyla — dolayısıyla bench'in hangi modeli
kullanıldığını bilmesi gerekmez.

**Soru seti.** Tek bir JSON dosyası 25 soruyu ve insan eliyle yazılmış beklenen
etiketlerini tutar; her öğe aynı altı alanı taşır:

| Alan | Ne tutar |
|---|---|
| `id` | öğe tanımlayıcısı — `n1`…`n10` (`noul`), `c1`…`c10` (`choice`), `s1`…`s5` (`score`) |
| `kind` | `noul`, `choice` veya `score` |
| `state` | modelin hakkında soru sorulduğu metin |
| `question` | sorunun kendisi |
| `criteria` | `choice` için id → açıklama eşlemesi; `score` öğeleri seviye etiketlerini dosyanın `score_levels` alanından alır |
| `expect` | insan etiketi — `true`/`false`, bir şık id'si veya bir seviye indeksi |

**Şık sırasına duyarlılığın ölçülmesi.** `--shuffle N`, bench'in her soruyu şıklar
farklı bir sırayla N kez daha sormasını ve cevabın ne sıklıkla değiştiğini saymasını
sağlar. Etiketler önce normalize edilir, böylece `"2"` ve `"2.000"` eşit sayılır
(Bölüm 3.3).

**Seti büyütmek için:** aynı şemayla yeni `items` ekleyin; bench değişiklik istemez.
`score` rubriğini 4 seviyede tutmanız önerilir (Bölüm 3.2).

Bunların tamamı eklerde: soru seti, ortak adaptör, bench harness'i ve kurulum ile
çalıştırma script'leri.

---

## Kaynaklar

**Typed decision ve referans model:**

- TypeSafe Jev model dokümanı — <https://docs.typesafe.ai/models>

**Bağımsız panolar:**

- JevBench — <https://github.com/fstandhartinger/jevbench>
- S1MB — <https://github.com/hotchpotch/S1MB>
- Jev Decision Index — <https://huggingface.co/spaces/multimodalart/jev-decision-index>
- decision-models-under-pressure — <https://github.com/gazelle93/decision-models-under-pressure>

**Donanım:**

- NVIDIA DGX Spark — <https://www.nvidia.com/en-us/products/workstations/dgx-spark/>

**İlgili yazılar ve araçlar:**

- [Yerel LLM Kullanım Rehberi]({{ '/papers/local-llm-guide/' | relative_url }})
- [LLM Çıkarım Benchmark Gezgini]({{ '/llm-inference-benchmarks/' | relative_url }})

---

### Notlar

- **Ölçümler:** accuracy, MAE, ECE, flip ve gecikme değerleri, Bölüm 3.1'deki ortamda,
  model başına tek adaptörle, ortak 25 soruluk setin tek bir koşusundan gelir. Gecikme
  istemci tarafında ve uçtan uca ölçülür: HTTP dahil, model yükleme hariç.
- **Setin kapsamı:** 25 soru bir smoke setidir. Rakamlar bu altı modeli bu set üzerinde
  tanımlar; daha geniş alanın sıralaması değildir — onun için yukarıdaki bağımsız panolar
  vardır.
- **Eklerdeki kod:** bu ölçümleri üreten kodun kendisidir. Yalnızca yorumları ve
  kendi mesaj dizgileri yayın için çevrilmiştir; kodun kendisi değişmemiştir.
- **Lisanslar:** açık ağırlık, açık kullanım demek değildir. `openjev` CC BY-NC 4.0'dır ve
  ticari kullanıma kapalıdır; `bekko-17m`'nin model kartında atanmış lisans yoktur.
  Üretim öncesi bileşen lisanslarına bakın.
- **Güncellik:** model sürümleri, lisanslar ve kalibrasyon değerleri Ekim 2026 itibarıyla
  geçerlidir.

## Ek A. Soru Seti

Ortak setin 25 sorusu ve insan eliyle yazılmış beklenen etiketleri. Dosyanın başındaki `score_levels` dört sıralı seviyeyi adlandırır.

**`bench-set.json`** — ortak 25 soru ve beklenen etiketleri

```json
{
  "_comment": "Shared decision set: all six models are run through the same 25 questions. Expected labels were written by hand.",
  "score_levels": ["can wait", "this week", "today", "right now"],
  "items": [
    {
      "id": "n1",
      "kind": "noul",
      "state": "Customer message. Order #4411, last week. 'I was charged twice and nobody has replied. I want my money back today.'",
      "question": "Is the customer asking for a refund?",
      "expect": "true"
    },
    {
      "id": "n2",
      "kind": "noul",
      "state": "Ops log for 2026-10-01. CPU stayed under 15% all day, no alerts fired, all health checks green.",
      "question": "Did the system experience a performance incident today?",
      "expect": "false"
    },
    {
      "id": "n3",
      "kind": "noul",
      "state": "Email. From: winner-prize@fast-mail.example. Subject: 'CONGRATULATIONS! You have won 1,000,000 USD. Click here to claim now.'",
      "question": "Is this message a phishing attempt?",
      "expect": "true"
    },
    {
      "id": "n4",
      "kind": "noul",
      "state": "Ticket #421. 'API response time degraded from 200 ms to 900 ms immediately after release 3.7.'",
      "question": "Does this ticket describe a performance regression?",
      "expect": "true"
    },
    {
      "id": "n5",
      "kind": "noul",
      "state": "Customer message. 'Hello! Could you tell me your opening hours on Saturday? Thanks a lot.'",
      "question": "Is the customer angry?",
      "expect": "false"
    },
    {
      "id": "n6",
      "kind": "noul",
      "state": "Pilot announcement. 'We will land roughly 30 minutes behind schedule because of fog at the destination.'",
      "question": "Is the delay caused by the weather?",
      "expect": "true"
    },
    {
      "id": "n7",
      "kind": "noul",
      "state": "Pull request review. The diff renames a single local variable from 'x' to 'index'. No other lines changed.",
      "question": "Does this change introduce a security vulnerability?",
      "expect": "false"
    },
    {
      "id": "n8",
      "kind": "noul",
      "state": "Code note. 'We use parameterised queries everywhere. The search endpoint is the only one that builds SQL by concatenation: sql = \"...WHERE name = \" + userInput.'",
      "question": "Is there a SQL injection risk?",
      "expect": "true"
    },
    {
      "id": "n9",
      "kind": "noul",
      "state": "Meeting minutes. 'The team agreed to postpone the launch until Q3. Budget is unchanged at 240k.'",
      "question": "Was the launch budget cut?",
      "expect": "false"
    },
    {
      "id": "n10",
      "kind": "noul",
      "state": "App store review. 'The app crashes every single time I open the settings screen. Pixel 8, Android 16. 1 star.'",
      "question": "Does the user report a bug?",
      "expect": "true"
    },
    {
      "id": "c1",
      "kind": "choice",
      "state": "Customer message. 'We were billed twice for March. Please refund the duplicate today or we will cancel our plan.'",
      "question": "Which department should handle this request?",
      "criteria": {
        "billing": "invoices, payments, refunds, duplicate charges",
        "technical": "bugs, outages, system errors",
        "sales": "pricing, new contracts, upgrades",
        "other": "everything else"
      },
      "expect": "billing"
    },
    {
      "id": "c2",
      "kind": "choice",
      "state": "Ticket. 'The CSV export produces a 500 error whenever the file has more than 10,000 rows. Reproduced on the demo tenant.'",
      "question": "Which department should handle this request?",
      "criteria": {
        "billing": "invoices, payments, refunds, duplicate charges",
        "technical": "bugs, outages, system errors",
        "sales": "pricing, new contracts, upgrades",
        "other": "everything else"
      },
      "expect": "technical"
    },
    {
      "id": "c3",
      "kind": "choice",
      "state": "Email. 'Could you send me a quote for 50 licences starting next quarter? We would like the enterprise tier.'",
      "question": "Which department should handle this request?",
      "criteria": {
        "billing": "invoices, payments, refunds, duplicate charges",
        "technical": "bugs, outages, system errors",
        "sales": "pricing, new contracts, upgrades",
        "other": "everything else"
      },
      "expect": "sales"
    },
    {
      "id": "c4",
      "kind": "choice",
      "state": "Message. 'Hi, I am applying for the backend engineering role you posted. Where should I send my CV?'",
      "question": "Which department should handle this request?",
      "criteria": {
        "billing": "invoices, payments, refunds, duplicate charges",
        "technical": "bugs, outages, system errors",
        "sales": "pricing, new contracts, upgrades",
        "other": "everything else"
      },
      "expect": "other"
    },
    {
      "id": "c5",
      "kind": "choice",
      "state": "Log line. '14:02:11 UTC  HTTP 429  POST /api/v1/chat  client=77.6.1.4  quota_window=60s  limit=1000  actual=1422'",
      "question": "What is the primary problem here?",
      "criteria": {
        "rate_limit": "the client exceeded its request quota",
        "auth_failure": "the client is not authenticated or not authorised",
        "data_loss": "data was lost or corrupted",
        "ui_bug": "a visual or rendering defect"
      },
      "expect": "rate_limit"
    },
    {
      "id": "c6",
      "kind": "choice",
      "state": "Support ticket. 'After the update, the buttons in the top navigation bar flicker whenever I scroll. Chrome 140 on Windows.'",
      "question": "What kind of problem is this?",
      "criteria": {
        "ui_bug": "a visual or rendering defect",
        "billing": "an invoice or payment problem",
        "performance": "slowness, timeouts, high latency",
        "security": "a vulnerability or unauthorised access"
      },
      "expect": "ui_bug"
    },
    {
      "id": "c7",
      "kind": "choice",
      "state": "Invoice INV-2291. The total is correct but the customer VAT number printed on the document belongs to another company.",
      "question": "Who should fix this?",
      "criteria": {
        "invoice_owner": "the person responsible for issuing invoices",
        "delivery": "the courier or logistics team",
        "legal": "the legal or compliance team",
        "developers": "the engineering team"
      },
      "expect": "invoice_owner"
    },
    {
      "id": "c8",
      "kind": "choice",
      "state": "Nightly pipeline report. 'Completed successfully: 21 of 24 partitions. The remaining 3 were skipped without an error being raised.'",
      "question": "What is the primary problem here?",
      "criteria": {
        "data_integrity": "the dataset is incomplete or inconsistent",
        "billing": "an invoice or payment problem",
        "ux": "a usability problem in the interface",
        "network": "a connectivity or bandwidth problem"
      },
      "expect": "data_integrity"
    },
    {
      "id": "c9",
      "kind": "choice",
      "state": "Feedback form. 'It would be great if the app supported dark mode and honoured the system theme.'",
      "question": "What kind of request is this?",
      "criteria": {
        "bug": "reporting a defect",
        "billing": "an invoice or payment problem",
        "feature_request": "asking for new functionality",
        "security": "reporting a vulnerability"
      },
      "expect": "feature_request"
    },
    {
      "id": "c10",
      "kind": "choice",
      "state": "Alert. 'TLS certificate for store.example.com expires in 5 days and has not been renewed. Handshake failures already observed by 2 browsers.'",
      "question": "Which team acts first?",
      "criteria": {
        "security": "certificates, encryption, vulnerabilities",
        "billing": "invoices and payments",
        "support": "customer-facing questions",
        "hr": "hiring and people operations"
      },
      "expect": "security"
    },
    {
      "id": "s1",
      "kind": "score",
      "state": "Customer message. 'We were billed twice for March. Please refund the duplicate today or we will cancel our plan.'",
      "question": "How urgent is this request?",
      "expect": 3
    },
    {
      "id": "s2",
      "kind": "score",
      "state": "Feedback. 'There is a small spelling typo on the About page: \"recieve\" instead of \"receive\".'",
      "question": "How urgent is this request?",
      "expect": 0
    },
    {
      "id": "s3",
      "kind": "score",
      "state": "Monitoring. 'Payment gateway timeout on 30% of checkout attempts in the last 10 minutes. Revenue impact is ongoing.'",
      "question": "How urgent is this request?",
      "expect": 3
    },
    {
      "id": "s4",
      "kind": "score",
      "state": "Feedback. 'One user asked whether we could add support for the Romanian language next year.'",
      "question": "How urgent is this request?",
      "expect": 0
    },
    {
      "id": "s5",
      "kind": "score",
      "state": "Advisory. 'A third-party dev tooling dependency has a published low-severity CVE. It never runs in production.'",
      "question": "How urgent is this request?",
      "expect": 1
    }
  ]
}
```

## Ek B. Adaptör ve Bench Harness'i

Altı model ile bench arasındaki her şey: tek bir `predict(state, questions)` imzasının arkasında model başına bir adaptör, bench'in kendisi ve onun JSON çıktısını okuyan özetleyici.

**`jevclient.py`** — adaptör katmanı — tek bir `predict(state, questions)` çağrısının arkasında altı adaptör

```python
#!/usr/bin/env python3
"""
jet-tut — unified typed-decision client.

Every model in this tutorial answers the same question shape:

    state      : str  (text, ticket, log line, JSON ...)
    questions  : {"id": {"type": "noul"|"choice"|"score",
                          "instructions": "...",
                          "criteria": {...} | [...]}}
    ->  {"answers": {"id": {"label": str, "probabilities": {opt: float}, "raw": ...}}}

Each adapter below hides the model's real request format behind that shape.
Run `python jevclient.py --list` to see what is available.
"""
from __future__ import annotations

import base64
import json
import math
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(os.environ.get("JET_ROOT", Path.home() / "jet-tut"))
MODELS = ROOT / "models"

# `trust_remote_code` dynamic module cache. The default under
# ~/.cache/huggingface/modules may be root-owned on a shared box; point it
# somewhere we know is writable so `get_class_from_dynamic_module` works.
os.environ.setdefault("HF_MODULES_CACHE", str(ROOT / ".hf-modules"))
Path(os.environ["HF_MODULES_CACHE"]).mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def _to_dict(crit: Any) -> dict[str, str | None]:
    """Normalise `criteria` into an ordered {id: description} mapping."""
    if crit is None:
        return {}
    if isinstance(crit, dict):
        return {str(k): (None if v is None else str(v)) for k, v in crit.items()}
    if isinstance(crit, list):
        return {str(c): (c if isinstance(c, str) else None) for c in crit}
    raise TypeError(f"unsupported criteria type: {type(crit)!r}")


def _softmax(xs: list[float]) -> list[float]:
    m = max(xs)
    es = [math.exp(x - m) for x in xs]
    s = sum(es)
    return [e / s for e in es]


class Adapter:
    """Base class. Subclasses implement `predict`."""

    name = "base"

    def predict(self, state: str, questions: dict) -> dict:
        raise NotImplementedError

    def close(self) -> None:  # optional
        pass


# --------------------------------------------------------------------------
# 1. hotchpotch/bekko-system-one-v0-17m   (shared-prefix encoder, 17M)
# --------------------------------------------------------------------------
class BekkoAdapter(Adapter):
    name = "bekko-17m"

    def __init__(self, model_dir: str | Path = MODELS / "bekko-17m", device: str = "cuda"):
        from transformers.dynamic_module_utils import get_class_from_dynamic_module

        repo = str(model_dir)
        cls = get_class_from_dynamic_module(
            "inference_v0.BekkoSentenceTransformer",
            repo,
            trust_remote_code=True,
        )
        self.model = cls(repo, trust_remote_code=True, device=device, attn_implementation="sdpa")

    def _decision(self, qid: str, q: dict) -> dict:
        kind = q["type"]
        crit = _to_dict(q.get("criteria"))
        if kind == "score":
            # expect criteria to be a list of ordered numeric levels
            items, values = [], []
            for i, c in enumerate(q.get("criteria") or []):
                # accept either plain labels 0..n-1 or {"id","value"}
                if isinstance(c, dict):
                    items.append({
                        "id": str(c.get("id", i)),
                        "description_json": json.dumps(str(c.get("description", c.get("id")))),
                        "value": float(c["value"]),
                    })
                    values.append(float(c["value"]))
                else:
                    items.append({
                        "id": str(i),
                        "description_json": json.dumps(str(c)),
                        "value": float(i),
                    })
                    values.append(float(i))
        elif kind == "noul":
            items = [
                {"id": "false", "description_json": json.dumps(crit.get("false", "No.")), "value": None},
                {"id": "true", "description_json": json.dumps(crit.get("true", "Yes.")), "value": None},
            ]
        else:
            items = [
                {
                    "id": k,
                    "description_json": json.dumps(v if v else k),
                    "value": None,
                }
                for k, v in crit.items()
            ]

        return {
            "id": qid,
            "kind": "judgment",
            "type": kind,
            "instructions_json": json.dumps(q["instructions"]),
            "system_prompt": "",
            "criteria": items,
            "documents": [],
            "scoring": None,
        }

    def predict(self, state: str, questions: dict) -> dict:
        payload = {
            "state_json": json.dumps({"state": state}),
            "decisions": [self._decision(qid, q) for qid, q in questions.items()],
        }
        out = self.model.predict(payload)
        answers = {}
        for qid, q in questions.items():
            r = out[qid]
            kind = q["type"]
            probs = {str(k).lower(): float(v) for k, v in (r.get("probabilities") or {}).items()}
            if kind == "score":
                sc = float(r.get("score"))
                answers[qid] = {
                    "label": f"{sc:.3f}",
                    "probabilities": probs,
                    "raw": {k: r.get(k) for k in ("score", "normalized_score", "values")},
                }
            elif kind == "noul":
                p = float(r.get("probability_yes", probs.get("true", 0.5)))
                answers[qid] = {
                    "label": "true" if p >= 0.5 else "false",
                    "probabilities": {"false": 1 - p, "true": p},
                    "raw": r,
                }
            else:
                answers[qid] = {
                    "label": r.get("selected_id"),
                    "probabilities": probs,
                    "raw": r,
                }
        return {"answers": answers}


# --------------------------------------------------------------------------
# 2. convaiinnovations/laya   (ModernBERT-large, non-autoregressive, 421M)
# --------------------------------------------------------------------------
class LayaAdapter(Adapter):
    name = "laya"

    def __init__(self, model_dir: str | Path = MODELS / "laya", model: str = "english",
                 device: str = "cuda"):
        import laya

        if model == "english":
            self.agent = laya.load(str(model_dir))
        else:
            self.agent = laya.load(str(model_dir), subfolder=model)
        if device == "cuda":
            self.agent.cfg["device"] = "cuda"

    def predict(self, state: str, questions: dict) -> dict:
        res = self.agent.predict(state, questions)
        answers = {}
        for qid, q in questions.items():
            a = res["answers"][qid]
            t = q["type"]
            if t == "noul":
                p = float(a.get("noul", a.get("probability_yes", 0.5)))
                answers[qid] = {
                    "label": "true" if p >= 0.5 else "false",
                    "probabilities": {"false": 1 - p, "true": p},
                    "raw": a,
                }
            elif t == "score":
                sc = a.get("score")
                sc = float(sc) if sc is not None else float("nan")
                n = len(q.get("criteria") or [])
                answers[qid] = {
                    "label": f"{sc:.3f}",
                    "probabilities": {},
                    "raw": {"score": sc, "normalized": a.get("normalised_score") or a.get("normalized_score")},
                }
            else:
                probs = {k: float(v) for k, v in (a.get("probabilities") or {}).items()}
                answers[qid] = {
                    "label": a.get("choice"),
                    "probabilities": probs,
                    "raw": a,
                }
        return {"answers": answers}


# --------------------------------------------------------------------------
# 3. akhilaaa3/Jev-Omni   (Gemma 4 12B IT — text / image / audio / video)
# --------------------------------------------------------------------------
class JevOmniAdapter(Adapter):
    """
    Loads `jev_omni.load_jev_omni()` from the model's own repo code. The
    shipped loader calls `snapshot_download(...)` to fetch the ~24 GB of
    Gemma 4 weights from the Hub cache; here we redirect that to the
    `models/jev-omni` folder we already downloaded so everything stays
    under `~/jet-tut`.
    """
    name = "jev-omni"

    def __init__(self, model_dir: str | Path = MODELS / "jev-omni"):
        import importlib.util

        model_dir = Path(model_dir).resolve()
        spec = importlib.util.spec_from_file_location("jev_omni", model_dir / "jev_omni.py")
        ju = importlib.util.module_from_spec(spec)
        sys.modules["jev_omni"] = ju
        spec.loader.exec_module(ju)

        missing = [n for n in ("model*.safetensors", "head.pt", "config.json")
                   if not any(model_dir.glob(n))]
        if missing:
            raise RuntimeError(
                f"jev-omni: {missing} not found — run "
                f"`bash scripts/01-download.sh omni` first"
            )

        # Redirect the loader's own `snapshot_download(...)` to our folder.
        ju.snapshot_download = lambda *a, **k: str(model_dir)
        self.clf = ju.load_jev_omni()

    def _one(self, state: str, q: dict, media: str | None = None, modality: str | None = None):
        kind = q["type"]
        if kind == "noul":
            # Jev-Omni `predict()` takes free-form options; we use the same literal
            # strings as the bench ("true"/"false") so labels line up automatically.
            options = ["true", "false"]
        elif kind == "score":
            options = [str(c) for c in (q.get("criteria") or [])]
        else:
            options = list(_to_dict(q.get("criteria")).keys())
        kw = {}
        if media and modality:
            kw = {"media": media, "modality": modality}
        return self.clf.predict(
            state=state,
            question=q["instructions"],
            options=options,
            **kw,
        ), options

    def predict(self, state: str, questions: dict, media: str | None = None,
                modality: str | None = None) -> dict:
        answers = {}
        for qid, q in questions.items():
            (r, options) = self._one(state, q, media, modality)
            probs = {k: float(v) for k, v in (r.get("probabilities") or {}).items()}
            kind = q["type"]
            if kind == "score":
                # prediction is the winning level *label*; convert to its index
                # so score MAE is comparable across models.
                try:
                    idx = options.index(r.get("prediction"))
                except ValueError:
                    idx = None
                label = f"{idx:.3f}" if idx is not None else None
            else:
                label = r.get("prediction")
            answers[qid] = {
                "label": label,
                "probabilities": probs,
                "raw": r,
            }
        return {"answers": answers}


# --------------------------------------------------------------------------
# 4. autotrust/JEV-9B   (vLLM + `jev-decision` LoRA + 24-slot decision head)
# --------------------------------------------------------------------------
class JEV9BAdapter(Adapter):
    """
    Works against a vLLM server started with:

        vllm serve models/JEV-9B --served-model-name autotrust/JEV-9B \
            --enable-lora --max-lora-rank 32 \
            --lora-modules jev-decision=models/JEV-9B/adapter_vllm \
            --logprobs-mode processed_logprobs --max-model-len 4096
    """
    name = "jev9b"

    def __init__(self, base_url: str = "http://localhost:8104",
                 model_dir: str | Path = MODELS / "JEV-9B"):
        import requests

        self.s = requests.Session()
        self.url = base_url.rstrip("/")
        dh_path = Path(model_dir) / "adapter_vllm" / "decision_head.json"
        cal_path = Path(model_dir) / "calibration.json"
        self.dh = json.loads(dh_path.read_text())
        self.T = json.loads(cal_path.read_text())["per_kind"]

    def _decide(self, kind: str, state: str, question: str, options: list[str]) -> dict[str, float]:
        letters = "ABCDEFGHIJKLMNOP"
        if kind == "noul":
            lines = ["false", "true"]
        elif kind == "score":
            lines = [str(i) for i in range(len(options))]
        else:
            lines = [f"{letters[i]}) {o}" for i, o in enumerate(options)]

        prompt = (
            f"[kind] {kind}\n[state] {state}\n[question] {question}\n[options]\n"
            + "\n".join(lines)
            + "\n[decision]:"
        )
        s, _ = self.dh["slots"]["ranges"][kind]
        ids = self.dh["verbalizer_ids"][s : s + len(lines)]

        r = self.s.post(
            f"{self.url}/v1/completions",
            json={
                "model": "jev-decision",
                "prompt": prompt,
                "max_tokens": 1,
                "temperature": 1.0,
                "logprobs": len(ids),
                "allowed_token_ids": ids,
                "add_special_tokens": False,
                "return_tokens_as_token_ids": True,
            },
            timeout=120,
        ).json()
        tlp = r["choices"][0]["logprobs"]["top_logprobs"][0]
        lp = {}
        for k, v in tlp.items():
            tok = int(k.split(":")[1]) if ":" in k else int(k)
            lp[tok] = v
        z = [(lp.get(t, -1e9) + self.dh["bias"][s + i]) / self.T[kind] for i, t in enumerate(ids)]
        e = _softmax(z)
        return {o: p for o, p in zip(options if kind not in ("noul", "score") else lines, e)}

    def predict(self, state: str, questions: dict) -> dict:
        answers = {}
        for qid, q in questions.items():
            kind = q["type"]
            if kind == "noul":
                opts = ["false", "true"]
            elif kind == "score":
                opts = [str(i) for i in range(len(q.get("criteria") or [0] * 6))]
            else:
                opts = list(_to_dict(q.get("criteria")).keys())
            probs = self._decide(kind, state, q["instructions"], opts)
            label = max(probs, key=probs.get)
            if kind == "score":
                ev = sum(float(k) * v for k, v in probs.items())
                label = f"{ev:.3f}"
            answers[qid] = {"label": label, "probabilities": probs, "raw": probs}
        return {"answers": answers}


# --------------------------------------------------------------------------
# 5. openjev/openjev   (27B + helper/shim.py -> POST /v1/systemone)
# --------------------------------------------------------------------------
class OpenJevAdapter(Adapter):
    """
    Talks to `helper/shim.py`, the calibration shim that follows vLLM in the
    openjev recipe. Shape follows `POST /v1/systemone`:

        in : {state, questions: {id: {type, instructions, criteria}}}
        out: {answers: {id: {choice|noul|score, probabilities, confidence}}}
    """
    name = "openjev"

    def __init__(self, base_url: str = "http://localhost:8106", timeout: float = 120.0):
        import requests

        self.s = requests.Session()
        self.url = base_url.rstrip("/")
        self.timeout = timeout

    def predict(self, state: str, questions: dict) -> dict:
        q = {}
        for qid, qu in questions.items():
            kind = qu["type"]
            if kind == "score":
                q[qid] = {"type": "score", "instructions": qu["instructions"],
                          "criteria": [str(c) for c in (qu.get("criteria") or [])]}
            elif kind == "noul":
                q[qid] = {"type": "noul", "instructions": qu["instructions"]}
            else:
                q[qid] = {"type": "choice", "instructions": qu["instructions"],
                          "criteria": dict(_to_dict(qu.get("criteria")))}
        r = self.s.post(
            f"{self.url}/v1/systemone",
            json={"model": "openjev", "state": state, "questions": q},
            timeout=self.timeout,
        )
        r.raise_for_status()
        body = r.json()
        answers = {}
        for qid, qu in questions.items():
            a = body["answers"][qid]
            kind = qu["type"]
            probs = {str(k).lower(): float(v) for k, v in (a.get("probabilities") or {}).items()}
            if kind == "noul":
                p = float(a.get("noul", 0.5))
                answers[qid] = {
                    "label": "true" if p >= 0.5 else "false",
                    "probabilities": {"false": 1 - p, "true": p},
                    "raw": a,
                }
            elif kind == "score":
                sc = float(a.get("score"))
                answers[qid] = {
                    "label": f"{sc:.3f}",
                    "probabilities": probs,
                    "raw": a,
                }
            else:
                answers[qid] = {
                    "label": a.get("choice"),
                    "probabilities": probs,
                    "raw": a,
                }
        return {"answers": answers}


# --------------------------------------------------------------------------
# 6. TokenRhythm/NeoHorse-Jev-4B   (the `neohorse_decision` runtime in the bundle)
# --------------------------------------------------------------------------
class NeoHorseAdapter(Adapter):
    """
    Uses the native Python wheel that ships inside the model bundle
    (`dist/neohorse_decision-*.whl`). No vLLM or SGLang needed.

        pip install --no-deps models/NeoHorse-Jev-4B/dist/neohorse_decision-*.whl
    """
    name = "neohorse"

    def __init__(self, bundle: str | Path = MODELS / "NeoHorse-Jev-4B"):
        from neohorse_decision import DecisionEngine  # type: ignore

        self.engine = DecisionEngine(str(bundle))

    def predict(self, state: str, questions: dict) -> dict:
        q = {}
        for qid, qu in questions.items():
            entry = {"type": qu["type"], "instructions": qu["instructions"]}
            if qu["type"] == "choice":
                entry["criteria"] = dict(_to_dict(qu.get("criteria")))
            elif qu["type"] == "score":
                entry["criteria"] = [str(c) for c in (qu.get("criteria") or [])]
            q[qid] = entry
        res = self.engine.predict({"state": state, "questions": q})
        answers = {}
        for qid, qu in questions.items():
            a = res["answers"][qid]
            t = qu["type"]
            if t == "noul":
                p = float(a.get("noul", a.get("probability_yes", 0.5)))
                answers[qid] = {
                    "label": "true" if p >= 0.5 else "false",
                    "probabilities": {"false": 1 - p, "true": p},
                    "raw": a,
                }
            elif t == "score":
                sc = float(a.get("score"))
                answers[qid] = {
                    "label": f"{sc:.3f}",
                    "probabilities": {},
                    "raw": a,
                }
            else:
                probs = {k: float(v) for k, v in (a.get("probabilities") or {}).items()}
                answers[qid] = {
                    "label": a.get("choice"),
                    "probabilities": probs,
                    "raw": a,
                }
        return {"answers": answers}


ADAPTERS = {
    "bekko-17m": BekkoAdapter,
    "laya": LayaAdapter,
    "jev-omni": JevOmniAdapter,
    "jev9b": JEV9BAdapter,
    "openjev": OpenJevAdapter,
    "neohorse": NeoHorseAdapter,
}


if __name__ == "__main__":
    if "--list" in sys.argv or not sys.argv[1:]:
        for k, v in ADAPTERS.items():
            print(f"{k:12s} {v.__doc__ or v.__name__}".splitlines()[0])
        sys.exit(0)
    name = sys.argv[1]
    ad = ADAPTERS[name]()
    print(ad.predict(
        "Customer: charged twice for order #4411, wants a refund today.",
        {"dept": {"type": "choice",
                  "instructions": "Which department should handle this?",
                  "criteria": {"billing": "payments and refunds",
                               "technical": "bugs and outages",
                               "sales": "pricing"}}},
    ))
```

**`bench.py`** — tek model için accuracy, score MAE, ECE, flip ve p50/p95 gecikmesi

```python
#!/usr/bin/env python3
"""
jet-tut — runs one model over the shared 25-question bench set.

Usage:
    python bench.py <model> [--set scripts/bench-set.json] [--shuffle N]
                     [--seed 1234] [--out out/bench-<model>.json]

<model> is a key of jevclient.ADAPTERS.

Reports accuracy (noul, choice), score MAE, calibration (ECE), option-shuffle
flip rate and per-question p50 / p95 latency.
"""
from __future__ import annotations

import argparse
import copy
import json
import random
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from jevclient import ADAPTERS  # noqa: E402


def load_set(path: Path) -> dict:
    return json.loads(path.read_text())


def expected_label(item: dict, score_levels: list[str]) -> str:
    if item["kind"] == "score":
        return str(item["expect"])
    return str(item["expect"]).lower()


def norm_label(label, kind: str) -> str | None:
    """Normalise a prediction label so "2", "2.0" and "2.000" all compare equal.

    Adapters report score labels as f"{x:.3f}" (e.g. "2.000") while this bench
    rounds to the level index ("2"); without normalising, every score re-ask
    counted as a spurious flip and inflated the measured flip rate.
    """
    if label is None:
        return None
    if kind == "score":
        try:
            return str(round(float(label)))
        except (TypeError, ValueError):
            return str(label).lower()
    return str(label).lower()


def option_set(item: dict, score_levels: list[str]) -> list[str]:
    if item["kind"] == "noul":
        return ["false", "true"]
    if item["kind"] == "score":
        return [str(i) for i in range(len(score_levels))]
    return list(item["criteria"].keys())


def ece(conf: list[float], correct: list[bool], bins: int = 10) -> float:
    if not conf:
        return float("nan")
    edges = [i / bins for i in range(bins + 1)]
    total = len(conf)
    out = 0.0
    for b in range(bins):
        sel = [(c, k) for c, k in zip(conf, correct) if edges[b] <= c < edges[b + 1] or (b == bins - 1 and c == 1.0)]
        if not sel:
            continue
        acc = sum(1 for _, k in sel if k) / len(sel)
        avg = sum(c for c, _ in sel) / len(sel)
        out += (len(sel) / total) * abs(acc - avg)
    return out


def run(model_name: str, items: list[dict], score_levels: list[str],
        repeat: int = 1, shuffle: int = 0, seed: int = 1234) -> dict:
    ad = ADAPTERS[model_name]()
    rng = random.Random(seed)

    noul_rows, choice_rows, score_rows = [], [], []
    latencies: list[float] = []
    flips = 0
    flip_total = 0

    for item in items:
        qid = item["id"]
        q = {
            "type": item["kind"],
            "instructions": item["question"],
            "criteria": item.get("criteria", None)
            if item["kind"] != "score"
            else score_levels,
        }
        t0 = time.perf_counter()
        try:
            res = ad.predict(item["state"], {qid: q})["answers"][qid]
        except Exception as e:  # noqa: BLE001
            res = {"label": None, "probabilities": {}, "error": f"{type(e).__name__}: {e}"}
        dt = time.perf_counter() - t0
        latencies.append(dt)

        exp = expected_label(item, score_levels)
        probs = {str(k).lower(): float(v) for k, v in (res.get("probabilities") or {}).items()}

        if item["kind"] == "score":
            lab = res.get("label")
            try:
                pred = round(float(lab))
            except (TypeError, ValueError):
                pred = None
            score_rows.append({
                "id": qid, "expect": int(exp), "pred": pred, "score": lab,
                "probabilities": probs, "seconds": dt,
                **({"error": res["error"]} if "error" in res else {}),
            })
        else:
            pred = (res.get("label") or "").lower()
            best = max(probs, key=probs.get) if probs else None
            conf = probs.get(pred, probs.get(best, float("nan"))) if probs else float("nan")
            ok = pred == exp
            row = {
                "id": qid, "expect": exp, "pred": pred, "best": best,
                "conf": conf, "correct": ok, "probabilities": probs,
                "seconds": dt,
                **({"error": res["error"]} if "error" in res else {}),
            }
            (noul_rows if item["kind"] == "noul" else choice_rows).append(row)

        # ---- option-shuffle flip rate -------------------------------------
        for k in range(shuffle):
            opts = option_set(item, score_levels)
            if len(opts) < 2:
                continue
            order = opts[:]
            rng.shuffle(order)
            crit = None
            if item["kind"] == "choice":
                base = item["criteria"]
                crit = {o: base.get(o, "") for o in order}
            elif item["kind"] == "score":
                crit = order
            q2 = {"type": item["kind"], "instructions": item["question"], "criteria": crit}
            try:
                r2 = ad.predict(item["state"], {qid: q2})["answers"][qid]
            except Exception:  # noqa: BLE001
                continue
            lab2 = norm_label(r2.get("label"), item["kind"])
            lab1 = norm_label(res.get("label"), item["kind"])
            if lab2 is None or lab1 is None:
                continue
            flip_total += 1
            if lab2 != lab1:
                flips += 1

    def acc(rows):
        good = [r for r in rows if "error" not in r]
        return (sum(1 for r in good if r["correct"]) / len(good)) if good else float("nan")

    confs = [r["conf"] for r in noul_rows + choice_rows if "error" not in r]
    corrs = [r["correct"] for r in noul_rows + choice_rows if "error" not in r]
    errs = [abs(r["pred"] - r["expect"]) for r in score_rows if r["pred"] is not None]

    out = {
        "model": model_name,
        "n_items": len(items),
        "accuracy": {
            "noul": acc(noul_rows),
            "choice": acc(choice_rows),
            "overall_text": acc(noul_rows + choice_rows),
        },
        "score_mae": (sum(errs) / len(errs)) if errs else None,
        "ece_10bin": ece(confs, corrs),
        "flip_rate": (flips / flip_total) if flip_total else None,
        "latency_seconds": {
            "p50": statistics.median(latencies) if latencies else None,
            "p95": sorted(latencies)[int(len(latencies) * 0.95) - 1] if len(latencies) >= 2 else None,
            "mean": sum(latencies) / len(latencies) if latencies else None,
            "all": latencies,
        },
        "rows": {"noul": noul_rows, "choice": choice_rows, "score": score_rows},
    }
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("model")
    p.add_argument("--set", default=str(ROOT / "scripts" / "bench-set.json"))
    p.add_argument("--out", default=None)
    p.add_argument("--shuffle", type=int, default=0,
                   help="how many shuffled re-asks per item to measure flip rate")
    p.add_argument("--seed", type=int, default=1234)
    a = p.parse_args()

    ds = load_set(Path(a.set))
    items = ds["items"]
    levels = ds["score_levels"]

    res = run(a.model, items, levels, shuffle=a.shuffle, seed=a.seed)
    out_path = Path(a.out or (ROOT / "out" / f"bench-{a.model}.json"))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(res, indent=2))

    print(f"=== {a.model} ===")
    print(json.dumps({k: v for k, v in res.items() if k != "rows"}, indent=2)[:2000])
    print(f"\nwrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

**`summary.py`** — `out/bench-*.json` dosyalarının tek satırlık özeti

```python
#!/usr/bin/env python3
"""Print a compact one-line summary for every out/bench-*.json."""
import json
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
for p in sorted((here.parent / "out").glob("bench-*.json")):
    d = json.loads(p.read_text())
    lat = d["latency_seconds"] or {}
    rows = d["rows"]
    bad = []
    for kind, rs in rows.items():
        for r in rs:
            if r.get("correct") is False:
                bad.append(f"{r['id']}")
    print(f"{d['model']:12s}  "
          f"noul {d['accuracy']['noul']:.2f}  "
          f"choice {d['accuracy']['choice']:.2f}  "
          f"scoreMAE {d['score_mae']}  "
          f"ECE {d['ece_10bin']:.3f}  "
          f"flip {d['flip_rate']}  "
          f"p50 {(lat.get('p50') or 0)*1000:.1f}ms  "
          f"p95 {(lat.get('p95') or 0)*1000:.1f}ms  "
          f"misses: {','.join(bad) if bad else '-'}")
```

## Ek C. Kurulum ve Çalıştırma Script'leri

Beş pin'li sanal ortamın oluşturulması, altı modelin indirilmesi, her modelin servis edilmesi ve hepsinin bench'ten geçirilmesi.

**`00-setup.sh`** — beş pin'li `uv` sanal ortamı, model grubu başına bir tane

```bash
#!/usr/bin/env bash
# jet-tut: DGX Spark (GB10 / SM 12.1) environment setup.
# Every Python package is installed in its own uv venv, with its own pins.
set -euo pipefail

ROOT="$HOME/jet-tut"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
# Parallel installs clash on the uv cache lock and fail after 300 s.
# Install serially, and give the lock a generous timeout.
export UV_LOCK_TIMEOUT=1800

echo "=== uv zorunlu ==="
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh

new_venv () {
  local name="$1"
  if [ ! -x "$ROOT/$name/bin/python" ]; then
    uv venv "$name" --python 3.12 >/dev/null
  fi
  echo "--- $name ready ---"
}

echo
echo "=== 1) .venv-light : bekko-system-one ==="
echo "    pins: torch>=2.10,<2.11  transformers==5.17.0  sentence-transformers==6.1.0"
echo "    NOTE: the aarch64 torch<2.13 wheels on PyPI are CPU-only. For GB10/SM 12.1"
echo "         a CUDA 13.0 build is installed with --torch-backend cu130 (2.10.0+cu130)."
new_venv .venv-light
uv pip install --reinstall-package torch --python .venv-light/bin/python \
  --torch-backend cu130 \
  "torch>=2.10,<2.11"
uv pip install --python .venv-light/bin/python \
  "transformers==5.17.0" \
  "sentence-transformers==6.1.0" \
  "safetensors>=0.7" \
  "tqdm>=4.67"

echo
echo "=== 2) .venv-laya : convaiinnovations/laya ==="
new_venv .venv-laya
uv pip install --reinstall-package torch --python .venv-laya/bin/python \
  --torch-backend cu130 "torch>=2.10,<2.11"
uv pip install --python .venv-laya/bin/python "laya==0.3.20"

echo
echo "=== 3) .venv-omni : akhilaaa3/Jev-Omni ==="
echo "    the model card only pins transformers==5.17.0, but Gemma4UnifiedProcessor"
echo "    is in transformers 5.18 (not in 5.17). torchvision + opencv + soundfile are also"
echo "    needed (jev_omni.py, requirements.txt). The latest torchvision pulls torch"
echo "    up to 2.14, which matches the CUDA 13.0 build."
new_venv .venv-omni
uv pip install --python .venv-omni/bin/python \
  --torch-backend cu130 \
  "torch>=2.10,<2.11"
uv pip install --python .venv-omni/bin/python \
  "transformers>=5.18.0" \
  "accelerate" \
  "safetensors" \
  "huggingface_hub" \
  "pillow" \
  "av" \
  "torchvision" \
  "opencv-python-headless" \
  "soundfile" \
  "librosa"

echo
echo "=== 4) .venv-neohorse : TokenRhythm/NeoHorse-Jev-4B (native wheel) ==="
new_venv .venv-neohorse
uv pip install --reinstall-package torch --python .venv-neohorse/bin/python \
  --torch-backend cu130 "torch>=2.8,<2.11"
uv pip install --python .venv-neohorse/bin/python \
  "transformers==5.17.0" \
  "flash-linear-attention==0.5.2" \
  "fastapi==0.141.1" "uvicorn==0.53.0" "starlette==1.6.0" \
  "httpx==0.28.1" "pillow==12.3.0" "numpy"
uv pip install --no-deps --python .venv-neohorse/bin/python \
  "$ROOT/models/NeoHorse-Jev-4B/dist/neohorse_decision-1.0.0-py3-none-any.whl"

echo
echo "=== 5) .venv-vllm : JEV-9B / openjev ==="
echo "    pinned per openjev/serve/SERVE.md: vllm 0.29.0 + torch 2.13.0+cu130"
new_venv .venv-vllm
uv pip install --reinstall-package torch --python .venv-vllm/bin/python \
  --torch-backend cu130 "torch==2.13.0"
uv pip install --python .venv-vllm/bin/python \
  "vllm==0.29.0" \
  "transformers==5.17.0" \
  "peft==0.21.0" \
  "openai==3.16.2" \
  "httpx==0.28.1" \
  "huggingface_hub" \
  "numpy" \
  "ninja"

echo
echo "=== TAMAM ==="
for v in .venv-light .venv-laya .venv-omni .venv-neohorse .venv-vllm; do
  printf "%-16s " "$v"
  "$ROOT/$v/bin/python" -c 'import torch,sys; print(sys.version.split()[0], "torch", torch.__version__, "cuda", torch.cuda.is_available())' 2>&1 | head -1
done
df -h "$HOME" | tail -1
```

**`01-download.sh`** — altı modeli `models/` altına indirir

```bash
#!/usr/bin/env bash
# jet-tut: download the models into ~/jet-tut/models.
# Usage: bash 01-download.sh [bekko|laya|neohorse|jev9b|openjev|omni|all]
set -euo pipefail

ROOT="$HOME/jet-tut"
MODELS="$ROOT/models"
export PATH="$HOME/.local/bin:$PATH"

mkdir -p "$MODELS"
cd "$ROOT"

PY=(uv run --python 3.12 --no-project --with 'huggingface_hub[cli]>=0.28' python)

pull () {
  local repo="$1"; local dest="$2"; shift 2
  local allow=( "${@:-}" )
  echo "=============================================="
  echo ">>> $repo  ->  models/$dest"
  echo "=============================================="
  "${PY[@]}" - "$repo" "$MODELS/$dest" "${allow[@]}" <<'PYEOF'
import sys
from huggingface_hub import snapshot_download
repo, dest = sys.argv[1], sys.argv[2]
allow = [a for a in sys.argv[3:] if a] or None
snapshot_download(
    repo_id=repo,
    local_dir=dest,
    allow_patterns=allow,
    max_workers=8,
)
print("OK:", repo, "->", dest)
PYEOF
}

case "${1:-all}" in
  bekko)    pull hotchpotch/bekko-system-one-v0-17m bekko-17m ;;
  laya)     pull convaiinnovations/laya laya ;;
  neohorse) pull TokenRhythm/NeoHorse-Jev-4B NeoHorse-Jev-4B ;;
  jev9b)    pull autotrust/JEV-9B JEV-9B ;;
  openjev)  pull openjev/openjev openjev ;;
  omni)     pull akhilaaa3/Jev-Omni jev-omni ;;
  all)
    pull hotchpotch/bekko-system-one-v0-17m bekko-17m
    pull convaiinnovations/laya laya
    pull TokenRhythm/NeoHorse-Jev-4B NeoHorse-Jev-4B
    pull autotrust/JEV-9B JEV-9B
    pull openjev/openjev openjev
    pull akhilaaa3/Jev-Omni jev-omni
    ;;
  *) echo "unknown target: $1"; exit 1 ;;
esac

echo
echo "=== models/ ==="
du -sh "$MODELS"/* 2>/dev/null
df -h "$HOME" | tail -1
```

**`02-bekko.sh`** — bekko-17m smoke testi ve bu kutuda ölçülen gecikme

```bash
#!/usr/bin/env bash
# hotchpotch/bekko-system-one-v0-17m — shared-prefix encoder, 17M params.
# No server needed: loaded into the process by jevclient.BekkoAdapter.
#
# Run this as a smoke test. It also gives you the measured latency on this box.
set -euo pipefail
ROOT="$HOME/jet-tut"
cd "$ROOT"

export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
export TOKENIZERS_PARALLELISM=false
export HF_MODULES_CACHE="$ROOT/.hf-modules"
mkdir -p "$HF_MODULES_CACHE"

time .venv-light/bin/python - <<'PY'
import json, time
from transformers.dynamic_module_utils import get_class_from_dynamic_module

repo = "models/bekko-17m"
cls = get_class_from_dynamic_module(
    "inference_v0.BekkoSentenceTransformer", repo, trust_remote_code=True
)
model = cls(repo, trust_remote_code=True, device="cuda", attn_implementation="sdpa")

payload = {
    "state_json": json.dumps({
        "message": "We were billed twice for March. Please refund the duplicate today or we will cancel our plan."
    }),
    "decisions": [
        {
            "id": "department", "kind": "judgment", "type": "choice",
            "instructions_json": json.dumps("Which department should handle this request?"),
            "system_prompt": "",
            "criteria": [
                {"id": "billing",    "description_json": json.dumps("invoices, payments, refunds"),   "value": None},
                {"id": "technical",  "description_json": json.dumps("bugs, outages, system errors"),  "value": None},
                {"id": "sales",      "description_json": json.dumps("pricing, new contracts"),        "value": None},
                {"id": "other",      "description_json": json.dumps("everything else"),               "value": None},
            ],
            "documents": [], "scoring": None,
        },
        {
            "id": "refund", "kind": "judgment", "type": "noul",
            "instructions_json": json.dumps("Is the customer asking for a refund?"),
            "system_prompt": "",
            "criteria": [
                {"id": "false", "description_json": json.dumps("The customer does not ask for money back."), "value": None},
                {"id": "true",  "description_json": json.dumps("The customer asks for money back."),         "value": None},
            ],
            "documents": [], "scoring": None,
        },
        {
            "id": "urgency", "kind": "judgment", "type": "score",
            "instructions_json": json.dumps("How urgent is this request?"),
            "system_prompt": "",
            "criteria": [
                {"id": "0", "description_json": json.dumps("can wait"),        "value": 0},
                {"id": "1", "description_json": json.dumps("this week"),       "value": 1},
                {"id": "2", "description_json": json.dumps("today"),           "value": 2},
                {"id": "3", "description_json": json.dumps("right now"),       "value": 3},
            ],
            "documents": [], "scoring": None,
        },
    ],
}

# warm up (compile + cached prefix shapes)
for _ in range(3):
    model.predict(payload, batch_size=1, show_progress_bar=False)

t0 = time.perf_counter()
N = 50
for _ in range(N):
    out = model.predict(payload, batch_size=1, show_progress_bar=False)
dt = (time.perf_counter() - t0) / N

print(json.dumps(out, indent=2))
print(f"\n--- {dt*1000:.2f} ms / request (3 questions, GPU sdpa, batch=1) ---")
PY
```

**`03-laya.sh`** — laya'yı 8102 portunda servis eder

```bash
#!/usr/bin/env bash
# convaiinnovations/laya — 421M ModernBERT-large, non-autoregressive decisions,
# Apache-2.0. `laya-serve` speaks the same POST /v1/systemone contract as Jev.
#
# Serves on http://127.0.0.1:8102
set -euo pipefail

ROOT="$HOME/jet-tut"
cd "$ROOT"
PORT="${PORT:-8102}"
export LAYA_DEVICE="${LAYA_DEVICE:-cuda}"
export LAYA_PRELOAD="${LAYA_PRELOAD:-1}"

mkdir -p out
echo ">>> laya-serve starting on :$PORT   log: out/serve-laya.log"

exec .venv-laya/bin/laya-serve --host 127.0.0.1 --port "$PORT" \
  2>&1 | tee out/serve-laya.log
```

**`04-jev9b.sh`** — JEV-9B'yi 8104 portunda servis eder (vLLM + LoRA)

```bash
#!/usr/bin/env bash
# autotrust/JEV-9B — System 1 (typed decisions) + System 2 (Qwen3.5-9B) on one
# vLLM engine. The backbone is bit-identical to Qwen3.5-9B; the System 1 block
# is a detachable LoRA adapter named `jev-decision`.
#
# Requirements (see the model card):
#   - vLLM with qwen3_5 support, LoRA on lm_head, --logprobs-mode, allowed_token_ids
#   - --logprobs-mode processed_logprobs is REQUIRED: it makes the returned
#     log-probabilities respect allowed_token_ids.
#
# Serves on http://127.0.0.1:8104
set -euo pipefail

ROOT="$HOME/jet-tut"
cd "$ROOT"
export PATH="$ROOT/.venv-vllm/bin:$PATH"
PORT="${PORT:-8104}"
MODEL="${MODEL:-models/JEV-9B}"

mkdir -p out
echo ">>> JEV-9B starting on port $PORT  (log: out/serve-jev9b.log)"

exec .venv-vllm/bin/python -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" \
  --served-model-name autotrust/JEV-9B \
  --host 127.0.0.1 --port "$PORT" \
  --enable-lora --max-lora-rank 32 \
  --lora-modules jev-decision="$MODEL/adapter_vllm" \
  --logprobs-mode processed_logprobs \
  --max-model-len 4096 \
  --gpu-memory-utilization "${GMU:-0.85}" \
  --max-num-seqs "${MAXSEQ:-32}" \
  2>&1 | tee out/serve-jev9b.log
```

**`05-openjev.sh`** — openjev'i 8105 ve 8106 portlarında servis eder (vLLM + kalibrasyon shim'i)

```bash
#!/usr/bin/env bash
# openjev/openjev — 27B decision model (CC BY-NC 4.0), served in two parts:
#
#   1. vLLM in fp8 over `models/openjev`  -> http://127.0.0.1:8105/v1
#   2. `helper/shim.py` (Apache-2.0), which implements the Jev-compatible
#      POST /v1/systemone contract -> http://127.0.0.1:8106
#
# The calibration env vars below are the model card's fixed settings. Keep them
# to reproduce the numbers it publishes.
set -euo pipefail

ROOT="$HOME/jet-tut"
cd "$ROOT"
# flashinfer can trigger a JIT build; keep ninja on PATH.
export PATH="$ROOT/.venv-vllm/bin:$PATH"
VLLM_PORT="${VLLM_PORT:-8105}"
SHIM_PORT="${SHIM_PORT:-8106}"
MODEL="${MODEL:-models/openjev}"

mkdir -p out

cleanup() { jobs -p | xargs -r kill 2>/dev/null || true; }
trap cleanup EXIT

echo ">>> vLLM (fp8) starting on :$VLLM_PORT   log: out/serve-openjev-vllm.log"
.venv-vllm/bin/python -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" \
  --served-model-name qwen \
  --host 127.0.0.1 --port "$VLLM_PORT" \
  --enable-prefix-caching \
  --max-model-len 16384 \
  --gpu-memory-utilization "${GMU:-0.90}" \
  --limit-mm-per-prompt '{"image":1}' \
  --trust-remote-code \
  --max-num-seqs 256 \
  --max-logprobs 64 \
  --gdn-prefill-backend triton \
  --quantization fp8 \
  2>&1 | tee out/serve-openjev-vllm.log &
VLLM_PID=$!

echo ">>> waiting for vLLM to answer /v1/models ..."
for _ in $(seq 1 180); do
  if curl -sf "http://127.0.0.1:$VLLM_PORT/v1/models" >/dev/null 2>&1; then
    echo ">>> vLLM ready"
    break
  fi
  kill -0 $VLLM_PID 2>/dev/null || { echo ">>> vLLM exited before becoming ready"; exit 1; }
  sleep 5
done

echo ">>> shim starting on :$SHIM_PORT   log: out/serve-openjev-shim.log"
VLLM="http://127.0.0.1:$VLLM_PORT/v1" \
TOKENIZER="$MODEL" \
READOUT_T=0.85 \
READOUT_NOUL_T=1.829074 \
READOUT_NOUL_BIAS=0 \
READOUT_TARGETED=1 \
READOUT_INSTR_STYLE=pyrepr \
SHIM_STAGGER=1 \
  .venv-vllm/bin/python "$MODEL/helper/shim.py" \
    --host 127.0.0.1 --port "$SHIM_PORT" \
    2>&1 | tee out/serve-openjev-shim.log &

wait $!
```

**`06-jev-omni.py`** — metin smoke testi, ardından isteğe bağlı görüntü / ses / video yoklamaları

```python
#!/usr/bin/env python3
"""
akhilaaa3/Jev-Omni — 12B multimodal decision classifier (Gemma 4 12B IT).
Apache-2.0. Text, image, audio and video -> calibrated probabilities.

Runs a text smoke test, then (if you pass files) an image / audio / video probe.

    python 06-jev-omni.py                  # text only
    python 06-jev-omni.py shot.png         # + image
    python 06-jev-omni.py --audio a.wav    # audio (<=30 s)
    python 06-jev-omni.py --video v.mp4    # video (first 16 frames)
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(os.environ.get("JET_ROOT", Path.home() / "jet-tut"))
MODEL_DIR = ROOT / "models" / "jev-omni"

# Dynamic-module cache; see README — default can be root-owned on shared boxes.
os.environ.setdefault("HF_MODULES_CACHE", str(ROOT / ".hf-modules"))
Path(os.environ["HF_MODULES_CACHE"]).mkdir(parents=True, exist_ok=True)


def main() -> int:
    sys.path.insert(0, str(MODEL_DIR))
    from jev_omni import load_jev_omni  # type: ignore

    try:
        clf = load_jev_omni(model_dir=str(MODEL_DIR))
    except TypeError:
        clf = load_jev_omni()

    state = ("Customer message. Order #4411, placed last week. 'I was charged twice "
             "and nobody has replied. I want my money back today.'")

    questions = [
        ("Is the customer asking for a refund?", ["Yes", "No"]),
        ("Which department should handle this request?",
         ["billing", "technical", "sales", "other"]),
        ("How urgent is this request?",
         ["can wait", "this week", "today", "right now"]),
    ]

    print("=== Jev-Omni — text ===")
    for q, opts in questions:
        t0 = time.perf_counter()
        r = clf.predict(state=state, question=q, options=opts)
        dt = time.perf_counter() - t0
        print(f"\nQ: {q}")
        print(f"   -> {json.dumps(r, default=str)[:400]}")
        print(f"   ({dt*1000:.0f} ms)")

    # optional media probes ------------------------------------------------
    for flag, modality in (("--image", "image"), ("--audio", "audio"), ("--video", "video")):
        if flag in sys.argv:
            path = sys.argv[sys.argv.index(flag) + 1]
            t0 = time.perf_counter()
            r = clf.predict(
                state=state,
                question="Is the customer asking for a refund?",
                options=["Yes", "No"],
                media=path,
                modality=modality,
            )
            dt = time.perf_counter() - t0
            print(f"\n=== {modality}: {path} ===")
            print(f"   -> {json.dumps(r, default=str)[:400]}  ({dt*1000:.0f} ms)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

**`07-neohorse.sh`** — NeoHorse-Jev-4B, kendi native wheel'i ile tek süreçte

```bash
#!/usr/bin/env bash
# TokenRhythm/NeoHorse-Jev-4B — ~4B structured decision model.
# Uses the native `neohorse_decision` wheel that ships inside the bundle,
# so no vLLM / SGLang is required. Everything runs in one Python process.
set -euo pipefail

ROOT="$HOME/jet-tut"
cd "$ROOT"
export MODEL_DIR="$ROOT/models/NeoHorse-Jev-4B"

time .venv-neohorse/bin/python - <<'PY'
import json, os, time
from neohorse_decision import DecisionEngine

engine = DecisionEngine(os.environ["MODEL_DIR"])
state = "We were billed twice for March. Please refund the duplicate today or we will cancel our plan."

req = {
    "state": state,
    "questions": {
        "team": {
            "type": "choice",
            "instructions": "Which team should handle this message?",
            "criteria": {
                "billing": "Billing, charges, or refunds",
                "technical": "Product failures or technical issues",
                "other": "Other matters",
            },
        },
        "refund": {
            "type": "noul",
            "instructions": "Is the user requesting a refund?",
        },
        "urgency": {
            "type": "score",
            "instructions": "How soon does the user want this resolved?",
            "criteria": ["can wait", "this week", "today", "right now"],
        },
    },
}

# Warm up: first call pays model-load and CUDA-graph costs.
engine.predict(req)
t0 = time.perf_counter()
N = 20
for _ in range(N):
    out = engine.predict(req)
dt = (time.perf_counter() - t0) / N

print(json.dumps(out, indent=2, default=str))
print(f"\n--- {dt*1000:.1f} ms / request (3 questions, 1 forward pass each) ---")
PY
```

**`rerun-bench.sh`** — altı model sırayla; sunucuları kendisi açıp kapatır

```bash
#!/usr/bin/env bash
# jet-tut — re-runs the full 25-question bench for all six models on the DGX
# Spark, in one go. Run this after changing bench.py / bench-set.json.
#
#   nohup bash scripts/rerun-bench.sh > out/rerun-bench.log 2>&1 &
#
# Order matters: the in-process models need no server, then jev9b (vLLM :8104)
# is served and stopped again, then openjev (vLLM :8105 + shim :8106) which is
# left running afterwards (restart takes ~6-8 min).
set -uo pipefail

ROOT="$HOME/jet-tut"
cd "$ROOT"
export JET_ROOT="$ROOT"
export HF_MODULES_CACHE="$ROOT/.hf-modules"
OUT="$ROOT/out"
mkdir -p "$OUT"

stamp() { date '+%F %T'; }

# kill a server by matching its cmdline — NEVER use `pkill -f`, that also
# matches your own SSH session and drops the connection.
kill_by_cmd() {
  ps -eo pid,cmd | grep -F "$1" | grep -v grep | awk '{print $1}' | xargs -r kill 2>/dev/null || true
}

wait_http () {  # $1=url  $2=attempts  $3=serve-pid (optional)
  for _ in $(seq 1 "$2"); do
    curl -sf "$1" >/dev/null 2>&1 && return 0
    if [ -n "${3:-}" ]; then
      kill -0 "$3" 2>/dev/null || { echo "[$(stamp)] server $1 died while starting"; return 1; }
    fi
    sleep 5
  done
  echo "[$(stamp)] timeout waiting for $1"
  return 1
}

# ---- 1) in-process models: no server needed -------------------------------
for pair in "bekko-17m .venv-light" "laya .venv-laya" "neohorse .venv-neohorse" "jev-omni .venv-omni"; do
  set -- $pair
  echo "[$(stamp)] === $1 (in-process, $2) ==="
  "$ROOT/$2/bin/python" scripts/bench.py "$1" --shuffle 2 2>&1 | tee "$OUT/bench-$1.log"
  echo "[$(stamp)] --- $1 done ---"
done

# ---- 2) jev9b: vLLM + LoRA on :8104 --------------------------------------
echo "[$(stamp)] === jev9b: starting vLLM :8104 ==="
nohup bash scripts/04-jev9b.sh > "$OUT/serve-jev9b-run.log" 2>&1 &
SERVE_PID=$!
wait_http "http://127.0.0.1:8104/v1/models" 120 "$SERVE_PID" || exit 1
"$ROOT/.venv-vllm/bin/python" scripts/bench.py jev9b --shuffle 2 2>&1 | tee "$OUT/bench-jev9b.log"
echo "[$(stamp)] --- jev9b done, stopping vLLM ---"
kill_by_cmd entrypoints.openai
sleep 20

# ---- 3) openjev: vLLM fp8 :8105 + shim :8106 (left running) --------------
echo "[$(stamp)] === openjev: starting vLLM :8105 + shim :8106 ==="
nohup bash scripts/05-openjev.sh > "$OUT/serve-openjev-run.log" 2>&1 &
wait_http "http://127.0.0.1:8106/v1/version" 180 || exit 1
"$ROOT/.venv-vllm/bin/python" scripts/bench.py openjev --shuffle 2 2>&1 | tee "$OUT/bench-openjev.log"

echo "[$(stamp)] === ALL DONE ==="
echo "[$(stamp)] openjev server left running (:8105, :8106)."
echo "[$(stamp)] summary: python3 scripts/summary.py"
```

**`smoke.sh`** — yerelde bulunan her model için tek bir typed-decision sorgusu

```bash
#!/usr/bin/env bash
# Smoke test: run one typed-decision query against every locally available model
# that does not need a server. Prints a small JSON summary per model.
set -uo pipefail
ROOT="$HOME/jet-tut"
cd "$ROOT"

STATE="We were billed twice for March. Please refund the duplicate today or we will cancel our plan."
QUESTIONS='{
  "dept": {
    "type": "choice",
    "instructions": "Which department should handle this request?",
    "criteria": {
      "billing": "invoices, payments, refunds",
      "technical": "bugs, outages, system errors",
      "sales": "pricing, new contracts",
      "other": "everything else"
    }
  },
  "refund": {
    "type": "noul",
    "instructions": "Is the customer asking for a refund?"
  },
  "urgency": {
    "type": "score",
    "instructions": "How urgent is this request?",
    "criteria": ["can wait", "this week", "today", "right now"]
  }
}'

export STATE QUESTIONS ROOT

run_one () {
  local name="$1"; local py="$2"; local mod="$3"
  if [ ! -x "$py" ]; then printf "%-12s SKIP (no venv)\n" "$name"; return; fi
  printf "%-12s " "$name"
  "$py" - "$mod" <<'PY' 2>&1 | tail -1
import json, os, sys, time, traceback
root = os.environ["ROOT"]
sys.path.insert(0, os.path.join(root, "scripts"))
from jevclient import ADAPTERS

name = sys.argv[1]
try:
    st = time.perf_counter()
    ad = ADAPTERS[name]()
    load_s = time.perf_counter() - st
    st = time.perf_counter()
    out = ad.predict(os.environ["STATE"], json.loads(os.environ["QUESTIONS"]))
    call_s = time.perf_counter() - st
    ans = out["answers"]
    print(json.dumps({
        "load_s": round(load_s, 2),
        "call_ms": round(call_s * 1000, 1),
        "dept": ans["dept"]["label"],
        "refund": ans["refund"]["label"],
        "urgency": ans["urgency"]["label"],
    }))
except Exception as e:
    print(f"FAIL {type(e).__name__}: {e}")
PY
}

run_one "bekko-17m" "$ROOT/.venv-light/bin/python"    bekko-17m
run_one "laya"      "$ROOT/.venv-laya/bin/python"     laya
run_one "neohorse"  "$ROOT/.venv-neohorse/bin/python" neohorse

echo
echo "=== served models (need 04-jev9b.sh / 05-openjev.sh running) ==="
for p in 8102 8104 8105 8106; do
  if curl -sf "http://127.0.0.1:$p/health" >/dev/null 2>&1 || curl -sf "http://127.0.0.1:$p/v1/models" >/dev/null 2>&1; then
    echo "port $p : UP"
  else
    echo "port $p : down"
  fi
done
```

---

{% include company/block.html name="cta_logo" %}

**Karar modeli altyapınızı birlikte planlayalım.** DGX Spark veya Jetson üzerinde bir
typed-decision modelini seçme, boyutlandırma ve dağıtıma yardımcı olması için,
{% include company/block.html name="contact_cta" %}