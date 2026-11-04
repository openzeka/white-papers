---
title: CV Çıkarım Benchmark Gezgini
nav_order: 5
lang: tr
page_id: cv-inference-benchmarks
date: 2026-09-16 16:07:02 +0300
card_tag: "CV Benchmark"
description: >-
  OpenZeka'nın NVIDIA GPU'lar ve Jetson cihazlar üzerindeki görüntü işleme
  çıkarım benchmark'larını keşfedin. Bir GPU ve bir tespit modeli seçin; o
  cihazın hangi kare hızını sürdürdüğünü, kamera eklendikçe nasıl düştüğünü ve
  hedef FPS'inizde kaç kamera taşıdığını görün.
permalink: /cv-inference-benchmarks/
last_modified_date: 2026-09-24
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

Bir satır bir model değil, **eksiksiz bir dağıtım yapılandırmasıdır**: tek bir
tespit modeli, tek bir precision ve giriş çözünürlüğünde, tek bir cihaz
üzerinde, DeepStream üstünde çalışan Cordatus Inference Engine ile. Bu yüzden
aynı model ölçüldüğü her cihaz için bir kez görünür; iki satırı karşılaştırmak
ancak hangi sütunlarının farklı olduğunu bildiğinizde anlamlıdır.

### Sayılar nasıl ölçüldü

Her değer OpenZeka'nın kendi ölçümüdür; Cordatus Inference Engine'e karşı
[cordatus-benchmark](https://github.com/CordatusAI) aracıyla NVIDIA Jetson Orin
Nano, Jetson Orin NX 16GB, Jetson AGX Orin 64GB, Jetson AGX Thor, GB10 (DGX
Spark), GeForce RTX 3060 ve RTX 3090 üzerinde alınmıştır. Yeni cihaz ve modeller test edildikçe havuz büyüyor.

Kameraların hepsi **sabit 20 FPS'lik 1080p H.264 yayınlardır**: canlı bir IP
kamera ya da Kasım 2026'da ölçülen satırlarda RTSP ile yeniden oynatılan kayıtlı
bir klip (aşağıya bakın). Her yapılandırma artan kamera sayılarında taranır; genellikle
1, 2, 4 ve 8, ardından ikişer ikişer 32'ye kadar. Her yapılandırmada her sayı
bulunmaz: ölçülmemiş ya da ölçümü elenmiş bir kamera sayısı o satırın
taramasında yer almaz.

2-4 Kasım 2026'da ölçülen satırlar iki noktada farklıdır ve notları bunu söyler.
**Cordatus Inference Engine 2.7.2** ile çalıştılar ve her kamera canlı bir kamera
değil, **RTSP ile yeniden oynatılan** aynı kayıtlı 1080p H.264, 20 FPS ofis
klibiydi; ofis kameraları toplamda yalnızca 30 kadar oturum kabul ediyor. Kamera
sayıları bir limit aramasından gelir: 1, 2, 4, 8, 16 ve 32 kamera ve üstü, bir
kamera 15 FPS'in altına düşene ya da karelerinin %2'sinden fazlasını kaybedene
kadar; ardından aradaki fark yarıya bölünür. RTX 3090'da motor GPU tükenmeden
önce 44 ile 48 kamera arasında kilitleniyor, bu yüzden oradaki aramaların çoğu 40
kamerada durur. Jetson'larda
saatler `jetson_clocks` ile en yükseğe sabitlendi ve VIC (video ölçekleyici) saati
en yüksek değerine çekildi: varsayılan yönetecinde VIC 115 MHz'de kalıyor ve her
Jetson'da hattı toplamda 100 FPS civarında sınırlıyordu.

Araç her kamera sayısı için bir iş başlatır, bütün kameraların pipeline'a
girmesini ve karelerin akmasını bekler, pipeline'ın oturmasına izin verir ve
ardından engine'in profiler'ını **30 saniye** boyunca örnekler. Engine'in
sayaçları iki saniyede bir sıfırlanan kayan bir penceredir; bu yüzden okumalar
pencerelere ayrılır, her pencereden en olgun okuma alınır ve güvenilmeyecek
kadar kısa kalan pencereler elenir. Engine'in kendi placeholder kaynağı bütün
değerlerden çıkarılır.

İki tür ölçüm bu sayfaya hiç ulaşmaz. İstenen kameraların hepsinin yayın
yapmadığı bir kamera sayısı elenir, çünkü etiketinde yazandan daha az kamerayı
ölçmüştür. Bir kameranın yayınladığından belirgin biçimde hızlı işleniyor
göründüğü bir sonuç da elenir: bu fiziksel olarak imkânsızdır ve aynı sorunun
işaretidir.

### Parametreler ne anlatıyor

**FPS (saniyedeki kare sayısı)** — her saniye işlenen video karesi sayısı.

**Kamera** — satırdaki değerlerin ölçüldüğü kamera sayısı. Her satır,
filtrelerdeki kamera sınırında veya altında ölçüldüğü en ağır yükü gösterir; bu
yüzden satırlar burada farklılık gösterebilir ve sayı başlıkta değil değerlerin
yanında durur.

**FPS / kamera** — o kamera sayısında her bir kameranın işlendiği kare hızı.
"Kameralarıma yetişir mi" sorusunun cevabı budur. Yüksek olması iyidir; üst
sınır 20'dir, çünkü kameraların gönderdiği bu kadardır.

**Toplam FPS** — o kamera sayısında tüm pipeline'ın işlem hacmi: yaklaşık
olarak kamera başına FPS × kamera sayısı.

**Drop %** — pipeline'a girip çıkmayan karelerin girişe oranı. Sıfıra yakın
olması sağlıklıdır. Küçük negatif değerler de görülür — örnekleme penceresinde
çıkan kareler girenlerden biraz fazla sayılmıştır — ve sıfır gibi okunur.
Drop % bilgi amaçlıdır; GEÇTİ / KALDI sonucunu ve Maks. kamera değerini
etkilemez.

**Giriş çözünürlüğü** — her karenin model tarafından işlenmeden önce
ölçeklendiği boyut, genişlik × yükseklik. Bu kameranın değil modelin kendi
girişidir: kameralar 1080p gönderir ve pipeline her kareyi küçültür. Daha büyük
bir giriş kare başına daha fazla hesaplama gerektirir.

**Precision** — modelin engine'inin derlendiği sayı biçimi; kayıtlıysa model
adının yanında gösterilir. INT8, ağırlıkları ve aktivasyonları 8 bitlik tam
sayılarla tutar; düşük precision genellikle daha hızlı çıkarım demektir, ama
doğruluktan bir miktar ödün verme riski taşır.

**Cihaz** — pipeline'ın çalıştığı donanım: bir Jetson modülü (Orin Nano, Orin
NX, AGX Orin, AGX Thor), GB10 tabanlı bir DGX Spark ya da bir GeForce masaüstü GPU. DeepStream,
CUDA ve JetPack/L4T sürümleri ile kayıtlıysa CPU, açılan satırda listelenir.

