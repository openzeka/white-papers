---
title: LLM Çıkarım Benchmarkları
nav_order: 4
has_children: true
lang: tr
page_id: llm-inference-benchmarks
description: >-
  NVIDIA DGX Spark, DGX B300, RTX PRO 6000 Blackwell ve Jetson Thor üzerinde
  farklı LLM, donanım ve sunum yapılandırmalarının çıkarım performansını
  karşılaştırın.
permalink: /llm-inference-benchmarks/
last_modified_date: 2026-08-31
---

# LLM Çıkarım Benchmarkları

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

Farklı LLM, donanım ve sunum yapılandırmalarının çıkarım performansını tek bir
yerde karşılaştırın.

Benchmark tablosunu kullanarak modeli, donanımı ve çalışma yapılandırmasını
filtreleyebilir; farklı eşzamanlılık seviyelerinde TPS ve TTFT değerlerini
inceleyebilirsiniz. Kendi performans hedeflerinizi belirleyerek hangi
yapılandırmaların ihtiyacınızı karşıladığını ve yaklaşık kullanıcı kapasitesini
görebilirsiniz.

<div class="bt-cta">
  <a class="bt-cta-primary" href="{{ '/llm-inference-benchmarks/benchmarks/' | relative_url }}">Benchmarkları Gör</a>
  <a class="bt-cta-secondary" href="{{ '/llm-inference-benchmarks/how-to-use/' | relative_url }}">Tablo Nasıl Kullanılır?</a>
</div>
