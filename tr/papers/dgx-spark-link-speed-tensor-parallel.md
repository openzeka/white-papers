---
title: DGX Spark'lar Üzerinde Tensör Paralel Çıkarım İçin Ağ Bağlantı Hızı (200G ve 100G)
parent: White Papers
nav_order: 12
lang: tr
page_id: dgx-spark-link-speed-tensor-parallel
date: 2026-10-15
card_tag: "Teknik Rehber"
description: >-
  Tensör paralelliği kullanan bir DGX Spark cluster'ı ne kadar bant genişliği kullanır?
  Spark başına bağlantı hızını 200G'den 100G'ye düşürmek çıkarımı nasıl etkiler?
  Bu çalışma ağ trafiğinin kaynağını açıklar ve model mimarisinden elde edilen tahmini GLM-5.3 ile TP8'de, GLM-5.3-Flash ile
  TP4'te gerçek 100G bağlantılarda yapılan ölçümlerle karşılaştırır.
permalink: /papers/dgx-spark-link-speed-tensor-parallel/
last_modified_date: 2026-11-23
toc: true
---

> **Yayın tarihi:** Ekim 2026
> **Kapsam:** Tensör paralelliği (tensor parallelism, TP) kullanan bir model, çıkarım (inference) sırasında DGX Spark sistemleri arasında hangi verileri aktarır? Model mimarisinden ve çıkarım motorunun ayarlarından yola çıkarak bağlantı hızını yarıya indirmenin etkisini hesaplıyoruz. GLM-5.3 ile TP8'de 8× DGX Spark üzerinde 200 Gb/s bağlantıyı emüle edilmiş 100 Gb/s bağlantıyla karşılaştırıyoruz. GLM-5.3-Flash ile TP4'te ise 4× DGX Spark üzerinde hem 200 Gb/s hem de 100 Gb/s için gerçek bağlantılarda ölçüm yapıyoruz.
> **Not:** Ölçüm sonuçları Bölüm 7 ve 12'de belirtilen model, motor, sürüm ve ayarlara özgüdür. Başka modeller ve ayarlar için Bölüm 3–6'daki yöntemle yeniden tahmin yapabilirsiniz.

{% include company/block.html name="prepared_by" %}

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## Yönetici Özeti

- **Switch kapasitesi.** CRS812'nin iki 400G portuna Spark başına 200 Gb/s hızda 4 Spark, 100 Gb/s hızda 8 Spark bağlanır. CRS804 için aynı iki hızda bu sayılar sırasıyla 8 ve 16'dır. Peki bağlantı hızını düşürünce kullanıcı yanıt için ne kadar daha bekler?
- **Tensör paralelliğinde ağ trafiği.** Sekiz Spark'lı yapılandırmada her Spark, bölünen ağırlıkların sekizde birini belleğinde tutar ve her katmanın çıktısına kısmi katkıda bulunur. Spark'lar her katmanda iki kez *all-reduce* işlemiyle kısmi sonuçlarını ağ üzerinden toplar. Tahminde, büyük aktarımlar için *halka* (ring) algoritması esas alınır. Prompt işlenirken (*prefill*) her all-reduce büyük miktarda veri taşır. Yanıt üretilirken (*decode*) aynı işlemde taşınan veri küçüktür.
- **Tahmin.** Prefill sırasında büyük aktarımlar bağlantının tüm bant genişliğini (bandwidth) kullanabilir. Bağlantı hızı yarıya inince bu aktarımlar uzar ve ilk token daha geç gelir. GLM-5.3'ün mimarisine göre TP8'de 100 Gb/s'ye geçiş, **ilk token'a kadar geçen süreyi (time to first token, TTFT) 1,000 prompt token'ı başına en fazla 0.135 s uzatır**. Decode sırasında aktarımlar küçüktür. Bu testlerde bağlantı hızını yarıya indirmenin yanıtın üretim hızına ölçülebilir bir etkisi olmadı.
- **Anlık trafik ve ortalama trafik.** Prefill sırasında trafik birkaç milisaniye süren patlamalarda 150–200 Gb/s'ye ulaşır. Örnek uzun prompt'ta bir saniyelik ortalamaların en yükseği yaklaşık 40 Gb/s'dir. Decode sırasında ortalama trafik birkaç Gb/s düzeyindedir.
- **TP8 ölçümleri.** GLM-5.3 ile 200 Gb/s bağlantıyı, en fazla 109 Gb/s taşıyan emüle edilmiş 100 Gb/s bağlantıyla karşılaştırdık.
  - **Decode hızı pratikte değişmedi.** Testler arasındaki en düşük ve en yüksek değişim −%2.3 ve +%4.3 oldu.
  - Tek başına gönderilen 8K–64K token'lık prompt'larda **TTFT %12.6–13.9 arttı**. Bu, **1,000 prompt token'ı başına yaklaşık 0.11 s** ek bekleme demektir ve tahmine yakındır.
  - **Dört uzun prompt aynı anda geldiğinde** istek başına ortalama TTFT **%17.9–22.5 arttı**.
  - **Kısa prompt'larda belirgin bir etki görülmedi** (1K token'da +%1).
- **Kabloyu değiştirmeden önce deneyin.** Mevcut 200 Gb/s kablolarla NCCL'i her Spark'ta tek ağ arayüzü (network interface) kullanacak şekilde ayarlayın. Aynı iş yükünü iki ayarda da çalıştırın. Prefill sırasında ölçtüğünüz veri miktarından gerçek bağlantının getireceği ek gecikmeyi hesaplayabilirsiniz.
- **Gerçek bağlantı için öngörü.** Ölçülen yaklaşık 98 Gb/s veri aktarım hızıyla, istekler benzer biçimde zamanlanırsa TP8'de tek bir uzun prompt için TTFT artışının en fazla yaklaşık %18 olması beklenir. Dört uzun prompt birlikte geldiğinde istek başına ortalama TTFT için bu sınır yaklaşık %28'dir.
- **Gerçek 100 Gb/s bağlantılarda TP4 ölçümü.** GLM-5.3-Flash'ı 4 Spark'ta çalıştırdığımızda 8K token'lık tek bir prompt'un ilk token'ı 0.39 s daha geç geldi. Tahmin en fazla 0.38 s idi. Decode hızı değişmedi. Dört Spark aynı breakout kablosuna bağlanır. Yalnızca kablonun takıldığı switch yuvasının ayarları değişir. Kabloyu değiştirdikten sonra Spark'ları yeniden başlatın.
- **Sonuç.** Uzun prompt'larda ilk token için ek bekleme süresi kabul edilebiliyorsa DGX Spark üzerinde TP8'e kadar tensör paralel çıkarımda 100 Gb/s kullanılabilir. Yanıt başladıktan sonra token'lar aynı hızda gelir. TP8'de kısa prompt için ölçülebilir bir yavaşlama görülmedi. TP4'te model mimarisinden hesaplanan ek bekleme süresi ile gerçek bağlantıda 8K prompt için ölçülen süre arasındaki fark yalnızca 0.01 s idi. 16 Spark için iki TP8 cluster kurun ve switch'in tüm portlardan aynı anda tam hızda trafik iletebildiğini doğrulayın.

---

## 1. Giriş

Bir DGX Spark'ta 128 GB birleşik bellek (unified memory) bulunur. Bu belleğe sığmayan modeller birkaç Spark'a paylaştırılabilir. Spark'lar birbirine ConnectX-7 ağ adaptörleri ve bir switch üzerinden bağlanır. **Tensör paralelliğinde** her katmanın hesabı Spark'lara bölünür. Dolayısıyla Spark'lar işlenen her token için defalarca veri alışverişi yapar ve çıkarımın her adımında bu aktarımı bekler.

Bu nedenle switch seçimi cluster tasarımını etkiler. Spark başına 200 Gb/s yerine 100 Gb/s kullanırsanız aynı cluster'ı daha küçük bir switch'e bağlayabilir veya her breakout yuvasına iki kat fazla Spark takabilirsiniz. Bunun uygun olup olmadığı, bağlantı hızındaki düşüşün tensör paralel çıkarımı ne kadar yavaşlattığına bağlıdır.

I. Kısım (Bölüm 2–6), tensör paralelliğinde ağdan hangi verilerin geçtiğini ve prompt işlenirken oluşan trafiğin yanıt üretilirken neden değiştiğini açıklar. Bağlantı hızını yarıya indirmenin etkisini tahmin etmek için modelin mimarisi, motor ayarları ve bağlantı hızı yeterlidir. II. Kısım'da (Bölüm 7–10) yeni kablo almadan önce aynı iş yükünü mevcut 200 Gb/s kablolarla 100 Gb/s'de deniyoruz. GLM-5.3'ü 8× DGX Spark üzerinde TP8 ile çalıştırıyor, 100 Gb/s emülasyonunun sonuçlarını tahminle karşılaştırıyor ve gerçek 100 Gb/s kabloda beklenen gecikmeyi hesaplıyoruz. Emülasyondaki sonuç uygunsa sıradaki adım gerçek bağlantıdır. III. Kısım'da (Bölüm 11–13) 4 Spark'ı gerçek 100 Gb/s bağlantılarla kuruyor ve GLM-5.3-Flash'ı TP4'te ölçüyoruz. Bölüm 14, 4, 8 ve 16 Spark için bağlantı hızı seçimini ele alır.

---

# I. Kısım: Teori

## 2. DGX Spark Ağı

### 2.1. ConnectX-7 adaptörü ve iki PCIe bağlantısı

Her DGX Spark'ta iki QSFP portlu bir ConnectX-7 ağ adaptörü vardır. Test cluster'larında her Spark switch'e tek porttan bağlanır. Bu portun nominal bağlantı hızı 200 Gb/s'dir.

Adaptör, GB10 yongasına her biri dört hatlı (×4) iki ayrı PCIe Gen5 bağlantısıyla erişir. Tek ×4 bağlantı 100 Gb/s'nin biraz üzerinde veri taşır (Bölüm 7.3). 200 Gb/s'lik portun tam kapasitesine ulaşmak için iki bağlantı gerekir. Linux adaptörü her PCIe bağlantısında ayrı gördüğünden tek fiziksel port iki ağ arayüzü olarak görünür (`enp1s0f1np1` ve `enP2p1s0f1np1`). Her arayüzün kendi RDMA cihazı vardır. Aynı fiziksel portu kullanan iki arayüz de 200 Gb/s hız bildirir. Ancak her birinin aktarım hızını kendi PCIe bağlantısı sınırlar.

Çıkarım motoru, Spark'lar arası iletişim için NCCL kütüphanesini kullanır. NCCL iki RDMA cihazını ayrı ağ yolları olarak görür ve trafiği ikisine dağıtır. Port ancak iki yol birlikte kullanıldığında 200 Gb/s'ye ulaşır. Bu düzen sayesinde donanımı değiştirmeden 100 Gb/s denenebilir. NCCL tek arayüzle çalıştırıldığında her Spark'ın aktarım hızı bir PCIe bağlantısının kapasitesiyle sınırlanır. Bu değer, gerçek bir 100 Gb/s bağlantının taşıdığı trafiğe yakındır (Bölüm 7.3).

Spark'lar arasında RDMA (remote direct memory access, uzaktan doğrudan bellek erişimi) kullanılır. Ağ adaptörü veriyi gönderen uygulamanın belleğinden okuyup doğrudan alıcı uygulamanın belleğine yazar. Veri işletim sisteminin ağ yığınından geçmediği için aktarım gecikmesi düşük kalır ve standart Linux ağ istatistikleri bu trafiği göstermez (Ek A). Burada RDMA, standart Ethernet üzerinde RoCE v2 (RDMA over Converged Ethernet, sürüm 2) ile çalışır. Bu protokol, RDMA paketlerini UDP/IP içinde taşır.

### 2.2. Bağlantı, sistemdeki en yavaş yoldur

200 Gb/s, 25 GB/s'ye karşılık gelir. DGX Spark kendi belleğini 273 GB/s hızla, yani yaklaşık 11 kat daha hızlı okur. Bu yüzden bağlantı hızının etkisini anlamak için hem Spark'lar arasında kaç bayt taşındığına hem de aktarımın ne zaman yapıldığına bakmak gerekir.

### 2.3. Switch'ler ve breakout seçenekleri

CRS812'de iki 400G QSFP-DD portu ve iki ayrı 200G QSFP56 portu bulunur. CRS804'te dört 400G QSFP-DD portu vardır. Tablo, her 400G portuna bir breakout kablosu, kablonun her koluna da bir Spark bağlandığında switch'e toplam kaç Spark bağlanabildiğini gösterir.

| Switch | Switch üzerindeki 400G port sayısı | Her porta 2 × 200G breakout kablosuyla bağlanan toplam Spark sayısı | Her porta 4 × 100G breakout kablosuyla bağlanan toplam Spark sayısı |
|---|---|---|---|
| MikroTik CRS812 | 2 | **4** | **8** |
| MikroTik CRS804 | 4 | **8** | **16** |

CRS812 ile Spark başına 200 Gb/s hızda bir TP4 cluster kurmak için iki 400G portunun her birine bir 2 × 200G breakout kablosu takılır. Her kabloya iki Spark bağlanır. Her portta bir 4 × 100G kablo kullanılırsa aynı switch'e Spark başına 100 Gb/s hızda sekiz Spark bağlanabilir.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/network-topology.png' | relative_url }}" alt="100 Gb/s'de 8 Spark'lı CRS812, 200 Gb/s'de 8 Spark'lı ve 100 Gb/s'de 16 Spark'lı CRS804" width="820"/></p>
<sub><i>Şekil 1: Breakout seçenekleri, her DGX Spark için bir bağlantı.</i></sub>

---

## 3. Tensör Paralelliğinde Ağ Trafiği

### 3.1. Modeli bölmek

