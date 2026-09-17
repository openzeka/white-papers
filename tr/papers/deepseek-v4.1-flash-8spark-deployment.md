---
title: DeepSeek-V4.1-Flash 8× DGX Spark TP8 Dağıtımı
parent: White Papers
nav_order: 11
lang: tr
page_id: deepseek-v4.1-flash-8spark-deployment
card_order: 11
card_tag: "LLM Dağıtımı"
card_date: "Eylül 2026"
description: >-
  DeepSeek-V4.1-Flash (763B MoE, FP8, DSpark k=5) modelinin 8× NVIDIA DGX Spark
  (GB10) üzerinde TP8 dağıtımı: iki yapılandırma (300K Engram-bellekte, 1M
  Engram-diskte), NCCL optimizasyonu, benchmark sonuçları ve TP4 karşılaştırması.
permalink: /papers/deepseek-v4.1-flash-8spark-deployment/
last_modified_date: 2026-09-17
toc: true
---

*Hazırlayan: **Openzeka Teknoloji A.Ş.** — NVIDIA Türkiye & MEA Resmî Embedded Compute Distribütörü ve NVIDIA Elite Partner*

*Test platformu: 8× NVIDIA DGX Spark (GB10) · Model: DeepSeek-V4.1-Flash (763B) · Rapor tarihi: Eylül 2026*

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## 1. Giriş

Bu rapor, DeepSeek-V4.1-Flash (763B MoE) modelinin **8× NVIDIA DGX Spark (GB10)** üzerinde tensor-parallel (TP=8) dağıtımını belgeler. [4× DGX Spark TP4 dağıtım raporunun]({{ '/papers/deepseek-v4.1-flash-4spark-deployment/' | relative_url }}) devamıdır; model mimarisi, vLLM build zinciri ve SM 12.1a patch'leri orada açıklanmıştır ve burada tekrar edilmeyecektir.

İki yapılandırma test edilmiştir:

- **TP8-300K (Engram bellekte):** 300K bağlam, Engram tabloları pinned host belleğine stock vLLM ile yüklenir, GMU 0.80, AutoTuner kapalı.
- **TP8-1M (Engram diskte):** 1M bağlam, Engram tabloları yerel NVMe'de Engram-on-disk patch'i ile tutulur, GMU 0.75, AutoTuner açık.

Her iki yapılandırma da DSpark k=5 speculative decoding, CUDA graphs (`FULL_AND_PIECEWISE` modu) ve vision + araç çağırma (tool calling) destekini kullanır.

> **Neden iki yapılandırma?** Engram-on-disk patch'i satırları forward öncesinde GPU belleğine stage eder ve CUDA graph capture'ı etkinleştirir — ancak 300K bağlamda 8 rank ile birleşik bellekte Engram'ı pinned host belleğinde tutmak için yeterli yer vardır. 300K-bellek yapılandırması, bağlam sınırlıyken stock yolun daha hızlı olup olmadığını test eder. 1M-disk yapılandırması ise maksimum bağlam tavanını test eder.

---

## 2. Donanım

| Bileşen | Değer |
|---|---|
| GPU | Blackwell mimarisi (GB10), SM 12.1a (CC 12.1), 48 SM |
| GPU belleği | Düğüm başına 128 GB unified LPDDR5X (CPU+GPU paylaşımlı) |
| Bellek bant genişliği | Düğüm başına ~273 GB/s (unified) |
| FP4 tepe (seyreklik ile) | Düğüm başına ~1 PFLOP |
| CPU | Düğüm başına 20 çekirdekli Arm (10× Cortex-X925 + 10× Cortex-A725) |
| Node interconnect | NVIDIA ConnectX-7, 200 Gb/s RDMA (QSFP) |
| Depolama | 8× NVMe SSD (1× 1 TB + 7× 4 TB, 8 düğüm genelinde) |
| Ağ topolojisi | 200 GbE switch (NVLink yok; all-reduce Ethernet üzerinden) |

8 düğüm × 128 GB = küme genelinde **1024 GB toplam birleşik bellek**.

---

## 3. Docker Image'lar

TP4 dağıtımıyla aynı base'den üretilen iki image kullanılır (`vllm-dsv41:latest`).

### 3.1 `vllm-dsv41:latest` (7 patch, Engram-on-disk)

TP8-1M yapılandırması tarafından kullanılır. TP4 image'ı ile aynıdır — Engram-on-disk dahil 7 SM 12.1a patch'inin hepsi gömülüdür. Tam patch listesi ve build talimatları için [TP4 dağıtım raporu, Bölüm 4]({{ '/papers/deepseek-v4.1-flash-4spark-deployment/' | relative_url }})'e bakınız.

