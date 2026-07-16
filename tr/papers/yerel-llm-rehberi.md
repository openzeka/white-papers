---
title: Yerel LLM Kullanım Rehberi
parent: White Papers
nav_order: 2
lang: tr
page_id: yerel-llm-rehberi
description: >-
  Yerel (local) LLM kullanımı için uçtan uca karar rehberi: donanım (NVIDIA Jetson,
  RTX PRO, DGX Spark, DGX/HGX), model seçimi, yazılım stack ve senaryo eşlemesi.
permalink: /papers/yerel-llm-rehberi/
last_modified_date: 2026-07-03
toc: true
---

> **Yayın tarihi:** Haziran 2026
> **Kapsam:** Yerel LLM'in neden ve kimler için gerekli olduğundan başlayıp, donanım → model → yazılım seçimine kadar uçtan uca bir karar rehberi.
> **Not:** Bu alan kısa sürede çok ciddi değişikler oluyor. Aşağıdaki ürün isimleri, fiyatlar ve benchmark sonuçları Haziran 2026 itibarıyla geçerlidir; kalıcı olan isimler değil, kategoriler ve karar mantığıdır. Donanım tarafında bilinçli olarak yalnızca NVIDIA ele alınmıştır — temel sebebi CUDA ekosistemidir (bkz. Bölüm 4.1).

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## Yönetici Özeti

- **Yerel LLM**, modeli kendi donanımınızda çalıştırmaktır: veri cihazdan çıkmaz, internet şart değildir, kullanım başına ücret yoktur. En güçlü gerekçe **veri gizliliği ve egemenliğidir** (kamu, sağlık, hukuk, finans, savunma).
- **Tek katı kısıt VRAM'dir.** Gerçek ihtiyaç = model ağırlıkları + KV cache + activation + ~%20 pay; model boyutu ve bağlam uzunluğu donanım sınıfını belirler (bkz. 4.3).
- **Donanım (yalnızca NVIDIA — sebep CUDA):** uçta **Jetson** → iş istasyonunda **RTX PRO Blackwell (16–96 GB)** → veri merkezinde **L40S / H100·H200 NVL** → büyük ölçekte **DGX Spark / B200·B300**. İlk soru: **eğitim mi, inference mı?**
- **Model:** çoğu iş için **7–14B yoğun** veya **~30B MoE** optimum dengedir; ticari kullanımda **Apache 2.0 / MIT** lisanslı aileler (Qwen, DeepSeek, GLM) en güvenli temeldir. Önce **ne yapacağınızı** (5.1) ve **seçim kıstaslarını** (5.2) belirleyin.
- **Yazılım:** kolay başlangıç **Ollama / LM Studio**; üretim **vLLM / TensorRT-LLM**; ajan+hafıza için **AI workspace'ler**; çok kullanıcı için önde **gateway** (LiteLLM vb.).
- **Karar yöntemi:** küçük başlayın, **kendi değerlendirme setinizde** ölçün (5.9), ihtiyaç netleştikçe ölçekleyin. Maliyette **TCO**'yu unutmayın (GPU bedeli toplamın yalnızca %30–40'ı).

---

## 1. Giriş

**LLM (Large Language Model / Büyük Dil Modeli)**, çok büyük metin verisiyle eğitilmiş, doğal dili anlayıp üretebilen yapay zekâ modelidir. Çoğumuz bunları bulut üzerinden kullanıyoruz: ChatGPT, Claude, Gemini gibi servisler modeli kendi sunucularında çalıştırır, biz internet üzerinden erişiriz.

**Yerel LLM** ise modeli kendi donanımınızda — dizüstü bilgisayar, masaüstü iş istasyonu veya şirket sunucusu — çalıştırmak demektir. Veri cihazdan dışarı çıkmaz, internet bağlantısı şart değildir, kullanım başına ücret yoktur.

İki yaklaşım arasındaki temel fark şudur:

| | Bulut LLM | Yerel LLM |
|---|---|---|
| Veri nerede işlenir | Sağlayıcının sunucusunda | Sizin donanımınızda |
| Maliyet modeli | Kullanım/abonelik (sürekli) | Donanım (tek seferlik) + elektrik |
| İnternet | Gerekli | Gerekmez |
| Gizlilik | Sağlayıcıya güven | Tam kontrol |
| Model erişimi | Sağlayıcının sunduğuyla sınırlı | Yüzlerce açık model arasından özgürce seçim |
| Özelleştirme | Sınırlı | Tam (fine-tuning, RAG, kendi verisi) |

Bu rehberin amacı, "yerel LLM bana/kurumuma uygun mu, uygunsa hangi donanım–model–yazılım üçlüsünü seçmeliyim?" sorusuna güncel ve uygulanabilir bir yanıt vermektir.

#### OpenZeka hakkında

![OpenZeka]({{ '/papers/yerel-llm-rehberi/images/openzeka-logo.png' | relative_url }})

**OpenZeka Teknoloji A.Ş.**, 2016 yılında Ankara Bilkent Cyberpark'ta kuruldu ve donanım–yazılım alanında yenilikçi yapay zekâ çözümleri sunuyor. **NVIDIA Robotics Türkiye ve MEA (MENA) Resmi Distribütörü**; aynı zamanda **NVIDIA DGX AI Compute Systems** ve **NVIDIA Omniverse Partner'ı**, NVIDIA Visualization alanında **Elite Partner**'dır.

- **Donanım:** DGX/HGX sunucu çözümleri, profesyonel ekran kartları ve iş istasyonları, NVIDIA Jetson gömülü sistemleri (geliştirici kitleri, hazır AI kitleri, modüller ve taşıyıcı kartlar). İşlem, depolama, ağ ve orkestrasyonu kapsayan tam yedekli yapay zekâ altyapıları tasarlayıp devreye alıyoruz.
- **Yazılım:** Kendi geliştirdiğimiz **Cordatus AI** platformuyla akıllı video analitiği başta olmak üzere sektöre özel çözümler üretiyoruz.
- **Dijital dönüşüm:** NVIDIA Omniverse ve Dijital İkiz teknolojileriyle dijital dönüşüme öncülük ediyor; NVIDIA GTC, Embedded World, Smart City Expo gibi etkinliklerde, üniversite iş birlikleri ve AI Workshop'larıyla bilgi birikimimizi paylaşıyoruz.

Bu rehberdeki donanım önerileri bu portföye dayanır.

---

## 2. Neden Yerel LLM? (Gerekçeler)

<p><img src="{{ '/papers/yerel-llm-rehberi/images/sema-2-avantajlar.png' | relative_url }}" alt="Yerel LLM'in başlıca avantajları" width="320"/></p>
<sub><i>Şekil: Yerel LLM'in başlıca avantajları</i></sub>

### Avantajlar

**Veri gizliliği ve güvenlik.** En güçlü gerekçe budur. Hukuk, sağlık, finans, savunma gibi alanlarda veriler cihazdan hiç çıkmaz; KVKK ve GDPR uyumu büyük ölçüde kolaylaşır. Hassas müşteri verisi, sözleşmeler veya hasta kayıtları üçüncü bir tarafın sunucusuna gönderilmez.

**Veri egemenliği — kamu ve devlet kurumları.** Devlet kuruluşları, kritik altyapı ve kamu kurumları için en belirleyici gerekçelerden biri budur: yerel LLM ile kurumsal/gizli bilgiler hiçbir koşulda yurt dışındaki veya üçüncü taraf sunuculara sızmaz. Veri tamamen kurumun kendi sınırları içinde, kendi donanımında işlenir; bu da veri egemenliği ve ulusal güvenlik gereksinimlerini doğrudan karşılar. Ağdan tamamen yalıtılmış (izole / air-gapped) ve gizli ağlarda dahi çalışabilmesi bu kurumlar için kritik bir avantajdır.

**Maliyet.** Yoğun ve sürekli kullanımda, tek seferlik donanım yatırımı zamanla işletme giderlerinin altına iner; çok sayıda çağrı yapan ekiplerde yerel kurulumda marjinal maliyet neredeyse yalnızca elektriktir.

**Çevrimdışı çalışabilme.** İnternet olmayan ortamlarda (saha, güvenli ağlar, ağdan yalıtılmış/izole/air-gapped sistemler) çalışır.

**Özelleştirme.** Kendi verinizle fine-tuning yapabilir, RAG ile kendi belgelerinize bağlayabilir, sistem davranışını tam kontrol edebilirsiniz. Açık ağırlıklı modellerde kapalı servislerin koyduğu kısıtlar yoktur.

**Öngörülebilir gecikme (latency).** Hız sizin donanımınıza bağlıdır; sağlayıcının yoğunluğuna, kota kısıtına veya servis kesintisine tabi değilsiniz.

### Dikkat edilmesi gerekenler

- **Doğru donanım eşleştirmesi.** Hedeflediğiniz model boyutu doğru VRAM/donanım sınıfını gerektirir; en zorlu görevler ve en büyük modeller için daha yüksek bellekli kartlar veya çoklu-GPU planlanmalıdır (bkz. Bölüm 4).
- **Ön yatırım.** Donanım tek seferlik bir yatırımdır; doğru ölçeklendiğinde uzun vadede kendini amorti eder.
- **Teknik bilgi.** Kurulum, kuantizasyon seçimi, sürücü/CUDA yönetimi bir öğrenme eğrisi gerektirir. (Yeni nesil araçlar bunu büyük ölçüde kolaylaştırdı.)
- **Bakım yükü.** Güncellemeler, model değişimleri ve donanım bakımı kurumun sorumluluğundadır.

**Özet:** Gizlilik ve veri egemenliği kaygısı, yoğun kullanım veya özelleştirme ihtiyacı olan her durumda yerel LLM güçlü ve sürdürülebilir bir tercihtir. Doğru donanım–model–yazılım eşleştirmesiyle ölçek, ihtiyaca göre küçükten büyüğe ayarlanabilir.

---

## 3. Kimler İçin Gerekli? (Hedef Kitleler ve Senaryolar)

<p><img src="{{ '/papers/yerel-llm-rehberi/images/sema-3-hedef-kitle.png' | relative_url }}" alt="Yerel LLM kimler için gerekli?" width="760"/></p>
<sub><i>Şekil: Yerel LLM kimler için gerekli?</i></sub>

**Kamu ve devlet kurumları.** Bakanlıklar, kamu kurumları, kritik altyapı ve savunma — verinin yurt içinde, kurumun kendi sınırları içinde kalması ve dışarı sızmaması bir veri egemenliği ve ulusal güvenlik gereğidir. Bu kurumlar için yerel LLM çoğu zaman tek uygun seçenektir.

**Kurumsal (hassas veri).** Hukuk büroları, hastaneler/sağlık kuruluşları, finans, savunma sanayii — verinin dışarı çıkmaması yasal/sözleşmesel bir zorunluluk olduğunda yerel LLM neredeyse tek seçenektir.

**Geliştiriciler.** API maliyeti olmadan sınırsız prototipleme; kod asistanı olarak IDE entegrasyonu; çok sayıda otomatik test/çağrı içeren iş akışları.

**Araştırmacılar ve akademisyenler.** Model davranışını inceleme, deney yapma, fine-tuning çalışmaları, üzerinde tam kontrol gerektiren bilimsel çalışmalar.

**KOBİ'ler.** Müşteri verisini dışarı çıkarmadan müşteri hizmetleri, belge işleme ve iç otomasyon kurmak isteyen küçük/orta ölçekli işletmeler.

**Bireysel/gizlilik odaklı kullanıcılar.** Kişisel asistan, not/e-posta yönetimi, hobi amaçlı kullanım; verisini hiçbir şirkete vermek istemeyenler.

**Ölçeği küçük tutmak yeterli olanlar:** Yalnızca ara sıra ve hafif kullanım yapanlar için giriş seviyesi bir kart veya mevcut bir iş istasyonu çoğu zaman yeterlidir; ihtiyaç büyüdükçe donanım kademeli olarak ölçeklenebilir (bkz. Bölüm 4).

---

## 4. Donanım Seçimi (NVIDIA)

### 4.1. Neden NVIDIA? Tek kelimeyle: CUDA

Yerel LLM donanımında NVIDIA tercihinin ana sebebi **CUDA**'dır. CUDA, NVIDIA'nın GPU'lar üzerinde paralel hesaplama için sunduğu yazılım platformudur ve yapay zekâ dünyasının fiilî standardı hâline gelmiştir. Bunun pratik sonuçları şunlardır:

- **Ekosistem uyumu.** PyTorch, TensorFlow, vLLM, TensorRT-LLM, llama.cpp, Ollama gibi neredeyse tüm LLM araç ve kütüphaneleri öncelikle CUDA üzerinde geliştirilir ve en iyi şekilde NVIDIA donanımında çalışır. Yeni çıkan modeller, kuantizasyon formatları ve optimizasyonlar ilk olarak CUDA için yayımlanır.
- **Olgunluk ve yaygınlık.** CUDA on yılı aşkın süredir geliştiriliyor; geniş dokümantasyon, topluluk desteği ve hazır çözüm bolluğu sağlar. Bir sorunla karşılaştığınızda büyük olasılıkla çözümü hazırdır.
- **Sorunsuz kurulum.** "Kutudan çıkar çalışır" deneyimi; sürücü, kütüphane ve araç zinciri uyumsuzluğu riski en aza iner.

Bu nedenle bu rehber boyunca donanım tarafında yalnızca NVIDIA ele alınmıştır; alternatif platformlar bu olgunluk ve ekosistem genişliğine henüz ulaşmamıştır. Klasik IT'de CPU + RAM + depolama çoğu zaman yeterliyken, LLM'de **GPU seçimi doğrudan modelin çalışabilirliğini belirler**: VRAM çalıştırılabilecek model boyutunu, bellek bant genişliği token üretme hızını, FLOPS ise eğitim/çıkarım hızını belirler. Yanlış GPU = model ya hiç çalışmaz ya da çok yavaş çalışır.

### 4.2. İlk karar: Eğitim mi, Inference (çıkarım) mı?

Donanım ihtiyacını belirleyen **en önemli soru** budur. "Eğitim yapılacak mı?" sorusunun cevabı, ihtiyaç duyacağınız donanımın ölçeğini baştan belirler.