8 Spark'lı tensör paralel yapılandırmada (TP8) her tensör paralel ağırlık matrisi 8 dilime ayrılır. Her Spark bir dilimi belleğinde tutar. Attention bloklarında attention başları Spark'lara paylaştırılır. İleri beslemeli (feed-forward) bloklarda ve uzman karışımı (Mixture-of-Experts, MoE) bloklarında her uzmanın matrisleri de bölünür. Böylece her Spark her uzmanın ağırlıklarının bir bölümünü tutar. Spark kendi belleğinden ağırlıkların yalnızca sekizde birini okur. Bu sayede tek Spark'a sığmayan model çalıştırılabilir ve her Spark'ın bütün ağırlıkları okuduğu duruma göre daha hızlı sonuç alınır.

### 3.2. Kısmi sonuçlar ve all-reduce

Attention ve ileri beslemeli blokların çıkışında her Spark, girdi boyutunun bir dilimine ait ağırlıkları tutar. Her çıktı değeri için bir kısmi toplam hesaplar. Sekiz Spark'ın kısmi toplamları birleştirildiğinde çıktı tamamlanır. Bu değerler modelin *aktivasyonlarıdır* (activations). Her token, katmanlardan geçerken bir vektörle temsil edilir. GLM-5.3'te bu vektörün uzunluğu, yani *gizli boyut* (hidden dimension), 6,144'tür. Bir ileri yayılımda (forward pass) 4,096 token işlendiğinde her Spark 4,096 × 6,144 kısmi değer üretir. Değer başına 2 baytla bu blok 50.3 MB tutar.

Bu toplamı **all-reduce** işlemi hesaplar. Adındaki *reduce*, blokların birleştirilmesini (burada toplanmasını), *all* ise sonucun tüm katılımcılara ulaşmasını ifade eder. İncelenen paralel yerleşimde katman başına iki all-reduce vardır. Biri attention bloğunun, diğeri ileri beslemeli veya MoE bloğunun çıkışındadır. Girdi embedding'i için de bir all-reduce gerekir. Her işlemde sekiz Spark'ın da katkısı beklendiğinden her katmanın ilerlemesi ağa bağlıdır.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp-layer-allreduce.png' | relative_url }}" alt="TP8'de bir transformer katmanındaki iki all-reduce ve 8 Spark'ın oluşturduğu halka" width="820"/></p>
<sub><i>Şekil 2: Tensör paralelliğinde bir transformer katmanı ve 8 Spark'ın katıldığı halka all-reduce işlemi.</i></sub>

### 3.3. Halka all-reduce nasıl çalışır?

Her Spark bloğunun tamamını diğer yedi Spark'a gönderseydi Spark başına 7 × 50.3 MB aktarılırdı. Spark sayısı arttıkça bu miktar da artardı. Bu boyuttaki aktarımlar için tahmin, NCCL'in **halka** algoritmasını kullandığını varsayar (Bölüm 3.4). Mantıksal halkada her Spark veriyi yalnızca bir sonraki Spark'a gönderir. Her blok Spark sayısı kadar segmente ayrılır. Şekil 3, işlemin iki aşamasını dört Spark için gösterir.

İlk aşamada (*reduce-scatter*) her Spark bir halka adımında komşusuna bir segment gönderir ve kendisine gelen segmenti yerel kopyasıyla toplar. Spark'lar aynı anda farklı segmentler üzerinde çalışır. N − 1 adım sonunda her Spark'ta bir segmentin tam toplamı bulunur. İkinci aşamada (*all-gather*) tamamlanan segmentler halkada kopyalanarak iletilir. N − 1 adım daha atıldığında her Spark bütün segmentlerin toplamlarını almış olur.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/ring-allreduce-steps.png' | relative_url }}" alt="Dört Spark arasında adım adım halka all-reduce: üç halka adımında reduce-scatter, ardından üç halka adımında all-gather" width="820"/></p>
<sub><i>Şekil 3: Dört Spark ile halka all-reduce. Üç reduce-scatter adımının sonunda her Spark bir segmentin tam toplamını tutar. Üç all-gather adımından sonra dört toplam da her Spark'ta bulunur.</i></sub>

Halka toplam 2 × (N − 1) adımda tamamlanır. Her adımda bir Spark, bloğunun 1/N'i büyüklüğünde bir segment gönderir. Spark başına toplam gönderim blok boyutunun **2 × (N − 1) / N** katıdır. Sekiz Spark için katsayı 1.75'tir ve Spark sayısı ne olursa olsun 2'yi aşmaz. GLM-5.3 için TP8'de her Spark bir all-reduce'ta 1.75 × 50.3 MB = **88.1 MB** gönderir. Bu veri, her biri yaklaşık 6.3 MB olan 14 adımda taşınır. Halkanın her üyesi aynı miktarda veri gönderdiğinden tek Spark'ın trafiği sekizini de temsil eder.

Modeldeki bütün all-reduce işlemleri (78 katman × 2, artı 1) hesaba katıldığında, tek bir prompt token'ı için Spark başına gönderilen veri miktarı şöyledir:

> (2 × 78 + 1) × 6,144 değer × 2 bayt × 1.75 = **3.38 MB**.

II. Kısım bu değeri ölçülen trafikle karşılaştırır.

### 3.4. NCCL halka ile ağaç arasında nasıl seçim yapar?

Çıkarım motorlarının kendi all-reduce kernel'leri yalnızca aynı makinedeki veya aynı NVLink alanındaki GPU'lar arasında çalışır. Bu nedenle DGX Spark'lar arasındaki all-reduce işlemlerini NCCL yürütür ([vLLM](https://github.com/vllm-project/vllm/blob/main/vllm/distributed/device_communicators/custom_all_reduce.py), [SGLang](https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/distributed/parallel_state.py)). NCCL halka algoritmasının yanında **ağaç** (tree) algoritmasını da destekler. Diğer bazı seçenekler özel donanım gerektirir. CollNet, NVIDIA SHARP ile toplama işlemini switch üzerinde yapar. NVLS ise NVSwitch gerektirir. PAT yalnızca başka kolektif işlemlerde kullanılır. Ethernet ile bağlanan ve her birinde tek GPU bulunan DGX Spark'larda all-reduce için geriye halka ve ağaç seçenekleri kalır ([NCCL ortam değişkenleri](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/env.html), `NCCL_ALGO`).

