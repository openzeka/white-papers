---
title: "System One'ın Üretimde Kullanılabilirliği"
parent: White Papers
nav_order: 14
lang: tr
page_id: system-one-production-readiness
date: 2026-11-04
card_tag: "Teknik Rehber"
description: >-
  0,6B'den 27B'ye altı tipli karar (typed decision) modeli, tek bir NVIDIA DGX
  Spark üzerinde vLLM ve SGLang ile değerlendirildi: Türkçe doğruluk, güven
  kalibrasyonu, paraphrase tutarlılığı, çok kipli sınırlar, motor
  taşınabilirliği ve üretim karar politikasının ihtiyaç duyduğu güven eşikleri.
permalink: /papers/system-one-production-readiness/
last_modified_date: 2026-11-04
toc: true
---

{% include company/block.html name="prepared_by" %}

**DGX Spark üzerinde vLLM ve SGLang ile Türkçe karar kalitesi, güvenilirlik ve performans değerlendirmesi**

*Teknik değerlendirme raporu · Sürüm 1.0 · Kasım 2026*

---

{:.no_toc}
## İçindekiler

* TOC
{:toc}

---

## Özet

Bu çalışma, serbest metin üretmek yerine doğrudan tipli karar (typed decision) üreten System One model ailesinin üretim ortamlarında kullanılabilirliğini değerlendirir. Altı model, farklı etiketleme yaklaşımlarına sahip veri kümeleri ve iki çıkarım motoru üzerinde gerçekleştirilen testler üç temel bulguyu ortaya koymaktadır.

İlk olarak, **en yüksek doğruluk genel olarak büyük modellerde elde edilse de model boyutu ile doğruluk arasında doğrusal bir ilişki yoktur.** `d3-27b`, Türkçe TDB veri kümesinde 0,963 doğruluğa ulaşırken 0,6B parametreli `d3-edge` 0,336'da kalır. Buna karşılık 4B'lik `d3-mini`, 0,887 doğrulukla 27B modele yaklaşır ve 9B'lik `clef-flash` modelini (0,853) geride bırakır.

İkinci olarak, **yüksek doğruluk tek başına güvenilir karar verme anlamına gelmez.** Modeller, yanıtın gerçekten belirsiz olduğu 42 vakada dahi 0,75–0,77 aralığında ortalama en yüksek seçenek olasılığı üretir. Bu nedenle `confidence` alanı, kalibre edilmiş bir doğruluk tahmini olarak yorumlanmamalı; etiketli veriler üzerinde doğrulanmış eşiklerle kullanılan bir ön eleme (triyaj) sinyali olarak değerlendirilmelidir.

Üçüncü olarak, **System One desteği çıkarım motorlarında henüz olgunlaşma aşamasındadır; bu nedenle uyumluluk her model için ayrı ayrı doğrulanmalıdır.** Aynı istemci, veri kümeleri ve model kadrosuyla yapılan testlerde `d3-27b`, `clef` ve `clef-flash` iki motorda da birbirine yakın sonuçlar vermiştir. Buna karşılık, test edilen SGLang geliştirme imajında `d3-mini` modelinin TDB doğruluğu 0,887'den 0,280'e gerilemiş, `d3-edge` ise başlatılamamıştır.

Bu sonuç, iki motorun genel olarak farklı kararlar ürettiğini göstermez. Bulgular, test edilen SGLang sürümündeki answer-code okuma uygulamasının küçük D3 modellerinde hatalı çalıştığına işaret etmektedir. Dolayısıyla sorun, mevcut kanıta göre model ve sürüm özelinde değerlendirilmelidir. Bununla birlikte üretim öncesinde her model–motor–sürüm bileşimi ayrı ayrı doğrulanmalı; bu kabul testi her sürüm yükseltmesinde tekrarlanmalıdır.

> **Temel bulgular**
>
> 1. Türkçe TDB setinde en yüksek doğruluk `d3-27b` (0,963) ve `clef` (0,944); en düşük `d3-edge` (0,336).
> 2. `confidence ≥ 0.90` eşiği, `d3-27b` için 354 skorlu vakanın %87'sini %1,3 hata riskiyle otomatik sonuçlandırır.
> 3. Bütün modellerde seçenek sırası değişimine karşı kararlılık tamdır (`flip = 0.0`), buna karşılık paraphrase tutarlılığı en iyi modelde bile ~0,83'tür.
> 4. Görsel/video testlerinde 8 maddenin tamamını yalnızca `d3-27b` doğru yanıtlar; ortak zayıflık grafikten kesin sayı okumadır.
> 5. 27B modeller GB10 üzerinde 93–96 °C'ye ulaşabilir ve süreç sessizce sonlanabilir; korumalı çalışma protokolü zorunludur.

**Kapsam notu.** Rapor, ölçüm sonuçlarına ve bu sonuçların üretim kararları üzerindeki etkilerine odaklanır. Kurulum komutları, API kullanımı, SDK kaynaklı dikkat noktaları ve sorun giderme önerileri bu raporun kapsamı dışındadır. Donanım ve yazılım sürümleri test ortamına göre sabitlenmiştir. Farklı bir ortamda elde edilecek sonuçlar ayrıca ölçülmeli ve doğrulanmalıdır.

