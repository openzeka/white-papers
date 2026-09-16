---
title: CV Çıkarım Benchmark Gezgini
nav_order: 5
lang: tr
page_id: cv-inference-benchmarks
card_order: 11
card_tag: "CV Benchmark"
card_date: "Eylül 2026"
description: >-
  OpenZeka'nın NVIDIA GPU'lar ve Jetson cihazlar üzerindeki görüntü işleme
  çıkarım benchmark'larını keşfedin. Bir GPU ve bir tespit modeli seçin; o
  cihazın hangi kare hızını sürdürdüğünü, kamera eklendikçe nasıl düştüğünü ve
  hedef FPS'inizde kaç kamera taşıdığını görün.
permalink: /cv-inference-benchmarks/
last_modified_date: 2026-09-15
toc: false
---

# CV Çıkarım Benchmark Gezgini

Bu cihaz bu modeli kaç kamerada, hangi kare hızıyla çalıştırabilir? Bir cihaz ve
bir model seçin, kabul edilebilir saydığınız kare hızını girin; tablo ölçtüğümüz
her yapılandırma için cevabı versin. Bir satırı açtığınızda o yapılandırmanın tüm
kamera taramasını ve eğrisini görürsünüz.

<details class="bt-howto">
<summary>Benchmark gezgini nasıl kullanılır</summary>
<div class="bt-howto-body" markdown="1">

### Bir satır nedir

Bir satır **eksiksiz bir dağıtım yapılandırmasıdır**: tek bir model, tek bir
precision ve giriş çözünürlüğünde, tek bir cihaz üzerinde, DeepStream üstünde
çalışan Cordatus Inference Engine ile. Aynı model her cihaz için bir kez görünür;
iki satırı karşılaştırmak ancak hangi sütunlarının farklı olduğunu bildiğinizde
anlamlıdır.

### Sayılar nasıl ölçüldü

Her değer OpenZeka'nın kendi ölçümüdür; Cordatus Inference Engine'e karşı
cordatus-benchmark aracıyla alınmıştır. Araç her kamera sayısı için bir iş
başlatır, bütün kameraların pipeline'a girmesini ve karelerin akmasını bekler,
pipeline'ın oturmasına izin verir ve ardından engine'in profiler'ını 30 saniye
boyunca örnekler.

Engine'in sayaçları iki saniyede bir sıfırlanan kayan bir penceredir; bu yüzden
okumalar pencerelere ayrılır, her pencereden en olgun okuma alınır ve güvenilmeyecek
kadar kısa kalan pencereler elenir. Engine'in kendi placeholder kaynağı bütün
değerlerden çıkarılır. İstenen kameraların hepsinin yayın yapmadığı bir ölçüm ise
bu sayfaya hiç alınmaz — öyle bir koşu, etiketinde yazandan daha az kamerayı
ölçmüştür.

### Sütunlar ne anlatıyor

**Kamera** — satırdaki değerlerin ölçüldüğü kamera sayısı: o yapılandırmanın,
filtre panelindeki sınırın altında ölçülmüş en ağır yükü. Satırdan satıra
değişebildiği için sayı, başlıkta değil değerlerin yanında duruyor.

**FPS / kamera** — o kamera sayısında tek bir kameranın işlendiği kare hızı.
"Kameralarıma yetişir mi" sorusunun cevabı budur. Yüksek olması iyidir.

**Toplam FPS** — o kamera sayısında tüm pipeline'ın işlem hacmi.

**Drop %** — pipeline'a girip çıkmayan karelerin oranı. Sıfıra yakın olması
sağlıklıdır.

**Maks. kamera** — yapılandırmanın hedef FPS'inizi hâlâ tuttuğu, **ölçülmüş** en
yüksek kamera sayısı. Hedefi değiştirdiğinizde bu değer de değişir ve yalnızca
ölçülen noktalardan alınır; hiçbir şey ekstrapole edilmez.

### Yayın önizlemesi ne gösteriyor

Bir satırı açtığınızda aynı kısa CCTV klibi yan yana iki kez oynar: soldaki
kameranın kendi 20 FPS'inde, sağdaki o yapılandırmanın ulaştığı kare hızında.
Tarama tablosunda farklı bir kamera sayısına tıklamak sağdaki pencereyi
değiştirir; böylece kamera eklemenin bedeli tahmin edilmek yerine görünür olur.
Klip, sabit kameradan çekilmiş hızlı araç görüntüsüdür — kare hızı en kolay hızlı
harekette ayırt edilir. Bir benchmark koşusundan alınmış görüntü değildir ve
üzerinde tespit çalışmamaktadır.

### Kamera sınırı

Filtre panelindeki kaydırıcı bir seçim değil, üst sınır: üstündeki bütün
ölçümleri gizler ve şimdiye kadar ölçülmüş en yüksek kamera sayısında durur.
12'ye çektiğinizde her satır 12 kameraya kadar ölçüldüğü en ağır yükü raporlar;
tarama tablosu, eğri ve yayın önizlemesi de ona uyar. O sınırın altında hiç
ölçümü olmayan bir yapılandırma, sınır yükseltilene kadar tablodan düşer.

### Bu ölçümlerdeki tavan

Bu taramaları besleyen kameralar sabit **20 FPS** yayın yapan canlı 1080p H.264
akışlardır; dolayısıyla hiçbir yapılandırma bir kamerayı 20 FPS'ten hızlı
işleyemez. Test ettiğimiz en yüksek kamera sayısında hâlâ bu hızı veren bir
cihazın kendi sınırına ulaşılmamıştır: Maks. kamera değerinin yanında **≥**
işareti çıkar ve sayı bir tavan değil tabandır. Cihaz sınırının görünür olduğu
satır Jetson Orin Nano'dur — kamera eklendikçe kamera başına kare hızı 20 FPS'ten
uzaklaşır ve toplam işlem hacmi düzleşir.

Masaüstü GPU'larda daha yüksek kamera sayıları, GPU'dan önce tükenmeyen bir
kaynak gerektiriyor. O koşular beklemede; tablo geldiklerinde büyüyecek.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/cv-benchmark-table.css">

<div data-cvbt-src="/assets/data/cv-benchmarks/index.json"
     data-cvbt-video="/assets/video/cv-preview.mp4"></div>

<p class="bt-attribution">Bu sayfadaki her değer OpenZeka&rsquo;nın kendi
donanımı üzerinde aldığı kendi ölçümüdür.</p>

<script src="/assets/js/cv-benchmark-table.tr.js"></script>
