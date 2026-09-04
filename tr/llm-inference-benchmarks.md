---
title: LLM Çıkarım Benchmark Gezgini
nav_order: 4
lang: tr
page_id: llm-inference-benchmarks
card_order: 10
card_tag: "LLM Benchmark"
card_date: "Ağustos 2026"
description: >-
  OpenZeka'nın NVIDIA DGX Spark, DGX B300, RTX PRO 6000 Blackwell ve Jetson Thor
  üzerindeki LLM çıkarım benchmark'larını keşfedin. Modele, parametre sayısına,
  cihaza, kuantizasyona ve eşzamanlılığa göre filtreleyin, kendi performans
  hedeflerinizi girin.
permalink: /llm-inference-benchmarks/
last_modified_date: 2026-09-02
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

Bir satır bir modeli değil, **eksiksiz bir kurulum yapılandırmasını** anlatır.
Donanım, kuantizasyon biçimi, inference engine, TP/DP/PP topolojisi ve MTP
ayarı test edilenin parçasıdır; bu yüzden aynı model, bu sütunlarda farklı
değerlerle birkaç kez görünür. İki satırı karşılaştırmak, ancak aralarında hangi
sütunların farklı olduğunu bildiğinizde anlam taşır.

### Sayılar nasıl ölçüldü {#sayilar-nasil-olculdu}

