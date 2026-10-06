---
title: VLM Inference Benchmark Explorer
nav_order: 6
lang: en
page_id: vlm-inference-benchmarks
date: 2026-10-06 12:00:00 +0300
card_tag: "VLM Benchmark"
description: >-
  Explore vision-language model inference benchmarks on RTX PRO 6000 Blackwell,
  Jetson AGX Orin and Jetson Orin NX. Pick the image size, set how long a camera
  may wait for its answer, and see how many cameras each configuration keeps up
  with.
permalink: /vlm-inference-benchmarks/
last_modified_date: 2026-10-06
toc: false
---

# VLM Inference Benchmark Explorer

How many cameras can this device watch with this vision-language model? Pick
the image size your cameras send and set how long a camera may wait for its
answer; the table updates for every configuration we have measured. Expand any
row to see its measurements for every number of cameras, the results explained
and a chart.

<details class="bt-howto">
<summary>How to use the benchmark explorer</summary>
<div class="bt-howto-body" markdown="1">

### What a row is

A row is one **deployment configuration**: a vision-language model, on specific
hardware, in a specific number format, served by a specific engine, measured end
to end. The same model therefore appears in several rows, and two rows are
directly comparable only once you know which of those settings differ between
them.

### Filters and the target do different jobs

**Filters decide which rows you see.** The device, model, parameter-count,
quantization and engine filters, and the response-time and camera sliders, only
show or hide rows.

**The target and the assumption decide what the numbers say.** They sit under
*Performance Target and Assumptions*. Changing one leaves the rows in place but
recalculates the response time, Max Cameras and the green and red colouring of
every row.

### 1. Describe your cameras

Two selectors describe the workload, and every number in the table is read at
them:

- **Image Size** — the size of each image a camera sends: 480p, 720p, 1080p or
  2K.
- **Cameras** — how many cameras send requests at the same moment. This is the
  concurrency the system was measured at.

Rows not measured at the selected combination are hidden, and dimmed buttons
mark combinations that have no measurement. Several cameras were measured at
480p, 720p and 1080p; 2K with one camera only.

### 2. Narrow and sort

Filters combine, and every column sorts. The most instructive comparisons change
a single setting: one model at two quantizations on one device, the same model
under llama.cpp and vLLM, or one model on two devices.

### 3. Set your target

The target is the **longest a camera may wait for its answer to start** —
default 3 seconds. A response time exactly on the target passes.

Beside it, **Images per Camera** sets how many images each request carries:
one snapshot by default, or several frames of the same camera sent together, as
video is often sent to a vision-language model. Several images per request were
measured with one camera only, so with three or five images Max Cameras cannot
be higher than 1.

### 4. Read Max Cameras

**Max Cameras** is the highest measured number of cameras at which every
camera's answer starts within your target. A plus —
**16+** — means the configuration met the target even at the highest number it
was tested with, so its real maximum was not reached. 0 means not even a single
camera is answered in time.

### 5. Open a row

Click a row to see:

- on the left, the measurements at your image size and image count for every
  number of cameras tested, marked PASS or FAIL against your target;
- on the right, the results explained in plain language, at the default
  settings;
- below, a chart of response time as cameras are added, one line per image size,
  with your target as a dashed line. It appears where several cameras were
  measured, so with one image per camera.

The chart downloads as a PNG for reports and presentations.

### Where to start

**"How many cameras can one Jetson AGX Orin watch?"** Select the device, set the
image size your cameras send, and read Max Cameras. Set the
minimum cameras slider to the number you need to see only the configurations
that keep up.

**"Is 1080p worth it?"** Switch the image size and watch Max Cameras, or open a
row: its chart has one line per image size.

**"What do quantization and the engine change?"** Hold the model and the device
fixed and compare the rows that differ in that one setting: Qwen3-VL-8B-Instruct
at Q8_0 and Q4_K_M on Jetson AGX Orin, or Qwen3-VL-4B-Instruct under llama.cpp
and vLLM on RTX PRO 6000. Changing the number of cameras shows how the gap
develops under load.

**"We already own this hardware; what can we run on it?"** Start with the device
filter, sort the remaining models by size or by Max Cameras, and narrow with the
response time or the number of cameras you need.

</div>
</details>

<details class="bt-howto">
<summary>What the numbers mean and how they are calculated</summary>
<div class="bt-howto-body" markdown="1">

### How the numbers were measured

