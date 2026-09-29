---
title: LLM Çıkarımında Conditional Memory ve Offloading
parent: White Papers
nav_order: 2
lang: tr
page_id: conditional-memory-offloading
date: 2026-09-29
card_tag: "Teknik Rehber"
description: >-
  Model mimarisinin, hangi verinin GPU belleğinde kalması gerektiğini ve hangi
  verinin sistem RAM'ine veya NVMe'ye taşınabileceğini nasıl belirlediği:
  conditional memory, DGX Spark, RTX PRO 6000 ve DGX B300 bellek hiyerarşileri,
  DeepSeek-V4.1-Flash ve Qwen3.8-Flash-Next ile ölçülen sonuçlar.
permalink: /papers/conditional-memory-offloading/
last_modified_date: 2026-09-29
toc: true
---

> **Yayın tarihi:** Eylül 2026
> **Kapsam:** LLM'lerin çıkarım sırasında belleği nasıl kullandığı, mimari tercihlerin bu kullanımı nasıl değiştirdiği, DGX Spark, RTX PRO 6000 ve DGX B300 bellek hiyerarşileri arasındaki farklar ve offloading'in olanakları ile sınırları. Değerlendirme, OpenZeka'nın DeepSeek-V4.1-Flash ve Qwen3.8-Flash-Next ölçümlerine dayanır.
> **Not:** Model adları, yazılım sürümleri ve ölçüm sonuçları Eylül 2026 itibarıyla geçerlidir. Çıkarım motorlarındaki offloading desteği hızla değişmektedir; temel soru, her adımda ne kadar veriye ihtiyaç duyulduğu ve bu verinin ne zaman hazır olması gerektiğidir.

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## Yönetici Özeti

- **Bellek bütçesinden başlayın.** [Yerel LLM Kullanım Rehberi]({{ '/papers/yerel-llm-rehberi/' | relative_url }}), donanım boyutlandırmasında VRAM'i temel kısıt olarak ele alır. Conditional memory, hangi model parametrelerinin GPU belleğinde kalması gerektiğini değiştirir.
- **Her token için tüm parametreler okunmaz.** Burada incelenen iki model de dahil olmak üzere bazı yeni modeller, DeepSeek'in **conditional memory** adını verdiği yapıyı kullanır: hash ile adreslenen n-gram embedding'lerinden oluşan büyük arama tabloları. Bu bileşen DeepSeek-V4.1-Flash'ta *Engram*, Qwen3.8-Flash-Next'te *n-gram embedding tablosu* olarak adlandırılır; SGLang ise tabloya PLE der. Her token için yalnızca birkaç kilobayt embedding verisi gerekir ve gerekli satırlar, ileri yayılım başlamadan token ID'lerinden belirlenebilir.
- **Depolama ihtiyacı ile bellek trafiği farklı şeylerdir.** Büyük tablolardan her token için yalnızca birkaç satır okunur. Küçük aktarımlar ve önceden getirme, düşük ek yükle offloading yapılmasını mümkün kılar. Etkin ağırlık matrislerini veya attention önbelleklerini sürekli taşımak ise çok daha fazla veri aktarımı gerektirir.
- **Verinin nereye taşınabileceğini cihazın bellek mimarisi belirler.** **DGX Spark**'ta CPU ve GPU aynı birleşik belleği paylaşır; bu nedenle tablo NVMe'de tutulur, sık erişilen sayfalar RAM'deki önbellekte kalır. **RTX PRO 6000**'in ayrı GPU belleği vardır; tablo, PCIe üzerinden erişilen sabitlenmiş sistem RAM'ine taşınır. **DGX B300** üzerindeki dört GPU'lu DeepSeek yapılandırmasında ise tabloları da tutacak kadar GPU belleği bulunur.
- **Ölçülen sonuçlar:** 763B parametreli DeepSeek-V4.1-Flash, 196B parametreli Engram tabloları NVMe'ye taşınarak 4× DGX Spark üzerinde çalıştırılmıştır. 8× DGX Spark üzerinde tabloların NVMe'ye taşınması, raporlanan KV cache tahsisini düğüm başına yaklaşık 21 GB artırmış ve yapılandırılan bağlam sınırını 300K'dan 1M token'a çıkarmıştır. 132,7 GB'lık kuantize checkpoint'e sahip Qwen3.8-Flash-Next ise tek DGX Spark ve tek RTX PRO 6000 üzerinde, aşağıda ele alınan eşzamanlılık seviyelerinde etkileşimli kullanıma uygun performans sağlamıştır.
- **İki pratik sonuç.** İki 8× DGX Spark yapılandırması, Engram'ı bellekte tutmak ile diske taşımak arasındaki dengeyi gösterir. 4× Spark ve tek cihazlı Qwen ölçümleri ise model ağırlıklarına ayrılabilecek belleği aşan checkpoint'lerle kullanılabilir bir çıkarım hizmeti sunulabildiğini gösterir.
- **Boyutlandırmaya etkisi:** GPU bellek bütçesine kalan model ağırlıklarını, KV cache'i, tekrarlayan durumu ve çalışma zamanı arabelleklerini; sistem RAM'i veya NVMe bütçesine ise taşınan tabloları ekleyin. Bu tasarımı daha fazla model benimserse, aynı cihaz yalnızca GPU belleğine bakıldığında beklenenden daha büyük modelleri çalıştırabilir.

---

## 1. Giriş

[Yerel LLM Kullanım Rehberi]({{ '/papers/yerel-llm-rehberi/' | relative_url }}), donanım boyutlandırmasına GPU belleğinden başlar: model ağırlıkları, KV cache, tekrarlayan durum ve çalışma zamanı arabellekleri belleğe sığmalıdır. Conditional memory bu bütçeye yararlı bir ayrım ekler. Öğrenilmiş parametrelerin bir bölümü, her token için yalnızca birkaç satırın okunduğu büyük tablolarda tutulur. Bu tabloları GPU belleği dışında saklamak, daha önce sığmayan bir modeli aynı cihazda kullanılabilir hale getirebilir.

Bu çalışma söz konusu ayrımı **mimariden dağıtıma** kadar izler: attention, uzman ve embedding bileşenlerinin erişim biçimleri neden farklıdır, bu farklar offloading'i nasıl etkiler ve OpenZeka'nın DGX Spark ile RTX PRO 6000 üzerindeki DeepSeek-V4.1-Flash ve Qwen3.8-Flash-Next ölçümleri ne gösterir? Donanım bölümünde DGX B300, CPU ve GPU belleği ayrı olan bir sistem örneği olarak ele alınır.

Odak, mekanizma ve bunun boyutlandırmaya etkisidir. Çalıştırma talimatları, bağlantıları verilen dağıtım raporlarında ve SGLang cookbook'ta bulunur.

---

## 2. LLM'ler Belleği Nasıl Kullanır?

### 2.1. Bellek kapasitesi, bant genişliği ve gecikme

