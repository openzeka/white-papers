---
title: Device Advisor
nav_order: 7
lang: en
page_id: device-advisor
date: 2026-10-06 16:00:00 +0300
card_tag: "Device Advisor"
description: >-
  Describe your cameras and pick a vision-language model, and this page names
  the smallest device we have measured that keeps up — then plays the stream
  back as a live timeline, so you can see how often each camera is answered
  and how many of its frames the model ever sees.
permalink: /device-advisor/
last_modified_date: 2026-10-06
toc: false
---

# Device Advisor

Say how many cameras you have, how large their images are, and which
vision-language model you want to run. This page answers with the smallest
device we have measured that keeps up, and then plays that answer back: one
lane per camera, a band for every request, and the frames piling up in between.

Nothing is running behind it. The timeline is a projection of measurements
already published on this site, drawn at wall-clock speed.

<details class="bt-howto">
<summary>How to read this page</summary>
<div class="bt-howto-body" markdown="1">

### What you choose

**Model** — the vision-language model you want to run. Only models we have
measured appear.

**Image size** — how large an image each camera sends: 480p, 720p, 1080p or 2K.
This is the single biggest lever on this page. A vision-language model spends
most of its wait reading the image, so going from 720p to 1080p can cost more
than changing the device.

**Cameras** — how many cameras send requests at the same moment. Each camera
sends its next request as soon as the previous one is answered, so the number
of cameras is also the number of requests in flight.

Under *More options* are three more: how many frames each request carries, how
long a camera may wait for its answer to start, and the cameras' own frame rate.
The last one does not change any measurement — it is what turns "one request
every four seconds" into "the model sees one frame in eighty".

### What the numbers mean

**Answer starts after** is the measured time to first token: how long a camera
waits before its answer begins to arrive. This is the figure the target is
checked against, and the one that decides the recommendation.

**Answer every** adds the time to write the answer, so it is the full round
trip — and therefore how often a given camera is looked at.

**Frames the model sees** compares that round trip against what the camera
captured in the meantime. It is the number people tend to be surprised by: a
camera streaming 20 frames a second, answered every four seconds, has had
eighty frames go past for each one the model read.

### Why that device

Devices that meet your target are listed first, **smallest first** — the useful
recommendation is the least hardware that does the job, not the fastest machine
in the lab. Devices that miss the target follow, closest first, so a near miss
is visible rather than hidden. Click any of them to play its flow instead.

A card marked *est.* was interpolated: the sweep was measured at 1, 2, 4, 8 and
16 cameras, and your number falls between two of them. Nothing is extrapolated
past the highest count a configuration was actually tested at — the camera
slider stops where the measurements do.

### What the timeline shows

Each camera's lane is split in two. The **upper row** is one band per request,
spanning the whole of it, labelled with how long it took. A line inside the band
divides it into the two halves of that time:

- **Dark, up to the line** — the wait until the first token, the measured TTFT.
  At one camera this is the model reading the images: decoding them, running the
  vision encoder, and prefilling over the resulting tokens. With several cameras
  most of it is the request queueing behind the others, which is why this part
  grows with the camera count even though the images have not changed.
- **Light, after the line** — writing the rest of the answer: 128 tokens at the
  measured token rate.

Bands sit end to end, because the camera sends its next request the instant the
previous answer is complete — the device never idles. The **lower row** is the
same span of time seen from the camera: the frames piling up for the *next*
request. The arrow between them marks the moment frames are picked and handed to
the model.

The two rows share an x-axis on purpose. Request N's processing and request
N+1's collection genuinely happen over the same seconds, and that simultaneity
is the whole reason the camera sees so little of what it captured.

Two things in the picture are not measurements, and both are cosmetic: the
lanes are spread across one cycle rather than starting in lockstep, and each
lane's timing varies by a few percent around the measured mean. The figures
above the timeline are the means themselves, untouched.

### What this is not

The measurements behind this page use one fixed workload — sample photos, a
short prompt, answers of up to 128 tokens — and mean values. Your own cameras,
prompts and answer lengths will differ, and the slowest requests matter more in
production than the mean does. Treat the result as a shortlist, not a capacity
plan. The underlying figures, and every caveat attached to them, are on the
[VLM Inference Benchmark Explorer](/vlm-inference-benchmarks/).

</div>
</details>

<link rel="stylesheet" href="/assets/css/benchmark-table.css">
<link rel="stylesheet" href="/assets/css/device-advisor.css">

<div data-da-src="/assets/data/vlm-benchmarks.json" data-da-lang="en"></div>

<script src="/assets/js/device-advisor.js"></script>