NCCL, *çift ikili ağaç* (double binary tree) kullanır. Veri ikiye ayrılır ve her yarı ayrı bir ikili ağaçta toplanır. Kısmi toplamlar köke iletilir, sonuç kökten dallara dağıtılır. Bir ağaçta veri ileten Spark, diğerinde yaprak düğümdür ([NCCL 2.4 ve çift ikili ağaçlar](https://developer.nvidia.com/blog/massively-scale-deep-learning-training-nccl-2-4/)). Şekil 4 iki algoritmayı dört Spark üzerinde gösterir.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/allreduce-ring-vs-tree.png' | relative_url }}" alt="Dört Spark ile halka ve çift ikili ağaç all-reduce işlemlerinde Spark başına gönderilen veri" width="820"/></p>
<sub><i>Şekil 4: Dört Spark ile halka ve ağaç all-reduce. Her Spark'ın gönderdiği veri miktarı kendi blok boyutunun katı olarak verilmiştir.</i></sub>

Halkada 2 × (N − 1) adım sırayla tamamlanır. Her adımın sabit gecikmesi olduğundan toplam gecikme Spark sayısıyla orantılı artar. Ağaçta ise köke ulaşmak için yaklaşık log₂ N adım, sonucu dağıtmak için de bir o kadar adım gerekir. Halka, aktarılan bayt sayısını en aza indirir ve yükü Spark'lara eşit dağıtır ([Patarasuk & Yuan, 2009](https://www.cs.fsu.edu/~xyuan/paper/09jpdc.pdf)). Ağaçta gönderilen veri düğümün konumuna bağlıdır. En yoğun düğümler halkadakinden daha fazla veri gönderir. Küçük aktarımlarda veya Spark sayısı yüksek olduğunda sabit gecikmeler ağır basar ve ağaç genellikle daha hızlıdır. Büyük aktarımlarda süreyi veri hacmi belirler ve halka genellikle daha hızlıdır.

NCCL her all-reduce çağrısı için algoritmayı ve aktarım protokolünü seçer. Aktarım boyutunu, Spark sayısını ve algıladığı topolojiyi kullanarak her seçeneğin süresini hesaplar. Modelde bu süre, sabit gecikme ile veri miktarının etkin bant genişliğine oranının toplamıdır. NCCL tahmini süresi en kısa seçeneği kullanır ([Understanding NCCL tuning](https://developer.nvidia.com/blog/understanding-nccl-tuning-to-accelerate-gpu-to-gpu-communication), [Demystifying NCCL](https://arxiv.org/abs/2507.04786)). Algoritma `NCCL_ALGO` ile sabitlenmedikçe seçim çıkarım sırasında çağrının boyutuna göre değişebilir. Bu çalışmadaki koşularda algoritma sabitlenmedi. Tahminde 50.3 MB'lık prefill blokları için halka varsayılır. Küçük decode çağrılarında ağaç kullanılabilir (Bölüm 4.2). NCCL'in seçimlerine ilişkin tanılama kayıtlarını `NCCL_DEBUG=INFO` ve `NCCL_DEBUG_SUBSYS=TUNING` ile açabilirsiniz. Bölüm 13.2'deki trafik sayaçları halka modelini toplam veri hacmi üzerinden sınamaya olanak verir.

### 3.5. Spark sayısının etkisi

Spark sayısı arttıkça hesaplama daha fazla cihaza dağılır. Satır yönünde bölünmüş çıkışlarda (row-parallel output) her Spark, her çıktı değerinin kısmi toplamını üretir. Dolayısıyla model iki Spark'ta da çalışsa on altı Spark'ta da çalışsa her birinin bloğu 4,096 × 6,144 değer (50.3 MB) içerir. Matrisler eşit bölündüğünde TP boyutunun iki katına çıkması Spark başına matris işlemlerini yarıya indirir. Buna karşılık her Spark'ın all-reduce başına gönderdiği veri biraz artar. Bu miktar blok boyutunun 2 × (N − 1) / N katıdır.

| TP boyutu | Spark başına hesaplama | All-reduce başına Spark'ın gönderdiği |
|---|---|---|
| TP2 | modelin 1/2'si | 1.0 × 50.3 MB = 50.3 MB |
| TP4 | 1/4 | 1.5 × 50.3 MB = 75.5 MB |
| TP8 | 1/8 | 1.75 × 50.3 MB = 88.1 MB |
| TP16 | 1/16 | 1.875 × 50.3 MB = 94.3 MB |

Bu modelde TP8'den TP16'ya geçiş, bölünen matrislerde Spark başına düşen işlem sayısını yarıya indirir. Veri gönderme süresi ise hemen hemen aynı kalır. Böylece her ileri yayılımda ağa ayrılan sürenin payı artar. Bölüm 6.3 bunun bağlantı hızına etkisini hesaplar.

---

## 4. Prefill ve Decode: Ağ Üzerinde İki Farklı Yük

Bir all-reduce'ta taşınan veri miktarı, motorun bir ileri yayılımda kaç token işlediğine bağlıdır. Aşağıdaki örneklerde II. Kısım'daki vLLM ayarları kullanılmıştır.

### 4.1. Prefill: tam bağlantı hızında büyük aktarımlar

Prefill sırasında vLLM bir ileri yayılımda en fazla 4,096 token'ı aynı batch'te işleyebilir (`--max-num-batched-tokens 4096`). Batch doluyken her all-reduce Bölüm 3.2'deki 50.3 MB'lık bloğu toplar ve her Spark 88.1 MB gönderir.

| Bağlantı hızı | 88.1 MB'ı gönderme süresi |
|---|---|
| 200 Gb/s | **3.5 ms** |
| 100 Gb/s | **7.0 ms** |

Her aktarımda yazılım, senkronizasyon ve ağ donanımı sabit bir gecikme oluşturur. Bu gecikme için 100 µs gibi yüksek bir değer alsak bile 200 Gb/s'lik bağlantı 100 µs'de yalnızca 2.5 MB taşır. Oysa gönderilecek veri 88.1 MB'tır. Dolayısıyla prefill sırasındaki all-reduce süresini büyük ölçüde aktarım hızı belirler. Prefill iletişimi **bant genişliğiyle sınırlıdır**. Spark'lar bir sonraki katman işlemini hesaplarken ağ trafiği azalır. Bu nedenle birkaç milisaniye boyunca tam hıza yaklaşan veya ulaşan trafik patlamaları ve aralarında hesaplama süreleri beklenir. Bağlantı hızı yarıya inince her patlama iki kat uzun sürer ve ilk token gecikir.

### 4.2. Decode: sabit gecikmelerin belirlediği küçük aktarımlar

Decode sırasında her ileri yayılımda her isteğin son token'ı işlenir. II. Kısım'da kullanılan spekülatif kod çözme (speculative decoding) ayarında model, çok token'lı tahmin (multi-token prediction, MTP) ile aynı yayılımda 4 taslak token'ı da doğrular. Böylece istek başına 5 token işlenir. Her all-reduce'ta toplanan blok 5 × 6,144 × 2 bayt = **61 KB** tutar. Halka modelinde her Spark yaklaşık **108 KB** gönderir. Çıktı katmanındaki token puanlarını toplamak da hesaba katıldığında bir ileri yayılımda Spark başına yaklaşık **18 MB** aktarılır.

108 KB veri 200 Gb/s'de 4.3 µs, 100 Gb/s'de 8.7 µs içinde gönderilir. All-reduce ise art arda birkaç adım gerektirir. Sekiz Spark'lı halkada 14 adım vardır, ağaçta bu sayı daha azdır (Bölüm 3.4). Her adımda yazılım, senkronizasyon ve ağ donanımı sabit bir gecikme getirir. İki sistem arasında çok az veri taşıyan bir RDMA aktarımı bile mikrosaniyeler sürer. Adımların sabit gecikmeleri toplandığında verinin gönderim süresini aşar. Dolayısıyla decode iletişimi **gecikmeyle sınırlıdır** ve bağlantı hızından çok az etkilenir.

Decode sırasında aktarılabilecek toplam veri miktarı da sınırlıdır. Model her ileri yayılımda en azından etkin ağırlıklarını bellekten okur. GLM-5.3'te token başına yaklaşık 40 milyar etkin parametre vardır. Bunların çoğu NVFP4 biçiminde saklanır. NVIDIA'nın bu 4 bitlik kayan nokta biçimi, ölçek katsayılarıyla birlikte ağırlık başına yaklaşık 4.5 bit kullanır. Spark başına yaklaşık 2.8 GB okumak gerekir. 273 GB/s hızda bu işlem en az **10 ms** sürer. Her ileri yayılım bu alt sınırda tamamlansa bile tek bir isteğin decode trafiği en fazla yaklaşık **14 Gb/s** olur. Bu değer 100 Gb/s'nin çok altındadır. Bağlantıyı yarı hıza düşürmek, en az 10 ms süren her yayılıma en fazla 0.7 ms ekler. Aktarımlarda sabit gecikmeler ağır bastığından pratikte fark çok daha küçüktür.

Bağlantı hızı esas olarak prompt'un işlenme süresini etkiler. Bu etki özellikle erişim destekli üretim (RAG), uzun belgeler ve geniş bağlam kullanan agent'lar gibi uzun prompt gerektiren iş yüklerinde önemlidir. Kısa sohbet prompt'ları çok az ağ trafiği oluşturur. Yanıt üretilirken decode hızının değişmesi beklenmez.

---

## 5. Bağlantı Hızı Yarıya İnince İlk Token Ne Kadar Gecikir?

### 5.1. Üst sınır

Her prefill aktarımı bağlantının tam hızını kullanıyorsa ve hesaplama ile aktarım aynı anda yürütülmüyorsa, B_old hızından B_new hızına geçişin getirdiği ek süre, aynı verinin iki hızdaki gönderim sürelerinin farkına eşittir.

> **ek prefill süresi ≤ Spark başına prefill baytı × (1 / B_new − 1 / B_old)**

Bu üst sınır aktarım hacminin, kolektif algoritmaların, zamanlamanın ve ağ dışındaki iş yükünün sabit kaldığı bir model için geçerlidir. Hesaplamayla aynı anda yapılan aktarımın bir bölümü bekleme süresine yansımaz. Hesap için Bölüm 3.3'teki token başına bayt miktarını ve prompt uzunluğunu kullanın. Veri hacmi ile her iki hızın birimleri uyumlu olmalıdır. Zamanlama veya protokol verimliliği değişirse ölçülen TTFT tahminin dışına çıkabilir.

Hız 200'den 100 Gb/s'ye düştüğünde (1/100 − 1/200) = 1/200 olur. Dolayısıyla ek süre, prefill verisini 200 Gb/s'de göndermek için gereken süreye eşittir. GLM-5.3 için TP8'de hesap şöyledir:

> **1,000 prompt token'ı başına ek aktarım süresi ≤ (3.38 MB/token × 1,000 token × 8 bit/bayt) ÷ 200 Gb/s ≈ 0.135 s.**

### 5.2. Altı test durumu

| Test | Prompt token'ı | Spark başına prefill baytı | Ek prefill süresi, 200 → 100 Gb/s |
|---|---|---|---|
| P1: 1K prompt, 1 istek | 1,024 | 3.5 GB | ≤ +0.14 s |
| P2: 8K prompt, 1 istek | 8,192 | 27.7 GB | ≤ +1.11 s |
| P3: 32K prompt, 1 istek | 32,768 | 110.6 GB | ≤ +4.43 s |
| P4: aynı anda gelen 4 × 8K prompt | 32,768 | 110.6 GB | ≤ +4.43 s |
| P5: 64K prompt, 1 istek | 65,536 | 221.3 GB | ≤ +8.85 s |
| P6: aynı anda gelen 4 × 16K prompt | 65,536 | 221.3 GB | ≤ +8.85 s |

Dört eşzamanlı istek için veri hacmi dört prompt'un toplamıdır. Süre, son isteğin ilk token'ı gelene kadar ölçülür.

### 5.3. Saniyeden yüzdeye

Sınırı TTFT'deki oransal artış cinsinden de yazabiliriz:

> **TTFT artışı ≤ ağ payı × (B_old / B_new − 1)**. 200 → 100 Gb/s için üst sınır **ağ payına** eşittir.

**Ağ payı**, prefill verisini 200 Gb/s'de göndermek için gereken sürenin toplam prefill süresine oranıdır.

Model mimarisi tek başına prefill süresini güvenilir biçimde vermez. Yalnızca işlem sayısını ve GB10'un tepe hesaplama gücünü kullanan bir tahmin yaklaşık bir büyüklük mertebesi sapar. Gerçek süre, motorun MoE uzmanları, attention ve zamanlama için kullandığı kernel'lerin verimine bağlıdır. Bu yüzden yüzde artışı hesaplamak için 200 Gb/s'deki TTFT ölçümüne ihtiyaç vardır. II. Kısım'da bu ölçümü veriyoruz.

---

## 6. Kaybı Büyüten ve Küçülten Etkenler

Nominal bağlantı hızı yarıya indiğinde prefill süresindeki ağ payı ne kadar büyükse beklenen yüzde artış da o kadar büyüktür.

### 6.1. Prompt uzunluğu

Her prompt token'ı için 3.38 MB gönderilir. Dolayısıyla aktarılan veri miktarı ve matris işlemlerinin sayısı prompt uzunluğuyla orantılı artar. Her token'ın kendisinden önceki bütün token'lara baktığı modellerde attention hesabı daha hızlı büyür. Çok uzun prompt'larda ağın payı ve yüzde cinsinden gecikme artışı bu nedenle yavaşça azalır. GLM-5.3'te DeepSeek Sparse Attention (DSA), her token için önceki token'lar arasından yaklaşık 2,048 tanesini seçer. İşlem sayısı prompt uzunluğuyla yaklaşık orantılı kaldığından **uzun prompt'larda yüzde artışın kabaca sabit kalması beklenir**. Her iki durumda da saniye cinsinden ek süre prompt uzadıkça artar.

1K token'lık kısa bir prompt tek bir küçük prefill parçasına (chunk) sığar. Her all-reduce'ta Spark başına yaklaşık 22 MB aktarılır. Bu aktarım 200 Gb/s'de bir milisaniyeden kısa sürer. Aktarım tam hıza ulaşmadan bitebilir ve ileri yayılımın sabit giderleri toplam sürede daha büyük pay tutar. Dolayısıyla üst sınır, kısa prompt'larda ölçülen farktan büyük olabilir.

### 6.2. Aynı anda birkaç istek

Birkaç prompt aynı anda geldiğinde motor bunların prefill parçalarını aynı ileri yayılımda işleyebilir. Her prompt'un attention bağlamı, toplam uzunluğu aynı olan tek bir prompt'unkinden daha kısadır. Token başına aktarılan veri değişmez. Daha dolu batch'ler token başına hesaplama süresini de kısaltabilir. Böylece iletişimin payı ve bağlantıyı yavaşlatmanın oransal etkisi büyür. Motorun prompt'ları hangi sırayla işlediği ve ilk yanıtları ne zaman üretmeye başladığı da her isteğin TTFT'sini etkiler.

### 6.3. TP boyutu

Aşağıdaki tabloda her Spark'ın token başına gönderdiği bayt ve yaptığı hesaplama TP8'e göre verilmiştir.

| TP boyutu | Spark başına bayt | Spark başına hesaplama |
|---|---|---|
| TP2 | 0.57× | 4× |
| TP4 | 0.86× | 2× |
| TP8 | 1× | 1× |
| TP16 | 1.07× | 0.5× |

TP boyutu büyüdükçe ağın payı ve bağlantı hızını düşürmenin etkisi hızla artar. Daha düşük bir bağlantı hızı küçük TP boyutlarında daha kolay kabul edilebilir. Bölüm 10 bu etkiyi ölçülen TP8 değerinden hareketle hesaplar.

---

# II. Kısım: Ölçüm

## 7. Test Tasarımı

### 7.1. Yalnızca bağlantıyı değiştirmek

Bağlantının etkisini ayırt edebilmek için her iki yapılandırmada aynı model, motor, ayarlar, prompt'lar ve test planı kullanıldı. Yalnızca ağ yolu değiştirildi.

### 7.2. Kurulum

| Öğe | Değer |
|---|---|
| Sistemler | 8× NVIDIA DGX Spark (GB10, 128 GB birleşik bellek), sürücü 580.173.02 |
| Switch | MikroTik CRS804, 2 × 200G breakout yapılandırmasında 400G QSFP-DD portlar |
| Model | GLM-5.3 NVFP4 (`Inferact/GLM-5.3-NVFP4`): 753B parametreli MoE, token başına yaklaşık 40B aktif; gizli boyut 6,144; 78 katman; DeepSeek Sparse Attention |
| Motor | vLLM `0.1.dev20133+gb5f995e73` (container `vllm-node-b12x`), PyTorch 2.13, NCCL 2.31.2, Ray |
| Paralellik | TP8: 8 Spark'ın tamamına yayılmış tek bir model örneği |
| Temel ayarlar | en fazla 4,096 token'lık prefill parçaları, FP8 KV cache, MTP ile spekülatif kod çözme (4 taslak token; taslak model Spark'lara bölünmez, bu yüzden ağ trafiği eklemez), CUDA graph'ları, en fazla 8 eşzamanlı istek |

Bu deneydeki GLM-5.3 yapılandırması 8 Spark'ın tamamını kullanır. Sık tekrarlanan kolektif işlemler nedeniyle bu iş yükü, bağlantı hızının etkisini ölçmeye elverişlidir.

### 7.3. 100 Gb/s'yi mevcut kablolarla emüle etmek

100G kablo almadan gerçek donanımda 100 Gb/s'yi deneyebilirsiniz. Her Spark'ta ikinci RDMA cihazını çıkarım motorunun ortam ayarlarında hariç tutun. Böylece NCCL iki ağ arayüzünden yalnızca birini kullanır.

```
NCCL_IB_HCA=^roceP2p1s0f1
```

Her makinede ikinci RDMA cihazının adını `ibdev2netdev` ile bulun ve o cihazı hariç tutun. Kablolar, switch portları ve diğer bütün ayarlar aynı kalır. Modeli bu ayar olmadan yeniden başlattığınızda yeniden 200 Gb/s kullanabilirsiniz. RDMA sayaçları (Ek A), emüle edilmiş bağlantıda yapılan her koşuda bütün trafiğin tek arayüzden geçtiğini doğruladı.

Mevcut 200 Gb/s cluster'da iş yükünü önce 200 Gb/s'de, ardından emüle edilmiş 100 Gb/s bağlantıda çalıştırın. Bölüm 9'daki hesapla gerçek bağlantıda beklenen farkı bulun. Sonuç uygunsa 100G kablolara geçebilirsiniz (Bölüm 11). II. Kısım'da bu yöntemi Bölüm 7.4'teki test planıyla GLM-5.3 üzerinde TP8'de uyguluyoruz. Açık kaynaklı [netinfermon](https://github.com/openzeka/netinfermon), aynı planı her iki hızda da çalıştırır ve isteklerle RDMA trafiğini aynı saati kullanarak kaydeder (Ek A).

Tek arayüzün hızını kendi PCIe Gen5 ×4 bağlantısı belirler. 4 hat × 32 GT/s kapasite, hat kodlaması (128b/130b) hesaba katıldığında 126 Gb/s'ye iner. PCIe paketlerinin ve akış kontrolünün ek yüküyle kullanılabilir hız yaklaşık **111 Gb/s** olur. Tek arayüzde `ib_write_bw` ile **109 Gb/s** ölçüldü. Dolayısıyla emülasyon, gerçekte 98 Gb/s taşıyan 100 Gb/s bağlantıdan (Bölüm 12.3) yaklaşık %11 daha hızlıdır. Bölüm 9'daki dönüşüm bu farkı hesaba katar.

B_new = 100 yerine 109 Gb/s alındığında Bölüm 5.1'deki sınır şu hale gelir:

> **Ek prefill süresi ≤ Spark başına prefill verisi (gigabit) × (1/109 − 1/200)**. GLM-5.3 için TP8'de bu değer **1,000 prompt token'ı başına yaklaşık 0.11 s**'dir.

| Test | Tahmin, 200 → 100 Gb/s (Bölüm 5.2) | Tahmin, 200 → 109 Gb/s (bu deney) |
|---|---|---|
| P1: 1K | ≤ +0.14 s | ≤ +0.12 s |
| P2: 8K | ≤ +1.11 s | ≤ +0.92 s |
| P3: 32K | ≤ +4.43 s | ≤ +3.69 s |
| P4: 4 × 8K | ≤ +4.43 s | ≤ +3.69 s |
| P5: 64K | ≤ +8.85 s | ≤ +7.39 s |
| P6: 4 × 16K | ≤ +8.85 s | ≤ +7.39 s |

Bölüm 9'da emülasyon ölçümlerinden gerçek 100 Gb/s kabloda beklenen fark hesaplanır. Bölüm 12.3'te gerçek kablonun ölçüm sonuçları yer alır.

### 7.4. Test planı

| Test | İstekler | Prompt → çıktı token'ı | Amaç |
|---|---|---|---|
| P1 | 1 | 1,024 → 1,024 | küçük aktarımlı kısa bir prompt |
| P2 | 1 | 8,192 → 1,024 | tipik bir uzun prompt |
| P3 | 1 | 32,768 → 1,024 | uzun bir belge |
| P4 | 4, aynı anda gelen | 4 × 8,192 → 1,024 | birkaç istek, P3 ile aynı toplam prompt boyutu |
| P5 | 1 | 65,536 → 1,024 | çok uzun bir prompt |
| P6 | 4, aynı anda gelen | 4 × 16,384 → 1,024 | birkaç istek, P5 ile aynı toplam prompt boyutu |

Her testte önce bir ısınma turu, ardından üç ölçüm turu çalıştırıldı. Isınma turu sonuçlara dahil edilmedi. Tablodaki prompt uzunlukları hedef değerlerdir. Her istek tam 1,024 token ürettiğinden isteklerin decode yükü aynıdır ve hızlar doğrudan karşılaştırılabilir.

### 7.5. Neler ölçüldü

- **TTFT:** isteğin gönderilmesiyle ilk token'ın alınması arasında geçen süre. P4 ve P6 için son isteğin ilk token'ına kadar geçen süreyi de veriyoruz. Tahmin dört prompt'un toplam veri hacmini kullandığı için karşılaştırılması gereken süre budur.
- **Decode hızı:** ilk token'dan sonra saniyede üretilen token sayısı. Hesabı (çıktı token sayısı − 1) ÷ (son token'ın zamanı − ilk token'ın zamanı) şeklindedir. TTFT'yi de içeren toplam istek süresini kullanırsak uzun prompt'larda decode hızı aynı kalsa bile sonuç düşer. Bu yüzden decode karşılaştırmalarında toplam süreyi kullanmıyoruz.
- **Ağ trafiği:** tek bir Spark'ın ConnectX-7'sinin RDMA sayaçlarından baytlar ve hızlar (Ek A). Halka all-reduce'ta her Spark aynı miktarı gönderdiği için tek bir Spark sekizini de temsil eder.

### 7.6. Ölçüm koşullarının eşleştirilmesi

İki yapılandırmaya da aynı prompt'ları göndermek için sabit bir kümeden prompt seçildi ve sabit rastgelelik tohumuyla hedef uzunluğa kadar dolgu eklendi. Önbellekteki ortak ön eklerin tekrar kullanımını sınırlamak için dolgu sırası her istekte değiştirildi. Test dışındaki servisler tüm Spark'larda durduruldu. Her koşuya başlamadan önce bağlantıda 10 saniye boyunca trafik görülmemesi beklendi. İstekler ve trafik örnekleri aynı Spark'ın saatiyle kaydedildi. Böylece sayaç ölçümlerini her isteğin ilk token zamanıyla eşleştirebiliyoruz. İstekler çakıştığında sayaçlar bunların toplam trafiğini gösterir.

Ortalamalar ve aralıklar bütün ölçüm turlarını kapsar. Aynı testin turları arasındaki prefill süresi farkı tek istekte en fazla 0.6 s, dört istekte ise en fazla 1.2 s oldu.

---

## 8. Sonuçlar: TP8'de 200 Gb/s ve Emüle Edilmiş 100 Gb/s

### 8.1. Cluster 200 Gb/s kapasitenin ne kadarını kullanıyor?

Şekil 5, 200 Gb/s bağlantıda tek bir 8K token'lık istek işlenirken bir Spark'ın gönderdiği trafiği gösterir. Bölüm 4.1'de açıklandığı gibi, prefill sırasında bağlantı birkaç milisaniyeliğine tam hıza yaklaşır. Bu patlamaların arasında Spark'lar hesaplama yapar. Grafiğin 200 ms'lik kesitinde her patlama bir prefill all-reduce'una karşılık gelir. İlk token'dan sonra decode trafiği düşük ve sabit kalır.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-200g-p2-annotated.png' | relative_url }}" alt="200 Gb/s'de 8K token'lık tek bir istek: prefill patlamaları, ilk token ve decode trafiği, prefill aşamasından 200 ms'lik bir kesit" width="820"/></p>
<sub><i>Şekil 5: 200 Gb/s bağlantıda tek bir 8K token'lık isteği işlerken bir Spark'ın gönderdiği trafik, 1 ms aralıklarla ölçülmüştür. Alttaki grafik prefill içinden 200 ms'lik bir kesiti gösterir.</i></sub>

1 ms aralıklarla bakıldığında tek başına gelen 8K–64K prompt'larda trafik anlık olarak yaklaşık 150–180 Gb/s'ye çıkar. Dört prompt aynı anda geldiğinde 200 Gb/s'ye yaklaşır. Oysa 8K prompt'un prefill süresi boyunca ortalama hız 37 Gb/s'dir. Spark'lar hesaplama yaparken bağlantıda trafik yoktur. Decode sırasında ortalama trafik tek istekte yaklaşık **3 Gb/s**, dört istekte yaklaşık **6 Gb/s** düzeyindedir. Her ikisi de Bölüm 4.2'deki tahminin sınırları içindedir. Cluster tam 200 Gb/s'yi kullanır, ancak bu dönemlerin her biri yalnızca birkaç milisaniye sürer.

Aynı 8K prompt'un prefill aşamasında ölçülen tepe değer, ortalama alma aralığına göre değişir.

| Ortalama alma aralığı | En yüksek değer |
|---|---|
| 1 ms | 181 Gb/s |
| 5 ms | 96 Gb/s |
| 100 ms | 44 Gb/s |
| 1 s | 40 Gb/s |
| prefill'in tamamı (ortalama) | 37 Gb/s |

Bir saniyelik ortalamalar raporlayan bir switch yaklaşık 40 Gb/s gösterir ve neredeyse boşta bir bağlantı izlenimi verir. TTFT'yi belirleyen patlamalar yalnızca milisaniye çözünürlüğünde görünür (Ek A).

### 8.2. Her testteki trafik

Şekil 6–11'de her testin üç ölçüm turu boyunca bir Spark'ın gönderdiği trafik gösterilir. Üstte 200 Gb/s, altta emüle edilmiş 100 Gb/s bağlantı vardır. İki grafik aynı zaman eksenini kullanır. Gri alan her turda prefill'in başlangıcından son isteğin ilk token'ı gelene kadar uzanır.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p1-1k-200g-vs-100g.png' | relative_url }}" alt="1K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 6: P1, 1K token'lık prompt, 1 istek.</i></sub>

1K prompt'ta prefill trafiği 200 Gb/s bağlantıda bile en fazla yaklaşık 100 Gb/s'ye çıkar. Tek arayüz bu trafiği taşıyabildiği için emülasyonda patlamalar uzamaz. İki hızda TTFT hemen hemen aynıdır (0.96 s ve 0.97 s).

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p2-8k-200g-vs-100g.png' | relative_url }}" alt="8K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 7: P2, 8K token'lık prompt, 1 istek.</i></sub>

Tek bir 8K prompt işlenirken 200 Gb/s bağlantıda prefill trafiği yaklaşık 150–180 Gb/s'ye ulaşır. Emüle edilmiş bağlantıda aynı patlamalar yaklaşık 105–109 Gb/s ile sınırlı kalır ve daha uzun sürer. TTFT 6.36 s'den 7.24 s'ye çıkar. İki grafikte de decode trafiği aynı görünür.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p3-32k-200g-vs-100g.png' | relative_url }}" alt="32K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 8: P3, 32K token'lık prompt, 1 istek.</i></sub>

