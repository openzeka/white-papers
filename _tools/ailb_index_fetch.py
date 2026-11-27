#!/usr/bin/env python3
"""Refresh intelligence_index in the LLM data store (assets/data/llm-benchmarks/)
from ai-leaderboard.dev.

    python3 _tools/ailb_index_fetch.py            # dry run: prints what would change
    python3 _tools/ailb_index_fetch.py --write    # applies it

How it works, and why:

ai-leaderboard.dev has no API. Its page is a JavaScript application whose data
(every model with its per-benchmark scores and their sources) is embedded in one
script file. This tool downloads that file, reads the data, and computes the
Intelligence Index itself with the method below, a copy of the site's own
calculation. Only the raw scores come from the site; the formula is pinned here
(METHOD), so our numbers stay consistent with each other even when the site
changes its layout or its method. Every run recomputes every row from one
snapshot of the site.

Intelligence Index = 60% Agentic Coding Index + 40% Scientific Knowledge Index.
Missing benchmark scores are imputed from the scores a model does have
(regressions between benchmarks across all models), then corrected by the
site's model-ordering rules, and each sub-index is scaled to an anchor model.

Never guesses. Models are matched by display name only. A model with no
match gets null (a dash) and is listed with its near misses; if one of them is
the same model under another name, a human pins it in PINNED.

Checks that stop the tool (nothing is written):
  - too few models parsed, or an anchor model missing;
  - a PINNED id is no longer on the site;
  - the site's published Agentic Coding Index values (its default view, read
    with headless Chrome) disagree with ours computed from the same data —
    the site changed its method or our copy is wrong — or, with Chrome
    installed, could not be read after three tries. --accept-drift writes
    anyway after a human has looked at the message. With no Chrome at all the
    comparison is skipped with a note.
"""
import argparse, collections, datetime, decimal, json, math, os, re, shutil, subprocess, sys
import tempfile, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench_store  # noqa: E402  (same folder; the LLM data store)

SITE = "https://www.ai-leaderboard.dev/"
UA = "Mozilla/5.0 (X11; Linux x86_64) benchmark-index-refresh"

# ── The method, pinned. Copied from the site's script, 26 November 2026. ──────
METHOD = "ai-leaderboard.dev method as of 2026-11-26"
AGENTIC_WEIGHTS = collections.OrderedDict([
    ("terminalbench-v4", 16), ("deepswe-v1-1", 15), ("swebench-pro", 7.5),
    ("frontiercode-2-0", 11), ("code-migration", 9), ("sre-bench", 8),
    ("code-arena-elo", 6.5), ("programbench", 6), ("vibe-code", 5.5),
    ("terminalbench-v2-1", 8.5), ("scicode", 4), ("livecodebench", 3)])
AGENTIC_ANCHOR, AGENTIC_ANCHOR_VALUE, AGENTIC_FALLBACK = "gpt-6-astra", 90.9, 1.34771489
KNOWLEDGE_WEIGHTS = collections.OrderedDict([
    ("hle-diamond", 25), ("gdpval-aa", 18), ("terminal-bench-science", 17), ("scicode", 13),
    ("critpt-v2", 12), ("automationbench", 10), ("gpqa-diamond", 5)])
KNOWLEDGE_ANCHOR, KNOWLEDGE_ANCHOR_VALUE, KNOWLEDGE_FALLBACK = "claude-opus-5-5", 81.0, 1.13286713
HLE_BRIDGE = "humanitys-last-exam"          # stands in when HLE-Diamond is missing
HARD = {"hle-diamond", "critpt-v2", "terminal-bench-science"}
SPLIT = (60, 40)                            # agentic, knowledge
MIN_MODELS = 150                            # fewer parsed models means the parser broke