### Önce oturması gereken iki ayrım

**Filtreler hangi satırların görüneceğine karar verir. Hedef ise sayıların ne
anlama geldiğini değiştirir.** Tek bir cihaza filtrelemek tabloyu kısaltır;
hedef FPS'i yükseltmek satır sayısını değiştirmez, ama Maks. kamera değerini ve
her ölçümün GEÇTİ / KALDI sonucunu yeniden hesaplar.

**Kamera başına FPS ile toplam FPS farklı soruları cevaplar.** Kamera
eklendikçe toplam bir süre artmaya devam eder, oysa her kameraya düşen kare
azalır. Bir cihaz toplamda daha çok iş çıkarıyor görünürken kameralarının her
biri ihtiyacınızın altına düşmüş olabilir. "Yetişiyor mu" sorusu için kamera
başına değeri, "cihaz ne kadar yükleniyor" sorusu için toplamı okuyun.

### 1. Kamera sınırını ayarlayın

Filtrelerdeki kamera sınırı kaydırıcısı bir seçim değil, üst sınırdır: üstündeki
bütün ölçümleri gizler ve şimdiye kadar ölçülmüş en yüksek kamera sayısında
durur. 12'ye çektiğinizde her satır 12 kameraya kadar ölçüldüğü en ağır yükü
gösterir; tarama tablosu, eğri ve yayın önizlemesi de ona uyar. O sınırın
altında hiç ölçümü olmayan bir yapılandırma, sınır yükseltilene kadar tablodan
düşer.

