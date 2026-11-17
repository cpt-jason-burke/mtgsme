"""Build the "Most valuable" lists for the app: docs/data/top25.json.

For every set in docs/data/sets.json, and every Commander deck and Secret Lair drop in docs/data/precons.json,
it ranks the printings by Scryfall's US dollar price (TCGplayer's market price) and keeps the top 25 worth at least $5.
In a set, every printing and finish (non-foil, foil, etched) is its own entry. A Secret Lair drop lists both finishes,
since drops are sold in non-foil and foil editions; a Commander deck uses the finish the deck holds (non-foil when the printing has one).
Sets and decks out for more than 90 days are re-ranked once a week, newer ones every day, so daily changes stay small.
It also writes docs/data/precon-prices.json: each Commander deck's total market value (the precon picker in Decks sorts by it),
rounded to whole dollars and written only when a total changed.

usage: python3 tools/build_top25.py [default-cards.jsonl.gz] [--force]
Without a file it downloads Scryfall's default_cards bulk file (about 80 MB), reading it as it arrives.
Nothing is replaced if the file can't be read to the end or holds far fewer cards than last time.
"""
import gzip, json, os, re, sys, urllib.request
from datetime import date, datetime, timedelta, timezone

UA = "MTGSME/1.0 (personal Magic app; +https://github.com/cpt-jason-burke/mtgsme)"
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(root, "docs", "data")
OUT = os.path.join(DATA, "top25.json")
OUT_PP = os.path.join(DATA, "precon-prices.json")
BULK = "https://api.scryfall.com/bulk-data/default-cards"
TOP, FLOOR, NEW_DAYS, WEEK = 25, 5.0, 90, 7
PRICE = {"nonfoil": "usd", "foil": "usd_foil", "etched": "usd_etched"}
FIN = {"nonfoil": "n", "foil": "f", "etched": "e"}
force = "--force" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"}), timeout=120)


def numkey(n):
    m = re.match(r"(\d+)(.*)", n)
    return (int(m.group(1)), m.group(2).lower()) if m else (10 ** 9, n.lower())


old = {}
if os.path.exists(OUT):
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except ValueError:
        old = {}

if args:
    src, stamp = open(args[0], "rb"), ""
else:
    try:
        meta = json.load(get(BULK))
        url, stamp = meta.get("jsonl_download_uri") or meta["download_uri"], meta.get("updated_at", "")
    except (OSError, ValueError, KeyError) as e:
        sys.exit(f"Scryfall's bulk list could not be read ({e}). Nothing was replaced.")
    if stamp and stamp == old.get("src") and not force:
        sys.exit(print("Scryfall's prices haven't changed since the last build; top25.json no change"))
    src = get(url)

sets = json.load(open(os.path.join(DATA, "sets.json"), encoding="utf-8"))
codes = {s["c"].lower(): s["d"] for s in sets}
precons = json.load(open(os.path.join(DATA, "precons.json"), encoding="utf-8"))["d"]
names = {c["n"] for c in json.load(open(os.path.join(DATA, "cards.json"), encoding="utf-8"))}
wanted = {(r[2].lower(), str(r[3]).lower()) for p in precons for r in p.get("cmd", []) + p.get("main", [])}