### 3.2 `vllm-dsv41:engram-mem` (4 patch, Engram bellekte)

TP8-300K yapılandırması tarafından kullanılır. `vllm-dsv41:latest` üzerine, üç Engram patch dosyası **stock vLLM'e restore edilerek** üretilir:

```dockerfile
FROM vllm-dsv41:latest
COPY vllm/vllm/models/deepseek_v4_1/common/engram.py /usr/local/lib/python3.12/dist-packages/vllm/models/deepseek_v4_1/common/engram.py
COPY vllm/vllm/model_executor/model_loader/weight_utils.py /usr/local/lib/python3.12/dist-packages/vllm/model_executor/model_loader/weight_utils.py
COPY vllm/vllm/models/deepseek_v4_1/nvidia/model_state.py /usr/local/lib/python3.12/dist-packages/vllm/models/deepseek_v4_1/nvidia/model_state.py
ENTRYPOINT []
```

Kalan 4 patch (attention, FlashInfer sparse, SWA, sparse indexer) korunur. Stock Engram işleyişiyle tablolar pinned host belleğine yüklenir ve forward her adımda bir host round-trip yapar — CUDA graph'ler Engram lookup'ı capture edemez.

| Image | Engram.py | model_state.py | weight_utils.py | attention.py | flashinfer_sparse.py | sparse_swa.py | sparse_attn_indexer.py |
|---|---|---|---|---|---|---|---|
| `vllm-dsv41:latest` | patch'li | patch'li | patch'li | patch'li | patch'li | patch'li | patch'li |
| `vllm-dsv41:engram-mem` | **stock** | **stock** | **stock** | patch'li | patch'li | patch'li | patch'li |

---

## 4. TP8 Optimizasyonları

TP=8, 8-rank NCCL iletişimi sunar ve bu, TP=4'te gerekmeyen optimizasyonlar gerektirir.

### 4.1 NCCL Kanal Azaltma

TP=8'de NCCL default olarak 64 kanal kullanır — rank başına yaklaşık **37 GB overhead**. Üç environment variable bunu azaltır:

| Ayar | Değer | Etki |
|---|---|---|
| `NCCL_MAX_NCHANNELS` | `8` | 64 → 8 kanal (rank başına ~26 GB tasarruf) |
| `NCCL_BUFFSIZE` | `1048576` | 4 MiB → 1 MiB buffer |
| `NCCL_NVLS_ENABLE` | `0` | GB10'da NVLink SHARP yok |

### 4.2 Container Limitleri

| Ayar | Değer | Sebep |
|---|---|---|
| `ulimit: nofile` | `1048576:1048576` | NCCL 2.30 8-rank socket accept limiti |
| `ulimit: memlock` | `-1:-1` | RDMA memory pinning (`ibv_reg_mr`) |
| `ulimit: stack` | `67108864` | 64 MB stack |
| `cap_add: IPC_LOCK` | — | RDMA memory pinning capability |
| `memory_limit` | `112g` | OS için 9 GB bırak (121 GB toplam) |

`memlock=-1:-1` ve `IPC_LOCK` olmadan NCCL init `ibv_reg_mr_iova2 failed with error Cannot allocate memory` hatasıyla başarısız olur.

### 4.3 NCCL Environment

```yaml
NCCL_IB_ROCE_VERSION_NUM: '2'      # RoCE v2
NCCL_IB_ADDR_FAMILY: 'AF_INET'     # IPv4
NCCL_NVLS_ENABLE: '0'              # GB10'da NVLink SHARP yok
NCCL_IB_MERGE_NICS: '0'           # NIC merge kapalı
NCCL_CROSS_NIC: '1'               # Çapraz NIC
NCCL_IGNORE_CPU_AFFINITY: '1'     # CPU affinity ignore
NCCL_CUMEM_ENABLE: '0'            # NCCL cumem kapalı
TORCH_NCCL_ASYNC_ERROR_HANDLING: '1'
NCCL_DEBUG: 'WARN'
```

---

## 5. Yapılandırma

### 5.1 TP8-300K (Engram bellekte)

