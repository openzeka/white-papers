---
title: KV Cache Offloading with LMCache in LLM Inference
parent: White Papers
nav_order: 11
lang: en
page_id: kv-cache-offloading-lmcache
date: 2026-10-21
card_tag: "LLM Benchmark"
description: >-
  What LMCache adds to vLLM when the same contexts come back: a three-tier KV
  cache (GPU, CPU, NVMe) on DGX Spark, measured TTFT — 1.95× on repeated
  access, 3.3× after a service restart — and the settings and limits that come
  with it.
permalink: /papers/kv-cache-offloading-lmcache/
last_modified_date: 2026-10-21
toc: true
---

> **Publication date:** October 2026
> **Scope:** What changes in time to first token (TTFT) when LMCache is added to vLLM on a workload that reprocesses the same contexts: the three cache tiers and how a lookup works, a three-repeat A/B measurement on DGX Spark with `nvidia/Qwen3.6-35B-A3B-NVFP4`, what disk records contribute after a service restart, and the settings to verify before production use.
> **Note:** The measured speedups apply to the model, hardware, cache settings and repeated-access workload of Sections 1–3. Workloads without repeated contexts should not expect the same ratio.

{% include company/block.html name="prepared_by" %}

---

{:.no_toc}
## Table of contents

* TOC
{:toc}

---

## Executive Summary

- **The question.** What happens to TTFT when LMCache is added to vLLM on a workload where the same 8,000-token contexts return in later passes? LMCache keeps previously computed KV cache data in tiers beyond GPU memory and reloads it instead of recomputing it; the speedup depends on how much can be reused and what loading it back costs.
- **The setup.** NVIDIA DGX Spark (GB10, SM 12.1, 121 GB unified memory) serving `nvidia/Qwen3.6-35B-A3B-NVFP4` — 22 GB in NVFP4, a hybrid Mamba/GDN and MoE architecture, 35B total and 3B active parameters — with vLLM 0.25.1 + LMCache 0.5.1. The workload is 665 contexts of 8,000 tokens, about 5.3 million tokens, processed twice: once to fill the cache, once to measure. Requests are sent sequentially, one at a time.
- **The measured result.** Median TTFT over three runs falls from **1,279.1 ms** with vLLM alone to **655.2 ms** with vLLM + LMCache — a **1.95× speedup**, about 49% lower TTFT. All three runs agree: 1,276–1,289 ms against 653–656 ms.
- **Why it applies here.** The working set is about 63 GB against a 55.31 GiB GPU KV cache (`fp8`), so the GPU cache alone cannot hold it; the second pass therefore retrieves data from CPU memory and disk instead of recomputing it. Where contexts are used only once, this gain should not be expected.
- **After a service restart.** With the disk records still present and matching, the same workload completes in **2.61 s** instead of the **8.51 s** cold start — about **3.3×**. A record on disk only helps if it matches the request and loads back successfully.
- **Multiple vLLM instances sharing one cache** is what the multi-process (MP) architecture allows, but it is not measured here: the experiment ran a single vLLM instance. Load balancing across instances is a separate mechanism; LMCache is not one.

---

## 1. Purpose and Method

### 1.1. Research question

This experiment measures how the time to first token (TTFT) changes when LMCache is added to vLLM, on a workload that reprocesses the same contexts.

LMCache aims to reduce the need to reprocess a context by keeping previously computed KV cache data in tiers outside GPU memory as well. The speedup it delivers, however, depends on whether the cached data can be reused and on what it costs to load that data back.

### 1.2. Workload

The test uses 665 different contexts, each 8,000 tokens long — about 5.3 million tokens in total.

The experiment runs in two passes:

- **Pass 1 — filling the cache:** the contexts are processed and cache records are created.
- **Pass 2 — measuring performance:** the same contexts are revisited and TTFT is measured.

The comparison uses two scenarios:

- **Scenario A:** vLLM alone.
- **Scenario B:** vLLM + LMCache.

Requests are sent sequentially, and only one request is processed at a time. This keeps the results as separate as possible from the additional effects that concurrent requests would introduce.

