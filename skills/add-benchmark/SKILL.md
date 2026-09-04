---
name: add-benchmark
description: Add one or more benchmark-tool result folders to the LLM Inference Benchmark Explorer (assets/data/benchmarks.json). Use whenever the user points at a benchmark result folder and asks to add it to the whitepapers, add these results to the table, publish a benchmark run, or import a benchmark. Handles the CSV, asks for the facts the folder does not contain, writes the entry and validates it.
---

# Add a benchmark run to the Explorer

`assets/data/benchmarks.json` is the single source of truth for the
[LLM Inference Benchmark Explorer](https://whitepapers.openzeka.com/llm-inference-benchmarks/).
It feeds **two live sites** from one commit — this repo's page, and openzeka.com,
which fetches the same URL cross-origin. A wrong number here is a wrong number on
two public pages with nothing in between to catch it. Work slowly, ask rather
than guess, and never invent a value.

**Adding a run is a data-only change.** The table is generated from this file, so
no page, no JS and no CSS needs touching. Editing those is only for adding a
*column*, which is a different job — see the `cols` array and the row loop in
`assets/js/benchmark-table.js`.

## 1. Read the folder

The benchmark tool ([CordatusAI/llm-benchmark](https://github.com/CordatusAI/llm-benchmark))
writes a folder per run:

| File | Use |
|---|---|
| `<Name>-table.csv` | **The authoritative numbers.** One row per concurrency level. |
| `models.json` | Optional context: the served repo id, `owned_by` (engine hint), `max_model_len`. |
| `*.png`, `*.html` | Charts. **Not used** — the widget draws its own from `data_points`. |

Only three CSV columns reach the table:

| CSV column | JSON field |
|---|---|
| `Concurrency` | `data_points[].c` |
| `TTFT (Mean, ms)` | `data_points[].ttft_ms` |
| `TPS (Mean, tokens/s)` | `data_points[].tps` |

Everything else the CSV carries — p50/p90 for TTFT, ITL, TPS and Latency, plus
`Throughput (RPS)` — has **no field in the table**. Read it, ignore it, do not
add fields for it.

Start here, from the repo root:

```bash
python3 _tools/bench_import.py inspect <folder>
```

It prints the parsed `data_points`, the engine hint, what Max C would be at the
file's default targets, whether the model already exists, and exactly what is
still missing. It never guesses a number.

## 2. Resolve the model

`inspect` matches the served repo against existing model names **exactly**, after
stripping quantization and variant suffixes (`Inferact/GLM-5.3-NVFP4` → `GLM-5.3`).
Substring matching is deliberately not used: `GLM-5.3-NVFP4` also contains
`GLM-5`, and reusing that row's scores would publish the wrong capability numbers.

- **Model already in the file** → reuse `params`, `intelligence_index` and
  `agentic_index` verbatim. Both indexes are properties of the *model*, not the
  run, so every row for one model carries the same pair. Do not ask the user, and
  do not re-fetch.
- **Ambiguous** → ask which model. Do not pick.
- **New model** → ask for all three (step 3).

## 3. Ask the user

Ask in one round, showing the guesses from `inspect` for confirmation. Nothing in
this list is recoverable from the folder.

**Always:**

1. **Device** — must be one of exactly these strings, note the `×`:
   `Thor`, `1× DGX Spark`, `2× DGX Spark`, `3× DGX Spark`, `4× DGX Spark`,
   `8× DGX Spark`, `RTX PRO 6000`, `DGX B300`.
   Anything else fails validation and sorts last in the filter row.
2. **Quantization** — confirm the guess from the repo name. Uppercase.
   Already in use: `BF16` `FP16` `FP8` `MXFP8` `NVFP4` `MXFP4` `FP4` `INT4` `AWQ`.
   If the run did not record a precision, say so — do **not** label it `BF16` by
   default; that is an existing data problem the validator already warns about.
3. **Inference engine** — confirm the `owned_by` hint. `vLLM` or `SGLang`,
   spelled exactly like that.
4. **Speculative decoding** — did the run guess tokens ahead and verify them?
   Ask it in those words: that is what the column is called. If yes, ask which
   mechanism and how far ahead — multi-token prediction (MTP) to a depth *k*, a
   draft model, or a vendor implementation such as DSpark — then set
   `mtp: true`, put the depth in `mtp_k`, and name the mechanism in the notes,
   because the column itself only shows Yes. If no, `mtp: false` and
   `mtp_k: null`.

   **The two fields are still named `mtp` and `mtp_k`.** That is deliberate, not
   a leftover: the column was renamed from MTP to Speculative Decoding because
   MTP is only one mechanism, but `benchmarks.json` is fetched cross-origin by
   another site, so the field names did not change with it. Do not "fix" them.
5. **TP / DP / PP** — the parallelism actually used. `null` for any not used.
   For an *N*× DGX Spark device the validator expects `tp × dp × pp == N`.
6. **Notes** — optional, one line. Tell the user what usefully goes here:
   - the served repo, when it is not obvious — `Model: zai-org/GLM-5.3`
   - context length — `1M context`, `4K context`
   - engine build — `vLLM v0.22.0`, `eugr nightly`
   - kernels and backends — `CUTLASS MoE, FlashInfer attn`
   - memory settings — `GMU 0.7`, `KV fp8`
   - the speculative-decoding mechanism, its depth, and what it bought —
     `Speculative MTP k=3. +24% TPS at C1`, or `DSpark k=8`
   - a comparison against a sibling run — `NVFP4 is 2.2x faster than FP16 at C1`

   If the notes mention `PP=` or `DP=`, the matching field must be set or the
   validator warns that the column will render blank.
7. **Any other unverified results?** Runs that were measured but are not going in
   as their own row — a variant with no full sweep, a partial re-run, a
   configuration tested once. These belong in `notes` on the row they relate to,
   phrased so a reader knows they are not in the table:
   `nvidia eugr variant exists with +28% TPS but full sweep unavailable`.
   Do not create a row for a run without its own `data_points`.

**Only when the model is new to the file:**

8. **Parameter count** — as released, e.g. `753B`, `27B`, `2.8T`. For
   mixture-of-experts models this is the **total**, not the active-per-token
   count: the column tracks weight memory, not per-token compute.
9. **Intelligence Index and Agentic Index** — from
   [Artificial Analysis](https://artificialanalysis.ai). Tell the user:
   - where AA lists several reasoning-effort variants of one model
     (`(max)`, `(xhigh)`, `(high)`, `(Reasoning, Max Effort)`, `(Reasoning)`),
     **use the highest-scoring one** — that is the rule the rest of the file
     follows;
   - `null` is the correct answer when AA publishes no score. It is not zero, and
     the table renders it as an em dash. 13 of 92 rows have no Agentic Index.
   - Never invent or interpolate these. If the user is unsure, the supported
     automated path is `AA_API_KEY=... python3 _tools/aa_index_fetch.py --write`,
     which resolves every model and leaves anything ambiguous untouched.
   - Attribution is a licensing condition. It already sits under the widget and
     inside `benchmarks.json`; do not remove it.

## 4. Build the entry

Every entry carries **all 16 keys in this order**, `null` where a value does not
apply:

| Field | Type | Source |
|---|---|---|
| `id` | string | you construct it — see below |
| `model` | string | display name; match an existing one exactly if the model is known |
| `params` | string | user, or reused from a sibling row |
| `intelligence_index` | number \| null | Artificial Analysis, or reused |
| `agentic_index` | number \| null | Artificial Analysis, or reused |
| `device` | string | user; one of the eight exact strings |
| `quantization` | string | user; uppercase |
| `engine` | string | user; `vLLM` or `SGLang` |
| `mtp` | boolean | user; the column headed **Speculative Decoding** |
| `mtp_k` | number \| null | user; the depth guessed ahead, null when `mtp` is false |
| `tp` | number \| null | user |
| `notes` | string | user; `""` when there is nothing to say |
| `sources` | array | `[]`, or the URL of the white paper this run came from |
| `data_points` | array | the CSV — `{c, ttft_ms, tps}`, ascending by `c` |
| `dp` | number \| null | user |
| `pp` | number \| null | user |

**`id` convention** — lowercase, underscore-separated, and unique because deep
links (`#id`) target it:

```
<model-slug>_<device-slug>_<quant>_<engine>[_<extras>]
glm-5.3_b300_nvfp4_vllm
deepseek-v4-flash_4spark_nvfp4_vllm_tp2dp2_c1
```

Device slugs: `thor`, `1spark`…`8spark`, `rtxpro6000`, `b300`. Add an extra
segment (`_tp4`, `_mtp`, `_c1`) only when it is needed to distinguish the row
from an existing one.

Write the finished entry to a temporary JSON file, then:

```bash
python3 _tools/bench_import.py add /tmp/entry.json
```

That rejects unknown or missing fields and duplicate ids, enforces the key order,
sorts `data_points`, inserts the row next to its siblings, and preserves the
file's exact formatting so the diff is only the new entry.

## 5. Validate

```bash
python3 _tools/validate.py       # exit 0 = safe to publish
```

Errors must be fixed. Warnings need judgement. These are known properties of the
existing data, not new faults you introduced — read each one, decide, and tell
the user what you decided:

- **single data point (C=1)** — real, and worth telling the user: Max C and both
  capacity figures then rest on one measurement.
- **Max C above a failing level** — the run passes at a high C but fails a lower
  one. Almost always a TTFT outlier in the source data. Show the user and ask
  before publishing; the fix belongs in the data, not the code.
- **TTFT falls as concurrency rises** — the sweep was probably not measured under
  equivalent conditions. Flag it.
- **BF16 without a recorded precision** — see question 2.
- **rows that render identically** — an error, not a warning: two rows with the
  same model/device/quant/engine/mtp/tp/dp/pp are indistinguishable to a reader.
  Set the parallelism fields or add notes.

## 6. Report back

Tell the user: the id added, the Max C the row will show at the default targets
and therefore its chat/agentic capacity, and every warning the validator raised
with your reading of it. Mention if the model was new to the file.

If the run introduces a **quantization format not already explained** in the
how-to glossary, say so — the glossary on `llm-inference-benchmarks.md` and
`tr/llm-inference-benchmarks.md` should gain a line, in both languages.

## Keeping this skill true

The field table in step 4 and the CSV mapping in step 1 mirror the real schema.
**If a field is added to or removed from `benchmarks.json`, or the benchmark
tool's CSV headers change, update this file in the same commit** — along with the
`cols` array and row loop in *both* widget files, `REQUIRED` in
`_tools/validate.py`, and `FIELDS` / `CSV_*` in `_tools/bench_import.py`. A skill
that describes a stale schema is worse than no skill, because it will be
followed.
