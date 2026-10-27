---
title: Cordatus Custom Engine VLM Benchmark Gezgini
nav_order: 8
lang: tr
page_id: custom-engine-vlm-benchmarks
date: 2026-10-27 12:00:00 +0300
card_tag: "Custom Engine Benchmark"
description: >-
  Kameraları bir GPU sunucusundaki görüntü-dil modeli yanıtlarken bir cihaz
  Cordatus custom engine üzerinden kaç kamera çalıştırabilir? Jetson AGX Thor,
  Jetson AGX Orin 32GB Developer Kit ve ASUS Ascent GX10 üzerinde, her soruyla
  gönderilen her kare sayısı için ölçüldü.
permalink: /custom-engine-vlm-benchmarks/
last_modified_date: 2026-10-27
toc: false
---

# Cordatus Custom Engine VLM Benchmark Gezgini

Bu cihaz custom engine üzerinden kaç kamera çalıştırabilir ve her kamera ne
sıklıkla yeni bir yanıt alır? Her kamera cihazda `custom_engine_vlm` ile
Cordatus Stream Engine üzerinde çalışır; motor karelerini ayrı bir GPU
sunucusundaki görüntü-dil modeline gönderir ve yanıt gelir gelmez yeniden
sorar. Her soruyla kaç kare gideceğini seçin, bir kameranın iki yanıt arasında
ne kadar bekleyebileceğini belirleyin; tablo ölçtüğümüz her cihaz için yanıt
verir. Tam kamera taramasını, VLM sunucusunun o sırada ne yaptığını ve eğriyi
görmek için bir satırı açın.

<details class="bt-howto">
<summary>Benchmark gezgini nasıl kullanılır</summary>
<div class="bt-howto-body" markdown="1">

### Bir satır nedir

Bir satır, **iş hattının bütün kamera tarafını çalıştıran bir cihazdır** — her
kamerayı çözen Cordatus Stream Engine ve karelerini sorulara dönüştüren
`custom_engine_vlm` — ve soru sorduğu **VLM sunucusudur**: tek bir GPU'da, tek
bir motorla, tek bir sayı biçiminde sunulan tek bir model. VLM cihazda
çalışmaz. Bu sayfadaki bütün cihazlar aynı sunucuya sordu; bu yüzden satırları
arasında değişen tek şey cihazdır.

### Değerler nasıl ölçüldü

Her değer, Custom Engine VLM Benchmark aracıyla, `custom_engine_vlm` çalıştıran
Cordatus Stream Engine 3.0.12'ye karşı Jetson AGX Thor, bir Jetson AGX Orin
32GB Developer Kit ve bir ASUS Ascent GX10 (GB10) üzerinde alınmış bir OpenZeka
ölçümüdür. VLM sunucusu, RTX PRO 6000 Blackwell Workstation Edition üzerinde
vLLM ile sunulan FP8 biçiminde Qwen3-VL-30B-A3B-Instruct'tı.

Her kamera **aynı 720p H.264, 15 FPS sokak klibidir**; cihazın kendisinden RTSP
ile yeniden oynatılır, kamera başına bir yayın. Motor her kameradan saniyede
dört kare alır, 960 piksel genişliğe ölçekler, CPU'da çözer ve kareleri JPEG
olarak *Describe the scene in one sentence.* istemiyle gönderir. Alarmlar
kapalıdır. Her kameranın aynı anda tek bir sorusu vardır: bir sonraki, bir
öncekinin yanıtı döner dönmez gider.

Her yapılandırma artan kamera sayılarında taranır — 1, 4, 8 ve 16, ardından
cihaza göre 24, 32, 40, 48, 64 ve 128'in bir kısmı. Her kamera sayısında araç
kameraları başlatır, hepsinin kare vermesini bekler, iş hattının oturmasına
izin verir, ardından motorun her soru ve yanıt için kendi tuttuğu kaydı **60
saniye** boyunca okur (otomatik karede ASUS Ascent GX10 için 120 saniye). VLM
sunucusunun metrikleri ile cihazın CPU ve belleği aynı pencerede okunur.

Bir tarama, 3 saniyeyi kaçıran ilk kamera sayısında durur. Bunu kaçıran
sayıların çoğu ikinci kez ölçüldü ve gösterilen ikinci ölçümdür. Bütün
kameraların izin verilen süre içinde açılmadığı bir sayı taramayı başarısız
olarak kapatır. Hiçbir kameranın açılmadığı bir sayı ölçüm değil motor
arızasıydı ve dışarıda bırakıldı.

