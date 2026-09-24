#!/usr/bin/env python3
"""Check that every white paper is wired into the site consistently.

    python3 _tools/check_papers.py        # exit 0 = consistent

For each papers/<slug>.md it checks: a Turkish twin exists at tr/papers/<slug>.md;
both carry the required front matter; the twins agree on page_id, permalink,
parent, nav_order and date; no two papers share a nav_order; and both
papers/index.md tables and the README library table list the papers in
nav_order order.
"""
import io, re, sys, glob, os

REQUIRED = ["title", "parent", "nav_order", "lang", "page_id", "date",
            "card_tag", "description", "permalink", "last_modified_date"]
SAME = ["page_id", "permalink", "parent", "nav_order", "date"]


def front(path):
    s = io.open(path, encoding="utf-8").read()
    m = re.match(r"---\n(.*?)\n---\n", s, re.S)
    fm = {}
    for line in (m.group(1) if m else "").splitlines():
        k = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if k:
            fm[k.group(1)] = k.group(2).strip().strip('"')
    return fm


def table_order(path):
    rows = re.findall(r"^\| \[[^\]]*\]\(([^)]+)\)", io.open(path, encoding="utf-8").read(), re.M)
    return [r for r in rows if "{{" not in r]   # benchmark explorer rows are not papers


errors = []
papers = {}
for en in sorted(glob.glob("papers/*.md")):
    slug = os.path.basename(en)[:-3]
    if slug == "index":
        continue
    tr = "tr/" + en
    if not os.path.exists(tr):
        errors.append(f"{slug}: no Turkish twin at {tr}")
        continue
    a, b = front(en), front(tr)
    for lang, fm, path in (("en", a, en), ("tr", b, tr)):
        missing = [k for k in REQUIRED if not fm.get(k)]
        if missing:
            errors.append(f"{path}: missing {', '.join(missing)}")
        if fm.get("lang") != lang:
            errors.append(f"{path}: lang should be {lang}")
    for k in SAME:
        if a.get(k) != b.get(k):
            errors.append(f"{slug}: {k} differs — en {a.get(k)!r}, tr {b.get(k)!r}")
    if a.get("permalink") != f"/papers/{slug}/":
        errors.append(f"{slug}: permalink should be /papers/{slug}/")
    if os.path.isdir(f"tr/papers/{slug}"):
        errors.append(f"{slug}: tr/papers/{slug}/ exists — images belong only under papers/{slug}/")
    papers[slug] = float(a.get("nav_order") or 0)

for tr in glob.glob("tr/papers/*.md"):
    if not os.path.exists(tr[3:]):
        errors.append(f"{tr}: no English twin at {tr[3:]}")

seen = {}
for slug, n in papers.items():
    if n in seen:
        errors.append(f"nav_order {n:g} used by both {seen[n]} and {slug}")
    seen[n] = slug

def readme_order(path="README.md"):
    s = io.open(path, encoding="utf-8").read()
    lib = s[s.index("## Research & Engineering Library"):]
    lib = lib[:lib.index("\n---\n")]
    return re.findall(r"^\| \[[^\]]*\]\(https://whitepapers\.openzeka\.com/papers/([^/)]+)/\)", lib, re.M)


expected = sorted(papers, key=papers.get)
for idx, got in (("papers/index.md", table_order("papers/index.md")),
                 ("tr/papers/index.md", table_order("tr/papers/index.md")),
                 ("README.md library table", readme_order())):
    if got != expected:
        missing = [s for s in expected if s not in got]
        extra = [s for s in got if s not in expected]
        errors.append(f"{idx}: table rows do not match nav_order"
                      + (f" — missing {missing}" if missing else "")
                      + (f" — unknown {extra}" if extra else "")
                      + ("" if missing or extra else f" — expected {expected}"))

for e in errors:
    print("ERROR", e)
print(f"{len(papers)} papers, {len(errors)} error(s)")
sys.exit(1 if errors else 0)
