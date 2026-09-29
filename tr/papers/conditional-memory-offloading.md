---
title: LLM Inference Sürecinde Conditional Memory ve Offloading
parent: White Papers
nav_order: 2
lang: tr
page_id: conditional-memory-offloading
date: 2026-09-29
card_tag: "Teknik Rehber"
description: >-
  Model mimarisinin GPU belleğinde kalması gereken ve host RAM veya NVMe'ye
  taşınabilen verileri nasıl belirlediği: conditional memory, DGX Spark, RTX PRO
  6000 ve DGX B300 bellek hiyerarşileri, DeepSeek-V4.1-Flash ve
  Qwen3.8-Flash-Next ile ölçülen sonuçlar.
permalink: /papers/conditional-memory-offloading/
last_modified_date: 2026-09-29
toc: true
---

> **Yayın tarihi:** Eylül 2026
> **Kapsam:** LLM'lerin inference sırasında belleği nasıl kullandığı, mimari tercihlerin bu kullanımı nasıl değiştirdiği, DGX Spark, RTX PRO 6000 ve DGX B300 bellek hiyerarşileri arasındaki farklar ve offloading'in sağladığı olanaklar ile sınırları. Değerlendirme, OpenZeka'nın DeepSeek-V4.1-Flash ve Qwen3.8-Flash-Next ölçümlerine dayanır.
> **Not:** Model adları, yazılım sürümleri ve ölçüm sonuçları Eylül 2026 itibarıyla geçerlidir. Inference engine'lerde offloading desteği hızla değişmektedir; temel soru, her adımda ne kadar veriye ihtiyaç duyulduğu ve bu verinin ne zaman hazır olması gerektiğidir.

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## Yönetici Özeti

- **Bellek bütçesinden başlayın.** [Yerel LLM Kullanım Rehberi]({{ '/papers/yerel-llm-rehberi/' | relative_url }}), donanım boyutlandırmasında VRAM'i temel kısıt olarak ele alır. Conditional memory, hangi model parametrelerinin GPU belleğinde kalması gerektiğini değiştirir.
- **Her token için tüm parametreler okunmaz.** Yeni modeller, hash ile adreslenen n-gram embedding'lerinden oluşan büyük **conditional memory** tabloları kullanır. DeepSeek-V4.1-Flash'ta *Engram*, Qwen3.8-Flash-Next'te *n-gram embedding tablosu* olarak adlandırılan bu bileşene SGLang'de PLE denir. Her token için yalnızca birkaç kilobyte embedding verisi gerekir; gerekli satırlar, forward pass başlamadan token ID'lerinden belirlenebilir.
- **Depolama ihtiyacı ile bellek trafiği farklıdır.** Büyük tablolardan her token için yalnızca birkaç satır okunur. Küçük aktarımlar ve prefetching, düşük ek maliyetle offloading yapılmasını mümkün kılar. Aktif ağırlık matrislerini veya attention cache'lerini sürekli taşımak ise daha fazla veri aktarımı gerektirir.
- **Verinin nereye taşınabileceğini cihazın bellek mimarisi belirler.** **DGX Spark** üzerinde CPU ve GPU aynı birleşik belleği kullanır; tablo bu nedenle NVMe'de tutulur, sık erişilen sayfalar RAM'de cache'lenir. **RTX PRO 6000** üzerinde ayrı GPU belleği vardır; tablo PCIe üzerinden erişilen pinned host RAM'e taşınır. **DGX B300** üzerindeki dört GPU'lu DeepSeek yapılandırmasında ise tabloları da tutacak kadar GPU belleği bulunur.
- **Ölçülen sonuçlar:** 763B parametreli DeepSeek-V4.1-Flash, 196B parametreli Engram tabloları NVMe'ye taşınarak 4× DGX Spark üzerinde çalıştırılmıştır. 8× DGX Spark üzerinde tabloların NVMe'ye taşınması, raporlanan KV cache tahsisini düğüm başına yaklaşık 21 GB artırmış; yapılandırılan bağlam sınırını 300K'dan 1M token'a çıkarmıştır. 132,7 GB'lık kuantize checkpoint'e sahip Qwen3.8-Flash-Next ise tek DGX Spark ve tek RTX PRO 6000 üzerinde, aşağıda ele alınan eşzamanlılık seviyelerinde etkileşimli kullanıma uygun performans sağlamıştır.
- **İki pratik sonuç.** İki 8× DGX Spark yapılandırması, Engram'ı bellekte tutmak ile diske taşımak arasındaki dengeyi gösterir. 4× Spark ve tek cihazlı Qwen ölçümleri ise model ağırlıklarına ayrılabilecek belleği aşan checkpoint'lerden kullanılabilir bir inference hizmeti elde edilebildiğini gösterir.
- **Boyutlandırmaya etkisi:** GPU bellek bütçesine kalan model ağırlıklarını, KV cache'i, recurrent state'i ve çalışma zamanı buffer'larını; host RAM veya NVMe bütçesine ise offload edilen tabloları ekleyin. Bu tasarım yaygınlaştıkça aynı bellek kapasitesiyle daha yetenekli modellerin çalıştırılması mümkün olabilir.

---

## 1. Giriş

[Yerel LLM Kullanım Rehberi]({{ '/papers/yerel-llm-rehberi/' | relative_url }}), donanım boyutlandırmasına GPU belleğinden başlar: model ağırlıkları, KV cache, recurrent state ve çalışma zamanı buffer'ları belleğe sığmalıdır. Conditional memory bu bütçeye yeni bir ayrım getirir. Öğrenilmiş parametrelerin bir bölümü, her token için yalnızca birkaç satırın okunduğu büyük tablolarda tutulur. Bu tabloları GPU belleği dışında saklamak, daha önce sığmayan bir modeli aynı cihazda kullanılabilir hale getirebilir.

Bu çalışma söz konusu ayrımı **mimariden uygulamaya** kadar izler: attention, expert ve embedding bileşenlerinin erişim örüntüleri neden farklıdır, bu farklar offloading'i nasıl etkiler ve OpenZeka'nın DGX Spark ile RTX PRO 6000 üzerindeki DeepSeek-V4.1-Flash ve Qwen3.8-Flash-Next ölçümleri ne gösterir? Donanım bölümünde DGX B300, CPU ve GPU belleği ayrı olan bir sistem örneği olarak ele alınır.

Odak, mekanizma ve bunun boyutlandırmaya etkisidir. Çalıştırma talimatları, bağlantıları verilen dağıtım raporlarında ve SGLang cookbook'ta bulunur.

---

## 2. LLM'ler Belleği Nasıl Kullanır?

### 2.1. Bellek kapasitesi, bant genişliği ve gecikme

**Bellek kapasitesi** ne kadar verinin sığacağını, **bellek bant genişliği** ise bu verinin ne hızda okunabileceğini belirler. Offloading, veriyi daha yavaş bir bağlantı üzerinden erişilen host RAM'e veya depolamaya taşıyarak GPU belleğinde yer açar. Bunun verimli olup olmayacağı, her adımda gereken veri miktarına, erişim gecikmesine ve veri getirme işleminin hesaplamayla örtüştürülüp örtüştürülemediğine bağlıdır.

