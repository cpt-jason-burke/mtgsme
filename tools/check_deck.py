import sys, os, re, glob, unicodedata, argparse
from collections import defaultdict

# Lists the Commander Spellbook combos a deck already has, and the ones it is one card away from.
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(description="Find combos in a decklist (one card per line, e.g. '1 Sol Ring')")
ap.add_argument("deck")
ap.add_argument("--combos", default=os.path.join(root, "combos"), help="folder made by build_combos.py")
ap.add_argument("--cards", default=os.path.join(root, "cards_lean"), help="card files, used for color identity")
ap.add_argument("--identity", help="deck color identity, e.g. BG (default: worked out from the deck)")
ap.add_argument("--near", type=int, default=20, help="how many one-card-away suggestions to show (0 for none)")
args = ap.parse_args()

def key(name):
    name = name.split(" // ")[0].split(" / ")[0]
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", name.replace("’", "'")).strip().lower()

# Decklist: quantity first, set codes, collector numbers, foil marks and tags are ignored
deck, shown = defaultdict(int), {}
for line in open(args.deck, encoding="utf8"):
    line = line.split("#")[0].strip()
    if not line or line.startswith("//") or line.rstrip(":").lower() in ("commander", "deck", "sideboard", "maybeboard", "companion"):
        continue
    m = re.match(r"^(?:SB:\s*)?(\d+)\s*x?\s+(.+)$", line, re.I)
    qty, name = (int(m[1]), m[2]) if m else (1, line)
    name = re.sub(r"\s+\([A-Za-z0-9]{2,6}\)(\s+\S+)?$|\s+\*[A-Z]+\*$|\s+\[[^\]]*\]$", "", name).strip()
    deck[key(name)] += qty
    shown[key(name)] = name

identity = {}
for fn in glob.glob(os.path.join(args.cards, "cards_*.txt")):
    name = None
    for line in open(fn, encoding="utf8"):
        if line.startswith("## "): name = key(line[3:])
        elif name and line.startswith("Cost: "):
            m = re.search(r"Color identity: ([A-Za-z]+)", line)
            identity[name] = "" if not m or m[1] == "colorless" else m[1].upper()
            name = None

unknown = [shown[k] for k in deck if identity and k not in identity]
if args.identity:
    colors = set(args.identity.upper()) - {"C"}
else:
    colors = set("".join(identity.get(k, "") for k in deck))

combos = []
for fn in sorted(glob.glob(os.path.join(args.combos, "combos_*.txt"))):
    for block in open(fn, encoding="utf8").read().split("\n\n## "):
        lines = block.lstrip("# ").split("\n")
        info = {l.split(": ", 1)[0]: l.split(": ", 1)[1] for l in lines[1:] if ": " in l and not l.startswith("  ")}
        if "Cards" not in info: continue
        need = []
        for c in info["Cards"].split(" + "):
            m = re.match(r"^(\d+)x (.+)$", c)
            need.append((int(m[1]), m[2]) if m else (1, c))
        info["Requires"] = [l[10:] for l in lines if l.startswith("Requires: ")]
        ident = set(info.get("Color identity", "C").split(" |")[0]) - {"C"}
        combos.append((lines[0].replace("Combo ", ""), need, ident, info))
if not combos:
    sys.exit(f"No combo files in {args.combos}. Run: python3 tools/build_combos.py")

have, near = [], defaultdict(list)
for cid, need, ident, info in combos:
    missing = [n for q, n in need if deck.get(key(n), 0) < q]
    if not missing: have.append((cid, need, info))
    elif len(missing) == 1 and len(need) > 1 and ident <= colors: near[missing[0]].append((cid, need, info))

def describe(cid, need, info):
    s = f"  {' + '.join((f'{q}x ' if q > 1 else '') + n for q, n in need)}\n    {info.get('Produces', '(no listed result)')}"
    for r in info["Requires"]: s += f"\n    Also needs: {r}"
    return s + f"\n    https://commanderspellbook.com/combo/{cid}/"

print(f"Deck: {sum(deck.values())} cards, color identity {''.join(c for c in 'WUBRG' if c in colors) or 'colorless'}")
if unknown: print("Not recognised (check spelling): " + ", ".join(unknown))
print(f"\nCombos in this deck: {len(have)}")
for c in have: print(describe(*c))
if args.near and near:
    ranked = sorted(near.items(), key=lambda kv: -len(kv[1]))[:args.near]
    print(f"\nOne card away ({len(near)} card{'s' if len(near) > 1 else ''} would each finish a combo; top {len(ranked)}):")
    for card, cs in ranked:
        print(f"\nAdd {card}: completes {len(cs)} combo{'s' if len(cs) > 1 else ''}")
        for c in cs[:3]: print(describe(*c))
