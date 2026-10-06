---
name: add-vlm-benchmark
description: Add vision-language model (VLM) benchmark runs to the VLM Inference Benchmark Explorer (the VLM data store, assets/data/vlm-benchmarks/). Use whenever the user hands over a VLM benchmark tool export (a JSON file with "runs") and asks to add it to the whitepapers, publish VLM results, or import a VLM benchmark. Imports with the repo's importer, asks for the facts the export does not contain, validates, and writes the changelog entries.
---

# Add VLM benchmark runs to the Explorer

The VLM data store, `assets/data/vlm-benchmarks/`, is the single source of truth
for the
[VLM Inference Benchmark Explorer](https://whitepapers.openzeka.com/vlm-inference-benchmarks/).
It is laid out like the CV store:

```
assets/data/vlm-benchmarks/
├── index.json                 default target, workload, models, devices and their runs
├── jetson-agx-orin-32gb/
│   ├── device.json            name, product, memory, unified or not
│   └── <run id>.json          one run = one row of the Explorer
└── rtx-pro-6000/ …
```

The site build combines it into `/assets/data/vlm-benchmarks.json`, which the
Explorer fetches. **The store is written by `_tools/vlm_import.py` (through
`_tools/bench_store.py`) and nothing else — never type or edit a number in it
by hand.** Work slowly, ask rather than guess, and never invent a
value.

**Adding runs is a data-only change.** The table, each run's permanent page
(`/vlm-inference-benchmarks/<model>/<device>/<quantization>-<engine>/`, in every
language), its explanation, its sitemap entry and its record in
`/llms-full.txt` are generated from the data at build time. No page, JS or CSS
needs touching.

## What the explorer assumes about the data

Read this before importing: a run that breaks these assumptions shows wrong
numbers without any error.

- **One camera = one request in flight.** A camera sends its next request as
  soon as the previous one is answered, so concurrency *is* the number of
  cameras. Max Cameras is the highest measured concurrency at which the
  **response time — the mean time to first token (TTFT)** — meets the target
  (default 3 s). The means are over the requests that completed, so a request
  that failed during the benchmark does not count against a configuration.
- **The measurement matrix.** Every configuration is two runs of the VLM
  Benchmark Tool, both with the prompt *Describe the scene.* and up to 128
  output tokens:
  - `<tag>`: **one camera**, all image sizes (480p, 720p, 1080p, 2K) × 1, 3 and
    5 images per request;
  - `<tag>_conc`: **several cameras**, one image per request, 480p / 720p /
    1080p × 1, 2, 4, 8 (and 16 on a GPU workstation) concurrent requests.

  The importer merges the two into one row with one entry per measured cell.
  A run with other sizes, image counts or levels still imports, but the
  explorer's how-to text describes this matrix — tell the user if a new export
  differs, because the page copy may need changing too.
- **The default view** is 720p with one image per camera. A row needs a
  `_conc` run at 720p to have a meaningful Max Cameras there.

## 1. Look at the export, outside the repo

The tool's export is one JSON file: `{"generated", "metrics", "runs": [...],
"system_info"}`. **It also contains host addresses, GPU slots, container lists
and disk contents. Keep it outside the repository and never commit it** — the
importer copies only the public facts.

```bash
python3 _tools/vlm_import.py <export.json> --check
```

prints every run it found as `id (model · device · quantization · engine ·
settings)` and how it would merge into the store, and writes nothing.
It stops with a message when a device or a model is not in its tables — that is
step 2.

## 2. Facts the export does not settle — ask the user

The importer maps the tool's strings through two tables at the top of
`_tools/vlm_import.py`. A new device or model means adding a line there first.

**A new model** — `MODELS["<model string in the export>"] = (name, repo,
params, served)`:

| Field | Rule |
|---|---|
| `name` | The publisher's model name without the organisation (`Qwen3-VL-8B-Instruct`, `Gemma-4-31B-it`). **If the model is already in the LLM Inference Benchmark Explorer, use exactly its name there.** A quantized or repackaged checkpoint gets the base model's name; the quantization column tells them apart. |
| `repo` | The publisher's own Hugging Face repo of the base model. |
| `params` | The total parameter count as published, vision encoder included, written like `8.8B` or `30B`. **If the model is in the LLM explorer, copy its `params` value.** Ask when the card gives no figure. |
| `served` | The repo of the checkpoint that was actually served when it is a repackaging (`nvidia/…-NVFP4`), else `None`. Ask if unclear. |

**A new device** — a line in `DEVICES`: the prefix the export's device string
starts with, the short name shown in the explorer, a short code for the id
(unique per device), and the full product name, memory and whether the memory
is shared by CPU and GPU. The short name carries the memory size when the
product is sold in more than one (`Jetson AGX Orin 32GB`, `Jetson Orin NX
16GB`), and none when it is not (`RTX PRO 6000 Max-Q`). The name is part of
every run page's URL, so settle it before the first publish. Add the device to
`DEVICE_ORDER` in the three
`assets/js/vlm-benchmark-table*.js` files (identical in all three, below the
`/* ═══` line) so it sorts in its place.

Also confirm with the user:

- **Thinking mode.** Reasoning-capable models must run with thinking off, or
  the first token is a thinking token and the response time is wrong. The
  importer records `enable_thinking false` from the export's settings in the
  row's `notes`; if a reasoning model's notes do not say so, ask.
- **Failed requests.** They are left out of the means and do not affect Max
  Cameras. The validator lists them; when one run has many, mention it to the
  user — it usually means a server problem worth rerunning, but it is not a
  reason to hold the row back.

## 3. Import

```bash
python3 _tools/vlm_import.py <export.json>
```

**Merges by default:** a run whose id already exists is replaced, every other
run is kept; each run lands in `<device>/<run id>.json` and `index.json` lists
it. `--replace` rebuilds the whole store from one export and drops every run
not in it — use it only when the user asks for exactly that.

The id is `<model>_<device code>_<quantization>_<engine>`, lower case. **It
also sets the run's permanent URL, which must never change** — so never rename
a model, device or engine of a published row; ask the user first if it seems
necessary.

## 4. Validate

```bash
python3 _tools/validate_vlm.py      # exit 0 = safe to publish; warnings do not fail
```

It checks the shape the widget and the build rely on and prints Max Cameras at
the default target. Read every warning out to the user: failed requests (informational),
response times that fall as cameras are added (a measurement to recheck), cells
without a request count.

## 5. Check it on the site

Start the preview (see `DEVELOPMENT.md`) and open:

- `/vlm-inference-benchmarks/` — the new rows, in English, `/tr/` and `/nl/`;
- each new run's permanent page (the link at the end of its explanation).

Open a new row: the table of measurements by number of cameras, the
explanation and the chart must all be there.

## 6. Add a changelog entry

Each new run gets **its own** entry at the top of `_data/changelog.yml`
(newest first). It appears on `/changelog/` and in "Latest changes" on the
home page, in every language, linked to the run's own page:

```yaml
- date: 2026-10-06          # the day the run goes live (the merge day)
  type: vlm
  vlm: <the run's id — its file name in the store, without .json>
  text:
    en: "Qwen3-VL-8B-Instruct on Jetson AGX Orin 32GB: Q4_K_M weights served with llama.cpp, measured with up to 8 cameras."
    tr: "…"
    nl: "…"
```

One sentence, from the row's own fields: model, device, quantization, engine,
and the most cameras measured. Running text names no company. Translate it
(terms: `skills/add-white-paper/TERMINOLOGY.md`). **Show the user the three
sentences and add them only once they approve.** A re-import or a correction of
an existing row gets no entry: the changelog lists additions, not fixes. Then:

```bash
python3 _tools/check_changelog.py   # exit 0 = every id resolves, all languages present
```

## 7. Report back

Tell the user, in this order: which rows were added or replaced (ids), any new
model or device you added to the importer's tables and the facts you used for
them, every validator warning, the URLs to check on the preview, and the
changelog sentences. Then stop — committing and publishing follow the
repository's normal review.
