---
title: Benchmark Table
parent: LLM Inference Benchmarks
nav_order: 1
lang: en
page_id: llm-inference-benchmarks-table
description: >-
  Interactive LLM inference benchmark table. Filter by model, device,
  quantization, inference engine and concurrency, and set your own performance
  targets.
permalink: /llm-inference-benchmarks/benchmarks/
last_modified_date: 2026-08-31
wide: true
toc: false
---

<script>document.body.classList.add('oz-wide')</script>

# LLM Inference Benchmark Table

Use the filters to select the configurations you want to compare. The table
updates automatically when you change the concurrency level or your performance
targets.

Expand any row to view the detailed results for that configuration.

[How to use the benchmark table]({{ '/llm-inference-benchmarks/how-to-use/' | relative_url }}){: .bt-inline-help }

<link rel="stylesheet" href="/assets/css/benchmark-table.css">

<div data-bt-src="/assets/data/benchmarks.json"
     data-bt-logo="/assets/images/benchmark-logo.png"></div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/benchmark-table.js"></script>
