---
title: DeepSeek-V4.1-Flash 8× DGX Spark TP8 Deployment
parent: White Papers
nav_order: 11
lang: en
page_id: deepseek-v4.1-flash-8spark-deployment
card_order: 11
card_tag: "LLM Deployment"
card_date: "September 2026"
description: >-
  Deployment of DeepSeek-V4.1-Flash (763B MoE, FP8, DSpark k=5) on 8× NVIDIA DGX
  Spark (GB10) with TP8: two configurations (300K Engram-in-memory, 1M
  Engram-on-disk), NCCL optimization, benchmark results and TP4 comparison.
permalink: /papers/deepseek-v4.1-flash-8spark-deployment/
last_modified_date: 2026-09-17
toc: true
---

*Prepared by: **Openzeka Teknoloji A.Ş.** — Official Embedded Compute Distributor for NVIDIA Türkiye & MEA, and NVIDIA Elite Partner*

*Test platform: 8× NVIDIA DGX Spark (GB10) · Model: DeepSeek-V4.1-Flash (763B) · Report date: September 2026*

---

{:.no_toc}
## Contents

* TOC
{:toc}

---

## 1. Introduction

This report documents the deployment of DeepSeek-V4.1-Flash (763B MoE) on **8× NVIDIA DGX Spark (GB10)** using tensor parallelism (TP=8). It is the companion to the [4× DGX Spark TP4 deployment report]({{ '/papers/deepseek-v4.1-flash-4spark-deployment/' | relative_url }}); the model architecture, vLLM build chain, and SM 12.1a patches are described there and are not repeated here.

Two configurations were tested:

- **TP8-300K (Engram in memory):** 300K context, Engram tables loaded into pinned host memory via stock vLLM, GMU 0.80, AutoTuner off.
- **TP8-1M (Engram-on-disk):** 1M context, Engram tables on local NVMe via the Engram-on-disk patch, GMU 0.75, AutoTuner on.

Both configurations use DSpark k=5 speculative decoding, CUDA graphs (`FULL_AND_PIECEWISE` mode), and vision + tool calling enabled.

> **Why two configurations?** The Engram-on-disk patch stages rows into GPU memory before the forward pass, enabling CUDA graph capture — but at 300K context with 8 ranks there is enough unified memory to hold Engram in pinned host memory instead. The 300K-memory configuration tests whether the simpler stock path is faster when context is bounded. The 1M-disk configuration tests the maximum context ceiling.

---

## 2. Hardware

| Component | Value |
|---|---|
| GPU | Blackwell architecture (GB10), SM 12.1a (CC 12.1), 48 SMs |
| GPU memory | 128 GB unified LPDDR5X (shared CPU+GPU) per node |
| Memory bandwidth | ~273 GB/s (unified) per node |
| FP4 peak (with sparsity) | ~1 PFLOP per node |
| CPU | 20-core Arm (10× Cortex-X925 + 10× Cortex-A725) per node |
| Node interconnect | NVIDIA ConnectX-7, 200 Gb/s RDMA (QSFP) |
| Storage | 8× NVMe SSD (1× 1 TB + 7× 4 TB across 8 nodes) |
| Network topology | 200 GbE switch (no NVLink; all-reduce over Ethernet) |

8 nodes × 128 GB = **1024 GB total unified memory** across the cluster.

---

## 3. Docker Images

Two images are used, both built from the same base as the TP4 deployment (`vllm-dsv41:latest`).

### 3.1 `vllm-dsv41:latest` (7 patches, Engram-on-disk)

Used by the TP8-1M configuration. Identical to the TP4 image — all 7 SM 12.1a patches baked in, including Engram-on-disk. See the [TP4 deployment report, Section 4]({{ '/papers/deepseek-v4.1-flash-4spark-deployment/' | relative_url }}) for the full patch list and build instructions.

### 3.2 `vllm-dsv41:engram-mem` (4 patches, Engram in memory)

Used by the TP8-300K configuration. Built on top of `vllm-dsv41:latest` with the three Engram patch files **restored to stock vLLM**:

