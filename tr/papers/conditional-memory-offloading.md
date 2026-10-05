---
title: LLM Çıkarımında Engram Offloading
parent: White Papers
nav_order: 2
lang: tr
page_id: conditional-memory-offloading
date: 2026-09-29
card_tag: "Teknik Rehber"
description: >-
  Engram tabloları büyüktür, ancak her token için yalnızca birkaç satırı
  okunur; bu nedenle GPU belleğinden sistem RAM'ine veya NVMe'ye
  taşınabilirler. Bunun DGX Spark, RTX PRO 6000 ve DGX B300 için anlamı ve
  DeepSeek-V4.1-Flash ile Qwen3.8-Flash-Next ölçüm sonuçları.
permalink: /papers/conditional-memory-offloading/
last_modified_date: 2026-10-05
toc: true
---

> **Yayın tarihi:** Eylül 2026 (Ekim 2026'da güncellendi)
> **Kapsam:** Engram tablolarının ne olduğu, erişim biçimlerinin neden GPU belleği dışına taşınmalarına izin verdiği, DGX Spark, RTX PRO 6000 ve DGX B300 üzerinde nereye yerleştirilebilecekleri ve bu taşımanın (offloading) ne kazandırdığı. Değerlendirme, OpenZeka'nın DeepSeek-V4.1-Flash ve Qwen3.8-Flash-Next ölçümlerine dayanır.
> **Not:** Model adları, yazılım sürümleri ve ölçüm sonuçları Eylül 2026 itibarıyla geçerlidir. Çıkarım motorlarındaki taşıma desteği hızla değişmektedir; temel soru, her adımda ne kadar veriye ihtiyaç duyulduğu ve bu verinin ne zaman hazır olması gerektiğidir.

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## Yönetici Özeti

- **Yeni iki model çok büyük bir embedding tablosu içerir.** DeepSeek-V4.1-Flash (*Engram*) ve Qwen3.8-Flash-Next (*n-gram embedding*, SGLang'de PLE), kısa giriş token dizileriyle adreslenen, öğrenilmiş vektörlerden oluşan bir arama tablosu (lookup table) ekler; bu çalışmada ikisine de **Engram tablosu** denir. DeepSeek'in tablosu 196B, Qwen'inki 51B parametre içerir.
- **Tablo büyüktür, ancak koşullu olarak okunur.** Her token için yalnızca son token'larıyla eşleşen birkaç satır okunur: Qwen'de yaklaşık 2.5 KB, DeepSeek'te yaklaşık 12 KB. Tablonun geri kalanına dokunulmaz. DeepSeek'in Engram makalesi buna *conditional memory* der.
- **Taşımayı mümkün kılan bu erişim biçimidir.** Çok depolama alanı ama çok az bant genişliği gerektiren bir tablo, hesaplama GPU'da kalırken daha yavaş ve daha büyük bir bellek katmanına (sistem RAM'i veya NVMe) taşınabilir. Satır adresleri token ID'lerinden gelir; bu nedenle katman çalışmadan önce bilinir ve satırlar önceden getirilebilir. GPU belleği modelin geri kalanını tutar; böylece aynı cihaza daha büyük bir model sığar.
- **Tablonun nereye gideceğini cihazın bellek mimarisi belirler.** **DGX Spark**'ta (birleşik bellek) sistem RAM'i ile GPU belleği aynı havuzdur; bu nedenle tablo NVMe'ye gider. **RTX PRO 6000**'de (ayrı GPU belleği) tablo, PCIe üzerinden erişilen sabitlenmiş sistem RAM'ine gider. **DGX B300** üzerindeki dört GPU'lu DeepSeek yapılandırmasında ise tabloyu tutacak kadar GPU belleği bulunur.
- **Ölçülen sonuçlar:** 763B parametreli DeepSeek-V4.1-Flash'ın test edilen yapılandırması, Engram tabloları NVMe'ye yerleştirilerek 4× DGX Spark üzerinde çalışır. 8× DGX Spark üzerinde tabloların NVMe'ye taşınması, raporlanan KV cache tahsisini düğüm başına yaklaşık 21 GB artırmış ve yapılandırılan bağlam sınırını 300K'dan 1M token'a çıkarmıştır. 132.7 GB'lık kuantize checkpoint'e sahip Qwen3.8-Flash-Next ise tek DGX Spark ve tek RTX PRO 6000 üzerinde, aşağıda ele alınan eşzamanlılık seviyelerinde etkileşimli kullanıma uygun performansla çalışır.
- **Toplam sonuç:** Artificial Analysis Intelligence Index puanı 39.8 olan bir model, **tek DGX Spark üzerinde istek başına 28.5 token/s** hızla tahminen 8 sohbet veya 3 agentic kullanıcıya, **tek RTX PRO 6000 üzerinde 155.8 token/s** hızla tahminen 64 sohbet veya 24 agentic kullanıcıya hizmet verir ([LLM Çıkarım Benchmark Gezgini]({{ '/llm-inference-benchmarks/' | relative_url }}) tahminleri; Bölüm 6.2).
- **Boyutlandırmaya etkisi:** GPU bellek bütçesine kalan ağırlıkları, KV cache'i, tekrarlayan durumu ve çalışma zamanı arabelleklerini; sistem RAM'i veya NVMe bütçesine ise taşınan tabloyu ekleyin. Bu tasarımı daha fazla model benimserse, aynı cihaz yalnızca GPU belleğine bakıldığında beklenenden daha büyük modelleri çalıştırabilir.

---

## 1. Giriş

[Yerel LLM Kullanım Rehberi]({{ '/papers/local-llm-guide/' | relative_url }}), donanımı GPU belleğine göre boyutlandırır: model ağırlıkları, KV cache, tekrarlayan durum ve çalışma zamanı arabellekleri belleğe sığmalıdır. Bu bütçe tüm ağırlıkları aynı kabul eder. Engram tabloları bunun bir istisnasıdır: parametrelerin büyük bir bölümünü oluştururlar, ancak her token bunların yalnızca çok küçük bir kısmını okur. Bu tabloları GPU belleği dışında tutmak, aksi halde sığmayacak bir modeli aynı cihazda kullanılabilir hale getirebilir.

Bu çalışma önce bir LLM'in her token için hesapladıkları ile yalnızca tablodan aradıklarını karşılaştırır ve bunun bellek açısından anlamını açıklar (Bölüm 2); ardından tablonun her cihazda nereye yerleştirilebileceğini (Bölüm 3) ve OpenZeka'nın DGX Spark ile RTX PRO 6000 üzerindeki DeepSeek-V4.1-Flash ve Qwen3.8-Flash-Next ölçümlerinin ne gösterdiğini (Bölüm 4 ve 5) ele alır. Çalıştırma talimatları, bağlantıları verilen dağıtım raporlarında ve SGLang cookbook'ta bulunur.

---

## 2. Hesaplama ve Conditional Memory

### 2.1. Bir LLM her token için ne hesaplar ve bunun GPU belleğinden beklentisi nedir?

Bir LLM metni token token üretir. Her yeni token bir vektöre dönüştürülür ve modelin tüm katmanlarından geçirilir. Her katmanda:

- **Attention**, token'ı kendisinden önceki token'larla karşılaştırır. Geçmişi yeniden hesaplamamak için bu token'ların key ve value vektörleri **KV cache**'te tutulur; KV cache, bağlam uzunluğu ve eşzamanlı istek sayısıyla büyür.
- **İleri beslemeli ağ (feed-forward network)**, vektörü büyük, öğrenilmiş ağırlık matrisleriyle çarpar. Mixture-of-Experts (MoE) modellerinde bir yönlendirici (router), her token için birkaç uzman (expert) seçer ve yalnızca onların matrisleri kullanılır; ancak seçilen her uzman tümüyle kullanılır.

Dolayısıyla tek bir token üretmek, modelin tamamından geçmek demektir: her yoğun (dense) ağırlık matrisi, seçilen her uzman ve KV cache **her decode adımında** okunur. Bu yüzden hepsinin GPU belleğinde bulunması gerekir: bunları her adımda daha yavaş bir bağlantı üzerinden okumak, o bağlantıyı darboğaz haline getirir. Bellek ihtiyacı bu nedenle *ağırlıklar + KV cache + çalışma zamanı arabellekleri* kadardır; küçük batch boyutlarında decode hızı da kabaca *bellek bant genişliği ÷ token başına okunan bayt* kadardır.

| Veri | Token başına okunan | GPU dışına taşınırsa |
|---|---|---|
| **Yoğun ağırlıklar** | Her matris, her adımda | Aktarım bağlantısı darboğaz olur |
| **MoE uzmanları** | Seçilen uzmanlar, tümüyle; seçim ancak ileri yayılım sırasında belli olur | Etkin küme küçüktür, ancak önbellekte bulunmama maliyeti yüksektir ve seçim geç belli olur |
| **KV cache ve tekrarlayan durum** | Her decode adımında okunur (tekrarlayan durum ayrıca güncellenir); KV trafiği bağlamla büyür | Uzun bağlamlar yoğun aktarım trafiği oluşturur |
| **Engram tabloları** | Token ID'lerinden adreslenen birkaç satır | Önceden getirilebilen küçük aktarımlar |

Son satır, bu çalışmanın konusu olan istisnadır.

### 2.2. "Conditional" ne anlama gelir ve bellek ihtiyacını nasıl değiştirir?

**Embedding tablosu**, bir anahtarı öğrenilmiş bir vektörle eşler. Standart giriş embedding'i her token ID'sini tek bir satırla eşler. Engram tablosu aynısını kısa token dizileri (**n-gram**'lar) için yapar. DeepSeek bu yapıyı [Engram makalesinde](https://arxiv.org/abs/2601.07372) *Engram* adıyla tanıtmıştır; Qwen kendi sürümüne n-gram embedding der, SGLang ise tabloya PLE der. Bu çalışmada ikisine de **Engram tablosu** denir.

**Engram'ın modele katkısı.** Dilin büyük bölümü sabit, yerel kalıplardan oluşur: adlar, kalıplaşmış ifadeler, sık geçen kelime öbekleri. Standart bir Transformer'da bunlar için bir arama işlemi yoktur; model bu kalıpları her token için ilk katmanlarında hesaplama yoluyla yeniden oluşturur. Engram bu kalıpları öğrenilmiş bir tabloda saklar ve arama yoluyla getirir. Engram makalesi, bunun ağın derinliğinin daha büyük bir kısmını akıl yürütmeye bıraktığını savunur ve yöntemi MoE'yi tamamlayan bir seyreklik (sparsity) ekseni olarak sunar: MoE *conditional computation*'dır (yalnızca bazı uzmanlar çalışır), Engram ise *conditional memory*'dir (yalnızca bazı satırlar okunur).

Dolayısıyla *conditional* (koşullu), bir satırın yalnızca giriş onu gerektirdiğinde okunması anlamına gelir. Tablonun tamamı büyüktür, ancak bir token yalnızca son token'larıyla eşleşen birkaç satırı okur; geri kalanına dokunulmaz. Tablo hesaplamada kullanılmaz, yalnızca içinde arama yapılır.

Bu, bellek ihtiyacını ikiye ayırır:

- **Her token için hesaplamada kullanılanlar** (ağırlıklar, KV cache) **hem kapasite hem bant genişliği** gerektirir; bu nedenle GPU belleğinde olmalıdır.
- **Yalnızca koşullu olarak aranan** (Engram tablosu) **kapasite gerektirir, ancak neredeyse hiç bant genişliği gerektirmez**; bu nedenle sistem RAM'i veya NVMe gibi daha yavaş ve daha büyük bir bellek katmanına taşınabilir.

| Özellik | Anlamı | Sonucu |
|---|---|---|
| **Büyük depolama alanı** | Onlarca ile yüzlerce milyar parametre | GPU belleğinde tutulursa önemli bir pay kaplar |
| **Seyrek, koşullu erişim** | Onlarca veya yüzlerce GB'lık tablodan token başına birkaç kilobayt | Daha yavaş bir bellek katmanı yeterince hızlıdır |
| **Adreslerin erken bilinmesi** | Satırlar modelin hesaplamasından değil, token ID'lerinden seçilir | Satırlar önceki katmanlar çalışırken getirilebilir |

Böylece GPU belleğinin yalnızca modelin hesaplamada kullanılan kısmını tutması yeterli olur ve aynı cihaza daha büyük bir model sığar. Ölçek vermek gerekirse: Qwen3.8-Flash-Next her decode adımında gigabaytlarca etkin ağırlık okurken tablosundan yalnızca 2.5 KB okur.

### 2.3. Tablodan arama nasıl yapılır?

1. **Anahtarı oluşturma.** Son token ID'leri alınır: bigram için iki, trigram için üç token. Örneğin `[a, b, c]` ID'lerinden `[b, c]` ve `[a, b, c]` son ekleri elde edilir.
2. **Hash ile satır adresini belirleme.** Her hash fonksiyonu (hash head) bu diziyi bir satır adresine dönüştürür. Birden fazla hash fonksiyonu birden fazla vektör verir; bu nedenle birindeki çakışmanın etkisi küçüktür. Tüm satırları taramak gerekmez.
3. **Satırları getirme.** Adreslenen satırlar okunur ve birleştirilir. Tablo değişmeyen, öğrenilmiş veridir; konuşma önbelleği veya belge veritabanı değildir.
4. **GPU'da birleştirme.** Projeksiyonlar getirilen vektörü dönüştürür; mevcut gizli durumdan (hidden state) hesaplanan bir kapı (gate), vektörün katkısının ne kadar olacağını belirler. GPU yalnızca bu adım için gereklidir; tablonun kendisi başka bir yerde durabilir.

Qwen'in [n-gram embedding tasarımı](https://arxiv.org/html/2608.30320#S2.SS3), [Engram mimarisiyle](https://arxiv.org/html/2601.07372v2#S2) aynı yaklaşımı izler.

| | Qwen3.8-Flash-Next | DeepSeek-V4.1-Flash |
|---|---|---|
| Tablo boyutu | ~51.2 GB (47.7 GiB), FP8 | ~196.6 GB, FP8 |
| Token başına okunan satır | 16 (2 n-gram derecesi × 8 hash fonksiyonu, tek katman) | 48 (3 n-gram derecesi × 8 hash fonksiyonu, iki katman) |
| Token başına okunan bayt | 16 × 160 B ≈ **2.5 KB** | 48 × 256 B ≈ **12 KB** |

Tabloya satır eklemek, token başına okunan veriyi artırmadan parametre ekler.

**Önceden getirme neden işe yarar?** Satır adresleri yalnızca token ID'lerine bağlıdır ve bunlar ileri yayılımdan önce bilinir: prefill sırasında prompt'un tamamı, decode sırasında ise mevcut token. Tablonun ilk katmanlardan sonra yer alması (Qwen'de sıfırdan sayıldığında 2. katman, DeepSeek'te 1. ve 14. katmanlar), veriyi getirme işlemine hesaplamayla örtüşecek zaman tanır. Bu işlemin zamanında bitip bitmeyeceği motora ve bellek katmanına bağlıdır.

---

## 3. Tablo Nereye Taşınabilir?

Taşınan bir veriyi okumanın maliyeti kabaca **veri miktarı ÷ bağlantı bant genişliği** artı gecikme ve yazılım ek yüküdür; modeli yalnızca hesaplamanın arkasına gizlenemeyen kısım yavaşlatır. Token başına 2.5–12 KB ile PCIe Gen5 x16 bile (teorik olarak her yönde yaklaşık 64 GB/s) bir token'ın satırlarını bir mikrosaniyenin çok altında taşır. Küçük ve dağınık okumalarda gecikme ve önbellekleme en yüksek bant genişliğinden daha belirleyicidir; dosya tabanlı tablolarda ise sayfanın önbellekte olup olmadığı da önemlidir.

GPU belleğinde gerçekten hangi hedefin yer açacağını bellek mimarisi belirler:

- **Ayrı GPU belleği (RTX PRO 6000, DGX B300).** CPU'nun PCIe üzerinden erişilen ayrı bir sistem RAM'i vardır. Tabloyu oraya taşımak GPU belleğinde yer açar. Burada kullanılan uygulama tabloyu GPU'nun doğrudan okuyabildiği **sabitlenmiş (pinned, page-locked) sistem belleğinde** tutar.
- **Birleşik bellek (DGX Spark).** GB10'daki CPU ve GPU, 128 GB'lık tek bir LPDDR5X havuzunu paylaşır. Ayrı bir sistem RAM'i yoktur; bu nedenle tabloyu sabitlenmiş olsun ya da olmasın "sistem belleğine" koymak, yine aynı 128 GB'ı kullanır. Yer açmanın tek yolu tabloyu bellekten tamamen çıkarıp yerel NVMe'ye taşımaktır. GPU, belleğe eşlenmiş dosyayı işletim sisteminin sayfa tabloları üzerinden okur; son kullanılan sayfalar ortak havuzda önbellekte kalır.

| | DGX Spark (GB10) | RTX PRO 6000 Blackwell | DGX B300 |
|---|---|---|---|
| Bellek mimarisi | CPU ve GPU'nun paylaştığı 128 GB havuz | 96 GB ayrı GPU belleği, ayrı sistem RAM'i | Her biri kendi HBM belleğine sahip sekiz GPU, ayrı sistem RAM'i |
| GPU bellek bant genişliği | 273 GB/s | 1.79 TB/s | GPU başına 8 TB/s |
| Tablonun konumu | Yerel NVMe, RAM'de sayfa önbelleğiyle | PCIe üzerinden sabitlenmiş sistem RAM'i | Dört GPU'lu DeepSeek yapılandırmasında GPU belleği |
| Boyutlandırmaya etkisi | Ortak havuzda işletim sistemi, sayfa önbelleği ve çalışma zamanı için pay ayrılmalı | Sistem RAM'i GPU belleğinden ayrı bütçelenmeli | Çok GPU'lu yapılandırmalarda bu checkpoint'ler için yeterli GPU belleği bulunur |

**Mekanizmanın çalıştığına dair kanıt.** Engram makalesindeki H800 deneyinde, 4B ve 8B yoğun omurga modellere sistem belleğinde tutulan 100B parametreli bir tablo eklenmesi, veri getirme ilk blokla örtüştürülerek verimi yalnızca yaklaşık %1.9 ve %2.8 düşürmüştür ([Engram, §6.4](https://arxiv.org/html/2601.07372v2#S6.SS4)). Taşıma, tablonun değerlerini değiştirmez: GPU'ya aynı satırlar gelir, dolayısıyla model aynı sonucu hesaplar. Tek soru, satırların zamanında gelip gelmediğidir.

---

## 4. İncelenen Modeller

### 4.1. DeepSeek-V4.1-Flash

| Özellik | Değer |
|---|---|
| Toplam parametre | 763B |
| — omurga | 552B |
| — Engram embedding tabloları | 196B |
| — görüntü kodlayıcı, projeksiyon katmanı, taslak model | ~15B |
| Token başına etkin parametre | Decode'da ~16B (prefill'de ~8B) |
| Attention | 128 token'lık kayan pencereli, sıkıştırılmış seyrek attention; katmanlar arasında paylaşılan KV cache |
| Engram | Katman indeksleri 1 ve 14 (sıfırdan başlayarak); bigram, trigram ve 4-gram; her n-gram uzunluğu için 8 hash fonksiyonu; satır başına 256 değer |
| Azami bağlam uzunluğu | 1,048,576 token (yaklaşık 1M) |
| Checkpoint boyutu | 510.3 GB; FP8 yoğun ve Engram ağırlıkları ile FP4 uzmanlardan oluşan karma hassasiyet |

[Model kartı](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash), 552B'lik omurgayı Engram'dan ve yardımcı modüllerden ayrı belirtir.

### 4.2. Qwen3.8-Flash-Next

| Özellik | Değer |
|---|---|
| Parametreler | 125B temel model + 51B n-gram embedding + 4B çoklu token tahmini (MTP) modülü |
| Token başına etkin parametre | 6B |
| Attention | 36 Gated DeltaNet ve 12 Qwen Sparse Attention (QSA) katmanı; QSA, en fazla 512 adet dört token'lık blok ile sondaki tamamlanmamış bloğu seçer |
| N-gram tablosu | Katman indeksi 2 (sıfırdan başlayarak); bigram ve trigram için sekizer hash fonksiyonu; 160 değerlik 16 satırdan oluşan 2,560 boyutlu vektör |
| Yapılandırılan bağlam sınırı | 262,144 token |
| Kullanılan checkpoint | `nvidia/Qwen3.8-Flash-Next-NVFP4`; 132.7 GB (123.6 GiB) safetensors dosyası |
| Ağırlık hassasiyeti | Ana modelde NVFP4 yönlendirilen uzmanlar; BF16 attention ve paylaşılan uzmanlar; FP8 MTP uzmanları ve n-gram tablosu |

### 4.3. Model boyutu ve bellek ihtiyacı

| Model | Checkpoint boyutu | Embedding tablosu | Checkpoint'in kalanı | Bu çalışmada tablonun taşınmasını gerektiren yapılandırmalar |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 510.3 GB | ~196.6 GB | ~313.7 GB | 4× DGX Spark |
| Qwen3.8-Flash-Next, NVIDIA NVFP4 | 132.7 GB | ~51.2 GB (47.7 GiB) | ~81.5 GB | 1× DGX Spark; 1× RTX PRO 6000 |

GB 10⁹ bayt, GiB ise 2³⁰ bayt anlamına gelir. Checkpoint boyutları, kayıtlı revizyonlardaki safetensors dosyalarının toplamıdır (Qwen için [NVIDIA checkpoint dosyaları](https://huggingface.co/nvidia/Qwen3.8-Flash-Next-NVFP4/tree/fc694b54fb0174e0913e6adf86691ef85a4ead47)). Kalan boyut bir çıkarma işlemidir, yükleme sonrasındaki GPU bellek kullanımının ölçümü değildir; çalışma zamanı bellek değerleri Bölüm 5'te verilmiştir.

Taşıma, tabloyu başka bir bellek katmanına yerleştirir; tablo modelin parçası olmaya devam eder. Böylece daha küçük yapılandırmalar, kalan ağırlıkları çıkarım için gereken bellekle birlikte tutabilir.

---

## 5. Benchmark Sonuçları

### 5.1. Metodoloji

Aşağıdaki dağıtım sonuçları, açık kaynaklı [CordatusAI LLM Benchmark Tool](https://github.com/CordatusAI/llm-benchmark) ile yapılan OpenZeka ölçümleridir. Yaklaşık 128 giriş token'ı ve 128 token'lık çıktı sınırı kullanılmış, her eşzamanlılık seviyesi on tur çalıştırılmış ve ortalama değerler raporlanmıştır. **Eşzamanlılık (C)**, aynı anda gönderilen istek sayısıdır. **TTFT (ilk token'a kadar geçen süre)**, kuyrukta bekleme ve prompt işleme süresini içerir; akış olarak gönderilen ilk akıl yürütme (reasoning) token'ı da sayılır. **TPS (saniyedeki token sayısı)**, çıktı token sayısının TTFT dahil toplam istek süresine bölünmesidir ve toplam verim olarak değil, istek başına raporlanır. Tüm sonuçlara [LLM Çıkarım Benchmark Gezgini]({{ '/llm-inference-benchmarks/' | relative_url }}) üzerinden de erişilebilir.

| Çalıştırma | Donanım | Motor, tensör paralelliği (TP) | Spekülatif kod çözme | Tablonun konumu |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 4× DGX Spark | vLLM, TP=4 | DSpark, k=5 | NVMe |
| DeepSeek-V4.1-Flash, 300K | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | Bellekte |
| DeepSeek-V4.1-Flash, 1M | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | NVMe |
| Qwen3.8-Flash-Next | 1× DGX Spark | SGLang, TP=1 | MTP, 3 spekülatif adım / 4 taslak token | NVMe |
| Qwen3.8-Flash-Next | 1× RTX PRO 6000 | SGLang, TP=1 | MTP, 3 spekülatif adım / 4 taslak token | Sabitlenmiş sistem RAM'i |

**İki 8× DGX Spark DeepSeek yapılandırması**, aynı donanımda tablonun farklı yerleşimlerini karşılaştırır. Diğer çalıştırmalar farklı bir boyutlandırma sorusunu yanıtlar: model taşıma sayesinde sığdıktan sonra yapılandırma nasıl bir çıkarım performansı sunar? Bunların sonuçları aşağıda ayrı ayrı değerlendirilmiştir.

### 5.2. 4× DGX Spark üzerinde DeepSeek-V4.1-Flash: Engram-on-disk ile modeli sığdırmak

510 GB'lık checkpoint dört düğüme bölündüğünde düğüm başına yaklaşık 128 GB gerekir. İşletim sistemi, CUDA bağlamı ve KV cache hesaba katıldığında bu, bir DGX Spark'ın modele ayırabileceğinden fazladır. **Engram-on-disk** ile her düğüm, Engram satırlarından kendi payını yerel NVMe'de tutar ve her adımın ihtiyaç duyduğu satırları ileri yayılımdan önce GPU belleğine hazırlar. Böylece kalan ağırlıklar yüklenebilir. Benchmark sonuçları şöyledir:

| Eşzamanlılık (C) | TTFT (ms) | İstek başına TPS (token/s) |
|---|---|---|
| 1 | 271.6 | 29.5 |
| 2 | 395.8 | 21.3 |
| 4 | 577.4 | 13.1 |
| 8 | 805.9 | 8.8 |

**Bu sonuç neden değerlidir?** 763B parametreli model, dört masaüstü cihazında **C=1'de istek başına 29.5 token/s ve 272 ms TTFT** ile çalışır. C=2'de **21.3 token/s ve 396 ms TTFT** ile Gezgin'in en az 20 token/s ve en fazla 1,000 ms TTFT olan varsayılan hedeflerini karşılar. Daha yüksek eşzamanlılık da mümkündür, ancak yanıtlar yavaşlar: C=4'te 13.1 token/s, C=8'de 8.8 token/s ölçülmüştür. Bu iş yükünde yapılandırma, düşük eşzamanlılıkta etkileşimli kullanımı destekler.

### 5.3. 8× DGX Spark üzerinde DeepSeek-V4.1-Flash: tablo bellekte ve NVMe'de

Sekiz düğümde checkpoint her iki yerleşimde de sığar; bu da iki dağıtım yapılandırmasının karşılaştırılmasını mümkün kılar. DGX Spark'ta tabloyu "sistem belleğinde" tutmak da ortak 128 GB havuzu kullanır. Tabloyu NVMe'ye taşımak, önbellekteki sayfalar ve ara arabellekler dışında bu kullanımı ortadan kaldırır.

| Ölçüt | Engram bellekte | Engram NVMe'de |
|---|---|---|
| Düğüm başına Engram belleği (raporlanan) | 23.6 GB | Yalnızca gerekli satırlar ve ara arabellekler |
| Düğüm başına KV cache tahsisi (raporlanan) | ~8.7 GB | ~30 GB |
| Yapılandırılan bağlam sınırı | 300K token | **1M token** |
| C=1'de TTFT | 213 ms | 199 ms |
| C=1 / C=8'de istek başına TPS (token/s) | 36.0 / 13.6 | 33.3 / 11.7 |

**Pratik denge:** disk yapılandırması, **C=1'de 33.3 token/s** ve **C=8'de istek başına 11.7 token/s** sağlarken düğüm başına raporlanan KV cache tahsisini yaklaşık **21 GB artırır**. Bellekteki yapılandırmaya göre TPS sırasıyla %7.5 ve %14 daha düşüktür. Tabloyu bellekte tutan yapılandırmanın ölçülen TPS'i daha yüksek, disk yapılandırmasının KV cache'e ayırdığı bellek ise daha fazladır.

Bu, iki dağıtım yapılandırmasının bütün olarak karşılaştırmasıdır: bağlam sınırları, bellek ayarları ve yürütme yolları da farklıdır ([8× raporuna]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/' | relative_url }}) bakınız). Yapılandırılan bağlam sınırı 300K'dan 1M token'a çıkar. Benchmark kısa prompt'larla yapılmıştır; azami bağlam uzunluğu test edilmemiştir.

### 5.4. Tek DGX Spark üzerinde Qwen3.8-Flash-Next: 132.7 GB'lık checkpoint'i sığdırmak

**132.7 GB'lık NVIDIA NVFP4 checkpoint**, işletim sistemi, KV cache ve çalışma zamanı arabellekleriyle birlikte tek bir Spark'ın belleğinde bütünüyle tutulamaz. **47.7 GiB'lık FP8 n-gram tablosunu** yerel NVMe'de belleğe eşlenmiş bir dosyada tutmak, kalan ağırlıkların birleşik bellekte kalmasını sağlar.

GPU, belleğe eşlenmiş tabloya CPU'nun sayfa tabloları üzerinden erişir. Son erişilen dosya sayfaları birleşik bellekte kalır; bu uygulamada sayfa önbelleği için 8 GiB'lık bir bütçe ayrılır. Yapılandırma, KV cache ve tekrarlayan durum havuzlarına yaklaşık 12–18 GB bırakır ve aynı anda çalışan istek sayısını sekizle sınırlar.

| Eşzamanlılık (C) | TTFT (ms) | İstek başına TPS (token/s) |
|---|---|---|
| 1 | 301.9 | 28.5 |
| 2 | 392.7 | 23.6 |
| 4 | 566.0 | 17.1 |
| 8 | 762.6 | 11.8 |

**Bu sonuç neden değerlidir?** Model, tek bir masaüstü cihazında **C=1'de 28.5 token/s ve 302 ms TTFT** ile çalışır. C=2'de **istek başına 23.6 token/s ve 393 ms TTFT** ile Gezgin'in varsayılan hedeflerini karşılar. C=4'te istek başına **17.1 token/s**, C=8'de 11.8 token/s elde edilir. Ortalama TTFT, test edilen her seviyede bir saniyenin altında kalır. Ölçümler, düşük eşzamanlılıkta etkileşimli yerel çıkarımı destekler.

Başlangıç süresi işletim açısından dikkate alınmalıdır: bu uygulama her açılışta tablo dosyasını yeniden yazar. Bu işlem yeni bir dosyayla yaklaşık 10 dakika, önceki dolu dosya yerinde bırakıldığında ise 55 dakika sürer. Çalışan servis yukarıdaki yanıt hızlarını sağlasa da yeniden başlatmalarda bu süre önemlidir.

### 5.5. Tek RTX PRO 6000 üzerinde Qwen3.8-Flash-Next: tabloyu sistem RAM'ine taşıyarak modeli sığdırmak

Aynı **132.7 GB'lık NVFP4 checkpoint**, kartın **96 GB'lık GPU belleğini** aşar. Sabitlenmiş bellek uygulaması, 47.7 GiB'lık FP8 tabloyu ayrı sistem RAM'ine yerleştirerek kalan model ağırlıklarının GPU'ya sığmasını sağlar. Sabitlenmiş tahsis ve pay için sistemde en az 64 GB boş RAM gerekir; istenen satırlar GPU'ya PCIe üzerinden ulaşır.

Cookbook, KV cache ve tekrarlayan durum havuzlarına **8.3 GiB** ayrıldığını bildirir. Test edilen yapılandırma, BF16 tekrarlayan durum ve değiştirilmiş bir önbellek politikasıyla aynı anda 16 çalışan isteğe izin verir.

| Eşzamanlılık (C) | TTFT (ms) | İstek başına TPS (token/s) |
|---|---|---|
| 1 | 139.2 | 155.8 |
| 2 | 195.8 | 120.0 |
| 4 | 220.6 | 90.8 |
| 8 | 252.3 | 63.7 |
| 16 | 257.2 | 43.2 |
| 32 | 3,222.7 | 22.2 |

**Bu sonuç neden değerlidir?** Yapılandırma **C=1'de 155.8 token/s**, **C=16'da istek başına 43.2 token/s** sağlar ve bu aralığın tamamında ortalama TTFT 260 ms'nin altında kalır. Checkpoint'in tamamı kartın belleğini aşmasına rağmen C=16'ya kadar test edilen tüm seviyeler Gezgin'in varsayılan gecikme ve TPS hedeflerini karşılar. C=32'de istekler çalışan 16 isteğin arkasında kuyruğa girer ve ortalama TTFT üç saniyeyi aşar; TPS 20 token/s'nin üzerinde kalsa da C=32 varsayılan TTFT hedefini karşılamaz.

Bu gözlemler ölçülen kısa prompt iş yükü için geçerlidir. Daha uzun prompt'lar, çıktılar ve konuşma geçmişleri, uygulamanın gecikme hedeflerine göre ayrıca değerlendirilmelidir.

---

## 6. Değerlendirme

### 6.1. Model zaten sığıyorsa: bellek mi, NVMe mi?

8× Spark DeepSeek karşılaştırması, belleğin nasıl paylaştırılacağına karar verirken yararlıdır. İki yapılandırma aynı modeli aynı donanımda çalıştırır: Engram'ı bellekte tutmak ölçülen TPS'i yükseltir, diske taşımak ise KV cache için daha fazla bellek bırakır. Tercih, ek KV cache kapasitesinin uygulama için gözlenen hız farkına değip değmediğine bağlıdır. Gezgin'de bellek içi yapılandırma Max C = 4'e (tahminen 16 sohbet veya 6 agentic kullanıcı), disk yapılandırması ise Max C = 2'ye (8 sohbet veya 3 agentic kullanıcı) ulaşır. Kısa prompt'lu benchmark, disk yapılandırmasının ek KV cache'ini kullanmaz; bu kapasite uzun bağlamlarda önem kazanır.

### 6.2. Taşımanın mümkün kıldığı: yetenek, hız ve kapasite

Zincir kısadır. Engram tablosu GPU belleğinden çıkar, modelin geri kalanı sığar ve cihaz, aksi halde tutamayacağı bir modeli çalıştırır. [LLM Çıkarım Benchmark Gezgini]({{ '/llm-inference-benchmarks/' | relative_url }}) sonucu planlama diline çevirir:

| Model (Intelligence Index) | Cihaz | Neden sığar? | C=1'de istek başına TPS | Max C | Tahmini sohbet kullanıcısı | Tahmini agentic kullanıcı |
|---|---|---|---|---|---|---|
| DeepSeek-V4.1-Flash (39.5) | 4× DGX Spark | ~196.6 GB Engram tablosu NVMe'de; 510.3 GB'lık checkpoint'in geri kalanı 128 GB'lık dört düğüme bölünür | 29.5 token/s | 2 | 8 | 3 |
| Qwen3.8-Flash-Next (39.8) | 1× DGX Spark | 51.2 GB'lık tablo NVMe'de; 132.7 GB'lık checkpoint'in geri kalanı 128 GB'lık havuza sığar | 28.5 token/s | 2 | 8 | 3 |
| Qwen3.8-Flash-Next (39.8) | 1× RTX PRO 6000 | 51.2 GB'lık tablo sistem RAM'inde; 132.7 GB'lık checkpoint'in geri kalanı 96 GB'lık karta sığar | 155.8 token/s | 16 | 64 | 24 |

Başka bir deyişle: Engram tablosu taşınabildiği için Artificial Analysis Intelligence Index puanı 39.8 olan bir model, **tek bir DGX Spark üzerinde 28.5 token/s** hızla çalışır; bu, tahminen **8 sohbet kullanıcısına veya 3 agentic kullanıcıya** yeter. **Tek bir RTX PRO 6000** üzerinde aynı model **155.8 token/s** hızla çalışır ve tahminen **64 sohbet kullanıcısına veya 24 agentic kullanıcıya** ulaşır. Puanı 39.5 olan 763B parametreli bir model ise **dört DGX Spark** üzerinde tahminen 8 sohbet veya 3 agentic kullanıcıya hizmet verir.

Bu değerler şöyle okunmalıdır:

- **Max C**, Gezgin'in varsayılan hedeflerini karşılayan en yüksek test edilmiş eşzamanlılıktır: istek başına en az 20 token/s ve en fazla 1,000 ms ortalama TTFT.
- **Kullanıcı sayıları ölçüm değil, tahmindir.** Gezgin, Max C'yi varsayılan bir kullanım çarpanıyla çarpar: sohbet kullanıcıları için ×4, çünkü zamanlarının çoğunu okuyup yazarak geçirirler (bir isteğin çalıştığı süre zamanın yaklaşık dörtte biridir); agentic kullanıcılar için ×1.5, çünkü art arda yapılan çağrılar bir isteği zamanın yaklaşık üçte ikisinde çalışır halde tutar.
- **Bu kapasiteler yalnızca hızdan hesaplanır.** Gezgin'in bellek sınırı tüm checkpoint'in GPU belleğinde durduğunu varsayar; taşıma tam da bunu önlediği için bu çalıştırmalarda bellek sınırı hesaplanmaz. Dağıtımların kendi istek sınırları (DGX Spark'ta 8, RTX PRO 6000'de 16 çalışan istek) Max C'ye eşit veya ondan büyüktür; dolayısıyla bellek tahmini düşürmez.
- **İş yükü kısaydı:** yaklaşık 128 giriş ve 128 çıkış token'ı. Daha uzun prompt'lar ve konuşma geçmişleri TTFT'yi artırır ve kapasiteyi düşürür.

*Intelligence Index v4.3, [Artificial Analysis](https://artificialanalysis.ai) tarafından yayımlanmıştır. Veri 28 Eylül 2026'da alınmış ve kaynak gösterilerek kullanılmıştır.* Puan modeli tanımlar; kuantize dağıtımın belirli bir görevdeki başarısını doğrulamaz. Kullanılan checkpoint'i hedef görevler üzerinde de değerlendirin.

### 6.3. İşletim gereksinimleri

Aşağıdaki gereksinimler, indirilen checkpoint'in depolanmasına ek olarak değerlendirilmelidir:

| Gereksinim | DeepSeek-V4.1-Flash, DGX Spark | Qwen3.8-Flash-Next, DGX Spark | Qwen3.8-Flash-Next, RTX PRO 6000 |
|---|---|---|---|
| Taşıma için ek depolama | Her düğümün NVMe'sinde Engram tabloları | Tablo için ~51.2 GB (47.7 GiB), ayrıca yükleme için boş alan | Checkpoint dosyaları dışında gerekmez |
| Sistem belleği | Ortak havuzda ara arabellekler | Ortak havuzda sayfa önbelleği | Sabitlenmiş tahsis ve pay için ≥64 GB boş RAM |
| Başlangıç | Yamalı yükleyici tabloları NVMe'de hazırlar | Tablo dosyası her başlangıçta yazılır (10–55 dk) | Tablo RAM'e yüklenir |
| Yazılım desteği | GB10 için Engram-on-disk yolu dahil gerekli topluluk yamaları | Dosya tabanlı taşıma için uyumlu SGLang sürümü gerekir | SGLang cookbook imajında desteklenir |

---

## 7. Engram Tablolarıyla Boyutlandırma

### 7.1. Güncellenmiş bellek bütçesi

Engram tablosu içeren desteklenen modellerde GPU belleğini ve tablonun taşındığı hedefi ayrı bütçeleyin:

> **Gerekli GPU belleği (veya birleşik bellek) = Kalan model ağırlıkları + KV cache + Tekrarlayan durum havuzları + Aktivasyonlar + Taşıma arabellekleri ve önbellekteki sayfalar + Çalışma zamanı ek yükü**
>
> **Ek sistem RAM'i veya NVMe alanı = Taşınan tablolar + Yükleme arabellekleri / boş alan payı**

Spark'ta işletim sistemi de birleşik belleği kullanır ve önbellekteki dosya sayfaları bu ortak bütçeye dahil edilmelidir. Ayrı GPU belleği olan sistemlerde sabitlenmiş tablolar ayrı sistem RAM'inde yer kaplar. Dolayısıyla tablonun boşalttığı alan, istek kapasitesine bire bir yansımaz.

Yerel LLM Kullanım Rehberi'ndeki ek bellek payı önerisini planlama için başlangıç noktası olarak kullanın; ardından motorun gerçek tahsisini ve en yüksek kullanımını kontrol edin. Yapılandırılan bellek kullanım oranı, checkpoint boyutuna genel bir yüzde eklemekle aynı şey değildir.

### 7.2. Boyutlandırma kontrol listesi

- ☐ Kullanılan checkpoint'in kalan model ağırlıklarını ve Engram tablolarını, hassasiyetleriyle birlikte ayrı ayrı belirleyin.
- ☐ Motorun modeli ve hedefi desteklediğini doğrulayın: burada incelenen yapılandırmalarda sabitlenmiş sistem RAM'i veya dosya tabanlı depolama.
- ☐ Taşınan tablonun yanında bellekte kalan önbellekleri, arabellekleri ve işletim sistemini de bütçeleyin.
- ☐ Gerekli bağlam ve eşzamanlılık için KV cache ve tekrarlayan durum havuzları ayırın; motorun fiili sınırlarını kontrol edin.
- ☐ Bu iş yükü için yanıt hızını ölçün; gerektiğinde başlangıç süresini ve soğuk önbellek performansını da değerlendirin.
- ☐ Model kalitesini hedef görevlerde doğrulayın; harici bir yetenek puanı yalnızca başlangıç noktasıdır.

Kaçınılması gereken bir boyutlandırma hatası, her taşıma yöntemini aynı kabul etmektir. Daha büyük bir modelin kullanılabilir olup olmadığına karar vermeden önce **hangi verinin taşındığını, ne kadarına erişildiğini ve ne zaman hazır olması gerektiğini** kontrol edin.

---

## 8. Sonuç ve Geleceğe Bakış

**Bulguların özeti:**

| Soru | Yanıt |
|---|---|
| Tablo GPU belleği dışında tutulabilir mi? | Evet — tablolar büyüktür, ancak her token için önceden bilinen adreslerden yalnızca birkaç kilobayt getirilir |
| Nereye taşınır? | DGX Spark'ta yerel NVMe'ye; RTX PRO 6000'de ayrı, sabitlenmiş sistem RAM'ine |
| Aynı donanımdaki karşılaştırma ne gösterir? | 8× Spark'ta disk yapılandırması düğüm başına ~21 GB daha fazla KV cache tahsisi bildirir; TPS, C=1'de %7.5, C=8'de %14 daha düşüktür |
| Daha küçük yapılandırmalar ne sağlar? | 4× Spark'ta DeepSeek: C=1'de 29.5 token/s, tahminen 8 sohbet / 3 agentic kullanıcı; tek Spark'ta Qwen: 28.5 token/s, 8 sohbet / 3 agentic kullanıcı; RTX PRO 6000'de Qwen: C=1'de 155.8 token/s ve C=16'da istek başına 43.2 token/s, 64 sohbet / 24 agentic kullanıcı |
| Ne kazandırır? | Normalde sığmayan modellerin çalışması (4× DGX Spark'ta 763B, tek DGX Spark veya RTX PRO 6000'de 132.7 GB checkpoint) ve daha fazla KV cache kapasitesi (8× DGX Spark'ta yapılandırılan sınır 300K → 1M) |
| Maliyeti nedir? | Başlangıç süresi, NVMe alanı veya sabitlenmiş sistem RAM'i ve motor desteğine bağımlılık |

**Geleceğe bakış.** Bazı yeni mimariler, hesaplanması gereken bileşenleri yalnızca saklanması gereken verilerden ayırıyor. Mixture-of-Experts etkin parametreleri toplam parametrelerden ayırdı; burada incelenen iki modelde kullanılan Engram tabloları ise erişim biçimi daha yavaş bellek katmanlarına uygun, büyük bir parametre havuzu ekliyor. Diğer modellerin bunu benimseyip benimsemeyeceğini zaman gösterecek. Benimserlerse ve çıkarım motorları da desteklerse, aynı donanım uygun bileşenler için sistem RAM'ini ve depolamayı kullanarak daha yetenekli modelleri çalıştırabilir. Bu faydanın gerçekleşmesi; kalan ağırlıklar ve istek durumu için yeterli GPU belleği, verimli veri aktarımı ve kabul edilebilir ölçülen gecikme gerektirir.

---

## Sözlük (Terimler)

- **Arama tablosu (lookup table):** Bir anahtarla adreslenen satırlardan veri getirilen tablo; Engram tabloları bu şekilde okunur.
- **Belleğe eşlenmiş dosya (memory-mapped file):** Bellek gibi erişilebilen dosya; sayfaları ilk erişimde diskten yüklenir ve sayfa önbelleğinde tutulur.
- **Birleşik bellek (unified memory):** DGX Spark'ta (GB10) olduğu gibi CPU ve GPU'nun paylaştığı tek bellek havuzu.
- **Checkpoint:** Kaydedilmiş model ağırlıkları ve ilgili üst veri; dosya boyutu ile çalışma zamanı bellek kullanımı farklı büyüklüklerdir.
- **Conditional memory:** DeepSeek'in Engram tablosu için kullandığı ad: tablo büyüktür, ancak bir satır yalnızca giriş token'ları gerektirdiğinde okunur.
- **Decode:** Yanıtın token token üretilmesi; küçük batch boyutlarında çoğunlukla bellek bant genişliğiyle sınırlıdır.
- **Embedding:** Bir token'ı veya token dizisini temsil eden öğrenilmiş vektör.
- **Engram:** DeepSeek'in embedding tablosu modülü; DeepSeek-V4.1-Flash'ta bulunur.
- **Engram tablosu:** Giriş token'larının hash'lenmiş n-gram'larıyla adreslenen ve belirli katmanlarda gizli durumla birleştirilen öğrenilmiş vektör tablosu.
- **Etkin parametreler:** Bir token için kullanılan parametreler; hassasiyetleri ve yeniden kullanımları ağırlık trafiğini etkiler.
- **Gated DeltaNet:** Büyüyen bir KV cache yerine istek başına sabit boyutlu durum tutan doğrusal attention katmanı.
- **Gizli durum (hidden state):** Token'ın model katmanlarından geçerken taşıdığı vektör temsili.
- **Hash fonksiyonu (hash head):** Bir n-gram'ı tablonun bir satırına eşleyen, birbirinden bağımsız birkaç fonksiyondan biri.
- **KV cache:** Önbelleğe alınan attention key ve value vektörleri; boyutu attention mimarisine, bağlam uzunluğuna, hassasiyete ve eşzamanlı istek sayısına bağlıdır.
- **N-gram:** Art arda gelen n token'dan oluşan dizi (bigram: 2, trigram: 3).
- **Önceden getirme (prefetching):** Veriyi ihtiyaç duyan katman çalışmadan önce getirerek aktarımın hesaplamayla örtüşmesini sağlama.
- **PLE tablosu:** SGLang'in Qwen3.8-Flash-Next n-gram embedding tablosu için kullandığı ad.
- **Prefill:** Yanıt üretiminden önce prompt'un işlenmesi; kuyrukta bekleme ve diğer ek yüklerle birlikte TTFT'yi oluşturur.
- **Sabitlenmiş bellek (pinned, page-locked memory):** İşletim sisteminin yerini değiştiremediği veya takas alanına taşıyamadığı, ayrı bir GPU'nun doğrudan okuyabildiği sistem belleği.
- **Sayfa önbelleği (page cache):** İşletim sisteminin son okunan dosya sayfalarını RAM'de tuttuğu önbellek.
- **Taşıma (offloading):** Model verisinin bir bölümünü GPU belleği yerine daha yavaş ve daha büyük bir bellek katmanına (sistem RAM'i, NVMe) yerleştirme.
- **Tekrarlayan durum (recurrent state):** Doğrusal attention katmanının her dizi için güncellediği sabit boyutlu durum; servis sırasında önbellekleme ve spekülatif kod çözme için ek kopyalar gerekebilir.
- **Toplam parametreler:** Modelin tüm parametreleri; bellek kapasitesi ihtiyacını belirler.
- **TPS (saniyedeki token sayısı):** Bu çalışmada, çıktı token sayısının TTFT dahil toplam istek süresine bölünmesi.
- **TTFT (ilk token'a kadar geçen süre):** İsteğin gönderilmesinden akış olarak gelen ilk token'a kadar geçen süre; varsa akıl yürütme token'ı da dahildir.

---

## Kaynaklar

> Donanım değerleri, Yerel LLM Kullanım Rehberi'nde kullanılan NVIDIA veri sayfalarına dayanır. Mimari ayrıntılar model kartlarından, teknik raporlardan ve model yapılandırmalarından alınmıştır. Çıkarım sonuçları, LLM Çıkarım Benchmark Gezgini'ndeki OpenZeka ölçümleridir. Bellek tahsisleri ve başlangıç süresi gözlemleri, bağlantıları verilen dağıtım raporları ile SGLang cookbook'tan alınmıştır.

**Modeller ve mimari:**

- DeepSeek-V4.1-Flash model kartı — <https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash>
- DeepSeek-V4.1-Flash teknik raporu — <https://arxiv.org/abs/2609.19969>
- Conditional Memory via Scalable Lookup: A New Axis of Sparsity for Large Language Models (Engram) — <https://arxiv.org/abs/2601.07372>
- NVIDIA Qwen3.8-Flash-Next NVFP4 model kartı ve hassasiyet dağılımı — <https://huggingface.co/nvidia/Qwen3.8-Flash-Next-NVFP4>
- Qwen3.8-Flash-Next model kartı — <https://huggingface.co/Qwen/Qwen3.8-Flash-Next>
- Qwen3.8-Flash-Next teknik raporu — <https://arxiv.org/abs/2608.30320>

**Çıkarım motorları ve taşıma:**

- SGLang cookbook, Qwen3.8-Flash-Next (doğrulanmış tek cihaz yapılandırmaları) — <https://docs.sglang.io/cookbook/autoregressive/Qwen/Qwen3.8-Flash-Next>
- SGLang: DGX Spark üzerinde dosya tabanlı n-gram tablosu — <https://github.com/sgl-project/sglang/pull/39126>

**Donanım:**

- NVIDIA DGX Spark — <https://www.nvidia.com/en-us/products/workstations/dgx-spark/>
- NVIDIA RTX PRO 6000 Blackwell Workstation Edition — <https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/>
- NVIDIA DGX B300 — <https://www.nvidia.com/en-us/data-center/dgx-b300/>

**OpenZeka raporları ve araçları:**

- [Yerel LLM Kullanım Rehberi]({{ '/papers/local-llm-guide/' | relative_url }})
- [DeepSeek-V4.1-Flash 4× DGX Spark Dağıtımı]({{ '/papers/deepseek-v4.1-flash-4spark-deployment/' | relative_url }})
- [DeepSeek-V4.1-Flash 8× DGX Spark TP8 Dağıtımı]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/' | relative_url }})
- [LLM Çıkarım Benchmark Gezgini]({{ '/llm-inference-benchmarks/' | relative_url }})
- CordatusAI LLM Benchmark Tool — <https://github.com/CordatusAI/llm-benchmark>

**Yetenek puanları:**

- Artificial Analysis Intelligence Index — <https://artificialanalysis.ai>

---

### Notlar

- **Ölçümler:** Dağıtım hızları, CordatusAI LLM Benchmark Tool ile yapılan OpenZeka çalıştırmalarından gelir (yaklaşık 128 giriş token'ı, en fazla 128 çıktı token'ı, ortalama değerler). DeepSeek-V4.1-Flash çalıştırma yapılandırmaları iki DeepSeek raporunda belgelenmiştir; Qwen3.8-Flash-Next çalıştırmalarında SGLang cookbook'un doğrulanmış tek cihaz yapılandırmaları kullanılmıştır.
- **Tahminler:** Token başına embedding bayt miktarı model yapılandırmalarından hesaplanmıştır; gerçek bellek ve depolama trafiği önbelleklemeye ve aktarım boyutlarına bağlıdır. Checkpoint dosya boyutları, çalışma zamanı bellek ölçümleri değildir.
- **Güncellik:** Motorlardaki taşıma desteği hızla gelişmektedir; burada anlatılan parametreler ve sınırlamalar Eylül 2026 itibarıyla geçerlidir.

---

{% include company/block.html name="cta_logo" %}

**LLM altyapınızı birlikte planlayalım.** Model mimarisini, bellek hiyerarşisini ve taşımayı hesaba katan donanım boyutlandırması için {% include company/block.html name="contact_cta" %}
