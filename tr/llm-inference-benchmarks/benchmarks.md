---
title: Benchmark Tablosu
parent: LLM Çıkarım Benchmarkları
nav_order: 1
lang: tr
page_id: llm-inference-benchmarks-table
description: >-
  Etkileşimli LLM çıkarım benchmark tablosu. Modele, cihaza, kuantizasyona,
  inference engine'e ve eşzamanlılığa göre filtreleyin, kendi performans
  hedeflerinizi girin.
permalink: /llm-inference-benchmarks/benchmarks/
last_modified_date: 2026-08-31
wide: true
toc: false
---

<script>document.body.classList.add('oz-wide')</script>

# LLM Çıkarım Benchmark Tablosu

Filtreleri kullanarak karşılaştırmak istediğiniz yapılandırmaları seçin.
Eşzamanlılık seviyesini ve performans hedeflerinizi değiştirdiğinizde tablo
otomatik olarak güncellenir.

Bir yapılandırmanın ayrıntılı sonuçlarını görmek için ilgili satırı
açabilirsiniz.

[Benchmark tablosu nasıl kullanılır?]({{ '/llm-inference-benchmarks/how-to-use/' | relative_url }}){: .bt-inline-help }

<link rel="stylesheet" href="/assets/css/benchmark-table.css">

<div data-bt-src="/assets/data/benchmarks.json"
     data-bt-logo="/assets/images/benchmark-logo.png"></div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/benchmark-table.tr.js"></script>
