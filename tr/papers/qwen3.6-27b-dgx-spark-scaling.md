---
title: Qwen3.6-27B DGX Spark Cluster Scaling
parent: White Papers
nav_order: 3
lang: tr
page_id: qwen3.6-27b-dgx-spark-scaling
description: >-
  Qwen3.6-27B-NVFP4 modelinin 1x, 2x ve 4x NVIDIA DGX Spark (GB10) üzerinde
  multi-node ölçekleme çalışması: 200GbE üzerinden tensor parallelism, SLO
  temelli kapasite planlama ve TP-vs-replikasyon deployment rehberi.
permalink: /papers/qwen3.6-27b-dgx-spark-scaling/
last_modified_date: 2026-07-06
toc: true
---

*Hazırlayan: **Openzeka Teknoloji A.Ş.** — NVIDIA Türkiye & MEA Resmî Embedded Compute Distribütörü ve NVIDIA Elite Partner*
*Test platformu: 1x / 2x / 4x NVIDIA DGX Spark (GB10) · Model: Qwen3.6-27B-NVFP4 · Rapor tarihi: Temmuz 2026*

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## 1. Giriş ve Test Metodolojisi

### 1.1 Motivasyon

Önceki çalışmamız [Qwen3.6-27B DGX Spark Benchmark]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/' | relative_url }}), aynı modelin quantization formatlarını (FP8, AWQ, NVFP4) ve MTP konfigürasyonlarını **tek** DGX Spark üzerinde karşılaştırmıştı. Bu rapor, onun doğal devamı olan soruyu yanıtlıyor:

> **Daha fazla DGX Spark eklenince ne olur?** 27B'lik bir model 2 veya 4 makineye bölündüğünde (shard) gerçekten hızlanır mı — ne kadar? Ve tensor parallelism ile ölçeklenmek yerine bağımsız replikalar çalıştırmak ne zaman daha doğru tercihtir?

**Aynı modeli, aynı workload'u ve aynı benchmark aracını** üç cluster konfigürasyonunda çalıştırdık — tek DGX Spark (TP=1), iki DGX Spark (TP=2) ve dört DGX Spark (TP=4) — ve sonuçları iki mercekten değerlendirdik: ham performans ölçeklemesi ve **SLO temelli kapasite planlama** (her konfigürasyonun gerçekte kaç kullanıcıya hizmet verebildiği).

Bu düzeneği alışılmadık ve belgelemeye değer kılan iki özellik var:

- **Interconnect NVLink değil, Ethernet.** DGX Spark'lar birbirine **ConnectX-7 (200 Gb/s RDMA)** ile bağlanır. Ethernet üzerinden tensor parallelism normalde pratik dışı kabul edilir — bu çalışma ne zaman ve neden işe yaradığını sayılarla ortaya koyuyor.
- **Donanım mütevazı ve gerçekçi.** NVIDIA'nın model kartı bu modeli GB300 sınıfı veri merkezi donanımında test ediyor. DGX Spark (GB10) yelpazenin diğer ucunda: kompakt, ofis dostu bir makine. Buradaki sonuçlar, on-premises bir deployment ekibinin gerçekte göreceği tabloya çok daha yakın.

### 1.2 Test Ortamı

**Donanım — NVIDIA DGX Spark (GB10 Grace Blackwell Superchip):**

| Bileşen | Özellik |
|---|---|
| GPU | Blackwell mimarisi (GB10), ~1 PFLOP'a kadar FP4 |
| Bellek | 128 GB unified LPDDR5X |
| Bellek bant genişliği | ~273 GB/s (unified, CPU+GPU) |
| Node interconnect | NVIDIA ConnectX-7, 200 Gb/s RDMA (QSFP) |
| CPU | 20 çekirdekli Arm (10x Cortex-X925 + 10x Cortex-A725) |

> **Kritik mimari gerçek:** DGX Spark'lar arasında **NVLink yoktur**. Bu çalışmadaki TP=2 ve TP=4, **multi-node tensor parallelism**'dir — her all-reduce işlemi ConnectX-7 ağını geçer. Aşağıda gözlemlenen ölçekleme davranışının büyük kısmını bu tek gerçek açıklar.

