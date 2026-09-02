#!/usr/bin/env python3
"""
Validate assets/data/benchmarks.json before publishing.

    python3 _tools/validate.py [path]

That file feeds two live websites from a single commit — this repo's benchmark
page and openzeka.com, which fetches it cross-origin — so a typo here becomes a
wrong number on two public pages with nothing in between to catch it.

Exit code 0 = safe to publish, 1 = errors found.
Warnings do not fail the run, but each one is a thing a visitor will notice.

Kept out of the build: Jekyll ignores paths beginning with an underscore.
"""

import json
import re
import sys
from collections import Counter, defaultdict

PATH = sys.argv[1] if len(sys.argv) > 1 else "assets/data/benchmarks.json"

KNOWN_DEVICES = {
    "Thor",
    "1× DGX Spark", "2× DGX Spark", "3× DGX Spark",
    "4× DGX Spark", "8× DGX Spark",
    "RTX PRO 6000", "DGX B300",
}

REQUIRED = ["id", "model", "device", "quantization", "engine",
            "mtp", "tp", "dp", "pp", "data_points"]

# The two Artificial Analysis columns. Required so a new entry cannot ship with
# the cells simply absent — `null` is the way to say "AA publishes no score",
# and the widget renders that as an em dash. Refresh them with
# `_tools/aa_index_fetch.py`, which fills both or leaves them alone.
AA_INDEXES = ["intelligence_index", "agentic_index"]

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def main():
    try:
        with open(PATH, encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        print(f"error: {PATH} not found — run this from the repository root")
        return 1
    except json.JSONDecodeError as exc:
        print(f"error: {PATH} is not valid JSON\n  line {exc.lineno}, column {exc.colno}: {exc.msg}")
        return 1

    cfg = data.get("config", {})
    entries = data.get("benchmarks", [])
    if not entries:
        print("error: no benchmarks found")
        return 1

    for key in ("ttft_threshold_ms", "tps_threshold", "chat_multiplier", "agentic_multiplier"):
        if key not in cfg:
            warn(f"config is missing '{key}' — the widget will fall back to its built-in default")

    ttft_max = cfg.get("ttft_threshold_ms", 1000)
    tps_min = cfg.get("tps_threshold", 20)

    # Must stay identical to meetsTargets() in assets/js/benchmark-table.js:
    # both bounds inclusive, so a run landing exactly on a threshold is judged
    # the same way here as it is in the table.
    def meets(p):
        return (p.get("ttft_ms") is not None
                and p["ttft_ms"] <= ttft_max
                and (p.get("tps") or 0) >= tps_min)

    # ---- per-entry checks -------------------------------------------------
    for e in entries:
        eid = e.get("id", "<no id>")

        for field in REQUIRED:
            if field not in e:
                err(f"{eid}: missing required field '{field}'")

        if e.get("device") not in KNOWN_DEVICES:
            err(f"{eid}: unknown device {e.get('device')!r} — it will sort last "
                f"in the filter row. Known values: {', '.join(sorted(KNOWN_DEVICES))}")

        for field in AA_INDEXES:
            if field not in e:
                err(f"{eid}: missing '{field}' — use null if Artificial Analysis "
                    f"publishes no score, or run _tools/aa_index_fetch.py")
            elif not isinstance(e[field], (int, float, type(None))) \
                    or isinstance(e[field], bool):
                err(f"{eid}: {field} is {e[field]!r} — must be a number or null")

        q = e.get("quantization", "")
        if q and q != q.upper():
            err(f"{eid}: quantization {q!r} is not uppercase — lowercase values "
                f"sort after every uppercase one in the filter row (use {q.upper()!r})")

        pts = e.get("data_points", [])
        if not pts:
            err(f"{eid}: has no data_points")
            continue

        cs = [p.get("c") for p in pts]
        if cs != sorted(cs):
            err(f"{eid}: data_points are not in ascending order of c — {cs}")
        if len(cs) != len(set(cs)):
            err(f"{eid}: duplicate concurrency values in data_points — {cs}")

        for p in pts:
            if p.get("tps") is None:
                err(f"{eid}: C={p.get('c')} has no tps value")
            for field in ("tps", "ttft_ms"):
                v = p.get(field)
                if v is not None and (not isinstance(v, (int, float)) or v < 0):
                    err(f"{eid}: C={p.get('c')} has invalid {field}={v!r}")

        if len(pts) == 1:
            warn(f"{eid}: single data point (C={cs[0]}) — Max C, Chat and Agentic "
                 f"capacity are computed from one measurement and are not meaningful")

        # Parallelism recorded in prose but not in a field the table can render.
        # "…faster than PP=3" describes a *different* run, so ignore comparisons.
        notes = e.get("notes") or ""
        for tag, field in (("PP=", "pp"), ("DP=", "dp")):
            describes_this_run = re.search(r"(?<!than )\b" + tag, notes)
            if describes_this_run and e.get(field) is None:
                warn(f"{eid}: notes say {tag}… but '{field}' is null — the column "
                     f"will render blank")

        m = re.match(r"(\d+)× DGX Spark", e.get("device", ""))
        if m:
            nodes = int(m.group(1))
            product = (e.get("tp") or 1) * (e.get("dp") or 1) * (e.get("pp") or 1)
            if product != nodes:
                warn(f"{eid}: tp×dp×pp = {product} but device says {nodes} nodes")

    # ---- duplicate ids ----------------------------------------------------
    for eid, n in Counter(e.get("id") for e in entries).items():
        if n > 1:
            err(f"duplicate id {eid!r} appears {n} times — deep links (#{eid}) "
                f"will target the wrong row")

    # ---- rows that render identically -------------------------------------
    groups = defaultdict(list)
    for e in entries:
        groups[(e.get("model"), e.get("device"), e.get("quantization"),
                e.get("engine"), bool(e.get("mtp")),
                e.get("tp"), e.get("dp"), e.get("pp"))].append(e.get("id"))
    for key, ids in groups.items():
        if len(ids) > 1:
            err(f"these rows are indistinguishable in the table but show different "
                f"numbers — {', '.join(ids)}. Set tp/dp/pp or add notes so a reader "
                f"can tell them apart.")

    # ---- Max C computed across a failed concurrency level ------------------
    for e in entries:
        pts = sorted(e.get("data_points", []), key=lambda p: p.get("c", 0))
        flags = [(p.get("c"), meets(p)) for p in pts]
        passing = [c for c, ok in flags if ok]
        if not passing:
            continue
        shown = max(passing)
        contiguous = 0
        for c, ok in flags:
            if not ok:
                break
            contiguous = c
        if contiguous != shown:
            failed = [c for c, ok in flags if not ok and c < shown]
            warn(f"{e['id']}: table will show Max C={shown} "
                 f"(Chat={int(shown * cfg.get('chat_multiplier', 4))}) but the run "
                 f"FAILS at C={failed}. Usually a TTFT outlier in the source data — "
                 f"verify before publishing.")

    # ---- TTFT that falls as concurrency rises ------------------------------
    # The root cause behind most "Max C above a failed level" warnings: TTFT
    # should climb with load, so a sharp drop means the sweep was not measured
    # under equivalent conditions (cold first run, different prompt length).
    for e in entries:
        pts = [p for p in sorted(e.get("data_points", []), key=lambda p: p.get("c", 0))
               if p.get("ttft_ms") is not None]
        for a, b in zip(pts, pts[1:]):
            if b["ttft_ms"] < a["ttft_ms"] * 0.7:
                warn(f"{e['id']}: TTFT falls from {a['ttft_ms']:.0f} ms at C={a['c']} to "
                     f"{b['ttft_ms']:.0f} ms at C={b['c']} — TTFT should rise with load, "
                     f"so this sweep was probably not measured under equivalent conditions")

    # ---- precision that was assumed rather than recorded -------------------
    # A quantization label the source run never stated still appears in the
    # Quantization column, and BF16 vs FP8 is exactly the comparison the page
    # invites readers to make.
    assumed = sorted(e["id"] for e in entries
                     if e.get("quantization") == "BF16"
                     and "bf16" not in e.get("id", "").lower())
    if assumed:
        warn(f"{len(assumed)} entries are labelled BF16 without the source run having "
             f"recorded a precision — the column presents an assumption as a "
             f"measurement: {', '.join(assumed[:4])}{' …' if len(assumed) > 4 else ''}")

    # ---- report -----------------------------------------------------------
    print(f"{PATH}: {len(entries)} entries\n")

    if errors:
        print(f"ERRORS ({len(errors)}) — fix before publishing")
        for m in errors:
            print(f"  ✗ {m}")
        print()

    if warnings:
        print(f"WARNINGS ({len(warnings)}) — check these are intentional")
        for m in warnings:
            print(f"  ! {m}")
        print()

    if not errors and not warnings:
        print("✓ all checks passed")
    elif not errors:
        print("✓ no errors — safe to publish")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
