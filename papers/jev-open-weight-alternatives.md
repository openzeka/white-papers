---
title: The First Open-Weight Alternatives to Jev
parent: White Papers
nav_order: 10
lang: en
page_id: jev-open-weight-alternatives
date: 2026-10-06
card_tag: "Technical Guide"
description: >-
  Six open-weight typed-decision models compared on one NVIDIA DGX Spark
  (GB10) through a shared state + questions interface and one 25-question
  set: accuracy, calibration, option-order sensitivity and latency — and
  which model fits which job.
permalink: /papers/jev-open-weight-alternatives/
last_modified_date: 2026-10-06
toc: true
---

{% include company/block.html name="prepared_by" %}

> **Publication date:** October 2026 (the draft it comes from is dated 5 October 2026)
> **Scope:** What a typed-decision model does, which open-weight models follow the approach today, how six of them compare on one NVIDIA DGX Spark through one shared interface and one 25-question set, and how to choose between them.
> **Note:** Model names, licences and measured values are valid as of October 2026. The set is deliberately small: it is a smoke test that shows the shape of the field, not a scientific benchmark.

---

{:.no_toc}
## Table of contents

* TOC
{:toc}

---

## Executive Summary

- **What it is.** TypeSafe **Jev** is a closed SaaS that produces *typed decisions* instead of chat: it takes a `state` (text, image, log line ...) and a set of questions, and answers all of them in a single pass with **calibrated probabilities** — no chain-of-thought, no free text to parse. During 2026 a **first generation of open-weight models** started to appear that follows the same approach.
- **How they were compared.** Six of them run head-to-head on a single **NVIDIA DGX Spark (GB10)** through one shared `state + questions` interface and one shared 25-question set: 10 `noul`, 10 `choice`, 5 `score`.
- **Accuracy:** `openjev` (27B) solves the set 20/20 with by far the best calibration (ECE 0.008) — at the cost of 27B of weights, ~190 ms and a **CC BY-NC 4.0** licence (non-commercial).
- **Practical default:** `NeoHorse-Jev-4B` matches that accuracy **4x faster** (44 ms) under **Apache 2.0**, and ships its own Python runtime.
- **Multimodal:** `Jev-Omni` is the only open-weight option (image + audio + video).
- **General pattern:** `noul` / `choice` are solid, `score` is the weakest primitive in every model, and on genuinely ambiguous sentences the independent models converge on the **same bias**.

---

## 1. What Is a Typed Decision / System 1?

A typed-decision model does not chat. It does exactly this:

```
[state]      customer message · log line · screenshot · JSON row …
[questions]  {"department": {"type": "choice", "criteria": {billing: …, technical: …}}}
[answers]    {"department": {"label": "billing",
                             "probabilities": {"billing": 0.94, "technical": 0.04, …}}}
```

There are three question types, all answered in **one forward pass** — no
chain-of-thought, no free text to parse, hence ~10–200 ms per decision and
probabilities that are naturally **calibrated**:

| Primitive | Question | Output |
|---|---|---|
| `noul` | "Is the customer asking for a refund?" | `true` / `false` + probabilities |
| `choice` | "Which department should handle this request?" | label + probability per option |
| `score` | "How urgent is this request?" | ordinal level index (e.g. 0–3) |

What makes the comparison fair is that every model is driven through **the same
input/output shape**: each one hides behind a single adapter (`scripts/jevclient.py`),
so the call is always `predict(state, questions)`.