---

## 1. Problem: serbest metinden tipli karara

Alışılmış bir dil modeli çalıştırıldığında model metni okur ve serbest biçimde yanıt üretir; uygulama da bu yanıtı ayrıştırarak karar çıkarır. Bu yaklaşımın iki yapısal maliyeti vardır: ayrıştırma katmanı kırılgandır ve modelin olasılık bilgisi kaybolur. "Evet" ile "evet, ancak…" arasındaki fark, ancak üretilen metnin yeniden yorumlanmasıyla tahmin edilebilir.

System One (Jev) ailesi bu adımı ortadan kaldırır. Modele bir `state` metni ve bu metne ilişkin tipli sorular verilir; model her seçenek için normalize edilmiş olasılık üretir. Üç soru tipi vardır:

- **`choice`** — tanımlı seçenekler arasından seçim.
- **`noul`** — evet/hayır kararı; sonuç `P(yes)` üzerinden okunur.
- **`score`** — sıralı seviyeler için dağılım; sonuç, dağılımın ağırlıklı ortalamasıyla hesaplanan seviye beklentisidir.

Çıktı şeması üç alandan oluşur ve bu alanların her biri farklı bir soruya yanıt verir:

| Alan | Ne söyler | Ne söylemez |
| --- | --- | --- |
| `probabilities` | Seçenekler arasındaki göreli dağılım | Dağılımın doğru olup olmadığı |
| `confidence` | Seçilen yanıtın model içi güveni | Gerçek dünyadaki doğruluk olasılığı |
| `diagnostics.label_mass` | Geçerli etiketlere atanan toplam olasılık kütlesi | Etiket içi dağılımın kalitesi |

`label_mass` değerinin 1'den küçük olması, olasılık kütlesinin bir bölümünün tanımlı seçeneklerin dışına taştığını gösterir ve kararın ek denetim gerektirebileceğine işaret eder.

### 1.1. Üç okuma yöntemi

Modeller aynı API'yi paylaşsa da kararı farklı mekanizmalarla üretir. Bu fark, hem maliyeti hem de çıktının nasıl yorumlanacağını belirler.

| Strateji | Model ailesi | Çalışma biçimi | `label_mass` |
| --- | --- | --- | --- |
| **Cevap kodu okuma** (answer-code readout) | `vllm-sr/d3` | Her soru için ayrı ileri geçiş; seçenekler cevap kodlarının logitleri üzerinden puanlanır, softmax ile normalize edilir | Sabit 1 |
| **Ortak şema başlığı** (joint schema head) | `Cloudflare/clef`, `clef-flash` | Birden fazla soru, özel bir transformer başlığıyla tek prefill'de değerlendirilir | Sabit 1 |
| **Etiket-token okuma** | `LiquidAI/d1-3B` | Yanıtın ilk token'ı esas alınır; ilgili etiketlerin logitleri softmax ile olasılığa çevrilir | Dinamik |

Ayrımın pratik sonuçları şunlardır:

- **D3** soru başına ayrı geçiş yaptığı için soru sayısı arttıkça işlem maliyeti artar.
- **CLEF** birden fazla soru içeren isteklerde tek ileri geçiş avantajı sağlar; `usage.input_tokens` ortak giriş üzerinden raporlanır.
- **D1-3B** olasılığı yalnızca geçerli etiketlere dağıtmak zorunda değildir; bu yüzden `label_mass` bu ailede gerçek bir sinyaldir.

D3 isteklerinde `instructions` alanı kullanılamaz; gönderildiğinde `400` döner ve model sabit bir soru şablonuyla çalışır. CLEF'te `instructions` zorunlu değildir, ancak `chat_template_kwargs` bu çalışmada isteğin reddedilmesine yol açmıştır. CLEF ve CLEF-Flash aynı `joint_schema_model.py` uygulamasını ve aynı başlık yapılandırmasını kullanır; fark omurga boyutundadır (32×4096 ve 64×5120).

---

## 2. Yöntem ve kanıtın sınırları

Değerlendirme; sert etiketli bir Türkçe standart, olasılık dağılımı etiketlerine sahip bir Türkçe örneklem ve harici bir İngilizce standart başta olmak üzere farklı etiketleme yaklaşımlarına sahip veri kümelerini kapsar. Bu veri kümeleri, model başarımını farklı ölçütler üzerinden incelemeyi sağlar.

| Veri seti | İçerik | Etiket rejimi |
| --- | --- | --- |
| **TurkishDecisionBenchmark v0.2 public** | 396 vaka: 354 skorlu + 42 belirsizlik kontrolü | Tek doğru yanıt; belirsiz vakalar ayrı raporlanır |
| **cisimcik örneklemi** | 120 Türkçe soru (40 `noul`, 40 `choice`, 40 `score`), seed 42 | Hakem panelinin olasılık dağılımı (soft label) |
| **JevBench-public-120** | 72 özgün vaka (36 paraphrase çifti) + 48 kolay vaka | Sert etiket; kolay katmanda yanıt metinde açık |
| **bench-tr (35)** | 25 + 10 Türkçe iş yükü sorusu | Beklenen yanıtlar ölçümden önce sabitlendi |
| **bench-images (8)** | Fatura, satış grafiği, hata ekranı, 4 saniyelik video | 7 görsel + 1 video maddesi |
| **limits (11)** | Programatik sınır ve sağlamlık senaryoları | Davranışsal gözlem |

