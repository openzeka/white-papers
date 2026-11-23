---
title: DGX Spark'lar Üzerinde Tensör Paralel Çıkarım İçin Ağ Bağlantı Hızı (200G ve 100G)
parent: White Papers
nav_order: 12
lang: tr
page_id: dgx-spark-link-speed-tensor-parallel
date: 2026-10-15
card_tag: "Teknik Rehber"
description: >-
  Tensör paralel bir DGX Spark cluster'ının ağ bant genişliğini gerçekte ne kadar kullandığı ve
  her DGX Spark'ı 200G yerine 100G ile çalıştırmanın neye mal olduğu: mekanizma, modelin
  mimarisinden yapılan tahmin ve GLM-5.3 ile TP8'de, GLM-5.3-Flash ile de gerçek 100G
  bağlantılarda TP4'te yapılan ölçümler.
permalink: /papers/dgx-spark-link-speed-tensor-parallel/
last_modified_date: 2026-11-23
toc: true
---

> **Yayın tarihi:** Ekim 2026
> **Kapsam:** Tensör paralel (TP) çıkarımın DGX Spark sistemleri arasındaki ağı nasıl kullandığı, bağlantı hızını yarıya indirmenin etkisinin modelin mimarisinden ve çıkarım motorunun ayarlarından nasıl tahmin edileceği, GLM-5.3 ile TP8'de 8× DGX Spark üzerinde 200 Gb/s ile emüle edilmiş 100 Gb/s bağlantıların ve GLM-5.3-Flash ile TP4'te 4× DGX Spark üzerinde 200 Gb/s ile gerçek 100 Gb/s bağlantıların ölçülerek karşılaştırılması.
> **Not:** Ölçümler, Bölüm 7 ve 12'de listelenen modeller, çıkarım motorları, sürümler ve ayarlar için geçerlidir. Bölüm 3–6'daki tahmin yöntemi başka model ve ayarlara da uygulanabilir; ölçülen sayılar ise uygulanamaz.

{% include company/block.html name="prepared_by" %}

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## Yönetici Özeti

- **Soru:** bir modeli birden fazla sistem üzerinde tensör paralelliğiyle sunan bir DGX Spark cluster'ı hızlı switch portlarına ihtiyaç duyar. Spark başına 200 Gb/s'de bir MikroTik CRS812 4 ila 6 Spark bağlar; 100 Gb/s'de 8 Spark bağlar. Bir CRS804, 200 Gb/s'de 8 Spark'ı, 100 Gb/s'de 16 Spark'ı bağlar. Bu çalışma, Spark başına 100 Gb/s'nin çıkarım hızına neye mal olduğunu soruyor.
- **Tensör paralelliğinin ağı kullanma biçimi:** her Spark her ağırlık matrisinin sekizde birini tutar, bu yüzden her biri her sonucun yalnızca bir kısmını hesaplar. Spark'lar her katmanda iki kez, kısmi sonuçlarını ağ üzerinden *all-reduce* adı verilen bir işlemle toplar; iletişim kütüphanesi NCCL, burada önem taşıyan büyük aktarımlarda bu işlemi bir *halka* (ring) olarak çalıştırır. Prompt işlenirken (*prefill*) her all-reduce'ta toplanan veri büyüktür; cevap üretilirken (*decode*) küçüktür.
- **Tahmin:** prefill aktarımları tam bağlantı hızında çalışacak kadar büyüktür; bu yüzden bağlantıyı yarıya indirmek bu aktarımları uzatır ve ilk token'ı geciktirir. GLM-5.3 ile TP8 için modelin mimarisinden yapılan tahmin, 100 Gb/s'de **1,000 prompt token'ı başına ilk token süresine (TTFT) en fazla 0.135 s ek süre** öngörür. Decode aktarımları ise bağlantı hızının önem taşıyamayacağı kadar küçüktür.
- **Cluster 200 Gb/s'nin tamamını kullanıyor mu? Hem evet hem hayır.** Milisaniye çözünürlüğünde ölçüldüğünde prefill trafiği, birkaç milisaniyelik patlamalar halinde 150–200 Gb/s'ye ulaşır. Aynı trafiğin bir saniyelik ortalaması yaklaşık 40 Gb/s'dir; decode ise birkaç Gb/s düzeyinde kalır.
- GLM-5.3 ile TP8'de, 200 Gb/s ile emüle edilmiş 100 Gb/s bağlantı (en fazla 109 Gb/s taşır) karşılaştırılarak **ölçülen sonuçlar:**
  - **decode hızı değişmiyor** (−%2.3 ile +%4.3 arası, test turları arasındaki değişkenlik içinde);
  - 8K–64K token'lık tekil prompt'larda **TTFT %12.6–13.9 artıyor**, yani **1,000 prompt token'ı başına yaklaşık 0.11 s**; bu, tahmine yakın;
  - **dört uzun prompt aynı anda geldiğinde**, her isteğin TTFT'si **%17.9–22.5** artıyor;
  - **kısa prompt'lar etkilenmiyor** (1K token'da +%1).
- **100 Gb/s'yi kablo almadan önce denemek:** NCCL'i her Spark'ın iki ağ arayüzünden birine sınırlamak, mevcut 200 Gb/s kablolama üzerinde 100 Gb/s'lik bir bağlantıyı emüle eder. Bu şekilde çalıştırılan bir iş yükü, sonucu gerçek bir bağlantıya dönüştürüldüğünde, 100 Gb/s'nin o iş yüküne neye mal olacağını donanımda herhangi bir değişiklik yapılmadan gösterir.
- **Gerçek bir 100 Gb/s bağlantı**, 4 × 100G breakout kablosuyla kurulduğunda yaklaşık 98 Gb/s taşır ve buna en fazla 3–4 puan daha ekler.
- **Gerçek 100 Gb/s bağlantılarda** 4 Spark üzerinde GLM-5.3-Flash ile TP4'te ölçüldüğünde, 8K token'lık bir prompt'un ilk token'ı en fazla 0.38 s'lik tahmine karşı 0.39 s daha geç geldi ve decode hızı değişmedi. Spark'ları 100 Gb/s'ye geçirmek Spark'ların kendisinde hiçbir değişiklik gerektirmez, ancak yeniden kablolamadan sonra Spark'ların yeniden başlatılması gerekir.
- **Değerlendirme:** 100 Gb/s, TP8'e kadar tensör paralel DGX Spark cluster'ları için makuldür. 8 Spark'lık bir TP8 cluster'ı 200 Gb/s'den 100 Gb/s bağlantılara geçirildiğinde, ilk token'ın **çok uzun bir prompt'ta en fazla yaklaşık %20**, **birkaç çok uzun prompt aynı anda geldiğinde ise en fazla yaklaşık %30 daha geç** gelmesi beklenmelidir. Dört Spark'ta TP4'te, gerçek bağlantılarda ölçülen kayıp aynı tahmini izledi. Kısa ve orta uzunluktaki prompt'larda değişiklik olmaz ve cevap bir kez başladığında **aynı hızda akar**. 16 Spark'ta tek bir TP16 cluster yerine iki TP8 cluster çalıştırın: kayıp, TP boyutuyla birlikte büyür.

---

## 1. Giriş

Tek bir DGX Spark 128 GB birleşik bellek (unified memory) barındırır. Bundan büyük modeller, ConnectX-7 ağ adaptörleri ve bir switch üzerinden birbirine bağlanan birkaç Spark'a bölünerek sunulur. **Tensör paralelliği (tensor parallelism)** ile modelin her katmanı tüm Spark'lara bölünür; bu yüzden Spark'lar modelin işlediği her token için defalarca veri alışverişi yapar ve çıkarımın (inference) her adımı ağı bekler.

Bu da switch'i bir tasarım kararı haline getirir. Her Spark'ı 200 Gb/s yerine 100 Gb/s ile çalıştırmak, aynı cluster'a daha küçük bir switch'in hizmet etmesini ya da aynı switch'in iki katı Spark'a hizmet etmesini sağlar. Bunun kabul edilebilir olup olmadığı, Spark'lar arasındaki bağlantı yarı hızda olduğunda tensör paralel çıkarımın ne kadar yavaşladığına bağlıdır.

Bu çalışmanın I. Kısmı (Bölüm 2–6), tensör paralelliğinin ağ üzerinden ne gönderdiğini, prompt işlemenin ve cevap üretiminin ağı neden çok farklı yüklediğini ve bağlantı hızını yarıya indirmenin etkisinin yalnızca modelin mimarisi, çıkarım motorunun ayarları ve bağlantı hızından nasıl tahmin edileceğini anlatır. II. Kısım (Bölüm 7–10), bir iş yükünün herhangi bir kablo alınmadan önce 100 Gb/s'de denenebilmesi için mevcut 200 Gb/s kablolama üzerinde 100 Gb/s'lik bir bağlantının nasıl emüle edileceğini gösterir; emülasyonu GLM-5.3'ü TP8'de sunan 8× DGX Spark'a uygular, sonuçları tahminle kıyaslar ve gerçek bir 100 Gb/s kabloya dönüştürür. III. Kısım (Bölüm 11–13), emüle edilmiş sonuç kabul edilebilir olduğunda atılacak bir sonraki adımdır: 4 Spark için gerçek 100 Gb/s bağlantılar kurar ve GLM-5.3-Flash'ı bunlar üzerinde TP4'te ölçer. Bölüm 14, 4, 8 ve 16 Spark'lık cluster'lar için boyutlandırma cevabını verir.

---

# I. Kısım: Teori

## 2. DGX Spark Ağı

### 2.1. ConnectX-7 adaptörü ve iki PCIe bağlantısı

Her DGX Spark'ta iki QSFP portlu bir ConnectX-7 ağ adaptörü bulunur. Bu çalışmadaki cluster'lar Spark başına bir port kullanır; port, switch'e 200 Gb/s nominal bağlantı hızıyla kablolanmıştır.

Adaptör GB10 yongasına PCIe Gen5 üzerinden, her biri dört hatlı (×4) iki ayrı bağlantıyla bağlanır. Tek bir ×4 bağlantı 100 Gb/s'nin biraz üzerinde veri taşır (Bölüm 7.3); bu, 200 Gb/s'lik bir portu tek başına doldurmaya yetmez, iki bağlantı birlikte yeter. Linux adaptörü her PCIe bağlantısı için bir kez görür; bu yüzden tek fiziksel port iki kez görünür: her biri kendi RDMA cihazına sahip iki ağ arayüzü olarak (`enp1s0f1np1` ve `enP2p1s0f1np1`). İki arayüz de aynı porta ait olduğu için ikisi de 200 Gb/s bağlantı hızı bildirir, ancak her biri yalnızca kendi PCIe bağlantısının taşıyabildiği kadarını aktarabilir.

Çıkarım motorunun Spark'lar arası iletişim için kullandığı kütüphane olan NCCL, iki RDMA cihazını iki ayrı ağ yolu olarak ele alır ve trafiğini ikisine dağıtır; portun 200 Gb/s'sine ancak ikisi birlikte ulaşır. Aynı düzen, 100 Gb/s'yi donanıma dokunmadan denemeyi mümkün kılar: NCCL'i iki arayüzden yalnızca birine sınırlamak, her Spark'ı tek bir PCIe bağlantısının taşıyabildiğiyle, yani bir 100 Gb/s bağlantının taşıdığına yakın bir miktarla sınırlar (Bölüm 7.3).

Spark'lar arasındaki trafik RDMA (remote direct memory access, uzak doğrudan bellek erişimi) kullanır: adaptör veriyi gönderen uygulamanın belleğinden okur ve doğrudan alıcı uygulamanın belleğine yazar; veri işletim sisteminin ağ yığınından geçmez. Bu, her aktarımın gecikmesini düşük tutar. Olağan Linux ağ istatistiklerinin bu trafiği göstermemesinin nedeni de budur (Ek A). Burada RDMA, RDMA paketlerini UDP/IP içinde taşıyan RoCE v2 (RDMA over Converged Ethernet, sürüm 2) ile sıradan Ethernet üzerinde çalışır.

### 2.2. Bağlantı, sistemdeki en yavaş yoldur

200 Gb/s, 25 GB/s eder. Bir DGX Spark kendi belleğini 273 GB/s ile, yani yaklaşık 11 kat daha hızlı okur. Spark'lar arasında ağı geçmesi gereken her şey, bir Spark'ın kendi belleğinden okuduğu her şeyden çok daha yavaş taşınır; bağlantı hızının ne kadar önemli olduğunu, tensör paralelliğinin ağ üzerinden ne kadar veri gönderdiği ve bunun zamanlaması belirler.

### 2.3. Switch'ler ve breakout seçenekleri

CRS804 ve CRS812, 400 Gb/s QSFP-DD portlara sahiptir. Bir breakout kablosu bu portların her birini, her Spark için bir tane olmak üzere birkaç daha yavaş bağlantıya böler:

| Switch | 400G QSFP-DD port | 200 Gb/s'de Spark (port başına 2 × 200G) | 100 Gb/s'de Spark (port başına 4 × 100G) |
|---|---|---|---|
| MikroTik CRS812 | 2 (artı 2 × 200G QSFP56) | 4 (QSFP56 portlarla 6) | **8** |
| MikroTik CRS804 | 4 | **8** | **16** |

Spark başına 100 Gb/s'de 8 Spark'lık bir cluster bir CRS812'ye sığar ve bir CRS804 16 Spark'a hizmet edebilir.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/network-topology.png' | relative_url }}" alt="100 Gb/s'de 8 Spark'lı CRS812, 200 Gb/s'de 8 Spark'lı ve 100 Gb/s'de 16 Spark'lı CRS804" width="820"/></p>
<sub><i>Şekil 1: Breakout seçenekleri, her DGX Spark için bir bağlantı.</i></sub>

---

## 3. Tensör Paralelliğinin Ağı Kullanma Biçimi

### 3.1. Modeli bölmek