Sınırı gerçekten çalıştırmayı planladığınız kamera sayısına getirin; her satır
sorunuzu kendi yükünüzde cevaplasın.

### 2. Yapılandırmaları daraltın

Cihaz ve model filtreleri birlikte çalışır ve her sütun sıralanabilir; tabloya
donanımdan, modelden ya da kare hızından girebilirsiniz. En öğretici
karşılaştırmalar tek bir değişkeni değiştirir: aynı model iki farklı cihazda ya
da dört YOLO11 boyutu aynı cihazda.

### 3. Hedef FPS'inizi belirleyin

Hedef, kamera başına kabul edilebilir bulduğunuz kare hızıdır. Açılan her
satırda, uygulandığı taramanın yanında durur ve bütün tablo için tek bir
değerdir: bir satırda değiştirdiğinizde hepsinde değişir. Varsayılan değer
**15 FPS**'tir ve sınır **dahildir** — tam 15,0 da geçer.

Hedefi değiştirmek bütün yapılandırmaları anında yeniden değerlendirir: FPS /
kamera sütununun yeşil ve kırmızı renklendirmesi, açılan taramadaki her
noktanın GEÇTİ / KALDI sonucu ve Maks. kamera değeri güncellenir.

Doğru hedef, görüntünün ne için kullanıldığına bağlıdır. Hızlı hareket eden
nesneler — araçlar ya da saymanız veya takip etmeniz gereken her şey — bir
odada birinin bulunup bulunmadığını doğrulamaktan daha fazla kare ister.
Kameralar 20 FPS gönderdiği için bu ölçümlerde 20'nin üstündeki bir hedef
karşılanamaz.

### 4. Maks. kamera değerini okuyun

**Maks. kamera**, yapılandırmanın kamera sınırına kadar hedefinizi hâlâ tuttuğu
en yüksek *ölçülmüş* kamera sayısıdır. Yalnızca ölçülen noktalardan alınır —
hiçbir şey ekstrapole edilmez — ve hedefi karşılayan ölçülmüş nokta yoksa 0
görünür.

Hedefi siz belirlediğiniz için Maks. kamera bir yapılandırmanın sabit bir
özelliği değildir; iki ölçüm arasındaki kamera sayıları için bir söz de
değildir.

<div class="bt-howto-example" markdown="1">
**Örnek.** GB10 üzerinde PeopleNet, 32 kamerada kamera başına 16,1 FPS, 34
kamerada 12,9 FPS veriyor; varsayılan 15 FPS hedefinde Maks. kamera 32'dir.
Hedefi 18 FPS'e çıkarın, 16'ya düşer: ölçülmüş bir sonraki sayı, hâlâ 19,8 FPS.
Bu arada toplam FPS artmayı bırakır: 32 kamerada yaklaşık 514, 34 ile 48 kamera
arasında 418 ile 490 arası — eklenen kameralar işlem hacmine katkı yapmıyor, aynı
hacmi paylaşıyor.
</div>

Değerin yanındaki **≥** işareti, cihazın kendi sınırına ulaşmadığını gösterir:
gösterilen en yüksek kamera sayısında hâlâ kameraların 20 FPS'ini en fazla %10
eksiğiyle veriyordu. Bu değerler tavan değil, tabandır. ≥ işareti kamera
sınırına da bağlıdır — sınırı düşürürseniz, 28 kamerada geride kalan bir cihaz
16'da ≥ gösterir, çünkü 16 kamerada hâlâ yetişiyordu.

### 5. Ayrıntı için bir satırı açın

Satırın tamamı tıklanabilir. Açtığınızda tüm kamera taraması görünür; GEÇTİ /
KALDI her kamera sayısında hedefinizin tutup tutmadığını gösterir — tek bir
özet değerin gizlediği davranış budur.