TDB ve cisimcik veri kümeleri farklı ölçüm amaçlarına sahiptir. TDB, modelin tek bir doğru etiketi bulup bulamadığını ölçerken cisimcik, modelin ürettiği olasılık dağılımının hakem panelinin dağılımına ne kadar yaklaştığını değerlendirir. Bu nedenle iki veri kümesindeki doğruluk değerleri **doğrudan karşılaştırılmamalıdır**.

Testler bir piramit hâlinde düzenlenmiştir; alt katman hızlı bir sağlık kontrolü, üst katmanlar daha maliyetli ve kapsamlı turlardır. Bu yapı, bir sorun çıktığında hangi katmanda ortaya çıktığını izole etmeyi kolaylaştırır.

| Katman | İçerik | Araç |
| --- | --- | --- |
| L0 | Temel çalışma kontrolü | `systemone.py --example` |
| L1-STD | JevBench-public-120 | `bench.py --set jevbench` |
| L1-TR | TDB v0.2 public (396) | `bench_tdb.py` |
| L1-TR+ | cisimcik örneklemi (120) | `bench_cisim.py` |
| L2 | Görsel/video (8) | `bench_images.py` |
| L3 | Sınır ve dayanıklılık (11) | `limits.py` |
| L4 | Metrik türetimi | `summary.py` |
| L5 | Eşzamanlılık 1/8/64 | `concurrency.py` |
| L6 | Motorlar arası uyum | `xengine.py` |

Ölçülen metrikler: doğruluk, grup tutarlılığı (TDB karşıt soru grupları), yüksek güven düzeyindeki hata, doğru cevaba atanan ortalama olasılık (mean gold p), belirsiz vakalarda aşırı güven, soft-label Brier, Brier, normalize score-MAE, ECE(10), karar değişim oranı (`flip`), p50/p95 gecikme ve `label_mass`.

Tablolardaki sayılar ham çıktıdan birebir alınmıştır; ondalık ayırıcı olarak nokta korunmuştur.

**Test ortamı.** Testler NVIDIA DGX Spark (GB10, 121 GiB birleşik bellek, aarch64) üzerinde yürütülmüştür. vLLM tarafında `vllm/vllm-openai:nightly` imajı ve `--max-model-len 32768` yapılandırması kullanılmıştır. Standart testlerde GMU 0,88; 27B modellerin korumalı testlerinde ise GMU 0,78 ve `--enforce-eager` uygulanmıştır. SGLang testleri, `lmsysorg/sglang:dev` ve `dev-clef` imajlarıyla 8001 portunda; aynı istemci betikleri ve aynı JSON istek gövdeleri kullanılarak gerçekleştirilmiştir.

> **System One desteği yeni.** Kayıtlara göre vLLM ana koduna 14 Ekim 2026'da giren destek (vllm#61565) henüz yayın sürümlerinde değildir; bu nedenle `nightly` imajı kullanılmıştır. Nightly'nin ARM64 desteği ve DGX Spark'ta çalışabilirliği bu ortamda doğrulanmıştır, ancak her kurulumda imajın ilgili değişikliği içerdiği kontrol edilmelidir.

### 2.1. Kanıtın sınırları

Aşağıdaki bulguların her biri aynı güçte değildir. Hangi sayıya ne kadar güvenileceğini bilmek, sonucu doğru okumanın parçasıdır.

- **Tekrarlanmış turlar:** TDB, cisimcik ve JevBench ana sonuçları tam test turlarına dayanır; 27B sonuçları partiler hâlinde yürütülen protokolle ve birleştirilmiş dosyalarla doğrulanmıştır.
- **Yalnızca tek motorda ölçülen:** `tr-set` için `clef`, `clef-flash` ve `d1-3b` yalnızca SGLang üzerinde çalıştırılmıştır; bu üç modelin vLLM karşılığı yoktur.
- **Küçük örneklem:** Görsel/video değerlendirmesi 8 maddeden oluşur; tek maddelik fark sıralamayı değiştirir.
- **Davranışsal gözlem:** `limits` sonuçları istatistiksel değil, senaryo bazlı API davranışlarıdır.
- **Gözlenen oynaklık:** `clef-flash` TDB doğruluğu farklı turlarda %85,3–%85,9 aralığında; partiler hâlindeki çalıştırmalarda olasılık değerlerinde yaklaşık ±0,07 sapma raporlanmıştır.
- **Sürüm bağımlılığı:** Her iki motorun System One desteği aynı dönemin geliştirme imajlarına dayanır. Sonuçlar bu sürümler ve bu donanım için geçerlidir.

---

## 3. Karar kalitesi: doğruluk, tutarlılık, dil davranışı

### 3.1. Harici İngilizce standart

JevBench-public-120'de 48 kolay sorunun hepsinde bütün modeller tam puan alır; ayrışma esas olarak 72 özgün soruda ortaya çıkar.