**Model:** [`nvidia/Qwen3.6-27B-NVFP4`](https://huggingface.co/nvidia/Qwen3.6-27B-NVFP4) — Qwen3.6-27B'nin NVIDIA TensorRT Model Optimizer ile üretilmiş NVFP4 (4-bit) quantization sürümü. Model **dense** bir hybrid-attention mimarisidir (Gated DeltaNet + Gated Attention, dense FFN — mixture-of-experts yok), 262K context. Mimari detaylar [önceki raporun]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/' | relative_url }}) 1.1 bölümünde ele alınmıştır. Yalnızca metin giriş/çıkışı kullanıldı; görsel encoder aktif değildi.

**Runtime:** Multi-node orkestrasyon için Ray ile vLLM (`ghcr.io/spark-arena/dgx-vllm-eugr-nightly:latest`). Tüm konfigürasyonlarda serve bayrakları birebir aynı, yalnızca `-tp` değişiyor:

```
vllm serve nvidia/Qwen3.6-27B-NVFP4 \
    --gpu-memory-utilization 0.8 \
    --enable-prefix-caching \
    --enable-chunked-prefill \
    --quantization modelopt \
    --reasoning-parser qwen3 \
    --enable-auto-tool-choice \
    --tool-call-parser qwen3_coder \
    -tp {1|2|4}
```

### 1.3 Benchmark Aracı ve Workload

Ölçümler [CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark) ile alındı. Araç, OpenAI uyumlu `/v1/chat/completions` endpoint'ini streaming ve `include_usage` ile sürerek token sayımını tam yapar, `reasoning_content` destekler ve ölçüm öncesi warm-up uygular.

| Parametre | Değer |
|---|---|
| Prompt havuzu | 100 prompt, her run'da karıştırılır |
| Girdi uzunluğu | ~128 token |
| Maksimum çıktı token'ı | 128 |
| Concurrency başına round | 10 (→ 10 × concurrency istek) |
| Concurrency seviyeleri | 1, 2, 4, 8, 16, 32, 64 |
| İstek timeout'u | 50 s |

**Workload karakteri:** kısa girdi, kısa çıktı — interaktif chat turlarına özgü dengeli prefill/decode profili. Uzun context davranışı kapsam dışıdır (bkz. Bölüm 8).

### 1.4 SLO Çerçevesi

Ham token/saniye sayıları, deployment ekibinin asıl sorusunu yanıtlamaz: *bu konfigürasyon kaç kullanıcıya iyi hizmet verebilir?* Bu nedenle her konfigürasyonu, aynı anda uygulanan iki service level objective'e göre değerlendiriyoruz:

| SLO | Eşik | Gerekçe |
|---|---|---|
| **TTFT** (ilk token süresi) | ≤ 1000 ms | Nielsen/NNGroup: ~1 s içindeki yanıt, kullanıcının düşünce akışını bozmaz |
| **TPS** (istek başına decode hızı) | ≥ 15 token/s | Görsel okuma hızı üst sınırının (~700 wpm; Rayner vd., 2016) üzerinde |

Her iki SLO'yu birden sağlayan en büyük concurrency seviyesi, konfigürasyonun **C_max** değeridir. Eşzamanlı istekler daha sonra Little's Law ile desteklenen kullanıcı sayısına çevrilir; think time, kullanıcının yanıtı aldıktan sonra bir sonraki isteği gönderene kadar geçen süredir:

```
N_kullanıcı = C_max × (1 + T_think / L_ort)
```

Burada `L_ort`, C_max'taki ortalama uçtan uca istek gecikmesidir. Birincil varsayım olarak **T_think = 45 s** kullanıyoruz (standart interaktif chat kapasite planlaması); 15/30/60 s duyarlılık analizi Bölüm 5.3'tedir.

### 1.5 Çapraz Referans: Companion Benchmark ve Runtime Farkları

Bu rapor, **tek** DGX Spark üzerinde FP8, AWQ ve NVFP4 quantization varyantlarıyla aynı `nvidia/Qwen3.6-27B-NVFP4` modelini değerlendiren [Qwen3.6-27B DGX Spark Benchmark]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/' | relative_url }}) raporunun devamıdır. Bu rapordaki TP1 (tek node) ölçümleri ile companion paper'daki NVFP4 baseline aynı donanımı, aynı workload profilini (~128 token giriş, 128 token çıkış) ve aynı benchmark aracını hedefler — ancak **farklı vLLM runtime'larında ve farklı serve bayraklarında** alınmıştır. Farklar şeffaflık için burada belgelenmiştir; iki paper tamamlayıcı soruları yanıtlar (benchmark paper: *hangi quantization formatı*; bu rapor: *kaç node*).

**Runtime ve serve-bayrağı farkları:**

| Parametre | Companion Benchmark (NVFP4 varyantı) | Bu Rapor (TP1) |
|---|---|---|
| vLLM image | `vllm/vllm-openai:v0.22.0-ubuntu2404` (stock upstream) | `ghcr.io/spark-arena/dgx-vllm-eugr-nightly:latest` (nightly) |
| `--quantization` | belirtilmemiş (default NVFP4 yolu) | `modelopt` |
| `--enable-auto-tool-choice` | kapalı | açık |
| `--tool-call-parser` | `qwen3_coder` | `qwen3_coder` |
| `--reasoning-parser` | `qwen3` | `qwen3` |
| `--max-num-batched-tokens` | 8192 | belirtilmemiş (vLLM default) |
| `--gpu-memory-utilization` | 0.8 | 0.8 |
| `--enable-prefix-caching` / `--enable-chunked-prefill` | açık | açık |
| Multi-node orkestrasyon | yok (tek node) | Ray (`-tp {1\|2\|4}`) |

> Companion benchmark paperı (Bölüm 6.4.4 ve Ek A.3), stock vLLM v0.22.0'daki bir dizi SM121'e özgü yazılım eksikliğini belgeler — CMake `sm_121a` sonek silme hatası, eksik E2M1 yazılım dönüşüm fallback'i ve optimize edilmemiş CUTLASS tile boyutları dahil — ve bu düzeltmeler uygulanınca elde edilecek hızlanmayı öngörür. Bu raporda kullanılan nightly image bu düzeltmelerin herhangi bir alt kümesini içeriyor olabilir veya içermeyebilir; içeriği hakkında hiçbir iddiada bulunulmaz.

**Tek kullanıcılı (C=1) sonuç karşılaştırması:**

| Metrik | Companion Benchmark — NVFP4 | Bu Rapor — TP1 | Δ |
|---|---|---|---|
| TPS (tok/s) | 9.86 | 12.63 | +%28.1 |
| ITL (ms) | 100.40 | 77.97 | −%22.4 |
| TTFT (ms) | 228.42 | 233.30 | +%2.1 |
| Gecikme (s) | 12.98 | 10.14 | −%21.9 |

Decode tarafındaki metrikler (TPS, ITL, uçtan uca gecikme) önemli ölçüde farklılık gösteriyor; prefill tarafındaki metrik (TTFT) ~5 ms içinde uyumlu. Bu farklar şeffaflık için belirtilmiştir; **bu rapordaki TP1, benchmark paper'ın NVFP4 varyantının aynı yazılım altında yeniden ölçümü değildir** ve Bölüm 5'teki SLO/kapasite sonuçları bu raporun TP1 sütunundan türetilmiştir, companion paper'ın NVFP4 baseline'ından değil.

---

## 2. Sonuçlar

### 2.1 Tek Kullanıcı Performansı (Concurrency = 1)

| Metrik | TP1 | TP2 | TP4 | TP1→TP4 |
|---|---|---|---|---|
| TPS (token/s) | 12.63 | 22.57 | **33.11** | **2.62x** |
| ITL (ms) | 77.97 | 43.48 | **29.14** | 2.67x düşüş |
| TTFT (ms) | 233.30 | **148.87** | 163.59 | TP2 en iyi |
| Gecikme (s) | 10.14 | 5.67 | **3.87** | 2.62x düşüş |

İki ana gözlem:

- **Ölçeklenmek işe yarıyor.** Tek kullanıcı bir Spark'ta 12.6 tok/s, dört Spark'ta 33.1 tok/s görüyor — parallelism Ethernet üzerinden yürümesine rağmen model gerçekten 2.6x hızlanıyor.
- **TTFT aynı yönde gitmiyor.** Düşük yükte TP4'ün ilk token süresi TP2'den *kötü* (164 ms vs 149 ms). Prefill compute-bound'dur ve batch 1'de ek all-reduce adımlarının maliyeti, paralel hesaplamanın kazandırdığından fazladır. Bölüm 4.4 bunu analiz ediyor.

### 2.2 Tam Concurrency Taraması

Konfigürasyon başına ortalama değerler (p50 her noktada ortalamayı yakından izliyor; p50/p90 dahil konfigürasyon grafiklerinin tamamı Ek A'dadır).

**TP1 — tek DGX Spark:**

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Gecikme (s) |
|---|---|---|---|---|
| 1 | 233.30 | 77.97 | 12.63 | 10.14 |
| 2 | 304.00 | 81.22 | 12.05 | 10.62 |
| 4 | 357.46 | 83.97 | 11.61 | 11.02 |
| 8 | 562.38 | 88.92 | 10.80 | 11.86 |
| 16 | 1143.17 | 102.03 | 9.08 | 14.10 |
| 32 | 2198.77 | 127.52 | 6.96 | 18.40 |
| 64 | 3535.15 | 186.40 | 4.70 | 27.22 |

**TP2 — 2x DGX Spark:**

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Gecikme (s) |
|---|---|---|---|---|
| 1 | 148.87 | 43.48 | 22.57 | 5.67 |
| 2 | 252.45 | 46.05 | 20.98 | 6.10 |
| 4 | 320.11 | 48.14 | 19.89 | 6.44 |
| 8 | 457.03 | 53.48 | 17.65 | 7.25 |
| 16 | 741.35 | 61.52 | 14.96 | 8.56 |
| 32 | 1196.59 | 81.72 | 11.05 | 11.59 |
| 64 | 2137.37 | 131.97 | 6.77 | 18.92 |

**TP4 — 4x DGX Spark:**

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Gecikme (s) |
|---|---|---|---|---|
| 1 | 163.59 | 29.14 | 33.11 | 3.87 |
| 2 | 267.42 | 31.57 | 29.93 | 4.28 |
| 4 | 373.16 | 33.69 | 27.51 | 4.65 |
| 8 | 446.41 | 36.83 | 24.98 | 5.13 |
| 16 | 804.86 | 46.09 | 19.21 | 6.66 |
| 32 | 1005.44 | 60.99 | 14.61 | 8.77 |
| 64 | 1551.45 | 114.76 | 7.93 | 16.14 |

### 2.3 Karşılaştırma Grafikleri

![TP1/TP2/TP4 için concurrency'ye göre kullanıcı başına TPS]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/comparison-charts/tps-vs-concurrency.png' | relative_url }})
<sub><i>Şekil 1: İstek başına decode hızı. Kesikli çizgi 15 tok/s okuma hızı SLO'su — TP1 hiç geçemiyor, TP2 C=8'e, TP4 C=16'ya kadar tutuyor (TP2'nin C=16 değeri 14.96 ile eşiğin kıl payı altında; bkz. Bölüm 5.4).</i></sub>

