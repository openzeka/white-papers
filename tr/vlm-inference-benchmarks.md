---
title: VLM Çıkarım Benchmark Gezgini
nav_order: 6
lang: tr
page_id: vlm-inference-benchmarks
date: 2026-10-06 12:00:00 +0300
card_tag: "VLM Benchmark"
description: >-
  RTX PRO 6000 Blackwell, Jetson AGX Orin ve Jetson Orin NX üzerindeki
  görüntü-dil modeli çıkarım benchmark'larını keşfedin. Görüntü boyutunu seçin,
  bir kameranın yanıtı için ne kadar bekleyebileceğini belirleyin ve her
  yapılandırmanın kaç kameraya yetiştiğini görün.
permalink: /vlm-inference-benchmarks/
last_modified_date: 2026-10-06
toc: false
---

# VLM Çıkarım Benchmark Gezgini

Bu cihaz bu görüntü-dil modeliyle (vision-language model) kaç kamerayı
izleyebilir? Kameralarınızın gönderdiği görüntü boyutunu seçin ve bir kameranın
yanıtı için ne kadar bekleyebileceğini belirleyin; tablo, ölçtüğümüz her
yapılandırma için güncellenir. Bir satırın her kamera sayısındaki ölçümlerini,
sonuçların açıklamasını ve grafiğini görmek için satırı açabilirsiniz.

<details class="bt-howto">
<summary>Benchmark gezgini nasıl kullanılır?</summary>
<div class="bt-howto-body" markdown="1">

### Bir satır ne anlatır {#bir-satir-ne-anlatir}

Bir satır tek bir **kurulum yapılandırmasıdır**: belirli bir donanımda, belirli
bir sayı biçiminde, belirli bir engine ile sunulan bir görüntü-dil modeli —
baştan sona ölçülmüş hâliyle. Bu yüzden aynı model birkaç satırda görünür; iki
satırı doğrudan karşılaştırabilmek için aralarında hangi ayarların farklı
olduğunu bilmek gerekir.

### Filtreler ve hedef farklı işler görür {#filtreler-ve-hedef}

**Filtreler hangi satırları gördüğünüzü belirler.** Cihaz, model, parametre
sayısı, kuantizasyon ve engine filtreleri ile yanıt süresi kaydırıcısı yalnızca
satırları gösterir ya da gizler.

**Hedef ve varsayım sayıların ne söylediğini belirler.** Bunlar *Performans
Hedefi ve Varsayımlar* altındadır. Birini değiştirdiğinizde satırlar yerinde
kalır, ama yanıt süresi, Maks. kamera ve her satırın yeşil ve kırmızı
renklendirmesi yeniden hesaplanır.

### 1. Kameralarınızı tanımlayın {#kameralarinizi-tanimlayin}

İş yükünü iki seçici tanımlar ve tablodaki her sayı bu seçimlerde okunur:

- **Kamera** — aynı anda istek gönderen kamera sayısı. Bu, sistemin ölçüldüğü
  eşzamanlılıktır (concurrency).
- **Görüntü Boyutu** — bir kameranın gönderdiği her görüntünün boyutu: 480p,
  720p, 1080p ya da 2K.

Seçili birleşimde ölçülmemiş satırlar gizlenir; soluk düğmeler ölçümü olmayan
birleşimleri gösterir. Birden fazla kamera 480p, 720p ve 1080p'de ölçüldü; 2K
yalnızca tek kamerayla.

### 2. Daraltın ve sıralayın {#daraltin-ve-siralayin}

Filtreler birlikte çalışır ve her sütun sıralanabilir. En öğretici
karşılaştırmalar tek bir ayarı değiştirenlerdir: aynı cihazda bir modelin iki
kuantizasyonu, aynı modelin llama.cpp ve vLLM ile sunumu ya da bir modelin iki
cihazda çalışması.

### 3. Hedefinizi belirleyin {#hedefinizi-belirleyin}

Hedef, **bir kameranın yanıtının başlaması için bekleyebileceği en uzun
süredir** — varsayılan 3 saniye. Hedefe tam eşit bir yanıt süresi geçer.

Yanındaki **Kamera Başına Görüntü**, her isteğin kaç görüntü taşıdığını
belirler: varsayılan olarak tek bir anlık görüntü ya da aynı kameranın birlikte
gönderilen birkaç karesi; video, görüntü-dil modellerine çoğu zaman böyle
gönderilir. İstek başına birden fazla görüntü yalnızca tek kamerayla ölçüldü; bu
yüzden üç ya da beş görüntüyle Maks. kamera 1'den yüksek olamaz.

### 4. Maks. kamera değerini okuyun {#maks-kamera-degerini-okuyun}