| Model | acc_all (72) | noul | choice | score | easy (48) | Brier | ECE(10) | flip | paraphrase | p50/p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `d3-edge` | 0.819 | 0.708 | 0.917 | 0.750 | 1.000 | 0.271 | 0.083 | 0.0 | 0.667 | 9 / 11 |
| `d3-mini` | **1.000** | 1.000 | 1.000 | 1.000 | 1.000 | 0.012 | 0.032 | 0.0 | 0.833 | 50 / 52 |
| `d3-27b` | **1.000** | 1.000 | 1.000 | 1.000 | 1.000 | 0.004 | 0.012 | 0.0 | 0.833 | 289 / 299 |
| `clef-flash` | 0.972 | 1.000 | 0.944 | 1.000 | 1.000 | 0.044 | 0.058 | 0.0 | 0.833 | 112 / 116 |
| `clef` | **1.000** | 1.000 | 1.000 | 1.000 | 1.000 | 0.004 | 0.012 | 0.0 | 0.833 | 290 / 301 |
| `d1-3b` | 0.931 | 0.792 | 1.000 | 1.000 | 1.000 | 0.126 | 0.033 | 0.0 | 0.806 | 61 / 64 |

İki gözlem öne çıkar. Birincisi, `flip` metriği bütün modellerde sıfırdır: seçeneklerin sırası değiştirildiğinde karar değişmemektedir. İkincisi, `paraphrase` metriği en iyi modellerde bile ~0,83'tür. Yani **aynı sorunun farklı kelimelerle ifade edilmesi kararı değiştirebilir.** Karar tutarlılığının kritik olduğu uygulamalarda bu test kuruma ait verilerle tekrarlanmalıdır.

### 3.2. Türkçe sert etiketli standart

TDB'de en yüksek doğruluk 27B modellerde görülür, ancak sıralama boyutla tekdüze değildir: 4B'lik `d3-mini` (0,887), 9B'lik `clef-flash`'tan (0,853) daha iyidir; 27B'lik `d3-27b` ile `d3-mini` arasındaki fark ise 0,6B ile 4B arasındaki farktan çok daha küçüktür.

| Model | accuracy | group-cons | high-conf err | mean gold p | amb valid | amb max-p | Brier | ECE(10) | p50/p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `d3-27b` | **0.963** | **0.870** | 0.011 | **0.934** | 0.952 | 0.765 | **0.060** | 0.016 | 336 / 362 |
| `clef` | 0.944 | 0.797 | **0.006** | 0.865 | 0.976 | 0.747 | 0.102 | 0.047 | 351 / 386 |
| `clef-flash` | 0.853 | 0.638 | 0.011 | 0.753 | 0.905 | 0.715 | 0.232 | 0.060 | 115 / 125 |
| `d3-mini` | 0.887 | 0.710 | **0.006** | 0.795 | 0.905 | 0.754 | 0.183 | 0.047 | 59 / 64 |
| `d1-3b` | 0.545 | 0.159 | 0.020 | 0.468 | 0.667 | 0.550 | 0.588 | 0.113 | 66 / 86 |
| `d3-edge` | 0.336 | 0.029 | 0.065 | 0.327 | 0.619 | 0.635 | 0.867 | 0.295 | 10 / 14 |

Metrikler, aşağıdaki tanımları dikkate alınarak yorumlanmalıdır:

- **Grup tutarlılığı**, aynı durumu karşıt ifadelerle soran soru gruplarından tamamı doğru yanıtlananların oranıdır. Aynı durumun farklı veya ters ifadelerle sunulduğunda tutarlı karar verilip verilmediğini gösterir.
- **Yüksek güvenle hata**, en az 0,90 güvenle verilen yanlış kararların oranıdır; otomatik sistemlerde ayrıca izlenmelidir.
- **Belirsiz vakalarda aşırı güven**, 42 kontrolde geçerli cevaplardan birinin seçilme oranı ve bu vakalardaki en yüksek ortalama olasılıktır.

`d3-mini` ile `clef`'in yüksek güven düzeyindeki hata oranı aynıdır (0,006); buna karşılık `clef`'in grup tutarlılığı belirgin biçimde yüksektir (clef 0,797, `d3-mini` 0,710). Yani benzer "emin olma" davranışı, benzer tutarlılık anlamına gelmez.

### 3.3. Türkçe olasılık etiketli örneklem

cisimcik örnekleminde referans, tek bir doğru seçenek değil, hakem panelinin dağılımıdır. Bu nedenle buradaki doğruluk, TDB doğruluğuyla kıyaslanamaz.

| Model | accuracy | noul | choice | score | score-MAE (norm) | mean gold p | p50/p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `clef` | **0.855** | 0.950 | 0.895 | 0.718 | 0.120 | 0.788 | 488 / 2221 |
| `d3-27b` | 0.840 | 0.975 | 0.850 | 0.692 | 0.114 | 0.810 | 451 / 2547 |
| `d3-mini` | 0.832 | 0.975 | 0.900 | 0.615 | 0.142 | 0.749 | 78 / 388 |
| `clef-flash` | 0.786 | 0.875 | 0.921 | 0.564 | 0.168 | 0.728 | 148 / 810 |
| `d1-3b` | 0.624 | 0.800 | 0.605 | 0.462 | 0.220 | 0.560 | 88 / 201 |
| `d3-edge` | 0.429 | 0.500 | 0.450 | 0.333 | 0.311 | 0.370 | 15 / 52 |