![TP1/TP2/TP4 için concurrency'ye göre TTFT]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/comparison-charts/ttft-vs-concurrency.png' | relative_url }})
<sub><i>Şekil 2: İlk token süresi. TP1 C=16'da (1143 ms) zaten 1000 ms SLO'sunu aşıyor; TP2 ve TP4 C=32'de aşıyor (sırasıyla 1196 ms ve 1005 ms). Hiçbir tek instance C=64 yükünü interaktif olarak taşıyamaz — replikasyon gerekir.</i></sub>

![TP1/TP2/TP4 için concurrency'ye göre toplam throughput]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/comparison-charts/aggregate-throughput-vs-concurrency.png' | relative_url }})
<sub><i>Şekil 3: Toplam sistem throughput'u (istek başına TPS × concurrency). Kullanıcı başına hız yükle düşerken toplam token üretimi artıyor — aynı cluster C=1'de 33 tok/s'lik bir asistan, C=64'te ~508 tok/s'lik bir token fabrikası.</i></sub>

---

## 3. Ölçekleme Verimliliği Analizi

### 3.1 Azalan Getiriler

İdeal lineer duruma karşı TPS ölçekleme çarpanları:

| Adım | C=1 ölçülen | C=1 verim | C=64 ölçülen | C=64 verim |
|---|---|---|---|---|
| TP1 → TP2 | 1.79x | %89 | 1.44x | %72 |
| TP2 → TP4 | 1.47x | %73 | 1.17x | %59 |
| **TP1 → TP4 (toplam)** | **2.62x** | **%66** | **1.69x** | **%42** |

