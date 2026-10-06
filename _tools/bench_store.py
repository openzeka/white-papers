"""The LLM and VLM benchmark data stores, read and written in one place.

Both explorers keep their data the way the CV explorer does — a folder per
device, a file per result, and an index that says what exists:

    assets/data/llm-benchmarks/                assets/data/vlm-benchmarks/
    ├── index.json      shared settings + what exists
    ├── <device>/
    │   ├── device.json the device's own facts
    │   └── <run id>.json   one run (one row of the explorer)

The explorers and openzeka.com read one combined file per explorer —
/assets/data/benchmarks.json and /assets/data/vlm-benchmarks.json — which the
site build assembles from these folders (_plugins/bench_store.rb, the same
rules as load_llm() / load_vlm() here). Those two URLs must never change.

Every tool goes through this module: load_*() returns the combined document,
exactly as the build serves it; save_*() writes a combined document back to
the folders (index, device files, run files) and removes the file of a run
that is no longer in it.
"""
import io
import json
import os
import re
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LLM_DIR = os.path.join(ROOT, "assets", "data", "llm-benchmarks")
VLM_DIR = os.path.join(ROOT, "assets", "data", "vlm-benchmarks")


def slug(s):
    """'4× DGX Spark' -> '4x-dgx-spark' — the device folder, and the device part
    of a run's permanent URL."""
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower().replace("×", "x")).strip("-")


def _read(path):
    with io.open(path, encoding="utf-8") as fh:
        return json.load(fh, object_pairs_hook=OrderedDict)


def _write(path, obj, compact_points=False):
    text = json.dumps(obj, ensure_ascii=False, indent=2)
    if compact_points:
        # One measured cell per line.
        text = re.sub(r"\{\n\s+(\"res\":[^{}\[\]]*?)\n\s+\}",
                      lambda m: "{" + re.sub(r",\n\s+", ", ", m.group(1)) + "}", text)
    text += "\n"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        with io.open(path, encoding="utf-8") as fh:
            if fh.read() == text:
                return
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def _runs(base, index):
    for dev in index["devices"]:
        for run in dev["runs"]:
            yield dev, _read(os.path.join(base, run["path"]))


def _prune(base, keep, slugs):
    """Remove the run files the index no longer lists, and the folder of a
    device that has no run left. Nothing else in the store is touched."""
    for d in os.listdir(base):
        p = os.path.join(base, d)
        if not os.path.isdir(p):
            continue
        for f in os.listdir(p):
            if f.endswith(".json") and (d not in slugs or (f != "device.json" and f"{d}/{f}" not in keep)):
                os.remove(os.path.join(p, f))
        if not os.listdir(p):
            os.rmdir(p)


def _device_order(index_path, rows):
    """Devices in the index's order, then any new device in order of first use."""
    order = [d["name"] for d in _read(index_path)["devices"]] if os.path.exists(index_path) else []
    for r in rows:
        if r["device"] not in order:
            order.append(r["device"])
    return [d for d in order if any(r["device"] == d for r in rows)]


# ── LLM ──────────────────────────────────────────────────────────────────

def load_llm(base=LLM_DIR):
    """The combined document: attribution, config, memory, benchmarks."""
    index = _read(os.path.join(base, "index.json"))
    devices = [_read(os.path.join(base, d["path"])) for d in index["devices"]]
    mem = index["memory"]
    for d in devices:
        twin = next((x for x in devices if x["base"] == d["base"]), d)
        if (twin["memory_gb"], twin["unified"]) != (d["memory_gb"], d["unified"]):
            raise ValueError(f"{d['name']} and {twin['name']} are the same {d['base']} but their device.json "
                             "files disagree on memory_gb or unified — fix one of them")
    gb = OrderedDict(sorted({d["base"]: d["memory_gb"] for d in devices}.items()))
    unified = sorted({d["base"] for d in devices if d["unified"]})
    memory = OrderedDict()
    for k, v in mem.items():
        memory[k] = v
        if k == "note":
            memory["memory_gb"], memory["unified_memory"] = gb, unified
    return OrderedDict([("attribution", index["attribution"]), ("config", index["config"]),
                        ("memory", memory), ("benchmarks", [r for _, r in _runs(base, index)])])


def save_llm(doc, base=LLM_DIR):
    rows = doc["benchmarks"]
    index_path = os.path.join(base, "index.json")
    mem = doc["memory"]
    devices = []
    for name in _device_order(index_path, rows):
        dslug = slug(name)
        m = re.match(r"^(\d+)×\s*(.+)$", name)
        units, dbase = (int(m.group(1)), m.group(2)) if m else (1, name)
        info = OrderedDict([("name", name), ("base", dbase), ("units", units),
                            ("memory_gb", (mem.get("memory_gb") or {}).get(dbase)),
                            ("unified", dbase in (mem.get("unified_memory") or []))])
        _write(os.path.join(base, dslug, "device.json"), info)
        runs = []
        for r in rows:
            if r["device"] == name:
                path = f"{dslug}/{r['id']}.json"
                _write(os.path.join(base, path), r)
                runs.append(OrderedDict([("id", r["id"]), ("model", r["model"]), ("path", path)]))
        devices.append(OrderedDict([("name", name), ("slug", dslug), ("path", f"{dslug}/device.json"),
                                    ("runs", runs)]))
    index = OrderedDict([
        ("attribution", doc["attribution"]), ("config", doc["config"]),
        ("memory", OrderedDict((k, v) for k, v in mem.items() if k not in ("memory_gb", "unified_memory"))),
        ("devices", devices)])
    _write(index_path, index)
    _prune(base, {run["path"] for d in devices for run in d["runs"]}, {d["slug"] for d in devices})


# ── VLM ──────────────────────────────────────────────────────────────────

def load_vlm(base=VLM_DIR):
    """The combined document: source, config, workload, devices, models, benchmarks."""
    index = _read(os.path.join(base, "index.json"))
    devices = OrderedDict()
    for d in index["devices"]:
        info = _read(os.path.join(base, d["path"]))
        devices[d["name"]] = OrderedDict([("name", info["product"]), ("memory_gb", info["memory_gb"]),
                                          ("unified", info["unified"])])
    out = OrderedDict()
    for k in ("source", "config", "workload"):
        if k in index:
            out[k] = index[k]
    out["devices"] = devices
    out["models"] = index["models"]
    out["benchmarks"] = [r for _, r in _runs(base, index)]
    return out


def save_vlm(doc, base=VLM_DIR):
    rows = doc["benchmarks"]
    index_path = os.path.join(base, "index.json")
    devices = []
    for name in _device_order(index_path, rows):
        dslug = slug(name)
        info = doc["devices"][name]
        _write(os.path.join(base, dslug, "device.json"),
               OrderedDict([("name", name), ("product", info["name"]), ("memory_gb", info["memory_gb"]),
                            ("unified", info["unified"])]))
        runs = []
        for r in rows:
            if r["device"] == name:
                path = f"{dslug}/{r['id']}.json"
                _write(os.path.join(base, path), r, compact_points=True)
                runs.append(OrderedDict([("id", r["id"]), ("model", r["model"]), ("path", path)]))
        devices.append(OrderedDict([("name", name), ("slug", dslug), ("path", f"{dslug}/device.json"),
                                    ("runs", runs)]))
    index = OrderedDict((k, doc[k]) for k in ("source", "config", "workload") if k in doc)
    index["models"] = doc["models"]
    index["devices"] = devices
    _write(index_path, index)
    _prune(base, {run["path"] for d in devices for run in d["runs"]}, {d["slug"] for d in devices})
