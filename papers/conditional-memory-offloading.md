---
title: Engram Offloading in LLM Inference
parent: White Papers
nav_order: 2
lang: en
page_id: conditional-memory-offloading
date: 2026-09-29
card_tag: "Technical Guide"
description: >-
  Engram tables are large but read only a few rows per token, so they
  can move from GPU memory to host RAM or NVMe. What that means on DGX
  Spark, RTX PRO 6000 and DGX B300, and measured results with
  DeepSeek-V4.1-Flash and Qwen3.8-Flash-Next.
permalink: /papers/conditional-memory-offloading/
last_modified_date: 2026-10-05
toc: true
---

> **Publication date:** September 2026 (revised October 2026)
> **Scope:** What Engram tables are, why their access pattern lets them leave GPU memory, where they can go on DGX Spark, RTX PRO 6000 and DGX B300, and what offloading them achieves. Evaluated with OpenZeka measurements of DeepSeek-V4.1-Flash and Qwen3.8-Flash-Next.
> **Note:** Model names, software versions and measured results are valid as of September 2026. Support for offloading in inference engines is changing quickly; the enduring question is how much data each step needs and when it must arrive.

---

{:.no_toc}
## Table of contents

* TOC
{:toc}

---

## Executive Summary

- **Two recent models carry a very large embedding table.** DeepSeek-V4.1-Flash (*Engram*) and Qwen3.8-Flash-Next (*n-gram embeddings*, called PLE in SGLang) both add a lookup table of learned vectors addressed by short sequences of input tokens; this paper calls both **Engram tables**. DeepSeek's table holds 196B parameters; Qwen's holds 51B.
- **The table is large, but it is read conditionally.** For each token, only the few rows that match its recent tokens are read: about 2.5 KB for Qwen and 12 KB for DeepSeek. The rest of the table is not touched. DeepSeek's Engram paper calls this *conditional memory*.
- **That access pattern is what makes offloading work.** A table that needs a lot of storage but very little bandwidth can be moved to a slower, larger tier (host RAM or NVMe) while the computation stays on the GPU. The row addresses come from token IDs, so they are known before the layer runs and the rows can be fetched ahead of time. GPU memory then holds the rest of the model, so a larger model fits on the same device.
- **Where the table goes depends on the device's memory design.** On **DGX Spark** (unified memory) host RAM and GPU memory are the same pool, so the table goes to NVMe. On **RTX PRO 6000** (dedicated GPU memory) it goes to pinned host RAM across PCIe. On **DGX B300**, the four-GPU DeepSeek configuration has enough GPU memory to hold it.
- **Measured results:** the tested 763B DeepSeek-V4.1-Flash configuration runs on 4× DGX Spark by placing its Engram tables on NVMe; on 8× DGX Spark, moving them to NVMe increased the reported KV-cache allocation by ~21 GB per node and raised the configured context limit from 300K to 1M tokens. Qwen3.8-Flash-Next, with a 132.7 GB quantized checkpoint, runs on a single DGX Spark and a single RTX PRO 6000, with measured performance suitable for interactive use at the concurrency levels discussed below.
- **What it adds up to:** a model with an Artificial Analysis Intelligence Index of 39.8 runs on **one DGX Spark at 28.5 tok/s per request**, for an estimated 8 chat or 3 agentic users, and on **one RTX PRO 6000 at 155.8 tok/s**, for an estimated 64 chat or 24 agentic users ([LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}) estimates; Section 6.2).
- **Sizing consequence:** budget GPU memory for the remaining weights, KV cache, recurrent state and runtime buffers; budget the offloaded table in host RAM or NVMe. If more models adopt this design, the same device could run larger models than its GPU memory alone would suggest.

---

## 1. Introduction

The [Local LLM Usage Guide]({{ '/papers/local-llm-guide/' | relative_url }}) sizes hardware by GPU memory: model weights, KV cache, recurrent state and runtime buffers must fit. That budget treats all weights alike. Engram tables are an exception: they are a large share of the parameters, but each token reads only a tiny part of them. Keeping them outside GPU memory can make an otherwise oversized model practical on the same device.

This paper first contrasts what an LLM computes on every token with what it only looks up, and what that means for memory (Section 2); then where the table can be placed on each device (Section 3) and what OpenZeka's DeepSeek-V4.1-Flash and Qwen3.8-Flash-Next runs on DGX Spark and RTX PRO 6000 show (Sections 4 and 5). Launch instructions remain in the linked deployment papers and the SGLang cookbook.