### Parametreler ne anlama gelir

**Aralık** — bir kameranın iki yanıt arasında ortalama ne kadar beklediği,
motorun kendi saatiyle ölçülür. Tablo bunu o kamera sayısındaki *en yavaş*
kamera için gösterir ve hedefinizle karşılaştırılan değer budur: herhangi bir
kamera hakkındaki en yeni yanıtın ne kadar eskiyebileceğini söyler. Bütün
kameraların ortalaması açılan satırdadır. Düşük olması iyidir.

**İstek başına kare** — her soruyla kaç video karesinin gittiği. *Otomatik*
motorun kendi seçimidir: bu istem için en fazla üç, son yanıttan beri daha az
yeni kare geldiyse daha az; bu yüzden tek kamerada yaklaşık 1.5'ten yanıtlar
yavaşladığında 3'e çıkar. Bir sayı onu sabitler; yeterince yeni kare
gelmediyse motor isteği sakladığı karelerden tamamlar. Daha fazla kare modele
daha çok şey gösterir ve her isteği ağırlaştırır — istem, tek karede yaklaşık
500 token'dan sekiz karede yaklaşık 4,000 token'a çıkar.

**Kamera** — satırdaki değerlerin ölçüldüğü kamera sayısı: filtre panelindeki
kamera sınırında veya altında ölçülen en ağır yük.

**Yanıt / dk** — motorun dakikada aldığı yanıt sayısı, bütün kameralar
birlikte. Kamera eklendikçe artmayı bıraktığı noktada zincir sınırına
ulaşmıştır.

**Motor CPU** — stream engine ile custom engine'in birlikte kullandığı CPU,
çekirdek cinsinden: 1.0 tam meşgul bir çekirdektir. Her kameranın çözümlenmesi
ve her isteğin hazırlanması burada çalışır; kamera sayısıyla birlikte büyümesi
bu yüzdendir. **RAM / kamera** motorun belleğinin kamera sayısına bölümüdür.
Motor cihazda GPU belleği kullanmaz.

**VLM sunucusunda** — istek başına: istem ve çıktı token'ları, ilk token'a
kadar geçen süre, kuyrukta geçen süre, kullanılan KV önbellek, aynı anda
çalışan en fazla istek sayısı ve aynı pencerede sunucunun isteklerinden diğer
istemcilerden gelenlerin payı — paylaşılan bir sunucuydu. Sunucunun değerleri
bütün isteklerini kapsar; bu yüzden bu payın en büyük olduğu bir ya da birkaç
kamerada değerler diğer istemcilerinkiyle karışıktır. İstekler kuyruğa girmeye
başladığında sınır sunucudur; girmediği hâlde aralık büyümeye devam ediyorsa
sınır cihazdır.

### 1. İstek başına kareyi seçin

Filtre panelindeki kare seçimi her satırın hangi taramayı gösterdiğini
belirler; böylece satırlar yalnızca aynı kare sayısında karşılaştırılır.
*Otomatik* ile açılır. Açılan bir satırdaki **İstek başına kare** tablosu o
cihaz için her kare sayısını kendi Maks. kamera değeriyle listeler; oradan bir
satır seçmek bütün tabloyu ona geçirir.

### 2. Kamera sınırını belirleyin

Kaydırıcı bir üst sınırdır, seçim değil. Üstünde ölçülen her şeyi gizler ve her
satır o sayıya kadar ölçüldüğü en ağır yükü gösterir. Çalıştırmayı
planladığınız kamera sayısına ayarlayın.

### 3. Hedef aralığınızı belirleyin

Hedef, bir kameranın yetişildi sayabilmeniz için iki yanıt arasında ortalama en
fazla ne kadar bekleyebileceğidir. Açılan her satırla birlikte açılır ve bütün
tablo için tek bir değerdir. Varsayılan **3 saniyedir** ve sınır dahildir.
Değiştirmek her ölçümün durumunu, Aralık renklendirmesini ve Maks. kamera
değerini yeniden hesaplar.

### 4. Maks. kamera değerini okuyun

**Maks. kamera**, kamera sınırına kadar, en yavaş kameranın hiçbir istek
başarısız olmadan hedefinizi hâlâ karşıladığı en yüksek *ölçülmüş* kamera
sayısıdır. Hiçbir şey ekstrapole edilmez ve iki ölçüm arasındaki sayılar için
bir söz değildir. Yanındaki **+**, ölçülen en yüksek sayının hâlâ hedefi
karşıladığını, yani gerçek sınırın daha yüksek olduğunu gösterir. Tek bir
kamera bile hedefi kaçırıyorsa sütun hedefi kırmızıyla gösterir.

