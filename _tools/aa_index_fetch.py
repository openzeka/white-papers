#!/usr/bin/env python3
"""Refresh intelligence_index / agentic_index in assets/data/benchmarks.json
from the Artificial Analysis Data API.

    export AA_API_KEY=...          # free key: https://artificialanalysis.ai/data-api
    python3 _tools/aa_index_fetch.py            # dry run — prints what would change
    python3 _tools/aa_index_fetch.py --write    # applies it

Never guesses. A model it cannot resolve to exactly one AA entry is listed for a
human, with near misses, and its two fields are left untouched.

Attribution is a condition of reuse: credit "Artificial Analysis" wherever these
values are published. Their Terms of Use §3.3(vi) prohibits scraping the site, so
this API is the only supported way to refresh them.
"""
import argparse, collections, difflib, json, os, re, sys, urllib.error, urllib.request

# Verified 2026-09-02 on a free key. Do NOT substitute:
#   /api/v2/language/models   -> 403, Pro only
#   /api/v2/data/llms/models  -> 200, but carries NO agentic field at all
ROUTE = "https://artificialanalysis.ai/api/v2/language/models/free"
INTEL, AGENTIC = "artificial_analysis_intelligence_index", "artificial_analysis_agentic_index"

# Models the name matcher cannot resolve, pinned to an AA slug. Each is here
# because near-miss matching picks the wrong entry — the comment says which.
PINNED = {
    "Tencent-Hy3": "hy3",                                  # not hy3-preview, an older build
    "Nemotron-3-Ultra": "nvidia-nemotron-3-ultra-550b-a55b",
    "Muse-Glimmer-30B": "muse-glimmer",                    # AA's name carries no size; 30B is our assumption
}
# Not in AA's catalogue at all, so both fields stay null.
UNTRACKED = {"Laguna-S-2.1"}


def fetch(key):
    """Page through the whole catalogue; 200/page, 4 pages as of 2026-09-02."""
    rows, page = [], 1
    while True:
        req = urllib.request.Request(f"{ROUTE}?page={page}&page_size=200",
                                     headers={"x-api-key": key})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                p = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            hint = {401: "AA_API_KEY missing or invalid",
                    403: "this key's tier does not cover the endpoint",
                    429: "daily quota exhausted"}.get(e.code, "")
            sys.exit(f"HTTP {e.code} {e.reason}" + (f" — {hint}" if hint else ""))
        rows += p["data"]
        if not (p.get("pagination") or {}).get("has_more"):
            return rows, p.get("intelligence_index_version")
        page += 1


def base(name):
    """'Kimi K3 (max)' -> 'Kimi K3'. AA's effort suffixes are not uniform."""
    m = re.match(r"^(.*?)\s*\([^)]*\)\s*$", name)
    return m.group(1) if m else name


def norm(s):
    """Fold only what is cosmetic: case, separators, and the instruct/reasoning
    suffixes. Deliberately does NOT fold version numbers or parameter counts."""
    s = re.sub(r"\b(instruct|it|thinking|reasoning|chat)\b", " ", s.lower())
    return re.sub(r"[^a-z0-9.]+", "", s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="apply the changes")
    ap.add_argument("--data", default=os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "assets/data/benchmarks.json"))
    a = ap.parse_args()

    key = os.environ.get("AA_API_KEY")
    if not key:
        sys.exit("set AA_API_KEY (free key at https://artificialanalysis.ai/data-api)")

    raw = open(a.data, encoding="utf-8").read()
    doc = json.loads(raw, object_pairs_hook=collections.OrderedDict)
    entries = doc["benchmarks"]

    rows, version = fetch(key)
    print(f"{len(rows)} AA models, intelligence_index_version={version}", file=sys.stderr)

    by_slug = {r["slug"]: r for r in rows}
    by_name = collections.defaultdict(list)
    for r in rows:
        by_name[norm(base(r["name"]))].append(r)

    resolved, unresolved = {}, []
    for model in sorted({e["model"] for e in entries}):
        if model in UNTRACKED:
            resolved[model] = (None, None, "not tracked by AA")
            continue
        if model in PINNED:
            hit = by_slug.get(PINNED[model])
            if not hit:
                unresolved.append((model, f"pinned slug {PINNED[model]!r} no longer exists", []))
                continue
            cands = [hit]
        else:
            cands = by_name.get(norm(model), [])
        if not cands:
            near = difflib.get_close_matches(norm(model), list(by_name), n=4, cutoff=0.6)
            unresolved.append((model, "no name match", [by_name[n][0]["name"] for n in near]))
            continue
        # Where AA scores several reasoning-effort variants, take the highest.
        # Their suffixes are not uniform, so score is the only rule spanning them.
        best = max(cands, key=lambda r: r["evaluations"].get(INTEL) or -1)
        resolved[model] = (best["evaluations"].get(INTEL),
                           best["evaluations"].get(AGENTIC), best["name"])

    changes = []
    for e in entries:
        if e["model"] not in resolved:
            continue
        intel, agentic, label = resolved[e["model"]]
        if e.get("intelligence_index") != intel or e.get("agentic_index") != agentic:
            changes.append((e["id"], e.get("intelligence_index"), intel,
                            e.get("agentic_index"), agentic, label))
        new = collections.OrderedDict()
        for k, v in e.items():
            if k in ("intelligence_index", "agentic_index"):
                continue
            new[k] = v
            if k == "params":
                new["intelligence_index"] = intel
                new["agentic_index"] = agentic
        e.clear()
        e.update(new)

    got = sum(1 for e in entries if e.get("agentic_index") is not None)
    print(f"\n{len(resolved)} of {len({x['model'] for x in entries})} models resolved; "
          f"{got}/{len(entries)} entries have an Agentic Index "
          f"(AA publishes it for a minority of its catalogue).", file=sys.stderr)

    if unresolved:
        print("\nUnresolved — left untouched, pin a slug in PINNED to fix:", file=sys.stderr)
        for model, why, near in unresolved:
            print(f"  {model}: {why}" + (f"; near: {', '.join(near)}" if near else ""),
                  file=sys.stderr)

    if not changes:
        print("\nNo value changes.", file=sys.stderr)
        return
    print(f"\n{len(changes)} entries change:", file=sys.stderr)
    for eid, oi, ni, oa, na, label in changes:
        print(f"  {eid}: II {oi}->{ni}  AI {oa}->{na}   ({label})", file=sys.stderr)

    if not a.write:
        print("\nDry run. Re-run with --write to apply.", file=sys.stderr)
        return
    open(a.data, "w", encoding="utf-8").write(
        json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"\nWrote {a.data}", file=sys.stderr)


if __name__ == "__main__":
    main()
