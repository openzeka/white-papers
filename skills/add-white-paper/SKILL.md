---
name: add-white-paper
description: Add a new white paper to whitepapers.openzeka.com, in English and Turkish. Use whenever the user asks to add, publish or create a white paper, report, guide or benchmark write-up on the site. Creates both language pages with the right front matter, places the paper in the sidebar by topic, adds its row to both White Papers tables and to the README, and checks the result.
---

# Add a white paper

Every paper exists **twice**: `papers/<slug>.md` (English) and
`tr/papers/<slug>.md` (Turkish). Four lists show the papers, and all four must
pick the new one up correctly:

| List | Ordered by | Automatic? |
|---|---|---|
| Home page "Latest White Papers" cards | `date`, newest first | **Yes** — from front matter |
| Sidebar under White Papers | `nav_order`, by topic | No — you choose the position |
| Table on `/papers/` | same order as the sidebar | No — you add the row, in both languages |
| `README.md` "Research & Engineering Library" table (the GitHub front page) | same order as the sidebar | No — you add the row |

## 1. Confirm the details with the user — before writing any file

**Do not create or edit anything until the user has answered.** Read the draft,
then send the user one message proposing a value for each item below and wait
for their reply. Propose, never pick silently — even where the default seems
obvious, the user confirms it:

- **Content in both languages.** If only one language was provided, ask whether
  you should translate it or whether a translation exists. A translation you
  write must be flagged in your report as needing review by a fluent reader.
- **The slug** — propose one: lowercase, hyphenated, e.g.
  `qwen3.6-27b-dgx-spark-benchmark`. It becomes the URL `/papers/<slug>/` and
  cannot change later without breaking links.
- **The publication date** — propose today's date.
- **The title and one-sentence description** in each language (step 2).
- **The `card_tag`** — propose one from the existing list (step 2).
- **Where it sits in the sidebar** — propose the paper it follows, with the
  reason (step 3), and name any papers that would be renumbered.
- **The images**, if the draft refers to any.

If the draft looks like a test, a placeholder or unfinished work (placeholder
numbers, "draft", "TBD"), say so and ask whether it should be added at all.

## 2. Create both pages

Same slug in both folders. Front matter, in this order:

```yaml
---
title: <Title in this language>
parent: White Papers
nav_order: <see step 3>
lang: en                      # tr in the Turkish file
page_id: <slug>
date: 2026-09-24              # publication date — see below
card_tag: "LLM Benchmark"     # short label on the home card, in this language
description: >-
  One or two sentences in this language. This is both the home-page card text
  and the page's meta description.
permalink: /papers/<slug>/
last_modified_date: 2026-09-24
toc: true
---
```

- **`page_id`, `permalink`, `parent`, `nav_order` and `date` are identical in
  both files.** `permalink` is `/papers/<slug>/` in the Turkish file too — the
  site adds `/tr` itself.
- **`date` puts the paper on the home page.** It is the publication date, and
  the card's month ("September 2026" / "Eylül 2026") is generated from it. Do
  not add a `card_order` or `card_date` field — they no longer exist.
- `parent: White Papers` stays in English in the Turkish file.
- **`card_tag`** — reuse an existing one where it fits, translated in the
  Turkish file: `Decision Guide` / `Karar Rehberi`, `Architecture Comparison` /
  `Mimari Karşılaştırma`, `Cluster Setup` / `Cluster Kurulumu`, `LLM Benchmark`,
  `LLM Scaling` / `LLM Ölçekleme`, `LLM Deployment` / `LLM Dağıtımı`.

**Images** go in `papers/<slug>/` only — **never** under `tr/papers/`. Both
languages link to the same files:

```markdown
![Alt text]({{ '/papers/<slug>/images/chart.png' | relative_url }})
```

Links to other pages use the same form,
`{{ '/papers/other-slug/' | relative_url }}`, so they get the `/tr` prefix on
Turkish pages. A plain `[text](/papers/x/)` link does not.

**Company details are never written into a paper.** The "Prepared by" line,
the contact footer, the "About us" section, the closing call to action and
the purchase buttons all come from `_data/en/company.yml` and
`_data/tr/company.yml`; the paper places them with one line each, and holds
only its own content:

```markdown
{% include company/block.html name="prepared_by" %}
{% include company/product-button.html product="dgx-spark-bundle" %}
```

