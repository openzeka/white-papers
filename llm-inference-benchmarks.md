---
title: LLM Inference Benchmark Explorer
nav_order: 4
lang: en
page_id: llm-inference-benchmarks
date: 2026-08-31 11:23:22 +0300
card_tag: "LLM Benchmark"
description: >-
  Explore OpenZeka's LLM inference benchmarks on NVIDIA DGX Spark, DGX B300,
  RTX PRO 6000 Blackwell and Jetson Thor. Filter by model, parameter count,
  device, quantization and concurrency, and set your own performance targets.
permalink: /llm-inference-benchmarks/
last_modified_date: 2026-09-26
toc: false
---

# LLM Inference Benchmark Explorer

Compare the inference performance of different LLM, hardware and serving
configurations in one place. Use the filters to select the configurations you
want to compare; the table updates automatically when you change the
concurrency level or your performance targets. Expand any row to view the
detailed results for that configuration.

<details class="bt-howto">
<summary>How to use the benchmark explorer</summary>
<div class="bt-howto-body" markdown="1">

### What a row is

A row is one **deployment configuration**: a model, on specific hardware, in a
specific number format, served by a specific engine with a specific parallelism
and speculative-decoding setting, measured end to end. The same model therefore
appears in several rows, and two rows are directly comparable only once you know
which of those settings differ between them.

### Filters and targets do different jobs

**Filters decide which rows you see.** The model, parameter-count, device,
quantization and speculative-decoding filters, and the TPS, TTFT and capacity
sliders, only show or hide rows.

**Targets and assumptions decide what the numbers say.** They sit under
*Performance Targets and Capacity Assumptions*. Changing one leaves the rows in
place but recalculates Max C, both capacity columns and the green and red
colouring of every row.

### 1. Choose a concurrency level

Concurrency (C) is the number of requests the system is working on at the same
moment. The selector picks which measurement the TPS and TTFT columns show: C=1
is the best case a single request sees, and higher values show the system under
load. Rows not measured at the selected level are hidden, so the list shortens as
C rises.

### 2. Narrow and sort

Filters combine, and every column sorts. The most instructive comparisons change
a single setting: the same model at FP8 and at NVFP4, the same configuration with
and without speculative decoding, or vLLM against SGLang on the same hardware.

### 3. Set your targets

Two targets define acceptable speed: a maximum TTFT (default 1000 ms) and a
minimum TPS per request (default 20 tok/s). A measured level counts as supported
only when it meets **both**; a value exactly on a target passes.

TTFT matters most where someone waits for the reply to start, as in chat. TPS
matters most for long answers, where the wait is spread over the whole reply. To
see what a TPS value feels like, the preview under the targets streams sample
text at that rate.

### 4. Read Max C and the capacity columns

**Max C** is the highest measured concurrency that meets both targets. It counts
simultaneous requests.

**Chat Capacity** and **Agentic Capacity** turn that into a number of people and
check it against memory. Each shows the smaller of two estimates, and the icon
beside the figure says which one set it:

- a lightning bolt — the speed targets;
- a memory chip — the KV cache memory;
- a warning triangle — the chosen context length is longer than the model can hold.

Hover over a figure for a one-line reason. *What the numbers mean and how they
are calculated*, below, explains both estimates in full.

### 5. Open a row

Click a row to see:

- the full concurrency sweep, marked PASS or FAIL against your targets at every level;
- a speed preview for any measured level, so C=1 and C=32 can be compared by eye;
- a chart of per-request TPS, the speed each user sees, against aggregate TPS,
  what the system produces in total — the trade-off capacity planning sits between;
- a short capacity summary: what each limit allows and how much memory is left
  for the KV cache;
- the run's notes: cache precision, kernels, memory settings, speculation depth.

The chart downloads as a PNG for reports and presentations.

### Where to start

**"We want to run this model for an agentic workload used by 20 people."** Select
the model and set the minimum Agentic Capacity to 20. Keep the default targets
for a first estimate, or set them to your application. What remains are the
candidate hardware and serving configurations.

**"How does this model do on DGX B300 versus DGX Spark?"** Select the model and
both device families, then compare rows whose quantization, engine, speculative
decoding and parallelism match. Changing the concurrency shows how the gap
develops under load.

**"What does quantization, speculative decoding or the engine actually change?"**
Hold the model and hardware fixed and compare the rows that differ in that one
setting, so the effect is not mixed with a hardware change.

**"We already own this hardware; what can we run on it?"** Start with the device
filter, sort the remaining models by capability or size, and narrow with the TPS,
TTFT or capacity you need.

