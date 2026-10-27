---
title: Cordatus Custom Engine VLM Benchmark Explorer
nav_order: 8
lang: en
page_id: custom-engine-vlm-benchmarks
date: 2026-10-27 12:00:00 +0300
card_tag: "Custom Engine Benchmark"
description: >-
  How many cameras can a device run through the Cordatus custom engine when a
  vision-language model on a GPU server answers them? Measured on Jetson AGX
  Thor, Jetson AGX Orin 32GB Developer Kit and ASUS Ascent GX10, for every
  number of frames sent with each question.
permalink: /custom-engine-vlm-benchmarks/
last_modified_date: 2026-10-27
toc: false
---

# Cordatus Custom Engine VLM Benchmark Explorer

How many cameras can this device take through the custom engine, and how often
does each of them get a fresh answer? Every camera runs the Cordatus Stream
Engine with `custom_engine_vlm` on the device; the engine sends its frames to a
vision-language model on a separate GPU server and asks again as soon as the
answer arrives. Pick how many frames go with each question, set how long a
camera may wait between two answers, and the table answers for every device we
have measured. Expand a row to see the full camera sweep, what the VLM server
was doing and the curve.

<details class="bt-howto">
<summary>How to use the benchmark explorer</summary>
<div class="bt-howto-body" markdown="1">

### What a row is

A row is a **device running the whole camera side of the pipeline** — the
Cordatus Stream Engine decoding every camera and `custom_engine_vlm` turning
its frames into questions — together with the **VLM server** it asks: one
model, in one number format, served by one engine on one GPU. The VLM does not
run on the device. Every device on this page asked the same server, so between
their rows the device is the only thing that changes.

### How the numbers were measured

Every figure is an OpenZeka measurement, taken with the Custom Engine VLM
Benchmark tool against Cordatus Stream Engine 3.0.12 running
`custom_engine_vlm`, on Jetson AGX Thor, a Jetson AGX Orin 32GB Developer Kit
and an ASUS Ascent GX10 (GB10). The VLM server was Qwen3-VL-30B-A3B-Instruct in
FP8, served with vLLM on an RTX PRO 6000 Blackwell Workstation Edition.

Every camera is the **same 720p H.264 street clip at 15 FPS**, replayed over
RTSP from the device itself, one stream per camera. The engine takes four
frames per second from each camera, scaled to 960 pixels wide, decodes on the
CPU, and sends the frames as JPEG with the prompt *Describe the scene in one
sentence.* Alarms are off. Each camera has one question in flight: the next
one leaves as soon as the answer to the last one is back.

Each configuration is swept across increasing camera counts — 1, 4, 8 and 16,
then some of 24, 32, 40, 48, 64 and 128, depending on the device. For each count the
tool starts the cameras, waits until every one of them delivers frames, lets
the pipeline settle, then reads the engine's own record of every question and
answer for **60 seconds** (120 seconds for the ASUS Ascent GX10 with automatic
frames). The VLM server's metrics and the device's CPU and memory are read over
the same window.

A sweep stops at the first camera count that misses 3 seconds. Most counts
that missed it were measured a second time, and the second measurement is the
one shown. A count at which not every camera came up within the time allowed
closes the sweep as a failure. A count at which no camera came up at all was
an engine fault rather than a measurement, and is left out.

### What the parameters mean

**Interval** — how long a camera waits between two answers, on average,
measured on the engine's own clock. The table shows it for the *slowest*
camera at that count, and that is the figure held against your target: it says
how stale the newest answer about any one camera can get. The mean over all
cameras is in the expanded row. Lower is better.

**Frames per request** — how many video frames go with each question. *Auto*
is the engine's own choice: up to three for this prompt, fewer when fewer new
frames have arrived since the last answer, so it rises from about 1.5 at one
camera to 3 once answers slow down. A number fixes it; when not enough new
frames have arrived, the engine fills the request from the frames it keeps.
More frames give the model more to see and make every request heavier — the
prompt grows from about 500 tokens at one frame to about 4,000 at eight.

**Cameras** — the camera count the row's numbers were measured at: the heaviest
load measured at or below the camera limit in the filter panel.

**Answers / min** — answers the engine received per minute, all cameras
together. Where it stops growing as cameras are added, the chain has reached its
limit.

**Engine CPU** — the CPU the stream engine and the custom engine use together,
in cores: 1.0 is one core fully busy. Decoding every camera and preparing every
request runs here, which is why it grows with the camera count. **RAM /
camera** is the engine's memory divided by the cameras. The engine uses no GPU
memory on the device.

