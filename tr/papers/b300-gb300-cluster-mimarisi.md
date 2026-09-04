---
title: NVIDIA DGX B300 ve GB300 NVL72 Cluster Mimarisi Karşılaştırması
parent: White Papers
nav_order: 7
lang: tr
page_id: b300-gb300-cluster-mimarisi
card_order: 9
card_tag: "Mimari Karşılaştırma"
card_date: "Temmuz 2026"
description: >-
  NVIDIA Blackwell Ultra tabanlı iki mimarinin karşılaştırması, DGX B300 ve GB300
  NVL72: sistem tasarımı, ölçekleme yaklaşımı, ağ mimarisi, güç ve soğutma, hangi
  iş yükünün hangi platforma uyduğu.
permalink: /papers/b300-gb300-cluster-mimarisi/
last_modified_date: 2026-07-31
toc: true
---

*Hazırlayan: **Openzeka Teknoloji A.Ş.** — NVIDIA Türkiye & MEA Resmî Gömülü Hesaplama Distribütörü ve NVIDIA Elite Partner*

*Platform: NVIDIA Blackwell Ultra (B300 SXM) · Temmuz 2026*

---

## İçindekiler

* TOC
{:toc}

---

## 1. Amaç ve Kapsam

Bu çalışma, yeni nesil yapay zekâ altyapısı için değerlendirilebilecek iki NVIDIA Blackwell Ultra tabanlı mimari olan **NVIDIA DGX B300** ve **NVIDIA GB300 NVL72** çözümlerinin teknik olarak karşılaştırılması amacıyla hazırlanmıştır.

Her iki platform da NVIDIA Blackwell Ultra GPU mimarisini kullanmasına rağmen sistem tasarımı, ölçekleme yaklaşımı, işlemci mimarisi, GPU bağlantı modeli, ağ mimarisi, sanallaştırma yaklaşımı, veri merkezi güç ve soğutma gereksinimleri ile hedeflenen iş yükleri açısından önemli farklılıklar göstermektedir.

Bu nedenle DGX B300 ve GB300 NVL72 birbirinin doğrudan alternatifi olarak değil, farklı iş yükü profillerine optimize edilmiş iki farklı altyapı yaklaşımı olarak değerştirilmelidir.

Bu dokümanda, her iki platformun da örnek bir cluster tasarımı üzerinden incelenmesi hedeflenmiştir:

* DGX B300 tarafında **çoklu DGX B300 sunucu** (örnek olarak ~40 node)
* GB300 tarafında **çoklu GB300 NVL72 rack** (örnek olarak ~4 rack)
* ortak yüksek performanslı depolama
* ayrı Compute, Storage/In-band ve OOB ağları
* NVIDIA Mission Control / BCM / Run:ai yönetim katmanı

---

## 2. NVIDIA DGX B300 Genel Mimarisi

NVIDIA DGX B300, tek bir sunucu içerisinde **8 adet NVIDIA B300 Blackwell Ultra GPU** barındıran, klasik x86 sunucu mimarisine daha yakın bir yapay zekâ sistemidir. NVIDIA sistemi training, inference ve analytics dahil genel AI altyapı iş yükleri için tasarlanmış bir platform olarak tanımlamaktadır.

Her DGX B300 sistemi:

| Özellik | DGX B300 |
| ----- | ----- |
| GPU | 8 × NVIDIA B300 Blackwell Ultra |
| GPU belleği | Yaklaşık 2.3 TB toplam HBM |
| CPU | 2 × Intel Xeon Platinum 6776P |
| Sistem belleği | 2 TB, 4 TB'a kadar |
| GPU bağlantısı | 5. nesil NVLink / NVSwitch |
| Compute network | 8 × ConnectX-8 |
| Compute port hızı | 8 × 800 Gb/s |
| Storage / Management | 2 × dual-port BlueField-3 |
| Local cache | 8 × 3.84 TB E1.S NVMe |
| Form factor | 10 RU |
| Güç tüketimi | Yaklaşık 14.5 kW |
| İşlemci mimarisi | x86 |
| Soğutma | Hava veya sıvı soğutma (bu mimaride hava soğutmalı) |

DGX B300 içindeki sekiz GPU, sistem içindeki NVSwitch yapısı üzerinden birbirleriyle yüksek hızlı NVLink bağlantısına sahiptir. Ancak NVLink domain'i **tek DGX B300 sunucuyla sınırlıdır**. Bir DGX B300'dan diğer DGX B300'a geçildiğinde GPU haberleşmesi harici Compute Fabric üzerinden gerçekleşmektedir.

Örnek cluster tasarımında bu fabric **Quantum-X800 InfiniBand** olarak değerlendirilmiştir.

NVIDIA DGX B300 SuperPOD referans mimarisi de 800 Gb/s XDR InfiniBand compute fabric kullanımını desteklemekte ve Q3400-RA switch'leri kullanmaktadır.

DGX B300 hem hava soğutmalı (air-cooled) hem de sıvı soğutmalı (liquid-cooled) konfigürasyonlarda sunulabilmektedir. Bu çalışmada ele alınan mimaride **hava soğutmalı DGX B300** esas alınmıştır. 1.400 W/GPU TDP'ye rağmen 10 RU form faktöründe hava soğutma ile çalıştırılabilmesi, mevcut veri merkezi altyapısında sıvı soğutma (DLC) yatırımı gerektirmemesi açısından önemli bir avantaj sağlamaktadır.

---

## 3. NVIDIA GB300 NVL72 Genel Mimarisi

GB300 NVL72, DGX B300'dan temelden farklı olarak **sunucu ölçekli değil, rack ölçekli bir compute sistemi** olarak tasarlanmıştır.

Tek bir NVL72 rack:

* 18 × compute tray
* 72 × Blackwell Ultra GPU
* 36 × NVIDIA Grace CPU
* 9 × NVLink Switch Tray
* NVLink passive copper backplane
* power shelf'ler
* sıvı soğutma manifoldları

içermektedir.

### Bir compute tray

GB300 compute tray başına:

* 2 × NVIDIA Grace CPU
* 4 × B300 Blackwell Ultra GPU
* 4 × ConnectX-8
* 1 × dual-port BlueField-3 B3240
* local NVMe cache
* boot NVMe