Verim **iki bağımsız eksende** bozuluyor:

1. **Daha fazla node → daha fazla iletişim.** Her transformer layer'ı, katılan tüm node'lar arasında bir all-reduce gerektirir. 2'den 4 node'a çıkmak, bu işlemlerin hem veri hacmini hem senkronizasyon maliyetini artırır.
2. **Daha fazla yük → doyan ağ.** Yüksek concurrency'de ConnectX-7 ağı büyük batch'lerin all-reduce trafiğini taşır; her adımın iletişim payı büyür — C=64 veriminin (%42) C=1 veriminden (%66) belirgin kötü olmasının sebebi budur.

**Pratik çıkarım:** bu topolojide TP=4, kullanışlı sınıra yakındır. TP2→TP4 marjinal kazancı yük altında 1.17x'e düşmüşken, varsayımsal bir TP=8 muhtemelen kayda değer bir şey kazandırmaz — dördün ötesindeki Spark'ları replikaya ayırmak daha doğrudur (Bölüm 6).

### 3.2 Kayıp Nereye Gidiyor

Lineerden sapma neredeyse tamamen **network all-reduce**'tan kaynaklanır. NVLink bağlantılı bir sistemde bu işlem onlarca mikrosaniye sürer; 200GbE RDMA üzerinde bir mertebe daha pahalıdır ve üretilen her token için, her layer'da bir kez ödenir. Buna rağmen hesabın bu donanımda neden ölçeklenme lehine çıktığını Bölüm 4 açıklıyor.

---

## 4. Teknik Derinlemesine: Ethernet Üzerinden Tensor Parallelism GB10'da Neden Çalışıyor

### 4.1 Decode, Memory-Bandwidth-Bound

