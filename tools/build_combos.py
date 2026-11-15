"""Build the combo data from Commander Spellbook's bulk export.

Writes docs/data/combos.json (compact, for the web app and tools/combos.js) and
combos/combos_<color identity><n>.txt (every combo with its steps, for the rules judge).

usage: python3 tools/build_combos.py [variants.json[.gz] | URL] [--force]
With no file it downloads https://json.commanderspellbook.com/variants.json.gz (about 35 MB).
Nothing is replaced unless the whole export was read and looks complete.
"""
import gzip, json, os, shutil, sys, tempfile, urllib.request
from collections import defaultdict

URL = "https://json.commanderspellbook.com/variants.json.gz"
UA = "MTGSME/1.0 (combo data for a personal Magic app; +https://github.com/cpt-jason-burke/mtgsme)"
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
out_json = os.path.join(root, "docs", "data", "combos.json")
out_txt = os.path.join(root, "combos")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
force = "--force" in sys.argv
src = args[0] if args else URL

ZONES = {"H": "hand", "B": "battlefield", "C": "command zone", "E": "exile", "G": "graveyard", "L": "library"}
STATES = ["battlefield", "exile", "library", "graveyard"]
# Commander Spellbook's bracket tags, with the brackets its own site shows for each
BRACKETS = {"R": "4+ (Ruthless)", "S": "3-4+ (Spicy)", "P": "3+ (Powerful)", "O": "2-3+ (Oddball)", "C": "2+ (Core)", "E": "1+ (Exhibition)", "B": "none (not legal)"}
# a result that matters by itself (S) is listed before one that needs something else (C) and before plain triggers (H)
RANK = {"S": 0, "C": 1, "H": 2}
MIN_COMBOS = 50_000


def variants(path, chunk=1 << 22):
    """Yield (meta, variant) one at a time; the export is about 750 MB of JSON, too much to load whole."""
    with open(path, "rb") as probe:
        zipped = probe.read(2) == b"\x1f\x8b"
    dec = json.JSONDecoder()
    with (gzip.open(path, "rt", encoding="utf-8") if zipped else open(path, encoding="utf-8")) as f:
        buf, pos = "", 0

        def more():
            nonlocal buf, pos
            d = f.read(chunk)
            if d:
                buf, pos = buf[pos:] + d, 0
            return bool(d)

        key = '"variants": ['
        while key not in buf:
            if not more():
                raise ValueError("no variants list in the export")
        i = buf.index(key)
        meta = json.loads(buf[:i].rstrip().rstrip(",") + "}")
        pos = i + len(key)
        while True:
            while pos >= len(buf) or buf[pos] in " \t\r\n,":
                if pos < len(buf):
                    pos += 1
                elif not more():
                    raise ValueError("the export ends in the middle of the variants list")
            if buf[pos] == "]":
                return
            while True:
                try:
                    v, pos = dec.raw_decode(buf, pos)
                    break
                except json.JSONDecodeError:
                    if not more():
                        raise ValueError("the export ends in the middle of a variant")
            yield meta, v


