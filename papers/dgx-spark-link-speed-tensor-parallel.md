---
title: Network Link Speed for Tensor-Parallel Inference on DGX Sparks (200G vs 100G)
parent: White Papers
nav_order: 12
lang: en
page_id: dgx-spark-link-speed-tensor-parallel
date: 2026-10-15
card_tag: "Technical Guide"
description: >-
  How much network bandwidth a tensor-parallel DGX Spark cluster really uses, and what
  running each DGX Spark at 100G instead of 200G costs: the mechanism, an estimate from
  the model's architecture, and measurements with GLM-5.3 at TP8 and with GLM-5.3-Flash
  at TP4 on real 100G links.
permalink: /papers/dgx-spark-link-speed-tensor-parallel/
last_modified_date: 2026-11-23
toc: true
---

> **Publication date:** October 2026
> **Scope:** How tensor-parallel (TP) inference uses the network between DGX Spark systems, how to estimate the effect of halving the link speed from the model's architecture and the inference engine's settings, a measured comparison of 200 Gb/s and emulated 100 Gb/s links on 8× DGX Spark with GLM-5.3 at TP8, and of 200 Gb/s and real 100 Gb/s links on 4× DGX Spark with GLM-5.3-Flash at TP4.
> **Note:** The measurements apply to the models, inference engines, versions and settings listed in Sections 7 and 12. The estimation method of Sections 3–6 carries over to other models and settings; the measured numbers do not.

{% include company/block.html name="prepared_by" %}

---

{:.no_toc}
## Table of contents

* TOC
{:toc}

---

## Executive Summary

- **The question:** a DGX Spark cluster that serves one model with tensor parallelism across several systems needs fast switch ports. At 200 Gb/s per Spark, a MikroTik CRS812 connects 4 to 6 Sparks; at 100 Gb/s, it connects 8. A CRS804 connects 8 Sparks at 200 Gb/s or 16 at 100 Gb/s. This paper asks what 100 Gb/s per Spark costs in inference speed.
- **How tensor parallelism uses the network:** each Spark holds one eighth of every weight matrix, so each computes only part of every result. Twice per layer, the Sparks add their partial results together over the network in an operation called an *all-reduce*, which NCCL, the communication library, runs as a *ring* for the large transfers that matter here. While the prompt is processed (*prefill*), the data summed in each all-reduce is large; while the answer is generated (*decode*), it is small.
- **The estimate:** prefill transfers are large enough to run at the full link speed, so halving the link lengthens them and delays the first token. For GLM-5.3 at TP8, the estimate from the model's architecture is at most **0.135 s of extra time to first token (TTFT) per 1,000 prompt tokens** at 100 Gb/s. Decode transfers are too small for link speed to matter.
- **Does the cluster use the full 200 Gb/s? Yes and no.** Measured at millisecond resolution, prefill traffic reaches 150–200 Gb/s in bursts of a few milliseconds. Averaged over one second, the same traffic is about 40 Gb/s, and decode stays at a few Gb/s.
- **Measured** with GLM-5.3 at TP8, 200 Gb/s against an emulated 100 Gb/s link (which carries up to 109 Gb/s):
  - **decode speed does not change** (−2.3% to +4.3%, within the variation between test rounds);
  - **TTFT grows by 12.6–13.9%** for single prompts of 8K–64K tokens, about **0.11 s per 1,000 prompt tokens**, close to the estimate;
  - with **four long prompts arriving together**, each request's TTFT grows by **17.9–22.5%**;
  - **short prompts are not affected** (+1% at 1K tokens).
- **Trying 100 Gb/s before buying cables:** restricting NCCL to one of the two network interfaces of each Spark emulates a 100 Gb/s link on the existing 200 Gb/s cabling. A workload run this way, with the result converted to a real link, shows what 100 Gb/s would cost it before any hardware changes.
- **A real 100 Gb/s link**, built with a 4 × 100G breakout cable, carries about 98 Gb/s and would add at most another 3–4 percentage points.
- **Measured on real 100 Gb/s links** with GLM-5.3-Flash at TP4 on 4 Sparks, the first token of an 8K-token prompt arrived 0.39 s later, against an estimate of at most 0.38 s, and decode speed did not change. Moving Sparks to 100 Gb/s needs no change on the Sparks themselves, but they have to be rebooted after recabling.
- **Verdict:** 100 Gb/s is reasonable for tensor-parallel DGX Spark clusters up to TP8. Moving an 8-Spark TP8 cluster from 200 Gb/s to 100 Gb/s links, expect the first token to arrive **at most about 20% later for a very long prompt**, and **at most about 30% later when several very long prompts arrive at the same time**. At TP4 on four Sparks, the penalty measured on real links followed the same estimate. Short to medium prompts see no change, and once the answer starts, **it streams at the same pace**. On 16 Sparks, run two TP8 clusters rather than one TP16 cluster: the penalty grows with TP size.

---

## 1. Introduction

A single DGX Spark holds 128 GB of unified memory. Models larger than that are served by splitting them across several Sparks connected through their ConnectX-7 network adapters and a switch. With **tensor parallelism**, every layer of the model is split across all the Sparks, so they exchange data many times for every token the model processes, and every step of inference waits for the network.

That makes the switch a design decision. Running each Spark at 100 Gb/s instead of 200 Gb/s lets a smaller switch serve the same cluster, or the same switch serve twice as many Sparks. Whether that is acceptable depends on how much tensor-parallel inference slows down when the link between the Sparks is half as fast.

Part I of this paper (Sections 2–6) describes what tensor parallelism sends over the network, why prompt processing and answer generation load the network very differently, and how to estimate the effect of halving the link speed from the model's architecture, the inference engine's settings and the link speed alone. Part II (Sections 7–10) shows how to emulate a 100 Gb/s link on the existing 200 Gb/s cabling, so that a workload can be tried at 100 Gb/s before any cable is bought; it applies the emulation to 8× DGX Spark serving GLM-5.3 at TP8, compares the results with the estimate, and converts them to a real 100 Gb/s cable. Part III (Sections 11–13) is the next step once the emulated result is acceptable: it builds real 100 Gb/s links for 4 Sparks and measures GLM-5.3-Flash at TP4 on them. Section 14 gives the sizing answer for clusters of 4, 8 and 16 Sparks.

---

# Part I: Theory

## 2. The DGX Spark Network

### 2.1. The ConnectX-7 adapter and its two PCIe links

Each DGX Spark has a ConnectX-7 network adapter with two QSFP ports. The clusters in this paper use one port per Spark, cabled to the switch at a nominal link speed of 200 Gb/s.

The adapter is connected to the GB10 chip over PCIe Gen5, through two separate links of four lanes (×4) each. One ×4 link carries a little over 100 Gb/s of data (Section 7.3), not enough to keep a 200 Gb/s port busy on its own; two links together can. Linux sees the adapter once per PCIe link, so the single physical port appears twice: as two network interfaces (`enp1s0f1np1` and `enP2p1s0f1np1`), each with its own RDMA device. Both interfaces report a link speed of 200 Gb/s, because both belong to the same port, but each can move only what its own PCIe link carries.

NCCL, the library the inference engine uses for communication between the Sparks, treats the two RDMA devices as two separate network paths and spreads its traffic across both; only together do they reach the port's 200 Gb/s. The same arrangement makes it possible to try 100 Gb/s without touching the hardware: restricting NCCL to one of the two interfaces limits every Spark to what one PCIe link can carry, close to what a 100 Gb/s link carries (Section 7.3).

The traffic between the Sparks uses RDMA (remote direct memory access): the adapter reads data from the sending application's memory and writes it directly into the receiving application's memory, without the data passing through the operating system's network stack. This keeps the delay of each transfer low. It is also why the usual Linux network statistics do not show this traffic (Appendix A). Here, RDMA runs over ordinary Ethernet using RoCE v2 (RDMA over Converged Ethernet, version 2), which carries RDMA packets inside UDP/IP.

### 2.2. The link is the slowest path in the system

200 Gb/s is 25 GB/s. A DGX Spark reads its own memory at 273 GB/s, about 11 times faster. Anything that has to cross the network between Sparks therefore moves far more slowly than anything a Spark reads from its own memory, which is why the amount of data tensor parallelism sends over the network, and how it is timed, decides how much the link speed matters.

### 2.3. Switches and breakout options

The CRS804 and CRS812 have 400 Gb/s QSFP-DD ports. A breakout cable splits each such port into several slower links, one per Spark:

| Switch | 400G QSFP-DD ports | Sparks at 200 Gb/s (2 × 200G per port) | Sparks at 100 Gb/s (4 × 100G per port) |
|---|---|---|---|
| MikroTik CRS812 | 2 (plus 2 × 200G QSFP56) | 4 (6 with the QSFP56 ports) | **8** |
| MikroTik CRS804 | 4 | **8** | **16** |

At 100 Gb/s per Spark, an 8-Spark cluster fits on a CRS812, and a CRS804 can serve 16 Sparks.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/network-topology.png' | relative_url }}" alt="CRS812 with 8 Sparks at 100 Gb/s, CRS804 with 8 Sparks at 200 Gb/s and with 16 Sparks at 100 Gb/s" width="820"/></p>
<sub><i>Figure 1: Breakout options, one link per DGX Spark.</i></sub>

---

## 3. How Tensor Parallelism Uses the Network

### 3.1. Splitting the model

In tensor parallelism with 8 Sparks (TP8), every large weight matrix of the model is cut into 8 slices, and each Spark holds one slice. In the attention blocks, the attention heads are divided among the Sparks. In the feed-forward and Mixture-of-Experts (MoE) blocks, every expert's matrices are sliced as well, so each Spark holds a part of every expert. Each Spark reads only its own eighth of the weights from its own memory, which is what lets a model larger than one Spark fit, and run faster than it would if each Spark had to read everything.

### 3.2. Partial results and the all-reduce

Splitting a weight matrix this way means that no Spark can finish a multiplication on its own. Each output value of a layer is a long sum of products of weights and inputs; with the weights divided eight ways, each Spark computes one eighth of that sum. The values involved are the model's *activations*: the vectors that represent each token as it passes through the layers. GLM-5.3 represents each token as a vector of 6,144 values (its *hidden dimension*). For a prompt processed 4,096 tokens at a time, every Spark ends up holding 4,096 × 6,144 partial values, which is 50.3 MB at 2 bytes per value. The actual result is the sum of the eight Sparks' blocks, and every Spark needs that full sum before the model can continue.

