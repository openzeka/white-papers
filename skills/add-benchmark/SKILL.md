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

- **Model already in the file** → reuse `params`, `intelligence_index`,
  `agentic_index`, `kv_bytes_per_token`, `kv_window_bytes`, `kv_heads` and
  `model_context_length` verbatim. All seven are properties of the *model*, not the run, so every row for
  one model carries the same values — the validator fails if they differ. Do not
  ask the user, and do not re-fetch or recompute.
- **Ambiguous** → ask which model. Do not pick.
- **New model** → ask for the first three (step 3) and take the other four
  from the model's `config.json` yourself (step 4).

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
   The label now also sets the weight size in the KV cache memory limit (bytes
   per parameter from `memory.weight_bytes_per_param`), so a mixed-precision
   checkpoint labelled as one format moves a capacity figure. A format not in
   that table fails validation until it is added there.
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

## 4. Work out the KV-cache size and context window (new models only)

The table's capacity columns show the smaller of two limits: the speed limit
(`floor(Max C × multiplier)`) and the KV cache memory limit — how many user
sessions fit in the KV cache left beside the model weights. The page's how-to
explains the method; this step only produces its per-model inputs. There are
four, all properties of the model. The three cache sizes are at **FP8, one byte
per stored value, for one full copy of the model (TP=1)**:

| Field | What it is |
|---|---|
| `kv_bytes_per_token` | Bytes the cache grows by per token of context, summed over every layer whose cache grows with context. Can be fractional for compressed caches. |
| `kv_window_bytes` | Fixed bytes per session for sliding-window layers, which keep only their last *w* tokens: summed `2 × heads × head_dim × w` (or `heads × (head_dim + v_head_dim) × w` when the config gives a separate `v_head_dim`). `0` when there are none. |
| `kv_heads` | KV heads of the token-growing layers — tensor parallelism divides the cache across `min(TP, kv_heads)` GPUs. **`null` means the cache is copied whole to every GPU** (MLA and other compressed caches). |
| `model_context_length` | The model's own context window, in tokens — see the end of this step. |

The page then computes, per device, `(kv_bytes_per_token × context +
kv_window_bytes) ÷ min(TP, kv_heads) ÷ PP` and divides the free memory by it.

Read the model's **`config.json` from Hugging Face** (`https://huggingface.co/<repo>/resolve/main/config.json`;
for multimodal models use the `text_config` inside it). Record the repo in your
report to the user. Then identify which case the model is — the formula
`2 × layers × KV heads × head_dim` is right only for the first:

1. **Standard attention (GQA/MQA).** Every layer stores K and V for every token.
   `kv_bytes_per_token = 2 × num_hidden_layers × num_key_value_heads × head_dim`;
   `kv_window_bytes = 0`; `kv_heads = num_key_value_heads`.
   Use `num_key_value_heads`, **never** `num_attention_heads`. Use `head_dim`;
   only when it is absent use `hidden_size / num_attention_heads`. If the config
   gives a separate `v_head_dim`, use `num_key_value_heads × (head_dim +
   v_head_dim)` per layer instead of `2 × … × head_dim`.
   *Example — Qwen3-4B:* 36 × 2 × 8 × 128 = `73728`, `0`, `8`.
2. **Hybrid: some layers keep no KV cache.** Linear-attention, Mamba or KDA
   layers hold a small fixed state instead (the page's 20% engine reserve covers
   it). Count **only** the attention layers — from `layer_types`
   (`full_attention`), `layers_block_type` (`attention`), or
   `linear_attn_config.full_attn_layers` (1-based layer numbers).
   *Example — Qwen3.6-27B:* `layer_types` has 16 `full_attention` of 64 →
   16 × 2 × 4 × 256 = `32768`, `0`, `4`.
   *Example — Nemotron-3-Ultra:* 12 `attention` blocks of 108 →
   12 × 2 × 2 × 128 = `6144`, `0`, `2`.
   If the attention layers also keep **indexer keys** (`indexer_head_dim`,
   `indexer_kv_heads`, `indexer_compress_ratio`, as in Qwen3.8-Flash-Next), add
   `indexer_head_dim × indexer_kv_heads ÷ indexer_compress_ratio` per attention
   layer to `kv_bytes_per_token`.
3. **Sliding-window layers.** Layers marked `sliding_attention` (or listed in
   `local_layer_ids`, or `1` in MiMo's `hybrid_layer_pattern`, where `0` is a
   full-attention layer) keep only `sliding_window` tokens. They go into `kv_window_bytes`, the full layers into
   `kv_bytes_per_token`. Check for separate head counts per layer type —
   `num_global_key_value_heads`/`global_head_dim` (Gemma), `swa_num_key_value_heads`/`swa_head_dim` (Inkling, MiMo) — and use each layer
   type's own numbers; `kv_heads` is the full-attention layers' count.
   *Example — GPT-OSS 120B:* 18 full × 2 × 8 × 64 = `18432`; 18 sliding ×
   2 × 8 × 64 × 128 = `2359296`; `8`.
