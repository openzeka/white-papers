---
title: "System One in Production: Decision Quality, Reliability and Performance on DGX Spark with vLLM and SGLang"
parent: White Papers
nav_order: 14
lang: en
page_id: system-one-production-readiness
date: 2026-11-04
card_tag: "Technical Guide"
description: >-
  Six typed-decision models from 0.6B to 27B evaluated on one NVIDIA DGX Spark
  with vLLM and SGLang: Turkish accuracy, confidence calibration, paraphrase
  consistency, multimodal limits, engine portability, and the confidence
  thresholds a production decision policy needs.
permalink: /papers/system-one-production-readiness/
last_modified_date: 2026-11-04
toc: true
---

{% include company/block.html name="prepared_by" %}

*Test platform: NVIDIA DGX Spark (GB10) · Models: System One family · Report date: November 2026*

---

{:.no_toc}
## Table of contents

* TOC
{:toc}

---

## Executive Summary

This study evaluates the production readiness of the System One model family, which produces typed decisions directly instead of free text. Tests run across six models, datasets with different labelling approaches and two inference engines produce three main findings.

First, **although the highest accuracy is generally obtained with the larger models, there is no linear relationship between model size and accuracy.** `d3-27b` reaches 0.963 accuracy on the Turkish TDB dataset, while the 0.6B-parameter `d3-edge` remains at 0.336. By contrast, the 4B `d3-mini` approaches the 27B model with 0.887 accuracy and overtakes the 9B `clef-flash` model (0.853).

Second, **high accuracy alone does not mean reliable decision-making.** Even in the 42 cases where the answer is genuinely ambiguous, the models produce an average maximum option probability in the 0.75–0.77 range. The `confidence` field should therefore not be read as a calibrated estimate of accuracy; it should be treated as a pre-screening (triage) signal used with thresholds validated on labelled data.

Third, **System One support in inference engines is still maturing, so compatibility must be verified separately for each model.** With the same client, datasets and model roster, `d3-27b`, `clef` and `clef-flash` produced closely similar results on both engines. However, in the SGLang development image tested, the TDB accuracy of `d3-mini` fell from 0.887 to 0.280, and `d3-edge` failed to start.

This result does not show that the two engines generally make different decisions. The findings point to the answer-code readout in the SGLang version tested behaving incorrectly on the small D3 models. The problem should therefore, on the current evidence, be assessed per model and version. Nevertheless, every model–engine–version combination must be verified separately before production, and this acceptance test must be repeated at every version upgrade.

> **Key findings**
>
> 1. On the Turkish TDB set the highest accuracy is `d3-27b` (0.963) and `clef` (0.944); the lowest is `d3-edge` (0.336).
> 2. The `confidence ≥ 0.90` threshold automatically resolves 87% of the 354 scored cases for `d3-27b` with a 1.3% error risk.
> 3. Stability against option-order changes is complete in every model (`flip = 0.0`), whereas paraphrase consistency is about 0.83 even in the best model.
> 4. In the image/video tests only `d3-27b` answers all 8 items correctly; the common weakness is reading exact numbers from a chart.
> 5. 27B models can reach 93–96 °C on GB10 and the process can terminate silently; a protected operating protocol is mandatory.

**Scope note.** The report focuses on the measurement results and their implications for production decisions. Installation commands, API usage, SDK-related cautions and troubleshooting recommendations are outside the scope of this report. Hardware and software versions are fixed to the test environment. Results obtained in a different environment must be measured and verified separately.

---

## 1. Problem: from free text to typed decisions

When a conventional language model is run, it reads text and produces a free-form answer; the application then parses that answer to extract a decision. This approach carries two structural costs: the parsing layer is fragile, and the model's probability information is lost. The difference between "yes" and "yes, but…" can only be estimated by reinterpreting the generated text.

System One (Jev) removes this step. The model is given a `state` text and typed questions about that text; it produces a normalised probability for each option. There are three question types:

- **`choice`** — a selection among defined options.
- **`noul`** — a yes/no decision; the result is read from `P(yes)`.
- **`score`** — a distribution over ordered levels; the result is the level expectation computed as the weighted mean of the distribution.

The output schema consists of three fields, each answering a different question:

| Field | What it says | What it does not say |
| --- | --- | --- |
| `probabilities` | The relative distribution across options | Whether that distribution is correct |
| `confidence` | The model's internal confidence in the chosen answer | The probability that it is correct in the real world |
| `diagnostics.label_mass` | The total probability mass assigned to valid labels | The quality of the distribution within the labels |