**Maks. kamera**, her kameranın yanıtının hedefiniz içinde başladığı en yüksek
ölçülmüş kamera sayısıdır. Artı işareti —
**16+** — yapılandırmanın test edildiği en yüksek sayıda bile hedefi karşıladığı,
yani gerçek üst sınırına ulaşılmadığı anlamına gelir. 0, tek bir kameranın bile
zamanında yanıt almadığı demektir.

### 5. Bir satırı açın {#bir-satiri-acin}

Bir satıra tıkladığınızda şunları görürsünüz:

- solda, görüntü boyutunuzda ve görüntü sayınızda test edilen her kamera
  sayısının ölçümleri, hedefinize göre BAŞARILI ya da BAŞARISIZ olarak
  işaretlenmiş;
- sağda, varsayılan ayarlarda sonuçların sade bir dille açıklaması;
- altta, kamera eklendikçe yanıt süresinin grafiği; her görüntü boyutu için bir
  çizgi, hedefiniz kesikli çizgiyle. Grafik, birden fazla kameranın ölçüldüğü
  yerde, yani kamera başına bir görüntüyle görünür.

Grafik, rapor ve sunumlar için PNG olarak indirilebilir.

### Nereden başlamalı {#nereden-baslamali}

**"Tek bir Jetson AGX Orin kaç kamerayı izleyebilir?"** Cihazı seçin,
kameralarınızın gönderdiği görüntü boyutunu belirleyin ve Maks. kamera değerini
okuyun. Yalnızca yetişen yapılandırmaları görmek için ihtiyacınız olan kamera
sayısını seçin ve Maks. Yanıt Süresi'ni hedefinize ayarlayın.

**"1080p'ye değer mi?"** Görüntü boyutunu değiştirip Maks. kamera değerini
izleyin ya da bir satırı açın: grafiğinde her görüntü boyutu için bir çizgi
vardır.

**"Kuantizasyon ve engine neyi değiştirir?"** Modeli ve cihazı sabit tutup
yalnızca o ayarda farklılaşan satırları karşılaştırın: Jetson AGX Orin'de Q8_0 ve
Q4_K_M ile Qwen3-VL-8B-Instruct ya da RTX PRO 6000'de llama.cpp ve vLLM ile
Qwen3-VL-4B-Instruct. Kamera sayısını değiştirmek, farkın yük altında nasıl
geliştiğini gösterir.

**"Bu donanıma zaten sahibiz; üzerinde ne çalıştırabiliriz?"** Cihaz filtresiyle
başlayın, kalan modelleri boyuta ya da Maks. kamera değerine göre sıralayın ve
ihtiyacınız olan yanıt süresi ya da kamera sayısıyla daraltın.

</div>
</details>

<details class="bt-howto">
<summary>Sayılar ne anlama gelir ve nasıl hesaplanır?</summary>
<div class="bt-howto-body" markdown="1">

### Sayılar nasıl ölçüldü {#sayilar-nasil-olculdu}

Her istek bir ya da daha fazla fotoğraf ve *Describe the scene.* istemini taşır
ve en fazla 128 token ister. Fotoğraflar, istekler arasında sırayla kullanılan
ve 854×480 (480p), 1280×720 (720p), 1920×1080 (1080p) ve 2560×1440 (2K)
boyutlarına ölçeklenen on altı sabit resimdir; OpenAI uyumlu sohbet API'si
üzerinden base64 görüntüler olarak gönderilir. Hugging Face checkpoint'leri vLLM
ile, GGUF dosyaları llama.cpp ile sunuldu.

Görüntü boyutu, istek başına görüntü ve kamera sayısının her birleşimi, atılan
bir ısınma turundan sonra ayrı ayrı ölçülür. Değerler, tamamlanan isteklerin
ortalamasıdır; benchmark sırasında başarısız olan bir istek ortalamaya
katılmaz ve yapılandırmanın aleyhine sayılmaz.

- **Birden fazla kamera**, 480p, 720p ve 1080p'de istek başına bir görüntüyle
  ölçüldü: Jetson Orin NX'te 1, 2 ve 4 kamera (bir yapılandırmada 8'e kadar),
  Jetson AGX Orin'de 8'e, RTX PRO 6000'de 16'ya kadar; her seviyede bir
  Jetson'da 8, RTX PRO 6000'de 24 istek gönderildi ve aynı anda hiçbir zaman
  seviyedekinden fazla kameranın isteği işlenmedi.
- **Tek kamera**, dört boyutun hepsinde istek başına bir, üç ve beş görüntüyle,
  her birinde 5 istekle (bir yapılandırmada 3) ölçüldü. 2K ve istek başına
  birden fazla görüntü yalnızca bu şekilde ölçüldü.

**Token**, bir modelin okuduğu ve yazdığı birimdir; kabaca bir İngilizce
kelimenin dörtte üçü. Bir görüntü de token olarak okunur ve büyük bir görüntü
daha çok token'a dönüşür.

### Yanıt süresi {#yanit-suresi}