Taramanın yanında bir **yayın önizlemesi** aynı kısa klibi yan yana iki kez
oynatır: soldaki kameranın kendi 20 FPS'inde, sağdaki o yapılandırmanın
ulaştığı kare hızında. Taramada bir kamera sayısı seçmek sağdaki pencereyi
değiştirir; böylece kamera eklemenin bedeli tahmin edilmek yerine görünür olur.
Klip, sabit bir kameranın önünden geçen hızlı araçları gösterir, çünkü kare
hızı en kolay hızlı harekette ayırt edilir. Bir benchmark koşusundan alınmış
görüntü değildir ve üzerinde tespit çalışmamaktadır.

Grafikte iki eğri vardır:

- **Kamera başına FPS** — genellikle 20 civarında kalır, cihazın payı bitince
  düşmeye başlar.
- **Toplam FPS** — her eklenen kamerayla artar, sonra aynı noktada düzleşir.

İki eğrinin yön değiştirdiği kamera sayısı, cihazın o model için çalışma
sınırıdır; kesikli çizgi hedefinizi gösterir. Cihazın donanım ve yazılım
sürümleri ile satırın dayandığı benchmark koşuları grafiğin altında listelenir.

### Nereden başlamalı

**"PeopleNet'i 15 FPS'te 16 kamerayla çalıştırmamız gerekiyor — hangi
cihaz?"** Modeli seçin, kamera sınırını 16'ya getirin ve FPS / kamera sütununa
göre sıralayın. Kamera sütununda 16 ve kamera başına 15 veya üstü yazan her
satırın cevabı evettir. Daha az kamera gösteren bir satır 16'da hiç
ölçülmemiştir; soruyu ne olumlu ne olumsuz cevaplar.

**"Elimizde bir Jetson AGX Thor var; hangi YOLO11 boyutunu kaldırabilir?"**
Cihazı seçin ve Maks. kamera sütununa göre sıralayın. Dört boyut yalnızca
modelde ayrışır; aralarındaki fark, daha büyük bir modelin bedelidir.

**"Aynı model farklı donanımda nasıl?"** Tek bir modeli seçin ve cihazları aynı
kamera sınırında karşılaştırın. Sınırı oynatmak, her birinin nerede geride
kalmaya başladığını gösterir.

### Bu tablo neyi söylemez

Tablo, saha keşfi gerektirmeden ilk bir karşılaştırma yapılabilsin diye bilerek
tek, sabit ve karşılaştırılabilir bir iş yükü kullanır. **Kendi kameralarınızla
yapılacak bir testin yerini tutmaz.**

Bütün değerler 20 FPS yayın yapan, canlı ya da yeniden oynatılan 1080p H.264 kameralardan gelir. Farklı
çözünürlük, codec ya da kare hızındaki kameralar çözme ve ölçekleme yükünü
değiştirir. Üretimdeki bir pipeline çoğu zaman tespitin üstüne takip, ikincil
sınıflandırıcılar, kayıt ya da analitik ekler; ölçülen pipeline'ın çalıştırmadığı
hiçbir şey bu değerlerde yoktur. Her ölçüm 30 saniyelik kararlı durumdur, bu
yüzden saatler boyunca davranış hakkında bir şey söylemez — örneğin fansız bir
kasadaki ısıl sınırlar. Ve bunlar yalnızca hız ölçümleridir: bir modelin ne
kadar doğru tespit yaptığı burada ölçülmez.

RTX 3060'ta daha yüksek kamera sayıları — test ettiğimiz en yüksek sayıda hâlâ
yetişiyordu — GPU'dan önce tükenmeyen bir kamera kaynağı gerektiriyor. O koşular
beklemede; tablo geldiklerinde büyüyecek. RTX 3090 Kasım 2026'da yeniden oynatılan
kameralarla tekrar ölçüldü; oradaki arama GPU'nun değil motorun kilitlendiği yerde
durur.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/cv-benchmark-table.css">

<div data-cvbt-src="/assets/data/cv-benchmarks/index.json"
     data-cvbt-video="/assets/video/cv-preview.mp4"></div>

<p class="bt-attribution">Bu sayfadaki her değer OpenZeka&rsquo;nın kendi
donanımı üzerinde aldığı kendi ölçümüdür.</p>

{% include benchmark-jsonld.html kind="cv" %}
{% include cv-benchmark-links.html %}

<script src="/assets/js/cv-benchmark-table.tr.js"></script>
