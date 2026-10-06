#!/usr/bin/env python3
"""Import the VLM benchmark tool's export into the VLM data store (assets/data/vlm-benchmarks/).

    python3 _tools/vlm_import.py <export.json>             # adds or updates its runs
    python3 _tools/vlm_import.py <export.json> --check     # reports, writes nothing
    python3 _tools/vlm_import.py <export.json> --replace   # rebuilds the file from this export only

<export.json> is the tool's results export: {"generated", "metrics", "runs":
[...], "system_info"}. Every configuration is two runs: "<tag>" (one camera,
image sizes x images per request) and "<tag>_conc" (one image per request,
image sizes x number of cameras). Both become one row whose data_points list
every measured cell: image size, images per request, cameras.

By default the runs of <export.json> are merged into the store: a run with the
same id is replaced, every other run is kept. An export usually
holds only the new runs, so --replace (which drops every row not in the export)
is only for rebuilding the whole file from one complete export.

Only public facts are kept. The export also carries host addresses, GPU slots,
container inventories and disk contents; none of it is copied. A device or
model not in the tables below stops the import rather than being guessed:
add it here first. Then run python3 _tools/validate_vlm.py.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench_store  # noqa: E402  (same folder; the VLM data store)
SIZES = ["480p", "720p", "1080p", "2K"]

# The export's device string starts with the product; the rest (address, GPU
# slot) is lab detail. name = shown in the explorer; full = the product.
DEVICES = [
    ("Jetson Orin NX 16 GB", "Jetson Orin NX", "orinnx",
     {"name": "Jetson Orin NX 16GB", "memory_gb": 16, "unified": True}),
    ("Jetson AGX Orin 32 GB", "Jetson AGX Orin", "agxorin",
     {"name": "Jetson AGX Orin Developer Kit", "memory_gb": 32, "unified": True}),
    ("RTX PRO 6000 Blackwell Max-Q", "RTX PRO 6000 Max-Q", "rtxpro6000maxq",
     {"name": "RTX PRO 6000 Blackwell Max-Q Workstation Edition", "memory_gb": 96, "unified": False}),
    ("RTX PRO 6000 Blackwell Workstation", "RTX PRO 6000", "rtxpro6000",
     {"name": "RTX PRO 6000 Blackwell Workstation Edition", "memory_gb": 96, "unified": False}),
]

# The export's model string -> (name shown, publisher repo, parameters as
# published, served checkpoint when it is a repackaging). A model also in the
# LLM explorer keeps that explorer's name and parameter figure.
MODELS = {
    "Qwen3-VL-4B-Instruct": ("Qwen3-VL-4B-Instruct", "Qwen/Qwen3-VL-4B-Instruct", "4.4B", None),
    "Qwen3-VL-8B-Instruct": ("Qwen3-VL-8B-Instruct", "Qwen/Qwen3-VL-8B-Instruct", "8.8B", None),
    "Qwen3-VL-30B-A3B-Instruct": ("Qwen3-VL-30B-A3B-Instruct", "Qwen/Qwen3-VL-30B-A3B-Instruct", "30B", None),
    "Qwen3.5-4B": ("Qwen3.5-4B", "Qwen/Qwen3.5-4B", "4.7B", None),
    "Qwen3.6-35B-A3B": ("Qwen3.6-35B-A3B", "Qwen/Qwen3.6-35B-A3B", "35B", None),
    "nvidia/Qwen3.6-35B-A3B-NVFP4": ("Qwen3.6-35B-A3B", "Qwen/Qwen3.6-35B-A3B", "35B", "nvidia/Qwen3.6-35B-A3B-NVFP4"),
    "Qwen3.8-27B": ("Qwen3.8-27B", "Qwen/Qwen3.8-27B", "27B", None),
    "gemma-4-26B-it": ("Gemma-4-26B-A4B-it", "google/gemma-4-26B-A4B-it", "26B", None),
    "gemma-4-31B-it": ("Gemma-4-31B-it", "google/gemma-4-31B-it", "31B", None),
    "nvidia/Gemma-4-31B-IT-NVFP4": ("Gemma-4-31B-it", "google/gemma-4-31B-it", "31B", "nvidia/Gemma-4-31B-IT-NVFP4"),
    "gemma-4-E4B-it": ("Gemma-4-E4B-it", "google/gemma-4-E4B-it", "8.0B", None),
    "gemma-4-E2B-it": ("Gemma-4-E2B-it", "google/gemma-4-E2B-it", "5.1B", None),
    "medgemma-1.5-4b-it": ("MedGemma-1.5-4B-it", "google/medgemma-1.5-4b-it", "4.3B", None),
    "nvidia/Cosmos-Reason1-7B": ("Cosmos-Reason1-7B", "nvidia/Cosmos-Reason1-7B", "8.3B", None),
    "nvidia/Cosmos-Reason2-2B": ("Cosmos-Reason2-2B", "nvidia/Cosmos-Reason2-2B", "2.4B", None),
    "Cosmos-Reason2-8B": ("Cosmos-Reason2-8B", "nvidia/Cosmos-Reason2-8B", "8.8B", None),
    "nvidia/Cosmos-Reason2-8B": ("Cosmos-Reason2-8B", "nvidia/Cosmos-Reason2-8B", "8.8B", None),
    "nvidia/Cosmos3-Edge": ("Cosmos3-Edge", "nvidia/Cosmos3-Edge", "3.9B", None),
    "nvidia/Cosmos3-Nano": ("Cosmos3-Nano", "nvidia/Cosmos3-Nano", "16B", None),
    "nvidia/Eagle2.5-8B": ("Eagle2.5-8B", "nvidia/Eagle2.5-8B", "8.1B", None),
    "nvidia/Llama-3.1-Nemotron-Nano-VL-8B-V1": ("Llama-3.1-Nemotron-Nano-VL-8B", "nvidia/Llama-3.1-Nemotron-Nano-VL-8B-V1", "8.7B", None),
    "nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL": ("Nemotron-Nano-12B-v2-VL", "nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL-BF16", "13B", None),
}

ADDRESS = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b")


def device_of(s):
    for prefix, name, code, info in DEVICES:
        if s.startswith(prefix):
            return name, code, info
    sys.exit(f"unknown device {ADDRESS.sub('<address>', s)!r}: add it to DEVICES in {__file__}")


def platform_of(s):
    m = re.search(r"L4T (R[\d.]+)", s)
    return f"L4T {m.group(1)}" if m else None


def engine_of(s):
    """('llama.cpp', '6d78fb0') or ('vLLM', '0.28.0'), and the public settings."""
    s = ADDRESS.sub("", s)
    if s.startswith("llama.cpp"):
        name, m = "llama.cpp", re.match(r"llama\.cpp (\S+)", s)
    elif s.startswith("vLLM"):
        name, m = "vLLM", re.match(r"vLLM (\d[\d.]*)", s)
    else:
        sys.exit(f"unknown engine {s!r}")
    return name, m.group(1) if m else None


def settings_of(run, conc):
    """The serving settings worth stating publicly, as a short note."""
    text = " ".join([run["engine"], run["quant"], (conc or {}).get("engine", "")])
    notes = []
    if "GGUF" in run["quant"]:
        notes.append("GGUF weights")
    if re.search(r"--no-cache-prompt|no prompt cache|prefix cache off", text):
        notes.append("prompt cache off")
    if "enable_thinking false" in text:
        notes.append("thinking off")
    m = re.search(r"(\d+) parallel slots", (conc or {}).get("engine", ""))
    if m:
        notes.append(f"{m.group(1)} parallel slots")
    elif "parallel slots = max concurrency" in (conc or {}).get("engine", ""):
        notes.append("parallel slots = cameras")
    m = re.search(r"max-num-seqs (\d+)", text)
    if m:
        notes.append(f"max-num-seqs {m.group(1)}")
    if "vllm-omni" in text:
        notes.append("vLLM-Omni image")
    if "cuda-compat-orin" in text or "compat driver" in text:
        notes.append("CUDA 13.2 compatibility driver on JetPack 6.2")
    if "nvidia-ai-iot/vllm" in text:
        notes.append("NVIDIA Jetson vLLM container")
    return "; ".join(notes) or None


def cells(run):
    out = {}
    for p in run.get("perf") or []:
        if p.get("Error"):
            continue
        key = (p["Resolution"], p["Images/Req"], p["Concurrency"])
        out[key] = {"res": p["Resolution"], "images": p["Images/Req"], "c": p["Concurrency"],
                    "ttft_s": round(p["TTFT Mean (ms)"] / 1000, 3), "tps": p["TPS Mean"],
                    "requests": p["Valid"] + p["Failed"], "failed": p["Failed"]}
    return out


def slug(s):
    return re.sub(r"[^a-z0-9.]+", "-", s.lower()).strip("-")


def build(doc):
    runs = {r["tag"]: r for r in doc["runs"]}
    rows, models, devices = [], {}, {}
    for tag, run in runs.items():
        if tag.endswith("_conc"):
            continue
        conc = runs.get(tag + "_conc")
        if run["model"] not in MODELS:
            sys.exit(f"unknown model {run['model']!r}: add it to MODELS in {__file__}")
        name, repo, params, served = MODELS[run["model"]]
        dev, code, info = device_of(run["device"])
        devices[dev] = info
        models[name] = {"repo": repo, "params": params}
        quant = run["quant"].split()[0]
        engine, version = engine_of(run["engine"])
        pts = cells(run)
        pts.update(cells(conc) if conc else {})  # the camera sweep wins where both measured a cell
        rows.append({
            "id": f"{slug(name)}_{code}_{quant.lower().replace('_', '')}_{engine.replace('.', '').lower()}",
            "model": name, "device": dev, "quantization": quant, "engine": engine,
            "engine_version": version, "platform": platform_of(run["device"]),
            "served_repo": served, "notes": settings_of(run, conc),
            "data_points": [pts[k] for k in sorted(pts, key=lambda k: (SIZES.index(k[0]), k[1], k[2]))],
        })
    ids = [r["id"] for r in rows]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        sys.exit(f"two runs map to the same id: {dup}")
    order = [d[1] for d in DEVICES]
    rows.sort(key=lambda r: (r["model"].lower(), order.index(r["device"]), r["quantization"], r["engine"]))
    return {
        "source": {"tool": "VLM Benchmark Tool", "exported": doc.get("generated")},
        "config": {"response_target_s": 3, "images": 1},
        "workload": {"prompt": "Describe the scene.", "max_tokens": 128, "photos": 16,
                     "sizes": {"480p": "854×480", "720p": "1280×720", "1080p": "1920×1080", "2K": "2560×1440"}},
        "devices": {d[1]: devices[d[1]] for d in DEVICES if d[1] in devices},
        "models": dict(sorted(models.items(), key=lambda kv: kv[0].lower())),
        "benchmarks": rows,
    }


def merge(old, new):
    """The existing file with the export's rows added or replaced, by id."""
    rows = {r["id"]: r for r in old.get("benchmarks", [])}
    added = [r["id"] for r in new["benchmarks"] if r["id"] not in rows]
    replaced = [r["id"] for r in new["benchmarks"] if r["id"] in rows]
    rows.update({r["id"]: r for r in new["benchmarks"]})
    order = [d[1] for d in DEVICES]
    out = dict(old)
    out["source"] = new["source"]
    out["devices"] = {d: {**old.get("devices", {}), **new["devices"]}[d] for d in order
                      if d in {**old.get("devices", {}), **new["devices"]}}
    out["models"] = dict(sorted({**old.get("models", {}), **new["models"]}.items(), key=lambda kv: kv[0].lower()))
    out["benchmarks"] = sorted(rows.values(), key=lambda r: (r["model"].lower(), order.index(r["device"]),
                                                            r["quantization"], r["engine"]))
    return out, added, replaced


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("export")
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    ap.add_argument("--replace", action="store_true", help="drop every row not in this export")
    a = ap.parse_args()
    data = build(json.load(open(a.export, encoding="utf-8")))
    print(f"export: {len(data['benchmarks'])} runs, "
          f"{sum(len(r['data_points']) for r in data['benchmarks'])} measured cells")
    for r in data["benchmarks"]:
        print(f"  {r['id']}  ({r['model']} · {r['device']} · {r['quantization']} · {r['engine']}"
              f"{' · ' + r['notes'] if r['notes'] else ''})")
    store = os.path.relpath(bench_store.VLM_DIR)
    if os.path.exists(os.path.join(bench_store.VLM_DIR, "index.json")) and not a.replace:
        data, added, replaced = merge(bench_store.load_vlm(), data)
        print(f"merged into {store}: {len(added)} added, {len(replaced)} replaced, "
              f"{len(data['benchmarks'])} rows in all")
        for i in added:
            print(f"  + {i}")
    if not a.check:
        bench_store.save_vlm(data)
        print(f"wrote {store}")


if __name__ == "__main__":
    main()
