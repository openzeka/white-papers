---
title: LLM Benchmark Tablosu
nav_order: 4
lang: tr
page_id: llm-inference-benchmarks
description: >-
  NVIDIA DGX Spark, DGX B300, RTX PRO 6000 Blackwell ve Jetson Thor için
  etkileşimli LLM çıkarım benchmark tablosu. Modele, parametre sayısına, cihaza,
  kuantizasyona ve eşzamanlılığa göre filtreleyin, kendi performans
  hedeflerinizi girin.
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

### Parametreler ne anlama geliyor {#parametreler-ne-anlama-geliyor}

**Token** — modelin okuyup yazdığı birim, kabaca bir kelimenin dörtte üçü.

**TPS (saniyedeki token)** — tek bir istek için metnin üretilme hızı. Yüksek
olması iyidir.

**TTFT (ilk token süresi)** — ilk kelime belirene kadarki bekleme. Düşük olması
iyidir.

**Eşzamanlılık (C)** — sistemin aynı anda üzerinde çalıştığı istek sayısı. Kişi
sayısı değil, bir yük seviyesidir.

**Parametre sayısı** — modelin yayımlanan hâlindeki toplam ağırlık sayısı.
Uzman karışımı (MoE) modellerde bu değer toplamı gösterir, tek bir token için
etkin olan daha küçük sayıyı değil; yani token başına yapılan işi değil, modelin
kapladığı belleği yansıtır.

**Kuantizasyon** — ağırlıkların saklandığı sayı biçimi. Ağırlık başına daha az
bit, daha az bellek ve genellikle daha çok hız demektir; kalitede bir miktar
risk taşır. BF16 tam hassasiyet referansıdır; FP8, NVFP4, MXFP4 ve INT4 giderek
daha sıkıştırılmıştır.

**MTP (çoklu token tahmini)** — model tek adımda birkaç token ilerisini tahmin
edip doğrular. Doğru tahminler korunduğu için aynı çıktı daha hızlı gelir.

**Inference engine** — modeli belleğe yükleyip istekleri yanıtlayan sunucu
yazılımı. Toplu işleme, bellek ve zamanlamayı yönettiği için hıza donanım kadar
etki eder. vLLM ve SGLang bunlardan ikisidir.

**TP / DP / PP** — tek modeli birden fazla GPU'ya bölmenin üç yolu. Tensor
paralelliği bir katmanın içindeki hesabı böler; data paralelliği tam kopyaları
yan yana çalıştırır; pipeline paralelliği farklı katmanları farklı cihazlara
yerleştirir.

### Önce iki ayrımı netleştirin {#once-iki-ayrimi-netlestirin}

**Filtreler hangi satırların görüneceğini belirler. Hedefler ise sayıların ne
anlama geldiğini değiştirir.** Bir cihazı filtrelediğinizde tablo kısalır;
TTFT hedefini düşürdüğünüzde satır sayısı aynı kalır ama Maks C ve kapasite
sütunları yeniden hesaplanır.

**Eşzamanlılık istek sayar, kapasite kişi sayar.** C=8, aynı anda sekiz isteğin
işlendiği anlamına gelir. 32 kişilik chat kapasitesi ise otuz iki kullanıcıyı
ifade eder. İkisi farklı birimlerdir.

### 1. Eşzamanlılık seviyesini seçin {#eszamanlilik-seviyesini-secin}

Seçtiğiniz C değeri, TPS ve TTFT sütunlarının hangi ölçüm noktasını
göstereceğini belirler. C=1 tek kullanıcının gördüğü en iyi durumdur. Yüksek C
değerleri sistem yük altındayken ne olduğunu gösterir.

Bir satır yalnızca o seviyede ölçülmüşse görünür; bu yüzden C yükseldikçe
listedeki satır sayısı azalır.

### 2. Yapılandırmaları daraltın {#yapilandirmalari-daraltin}

Model, parametre sayısı, cihaz, kuantizasyon ve MTP filtrelerini birlikte
kullanabilirsiniz. En
öğretici karşılaştırmalar tek değişkeni değiştirdiğinizde çıkar: aynı modelin
FP8 ve NVFP4 sürümleri, ya da aynı yapılandırmanın MTP'li ve MTP'siz hâlleri.

### 3. Hedeflerinizi girin {#hedeflerinizi-girin}

İki metrik farklı şeyleri korur. Sohbet arayüzünde önce TTFT gelir — geç
başlayan hızlı bir yanıt yine de bozuk hissettirir. Uzun metin üreten işlerde
ise TPS belirleyicidir, çünkü bekleme yanıtın tamamına yayılır.

Bir TPS değerinin nasıl hissedildiğinden emin değilseniz **Performans Hedefleri
ve Kapasite Varsayımları** bölümündeki önizleme örnek metni tam o hızda akıtır.

### 4. Maks C ve kapasite sütunlarını okuyun {#maks-c-ve-kapasite-sutunlarini-okuyun}

**Maks C**, hedeflerinizin ikisini birden karşılayan en yüksek eşzamanlılıktır.
Hedefleri sıkılaştırmak bu değeri düşürür.

Kapasite sütunları Maks C'yi kişi sayısına çevirir. Chat kullanıcıları okurken
ve yazarken sistemi boşta bıraktığı için çarpan birden büyüktür. Agentic
kullanıcılar yuvayı daha uzun süre meşgul ettiği için çarpan daha düşüktür. Her
iki çarpanı da kendi kullanımınıza göre değiştirebilirsiniz.

<div class="bt-howto-example" markdown="1">
**Örnek.** Hedefleriniz 1000 ms TTFT ve 20 tok/s olsun. Bir yapılandırma C=8'e
kadar bu ikisini karşılıyor, C=16'da TPS 20'nin altına düşüyorsa Maks C 8
olur. Chat çarpanı 4 ile bu satır yaklaşık 32 chat kullanıcısı, agentic çarpanı
1,5 ile 12 agentic kullanıcı gösterir. TTFT hedefini 500 ms'ye çekerseniz aynı
satır C=4'te kalabilir ve kapasite yarıya iner.
</div>

### 5. Satırı açıp ayrıntıya inin {#satiri-acip-ayrintiya-inin}

Satıra tıklamak tüm eşzamanlılık taramasını açar. Buradaki tablo her seviyede
hedefin karşılanıp karşılanmadığını gösterir; başlıktaki tek bir sayının
gizlediği davranışı burada görürsünüz.

Grafikte iki eğri vardır. Soldaki eksen istek başına TPS'tir ve eşzamanlılık
arttıkça düşer. Sağdaki eksen toplam verimdir ve genellikle yükselir. Tek
kullanıcı yavaşlarken makinenin tamamı daha çok iş çıkarır; kapasite planlaması
bu iki eğrinin arasında yapılır.

Grafik, sunum ve raporlarda kullanmak üzere PNG olarak indirilebilir.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">

<div data-bt-src="/assets/data/benchmarks.json"
     data-bt-logo="/assets/images/benchmark-logo.png"></div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/benchmark-table.tr.js"></script>
