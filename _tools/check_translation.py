#!/usr/bin/env python3
"""Check every translation against its English source.

    python3 _tools/check_translation.py                 # all languages
    python3 _tools/check_translation.py --lang nl       # one language
    python3 _tools/check_translation.py --anchors _site # in-page links of a built site

A translation must carry the same mechanics as the English page, changing only
the words. For each translated page (tr/…, nl/…) of each English page — the
papers, the papers index and the two explorers — this compares:

  code         fenced code blocks, in order, identical (indentation aside)
  liquid       every {% … %} and {{ … }} tag, as a multiset
  images       image paths, as a multiset
  links        link and href URLs other than in-page #anchors, as a multiset
  tables       number of tables and rows in each, in order
  headings     heading levels, in order
  front matter parent, nav_order, page_id, date, permalink, layout identical;
               lang set; title and description translated
  untranslated a paragraph or table cell with 6+ ordinary lowercase words
               identical to the English (name lists and references are skipped)

Languages in STRICT fail on any difference. Turkish predates this check and
has known, deliberate differences, so for it the findings are warnings.

--anchors reads a built site and fails on any href="#x" with no element id="x"
on the same page.
"""
import glob
import html
import io
import os
import re
import sys
from collections import Counter
from urllib.parse import unquote

LANGS = ["tr", "nl"]
STRICT = {"nl"}
SAME = ["parent", "nav_order", "page_id", "date", "permalink", "layout"]

FENCE = re.compile(r"^([ \t]*)(```|~~~)")
LIQUID = re.compile(r"\{%-?.*?-?%\}|\{\{-?.*?-?\}\}", re.S)
IMG_MD = re.compile(r"!\[[^\]]*\]\(\s*([^)\s]+)")
IMG_HTML = re.compile(r"<img\b[^>]*\bsrc=\"([^\"]+)\"", re.I)
LINK_MD = re.compile(r"(?<!!)\[[^\]]*\]\(\s*([^)\s]+)")
LINK_HTML = re.compile(r"<a\b[^>]*\bhref=\"([^\"]+)\"", re.I)
AUTOLINK = re.compile(r"<(https?://[^>\s]+)>")


def sources():
    en = sorted(glob.glob("papers/*.md")) + ["llm-inference-benchmarks.md", "cv-inference-benchmarks.md", "vlm-inference-benchmarks.md"]
    return [p for p in en if os.path.exists(p)]


def split(path):
    s = io.open(path, encoding="utf-8").read()
    m = re.match(r"---\n(.*?)\n---\n", s, re.S)
    fm, body = {}, s
    if m:
        body = s[m.end():]
        key = None
        for line in m.group(1).splitlines():
            k = re.match(r"^([a-z_]+):\s*(.*)$", line)
            if k:
                key = k.group(1)
                fm[key] = k.group(2).strip().strip('"')
            elif key and line.startswith("  "):
                fm[key] = (fm[key] + " " + line.strip()).strip()
    return fm, body


def code_and_prose(body):
    """Fenced code blocks (dedented) and the body with them removed."""
    blocks, prose, cur, indent = [], [], None, ""
    for line in body.split("\n"):
        f = FENCE.match(line)
        if cur is None:
            if f:
                cur, indent = [line.strip()], f.group(1)
            else:
                prose.append(line)
        else:
            cur.append(line[len(indent):] if line.startswith(indent) else line.lstrip())
            if f and line.strip() in ("```", "~~~"):
                blocks.append("\n".join(l.rstrip() for l in cur))
                cur = None
    if cur is not None:
        blocks.append("\n".join(cur))
    return blocks, "\n".join(prose)


def strip_inline_code(s):
    return re.sub(r"`[^`\n]*`", "`…`", s)


def tables(prose):
    shapes, n = [], 0
    for line in prose.split("\n") + [""]:
        if line.lstrip().startswith("|"):
            n += 1
        elif n:
            shapes.append(n)
            n = 0
    return shapes


def headings(prose):
    return [len(m.group(1)) for m in re.finditer(r"^(#{1,6})\s", prose, re.M)]


def urls(rx_list, s, skip_anchor=False):
    out = Counter()
    for rx in rx_list:
        for u in rx.findall(s):
            if skip_anchor and u.startswith("#"):
                continue
            out[u.strip()] += 1
    return out


def text_units(prose):
    """Paragraphs and table cells, as plain text, for the untranslated check."""
    prose = LIQUID.sub(" ", prose)
    units = []
    for para in re.split(r"\n\s*\n", prose):
        if para.lstrip().startswith("|"):
            for line in para.split("\n"):
                units += [c for c in line.split("|")]
        else:
            units.append(para)
    out = set()
    for u in units:
        t = re.sub(r"<[^>]+>", " ", strip_inline_code(u))
        t = re.sub(r"\]\([^)]*\)", "]", t)          # drop link targets
        t = re.sub(r"[*_#>\[\]`|-]+", " ", t)
        t = " ".join(t.split())
        # Sentences, not name lists: product and model names are capitalised,
        # so count ordinary lowercase words. Reference entries (with a URL)
        # keep their original titles.
        if "http" not in u and len(re.findall(r"\b[a-z]{3,}\b", t)) >= 6:
            out.add(t)
    return out


