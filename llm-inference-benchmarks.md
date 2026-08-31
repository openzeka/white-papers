---
title: LLM Benchmark Table
nav_order: 4
lang: en
page_id: llm-inference-benchmarks
description: >-
  Interactive LLM inference benchmark table for NVIDIA DGX Spark, DGX B300,
  RTX PRO 6000 Blackwell and Jetson Thor. Filter by model, device, quantization
  and concurrency, and set your own performance targets.
permalink: /llm-inference-benchmarks/
last_modified_date: 2026-08-31
wide: true
toc: false
---

<script>document.body.classList.add('oz-wide')</script>

# LLM Benchmark Table

Compare the inference performance of different LLM, hardware and serving
configurations in one place. Use the filters to select the configurations you
want to compare; the table updates automatically when you change the
concurrency level or your performance targets. Expand any row to view the
detailed results for that configuration.

<details class="bt-howto">
<summary>How to use the benchmark table</summary>
<div class="bt-howto-body" markdown="1">

### What the parameters mean

**Token** — the unit a model reads and writes, roughly three quarters of a word.

**TPS (tokens per second)** — how fast text is produced for one request. Higher
is better.

**TTFT (time to first token)** — the wait before the first word appears. Lower
is better.

**Concurrency (C)** — how many requests the system is working on at the same
instant. A load level, not a number of people.

**Quantization** — the number format the weights are stored in. Fewer bits per
weight means less memory and usually more speed, at some risk to quality. BF16
is the full-precision baseline; FP8, NVFP4, MXFP4 and INT4 are progressively
more compressed.

**MTP (multi-token prediction)** — the model guesses several tokens ahead in one
step and then verifies them. Correct guesses are kept, so the same output
arrives faster.

**Inference engine** — the server software that loads the model and answers
requests. It controls batching, memory and scheduling, so it affects speed as
much as the hardware. vLLM and SGLang are two of them.

**TP / DP / PP** — three ways of splitting one model across several GPUs.
Tensor parallelism divides the maths inside a layer; data parallelism runs
complete copies side by side; pipeline parallelism puts different layers on
different devices.

### Two distinctions worth fixing first

**Filters decide which rows appear. Targets change what the numbers mean.**
Filtering to one device shortens the table; lowering the TTFT target leaves the
row count alone but recalculates Max C and the capacity columns.

**Concurrency counts requests, capacity counts people.** C=8 means eight
requests in flight at once. A chat capacity of 32 means thirty-two users. They
are different units.

### 1. Choose a concurrency level

The selected C decides which measurement the TPS and TTFT columns show. C=1 is
the best case a single user sees. Higher values show what happens once the
system is loaded.

A row appears only if it was measured at that level, so the list shortens as C
rises.

### 2. Narrow the configurations

Model, device, quantization and MTP filters combine. The most instructive
comparisons change one variable: the same model at FP8 and NVFP4, or the same
configuration with and without MTP.

### 3. Set your targets

The two metrics protect different things. In a chat interface low TTFT matters
first — a fast answer that starts late still feels broken. For long-form
generation TPS dominates, because the wait is spread across the whole reply.

If you are unsure how a TPS value feels, the preview inside **Performance
Targets and Capacity Assumptions** streams sample text at exactly that rate.

### 4. Read Max C and the capacity columns

**Max C** is the highest concurrency meeting both targets at once. Tightening a
target lowers it.

The capacity columns convert Max C into people. Chat users leave the system idle
while they read and type, so the multiplier is above one. Agentic users hold a
slot far longer, so theirs is lower. Both are adjustable.

<div class="bt-howto-example" markdown="1">
**Example.** Say your targets are 1000 ms TTFT and 20 tok/s. A configuration
meets both up to C=8 but drops below 20 tok/s at C=16, so Max C is 8. With a
chat multiplier of 4 that row reads about 32 chat users, and 12 agentic users at
1.5. Tighten TTFT to 500 ms and the same row may stop at C=4, halving both.
</div>

### 5. Open a row for the detail

Clicking a row opens its full concurrency sweep. The table there shows whether
your targets are met at every level — the behaviour a single headline figure
hides.

The chart carries two curves. The left axis is per-request TPS, which falls as
concurrency rises. The right axis is aggregate throughput, which usually climbs.
Individual users get slower while the machine as a whole does more; capacity
planning lives between those two curves.

The chart downloads as a PNG for reports and presentations.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">

<div data-bt-src="/assets/data/benchmarks.json"
     data-bt-logo="/assets/images/benchmark-logo.png"></div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/benchmark-table.js"></script>