| Block (`name=`) | What it shows | Used by |
|---|---|---|
| `prepared_by` | the "Prepared by" / "Hazırlayan" line under the title | most papers, line ~18 |
| `prepared_by_short` | the short "Prepared by" line at the very end | Qwen3.6-27B benchmark |
| `footer` | company, website, phone, address | DeepSeek papers |
| `footer_with_email` | the same with the support email (English only) | Qwen3.6-27B scaling |
| `about_report` / `contact_table` | an "About us" section and its contact table | Qwen3.6-27B benchmark |
| `about_profile` | the longer company profile with logo | Local LLM guide |
| `cta_logo` + `contact_cta` | logo and "contact us: …" at the close | Local LLM guide, Conditional Memory |
| `legal_name`, `name`, `website` | single values, usable inside a sentence | `/papers/` index |

Copy the lines from the paper most like yours. `contact_cta` stands inside a
sentence (`… TCO analysis, {% include company/block.html name="contact_cta" %}`).
A product card's button names a key under `products:`; a new product needs its
page URL added there, in both languages. If a paper needs a company sentence
that no block covers, add a new key to both `company.yml` files rather than
writing the details into the paper.

**Turkish headings inside a `<div markdown="1">` block** need an explicit ASCII
id, e.g. `### Önce iki ayrım {#once-iki-ayrim}` — otherwise the Turkish letters
are dropped from the anchor.

## 3. Choose the sidebar position

The sidebar (and the `/papers/` table) run **by topic**, in the order a reader
works: decide → build → run and measure.

| Block | What goes in it | Order inside |
|---|---|---|
| 1. Guides | general decision guides | — |
| 2. Architecture | platform and architecture comparisons | — |
| 3. Cluster setup | cluster build guides | fewest nodes first |
| 4. Benchmarks & deployments | measured results, model deployments | DGX Spark before larger platforms; within a model, fewer nodes first |

See where the paper fits:

```bash
grep -H '^nav_order' papers/*.md | sort -t: -k3 -n
```

Give it the `nav_order` of the paper it should come right before, and add 1
to **every** paper from that one onward — in **both** languages. Numbers
stay whole (1, 2, 3 …), with no gaps and no decimals. A paper at the end of
the last block simply takes the next number.

If it fits no block, stop and ask the user where it belongs.

## 4. Add the table row, in both languages

`papers/index.md` and `tr/papers/index.md` each list every paper in one table.
Add the new row **at the same position as in the sidebar**, in both files.
The benchmark Explorer rows (links written with `relative_url`) always stay
last.

```markdown
| [Title](slug) | What it covers | Hardware it ran on |
```

Title and topic are in each file's language. The link is the bare slug.

## 5. Update the README

`README.md` is what people see first on GitHub. It is English only.

1. **Library table** — under "Research & Engineering Library", add the paper's
   row at the **same position as in the sidebar**, benchmark Explorer rows
   last, like the `/papers/` table. Same three columns, but the link is the
   **full URL**: `https://whitepapers.openzeka.com/papers/<slug>/`.
2. **The section it belongs to** — the README also has longer sections by
   theme ("Featured Research", "From Benchmarks to Real Infrastructure",
   "AI Factory Architecture", …). If the paper extends one of them — a new
   cluster size, a new model on a platform already covered — add it there too:
   the row in that section's table and a `**[Read … →](full URL)**` link. For
   a substantial new study, a short section of its own under "Featured
   Research" (heading, one bold line of key facts, a few sentences on what it
   measures, the read link). Summarise only what the paper itself says.
3. If the paper brings a **new chart directory** worth pointing at, the tree
   under "Raw Data, Charts and Reproducibility" can gain it — optional.

## 6. Check it

```bash
python3 _tools/check_papers.py      # exit 0 = consistent
```

This fails if a Turkish twin is missing, a required field is missing, the two
languages disagree on `page_id` / `permalink` / `parent` / `nav_order` /
`date`, two papers share a `nav_order`, images were copied under `tr/papers/`,
or any of the three tables — both `/papers/` tables and the README library
table — is out of order or missing the paper. It also fails if a paper names a
company block or product that `company.yml` does not have in that language, or
writes company details by hand (a "Prepared by" line, a purchase-button link,
the legal name, the support email or phone). Fix every error.

Then look at it in a browser, both languages:

- `/` and `/tr/` — the new card is **first**, with the right month.
- `/papers/` and `/tr/papers/` — the row and the sidebar entry sit in the same
  place.
- The paper page itself, in both languages — images load, links work.

## 7. Report back

Tell the user the slug, where it landed in the sidebar and tables (which paper
it follows), which other papers were renumbered, what was added to the README
beyond the table row, and the URLs to look at on the local preview. Say plainly
that the change is **local only**: nothing is published until it is committed,
reviewed and merged, and external publication needs the author's approval.
Never describe the paper as "published".

## Keeping this skill true

If the front-matter fields, the home-page ordering, the table layout or the
company blocks change, update this file and `_tools/check_papers.py` in the
same commit.
