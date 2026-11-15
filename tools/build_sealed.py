"""Build the sealed product price comparison for the app: docs/data/sealed.json.

For every set released in the last two years, and every Commander deck set of any age, it lists the sealed products
(booster packs and boxes, bundles, Commander decks, scene boxes, cases and so on) with each store's price:
  TCGplayer, from TCGCSV: the lowest current listing (an asking price) and the market price (recent sales);
  Card Kingdom, from its sealed price list: the retail price and how many are in stock.
Products are matched between the stores by set and normalized name. List prices are hand-entered in tools/sealed_list.json
(keyed by TCGplayer product id, from Wizards' collecting articles).

usage: python3 tools/build_sealed.py [--force]
A set whose TCGplayer prices can't be read keeps its previous entry; if Card Kingdom's list can't be read, its previous prices are kept.
"""
import json, os, re, sys, time, urllib.request
from datetime import date, datetime, timedelta, timezone

UA = "MTGSME/1.0 (personal Magic app; +https://github.com/cpt-jason-burke/mtgsme)"
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(root, "docs", "data", "sealed.json")
LIST = os.path.join(root, "tools", "sealed_list.json")
TCG = "https://tcgcsv.com/tcgplayer/1"   # category 1 is Magic
CK = "https://api.cardkingdom.com/api/sealed_pricelist"
YEARS = 2
force = "--force" in sys.argv


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def usd(x):
    try:
        return round(float(x), 2) or None
    except (TypeError, ValueError):
        return None


WORDS = {"display": "box", "decks": "deck", "boosters": "booster", "timelines": "timeline", "collectors": "collector", "edition": "ce"}
DROP = {"magic", "the", "gathering", "mtg", "s", "a", "of", "and", "deck", "universes", "beyond"}


def norm(name, setname):
    """A product name as a sorted bag of words, without the set's own name, so both stores' spellings meet."""
    words = lambda s: [WORDS.get(w, w) for w in re.sub(r"[^a-z0-9]+", " ", s.lower().replace("'", "")).split()]
    own = set(words(setname)) - {"commander"}
    w = [x for x in words(name) if x not in DROP and x not in own]
    if "ce" in w:
        w = [x for x in w if x != "collector"]
    return " ".join(sorted(w))


# extra words that mean a different product, so the second pass must not match across them
VARIANT = {"omega", "sample", "japanese", "sleeved", "gift", "deluxe", "case", "box", "bundle", "minimal", "packaging", "kit", "set", "foil", "promo", "prerelease", "ce", "collector", "game", "pack", "master"}
KIND = ["play booster pack", "play booster", "collector booster pack", "collector booster", "booster pack", "booster", "bundle", "commander deck", "deck", "scene box", "draft night", "prerelease", "starter", "kit"]


def order(p):
    n = p["n"].lower()
    kind = next((i for i, k in enumerate(KIND) if k in n), len(KIND))
    return (1 if p.get("case") else 0, kind, 1 if "collector's edition" in n else 0, n)


old = {}
if os.path.exists(OUT):
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except ValueError:
        old = {}
old_sets = old.get("sets", {})
listed = {str(k): v for k, v in json.load(open(LIST, encoding="utf-8")).get("prices", {}).items()}
sets = json.load(open(os.path.join(root, "docs", "data", "sets.json"), encoding="utf-8"))
today = datetime.now(timezone.utc).date()
cutoff = (today - timedelta(days=365 * YEARS)).isoformat()
want = {s["c"].lower(): s for s in sets if s.get("k") == "commander" or s.get("d", "") >= cutoff}

try:
    groups = get(TCG + "/groups")
    if not groups.get("success") or len(groups.get("results") or []) < 100:
        raise ValueError("the group list looks incomplete")
except (OSError, ValueError, KeyError) as e:
    sys.exit(f"TCGCSV's set list could not be read ({e}). Nothing was replaced.")
gids = {}
for g in groups["results"]:
    gids.setdefault((g.get("abbreviation") or "").lower(), []).append(g["groupId"])

# Card Kingdom: {set code: {normalized name: row}}
ck, ck_ok = {}, False
try:
    rows = get(CK).get("data") or []
    if len(rows) < 500:
        raise ValueError(f"only {len(rows)} products")
    # Card Kingdom files Commander decks under "<set> Commander Decks" and some sets under "Universes Beyond: <set>"
    ed = lambda n: re.sub(r"[^a-z0-9]+", " ", re.sub(r"^universes beyond: | decks?$", "", n.lower().replace("'", ""))).strip()
    by_name = {ed(s["n"]): s["c"].lower() for s in sorted(sets, key=lambda s: s["c"].lower() not in want)}
    for r in rows:
        e = ed(r.get("edition") or "")
        code = by_name.get(e) or by_name.get(e + " commander")
        if code in want and not re.search(r"pure bulk|set of |non-english|\(\d+ct\)", r["name"], re.I):
            ck.setdefault(code, {})[norm(r["name"], want[code]["n"])] = r
    ck_ok = True
except (OSError, ValueError, KeyError) as e:
    print(f"Card Kingdom's list could not be read ({e}); keeping its previous prices", file=sys.stderr)