8 Spark'lı tensör paralelliğinde (TP8), modelin her büyük ağırlık matrisi 8 dilime kesilir ve her Spark bir dilim tutar. Attention bloklarında attention başlıkları Spark'lar arasında paylaştırılır. İleri beslemeli (feed-forward) ve Uzmanların Karışımı (Mixture-of-Experts, MoE) bloklarında her uzmanın matrisleri de dilimlenir; böylece her Spark her uzmanın bir kısmını tutar. Her Spark kendi belleğinden ağırlıkların yalnızca kendi sekizde birini okur; bir Spark'tan büyük bir modelin sığmasını ve her Spark'ın her şeyi okuması gereken duruma göre daha hızlı çalışmasını sağlayan budur.

### 3.2. Kısmi sonuçlar ve all-reduce

Bir ağırlık matrisini bu şekilde bölmek, hiçbir Spark'ın bir çarpımı tek başına tamamlayamayacağı anlamına gelir. Bir katmanın her çıktı değeri, ağırlıklar ile girdilerin çarpımlarından oluşan uzun bir toplamdır; ağırlıklar sekize bölündüğünde her Spark bu toplamın sekizde birini hesaplar. Söz konusu değerler modelin *aktivasyonlarıdır*: her token'ı katmanlardan geçerken temsil eden vektörler. GLM-5.3 her token'ı 6,144 değerlik bir vektörle temsil eder (*gizli boyutu*). Bir seferde 4,096 token işlenen bir prompt için her Spark sonunda 4,096 × 6,144 kısmi değer tutar; bu, değer başına 2 bayt ile 50.3 MB eder. Asıl sonuç sekiz Spark'ın bloklarının toplamıdır ve model devam edebilmeden önce her Spark'ın bu toplamın tamamına ihtiyacı vardır.

Bunu üretmek bir **all-reduce**'un işidir: bloklar birleştirildiği (burada toplandığı) için *reduce*, her katılımcı sonucu aldığı için *all*. Bir transformer katmanı iki tane gerektirir: biri attention bloğundan, biri ileri beslemeli ya da MoE bloğundan sonra; girdi embedding'inde de bir tane daha gerekir. Her Spark her all-reduce'ta sekizinin de katkısını verene kadar bekler; bu yüzden ağ, her katmanın yolu üzerindedir.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp-layer-allreduce.png' | relative_url }}" alt="TP8 altında iki all-reduce'u ile bir transformer katmanı ve 8 Spark'lık halka" width="820"/></p>
<sub><i>Şekil 2: Tensör paralelliği altında bir transformer katmanı ve 8 Spark arasındaki halka all-reduce.</i></sub>

### 3.3. Halka all-reduce nasıl çalışır

Doğrudan yaklaşım, yani her Spark'ın tüm bloğunu diğer yedisine göndermesi, her Spark'a 7 × 50.3 MB gönderme yükü bindirir ve eklenen her Spark'la yük büyür. Bu büyüklükteki aktarımlar için NCCL bunun yerine bir **halka** (ring) kullanır (Bölüm 3.4). Spark'lar bir çember şeklinde dizilir, her biri yalnızca bir sonrakine gönderir ve her blok Spark sayısı kadar segmente kesilir. İş ardından iki aşamada ilerler; Şekil 3'te dört Spark için gösterilmiştir.

İlk aşama olan *reduce-scatter*'da her Spark her halka adımında bir sonraki Spark'a bir segment gönderir ve alan Spark bunu o segmentin kendi kopyasına ekler. Her Spark aynı anda farklı bir segment üzerinde çalışır; böylece N − 1 halka adımından sonra her Spark tam olarak bir segmentin eksiksiz toplamını tutar. İkinci aşama olan *all-gather*'da tamamlanmış segmentler, bu kez toplanmadan kopyalanarak halkayı bir kez daha dolaşır; başka N − 1 halka adımından sonra her Spark toplamın tamamına sahip olur.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/ring-allreduce-steps.png' | relative_url }}" alt="Dört Spark arasında adım adım halka all-reduce: üç halka adımında reduce-scatter, ardından üç halka adımında all-gather" width="820"/></p>
<sub><i>Şekil 3: Dört Spark arasında halka all-reduce. Üç reduce-scatter adımından sonra her Spark bir eksiksiz toplam tutar; üç all-gather adımından sonra her Spark dördünü de tutar.</i></sub>

2 × (N − 1) halka adımının her birinde bir Spark, bloğunun 1/N'i olan bir segment gönderir. Dolayısıyla her Spark toplamda bloğun **2 × (N − 1) / N** katını gönderir: sekiz Spark için 1.75 kat ve kaç Spark katılırsa katılsın hiçbir zaman 2 kattan fazla değil. GLM-5.3 ile TP8'de her Spark all-reduce başına 1.75 × 50.3 MB = **88.1 MB** gönderir; bu, her biri yaklaşık 6.3 MB'lık 14 halka adımında gerçekleşir. Her Spark aynı miktarı gönderdiği için tek bir Spark'ta ölçülen trafik sekizini de temsil eder.

Modeldeki tüm all-reduce'lar (78 katman × 2, artı 1) toplandığında, her prompt token'ı her Spark'a

> (2 × 78 + 1) × 6,144 değer × 2 bayt × 1.75 = **3.38 MB** ağ trafiğine mal olur.

II. Kısım bu değeri ölçülen trafikle karşılaştırır.

### 3.4. Halka mı ağaç mı: NCCL hangi all-reduce'u çalıştırır

Halka, bir all-reduce gerçekleştirmenin tek yolu değildir. Çıkarım motorlarının kendi all-reduce kernel'leri vardır, ancak bunlar yalnızca tek bir makinedeki ya da tek bir NVLink alanındaki GPU'lar arasında çalışır; bu yüzden DGX Spark'lar arasında her all-reduce NCCL üzerinden geçer ([vLLM](https://github.com/vllm-project/vllm/blob/main/vllm/distributed/device_communicators/custom_all_reduce.py), [SGLang](https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/distributed/parallel_state.py)). NCCL'in halkanın yanında bir **ağaç** (tree) algoritması ve özel donanım gerektiren birkaç algoritması daha vardır: switch içinde ağ içi toplama (CollNet, NVIDIA SHARP ile) ya da bir NVSwitch (NVLS). Bir diğeri olan PAT yalnızca başka kolektif işlemler için kullanılır. Her birinde tek bir GPU bulunan ve Ethernet üzerinden bağlanan DGX Spark'lar arasında bir all-reduce bu yüzden ya halka ya da ağaç olarak çalışır ([NCCL ortam değişkenleri](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/env.html), `NCCL_ALGO`).

NCCL'in ağacı bir *çift ikili ağaçtır* (double binary tree). Veri ikiye bölünür ve her yarı kendi ikili ağacı boyunca toplanır: kısmi toplamlar köke doğru yukarı akar, sonuç da geri aşağı akar. İki ağaç, bir ağaçta veri ileten bir Spark diğerinde yaprak olacak şekilde düzenlenmiştir ([NCCL 2.4: çift ikili ağaçlar](https://developer.nvidia.com/blog/massively-scale-deep-learning-training-nccl-2-4/)). Şekil 4, dört Spark için iki algoritmayı da gösteriyor.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/allreduce-ring-vs-tree.png' | relative_url }}" alt="Dört Spark arasında halka ve çift ikili ağaç all-reduce, her Spark'ın gönderdiği miktarla birlikte" width="820"/></p>
<sub><i>Şekil 4: Dört Spark arasında halka ve ağaç all-reduce; her Spark'ın gönderdiği miktar, bloğunun katı olarak.</i></sub>

İki algoritma süre açısından farklı ödünleşimler yapar. Halka sırayla 2 × (N − 1) adımdan geçer; bu yüzden her adımın sabit gecikmesi Spark sayısıyla orantılı olarak birikir. Ağaç ise yalnızca yaklaşık log₂ N adım yukarı ve bir o kadar adım aşağı gerektirir. Bayt açısından halka mümkün olan en tasarruflu all-reduce'tur ve her Spark aynı miktarı gönderir ([Patarasuk & Yuan, 2009](https://www.cs.fsu.edu/~xyuan/paper/09jpdc.pdf)); bir ağaçta ise farklı konumlardaki Spark'lar farklı miktarlar gönderir ve en yoğun olanlar bir halkadakinden fazlasını gönderir. Sabit gecikmeler ağır bastığında, yani küçük aktarımlarda ya da çok sayıda Spark olduğunda ağaç daha hızlıdır; baytları taşımak ağır bastığında, yani büyük aktarımlarda halka daha hızlıdır.

