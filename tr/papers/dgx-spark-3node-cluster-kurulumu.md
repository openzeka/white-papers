---
title: DGX Spark 3-Node AI Cluster Kurulum Rehberi
parent: White Papers
nav_order: 5
lang: tr
page_id: dgx-spark-3node-cluster-kurulumu
description: >-
  3 NVIDIA DGX Spark node'undan oluşan ring (mesh) topolojisine sahip AI cluster
  kurulumu: management ve compute ağları, RoCEv2/RDMA, sparkrun yapılandırması.
permalink: /papers/dgx-spark-3node-cluster-kurulumu/
last_modified_date: 2026-07-29
toc: true
---

## İçindekiler

1. [Mimari Özet](#mimari-özet)
2. [Ön Koşullar](#ön-koşullar)
3. [DGX Spark Düğümlerin Hazırlığı](#dgx-spark-düğümlerin-hazırlığı)
   - [Sistem ve Firmware Güncellemeleri](#sistem-ve-firmware-güncellemeleri)
   - [Docker Yapılandırması](#docker-yapılandırması)
4. [Management Ağı (10GbE) Bağlantısı](#management-ağı-10gbe-bağlantısı)
5. [Compute Ağı (200GbE QSFP) Fiziksel Bağlantısı](#compute-ağı-200gbe-qsfp-fiziksel-bağlantısı)
6. [Spark'lara Sparkrun Yüklenmesi](#sparklara-sparkrun-yüklenmesi)
   - [Kullanıcı ve SSH Yapılandırması](#kullanıcı-ve-ssh-yapılandırması)
   - [sparkrun Kurulumu](#sparkrun-kurulumu)
7. [Hız ve RDMA Testleri](#hız-ve-rdma-testleri)
8. [sparkrun ile Model Çalıştırma](#sparkrun-ile-model-çalıştırma)
9. [Sonuç ve Doğrulama](#sonuç-ve-doğrulama)
10. [Sorun Giderme](#sorun-giderme)

---

*Bu ürünü satın almak için ilgili [sayfayı](https://openzeka.com/urun/nvidia-dgx-spark-triple/) ziyaret edebilirsiniz.*

Bu doküman, 3 NVIDIA DGX Spark node'undan oluşan ring (mesh) topolojisine sahip   
bir AI cluster'ın kurulum ve konfigürasyon adımlarını baştan sona anlatmaktadır.   
Cluster, dağıtık AI iş yüklerini ve model çalıştırmayı yönetmek için sparkrun   
araç setini kullanır.

Doküman; management ve compute ağlarının hazırlanması, ConnectX-7 QSFP112 port   
yapılandırması, RoCEv2/RDMA ayarları, SSH erişimi ve cluster sağlık kontrolü   
adımlarını kapsar.

## Mimari Özet

| Bileşen | Açıklama |
| :---- | :---- |
| **DGX Spark × 3** | Her birinde ConnectX-7 200GbE QSFP112 port bulunur |
| **QSFP112 Kablo x3** | Amphenol: NJAAKK-N911 |
| **sparkrun** | Cluster yönetim, SSH mesh ve CX7 yapılandırma araç seti |

## Ön Koşullar

**Donanım**

* 3× NVIDIA DGX Spark sistemi  
* 3× Amphenol: NJAAKK-N911 Kablo  
* Cat6 kablolar (management ağı)

**Yazılım ve İşletim Sistemi**

* DGX OS (her Spark sisteminde kurulu)  
* İnternet erişimi (paket indirmeleri ve güncellemeler için)

**Bilgi ve Erişim**

* Linux komut satırı temel bilgisi  
* Tüm cihazların fiziksel erişimi (kablo bağlantıları için)

**DGX Spark OS Kurulumu**

DGX Spark OS kurulumu için aşağıdaki videoyu kullanabilirsiniz:

[NVIDIA DGX Spark Kurulumu Part 1](https://www.youtube.com/watch?v=-z8GqGKDyXE)

## **DGX Spark Düğümlerin Hazırlığı**

Fiziksel bağlantılar ve ağ yapılandırmalarına geçmeden önce tüm Spark sistemlerinin güncel yazılım ve firmware sürümlerini kullandığından emin olunmalıdır. Kurulum sırasında karşılaşılan performans problemlerinin önemli bir kısmı eski sürücüler, eksik güncellemeler veya firmware uyumsuzluklarından kaynaklanabilmektedir.

Aşağıdaki işlemler üç Spark sistemi üzerinde de uygulanmalıdır.

### **Sistem ve Firmware Güncellemeleri**

İlk olarak işletim sistemi paketleri güncellenir:

```bash
sudo apt update
sudo apt dist-upgrade
```

Daha sonra sistem firmware'leri güncellenir:

```bash
sudo fwupdmgr refresh --force
sudo fwupdmgr upgrade
```

DGX Dashboard üzerinden, herhangi bir güncelleme olmadığı kontrol edilir, eğer varsa yapılır:

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/01-dgx-dashboard.png' | relative_url }})

Güncellemelerin tamamlanmasının ardından sistem yeniden başlatılır:

```bash
sudo reboot
```

Kurulum sırasında yapılan testlerde, güncel olmayan firmware sürümleri nedeniyle bağlantı performansının beklenen seviyeye ulaşmadığı gözlemlenmiştir. Bu nedenle kurulumun ilk adımı olarak tüm sistemlerin güncellenmesi önerilmektedir.

### **Docker Yapılandırması**

Sonraki adımlarda kullanılacak container tabanlı araçların sudo gerektirmeden çalıştırılabilmesi için her bir Spark üzerinde Docker post-install işlemleri uygulanır.

Öncelikle mevcut kullanıcı Docker grubuna eklenir:

```bash
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
```

Yapılandırmanın başarılı olduğu aşağıdaki test ile doğrulanabilir:

```bash
docker run hello-world
```

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/02-docker-hello.png' | relative_url }})

Komutun başarılı şekilde çalışması ve Docker'ın örnek container'ı başlatabilmesi, sonraki adımlarda kullanılacak container tabanlı araçlar için gerekli hazırlığın tamamlandığını göstermektedir.

**Depolama Sürücüsünün Kontrolü**

Ayrıca tüm Spark düğümlerinde Docker depolama sürücüsü kontrol edildi. `docker info` çıktısında Storage Driver değerinin `overlayfs` olduğu doğrulandı. `overlay2` veya farklı bir depolama sürücüsü tespit edilmesi durumunda Docker, containerd snapshotter (`overlayfs`) kullanacak şekilde yapılandırıldı ve Docker servisi yeniden başlatıldı. Böylece tüm düğümlerde aynı depolama altyapısı kullanılarak tutarlı bir çalışma ortamı sağlandı.

Öncelikle mevcut depolama sürücüsü aşağıdaki komut ile kontrol edildi:

```bash
docker info -f 'Driver={{.Driver}} DriverStatus={{.DriverStatus}} DockerRootDir={{.DockerRootDir}}'
```

Çıktıda sürücünün `overlay2` olarak görülmesi durumunda aşağıdaki yapılandırma uygulandı:

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "features": {
    "containerd-snapshotter": true
  }
}
EOF

sudo systemctl restart docker
```

Yapılandırma sonrasında aynı kontrol komutu tekrar çalıştırıldı ve depolama sürücüsünün `overlayfs` olduğu doğrulandı.

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/03-docker-storage.png' | relative_url }})

## Management Ağı (10GbE) Bağlantısı

Her bir DGX Spark'ın 10GbE Ethernet portu kullanılacak switch'in RJ45 portlarından birine Cat6 kablo ile bağlanır. Kablo takıldıktan sonra switch üzerindeki ilgili portun bağlantı göstergesinin yandığı teyit edilir.

Spark masaüstünde terminal açılır ve cihazın IP adresi alıp almadığını kontrol edin:

```bash
ip addr show
```

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/04-ip-addr.png' | relative_url }})

Çıktıda, örnekte olduğu gibi 10GbE arayüzünde bir IP adresi görüyorsanız, management ağı üzerinden SSH erişimi sağlanabilir. IP adresi alınmamışsa, DGX OS masaüstü üzerinden manuel olarak atanır:

1. Sağ üst köşedeki ağ simgesine tıklayın → Wired Settings seçin  
2. İlgili 10GbE bağlantısının yanındaki dişli (⚙) simgesine tıklayın  
3. IPv4 sekmesine geçin  
4. Method alanını Manual olarak değiştirin  
5. Aşağıdaki bilgileri girin:  
- Address: 192.168.1.163 (her Spark için farklı ve kendi ağınıza uygun olarak— .147, .148)  
- Netmask: 255.255.255.0  
- Gateway: 192.168.1.1 (varsa, yoksa boş bırakın)  
- DNS: 1.1.1.1,8.8.8.8  
6. Apply butonuna basın ve bağlantıyı kapatıp tekrar açın

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/05-wired-settings.png' | relative_url }})

İnternet erişimi varsa 10GbE management bağlantısı hazırdır. Diğer iki Spark üzerinde de aynı adımları tekrarlayın ve her birine farklı bir IP adresi atayın.

**Düğümler Arası Erişim Kontrolü**

Management ağı üzerinden tüm Spark'ların birbirini görebildiğini teyit edin. Bir Spark üzerinden diğerlerine ping atın:

```bash
ping -c 4 192.168.1.147
ping -c 4 192.168.1.148
```

Tüm ping'ler başarılıysa management ağı hazır ve tüm düğümler birbiriyle iletişim kurabiliyor demektir.

## Compute Ağı (200GbE QSFP) Fiziksel Bağlantısı

Mevcut kurulumda her Spark, üzerinde bulunan iki ConnectX-7 QSFP portu üzerinden 100GbE hızında (iki port toplamı 200GbE) diğer iki Spark’a bağlanır.

**Kablo Planı**

Üç Spark sistemi arasında oluşturulacak fiziksel bağlantıların port eşleşmeleri aşağıdaki gibidir:

| Kaynak | Hedef |
| ----- | ----- |
| Spark1 Port0 | Spark2 Port1 |
| Spark1 Port1 | Spark3 Port0 |
| Spark2 Port0 | Spark3 Port1 |

**![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/06-cable-plan.png' | relative_url }})**

## Spark’lara Sparkrun Yüklenmesi

   ### Kullanıcı ve SSH Yapılandırması

Ağ yapılandırması tamamlandıktan sonra Spark sistemlerinin birbirleriyle şifresiz olarak haberleşebilmesi için tüm node'larda ortak bir kullanıcı oluşturulmalıdır. sparkrun, bu kullanıcı üzerinden tüm node'lara SSH ile bağlanır ve cluster yönetim işlemlerini gerçekleştirir.

**Hostname Ayarlama**  
Her Spark'a benzersiz bir hostname verin. Bu, SSH known\_hosts yönetimi, log analizi ve cluster node takibi için gereklidir:

```bash
# Spark 1 üzerinde:
sudo hostnamectl set-hostname spark1

# Spark 2 üzerinde:
sudo hostnamectl set-hostname spark2

# Spark 3 üzerinde:
sudo hostnamectl set-hostname spark3
```

**Ortak Kullanıcı Oluşturma**  
Tüm Spark sistemlerinde aynı kullanıcı adı oluşturulmalıdır. Bu dokümanda nvidia kullanıcı adı kullanılacaktır. Aşağıdaki komutlar üç Spark sistemi üzerinde de çalıştırılır:

```bash
sudo useradd -m nvidia
sudo usermod -aG sudo nvidia
sudo passwd nvidia
```

Tüm sistemlerde aynı şifreyi kullanın — yönetim süreçlerini kolaylaştırır. sparkrun SSH mesh kurulumu sırasında ilk bağlantıda bu şifre sorulur, sonrasında anahtar tabanlı kimlik doğrulamaya geçilir.

**Passwordless Sudo Yapılandırması**

sparkrun, CX7 ağ yapılandırması sırasında sudo ile komutlar çalıştırır. Her seferinde şifre sormaması için passwordless sudo ayarlanmalıdır:

```bash
echo "nvidia ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/nvidia
sudo chmod 440 /etc/sudoers.d/nvidia
```

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/07-passwordless-sudo.png' | relative_url }})

### sparkrun Kurulumu

Kurulum nvidia kullanıcısı olan hesapta yapılır.

```bash
su - nvidia
```

Önce uv paketi kurulur:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
```

Sonra Sparkrun kurulur:

```bash
uvx sparkrun setup
```

Kurulum esnasında sorulan sorulara uygun cevaplar verilir:

1. öncelikle cihazların ip adresleri girilir:  
2. cluster için bir isim verilir  
3. SSH kullanıcı adı olarak önceki adımda oluşturulan `nvidia` ismi girilir.  
4. MESH kurulumu için Y seçilir

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/08-sparkrun-wizard.png' | relative_url }})

5. Configure CX7 networking? sorusuna Y denir:  
6. Topology seçimi “auto” olarak bırakılır veya ring de seçilebilir:

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/09-sparkrun-topology.png' | relative_url }})

7. Add 'nvidia' to the docker group on all hosts? sorusuna Y seçilir  
8. Install sudoers entries? sorusuna “Y” seçilir  
9. Install earlyoom? sorusuna “Y” seçilir  
10. Setup complete mesajı geldiğinde kurulum başarıyla tamamlanmış demektir

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/10-sparkrun-complete.png' | relative_url }})

## Hız ve RDMA Testleri

Bu adımda, compute ağının doğru çalıştığını ve RoCEv2 üzerinden RDMA iletişiminin beklendiği gibi performans verdiğini doğrulayacağız. Testler iki Spark arasında yapılır.

**IP Ataması Referansı**  
sparkrun wizard tarafından CX7 arayüzlerine atanan IP adresleri aşağıda göründüğü gibidir, sizin senaryoda bu adresler yerine kendi adreslerinizi kullanmanız gerekir:

| Spark | Management (enP7s7) | enp1s0f0np0 | enp1s0f1np1 | enP2p1s0f0np0 | enP2p1s0f1np1 |
| ----- | ----- | ----- | ----- | ----- | ----- |
| Spark 1 | 192.168.1.163 | 192.168.0.2 | 192.168.3.1 | 192.168.2.2 | 192.168.4.1 |
| Spark 2 | 192.168.1.147 | 192.168.5.2 | 192.168.2.1 | 192.168.6.2 | 192.168.0.1 |
| Spark 3 | 192.168.1.148 | 192.168.4.2 | 192.168.6.1 | 192.168.3.2 | 192.168.5.1 |

Ring topolojisinde her node çifti arasında 2 subnet bulunur (toplam 6 subnet). Testler bir node çifti üzerinden yapılır; diğer çiftler için benzer şekilde tekrarlanabilir:

- Link 0 (Spark 1 ↔ Spark 2): 192.168.0.0/24 \+ 192.168.2.0/24  
- Link 1 (Spark 1 ↔ Spark 3): 192.168.3.0/24 \+ 192.168.4.0/24  
- Link 2 (Spark 2 ↔ Spark 3): 192.168.5.0/24 \+ 192.168.6.0/24


**IP ve MTU Testi**  
Spark 1'den Spark 2'ye ping ile bağlantı ve jumbo frame testi yapın:

```bash
# Spark 1 üzerinde:
ping -c 4 192.168.0.1
ping -M do -s 8972 -c 4 192.168.0.1
```

İlk ping normal bağlantıyı, ikinci ping 9000 byte MTU'yu test eder. \-M do fragmentation'ı engeller — paket düşmezse MTU 9000 uçtan uca çalışıyor demektir.

İkinci subnet için de tekrarlayın:

```bash
ping -c 4 192.168.2.1
ping -M do -s 8972 -c 4 192.168.2.1
```

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/11-ping-mtu.png' | relative_url }})

**TCP Throughput Testi (iperf3)**  
Ethernet/IP katmanı üzerinden temel bant genişliğini ölçün. Bu test RDMA değildir — TCP üzerinden CPU involvement'lı transferdir.

```bash
# Spark 2 üzerinde (sunucu):
iperf3 -s
# Spark 1 üzerinde (istemci):
iperf3 -c 192.168.0.1 -P 8 -t 30
```

\-P 8 sekiz paralel akış, \-t 30 otuz saniye test süresi. Beklenen sonuç: \~100-120 Gbps toplam throughput.

Not: iperf3 kurulu değilse yükleyin:

```bash
sudo apt install iperf3
```

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/12-iperf3.png' | relative_url }})

**RDMA Cihazlarını Belirleme**  
RDMA cihaz adlarını öğrenin:

```bash
ibdev2netdev
```

Örnek çıktı:  
rocep1s0f0 port 1 \==\> enp1s0f0np0 (Up)  
rocep1s0f1 port 1 \==\> enp1s0f1np1 (Up)  
roceP2p1s0f0 port 1 \==\> enP2p1s0f0np0 (Up)  
roceP2p1s0f1 port 1 \==\> enP2p1s0f1np1 (Up)

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/13-ibdev2netdev.png' | relative_url }})

**RDMA Write Testi (ib\_write\_bw)**  
RoCEv2 üzerinden RDMA write işleminin bant genişliğini ölçün. Bu test CPU involvement olmadan doğrudan bellek transferini test eder.

**Subnet  192.168.0.0/24:**  
Spark 2 üzerinde (sunucu):

```bash
ib_write_bw -d roceP2p1s0f1 -F --report_gbits
```

Spark 1 üzerinde (istemci):

```bash
ib_write_bw -d rocep1s0f0 -F --report_gbits 192.168.0.1
```

Beklenen sonuç: \~100-111 Gbps.   
![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/14-ib-write-bw-1.png' | relative_url }})

**Subnet 192.168.2.0/24:**  
Spark 2 üzerinde (sunucu):

```bash
ib_write_bw -d rocep1s0f1 -F --report_gbits
```

Spark 1 üzerinde (istemci):

```bash
ib_write_bw -d roceP2p1s0f0 -F --report_gbits 192.168.2.1
```

Beklenen sonuç: \~100-111 Gbps.  
![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/15-ib-write-bw-2.png' | relative_url }})  
İki arayüz de \~100 Gbps veriyorsa, her Spark arasında toplam \~200 Gbps RDMA bant genişliği mevcuttur.

**RDMA Read Testi (ib\_read\_bw)**  
RDMA read işleminin bant genişliğini ölçün:

**Subnet 192.168.0.0/24:**  
Spark 2 üzerinde (sunucu):

```bash
ib_read_bw -d roceP2p1s0f1 -F --report_gbits
```

Spark 1 üzerinde (istemci):

```bash
ib_read_bw -d rocep1s0f0 -F --report_gbits 192.168.0.1
```

Beklenen sonuç: \~95-110 Gbps.  
![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/16-ib-read-bw-1.png' | relative_url }})

**Subnet 192.168.2.0/24:**  
Spark 2 üzerinde (sunucu):

```bash
ib_read_bw -d rocep1s0f1 -F --report_gbits
```

Spark 1 üzerinde (istemci):

```bash
ib_read_bw -d roceP2p1s0f0 -F --report_gbits 192.168.2.1
```

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/17-ib-read-bw-2.png' | relative_url }})

Beklenen sonuç: \~95-110 Gbps.

**RDMA Latency Testi (ib\_write\_lat)**  
Spark 2 üzerinde (sunucu):

```bash
ib_write_lat -d roceP2p1s0f1
```

Spark 1 üzerinde (istemci):

```bash
ib_write_lat -d rocep1s0f0 192.168.0.1
```

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/18-ib-write-lat.png' | relative_url }})

Beklenen sonuç: \~1-3 microsecond latency.

## sparkrun ile Model Çalıştırma

Bu adımda, sparkrun üzerinden çok node'lu bir inference iş yükü çalıştırarak cluster'ın uçtan uca çalıştığını doğrulayacağız.

**Model ve Recipe**  
Bu testte Intel/Qwen3.5-397B-A17B-int4-AutoRound modeli kullanılır. Model, 3 node üzerinde pipeline parallelism ile çalıştırılır. sparkrun varsayılan recipe'si tensor parallelism kullanacak şekilde yapılandırılmıştır; bu nedenle 3 node için pipeline parallelism kullanmak üzere özel bir YAML dosyası hazırlanmıştır.

**Modelin Çalıştırılması**  
Aşağıdaki YAML dosyasını *qwen3.5-397b-a17b-int4-vllm.yaml* adıyla kaydedin:

```bash
model: Intel/Qwen3.5-397B-A17B-int4-AutoRound
runtime: vllm-ray
min_nodes: 3
container: ghcr.io/spark-arena/dgx-vllm-eugr-nightly:latest

metadata:
  description: "Qwen3.5-397B-A17B int4 AutoRound - 3 Node PP3"

defaults:
  port: 8000
  host: 0.0.0.0
  tensor_parallel: 1
  pipeline_parallel: 3
  gpu_memory_utilization: 0.85
  max_model_len: 131072
  load_format: auto
  tool_call_parser: qwen3_coder
  reasoning_parser: qwen3

env:
  VLLM_MARLIN_USE_ATOMIC_ADD: "1"
  NCCL_DEBUG: "INFO"
  HF_TOKEN: ${HF_TOKEN}
  HF_HUB_OFFLINE: "1"
  TRANSFORMERS_OFFLINE: "1"
  HF_DATASETS_OFFLINE: "1"

command: |
  vllm serve {model} \
    --trust-remote-code \
    --gpu-memory-utilization {gpu_memory_utilization} \
    -tp {tensor_parallel} \
    -pp {pipeline_parallel} \
    --max-model-len {max_model_len} \
    --load-format {load_format} \
    --enable-auto-tool-choice \
    --tool-call-parser {tool_call_parser} \
    --reasoning-parser {reasoning_parser} \
    --host {host} \
    --port {port}
```

Ardından modeli çalıştırın:

```bash
sparkrun run qwen3.5-397b-a17b-int4-vllm.yaml
```

**SSH Authorization Hatası Çözümü**  
Eğer sparkrun komutu çalıştırıldıktan sonra kendine bağlanırken authorization ile ilgili bir hata alınırsa aşağıdaki komut kullanılır ve sparkrun tekrar çalıştırılır:

```bash
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
```

![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/19-ssh-auth-fix.png' | relative_url }})

**Modelin Hazır Olduğunun Doğrulanması**  
Model başladığında “Application startup complete.” şeklinde bir mesaj alırsınız, artık model kullanıma hazırdır:  
![]({{ '/papers/dgx-spark-3node-cluster-kurulumu/images/20-model-startup.png' | relative_url }})

**Benchmark Sonuçları**  
Bu şekilde ayağa kalkan modelde [linkte](https://github.com/CordatusAI/llm-benchmark) verdiğimiz benchmark aracıyla yapılan testler sonucunda elde edilen ortalama değerler şu şekildedir:

| Eşzamanlı İstek | TTFT (ms) | Token/sn | Gecikme (sn) | Verim (RPS) |
| ----- | ----- | ----- | ----- | ----- |
| 1 | 452 | 16.69 | 7.67 | 0.13 |
| 2 | 708 | 13.63 | 9.40 | 0.11 |
| 4 | 827 | 10.19 | 12.57 | 0.08 |
| 8 | 1394 | 6.54 | 19.57 | 0.05 |

## Sonuç ve Doğrulama

Bu dokümandaki adımları takip ederek aşağıdaki bileşenlerden oluşan tam fonksiyonel bir DGX Spark AI cluster'ı kurulmuş olur:

| Bileşen | Durum | Doğrulama Yöntemi |
| :---- | :---- | :---- |
| Management Ağı (10GbE) | Hazır | Düğümler arası ping başarılı |
| Compute Ağı (200GbE QSFP) | Hazır | ib\_write\_bw \~100-111 Gbps |
| RoCEv2 / RDMA | Hazır | ib\_write\_lat \~1-3 µs |
| sparkrun Cluster | Hazır | sparkrun setup tamamlandı |
| Model Servisi | Hazır | "Application startup complete." mesajı |

**Cluster Sağlık Kontrolü Özeti**

Kurulumun tamamlandığını doğrulamak için aşağıdaki kontrolleri gerçekleştirebilirsiniz:

1. **Management ağı:** Tüm düğümler birbirini ping edebiliyor mu?  
2. **Compute ağı:** `ib_write_bw` testinde her subnet \~100 Gbps veriyor mu?  
3. **MTU:** `ping -M do -s 8972` testi paket düşmeden geçiyor mu?  
4. **sparkrun mesh:** Tüm node'lara şifresiz SSH erişimi çalışıyor mu?  
5. **Model:** Benchmark sonuçları yukarıdaki tabloyla tutarlı mı?

Tüm bu kontroller başarılıysa cluster AI iş yükleri için hazırdır.

## Sorun Giderme

**Docker Storage Driver `overlay2` Görünüyor**

`docker info` çıktısında `overlay2` görüyorsanız `/etc/docker/daemon.json` dosyasına `containerd-snapshotter` feature'ını ekleyin ve Docker'ı yeniden başlatın (bkz. Docker Yapılandırması).

**ping \-M do ile Jumbo Frame Testi Başarısız**

Spark tarafında CX7 arayüzlerinin MTU değerlerinin 9000 olduğundan emin olun: `ip link show`.

**RDMA Bant Genişliği Düşük (\~100 Gbps Altında)**

* Tüm sistem ve firmware güncellemelerinin yapıldığından emin olun (bkz. Sistem ve Firmware Güncellemeleri).  
* Kablo bağlantılarının sağlam olduğunu kontrol edin.  
* ibdev2netdev çıktısı ile arayüz-cihaz eşleşmesini doğrulayın.

**sparkrun SSH Authorization Hatası**

sparkrun çalıştırıldığında authorization hatası alınırsa:

```bash
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
```

Komutunu çalıştırın ve sparkrun'u tekrar çalıştırın.
