source "https://rubygems.org"

# Jekyll
gem "jekyll", "~> 4.3.4"

# Tema (yerel geliştirme için; CI'da remote_theme kullanılır)
gem "just-the-docs", "0.9.0"

# Jekyll eklentileri
group :jekyll_plugins do
  gem "jekyll-seo-tag"
  gem "jekyll-sitemap"
  gem "jekyll-feed"
end

# Windows / JRuby için zaman dilimi verileri
platforms :mingw, :x64_mingw, :mswin do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
  gem "wdm", "~> 0.1.1"
end

# Performans
gem "webrick", "~> 1.8"