NCCL bu seçimi her bir all-reduce için ayrı ayrı yapar. Her algoritmanın ve aktarım protokolünün süresini, aktarımın boyutundan, Spark sayısından ve algıladığı topolojiden, sabit bir gecikme artı veri miktarının etkin bir bant genişliğine bölümü olarak tahmin eder ve en hızlısını çalıştırır ([Understanding NCCL tuning](https://developer.nvidia.com/blog/understanding-nccl-tuning-to-accelerate-gpu-to-gpu-communication); [Demystifying NCCL](https://arxiv.org/abs/2507.04786)). Bir algoritma `NCCL_ALGO` ile zorlanmadıkça (bu çalışmadaki koşuların hiçbirinde zorlanmadı), seçim çıkarım sırasında her all-reduce'un boyutuyla birlikte değişir. Prefill'in 50.3 MB'lık blokları, baytları taşımanın ağır basacağı kadar büyüktür ve NCCL bunları halka olarak çalıştırır; decode'un küçük all-reduce'ları (Bölüm 4.2) ağaç olarak çalışabilir. Bağlantı hızı yalnızca ilk tür için önemlidir; bu yüzden Bölüm 3.3'teki halka formülü, daha yavaş bir bağlantının geciktirdiği aktarımları tam olarak tarif eder. Seçim NCCL'in log kaydından (`NCCL_DEBUG=INFO` ile birlikte `NCCL_DEBUG_SUBSYS=TUNING`) ya da trafikten okunabilir: halkada her Spark aynı sayıda bayt gönderir (Bölüm 13.2).

### 3.5. Spark sayısıyla ne değişir

Spark eklemek hesaplamayı böler, ama toplanması gereken veriyi bölmez. Yalnızca ağırlıklar bölünür: her Spark, her çıktı değeri için toplamın bir parçasını hesaplar; bu yüzden kısmi değerlerden oluşan bloğu, model ister iki ister on altı Spark üzerinde çalışsın, 4,096 × 6,144 değerde (50.3 MB) kalır. TP boyutu her iki katına çıktığında her Spark'ın hesaplaması yarıya iner; her Spark'ın all-reduce başına gönderdiği miktar ise, yani bloğun 2 × (N − 1) / N katı, biraz artar:

| TP boyutu | Spark başına hesaplama | All-reduce başına Spark'ın gönderdiği |
|---|---|---|
| TP2 | modelin 1/2'si | 1.0 × 50.3 MB = 50.3 MB |
| TP4 | 1/4 | 1.5 × 50.3 MB = 75.5 MB |
| TP8 | 1/8 | 1.75 × 50.3 MB = 88.1 MB |
| TP16 | 1/16 | 1.875 × 50.3 MB = 94.3 MB |

Böylece TP8'den TP16'ya geçmek, her Spark'ın hesaplamaya harcadığı süreyi yarıya indirir ama veri göndermeye harcadığı süreyi neredeyse hiç değiştirmez; ağ, her ileri yayılımın daha büyük bir payını alır. Bunun bağlantı hızı açısından ne anlama geldiği Bölüm 6.3'te hesaplanıyor.

---

## 4. Prefill ve Decode: Ağ Üzerinde İki Farklı Yük

Çıkarım, ağı zıt biçimlerde kullanan iki aşamada ilerler. Her all-reduce'un ne kadar veri taşıdığı, modelden bir ileri yayılımın (forward pass) kaç token işlediğine bağlıdır; bunu da çıkarım motorunun ayarları belirler. Aşağıdaki değerler II. Kısım'da kullanılan vLLM yapılandırmasını izler.

### 4.1. Prefill: tam bağlantı hızında büyük aktarımlar

Prefill sırasında vLLM, prompt'u ileri yayılım başına en fazla 4,096 token'lık prefill parçaları (chunk) halinde işler (`--max-num-batched-tokens 4096`); bu yüzden her all-reduce Bölüm 3.2'deki 50.3 MB'lık bloğu toplar ve her Spark 88.1 MB gönderir:

| Bağlantı hızı | 88.1 MB'ı gönderme süresi |
|---|---|
| 200 Gb/s | **3.5 ms** |
| 100 Gb/s | **7.0 ms** |

Her aktarım ayrıca yazılımda, senkronizasyonda ve ağ donanımında bir miktar sabit ek yük taşır. Bu tür ek yük için cömert bir 100 µs bile bu sürelerin yanında küçüktür: 200 Gb/s'de bağlantı 100 µs'de yalnızca 2.5 MB taşır, gönderilmesi gereken ise 88.1 MB'tır. Bir prefill all-reduce'unun süresi bu yüzden neredeyse tamamen bağlantının baytları ne kadar hızlı taşıdığıyla belirlenir; başka bir deyişle prefill iletişimi **bant genişliğiyle sınırlıdır**. All-reduce'lar arasında Spark'lar katmanın bir sonraki kısmını hesaplar; bu yüzden prefill trafiği, hesaplama boşluklarıyla ayrılmış, tam bağlantı hızında ya da ona yakın birkaç milisaniyelik patlamalar halinde görünmelidir. Bağlantı hızını yarıya indirmek her patlamanın süresini ikiye katlar ve ilk token'ı geciktirir.

### 4.2. Decode: sabit gecikmelerin belirlediği küçük aktarımlar

Decode sırasında her ileri yayılım her isteğin yalnızca en yeni token'ını işler. II. Kısım'daki gibi çok token'lı tahmin (multi-token prediction, MTP) ile spekülatif kod çözme kullanıldığında model aynı yayılımda 4 taslak token'ı da kontrol eder; böylece istek başına 5 token işler. Her all-reduce bu durumda 5 × 6,144 × 2 bayt = **61 KB** toplar ve bunun için her Spark yaklaşık **108 KB** gönderir. Çıktı katmanının token puanlarının toplanması dahil, ileri yayılım başına her Spark yaklaşık **18 MB** gönderir.

108 KB göndermek 200 Gb/s'de 4.3 µs, 100 Gb/s'de 8.7 µs sürer. Ancak all-reduce sırayla bir dizi adımdan geçer (sekiz Spark'lık bir halkada 14, bir ağaçta daha az; Bölüm 3.4) ve her birinin yazılımdan, senkronizasyondan ve ağ donanımından kaynaklanan sabit bir gecikmesi vardır. İki sistem arasındaki RDMA aktarımları çok küçük veri miktarlarında bile mikrosaniyeler mertebesinde sürer; bu gecikmeler baytları göndermeye harcanan süreden fazlasını tutar. Decode iletişimi bu yüzden **gecikmeyle (latency) sınırlıdır** ve süresi bağlantı hızına pek bağlı değildir.

Decode trafiğinin toplam miktarı da sınırlıdır. Her ileri yayılım en azından modelin aktif ağırlıklarını bellekten okumak zorundadır. GLM-5.3 token başına yaklaşık 40 milyar aktif parametreye sahiptir; bunların çoğu NVIDIA'nın 4 bitlik kayan nokta formatı NVFP4'te, ölçekleme faktörleri dahil ağırlık başına yaklaşık 4.5 bit ile saklanır. Bu, Spark başına yaklaşık 2.8 GB eder ve 273 GB/s'de okunması en az **10 ms** sürer. Her ileri yayılım bu sınırda çalışsa bile decode trafiği tek bir istek için yaklaşık **14 Gb/s**'de ya da altında kalır, 100 Gb/s'nin çok altında; bağlantıyı yarıya indirmek de 10 ms ya da daha uzun süren her yayılıma en fazla 0.7 ms ekler. Aktarımlar gecikmeyle sınırlı olduğu için pratikte eklenen süre çok daha azdır.

Ağ bu yüzden cevabın ne kadar hızlı yazıldığını değil, prompt'un ne kadar hızlı okunduğunu belirler. Bağlantı hızının önem taşıdığı yer, geri getirmeyle zenginleştirilmiş üretim (RAG), uzun belgeler ya da geniş bağlamlı agent'lar gibi uzun prompt'lu iş yükleridir. Kısa sohbet prompt'ları bağlantıya neredeyse hiç dokunmaz ve decode hızı hiç değişmemelidir.

---

## 5. Bağlantıyı Yarıya İndirmenin Etkisini Tahmin Etmek

### 5.1. Üst sınır

Her prefill aktarımı tam bağlantı hızında çalışıyor ve hiçbiri hesaplamayla örtüşmüyorsa, bağlantı hızını B_old'dan B_new'e düşürmek tam olarak aynı baytları göndermek için gereken ek süreyi ekler:

> **ek prefill süresi ≤ Spark başına prefill baytı × (1 / B_new − 1 / B_old)**

Bu bir üst sınırdır: hesaplamayla örtüşen ya da hiçbir zaman tam hıza ulaşmayan aktarımlar daha az ekler. Sınır için yalnızca Bölüm 3.3'teki prompt token'ı başına bayt miktarı ve prompt uzunluğu gerekir; Spark'ların ne kadar hızlı hesapladığına dair hiçbir bilgi gerekmez.

200'den 100 Gb/s'ye, (1/100 − 1/200) = 1/200 olduğu için ek süre, prefill baytlarının 200 Gb/s'de gönderilme süresine eşittir. GLM-5.3 ile TP8 için:

> **ek TTFT ≤ 3.38 MB × 8 bit ÷ 200 Gb/s = 1,000 prompt token'ı başına 0.135 s**

### 5.2. Altı test durumu

| Test | Prompt token'ı | Spark başına prefill baytı | Ek prefill süresi, 200 → 100 Gb/s |
|---|---|---|---|
| P1: 1K prompt, 1 istek | 1,024 | 3.5 GB | ≤ +0.14 s |
| P2: 8K prompt, 1 istek | 8,192 | 27.7 GB | ≤ +1.11 s |
| P3: 32K prompt, 1 istek | 32,768 | 110.6 GB | ≤ +4.43 s |
| P4: aynı anda gelen 4 × 8K prompt | 32,768 | 110.6 GB | ≤ +4.43 s |
| P5: 64K prompt, 1 istek | 65,536 | 221.3 GB | ≤ +8.85 s |
| P6: aynı anda gelen 4 × 16K prompt | 65,536 | 221.3 GB | ≤ +8.85 s |

Dört istekli testlerde baytlar dört prompt'un tamamına aittir ve süre, dört istekten sonuncusunun ilk token'ını alana kadar geçen süredir.

### 5.3. Saniyeden yüzdeye

TTFT'nin payı olarak sınır şu hale gelir:

> **TTFT artışı ≤ ağ payı × (B_old / B_new − 1)**; 200 → 100 Gb/s için bu basitçe **≤ ağ payı** olur;

burada **ağ payı**, prefill baytlarını 200 Gb/s'de göndermek için gereken sürenin prefill süresine bölümüdür.

Prefill süresinin kendisi mimariden güvenilir biçimde türetilemez. Aritmetik işlem sayısından ve GB10'un tepe hesaplama gücünden yapılan bir hesap bir büyüklük mertebesi kadar sapar; çünkü gerçek hız, motorun kernel'lerinin MoE uzmanlarını, attention'ı ve zamanlamayı ne kadar verimli işlediğine bağlıdır. Yüzde bu yüzden ölçülmüş bir girdiye, 200 Gb/s'deki TTFT'ye ihtiyaç duyar; bunu II. Kısım sağlar.

---

## 6. Kaybı Büyüten ve Küçülten Etkenler

Kayıp en fazla prefill süresindeki ağ payı kadar olduğu için, bu payı artıran her şey kaybı da artırır.

### 6.1. Prompt uzunluğu

Her prompt token'ı aynı 3.38 MB'a mal olur; bu yüzden baytlar prompt'la orantılı büyür. Matris hesaplaması da orantılı büyür. Her token'ı kendinden önceki token'larla karşılaştıran attention ise, her token'ın tüm bağlamla ilişki kurduğu bir modelde prompt'tan daha hızlı büyür; orada ağ payı, ve onunla birlikte yüzde olarak kayıp, çok uzun prompt'larda yavaşça düşer. GLM-5.3, her token'ın daha önceki yaklaşık 2,048 token'dan oluşan seçilmiş bir kümeyle ilişki kurduğu DeepSeek Sparse Attention (DSA) kullanır; bu yüzden hesaplaması prompt'la orantılıya yakın kalır ve uzun prompt'larda **yüzde olarak kayıp kabaca sabit kalmalıdır**. Saniye cinsinden kayıp ise her iki durumda da prompt uzunluğuyla büyümeye devam eder.

Kısa prompt'lar farklıdır. 1K token'lık bir prompt tek bir küçük prefill parçasına sığar ve her all-reduce'unda Spark başına yalnızca yaklaşık 22 MB gönderir; bu, 200 Gb/s'de bir milisaniyenin altındadır. Bu kadar kısa aktarımlar tam bağlantı hızına ulaşamayabilir ve her ileri yayılımın sabit ek yükü daha ağır basar; bu yüzden sınır etkiyi abartabilir.

### 6.2. Aynı anda birkaç istek

Birkaç prompt birlikte geldiğinde prefill parçaları ileri yayılımları paylaşır. Prompt token'ı başına bayt aynı kalır, ancak token başına hesaplama düşer; çünkü her prompt daha kısa bir bağlam üzerinde attention yapar ve iş daha dolu batch'lerde yürür. Sürenin daha büyük bir kısmı iletişime gider; bu yüzden kayıp, aynı toplam uzunluktaki tek bir prompt'tan daha büyüktür. Motorun prompt'ları hangi sırayla işlediği ve ilklerinin ne zaman üretime başladığı da her isteğin kendi TTFT'sini etkiler.

### 6.3. TP boyutu

TP8'e göre, Spark başına token başına bayt ve Spark başına hesaplama şöyle değişir:

| TP boyutu | Spark başına bayt | Spark başına hesaplama |
|---|---|---|
| TP2 | 0.57× | 4× |
| TP4 | 0.86× | 2× |
| TP8 | 1× | 1× |
| TP16 | 1.07× | 0.5× |

Ağ payı, ve onunla birlikte kayıp, TP boyutuyla hızla büyür: düşük bağlantı hızını kabul etmek düşük TP boyutlarında en kolaydır ve bir model daha fazla Spark'a yayıldıkça daha pahalıya mal olur. Bölüm 10, ölçülen TP8 temel değerini kullanarak bunu sayılara döker.

---

# II. Kısım: Ölçüm

## 7. Test Tasarımı

### 7.1. Yalnızca bağlantıyı değiştirmek

Karşılaştırma ancak bağlantı hızı iki yapılandırma arasındaki tek fark olduğunda işe yarar. İkisinde de aynı model, motor, ayarlar, prompt'lar ve test planı kullanıldı; yalnızca ağ yolu değişti.

### 7.2. Kurulum

| Öğe | Değer |
|---|---|
| Sistemler | 8× NVIDIA DGX Spark (GB10, 128 GB birleşik bellek), sürücü 580.173.02 |
| Switch | MikroTik CRS804, 400G QSFP-DD portlar 2 × 200G breakout ile |
| Model | GLM-5.3 NVFP4 (`Inferact/GLM-5.3-NVFP4`): 753B parametreli MoE, token başına yaklaşık 40B aktif; gizli boyut 6,144; 78 katman; DeepSeek Sparse Attention |
| Motor | vLLM `0.1.dev20133+gb5f995e73` (container `vllm-node-b12x`), PyTorch 2.13, NCCL 2.31.2, Ray |
| Paralellik | TP8: 8 Spark'ın tamamına yayılmış tek bir model örneği |
| Temel ayarlar | en fazla 4,096 token'lık prefill parçaları, FP8 KV cache, MTP ile spekülatif kod çözme (4 taslak token; taslak model Spark'lara bölünmez, bu yüzden ağ trafiği eklemez), CUDA graph'ları, en fazla 8 eşzamanlı istek |

GLM-5.3, 8 Spark'ın tamamına ihtiyaç duyan büyük bir MoE modelidir; cluster ağının en çok önem taşıdığı durum budur.

### 7.3. 100 Gb/s'yi mevcut kablolarla emüle etmek

100 Gb/s'lik bir bağlantı, herhangi bir 100G kablo alınmadan önce denenebilir. NCCL, ikinci RDMA cihazı çıkarım motorunun ortamında dışarıda bırakılarak her Spark'taki iki ağ arayüzünden yalnızca birini kullanacak şekilde yapılandırılır:

```
NCCL_IB_HCA=^roceP2p1s0f1
```

(RDMA cihaz adlarını `ibdev2netdev` listeler.) Fiziksel olarak hiçbir şey değişmez; kablolar, switch portları ve diğer tüm ayarlar aynı kalır ve modeli bu ayar olmadan yeniden başlatmak 200 Gb/s'yi geri getirir. RDMA sayaçları (Ek A), tüm trafiğin kalan tek arayüz üzerinden geçtiğini doğrular; bu çalışmanın her emüle edilmiş koşusunda da öyle oldu.

Bir iş yükü mevcut bir 200 Gb/s cluster'da 100 Gb/s'de böyle test edilebilir: bir kez 200 Gb/s'de, bir kez emüle edilmiş bağlantıda çalıştırın, farkı gerçek bir bağlantıya dönüştürün (Bölüm 9) ve sonuç kabul edilebilirse 100G kablolara geçin (Bölüm 11). II. Kısım bunu Bölüm 7.4'teki test planıyla GLM-5.3'e TP8'de uygular.

Tek bir arayüz, PCIe Gen5 ×4 bağlantısının izin verdiği kadarını taşır: 4 hat × 32 GT/s, hat kodlamasıyla (128b/130b) 126 Gb/s'ye, PCIe paket ve akış kontrolü ek yüküyle yaklaşık **111 Gb/s**'ye düşer. `ib_write_bw` ile ölçüldüğünde tek bir arayüz **109 Gb/s** taşır. Emüle edilmiş bağlantı bu yüzden 98 Gb/s taşıyan gerçek bir 100 Gb/s bağlantıdan (Bölüm 12.3) yaklaşık %11 daha hızlıdır; Bölüm 9 sonuçları bu farka göre dönüştürür.

B_new = 100 yerine 109 Gb/s alındığında Bölüm 5.1'deki sınır şu hale gelir:

> **ek prefill süresi ≤ prefill baytı × (1/109 − 1/200)**; GLM-5.3 ile TP8 için **1,000 prompt token'ı başına yaklaşık 0.11 s**

| Test | Tahmin, 200 → 100 Gb/s (Bölüm 5.2) | Tahmin, 200 → 109 Gb/s (bu deney) |
|---|---|---|
| P1: 1K | ≤ +0.14 s | ≤ +0.12 s |
| P2: 8K | ≤ +1.11 s | ≤ +0.92 s |
| P3: 32K | ≤ +4.43 s | ≤ +3.69 s |
| P4: 4 × 8K | ≤ +4.43 s | ≤ +3.69 s |
| P5: 64K | ≤ +8.85 s | ≤ +7.39 s |
| P6: 4 × 16K | ≤ +8.85 s | ≤ +7.39 s |

Bölüm 9, ölçülen sonuçları gerçek bir 100 Gb/s kabloya geri dönüştürür; Bölüm 12.3 de böyle bir kabloyu ölçer.

### 7.4. Test planı

| Test | İstekler | Prompt → çıktı token'ı | Amaç |
|---|---|---|---|
| P1 | 1 | 1,024 → 1,024 | küçük aktarımlı kısa bir prompt |
| P2 | 1 | 8,192 → 1,024 | tipik bir uzun prompt |
| P3 | 1 | 32,768 → 1,024 | uzun bir belge |
| P4 | 4, aynı anda gelen | 4 × 8,192 → 1,024 | birkaç istek, P3 ile aynı toplam prompt boyutu |
| P5 | 1 | 65,536 → 1,024 | çok uzun bir prompt |
| P6 | 4, aynı anda gelen | 4 × 16,384 → 1,024 | birkaç istek, P5 ile aynı toplam prompt boyutu |

Her test, sayılmayan bir ısınma turu ve üç ölçüm turu koştu. Çıktı tam olarak 1,024 token'a sabitlendi; böylece her istek aynı miktarda decode yaptı ve decode hızları doğrudan karşılaştırılabilir oldu.

### 7.5. Neler ölçüldü

- **TTFT (time to first token, ilk token süresi):** bir isteğin gönderilmesinden ilk token'ının alınmasına kadar geçen süre. P4 ve P6 için dört istekten sonuncusunun ilk token'ını alana kadar geçen süre de raporlanır; bu süre dört prompt'un tüm baytlarını kapsar ve tahminin tarif ettiği büyüklüktür.
- **Decode hızı:** cevabın ne kadar hızlı aktığı, ilk token'dan sonra saniye başına token olarak: (çıktı token'ı − 1) ÷ (son token'ın zamanı − ilk token'ın zamanı). Tüm istek süresine, TTFT dahil, bölen bir saniye başına token değeri decode karşılaştırmalarında kullanılmaz; çünkü decode hızı değişmediğinde bile uzun prompt'larla düşer.
- **Ağ trafiği:** tek bir Spark'ın ConnectX-7'sinin RDMA sayaçlarından baytlar ve hızlar (Ek A). Halka all-reduce'ta her Spark aynı miktarı gönderdiği için tek bir Spark sekizini de temsil eder.

### 7.6. Koşuları karşılaştırılabilir tutmak

Prompt'lar sabit bir prompt kümesinden alındı ve sabit bir rastgele tohumla hedef uzunluğa dolduruldu; böylece iki yapılandırma da aynı prompt'ları aldı. Her isteğin dolgusu farklı sıralandı; böylece motor daha önceki bir istekten önbelleğe alınmış işi yeniden kullanamadı. Test için gerekmeyen servisler tüm Spark'larda durduruldu ve her koşu ancak bağlantı 10 saniye boyunca hiç trafik taşımadıktan sonra başladı. İstekler ve trafik örnekleri aynı Spark'ta ve aynı saatle zaman damgalandı; böylece her isteğin prefill ve decode trafiği tam olarak ayrılabilir.

Tüm ölçüm turları kullanıldı ve turlar arasındaki aralıkla birlikte ortalama olarak raporlandı. Turlar tutarlıydı: bir test içinde prefill süreleri tek isteklerde en fazla 0.6 s, dört istekte en fazla 1.2 s değişti.

---

## 8. Sonuçlar: TP8'de 200 Gb/s ve Emüle Edilmiş 100 Gb/s

### 8.1. Cluster 200 Gb/s'nin ne kadarını kullanıyor

Şekil 5, 200 Gb/s'lik cluster'da 8K token'lık tek bir istek sırasında bir Spark'ın gönderdiği trafiği gösteriyor. Prefill sırasında, Bölüm 4.1'de anlatıldığı gibi, tam bağlantı hızına yakın birkaç milisaniyelik patlamalar Spark'ların hesap yaptığı boşluklarla dönüşümlü olarak görülür; 200 ms'lik yakınlaştırmada her patlama bir prefill all-reduce'udur. İlk token'dan sonra decode trafiği düşük ve sabittir.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-200g-p2-annotated.png' | relative_url }}" alt="200 Gb/s'de 8K token'lık tek bir istek: prefill patlamaları, ilk token ve decode trafiği, prefill içinde 200 ms'lik yakınlaştırma ile" width="820"/></p>
<sub><i>Şekil 5: 200 Gb/s'de 8K token'lık tek bir istek, bir Spark'ın gönderdiği trafik, 1 ms aralıklarla; altta prefill içinden 200 ms'lik bir pencere.</i></sub>

