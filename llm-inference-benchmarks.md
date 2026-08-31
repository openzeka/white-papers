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

### 1. Choose a concurrency level

**Concurrency (C)** is the number of active requests being processed at the same
time — a load level, not a number of people. C=1 means one active request, C=32
means thirty-two at once. Raise it to see how a system behaves under heavier
simultaneous load. The selected concurrency determines which **TPS** and **TTFT**
measurements the table displays.

### 2. Select the configurations you want to compare

Use the model, device, quantization and MTP filters to narrow the table — for
example only models running on DGX Spark, only NVFP4 models, or only
configurations using MTP. Select multiple options to compare them side by side.

### 3. Set your performance targets

**TPS** measures token generation speed; higher is better. **TTFT** measures how
long the user waits before the first token arrives; lower is better.

Open **Performance Targets and Capacity Assumptions** to enter your own limits.
If you are unsure what a given TPS value feels like in practice, the preview
inside that panel streams sample text at exactly that rate.

### 4. Check the maximum supported concurrency

**Max C** is the highest tested concurrency level that meets both your TPS and
TTFT targets. If C=8 meets both and C=16 does not, Max C is 8. It counts
simultaneous requests, not people. Stricter targets lower it; relaxed targets
raise it.

### 5. Estimate user capacity

**Estimated Chat Capacity** and **Estimated Agentic Capacity** convert Max C into
an approximate number of *people*.

Chat users do not send requests continuously — while they read, think or type,
capacity is free for someone else — so a given concurrency level serves more
chat users than it has simultaneous request slots. Agentic workloads issue more
frequent, sequential requests, so each user needs more capacity. Both
multipliers are adjustable.

### 6. Expand a configuration for detailed results

Click anywhere on a row to see its complete concurrency sweep: TPS and TTFT at
each level, whether your targets are met, how performance changes as concurrency
rises, and any configuration notes. The chart can be downloaded as a PNG for
reports and presentations.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">

<div data-bt-src="/assets/data/benchmarks.json"
     data-bt-logo="/assets/images/benchmark-logo.png"></div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/benchmark-table.js"></script>
