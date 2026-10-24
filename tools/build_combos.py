import json, sys, os, gzip, urllib.request
from collections import defaultdict

# Usage: build_combos.py [variants.json | variants.json.gz | URL] [out-dir]
src = sys.argv[1] if len(sys.argv) > 1 else "https://json.commanderspellbook.com/variants.json.gz"
out = sys.argv[2] if len(sys.argv) > 2 else "combos"
ZONES = {"H": "hand", "B": "battlefield", "C": "command zone", "E": "exile", "G": "graveyard", "L": "library"}
BRACKETS = {"R": "Ruthless", "S": "Spicy", "P": "Powerful", "O": "Oddball", "C": "Core", "E": "Exhibition", "B": "Banned"}
STATES = ["battlefield", "exile", "library", "graveyard"]

if src.startswith("http"):
    req = urllib.request.Request(src, headers={"User-Agent": "mtgsme-build-combos"})
    raw = urllib.request.urlopen(req).read()
else:
    raw = open(src, "rb").read()
data = json.loads(gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw)

def esc(s): return (s or "").replace("\r", "").strip().replace("\n", "\n  ")

def where(i):
    zones = ", ".join(ZONES.get(z, z) for z in i.get("zoneLocations", []))
    states = [i.get(f"{s}CardState") for s in STATES if i.get(f"{s}CardState")]
    if i.get("mustBeCommander"): states.insert(0, "must be your commander")
    return zones + (": " + "; ".join(states) if states else "")

combos = []
for v in data["variants"]:
    # Only reviewed, working combos (EXAMPLE entries have their steps blanked out)
    if v.get("status") != "OK":
        continue
    uses = v["uses"]
    names = [(f"{u['quantity']}x " if u.get("quantity", 1) > 1 else "") + u["card"]["name"] for u in uses]
    ident = v.get("identity") or "C"
    produces = [p["feature"]["name"] for p in v.get("produces", []) if p["feature"].get("status") != "HU"]
    meta = [f"Color identity: {ident}"]
    if v.get("bracketTag"): meta.append(f"Bracket: {BRACKETS.get(v['bracketTag'], v['bracketTag'])}")
    if v.get("popularity") is not None: meta.append(f"Popularity: {v['popularity']}")
    meta.append("Commander: " + ("legal" if v.get("legalities", {}).get("commander") else "not legal"))
    if v.get("manaNeeded"): meta.append(f"Mana needed: {v['manaNeeded']}")
    lines = [f"## Combo {v['id']}", "Cards: " + " + ".join(names), " | ".join(meta)]
    if produces: lines.append("Produces: " + "; ".join(produces))
    for r in v.get("requires", []):
        q = f"{r['quantity']}x " if r.get("quantity", 1) > 1 else ""
        lines.append(f"Requires: {q}{r['template']['name']} ({where(r)})")
    lines.append("Start: " + "; ".join(f"{u['card']['name']} ({where(u)})" for u in uses))
    prereq = "\n".join(p for p in (v.get("easyPrerequisites"), v.get("notablePrerequisites")) if p)
    if prereq: lines.append("Prerequisites: " + esc(prereq))
    if v.get("description"): lines.append("Steps: " + esc(v["description"]))
    if v.get("notes"): lines.append("Notes: " + esc(v["notes"]))
    combos.append((ident, -(v.get("popularity") or 0), "\n".join(lines)))

# One group of files per color identity, most popular combos first
combos.sort()
os.makedirs(out, exist_ok=True)
for f in os.listdir(out):
    if f.startswith("combos_"): os.remove(os.path.join(out, f))
groups = defaultdict(list)
for ident, _, t in combos:
    groups[ident].append(t)
LIMIT = 2_500_000
written = []
for k, items in sorted(groups.items()):
    part, size, buf = 1, 0, []
    def flush():
        global part, size, buf
        if not buf: return
        fn = f"combos_{k}{part}.txt"
        open(os.path.join(out, fn), "w").write("\n\n".join(buf) + "\n")
        written.append(fn); part += 1; size = 0; buf = []
    for t in items:
        if size + len(t) > LIMIT: flush()
        buf.append(t); size += len(t) + 2
    flush()
print(len(combos), "combos,", len(written), "files, data from", data.get("timestamp"))
for fn in written: print(fn, os.path.getsize(os.path.join(out, fn)))
