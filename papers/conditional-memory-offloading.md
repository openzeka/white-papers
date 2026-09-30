---
title: Conditional Memory and Offloading in LLM Inference
parent: White Papers
nav_order: 2
lang: en
page_id: conditional-memory-offloading
date: 2026-09-29
card_tag: "Technical Guide"
description: >-
  How model architecture decides what must remain in GPU memory and what can move to
  host RAM or NVMe: conditional memory, memory hierarchies of DGX Spark, RTX PRO
  6000 and DGX B300, and measured results with DeepSeek-V4.1-Flash and
  Qwen3.8-Flash-Next.
permalink: /papers/conditional-memory-offloading/
last_modified_date: 2026-09-29
toc: true
---

> **Publication date:** September 2026
> **Scope:** How an LLM uses memory during inference, which architectural choices change that, how the memory hierarchies of DGX Spark, RTX PRO 6000 and DGX B300 differ, and what offloading can and cannot achieve — evaluated with OpenZeka measurements of DeepSeek-V4.1-Flash and Qwen3.8-Flash-Next.
> **Note:** Model names, software versions and measured results are valid as of September 2026. Support for offloading in inference engines is changing quickly; the enduring question is how much data each step needs and when it must arrive.

---

{:.no_toc}
## Table of contents

* TOC
{:toc}

---

## Executive Summary

- **Start with the memory budget.** Our [Local LLM Usage Guide]({{ '/papers/local-llm-guide/' | relative_url }}) treats VRAM as the central sizing constraint. Conditional memory changes which model parameters need to remain in GPU memory.
- **Not every parameter is read on every token.** Some recent models, including the two examined here, add what DeepSeek calls **conditional memory**: large lookup tables of hashed n-gram embeddings (*Engram* in DeepSeek-V4.1-Flash, the *n-gram embedding table* in Qwen3.8-Flash-Next, called PLE in SGLang). Each token requires only a few kilobytes of embedding data, and the required rows can be identified from token IDs before the forward pass.
- **Storage requirements and memory traffic differ.** Large tables supply only a few rows per token. Small transfers and prefetching make low-overhead offloading possible, while repeatedly moving active weight matrices or attention caches is more demanding.
- **Where it can go depends on the device's memory design.** On **DGX Spark** (unified memory) host RAM and GPU memory are the same pool, so the table is backed by NVMe with frequently accessed pages cached in RAM. On **RTX PRO 6000** (dedicated GPU memory) the table goes to pinned host RAM across PCIe. On **DGX B300**, the four-GPU DeepSeek configuration has enough GPU memory to hold the tables as well.
- **Measured results:** the tested 763B DeepSeek-V4.1-Flash configuration runs on 4× DGX Spark by placing its 196B-parameter Engram tables on NVMe; on 8× DGX Spark, moving them to NVMe increased the reported KV-cache allocation by ~21 GB per node and raised the configured context limit from 300K to 1M tokens. Qwen3.8-Flash-Next, with a 132.7 GB quantized checkpoint, runs on a single DGX Spark and a single RTX PRO 6000, with measured performance suitable for interactive use at the concurrency levels discussed below.
- **Two practical outcomes.** The two 8× DGX Spark configurations show the trade-off between keeping Engram in memory and placing it on disk. The 4× Spark and single-device Qwen runs demonstrate useful service from checkpoints that exceed the memory available for model weights.
- **Sizing consequence:** include the remaining model weights, KV cache, recurrent state and runtime buffers in the GPU memory budget; include offloaded tables in the host RAM or NVMe budget. If more models adopt this design, the same device could run larger models than its GPU memory alone would suggest.

---

## 1. Introduction

The [Local LLM Usage Guide]({{ '/papers/local-llm-guide/' | relative_url }}) starts hardware sizing with GPU memory: model weights, KV cache, recurrent state and runtime buffers must fit. Conditional memory adds a useful distinction to that budget. Some learned parameters form large tables from which each token retrieves only a few rows; keeping those tables outside GPU memory can make a previously oversized model practical on the same device.