> **Reference:** TypeSafe **Jev** (`jev-1.13.0`) is a closed SaaS: `POST /v1/systemone`
> endpoint, **$0.042** per million input tokens (output free), 64k context, **text-only**
> input. It is trained with RLCD for calibrated decisions and serves the same weights to
> every account — no per-customer fine-tuning. This paper does not try to replace it; it
> measures where the first open-weight alternatives currently stand. Every open model
> here imitates Jev's wire format (`state + questions`); docs:
> [docs.typesafe.ai](https://docs.typesafe.ai/models).

---

## 2. The First-Generation Candidates

Five of the six are Apache 2.0 — `openjev` is CC BY-NC 4.0, and `bekko-17m` has no
licence assigned on its model card. All support the same three primitives, but
they run very differently:

| # | Model | Size | Base architecture | Multimodal | How it runs | Licence |
|---|---|---|---|---|---|---|
| 1 | `hotchpotch/bekko-system-one-v0-17m` | **17M** | ModernBERT / Ettin reranker | – | transformers (in-process) | unassigned |
| 2 | `convaiinnovations/laya` | **421M** | ModernBERT-large, non-AR | – | pip + `laya-serve` | Apache 2.0 |
| 3 | `TokenRhythm/NeoHorse-Jev-4B` | **4B** | Qwen3.5-4B + decision head | 1 image | native wheel (`DecisionEngine`) | Apache 2.0 |
| 4 | `autotrust/JEV-9B` | **9B** (+40M LoRA) | Qwen3.5-9B frozen backbone | – | vLLM + LoRA `jev-decision` | Apache 2.0 |
| 5 | `openjev/openjev` | **27B** | Qwen3.5-based, fp8 | image/DOM | vLLM + `helper/shim.py` | **CC BY-NC 4.0** |
| 6 | `akhilaaa3/Jev-Omni` | **12B** | Gemma 4 12B IT | **image + audio + video** | transformers | Apache 2.0 |

In short:

- **bekko-17m** — sub-millisecond, targets CPU / browser / edge. The smallest member by far.
- **laya** — 100+ languages, very cheap; `Router()` detects the language/cue and picks
  the right checkpoint in sub-millisecond time. `laya-serve` speaks Jev's
  `/v1/systemone` contract.
- **NeoHorse-Jev-4B** — ships its own Python runtime (no vLLM needed), accepts text plus
  one image. The easiest "real model" to install.
- **JEV-9B** — System 1 decision block and System 2 text generation on **one weight set**;
  interesting for agent setups.
- **openjev** — the most complete decision engine (up to 52 options in one pass, DOM /
  screenshots), but it is served as vLLM plus a separate *calibration shim*.
- **Jev-Omni** — the only true multimodal option; loaded via `trust_remote_code`.

### 2.1. The ecosystem: these six are part of the wave

The first generation is not limited to these six models. Independent leaderboards show
a much more crowded table:

- **[JevBench](https://github.com/fstandhartinger/jevbench)** — a 95-system board
  (Imajev-4B, Plumb-4B, decider-4b, kev, djev, SemIf, reflex …). Jev itself ranks 4th
  there (63.29); it scores 534 frozen decisions along accuracy, calibration, speed and
  cost axes.
- **[S1MB](https://github.com/hotchpotch/S1MB)** — a 137-benchmark mosaic; its three
  primitives carry **exactly the same names**: *Choice / Noul / Score*. The TypeSafe Jev
  and Bekko adapters are already in its adapter list — `bekko-17m` here is that
  ecosystem's small representative.
- **[Jev Decision Index](https://huggingface.co/spaces/multimodalart/jev-decision-index)** —
  a community-maintained ranking.

Two interesting observations: (1) Jev itself accepts **text only** today — image / audio
/ video decisions (`Jev-Omni`, NeoHorse here) are an extension *beyond* the reference;
(2) these boards report option-order sensitivity as a systemic issue (see Section 4).

---

## 3. Platform and Protocol

### 3.1. Platform

NVIDIA **DGX Spark (GB10)**: aarch64, 48 SM, compute capability 12.1, **130 GB unified
LPDDR5x**, Ubuntu 24.04, driver 580.173.02 / CUDA 13.0, ~3.7 TB NVMe. It is a desktop
box, so the stack is NVIDIA's standard Linux image, not JetPack/L4T.

**Setup trap (short version):** the aarch64 `torch<2.13` wheels on PyPI are
**CPU-only**. For GPU torch on GB10 you must install `torch==2.10.0+cu130` via
`uv pip install --torch-backend cu130`; model cards asking for `torch>=2.10,<2.11` hit
this immediately. Each model also gets its own pinned **venv**.

### 3.2. Test set

`scripts/bench-set.json` — 25 questions with hand-written expected labels:

- **10 `noul`** (true/false) — refunds, phishing, performance incidents, etc.
- **10 `choice`** (4 options, with description criteria) — c1..c4 share the "which
  department" template; c5..c10 cover different tasks.
- **5 `score`** — **4 ordinal levels** (`can wait / this week / today / right now`,
  0..3). Design note: a 6-level rubric was tried first; `laya`'s `score` primitive could
  not separate it, while the 4-level rubric separates cleanly in every model.

`c4` is deliberately hard: *"I am applying for the backend engineering role. Where should
I send my CV?"* → expected `other`.

### 3.3. Metrics

`scripts/bench.py <model> --shuffle 2` pushes each model through the same set and writes
one JSON file.

| Metric | Definition |
|---|---|
| **accuracy** (noul / choice) | exact match against the human label |
| **score MAE** | absolute error between expected and predicted level index (0–3) |
| **ECE (10 bins)** | Expected Calibration Error — "0.9 confident" should be right 9/10 (lower is better) |
| **flip** | rate at which the answer changes when option order is shuffled |
| **p50 / p95** | end-to-end latency (client side; HTTP included, model load excluded) |

`--shuffle 2` issues 2 extra queries per question (50 extra total) to measure
sensitivity to option order. **Measurement note:** an earlier version of the `flip`
metric compared score labels in mismatched formats (`"2"` vs `"2.000"`), which inflated
the rate; labels are now normalised and the measurement was repeated.

---

## 4. Results

| Model | noul (10) | choice (10) | score MAE | ECE | flip | p50 | p95 |
|---|---|---|---|---|---|---|---|
| **openjev** (27B) | **1.00** | **1.00** | **0.4** | **0.008** | 0.20 | 189.7 ms | 214.4 ms |
| **NeoHorse-Jev-4B** (4B) | **1.00** | **1.00** | 0.8 | 0.035 | 0.20 | **44.3 ms** | 57.6 ms |
| **Jev-Omni** (12B) | **1.00** | 0.90 | **0.4** | 0.045 | 0.22 | 143.7 ms | 162.6 ms |
| **JEV-9B** (9B + LoRA) | **1.00** | 0.90 | 0.6 | 0.022 | 0.20 | 99.6 ms | 109.7 ms |
| **laya** (421M) | 0.90 | 0.90 | 1.2 | 0.089 | 0.20 | **16.5 ms** | 18.0 ms |
| **bekko-17m** (17M) | 0.40 | **1.00** | 1.2 | 0.247 | 0.20 | **7.7 ms** | 10.1 ms |

*Numbers are for these 25 questions — a smoke set, not a scientific benchmark (see Section 6).*

**Reading:**

- **openjev** completes the set (20/20 text) with the best calibration by a wide margin
  (ECE 0.008). p50 190 ms; the model card reports **~80 ms for short text decisions**
  and ~210 ms for a web step (~1,460 tokens, 23 options) on H100 fp8. The figure reported
  here is end-to-end (client + shim + HTTP on GB10) and sits in that band — the
  workloads are not identical, but GB10 performs in the same league as H100. Cost: 27B
  of weights, CC-BY-NC.
- **NeoHorse-Jev-4B** matches that accuracy **~4x faster** (44 ms) under Apache 2.0 with
  a ready-made runtime → the "install it and actually use it" candidate.
- **Jev-Omni** is 19/20 in single modality and the only address for multimodal needs.
  Its 0.4 score MAE is the best value (valid only for the 4-level rubric).
- **JEV-9B** is 19/20 with the second-best calibration (ECE 0.022); System 1 + System 2
  on one weight set is valuable for agent work.
- **laya** is 18/20 and the fastest served model (16 ms); its `score` weakness is
  documented on the model card. Still the right address for multilingual work.
- **bekko-17m** scores **10/10 on `choice`** — remarkable for 17M — but 4/10 on `noul`
  (capacity limits). 7.7 ms makes it an edge starter.

**Cross-cutting patterns:**

- **`c4` failed three models in exactly the same way** (all said `technical`, expected
  `other`). Independent models share the same bias on ambiguous sentences — production
  pipelines need a second check / human-in-the-loop near that boundary.
- **Option-order sensitivity is a systemic problem.** The `openjev` model card reports a
  2.3% flip rate after tuning on 2,000 examples; JevBench reports a small open model
  dropping from 72% to 21% on the same task when the option order is reversed. The set
  used here has only 2–4 options per question, so higher rates are expected; in
  production, use confidence thresholds and route low-confidence answers to a second
  check.
- **`score` is the weakest primitive everywhere** (MAE 0.4–1.2). Build production logic
  on `noul` / `choice`; use `score` only through thresholds.
- **Small models rely on option descriptions.** Bekko's 10/10 on `choice` comes from
  carefully written `criteria` descriptions — do not leave them empty.

---

## 5. Which Model, When?

```
Need image / audio / video in the decision?
├── Text + 1 image, 44 ms   →  NeoHorse-Jev-4B      (Apache 2.0)
└── Audio + video           →  Jev-Omni             (12B, the only open multimodal)
└── No ↓

Runs on device / browser / CPU?
├── Yes →  bekko-17m        (17M; prefer `choice` over `noul`)
└── No ↓

10–100+ languages?
├── Yes →  laya             (Router, 16 ms; fine-tune on your data)
└── No ↓

Long documents / DOM / 50+ options, and best calibration?
├── Yes →  openjev          (27B, 190 ms, **CC-BY-NC**)
└── No ↓

Code generation + decision on one weight set?
├── Yes →  JEV-9B           (System 1 + 2, 100 ms)
└── Default →  NeoHorse-Jev-4B (44 ms, Apache 2.0)
```

**Licence warning:** `openjev` is closed to commercial use (CC BY-NC 4.0 — a commercial
licence is sold separately); `bekko-17m` has no licence assigned on the model card, so
check component licences before production. The remaining four are Apache 2.0.

---

## 6. Limitations

1. **25 questions = smoke set.** Statistical power is low; `score` was probed with only
   5 examples. For serious claims grow the set (see Section 7) and cross-check against
   independent benchmarks: [Jev Decision Index](https://huggingface.co/spaces/multimodalart/jev-decision-index),
   [S1MB](https://github.com/hotchpotch/S1MB),
   [JevBench](https://github.com/fstandhartinger/jevbench),
   [decision-models-under-pressure](https://github.com/gazelle93/decision-models-under-pressure).
2. **One device, one session.** GB10 is a single measurement point; latency is measured
   client side (HTTP included, model load excluded).
3. **One language (English input).** `laya`'s multilingual claim is not exercised by this set.
4. **Multimodal is unverified.** `Jev-Omni` entered the bench in single modality; the
   image / audio / video path was deliberately left out of scope.
5. **flip is sensitive to the number of options.** With 2–4 options shuffling has a large
   effect; the 2–7% ranges on model cards come from 20+ option tests. Additionally, the
   measurement was repeated after fixing the label-format bug described in Section 3.3.

---

## 7. Reproducibility

The run keeps everything under one root directory — one folder for the downloaded
weights, one pinned virtualenv per model — and is driven by a small set of shell and
Python files that wrap the six models behind one adapter. The table below is what that
set looks like, so the run can be rebuilt:

```bash
# setup + download (once)
bash scripts/00-setup.sh
bash scripts/01-download.sh all

# bench all six models in one command (starts and stops servers itself)
nohup bash scripts/rerun-bench.sh > out/rerun-bench.log 2>&1 &
python3 scripts/summary.py        # summary table
```

| Script | Purpose |
|---|---|
| `00-setup.sh` | 5 pinned `uv` venvs (`--torch-backend cu130`, serial install) |
| `01-download.sh` | downloads all six models into `models/` |
| `02..07` | per-model serve/smoke scripts (laya :8102, jev9b :8104, openjev :8105+:8106) |
| `jevclient.py` | shared `predict(state, questions)` adapter layer (6 models) |
| `bench-set.json` | the shared 25 questions + expected labels |
| `bench.py` | bench for one model (accuracy, MAE, ECE, flip, p50/p95) |
| `rerun-bench.sh` | runs all six models in sequence |
| `summary.py` | `out/bench-*.json` → one-line summary |

**To grow the set:** add `items` to `bench-set.json` with the same schema (`id`, `kind`,
`state`, `question`, `criteria`, `expect`); `bench.py` needs no changes. Keeping the
`score` rubric at 4 levels is recommended (see Section 3.2).

---

## Resources

**Typed decisions and the reference model:**

- TypeSafe Jev model documentation — <https://docs.typesafe.ai/models>

**Independent leaderboards:**

- JevBench — <https://github.com/fstandhartinger/jevbench>
- S1MB — <https://github.com/hotchpotch/S1MB>
- Jev Decision Index — <https://huggingface.co/spaces/multimodalart/jev-decision-index>
- decision-models-under-pressure — <https://github.com/gazelle93/decision-models-under-pressure>

**Hardware:**

- NVIDIA DGX Spark — <https://www.nvidia.com/en-us/products/workstations/dgx-spark/>

**Related papers and tools:**

- [Local LLM Usage Guide]({{ '/papers/local-llm-guide/' | relative_url }})
- [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }})

---

### Notes

- **Measurements:** accuracy, MAE, ECE, flip and latency are from one run of the shared
  25-question set on the platform in Section 3.1, through a single adapter per model.
  Latency is client side and end to end: HTTP included, model load excluded.
- **Scope of the set:** 25 questions is a smoke set. The figures describe these six
  models on this set; they are not a ranking of the wider field, which is what the
  independent leaderboards above are for.
- **Licences:** open weights are not the same as open use. `openjev` is CC BY-NC 4.0 and
  closed to commercial use; `bekko-17m` has no licence assigned on its model card. Check
  component licences before production.
- **Currency:** model versions, licences and calibration figures are valid as of October
  2026.

---

{% include company/block.html name="cta_logo" %}

**Let's plan your decision-model infrastructure together.** For help choosing, sizing
and deploying a typed-decision model on DGX Spark or Jetson,
{% include company/block.html name="contact_cta" %}