A `label_mass` below 1 indicates that part of the probability mass has spilled outside the defined options and that the decision may need additional review.

### 1.1. Three readout methods

Although the models share the same API, they produce the decision through different mechanisms. This difference determines both the cost and how the output should be interpreted.

| Strategy | Model family | How it works | `label_mass` |
| --- | --- | --- | --- |
| **Answer-code readout** | `vllm-sr/d3` | A separate forward pass per question; options are scored through the logits of answer codes and normalised with softmax | Fixed at 1 |
| **Joint schema head** | `Cloudflare/clef`, `clef-flash` | Several questions are evaluated in a single prefill by a dedicated transformer head | Fixed at 1 |
| **Label-token readout** | `LiquidAI/d1-3B` | The first token of the answer is taken as the basis; the logits of the relevant labels are converted to probabilities with softmax | Dynamic |

The practical consequences of the distinction are:

- **D3** makes a separate pass per question, so processing cost rises as the number of questions grows.
- **CLEF** gains a single-forward-pass advantage on requests containing several questions; `usage.input_tokens` is reported over the shared input.
- **D1-3B** does not have to distribute probability only across valid labels, so `label_mass` is a real signal in this family.

The `instructions` field cannot be used in D3 requests; when it is sent, `400` is returned and the model runs with a fixed question template. In CLEF `instructions` is not mandatory, but `chat_template_kwargs` caused the request to be rejected in this study. CLEF and CLEF-Flash use the same `joint_schema_model.py` implementation and the same head configuration; the difference is in backbone size (32×4096 and 64×5120).

---

## 2. Method and the limits of the evidence

The evaluation covers datasets with different labelling approaches, principally a Turkish hard-label standard, a Turkish sample with probability-distribution labels, and an external English standard. These datasets make it possible to examine model performance against different criteria.

| Dataset | Content | Label regime |
| --- | --- | --- |
| **TurkishDecisionBenchmark v0.2 public** | 396 cases: 354 scored + 42 ambiguity controls | Single correct answer; ambiguous cases reported separately |
| **cisimcik sample** | 120 Turkish questions (40 `noul`, 40 `choice`, 40 `score`), seed 42 | Probability distribution from a reviewer panel (soft label) |
| **JevBench-public-120** | 72 original cases (36 paraphrase pairs) + 48 easy cases | Hard label; in the easy tier the answer is explicit in the text |
| **bench-tr (35)** | 25 + 10 Turkish workload questions | Expected answers fixed before measurement |
| **bench-images (8)** | Invoice, sales chart, error screen, 4-second video | 7 image + 1 video item |
| **limits (11)** | Programmatic boundary and robustness scenarios | Behavioural observation |

TDB and the cisimcik dataset serve different measurement purposes. TDB measures whether the model can find a single correct label, while cisimcik assesses how closely the probability distribution the model produces approaches the distribution of the reviewer panel. The accuracy figures from the two datasets must therefore **not** be compared directly.

The tests are arranged as a pyramid; the bottom layer is a quick health check and the upper layers are more costly and comprehensive rounds. This structure makes it easier to isolate the layer in which a problem appears.

| Layer | Content | Tool |
| --- | --- | --- |
| L0 | Basic operation check | `systemone.py --example` |
| L1-STD | JevBench-public-120 | `bench.py --set jevbench` |
| L1-TR | TDB v0.2 public (396) | `bench_tdb.py` |
| L1-TR+ | cisimcik sample (120) | `bench_cisim.py` |
| L2 | Image/video (8) | `bench_images.py` |
| L3 | Boundary and robustness (11) | `limits.py` |
| L4 | Metric derivation | `summary.py` |
| L5 | Concurrency 1/8/64 | `concurrency.py` |
| L6 | Cross-engine agreement | `xengine.py` |

Measured metrics: accuracy, group consistency (TDB contrast question groups), error at high confidence, mean probability assigned to the correct answer (mean gold p), overconfidence on ambiguous cases, soft-label Brier, Brier, normalised score-MAE, ECE(10), decision flip rate (`flip`), p50/p95 latency and `label_mass`.

The numbers in the tables are taken verbatim from the raw output; the decimal point has been kept.