Bütün modellerin en çok zorlandığı tür `score` sorularıdır. Uzun ve karmaşık Türkçe kurumsal metinlerde model, komşu seviyeler arasında kayma eğilimi gösterir: "orta" ile "orta üstü" ayrımı güvenilir biçimde yapılamaz. `clef` 0,718 ile en yüksek doğruluğu elde etse de bu, üretimde sıralı bir ölçeğin otomatik kullanılabileceği anlamına gelmez.

---

## 4. Güven ve belirsizlik

### 4.1. `confidence` ne söylemez

`confidence`, modelin seçtiği yanıt için bildirdiği olasılığı ifade eder; yanıtın gerçekte doğru olma olasılığını doğrudan göstermez. Dolayısıyla modelin yüksek güven bildirmesi, kararın mutlaka doğru olduğu anlamına gelmez.

TDB'deki 42 belirsizlik kontrolünde 27B modeller, geçerli seçeneklerden birini vakaların %95–98'inde seçmiş; seçilen seçeneklere ait en yüksek ortalama olasılık ise 0,75–0,77 aralığında gerçekleşmiştir. Başka bir ifadeyle modeller, **çekimser kalmak yerine seçeneklerden birini belirlemeye eğilimlidir** ve bu seçimi görece yüksek olasılıkla yapar. Belirsizlik düzeyi, API çıktısında ayrı bir alanla doğrudan temsil edilmemektedir.

`label_mass` bu boşluğu kısmen doldurur, ancak yalnızca D1 ailesinde. D3 ve CLEF'te değer sabit olarak 1,0'dır; bu nedenle bu ailelerde `label_mass` tek başına güvenlik filtresi olarak kullanılamaz. Pratik sonuç: **`confidence` eşiği gereklidir, ancak tek başına yeterli değildir**; etiketlenmiş veri üzerinde kalibre edilmelidir.

### 4.2. Kapsama–risk analizi

Otomatik karar ile insan incelemesi arasındaki sınır, genel doğrulukla değil, **yüksek güvenle verilen kararlardaki hata oranıyla** belirlenir. Aşağıdaki tablo, TDB'nin 354 skorlu vakasında `confidence` eşiği değiştirilerek hesaplanmıştır.

| Model | `conf ≥ 0.8` | `conf ≥ 0.9` | `conf ≥ 0.95` |
| --- | --- | --- | --- |
| `d3-27b` | Kapsama 0.92 · risk 0.021 | **Kapsama 0.87 · risk 0.013** | Kapsama 0.80 · risk 0.011 |
| `clef` | Kapsama 0.85 · risk 0.023 | Kapsama 0.69 · risk 0.008 | Kapsama 0.48 · risk 0.006 |
| `clef-flash` | Kapsama 0.68 · risk 0.046 | Kapsama 0.49 · risk 0.023 | Kapsama 0.25 · risk 0.000 |
| `d3-mini` | Kapsama 0.68 · risk 0.021 | Kapsama 0.56 · risk 0.010 | Kapsama 0.43 · risk 0.007 |
| `d1-3b` | Kapsama 0.22 · risk 0.195 | Kapsama 0.12 · risk 0.122 | Kapsama 0.03 · risk 0.000 |
| `d3-edge` | Kapsama 0.25 · risk 0.596 | Kapsama 0.12 · risk 0.523 | Kapsama 0.07 · risk 0.360 |

*Kapsama: güven eşiğini karşılayan kararların tüm kararlara oranı. Risk: otomatik sonuçlandırılan kararlar arasındaki hata oranı.*

Tablodaki en önemli ayrım `d3-27b` ile `clef` arasındadır. 0,90 eşiğinde `d3-27b` vakaların %87'sini %1,3 riskle kapatırken `clef` %69'unu %0,8 riskle kapatır. Daha düşük risk, daha fazla insan incelemesi pahasına elde edilir; tercih, hatalı kararın maliyetine bağlıdır.

`d3-edge` için `confidence` güvenilir bir gösterge değildir: model yüksek güven bildirdiğinde bile hata oranı 0,36–0,60 aralığında kalır. `d1-3b` de benzer biçimde düşük kapsamada yüksek risk gösterir.

Bu sonuçlar yalnızca kullanılan veri kümesi ve test koşulları için geçerlidir. Üretim verisinin dağılımı değiştiğinde aynı kapsama ve risk düzeylerinin korunacağı garanti edilemez. Bu nedenle eşikler, uygulamanın kendi etiketli verileri üzerinde yeniden kalibre edilmelidir.

---

## 5. Çok kipli girdi, sınır durumları, performans

### 5.1. Görsel ve video

`state` alanına görsel ve video eklenebilir. D3 ve CLEF'te görseller en fazla 1,6 megapiksel, videolar saniyede 2 kare ve en fazla 32 kare olarak işlenir. D1 yalnızca görsel destekler ve görselleri 1024×1024'e indirger.

