# CV benchmark veri deposu

[CV Inference Benchmark Explorer](https://whitepapers.openzeka.com/cv-inference-benchmarks/)
sayfasının okuduğu veri. Tek bir dosya değil, çünkü aylara yayılarak azar azar
yazılıyor: bir cihaz ekleniyor, o cihaza bir model ekleniyor, ilk denemede
başarısız olan bir kamera sayısı sonradan tekrar ölçülüyor.

```
index.json                     ne var ne yok — sayfanın adını bilmek zorunda olduğu tek dosya
rtx-3090/
├── device.json                GPU, bellek, sürücü, CUDA, CPU — cihaz başına bir kez
├── peoplenet-int8.json        ölçümler, kamera sayısına göre anahtarlı
└── yolo11-n.json
jetson-orin-nano/
├── device.json                + JetPack, L4T, modül parça numarası
└── peoplenet-int8.json
```

Dosya adı `<cihaz-slug>/<model-slug>[-<precision>].json`.

## Ölçümler neden kamera sayısına göre anahtarlı

```json
"points": {
  "30": {
    "cameras": 30,
    "fps_per_camera": 18.93,
    "fps_total": 567.79,
    "drop_pct": 0.5,
    "measured_at": 1789469626.75,
    "run": "20260915_124900",
    "run_id": "M-15_30cam_8ba6d943"
  }
}
```

Liste değil sözlük: 30 kamera testini tekrar çalıştırdığınızda yalnızca `"30"`
anahtarı değişir, dosyadaki diğer bütün ölçümler olduğu gibi kalır. Her nokta
geldiği sweep'i taşır, dolayısıyla yayınlanan her sayı
`data/results/<run>/runs/<run_id>.json` içindeki ham profiler örneklerine kadar
geri izlenebilir.

## Veri nasıl eklenir

Ölçümü alın, sonra benchmark aracının içinden:

```bash
python3 -m benchmark.export_explorer \
        --out-dir /path/to/white-papers/assets/data/cv-benchmarks
```

Araç neyin eklendiğini/güncellendiğini satır satır yazar; `--dry-run` ile önce
bakabilirsiniz. Aynı sonuçları iki kez export etmek hiçbir şeyi değiştirmez:
diskteki ölçümden daha eski bir ölçüm üzerine yazılmaz.

`notes` alanına elle yazdığınız açıklamalar korunur — export yalnızca boş
alanları doldurur ve ölçüm noktalarını günceller.

## Neler yayınlanmaz

Araç şu üç durumu kendiliğinden eler ve **neden elediğini raporlar**:

| Durum | Sebep |
|---|---|
| İstenen kameraların hepsi yayında değildi | O satır etiketindeki kamera sayısını ölçmemiştir; sayfada olmayan bir performans uçurumu gibi okunur |
| Eski matematikle kaydedilmiş koşu | Engine'in placeholder kaynağı düşülmemiş olabilir; `python3 -m benchmark.recompute <set_id>` ham örneklerden düzeltir, ölçümü tekrarlamak gerekmez |
| Kaynak hızının üstünde kamera başına FPS | Fiziksel olarak imkânsız (bir kamera yayınladığından hızlı işlenemez) — yukarıdaki durumun görünür hâli |

## Veri silmek

En kolayı yerel yönetim sayfası: repo kökünde `docker compose up` dedikten
sonra **http://localhost:4001**. Ağaçtaki her cihazı, modeli ve kamera sayısını
listeler; tek tek siler ve `index.json`'u kendisi tazeler. Sayfa siteye dahil
değildir (`_tools/data_admin.py`, Jekyll alt çizgili yolları derlemez) ve
yalnızca bu makineden erişilebilir.

Elle yapmak isterseniz aynı iki kural geçerli.

**1. index.json'u tazele.** Tarayıcı klasör listeleyemediği için ne olduğunu bu
dosya söylüyor; silinen dosya orada yazmaya devam ederse sayfa var olmayan bir
dosyayı istemeye devam eder:

```bash
rm -rf rtx-3090                      # cihazın tamamı
rm rtx-3090/yolo11-n.json            # yalnızca bir model
python3 -m benchmark.export_explorer --out-dir . --index-only
```

`--index-only` ölçüm aktarmaz, sadece ağacı tarayıp index'i yeniden yazar.
(Sayfa index'in yanıldığı duruma dayanıklıdır: bulamadığı dosyayı atlar ve geri
kalanı gösterir, boş ekran vermez. Ama o satır yine de kayıptır.)

**2. Kaynağı da sil, yoksa geri gelir.** Depo ekleyerek çalışıyor: ölçüm hâlâ
benchmark aracının `data/results/<set_id>/` klasöründeyse, bir sonraki tam
export onu yeniden yazar. Kalıcı olarak kaldırmak için o koşuyu da silin
(arayüzdeki *Sil* düğmesi ya da klasörü kaldırarak).

Tek bir kamera sayısını çıkarmak istiyorsanız model dosyasındaki `points`
içinden o anahtarı silin — aynı kural burada da geçerli: kaynak koşu duruyorsa
sonraki export onu geri koyar.

## index.json

Tarayıcı bir klasörü listeleyemez, bu yüzden hangi dosyaların olduğunu bu dosya
söyler. Her export'ta **ağaç taranarak** yeniden üretilir; elle eklenmiş bir
dosya da böylece listeye girer.

Ayrıca sayfanın varsayılan hedef FPS'i ve kaynak profilleri burada durur. Kaynak
profili önemlidir: 20 FPS yayın yapan 16 kamera ile 30 FPS yayın yapan 16 kamera
aynı şey değildir, ve hiçbir yapılandırma bir kamerayı yayınladığından hızlı
işleyemez.