Her token için birkaç kilobyte sağlayan 50 GB'lık bir tablo, hesaplamada tekrar tekrar kullanılan 50 GB'lık matrislerden çok daha az veri aktarımı gerektirir. Yalnızca depolama boyutuna bakarak GPU belleği dışına taşımanın maliyeti belirlenemez.

### 2.2. Inference sırasında belleği neler kullanır?

Yerel LLM Kullanım Rehberi'nin 4.3. bölümündeki bellek bütçesi burada da geçerlidir:

> **Toplam bellek = Model ağırlıkları + KV cache + Recurrent state + Activation'lar + Ek bellek kullanımı**

| Bileşen | Tanım | Neye bağlı büyür? |
|---|---|---|
| **Model ağırlıkları** | Attention projeksiyonları, expert'ler, embedding'ler ve output head gibi parametreler | Model boyutu ve hassasiyet |
| **KV cache** | Attention katmanlarının yeniden hesaplamaması için saklanan key ve value vektörleri | Bağlam uzunluğu × eşzamanlı istek sayısı |
| **Recurrent state** | Gated DeltaNet gibi linear attention katmanlarının sabit boyutlu durumu; servis buffer'ları ve kaydedilen kopyalar | Aktif istekler, cache politikası ve speculative decoding ayarları |
| **Activation'lar ve ek bellek kullanımı** | Geçici buffer'lar, CUDA context ve bellek ayırıcıdaki parçalanma | Batch ve prompt boyutları, engine ayarları |

Bu çalışma tabloya bir ayrım ekler: **model ağırlıklarının erişim biçimi aynı değildir.** Bazıları tam matris olarak kullanılırken bazılarından yalnızca seçilen satırlar okunur. Bölüm 3 bu ayrımı açıklar.

### 2.3. Sık erişilen veriler neden GPU'ya yakın tutulur?

**Prefill (prompt işleme)** giriş token'larını işler; **decode (token üretimi)** yanıtı üretir. Küçük batch boyutlarında ağırlıkların okunması, decode süresinde çoğu zaman belirleyicidir. Bellek bant genişliği bu nedenle ilk yaklaşım için kullanılabilir:

> **Bellek bant genişliğiyle sınırlı decode hızı (token/s) ≈ Etkin bellek bant genişliği (byte/s) ÷ Üretilen token başına okunan veri (byte)**

Hesaplama, kernel maliyeti, iletişim ve KV cache ya da recurrent state erişimi de hızı sınırlayabilir. Batching ve speculative decoding, aynı ağırlıkları birden fazla token için kullanabildiğinden her çıktı token'ı için ağırlıkların yeniden okunması gerekmez.

Sık erişilen veriyi GPU belleğinde tutmak, yürütme sırasında daha yavaş bir veri aktarımını beklemeyi önler. CPU üzerinde hesaplama ve ağırlıkların gerektiğinde GPU'ya aktarılması, daha büyük modelleri çalıştırabilir; performans iş yüküne ve uygulamaya bağlıdır. Conditional memory ise hesaplamayı GPU'da tutarken host RAM veya depolamadaki çok daha büyük bir tablodan az miktarda veri getirme olanağı sağlar.

---

## 3. Mimari ve Bellek Erişimi

### 3.1. Standart attention ve MoE: her adımda ne okunur?

Transformer'da bir token'ın o andaki temsili, öğrenilmiş matrislerle çarpılarak **query, key ve value** vektörlerine dönüştürülür. Query, mevcut ve önceki token'ların key vektörleriyle karşılaştırılır. Normalizasyon sonrasında attention ağırlıkları, value vektörlerinin nasıl birleştirileceğini belirler. Sonuç, sonraki projeksiyonlardan ve feed-forward ağdan geçer.

Bu işlem iki ayrı bellek ihtiyacı doğurur:

- **Ağırlıklar** eğitim sırasında öğrenilir ve farklı isteklerde tekrar kullanılır. Dense projeksiyonlar ve feed-forward katmanları, her forward adımında büyük matrisleri kullanır.
- **KV cache**, mevcut konuşma için hesaplanan key ve value vektörlerini tutar. Full attention her decode adımında önceki bağlama eriştiğinden bu trafik bağlam uzunluğuyla artar.

GPU üzerinde hızlı çalışmak için sık erişilen bu matrisler ve aktif cache'ler genellikle GPU belleğinde tutulur. Offloading mümkündür; ancak tekrarlanan aktarımlar inference gecikmesinin ana belirleyicisi haline gelebilir.

**Mixture-of-Experts (MoE)**, feed-forward bölümünü değiştirir: router her token için birkaç expert ağı seçer. Toplam parametre sayısı depolama ihtiyacını, seçilen expert'ler ise ağırlık trafiğinin önemli bir bölümünü belirler. Hesaplama azalır; fakat seçilen expert'in matrisleri yine de kullanılır. Ayrıca standart routing, mevcut hidden state'e bağlıdır; kesin seçim forward pass sırasında belli olur. Expert caching ve prefetching yardımcı olabilir, ancak cache'te bulunmayan bir expert'i getirmek birkaç embedding satırını getirmekten çok daha maliyetlidir.

### 3.2. Bellek ihtiyacını azaltan attention mimarileri

Çeşitli mimari değişiklikler cache boyutunu veya okunan bölümünü azaltır:

| Mimari | Ne değişir? | Bellek yerleşimine etkisi |
|---|---|---|
| **Grouped-query attention (GQA)** | Birden fazla query head, key ve value vektörlerini paylaşır | KV cache küçülür; decode sırasında aktif cache'e yine erişilir |
| **Compressed / sparse attention** | Sıkıştırılmış temsiller tutulur veya konumların bir alt kümesi seçilir | Depolama ya da okuma miktarı azalır; aktarım maliyetini seçim ve cache düzeni belirler |
| **Linear attention hibritleri** | Bazı katmanlar her token için key ve value saklamak yerine sabit boyutlu recurrent state günceller | Bağlama bağlı depolama ihtiyacı azalır; state her adımda yine okunur ve güncellenir |

Örneğin Qwen3.8-Flash-Next, her dört katmanın üçünde Gated DeltaNet, kalanında sparse attention kullanır. DeepSeek-V4.1-Flash ise attention cache'lerini sıkıştırır ve katmanlar arasında paylaşır. Bu değişiklikler isteklere daha fazla bellek bırakır; ancak kalan state'in düşük maliyetle offload edilebileceği anlamına gelmez.

**Conditional memory, bu katmanların yanında yer alan ek bir bileşendir.** Offloading avantajı, aşağıda açıklanan lookup örüntüsünden gelir; attention hesaplamasının GPU dışına taşınmasını gerektirmez.

### 3.3. Conditional memory: token ID'lerinden öğrenilmiş vektörlere

**Embedding**, sayılardan oluşan öğrenilmiş bir vektördür. Standart input embedding tablosu, her token ID'sini bir satırla eşler. Conditional memory bu yaklaşımı **n-gram** adı verilen kısa token dizilerine genişletir. Böylece ağın hesapladığı temsilin yanında, yerel token birleşimleri hakkında öğrenilmiş bilgi sağlar.

