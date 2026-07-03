# Openzeka White Papers

Openzeka Teknoloji A.Ş. teknik white paper deposu. Jekyll + [Just the Docs](https://just-the-docs.com)
temasıyla derlenir ve GitHub Pages üzerinden yayınlanır.

**Canlı site:** <https://openzeka.github.io/white-papers/>

## İçerik

- NVIDIA DGX/HGX veri merkezi sistemleri
- NVIDIA Jetson gömülü/edge çıkarımı
- Cordatus AI gerçek zamanlı görüntü analitiği platformu
- Dijital ikiz ve simülasyon çözümleri

## Yeni White Paper Ekleme

1. `papers/` klasöründe yeni bir `.md` dosyası oluştur (örn. `papers/yeni-konu.md`).
2. Front matter ekle:

   ```yaml
   ---
   title: Yeni Konu Başlığı
   parent: White Papers
   nav_order: 5
   description: Kısa açıklama.
   last_modified_date: 2026-07-03
   ---
   ```

3. `index.md` ve `papers/index.md` içindeki paper listesine bir kart/satır ekle.
4. `git add`, `git commit`, `git push`. GitHub Actions otomatik build alır.

## Yerel Geliştirme

```bash
bundle install
bundle exec jekyll serve
# http://127.0.0.1:4000/white-papers/
```

Gereksinimler: Ruby 3.3, Bundler.

## Yapı

```
.
├── .github/workflows/jekyll.yml   # build & deploy
├── _config.yml                    # site config
├── _sass/                         # tema/renk özelleştirme
│   ├── color_schemes/openzeka.scss
│   └── custom/custom.scss
├── Gemfile
├── index.md                       # landing
├── about.md                       # hakkımızda
└── papers/                        # white paper'lar
    ├── index.md
    ├── cordatus-architecture.md
    ├── edge-inference-jetson.md
    ├── dgx-enterprise-ai.md
    └── digital-twin-ai.md
```

## Pages Ayarı (yalnızca ilk kurulumda)

Repo **Settings → Pages → Build and deployment** alanında **Source: GitHub Actions**
seçilmelidir. Bundan sonrası otomatiktir.

## Lisans

İçerik © Openzeka Teknoloji A.Ş. Daha fazla bilgi için `LICENSE` (eklenecek).
