# Custom Engine VLM benchmark data store

The data behind the [Cordatus Custom Engine VLM Benchmark Explorer](https://whitepapers.openzeka.com/custom-engine-vlm-benchmarks/),
laid out like the CV store next to it: a folder per device, a file per VLM
server measured on that device.

```
index.json                       default target and frames, the camera source, models, and every device with its files
jetson-agx-thor/
├── device.json                  name, product, GPU, memory, L4T / JetPack, CUDA
└── <vlm>.json                   one row of the Explorer: the VLM server, the pipeline settings and,
                                 per frames per request ("auto", "1", "2" …), the measurements keyed by camera count
asus-ascent-gx10/ …
```

The Explorer fetches `index.json` and the files it names; a browser cannot list
a directory, which is why the index exists.

**Do not edit these files by hand.** They are written by the benchmark tool
(`custom-engine-vlm-benchmark`), which keeps the raw monitor events behind every
number:

```bash
python3 -m benchmark.export_explorer \
        --out-dir /path/to/white-papers/assets/data/custom-engine-vlm-benchmarks \
        --vlm-device "<VLM label>=<the server's device name on this site>" \
        --sets <set id> …          # or leave out for every sweep; --dry-run to look first
```

A file's path is its permanent page: `<device>/<vlm>.json` →
`/custom-engine-vlm-benchmarks/<device>/<vlm>/` in every language, built by
`_plugins/benchmark-pages.rb`. Renaming a published file breaks its links.

## What a measurement is

```json
"sweeps": {
  "auto": {
    "points":   { "32": { "cameras": 32, "interval_s": 2.18, "interval_slowest_s": 2.30, … } },
    "failures": { "40": { "cameras": 40, "reason": "cameras_not_ready", "started": 39, "ready_timeout_s": 900 } }
  }
}
```

- **A point** is one camera count measured to the end with every camera
  answering. `interval_slowest_s` — the slowest camera's mean time between two
  answers — is what the Explorer holds against the target. The rest describe the
  same window: the engine on the device (`engine_cpu_pct`, 100 = one core;
  `engine_ram_mb_per_camera`; `tap_fps`, frames reaching the engine per camera
  per second) and the VLM server (`vlm_*`, from its Prometheus metrics).
  `vlm_other_traffic_pct` is the share of requests the server answered for
  other clients in that window: it was a shared server.
- **A failure** is a camera count at which some, but not all, cameras started
  within the ready timeout. The Explorer closes the sweep with it. A count where
  no camera started at all was an engine fault, not a measurement, and is not
  published.
- A count that missed the 3 s target was measured a second time; the second
  measurement is the one kept. A sweep stops at the first count that misses
  3 s (`sweep_target_s`), so counts above it were never measured.

Each point carries the sweep it came from (`run`), so it can be traced back to
`data/results/<run>/` in the benchmark tool. Re-exporting the same results
changes nothing; a newer measurement of the same frames and camera count
replaces the old one.