**Test environment.** The tests were run on an NVIDIA DGX Spark (GB10, 121 GiB unified memory, aarch64). On the vLLM side the `vllm/vllm-openai:nightly` image and the `--max-model-len 32768` configuration were used. GPU memory utilization was 0.88 in the standard tests, and 0.78 with `--enforce-eager` in the protected tests of the 27B models. SGLang tests were run with the `lmsysorg/sglang:dev` and `dev-clef` images on port 8001, using the same client scripts and the same JSON request bodies.

> **System One support is new.** According to the records, the support entered the vLLM mainline on 14 October 2026 (vllm#61565) and is not yet in release versions; the `nightly` image was therefore used. Nightly's ARM64 support and its ability to run on DGX Spark were verified in this environment, but on every installation the image must be checked to contain the relevant change.

### 2.1. Limits of the evidence

Not all of the findings below carry the same weight. Knowing how much to trust each number is part of reading the result correctly.

- **Repeated rounds:** The main TDB, cisimcik and JevBench results rest on full test rounds; the 27B results were verified with a protocol run in batches and with merged files.
- **Measured on one engine only:** For `tr-set`, `clef`, `clef-flash` and `d1-3b` were run only on SGLang; these three models have no vLLM counterpart.
- **Small sample:** The image/video evaluation consists of 8 items; a one-item difference changes the ranking.
- **Behavioural observation:** The `limits` results are not statistical; they are scenario-based API behaviours.
- **Observed variability:** `clef-flash` TDB accuracy ranges from 85.3% to 85.9% across rounds; in batched runs a deviation of about ±0.07 was reported in probability values.
- **Version dependence:** System One support in both engines rests on development images from the same period. The results apply to these versions and this hardware.

---

## 3. Decision quality: accuracy, consistency, language behaviour

### 3.1. External English standard

On JevBench-public-120, all models score full marks on all 48 easy questions; the separation appears mainly in the 72 original questions.

| Model | acc_all (72) | noul | choice | score | easy (48) | Brier | ECE(10) | flip | paraphrase | p50/p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `d3-edge` | 0.819 | 0.708 | 0.917 | 0.750 | 1.000 | 0.271 | 0.083 | 0.0 | 0.667 | 9 / 11 |
| `d3-mini` | **1.000** | 1.000 | 1.000 | 1.000 | 1.000 | 0.012 | 0.032 | 0.0 | 0.833 | 50 / 52 |
| `d3-27b` | **1.000** | 1.000 | 1.000 | 1.000 | 1.000 | 0.004 | 0.012 | 0.0 | 0.833 | 289 / 299 |
| `clef-flash` | 0.972 | 1.000 | 0.944 | 1.000 | 1.000 | 0.044 | 0.058 | 0.0 | 0.833 | 112 / 116 |
| `clef` | **1.000** | 1.000 | 1.000 | 1.000 | 1.000 | 0.004 | 0.012 | 0.0 | 0.833 | 290 / 301 |
| `d1-3b` | 0.931 | 0.792 | 1.000 | 1.000 | 1.000 | 0.126 | 0.033 | 0.0 | 0.806 | 61 / 64 |

Two observations stand out. First, the `flip` metric is zero in every model: when the order of the options is changed, the decision does not change. Second, the `paraphrase` metric is about 0.83 even in the best models. That is, **expressing the same question in different words can change the decision.** In applications where decision consistency is critical, this test should be repeated with institution-specific data.

### 3.2. Turkish hard-label standard

In TDB the highest accuracy is seen in the 27B models, but the ranking is not uniform with size: the 4B `d3-mini` (0.887) is better than the 9B `clef-flash` (0.853), while the difference between the 27B `d3-27b` and `d3-mini` is much smaller than the difference between 0.6B and 4B.

| Model | accuracy | group-cons | high-conf err | mean gold p | amb valid | amb max-p | Brier | ECE(10) | p50/p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `d3-27b` | **0.963** | **0.870** | 0.011 | **0.934** | 0.952 | 0.765 | **0.060** | 0.016 | 336 / 362 |
| `clef` | 0.944 | 0.797 | **0.006** | 0.865 | 0.976 | 0.747 | 0.102 | 0.047 | 351 / 386 |
| `clef-flash` | 0.853 | 0.638 | 0.011 | 0.753 | 0.905 | 0.715 | 0.232 | 0.060 | 115 / 125 |
| `d3-mini` | 0.887 | 0.710 | **0.006** | 0.795 | 0.905 | 0.754 | 0.183 | 0.047 | 59 / 64 |
| `d1-3b` | 0.545 | 0.159 | 0.020 | 0.468 | 0.667 | 0.550 | 0.588 | 0.113 | 66 / 86 |
| `d3-edge` | 0.336 | 0.029 | 0.065 | 0.327 | 0.619 | 0.635 | 0.867 | 0.295 | 10 / 14 |

The metrics should be interpreted with the following definitions in mind:

- **Group consistency** is the share of question groups that ask about the same situation with contrasting statements and are answered entirely correctly. It shows whether a consistent decision is made when the same situation is presented in different or opposite wording.
- **Error at high confidence** is the share of wrong decisions given with at least 0.90 confidence; it should also be monitored in automated systems.
- **Overconfidence on ambiguous cases** is, across the 42 controls, the rate at which one of the valid answers is selected and the highest average probability in those cases.

`d3-mini` and `clef` have the same error rate at high confidence (0.006); however, `clef`'s group consistency is markedly higher (clef 0.797, `d3-mini` 0.710). That is, similar "being sure" behaviour does not mean similar consistency.

### 3.3. Turkish probability-labelled sample

In the cisimcik sample the reference is not a single correct option but the distribution of the reviewer panel. The accuracy here is therefore not comparable with TDB accuracy.

| Model | accuracy | noul | choice | score | score-MAE (norm) | mean gold p | p50/p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `clef` | **0.855** | 0.950 | 0.895 | 0.718 | 0.120 | 0.788 | 488 / 2221 |
| `d3-27b` | 0.840 | 0.975 | 0.850 | 0.692 | 0.114 | 0.810 | 451 / 2547 |
| `d3-mini` | 0.832 | 0.975 | 0.900 | 0.615 | 0.142 | 0.749 | 78 / 388 |
| `clef-flash` | 0.786 | 0.875 | 0.921 | 0.564 | 0.168 | 0.728 | 148 / 810 |
| `d1-3b` | 0.624 | 0.800 | 0.605 | 0.462 | 0.220 | 0.560 | 88 / 201 |
| `d3-edge` | 0.429 | 0.500 | 0.450 | 0.333 | 0.311 | 0.370 | 15 / 52 |

`score` questions are the type every model struggles with most. In long and complex Turkish corporate texts the model tends to drift between adjacent levels: the distinction between "medium" and "medium-high" cannot be made reliably. Although `clef` achieves the highest accuracy at 0.718, this does not mean that an ordered scale can be used automatically in production.

---

## 4. Confidence and uncertainty

### 4.1. What `confidence` does not say

`confidence` expresses the probability the model reports for the answer it chose; it does not directly indicate the probability that the answer is actually correct. A high confidence report therefore does not mean the decision is necessarily right.

In the 42 ambiguity controls in TDB, the 27B models selected one of the valid options in 95–98% of cases; the highest average probability of the selected options was in the 0.75–0.77 range. In other words, the models **tend to settle on one of the options rather than abstain**, and they do so with relatively high probability. The level of uncertainty is not represented directly by a separate field in the API output.

`label_mass` partly fills this gap, but only in the D1 family. In D3 and CLEF the value is fixed at 1.0; `label_mass` therefore cannot be used as a safety filter on its own in these families. The practical consequence: **a `confidence` threshold is necessary but not sufficient**; it must be calibrated on labelled data.

### 4.2. Coverage–risk analysis

The boundary between automatic decision and human review is set not by overall accuracy but by **the error rate among decisions given with high confidence**. The table below is computed on the 354 scored cases of TDB by varying the `confidence` threshold.

| Model | `conf ≥ 0.8` | `conf ≥ 0.9` | `conf ≥ 0.95` |
| --- | --- | --- | --- |
| `d3-27b` | Coverage 0.92 · risk 0.021 | **Coverage 0.87 · risk 0.013** | Coverage 0.80 · risk 0.011 |
| `clef` | Coverage 0.85 · risk 0.023 | Coverage 0.69 · risk 0.008 | Coverage 0.48 · risk 0.006 |
| `clef-flash` | Coverage 0.68 · risk 0.046 | Coverage 0.49 · risk 0.023 | Coverage 0.25 · risk 0.000 |
| `d3-mini` | Coverage 0.68 · risk 0.021 | Coverage 0.56 · risk 0.010 | Coverage 0.43 · risk 0.007 |
| `d1-3b` | Coverage 0.22 · risk 0.195 | Coverage 0.12 · risk 0.122 | Coverage 0.03 · risk 0.000 |
| `d3-edge` | Coverage 0.25 · risk 0.596 | Coverage 0.12 · risk 0.523 | Coverage 0.07 · risk 0.360 |

*Coverage: the share of decisions meeting the confidence threshold among all decisions. Risk: the error rate among decisions resolved automatically.*

The most important distinction in the table is between `d3-27b` and `clef`. At the 0.90 threshold `d3-27b` closes 87% of cases with 1.3% risk, while `clef` closes 69% with 0.8% risk. Lower risk comes at the price of more human review; the choice depends on the cost of a wrong decision.

For `d3-edge`, `confidence` is not a reliable indicator: even when the model reports high confidence, the error rate remains in the 0.36–0.60 range. `d1-3b` similarly shows high risk at low coverage.

These results apply only to the dataset and test conditions used. If the distribution of production data changes, the same coverage and risk levels cannot be guaranteed. The thresholds must therefore be recalibrated on the application's own labelled data.

---

## 5. Multimodal input, boundary cases, performance

### 5.1. Image and video

Images and video can be added to the `state` field. In D3 and CLEF, images are processed at up to 1.6 megapixels and video at 2 frames per second and at most 32 frames. D1 supports only images and downsamples them to 1024×1024.

| Model | Correct answers | Note |
| --- | --- | --- |
| `d3-27b` | **8/8** | The only model to answer every item correctly |
| `d3-mini` | 7/8 | — |
| `clef` | 7/8 | — |
| `d1-3b` | 6/7 | Video not supported; g7 was not run, requests containing `videos` returned an error |
| `clef-flash` | 6/8 | — |
| `d3-edge` | 6/8 | — |

The common weakness is the item coded `g3`: reading a numeric value from a chart. Every model except `d3-27b` answered this question incorrectly and produced different values in the 0.7–1.9 range. The models can determine the overall trend of the chart but struggle to **read exact numeric values**. In workflows where numerical accuracy is critical, the model output must therefore be verified against a data source independent of the image.

In the D3 family, media is processed once and the resulting representation is shared across all questions. In the tests, asking 16 questions in a single request and in 16 separate requests gave the same result; in image-heavy workloads this reduces cost by avoiding repeated processing.

### 5.2. Concurrent request performance

| Model | 1 client | 8 clients |
| --- | --- | --- |
| `d3-edge` | 118.6 | 335.6 |
| `d1-3b` | 21.0 | 107.2 |
| `d3-mini` | 19.0 | 39.2 |
| `clef-flash` | 8.8 | 16.8 |
| `d3-27b` | 2.5 | 5.9 |
| `clef` | 3.1 | 4.9 |

Values are completed requests per second (req/s), measured with single-question requests; for latency see the p50/p95 columns in §3. At a single request, latency depends largely on the duration of one forward pass. Because D3 evaluates each question in a separate pass while CLEF can evaluate several questions in a single forward pass, CLEF's latency advantage grows as the number of questions increases.

---

## 6. Engine portability: vLLM and SGLang

For a system not to depend on a single inference engine, it must be known whether the same API produces the same decision. The same client scripts, the same datasets and the same model roster were run on both engines. This section measures agreement between two engines with pinned versions; it makes no claim about the general behaviour of the engines.

*V: vLLM, S: SGLang.*

| Model | TDB (V→S) | cisimcik (V→S) | std72 (V→S) | tr-set (V→S) | vision-8 (V→S) | Portability |
| --- | --- | --- | --- | --- | --- | --- |
| `d3-27b` | 0.963 → 0.966 | 0.840 → 0.840 | 1.000 → 1.000 | 0.943 → 0.943 | 1.000 → 1.000 | Yes (protected mode) |
| `clef` | 0.9435 → 0.9435 | 0.855 → 0.856 | 1.000 → 0.972 | — → 0.914\* | 0.875 → 0.875 | Yes |
| `clef-flash` | 0.853 → 0.853 | 0.786 → 0.782 | 0.972 → 0.972 | — → 0.857\* | 0.750 → 0.875 | Yes |
| `d1-3b` | 0.545 → 0.568 | 0.624 → 0.622 | 0.931 → 0.931 | — → 0.829\* | 0.857 → 0.875 | Yes |
| `d3-mini` | 0.887 → **0.280** ⚠ | 0.832 → **0.319** ⚠ | 1.000 → **0.292** ⚠ | 0.886 → **0.257** ⚠ | 0.875 → **0.250** ⚠ | No |
| `d3-edge` | 0.336 → ✗ | — → ✗ | 0.819 → ✗ | 0.800 → ✗ | 0.750 → ✗ | No |

\* `tr-set` was run only on SGLang; there is no vLLM counterpart in these rows. ✗: the model could not be started in SGLang.

### 6.1. Differences at the API level

That the same client code produces the same result on both engines in the D1 and CLEF families shows that the observed differences do not come from the client. There are, however, mismatches at the schema level, and the client must handle each of them separately.

1. **The `model` field is mandatory in SGLang.** When it is omitted, `422 Field required` is returned; in vLLM it is optional. A compatible client must obtain the model name from `/v1/models` and add it to the body.
2. **`confidence` may not match the probability of the selected option.** In the SGLang output the example `choice: "diger", confidence: 0.303, probabilities: {…, "diger": 0.536}` was observed. According to the schema these two values should be equal. In SGLang, `confidence` must not be used in threshold calculations without verification.
3. **`probabilities` is absent in `noul` answers.** While vLLM returns a `{yes, no}` distribution, SGLang gives only `{"type":"noul","noul":0.117}`. The missing probability can be derived with `P(no) = 1 − P(yes)` because `noul` is binary.
4. **The location of `label_mass` differs.** vLLM returns it under `diagnostics[qid].{label_mass, argmax_is_label}`, while SGLang returns it in the per-answer `x_label_mass` field; moreover, the field is absent in the `d3-mini` output. A missing value must not be silently accepted as valid.
5. **Error codes differ.** An unknown question field returns `400` in vLLM and `422` in SGLang; `chat_template_kwargs` is ignored with `200` in vLLM but returns `400` in SGLang. Options with the same name after truncation are accepted in both engines; the option, question and level limits are the same.

### 6.2. Speed

| Model | SGLang req/s (1 / 8) | Relative to vLLM |
| --- | --- | --- |
| `d1-3b` | 27 / 63 | About 1/4 of vLLM under high load |
| `d3-mini` | 17 / 37 | Similar; falls at 64 clients |
| `clef-flash` | 8 / 15 | On a par |
| `d3-27b` | 3 / 7 | Slightly higher in protected mode |
| `clef` | 3 / 5 | Equal |

The vLLM values are given in §5.2.

### 6.3. Conclusion

**The results in this section are compatibility observations obtained only for the versions tested; they must not be interpreted as a general portability rule.** In the versions tested, the label-token method (D1) and the joint-schema method (CLEF) produced similar results on both engines; the 27B D3 model is compatible in protected mode. The degradation seen in the small D3 models does not mean that the engine does not support this method in general. What it shows is that the answer-code implementation in that development image produced incorrect results on small models. Because the failure was observed in one model and one version, no firm judgement can be made about its cause; numerical precision, the attention path and schema mapping must each be examined separately.

Every model–engine–version combination must therefore pass a separate verification test before production, and the test must be repeated when the engine version is upgraded. In terms of performance, SGLang may provide slightly lower latency at a single request, while vLLM's batching advantage becomes evident under high concurrency on `d1-3B`.

---

## 7. Decision guide for production

### 7.1. Model selection

| Option | When | Limitation |
| --- | --- | --- |
| **`d3-27b`** (27B) | When accuracy is critical; when there are complex inputs including image and video | ~340 ms single-request latency |
| **`clef`** (27B) | When the single-forward-pass advantage is needed for multi-question requests | ~98% of `d3-27b` accuracy |
| **`clef-flash`** (9B) | 2–9 questions per request; when the cost of a wrong decision is low | TDB 0.853 |
| **`d3-mini`** (4B) | Real-time pre-filtering; ~50 ms budget | TDB `score` 0.615; unusable in the SGLang image tested |
| **`d1-3b`** (3B) | High-volume labelling; ~60 ms budget | TDB 0.545; LFM 1.0 licence |
| **`d3-edge`** (0.6B) | First routing only; when the cost of error is very low | TDB 0.336; confidence threshold meaningless |

The relationship between size and accuracy is not uniform: `clef` (27B) and `d3-27b` (27B) have similar accuracy, while `d3-mini` (4B) is better than the 9B `clef-flash` on TDB. The choice depends on the readout method and the task rather than on the parameter count.

### 7.2. Recommended decision policy

1. **Threshold:** As an initial policy, `confidence ≥ 0.90` and `label_mass ≥ 0.95` are required together. For `d3-27b` this resolves about 87% of 354 cases automatically with 1.3% risk. The thresholds are verified with the application data before going to production.
2. **Routing to human review:** When `label_mass < 0.95`, the decision goes to human review. In D3 and CLEF this field is fixed at 1.0, so it is not sufficient on its own; task categories with high error rates (`by_category`) and Turkish `score` questions are also routed.
3. **Record keeping:** `confidence` and, where possible, the probability distribution are stored with each decision; the thresholds are updated in line with new results and the coverage–risk analysis is repeated with real data.
4. **Re-querying:** In batched runs and runs that depend on memory state, probabilities may vary by about ±0.07. Decisions close to the threshold are verified with a single request before publication; where possible, a configuration that provides deterministic behaviour (`VLLM_BATCH_INVARIANT`) is evaluated.
5. **What to avoid:** Basing a production decision on `d3-edge` alone; treating `confidence` as calibrated accuracy; embedding d1-3B in an Apache-2.0-compatible product without examining the licence terms.

---

## 8. Risks, licences and conclusion

### 8.1. Limits of validity

- The results apply to a single hardware configuration (DGX Spark GB10), a single memory configuration and the development images of two engines.
- The TDB and cisimcik labels were not changed within the scope of this study; the results must be reproduced when new versions are published.
- The 27B results were obtained with the protected protocol (GPU memory utilization 0.78, `--enforce-eager`, batched runs); latency and stability may change under different settings.
- For `tr-set`, `clef`, `clef-flash` and `d1-3b` were measured only on SGLang; cross-engine comparison cannot be made for these three models.
- Zero-byte result files were not counted as complete, and missing tests were rerun with `FORCE=1`.
- Use of the TypeSafe SDK with the two engines is not included in this scope.

### 8.2. Licences

Status verified against Hugging Face model cards and repository files as of November 2026:

| Model | Licence | Base model |
| --- | --- | --- |
| `vllm-sr/d3` | **Apache-2.0** | Qwen/Qwen3.8-27B (Apache-2.0) |
| `vllm-sr/d3-mini` | **Apache-2.0** | Qwen/Qwen3.5-4B (Apache-2.0) |
| `vllm-sr/d3-edge` | **Apache-2.0** | Qwen/Qwen3.5-0.8B (Apache-2.0) |
| `Cloudflare/clef` | **Apache-2.0** | Qwen/Qwen3.8-27B |
| `Cloudflare/clef-flash` | **Apache-2.0** | Qwen3.5 (9B) |
| `LiquidAI/d1-3B` | **LFM 1.0** ⚠ | LiquidAI/LFM2.5-VL-3B |

The D3 and CLEF families are published under Apache-2.0; nevertheless, when redistribution and derivative work are evaluated, the licence file of the version used, and any additional terms, should be examined in addition to the model card.

**d1-3B is not Apache-2.0.** The rights that apply in Apache-2.0-licensed software must not be assumed to apply unchanged; before commercial distribution or inclusion in a product, Liquid AI's current licence text should be examined and, if necessary, legal advice obtained.

### 8.3. Conclusion

This evaluation shows that the System One family can be used in production under certain conditions, but that a reliable deployment requires **the model, inference engine and hardware combination to be verified together**.

- **Accuracy** increases with size, but 4B-class models come much closer to 27B than expected; the choice should be made by task and readout method, not by parameter count.
- **Confidence** is not calibrated; uncertainty is not represented in the output. Automatic decisions must be built with thresholds validated on labelled data and with human review.
- **Turkish**: the weakest points are ordered `score` questions and paraphrase consistency; both must be tested separately with institution-specific data.
- **Engine agreement** depends on the model and the engine version: D1 and CLEF are portable in the versions tested, 27B D3 is portable in protected mode, and the small D3 models do not work in the SGLang image tested.
- **Hardware** is a real limit: 27B models cannot be run reliably on GB10 without a protected operating protocol.

The decision to go to production should rest on thresholds verified on application-specific labelled data, continuous monitoring of decision records, and separate acceptance tests run for every model–engine–version combination.