| Model | Doğru cevap | Not |
| --- | --- | --- |
| `d3-27b` | **8/8** | Bütün maddeleri doğru yanıtlayan tek model |
| `d3-mini` | 7/8 | — |
| `clef` | 7/8 | — |
| `d1-3b` | 6/7 | Video desteklenmiyor; g7 çalıştırılmadı, `videos` içeren istek hata verdi |
| `clef-flash` | 6/8 | — |
| `d3-edge` | 6/8 | — |

Ortak zayıflık `g3` kodlu maddedir: grafikten sayısal değer okuma. `d3-27b` dışındaki bütün modeller bu soruda yanlış yanıt vermiş ve 0,7–1,9 aralığında farklı değerler üretmiştir. Modeller grafiğin genel eğilimini belirleyebilse de **kesin sayısal değerleri okumakta** zorlanmaktadır. Bu nedenle sayısal doğruluğun kritik olduğu iş akışlarında model çıktısı, görselden bağımsız bir veri kaynağıyla doğrulanmalıdır.

D3 ailesinde medya bir kez işlenir ve elde edilen temsil bütün sorular için paylaşılır. Testlerde 16 sorunun tek istekte sorulması ile 16 ayrı istekte sorulması aynı sonucu vermiştir; görsel ağırlıklı iş yüklerinde bu, tekrar işlemeyi önleyerek maliyeti düşürür.

### 5.2. Eşzamanlı istek performansı

| Model | 1 istemci | 8 istemci |
| --- | --- | --- |
| `d3-edge` | 118.6 | 335.6 |
| `d1-3b` | 21.0 | 107.2 |
| `d3-mini` | 19.0 | 39.2 |
| `clef-flash` | 8.8 | 16.8 |
| `d3-27b` | 2.5 | 5.9 |
| `clef` | 3.1 | 4.9 |

Değerler saniyede tamamlanan istek sayısıdır (req/s) ve tek soruluk isteklerle ölçülmüştür; gecikme için §3'teki p50/p95 sütunlarına bakılmalıdır. Tek istekte gecikme büyük ölçüde bir ileri geçişin süresine bağlıdır. D3 her soruyu ayrı geçişte değerlendirirken CLEF birden fazla soruyu tek ileri geçişte değerlendirebildiği için, soru sayısı arttıkça CLEF'in gecikme avantajı büyür.

---

## 6. Motor taşınabilirliği: vLLM ve SGLang

Bir sistemin tek bir çıkarım motoruna bağımlı olmaması için, aynı API'nin aynı kararı üretip üretmediği bilinmelidir. Aynı istemci betikleri, aynı veri kümeleri ve aynı model kadrosu iki motorda da çalıştırılmıştır. Bu bölüm, sürümleri sabitlenmiş iki motor arasındaki uyumu ölçer; motorların genel davranışı hakkında iddia kurmaz.

*V: vLLM, S: SGLang.*

| Model | TDB (V→S) | cisimcik (V→S) | std72 (V→S) | tr-set (V→S) | vision-8 (V→S) | Taşınabilirlik |
| --- | --- | --- | --- | --- | --- | --- |
| `d3-27b` | 0.963 → 0.966 | 0.840 → 0.840 | 1.000 → 1.000 | 0.943 → 0.943 | 1.000 → 1.000 | Evet (korumalı mod) |
| `clef` | 0.9435 → 0.9435 | 0.855 → 0.856 | 1.000 → 0.972 | — → 0.914\* | 0.875 → 0.875 | Evet |
| `clef-flash` | 0.853 → 0.853 | 0.786 → 0.782 | 0.972 → 0.972 | — → 0.857\* | 0.750 → 0.875 | Evet |
| `d1-3b` | 0.545 → 0.568 | 0.624 → 0.622 | 0.931 → 0.931 | — → 0.829\* | 0.857 → 0.875 | Evet |
| `d3-mini` | 0.887 → **0.280** ⚠ | 0.832 → **0.319** ⚠ | 1.000 → **0.292** ⚠ | 0.886 → **0.257** ⚠ | 0.875 → **0.250** ⚠ | Hayır |
| `d3-edge` | 0.336 → ✗ | — → ✗ | 0.819 → ✗ | 0.800 → ✗ | 0.750 → ✗ | Hayır |

\* `tr-set` yalnızca SGLang üzerinde çalıştırılmıştır; bu satırlarda vLLM karşılığı yoktur. ✗: model SGLang'da başlatılamamıştır.

### 6.1. API düzeyindeki farklar

Aynı istemci kodunun D1 ve CLEF ailesinde iki motorda da aynı sonucu üretmesi, gözlenen farkların istemciden kaynaklanmadığını gösterir. Ancak şema düzeyinde uyumsuzluklar vardır ve istemci bunları ayrı ayrı ele almalıdır.