bulunmaktadır.

Dolayısıyla tek NVL72 rack:

**18 tray × 4 GPU = 72 GPU**

sağlamaktadır.

GB300 NVL72 rack seviyesinde:

| Özellik | GB300 NVL72 |
| ----- | ----- |
| GPU | 72 × B300 Blackwell Ultra / rack |
| CPU | 36 × NVIDIA Grace (2592 Neoverse V2 core) |
| NVLink Toplam BW | 130 TB/s |
| Rack bellek | 20 TB HBM |
| FP4 sparse (rack) | 1.440 PF |
| FP4 dense (rack) | 1.080 PF |
| Rack gücü | ~135 kW (132–142 kW; tepe ~155 kW) |
| Soğutma | Tam sıvı soğutma (DLC zorunlu) |

NVIDIA, GB300 NVL72'yi "fully liquid-cooled" olarak tanımlamaktadır. Bu ifade ısının %100'ü sıvıya gider anlamına gelmez; NVL72 rack'lerde ısının yaklaşık **%90'ı sıvıya, %10'u havaya** aktarılır (OSFP modülleri, storage, PDB).

---

## 4. B300 GPU Teknik Spec'leri ve Capability

Her iki platform da aynı B300 Blackwell Ultra GPU'sunu kullanmaktadır. Bu bölümde GPU başına teknik spec'ler ve capability detayları yer almaktadır.

### 4.1 GPU Başına Spec'ler

Tüm compute değerleri **PFLOPS (PF)** birimindedir. Değerler NVIDIA'nın HGX ürün sayfasından alınmıştır.

| Özellik | B300 SXM |
| ----- | ----- |
| Mimari | Blackwell Ultra |
| VRAM | 288 GB (yonga kapasitesi) |
| Kullanılabilir VRAM (HGX) | ~262 GB/GPU (2.3 TB ÷ 8) |
| HBM Tipi | HBM3e |
| Bellek Bant Genişliği | 8 TB/s |
| FP4 sparse | 18 PF |
| FP4 dense | 13.5 PF |
| FP8 sparse | 9 PF |
| FP8 dense | 4.5 PF |
| FP16/BF16 sparse | 4.5 PF |
| FP16/BF16 dense | 2.25 PF |
| TDP | 1.400 W |
| NVLink | NVLink 5 (1.8 TB/s) |
| ConnectX | ConnectX-8 (800G) |
| Process node | TSMC 4NP |
| Transistör | 208 mlr |

**Önemli notlar:**