out, read, failed = {}, 0, 0
for code in sorted(want):
    s = want[code]
    prev = {p.get("id") or p["n"]: p for p in old_sets.get(code, {}).get("p", [])}
    products = []
    try:
        for gid in gids.get(code, []):
            time.sleep(0.15)
            items = get(f"{TCG}/{gid}/products")
            time.sleep(0.15)
            prices = get(f"{TCG}/{gid}/prices")
            if not items.get("success") or not prices.get("success"):
                raise ValueError(f"group {gid} answered without success")
            price = {r["productId"]: r for r in prices["results"] if (r.get("subTypeName") or "Normal") == "Normal"}
            for p in items["results"]:
                if any(e.get("name") == "Number" for e in p.get("extendedData") or []):
                    continue   # a single card
                r = price.get(p["productId"], {})
                products.append({"n": p["name"], "id": p["productId"], "low": usd(r.get("lowPrice")), "mkt": usd(r.get("marketPrice"))})
        read += 1 if gids.get(code) else 0
    except (OSError, ValueError, KeyError) as e:
        failed += 1
        print(f"TCGCSV {code}: {e}; keeping its previous prices", file=sys.stderr)
        if code in old_sets:
            out[code] = old_sets[code]
        continue
    mine, used = ck.get(code, {}), set()
    for p in products:
        key = norm(p["n"], s["n"])
        r = mine.get(key)
        if ck_ok:
            if r:
                used.add(key)
                p["ck"] = [r["url"], usd(r.get("price_retail")), int(r.get("qty_retail") or 0)]
        elif prev.get(p["id"], {}).get("ck"):
            p["ck"] = prev[p["id"]]["ck"]
    if ck_ok:
        # second pass: a Card Kingdom name whose words all appear in exactly one closest TCGplayer name ("Counter Blitz" in "FINAL FANTASY X Counter Blitz")
        pairs = []
        for key in mine:
            if key in used:
                continue
            words = set(key.split())
            cands = sorted((len(set(norm(p["n"], s["n"]).split()) - words), i) for i, p in enumerate(products)
                           if "ck" not in p and words and words <= set(norm(p["n"], s["n"]).split()) and not (set(norm(p["n"], s["n"]).split()) - words) & VARIANT)
            if cands and (len(cands) == 1 or cands[0][0] < cands[1][0]):
                pairs.append((cands[0][0], key, cands[0][1]))
        for extra, key, i in sorted(pairs):
            if "ck" not in products[i]:
                r = mine[key]
                used.add(key)
                products[i]["ck"] = [r["url"], usd(r.get("price_retail")), int(r.get("qty_retail") or 0)]
        for key, r in mine.items():
            if key not in used:
                products.append({"n": r["name"], "ck": [r["url"], usd(r.get("price_retail")), int(r.get("qty_retail") or 0)]})
    else:
        products += [p for p in prev.values() if not p.get("id")]
    keep = []
    for p in products:
        if not (p.get("low") or p.get("mkt") or (p.get("ck") and p["ck"][1])):
            continue
        if re.search(r"\bcase\b", p["n"], re.I):
            p["case"] = 1
        if str(p.get("id")) in listed:
            p["list"] = listed[str(p["id"])]
        keep.append({k: v for k, v in p.items() if v is not None})
    if keep:
        out[code] = {"n": s["n"], "d": s["d"], "p": sorted(keep, key=order)}

count = sum(len(v["p"]) for v in out.values())
old_count = sum(len(v["p"]) for v in old_sets.values())
if count < old_count * 0.7 and not force:
    sys.exit(f"Only {count} sealed products were found (last time {old_count}). It looks incomplete. Nothing was replaced. Use --force to accept it.")

same_data = out == old_sets
data = {
    "about": "Sealed product prices by set code. Each product: n name, id TCGplayer product id (page: https://www.tcgplayer.com/product/<id>), "
             "low TCGplayer's lowest current listing (an asking price), mkt TCGplayer's market price (recent sales), "
             "ck Card Kingdom [page path after https://www.cardkingdom.com/, retail price, number in stock], list Wizards' list price (hand-entered, tools/sealed_list.json), case 1 for a case of several. "
             "US dollars, without shipping or tax. checked is the day the stores were last read. Built by tools/build_sealed.py; don't edit by hand.",
    "checked": old.get("checked", "") if same_data and old.get("checked") else today.isoformat(),
}
dump = lambda x: json.dumps(x, ensure_ascii=False, separators=(",", ":"))
text = dump(data)[:-1] + ',"sets":{\n' + ",\n".join(dump(k) + ":" + dump(v) for k, v in out.items()) + "\n}}\n"
if not same_data:
    with open(OUT + ".tmp", "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(OUT + ".tmp", OUT)
both = sum(1 for v in out.values() for p in v["p"] if p.get("id") and p.get("ck"))
print(f"{count} sealed products in {len(out)} sets; TCGplayer read for {read} sets ({failed} failed); Card Kingdom {'read' if ck_ok else 'not read'}, {both} products priced at both; "
      f"sealed.json {'no change' if same_data else 'written'} ({len(text) // 1024} KB)")
