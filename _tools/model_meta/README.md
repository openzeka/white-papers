# Model metadata

The Hugging Face data behind the capacity columns of the LLM Inference Benchmark
Explorer. Every KV-cache field and every weight size in
`assets/data/benchmarks.json` is derived from these files by
`_tools/kv_geometry.py`; `_tools/validate.py` recomputes each one and fails on
a mismatch. **Do not edit anything here by hand** — fetch it again.

```
models/<model>/config.json       the model's config.json, byte-identical to Hugging Face
models/<model>/model.json        repo, pinned revision, sha256 of config.json, HF model info
checkpoints/<org>--<name>.json   a checkpoint a run served: pinned revision, files and sizes,
                                 declared quantization
runs/<row-id>/models.json        the benchmark tool's record of what that run served
```

`<model>` is the table's display name, lower-cased with runs of other characters
turned into `-` (`Kimi K3` → `kimi-k3`). One folder per model, shared by all its
rows. The config comes from the model's publisher — the unquantized release — so
every quantized copy of that model uses the same architecture description.

One checkpoint file per served repo. Its size is the sum of the repo's top-level
`.safetensors` files at the pinned revision; that is the `weights_gb` of every
row whose `served_repo` names it. A row whose checkpoint is not on Hugging Face
has `served_repo: null` and falls back to parameter count × bytes per parameter.

`runs/` holds the result folder's `models.json` for rows added with
`bench_import.py add --folder`; the validator checks it names the row's
`served_repo`, and warns when its `owned_by` disagrees with the row's engine.

## Commands

```bash
python3 _tools/kv_geometry.py fetch-model "<model>" <publisher/repo>   # new model
python3 _tools/kv_geometry.py fetch-checkpoint <served/repo>           # new served checkpoint
python3 _tools/kv_geometry.py record-run <row-id> <result-folder>      # keep a run's models.json
python3 _tools/kv_geometry.py apply                                    # regenerate benchmarks.json fields
python3 _tools/kv_geometry.py verify [--online]                        # check these files
```

`--revision <commit>` on either fetch pins an older revision. `verify` checks
every sha256 and size offline; `--online` also confirms Hugging Face still
serves the same bytes at the pinned revisions. Gated repositories need
`HF_TOKEN` in the environment.