**"Which model is capable enough without exceeding our limits?"** Sort by
Intelligence Index, Agentic Index or parameter count to shortlist models, then
apply your device and performance requirements. This keeps choosing a model
separate from sizing the infrastructure, instead of assuming the fastest model is
the most suitable.

</div>
</details>

<details class="bt-howto">
<summary>What the numbers mean and how they are calculated</summary>
<div class="bt-howto-body" markdown="1">

### How the numbers were measured

Every TPS and TTFT figure is an OpenZeka measurement, made with the open-source
[CordatusAI LLM Benchmark Tool](https://github.com/CordatusAI/llm-benchmark) on
NVIDIA DGX B300, one to eight DGX Spark nodes, RTX PRO 6000 Blackwell and Jetson
AGX Thor.

Each configuration is run with **128 input tokens and 128 output tokens**, ten
rounds per concurrency level with prompts on different topics, at
`C = 1, 2, 4, 8, 16, 32, 64`. The table shows the **mean** of the ten rounds. A
**token** is the unit a model reads and writes, about three quarters of an
English word.

### The measured columns

**TPS (tokens per second)** — how fast one request's reply is produced at the
selected concurrency. It is a per-request figure: at C=8, each of the eight
requests receives this rate. The system's total output is **aggregate TPS = C ×
TPS**, shown in the expanded row. Higher is better.

**TTFT (time to first token)** — how long a request waits before its first token
arrives. It includes time spent queueing and the prefill, the pass in which the
model reads the whole prompt. Lower is better.

### The columns that describe the setup

**Parameters** — the total number of weights in the model. For a
mixture-of-experts model this is the total, not the part active for each token,
because all of it has to be held in memory.

**Intelligence Index** and **Agentic Index** — capability scores published by
[Artificial Analysis](https://artificialanalysis.ai); higher is better. The first
combines evaluations of reasoning, coding, science and long-context work; the
second measures multi-step work with tool calls. Both describe the model, so
every row of one model carries the same pair, whatever the hardware. Where
several reasoning-effort settings are scored, the highest is shown, and a dash
means no score has been published. The Agentic Index measures what the model can
do; Agentic Capacity, further along the row, estimates how many people the
hardware can serve.

**Quantization** — the number format the weights are stored in. Fewer bits per
weight means less memory and usually more speed, at some risk to output quality.
BF16 and FP16 are full precision; FP8 and MXFP8 use 8 bits per weight; NVFP4,
MXFP4, FP4, INT4 and AWQ use 4.

**Inference engine** — the server software that loads the model and schedules
requests, such as vLLM or SGLang. The same model on the same hardware can perform
measurably differently under two engines.

**Speculative decoding** — the model drafts several tokens ahead and checks them
in one pass; the accepted tokens are kept, so the same output arrives sooner. The
column shows whether a run used it; the mechanism and how far ahead it drafted
are in the row's notes.

**TP / DP / PP** — how the model is split across GPUs or machines. Tensor
parallelism (TP) divides the work inside each layer, pipeline parallelism (PP)
places different layers on different devices, and data parallelism (DP) runs
several complete copies, each serving its own requests.

### Max C

Max C is the highest **measured** concurrency at which mean TTFT and mean TPS
both meet your targets. Only measured levels count, nothing is interpolated, and
if no level passes Max C is 0. It depends on your targets and moves with them:
the same row may reach C=16 at 20 tok/s and only C=8 at 30 tok/s.

### From requests to people: the capacity columns

Max C counts requests running at the same moment. The capacity columns estimate
how many **people** a configuration can serve. A system can run out of speed or
of memory first, so each column takes the smaller of two limits:

**capacity = min(speed limit, KV cache memory limit)**

### The speed limit

**speed limit = floor(Max C × usage multiplier)**

A person does not have a request running all the time. A chat user sends a
message, waits for the reply, then reads and types for a while, and uses no
capacity in between. The usage multiplier is the number of people who, on
average, share one request slot. The chat default of 4 assumes a chat user has a
request running about a quarter of the time. The agentic default of 1.5 assumes an
agent has one running about two thirds of the time, because it chains calls while
it plans, runs tools and checks results.

With Max C = 8, that is 8 × 4 = 32 chat users or 8 × 1.5 = 12 agentic users.

### The KV cache memory limit

While it works through a conversation, a model keeps a **KV cache**: for every
token so far, the intermediate results each layer needs so that earlier tokens do
not have to be processed again. The cache grows with the length of the
conversation.

The speed figures come from 128-token prompts, and a real turn is that quick only
if the user's conversation is still in the cache, so that just the new message has
to be processed. The memory limit therefore counts how many users' whole sessions
fit in the cache at once. A session is as long as the **context length** set under
the assumptions — every token it holds, history and replies included: 32K by
default for chat, 128K for agentic work, whose sessions also carry tool calls and
their results. Beyond that number the system still runs, but a returning user
waits while their conversation is processed again.

It is worked out per device — per GPU, or per node on DGX Spark:

1. **Memory for the engine** = device memory × Engine Memory Allocation: 95% on a
   discrete GPU (DGX B300, RTX PRO 6000), 80% on unified memory (DGX Spark, Jetson
   Thor), where the operating system shares the same pool.
2. **Room for weights and cache** = that × Weights and KV Cache Share (80%). The
   other 20% is working memory for activations and runtime buffers.
3. **Free for the KV cache** = that − the weights held on this device: the size of
   the checkpoint the run served, divided over the TP × PP devices it is split across.
4. **One session** = context length × the model's cache per token, stored at FP8
   (one byte per value), plus any fixed per-session part the model has (see below),
   divided over the devices that share it.
5. **Users** = floor(free memory ÷ one session) × the number of DP copies.

The cache per token comes from the model's published configuration. For a
standard transformer it is 2 (a key and a value) × layers × KV heads × head size.

<div class="bt-howto-example" markdown="1">
**Worked example.** A hypothetical 32-layer model with 8 KV heads of size 128,
served as a 32 GB FP8 checkpoint on one 96 GB GPU:

- memory for the engine: 96 × 95% = 91.2 GB; room for weights and cache: 91.2 × 80% = 72.96 GB
- free for the KV cache: 72.96 − 32 = 40.96 GB
- cache per token: 2 × 32 × 8 × 128 = 65,536 bytes, so 40.96 GB holds 625,000 tokens
- chat: 625,000 ÷ 32,768 = 19 sessions; agentic: 625,000 ÷ 131,072 = 4

With Max C = 8 the speed limit is 32 chat and 12 agentic users, so the table shows
**19** and **4**, both set by memory. Tighten TTFT until Max C falls to 4 and the
speed limit becomes 16 and 6: chat is then set by speed (16), agentic still by
memory (4).
</div>

### How different model designs are handled

Models differ in what they keep for each token, so every row uses its own model's
figures. For example:

- **Sliding-window layers** keep only their most recent tokens — the last 128 or
  1,024, say — so they cost a fixed amount per session instead of growing with it.
- **Linear-attention and Mamba layers** keep a fixed-size state instead of a
  per-token cache, counted once for each session.
- **Compressed caches**, such as the MLA of DeepSeek, Kimi and GLM-5, store far
  less per token, but every GPU holds a full copy, so adding GPUs does not divide
  them.
- **A standard cache** is split across GPUs by its KV heads; with more GPUs than
  heads, the heads are copied rather than split further.

Some rows show only the speed limit, and the expanded row says why: either the
served checkpoint alone is larger than the memory assumed to be available — the
run gave the engine more memory than the standard allocation, or kept part of the
model or its cache in CPU memory or on disk — or the model stores its cache in a
way this estimate does not model. Choose a context length longer than a model's
own **context window**, the most it can hold, and the model cannot serve sessions
that long at all: its capacity shows a dash with a warning triangle.

### Reading the results at longer prompts

The TTFT target applies directly to 128-token prompts. With longer prompts, TTFT
rises roughly in proportion to their length, because the prefill work grows with
the prompt. TPS falls more slowly: the main cost of producing each token, the
weight-matrix multiplications, does not depend on the prompt's length, although
attention and cache reads do grow with the context.

### What the numbers do not tell you

The table uses one fixed workload, mean values, simple usage multipliers and a
standard memory calculation, so that configurations can be compared without first
building a traffic model. It is **not a substitute for a production load test**:
tail latency, varied prompt and output lengths, arrival patterns, agent call
chains and prefix sharing all change real capacity.

The memory limit is calculated, not read from the engine. Engine-specific storage
details — block rounding, scale factors, separate cache pools, experts spread
across data-parallel devices — can move it either way. A session holding 32K or
128K tokens will also see a longer TTFT and a somewhat lower TPS than these
128-token measurements. Capacity is most meaningful where a full concurrency sweep
stands behind it; a row measured only at C=1 rests on a single data point.

Planned refinements include workload filters, speed measured at longer contexts,
and capacity estimates based on measured latency, user think time and Little's Law.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">

<div data-bt-src="/assets/data/benchmarks.json"
     data-bt-logo="/assets/images/benchmark-logo.png"></div>

<p class="bt-attribution">Intelligence Index and Agentic Index values are
published by <a href="https://artificialanalysis.ai" rel="noopener">Artificial
Analysis</a> and are reproduced here with attribution. All other columns are
OpenZeka&rsquo;s own measurements.</p>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/benchmark-table.js"></script>