| Parametre | Değer | Açıklama |
|---|---|---|
| Image | `vllm-dsv41:engram-mem` | Stock Engram işleyişi |
| `tensor_parallel` | 8 | 8 düğüm × 1 GPU |
| `gpu_memory_utilization` | 0.80 | %80 GMU |
| `max_model_len` | 300000 | 300K bağlam |
| `max_num_seqs` | 8 | Maksimum 8 eşzamanlı dizi |
| `max_num_batched_tokens` | 8192 | Prefill batch boyutu |
| `block_size` | 128 | KV önbellek blok boyutu |
| `distributed-executor-backend` | mp | Multiprocess backend |
| AutoTuner | kapalı (`VLLM_FLASHINFER_AUTOTUNE: '0'`) | OOM spike'ı önler |

### 5.2 TP8-1M (Engram diskte)

| Parametre | Değer | Açıklama |
|---|---|---|
| Image | `vllm-dsv41:latest` | Engram-on-disk patch aktif |
| `tensor_parallel` | 8 | 8 düğüm × 1 GPU |
| `gpu_memory_utilization` | 0.75 | %75 GMU (1M KV için daha düşük) |
| `max_model_len` | 1048576 | 1M bağlam |
| `max_num_seqs` | 8 | Maksimum 8 eşzamanlı dizi |
| `max_num_batched_tokens` | 8192 | Prefill batch boyutu |
| `block_size` | 128 | KV önbellek blok boyutu |
| `distributed-executor-backend` | mp | Multiprocess backend |
| `DSV41_ENGRAM_DISK` | 1 | Engram satırları yerel NVMe'de |
| AutoTuner | açık (default) | Yeterli bellek boşluğu |

### 5.3 Speculative Decoding (her ikisi)

```json
{
  "method": "dspark",
  "num_speculative_tokens": 5,
  "draft_sample_method": "probabilistic",
  "rejection_sample_method": "block",
  "enable_adaptive_verification": false
}
```

### 5.4 Çalıştırma Komutu

```bash
# TP8-300K (Engram bellekte)
sparkrun run /home/nvidia/.cordatus-sparkrun/recipes/deepseek-v41-flash-tp8.yaml \
  --hosts 192.168.1.153,192.168.1.147,192.168.1.157,192.168.1.158,192.168.1.161,192.168.1.162,192.168.1.166,192.168.1.148 \
  --foreground

# TP8-1M (Engram diskte)
sparkrun run /home/nvidia/.cordatus-sparkrun/recipes/deepseek-v41-flash-tp8-1m.yaml \
  --hosts 192.168.1.153,192.168.1.147,192.168.1.157,192.168.1.158,192.168.1.161,192.168.1.162,192.168.1.166,192.168.1.148 \
  --foreground
```

---

## 6. Bellek Analizi

### 6.1 TP8-300K (Engram bellekte)

| Bileşen | GB/rank |
|---|---|
| Model (GPU) | 49.55 |
| Engram (pinned host) | 23.60 |
| NCCL (8 kanal) | ~11 |
| CUDA graphs | ~1.5 |
| **Toplam** | **~85.5** |
| GMU=0.80 bütçe | 96.8 |
| **KV önbellek** | **~8.7 GB** (1.46M token) |

### 6.2 TP8-1M (Engram diskte)

