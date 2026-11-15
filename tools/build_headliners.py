"""Build the headliner data for the app: docs/data/headliners.json.

Headliners are the printings Scryfall tags as headliners (is:headliner), the rarest chase cards.
For each one it records the printing from Scryfall (name, set, number, date, artist, finishes, promo types, pictures),
TCGplayer prices from TCGCSV (matched by TCGplayer product id, or by set code and collector number),
and the hand-entered facts in tools/headliner_facts.json (signer, print run, products that hold it, sources).

usage: python3 tools/build_headliners.py [--force]
Nothing is replaced if Scryfall's answer looks incomplete. Prices that can't be fetched keep their previous values.
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import date, datetime, timezone

UA = "MTGSME/1.0 (headliner prices for a personal Magic app; +https://github.com/cpt-jason-burke/mtgsme)"
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(root, "docs", "data", "headliners.json")
FACTS = os.path.join(root, "tools", "headliner_facts.json")
SEARCH = "https://api.scryfall.com/cards/search?" + urllib.parse.urlencode({"q": "is:headliner", "unique": "prints", "order": "released", "dir": "asc", "include_extras": "true"})
TCG = "https://tcgcsv.com/tcgplayer/1"   # category 1 is Magic
SUBTYPE = {"nonfoil": "Normal", "foil": "Foil", "etched": "Foil"}
SF_PRICE = {"nonfoil": "usd", "foil": "usd_foil", "etched": "usd_etched"}
force = "--force" in sys.argv


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def scryfall():
    cards, url, total = [], SEARCH, None
    while url:
        page = get(url)
        if page.get("object") != "list":
            raise ValueError(str(page.get("details") or page.get("object")))
        total = page.get("total_cards", total)
        cards += page["data"]
        url = page.get("next_page") if page.get("has_more") else None
        time.sleep(0.1)
    if total is not None and len(cards) != total:
        raise ValueError(f"got {len(cards)} of {total} cards")
    for c in cards:
        if not (c.get("set") and c.get("collector_number") and c.get("name")):
            raise ValueError("a card without set, number or name")
    return cards


def tcgcsv(cards):
    """Price rows by TCGplayer product id ({id: {subtype: row}}), product ids by (set, number) for cards Scryfall gives none,
    and the sets that were read. A set whose prices can't be read is left out, so its cards keep their previous prices."""
    groups = get(TCG + "/groups")
    if not groups.get("success") or len(groups.get("results") or []) < 100:
        raise ValueError("the group list looks incomplete")
    gids = {}
    for g in groups["results"]:
        gids.setdefault((g.get("abbreviation") or "").upper(), []).append(g["groupId"])
    prices, ids, done = {}, {}, set()
    for code in sorted({c["set"].upper() for c in cards}):
        try:
            for gid in gids.get(code, []):
                time.sleep(0.2)
                rows = get(f"{TCG}/{gid}/prices")
                if not rows.get("success"):
                    raise ValueError(f"group {gid} answered without success")
                for r in rows["results"]:
                    prices.setdefault(r["productId"], {})[r.get("subTypeName") or "Normal"] = r
                if any(not c.get("tcgplayer_id") for c in cards if c["set"].upper() == code):
                    time.sleep(0.2)
                    for p in get(f"{TCG}/{gid}/products")["results"]:
                        num = next((e["value"] for e in p.get("extendedData") or [] if e.get("name") == "Number"), "")
                        ids[(code, str(num).lower())] = p["productId"]
            if gids.get(code):
                done.add(code)
        except (OSError, ValueError, KeyError) as e:
            print(f"TCGCSV {code}: {e}; keeping its previous prices", file=sys.stderr)
    return prices, ids, done


def numkey(n):
    m = re.match(r"(\d+)(.*)", n)
    return (int(m.group(1)), m.group(2).lower()) if m else (10 ** 9, n.lower())


def usd(x):
    return round(float(x), 2) if x not in (None, "") else None


def picture(c):
    u = c.get("image_uris") or (c.get("card_faces") or [{}])[0].get("image_uris") or {}
    return {"s": u.get("small"), "n": u.get("normal"), "l": u.get("large"), "a": u.get("art_crop")} if u else None


old = {}
if os.path.exists(OUT):
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except ValueError:
        old = {}