<p><img src="{{ '/papers/yerel-llm-rehberi/images/sema-4-egitim-inference.png' | relative_url }}" alt="İlk karar: eğitim mi, inference mı?" width="640"/></p>
<sub><i>Şekil: İlk karar: eğitim mi, inference mı?</i></sub>

**Çoğu kurum için başlangıç noktası inference'tır** — hazır bir açık modeli kendi sunucunuzda çalıştırmak. Eğitim/özelleştirme yalnızca modeli kendi verinizle uyarlamak gerektiğinde devreye girer ve dört kademesi vardır:

| | Pre-training (sıfırdan) | Full Fine-tune | Fine-tune (LoRA) | Fine-tune (QLoRA) | Inference |
|---|---|---|---|---|---|
| VRAM ihtiyacı | Çok yüksek (~16× param) | Yüksek (~12–14× param) | Orta (~2–3× param) | Düşük (~0,6–1× param) | Model + KV cache |
| 7B model | 8× B200 (1 takım) | 1× H200 (~85–100 GB) | 1× L40S / RTX PRO 6000 | 1× L40S | 1× L40S / RTX PRO 6000 |
| 70B model | 8–16× B300 (1–2 takım) | 4–8× H200 (ZeRO-3) | 2–4× H200 | 1× DGX Spark / 1× H200 | 1× H200 (INT8) / 1× DGX Spark (INT8) — FP16 için 2× H200 (bkz. 4.8) |
| Süre | Haftalar–aylar | Günler–1 hafta | Saatler | Saatler | — |
| Veri ihtiyacı | Trilyonlarca token | Milyonlarca örnek | Binlerce örnek | Binlerce örnek | — |
| Maliyet | Çok yüksek | Yüksek | Orta | Düşük | Orta |

- **Pre-training (sıfırdan ön eğitim):** En ağır senaryo; yalnızca kendi temel modelini eğiten kurumlar içindir. B200/B300 cluster gerektirir. **Not:** Tablodaki "8×/16×" rakamları gerçek hesaplama ihtiyacı değil, **B200/B300'ün minimum satış birimidir** (8'li takım — bkz. 4.5/D). Gerçek VRAM ihtiyacı kabaca model boyutunun ~16 katıdır (FP16 ağırlık + gradyan + Adam optimizatör durumları): **7B tam eğitim ≈ 120–150 GB**, **70B ≈ 1 TB+** (üstüne activation). Yani 7B tam eğitim tek bir 8'li takımın çok altında bellek ister; takımın tamamı kullanılmasa da en küçük satış birimi budur.
- **Full Fine-tune:** Ön-eğitilmiş bir modelin **tüm parametrelerini** kendi verinizle günceller. VRAM ihtiyacı pre-training'e yakın (~12–14× param — gradient checkpointing ve tipik olarak daha kısa bağlam sayesinde pre-training'den biraz daha düşük), ancak **süre ve veri çok daha azdır**. Derin alan adaptasyonu (Türkçe, tıp, hukuk gibi özel alanlar) için uygundur; LoRA'nın yetersiz kaldığı durumlarda devreye girer. **Risk — catastrophic forgetting (felaketsel unutma):** Tüm parametreleri güncellemek, pre-training sırasında öğrenilen genel yetenekleri (diğer diller, genel bilgi, muhakeme) bozabilir veya üzerine yazabilir. **LoRA/QLoRA bu riski büyük ölçüde önler** — temel model ağırlıkları donmuş (frozen) tutulur, yalnızca küçük adapter katmanları eğitilir; dolayısıyla genel yetenekler korunarak alan uyarlama eklenir. Pratikte çoğu kurum LoRA/QLoRA ile başlamalıdır. Full fine-tune tercih edildiğinde riski azaltmak için: düşük öğrenme oranı, **veri karıştırma** (alan verisi + genel veri birlikte), **regularization** (KL/L2) ve epoch sayısını sınırlama uygulanmalıdır. (Açık kaynak araçlar: bkz. 6.F.)
- **LoRA / QLoRA fine-tune:** Mevcut bir modeli kendi verinizle uyarlamanın pratik yolu. Tüm modeli değil, küçük ek katmanları eğitir. **Bellek muhasebesi:** LoRA'da temel ağırlıklar donmuş (frozen) olduğundan yalnızca FP16 ağırlıklar (~2× param) + gradyan checkpointing'li activation + küçük adapter gradyan/Adam durumları yük bindirir → **~2–3× param**; QLoRA'da temel ağırlıklar 4-bit NF4'e kuantize edilir (~0,5× param), üstüne activation ve küçük adapter yükü eklenir → **~0,6–1× param**. 70B bir modeli tek bir **DGX Spark** ile fine-tune etmek dahi mümkündür (QLoRA ile — FP16 tabanlı LoRA'da 70B ağırlıkları tek başına ~140 GB olduğundan 128 GB'a sığmaz). (Açık kaynak araçlar: bkz. 6.F.)
- **Inference:** Modeli sadece çalıştırmak. Burada **KV cache için ayrılan ek VRAM kritiktir** (bkz. 4.3); eş zamanlı kullanıcı sayısı arttıkça bu yük büyür.

### 4.3. Belirleyici ölçüt: VRAM (ve toplam bellek hesabı)

Yerel LLM'de tek katı kısıt VRAM'dir (ekran kartı belleği). Model ağırlıkları + KV cache GPU belleğine sığmazsa, ya sistem RAM'ine taşar (~10x yavaşlama) ya da model hiç çalışmaz.

**Kabaca kural (yalnızca ağırlıklar):**
- **FP16 (16-bit):** ~2 GB VRAM / milyar parametre
- **8-bit (Q8):** bunun yarısı (~1 GB / milyar)
- **4-bit (Q4, ör. Q4_K_M):** çeyreği (~0,5 GB / milyar). Q4_K_M, tam hassasiyetin ~%92–95'ini koruyup belleği ~4x düşürdüğü için kalite/bellek açısından optimum denge kabul edilir.

**Model boyutuna göre yaklaşık VRAM (ağırlıklar; üstüne KV cache + pay ekleyin):**

| Model | FP16 | 8-bit | 4-bit (Q4_K_M) |
|---|---|---|---|
| 7B / 8B | ~14–16 GB | ~8 GB | ~5 GB |
| 14B | ~28 GB | ~15 GB | ~9–10 GB |
| 32B | ~64 GB | ~34 GB | ~18–20 GB |
| 70B | ~140 GB | ~70 GB | ~38–48 GB |

**KV cache / bağlam uzunluğu etkisi (çoğu zaman atlanır).** KV cache bağlam uzunluğu ve eşzamanlı istek sayısıyla doğrusal büyür; uzun bağlamlarda model ağırlıklarından bile büyük olabilir. Örnek: Llama 3.1 70B tek istek, 128K bağlamda tek başına ~40 GB KV cache tüketebilir — üstelik bu değer, modelin kullandığı **GQA (Grouped-Query Attention)** ile hesaplanmış hâlidir; GQA'sız klasik (MHA) bir mimaride aynı senaryo ~8× fazlasını isterdi. Hafifletme: **KV cache'i FP8/INT8'e kuantize etmek** belleği kabaca yarıya indirir.

**Toplam VRAM hesabı.** Gerçek ihtiyaç yalnızca ağırlıklar değildir:

> **Toplam VRAM = Model Ağırlıkları + KV Cache + Activation + Overhead**

| Bileşen | Hesaplama | Örnek |
|---|---|---|
| Model ağırlıkları | parametre × byte/param | 7B FP16 = 14 GB · 70B FP16 = 140 GB |
| Maks. bağlam (max_len) | KV cache boyutunu doğrudan belirler | 4K → 128K token = ~32× KV cache farkı |
| KV cache | 2 × layers × kv_heads × head_dim × max_len × batch × 2 byte | 70B (GQA, 8 KV head), 4096 token, batch 32 ≈ 20–40 GB |
| Activation | batch × max_len × hidden_dim × layers | Eğitimde büyük, inference'da küçük |
| Overhead | ~%10–20 ek | Fragmentation, geçici tamponlar |

> **Formül notu:** GQA'lı modellerde `kv_heads`, toplam attention head sayısının küçük bir kesridir (ör. Llama 3.1 70B: 64 head → 8 KV head); tablodaki 20–40 GB örneği bu yüzden düşüktür. GQA kullanmayan klasik (MHA) mimaride `kv_heads = head sayısı` olur ve aynı senaryo ~8× fazla bellek ister.

> **Kural:** Her zaman **~%20 ek VRAM payı** bırakın. Hesabı kolaylaştırmak için OpenZeka'nın ücretsiz aracını kullanabilirsiniz: **Cordatus VRAM Calculator** — <https://app.cordatus.ai/#/vram-calculator>

### 4.4. Çıkarım nasıl çalışır ve hizmet kalitesi metrikleri

**İki aşamalı çıkarım — neden iki ayrı darboğaz var?** Bir LLM isteği iki aşamada işlenir:

- **Prefill (prompt işleme):** Girdi promptundaki **tüm tokenlar aynı anda (paralel)** işlenir; ağır matris çarpımları baskındır → **compute-bound (FLOPS'a bağlı)**. **TTFT**'yi bu aşama belirler — uzun prompt = uzun TTFT.
- **Decode (token üretimi):** Yanıt **token token, sıralı** üretilir; her token bir öncekine bağlı olduğundan (**otoregresif**) tek bir istek içinde **paralelleştirilemez**. Her adımda tüm model ağırlıkları bellekten yeniden okunur ama hesap görece azdır → **memory-bound (bellek bant genişliğine bağlı)**. **TPS**'i bu aşama belirler. Üretim, **EOS (bitiş) tokenı** gelene ya da **azami token sınırına** ulaşılana kadar sürer.

> Bu yüzden iki farklı donanım niteliği önemlidir: prefill/TTFT için **FLOPS**, decode/TPS için **bellek bant genişliği**. Tek istekte decode paralelleşmese de, **batch'leme** ağırlık okumalarını birçok istek arasında paylaştırarak toplam verimi (throughput) artırır.

Donanım seçimi yalnızca "model sığıyor mu" değil, "hangi kullanıcı deneyimini hedefliyoruz" sorusuyla da şekillenir. Dört temel metrik:

- **TTFT (Time to First Token):** Kullanıcı promptu gönderdikten sonra ilk token ne kadar sürede gelir? **Compute-bound** — FLOPS'a bağlıdır.
- **TPS (Token Per Second):** Saniyede kaç token üretilir? Kullanıcı deneyimini doğrudan etkiler. **Memory-bound** — bellek bant genişliğine bağlıdır.
- **Throughput:** Birim zamanda kaç istek işlenir? Batch büyüdükçe artar.
- **Batch size — temel ödünleşim:** Yüksek batch → yüksek throughput ama yüksek gecikme; düşük batch → düşük gecikme ama düşük throughput. Optimal noktayı bulmak kritiktir.

> Pratik sonuç: **hızlı tekil yanıt** istiyorsanız yüksek bant genişliği (TPS) ve FLOPS (TTFT) önemlidir; **çok kullanıcılı yüksek verim** istiyorsanız batch'i ve dolayısıyla VRAM'i (KV cache) ölçeklemek gerekir.

**Sistemi hızlandıran teknikler (2026).** Bu iki aşamayı hızlandırmak için yazılım katmanında çeşitli yöntemler var; çoğu **vLLM / SGLang / TensorRT-LLM** tarafından desteklenir ve genelde **modeli değiştirmeden** devreye girer:

- **Spekülatif çözümleme (speculative decoding):** Küçük bir "taslak" modelin önerdiği birden çok tokenı büyük model tek geçişte doğrular → decode'da **2–3× hız**. Güncel en güçlü yaklaşım, ayrı taslak model gerektirmeyen **EAGLE-3 / EAGLE 3.1** (modelin iç katmanlarına bağlı hafif tahmin başlığı) ve paralel varyantı **P-EAGLE**'dır.
- **MTP (Multi-Token Prediction):** Modelin tek adımda birden çok token öngörmesi (ör. DeepSeek mimarisi); hem eğitimde hem spekülatif çözümlemede taslak olarak kullanılır.
- **Disaggregated prefill (prefill/decode ayrıştırması):** Compute-bound prefill ile memory-bound decode'u **ayrı GPU havuzlarına** dağıtır; her aşama kendi darboğazına göre ölçeklenir, gecikme ve verim birlikte iyileşir (ör. **NVIDIA Dynamo**).
- **Continuous / in-flight batching:** İstekleri batch'e dinamik ekleyip çıkararak GPU'yu boş bırakmaz → yüksek throughput.
- **Chunked prefill & prefix caching:** Uzun prefill'i parçalayıp decode ile örerek TTFT'yi düşürür; ortak önekler (sistem promptu) için KV cache yeniden kullanılır (PagedAttention / RadixAttention — bkz. 6.A).
- **KV cache kuantizasyonu (FP8/INT8):** Decode'un bellek yükünü düşürür (bkz. 4.3).

> Bu teknikler doğru çıkarım motoru ve yapılandırmayla, üretim kurulumunda **2–4× hız/verim** farkı yaratabilir — donanım kadar yazılım yapılandırması da önemlidir.

### 4.5. Donanım sınıfları (OpenZeka kataloğu)

Bu rehberdeki donanım önerilerini, **OpenZeka olarak sağladığımız** NVIDIA ürünleriyle sınırladık. Tüketici GeForce kartlarını (RTX 3090/4090/5090) sunmuyoruz; bunun yerine **profesyonel iş istasyonu (RTX PRO Blackwell), veri merkezi GPU'ları, DGX sistemleri ve Jetson uç (edge) modülleri** sağlıyoruz. Belirleyici ölçüt yine VRAM'dir; aşağıdaki sınıflar VRAM ve kullanım yerine göre düzenlenmiştir.

**Neden tüketici (oyuncu) GPU'larını önermiyoruz?** Bir RTX 4090/5090 hobi/bireysel düzeyde elbette LLM çalıştırır; ancak **kurumsal, üretim ve 7/24** kullanım için profesyonel/veri merkezi sınıfı şu somut nedenlerle gereklidir:

- **VRAM tavanı düşük.** En üst tüketici kart (RTX 5090) ~32 GB'da kalır; büyük modeller, uzun bağlam ve KV cache için yetersizdir. RTX PRO 6000 96 GB, H200 ise 141 GB sunar.
- **ECC bellek yok.** Tüketici kartlarında hata düzelten (ECC) bellek bulunmaz; uzun süreli/sürekli çalıştırmada sessiz bellek hataları riski vardır. Profesyonel ve veri merkezi kartları ECC'lidir.
- **Sürücü/lisans kısıtı.** NVIDIA'nın GeForce sürücü lisansı **veri merkezinde kullanımı kısıtlar**; kurumsal/DC dağıtımı resmen profesyonel veya veri merkezi kartlarını gerektirir.
- **Çoklu-GPU ölçeklenmesi sınırlı.** Yeni tüketici kartlarında NVLink kaldırılmıştır; yüksek hızlı kart-arası bağlantı ve sunucu yoğunluğu profesyonel/DC serisine özgüdür (bkz. 4.6).
- **Soğutma & form faktör.** Tüketici kartları sunucu hava akışına uygun değildir ve sürekli tam yük için tasarlanmamıştır; veri merkezi kartları pasif soğutmayla sunucu kasasına entegre çalışır (bkz. 4.9).
- **Garanti & sürdürülebilirlik.** Profesyonel kartlar kurumsal garanti, uzun ömür ve kararlı sürücü desteğiyle gelir; tüketici kartları üretim yükü için bu güvenceleri sunmaz.

> Özetle: tüketici kartları "çalışır" ama **güvenilir, ölçeklenebilir ve uyumlu** bir kurumsal yerel-LLM altyapısı için profesyonel/veri merkezi sınıfı doğru tercihtir. OpenZeka kataloğu da bu nedenle bu sınıflarla sınırlıdır.

> **Fiyat notu:** Bu ürünler genelde teklif/proje usulü sunulur ve fiyatlar değişkendir; bu rehberde kasıtlı olarak fiyat belirtmedik. Güncel fiyat ve stok için bizimle iletişime geçebilirsiniz. Aşağıdaki güç (W) değerleri NVIDIA referans TDP'leridir.

**A) Jetson — uç (edge) / gömülü / robotik yerel AI.** İnternet gerektirmeyen, sahada veya cihaz üstünde küçük/orta model çalıştırmak için. Birleşik bellek (CPU+GPU aynı havuz) kullanır.
- **Jetson Orin Nano (4 GB / 8 GB)** — giriş seviyesi; 1–4B sınıfı küçük modeller, görü/konuşma asistanları. Çok düşük güç.
- **Jetson AGX Orin (64 GB)** — uçta ciddi iş; birleşik 64 GB ile orta boy modeller ve çok kipli iş yükleri.
- **Jetson AGX Thor / T5000 (128 GB sınıfı, Blackwell nesli)** — yeni nesil fiziksel-AI/robotik amiral gemisi; uçta büyük model ve eş zamanlı yük. Uç tarafında "en yüksek bellek" seçeneği.