Lookup ile getirilen veriyi kullanan hesaplama ayrı işlemlerdir:

1. **Anahtarı oluşturma.** Son token ID'leri alınır: bigram için iki, trigram için üç token. Örneğin `[a, b, c]` ID'lerinden `[b, c]` ve `[a, b, c]` son ek dizileri elde edilir. Bir token, kelime, kelime parçası veya başka bir metin parçası olabilir.
2. **Hash ile satır adresini belirleme.** Her hash head, kısa diziyi bir satır adresine dönüştürür. Birden fazla head kullanılması, iki dizi aynı tabloda aynı adrese denk gelse bile farklı öğrenilmiş vektörler elde edilmesini sağlar. Tüm satırlarda arama yapılmaz.
3. **Embedding'leri getirme.** Adreslenen satırlar okunur ve birleştirilir. Tablo, inference sırasında değişmeyen öğrenilmiş model verisidir; konuşma cache'i veya belge veritabanı değildir.
4. **Hidden state ile birleştirme.** Projeksiyonlar getirilen vektörü dönüştürür; mevcut hidden state'ten hesaplanan gate, katkısının gücünü belirler. Aynı satırlar bu nedenle farklı bağlamlarda farklı katkılar sağlayabilir. Bu hesaplama GPU'da kalırken büyük tablo başka bir bellek katmanında tutulabilir.