**Bellek kapasitesi** ne kadar verinin sığacağını, **bellek bant genişliği** ise bu verinin ne hızda okunabileceğini belirler. Offloading, veriyi daha yavaş bir bağlantı üzerinden erişilen sistem RAM'ine veya depolamaya taşıyarak GPU belleğinde yer açar. Bunun iyi çalışıp çalışmayacağı; her adımda gereken veri miktarına, erişim gecikmesine ve verinin hesaplama sürerken getirilip getirilemeyeceğine bağlıdır.

Her token için birkaç kilobayt sağlayan 50 GB'lık bir tablo, hesaplamada tekrar tekrar kullanılan 50 GB'lık matrislerden çok daha az veri aktarımı gerektirir. Yalnızca depolama boyutuna bakarak, bir verinin GPU belleği dışına taşınmasının maliyeti belirlenemez.

### 2.2. Çıkarım sırasında belleği neler kullanır?

Yerel LLM Kullanım Rehberi'nin 4.3. bölümündeki bellek bütçesi burada da geçerlidir:

> **Toplam bellek = Model ağırlıkları + KV cache + Tekrarlayan durum + Aktivasyonlar + Ek yük**

| Bileşen | Tanım | Neye bağlı büyür? |
|---|---|---|
| **Model ağırlıkları** | Attention projeksiyonları, uzmanlar, embedding'ler ve çıkış katmanı gibi parametreler | Model boyutu ve hassasiyet |
| **KV cache** | Attention katmanlarının yeniden hesaplamaması için saklanan key ve value vektörleri | Bağlam uzunluğu × eşzamanlı istek sayısı |
| **Tekrarlayan durum (recurrent state)** | Gated DeltaNet gibi doğrusal attention katmanlarının sabit boyutlu durumu; servis arabellekleri ve kaydedilen kopyalar | Etkin istekler, önbellek politikası ve spekülatif kod çözme ayarları |
| **Aktivasyonlar ve ek yük** | Geçici arabellekler, CUDA bağlamı ve bellek ayırıcıdaki parçalanma | Batch ve prompt boyutları, motor ayarları |

Bu çalışma tabloya bir ayrım ekler: **model ağırlıklarının hepsi aynı biçimde kullanılmaz.** Bazıları tam matris olarak kullanılır, bazılarından ise yalnızca seçilen satırlar okunur. Bölüm 3 bu ayrımı açıklar.

### 2.3. Sık erişilen veriler neden GPU'ya yakın tutulur?

**Prefill (prompt işleme)** giriş token'larını işler; **decode (token üretimi)** yanıtı üretir. Küçük batch boyutlarında decode süresini çoğu zaman ağırlıkların okunması belirler. Bu nedenle bellek bant genişliği ilk tahmin için kullanılabilir:

> **Bant genişliğiyle sınırlı decode hızı (token/s) ≈ Etkin bellek bant genişliği (bayt/s) ÷ Üretilen token başına okunan veri (bayt)**

Hesaplama, kernel ek yükü, iletişim ve KV cache ya da tekrarlayan duruma erişim de hızı sınırlayabilir. Toplu işleme ve spekülatif kod çözme aynı ağırlıkları birden fazla token için kullandığından, her çıktı token'ı için ağırlıkların yeniden okunması gerekmez.

Sık erişilen veriyi GPU belleğinde tutmak, yürütme sırasında daha yavaş bir aktarımı beklemeyi önler. Hesaplamayı CPU'da yapmak veya ağırlıkları gerektiğinde GPU'ya aktarmak daha büyük modelleri çalıştırabilir; ancak performans iş yüküne ve uygulamaya bağlıdır. Conditional memory ise farklı bir olanak sunar: hesaplama GPU'da kalırken, sistem RAM'inde veya depolamadaki çok daha büyük bir tablodan az miktarda veri getirilir.

---

## 3. Mimari ve Bellek Erişimi

### 3.1. Standart attention ve MoE: her adımda ne okunur?

Transformer'da bir token'ın o andaki temsili, öğrenilmiş matrislerle çarpılarak **query, key ve value** vektörlerine dönüştürülür. Query, mevcut ve önceki token'ların key vektörleriyle karşılaştırılır. Normalizasyondan sonra attention ağırlıkları, value vektörlerinin nasıl birleştirileceğini belirler. Sonuç, sonraki projeksiyonlardan ve ileri beslemeli ağdan geçer.

Bu işlem iki ayrı bellek ihtiyacı doğurur:

- **Ağırlıklar** eğitim sırasında öğrenilir ve farklı isteklerde tekrar kullanılır. Yoğun projeksiyonlar ve ileri beslemeli katmanlar, her ileri yayılım adımında büyük matrisleri kullanır.
- **KV cache**, mevcut konuşma için hesaplanan key ve value vektörlerini tutar. Tam attention her decode adımında önceki bağlama eriştiğinden bu trafik bağlam uzunluğuyla artar.

GPU'da hızlı çalışmak için sık erişilen bu matrisler ve etkin önbellekler normalde GPU belleğinde tutulur. Bunları taşımak mümkündür; ancak tekrarlanan aktarımlar çıkarım gecikmesini belirleyen ana etken haline gelebilir.

**Mixture-of-Experts (MoE)**, ileri beslemeli bölümü değiştirir: bir yönlendirici (router) her token için birkaç uzman (expert) ağ seçer. Toplam parametre sayısı depolama ihtiyacını, seçilen uzmanlar ise ağırlık trafiğinin büyük bölümünü belirler. Hesaplama azalır; fakat seçilen uzmanın matrisleri yine de kullanılır. Öğrenilmiş bir yönlendirici uzmanları mevcut gizli durumdan (hidden state) seçtiği için seçim ancak ileri yayılım sırasında belli olur. Uzmanları önbelleğe almak ve önceden getirmek yardımcı olabilir; ancak önbellekte bulunmayan bir uzmanı getirmek, birkaç embedding satırını getirmekten çok daha maliyetlidir.

### 3.2. Bellek ihtiyacını azaltan attention mimarileri

Bazı mimari değişiklikler önbelleğin boyutunu veya her adımda okunan bölümünü azaltır:

| Mimari | Ne değişir? | Bellek yerleşimine etkisi |
|---|---|---|
| **Grouped-query attention (GQA)** | Birden fazla query head aynı key ve value vektörlerini paylaşır | KV cache küçülür; decode sırasında etkin önbelleğe yine erişilir |
| **Sıkıştırılmış / seyrek attention** | Sıkıştırılmış temsiller saklanır veya konumların bir alt kümesi seçilir | Depolanan veya okunan veri azalır; aktarım maliyetini seçim yöntemi ve önbellek düzeni belirler |
| **Doğrusal attention hibritleri** | Bazı katmanlar her token için key ve value saklamak yerine sabit boyutlu bir durumu günceller | Bağlama bağlı depolama azalır; durum yine her adımda okunur ve güncellenir |