1. **`model` alanı SGLang'da zorunludur.** Gönderilmediğinde `422 Field required` döner; vLLM'de isteğe bağlıdır. Uyumlu bir istemci model adını `/v1/models` üzerinden alıp gövdeye eklemelidir.
2. **`confidence` seçilen seçeneğin olasılığıyla uyuşmayabilir.** SGLang çıktısında `choice: "diger", confidence: 0.303, probabilities: {…, "diger": 0.536}` örneği gözlenmiştir. Şemaya göre bu iki değer eşit olmalıdır. SGLang'da `confidence`, doğrulanmadan eşik hesabında kullanılmamalıdır.
3. **`noul` cevaplarında `probabilities` bulunmaz.** vLLM `{yes, no}` dağılımı döndürürken SGLang yalnızca `{"type":"noul","noul":0.117}` verir. Eksik olasılık, `noul` iki seçenekli olduğundan `P(no) = 1 − P(yes)` ile türetilebilir.
4. **`label_mass` konumu farklıdır.** vLLM `diagnostics[qid].{label_mass, argmax_is_label}` altında, SGLang cevap başına `x_label_mass` alanında döndürür; ayrıca `d3-mini` çıktısında bu alan yoktur. Eksik değer sessizce geçerli kabul edilmemelidir.
5. **Hata kodları farklıdır.** Bilinmeyen soru alanı vLLM'de `400`, SGLang'da `422`; `chat_template_kwargs` vLLM'de yok sayılıp `200` dönerken SGLang'da `400` döner. Kırpma sonrası aynı ada sahip seçenekler her iki motorda da kabul edilir; seçenek, soru ve seviye sınırları aynıdır.

### 6.2. Hız

| Model | SGLang req/s (1 / 8 ) | vLLM'e göre |
| --- | --- | --- |
| `d1-3b` | 27 / 63 | Yüksek yükte vLLM'in ~1/4'ü |
| `d3-mini` | 17 / 37 | Benzer; 64 istemcide düşer |
| `clef-flash` | 8 / 15 | Başa baş |
| `d3-27b` | 3 / 7 | Korumalı modda biraz yüksek |
| `clef` | 3 / 5 | Eşit |

vLLM değerleri §5.2'de verilmiştir.

### 6.3. Sonuç

**Bu bölümdeki sonuçlar, yalnızca test edilen sürümler için elde edilmiş uyumluluk gözlemleridir; genel bir taşınabilirlik kuralı olarak yorumlanmamalıdır.** Test edilen sürümlerde etiket-token yöntemi (D1) ve ortak şema yöntemi (CLEF) iki motorda da benzer sonuç üretmiştir; 27B D3 modeli korumalı modda uyumludur. Küçük D3 modellerinde görülen bozulma, motorun bu yöntemi genel olarak desteklemediği anlamına gelmez. Gösterdiği şey, o geliştirme imajındaki answer-code uygulamasının küçük modellerde hatalı sonuç vermesidir. Hata tek modelde ve tek sürümde gözlendiği için nedeni hakkında kesin yargı kurulamaz; sayısal hassasiyet, dikkat yolu ve şema eşlemesi ayrı ayrı incelenmelidir.

Bu nedenle üretim öncesinde her model–motor–sürüm bileşimi ayrı doğrulama testinden geçirilmelidir; motor sürümü yükseltildiğinde test tekrarlanmalıdır. Performans açısından SGLang tek istekte biraz daha düşük gecikme sağlayabilirken, yüksek eşzamanlılıkta vLLM'in toplu işleme avantajı `d1-3B` üzerinde belirginleşmiştir.

---

## 7. Üretim için karar rehberi

### 7.1. Model seçimi

| Seçenek | Ne zaman | Sınırı |
| --- | --- | --- |
| **`d3-27b`** (27B) | Doğruluk kritikse; görsel ve video dâhil karmaşık girdiler varsa | ~340 ms tek istek gecikmesi |
| **`clef`** (27B) | Çok sorulu isteklerde tek ileri geçiş avantajı gerekiyorsa | `d3-27b` doğruluğunun ~%98'i |
| **`clef-flash`** (9B) | Tek istekte 2–9 soru; hatalı kararın maliyeti düşükse | TDB 0,853 |
| **`d3-mini`** (4B) | Gerçek zamanlı ön filtreleme; ~50 ms bütçe | TDB `score` 0,615; test edilen SGLang imajında kullanılamaz |
| **`d1-3b`** (3B) | Yüksek hacimli etiketleme; ~60 ms bütçe | TDB 0,545; LFM 1.0 lisansı |
| **`d3-edge`** (0,6B) | Yalnızca ilk yönlendirme; hata maliyeti çok düşükse | TDB 0,336; güven eşiği anlamsız |

Boyut ile doğruluk arasındaki ilişki tekdüze değildir: `clef` (27B) ile `d3-27b` (27B) benzer doğrulukta, `d3-mini` (4B) ise 9B'lik `clef-flash`'tan TDB'de daha iyidir. Seçim, parametre sayısından çok okuma yöntemine ve göreve bağlıdır.

### 7.2. Önerilen karar politikası