32K prompt'ta aynı trafik düzeni daha uzun bir prefill süresine yayılır. TTFT 27.0 s'den 30.6 s'ye çıkar.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p4-4x8k-200g-vs-100g.png' | relative_url }}" alt="Aynı anda gelen dört 8K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 9: P4, aynı anda gelen dört 8K token'lık prompt.</i></sub>

Dört prompt birlikte geldiğinde iki arayüzün toplam prefill trafiği anlık olarak 200 Gb/s'ye yaklaşır. Emülasyonda tepe değer yaklaşık 109 Gb/s'dir. Patlamalar arasında trafik azalır. Son isteğin ilk token'ına kadar geçen süre 23.0 s'den 26.4 s'ye çıkar. Dört istekte decode trafiği artsa da her iki bağlantının kapasitesinin çok altında kalır.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p5-64k-200g-vs-100g.png' | relative_url }}" alt="64K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 10: P5, 64K token'lık prompt, 1 istek.</i></sub>

64K prompt'ta, yarı uzunluktaki 32K prompt'taki trafik düzeni görülür. Patlamalar 200 Gb/s bağlantıda yaklaşık 150–180 Gb/s'ye ulaşırken emülasyonda 109 Gb/s ile sınırlanır. TTFT 55.5 s'den 62.5 s'ye çıkar. Üç tur arasındaki fark en fazla yaklaşık 0.2 s'dir.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glm53-tp8-p6-4x16k-200g-vs-100g.png' | relative_url }}" alt="Aynı anda gelen dört 16K token'lık prompt: 200 Gb/s ve emüle edilmiş 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 11: P6, aynı anda gelen dört 16K token'lık prompt.</i></sub>

Dört 16K prompt birlikte geldiğinde prefill patlamaları 200 Gb/s bağlantıda yaklaşık 46 s, emüle edilmiş 109 Gb/s bağlantıda yaklaşık 54 s boyunca tekrarlanır. Motor prompt'ları ikişerli işler. İlk iki istek ilk token'larını 200 Gb/s'de yaklaşık 22 s, emülasyonda 27 s sonra alır. Son iki istek için bu süreler yaklaşık 45 s ve 54 s'dir. İkinci çift hâlâ prefill aşamasındayken ilk çift için decode başlamıştır.

### 8.3. Prompt token'ı başına trafik

İki bağlantı ayarında yapılan ölçümlerde her Spark, **prompt token'ı başına 3.53 ile 3.60 MB** arasında veri gönderdi. Bu değerler Bölüm 3.3'te halka için hesaplanan 3.38 MB'ın yaklaşık %4–7 üzerindedir. Sayaçlar, prefill sırasında protokolün oluşturduğu trafiği ve aynı aralıktaki diğer trafiği de kaydeder. İki hızda da benzer hacimler ölçülmesi, aynı iş yükünün gönderilmesiyle uyumludur.

### 8.4. TTFT

Tabloda üç turun ortalaması, parantez içinde de en düşük ve en yüksek değerler verilmiştir. P4 ve P6'da süre, dört isteğin sonuncusu ilk token'ını aldığında durur. Tahminlerde Bölüm 7.3'teki emüle edilmiş bağlantının hızı kullanılmıştır.

| Test | 200 Gb/s | 100 Gb/s (emüle edilmiş, 109 Gb/s) | Artış |
|---|---|---|---|
| P1: 1K | 0.96 s (0.91–0.99) | 0.97 s (0.94–1.00) | **+0.01 s (+%1.1)**, ölçülebilir fark yok (tahmin: ≤ +0.12 s) |
| P2: 8K | 6.36 s (6.21–6.56) | 7.24 s (7.14–7.45) | **+0.88 s (+%13.9)** (tahmin: ≤ +0.92 s) |
| P3: 32K | 27.02 s (26.96–27.12) | 30.57 s (30.40–30.87) | **+3.55 s (+%13.1)** (tahmin: ≤ +3.69 s) |
| P4: 4 × 8K, son isteğin ilk token'ı | 23.00 s (22.61–23.19) | 26.44 s (26.20–26.59) | **+3.44 s (+%15.0)** (tahmin: ≤ +3.69 s) |
| P5: 64K | 55.47 s (55.39–55.55) | 62.47 s (62.34–62.56) | **+6.99 s (+%12.6)** (tahmin: ≤ +7.39 s) |
| P6: 4 × 16K, son isteğin ilk token'ı | 45.82 s (45.36–46.52) | 54.26 s (54.08–54.60) | **+8.44 s (+%18.4)** (tahmin: ≤ +7.39 s) |

Her turdaki dört isteğin TTFT ortalaması P4'te 16.49 s'den 20.21 s'ye (**+%22.5**), P6'da 33.96 s'den 40.03 s'ye (**+%17.9**) çıktı. Dört prompt birlikte geldiğinde istek başına ortalama artış, tek prompt gönderilen testlerdekinden daha büyüktü.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/measured-vs-predicted.png' | relative_url }}" alt="109 Gb/s'de ek prefill süresi: test başına tahmin ve ölçüm" width="820"/></p>
<sub><i>Şekil 12: Bağlantı 200'den 109 Gb/s'ye düştüğünde ek prefill süresi: tahmin (Bölüm 7.3) ve ölçüm.</i></sub>

Yalnızca model mimarisi, prefill ayarları ve bağlantı hızları kullanılarak hesaplanan ek bekleme süresi, tek başına gelen 8K–64K token'lık prompt'larda ve aynı anda gelen dört 8K prompt'ta ölçüme yaklaşık %7 veya daha az farkla uydu. Dört prompt'lu testte karşılaştırma, son isteğin ilk token'ına kadar geçen süre üzerinden yapıldı. Tek başına gelen uzun prompt'larda ölçülen artış **1,000 prompt token'ı başına yaklaşık 0.11 s** idi.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/ttft-increase-vs-prompt.png' | relative_url }}" alt="Bir turdaki toplam prompt token sayısına göre prefill süresinde ölçülen ve tahmin edilen artış" width="820"/></p>
<sub><i>Şekil 13: Prompt uzunluğuna göre prefill süresinde ölçülen ve tahmin edilen artış.</i></sub>

Tek prompt'ta TTFT artışı 8K'dan 64K token'a kadar yaklaşık aynı oranda kalır (sırasıyla %13.9, %13.1 ve %12.6). Bu sonuç, seyrek attention kullanan bir model için Bölüm 6.1'deki beklentiyle uyumludur. Ölçümler hafif düşüşün nedenini tek başına göstermiyor. Toplam uzunluk aynı kaldığında birkaç prompt'un birlikte gelmesi, Bölüm 6.2'de beklendiği gibi yüzde artışı büyütür. Artış dört 8K prompt'ta %15.0, dört 16K prompt'ta %18.4 oldu.

### 8.5. Decode hızı

| Test | 200 Gb/s | 100 Gb/s (emüle edilmiş) | Değişim |
|---|---|---|---|
| P1: 1K | 22.4 token/s | 22.5 token/s | +%0.5 |
| P2: 8K | 21.1 token/s | 20.6 token/s | −%2.3 |
| P3: 32K | 18.7 token/s | 19.1 token/s | +%2.0 |
| P4: 4 × 8K | istek başına 10.8 token/s | istek başına 11.2 token/s | +%4.3 |
| P5: 64K | 21.1 token/s | 21.0 token/s | −%0.4 |
| P6: 4 × 16K | istek başına 10.5 token/s | istek başına 10.2 token/s | −%2.1 |