Qwen3.6-27B **dense** bir modeldir: her token üretimi, **tüm** model ağırlıklarının bellekten okunmasını gerektirir. GB10'da bu bellek ~273 GB/s'lik unified LPDDR5X'tir — veri merkezi GPU'larının HBM bant genişliğinin kabaca 1/30'u. Her decode adımında baskın maliyet aritmetik değil, ağırlık okuma süresidir.

Tensor parallelism, ağırlık matrislerini node'lara böler. TP=4 ile:

```
Spark0: W₀·x →  │
Spark1: W₁·x →  ├─ all-reduce (ConnectX-7) ─→ sonraki token
Spark2: W₂·x →  │
Spark3: W₃·x →  │
```

- Her node matris çarpımının **1/4'ünü** yapar
- Her node yalnızca **ağırlıkların 1/4'ünü kendi LPDDR5X'inden okur** ← asıl kazanım
- Layer başına bir all-reduce, 200GbE ağ üzerinden ← maliyet

ITL (token'lar arası gecikme) sayıları bu dengeyi gösteriyor:

| Config | ITL (ms) | TP1'e göre hızlanma | İdeal |
|---|---|---|---|
| TP1 | 77.97 | 1.00x | 1.0x |
| TP2 | 43.48 | 1.79x | 2.0x |
| TP4 | 29.14 | 2.67x | 4.0x |

İdealden sapma, layer başına ödenen network all-reduce'tur; geri kalan her şey ölçekleniyor.

### 4.2 TPS, ITL'in Aynadaki Yansıması

Sağlama — decode hızı, token'lar arası gecikmenin tersidir:

| Config | 1000 / ITL | Ölçülen TPS |
|---|---|---|
| TP1 | 12.8 | 12.63 ✓ |
| TP2 | 23.0 | 22.57 ✓ |
| TP4 | 34.3 | 33.11 ✓ |

Bağımsız bir throughput mekanizması yok: **TPS kazancının tamamı ITL düşüşüdür**, yani bant genişliği havuzlama etkisidir.

### 4.3 Bu Neden Burada Çalışıyor da Veri Merkezi GPU'larında Çalışmıyor

"Ethernet üzerinden asla TP koşma" kuralı HBM dünyasından gelir ve aritmetiği açıktır: TP'nin faydası tasarruf edilen ağırlık okuma süresiyle orantılıdır, maliyeti ise network all-reduce'tur. SM100 sınıfı bir veri merkezi GPU'sunda (B200/GB200, ~8 TB/s HBM3e — GB10 bant genişliğinin yaklaşık 30 katı) ağırlık okuma ~30x daha hızlıdır; 27B'lik bir model için all-reduce, kazandırdığından pahalıya gelir — modeli tek GPU'da çalıştırırsınız. (Eski nesil H100'de ~3.35 TB/s ile oran ~12x'dir; eşitsizlik yine de bozulmaz.)

GB10'da ise ağırlık okuma terimi devasadır (düşük bant genişliği), all-reduce terimi makuldür (200 Gb/s RDMA, kısa dizilerde küçük aktivasyonlar). Eşitsizlik tersine döner. **Ethernet tensor parallelism DGX Spark'ta tam da bellek bant genişliği darboğaz olduğu için kârlıdır** — platformun zayıflığı, ölçeklenmeyi etkili kılan şeydir.

Bu modelin iki ek özelliği de yardımcı olur:

- **Dense olması.** Her forward pass her ağırlığa dokunur; her node her token'da tam yük alır. MoE bir modelde, expert'lerine yönlendirme olmayan node'lar boşta kalır ve TP verimi düşerdi.
- **NVFP4'ün trafik/hesap oranını yarılaması.** 4-bit ağırlıklar her node'un token başına daha az byte okuması demektir; hesap fazı, (sabit boyutlu) aktivasyon alışverişine göre kısa kalır.

### 4.4 Prefill İstisnası

Prefill (prompt işleme) bandwidth-bound değil, **compute-bound**'dur — 128 girdi token'ının tamamı paralel işlenir ve aritmetik baskındır. TP hesaba da yardım eder ama çok daha az; batch 1'de all-reduce ek maliyeti paralelleşme kazancını aşar: TP4'ün C=1 TTFT'si (164 ms) TP2'den (149 ms) kötüdür. TP4 ancak ağır yük altında, prefill batch'leri büyüdüğünde öne geçer (C=64: 1551 ms vs 2137 ms). Workload'unuz TTFT-kritik ve hafif yüklüyse, daha fazla TP otomatik olarak daha iyi değildir.

---

## 5. SLO Temelli Kapasite Planlama

### 5.1 C_max: SLO'ya Uyan En Yüksek Concurrency

Her iki SLO'yu (TTFT ≤ 1000 ms **ve** TPS ≥ 15 tok/s) Bölüm 2.2'deki tablolara uygularsak:

| Config | C_max | Bağlayıcı kısıt | C_max'ta gecikme |
|---|---|---|---|
| TP1 | **0** | C=1'de bile TPS = 12.63 < 15 | — |
| TP2 | **8** | C=8 her iki SLO'yu da geçer (TPS 17.65, TTFT 457 ms); C=16 TPS'yi geçemez (14.96 < 15) | 7.25 s |
| TP4 | **16** | C=16 her ikisini de geçer (TPS 19.21, TTFT 805 ms); C=32 ikisini de geçemez (TTFT 1005 ms, TPS 14.61) | 6.66 s |

> **Kritik bulgu:** bu SLO çerçevesinde **tek DGX Spark bu modeli production'da hiç servis edemez** — decode hızı tek kullanıcıda bile okuma hızının altındadır. Production için asgari birim iki Spark'tır.

### 5.2 Desteklenen Kullanıcı (Little's Law, T_think = 45 s)

| Config | C_max | N_kullanıcı |
|---|---|---|
| TP1 | 0 | **0** |
| TP2 | 8 | **~58** |
| TP4 | 16 | **~124** |

TP4, TP2'nin **2.14x** kullanıcısını destekliyor — TP2 üzerindeki ham TPS ölçeklemesinden (1.47x) belirgin şekilde iyi, çünkü iki etki birleşiyor: C_max ikiye katlanıyor *ve* C_max'taki gecikme daha düşük, yani her slot daha hızlı boşalıyor. Ayrıca SLO merceğinde makine başına verim *korunuyor*: TP2 makine başına ~29, TP4 ~31 kullanıcıya hizmet ediyor — ham throughput tablosunun aksine, makine eklemek cihaz başına değeri sulandırmıyor.

### 5.3 Duyarlılık: Think Time

Think time kullanım senaryosuna bağlıdır; 45 s düşünerek yazılan chat'e uyar. N_kullanıcı'yı yeniden hesaplarsak:

| Senaryo | T_think | TP2 | TP4 |
|---|---|---|---|
| Agentic / hızlı ardışık | 15 s | ~25 | ~52 |
| Aktif chat | 30 s | ~41 | ~88 |
| Düşünerek chat (birincil) | 45 s | ~58 | ~124 |
| Okuma ağırlıklı / seyrek | 60 s | ~74 | ~160 |

TP4/TP2 oranı her satırda ~2.1x kalıyor — think time varsayımı mutlak kapasiteyi kaydırıyor, karşılaştırmayı değil.

### 5.4 Duyarlılık: SLO Eşikleri — Bıçak Sırtı Bir Sonuç

Ölçülen noktalardan ikisi SLO eşiklerinin neredeyse tam üstünde ve kapasite sonuçları bunlara duyarlı:

- **TP2, C=16'da TPS = 14.96 veriyor — 15 tok/s eşiğinin %0.3 altında.** SLO 14.9 tok/s olsaydı TP2'nin C_max'ı 16'ya, kapasitesi **~100 kullanıcıya** sıçrardı — donanımın yarısıyla TP4'ün 124'üne yaklaşırdı.
- **TP4, C=32'de iki eşiği de kıl payı kaçırıyor** (TTFT 1005 ms, TPS 14.61). Hafif gevşetilmiş bir SLO (1100 ms / 14.5 tok/s), TP4'ün C_max'ını 32'ye, kapasitesini **~197 kullanıcıya** ikiye katlardı.
- **Daha sıkı bir TTFT SLO'su (≤ 500 ms; örn. RAG veya agent pipeline'ları)** TP4'ü C_max = 8'de sınırlar (C=16'da TTFT 805 ms) → ~78 kullanıcı; TP2'ye üstünlüğü 1.35x'e iner.
- **Gevşetilmiş bir TPS SLO'su (≥ 10 tok/s; gündelik kullanım)** TP1'i nihayet oyuna sokar: C_max = 8, tek Spark'ta **~38 kullanıcı**.

> **Öneri:** SLO eşiklerini sabit değil, birinci sınıf deployment parametresi olarak ele alın. Bu donanımda kapasite cevabı, makul eşik aralığı içinde ~2x değişebiliyor — cluster boyutlandırmadan önce C_max'ı *kendi* SLO'nuza göre doğrulayın.

---

## 6. Deployment Topolojileri: Tensor Parallelism vs Replikasyon

Dört DGX Spark'a sahip olmak TP=4 koşmak anlamına gelmez. Aynı filo üç topolojiyi destekler ve verimiz üçünü de yanıtlıyor (2x TP2 ve 4x TP1 rakamları tek-instance ölçümlerinin çarpımıyla türetilmiştir; önde bir load balancer varsayılır):

| Topoloji | SLO kullanıcısı (45 s think) | Toplam maks. throughput | Yüksek erişilebilirlik |
|---|---|---|---|
| 4x TP1 (replika) | **0** | **~1203 tok/s** | en iyi |
| 2x TP2 (replika çifti) | ~116 | ~867 tok/s | bir çift ayakta kalır |
| 1x TP4 | **~124** | ~508 tok/s | yok — tek arıza noktası |

Örüntü basit bir karar kuralına genelleniyor:

> **Gecikme ve SLO uyumu → tensor parallelism. Ham throughput → replika.**

TP, bellek bant genişliğini havuzlayarak *her isteği* hızlandırır; replikasyon hiçbir isteği hızlandırmadan *slot* sayısını çoğaltır. TPS SLO'su istek başına bir hız tabanı olduğundan, bir konfigürasyonu eşiğin üzerine yalnızca TP taşıyabilir — kaç tane olursa olsun TP1 replikası bunu asla yapamaz. Tersine, istek başına SLO'su olmayan offline işlerde (batch özetleme, sentetik veri üretimi, evaluation koşuları) replikalar aynı dört makineden TP4'ün 2.4 katı toplam token üretir.

**Öneri matrisi:**

| Deployment hedefi | Konfigürasyon |
|---|---|
| Geliştirme, prototipleme, tek yoğun kullanıcı | 1x DGX Spark (TP1) |
| İnteraktif servis, küçük ekip (~50 kullanıcı) | 2x DGX Spark, TP2 |
| İnteraktif servis, ~100+ kullanıcı, HA şart | 4x DGX Spark, **2x TP2** + load balancer |
| İnteraktif servis, filo başına maksimum kapasite, HA riski kabul | 4x DGX Spark, **1x TP4** |
| Offline / batch token üretimi | N x TP1 replika |

2x TP2 (~116 kullanıcı) ile 1x TP4'ün (~124 kullanıcı) ne kadar yakın olduğuna dikkat edin: TP4'ün ~%7'lik kapasite primi, karşılığında tek arıza noktası getirir; 2x TP2 ise bir node çifti düştüğünde (yarı kapasiteyle) hizmet vermeye devam eder — ve Bölüm 5.4'teki gevşetilmiş SLO senaryosunda açık farkla kazanır. Çoğu production deployment için **2x TP2 daha sağlam tercihtir**; TP4, tek kiracılı maksimum kapasite veya maksimum tek kullanıcı hızı (33 tok/s) içindir.

---

## 7. Doğruluk: NVFP4 vs FP8

Ölçekleme sonuçları ancak 4-bit model servis etmeye değerse anlamlıdır. NVIDIA'nın [model kartı](https://huggingface.co/nvidia/Qwen3.6-27B-NVFP4), metin ve multimodal benchmark'larda FP8 ile NVFP4 arasında neredeyse eşitlik raporluyor:

| Benchmark | FP8 | NVFP4 | Δ |
|---|---|---|---|
| MMLU Pro | 86.1 | 86.3 | +0.2 |
| GPQA Diamond | 86.0 | 85.5 | −0.5 |
| HLE | 21.7 | 21.8 | +0.1 |
| τ²-Bench Telecom | 95.2 | 95.4 | +0.2 |
| MMMU Pro | 74.6 | 74.3 | −0.3 |
| SciCode | 44.8 | 44.5 | −0.3 |
| AIME 2025 | 93.1 | 92.7 | −0.4 |
| AA-LCR | 68.8 | 68.3 | −0.5 |
| IFBench | 65.1 | 65.5 | +0.4 |

16-bit'e göre ~4x bellek tasarrufuna karşılık doğruluk maliyeti her benchmark'ta 1 puanın altında — ve Bölüm 4.3'te görüldüğü gibi, küçük ağırlıklar bu platformda multi-node TP'nin verimli olmasının bizzat parçası. NVFP4'ün GB10 üzerindeki donanım seviyesi analizi (SM121 kısıtları dahil) için [önceki rapora]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/' | relative_url }}) bakınız.

