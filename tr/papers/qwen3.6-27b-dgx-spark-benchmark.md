---
title: Qwen3.6-27B DGX Spark Benchmark
parent: White Papers
nav_order: 1
lang: tr
page_id: qwen3.6-27b-dgx-spark-benchmark
description: >-
  Qwen3.6-27B modelinin NVIDIA DGX Spark (GB10) platformunda FP8, FP8-MTP,
  AWQ-MTP, NVFP4 ve NVFP4-MTP quantization varyantları ile performans değerlendirmesi.
permalink: /papers/qwen3.6-27b-dgx-spark-benchmark/
last_modified_date: 2026-07-03
toc: true
---

*Hazırlayan: **Openzeka Teknoloji A.Ş.** — NVIDIA Türkiye & MEA Resmî Embedded Compute Distribütörü ve NVIDIA Elite Partner*

*Test platformu: NVIDIA DGX Spark (GB10) · Model: Qwen3.6-27B · Rapor tarihi: Temmuz 2026*

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## 1. Giriş ve Test Metodolojisi

### 1.1 Model Tanıtımı

Qwen3.6-27B, Alibaba'nın Qwen ailesine ait 27 milyar parametreli büyük dil modelidir. Qwen3.5 serisinin ardından topluluk geri bildirimleriyle geliştirilen bu sürüm, özellikle **agentic coding** (front-end iş akışları ve depo düzeyinde akıl yürütme) ve **thinking preservation** (geçmiş mesajlardan akıl yürütme bağlamını koruma) alanlarında önemli iyileştirmeler sunmaktadır.

Bu raporda, aynı modelin farklı **quantization (niceleme)** formatları ve **MTP (Multi-Token Prediction)** konfigürasyonları ile NVIDIA DGX Spark platformundaki performansı değerlendirilmektedir.

**Model Mimarisi:**

| Parametre | Değer |
|---|---|
| Parametre sayısı | 27B |
| Gizli boyut (Hidden Dimension) | 5120 |
| Katman sayısı | 64 |
| Mimari düzen | 16 × (3 × Gated DeltaNet → FFN → 1 × Gated Attention → FFN) |
| DeltaNet dikkat başları | V: 48, QK: 16, Baş boyutu: 128 |
| Gated Attention başları | Q: 24, KV: 4, Baş boyutu: 256 |
| RoPE boyutu | 64 |
| FFN ara boyut | 17408 |
| Token gömme boyutu | 248320 (padded) |
| Bağlam uzunluğu | 262,144 token (doğal), YaRN ile 1,010,000'e kadar genişletilebilir |
| MTP desteği | Çok adımlı eğitimle (multi-steps) desteklenir |
| Görsel kodlayıcı | Var (Image-Text-to-Text) |

> **Not:** Bu benchmark kapsamında yalnızca metin girişi/çıkışı kullanılmış, görsel kodlayıcı aktif değildir.

### 1.2 Test Edilen Varyantlar

| Varyant | Quantization | MTP | Açıklama |
|---|---|---|---|
| **FP8** | FP8 (8-bit kayan nokta) | Yok | 8-bit kayan nokta nicelemesi |
| **FP8-MTP** | FP8 | Var | FP8 + Çoklu token tahmini |
| **AWQ-MTP** | AWQ (Activation-aware Weight Quantization) | Var | Aktivasyon farkında ağırlık niceleme + MTP |
| **NVFP4** | NVFP4 (4-bit NVIDIA formatı) | Yok | NVIDIA'ya özgü 4-bit niceleme |
| **NVFP4-MTP** | NVFP4 | Var | NVFP4 + Çoklu token tahmini |

> **Not:** AWQ varyantında MTP'siz test bulunmamaktadır. Bu nedenle MTP etkisinin doğrudan karşılaştırılması yalnızca FP8 ve NVFP4 için yapılabilmektedir.

### 1.3 Quantization Formatları