old_cards = {c["key"]: c for c in old.get("cards", [])}
facts = json.load(open(FACTS, encoding="utf-8"))

try:
    raw = scryfall()
except (OSError, ValueError, KeyError) as e:
    sys.exit(f"Scryfall search failed ({e}). Nothing was replaced.")
keys = {f'{c["set"]}/{c["collector_number"]}'.lower() for c in raw}
missing = [k for k in facts.get("cards", {}) if k not in keys]
floor = int(len(old_cards) * 0.9)
if (missing or len(raw) < max(floor, 1)) and not force:
    sys.exit(f"Scryfall returned {len(raw)} headliners (expected at least {max(floor, 1)})" + (", missing " + ", ".join(missing) if missing else "") +
             ". It looks incomplete. Nothing was replaced. Use --force to accept it.")

try:
    prices, ids, done = tcgcsv(raw)
except (OSError, ValueError, KeyError) as e:
    print(f"TCGCSV failed ({e}); keeping the previous prices", file=sys.stderr)
    prices, ids, done = {}, {}, set()

cards, sets = [], {}
for c in sorted(raw, key=lambda c: (-date.fromisoformat(c["released_at"]).toordinal(), c["set"], numkey(c["collector_number"]))):
    code, num = c["set"].upper(), c["collector_number"]
    key = f"{code}/{num}".lower()
    fin = c.get("finishes") or ["nonfoil"]
    main = fin[0] if len(fin) == 1 else "nonfoil"
    pid = c.get("tcgplayer_id") or ids.get((code, num.lower()))
    if code in done:
        rows = prices.get(pid, {}) if pid else {}
        r = rows.get(SUBTYPE[main]) or (next(iter(rows.values())) if len(rows) == 1 else None) or {}
        tcg = {"id": pid, "url": f"https://www.tcgplayer.com/product/{pid}", "low": usd(r.get("lowPrice")), "market": usd(r.get("marketPrice"))} if pid else None
    else:
        tcg = old_cards.get(key, {}).get("tcg")
    card = {
        "key": key, "set": code, "num": num, "name": c["name"].split(" // ")[0], "date": c["released_at"], "artist": c.get("artist", ""),
        "fin": fin, "tags": sorted(c.get("promo_types") or []), "border": c.get("border_color", ""), "img": picture(c),
        "scry": (c.get("scryfall_uri") or "").split("?")[0], "cmd": (c.get("legalities") or {}).get("commander", ""),
        "tcg": tcg, "sf": usd((c.get("prices") or {}).get(SF_PRICE[main])),
    }
    card.update(facts.get("cards", {}).get(key, {}))
    cards.append(card)
    s = sets.setdefault(code, {"code": code, "name": c.get("set_name", code), "date": c["released_at"], "count": 0})
    s["count"] += 1
for code, s in sets.items():
    s.update(facts.get("sets", {}).get(code.lower(), {}))

data = {
    "about": "Headliner printings from Scryfall (is:headliner) with TCGplayer prices from TCGCSV and hand-entered facts from tools/headliner_facts.json. "
             "Prices are US dollars without shipping or tax: tcg.low is the lowest current listing (an asking price, not a sale), tcg.market is TCGplayer's market price from recent sales, "
             "sf is Scryfall's price for the printing's finish (also TCGplayer's market price). checked is the day TCGCSV was last read. Built by tools/build_headliners.py; don't edit by hand.",
    "featured": facts.get("featured", ""),
    "checked": datetime.now(timezone.utc).date().isoformat() if done else old.get("checked", ""),
    "sets": list(sets.values()),
}
dump = lambda x: json.dumps(x, ensure_ascii=False, separators=(",", ":"))
text = dump(data)[:-1] + ',"cards":[\n' + ",\n".join(dump(c) for c in cards) + "\n]}\n"
same = os.path.exists(OUT) and open(OUT, encoding="utf-8").read() == text
if not same:
    with open(OUT + ".tmp", "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(OUT + ".tmp", OUT)
priced = sum(1 for c in cards if c["tcg"] and (c["tcg"]["low"] or c["tcg"]["market"]))
print(f"{len(cards)} headliners in {len(sets)} sets; TCGplayer read for {len(done)} of {len(sets)} sets, {priced} cards with a price; headliners.json {'no change' if same else 'written'}")