1 ms aralıklarla ölçüldüğünde, 8K–64K'lık tekil prompt'ların patlamaları yaklaşık 150–180 Gb/s'ye, aynı anda gelen dört prompt'unkiler ise 200 Gb/s'ye yakın değerlere ulaşır. Ancak 8K'lık bir prefill'in tamamı üzerinden ortalaması alındığında trafik 37 Gb/s'dir; çünkü Spark'lar hesap yaparken bağlantı hiçbir şey taşımaz. Decode ortalaması tek istek için yaklaşık **3 Gb/s**, dört istek için yaklaşık **6 Gb/s**'dir; bu değerler Bölüm 4.2'de tahmin edilen sınırların içindedir. Cluster 200 Gb/s'nin tamamını kullanır, ama bir seferde yalnızca birkaç milisaniye için.

Bir ölçümün bu iki tablodan hangisini göstereceğini ortalama alma aralığı belirler. Aynı 8K prefill şu en yüksek değerleri verir:

| Ortalama alma aralığı | En yüksek değer |
|---|---|
| 1 ms | 181 Gb/s |
| 5 ms | 96 Gb/s |
| 100 ms | 44 Gb/s |
| 1 s | 40 Gb/s |
| prefill'in tamamı (ortalama) | 37 Gb/s |

Bir saniyelik ortalamalar raporlayan bir switch yaklaşık 40 Gb/s gösterir ve neredeyse boşta bir bağlantı izlenimi verir. TTFT'yi belirleyen patlamalar yalnızca milisaniye çözünürlüğünde görünür (Ek A).

### 8.2. Her testteki trafik

Şekil 6–11, her testin üç ölçüm turu sırasında bir Spark'ın gönderdiği trafiği, üstte 200 Gb/s ve altta emüle edilmiş 100 Gb/s olmak üzere aynı zaman ekseninde gösteriyor. Gri bant prefill'dir ve ilk token'da biter.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p1-1k-200g-vs-100g.png' | relative_url }}" alt="1K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 6: P1, 1K token'lık prompt, 1 istek.</i></sub>

1K'lık bir prompt'ta prefill patlamaları 200 Gb/s'lik cluster'da bile yalnızca yaklaşık 100 Gb/s'ye ulaşır; bu, tek bir arayüzün taşıyabileceğinin altındadır, bu yüzden emüle edilmiş bağlantı onları yavaşlatmaz. TTFT her iki bağlantı hızında da aynıdır: 0.96 s ve 0.97 s.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p2-8k-200g-vs-100g.png' | relative_url }}" alt="8K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 7: P2, 8K token'lık prompt, 1 istek.</i></sub>

8K'lık bir prompt'ta prefill 200 Gb/s'de yaklaşık 150–180 Gb/s'de çalışır. Emüle edilmiş bağlantıda aynı patlamalar yaklaşık 105–109 Gb/s'de tutulur ve daha uzun sürer; TTFT 6.36 s'den 7.24 s'ye çıkar. Decode trafiği iki panelde de aynı görünür.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p3-32k-200g-vs-100g.png' | relative_url }}" alt="32K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 8: P3, 32K token'lık prompt, 1 istek.</i></sub>

32K'lık prompt aynı örüntüyü daha uzun bir prefill boyunca gösterir; TTFT 27.0 s'den 30.6 s'ye çıkar.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p4-4x8k-200g-vs-100g.png' | relative_url }}" alt="Aynı anda gelen dört 8K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 9: P4, aynı anda gelen dört 8K token'lık prompt.</i></sub>

Dört prompt aynı anda geldiğinde prefill, 200 Gb/s'lik bağlantıyı neredeyse tamamen kullanılır halde tutarken, emüle edilmiş bağlantı baştan sona 109 Gb/s'de kalır. Son ilk token'a kadar geçen süre 23.0 s'den 26.4 s'ye çıkar. Decode trafiği dört istekte daha yüksektir, ama yine de iki bağlantı hızının da çok altındadır.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p5-64k-200g-vs-100g.png' | relative_url }}" alt="64K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 10: P5, 64K token'lık prompt, 1 istek.</i></sub>

64K'lık prompt, iki kat uzunlukta 32K'lık prompt gibi davranır: 200 Gb/s'de yaklaşık 150–180 Gb/s'lik patlamalar, emüle edilmiş bağlantıda 109 Gb/s'de tutulur ve TTFT 55.5 s'den 62.5 s'ye çıkar. Üç tur 0.2 s içinde birbiriyle uyumludur.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p6-4x16k-200g-vs-100g.png' | relative_url }}" alt="Aynı anda gelen dört 16K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 11: P6, aynı anda gelen dört 16K token'lık prompt.</i></sub>

Dört 16K'lık prompt'ta prefill, 200 Gb/s'lik bağlantıyı yaklaşık 46 s boyunca neredeyse tamamen kullanılır halde tutar; emüle edilmiş bağlantıda bu, 109 Gb/s'de yaklaşık 54 s'dir. Motor dört prompt'u çiftler halinde işler: ilk ikisi ilk token'larını yaklaşık 22 s'de (200 Gb/s) ve 27 s'de (emüle edilmiş), son ikisi yaklaşık 45 s'de ve 54 s'de alır. İkinci çift hâlâ prefill'deyken ilk çift zaten decode yapmaktadır.

### 8.3. Prompt token'ı başına trafik

Ölçülen prefill trafiği Spark başına **prompt token'ı başına 3.54–3.60 MB** oldu; bu, Bölüm 3.3'teki 3.38 MB'tan %5–7 fazladır. Fark, ağ paketlerinin başlıklarından ve istek başına küçük bir miktar trafikten kaynaklanır. Baytlar her iki bağlantı hızında da aynıydı; bu, yalnızca bağlantı hızının değiştiğini doğrular.

### 8.4. TTFT

Üç turun ortalamaları, parantez içinde turlar arasındaki aralıkla; P4 ve P6 için dört istekten sonuncusunun ilk token'ını alana kadar geçen süre. Karşılaştırma için emüle edilmiş bağlantıya ait tahmin (Bölüm 7.3) de verilmiştir.

| Test | 200 Gb/s | 100 Gb/s (emüle edilmiş, 109 Gb/s) | Artış |
|---|---|---|---|
| P1: 1K | 0.96 s (0.91–0.99) | 0.97 s (0.94–1.00) | **+0.01 s (+%1.1)**, ölçülebilir fark yok (tahmin: ≤ +0.12 s) |
| P2: 8K | 6.36 s (6.21–6.56) | 7.24 s (7.14–7.45) | **+0.88 s (+%13.9)** (tahmin: ≤ +0.92 s) |
| P3: 32K | 27.02 s (26.96–27.12) | 30.57 s (30.40–30.87) | **+3.55 s (+%13.1)** (tahmin: ≤ +3.69 s) |
| P4: 4 × 8K, son ilk token | 23.00 s (22.61–23.19) | 26.44 s (26.20–26.59) | **+3.44 s (+%15.0)** (tahmin: ≤ +3.69 s) |
| P5: 64K | 55.47 s (55.39–55.55) | 62.47 s (62.34–62.56) | **+6.99 s (+%12.6)** (tahmin: ≤ +7.39 s) |
| P6: 4 × 16K, son ilk token | 45.82 s (45.36–46.52) | 54.26 s (54.08–54.60) | **+8.44 s (+%18.4)** (tahmin: ≤ +7.39 s) |

Her turun dört isteği üzerinden ortalama alındığında TTFT, P4'te 16.49 s'den 20.21 s'ye (**+%22.5**), P6'da 33.96 s'den 40.03 s'ye (**+%17.9**) çıktı. Bunlar, herhangi bir testte ölçülen en büyük artışlardır.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/measured-vs-predicted.png' | relative_url }}" alt="109 Gb/s'de ek prefill süresi: test başına tahmin ve ölçüm" width="820"/></p>
<sub><i>Şekil 12: Bağlantı 200'den 109 Gb/s'ye düştüğünde ek prefill süresi: tahmin (Bölüm 7.3) ve ölçüm.</i></sub>

8K–64K token'lık tekil prompt'larda ve aynı anda gelen dört 8K'lık prompt'ta ölçülen artış, tahminin birkaç yüzde yakınında ve bir üst sınırdan beklendiği gibi biraz altında kaldı: aktarımların küçük bir kısmı hesaplamayla örtüşür. Modelin mimarisinden, motorun prefill parçası boyutundan ve bağlantı hızından yapılan tahmin, hesaplamaya dair hiçbir ölçüm gerektirmeden daha yavaş bir bağlantının etkisini iyi öngörür. Saniye cinsinden artış **1,000 prompt token'ı başına yaklaşık 0.11 s**'dir.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/ttft-increase-vs-prompt.png' | relative_url }}" alt="Tur başına prompt token'ına göre prefill süresindeki artış, ölçülen ve tahmin edilen" width="820"/></p>
<sub><i>Şekil 13: Prompt boyutuna göre prefill süresindeki artış, ölçülen ve tahmin edilen.</i></sub>

Tek bir prompt için yüzde, 8K'dan 64K token'a kadar neredeyse sabit kalır (%13.9, %13.1 ve %12.6); Bölüm 6.1'in seyrek attention'lı bir model için beklediği de budur. Hafif düşüş, attention işinin baytlardan hâlâ daha hızlı büyüyen kısmından kaynaklanır. Birkaç prompt aynı anda geldiğinde yüzde, aynı toplam prompt boyutu için daha yüksektir: dört 8K'lık prompt için %15.0, dört 16K'lık prompt için %18.4; Bölüm 6.2'nin beklediği gibi.

### 8.5. Decode hızı

| Test | 200 Gb/s | 100 Gb/s (emüle edilmiş) | Değişim |
|---|---|---|---|
| P1: 1K | 22.4 token/s | 22.5 token/s | +%0.5 |
| P2: 8K | 21.1 token/s | 20.6 token/s | −%2.3 |
| P3: 32K | 18.7 token/s | 19.1 token/s | +%2.0 |
| P4: 4 × 8K | istek başına 10.8 token/s | istek başına 11.2 token/s | +%4.3 |
| P5: 64K | 21.1 token/s | 21.0 token/s | −%0.4 |
| P6: 4 × 16K | istek başına 10.5 token/s | istek başına 10.2 token/s | −%2.1 |

Değişimler iki yöne de işaret ediyor ve turlar arasındaki değişkenliğin içinde kalıyor: Bölüm 4.2'nin beklediği gibi decode hızı bağlantı hızına bağlı değildir.

### 8.6. Ölçümün tahminden ayrıldığı yerler

