"""Build the data files for the MTGSME web app (docs/data/*.json).

usage: python3 tools/build_site.py <magic-search-engine checkout> [cr_text_file]
The checkout needs index/cards.jsonl, index/rulings.jsonl, index/banlist_history.json,
index/sets.json and index/deck_index.json.
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

# ---- sets timeline, cards per set, and precon decklists -------------------------
index = {c["n"]: i for i, c in enumerate(cards)}
by_set, by_print = defaultdict(list), {}
for l in open(f"{src}/index/cards.jsonl"):
    name, d = json.loads(l)
    if name not in index:
        continue
    for code, p in d["*"]:
        by_set[code].append([index[name], p.get("n", ""), p.get("r", 1)])
        by_print[(code, p.get("n", ""))] = index[name]

def natural(n):
    m = re.match(r"(\d+)(.*)", n)
    return (int(m.group(1)), m.group(2)) if m else (10**6, n)

for code in by_set:
    by_set[code].sort(key=lambda x: natural(x[1]))

SECRET = {"sld", "slu", "slc", "slp", "pssc"}
HIDE = {"promo", "memorabilia", "alchemy", "funny", "token", "masterpiece", "judge gift", "duels", "wpn", "arena league", "fnm",
        "player rewards", "premiere shop", "sdcc", "vanguard", "eternal", "spellbook"}
def kind(code, s):
    t = set(s.get("types", []))
    if code in SECRET or s["name"].startswith("Secret Lair"): return "secret"
    if "commander" in t: return "commander"
    if "jumpstart" in t: return "jumpstart"
    if t & {"expansion", "core"}: return "main"
    if t & {"masters", "from the vault", "premium deck"}: return "reprint"
    if "draft innovation" in t: return "draft"
    return "other"

sets_meta = json.load(open(f"{src}/index/sets.json"))
sets_out = []
for code, s in sets_meta.items():
    if code not in by_set or code == "sld":  # Secret Lair Drop is listed per drop instead
        continue
    t = set(s.get("types", []))
    e = {"c": code, "n": s["name"], "d": s.get("release_date", ""), "k": kind(code, s), "t": len(by_set[code])}
    if t & HIDE and not t & {"expansion", "core", "commander", "masters"}: e["h"] = 1
    sets_out.append(e)
from datetime import date
def days(a, b):
    try: return abs((date.fromisoformat(a) - date.fromisoformat(b)).days)
    except ValueError: return 999
for e in sets_out:  # an expansion released alongside Commander decks gets a badge pointing at them
    if e["k"] == "main":
        cm = [x["c"] for x in sets_out if x["k"] == "commander" and not x.get("h") and days(x["d"], e["d"]) <= 10]
        if cm: e["cm"] = cm[0]
sets_out.sort(key=lambda e: (e["d"], e["n"]), reverse=True)
json.dump(sets_out, open(f"{out}/sets.json", "w"), ensure_ascii=False, separators=(",", ":"))
json.dump({k: v for k, v in by_set.items()}, open(f"{out}/setcards.json", "w"), ensure_ascii=False, separators=(",", ":"))

precons = []
for d in json.load(open(f"{src}/index/deck_index.json")):
    if d["type"] not in ("Commander Deck", "Secret Lair Drop"):
        continue
    secs = {}
    for sec, items in d["cards"].items():
        if sec == "Display Commander" or sec.lower().startswith("token"):
            continue
        rows = []
        for q, code, num, *extra in items:
            i = by_print.get((code, num))
            if i is not None: rows.append([q, i, code, num])
        if rows: secs["cmd" if sec == "Commander" else "main"] = secs.get("cmd" if sec == "Commander" else "main", []) + rows
    if secs:
        precons.append({"n": d["name"], "y": "cmd" if d["type"] == "Commander Deck" else "sld", "s": d["set_code"], "sn": d["set_name"], "d": d["release_date"], **secs})
precons.sort(key=lambda p: p["d"], reverse=True)
json.dump(precons, open(f"{out}/precons.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(sets_out), "sets;", sum(len(v) for v in by_set.values()), "printings;", len(precons), "precons")

for f in ("cards", "rulings", "cr", "sets", "setcards", "precons"):
    print(f, os.path.getsize(f"{out}/{f}.json"))
print(len(cards), "cards;", len(rules), "rules;", len(glossary), "glossary terms;", len(kw), "keyword rules")
