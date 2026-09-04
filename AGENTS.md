# AGENTS.md

Entry point for coding agents working in this repository (opencode, Claude Code,
Cursor, and anything else that reads this file). Written to be self-contained:
everything an agent needs to make a safe change is either here or in the task
guides linked below.

## What this repo is

A Jekyll site published at <https://whitepapers.openzeka.com> — OpenZeka's
technical white papers plus the interactive LLM Inference Benchmark Explorer.
Theme is the `just-the-docs` **gem** 0.9.0, not `remote_theme`.

Bilingual via `jekyll-polyglot`: English at the root, Turkish under `/tr/`. Every
page exists twice — `foo.md` (`lang: en`) and `tr/foo.md` (`lang: tr`) — sharing
the **same `permalink`** and the **same `page_id`**. Both copies change together,
always.

## Local development

The project targets Ruby 3.3 and is normally run through Docker, which avoids
needing a local Ruby:

```bash
# preview on http://localhost:4000, reflecting the working tree
docker run -d --name oz-preview -p 4000:4000 \
  -v "$PWD":/site -v oz-gems:/usr/local/bundle -w /site ruby:3.3-slim \
  bash -lc 'apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq build-essential >/dev/null 2>&1; bundle install --quiet; exec bundle exec jekyll serve --host 0.0.0.0 --port 4000 --force_polling'

docker restart oz-preview     # required after editing _config.yml

# production build, identical to CI
docker run --rm -v "$PWD":/site -v /tmp/out:/out -v oz-gems:/usr/local/bundle \
  -w /site ruby:3.3-slim \
  bash -lc 'bundle install --quiet; JEKYLL_ENV=production bundle exec jekyll build --destination /out --quiet'
```

Sass deprecation warnings from the theme are pre-existing noise. There is no test
suite; browser behaviour is checked by building the site, serving `_site`, and
running headless Chrome against it — `file://` does not work, because the
benchmark widget fetches JSON.

## Task guides

| Task | Guide |
|---|---|
| Add benchmark results to the Explorer | [`.claude/skills/add-benchmark/SKILL.md`](.claude/skills/add-benchmark/SKILL.md) |

These live under `.claude/skills/` so Claude Code picks them up as invocable
skills (`/add-benchmark`). They are plain Markdown with YAML front matter — any
agent can read one directly from that path, and should when the task matches.

## Rules that must not be broken

**`assets/data/benchmarks.json` must never move or be renamed.** It is the single
source of truth for the Explorer and is consumed by more than one site, so a
rename breaks a page that does not live in this repo. Validate it before
publishing — nothing in the build checks it:

```bash
python3 _tools/validate.py     # exit 0 = safe to publish
```

**The two widget files differ in exactly one block.** `assets/js/benchmark-table.js`
and `assets/js/benchmark-table.tr.js` are byte-identical after the `/* ═══`
marker comment; only the `var S = {…}` string object above it differs, and both
objects must carry the same keys in the same order — a key missing from one
language renders as `undefined`. Edit the English file, then splice its body
across and re-check:

```bash
python3 -c "
import io; M='  /* ═'
en=io.open('assets/js/benchmark-table.js',encoding='utf-8').read()
tr=io.open('assets/js/benchmark-table.tr.js',encoding='utf-8').read()
io.open('assets/js/benchmark-table.tr.js','w',encoding='utf-8').write(tr[:tr.index(M)]+en[en.index(M):])
print('spliced')"
```

**Add every UI string to both `_data/en/strings.yml` and `_data/tr/strings.yml`,**
read as `site.data[site.active_lang].strings.<key>`.

**Do not duplicate images under `tr/`.** `exclude_from_localization` keeps
`assets/` and `images/` at the root, so paper images resolve correctly from
Turkish pages already.

**Widget CSS stays scoped under `.bt-container`.** The theme styles bare `th, td`;
the overrides in `_sass/custom/custom.scss` undo that for the widget only. A leak
reformats every published paper.

## Conventions

- Adding a white paper means `papers/x.md`, `tr/papers/x.md`, and a row in both
  `papers/index.md` and `tr/papers/index.md`. The home-page card grid is
  generated from front matter (`card_order`, `card_tag`, `card_date`) by
  `_includes/paper-grid.html`, so neither home page needs editing.
- **Never put a heading (`h1`–`h6`) inside `<a class="paper-card">`.** Heading
  anchors are injected into every heading, and a nested `<a>` makes the browser
  close the card early and scatter its contents across the grid.
- Turkish headings inside a `markdown="1"` block need an explicit
  `{#ascii-slug}`: kramdown strips non-ASCII instead of transliterating it.
- Layout widths come from four `:root` variables in `_sass/custom/custom.scss`.
  No page defines its own width; change the variable, not the page.
- Squash-merge turns the **PR title** into the commit message, so keep PR titles
  free of markdown.