```dockerfile
FROM vllm-dsv41:latest
COPY vllm/vllm/models/deepseek_v4_1/common/engram.py /usr/local/lib/python3.12/dist-packages/vllm/models/deepseek_v4_1/common/engram.py
COPY vllm/vllm/model_executor/model_loader/weight_utils.py /usr/local/lib/python3.12/dist-packages/vllm/model_executor/model_loader/weight_utils.py
COPY vllm/vllm/models/deepseek_v4_1/nvidia/model_state.py /usr/local/lib/python3.12/dist-packages/vllm/models/deepseek_v4_1/nvidia/model_state.py
ENTRYPOINT []
```

The remaining 4 patches (attention, FlashInfer sparse, SWA, sparse indexer) are kept. With stock Engram handling, the tables load into pinned host memory and the forward pass makes a host round-trip on each step — CUDA graphs cannot capture the Engram lookup.

| Image | Engram.py | model_state.py | weight_utils.py | attention.py | flashinfer_sparse.py | sparse_swa.py | sparse_attn_indexer.py |
|---|---|---|---|---|---|---|---|
| `vllm-dsv41:latest` | patched | patched | patched | patched | patched | patched | patched |
| `vllm-dsv41:engram-mem` | **stock** | **stock** | **stock** | patched | patched | patched | patched |

---

## 4. TP8 Optimizations

TP=8 introduces 8-rank NCCL communication, which requires optimizations not needed at TP=4.

### 4.1 NCCL Channel Reduction

At TP=8, NCCL defaults to 64 channels — approximately **37 GB of overhead per rank**. Three environment variables reduce this:

| Setting | Value | Effect |
|---|---|---|
| `NCCL_MAX_NCHANNELS` | `8` | 64 → 8 channels (~26 GB saved per rank) |
| `NCCL_BUFFSIZE` | `1048576` | 4 MiB → 1 MiB buffer |
| `NCCL_NVLS_ENABLE` | `0` | GB10 has no NVLink SHARP |

### 4.2 Container Limits

| Setting | Value | Reason |
|---|---|---|
| `ulimit: nofile` | `1048576:1048576` | NCCL 2.30 8-rank socket accept limit |
| `ulimit: memlock` | `-1:-1` | RDMA memory pinning (`ibv_reg_mr`) |
| `ulimit: stack` | `67108864` | 64 MB stack |
| `cap_add: IPC_LOCK` | — | RDMA memory pinning capability |
| `memory_limit` | `112g` | Leave 9 GB for OS (121 GB total) |

Without `memlock=-1:-1` and `IPC_LOCK`, NCCL initialization fails with `ibv_reg_mr_iova2 failed with error Cannot allocate memory`.

### 4.3 NCCL Environment

```yaml
NCCL_IB_ROCE_VERSION_NUM: '2'      # RoCE v2
NCCL_IB_ADDR_FAMILY: 'AF_INET'     # IPv4
NCCL_NVLS_ENABLE: '0'              # No NVLink SHARP on GB10
NCCL_IB_MERGE_NICS: '0'           # No NIC merge
NCCL_CROSS_NIC: '1'               # Cross-NIC
NCCL_IGNORE_CPU_AFFINITY: '1'     # Ignore CPU affinity
NCCL_CUMEM_ENABLE: '0'             # NCCL cumem off
TORCH_NCCL_ASYNC_ERROR_HANDLING: '1'
NCCL_DEBUG: 'WARN'
```

---

## 5. Configuration

### 5.1 TP8-300K (Engram in memory)

| Parameter | Value | Description |
|---|---|---|
| Image | `vllm-dsv41:engram-mem` | Stock Engram handling |
| `tensor_parallel` | 8 | 8 nodes × 1 GPU |
| `gpu_memory_utilization` | 0.80 | 80% GMU |
| `max_model_len` | 300000 | 300K context |
| `max_num_seqs` | 8 | Max 8 concurrent sequences |
| `max_num_batched_tokens` | 8192 | Prefill batch size |
| `block_size` | 128 | KV cache block size |
| `distributed-executor-backend` | mp | Multiprocess backend |
| AutoTuner | off (`VLLM_FLASHINFER_AUTOTUNE: '0'`) | Prevents OOM spike |