Taramalar 3 saniyeyi kaçıran ilk sayıda durduğu için daha gevşek bir hedef
ancak o sayıya kadar denetlenebilir; **+** bunun bir değeri nerede kısa
kestiğini işaretler.

<div class="bt-howto-example" markdown="1">
**Örnek.** Otomatik karede Jetson AGX Thor 32 kameranın her birine 2.30 sn
içinde yanıt verir; bu yüzden varsayılan 3 sn hedefinde Maks. kamera 32'dir. 40
kamerada 900 saniye içinde yalnızca 39'u açıldı ve bu taramayı kapatır. Kareyi
4'e sabitleyin, sınır 24'e (2.84 sn), 8 karede ise 8'e (1.25 sn) düşer — her
fazladan kare kamerayla ödenir.
</div>

### 5. Ayrıntı için bir satırı açın

Satırın tamamı tıklanabilir. Bir satırı açmak kamera taramasını aralık, en
yavaş kamera, istek süresi, gerçekten gönderilen kare, motora ulaşan kare,
motorun CPU ve belleği ile cihazın CPU'su ile birlikte, her sayıyı hedefinize
göre işaretleyerek gösterir; ardından aynı sayıları VLM sunucusu tarafından;
kare tablosunu; sonuçların açıklamasını; ve hedefiniz kesikli çizgi olarak,
kamera sayısına göre aralık ve dakikadaki yanıt grafiğini. Satırın ardındaki
donanım ve yazılım sürümleri ile benchmark koşuları en sonda listelenir.

### Nereden başlamalı

**"16 kameraya en az 2 saniyede bir yanıt gerekiyor — hangi cihaz?"** Kamera
sınırını 16'ya, hedefi 2 sn'ye ayarlayın ve Aralık'a göre sıralayın. 16 kamerayı
yeşil gösteren her satırın yanıtı evettir.

**"Kaç kareyi karşılayabiliriz?"** Bir cihazın satırını açın ve kare tablosunu
okuyun: her soru daha fazla kare taşıdıkça Maks. kameranın nasıl düştüğünü
gösterir.

**"Sınır cihaz mı, VLM sunucusu mu?"** Satırı açın ve iki tabloyu karşılaştırın.
Jetson cihazlarda aralık, sunucuda hâlâ bekleyen istek yokken büyür — orada
sınır cihazdır. Bir ya da iki karede ASUS Ascent GX10'da sunucu aynı anda 32
istek çalıştırır ve 64 kameradan itibaren gerisini kuyruğa alır: orada sınır
sunucudur.

### Bu ne söylemez

Tablo tek bir sabit iş yükü kullanır — tek bir klip, tek cümlelik bir istem,
alarmlar kapalı — böylece cihazlar bir saha incelemesi olmadan
karşılaştırılabilir. **Kendi kameralarınız ve istemlerinizle yapılacak bir
testin yerini tutmaz**. Başka çözünürlük ya da kare hızındaki kameralar çözme
yükünü değiştirir; alarm modu, daha uzun istemler ya da daha uzun yanıtlar
isteği değiştirir; başka işlerle paylaşılan ya da farklı bir VLM sunucusu
sunucu tarafındaki her şeyi değiştirir. Yeniden oynatılan kamera yayınları
cihazın kendisinden sunuldu ve CPU'sunun bir kısmını aldı. VLM ayrı bir
sunucuda çalıştı; kendi VLM'ini de çalıştıran bir cihaz GPU'sunu ve belleğini
onunla paylaşır. Her ölçüm 60 saniyelik kararlı durumdur; saatler boyunca
davranış hakkında hiçbir şey söylemez. Ve bunlar yalnızca hız ölçümleridir:
burada hiçbir şey yanıtların ne kadar iyi olduğunu ölçmez.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/cv-benchmark-table.css">
<link rel="stylesheet" href="/assets/css/custom-engine-vlm-benchmark-table.css">

<div data-cevbt-src="/assets/data/custom-engine-vlm-benchmarks/index.json"></div>

<p class="bt-attribution">Bu sayfadaki her değer OpenZeka&rsquo;nın kendi
donanımı üzerinde aldığı kendi ölçümüdür.</p>

{% include benchmark-jsonld.html kind="cevlm" %}
{% include custom-engine-vlm-benchmark-explained.html %}

<script src="/assets/js/custom-engine-vlm-benchmark-table.tr.js"></script>
