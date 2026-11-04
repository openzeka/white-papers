---
title: CV Inference Benchmark Explorer
nav_order: 5
lang: en
page_id: cv-inference-benchmarks
date: 2026-09-16 16:07:02 +0300
card_tag: "CV Benchmark"
description: >-
  Explore OpenZeka's computer-vision inference benchmarks on NVIDIA GPUs and
  Jetson devices. Pick a GPU and a detection model to see the frame rate it
  sustains, how it falls as cameras are added, and how many cameras it carries
  at your target FPS.
permalink: /cv-inference-benchmarks/
last_modified_date: 2026-09-24
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

A row is a **complete deployment configuration**, not a model: one detection
model, at one precision and input resolution, on one device, served by the
Cordatus Inference Engine on DeepStream. The same model therefore appears once
for every device it was measured on, and comparing two rows is only meaningful
once you know which of those columns differ between them.

### How the numbers were measured

Every figure is an OpenZeka measurement, produced with the
[cordatus-benchmark](https://github.com/CordatusAI) tool against the Cordatus
Inference Engine, on NVIDIA Jetson Orin Nano, Jetson Orin NX 16GB, Jetson AGX
Orin 64GB, Jetson AGX Thor, GB10 (DGX Spark) and GeForce RTX 3060 and RTX 3090.
The pool grows as we test further devices and
models.

Every camera is a **1080p H.264 stream at a fixed 20 FPS**: a live IP camera,
or, for the rows measured in November 2026, a recorded clip replayed over RTSP
(see below).
Each configuration is swept across increasing camera counts, typically 1, 2, 4
and 8 and then in steps of two, up to 32. Not every configuration has every
count: a count that was not measured, or whose measurement was discarded, is
simply missing from that row's sweep.

Rows measured from 2 to 4 November 2026 differ in two ways, and their notes say so. They
ran on **Cordatus Inference Engine 2.7.2**, and every camera was the same
recorded 1080p H.264 office clip at 20 FPS, **replayed over RTSP** rather than a
live camera, because the office cameras accept only about 30 sessions in total.
Their camera counts come from a limit search: 1, 2, 4, 8, 16 and 32 cameras and
upward until a camera falls under 15 FPS or drops more than 2% of its frames,
then the gap is halved. On the RTX 3090 the engine hangs between 44 and 48
cameras, before the GPU runs out, so most searches there stop at 40 cameras. On the
Jetsons the clocks were locked at maximum with `jetson_clocks` and the VIC (video
scaler) clock was pinned to its maximum: on its default governor the VIC stayed
at 115 MHz and capped every Jetson pipeline near 100 FPS in total.

For each camera count the tool starts a job, waits for every camera to reach the
pipeline and frames to flow, lets the pipeline settle, then samples the engine's
profiler for **30 seconds**. The engine's counters are a rolling window that
resets every two seconds, so readings are grouped by window, the most mature
reading per window is kept, and windows too short to trust are discarded. The
engine's own placeholder source is excluded from every figure.

Two kinds of measurement never reach this page. A camera count where not every
camera actually streamed is dropped, because it measured fewer cameras than its
label says. So is a result where a camera appears to be processed clearly faster
than it streams, which is physically impossible and a sign of the same problem.

### What the parameters mean

**FPS (frames per second)** — how many video frames are processed each second.

**Cameras** — the camera count the row's numbers were measured at. Each row
reports the heaviest load it was measured under at or below the camera limit in
the filters, so rows can differ here, which is why the count sits beside
the numbers instead of in a heading.

**FPS / camera** — the frame rate each camera is processed at, at that camera
count. This is the number to read for "will this keep up with my cameras".
Higher is better, and 20 is the ceiling, because that is what the cameras send.

**Total FPS** — the whole pipeline's throughput at that camera count: roughly
FPS per camera × cameras.

**Drop %** — frames that entered the pipeline but did not come out, as a share
of the input. Near zero is healthy. Small negative values also occur — slightly
more frames counted out than in during the sampling window — and read the same
as zero. Drop % is shown for information; it does not affect PASS/FAIL or Max
cameras.

**Input resolution** — the size every frame is scaled to before the model sees
it, width × height. It is the model's own input, not the camera's: the cameras
send 1080p, and the pipeline scales each frame down. A larger input costs more
computation per frame.

**Precision** — the number format the model's engine was built at, shown beside
the model name where it was recorded. INT8 stores weights and activations in
8-bit integers; lower precision generally means faster inference, at some risk
to accuracy.

**Device** — the hardware the pipeline ran on: a Jetson module (Orin Nano, Orin
NX, AGX Orin, AGX Thor), a GB10-based DGX Spark, or a GeForce desktop GPU. The DeepStream,
CUDA and JetPack/L4T versions, and the CPU where recorded, are listed in the
expanded row.

### Two distinctions worth fixing first

**Filters decide which rows appear. The target changes what the numbers mean.**
Filtering to one device shortens the table; raising the target FPS leaves the
row count alone but recalculates Max cameras and the PASS/FAIL result of every
measurement.

**FPS per camera and total FPS answer different questions.** Adding cameras
usually raises the total for a while, even as each camera gets fewer frames.
A device can look busier and more productive on the total while every one of
its cameras has fallen below what you need, so read the per-camera figure for
"does it keep up" and the total for "how hard is the device working".

### 1. Set the camera limit

The camera-limit slider in the filters is an upper bound, not a selection. It
hides everything measured above it and stops at the largest camera count anyone
has measured so far. Set it to 12 and every row reports the heaviest load it was
measured at up to 12 cameras — the sweep, the curve and the stream preview
follow. A configuration with nothing measured that low drops out of the table
until the limit is raised again.

Set it to the number of cameras you actually plan to run, and every row answers
your question at your load.

### 2. Narrow the configurations

The device and model filters combine, and every column sorts — so you can come
at the table from the hardware, from the model, or from the frame rate. The most
instructive comparisons change one variable: the same model on two devices, or
the four YOLO11 sizes on the same device.

### 3. Set your target FPS

The target is the frame rate per camera you consider acceptable. It opens with
every expanded row, beside the sweep it applies to, and it is one value for the
whole table: moving it in one row moves it for all of them. The default is
**15 FPS**, and the bound is **inclusive** — exactly 15.0 still passes.

Changing it immediately re-evaluates every configuration. It updates the green
and red colouring of FPS / camera, the PASS/FAIL result at every point of the
expanded sweep, and Max cameras.

The right target depends on what the video is for. Fast-moving subjects —
vehicles, or anything you need to count or track — need more frames than
confirming that someone is present in a room. Because the cameras send 20 FPS,
a target above 20 cannot be met in these measurements.

### 4. Read Max cameras

**Max cameras** is the highest *measured* camera count at which the
configuration still holds your target, up to the camera limit. It is taken from
the measured points only — nothing is extrapolated — and if no measured point
meets the target it reads 0.

Because the target is yours to set, Max cameras is not a fixed property of a
configuration, and neither is it a promise about the counts between two
measurements.

<div class="bt-howto-example" markdown="1">
**Example.** PeopleNet on GB10 delivers 16.1 FPS per camera at 32 cameras and
12.9 at 34, so at the default 15 FPS target Max cameras is 32. Raise the target
to 18 FPS and it falls to 16, the next measured count, still at 19.8. Meanwhile
total FPS stops growing: about 514 at 32 cameras, between 418 and 490 from 34 to
48 — the extra cameras are sharing the same throughput rather than adding to it.
</div>

A **≥** beside the figure means the device had not reached its own limit: at the
largest camera count shown it was still delivering the cameras' 20 FPS, within
10%. Those figures are floors, not ceilings. The ≥ also depends on the camera
limit — lower the limit, and a device that falls away at 28 cameras shows ≥ at
16, because at 16 it was still keeping up.

### 5. Open a row for the detail

The whole row is clickable. Opening one shows the complete camera sweep, with
PASS/FAIL marking whether your target is met at every count — the behaviour a
single headline figure hides.

Beside the sweep, a **stream preview** plays the same short clip twice side by
side: the left pane at the camera's own 20 FPS, the right one at the frame rate
that configuration sustained. Picking a camera count in the sweep changes the
right pane, so the cost of adding cameras is visible rather than inferred. The
clip shows fast-moving vehicles past a fixed camera, because frame rate is
easiest to judge on fast motion. It is not footage from a benchmark run, and no
detection is being performed on it.

The chart carries two curves:

- **FPS per camera** — which usually holds near 20 and then falls once the
  device runs out of headroom.
- **Total FPS** — which climbs with every camera added, then flattens at the
  same point.

The camera count where the two curves change direction is the device's working
limit for that model; the dashed line marks your target. The device's hardware
and software versions, and the benchmark runs the row comes from, are listed
below the chart.

### Where to start

**"We need 16 cameras running PeopleNet at 15 FPS — which device?"** Select the
model, set the camera limit to 16, and sort by FPS / camera. Every row that
reads 16 in the Cameras column and 15 or more per camera answers yes. A row
showing fewer cameras was never measured at 16, so it has not answered the
question either way.

**"We already own a Jetson AGX Thor; which YOLO11 size can we afford?"** Select
the device and sort by Max cameras. The four sizes differ only in the model, so
the gap between them is the cost of a larger model.

**"How does the same model do on different hardware?"** Select one model and
compare the devices at the same camera limit. Moving the limit shows where each
one starts to fall behind.

### What this does not tell you

The table deliberately uses one fixed, comparable workload so that a first
comparison is possible without a site survey. It is **not a substitute for a
test on your own cameras**.

Every figure comes from 1080p H.264 cameras at 20 FPS, live or replayed. Cameras at a
different resolution, codec or frame rate change the decode and scaling load. A
production pipeline often adds tracking, secondary classifiers, recording or
analytics on top of detection, and whatever the measured pipeline did not run is
not in these figures. Each measurement is 30 seconds of steady state, so it says
nothing about behaviour over hours — thermal limits on a fanless enclosure, for
example. And these are speed measurements only: nothing here measures how
accurately a model detects.

Higher camera counts on the RTX 3060, which was still keeping up at the largest
count we tested, need a camera source that does not run out before the GPU does.
Those runs are pending, and the table will grow when they land. The RTX 3090 was
measured again in November 2026 with replayed cameras; its search stops where
the engine hangs, not where the GPU does.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/cv-benchmark-table.css">

<div data-cvbt-src="/assets/data/cv-benchmarks/index.json"
     data-cvbt-video="/assets/video/cv-preview.mp4"></div>

<p class="bt-attribution">Every figure on this page is OpenZeka&rsquo;s own
measurement on its own hardware.</p>

{% include benchmark-jsonld.html kind="cv" %}
{% include cv-benchmark-links.html %}

<script src="/assets/js/cv-benchmark-table.js"></script>
