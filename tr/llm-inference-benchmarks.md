---
title: LLM Çıkarım Benchmark Gezgini
nav_order: 4
lang: tr
page_id: llm-inference-benchmarks
date: 2026-08-31 11:23:22 +0300
card_tag: "LLM Benchmark"
description: >-
  OpenZeka'nın NVIDIA DGX Spark, DGX B300, RTX PRO 6000 Blackwell ve Jetson Thor
  üzerindeki LLM çıkarım benchmark'larını keşfedin. Modele, parametre sayısına,
  cihaza, kuantizasyona ve eşzamanlılığa göre filtreleyin, kendi performans
  hedeflerinizi girin.
permalink: /llm-inference-benchmarks/
last_modified_date: 2026-09-26
toc: false
---

# LLM Çıkarım Benchmark Gezgini

Farklı LLM, donanım ve sunum yapılandırmalarının çıkarım performansını tek bir
yerde karşılaştırın. Filtreleri kullanarak karşılaştırmak istediğiniz
yapılandırmaları seçin; eşzamanlılık seviyesini ve performans hedeflerinizi
değiştirdiğinizde tablo otomatik olarak güncellenir. Bir yapılandırmanın
ayrıntılı sonuçlarını görmek için ilgili satırı açabilirsiniz.

<details class="bt-howto">
<summary>Benchmark gezgini nasıl kullanılır?</summary>
<div class="bt-howto-body" markdown="1">

### Bir satır ne anlatır {#bir-satir-ne-anlatir}

Bir satır tek bir **kurulum yapılandırmasıdır**: belirli bir donanımda, belirli
bir sayı biçiminde, belirli bir engine ile ve belirli bir paralellik ve
spekülatif kod çözme ayarıyla sunulan bir model — baştan sona ölçülmüş hâliyle.
Bu yüzden aynı model birkaç satırda görünür; iki satırı doğrudan
karşılaştırabilmek için aralarında hangi ayarların farklı olduğunu bilmek
gerekir.

### Filtreler ve hedefler farklı işler görür {#filtreler-ve-hedefler}

**Filtreler hangi satırları gördüğünüzü belirler.** Model, parametre sayısı,
cihaz, kuantizasyon ve spekülatif kod çözme filtreleri ile TPS, TTFT ve kapasite
kaydırıcıları yalnızca satırları gösterir ya da gizler.

**Hedefler ve varsayımlar sayıların ne söylediğini belirler.** Bunlar
*Performans Hedefleri ve Kapasite Varsayımları* altındadır. Birini
değiştirdiğinizde satırlar yerinde kalır, ama Maks C, iki kapasite sütunu ve
her satırın yeşil ve kırmızı renklendirmesi yeniden hesaplanır.

### 1. Eşzamanlılık seviyesini seçin {#eszamanlilik-seviyesini-secin}

Eşzamanlılık (C), sistemin aynı anda üzerinde çalıştığı istek sayısıdır. Seçici,
TPS ve TTFT sütunlarının hangi ölçümü göstereceğini belirler: C=1 tek bir
isteğin gördüğü en iyi durumdur, daha yüksek değerler sistemi yük altında
gösterir. Seçili seviyede ölçülmemiş satırlar gizlenir; bu yüzden C yükseldikçe
liste kısalır.

### 2. Daraltın ve sıralayın {#daraltin-ve-siralayin}

Filtreler birlikte çalışır ve her sütun sıralanabilir. En öğretici
karşılaştırmalar tek bir ayarı değiştirenlerdir: aynı modelin FP8 ve NVFP4
sürümleri, aynı yapılandırmanın spekülatif kod çözmeli ve çözmesiz hâlleri ya da
aynı donanımda vLLM ile SGLang.

### 3. Hedeflerinizi girin {#hedeflerinizi-girin}

Kabul edilebilir hızı iki hedef tanımlar: en fazla TTFT (varsayılan 1000 ms) ve
istek başına en az TPS (varsayılan 20 tok/s). Ölçülmüş bir seviye ancak
**ikisini birden** karşılıyorsa desteklenmiş sayılır; tam hedef değerindeki bir
ölçüm de geçer.

TTFT, birinin yanıtın başlamasını beklediği yerde — sohbette olduğu gibi — en çok
önem taşır. TPS ise beklemenin bütün yanıta yayıldığı uzun yanıtlarda öne çıkar.
Bir TPS değerinin nasıl hissettirdiğini görmek isterseniz, hedeflerin altındaki
önizleme örnek metni tam o hızda akıtır.

### 4. Maks C ve kapasite sütunlarını okuyun {#maks-c-ve-kapasite-sutunlarini-okuyun}