Örneğin Qwen3.8-Flash-Next, her dört katmanın üçünde Gated DeltaNet, kalanında seyrek attention kullanır. DeepSeek-V4.1-Flash ise attention önbelleklerini sıkıştırır ve katmanlar arasında paylaşır. Bu değişiklikler isteklere daha fazla bellek bırakır; ancak kalan durumun düşük maliyetle taşınabileceği anlamına gelmez.

**Conditional memory, bu katmanların yanında yer alan ek bir bileşendir.** Offloading açısından avantajı, aşağıda açıklanan arama biçiminden gelir; attention hesaplamasının GPU dışına taşınmasını gerektirmez.

### 3.3. Conditional memory: token ID'lerinden öğrenilmiş vektörlere

**Embedding**, sayılardan oluşan öğrenilmiş bir vektördür. Standart giriş embedding tablosu, her token ID'sini bir satırla eşler. Conditional memory bu yaklaşımı **n-gram** adı verilen kısa token dizilerine genişletir ve ağın hesapladığı temsilin yanında, yan yana gelen token'lar hakkında öğrenilmiş bilgi sağlar.

Terim, DeepSeek tarafından [Engram makalesinde](https://arxiv.org/abs/2601.07372) ortaya konmuştur ve henüz bu teknik için genel kabul görmüş bir ad değildir: Qwen kendi sürümünü n-gram embedding olarak tanımlar, SGLang ise tabloya PLE der. Türkçede yerleşik bir karşılığı olmadığından bu çalışmada her ikisi için de *conditional memory* terimi kullanılır.

Tablodan veri getirme ile bu veriyi kullanan hesaplama ayrı işlemlerdir:

1. **Anahtarı oluşturma.** Son token ID'leri alınır: bigram için iki, trigram için üç token. Örneğin `[a, b, c]` ID'lerinden `[b, c]` ve `[a, b, c]` son ekleri elde edilir. Bir token; kelime, kelime parçası veya başka bir metin parçası olabilir.
2. **Hash ile satır adresini belirleme.** Her hash fonksiyonu bu kısa diziyi bir satır adresine dönüştürür. Birden fazla hash fonksiyonu kullanılması, iki dizi bir tabloda aynı adrese düşse bile birkaç farklı öğrenilmiş vektör elde edilmesini sağlar. Tüm satırlarda arama yapılmaz.
3. **Embedding'leri getirme.** Adreslenen satırlar okunur ve birleştirilir. Tablo, çıkarım sırasında değişmeyen öğrenilmiş model verisidir; konuşma önbelleği veya belge veritabanı değildir.
4. **Gizli durumla birleştirme.** Projeksiyonlar getirilen vektörü dönüştürür; mevcut gizli durumdan hesaplanan bir kapı (gate), vektörün katkısının ne kadar olacağını belirler. Böylece aynı satırlar farklı bağlamlarda farklı katkı sağlayabilir. Bu hesaplama GPU'da kalırken büyük tablo başka bir bellek katmanında tutulabilir.

Tablodan veri getirme ile bağlama bağlı kapının ayrılması [Engram mimarisinde](https://arxiv.org/html/2601.07372v2#S2) açıklanır. Qwen'in [n-gram embedding tasarımı](https://arxiv.org/html/2608.30320#S2.SS3) da genel olarak aynı yaklaşımı izler.

**Örnek — Qwen3.8-Flash-Next.** Her giriş konumu, 160 adet bir baytlık FP8 değerinden oluşan on altı satır okur (bigram ve trigram için sekizer hash fonksiyonu): yaklaşık **47,7 GiB**'lık bir tablodan yaklaşık **2,5 KB**. Tabloya satır eklemek, token başına okunan veriyi artırmadan öğrenilmiş parametre sayısını artırır.

**Önceden getirme neden mümkündür?** Satır adresleri, ileri yayılımdan önce bilinen token ID'lerine bağlıdır. Motor, önceki GPU katmanları çalışırken satırları getirmeye başlayabilir. Normal decode sırasında bu, henüz üretilmemiş gelecekteki çıktılar için değil, mevcut ve bilinen token için geçerlidir. Prefill sırasında ise prompt'un tüm ID'leri zaten bilinir. Tabloyu kullanan katmanın ilk katmanlardan sonra gelmesi, veriyi hesaplama sürerken getirmek için zaman kazandırır. Bu sürenin yeterli olup olmadığı motora ve bellek katmanına bağlıdır.

Standart giriş embedding'leri de satır aramasıyla çalışır. Conditional memory tablolarının büyük olması, bunları taşımayı GPU bellek ihtiyacını azaltmak için özellikle yararlı kılar. Giriş embedding ağırlıkları çıkış katmanıyla paylaşılıyorsa aynı tablo, sözlükteki token'ların skorlarını hesaplamak için de kullanılır; bu erişim biçimi girişteki aramadan farklıdır.

### 3.4. Karşılaştırma: offloading'i uygulanabilir kılan nedir?

| Veri | Erişim biçimi | Offloading açısından sonucu |
|---|---|---|
| **Yoğun projeksiyon ve ileri beslemeli ağırlıklar** | Her ileri yayılım adımında büyük matris okumaları | Ağırlık aktarımı, hesaplamanın beklemek zorunda kaldığı kritik yola girebilir |
| **MoE uzmanları** | Yalnızca seçilen matrisler; seçim çoğunlukla gizli duruma bağlıdır | Etkin küme küçüktür; ancak önbellekte bulunmama maliyeti yüksektir ve seçim geç belli olur |
| **Etkin KV cache** | Bağlama bağlı okumalar; tam attention önceki bağlama erişir | Uzun bağlamlar yüksek aktarım trafiği oluşturabilir |
| **Tekrarlayan durum** | Her adımda okunur ve güncellenir | Tekrarlanan okuma ve yazmalar aktarım ek yükü doğurabilir |
| **Conditional memory tabloları** | Token ID'lerinden adreslenen birkaç satır | Küçük aktarımlar ve önceden bilinen adresler, verinin hesaplama sürerken getirilmesine olanak tanır |

> **Pratik sonuç:** Büyük bir tablo, küçük aktarımlar ve veriyi getirmek için yeterli süre, bir bileşeni offloading için iyi bir aday yapar. Conditional memory, küçük aktarımları katman çalışmadan önce bilinen adreslerle birleştirir. Attention ve uzman offloading'i ise farklı dengeler gerektirir.

---

## 4. Cihazların Bellek Hiyerarşisi

### 4.1. Bellek katmanları

| Katman | Tipik kapasite | Erişim özelliği |
|---|---|---|
| **GPU belleği** (HBM, GDDR, birleşik LPDDR) | Cihaz başına onlarca veya yüzlerce GB | Tekrarlanan matris ve önbellek okumaları için yüksek bant genişliği |
| Ayrı GPU belleği olan sistemlerde **sistem RAM'i** | Yüzlerce GB ile birkaç TB | PCIe Gen5 x16, protokol ve yazılım ek yükünden önce her yönde teorik olarak yaklaşık 64 GB/s sağlar |
| **Yerel NVMe** | Birkaç TB | Daha yüksek kapasite; rastgele erişim ve sayfa hataları, bellekte hazır veriyi okumaktan daha maliyetlidir |

Aktarım süresi kabaca **veri miktarı ÷ bant genişliği** artı gecikme ve yazılım ek yüküdür; modeli yalnızca hesaplamayla örtüştürülemeyen kısım yavaşlatır. Küçük ve dağınık okumalarda gecikme ve önbellekleme, en yüksek bant genişliğinden daha belirleyici olabilir.

### 4.2. Birleşik bellek ve ayrı GPU belleği

Bellek mimarisi, verinin hangi hedefe taşınmasının GPU belleğinde gerçekten yer açacağını belirler.

**Ayrı GPU belleği (RTX PRO 6000, DGX B300).** GPU'nun kendi belleği, CPU'nun ise PCIe üzerinden erişilen ayrı sistem RAM'i vardır. Tabloyu GPU belleğinden sistem RAM'ine taşımak GPU belleğinde yer açar. Burada kullanılan uygulama, tabloyu **sabitlenmiş (pinned, page-locked) bellekte** tutar. İşletim sistemi bu sayfaları takas alanına taşıyamadığı için GPU gerekli satırları doğrudan okuyabilir.

**Birleşik bellek (DGX Spark).** GB10 içindeki CPU ve GPU, her iki işlemcinin de önbellek tutarlılığıyla eriştiği tek bir 128 GB LPDDR5X havuzunu paylaşır. Ayrı bir sistem RAM'i yoktur: tabloyu CPU belleği olarak ayırmak, ortak havuzdaki kullanımı azaltmaz; tabloyu sabitlemek de aynı 128 GB'tan yer kaplar. Dosya tabanlı uygulama, GB10'un sayfalanabilir belleğe işletim sisteminin sayfa tabloları üzerinden erişebilmesinden yararlanır. Tablo yerel NVMe'de tutulur; getirilen sayfalar önbellekte kaldıkları sürece birleşik bellekte yer kaplar. Tablonun aynı anda yalnızca bir bölümünün RAM'de bulunması yeterlidir.

### 4.3. Cihaz karşılaştırması

| | DGX Spark (GB10) | RTX PRO 6000 Blackwell | DGX B300 |
|---|---|---|---|
| Bellek mimarisi | CPU ve GPU'nun paylaştığı 128 GB havuz | 96 GB ayrı GPU belleği, ayrı sistem RAM'i | Her biri kendi HBM belleğine sahip sekiz GPU, ayrı sistem RAM'i |
| GPU bellek bant genişliği | 273 GB/s | 1,79 TB/s | GPU başına 8 TB/s |
| Tablonun konumu | Yerel NVMe, RAM'de sayfa önbelleğiyle | PCIe üzerinden sabitlenmiş sistem RAM'i | Dört GPU'lu DeepSeek yapılandırmasında GPU belleği |
| Boyutlandırmaya etkisi | Ortak havuzda işletim sistemi, sayfa önbelleği ve çalışma zamanı için pay ayrılmalı | Sistem RAM'i GPU belleğinden ayrı bütçelenmeli | Çok GPU'lu yapılandırmalarda bu checkpoint'ler için yeterli GPU belleği bulunur |

### 4.4. Conditional memory offloading'i neden düşük ek yükle çalışabilir?

Her adımda gigabaytlarca etkin ağırlık aktarmak, PCIe bant genişliğinin büyük bölümünü tüketebilir. Qwen'in token konumu başına ~2,5 KB embedding verisi ise çok daha az bant genişliği gerektirir. Adresler, embedding'i kullanacak katmandan önce de hazırlanabilir; böylece eşzamansız getirme işlemi diğer katmanlar çalışırken tamamlanabilir.

**Büyük bir tablonun düşük maliyetle taşınabilmesinin** mimari nedeni budur. Bunun için bu erişim biçiminden yararlanan bir uygulama gerekir. Sistem RAM'i ile NVMe de aynı değildir: dosya tabanlı bir tablodaki veri sayfa önbelleğinden gelebilir veya depolamayı beklemek gerekebilir. Okunan sayfalar istenen satırlardan çok daha büyük olabilir; prefill, toplu işleme ve spekülatif doğrulama da aranan konum sayısını artırır.

**Mekanizmanın çalışabildiğine dair kanıt.** Engram makalesindeki H800 deneyinde, 4B ve 8B yoğun omurga modellere sistem belleğinde tutulan 100B parametreli bir tablo eklenmesi, Engram içermeyen karşılıklarına göre verimi yaklaşık %1,9 ve %2,8 düşürmüştür. Uygulama, veri getirmeyi ilk bloktaki hesaplamayla örtüştürmüştür. Sonuç, o sistem belleği uygulaması ve iş yükü için geçerlidir ([Engram, §6.4](https://arxiv.org/html/2601.07372v2#S6.SS4)).

Tablo değerleri değiştirilmeden taşındığında öğrenilmiş bilgi korunur: GPU'ya aynı satırlar gelir. Pratik soru, satırların zamanında gelip gelmediğidir. Bölüm 6 bundan doğan dağıtım seçeneklerini gösterir: 8× DGX Spark üzerinde bellek ile NVMe karşılaştırması ve daha küçük yapılandırmalarda, normalde sığmayan checkpoint'lerle kullanılabilir çıkarım.

---

## 5. İncelenen Modeller

### 5.1. DeepSeek-V4.1-Flash

| Özellik | Değer |
|---|---|
| Toplam parametre | 763B |
| — omurga | 552B |
| — Engram conditional memory | 196B |
| — görüntü kodlayıcı, projeksiyon katmanı, taslak model | ~15B |
| Token başına etkin parametre | Decode'da ~16B (prefill'de ~8B) |
| Attention | 128 token'lık kayan pencereli, sıkıştırılmış seyrek attention; katmanlar arasında paylaşılan KV cache |
| Engram | Katman indeksleri 1 ve 14 (sıfırdan başlayarak); bigram, trigram ve 4-gram; her n-gram uzunluğu için 8 hash fonksiyonu; satır başına 256 değer |
| Azami bağlam uzunluğu | 1.048.576 token (yaklaşık 1M) |
| Checkpoint boyutu | 510,3 GB; FP8 yoğun ve Engram ağırlıkları ile FP4 uzmanlardan oluşan karma hassasiyet |

[Model kartı](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash), 552B'lik omurgayı Engram'dan ve yardımcı modüllerden ayrı belirtir.

### 5.2. Qwen3.8-Flash-Next

| Özellik | Değer |
|---|---|
| Parametreler | 125B temel model + 51B n-gram embedding + 4B çoklu token tahmini (MTP) modülü |
| Token başına etkin parametre | 6B |
| Attention | 36 Gated DeltaNet ve 12 Qwen Sparse Attention (QSA) katmanı; QSA, en fazla 512 adet dört token'lık blok ile sondaki tamamlanmamış bloğu seçer |
| N-gram tablosu | Katman indeksi 2 (sıfırdan başlayarak); bigram ve trigram için sekizer hash fonksiyonu; 160 değerlik 16 satırdan oluşan 2.560 boyutlu vektör |
| Yapılandırılan bağlam sınırı | 262.144 token |
| Kullanılan checkpoint | `nvidia/Qwen3.8-Flash-Next-NVFP4`; 132,7 GB (123,6 GiB) safetensors dosyası |
| Ağırlık hassasiyeti | Ana modelde NVFP4 yönlendirilen uzmanlar; BF16 attention ve paylaşılan uzmanlar; FP8 MTP uzmanları ve n-gram tablosu |

### 5.3. Model boyutu ve bellek ihtiyacı

| Model | Checkpoint boyutu | Conditional memory tablosu | Checkpoint'in kalanı | Bu çalışmada tablonun taşınmasını gerektiren yapılandırmalar |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 510,3 GB | ~196,6 GB | ~313,7 GB | 4× DGX Spark |
| Qwen3.8-Flash-Next, NVIDIA NVFP4 | 132,7 GB | ~51,2 GB (47,7 GiB) | ~81,5 GB | 1× DGX Spark; 1× RTX PRO 6000 |

GB 10⁹ bayt, GiB ise 2³⁰ bayt anlamına gelir. Checkpoint boyutları, kayıtlı revizyonlardaki safetensors dosyalarının toplamıdır (Qwen için [NVIDIA checkpoint dosyaları](https://huggingface.co/nvidia/Qwen3.8-Flash-Next-NVFP4/tree/fc694b54fb0174e0913e6adf86691ef85a4ead47)). Kalan boyut bir çıkarma işlemidir, yükleme sonrasındaki GPU bellek kullanımının ölçümü değildir; çalışma zamanı bellek değerleri Bölüm 6'da verilmiştir.

Offloading tabloyu başka bir bellek katmanına taşır; tablo modelin parçası olmaya devam eder. Böylece daha küçük yapılandırmalar, kalan ağırlıkları çıkarım için gereken bellekle birlikte tutabilir.

---

## 6. Benchmark Sonuçları

### 6.1. Metodoloji

Aşağıdaki dağıtım sonuçları, açık kaynaklı [CordatusAI LLM Benchmark Tool](https://github.com/CordatusAI/llm-benchmark) ile yapılan OpenZeka ölçümleridir. Yaklaşık 128 giriş token'ı ve 128 token'lık çıktı sınırı kullanılmış, her eşzamanlılık seviyesi on tur çalıştırılmış ve ortalama değerler raporlanmıştır. **Eşzamanlılık (C)**, aynı anda gönderilen istek sayısıdır. **TTFT (ilk token'a kadar geçen süre)**, kuyrukta bekleme ve prompt işleme süresini içerir; akış olarak gönderilen ilk akıl yürütme (reasoning) token'ı da sayılır. **TPS (saniyedeki token sayısı)**, çıktı token sayısının TTFT dahil toplam istek süresine bölünmesidir ve toplam verim olarak değil, istek başına raporlanır. Tüm sonuçlara [LLM Çıkarım Benchmark Gezgini]({{ '/llm-inference-benchmarks/' | relative_url }}) üzerinden de erişilebilir.

| Çalıştırma | Donanım | Motor, tensör paralelliği (TP) | Spekülatif kod çözme | Conditional memory |
|---|---|---|---|---|
| DeepSeek-V4.1-Flash | 4× DGX Spark | vLLM, TP=4 | DSpark, k=5 | NVMe |
| DeepSeek-V4.1-Flash, 300K | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | Bellekte |
| DeepSeek-V4.1-Flash, 1M | 8× DGX Spark | vLLM, TP=8 | DSpark, k=5 | NVMe |
| Qwen3.8-Flash-Next | 1× DGX Spark | SGLang, TP=1 | MTP, 3 spekülatif adım / 4 taslak token | NVMe |
| Qwen3.8-Flash-Next | 1× RTX PRO 6000 | SGLang, TP=1 | MTP, 3 spekülatif adım / 4 taslak token | Sabitlenmiş sistem RAM'i |

**İki 8× DGX Spark DeepSeek yapılandırması**, aynı donanımda tablonun farklı yerleşimlerini karşılaştırır. Diğer çalıştırmalar farklı bir boyutlandırma sorusunu yanıtlar: model offloading ile sığdıktan sonra yapılandırma nasıl bir çıkarım performansı sunar? Bunların sonuçları aşağıda ayrı ayrı değerlendirilmiştir.

### 6.2. 4× DGX Spark üzerinde DeepSeek-V4.1-Flash: Engram-on-disk ile modeli sığdırmak

510 GB'lık checkpoint dört düğüme bölündüğünde düğüm başına yaklaşık 128 GB gerekir. İşletim sistemi, CUDA bağlamı ve KV cache hesaba katıldığında bu, bir DGX Spark'ın modele ayırabileceğinden fazladır. **Engram-on-disk** ile her düğüm, Engram satırlarından kendi payını yerel NVMe'de tutar ve her adımın ihtiyaç duyduğu satırları ileri yayılımdan önce GPU belleğine hazırlar. Böylece kalan ağırlıklar yüklenebilir. Benchmark sonuçları şöyledir:

| Eşzamanlılık (C) | TTFT (ms) | İstek başına TPS (token/s) |
|---|---|---|
| 1 | 271,6 | 29,5 |
| 2 | 395,8 | 21,3 |
| 4 | 577,4 | 13,1 |
| 8 | 805,9 | 8,8 |

**Bu sonuç neden değerlidir?** 763B parametreli model, dört masaüstü cihazında **C=1'de istek başına 29,5 token/s ve 272 ms TTFT** ile çalışır. C=2'de **21,3 token/s ve 396 ms TTFT** ile Gezgin'in en az 20 token/s ve en fazla 1.000 ms TTFT olan varsayılan hedeflerini karşılar. Daha yüksek eşzamanlılık da mümkündür, ancak yanıtlar yavaşlar: C=4'te 13,1 token/s, C=8'de 8,8 token/s ölçülmüştür. Bu iş yükünde yapılandırma, düşük eşzamanlılıkta etkileşimli kullanımı destekler.

### 6.3. 8× DGX Spark üzerinde DeepSeek-V4.1-Flash: tablo bellekte ve NVMe'de

Sekiz düğümde checkpoint her iki yerleşimde de sığar; bu da iki dağıtım yapılandırmasının karşılaştırılmasını mümkün kılar. DGX Spark'ta tabloyu "sistem belleğinde" tutmak da ortak 128 GB havuzu kullanır. Tabloyu NVMe'ye taşımak, önbellekteki sayfalar ve ara arabellekler dışında bu kullanımı ortadan kaldırır.

| Ölçüt | Engram bellekte | Engram NVMe'de |
|---|---|---|
| Düğüm başına Engram belleği (raporlanan) | 23,6 GB | Yalnızca gerekli satırlar ve ara arabellekler |
| Düğüm başına KV cache tahsisi (raporlanan) | ~8,7 GB | ~30 GB |
| Yapılandırılan bağlam sınırı | 300K token | **1M token** |
| C=1'de TTFT | 213 ms | 199 ms |
| C=1 / C=8'de istek başına TPS (token/s) | 36,0 / 13,6 | 33,3 / 11,7 |

**Pratik denge:** disk yapılandırması, **C=1'de 33,3 token/s** ve **C=8'de istek başına 11,7 token/s** sağlarken düğüm başına raporlanan KV cache tahsisini yaklaşık **21 GB artırır**. Bellekteki yapılandırmaya göre TPS sırasıyla %7,5 ve %14 daha düşüktür. Tabloyu bellekte tutan yapılandırmanın ölçülen TPS'i daha yüksek, disk yapılandırmasının KV cache'e ayırdığı bellek ise daha fazladır.

Bu, iki dağıtım yapılandırmasının bütün olarak karşılaştırmasıdır: bağlam sınırları, bellek ayarları ve yürütme yolları da farklıdır ([8× raporuna]({{ '/papers/deepseek-v4.1-flash-8spark-deployment/' | relative_url }}) bakınız). Yapılandırılan bağlam sınırı 300K'dan 1M token'a çıkar. Benchmark kısa prompt'larla yapılmıştır; azami bağlam uzunluğu test edilmemiştir.

### 6.4. Tek DGX Spark üzerinde Qwen3.8-Flash-Next: 132,7 GB'lık checkpoint'i sığdırmak

**132,7 GB'lık NVIDIA NVFP4 checkpoint**, işletim sistemi, KV cache ve çalışma zamanı arabellekleriyle birlikte tek bir Spark'ın belleğinde bütünüyle tutulamaz. **47,7 GiB'lık FP8 n-gram tablosunu** yerel NVMe'de belleğe eşlenmiş bir dosyada tutmak, kalan ağırlıkların birleşik bellekte kalmasını sağlar.

GPU, belleğe eşlenmiş tabloya CPU'nun sayfa tabloları üzerinden erişir. Son erişilen dosya sayfaları birleşik bellekte kalır; bu uygulamada sayfa önbelleği için 8 GiB'lık bir bütçe ayrılır. Yapılandırma, KV cache ve tekrarlayan durum havuzlarına yaklaşık 12–18 GB bırakır ve aynı anda çalışan istek sayısını sekizle sınırlar.

| Eşzamanlılık (C) | TTFT (ms) | İstek başına TPS (token/s) |
|---|---|---|
| 1 | 301,9 | 28,5 |
| 2 | 392,7 | 23,6 |
| 4 | 566,0 | 17,1 |
| 8 | 762,6 | 11,8 |

**Bu sonuç neden değerlidir?** Model, tek bir masaüstü cihazında **C=1'de 28,5 token/s ve 302 ms TTFT** ile çalışır. C=2'de **istek başına 23,6 token/s ve 393 ms TTFT** ile Gezgin'in varsayılan hedeflerini karşılar. C=4'te istek başına **17,1 token/s**, C=8'de 11,8 token/s elde edilir. Ortalama TTFT, test edilen her seviyede bir saniyenin altında kalır. Ölçümler, düşük eşzamanlılıkta etkileşimli yerel çıkarımı destekler.

Başlangıç süresi işletim açısından dikkate alınmalıdır: bu uygulama her açılışta tablo dosyasını yeniden yazar. Bu işlem yeni bir dosyayla yaklaşık 10 dakika, önceki dolu dosya yerinde bırakıldığında ise 55 dakika sürer. Çalışan servis yukarıdaki yanıt hızlarını sağlasa da yeniden başlatmalarda bu süre önemlidir.

### 6.5. Tek RTX PRO 6000 üzerinde Qwen3.8-Flash-Next: tabloyu sistem RAM'ine taşıyarak modeli sığdırmak

Aynı **132,7 GB'lık NVFP4 checkpoint**, kartın **96 GB'lık GPU belleğini** aşar. Sabitlenmiş bellek uygulaması, 47,7 GiB'lık FP8 tabloyu ayrı sistem RAM'ine yerleştirerek kalan model ağırlıklarının GPU'ya sığmasını sağlar. Sabitlenmiş tahsis ve pay için sistemde en az 64 GB boş RAM gerekir; istenen satırlar GPU'ya PCIe üzerinden ulaşır.

Cookbook, KV cache ve tekrarlayan durum havuzlarına **8,3 GiB** ayrıldığını bildirir. Test edilen yapılandırma, BF16 tekrarlayan durum ve değiştirilmiş bir önbellek politikasıyla aynı anda 16 çalışan isteğe izin verir.

| Eşzamanlılık (C) | TTFT (ms) | İstek başına TPS (token/s) |
|---|---|---|
| 1 | 139,2 | 155,8 |
| 2 | 195,8 | 120,0 |
| 4 | 220,6 | 90,8 |
| 8 | 252,3 | 63,7 |
| 16 | 257,2 | 43,2 |
| 32 | 3.222,7 | 22,2 |

**Bu sonuç neden değerlidir?** Yapılandırma **C=1'de 155,8 token/s**, **C=16'da istek başına 43,2 token/s** sağlar ve bu aralığın tamamında ortalama TTFT 260 ms'nin altında kalır. Checkpoint'in tamamı kartın belleğini aşmasına rağmen C=16'ya kadar test edilen tüm seviyeler Gezgin'in varsayılan gecikme ve TPS hedeflerini karşılar. C=32'de istekler çalışan 16 isteğin arkasında kuyruğa girer ve ortalama TTFT üç saniyeyi aşar; TPS 20 token/s'nin üzerinde kalsa da C=32 varsayılan TTFT hedefini karşılamaz.

Bu gözlemler ölçülen kısa prompt iş yükü için geçerlidir. Daha uzun prompt'lar, çıktılar ve konuşma geçmişleri, uygulamanın gecikme hedeflerine göre ayrıca değerlendirilmelidir.

---

## 7. Değerlendirme

### 7.1. Model zaten sığıyorsa: bellek mi, NVMe mi?

8× Spark DeepSeek karşılaştırması, belleğin nasıl paylaştırılacağına karar verirken yararlıdır. İki yapılandırma aynı modeli aynı donanımda çalıştırır: Engram'ı bellekte tutmak ölçülen TPS'i yükseltir, diske taşımak ise KV cache için daha fazla bellek bırakır. Tercih, ek KV cache kapasitesinin uygulama için gözlenen hız farkına değip değmediğine bağlıdır.

### 7.2. GPU belleğini aşan modelleri çalıştırmak

4× Spark DeepSeek ve tek cihazlı Qwen çalıştırmaları farklı bir faydayı gösterir: checkpoint ve çalışma zamanı bellek ihtiyaçları mevcut belleği aşmasına rağmen arama tablolarının taşınması, istek başına kullanılabilir hızlarla çıkarım yapılmasını sağlar. Bölüm 6'daki sonuçlar hem tek istek deneyimini hem de eşzamanlılık arttığında olanları ayrı ayrı gösterir.

İş yüküne özel planlama için [LLM Çıkarım Benchmark Gezgini]({{ '/llm-inference-benchmarks/' | relative_url }}), ölçülen TTFT/TPS eğrilerini ve seçilen TTFT ile TPS hedeflerine göre değerlendirmeyi sunar. Kapasite tahminleri planlamaya yardımcıdır; offloading kullanan bir çalıştırmaya uygulamadan önce, tahminin gerçek tablo yerleşimini ve durum havuzlarını hesaba katıp katmadığını kontrol edin. Gecikme ve TPS hedefleri için ölçülen eşzamanlılık taramasını kullanın; bellek kapasitesini offloading yapılandırması için ayrıca doğrulayın.

### 7.3. Model yeteneği

Qwen3.8-Flash-Next'in Gezgin'de kayıtlı **Artificial Analysis Intelligence Index puanı 39,8**'dir. Bu harici benchmark puanı, ölçülen çıkarım performansının yanında model seçimi için bağlam sağlar. Puan modeli tanımlar; kuantize dağıtımın belirli bir görevdeki başarısını doğrulamaz.

*Intelligence Index v4.3, [Artificial Analysis](https://artificialanalysis.ai) tarafından yayımlanmıştır. Veri 28 Eylül 2026'da alınmış ve kaynak gösterilerek kullanılmıştır.*

Kullanılan checkpoint'i yanıt hızının yanında hedef görevler üzerinde de değerlendirin. Pratik kazanım, eldeki cihazda uygulamanın gereksinimlerini karşılayan performansla yetenekli bir modele erişebilmektir.

### 7.4. İşletim gereksinimleri

Aşağıdaki gereksinimler, indirilen checkpoint'in depolanmasına ek olarak değerlendirilmelidir:

| Gereksinim | DeepSeek-V4.1-Flash, DGX Spark | Qwen3.8-Flash-Next, DGX Spark | Qwen3.8-Flash-Next, RTX PRO 6000 |
|---|---|---|---|
| Offloading için ek depolama | Her düğümün NVMe'sinde Engram tabloları | Tablo için ~51,2 GB (47,7 GiB), ayrıca yükleme için boş alan | Checkpoint dosyaları dışında gerekmez |
| Sistem belleği | Ortak havuzda ara arabellekler | Ortak havuzda sayfa önbelleği | Sabitlenmiş tahsis ve pay için ≥64 GB boş RAM |
| Başlangıç | Yamalı yükleyici tabloları NVMe'de hazırlar | Tablo dosyası her başlangıçta yazılır (10–55 dk) | Tablo RAM'e yüklenir |
| Yazılım desteği | GB10 için Engram-on-disk yolu dahil gerekli topluluk yamaları | Dosya tabanlı offloading için uyumlu SGLang sürümü gerekir | SGLang cookbook imajında desteklenir |

---

## 8. Conditional Memory ile Boyutlandırma

### 8.1. Güncellenmiş bellek bütçesi

Desteklenen conditional memory modellerinde GPU belleğini ve tablonun taşındığı hedefi ayrı bütçeleyin:

> **Gerekli GPU belleği (veya birleşik bellek) = Kalan model ağırlıkları + KV cache + Tekrarlayan durum havuzları + Aktivasyonlar + Offloading arabellekleri ve önbellekteki sayfalar + Çalışma zamanı ek yükü**
>
> **Ek sistem RAM'i veya NVMe alanı = Taşınan tablolar + Yükleme arabellekleri / boş alan payı**

Spark'ta işletim sistemi de birleşik belleği kullanır ve önbellekteki dosya sayfaları bu ortak bütçeye dahil edilmelidir. Ayrı GPU belleği olan sistemlerde sabitlenmiş tablolar ayrı sistem RAM'inde yer kaplar. Dolayısıyla tablonun boşalttığı alan, istek kapasitesine bire bir yansımaz.

Yerel LLM Kullanım Rehberi'ndeki ek bellek payı önerisini planlama için başlangıç noktası olarak kullanın; ardından motorun gerçek tahsisini ve en yüksek kullanımını kontrol edin. Yapılandırılan bellek kullanım oranı, checkpoint boyutuna genel bir yüzde eklemekle aynı şey değildir.

### 8.2. Boyutlandırma kontrol listesi

- ☐ Kullanılan checkpoint'in kalan model ağırlıklarını ve conditional memory tablolarını, hassasiyetleriyle birlikte ayrı ayrı belirleyin.
- ☐ Motorun modeli ve hedefi desteklediğini doğrulayın: burada incelenen yapılandırmalarda sabitlenmiş sistem RAM'i veya dosya tabanlı depolama.
- ☐ Taşınan tablonun yanında bellekte kalan önbellekleri, arabellekleri ve işletim sistemini de bütçeleyin.
- ☐ Gerekli bağlam ve eşzamanlılık için KV cache ve tekrarlayan durum havuzları ayırın; motorun fiili sınırlarını kontrol edin.
- ☐ Bu iş yükü için yanıt hızını ölçün; gerektiğinde başlangıç süresini ve soğuk önbellek performansını da değerlendirin.
- ☐ Model kalitesini hedef görevlerde doğrulayın; harici bir yetenek puanı yalnızca başlangıç noktasıdır.

Kaçınılması gereken bir boyutlandırma hatası, her offloading yöntemini aynı kabul etmektir. Daha büyük bir modelin kullanılabilir olup olmadığına karar vermeden önce **hangi verinin taşındığını, ne kadarına erişildiğini ve ne zaman hazır olması gerektiğini** kontrol edin.

---

## 9. Sonuç ve Geleceğe Bakış

**Bulguların özeti:**

| Soru | Yanıt |
|---|---|
| Conditional memory GPU belleği dışında tutulabilir mi? | Evet — tablolar büyüktür, ancak her token için önceden bilinen adreslerden yalnızca birkaç kilobayt getirilir |
| Nereye taşınır? | DGX Spark'ta yerel NVMe'ye; RTX PRO 6000'de ayrı, sabitlenmiş sistem RAM'ine |
| Aynı donanımdaki karşılaştırma ne gösterir? | 8× Spark'ta disk yapılandırması düğüm başına ~21 GB daha fazla KV cache tahsisi bildirir; TPS, C=1'de %7,5, C=8'de %14 daha düşüktür |
| Daha küçük yapılandırmalar hangi performansı sağlar? | 4× Spark'ta DeepSeek: C=1'de 29,5 token/s; tek Spark'ta Qwen: C=1'de 28,5 token/s; RTX PRO 6000'de Qwen: C=16'da istek başına 43,2 token/s |
| Ne kazandırır? | Normalde sığmayan modellerin çalışması (4× DGX Spark'ta 763B, tek DGX Spark veya RTX PRO 6000'de 132,7 GB checkpoint) ve daha fazla KV cache kapasitesi (8× DGX Spark'ta yapılandırılan sınır 300K → 1M) |
| Maliyeti nedir? | Başlangıç süresi, NVMe alanı veya sabitlenmiş sistem RAM'i ve motor desteğine bağımlılık |

**Geleceğe bakış.** Bazı yeni mimariler, hesaplanması gereken bileşenleri yalnızca saklanması gereken verilerden ayırıyor. Mixture-of-Experts etkin parametreleri toplam parametrelerden ayırdı; burada incelenen iki modelde kullanılan conditional memory ise erişim biçimi daha yavaş bellek katmanlarına uygun, büyük bir parametre havuzu ekliyor. Diğer modellerin bunu benimseyip benimsemeyeceğini zaman gösterecek. Benimserlerse ve çıkarım motorları da desteklerse, aynı donanım uygun bileşenler için sistem RAM'ini ve depolamayı kullanarak daha yetenekli modelleri çalıştırabilir. Bu faydanın gerçekleşmesi; kalan ağırlıklar ve istek durumu için yeterli GPU belleği, verimli veri aktarımı ve kabul edilebilir ölçülen gecikme gerektirir.

---

## Sözlük (Terimler)

- **Arama tablosu (lookup table):** Bir anahtarla adreslenen satırlardan veri getirilen tablo; conditional memory tabloları bu şekilde okunur.
- **Belleğe eşlenmiş dosya (memory-mapped file):** Bellek gibi erişilebilen dosya; sayfaları ilk erişimde diskten yüklenir ve sayfa önbelleğinde tutulur.
- **Birleşik bellek (unified memory):** DGX Spark'ta (GB10) olduğu gibi CPU ve GPU'nun paylaştığı tek bellek havuzu.
- **Checkpoint:** Kaydedilmiş model ağırlıkları ve ilgili üst veri; dosya boyutu ile çalışma zamanı bellek kullanımı farklı büyüklüklerdir.
- **Conditional memory:** Giriş token'larının hash'lenmiş n-gram'larıyla adreslenen ve belirli katmanlarda gizli durumla birleştirilen öğrenilmiş vektör tablosu. Terim, DeepSeek'in Engram makalesinde ortaya konmuştur.
- **Decode:** Yanıtın token token üretilmesi; küçük batch boyutlarında çoğunlukla bellek bant genişliğiyle sınırlıdır.
- **Embedding:** Bir token'ı veya token dizisini temsil eden öğrenilmiş vektör.
- **Engram:** DeepSeek'in conditional memory modülü; DeepSeek-V4.1-Flash'ta bulunur.
- **Etkin parametreler:** Bir token için kullanılan parametreler; hassasiyetleri ve yeniden kullanımları ağırlık trafiğini etkiler.
- **Gated DeltaNet:** Büyüyen bir KV cache yerine istek başına sabit boyutlu durum tutan doğrusal attention katmanı.
- **Gizli durum (hidden state):** Token'ın model katmanlarından geçerken taşıdığı vektör temsili.
- **Hash fonksiyonu (hash head):** Bir n-gram'ı tablonun bir satırına eşleyen, birbirinden bağımsız birkaç fonksiyondan biri.
- **KV cache:** Önbelleğe alınan attention key ve value vektörleri; boyutu attention mimarisine, bağlam uzunluğuna, hassasiyete ve eşzamanlı istek sayısına bağlıdır.
- **N-gram:** Art arda gelen n token'dan oluşan dizi (bigram: 2, trigram: 3).
- **Offloading:** Model verisinin bir bölümünü GPU belleği yerine daha yavaş ve daha büyük bir bellek katmanına (sistem RAM'i, NVMe) yerleştirme.
- **Önceden getirme (prefetching):** Veriyi ihtiyaç duyan katman çalışmadan önce getirerek aktarımın hesaplamayla örtüşmesini sağlama.
- **PLE tablosu:** SGLang'in Qwen3.8-Flash-Next n-gram embedding tablosu için kullandığı ad.
- **Prefill:** Yanıt üretiminden önce prompt'un işlenmesi; kuyrukta bekleme ve diğer ek yüklerle birlikte TTFT'yi oluşturur.
- **Sabitlenmiş bellek (pinned, page-locked memory):** İşletim sisteminin yerini değiştiremediği veya takas alanına taşıyamadığı, ayrı bir GPU'nun doğrudan okuyabildiği sistem belleği.
- **Sayfa önbelleği (page cache):** İşletim sisteminin son okunan dosya sayfalarını RAM'de tuttuğu önbellek.
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

**Çıkarım motorları ve offloading:**

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

**Yetenek puanları:**

- Artificial Analysis Intelligence Index — <https://artificialanalysis.ai>

---

### Notlar

- **Ölçümler:** Dağıtım hızları, CordatusAI LLM Benchmark Tool ile yapılan OpenZeka çalıştırmalarından gelir (yaklaşık 128 giriş token'ı, en fazla 128 çıktı token'ı, ortalama değerler). DeepSeek-V4.1-Flash çalıştırma yapılandırmaları iki DeepSeek raporunda belgelenmiştir; Qwen3.8-Flash-Next çalıştırmalarında SGLang cookbook'un doğrulanmış tek cihaz yapılandırmaları kullanılmıştır.
- **Tahminler:** Token başına embedding bayt miktarı model yapılandırmalarından hesaplanmıştır; gerçek bellek ve depolama trafiği önbelleklemeye ve aktarım boyutlarına bağlıdır. Checkpoint dosya boyutları, çalışma zamanı bellek ölçümleri değildir.
- **Güncellik:** Motorlardaki offloading desteği hızla gelişmektedir; burada anlatılan parametreler ve sınırlamalar Eylül 2026 itibarıyla geçerlidir.

---

<p><img src="{{ '/papers/yerel-llm-rehberi/images/openzeka-logo.png' | relative_url }}" alt="OpenZeka" width="220"/></p>

**LLM altyapınızı birlikte planlayalım.** Model mimarisini, bellek hiyerarşisini ve offloading'i hesaba katan donanım boyutlandırması için OpenZeka ile iletişime geçin: [support@openzeka.com](https://openzeka.com/iletisim/) · [openzeka.com](https://openzeka.com)
