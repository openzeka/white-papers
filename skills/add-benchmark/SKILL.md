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
| `models.json` | The served repo id (becomes `served_repo`, which sets the weight size), `owned_by` (engine hint), `max_model_len`. |
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
  `agentic_index` verbatim. They are properties of the *model*, not the run, so
  every row for one model carries the same values — the validator fails if they
  differ. Do not ask the user. The model's KV-cache fields are generated, not
  reused by hand (step 4).
- **Ambiguous** → ask which model. Do not pick.
- **New model** → ask for those three (step 3), and fetch its `config.json`
  into the repo (step 4).

## 3. Ask the user

Ask in one round, showing the guesses from `inspect` for confirmation. Nothing in
this list is recoverable from the folder.

**Always:**

1. **Device** — must be one of exactly these strings, note the `×`:
   `Thor`, `1× DGX Spark`, `2× DGX Spark`, `3× DGX Spark`, `4× DGX Spark`,
   `8× DGX Spark`, `RTX PRO 6000`, `DGX B300`.
   Anything else fails validation and sorts last in the filter row. A genuinely
   new device is more than a new string: it also needs its memory per GPU or
   node in the `memory.memory_gb` block of `benchmarks.json` (and a place in
   `memory.unified_memory` if the CPU and GPU share one pool), or its rows get
   no KV cache memory limit. Tell the user rather than adding it silently.
2. **Quantization** — confirm the guess from the repo name. Uppercase.
   Already in use: `BF16` `FP16` `FP8` `MXFP8` `NVFP4` `MXFP4` `FP4` `INT4` `AWQ`.
   If the run did not record a precision, say so — do **not** label it `BF16` by
   default; that is an existing data problem the validator already warns about.
   The weight size comes from the served checkpoint (step 4); the label's bytes
   per parameter (`memory.weight_bytes_per_param`) are only the fallback when no
   checkpoint is recorded. A format not in that table fails validation until it
   is added. The KV cache is assumed FP8 for every row, whatever the weights are
   (`memory.kv_cache_bytes_per_value`), so the label does not change it.
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
5. **TP / DP / PP** — the parallelism actually used. `dp` and `pp` are `null`
   when not used, but **`tp` is always a number — `1` on a single GPU or node**.
   The memory limit reads `tp × dp × pp` as the number of devices the run
   occupied, so on a DGX B300 (eight GPUs) the difference between TP=2 and TP=8
   is four times the memory; the validator rejects a null `tp`. Never assume a
   B300 run used all eight GPUs. For an *N*× DGX Spark device the validator
   expects `tp × dp × pp == N`.
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
   count: the column tracks weight memory, not per-token compute. It is now
   load-bearing — the memory limit multiplies it by the quantization's bytes
   per parameter to get the weight size — so a wrong figure moves a number.
