---
title: LMCache ile LLM Çıkarımında KV Cache Taşıma
parent: White Papers
nav_order: 11
lang: tr
page_id: kv-cache-offloading-lmcache
date: 2026-10-21
card_tag: "LLM Benchmark"
description: >-
  Aynı bağlamların geri geldiği iş yükünde LMCache'in vLLM'e kattığı değer: DGX
  Spark'te üç katmanlı KV cache (GPU, CPU, NVMe), ölçülen TTFT — tekrar erişimde
  1.95×, servis yeniden başlatmasında 3.3× — ve bununla birlikte gelen ayarlar
  ve sınırlar.
permalink: /papers/kv-cache-offloading-lmcache/
last_modified_date: 2026-10-21
toc: true
---

> **Yayın tarihi:** Ekim 2026
> **Kapsam:** Aynı bağlamları yeniden işleyen bir iş yükünde LMCache eklendiğinde ilk token'a kadar geçen sürede (TTFT) neyin değiştiği: üç önbellek katmanı ve bir aramanın nasıl çalıştığı, `nvidia/Qwen3.6-35B-A3B-NVFP4` ile DGX Spark üzerinde üç tekrarlı bir A/B ölçümü, servis yeniden başlatıldıktan sonra disk kayıtlarının katkısı ve üretim kullanımdan önce doğrulanması gereken ayarlar.
> **Not:** Ölçülen hızlanma oranları Bölüm 1–3'teki modele, donanıma, önbellek ayarlarına ve tekrar erişimli iş yüküne uygundur. Tekrar kullanılan bağlamı olmayan iş yüklerinde aynı oran beklenmemelidir.

{% include company/block.html name="prepared_by" %}

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## Yönetici Özeti

- **Soru.** Aynı 8,000 token'lık bağlamların sonraki turlarda geri geldiği bir iş yükünde LMCache eklendiğinde TTFT'ye ne olur? LMCache, daha önce hesaplanan KV cache verilerini GPU belleğinin dışındaki katmanlarda tutar ve yeniden hesaplamak yerine geri yükler; hızlanma, ne kadarının yeniden kullanılabildiğine ve geri yüklemenin maliyetine bağlıdır.
- **Kurulum.** NVIDIA DGX Spark (GB10, SM 12.1, 121 GB birleşik bellek) üzerinde `nvidia/Qwen3.6-35B-A3B-NVFP4` — NVFP4 biçiminde 22 GB, hibrit Mamba/GDN ve MoE mimarisi, 35B toplam ve 3B etkin parametre — vLLM 0.25.1 + LMCache 0.5.1 ile servis edildi. İş yükü, 8,000 token uzunluğunda 665 bağlamdır; toplamda yaklaşık 5.3 milyon token. İki tur işlenir: biri önbelleği doldurmak, diğeri ölçmek için. İstekler sıralı gönderilir, aynı anda yalnızca bir istek işlenir.
- **Ölçülen sonuç.** Üç tekrarın medyan TTFT değeri, yalnızca vLLM ile **1,279.1 ms**'ten vLLM + LMCache ile **655.2 ms**'e düşer — **1.95× hızlanma**, yaklaşık %49 daha düşük TTFT. Üç tekrar birbirini doğrular: 1,276–1,289 ms'e karşı 653–656 ms.
- **Neden burada geçerli.** Çalışma kümesi, 55.31 GiB'lık GPU KV cache'ine (`fp8`) karşı yaklaşık 63 GB'dır; bu nedenle yalnızca GPU önbelleği onu tutamaz. İkinci turda veriler yeniden hesaplanmak yerine CPU bellekten ve diskten geri yüklenir. Bağlamların yalnızca bir kez kullanıldığı iş yüklerinde bu kazanç beklenmemelidir.
- **Servis yeniden başlatmasından sonra.** Disk kayıtları hâlâ duruyor ve eşleşiyorsa, aynı iş yükü **8.51 s**'lik soğuk başlangıç yerine **2.61 s**'te tamamlanır — yaklaşık **3.3×**. Diskteki bir kayıt, ancak istekle eşleşip başarıyla geri yüklendiğinde işe yarar.
- **Birden fazla vLLM örneğinin ortak önbellek kullanması**, çok süreçli (MP) mimarinin sağladığı bir olanağıdır; ancak burada ölçülmemiştir: deney tek bir vLLM örneğiyle yürütülmüştür. İsteklerin örnekler arasında dağıtılması ayrı bir mekanizmadır; LMCache tek başına bir yük dengeleyici değildir.

---

## 1. Amaç ve Yöntem

### 1.1. Araştırma sorusu

Bu deney, aynı bağlamları yeniden işleyen bir iş yükünde LMCache eklendiğinde ilk token'ın üretilmesine kadar geçen sürede (TTFT) neyin değiştiğini ölçer.

LMCache, daha önce hesaplanan KV cache verilerini sadece GPU belleğinde değil, onun dışındaki katmanlarda da saklayarak aynı bağlamın yeniden işlenmesi ihtiyacını azaltmayı amaçlar. Ancak sağladığı hızlanma, önbellekteki verilerin yeniden kullanılabilmesine ve bu verilerin geri yüklenme maliyetine bağlıdır.

### 1.2. İş yükü

Testte her biri 8,000 token uzunluğunda 665 farklı bağlam kullanılır — toplamda yaklaşık 5.3 milyon token.

Deney iki turda yürütülür:

- **1. tur — önbelleğin doldurulması:** Bağlamlar işlenir ve önbellek kayıtları oluşturulur.
- **2. tur — performansın ölçülmesi:** Aynı bağlamlara yeniden erişilir ve TTFT ölçülür.

Karşılaştırmada iki senaryo kullanılır:

- **A senaryosu:** Yalnızca vLLM.
- **B senaryosu:** vLLM + LMCache.

İstekler sıralı gönderilir ve aynı anda yalnızca bir istek işlenir. Böylece sonuçlar, eşzamanlı isteklerin oluşturabileceği ek etkilerden mümkün olduğunca ayrı tutulur.

---

## 2. Kurulum ve Önbellek Mimarisi

### 2.1. Önbellek katmanları

Bu kurulumda önbellek üç katman üzerinden yönetilir.

| Katman | Kapasite | Görevi |
| --- | --- | --- |
| L0 | 55.31 GiB GPU KV cache'i (`fp8`) | En hızlı önbellek; vLLM onu GPU belleğinde tutar |
| L1 | 20 GB CPU belleği | GPU dışındaki ara önbellek |
| L2 | NVMe SSD; `fs` adaptörü, `use_odirect=true` | KV verilerinin disk üzerinde saklandığı katman |

LMCache'in temel işlevi, yeniden kullanılabilecek KV verilerini bu katmanlarda tutmak ve gerektiğinde aynı verileri yeniden hesaplamak yerine önbellekten geri yüklemektir.

**Önbellekte arama:** Bir isteğin verisi önce GPU önbelleğinde (L0), ardından CPU belleğinde (L1) ve disk katmanında (L2) aranır. Diskte bir kaydın bulunup bulunmadığına metadata ve indeks bilgileriyle karar verilir. Kayıt bulunduğunda KV verisinin kendisi ayrıca okunup aktarılır. Dolayısıyla verinin diskte bulunması, verinin GPU'ya anında ve maliyetsiz biçimde ulaşacağı anlamına gelmez.

**KV verilerinin kaydedilmesi:** Deney sırasında hesaplanan KV verilerinin L1'e yazıldığı, L2'ye yazma işleminin ise eşzamansız olarak sürdüğü gözlenmiştir. Bu nedenle TTFT ölçümüne disk yazımının katkısının düşük olduğu değerlendirilmiştir. Ancak bu gözlem, her iş yükünde veya her kayıt boyutunda disk yazma maliyetinin sıfır olduğu anlamına gelmez.

Soğuk istekler sırasında yaklaşık 25 istek boyunca gözlenen disk yazma sayısının yaklaşık üç dosya/istek olarak raporlandığı görülmüştür. Bu ölçüm, kullanılan deney koşullarıyla sınırlıdır.

**Önbellekten veri çıkarma:** L1 kullanımı belirlenen eşiğe ulaştığında tahliye (eviction) işlemi başlar. `--eviction-ratio`, her tahliye çevriminde boşaltılacak bellek oranını belirler. Deneyde `0.99` kullanılmıştır. Bu değer, üretim için önerilen varsayılan ayar değildir.

**Diskte biriken kayıtlar:** Kullanılan `fs` adaptöründe eski kayıtların otomatik silinmesi veya disk alanının kendiliğinden geri kazanılması bu deneyde gözlenmemiştir. 19 Ekim 2026'da yapılan kontrolde, 6–15 Ekim döneminden kalan yaklaşık 377 kayıt ve toplam 32 GB veri hâlâ diskte bulunuyordu.

Bu gözlem, kullanılan yapılandırmada disk kayıtlarının zamanla birikebildiğini göstermektedir. Kayıt sayısı arttıkça arama maliyetinin nasıl değiştiği ayrıca ölçülmelidir.

### 2.2. Deney boyunca sabit tutulan ayarlar

| Ayar | Değer |
| --- | --- |
| KV veri türü ve blok boyutu | `fp8`, `block_size=2144`, `--chunk-size 2144` |
| Toplu ön işleme token sınırı | `--max-num-batched-tokens 4287` (`2N−1`) |
| Hibrit model önbelleği | `--mamba-cache-mode align` |
| vLLM ön-ek önbelleği (prefix cache) | `--enable-prefix-caching` |
| Tahliye politikası | `LRU` |
| Tahliye eşiği | `--eviction-trigger-watermark 0.80` |
| Tahliye oranı | `--eviction-ratio 0.99` |
| Spekülatif kod çözme | MTP, 3 spekülatif token |
| Turlar arasındaki bekleme | 5 saniye |
| Konteyner başladıktan sonra bekleme | 10 saniye |

> **Önemli:** `--eviction-ratio 0.99`, deneyde önbelleğin kapasitesinin aşılması durumunu belirginleştirmek için kullanılmıştır. Üretimde kullanılan varsayılan `0.20` değeriyle tahliye davranışı farklı olabilir.

### 2.3. Başlatma komutları

#### A senaryosu — yalnızca vLLM