### 5.2 TP8-1M (Engram-on-disk)

| Parameter | Value | Description |
|---|---|---|
| Image | `vllm-dsv41:latest` | Engram-on-disk patch active |
| `tensor_parallel` | 8 | 8 nodes × 1 GPU |
| `gpu_memory_utilization` | 0.75 | 75% GMU (lower for 1M KV headroom) |
| `max_model_len` | 1048576 | 1M context |
| `max_num_seqs` | 8 | Max 8 concurrent sequences |
| `max_num_batched_tokens` | 8192 | Prefill batch size |
| `block_size` | 128 | KV cache block size |
| `distributed-executor-backend` | mp | Multiprocess backend |
| `DSV41_ENGRAM_DISK` | 1 | Engram rows on local NVMe |
| AutoTuner | on (default) | Sufficient memory headroom |

### 5.3 Speculative Decoding (both)

```json
{
  "method": "dspark",
  "num_speculative_tokens": 5,
  "draft_sample_method": "probabilistic",
  "rejection_sample_method": "block",
  "enable_adaptive_verification": false
}
```

### 5.4 Launch Command

```bash
# TP8-300K (Engram in memory)
sparkrun run /home/nvidia/.cordatus-sparkrun/recipes/deepseek-v41-flash-tp8.yaml \
  --hosts 192.168.1.153,192.168.1.147,192.168.1.157,192.168.1.158,192.168.1.161,192.168.1.162,192.168.1.166,192.168.1.148 \
  --foreground

# TP8-1M (Engram-on-disk)
sparkrun run /home/nvidia/.cordatus-sparkrun/recipes/deepseek-v41-flash-tp8-1m.yaml \
  --hosts 192.168.1.153,192.168.1.147,192.168.1.157,192.168.1.158,192.168.1.161,192.168.1.162,192.168.1.166,192.168.1.148 \
  --foreground
```

---

## 6. Memory Analysis

### 6.1 TP8-300K (Engram in memory)

| Component | GB/rank |
|---|---|
| Model (GPU) | 49.55 |
| Engram (pinned host) | 23.60 |
| NCCL (8 channels) | ~11 |
| CUDA graphs | ~1.5 |
| **Total** | **~85.5** |
| GMU=0.80 budget | 96.8 |
| **KV cache** | **~8.7 GB** (1.46M tokens) |

### 6.2 TP8-1M (Engram-on-disk)

| Component | GB/rank |
|---|---|
| Model (GPU, without Engram) | 38 |
| NCCL (8 channels) | ~11 |
| AutoTune spike | ~10 |
| CUDA graphs | ~1.5 |
| **Total** | **~60.5** |
| GMU=0.75 budget | 90.75 |
| **KV cache** | **~30 GB** |
| 1M context requirement | ~3.7 GB |
| **Free headroom** | ~26 GB |

The Engram-on-disk configuration leaves significantly more memory for KV cache (~30 GB vs ~8.7 GB), which is what enables 1M context. The trade-off is disk I/O latency per decode step.

---

## 7. Performance Results

### 7.1 TP8-300K (Engram in memory)

Measurements were taken with [CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark).

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Latency (s) | Throughput (RPS) |
|---|---|---|---|---|---|
| 1 | 213.19 | 26.67 | 35.98 | 3.60 | 0.28 |
| 2 | 279.55 | 33.87 | 28.21 | 4.58 | 0.22 |
| 4 | 370.36 | 48.16 | 20.10 | 6.49 | 0.15 |
| 8 | 488.22 | 71.12 | 13.63 | 9.52 | 0.11 |

### 7.2 TP8-1M (Engram-on-disk)

