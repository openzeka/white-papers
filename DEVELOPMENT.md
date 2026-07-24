# Development & Contributing

Internal notes for maintaining this Jekyll + [Just the Docs](https://just-the-docs.com)
site published via GitHub Pages with a custom domain. For the published site, see
<https://whitepapers.openzeka.com/>.

## Content

- NVIDIA DGX/HGX data center systems
- NVIDIA Jetson embedded / edge inference
- Cordatus AI real-time video analytics platform
- Digital twin and simulation solutions

## Adding a New White Paper

1. Create a new `.md` file under `papers/` (e.g. `papers/new-topic.md`).
2. Add front matter:

   ```yaml
   ---
   title: New Topic Title
   parent: White Papers
   nav_order: 5
   description: Short description.
   last_modified_date: 2026-07-03
   ---
   ```

3. Add a card / row to the paper list in `index.md` and `papers/index.md`.
4. `git add`, `git commit`, `git push`. GitHub Actions builds and deploys automatically.

## Local Development

```bash
bundle install
bundle exec jekyll serve
# http://127.0.0.1:4000/
```

Requirements: Ruby 3.3, Bundler.

## Structure

```
.
├── .github/workflows/jekyll.yml   # build & deploy
├── _config.yml                    # site config
├── _sass/                         # theme / color customization
│   ├── color_schemes/openzeka.scss
│   └── custom/custom.scss
├── Gemfile
├── index.md                       # landing
├── about.md                       # about
└── papers/                        # white papers
    ├── index.md
    ├── yerel-llm-rehberi.md
    ├── qwen3.6-27b-dgx-spark-benchmark.md
    └── qwen3.6-27b-dgx-spark-scaling.md
```

## Pages Setup (first-time only)

In **Settings → Pages → Build and deployment**, select
**Source: GitHub Actions**. Everything else is automatic after that.

## License

Content © Openzeka Teknoloji A.Ş. See `LICENSE` for details.