This paper follows that distinction from **architecture to deployment**: why attention, experts and embeddings have different access patterns; how those patterns affect offloading; and what OpenZeka's DeepSeek-V4.1-Flash and Qwen3.8-Flash-Next runs demonstrate on DGX Spark and RTX PRO 6000. DGX B300 provides an example of a system with separate CPU and GPU memory in the hardware discussion.

The focus is the mechanism and its sizing consequences. Launch instructions remain in the linked deployment papers and SGLang cookbook.

---

## 2. How an LLM Uses Memory

### 2.1. Memory capacity, bandwidth and latency

**Memory capacity** determines how much data fits; **memory bandwidth** determines how quickly it can be read. Offloading frees GPU memory by placing data in host RAM or storage, accessed through a slower connection. Whether that works well depends on the bytes needed at each step, the latency of accessing them, and whether the fetch can overlap useful computation.

A 50 GB table that supplies a few kilobytes per token requires much less data transfer than 50 GB of matrices repeatedly used in computation. The storage requirement alone does not tell us the cost of moving either out of GPU memory.

### 2.2. What occupies memory during inference

The memory budget from §4.3 of the Local LLM Usage Guide still applies:

> **Total memory = Model weights + KV cache + Recurrent state + Activations + Overhead**

| Component | What it is | Grows with |
|---|---|---|
| **Model weights** | The parameters: attention projections, experts, embeddings, output head | Model size and precision |
| **KV cache** | Cached keys and values, stored so attention layers do not have to recompute them | Context length × concurrent requests |
| **Recurrent state** | Fixed-size memory of linear-attention layers (e.g. Gated DeltaNet), plus serving buffers and saved copies | Active requests, cache policy and speculative settings |
| **Activations and overhead** | Temporary buffers, CUDA context, allocator fragmentation | Batch and prompt sizes, engine settings |

This paper adds one distinction to the table: **not all model weights behave the same way.** Some are used as full matrices; others supply only selected rows. Section 3 explains which is which.

### 2.3. Why frequently accessed data stays close to the GPU

**Prefill (prompt processing)** processes the input tokens; **decode (token generation)** produces the response. At small batch sizes, reading weights often dominates decode, making memory bandwidth a useful first estimate:

> **Memory-bound decode speed (tokens/s) ≈ Effective memory bandwidth (bytes/s) ÷ Bytes read per generated token**

Compute, kernel overhead, communication and KV-cache or recurrent-state access can also limit speed. Batching and speculative decoding reuse weights across tokens, so a weight read is not necessarily repeated for every output token.

Keeping frequently accessed data in GPU memory avoids a slower transfer on the execution path. CPU execution and weight streaming can make larger models run, but their performance depends on the workload and implementation. Conditional memory offers a different opportunity: keep the computation on the GPU while retrieving a small amount of data from a much larger table in host RAM or storage.

---

## 3. Architecture and Memory Access

### 3.1. Standard attention and MoE: what is read at each step?

In a Transformer, a token's current representation is multiplied by learned matrices to form a **query, key and value**. The query is compared with the keys of the current and preceding tokens. After normalization, the attention weights determine how their value vectors are combined. The output then passes through further projections and a feed-forward network.

This creates two different memory demands:

- **Weights** are learned during training and reused across requests. Dense projections and feed-forward layers use large matrices at each forward step.
- **KV cache** holds keys and values computed for the current conversation. Full attention consults the preceding context at each decode step, so this traffic grows with context length.

For fast GPU execution, these frequently accessed matrices and active caches are normally kept in GPU memory. Offloading them is possible, but repeated transfers can dominate inference latency.

**Mixture-of-Experts (MoE)** changes the feed-forward part: a router selects a few expert networks for each token. Total parameters determine the storage requirement, while selected experts determine much of the weight traffic. This reduces computation, but selecting an expert still means using its matrices. A learned router chooses experts from the current hidden state, so the selection is only known during the forward pass. Expert caching and prefetching can help, but a cache miss is much more expensive than fetching a few embedding rows.

### 3.2. Attention architectures that reduce memory requirements

Several architecture changes reduce the cache or the amount of it read:

| Architecture | What changes | Consequence for memory placement |
|---|---|---|
| **Grouped-query attention (GQA)** | Several query heads share keys and values | Smaller KV cache; the active cache is still consulted during decode |
| **Compressed / sparse attention** | Stores compressed representations or selects a subset of positions | Less storage or fewer reads; selection and cache layout determine transfer costs |
| **Linear-attention hybrids** | Some layers update a fixed-size recurrent state instead of retaining a key and value for every token | Less context-dependent storage; the state must still be read and updated each step |

Qwen3.8-Flash-Next, for example, uses Gated DeltaNet in three of every four layers and sparse attention in the remaining layers. DeepSeek-V4.1-Flash compresses and shares attention caches. These changes leave more room for requests, but do not by themselves make the remaining state cheap to offload.

**Conditional memory is an additional component alongside these layers.** Its offloading advantage comes from the lookup pattern described next; it does not require moving attention computation off the GPU.

### 3.3. Conditional memory: from token IDs to learned vectors

An **embedding** is a learned vector of numbers. An ordinary input embedding table maps each token ID to a row. Conditional memory extends that idea to short sequences of tokens, or **n-grams**, providing learned information about local token combinations alongside the representation computed by the network.

The term was introduced by DeepSeek in the [Engram paper](https://arxiv.org/abs/2601.07372) and is not yet a general name for the technique: Qwen describes its version as n-gram embeddings, and SGLang calls the table PLE. This paper uses *conditional memory* for both.

The lookup and the computation that uses it are separate operations:

1. **Form the key.** Take the recent token IDs: two for a bigram, three for a trigram. For example, IDs `[a, b, c]` give the suffixes `[b, c]` and `[a, b, c]`. A token may be a word, part of a word or another text fragment.
2. **Hash into tables.** Each hash head converts that short sequence into a row address. Multiple heads provide several learned vectors even when two sequences collide in one table. No search across all rows is needed.
3. **Fetch the embeddings.** Read the addressed rows and concatenate them. The table is learned model data, fixed during inference; it is not a conversation cache or a document database.
4. **Fuse with the hidden state.** Projections transform the retrieved vector; a gate computed from the current hidden state controls how strongly it contributes. The same retrieved rows can therefore contribute differently in different contexts. This computation stays on the GPU; the large table can be elsewhere.

This separation of embedding lookup and context-dependent gating is described in the [Engram architecture](https://arxiv.org/html/2601.07372v2#S2). Qwen's [n-gram embedding design](https://arxiv.org/html/2608.30320#S2.SS3) uses the same broad approach.

**Example — Qwen3.8-Flash-Next.** Each input position reads sixteen rows (bigrams and trigrams, eight hash heads each) of 160 one-byte FP8 values: about **2.5 KB**, from a table of about **47.7 GiB**. Adding rows to the table adds learned parameters without adding reads per token.

**Why prefetching is possible.** Row addresses depend on token IDs, which are available before the forward pass. An engine can start retrieving rows while preceding GPU layers execute. In ordinary decode this applies to the current known token, not to unknown future outputs. During prefill, all prompt IDs are already available. Placement after the first layers creates time for the fetch to overlap computation; whether that overlap is sufficient depends on the engine and memory tier.

Ordinary input embeddings also use row lookups. The large size of conditional-memory tables makes offloading them particularly useful for reducing GPU memory requirements. If input embeddings share weights with the output layer, that layer also uses the table to compute scores for the vocabulary; its memory access is therefore different from an input lookup.

### 3.4. Comparison: what makes offloading practical?

| Data | Access pattern | Implication for offloading |
|---|---|---|
| **Dense projections and feed-forward weights** | Large matrix reads during each forward step | Streaming weights can put the transfer link on the critical path |
| **MoE experts** | Only selected matrices, with selection usually dependent on hidden states | Smaller active set, but expensive misses and less advance notice |
| **Active KV cache** | Context-dependent reads; full attention consults the preceding context | Long contexts can create substantial transfer traffic |
| **Recurrent state** | Read and updated each step | Repeated reads and writes can introduce transfer overhead |
| **Conditional-memory tables** | A few rows addressed from token IDs | Small transfers and predictable addresses allow prefetching to overlap computation |

> **Practical takeaway:** Large tables, small transfers and enough time to fetch them make a component a good offloading candidate. Conditional memory combines small transfers with addresses known before the layer executes. Attention and expert offloading require different trade-offs.

---

## 4. The Memory Hierarchy of the Devices

### 4.1. Memory tiers

| Tier | Typical capacity | Access characteristic |
|---|---|---|
| **GPU memory** (HBM, GDDR, unified LPDDR) | Tens to hundreds of GB per device | High bandwidth for repeated matrix and cache reads |
| **Host RAM** on a discrete-GPU system | Hundreds of GB to TBs | PCIe Gen5 x16 offers about 64 GB/s per direction theoretically, before protocol and software overhead |
| **Local NVMe** | Several TB | Larger capacity; random access and page faults cost more than resident-memory reads |

Transfer time is roughly **bytes ÷ bandwidth**, plus latency and software overhead; only the part not hidden behind computation slows the model. For small scattered reads, latency and caching can matter more than peak bandwidth.

### 4.2. Unified memory vs dedicated GPU memory

The memory architecture determines which offloading destination frees GPU memory.

**Dedicated GPU memory (RTX PRO 6000, DGX B300).** The GPU has its own memory; the CPU has separate system RAM, reached across PCIe. Moving a table from GPU memory to host RAM frees GPU memory. The offloading implementation used here allocates the table in **pinned (page-locked) host memory**, allowing the GPU to gather rows directly without the operating system swapping those pages out.

**Unified memory (DGX Spark).** The GB10 chip's CPU and GPU share one 128 GB pool of LPDDR5X with cache-coherent access from both processors. There is no separate host RAM: allocating the table as CPU memory does not reduce its use of the shared pool, and pinning a table in host memory still consumes the same 128 GB. The file-backed implementation uses GB10's access to pageable memory through host page tables. The table is backed by local NVMe; fetched pages still occupy unified memory while cached. Only a portion of the table needs to remain in RAM at a time.

### 4.3. Device comparison

| | DGX Spark (GB10) | RTX PRO 6000 Blackwell | DGX B300 |
|---|---|---|---|
| Memory design | 128 GB pool shared by CPU and GPU | 96 GB dedicated GPU memory, separate host RAM | Eight GPUs with dedicated HBM, separate host RAM |
| GPU memory bandwidth | 273 GB/s | 1.79 TB/s | 8 TB/s per GPU |
| Table location | Local NVMe with an in-memory page cache | Pinned host RAM over PCIe | Stored in GPU memory in the four-GPU DeepSeek configuration |
| Sizing consequence | Allow for OS, page cache and runtime in the shared pool | Budget host RAM separately from GPU memory | Sufficient GPU memory for these checkpoints in multi-GPU configurations |

### 4.4. Why conditional-memory offloading can have low overhead

Transferring gigabytes of active weights per step can consume much of the available PCIe bandwidth. Qwen's ~2.5 KB of embedding data per token position requires far less transfer bandwidth. Its addresses can also be prepared before the layer that uses the embeddings, allowing an asynchronous fetch to finish while other layers run.

That is the architectural reason **a large table can be offloaded at low cost**. It requires an implementation that exploits the access pattern. Host RAM and NVMe are also different cases: a file-backed table may hit the page cache or wait for storage. Page reads can be much larger than the requested rows, and prefill, batching and speculative verification multiply the number of positions looked up.

**Evidence that the mechanism can work.** In the Engram paper's H800 experiment, adding a 100B-parameter host-resident table to 4B and 8B dense backbones reduced throughput by about 1.9% and 2.8% relative to their respective baselines without Engram. The implementation overlapped fetching with the first block. The result applies to that host-memory implementation and workload ([Engram, §6.4](https://arxiv.org/html/2601.07372v2#S6.SS4)).

Offloading a table without changing its values preserves its learned information: the same rows are supplied to the GPU. The practical question is whether they arrive in time. Section 6 shows the resulting deployment choices: an in-memory versus NVMe comparison on 8× DGX Spark, and usable inference from otherwise oversized checkpoints on smaller configurations.

---

## 5. The Models Examined

### 5.1. DeepSeek-V4.1-Flash

| Property | Value |
|---|---|
| Total parameters | 763B |
| — backbone | 552B |
| — Engram conditional memory | 196B |
| — vision encoder, projector, draft model | ~15B |
| Active parameters per token | ~16B in decode (~8B in prefill) |
| Attention | Compressed sparse attention with a 128-token sliding window; KV cache shared across layers |
| Engram | Layer indices 1 and 14 (zero-based); bigrams, trigrams and 4-grams; 8 hash heads per n-gram order; 256 values per row |
| Maximum context length | 1,048,576 tokens (approximately 1M) |
| Checkpoint size | 510.3 GB; mixed precision, including FP8 dense and Engram weights and FP4 experts |

The [model card](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash) distinguishes the 552B backbone from Engram and the auxiliary modules.

### 5.2. Qwen3.8-Flash-Next

| Property | Value |
|---|---|
| Parameters | 125B base model + 51B n-gram embeddings + 4B multi-token prediction (MTP) module |
| Active parameters per token | 6B |
| Attention | 36 Gated DeltaNet layers and 12 Qwen Sparse Attention (QSA) layers; QSA selects up to 512 four-token blocks plus the final incomplete block |
| N-gram table | Layer index 2 (zero-based); bigrams and trigrams; 8 hash heads each; 16 rows of 160 values form a 2,560-dimensional vector |
| Configured context limit | 262,144 tokens |
| Served checkpoint | `nvidia/Qwen3.8-Flash-Next-NVFP4`; 132.7 GB (123.6 GiB) of safetensors files |
| Weight precision | NVFP4 routed experts in the main model; BF16 attention and shared experts; FP8 MTP routed experts and n-gram table |

### 5.3. Model size and memory requirements

| Model | Checkpoint size | Conditional-memory table | Rest of checkpoint | Configurations that require table offloading here |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 510.3 GB | ~196.6 GB | ~313.7 GB | 4× DGX Spark |
| Qwen3.8-Flash-Next, NVIDIA NVFP4 | 132.7 GB | ~51.2 GB (47.7 GiB) | ~81.5 GB | 1× DGX Spark; 1× RTX PRO 6000 |

GB means 10⁹ bytes and GiB 2³⁰ bytes. Checkpoint sizes are the safetensors file totals at the recorded revisions (for Qwen, the [NVIDIA checkpoint files](https://huggingface.co/nvidia/Qwen3.8-Flash-Next-NVFP4/tree/fc694b54fb0174e0913e6adf86691ef85a4ead47)). The remaining size is a subtraction, not a measurement of GPU memory after loading; runtime memory figures are given in Section 6.

Offloading moves the table to another memory tier; it remains part of the model. The smaller configurations can then hold the remaining weights together with the memory needed for inference.

---

## 6. Benchmark Results

### 6.1. Methodology

The deployment results below are OpenZeka measurements made with the open-source [CordatusAI LLM Benchmark Tool](https://github.com/CordatusAI/llm-benchmark), with approximately 128 input tokens and an output limit of 128 tokens, ten rounds per concurrency level, and mean values reported. **Concurrency (C)** is the number of simultaneous requests. **TTFT (time to first token)** includes queueing and prompt processing; the first reasoning token also counts when streamed. **TPS (tokens per second)** is the output token count divided by total request time, including TTFT. It is reported per request, not as aggregate throughput. All results are also available in the [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}).

| Run | Hardware | Engine, tensor parallelism (TP) | Speculative decoding | Conditional memory |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 4× DGX Spark | vLLM, TP=4 | DSpark, k=5 | NVMe |
| DeepSeek-V4.1-Flash, 300K | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | In memory |
| DeepSeek-V4.1-Flash, 1M | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | NVMe |
| Qwen3.8-Flash-Next | 1× DGX Spark | SGLang, TP=1 | MTP, 3 speculative steps / 4 draft tokens | NVMe |
| Qwen3.8-Flash-Next | 1× RTX PRO 6000 | SGLang, TP=1 | MTP, 3 speculative steps / 4 draft tokens | Pinned host RAM |

The **two 8× DGX Spark DeepSeek configurations** compare table placement on the same hardware. The other runs answer a different sizing question: once the model fits with offloading, what inference performance does the configuration deliver? Their results are evaluated individually below.

### 6.2. DeepSeek-V4.1-Flash on 4× DGX Spark: fitting the model with Engram-on-disk

Split over four nodes, the full 510 GB checkpoint needs about 128 GB per node — more than a DGX Spark can give the model once the operating system, CUDA context and KV cache are accounted for. With **Engram-on-disk**, each node keeps its share of the Engram rows on local NVMe and stages the rows each step needs into GPU memory before the forward pass. The remaining weights can then be loaded, with the following benchmark results:

| Concurrency (C) | TTFT (ms) | TPS per request (tok/s) |
|---|---|---|
| 1 | 271.6 | 29.5 |
| 2 | 395.8 | 21.3 |
| 4 | 577.4 | 13.1 |
| 8 | 805.9 | 8.8 |

**Why this is useful.** A 763B-parameter model runs across four desktop devices with **29.5 tok/s per request and 272 ms TTFT at C=1**. At C=2 it maintains **21.3 tok/s and 396 ms TTFT**, meeting the Explorer's default targets of at least 20 tok/s and at most 1,000 ms TTFT. Higher concurrency remains possible, reaching 13.1 tok/s at C=4 and 8.8 tok/s at C=8, but with slower responses. For this workload, the configuration supports interactive use at low concurrency.

### 6.3. DeepSeek-V4.1-Flash on 8× DGX Spark: the table in memory vs on NVMe

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

### 6.4. Qwen3.8-Flash-Next on one DGX Spark: fitting a 132.7 GB checkpoint

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

### 6.5. Qwen3.8-Flash-Next on one RTX PRO 6000: fitting the model with host-memory offloading

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

## 7. Discussion

### 7.1. Memory versus NVMe when the model already fits

The 8× Spark DeepSeek comparison is useful when choosing how to allocate memory. Both configurations serve the same model on the same hardware: keeping Engram in memory gives the higher measured TPS, while moving it to disk makes more memory available for KV cache. The choice depends on whether the application values the additional KV-cache capacity enough to accept the observed speed difference.

### 7.2. Running models that exceed GPU memory

The 4× Spark DeepSeek and single-device Qwen runs demonstrate a different benefit: their checkpoints and runtime memory requirements exceed the available memory, yet offloading the lookup tables enables inference at useful per-request speeds. The individual results in Section 6 show both the single-request experience and what happens as concurrency rises.

For workload-specific planning, the [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}) provides the measured TTFT/TPS curves and evaluation against TTFT and TPS targets. Its capacity estimates are planning aids; check whether an estimate accounts for the actual table placement and state pools before applying it to an offloaded run. Use the measured concurrency sweep to check latency and TPS targets; validate memory capacity separately for the offloading configuration.

### 7.3. Model capability

Qwen3.8-Flash-Next has an **Artificial Analysis Intelligence Index of 39.8** in the Explorer's recorded data. This external benchmark score provides context for model selection alongside the measured inference performance. It describes the model rather than validating the quantized deployment on a particular task.

*Intelligence Index v4.3, published by [Artificial Analysis](https://artificialanalysis.ai), retrieved 28 September 2026 and reproduced with attribution.*

Evaluate the served checkpoint on the intended tasks as well as its response speed. The practical gain is access to a capable model with performance that meets the application's requirements on the available device.

### 7.4. Operational requirements

The following requirements are in addition to storing the downloaded checkpoint:

| Requirement | DeepSeek-V4.1-Flash, DGX Spark | Qwen3.8-Flash-Next, DGX Spark | Qwen3.8-Flash-Next, RTX PRO 6000 |
|---|---|---|---|
| Additional storage for offloading | Engram tables on each node's NVMe | ~51.2 GB (47.7 GiB) for the table, plus free space for loading | None beyond the checkpoint files |
| Host memory | Staging buffers in the shared pool | Page cache in the shared pool | ≥64 GB free for pinned allocation and headroom |
| Startup | Patched loader prepares tables on NVMe | Table file written at every start (10–55 min) | Table loaded into RAM |
| Software support | Required community patches on GB10, including the Engram-on-disk path | File-backed offloading requires the compatible SGLang build | Supported in the SGLang cookbook image |

---

## 8. Sizing With Conditional Memory

### 8.1. The revised memory budget

For supported conditional-memory models, budget GPU memory and the offloading destination separately:

> **Required GPU memory (or unified memory) = Remaining model weights + KV cache + Recurrent-state pools + Activations + Offloading buffers and cached pages + Runtime overhead**
>
> **Additional host RAM or NVMe storage = Offloaded tables + Loading buffers / free-space allowance**

On Spark, the OS also uses unified memory. Cached file pages must be included in that shared budget. On a discrete GPU, pinned tables occupy separate host RAM. Freed table space therefore does not translate one-for-one into request capacity.

Use the Local LLM Usage Guide's headroom advice as a planning allowance, then check the engine's actual allocation and peak usage. A configured memory fraction is not interchangeable with a blanket percentage added to checkpoint size.

### 8.2. Sizing checklist

- ☐ Identify the served checkpoint's remaining model weights and conditional-memory tables separately, including their precision.
- ☐ Verify engine support for the model and destination: pinned host RAM or file-backed storage in the configurations examined here.
- ☐ Budget resident caches, buffers and OS memory as well as the offloaded table.
- ☐ Reserve KV and recurrent-state pools for the required context and concurrency; check effective engine limits.
- ☐ Measure response speed for that workload, including startup and cold-cache performance where relevant.
- ☐ Validate model quality on the intended tasks; an external capability score is only a starting point.

One sizing mistake to avoid is treating all offloading as equivalent. Check **which data moves, how much is accessed, and when it must arrive** before deciding whether a larger model is practical.

---

## 9. Conclusion and Outlook

**Summary of findings:**

| Question | Answer |
|---|---|
| Can conditional memory leave GPU memory? | Yes — the tables are large, but each token retrieves only a few kilobytes, at addresses known in advance |
| Where does it go? | Local NVMe on DGX Spark; separate pinned host RAM on RTX PRO 6000 |
| What does the same-hardware comparison show? | On 8× Spark, the disk configuration reports ~21 GB more KV-cache allocation per node with 7.5% lower TPS at C=1 and 14% lower TPS at C=8 |
| What performance do the smaller configurations achieve? | DeepSeek on 4× Spark: 29.5 tok/s at C=1; Qwen on one Spark: 28.5 tok/s at C=1; Qwen on RTX PRO 6000: 43.2 tok/s per request at C=16 |
| What does it gain? | Models that otherwise do not fit (763B on 4× DGX Spark, 132.7 GB checkpoint on one DGX Spark or RTX PRO 6000), and more KV capacity (300K → 1M configured limit on 8× DGX Spark) |
| What does it cost? | Startup time, NVMe space or locked host RAM, and dependence on engine support |

**Outlook.** Some recent architectures separate what must be computed from what only needs to be stored. Mixture-of-Experts separated active from total parameters; conditional memory, as used in the two models examined here, adds a large parameter pool whose access pattern suits slower memory tiers. Whether other models adopt it remains to be seen. If they do, and inference engines support it, the same hardware may run more capable models by using host RAM and storage for suitable components. Realizing that benefit requires enough GPU memory for the remaining weights and request state, efficient data transfers, and acceptable measured latency.

---

## Glossary (Terms)

- **Active parameters:** Parameters used for a token; their precision and reuse help determine weight traffic.
- **Checkpoint:** Saved model weights and associated metadata; file size and runtime memory usage are different quantities.
- **Conditional memory:** A lookup table of learned vectors, addressed by hashed n-grams of the input tokens and combined with the hidden state at selected layers. The term was introduced in DeepSeek's Engram paper.
- **Decode:** Incremental response generation; often limited by memory bandwidth at small batch sizes.
- **Embedding:** A learned vector representing a token or token sequence.
- **Engram:** DeepSeek's conditional-memory module, used in DeepSeek-V4.1-Flash.
- **Gated DeltaNet:** A linear-attention layer that keeps a fixed-size state per request instead of a growing KV cache.
- **Hash head:** One of several independent hash functions that map an n-gram to a row of the table.
- **Hidden state:** The vector representation of a token as it passes through the model's layers.
- **KV cache:** Cached attention keys and values; its size depends on the attention architecture, context length, precision and concurrent requests.
- **Lookup table:** A table read by fetching the rows addressed by a key; conditional-memory tables are read this way.
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