Each request carries one or more photos and the prompt *Describe the scene.*,
and asks for up to 128 tokens. The photos are sixteen fixed pictures, cycled
through the requests and scaled to 854×480 (480p), 1280×720 (720p), 1920×1080
(1080p) and 2560×1440 (2K), sent as base64 images through the OpenAI-compatible
chat API. Hugging Face checkpoints were served with vLLM and GGUF files with
llama.cpp.

Every combination of image size, images per request and number of cameras is
measured on its own, after a warm-up batch that is discarded. The figures are
means of the requests that completed; a request that failed during the
benchmark is left out of the mean and does not count against a configuration.

- **Several cameras** were measured with one image per request at 480p, 720p
  and 1080p: 1, 2 and 4 cameras on Jetson Orin NX (up to 8 for one
  configuration), up to 8 on Jetson AGX Orin and up to 16 on RTX PRO 6000, with
  8 requests per level on a Jetson and 24 on RTX PRO 6000, never more cameras'
  requests in flight than the level.
- **One camera** was measured at all four sizes with one, three and five images
  per request, 5 requests each (3 for one configuration). 2K and several images
  per request were measured this way only.

A **token** is the unit a model reads and writes, about three quarters of an
English word. An image is read as tokens too, and a larger image becomes more of
them.

### Response time

**Response time** is how long a camera waits until its answer starts — the time
to first token (TTFT), in seconds. For a vision-language model this is mostly
reading the images, so it grows with their size and number, and with the number
of cameras sharing the device. How much it grows with size depends on the model:
some turn every image into a fixed number of tokens, others into more tokens the
more pixels there are. Lower is better.

**TPS (tokens per second)** is how fast the answer is then written, per camera.
It barely depends on the image, and it is shown for reference: Max Cameras is
decided by the response time. A long answer adds its writing time on top — 128
tokens at 25 tokens per second take about five more seconds.

### Max Cameras: the number of cameras is the concurrency

A camera sends its next request as soon as the previous one is answered, so it
always has exactly one request in flight. The number of concurrent requests is
therefore the number of cameras.

Max Cameras is the highest **measured** number of cameras at which the response
time meets your target. Only measured numbers count,
nothing is interpolated, and if none passes it is 0. It depends on your target
and moves with it: at 720p with one image per camera, Cosmos3-Edge on Jetson AGX
Orin keeps up with 2 cameras at 1 second and 8 — the highest number measured,
so 8+ — at 3 seconds.

### The columns that describe the setup

**Parameters** — the model's total number of weights, vision encoder included,
as published. For a mixture-of-experts model this is the total, not the part
active for each token, because all of it is held in memory.

**Quantization** — the number format the weights are stored in. BF16 is full
precision, FP8 uses 8 bits and NVFP4 4 bits. Q8_0, Q4_K_M and Q4_0 are GGUF
formats for llama.cpp with about 8 and 4 bits per weight. Fewer bits means less
memory and usually more speed, at some risk to quality.

**Engine** — the server software that loads the model and schedules requests.
It affects speed as much as the hardware does. Qwen3-VL-4B-Instruct on RTX PRO
6000 at 720p starts answering a single camera after 0.25 s under llama.cpp
(Q8_0) and 0.16 s under vLLM (BF16); at 16 cameras the gap is 1.09 s against
0.46 s.

**Device** — Jetson Orin NX (16 GB) and Jetson AGX Orin (32 GB) are embedded
modules whose CPU and GPU share one memory; RTX PRO 6000 Blackwell is a
workstation GPU with 96 GB, measured in its 600 W Workstation and 300 W Max-Q
editions.

### What the numbers do not tell you

The table uses one fixed workload — sample photos, a short prompt, answers of up
to 128 tokens — and mean values, so that configurations can be compared without
a site survey. It is **not a substitute for a test with your own cameras and
prompts**: other image content, longer prompts or answers, other engine settings
and the slowest requests rather than the mean all change real capacity. The
response time is the wait until the answer starts; an application that needs
the whole answer waits for its writing time too, and a row measured with one
camera only says nothing about how it behaves with several.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/vlm-benchmark-table.css">

<div data-vlmbt-src="/assets/data/vlm-benchmarks.json"
     data-vlmbt-logo="/assets/images/benchmark-logo.png"></div>

{% include benchmark-jsonld.html kind="vlm" %}
{% include vlm-benchmark-explained.html %}

<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1"></script>
<script src="/assets/js/vlm-benchmark-table.js"></script>