9. **Intelligence Index and Agentic Index** — from
   [Artificial Analysis](https://artificialanalysis.ai). Tell the user:
   - where AA lists several reasoning-effort variants of one model
     (`(max)`, `(xhigh)`, `(high)`, `(Reasoning, Max Effort)`, `(Reasoning)`),
     **use the highest-scoring one** — that is the rule the rest of the file
     follows;
   - `null` is the correct answer when AA publishes no score. It is not zero, and
     the table renders it as an em dash. Many rows have no Agentic Index.
   - Never invent or interpolate these. If the user is unsure, the supported
     automated path is `AA_API_KEY=... python3 _tools/aa_index_fetch.py --write`,
     which resolves every model and leaves anything ambiguous untouched.
   - Attribution is a licensing condition. It already sits under the widget and
     inside `benchmarks.json`; do not remove it.

## 4. Store the Hugging Face data, then generate the fields

The capacity columns show the smaller of two limits: the speed limit
(`floor(Max C × multiplier)`) and the KV cache memory limit — how many user
sessions fit in the KV cache left beside the model weights. The page's how-to
explains the method. This step produces its inputs, and **none of them is typed
by hand**. The model's and the checkpoint's Hugging Face data is pulled into
`_tools/model_meta/` (its `README.md` describes every file), and
`_tools/kv_geometry.py` derives the fields from it. `bench_import.py add`
refuses a row whose data is not stored yet, and the validator recomputes every
field and checks every stored file's sha256.

| Stored in `_tools/model_meta/` | What it is |
|---|---|
| `models/<model>/config.json` | the model's `config.json`, byte-identical to Hugging Face at a pinned commit |
| `models/<model>/model.json` | repo, revision, sha256 of the config, and the HF model info (dates, licence, base model, parameter counts) |
| `checkpoints/<org>--<name>.json` | a served checkpoint: pinned revision, every weight file and its size, declared quantization |
| `runs/<row-id>/models.json` | the result folder's own record of what the run served |

**a. The served checkpoint.** `served_repo` is the repo the run loaded — the
`served_repo` line `inspect` prints from `models.json`. Confirm it with the
user; if the folder has no `models.json`, ask. If `inspect` says the checkpoint
is not recorded, pull it:

```bash
python3 _tools/kv_geometry.py fetch-checkpoint <served-repo>
```

If the run used a local quantization that is not on Hugging Face, set
`served_repo` to `null`: the weights are then estimated as parameters × bytes
per parameter, and the row says so.

**b. New model only — pull its config and model info.** Use the publisher's
repo (the unquantized release; `inspect` prints the served repo's declared
`base_model` when it has one):

```bash
python3 _tools/kv_geometry.py fetch-model "<Model display name>" <publisher/repo>
```

The display name must be exactly the `model` string the entry will carry. The
command prints the six fields it derives. Gated repos need `HF_TOKEN` in the
environment. Record the repo and commit in your report to the user.

**c.** `bench_import.py add --folder <result-folder>` (step 5) then keeps the
run's `models.json` and writes every generated field into `benchmarks.json`.
To regenerate the fields at any other time: `python3 _tools/kv_geometry.py apply`.

What the six model fields mean, all at one byte per stored value except the
state (`kv_geometry.py` documents each rule in code):

| Field | What it is |
|---|---|
| `kv_bytes_per_token` | cache growth per token over the layers whose cache grows with context — `2 × KV heads × head size` per full-attention layer, or the compressed latent (+ index keys on the layers that own an indexer) for MLA; divided over `min(TP, kv_heads)` GPUs |
| `kv_window_bytes` | sliding-window layers: fixed per session, `window × per-token size` of those layers |
| `kv_heads` | KV heads of the full-attention layers; `null` = the cache is copied whole to every GPU (MLA, DeepSeek V4) |
| `kv_replicated_bytes_per_token` | single-head index keys (Qwen QSA indexer, MiniMax sparse attention), copied to every GPU |
| `kv_state_bytes` | the fixed recurrent + convolution state of linear-attention, Mamba and KDA layers per session, as vLLM keeps it (convolution BF16, recurrent state in the model's declared dtype, two pages per request); divided over TP |
| `model_context_length` | the model's own context window, `max_position_embeddings` (or `model_max_length`) — not the run's launch length |

**If the tool says the layout is unsupported**, it sets the KV fields to `null`
and the row shows its speed limit alone, with an explanation in its Capacity
summary. That is the correct outcome for a cache the tool does not understand —
**never enter numbers by hand to get a memory figure**. Tell the user which
config fields it could not place. Supporting a genuinely new kind of cache means
adding one rule to `geometry()` in `kv_geometry.py` that keys on the config
fields, never on a model name, so it covers the next model of that kind too.

**Sanity-check the printout** against the model card before finishing: per-token
sizes in the file range from about 1.6 KB (DeepSeek-V4.1-Flash) to about 190 KB
(GLM-4.6 and GLM-4.7). A figure in megabytes means a layer type was misread.

The KV cache is assumed stored at FP8 for every row, whatever the weights are:
the cache precision is an engine setting, so every configuration can run with
one. Two limits are deliberate and are explained on the page rather than
modelled: rows whose served checkpoint does not fit the standard memory
allocation (the run offloaded, or gave the engine more memory) show the speed
limit only; and engine-specific storage details — block rounding, scale bytes,
separate cache pools, experts spread over data-parallel ranks — are not
followed.

## 5. Build the entry

Every entry carries **all 24 keys in this order**, `null` where a value does not
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
| `tp` | number | user; `1` on a single GPU or node, never null |
| `notes` | string | user; `""` when there is nothing to say |
| `sources` | array | `[]`, or the URL of the white paper this run came from |
| `data_points` | array | the CSV — `{c, ttft_ms, tps}`, ascending by `c` |
| `dp` | number \| null | user |
| `pp` | number \| null | user |
| `kv_bytes_per_token` | number \| null | generated — leave `null`, `kv_geometry.py apply` fills it |
| `kv_window_bytes` | number \| null | generated |
| `kv_heads` | number \| null | generated |
| `model_context_length` | number \| null | generated |
| `kv_replicated_bytes_per_token` | number \| null | generated |
| `kv_state_bytes` | number \| null | generated |
| `served_repo` | string \| null | step 4a — the checkpoint the run loaded, from `models.json` |
| `weights_gb` | number \| null | generated from `served_repo` |

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
python3 _tools/bench_import.py add /tmp/entry.json --folder <result-folder>
```

That rejects unknown or missing fields and duplicate ids, enforces the key order,
sorts `data_points`, inserts the row next to its siblings, and preserves the
file's exact formatting so the diff is only the new entry. It refuses the entry
if the model's or the checkpoint's Hugging Face data is not stored (step 4), or
if `served_repo` disagrees with the folder's `models.json`; it then keeps that
`models.json` under `_tools/model_meta/runs/` and fills in every generated field.

## 6. Validate

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
- **weights exceed the assumed memory budget** — the served checkpoint ÷
  (tp × pp) does not fit in one device's standard share. The run evidently
  worked, so it gave the engine more memory than the standard allocation, or
  kept part of the model or its KV cache in CPU memory or on disk. Check that
  `served_repo`, `tp` and `pp` are right, then tell the user. The row's capacity
  rests on the speed estimate alone, and its Capacity summary says so.
- **differ from what kv_geometry.py derives** / **no _tools/model_meta/models
  entry** / **no checkpoints record** / **does not match its recorded sha256** —
  errors: a generated field or a stored file was edited by hand, or step 4 was
  skipped. Run step 4 again, never patch the number.
- **served_repo … but the run's models.json says …** — error: the entry names a
  different checkpoint from the one the run reported. Ask the user.
- **engine … but the run's models.json says it was served by …** — the engine
  label disagrees with the tool's own record. Ask the user which is right.
- **no served_repo** — the weights are estimated from the parameter count. Fine
  for a local quantization; otherwise record the repo.
- **unsupported cache layout** / **no KV-cache size** — the model's KV fields
  are null and its rows show the speed limit alone. Tell the user which config
  fields the tool could not place.
- **context window shorter than the default agentic context** — the model
  cannot hold a 128K session, so its agentic capacity shows a dash. Correct if
  the config says so; tell the user.

## 7. Report back

Say plainly that the change is **local only**: the table on the live sites
changes only once it is committed, reviewed and merged, and publishing new
figures needs the author's approval. Never describe the row as "published". Then
tell the user: the id added, the Max C the row will show at the default targets,
its chat and agentic capacity **and which limit set each** (speed targets or KV
cache memory — open the row on the page to read its Capacity summary), and every
warning the validator raised with your reading of it.

If the model was new, say so and paste the generated fields `add` printed (or
`python3 _tools/kv_geometry.py show "<model>"`), with the config repo and
commit, so a person can check it. Before finishing,
`python3 _tools/kv_geometry.py verify --online` confirms the stored files still
match Hugging Face.

If the run introduces a **quantization format not already explained** in the
how-to glossary, say so — the glossary on `llm-inference-benchmarks.md` and
`tr/llm-inference-benchmarks.md` should gain a line, in both languages.

## Keeping this skill true

The field table in step 5 and the CSV mapping in step 1 mirror the real schema.
**If a field is added to or removed from `benchmarks.json`, or the benchmark
tool's CSV headers change, update this file in the same commit** — along with the
`cols` array and row loop in *both* widget files, `REQUIRED` in
`_tools/validate.py`, and `FIELDS` / `CSV_*` in `_tools/bench_import.py`. The
KV cache memory calculation is implemented in `memoryBudget()` / `sessionBytes()`
/ `capacity()` in the widget, mirrored by the memory check in
`_tools/validate.py`, fed by `geometry()` in `_tools/kv_geometry.py`, and
explained in the how-to of both `llm-inference-benchmarks.md` files; change all
of them together, and step 4 here if its inputs change. A skill that describes a
stale schema is worse than no skill, because it will be followed.