- **Sparse vs Dense:** Sparse değerler 2:4 yapısal sparse (her ardışık 4 değerin en fazla 2'si sıfırdan farklı) varsayımıyla ölçülür ve ~2× teorik kazancı yansıtır. Dense ise bu varsayım olmadan gerçek throughput'tur. **Seçim kararları dense bazında verilmelidir**; sparse değerler yalnızca tepe teorik kapasiteyi gösterir ve üretimde çoğu workload tarafından tam olarak gerçekleştirilemez.

- **B300 FP4 değerlerinde taban farkı:** NVIDIA'nın Blackwell Ultra teknik blogu yonga başına 15 PF dense / 20 PF sparse NVFP4 verir; HGX 8-GPU sistem tabanında ise 13.5 PF dense / 18 PF sparse'dır (108 PF ÷ 8 ve 144 PF ÷ 8). Die × 8 = 120/160 PF, HGX = 108/144 PF — arada tutarlı bir ~%10 sistem-düzeyi açık vardır.

- **BF16 neden önemli:** Pretraining'in büyük bölümü, master weight/optimizer state ve SFT/LoRA fine-tuning hâlâ BF16 ile yapılır; birçok üretim çıkarım hattı da BF16 çalışır.

- **B300 attention 2× performansı:** B300'ün Blackwell'e göre 2× attention performansı, attention katmanlarında kullanılan kilit komutlar için **SFU (Special Function Unit) throughput'unun iki katına çıkarılmasından** gelir — ham FP4 compute artışından değil. Bu nedenle kazanç uzun-bağlam ve reasoning iş yüklerinde belirginleşir.

- **B300 bellek mimarisi:** 288 GB'lık kapasite **12-high HBM3e** yığınlarından gelir. Bellek artışı yeni bir HBM nesli değil, yığın yüksekliğinin artırılmasıyla sağlanmıştır.

### 4.2 Capability Matrisi

Aşağıdaki matris **datacenter SXM tier'ını** esas alır.

| Özellik | B300 |
| ----- | ----- |
| FP4 (NVFP4) | ✓ |
| FP6 | ✓ |
| FP8 | ✓ |
| FP16/BF16 | ✓ |
| TF32 | ✓ |
| MIG | ✓ (2×140 / 4×70 / 7×34 GB) |
| Confidential Computing | ✓ TEE-I/O (1/2/4/8 GPU) |
| GPUDirect RDMA | ✓ |
| Tensor Core nesli | 5. nesil |
| Transformer Engine | 2. nesil (FP4/NVFP4) |
| NVLink nesli | 5 (1.8 TB/s) |
| ConnectX | CX-8 (800G) |
| Process node | TSMC 4NP |
| Transistör | 208 mlr |

#### MIG (Multi-Instance GPU)

Tek GPU'yu donanımsal olarak izole instance'lara böler. Blackwell Ultra (B300) için NVIDIA somut partisyon seçeneklerini yayımlar: **2×140 GB, 4×70 GB veya 7×34 GB**. Multi-tenant veri merkezi ve bulut iş yükleri için kritik bir izolasyon özelliğidir; 288 GB'lık bir GPU'nun kiracı başına ne kadar bellekle bölüneceği kapasite planlamasının doğrudan girdisidir.

#### Confidential Computing / TEE-I/O

Blackwell, TEE-I/O yeteneğine sahip ilk GPU'dur ve güvenli alanı NVLink/NVSwitch üzerinden çoklu GPU'ya yayar: NVLink'li Blackwell HGX/DGX sistemlerinde TEE modunda **1, 2, 4 veya 8 GPU**'luk güvenli dağıtımlar desteklenir. **Performans maliyeti pratikte yok:** NVIDIA'nın Blackwell Ultra teknik blogu TEE-I/O için "şifresiz modlarla karşılaştırıldığında neredeyse özdeş throughput" der; üçüncü taraf ölçümleri bunu sayısal olarak doğrular (BF16 matmul 0,998×, 96.000-matmul CUDA graph 1,0012×). Düzenlemeli (finans, sağlık, kamu) iş yükleri için belirleyici bir özelliktir.

### 4.3 İnterconnect ve Ağ

- **NVLink 5:** GPU başına 1,8 TB/s. Rack seviyesinde GB300 NVL72 toplam 130 TB/s.
- **ConnectX-8:** 800G. ConnectX-7'ye (400G) göre düğümler arası bant genişliğini ikiye katlar.
- **NVLink vs NVSwitch:** NVLink, GPU-GPU noktadan noktaya bağlantıdır. NVSwitch ise NVLink portlarını toplayıp bir ağ oluşturan çiptir; 8 GPU/node (HGX) veya 72 GPU/NVL72 rack ölçeğinde tek bir domain kurulmasını sağlar. NVL72 rack'lerin varlığı NVSwitch'e dayanır; düz NVLink ile bu ölçek mümkün değildir. **Her iki ölçekte de** (8-GPU düğüm ve 72-GPU rack) NVSwitch bulunduğu için Fabric Manager gereklidir (bkz. Bölüm 8).
- **NVLink-C2C:** Grace CPU ile GPU arasındaki çip-üstü tutarlı (coherent) bağlantıdır (900 GB/s). GPU-GPU NVLink'ten farklı bir protokoldür; GB300 superchip mimarisinin (1 Grace CPU + 2 Blackwell GPU) ve dolayısıyla GB300 NVL72 rack'lerinin temelidir. Unified memory — CPU ve GPU belleğinin tek adres alanında görünmesi — bu bağlantı üzerinden sağlanır.
- **GPUDirect RDMA:** NIC'in CPU belleği kopyası olmadan doğrudan GPU belleğine erişmesini sağlar. Dağıtık eğitim ve çıkarımda scale-out performansı için temel bir yetenektir; NCCL'in veri yolunu kısaltır.

---

## 5. GB300 NVL72'nin En Önemli Farkı: 72-GPU NVLink Domain

GB300 NVL72'nin DGX B300 karşısındaki en büyük mimari avantajı budur.

DGX B300 içerisinde NVLink domain:

**8 GPU**

iken GB300 NVL72 içerisinde:

**72 GPU tek NVLink domain**

oluşturmaktadır.

NVIDIA'nın GB300 rack tasarımı, 72 GPU'nun NVLink/NVSwitch üzerinden rack içerisinde çok yüksek bant genişliği ve düşük gecikmeyle haberleşmesine imkan vermektedir. Rack seviyesinde toplam **130 TB/s** NVLink bant genişliği sağlanmaktadır.

Bunun sonucu özellikle büyük model parallelism gerektiren uygulamalarda önemlidir.

Örneğin:

* tensor parallelism
* pipeline parallelism
* expert parallelism
* MoE modelleri
* çok büyük LLM training
* büyük-context inference
* reasoning modelleri

GPU'lar arasında yoğun haberleşme oluşturmaktadır.

Bu trafik DGX B300 cluster'da sunucular arasında InfiniBand üzerinden geçerken, aynı rack içerisindeki GB300 GPU'larında doğrudan NVLink fabric üzerinde kalabilmektedir.

Bu, GB300'ün temel mimari değer önerisidir.

---

## 6. DGX B300 Network Mimarisi

Örnek olarak incelenen ~40-node tasarımda üç temel fiziksel ağ bulunmaktadır.

### 6.1 Compute Network

Her DGX B300 üzerinde:

**8 × 800 Gb/s ConnectX-8 compute bağlantısı**

bulunmaktadır.

40 DGX için:

**40 × 8 = 320 adet 800 Gb/s compute bağlantısı**

oluşmaktadır.

Compute fabric için örnek tasarım:

* 8 × Q3400-RA Leaf
* 4 × Q3400-RA Spine
* toplam 12 × Q3400-RA

şeklindedir.

Bu yapı özellikle:

* multi-node training
* distributed inference
* NCCL collective communication
* MPI/HPC
* GPU-to-GPU RDMA

iş yükleri için yüksek bant genişliği ve düşük gecikme sağlamaktadır.

Node toplam scale-out bant genişliği: 8 × 800G = **6.4 TB/s** (8 × ConnectX-8).

### 6.2 In-band ve Storage Network

Compute fabric'ten bağımsız olarak Ethernet tabanlı ayrı bir In-band / Storage ağı tasarlanmıştır.

Örnek yapı:

* 4 × SN5610 Leaf
* 2 × SN5610 Spine

olmak üzere toplam:

**6 × SN5610**

switch'ten oluşmaktadır.

Bu ağ:

* provisioning
* kullanıcı erişimi
* Kubernetes / Run:ai trafiği
* yönetim
* depolama erişimi
* servis trafiği

gibi işlevleri taşımaktadır.

### 6.3 OOB ve Fabric Management

OOB yönetim ağı için:

**4 × SN2201**

öngörülmüştür.

Compute fabric InfiniBand olduğu için ayrıca:

**2 × UFM**

ile HA InfiniBand fabric management tasarlanmıştır.

UFM:

* InfiniBand fabric topology
* subnet management
* health monitoring
* congestion monitoring
* fabric telemetry
* troubleshooting

işlevlerini üstlenmektedir.

Ethernet tarafında ise NetQ/Mission Control üzerinden network telemetry ve monitoring yapılabilir.

### 6.4 Örnek DGX B300 Topolojisi

Aşağıda örnek bir DGX B300 cluster topolojisi görülmektedir:

<p><img src="{{ '/papers/b300-gb300-cluster-mimarisi/images/dgx-b300.png' | relative_url }}" alt="Örnek DGX B300 cluster topolojisi" width="720"/></p>
<sub><i>Şekil 1: Örnek DGX B300 cluster topolojisi — Compute Fabric (Quantum-X800 IB), In-band/Storage ve OOB ağları</i></sub>

Bu topolojide her DGX B300 düğümü 8 × 800 Gb/s InfiniBand bağlantısıyla Compute Fabric'e bağlıdır. Storage ve yönetim trafiği ayrı bir Ethernet ağı üzerinden ilerler. OOB ağı tüm BMC ve switch yönetimini taşır.

---

## 7. GB300 NVL72 Network Mimarisi

Örnek olarak dört rack için:

**72 compute tray / 288 GPU**

bulunmaktadır.

NVIDIA Enterprise RA compute fabric için **Spectrum-X Ethernet** kullanmaktadır.

### 7.1 GPU Compute East/West Network

Örnek NVIDIA Enterprise RA uyumlu yapı:

* 16 × SN5610 Leaf
* 8 × SN5610 Spine

Toplam:

**24 × SN5610**

Compute network iki ayrı plane olarak tasarlanmıştır.

Her ConnectX-8 800G bağlantı:

**2 × 400G**

olarak iki ayrı plane'e dağıtılır.

Bu yapı:

* SPOF azaltılması
* path redundancy
* NCCL load balancing
* rail optimization

sağlamaktadır.

### 7.2 CPU Converged North/South Network

GB300 Enterprise RA'da ayrı bir **CPU Converged North/South Fabric** bulunmaktadır.

Dört rack için örnek yapı:

* 4 × SN5610 Leaf
* 2 × SN5610 Spine

olmak üzere:

**6 × SN5610**

kullanılmaktadır.

Bu fabric:

* in-band management
* storage
* customer network
* support server
* CPU communication

trafiğini taşımaktadır.

Her compute tray'deki dual-port BlueField-3 DPU iki ayrı switch'e bağlanarak path redundancy sağlamaktadır.

Compute ve Converged fabric'ler birlikte:

**24 + 6 = 30 × SN5610**

oluşturmaktadır.

### 7.3 OOB Network

NVIDIA her NVL72 rack için iki adet SN2201 kullanmaktadır.

Dört rack için:

**4 × 2 = 8 × SN2201**

gerekmektedir.

OOB ağ:

* compute tray BMC
* BlueField BMC
* NVLink switch management
* diğer rack management endpoint'leri

için fiziksel olarak ayrılmış 1 GbE management erişimi sağlar.

### 7.4 Örnek GB300 NVL72 Topolojisi

Aşağıda örnek bir GB300 NVL72 cluster topolojisi görülmektedir:

<p><img src="{{ '/papers/b300-gb300-cluster-mimarisi/images/rack.png' | relative_url }}" alt="Örnek GB300 NVL72 cluster topolojisi" width="720"/></p>
<sub><i>Şekil 2: Örnek GB300 NVL72 cluster topolojisi — GPU Compute Fabric (Spectrum-X), CPU Converged ve OOB ağları</i></sub>

Bu topolojide her NVL72 rack'in 18 compute tray'i, iki plane'li Spectrum-X Ethernet fabric üzerinden birbirine ve diğer rack'lere bağlanır. NVLink domain rack içi 72 GPU'yu kapsar; rack'ler arası iletişim Ethernet üzerinden gerçekleştirilir.

---

## 8. Güç ve Soğutma Gereksinimleri

### 8.1 GB300 NVL72 Güç ve Soğutma

GB300 NVL72 geleneksel bir sunucu rack'i değildir. Rack-scale olarak tasarlanmış, kendi içinde yüksek yoğunluklu güç dağıtımı ve sıvı soğutma bileşenleri barındıran bütünleşik bir sistemdir.

Sistem içerisinde:

* sıvı soğutmalı compute tray'ler,
* sıvı soğutmalı NVLink switch tray'ler,
* rack içi cooling manifold,
* power shelf'ler,
* DC busbar tabanlı rack içi güç dağıtımı

bulunmaktadır.

NVIDIA'nın güncel Enterprise RA'sında tam GB300 NVL72 rack'in **142 kW'a kadar güç gerektirebileceği** belirtilmektedir. OEM/analist kaynaklara göre rack güç aralığı **132–142 kW** olup, tepe güç yaklaşık **155 kW**'a ulaşabilmektedir.

GB300 NVL72 için **DLC (Direct Liquid Cooling) zorunludur**. "Fully liquid-cooled" ifadesi ısının %100'ü sıvıya gider anlamına gelmez; NVL72 rack'lerde ısının yaklaşık **%90'ı sıvıya, %10'u havaya** aktarılır (OSFP modülleri, storage, PDB).

Rack besleme akımı **60 A** seviyesindedir.

GB300 seçimi durumunda veri merkezi altyapısında:

* rack'e sağlanacak yüksek yoğunluklu AC güç kapasitesi,
* CDU kapasitesi,
* facility water supply/return altyapısı,
* rack'in entegre manifold sistemine uygun sıvı soğutma bağlantıları,
* rack ağırlığı,
* zemin taşıma kapasitesi,
* A/B güç beslemesi ve upstream güç yedekliliği

ayrıca değerlendirilerek projelendirilmelidir.

Rack içerisindeki **power shelf, DC busbar ve cooling manifold sistemin bir parçasıdır** ve ayrıca kurulması gereken bileşenler değildir.

Bu nedenle GB300 seçiminde temel fiziksel uygunluk kriterleri, tesisin gerekli **rack güç yoğunluğunu, güç yedekliliğini ve sıvı soğutma gereksinimlerini** karşılayıp karşılayamayacağıdır.

### 8.2 DGX B300 Güç ve Veri Merkezi Uyumluluğu

DGX B300 yaklaşık **14.5 kW** güç tüketmektedir ve 10 RU büyüklüğündedir. GPU başına TDP 1.400 W'dır.

DGX B300 hem hava soğutmalı hem de sıvı soğutmalı konfigürasyonlarda sunulabilmektedir. Bu çalışmada ele alınan mimaride **hava soğutmalı DGX B300** esas alınmıştır. 1.400 W/GPU TDP'ye rağmen 10 RU form faktöründe hava soğutma ile çalıştırılabilmesi, mevcut veri merkezi altyapısında sıvı soğutma (DLC) yatırımı gerektirmemesi açısından önemli bir avantaj sağlamaktadır.

NVIDIA SuperPOD referans tasarımında rack başına dört DGX B300 yerleştirilmekte ve yaklaşık **56 kW/rack** güç yoğunluğu oluşmaktadır. NVIDIA açıkça mevcut veri merkezi güç ve soğutma sınırlarına göre DGX sayısının rack başına azaltılabileceğini belirtmektedir. Rack güç yoğunluğu yeterli olmadığı durumlarda rack başına DGX B300 adedi azaltılarak yerleşim yapılabilir.

Bu çalışmada referans olarak **4 adet GB300 NVL72 rack ve 40 adet DGX B300 sunucu** karşılaştırma esas alınmıştır.

### 8.3 DC Altyapı Gereksinimleri

| Gereksinim | DGX B300 | GB300 NVL72 |
| ----- | ----- | ----- |
| Rack gücü | ~14.5 kW/node | 132–142 kW/rack (tepe ~155) |
| Soğutma | Hava soğutmalı | DLC zorunlu (%90 sıvı / %10 hava) |
| Rack besleme | Standart | 60 A |
| Rack standardı | Geleneksel EIA rack mümkün | OCP/rack-scale özel altyapı |
| CDU | Gerekli değil | Gerekli |
| Facility water | Gerekli değil | Gerekli (supply/return) |

---

## 9. Sanallaştırma ve GPU Paylaşımı

Bu başlık iki sistem arasındaki önemli ayrımlardan biridir.

### 9.1 DGX B300

DGX B300 daha klasik x86 server davranışına sahip olduğundan sanallaştırma ve farklı altyapı platformlarına entegrasyon açısından daha doğal bir seçimdir.

B300 için NVIDIA somut MIG partisyon seçeneklerini yayımlar:

* **2×140 GB**
* **4×70 GB**
* **7×34 GB**

Bu partisyonlar multi-tenant veri merkezi ve bulut iş yükleri için donanımsal izolasyon sağlar. 288 GB'lık bir GPU'nun kiracı başına ne kadar bellekle bölüneceği kapasite planlamasının doğrudan girdisidir.

Bare-metal Kubernetes/Run:ai tarafında GPU'ların:

* full GPU
* MIG
* scheduler-based sharing

şeklinde tahsis edilmesi daha doğal bir kullanım modelidir.

### 9.2 GB300 NVL72

GB300 tarafında ise yaklaşım farklıdır.

NVIDIA Enterprise RA, GB300 çözümünü açıkça:

**Kubernetes, Slurm ve non-virtualized workloads**

için tanımlamaktadır.

Bu nedenle GB300'ü klasik bir:

> "72 GPU var, VMware üzerinde yüzlerce vGPU'ya bölelim"

platformu olarak değerlendirmek doğru değildir.

GB300'ün asıl paylaşım mekanizması:

* Slurm
* Run:ai
* Kubernetes
* NVLink Domain / Partition awareness

üzerinden workload scheduling'dir.

Mission Control dokümantasyonu GB300 gibi Multi-Node NVLink sistemlerin Run:ai ve Slurm üzerinden shared resource olarak kullanılmasında **NVLink Domains ve NVLink Partitions** kavramlarının dikkate alınması gerektiğini açıkça belirtmektedir.

Dolayısıyla:

**DGX B300 = GPU seviyesinde parçalama ve geleneksel server resource pooling açısından daha esnek**

**GB300 = rack-scale GPU domain'lerini workload/job seviyesinde bölme ve schedule etme açısından daha güçlü**

şeklinde düşünmek daha doğrudur.

---

## 10. DGX B300 VE GB300 NVL72 TEMEL TEKNİK KARŞILAŞTIRMA

| Özellik | DGX B300 | GB300 NVL72 |
| ----- | ----- | ----- |
| Mimari birim | Bağımsız sunucu | Rack-scale sistem |
| GPU / sistem | 8 × B300 | 72 × B300 / rack |
| CPU | 2 × Intel Xeon 6776P | 36 × NVIDIA Grace (2592 Neoverse V2) |
| CPU mimarisi | **x86** | **ARM64** |
| GPU başına VRAM | 288 GB (HGX: ~262 GB kullanılabilir) | 288 GB (HGX: ~262 GB kullanılabilir) |
| Sistem/rack toplam bellek | ~2.3 TB (HGX) | **20 TB** |
| GPU başına bellek BW | 8 TB/s | 8 TB/s |
| NVLink domain | 8 GPU | **72 GPU** |
| NVLink toplam BW (sistem/rack) | 14.4 TB/s | **130 TB/s** |
| FP4 sparse (sistem/rack) | 144 PF | **1.440 PF** |
| FP4 dense (sistem/rack) | 108 PF | **1.080 PF** |
| GPU başına TDP | 1.400 W | 1.400 W |
| Scale-up | 8 GPU | **72 GPU** |
| Scale-out | Quantum-X800 IB | Spectrum-X Ethernet |
| Compute NIC | 8 × CX-8 / DGX | 4 × CX-8 / tray |
| Compute fabric | Quantum-X800 IB | Spectrum-X Ethernet |
| Compute switch | Q3400-RA | SN5610 |
| Storage/In-band | SN5610 | SN5610 |
| OOB | SN2201 | SN2201 |
| Fabric manager | UFM + `nv-fabricmanager` | `nv-fabricmanager` + NetQ / Mission Control |
| UFM | **Gerekli, IB kullanıldığı için** | **Gerekli değil, Spectrum-X tasarımında** |
| NetQ | Ethernet monitoring için | **Temel network observability bileşeni** |
| MIG | ✓ (2×140 / 4×70 / 7×34 GB) | Mimariye bağlı |
| Confidential Computing | ✓ TEE-I/O (1/2/4/8 GPU) | ✓ TEE-I/O |
| Transformer Engine | 2. nesil (FP4/NVFP4) | 2. nesil (FP4/NVFP4) |
| Tensor Core | 5. nesil | 5. nesil |
| Process node | TSMC 4NP | TSMC 4NP |
| Cooling | Hava soğutmalı (bu mimaride) | **Sıvı soğutmalı rack (DLC zorunlu)** |
| Güç | ~14.5 kW / DGX | **132–142 kW/rack (tepe ~155)** |
| Rack standardı | Geleneksel EIA rack mümkün | OCP/rack-scale özel altyapı |
| Deployment granularity | 1 server eklenebilir | Rack/SU ağırlıklı |
| İşletim sistemi CPU ISA | x86 | ARM64 |
| Fiziksel servis izolasyonu | Sunucu bazında | Tray/rack bazında |
| Büyük model scale-up | 8 GPU sonrası network | **72 GPU'ya kadar NVLink** |

---

## 11. İŞ YÜKÜ BAZLI PLATFORM SEÇİMİ

| İş yükü / Gereksinim | DGX B300 | GB300 NVL72 | Öneri |
| ----- | ----- | ----- | ----- |
| Tek GPU inference | ★★★★★ | ★★ | **B300** |
| 2-8 GPU inference | ★★★★★ | ★★★ | **B300** |
| Büyük model inference | ★★★★ | ★★★★★ | **GB300** |
| Çok büyük reasoning model | ★★★ | ★★★★★ | **GB300** |
| Tek-node training | ★★★★★ | ★★★★ | **B300** |
| 8 GPU'ya kadar training | ★★★★★ | ★★★★ | **B300** |
| Multi-node training | ★★★★★ | ★★★★★ | Workload'a göre |
| Çok büyük LLM training | ★★★★ | ★★★★★ | **GB300** |
| Trillion-parameter model | ★★★ | ★★★★★ | **GB300** |
| MoE training | ★★★★ | ★★★★★ | **GB300** |
| Fine-tuning | ★★★★★ | ★★★★★ | İkisi de |
| Küçük LoRA/QLoRA işleri | ★★★★★ | ★★★ | **B300** |
| Çok sayıda bağımsız kullanıcı | ★★★★★ | ★★★★ | **B300** |
| GPU parçalama / MIG | ★★★★★ | Mimariye bağlı | **B300** |
| Kubernetes | ★★★★★ | ★★★★★ | İkisi de |
| Run:ai | ★★★★★ | ★★★★★ | İkisi de |
| Slurm | ★★★★★ | ★★★★★ | İkisi de |
| HPC | ★★★★★ | ★★★★★ | Workload'a göre |
| x86 HPC uygulaması | ★★★★★ | ★★ | **B300** |
| ARM-native HPC | ★★★ | ★★★★★ | **GB300** |
| CFD / CAE simulation | ★★★★★ | ★★★ | Genellikle **B300** |
| AI + simulation | ★★★★★ | ★★★★ | Genellikle **B300** |
| Massive AI-only cluster | ★★★★ | ★★★★★ | **GB300** |
| Çok büyük NVLink domain | ★★ | ★★★★★ | **GB300** |
| Düşük rack güç yoğunluğu | ★★★★ | ★ | **B300** |
| Çok yüksek density AI factory | ★★★ | ★★★★★ | **GB300** |
| Incremental expansion | ★★★★★ | ★★ | **B300** |
| Rack-scale turnkey compute | ★★★ | ★★★★★ | **GB300** |

---

## 12. TRAINING AÇISINDAN KARŞILAŞTIRMA

Training'de seçim model boyutuna ve iletişim pattern'ine göre yapılmalıdır.

Model:

* 8 GPU içerisinde çalışabiliyorsa
* bağımsız job'lar fazlaysa
* yüzlerce küçük/orta eğitim işi eşzamanlı yürütülecekse

DGX B300 daha verimli kaynak kullanımı sağlayabilir.

Ancak model:

* onlarca GPU gerektiriyorsa
* tensor parallelism yüksekse
* expert parallelism kullanıyorsa
* yoğun all-reduce/all-to-all trafiği üretiyorsa

GB300 NVL72'nin 72-GPU NVLink domain avantajı belirginleşir.

**Dense FP4 açısından:**

B300 GPU başına 13.5 PF dense FP4 sağlar. DGX B300 sisteminde 8 × 13.5 = **108 PF**, GB300 NVL72 rack'te 72 × 13.5 = **1.080 PF** dense FP4 compute mevcuttur. Seçim kararları dense bazında verilmelidir; sparse değerler yalnızca tepe teorik kapasiteyi gösterir ve üretimde çoğu workload tarafından tam olarak gerçekleştirilemez.

B300'ün Blackwell'e göre 2× attention performansı, uzun-bağlam ve reasoning training iş yüklerinde belirginleşir. Bu kazanç attention katmanlarında kullanılan kilit komutlar için SFU (Special Function Unit) throughput'unun iki katına çıkarılmasından gelir.

---

## 13. INFERENCE AÇISINDAN KARŞILAŞTIRMA

Inference için de "GB300 her zaman daha hızlıdır" şeklinde genelleme yapmak doğru değildir.

Küçük ve orta modeller için:

* çok sayıda independent replica
* düşük latency endpoint
* MIG
* GPU isolation
* multi-tenant serving

gerekiyorsa DGX B300 çok uygun bir platformdur.

Ancak:

* model tek GPU'ya sığmıyorsa
* 8 GPU'yu aşıyorsa
* büyük KV cache gerektiriyorsa
* çok büyük context kullanılıyorsa
* reasoning modelinin onlarca GPU üzerinde çalışması gerekiyorsa

GB300 NVL72'nin scale-up architecture'ı daha avantajlı hale gelir.

### 13.1 Multi-Node Inference

Yeni nesil LLM inference artık yalnızca "bir GPU'ya model yükleme" yaklaşımından uzaklaşmaktadır.

Özellikle:

* prefill/decode separation
* tensor parallelism
* pipeline parallelism
* expert parallelism
* distributed KV cache
* multi-node serving

gibi yöntemlerde interconnect performansı önemli hale gelmektedir.

NVIDIA Run:ai'nin güncel Mission Control entegrasyonunda distributed inference ve NVIDIA Dynamo desteği de bulunmaktadır.

Bu nedenle çok büyük multi-node inference deployment'larında GB300 avantajlıdır.

Orta ölçekli inference farm'larında ise B300'un bağımsız server yapısı daha esnek olabilir.

---

## 14. SIMULATION VE HPC

Simulation workloads için CPU mimarisi özellikle önemlidir.

DGX B300:

**Intel Xeon / x86**

GB300:

**Grace / ARM64**

kullanmaktadır.

Bu nedenle mevcut:

* Ansys
* Abaqus
* LS-DYNA
* OpenFOAM türevleri
* proprietary solver'lar
* custom MPI uygulamaları
* simulation kütüphaneleri

için ARM64 compatibility kontrolü yapılmalıdır.

GPU-accelerated simulation yazılımı Grace/ARM64 için optimize edilmişse GB300 çok güçlü bir HPC platformuna dönüşebilir.

Ancak uygulama yalnızca x86 üzerinde certified ise DGX B300 daha güvenli tercihtir.

---

## 15. OPERASYONEL ESNEKLİK

DGX B300'ün önemli avantajlarından biri failure domain'in daha küçük olmasıdır.

Bir DGX B300 bakıma alınırsa:

**8 GPU**

etkilenir.

GB300 rack-scale sistemde ise tray, NVLink partition ve rack fabric davranışlarının workload scheduler tarafından dikkate alınması gerekir.

Buna karşılık GB300 Mission Control/NVLink partition mekanizmaları sayesinde rack-scale kaynakları job bazında yönetebilmek üzere tasarlanmıştır.

**Risk faktörleri:**

1. **Lead time ve erişim:** Tedarik kısıtlı — hyperscaler talebi üretim kapasitesini aşıyor ve büyük kümelerde teslimattan sonra devreye alma ek süre alabiliyor. Sipariş→sevkiyat süresi ürün ve bölgeye göre değiştiğinden distribütör teyidi alınmalıdır. Bu mimaride hava soğutmalı DGX B300 esas alındığından sıvı soğutma altyapısı gerekmez.

2. **Soğutma darboğazı (rack-scale):** GB300 NVL72 için DLC yatırımı (CDU, manifold, drycooler) GPU maliyetinin ötesinde bir CapEx kalemidir. Bu mimaride kullanılan hava soğutmalı DGX B300 (8-GPU node) için bu yatırım gerekli değildir.

3. **Sürücü branch ve Fabric Manager kilidi:** Datacenter SXM/PCIe tier LTS (Long-Term-Support) branch kullanır. LTS branch ile Fabric Manager sürümü birlikte yönetilmelidir; NVSwitch tabanlı DGX B300 ve GB300 NVL72 için `nv-fabricmanager` paketinin eşleşen sürümü sürücü yükseltmesinden önce hazır bulundurulmalıdır.

---

## 16. ARM64 VE x86 KARARI

Bu seçim yalnızca CPU performansı değildir.

### DGX B300

x86 olduğundan:

* mevcut enterprise yazılımları
* traditional virtualization
* legacy HPC
* birçok commercial application

ile entegrasyon riski daha düşüktür.

### GB300

Grace ARM64 sayesinde:

* yüksek CPU-memory efficiency
* GPU'ya yakın CPU architecture
* rack-scale power efficiency
* NVIDIA'nın tightly integrated compute architecture

avantajı sağlar.

Ancak yazılım pipeline'larının **multi-architecture veya ARM64 compatible** olması gerekir.

Bu nedenle GB300 seçiminden önce yazılım envanterinin ARM64 compatibility analizi yapılması önerilir.

---

## 17. NEDEN DGX B300 TERCİH EDİLMELİ?

DGX B300 aşağıdaki durumlarda daha uygun bir seçimdir.

### 1. Çok kullanıcılı heterojen ortam

Araştırmacılar, veri bilimciler, farklı departmanlar, farklı GPU gereksinimleri ve bağımsız projeler aynı altyapıyı kullanacaksa DGX B300 daha granular kaynak tahsisi sağlar.

### 2. Sanallaştırma önemliyse

VM tabanlı altyapı ve daha klasik cloud yaklaşımı isteniyorsa B300 tabanlı bağımsız server mimarisi daha uygun olacaktır.

### 3. x86 bağımlılığı varsa

Özel yazılımlar, simulation uygulamaları, eski HPC kodları, vendor binary'leri ve x86 container image'ları ARM64 üzerinde doğrulanmamışsa DGX B300 düşük riskli seçimdir.

### 4. Kademeli büyüme isteniyorsa

DGX B300 ekleme granularity'si:

**8 GPU**

iken GB300 tarafında doğal building block:

**72 GPU rack**

seviyesindedir.

Bu nedenle kapasitenin yıllar içinde büyütülmesi planlanıyorsa DGX daha esnek olabilir.

### 5. Data center güç yoğunluğu sınırlıysa

DGX B300'ün rack density'si düşürülerek mevcut tesis altyapısına uyarlanması mümkündür.

GB300 ise ~100 kW üzeri rack yoğunluğunu destekleyen tesis altyapısı gerektirir.

### 6. HPC + AI ortak kullanılacaksa

x86 CPU gerektiren simulation + AI workflow'ları DGX B300 için güçlü bir kullanım alanıdır.

Örneğin:

CFD → AI surrogate model → inference

veya:

CAE → synthetic data → training

iş akışlarında x86 CPU uyumluluğu avantaj sağlayabilir.

---

## 18. NEDEN GB300 NVL72 TERCİH EDİLMELİ?

GB300 NVL72 aşağıdaki durumlarda belirgin avantaj sağlar.

### 1. Çok büyük LLM training

Model tek node'a veya 8 GPU'ya sığmıyorsa iletişim maliyeti büyümeye başlar.

GB300'de **72 GPU aynı NVLink domain** içerisinde bulunduğundan çok büyük modeller için yüksek scale-up bandwidth sağlar.

### 2. Büyük MoE modelleri

Mixture-of-Experts modelleri yoğun all-to-all GPU haberleşmesi oluşturabilir.

Büyük NVLink domain burada önemli avantaj sağlar.

### 3. Büyük inference / reasoning modelleri

Yüzlerce milyar veya trilyon parametre ölçeğinde:

* model parallel inference
* reasoning
* long-context inference
* disaggregated inference

gibi workload'lar çok büyük GPU gruplarından yararlanabilir.

NVIDIA da Enterprise RA'yı özellikle real-time inference ve trillion-parameter training/fine-tuning için konumlandırmaktadır. GB300 NVL72, Hopper'a göre MW başına 5× TPS, 10× TPS/user ve 50× AI-factory output sağlamaktadır.

### 4. Network iletişimini azaltmak isteniyorsa

DGX B300'da 8 GPU'dan sonra trafik external fabric'e çıkar.

GB300'de ise:

**72 GPU'ya kadar trafik NVLink domain içerisinde kalabilir.**

Bu fark model parallel workloads için oldukça önemlidir.

### 5. Daha büyük tek compute domain gerekiyorsa

GB300 aslında "72 adet ayrı GPU" satın almaktan çok:

> **72-GPU rack-scale computer**

satın alma yaklaşımıdır.

Bu nedenle çok büyük accelerator domain isteyen workload'lar için farklı bir sınıftadır.

---

## 19. HANGİ PLATFORM NE ZAMAN TERCİH EDİLMELİ?

### DGX B300 tercih edilmelidir, eğer:

* mevcut veri merkezi yüksek rack power density desteklemiyorsa,
* x86 zorunluluğu varsa,
* VM önemliyse,
* GPU kaynaklarının küçük dilimler halinde kullanıcılar arasında dağıtılması gerekiyorsa,
* workload'lar heterojense,
* 1-8 GPU işler çoğunluktaysa,
* kapasitenin zaman içerisinde artırılması isteniyorsa,
* simulation/HPC ve AI aynı altyapıda koşacaksa,
* çok sayıda bağımsız araştırma grubuna hizmet verilecekse.

### GB300 NVL72 tercih edilmelidir, eğer:

* büyük ve çok büyük LLM training ana workload ise,
* 8 GPU sınırı sık sık aşılacaksa,
* 72-GPU scale-up domain kullanılabilecekse,
* çok büyük reasoning/inference modelleri çalıştırılacaksa,
* MoE ve yoğun GPU-to-GPU communication workload'ları varsa,
* rack başına 120-142 kW sınıfı güç sağlanabiliyorsa,
* direct liquid cooling altyapısı mevcutsa veya kurulabiliyorsa,
* ARM64 software compatibility sağlanabiliyorsa,
* AI factory'nin ana amacı maksimum scale-up performance ise.

---

## 20. HİBRİT MİMARİ NE ZAMAN DAHA DOĞRU OLUR?

Hibrit yaklaşım, her iki platformun da gerektiği durumlarda değerlendirilmesi gereken bir seçenektir.

Hibrit yapıda:

### DGX B300 Pool

* araştırmacı workspace
* development
* fine-tuning
* LoRA/QLoRA
* küçük/orta inference
* simulation
* MIG
* VM
* bağımsız project workloads

için kullanılabilir.

### GB300 NVL72 Pool

* foundation model training
* massive distributed training
* large reasoning
* huge inference
* MoE
* model parallel workloads

için kullanılabilir.

Üst katmanda:

* Mission Control
* BCM
* Run:ai
* Kubernetes
* Slurm

ile kullanıcıların fiziksel altyapıyı bilmeden uygun resource pool'a yönlendirilmesi sağlanabilir.

Bu yaklaşım aslında iki platformun güçlü taraflarını birleştirmektedir.

---

## 21. ÖZET KARAR TABLOSU

| Öncelik | Önerilen Platform |
| ----- | ----- |
| Maksimum büyük-model performansı | **GB300 NVL72** |
| Maksimum kullanım esnekliği | **DGX B300** |
| Çok kullanıcı / çok workload | **DGX B300** |
| 72 GPU NVLink domain | **GB300 NVL72** |
| VM | **DGX B300** |
| MIG ağırlıklı kullanım | **DGX B300** |
| Traditional HPC | **DGX B300** |
| ARM-native HPC | **GB300 NVL72** |
| Trillion parameter training | **GB300 NVL72** |
| Massive reasoning inference | **GB300 NVL72** |
| Simulation + AI | **DGX B300** |
| Existing enterprise DC | **DGX B300** |
| Purpose-built AI Factory | **GB300 NVL72** |
| Kademeli yatırım | **DGX B300** |
| Maksimum rack compute density | **GB300 NVL72** |
| Çeşitli workload'ların aynı kurumda bulunması | **Hybrid** |

---

## 22. SONUÇ

DGX B300 ve GB300 NVL72 aynı GPU jenerasyonunu kullanmalarına rağmen iki farklı tasarım felsefesini temsil etmektedir.

**DGX B300 bir AI server'dır.**

Bağımsız, x86 tabanlı ve granular biçimde ölçeklenebilir. GPU kaynaklarını daha küçük birimler halinde farklı kullanıcı ve workload'lara dağıtmak, mevcut enterprise altyapıya entegre etmek ve farklı AI/HPC uygulamalarını aynı platformda çalıştırmak açısından oldukça esnektir.

**GB300 NVL72 ise rack-scale bir AI computer'dır.**

Asıl avantajı GPU sayısından ziyade **72 GPU'nun tek NVLink domain içerisinde çalışabilmesidir.** Büyük model training, reasoning, MoE ve communication-intensive distributed workloads için önemli ölçekleme avantajı sağlar.

Bu nedenle seçim yalnızca:

> "Ayrı 8-GPU sunucular mı, yoksa 72-GPU rack'ler mi?"

şeklinde yapılmamalıdır.

Asıl karşılaştırma:

> **GPU'ların bağımsız 8-GPU NVLink domain olarak mı, yoksa 72-GPU NVLink domain olarak mı kullanılmasının hedeflenen iş yüklerine daha uygun olduğu**

üzerinden yapılmalıdır.

İş yükü portföyü geniş, kullanıcı sayısı yüksek ve kaynak ihtiyaçları heterojense **DGX B300** daha dengeli bir seçimdir.

Ana hedef çok büyük foundation modeller, distributed training, MoE ve büyük-scale inference ise ve veri merkezi gerekli güç/sıvı soğutma altyapısını sağlayabiliyorsa **GB300 NVL72** mimarisi daha uygun olacaktır.

Her iki workload sınıfı da önemliyse, **hibrit DGX B300 + GB300 NVL72 mimarisi teknik açıdan en esnek yaklaşımı sağlar.**
