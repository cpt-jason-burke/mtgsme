"""Build the data files for the MTGSME web app (docs/data/*.json).

usage: python3 tools/build_site.py <magic-search-engine checkout> [cr_text_file]
The checkout needs index/cards.jsonl, index/rulings.jsonl and index/banlist_history.json.
"""
import json, os, re, sys
from collections import defaultdict

src = sys.argv[1]
cr_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "rules_CR.txt")
out = os.path.join(os.path.dirname(__file__), "..", "docs", "data")
os.makedirs(out, exist_ok=True)

SPECIAL = {"Plane", "Phenomenon", "Scheme", "Vanguard", "Conspiracy", "Dungeon", "Hero", "Contraption", "Attraction", "Sticker", "Stickers"}

# Arena/MTGO-only mechanics: a card using them is not a paper card
DIGITAL = re.compile(r"\b(?:conjures?|seeks?|perpetually|spellbook|intensity|specializ\w*)\b|\bdrafts? (?:a card )?from\b|\battractions?\b|\bstickers?\b|\bsticker sheets?\b", re.I)

status = {}
for ch in sorted(json.load(open(f"{src}/index/banlist_history.json"))["commander"], key=lambda c: c.get("date", "")):
    status.update(ch["changes"])

# ---- cards -------------------------------------------------------------
cards = []
names = set()
for l in open(f"{src}/index/cards.jsonl"):
    name, d = json.loads(l)
    if d.get("fu") or name.startswith("A-") or SPECIAL & set(d["t"]) or DIGITAL.search(d.get("o", "")) or "Guest" in d.get("tb", []):
        continue
    c = {"n": name, "t": " ".join(d.get("tp", []) + d["t"]) + (" — " + " ".join(d["tb"]) if d.get("tb") else ""),
         "ci": d["ci"].upper(), "o": d.get("o", "")}
    if d.get("m"): c["m"] = d["m"]
    if "p" in d or "to" in d: c["pt"] = f"{d.get('p', '?')}/{d.get('to', '?')}"
    if "ly" in d: c["ly"] = d["ly"]
    st = status.get(name, "legal")
    if st != "legal": c["s"] = st
    if d.get("gc"): c["g"] = 1
    if d.get("k"): c["k"] = d["k"]
    if len(d.get("ns", [])) > 1: c["f"] = d["ns"]
    cards.append(c)
    names.add(name)
cards.sort(key=lambda c: c["n"].lower())
json.dump(cards, open(f"{out}/cards.json", "w"), ensure_ascii=False, separators=(",", ":"))

# ---- rulings (deduplicated text table) ----------------------------------
texts, tindex, by = [], {}, defaultdict(list)
for l in open(f"{src}/index/rulings.jsonl"):
    date, text, ns = json.loads(l)
    if text not in tindex:
        tindex[text] = len(texts); texts.append(text)
    for n in ns:
        if n in names: by[n].append([date, tindex[text]])
json.dump({"texts": texts, "by": by}, open(f"{out}/rulings.json", "w"), ensure_ascii=False, separators=(",", ":"))

# ---- comprehensive rules -------------------------------------------------
lines = [x.replace("\xa0", " ").strip() for x in open(cr_path, encoding="utf-8").read().split("\n")]
gl = max(i for i, x in enumerate(lines) if x == "Glossary")
start = next(i for i, x in enumerate(lines) if x.startswith("100. General") and i > 100)
rules, order, last = {}, [], None
for x in lines[start:gl]:
    if not x: continue
    m = re.match(r"^(\d{3}\.\d+[a-z]?)\.? (.+)$", x) or re.match(r"^(\d{3})\. (.+)$", x)
    if m:
        last = m.group(1); rules[last] = {"t": m.group(2)}; order.append(last)
    elif re.match(r"^\d\. ", x):
        last = None
    elif last and x.startswith("Example:"):
        rules[last].setdefault("ex", []).append(x[8:].strip())
    elif last:
        rules[last]["t"] += " " + x
glossary, cur = {}, None
g = [x for x in lines[gl + 1:] if x]
end = next((i for i, x in enumerate(g) if x == "Credits"), len(g))
i = 0
g = g[:end]
while i < len(g) - 1:
    glossary[g[i]] = g[i + 1]; i += 2
# keyword -> rule number, from the 701 (actions) and 702 (abilities) headings
kw = {}
for num, r in rules.items():
    if re.fullmatch(r"70[12]\.\d+", num):
        kw[r["t"].lower()] = num
json.dump({"rules": rules, "order": order, "glossary": glossary, "kw": kw,
           "effective": next((re.search(r"effective as of (.+?)\.", x).group(1) for x in lines[:10] if "effective as of" in x), "")},
          open(f"{out}/cr.json", "w"), ensure_ascii=False, separators=(",", ":"))

for f in ("cards", "rulings", "cr"):
    print(f, os.path.getsize(f"{out}/{f}.json"))
print(len(cards), "cards;", len(rules), "rules;", len(glossary), "glossary terms;", len(kw), "keyword rules")