---

## 8. Sınırlar ve Gelecek Çalışmalar

- **Tek workload şekli.** Tüm sonuçlar ~128 token girdi ve 128 token çıktı içindir. Uzun context workload'ları (262K pencere üzerinde RAG) işi compute-bound prefill'e kaydırır — TP kazancının en zayıf olduğu yer; TTFT ağırlıklı, uzun prompt'lu trafikte TP4 avantajı muhtemelen daralır. Uzun çıktılı (reasoning) workload'lar ise dengeyi diğer yöne kaydırır. İkisi de ayrı taramayı hak ediyor.
- **Türetilmiş replika rakamları.** Bölüm 6'daki 2x TP2 ve 4x TP1 topoloji rakamları tek-instance ölçümlerinden hesaplanmıştır; ölçülmüş load-balanced bir deployment, kuyruk ve yönlendirme etkileri ekleyecektir.
- **Yalnızca metin.** Modelin görüntü/video yeteneği kullanılmadı.
- **Donanıma özgülük.** Bu sonuçlar GB10 sınıfını (düşük bant genişlikli unified bellek + 200GbE ağ) karakterize eder. HBM/NVLink sistemlerine aktarılamaz — orada Bölüm 4.3'ün aritmetiği tersine döner; dolayısıyla NVIDIA'nın GB300 model kartı rakamları da DGX Spark davranışını öngörmez.
- **Gelecek çalışmalar:** bu ağ üzerinde TP'ye alternatif olarak pipeline parallelism (daha az sayıda, daha büyük transfer), ölçülmüş replika deployment'ları, uzun context taramaları ve MTP × TP etkileşimi.