Producing it is the job of an **all-reduce**: *reduce* because the blocks are combined (here, added), *all* because every participant receives the result. A transformer layer needs two, one after the attention block and one after the feed-forward or MoE block, and one more is needed at the input embedding. Every Spark waits at each all-reduce until all eight have contributed, so the network sits on the path of every layer.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp-layer-allreduce.png' | relative_url }}" alt="One transformer layer under TP8 with its two all-reduces, and the ring of 8 Sparks" width="820"/></p>
<sub><i>Figure 2: One transformer layer under tensor parallelism, and the ring all-reduce among 8 Sparks.</i></sub>

### 3.3. How the ring all-reduce works

The direct approach, every Spark sending its whole block to the other seven, would make each Spark send 7 × 50.3 MB, and the load would grow with every Spark added. For transfers of this size, NCCL uses a **ring** instead (Section 3.4). The Sparks are arranged in a circle, each sends only to the next one, and each block is cut into as many segments as there are Sparks. The work then runs in two phases, shown for four Sparks in Figure 3.

In the first phase, *reduce-scatter*, each Spark sends one segment to the next Spark in every ring step, and the receiving Spark adds it to its own copy of that segment. Every Spark works on a different segment at the same time, so after N − 1 ring steps each Spark holds the complete sum of exactly one segment. In the second phase, *all-gather*, the finished segments travel around the ring once more, copied rather than added, until after another N − 1 ring steps every Spark has the full sum.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/ring-allreduce-steps.png' | relative_url }}" alt="Ring all-reduce among four Sparks, step by step: reduce-scatter in three ring steps, then all-gather in three ring steps" width="820"/></p>
<sub><i>Figure 3: Ring all-reduce among four Sparks. After the three reduce-scatter steps, each Spark holds one complete sum; after the three all-gather steps, every Spark holds all four.</i></sub>

In each of the 2 × (N − 1) ring steps, a Spark sends one segment, 1/N of its block. Each Spark therefore sends **2 × (N − 1) / N** times the block in total: 1.75× for eight Sparks, and never more than 2× however many take part. For GLM-5.3 at TP8, each Spark sends 1.75 × 50.3 MB = **88.1 MB** per all-reduce, in 14 ring steps of about 6.3 MB. Since every Spark sends the same amount, the traffic measured on one Spark represents all eight.

Summed over every all-reduce in the model (78 layers × 2, plus 1), each prompt token costs each Spark

> (2 × 78 + 1) × 6,144 values × 2 bytes × 1.75 = **3.38 MB** of network traffic.

Part II checks this figure against the measured traffic.

### 3.4. Ring or tree: which all-reduce NCCL runs

The ring is not the only way to perform an all-reduce. Inference engines have their own all-reduce kernels, but these work only between GPUs in one machine or one NVLink domain, so between DGX Sparks every all-reduce goes through NCCL ([vLLM](https://github.com/vllm-project/vllm/blob/main/vllm/distributed/device_communicators/custom_all_reduce.py), [SGLang](https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/distributed/parallel_state.py)). NCCL has a **tree** algorithm besides the ring, and several more that need special hardware: in-network reduction in the switch (CollNet, with NVIDIA SHARP) or an NVSwitch (NVLS). One more, PAT, is used only for other collective operations. Between DGX Sparks, each with one GPU and connected over Ethernet, an all-reduce therefore runs either as a ring or as a tree ([NCCL environment variables](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/env.html), `NCCL_ALGO`).

NCCL's tree is a *double binary tree*. The data is split in half, and each half is summed along its own binary tree: partial sums flow up to the root, and the result flows back down. The two trees are arranged so that a Spark that forwards data in one tree is a leaf in the other ([NCCL 2.4: double binary trees](https://developer.nvidia.com/blog/massively-scale-deep-learning-training-nccl-2-4/)). Figure 4 shows both algorithms for four Sparks.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/allreduce-ring-vs-tree.png' | relative_url }}" alt="Ring and double binary tree all-reduce among four Sparks, with the amount each Spark sends" width="820"/></p>
<sub><i>Figure 4: Ring and tree all-reduce among four Sparks, with the amount each Spark sends as a multiple of its block.</i></sub>