**1K'lık prompt.** Tahmin en fazla +0.12 s'ye izin veriyor, ölçüm ise +0.01 s gösteriyor. 1K'lık bir prompt'un her all-reduce'u Spark başına yalnızca yaklaşık 22 MB gönderir ve patlamalar 200 Gb/s'de bile yalnızca yaklaşık 100 Gb/s'ye ulaşır (Şekil 6); bu, emüle edilmiş bağlantının taşıyabildiğinin altındadır. Bölüm 6.1'in öngördüğü gibi sınır, kısa prompt'larda etkiyi abartır.

**Aynı anda gelen dört 16K'lık prompt.** Burada ölçülen artış tahmini yaklaşık 1 s aşıyor. Tahmin, baytları göndermeye harcanan süreyi kapsar. Bu testte motor prompt'ları çiftler halinde işledi ve ikinci çift hâlâ prefill'deyken ilk çiftin decode'una başladı (Bölüm 8.2); bu yüzden decode işi, kalan prefill'in ileri yayılımlarını paylaştı. O prefill ne kadar uzun sürerse içine o kadar çok decode işi düşer ve son ilk token'a kadar geçen süre, yalnızca ek aktarım süresinin getireceğinden fazla uzar. Motorun zamanlamasının bu etkisi tahminin dışında kalır ve birkaç uzun prompt aynı anda geldiğinde kaybı artırabilir.

**Aynı anda gelen dört 8K'lık prompt.** Son ilk token'a kadar geçen süre tahminin içinde kaldı, ancak motorun dört ilk token'ı verme sırası iki bağlantı hızında farklıydı. Bu tür testlerde tek tek isteklerin TTFT'si bu yüzden yalnızca bağlantıya değil, kısmen zamanlamaya da bağlıdır.

---

## 9. Emüle Edilmiş Bağlantıdan Gerçek 100G Kabloya

Emüle edilmiş bağlantı en fazla 109 Gb/s taşır; gerçek bir 100 Gb/s bağlantı ise 98 Gb/s taşır (Bölüm 12.3). Sınırı bu farka uygulamak, gerçek bir kablonun ölçülen sonuçlara ekleyebileceği en büyük değeri verir:

> **ek prefill süresi ≤ ölçülen prefill baytı × (1/98 − 1/109)**

| Test | Emüle edilmiş 100 Gb/s (ölçülen) | Gerçek 100 Gb/s kablo, en fazla |
|---|---|---|
| P1: 1K | +%1.1 | +%4.2 |
| P2: 8K | +%13.9 | +%17.6 |
| P3: 32K | +%13.1 | +%16.7 |
| P4: 4 × 8K, son ilk token | +%15.0 | +%19.1 |
| P5: 64K | +%12.6 | +%16.1 |
| P6: 4 × 16K, son ilk token | +%18.4 | +%22.6 |

Gerçek bir 100 Gb/s kablo bu yüzden ölçülen sonuçlardan en fazla 3–4 puan daha kötü olur ve decode hızı yine etkilenmez. Saniye cinsinden, 98 Gb/s ile Bölüm 5.1'deki sınır 1,000 prompt token'ı başına en fazla 0.14 s verir. Aynı dönüşüm, emüle edilmiş bağlantıda denenen her iş yüküne uygulanır: o iş yükünün ölçülen prefill baytı × (1/98 − 1/109), gerçek bir kablonun ekleyebileceği en büyük değerdir.

---

## 10. Öngörü: Kayıp TP Boyutuyla Nasıl Değişir

TP8 ve 200 Gb/s'de ölçülen 8K prefill temel alınarak ve hesaplamanın Spark'lara eşit bölündüğü varsayılarak, Bölüm 5'teki sınır gerçek bir 100 Gb/s bağlantı için şunu öngörür:

| TP boyutu | 100 Gb/s'de öngörülen TTFT artışı, 8K prompt |
|---|---|
| TP2 | ≤ %3 |
| TP4 | ≤ %8 |
| **TP8** | ≤ %17 (emüle edilmiş bağlantıda ölçülen: %13.9; gerçek kablo: ≤ %17.6) |
| TP16 | ≤ %31 |

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp-projection.png' | relative_url }}" alt="TP boyutuna göre öngörülen 100 Gb/s TTFT kaybı" width="820"/></p>
<sub><i>Şekil 14: TP boyutuna göre 100 Gb/s'nin öngörülen TTFT kaybı (açıklayıcı).</i></sub>

Bu bir ölçüm değil, bir öngörüdür: GLM-5.3 2 ya da 4 Spark'a sığmaz ve sabit ek yükler göz ardı edilmiştir. Etkinin yönünü ve kabaca büyüklüğünü gösterir: TP16'da kayıp, TP8'dekinin yaklaşık iki katı olur. Bölüm 13.6 bunu TP4'teki bir ölçümle karşılaştırır. 100 Gb/s'de 16 Spark ile iki TP8 cluster'ın her biri bu çalışmada ölçülen kaybı korur; tek bir TP16 cluster ise kaybı kabaca ikiye katlar.

---

# III. Kısım: Gerçek 100 Gb/s Bağlantılar

## 11. Gerçek 100 Gb/s Bağlantıları Kurmak

Bir iş yükünün emüle edilmiş bağlantıdaki sonucu kabul edilebilir olduğunda bir sonraki adım gerçek 100 Gb/s bağlantılardır. Bu kısım bunları dört Spark için kurar ve ölçer; bu da emülasyonu ve tahmini gerçek kablolarla sınar.

### 11.1. Kablo ve switch bağlantıları

Gerçek bir 100 Gb/s bağlantı, 2 × 200G breakout kablosunun yerine 4 × 100G'lik bir kablo kullanır. MikroTik CRS804'te (RouterOS 7.24.4) her 400G QSFP-DD yuvası 50 Gb/s'lik sekiz hat taşır ve bunların nasıl paylaşılacağını kablo belirler:

| Kablo | Bir 400G yuvasını böldüğü | Spark başına hat | Spark başına hız | Yuva başına Spark |
|---|---|---|---|---|
| FS QDD-400G-2QPC01, 1 m | 2 bağlantı | 4 | 200 Gb/s (`200G-baseCR4`) | 2 |
| FS QDD-400G-4QPC02, 2 m | 4 bağlantı | 2 | 100 Gb/s (`100G-baseCR2`) | 4 |

İkisi de pasif bakır breakout kablosudur (DAC) ve iki bağlantı türü de RS ileri hata düzeltmesi (forward error correction, FEC91) kullanır. Switch her yuvayı, hat başına bir tane olmak üzere sekiz alt arayüz olarak gösterir (yuva 3 için `qsfp56-dd-3-1` ile `qsfp56-dd-3-8` arası) ve her bağlantıyı başladığı hattın adıyla adlandırır: 2 kollu kabloda `-1` ve `-5`, 4 kollu kabloda `-1`, `-3`, `-5` ve `-7`. İki hatlı `100G-baseCR2` modunu yalnızca bu dördü destekler.

Spark'larda hiçbir şey değişmez. ConnectX-7 adaptörleri, 4 kollu kablonun bir kolunun modu olan `100000baseCR2/Full` modunu destekler ve bildirir; ağ yapılandırmaları da yalnızca adresleri ve 9,000 baytlık MTU'yu ayarlar, bu yüzden switch'in sunduğu hıza uyarlar. Portun iki ağ arayüzü de açık kalır ve bağlantının 100 Gb/s'sini paylaşır; bu, arayüzlerden birinin 200 Gb/s'lik bir bağlantıda dışarıda bırakıldığı Bölüm 7.3'teki emülasyondan farklıdır.

### 11.2. Dört Spark'ı tek bir yuvaya taşımak

4 kollu bir kablo dört Spark'ı tek bir yuvaya bağlar. Test cluster'ında test için seçilen dört Spark, 200 Gb/s'de üç yuvaya dağılmıştı: ikisi yuva 3'teki kabloyu paylaşıyordu, diğer ikisi ise yuva 2 ve 4'teki birer kabloyu test dışındaki birer Spark'la paylaşıyordu. Yuva 3 dönüştürüldü. 2 kollu kablosu çıkarıldı ve 4 kollu kablo takıldı; diğer iki Spark'ın kabloları yalnızca Spark ucundan çıkarıldı, böylece bu kablolar yuva 2 ve 4'te kaldı ve eş Spark'lara 200 Gb/s'de hizmet etmeye devam etti.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/real-100g-cabling.png' | relative_url }}" alt="Önce: üç 2 × 200G kablo üzerinde dört Spark; sonra: yuva 3'teki tek bir 4 × 100G kablo üzerinde dört Spark" width="820"/></p>
<sub><i>Şekil 15: 200 Gb/s'de ve 100 Gb/s'de kablolama. Yalnızca yuva 3 değişir.</i></sub>

| Soru | Cevap |
|---|---|
| Kablonun her kolu belirli bir Spark'a mı gitmeli? | Hayır. Spark'ların adresleri switch portuna bağlı değildir. |
| Kablo başka bir yuvaya takılabilir mi? | Evet, Bölüm 11.3'teki ayarlar o yuvaya uygulanarak. |
| Tam olarak dört Spark gerekir mi? | Hayır. Kullanılmayan kolların bağlantısı kapalı kalır. |
| 100 Gb/s ve 200 Gb/s Spark'lar tek bir switch'te birlikte çalışabilir mi? | Evet. 200 Gb/s'deki bir Spark, 100 Gb/s'deki bir Spark'a 83.7 Gb/s gönderdi. |
| Neyin eşleşmesi gerekir? | Bir yuvadaki kablo türü ile o yuvanın ayarları. |

### 11.3. Adım adım değişiklik

1. **Switch'in yönetilebildiğini kontrol edin.** CRS804'ün yönetim portu yönetim ağına kablolanmış olmalıdır; bu olmadan switch trafiği iletmeye devam eder ama yapılandırılamaz.
2. **Switch yapılandırmasını yedekleyin**: `/export terse file=before-100g` ve `/system/backup/save name=before-100g` ile. Dışa aktarım (export), her ayarın okunabilir bir listesidir ve daha sonra değişikliği kontrol etmek için kullanılır; yedek ise acil durumlar için tam bir imajdır.
3. **Modeli durdurun.** Kablolar yer değiştirdiğinde modelin Spark'lar arasındaki bağlantıları kopar.
4. **Yeniden kablolayın.** 2 kollu kabloyu yuvadan çekin, gruptaki diğer Spark'ların kablolarını yalnızca Spark ucundan çıkarın ve 4 kollu kabloyu dört koluyla birlikte takın. Her Spark, yeni kablonun parça numarasını ve hangi kol olduğunu `ethtool -m` çıktısında bildirir.
5. **Switch'in kabloyu gördüğünden emin olun.** Switch yuvada modül olmadığını bildiriyorsa (`/interface/ethernet/monitor` içinde `sfp-module-present: no`), kablonun geniş ucu tam oturmamıştır ve yerine kilitlenene kadar yeniden takılması gerekir.
6. **Yuvanın ayarlarını uygulayın** (burada yuva 3):
   ```
   /interface ethernet set [find default-name=qsfp56-dd-3-1] speed=100G-baseCR2
   /interface ethernet set [find default-name=qsfp56-dd-3-5] speed=100G-baseCR2
   /interface ethernet set [find default-name=qsfp56-dd-3-3] auto-negotiation=no speed=100G-baseCR2 mtu=9000 l2mtu=9500
   /interface ethernet set [find default-name=qsfp56-dd-3-7] auto-negotiation=no speed=100G-baseCR2 mtu=9000 l2mtu=9500
   /interface ethernet switch qos port set qsfp56-dd-3-1 egress-rate-queue3=100Gbps
   /interface ethernet switch qos port set qsfp56-dd-3-5 egress-rate-queue3=100Gbps
   /interface ethernet switch qos port set qsfp56-dd-3-3 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=100Gbps
   /interface ethernet switch qos port set qsfp56-dd-3-7 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=100Gbps
   ```
   İlk iki satır mevcut bağlantıları dört hattan ikiye geçirir. Sonraki ikisi, 200 Gb/s'de kullanılmayan bağlantıları mevcut bağlantılarla aynı sabit hız, MTU ve L2 MTU ile açar; böylece 9,000 baytlık çerçeveler geçer. Son dördü, dört bağlantının hepsine [8-Node Cluster Kurulum Rehberi]({{ '/papers/dgx-spark-8node-cluster-setup/' | relative_url }}) içindeki 200 Gb/s bağlantıların QoS ayarlarını verir ve RoCE kuyruğunun hızını 100 Gbps'ye ayarlar; bunlar olmadan iki yeni bağlantı RoCE trafiğine eskilerinden farklı davranırdı. Değişiklik yalnızca bu yuvaya dokunur ve switch'i yeniden başlatmaz.
7. **Dört Spark'ı yeniden başlatın** (Bölüm 11.4).
8. **Bağlantıları doğrulayın** (Bölüm 11.5).
9. **Modeli başlatın**, recipe'sini değiştirmeden; ardından RDMA sayaçlarından (Ek A) her Spark'ın iki ağ arayüzünün de trafik taşıdığını kontrol edin.

200 Gb/s'ye geri dönmek bunun tersidir: modeli durdurun, 2 kollu kabloları geri takın, ters ayarları uygulayın, Spark'ları yeniden başlatın ve doğrulayın.

```
/interface ethernet set [find default-name=qsfp56-dd-3-1] auto-negotiation=no speed=200G-baseCR4 mtu=9000 l2mtu=9500
/interface ethernet set [find default-name=qsfp56-dd-3-5] auto-negotiation=no speed=200G-baseCR4 mtu=9000 l2mtu=9500
/interface ethernet set [find default-name=qsfp56-dd-3-3] auto-negotiation=yes mtu=1500 l2mtu=1584
/interface ethernet set [find default-name=qsfp56-dd-3-7] auto-negotiation=yes mtu=1500 l2mtu=1584
/interface ethernet switch qos port set qsfp56-dd-3-1 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
/interface ethernet switch qos port set qsfp56-dd-3-5 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
/interface ethernet switch qos port set qsfp56-dd-3-3 trust-l3=ignore pfc=disabled
/interface ethernet switch qos port unset qsfp56-dd-3-3 egress-rate-queue3
/interface ethernet switch qos port set qsfp56-dd-3-7 trust-l3=ignore pfc=disabled
/interface ethernet switch qos port unset qsfp56-dd-3-7 egress-rate-queue3
```

