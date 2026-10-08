---
title: Cihaz Önerisi
nav_order: 7
lang: tr
page_id: device-advisor
date: 2026-10-06 16:00:00 +0300
card_tag: "Cihaz Önerisi"
description: >-
  Kameralarınızı tarif edin, bir görüntü-dil modeli seçin; bu sayfa ölçtüğümüz
  cihazlar arasından yetişebilen en küçüğünü söylesin. Ardından akışı canlı bir
  zaman çizgisinde oynatsın: her kamera ne sıklıkla yanıt alıyor ve yakaladığı
  karelerin kaçını model görüyor?
permalink: /device-advisor/
last_modified_date: 2026-10-06
toc: false
---

# Cihaz Önerisi

Kaç kameranız olduğunu, görüntülerinin ne kadar büyük olduğunu ve hangi
görüntü-dil modelini çalıştırmak istediğinizi söyleyin. Bu sayfa ölçtüğümüz
cihazlar arasından yetişebilen en küçüğünü söyler, sonra bu cevabı oynatır:
kamera başına bir şerit, her istek için bir bant ve aralarda biriken kareler.

Arkada çalışan bir sistem yok. Zaman çizgisi, bu sitede zaten yayımlanmış
ölçümlerin gerçek zaman hızında çizilmiş bir izdüşümüdür.

<details class="bt-howto">
<summary>Bu sayfa nasıl okunur</summary>
<div class="bt-howto-body" markdown="1">

### Ne seçiyorsunuz

**Model** — çalıştırmak istediğiniz görüntü-dil modeli. Yalnızca ölçtüğümüz
modeller listelenir.

**Görüntü boyutu** — her kameranın gönderdiği görüntünün büyüklüğü: 480p, 720p,
1080p ya da 2K. Bu sayfadaki en güçlü kaldıraç budur. Bir görüntü-dil modeli
bekleme süresinin çoğunu görüntüyü okuyarak geçirir; 720p'den 1080p'ye çıkmak
cihazı değiştirmekten daha pahalıya gelebilir.

**Kamera** — aynı anda istek gönderen kamera sayısı. Her kamera bir öncekine
yanıt gelir gelmez yenisini gönderir, dolayısıyla kamera sayısı aynı zamanda
işlemdeki istek sayısıdır.

*Diğer seçenekler* altında üç tane daha var: her isteğin kaç kare taşıdığı, bir
kameranın yanıtının başlaması için en fazla ne kadar bekleyebileceği ve
kameraların kendi kare hızı. Sonuncusu hiçbir ölçümü değiştirmez — "dört
saniyede bir istek" ifadesini "model seksen karede birini görüyor" ifadesine
çeviren şeydir.

### Sayılar ne anlama geliyor

**Yanıt şu süre sonra başlar**, ölçülmüş ilk token süresidir: bir kamera
yanıtının gelmeye başlaması için ne kadar bekler. Hedefle karşılaştırılan ve
öneriyi belirleyen sayı budur.

**Yanıt sıklığı** buna yanıtın yazılma süresini de ekler; yani tam gidiş-dönüş,
dolayısıyla bir kameraya ne sıklıkla bakıldığıdır.

**Modele ulaşan kare** bu gidiş-dönüşü, kameranın bu arada yakaladıklarıyla
karşılaştırır. İnsanları en çok şaşırtan sayı budur: saniyede 20 kare yayınlayan
ve dört saniyede bir yanıtlanan bir kamerada, modelin okuduğu her kareye karşılık
seksen kare geçip gitmiştir.

### Neden o cihaz

Hedefinizi tutan cihazlar başta listelenir, **en küçüğü önde** — işe yarayan
öneri, laboratuvardaki en hızlı makine değil, işi gören en az donanımdır. Hedefi
tutmayanlar, en yakını önde olacak şekilde arkadan gelir; böylece kıl payı
kaçırılan bir hedef gizlenmek yerine görünür olur. Akışını oynatmak için
herhangi birine tıklayabilirsiniz.

*Tahmini* etiketli bir kart ara değerle hesaplanmıştır: tarama 1, 2, 4, 8 ve 16
kamerada ölçüldü ve sizin sayınız bunlardan ikisinin arasına düşüyor. Bir
yapılandırmanın gerçekten test edildiği en yüksek kamera sayısının ötesine hiçbir
şey uzatılmaz — kamera sürgüsü ölçümlerin bittiği yerde durur.

### Zaman çizgisi ne gösteriyor

Her kameranın şeridi ikiye ayrılır. **Üst satır** istek başına bir banttır;
isteğin tamamını kaplar ve ne kadar sürdüğü üzerinde yazar. Bandın içindeki çizgi
bu süreyi iki parçaya böler:

- **Koyu, çizgiye kadar** — ilk token'a kadar geçen süre, yani ölçülen TTFT. Tek
  kamerada bu, modelin görüntüleri okumasıdır: decode etmesi, vision encoder'ı
  çalıştırması ve çıkan token'lar üzerinde prefill yapması. Birden fazla kamerada
  ise çoğunlukla isteğin diğerlerinin arkasında sıra beklemesidir — görüntüler
  değişmediği hâlde bu parçanın kamera sayısıyla büyümesinin sebebi budur.
- **Açık, çizgiden sonra** — yanıtın geri kalanının yazılması: ölçülen token
  hızında 128 token.

Bantlar uç uca durur, çünkü kamera bir önceki yanıt tamamlanır tamamlanmaz
yenisini gönderir — cihaz hiç boşta kalmaz. **Alt satır** aynı zaman aralığının
kamera tarafından görünüşüdür: *bir sonraki* istek için biriken kareler. Aradaki
ok, karelerin seçilip modele verildiği anı işaretler.

İki satır bilerek aynı x eksenini paylaşır. N'inci isteğin işlenmesi ile
N+1'inci isteğin kare toplaması gerçekten aynı saniyelerde olur; kameranın
yakaladığının bu kadar azını görmesinin sebebi de tam olarak bu eşzamanlılıktır.

Görüntüdeki iki şey ölçüm değildir ve ikisi de yalnızca görseldir: şeritler aynı
anda başlamak yerine bir devire yayılmıştır ve her şeridin zamanlaması ölçülen
ortalamanın birkaç yüzde çevresinde değişir. Zaman çizgisinin üstündeki sayılar
ortalamaların kendisidir, dokunulmamıştır.

### Bu sayfa ne değildir

Bu sayfanın dayandığı ölçümler tek bir sabit iş yükü kullanır — örnek
fotoğraflar, kısa bir istem, en fazla 128 token'lık yanıtlar — ve ortalama
değerlerdir. Sizin kameralarınız, istemleriniz ve yanıt uzunluklarınız farklı
olacaktır; üretimde en yavaş istekler ortalamadan daha önemlidir. Sonucu bir
kapasite planı değil, bir kısa liste olarak değerlendirin. Dayanak sayılar ve
onlara ilişik her uyarı
[VLM Çıkarım Benchmark Gezgini](/vlm-inference-benchmarks/) sayfasındadır.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/device-advisor.css">

<div data-da-src="/assets/data/vlm-benchmarks.json" data-da-lang="tr"></div>

<script src="/assets/js/device-advisor.js"></script>
