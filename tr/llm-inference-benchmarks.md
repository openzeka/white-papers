---
title: LLM Çıkarım Benchmark Tablosu
nav_order: 4
lang: tr
page_id: llm-inference-benchmarks
description: >-
  NVIDIA DGX Spark (GB10), DGX B300, RTX PRO 6000 Blackwell ve Jetson Thor
  üzerindeki LLM çıkarım performansı için etkileşimli benchmark tablosu. Cihaza,
  modele, kuantizasyona ve eşzamanlılığa göre filtreleyin, kendi hizmet seviyesi
  eşiklerinizi girerek kapasite planlaması yapın.
permalink: /llm-inference-benchmarks/
last_modified_date: 2026-08-31
wide: true
toc: false
---

<script>document.body.classList.add('oz-wide')</script>

## Bu tablo hakkında

Bu sayfa, Openzeka'nın NVIDIA platformları üzerinde çalıştırdığı LLM çıkarım
benchmark'larını tek bir görünümde topluyor. Sabit bir anlık görüntü değil, bir
çalışma aracı: değerlendirdiğiniz donanıma göre filtreleyin, uygulamanızın
gerçekten ihtiyaç duyduğu yanıt sürelerini girin ve her yapılandırmanın kaç
kullanıcıyı desteklediğini okuyun.

Buradaki her değer aynı koşullar altında, aynı ölçüm aracıyla üretildi; bu nedenle
sonuçlar modeller, donanımlar ve hassasiyetler arasında doğrudan
karşılaştırılabilir. Farklı kaynaklardan gelen yayımlanmış sayıları tartarken zor
olan kısım tam da budur ve bu tablonun başlıca amacı bunu sağlamaktır.

Tek tek white paper'larımızın içindeki sabit tabloların aksine bu görünüm
etkileşimlidir. Cihaza, modele, kuantizasyona ve çoklu token tahminine (MTP)
göre filtreleyebilir, herhangi bir sütuna göre sıralayabilir ve bir satırı
açarak grafiğiyle birlikte tam eşzamanlılık taramasını görüp görsel olarak
indirebilirsiniz.

## Tablo nasıl okunur

### Sütunlar

| Sütun | Nedir |
|---|---|
| **Model** | Sunulan model. Bir modelin birden fazla kuantizasyonu test edildiyse her biri ayrı satır olarak görünür. |
| **Cihaz** | Donanım ve düğüm sayısı. `4× DGX Spark`, dört düğümün tek bir modeli birlikte sunması demektir; dört ayrı çalışma değil. |
| **Kuantizasyon** | Ağırlık hassasiyeti — BF16, FP8, NVFP4, MXFP4, INT4, AWQ. Hem bellek ayak izi hem hız üzerindeki en belirleyici etken. |
| **TPS @ C=n** | Seçilen eşzamanlılıkta **tek bir istek için** saniyedeki çıktı token sayısı. Tek bir kullanıcının deneyimlediği değerdir ve eşzamanlılık arttıkça düşer. |
| **TTFT @ C=n** | İlk token süresi (ms) — kullanıcının metin görünmeye başlayana kadar beklediği süre. |
| **Maks C** | Her iki eşiği de karşılayan en yüksek eşzamanlılık. Aşağıya bakın. |
| **Chat Kapasitesi** | Maks C × chat çarpanı. |
| **Agentic Kapasitesi** | Maks C × agentic çarpanı. |
| **TP / DP / PP** | Tensor, data ve pipeline paralelliği. `—` geçerli değil demektir. Çok düğümlü satırlarda modelin düğümlere nasıl bölündüğünü gösterir. |
| **Motor** | vLLM ya da SGLang. |
| **MTP** | Çoklu token tahmini (spekülatif kod çözme). Bir model hem MTP'li hem MTP'siz görünüyorsa, ikili bunun ne kazandırdığını gösterir. |

TPS ve TTFT hücreleri o anki eşiklere göre yeşil veya kırmızı renklendirilir;
böylece seçilen eşzamanlılıkta başarısız olan bir satır ilk bakışta fark edilir.

### Üç kapasite sütunu

Bunlar ham ölçümlerden ve **Varsayımlar** panelindeki eşiklerden
**tarayıcınızda hesaplanır** — hiçbiri önceden hesaplanmış ya da saklanmış
değildir:

| Sütun | Formül |
|---|---|
| **Maks C** | Çalışmanın her iki hizmet seviyesi eşiğini de karşıladığı en yüksek eşzamanlılık: TTFT eşiğin altında **ve** istek başına TPS eşiğin üstünde. |
| **Chat Kapasitesi** | Maks C × chat çarpanı. Etkileşimli sohbet kullanıcıları düzensiz aralıklarla istek gönderir ve zamanın çoğunda boştadır — okur, düşünür, yazar — bu nedenle tek bir eşzamanlı yuva birden fazla kişiye hizmet eder. |
| **Agentic Kapasitesi** | Maks C × agentic çarpanı. Agentic iş yükleri uzun üretimler ve araç çağrıları boyunca yuvayı elinde tutar; bu yüzden çarpan belirgin biçimde düşüktür. |

