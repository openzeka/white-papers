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

Koşu, her şeyi tek bir kök dizin altında tutar — indirilen ağırlıklar için bir klasör,
model başına pin'li bir sanal ortam — ve altı modeli tek bir adaptörün arkasına gizleyen
küçük bir shell ve Python dosyası kümesiyle yönetilir. Aşağıdaki tablo o kümenin nasıl
göründüğüdür; koşu buna göre yeniden kurulabilir:

```bash
# setup + download (once)
bash scripts/00-setup.sh
bash scripts/01-download.sh all

# bench all six models in one command (starts and stops servers itself)
nohup bash scripts/rerun-bench.sh > out/rerun-bench.log 2>&1 &
python3 scripts/summary.py        # summary table
```

| Script | Görev |
|---|---|
| `00-setup.sh` | 5 pin'li `uv` venv (`--torch-backend cu130`, seri kurulum) |
| `01-download.sh` | altı modelin tamamını `models/` altına indirir |
| `02..07` | model başına servis/smoke script'leri (laya :8102, jev9b :8104, openjev :8105+:8106) |
| `jevclient.py` | ortak `predict(state, questions)` adaptör katmanı (6 model) |
| `bench-set.json` | ortak 25 soru + beklenen etiketler |
| `bench.py` | tek model için bench (accuracy, MAE, ECE, flip, p50/p95) |
| `rerun-bench.sh` | altı modeli sırayla çalıştırır |
| `summary.py` | `out/bench-*.json` → tek satır özet |

**Seti büyütmek için:** `bench-set.json` içine aynı şemayla (`id`, `kind`, `state`,
`question`, `criteria`, `expect`) yeni `items` ekleyin; `bench.py` değişiklik istemez.
`score` rubriğini 4 seviyede tutmanız önerilir (Bölüm 3.2).

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
- **Lisanslar:** açık ağırlık, açık kullanım demek değildir. `openjev` CC BY-NC 4.0'dır ve
  ticari kullanıma kapalıdır; `bekko-17m`'nin model kartında atanmış lisans yoktur.
  Üretim öncesi bileşen lisanslarına bakın.
- **Güncellik:** model sürümleri, lisanslar ve kalibrasyon değerleri Ekim 2026 itibarıyla
  geçerlidir.

---

{% include company/block.html name="cta_logo" %}

**Karar modeli altyapınızı birlikte planlayalım.** DGX Spark veya Jetson üzerinde bir
typed-decision modelini seçme, boyutlandırma ve dağıtıma yardımcı olması için,
{% include company/block.html name="contact_cta" %}