Bağlantı hızını yarıya indirmek, pratikte yanıtın üretim hızını değiştirmedi. Altı testte emüle edilmiş bağlantıda ölçülen değişim, ortalama decode hızında %2.3 düşüş ile %4.3 artış arasında kaldı.

### 8.6. Ölçümün tahminden ayrıldığı yerler

**1K prompt.** Tahmine göre ek süre en fazla +0.12 s olabilirdi. Ölçülen fark +0.01 s oldu. 1K prompt'un her all-reduce'unda bir Spark yaklaşık 22 MB gönderir. Patlamalar 200 Gb/s bağlantıda bile ancak yaklaşık 100 Gb/s'ye ulaşır (Şekil 6). Emüle edilmiş bağlantı bu trafiği taşıyabildiğinden, Bölüm 6.1'de beklendiği gibi kısa prompt için üst sınır ölçülen etkiden büyüktür.

**Aynı anda gelen dört 16K prompt.** Ölçülen artış tahmini yaklaşık 1 s aştı. Tahmin yalnızca aktarım süresini kapsar. Bu testte motor prompt'ları ikişerli işledi ve ikinci çiftin prefill'i bitmeden ilk çiftin decode'una başladı (Bölüm 8.2). Kalan prefill ile decode aynı ileri yayılımları paylaştı. Prefill uzadıkça bu aralığa daha fazla decode işlemi girdi. Son isteğin ilk token'ına kadar geçen süre bu nedenle ek aktarım süresinden daha fazla uzadı. Birkaç uzun prompt birlikte geldiğinde motorun zamanlama kararları gecikmeyi tahminin ötesine taşıyabilir.

**Aynı anda gelen dört 8K prompt.** Son isteğin ilk token'ına kadar geçen süre tahminin sınırları içinde kaldı. Ancak isteklerin ilk token'larını hangi sırayla aldığı iki hızda farklıydı. Dolayısıyla her bir isteğin TTFT'sinde bağlantı kadar motorun zamanlamasının da payı vardır.

---

## 9. Emüle Edilmiş Bağlantıdan Gerçek 100G Kabloya

Emüle edilmiş bağlantı en fazla 109 Gb/s, gerçek 100 Gb/s bağlantı ise 98 Gb/s taşır (Bölüm 12.3). Bu iki hız için aktarım süresi farkını hesaplayarak gerçek kablonun ölçüme ekleyebileceği süreye bir üst sınır koyabiliriz.

> **Ek aktarım süresi (s) ≤ ölçülen prefill verisi (bayt) × 8 bit/bayt × (1/98 − 1/109) / 10⁹**. Hızlar Gb/s cinsindendir.

| Test | Emüle edilmiş 100 Gb/s (ölçülen) | Gerçek 100 Gb/s kablo, en fazla |
|---|---|---|
| P1: 1K | +%1.1 | +%4.2 |
| P2: 8K | +%13.9 | +%17.6 |
| P3: 32K | +%13.1 | +%16.7 |
| P4: 4 × 8K, son isteğin ilk token'ı | +%15.0 | +%19.1 |
| P5: 64K | +%12.6 | +%16.1 |
| P6: 4 × 16K, son isteğin ilk token'ı | +%18.4 | +%22.6 |

Tek prompt'un TTFT'si veya bir batch'te son isteğin ilk token'ına kadar geçen süre esas alındığında bu dönüşüm, ölçülen yüzde artışa yaklaşık 3–4 puan ekler. İstek başına ortalama TTFT'ye bir üst sınır koymak için batch'in tüm ek aktarım süresini her isteğe yazın ve bu süreyi 200 Gb/s'deki ortalama istek TTFT'sine bölün. Zamanlama benzer kalırsa toplam artış dört 8K prompt'ta yaklaşık +%28, dört 16K prompt'ta yaklaşık +%23 olur. Mimariye dayalı tahmine göre 98 Gb/s'de tek bir uzun prompt için ek süre 1,000 prompt token'ı başına en fazla yaklaşık 0.14 s'dir. Gerçek bağlantıda da decode hızının değişmesi beklenmez.

---

## 10. Öngörü: Kayıp TP Boyutuyla Nasıl Değişir

Bölüm 5'teki üst sınırla aşağıdaki öngörüyü hesaplarken TP8'de 200 Gb/s bağlantıyla ölçülen 8K prefill süresini temel aldık. Hesaplama yükünün Spark'lara eşit dağıldığını ve nominal bağlantı hızının 100 Gb/s olduğunu varsaydık. Bölüm 9'daki dönüşümde ise ölçülen veri aktarım hızı kullanılır.

| TP boyutu | 100 Gb/s'de öngörülen TTFT artışı, 8K prompt |
|---|---|
| TP2 | ≤ %3 |
| TP4 | ≤ %8 |
| **TP8** | ≤ %17 (emüle edilmiş bağlantıda ölçülen: %13.9; gerçek kablo: ≤ %17.6) |
| TP16 | ≤ %31 |

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp-projection.png' | relative_url }}" alt="TP boyutuna göre öngörülen 100 Gb/s TTFT artışı" width="820"/></p>
<sub><i>Şekil 14: TP boyutuna göre 100 Gb/s'de beklenen TTFT artışı (örnek hesap).</i></sub>

Bu değerler birer öngörüdür. GLM-5.3, 2 veya 4 Spark üzerinde test edilmedi. Kullanılan motor ayarlarında model ağırlıkları dört düğümde ayrılan belleğe sığmaz. Hesap ayrıca sabit giderleri dışarıda bırakır. Yine de etkinin yönünü ve yaklaşık büyüklüğünü gösterir. TP16'da beklenen kayıp TP8'dekinin yaklaşık iki katıdır. Bölüm 13.6'da bu öngörü TP4'teki ölçümle karşılaştırılır. 16 Spark'ı 100 Gb/s'de iki TP8 cluster olarak çalıştırırsanız ve switch ikisini aynı anda besleyebilirse her birinde deneydekine benzer sonuç beklenir. Tek bir TP16 cluster'da kayıp yaklaşık iki katına çıkar.

---

# III. Kısım: Gerçek 100 Gb/s Bağlantılar

## 11. Gerçek 100 Gb/s Bağlantıları Kurmak

Emülasyonda iş yükünüz için kabul edilebilir bir sonuç aldıysanız bir sonraki adım gerçek 100 Gb/s bağlantıyı denemektir. Dört Spark'lı deney, aynı yöntemle hesaplanan ilk token için ek bekleme süresinin gerçek kablolarla yapılan ölçüme ne kadar yaklaştığını gösterir.

### 11.1. Kablo ve switch bağlantıları

Gerçek bir 100 Gb/s bağlantı, 2 × 200G breakout kablosunun yerine 4 × 100G'lik bir kablo kullanır. MikroTik CRS804'te (RouterOS 7.24.4) her 400G QSFP-DD yuvası 50 Gb/s'lik sekiz hat taşır ve bunların nasıl paylaşılacağını kablo belirler:

| Kablo | Bir 400G yuvasını böldüğü | Spark başına hat | Spark başına hız | Yuva başına Spark |
|---|---|---|---|---|
| FS QDD-400G-2QPC01, 1 m | 2 bağlantı | 4 | 200 Gb/s (`200G-baseCR4`) | 2 |
| FS QDD-400G-4QPC02, 2 m | 4 bağlantı | 2 | 100 Gb/s (`100G-baseCR2`) | 4 |

Her iki kablo da pasif bakır breakout kablosudur (DAC). Her iki bağlantı türünde RS ileri hata düzeltme (forward error correction, FEC91) kullanılır. Switch'te her yuva, hat başına bir tane olmak üzere sekiz alt arayüz olarak görünür (yuva 3 için `qsfp56-dd-3-1` ile `qsfp56-dd-3-8` arası). Her bağlantı, başladığı hattın adını alır. 2 kollu kabloda bunlar `-1` ve `-5`, 4 kollu kabloda ise `-1`, `-3`, `-5` ve `-7` olur. İki hatlı `100G-baseCR2` modunu yalnızca bu dört alt arayüz destekler.

Spark'ların ağ ayarlarını değiştirmek gerekmez. ConnectX-7 adaptörü, 4 kollu kablonun her kolunda kullanılan `100000baseCR2/Full` modunu destekler ve bu desteği karşı uca bildirir. Spark'ta yalnızca adresler ve 9,000 baytlık MTU ayarlandığından adaptör switch'in sunduğu hızı kullanır. Her iki ağ arayüzü de etkin kalır ve 100 Gb/s kapasiteyi paylaşır. Bölüm 7.3'teki emülasyonda ise fiziksel bağlantı 200 Gb/s'de kalmış, arayüzlerden biri kullanım dışı bırakılmıştı.

### 11.2. Dört Spark'ı tek bir yuvaya taşımak

4 kollu bir kabloyla dört Spark tek yuvaya bağlanabilir. Test için seçilen dört Spark, 200 Gb/s'de üç yuvaya bağlıydı. İkisi yuva 3'teki kabloyu paylaşıyordu. Diğer ikisi yuva 2 ve 4'teki kabloların birer kolunu kullanıyordu. Bu kabloların öbür kollarına test dışındaki Spark'lar bağlıydı. Yuva 3'teki 2 kollu kabloyu çıkarıp 4 kollu kabloyu taktık. Diğer iki Spark'ı yalnızca cihaz ucundan söktük. Böylece yuva 2 ve 4'teki kablolar yerinde kaldı ve test dışındaki Spark'ların 200 Gb/s bağlantısı korundu.

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

1. **Switch'e yönetim ağından erişebildiğinizi doğrulayın.** CRS804'ün yönetim portunu bu ağa bağlayın. Yönetim bağlantısı yoksa switch trafiği iletmeyi sürdürür ancak ayarlarına erişemezsiniz.
2. **Switch yapılandırmasını yedekleyin.** `/export terse file=before-100g` komutu ayarların okunabilir bir listesini oluşturur. Değişikliği daha sonra bu listeyle karşılaştırabilirsiniz. `/system/backup/save name=before-100g` ise acil durumda geri yüklemek üzere tam yedek alır.
3. **Modeli durdurun.** Kablolar yer değiştirdiğinde modelin Spark'lar arasındaki bağlantıları kopar.
4. **Kabloları değiştirin.** 2 kollu kabloyu switch yuvasından çıkarın. Gruptaki diğer Spark'ların kablolarını yalnızca Spark ucundan sökün. 4 kollu kabloyu switch'e, dört kolunu da Spark'lara takın. Her Spark'ta `ethtool -m` çıktısından yeni kablonun parça numarasını ve hangi kolun takılı olduğunu görebilirsiniz.
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
   İlk iki komut mevcut bağlantıları dört hattan iki hatta geçirir. Sonraki iki komut, 200 Gb/s'de kullanılmayan bağlantıları etkinleştirir ve sabit hız, MTU ve L2 MTU ayarlarını mevcut bağlantılarla eşleştirir. Böylece 9,000 baytlık IP paketleri geçebilir. Son dört komut bütün bağlantılara [8 Düğümlü Cluster Kurulum Rehberi]({{ '/papers/dgx-spark-8node-cluster-setup/' | relative_url }}) içindeki 200 Gb/s bağlantıların hizmet kalitesi (quality of service, QoS) ayarlarını uygular ve RoCE kuyruğunun hızını 100 Gbps olarak belirler. Bu ayarlar olmadan iki yeni bağlantı RoCE trafiğini diğerlerinden farklı işler. Yalnızca bu yuvanın ayarları değişir. Switch yeniden başlatılmaz.
7. **Dört Spark'ı yeniden başlatın** (Bölüm 11.4).
8. **Bağlantıları doğrulayın** (Bölüm 11.5).
9. **Modeli aynı çalıştırma ayarlarıyla başlatın.** RDMA sayaçlarından (Ek A) her Spark'ın iki ağ arayüzünden de trafik geçtiğini doğrulayın.

200 Gb/s'ye dönmek için modeli durdurun, 2 kollu kabloları geri takın ve aşağıdaki geri dönüş ayarlarını uygulayın. Ardından Spark'ları yeniden başlatıp bağlantıları doğrulayın.

```
/interface ethernet set [find default-name=qsfp56-dd-3-1] auto-negotiation=no speed=200G-baseCR4 mtu=9000 l2mtu=9500
/interface ethernet set [find default-name=qsfp56-dd-3-5] auto-negotiation=no speed=200G-baseCR4 mtu=9000 l2mtu=9500
/interface ethernet set [find default-name=qsfp56-dd-3-3] auto-negotiation=yes mtu=1500 l2mtu=1584 advertise=10M-baseT-half,10M-baseT-full,100M-baseT-half,100M-baseT-full,1G-baseT-half,1G-baseT-full,1G-baseX,2.5G-baseT,2.5G-baseX,5G-baseT,10G-baseT,10G-baseSR-LR,10G-baseCR,25G-baseSR-LR,25G-baseCR,50G-baseSR2-LR2,50G-baseCR2,50G-baseSR-LR,50G-baseCR,100G-baseSR2-LR2,100G-baseCR2
/interface ethernet set [find default-name=qsfp56-dd-3-7] auto-negotiation=yes mtu=1500 l2mtu=1584 advertise=10M-baseT-half,10M-baseT-full,100M-baseT-half,100M-baseT-full,1G-baseT-half,1G-baseT-full,1G-baseX,2.5G-baseT,2.5G-baseX,5G-baseT,10G-baseT,10G-baseSR-LR,10G-baseCR,25G-baseSR-LR,25G-baseCR,50G-baseSR2-LR2,50G-baseCR2,50G-baseSR-LR,50G-baseCR,100G-baseSR2-LR2,100G-baseCR2
/interface ethernet switch qos port set qsfp56-dd-3-1 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
/interface ethernet switch qos port set qsfp56-dd-3-5 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
/interface ethernet switch qos port set qsfp56-dd-3-3 trust-l3=ignore pfc=disabled
/interface ethernet switch qos port unset qsfp56-dd-3-3 egress-rate-queue3
/interface ethernet switch qos port set qsfp56-dd-3-7 trust-l3=ignore pfc=disabled
/interface ethernet switch qos port unset qsfp56-dd-3-7 egress-rate-queue3
```

