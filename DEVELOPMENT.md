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

### Docker (recommended — one command, no Ruby on the host)

```bash
docker compose up          # site  http://localhost:4000
                           # data  http://localhost:4001  (local only)
docker compose up -d       # in the background
docker compose down        # stop
```

Two services come up: the Jekyll dev server, and a small tool for the CV
benchmark data store (`_tools/data_admin.py`) that lists what has been
published and deletes devices, models or single camera counts, rebuilding
`index.json` after each change. The site is static and cannot delete its own
files, which is why deletion needs a process. It is never deployed — Jekyll
excludes `_tools/`, and the port is bound to 127.0.0.1.

First start installs the gems into `vendor/bundle` (gitignored) and takes a
couple of minutes; every start after that is a second or two, because
`bundle check` skips the install. The site rebuilds on save and LiveReload is
on, so the browser refreshes itself.

The container runs as **your** user, so `_site/` and `.jekyll-cache/` are not
left owned by root. It defaults to uid/gid 1000; if yours differs, write them
once into `.env` (also gitignored):

```bash
printf 'UID=%s\nGID=%s\n' "$(id -u)" "$(id -g)" > .env
```

Other jobs in the same container:

```bash
docker compose run --rm site bundle update           # update gems
docker compose run --rm site bundle exec jekyll build  # one-off build
```

The image is `ruby:3.1` rather than `jekyll/jekyll`: the latter is Alpine-based
and the dart-sass binary shipped with `sass-embedded` does not run on musl, so
the theme fails to compile.

### Directly on the host

```bash
bundle install
bundle exec jekyll serve
# http://127.0.0.1:4000/
```

Requirements: Ruby 3.3, Bundler, and the headers native gems need
(`ruby-dev`, `libffi-dev`, `build-essential`).

## Structure

```
.
├── .github/workflows/jekyll.yml   # build & deploy
├── docker-compose.yml             # local dev server
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
