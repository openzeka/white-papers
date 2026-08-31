---
title: Tablo Nasıl Kullanılır?
parent: LLM Çıkarım Benchmarkları
nav_order: 2
lang: tr
page_id: llm-inference-benchmarks-howto
description: >-
  LLM çıkarım benchmark tablosunun kullanımı ve yorumlanması: eşzamanlılık,
  filtreler, performans hedefleri, Maks C ve tahmini kullanıcı kapasitesi.
permalink: /llm-inference-benchmarks/how-to-use/
last_modified_date: 2026-08-31
toc: true
---

# Benchmark Tablosu Nasıl Kullanılır?

Benchmark tablosu, farklı LLM ve donanım yapılandırmalarını kendi kullanım
senaryonuza göre karşılaştırmanızı sağlar.

## 1. Eşzamanlılık seviyesini seçin

**Eşzamanlılık (Concurrency, C)**, aynı anda modele gönderilen aktif istek
sayısını gösterir.

- C=1 → aynı anda 1 istek
- C=8 → aynı anda 8 istek
- C=32 → aynı anda 32 istek

Eşzamanlılık değerini artırarak sistemin daha yoğun kullanım altında nasıl
davrandığını görebilirsiniz.

Seçtiğiniz C değeri, tabloda gösterilen **TPS** ve **TTFT** değerlerini belirler.

## 2. Karşılaştırmak istediğiniz yapılandırmaları seçin

Model, cihaz, kuantizasyon, inference engine ve MTP gibi filtrelerle tabloyu
daraltabilirsiniz. Örneğin yalnızca:

- DGX Spark üzerinde çalışan modelleri,
- NVFP4 modelleri,
- belirli bir LLM'yi,
- MTP kullanılan yapılandırmaları

görüntüleyebilirsiniz.

Birden fazla seçenek seçerek yapılandırmaları yan yana karşılaştırabilirsiniz.

## 3. Performans hedeflerinizi belirleyin

Tabloda iki temel performans metriği kullanılır.

**TPS**, modelin token üretim hızını gösterir. Daha yüksek TPS, daha hızlı
üretim anlamına gelir.

**TTFT**, kullanıcının ilk tokenı görene kadar beklediği süreyi gösterir. Daha
düşük TTFT, daha hızlı ilk yanıt anlamına gelir.

Minimum TPS ve maksimum TTFT değerlerini değiştirerek yalnızca performans
hedeflerinizi karşılayan sonuçları gösterebilirsiniz. Bir TPS değerinin pratikte
nasıl hissedildiğinden emin değilseniz **TPS Hızını Gör** düğmesiyle örnek
metnin o hızda akışını izleyebilirsiniz.

## 4. Maksimum eşzamanlılığı kontrol edin

**Maks C**, belirlediğiniz TPS ve TTFT hedeflerinin ikisini de karşılayan en
yüksek test edilmiş eşzamanlılık seviyesidir.

Örneğin C=8 hedefleri karşılıyor, C=16 karşılamıyorsa **Maks C = 8** olur.

Daha katı performans hedefleri belirlediğinizde Maks C düşebilir. Hedefleri
gevşettiğinizde ise artabilir.

## 5. Kullanıcı kapasitesini değerlendirin

**Tahmini Chat Kapasitesi** ve **Tahmini Agentic Kapasitesi**, Maks C değerinden
hareketle tahmini kullanıcı sayısı verir.

Chat kullanımında kullanıcılar sürekli olarak modele istek göndermez. Okuma,
düşünme ve yazma sırasında çıkarım kapasitesi başka kullanıcılar tarafından
kullanılabilir. Bu nedenle aynı eşzamanlılık seviyesi, eşzamanlı aktif istek
sayısından daha fazla chat kullanıcısına hizmet verebilir.

Agentic iş yüklerinde modele daha sık ve ardışık istek gönderildiği için
kullanıcı başına gereken kapasite genellikle daha yüksektir.

Her iki çarpanı da kendi kullanım senaryonuza göre değiştirebilirsiniz.

## 6. Bir satırı açarak ayrıntıları inceleyin

Bir benchmark satırının herhangi bir yerine tıklayarak yapılandırmanın tüm
eşzamanlılık taramasını görebilirsiniz. Açılan görünümde:

- her eşzamanlılık seviyesindeki TPS,
- her eşzamanlılık seviyesindeki TTFT,
- performans hedefinin karşılanıp karşılanmadığı,
- eşzamanlılık arttıkça performansın nasıl değiştiği,
- yapılandırmaya ait ek çalışma notları

görüntülenir.

Grafiği PNG olarak indirerek rapor veya sunumlarda kullanabilirsiniz.

<div class="bt-cta">
  <a class="bt-cta-primary" href="{{ '/llm-inference-benchmarks/benchmarks/' | relative_url }}">Benchmarkları Gör</a>
</div>
