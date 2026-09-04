#!/usr/bin/env python3
"""Import a benchmark-tool result folder into assets/data/benchmarks.json.

    python3 _tools/bench_import.py inspect <folder>      # what the folder tells us
    python3 _tools/bench_import.py add <entry.json>      # insert a finished entry

Driven by .claude/skills/add-benchmark/SKILL.md. `inspect` reads only what the
tool actually recorded and lists what a human still has to supply; it never
guesses a number. `add` writes the entry with the canonical field order and the
file's exact formatting, so the diff is only the new entry.

Nothing here judges the data — run `python3 _tools/validate.py` afterwards.
"""
import argparse, csv, glob, json, os, re, sys
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "assets/data/benchmarks.json")

# The on-disk key order, identical in all existing entries. Keep it: a reordered
# entry produces a needlessly large diff and hides the real change.
FIELDS = ["id", "model", "params", "intelligence_index", "agentic_index",
          "device", "quantization", "engine", "mtp", "mtp_k", "tp",
          "notes", "sources", "data_points", "dp", "pp"]

# Only these three CSV columns reach the table. The tool also emits p50/p90 for
# TTFT, ITL, TPS and Latency plus Throughput (RPS); the table has no field for
# any of them, so they are read and dropped rather than invented into the JSON.
CSV_C    = "Concurrency"
CSV_TTFT = "TTFT (Mean, ms)"
CSV_TPS  = "TPS (Mean, tokens/s)"

DEVICE_SLUG = {
    "Thor": "thor", "1× DGX Spark": "1spark", "2× DGX Spark": "2spark",
    "3× DGX Spark": "3spark", "4× DGX Spark": "4spark", "8× DGX Spark": "8spark",
    "RTX PRO 6000": "rtxpro6000", "DGX B300": "b300",
}
QUANTS = ["NVFP4", "MXFP4", "MXFP8", "INT4", "AWQ", "FP16", "FP8", "BF16", "FP4"]
ENGINE_BY_OWNER = {"vllm": "vLLM", "sglang": "SGLang"}


def load_data():
    with open(DATA, encoding="utf-8") as fh:
        return json.load(fh, object_pairs_hook=OrderedDict)