---

## 2. Setup and Cache Architecture

### 2.1. Cache layers

In this setup the cache is managed over three tiers.

| Layer | Capacity | Role |
| --- | --- | --- |
| L0 | 55.31 GiB GPU KV cache (`fp8`) | The fastest cache; vLLM keeps it in GPU memory |
| L1 | 20 GB CPU memory | Intermediate cache outside the GPU |
| L2 | NVMe SSD; `fs` adapter with `use_odirect=true` | The tier where KV data is stored on disk |

LMCache's basic function is to keep reusable KV data in these tiers and, when it is needed, load the same data back from the cache instead of recomputing it.

**Lookup in the cache:** A request's data is searched first in the GPU cache (L0), then in CPU memory (L1), and in the disk tier (L2). Metadata and index information are used to decide whether a record exists on disk. When a record is found, the KV data itself still has to be read and transferred. A record being on disk therefore does not mean it reaches the GPU instantly and free of cost.

**Storing KV data:** During the experiment, the computed KV data was observed to be written to L1, while writing to L2 continued asynchronously. The share of disk writes in the TTFT measurement is therefore judged to be low. This observation does not mean that disk writing costs nothing on every workload or at every record size.

During cold requests, the number of disk writes observed over about 25 requests was reported as about three files per request. This measurement is limited to the experimental conditions used.

**Eviction from the cache:** When L1 usage reaches the configured threshold, eviction starts. `--eviction-ratio` determines how much memory is emptied in each eviction cycle. The experiment used `0.99`. This is not the default recommended for production.

**Records accumulating on disk:** With the `fs` adapter used, neither the automatic deletion of old records nor the reclaiming of disk space by itself was observed in this experiment. In a check made on 19 October 2026, about 377 records and 32 GB of data left over from the 6–15 October period were still on disk.

This observation shows that disk records can accumulate in the configuration used. How the lookup cost changes as the number of records grows should be measured separately.

### 2.2. Settings held fixed through the experiment

| Setting | Value |
| --- | --- |
| KV data type and block size | `fp8`, `block_size=2144`, `--chunk-size 2144` |
| Batched prefill token limit | `--max-num-batched-tokens 4287` (`2N−1`) |
| Hybrid model cache | `--mamba-cache-mode align` |
| vLLM prefix cache | `--enable-prefix-caching` |
| Eviction policy | `LRU` |
| Eviction threshold | `--eviction-trigger-watermark 0.80` |
| Eviction ratio | `--eviction-ratio 0.99` |
| Speculative decoding | MTP, 3 speculative tokens |
| Wait between passes | 5 seconds |
| Wait after the container starts | 10 seconds |

> **Important:** `--eviction-ratio 0.99` was used to make the cache running out of capacity explicit in the experiment. With the default `0.20` used in production, eviction behavior may differ.

### 2.3. Launch commands

#### Scenario A — vLLM alone

```bash
docker run -d --name bench-vllm-off \
  --gpus all --ipc=host --network host --shm-size 32g \
  --memory 112g --memory-swap 112g \
  -v /home/nvidia/.cache/huggingface:/home/nvidia/.cache/huggingface \
  -v /home/nvidia/.triton:/home/nvidia/.triton \
  -e HF_HOME=/home/nvidia/.cache/huggingface \
  -e HF_HUB_OFFLINE=1 \
  -e VLLM_USE_RUST_FRONTEND=1 \
  vllm/vllm-openai:latest \
  nvidia/Qwen3.6-35B-A3B-NVFP4 \
    --host 0.0.0.0 --port 8100 \
    --served-model-name qwen3.6-35b-a3b \
    --trust-remote-code --tensor-parallel-size 1 \
    --enable-auto-tool-choice --tool-call-parser qwen3_coder --reasoning-parser qwen3 \
    --mm-encoder-tp-mode data --language-model-only \
    --kv-cache-dtype fp8 --attention-backend flashinfer --moe-backend marlin \
    --gpu-memory-utilization 0.5 --max-model-len 262144 \
    --max-num-seqs 16 --max-num-batched-tokens 4287 \
    --enable-chunked-prefill --async-scheduling --enable-prompt-tokens-details \
    --mamba-cache-mode align --load-format fastsafetensors \
    --speculative-config '{"method":"mtp","num_speculative_tokens":3,"moe_backend":"triton"}' \
    --enable-prefix-caching
```