**Maks C**, iki hedefi birden karşılayan en yüksek ölçülmüş eşzamanlılıktır.
Aynı anda çalışan istekleri sayar.

**Chat Kapasitesi** ve **Agentic Kapasitesi** bunu kişi sayısına çevirir ve
belleğe karşı sınar. Her biri iki tahminden küçük olanını gösterir; değerin
yanındaki simge hangisinin belirlediğini söyler:

- şimşek — hız hedefleri;
- bellek yongası — KV cache belleği;
- uyarı üçgeni — seçilen bağlam uzunluğu, modelin tutabileceğinden uzun.

Tek satırlık gerekçe için değerin üzerine gelin. İki tahmin de aşağıdaki
*Sayılar ne anlama geliyor, nasıl hesaplanıyor?* bölümünde ayrıntısıyla
anlatılıyor.

### 5. Bir satırı açın {#bir-satiri-acin}

Bir satıra tıkladığınızda şunları görürsünüz:

- her seviyede hedeflerinize göre BAŞARILI ya da BAŞARISIZ olarak işaretlenmiş tüm eşzamanlılık taraması;
- ölçülmüş herhangi bir seviyedeki hızın önizlemesi; böylece C=1 ile C=32'yi gözle karşılaştırabilirsiniz;
- istek başına TPS'yi (her kullanıcının gördüğü hız) toplam TPS ile (sistemin
  toplamda ürettiği) karşılaştıran bir grafik — kapasite planlaması bu ikisi
  arasındaki dengedir;
- kısa bir kapasite özeti: her sınırın neye izin verdiği ve KV cache için ne
  kadar bellek kaldığı;
- çalıştırmanın notları: cache hassasiyeti, kernel'lar, bellek ayarları,
  spekülasyon derinliği.

Grafik, rapor ve sunumlarda kullanmak için PNG olarak indirilebilir.

### Nereden başlamalı {#nereden-baslamali}

**"Bu modeli 20 kişinin kullandığı bir agentic iş yükü için çalıştırmak
istiyoruz."** Modeli seçin ve minimum Agentic Kapasitesi'ni 20 yapın. İlk tahmin
için varsayılan hedefleri koruyun ya da uygulamanıza göre ayarlayın. Geriye
kalanlar aday donanım ve sunum yapılandırmalarıdır.

**"Bu model DGX B300'de DGX Spark'a kıyasla nasıl?"** Modeli ve iki cihaz
ailesini seçin, ardından kuantizasyonu, engine'i, spekülatif kod çözmesi ve
paralelliği eşleşen satırları karşılaştırın. Eşzamanlılığı değiştirmek, farkın
yük altında nasıl açıldığını gösterir.

**"Kuantizasyon, spekülatif kod çözme ya da engine gerçekte neyi değiştiriyor?"**
Modeli ve donanımı sabit tutup yalnızca o ayarda farklılaşan satırları
karşılaştırın; böylece etki bir donanım değişikliğiyle karışmaz.

**"Bu donanım elimizde; üzerinde ne çalıştırabiliriz?"** Cihaz filtresiyle
başlayın, kalan modelleri yeteneğe ya da boyuta göre sıralayın ve ihtiyacınız
olan TPS, TTFT veya kapasiteyle daraltın.

**"Sınırlarımızı aşmadan hangi model yeterince yetenekli?"** Zekâ Endeksi,
Agentic Endeksi veya parametre sayısına göre sıralayıp aday modelleri belirleyin,
sonra cihaz ve performans şartlarınızı uygulayın. Böylece en hızlı modelin en
uygun model olduğunu varsaymak yerine model seçimini altyapı
boyutlandırmasından ayrı tutarsınız.

</div>
</details>

<details class="bt-howto">
<summary>Sayılar ne anlama geliyor, nasıl hesaplanıyor?</summary>
<div class="bt-howto-body" markdown="1">

### Sayılar nasıl ölçüldü {#sayilar-nasil-olculdu}