```bash
docker run -d --name bench-vllm-off \
  --gpus all --ipc=host --network host --shm-size 32g \
  --memory 112g --memory-swap 112g \
  -v /home/nvidia/.cache/huggingface:/home/nvidia/.cache/huggingface \
  -v /home/nvidia/.triton:/home/nvidia/.triton \
  -e HF_HOME=/home/nvidia/.cache/huggingface \
  -e HF_HUB_OFFLINE=1 \
  -e VLLM_USE_RUST_FRONTEND=1 \
  vllm/vllm-openai:latest \
  nvidia/Qwen3.6-35B-A3B-NVFP4 \
    --host 0.0.0.0 --port 8100 \
    --served-model-name qwen3.6-35b-a3b \
    --trust-remote-code --tensor-parallel-size 1 \
    --enable-auto-tool-choice --tool-call-parser qwen3_coder --reasoning-parser qwen3 \
    --mm-encoder-tp-mode data --language-model-only \
    --kv-cache-dtype fp8 --attention-backend flashinfer --moe-backend marlin \
    --gpu-memory-utilization 0.5 --max-model-len 262144 \
    --max-num-seqs 16 --max-num-batched-tokens 4287 \
    --enable-chunked-prefill --async-scheduling --enable-prompt-tokens-details \
    --mamba-cache-mode align --load-format fastsafetensors \
    --speculative-config '{"method":"mtp","num_speculative_tokens":3,"moe_backend":"triton"}' \
    --enable-prefix-caching
```

#### B senaryosu — vLLM + LMCache

Önce LMCache sunucusu başlatılır:

```bash
docker run -d --name bench-lmcache \
  --gpus all --ipc=host --network host \
  -v /home/nvidia/kv-cash-exp/lmcache-l2:/home/nvidia/kv-cash-exp/lmcache-l2 \
  --entrypoint /usr/local/bin/lmcache \
  vllm/vllm-openai:latest \
  server --host 127.0.0.1 --port 5555 --http-port 8080 \
    --chunk-size 2144 \
    --l1-size-gb 20 --l1-init-size-gb 4 \
    --eviction-policy LRU --eviction-trigger-watermark 0.80 --eviction-ratio 0.99 \
    --supported-transfer-mode lmcache_driven \
    --l2-adapter '{"type":"fs","base_path":"/home/nvidia/kv-cash-exp/lmcache-l2","relative_tmp_dir":".tmp","use_odirect":true}'
```

Ardından vLLM, A senaryosundaki model ve çıkarım ayarlarıyla başlatılır. Tek fark aşağıdaki LMCache bağlantı yapılandırmasının eklenmesidir:

```bash
--kv-transfer-config '{"kv_connector":"LMCacheMPConnector","kv_role":"kv_both","kv_connector_extra_config":{"lmcache.mp.host":"127.0.0.1","lmcache.mp.port":5555,"lmcache.mp.mq_timeout":300}}'
```

Bu yapılandırma, vLLM'in LMCache'in çok süreçli (MP) bağlayıcısını kullanmasını sağlar.

**Başlatma sırası:** Önce LMCache sunucusu başlatılır ve `/healthcheck` uç noktasının sağlıklı yanıt verdiği doğrulanır. Ardından vLLM başlatılır ve ölçüm öncesinde 10 saniye beklenir.

**Senaryoların birbirinden ayrılması:** A senaryosunda yalnızca `bench-vllm-off`, B senaryosunda ise `bench-lmcache` ve `bench-vllm-on` çalışır.

Deneyden sonra konteynerler şu komutla kaldırılabilir:

```bash
docker rm -f bench-vllm-off bench-vllm-on bench-lmcache
```

---

## 3. Sonuçlar

Yaklaşık 63 GB büyüklüğündeki çalışma kümesi, 55 GB olan GPU KV cache kapasitesini aşar. Performans ölçümü, aynı bağlamlara ikinci turda yeniden erişildiğinde yapılmıştır.

| Ölçüm | A: Yalnızca vLLM | B: vLLM + LMCache | Hızlanma |
| --- | ---: | ---: | ---: |
| **Üç tekrarın medyan TTFT değeri** | **1,279.1 ms** | **655.2 ms** | **1.95×** |
| İlk ölçümün TTFT değeri | 1,461.6 ms | 743.0 ms | 1.97× |

Üç tekrarda gözlenen TTFT aralıkları şöyledir:

- **A senaryosu:** 1,276–1,289 ms
- **B senaryosu:** 653–656 ms

Üç tekrarın tamamında B senaryosunun TTFT değeri A senaryosundan düşük çıkmıştır.

Sonuçlara göre LMCache, bu deney koşullarında medyan TTFT değerini yaklaşık %49 azaltmıştır. Başka bir ifadeyle, ilk token'ın üretilmesine kadar geçen süre yaklaşık 1.95× iyileşmiştir.

Bu sonuç yalnızca test edilen model, donanım, önbellek ayarları ve tekrar erişimli iş yükü için geçerlidir. Farklı iş yüklerinde aynı hızlanma oranının elde edileceği varsayılmamalıdır.

---

## 4. Değerlendirme

### 4.1. Aynı bağlamlar tekrar ziyaret edildiğinde TTFT'nin düşmesi

Çalışma kümesi GPU KV cache kapasitesini aştığında, daha önce hesaplanan KV verilerini önbellekten geri yüklemek aynı bağlamı yeniden hesaplamaktan daha hızlı olabilir.

Bu deneyde üç tekrarın medyan TTFT değeri A senaryosunda 1,279.1 ms, B senaryosunda 655.2 ms olarak ölçülmüştür: LMCache ile yaklaşık **1.95× hızlanma**.

Bu sonuç özellikle aşağıdaki iş yükleri açısından önemlidir:

- Uzun bağlamların birden fazla tur boyunca kullanıldığı ajan sistemleri.
- Aynı kod tabanının tekrar tekrar incelendiği kod analizi uygulamaları.
- Benzer bağlamların farklı kullanıcılar veya oturumlar tarafından yeniden kullanıldığı sistemler.

Buna karşılık, bağlamların yalnızca bir kez kullanıldığı iş yüklerinde aynı kazanç beklenmemelidir. Gerçek performans farkını önbellek isabet oranı (hit rate), verinin geri yüklenme süresi ve yeniden hesaplama maliyeti belirler.

### 4.2. Servis yeniden başlatıldıktan sonra disk önbelleğinin katkısı

Diskteki KV kayıtları korunuyor ve yeni isteklerle eşleşiyorsa, servis yeniden başladıktan sonra da bu kayıtlardan yararlanılabilir. Böylece daha önce hesaplanmış verilerin yeniden kullanımı mümkün olabilir.

Bu deneyde aynı iş yükü soğuk başlangıçta 8.51 saniyede, disk kayıtları kullanıldığında ise yeniden başlatma sonrasında 2.61 saniyede tamamlanmıştır — yaklaşık **3.3× hızlanma**.

Bu sonuç, disk önbelleğinin servis yeniden başlatmasından sonra da fayda sağlayabildiğini göstermektedir. Ancak bu avantaj, depolama adaptörünün davranışına, kayıtların geçerliliğine ve verilerin başarıyla geri yüklenmesine bağlıdır.

**Bir kaydın diskte bulunması, o kaydın mutlaka kullanılabileceği anlamına gelmez.** Kaydın istekle eşleşmesi ve başarıyla geri yüklenmesi gerekir.

### 4.3. Birden fazla vLLM örneğinin ortak önbellek kullanması

Çok süreçli (MP) mimari, tek bir LMCache sunucusunun birden fazla vLLM örneğine hizmet vermesine olanak tanır. Uygun koşullar sağlandığında farklı vLLM örnekleri, ortak L1 CPU belleğinde veya yapılandırılmışsa L2 disk katmanında bulunan KV kayıtlarını yeniden kullanabilir.

Bu mimarinin üç temel avantajı vardır.

**1. Önbellek vLLM örnekleri arasında paylaşılır.**

Bir vLLM örneğinin daha önce işlediği bir bağlam, uygun koşullarda başka bir vLLM örneğinin isteğinde de kullanılabilir. Aynı bağlamın her örnekte baştan hesaplanması ihtiyacı azalabilir.

**2. GPU belleği daha verimli kullanılır.**

Aynı bağlamların her vLLM örneğinin GPU önbelleğinde ayrı ayrı tutulması gereksinimi azalabilir. Aynı modelin birden fazla örneğinin çalıştığı durumlarda bu yaklaşım toplam GPU bellek ihtiyacını azaltma potansiyeli taşır.

Ancak LMCache kullanımı GPU belleği ihtiyacını tamamen ortadan kaldırmaz. Önbellekten geri yüklenen verilerin GPU'ya aktarılması ve kullanılması için yine bellek gerekir.

**3. Önbellek yönetimi merkezileşir.**

L1 kapasitesi, L2 depolaması ve önbellek işlemleri ayrı bir LMCache hizmeti üzerinden yönetilebilir. Birden fazla çıkarım örneğinin bulunduğu sistemlerde bu yaklaşım yönetimi kolaylaştırabilir.

Bu avantajlardan yararlanmak için vLLM örneklerinin uyumlu model, tokenizer, KV düzeni ve önbellek yapılandırmalarıyla çalışması gerekir. İsteklerin örneklere nasıl dağıtıldığı, LMCache sunucusunun kapasitesi ve kayıtların geçerliliği de performansı etkiler.

**Önemli sınırlama:** LMCache tek başına bir yük dengeleyici değildir. İsteklerin farklı vLLM örneklerine dağıtılması ayrı bir mekanizmayla sağlanmalıdır. Ayrıca birden fazla örneğin aynı LMCache sunucusuna bağlanması CPU, bellek, ağ ve disk üzerindeki yükü artırabilir. Sistem büyüdükçe bu kaynaklar izlenmelidir.

Bu deneyde yalnızca bir vLLM örneği kullanılmıştır. Bu nedenle birden fazla örnek arasında ortak önbellek kullanımının performansa katkısı doğrudan ölçülmemiştir. Bu özellik, deneyle kanıtlanmış bir performans sonucu değil, LMCache MP mimarisinin sağlayabileceği ek bir kullanım olanağıdır.

### Genel değerlendirme

Deney, GPU KV cache kapasitesini aşan ve aynı bağlamların tekrar kullanıldığı iş yüklerinde LMCache'in TTFT'yi düşürebildiğini göstermektedir.

Diskteki kayıtlar, uygun koşullarda servis yeniden başlatmasından sonra da kullanılabilir olabilir. Birden fazla vLLM örneğinin ortak önbellekten yararlanması ise daha büyük dağıtımlarda ek avantaj sağlayabilir. Ancak bu son kullanım senaryosunun performans katkısını belirlemek için birden fazla vLLM örneğiyle ayrı bir test yapılmalıdır.

---

## 5. LMCache kurulumu: Doğrulanması gereken ayarlar ve üretim önerileri

Bu bölümde LMCache'in çok süreçli kurulumuna ve Qwen hibrit modellerine ilişkin resmî belgelerdeki gereksinimler, deneyde kullanılan ayarlarla birlikte ele alınmaktadır.