#### Scenario B — vLLM + LMCache

The LMCache server is started first:

```bash
docker run -d --name bench-lmcache \
  --gpus all --ipc=host --network host \
  -v /home/nvidia/kv-cash-exp/lmcache-l2:/home/nvidia/kv-cash-exp/lmcache-l2 \
  --entrypoint /usr/local/bin/lmcache \
  vllm/vllm-openai:latest \
  server --host 127.0.0.1 --port 5555 --http-port 8080 \
    --chunk-size 2144 \
    --l1-size-gb 20 --l1-init-size-gb 4 \
    --eviction-policy LRU --eviction-trigger-watermark 0.80 --eviction-ratio 0.99 \
    --supported-transfer-mode lmcache_driven \
    --l2-adapter '{"type":"fs","base_path":"/home/nvidia/kv-cash-exp/lmcache-l2","relative_tmp_dir":".tmp","use_odirect":true}'
```

Then vLLM is started with the model and inference settings of Scenario A. The only difference is the following LMCache connection configuration:

```bash
--kv-transfer-config '{"kv_connector":"LMCacheMPConnector","kv_role":"kv_both","kv_connector_extra_config":{"lmcache.mp.host":"127.0.0.1","lmcache.mp.port":5555,"lmcache.mp.mq_timeout":300}}'
```

This configuration makes vLLM use LMCache's multi-process (MP) connector.

**Startup order:** The LMCache server is started first and the `/healthcheck` endpoint is verified to answer healthy. Then vLLM is started, and 10 seconds pass before the measurement.

**Keeping the scenarios apart:** Only `bench-vllm-off` runs in Scenario A; `bench-lmcache` and `bench-vllm-on` run in Scenario B.

After the experiment, the containers can be removed with:

```bash
docker rm -f bench-vllm-off bench-vllm-on bench-lmcache
```

---

## 3. Results

The working set of about 63 GB exceeds the GPU KV cache capacity of 55 GB. Performance was measured in the second pass, when the same contexts were revisited.

| Measurement | A: vLLM alone | B: vLLM + LMCache | Speedup |
| --- | ---: | ---: | ---: |
| **Median TTFT over three runs** | **1,279.1 ms** | **655.2 ms** | **1.95×** |
| TTFT of the first run | 1,461.6 ms | 743.0 ms | 1.97× |

The TTFT ranges observed over the three runs are:

- **Scenario A:** 1,276–1,289 ms
- **Scenario B:** 653–656 ms

In all three runs, Scenario B's TTFT came out lower than Scenario A's.

The results show that LMCache reduced median TTFT by about 49% under these experimental conditions. Put another way, time to first token improved about 1.95×.

This result is valid only for the tested model, hardware, cache settings and repeated-access workload. The same speedup ratio should not be assumed for other workloads.

---

## 4. Evaluation

### 4.1. TTFT falls when the same contexts are revisited

When the working set exceeds the GPU KV cache capacity, loading previously computed KV data back from a cache can be faster than recomputing the same context.

In this experiment the median TTFT over three runs was measured as 1,279.1 ms in Scenario A and 655.2 ms in Scenario B: about a **1.95× speedup** with LMCache.

This result matters especially for the following workloads:

- Agent systems, where long contexts are used over multiple turns.
- Code analysis applications, where the same code base is examined again and again.
- Systems where similar contexts are reused by different users or sessions.

Conversely, workloads where contexts are used only once should not expect the same gain. The real performance difference is determined by the cache hit rate, the time to load data back and the cost of recomputation.

### 4.2. The disk cache's contribution after a service restart

If the KV records on disk are preserved and match new requests, they can still be used after the service restarts. Data computed earlier can then be reused.