| Concurrency | TTFT (ms) | ITL (ms) | TPS (tok/s) | Latency (s) | Throughput (RPS) |
|---|---|---|---|---|---|
| 1 | 198.54 | 29.06 | 33.28 | 3.89 | 0.26 |
| 2 | 301.32 | 35.92 | 26.76 | 4.86 | 0.21 |
| 4 | 400.58 | 56.68 | 17.07 | 7.60 | 0.13 |
| 8 | 553.68 | 82.54 | 11.74 | 11.04 | 0.09 |

### 7.3 Charts — TP8-300K (Engram in memory)

![TTFT]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-300k-TTFT.png' | relative_url }})

![ITL]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-300k-ITL.png' | relative_url }})

![TPS]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-300k-TPS.png' | relative_url }})

![Latency]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-300k-Latency.png' | relative_url }})

![Throughput]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-300k-Throughput.png' | relative_url }})

### 7.4 Charts — TP8-1M (Engram-on-disk)

![TTFT]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-1m-TTFT.png' | relative_url }})

![ITL]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-1m-ITL.png' | relative_url }})

![TPS]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-1m-TPS.png' | relative_url }})

![Latency]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-1m-Latency.png' | relative_url }})

![Throughput]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/deepseek-v4.1-flash-1m-Throughput.png' | relative_url }})

### 7.5 Assessment

- **TP8-300K is faster than TP8-1M at every concurrency level** for TPS (35.98 vs 33.28 at C=1), despite the 1M configuration having Engram on disk (which should enable CUDA graphs). The 1M context overhead and AutoTuner profiling cost outweigh the CUDA graph benefit at these concurrency levels.
- **TTFT at C=1** is lower for the 1M configuration (199 ms vs 213 ms) — the Engram-on-disk path avoids the host round-trip during prefill.
- **Max C = 4** for both configurations at the Benchmark Explorer's default targets (TTFT≤1000ms, TPS≥15 tok/s) — double the TP4 capacity (Max C=2).
- **TPS decline** from C=1 to C=8: 62% drop (300K), 65% drop (1M) — memory bandwidth contention as the cluster approaches saturation.

---

## 8. Comparative Analysis

### 8.1 TP4 vs TP8 vs B300

| Concurrency | TP4 TPS | TP8-300K TPS | TP8-1M TPS | B300 TPS |
|---|---|---|---|---|
| 1 | 29.48 | **35.98** | 33.28 | 284.54 |
| 2 | 21.32 | **28.21** | 26.76 | 294.56 |
| 4 | 13.09 | **20.10** | 17.07 | 252.60 |
| 8 | 8.79 | **13.63** | 11.74 | 209.41 |

**TP8-300K is 22% faster than TP4 at C=1** (35.98 vs 29.48) and **55% faster at C=8** (13.63 vs 8.79). The scaling is sublinear because the model is memory-bandwidth-bound and TP=8 adds all-reduce overhead across 8 nodes.

**B300 remains ~8× faster than TP8-300K at C=1** (284.54 vs 35.98) — the HBM3e bandwidth difference (~8 TB/s vs 273 GB/s) dominates.

### 8.2 TTFT Comparison

| Concurrency | TP4 TTFT (ms) | TP8-300K TTFT (ms) | TP8-1M TTFT (ms) |
|---|---|---|---|
| 1 | 271.63 | 213.19 | **198.54** |
| 2 | 395.75 | 279.55 | 301.32 |
| 4 | 577.41 | 370.36 | 400.58 |
| 8 | 805.89 | 488.22 | 553.68 |

TP8 reduces TTFT by 21-39% compared to TP4 at all concurrency levels — prefill is compute-bound and 8 ranks provide more aggregate FLOPS.

---

## 9. SLO and Capacity

At the Benchmark Explorer's default targets (TTFT≤1000ms, TPS≥15 tok/s), both TP8 configurations yield **Max C = 4** — double the TP4 capacity (Max C = 2):

| SLO | Threshold | TP8-300K C=4 | TP8-1M C=4 |
|---|---|---|---|
| TTFT | ≤ 1000 ms | 370 ms ✓ | 401 ms ✓ |
| TPS | ≥ 15 tok/s | 20.10 ✓ | 17.07 ✓ |

