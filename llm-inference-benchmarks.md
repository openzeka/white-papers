---
title: LLM Inference Benchmarks
nav_order: 4
has_children: true
lang: en
page_id: llm-inference-benchmarks
description: >-
  Compare the inference performance of different LLM, hardware and serving
  configurations on NVIDIA DGX Spark, DGX B300, RTX PRO 6000 Blackwell and
  Jetson Thor.
permalink: /llm-inference-benchmarks/
last_modified_date: 2026-08-31
---

# LLM Inference Benchmarks

<script>
/* Deep links to a single configuration were shared while the table lived at
   this URL. Forward them to the benchmark page so they keep working. */
(function () {
  var h = window.location.hash;
  if (h && h.length > 1) {
    /* derive from the current path so the Turkish page stays under /tr/ */
    window.location.replace(window.location.pathname.replace(/\/$/, "") + "/benchmarks/" + h);
  }
})();
</script>

Compare the inference performance of different LLM, hardware, and serving
configurations in one place.

Use the benchmark table to filter by model, hardware, and deployment
configuration, then compare TPS and TTFT at different concurrency levels. Set
your own performance targets to see which configurations meet your requirements
and estimate how many users they can support.

<div class="bt-cta">
  <a class="bt-cta-primary" href="{{ '/llm-inference-benchmarks/benchmarks/' | relative_url }}">View Benchmarks</a>
  <a class="bt-cta-secondary" href="{{ '/llm-inference-benchmarks/how-to-use/' | relative_url }}">How to Use the Table</a>
</div>