4. **MLA — compressed latent cache** (`kv_lora_rank` present: DeepSeek-V3,
   Kimi-K2, GLM-5, Hy4). One vector per token per layer, not K and V per head:
   `kv_lora_rank + qk_rope_head_dim`, plus `index_head_dim` when the config has
   one (sparse-attention index keys) — divided by `index_kpool` when
   `index_kpool_compress` is true. `kv_heads = null` — this cache is copied to
   every GPU, not divided by TP.
   *Example — DeepSeek-V3.1:* 61 × (512 + 64) = `35136`, `0`, `null`.
   *Example — GLM-5:* 78 × (512 + 64 + 128) = `54912`, `0`, `null`.
   Hybrids of MLA and linear layers count only the MLA layers — Kimi K3 (24
   entries in `full_attn_layers`: 24 × 576 = `13824`) and GLM-5.3-Flash (11
   `deepseek_sparse_attention` layers × (512 + 0 + 128 ÷ 4) = `5984`).

**DeepSeek V4 / V4.1 and any other layout with `compress_ratios`** are
special: shared K=V, compressed and sliding caches together. Copy the values
from an existing row of the same family if one exists. Otherwise do not
improvise a formula.

**If the architecture does not clearly match one of the four cases, set all
three fields to `null` and tell the user.** The row then shows its speed
estimate alone and its Capacity summary says the KV cache memory limit is not
calculated, which is honest. A plausible-looking number computed with the wrong
case is not: it can be off by 4× (hybrid) to 60×
(MLA treated as standard attention). Also tell the user if the config has
fields you do not recognise that look cache-related (`index_*`, `compress_*`,
`sparse_*`, `kv_*`).

Before finishing, sanity-check the result: bytes per token for the models in the
file range from about 1.6 KB (DeepSeek-V4.1-Flash) to about 190 KB (GLM-4.6 and GLM-4.7). A
figure in megabytes means the wrong case.

**`model_context_length`** is the model's own context window — the longest
session it can hold — from the same config: `max_position_embeddings` (or
`model_max_length` where that is what the config uses; inside `text_config` for
multimodal models). It is the model's limit, not the length a particular run was
launched with. When a reader picks a context length longer than this, the
table shows a dash with a warning marker for that model instead of a number,
because the model cannot serve sessions that long. `null` if the config gives
none.

## 5. Build the entry

Every entry carries **all 20 keys in this order**, `null` where a value does not
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
| `kv_bytes_per_token` | number \| null | step 4, or reused from a sibling row |
| `kv_window_bytes` | number \| null | step 4, or reused |
| `kv_heads` | number \| null | step 4, or reused; null for a copied (MLA) cache |
| `model_context_length` | number \| null | step 4, or reused — the model's context window |

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
- **weights exceed the assumed memory budget** — `params × bytes per
  parameter ÷ (tp × pp)` does not fit in one device's share. The run evidently
  worked, so one of those three inputs is probably wrong (a mixed-precision
  checkpoint labelled with one format, a parameter count that includes something
  not loaded, or offloading of weights or KV cache to CPU memory or disk). Tell
  the user. The row's capacity then rests on the speed estimate alone, and its
  Capacity summary says so.
- **no KV-cache size** — the model's three KV fields are null. Say which case
  in step 4 it failed to match.
- **context window shorter than the default agentic context** — the model
  cannot hold a 128K session, so its agentic capacity shows a dash. Correct if
  the config says so; tell the user.

## 7. Report back

Tell the user: the id added, the Max C the row will show at the default targets,
its chat and agentic capacity **and which limit set each** (speed targets or KV
cache memory — open the row on the page to read its Capacity summary), and every
warning the validator raised with your reading of it. If the model was new, say
so and show how you derived its four model fields — the case, the config fields
you read, and the arithmetic — so a person can check it.

If the run introduces a **quantization format not already explained** in the
how-to glossary, say so — the glossary on `llm-inference-benchmarks.md` and
`tr/llm-inference-benchmarks.md` should gain a line, in both languages.

## Keeping this skill true

The field table in step 5 and the CSV mapping in step 1 mirror the real schema.
**If a field is added to or removed from `benchmarks.json`, or the benchmark
tool's CSV headers change, update this file in the same commit** — along with the
`cols` array and row loop in *both* widget files, `REQUIRED` in
`_tools/validate.py`, and `FIELDS` / `CSV_*` in `_tools/bench_import.py`. The
KV cache memory calculation is implemented in `memoryBudget()` / `capacity()`
in the widget, mirrored by the memory check in `_tools/validate.py`, and
explained in the how-to of both `llm-inference-benchmarks.md` files; change all
of them together, and step 4 here if its inputs change. A skill that describes a
stale schema is worse than no skill, because it will be followed.
