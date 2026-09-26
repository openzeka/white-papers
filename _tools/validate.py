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
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kv_geometry  # noqa: E402  (same folder; regenerates the kv_* fields)

PATH = sys.argv[1] if len(sys.argv) > 1 else "assets/data/benchmarks.json"

KNOWN_DEVICES = {
    "Thor",
    "1× DGX Spark", "2× DGX Spark", "3× DGX Spark",
    "4× DGX Spark", "8× DGX Spark",
    "RTX PRO 6000", "DGX B300",
}

REQUIRED = ["id", "model", "device", "quantization", "engine",
            "mtp", "tp", "dp", "pp", "data_points",
            "kv_bytes_per_token", "kv_window_bytes", "kv_heads", "model_context_length",
            "kv_replicated_bytes_per_token", "kv_state_bytes", "served_repo", "weights_gb"]

# Properties of the model, not the run: every row for one model must carry the
# same values, exactly like params and the two AA indexes.
KV_FIELDS = ["kv_bytes_per_token", "kv_window_bytes", "kv_heads"]
MODEL_FIELDS = KV_FIELDS + ["model_context_length", "kv_replicated_bytes_per_token", "kv_state_bytes"]

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

    for key in ("ttft_threshold_ms", "tps_threshold", "chat_multiplier", "agentic_multiplier",
                "chat_context_tokens", "agentic_context_tokens", "engine_memory_discrete",
                "engine_memory_unified", "weights_kv_share"):
        if key not in cfg:
            warn(f"config is missing '{key}' — the widget will fall back to its built-in default")

    mem = data.get("memory") or {}
    mem_gb = mem.get("memory_gb") or {}
    wbytes = mem.get("weight_bytes_per_param") or {}
    unified = mem.get("unified_memory") or []
    if not mem_gb or not wbytes:
        err("the 'memory' block (memory_gb, weight_bytes_per_param) is missing — "
            "no row's memory limit could be calculated")

    def device_base(device):
        return re.sub(r"^\d+×\s*", "", device or "")

    def params_count(v):
        m = re.fullmatch(r"(\d+(?:\.\d+)?)([BT])", v or "")
        return float(m.group(1)) * (1e12 if m.group(2) == "T" else 1e9) if m else None

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

        if e.get("tp") is None:
            err(f"{eid}: tp is null — record 1 for a single GPU or node. The memory "
                f"limit reads tp as the number of devices the run used, so null "
                f"would silently mean one")

        base = device_base(e.get("device"))
        if mem_gb and base not in mem_gb:
            err(f"{eid}: device {base!r} has no entry in memory.memory_gb")
        if wbytes and e.get("quantization") not in wbytes:
            err(f"{eid}: quantization {e.get('quantization')!r} has no entry in "
                f"memory.weight_bytes_per_param — its memory limit cannot be computed")

        bpt, win, heads = (e.get(k) for k in KV_FIELDS)
        if bpt is None:
            if win is not None or heads is not None:
                err(f"{eid}: kv_bytes_per_token is null but kv_window_bytes/kv_heads "
                    f"are set — null all three for a model whose cache is not modelled")
        else:
            if not isinstance(bpt, (int, float)) or isinstance(bpt, bool) or bpt <= 0:
                err(f"{eid}: kv_bytes_per_token is {bpt!r} — must be a positive number")
            if not isinstance(win, int) or isinstance(win, bool) or win < 0:
                err(f"{eid}: kv_window_bytes is {win!r} — must be a whole number ≥ 0 "
                    f"(0 when the model has no sliding-window layers)")
            if heads is not None and (not isinstance(heads, int) or isinstance(heads, bool)
                                      or heads < 1):
                err(f"{eid}: kv_heads is {heads!r} — a positive whole number, or null "
                    f"for a cache copied to every GPU (MLA and other compressed caches)")
        mcl = e.get("model_context_length")
        if mcl is not None and (not isinstance(mcl, int) or isinstance(mcl, bool) or mcl < 1):
            err(f"{eid}: model_context_length is {mcl!r} — a whole number of tokens "
                f"(max_position_embeddings from the model's config.json), or null")

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

    # ---- model-level KV fields agree across rows ---------------------------
    by_model = defaultdict(set)
    for e in entries:
        by_model[e.get("model")].add(tuple(e.get(k) for k in MODEL_FIELDS))
    for model, vals in by_model.items():
        if len(vals) > 1:
            err(f"{model!r} rows disagree on {'/'.join(MODEL_FIELDS)}: {sorted(vals, key=str)} — "
                f"these describe the model and must match on every row")

    # ---- stored Hugging Face data is intact --------------------------------
    for problem in kv_geometry.verify(online=False):
        err(f"_tools/model_meta: {problem}")

    # ---- generated fields match what _tools/kv_geometry.py derives ----------
    # Nothing in kv_* or weights_gb is typed by hand: each value must equal what
    # the pinned config.json / checkpoint record in _tools/model_meta/ gives.
    checkpoints = kv_geometry.load_checkpoints()
    expected = {}
    for e in entries:
        model = e.get("model")
        if model not in expected:
            expected[model] = kv_geometry.expected_model_fields(model)
        g, why = expected[model]
        if g is None:
            err(f"{e.get('id')}: model {model!r} has no _tools/model_meta/models entry — run "
                f"python3 _tools/kv_geometry.py fetch-model \"{model}\" <publisher/repo>")
            continue
        stale = [k for k, v in g.items() if e.get(k) != v]
        if stale:
            err(f"{e.get('id')}: {', '.join(stale)} differ from what kv_geometry.py derives "
                f"from the model's config — run python3 _tools/kv_geometry.py apply")
        w = kv_geometry.expected_weights_gb(e, checkpoints)
        if e.get("served_repo") and w is None:
            err(f"{e.get('id')}: served_repo {e['served_repo']!r} has no _tools/model_meta/"
                f"checkpoints record — run kv_geometry.py fetch-checkpoint {e['served_repo']}")
        elif e.get("weights_gb") != w:
            err(f"{e.get('id')}: weights_gb {e.get('weights_gb')} but the checkpoint gives {w} "
                f"— run python3 _tools/kv_geometry.py apply")
        # The run's own record of what it served, where one was kept.
        run_repo = kv_geometry.run_served_repo(e.get("id"))
        if run_repo and run_repo != e.get("served_repo"):
            err(f"{e.get('id')}: served_repo is {e.get('served_repo')!r} but the run's "
                f"models.json says {run_repo!r}")
        if run_repo:
            owner = kv_geometry._load(os.path.join(kv_geometry.RUNS, e["id"], "models.json"))
            owner = str(((owner.get("data") or [{}])[0]).get("owned_by") or "").lower()
            if owner and owner != str(e.get("engine")).lower():
                warn(f"{e.get('id')}: engine is {e.get('engine')!r} but the run's models.json "
                     f"says it was served by {owner!r}")
    no_repo = [e.get("id") for e in entries if not e.get("served_repo")]
    if no_repo:
        warn(f"{len(no_repo)} row(s) record no served_repo, so their weights are estimated "
             f"as parameters × bytes per parameter: {', '.join(no_repo)}")
    unsupported = sorted({m for m, (g, why) in expected.items() if g is not None and why})
    for m in unsupported:
        warn(f"{m}: {expected[m][1]} — its rows show the speed limit alone")

    unmodelled = sorted(m for m, vals in by_model.items() if any(v[:3] == (None, None, None) for v in vals))
    if unmodelled:
        warn(f"{len(unmodelled)} model(s) have no KV-cache size, so their capacity rests "
             f"on the speed estimate alone: {', '.join(unmodelled)}")

    # ---- memory side of the capacity estimate ------------------------------
    # Must stay identical to memoryBudget() and capacity() in
    # assets/js/benchmark-table.js: both reserves come off the physical memory
    # before the weights do, and the weights split evenly over tp × pp.
    ctx_agentic = cfg.get("agentic_context_tokens", 131072)
    conflicts, short = [], []
    for e in entries:
        base = device_base(e.get("device"))
        gb, bpp = mem_gb.get(base), wbytes.get(e.get("quantization"))
        n = params_count(e.get("params"))
        total = e["weights_gb"] * 1e9 if e.get("weights_gb") is not None \
            else (n * bpp if bpp and n is not None else None)
        if e.get("kv_bytes_per_token") is None or not gb or total is None:
            continue
        tp, pp = e.get("tp") or 1, e.get("pp") or 1
        alloc = cfg.get("engine_memory_unified", 0.8) if base in unified \
            else cfg.get("engine_memory_discrete", 0.95)
        budget = gb * 1e9 * alloc * cfg.get("weights_kv_share", 0.8)
        weights = total / (tp * pp)
        if weights >= budget:
            conflicts.append(f"{e['id']} ({weights / 1e9:.0f} GB of weights per device "
                             f"against {budget / 1e9:.0f} GB)")
        mcl = e.get("model_context_length")
        if mcl is not None and mcl < ctx_agentic:
            short.append(f"{e['id']} (context window {mcl} tokens)")
    if conflicts:
        warn(f"{len(conflicts)} rows' weights exceed the assumed memory budget, so their "
             f"capacity rests on the speed estimate alone — usually offloading, or a "
             f"params or quantization label that does not match what actually ran: "
             f"{'; '.join(conflicts)}")
    if short:
        warn(f"{len(short)} rows' models have a context window shorter than the default "
             f"agentic context ({ctx_agentic}), so their agentic capacity shows a dash: "
             f"{'; '.join(short)}")

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
                e.get("tp"), e.get("dp"), e.get("pp"),
                # the notes show in the expanded row, so rows that differ
                # there (e.g. 300K vs 1M context) can be told apart
                (e.get("notes") or "").strip())].append(e.get("id"))
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
