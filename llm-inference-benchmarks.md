---
title: LLM Inference Benchmark Explorer
nav_order: 4
lang: en
page_id: llm-inference-benchmarks
card_order: 10
card_tag: "LLM Benchmark"
card_date: "August 2026"
description: >-
  Explore OpenZeka's LLM inference benchmarks on NVIDIA DGX Spark, DGX B300,
  RTX PRO 6000 Blackwell and Jetson Thor. Filter by model, parameter count,
  device, quantization and concurrency, and set your own performance targets.
permalink: /llm-inference-benchmarks/
last_modified_date: 2026-09-02
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

A row is a **complete deployment configuration**, not a model. Hardware,
quantization format, inference engine, TP/DP/PP topology and speculative-decoding
setting are all
part of what was tested, so the same model appears several times with different
values in those columns. Comparing two rows is only meaningful once you know
which of those columns differ between them.

### How the numbers were measured

Every TPS and TTFT figure is an OpenZeka measurement, produced with the
open-source [CordatusAI LLM Benchmark
Tool](https://github.com/CordatusAI/llm-benchmark) on NVIDIA DGX B300, one- to
eight-node DGX Spark, RTX PRO 6000 Blackwell and Jetson AGX Thor. The pool grows
as we test further models, hardware, inference engines, quantization formats,
parallelism strategies and speculative-decoding configurations.

Each configuration is run with **128 input tokens and 128 output tokens**, ten
rounds per concurrency level, with prompts covering different topics. The sweep
is `C = 1, 2, 4, 8, 16, 32, 64`, and the table reports the **mean** TPS and TTFT
at each level.

**The TPS column is per-request, not total throughput.** It is the speed one
active request sees at the selected concurrency. Aggregate output is a separate
curve, shown in the expanded row.

<div class="bt-howto-example" markdown="1">
**Reading these figures at other prompt lengths.** The measurements use a
128-token input, and the TTFT limit therefore applies directly to that length.
They still give a reasonable basis for projecting longer prefills: under
comparable conditions TTFT is expected to rise roughly in proportion to input
length, because the prefill work grows with the prompt. TPS is less sensitive
and will generally fall only modestly, since the dominant weight-matrix
multiplications of autoregressive decoding happen once per generated token and
do not scale with prompt length — though attention and KV-cache costs do grow as
context lengthens. Read the displayed TPS as a figure measured at 128 input
tokens.
</div>

### What the parameters mean

**Token** — the unit a model reads and writes, roughly three quarters of a word.

**TPS (tokens per second)** — how fast text is produced for one request. Higher
is better.

**TTFT (time to first token)** — the wait before the first word appears. Lower
is better.

**Concurrency (C)** — how many requests the system is working on at the same
instant. A load level, not a number of people.

**Parameter count** — the total number of weights in the model as released. For
mixture-of-experts models this is the total, not the smaller number active on
any one token, so it tracks the memory the model occupies more closely than the
work done per token.

**Intelligence Index** and **Agentic Index** — two published capability scores
from [Artificial Analysis](https://artificialanalysis.ai), on scales where
higher is better. The first combines evaluations covering reasoning, coding,
science and long-context work; the second is a separate measure of agentic
work — multi-step tasks, tool calls, staying on track unsupervised. A model can
rank well on one and poorly on the other.

Both describe **the model**, so every row for the same model carries the same
pair whatever the hardware or quantization. Neither says anything about speed,
concurrency or hardware capacity. Where Artificial Analysis scores several
reasoning-effort variants, the highest-scoring one is shown. A dash means no
score has been published — common in the Agentic column, which Artificial
Analysis fills in for a minority of the models it tracks.

**Agentic Index and Agentic Capacity are not two scales of the same thing.** The
index measures what the model can do. The capacity column estimates how many
people one hardware and serving configuration may support under your current
targets and busyness assumption.

**Quantization** — the number format the weights are stored in. Fewer bits per
weight means less memory and usually more speed, at some risk to quality. BF16
is the full-precision baseline; FP8, NVFP4, MXFP4, FP4 and INT4 are
progressively more compressed. MXFP8 is an alternative 8-bit format, AWQ is a
weight-only 4-bit scheme, and FP16 is a second full-precision baseline.

**Speculative decoding** — the model guesses several tokens ahead in one step and
then verifies them in a single pass. Correct guesses are kept, so the same output
arrives faster. The column says only whether a run used it; which mechanism, and
how far ahead it guessed, is in the row's notes. One common form is
**multi-token prediction (MTP)**, where the model itself predicts the next few
tokens to a depth *k*; others use a separate draft model or a vendor
implementation such as DSpark.

**Inference engine** — the server software that loads the model and answers
requests. It controls batching, memory and scheduling, so it affects speed as
much as the hardware. vLLM and SGLang are two of them.

**TP / DP / PP** — three ways of splitting one model across several GPUs. Tensor
parallelism divides the maths inside a layer; data parallelism runs complete
copies side by side; pipeline parallelism puts different layers on different
devices.

### Two distinctions worth fixing first

**Filters decide which rows appear. Targets change what the numbers mean.**
Filtering to one device shortens the table; lowering the TTFT target leaves the
row count alone but recalculates Max C and the capacity columns.

**Concurrency counts active requests, capacity counts people.** C=8 means eight
requests in flight at that instant. Eight people will generally produce fewer
than eight concurrent requests, because they are not all waiting on the model at
the same moment. The two are different units, and the capacity columns exist to
convert between them.

### 1. Choose a concurrency level

The selected C decides which measurement the TPS and TTFT columns show. C=1 is
the best case a single request sees. Higher values show what happens once the
system is loaded.

A row appears only if it was measured at that level, so the list shortens as C
rises.

### 2. Narrow the configurations

Model, parameter count, device, quantization and speculative-decoding filters
combine, and every
data column sorts — so you can come at the table from model capability, model
size, hardware, speed, latency, parallelism or estimated capacity. The most
instructive comparisons change one variable: the same model at FP8 and NVFP4, or
the same configuration with and without speculative decoding.

### 3. Set your targets

Two values decide what counts as acceptable. Under the defaults a concurrency
level is supported when **both** hold:

- mean TTFT ≤ `1000 ms`
- mean TPS ≥ `20 tok/s`

**Both bounds are inclusive** — exactly 1000 ms, or exactly 20 tok/s, still
passes. The defaults are a practical starting point, not a recommendation; leave
them for a first comparison, or set them to your own workload.

Changing either target immediately re-evaluates every configuration. It updates
whether each displayed TPS and TTFT meets the target, the PASS/FAIL result at
every point of the expanded sweep, Max C, and both capacity columns. If a
capacity filter is active, rows also appear or disappear as their recalculated
capacity crosses your limit.

The two metrics protect different things. In a chat interface low TTFT matters
first — a fast answer that starts late still feels broken. For long-form
generation TPS dominates, because the wait is spread across the whole reply. If
you are unsure how a TPS value feels, the preview inside **Performance Targets
and Capacity Assumptions** streams sample text at exactly that rate.

### 4. Read Max C and the capacity columns

**Max C** is the highest *measured* concurrency at which the configuration meets
both targets at once. It is taken from the measured points only; if no measured
point satisfies both, Max C is 0.

Because the targets are yours to set, Max C is not a fixed property of a
configuration. The same row can reach Max C 16 at a 15 tok/s requirement and
fall to Max C 8 at 25 tok/s.

Max C and the selected concurrency answer different questions. The selected C
chooses which measurement is on screen. Max C looks across the whole sweep and
reports the highest level that clears your targets.

The capacity columns convert Max C into people:

- Chat Capacity = `floor(Max C × Chat Usage Multiplier)`
- Agentic Capacity = `floor(Max C × Agentic Usage Multiplier)`

The multipliers stand for **how busy each kind of user is**. The chat default is
higher (4) because interactive users spend much of their time reading a reply,
thinking and typing the next prompt, and hold no request slot while they do —
so several of them share one. Agentic work is busier: an agent may make
consecutive calls while planning, running tools and evaluating results, keeping
a slot occupied far longer, which is why its default is lower (1.5). Lower the
agentic multiplier for agents that run almost continuously; raise it for
intermittent use.

<div class="bt-howto-example" markdown="1">
**Example.** With targets of 1000 ms TTFT and 20 tok/s, a configuration meets
both up to C=8 but drops below 20 tok/s at C=16, so Max C is 8. At the default
multipliers that row reads 32 chat users or 12 agentic users. Tighten TTFT to
500 ms and the same row may stop at C=4, halving both.
</div>

**These capacity figures are estimates derived from a measured Max C.** They
were not obtained by connecting 32 chat users or 12 agentic users to the system.

### 5. Open a row for the detail

The whole row is clickable. Opening one shows the complete concurrency sweep,
with the status and cell colours marking whether your targets are met at every
level — the behaviour a single headline figure hides. Selecting any measured
level plays the speed actually recorded there, so C=1, C=8 and C=32 can be
compared by ear as well as by number.

The chart carries two curves:

- **Per-request TPS** — the speed each active request experiences, which usually
  falls as concurrency rises.
- **Aggregate TPS** — concurrency × per-request TPS, which usually keeps
  climbing.

That is the trade-off worth seeing: individual responsiveness drops while the
machine as a whole produces more. Capacity planning lives between the two
curves. Configuration notes sit below the chart — KV-cache precision, kernel
selection, GPU-memory utilization, speculation depth — and the chart downloads as
a PNG
for reports and presentations.

### Where to start

**"We want to run this model for an agentic workload used by 20 people."**
Select the model and set minimum Agentic Capacity to 20. Leave the targets and
the agentic multiplier at their defaults for a first estimate, or set them to
match the application. What remains are candidate hardware and serving
configurations.

**"How does this model do on DGX B300 versus DGX Spark?"** Select the model and
both device families, then compare rows with matching quantization, engine,
speculative decoding
and parallelism. Changing the selected concurrency shows how the gap develops
under load.

**"What does quantization, speculative decoding or the engine actually change?"**
Hold the model and hardware constant and compare the relevant rows — FP8 against
NVFP4, speculative decoding on against off, vLLM against SGLang — so the effect
is not mixed with a hardware change.

**"We already own this hardware; what can we run on it?"** Start with the device
filter, then sort the remaining models by capability or parameter count and
narrow with the TPS, TTFT or capacity requirements you need.

**"Which model is capable enough without exceeding our limits?"** Sort by
Intelligence Index, Agentic Index or parameter count to shortlist models, then
apply the device and performance requirements. This keeps model choice and
infrastructure sizing separate, instead of assuming the fastest model is the
most suitable one.

### What this does not tell you

The table deliberately uses one comparable fixed workload, mean values and
simple capacity multipliers, so that a first comparison is possible without
first defining a full production traffic model. It is **not a substitute for a
production load test**. Tail latency, variable prompt and output lengths,
request-arrival patterns, agent call chains, batching, prefix reuse, context
length and KV-cache pressure can all change usable capacity.

Capacity estimates are also most informative where a configuration has a
meaningful concurrency sweep behind it, rather than an isolated C=1 result.

Planned refinements include workload and context-length filters, KV-cache-aware
concurrency limits, and timing-based capacity modes using measured service
latency, user think time and Little's Law.

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