**On the VLM server** — per request: prompt and output tokens, the time to the
first token, the time spent queued, the KV cache in use, the most requests
running at once, and the share of the server's requests that came from other
clients in the same window — it was a shared server. The server's figures
cover all of its requests, so at one or a few cameras, where that share is
largest, they are mixed with the other clients'. When requests start to queue,
the server is the limit; when they do not and the interval still grows, the
device is.

### 1. Pick the frames per request

The frames choice in the filter panel decides which sweep every row reports, so
that rows are only compared at the same frames. It opens on *Auto*. The
**Frames per request** table in an expanded row lists every frames count for
that device with its own Max cameras; picking a row there switches the whole
table to it.

### 2. Set the camera limit

The slider is an upper bound, not a selection. It hides everything measured
above it, and every row then reports the heaviest load it was measured at up to
that number. Set it to the number of cameras you plan to run.

### 3. Set your target interval

The target is the longest a camera may wait between two answers, on average,
for you to call it kept up with. It opens with every expanded row and is one
value for the whole table. The default is **3 seconds**, and the bound is
inclusive. Changing it re-evaluates the status of every measurement, the
colouring of Interval and Max cameras.

### 4. Read Max cameras

**Max cameras** is the highest *measured* camera count at which the slowest
camera still meets your target, with no request failing, up to the camera
limit. Nothing is extrapolated, and it is not a promise about the counts
between two measurements. A **+** beside it means the highest count measured
still met the target, so the real limit is higher. When even one camera misses
the target, the column shows the target in red.

Because the sweeps stopped at the first count that missed 3 seconds, a looser
target can only be checked up to that count; the **+** marks where that cuts a
figure short.

<div class="bt-howto-example" markdown="1">
**Example.** With automatic frames, Jetson AGX Thor answers every one of 32
cameras within 2.30 s, so Max cameras is 32 at the default 3 s target. At 40
cameras only 39 came up within 900 seconds, which closes the sweep. Fix the
frames at 4 and the limit falls to 24 (2.84 s), and at 8 frames to 8 (1.25 s)
— every extra frame is paid for in cameras.
</div>

### 5. Open a row for the detail

The whole row is clickable. Opening one shows the camera sweep with the
interval, the slowest camera, the request time, the frames actually sent, the
frames reaching the engine, the engine's CPU and memory and the device's CPU,
each count marked against your target; then the same counts from the VLM
server's side; the frames table; the results explained; and a chart of the
interval and the answers per minute against the camera count, with your target
as a dashed line. The hardware and software versions and the benchmark runs
behind the row are listed at the end.

### Where to start

**"We need 16 cameras answered at least every 2 seconds — which device?"** Set
the camera limit to 16 and the target to 2 s, and sort by Interval. Every row
that reads 16 cameras in green answers yes.

**"How many frames can we afford?"** Open a device's row and read the frames
table: it shows how Max cameras falls as each question carries more frames.

**"Is the device or the VLM server the limit?"** Open the row and compare the
two tables. On the Jetson devices the interval grows while the server still
has no request waiting — the device is the limit there. On the ASUS Ascent GX10
with one or two frames, the server runs 32 requests at once and queues the
rest from 64 cameras on: there the server is the limit.

### What this does not tell you

The table uses one fixed workload — one clip, a one-sentence prompt, alarms off
— so that devices can be compared without a site survey. It is **not a
substitute for a test with your own cameras and prompts**. Cameras at another
resolution or frame rate change the decoding load; alarm mode, longer prompts
or longer answers change the request; and a VLM server shared with other work,
or a different one, changes everything on the server's side. The replayed
camera streams were served from the device itself, which took some of its CPU.
The VLM ran on a separate server; a device that also runs its own VLM shares
its GPU and memory with it. Each measurement is 60 seconds of steady state, so
it says nothing about behaviour over hours. And these are speed measurements
only: nothing here measures how good the answers are.

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/cv-benchmark-table.css">
<link rel="stylesheet" href="/assets/css/custom-engine-vlm-benchmark-table.css">

<div data-cevbt-src="/assets/data/custom-engine-vlm-benchmarks/index.json"></div>

<p class="bt-attribution">Every figure on this page is OpenZeka&rsquo;s own
measurement on its own hardware.</p>

{% include benchmark-jsonld.html kind="cevlm" %}
{% include custom-engine-vlm-benchmark-explained.html %}

<script src="/assets/js/custom-engine-vlm-benchmark-table.js"></script>