Test edilen geri dönüş işleminde `-3` ve `-7` için karşı uca bildirilen bağlantı modları (advertised link modes) da eski değerlerine getirildi. Ardından alınan `/export terse` çıktısı, yorumlar ve boş satırlar dışında değişiklik öncesindeki çıktıyla aynıydı. Her iki işlem switch'te betik olarak saklanıp tek adımda çalıştırılabilir (`/system/script`). Bu yöntem yalnızca bir yuvayı etkiler. Tam yedeği geri yüklemekse bütün yapılandırmayı değiştirir ve switch'i yeniden başlatır. Bu durumda tüm Spark'ların bağlantısı birkaç dakika kesilir. Her iki yönde de işlem yaklaşık 15 dakika çalışma gerektirdi.

Sekiz Spark'ı 100 Gb/s'de bağlamak için aynı ayarları iki yuvaya uygulayın ve her yuvaya 4 kollu bir kablo takın. Diğer iki yuva sekiz Spark daha bağlamak için boş kalır.

### 11.4. Yeniden kablolamadan sonra yeniden başlatma

4 kollu kablo çalışan Spark'lara takıldığında tüm bağlantılar 100 Gb/s hız bildirdi ve hata sayaçlarında artış görülmedi. Buna rağmen yeni kabloya bağlı her Spark, arayüz başına ancak yaklaşık 13.4 Gb/s gönderebildi. Alım hızı normaldi.

Sınır 1, 4 ve 8 bağlantıyla aynı kaldı. RoCE trafik sınıfını kullanmak, hedef Spark'ı aynı yuvadan veya başka bir yuvadan seçmek, switch portunda hızı sabitlemek ya da otomatik hız anlaşmasını kullanmak sonucu değiştirmedi. Switch, %0–2 CPU yüküyle trafiği donanım üzerinden iletiyordu. Spark'larda hız sınırı tanımlı değildi. Kablo takıldığı anda dört Spark'ın her biri çekirdek günlüğüne `mlx5_pcie_event ... Detected insufficient power on the PCIe slot (27W)` yazdı. Normalde bu kayıt yalnızca sistem açılırken görülür. NVIDIA geliştirici forumunda başka bir 8 Spark'lı cluster'da da 4 × 100G breakout kablosu sistem çalışırken değiştirildiğinde aynı belirtinin görüldüğü bildirilmiştir.

Dört Spark yeniden başlatılınca aktarım hızı normale döndü. Hangi yönde geçiş yaparsanız yapın, kabloyu Spark'lar kapalıyken değiştirin veya değişiklikten sonra o kabloya bağlı Spark'ları yeniden başlatın. Bağlantı 100 ya da 200 Gb/s bildirdiği halde bant genişliği testinde yaklaşık 13 Gb/s görüyorsanız kabloyu değiştirmek yerine Spark'ı yeniden başlatın.

### 11.5. Bağlantıları doğrulamak

| Nerede | Neye bakılır |
|---|---|
| Switch, arayüz listesi | kullanılan her bağlantı çalışıyor |
| Switch, `/interface/ethernet/monitor` | `100Gbps`, `fec91`, kablonun parça numarası |
| Switch, log | her bağlantı için `link up (speed 100G, full duplex)` |
| Her Spark, iki arayüzde de `ethtool` | `Speed: 100000Mb/s`, `Lanes: 2` |
| Spark'tan Spark'a, `ping -M do -s 8972` | Her iki alt ağdan da yanıt gelmesi, 9,000 baytlık IPv4 paketlerinin uçtan uca iletildiğini gösterir. |
| Spark'tan Spark'a, `ib_write_bw` | yaklaşık 98 Gb/s (Bölüm 12.3); yaklaşık 13 Gb/s, yeniden başlatma gerektiği anlamına gelir |
| Switch, 2. adımdaki dışa aktarımla karşılaştırılan `/export terse` | farklar yalnızca dönüştürülen yuvada |

Testte dört Spark arasında her iki alt ağda ve her yönde 9,000 baytlık IP paketleri iletildi. CRC, sembol, FEC ve RoCE yeniden iletim hata sayaçlarında artış olmadı. Akışı duraklatan çerçeve veya switch'te düşürülen paket de kaydedilmedi.

---

## 12. TP4'te Test Tasarımı

### 12.1. Yalnızca bağlantıyı değiştirmek

TP8 çalıştırma ayarlarıyla dört Spark'ta ayrılan bellek GLM-5.3 ağırlıklarına yetmediği için gerçek 100 Gb/s bağlantıları GLM-5.3-Flash ile TP4'te ölçtük. Bölüm 7.1'deki gibi, sınanan değişken bağlantı hızıydı. Her iki koşuda da aynı Spark'lar, model, motor, çalıştırma ayarları, prompt'lar ve test planı kullanıldı. Yalnızca kablo ve ilgili switch yuvasının ayarları değişti.

### 12.2. Kurulum

| Öğe | Değer |
|---|---|
| Sistemler | 4× NVIDIA DGX Spark (GB10, 128 GB birleşik bellek) |
| Switch | MikroTik CRS804: 2 × 200G breakout kabloları (200 Gb/s); tek bir 4 × 100G breakout kablosu (100 Gb/s) |
| Model | GLM-5.3-Flash FP8 (`zai-org/GLM-5.3-Flash`): MoE; gizli boyut 4,096; 45 katman |
| Motor | SGLang 0.5.22.dev7, PyTorch 2.13 ve PyTorch ile kurulan NCCL 2.30.7 |
| Paralellik | TP4: 4 Spark'a yayılmış tek bir model örneği |
| Temel ayarlar | 8,192 token'lık prefill parçaları, FP8 KV cache, DFlash ile spekülatif kod çözme (`incoai/GLM-5.3-Flash-DFlash2`, 8 taslak token'lık bloklar), Triton attention, en fazla 8 eşzamanlı istek |
| NCCL | her Spark'ın iki RDMA cihazı, RoCE v2, zorlanmış algoritma yok |

Bölüm 3.3'teki halka formülüne göre bir prompt token'ı için her Spark'ın gönderdiği veri miktarı:

> (2 × 45 + 1) × 4,096 değer × 2 bayt × 1.5 = **1.12 MB**.

Bu miktar GLM-5.3'ün TP8'deki 3.38 MB değerinin üçte biridir. Flash modelinin gizli boyutu daha küçük ve katman sayısı daha azdır. Ayrıca TP4'te her Spark all-reduce başına bloğunun 1.75 katı yerine 1.5 katını gönderir. Dolu bir prefill parçasında toplanan blok 8,192 × 4,096 değer içerir. Değer başına 2 baytla blok boyutu 67 MB olur. Tahminde NCCL'in bu büyüklükteki bloklarda halka kullandığı varsayılır (Bölüm 3.4).

### 12.3. Gerçek 100 Gb/s bağlantı

Yeniden başlatmadan sonra iki Spark arasında RDMA yazma bant genişliği (`ib_write_bw`, 64 KB'lık mesajlar) ve gecikmesi (`ib_write_lat`):

| | 200 Gb/s | Emüle edilmiş 100 Gb/s (Bölüm 7.3) | Gerçek 100 Gb/s |
|---|---|---|---|
| Bant genişliği, tek arayüz | 109 Gb/s | 109 Gb/s | 97.8 Gb/s |
| Bant genişliği, iki arayüz | 191–195 Gb/s | (yalnızca tek arayüz) | 49.0 + 49.0 = 98.0 Gb/s |
| Gecikme, 2 bayt | 2.49 µs | | 2.47 µs |
| Gecikme, 8 KB | 4.78 µs | | 5.02 µs |

Gerçek 100 Gb/s bağlantı tek arayüzle de iki arayüzle de yaklaşık **98 Gb/s** veri taşır. Bu hız emülasyonda ölçülenden yaklaşık %10 düşüktür. Küçük mesajların gecikmesi değişmedi. 8 KB'lık mesajda ölçülen 0.24 µs'lik ek süreye hem veri aktarımı hem de sabit gecikmeler dahildir.

B_new = 98 Gb/s alındığında Bölüm 5.1'deki sınır şu hale gelir:

> **Ek prefill süresi ≤ Spark başına prefill verisi (gigabit) × (1/98 − 1/200)**. GLM-5.3-Flash için TP4'te bu değer **1,000 prompt token'ı başına yaklaşık 0.047 s**'dir.

| Test | Tahmin, 200 → 98 Gb/s |
|---|---|
| P1: 1K | ≤ +0.05 s |
| P2: 8K | ≤ +0.38 s |
| P3: 32K | ≤ +1.53 s |
| P4: 4 × 8K | ≤ +1.53 s |
| P5: 64K | ≤ +3.05 s |
| P6: 4 × 16K | ≤ +3.05 s |

### 12.4. Test planı ve ölçümler

Bölüm 7.4–7.6'daki test planı, ölçüm yöntemi ve önlemler burada da kullanıldı. P1–P6 testlerinin her biri için bir ısınma ve üç ölçüm turu planlandı. Her iki hızda aynı prompt'lar ve 1,024 çıktı token'ı kullanıldı. Bir Spark'ın RDMA sayaçları her milisaniyede bir okundu ve isteklere zaman damgası veren saatle kaydedildi. 200 Gb/s ve 100 Gb/s koşuları art arda iki günde yapıldı. Model her koşu için ayrı başlatıldı. 200 Gb/s koşusunda P5 sırasında bir Spark'ın elektriği kesildi. P5 ölçümü model yeniden başlatıldıktan sonra alındı. P6 için 200 Gb/s'de ölçüm yapılmadı.

İki bağlantı hızında da NCCL trafiğini her Spark'ın iki ağ arayüzüne eşit olarak dağıttı (%49.9 ve %50.1).

---

## 13. Sonuçlar: TP4'te 200 Gb/s ve Gerçek 100 Gb/s

### 13.1. Her testteki trafik

Şekil 16–20'de her testin üç ölçüm turunda bir Spark'ın gönderdiği trafik gösterilir. Üstte 200 Gb/s, altta gerçek 100 Gb/s bağlantı vardır. İki grafik aynı zaman eksenini kullanır. Gri alan her turda prefill'in başlangıcından son isteğin ilk token'ı gelene kadar uzanır.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p1-1k-200g-vs-100g.png' | relative_url }}" alt="TP4'te 1K token'lık prompt: 200 Gb/s ve gerçek 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 16: P1, 1K token'lık prompt, 1 istek.</i></sub>

1K prompt'ta prefill patlamaları her iki hızda da yaklaşık 70–80 Gb/s'ye ulaşır. Bu değer gerçek 100 Gb/s bağlantının taşıyabildiği trafiğin altındadır.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p2-8k-200g-vs-100g.png' | relative_url }}" alt="TP4'te 8K token'lık prompt: 200 Gb/s ve gerçek 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 17: P2, 8K token'lık prompt, 1 istek.</i></sub>

8K prompt'un prefill aşamasında 200 Gb/s bağlantıdaki trafik patlamaları 200 Gb/s'ye yaklaşır. Gerçek 100 Gb/s bağlantıda aynı aktarımlar hattın hız sınırına ulaşır ve daha uzun sürer. TTFT 3.09 s'den 3.47 s'ye çıkar. Decode trafiği iki grafikte de aynı görünür.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p3-32k-200g-vs-100g.png' | relative_url }}" alt="TP4'te 32K token'lık prompt: 200 Gb/s ve gerçek 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 18: P3, 32K token'lık prompt, 1 istek.</i></sub>

32K prompt'ta benzer trafik daha uzun bir prefill süresine yayılır. TTFT 26.29 s'den 28.17 s'ye çıkar. Her bağlantı hızında en hızlı ve en yavaş turlar arasındaki fark en fazla 0.2 s'dir.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p4-4x8k-200g-vs-100g.png' | relative_url }}" alt="TP4'te aynı anda gelen dört 8K token'lık prompt: 200 Gb/s ve gerçek 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 19: P4, aynı anda gelen dört 8K token'lık prompt.</i></sub>

Dört prompt birlikte geldiğinde 200 Gb/s'deki birinci ve üçüncü turlarda prefill sırasında Spark'ın hiç veri göndermediği aralıklar görülür. Son isteğin ilk token'ına kadar geçen süre tura göre 11.8 s ile 20.2 s arasında değişir.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/glmflash-tp4-p5-64k-200g-vs-100g.png' | relative_url }}" alt="TP4'te 64K token'lık prompt: 200 Gb/s ve gerçek 100 Gb/s'de ağ trafiği" width="820"/></p>
<sub><i>Şekil 20: P5, 64K token'lık prompt, 1 istek.</i></sub>

64K prompt'ta P3'tekine benzer trafik patlamaları görülür. Her iki hızda da prefill 80 s'den uzun sürer.

5 ms'lik aralıkların ortalamalarına bakıldığında P2 ve sonrasındaki testlerde prefill trafiği 200 Gb/s bağlantıda 151–160 Gb/s'ye çıkar. Gerçek 100 Gb/s bağlantıda 97.6–98.0 Gb/s'ye, yani Bölüm 12.3'te ölçülen sınıra ulaşır. Her iki hızda da decode sırasında ortalama trafik 0.9–2.3 Gb/s'dir.

### 13.2. Prompt token'ı başına trafik

Uzun prompt'larda her Spark'ın prefill sırasında gönderdiği veri, her iki bağlantı hızında da **prompt token'ı başına 1.14 MB** olarak ölçüldü. Bu, Bölüm 12.2'de hesaplanan 1.12 MB'tan %2 fazladır. 100 Gb/s koşusunun tamamında dört Spark'ın her biri 1,294 GB gönderdi. Aralarındaki fark %0.02'yi geçmedi. Hem token başına veri miktarı hem de Spark'lar arasındaki bu denge, prefill trafiği tahmininde kullanılan halka modelini destekler.