Embedding lookup ile bağlama bağlı gating'in ayrılması, [Engram mimarisinde](https://arxiv.org/html/2601.07372v2#S2) açıklanır. Qwen'in [n-gram embedding tasarımı](https://arxiv.org/html/2608.30320#S2.SS3) da genel olarak aynı yaklaşımı kullanır.

**Hesaplama örneği — Qwen3.8-Flash-Next.** Yapılandırmada bigram ve trigram için sekizer head ve satır başına 160 değer bulunur. Her FP8 değerinin bir byte olduğu durumda, token konumu başına okunan embedding verisi:

> **2 n-gram uzunluğu × 8 head × 160 değer × 1 byte = Giriş konumu başına 2.560 byte**

Tablo yaklaşık **47,7 GiB** yer kaplar; tek bir konum için yalnızca on altı satır gerekir. Tablodaki satır sayısını artırmak, her token için daha fazla satır okumadan öğrenilmiş parametre sayısını artırır. Kuantizasyon metadata'sı ve bellek erişimlerinin granülerliği, gerçekte aktarılan byte miktarını artırabilir.

**Prefetching neden mümkündür?** Satır adresleri, forward pass öncesinde bilinen token ID'lerine bağlıdır. Engine, önceki GPU katmanları çalışırken satırları getirmeye başlayabilir. Standart decode'da bu, henüz üretilmemiş gelecekteki çıktılar için değil, mevcut ve bilinen token için geçerlidir. Prefill sırasında ise prompt'un tüm ID'leri zaten bilinir. Tabloyu kullanan katmanın ilk katmanlardan sonra gelmesi, veri getirmeyi hesaplamayla örtüştürmek için zaman sağlar. Bu sürenin yeterli olup olmadığı engine'e ve bellek katmanına bağlıdır.

Standart input embedding'leri de satır lookup'ı kullanır. Conditional memory tablolarının büyük olması, bunların offload edilmesini GPU belleği ihtiyacını azaltmak açısından özellikle yararlı kılar. Input embedding ağırlıkları output katmanıyla paylaşılıyorsa, aynı tablo sözlükteki token'ların skorlarını hesaplamak için de kullanılır; bu erişim biçimi input lookup'tan farklıdır.

### 3.4. Karşılaştırma: offloading'i uygulanabilir kılan nedir?

| Veri | Erişim örüntüsü | Offloading açısından sonuç |
|---|---|---|
| **Dense projeksiyonlar ve feed-forward ağırlıkları** | Her forward adımında büyük matris okumaları | Ağırlık aktarımı, hesaplamanın beklediği kritik yola girebilir |
| **MoE expert'leri** | Genellikle hidden state'e bağlı seçilen matrisler | Aktif küme küçüktür; ancak cache miss maliyetlidir ve seçim daha geç belli olur |
| **Aktif KV cache** | Bağlama bağlı okumalar; full attention önceki bağlama erişir | Uzun bağlamlar yüksek aktarım trafiği oluşturabilir |
| **Recurrent state** | Her adımda okunur ve güncellenir | Tekrarlanan okuma ve yazmalar ek aktarım maliyeti doğurabilir |
| **Conditional memory tabloları** | Token ID'lerinden adreslenen birkaç satır | Küçük aktarımlar ve önceden bilinen adresler, prefetching ile hesaplamanın örtüşmesini sağlar |

> **Pratik sonuç:** Büyük bir tablo, küçük aktarımlar ve veriyi getirmek için yeterli süre, bir bileşeni offloading için uygun hale getirir. Conditional memory, küçük aktarımları katman çalışmadan önce bilinen adreslerle birleştirir. Attention ve expert offloading ise farklı dengeler gerektirir.

---

## 4. Cihazların Bellek Hiyerarşisi

### 4.1. Bellek katmanları

| Katman | Tipik kapasite | Erişim özelliği |
|---|---|---|
| **GPU belleği** (HBM, GDDR, birleşik LPDDR) | Cihaz başına onlarca veya yüzlerce GB | Tekrarlanan matris ve cache okumaları için yüksek bant genişliği |
| Ayrı GPU belleği olan sistemlerde **host RAM** | Yüzlerce GB ile TB mertebesi | PCIe Gen5 x16, protokol ve yazılım maliyetleri öncesinde her yönde teorik olarak yaklaşık 64 GB/s sağlar |
| **Yerel NVMe** | Birkaç TB | Daha yüksek kapasite; rastgele erişim ve page fault maliyeti, RAM'de hazır veriyi okumaktan yüksektir |

**Veri miktarı ÷ etkin bant genişliği**, veri aktarım süresi için bir tahmin verir. Gerçek erişim süresine gecikme ve yazılım maliyeti de eklenir; modelin ilerlemesini yalnızca hesaplamayla örtüştürülemeyen bölüm geciktirir. Küçük ve dağınık okumalar için erişim gecikmesi ve caching, en yüksek bant genişliğinden daha belirleyici olabilir.

### 4.2. Birleşik bellek ve ayrı GPU belleği

Bellek mimarisi, hangi hedefe yapılan offloading'in GPU belleğinde yer açacağını belirler.

**Ayrı GPU belleği (RTX PRO 6000, DGX B300).** GPU'nun kendi belleği ve CPU'nun ayrı sistem RAM'i vardır; aradaki erişim PCIe üzerinden gerçekleşir. Tabloyu GPU belleğinden host RAM'e taşımak GPU belleğinde yer açar. Burada kullanılan offloading uygulaması, tabloyu **pinned (page-locked) host memory** içinde ayırır. Böylece işletim sistemi bu sayfaları swap'e taşımadan GPU gerekli satırları doğrudan okuyabilir.

**Birleşik bellek (DGX Spark).** GB10 içindeki CPU ve GPU, her iki işlemcinin cache tutarlılığı korunarak eriştiği tek bir 128 GB LPDDR5X havuzunu paylaşır. Ayrı host RAM yoktur: tabloyu CPU belleğine ayırmak ortak havuzdaki kullanımını azaltmaz; host memory içinde pin etmek de aynı 128 GB'ı tüketir. Dosya tabanlı uygulama, GB10'un host page table'ları üzerinden pageable memory'ye erişmesini kullanır. Tablo yerel NVMe'de tutulur; getirilen sayfalar cache'te kaldıkları sürece birleşik belleği kullanır. Tablonun yalnızca bir bölümünün aynı anda RAM'de bulunması yeterlidir.

### 4.3. Cihaz karşılaştırması

| | DGX Spark (GB10) | RTX PRO 6000 Blackwell | DGX B300 |
|---|---|---|---|
| Bellek mimarisi | CPU ve GPU'nun paylaştığı 128 GB havuz | 96 GB ayrı GPU belleği, ayrı host RAM | Kendi HBM belleğine sahip sekiz GPU, ayrı host RAM |
| GPU bellek bant genişliği | 273 GB/s | 1,79 TB/s | GPU başına 8 TB/s |
| Tablonun konumu | RAM'de page cache ile yerel NVMe | PCIe üzerinden pinned host RAM | Dört GPU'lu DeepSeek yapılandırmasında GPU belleği |
| Boyutlandırmaya etkisi | Ortak havuzda işletim sistemi, page cache ve çalışma zamanı için pay ayrılmalı | Host RAM ve GPU belleği ayrı bütçelenmeli | Çok GPU'lu yapılandırmalarda bu checkpoint'ler için yeterli GPU belleği bulunur |

### 4.4. Conditional memory offloading neden düşük ek maliyetle çalışabilir?

Her adımda gigabyte'larca aktif ağırlık aktarmak, PCIe bant genişliğinin büyük bölümünü tüketebilir. Qwen'in token konumu başına 2.560 byte (2,5 KiB) embedding verisi çok daha az aktarım bant genişliği gerektirir. Adresler de embedding'i kullanacak katmandan önce hazırlanabilir; böylece asenkron veri getirme işlemi, diğer katmanlar çalışırken tamamlanabilir.

**Büyük bir tablonun düşük maliyetle offload edilebilmesinin** mimari nedeni budur. Bunun için erişim örüntüsünden yararlanan bir uygulama gerekir. Host RAM ile NVMe de farklı koşullar sunar: dosya tabanlı erişim page cache'ten karşılanabilir veya depolamayı bekleyebilir. Okunan sayfalar, istenen satırlardan çok daha büyük olabilir. Prefill, batching ve speculative verification, lookup yapılan konum sayısını artırır.

**Mekanizmanın çalışabildiğine dair kanıt.** Engram makalesindeki H800 deneyinde, 4B ve 8B dense backbone'lara host belleğinde tutulan 100B parametreli bir tablo eklenmesi, Engram içermeyen kendi referanslarına göre throughput'u yaklaşık %1,9 ve %2,8 azaltmıştır. Uygulama, veri getirmeyi ilk bloktaki hesaplamayla örtüştürmüştür. Sonuç, o host memory uygulaması ve iş yükü için geçerlidir ([Engram, §6.4](https://arxiv.org/html/2601.07372v2#S6.SS4)).

Tablonun değerleri değiştirilmeden offload edilmesi, öğrenilmiş bilgiyi korur: GPU'ya aynı satırlar sağlanır. Pratik soru, satırların zamanında ulaşıp ulaşmadığıdır. Bölüm 6 iki kullanım biçimini gösterir: 8× DGX Spark üzerinde bellek–NVMe karşılaştırması ve daha küçük yapılandırmalarda, normalde sığmayan checkpoint'lerden kullanılabilir inference elde edilmesi.

---

## 5. İncelenen Modeller

### 5.1. DeepSeek-V4.1-Flash

| Özellik | Değer |
|---|---|
| Toplam parametre | 763B |
| — backbone | 552B |
| — Engram conditional memory | 196B |
| — vision encoder, projector, draft model | ~15B |
| Token başına aktif parametre | Decode'da ~16B (prefill'de ~8B) |
| Attention | 128 token'lık sliding window ile compressed sparse attention; katmanlar arasında paylaşılan KV cache |
| Engram | Katman indeksleri 1 ve 14 (sıfırdan başlayan indeksleme); bigram, trigram ve 4-gram; her n-gram uzunluğu için 8 hash head; satır başına 256 değer |
| Azami bağlam uzunluğu | 1.048.576 token (yaklaşık 1M) |
| Checkpoint boyutu | 510,3 GB; FP8 dense ve Engram ağırlıkları ile FP4 expert'ler dahil karma hassasiyet |

FP8 Engram embedding değerleri yaklaşık **196,6 GB** yer kaplar. Diğer model ağırlıkları ve kuantizasyon metadata'sı dahil checkpoint'in kalan kısmı yaklaşık **313,7 GB**'dır. [Model kartı](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash), 552B backbone'u Engram ve yardımcı modüllerden ayrı belirtir.

### 5.2. Qwen3.8-Flash-Next

| Özellik | Değer |
|---|---|
| Parametreler | 125B temel model + 51B n-gram embedding + 4B multi-token prediction (MTP) modülü |
| Token başına aktif parametre | 6B |
| Attention | 36 Gated DeltaNet ve 12 Qwen Sparse Attention (QSA) katmanı; QSA, en fazla 512 adet dört token'lık blok ile sondaki tamamlanmamış bloğu seçer |
| N-gram tablosu | Katman indeksi 2 (sıfırdan başlayan indeksleme); bigram ve trigram için sekizer hash head; 160 değerlik 16 satırdan oluşan 2.560 boyutlu vektör |
| Yapılandırılan bağlam sınırı | 262.144 token |
| Kullanılan checkpoint | `nvidia/Qwen3.8-Flash-Next-NVFP4`; 132,7 GB (123,6 GiB) safetensors dosyası |
| Ağırlık hassasiyeti | Ana modelde NVFP4 routed expert'ler; BF16 attention ve shared expert'ler; FP8 MTP routed expert'ler ve n-gram tablosu |

### 5.3. Model boyutu ve bellek ihtiyacı

| Model | Checkpoint boyutu | Conditional memory tablosu | Checkpoint'in kalan kısmı | Bu çalışmada tablo offloading gerektiren yapılandırmalar |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 510,3 GB | ~196,6 GB | ~313,7 GB | 4× DGX Spark |
| Qwen3.8-Flash-Next, NVIDIA NVFP4 | 132,7 GB | ~51,2 GB (47,7 GiB) | ~81,5 GB | 1× DGX Spark; 1× RTX PRO 6000 |

**Birimler ve bellek ihtiyacı.** GB, 10⁹ byte; GiB, 2³⁰ byte anlamına gelir. Checkpoint boyutları, kayıtlı revision'lardaki safetensors dosyalarının toplamıdır. Checkpoint'in kalan boyutu yaklaşık bir çıkarma işlemidir; yükleme sonrasındaki GPU bellek kullanımının ölçümü değildir. Çalışma zamanı tahsisleri, ağırlıkların bellekteki düzeni ve geçici buffer'lar da hesaba katılmalıdır.

[NVIDIA checkpoint dosyaları](https://huggingface.co/nvidia/Qwen3.8-Flash-Next-NVFP4/tree/fc694b54fb0174e0913e6adf86691ef85a4ead47) toplam 132.680.249.378 byte'tır. Bölüm 6'daki çalışma zamanı bellek değerleri, checkpoint boyutlarından ayrı verilir.

Offloading, tabloyu başka bir bellek katmanına taşır; tablo modelin bir parçası olmaya devam eder. Daha küçük yapılandırmalar böylece kalan ağırlıkları, inference için gereken bellekle birlikte tutabilir.

---

## 6. Benchmark Sonuçları

### 6.1. Metodoloji

Aşağıdaki dağıtım sonuçları, açık kaynak [CordatusAI LLM Benchmark Tool](https://github.com/CordatusAI/llm-benchmark) ile yapılan OpenZeka ölçümleridir. Yaklaşık 128 giriş token'ı ve 128 token çıktı sınırı kullanılmış; her eşzamanlılık seviyesi on tur çalıştırılarak ortalama değerler raporlanmıştır. **Eşzamanlılık (C)**, aynı anda gönderilen istek sayısıdır. **TTFT (time to first token)**, kuyrukta bekleme ve prompt işleme süresini içerir; stream edilen ilk reasoning token'ı da sayılır. **TPS (tokens per second)**, çıktı token sayısının TTFT dahil toplam istek süresine bölünmesidir. Toplam throughput olarak değil, istek başına raporlanır. Tüm sonuçlara [LLM Çıkarım Benchmark Gezgini]({{ '/llm-inference-benchmarks/' | relative_url }}) üzerinden de erişilebilir.

| Çalıştırma | Donanım | Engine, tensor parallelism (TP) | Speculative decoding | Conditional memory |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 4× DGX Spark | vLLM, TP=4 | DSpark, k=5 | NVMe |
| DeepSeek-V4.1-Flash, 300K | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | Bellekte |
| DeepSeek-V4.1-Flash, 1M | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | NVMe |
| Qwen3.8-Flash-Next | 1× DGX Spark | SGLang, TP=1 | MTP, 3 speculative adım / 4 draft token | NVMe |
| Qwen3.8-Flash-Next | 1× RTX PRO 6000 | SGLang, TP=1 | MTP, 3 speculative adım / 4 draft token | Pinned host RAM |

**İki 8× DGX Spark DeepSeek yapılandırması**, aynı donanımda farklı tablo yerleşimlerini karşılaştırır. Diğer çalıştırmalar ise model offloading ile belleğe sığdıktan sonra yapılandırmanın nasıl bir inference performansı sunduğunu gösterir. Sonuçları aşağıda ayrı ayrı değerlendirilmiştir.

### 6.2. 4× DGX Spark üzerinde DeepSeek-V4.1-Flash: Engram-on-disk ile modeli sığdırmak

510 GB'lık checkpoint dört düğüme bölündüğünde düğüm başına yaklaşık 128 GB gerekir. İşletim sistemi, CUDA context ve KV cache hesaba katıldığında bu, bir DGX Spark'ın modele ayırabileceğinden fazladır. **Engram-on-disk** ile her düğüm, Engram satırlarının kendi payını yerel NVMe'de tutar ve her adımın ihtiyaç duyduğu satırları forward pass öncesinde GPU belleğine aktarır. Böylece kalan ağırlıklar yüklenebilir. Benchmark sonuçları şöyledir:

| Eşzamanlılık (C) | TTFT (ms) | İstek başına TPS (token/s) |
|---|---|---|
| 1 | 271,6 | 29,5 |
| 2 | 395,8 | 21,3 |
| 4 | 577,4 | 13,1 |
| 8 | 805,9 | 8,8 |

**Bu sonuç neden değerlidir?** 763B parametreli model, dört masaüstü cihazında **C=1'de istek başına 29,5 token/s ve 272 ms TTFT** ile çalışır. C=2'de **21,3 token/s ve 396 ms TTFT** sağlayarak Gezgin'in en az 20 token/s ve en fazla 1.000 ms TTFT olan varsayılan hedeflerini karşılar. Daha yüksek eşzamanlılık da mümkündür; ancak yanıtlar yavaşlar: C=4'te 13,1 token/s, C=8'de 8,8 token/s ölçülmüştür. Bu iş yükünde yapılandırma, düşük eşzamanlılıkta etkileşimli kullanımı destekler.

### 6.3. 8× DGX Spark üzerinde DeepSeek-V4.1-Flash: tablo bellekte ve NVMe'de

Sekiz düğümde checkpoint her iki yerleşimde de sığar; böylece iki dağıtım yapılandırması karşılaştırılabilir. DGX Spark'ta tabloyu "host memory" içinde tutmak da ortak 128 GB havuzunu kullanır. NVMe'ye taşımak, cache'lenen sayfalar ve staging buffer'ları dışında bu kullanımı azaltır.

| Metrik | Engram bellekte | Engram NVMe'de |
|---|---|---|
| Düğüm başına Engram belleği (raporlanan) | 23,6 GB | Yalnızca gerekli satırlar ve staging buffer'ları |
| Düğüm başına KV cache tahsisi (raporlanan) | ~8,7 GB | ~30 GB |
| Yapılandırılan bağlam sınırı | 300K token | **1M token** |
| C=1'de TTFT | 213 ms | 199 ms |
| C=1 / C=8'de istek başına TPS (token/s) | 36,0 / 13,6 | 33,3 / 11,7 |

**Pratik denge:** disk yapılandırması, **C=1'de 33,3 token/s** ve **C=8'de istek başına 11,7 token/s** sağlarken düğüm başına raporlanan KV cache tahsisini yaklaşık **21 GB artırır**. Bellek yapılandırmasına göre TPS, sırasıyla %7,5 ve %14 daha düşüktür. Tabloyu bellekte tutan yapılandırmanın ölçülen TPS'i daha yüksek; disk yapılandırmasının KV cache'e ayırdığı bellek daha fazladır.

Bu, iki dağıtım yapılandırmasının karşılaştırmasıdır: bağlam sınırları, bellek ayarları ve yürütme yolları da farklıdır ([8× raporuna]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/' | relative_url }}) bakınız). Yapılandırılan bağlam sınırı 300K'dan 1M token'a çıkar. Benchmark kısa prompt'larla yapılmıştır; azami bağlam uzunluğu test edilmemiştir.

### 6.4. Tek DGX Spark üzerinde Qwen3.8-Flash-Next: 132,7 GB'lık checkpoint'i sığdırmak

**132,7 GB'lık NVIDIA NVFP4 checkpoint**, işletim sistemi, KV cache ve çalışma zamanı buffer'larıyla birlikte tek Spark'ın belleğinde bütünüyle tutulamaz. **47,7 GiB'lık FP8 n-gram tablosunu** yerel NVMe'deki bir memory-mapped file içinde tutmak, kalan ağırlıkların birleşik bellekte kalmasını sağlar.

GPU, memory-mapped tabloya CPU'nun page table'ları üzerinden erişir. Son erişilen dosya sayfaları birleşik bellekte kalır; bu uygulamada page cache için 8 GiB bütçe ayrılır. Yapılandırma, KV cache ve recurrent state havuzlarına yaklaşık 12–18 GB bırakır; aynı anda çalışan istek sayısını sekizle sınırlar.

| Eşzamanlılık (C) | TTFT (ms) | İstek başına TPS (token/s) |
|---|---|---|
| 1 | 301,9 | 28,5 |
| 2 | 392,7 | 23,6 |
| 4 | 566,0 | 17,1 |
| 8 | 762,6 | 11,8 |

**Bu sonuç neden değerlidir?** Model, tek masaüstü cihazında **C=1'de 28,5 token/s ve 302 ms TTFT** ile çalışır. C=2'de **istek başına 23,6 token/s ve 393 ms TTFT** sağlayarak Gezgin'in varsayılan hedeflerini karşılar. C=4'te istek başına **17,1 token/s**, C=8'de 11,8 token/s elde edilir. Ortalama TTFT, test edilen her seviyede bir saniyenin altında kalır. Ölçümler, düşük eşzamanlılıkta etkileşimli yerel inference kullanımını destekler.

Başlangıç süresi işletim açısından dikkate alınmalıdır: bu uygulama her açılışta tablo dosyasını yeniden yazar. İşlem yeni bir dosyayla yaklaşık 10 dakika, önceki dolu dosya yerinde kaldığında ise 55 dakika sürer. Çalışan servis yukarıdaki yanıt hızlarını sağlasa da yeniden başlatmalarda bu süre önemlidir.

### 6.5. Tek RTX PRO 6000 üzerinde Qwen3.8-Flash-Next: host memory offloading ile modeli sığdırmak

Aynı **132,7 GB'lık NVFP4 checkpoint**, kartın **96 GB'lık ayrı GPU belleğini** aşar. Pinned memory offloading uygulaması, 47,7 GiB'lık FP8 tabloyu ayrı sistem RAM'ine yerleştirerek kalan model ağırlıklarının GPU'ya sığmasını sağlar. Pinned tahsis ve ek pay için host üzerinde en az 64 GB boş RAM gerekir; istenen satırlar GPU'ya PCIe üzerinden ulaşır.

Cookbook, KV cache ve recurrent state havuzlarına **8,3 GiB** ayrıldığını bildirir. Test edilen yapılandırma, BF16 recurrent state ve değiştirilmiş cache politikasıyla aynı anda 16 çalışan isteğe izin verir.

| Eşzamanlılık (C) | TTFT (ms) | İstek başına TPS (token/s) |
|---|---|---|
| 1 | 139,2 | 155,8 |
| 2 | 195,8 | 120,0 |
| 4 | 220,6 | 90,8 |
| 8 | 252,3 | 63,7 |
| 16 | 257,2 | 43,2 |
| 32 | 3.222,7 | 22,2 |

**Bu sonuç neden değerlidir?** Yapılandırma, **C=1'de 155,8 token/s**, **C=16'da istek başına 43,2 token/s** sağlar; bu aralıktaki tüm seviyelerde ortalama TTFT 260 ms'nin altındadır. Checkpoint'in tamamı kartın belleğini aşmasına rağmen C=16'ya kadar test edilen tüm seviyeler Gezgin'in varsayılan gecikme ve TPS hedeflerini karşılar. C=32'de istekler, çalışan 16 isteğin arkasında kuyruğa girer ve ortalama TTFT üç saniyeyi aşar. TPS 20 token/s'nin üzerinde kalsa da C=32 varsayılan TTFT hedefini karşılamaz.

Bu gözlemler, ölçülen kısa prompt iş yükü için geçerlidir. Daha uzun prompt'lar, çıktılar ve konuşma geçmişleri, uygulamanın gecikme hedefleriyle ayrıca değerlendirilmelidir.

---

## 7. Değerlendirme

### 7.1. Model zaten sığıyorsa: bellek ve NVMe tercihi

8× Spark DeepSeek karşılaştırması, belleğin nasıl paylaştırılacağına karar vermek için yararlıdır. İki yapılandırma aynı modeli aynı donanımda çalıştırır: Engram'ı bellekte tutmak daha yüksek ölçülen TPS sağlar; diske taşımak ise KV cache için daha fazla bellek bırakır. Tercih, ek KV cache kapasitesinin uygulama için gözlenen hız farkını kabul etmeye değip değmediğine bağlıdır.

### 7.2. GPU belleğini aşan modelleri çalıştırmak

4× Spark DeepSeek ve tek cihazlı Qwen çalıştırmaları farklı bir faydayı gösterir: checkpoint ve çalışma zamanı bellek ihtiyaçları mevcut kapasiteyi aşmasına rağmen lookup tablolarının offload edilmesi, kullanılabilir istek başına hızlarla inference yapılmasını sağlar. Bölüm 6'daki sonuçlar, hem tek istek deneyimini hem de eşzamanlılık arttığında oluşan değişimi ayrı ayrı gösterir.

İş yüküne özel planlama için [LLM Çıkarım Benchmark Gezgini]({{ '/llm-inference-benchmarks/' | relative_url }}), ölçülen TTFT/TPS eğrilerini ve seçilen TTFT/TPS hedeflerine göre değerlendirmeyi sunar. Kapasite tahminleri planlama içindir; offloading kullanılan bir çalıştırmaya uygulamadan önce, tahminin gerçek tablo yerleşimini ve state havuzlarını hesaba katıp katmadığını kontrol edin. Gecikme ve TPS hedefleri için ölçülen eşzamanlılık taramasını kullanın; bellek kapasitesini offloading yapılandırması için ayrıca doğrulayın.

### 7.3. Model yeteneği

Qwen3.8-Flash-Next'in Gezgin'deki kayıtlı veride **Artificial Analysis Intelligence Index puanı 39,8**'dir. Bu harici benchmark skoru, ölçülen inference performansının yanında model seçimi için bağlam sağlar. Modeli tanımlar; kuantize dağıtımın belirli bir görevdeki başarısını doğrulamaz.

*Intelligence Index v4.3, [Artificial Analysis](https://artificialanalysis.ai) tarafından yayımlanmıştır. Veri 28 Eylül 2026'da alınmış ve kaynak gösterilerek kullanılmıştır.*

Kullanılan checkpoint'i yanıt hızının yanında hedef görevler üzerinde de değerlendirin. Pratik kazanım, mevcut cihazda uygulamanın gereksinimlerini karşılayan performansla yetenekli bir modele erişebilmektir.

### 7.4. İşletim gereksinimleri

Aşağıdaki gereksinimler, indirilen checkpoint'in depolanmasına ek olarak değerlendirilmelidir:

| Gereksinim | DeepSeek-V4.1-Flash, DGX Spark | Qwen3.8-Flash-Next, DGX Spark | Qwen3.8-Flash-Next, RTX PRO 6000 |
|---|---|---|---|
| Offloading için ek depolama | Her düğümün NVMe'sinde Engram tabloları | Tablo için ~51,2 GB (47,7 GiB), ayrıca yükleme için boş alan | Checkpoint dosyaları dışında gerekmez |
| Host belleği | Ortak havuzda staging buffer'ları | Ortak havuzda page cache | Pinned tahsis ve ek pay için ≥64 GB boş RAM |
| Başlangıç | Patch uygulanmış loader, tabloları NVMe'de hazırlar | Tablo dosyası her başlangıçta yazılır (10–55 dk) | Tablo RAM'e yüklenir |
| Yazılım desteği | GB10 için Engram-on-disk yolu dahil gerekli topluluk patch'leri | Dosya tabanlı offloading için uyumlu SGLang build'i gerekir | SGLang cookbook imajında desteklenir |

---

## 8. Conditional Memory ile Boyutlandırma

### 8.1. Güncellenmiş bellek bütçesi

Desteklenen conditional memory modellerinde GPU belleğini ve offloading hedefini ayrı bütçeleyin:

> **Gerekli GPU belleği (veya birleşik bellek) = Kalan model ağırlıkları + KV cache + Recurrent state havuzları + Activation'lar + Offloading buffer'ları ve cache'lenen sayfalar + Çalışma zamanı ek bellek kullanımı**
>
> **Ek host RAM veya NVMe alanı = Offload edilen tablolar + Yükleme buffer'ları / boş alan payı**

Spark'ta işletim sistemi de birleşik belleği kullanır. Cache'lenen dosya sayfaları bu ortak bütçeye dahil edilmelidir. Ayrı GPU belleği olan sistemlerde pinned tablolar ayrı host RAM'i kullanır. Dolayısıyla tablonun boşalttığı alan, istek kapasitesine bire bir dönüşmez.

Yerel LLM Kullanım Rehberi'nin ek bellek payı önerisini planlama başlangıcı olarak kullanın; ardından engine'in gerçek tahsisini ve en yüksek kullanımını kontrol edin. Yapılandırılan bellek kullanım oranı, checkpoint boyutuna genel bir yüzde eklemekle aynı şey değildir.

### 8.2. Boyutlandırma kontrol listesi

- ☐ Kullanılan checkpoint'in kalan model ağırlıklarını ve conditional memory tablolarını, hassasiyetleriyle birlikte ayrı belirleyin.
- ☐ Engine'in modeli ve hedefi desteklediğini doğrulayın: burada incelenen yapılandırmalarda pinned host RAM veya dosya tabanlı depolama.
- ☐ Offload edilen tablonun yanında bellekte kalan cache'leri, buffer'ları ve işletim sistemini de bütçeleyin.
- ☐ Gerekli bağlam ve eşzamanlılık için KV cache ve recurrent state havuzları ayırın; engine'in fiili sınırlarını kontrol edin.
- ☐ İş yükünün yanıt hızını ölçün; ilgili durumlarda başlangıç süresini ve cold cache performansını da değerlendirin.
- ☐ Model kalitesini hedef görevlerde doğrulayın; harici yetenek skoru yalnızca bir başlangıç noktasıdır.

Yaygın boyutlandırma hatası, her offloading yöntemini aynı kabul etmektir. Daha büyük bir modelin kullanılabilirliğine karar vermeden önce **hangi verinin taşındığını, ne kadarına erişildiğini ve ne zaman hazır olması gerektiğini** kontrol edin.

---

## 9. Sınırlamalar

- **8 düğümlü karşılaştırma dağıtım yapılandırmalarını kapsar.** Tablo yerleşimi, bağlam sınırları, bellek ayarları ve yürütme yolları farklıdır; ölçülen denge bu yapılandırmalar için geçerlidir.
- **Tek bir OpenZeka iş yükü.** Dağıtım ölçümlerinde yaklaşık 128 giriş token'ı ve 128 token çıktı sınırı kullanılmıştır. Boşalan KV cache alanının en çok önem taşıdığı uzun prompt'lar ve uzun konuşmalar ölçülmemiştir.
- **Page cache davranışı ayrı ölçülmemiştir.** DGX Spark'ta page cache'te bulunmayan satırlar NVMe'den okunur. Başlangıçtan sonraki ilk isteklerde cold cache etkisi ayrı değerlendirilmemiştir.
- **Yetenek skorları dağıtımı değil modeli tanımlar.** Intelligence Index harici bir benchmark'tır; kendi görevlerinizde değerlendirme yapmanın yerini almaz (Yerel LLM Kullanım Rehberi, §5.9).

---

## 10. Sonuç ve Geleceğe Bakış

**Bulguların özeti:**

| Soru | Yanıt |
|---|---|
| Conditional memory, GPU belleği dışında tutulabilir mi? | Evet — tablolar büyüktür; ancak her token için önceden bilinen adreslerden yalnızca birkaç kilobyte getirilir |
| Nereye taşınır? | DGX Spark'ta yerel NVMe'ye; RTX PRO 6000'de ayrı pinned host RAM'e |
| Aynı donanımdaki karşılaştırma ne gösterir? | 8× Spark'ta disk yapılandırması düğüm başına ~21 GB daha fazla KV cache tahsisi bildirir; TPS, C=1'de %7,5, C=8'de %14 daha düşüktür |
| Daha küçük yapılandırmalar hangi performansı sağlar? | 4× Spark'ta DeepSeek: C=1'de 29,5 token/s; tek Spark'ta Qwen: C=1'de 28,5 token/s; RTX PRO 6000'de Qwen: C=16'da istek başına 43,2 token/s |
| Ne kazandırır? | Normalde sığmayan modellerin çalışması (4× DGX Spark'ta 763B, tek DGX Spark veya RTX PRO 6000'de 132,7 GB checkpoint) ve daha fazla KV cache kapasitesi (8× DGX Spark'ta yapılandırılan sınır 300K → 1M) |
| Maliyeti nedir? | Başlangıç süresi, NVMe alanı veya pinned host RAM ve engine desteğine bağımlılık |

**Geleceğe bakış.** Model mimarileri, hesaplanması gereken bileşenlerle yalnızca saklanması gereken verileri giderek daha belirgin biçimde ayırıyor. Mixture-of-Experts, aktif parametreleri toplam parametrelerden ayırdı; conditional memory ise erişim örüntüsü daha yavaş bellek katmanlarına uygun büyük bir parametre havuzu ekliyor. Mimariler ve inference engine'ler geliştikçe aynı donanım, uygun bileşenler için host RAM ve depolamayı kullanarak daha yetenekli modelleri destekleyebilir. Bu faydanın gerçekleşmesi; kalan ağırlıklar ve istek state'i için yeterli GPU belleği, verimli veri aktarımı ve kabul edilebilir ölçülen gecikme gerektirir.

---

## Sözlük (Terimler)

- **Aktif parametreler:** Bir token için kullanılan parametreler; hassasiyetleri ve yeniden kullanımları ağırlık trafiğini etkiler.
- **Checkpoint:** Kaydedilmiş model ağırlıkları ve ilişkili metadata; dosya boyutu ile çalışma zamanı bellek kullanımı farklı büyüklüklerdir.
- **Conditional memory:** Giriş token'larının hash'lenmiş n-gram'larıyla adreslenen ve belirli katmanlarda hidden state ile birleştirilen öğrenilmiş vektör tablosu.
- **Decode:** Yanıtın token'lar halinde üretilmesi; küçük batch boyutlarında çoğunlukla bellek bant genişliğiyle sınırlıdır.
- **Embedding:** Bir token'ı veya token dizisini temsil eden öğrenilmiş vektör.
- **Engram:** DeepSeek'in conditional memory için kullandığı ad; DeepSeek-V4.1-Flash'ta bulunur.
- **Gated DeltaNet:** Büyüyen KV cache yerine istek başına sabit boyutlu state tutan linear attention katmanı.
- **Hash head:** Bir n-gram'ı tablo satırına eşleyen bağımsız hash fonksiyonlarından biri.
- **Hidden state:** Token'ın model katmanlarından geçerken taşıdığı vektör temsili.
- **KV cache:** Cache'lenen attention key ve value vektörleri; boyutu attention mimarisine, bağlam uzunluğuna, hassasiyete ve eşzamanlı isteklere bağlıdır.
- **Memory-mapped file:** Bellek adresleri üzerinden erişilebilen dosya; sayfaları ilk erişimde diskten yüklenir ve page cache'te tutulur.
- **N-gram:** Art arda gelen n token'dan oluşan dizi (bigram: 2, trigram: 3).
- **Offloading:** Model verisinin bir bölümünü GPU belleği yerine daha yavaş ve daha büyük bir bellek katmanına (host RAM, NVMe) yerleştirme.
- **Page cache:** İşletim sisteminin son okunan dosya sayfalarını RAM'de tuttuğu cache.
- **Pinned (page-locked) memory:** İşletim sisteminin yerini değiştiremediği veya swap'e taşıyamadığı, ayrı GPU'nun doğrudan okuyabildiği host belleği.
- **PLE tablosu:** SGLang'in Qwen3.8-Flash-Next n-gram embedding tablosu için kullandığı ad.
- **Prefetching:** Veriyi ihtiyaç duyulan katman çalışmadan önce getirerek aktarımın hesaplamayla örtüşmesini sağlama.
- **Prefill:** Yanıt üretiminden önce prompt'un işlenmesi; kuyrukta bekleme ve diğer maliyetlerle birlikte TTFT'ye katkıda bulunur.
- **Recurrent state:** Linear attention katmanının her dizi için güncellediği sabit boyutlu durum; servis sırasında caching ve speculative decoding için ek kopyalar gerekebilir.
- **Toplam parametreler:** Modelin tüm parametreleri; bellek kapasitesi ihtiyacını belirler.
- **TPS (tokens per second):** Bu çalışmada, çıktı token sayısının TTFT dahil toplam istek süresine bölünmesi.
- **TTFT (time to first token):** İsteğin gönderilmesinden ilk stream edilen token'a kadar geçen süre; varsa reasoning token'ı da dahildir.
- **Birleşik bellek (unified memory):** DGX Spark'ta (GB10) olduğu gibi CPU ve GPU'nun paylaştığı tek bellek havuzu.

---

## Kaynaklar

> Donanım değerleri, Yerel LLM Kullanım Rehberi'nde kullanılan NVIDIA veri sayfalarına dayanır. Mimari ayrıntılar model kartlarından, teknik raporlardan ve model yapılandırmalarından alınmıştır. Inference sonuçları, LLM Çıkarım Benchmark Gezgini'ndeki OpenZeka ölçümleridir. Bellek tahsisleri ve başlangıç süresi gözlemleri, bağlantıları verilen dağıtım raporları ile SGLang cookbook'tan alınmıştır.

**Modeller ve mimari:**

- DeepSeek-V4.1-Flash model kartı — <https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash>
- DeepSeek-V4.1-Flash teknik raporu — <https://arxiv.org/abs/2609.19969>
- Engram: hash'lenmiş n-gram embedding'leriyle conditional memory — <https://arxiv.org/abs/2601.07372>
- NVIDIA Qwen3.8-Flash-Next NVFP4 model kartı ve hassasiyet dağılımı — <https://huggingface.co/nvidia/Qwen3.8-Flash-Next-NVFP4>
- Qwen3.8-Flash-Next model kartı — <https://huggingface.co/Qwen/Qwen3.8-Flash-Next>
- Qwen3.8-Flash-Next teknik raporu — <https://arxiv.org/abs/2608.30320>

**Inference engine'ler ve offloading:**

- SGLang cookbook, Qwen3.8-Flash-Next (doğrulanmış tek cihaz yapılandırmaları) — <https://docs.sglang.io/cookbook/autoregressive/Qwen/Qwen3.8-Flash-Next>
- SGLang: DGX Spark üzerinde dosya tabanlı n-gram tablosu — <https://github.com/sgl-project/sglang/pull/39126>

**Donanım:**

- NVIDIA DGX Spark — <https://www.nvidia.com/en-us/products/workstations/dgx-spark/>
- NVIDIA RTX PRO 6000 Blackwell Workstation Edition — <https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/>
- NVIDIA DGX B300 — <https://www.nvidia.com/en-us/data-center/dgx-b300/>

**OpenZeka raporları ve araçları:**

- [Yerel LLM Kullanım Rehberi]({{ '/papers/yerel-llm-rehberi/' | relative_url }})
- [DeepSeek-V4.1-Flash 4× DGX Spark Dağıtımı]({{ '/papers/deepseek-v4.1-flash-4spark-deployment/' | relative_url }})
- [DeepSeek-V4.1-Flash 8× DGX Spark TP8 Dağıtımı]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/' | relative_url }})
- [LLM Çıkarım Benchmark Gezgini]({{ '/llm-inference-benchmarks/' | relative_url }})
- CordatusAI LLM Benchmark Tool — <https://github.com/CordatusAI/llm-benchmark>

**Yetenek skorları:**

- Artificial Analysis Intelligence Index — <https://artificialanalysis.ai>

---

### Notlar

- **Ölçümler:** Dağıtım hızları, CordatusAI LLM Benchmark Tool ile yapılan OpenZeka çalıştırmalarından gelir (yaklaşık 128 giriş token'ı, en fazla 128 çıktı token'ı, ortalama değerler). DeepSeek-V4.1-Flash çalıştırma yapılandırmaları iki DeepSeek raporunda belgelenmiştir; Qwen3.8-Flash-Next çalıştırmaları SGLang cookbook'un doğrulanmış tek cihaz yapılandırmalarını kullanmıştır.
- **Tahminler:** Token başına embedding byte miktarı model yapılandırmalarından hesaplanır. Gerçek bellek ve depolama trafiği, caching'e ve aktarım granülerliğine bağlıdır. Checkpoint dosya boyutları, çalışma zamanı bellek ölçümleri değildir.
- **Güncellik:** Engine'lerde offloading desteği hızla gelişmektedir; burada açıklanan flag'ler ve sınırlamalar Eylül 2026 itibarıyla geçerlidir.

---

<p><img src="{{ '/papers/yerel-llm-rehberi/images/openzeka-logo.png' | relative_url }}" alt="OpenZeka" width="220"/></p>

**LLM altyapınızı birlikte planlayalım.** Model mimarisini, bellek hiyerarşisini ve offloading'i hesaba katan donanım boyutlandırması için OpenZeka ile iletişime geçin: [support@openzeka.com](https://openzeka.com/iletisim/) · [openzeka.com](https://openzeka.com)