---

## 9. Sonuç

1. **Tek DGX Spark Qwen3.6-27B'yi çalıştırır — ama sunucu olarak değil, iş istasyonu olarak.** 12.6 tok/s bir geliştirici için yeterli, bir kullanıcı kitlesi için interaktif SLO'nun altındadır. Production için asgari birim iki Spark'tır.
2. **200GbE üzerinden tensor parallelism bu platformda gerçekten çalışıyor** — dört node'da 2.62x tek kullanıcı hızlanması — çünkü GB10'un düşük bellek bant genişliği, modelin dense mimarisi ve NVFP4'ün küçük ağırlıkları, hesap-iletişim dengesini birlikte TP lehine çeviriyor. Bu sonuç HBM sınıfı donanıma genellenemez.
3. **Bu ağda pratik ölçekleme sınırı TP=4'tür.** Marjinal verim yük altında 1.17x'e düşüyor; beşinci Spark'ı replikaya harcayın.
4. **SLO'lar altında TP4 ~124, TP2 ~58, TP1 sıfır kullanıcıya hizmet ediyor** (45 s think time) — ve makine başına kapasite ~30 kullanıcı/makine seviyesinde sabit kalıyor; ölçeklenmek donanımı israf etmiyor.
5. **Aynı dört Spark üç farklı üründür:** ~124 kullanıcılı interaktif servis (TP4), ~116 kullanıcılı HA servis (2x TP2) veya ~1200 tok/s'lik batch motoru (4x TP1). Topolojiyi hedefe göre seçin — istek başına hız için TP, toplam throughput için replika — ve SLO eşiklerini ayarlanabilir girdi olarak ele alın; çünkü kapasite cevabı, makul aralık içinde ~2x oynuyor.

