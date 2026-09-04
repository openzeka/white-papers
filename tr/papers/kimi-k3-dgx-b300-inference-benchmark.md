---
title: Kimi K3 DGX-B300 Inference Benchmark
parent: White Papers
nav_order: 6
lang: tr
page_id: kimi-k3-dgx-b300-inference-benchmark
card_order: 8
card_tag: "LLM Benchmark"
card_date: "Temmuz 2026"
description: >-
  Moonshot AI Kimi K3 (2.8T MoE, MXFP4) modelinin NVIDIA DGX-B300 (8x Blackwell
  Ultra, TP=8) üzerinde performans değerlendirmesi: vLLM vs SGLang, direct vs
  DSpark speculative decoding, SLO temelli kapasite planlama.
permalink: /papers/kimi-k3-dgx-b300-inference-benchmark/
last_modified_date: 2026-07-30
toc: true
---

*Hazırlayan: **Openzeka Teknoloji A.Ş.** — NVIDIA Türkiye & MEA Resmî Gömülü Hesaplama Distribütörü ve NVIDIA Elite Partner*

*Test platformu: NVIDIA DGX-B300 (8× Blackwell Ultra, TP=8) · Model: Moonshot AI Kimi K3 · Rapor tarihi: Temmuz 2026*

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## 1. Yönetici Özeti

Bu rapor, Kimi K3 modelinin **4 farklı dağıtım konfigürasyonu**nu aynı donanımda (DGX-B300, TP8)
karşılaştırır: vLLM (direct), vLLM + DSpark speculative, SGLang (direct) ve SGLang + DSpark speculative.

### Ana Bulgular

1. **Düşük yükte (c=1) speculative decoding belirgin kazançlı:**
   vLLM + Spec, vLLM direct'e göre **1.86x daha hızlı** (188 vs 101 tok/s).
   SGLang + Spec ise 1.56x daha hızlı (130 vs 83 tok/s).

2. **Yüksek yükte speculative decoding darboğaza giriyor:**
   vLLM + Spec @c=64: per-user TPS **11 tok/s'a düşüyor** (vLLM direct 27 tok/s).
   Break-even noktası: vLLM için ~c16, SGLang için ~c4.

3. **SGLang direct'in düşük TTFT sorununa rağmen**
   yüksek yükte (c=64) **benzer aggregate output** üretiyor (1863 vs 1759 tok/s).

4. **vLLM direct en güvenilir genel-amaçlı seçim:**
   Düşük yükte hızlı (66ms TTFT), yüksek yükte lineer skalalanır,
   P90 SLO'yu c=32'ye kadar tam karşılıyor (c=64'te sadece TTFT'i az geçiyor: 1107ms).