Bu, `-3` ve `-7` bağlantılarını fabrika ayarlarına döndürür; bundan sonra switch'in `/export terse` çıktısı, değişiklikten önce alınan dışa aktarımla aynıydı. İki yön de switch'te betik (`/system/script`) olarak kaydedilip tek adımda çalıştırılabilir. Bu şekilde geçiş yapmak tek bir yuvayı değiştirir; yedeği geri yüklemek ise tüm yapılandırmayı değiştirir ve switch'i yeniden başlatır, bu da üzerindeki her Spark'ın bağlantısını birkaç dakika boyunca keser. Her yön yaklaşık 15 dakikalık el işçiliği gerektirdi.

100 Gb/s'de sekiz Spark için aynı ayarlar, her birinde 4 kollu bir kablo bulunan iki yuvaya uygulanır; bu da diğer iki yuvayı sekiz Spark daha için boş bırakır.

### 11.4. Yeniden kablolamadan sonra yeniden başlatma

4 kollu kablo çalışan Spark'lara takıldıktan sonra tüm bağlantılar 100 Gb/s bildirdi ve hiç hata taşımadı; yine de yeni kablodaki her Spark arayüz başına yalnızca yaklaşık 13.4 Gb/s gönderdi. Alma normaldi.

Sınır 1, 4 ya da 8 bağlantıyla (connection), RoCE trafik sınıfıyla ya da onsuz, aynı yuvadaki ya da başka bir yuvadaki bir Spark'a doğru ve switch bağlantısı sabit hıza zorlanmış ya da otomatik anlaşmalı (auto-negotiated) olsa da aynıydı; switch %0–2 CPU yüküyle donanımda iletim yapıyordu ve Spark'larda hiçbir hız sınırı ayarlanmamıştı. Kablonun takıldığı anda dört Spark'ın her birinin çekirdeği (kernel) `mlx5_pcie_event ... Detected insufficient power on the PCIe slot (27W)` mesajını kaydetti; her Spark bu mesajı normalde yalnızca açılışta kaydeder. NVIDIA geliştirici forumundaki herkese açık bir rapor, 4 × 100G breakout kullanan başka bir 8 Spark'lık cluster'da çalışırken değiştirmeden (hot swap) sonra aynı belirtiyi anlatıyor.

Dört Spark'ı yeniden başlatmak tam hızı geri getirdi. Bu yüzden her kablo değişikliğinin, hangi yönde olursa olsun, ardından o kablodaki Spark'lar yeniden başlatılır ya da değişiklik Spark'lar kapalıyken yapılır. 100 ya da 200 Gb/s bildiren ama bir bant genişliği testinde yaklaşık 13 Gb/s taşıyan bir bağlantının ihtiyacı yeni bir kablo değil, yeniden başlatmadır.

### 11.5. Bağlantıları doğrulamak

| Nerede | Neye bakılır |
|---|---|
| Switch, arayüz listesi | kullanılan her bağlantı çalışıyor |
| Switch, `/interface/ethernet/monitor` | `100Gbps`, `fec91`, kablonun parça numarası |
| Switch, log | her bağlantı için `link up (speed 100G, full duplex)` |
| Her Spark, iki arayüzde de `ethtool` | `Speed: 100000Mb/s`, `Lanes: 2` |
| Spark'tan Spark'a, `ping -M do -s 8972` | iki alt ağda da cevap: 9,000 baytlık çerçeveler uçtan uca geçer |
| Spark'tan Spark'a, `ib_write_bw` | yaklaşık 98 Gb/s (Bölüm 12.3); yaklaşık 13 Gb/s, yeniden başlatma gerektiği anlamına gelir |
| Switch, 2. adımdaki dışa aktarımla karşılaştırılan `/export terse` | farklar yalnızca dönüştürülen yuvada |

Testte 9,000 baytlık çerçeveler, iki alt ağda da dört Spark'ın her sıralı çifti arasında geçti; hiçbir CRC, sembol, FEC ya da RoCE yeniden iletim hatası, pause çerçevesi veya switch'te düşürülen paket sayılmadı.

---

## 12. TP4'te Test Tasarımı

### 12.1. Yalnızca bağlantıyı değiştirmek

GLM-5.3 dört Spark'a sığmadığı için gerçek 100 Gb/s bağlantılar GLM-5.3-Flash ile TP4'te ölçüldü. Bölüm 7.1'de olduğu gibi bağlantı hızı iki yapılandırma arasındaki tek farktı: ikisinde de aynı Spark'lar, model, motor, recipe, prompt'lar ve test planı kullanıldı; yalnızca kablo ve tek bir switch yuvasının ayarları değişti.

### 12.2. Kurulum

| Öğe | Değer |
|---|---|
| Sistemler | 4× NVIDIA DGX Spark (GB10, 128 GB birleşik bellek) |
| Switch | MikroTik CRS804: 2 × 200G breakout kabloları (200 Gb/s); tek bir 4 × 100G breakout kablosu (100 Gb/s) |
| Model | GLM-5.3-Flash FP8 (`zai-org/GLM-5.3-Flash`): MoE; gizli boyut 4,096; 45 katman |
| Motor | SGLang 0.5.22.dev7, PyTorch 2.13, NCCL 2.30.7 |
| Paralellik | TP4: 4 Spark'a yayılmış tek bir model örneği |
| Temel ayarlar | 8,192 token'lık prefill parçaları, FP8 KV cache, DFlash ile spekülatif kod çözme (`incoai/GLM-5.3-Flash-DFlash2`, 8 taslak token'lık bloklar), Triton attention, en fazla 8 eşzamanlı istek |
| NCCL | her Spark'ın iki RDMA cihazı, RoCE v2, zorlanmış algoritma yok |

Bölüm 3.3'teki halka formülüyle her prompt token'ı her Spark'a

> (2 × 45 + 1) × 4,096 değer × 2 bayt × 1.5 = **1.12 MB** ağ trafiğine mal olur;

bu, GLM-5.3'ün TP8'deki 3.38 MB'ının üçte biridir: modelin gizli boyutu daha küçük, katman sayısı daha azdır ve TP4'te her Spark all-reduce başına bloğunun 1.75 katı yerine 1.5 katını gönderir. Her prefill all-reduce'u 8,192 × 4,096 değerlik bir bloğu toplar; değer başına 2 bayt ile bu 67 MB eder ve NCCL'in onu halka olarak çalıştırmasına yetecek kadar büyüktür (Bölüm 3.4).

### 12.3. Gerçek 100 Gb/s bağlantı

Yeniden başlatmadan sonra iki Spark arasında RDMA yazma bant genişliği (`ib_write_bw`, 64 KB'lık mesajlar) ve gecikmesi (`ib_write_lat`):

| | 200 Gb/s | Emüle edilmiş 100 Gb/s (Bölüm 7.3) | Gerçek 100 Gb/s |
|---|---|---|---|
| Bant genişliği, tek arayüz | 109 Gb/s | 109 Gb/s | 97.8 Gb/s |
| Bant genişliği, iki arayüz | 191–195 Gb/s | (yalnızca tek arayüz) | 49.0 + 49.0 = 98.0 Gb/s |
| Gecikme, 2 bayt | 2.49 µs | | 2.47 µs |
| Gecikme, 8 KB | 4.78 µs | | 5.02 µs |

Gerçek bir 100 Gb/s bağlantı, tek arayüz de kullanılsa iki arayüz de kullanılsa yaklaşık **98 Gb/s** veri taşır; bu, emüle edilmiş bağlantıdan yaklaşık %10 azdır. Küçük mesajlarda gecikme değişmez; 8 KB'lık bir mesaj 0.24 µs daha uzun sürer, bu da 8 KB'ı yarı bağlantı hızında göndermenin ek süresidir.

B_new = 98 Gb/s alındığında Bölüm 5.1'deki sınır şu hale gelir:

> **ek prefill süresi ≤ prefill baytı × (1/98 − 1/200)**; GLM-5.3-Flash ile TP4 için **1,000 prompt token'ı başına yaklaşık 0.047 s**

| Test | Tahmin, 200 → 98 Gb/s |
|---|---|
| P1: 1K | ≤ +0.05 s |
| P2: 8K | ≤ +0.38 s |
| P3: 32K | ≤ +1.53 s |
| P4: 4 × 8K | ≤ +1.53 s |
| P5: 64K | ≤ +3.05 s |
| P6: 4 × 16K | ≤ +3.05 s |

### 12.4. Test planı ve ölçümler

Test planı, ölçülen büyüklükler ve önlemler Bölüm 7.4–7.6'dakilerle aynıdır: P1'den P6'ya kadar testler, her biri için bir ısınma ve üç ölçüm turu, 1,024 çıktı token'ı, aynı prompt'lar ve isteklerle aynı saatte her milisaniyede kaydedilen tek bir Spark'ın RDMA sayaçları. 200 Gb/s ve 100 Gb/s koşuları art arda iki günde, her biri modelin ayrı bir başlatılmasıyla yapıldı. 200 Gb/s koşusu sırasında bir Spark P5'te güç kaybetti; P5 model yeniden başlatıldıktan sonra ölçüldü ve P6 200 Gb/s'de ölçülmedi.

İki bağlantı hızında da NCCL trafiğini her Spark'ın iki ağ arayüzüne eşit olarak dağıttı (%49.9 ve %50.1).

---

## 13. Sonuçlar: TP4'te 200 Gb/s ve Gerçek 100 Gb/s

### 13.1. Her testteki trafik

Şekil 16–20, her testin üç ölçüm turu sırasında bir Spark'ın gönderdiği trafiği, üstte 200 Gb/s ve altta gerçek 100 Gb/s olmak üzere aynı zaman ekseninde gösteriyor. Gri bant prefill'dir ve ilk token'da biter.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p1-1k-200g-vs-100g.png' | relative_url }}" alt="TP4'te 1K token'lık prompt: 200 Gb/s ve gerçek 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 16: P1, 1K token'lık prompt, 1 istek.</i></sub>

1K'lık bir prompt'ta prefill patlamaları iki bağlantı hızında da yaklaşık 70–80 Gb/s'ye ulaşır; bu, gerçek 100 Gb/s bağlantının taşıyabildiğinin altındadır.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p2-8k-200g-vs-100g.png' | relative_url }}" alt="TP4'te 8K token'lık prompt: 200 Gb/s ve gerçek 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 17: P2, 8K token'lık prompt, 1 istek.</i></sub>

8K'lık bir prompt'ta prefill patlamaları 200 Gb/s'de 200 Gb/s'ye yaklaşır. Gerçek 100 Gb/s bağlantıda aynı patlamalar bağlantının sınırında tutulur ve daha uzun sürer; TTFT 3.09 s'den 3.47 s'ye çıkar. Decode trafiği iki panelde de aynı görünür.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p3-32k-200g-vs-100g.png' | relative_url }}" alt="TP4'te 32K token'lık prompt: 200 Gb/s ve gerçek 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 18: P3, 32K token'lık prompt, 1 istek.</i></sub>

32K'lık prompt aynı örüntüyü daha uzun bir prefill boyunca gösterir; TTFT 26.29 s'den 28.17 s'ye çıkar. Her bağlantı hızındaki turlar 0.2 s içinde birbiriyle uyumludur.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p4-4x8k-200g-vs-100g.png' | relative_url }}" alt="TP4'te aynı anda gelen dört 8K token'lık prompt: 200 Gb/s ve gerçek 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 19: P4, aynı anda gelen dört 8K token'lık prompt.</i></sub>

Dört prompt aynı anda geldiğinde, 200 Gb/s'de birinci ve üçüncü turların prefill'i Spark'ın hiçbir şey göndermediği duraklamalarla kesilir ve son ilk token'a kadar geçen süre turdan tura 11.8 s ile 20.2 s arasında değişir.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p5-64k-200g-vs-100g.png' | relative_url }}" alt="TP4'te 64K token'lık prompt: 200 Gb/s ve gerçek 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 20: P5, 64K token'lık prompt, 1 istek.</i></sub>

64K'lık prompt, P3'ün patlamalarını iki bağlantı hızında da 80 s'den uzun bir prefill boyunca gösterir.

5 ms üzerinden ortalaması alındığında, P2'den itibaren prefill patlamaları 200 Gb/s'de 151–160 Gb/s'ye, gerçek 100 Gb/s bağlantıda ise Bölüm 12.3'te ölçülen sınır olan 97.6–98.0 Gb/s'ye ulaşır. Decode ortalaması iki bağlantı hızında da 0.9–2.3 Gb/s'dir.

### 13.2. Prompt token'ı başına trafik

Ölçülen prefill trafiği Spark başına **prompt token'ı başına 1.14 MB** oldu; bu, Bölüm 12.2'deki 1.12 MB'tan %2 fazladır ve iki bağlantı hızında da aynıydı. Dört Spark aynı miktarı gönderdi: 100 Gb/s koşusunun tamamında her biri 1,294 GB, %0.02 içinde eşit. Ağaç all-reduce'ta dört Spark'tan ikisi diğer ikisinin iki katı kadar gönderirdi (Şekil 4); eşit miktarlar, prefill all-reduce'larının halka olarak çalıştığını doğrular.

### 13.3. TTFT

Üç turun ortalamaları, parantez içinde turlar arasındaki aralıkla; P4 için dört istekten sonuncusunun ilk token'ını alana kadar geçen süre.

| Test | 200 Gb/s | Gerçek 100 Gb/s | Artış |
|---|---|---|---|
| P1: 1K | 0.67 s (0.66–0.67) | 0.74 s (0.70–0.82) | **+0.08 s (+%11.4)** (tahmin: ≤ +0.05 s) |
| P2: 8K | 3.09 s (2.97–3.31) | 3.47 s (3.34–3.62) | **+0.39 s (+%12.6)** (tahmin: ≤ +0.38 s) |
| P3: 32K | 26.29 s (26.27–26.33) | 28.17 s (28.11–28.28) | **+1.88 s (+%7.1)** (tahmin: ≤ +1.53 s) |
| P4: 4 × 8K, son ilk token | 16.05 s (11.80–20.22) | 14.62 s (13.27–17.21) | −1.43 s (tahmin: ≤ +1.53 s) |
| P5: 64K | 86.00 s (85.55–86.44) | 83.43 s (83.17–83.71) | −2.57 s (tahmin: ≤ +3.05 s) |
| P6: 4 × 16K, son ilk token | ölçülmedi | 44.89 s (41.03–48.77) | |

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp4-measured-vs-estimate.png' | relative_url }}" alt="TP4'te gerçek 100 Gb/s'de ek prefill süresi: test başına tahmin ve ölçüm" width="820"/></p>
<sub><i>Şekil 21: TP4'te bağlantı 200'den gerçek 100 Gb/s'ye düştüğünde ek prefill süresi: tahmin (Bölüm 12.3) ve ölçüm.</i></sub>

