#!/usr/bin/env python3
"""Check _data/changelog.yml before publishing.

    python3 _tools/check_changelog.py        # exit 0 = consistent

Every entry: a valid date, entries newest first, one of the four types, text
in every language (en, tr, nl), and the reference its type needs — paper:
page, benchmarks: run, vlm: vlm, cv: cv. Every page id exists in every
language, every run id is in the LLM store (assets/data/llm-benchmarks/), every
VLM run id in the VLM store (assets/data/vlm-benchmarks/), every CV id in
assets/data/cv-benchmarks/index.json, and each run or CV result is listed
once. No company name in the text. The build (_plugins/changelog.rb) also
fails on an id it cannot resolve.
"""
import datetime, glob, io, json, re, sys

try:
    import yaml
except ImportError:
    sys.exit("needs PyYAML (pip install pyyaml)")

LANGS = ["en", "tr", "nl"]
TYPES = {"paper", "benchmarks", "vlm", "cv"}
NEEDS = {"paper": "page", "benchmarks": "run", "vlm": "vlm", "cv": "cv"}
COMPANY = re.compile(r"openzeka|cordatus", re.I)   # company details live in company.yml

entries = yaml.safe_load(io.open("_data/changelog.yml", encoding="utf-8")) or []
sys.path.insert(0, "_tools")
import bench_store  # noqa: E402  (the LLM and VLM data stores)
runs = {r["id"] for r in bench_store.load_llm()["benchmarks"]}
vlms = {r["id"] for r in bench_store.load_vlm()["benchmarks"]}
cvidx = json.load(io.open("assets/data/cv-benchmarks/index.json", encoding="utf-8"))
cvs = {m["path"][:-5].replace("/", "-") for d in cvidx["devices"] for m in d["models"]}

pages = {l: set() for l in LANGS}
for path in glob.glob("**/*.md", recursive=True):
    if path.startswith(("_", "node_modules", "vendor")):
        continue
    head = io.open(path, encoding="utf-8").read().split("\n---", 1)[0]
    pid = re.search(r"^page_id:\s*(\S+)", head, re.M)
    lang = re.search(r"^lang:\s*(\S+)", head, re.M)
    if pid and lang and lang.group(1) in pages:
        pages[lang.group(1)].add(pid.group(1))

errors, prev, listed = [], None, set()
for i, e in enumerate(entries, 1):
    where = f"entry {i} ({e.get('date')})"
    d = e.get("date")
    if not isinstance(d, datetime.date):
        errors.append(f"{where}: date must be YYYY-MM-DD")
    elif prev and d > prev:
        errors.append(f"{where}: newer than the entry above — keep newest first")
    prev = d if isinstance(d, datetime.date) else prev
    typ = e.get("type")
    if typ not in TYPES:
        errors.append(f"{where}: type must be one of {sorted(TYPES)}")
    elif typ in NEEDS and not e.get(NEEDS[typ]):
        errors.append(f"{where}: a {typ} entry needs `{NEEDS[typ]}:`")
    text = e.get("text") or {}
    for l in LANGS:
        t = str(text.get(l, "")).strip()
        if not t:
            errors.append(f"{where}: no {l} text")
        elif COMPANY.search(t):
            errors.append(f"{where}: {l} text names a company")
    if e.get("page"):
        for l in LANGS:
            if e["page"] not in pages[l]:
                errors.append(f"{where}: page_id {e['page']!r} has no {l} page")
    if e.get("run"):
        if e["run"] not in runs:
            errors.append(f"{where}: run {e['run']!r} not in the LLM store")
        elif e["run"] in listed:
            errors.append(f"{where}: run {e['run']!r} is already listed")
        listed.add(e["run"])
    if e.get("vlm"):
        if e["vlm"] not in vlms:
            errors.append(f"{where}: VLM run {e['vlm']!r} not in the VLM store")
        elif e["vlm"] in listed:
            errors.append(f"{where}: VLM run {e['vlm']!r} is already listed")
        listed.add(e["vlm"])
    if e.get("cv"):
        if e["cv"] not in cvs:
            errors.append(f"{where}: CV result {e['cv']!r} not in cv-benchmarks/index.json")
        elif e["cv"] in listed:
            errors.append(f"{where}: CV result {e['cv']!r} is already listed")
        listed.add(e["cv"])

for x in errors:
    print("ERROR", x)
print(f"{len(entries)} entries, {len(errors)} error(s)")
sys.exit(1 if errors else 0)