Tablodaki her TPS ve TTFT değeri, açık kaynaklı
[CordatusAI LLM Benchmark Tool](https://github.com/CordatusAI/llm-benchmark) ile
NVIDIA DGX B300, bir ile sekiz node arası DGX Spark, RTX PRO 6000 Blackwell ve
Jetson AGX Thor üzerinde yapılmış bir OpenZeka ölçümüdür.

Her yapılandırma **128 girdi ve 128 çıktı token'ı** ile, farklı konulardaki
istemlerle ve her eşzamanlılık seviyesinde on tur olarak çalıştırılır:
`C = 1, 2, 4, 8, 16, 32, 64`. Tablo on turun **ortalamasını** gösterir.
**Token**, modelin okuyup yazdığı birimdir; kabaca bir İngilizce kelimenin
dörtte üçü kadardır.

### Ölçülen sütunlar {#olculen-sutunlar}

**TPS (saniyedeki token)** — seçili eşzamanlılıkta tek bir isteğin yanıtının
üretilme hızı. İstek başına bir değerdir: C=8'de sekiz isteğin her biri bu hızı
alır. Sistemin toplam çıktısı **toplam TPS = C × TPS**'dir ve satır açıldığında
görünür. Yüksek olması iyidir.

**TTFT (ilk token süresi)** — bir isteğin ilk token'ı gelene kadar beklediği
süre. Kuyrukta geçen süreyi ve prefill'i, yani modelin istemin tamamını okuduğu
geçişi kapsar. Düşük olması iyidir.

### Kurulumu tanımlayan sütunlar {#kurulumu-tanimlayan-sutunlar}

**Parametre** — modeldeki toplam ağırlık sayısı. Uzman karışımı (MoE)
modellerde, her token için etkin olan kısım değil toplam gösterilir, çünkü
tamamının bellekte tutulması gerekir.

**Zekâ Endeksi** ve **Agentic Endeksi** —
[Artificial Analysis](https://artificialanalysis.ai) tarafından yayımlanan
yetenek puanları; yüksek olan iyidir. İlki akıl yürütme, kodlama, bilim ve uzun
bağlam değerlendirmelerini birleştirir; ikincisi araç çağrılı, çok adımlı işleri
ölçer. İkisi de modeli tanımlar; bu yüzden bir modelin her satırı, donanım ne
olursa olsun aynı iki değeri taşır. Birden fazla akıl yürütme seviyesi
puanlanmışsa en yüksek olanı gösterilir; tire, puan yayımlanmadığı anlamına
gelir. Agentic Endeksi modelin ne yapabildiğini ölçer; satırın devamındaki
Agentic Kapasitesi ise donanımın kaç kişiye hizmet edebileceğini tahmin eder.

**Kuantizasyon** — ağırlıkların saklandığı sayı biçimi. Ağırlık başına daha az
bit, daha az bellek ve genellikle daha çok hız demektir; çıktı kalitesinde bir
miktar risk taşır. BF16 ve FP16 tam hassasiyettir; FP8 ve MXFP8 ağırlık başına
8 bit, NVFP4, MXFP4, FP4, INT4 ve AWQ ise 4 bit kullanır.

**Inference engine** — modeli yükleyip istekleri zamanlayan sunucu yazılımı;
örneğin vLLM ya da SGLang. Aynı model aynı donanımda iki engine arasında
ölçülebilir biçimde farklı performans gösterebilir.

**Spekülatif kod çözme** — model birkaç token ilerisini taslak olarak üretir ve
bunları tek geçişte doğrular; kabul edilen token'lar korunur, böylece aynı çıktı
daha erken gelir. Sütun, çalıştırmanın bunu kullanıp kullanmadığını gösterir;
mekanizma ve kaç token ileri gidildiği satırın notlarında yazar.

**TP / DP / PP** — modelin GPU'lara ya da makinelere nasıl bölündüğü. Tensor
paralelliği (TP) her katmanın içindeki işi böler, pipeline paralelliği (PP)
farklı katmanları farklı cihazlara yerleştirir, data paralelliği (DP) ise her
biri kendi isteklerine hizmet eden birkaç tam kopya çalıştırır.

### Maks C {#maks-c}

Maks C, ortalama TTFT'nin ve ortalama TPS'nin hedeflerinizi birlikte
karşıladığı en yüksek **ölçülmüş** eşzamanlılıktır. Yalnızca ölçülmüş seviyeler
sayılır, ara değer türetilmez; hiçbir seviye geçmiyorsa Maks C 0'dır.
Hedeflerinize bağlıdır ve onlarla birlikte değişir: aynı satır 20 tok/s'de
C=16'ya ulaşırken 30 tok/s'de ancak C=8'de kalabilir.

### İsteklerden kişilere: kapasite sütunları {#isteklerden-kisilere}

Maks C aynı anda çalışan istekleri sayar. Kapasite sütunları ise bir
yapılandırmanın kaç **kişiye** hizmet edebileceğini tahmin eder. Bir sistemin
önce hızı da belleği de tükenebilir; bu yüzden her sütun iki sınırın küçüğünü
alır:

**kapasite = min(hız sınırı, KV cache bellek sınırı)**

### Hız sınırı {#hiz-siniri}

**hız sınırı = floor(Maks C × kullanım çarpanı)**

Bir kişinin isteği her an çalışmaz. Bir chat kullanıcısı mesajını gönderir,
yanıtı bekler, sonra bir süre okuyup yazar ve bu arada kapasite kullanmaz.
Kullanım çarpanı, bir istek yuvasını ortalama kaç kişinin paylaştığıdır. Chat
için varsayılan 4, bir chat kullanıcısının isteğinin zamanın yaklaşık dörtte
birinde çalıştığını varsayar. Agentic için varsayılan 1,5 ise bir ajanın
isteğinin zamanın yaklaşık üçte ikisinde çalıştığını varsayar; çünkü ajan plan
yaparken, araç çalıştırırken ve sonuçları kontrol ederken çağrıları art arda
yapar.

Maks C = 8 ise bu, 8 × 4 = 32 chat kullanıcısı ya da 8 × 1,5 = 12 agentic
kullanıcı demektir.

### KV cache bellek sınırı {#kv-cache-bellek-siniri}

Model bir konuşmayı işlerken bir **KV cache** tutar: o ana kadarki her token
için, önceki token'lar yeniden işlenmesin diye her katmanın ihtiyaç duyduğu ara
sonuçlar. Bu cache konuşma uzadıkça büyür.

Hız değerleri 128 tokenlık istemlerden gelir; gerçek bir tur ancak kullanıcının
konuşması hâlâ cache'teyse, yani yalnızca yeni mesajın işlenmesi gerekiyorsa o
kadar hızlıdır. Bu yüzden bellek sınırı, kaç kullanıcının oturumunun tamamının
aynı anda cache'e sığdığını sayar. Bir oturumun uzunluğu, varsayımlarda
ayarlanan **bağlam uzunluğudur** — geçmiş ve yanıtlar dahil tuttuğu bütün
token'lar: chat için varsayılan 32K, oturumları araç çağrılarını ve sonuçlarını
da taşıyan agentic iş için 128K. Bu sayının ötesinde sistem çalışmayı sürdürür,
ama geri dönen bir kullanıcı konuşması yeniden işlenirken bekler.

Hesap cihaz başına yapılır — GPU başına, DGX Spark'ta düğüm başına:

1. **Engine'in belleği** = cihaz belleği × Engine Bellek Tahsisi: ayrık GPU'da
   (DGX B300, RTX PRO 6000) %95, işletim sisteminin de aynı havuzu paylaştığı
   birleşik bellekte (DGX Spark, Jetson Thor) %80.
2. **Ağırlıklar ve cache için yer** = bunun × Ağırlık ve KV Cache Payı (%80).
   Kalan %20, aktivasyonlar ve çalışma zamanı tamponları için çalışma
   belleğidir.
3. **KV cache için boş bellek** = bundan bu cihazdaki ağırlıklar çıkarılır:
   çalıştırmanın yüklediği checkpoint'in boyutu, bölündüğü TP × PP cihaza
   paylaştırılarak.
4. **Bir oturum** = bağlam uzunluğu × modelin token başına cache'i, FP8 olarak
   (değer başına bir bayt) saklanmış hâliyle; modelin varsa oturum başına sabit
   bir kısmı da eklenir (aşağıya bakın); toplam, onu paylaşan cihazlara bölünür.
5. **Kullanıcı** = floor(boş bellek ÷ bir oturum) × DP kopya sayısı.

Token başına cache, modelin yayımlanmış yapılandırmasından gelir. Standart bir
transformer için 2 (bir key ve bir value) × katman × KV başlığı × başlık
boyutudur.

<div class="bt-howto-example" markdown="1">
**Örnek hesap.** 32 katmanlı, boyutu 128 olan 8 KV başlığına sahip ve 32 GB'lık
bir FP8 checkpoint olarak sunulan varsayımsal bir model, 96 GB'lık tek bir GPU
üzerinde:

- engine'in belleği: 96 × %95 = 91,2 GB; ağırlıklar ve cache için yer: 91,2 × %80 = 72,96 GB
- KV cache için boş bellek: 72,96 − 32 = 40,96 GB
- token başına cache: 2 × 32 × 8 × 128 = 65.536 bayt; yani 40,96 GB 625.000 token alır
- chat: 625.000 ÷ 32.768 = 19 oturum; agentic: 625.000 ÷ 131.072 = 4

Maks C = 8 iken hız sınırı 32 chat ve 12 agentic kullanıcıdır; tablo **19** ve
**4** gösterir ve ikisini de bellek belirler. TTFT hedefini Maks C 4'e düşene
kadar sıkılaştırırsanız hız sınırı 16 ve 6 olur: chat'i artık hız (16),
agentic'i hâlâ bellek (4) belirler.
</div>

### Farklı model tasarımları nasıl ele alınıyor {#farkli-model-tasarimlari}

Modeller her token için tuttukları şeyde farklılaşır; bu yüzden her satır kendi
modelinin değerlerini kullanır. Örneğin:

- **Kayan pencere (sliding window) katmanları** yalnızca en son token'larını —
  örneğin son 128 ya da 1.024 tanesini — tutar; bu yüzden oturumla birlikte
  büyümek yerine oturum başına sabit bir yer kaplar.
- **Doğrusal dikkat (linear attention) ve Mamba katmanları** token başına cache
  yerine sabit boyutlu bir durum tutar; bu durum her oturum için bir kez sayılır.
- **Sıkıştırılmış cache'ler**, örneğin DeepSeek, Kimi ve GLM-5'teki MLA, token
  başına çok daha az yer kaplar; ama her GPU tam bir kopyasını tutar, bu yüzden
  GPU eklemek onları bölmez.
- **Standart bir cache** GPU'lara KV başlıkları üzerinden bölünür; başlıktan
  fazla GPU varsa başlıklar daha fazla bölünmez, kopyalanır.

Bazı satırlar yalnızca hız sınırını gösterir ve açılan satır nedenini söyler: ya
yüklenen checkpoint tek başına kullanılabilir varsayılan bellekten büyüktür —
çalıştırma engine'e standart tahsisten fazla bellek vermiş ya da modelin veya
cache'in bir kısmını CPU belleğinde veya diskte tutmuştur — ya da model cache'ini
bu tahminin modellemediği bir biçimde saklar. Bir modelin kendi **bağlam
penceresinden**, yani tutabileceği en fazla token'dan uzun bir bağlam uzunluğu
seçerseniz, model bu uzunlukta oturumlara hiç hizmet veremez: kapasitesi uyarı
üçgenli bir tire olarak görünür.

### Daha uzun istemlerde sonuçları okumak {#daha-uzun-istemler}

TTFT hedefi doğrudan 128 tokenlık istemler için geçerlidir. Daha uzun
istemlerde TTFT, prefill işi istemle birlikte büyüdüğü için istemin uzunluğuyla
kabaca orantılı artar. TPS daha yavaş düşer: her token'ı üretmenin ana maliyeti
olan ağırlık-matrisi çarpımları istemin uzunluğuna bağlı değildir; yine de
attention ve cache okumaları bağlamla birlikte büyür.

### Sayıların söylemedikleri {#sayilarin-soylemedikleri}

Tablo, yapılandırmalar önce bir trafik modeli kurmadan karşılaştırılabilsin diye
tek bir sabit iş yükü, ortalama değerler, basit kullanım çarpanları ve standart
bir bellek hesabı kullanır. **Üretim ortamındaki bir yük testinin yerini
tutmaz**: kuyruk gecikmesi (tail latency), değişken istem ve çıktı uzunlukları,
isteklerin geliş düzeni, ajan çağrı zincirleri ve önek paylaşımı gerçek
kapasiteyi değiştirir.

Bellek sınırı engine'den okunmaz, hesaplanır. Engine'e özgü saklama
ayrıntıları — blok yuvarlama, ölçek katsayıları, ayrı cache havuzları, data
paralel cihazlara dağıtılan uzmanlar — onu iki yönde de oynatabilir. 32K ya da
128K token tutan bir oturum da bu 128 tokenlık ölçümlerden daha uzun bir TTFT ve
biraz daha düşük bir TPS görür. Kapasite, arkasında tam bir eşzamanlılık
taraması olduğunda en anlamlıdır; yalnızca C=1'de ölçülmüş bir satır tek bir
veri noktasına dayanır.

Planlanan iyileştirmeler arasında iş yükü filtreleri, daha uzun bağlamlarda
ölçülen hız ve ölçülen gecikmeye, kullanıcı düşünme süresine ve Little Yasası'na
dayanan kapasite tahminleri var.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">

<div data-bt-src="/assets/data/benchmarks.json"
     data-bt-logo="/assets/images/benchmark-logo.png"></div>

<p class="bt-attribution">Zekâ Endeksi ve Agentic Endeksi değerleri
<a href="https://artificialanalysis.ai" rel="noopener">Artificial Analysis</a>
tarafından yayımlanmıştır ve kaynak belirtilerek burada aktarılmıştır. Diğer
tüm sütunlar OpenZeka&rsquo;nın kendi ölçümleridir.</p>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/benchmark-table.tr.js"></script>