**Deneyde kullanılan ayarlar ile üretim ortamında önerilen ayarlar aynı değildir.** Özellikle tahliye oranı, hibrit model desteği ve kayıtların yaşam döngüsü üretim kullanımdan önce ayrıca değerlendirilmelidir.

Resmî kaynaklar:

- [LMCache — Deployment Guide](https://docs.lmcache.ai/mp/deployment.html)
- [LMCache — Configuration Reference](https://docs.lmcache.ai/mp/configuration.html)
- [LMCache — Qwen3.5 / Qwen3.6 / Qwen3.8 model reçetesi](https://docs.lmcache.ai/recipes/qwen3_5.html)
- [LMCache — Quick Start](https://docs.lmcache.ai/mp/quickstart.html)

### 5.1. Çok süreçli kurulum ve bağlantı ayarları

MP modunda LMCache önbellek sunucusu, vLLM çıkarım (inference) sürecinden ayrı çalışır. vLLM, `LMCacheMPConnector` aracılığıyla bu sunucuya bağlanır; böylece önbellek yönetimi ve depolama işlemleri başka bir süreçte yürütülür.

| Konu | Gereksinim veya açıklama |
| --- | --- |
| Bağlayıcı | `LMCacheMPConnector` |
| KV rolü | `kv_role=kv_both` |
| İletişim | Varsayılan olarak ZMQ; varsayılan port `5555` |
| HTTP sağlık kontrolü | HTTP sunucusu etkinse varsayılan port `8080`; `/healthcheck` uç noktası |
| Prometheus metrikleri | Varsayılan port `9090` |
| Konteyner ağı | Aynı ana makinedeki bağlantılar için `--network host` kullanılabilir |
| IPC | Geleneksel CUDA IPC aktarımı `--ipc=host` gerektirir; yalıtılmış IPC ayrı bir kurulum seçeneğidir |

**Başlatma sırası:** Önce LMCache sunucusu başlatılmalı, ardından sağlık kontrolünün (health check) başarılı olduğu doğrulanmalı ve son olarak vLLM çalıştırılmalıdır. Yalnızca sabit bir süre beklemek yerine sağlık kontrolünün gerçekten başarılı olduğunu doğrulamak daha güvenilirdir.

`--network host` ve `--ipc=host` farklı amaçlara hizmet eder:

- `--network host`, konteynerin ana makinenin ağ yapılandırmasını kullanmasını sağlar. Bu deneyde vLLM'in LMCache'e `127.0.0.1:5555` üzerinden bağlanmasını kolaylaştırır.
- `--ipc=host`, geleneksel IPC yapılandırmasında ortak `/dev/shm` alanına erişim sağlar ve ilgili CUDA IPC aktarım senaryolarında gerekebilir.

Bu iki seçeneğin birbirinin yerine kullanılamayacağı unutulmamalıdır.

#### Yalıtılmış IPC seçeneği

LMCache'in `--isolated-ipc` seçeneği, desteklenen CUDA IPC mekanizmalarıyla iki konteynerin ortak `/dev/shm` alanına ihtiyaç duymadan çalışmasına olanak sağlayabilir.

Bu seçenek kullanılacaksa:

- LMCache sunucusu `--isolated-ipc` ile başlatılmalıdır.
- vLLM tarafında `lmcache.mp.isolated_ipc=true` ayarlanmalıdır.
- Her iki tarafta da aynı IPC modu kullanılmalıdır. Modların uyuşmaması aktarım hatalarına yol açabilir.
- CUDA bellek ayırıcısı ve vLLM uyku modu gibi özelliklerle uyumluluk ayrıca kontrol edilmelidir.

Yalıtılmış IPC'nin her kurulumda daha hızlı veya daha uygun olduğu varsayılmamalıdır. Bu yöntem, deneyde kullanılan geleneksel yapılandırmadan farklıdır ve ayrı olarak test edilmelidir.

### 5.2. Hibrit Mamba/GDN modellerinde dikkat edilmesi gerekenler

Qwen3.5, Qwen3.6 ve Qwen3.8 ailesindeki ilgili hibrit modeller, tam dikkat (full attention) katmanlarını Mamba/Gated-DeltaNet (GDN) katmanlarıyla birleştirir.

Bu mimarilerde yalnızca klasik attention KV bloklarının değil, tekrarlayan durum bilgilerinin de önbelleğe alınması gerekir. Bu nedenle vLLM ve LMCache ayarlarının birbiriyle uyumlu olması önemlidir.

İlgili Qwen hibrit model reçetesinde üç temel ayar öne çıkar:

1. vLLM tarafında `--mamba-cache-mode align`.
2. vLLM tarafında `--enable-prefix-caching`.
3. LMCache tarafında modele uygun chunk boyutu ve `--separate-object-groups`.

#### Blok boyutu N nasıl belirlenir?

`N`, tüm modeller için geçerli sabit bir değer değildir. Kullanılan model ve vLLM yapılandırmasına göre belirlenmelidir.

vLLM başlangıç kayıtlarında şu tür bir satır aranmalıdır:

```text
Setting attention block size to N tokens
```

Bu deneyde `N = 2144` değeri kullanılmıştır. Yeniden üretim sırasında bu değerin başlangıç kayıtlarıyla doğrulanması gerekir.

Resmî reçetelerde başka modeller için verilen `784` ve `544` değerleri bu modele doğrudan uygulanmamalıdır.

#### `--separate-object-groups` seçeneği neden önemlidir?

Hibrit modellerde `--separate-object-groups`, Mamba durum verilerinin ayrı önbellek nesne gruplarında yönetilmesini sağlar. İlgili Qwen hibrit model reçetesi bu seçeneğin kullanılmasını gerekli kabul etmektedir.

Ana deneyde bu seçenek kapalı tutulmuştur. Bunun nedeni, LMCache'in prefix-suffix-tuner kıyaslama reçetesinde bu seçeneğin yer almaması ve ana A/B karşılaştırmasına ek bir değişken eklememektir.

Seçenek ayrıca açık ve kapalı olarak test edilmiştir. Bu karşılaştırmada TTFT açısından ölçülebilir bir fark gözlenmemiş; medyan hızlanma yaklaşık 1.95× olarak kalmıştır.

Bu sonuç, seçeneğin her koşulda etkisiz olduğu anlamına gelmez. Test edilen iş yükünde performans farkı gözlenmemiştir; ancak kayıtların doğruluğu ve isabet oranı üzerindeki olası etkiler ayrıca değerlendirilmelidir.

**Öneri:** Üretim ortamında resmî Qwen hibrit model reçetesine uyum sağlamak için `--separate-object-groups` seçeneği etkinleştirilmeli ve doğruluk ile önbellek isabet oranı yeniden test edilmelidir.

#### `--chunk-size` ve `--max-num-batched-tokens` ayarları

LMCache'in `--chunk-size` değeri, vLLM'in kullandığı birleşik blok boyutuyla uyumlu olmalıdır. Bağlayıcı, yapılandırılan minimum chunk boyutunu modelin KV düzenine göre daha büyük bir değere çıkarabilir. Bu nedenle yalnızca komut satırındaki değere güvenilmemeli, başlangıç kayıtları da incelenmelidir.

Hibrit modellerde `--max-num-batched-tokens` ayarı, prefill ile decode'ın birlikte yürütülmesini etkiler.

| `--max-num-batched-tokens` değeri | Beklenen davranış |
| --- | --- |
| `N` | Her zamanlayıcı adımında yalnızca bir blokluk bütçe kalabilir. Decode sürerken yeni bir isteğin prefill'ine başlamak zorlaşabilir ve eşzamanlılık ciddi biçimde düşebilir. |
| `N` ile `2N` arasında; örneğin `2N−1` | Her adımda bir blok ilerlenmesine olanak tanırken prefill ile decode'ın birlikte yürütülmesi için ek bütçe bırakabilir. |
| `2N` veya üzeri | Daha büyük prefill adımları kullanılabilir. Ancak önbellek durumunun kaydedildiği sınırlar daha seyrek hâle gelebilir ve ön-ek yeniden kullanımı daha kaba olabilir. |

Bu deneyde `N = 2144` kabulüyle `2N−1 = 4287` kullanılmıştır. Bu seçim, belirtilen hibrit model reçetesindeki yaklaşımla uyumludur. Farklı bir model veya blok boyutu kullanıldığında değer yeniden hesaplanmalıdır.

İlgili Qwen hibrit model reçetesi, düşük isabet oranına veya soğuk önbelleğe sahip bir testte `max-num-batched-tokens=N` kullanıldığında yaklaşık 7× yavaşlama bildirmektedir. Bu oran tüm iş yükleri için geçerli değildir; belirli koşullarda eşzamanlılık kaybının performansı ne kadar etkileyebileceğine ilişkin bir örnektir.

**Ek kontrol:** vLLM başlangıcında `max_num_seqs exceeds available Mamba cache blocks` hatası görülürse `--max-num-seqs` azaltılmalı veya bellek sınırları uygunsa `--gpu-memory-utilization` artırılmalıdır.

### 5.3. L1 kapasitesi ve tahliye politikası

L1 kapasitesi belirlenirken yalnızca LMCache'in değil, işletim sisteminin, vLLM'in ve diğer süreçlerin bellek ihtiyacı da hesaba katılmalıdır.

L1 kapasitesini artırmak, tekrar kullanılan kayıtların CPU belleğinde kalma olasılığını yükseltebilir ve L2'ye erişim ihtiyacını azaltabilir. Ancak sistemin kullanılabilir belleğini aşacak bir kapasite belirlenmemelidir.

| Ayar | Açıklama ve öneri |
| --- | --- |
| `--l1-size-gb` | İşletim sistemi ve vLLM için yeterli bellek bırakıldıktan sonra belirlenmelidir. |
| `--l1-init-size-gb` | Başlangıçta ayrılacak L1 belleğini belirler. Gerçek bellek tüketimi, kapasiteyle birlikte doğrulanmalıdır. |
| `--eviction-policy LRU` | En uzun süredir kullanılmayan kayıtları öncelikli olarak tahliye eder. |
| `--eviction-trigger-watermark 0.8` | L1 kullanımı belirlenen eşiğe ulaştığında tahliyeyi tetikler. Belgelenmiş varsayılan değer `0.8`'dir. |
| `--eviction-ratio 0.2` | Her tahliye çevriminde boşaltılacak bellek oranını belirler. Belgelenmiş varsayılan değer `0.2`'dir. |
| `--max-workers` | Temel işçi havuzlarının iş parçacığı sayısını belirler; varsayılan değer `1`'dir. |
| `--max-gpu-workers` | GPU ile ilişkili işçi havuzunu ayarlar. Birden fazla vLLM örneğinin aynı LMCache sunucusunu kullandığı durumlarda iş yüküne göre değerlendirilmelidir. |
| `--max-cpu-workers` | Arama ve diğer CPU ağırlıklı işlemler için işçi havuzunu ayarlar. |

Tahliye eşiği ile tahliye oranı farklı işlevlere sahiptir: eşik, tahliyenin ne zaman başlayacağını; oran ise her tahliye çevriminde ne kadar alanın boşaltılacağını belirler.

Sık tahliye yaşanıyorsa öncelikle L1 kapasitesi, önbellek isabet oranı ve bellek kullanım eğilimleri incelenmelidir. Gerektiğinde eşik veya tahliye oranı değiştirilebilir. Ancak bu değişiklikler önbellekte tutulan kayıtları ve L2'ye başvurma sıklığını etkileyebileceğinden üretim ortamında ölçülerek belirlenmelidir.

Bu deneyde kullanılan `0.99` oranı, önbellek taşmasını belirginleştirmek için seçilmiştir. Üretim için önerilen varsayılan değer olarak değerlendirilmemelidir.

### 5.4. Veri aktarım modu ve izleme

LMCache MP, KV verilerinin aktarımı için farklı yöntemler sunar:

- **`lmcache_driven`:** STORE/RETRIEVE aktarımını LMCache sunucusu yönetir. CUDA IPC ve paylaşımlı CPU belleği kullanımını destekler; MP kurulumunda varsayılan seçenektir.
- **`engine_driven`:** PREPARE/COMMIT temelli aktarım yolunu kullanır. CPU veya CUDA dışı hızlandırıcı senaryolarında kullanılabilir.
- **`auto`:** Her iki aktarım yolunu da yükler. Farklı cihaz türlerinden işçilerin bağlanabildiği kurulumlarda kullanılabilir.

Aktarım modu, donanım ve bağlayıcı gereksinimlerine göre seçilmelidir. Bu deneyde `lmcache_driven` kullanılmıştır.

#### Sağlık kontrolü ve metrikler

LMCache sunucusu başladıktan sonra aşağıdaki kontroller yapılmalıdır:

1. `/healthcheck` uç noktasının sağlıklı yanıt verdiğini doğrulayın.
2. vLLM'in LMCache sunucusuna başarıyla bağlandığını kontrol edin.
3. Başlangıç kayıtlarında chunk boyutunun nasıl belirlendiğini ve önbellek kayıt işlemlerini inceleyin.
4. Prometheus metriklerini kullanarak kayıt, geri yükleme, isabet oranı ve bellek kullanımını izleyin.
5. İlk kurulum ve hata ayıklama sırasında `LMCACHE_LOG_LEVEL=DEBUG` kullanın. Sistem kararlı çalışmaya başladıktan sonra üretim ortamında `INFO` seviyesine dönün.

MP sunucusunun Prometheus metrikleri varsayılan olarak `9090` portunda sunulur. Ancak bu portun erişilebilir olması, bütün metriklerin doğru toplandığını tek başına kanıtlamaz. İzleme sisteminin erişimi ve ölçümlerin kapsamı da doğrulanmalıdır.

### 5.5. KV kayıtlarının yaşam döngüsü ve disk yönetimi

KV kayıtlarının diskte bulunması, bu kayıtların süresiz olarak geçerli veya kullanılabilir olacağını garanti etmez. Kullanılan depolama adaptörünün kayıt silme, tahliye ve disk alanını geri kazanma davranışı ayrıca incelenmelidir.

Bu deneyde kullanılan `fs` yapılandırmasında eski kayıtların birikebildiği gözlenmiştir. Bu nedenle üretim ortamında şu kontroller yapılmalıdır:

- Disk kullanımı ve boş alan düzenli olarak izlenmelidir.
- KV kayıtlarının hangi koşullarda geçersiz hâle geldiği belirlenmelidir.
- Kullanılan adaptörün desteklediği silme ve alan geri kazanma mekanizmaları doğrulanmalıdır.
- Servis yeniden başlatıldıktan sonra eski kayıtların bulunabildiği ve başarıyla geri yüklenebildiği test edilmelidir.
- Farklı model, blok boyutu veya uyumsuz attention backend yapılandırmalarının aynı kayıtları kullanması önlenmelidir.

**Kaydın diskte bulunması, önbellek isabeti (cache-hit) gerçekleştiğini göstermez.** Kaydın istekle eşleşmesi, ilgili yapılandırmayla uyumlu olması ve başarıyla geri yüklenmesi gerekir.

### 5.6. Kabul testi: KV verilerinin kaydedilmesi ve geri yüklenmesi

Üretime geçmeden önce yalnızca TTFT ölçmek yeterli değildir. Önbelleğin gerçekten kayıt oluşturduğunu ve bu kayıtları sonraki isteklerde kullandığını gösteren bir kabul testi de yapılmalıdır.

Önerilen test adımları şöyledir:

1. Sabit bir model, tokenizer, attention backend ve blok yapılandırmasıyla vLLM ve LMCache'i başlatın.
2. Sabitlenmiş bir istek kümesiyle ilk çalıştırma yapın.
3. LMCache kayıtlarının oluşturulduğunu günlüklerden ve metriklerden doğrulayın.
4. Kullanılan vLLM sürümünün desteklediği yöntemle vLLM'in yerel ön-ek önbelleğini temizleyin. Dış LMCache kayıtlarının korunup korunmadığını ayrıca kontrol edin. Amaç, LMCache kayıtlarını koruyarak geri yüklemeyi sınamaktır.
5. Aynı istekleri yeniden gönderin ve LMCache geri yükleme işlemlerinin gerçekleştiğini doğrulayın.
6. TTFT'yi ve mümkünse önbellek isabet oranını kaydedin.
7. Testi soğuk önbellek, sıcak önbellek ve servis yeniden başlatma koşullarında tekrarlayın.

#### Doğruluk kontrolü

Hibrit GDN modellerinde önbellekten geri yüklenen üretimin soğuk üretimle her token bakımından birebir aynı olacağı varsayılmamalıdır.

İlgili LMCache reçetesinde bu modeller için bit düzeyinde eşitlik yerine skor düzeyinde eşdeğerlik esas alınmaktadır. Bu nedenle doğruluk değerlendirmesi, kullanılan modele uygun bir test kümesi ve önceden belirlenmiş toleranslarla yapılmalıdır.

`POST /reset_prefix_cache` gibi bir API kullanılacaksa ilgili vLLM sürümünde bu uç noktanın etkin olduğu ve çağrının yalnızca amaçlanan yerel önbelleği etkilediği doğrulanmalıdır. Sürüm ve yapılandırma kontrol edilmeden bu çağrının dış LMCache kayıtlarını kesin olarak koruduğu varsayılmamalıdır.

### 5.7. Destek durumu ve sınırlamalar

| Konu | Değerlendirme |
| --- | --- |
| Bit düzeyinde eşitlik | Hibrit GDN modellerinde garanti edilmez. Skor düzeyinde doğruluk değerlendirmesi yapılmalıdır. |
| KV verilerinin taşınabilirliği | Kayıtlar attention backend ve kernel blok boyutu gibi ayarlara bağlıdır. Farklı yapılandımlar arasında paylaşım, doğrulanmadan yapılmamalıdır. |
| CacheGen ve CacheBlend | İlgili hibrit model reçetesinde desteklenmedikleri belirtilmektedir. Bayt düzeyindeki opak kayıtlar, içerik tabanlı işlemler için uygun olmayabilir. |
| `align` modunda Mamba ön-ek önbelleği | İlgili resmî reçetede deneysel olarak işaretlenmiştir. |
| Görüntü ve video KV verileri | Metin üretimi için doğrulanmış davranış, görüntü ve video önbelleğinin de doğrulandığı anlamına gelmez. |
| SGLang ile kullanım | İlgili Qwen hibrit model reçetesinde doğrulanmış bir LMCache entegrasyonu olarak sunulmamaktadır. |

Bu sınırlamalar, LMCache'in genel olarak çalışmadığı anlamına gelmez. Hangi özelliklerin hangi model ve entegrasyonla doğrulandığını gösterir. Üretim kararları bu destek kapsamı dikkate alınarak verilmelidir.

---

## 6. Deneyin sınırları ve sonuçların genellenebilirliği

- Ana performans ölçümü, her biri 8,000 token uzunluğunda sentetik isteklerle gerçekleştirilmiştir. Sonuçlar, gerçek sohbet ve kod içeriklerinin bütün özelliklerini temsil etmez.
- Test üç tekrarla, tek model ve tek donanım yapılandırmasıyla sınırlıdır. Elde edilen hızlanma oranı, farklı modellere, eşzamanlılık seviyelerine veya önbellek ayarlarına göre değişebilir.
- `--eviction-ratio 0.99`, önbellek taşmasını belirginleştirmek için kullanılan deney ayarıdır. Üretimde varsayılan `0.20` kullanıldığında önbellek davranışı farklı olabilir.
- Disk kayıtlarının korunması ve servis yeniden başlatmasından sonra sağladığı katkı, depolama adaptörüne ve kayıtların geçerliliğine bağlıdır.
- Bu rapor temel olarak TTFT'yi ölçmektedir. Üretim kararı verilmeden önce çıktı doğruluğu, uzun süreli kararlılık, bellek tüketimi ve disk alanı yönetimi de ayrıca doğrulanmalıdır.
- Birden fazla vLLM örneğinin ortak LMCache sunucusunu kullanmasıyla elde edilebilecek kazanç bu deneyde ölçülmemiştir. Bu kullanım senaryosu için ayrı bir çoklu örnek testi gereklidir.

---

## 7. Kaynaklar

1. LMCache — [Deployment Guide](https://docs.lmcache.ai/mp/deployment.html)
2. LMCache — [Configuration Reference](https://docs.lmcache.ai/mp/configuration.html)
3. LMCache — [Qwen3.5 / Qwen3.6 / Qwen3.8 model reçetesi](https://docs.lmcache.ai/recipes/qwen3_5.html)
4. LMCache — [Quick Start](https://docs.lmcache.ai/mp/quickstart.html)

Resmî belgeler Ekim 2026 itibarıyla incelenmiştir. LMCache MP ve hibrit model desteği sürümler arasında değişebileceğinden, deney yeniden üretileceğinde kullanılan sürüm ve yapılandırmayla uyumluluk yeniden kontrol edilmelidir.

---

{% include company/block.html name="cta_logo" %}

**LLM altyapınızı birlikte planlayalım.** KV cache katmanlarını ve tahliyeyi hesaba katan donanım boyutlandırması ve önbellek mimarisi için {% include company/block.html name="contact_cta" %}