def approx(n):
    """Deck counts drift a little every day; two significant digits keep the files from changing for nothing."""
    if not n or n < 100:
        return n or 0
    k = 10 ** (len(str(n)) - 2)
    return (n + k // 2) // k * k


def esc(s):
    return (s or "").replace("\r", "").strip().replace("\n", "\n  ")


def where(i):
    zones = ", ".join(ZONES.get(z, z) for z in i.get("zoneLocations", []))
    states = [i.get(f"{s}CardState") for s in STATES if i.get(f"{s}CardState")]
    if i.get("mustBeCommander"):
        states.insert(0, "must be your commander")
    return zones + (": " + "; ".join(states) if states else "")


def times(i):
    return f"{i['quantity']}x " if i.get("quantity", 1) > 1 else ""


cards, features, templates = {}, {}, {}
rows, texts, meta = [], defaultdict(list), {}
tmp = None
try:
    if src.startswith("http"):
        tmp = tempfile.NamedTemporaryFile(suffix=".json.gz", delete=False).name
        with urllib.request.urlopen(urllib.request.Request(src, headers={"User-Agent": UA}), timeout=120) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
        src = tmp
    for meta, v in variants(src):
        # only reviewed, working combos (EXAMPLE entries have their steps blanked out)
        if v.get("status") != "OK":
            continue
        uses, needs = v["uses"], v.get("requires", [])
        cids, tids = sorted(u["card"]["id"] for u in uses), sorted(r["template"]["id"] for r in needs)
        # the app reads a combo's cards off its id, so an id that is not "card ids -- template ids" must stop the build
        if v["id"] != "-".join(map(str, cids)) + "".join(f"--{t}" for t in tids):
            sys.exit(f"Combo id {v['id']} does not list its cards {cids} and templates {tids}; Commander Spellbook changed its ids. Nothing was replaced.")
        for u in uses:
            cards[u["card"]["id"]] = u["card"]["name"]
        for r in needs:
            templates[r["template"]["id"]] = r["template"]["name"]
        produces = sorted(v.get("produces", []), key=lambda p: RANK.get(p["feature"].get("status"), 3))
        for p in produces:
            features[p["feature"]["id"]] = p["feature"]["name"]
        tag, pop, ident = v.get("bracketTag") or "", approx(v.get("popularity")), v.get("identity") or "C"
        extra = {}
        q = {str(u["card"]["id"]): u["quantity"] for u in uses if u.get("quantity", 1) > 1}
        tq = {str(r["template"]["id"]): r["quantity"] for r in needs if r.get("quantity", 1) > 1}
        cmd = sorted(u["card"]["id"] for u in uses if u.get("mustBeCommander"))
        if q: extra["q"] = q
        if tq: extra["tq"] = tq
        if cmd: extra["c"] = cmd
        order = (cids, tids)
        rows.append((order, [v["id"], [p["feature"]["id"] for p in produces], pop, tag] + ([extra] if extra else [])))

        legal = v.get("legalities", {}).get("commander")
        head = [f"Color identity: {ident}", f"Bracket: {BRACKETS.get(tag, tag or 'unknown')}", f"Popularity: {pop}", "Commander: " + ("legal" if legal else "not legal")]
        if v.get("manaNeeded"):
            head.append(f"Mana needed: {esc(v['manaNeeded'])}")
        lines = [f"## Combo {v['id']}", "Cards: " + " + ".join(times(u) + u["card"]["name"] for u in uses), " | ".join(head)]
        if produces:
            lines.append("Produces: " + "; ".join(p["feature"]["name"] for p in produces))
        for r in needs:
            lines.append(f"Requires: {times(r)}{r['template']['name']} ({where(r)})")
        lines.append("Start: " + "; ".join(f"{u['card']['name']} ({where(u)})" for u in uses))
        prereq = "\n".join(p for p in (v.get("easyPrerequisites"), v.get("notablePrerequisites")) if p)
        if prereq:
            lines.append("Prerequisites: " + esc(prereq))
        if v.get("description"):
            lines.append("Steps: " + esc(v["description"]))
        if v.get("notes"):
            lines.append("Notes: " + esc(v["notes"]))
        texts[ident].append((order, "\n".join(lines)))
finally:
    if tmp:
        os.remove(tmp)

old = None
if os.path.exists(out_json):
    try:
        old = json.load(open(out_json, encoding="utf-8"))
    except ValueError:
        old = None
floor = max(MIN_COMBOS, int(len(old["combos"]) * 0.8) if old else 0)
if len(rows) < floor and not force:
    sys.exit(f"Only {len(rows)} combos in the export (expected at least {floor}); it looks incomplete. Nothing was replaced. Use --force to accept it.")

# ---- compact file for the app: one combo per line, in a fixed order, so a refresh changes only what really changed ----
rows.sort(key=lambda r: r[0])
table = lambda d: {str(k): d[k] for k in sorted(d)}
data = {
    "about": "Commander Spellbook combos (commanderspellbook.com). cards, features and templates map Spellbook ids to names. "
             "Each combo is [id, result feature ids, popularity, bracket tag, extras]: the id is the combo's card ids joined by -, then --template id for each generic piece it also needs; "
             "popularity is roughly how many EDHREC decks hold it; extras can hold q (card id: copies needed), tq (template id: how many) and c (card ids that must be your commander).",
    "cards": table(cards), "features": table(features), "templates": table(templates), "combos": [r[1] for r in rows],
}
dump = lambda x: json.dumps(x, ensure_ascii=False, separators=(",", ":"))
if old and {k: v for k, v in old.items() if k != "updated"} == data:
    print("combos.json: no change")
else:
    head = {"updated": (meta.get("timestamp") or "")[:10], **{k: v for k, v in data.items() if k != "combos"}}
    with open(out_json + ".tmp", "w", encoding="utf-8") as f:
        f.write(dump(head)[:-1] + ',"combos":[\n' + ",\n".join(dump(c) for c in data["combos"]) + "\n]}\n")
    os.replace(out_json + ".tmp", out_json)

# ---- text files for the judge: one group of files per color identity ----
LIMIT = 2_500_000
files = {}
for ident, items in sorted(texts.items()):
    items.sort(key=lambda t: t[0])
    part, size, buf = 1, 0, []
    for _, t in items:
        if buf and size + len(t) > LIMIT:
            files[f"combos_{ident}{part}.txt"] = "\n\n".join(buf) + "\n"
            part, size, buf = part + 1, 0, []
        buf.append(t); size += len(t) + 2
    files[f"combos_{ident}{part}.txt"] = "\n\n".join(buf) + "\n"
os.makedirs(out_txt, exist_ok=True)
for fn in os.listdir(out_txt):
    if fn.startswith("combos_") and fn not in files:
        os.remove(os.path.join(out_txt, fn))
changed = 0
for fn, text in files.items():
    p = os.path.join(out_txt, fn)
    if os.path.exists(p) and open(p, encoding="utf-8").read() == text:
        continue
    with open(p + ".tmp", "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(p + ".tmp", p)
    changed += 1

print(len(rows), "combos;", len(cards), "cards;", len(features), "results;", len(templates), "templates; export of", meta.get("timestamp"))
print("combos.json", os.path.getsize(out_json), "bytes;", len(files), "text files,", sum(len(t) for t in files.values()), "characters,", changed, "changed")
