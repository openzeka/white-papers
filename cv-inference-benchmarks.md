---
title: CV Inference Benchmark Explorer
nav_order: 5
lang: en
page_id: cv-inference-benchmarks
card_order: 11
card_tag: "CV Benchmark"
card_date: "September 2026"
description: >-
  Explore OpenZeka's computer-vision inference benchmarks on NVIDIA GPUs and
  Jetson devices. Pick a GPU and a detection model to see the frame rate it
  sustains, how it falls as cameras are added, and how many cameras it carries
  at your target FPS.
permalink: /cv-inference-benchmarks/
last_modified_date: 2026-09-15
toc: false
---

# CV Inference Benchmark Explorer

How many cameras can this device run this model on, and at what frame rate?
Pick a device and a model, set the frame rate you consider acceptable, and the
table answers for every configuration we have measured. Expand a row to see the
full camera sweep and its curve.

<details class="bt-howto">
<summary>How to use the benchmark explorer</summary>
<div class="bt-howto-body" markdown="1">

### What a row is

A row is a **complete deployment configuration**: one model, at one precision
and input resolution, on one device, served by the Cordatus Inference Engine on
DeepStream. The same model appears once per device, and comparing two rows is
only meaningful once you know which of those columns differ.

### How the numbers were measured

Every figure is an OpenZeka measurement, produced with the
[cordatus-benchmark](https://github.com/CordatusAI) tool against the Cordatus
Inference Engine. For each camera count the tool starts a job, waits for every
camera to reach the pipeline and frames to flow, lets the pipeline settle, then
samples the engine's profiler for 30 seconds.

The engine's counters are a rolling window that resets every two seconds, so
readings are grouped by window, the most mature reading per window is kept, and
windows too short to trust are discarded. The engine's own placeholder source
is excluded from every figure, and a camera count where not every camera
actually streamed is excluded from this page entirely — such a run measures
fewer cameras than its label says.

### What the columns mean

**Cameras** — the camera count the row's numbers were measured at: the heaviest
load that configuration was measured under, at or below the limit set in the
filter panel. Rows can differ here, which is why the count travels with the
numbers instead of sitting in a heading.

**FPS / camera** — the frame rate one camera is processed at, at that camera
count. This is the number to read for "will this keep up with my cameras".
Higher is better.

**Total FPS** — the whole pipeline's throughput at that camera count: roughly
FPS per camera × cameras.

**Drop %** — frames that entered the pipeline but did not come out, as a share
of the input. Near zero is healthy.

**Max cameras** — the highest *measured* camera count at which the
configuration still holds your target FPS. It moves when you move the target,
and it is taken from measured points only — nothing is extrapolated.

### What the stream preview shows

Expanding a row plays the same short CCTV clip twice side by side: the left
pane sampled at the camera's own 20 FPS, the right one at the frame rate that
configuration sustained. Picking a different camera count in the sweep table
changes the right pane, so the cost of adding cameras is visible rather than
inferred. The clip shows fast-moving vehicles past a fixed camera, because frame
rate is easiest to judge on fast motion — it is not footage from a benchmark run,
and no detection is being performed on it.

### The camera limit

The slider in the filter panel is an upper bound, not a selection: it hides
everything measured above it and stops at the largest camera count anyone has
measured so far. Set it to 12 and every row reports the heaviest load it was
measured at up to 12 cameras — the sweep table, the curve and the stream
preview follow. A configuration with nothing measured that low drops out of the
table until the limit is raised again.

### The ceiling in these measurements

The cameras feeding these sweeps are live 1080p H.264 streams at a fixed
**20 FPS**, so no configuration can process a camera faster than 20 FPS. Where
a device still delivers that rate at the largest camera count we tested, its
own limit was never reached: the Max cameras figure carries a **≥** and the
number is a floor, not a ceiling. The Jetson Orin Nano row is the one where the
device's limit is visible — per-camera frame rate falls away from 20 FPS as
cameras are added, and total throughput flattens.

Higher camera counts on the desktop GPUs need a source that does not run out
before the GPU does. Those runs are pending, and the table will grow when they
land.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/cv-benchmark-table.css">

<div data-cvbt-src="/assets/data/cv-benchmarks/index.json"
     data-cvbt-video="/assets/video/cv-preview.mp4"></div>

<p class="bt-attribution">Every figure on this page is OpenZeka&rsquo;s own
measurement on its own hardware.</p>

<script src="/assets/js/cv-benchmark-table.js"></script>
