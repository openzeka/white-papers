---
title: How to Use the Table
parent: LLM Inference Benchmarks
nav_order: 2
lang: en
page_id: llm-inference-benchmarks-howto
description: >-
  How to operate and interpret the LLM inference benchmark table: concurrency,
  filters, performance targets, Max C and estimated user capacity.
permalink: /llm-inference-benchmarks/how-to-use/
last_modified_date: 2026-08-31
toc: true
---

# How to Use the Benchmark Table

The benchmark table lets you compare LLM and hardware configurations according
to your own workload requirements.

## 1. Choose a concurrency level

**Concurrency (C)** is the number of active requests being processed at the same
time.

- C=1 → 1 active request
- C=8 → 8 active requests
- C=32 → 32 active requests

Increase concurrency to see how a system behaves under heavier simultaneous
load.

The selected concurrency determines which **TPS** and **TTFT** measurements are
displayed in the table.

## 2. Select the configurations you want to compare

Use the model, device, quantization, inference engine and MTP filters to narrow
the table. For example, you can show only:

- models running on DGX Spark,
- NVFP4 models,
- a specific LLM,
- configurations using MTP.

Select multiple options to compare configurations side by side.

## 3. Set your performance targets

The table uses two main performance metrics.

**TPS** measures token generation speed. Higher TPS means faster generation.

**TTFT** measures how long the user waits before receiving the first token.
Lower TTFT means a faster initial response.

Adjust the minimum TPS and maximum TTFT values to show only configurations that
meet your performance requirements. If you are unsure what a given TPS value
feels like in practice, use **Preview TPS Speed** to watch sample text stream at
that rate.

## 4. Check the maximum supported concurrency

**Max C** is the highest tested concurrency level that meets both your TPS and
TTFT targets.

For example, if C=8 meets both targets and C=16 does not, then **Max C = 8**.

Stricter performance targets can reduce Max C. Relaxing the targets can increase
it.

## 5. Estimate user capacity

**Estimated Chat Capacity** and **Estimated Agentic Capacity** convert Max C into
an estimated number of users.

Chat users do not continuously send requests. While they read, think or type,
inference capacity can be used by other users. A given concurrency level can
therefore support more chat users than simultaneous active requests.

Agentic workloads usually generate more frequent and sequential LLM requests, so
they generally require more inference capacity per user.

Both multipliers are adjustable, so you can match them to your own workload.

## 6. Expand a configuration for detailed results

Click anywhere on a benchmark row to view its complete concurrency sweep. The
expanded view shows:

- TPS at each concurrency level,
- TTFT at each concurrency level,
- whether the current performance targets are met,
- how performance changes as concurrency increases,
- additional configuration notes.

You can download the chart as a PNG to use in reports or presentations.

<div class="bt-cta">
  <a class="bt-cta-primary" href="{{ '/llm-inference-benchmarks/benchmarks/' | relative_url }}">View Benchmarks</a>
</div>
