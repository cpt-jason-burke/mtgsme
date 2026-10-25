import json, sys, os, re
from collections import defaultdict

src, out = sys.argv[1], sys.argv[2]
# Arena/MTGO-only mechanics: a card using them is not a paper card
DIGITAL = re.compile(r"\b(?:conjures?|seeks?|perpetually|spellbook|intensity|specializ\w*)\b|\bdrafts? (?:a card )?from\b|\battractions?\b|\bstickers?\b|\bsticker sheets?\b", re.I)
SPECIAL = {"Plane","Phenomenon","Scheme","Vanguard","Conspiracy","Dungeon","Hero","Contraption","Attraction","Sticker","Stickers"}

# Final Commander status per card name, replayed from the ban list history
status = {}
for ch in sorted(json.load(open(f"{src}/index/banlist_history.json"))["commander"], key=lambda c: c.get("date", "")):
    for name, st in ch["changes"].items():
        status[name] = st

rulings = defaultdict(list)
for l in open(f"{src}/index/rulings.jsonl"):
    date, text, names = json.loads(l)
    for n in names:
        rulings[n].append((date, text))

def esc(s): return s.replace("\r", "")

cards = []
for l in open(f"{src}/index/cards.jsonl"):
    name, d = json.loads(l)
    if d.get("fu") or name.startswith("A-") or SPECIAL & set(d["t"]) or DIGITAL.search(d.get("o", "")) or "Guest" in d.get("tb", []):
        continue
    tl = " ".join(d.get("tp", []) + d["t"]) + (" — " + " ".join(d["tb"]) if d.get("tb") else "")
    st = status.get(name, "legal")
    lines = [f"## {name}"]
    meta = [f"Cost: {d.get('m', '—')}", f"Type: {tl}", f"Color identity: {d['ci'].upper() or 'colorless'}"]
    if "p" in d or "to" in d: meta.append(f"P/T: {d.get('p','?')}/{d.get('to','?')}")
    if "ly" in d: meta.append(f"Loyalty/Defense: {d['ly']}")
    meta.append(f"Commander: {st}")
    if d.get("gc"): meta.append("Game Changer")
    lines.append(" | ".join(meta))
    if len(d.get("ns", [])) > 1: lines.append("Faces: " + " // ".join(d["ns"]) + f" ({d['l']})")
    lines.append("Text: " + esc(d.get("o", "")).replace("\n", "\n  "))
    for date, t in ([] if len(sys.argv) > 3 and sys.argv[3] == "lean" else sorted(rulings.get(name, []))):
        lines.append(f"Ruling ({date}): {esc(t)}")
    cards.append((name, "\n".join(lines)))

cards.sort(key=lambda c: c[0].lower())
os.makedirs(out, exist_ok=True)
for f in os.listdir(out): os.remove(os.path.join(out, f))
groups = defaultdict(list)
for n, t in cards:
    k = n[0].upper()
    groups[k if k.isalpha() else "0-9"].append((n, t))
LIMIT = 2_500_000
written = []
for k, items in sorted(groups.items()):
    part, size, buf = 1, 0, []
    def flush():
        global part, size, buf
        if not buf: return
        fn = f"cards_{k}{part}.txt"
        open(os.path.join(out, fn), "w").write("\n\n".join(buf) + "\n")
        written.append(fn); part += 1; size = 0; buf = []
    for n, t in items:
        if size + len(t) > LIMIT: flush()
        buf.append(t); size += len(t) + 2
    flush()
print(len(cards), "cards,", len(written), "files")
for fn in written: print(fn, os.path.getsize(os.path.join(out, fn)))