| Bileşen | GB/rank |
|---|---|
| Model (GPU, Engram'sız) | 38 |
| NCCL (8 kanal) | ~11 |
| AutoTune spike | ~10 |
| CUDA graphs | ~1.5 |
| **Toplam** | **~60.5** |
| GMU=0.75 bütçe | 90.75 |
| **KV önbellek** | **~30 GB** |
| 1M bağlam gereksinimi | ~3.7 GB |
| **Boş headroom** | ~26 GB |

Engram-on-disk yapılandırması, KV önbellek için önemli ölçüde daha fazla bellek bırakır (~30 GB vs ~8.7 GB) ve bu da 1M bağlamı mümkün kılar. Bedel, decode adımı başına disk I/O gecikmesidir.

---

## 7. Performans Sonuçları

### 7.1 TP8-300K (Engram bellekte)

Ölçümler [CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark) aracı ile alınmıştır.

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Latency (s) | Throughput (RPS) |
|---|---|---|---|---|---|
| 1 | 213.19 | 26.67 | 35.98 | 3.60 | 0.28 |
| 2 | 279.55 | 33.87 | 28.21 | 4.58 | 0.22 |
| 4 | 370.36 | 48.16 | 20.10 | 6.49 | 0.15 |
| 8 | 488.22 | 71.12 | 13.63 | 9.52 | 0.11 |

### 7.2 TP8-1M (Engram diskte)

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Latency (s) | Throughput (RPS) |
|---|---|---|---|---|---|
| 1 | 198.54 | 29.06 | 33.28 | 3.89 | 0.26 |
| 2 | 301.32 | 35.92 | 26.76 | 4.86 | 0.21 |
| 4 | 400.58 | 56.68 | 17.07 | 7.60 | 0.13 |
| 8 | 553.68 | 82.54 | 11.74 | 11.04 | 0.09 |

### 7.3 Grafikler — TP8-300K (Engram bellekte)

![TTFT]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-300k-TTFT.png' | relative_url }})

![ITL]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-300k-ITL.png' | relative_url }})

![TPS]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-300k-TPS.png' | relative_url }})

![Latency]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-300k-Latency.png' | relative_url }})

![Throughput]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-300k-Throughput.png' | relative_url }})

### 7.4 Grafikler — TP8-1M (Engram diskte)

![TTFT]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-1m-TTFT.png' | relative_url }})

![ITL]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-1m-ITL.png' | relative_url }})

![TPS]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-1m-TPS.png' | relative_url }})

![Latency]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-1m-Latency.png' | relative_url }})

![Throughput]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-1m-Throughput.png' | relative_url }})

### 7.5 Değerlendirme

- **TP8-300K, her concurrency seviyesinde TP8-1M'den daha hızlıdır** (C=1'de 35.98 vs 33.28). 1M yapılandırmasında Engram diskte olmasına rağmen CUDA graph avantajı, 1M bağlam overhead'i ve AutoTuner profiling maliyeti tarafından aşılır.
- **C=1'de TTFT**, 1M yapılandırmasında daha düşüktür (199 ms vs 213 ms) — Engram-on-disk yolu, prefill sırasında host round-trip'ini önler.
- **Max C = 4** (her iki yapılandırma için, Benchmark Gezgini'nin varsayılan hedeflerinde: TTFT≤1000ms, TPS≥15) — TP4 kapasitesinin (Max C=2) iki katı.
- **TPS düşüşü** C=1'den C=8'e: %62 (300K), %65 (1M) — küme doygunluğa yaklaşırken bellek bant genişliği çekişmesi.

---

## 8. Karşılaştırmalı Analiz

### 8.1 TP4 vs TP8 vs B300

| Concurrency | TP4 TPS | TP8-300K TPS | TP8-1M TPS | B300 TPS |
|---|---|---|---|---|
| 1 | 29.48 | **35.98** | 33.28 | 284.54 |
| 2 | 21.32 | **28.21** | 26.76 | 294.56 |
| 4 | 13.09 | **20.10** | 17.07 | 252.60 |
| 8 | 8.79 | **13.63** | 11.74 | 209.41 |

**TP8-300K, C=1'de TP4'ten %22 daha hızlıdır** (35.98 vs 29.48) ve **C=8'de %55 daha hızlıdır** (13.63 vs 8.79). Ölçekleme sublineerdir çünkü model bellek bant genişliği sınırlıdır ve TP=8, 8 düğüm arası all-reduce overhead'i ekler.

**B300, C=1'de TP8-300K'den hâlâ ~8× daha hızlıdır** (284.54 vs 35.98) — HBM3e bant genişliği farkı (~8 TB/s vs 273 GB/s) baskın gelir.

### 8.2 TTFT Karşılaştırması

| Concurrency | TP4 TTFT (ms) | TP8-300K TTFT (ms) | TP8-1M TTFT (ms) |
|---|---|---|---|
| 1 | 271.63 | 213.19 | **198.54** |
| 2 | 395.75 | 279.55 | 301.32 |
| 4 | 577.41 | 370.36 | 400.58 |
| 8 | 805.89 | 488.22 | 553.68 |

TP8, tüm concurrency seviyelerinde TTFT'yi %21-39 oranında düşürür — prefill hesaplama sınırlıdır (compute-bound) ve 8 rank daha fazla toplam FLOPS sağlar.

---

## 9. SLO ve Kapasite

Benchmark Gezgini'nin varsayılan hedeflerinde (TTFT≤1000ms, TPS≥15 tok/s), her iki TP8 yapılandırması **Max C = 4** verir — TP4 kapasitesinin (Max C=2) iki katı:

| SLO | Eşik | TP8-300K C=4 | TP8-1M C=4 |
|---|---|---|---|
| TTFT | ≤ 1000 ms | 370 ms ✓ | 401 ms ✓ |
| TPS | ≥ 15 tok/s | 20.10 ✓ | 17.07 ✓ |

> **Uyarı:** C=8'de TPS, her iki yapılandırma için de 15 tok/s eşiğinin altına düşer (13.63 ve 11.74). İnteraktif sohbet servisleri için **4 eşzamanlı kullanıcı** önerilir; daha yüksek yük için veri merkezi donanımı (B300/GB300) tercih edilmelidir.

---

## 10. Öğrenilen Dersler

1. **NCCL 8-rank overhead'i büyüktür.** Default 64 kanal, rank başına ~37 GB tüketir. `NCCL_MAX_NCHANNELS=8` ve `NCCL_BUFFSIZE=1048576` bunu ~11 GB'a düşürür — olmadan model belleğe sığmaz.
2. **`memlock=-1` ve `IPC_LOCK` 8-rank RDMA için zorunludur.** Olmadan NCCL init `ibv_reg_mr_iova2 failed with error Cannot allocate memory` hatasıyla başarısız olur.
3. **`nofile=1048576` NCCL 2.30 için gereklidir.** 8-rank socket accept, container'ın default 1024 soft limitini aşar.
4. **Engram-on-disk, C=1 TTFT'de paradoksal olarak daha hızlıdır** (199 ms vs 213 ms) — Engram-on-disk yolu satırları forward öncesinde stage eder ve stock Engram-bellekte yolunun her adımda yaptığı host round-trip'ini önler.
5. **AutoTuner OOM'a sebep olabilir.** `VLLM_FLASHINFER_AUTOTUNE: '0'` FlashInfer autotune'u kapatır ama DeepGEMM/CUTLASS mxfp8_gemm autotune'ını kapatmaz; bu da profiling sırasında ~10 GB tüketir. 1M yapılandırmasında yeterli headroom vardır; 300K yapılandırmasında kapatılır.
6. **sparkrun cluster yönetimi.** `sparkrun cluster set-default <name>` aktif cluster'ı değiştirir; `sparkrun cluster default` yalnızca görüntüler.
7. **Docker `ENTRYPOINT []` zorunludur.** Stock `vllm/vllm-openai` image'ında `ENTRYPOINT ["vllm","serve"]` vardır ve sparkrun komutunu append etmeyi engeller. Final image'da entrypoint temizlenmelidir.

---

## 11. Sonuç

1. **DeepSeek-V4.1-Flash (763B), 8× DGX Spark üzerinde TP=8 ile çalışır** — daha büyük cluster, kullanılabilir concurrency'yi ikiye katlar (TP4'te Max C=2, TP8'de Max C=4) ve TPS'yi %22-55 oranında artırır.
2. **İki yapılandırma farklı kullanım senaryolarına hizmet eder.** TP8-300K (Engram bellekte) sınırlı bağlam iş yükleri için daha hızlıdır; TP8-1M (Engram diskte) kabul edilebilir performansla tam 1M bağlam tavanını etkinleştirir.
3. **NCCL optimizasyonu TP8'in kritik deltasıdır.** Kanal azaltma ve uygun ulimit'ler olmadan, 8-rank overhead'i modelin belleğe sığmasını engeller.
4. **TP8, veri merkezi donanımının yerini almaz.** B300, C=1'de hâlâ ~8× daha hızlıdır, ancak TP8, 763B modeli TP4 üzerinden 4× kapasite artışına taşır — geliştirme, prototipleme ve sınırlı ekip production senaryoları için yeterli.

---

## Ek A: Doğrulama Komutları

### API Sağlığı

```bash
curl http://192.168.1.153:8000/v1/models
```

### Basit Test

```bash
curl http://192.168.1.153:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-v4.1-flash","max_tokens":50,
       "messages":[{"role":"user","content":"Count from 1 to 10."}]}'
```

---

*Openzeka Teknoloji A.Ş. — [openzeka.com](https://www.openzeka.com) · Tel: +90 312 266 2055*

*Üniversiteler Mah. Şehit Mustafa Tayyarcan Cad. Tepe Binası No:5 İç Kapı No:315, 06800 Çankaya/Ankara, Türkiye*

*Bu rapor [CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark) aracı ile üretilen ölçümlerden oluşturulmuştur.*
*Dağıtım reçetesi [tonyd2wild/DeepSeek-V4.1-Flash-vLLM-DGX-Spark](https://github.com/tonyd2wild/DeepSeek-V4.1-Flash-vLLM-DGX-Spark) boot10 config'inden ve [im0xMagnus/deepseek-v4.1-flash-uncensored-8x-dgx-spark](https://github.com/im0xMagnus/deepseek-v4.1-flash-uncensored-8x-dgx-spark) TP8 port'undan uyarlanmıştır.*
*Rapor tarihi: Eylül 2026*