# Our model name -> the site's model id, where name matching cannot decide.
PINNED = {
    "DeepSeek-V4-Pro": "deepseek-v4-pro-0424",             # the April model; the site's id
    "DeepSeek-V4-Pro-0813": "deepseek-v4-pro",              #   deepseek-v4-pro is the 0813 one
    "Kimi K3": "kimi-k3",                                   # not kimi-k3-low
    "MiMo-V2.6-Pro-RL": "mimo-v2-6-pro",                    # same model; the site has no -RL
    "MiMo-V2.6-Pro-MOPD": "mimo-v2-6-pro",                  # same model; the site has no -MOPD
    "Muse-Glimmer-30B": "muse-glimmer",                     # the site's name carries no size
    "Mistral-Large-4-1T-A52B": "mistral-large-4",
    "NVIDIA-Nemotron-3.5-Bolt-74B-A9B": "nemotron-3-5-bolt-74b-a9b",
    "NVIDIA-Nemotron-3.5-Super-VL-120B-A12B": "nemotron-3-5-super-vl",
    "Tencent-Hy3": "hy3",
    "Tencent-Hy4-flash": "hy4-flash",
    "Tencent-Hy4-preview": "hy4-preview",                   # not hy4, the release
}
# Only a different model is on the site: never matched, the field stays null.
# MiMo-V2.6-Flash-RL: "MiMo v2.6 Flash" is not this model (decided 2026-10-01).
# Qwen3-235B-A22B: the site has only the July 2507 update, a different checkpoint.
UNTRACKED = {"MiMo-V2.6-Flash-RL", "Qwen3-235B-A22B"}


# ── Reading the site ─────────────────────────────────────────────────────────