---

## 2. Computation vs Conditional Memory

### 2.1. What an LLM computes for each token, and what that requires in GPU memory

An LLM generates text one token at a time. Each new token is turned into a vector and passed through every layer of the model. In each layer:

- **Attention** compares the token with the tokens before it. To avoid recomputing the past, their keys and values are kept in the **KV cache**, which grows with context length and the number of concurrent requests.
- **The feed-forward network** multiplies the vector by large learned weight matrices. In a Mixture-of-Experts (MoE) model, a router picks a few experts per token and only their matrices are used, but each one in full.

So producing one token means a full pass through the model: every dense weight matrix, every selected expert and the KV cache are read **at every decode step**. That is why all of them must sit in GPU memory: reading them over a slower link at every step would make that link the bottleneck. The memory requirement is therefore *weights + KV cache + runtime buffers*, and at small batch sizes decode speed is roughly *memory bandwidth ÷ bytes read per token*.

| Data | Read per token | If moved off the GPU |
|---|---|---|
| **Dense weights** | Every matrix, every step | The transfer link becomes the bottleneck |
| **MoE experts** | Selected experts in full; the selection is known only during the forward pass | Smaller active set, but a miss is expensive and there is little advance notice |
| **KV cache and recurrent state** | Read (recurrent state also updated) at every decode step; KV traffic grows with context | Long contexts create heavy transfer traffic |
| **Engram tables** | A few rows, addressed from token IDs | Small transfers that can be fetched ahead of time |

The last row is the exception this paper is about.

### 2.2. What "conditional" means, and what it changes in memory requirements

