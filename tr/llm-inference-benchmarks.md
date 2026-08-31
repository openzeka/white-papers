---
title: LLM Benchmark Tablosu
nav_order: 4
lang: tr
page_id: llm-inference-benchmarks
description: >-
  NVIDIA DGX Spark, DGX B300, RTX PRO 6000 Blackwell ve Jetson Thor için
  etkileşimli LLM çıkarım benchmark tablosu. Modele, cihaza, kuantizasyona ve
  eşzamanlılığa göre filtreleyin, kendi performans hedeflerinizi girin.
permalink: /llm-inference-benchmarks/
last_modified_date: 2026-08-31
wide: true
toc: false
---

<script>document.body.classList.add('oz-wide')</script>

# LLM Benchmark Tablosu

Farklı LLM, donanım ve sunum yapılandırmalarının çıkarım performansını tek bir
yerde karşılaştırın. Filtreleri kullanarak karşılaştırmak istediğiniz
yapılandırmaları seçin; eşzamanlılık seviyesini ve performans hedeflerinizi
değiştirdiğinizde tablo otomatik olarak güncellenir. Bir yapılandırmanın
ayrıntılı sonuçlarını görmek için ilgili satırı açabilirsiniz.

<details class="bt-howto">
<summary>Benchmark tablosu nasıl kullanılır?</summary>
<div class="bt-howto-body" markdown="1">

### 1. Eşzamanlılık seviyesini seçin

**Eşzamanlılık (Concurrency, C)**, aynı anda işlenen aktif istek sayısıdır —
kişi sayısı değil, bir yük seviyesidir. C=1 aynı anda bir istek, C=32 aynı anda
otuz iki istek demektir. Değeri artırarak sistemin daha yoğun eşzamanlı yük
altında nasıl davrandığını görebilirsiniz. Seçtiğiniz eşzamanlılık, tabloda
gösterilen **TPS** ve **TTFT** ölçümlerini belirler.

### 2. Karşılaştırmak istediğiniz yapılandırmaları seçin

Model, cihaz, kuantizasyon ve MTP filtreleriyle tabloyu daraltın — örneğin
yalnızca DGX Spark üzerinde çalışan modelleri, yalnızca NVFP4 modelleri ya da
yalnızca MTP kullanılan yapılandırmaları görüntüleyebilirsiniz. Birden fazla
seçenek seçerek yan yana karşılaştırma yapabilirsiniz.

### 3. Performans hedeflerinizi belirleyin

**TPS**, token üretim hızını gösterir; yüksek olması iyidir. **TTFT**,
kullanıcının ilk tokenı görene kadar beklediği süredir; düşük olması iyidir.

Kendi sınırlarınızı girmek için **Performans Hedefleri ve Kapasite Varsayımları**
bölümünü açın. Bir TPS değerinin pratikte nasıl hissedildiğinden emin
değilseniz, o bölümdeki önizleme örnek metni tam olarak o hızda akıtır.

### 4. Maksimum eşzamanlılığı kontrol edin

**Maks C**, TPS ve TTFT hedeflerinizin ikisini de karşılayan en yüksek test
edilmiş eşzamanlılık seviyesidir. C=8 hedefleri karşılıyor, C=16 karşılamıyorsa
Maks C 8'dir. Kişi sayısını değil, eşzamanlı istek sayısını ifade eder. Katı
hedefler bu değeri düşürür, gevşek hedefler yükseltir.

### 5. Kullanıcı kapasitesini değerlendirin

**Tahmini Chat Kapasitesi** ve **Tahmini Agentic Kapasitesi**, Maks C değerini
yaklaşık bir *kişi* sayısına dönüştürür.

Chat kullanıcıları sürekli istek göndermez — okurken, düşünürken ve yazarken
kapasite başkasına açıktır — bu nedenle belirli bir eşzamanlılık seviyesi,
sahip olduğu eşzamanlı istek yuvasından daha fazla chat kullanıcısına hizmet
eder. Agentic iş yükleri daha sık ve ardışık istek ürettiği için kullanıcı
başına daha fazla kapasite gerekir. Her iki çarpan da değiştirilebilir.

### 6. Bir satırı açarak ayrıntıları inceleyin

Bir satırın herhangi bir yerine tıklayarak tüm eşzamanlılık taramasını
görebilirsiniz: her seviyedeki TPS ve TTFT, hedeflerinizin karşılanıp
karşılanmadığı, eşzamanlılık arttıkça performansın nasıl değiştiği ve
yapılandırmaya ait notlar. Grafik, rapor ve sunumlarda kullanmak üzere PNG
olarak indirilebilir.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">

<div data-bt-src="/assets/data/benchmarks.json"
     data-bt-logo="/assets/images/benchmark-logo.png"></div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/benchmark-table.tr.js"></script>