Tek 8K'lık prompt'ta ölçülen artış tahminin kendisidir: en fazla 0.38 s'ye karşı 0.39 s, yani 1,000 prompt token'ı başına yaklaşık 0.048 s. Modelin mimarisinden, motorun prefill parçası boyutundan ve bağlantı hızından yapılan tahmin bu yüzden, emüle edilmiş bağlantıda TP8'de olduğu gibi, gerçek 100 Gb/s bağlantılarda ve TP4'te de geçerlidir.

Yüzde olarak artış 8K'da %12.6'dan 32K'da %7.1'e düşer. Baytlar prompt'la orantılı büyür, ama bu yapılandırmada prefill süresi daha hızlı büyür (8K'da 3.1 s, 32K'da 26.3 s, 64K'da 86 s); bu yüzden ağ, daha uzun bir prefill'in daha küçük bir payını alır. Bölüm 6.1, hesaplaması prompt'tan daha hızlı büyüyen bir model için bunu anlatır.

### 13.4. Decode hızı

| Test | 200 Gb/s | Gerçek 100 Gb/s | Değişim |
|---|---|---|---|
| P1: 1K | 31.5 token/s | 33.6 token/s | +%6.8 |
| P2: 8K | 23.8 token/s | 24.6 token/s | +%3.4 |
| P3: 32K | 15.6 token/s | 15.1 token/s | −%3.3 |
| P4: 4 × 8K | istek başına 11.4 token/s | istek başına 11.8 token/s | +%3.7 |
| P5: 64K | 12.0 token/s | 12.2 token/s | +%2.2 |

Değişimler iki yöne de işaret ediyor ve turlar arasındaki değişkenliğin içinde kalıyor; bu değişkenlik TP8'dekinden büyüktür, çünkü spekülatif kod çözmenin hızı kaç taslak token'ın kabul edildiğine bağlıdır (200 Gb/s'de P2'nin tek tek turları 21.9 ile 25.8 token/s arasında değişti). Emüle edilmiş bağlantıda olduğu gibi gerçek bağlantıda da decode hızı bağlantı hızına bağlı değildir.

### 13.5. Ölçümün tahminden ayrıldığı yerler

**1K'lık prompt.** Gerçek 100 Gb/s bağlantıda üç turdan ikisi, 200 Gb/s'deki 0.66–0.67 s'ye karşı 0.70–0.71 s sürdü ve tahminin içinde kaldı; üçüncüsü 0.82 s sürdü. Patlamalar iki bağlantı hızında da 100 Gb/s'nin altında kaldığı için (Şekil 16) bağlantı onları yavaşlatmaz; fark turlar arasındaki değişkenliğin içindedir.

**32K'lık prompt.** Artış tahmini 0.35 s, yani TTFT'nin %1.3'ü kadar aşıyor. Her bağlantı hızındaki turlar 0.2 s içinde uyumludur; bu yüzden bu, modelin farklı günlerdeki ayrı başlatmalarını kullanan iki koşu arasındaki gerçek bir farktır.

**Aynı anda gelen dört 8K'lık prompt.** 200 Gb/s'deki turlar, en fazla 1.5 s'lik beklenen etkiye karşı 8.4 s değişti. Şekil 19'daki duraklamalar, Bölüm 8.6'daki gibi, motorun dört prompt'u nasıl zamanladığından kaynaklanır; bu zamanlama turdan tura değişti. Sonuç bağlantı hakkında hiçbir şey söylemez.

**64K'lık prompt.** 200 Gb/s'deki P5, P1–P4'ten farklı bir model başlatmasında ölçüldü ve gerçek 100 Gb/s bağlantıdakinden 2.6 s daha yavaş çıktı. 64K'lık prompt'larda ağ, prefill süresinin yalnızca %3.5'ini oluşturur; bu yüzden başlatmalar arasındaki küçük bir fark bağlantının etkisinden ağır basar.

### 13.6. TP boyutu öngörüsü

Bölüm 10, GLM-5.3'e benzer yapıda bir model için 8K'lık bir prompt'ta TP4'te en fazla %8 öngörmüştü. GLM-5.3-Flash token başına çok daha az hesaplama yapar; bu yüzden ağ, prefill'inin daha büyük bir payını alır: kendi tahmini en fazla %12.4'tür ve %12.6 ölçüldü. Öngörülen değerler GLM-5.3'e aittir; yöntem ise eldeki modelin prompt token'ı başına baytı ve 200 Gb/s'de ölçülmüş tek bir TTFT ile uygulanabilir.

---

## 14. 100 Gb/s Makul mü?

Evet, TP8'e kadar cluster'lar için. 8 Spark'lık bir TP8 cluster'ı 200 Gb/s'den 100 Gb/s bağlantılara geçirildiğinde:

> **İlk token çok uzun bir prompt'ta en fazla yaklaşık %20, birkaç çok uzun prompt aynı anda geldiğinde en fazla yaklaşık %30 daha geç gelir. Kısa ve orta uzunluktaki prompt'larda değişiklik olmaz. Cevap bir kez başladığında aynı hızda akar.**

