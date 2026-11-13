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

Follow [`skills/add-white-paper/SKILL.md`](skills/add-white-paper/SKILL.md) —
step by step, readable by a person or by any coding agent. In short: every paper
is three files — `papers/<slug>.md` (English, the source), `tr/papers/<slug>.md`
and `nl/papers/<slug>.md` — with an English slug; the translations follow
[`skills/add-white-paper/TERMINOLOGY.md`](skills/add-white-paper/TERMINOLOGY.md).
Its `date` puts it on every home page automatically, newest first; you choose
its topic position in the sidebar (`nav_order`) and add its row, at that
position, to the three `papers/index.md` tables and the `README.md` library
table. Company details (the "Prepared by" line, footers, purchase buttons) are
never written into a paper: they come from `_data/<lang>/company.yml`. Then:

```bash
python3 _tools/check_papers.py       # twins, front matter, tables — exit 0 = consistent
python3 _tools/check_translation.py  # every translation against its English source
```

Benchmark runs for the LLM Inference Benchmark Explorer have their own
procedure: [`skills/add-benchmark/SKILL.md`](skills/add-benchmark/SKILL.md);
runs for the VLM Inference Benchmark Explorer:
[`skills/add-vlm-benchmark/SKILL.md`](skills/add-vlm-benchmark/SKILL.md).

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

The image is `ruby:3.3` rather than `jekyll/jekyll`: the latter is Alpine-based
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
├── _data/<lang>/                  # interface strings and company blocks, per language
├── _includes/company/             # places the company blocks in a paper
├── _tools/                        # checkers and data tools (not built)
├── skills/                        # procedures for a paper or a benchmark run
├── index.md                       # landing
├── about.md                       # about
├── papers/                        # English papers, and each paper's images in papers/<slug>/
│   ├── index.md
│   └── <slug>.md …
├── tr/                            # Turkish: the same pages, same permalinks (site adds /tr)
└── nl/                            # Dutch: the same pages, same permalinks (site adds /nl)
```

## Cookie banner

With `google_analytics` set in `_config.yml`, every page shows a consent banner
(GDPR / KVKK) and analytics runs in Google's Consent Mode, denied until the
visitor accepts. The choice is stored in the browser (`localStorage`), so a
visitor who has answered once never sees the banner again — open a private
window to see it.

## Pages Setup (first-time only)

In **Settings → Pages → Build and deployment**, select
**Source: GitHub Actions**. Everything else is automatic after that.

## License

Content © Openzeka Teknoloji A.Ş. See `LICENSE` for details.