An **embedding table** maps a key to a learned vector. An ordinary input embedding maps each token ID to one row. An Engram table does the same for short sequences of tokens (**n-grams**). DeepSeek introduced it as *Engram* in the [Engram paper](https://arxiv.org/abs/2601.07372); Qwen calls its version n-gram embeddings, and SGLang calls the table PLE. This paper calls both **Engram tables**.

**What Engram does for the model.** Much of language consists of fixed, local patterns: names, set phrases, common word combinations. A standard Transformer has no lookup operation for these; it reconstructs them through computation in its early layers, for every token. Engram stores such patterns in a learned table and retrieves them by lookup. The Engram paper argues that this leaves more of the network's depth for reasoning, and presents it as a complementary axis of sparsity to MoE: MoE is *conditional computation* (only some experts run), Engram is *conditional memory* (only some rows are read).

*Conditional* therefore means that a row is read only when the input calls for it. The table as a whole is large, but a token reads only the handful of rows that match its recent tokens; the rest is not touched. The table is looked up, not computed with.

That splits the memory requirement in two:

- **What is computed with on every token** (weights, KV cache) needs **capacity and bandwidth**, so it must be in GPU memory.
- **What is only looked up conditionally** (the Engram table) needs **capacity, but almost no bandwidth**, so it can go to a slower, larger tier such as host RAM or NVMe.

| Property | What it means | Consequence |
|---|---|---|
| **Large storage** | Tens to hundreds of billions of parameters | Takes a large share of GPU memory if kept there |
| **Sparse, conditional access** | A few kilobytes read per token, out of tens or hundreds of GB | A slower tier is fast enough |
| **Addresses known early** | Rows are chosen from token IDs, not from the model's computation | Rows can be fetched while earlier layers run |

GPU memory then only has to hold the part of the model that is computed with, so a larger model fits on the same device. For scale: each decode step in Qwen3.8-Flash-Next reads gigabytes of active weights, against 2.5 KB from its table.

### 2.3. How a lookup works

1. **Form the key.** Take the recent token IDs: two for a bigram, three for a trigram. For example, IDs `[a, b, c]` give the suffixes `[b, c]` and `[a, b, c]`.
2. **Hash into the table.** Each hash head turns that sequence into a row address. Several heads give several vectors, so a collision in one head does little harm. No search is needed.
3. **Fetch the rows.** Read the addressed rows and concatenate them. The table is fixed learned data; it is not a conversation cache or a document database.
4. **Combine on the GPU.** Projections transform the retrieved vector, and a gate computed from the current hidden state decides how much it contributes. Only this step needs the GPU; the table itself can live elsewhere.

Qwen's [n-gram embedding design](https://arxiv.org/html/2608.30320#S2.SS3) follows the same approach as the [Engram architecture](https://arxiv.org/html/2601.07372v2#S2).

| | Qwen3.8-Flash-Next | DeepSeek-V4.1-Flash |
|---|---|---|
| Table size | ~51.2 GB (47.7 GiB), FP8 | ~196.6 GB, FP8 |
| Rows read per token | 16 (2 n-gram orders × 8 heads, one layer) | 48 (3 n-gram orders × 8 heads, two layers) |
| Bytes read per token | 16 × 160 B ≈ **2.5 KB** | 48 × 256 B ≈ **12 KB** |

Adding rows to the table adds parameters without adding reads per token.

**Why prefetching works.** Row addresses depend only on token IDs, which are known before the forward pass: the whole prompt during prefill, and the current token during decode. Placing the table after the first layers (zero-based layer 2 in Qwen, layers 1 and 14 in DeepSeek) gives the fetch time to overlap computation. Whether it finishes in time depends on the engine and the memory tier.

---

## 3. Where the Table Can Go

The cost of an offloaded read is roughly **bytes ÷ link bandwidth**, plus latency and software overhead; only the part not hidden behind computation slows the model. At 2.5–12 KB per token, even PCIe Gen5 x16 (about 64 GB/s per direction in theory) moves a token's rows in well under a microsecond. For small scattered reads, latency and caching matter more than peak bandwidth, and file-backed tables also depend on whether the page is already cached.

Which destination actually frees GPU memory depends on the memory design:

- **Dedicated GPU memory (RTX PRO 6000, DGX B300).** The CPU has separate system RAM across PCIe. Moving the table there frees GPU memory. The implementation used here allocates it in **pinned (page-locked) host memory**, which the GPU can read directly.
- **Unified memory (DGX Spark).** The GB10 CPU and GPU share one 128 GB LPDDR5X pool. There is no separate host RAM, so placing the table "in host memory", pinned or not, still uses the same 128 GB. Only moving it out of memory, to local NVMe, frees space. The GPU reads the memory-mapped file through the host page tables; recently used pages stay cached in the shared pool.

| | DGX Spark (GB10) | RTX PRO 6000 Blackwell | DGX B300 |
|---|---|---|---|
| Memory design | 128 GB pool shared by CPU and GPU | 96 GB dedicated GPU memory, separate host RAM | Eight GPUs with dedicated HBM, separate host RAM |
| GPU memory bandwidth | 273 GB/s | 1.79 TB/s | 8 TB/s per GPU |
| Table location | Local NVMe with an in-memory page cache | Pinned host RAM over PCIe | Stored in GPU memory in the four-GPU DeepSeek configuration |
| Sizing consequence | Allow for OS, page cache and runtime in the shared pool | Budget host RAM separately from GPU memory | Sufficient GPU memory for these checkpoints in multi-GPU configurations |

**Evidence that the mechanism works.** In the Engram paper's H800 experiment, adding a 100B-parameter table held in host memory to 4B and 8B dense backbones reduced throughput by only about 1.9% and 2.8%, with the fetch overlapped with the first block ([Engram, §6.4](https://arxiv.org/html/2601.07372v2#S6.SS4)). Offloading does not change the table's values: the GPU receives the same rows, so the model computes the same result. The only question is whether the rows arrive in time.

---

## 4. The Models Examined

### 4.1. DeepSeek-V4.1-Flash

| Property | Value |
|---|---|
| Total parameters | 763B |
| — backbone | 552B |
| — Engram embedding tables | 196B |
| — vision encoder, projector, draft model | ~15B |
| Active parameters per token | ~16B in decode (~8B in prefill) |
| Attention | Compressed sparse attention with a 128-token sliding window; KV cache shared across layers |
| Engram | Layer indices 1 and 14 (zero-based); bigrams, trigrams and 4-grams; 8 hash heads per n-gram order; 256 values per row |
| Maximum context length | 1,048,576 tokens (approximately 1M) |
| Checkpoint size | 510.3 GB; mixed precision, including FP8 dense and Engram weights and FP4 experts |

The [model card](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash) distinguishes the 552B backbone from Engram and the auxiliary modules.

### 4.2. Qwen3.8-Flash-Next

| Property | Value |
|---|---|
| Parameters | 125B base model + 51B n-gram embeddings + 4B multi-token prediction (MTP) module |
| Active parameters per token | 6B |
| Attention | 36 Gated DeltaNet layers and 12 Qwen Sparse Attention (QSA) layers; QSA selects up to 512 four-token blocks plus the final incomplete block |
| N-gram table | Layer index 2 (zero-based); bigrams and trigrams; 8 hash heads each; 16 rows of 160 values form a 2,560-dimensional vector |
| Configured context limit | 262,144 tokens |
| Served checkpoint | `nvidia/Qwen3.8-Flash-Next-NVFP4`; 132.7 GB (123.6 GiB) of safetensors files |
| Weight precision | NVFP4 routed experts in the main model; BF16 attention and shared experts; FP8 MTP routed experts and n-gram table |

### 4.3. Model size and memory requirements

| Model | Checkpoint size | Embedding table | Rest of checkpoint | Configurations that require table offloading here |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 510.3 GB | ~196.6 GB | ~313.7 GB | 4× DGX Spark |
| Qwen3.8-Flash-Next, NVIDIA NVFP4 | 132.7 GB | ~51.2 GB (47.7 GiB) | ~81.5 GB | 1× DGX Spark; 1× RTX PRO 6000 |

GB means 10⁹ bytes and GiB 2³⁰ bytes. Checkpoint sizes are the safetensors file totals at the recorded revisions (for Qwen, the [NVIDIA checkpoint files](https://huggingface.co/nvidia/Qwen3.8-Flash-Next-NVFP4/tree/fc694b54fb0174e0913e6adf86691ef85a4ead47)). The remaining size is a subtraction, not a measurement of GPU memory after loading; runtime memory figures are given in Section 5.

Offloading moves the table to another memory tier; it remains part of the model. The smaller configurations can then hold the remaining weights together with the memory needed for inference.

---

## 5. Benchmark Results

### 5.1. Methodology

The deployment results below are OpenZeka measurements made with the open-source [CordatusAI LLM Benchmark Tool](https://github.com/CordatusAI/llm-benchmark), with approximately 128 input tokens and an output limit of 128 tokens, ten rounds per concurrency level, and mean values reported. **Concurrency (C)** is the number of simultaneous requests. **TTFT (time to first token)** includes queueing and prompt processing; the first reasoning token also counts when streamed. **TPS (tokens per second)** is the output token count divided by total request time, including TTFT. It is reported per request, not as aggregate throughput. All results are also available in the [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}).

| Run | Hardware | Engine, tensor parallelism (TP) | Speculative decoding | Table location |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 4× DGX Spark | vLLM, TP=4 | DSpark, k=5 | NVMe |
| DeepSeek-V4.1-Flash, 300K | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | In memory |
| DeepSeek-V4.1-Flash, 1M | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | NVMe |
| Qwen3.8-Flash-Next | 1× DGX Spark | SGLang, TP=1 | MTP, 3 speculative steps / 4 draft tokens | NVMe |
| Qwen3.8-Flash-Next | 1× RTX PRO 6000 | SGLang, TP=1 | MTP, 3 speculative steps / 4 draft tokens | Pinned host RAM |

The **two 8× DGX Spark DeepSeek configurations** compare table placement on the same hardware. The other runs answer a different sizing question: once the model fits with offloading, what inference performance does the configuration deliver? Their results are evaluated individually below.

### 5.2. DeepSeek-V4.1-Flash on 4× DGX Spark: fitting the model with Engram-on-disk

Split over four nodes, the full 510 GB checkpoint needs about 128 GB per node — more than a DGX Spark can give the model once the operating system, CUDA context and KV cache are accounted for. With **Engram-on-disk**, each node keeps its share of the Engram rows on local NVMe and stages the rows each step needs into GPU memory before the forward pass. The remaining weights can then be loaded, with the following benchmark results:

| Concurrency (C) | TTFT (ms) | TPS per request (tok/s) |
|---|---|---|
| 1 | 271.6 | 29.5 |
| 2 | 395.8 | 21.3 |
| 4 | 577.4 | 13.1 |
| 8 | 805.9 | 8.8 |

**Why this is useful.** A 763B-parameter model runs across four desktop devices with **29.5 tok/s per request and 272 ms TTFT at C=1**. At C=2 it maintains **21.3 tok/s and 396 ms TTFT**, meeting the Explorer's default targets of at least 20 tok/s and at most 1,000 ms TTFT. Higher concurrency remains possible, reaching 13.1 tok/s at C=4 and 8.8 tok/s at C=8, but with slower responses. For this workload, the configuration supports interactive use at low concurrency.

### 5.3. DeepSeek-V4.1-Flash on 8× DGX Spark: the table in memory vs on NVMe

On eight nodes the checkpoint fits either way, allowing a comparison of two deployment configurations. On DGX Spark, holding the table in "host memory" still uses the shared 128 GB memory pool. Moving the table to NVMe reduces that usage, apart from cached pages and staging buffers.

| Metric | Engram in memory | Engram on NVMe |
|---|---|---|
| Engram memory per node (reported) | 23.6 GB | Rows and staging buffers only |
| KV-cache allocation per node (reported) | ~8.7 GB | ~30 GB |
| Configured context limit | 300K tokens | **1M tokens** |
| TTFT at C=1 | 213 ms | 199 ms |
| TPS per request at C=1 / C=8 (tok/s) | 36.0 / 13.6 | 33.3 / 11.7 |

**The practical trade-off:** the disk configuration offers roughly **21 GB more reported KV-cache allocation per node**, while retaining **33.3 tok/s at C=1** and **11.7 tok/s per request at C=8**. Against the in-memory configuration, that is a 7.5% and 14% reduction in TPS, respectively. The in-memory configuration has higher measured TPS; the disk configuration leaves more memory for KV cache.

This is a comparison of the two deployment configurations: context limits, memory settings and execution paths also differ (see the [8× paper]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/' | relative_url }})). The configured context limit rises from 300K to 1M tokens. The benchmark used short prompts and did not test the maximum context length.

### 5.4. Qwen3.8-Flash-Next on one DGX Spark: fitting a 132.7 GB checkpoint

The **132.7 GB NVIDIA NVFP4 checkpoint** cannot be kept entirely in a single Spark's memory alongside the OS, KV cache and runtime buffers. Storing the **47.7 GiB FP8 n-gram table** in a memory-mapped file on local NVMe lets the remaining weights stay in unified memory.

The GPU accesses the memory-mapped table through the CPU's page tables. Recently accessed file pages remain in unified memory, with an 8 GiB page-cache budget in this implementation. The configuration leaves roughly 12–18 GB for KV cache and recurrent-state pools and caps running requests at eight.

| Concurrency (C) | TTFT (ms) | TPS per request (tok/s) |
|---|---|---|
| 1 | 301.9 | 28.5 |
| 2 | 392.7 | 23.6 |
| 4 | 566.0 | 17.1 |
| 8 | 762.6 | 11.8 |

**Why this is useful.** The model runs on one desktop device at **28.5 tok/s and 302 ms TTFT at C=1**. At C=2 it delivers **23.6 tok/s per request and 393 ms TTFT**, meeting the Explorer's default targets. At C=4 it still delivers **17.1 tok/s per request**; at C=8, 11.8 tok/s. Mean TTFT stays below one second at every tested level. The measured results support interactive local inference at low concurrency.

Startup time is an operational consideration: this implementation rewrites the table file on each launch, taking about 10 minutes on a fresh file or 55 minutes when the previous populated file remains. That matters for restarts, even though the running service provides the response speeds above.

### 5.5. Qwen3.8-Flash-Next on one RTX PRO 6000: fitting the model with host-memory offloading

The same **132.7 GB NVFP4 checkpoint** exceeds the card's **96 GB dedicated memory**. The pinned-memory offloading implementation places the 47.7 GiB FP8 table in separate system RAM, allowing the remaining model weights to fit on the GPU. The host needs at least 64 GB free for the pinned allocation and headroom; requested rows reach the GPU across PCIe.

The cookbook reports **8.3 GiB** allocated to KV cache and recurrent-state pools. The tested configuration allows 16 running requests, using BF16 recurrent state and an adjusted cache policy.

| Concurrency (C) | TTFT (ms) | TPS per request (tok/s) |
|---|---|---|
| 1 | 139.2 | 155.8 |
| 2 | 195.8 | 120.0 |
| 4 | 220.6 | 90.8 |
| 8 | 252.3 | 63.7 |
| 16 | 257.2 | 43.2 |
| 32 | 3,222.7 | 22.2 |

**Why this is useful.** The deployment delivers **155.8 tok/s at C=1** and **43.2 tok/s per request at C=16**, with mean TTFT below 260 ms throughout that range. All tested levels through C=16 meet the Explorer's default latency and TPS targets while serving a model whose full checkpoint exceeds the card's memory. At C=32, requests queue behind the 16 running slots and mean TTFT rises above three seconds; C=32 therefore fails the default TTFT target even though TPS remains above 20 tok/s.

These observations apply to the measured short-prompt workload. Longer prompts, output lengths and conversation histories should be evaluated against the application's latency targets.

---

## 6. Discussion

### 6.1. Memory versus NVMe when the model already fits

The 8× Spark DeepSeek comparison is useful when choosing how to allocate memory. Both configurations serve the same model on the same hardware: keeping Engram in memory gives the higher measured TPS, while moving it to disk makes more memory available for KV cache. The choice depends on whether the application values the additional KV-cache capacity enough to accept the observed speed difference. In the Explorer, the in-memory configuration reaches Max C = 4 (an estimated 16 chat or 6 agentic users) and the disk configuration Max C = 2 (8 chat or 3 agentic users). The short-prompt benchmark does not use the disk configuration's extra KV cache, which matters for long contexts.

### 6.2. What offloading makes possible: capability, speed and capacity

The chain is short. The Engram table leaves GPU memory, the rest of the model fits, and the device then serves a model it could not otherwise hold. The [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}) puts the result in planning terms:

| Model (Intelligence Index) | Device | Why it fits | TPS per request at C=1 | Max C | Estimated chat users | Estimated agentic users |
|---|---|---|---|---|---|---|
| DeepSeek-V4.1-Flash (39.5) | 4× DGX Spark | ~196.6 GB of Engram tables on NVMe; the rest of the 510.3 GB checkpoint is split across four 128 GB nodes | 29.5 tok/s | 2 | 8 | 3 |
| Qwen3.8-Flash-Next (39.8) | 1× DGX Spark | 51.2 GB table on NVMe; the rest of the 132.7 GB checkpoint fits the 128 GB pool | 28.5 tok/s | 2 | 8 | 3 |
| Qwen3.8-Flash-Next (39.8) | 1× RTX PRO 6000 | 51.2 GB table in host RAM; the rest of the 132.7 GB checkpoint fits the 96 GB card | 155.8 tok/s | 16 | 64 | 24 |

In other words: because its Engram table can be offloaded, a model with an Artificial Analysis Intelligence Index of 39.8 runs on **a single DGX Spark at 28.5 tok/s**, enough for an estimated **8 chat users or 3 agentic users**. On **a single RTX PRO 6000** the same model runs at **155.8 tok/s** and reaches an estimated **64 chat users or 24 agentic users**. A 763B model with an index of 39.5 serves an estimated 8 chat or 3 agentic users on **four DGX Sparks**.

How to read these figures:

- **Max C** is the highest tested concurrency that meets the Explorer's default targets: at least 20 tok/s per request and at most 1,000 ms mean TTFT.
- **Users are an estimate, not a measurement.** The Explorer multiplies Max C by a default usage factor: ×4 for chat users, who spend most of their time reading and typing (a request running about a quarter of the time), and ×1.5 for agentic users, whose chained calls keep a request running about two thirds of the time.
- **These capacities come from speed alone.** The Explorer's memory limit assumes the whole checkpoint sits in GPU memory, which is exactly what offloading avoids, so it does not calculate one for these runs. The deployments' own request caps (8 running requests on DGX Spark, 16 on RTX PRO 6000) are at or above Max C, so memory does not lower the estimate.
- **The workload was short:** about 128 input and 128 output tokens. Longer prompts and conversation histories raise TTFT and lower capacity.

*Intelligence Index v4.3, published by [Artificial Analysis](https://artificialanalysis.ai), retrieved 28 September 2026 and reproduced with attribution.* The index describes the model, not the quantized deployment on a particular task; evaluate the served checkpoint on the intended tasks as well.

### 6.3. Operational requirements

The following requirements are in addition to storing the downloaded checkpoint:

| Requirement | DeepSeek-V4.1-Flash, DGX Spark | Qwen3.8-Flash-Next, DGX Spark | Qwen3.8-Flash-Next, RTX PRO 6000 |
|---|---|---|---|
| Additional storage for offloading | Engram tables on each node's NVMe | ~51.2 GB (47.7 GiB) for the table, plus free space for loading | None beyond the checkpoint files |
| Host memory | Staging buffers in the shared pool | Page cache in the shared pool | ≥64 GB free for pinned allocation and headroom |
| Startup | Patched loader prepares tables on NVMe | Table file written at every start (10–55 min) | Table loaded into RAM |
| Software support | Required community patches on GB10, including the Engram-on-disk path | File-backed offloading requires the compatible SGLang build | Supported in the SGLang cookbook image |

---

## 7. Sizing With Engram Tables

### 7.1. The revised memory budget

For supported models with Engram tables, budget GPU memory and the offloading destination separately:

> **Required GPU memory (or unified memory) = Remaining model weights + KV cache + Recurrent-state pools + Activations + Offloading buffers and cached pages + Runtime overhead**
>
> **Additional host RAM or NVMe storage = Offloaded tables + Loading buffers / free-space allowance**

On Spark, the OS also uses unified memory. Cached file pages must be included in that shared budget. On a discrete GPU, pinned tables occupy separate host RAM. Freed table space therefore does not translate one-for-one into request capacity.

Use the Local LLM Usage Guide's headroom advice as a planning allowance, then check the engine's actual allocation and peak usage. A configured memory fraction is not interchangeable with a blanket percentage added to checkpoint size.

### 7.2. Sizing checklist

- ☐ Identify the served checkpoint's remaining model weights and Engram tables separately, including their precision.
- ☐ Verify engine support for the model and destination: pinned host RAM or file-backed storage in the configurations examined here.
- ☐ Budget resident caches, buffers and OS memory as well as the offloaded table.
- ☐ Reserve KV and recurrent-state pools for the required context and concurrency; check effective engine limits.
- ☐ Measure response speed for that workload, including startup and cold-cache performance where relevant.
- ☐ Validate model quality on the intended tasks; an external capability score is only a starting point.

One sizing mistake to avoid is treating all offloading as equivalent. Check **which data moves, how much is accessed, and when it must arrive** before deciding whether a larger model is practical.

---

## 8. Conclusion and Outlook

**Summary of findings:**

| Question | Answer |
|---|---|
| Can the table leave GPU memory? | Yes — the tables are large, but each token retrieves only a few kilobytes, at addresses known in advance |
| Where does it go? | Local NVMe on DGX Spark; separate pinned host RAM on RTX PRO 6000 |
| What does the same-hardware comparison show? | On 8× Spark, the disk configuration reports ~21 GB more KV-cache allocation per node with 7.5% lower TPS at C=1 and 14% lower TPS at C=8 |
| What do the smaller configurations deliver? | DeepSeek on 4× Spark: 29.5 tok/s at C=1, an estimated 8 chat / 3 agentic users; Qwen on one Spark: 28.5 tok/s, 8 chat / 3 agentic users; Qwen on RTX PRO 6000: 155.8 tok/s at C=1 and 43.2 tok/s per request at C=16, 64 chat / 24 agentic users |
| What does it gain? | Models that otherwise do not fit (763B on 4× DGX Spark, 132.7 GB checkpoint on one DGX Spark or RTX PRO 6000), and more KV capacity (300K → 1M configured limit on 8× DGX Spark) |
| What does it cost? | Startup time, NVMe space or locked host RAM, and dependence on engine support |

**Outlook.** Some recent architectures separate what must be computed from what only needs to be stored. Mixture-of-Experts separated active from total parameters; Engram tables, as used in the two models examined here, add a large parameter pool whose access pattern suits slower memory tiers. Whether other models adopt it remains to be seen. If they do, and inference engines support it, the same hardware may run more capable models by using host RAM and storage for suitable components. Realizing that benefit requires enough GPU memory for the remaining weights and request state, efficient data transfers, and acceptable measured latency.

---

## Glossary (Terms)

- **Active parameters:** Parameters used for a token; their precision and reuse help determine weight traffic.
- **Checkpoint:** Saved model weights and associated metadata; file size and runtime memory usage are different quantities.
- **Conditional memory:** DeepSeek's name for an Engram table: the table is large, but a row is read only when the input tokens call for it.
- **Decode:** Incremental response generation; often limited by memory bandwidth at small batch sizes.
- **Embedding:** A learned vector representing a token or token sequence.
- **Engram:** DeepSeek's embedding-table module, used in DeepSeek-V4.1-Flash.
- **Engram table:** A lookup table of learned vectors, addressed by hashed n-grams of the input tokens and combined with the hidden state at selected layers.
- **Gated DeltaNet:** A linear-attention layer that keeps a fixed-size state per request instead of a growing KV cache.
- **Hash head:** One of several independent hash functions that map an n-gram to a row of the table.
- **Hidden state:** The vector representation of a token as it passes through the model's layers.
- **KV cache:** Cached attention keys and values; its size depends on the attention architecture, context length, precision and concurrent requests.
- **Lookup table:** A table read by fetching the rows addressed by a key; Engram tables are read this way.
- **Memory-mapped file:** A file made accessible as memory; pages are loaded from disk on first access and kept in the page cache.
- **N-gram:** A sequence of n consecutive tokens (bigram: 2, trigram: 3).
- **Offloading:** Placing part of a model's data in a slower, larger memory tier (host RAM, NVMe) instead of GPU memory.
- **Page cache:** The operating system's in-memory cache of recently read file pages.
- **Pinned (page-locked) memory:** Host memory the operating system may not move or swap, so a discrete GPU can read it directly.
- **PLE table:** The name SGLang uses for Qwen3.8-Flash-Next's n-gram embedding table.
- **Prefetching:** Fetching data before the layer that needs it executes, so transfer can overlap computation.
- **Prefill:** Processing the prompt before response generation; contributes to TTFT alongside queueing and other overhead.
- **Recurrent state:** Fixed-size state updated by a linear-attention layer for each sequence; serving may require additional copies for caching and speculative decoding.
- **Total parameters:** All parameters of the model; they determine memory capacity requirements.
- **TPS (tokens per second):** Here, output tokens divided by total request time, including TTFT.
- **TTFT (time to first token):** Time from request submission to the first streamed token, including a reasoning token when present.
- **Unified memory:** A single memory pool shared by CPU and GPU, as in DGX Spark (GB10).

---

## Resources

> Hardware figures follow the NVIDIA datasheets as used in the Local LLM Usage Guide. Architecture details come from the model cards, technical reports and model configurations. Inference results are OpenZeka measurements in the LLM Inference Benchmark Explorer; memory allocations and startup observations come from the linked deployment reports and SGLang cookbook.

**Models and architecture:**

- DeepSeek-V4.1-Flash model card — <https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash>
- DeepSeek-V4.1-Flash technical report — <https://arxiv.org/abs/2609.19969>
- Conditional Memory via Scalable Lookup: A New Axis of Sparsity for Large Language Models (Engram) — <https://arxiv.org/abs/2601.07372>
- NVIDIA Qwen3.8-Flash-Next NVFP4 model card and precision breakdown — <https://huggingface.co/nvidia/Qwen3.8-Flash-Next-NVFP4>
- Qwen3.8-Flash-Next model card — <https://huggingface.co/Qwen/Qwen3.8-Flash-Next>
- Qwen3.8-Flash-Next technical report — <https://arxiv.org/abs/2608.30320>

**Inference engines and offloading:**

- SGLang cookbook, Qwen3.8-Flash-Next (verified single-device configurations) — <https://docs.sglang.io/cookbook/autoregressive/Qwen/Qwen3.8-Flash-Next>
- SGLang: file-backed n-gram table on DGX Spark — <https://github.com/sgl-project/sglang/pull/39126>

**Hardware:**

- NVIDIA DGX Spark — <https://www.nvidia.com/en-us/products/workstations/dgx-spark/>
- NVIDIA RTX PRO 6000 Blackwell Workstation Edition — <https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/>
- NVIDIA DGX B300 — <https://www.nvidia.com/en-us/data-center/dgx-b300/>

**OpenZeka papers and tools:**

- [Local LLM Usage Guide]({{ '/papers/local-llm-guide/' | relative_url }})
- [DeepSeek-V4.1-Flash 4× DGX Spark Deployment]({{ '/papers/deepseek-v4.1-flash-4spark-deployment/' | relative_url }})
- [DeepSeek-V4.1-Flash 8× DGX Spark TP8 Deployment]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/' | relative_url }})
- [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }})
- CordatusAI LLM Benchmark Tool — <https://github.com/CordatusAI/llm-benchmark>

**Capability scores:**

- Artificial Analysis Intelligence Index — <https://artificialanalysis.ai>

---

### Notes

- **Measurements:** The deployment speed figures come from OpenZeka runs with the CordatusAI LLM Benchmark Tool (approximately 128 input tokens, up to 128 output tokens, mean values). The DeepSeek-V4.1-Flash launch configurations are documented in the two DeepSeek papers; the Qwen3.8-Flash-Next runs used the SGLang cookbook's verified single-device configurations.
- **Estimates:** Embedding bytes per token are calculated from model configurations; actual memory and storage traffic depends on caching and transfer granularity. Checkpoint file sizes are not runtime memory measurements.
- **Currency:** Engine support for offloading is evolving quickly; flags and limitations described here are valid as of September 2026.

---

{% include company/block.html name="cta_logo" %}

**Let's plan your LLM infrastructure together.** For hardware sizing that accounts for model architecture, memory hierarchy and offloading, {% include company/block.html name="contact_cta" %}