def write_data(doc):
    """Byte-identical formatting to what is on disk: 2-space indent, real UTF-8
    (the device names contain '×'), one trailing newline."""
    with open(DATA, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")


def num(s):
    s = (s or "").strip()
    if s in ("", "-", "n/a", "N/A", "null", "None"):
        return None
    return float(s)


def read_csv(folder):
    hits = sorted(glob.glob(os.path.join(folder, "*-table.csv"))) \
        or sorted(glob.glob(os.path.join(folder, "*.csv")))
    if not hits:
        sys.exit(f"no CSV in {folder} — expected a '*-table.csv' from the benchmark tool")
    path = hits[0]
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        sys.exit(f"{path} has a header but no rows")
    missing = [c for c in (CSV_C, CSV_TTFT, CSV_TPS) if c not in rows[0]]
    if missing:
        sys.exit(f"{path} is missing column(s) {missing}.\n"
                 f"  columns found: {list(rows[0])}\n"
                 f"  If the tool's header changed, update CSV_C/CSV_TTFT/CSV_TPS here "
                 f"and the mapping table in the skill.")
    pts, dropped = [], sorted(set(rows[0]) - {CSV_C, CSV_TTFT, CSV_TPS})
    for r in rows:
        c = num(r[CSV_C])
        if c is None:
            continue
        pts.append(OrderedDict(c=int(c),
                               ttft_ms=num(r[CSV_TTFT]),
                               tps=num(r[CSV_TPS])))
    pts.sort(key=lambda p: p["c"])
    return path, pts, dropped


def read_models_json(folder):
    path = os.path.join(folder, "models.json")
    if not os.path.exists(path):
        return None, {}
    try:
        with open(path, encoding="utf-8") as fh:
            d = json.load(fh)
        row = (d.get("data") or [{}])[0]
    except Exception as exc:
        return path, {"_error": str(exc)}
    return path, {"repo": row.get("id"), "owned_by": row.get("owned_by"),
                  "max_model_len": row.get("max_model_len")}


def shortpath(p):
    r = os.path.relpath(p, ROOT)
    return r if not r.startswith("..") else os.path.abspath(p)


def norm_model(name):
    """'Kimi K3' -> 'KIMI-K3'. Folds only separators and case."""
    return re.sub(r"[\s_]+", "-", (name or "").strip()).upper()


# Suffixes the serving repo adds that are not part of the model's identity.
SUFFIXES = QUANTS + ["MTP", "INSTRUCT", "IT", "CHAT", "THINKING", "REASONING", "HF"]


def strip_suffixes(repo):
    """'Inferact/GLM-5.3-NVFP4' -> 'GLM-5.3'. Peels trailing quantization and
    variant tokens so the stem can be compared exactly to a model name."""
    stem = norm_model((repo or "").split("/")[-1])
    changed = True
    while changed:
        changed = False
        for suf in SUFFIXES:
            if stem.endswith("-" + suf):
                stem, changed = stem[: -len(suf) - 1], True
    return stem


def guess(repo, folder):
    """Only from strings the tool wrote. Every guess is presented for
    confirmation, never written unattended."""
    hay = f"{repo or ''} {os.path.basename(os.path.abspath(folder))}".upper()
    quant = next((q for q in QUANTS if q in hay), None)
    mtp = "MTP" in re.sub(r"[^A-Z]", "", hay) and "MTP" in hay
    return quant, mtp


def cmd_inspect(a):
    folder = a.folder
    csv_path, pts, dropped = read_csv(folder)
    mj_path, mj = read_models_json(folder)
    repo = mj.get("repo")
    quant, mtp_hint = guess(repo, folder)

    doc = load_data()
    entries = doc["benchmarks"]
    cfg = doc.get("config", {})

    print(f"CSV         {shortpath(csv_path)}")
    print(f"models.json {shortpath(mj_path) if mj_path else '(absent)'}")
    if repo:
        print(f"  repo          {repo}")
        print(f"  owned_by      {mj.get('owned_by')}  -> engine guess: "
              f"{ENGINE_BY_OWNER.get(str(mj.get('owned_by')).lower(), '(unknown)')}")
        print(f"  max_model_len {mj.get('max_model_len')}")
    print()
    print(f"data_points ({len(pts)} measured levels, from the Mean columns only)")
    for p in pts:
        print(f"  C={p['c']:<4} ttft_ms={p['ttft_ms']:<10} tps={p['tps']}")
    if dropped:
        print(f"\n  columns present but NOT stored (no field in the table): {', '.join(dropped)}")

    # What Max C would be at the file's own default targets.
    tt, tp = cfg.get("ttft_threshold_ms", 1000), cfg.get("tps_threshold", 20)
    ok = [p["c"] for p in pts
          if p["ttft_ms"] is not None and p["ttft_ms"] <= tt and (p["tps"] or 0) >= tp]
    print(f"\nAt the file's default targets (TTFT<={tt}ms, TPS>={tp}): "
          f"Max C = {max(ok) if ok else 0}"
          f"{'' if ok else '  (no measured level passes)'}")
    if len(pts) == 1:
        print("  NOTE single measured level — the validator will warn that capacity "
              "figures come from one data point.")

    # Does this model already exist? Then params and both indexes are settled.
    # Matched exactly, never by substring: "GLM-5.3-NVFP4" contains "GLM-5" as
    # well as "GLM-5.3", and reusing the wrong row's AA indexes would publish a
    # wrong capability score for the model.
    stem = strip_suffixes(repo) if repo else None
    exact = [e for e in entries if stem and norm_model(e["model"]) == stem]
    names = sorted({e["model"] for e in exact})
    print()
    if len(names) == 1:
        e = exact[0]
        print(f"MODEL ALREADY IN THE FILE as {e['model']!r} ({len(exact)} row(s))")
        print(f"  params             {e['params']}")
        print(f"  intelligence_index {e['intelligence_index']}")
        print(f"  agentic_index      {e['agentic_index']}")
        print("  -> Reuse all three verbatim. Both indexes are properties of the")
        print("     model, not the run, so do NOT ask the user and do NOT re-fetch.")
    elif len(names) > 1:
        print(f"AMBIGUOUS: {stem!r} matches more than one model: {names}")
        print("  -> Ask the user which one. Do not pick.")
    else:
        near = sorted({e["model"] for e in entries
                       if stem and (norm_model(e["model"]).startswith(stem[:6])
                                    or stem.startswith(norm_model(e["model"])))})
        print(f"MODEL NOT FOUND in the file (looked for {stem!r})")
        if near:
            print(f"  similar existing names, NOT assumed to be the same model: {near}")
        print("  -> params, intelligence_index and agentic_index must come from the user.")

    print("\nStill to be confirmed by the user (none of it is in the folder):")
    print(f"  device        required, exactly one of: {', '.join(DEVICE_SLUG)}")
    print(f"  quantization  guess from the name: {quant or '(none)'}")
    print(f"  engine        guess from owned_by: "
          f"{ENGINE_BY_OWNER.get(str(mj.get('owned_by')).lower(), '(unknown)')}")
    print(f"  mtp / mtp_k   name {'suggests MTP' if mtp_hint else 'does not mention MTP'}")
    print("  tp / dp / pp  parallelism actually used")
    if len(names) != 1:
        print("  params, intelligence_index, agentic_index  (model not resolved above)")
    print("  notes         optional; unverified sibling results belong here")
    return 0


def cmd_add(a):
    with open(a.entry, encoding="utf-8") as fh:
        entry = json.load(fh)

    unknown = [k for k in entry if k not in FIELDS]
    missing = [k for k in FIELDS if k not in entry]
    if unknown:
        sys.exit(f"unknown field(s) {unknown} — the table has no column for them.\n"
                 f"  Allowed: {FIELDS}")
    if missing:
        sys.exit(f"missing field(s) {missing} — every entry carries all 16 keys "
                 f"(use null where a value does not apply)")

    doc = load_data()
    entries = doc["benchmarks"]
    if any(e["id"] == entry["id"] for e in entries):
        sys.exit(f"id {entry['id']!r} already exists — deep links (#id) must be unique")

    ordered = OrderedDict((k, entry[k]) for k in FIELDS)
    ordered["data_points"] = [OrderedDict(c=int(p["c"]), ttft_ms=p.get("ttft_ms"),
                                          tps=p.get("tps"))
                              for p in sorted(entry["data_points"],
                                              key=lambda p: int(p["c"]))]

    # Keep rows for one model together: insert after the last sibling, else append.
    idx = max((i for i, e in enumerate(entries) if e["model"] == ordered["model"]),
              default=None)
    if idx is None:
        entries.append(ordered)
        where = f"appended as entry {len(entries)} (new model)"
    else:
        entries.insert(idx + 1, ordered)
        where = f"inserted at position {idx + 2}, after the last {ordered['model']!r} row"

    write_data(doc)
    print(f"added {ordered['id']}\n  {where}\n  {len(entries)} entries total")
    print("\nNow run:  python3 _tools/validate.py")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("inspect", help="report what a result folder contains")
    i.add_argument("folder")
    i.set_defaults(fn=cmd_inspect)
    d = sub.add_parser("add", help="insert a finished entry JSON")
    d.add_argument("entry")
    d.set_defaults(fn=cmd_add)
    a = ap.parse_args()
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