1. **Eşik:** Başlangıç politikası olarak `confidence ≥ 0.90` ve `label_mass ≥ 0.95` birlikte aranır. `d3-27b` için bu, 354 vakanın ~%87'sini %1,3 riskle otomatik sonuçlandırır. Eşikler üretime alınmadan önce uygulama verisiyle doğrulanır.
2. **İnsan incelemesine yönlendirme:** `label_mass < 0.95` olduğunda karar insan incelemesine gider. D3 ve CLEF'te bu alan 1,0'da sabit olduğundan tek başına yeterli değildir; yüksek hata oranlı görev kategorileri (`by_category`) ve Türkçe `score` soruları da yönlendirilir.
3. **Kayıt tutma:** Her kararla birlikte `confidence` ve mümkünse olasılık dağılımı saklanır; eşikler yeni sonuçlara göre güncellenir ve kapsama–risk analizi gerçek veriyle tekrarlanır.
4. **Yeniden sorgulama:** Partili ve bellek durumuna bağlı çalıştırmalarda olasılıklar yaklaşık ±0,07 değişebilir. Eşik sınırına yakın kararlar yayımlanmadan önce tek istekle doğrulanır; mümkünse deterministik davranış sağlayan yapılandırma (`VLLM_BATCH_INVARIANT`) değerlendirilir.
5. **Kaçınılması gerekenler:** Üretim kararını yalnızca `d3-edge`'e dayandırmak; `confidence`'ı kalibre edilmiş doğruluk sanmak; d1-3B'yi lisans koşulları incelenmeden Apache-2.0 uyumlu bir ürüne gömmek.

---

## 8. Riskler, lisanslar ve sonuç

### 8.1. Geçerlilik sınırları

- Sonuçlar tek bir donanım (DGX Spark GB10), tek bir bellek yapılandırması ve iki motorun geliştirme imajları için geçerlidir.
- TDB ve cisimcik etiketleri bu çalışma kapsamında değiştirilmemiştir; yeni sürümler yayımlandığında sonuçlar yeniden üretilmelidir.
- 27B sonuçları korumalı protokolle (GMU 0,78, `--enforce-eager`, partili çalışma) elde edilmiştir; farklı ayarlarda gecikme ve kararlılık değişebilir.
- `tr-set` için `clef`, `clef-flash` ve `d1-3b` yalnızca SGLang üzerinde ölçülmüştür; motorlar arası karşılaştırma bu üç model için yapılamaz.
- Sıfır baytlık sonuç dosyaları tamamlanmış sayılmamış, eksik testler `FORCE=1` ile yeniden çalıştırılmıştır.
- TypeSafe SDK'nın iki motorla birlikte kullanımı bu kapsama dâhil edilmemiştir.

### 8.2. Lisanslar

Kasım 2026 itibarıyla Hugging Face model kartları ve depo dosyaları üzerinden doğrulanan durum:

| Model | Lisans | Taban model |
| --- | --- | --- |
| `vllm-sr/d3` | **Apache-2.0** | Qwen/Qwen3.8-27B (Apache-2.0) |
| `vllm-sr/d3-mini` | **Apache-2.0** | Qwen/Qwen3.5-4B (Apache-2.0) |
| `vllm-sr/d3-edge` | **Apache-2.0** | Qwen/Qwen3.5-0.8B (Apache-2.0) |
| `Cloudflare/clef` | **Apache-2.0** | Qwen/Qwen3.8-27B |
| `Cloudflare/clef-flash` | **Apache-2.0** | Qwen3.5 (9B) |
| `LiquidAI/d1-3B` | **LFM 1.0** ⚠ | LiquidAI/LFM2.5-VL-3B |

D3 ve CLEF aileleri Apache-2.0 ile yayımlanmıştır; yine de yeniden dağıtım ve türev çalışma değerlendirilirken model kartına ek olarak kullanılan sürümün lisans dosyası ve varsa ek koşulları incelenmelidir.

**d1-3B Apache-2.0 değildir.** Apache-2.0 lisanslı bir yazılımda geçerli hakların aynen uygulanacağı varsayılmamalı; ticari dağıtım veya ürüne dâhil etme öncesinde Liquid AI'nin güncel lisans metni incelenmeli ve gerekiyorsa hukuki görüş alınmalıdır.

### 8.3. Sonuç

Bu değerlendirme, System One ailesinin belirli koşullar altında üretimde kullanılabileceğini; ancak güvenilir bir dağıtım için **model, çıkarım motoru ve donanım bileşiminin birlikte doğrulanması** gerektiğini göstermektedir.

- **Doğruluk** boyutla artar, ancak 4B sınıfı modeller 27B'ye beklenenden çok yaklaşır; seçim parametre sayısıyla değil görev ve okuma yöntemiyle yapılmalıdır.
- **Güven** kalibre değildir; belirsizlik çıktıda temsil edilmez. Otomatik karar, etiketli veri üzerinde doğrulanmış eşik ve insan incelemesiyle birlikte kurulmalıdır.
- **Türkçe**'de en zayıf nokta sıralı `score` soruları ve paraphrase tutarlılığıdır; ikisi de kuruma ait veriyle ayrıca test edilmelidir.
- **Motor uyumu** modele ve motor sürümüne bağlıdır: D1 ve CLEF test edilen sürümlerde taşınabilir, 27B D3 korumalı modda taşınabilir, küçük D3 modelleri ise test edilen SGLang imajında çalışmaz.
- **Donanım** gerçek bir sınırdır: 27B modeller GB10 üzerinde korumalı çalışma protokolü olmadan güvenilir biçimde çalıştırılamaz.

Üretime geçiş kararı; uygulamaya özgü etiketli veriler üzerinde doğrulanmış eşiklere, karar kayıtlarının sürekli izlenmesine ve her model–motor–sürüm bileşimi için yürütülen ayrı kabul testlerine dayanmalıdır.