> **Warning:** At C=8, TPS drops below the 15 tok/s threshold for both configurations (13.63 and 11.74). For interactive chat services, **4 concurrent users** are recommended; for higher loads, data center hardware (B300/GB300) should be preferred.

---

## 10. Lessons Learned

1. **NCCL 8-rank overhead is significant.** The default 64 channels consume ~37 GB/rank. `NCCL_MAX_NCHANNELS=8` and `NCCL_BUFFSIZE=1048576` reduce this to ~11 GB — a critical optimization without which the model cannot fit.
2. **`memlock=-1` and `IPC_LOCK` are mandatory for 8-rank RDMA.** Without them, NCCL initialization fails with `ibv_reg_mr_iova2 failed with error Cannot allocate memory`.
3. **`nofile=1048576` is required for NCCL 2.30.** The 8-rank socket accept exceeds the container's default soft limit of 1024.
4. **Engram-on-disk is paradoxically faster at C=1 for TTFT** (199 ms vs 213 ms) despite disk I/O — because the Engram-on-disk path stages rows before the forward pass, avoiding the host round-trip that stock Engram-in-memory makes on every step.
5. **AutoTuner can cause OOM.** `VLLM_FLASHINFER_AUTOTUNE: '0'` disables FlashInfer autotune but not DeepGEMM/CUTLASS mxfp8_gemm autotune, which consumes ~10 GB during profiling. The 1M configuration has sufficient headroom; the 300K configuration disables it.
6. **sparkrun cluster management.** `sparkrun cluster set-default <name>` changes the active cluster; `sparkrun cluster default` only displays it.
7. **Docker `ENTRYPOINT []` is mandatory.** The stock `vllm/vllm-openai` image has `ENTRYPOINT ["vllm","serve"]`, which prevents sparkrun from appending its command. The final image must clear the entrypoint.

---

## 11. Conclusion

1. **DeepSeek-V4.1-Flash (763B) runs on 8× DGX Spark with TP=8** — the larger cluster doubles the usable concurrency (Max C=4 vs Max C=2 at TP4) and improves TPS by 22-55%.
2. **Two configurations serve different use cases.** TP8-300K (Engram in memory) is faster for bounded-context workloads; TP8-1M (Engram-on-disk) enables the full 1M context ceiling with acceptable performance.
3. **NCCL optimization is the critical TP8 delta.** Without channel reduction and proper ulimits, the 8-rank overhead prevents the model from fitting.
4. **TP8 does not replace data center hardware.** B300 is still ~8× faster at C=1, but TP8 brings the 763B model into the reach of a 4× capacity increase over TP4 — enough for development, prototyping, and limited-team production scenarios.

---

## Appendix A: Verification Commands

### API Health

```bash
curl http://192.168.1.153:8000/v1/models
```

### Simple Test

```bash
curl http://192.168.1.153:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-v4.1-flash","max_tokens":50,
       "messages":[{"role":"user","content":"Count from 1 to 10."}]}'
```

---

*Openzeka Teknoloji A.Ş. — [openzeka.com](https://www.openzeka.com/en) · Tel: +90 312 266 2055*

*Üniversiteler Mah. Şehit Mustafa Tayyarcan Cad. Tepe Binası No:5 İç Kapı No:315, 06800 Çankaya/Ankara, Türkiye*

*This report was generated from measurements produced with the [CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark) tool.*
*Deployment recipe adapted from [tonyd2wild/DeepSeek-V4.1-Flash-vLLM-DGX-Spark](https://github.com/tonyd2wild/DeepSeek-V4.1-Flash-vLLM-DGX-Spark) boot10 config and [im0xMagnus/deepseek-v4.1-flash-uncensored-8x-dgx-spark](https://github.com/im0xMagnus/deepseek-v4.1-flash-uncensored-8x-dgx-spark) TP8 port.*
*Report date: September 2026*