def http(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def script_url(home):
    m = re.findall(r'src="(/assets/index-[\w-]+\.js)"', home)
    if len(m) != 1:
        sys.exit(f"STOP: expected one /assets/index-*.js script on {SITE}, found {len(m)} — "
                 "the site's structure changed; a human has to look")
    return SITE.rstrip("/") + m[0]


NUM = r"-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?"


def parse(js):
    """The data the method needs, read from the site's script."""
    starts = [m.start() for m in re.finditer(
        r"\{id:`[^`]+`,name:`[^`]+`,shortName:`[^`]+`,provider:`", js)]
    models = []
    for i, st in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else st + 20000
        ch = js[st:end]
        sc = re.search(r"scores:\{", ch)
        if not sc:
            continue
        depth, j = 0, sc.end() - 1
        for j in range(sc.end() - 1, len(ch)):
            depth += {"{": 1, "}": -1}.get(ch[j], 0)
            if depth == 0:
                break
        body = ch[sc.end():j]
        scores = {}
        for k, v in re.findall(r'"?([\w.-]+)"?:\[(' + NUM + r'),`', body):
            scores[k] = float(v)
        for k, v in re.findall(r'"?([\w.-]+)"?:(' + NUM + r')(?=[,}]|$)', body):
            scores.setdefault(k, float(v))
        head = ch[:sc.start()]
        g = lambda k: (re.search(k + r":`([^`]*)`", head) or [None, None])[1]
        tail = ch[j:j + 400]
        models.append({"id": g("id"), "name": g("name"), "license": g("license"),
                       "released": "isReleased:!1" not in tail, "scores": scores})
    bench_avg = {m.group(1): float(m.group(2)) for m in re.finditer(
        r"\{id:`([\w.-]+)`,name:`[^`]*`,shortName:`[^`]*`,category:`[^`]*`,description:`[^`]*`,"
        r"metricName:`[^`]*`,unit:`[^`]*`,maxScore:" + NUM + r",minScore:" + NUM +
        r",isPercentage:![01],avgScore:(" + NUM + r")", js)}
    rules = re.findall(r"\{superior:`([\w.-]+)`,inferior:`([\w.-]+)`", js)
    aliases = {}
    m = re.search(r"\{superior:`[^}]*\}\],(\w+)=\{", js)
    if m:
        body = js[m.end():js.index("}", m.end())]
        aliases = dict(re.findall(r'"?([\w.-]+)"?:`([\w.-]+)`', body))
    trend = re.search(r"id:`trend-selection`[^]]*?modelIds:`([^`]*)`", js)
    trend = trend.group(1).split(".") if trend else []
    published = {}
    for idx, w in (("agentic-coding-index", AGENTIC_WEIGHTS), ("knowledge-index", KNOWLEDGE_WEIGHTS)):
        d = re.search(r"\{id:`" + idx + r"`,[^`]*`[^`]*`,[^`]*`[^`]*`,[^`]*`[^`]*`,description:`([^`]*)`", js)
        published[idx] = re.findall(r"\*\*([^*]+)\*\*(?:\s*\([^)%]*\))?\s*\(([\d.]+)%\)",
                                    d.group(1)) if d else None
    return {"models": models, "bench_avg": bench_avg, "rules": rules,
            "aliases": aliases, "trend": trend, "published_weights": published}


# ── The method ───────────────────────────────────────────────────────────────

def to_fixed1(x):
    """JavaScript's Number.prototype.toFixed(1): half-up on the exact binary value."""
    return float(decimal.Decimal(x).quantize(decimal.Decimal("0.1"), decimal.ROUND_HALF_UP))


def logit(x, eps=0.5):
    n = max(0.0, min(100.0, float(x)))
    return math.log((n + eps) / (100 - n + eps))


def unlogit(y, eps=0.5):
    n = math.exp(max(-20.0, min(20.0, float(y))))
    return max(0.0, min(100.0, ((100 + eps) * n - eps) / (1 + n)))


def _fit(pairs):
    n = len(pairs)
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    c = sum((x - mx) * (y - my) for x, y in pairs)
    l = sum((x - mx) ** 2 for x, _ in pairs)
    u = sum((y - my) ** 2 for _, y in pairs)
    d = math.sqrt(l) * math.sqrt(u)
    f = c / d if d > 0 else 0.0
    p = c / l if l > 0 else 0.0
    return f, p, my - p * mx, l


def apply_rules(imp, keys, rules, aliases):
    for _ in range(2):
        for sup, inf in rules:
            s, i = aliases.get(sup, sup), aliases.get(inf, inf)
            if s not in imp or i not in imp:
                continue
            for k in keys:
                t, b = imp[s].get(k), imp[i].get(k)
                if not t or not b:
                    continue
                if b["imputed"] and b["score"] > t["score"]:
                    b["score"] = t["score"]
                if t["imputed"] and t["score"] < b["score"]:
                    t["score"] = b["score"]


def agentic_index(models, data):
    keys = list(AGENTIC_WEIGHTS)
    vals = {}
    for m in models:
        vals[m["id"]] = {}
        for k in keys:
            v = m["scores"].get(k)
            if v is not None:
                vals[m["id"]][k] = 100 / (1 + 10 ** ((1400 - v) / 400)) if k == "code-arena-elo" else v
    # pairwise regressions in logit space
    reg = {}
    for a in keys:
        for b in keys:
            if a == b:
                reg[a, b] = (1.0, lambda y: y)
                continue
            pairs = [(logit(v[a]), logit(v[b])) for v in vals.values() if a in v and b in v]
            n = len(pairs)
            shrink = max(0, n - 10) / (n + 15) if n > 10 else 0
            if n >= 10:
                f, p, c0, l = _fit(pairs)
                if l >= 0.05 and 0 < p <= 5 and f >= 0.15:
                    reg[a, b] = (f * f * shrink, (lambda p, c0: lambda y: p * y + c0)(p, c0))
                    continue
            reg[a, b] = (0.0, lambda y: y)
    # which targets are hard (median across models, top-5 of the trend set)
    hard = {}
    trend = set(data["trend"])
    for k in keys:
        allv = sorted((v[k] for v in vals.values() if k in v), reverse=True)
        tr = sorted((v[k] for mid, v in vals.items() if k in v and mid in trend), reverse=True)
        med = allv[len(allv) // 2] if allv else 50
        top5 = sum(tr[:5]) / max(1, min(5, len(tr)))
        hard[k] = med < 38 or top5 < 40

    def cap(mid, k, own):
        a = max(own.get("swebench-pro") or 0, own.get("deepswe-v1-1") or 0)
        if a >= 72:
            return None
        pool = []
        for oid, ov in vals.items():
            if oid == mid or k not in ov:
                continue
            if a > 0:
                e = max(ov.get("swebench-pro") or 0, ov.get("deepswe-v1-1") or 0)
                if 0 < e <= a + 1.5:
                    pool.append(ov[k])
            else:
                mine = sum(own.values()) / max(1, len(own))
                theirs = sum(ov.values()) / max(1, len(ov))
                if theirs <= mine + 2:
                    pool.append(ov[k])
        if len(pool) < 2:
            return None
        pool.sort(reverse=True)
        return pool[int(len(pool) * 0.2)] if len(pool) >= 6 else pool[0]

    imp = {}
    for m in models:
        own = vals[m["id"]]
        if not own:
            continue
        few = len(own) <= 4
        src = [k for k in own if own[k] > 0] or list(own)
        imp[m["id"]] = {}
        for k in keys:
            if k in own:
                imp[m["id"]][k] = {"score": own[k], "imputed": False}
                continue
            num = den = 0.0
            for s in src:
                w, f = reg[s, k]
                if w > 0:
                    num += w * f(logit(own[s]))
                    den += w
            v = unlogit(num / den) if den > 0 else 25.0
            if hard[k] and few:
                c = cap(m["id"], k, own)
                if c is not None and v > c:
                    v = c
            imp[m["id"]][k] = {"score": max(0.0, min(100.0, v)), "imputed": True}
    apply_rules(imp, keys, data["rules"], data["aliases"])
    total = sum(AGENTIC_WEIGHTS.values())
    raw = {mid: sum(AGENTIC_WEIGHTS[k] * d[k]["score"] for k in keys) / total for mid, d in imp.items()}
    anchor = raw.get(AGENTIC_ANCHOR)
    scale = AGENTIC_ANCHOR_VALUE / anchor if anchor and anchor > 0 else AGENTIC_FALLBACK
    return {mid: to_fixed1(max(0.5, v * scale)) for mid, v in raw.items()}, imp


def gdpval_points(x):
    elo = x / 100 * 2500 - 500
    if elo <= 1550:
        return 44 * max(0.0, (elo + 200) / 1750)
    s = lambda e: 1 / (1 + 10 ** ((1675 - e) / 110))
    r = s(1550)
    return 44 + 56 * ((s(elo) - r) / (1 - r))


def knowledge_index(models, data):
    keys = list(KNOWLEDGE_WEIGHTS)
    allk = keys + [HLE_BRIDGE]
    vals = {}
    for m in models:
        vals[m["id"]] = {}
        for k in allk:
            v = m["scores"].get(k)
            if v is not None:
                vals[m["id"]][k] = max(0.0, min(100.0, (v + 500) / 2500 * 100)) if k == "gdpval-aa" else v
    reg = {}
    for a in allk:
        for b in allk:
            if a == b:
                reg[a, b] = (1.0, lambda y: y)
                continue
            bend = a not in HARD and b in HARD
            tf = (lambda y: (max(0.0, y) / 100) ** 1.45 * 100) if bend else (lambda y: y)
            pairs = [(tf(v[a]), v[b]) for v in vals.values() if a in v and b in v]
            if len(pairs) >= 4:
                f, p, c0, l = _fit(pairs)
                if l >= 2 and 0 < p <= 4 and f >= 0.2:
                    reg[a, b] = (f * f, (lambda p, c0, tf: lambda y: p * tf(y) + c0)(p, c0, tf))
                    continue
            ra, rb = data["bench_avg"].get(a) or 50, data["bench_avg"].get(b) or 50
            reg[a, b] = (0.1, (lambda r: lambda y: y * r)(rb / ra))
    imp = {}
    for m in models:
        own = vals[m["id"]]
        have = [k for k in keys if k in own]
        src = have + [HLE_BRIDGE] if "hle-diamond" not in own and HLE_BRIDGE in own else have
        if not src:
            continue
        imp[m["id"]] = {}
        for k in keys:
            if k in own:
                imp[m["id"]][k] = {"score": own[k], "imputed": False}
                continue
            num = den = 0.0
            for s in src:
                w, f = reg[s, k]
                if w > 0:
                    num += w * f(own[s])
                    den += w
            v = num / den if den > 0 else sum(own[s] for s in src) / len(src)
            imp[m["id"]][k] = {"score": max(0.0, min(100.0, v)), "imputed": True}
    apply_rules(imp, keys, data["rules"], data["aliases"])
    total = sum(KNOWLEDGE_WEIGHTS.values())
    raw = {}
    for mid, d in imp.items():
        raw[mid] = sum(KNOWLEDGE_WEIGHTS[k] * (gdpval_points(d[k]["score"]) if k == "gdpval-aa"
                                               else d[k]["score"]) for k in keys) / total
    anchor = raw.get(KNOWLEDGE_ANCHOR)
    scale = KNOWLEDGE_ANCHOR_VALUE / anchor if anchor and anchor > 0 else KNOWLEDGE_FALLBACK
    return {mid: to_fixed1(max(0.5, v * scale)) for mid, v in raw.items()}, imp


def intelligence_index(data):
    models = [m for m in data["models"] if m["released"]]
    ag, ag_imp = agentic_index(models, data)
    kn, kn_imp = knowledge_index(models, data)
    out = {}
    for m in models:
        a, k = ag.get(m["id"]), kn.get(m["id"])
        out[m["id"]] = to_fixed1((SPLIT[0] * a + SPLIT[1] * k) / sum(SPLIT)) if a is not None and k is not None else None
    return out, ag, kn, ag_imp, kn_imp


# ── Checking our copy against what the site shows ────────────────────────────

def published_agentic():
    """The site's default view (Agentic Coding Index, trend selection), as headless Chrome renders it."""
    chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
    if not chrome:
        return None, "no Chrome/Chromium found"
    with tempfile.TemporaryDirectory() as prof:
        try:
            dom = subprocess.run([chrome, "--headless", "--disable-gpu", f"--user-data-dir={prof}",
                                  "--dump-dom", "--virtual-time-budget=20000", SITE],
                                 capture_output=True, text=True, timeout=120).stdout
        except subprocess.TimeoutExpired:
            return None, "Chrome timed out"
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", dom, flags=re.S)
    text = re.sub(r"<[^>]+>", "\n", text)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    pairs = []
    for i in range(len(lines) - 1):
        if re.fullmatch(r"\d{1,3}\.\d", lines[i]):
            j = i + 1
            if lines[j] == "NEW" and j + 1 < len(lines):
                j += 1
            pairs.append((lines[j], float(lines[i])))
    return pairs, None


def base(name):
    return re.sub(r"\s*\([^)]*\)\s*$", "", name or "")


def norm(s):
    s = re.sub(r"\b(instruct|it|thinking|reasoning|chat)\b", " ", s.lower())
    return re.sub(r"[^a-z0-9.]+", "", s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="apply the changes")
    ap.add_argument("--accept-drift", action="store_true",
                    help="write even though the site's published values differ from our copy of its method")
    a = ap.parse_args()

    home = http(SITE)
    url = script_url(home)
    data = parse(http(url))
    released = [m for m in data["models"] if m["released"]]
    print(f"{SITE}: {len(data['models'])} models ({len(released)} released) in {url.rsplit('/', 1)[1]}; "
          f"{len(data['rules'])} ordering rules; method: {METHOD}", file=sys.stderr)

    stop = []
    if len(released) < MIN_MODELS:
        stop.append(f"only {len(released)} released models parsed (expected at least {MIN_MODELS})")
    ids = {m["id"] for m in released}
    for anchor in (AGENTIC_ANCHOR, KNOWLEDGE_ANCHOR):
        if anchor not in ids:
            stop.append(f"anchor model {anchor} is missing")
    for idx, pinned in (("agentic-coding-index", AGENTIC_WEIGHTS), ("knowledge-index", KNOWLEDGE_WEIGHTS)):
        pub = data["published_weights"][idx]
        if not pub or len(pub) != len(pinned):
            print(f"NOTE: could not read the site's stated weights for {idx}; not compared", file=sys.stderr)
        elif sorted(float(w) for _, w in pub) != sorted(float(w) for w in pinned.values()):
            print(f"NOTE: the site now states different weights for {idx}: "
                  + ", ".join(f"{n} {w}%" for n, w in pub), file=sys.stderr)
    if stop:
        sys.exit("STOP: " + "; ".join(stop) + " — nothing written")

    intel, ag, kn, ag_imp, kn_imp = intelligence_index(data)

    # compare with what the site itself displays
    # The render is occasionally empty (the page had not finished loading), so
    # try three times. With Chrome present, a check that still could not run
    # blocks --write like drift does; with no Chrome at all it is only a note.
    for _ in range(3):
        pub, why = published_agentic()
        if pub or why == "no Chrome/Chromium found":
            break
    drift = []
    if pub is None or not pub:
        print(f"NOTE: could not read the site's displayed values ({why or 'nothing parsed'}); "
              "our copy of the method was not compared", file=sys.stderr)
        if why != "no Chrome/Chromium found":
            drift.append("the site's displayed values could not be read after 3 tries, "
                         "so our copy of the method was not checked")
    else:
        by_name = {m["name"]: m["id"] for m in released}
        checked = 0
        for name, shown in pub:
            mid = by_name.get(name)
            if mid is None or ag.get(mid) is None:
                continue
            checked += 1
            if abs(ag[mid] - shown) > 0.15:
                drift.append(f"{name}: site {shown}, ours {ag[mid]}")
        print(f"Compared our Agentic Coding Index with the site's for {checked} models: "
              f"{checked - len(drift)} agree.", file=sys.stderr)
        if checked < 10:
            drift.append(f"only {checked} displayed values could be matched")
    if drift:
        print("\nDRIFT — the site's own values differ from our copy of its method:\n  "
              + "\n  ".join(drift), file=sys.stderr)

    # resolve our models
    doc = bench_store.load_llm()
    entries = doc["benchmarks"]
    by_id = {m["id"]: m for m in released}
    # Match on display names only: the site's ids are not reliable names
    # (its "deepseek-v4-pro" is the 0813 model).
    by_norm = collections.defaultdict(list)
    for m in released:
        by_norm[norm(base(m["name"]))].append(m)
    resolved, unresolved, absent = {}, [], []
    for model in sorted({e["model"] for e in entries}):
        if model in UNTRACKED:
            resolved[model] = (None, "not on the site")
            continue
        if model in PINNED:
            hit = by_id.get(PINNED[model])
            if not hit:
                unresolved.append((model, f"pinned id {PINNED[model]!r} is not on the site", []))
                continue
            cands = [hit]
        else:
            cands = list({m["id"]: m for m in by_norm.get(norm(model), [])}.values())
        if not cands:
            import difflib
            near = difflib.get_close_matches(norm(model), list(by_norm), n=4, cutoff=0.6)
            absent.append((model, [by_norm[n][0]["name"] for n in near]))
            resolved[model] = (None, "not on the site")
            continue
        scored = [m for m in cands if intel.get(m["id"]) is not None]
        if not scored:
            resolved[model] = (None, f"{cands[0]['name']} (on the site, too few scores for an index)")
            continue
        # several effort variants of one model: the highest-scoring one
        best = max(scored, key=lambda m: intel[m["id"]])
        resolved[model] = (intel[best["id"]], best["name"])

    changes = []
    for e in entries:
        if e["model"] not in resolved:
            continue
        new, label = resolved[e["model"]]
        if e.get("intelligence_index") != new:
            changes.append((e["id"], e.get("intelligence_index"), new, label))
        e["intelligence_index"] = new

    got = sum(1 for e in entries if e.get("intelligence_index") is not None)
    print(f"\n{len(resolved)} of {len({x['model'] for x in entries})} models resolved; "
          f"{got}/{len(entries)} runs will have an Intelligence Index.", file=sys.stderr)
    if unresolved:
        print("\nUnresolved — a PINNED id no longer exists on the site; fix PINNED:", file=sys.stderr)
        for model, why, near in unresolved:
            print(f"  {model}: {why}", file=sys.stderr)
    if absent:
        print("\nNo name match — the Intelligence Index will be empty (—). If one of these IS on the site\n"
              "under another name, pin it in PINNED; if a near miss is a different model, leave it:", file=sys.stderr)
        for model, near in absent:
            print(f"  {model}" + (f"   near: {', '.join(near)}" if near else ""), file=sys.stderr)
    print("\nPer model:", file=sys.stderr)
    for model, (v, label) in sorted(resolved.items()):
        print(f"  {model:42} {'—' if v is None else v:>5}   {label}", file=sys.stderr)
    if changes:
        print(f"\n{len(changes)} runs change:", file=sys.stderr)
        for eid, old, new, label in changes:
            print(f"  {eid}: {old} -> {new}", file=sys.stderr)
    else:
        print("\nNo value changes.", file=sys.stderr)

    if not a.write:
        print("\nDry run. Re-run with --write to apply.", file=sys.stderr)
        return
    if drift and not a.accept_drift:
        sys.exit("\nSTOP: drift found (above) — nothing written. Look at it, then re-run with "
                 "--write --accept-drift if our copy should stand.")
    if unresolved:
        sys.exit("\nSTOP: unresolved models (above) — nothing written. Pin them first.")
    doc["attribution"]["intelligence_index_snapshot"] = collections.OrderedDict([
        ("fetched", datetime.date.today().isoformat()),
        ("script", url.rsplit("/", 1)[1]),
        ("method", METHOD)])
    bench_store.save_llm(doc)
    print(f"\nWrote {os.path.relpath(bench_store.LLM_DIR)}", file=sys.stderr)


if __name__ == "__main__":
    main()
