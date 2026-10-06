# LLM benchmark data store

The data behind the [LLM Inference Benchmark Explorer](https://whitepapers.openzeka.com/llm-inference-benchmarks/),
laid out like the CV store next to it: a folder per device, a file per run.

```
index.json                 attribution, default targets, memory constants, and every device with its runs
dgx-b300/
├── device.json            name, base device, units, memory per GPU / node / module, unified or not
└── <run id>.json          one run — one row of the Explorer
1x-dgx-spark/ …
```

The site build combines it into **`/assets/data/benchmarks.json`**
(`_plugins/bench_store.rb`), the one file the Explorer fetches. openzeka.com
fetches that URL cross-origin too, so it must never move; its content is the
same as before the store was split.

**Do not edit these files by hand.** Add runs with `_tools/bench_import.py`
(procedure: `skills/add-benchmark/SKILL.md`); `_tools/kv_geometry.py apply`
and `_tools/aa_index_fetch.py` update their fields. All of them go through
`_tools/bench_store.py`, which keeps the index, the device files and the run
files in step and removes the file of a run that is no longer listed. The one
hand edit is a new device's `memory_gb` and `unified` in its `device.json`.

A run's file name is its id, and its permanent page
(`/llm-inference-benchmarks/<model>/<device>/<configuration>/`) is built from
its fields — renaming either breaks published links.

Check with `python3 _tools/validate.py`.