<p>
<img src="{{ '/papers/yerel-llm-rehberi/images/jetson-orin-nano.png' | relative_url }}" alt="NVIDIA Jetson Orin Nano AI Kiti" width="300"/>
<img src="{{ '/papers/yerel-llm-rehberi/images/jetson-agx-thor.png' | relative_url }}" alt="NVIDIA Jetson AGX Thor Developer Kit" width="300"/>
</p>
<sub><i>Jetson Orin Nano AI kiti ve Jetson AGX Thor Developer Kit (Görsel: OpenZeka)</i></sub>

**B) RTX PRO Blackwell — iş istasyonu / sunucu GPU'su (yerel LLM'in ana sınıfı).** ECC'li GDDR7, masaüstü iş istasyonuna veya sunucuya takılır. Tüketici kartlarının yerini bu seri alır.
- **RTX PRO 2000 Blackwell — 16 GB.** Giriş; rahat 7B–14B (Q4). Çok düşük güç (~70 W), küçük form faktör dostu.
- **RTX PRO 4000 Blackwell — 24 GB** (ve SFF/kompakt varyantı). Optimum giriş: 14B rahat, 32B Q4. ~140 W.
- **RTX PRO 4500 Blackwell — 32 GB.** 32B'yi rahat çalıştırır; 70B bu karta sığmaz (bkz. PRO 6000). ~200 W.
- **RTX PRO 5000 Blackwell — 48 GB.** 32B'yi uzun bağlamla rahat; 70B'yi Q4'te ancak kısa bağlamla, sınırda çalıştırır (70B Q4 ≈ 38–48 GB — bkz. 4.3; rahat 70B için PRO 6000). ~300 W.
- **RTX PRO 6000 Blackwell — 96 GB** (üç sürüm: **Workstation**, **Max-Q Workstation**, **Server**). Tek kartta 70B'yi FP16/8-bit veya çok büyük bağlam. Workstation/Server ~600 W; **Max-Q** ~300 W ile güç/ısı kısıtlı ortamlar için verimli seçenek. Yerel LLM'de "tek kart" amiral gemisi.

> **Hazır iş istasyonu olarak (OpenZeka):** Bu GPU'ları yalnızca kart olarak değil, **kurulu ve test edilmiş komple iş istasyonu** sistemleri olarak da sağlıyoruz (RTX PRO 4000 / 4500 / 5000 / 6000 Workstation ve Max-Q). Sistemler Intel Core i9-14900KF sınıfı işlemci ile gelir; **Ubuntu + optimize NVIDIA yazılım yığını kurulu**, performans/sıcaklık testlerinden geçirilmiş ve **2 yıl garantili** teslim edilir — yani yerel LLM için "kutudan çıkar çalışır". Detay: [openzeka.com/is-istasyonlari](https://openzeka.com/is-istasyonlari/).

<p><img src="{{ '/papers/yerel-llm-rehberi/images/rtx-pro-6000.webp' | relative_url }}" alt="NVIDIA RTX PRO 6000 Blackwell Workstation" width="360"/></p>
<sub><i>NVIDIA RTX PRO 6000 Blackwell Workstation Edition — 96 GB (Görsel: OpenZeka)</i></sub>

**C) Veri merkezi GPU'ları (tekli / az sayıda) — yüksek hacimli, çok kullanıcılı üretim servisi.** Pasif soğutmalı, sunucuya takılan kartlar; vLLM/TensorRT-LLM ile çok sayıda eş zamanlı istek için. B200/B300'ün aksine **tekli (veya sunucu başına 2–8) satılabilir.**
- **NVIDIA L4 — 24 GB.** Düşük güçlü (~72 W) çıkarım kartı; küçük/orta model servisinin verimli tabanı.
- **NVIDIA L40 / L40S — 48 GB.** Çok yönlü çıkarım + ince ayar; orta modelleri yüksek verimle servis eder (70B için tek kart yetmez — bkz. "yaygın hatalar", Bölüm 8; 70B sınıfı H100/H200 veya 2× kart ister).
- **NVIDIA H100 NVL — 94 GB** ve **H200 NVL — 141 GB.** Tekli satılan en üst seviye; büyük MoE modelleri, uzun bağlam, yoğun eş zamanlılık. H200'ün 141 GB'ı tek kartta en yüksek model kapasitesini verir.

<p><img src="{{ '/papers/yerel-llm-rehberi/images/dgx-sunucu.webp' | relative_url }}" alt="NVIDIA DGX AI sunucusu" width="420"/></p>
<sub><i>Veri merkezi sınıfı NVIDIA DGX/HGX sunucu altyapısı (Görsel: OpenZeka)</i></sub>

**D) En üst seviye Blackwell — anahtar teslim veri merkezi sistemleri (HGX / DGX, 8'li takım).** Full training ve yüksek-trafik (500+ eş zamanlı kullanıcı) inference için. Bu sınıf **tekli kart olarak satılmaz**; 8× GPU'lu, kurulu–kablolanmış–soğutmalı bir sunucu/rack olarak gelir — bütçe ve altyapı buna göre planlanmalıdır.
- **NVIDIA B200 — 192 GB HBM3e**, 8 TB/s. Blackwell nesli; cluster eğitimi ve yüksek throughput.
- **NVIDIA B300 — 288 GB HBM3e**, 8 TB/s. Blackwell Ultra; NVFP4 ile en büyük modellerin (405B+) eğitimi ve servisi.
- **Anahtar teslim sistemler — NVIDIA DGX B200 / DGX B300.** Yukarıdaki GPU'lardan 8 tanesini içeren, NVIDIA tarafından kurulu gelen "AI Factory" sınıfı sunucular; kurumsal ölçekte eğitim + çıkarım için en üst seviye. (**DGX** = NVIDIA'nın anahtar teslim sistemi; **HGX** = aynı 8'li GPU bloğunun OEM sunucularına entegre edilen biçimi.)

**E) DGX Spark — masaüstü "AI mini bilgisayarı" (kendine özgü sınıf).**

> **Önemli — isim karışıklığına dikkat:** Adında "DGX" geçse de DGX Spark, yukarıdaki (D) rafa takılan DGX/HGX sunucularıyla **aynı aile/sınıf değildir.** Prize takılan, tek başına çalışan, avuç içi boyutunda bir **masaüstü mini bilgisayardır** (mini PC). Buradaki "DGX" yalnızca NVIDIA'nın masaüstü AI-cihazı markasıdır; B200/B300 veri merkezi sistemleriyle donanım sınıfı, bellek bant genişliği ve kullanım yeri tamamen farklıdır.

- **NVIDIA DGX Spark (GB10 Grace-Blackwell) — 128 GB birleşik bellek, 1 PetaFLOP AI, yalnızca 240 W, 150×150×50 mm / 1,2 kg.** Masaüstü "AI süper bilgisayarı"; ~200B'ye kadar modeli belleğe sığdırır, 70B fine-tune yapılabilir. **Kritik kısıt:** bellek bant genişliği görece düşük (~273 GB/s) → tekil token üretimi, aynı modeli bir H200'de çalıştırmaya göre yavaştır. Gerçek gücü: çok büyük modeli kompakt ve düşük güçle belleğe sığdırmak, yerel geliştirme/test ve kademeli büyüme. **8'li takım zorunluluğu yoktur — mini PC gibi tek tek alınıp ölçeklenebilir.** QSFP kablolarla switch'siz ölçeklenir:
  - **1× Spark** — 128 GB, 70B fine-tune / 200B inference, 3–5 eş zamanlı kullanıcı, yerel test.
  - **2× Spark** (ConnectX-7 QSFP, 200 Gbps doğrudan bağlantı) — 256 GB, 405B inference, orta ölçek ekip.
  - **3× Spark (ring topoloji)** — 384 GB, 405B+ fine-tune / yüksek throughput, switch gerektirmez.

<p>
<img src="{{ '/papers/yerel-llm-rehberi/images/dgx-spark.png' | relative_url }}" alt="NVIDIA DGX Spark" width="320"/>
<img src="{{ '/papers/yerel-llm-rehberi/images/dgx-spark-3x.png' | relative_url }}" alt="3x DGX Spark ring topoloji" width="320"/>
</p>
<sub><i>NVIDIA DGX Spark (128 GB, 240 W) ve 3× ring topoloji ile 384 GB havuz (Görsel: OpenZeka)</i></sub>

**GPU kıyaslama matrisi (2026).** OpenZeka'da öne çıkan LLM seçenekleri:

| Model | Mimari | VRAM | FP16/BF16 (sparse) | FP8 (sparse) | FP4 (sparse) | Memory BW | Satış birimi |
|---|---|---|---|---|---|---|---|
| **B300 288GB** | Blackwell Ultra | 288 GB HBM3e | 4.500 TFLOPS | 9.000 TFLOPS | 30.000 TFLOPS (15 PFLOPS dense) | 8 TB/s | 8'li takım |
| **B200 192GB** | Blackwell | 192 GB HBM3e | 4.500 TFLOPS | 9.000 TFLOPS | 18.000 TFLOPS | 8 TB/s | 8'li takım |
| **H200 141GB** | Hopper | 141 GB HBM3e | 1.979 TFLOPS | 3.958 TFLOPS | — | 4,8 TB/s | Tekli (2–8/sunucu) |
| **DGX Spark (GB10)** | Grace Blackwell | 128 GB LPDDR5x (unified) | — | — | 1.000 AI TOPS | 273 GB/s | Tekli (masaüstü) |
| **RTX PRO 6000 Blackwell** | Blackwell | 96 GB GDDR7 | ~1.000 TFLOPS | ~2.000 TFLOPS | 4.000 AI TOPS | 1,79 TB/s | Tekli (workstation) |
| **L40S 48GB** | Ada Lovelace | 48 GB GDDR6 | 362 TFLOPS | 733 TFLOPS | — | 864 GB/s | Tekli (sunucu) |

> Değerler NVIDIA resmi datasheet'lerinden (2:4 seyreklik/"with sparsity" ile). **B300'ün B200'e göre asıl sıçraması bellek (192→288 GB) ve NVFP4** tarafındadır (FP4 ~%67 daha yüksek: 15 PFLOPS dense / ~30.000 TFLOPS sparse); FP8/FP16 B200 ile benzerdir, bant genişliği ise her ikisinde de 8 TB/s'tir. RTX PRO 6000 için NVIDIA "up to 4 PFLOPS FP4 (4.000 AI TOPS), 2 PFLOPS FP8, 1 PFLOP FP16" verir.