by_set, prints, seen = {}, {}, 0
try:
    with gzip.open(src, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip().rstrip(",")
            if not line.startswith("{"):
                continue
            c = json.loads(line)
            seen += 1
            if c.get("digital") or "paper" not in (c.get("games") or []):
                continue
            code, num = c["set"].lower(), c["collector_number"]
            key = (code, num.lower())
            if code not in codes and key not in wanted:
                continue
            name = c["name"] if c["name"] in names else c["name"].split(" // ")[0]
            legal = 1 if (c.get("legalities") or {}).get("commander") == "legal" else 0
            p = c.get("prices") or {}
            fins = [(FIN[x], round(float(p[PRICE[x]]), 2)) for x in c.get("finishes") or [] if x in PRICE and p.get(PRICE[x])]
            if code in codes:
                for fin, usd in fins:
                    if usd >= FLOOR:
                        by_set.setdefault(code, []).append([name, num, fin, usd, legal])
            if key in wanted:
                prints[key] = (name, num, code, fins, legal, c.get("finishes") or [])
except (OSError, EOFError, ValueError, KeyError) as e:
    sys.exit(f"Scryfall's bulk file could not be read to the end ({e}). Nothing was replaced.")

if seen < max(int(old.get("cards", 0) * 0.9), 50000) and not force:
    sys.exit(f"Scryfall's bulk file held only {seen} cards (last time {old.get('cards', 0)}). It looks incomplete. Nothing was replaced. Use --force to accept it.")

today = datetime.now(timezone.utc).date()
rank = lambda rows: sorted(rows, key=lambda r: (-r[3], r[0], numkey(r[1]), r[2]))[:TOP]


def keep_or_new(bucket, key, released, rows):
    """Use the new rows if this set or deck is new or due a weekly refresh; else keep last week's."""
    prev = (old.get(bucket) or {}).get(key)
    try:
        young = date(*map(int, released.split("-")[:3])) > today - timedelta(days=NEW_DAYS)
    except (AttributeError, TypeError, ValueError):
        young = True
    if prev and not young and not force and date.fromisoformat(prev["u"]) > today - timedelta(days=WEEK):
        return prev
    rows = rank(rows)
    if prev and prev["r"] == rows:
        return prev
    return {"u": today.isoformat(), "r": rows} if rows else None


out_sets = {}
for code in sorted(codes):
    e = keep_or_new("sets", code, codes[code], by_set.get(code, []))
    if e:
        out_sets[code] = e

out_decks, totals, found, rows_total = {}, {}, 0, 0
for p in sorted(precons, key=lambda p: (p["s"], p["n"])):
    rows, done, total, priced, n = [], set(), 0.0, 0, 0
    for r in p.get("cmd", []) + p.get("main", []):
        rows_total += 1
        n += 1
        x = prints.get((r[2].lower(), str(r[3]).lower()))
        if not x:
            continue
        found += 1
        name, num, code, fins, legal, all_fins = x
        if p["y"] != "sld" and fins:
            main = "n" if "nonfoil" in all_fins else None
            fins = [f for f in fins if f[0] == main] or ([] if main else fins[:1])
            total += fins[0][1] * r[0] if fins else 0
            priced += 1 if fins else 0
        for fin, usd in fins:
            if usd >= FLOOR and (code, num, fin) not in done:
                done.add((code, num, fin))
                rows.append([name, num, fin, usd, legal, code])
    e = keep_or_new("decks", p["s"] + ":" + p["n"], p["d"], rows)
    if e:
        out_decks[p["s"] + ":" + p["n"]] = e
    if p["y"] == "cmd" and priced:
        totals[p["s"] + ":" + p["n"]] = [round(total), priced, n]

data = {
    "about": "The most valuable printings in each set (sets, keyed by set code) and in each Commander deck and Secret Lair drop (decks, keyed by 'set:deck name' as in precons.json). "
             "Each entry: u is the day it was ranked, r the rows [name, collector number, finish n|f|e, price in US dollars, 1 if legal in Commander else 0] (deck rows add the set code). "
             f"Prices are Scryfall's (TCGplayer's market price), without shipping or tax; only the top {TOP} worth ${FLOOR:.0f} or more are kept. "
             "Built by tools/build_top25.py from Scryfall's default_cards bulk file; don't edit by hand.",
    "src": stamp or old.get("src", ""),
    "cards": seen,
}
dump = lambda x: json.dumps(x, ensure_ascii=False, separators=(",", ":"))
body = lambda d: "{\n" + ",\n".join(dump(k) + ":" + dump(v) for k, v in d.items()) + "\n}"
text = dump(data)[:-1] + ',"sets":' + body(out_sets) + ',"decks":' + body(out_decks) + "}\n"
prev_text = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
# a new bulk stamp alone isn't worth a commit; write only when a list changed
same = prev_text and json.loads(prev_text).get("sets") == out_sets and json.loads(prev_text).get("decks") == out_decks
if not same:
    with open(OUT + ".tmp", "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(OUT + ".tmp", OUT)
# precon totals: each Commander deck's market value, for sorting the precon picker
pp_old = {}
if os.path.exists(OUT_PP):
    try:
        pp_old = json.load(open(OUT_PP, encoding="utf-8"))
    except ValueError:
        pp_old = {}
pp_same = pp_old.get("d") == totals
if len(totals) < len(pp_old.get("d") or {}) * 0.9 and not force:
    pp_same = True
    print(f"Only {len(totals)} precon totals (last time {len(pp_old.get('d') or {})}); precon-prices.json kept.")
elif not pp_same:
    pp = {"about": "Each Commander deck's total market value in US dollars (keyed by 'set:deck name' as in precons.json): [total rounded to whole dollars, list lines priced, list lines]. "
                   "Uses the exact printings in the deck, non-foil when the printing has it. Scryfall's prices (TCGplayer's market price), without shipping or tax. "
                   "Built by tools/build_top25.py; don't edit by hand.",
          "u": today.isoformat(), "d": totals}
    with open(OUT_PP + ".tmp", "w", encoding="utf-8") as f:
        f.write(dump({k: v for k, v in pp.items() if k != "d"})[:-1] + ',"d":' + body(totals) + "}\n")
    os.replace(OUT_PP + ".tmp", OUT_PP)
print(f"{seen} Scryfall cards; {len(out_sets)} sets and {len(out_decks)} decks with a card worth ${FLOOR:.0f}+; "
      f"{found} of {rows_total} deck rows matched a printing; top25.json {'no change' if same else 'written'} ({len(text) // 1024} KB); "
      f"{len(totals)} precon totals, precon-prices.json {'no change' if pp_same else 'written'}")