In this experiment, the same workload took 8.51 s from a cold start, and 2.61 s after a restart when the disk records were used — about a **3.3× speedup**.

This result shows that the disk cache can keep helping after a restart. The advantage, however, depends on the behavior of the storage adapter, the validity of the records and the data being loaded back successfully.

**A record being on disk does not mean it can necessarily be used.** The record has to match the request and load back successfully.

### 4.3. Multiple vLLM instances sharing one cache

The multi-process (MP) architecture lets one LMCache server serve several vLLM instances. Under suitable conditions, different vLLM instances can reuse KV records found in the shared L1 CPU memory or, if configured, in the L2 disk tier.

This architecture has three main advantages.

**1. The cache is shared between vLLM instances.**

A context processed by one vLLM instance can, under suitable conditions, be used in another instance's request as well. The need to recompute the same context in every instance can then decrease.

**2. GPU memory is used more efficiently.**

The need to hold the same contexts in each vLLM instance's GPU cache separately can decrease. Where several instances of the same model run, this approach has the potential to reduce total GPU memory needs.

LMCache does not eliminate GPU memory needs altogether, however. Loading data back from the cache still requires memory to transfer it to the GPU and use it.

**3. Cache management is centralized.**

L1 capacity, L2 storage and cache operations can be managed through a separate LMCache service. In systems with several inference instances, this approach can make management easier.

Making use of these advantages requires that the vLLM instances run with compatible models, tokenizers, KV layouts and cache configurations. How requests are distributed across instances, the capacity of the LMCache server and the validity of the records also affect performance.

**Important limitation:** LMCache alone is not a load balancer. Distributing requests across vLLM instances must be provided by a separate mechanism. Several instances connecting to one LMCache server also increase the load on CPU, memory, network and disk. As the system grows, these resources must be monitored.

This experiment used a single vLLM instance. The contribution of shared cache use across several instances to performance was therefore not measured directly. This capability is an additional usage option that the LMCache MP architecture can provide, not a performance result proven by the experiment.

### Overall assessment

The experiment shows that LMCache can lower TTFT on workloads that exceed the GPU KV cache capacity and reuse the same contexts.

The records on disk can still be usable after a service restart, under suitable conditions. Several vLLM instances sharing one cache may bring additional advantages in larger deployments. But to determine the performance contribution of this last usage scenario, a separate test with several instances is needed.

---

## 5. LMCache Installation: Settings to Verify and Production Recommendations

This section covers the requirements from the official documentation for the multi-process LMCache setup and for Qwen hybrid models, together with the settings used in the experiment.

**The settings used in the experiment are not the settings recommended for production.** Eviction ratio, hybrid model support and the lifecycle of records in particular should be evaluated again before production use.

Official sources:

- [LMCache — Deployment Guide](https://docs.lmcache.ai/mp/deployment.html)
- [LMCache — Configuration Reference](https://docs.lmcache.ai/mp/configuration.html)
- [LMCache — Qwen3.5 / Qwen3.6 / Qwen3.8 model recipe](https://docs.lmcache.ai/recipes/qwen3_5.html)
- [LMCache — Quick Start](https://docs.lmcache.ai/mp/quickstart.html)

### 5.1. Multi-process setup and connection settings

In MP mode, the LMCache cache server runs as a separate process from the vLLM inference process. vLLM connects to this server through `LMCacheMPConnector`, so cache management and storage operations run in another process.

| Topic | Requirement or explanation |
| --- | --- |
| Connector | `LMCacheMPConnector` |
| KV role | `kv_role=kv_both` |
| Communication | ZMQ by default; default port `5555` |
| HTTP health check | Default port `8080` when the HTTP server is enabled; the `/healthcheck` endpoint |
| Prometheus metrics | Default port `9090` |
| Container network | `--network host` can be used for connections on the same host |
| IPC | Traditional CUDA IPC transfer needs `--ipc=host`; isolated IPC is a separate setup option |

**Startup order:** The LMCache server must start first, then a successful health check must be verified, and only then should vLLM run. Verifying that the health check actually succeeds is more reliable than waiting a fixed amount of time.

`--network host` and `--ipc=host` serve different purposes:

- `--network host` lets the container use the host's network configuration. In this experiment it makes it easy for vLLM to reach LMCache at `127.0.0.1:5555`.
- `--ipc=host` provides access to the shared `/dev/shm` area in the traditional IPC configuration and may be needed in the relevant CUDA IPC transfer scenarios.

These two options are not interchangeable.

#### The isolated IPC option

LMCache's `--isolated-ipc` option can allow two containers to work without a shared `/dev/shm` area, with the CUDA IPC mechanisms that support it.

If this option is used:

- The LMCache server must be started with `--isolated-ipc`.
- On the vLLM side, `lmcache.mp.isolated_ipc=true` must be set.
- Both sides must use the same IPC mode. Mismatched modes can cause transfer errors.
- Compatibility with the CUDA memory allocator and features such as vLLM sleep mode must also be checked.

It should not be assumed that isolated IPC is faster or more suitable in every setup. This method differs from the traditional configuration used in the experiment and must be tested separately.

### 5.2. What to watch in hybrid Mamba/GDN models

The relevant models in the Qwen3.5, Qwen3.6 and Qwen3.8 families combine full attention layers with Mamba/Gated-DeltaNet (GDN) layers.

In these architectures, not only the classic attention KV blocks but also the recurrent state information must be cached. vLLM and LMCache settings being compatible with each other therefore matters.

The relevant Qwen hybrid model recipe highlights three settings:

1. `--mamba-cache-mode align` on the vLLM side.
2. `--enable-prefix-caching` on the vLLM side.
3. A chunk size suited to the model and `--separate-object-groups` on the LMCache side.

#### How is the block size N determined?

`N` is not a constant that holds for every model. It must be determined from the model and the vLLM configuration.

A line like the following should be looked for in the vLLM startup logs:

```text
Setting attention block size to N tokens
```

In this experiment, `N = 2144` was used. When reproducing the experiment, this value must be verified against the startup logs.

Values of `784` and `544` given in the official recipes for other models must not be applied to this model directly.

#### Why does `--separate-object-groups` matter?

In hybrid models, `--separate-object-groups` makes Mamba state data be managed in separate cache object groups. The relevant Qwen hybrid model recipe considers this option necessary.

In the main experiment this option was kept off. The reason is that it does not appear in LMCache's prefix-suffix-tuner benchmarking recipe, and no additional variable was wanted in the main A/B comparison.

The option was also tested on and off. No measurable difference in TTFT was observed in this comparison; the median speedup stayed about 1.95×.

This result does not mean the option is ineffective under all conditions. No performance difference was observed in the tested workload; possible effects on record correctness and cache hit rate must be evaluated separately.

**Recommendation:** For production use, the `--separate-object-groups` option should be enabled to comply with the official Qwen hybrid model recipe, and correctness and cache hit rate should be retested.

#### The `--chunk-size` and `--max-num-batched-tokens` settings

LMCache's `--chunk-size` value must be compatible with the unified block size vLLM uses. The connector can raise the configured minimum chunk size to a larger value based on the model's KV layout. The command-line value alone should therefore not be trusted; the startup logs must be examined as well.

In hybrid models, the `--max-num-batched-tokens` setting affects prefill and decoding running together.

| `--max-num-batched-tokens` value | Expected behavior |
| --- | --- |
| `N` | Only one block of budget may remain per scheduler step. Starting the prefill of a new request while decoding continues can become difficult, and concurrency can drop seriously. |
| Between `N` and `2N`; for example `2N−1` | Allows one block of progress per step while leaving extra budget for prefill and decoding to run together. |
| `2N` or more | Larger prefill steps can be used. But the boundaries where cache state is saved can become rarer, and prefix reuse can become coarser. |

In this experiment, with `N = 2144`, `2N−1 = 4287` was used. This choice is compatible with the approach in the relevant hybrid model recipe. When a different model or block size is used, the value must be recalculated.

The relevant Qwen hybrid model recipe reports about a 7× slowdown in a test with low cache hit rate or cold cache when `max-num-batched-tokens=N` is used. This ratio does not hold for every workload; it is one example of how much losing concurrency can affect performance under particular conditions.

**Extra check:** If the error `max_num_seqs exceeds available Mamba cache blocks` appears at vLLM startup, `--max-num-seqs` must be reduced or, if the memory limits allow it, `--gpu-memory-utilization` must be raised.

### 5.3. L1 capacity and eviction policy

When setting L1 capacity, the memory needs of the operating system, vLLM and other processes must be accounted for as well, not only those of LMCache.

Raising L1 capacity can increase the probability that reused records remain in CPU memory and can reduce the need to reach L2. But a capacity that exceeds the system's available memory must not be chosen.

| Setting | Explanation and recommendation |
| --- | --- |
| `--l1-size-gb` | Should be set after leaving enough memory for the operating system and vLLM. |
| `--l1-init-size-gb` | Determines the L1 memory reserved at startup. Actual memory consumption must be verified along with the capacity. |
| `--eviction-policy LRU` | Evicts the least recently used records first. |
| `--eviction-trigger-watermark 0.8` | Starts eviction when L1 usage reaches the threshold. The documented default is `0.8`. |
| `--eviction-ratio 0.2` | Determines how much memory is emptied in each eviction cycle. The documented default is `0.2`. |
| `--max-workers` | Sets the thread count of the base worker pools; the default is `1`. |
| `--max-gpu-workers` | Adjusts the GPU-related worker pool. Should be evaluated against the workload where several vLLM instances use the same LMCache server. |
| `--max-cpu-workers` | Adjusts the worker pool for lookup and other CPU-heavy work. |

Eviction threshold and eviction ratio have different functions: the threshold decides when eviction starts; the ratio decides how much space is freed in each eviction cycle.

If eviction happens often, L1 capacity, cache hit rate and memory usage trends should be examined first. The threshold or the eviction ratio can be changed when needed. But since these changes affect which records the cache keeps and how often L2 is consulted, they should be measured and chosen in the production environment.

The `0.99` ratio used in this experiment was chosen to make cache overflow explicit. It must not be taken as the default recommended for production.

### 5.4. Transfer mode and monitoring

LMCache MP offers several methods for transferring KV data:

- **`lmcache_driven`:** LMCache server manages the STORE/RETRIEVE transfer. It supports CUDA IPC and shared CPU memory, and is the default in an MP setup.
- **`engine_driven`:** Uses the PREPARE/COMMIT-based transfer path. It can be used in CPU or non-CUDA accelerator scenarios.
- **`auto`:** Loads both transfer paths. It can be used in setups where workers from different device types connect.

The transfer mode must be chosen according to the hardware and connector requirements. `lmcache_driven` was used in this experiment.

#### Health check and metrics

After the LMCache server starts, the following checks should be made:

1. Verify that the `/healthcheck` endpoint answers healthy.
2. Check that vLLM connected to the LMCache server successfully.
3. Examine the startup logs for how the chunk size was determined and for cache store operations.
4. Use the Prometheus metrics to monitor storing, loading back, cache hit rate and memory usage.
5. Use `LMCACHE_LOG_LEVEL=DEBUG` during first installation and debugging. Return to `INFO` in production once the system works stably.

The MP server's Prometheus metrics are served on port `9090` by default. But this port being reachable alone does not prove that all metrics are collected correctly. The monitoring system's access and the scope of the measurements must be verified as well.

### 5.5. The lifecycle of KV records and disk management

KV records being on disk does not guarantee that they stay valid or usable indefinitely. The storage adapter's behavior for deleting records, evicting them and reclaiming disk space must be examined separately.

With the `fs` configuration used in this experiment, old records were observed to accumulate. In production, the following checks should therefore be made:

- Disk usage and free space must be monitored regularly.
- The conditions under which KV records become invalid must be determined.
- The deletion and space-reclaiming mechanisms the adapter supports must be verified.
- It must be tested that old records can still be found after a service restart and can be loaded back successfully.
- Different models, block sizes or incompatible attention backend configurations must be prevented from using the same records.

**A record being on disk does not mean a cache hit occurred.** The record must match the request, be compatible with the configuration, and load back successfully.

### 5.6. Acceptance test: storing and retrieving KV data

Before production use, measuring TTFT alone is not enough. An acceptance test must also show that the cache really creates records and uses those records in later requests.

The recommended test steps are:

1. Start vLLM and LMCache with a fixed model, tokenizer, attention backend and block configuration.
2. Run a first pass with a fixed set of requests.
3. Verify from the logs and metrics that LMCache records were created.
4. Using the method the vLLM version supports, clear vLLM's local prefix cache. Check separately whether the external LMCache records are preserved. The goal is to test loading the data back while keeping the LMCache records.
5. Send the same requests again and verify that LMCache load-back operations take place.
6. Record TTFT and, where possible, the cache hit rate.
7. Repeat the test under cold-cache, warm-cache and service-restart conditions.

#### Correctness check

In hybrid GDN models, it must not be assumed that generation loaded back from the cache will be identical token by token to cold generation.

The relevant LMCache recipe takes score-level equivalence rather than bit-level equality as the criterion for these models. Correctness evaluation should therefore use a test set suited to the model and predetermined tolerances.

If an API such as `POST /reset_prefix_cache` is to be used, it must be verified that this endpoint is enabled in the relevant vLLM version and that the call affects only the intended local cache. Without checking version and configuration, it must not be assumed that this call definitely preserves the external LMCache records.

### 5.7. Support status and limitations

| Topic | Assessment |
| --- | --- |
| Bit-level equality | Not guaranteed for hybrid GDN models. Score-level correctness evaluation must be done. |
| Portability of KV data | Records depend on settings such as the attention backend and kernel block size. Sharing between different configurations must not be done without verification. |
| CacheGen and CacheBlend | The relevant hybrid model recipe states that they are not supported. Opaque byte-level records may not be suitable for content-based operations. |
| Mamba prefix cache in `align` mode | Marked experimental in the relevant official recipe. |
| Image and video KV data | Behavior verified for text generation does not mean image and video caching is verified too. |
| Use with SGLang | Not presented as a verified LMCache integration in the relevant Qwen hybrid model recipe. |

These limitations do not mean LMCache does not work in general. They show which features are verified with which model and integration. Production decisions should take this support scope into account.

---

## 6. Limits of the Experiment and Generalizability

- The main performance measurement was made with synthetic requests of 8,000 tokens each. The results do not represent all properties of real chat and code content.
- The test is limited to three repeats, one model and one hardware configuration. The speedup ratio obtained can change with different models, concurrency levels or cache settings.
- `--eviction-ratio 0.99` is an experiment setting used to make cache overflow explicit. With the default `0.20` used in production, cache behavior may differ.
- Preserving the disk records and the contribution they give after a service restart depend on the storage adapter and the validity of the records.
- This report measures TTFT primarily. Before making a production decision, output correctness, long-term stability, memory consumption and disk space management must also be verified.
- The gain that several vLLM instances sharing one LMCache server might bring was not measured in this experiment. A separate multi-instance test is needed for this usage scenario.

---

## 7. Resources

1. LMCache — [Deployment Guide](https://docs.lmcache.ai/mp/deployment.html)
2. LMCache — [Configuration Reference](https://docs.lmcache.ai/mp/configuration.html)
3. LMCache — [Qwen3.5 / Qwen3.6 / Qwen3.8 model recipe](https://docs.lmcache.ai/recipes/qwen3_5.html)
4. LMCache — [Quick Start](https://docs.lmcache.ai/mp/quickstart.html)

The official documentation was reviewed as of October 2026. Because LMCache MP and hybrid model support can change between versions, compatibility with the version and configuration used must be checked again when reproducing the experiment.

---

{% include company/block.html name="cta_logo" %}

**Let's plan your LLM infrastructure together.** For hardware sizing and a cache architecture that accounts for KV cache tiering and eviction, {% include company/block.html name="contact_cta" %}