The two trade time in different ways. A ring passes through 2 × (N − 1) steps in sequence, so the fixed delay of every step adds up in proportion to the number of Sparks; a tree needs only about log₂ N steps up and as many down. In bytes, the ring is the most economical all-reduce possible, and every Spark sends the same amount ([Patarasuk & Yuan, 2009](https://www.cs.fsu.edu/~xyuan/paper/09jpdc.pdf)); in a tree, Sparks in different positions send different amounts, and the busiest send more than in a ring. The tree is faster when fixed delays dominate, with small transfers or many Sparks; the ring is faster when moving the bytes dominates, with large transfers.

NCCL makes this choice for every single all-reduce. It estimates the time of each algorithm and transfer protocol as a fixed latency plus the amount of data divided by an effective bandwidth, from the size of the transfer, the number of Sparks and the topology it detects, and runs the fastest ([Understanding NCCL tuning](https://developer.nvidia.com/blog/understanding-nccl-tuning-to-accelerate-gpu-to-gpu-communication); [Demystifying NCCL](https://arxiv.org/abs/2507.04786)). Unless an algorithm is forced with `NCCL_ALGO`, which none of the runs in this paper did, the choice changes during inference with the size of each all-reduce. The 50.3 MB blocks of prefill are large enough that moving bytes dominates, and NCCL runs them as a ring; the small all-reduces of decode (Section 4.2) may run as a tree. Link speed matters only for the first kind, so the ring formula of Section 3.3 describes exactly the transfers that a slower link delays. The choice can be read from NCCL's log (`NCCL_DEBUG=INFO` with `NCCL_DEBUG_SUBSYS=TUNING`), or from the traffic: under a ring, every Spark sends the same number of bytes (Section 13.2).

### 3.5. What changes with the number of Sparks

Adding Sparks divides the computation, but not the data that has to be summed. Only the weights are split: each Spark computes a part of the sum for every output value, so its block of partial values stays 4,096 × 6,144 values (50.3 MB) whether the model runs on two Sparks or sixteen. Each doubling of the TP size halves each Spark's computation, while the amount each Spark sends per all-reduce, 2 × (N − 1) / N times the block, grows slightly:

| TP size | Computation per Spark | Sent per Spark per all-reduce |
|---|---|---|
| TP2 | 1/2 of the model | 1.0 × 50.3 MB = 50.3 MB |
| TP4 | 1/4 | 1.5 × 50.3 MB = 75.5 MB |
| TP8 | 1/8 | 1.75 × 50.3 MB = 88.1 MB |
| TP16 | 1/16 | 1.875 × 50.3 MB = 94.3 MB |

Going from TP8 to TP16 thus halves the time each Spark spends computing but leaves the time it spends sending almost unchanged, so the network takes a larger share of every forward pass. Section 6.3 works out what this means for link speed.

---

## 4. Prefill and Decode: Two Different Loads on the Network

Inference runs in two phases that use the network in opposite ways. How much data each all-reduce carries depends on how many tokens one forward pass through the model processes, which the inference engine's settings decide; the values below follow the vLLM configuration used in Part II.

### 4.1. Prefill: large transfers at full link speed

During prefill, vLLM processes the prompt in prefill chunks of up to 4,096 tokens per forward pass (`--max-num-batched-tokens 4096`), so each all-reduce sums the 50.3 MB block of Section 3.2 and each Spark sends 88.1 MB:

| Link speed | Time to send 88.1 MB |
|---|---|
| 200 Gb/s | **3.5 ms** |
| 100 Gb/s | **7.0 ms** |

Every transfer also carries some fixed overhead in software, synchronisation and the network hardware. Even a generous 100 µs of such overhead is small next to these times: at 200 Gb/s the link moves only 2.5 MB in 100 µs, against the 88.1 MB to be sent. The duration of a prefill all-reduce is therefore set almost entirely by how fast the link moves bytes; in other words, prefill communication is **bandwidth-bound**. Between all-reduces the Sparks compute the next part of the layer, so prefill traffic should appear as bursts of a few milliseconds at or near full link speed, separated by gaps of computation. Halving the link speed doubles the length of every burst and delays the first token.

### 4.2. Decode: small transfers dominated by fixed delays

During decode, each forward pass processes only the newest token of each request. With speculative decoding by multi-token prediction (MTP), as configured in Part II, the model also checks 4 draft tokens in the same pass, so it processes 5 tokens per request. Each all-reduce then sums 5 × 6,144 × 2 bytes = **61 KB**, of which each Spark sends about **108 KB**. Per forward pass, including collecting the output layer's token scores, each Spark sends about **18 MB**.

Sending 108 KB takes 4.3 µs at 200 Gb/s and 8.7 µs at 100 Gb/s. The all-reduce, however, passes through a series of steps, 14 in a ring of eight Sparks and fewer in a tree (Section 3.4), and each one carries a fixed delay of software, synchronisation and network hardware. RDMA transfers between two systems take on the order of microseconds even for tiny amounts of data, so these delays add up to more than the time spent sending bytes. Decode communication is therefore **latency-bound**, and its duration depends little on the link speed.

The total amount of decode traffic is also limited. Every forward pass must at least read the model's active weights from memory. GLM-5.3 has about 40 billion active parameters per token, most stored in NVFP4, NVIDIA's 4-bit floating-point format, at about 4.5 bits per weight including its scaling factors. That is about 2.8 GB per Spark, which takes at least **10 ms** to read at 273 GB/s. Even if every forward pass ran at that limit, decode traffic would stay at or below about **14 Gb/s** for one request, far below 100 Gb/s, and halving the link would add at most 0.7 ms to each pass of 10 ms or more. In practice it adds much less, because the transfers are latency-bound.

The network therefore decides how fast a prompt is read, not how fast the answer is written. Workloads with long prompts, such as retrieval-augmented generation, long documents or agents with large contexts, are where link speed matters. Short chat prompts hardly touch it, and decode speed should not change at all.

---

## 5. Estimating the Effect of Halving the Link

### 5.1. The upper bound

If every prefill transfer runs at the full link speed and none overlaps with computation, then lowering the link speed from B_old to B_new adds exactly the extra time needed to send the same bytes:

> **extra prefill time ≤ prefill bytes per Spark × (1 / B_new − 1 / B_old)**

This is an upper bound: transfers that overlap with computation, or never reach full speed, add less. It needs only the bytes per prompt token from Section 3.3 and the prompt length, and nothing about how fast the Sparks compute.

From 200 to 100 Gb/s, (1/100 − 1/200) = 1/200, so the extra time equals the time the prefill bytes take to send at 200 Gb/s. For GLM-5.3 at TP8:

> **extra TTFT ≤ 3.38 MB × 8 bits ÷ 200 Gb/s = 0.135 s per 1,000 prompt tokens**

### 5.2. The six test cases

| Test | Prompt tokens | Prefill bytes per Spark | Extra prefill time, 200 → 100 Gb/s |
|---|---|---|---|
| P1: 1K prompt, 1 request | 1,024 | 3.5 GB | ≤ +0.14 s |
| P2: 8K prompt, 1 request | 8,192 | 27.7 GB | ≤ +1.11 s |
| P3: 32K prompt, 1 request | 32,768 | 110.6 GB | ≤ +4.43 s |
| P4: 4 × 8K prompts, arriving together | 32,768 | 110.6 GB | ≤ +4.43 s |
| P5: 64K prompt, 1 request | 65,536 | 221.3 GB | ≤ +8.85 s |
| P6: 4 × 16K prompts, arriving together | 65,536 | 221.3 GB | ≤ +8.85 s |

For the tests with four requests, the bytes are those of all four prompts, and the time is that until the last of the four requests receives its first token.

### 5.3. From seconds to a percentage

As a share of TTFT, the bound becomes

> **TTFT increase ≤ network share × (B_old / B_new − 1)**, which is simply **≤ network share** for 200 → 100 Gb/s,

where the **network share** is the time needed to send the prefill bytes at 200 Gb/s, divided by the prefill time.

The prefill time itself cannot be derived reliably from the architecture. A calculation from the number of arithmetic operations and the GB10's peak compute would be off by an order of magnitude, because the real speed depends on how efficiently the engine's kernels handle the MoE experts, attention and scheduling. The percentage therefore needs one measured input, the TTFT at 200 Gb/s, which Part II provides.

---

## 6. What Makes the Penalty Larger or Smaller

Since the penalty is at most the network share of prefill time, anything that raises that share raises the penalty.

### 6.1. Prompt length

Every prompt token costs the same 3.38 MB, so the bytes grow in proportion to the prompt. The matrix computation grows in proportion as well. Attention, which compares each token with the tokens before it, grows faster than the prompt in a model where every token attends to the whole context; there, the network share, and with it the percentage penalty, slowly falls for very long prompts. GLM-5.3 uses DeepSeek Sparse Attention (DSA), in which each token attends to a selected set of about 2,048 earlier tokens, so its computation stays close to proportional to the prompt and the **percentage penalty should stay roughly constant** for long prompts. In seconds, the penalty keeps growing with prompt length in either case.

Short prompts are different. A 1K-token prompt fits in one small prefill chunk, and each of its all-reduces sends only about 22 MB per Spark, under a millisecond at 200 Gb/s. Such short transfers may not reach the full link speed, and the fixed overhead of each forward pass weighs more, so the bound can overstate the effect.

### 6.2. Several requests at once

When several prompts arrive together, their prefill chunks share the forward passes. The bytes per prompt token stay the same, but the computation per token falls, because each prompt attends over a shorter context and the work runs in fuller batches. More of the time is spent communicating, so the penalty is larger than for one prompt of the same total length. The order in which the engine processes the prompts, and when the first of them start generating, also affects each request's own TTFT.

### 6.3. TP size

Relative to TP8, the bytes per Spark per token and the computation per Spark change as follows:

| TP size | Bytes per Spark | Computation per Spark |
|---|---|---|
| TP2 | 0.57× | 4× |
| TP4 | 0.86× | 2× |
| TP8 | 1× | 1× |
| TP16 | 1.07× | 0.5× |

The network share, and with it the penalty, grows quickly with TP size: lower link speed is easiest to accept at low TP sizes and costs more as a model is spread across more Sparks. Section 10 puts numbers on this using the measured TP8 baseline.

---

# Part II: Measurement

## 7. Test Design

### 7.1. Changing only the link

The comparison is useful only if the link speed is the single difference between the two configurations. The same model, engine, settings, prompts and test plan were used in both; only the network path changed.

### 7.2. Setup

| Item | Value |
|---|---|
| Systems | 8× NVIDIA DGX Spark (GB10, 128 GB unified memory), driver 580.173.02 |
| Switch | MikroTik CRS804, 400G QSFP-DD ports in 2 × 200G breakout |
| Model | GLM-5.3 NVFP4 (`Inferact/GLM-5.3-NVFP4`): 753B-parameter MoE, about 40B active per token; hidden dimension 6,144; 78 layers; DeepSeek Sparse Attention |
| Engine | vLLM `0.1.dev20133+gb5f995e73` (container `vllm-node-b12x`), PyTorch 2.13, NCCL 2.31.2, Ray |
| Parallelism | TP8: one model instance across all 8 Sparks |
| Key settings | prefill chunks of up to 4,096 tokens, FP8 KV cache, speculative decoding with MTP (4 draft tokens; the draft model is not split across Sparks, so it adds no network traffic), CUDA graphs, up to 8 concurrent requests |

GLM-5.3 is a large MoE model that needs all 8 Sparks, which is the case where the cluster network matters most.

### 7.3. Emulating 100 Gb/s on the existing cables

A 100 Gb/s link can be tried before any 100G cable is bought. NCCL is configured to use only one of the two network interfaces on every Spark, by excluding the second RDMA device in the inference engine's environment:

```
NCCL_IB_HCA=^roceP2p1s0f1
```

(`ibdev2netdev` lists the RDMA device names.) Nothing physical changes, so the cables, switch ports and every other setting stay the same, and relaunching the model without this setting restores 200 Gb/s. The RDMA counters (Appendix A) confirm that all traffic goes over the one remaining interface; in every emulated run of this paper, they did.

This is how a workload can be tested at 100 Gb/s on an existing 200 Gb/s cluster: run it once at 200 Gb/s and once emulated, convert the difference to a real link (Section 9), and move to 100G cables (Section 11) if the result is acceptable. Part II applies it to GLM-5.3 at TP8 with the test plan of Section 7.4. The open-source tool [netinfermon](https://github.com/openzeka/netinfermon) runs such a comparison: the same test plan against the inference engine at both link speeds, with the RDMA traffic recorded on the same clock (Appendix A).

One interface carries what its PCIe Gen5 ×4 link allows: 4 lanes × 32 GT/s, reduced by line encoding (128b/130b) to 126 Gb/s and by PCIe packet and flow-control overhead to about **111 Gb/s**. Measured with `ib_write_bw`, one interface carries **109 Gb/s**. The emulated link is therefore about 11% faster than a real 100 Gb/s link, which carries 98 Gb/s (Section 12.3); Section 9 converts for the difference.

With B_new = 109 Gb/s instead of 100, the bound of Section 5.1 becomes

> **extra prefill time ≤ prefill bytes × (1/109 − 1/200)**, about **0.11 s per 1,000 prompt tokens** for GLM-5.3 at TP8

| Test | Estimate, 200 → 100 Gb/s (Section 5.2) | Estimate, 200 → 109 Gb/s (this experiment) |
|---|---|---|
| P1: 1K | ≤ +0.14 s | ≤ +0.12 s |
| P2: 8K | ≤ +1.11 s | ≤ +0.92 s |
| P3: 32K | ≤ +4.43 s | ≤ +3.69 s |
| P4: 4 × 8K | ≤ +4.43 s | ≤ +3.69 s |
| P5: 64K | ≤ +8.85 s | ≤ +7.39 s |
| P6: 4 × 16K | ≤ +8.85 s | ≤ +7.39 s |

Section 9 converts the measured results back to a real 100 Gb/s cable, and Section 12.3 measures one.

### 7.4. Test plan

| Test | Requests | Prompt → output tokens | Purpose |
|---|---|---|---|
| P1 | 1 | 1,024 → 1,024 | a short prompt, with small transfers |
| P2 | 1 | 8,192 → 1,024 | a typical long prompt |
| P3 | 1 | 32,768 → 1,024 | a long document |
| P4 | 4, arriving together | 4 × 8,192 → 1,024 | several requests, same total prompt size as P3 |
| P5 | 1 | 65,536 → 1,024 | a very long prompt |
| P6 | 4, arriving together | 4 × 16,384 → 1,024 | several requests, same total prompt size as P5 |

Each test ran one warm-up round, which is not counted, and three measured rounds. The output was fixed at exactly 1,024 tokens, so every request did the same amount of decoding and decode speeds are directly comparable.

### 7.5. What was measured

- **TTFT (time to first token):** the time from sending a request to receiving its first token. For P4 and P6, the time until the last of the four requests receives its first token is also reported; it covers all four prompts' bytes and is the quantity the estimate describes.
- **Decode speed:** how fast the answer streams, in tokens per second after the first token: (output tokens − 1) ÷ (time of the last token − time of the first token). A tokens-per-second figure that divides by the whole request time, TTFT included, is not used for decode comparisons, because it falls with long prompts even when decode speed does not change.
- **Network traffic:** bytes and rates from the RDMA counters of one Spark's ConnectX-7 (Appendix A). Under a ring all-reduce every Spark sends the same amount, so one Spark represents all eight.

### 7.6. Keeping the runs comparable

Prompts were taken from a fixed prompt set and padded to the target length with a fixed random seed, so both configurations received identical prompts. Each request's padding was ordered differently, so the engine could not reuse work cached from an earlier request. Services not needed for the test were stopped on all Sparks, and each run started only after the link had carried no traffic for 10 seconds. Requests and traffic samples were timestamped on the same Spark and clock, so the traffic of each request's prefill and decode can be separated exactly.

All measured rounds are used and reported as means, with the range across rounds. The rounds were consistent: within a test, prefill times varied by at most 0.6 s for single requests and 1.2 s for four requests.

---

## 8. Results: 200 Gb/s vs Emulated 100 Gb/s at TP8

### 8.1. How much of the 200 Gb/s the cluster uses

Figure 5 shows the traffic one Spark sends during one 8K-token request on the 200 Gb/s cluster. During prefill, bursts of a few milliseconds near full link speed alternate with gaps in which the Sparks compute, as Section 4.1 describes; in the 200 ms zoom, each burst is one prefill all-reduce. After the first token, decode traffic is low and steady.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-200g-p2-annotated.png' | relative_url }}" alt="One 8K-token request at 200 Gb/s: prefill bursts, the first token, and the decode traffic, with a 200 ms zoom inside prefill" width="820"/></p>
<sub><i>Figure 5: One 8K-token request at 200 Gb/s, traffic sent by one Spark in 1 ms intervals; below, a 200 ms window inside prefill.</i></sub>

Measured in 1 ms intervals, the bursts of single 8K–64K prompts reach about 150–180 Gb/s, and those of four prompts arriving together close to 200 Gb/s. Averaged over a whole 8K prefill, however, the traffic is 37 Gb/s, because the link carries nothing while the Sparks compute. Decode averages about **3 Gb/s** for one request and about **6 Gb/s** for four, within the limits estimated in Section 4.2. The cluster uses the full 200 Gb/s, but only for a few milliseconds at a time.

The averaging interval decides which of these two pictures a measurement shows. The same 8K prefill gives these highest values:

| Averaging interval | Highest value |
|---|---|
| 1 ms | 181 Gb/s |
| 5 ms | 96 Gb/s |
| 100 ms | 44 Gb/s |
| 1 s | 40 Gb/s |
| whole prefill (average) | 37 Gb/s |

A switch that reports one-second averages would show about 40 Gb/s and suggest a nearly idle link. The bursts that determine TTFT are only visible at millisecond resolution (Appendix A).

### 8.2. The traffic in each test

Figures 6–11 show the traffic one Spark sends during the three measured rounds of each test, with 200 Gb/s on top and the emulated 100 Gb/s below, on the same time axis. The grey band is prefill, ending at the first token.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p1-1k-200g-vs-100g.png' | relative_url }}" alt="1K-token prompt: network traffic at 200 Gb/s and emulated 100 Gb/s" width="820"/></p>
<sub><i>Figure 6: P1, 1K-token prompt, 1 request.</i></sub>

With a 1K prompt, the prefill bursts reach only about 100 Gb/s even on the 200 Gb/s cluster, below what one interface can carry, so the emulated link does not slow them down. TTFT is the same at both link speeds: 0.96 s and 0.97 s.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p2-8k-200g-vs-100g.png' | relative_url }}" alt="8K-token prompt: network traffic at 200 Gb/s and emulated 100 Gb/s" width="820"/></p>
<sub><i>Figure 7: P2, 8K-token prompt, 1 request.</i></sub>

With an 8K prompt, prefill runs at about 150–180 Gb/s at 200 Gb/s. On the emulated link the same bursts are held at about 105–109 Gb/s and take longer, and TTFT grows from 6.36 s to 7.24 s. Decode traffic looks the same in both panels.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p3-32k-200g-vs-100g.png' | relative_url }}" alt="32K-token prompt: network traffic at 200 Gb/s and emulated 100 Gb/s" width="820"/></p>
<sub><i>Figure 8: P3, 32K-token prompt, 1 request.</i></sub>

The 32K prompt shows the same pattern over a longer prefill, with TTFT growing from 27.0 s to 30.6 s.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p4-4x8k-200g-vs-100g.png' | relative_url }}" alt="Four 8K-token prompts arriving together: network traffic at 200 Gb/s and emulated 100 Gb/s" width="820"/></p>
<sub><i>Figure 9: P4, four 8K-token prompts arriving together.</i></sub>

With four prompts arriving together, prefill keeps the 200 Gb/s link close to fully used, while the emulated link stays at 109 Gb/s throughout. The time until the last first token grows from 23.0 s to 26.4 s. Decode traffic is higher with four requests, but still far below either link speed.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p5-64k-200g-vs-100g.png' | relative_url }}" alt="64K-token prompt: network traffic at 200 Gb/s and emulated 100 Gb/s" width="820"/></p>
<sub><i>Figure 10: P5, 64K-token prompt, 1 request.</i></sub>

The 64K prompt behaves like the 32K prompt over twice the length: bursts of about 150–180 Gb/s at 200 Gb/s, held at 109 Gb/s on the emulated link, and TTFT growing from 55.5 s to 62.5 s. The three rounds agree within 0.2 s.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p6-4x16k-200g-vs-100g.png' | relative_url }}" alt="Four 16K-token prompts arriving together: network traffic at 200 Gb/s and emulated 100 Gb/s" width="820"/></p>
<sub><i>Figure 11: P6, four 16K-token prompts arriving together.</i></sub>

With four 16K prompts, prefill keeps the 200 Gb/s link close to fully used for about 46 s, against about 54 s at 109 Gb/s on the emulated link. The engine processes the four prompts in pairs: the first two receive their first tokens at about 22 s (200 Gb/s) and 27 s (emulated), the last two at about 45 s and 54 s. While the second pair is still in prefill, the first pair is already decoding.

### 8.3. Traffic per prompt token

The measured prefill traffic was **3.54–3.60 MB per prompt token** per Spark, 5–7% more than the 3.38 MB of Section 3.3. The difference is the headers of the network packets and a small amount of traffic per request. The bytes were the same at both link speeds, which confirms that only the link speed changed.

### 8.4. TTFT

Means of three rounds, with the range across rounds in brackets; for P4 and P6, the time until the last of the four requests receives its first token. The estimate for the emulated link (Section 7.3) is given for comparison.

| Test | 200 Gb/s | 100 Gb/s (emulated, 109 Gb/s) | Increase |
|---|---|---|---|
| P1: 1K | 0.96 s (0.91–0.99) | 0.97 s (0.94–1.00) | **+0.01 s (+1.1%)**, no measurable difference (estimate: ≤ +0.12 s) |
| P2: 8K | 6.36 s (6.21–6.56) | 7.24 s (7.14–7.45) | **+0.88 s (+13.9%)** (estimate: ≤ +0.92 s) |
| P3: 32K | 27.02 s (26.96–27.12) | 30.57 s (30.40–30.87) | **+3.55 s (+13.1%)** (estimate: ≤ +3.69 s) |
| P4: 4 × 8K, last first token | 23.00 s (22.61–23.19) | 26.44 s (26.20–26.59) | **+3.44 s (+15.0%)** (estimate: ≤ +3.69 s) |
| P5: 64K | 55.47 s (55.39–55.55) | 62.47 s (62.34–62.56) | **+6.99 s (+12.6%)** (estimate: ≤ +7.39 s) |
| P6: 4 × 16K, last first token | 45.82 s (45.36–46.52) | 54.26 s (54.08–54.60) | **+8.44 s (+18.4%)** (estimate: ≤ +7.39 s) |

Averaged over the four requests of each round, TTFT grew from 16.49 s to 20.21 s in P4 (**+22.5%**) and from 33.96 s to 40.03 s in P6 (**+17.9%**). These are the largest increases measured in any test.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/measured-vs-predicted.png' | relative_url }}" alt="Extra prefill time at 109 Gb/s: estimate against measurement, per test" width="820"/></p>
<sub><i>Figure 12: Extra prefill time when the link drops from 200 to 109 Gb/s: estimate (Section 7.3) against measurement.</i></sub>

For single prompts of 8K–64K tokens and for four 8K prompts arriving together, the measured increase came within a few percent of the estimate, slightly below it, as expected of an upper bound: a small part of the transfers overlaps with computation. The estimate from the model's architecture, the engine's prefill chunk size and the link speed therefore predicts the effect of a slower link well, without any measurement of the computation. In seconds, the increase is about **0.11 s per 1,000 prompt tokens**.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/ttft-increase-vs-prompt.png' | relative_url }}" alt="Increase in prefill time against prompt tokens per round, measured and estimated" width="820"/></p>
<sub><i>Figure 13: Increase in prefill time against prompt size, measured and estimated.</i></sub>

For a single prompt, the percentage stays nearly constant from 8K to 64K tokens (13.9%, 13.1% and 12.6%), as Section 6.1 expects for a model with sparse attention; the slight decline is the part of the attention work that still grows faster than the bytes. With several prompts arriving together, the percentage is higher for the same total prompt size, 15.0% for four 8K prompts and 18.4% for four 16K prompts, as Section 6.2 expects.

### 8.5. Decode speed

| Test | 200 Gb/s | 100 Gb/s (emulated) | Change |
|---|---|---|---|
| P1: 1K | 22.4 tokens/s | 22.5 tokens/s | +0.5% |
| P2: 8K | 21.1 tokens/s | 20.6 tokens/s | −2.3% |
| P3: 32K | 18.7 tokens/s | 19.1 tokens/s | +2.0% |
| P4: 4 × 8K | 10.8 tokens/s per request | 11.2 tokens/s per request | +4.3% |
| P5: 64K | 21.1 tokens/s | 21.0 tokens/s | −0.4% |
| P6: 4 × 16K | 10.5 tokens/s per request | 10.2 tokens/s per request | −2.1% |

The changes point in both directions and stay within the variation between rounds: decode speed does not depend on the link speed, as Section 4.2 expects.

### 8.6. Where the measurement departs from the estimate

**The 1K prompt.** The estimate allows up to +0.12 s, and the measurement shows +0.01 s. Each all-reduce of a 1K prompt sends only about 22 MB per Spark, and the bursts reach only about 100 Gb/s even at 200 Gb/s (Figure 6), below what the emulated link carries. As Section 6.1 anticipates, the bound overstates the effect for short prompts.

**Four 16K prompts arriving together.** Here the measured increase exceeds the estimate by about 1 s. The estimate covers the time spent sending bytes. In this test the engine processed the prompts in pairs and started decoding the first pair while the second pair was still in prefill (Section 8.2), so decode work shared the forward passes of the remaining prefill. The longer that prefill takes, the more decode work falls inside it, and the time until the last first token grows by more than the extra transfer time alone. This effect of the engine's scheduling lies outside the estimate, and it can raise the penalty when several long prompts arrive together.

**Four 8K prompts arriving together.** The time until the last first token stayed within the estimate, but the order in which the engine released the four first tokens differed between the two link speeds. The TTFT of individual requests in such tests therefore depends partly on scheduling, not only on the link.

---

## 9. From the Emulated Link to a Real 100G Cable

The emulated link carries up to 109 Gb/s; a real 100 Gb/s link carries 98 Gb/s (Section 12.3). Applying the bound to this difference gives the most a real cable can add to the measured results:

> **additional prefill time ≤ measured prefill bytes × (1/98 − 1/109)**

| Test | Emulated 100 Gb/s (measured) | Real 100 Gb/s cable, at most |
|---|---|---|
| P1: 1K | +1.1% | +4.2% |
| P2: 8K | +13.9% | +17.6% |
| P3: 32K | +13.1% | +16.7% |
| P4: 4 × 8K, last first token | +15.0% | +19.1% |
| P5: 64K | +12.6% | +16.1% |
| P6: 4 × 16K, last first token | +18.4% | +22.6% |

A real 100 Gb/s cable would therefore be at most 3–4 percentage points worse than the measured results, and decode speed would still be unaffected. In seconds, the bound of Section 5.1 with 98 Gb/s gives at most 0.14 s per 1,000 prompt tokens. The same conversion applies to any workload tried on the emulated link: its measured prefill bytes × (1/98 − 1/109) is the most a real cable adds.

---

## 10. Projection: How the Penalty Changes with TP Size

Taking the measured 8K prefill at TP8 and 200 Gb/s as the baseline, and assuming the computation splits evenly across Sparks, the bound of Section 5 projects the following for a real 100 Gb/s link:

| TP size | Projected TTFT increase at 100 Gb/s, 8K prompt |
|---|---|
| TP2 | ≤ 3% |
| TP4 | ≤ 8% |
| **TP8** | ≤ 17% (measured on the emulated link: 13.9%; real cable: ≤ 17.6%) |
| TP16 | ≤ 31% |

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp-projection.png' | relative_url }}" alt="Projected 100 Gb/s TTFT penalty against TP size" width="820"/></p>
<sub><i>Figure 14: Projected TTFT penalty of 100 Gb/s against TP size (illustrative).</i></sub>

This is a projection, not a measurement: GLM-5.3 does not fit on 2 or 4 Sparks, and fixed overheads are ignored. It shows the direction and the rough size of the effect: at TP16, the penalty would be about twice that at TP8. Section 13.6 compares it with a measurement at TP4. On 16 Sparks at 100 Gb/s, two TP8 clusters each keep the penalty measured in this paper, while one TP16 cluster would roughly double it.

---

# Part III: Real 100 Gb/s Links

## 11. Building Real 100 Gb/s Links

When a workload's result on the emulated link is acceptable, the next step is real 100 Gb/s links. This part builds them for four Sparks and measures them, which also tests the emulation and the estimate against real cables.

### 11.1. The cable and the switch links

A real 100 Gb/s link replaces the 2 × 200G breakout cable with a 4 × 100G one. On the MikroTik CRS804 (RouterOS 7.24.4), each 400G QSFP-DD socket carries eight lanes of 50 Gb/s, and the cable decides how they are shared:

| Cable | Splits one 400G socket into | Lanes per Spark | Speed per Spark | Sparks per socket |
|---|---|---|---|---|
| FS QDD-400G-2QPC01, 1 m | 2 links | 4 | 200 Gb/s (`200G-baseCR4`) | 2 |
| FS QDD-400G-4QPC02, 2 m | 4 links | 2 | 100 Gb/s (`100G-baseCR2`) | 4 |

Both are passive copper breakout cables (DAC), and both links use RS forward error correction (FEC91). The switch shows each socket as eight sub-interfaces, one per lane (`qsfp56-dd-3-1` to `qsfp56-dd-3-8` for socket 3), and names each link after the lane it starts on: `-1` and `-5` with the 2-way cable, `-1`, `-3`, `-5` and `-7` with the 4-way cable. Only these four support the two-lane `100G-baseCR2` mode.

Nothing changes on the Sparks. Their ConnectX-7 adapters support and advertise `100000baseCR2/Full`, the mode of one leg of the 4-way cable, and their network configuration sets only addresses and the MTU of 9,000 bytes, so they follow the speed the switch offers. Both network interfaces of the port stay up and share the 100 Gb/s of the link, unlike in the emulation of Section 7.3, where one of them was left out on a 200 Gb/s link.

### 11.2. Moving four Sparks onto one socket

A 4-way cable connects four Sparks to one socket. In the test cluster, the four Sparks chosen for the test sat on three sockets at 200 Gb/s: two of them shared the cable in socket 3, and the other two each shared a cable in sockets 2 and 4 with a Spark outside the test. Socket 3 was converted. Its 2-way cable came out and the 4-way cable went in, and the other two Sparks were unplugged at the Spark end only, so that their cables stayed in sockets 2 and 4 and kept serving the partner Sparks at 200 Gb/s.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/real-100g-cabling.png' | relative_url }}" alt="Before: four Sparks on three 2 × 200G cables; after: the four Sparks on one 4 × 100G cable in socket 3" width="820"/></p>
<sub><i>Figure 15: The cabling at 200 Gb/s and at 100 Gb/s. Only socket 3 changes.</i></sub>

| Question | Answer |
|---|---|
| Must each cable leg go to a particular Spark? | No. The Sparks' addresses do not depend on the switch port. |
| Can the cable go into another socket? | Yes, with the settings of Section 11.3 applied to that socket. |
| Does it need exactly four Sparks? | No. Unused legs stay down. |
| Can 100 Gb/s and 200 Gb/s Sparks work together on one switch? | Yes. A Spark at 200 Gb/s sent 83.7 Gb/s to a Spark at 100 Gb/s. |
| What must match? | The cable type in a socket and that socket's settings. |

### 11.3. The change, step by step

1. **Check that the switch can be managed.** The CRS804's management port must be cabled to the management network; without it the switch keeps forwarding traffic but cannot be configured.
2. **Back up the switch configuration** with `/export terse file=before-100g` and `/system/backup/save name=before-100g`. The export is a readable list of every setting, used later to check the change; the backup is a full image for emergencies.
3. **Stop the model.** Its connections between the Sparks break when cables move.
4. **Recable.** Pull the 2-way cable from the socket, unplug the other Sparks of the group at the Spark end, and plug in the 4-way cable and its four legs. Each Spark reports the new cable's part number and leg in `ethtool -m`.
5. **Make sure the switch sees the cable.** If the switch reports no module in the socket (`sfp-module-present: no` in `/interface/ethernet/monitor`), the wide end is not fully inserted and has to be reseated until it latches.
6. **Apply the socket's settings** (socket 3 here):
   ```
   /interface ethernet set [find default-name=qsfp56-dd-3-1] speed=100G-baseCR2
   /interface ethernet set [find default-name=qsfp56-dd-3-5] speed=100G-baseCR2
   /interface ethernet set [find default-name=qsfp56-dd-3-3] auto-negotiation=no speed=100G-baseCR2 mtu=9000 l2mtu=9500
   /interface ethernet set [find default-name=qsfp56-dd-3-7] auto-negotiation=no speed=100G-baseCR2 mtu=9000 l2mtu=9500
   /interface ethernet switch qos port set qsfp56-dd-3-1 egress-rate-queue3=100Gbps
   /interface ethernet switch qos port set qsfp56-dd-3-5 egress-rate-queue3=100Gbps
   /interface ethernet switch qos port set qsfp56-dd-3-3 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=100Gbps
   /interface ethernet switch qos port set qsfp56-dd-3-7 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=100Gbps
   ```
   The first two lines move the existing links from four lanes to two. The next two switch on the links that are unused at 200 Gb/s, with the same fixed speed, MTU and L2 MTU as the existing links, so that 9,000-byte frames pass. The last four give all four links the QoS settings of the 200 Gb/s links of the [8-Node Cluster Setup]({{ '/papers/dgx-spark-8node-cluster-setup/' | relative_url }}), with the rate of the RoCE queue set to 100 Gbps; without them the two new links would treat RoCE traffic differently from the old ones. The change touches this socket only and does not restart the switch.
7. **Reboot the four Sparks** (Section 11.4).
8. **Verify the links** (Section 11.5).
9. **Start the model** with its unchanged recipe, and check from the RDMA counters (Appendix A) that both network interfaces of every Spark carry traffic.

Going back to 200 Gb/s is the reverse: stop the model, put the 2-way cables back, apply the reverse settings, reboot the Sparks and verify.

```
/interface ethernet set [find default-name=qsfp56-dd-3-1] auto-negotiation=no speed=200G-baseCR4 mtu=9000 l2mtu=9500
/interface ethernet set [find default-name=qsfp56-dd-3-5] auto-negotiation=no speed=200G-baseCR4 mtu=9000 l2mtu=9500
/interface ethernet set [find default-name=qsfp56-dd-3-3] auto-negotiation=yes mtu=1500 l2mtu=1584
/interface ethernet set [find default-name=qsfp56-dd-3-7] auto-negotiation=yes mtu=1500 l2mtu=1584
/interface ethernet switch qos port set qsfp56-dd-3-1 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
/interface ethernet switch qos port set qsfp56-dd-3-5 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
/interface ethernet switch qos port set qsfp56-dd-3-3 trust-l3=ignore pfc=disabled
/interface ethernet switch qos port unset qsfp56-dd-3-3 egress-rate-queue3
/interface ethernet switch qos port set qsfp56-dd-3-7 trust-l3=ignore pfc=disabled
/interface ethernet switch qos port unset qsfp56-dd-3-7 egress-rate-queue3
```

This returns `-3` and `-7` to their factory settings; after it, the switch's `/export terse` was identical to the export taken before the change. Both directions can be saved on the switch as scripts (`/system/script`) and run in one step. Switching this way changes one socket, whereas restoring the backup would replace the whole configuration and restart the switch, cutting off every Spark on it for several minutes. Each direction took about 15 minutes of hands-on work.

For eight Sparks at 100 Gb/s, the same settings go on two sockets, each with a 4-way cable, which leaves the other two sockets free for eight more Sparks.

### 11.4. Reboot after recabling

After the 4-way cable was plugged into the running Sparks, all links reported 100 Gb/s and carried no errors, yet every Spark on the new cable sent only about 13.4 Gb/s per interface. Receiving was normal.

The limit was the same with 1, 4 or 8 connections, with or without the RoCE traffic class, towards a Spark on the same socket or on another, and with the switch link forced or auto-negotiated; the switch forwarded in hardware at 0–2% CPU load, and no rate limit was set on the Sparks. At the moment the cable was plugged in, the kernel of each of the four Sparks logged `mlx5_pcie_event ... Detected insufficient power on the PCIe slot (27W)`, a message every Spark otherwise logs only at boot. A public report on the NVIDIA developer forum describes the same symptom after a hot swap on another 8-Spark cluster with 4 × 100G breakouts.

Rebooting the four Sparks restored the full speed. A cable change, in either direction, is therefore followed by a reboot of the Sparks on that cable, or made with the Sparks powered off. A link that reports 100 or 200 Gb/s but carries about 13 Gb/s in a bandwidth test needs a reboot, not a new cable.

### 11.5. Verifying the links

| Where | What to look for |
|---|---|
| Switch, interface list | each link in use is running |
| Switch, `/interface/ethernet/monitor` | `100Gbps`, `fec91`, the cable's part number |
| Switch, log | `link up (speed 100G, full duplex)` for each link |
| Each Spark, `ethtool` on both interfaces | `Speed: 100000Mb/s`, `Lanes: 2` |
| Spark to Spark, `ping -M do -s 8972` | replies on both subnets: 9,000-byte frames pass end to end |
| Spark to Spark, `ib_write_bw` | about 98 Gb/s (Section 12.3); about 13 Gb/s means a reboot is needed |
| Switch, `/export terse` against the export of step 2 | differences only in the converted socket |

In the test, 9,000-byte frames passed between every ordered pair of the four Sparks on both subnets, and no CRC, symbol, FEC or RoCE retransmission errors, pause frames or switch drops were counted.

---

## 12. Test Design at TP4

### 12.1. Changing only the link

GLM-5.3 does not fit on four Sparks, so the real 100 Gb/s links were measured with GLM-5.3-Flash at TP4. As in Section 7.1, the link speed was the only difference between the two configurations: the same Sparks, model, engine, recipe, prompts and test plan were used in both, and only the cable and the settings of one switch socket changed.

### 12.2. Setup

| Item | Value |
|---|---|
| Systems | 4× NVIDIA DGX Spark (GB10, 128 GB unified memory) |
| Switch | MikroTik CRS804: 2 × 200G breakout cables (200 Gb/s); one 4 × 100G breakout cable (100 Gb/s) |
| Model | GLM-5.3-Flash FP8 (`zai-org/GLM-5.3-Flash`): MoE; hidden dimension 4,096; 45 layers |
| Engine | SGLang 0.5.22.dev7, PyTorch 2.13, NCCL 2.30.7 |
| Parallelism | TP4: one model instance across the 4 Sparks |
| Key settings | prefill chunks of 8,192 tokens, FP8 KV cache, speculative decoding with DFlash (`incoai/GLM-5.3-Flash-DFlash2`, blocks of 8 draft tokens), Triton attention, up to 8 concurrent requests |
| NCCL | both RDMA devices of each Spark, RoCE v2, no algorithm forced |

With the ring formula of Section 3.3, each prompt token costs each Spark

> (2 × 45 + 1) × 4,096 values × 2 bytes × 1.5 = **1.12 MB** of network traffic,

a third of GLM-5.3's 3.38 MB at TP8: the model has a smaller hidden dimension and fewer layers, and at TP4 each Spark sends 1.5 times its block per all-reduce instead of 1.75 times. Each prefill all-reduce sums a block of 8,192 × 4,096 values, 67 MB at 2 bytes per value, large enough for NCCL to run it as a ring (Section 3.4).

### 12.3. The real 100 Gb/s link

RDMA write bandwidth (`ib_write_bw`, 64 KB messages) and latency (`ib_write_lat`) between two Sparks, after a reboot:

| | 200 Gb/s | Emulated 100 Gb/s (Section 7.3) | Real 100 Gb/s |
|---|---|---|---|
| Bandwidth, one interface | 109 Gb/s | 109 Gb/s | 97.8 Gb/s |
| Bandwidth, both interfaces | 191–195 Gb/s | (one interface only) | 49.0 + 49.0 = 98.0 Gb/s |
| Latency, 2 bytes | 2.49 µs | | 2.47 µs |
| Latency, 8 KB | 4.78 µs | | 5.02 µs |

A real 100 Gb/s link carries about **98 Gb/s** of data, whether one interface or both are used, about 10% less than the emulated link. Latency for small messages does not change; an 8 KB message takes 0.24 µs longer, the extra time to send 8 KB at half the link speed.

With B_new = 98 Gb/s, the bound of Section 5.1 becomes

> **extra prefill time ≤ prefill bytes × (1/98 − 1/200)**, about **0.047 s per 1,000 prompt tokens** for GLM-5.3-Flash at TP4

| Test | Estimate, 200 → 98 Gb/s |
|---|---|
| P1: 1K | ≤ +0.05 s |
| P2: 8K | ≤ +0.38 s |
| P3: 32K | ≤ +1.53 s |
| P4: 4 × 8K | ≤ +1.53 s |
| P5: 64K | ≤ +3.05 s |
| P6: 4 × 16K | ≤ +3.05 s |

### 12.4. Test plan and measurements

The test plan, the measured quantities and the precautions are those of Sections 7.4–7.6: tests P1 to P6, one warm-up round and three measured rounds each, 1,024 output tokens, identical prompts, and the RDMA counters of one Spark recorded every millisecond on the same clock as the requests. The 200 Gb/s and 100 Gb/s runs took place on consecutive days, each on its own launch of the model. During the 200 Gb/s run, one Spark lost power in P5; P5 was measured after the model was relaunched, and P6 was not measured at 200 Gb/s.

At both link speeds, NCCL spread its traffic evenly over the two network interfaces of every Spark (49.9% and 50.1%).

---

## 13. Results: 200 Gb/s vs Real 100 Gb/s at TP4

### 13.1. The traffic in each test

Figures 16–20 show the traffic one Spark sends during the three measured rounds of each test, with 200 Gb/s on top and real 100 Gb/s below, on the same time axis. The grey band is prefill, ending at the first token.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p1-1k-200g-vs-100g.png' | relative_url }}" alt="1K-token prompt at TP4: network traffic at 200 Gb/s and real 100 Gb/s" width="820"/></p>
<sub><i>Figure 16: P1, 1K-token prompt, 1 request.</i></sub>

With a 1K prompt, the prefill bursts reach about 70–80 Gb/s at both link speeds, below what the real 100 Gb/s link carries.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p2-8k-200g-vs-100g.png' | relative_url }}" alt="8K-token prompt at TP4: network traffic at 200 Gb/s and real 100 Gb/s" width="820"/></p>
<sub><i>Figure 17: P2, 8K-token prompt, 1 request.</i></sub>

With an 8K prompt, the prefill bursts come close to 200 Gb/s at 200 Gb/s. On the real 100 Gb/s link the same bursts are held at the link's limit and take longer, and TTFT grows from 3.09 s to 3.47 s. Decode traffic looks the same in both panels.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p3-32k-200g-vs-100g.png' | relative_url }}" alt="32K-token prompt at TP4: network traffic at 200 Gb/s and real 100 Gb/s" width="820"/></p>
<sub><i>Figure 18: P3, 32K-token prompt, 1 request.</i></sub>

The 32K prompt shows the same pattern over a longer prefill, with TTFT growing from 26.29 s to 28.17 s. The rounds at each link speed agree within 0.2 s.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p4-4x8k-200g-vs-100g.png' | relative_url }}" alt="Four 8K-token prompts arriving together at TP4: network traffic at 200 Gb/s and real 100 Gb/s" width="820"/></p>
<sub><i>Figure 19: P4, four 8K-token prompts arriving together.</i></sub>

With four prompts arriving together, the prefill of the first and third rounds at 200 Gb/s is interrupted by pauses in which the Spark sends nothing, and the time until the last first token ranges from 11.8 s to 20.2 s between rounds.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p5-64k-200g-vs-100g.png' | relative_url }}" alt="64K-token prompt at TP4: network traffic at 200 Gb/s and real 100 Gb/s" width="820"/></p>
<sub><i>Figure 20: P5, 64K-token prompt, 1 request.</i></sub>

The 64K prompt shows the bursts of P3 over a prefill of more than 80 s at both link speeds.

Averaged over 5 ms, the prefill bursts from P2 upwards reach 151–160 Gb/s at 200 Gb/s and 97.6–98.0 Gb/s on the real 100 Gb/s link, the limit measured in Section 12.3. Decode averages 0.9–2.3 Gb/s at both link speeds.

### 13.2. Traffic per prompt token

The measured prefill traffic was **1.14 MB per prompt token** per Spark, 2% more than the 1.12 MB of Section 12.2, and the same at both link speeds. The four Sparks sent the same amount: over the whole 100 Gb/s run, 1,294 GB each, equal to within 0.02%. Under a tree all-reduce, two of the four Sparks would have sent twice as much as the other two (Figure 4); the equal amounts confirm that the prefill all-reduces ran as a ring.

### 13.3. TTFT

Means of three rounds, with the range across rounds in brackets; for P4, the time until the last of the four requests receives its first token.

| Test | 200 Gb/s | Real 100 Gb/s | Increase |
|---|---|---|---|
| P1: 1K | 0.67 s (0.66–0.67) | 0.74 s (0.70–0.82) | **+0.08 s (+11.4%)** (estimate: ≤ +0.05 s) |
| P2: 8K | 3.09 s (2.97–3.31) | 3.47 s (3.34–3.62) | **+0.39 s (+12.6%)** (estimate: ≤ +0.38 s) |
| P3: 32K | 26.29 s (26.27–26.33) | 28.17 s (28.11–28.28) | **+1.88 s (+7.1%)** (estimate: ≤ +1.53 s) |
| P4: 4 × 8K, last first token | 16.05 s (11.80–20.22) | 14.62 s (13.27–17.21) | −1.43 s (estimate: ≤ +1.53 s) |
| P5: 64K | 86.00 s (85.55–86.44) | 83.43 s (83.17–83.71) | −2.57 s (estimate: ≤ +3.05 s) |
| P6: 4 × 16K, last first token | not measured | 44.89 s (41.03–48.77) | |

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp4-measured-vs-estimate.png' | relative_url }}" alt="Extra prefill time at real 100 Gb/s, TP4: estimate against measurement, per test" width="820"/></p>
<sub><i>Figure 21: Extra prefill time when the link drops from 200 to real 100 Gb/s at TP4: estimate (Section 12.3) against measurement.</i></sub>

For the single 8K prompt, the measured increase is the estimate: 0.39 s against at most 0.38 s, about 0.048 s per 1,000 prompt tokens. The estimate from the model's architecture, the engine's prefill chunk size and the link speed therefore holds on real 100 Gb/s links and at TP4, as it did on the emulated link at TP8.

In percent, the increase falls from 12.6% at 8K to 7.1% at 32K. The bytes grow in proportion to the prompt, but in this configuration the prefill time grows faster (3.1 s at 8K, 26.3 s at 32K, 86 s at 64K), so the network takes a smaller share of a longer prefill, as Section 6.1 describes for a model whose computation grows faster than its prompt.

### 13.4. Decode speed

| Test | 200 Gb/s | Real 100 Gb/s | Change |
|---|---|---|---|
| P1: 1K | 31.5 tokens/s | 33.6 tokens/s | +6.8% |
| P2: 8K | 23.8 tokens/s | 24.6 tokens/s | +3.4% |
| P3: 32K | 15.6 tokens/s | 15.1 tokens/s | −3.3% |
| P4: 4 × 8K | 11.4 tokens/s per request | 11.8 tokens/s per request | +3.7% |
| P5: 64K | 12.0 tokens/s | 12.2 tokens/s | +2.2% |

The changes point in both directions and stay within the variation between rounds, which is larger than at TP8 because the speed of speculative decoding depends on how many draft tokens are accepted (in P2 at 200 Gb/s, single rounds ranged from 21.9 to 25.8 tokens/s). Decode speed does not depend on the link speed, on the real link as on the emulated one.

### 13.5. Where the measurement departs from the estimate

**The 1K prompt.** Two of the three rounds took 0.70–0.71 s on the real 100 Gb/s link against 0.66–0.67 s at 200 Gb/s, within the estimate; the third took 0.82 s. Since the bursts stay below 100 Gb/s at both link speeds (Figure 16), the link does not slow them, and the difference is within the variation between rounds.

**The 32K prompt.** The increase is 0.35 s above the estimate, 1.3% of the TTFT. The rounds at each link speed agree within 0.2 s, so this is a real difference between the two runs, which used separate launches of the model on different days.

**Four 8K prompts arriving together.** The rounds at 200 Gb/s varied by 8.4 s, against an expected effect of at most 1.5 s. The pauses in Figure 19 come from how the engine scheduled the four prompts, which varied from round to round, as in Section 8.6. The result says nothing about the link.

**The 64K prompt.** P5 at 200 Gb/s was measured on a different launch of the model than P1–P4 and came out 2.6 s slower than on the real 100 Gb/s link. With 64K prompts the network accounts for only 3.5% of the prefill time, so a small difference between launches outweighs the effect of the link.

### 13.6. The TP-size projection

Section 10 projected at most 8% at TP4 for an 8K prompt, for a model shaped like GLM-5.3. GLM-5.3-Flash computes much less per token, so the network takes a larger share of its prefill: its own estimate is at most 12.4%, and 12.6% was measured. The projected figures belong to GLM-5.3; the method carries over, with the bytes per prompt token of the model at hand and one measured TTFT at 200 Gb/s.

---

## 14. Is 100 Gb/s Reasonable?

Yes, for clusters up to TP8. Moving an 8-Spark TP8 cluster from 200 Gb/s to 100 Gb/s links:

> **The first token arrives at most about 20% later for a very long prompt, and at most about 30% later when several very long prompts arrive at the same time. Short to medium prompts see no change. Once the answer starts, it streams at the same pace.**

| Workload | Measured (emulated 100 Gb/s) | Real 100 Gb/s cable, at most |
|---|---|---|
| Chat with short to medium prompts (around 1K tokens) | no measurable difference | about +4% |
| A very long prompt: RAG, long documents (8K–64K tokens) | TTFT +12.6–13.9% | TTFT +18% (at most 0.14 s per 1,000 prompt tokens) |
| Several very long prompts arriving together | TTFT per request +17.9–22.5% | TTFT per request +28% |
| Decode speed, in every case | unchanged | unchanged |

These are upper limits for the cases measured; in a mixed workload, most requests are shorter or arrive alone, and see less. On real 100 Gb/s links at TP4 (Section 13), the extra time to first token followed the same estimate, and decode speed did not change. For a specific workload, the emulated link of Section 7.3 gives the answer on the existing cluster, before any cable is bought.

At 100 Gb/s, with one 4 × 100G breakout cable per four Sparks (Section 11), a **CRS812** connects 8 Sparks, enough for one TP8 cluster, at the cost of the longer wait for the first token on long prompts described above; the pace at which the answer streams does not change.

At TP4, four Sparks share one 4 × 100G breakout cable on a single switch socket (Section 11). With GLM-5.3-Flash, the first token of an 8K-token prompt arrived 12.6% later on real 100 Gb/s links, as the estimate predicted, and decode speed did not change (Section 13).

At 100 Gb/s, a **CRS804** connects 16 Sparks. Run as two TP8 clusters, each sees the per-Spark link measured in this paper, so the results above apply to each, provided the switch can forward traffic on all ports at full speed at the same time (to be verified). A single TP16 cluster would roughly double the penalty (Section 10) and is not recommended at 100 Gb/s.

200 Gb/s remains the better choice where long prompts with tight TTFT targets dominate the workload, where many users send long prompts at the same time, or where a model has to be spread over more than eight Sparks.

---

## 15. Limits and Points to Consider

The measurements cover two models and inference engines, each at one TP size: GLM-5.3 with vLLM at TP8, and GLM-5.3-Flash with SGLang at TP4. Other models, engines and settings send different amounts of data and compute at different speeds; the estimation method carries over, but the numbers have to be recalculated. At TP8, the 100 Gb/s case was emulated with one network interface; Section 9 bounds the difference from a real link, which was measured at TP4 only. The TP-size projection in Section 10 is a calculation, not a measurement.

The 4 × 100G breakout was verified on a CRS804 with FS QDD-400G-4QPC02 cables. With another switch or cable, check that the switch supports 4 × 100G breakout on its QSFP-DD ports in the planned configuration and that the DGX Spark's ConnectX-7 links up at 100 Gb/s with the chosen breakout cable. For 16 Sparks, check that the switch can forward traffic on all ports at full speed at the same time.

### Common mistakes when sizing the cluster network

- ✗ **Reading the wrong counters:** standard Linux tools (`ip -s link`, `nload`, `sar`) do not see RDMA traffic, so they show an almost idle link during inference.
- ✗ **Judging link use from averages:** one-second or switch-port averages hide the millisecond bursts that decide TTFT.
- ✗ **Assuming half the link speed means half the inference speed:** only the bursts during prefill slow down; decode does not.
- ✗ **Spreading a model over more Sparks than necessary at 100 Gb/s:** the penalty grows with TP size.
- ✗ **Recabling running Sparks without rebooting them:** the links come up at the right speed but can send only about 13 Gb/s.

### Checklist for planning a DGX Spark cluster network

- ☐ Is the TP size per model instance decided (TP4, TP8, or two TP8 instances on 16 Sparks)?
- ☐ Is the expected prompt length known (chat, RAG, long documents)?
- ☐ Is there a TTFT target for long prompts?
- ☐ Has the 100 Gb/s penalty been estimated (bytes per prompt token × prompt tokens ÷ 200 Gb/s, Section 5)?
- ☐ Has the workload been run on the emulated 100 Gb/s link (Section 7.3), and is the result, converted to a real link (Section 9), acceptable?
- ☐ Are breakout support and ConnectX-7 link-up at the planned speed verified?
- ☐ Were the Sparks rebooted after recabling, and does `ib_write_bw` show about 98 Gb/s per 100 Gb/s link?
- ☐ Is RDMA traffic monitored with RDMA counters at millisecond resolution?

---

## 16. Conclusion

Tensor-parallel inference across DGX Spark systems uses the network in two very different ways. While a prompt is processed, every all-reduce sends tens of megabytes per Spark, as a ring, in bursts that fill a 200 Gb/s link for a few milliseconds at a time. While the answer is generated, the all-reduces are a few hundred kilobytes or less, and the traffic stays far below 100 Gb/s. Halving the link speed therefore leaves decode speed unchanged and adds a predictable amount to the wait for the first token.

That amount can be estimated from the model's architecture, the engine's prefill chunk size and the link speed alone: for GLM-5.3 at TP8, at most 0.135 s per 1,000 prompt tokens at 100 Gb/s. Measured on 8 Sparks with an emulated 100 Gb/s link, single prompts of 8K–64K tokens reached their first token 12.6–13.9% later, close to the estimate; requests arriving together with other long prompts, 17.9–22.5% later; short prompts and decode speed were unaffected. A real 100 Gb/s link, which carries about 98 Gb/s, would add at most another 3–4 percentage points. Measured on real 100 Gb/s links with GLM-5.3-Flash at TP4, the extra time to first token followed the same estimate, and decode speed again did not change.

For an 8-Spark TP8 cluster with 100 Gb/s links, **expect the first token at most about 20% later for a very long prompt and at most about 30% later when several very long prompts arrive together, no change for short to medium prompts, and no change in how fast the answer streams.** Because the penalty grows with TP size, 16 Sparks at 100 Gb/s are best run as two TP8 clusters. For any other workload, the same comparison can be made on an existing 200 Gb/s cluster before buying cables, by emulating 100 Gb/s with one network interface per Spark and converting the result to a real link.

---

## Appendix A: Measuring RDMA Traffic

Because RDMA bypasses the operating system's network stack, the usual interface statistics do not count it. The traffic in this study was read from the ConnectX-7's RDMA port counters (`port_xmit_data` and `port_rcv_data` under `/sys/class/infiniband/`, in units of 4 bytes) for each of the two RDMA devices, and summed for the port. A cross-check against the adapter's own byte counters agreed within 0.2%.

A small sampler read the counters every 1 ms on one Spark and timestamped each read individually, on the same clock the benchmark used for its requests. Rates over 1 ms and longer intervals were computed by spreading the bytes of each sampling interval over the averaging intervals it covers. The byte counts are exact, but the time of each read is known only to about ±0.1–0.2 ms, so a single 1 ms value is uncertain by about ±15–25%; this is why some 1 ms values in the figures appear slightly above the link speed. Averages over 5 ms or longer are accurate to a few percent.

The choice of averaging interval changes the highest value a measurement reports, as Section 8.1 shows: the same traffic peaks at 181 Gb/s in 1 ms intervals, 96 Gb/s in 5 ms intervals and 44 Gb/s in 100 ms intervals, while its average is the same in all of them. A peak value is meaningful only together with its averaging interval.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/window-choice.png' | relative_url }}" alt="The same 8K prefill traffic averaged over 1 ms, 5 ms and 100 ms intervals" width="820"/></p>
<sub><i>Figure A1: The same prefill traffic averaged over 1 ms, 5 ms and 100 ms intervals.</i></sub>

The measurement itself did not affect the network: bandwidth and latency tests (`ib_write_bw`, `ib_write_lat`) with the sampler running and stopped showed the same bandwidth (109.07, 109.08 and 109.15 Gb/s) and at most about 1% difference in latency. The sampler and the benchmark driver together used well under one of the Spark's 20 CPU cores.

The sampler and the test driver of this study are available as the open-source tool [netinfermon](https://github.com/openzeka/netinfermon), which records the RDMA counters of a ConnectX-7 adapter at millisecond resolution while it runs a test plan against an inference endpoint.

---

## Appendix B: Reproducibility

| Item | Value |
|---|---|
| Test driver | sends the test requests to the engine as streaming requests, timestamps the first and every following token of each answer, and records the RDMA counters alongside on the same clock (Sections 7.4–7.6, Appendix A); requests are generated with the open-source [LLM Benchmark Tool](https://github.com/openzeka/llm-benchmark) |
| Model | `Inferact/GLM-5.3-NVFP4` |
| Engine | vLLM `0.1.dev20133+gb5f995e73`, container `vllm-node-b12x`, NCCL 2.31.2 |
| Serve settings | `--tensor-parallel-size 8`, `--max-num-batched-tokens 4096`, `--long-prefill-token-threshold 2048`, `--max-num-seqs 8`, `--max-model-len 262144`, `--kv-cache-dtype fp8`, `--gpu-memory-utilization 0.726`, `--enable-chunked-prefill`, `--enable-prefix-caching`; speculative decoding: MTP, 4 tokens, draft not split |
| NCCL | `NCCL_IB_HCA` with both RDMA devices (200 Gb/s); second device excluded (100 Gb/s emulation); RoCE v2, GID index 3 |
| Plan | tests P1–P6 (Section 7.4), 1 warm-up and 3 measured rounds, fixed seed, 1,024 output tokens |

For the TP4 measurements of Part III:

| Item | Value |
|---|---|
| Model | `zai-org/GLM-5.3-Flash` (FP8), speculative draft `incoai/GLM-5.3-Flash-DFlash2` |
| Engine | SGLang 0.5.22.dev7 with pull request #36708, PyTorch 2.13, NCCL 2.30.7 |
| Serve settings | `--tp-size 4`, `--chunked-prefill-size 8192`, `--max-running-requests 8`, `--context-length 262144`, `--kv-cache-dtype fp8_e4m3`, `--mem-fraction-static 0.8`, `--attention-backend triton`; speculative decoding: `--speculative-algorithm DFLASH`, 8 draft tokens per block |
| NCCL | `NCCL_IB_HCA` with both RDMA devices; RoCE v2, traffic class 106 |
| Network | 200 Gb/s: FS QDD-400G-2QPC01 (2 × 200G); 100 Gb/s: FS QDD-400G-4QPC02 (4 × 100G); MikroTik CRS804, RouterOS 7.24.4 |
| Plan | as above |

---

## Glossary (Terms)

- **Activations:** The vectors that represent each token as it passes through the model's layers.
- **All-reduce:** A collective operation that adds up data held in parts on every device and gives every device the full sum.
- **Bandwidth-bound / latency-bound:** A transfer is bandwidth-bound when its duration is set by how fast the link moves bytes (large transfers), and latency-bound when it is set by fixed delays (small transfers).
- **Breakout cable:** A cable that splits one fast switch port (for example 400 Gb/s) into several slower links (for example 4 × 100 Gb/s).
- **ConnectX-7:** The NVIDIA network adapter built into DGX Spark.
- **Decode:** The phase that generates the answer, one forward pass at a time.
- **FEC (forward error correction):** Redundant data added on a link so that the receiver can correct bit errors.
- **Decode speed:** How fast the answer streams: output tokens per second after the first token.
- **Emulation:** Reproducing a condition (here, a 100 Gb/s link) on the real hardware, as opposed to modelling it in software.
- **Forward pass:** One run of the model's layers over the tokens currently being processed.
- **Hidden dimension:** The length of the vector that represents each token inside the model (6,144 for GLM-5.3).
- **MTP (multi-token prediction):** A form of speculative decoding in which the model drafts several tokens that are then checked in one forward pass.
- **NCCL:** NVIDIA's library for communication between GPUs, which the inference engine uses for all-reduce.
- **Network interface:** What the operating system sees of a network adapter's connection; here, each ConnectX-7 port appears as two interfaces, one per PCIe link.
- **Network share of prefill time:** The time needed to send the prefill bytes at 200 Gb/s, divided by the prefill time.
- **Nominal link speed:** The rated speed of a link (here 200 Gb/s), before protocol overhead.
- **NVFP4:** NVIDIA's 4-bit floating-point number format, with a scaling factor shared by each group of 16 values.
- **Prefill:** The phase that processes the prompt before the first output token.
- **QoS (quality of service):** Switch settings that sort traffic into classes and treat each class differently; here they keep RoCE traffic in its own class.
- **Prefill chunk:** The part of a prompt processed in one forward pass (up to 4,096 tokens here).
- **RDMA:** Remote direct memory access: the network adapter reads and writes application memory directly, without the data passing through the operating system's network stack.
- **Ring all-reduce:** An all-reduce in which devices pass segments of the data around a ring; each device sends 2 × (N − 1) / N times the data in total.
- **RoCE v2:** RDMA over Converged Ethernet, version 2: RDMA packets carried inside UDP/IP over standard Ethernet.
- **Tensor parallelism (TP):** Splitting every weight matrix of a model across several devices, which combine their partial results after each step.
- **Tree all-reduce:** An all-reduce in which partial sums flow up a tree of devices to its root and the result flows back down; its fixed delays grow with log₂ N, but devices send different amounts. NCCL uses two such trees, each carrying half the data (a double binary tree).
- **TTFT (time to first token):** The time from sending a request to receiving the first token of the answer.

---

## Resources

**Hardware:**

- NVIDIA DGX Spark — <https://www.nvidia.com/en-us/products/workstations/dgx-spark/>
- NVIDIA ConnectX-7 adapter documentation — <https://docs.nvidia.com/networking/display/connectx7vpi/introduction>
- MikroTik CRS804 DDQ — <https://mikrotik.com/product/crs804_ddq>
- MikroTik CRS812 DDQ — <https://mikrotik.com/product/crs812_ddq>

**Model and software:**

- GLM-5.3 NVFP4 checkpoint — <https://huggingface.co/Inferact/GLM-5.3-NVFP4>
- GLM-5.3-Flash — <https://huggingface.co/zai-org/GLM-5.3-Flash>
- vLLM — <https://github.com/vllm-project/vllm>
- SGLang — <https://github.com/sgl-project/sglang>
- NCCL — <https://github.com/NVIDIA/nccl>
- perftest (`ib_write_bw`, `ib_write_lat`) — <https://github.com/linux-rdma/perftest>
- LLM Benchmark Tool — <https://github.com/openzeka/llm-benchmark>
- netinfermon (inference benchmark with RDMA traffic recording) — <https://github.com/openzeka/netinfermon>

**All-reduce algorithms:**

- NCCL environment variables (`NCCL_ALGO`, `NCCL_DEBUG_SUBSYS`) — <https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/env.html>
- Massively Scale Your Deep Learning Training with NCCL 2.4 (double binary trees) — <https://developer.nvidia.com/blog/massively-scale-deep-learning-training-nccl-2-4/>
- Understanding NCCL Tuning to Accelerate GPU-to-GPU Communication — <https://developer.nvidia.com/blog/understanding-nccl-tuning-to-accelerate-gpu-to-gpu-communication>
- Demystifying NCCL: An In-depth Analysis of GPU Communication Protocols and Algorithms — <https://arxiv.org/abs/2507.04786>
- Patarasuk & Yuan, Bandwidth Optimal All-reduce Algorithms for Clusters of Workstations — <https://www.cs.fsu.edu/~xyuan/paper/09jpdc.pdf>

**Related papers:**

- [DGX Spark 8-Node Cluster Setup]({{ '/papers/dgx-spark-8node-cluster-setup/' | relative_url }})
- [Qwen3.6-27B DGX Spark Cluster Scaling]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/' | relative_url }})
- [Local LLM Usage Guide]({{ '/papers/local-llm-guide/' | relative_url }})

---

### Notes

- **Estimates:** Sections 3–6 use only the model's configuration, the engine's settings and the link speed; the bounds are upper limits. The TP-size projection (Section 10) uses the measured TP8 baseline and is illustrative.
- **Measurements:** All performance figures were measured on 8× DGX Spark with GLM-5.3 at TP8, as described in Section 7, and on 4× DGX Spark with GLM-5.3-Flash at TP4, as described in Section 12; network traffic was read from the ConnectX-7 RDMA counters of one Spark (Appendix A).
- **Emulation:** At TP8, 100 Gb/s was emulated on the existing cables by restricting communication to one of the two network interfaces of each ConnectX-7 port, which carries up to 109 Gb/s; Section 9 converts the results to a real 100G cable, which carries 98 Gb/s. At TP4, real 100G cables were used.
- **Currency:** Engine versions and settings change quickly; the results are valid for the versions listed, as of October 2026.

---

{% include company/block.html name="cta_logo" %}

**Let's plan your DGX Spark cluster network together.** For sizing that accounts for model size, tensor parallelism and link speed, {% include company/block.html name="contact_cta" %}
