#!/usr/bin/env python3
"""Validate the VLM Inference Benchmark Explorer's data store (assets/data/vlm-benchmarks/).

    python3 _tools/validate_vlm.py          # exit 0 = safe to publish; warnings do not fail

Nothing in the site build checks this file, so run this before committing a
change to it. It checks the shape the widget (assets/js/vlm-benchmark-table.js)
and the build (_plugins/visibility.rb, _plugins/benchmark-pages.rb) rely on,
and reports Max Cameras at the default target with the same rule they use:
response time = TTFT, a cell passes when it is within the target (inclusive)
(failed requests do not count: the means are over the requests that
completed); Max Cameras is the highest passing number of cameras
(concurrency). Change the three together.
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench_store  # noqa: E402  (same folder; the VLM data store)
SIZES = ["480p", "720p", "1080p", "2K"]
ROW_KEYS = ["id", "model", "device", "quantization", "engine", "engine_version", "platform",
            "served_repo", "notes", "data_points"]
POINT_KEYS = ["res", "images", "c", "ttft_s", "tps", "requests", "failed"]
ID_RE = re.compile(r"^[a-z0-9.\-]+_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$")

errors, warnings = [], []


def err(msg): errors.append(msg)
def warn(msg): warnings.append(msg)


def meets(p, cfg):
    return p["ttft_s"] <= cfg["response_target_s"]


def main():
    d = bench_store.load_vlm()
    cfg = {"response_target_s": 3}
    cfg.update(d.get("config") or {})
    if not isinstance(cfg["response_target_s"], (int, float)) or cfg["response_target_s"] <= 0:
        err("config.response_target_s must be a positive number")

    devices, models = d.get("devices") or {}, d.get("models") or {}
    for name, dev in devices.items():
        for k in ("name", "memory_gb", "unified"):
            if k not in dev:
                err(f"devices[{name}] has no {k}")
    for name, m in models.items():
        if not m.get("repo"):
            err(f"models[{name}] has no repo")
        if not isinstance(m.get("params"), str) or not re.match(r"^\d+(\.\d+)?[BMT]$", m["params"]):
            err(f"models[{name}].params must read like '8.8B', got {m.get('params')!r}")

    ids, used_models = set(), set()
    open_rows, zero_rows = 0, 0
    for i, r in enumerate(d.get("benchmarks") or []):
        rid = r.get("id", f"#{i}")
        if list(r.keys()) != ROW_KEYS:
            err(f"{rid}: keys must be exactly, in order, {ROW_KEYS}; got {list(r.keys())}")
        if not ID_RE.match(str(r.get("id", ""))):
            err(f"{rid}: id must be <model>_<device>_<quantization>_<engine>, lower case")
        if rid in ids:
            err(f"{rid}: duplicate id")
        ids.add(rid)
        if r.get("model") not in models:
            err(f"{rid}: model {r.get('model')!r} is not in models")
        used_models.add(r.get("model"))
        if r.get("device") not in devices:
            err(f"{rid}: device {r.get('device')!r} is not in devices")
        dp = r.get("data_points") or []
        if not dp:
            err(f"{rid}: no measurement")
        cells = {}
        for p in dp:
            if list(p.keys()) != POINT_KEYS:
                err(f"{rid}: point keys must be {POINT_KEYS}, got {list(p.keys())}")
                continue
            where = f"{rid} {p['res']} ×{p['images']} C={p['c']}"
            if p["res"] not in SIZES or not isinstance(p["images"], int) or not isinstance(p["c"], int):
                err(f"{where}: res must be one of {SIZES}, images and c whole numbers")
            if (p["res"], p["images"], p["c"]) in cells:
                err(f"{where}: measured twice")
            cells[(p["res"], p["images"], p["c"])] = p
            if not (p["ttft_s"] > 0 and p["tps"] > 0):
                err(f"{where}: ttft_s and tps must be positive")
            if (p["requests"] is None) != (p["failed"] is None):
                err(f"{where}: requests and failed are recorded together or not at all")
            elif p["requests"] is not None and not 0 <= p["failed"] <= p["requests"]:
                err(f"{where}: failed must be between 0 and requests")
            if p["failed"]:
                warn(f"{where}: {p['failed']} of {p['requests']} requests failed — the mean is over the {p['requests'] - p['failed']} that completed")
        if any(v["requests"] is None for v in cells.values()):
            warn(f"{rid}: some cells have no request count (imported from a one-at-a-time grid)")
        for (res, n) in sorted({(k[0], k[1]) for k in cells}):
            pts = sorted((v for k, v in cells.items() if k[0] == res and k[1] == n), key=lambda v: v["c"])
            ttfts = [p["ttft_s"] for p in pts]
            if any(b < a * 0.8 for a, b in zip(ttfts, ttfts[1:])):
                warn(f"{rid} {res} ×{n}: response time falls by more than 20% as cameras are added {ttfts} — a measurement to recheck")
            if (res, n) == ("720p", 1):
                mc = max([p["c"] for p in pts if meets(p, cfg)], default=0)
                if mc == 0:
                    zero_rows += 1
                elif mc == pts[-1]["c"]:
                    open_rows += 1
    for name in models:
        if name not in used_models:
            warn(f"models[{name}] is used by no row")

    for w in warnings:
        print("  !", w)
    for e in errors:
        print("  ✗", e)
    n = len(d.get("benchmarks") or [])
    print(f"\n{n} rows, {len(models)} models. At the default target ({cfg['response_target_s']} s, "
          f"720p, 1 image per camera): {open_rows} rows met it at their highest level (shown with +), "
          f"{zero_rows} keep up with no camera.")
    if errors:
        print(f"✗ {len(errors)} error(s)")
        return 1
    print("✓ no errors — safe to publish")
    return 0


if __name__ == "__main__":
    sys.exit(main())
