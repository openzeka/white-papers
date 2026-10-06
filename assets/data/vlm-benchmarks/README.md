# VLM benchmark data store

The data behind the [VLM Inference Benchmark Explorer](https://whitepapers.openzeka.com/vlm-inference-benchmarks/),
laid out like the CV store next to it: a folder per device, a file per run.

```
index.json                 default target, workload, models, and every device with its runs
jetson-agx-orin/
├── device.json            name, product, memory, unified or not
└── <run id>.json          one run — one row of the Explorer; one data point per measured cell
rtx-pro-6000/ …
```

The site build combines it into **`/assets/data/vlm-benchmarks.json`**
(`_plugins/bench_store.rb`), the one file the Explorer fetches.

**Do not edit these files by hand.** Runs come from the VLM benchmark tool's
export through `_tools/vlm_import.py` (procedure:
`skills/add-vlm-benchmark/SKILL.md`), which writes through
`_tools/bench_store.py`. A run's file name is its id, and its permanent page
(`/vlm-inference-benchmarks/<model>/<device>/<quantization>-<engine>/`) is
built from its fields — renaming either breaks published links.

Check with `python3 _tools/validate_vlm.py`.