| İş yükü | Ölçülen (emüle edilmiş 100 Gb/s) | Gerçek 100 Gb/s kablo, en fazla |
|---|---|---|
| Kısa ve orta uzunlukta prompt'lu sohbet (1K token civarı) | ölçülebilir fark yok | yaklaşık +%4 |
| Çok uzun bir prompt: RAG, uzun belgeler (8K–64K token) | TTFT +%12.6–13.9 | TTFT +%18 (1,000 prompt token'ı başına en fazla 0.14 s) |
| Aynı anda gelen birkaç çok uzun prompt | istek başına TTFT +%17.9–22.5 | istek başına TTFT +%28 |
| Her durumda decode hızı | değişmiyor | değişmiyor |

Bunlar ölçülen durumlar için üst sınırlardır; karma bir iş yükünde isteklerin çoğu daha kısadır ya da tek başına gelir ve daha az etkilenir. TP4'te gerçek 100 Gb/s bağlantılarda (Bölüm 13) ilk token'a kadar geçen ek süre aynı tahmini izledi ve decode hızı değişmedi. Belirli bir iş yükü için cevabı, herhangi bir kablo alınmadan önce, mevcut cluster'da Bölüm 7.3'teki emüle edilmiş bağlantı verir.

100 Gb/s'de, her dört Spark için bir 4 × 100G breakout kablosuyla (Bölüm 11), bir **CRS812**, tek bir TP8 cluster'a yetecek kadar, 8 Spark bağlar; bedeli, yukarıda anlatılan uzun prompt'larda ilk token için daha uzun beklemedir; cevabın akış hızı değişmez.

TP4'te dört Spark, tek bir switch yuvasındaki bir 4 × 100G breakout kablosunu paylaşır (Bölüm 11). GLM-5.3-Flash ile 8K token'lık bir prompt'un ilk token'ı gerçek 100 Gb/s bağlantılarda, tahminin öngördüğü gibi %12.6 daha geç geldi ve decode hızı değişmedi (Bölüm 13).

100 Gb/s'de bir **CRS804** 16 Spark bağlar. İki TP8 cluster olarak çalıştırıldığında her biri bu çalışmada ölçülen Spark başına bağlantıyı görür; bu yüzden yukarıdaki sonuçlar her birine uygulanır, yeter ki switch tüm portlarda aynı anda tam hızda trafik iletebilsin (doğrulanmalıdır). Tek bir TP16 cluster kaybı kabaca ikiye katlar (Bölüm 10) ve 100 Gb/s'de önerilmez.

Sıkı TTFT hedefleri olan uzun prompt'ların iş yüküne hâkim olduğu, çok sayıda kullanıcının aynı anda uzun prompt gönderdiği ya da bir modelin sekizden fazla Spark'a yayılması gereken durumlarda 200 Gb/s daha iyi seçim olmaya devam eder.

---

## 15. Sınırlar ve Dikkat Edilmesi Gerekenler

Ölçümler, her biri tek bir TP boyutunda olmak üzere iki modeli ve çıkarım motorunu kapsar: TP8'de vLLM ile GLM-5.3 ve TP4'te SGLang ile GLM-5.3-Flash. Başka modeller, motorlar ve ayarlar farklı miktarda veri gönderir ve farklı hızlarda hesap yapar; tahmin yöntemi uygulanabilir, ama sayıların yeniden hesaplanması gerekir. TP8'de 100 Gb/s durumu tek bir ağ arayüzüyle emüle edildi; Bölüm 9, yalnızca TP4'te ölçülen gerçek bir bağlantıyla farkı sınırlar. Bölüm 10'daki TP boyutu öngörüsü bir ölçüm değil, bir hesaptır.

4 × 100G breakout, FS QDD-400G-4QPC02 kablolarıyla bir CRS804 üzerinde doğrulandı. Başka bir switch ya da kabloyla, switch'in planlanan yapılandırmada QSFP-DD portlarında 4 × 100G breakout'u desteklediğini ve DGX Spark'ın ConnectX-7'sinin seçilen breakout kablosuyla 100 Gb/s'de bağlantı kurduğunu doğrulayın. 16 Spark için switch'in tüm portlarda aynı anda tam hızda trafik iletebildiğini doğrulayın.

### Cluster ağını boyutlandırırken yaygın hatalar

- ✗ **Yanlış sayaçları okumak:** standart Linux araçları (`ip -s link`, `nload`, `sar`) RDMA trafiğini görmez; bu yüzden çıkarım sırasında neredeyse boşta bir bağlantı gösterir.
- ✗ **Bağlantı kullanımını ortalamalardan değerlendirmek:** bir saniyelik ya da switch portu ortalamaları, TTFT'yi belirleyen milisaniyelik patlamaları gizler.
- ✗ **Yarı bağlantı hızının yarı çıkarım hızı demek olduğunu varsaymak:** yalnızca prefill sırasındaki patlamalar yavaşlar; decode yavaşlamaz.
- ✗ **100 Gb/s'de bir modeli gerekenden fazla Spark'a yaymak:** kayıp TP boyutuyla büyür.
- ✗ **Çalışan Spark'ları yeniden başlatmadan yeniden kablolamak:** bağlantılar doğru hızda kurulur ama yalnızca yaklaşık 13 Gb/s gönderebilir.

### Bir DGX Spark cluster ağı planlamak için kontrol listesi

- ☐ Model örneği başına TP boyutu belirlendi mi (TP4, TP8 ya da 16 Spark'ta iki TP8 örneği)?
- ☐ Beklenen prompt uzunluğu biliniyor mu (sohbet, RAG, uzun belgeler)?
- ☐ Uzun prompt'lar için bir TTFT hedefi var mı?
- ☐ 100 Gb/s kaybı tahmin edildi mi (prompt token'ı başına bayt × prompt token'ı ÷ 200 Gb/s, Bölüm 5)?
- ☐ İş yükü emüle edilmiş 100 Gb/s bağlantıda (Bölüm 7.3) çalıştırıldı mı ve gerçek bir bağlantıya dönüştürülen sonuç (Bölüm 9) kabul edilebilir mi?
- ☐ Breakout desteği ve ConnectX-7'nin planlanan hızda bağlantı kurması doğrulandı mı?
- ☐ Spark'lar yeniden kablolamadan sonra yeniden başlatıldı mı ve `ib_write_bw` 100 Gb/s bağlantı başına yaklaşık 98 Gb/s gösteriyor mu?
- ☐ RDMA trafiği, milisaniye çözünürlüğünde RDMA sayaçlarıyla izleniyor mu?

---

## 16. Sonuç

DGX Spark sistemleri üzerinde tensör paralel çıkarım ağı çok farklı iki biçimde kullanır. Bir prompt işlenirken her all-reduce Spark başına halka olarak onlarca megabayt gönderir; bu, 200 Gb/s'lik bir bağlantıyı bir seferde birkaç milisaniye dolduran patlamalar halinde olur. Cevap üretilirken all-reduce'lar birkaç yüz kilobayt ya da daha azdır ve trafik 100 Gb/s'nin çok altında kalır. Bağlantı hızını yarıya indirmek bu yüzden decode hızını değiştirmez ve ilk token için beklemeye öngörülebilir bir miktar ekler.

Bu miktar yalnızca modelin mimarisinden, motorun prefill parçası boyutundan ve bağlantı hızından tahmin edilebilir: GLM-5.3 ile TP8 için 100 Gb/s'de 1,000 prompt token'ı başına en fazla 0.135 s. Emüle edilmiş 100 Gb/s bağlantılı 8 Spark üzerinde ölçüldüğünde, 8K–64K token'lık tekil prompt'lar ilk token'larına %12.6–13.9 daha geç ulaştı, tahmine yakın; başka uzun prompt'larla birlikte gelen istekler %17.9–22.5 daha geç; kısa prompt'lar ve decode hızı etkilenmedi. Yaklaşık 98 Gb/s taşıyan gerçek bir 100 Gb/s bağlantı buna en fazla 3–4 puan daha ekler. GLM-5.3-Flash ile TP4'te gerçek 100 Gb/s bağlantılarda ölçüldüğünde, ilk token'a kadar geçen ek süre aynı tahmini izledi ve decode hızı yine değişmedi.

100 Gb/s bağlantılı 8 Spark'lık bir TP8 cluster için **ilk token'ın çok uzun bir prompt'ta en fazla yaklaşık %20, birkaç çok uzun prompt birlikte geldiğinde en fazla yaklaşık %30 daha geç gelmesi; kısa ve orta uzunluktaki prompt'larda değişiklik olmaması ve cevabın akış hızında değişiklik olmaması beklenmelidir.** Kayıp TP boyutuyla büyüdüğü için 100 Gb/s'de 16 Spark en iyi iki TP8 cluster olarak çalıştırılır. Başka herhangi bir iş yükü için aynı karşılaştırma, kablo almadan önce mevcut bir 200 Gb/s cluster'da, Spark başına tek bir ağ arayüzüyle 100 Gb/s emüle edilerek ve sonuç gerçek bir bağlantıya dönüştürülerek yapılabilir.

---

## Ek A: RDMA Trafiğini Ölçmek

RDMA işletim sisteminin ağ yığınını atladığı için olağan arayüz istatistikleri onu saymaz. Bu çalışmadaki trafik, iki RDMA cihazının her biri için ConnectX-7'nin RDMA port sayaçlarından (`/sys/class/infiniband/` altında `port_xmit_data` ve `port_rcv_data`, 4 baytlık birimlerle) okundu ve port için toplandı. Adaptörün kendi bayt sayaçlarıyla yapılan çapraz kontrol %0.2 içinde uyuştu.

Küçük bir örnekleyici sayaçları tek bir Spark'ta her 1 ms'de okudu ve her okumayı, benchmark'ın istekleri için kullandığı saatle aynı saatte, tek tek zaman damgaladı. 1 ms ve daha uzun aralıklardaki hızlar, her örnekleme aralığının baytları kapsadığı ortalama alma aralıklarına yayılarak hesaplandı. Bayt sayıları kesindir, ancak her okumanın zamanı yalnızca yaklaşık ±0.1–0.2 ms hassasiyetle bilinir; bu yüzden tek bir 1 ms değerinin belirsizliği yaklaşık ±%15–25'tir. Şekillerdeki bazı 1 ms değerlerinin bağlantı hızının biraz üzerinde görünmesinin nedeni budur. 5 ms ve daha uzun aralıklardaki ortalamalar birkaç yüzde içinde doğrudur.

Bölüm 8.1'in gösterdiği gibi, ortalama alma aralığının seçimi bir ölçümün raporladığı en yüksek değeri değiştirir: aynı trafik 1 ms aralıklarla 181 Gb/s'de, 5 ms aralıklarla 96 Gb/s'de ve 100 ms aralıklarla 44 Gb/s'de tepe yapar; ortalaması ise hepsinde aynıdır. Bir tepe değeri ancak ortalama alma aralığıyla birlikte anlamlıdır.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/window-choice.png' | relative_url }}" alt="1 ms, 5 ms ve 100 ms aralıklarla ortalaması alınmış aynı 8K prefill trafiği" width="820"/></p>
<sub><i>Şekil A1: 1 ms, 5 ms ve 100 ms aralıklarla ortalaması alınmış aynı prefill trafiği.</i></sub>

Ölçümün kendisi ağı etkilemedi: örnekleyici çalışırken ve dururken yapılan bant genişliği (bandwidth) ve gecikme testleri (`ib_write_bw`, `ib_write_lat`) aynı bant genişliğini (109.07, 109.08 ve 109.15 Gb/s) ve gecikmede en fazla yaklaşık %1 fark gösterdi. Örnekleyici ve benchmark sürücüsü birlikte Spark'ın 20 CPU çekirdeğinden birinin çok altında kullandı.

---

## Ek B: Tekrarlanabilirlik

| Öğe | Değer |
|---|---|
| Test sürücüsü | test isteklerini motora akış (streaming) istekleri olarak gönderir, her cevabın ilk token'ını ve ardından gelen her token'ı zaman damgalar ve RDMA sayaçlarını aynı saatte yanında kaydeder (Bölüm 7.4–7.6, Ek A) |
| Model | `Inferact/GLM-5.3-NVFP4` |
| Motor | vLLM `0.1.dev20133+gb5f995e73`, container `vllm-node-b12x`, NCCL 2.31.2 |
| Servis ayarları | `--tensor-parallel-size 8`, `--max-num-batched-tokens 4096`, `--long-prefill-token-threshold 2048`, `--max-num-seqs 8`, `--max-model-len 262144`, `--kv-cache-dtype fp8`, `--gpu-memory-utilization 0.726`, `--enable-chunked-prefill`, `--enable-prefix-caching`; spekülatif kod çözme: MTP, 4 token, taslak bölünmez |
| NCCL | iki RDMA cihazıyla `NCCL_IB_HCA` (200 Gb/s); ikinci cihaz dışarıda (100 Gb/s emülasyonu); RoCE v2, GID indeksi 3 |
| Plan | P1–P6 testleri (Bölüm 7.4), 1 ısınma ve 3 ölçüm turu, sabit tohum, 1,024 çıktı token'ı |

III. Kısım'daki TP4 ölçümleri için:

| Öğe | Değer |
|---|---|
| Model | `zai-org/GLM-5.3-Flash` (FP8), spekülatif taslak `incoai/GLM-5.3-Flash-DFlash2` |
| Motor | #36708 numaralı pull request ile SGLang 0.5.22.dev7, PyTorch 2.13, NCCL 2.30.7 |
| Servis ayarları | `--tp-size 4`, `--chunked-prefill-size 8192`, `--max-running-requests 8`, `--context-length 262144`, `--kv-cache-dtype fp8_e4m3`, `--mem-fraction-static 0.8`, `--attention-backend triton`; spekülatif kod çözme: `--speculative-algorithm DFLASH`, blok başına 8 taslak token |
| NCCL | iki RDMA cihazıyla `NCCL_IB_HCA`; RoCE v2, trafik sınıfı 106 |
| Ağ | 200 Gb/s: FS QDD-400G-2QPC01 (2 × 200G); 100 Gb/s: FS QDD-400G-4QPC02 (4 × 100G); MikroTik CRS804, RouterOS 7.24.4 |
| Plan | yukarıdaki gibi |

---

## Sözlük (Terimler)

- **Aktivasyonlar:** Her token'ı modelin katmanlarından geçerken temsil eden vektörler.
- **All-reduce:** Her cihazda parçalar halinde tutulan veriyi toplayan ve her cihaza toplamın tamamını veren kolektif işlem.
- **Bant genişliğiyle sınırlı / gecikmeyle sınırlı:** Bir aktarımın süresi bağlantının baytları ne kadar hızlı taşıdığıyla belirleniyorsa bant genişliğiyle sınırlıdır (büyük aktarımlar), sabit gecikmelerle belirleniyorsa gecikmeyle sınırlıdır (küçük aktarımlar).
- **Breakout kablosu:** Hızlı bir switch portunu (örneğin 400 Gb/s) birkaç daha yavaş bağlantıya (örneğin 4 × 100 Gb/s) bölen kablo.
- **ConnectX-7:** DGX Spark'a yerleşik NVIDIA ağ adaptörü.
- **Decode:** Cevabı, her seferinde bir ileri yayılımla üreten aşama.
- **FEC (forward error correction, ileri hata düzeltme):** Alıcının bit hatalarını düzeltebilmesi için bir bağlantıda veriye eklenen fazlalık bilgi.
- **Decode hızı:** Cevabın ne kadar hızlı aktığı: ilk token'dan sonra saniye başına çıktı token'ı.
- **Emülasyon:** Bir koşulu (burada 100 Gb/s'lik bir bağlantıyı) yazılımda modellemek yerine gerçek donanım üzerinde yeniden üretmek.
- **İleri yayılım:** Modelin katmanlarının o anda işlenen token'lar üzerinde bir kez çalıştırılması.
- **Gizli boyut:** Model içinde her token'ı temsil eden vektörün uzunluğu (GLM-5.3 için 6,144).
- **MTP (multi-token prediction, çok token'lı tahmin):** Modelin birkaç token taslağı çıkardığı ve bunların tek bir ileri yayılımda kontrol edildiği bir spekülatif kod çözme biçimi.
- **NCCL:** NVIDIA'nın GPU'lar arası iletişim kütüphanesi; çıkarım motoru all-reduce için bunu kullanır.
- **Ağ arayüzü:** İşletim sisteminin bir ağ adaptörü bağlantısından gördüğü şey; burada her ConnectX-7 portu, her PCIe bağlantısı için bir tane olmak üzere iki arayüz olarak görünür.
- **Prefill süresindeki ağ payı:** Prefill baytlarını 200 Gb/s'de göndermek için gereken sürenin prefill süresine bölümü.
- **Nominal bağlantı hızı:** Bir bağlantının protokol ek yükünden önceki anma hızı (burada 200 Gb/s).
- **NVFP4:** NVIDIA'nın 4 bitlik kayan nokta sayı formatı; her 16 değerlik grup bir ölçekleme faktörünü paylaşır.
- **Prefill:** İlk çıktı token'ından önce prompt'u işleyen aşama.
- **QoS (quality of service, hizmet kalitesi):** Trafiği sınıflara ayıran ve her sınıfa farklı davranan switch ayarları; burada RoCE trafiğini kendi sınıfında tutar.
- **Prefill parçası:** Bir prompt'un tek bir ileri yayılımda işlenen kısmı (burada en fazla 4,096 token).
- **RDMA:** Remote direct memory access (uzak doğrudan bellek erişimi): ağ adaptörü uygulama belleğini doğrudan okur ve yazar; veri işletim sisteminin ağ yığınından geçmez.
- **Halka all-reduce:** Cihazların verinin segmentlerini bir halka etrafında aktardığı all-reduce; her cihaz toplamda verinin 2 × (N − 1) / N katını gönderir.
- **RoCE v2:** RDMA over Converged Ethernet, sürüm 2: standart Ethernet üzerinde UDP/IP içinde taşınan RDMA paketleri.
- **Tensör paralelliği (TP):** Bir modelin her ağırlık matrisini, her adımdan sonra kısmi sonuçlarını birleştiren birkaç cihaza bölmek.
- **Ağaç all-reduce:** Kısmi toplamların bir cihaz ağacında köke doğru yukarı aktığı ve sonucun geri aşağı aktığı all-reduce; sabit gecikmeleri log₂ N ile büyür, ama cihazlar farklı miktarlar gönderir. NCCL, her biri verinin yarısını taşıyan iki böyle ağaç kullanır (çift ikili ağaç).
- **TTFT (time to first token, ilk token süresi):** Bir isteğin gönderilmesinden cevabın ilk token'ının alınmasına kadar geçen süre.

---

## Kaynaklar

**Donanım:**

- NVIDIA DGX Spark — <https://www.nvidia.com/en-us/products/workstations/dgx-spark/>
- NVIDIA ConnectX-7 adaptör dokümantasyonu — <https://docs.nvidia.com/networking/display/connectx7vpi/introduction>
- MikroTik CRS804 DDQ — <https://mikrotik.com/product/crs804_ddq>
- MikroTik CRS812 DDQ — <https://mikrotik.com/product/crs812_ddq>

**Model ve yazılım:**

- GLM-5.3 NVFP4 checkpoint'i — <https://huggingface.co/Inferact/GLM-5.3-NVFP4>
- GLM-5.3-Flash — <https://huggingface.co/zai-org/GLM-5.3-Flash>
- vLLM — <https://github.com/vllm-project/vllm>
- SGLang — <https://github.com/sgl-project/sglang>
- NCCL — <https://github.com/NVIDIA/nccl>
- perftest (`ib_write_bw`, `ib_write_lat`) — <https://github.com/linux-rdma/perftest>

**All-reduce algoritmaları:**

- NCCL ortam değişkenleri (`NCCL_ALGO`, `NCCL_DEBUG_SUBSYS`) — <https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/env.html>
- Massively Scale Your Deep Learning Training with NCCL 2.4 (çift ikili ağaçlar) — <https://developer.nvidia.com/blog/massively-scale-deep-learning-training-nccl-2-4/>
- Understanding NCCL Tuning to Accelerate GPU-to-GPU Communication — <https://developer.nvidia.com/blog/understanding-nccl-tuning-to-accelerate-gpu-to-gpu-communication>
- Demystifying NCCL: An In-depth Analysis of GPU Communication Protocols and Algorithms — <https://arxiv.org/abs/2507.04786>
- Patarasuk & Yuan, Bandwidth Optimal All-reduce Algorithms for Clusters of Workstations — <https://www.cs.fsu.edu/~xyuan/paper/09jpdc.pdf>

**İlgili çalışmalar:**

- [DGX Spark 8-Node AI Cluster Kurulum Rehberi]({{ '/papers/dgx-spark-8node-cluster-setup/' | relative_url }})
- [Qwen3.6-27B DGX Spark Cluster Scaling]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/' | relative_url }})
- [Yerel LLM Kullanım Rehberi]({{ '/papers/local-llm-guide/' | relative_url }})

---

### Notlar

- **Tahminler:** Bölüm 3–6 yalnızca modelin yapılandırmasını, motorun ayarlarını ve bağlantı hızını kullanır; sınırlar üst sınırlardır. TP boyutu öngörüsü (Bölüm 10) ölçülen TP8 temel değerini kullanır ve açıklayıcıdır.
- **Ölçümler:** Tüm performans değerleri, Bölüm 7'de anlatıldığı gibi GLM-5.3 ile TP8'de 8× DGX Spark üzerinde ve Bölüm 12'de anlatıldığı gibi GLM-5.3-Flash ile TP4'te 4× DGX Spark üzerinde ölçüldü; ağ trafiği tek bir Spark'ın ConnectX-7 RDMA sayaçlarından okundu (Ek A).
- **Emülasyon:** TP8'de 100 Gb/s, mevcut kablolar üzerinde, iletişim her ConnectX-7 portunun iki ağ arayüzünden en fazla 109 Gb/s taşıyan birine sınırlanarak emüle edildi; Bölüm 9 sonuçları 98 Gb/s taşıyan gerçek bir 100G kabloya dönüştürür. TP4'te gerçek 100G kablolar kullanıldı.
- **Güncellik:** Motor sürümleri ve ayarları hızla değişir; sonuçlar Ekim 2026 itibarıyla listelenen sürümler için geçerlidir.

---

{% include company/block.html name="cta_logo" %}

**DGX Spark cluster ağınızı birlikte planlayalım.** Model boyutunu, tensör paralelliğini ve bağlantı hızını hesaba katan bir boyutlandırma için {% include company/block.html name="contact_cta" %}