- **FP8 (Float8):** 8-bit kayan nokta sayı formatı. Model ağırlıklarını BF16'dan FP8'e dönüştürür. Qwen tarafından uygulanan niceleme yöntemi, 128 blok boyutu ile ince taneli (fine-grained) FP8 nicelemedir; orijinal modele kıyasla performans metrikleri neredeyse aynıdır. Hassasiyet kaybı minimaldir. FP8, ağırlık başına 8 bit kullandığından orijinal BF16 modele kıyasla model boyutunu ve bellek bant genişliği gereksinimini yaklaşık yarıya indirir; ancak bu rapordaki 4-bit formatlara (AWQ, NVFP4) kıyasla ~2x daha büyük olup daha yüksek bellek bant genişliği talep eder — bu da decode aşamasında (memory-bound) NVFP4'ün FP8'i geçmesinin temel nedenidir (bkz. Bölüm 3.1). Kaynak: [`Qwen/Qwen3.6-27B-FP8`](https://huggingface.co/Qwen/Qwen3.6-27B-FP8)
- **AWQ (Activation-aware Weight Quantization):** Ağırlıkları 4-bit'e niceleyen ancak aktivasyonları koruyan bir yöntem. Sadece ağırlıklar nicelenir; aktivasyonlar tam hassasiyette kalır. Bellek bant genişliği tasarrufu sağlar. vLLM çalışma zamanında AWQ ağırlıkları otomatik olarak **Marlin kernel**'e dönüştürülür; bu donanım düzeyinde hızlandırma, decode aşamasındaki performans avantajının temel nedenlerinden biridir. Kaynak: [`shawnw3i/Qwen3.6-27B-AWQ-MTP`](https://huggingface.co/shawnw3i/Qwen3.6-27B-AWQ-MTP)
- **NVFP4 (NVIDIA Float4):** NVIDIA'ın Blackwell mimarisi için optimize edilmiş 4-bit kayan nokta formatı. En yüksek sıkıştırma oranını sunar, donanım düzeyinde hızlandırma desteği vardır. UltraChat veri seti üzerinde kalibre edilmiştir; 16K bağlam uzunluğuna kadar diziler ve yaklaşık 2M token kalibrasyon bütçesi ile hazırlanmıştır. Kalibrasyonun sohbet ağırlıklı UltraChat dağılımına dayanması, farklı alanlardaki (örn. kod, matematik) doğruluk davranışını etkileyebilir; bu benchmark yalnızca hız ölçtüğünden söz konusu etki değerlendirilmemiştir. Kaynak: [`unsloth/Qwen3.6-27B-NVFP4`](https://huggingface.co/unsloth/Qwen3.6-27B-NVFP4)

### 1.4 MTP (Multi-Token Prediction) Nedir?

MTP, modelin her ileri geçişinde (forward pass) birden fazla token tahmin etmesini sağlayan bir tekniktir. Geleneksel otoregresif modeller her adımda yalnızca bir token üretirken, MTP ile her adımda birden fazla token üretilebilir. Bu, token üretim hızını (TPS) önemli ölçüde artırırken, inter-token latency (ITL) değerini düşürür.

**MTP'nin çalışma prensibi:**
- Her decode adımında model N adet token üretir
- Üretilen token'lar doğrulama mekanizmasıyla kontrol edilir
- Doğru tahmin edilen token'lar doğrudan çıktıya eklenir
- Yanlış tahminler reddedilir ve yeniden üretilir

### 1.5 Metrik Tanımları

| Metrik | Birim | Açıklama |
|---|---|---|
| **TTFT** (Time To First Token) | ms | İsteğin gönderilmesinden ilk token'ın üretilmesine kadar geçen süre. Prefill aşamasının hızını yansıtır. |
| **ITL** (Inter-Token Latency) | ms | Ardışık iki token arasındaki gecikme. Decode aşamasının hızını yansıtır. |
| **TPS** (Tokens Per Second) | tokens/s | Saniyede üretilen ortalama token sayısı. Kullanıcı tarafındaki algılanan hız. |
| **Latency** | s | Bir isteğin başlangıcından tamamlanmasına kadar geçen toplam süre (uçtan uca). |
| **Throughput** | RPS | Ölçüm aracının per-request tanımı: `geçerli_istek_sayısı / Σ(latency) = 1 / ortalama_latency`. Bu, **tek bir istek akışının** saniyedeki tamamlanma oranıdır; sistemin toplam (fleet) iş kapasitesi DEĞİLDİR. |

> **⚠️ Önemli — "Throughput (RPS)" metriğinin doğru yorumu:** Kullanılan ölçüm aracı (CordatusAI/llm-benchmark) bu değeri kaynak kodunda `throughput = geçerli_istek_sayısı / Σ(latency_i)` olarak hesaplar; bu cebirsel olarak `1 / ortalama_latency`'ye eşittir ve **tanımı gereği concurrency'den bağımsızdır**. Yani metriğin düz kalması GPU'nun ölçeklenmediğini göstermez — yalnızca tek akışın latency tersini ölçtüğünü yansıtır. Sistemin gerçek toplam kapasitesi `TPS × Concurrency` (toplam token/s) veya `Concurrency / ortalama_latency` (toplam RPS) ile ölçülür ve concurrency ile belirgin biçimde artar (bkz. Bölüm 5.5 ve 6.1). Bu ayrım, raporun concurrency yorumları (Bölüm 5.5, 8.2, 9.1) için kritiktir.

### 1.6 Test Koşulları

- **Platform:** NVIDIA DGX Spark
- **Concurrency seviyeleri:** 1, 2, 4, 8, 16 eşzamanlı istek
- **İstatistiksel ölçümler:** Her metrik için Mean (ortalama), p50 (medyan), p90 (90. yüzdelik) değerleri kaydedilmiştir
- **Her varyant için 5 metrik × 5 concurrency seviyesi = 25 veri noktası** toplanmıştır

### 1.7 Ölçüm Aracı

Tüm ölçümler **[CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark)** açık kaynak aracı ile gerçekleştirilmiştir. Bu araç, OpenAI-uyumlu streaming API üzerinden LLM çıkarım sunucularının performansını ölçmek için tasarlanmış Streamlit tabanlı bir uygulamadır.

**Çalışma Yöntemi:**

- OpenAI-compatible `/v1/chat/completions` endpoint'ine streaming istekler gönderilir
- `stream_options={"include_usage": True}` ile token sayısı sunucu tarafında doğrulanır
- `reasoning_content` desteği ile reasoning modellerin düşünce token'ları da ölçüme dahil edilir

**Ölçüm Parametreleri:**

| Parametre | Değer | Açıklama |
|---|---|---|
| Prompt sayısı | 100 | `prompts.txt` dosyasından yüklenir, her çalıştırmada rastgele sıralanır |
| Prompt uzunluğu | ~128 token | Her prompt en az 128 token yanıt üretmesini açıkça talep eder |
| Maksimum çıkış token | 128 | Yanıtlar 128 token sonunda kesilir |
| Minimum tur sayısı | 10 | Her concurrency seviyesi için en az 10 round |
| Toplam istek sayısı | 10 × concurrency | Concurrency=8 → 80 istek, Concurrency=16 → 160 istek |
| Warm-up | 1 istek | Benchmark öncesi 1 adet warm-up isteği gönderilir |
| İstatistiksel ölçümler | Mean, p50, p90 | Her metrik için ortalama, medyan ve 90. yüzdelik hesaplanır |

> **Sınırlılık:** Her concurrency seviyesinde istek sayısı 10 × concurrency'dir; C=1'de yalnızca ~10 örnek ölçülür. Bu nedenle özellikle düşük concurrency'deki p90 değerleri ve TTFT dalgalanmaları (örn. AWQ-MTP'nin düzensiz TTFT seyri, Bölüm 2.3; NVFP4-MTP'nin p90/p50=1.56 değeri, Bölüm 7.1) kısmen küçük örneklem gürültüsünü yansıtıyor olabilir. Kesin tail-latency karakterizasyonu için daha yüksek istek sayılarıyla tekrar önerilir.

### 1.8 Çıkarım Sunucusu Yapılandırması

Tüm varyantlar **vLLM v0.22.0** (`vllm/vllm-openai:v0.22.0-ubuntu2404` Docker imajı) ile çalıştırılmıştır.

**Ortak Yapılandırma:**

| Parametre | Değer |
|---|---|
| Çıkarım motoru | vLLM v0.22.0 |
| Docker imajı | `vllm/vllm-openai:v0.22.0-ubuntu2404` |
| GPU bellek kullanımı | 0.8 (%80) |
| Maksimum batched token | 8192 |
| Prefix caching | Açık (`--enable-prefix-caching`) |
| Chunked prefill | Açık (`--enable-chunked-prefill`) |
| Reasoning parser | `qwen3` |
| Tool call parser | `qwen3_coder` |
| API portu | 8000 |

> **Not:** NVFP4 varyantlarında `--max-num-batched-tokens` parametresi belirtilmemiştir; vLLM varsayılan değeri kullanmaktadır. NVFP4-MTP varyantında `--override-generation-config` ile üretim parametreleri özelleştirilmiştir.

---

## 2. Quantization Varyantlarının Performansı

### 2.1 Qwen3.6-27B-FP8

FP8 nicelemesi, model ağırlıklarını 8-bit kayan nokta formatında saklar. Bu varyant MTP kullanmamaktadır.

**Performans Tablosu:**

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Latency (s) | Throughput (RPS) |
|---|---|---|---|---|---|
| 1 | 270.57 | 121.87 | 8.13 | 15.75 | 0.06 |
| 2 | 357.77 | 121.13 | 8.13 | 15.74 | 0.06 |
| 4 | 447.17 | 124.23 | 7.89 | 16.23 | 0.06 |
| 8 | 511.45 | 129.14 | 7.57 | 16.91 | 0.06 |
| 16 | 866.95 | 142.24 | 6.76 | 18.93 | 0.05 |

![FP8 TTFT]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-FP8/Qwen3.6-27B-FP8-TTFT.png' | relative_url }})

![FP8 ITL]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-FP8/Qwen3.6-27B-FP8-ITL.png' | relative_url }})

![FP8 TPS]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-FP8/Qwen3.6-27B-FP8-TPS.png' | relative_url }})

![FP8 Latency]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-FP8/Qwen3.6-27B-FP8-Latency.png' | relative_url }})

![FP8 Throughput]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-FP8/Qwen3.6-27B-FP8-Throughput.png' | relative_url }})

**Değerlendirme:**

FP8 varyantı, MTP kullanmadığı için token üretim hızı sınırlıdır. ITL değerinin ~122ms civarında kalması, saniyede yalnızca ~8 token üretilebildiğini göstermektedir. Concurrency arttıkça ITL hafifçe yükselir (122ms → 142ms), ancak TPS düşüşü (%17) ve latency artışı (%20) nispeten mutedildir. Bu, FP8'in GPU'yu tam olarak doyuramadığını ve boş kapasite bulunduğunu gösterir.

TTFT ise concurrency ile belirgin şekilde artmaktadır (271ms → 867ms, +%221). Bu, prefill aşamasının GPU hesaplama kaynaklarını yoğun kullandığını ve eşzamanlı isteklerde sıra oluştuğunu ortaya koymaktadır.

**Neden ITL ve TTFT farklı davranıyor?** GPU'nun iki aşamada iki farklı darboğazla karşı karşıya kalması bu durumu açıklar: **Decode aşaması** bellek bant genişliği sınırlıdır (memory-bound) — her adımda yalnızca 1 token üretilir ve baskın işlem ağırlıkların GPU belleğinden yüklenmesidir; hesaplama birimleri boş kapasitededir. **Prefill aşaması** ise hesaplama sınırlıdır (compute-bound) — giriş token'larının tümü aynı anda işlenir, yoğun matris çarpımları gerektirir ve GPU'nun SM birimleri tam kapasite çalışır. Bu nedenle concurrency arttığında decode hafif etkilenirken, prefill'de ciddi sıra oluşmaktadır (detaylı analiz için Bölüm 6.3'e bakınız).

---

### 2.2 Qwen3.6-27B-FP8-MTP

FP8 nicelemesi + MTP birleşimi. MTP sayesinde her decode adımında birden fazla token üretilir.

**Performans Tablosu:**

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Latency (s) | Throughput (RPS) |
|---|---|---|---|---|---|
| 1 | 322.95 | 49.40 | 19.50 | 6.60 | 0.15 |
| 2 | 516.27 | 46.87 | 19.83 | 6.47 | 0.15 |
| 4 | 530.80 | 50.26 | 18.56 | 6.92 | 0.14 |
| 8 | 620.59 | 55.97 | 16.62 | 7.73 | 0.13 |
| 16 | 812.93 | 66.66 | 13.84 | 9.28 | 0.11 |

![FP8-MTP TTFT]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-FP8-MTP/Qwen3.6-27B-FP8-MTP-TTFT.png' | relative_url }})

![FP8-MTP ITL]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-FP8-MTP/Qwen3.6-27B-FP8-MTP-ITL.png' | relative_url }})

![FP8-MTP TPS]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-FP8-MTP/Qwen3.6-27B-FP8-MTP-TPS.png' | relative_url }})

![FP8-MTP Latency]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-FP8-MTP/Qwen3.6-27B-FP8-MTP-Latency.png' | relative_url }})

![FP8-MTP Throughput]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-FP8-MTP/Qwen3.6-27B-FP8-MTP-Throughput.png' | relative_url }})

**Değerlendirme:**

MTP'nin etkisi çarpıcıdır: ITL 122ms'den 49ms'e düşerek (~%60 azalış), TPS 8.13'ten 19.50'ye çıkmıştır (~%140 artış). Toplam latency 15.75s'den 6.60s'e gerilemiştir (~%58 azalış). Bu, MTP'nin decode aşamasını dramatik biçimde hızlandırdığını doğrulamaktadır.

Ancak concurrency artışına duyarlılık daha yüksektir: TPS %29 düşer (MTP'siz FP8'de %17), latency %40 artar (MTP'siz FP8'de %20). Hızlı bir modelin GPU'yu daha etkin kullandığı ve ek yük altında kaynak çekişmesinin belirgin hale geldiği görülmektedir.

TTFT, MTP'siz FP8 varyantına kıyasla daha yüksek başlangıç değerine sahiptir (323ms vs 271ms). Bu, MTP'nin prefill aşamasına ek hesaplama yükü getirebileceğini düşündürmektedir. TTFT'nin concurrency ile belirgin şekilde artması ise prefill aşamasının hesaplama sınırlı (compute-bound) olmasından kaynaklanmaktadır (Bölüm 2.1'deki prefill/decode darboğaz açıklamasına bakınız).

---

### 2.3 Qwen3.6-27B-AWQ-MTP

AWQ nicelemesi + MTP birleşimi. AWQ, ağırlıkları 4-bit'e sıkıştırır ve bellek bant genişliği tasarrufu sağlar.

**Performans Tablosu:**

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Latency (s) | Throughput (RPS) |
|---|---|---|---|---|---|
| 1 | 266.65 | 37.57 | 25.45 | 5.04 | 0.20 |
| 2 | 562.95 | 35.34 | 25.42 | 5.05 | 0.20 |
| 4 | 845.97 | 38.05 | 23.08 | 5.68 | 0.18 |
| 8 | 625.74 | 45.44 | 20.09 | 6.40 | 0.16 |
| 16 | 876.55 | 60.73 | 14.99 | 8.59 | 0.12 |

![AWQ-MTP TTFT]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-AWQ-MTP/Qwen3.6-27B-AWQ-TTFT.png' | relative_url }})

![AWQ-MTP ITL]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-AWQ-MTP/Qwen3.6-27B-AWQ-ITL.png' | relative_url }})

![AWQ-MTP TPS]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-AWQ-MTP/Qwen3.6-27B-AWQ-TPS.png' | relative_url }})

![AWQ-MTP Latency]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-AWQ-MTP/Qwen3.6-27B-AWQ-Latency.png' | relative_url }})

![AWQ-MTP Throughput]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-AWQ-MTP/Qwen3.6-27B-AWQ-Throughput.png' | relative_url }})

**Değerlendirme:**

AWQ-MTP, tüm varyantlar arasında en yüksek performansı sunmaktadır. Concurrency=1'de 25.45 tok/s TPS, 37.57ms ITL ve 5.04s latency değerleriyle açık ara liderdir. AWQ'nun bellek bant genişliği tasarrufu, MTP'nin çoklu token üretimi ile birleştiğinde decode aşaması dramatik biçimde hızlanmaktadır.

Ancak bu varyant, concurrency artışına en duyarlı olandır: TPS %41 düşüş (25.45 → 14.99), ITL %62 artış (37.57ms → 60.73ms), latency %70 artış (5.04s → 8.59s). Bu, GPU'nun düşük yük altında bile yüksek oranda kullanıldığını ve ek yükün kaynak çekişmesine yol açtığını göstermektedir.

TTFT değerleri düzensiz bir seyir izlemektedir (267ms, 563ms, 846ms, 626ms, 877ms). Concurrency=4'te 846ms'ye çıkıp C=8'de 626ms'e düşmesi, test sırasında sistem koşullarından veya scheduling dalgalanmalarından etkilendiğini düşündürmektedir. Genel olarak TTFT'nin concurrency ile artması, prefill aşamasının hesaplama sınırlı olmasından kaynaklanmaktadır (Bölüm 2.1'deki prefill/decode darboğaz açıklamasına bakınız).

---

### 2.4 Qwen3.6-27B-NVFP4

NVIDIA'ın 4-bit özel formatı. Donanım düzeyinde hızlandırma desteği ile gelir, MTP kullanılmamıştır.

**Performans Tablosu:**

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Latency (s) | Throughput (RPS) |
|---|---|---|---|---|---|
| 1 | 228.42 | 100.40 | 9.86 | 12.98 | 0.08 |
| 2 | 339.55 | 100.29 | 9.79 | 13.08 | 0.08 |
| 4 | 387.42 | 103.28 | 9.48 | 13.50 | 0.07 |
| 8 | 451.22 | 108.04 | 9.03 | 14.17 | 0.07 |
| 16 | 659.95 | 120.80 | 8.00 | 16.00 | 0.06 |

![NVFP4 TTFT]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-NVFP4/Qwen3.6-27B-NVFP4-TTFT.png' | relative_url }})

![NVFP4 ITL]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-NVFP4/Qwen3.6-27B-NVFP4-ITL.png' | relative_url }})

![NVFP4 TPS]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-NVFP4/Qwen3.6-27B-NVFP4-TPS.png' | relative_url }})

![NVFP4 Latency]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-NVFP4/Qwen3.6-27B-NVFP4-Latency.png' | relative_url }})

![NVFP4 Throughput]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-NVFP4/Qwen3.6-27B-NVFP4-Throughput.png' | relative_url }})

**Değerlendirme:**

NVFP4, FP8 varyantına kıyasla tutarlı biçimde daha iyi performans göstermektedir. ITL ~100ms (FP8'de ~122ms), TPS ~9.86 tok/s (FP8'de ~8.13), latency ~13s (FP8'de ~15.75s). 4-bit sıkıştırmanın bellek bant genişliği avantajı, donanım hızlandırmasıyla birleşerek FP8'i geçmektedir.

NVFP4'ün TTFT değerleri tüm varyantlar arasında en düşüktür (228ms @ C=1). Bu, NVFP4'ün prefill aşamasında donanım hızlandırmasından faydalandığını göstermektedir.

Concurrency duyarlılığı FP8 ile benzerdir: TPS %19 düşüş, ITL %20 artış, latency %23 artış. Her iki MTP'siz model de GPU'yu tam doyuramadığı için concurrency artışı nispeten hafif etki yapmaktadır — ITL düşük etki (decode memory-bound), TTFT yüksek etki (prefill compute-bound) şeklindeki darboğaz farkı burada da geçerlidir (Bölüm 2.1'deki açıklamaya bakınız).

---

### 2.5 Qwen3.6-27B-NVFP4-MTP

NVFP4 nicelemesi + MTP birleşimi. 4-bit sıkıştırma ve çoklu token tahmini birlikte kullanılır.

**Performans Tablosu:**

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Latency (s) | Throughput (RPS) |
|---|---|---|---|---|---|
| 1 | 519.21 | 44.32 | 21.02 | 6.15 | 0.16 |
| 2 | 634.90 | 41.92 | 21.68 | 5.96 | 0.17 |
| 4 | 849.66 | 44.79 | 19.94 | 6.54 | 0.15 |
| 8 | 592.18 | 50.64 | 18.27 | 7.03 | 0.14 |
| 16 | 838.59 | 63.38 | 14.47 | 8.89 | 0.11 |

![NVFP4-MTP TTFT]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-NVFP4-MTP/Qwen3.6-27B-NVFP4-MTP-TTFT.png' | relative_url }})

![NVFP4-MTP ITL]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-NVFP4-MTP/Qwen3.6-27B-NVFP4-MTP-ITL.png' | relative_url }})

![NVFP4-MTP TPS]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-NVFP4-MTP/Qwen3.6-27B-NVFP4-MTP-TPS.png' | relative_url }})

![NVFP4-MTP Latency]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-NVFP4-MTP/Qwen3.6-27B-NVFP4-MTP-Latency.png' | relative_url }})

![NVFP4-MTP Throughput]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/Qwen3.6-27B-NVFP4-MTP/Qwen3.6-27B-NVFP4-MTP-Throughput.png' | relative_url }})

**Değerlendirme:**

NVFP4-MTP, FP8-MTP ile yakın performans göstermektedir. Concurrency=1'de TPS 21.02 tok/s (FP8-MTP: 19.50), ITL 44.32ms (FP8-MTP: 49.40ms), latency 6.15s (FP8-MTP: 6.60s). NVFP4'ün bellek bant genişliği avantajı MTP ile birleşince küçük bir ek hız kazanımı sağlamaktadır.

TTFT açısından NVFP4-MTP, Concurrency=1'de 519ms ile diğer tüm varyantlardan yüksektir. Bu belirgin fark, NVFP4+MTP konfigürasyonunun prefill aşamasında ek bir hesaplama yükü oluşturduğuna işaret etmektedir. Kullanıcı ilk token'ı beklerken en uzun süreyi bu varyantta yaşamaktadır. SM121 donanım kısıtları nedeniyle MTP+NVFP4 kombinasyonu prefill'de ek yüke neden olmaktadır (detay için Bölüm 6.4.3'e bakınız).

Concurrency duyarlılığı FP8-MTP ile benzerdir: TPS %31 düşüş, ITL %43 artış, latency %45 artış. ITL'nin concurrency ile belirgin artışı, GPU'nun decode aşamasında da doygunluğa yaklaşmasıyla bellek bant genişliği çekişmesinin artmasından kaynaklanmaktadır; TTFT artışı ise prefill'in hesaplama sınırlı doğasından (Bölüm 2.1'deki açıklamaya bakınız). Concurrency=2'de TPS'nin hafifçe artması (21.02 → 21.68) ve latency'nin düşmesi (6.15s → 5.96s) dikkat çekicidir; bu, C=2'de olası bir batching etkisine işaret edebilir. Ancak fark (~%3 TPS) küçük örneklem gürültüsü sınırları içindedir; kesin bir "sweet spot" iddiası için daha fazla ölçüm gerekir (bkz. Bölüm 1.7 Sınırlılık).

---

## 3. Quantization Format Karşılaştırması

**TTFT Karşılaştırması (Tüm Varyantlar):**

![TTFT Karşılaştırması]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/comparison-charts/comparison-TTFT.png' | relative_url }})

### 3.1 MTP'siz: FP8 vs NVFP4

İki MTP'siz varyantın concurrency seviyelerine göre karşılaştırılması:

**TPS (tokens/s) Karşılaştırması:**

| Concurrency | FP8 | NVFP4 | Fark |
|---|---|---|---|
| 1 | 8.13 | 9.86 | +21.3% |
| 2 | 8.13 | 9.79 | +20.4% |
| 4 | 7.89 | 9.48 | +20.2% |
| 8 | 7.57 | 9.03 | +19.3% |
| 16 | 6.76 | 8.00 | +18.3% |

**ITL (ms) Karşılaştırması:**

| Concurrency | FP8 | NVFP4 | Fark |
|---|---|---|---|
| 1 | 121.87 | 100.40 | -17.6% |
| 2 | 121.13 | 100.29 | -17.2% |
| 4 | 124.23 | 103.28 | -16.9% |
| 8 | 129.14 | 108.04 | -16.3% |
| 16 | 142.24 | 120.80 | -15.1% |

**Latency (s) Karşılaştırması:**

| Concurrency | FP8 | NVFP4 | Fark |
|---|---|---|---|
| 1 | 15.75 | 12.98 | -17.6% |
| 2 | 15.74 | 13.08 | -16.9% |
| 4 | 16.23 | 13.50 | -16.8% |
| 8 | 16.91 | 14.17 | -16.2% |
| 16 | 18.93 | 16.00 | -15.5% |

**Değerlendirme:**

NVFP4, FP8'e karşı tüm metriklerde tutarlı biçimde üstündür. Bu avantajın temel nedeni NVFP4'ün 4-bit sıkıştırmasının bellek bant genişliği gereksinimini yarıya indirmesidir. LLM decode aşaması bellek bant genişliği sınırlı (memory-bound) bir iş yüküdür; daha az veri taşıyan NVFP4, GPU'nun hesaplama birimlerini daha verimli besleyebilmektedir.

Avantaj oranı concurrency arttıkça hafifçe daralmaktadır (TPS'de %21.3'ten %18.3'e). Bu, yüksek yük altında bellek bant genişliği avantajının GPU hesaplama kaynakları sınırına yaklaşmasıyla azaldığını göstermektedir.

### 3.2 MTP'li: FP8-MTP vs AWQ-MTP vs NVFP4-MTP

Üç MTP'li varyantın karşılaştırması:

**Concurrency=1 Karşılaştırması:**

| Metrik | FP8-MTP | AWQ-MTP | NVFP4-MTP |
|---|---|---|---|
| TPS (tok/s) | 19.50 | **25.45** | 21.02 |
| ITL (ms) | 49.40 | **37.57** | 44.32 |
| Latency (s) | 6.60 | **5.04** | 6.15 |
| TTFT (ms) | 322.95 | **266.65** | 519.21 |
| Throughput (RPS) | 0.15 | **0.20** | 0.16 |

**Concurrency=16 Karşılaştırması:**

| Metrik | FP8-MTP | AWQ-MTP | NVFP4-MTP |
|---|---|---|---|
| TPS (tok/s) | 13.84 | **14.99** | 14.47 |
| ITL (ms) | 66.66 | **60.73** | 63.38 |
| Latency (s) | 9.28 | **8.59** | 8.89 |
| TTFT (ms) | **812.93** | 876.55 | 838.59 |
| Throughput (RPS) | 0.11 | **0.12** | 0.11 |

**Değerlendirme:**

AWQ-MTP, düşük concurrency'de açık ara liderdir. TPS'de FP8-MTP'ten %30, NVFP4-MTP'ten %21 daha hızlıdır. Ancak yüksek concurrency'de (C=16) fark önemli ölçüde daralır: AWQ-MTP'nin TPS avantajı FP8-MTP'e %8'e, NVFP4-MTP'e %3'e düşer.

Bu durum, AWQ'nun bellek bant genişliği avantajının düşük yük altında en etkili olduğunu ve yük arttıkça hesaplama kaynaklarının darboğaz haline geldiğini göstermektedir. Yüksek concurrency'de tüm varyantlar benzer performans sergilemeye başlar.

NVFP4-MTP, FP8-MTP ile yakın performans gösterirken TTFT açısından en kötü değerlere sahiptir. İlk token gecikmesinin kritik olduğu senaryolarda (örn. sohbet robotları) bu dezavantaj dikkate alınmalıdır.

---

## 4. MTP Etkisinin Derinlemesine Analizi

**TPS Karşılaştırması (Tüm Varyantlar):**

![TPS Karşılaştırması]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/comparison-charts/comparison-TPS.png' | relative_url }})

### 4.1 FP8 → FP8-MTP Dönüşüm Etkisi

| Metrik | FP8 (C=1) | FP8-MTP (C=1) | Değişim |
|---|---|---|---|
| TPS | 8.13 tok/s | 19.50 tok/s | **+139.7%** |
| ITL | 121.87 ms | 49.40 ms | **-59.5%** |
| Latency | 15.75 s | 6.60 s | **-58.1%** |
| TTFT | 270.57 ms | 322.95 ms | +19.4% |
| Throughput | 0.06 RPS | 0.15 RPS | **+150.0%** |

MTP'nin FP8 üzerindeki etkisi her concurrency seviyesinde tutarlıdır:

| Concurrency | TPS Artışı | ITL Azalışı | Latency Azalışı |
|---|---|---|---|
| 1 | +139.7% | -59.5% | -58.1% |
| 2 | +143.5% | -61.3% | -58.8% |
| 4 | +135.2% | -59.6% | -57.4% |
| 8 | +119.4% | -56.6% | -54.3% |
| 16 | +104.7% | -53.1% | -51.0% |

**Önemli bulgu:** MTP'nin hız kazancı concurrency arttıkça azalmaktadır. TPS artışı %140'tan %105'e düşmektedir. Bu, yüksek yük altında MTP'nin ek hesaplama yükünün kaynak çekişmesine yol açtığını göstermektedir.

### 4.2 NVFP4 → NVFP4-MTP Dönüşüm Etkisi

| Metrik | NVFP4 (C=1) | NVFP4-MTP (C=1) | Değişim |
|---|---|---|---|
| TPS | 9.86 tok/s | 21.02 tok/s | **+113.2%** |
| ITL | 100.40 ms | 44.32 ms | **-55.9%** |
| Latency | 12.98 s | 6.15 s | **-52.6%** |
| TTFT | 228.42 ms | 519.21 ms | **+127.3%** |
| Throughput | 0.08 RPS | 0.16 RPS | **+100.0%** |

| Concurrency | TPS Artışı | ITL Azalışı | Latency Azalışı |
|---|---|---|---|
| 1 | +113.2% | -55.9% | -52.6% |
| 2 | +121.3% | -58.2% | -54.4% |
| 4 | +110.3% | -56.7% | -51.6% |
| 8 | +102.3% | -53.1% | -50.4% |
| 16 | +80.9% | -47.5% | -44.4% |

**Önemli bulgu:** NVFP4'te MTP'nin TTFT üzerindeki olumsuz etkisi çarpıcıdır. TTFT 228ms'den 519ms'e çıkmış (%127 artış). Bu, NVFP4+MTP konfigürasyonunun prefill aşamasında önemli ek yük oluşturduğunu göstermektedir. Kullanıcı ilk token'ı beklerken ciddi bir gecikme yaşanacaktır.

Ayrıca NVFP4'te MTP'nin hız kazancı, FP8'e kıyasla tüm concurrency seviyelerinde daha düşüktür (TPS artışı %113 vs %140). Bu, NVFP4'ün donanım hızlandırmasının MTP ile tam uyumlu olmayabileceğini düşündürmektedir.

### 4.3 MTP Hız Kazancı Oranı vs Concurrency

MTP'li / MTP'siz TPS oranı, MTP'nin faydasının yük altında nasıl değiştiğini gösterir:

| Concurrency | FP8 MTP Oranı | NVFP4 MTP Oranı |
|---|---|---|
| 1 | 2.40x | 2.13x |
| 2 | 2.44x | 2.21x |
| 4 | 2.35x | 2.10x |
| 8 | 2.19x | 2.02x |
| 16 | 2.05x | 1.81x |

**Değerlendirme:**

Her iki quantization formatında da MTP hız kazancı oranı concurrency arttıkça azalmaktadır. FP8'de 2.40x'ten 2.05x'e, NVFP4'te 2.13x'ten 1.81x'e düşmektedir. Bu, MTP'nin en büyük faydayı düşük yük koşullarında sağladığını ve yüksek yük altında getirisinin azaldığını kanıtlamaktadır.

NVFP4'te MTP oranı tüm seviyelerde FP8'den daha düşüktür. Bu, NVFP4 donanım hızlandırmasının MTP'siz durumda zaten daha verimli olduğu için MTP'nin marjinal katkısının daha az olmasından kaynaklanmaktadır.

---

## 5. Concurrency Etkisinin Analizi

### 5.1 TPS (Token Üretim Hızı) Düşüşü

Concurrency arttıkça tüm varyantlarda TPS düşmektedir:

| Varyant | C=1 | C=2 | C=4 | C=8 | C=16 | Toplam Düşüş |
|---|---|---|---|---|---|---|
| FP8 | 8.13 | 8.13 | 7.89 | 7.57 | 6.76 | -17% |
| FP8-MTP | 19.50 | 19.83 | 18.56 | 16.62 | 13.84 | -29% |
| AWQ-MTP | 25.45 | 25.42 | 23.08 | 20.09 | 14.99 | -41% |
| NVFP4 | 9.86 | 9.79 | 9.48 | 9.03 | 8.00 | -19% |
| NVFP4-MTP | 21.02 | 21.68 | 19.94 | 18.27 | 14.47 | -31% |

**Analiz:**

- **MTP'siz modeller** (FP8, NVFP4) düşük düşüş oranları sergilemektedir (%17-19). Bu modeller GPU'yu tam kapasite kullanamadığı için concurrency artışı ek yüklemeye devam edebilmekte ve bireysel TPS çok etkilenmemektedir.
- **MTP'li modeller** (FP8-MTP, AWQ-MTP, NVFP4-MTP) daha yüksek düşüş oranları sergilemektedir (%29-41). Özellikle AWQ-MTP %41 düşüşle en yüksek orana sahiptir. Bu, hızlı modellerin GPU'yu daha iyi doyurduğu ve ek yükün kaynak çekişmesine yol açtığını doğrulamaktadır.
- **FP8-MTP ve NVFP4-MTP** arasında düşüş oranı benzerdir (%29 vs %31), bu da her iki formatta da GPU'nun benzer oranda doygun hale geldiğini göstermektedir.

### 5.2 ITL (Token Arası Gecikme) Artışı

| Varyant | C=1 | C=16 | Artış Oranı |
|---|---|---|---|
| FP8 | 121.87 ms | 142.24 ms | +17% |
| FP8-MTP | 49.40 ms | 66.66 ms | +35% |
| AWQ-MTP | 37.57 ms | 60.73 ms | +62% |
| NVFP4 | 100.40 ms | 120.80 ms | +20% |
| NVFP4-MTP | 44.32 ms | 63.38 ms | +43% |

**Analiz:**

ITL artışı, bellek bant genişliği çekişmesinin doğrudan göstergesidir. MTP'li modellerde ITL artışı belirgin şekilde daha yüksektir:
- AWQ-MTP'de %62 artış: 4-bit ağırlıkların taşınması yüksek bant genişliği kullanır; MTP ile birden fazla token üretilirken bu talep katlanır.
- FP8'de sadece %17 artış: GPU bellek bant genişliği hala kapasiteye sahiptir.

### 5.3 TTFT (İlk Token Gecikmesi) Artışı

TTFT, concurrency artışından en çok etkilenen metriktir:

| Varyant | C=1 | C=16 | Artış Oranı |
|---|---|---|---|
| FP8 | 270.57 ms | 866.95 ms | +220% |
| FP8-MTP | 322.95 ms | 812.93 ms | +152% |
| AWQ-MTP | 266.65 ms | 876.55 ms | +229% |
| NVFP4 | 228.42 ms | 659.95 ms | +189% |
| NVFP4-MTP | 519.21 ms | 838.59 ms | +61% |

**Analiz:**

- TTFT'nin 2-3x artması, prefill aşamasının GPU hesaplama kaynaklarını yoğun biçimde kullandığını ve eşzamanlı isteklerde ciddi sıralama oluştuğunu göstermektedir.
- NVFP4-MTP'te sadece %61 artış dikkat çekicidir. Ancak bu varyant zaten en yüksek başlangıç TTFT'sine (519ms) sahiptir; mutlak değer olarak C=16'da 839ms ile diğer varyantlara yakındır. (Buradaki %61, concurrency'nin C=1→C=16 etkisidir; Bölüm 4.2'deki %127 ise sabit C=1'de MTP'nin eklenmesinin etkisidir — iki oran farklı karşılaştırmalara aittir.)
- Prefill aşaması, KV-cache oluşturma dahil yoğun matris çarpımları gerektirir. Bu aşama bellek bant genişliğinden ziyade hesaplama gücü ile sınırlıdır ve GPU'nun hesaplama birimlerinin paylaşılması gecikmeye yol açar.

**Pratik etki:** Kullanıcı açısından, concurrency arttıkça "yanıt gelmeye başlama süresi" 3 kata kadar uzayabilir. Bu, interaktif sohbet senaryolarında kullanıcı deneyimini doğrudan olumsuz etkiler.

### 5.4 Toplam Latency Artışı

| Varyant | C=1 | C=16 | Artış Oranı |
|---|---|---|---|
| FP8 | 15.75 s | 18.93 s | +20% |
| FP8-MTP | 6.60 s | 9.28 s | +40% |
| AWQ-MTP | 5.04 s | 8.59 s | +70% |
| NVFP4 | 12.98 s | 16.00 s | +23% |
| NVFP4-MTP | 6.15 s | 8.89 s | +45% |

**Analiz:**

Toplam latency, TTFT ve decode süresinin birleşimidir. TTFT'nin büyük artışına rağmen toplam latency'deki artış daha düşüktür, çünkü decode süresi (ITL × token sayısı) baskın bileşendir.

MTP'siz modellerde toplam latency artışı sınırlıdır (%20-23). MTP'li modellerde ise %40-70 arasında değişmektedir. AWQ-MTP %70 artışla en yüksek orana sahiptir.

### 5.5 Toplam Throughput (RPS) Eğrisi

| Varyant | C=1 | C=2 | C=4 | C=8 | C=16 |
|---|---|---|---|---|---|
| FP8 | 0.06 | 0.06 | 0.06 | 0.06 | 0.05 |
| FP8-MTP | 0.15 | 0.15 | 0.14 | 0.13 | 0.11 |
| AWQ-MTP | 0.20 | 0.20 | 0.18 | 0.16 | 0.12 |
| NVFP4 | 0.08 | 0.08 | 0.07 | 0.07 | 0.06 |
| NVFP4-MTP | 0.16 | 0.17 | 0.15 | 0.14 | 0.11 |

**Analiz:**

Yukarıdaki "Throughput (RPS)" değeri **per-request** bir metriktir (`1 / ortalama_latency`; bkz. Bölüm 1.5). Tanımı gereği concurrency'den bağımsızdır; bu nedenle düz görünmesi GPU'nun ölçeklenmediğini **kanıtlamaz** — metrik yapısal olarak concurrency ile artamaz.

Sistemin gerçek toplam kapasitesi `Concurrency / ortalama_latency` (toplam RPS) veya `TPS × Concurrency` (eşzamanlı üretilen toplam token/s) ile ölçülür. Aşağıda **sistem geneli RPS** verilmiştir:

| Varyant | C=1 | C=2 | C=4 | C=8 | C=16 |
|---|---|---|---|---|---|
| FP8 | 0.06 | 0.13 | 0.25 | 0.47 | 0.85 |
| FP8-MTP | 0.15 | 0.31 | 0.58 | 1.04 | 1.72 |
| AWQ-MTP | 0.20 | 0.40 | 0.70 | 1.25 | 1.86 |
| NVFP4 | 0.08 | 0.15 | 0.30 | 0.56 | 1.00 |
| NVFP4-MTP | 0.16 | 0.34 | 0.61 | 1.14 | 1.80 |

Görüldüğü üzere sistem geneli RPS concurrency ile **belirgin biçimde artmaktadır** (ör. FP8-MTP: C=1'de 0.15 → C=16'da 1.72, ~11x; FP8: ~13x). Bu, Bölüm 6.1'deki `TPS × Concurrency` tablosuyla tutarlıdır.

**Doğru sonuç:** Tek GPU'da concurrency'yi artırmak toplam iş kapasitesini kayda değer ölçüde **artırır**; karşılığında bireysel istek latency'si ve TPS'si bir miktar düşer. Yani concurrency, latency ile toplam verim arasında bir **takastır**. Ölçekleme verimliliği yük altında azalsa da (C=16'da FP8 için %83, AWQ-MTP için %59; bkz. Bölüm 6.1) toplam kapasite artmaya devam eder.

---

## 6. Ölçeklenebilirlik ve GPU Verimlilik Analizi

### 6.1 İdeal Lineer Ölçekleme vs Gerçek Performans

Eğer GPU tam olarak ölçeklenebilseydi, concurrency × TPS sabit kalması beklenirdi. Yani C=2'de TPS yarıya düşmemeli, C=4'te çeyreğine düşmemelidir.

**TPS × Concurrency (Toplam Token Üretim Kapasitesi):**

| Concurrency | FP8 | FP8-MTP | AWQ-MTP | NVFP4 | NVFP4-MTP |
|---|---|---|---|---|---|
| 1 | 8.1 | 19.5 | 25.5 | 9.9 | 21.0 |
| 2 | 16.3 | 39.7 | 50.8 | 19.6 | 43.4 |
| 4 | 31.6 | 74.2 | 92.3 | 37.9 | 79.8 |
| 8 | 60.6 | 133.0 | 160.7 | 72.2 | 146.2 |
| 16 | 108.2 | 221.4 | 239.8 | 128.0 | 231.5 |

> **Not:** Bu tablo sistemin **gerçek toplam kapasite** ölçüsüdür ve concurrency ile büyümektedir (ör. FP8: 8.1 → 108.2 tok/s, ~13x). Bölüm 5.5'teki "Throughput (RPS)" düz eğrisiyle çelişmez; oradaki metrik per-request (`1/latency`) olduğu için tanımı gereği sabittir. Toplam kapasitenin doğru göstergesi bu tablodur.

**İdeal ölçekleme (C=1 TPS × Concurrency):**

| Concurrency | FP8 (İdeal) | FP8 (Gerçek) | Verimlilik |
|---|---|---|---|
| 1 | 8.1 | 8.1 | 100% |
| 2 | 16.3 | 16.3 | 100% |
| 4 | 32.5 | 31.6 | 97.2% |
| 8 | 65.0 | 60.6 | 93.2% |
| 16 | 130.0 | 108.2 | 83.2% |

| Concurrency | AWQ-MTP (İdeal) | AWQ-MTP (Gerçek) | Verimlilik |
|---|---|---|---|
| 1 | 25.5 | 25.5 | 100% |
| 2 | 50.9 | 50.8 | 99.8% |
| 4 | 101.8 | 92.3 | 90.7% |
| 8 | 203.6 | 160.7 | 78.9% |
| 16 | 407.2 | 239.8 | 58.9% |

**Değerlendirme:**

- FP8, concurrency=16'da bile %83.2 verimlilikle nispeten iyi ölçeklenmektedir. Bunun nedeni GPU'nun düşük bireysel TPS'si nedeniyle henüz tam kapasiteye ulaşmamış olmasıdır.
- AWQ-MTP ise C=16'da %58.9 verimliliğe düşmektedir. GPU yoğun biçimde kullanıldığından, ek yük doğrudan kaynak çekişmesine yol açmaktadır.
- Bu veriler, her varyantın farklı bir "optimum concurrency" noktasına sahip olduğunu göstermektedir.

### 6.2 GPU Doygunluk Haritası

Her varyantın farklı concurrency seviyelerinde GPU'yu ne ölçüde doyurduğunu gösteren analiz:

**Bireysel TPS'nin C=1'e Oranı (Doygunluk Endeksi):**

| Concurrency | FP8 | FP8-MTP | AWQ-MTP | NVFP4 | NVFP4-MTP |
|---|---|---|---|---|---|
| 1 | 100% | 100% | 100% | 100% | 100% |
| 2 | 100% | 102% | 100% | 99% | 103% |
| 4 | 97% | 95% | 91% | 96% | 95% |
| 8 | 93% | 85% | 79% | 92% | 87% |
| 16 | 83% | 71% | 59% | 81% | 69% |

> **Bu tablo nasıl okunur?**
>
> Doygunluk endeksi, bir isteğin eşzamanlı yük altında gördüğü hızın, GPU'da yalnız çalışsaydı göreceği hıza oranıdır:
>
> `Doygunluk Endeksi = (C seviyesindeki bireysel TPS) / (C=1'deki bireysel TPS) × 100`
>
> **Somut örnek (FP8, C=16):** Toplam kapasite 108.2 tok/s (Bölüm 6.1 tablosu) ÷ 16 istek ≈ istek başına 6.8 tok/s. C=1'deki bireysel hız 8.1 tok/s olduğundan 6.8 / 8.1 ≈ **%83**.
>
> **%100**, C=1 performansının korunduğu — isteklerin birbirini yavaşlatmadığı, GPU'da hâlâ boş kapasite olduğu — anlamına gelir. Düşüş, isteklerin aynı kaynaklar (özellikle bellek bant genişliği) için çekişmeye başladığını, yani GPU'nun doygunluğa yaklaştığını gösterir. C=2'deki %102-103 gibi değerler ölçüm gürültüsüdür.
>
> **Önemli nüans:** Düşük endeks "kötü varyant" demek değildir; endeks düşerken toplam kapasite artmaya devam eder (örn. AWQ-MTP C=16'da %59'a düşmesine rağmen 239.8 tok/s toplam üretimle FP8'in iki katından fazladır). Endeksin pratik kullanımı şudur: servis SLA'sı kullanıcı başına minimum hız gerektiriyorsa, her varyantın makul concurrency tavanı bu tablodan okunur. Bu endeks, Bölüm 6.1'deki "Verimlilik" sütunuyla matematiksel olarak aynıdır; 6.1 hesabı iki varyant için detaylandırırken bu tablo beş varyantın tümünü tek haritada toplar.

**Değerlendirme:**

- AWQ-MTP, C=8'de %79'a, C=16'da %59'a düşmektedir. GPU doygunluğa ulaşmış ve ek yük ciddi performans kaybına yol açmaktadır.
- FP8 ve NVFP4, C=16'da bile %81-83 seviyesindedir. GPU'da halen hesaplama kapasitesi mevcuttur; darboğaz bellek bant genişliğindedir.
- MTP'li varyantlar tüm seviyelerde daha düşük doygunluk endeksine sahiptir çünkü GPU'yu daha verimli kullanırlar ve ek yük için daha az boş kapasite kalır.

### 6.3 Darboğaz Tespiti: Prefill vs Decode

İki ana aşamanın concurrency altındaki davranışına göre darboğaz analizi:

| Aşama | Metrik | C=1→C=16 Değişim | Darboğaz Tipi |
|---|---|---|---|
| Prefill | TTFT | 2-3x artış | Hesaplama sınırlı (compute-bound) |
| Decode | ITL | %17-62 artış | Bellek bant genişliği sınırlı (memory-bound) |

**Değerlendirme:**

- **Prefill aşaması** hesaplama sınırlıdır: Giriş token'larının tümü aynı anda işlenir, yoğun matris çarpımları gerektirir. Eşzamanlı istekler GPU'nun SM (Streaming Multiprocessor) birimlerini paylaşmak zorundadır.
- **Decode aşaması** bellek bant genişliği sınırlıdır: Her adımda yalnızca bir (veya MTP ile birkaç) token üretilir; baskın işlem, ağırlıkların GPU belleğinden yüklenmesidir. Daha sıkıştırılmış formatlar (AWQ, NVFP4) daha az veri taşıyarak bu darboğazı hafifletir.

**Pratik sonuç:**
- Uzun prompt'lu senaryolarda (uzun doküman özetleme vb.) prefill darboğazı baskın olacaktır
- Kısa prompt'lu ama uzun yanıt senaryolarında (kod üretimi, yaratıcı yazı) decode darboğazı baskın olacaktır
- AWQ-MTP, decode bant genişliği darboğazını en iyi çözen konfigürasyondur

### 6.4 DGX Spark (SM121) Donanım Kısıtları ve NVFP4 Performansı

NVFP4, 4-bit sıkıştırma ile bellek bant genişliği gereksinimini FP8'e göre yarıya indirmektedir. Decode aşaması bellek bant genişliği sınırlı (memory-bound) olduğu için bu teorik olarak ~2x hızlanma vaat eder. Ancak Bölüm 3.1'de görüldüğü üzere NVFP4, FP8'e yalnızca %21-18 daha hızlıdır. Bu bölüm, NVFP4'ün teorik hızlanmasını neden realize edemediğini donanım ve yazılım açısından incelemektedir.

#### 6.4.1 SM121 vs SM100 Mimari Karşılaştırması

DGX Spark, NVIDIA Grace (ARM64) CPU ve Blackwell GPU'nun aynı paket üzerinde bulunduğu GB10 SoC'ye sahiptir. Sistem, CPU ve GPU'nun paylaştığı **128 GB LPDDR5x (273 GB/s) birleşik bellek (unified memory)** kullanmaktadır; ayrı bir VRAM bulunmamaktadır. GPU, SM 12.1 (compute capability) mimarisindedir ve 48 SM, 6.144 CUDA core barındırır. SM başına konvansiyonel sayımla 4 tensör çekirdeği bulunur (≈192 toplam); ancak bunlar, veri merkezi Blackwell'in (SM100) 5. nesil `tcgen05` + TMEM altyapısından farklı olarak yalnızca warp-düzeyi `mma.sync` yolu üzerinden çalışır.

Veri merkezi Blackwell GPU'lar (B200, GB200) ise SM 10.0 (compute capability) mimarisindedir. Her iki mimari de "Blackwell" olarak anılmakla birlikte, tensor core altyapıları önemli ölçüde farklıdır:

| Özellik | SM100 (B200, CC 10.0) | SM121 (DGX Spark/GB10, CC 12.1) | Kaynak |
|---|---|---|---|
| FP4 `mma.sync` (e2m1) | — | ✅ Destekleniyor | PTX ISA §9.7.15.5.14 [[1]](#ref1) |
| `tcgen05.mma` (5. nesil TC yolu) | ✅ Destekleniyor | ❌ Desteklenmiyor | PTX ISA §9.7.17.7.1 [[2]](#ref2) |
| Tensor Memory (TMEM) | 256 KB | Yok | PTX ISA §9.7.17.1 [[3]](#ref3) |
| CTA Pairs / Cooperative MMA | ✅ Destekleniyor | ❌ Desteklenmiyor | PTX ISA §9.7.17.5.1 [[4]](#ref4) |
| SMEM / SM (maks.) | 228 KB | 128 KB | Blackwell Tuning Guide [[5]](#ref5) |
| SMEM / thread block (maks.) | 227 KB | 99 KB | Blackwell Tuning Guide [[5]](#ref5) |
| SM sayısı | 148 (aktif; 160 fiziksel) | 48 | deviceQuery / TechPowerUp [[5]](#ref5) |
| Tensör çekirdeği / SM | 4 (5. nesil, `tcgen05`) | 4 (warp-düzeyi `mma.sync`) | CUDA PG / TechPowerUp [[5]](#ref5) |
| FP4 tepe (seyreklik ile) | ~9 PFLOP | ~1 PFLOP | NVIDIA spec |
| Bellek bant genişliği | ~8 TB/s (HBM3e) | 273 GB/s (LPDDR5x) | NVIDIA spec |

DGX Spark (SM121), Blackwell FP4 tensor core'larına sahiptir ve `mma.sync.aligned.m16n8k64.f32.e2m1.e2m1` instruction'ı donanım düzeyinde çalışmaktadır. SM121, `compute_120f` ailesinde yer almakta olup CC 12.0 ve 12.1'i kapsamaktadır [[1]](#ref1), [[6]](#ref6). Ancak veri merkezi Blackwell GPU'lardan (SM100) farklı olarak, SM121'de 5. nesil tensor core altyapısının tamamı mevcut değildir: `tcgen05.mma` instruction set'i [[2]](#ref2), Tensor Memory [[3]](#ref3) ve CTA Pairs/Cooperative MMA [[4]](#ref4) SM121'de desteklenmemektedir.

#### 6.4.2 NVFP4 Neden Teorik Hızlanmayı Realize Edemiyor?

NVFP4'ün SM121'de teorik potansiyeline ulaşamamasının nedenleri hem donanım hem yazılım kaynaklıdır:

**1. TMEM eksikliği ve SMEM baskısı:**

SM100'de 256KB TMEM, FP4 kernel'lerinin ara sonuçlarını SMEM dışında tutmasına olanak tanır. SM121'de TMEM yok; tüm ara veriler blok başına 99KB SMEM'e sığmak zorundadır. NVFP4'ün blok ölçekli (block-scaled) formatı, E2M1 ağırlıkları ve FP8 blok ölçeklerini aynı anda SMEM'de tutmayı gerektirir. SM100 için tasarlanan varsayılan CUTLASS FP4 tile boyutları, SM121'in blok başına 99KB SMEM sınırını aşmaktadır; topluluk ölçümleri tile boyutlarının bu bütçeye sığacak şekilde küçültülmesi gerektiğini doğrulamaktadır (BTankut'un tile taraması: prefill/büyük batch için 256×128 ≈154 TFLOPS, decode/küçük batch için 128×128 ≈147 TFLOPS en iyi sonuç [[10]](#ref10)). Bu küçülme daha düşük arithmetic intensity'ye ve bellek bant genişliği sınırına daha erken çarpmaya neden olur.

**2. tcgen05.mma eksikliği:**

`tcgen05.mma`, FP4 matris çarpımlarını en verimli biçimde dispatch eden PTX instruction'dır [[2]](#ref2). SM121'de yalnızca `mma.sync.aligned.m16n8k64.f32.e2m1.e2m1` kullanılabilmekte; CUTLASS, CuTe API soyutlama yoluna yönelmek zorunda kalmaktadır.

**3. CTA Pairs / Cooperative MMA eksikliği:**

SM100'de iki SM birleşip tek bir MMA işlemi yürütebilmektedir [[4]](#ref4). SM121'de bu işbirliği mekanizması bulunmamaktadır.

**4. Daha az SM ve zayıf tensor core yolu:**

SM100 (B200) 148 aktif SM'e sahipken DGX Spark (SM121) yalnızca 48 SM içerir (~3x fark). Ayrıca SM100'ün 5. nesil `tcgen05` + TMEM tensor core altyapısı SM121'de yoktur; SM121 warp-düzeyi `mma.sync` yoluna düşer [[5]](#ref5). Bu iki etken birlikte FP4 tepe hesaplama kapasitesini ~1 PFLOP (SM121) vs ~9 PFLOP (SM100) seviyesinde sınırlar (bkz. Ek A.1-4).

**5. Bellek bant genişliği:**

273 GB/s LPDDR5x (SM121) vs ~8 TB/s HBM3e (SM100). Decode aşaması memory-bound olduğundan, NVFP4'ün 4-bit sıkıştırması her iki platformda da bant genişliği tasarrufu sağlar; ancak DGX Spark'ın düşük bant genişliği, hesaplama hızlanmasının bant genişliği sınırına çarpmasına ve NVFP4'ün hesaplama avantajının kaybolmasına yol açmaktadır.

**6. E2M1 activation quantization overhead:**

NVFP4, W4A4 (ağırlıklar ve aktivasyonlar 4-bit) çalışma modunda, aktivasyonların çalışma zamanında BF16'dan E2M1'e dönüştürülmesini gerektirir. SM121'de `cvt.rn.satfinite.e2m1x2.f32` PTX instruction'ı, doğru derleme bayraklarıyla (`sm_121a`) kullanılabilmektedir; ancak vLLM v0.22.0'ın CMake süreci bu bayrakları doğru iletememektedir (Bölüm 6.4.4'e bakınız).

#### 6.4.3 MTP + NVFP4 Neden Sorunlu?

NVFP4+MTP konfigürasyonu, Bölüm 2.5'te incelendiği üzere en yüksek TTFT değerine (519ms) sahiptir. Bunun nedeni:

- MTP, her decode adımında ek hesaplama yükü getirir (birden fazla token üretimi + doğrulama)
- NVFP4'ün SMEM kısıtları, MTP'nin eklediği hesaplama yükünü absorb etmeyi zorlaştırır
- Prefill aşaması hesaplama sınırlıdır (Bölüm 6.3); NVFP4+MTP kombinasyonu bu aşamadaki yükü artırırken, tcgen05 eksikliği ve SMEM kısıtları ek hesaplama kapasitesi sağlayamaz
- Sonuç: TTFT'de %127 artış (NVFP4 MTP'siz 228ms → NVFP4-MTP 519ms)

#### 6.4.4 Yazılım Tarafındaki Eksiklikler

Donanım kısıtlarına ek olarak, NVFP4'ün SM121'deki yazılım desteği de eksiktir. Bu eksiklikler, donanım kısıtlarının etkisini ağırlaştırmaktadır:

| Sorun | Açıklama | Durum |
|---|---|---|
| CMake `sm_121a` suffix silinmesi | vLLM derlemesi `sm_121a` → `sm_120` olarak derleniyor, E2M1 PTX devre dışı kalıyor | PR #37725 ile düzeltildi [[7]](#ref7) |
| SM121 capability gate hatası | `cuda_device_capability >= 110` kontrolü SM121'i (121) geçersiz sayıyor | PR #38126 ile düzeltildi [[8]](#ref8) |
| E2M1 yazılım dönüşümü eksik | `cvt.rn.satfinite.e2m1x2.f32` doğru derlenmediğinde yazılım fallback yok | PR #35947 ile upstream'e alındı [[9]](#ref9) |
| CUTLASS tile boyutları SM121 için optimize değil | Varsayılan tile'lar SM100'ün 228KB SMEM'i için tasarlanmış | Topluluk çözümü mevcut (BTankut) [[10]](#ref10) |
| MoE grouped GEMM kernel eksik | SM121 için optimize edilmiş kernel bulunmuyor | FlashInfer PR #2650 devam ediyor [[11]](#ref11) |
| MTP + NVFP4 kısıtı | vLLM'de belirli NVFP4+MTP yollarında MTP head yüklenmiyor (evrensel bir yasak değil, yola bağlı) | MTP head'i BF16'da tutan workaround / Avarok patch'i ile çözülebilir [[12]](#ref12) |

> **Kaynak:** [vLLM Issue #37141 — Upstream DGX Spark improvements from Avarok-Cybersecurity/dgx-vllm](https://github.com/vllm-project/vllm/issues/37141)

NVFP4'ün SM121'deki yazılım desteği henüz olgunlaşmamıştır; ancak topluluk çözümleri NVFP4 performansını önemli ölçüde iyileştirebilmektedir. Avarok-Cybersecurity, Marlin W4A16 backend ve yazılım E2M1 dönüşümü ile optimize edilmiş bir Docker imajı sunmaktadır [[12]](#ref12). BTankut ise CUTLASS tile tuning ve SM121 admissible_archs patch'leri ile iyileştirme sağlamaktadır [[10]](#ref10). Bu geliştirmelerin vLLM upstream'ine alınması için çalışmalar devam etmektedir [[vLLM Issue #37141]](https://github.com/vllm-project/vllm/issues/37141). Ancak tcgen05, TMEM ve CTA Pairs eksikliği donanım tabanlı bir üst sınır oluşturmakta olup, yazılım iyileştirmeleri bu sınırı aşamaz.

**Bu rapordaki tüm ölçümler, söz konusu topluluk yamaları uygulanmamış stok `vllm/vllm-openai:v0.22.0-ubuntu2404` imajıyla alınmıştır.** Dolayısıyla buradaki NVFP4 ve NVFP4-MTP sonuçları mevcut upstream durumunu yansıtır; yamaların uygulanmasıyla iyileşme beklenebilir (nicel tahmin için Ek A.3'e bakınız).

#### 6.4.5 Kaynaklar

<a id="ref1"></a>\[1\] NVIDIA, *PTX ISA v9.3*, Bölüm 9.7.15.5.14 — Multiply-and-Accumulate Instruction: mma. ".e2m1 alternate floating point type mma operation requires sm_120a and is supported on sm_120f from PTX ISA version 8.8." [https://docs.nvidia.com/cuda/parallel-thread-execution/index.html#warp-level-matrix-instructions-mma](https://docs.nvidia.com/cuda/parallel-thread-execution/index.html#warp-level-matrix-instructions-mma)

<a id="ref2"></a>\[2\] NVIDIA, *PTX ISA v9.3*, Bölüm 9.7.17.7.1 — tcgen05 Memory Alloc/Manage Instructions. Supported architectures: sm_100a, sm_101a, sm_100f, sm_110f. SM120/SM121 listede yok. [https://docs.nvidia.com/cuda/parallel-thread-execution/index.html#tcgen05-memory-alloc-manage-instructions](https://docs.nvidia.com/cuda/parallel-thread-execution/index.html#tcgen05-memory-alloc-manage-instructions)

<a id="ref3"></a>\[3\] NVIDIA, *PTX ISA v9.3*, Bölüm 9.7.17.1 — Tensor Memory. "On architecture sm_100a/sm_100f, the 5th generation TensorCore's Tensor Memory has a two-dimensional structure of 512 columns and 128 rows per CTA, each cell 32-bits." SM120/SM121 için TMEM tanımı yok. [https://docs.nvidia.com/cuda/parallel-thread-execution/index.html#tensor-memory](https://docs.nvidia.com/cuda/parallel-thread-execution/index.html#tensor-memory)

<a id="ref4"></a>\[4\] NVIDIA, *PTX ISA v9.3*, Bölüm 9.7.17.5.1 — CTA Pair. "Any 2 CTAs within the cluster whose %cluster_ctarank differs by the last bit only is said to form a CTA pair." CTA Pairs, tcgen05 instruction ailesinin parçasıdır; tcgen05 desteklenmeyen mimarilerde geçerli değildir. [https://docs.nvidia.com/cuda/parallel-thread-execution/index.html#tcgen05-cta-pair](https://docs.nvidia.com/cuda/parallel-thread-execution/index.html#tcgen05-cta-pair)

<a id="ref5"></a>\[5\] NVIDIA, *Blackwell Tuning Guide* — SMEM sınırları: CC 10.0 = 228 KB/SM, 227 KB/blok; CC 12.0/12.1 = 128 KB/SM, 99 KB/blok. Ayrıca *CUDA C++ Programming Guide* Bölüm 20.9/20.10. B200 SM ve tensör çekirdeği sayıları (148 aktif SM, 592 tensör çekirdeği; 160 fiziksel SM) TechPowerUp B200 veritabanından; DGX Spark 48 SM değeri `deviceQuery` çıktısından teyit edilmiştir. [https://docs.nvidia.com/cuda/blackwell-tuning-guide/index.html](https://docs.nvidia.com/cuda/blackwell-tuning-guide/index.html) · [https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html](https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html)

<a id="ref6"></a>\[6\] NVIDIA, *CUDA C++ Programming Guide*, Tablo 25 — Family-Specific Compatibility. "compute_120f: Compatible with Compute Capability 12.0, 12.1." [https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html#feature-availability](https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html#feature-availability)

<a id="ref7"></a>\[7\] RobTand, *vLLM PR #37725* — Preserve CUDA arch suffix (a/f) for SM12x — fixes NVFP4 NaN on desktop Blackwell. [https://github.com/vllm-project/vllm/pull/37725](https://github.com/vllm-project/vllm/pull/37725)

<a id="ref8"></a>\[8\] johnnynunez, *vLLM PR #38126* — Fix DGX Spark logic. [https://github.com/vllm-project/vllm/pull/38126](https://github.com/vllm-project/vllm/pull/38126)

<a id="ref9"></a>\[9\] blake-snc, *vLLM PR #35947* — Software E2M1 conversion for SM12x NVFP4 activation quantization. [https://github.com/vllm-project/vllm/pull/35947](https://github.com/vllm-project/vllm/pull/35947)

<a id="ref10"></a>\[10\] NVIDIA Developer Forums, *FP4 on DGX Spark — Why It Doesn't Scale Like You'd Expect*. BTankut CUTLASS tile tuning sonuçları. [https://forums.developer.nvidia.com/t/fp4-on-dgx-spark-why-it-doesnt-scale-like-youd-expect/360142](https://forums.developer.nvidia.com/t/fp4-on-dgx-spark-why-it-doesnt-scale-like-youd-expect/360142)

<a id="ref11"></a>\[11\] kahyunnam, *FlashInfer PR #2650* — Enable sm120f compilation. [https://github.com/flashinfer-ai/flashinfer/pull/2650](https://github.com/flashinfer-ai/flashinfer/pull/2650)

<a id="ref12"></a>\[12\] Avarok-Cybersecurity, *dgx-vllm GitHub*. NVFP4 DGX Spark iyileştirmeleri. [https://github.com/Avarok-Cybersecurity/dgx-vllm](https://github.com/Avarok-Cybersecurity/dgx-vllm)

---

## 7. Tail Latency ve Kararlılık

### 7.1 p90/p50 Oranları

p90/p50 oranı, gecikme dağılımının kuyruk kalınlığını gösterir. Oran 1.0'a yakınsa dağılım sıkı ve öngörülebilirdir; yüksekse bazı istekler beklenenden çok daha yavaş tamamlanmaktadır.

**ITL p90/p50 Oranları:**

| Varyant | C=1 | C=4 | C=8 | C=16 |
|---|---|---|---|---|
| FP8 | 1.00 | 1.00 | 1.01 | 1.02 |
| FP8-MTP | 1.05 | 1.06 | 1.10 | 1.08 |
| AWQ-MTP | 1.05 | 1.08 | 1.11 | 1.11 |
| NVFP4 | 1.00 | 1.00 | 1.01 | 1.02 |
| NVFP4-MTP | 1.12 | 1.08 | 1.08 | 1.12 |

**TTFT p90/p50 Oranları:**

| Varyant | C=1 | C=4 | C=8 | C=16 |
|---|---|---|---|---|
| FP8 | 1.20 | 1.28 | 1.08 | 1.19 |
| FP8-MTP | 1.02 | 1.05 | 1.08 | 1.13 |
| AWQ-MTP | 1.35 | 1.15 | 1.24 | 1.29 |
| NVFP4 | 1.13 | 1.15 | 1.29 | 1.11 |
| NVFP4-MTP | 1.02 | 1.42 | 1.15 | 1.56 |

**TPS p90/p50 Oranları:**

| Varyant | C=1 | C=4 | C=8 | C=16 |
|---|---|---|---|---|
| FP8 | 1.00 | 1.01 | 1.01 | 1.01 |
| FP8-MTP | 1.11 | 1.06 | 1.07 | 1.07 |
| AWQ-MTP | 1.07 | 1.10 | 1.08 | 1.09 |
| NVFP4 | 1.01 | 1.01 | 1.01 | 1.00 |
| NVFP4-MTP | 1.03 | 1.08 | 1.06 | 1.07 |

**Değerlendirme:**

- **ITL kararlılığı:** MTP'siz modeller (FP8, NVFP4) neredeyse mükemmel kararlılığa sahiptir (p90/p50 ≈ 1.00-1.02). MTP'li modellerde oran 1.05-1.12 arasında değişmektedir. Bu, MTP'nin token üretiminde kabul oranının dalgalanmasına yol açtığını göstermektedir.
- **TTFT kararlılığı:** En yüksek dalgalanma NVFP4-MTP'te gözlemlenmektedir (C=16'da 1.56). Bu, NVFP4+MTP konfigürasyonunun prefill aşamasında öngörülemez davranış sergilediğini göstermektedir. AWQ-MTP de yüksek dalgalanma göstermektedir (1.29-1.35).
- **TPS kararlılığı:** Tüm varyantlarda kabul edilebilir düzeydedir (1.00-1.11). TPS, ITL'nin tersi olduğu için benzer oranlar beklenir; ancak ölçüm ortalaması daha istikrarlıdır.

### 7.2 Hangi Varyant Daha Öngörülebilir?

Sıralama (en öngörülebilirden en az öngörülebilire):

1. **NVFP4** — ITL ve TPS'te mükemmel kararlılık, TTFT'te orta düzey
2. **FP8** — NVFP4'e yakın, tüm metriklerde düşük dalgalanma
3. **FP8-MTP** — ITL ve TPS'te orta düzey, TTFT'te iyi kararlılık
4. **AWQ-MTP** — ITL'de orta düzey, TTFT'te yüksek dalgalanma
5. **NVFP4-MTP** — ITL'de en yüksek dalgalanma, TTFT'te en yüksek dalgalanma

### 7.3 Yük Altında Gecikme Dalgalanması

MTP'li modellerde dalgalanmanın artmasının temel nedeni, MTP'nin çalışma mekanizmasıdır:

- Her adımda birden fazla token üretilir, ancak bunların bir kısmı reddedilir
- Reddedilme oranı (rejection rate) bağlam ve model durumuna göre değişir
- Yüksek reddolma oranına sahip adımlarda efektif TPS düşer, ITL artar
- Bu da p90/p50 oranının yükselmesine yol açar

Özellikle NVFP4-MTP'te gözlemlenen yüksek TTFT dalgalanması (p90/p50 = 1.56 @ C=16), bu konfigürasyonun kritik uygulamalar için risk oluşturabileceğini düşündürmektedir; ancak bu değer sınırlı örneklemden etkilenmiş olabilir (bkz. Bölüm 1.7 Sınırlılık) ve SLA kararı öncesi daha yüksek istek sayısıyla doğrulanmalıdır. SLA gereksinimleri olan sistemlerde (örn. "%99 istek 1 saniye içinde yanıt almalı") bu dalgalanma dikkate alınmalıdır.

---

## 8. Optimum Çalışma Noktası ve Öneriler

### 8.1 Varyant Seçim Rehberi

| Senaryo | Önerilen Varyant | Concurrency | Gerekçe |
|---|---|---|---|
| **Interaktif sohbet botu** | AWQ-MTP | 1-2 | En düşük latency (5.04s), en yüksek TPS (25.45). Kullanıcı hızlı yanıt alır. |
| **Kod asistanı (otomatik tamamlama)** | AWQ-MTP | 1-2 | Düşük TTFT (267ms) + yüksek TPS. Kod yazarken anlık öneriler kritik. |
| **API servisi (düşük yük)** | AWQ-MTP | 1-4 | C=4'te bile 23 tok/s TPS ve 5.68s latency kabul edilebilir. |
| **API servisi (yüksek yük)** | NVFP4-MTP | 8-16 | Toplam verim concurrency ile artar (C=16'da sistem geneli 231 tok/s); NVFP4-MTP yüksek yükte AWQ-MTP'ye yakın verimi daha dengeli ölçeklemeyle sunar. |
| **Toplu işleme (batch)** | NVFP4-MTP veya FP8-MTP | 8-16 | Batch işlemede önemli olan toplam token/s'tir; C=16'da MTP'li varyantlar ~221-232 tok/s ile MTP'sizlerin (~108-128) yaklaşık iki katına ulaşır (bkz. Bölüm 6.1). |
| **SLA gerektiren sistem** | FP8 veya NVFP4 | 1-4 | En düşük dalgalanma. p90/p50 ≈ 1.0. Öngörülebilir performans kritik. |
| **İlk token gecikmesi kritik** | NVFP4 | 1-2 | En düşük TTFT (228ms). Kullanıcı anında yanıt görür. |
| **Bellek kısıtlı ortam** | NVFP4-MTP | 1-4 | 4-bit sıkıştırma + MTP ile en düşük bellek ayak izi + yüksek hız. (DGX Spark'ta bellek CPU-GPU paylaşımlıdır; düşük ayak izi diğer iş yüklerine alan bırakır.) |

### 8.2 Optimum Concurrency Seviyeleri

Her varyant için, bireysel istek performansı ile toplam throughput arasındaki optimum denge noktası:

Optimum concurrency, **neyi optimize ettiğinize** bağlıdır; tek bir "doğru" değer yoktur:

| Varyant | Latency için Optimum C | Verim için Optimum C | Not |
|---|---|---|---|
| FP8 | 1-2 | 8-16 | Ölçekleme verimliliği C=16'da %83; sistem geneli RPS 0.06 → 0.85. |
| FP8-MTP | 1-2 | 8-16 | Sistem geneli RPS C=16'da 1.72 (~11x). |
| AWQ-MTP | 1-2 | 4-8 | En yüksek per-request hız; C≥8'de ölçekleme verimliliği hızla düşer (%59). |
| NVFP4 | 1-2 | 8-16 | En kararlı varyant; sistem geneli RPS C=16'da 1.00. |
| NVFP4-MTP | 1-2 | 8-16 | C=2'de TPS/latency hafifçe iyileşir (fark gürültü sınırında; bkz. Bölüm 1.7); sistem geneli RPS C=16'da 1.80. |

**Genel kural:**

- **Latency-kritik / tek kullanıcı** (sohbet botu, kod asistanı): **C=1-2.** Bireysel istek en hızlı yanıtı burada alır.
- **Verim-kritik / çok kullanıcılı servis** (API, batch): **C=8-16.** Sistem geneli kapasite (toplam RPS ve token/s) concurrency ile ~9-13x artar (bkz. Bölüm 5.5 ve 6.1); karşılığında per-request latency/TPS bir miktar düşer.

Bölüm 5.5'te açıklandığı gibi, "concurrency toplam kapasiteyi artırmaz" izlenimi ölçüm aracının per-request "Throughput (RPS)" metriğinin (`1/latency`) yanlış okunmasından kaynaklanır. Gerçekte GPU tek istekte doymaz; batching sistem verimini belirgin biçimde yükseltir. Ancak ölçekleme verimliliği yük altında düşer (C=16'da FP8 %83, AWQ-MTP %59), dolayısıyla getiri sınırsız değildir — bu nedenle verim-kritik senaryolarda dahi çok yüksek concurrency'de tail latency artışına dikkat edilmelidir.

### 8.3 Quantization Seçim Önerileri

**AWQ-MTP neden performans kazananı?**

AWQ, 4-bit ağırlık nicelerken aktivasyonları tam hassasiyette tutar. Bu, bellek bant genişliği tasarrufu ile model doğruluğunu dengeler. MTP ile birleştiğinde:
- Decode aşamasında bellek bant genişliği baskısı hafifler (daha küçük ağırlıklar)
- MTP birden fazla token üretir ve bunların çoğu kabul edilir
- Net sonuç: ITL %69 düşüş, TPS %213 artış (FP8 bazında)

Vurgulanmalıdır ki bu "kazanan" nitelemesi yalnızca hız metriklerine dayanır; doğruluk (accuracy) ölçümü bu çalışmanın kapsamı dışındadır ve üretim kararı öncesi ayrıca yapılmalıdır.

**Ancak AWQ'nun riskleri:**
- 4-bit niceleme model doğruluğunda kayıp olabilir. Bu benchmark **doğruluk (accuracy) ölçümü içermemektedir**; hem AWQ hem NVFP4 için model kalitesi ayrıca değerlendirilmelidir. (NVFP4 varyantı UltraChat üzerinde ~2M token bütçesiyle kalibre edilmiştir; bkz. Bölüm 1.3.)
- Yüksek concurrency'de performans düşüşü daha dik (%41)
- TTFT dalgalanması daha yüksek

**NVFP4-MTP ne zaman tercih edilmeli?**
- NVIDIA Blackwell GPU'larda donanım hızlandırmasından tam faydalanmak istendiğinde
- Bellek kısıtlı ortamlarda (en düşük bellek ayak izi)
- Düşük-orta yük altında (C≤4)

**Geleceğe dönük not:** Bu rapordaki AWQ-MTP üstünlüğü, yamasız stok vLLM v0.22.0'ın bir fotoğrafıdır. Bölüm 6.4.4'teki yazılım düzeltmeleri upstream'e girdikçe NVFP4-MTP'nin AWQ-MTP ile pariteye ulaşması, yüksek concurrency'de ise öne geçmesi beklenmektedir (nicel analiz için bkz. Ek A.3). DGX Spark üzerinde uzun ömürlü kurulumlar planlanıyorsa, donanım-yerel format olan NVFP4 stratejik tercih olarak değerlendirilmelidir.

---

## 9. Sonuç

### 9.1 Ana Bulguların Özeti

1. **MTP dramatik hız artışı sağlar:** FP8'de TPS %140, NVFP4'te %113 artış. Latency yarıdan fazla azalır. MTP, DGX Spark'ta performansı dönüşüm seviyesinde iyileştiren en etkili tekniktir.

2. **AWQ-MTP en hızlı varyanttır:** 25.45 tok/s (C=1), 37.57ms ITL, 5.04s latency. Bellek bant genişliği tasarrufu + MTP'nin birleşimi decode aşamasında eşsiz bir hız avantajı yaratır. (Not: bu değerlendirme yalnızca hız bazlıdır; doğruluk ölçümü yapılmamıştır.)

3. **NVFP4, FP8'den tutarlı biçimde üstündür:** MTP'siz karşılaştırmada TPS %21 daha yüksek, ITL %18 daha düşük, latency %18 daha düşük. 4-bit sıkıştırmanın bant genişliği avantajı belirgindir.

4. **Concurrency bir latency–verim takasıdır:** Concurrency yükseltmek bireysel istek performansını (latency, per-request TPS) bir miktar düşürür; ancak **sistem geneli toplam kapasiteyi belirgin biçimde artırır** (toplam token/s ve RPS FP8'de ~13x, MTP'li varyantlarda ~9-11x). Not: Ölçüm aracının "Throughput (RPS)" metriği per-request (`1/latency`) olduğundan tanımı gereği concurrency'den bağımsızdır; sistem kapasitesi `TPS × Concurrency` ile ölçülür (bkz. Bölüm 5.5, 6.1). Ölçekleme verimliliği yine de yük altında azalır (C=16'da %59-83).

5. **TTFT en duyarlı metrik:** Concurrency artışında 2-3x yükselir. Prefill aşaması hesaplama sınırlıdır ve eşzamanlı isteklerde ciddi gecikme oluşur.

6. **MTP'nin faydası yük altında azalır:** TPS hız kazancı oranı FP8'de 2.40x'ten (C=1) 2.05x'e (C=16) düşer. NVFP4'te 2.13x'ten 1.81x'e düşer.

7. **MTP'siz modeller daha kararlı:** p90/p50 oranları ITL'de ~1.00, TTFT'te ~1.15. MTP'li modellerde ITL ~1.05-1.12, TTFT ~1.02-1.56.

8. **NVFP4'ün mevcut geriliği kalıcı değildir:** Tüm ölçümler topluluk yamaları uygulanmamış stok vLLM v0.22.0 ile alınmıştır. Bölüm 6.4.4'teki yazılım düzeltmeleri uygulandığında NVFP4-MTP'nin AWQ-MTP'yi yakalaması, yüksek yük altında ise geçmesi beklenmektedir — C=16'da fark bugün bile yalnızca ~%3.5'tir (bkz. Ek A.3).

---

## Ek A: SM121 Donanım Eksikliklerinin Nicel Etkisi

Bölüm 6.4, NVFP4'ün SM121'de teorik potansiyeline neden ulaşamadığını donanım ve yazılım açısından açıklamaktadır. Ancak her bir eksikliğin performansa somut karşılığı nicel olarak verilmemiştir. Bu ek, söz konusu eksikliklerin her birinin NVFP4 performansına etkisini somutlaştırmaktadır.

### A.1 Donanım Eksikliklerinin Performansa Somut Karşılığı

**1. TMEM eksikliği → tile küçülme zorunluluğu**

SM100'de 256KB TMEM + 228KB SMEM = toplam 484KB ara veri alanı mevcuttur. SM121'de TMEM yoktur; tüm ara veriler blok başına 99KB SMEM'e sığmak zorundadır. SM100 için tasarlanan varsayılan CUTLASS FP4 tile boyutları bu 99KB bütçeyi aşar (topluluk ölçümleriyle doğrulanmıştır [[10]](#ref10)), dolayısıyla tile boyutunun küçültülmesi zorunludur:

- Daha küçük tile = daha düşük arithmetic intensity (hesaplama/bant-oranı)
- Düşük arithmetic intensity = bellek bant genişliği sınırına daha erken çarpma
- Sonuç: NVFP4'ün 4-bit sıkıştırmanın sağladığı bant genişliği tasarrufu, hesaplama birimlerinin yeterince beslenememesi nedeniyle realize edilemez

**2. tcgen05.mma eksikliği → verimli dispatch mekanizması yok**

`tcgen05.mma`, SM100'de FP4 GEMM'yi tek instruction ile doğrudan tensor core'a dispatch eden PTX instruction'dır. SM121'de yalnızca `mma.sync.aligned.m16n8k64.f32.e2m1.e2m1` kullanılabilmektedir. CUTLASS, CuTe API soyutlama katmanı üzerinden gitmek zorunda kalır:

- Daha fazla register yönetim overhead'i
- Daha fazla SMEM yönetim overhead'i
- Daha az optimal scheduling (tcgen05'in donanım düzeyinde otomatik pipeline'ı yerine yazılım düzeyinde manuel pipeline)

**3. CTA Pairs / Cooperative MMA eksikliği → SM işbirliği imkansız**

SM100'de iki SM birleşip tek bir MMA işlemi yürütebilmektedir (CTA Pair). Bu, büyük tile boyutlarında kritik bir yetenektir: bir SM'in tek başına işleyemeyeceği kadar büyük matris çarpımları iki SM'e bölüşülebilir. SM121'de her SM izole çalışmak zorundadır:

- Büyük matris çarpımları daha küçük parçalara bölünmek zorunda
- Parçalama overhead'i: her parça için ayrı SMEM yüklemesi, ayrı senkronizasyon
- SM100'de tek CTA Pair ile yapılan iş, SM121'de birden fazla bağımsız CTA ile yapılır → ek koordinasyon maliyeti

**4. Daha az SM ve 5. nesil tensor core altyapısının yokluğu → toplam FP4 hesaplama kapasitesinde ~9x fark**

| Mimari | SM Sayısı | Tensör Çekirdeği / SM | Toplam Tensör Çekirdeği | Tensor core yolu | FP4 Tepe (seyreklik ile) |
|---|---|---|---|---|---|
| SM100 (B200) | 148 (aktif) | 4 | 592 | 5. nesil `tcgen05` + TMEM | ~9 PFLOP |
| SM121 (DGX Spark) | 48 | 4 | ~192 | warp-düzeyi `mma.sync` | ~1 PFLOP |

Fark, popüler biçimde ifade edilen "SM başına 1 vs 4 tensör çekirdeği" değildir — konvansiyonel sayımla her iki mimaride de SM başına 4 tensör çekirdeği bulunur. Gerçek fark iki kaynaktan gelir: **(a)** SM sayısı (148 aktif vs 48, ~3x) ve **(b)** tensör çekirdeği **nesli/programlama modeli** — SM100 tek instruction ile dispatch eden 5. nesil `tcgen05` + TMEM altyapısına sahipken, SM121 yalnızca warp-düzeyi `mma.sync` yoluna sahiptir. Bu iki etken birleştiğinde FP4 tepe hesaplama gücü ~1 PFLOP (SM121) vs ~9 PFLOP (SM100), yani yaklaşık bir büyüklük mertebesi (≈9x) fark oluşur. Bu fark özellikle **prefill aşamasını** (hesaplama sınırlı) etkiler; NVFP4-MTP'te gözlemlenen yüksek TTFT (519ms) ile doğrudan ilişkilidir.

**5. Bellek bant genişliği → 273 GB/s vs ~8 TB/s**

| Mimari | Bellek Tipi | Bant Genişliği |
|---|---|---|
| SM100 (B200) | HBM3e | ~8 TB/s |
| SM121 (DGX Spark) | LPDDR5x | 273 GB/s |

Bant genişliği farkı ~29x'dir. NVFP4'ün 4-bit sıkıştırması her iki platformda da bant genişliği tasarrufu sağlar; ancak DGX Spark'ın düşük bant genişliği, hesaplama hızlanmasının bant genişliği sınırına çarpmasına neden olur. Başka bir deyişle: NVFP4, FP8'e göre daha az veri taşır (4-bit vs 8-bit), ancak 273 GB/s'lik bant zaten o kadar düşüktür ki, NVFP4'ün hesaplama avantajı bant sınırı altında kaybolur.

**6. E2M1 activation quantization overhead**

NVFP4, W4A4 (ağırlıklar ve aktivasyonlar 4-bit) çalışma modunda, aktivasyonların çalışma zamanında BF16'dan E2M1'e dönüştürülmesini gerektirir. SM121'de `cvt.rn.satfinite.e2m1x2.f32` PTX instruction'ı, doğru derleme bayraklarıyla (`sm_121a`) kullanılabilmektedir; ancak vLLM v0.22.0'ın CMake süreci bu bayrakları doğru iletememektedir (Bölüm 6.4.4). Donanım instruction'ı devre dışı kaldığında yazılım dönüşümü gerekir; bu ek hesaplama yükü hem prefill hem decode aşamasını yavaşlatır.

### A.2 Teorik vs Realize Edilen Hızlanma Analizi

NVFP4, ağırlıkları 4-bit'e sıkıştırarak bellek bant genişliği gereksinimini FP8'e göre yarıya indirir. Decode aşaması bellek bant genişliği sınırlı (memory-bound) olduğu için bu, teorik olarak ~2x hızlanma vaat eder. Ancak gerçek performans:

| Platform | NVFP4 / FP8 TPS Oranı | Beklenen | Realize Edilen | Kayıp |
|---|---|---|---|---|
| SM121 (DGX Spark) [bu rapor] | ~1.21x | ~2.0x | ~1.21x | ~%40 |

SM121'de NVFP4, teorik ~2x hızlanmanın yalnızca ~%60'ını realize edebilmektedir (ölçülen ~1.21x; kayıp ~%40). Bu çalışmada veri merkezi Blackwell (SM100) üzerinde karşılaştırmalı ölçüm yapılmamıştır; ancak Bölüm 6.4'te belgelenen SM121'e özgü donanım eksiklikleri (TMEM, tcgen05, CTA Pairs yokluğu ve SMEM kısıtı) kaybın önemli bir bölümünün platforma özgü olduğuna işaret etmektedir. Kaybın bileşenlere ayrılması aşağıdaki tabloda tahminî olarak verilmiştir.

**Kaybın bileşenlere ayrılması:**

| Kaynak | Tahmini Katkı | Açıklama |
|---|---|---|
| Düşük bant genişliği (273 GB/s) | ~%15 | NVFP4'ün hesaplama hızlanması bant sınırına çarpar |
| SMEM kısıtı + tile küçülme | ~%8 | Düşük arithmetic intensity, bant genişliği avantajını azaltır |
| Daha az SM sayısı (48 vs 148) | ~%5 | Toplam FP4 kapasitesini sınırlar; prefill'i doğrudan, decode'u dolaylı etkiler |
| tcgen05 + TMEM + CTA Pairs eksikliği | ~%5 | Dispatch verimsizliği + SM izolasyonu (warp-düzeyi `mma.sync` yoluna düşme) |
| E2M1 yazılım dönüşümü | ~%3-5 | Doğru derlenmediğinde ek hesaplama yükü |
| **Toplam** | **~%36-38** | **≈%40 kayıp ile tutarlı** |

> **Not:** Yukarıdaki yüzdeler tahmini olup, izolasyonu zor olan birbirine bağlı etkileşimleri temsil etmektedir. Toplam, bireysel katkıların basit toplamı değil, birleşik etkilerini yansıtmaktadır.

### A.3 Yazılım İyileştirmelerle Ulaşılabilir Üst Sınır

Bölüm 6.4.4'te listelenen yazılım düzeltmeleri (CMake suffix hatası, capability gate hatası, E2M1 yazılım dönüşümü, CUTLASS tile tuning, Marlin W4A16 backend) uygulanırsa:

| Senaryo | NVFP4 / FP8 TPS Oranı | İyileşme |
|---|---|---|
| Mevcut (vLLM v0.22.0, düzeltmesiz) | ~1.21x | — |
| Yazılım düzeltmeleri uygulandıktan sonra (tahmini) | ~1.30-1.40x | ~+%8-19 |
| Teorik üst sınır (donanım limiti) | ~1.30-1.40x | — |

Yazılım iyileştirmeleri, NVFP4'ün FP8'e hızlanma oranını ~1.21x'ten ~1.30-1.40x'e çıkarabilir. Ancak **tcgen05, TMEM ve CTA Pairs eksikliği donanım tabanlı bir üst sınır oluşturmakta olup, yazılım iyileştirmeleri bu sınırı aşamaz.** SM121'de NVFP4'ün FP8'e ~1.4x ötesinde hızlanma, bu donanım eksiklikleri nedeniyle mümkün değildir.

**AWQ-MTP ile karşılaştırma — yazılım düzeltmeleri sonrası beklenti:**

Bu rapordaki hız kazananı AWQ-MTP'nin FP8-MTP'ye oranı ~1.31x'tir (25.45 / 19.50 tok/s). Yazılım düzeltmeleri sonrası NVFP4 için öngörülen ~1.30-1.40x bandı bu değeri kapsadığından ve üzerine uzandığından, **düzeltmelerin tamamı uygulandığında NVFP4-MTP'nin AWQ-MTP'yi yakalaması ve muhtemelen bir miktar geçmesi beklenir** (tahminî: 19.50 × 1.30-1.40 ≈ 25.4-27.3 tok/s vs AWQ-MTP 25.45 tok/s).

Bu beklentiyi destekleyen üç etken:

1. **Yüksek concurrency'de fark zaten kapanmış durumdadır:** C=16'da toplam kapasite NVFP4-MTP 231.5 vs AWQ-MTP 239.8 tok/s — yamasız haliyle bile fark yalnızca ~%3.5'tir (Bölüm 6.1). AWQ-MTP'nin doygunluk endeksi daha dik düştüğünden (C=16'da %59 vs NVFP4-MTP %69, Bölüm 6.2), yük altında öne geçmesi en olası aday NVFP4-MTP'dir.
2. **NVFP4+MTP yolundaki bilinen hatalar doğrudan yazılım kaynaklıdır:** TTFT 519ms sorunu ve MTP head yükleme kısıtı (Bölüm 6.4.3-6.4.4) düzeltildiğinde, NVFP4-MTP'ye AWQ tarafında karşılığı olmayan bir iyileşme alanı açılır.
3. **Donanım-yerel yol avantajı:** AWQ (W4A16), hesaplama öncesi ağırlıkları Marlin kernel ile BF16'ya açar; NVFP4 ise Blackwell'in yerel FP4 tensor core instruction'ını (`mma.sync` e2m1) kullanır. Kernel yazılımı olgunlaştıkça fark, donanım-yerel format lehine açılma eğilimindedir.

Bununla birlikte A.2'deki donanım tavanı burada da geçerlidir: SM121'de bu geçiş büyük bir sıçrama değil, **parite veya tek haneli yüzde avantajı** düzeyinde beklenmelidir. Ayrıca bu karşılaştırma yalnızca hız bazlıdır; iki formatın doğruluk (accuracy) davranışı ayrıca değerlendirilmelidir (Bölüm 8.3).

> **Companion paper:** Sonradan yayımlanan [Qwen3.6-27B DGX Spark Cluster Scaling]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/' | relative_url }}) raporu, bu çalışmayı daha yeni bir nightly vLLM image ile multi-node konfigürasyonlarına (TP1/TP2/TP4) genişletir. Aynı NVFP4 modelinin TP1 (tek node) sonuçları burada ölçülen NVFP4 baseline'ından farklıdır; iki runtime'ın yan yana karşılaştırması için ilgili raporun §1.5'ine bakınız.

---

## Ek B: Varyant Bazlı Grafikler

Tüm grafikler ilgili varyant dizinlerinde mevcuttur:

| Varyant | Dizin |
|---|---|
| FP8 | `Qwen3.6-27B-FP8/` |
| FP8-MTP | `Qwen3.6-27B-FP8-MTP/` |
| AWQ-MTP | `Qwen3.6-27B-AWQ-MTP/` |
| NVFP4 | `Qwen3.6-27B-NVFP4/` |
| NVFP4-MTP | `Qwen3.6-27B-NVFP4-MTP/` |

Her dizinde 5 PNG grafiği (TTFT, ITL, TPS, Latency, Throughput), 5 HTML interaktif grafik ve 1 CSV veri dosyası bulunmaktadır.

---

## Hakkımızda — Openzeka

**Openzeka Teknoloji A.Ş.**, 2016 yılında Ankara Bilkent Cyberpark'ta kurulan; NVIDIA'nın **Türkiye ve MEA bölgesindeki resmî Embedded Compute distribütörü** ve **NVIDIA Elite Partner**'ıdır. Şirket; NVIDIA **DGX/HGX** sunucuları, veri merkezi ve profesyonel GPU'lar, **Jetson** gömülü sistemler ve iş istasyonları başta olmak üzere yapay zeka ve yüksek başarımlı hesaplama donanımlarının dağıtımını yaparken; kendi geliştirdiği **Cordatus AI** platformu ile uç (edge) ve bulut ortamlarında gerçek zamanlı görüntü analitiği ve yapay zeka çıkarım (inference) çözümleri sunmaktadır. Derin öğrenme tabanlı yapay zeka, dijital ikiz ve dijital dönüşüm alanlarındaki uzmanlığıyla bölgesinin öncü embedded yapay zeka sağlayıcılarından biridir.

Bu raporun tüm ölçümleri, Openzeka'nın açık kaynaklı **[CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark)** aracıyla, bir **NVIDIA DGX Spark (GB10)** sistemi üzerinde gerçekleştirilmiştir.

| | |
|---|---|
| **Web** | [openzeka.com](https://openzeka.com) |
| **İletişim** | [openzeka.com/iletisim](https://openzeka.com/iletisim) |
| **Telefon** | +90 312 266 2055 |
| **Adres** | Üniversiteler Mah. 1606. Cad. No:11, Cyberpark H Blok, 06800 Bilkent / Ankara, Türkiye |

---

*Rapor tarihi: Temmuz 2026*

*Test platformu: NVIDIA DGX Spark (GB10) · Model: Qwen3.6-27B*

*Hazırlayan: Openzeka Teknoloji A.Ş.*