5. **SGLang + Spec ağır anomali:** c=64'te TTFT **4752ms**'e şıçıyor
   (c=32'de 777ms idi) — sistem aşırı yük altında scheduler çökmesi.

### Senaryo Bazlı Tavsiye

| Senaryo | Önerilen Config | Gerekçe |
|---|---|---|
| Düşük-yük interaktif chat (c<=8) | **vLLM + Spec** | 1.4-1.9x daha hızlı per-user TPS |
| Üretim / yüksek-yük serving (c>16) | **vLLM (direct)** | Skalabilir, SLO'yu karşılıyor, kararlı |
| Maksimum toplam throughput | **vLLM (direct) veya SGLang (direct)** | c=64: ~1759 / 1863 tok/s aggregate |
| Minimum ITL (gerçek zamanlı) | **vLLM + Spec (sadece c<=4)** | ITL 4.8ms (direct 9.5ms) |
| Uzun-bağlam ağır iş yükü | (bu raporun dışında) | 128/128 token testi sınırlı |

---

## 2. Test Düzeneği & Metodoloji

### 2.1 Model Hakkında

**Kimi K3**, Moonshot AI tarafından geliştirilen açık-ağırlıklı (open-weight), native multimodal
ve agentic modeldir. 2.8T parametreli bu model, **Kimi Delta Attention (KDA)** ve **Attention
Residuals (AttnRes)** mimarileri üzerine kurulmuştur ve 1M token context penceresine sahiptir.
Dünyanın ilk açık 3T-sınıf modeli olarak uzun-horizon kodlama, bilgi çalışması ve muhakeme
için tasarlanmıştır.

- **Model sayfası:** [huggingface.co/moonshotai/Kimi-K3](https://huggingface.co/moonshotai/Kimi-K3)

#### Temel Özellikler

- **Yeni Mimari:** KDA + AttnRes üzerine kurulu, Stable LatentMoE framework ile 896 expert'ten
  16'sını aktive eder — Kimi K2'ye göre ~2.5x scaling verimliliği.
- **Long-Horizon Kodlama:** Minimal insan gözetimiyle uzun mühendislik oturumları sürdürür;
  GPU kernel optimizasyonu, derleyici geliştirme, CAD ve çip tasarımı.
- **Agentic Bilgi Çalışması:** Derin araştırma, interaktif görselleştirmeler, widget'lar,
  dashboard'lar ve motion design üretir.
- **Native Multimodalite & Uzun Bağlam:** Aynı model içinde text, image ve video anlar;
  1M token context penceresi destekler.
- **Açık Frontier Ağırlıklar:** Tam model ağırlıkları Kimi K3 Lisansı altında yayımlanmıştır.

#### Model Özeti

| Özellik | Değer |
|---|---|
| **Mimari** | Mixture-of-Experts (MoE) |
| **Toplam Parametre** | 2.8T |
| **Aktif Parametre** | 104B |
| **Katman Sayısı** | 93 |
| **Dense Katman Sayısı** | 1 |
| **Attention Katman Bileşimi** | 69 KDA + 24 Gated MLA |
| **Attention Hidden Dimension** | 7168 |
| **Attention Head Sayısı** | 96 |
| **Latent MoE Dimension** | 3584 |
| **MoE Hidden Dimension** (per expert) | 3072 |
| **Expert Sayısı** | 896 |
| **Token Başına Seçilen Expert** | 16 |
| **Shared Expert Sayısı** | 2 |
| **Vocabulary Size** | 160K |
| **Context Length** | 1,048,576 (1M token) |
| **Attention Mekanizması** | KDA & Gated MLA |
| **Activation Function** | SiTU-GLU |
| **Vision Encoder** | MoonViT-V2 |
| **Vision Encoder Parametreleri** | 401M |
| **Quantization** | MXFP4 ağırlık / MXFP8 aktivasyon (quantization-aware training) |
| **Modality** | Text, Image |

Model `--max-model-len 1048576` ile **tam 1M context** kapasitesi aktif olarak dağıtıldı.

### 2.2 Quantization & Lisans

**Native MXFP4 Quantization:** Kimi K3, SFT aşamasından itibaren quantization-aware
training uygulanmıştır. MXFP4 ağırlıkları ile MXFP8 aktivasyonları kullanır — bu, geniş
donanım uyumluluğu sağlar ve ağırlık boyutunu küçültürken accuracy kaybını minimize eder.

**Lisans:** Kod deposu ve model ağırlıkları [Kimi K3 License](https://huggingface.co/moonshotai/Kimi-K3/blob/main/LICENSE)
altında yayımlanmıştır.

### 2.3 Donanım & Dağıtım

- **GPU:** NVIDIA DGX-B300 (Blackwell Ultra, 8x GPU)
- **Parallelism:** Tensor Parallel = 8 (TP8)
- **KV Cache:** FP8 (`--kv-cache-dtype fp8`)
- **Memory Utilization:** 0.95
- **Prefix Caching:** Aktif (`--enable-prefix-caching`)

### 2.4 Benchmark Aracı

[CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark) — Streamlit tabanlı, OpenAI-uyumlu API'leri test eden etkileşimli araç.

### 2.5 Test Parametreleri

| Parametre | Değer | Açıklama |
|---|---|---|
| Input token | ~128 | prompt başına |
| Output token | 128 | `max_tokens=128` |
| Concurrency | 1, 2, 4, 8, 16, 32, 64 | aynı anda giden istek |
| Min round / concurrency | 10 | her seviyede min tekrar |
| Toplam istek / seviye | 10 x c | c=64 -> 640 istek |
| Warm-up | 1 istek | ölçüm öncesi sabitleme |

> **Önemli:** Input ve output sabit 128 tokendir. Bu, **göreli karşılaştırma** için tasarlanmıştır;
> gerçek üretim iş yükünü (değişken uzunluk, multi-turn, uzun bağlam) temsil etmez.
> Ayrıntı için Bölüm 6.

### 2.6 Metrikler

| Metrik | Birim | Tanımı |
|---|---|---|
| **TTFT** | ms | Time To First Token — ilk token üretilene kadar geçen süre |
| **ITL** | ms | Inter-Token Latency — ardışık tokenler arası ortalama süre |
| **TPS** | tok/s | Per-user Tokens Per Second — tek istek çıkış hızı |
| **Latency** | s | Toplam istek süresi (baştan sona) |
| **Throughput** | RPS | Sistem başına saniyedeki tamamlanan istek |

Her metrik **Mean, P50 (median), P90** olarak raporlanır.

### 2.7 SLO Eşikleri (varsayılan)

| SLO | Eşik | Dayanak |
|---|---|---|
| TTFT | <= 1000 ms | Nielsen "flow of thought" sınırı (1s) |
| TPS | >= 15 tok/s | İnsan görsel okuma hızı sınırı (~700 wpm) |

### 2.8 Kapasite Planlaması (Little's Law)

SLO'yu geçen maksimum concurrency (C_max) bulunur, sonra toplam kullanıcı sayısı:

```
N = C_max x (1 + T_think / L_mean)
```

- `T_think = 45s` (varsayılan: okuma + prompt yazma)
- `L_mean` = C_max seviyesindeki ortalama latency

> **Önemli:** Bu sayılar **göreli karşılaştırma** içindir, mutlak üretim tahmini değil.
> 128/128 token iş yükü ve 45s think time varsayımına dayanır.

---

## 3. Dağıtım Konfigürasyonları

### 3.1 Özet

Bu raporda 4 farklı dağıtım konfigürasyonu karşılaştırılmıştır:

| Config | Engine | Speculative | Draft Model | Draft Model Kaynağı |
|---|---|---|---|---|
| **vLLM (direct)** | vLLM (kimi-k3 docker) | Hayır | - | - |
| **vLLM + Spec** | vLLM (kimi-k3 docker) | DSpark | `Inferact/Kimi-K3-DSpark` | [vLLM recipes](https://recipes.vllm.ai/moonshotai/Kimi-K3) |
| **SGLang (direct)** | SGLang (kimi-k3 docker) | Hayır | - | - |
| **SGLang + Spec** | SGLang (kimi-k3 docker) | DSpark | `RadixArk/Kimi-K3-DSpark` | [SGLang cookbook](https://docs.sglang.io/cookbook/autoregressive/Moonshotai/Kimi-K3) |

> **Önemli Not:** vLLM ve SGLang, kendi resmi reçetelerinde (recipes/cookbook) **iki farklı
> draft model** önermektedir. Bu benchmark'ta her iki engine için **kendi reçetesindeki draft
> model** aynen kullanılmıştır — yani vLLM+Spec `Inferact/Kimi-K3-DSpark` ile, SGLang+Spec ise
> `RadixArk/Kimi-K3-DSpark` ile çalıştırılmıştır. Bu, her iki engine'in de üretici tarafından
> önerilen optimal konfigürasyonunu yansıtır.

### 3.2 Speculative Decoding (DSpark) Hakkında

DSpark, Kimi K3 için özelleştirilmiş **draft model** tabanlı speculative decoding yöntemidir:

- Her stepte ~7 token önerisi üretilir (`num_speculative_tokens=7`)
- Rejection sampling (block method) ile doğrulanır
- **Düşük yükte:** decode hızı 2x'e kadar artar (kv cache transferinden kazançlı)
- **Yüksek yükte:** draft modeli + verification overhead'i scheduler baskısı oluşturur

Her iki engine de DSpark yöntemini kullanır, ancak farklı draft model ağırlıkları ile.
Bu draft modeller, Kimi K3'e özel olarak eğitilmiş küçük modellerdir ve her engine'in
kendi optimizasyon pipeline'ına uyarlanmıştır.

### 3.3 Docker Komutları (Tam)

Aşağıdaki komutlar, vLLM ve SGLang'in resmi Kimi K3 reçetelerinden alınmıştır:
- vLLM: [recipes.vllm.ai/moonshotai/Kimi-K3](https://recipes.vllm.ai/moonshotai/Kimi-K3)
- SGLang: [docs.sglang.io/cookbook/autoregressive/Moonshotai/Kimi-K3](https://docs.sglang.io/cookbook/autoregressive/Moonshotai/Kimi-K3)

#### 3.3.1 vLLM (Direct — Speculative Yok)

```bash
docker run --gpus all \
  --privileged --ipc=host -p 8000:8000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e VLLM_ENABLE_K3_LATENT_MOE_TAIL_FUSION=1 \
  -e VLLM_ALLREDUCE_USE_FLASHINFER=1 \
  -e VLLM_ENGINE_READY_TIMEOUT_S=3600 \
  -e VLLM_USE_V2_MODEL_RUNNER=1 \
  -e VLLM_USE_RUST_FRONTEND=1 \
  vllm/vllm-openai:kimi-k3 moonshotai/Kimi-K3 \
  --trust-remote-code \
  --load-format fastsafetensors \
  --moe-backend auto \
  --gpu-memory-utilization 0.95 \
  --tensor-parallel-size 8 \
  --max-model-len 1048576 \
  --kv-cache-dtype fp8 \
  --attention-config '{"mla_prefill_backend":"TRTLLM_RAGGED","use_prefill_query_quantization":true}' \
  --enable-prefix-caching \
  --enable-auto-tool-choice \
  --tool-call-parser kimi_k3 \
  --reasoning-parser kimi_k3
```

#### 3.3.2 vLLM + Speculative (DSpark)

```bash
docker run --gpus all \
  --privileged --ipc=host -p 8000:8000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e VLLM_ENABLE_K3_LATENT_MOE_TAIL_FUSION=1 \
  -e VLLM_ALLREDUCE_USE_FLASHINFER=1 \
  -e VLLM_ENGINE_READY_TIMEOUT_S=3600 \
  -e VLLM_USE_V2_MODEL_RUNNER=1 \
  -e VLLM_USE_RUST_FRONTEND=1 \
  vllm/vllm-openai:kimi-k3 moonshotai/Kimi-K3 \
  --trust-remote-code \
  --load-format fastsafetensors \
  --moe-backend auto \
  --gpu-memory-utilization 0.95 \
  --tensor-parallel-size 8 \
  --max-model-len 1048576 \
  --kv-cache-dtype fp8 \
  --attention-config '{"mla_prefill_backend":"TRTLLM_RAGGED","use_prefill_query_quantization":true}' \
  --enable-prefix-caching \
  --enable-auto-tool-choice \
  --tool-call-parser kimi_k3 \
  --reasoning-parser kimi_k3 \
  --max-num-seqs 32 \
  --speculative-config '{"model":"Inferact/Kimi-K3-DSpark", "num_speculative_tokens":7, "method": "dspark", "attention_backend": "FLASHINFER_MLA", "draft_sample_method": "probabilistic", "rejection_sample_method": "block"}'
```

#### 3.3.3 SGLang (Direct — Speculative Yok)

```bash
docker run --gpus all \
  --shm-size 32g \
  -p 30000:30000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  --env "HF_TOKEN=<your-hf-token>" \
  --ipc=host \
  lmsysorg/sglang:kimi-k3 \
  sglang serve \
    --trust-remote-code \
    --model-path moonshotai/Kimi-K3 \
    --tp-size 8 \
    --mem-fraction-static 0.85 \
    --reasoning-parser kimi_k3 \
    --tool-call-parser kimi_k3 \
    --mamba-full-memory-ratio 0.9 \
    --host 0.0.0.0 \
    --port 30000
```

#### 3.3.4 SGLang + Speculative (DSpark)

```bash
docker run --gpus all \
  --shm-size 32g \
  -p 30000:30000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  --env "HF_TOKEN=<your-hf-token>" \
  --ipc=host \
  lmsysorg/sglang:kimi-k3 \
  sglang serve \
    --trust-remote-code \
    --model-path moonshotai/Kimi-K3 \
    --tp-size 8 \
    --mem-fraction-static 0.85 \
    --reasoning-parser kimi_k3 \
    --tool-call-parser kimi_k3 \
    --mamba-full-memory-ratio 0.86 \
    --host 0.0.0.0 \
    --port 30000 \
    --speculative-algorithm DSPARK \
    --speculative-draft-model-path RadixArk/Kimi-K3-DSpark \
    --speculative-dspark-block-size 7 \
    --enable-linear-replayssm-spec
```

### 3.4 Konfigürasyon Farklılıkları

İki engine arasındaki önemli konfigürasyon farklılıkları:

| Özellik | vLLM | SGLang |
|---|---|---|
| Port | 8000 | 30000 |
| Memory utilization | 0.95 (`--gpu-memory-utilization`) | 0.85 (`--mem-fraction-static`) |
| KV cache | FP8 (`--kv-cache-dtype fp8`) | (default) |
| Prefill backend | `TRTLLM_RAGGED` + query quantization | FlashInfer MLA (default) |
| Rust frontend | Aktif (`VLLM_USE_RUST_FRONTEND=1`) | - |
| Spec block size | (config içinde) | `--speculative-dspark-block-size 7` |
| Mamba full memory ratio | - | 0.9 (direct), 0.86 (spec) |

> **Önemli:** vLLM `TRTLLM_RAGGED` + `use_prefill_query_quantization` optimizasyonu,
> bu benchmark'ta vLLM'in düşük TTFT'inde önemli rol oynar (Bölüm 3.4'e bakınız).

---

## 4. Sonuçlar

### 4.1 Genel Karşılaştırma (c=1 ve c=64)

#### Düşük Yük (c=1) — tek kullanıcı

| Metrik | vLLM dir | vLLM spec | sglang dir | sglang spec |
|---|---|---|---|---|
| TTFT Mean (ms) | 66.5 | 71.0 | 399.5 | 450.6 |
| ITL Mean (ms) | 9.46 | 4.84 | 8.94 | 4.26 |
| TPS Mean (tok/s) | 100.8 | **187.7** | 83.4 | 129.9 |
| Latency Mean (s) | 1.27 | **0.69** | 1.54 | 0.99 |
| Spec/Direct | 1.0x | **1.86x** | 1.0x | 1.56x |

#### Yüksek Yük (c=64) — 64 eşzamanlı kullanıcı

| Metrik | vLLM dir | vLLM spec | sglang dir | sglang spec |
|---|---|---|---|---|
| TTFT Mean (ms) | 731.7 | 1030.9 | 948.4 | **4752.6** |
| ITL Mean (ms) | 30.8 | 95.4 | 27.1 | 34.4 |
| TPS Mean (tok/s) | **27.5** | 11.2 | 29.1 | 14.5 |
| Latency Mean (s) | 4.66 | 13.15 | 4.41 | 9.13 |
| Aggregate (tok/s) | 1759 | 717 | **1863** | 931 |

> Not: sglang-spec @c=64 verisinde TTFT (4752ms) ile Latency (9.13s) arasında ölçülen bir
> tutarsızlık var (TTFT > Latency/2 olmalı); bu ham verideki bir ölçüm anomalisidir.

---

### 4.2 TTFT (Time To First Token)

![TTFT]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/karsilastirma/01-TTFT.png' | relative_url }})

**Bulgular:**
- **vLLM direct en hızlı TTFT** tüm yük seviyelerinde (c=1: 66ms, c=64: 732ms).
- **SGLang direct yüksek TTFT** (~400ms c=1'de) — vLLM'in 6x'i. Bunun nedeni
  SGLang'in prefill kernel yapılandırması; vLLM `TRTLLM_RAGGED` + query quantization kullanırken
  SGLang default FlashInfer MLA kullanıyor.
- **Speculative decoding TTFT'i kötüleştiriyor** (draft model init maliyeti):
  - vLLM: c=1'de 66 -> 71ms (+%8)
  - SGLang: c=1'de 400 -> 451ms (+%13)
- **SGLang + Spec @c=64'te anomali:** 4752ms — c=32'den 6.1x kötü.
  Sistem aşırı yük altında scheduler darboğazı.
- SLO eşiği (1000ms) P90 için: vLLM direct c=64'te 1107ms ile **SLO'yu az geçiyor**;
  diğer configler c=32'yi geçemez.

---

### 4.3 ITL (Inter-Token Latency)

![ITL]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/karsilastirma/02-ITL.png' | relative_url }})

**Bulgular:**
- **Speculative decoding düşük yükte ITL'i yarıya indiriyor:**
  - vLLM: 9.46ms -> 4.84ms (%49 azalış)
  - SGLang: 8.94ms -> 4.26ms (%52 azalış)
- **Yüksek yükte speculative ITL patlaması:**
  - vLLM + Spec @c=64: **95.4ms** (direct 30.8ms — 3.1x kötü)
  - vLLM + Spec @c=32: 43.9ms (direct 23.6ms — 1.9x kötü)
- vLLM direct ve SGLang direct ITL artışı lineer-ve-yakın: c=64'te ~27-31ms.
- **En düşük ITL (gerçek-zamanlı uygulama için):**
  vLLM + Spec @c=1: 4.84ms — ama yüksek yükte kullanılamaz.

---

### 4.4 TPS (Per-User Tokens Per Second)

![TPS]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/karsilastirma/03-TPS.png' | relative_url }})

**Bulgular:**
- **Düşük yük (c<=4):** Spec, direct'ten belirgin hızlı
  - vLLM c=1: 101 -> 188 tok/s (1.86x)
  - vLLM c=4: 73 -> 99 tok/s (1.36x)
  - SGLang c=1: 83 -> 130 tok/s (1.56x)
- **Break-even noktaları:**
  - vLLM: **c~16** (43.95 vs 43.60 tok/s) — eşit
  - SGLang: **c~4** (59.3 vs 56.9 tok/s) — spec biraz kötü
- **Yüksek yük (c=64):** Spec zarar veriyor
  - vLLM: 27.5 -> 11.2 tok/s (0.41x — **2.4x yavaş**)
  - SGLang: 29.1 -> 14.5 tok/s (0.50x)
- **SLO (15 tok/s) P90 için (TPS eşiği):**
  - vLLM direct: tüm seviyeler geçer (c=64'te P90 TPS 28.6)
  - vLLM spec: tüm seviyeler geçer (c=64'te P90 TPS 16.5 — ama çok düşük)
  - SGLang direct: tüm seviyeler geçer (c=64'te P90 TPS 30.2)
  - SGLang spec: c=32'ye kadar geçer (P90 TPS 20.3), c=64'te 16.8 (zar zor geçer)
- **SLO (1000ms) P90 için (TTFT eşiği):**
  - vLLM direct: c=32'ye kadar geçer (P90 887ms), c=64'te 1107ms ile **az geçiliyor**
  - vLLM spec: c=32'ye kadar geçer (P90 802ms), c=64'te 1466ms ile geçiliyor
  - SGLang direct: c=16'ya kadar geçer (P90 949ms), c=32'de 1205ms ile geçiliyor
  - SGLang spec: c=2'ye kadar geçer (P90 496ms), c=4'te 1111ms ile geçiliyor

---

### 4.5 Latency (Toplam İstek Süresi)

![Latency]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/karsilastirma/04-Latency.png' | relative_url }})

**Bulgular:**
- **Düşük yükte Spec, latency'i dramatik düşürüyor:**
  - vLLM c=1: 1.27s -> 0.69s (%46 azalış)
  - SGLang c=1: 1.54s -> 0.99s (%36 azalış)
- **Yüksek yükte Spec, latency'yi patlatıyor:**
  - vLLM + Spec @c=64: **13.15s** (direct 4.66s — 2.8x kötü)
  - SGLang + Spec @c=32: 9.28s (direct 3.92s — 2.4x kötü)
- **vLLM direct vs SGLang direct** yüksek yükte benzer (c=64: 4.66 vs 4.41s).
- vLLM direct lineer skalalanma gösteriyor (c=1: 1.27s, c=64: 4.66s — 3.7x artış 64x yük için).

---

### 4.6 Throughput (RPS)

![Throughput]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/karsilastirma/05-Throughput.png' | relative_url }})

**Bulgular:**
- **Düşük yükte Spec daha fazla RPS** (hızlı tamamlandığı için):
  - c=1: vLLM spec 1.46 RPS vs vLLM direct 0.79 RPS (1.85x)
- **Yüksek yükte direct daha iyi RPS** (daha az overhead):
  - c=64: vLLM direct 0.21 RPS vs vLLM spec 0.08 RPS (0.38x)
- Tüm configler concurrency arttıkça RPS düşüyor — bu beklenen;
  her istek daha uzun sürüyor ama aynı anda daha çok istek var.
- **SGLang + Spec @c=64'te RPS c=32 ile aynı (0.11)** — darboğaz işareti.

---

### 4.7 Toplam Üretilen Token / Saniye (Aggregate Output)

![Aggregate Output]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/karsilastirma/07-Aggregate-Output.png' | relative_url }})

Bu metrik **sistemin toplam üretim kapasitesini** gösterir: `TPS x Concurrency`.

| c | vLLM dir | vLLM spec | sglang dir | sglang spec |
|---|---|---|---|---|
| 1 | 101 | 188 | 83 | 130 |
| 4 | 293 | 398 | 237 | 228 |
| 16 | 703 | 698 | 697 | 355 |
| 32 | 1126 | 740 | 1074 | 493 |
| 64 | **1759** | 717 | **1863** | 931 |

**Bulgular:**
- **vLLM direct lineer skalalama:** c=1 (101) -> c=64 (1759) — 17.4x artış 64x yük için (sub-linear ama güçlü).
- **SGLang direct c=64'te en yüksek:** 1863 tok/s — vLLM'den %6 daha iyi.
- **vLLM + Spec darboğazı:** c=32'den 740 -> c=64'te 717 — **düşüyor!**
  Yani yükü 2'ye katladığında toplam üretim azalıyor — klasik darboğaz.
- **SGLang + Spec c=16'dan itibaren kötü:** c=16'da 355 (direct 697) — direct'in yarısı.
- **En verimli nokta (peak aggregate):**
  - vLLM direct: c=64 (1759)
  - vLLM spec: c=16 (698) — sonrasında düşüyor
  - SGLang direct: c=64 (1863)
  - SGLang spec: c=32 (493)

---

### 4.8 Speculative Speedup Analizi

![Spec Speedup]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/karsilastirma/08-Spec-Speedup.png' | relative_url }})

Spec/Direct TPS oranının concurrency'ye göre değişimi:

| c | vLLM (spec/dir) | SGLang (spec/dir) |
|---|---|---|
| 1 | **1.86x** | **1.56x** |
| 2 | 1.55x | 1.36x |
| 4 | 1.36x | 0.96x |
| 8 | 1.13x | 0.71x |
| 16 | **0.99x** (break-even) | 0.51x |
| 32 | 0.66x | 0.46x |
| 64 | **0.41x** | 0.50x |

**Bulgular:**
- **vLLM Spec break-even: c~16.** Sonrası net kayıp.
- **SGLang Spec break-even: c~4.** Çok erken kırılıyor.
- SGLang'de Spec daha erken kırılmasının nedeni: SGLang'in zaten yüksek TTFT'i
  + draft model overhead'i daha erken bırakmaya itiyor.
- **Pratik kural:** Speculative decoding sadece **düşük-yük interaktif** senaryolarda
  (c<16 vLLM, c<4 SGLang) kullanılmalı. Yüksek yük üretim için **zarar verir**.

---

## 5. SLO & Göreli Kapasite Analizi

### 5.1 SLO Uyumluluk Matrisi (P90)

![SLO Heatmap]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/karsilastirma/09-SLO-Heatmap.png' | relative_url }})

P90 percentile için her config/concurrency kombinasyonunda SLO durumu:

| Config | c=1 | c=2 | c=4 | c=8 | c=16 | c=32 | c=64 |
|---|---|---|---|---|---|---|---|
| vLLM direct | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✗✓ |
| vLLM + Spec | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✗✓ |
| SGLang direct | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ | ✗✓ | ✗✓ |
| SGLang + Spec | ✓✓ | ✓✓ | ✗✓ | ✗✓ | ✗✓ | ✗✓ | ✗✓ |

(✓/✗ = TTFT/TPS P90; ilk sembol TTFT, ikinci TPS. ✓✓ = ikisi geçer, ✗✓ = sadece TPS geçer, TTFT SLO'yu az geçiyor)

### 5.2 Maksimum Concurrency (C_max) & Toplam Kullanıcı (Little's Law)

![Kapasite]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/karsilastirma/06-Kapasite.png' | relative_url }})

`N = C_max x (1 + 45s / L_mean)` formülüyle hesaplanan toplam kullanıcı sayısı:

#### P90 bazlı (üretim için önerilen — katılar)

| Config | C_max (P90) | L_mean @ C_max (s) | Toplam Kullanıcı (N) |
|---|---|---|---|
| **vLLM direct** | 32 | 3.65 | **427** |
| vLLM + Spec | 32 | 6.15 | 266 |
| SGLang direct | 16 | 2.94 | 261 |
| SGLang + Spec | 2 | 1.58 | 59 |

#### Mean bazlı (iyimser — düşük yük için)

| Config | C_max (Mean) | L_mean @ C_max (s) | Toplam Kullanıcı (N) |
|---|---|---|---|
| vLLM direct | 64 | 4.66 | 682 |
| vLLM + Spec | 32 | 6.15 | 266 |
| **SGLang direct** | 64 | 4.41 | **717** |
| SGLang + Spec | 32 | 9.28 | 187 |

### 5.3 Yorum

- **P90 bazlı üretim kapasitesi:** vLLM direct **427 kullanıcı** ile en yüksek.
  vLLM + Spec aynı C_max'a ulaşıyor ama yüksek latency nedeniyle N daha düşük (266).
- **Mean bazlı:** SGLang direct 717 ile en yüksek — çünkü c=64'te hala SLO'yu geçiyor (mean).
  Ama P90'da c=32'yi geçemediği için Mean iyimserdir.
- **SGLang + Spec en kötü:** P90'da c=2'de kırılıyor — sadece çok düşük yük için uygun.
- **Speculative decoding'un C_max'i artırmadığı görülüyor** — düşük yükte per-user
  hızı artırsa da, yüksek yükte SLO'yu bozuyor ve toplam kapasiteyi düşürüyor.

---

## 6. Karşılaştırma Çerçevesi & Yorumlama Kılavuzu

### 6.1 Bu Benchmark Ne Yapar?

[CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark), LLM inference
sunucularını **göreli karşılaştırmak** için tasarlanmıştır. Sabit iş yükü (128/128 token)
kullanarak **tekrarlanabilir** ölçümler sağlar.

### 6.2 Karşılaştırma Eksenleri

Bu araç 3 eksende karşılaştırma yapmaya uygundur:

| Eksen | Sabit olan | Değişen |
|---|---|---|
| **Inference Engine** | Model + Donanım | vLLM vs SGLang vs TRT-LLM... |
| **Model** | Donanım + Engine | Kimi K3 vs Llama vs DeepSeek... veya direct vs spec (draft model farklı) |
| **Donanım** | Model + Engine | DGX-B300 vs H100 vs MI300X... |

#### Bu Rapor 2 Ekseni Aynı Anda Kullanır

Bu rapor **tek bir eksende** değil, **iki ekseni aynı anda** kapsar — 4 config bir 2x2
matris oluşturur:

|  | **Direct (draft model yok)** | **Speculative (DSpark draft model)** |
|---|---|---|
| **vLLM** | vLLM (direct) | vLLM + Spec (`Inferact/Kimi-K3-DSpark`) |
| **SGLang** | SGLang (direct) | SGLang + Spec (`RadixArk/Kimi-K3-DSpark`) |

1. **Inference Engine ekseni (yatay):** Aynı model (Kimi K3), aynı donanım (DGX-B300),
   aynı speculative modda — vLLM vs SGLang karşılaştırması.
   - vLLM direct vs SGLang direct
   - vLLM + Spec vs SGLang + Spec

2. **Model konfigürasyon ekseni (dikey):** Aynı engine, aynı donanım — direct vs
   speculative karşılaştırması. Speculative decoding farklı bir draft model
   kullanıldığı için bu, teknik olarak **model bazlı karşılaştırmadır**:
   - vLLM direct vs vLLM + Spec (draft: `Inferact/Kimi-K3-DSpark`)
   - SGLang direct vs SGLang + Spec (draft: `RadixArk/Kimi-K3-DSpark`)

> **Önemli:** vLLM ve SGLang farklı draft modeller kullandığı için, "vLLM + Spec vs
> SGLang + Spec" karşılaştırması hem engine farkını hem de draft model farkını içerir.
> Bu nedenle speculative modda iki engine'i doğrudan karşılaştırırken bu kısıtlama
> göz önünde bulundurulmalıdır.

### 6.3 İş Yükü Sınırlamaları (Önemli)

Bu ölçümlerin **gerçek üretim iş yükünü temsil etmediğini** unutmamak gerekir:

| Sınırlama | Açıklama |
|---|---|
| **Sabit 128/128 token** | Gerçek sohbette 200-1000+ token çıkış, değişken uzunluk vardır |
| **Tek-seferlik istekler** | Multi-turn bağlam accumulasyonu (KV cache hit) ölçülmedi |
| **Tam context aktif** | `--max-model-len 1048576` — 1M context overhead'i 128-token isteğine yansıyan |
| **Düşük input** | Uzun prompt (1K-32K) prefill davranışını ölçmüyor |
| **Şablon prompt'lar** | Gerçek kullanıcı prompt'ları daha çeşitli dağılım gösterir |

### 6.4 Sonuçların Yorumlanması

#### Standartlaştırılmış Bir Kullanım Senaryosu Yoktur

Aynı model (Kimi K3) pratikte çok farklı yük profillerinde kullanılır ve bunlardan
hiçbiri "tek doğru" senaryo olarak kabul edilemez:

- **Sohbet (chat):** Tek kullanıcı, kısa girdi/çıktı, düşük eşzamanlılık, kısa think time
- **Agent:** Çok adımlı, değişken uzunluk, tool call'lar, orta eşzamanlılık
- **Otomasyon / Batch:** Yüksek eşzamanlılık, uzun girdi/çıktı, uzun think time
- **API servisi:** Karışık yük, öngörülemez eşzamanlılık/girdi/çıktı dağılımı

Bu çeşitlilik nedeniyle **eşzamanlılık, girdi ve çıktı büyüklükleri önceden belirlenemez** —
uygulamanın doğasına, kullanıcı davranışına ve zaman dilimine göre değişir. Bu raporun
128/128 token + 45s think time ölçümleri belirli bir çalışma noktasını temsil eder;
gerçek üretim iş yükünü birebir yansıtmaz.

#### Bu Raporda Öngörülemeyen Değişkenler

Aşağıdaki faktörler bu benchmark'ta sabitlenmiştir ama gerçek kullanımda değişkendir:

| Değişken | Bu Raporda | Gerçek Kullanım Aralığı |
|---|---|---|
| Concurrency | 1-64 | 1-1000+ (uygulamaya bağlı) |
| Input token | 128 (sabit) | 10-32K+ (prompt içeriğine bağlı) |
| Output token | 128 (sabit) | 50-4096+ (göreve bağlı) |
| Think time | 45s (varsayım) | 5s (hızlı interaktif) - 120s (derin çalışma) |

#### Tutarlı Yorumlama İçin Gözlemler

Yukarıdaki sınırlamalar ışığında, bu raporun sonuçları şu gözlemlerle yorumlanmalıdır:

- Bu rapor **göreli sıralama** için değerlidir, mutlak üretim tahmini için değil.
  "vLLM direct 427 kullanıcı destekler" demek yerine, "vLLM direct, vLLM + Spec'ten
  1.6x daha fazla kullanıcı destekler" şeklinde yorumlamak daha tutarlıdır.
- P90, Mean'den daha gerçekçi bir üretim göstergesidir — tail latency üretimde kritiktir.
  Bu raporda üretim ile ilgili kararlar P90 üzerinden verilmiştir.
- Little's Law ile hesaplanan kullanıcı sayıları, 45s think time varsayımına bağlıdır;
  gerçek uygulamanızın think time'ı farklıysa sayılar değişir.
- Speculative decoding break-even noktası bu raporda vLLM için ~c16, SGLang için ~c4
  ölçülmüştür; farklı iş yükü veya donanımda bu noktalar değişebilir.
- En uygun config, **hedef senaryonun yük profiline bağlıdır** (Bölüm 8'e bakınız).

### 6.5 Tam Context Dağıtımının Etkisi

Model `--max-model-len 1048576` ile dağıtıldı. Bu, her istek için 1M token'lik
KV cache yönetimi yapıldığı anlamına gelir. 128-token input için ölçülen TTFT,
aslında "1M context kapasiteli sistemde 128 token işleme" maliyetidir.

Bu nedenle, bu ölçülen prefill hızları **mutlak prefill hızı değil**, **tam context
yapılandırmasındaki prefill hızı**dır. Daha kısa `--max-model-len` ile KV cache
kullanımı değişebilir, prefill hızı farklı olabilir.

---

## 7. Sonuç

Kimi K3 modelinin DGX-B300 üzerinde 4 farklı inference engine konfigürasyonu
karşılaştırıldı: vLLM (direct), vLLM + DSpark speculative, SGLang (direct),
SGLang + DSpark speculative.

**Ölçülen davranışlar:**

- **Düşük yükte (c<=4):** Speculative decoding per-user TPS'i 1.4-1.9x artırıyor,
  ITL yarıya iniyor (vLLM: 9.5ms -> 4.8ms).
- **Break-even noktaları:** vLLM için ~c16, SGLang için ~c4. Sonrasında speculative
  decoding performansı direct'ten düşüyor.
- **Yüksek yükte (c=64):** vLLM + Spec'in per-user TPS'i 11 tok/s'a düşüyor
  (vLLM direct 27 tok/s). Aggregate output vLLM+Spec'te c=32->64'te düşüyor.
- **SGLang direct'in TTFT'i** vLLM direct'ten yüksek (c=1'de 400ms vs 66ms) —
  bu fark, engine'lerin prefill backend yapılandırmasından kaynaklanıyor
  (Bölüm 3.4'e bakınız).
- **SGLang + Spec @c=64'te anomali:** TTFT 4752ms (c=32'de 777ms idi).

**Önemli:** Tüm sonuçlar **göreli karşılaştırma** içindir. 128/128 token sabit iş yükü
ve 45s think time varsayımına dayanır. Gerçek üretim iş yükü için ayrı benchmark
yapılması önerilir.

---

## Ek A: Tüm CSV Verileri

### A.1 vLLM (direct)

| c | TTFT Mean | TTFT P90 | ITL Mean | ITL P90 | TPS Mean | TPS P90 | Lat Mean | Lat P90 | RPS |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 66.5 | 70.5 | 9.46 | 9.47 | 100.84 | 101.30 | 1.27 | 1.27 | 0.79 |
| 2 | 105.5 | 154.9 | 11.16 | 11.58 | 83.98 | 83.99 | 1.52 | 1.54 | 0.66 |
| 4 | 145.9 | 197.6 | 12.61 | 13.22 | 73.17 | 74.47 | 1.75 | 1.77 | 0.57 |
| 8 | 388.0 | 520.9 | 15.59 | 17.57 | 54.03 | 56.11 | 2.37 | 2.44 | 0.42 |
| 16 | 543.8 | 693.4 | 18.54 | 20.95 | 43.95 | 46.19 | 2.92 | 3.18 | 0.34 |
| 32 | 608.1 | 887.5 | 23.56 | 25.73 | 35.18 | 38.43 | 3.65 | 3.95 | 0.27 |
| 64 | 731.7 | 1107.0 | 30.82 | 33.77 | 27.49 | 28.59 | 4.66 | 4.85 | 0.21 |

### A.2 vLLM + Spec (DSpark)

| c | TTFT Mean | TTFT P90 | ITL Mean | ITL P90 | TPS Mean | TPS P90 | Lat Mean | Lat P90 | RPS |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 71.0 | 77.8 | 4.84 | 5.74 | 187.74 | 201.34 | 0.69 | 0.80 | 1.46 |
| 2 | 172.9 | 191.2 | 6.67 | 8.15 | 129.75 | 167.10 | 1.02 | 1.18 | 0.98 |
| 4 | 191.5 | 265.9 | 9.11 | 12.07 | 99.43 | 127.29 | 1.35 | 1.74 | 0.74 |
| 8 | 262.9 | 455.0 | 15.89 | 24.13 | 61.04 | 81.74 | 2.28 | 3.35 | 0.44 |
| 16 | 344.3 | 594.2 | 21.69 | 28.15 | 43.60 | 59.14 | 3.10 | 3.98 | 0.32 |
| 32 | 565.2 | 802.0 | 43.93 | 59.60 | 23.14 | 30.79 | 6.15 | 8.16 | 0.16 |
| 64 | 1030.9 | 1465.5 | 95.38 | 135.86 | 11.21 | 16.51 | 13.15 | 18.35 | 0.08 |

### A.3 SGLang (direct)

| c | TTFT Mean | TTFT P90 | ITL Mean | ITL P90 | TPS Mean | TPS P90 | Lat Mean | Lat P90 | RPS |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 399.5 | 397.2 | 8.94 | 8.95 | 83.40 | 84.44 | 1.54 | 1.54 | 0.65 |
| 2 | 771.7 | 786.9 | 9.72 | 9.79 | 63.79 | 64.99 | 2.01 | 2.03 | 0.50 |
| 4 | 811.0 | 948.2 | 10.65 | 10.73 | 59.33 | 61.42 | 2.17 | 2.30 | 0.46 |
| 8 | 782.6 | 820.6 | 12.89 | 13.18 | 52.88 | 54.17 | 2.42 | 2.52 | 0.41 |
| 16 | 833.6 | 948.8 | 16.53 | 17.06 | 43.54 | 44.88 | 2.94 | 3.06 | 0.34 |
| 32 | 915.2 | 1204.5 | 23.34 | 24.84 | 33.55 | 36.56 | 3.92 | 4.03 | 0.26 |
| 64 | 948.4 | 1263.5 | 27.08 | 27.32 | 29.11 | 30.20 | 4.41 | 4.74 | 0.23 |

### A.4 SGLang + Spec (DSpark)

| c | TTFT Mean | TTFT P90 | ITL Mean | ITL P90 | TPS Mean | TPS P90 | Lat Mean | Lat P90 | RPS |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 450.6 | 630.0 | 4.26 | 4.94 | 129.86 | 142.68 | 0.99 | 1.09 | 1.01 |
| 2 | 484.6 | 495.7 | 8.59 | 12.98 | 87.02 | 122.46 | 1.58 | 2.19 | 0.63 |
| 4 | 588.3 | 1111.4 | 14.39 | 23.24 | 56.92 | 72.54 | 2.42 | 3.36 | 0.41 |
| 8 | 610.3 | 1070.4 | 23.56 | 32.04 | 37.78 | 50.83 | 3.60 | 4.76 | 0.28 |
| 16 | 745.1 | 1155.4 | 61.29 | 79.10 | 22.16 | 33.99 | 8.53 | 10.85 | 0.12 |
| 32 | 776.9 | 1166.4 | 66.93 | 90.59 | 15.42 | 20.27 | 9.28 | 12.20 | 0.11 |
| 64 | 4752.6 | 5252.9 | 34.40 | 45.13 | 14.54 | 16.78 | 9.13 | 10.77 | 0.11 |

---

## Ek B: Ölçü Grafikler (Karşılaştırma)

Aşağıdaki grafikler bu rapor için üretilmiştir (`karsilastirma/` klasörü):

| # | Dosya | İçerik |
|---|---|---|
| 1 | `01-TTFT.png` | TTFT Mean + P90, 4 config |
| 2 | `02-ITL.png` | ITL Mean + P90, 4 config |
| 3 | `03-TPS.png` | Per-User TPS Mean + P90, 4 config |
| 4 | `04-Latency.png` | Latency Mean + P90, 4 config |
| 5 | `05-Throughput.png` | Throughput (RPS), 4 config |
| 6 | `06-Kapasite.png` | C_max + Little's Law N (P90 & Mean) |
| 7 | `07-Aggregate-Output.png` | Toplam üretilen tok/s (TPS x c) |
| 8 | `08-Spec-Speedup.png` | Spec/Direct TPS oran, break-even |
| 9 | `09-SLO-Heatmap.png` | SLO uyumluluk matrisi (P90) |
| 10 | `10-Dashboard.png` | 2x3 grid özet (Mean değerler) |

### Ek B.1: Tek Bakışta Özet (Dashboard)

![Dashboard]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/karsilastirma/10-Dashboard.png' | relative_url }})

---

*Bu rapor [CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark) aracı ile üretilen ölçümlerden oluşturulmuştur.*
*Dağıtım komutları vLLM ve SGLang'in resmi Kimi K3 reçetelerinden alınmıştır.*
*Grafikler matplotlib 3.7.5 + plotly 6.8.0 ile üretilmiştir.*
*Rapor tarihi: Temmuz 2026*