Tablodaki her TPS ve TTFT değeri OpenZeka ölçümüdür; açık kaynaklı
[CordatusAI LLM Benchmark
Tool](https://github.com/CordatusAI/llm-benchmark) ile NVIDIA DGX B300, bir ile
sekiz node arası DGX Spark, RTX PRO 6000 Blackwell ve Jetson AGX Thor
üzerinde üretilmiştir. Yeni modeller, donanımlar, inference engine'ler,
kuantizasyon biçimleri, paralellik stratejileri ve MTP yapılandırmaları test
edildikçe havuz büyümeye devam ediyor.

Her yapılandırma **128 girdi ve 128 çıktı token'ı** ile, her eşzamanlılık
seviyesinde farklı konuları kapsayan istemlerle on tur çalıştırılır. Tarama
`C = 1, 2, 4, 8, 16, 32, 64` şeklindedir ve tablo her seviyedeki **ortalama**
TPS ve TTFT değerini gösterir.

**TPS sütunu istek başınadır, toplam üretim değildir.** Seçtiğiniz
eşzamanlılıkta tek bir aktif isteğin gördüğü hızdır. Toplam çıktı ayrı bir
eğridir ve satırı açtığınızda görünür.

<div class="bt-howto-example" markdown="1">
**Bu değerleri başka istem uzunluklarında okumak.** Ölçümler 128 token'lık bir
girdiyle yapılmıştır; TTFT sınırı da doğrudan bu uzunluk için geçerlidir. Yine
de daha uzun prefill'ler için makul bir temel verir: benzer koşullarda TTFT'nin
girdi uzunluğuyla kabaca oranlı biçimde artması beklenir, çünkü prefill işi
istemle birlikte büyür. TPS bu değişime daha az duyarlıdır ve genellikle yalnızca
bir miktar düşer; zira autoregressive kod çözmenin baskın ağırlık-matrisi
çarpımları üretilen her token için bir kez yapılır ve istem uzunluğuyla
ölçeklenmez — buna karşılık attention ve KV-cache maliyetleri bağlam uzadıkça
artar. Gösterilen TPS'yi 128 token'lık girdiyle ölçülmüş bir değer olarak okuyun.
</div>

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

**Zekâ Endeksi** ve **Agentic Endeksi** —
[Artificial Analysis](https://artificialanalysis.ai) tarafından yayımlanan iki
yetenek puanı; her ikisinde de yüksek olan iyidir. İlki akıl yürütme, kodlama,
bilim ve uzun bağlam çalışmasını kapsayan değerlendirmelerin bileşimidir;
ikincisi agentic çalışma için ayrı bir ölçüdür — çok adımlı görevler, araç
çağrıları, gözetim olmadan yolda kalmak. Bir model birinde iyi, diğerinde kötü
sıralanabilir.

İkisi de **modeli** tanımlar; bu yüzden aynı modelin her satırı, donanım veya
kuantizasyon ne olursa olsun aynı iki sayıyı taşır. Hiçbiri hız, eşzamanlılık ya
da donanım kapasitesi hakkında bir şey söylemez. Artificial Analysis bir modelin
birden çok akıl yürütme seviyesini puanladığında, en yüksek puanlı olan
gösterilir. Tire, puan yayımlanmadığı anlamına gelir — Artificial Analysis bunu
izlediği modellerin azınlığı için doldurduğundan, Agentic sütununda sık görülür.

**Agentic Endeksi ile Agentic Kapasitesi aynı şeyin iki ölçeği değildir.**
Endeks modelin ne yapabildiğini ölçer. Kapasite sütunu ise belirli bir donanım
ve sunum yapılandırmasının, sizin girdiğiniz hedefler ve yoğunluk varsayımı
altında kaç kişiyi taşıyabileceğini tahmin eder.

**Kuantizasyon** — ağırlıkların saklandığı sayı biçimi. Ağırlık başına daha az
bit, daha az bellek ve genellikle daha çok hız demektir; kalitede bir miktar
risk taşır. BF16 tam hassasiyet referansıdır; FP8, NVFP4, MXFP4, FP4 ve INT4
giderek daha sıkıştırılmıştır. MXFP8 alternatif bir 8 bit biçimi, AWQ yalnızca
ağırlıkları 4 bite indiren bir yöntem, FP16 ise ikinci bir tam hassasiyet
referansıdır.

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

**Eşzamanlılık aktif istek sayar, kapasite kişi sayar.** C=8, o anda sekiz
isteğin işlendiği anlamına gelir. Sekiz kişi genellikle sekizden az eşzamanlı
istek üretir, çünkü hepsi aynı anda modeli beklemiyordur. İkisi farklı
birimlerdir; kapasite sütunları da tam bu çevrimi yapmak için vardır.

### 1. Eşzamanlılık seviyesini seçin {#eszamanlilik-seviyesini-secin}

Seçtiğiniz C değeri, TPS ve TTFT sütunlarının hangi ölçüm noktasını
göstereceğini belirler. C=1 tek bir isteğin gördüğü en iyi durumdur. Yüksek C
değerleri sistem yük altındayken ne olduğunu gösterir.

Bir satır yalnızca o seviyede ölçülmüşse görünür; bu yüzden C yükseldikçe
listedeki satır sayısı azalır.

### 2. Yapılandırmaları daraltın {#yapilandirmalari-daraltin}

Model, parametre sayısı, cihaz, kuantizasyon ve MTP filtreleri birlikte
çalışır; ayrıca her veri sütunu sıralanabilir — tabloya model yeteneği, model
boyutu, donanım, hız, gecikme, paralellik veya tahmini kapasite üzerinden
girebilirsiniz. En öğretici karşılaştırmalar tek değişkeni değiştirdiğinizde
çıkar: aynı modelin FP8 ve NVFP4 sürümleri, ya da aynı yapılandırmanın MTP'li ve
MTP'siz hâlleri.

### 3. Hedeflerinizi girin {#hedeflerinizi-girin}

Neyin kabul edilebilir olduğuna iki değer karar verir. Varsayılanlarda bir
eşzamanlılık seviyesi, **ikisi birden** sağlandığında desteklenmiş sayılır:

- ortalama TTFT ≤ `1000 ms`
- ortalama TPS ≥ `20 tok/s`

**İki sınır da dahildir** — tam 1000 ms ya da tam 20 tok/s hâlâ geçer.
Varsayılanlar bir öneri değil, pratik bir başlangıç noktasıdır; ilk
karşılaştırma için oldukları gibi bırakabilir ya da kendi iş yükünüze göre
değiştirebilirsiniz.

Hedeflerden birini değiştirmek her yapılandırmayı anında yeniden değerlendirir.
Gösterilen TPS ve TTFT değerlerinin hedefi karşılayıp karşılamadığı, açılmış
taramadaki her noktanın PASS/FAIL sonucu, Maks C ve iki kapasite sütunu birlikte
güncellenir. Bir kapasite filtresi etkinse, yeniden hesaplanan kapasiteler
sınırınızın altına inip üstüne çıktıkça satırlar da görünür ya da kaybolur.

İki metrik farklı şeyleri korur. Sohbet arayüzünde önce TTFT gelir — geç
başlayan hızlı bir yanıt yine de bozuk hissettirir. Uzun metin üreten işlerde
ise TPS belirleyicidir, çünkü bekleme yanıtın tamamına yayılır. Bir TPS
değerinin nasıl hissedildiğinden emin değilseniz **Performans Hedefleri ve
Kapasite Varsayımları** bölümündeki önizleme örnek metni tam o hızda akıtır.

### 4. Maks C ve kapasite sütunlarını okuyun {#maks-c-ve-kapasite-sutunlarini-okuyun}

**Maks C**, yapılandırmanın iki hedefi birden karşıladığı en yüksek *ölçülmüş*
eşzamanlılıktır. Yalnızca ölçülmüş noktalardan alınır; hiçbir ölçülmüş nokta
ikisini birden sağlamıyorsa Maks C 0 olur.

Hedefleri siz girdiğiniz için Maks C bir yapılandırmanın sabit özelliği
değildir. Aynı satır 15 tok/s isteğinde Maks C 16'ya çıkarken, 25 tok/s'de Maks
C 8'e inebilir.

Maks C ile seçtiğiniz eşzamanlılık farklı soruları yanıtlar. Seçtiğiniz C hangi
ölçümün ekranda olduğunu belirler. Maks C ise taramanın tamamına bakıp
hedeflerinizi geçen en yüksek seviyeyi bildirir.

Kapasite sütunları Maks C'yi kişi sayısına çevirir:

- Chat Kapasitesi = `floor(Maks C × Chat Kullanım Çarpanı)`
- Agentic Kapasitesi = `floor(Maks C × Agentic Kullanım Çarpanı)`

Çarpanlar **her kullanım türünün ne kadar yoğun olduğunu** temsil eder. Chat
varsayılanı daha yüksektir (4), çünkü etkileşimli kullanıcılar zamanlarının
büyük bölümünü yanıtı okuyarak, düşünerek ve sonraki istemi yazarak geçirir ve
bu sürede bir istek yuvası tutmazlar — böylece birkaç kullanıcı aynı yuvayı
paylaşır. Agentic çalışma daha yoğundur: bir ajan planlarken, araç çağırırken ve
sonuçları değerlendirirken art arda çağrı yapabilir ve yuvayı çok daha uzun süre
meşgul eder; varsayılanı bu yüzden düşüktür (1,5). Neredeyse kesintisiz çalışan
ajanlar için agentic çarpanını düşürün; aralıklı kullanım için yükseltin.

<div class="bt-howto-example" markdown="1">
**Örnek.** Hedefleriniz 1000 ms TTFT ve 20 tok/s olsun. Bir yapılandırma C=8'e
kadar bu ikisini karşılıyor, C=16'da TPS 20'nin altına düşüyorsa Maks C 8 olur.
Varsayılan çarpanlarla bu satır 32 chat kullanıcısı ya da 12 agentic kullanıcı
gösterir. TTFT hedefini 500 ms'ye çekerseniz aynı satır C=4'te kalabilir ve
kapasite yarıya iner.
</div>

**Bu kapasite değerleri, ölçülmüş bir Maks C'den türetilmiş tahminlerdir.**
Sisteme 32 chat kullanıcısı ya da 12 agentic kullanıcı bağlanarak elde
edilmemiştir.

### 5. Satırı açıp ayrıntıya inin {#satiri-acip-ayrintiya-inin}

Satırın tamamı tıklanabilir. Açtığınızda eşzamanlılık taramasının tamamını
görürsünüz; durum ve hücre renkleri her seviyede hedeflerinizin karşılanıp
karşılanmadığını işaretler — tek bir başlık değerinin sakladığı davranış budur.
Ölçülmüş herhangi bir seviyeyi seçtiğinizde orada gerçekten kaydedilmiş hız
oynatılır; böylece C=1, C=8 ve C=32 sayıyla olduğu kadar kulakla da
karşılaştırılabilir.

Grafik iki eğri taşır:

- **İstek başına TPS** — her aktif isteğin gördüğü hız; eşzamanlılık arttıkça
  genellikle düşer.
- **Toplam TPS** — eşzamanlılık × istek başına TPS; genellikle yükselmeye devam
  eder.

Görülmesi gereken ödünleşme budur: bireysel yanıt hızı düşerken makinenin
bütünü daha fazla üretir. Kapasite planlaması bu iki eğrinin arasında yaşar.
Yapılandırma notları grafiğin altındadır — KV-cache hassasiyeti, kernel seçimi,
GPU bellek kullanımı, MTP derinliği — ve grafik, rapor ve sunumlar için PNG
olarak indirilebilir.

### Nereden başlamalı {#nereden-baslamali}

**"Bu modeli 20 kişinin kullandığı bir agentic iş yükü için çalıştırmak
istiyoruz."** Modeli seçin ve minimum Agentic Kapasitesi'ni 20 yapın. İlk tahmin
için hedefleri ve agentic çarpanını varsayılanda bırakın ya da uygulamanıza göre
ayarlayın. Geriye kalanlar aday donanım ve sunum yapılandırmalarıdır.

**"Bu model DGX B300'de DGX Spark'a kıyasla nasıl?"** Modeli ve iki cihaz
ailesini seçin, ardından kuantizasyon, engine, MTP ve paralelliği eşleşen
satırları karşılaştırın. Seçtiğiniz eşzamanlılığı değiştirmek, farkın yük
altında nasıl geliştiğini gösterir.

**"Kuantizasyon, MTP ya da engine gerçekte neyi değiştiriyor?"** Modeli ve
donanımı sabit tutup ilgili satırları karşılaştırın — FP8'e karşı NVFP4, MTP
açık-kapalı, vLLM'e karşı SGLang — böylece etki bir donanım değişikliğiyle
karışmaz.

**"Bu donanım elimizde; üzerinde ne çalıştırabiliriz?"** Cihaz filtresiyle
başlayın, kalan modelleri yetenek ya da parametre sayısına göre sıralayın ve
ihtiyacınız olan TPS, TTFT veya kapasite şartlarıyla daraltın.

**"Sınırlarımızı aşmadan hangi model yeterince yetenekli?"** Zekâ Endeksi,
Agentic Endeksi veya parametre sayısına göre sıralayıp aday modelleri belirleyin,
sonra cihaz ve performans şartlarını uygulayın. Bu, en hızlı modelin
kendiliğinden en uygun model olduğunu varsaymak yerine model seçimini altyapı
boyutlandırmasından ayrı tutar.

### Bu tablo neyi söylemez {#bu-tablo-neyi-soylemez}

Tablo bilinçli olarak tek bir karşılaştırılabilir sabit iş yükü, ortalama
değerler ve basit kapasite çarpanları kullanır; amaç, önce eksiksiz bir üretim
trafiği modeli tanımlamak zorunda kalmadan ilk karşılaştırmayı yapabilmenizdir.
**Üretim yük testinin yerine geçmez.** Kuyruk gecikmesi (tail latency), değişken
istem ve çıktı uzunlukları, istek varış desenleri, ajan çağrı zincirleri, toplu
işleme, önek yeniden kullanımı, bağlam uzunluğu ve KV-cache baskısı kullanılabilir
kapasiteyi değiştirebilir.

Kapasite tahminleri, tek başına bir C=1 sonucu yerine arkasında anlamlı bir
eşzamanlılık taraması bulunan yapılandırmalarda daha bilgilendiricidir.

Planlanan iyileştirmeler arasında iş yükü ve bağlam uzunluğu filtreleri,
KV-cache farkındalıklı eşzamanlılık sınırları ve ölçülmüş servis gecikmesi,
kullanıcı düşünme süresi ile Little Yasası'nı kullanan zamanlama temelli
kapasite modları var.

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