### Kendi eşiklerinizi girme

Varsayılan değerler — TTFT 1000 ms'nin altında, istek başına 20 tok/s, chat için
×4 ve agentic için ×1,5 — makul bir başlangıç noktasıdır, evrensel bir cevap
değil. **Varsayımlar panelini açıp kendi hizmet seviyesi hedeflerinizi girin.**
Her satır anında yeniden hesaplanır.

### Eşzamanlılık seviyesi seçme

Eşzamanlılık seçici, TPS ve TTFT sütunlarının hangi ölçüm noktasını
göstereceğini ve iki performans kaydırıcısının hangi nokta üzerinden
filtreleyeceğini belirler. Maks C, Chat ve Agentic değerlerini etkilemez —
bunlar her zaman taramanın tamamını dikkate alır.

Bir satır yalnızca seçilen eşzamanlılıkta ölçülmüşse görünür; bu nedenle yukarı
çıktıkça görünen satır sayısı azalır.

### Filtreleme ve sıralama

Cihaz, kuantizasyon ve MTP birer aç/kapa düğmesidir — yan yana karşılaştırmak
için birden fazlasını seçebilir, temizlemek için **Tümü**'ye basabilirsiniz.
Model listesinde arama kutusu ve onay kutuları vardır. Dört kaydırıcı; minimum
TPS, maksimum TTFT, minimum chat ve minimum agentic kapasitesine göre daraltır.

Sıralamak için herhangi bir sütun başlığına tıklayın; yeniden tıklamak sıralamayı
ters çevirir. Tablonun üstündeki sayaç, toplam yapılandırmanın kaçının
eşleştiğini her zaman gösterir.

### Bir satırı açma

Her satırın sonundaki ▶ oku tam eşzamanlılık taramasını açar:

- O anki eşiklerinize göre **BAŞARILI/BAŞARISIZ** durumuyla birlikte, nokta nokta TTFT ve TPS tablosu
- İki eksenli bir grafik — solda istek başına TPS, sağda toplam verim (TPS × C). Eşzamanlılık arttıkça ikisi ayrışır: tek tek kullanıcılar yavaşlarken makinenin tamamı daha fazla toplam iş yapar.
- **Grafiği İndir**, grafiği sunum veya rapor için PNG olarak kaydeder
- Önemli olan ayarlar — konteyner imajı, KV cache hassasiyeti, attention arka ucu — altındaki notlarda yer alır

Bir satırı açmak adres çubuğunu da günceller; böylece tek bir yapılandırmaya
doğrudan bağlantı verebilirsiniz ve gönderdiğiniz kişide o satır açık olarak
görünür.

## Yöntem

Tüm değerler, OpenAI uyumlu bir streaming uç noktasına karşı
[CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark) ile
ölçülmüştür:

- 128 token giriş, 128 token çıkış
- Eşzamanlılık seviyesi başına 10 tur, 1 ısınma isteği
- Metrikler: TTFT (ms), ITL (ms), TPS (tok/s), gecikme (s), verim (RPS)
- Eşzamanlılık taraması: C = 1, 2, 4, 8, 16, 32, 64

TPS **istek başına** raporlanır, toplam değil. Açılan grafik ikisini birden
gösterir: sol eksende istek başına TPS, sağ eksende toplam verim (TPS × C).

## Benchmark verisi

<link rel="stylesheet" href="/assets/css/benchmark-table.css">

<div data-bt-src="/assets/data/benchmarks.json"
     data-bt-logo="/assets/images/benchmark-logo.png"></div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/benchmark-table.tr.js"></script>

---

## İlgili white paper'lar

Bu tablodaki bazı yapılandırmalar başka belgelerde ayrıntılı olarak inceleniyor:

- [Qwen3.6-27B DGX Spark Benchmark]({{ '/papers/qwen3.6-27b-dgx-spark-benchmark/' | relative_url }}) — kuantizasyon karşılaştırması (FP8 / AWQ / NVFP4, MTP'li ve MTP'siz)
- [Qwen3.6-27B DGX Spark Cluster Ölçeklendirme]({{ '/papers/qwen3.6-27b-dgx-spark-scaling/' | relative_url }}) — TP1 / TP2 / TP4 çok düğümlü ölçeklendirme
- [Kimi K3 DGX-B300 Inference Benchmark]({{ '/papers/kimi-k3-dgx-b300-inference-benchmark/' | relative_url }}) — vLLM ve SGLang karşılaştırması, spekülatif kod çözme
- [Yerel LLM Kullanım Rehberi]({{ '/papers/yerel-llm-rehberi/' | relative_url }}) — donanım, model ve yazılım katmanı seçimi