### 13.3. TTFT

Tabloda üç turun ortalaması, parantez içinde de en düşük ve en yüksek değerler verilmiştir. P4 ve P6'da süre, dört isteğin sonuncusu ilk token'ını aldığında durur.

| Test | 200 Gb/s | Gerçek 100 Gb/s | Artış |
|---|---|---|---|
| P1: 1K | 0.67 s (0.66–0.67) | 0.74 s (0.70–0.82) | **+0.08 s (+%11.4)** (tahmin: ≤ +0.05 s) |
| P2: 8K | 3.09 s (2.97–3.31) | 3.47 s (3.34–3.62) | **+0.39 s (+%12.6)** (tahmin: ≤ +0.38 s) |
| P3: 32K | 26.29 s (26.27–26.33) | 28.17 s (28.11–28.28) | **+1.88 s (+%7.1)** (tahmin: ≤ +1.53 s) |
| P4: 4 × 8K, son isteğin ilk token'ı | 16.05 s (11.80–20.22) | 14.62 s (13.27–17.21) | −1.43 s (tahmin: ≤ +1.53 s) |
| P5: 64K | 86.00 s (85.55–86.44) | 83.43 s (83.17–83.71) | −2.57 s (tahmin: ≤ +3.05 s) |
| P6: 4 × 16K, son isteğin ilk token'ı | ölçülmedi | 44.89 s (41.03–48.77) | |

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/tp4-measured-vs-estimate.png' | relative_url }}" alt="TP4'te gerçek 100 Gb/s'de ek prefill süresi: test başına tahmin ve ölçüm" width="820"/></p>
<sub><i>Şekil 21: TP4'te bağlantı 200'den gerçek 100 Gb/s'ye düştüğünde ek prefill süresi: tahmin (Bölüm 12.3) ve ölçüm.</i></sub>

Gerçek bağlantıda tek bir 8K prompt için mimariden hesaplanan ek bekleme süresi ile ölçüm arasındaki fark 0.01 s idi. İlk token, tahmin edilen 0.38 s'ye karşılık 0.39 s daha geç geldi. Ölçülen ek süre 1,000 prompt token'ı başına yaklaşık 0.047 s'dir. Diğer prompt uzunlukları Bölüm 13.5'te ele alınır.