---

## Ek A: Konfigürasyon Bazlı Grafikler

### A.1 TP1 — Tek DGX Spark

![TP1 TTFT]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP1/Qwen3.6-27B-NVFP4-TTFT.png' | relative_url }})
![TP1 ITL]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP1/Qwen3.6-27B-NVFP4-ITL.png' | relative_url }})
![TP1 TPS]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP1/Qwen3.6-27B-NVFP4-TPS.png' | relative_url }})
![TP1 Latency]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP1/Qwen3.6-27B-NVFP4-Latency.png' | relative_url }})
![TP1 Throughput]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP1/Qwen3.6-27B-NVFP4-Throughput.png' | relative_url }})

### A.2 TP2 — 2x DGX Spark

![TP2 TTFT]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP2/Qwen3.6-27B-NVFP4-TTFT.png' | relative_url }})
![TP2 ITL]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP2/Qwen3.6-27B-NVFP4-ITL.png' | relative_url }})
![TP2 TPS]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP2/Qwen3.6-27B-NVFP4-TPS.png' | relative_url }})
![TP2 Latency]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP2/Qwen3.6-27B-NVFP4-Latency.png' | relative_url }})
![TP2 Throughput]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP2/Qwen3.6-27B-NVFP4-Throughput.png' | relative_url }})

### A.3 TP4 — 4x DGX Spark

![TP4 TTFT]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP4/Qwen3.6-27B-NVFP4-TTFT.png' | relative_url }})
![TP4 ITL]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP4/Qwen3.6-27B-NVFP4-ITL.png' | relative_url }})
![TP4 TPS]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP4/Qwen3.6-27B-NVFP4-TPS.png' | relative_url }})
![TP4 Latency]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP4/Qwen3.6-27B-NVFP4-Latency.png' | relative_url }})
![TP4 Throughput]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/TP4/Qwen3.6-27B-NVFP4-Throughput.png' | relative_url }})

---

*Openzeka Teknoloji A.Ş. — [openzeka.com](https://www.openzeka.com) · Tel: +90 312 266 2055*
*Üniversiteler Mah. Şehit Mustafa Tayyarcan Cad. Tepe Binası No:5 İç Kapı No:315, 06800 Çankaya/Ankara*