**DGX Spark — örnek çalıştırma hızları (vLLM ile decode benchmark'ı).** Birleşik bellek sayesinde tek başına bir masaüstü cihazda dev modeller çalışabiliyor:

| Model | Boyut | Kuantizasyon | Konfigürasyon | Tok/s (decode) |
|---|---|---|---|---|
| gpt-oss-120b | 120B | MXFP4 | 1× DGX Spark | 54,72 |
| gpt-oss-120b | 120B | MXFP4 | 2× DGX Spark | 101,36 |
| gpt-oss-120b | 120B | MXFP4 | 4× DGX Spark | 106,31 |
| MiniMax-M2.7 | 229B | NVFP4 | 2× DGX Spark | 26,00 |
| Qwen3.5-397B-A17B | 397B | INT4 AutoRound | 3× DGX Spark (ring) | 17,05 |

> Önceki nesil profesyonel kartlar (**RTX 6000 Ada 48 GB**, **RTX A6000 48 GB**) de katalogda yer alır; bütçe/uygunluk durumunda 48 GB'lık alternatiflerdir, ancak yeni alımlarda Blackwell nesli (RTX PRO 5000/6000) tercih edilmelidir.

### 4.6. Çoklu GPU

Tek kartın VRAM'i hedef modele yetmediğinde birden çok kart havuzlanır (ör. 2× RTX PRO 5000 = 96 GB, ya da 2× RTX PRO 6000 = 192 GB). Mantığı: **70B+ ve büyük MoE modelleri yüksek hassasiyet/uzun bağlamla** çalıştırmak. Profesyonel/veri merkezi kartları çoklu-GPU ölçeklenmesi için tasarlanmıştır; iş yükü **tensor paralelliği** (her katman kartlara bölünür, yüksek bant genişliği ister) veya **pipeline paralelliği** (katmanlar kartlara dağıtılır, kartlar arası trafik hafif) ile dağıtılır. vLLM ve TensorRT-LLM her ikisini de destekler. Çok düğümlü (multi-node) kurulumlarda **InfiniBand/Ethernet bant genişliği** ve **PCIe** darboğazları ihmal edilmemelidir.

### 4.7. Sadece CPU + RAM

Başlangıç, küçük/kuantize modeller ve **toplu/etkileşimsiz** işler (ör. belge özetleme) için uygundur; akıcı sohbet için değil. Darboğaz işlem gücü değil **bellek bant genişliğidir**. Tipik 8 çekirdekli masaüstü CPU bir 7B modelde ~5–15 tok/s yapar; büyük modeller tek haneye düşer. VRAM'e sığan bir model, RAM'e taşana göre kabaca ~10x hızlıdır. llama.cpp bazı katmanları GPU'da tutup gerisini RAM'e taşıyabilir (offload) — kısa vadeli çözüm olarak iyidir, üretim hızı için değil.

### 4.8. Senaryo → donanım eşlemesi

<p><img src="{{ '/papers/yerel-llm-rehberi/images/sema-4-gpu-karar.png' | relative_url }}" alt="GPU seçim karar ağacı" width="600"/></p>
<sub><i>Şekil: GPU seçim karar ağacı</i></sub>

**Genel eşleme (uçtan kuruma):**

| İhtiyaç | Hedef VRAM | OpenZeka donanımı |
|---|---|---|
| **Uçta / gömülü / robotik** | birleşik 8–128 GB | Jetson Orin Nano (8 GB) → AGX Orin (64 GB) → **AGX Thor / T5000 (128 GB)** |
| **Giriş iş istasyonu** (7–14B) | 16–24 GB | **RTX PRO 2000 (16 GB)** veya **RTX PRO 4000 (24 GB)** |
| **Orta** (14–32B rahat) | 32–48 GB | **RTX PRO 4500 (32 GB)** veya **RTX PRO 5000 (48 GB)** |
| **Üst / tek kart 70B** | 96 GB | **RTX PRO 6000 (96 GB)** — güç kısıtlıysa Max-Q sürümü |
| **Çok kullanıcılı üretim servisi** | 24–141 GB | **L4 / L40S** → **H100 NVL (94 GB)** → **H200 NVL (141 GB)** |
| **Çok büyük model / anahtar teslim** | 128 GB+ | **DGX Spark (128 GB)** / 2–3× ring, kurumsal ölçekte **DGX B300** |
| **Fine-tune (LoRA/QLoRA)** | düşük–orta | 7B: **1× L40S / RTX PRO 6000** · 70B: **1× DGX Spark** (QLoRA) / **2–4× H200** (LoRA) |
| **Full Fine-tune** | ~12–14× param | 7B: **1× H200** (~85–100 GB) · 70B: **4–8× H200** (ZeRO-3, ~1 TB) |
| **Pre-training (sıfırdan)** | ~16× param | **8× B200 / 8–16× B300** (8'li takım — bkz. 4.5/D) |

**Inference senaryoları (model boyutu × kullanıcı kapasitesi):**

| Model (hassasiyet) | Min VRAM | Önerilen GPU | Eş zamanlı kapasite |
|---|---|---|---|
| 7B (FP16) | ~14 GB | 1× L40S veya RTX PRO 6000 | 50+ |
| 13B (FP16) | ~26 GB | 1× RTX PRO 6000 96GB | 30+ |
| 70B (FP16) | ~140 GB | **2× H200** (tek H200'de KV cache + %20 pay için yer kalmaz) | 20–100 |
| 70B (INT8) | ~70 GB | 1× H200 · 1× DGX Spark | 30–100 (H200) · ~3–5 (Spark) |
| 405B (FP16) | ~810 GB | 8× B300 | 10–50 |
| 405B (INT4) | ~200–230 GB | 3× DGX Spark (ring, 384 GB) | ~3–10 (ring) |
| 70B inference (yüksek trafik, 500+) | — | 8× B200 (1 takım) | throughput için cluster şart |

> **Not:** "Min VRAM" sütunu modelin ilgili hassasiyetteki ham bellek ayak izidir; üstüne KV cache + ~%20 pay eklenir (bkz. 4.3) — bu yüzden 70B FP16 tek 141 GB karta sığmaz, **2× H200** gerekir. DGX Spark (128 GB) ve ring konfigürasyonlarında çok büyük modeller **kuantize** (INT8/INT4) çalıştırılır. DGX Spark'ın bellek bant genişliği görece düşük olduğundan (273 GB/s) **tekil/az sayıda eş zamanlı kullanıcı** için uygundur (~3–5); yüksek eş zamanlılık H200/B-serisi gerektirir.

### 4.9. İşletme maliyetleri ve Toplam Sahip Olma Maliyeti (TCO)

- **Güç (referans TDP):** RTX PRO 2000 ≈ 70 W · PRO 4000 ≈ 140 W · PRO 4500 ≈ 200 W · PRO 5000 ≈ 300 W · PRO 6000 Workstation/Server ≈ 600 W (**Max-Q ≈ 300 W**) · L4 ≈ 72 W · L40S ≈ 350 W · H200 NVL ≈ 600 W · **DGX Spark sadece 240 W** · **8× B200 sunucusu ~15 kW**. Jetson modülleri on/onlarca watt mertebesinde, çok düşüktür.
- **Güç/ısı kısıtı olan ofis ortamı** için Max-Q sürümleri, düşük TDP'li kartlar (PRO 2000/4000, L4) ve DGX Spark belirgin avantaj sağlar.
- **Soğutma:** İş istasyonu kartları kendi fanıyla gelir; veri merkezi kartları (L40S, H100/H200 NVL) **pasiftir** ve yalnızca uygun hava akışına sahip sunucu/kasada çalışır — masaüstü kasaya takılmaz. Çoklu-GPU ve 7/24 üretim için sunucu sınıfı soğutma şarttır.
- **TCO — satın alma bedeli ≠ toplam maliyet.** GPU'nun satın alma bedeli, toplam sahip olma maliyetinin yalnızca **%30–40'ıdır**; kalan **%60–70**'i elektrik, soğutma, ağ, bakım, veri merkezi ve personeldir. Büyük cluster'larda soğutma maliyeti elektrik maliyetine yaklaşabilir; multi-node için InfiniBand switch + kablo maliyeti de unutulmamalıdır. Doğru ölçeklenmiş, düşük güçlü bir çözüm (ör. DGX Spark) çoğu zaman daha düşük TCO sunar.

---

## 5. Model Seçimi

<p><img src="{{ '/papers/yerel-llm-rehberi/images/sema-5-model-secimi.png' | relative_url }}" alt="Göreve göre model seçimi" width="720"/></p>
<sub><i>Şekil: Göreve göre model seçimi</i></sub>

> Boyut–maliyet dengesi: çoğu yerel iş için **7–14B yoğun** ya da **~30B MoE (~3B aktif)** modeller optimum dengedir; en zorlu görevler için 70B+ / büyük MoE gerekir.

### 5.1. Yerel LLM ile neler yapılır? (inference kullanım alanları)

Model seçmeden önce **"hangi işi yapacağım?"** netleşmelidir — görev hem modeli hem donanımı belirler. Çoğu kurum için başlangıç **eğitim değil, inference'tır** (bkz. 4.2) ve **RAG bunlardan yalnızca biridir.** Kullanım alanlarını iki grupta düşünmek pratik olur:

**Etkileşimli (düşük gecikme önemli — TPS/TTFT belirleyici):**
- **Sohbet / asistan** — genel Q&A, kurumsal/kişisel asistan
- **RAG / belge soru-cevap** — kendi belgelerinizle (bunlardan yalnızca biri)
- **Kod yardımı** — IDE asistanı, kod üretme/açıklama/review, test üretimi
- **Ajan & otomasyon (agentic)** — araç çağırma, e-posta triyajı, takvim, çok adımlı iş akışı
- **Çeviri** — gizli belgenin dışarı çıkmadan yerelde çevirisi

**Toplu / etkileşimsiz (batch — gecikme önemsiz; küçük/ucuz donanım da yeter, bkz. 4.7):**
- **Özetleme** — toplantı, sözleşme, uzun rapor, e-posta yığını
- **Bilgi çıkarımı (extraction)** — fatura/sözleşme/form → yapılandırılmış JSON, NER
- **Sınıflandırma / yönlendirme** — talep triyajı, duygu analizi, içerik moderasyonu, PII tespiti
- **Semantik arama / öneri / kümeleme** — gömme (embedding) modelleriyle
- **Sentetik / etiketli veri üretimi** — fine-tune için veri hazırlama
- **Çok kipli** — OCR'li belge analizi, görsel soru-cevap, ses transkripsiyonu + LLM
- **Guardrail / denetim** — başka bir modelin çıktısını denetleme, PII maskeleme

> **Pratik sonuç:** Batch işler gecikmeye duyarsız olduğundan donanım ihtiyacını düşürür — aynı kurum **arşiv özetlemeyi küçük bir kartta**, **canlı sohbeti büyük bir kartta** çalıştırabilir. Görev profiliniz §4'teki donanım sınıfını ve aşağıdaki model seçimini birlikte belirler.

### 5.2. Model seçim kıstasları

Doğru model "en yüksek benchmark skorlu" değil, **görevinize + donanımınıza + kısıtlarınıza en uygun** olandır. Aşağıdaki kıstasları görev önceliğinize göre tartın:

| Kıstas | Sorulacak soru |
|---|---|
| **Görev uygunluğu** | Sohbet mi, kod mu, muhakeme mi, çıkarım mı? |
| **Boyut / VRAM bütçesi** | Donanıma sığar mı? MoE'de bellek için **toplam** parametre belirleyicidir (tüm uzmanlar VRAM'e yüklenir); **aktif** parametre yalnızca **hızı** belirler |
| **Bağlam uzunluğu** | Kaç token gerekiyor? (KV cache yükünü belirler — bkz. 4.3) |
| **Türkçe / dil performansı** | Genel skor değil, **Türkçe** ölçütler (bkz. 5.6) |
| **Lisans** | Ticari kullanım serbest mi? (bkz. 5.7) |
| **Mimari** | Dense vs MoE — hız/bellek ödünleşimi |
| **Kuantize edilebilirlik** | Q4/AWQ kalite kaybı kabul edilebilir mi? GGUF/AWQ mevcut mu? |
| **Tool-calling / JSON güvenilirliği** | Ajan & yapılandırılmış çıktı için kritik (küçük modeller zorlanır) |
| **Çok kiplilik** | Görüntü/ses gerekli mi? |
| **Fine-tune edilebilirlik** | Temel model + ekosistem (Unsloth/Axolotl) mevcut mu? |
| **Ekosistem / bakım** | Hazır kuantlar, türevler, aktif geliştirme var mı? |

> Kıstaslar **göreve göre ağırlıklandırılır:** kod asistanında tool-calling + SWE-bench öne çıkar; kamu/hukuk belgesi işlemede Türkçe performansı + lisans + atıf doğruluğu belirleyicidir. Seçimi tek bir "lider model" yerine kendi kullanımınızla doğrulayın (bkz. 5.9).

### 5.3. Güncel açık ağırlıklı model aileleri (2026 ortası)

> **Not:** 2026'da momentum belirgin biçimde Çinli açık ağırlık laboratuvarlarına (Qwen, DeepSeek, GLM, Kimi, MiniMax) kaydı. Çoğu yeni model **MoE (Mixture-of-Experts)** mimarisi kullanıyor: toplam parametre büyük ama her adımda yalnızca küçük bir "aktif" kısmı çalışıyor → büyük model kalitesi, küçük model çalışma maliyeti.

- **Qwen (Alibaba)** — en aktif aile. Qwen3-235B-A22B (235B toplam / 22B aktif, **Apache 2.0**). Şubat 2026'da **Qwen3.5** serisi (bayrak gemisi Qwen3.5-397B-A17B, ~1M bağlam; ayrıca 0.8B–27B yoğun ve 35B-A3B / 122B-A10B MoE varyantları). Daha yeni **Qwen3.6-35B-A3B** kodlamada eski 397B'yi yakalıyor. 100–200+ dil.
- **DeepSeek** — Nisan 2026'da **DeepSeek V4** (MIT): V4-Pro (1.6T / 49B aktif, 1M bağlam) ve V4-Flash (284B / 13B aktif). Eski **R1** muhakeme modeli ve damıtılmış (distill) sürümleri (1.5B–70B) hâlâ çok yaygın.
- **Llama (Meta)** — **Llama 4** ailesi: Scout (109B/17B aktif, 10M bağlam), Maverick (~400B/17B aktif, 1M bağlam). En büyük "Behemoth" pratikte rafa kalkmış görünüyor (resmî olarak doğrulanmadı). Lisans kısıtlayıcı (bkz. 5.7).
- **Google Gemma** — **Gemma 4**: E2B (telefon), E4B (uç/edge), 12B, 26B-A4B (MoE), 31B yoğun. 140+ dil, 4B'den itibaren çok kipli (metin+görüntü).
- **Mistral** — Mistral Large 3 (675B/41B aktif, çok kipli) ve Mistral Small 4 (Apache 2.0). 24B **Magistral** muhakeme modeli.
- **Microsoft Phi** — Phi-4 ailesi (~14B muhakeme modelleri, MIT). Parametre başına muhakemede güçlü, yerel için ideal.
- **2026 yükselenleri:** **GLM-5.1 (Zhipu/Z.ai)** (~744B/40B aktif, MIT, güçlü ajan/kodlama), **Kimi K2.6 (Moonshot)** (~1T/32B aktif, çok kipli, kodlamada en iyi açık modellerden), **MiniMax M3** (Haziran 2026; frontier kodlama + 1M bağlam + çok kiplilik bir arada), **MiMo V2.5 Pro (Xiaomi)** (açık-ağırlık zekâ zirvesinde). NVIDIA'nın açık modeli **Nemotron 3** ve **Gemma 4**, Çin-dışı en güçlü açık seçeneklerdir; OpenAI'nin açık-ağırlık **gpt-oss** serisi de yerelde çalışır.

### 5.4. Parametre boyutu ↔ performans dengesi

- **Küçük (1–4B):** 2026'da gerçekten işe yarıyor — otomatik tamamlama, özetleme, akıllı yanıtlar, basit Q&A, hafif kod yardımı. Telefonda ve 6 GB VRAM'de çalışır.
- **7–14B yoğun veya ~30B MoE (~3B aktif):** Çoğu yerel iş için **optimum denge** — sohbet, RAG, kod yardımı, ajan görevleri. Qwen3.6-35B-A3B, Gemma 4 26B-A4B gibi MoE'ler küçük model maliyetiyle büyük modele yakın kalite verir.
- **70B+ / büyük MoE:** En zor muhakeme, karmaşık çok adımlı ajan-kodlama, çok uzun bağlam ve en yüksek benchmark skorları için. Çoklu GPU / ciddi VRAM ister.

### 5.5. Kuantizasyon

- **Formatlar:** **GGUF** (llama.cpp/Ollama/LM Studio; CPU+GPU; yerelde en yaygın), **GPTQ** (GPU), **AWQ** (aktivasyon-duyarlı, 4-bit'te GPTQ'dan biraz iyi).
- **Kalite/bit:** FP16 = tam kalite · 8-bit ≈ kayıpsıza yakın · **Q4_K_M** ≈ kalitenin ~%92–95'i · AWQ 4-bit ≈ ~%95. 4-bit'te kayıp çoğu görevde ~%1–2.
- **2026 gelişmeleri:** **imatrix** (önem matrisli) kuantlar aynı bit'te kaliteyi artırır; **Unsloth Dynamic 2.0** katman başına bit ayarlar; Blackwell için donanım-native **MXFP4**; sunucu kurulumlarında **FP8** yaygın.

### 5.6. Göreve göre seçim (Türkçe dahil)

- **Genel sohbet:** Qwen3/3.5 (çok dilli, Apache 2.0), Gemma 4 (çok kipli, uca uygun).
- **Kodlama/ajan:** Kimi K2.6, GLM-5.1, DeepSeek V4-Pro, MiniMax M3, Qwen3.6 (Qwen-Coder).
- **En üst seviye genel zekâ (muhakeme dâhil):** 2026'da muhakeme ayrı bir kategori değil. **Artificial Analysis Intelligence Index** (v4.0; ajan + kodlama + bilimsel muhakeme + genel yeteneği birleştirir, <https://artificialanalysis.ai>) açık-ağırlık zirvesinde aynı modellerin hem zekâda hem kodlamada hem muhakemede önde olduğunu gösteriyor. Güncel açık-ağırlık liderleri: **Kimi K2.6**, **DeepSeek V4-Pro**, **GLM-5.1** (üçü istatistiksel olarak başa baş), ardından **MiMo V2.5 Pro (Xiaomi)** ve **Qwen3.6**. Çin-dışı en güçlü açık modeller: **Google Gemma 4** ve **NVIDIA Nemotron 3**. (Not: Qwen3.7 **Max/Plus kapalı** API modelleridir, açık-ağırlık değildir.) Kompakt/yerel muhakeme için **Phi-4** ve **Magistral 24B** parametre başına güçlüdür.
- **Türkçe / çok dilli:** En iyi genel çok dilli açık modeller **Qwen3/3.5** (200+ dil) ve **Gemma 3/4** (140+ dil). **TurkBench**'te Qwen3-235B-Inst 73,4, Gemma-3-12B-TR 71,4 aldı (büyük modeller tutarlı biçimde önde). **Türkçeye özel modeller:** ytu-ce-cosmos **Turkish-Llama-8b** (YTÜ, Llama-3 tabanlı), **Trendyol-LLM v4.1.0** (Qwen2.5-7B + 13B Türkçe token üzerine), **CosmosGPT** (355M–774M, yalnız Türkçe), **MODA** (Qwen2.5-7B sürekli ön-eğitim, 2026). Türkçe ölçütler: **TurkishMMLU, Cetvel, TurkBench**.
- **RAG için embedding & reranking modelleri:** RAG kalitesi LLM kadar **gömme (embedding) modeline** de bağlıdır — yanlış parça getirilirse en iyi model bile doğru cevap veremez. Çok dilli/Türkçe için güçlü açık seçenekler: **BGE-M3**, **multilingual-e5**, **Jina embeddings v3**, **Nomic Embed**; yeniden sıralama (reranking) için **bge-reranker** sınıfı. Embedding de yerelde çalışır (ör. **TEI**); Türkçe ağırlıklı işlerde çok dilli/Türkçe sürümleri seçin ve kendi belgelerinizde doğrulayın (bkz. 5.9).

### 5.7. Lisans (ticari kullanım)

- **Tam serbest (Apache 2.0 / MIT):** Qwen3/3.5 (Apache 2.0), DeepSeek V4 & R1 (MIT), GLM-5.1 (MIT), Mistral açık katman (Apache 2.0), Phi-4 (MIT). Kimi K2.6 "Modified MIT" (çok büyük ölçekte marka/atıf maddesine bakın).
- **Kısıtlayıcı:** **Llama 4 Community License** — ticari kullanım yalnız 700M aylık aktif kullanıcının altındaki kurumlar için serbest; AB merkezli kullanıcılar çok kipli/görüntü yeteneklerinden hariç. **Gemma** Google'ın kendi şartlarıyla (izin verici ama saf Apache değil).
- **Türkiye'de ticari dağıtım için en güvenli temeller:** Qwen (Apache 2.0) ve DeepSeek/GLM (MIT). Türkçe türev modeller temel modelin lisansını miras alır — Trendyol v4.x → Qwen2.5, ytu-cosmos → Llama; her model kartını ayrıca kontrol edin.

### 5.8. 2026'da modelleri nerede karşılaştırırsınız?

- Orijinal **Hugging Face Open LLM Leaderboard arşivlendi** (2025). Yerini aggregatör/arena siteleri aldı.
- **LMArena** (eski Chatbot Arena/LMSys) — kör A/B oylarından Elo; gerçek dünya tercihi için en iyi sinyal.
- **llm-stats.com** — 300+ model; bileşik skor (GPQA, SWE-Bench Verified, kodlama-arena, fiyat).
- **Artificial Analysis — Intelligence Index** (v4.0) — ajan + kodlama + bilimsel muhakeme + genel yeteneği birleştiren bileşik skor; açık-ağırlık ve kapalı modelleri yan yana sıralar. Açık model seçiminde **en pratik tek-bakış** kaynağıdır. <https://artificialanalysis.ai>
- **Önemli benchmark'lar:** ajan-kodlama için **SWE-Bench Pro & Verified / Terminal-Bench**, muhakeme/bilim için **GPQA Diamond / Humanity's Last Exam**; eski akademik ölçütler (MMLU-Pro, AIME, MATH-500) büyük ölçüde doygunlaştığından artık daha az ayırt edicidir; Türkçe için **TurkishMMLU / Cetvel / TurkBench**.

### 5.9. Kendi değerlendirme (benchmark) setinizi kurun

§5.8'deki genel leaderboard'lar iyi bir başlangıç sinyalidir ama **sizin gerçeğinizi yansıtmaz:** sizin diliniz, alanınız, belgeleriniz ve seçtiğiniz kuantizasyon farklı sonuç verir; üstelik popüler benchmark'larda **veri kontaminasyonu** (modelin test sorularını eğitimde görmüş olması) riski vardır. En güvenilir karar, kuruma özel küçük bir değerlendirme setidir.

- **Veri:** Gerçek kullanımdan **50–200 temsili örnek** toplayın (girdi + ideal çıktı veya kabul kriteri).
- **Yöntem (göreve göre):**
  - Çıkarım / sınıflandırma → otomatik skor (tam-eşleşme / regex)
  - Açık uçlu / sohbet → **LLM-as-judge** (daha büyük bir modelle, rubrikle) + insan side-by-side
  - RAG → retrieval **recall@k** + atıf/temellendirme (faithfulness) doğruluğu
- **Yalnızca kaliteyi değil ölçün:** kendi donanımınızda **TPS/TTFT**, eşzamanlı kapasite, **PII sızıntısı / gereksiz reddetme oranı**.
- **Süreç:** adayları aynı sette kıyaslayın → **kuantizasyon seviyelerini de test edin** (Q4 vs Q8 kalite kaybı) → model/sürüm güncellemelerinde aynı seti **regresyon testi** olarak tekrar çalıştırın.
- **Araçlar:** lm-evaluation-harness, promptfoo, RAG için RAGAS / DeepEval, izleme için Langfuse.

> **PoC döngüsü:** küçük başlayın → kendi setinizde ölçün → ihtiyaç netleştikçe donanımı ve modeli büyütün. "Doğru model" kararı pazarlama skoruyla değil, bu döngüyle verilir.

---

## 6. Yazılım Seçimi

Yazılım katmanını yedi kategoride düşünmek en sağlıklısı: **(A) çıkarım motorları** (modeli asıl çalıştıran arka uç), **(B) hepsi-bir-arada masaüstü uygulamalar**, **(C) yeni nesil self-hosted AI workspace'ler**, **(D) klasik web arayüzleri ve RAG çözümleri**, **(E) API ağ geçitleri / yönlendirme** (çok modelli, çok kullanıcılı kurulumların önündeki katman), **(F) fine-tune & eğitim araçları** ve **(G) kodlama asistanları & ajanları**.

<p><img src="{{ '/papers/yerel-llm-rehberi/images/sema-6-yazilim-katmani.png' | relative_url }}" alt="Yazılım katmanları: arayüz → (gateway) → motor → donanım, yanda fine-tune" width="620"/></p>
<sub><i>Şekil: Yazılım katmanları: arayüz → motor → donanım</i></sub>

> **Ortak nokta — OpenAI uyumlu API:** llama.cpp (llama-server), Ollama, vLLM, SGLang ve LM Studio'nun hepsi **OpenAI uyumlu bir endpoint** sunar. Yani aynı istemci kodu (sadece `base_url`'i localhost'a çevirerek) hepsiyle çalışır — entegrasyon açısından kritik bir kolaylık.

### 6.A. Çıkarım motorları (backend)

- **llama.cpp** — Ekosistemin temeli. C/C++; native format **GGUF** (1,5-bit → 8-bit). CUDA dahil 15+ arka uç; `llama-server` OpenAI uyumlu HTTP sunucusu verir. En geniş donanım uyumu, en mütevazı donanımda çalışır. LM Studio, Ollama ve Jan gibi pek çok araç onu (GGUF) çıkarım motoru olarak temel alır. *(Lisans: MIT · ~117k★ · [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp))*
- **Ollama** — En kolay başlangıç (`ollama run <model>`), kendi model kütüphanesi. **2026 değişikliği:** Temmuz 2025'ten beri **macOS/Windows için resmi masaüstü uygulaması** var (sohbet GUI'si, dosya/görüntü girişi); Linux hâlâ CLI. 2026 sürümleri ajan/entegrasyon katmanı, daha hızlı GGUF yükleme, eşzamanlı çoklu oturum ve buluta model yayınlama ekledi. Hem native REST hem OpenAI uyumlu API. Üzerine onlarca ön yüz (Open WebUI, AnythingLLM…) kurulur. *(Lisans: MIT · ~174k★ · [ollama/ollama](https://github.com/ollama/ollama))*
- **vLLM** — Yüksek verimli **servis** motoru. **PagedAttention** ile KV cache'i sayfalar (bellek israfı <%4). Naif HF'e göre ~24x, Ollama'ya göre yüksek eşzamanlılıkta 2–4x verim. OpenAI uyumlu sunucu. Üretim / çok kullanıcılı / yüksek eşzamanlı GPU servisi içindir; masaüstü için değil. (Neredeyse haftalık sürüm; v0.22.1, Haziran 2026.) *(Lisans: Apache-2.0 · ~83k★ · [vllm-project/vllm](https://github.com/vllm-project/vllm))*
- **SGLang** — vLLM'in muadili. **RadixAttention** ile ortak önekleri (sistem promptu, çok turlu geçmiş) tek kez saklar. xAI/NVIDIA dahil 400.000+ GPU'da üretimde olduğu belirtiliyor; bazı testlerde H100'de vLLM'den ~%29 yüksek verim. Ajan/çok turlu/ortak-prompt senaryolarında güçlü. *(Lisans: Apache-2.0 · ~29k★ · [sgl-project/sglang](https://github.com/sgl-project/sglang))*
- **TensorRT-LLM (NVIDIA)** — NVIDIA'nın kendi açık kaynaklı, **yalnız NVIDIA GPU'lara** yönelik en yüksek performanslı çıkarım motoru. Modeli belirli bir model+GPU+hassasiyet için bir **TensorRT motoruna derler** (kaynaşmış/fused kernel'ler, optimize attention, agresif kuantizasyon). **FP8, FP4, INT4-AWQ, INT8-SmoothQuant** destekler; in-flight batching, paged KV cache, spekülatif çözümleme içerir. Yayımlanan kıyaslamalarda H100 sınıfı kartlarda tepe verim/gecikmede vLLM'in tipik olarak ~%15–30 önünde. **Bedeli:** derleme adımı (engine build) ve operasyon yükü vLLM'den fazla, yeni modellere uyum daha yavaş. **Ne zaman:** donanımı NVIDIA'ya sabitlemiş, son damla performansı isteyen üretim servisleri için. Tek kullanıcılı masaüstü için aşırı; o durumda Ollama/llama.cpp, çok kullanıcılı pratik servis için vLLM/SGLang daha mantıklı. *(Lisans: Apache-2.0 · ~14k★ · [NVIDIA/TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM))*

### 6.B. Hepsi-bir-arada masaüstü uygulamalar

- **LM Studio** — Cilalı (kapalı kaynak) masaüstü uygulaması: HF model tarayıcısı, tek tıkla indirme, sohbet GUI'si ve yerel OpenAI uyumlu sunucu. Win/macOS/Linux. 2026'da sürekli batch'leme, MTP spekülatif çözümleme; `lms` CLI ve sunucu/CI için başsız (headless) **`llmster`**. GUI + geliştirici aracı isteyenler için en iyi yol. *(Lisans: kapalı kaynak · [lmstudio.ai](https://lmstudio.ai))*
- **Jan** — Açık kaynak, ChatGPT tarzı, %100 çevrimdışı olabilir. Yerleşik model merkezi, bulut bağlayıcılar, **MCP desteği**, `localhost:1337`'de OpenAI uyumlu API. Win/macOS/Linux. LM Studio'nun başlıca açık kaynak alternatifi. (v0.7.9, Mart 2026.) *(Lisans: Apache-2.0 · ~43k★ · [janhq/jan](https://github.com/janhq/jan))*
- **Llamafile (Mozilla)** — Model + llama.cpp'yi **tek çift-tıklanabilir dosyada** paketler, tarayıcıda sohbet açar. Mutlak basitlik/taşınabilirlik için. *(Lisans: Apache-2.0 · ~25k★ · [Mozilla-Ocho/llamafile](https://github.com/Mozilla-Ocho/llamafile))*

### 6.C. Yeni nesil self-hosted AI workspace'ler

> Bu kategori 2026'nın gerçek yeniliği. Fark "hangi sohbet arayüzü daha güzel" değil; **ajan + kalıcı hafıza + MCP + kişisel veri entegrasyonu (e-posta/takvim/notlar)** kutudan çıkıyor mu? "Sohbet arayüzü → AI workspace" kayması gerçek — ama klasik arayüzler de yerinde durmadı (bkz. 6.D'deki dürüst değerlendirme).

- **Odysseus** ([github.com/pewdiepie-archdaemon/odysseus](https://github.com/pewdiepie-archdaemon/odysseus)) — Bu paradigmanın en net örneği. **Ajan modu** (shell, dosya işlemleri, beceri çalıştırma), **MCP** desteği, **Cookbook** (donanımınızı tarayıp VRAM-farkında model önerir ve indirir — "donanımım neyi çalıştırır?" boşluğunu doğrudan kapatır), **Deep Research**, **ChromaDB ile kalıcı hafıza & beceriler**, **e-posta triyajı** (IMAP/SMTP), **CalDAV takvim**, notlar/görevler, model karşılaştırma. Arka uç: vLLM, llama.cpp, Ollama (+ OpenRouter/OpenAI/Copilot). Docker compose veya native Python. *(Lisans: AGPL-3.0 · ~71k★ · [pewdiepie-archdaemon/odysseus](https://github.com/pewdiepie-archdaemon/odysseus))*, aktif. *(Güvenlik notu: geniş shell/araç erişimi nedeniyle proje, dağıtımı bir yönetici konsolu gibi korumayı — kimlik doğrulama açık, doğrudan internete açmama, ters proxy + HTTPS — öneriyor.)*
- **Khoj** — "AI ikinci beyin". Kişisel belgeler (PDF, Markdown, Notion, Word, org-mode) üzerinde semantik arama + sohbet; **özel ajanlar, zamanlanmış otomasyonlar, deep research**. Sıra dışı geniş erişim yüzeyi: tarayıcı, **Obsidian, Emacs**, masaüstü, mobil, WhatsApp. Self-host (Docker) / bulut / kurumsal. Çok aktif. *(Lisans: AGPL-3.0 · ~35k★ · [khoj-ai/khoj](https://github.com/khoj-ai/khoj))*
- **Hermes (Nous Research)** — **Hermes Agent**, öz-gelişen (self-improving) otonom ajan: karmaşık görev sonrası **otomatik beceri oluşturma**, kalıcı hafıza, 40+ araç, **MCP**, cron zamanlayıcı, paralel alt-ajanlar, çok platformlu mesajlaşma (Telegram/Discord/Slack/WhatsApp/Signal). **Hermes WebUI** üç panelli hafif bir ön yüz. Hızla büyüyen yeni bir proje. *(Lisans: MIT · ~194k★ · [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent))* **Önemli:** model-endpoint bağımsız (yerel-öncelikli değil); yerel LLM için Ollama/vLLM özel endpoint'ine yönlendirin.

### 6.D. Klasik web arayüzleri ve RAG çözümleri

**Klasik / genel web arayüzleri:**
- **Open WebUI** — "Geri mi kaldı?" sorusunun dürüst yanıtı: **kısmen, ama sandığınız kadar değil.** En popüler self-hosted sohbet arayüzü (~141k★, çok aktif). Modern yetenekleri **eklemiş**: MCP desteği (+kayıt defteri), native Python araç çağırma, Pipelines eklenti çerçevesi, 9 vektör DB'de yerel RAG, 15+ sağlayıcıyla web arama. **Eleştirinin haklı yanı:** hâlâ temelde bir **sohbet ön yüzü + RAG + eklenti**; e-posta triyajı, takvim, notlar, donanım-farkında model cookbook'u veya öz-gelişen beceri/hafıza döngüsü gibi *workspace* kimliği yok. Yani durağan değil — sadece "genel arayüz" şeridinde, "AI workspace" şeridinde değil. *(Lisans: Open WebUI License — BSD-3 + marka koşulu · ~142k★ · [open-webui/open-webui](https://github.com/open-webui/open-webui))*
- **LibreChat** — Çok sağlayıcılı, kodsuz özel ajanlar/asistanlar, MCP, güvenli kum havuzlu kod yorumlayıcı, web arama, kod artefaktları. Büyük arayüzler içinde en serbest lisans; çok aktif. *(Lisans: MIT · ~39k★ · [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat))*
- **LobeChat / LobeHub** — Açıkça **ajan paradigmasına yeniden konumlandı**: Agent Builder, Agent Groups, otomatik koşular için zamanlama, düzenlenebilir "Personal Memory", 10.000+ araç/MCP eklentisi. "Sohbet → workspace" kaymasının klasiklerde bile gerçek olduğunun kanıtı. *(Lisans: LobeHub Community License · ~79k★ · [lobehub/lobe-chat](https://github.com/lobehub/lobe-chat))*
- **Cherry Studio** — Masaüstü istemci (Electron; Win/macOS/Linux). Birleşik LLM erişimi + yerel; **MCP araç kullanımı, ajanlar, 300+ hazır asistan**, önceden bağlı dosya sistemi/GitHub/web-arama/hafıza MCP sunucuları. Ollama yerel API'yi destekler. Tek kullanıcılı masaüstü/kendi-anahtarını-getir kitlesi için. *(Lisans: AGPL-3.0 · ~35k★ · [CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio))*

**RAG odaklı çözümler (kendi belgelerinizle Q&A):**
- **AnythingLLM** — Belgeleriniz üzerinde özel ChatGPT; güçlü ajan özellikleri: kodsuz **ajan oluşturucu**, web gezme, **cron ile zamanlanmış ajan görevleri**, MCP. Kaynak atıflı RAG; LanceDB + PGVector/Pinecone/Weaviate/Qdrant; çok kullanıcı. Yerel arka uç: Ollama, LM Studio, llama.cpp, LocalAI. Docker veya masaüstü. RAG ile workspace arasında durur. *(Lisans: MIT · ~62k★ · [Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm))*
- **OpenRAG-Local (CordatusAI)** — ⭐ **OpenZeka/Cordatus'un açık kaynak katkısı** ([github.com/CordatusAI/openrag-local](https://github.com/CordatusAI/openrag-local)). Langflow'un OpenRAG projesini (`langflow-ai/openrag`) fork'layıp uçtan uca **yerel çalışacak şekilde** uyarladık ve açık kaynak olarak paylaştık: **hiçbir bulut API anahtarı gerektirmez**, çıkarım kendi GPU'nuzda **sglang/vLLM** (OpenAI uyumlu) ile, gömme (embedding) ise yerel **TEI** ile yapılır. Belgelerinizi yükleyip sohbet arayüzünden sorgularsınız. Yığın: **Langflow** (akış motoru) + **OpenSearch** (vektör deposu) + **Docling** (OCR'li belge ayrıştırma) + **SearXNG** (yerel web arama). **Ajansal (agentic) RAG**, yeniden sıralama (re-ranking) ve çok-ajanlı orkestrasyon içerir; tek komutla **Docker Compose** ile kurulur, çoklu-GPU cihaz ataması yapılabilir. Örnek yapılandırması LLM olarak **GLM-5.1-FP8** kullanır — yani bu rehberdeki donanım (RTX PRO / DGX) ve model (Apache/MIT) seçimleriyle birebir uyumlu, tamamen yerel bir belge-Q&A çözümünü ücretsiz kurmanızı sağlar. *(Lisans: Apache-2.0 · [CordatusAI/openrag-local](https://github.com/CordatusAI/openrag-local) — `langflow-ai/openrag` fork'u, genç proje.)*
- **RAGFlow** — Derin belge anlama + ajan yeteneklerini birleştiren önde gelen açık RAG motoru. Dağınık gerçek-dünya belgelerinde (PDF/tarama/slayt/Excel) güçlü; açıklanabilir parçalama, izlenebilir/temellendirilmiş atıflar (halüsinasyon karşıtı), ajan iş akışları + kod çalıştırma + MCP. Docker Compose (4+ çekirdek, 16 GB RAM). En çok yıldızlanan özel RAG motoru; ciddi/üretim belge Q&A için. *(Lisans: Apache-2.0 · ~82k★ · [infiniflow/ragflow](https://github.com/infiniflow/ragflow))*

### 6.E. API ağ geçitleri / yönlendirme (gateway & router)

> Bu katman, §6 girişindeki **"hepsi OpenAI-uyumlu, tek `base_url`"** fikrinin kurumsal ölçeğe taşınmış hâlidir: birden çok modeli/sunucuyu/sağlayıcıyı tek bir OpenAI-uyumlu girişin arkasına koyar.

**Ne zaman gerekli?** Tek kullanıcı + tek model için **gerekmez** — motorun kendi endpoint'i yeter. Ama **çok ekip, çok model, birden fazla GPU sunucusu, yerel+bulut karışımı veya kullanım/kota faturalaması** söz konusuysa devreye girer (bkz. Senaryo C ve G).

**Mimari konum:** `Uygulamalar / IDE → [Gateway] → vLLM · TensorRT-LLM · Ollama · llama.cpp endpoint'leri`

**Ne sağlar:** sanal API anahtarları (ekip başına izolasyon), **bütçe + hız limiti** (kota), **yönlendirme + yük dengeleme + fallback** ("ucuz görev → küçük model, zor görev → büyük model"), maliyet/kullanım takibi, gözlemlenebilirlik (Langfuse vb.), önbellek ve guardrail.

> **Önemli gereksinim notu:** Gateway **hesaplama yapmaz, yalnızca proxy'dir** → **GPU gerektirmez, CPU yeter, düşük kaynak.** Tipik kurulum: Docker + durum için **Postgres** (anahtar/bütçe) + opsiyonel **Redis** (cache/rate-limit). Yani motor katmanından çok daha hafiftir; "bir GPU kutusu daha" değildir.

- **LiteLLM** — En yaygın seçenek. Hem Python SDK hem **LiteLLM Proxy** (gateway sunucusu): sanal anahtar, bütçe/limit, routing/fallback, maliyet takibi, Langfuse log, Redis cache. Yerel için doğrudan vLLM/Ollama endpoint'lerine bağlanır. *(Lisans: MIT — `enterprise/` dizini ayrı ticari lisans · ~50k★ · [BerriAI/litellm](https://github.com/BerriAI/litellm))*
- **Portkey AI Gateway** — Hızlı, açık kaynak edge gateway; routing/fallback/cache/gözlemlenebilirlik, self-host edilebilir. *(Lisans: MIT · ~12k★ · [Portkey-AI/gateway](https://github.com/Portkey-AI/gateway))*
- **Kong AI Gateway** — Zaten Kong kullanan kurumlar için; ayrı bir proje değil, **Kong Gateway'in içindeki bir yetenek** (çok-LLM yönlendirme). *(Lisans: Apache-2.0 · ~44k★ · [Kong/kong](https://github.com/Kong/kong))*
- **Envoy AI Gateway** — Envoy Gateway üzerine kurulu; K8s ortamları için üretici-bağımsız erişim katmanı. *(Lisans: Apache-2.0 · ~2k★ · [envoyproxy/ai-gateway](https://github.com/envoyproxy/ai-gateway))*
- **NVIDIA tarafı (rapora uygun):** **NIM** mikroservisleri — kapsayıcılı, OpenAI-uyumlu, optimize çıkarım servisleri *(Lisans: kapalı/tescilli; üretim için NVIDIA AI Enterprise · [docs.nvidia.com/nim](https://docs.nvidia.com/nim/))*; gateway'i ayrı kurmadan ölçeklenmiş servis için **vLLM production-stack** kendi router'ıyla *(Lisans: Apache-2.0 · ~2k★ · [vllm-project/production-stack](https://github.com/vllm-project/production-stack))*. Çoklu-GPU/çoklu-düğüm model yönetimi (gateway'e komşu "küme yöneticisi") için **GPUStack** *(Lisans: Apache-2.0 · ~5k★ · [gpustack/gpustack](https://github.com/gpustack/gpustack))*.

### 6.F. Fine-tune & eğitim araçları (açık kaynak)

> Bu araçlar §4.2'deki dört kademeyi (pre-training · full fine-tune · LoRA · QLoRA) pratiğe döker. Çoğu kurum **LoRA/QLoRA** ile başlar — tek GPU'lu bir iş istasyonunda dahi mümkündür; full fine-tune ve sıfırdan eğitim çok-GPU/çok-düğüm ister. Tümü NVIDIA CUDA üzerinde çalışır. Donanım eşlemesi için bkz. 4.2 ve Senaryo F.

**Kolay giriş — LoRA/QLoRA fine-tune (tek / az GPU):**
- **Unsloth** — En hızlı ve en düşük VRAM'li LoRA/QLoRA; tek GPU'da büyük modelleri uyarlar. **Unsloth Studio** ile veri → eğitim → değerlendirme → dışa aktarma (LoRA/GGUF) **kodsuz, yerel web arayüzünden** tek akışta yapılır. *(Lisans: Apache-2.0 / AGPL-3.0 ikili — AGPL maddesi kurumsal hukuk incelemesi gerektirir · ~67k★ · [unslothai/unsloth](https://github.com/unslothai/unsloth))*
- **LLaMA-Factory** — Kodsuz **WebUI/CLI**; 100+ LLM ve VLM için en geniş model yelpazesiyle fine-tune. Ekipler için en pratik giriş. *(Lisans: Apache-2.0 · ~72k★ · [hiyouga/LLaMA-Factory](https://github.com/hiyouga/LLaMA-Factory))*
- **Axolotl** — **YAML-config** ile sürüm-kontrollü, tekrarlanabilir fine-tune hatları; tek GPU'dan çok-GPU'ya ölçeklenir. *(Lisans: Apache-2.0 · ~12k★ · [axolotl-ai-cloud/axolotl](https://github.com/axolotl-ai-cloud/axolotl))*

**Hizalama / yapı taşları:**
- **Hugging Face TRL** — Hizalama / post-training (SFT, DPO, GRPO/RLHF) için bileşen kütüphanesi. *(Lisans: Apache-2.0 · ~19k★ · [huggingface/trl](https://github.com/huggingface/trl))*
- **Hugging Face PEFT** — LoRA/adapter motorunun temeli; tek başına değil, TRL/Axolotl gibi araçların altında bağımlılık olarak çalışır. *(Lisans: Apache-2.0 · ~21k★ · [huggingface/peft](https://github.com/huggingface/peft))*

**Ciddi / büyük ölçekli & dağıtık eğitim (çok-GPU / DGX sınıfı):**
- **NVIDIA NeMo** — NVIDIA-native uçtan uca eğitim çatısı; DGX sınıfı çok-GPU/çok-düğüm için. *(Lisans: Apache-2.0 · ~17k★ · [NVIDIA-NeMo/NeMo](https://github.com/NVIDIA-NeMo/NeMo))*
- **Megatron-LM** — Sıfırdan büyük ölçekli ön-eğitim (pretraining) için GPU-optimize NVIDIA kütüphanesi. *(Lisans: Apache-2.0 · ~17k★ · [NVIDIA/Megatron-LM](https://github.com/NVIDIA/Megatron-LM))*
- **DeepSpeed** — Dağıtık eğitim arka ucu (ZeRO, CPU/NVMe offload); VRAM'in tek başına yetmediği modelleri eğitmeyi mümkün kılar. *(Lisans: Apache-2.0 · ~43k★ · [deepspeedai/DeepSpeed](https://github.com/deepspeedai/DeepSpeed))*

> **Seçim:** Tek iş istasyonunda hızlı uyarlama için **Unsloth** veya **LLaMA-Factory**; sürüm-kontrollü hatlar için **Axolotl**; hizalama için **TRL**; DGX sınıfı dağıtık eğitim/pretraining için **NeMo + Megatron + DeepSpeed**. Fine-tune sonrası modeli mutlaka kendi değerlendirme setinizde sınayın (bkz. 5.9).

### 6.G. Kodlama asistanları & ajanları (açık kaynak)

> Aşağıdaki araçların hepsi **yerel LLM'e OpenAI-uyumlu / Ollama endpoint'i** üzerinden bağlanır — yani kodunuz ve deponuz dışarı çıkmadan, kapalı buluta bağlanmadan kod asistanı/ajanı kullanılır. Kurumsal ve air-gapped ortamlar için kritik. Kod görevlerinde **tool-calling yetenekli** bir model seçin (bkz. 5.2); Qwen-Coder / DeepSeek-Coder sınıfı modeller iyi eşleşir.

**Terminal ajanları:**
- **OpenCode** — Terminal-native, en popüler açık kod ajanı; 75+ sağlayıcı + yerel endpoint desteği. *(Lisans: MIT · ~175k★ · [sst/opencode](https://github.com/sst/opencode))*
- **Aider** — Git-farkında terminal "pair programming"; olgun ve yerleşik. *(Lisans: Apache-2.0 · ~46k★ · [Aider-AI/aider](https://github.com/Aider-AI/aider))*

**IDE içi (VS Code / JetBrains):**
- **Cline** — VS Code/JetBrains otonom kodlama ajanı; açık Ollama/LM Studio/OpenAI-uyumlu desteği. *(Lisans: Apache-2.0 · ~63k★ · [cline/cline](https://github.com/cline/cline))*
- **Continue** — IDE asistanı: sohbet + **otomatik tamamlama** + ajan modu, yerel modele tam yapılandırılabilir. *(Lisans: Apache-2.0 · ~34k★ · [continuedev/continue](https://github.com/continuedev/continue))*

**Geniş yazılım ajanı:**
- **OpenHands** — Kum havuzlu, uçtan uca yazılım-mühendisliği ajanı (eski OpenDevin); yerel vLLM/Ollama'ya bağlanır. *(Lisans: MIT · ~77k★ · [All-Hands-AI/OpenHands](https://github.com/All-Hands-AI/OpenHands))*

**Self-hosted otomatik tamamlama (air-gapped dostu):**
- **Tabby** — Tamamen self-host edilebilen Copilot alternatifi (FIM tamamlama + sohbet); on-prem / ağdan yalıtılmış ortamlar için ideal. *(Lisans: Apache-2.0 çekirdek + `ee/` ayrı ticari lisans · ~34k★ · [TabbyML/tabby](https://github.com/TabbyML/tabby))*

> **Not:** **Roo Code** ve **Void** 2026'da arşivlendi (artık aktif bakımda değil); yerlerine sırasıyla **Cline / Kilo Code** ve **Cline / Continue** önerilir. Daha geniş bir "kendi makinende ajan" için **Goose** (Apache-2.0, ~49k★) de seçenektir; ancak tool-calling'e dayandığından zayıf yerel modellerde sohbet moduna düşer.

---

## 7. Örnek Kurulum Senaryoları

<p><img src="{{ '/papers/yerel-llm-rehberi/images/sema-7-senaryo.png' | relative_url }}" alt="Senaryo → donanım eşlemesi" width="420"/></p>
<sub><i>Şekil: Senaryo → donanım eşlemesi</i></sub>

**Senaryo A — Bireysel / gizlilik odaklı kullanıcı (giriş iş istasyonu).**
**RTX PRO 2000 (16 GB)** veya **RTX PRO 4000 (24 GB)** → **Ollama** veya **LM Studio** → 8B–14B bir model (ör. Qwen3 8B / Gemma 4 12B, Q4_K_M). İsterse arayüz olarak **Jan**. Düşük güç, sessiz, tam çevrimdışı. Kurulumla uğraşmak istemeyenler için OpenZeka'nın **kurulu ve test edilmiş hazır iş istasyonları** doğrudan kullanıma uygundur ([openzeka.com/is-istasyonlari](https://openzeka.com/is-istasyonlari/), bkz. 4.5/B).

**Senaryo B — Geliştirici (kod asistanı + entegrasyon).**
**RTX PRO 4500 (32 GB)** veya **RTX PRO 5000 (48 GB)** → kişisel kullanım için **Ollama/LM Studio**, çok istek/servis için **vLLM** veya **TensorRT-LLM** → bir kod modeli (Qwen3.6 / DeepSeek-Coder sınıfı). OpenAI uyumlu endpoint sayesinde IDE ve kendi araçlarına doğrudan bağlanır; kod asistanı/ajanı olarak **OpenCode / Aider / Cline / Continue** gibi açık kaynak araçlar yerel modele bağlanır (bkz. 6.G). Ubuntu + NVIDIA yığını kurulu **hazır iş istasyonu** ile günü kaybetmeden başlanabilir ([openzeka.com/is-istasyonlari](https://openzeka.com/is-istasyonlari/), bkz. 4.5/B).

**Senaryo C — KOBİ / kurum (belge tabanlı, çok kullanıcılı).**
Sunucu + **RTX PRO 6000 (96 GB)** ya da veri merkezi için **L40S / H100 NVL / H200 NVL** → arka uç **vLLM** veya **TensorRT-LLM**, üstüne ihtiyaca göre **OpenRAG-Local (CordatusAI) / AnythingLLM / RAGFlow** (şirket dokümanlarıyla RAG, çok kullanıcı, kaynak atıfları). Apache/MIT lisanslı bir model (Qwen/DeepSeek/GLM) ile ticari olarak güvenli.

**Senaryo D — Uçta / robotik / sahada (edge).**
**Jetson Orin Nano (8 GB)** küçük modeller için, **Jetson AGX Orin (64 GB)** veya **AGX Thor (128 GB)** uçta büyük model için → llama.cpp/Ollama → internet gerektirmeden, cihaz üstünde çıkarım. Gömülü ürün, robot ve saha uygulamaları için.

**Senaryo E — Kişisel "AI workspace" (ajan + hafıza + kişisel veri).**
Güçlü tek makine → **Odysseus** veya **Khoj** → e-posta triyajı, takvim, notlar, deep research ve kalıcı hafıza tek çatı altında; arka uç olarak yerel Ollama/vLLM/llama.cpp. Bu, "sadece sohbet"in ötesine geçmek isteyenler için.

**Senaryo F — Model özelleştirme (fine-tune).**
Kendi verinizle bir modeli uyarlamak için: 7B–13B LoRA/QLoRA → **1× RTX PRO 6000 (96 GB)** veya **1× H200**; 70B LoRA → **2–4× H200**, 70B QLoRA → **1× DGX Spark (128 GB)**. Tek bir DGX Spark ile 70B fine-tune (QLoRA) masaüstünde mümkündür; ekip büyüdükçe 2–3× ring ile ölçeklenir. Yazılım tarafında **Unsloth / LLaMA-Factory / Axolotl** (LoRA/QLoRA), büyük ölçekte **NeMo / DeepSpeed** kullanılır (bkz. 6.F); sonucu kendi değerlendirme setinizde doğrulayın (bkz. 5.9).

**Senaryo F2 — Derin alan adaptasyonu (full fine-tune).**
LoRA'nın yetersiz kaldığı derin alan adaptasyonu (ör. Türkçe sürekli ön-eğitim, tıp/hukuk uzman modeli) için: 70B full fine-tune → **4–8× H200** (ZeRO-3 ile), ~1 TB VRAM. Catastrophic forgetting riskine karşı düşük öğrenme oranı + alan verisi ile genel veriyi karıştırma şart (bkz. 4.2). Yazılım: **NeMo / Megatron-LM / DeepSpeed** (bkz. 6.F).

**Senaryo G — Büyük ölçek üretim / sıfırdan eğitim.**
Yüksek trafik (500+ eş zamanlı) inference veya pre-training (sıfırdan) → **8× B200 / B300 (HGX/DGX takımı)**, kurumsal ölçekte **DGX B300 "AI Factory"**. InfiniBand ağ, sunucu sınıfı soğutma ve TCO planlaması zorunludur (bkz. 4.9). Bakanlık/kurum ölçeğinde, veri tamamen kurum içinde kalacak şekilde on-prem kurulur.

---

## 8. Riskler ve Dikkat Edilmesi Gerekenler

- **Model kaynağının güvenilirliği.** Modelleri tanınır kaynaklardan (resmî Hugging Face kartları) indirin; rastgele depolardan değil.
- **Yerel ağ erişim kontrolü.** Ajan/araç erişimi olan workspace'ler (Odysseus, Hermes gibi) shell ve dosya erişimine sahip olabilir — bunları yönetici konsolu gibi koruyun: kimlik doğrulama açık, doğrudan internete açmayın, ters proxy + HTTPS kullanın.
- **Halüsinasyon ve doğruluk.** Yerel modeller de uydurabilir; kritik kullanımda RAG ile kaynak temellendirme (atıflı yanıtlar) ve insan denetimi şart.
- **Lisans uyumu.** Ticari kullanımda model lisansını (özellikle Llama ailesi ve türev Türkçe modeller) mutlaka doğrulayın.
- **Güncelleme ve sürdürülebilirlik.** Hem modeller hem araçlar hızla eskiyor; düzenli güncelleme ve bir bakım sahibi planlayın.

### Donanım belirlemede yaygın hatalar

- ✗ **Küçük GPU, yüksek beklenti:** 70B modeli tek bir L40S'de çalıştırmaya kalkmak.
- ✗ **Toplam VRAM'i eksik hesaplamak:** Ağırlık + KV cache + activation + overhead toplamını atlamak.
- ✗ **B200/B300'ü tekli sanmak:** Bunlar 8'li takım minimum satılır; bütçeyi buna göre planlayın.
- ✗ **Ağ darboğazı:** Multi-node'da InfiniBand/Ethernet bant genişliğini ihmal etmek.
- ✗ **Soğutma ihmali:** 8× B200 sunucusu ~15 kW+; soğutma kapasitesini kontrol edin.
- ✗ **TCO hesaplamamak:** Yalnızca GPU fiyatına bakıp elektrik/soğutma/bakımı atlamak.
- ✗ **Kuantizasyon kalitesini göz ardı:** INT4/INT8'in model doğruluğuna etkisini test etmeden kullanmak.
- ✗ **Disk/depolama hızını ihmal:** Model yükleme ve checkpoint için NVMe SSD şart; HDD yavaş kalır.
- ✗ **PCIe darboğazı:** Çoklu-GPU'da GPU–CPU bant genişliğini hesaba katmamak.
- ✗ **Ölçeklendirme planı yapmamak:** İlk alımda gelecekteki büyümeyi düşünmemek.
- ✗ **Yazılım yığını uyumsuzluğu:** CUDA/sürücü/framework versiyon uyumsuzluğu.
- ✗ **Yedeklilik planlamamak:** GPU arızasında hizmet kesintisi.

### Donanım belirleme süreci

<p><img src="{{ '/papers/yerel-llm-rehberi/images/sema-8-surec.png' | relative_url }}" alt="Donanım belirleme süreci" width="820"/></p>
<sub><i>Şekil: Donanım belirleme süreci</i></sub>

### Donanım belirleme kontrol listesi

- ☐ Kullanım senaryosu net mi? (Eğitim / Fine-tune / Inference)
- ☐ Hedef model boyutu ve ailesi belirlendi mi?
- ☐ Aday modeller kendi değerlendirme setinde test edildi mi? (kalite + TPS/TTFT + kuantizasyon kaybı — bkz. 5.9)
- ☐ Eş zamanlı kullanıcı sayısı tahmin edildi mi?
- ☐ Hizmet kalitesi hedefleri konuldu mu? (TTFT, TPS)
- ☐ VRAM ihtiyacı hesaplandı mı? (Ağırlık + KV cache + overhead)
- ☐ GPU kıyaslaması yapıldı mı? (VRAM, FLOPS, bant genişliği, satış birimi)
- ☐ B200/B300 için 8'li takım bütçesi uygun mu?
- ☐ Teknik şartname hazırlandı mı?
- ☐ TCO analizi yapıldı mı? (Donanım + elektrik + soğutma + bakım)
- ☐ Altyapı (güç, soğutma, ağ) kontrol edildi mi?
- ☐ Onay ve bütçe planlaması tamam mı?

---

## 9. Sonuç ve Öneriler

**Karar matrisi (özet):**

| Durumunuz | Öneri |
|---|---|
| Veri egemenliği / kamu / hassas veri | Yerel LLM neredeyse zorunlu; Apache/MIT model + on-prem sunucu |
| Yoğun ve sürekli kullanım | Yerel kurulum uzun vadede en düşük marjinal maliyet |
| Ara sıra / hafif kullanım | Giriş seviyesi kart veya mevcut iş istasyonu yeterli |
| Giriş iş istasyonu (düşük güç) | RTX PRO 2000 (16 GB) / PRO 4000 (24 GB) + Ollama + 8–14B Q4 model |
| 70B+ gerekiyor | RTX PRO 6000 (96 GB) / DGX Spark (128 GB) — RTX PRO 5000 (48 GB) yalnızca Q4 + kısa bağlamla sınırda |
| Uçta / robotik / saha | Jetson Orin Nano (8 GB) → AGX Orin (64 GB) → AGX Thor (128 GB) |
| Çok kullanıcılı üretim servisi | L40S / H100 NVL (94 GB) / H200 NVL (141 GB) + vLLM/TensorRT-LLM |
| Sadece sohbet | Ollama/LM Studio + (istenirse) Open WebUI |
| Ajan + kişisel veri + hafıza | Odysseus / Khoj / Hermes sınıfı AI workspace |
| Belge tabanlı Q&A | OpenRAG-Local (CordatusAI) / AnythingLLM / RAGFlow |

**Gelecek öngörüsü.** Üç eğilim net: (1) MoE mimarisi sayesinde küçük "aktif parametreli" modeller büyük model kalitesine hızla yaklaşıyor — yani aynı işlem maliyetiyle giderek daha iyi sonuç (bellek ihtiyacı yine toplam parametreye bağlı kalsa da); (2) açık ağırlık liderliği Çinli laboratuvarlara (Qwen, DeepSeek, GLM, Kimi) kaydı ve Apache/MIT lisanslarıyla ticari kullanım kolaylaştı; (3) yazılım katmanı "sohbet arayüzü"nden "AI workspace"e (ajan + hafıza + kişisel veri + donanım-farkında model seçimi) genişledi. Odysseus'taki Cookbook gibi araçlarla "model seçimi"nin kendisi bile otomatikleşmeye başladı.

**Kapanış önerisi.** Küçük başlayın: RTX PRO 2000/4000 gibi bir giriş kartıyla ya da mevcut makinenizde Ollama/LM Studio ile bir 8–14B model deneyin; ihtiyaç netleştikçe donanımı ve yazılım katmanını büyütün. Lisansı serbest (Apache/MIT) modellerle ilerleyin ki ticari yola geçişte sürpriz yaşamayın. Hangi donanımın ihtiyacınıza uygun olduğunu birlikte değerlendirmek için OpenZeka ekibiyle iletişime geçebilirsiniz.

---

## Sözlük (Terimler)

- **LLM (Büyük Dil Modeli):** Çok büyük metin verisiyle eğitilmiş, doğal dili anlayıp üreten model.
- **Inference (çıkarım):** Eğitilmiş bir modeli yalnızca çalıştırıp yanıt üretmek.
- **Fine-tuning (ince ayar):** Mevcut (ön-eğitilmiş) bir modeli kendi verinizle uyarlamak. **Full fine-tune** modelin tüm parametrelerini günceller (VRAM yüksek, catastrophic forgetting riski — bkz. 4.2); **LoRA/QLoRA** yalnızca küçük adapter katmanlarını eğitir (VRAM düşük, temel model korunur).
- **LoRA / QLoRA:** Tüm modeli değil, küçük ek katmanları eğiten verimli ince ayar yöntemleri; QLoRA ayrıca kuantize ederek belleği daha da düşürür.
- **VRAM:** Ekran kartı belleği; yerel LLM'de tek katı kısıt.
- **Token:** Modelin işlediği metin birimi (kabaca bir kelime parçası).
- **Bağlam (context):** Modelin aynı anda dikkate aldığı token penceresi.
- **KV cache:** Üretilen tokenların attention anahtar/değerlerinin bellekte tutulması; bağlam uzunluğu ve eşzamanlı istekle doğrusal büyür.
- **Kuantizasyon:** Ağırlıkları daha az bit'le saklayıp belleği düşürme (FP16 → Q8 → Q4).
- **GGUF:** llama.cpp/Ollama'nın yerelde en yaygın kuantizasyon dosya formatı.
- **Q4_K_M:** 4-bit kuantizasyon; kalitenin ~%92–95'ini korurken belleği ~4× düşürür.
- **FP16 / FP8 / INT4, MXFP4 / NVFP4:** Sayı hassasiyet formatları; bit düştükçe bellek/işlem azalır. Blackwell donanım-native FP4 destekler.
- **MoE (Mixture-of-Experts):** Toplam parametre büyük ama her adımda yalnızca küçük bir "aktif" kısım çalışır.
- **Aktif parametre:** MoE'de her token için fiilen kullanılan parametre sayısı; hız ve maliyet bunu izler.
- **Dense (yoğun) model:** Tüm parametrelerin her adımda kullanıldığı klasik mimari.
- **GQA (Grouped-Query Attention):** KV cache'i küçülterek bellek tüketimini azaltan attention yöntemi.
- **Prefill (prompt işleme):** Çıkarımın ilk aşaması; girdi tokenlarının tümü paralel işlenir, compute-bound.
- **Decode / otoregresif üretim:** Yanıtın token token, sıralı üretildiği aşama; tek istekte paralelleştirilemez, memory-bound; EOS tokenında veya azami token sınırında durur.
- **Spekülatif çözümleme (speculative decoding):** Küçük taslak modelin/başlığın önerdiği tokenları büyük modelin tek geçişte doğrulaması; decode'u 2–3× hızlandırır (ör. EAGLE-3, MTP).
- **Disaggregated prefill:** Prefill ve decode aşamalarını ayrı GPU havuzlarında çalıştırma; her aşama kendi darboğazına göre ölçeklenir.
- **TTFT (Time to First Token):** İlk token gecikmesi; compute-bound (FLOPS'a bağlı).
- **TPS (Token/saniye):** Üretim hızı; memory-bound (bellek bant genişliğine bağlı).
- **Throughput:** Birim zamanda işlenen toplam istek/token; batch büyüdükçe artar.
- **Batch:** Aynı anda işlenen istek grubu; throughput↑ ama gecikme↑.
- **Bellek bant genişliği:** GPU belleğinin okunma hızı (GB/s); TPS'i belirler.
- **FLOPS / TOPS:** Saniyedeki işlem kapasitesi; eğitim ve TTFT'yi etkiler.
- **TDP:** Kartın referans güç tüketimi (Watt).
- **Tensor / pipeline paralelliği:** Çoklu-GPU'da modeli kartlara bölmenin iki yöntemi.
- **RAG (Retrieval-Augmented Generation):** Kendi belgelerinizden ilgili parçaları getirip modele cevap ürettirme.
- **Embedding (gömme):** Metni anlamsal bir vektöre çeviren model; semantik arama ve RAG'in temeli.
- **Reranking:** Getirilen sonuçları alaka düzeyine göre yeniden sıralama.
- **Vektör veritabanı:** Embedding'leri saklayıp benzerlik araması yapan depo.
- **Ajan (agent):** Araç çağırıp çok adımlı görev yürüten LLM uygulaması.
- **MCP (Model Context Protocol):** Modeli dış araç ve veri kaynaklarına bağlayan açık standart.
- **Tool-calling / function-calling:** Modelin tanımlı araç/fonksiyonları çağırabilmesi.
- **Guardrail:** Girdi/çıktıyı denetleyen güvenlik/filtre katmanı.
- **Gateway / router:** Çok modelli/sunuculu kurulumun önündeki tek OpenAI-uyumlu erişim ve yönlendirme katmanı.
- **TCO (Toplam Sahip Olma Maliyeti):** Donanım + elektrik + soğutma + ağ + bakım + personelin toplamı.
- **Air-gapped (ağdan yalıtılmış / izole):** İnternete ve dış ağlara hiç bağlı olmayan, fiziksel olarak yalıtılmış gizli ağ.

---

## Kaynaklar

> Aşağıdaki rakamlar (TFLOPS, bellek bant genişliği, güç değerleri ve benchmark skorları) ilgili **resmî datasheet'ler, model kartları ve benchmark siteleri** üzerinden **Haziran 2026 itibarıyla** derlenmiştir; güncel değerler için birincil kaynaklara bakın. Yıldız sayıları yaklaşık ve değişkendir.

**Donanım (teknik özellikler, TDP):**
- NVIDIA veri merkezi GPU'ları (B200, B300, H100/H200, L4, L40S) ve DGX sistemleri — <https://www.nvidia.com/en-us/data-center/>
- NVIDIA RTX PRO Blackwell iş istasyonu GPU'ları — <https://www.nvidia.com/en-us/products/workstations/>
- NVIDIA Jetson (Orin, Thor) uç platformları — <https://developer.nvidia.com/embedded-computing>

**Çıkarım motorları & ölçüm:**
- vLLM <https://docs.vllm.ai> · TensorRT-LLM <https://github.com/NVIDIA/TensorRT-LLM> · SGLang <https://github.com/sgl-project/sglang>

**Fine-tune & eğitim çatıları:**
- Unsloth <https://github.com/unslothai/unsloth> · LLaMA-Factory <https://github.com/hiyouga/LLaMA-Factory> · Axolotl <https://github.com/axolotl-ai-cloud/axolotl> · HF TRL <https://github.com/huggingface/trl> · NVIDIA NeMo <https://github.com/NVIDIA-NeMo/NeMo> · DeepSpeed <https://github.com/deepspeedai/DeepSpeed>

**Kodlama asistanları & ajanları:**
- OpenCode <https://github.com/sst/opencode> · Aider <https://github.com/Aider-AI/aider> · Cline <https://github.com/cline/cline> · Continue <https://github.com/continuedev/continue> · OpenHands <https://github.com/All-Hands-AI/OpenHands> · Tabby <https://github.com/TabbyML/tabby>

**Model aileleri & lisanslar (model kartları, Hugging Face):**
- Qwen <https://huggingface.co/Qwen> · DeepSeek <https://huggingface.co/deepseek-ai> · Llama <https://huggingface.co/meta-llama> · Gemma <https://huggingface.co/google> · Mistral <https://huggingface.co/mistralai> · Phi <https://huggingface.co/microsoft>

**Karşılaştırma & benchmark:**
- Artificial Analysis <https://artificialanalysis.ai> · LMArena <https://lmarena.ai> · llm-stats.com <https://llm-stats.com> · SWE-bench <https://www.swebench.com>
- GPQA, AIME, MMLU-PRO, MATH-500 — ilgili akademik yayınlar (arXiv) ve Hugging Face veri kümeleri
- Türkçe ölçütler: **TurkishMMLU, Cetvel, TurkBench** — Hugging Face'teki ilgili veri kümeleri/depolar

**Yazılım depoları:** §6'da her araç için resmî GitHub/site bağlantısı (lisans · yaklaşık yıldız ile) verilmiştir.

**Araçlar:** Cordatus VRAM Calculator — <https://app.cordatus.ai/#/vram-calculator>

---

### Notlar

- **Donanım kapsamı:** Bu rehberdeki donanım önerileri OpenZeka kataloğuyla (RTX PRO Blackwell, veri merkezi GPU'ları, DGX, Jetson) sınırlıdır; tüketici GeForce kartlarına yer verilmemiştir. Fiyatlar teklif/proje usulü ve değişken olduğu için belirtilmemiştir — güncel fiyat ve stok için bizimle iletişime geçebilirsiniz.
- **Güncellik:** Bu alan hızla değişiyor; model sürümleri, sürüm numaraları ve benchmark sonuçları Haziran 2026 itibarıyla geçerlidir. Kalıcı olan, isimler değil bölümlerdeki karar mantığıdır.
- **OpenRAG-Local:** Bu rehberde belge-Q&A için öne çıkarılan OpenRAG, OpenZeka/Cordatus'un `langflow-ai/openrag`'tan fork'layıp tamamen yerel çalışacak şekilde uyarladığı ve açık kaynak olarak paylaştığı [CordatusAI/openrag-local](https://github.com/CordatusAI/openrag-local) katkısıdır.

---

<p><img src="{{ '/papers/yerel-llm-rehberi/images/openzeka-logo.png' | relative_url }}" alt="OpenZeka" width="220"/></p>

**Yerel LLM altyapınızı birlikte planlayalım.** Doğru donanım–model–yazılım eşleştirmesi, VRAM hesabı ve TCO analizi için OpenZeka ile iletişime geçin: [openzeka.com](https://openzeka.com) · VRAM hesaplama: [Cordatus VRAM Calculator](https://app.cordatus.ai/#/vram-calculator)