TTFT'deki oransal artış 8K'da %12.6 iken 32K'da %7.1'e düşer. Aktarılan veri prompt uzunluğuyla orantılı artar. Bu yapılandırmada prefill süresi daha hızlı artar (8K'da 3.1 s, 32K'da 26.3 s, 64K'da 86 s). Böylece uzun prompt'larda ağın toplam süre içindeki payı azalır. Bölüm 6.1'de hesaplama yükü prompt uzunluğundan daha hızlı büyüyen modeller için açıklanan durum budur.

### 13.4. Decode hızı

| Test | 200 Gb/s | Gerçek 100 Gb/s | Değişim |
|---|---|---|---|
| P1: 1K | 31.5 token/s | 33.6 token/s | +%6.8 |
| P2: 8K | 23.8 token/s | 24.6 token/s | +%3.4 |
| P3: 32K | 15.6 token/s | 15.1 token/s | −%3.3 |
| P4: 4 × 8K | istek başına 11.4 token/s | istek başına 11.8 token/s | +%3.7 |
| P5: 64K | 12.0 token/s | 12.2 token/s | +%2.2 |

TP8 emülasyonunda olduğu gibi gerçek TP4 bağlantılarda da decode hızı pratikte değişmedi. Testler arasında hem artış hem azalış görüldü. P2'nin yalnızca 200 Gb/s'deki turlarında bile hız 21.9 ile 25.8 token/s arasında değişiyordu.

### 13.5. Ölçümün tahminden ayrıldığı yerler

**1K prompt.** Gerçek 100 Gb/s bağlantıda üç turdan ikisi 0.70–0.71 s sürdü. 200 Gb/s'de ölçülen 0.66–0.67 s'ye göre bu fark tahmin sınırları içindeydi. Üçüncü turda 0.82 s ölçüldü. Trafik patlamaları her iki hızda da 100 Gb/s'nin altında kaldı (Şekil 16). Ayrı ayrı başlatılan model koşularında TTFT biraz arttı, ancak trafik kaydında bağlantının darboğaz oluşturduğuna dair belirgin bir bulgu yoktur.

**32K prompt.** Ölçülen artış tahmini 0.35 s aştı. Bu fark TTFT'nin %1.3'üne karşılık gelir. Aynı hızdaki turlar arasındaki fark en fazla 0.2 s olduğundan, farklı günlerde modelin ayrı ayrı başlatıldığı iki koşu arasındaki süre farkı ölçümde açıkça görülür.

**Aynı anda gelen dört 8K prompt.** Bağlantıdan beklenen etki en fazla 1.5 s iken 200 Gb/s'deki turlar arasında 8.4 s fark vardı. Şekil 19'daki duraklamalar, Bölüm 8.6'daki gibi, motorun dört prompt'u her turda farklı zamanlamasından kaynaklandı. Bu testten bağlantı hızının etkisi çıkarılamaz.

**64K prompt.** 200 Gb/s'de P5, P1–P4 ölçümlerinden sonra model yeniden başlatılarak ölçüldü. Gerçek 100 Gb/s bağlantıdaki ölçümden 2.6 s daha uzun sürdü. 64K prompt'ta veri aktarımı prefill süresinin yalnızca %3.5'ini oluşturur. Bu nedenle modelin iki ayrı çalıştırılması arasındaki küçük bir fark bile bağlantı hızının etkisini aşabilir.

### 13.6. TP boyutu öngörüsü

Bölüm 10'daki hesapta GLM-5.3 mimarisine benzer bir model ve 8K prompt için TP4'te en fazla %8 artış öngörülmüştü. GLM-5.3-Flash token başına çok daha az işlem yapar. Bu yüzden ağın prefill süresindeki payı daha büyüktür. Bu model için hesaplanan üst sınır %12.4, ölçülen artış %12.6'dır. Öngörü tablosundaki değerler GLM-5.3'e özgüdür. Yöntemi başka bir modele uygulamak için o modelin prompt token'ı başına gönderdiği veri miktarı ve 200 Gb/s'de ölçülmüş bir TTFT değeri yeterlidir.

---

## 14. 100 Gb/s Makul mü?

Evet. TP8'e kadar tensör paralel DGX Spark cluster'larında, ilk token için ek bekleme süresi iş yükünün TTFT hedefini aşmıyorsa 100 Gb/s uygun bir seçimdir.

> **Emüle edilmiş bağlantıda tek bir uzun prompt'un ilk token'ı yaklaşık %13–14 daha geç geldi. Dört uzun prompt birlikte gönderildiğinde istek başına ortalama TTFT yaklaşık %18–23 arttı. Gerçek bağlantı için tahmini artış sırasıyla en fazla yaklaşık %18 ve %28'dir. TP8'de kısa prompt'ta ölçülebilir bir yavaşlama görülmedi. Her iki TP boyutunda da yanıt başladıktan sonra token'lar aynı hızda geldi.**

| İş yükü | Ölçülen (emüle edilmiş 100 Gb/s) | Gerçek 100 Gb/s kablo, en fazla |
|---|---|---|
| Kısa prompt'lu sohbet (yaklaşık 1K token) | ölçülebilir fark yok | yaklaşık +%4 |
| Çok uzun bir prompt: RAG, uzun belgeler (8K–64K token) | TTFT +%12.6–13.9 | TTFT +%18 (1,000 prompt token'ı başına en fazla 0.14 s) |
| Aynı anda gelen birkaç çok uzun prompt | istek başına TTFT +%17.9–22.5 | istek başına TTFT +%28 |
| Her durumda decode hızı | değişmiyor | değişmiyor |

Tablonun gerçek bağlantı sütunu, ölçülen veri aktarım hızını ve benzer zamanlama varsayımını TP8 iş yüküne uygular. Kendi iş yükünüz için mevcut kablolarla önce her iki arayüzü, ardından tek arayüzü kullanarak ölçüm yapın (Bölüm 7.3). Bölüm 9'daki dönüşümde bu koşularda ölçtüğünüz veri miktarını ve TTFT'yi kullanın.

Her dört Spark için bir 4 × 100G breakout kablosu kullanıldığında **CRS812** üzerindeki iki 400G portuna sekiz Spark bağlanır. 200 Gb/s'de aynı portlara dört Spark bağlanır.

TP4'te **tek bir 8K prompt için ölçülen ek süre 0.39 s** idi. GLM-5.3-Flash mimarisinden ve iki bağlantı hızından hesaplanan tahmin 0.38 s idi. Dört Spark bir breakout kablosunu paylaşır. Yalnızca kablonun takıldığı switch yuvasını yapılandırmak gerekir. Spark'ların ağ ayarları aynı kalır. Kabloları değiştirdikten sonra Spark'ları yeniden başlatın (Bölüm 11).

Spark başına 100 Gb/s hızda bir **CRS804** ile 16 Spark bağlanabilir. Bunları iki TP8 cluster olarak çalıştırırsanız her Spark deneydekiyle aynı bağlantı hızını kullanır. Sonuçların her iki cluster için de geçerli olabilmesi için switch'in tüm portlardan aynı anda tam hızda iletim yapabildiği doğrulanmalıdır. Tek bir TP16 cluster'da kaybın yaklaşık iki katına çıkması beklenir (Bölüm 10). Bu nedenle 100 Gb/s'de bu yapılandırma önerilmez.

İş yükünün çoğunu düşük TTFT gerektiren uzun prompt'lar oluşturuyorsa, çok sayıda kullanıcı aynı anda uzun prompt gönderiyorsa veya modelin sekizden fazla Spark'a bölünmesi gerekiyorsa 200 Gb/s daha uygun seçimdir.

---

## 15. Sınırlar ve Dikkat Edilmesi Gerekenler

Ölçümler iki model ve iki çıkarım motorunu kapsar. GLM-5.3 vLLM ile TP8'de, GLM-5.3-Flash SGLang ile TP4'te çalıştırıldı. Başka model, motor ve ayarlarda hem veri miktarı hem hesaplama hızı değişir. Aynı yöntem kullanılabilir, ancak değerler yeniden hesaplanmalıdır. TP8'de 100 Gb/s bağlantı tek ağ arayüzüyle emüle edildi. Bölüm 9'daki hesap gerçek bağlantıdan beklenen farkı sınırlar. Gerçek bağlantıda ölçüm yalnızca TP4'te yapıldı. Bölüm 10'daki diğer TP boyutlarına ait değerler hesapla elde edilmiştir.

4 × 100G breakout, CRS804 üzerinde FS QDD-400G-4QPC02 kablolarıyla doğrulandı. Başka bir switch veya kablo seçerseniz QSFP-DD portlarının planladığınız yapılandırmada 4 × 100G breakout desteklediğini kontrol edin. DGX Spark'ın ConnectX-7 adaptörünün seçtiğiniz kabloyla 100 Gb/s'de bağlantı kurduğunu da doğrulayın. 16 Spark bağlayacaksanız switch'in bütün portlardan aynı anda tam hızda iletim yapabildiğini sınayın.

### Cluster ağını boyutlandırırken yaygın hatalar

- ✗ **Yanlış sayaçları okumak:** standart Linux araçları (`ip -s link`, `nload`, `sar`) RDMA trafiğini görmez; bu yüzden çıkarım sırasında neredeyse boşta bir bağlantı gösterir.
- ✗ **Bağlantı kullanımını ortalamalardan değerlendirmek:** bir saniyelik ya da switch portu ortalamaları, TTFT'yi belirleyen milisaniyelik patlamaları gizler.
- ✗ **Yarı bağlantı hızının yarı çıkarım hızı demek olduğunu varsaymak:** yalnızca prefill sırasındaki patlamalar yavaşlar; decode yavaşlamaz.
- ✗ **100 Gb/s'de bir modeli gerekenden fazla Spark'a yaymak:** kayıp TP boyutuyla büyür.
- ✗ **Çalışan Spark'larda kablo değişiminden sonra yeniden başlatmayı atlamak.** Bağlantılar doğru hızda kurulsa bile gönderim hızı arayüz başına yaklaşık 13 Gb/s ile sınırlı kalabilir.

### Bir DGX Spark cluster ağı planlamak için kontrol listesi

- ☐ Model örneği başına TP boyutu belirlendi mi (TP4, TP8 ya da 16 Spark'ta iki TP8 örneği)?
- ☐ Beklenen prompt uzunluğu biliniyor mu (sohbet, RAG, uzun belgeler)?
- ☐ Uzun prompt'lar için bir TTFT hedefi var mı?
- ☐ 100 Gb/s'ye geçişin etkisi hesaplandı mı (prompt token'ı başına bit × prompt token sayısı ÷ 200 Gb/s, Bölüm 5)?
- ☐ İş yükü emüle edilmiş 100 Gb/s bağlantıda (Bölüm 7.3) çalıştırıldı mı ve gerçek bir bağlantıya dönüştürülen sonuç (Bölüm 9) kabul edilebilir mi?
- ☐ Breakout desteği ve ConnectX-7'nin planlanan hızda bağlantı kurması doğrulandı mı?
- ☐ Spark'lar yeniden kablolamadan sonra yeniden başlatıldı mı ve `ib_write_bw` 100 Gb/s bağlantı başına yaklaşık 98 Gb/s gösteriyor mu?
- ☐ RDMA trafiği, milisaniye çözünürlüğünde RDMA sayaçlarıyla izleniyor mu?

---

## 16. Sonuç

Test ettiğimiz DGX Spark'larda tensör paralel çıkarım için 100 Gb/s kullanılabilir. Prefill sırasında büyük kolektif aktarımlar kısa sürelerle bağlantının tüm kapasitesini kullanır. Bu nedenle bağlantı yavaşladığında uzun prompt'un ilk token'ı gecikir. Yanıt başladıktan sonra hem TP4'te hem TP8'de token'lar aynı hızda gelir.

Kabloyu değiştirmeden önce modelin prompt token'ı başına gönderdiği veri miktarını bağlantı hızlarının tersleri arasındaki farkla çarparak ek süreyi tahmin edebilirsiniz. GLM-5.3 için TP8'de nominal hızlarla hesaplanan üst sınır, 1,000 prompt token'ı başına 0.135 s ek aktarım süresidir. Emüle edilmiş bağlantıda tek başına gelen 8K–64K prompt'larda TTFT %12.6–13.9 arttı. Dört uzun prompt birlikte geldiğinde istek başına ortalama artış %17.9–22.5 oldu. 1K prompt'ta ölçülen fark turlar arasındaki değişkenlik içinde kaldı. TP4'te gerçek bağlantıda tek bir 8K prompt'un ilk token'ı 0.39 s daha geç geldi. Tahmin 0.38 s idi.

TP8'de zamanlama benzer kalırsa gerçek bağlantıda **tek bir uzun prompt için TTFT'nin en fazla yaklaşık %18, dört uzun prompt birlikte geldiğinde ise istek başına ortalama TTFT'nin en fazla yaklaşık %28 artması** beklenir. Breakout kablosunu seçmeden önce kendi iş yükünüzü mevcut 200 Gb/s kablolarla deneyin. Spark başına 100 Gb/s hızda CRS812'nin iki 400G portuna sekiz, CRS804'ün dört 400G portuna on altı Spark bağlanabilir. On altı Spark'ı iki TP8 cluster olarak çalıştırın ve switch'in aynı anda tüm portlarda tam hıza ulaşabildiğini doğrulayın. Tek bir TP16 model örneğinde öngörülen gecikme artışı daha büyüktür.

---

## Ek A: RDMA Trafiğini Ölçmek

RDMA trafiği işletim sisteminin ağ yığınından geçmediği için standart arayüz istatistiklerinde görünmez. Her iki RDMA cihazında ConnectX-7 portunun gönderme ve alma sayaçları okundu (`/sys/class/infiniband/` altında `port_xmit_data` ve `port_rcv_data`, sayaç birimi 4 bayt). Değerler fiziksel port için toplandı. Adaptörün kendi bayt sayaçlarıyla karşılaştırmada fark %0.2'yi geçmedi.

Tek bir Spark'ta çalışan örnekleyici, sayaçları her 1 ms'de bir okudu. Her okumaya, benchmark isteklerinin de kullandığı saatle ayrı zaman damgası verdi. 1 ms ve daha uzun aralıkların hızını hesaplamak için iki okuma arasında aktarılan baytlar, süreleriyle orantılı olarak ilgili ortalama alma aralıklarına dağıtıldı. Sayaç farkı iki okuma arasındaki veri miktarını verir. Ancak okuma zamanındaki belirsizlik yaklaşık ±0.1–0.2 ms'dir. Bu nedenle tek bir 1 ms ölçümündeki belirsizlik yaklaşık ±%15–25'tir. Şekillerde bazı 1 ms değerlerinin bağlantı hızını biraz aşması bundan kaynaklanır. 5 ms ve daha uzun aralıklarda ortalamaların hatası yüzde birkaç düzeyindedir.

Bölüm 8.1'deki aynı trafik kaydında tepe değer 1 ms aralıklarla 181 Gb/s, 5 ms aralıklarla 96 Gb/s ve 100 ms aralıklarla 44 Gb/s olarak ölçüldü. Genel ortalama aynı kaldı. Bu yüzden bir tepe değerini yorumlarken hangi aralıkta ortalama alındığını da bilmek gerekir.

<p><img src="{{ '/papers/dgx-spark-link-speed-tensor-parallel/images/window-choice.png' | relative_url }}" alt="1 ms, 5 ms ve 100 ms aralıklarla ortalaması alınmış aynı 8K prefill trafiği" width="820"/></p>
<sub><i>Şekil A1: 1 ms, 5 ms ve 100 ms aralıklarla ortalaması alınmış aynı prefill trafiği.</i></sub>

Örnekleyici çalışırken ve durdurulmuşken yapılan bant genişliği ve gecikme testleri (`ib_write_bw`, `ib_write_lat`) ölçümün kendisinin ağı etkilemediğini gösterdi. Bant genişliği değerleri aynı düzeydeydi (109.07, 109.08 ve 109.15 Gb/s). Gecikmede en fazla yaklaşık %1 fark görüldü. Örnekleyici ve test sürücüsünün toplam işlemci kullanımı, Spark'ın 20 CPU çekirdeğinden birinin kapasitesinin çok altında kaldı.

Örnekleyici ile test sürücüsü açık kaynaklı [netinfermon](https://github.com/openzeka/netinfermon) aracında bulunabilir. Araç, çıkarım uç noktasında bir test planı çalıştırırken ConnectX-7 adaptörünün RDMA sayaçlarını milisaniye çözünürlüğünde kaydeder.

---

## Ek B: Tekrarlanabilirlik

| Öğe | Değer |
|---|---|
| Test sürücüsü | Motora akış modunda istek gönderir. Yanıttaki ilk token'a ve sonraki her token'a zaman damgası verir. RDMA sayaçlarını da aynı saatle kaydeder (Bölüm 7.4–7.6, Ek A). İstekler açık kaynaklı [LLM Benchmark Tool](https://github.com/openzeka/llm-benchmark) ile üretilir. |
| Model | `Inferact/GLM-5.3-NVFP4` |
| Motor | vLLM `0.1.dev20133+gb5f995e73`, container `vllm-node-b12x`, NCCL 2.31.2 |
| Servis ayarları | `--tensor-parallel-size 8`, `--max-num-batched-tokens 4096`, `--long-prefill-token-threshold 2048`, `--max-num-seqs 8`, `--max-model-len 262144`, `--kv-cache-dtype fp8`, `--gpu-memory-utilization 0.726`, `--enable-chunked-prefill`, `--enable-prefix-caching`; spekülatif kod çözme: MTP, 4 token, taslak bölünmez |
| NCCL | iki RDMA cihazıyla `NCCL_IB_HCA` (200 Gb/s); ikinci cihaz dışarıda (100 Gb/s emülasyonu); RoCE v2, GID indeksi 3 |
| Plan | P1–P6 testleri (Bölüm 7.4), 1 ısınma ve 3 ölçüm turu, sabit tohum, 1,024 çıktı token'ı |

III. Kısım'daki TP4 ölçümleri için:

| Öğe | Değer |
|---|---|
| Model | `zai-org/GLM-5.3-Flash` (FP8), spekülatif taslak `incoai/GLM-5.3-Flash-DFlash2` |
| Motor | #36708 numaralı pull request'i içeren SGLang 0.5.22.dev7, PyTorch 2.13 ve PyTorch ile kurulan NCCL 2.30.7 |
| Servis ayarları | `--tp-size 4`, `--chunked-prefill-size 8192`, `--max-running-requests 8`, `--context-length 262144`, `--kv-cache-dtype fp8_e4m3`, `--mem-fraction-static 0.8`, `--attention-backend triton`; spekülatif kod çözme: `--speculative-algorithm DFLASH`, blok başına 8 taslak token |
| NCCL | iki RDMA cihazıyla `NCCL_IB_HCA`; RoCE v2, trafik sınıfı 106 |
| Ağ | 200 Gb/s: FS QDD-400G-2QPC01 (2 × 200G); 100 Gb/s: FS QDD-400G-4QPC02 (4 × 100G); MikroTik CRS804, RouterOS 7.24.4 |
| Plan | yukarıdaki gibi |

---

## Sözlük (Terimler)

- **Aktivasyonlar:** Her token'ı modelin katmanlarından geçerken temsil eden vektörler.
- **All-reduce:** Cihazlardaki kısmi değerleri toplayıp toplamı her cihaza dağıtan kolektif işlem.
- **Bant genişliğiyle sınırlı / gecikmeyle sınırlı:** Bir aktarımın süresi bağlantının baytları ne kadar hızlı taşıdığıyla belirleniyorsa bant genişliğiyle sınırlıdır (büyük aktarımlar), sabit gecikmelerle belirleniyorsa gecikmeyle sınırlıdır (küçük aktarımlar).
- **Breakout kablosu:** Hızlı bir switch portunu (örneğin 400 Gb/s) birkaç daha yavaş bağlantıya (örneğin 4 × 100 Gb/s) bölen kablo.
- **ConnectX-7:** DGX Spark'a yerleşik NVIDIA ağ adaptörü.
- **Decode:** Cevabı, her seferinde bir ileri yayılımla üreten aşama.
- **İleri hata düzeltme (FEC):** Alıcının bit hatalarını düzeltebilmesi için bağlantıda asıl veriye eklenen bilgi.
- **Decode hızı:** İlk token'dan sonra saniyede üretilen çıktı token'ı sayısı.
- **Emülasyon:** Bir koşulu (burada 100 Gb/s'lik bir bağlantıyı) yazılımda modellemek yerine gerçek donanım üzerinde yeniden üretmek.
- **İleri yayılım:** Modelin katmanlarının o anda işlenen token'lar üzerinde bir kez çalıştırılması.
- **Gizli boyut:** Model içinde her token'ı temsil eden vektörün uzunluğu (GLM-5.3 için 6,144).
- **Çok token'lı tahmin (MTP):** Modelin birkaç taslak token ürettiği ve bunları tek bir ileri yayılımda doğruladığı spekülatif kod çözme yöntemi.
- **NCCL:** NVIDIA'nın GPU'lar arası iletişim kütüphanesi; çıkarım motoru all-reduce için bunu kullanır.
- **Ağ arayüzü:** Ağ adaptörünün bir bağlantısını işletim sisteminde temsil eden arayüz. Burada her ConnectX-7 portu, PCIe bağlantılarının her biri için ayrı bir arayüz olarak görünür.
- **Prefill süresindeki ağ payı:** Prefill baytlarını 200 Gb/s'de göndermek için gereken sürenin prefill süresine bölümü.
- **Nominal bağlantı hızı:** Bir bağlantının protokol ek yükünden önceki anma hızı (burada 200 Gb/s).
- **NVFP4:** NVIDIA'nın 4 bitlik kayan nokta sayı formatı; her 16 değerlik grup bir ölçekleme faktörünü paylaşır.
- **Prefill:** İlk çıktı token'ından önce prompt'u işleyen aşama.
- **Hizmet kalitesi (QoS):** Trafiği sınıflara ayıran ve her sınıfa ayrı kurallar uygulayan switch ayarları. Burada RoCE trafiği kendi sınıfında tutulur.
- **Prefill parçası:** Prompt'un tek bir ileri yayılımda işlenen bölümü (TP8 yapılandırmasında en fazla 4,096 token).
- **RDMA:** Ağ adaptörünün uygulama belleğini doğrudan okuyup yazmasına olanak veren uzaktan doğrudan bellek erişimi. Veri işletim sisteminin ağ yığınından geçmez.
- **Halka all-reduce:** Cihazların verinin segmentlerini bir halka etrafında aktardığı all-reduce; her cihaz toplamda verinin 2 × (N − 1) / N katını gönderir.
- **RoCE v2:** RDMA over Converged Ethernet, sürüm 2: standart Ethernet üzerinde UDP/IP içinde taşınan RDMA paketleri.
- **Tensör paralelliği (TP):** Modelin tensör işlemlerini birden fazla cihaza paylaştıran yöntem. Cihazlar her adımdan sonra kısmi sonuçları birleştirir.
- **Ağaç all-reduce:** Kısmi toplamların ağacın köküne iletildiği ve sonucun kökten dallara dağıtıldığı all-reduce algoritması. Sabit gecikmeler log₂ N ile artar. Her cihazın gönderdiği veri miktarı ağaçtaki konumuna göre değişir. NCCL, her biri verinin yarısını taşıyan iki ağaç kullanır (çift ikili ağaç).
- **İlk token'a kadar geçen süre (TTFT):** İsteğin gönderilmesiyle yanıtın ilk token'ının alınması arasında geçen süre.

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
- LLM Benchmark Tool — <https://github.com/openzeka/llm-benchmark>
- netinfermon (RDMA trafiği kaydeden çıkarım benchmark'ı) — <https://github.com/openzeka/netinfermon>

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

- **Tahminler.** Bölüm 3–6'daki hesaplar yalnızca model yapılandırmasını, motor ayarlarını ve bağlantı hızını kullanır. Üst sınırlar, belirtilen varsayımlar altında aktarıma eklenecek süre içindir. Bölüm 10'daki TP boyutu öngörüsü ölçülen TP8 değerini temel alır ve örnek niteliğindedir.
- **Ölçümler.** Performans değerleri Bölüm 7'deki 8× DGX Spark üzerinde GLM-5.3 ile TP8'de ve Bölüm 12'deki 4× DGX Spark üzerinde GLM-5.3-Flash ile TP4'te ölçüldü. Ağ trafiği için tek bir Spark'ın ConnectX-7 RDMA sayaçları okundu (Ek A).
- **Emülasyon.** TP8'de mevcut kablolara dokunmadan 100 Gb/s bağlantı emüle edildi. Bunun için her ConnectX-7 portundaki iki ağ arayüzünden yalnızca biri kullanıldı. Tek arayüz en fazla 109 Gb/s taşır. Bölüm 9'da bu ölçümlerden, 98 Gb/s taşıyan gerçek bir 100G kabloda beklenen etki hesaplanır. TP4'te ise testler gerçek 100G kablolarla yapıldı.
- **Güncellik:** Motor sürümleri ve ayarları hızla değişir; sonuçlar Ekim 2026 itibarıyla listelenen sürümler için geçerlidir.

---

{% include company/block.html name="cta_logo" %}

**DGX Spark cluster ağınızı birlikte planlayalım.** Model boyutunu, tensör paralelliğini ve bağlantı hızını hesaba katan bir boyutlandırma için {% include company/block.html name="contact_cta" %}