def compare(en_path, tr_path, lang):
    problems = []
    a_fm, a_body = split(en_path)
    b_fm, b_body = split(tr_path)
    for k in SAME:
        if a_fm.get(k) != b_fm.get(k):
            problems.append(f"front matter {k}: en {a_fm.get(k)!r}, {lang} {b_fm.get(k)!r}")
    if b_fm.get("lang") != lang:
        problems.append(f"front matter lang should be {lang!r}")
    # Titles that are product names (the Dutch explorers) may stay English.
    for k in ("title", "description"):
        if k == "title" and not a_fm.get("parent"):
            continue
        if a_fm.get(k) and a_fm.get(k) == b_fm.get(k) and len(a_fm[k].split()) > 3:
            problems.append(f"front matter {k} is still the English text")

    a_code, a_prose = code_and_prose(a_body)
    b_code, b_prose = code_and_prose(b_body)
    if len(a_code) != len(b_code):
        problems.append(f"code blocks: en has {len(a_code)}, {lang} has {len(b_code)}")
    else:
        for i, (x, y) in enumerate(zip(a_code, b_code), 1):
            if x != y:
                first = next((j for j, (p, q) in enumerate(zip(x.split("\n"), y.split("\n"))) if p != q),
                             min(len(x.split("\n")), len(y.split("\n"))))
                problems.append(f"code block {i} differs at its line {first + 1}: "
                                f"en {x.split(chr(10))[first:first+1]} / {lang} {y.split(chr(10))[first:first+1]}")

    for name, rx, skip in (("liquid", [LIQUID], False),
                           ("images", [IMG_MD, IMG_HTML], False),
                           ("links", [LINK_MD, LINK_HTML, AUTOLINK], True)):
        x = urls(rx, strip_inline_code(a_prose), skip) if name != "liquid" else Counter(" ".join(t.split()) for t in LIQUID.findall(a_prose))
        y = urls(rx, strip_inline_code(b_prose), skip) if name != "liquid" else Counter(" ".join(t.split()) for t in LIQUID.findall(b_prose))
        if x != y:
            miss, extra = x - y, y - x
            problems.append(f"{name}: " + "; ".join(
                ([f"missing {list(miss.elements())[:4]}"] if miss else []) +
                ([f"extra {list(extra.elements())[:4]}"] if extra else [])))

    if tables(a_prose) != tables(b_prose):
        problems.append(f"tables (rows each): en {tables(a_prose)}, {lang} {tables(b_prose)}")
    if headings(a_prose) != headings(b_prose):
        problems.append(f"headings: en has {len(headings(a_prose))}, {lang} has {len(headings(b_prose))} "
                        f"(levels en {headings(a_prose)[:12]}…, {lang} {headings(b_prose)[:12]}…)")

    left = text_units(a_prose) & text_units(b_prose)
    for t in sorted(left)[:5]:
        problems.append(f"untranslated: {t[:110]}")
    if len(left) > 5:
        problems.append(f"untranslated: … and {len(left) - 5} more")
    return problems


def check_anchors(site):
    errors = 0
    for path in sorted(glob.glob(os.path.join(site, "**", "*.html"), recursive=True)):
        s = io.open(path, encoding="utf-8").read()
        ids = {html.unescape(unquote(i)) for i in re.findall(r"\bid=\"([^\"]+)\"", s)}
        for href in sorted(set(re.findall(r"\bhref=\"#([^\"]+)\"", s))):
            if html.unescape(unquote(href)) not in ids:
                print(f"ERROR {os.path.relpath(path, site)}: link #{href} has no target on the page")
                errors += 1
    print(f"anchors: {errors} broken in-page link(s)")
    return errors


def main(argv):
    if "--anchors" in argv:
        site = argv[argv.index("--anchors") + 1]
        sys.exit(1 if check_anchors(site) else 0)
    langs = [argv[argv.index("--lang") + 1]] if "--lang" in argv else LANGS
    errors = warnings = 0
    for lang in langs:
        for en in sources():
            tr = f"{lang}/{en}"
            if not os.path.exists(tr):
                print(f"{'ERROR' if lang in STRICT else 'WARN '} {tr}: missing")
                errors += lang in STRICT
                warnings += lang not in STRICT
                continue
            for p in compare(en, tr, lang):
                if lang in STRICT:
                    print(f"ERROR {tr}: {p}")
                    errors += 1
                else:
                    print(f"WARN  {tr}: {p}")
                    warnings += 1
    print(f"{len(sources())} English pages × {', '.join(langs)}: {errors} error(s), {warnings} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