**Yanıt süresi**, bir kameranın yanıtı başlayana kadar beklediği süredir — ilk
token süresi (TTFT, time to first token), saniye cinsinden. Bir görüntü-dil
modelinde bu sürenin çoğu görüntüleri okumaktır; bu yüzden görüntülerin boyutu ve
sayısıyla, cihazı paylaşan kamera sayısıyla birlikte artar. Boyutla ne kadar
arttığı modele bağlıdır: bazıları her görüntüyü sabit sayıda token'a, bazıları
piksel arttıkça daha çok token'a dönüştürür. Düşük olması iyidir.

**TPS (saniyedeki token)**, yanıtın ardından kamera başına ne kadar hızlı
yazıldığıdır. Görüntüye neredeyse hiç bağlı değildir ve bilgi için gösterilir:
Maks. kamera yanıt süresine göre belirlenir. Uzun bir yanıt, yazılma süresini
bunun üstüne ekler — saniyede 25 token hızla 128 token yaklaşık beş saniye daha
sürer.

### Maks. kamera: kamera sayısı eşzamanlılıktır {#maks-kamera}

Bir kamera, önceki isteği yanıtlanır yanıtlanmaz sıradaki isteğini gönderir;
yani her zaman tam olarak bir isteği işlenmektedir. Bu yüzden eşzamanlı istek
sayısı kamera sayısıdır.

Maks. kamera, yanıt süresinin hedefinizi karşıladığı en yüksek **ölçülmüş**
kamera sayısıdır. Yalnızca ölçülen sayılar
sayılır, ara değer üretilmez; hiçbiri geçmezse değer 0'dır. Hedefinize bağlıdır
ve onunla birlikte değişir: 720p'de ve kamera başına bir görüntüyle, Jetson AGX
Orin üzerindeki Cosmos3-Edge 1 saniyede 2 kameraya, 3 saniyede 8 kameraya —
ölçülen en yüksek sayı, yani 8+ — yetişir.

### Kurulumu tanımlayan sütunlar {#kurulumu-tanimlayan-sutunlar}

**Parametre** — görüntü kodlayıcı dahil, modelin yayımlanmış toplam ağırlık
sayısı. Mixture-of-experts modellerde bu, her token için etkin olan kısım değil
toplamdır; çünkü tamamı bellekte tutulur.

**Kuantizasyon** — ağırlıkların saklandığı sayı biçimi. BF16 tam hassasiyettir,
FP8 8 bit, NVFP4 4 bit kullanır. Q8_0, Q4_K_M ve Q4_0, llama.cpp için ağırlık
başına yaklaşık 8 ve 4 bitlik GGUF biçimleridir. Daha az bit, daha az bellek ve
genellikle daha çok hız demektir; kalitede bir miktar risk taşır.

**Engine** — modeli yükleyip istekleri zamanlayan sunucu yazılımı. Hıza donanım
kadar etki eder. RTX PRO 6000 üzerinde 720p'de Qwen3-VL-4B-Instruct, tek bir
kameraya llama.cpp (Q8_0) ile 0.25 sn, vLLM (BF16) ile 0.16 sn sonra yanıt
vermeye başlar; 16 kamerada fark 1.09 sn'ye karşı 0.46 sn'dir.

**Cihaz** — Jetson Orin NX (16 GB) ve Jetson AGX Orin (32 GB), CPU ile GPU'nun
tek bir belleği paylaştığı gömülü modüllerdir; RTX PRO 6000 Blackwell, 96 GB'lık
bir iş istasyonu GPU'sudur ve 600 W'lık Workstation ile 300 W'lık Max-Q
sürümlerinde ölçüldü.

### Sayıların söylemedikleri {#sayilarin-soylemedikleri}

Tablo, yapılandırmaların bir saha incelemesi olmadan karşılaştırılabilmesi için
tek bir sabit iş yükü — örnek fotoğraflar, kısa bir istem, en fazla 128
tokenlık yanıtlar — ve ortalama değerler kullanır. **Kendi kameralarınız ve
istemlerinizle yapılacak bir testin yerini tutmaz**: farklı görüntü içeriği, daha
uzun istemler ya da yanıtlar, farklı engine ayarları ve ortalama yerine en yavaş
istekler gerçek kapasiteyi değiştirir. Yanıt süresi, yanıtın başlamasına kadar
geçen beklemedir; yanıtın tamamına ihtiyaç duyan bir uygulama yazılma süresini
de bekler ve yalnızca tek kamerayla ölçülmüş bir satır, birden fazla kamerayla
nasıl davrandığı hakkında bir şey söylemez.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/vlm-benchmark-table.css">

<div data-vlmbt-src="/assets/data/vlm-benchmarks.json"
     data-vlmbt-logo="/assets/images/benchmark-logo.png"></div>

{% include benchmark-jsonld.html kind="vlm" %}
{% include vlm-benchmark-explained.html %}

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/vlm-benchmark-table.tr.js"></script>
