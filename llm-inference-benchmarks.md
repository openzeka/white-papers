---
title: LLM Inference Benchmark Table
nav_order: 4
lang: en
page_id: llm-inference-benchmarks
description: >-
  Interactive benchmark table for LLM inference performance across NVIDIA DGX
  Spark (GB10), DGX B300, RTX PRO 6000 Blackwell and Jetson Thor. Filter by
  device, model, quantization and concurrency, and set your own service-level
  thresholds for capacity planning.
permalink: /llm-inference-benchmarks/
last_modified_date: 2026-08-31
wide: true
toc: false
---

<script>document.body.classList.add('oz-wide')</script>

*Prepared by: **Openzeka Teknoloji A.Ş.** — Official Embedded Compute Distributor for NVIDIA Türkiye & MEA, and NVIDIA Elite Partner*

*Test platforms: NVIDIA DGX Spark (GB10), DGX B300 (8× Blackwell Ultra), RTX PRO 6000 Blackwell, Jetson Thor · Compiled August 2026*

---

## About this table

This page brings together the LLM inference benchmarks Openzeka has run across
its NVIDIA platforms into a single view. It is not a fixed snapshot but a
working tool: filter down to the hardware you are considering, set the response
times your application actually requires, and read off how many users each
configuration supports.

Every figure here was produced by the same benchmark harness under the same
conditions, so results are directly comparable across models, hardware and
precisions. That comparability is the hard part when weighing published numbers
from different sources, and it is the main thing this table is for.

Unlike the fixed tables inside our individual white papers, this view is
interactive. You can filter by device, model, quantization and multi-token
prediction, sort by any column, and expand any row to see the full concurrency
sweep with a chart and a downloadable image.

## How to read it

### The columns

| Column | What it is |
|---|---|
| **Model** | The model as served. Where several quantizations of one model were tested, each appears as its own row. |
| **Device** | The hardware and node count. `4× DGX Spark` means four nodes serving one model together, not four independent runs. |
| **Quant** | Weight precision — BF16, FP8, NVFP4, MXFP4, INT4, AWQ. The single biggest lever on both memory footprint and speed. |
| **TPS @ C=n** | Output tokens per second **for one request**, at the selected concurrency. This is what a single user experiences, and it falls as concurrency rises. |
| **TTFT @ C=n** | Time to first token, in milliseconds — how long a user waits before text starts appearing. |
| **Max C** | Highest concurrency meeting both thresholds. See below. |
| **Chat Capacity** | Max C × chat multiplier. |
| **Agentic Capacity** | Max C × agentic multiplier. |
| **TP / DP / PP** | Tensor, data and pipeline parallelism. `—` means not applicable. On multi-node rows these describe how the model was split across nodes. |
| **Engine** | vLLM or SGLang. |
| **MTP** | Multi-token prediction (speculative decoding). Where a model appears with and without it, the pair shows what it bought. |

TPS and TTFT cells are coloured green or red against the current thresholds, so
a row that fails at the selected concurrency is visible at a glance.

### The three capacity columns

These are **computed in your browser** from the raw measurements and the
thresholds in the **Assumptions** panel — nothing is precomputed or stored:

| Column | Formula |
|---|---|
| **Max C** | The highest concurrency at which the run still meets both service-level thresholds: TTFT below the TTFT threshold **and** per-request TPS above the TPS threshold. |
| **Chat Capacity** | Max C × chat multiplier. Interactive chat users are bursty and idle most of the time — reading, thinking, typing — so one concurrent slot serves several people. |
| **Agentic Capacity** | Max C × agentic multiplier. Agentic workloads hold a slot through long generations and tool calls, so the multiplier is far lower. |

### Setting your own thresholds

The defaults — TTFT under 1000 ms, 20 tok/s per request, ×4 for chat, ×1.5 for
agentic — are a reasonable starting point, not a universal answer. **Open the
Assumptions panel and enter your own service-level targets.** Every row
recalculates instantly.

### Choosing a concurrency level

The concurrency selector governs which measurement point the TPS and TTFT
columns display, and which point the two performance sliders filter on. It does
not affect Max C, Chat or Agentic — those always consider the whole sweep.

A row only appears if it was measured at the selected concurrency, so the
visible count drops as you move up.

### Filtering and sorting

Device, quantization and MTP are toggle buttons — click several to compare them
side by side, or **All** to clear. The model list has a search box and
checkboxes. The four sliders narrow by minimum TPS, maximum TTFT, and minimum
chat and agentic capacity.

Click any column header to sort; click again to reverse. The counter above the
table always shows how many of the total configurations match.

### Expanding a row

The ▶ arrow at the end of each row opens the full concurrency sweep:

- A point-by-point table of TTFT and TPS with **PASS/FAIL** against your current thresholds
- A chart with two axes — per-request TPS on the left, aggregate throughput (TPS × C) on the right. The two diverge as concurrency rises: individual users get slower while the machine as a whole does more total work.
- **Download Chart** saves the chart as a PNG for slides or reports
- Any tuning that matters — container image, KV cache precision, attention backend — appears in the notes beneath

Expanding a row also updates the address bar, so you can link straight to a
single configuration and it will open expanded for whoever you send it to.

## Methodology

All figures were measured with [CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark) against
an OpenAI-compatible streaming endpoint:

- 128-token input, 128-token output
- 10 rounds per concurrency level, 1 warm-up request
- Metrics: TTFT (ms), ITL (ms), TPS (tok/s), latency (s), throughput (RPS)
- Concurrency sweep: C = 1, 2, 4, 8, 16, 32, 64

TPS is reported **per request**, not aggregated. The expanded chart shows both:
per-request TPS on the left axis and aggregate throughput (TPS × C) on the
right.

## Benchmark data

<link rel="stylesheet" href="/assets/css/benchmark-table.css">

<div data-bt-src="/assets/data/benchmarks.json"
     data-bt-logo="/assets/images/benchmark-logo.png"></div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/benchmark-table.js"></script>

---

## Related white papers

Several configurations in this table are analysed in depth elsewhere:

- [Qwen3.6-27B DGX Spark Benchmark]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/' | relative_url }}) — quantization comparison (FP8 / AWQ / NVFP4, with and without MTP)
- [Qwen3.6-27B DGX Spark Cluster Scaling]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/' | relative_url }}) — TP1 / TP2 / TP4 multi-node scaling
- [Kimi K3 Inference Benchmark on DGX-B300]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/' | relative_url }}) — vLLM vs SGLang and speculative decoding
- [Local LLM Usage Guide]({{ '/papers/yerel-llm-rehberi/' | relative_url }}) — choosing hardware, model and software stack
