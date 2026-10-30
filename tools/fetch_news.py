"""Fetch Magic news headlines for the MTGSME homepage and write docs/data/news.json.

Sources: Wizards' news hub, EDHREC articles, and r/magicTCG (posts flaired as leaks are marked).
Each source is fetched separately; a source that fails is recorded with its error and skipped.
usage: python3 tools/fetch_news.py
"""
import html, json, os, re, sys, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "data", "news.json")
UA = "MTGSME/1.0 (news headlines for a personal Magic app; +https://github.com/cpt-jason-burke/mtgsme)"
LIMIT = 15


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/json, text/html;q=0.8, */*;q=0.5"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def iso(text):
    if not text:
        return ""
    try:
        return parsedate_to_datetime(text).astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except ValueError:
        return ""


def clean(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t or ""))).strip()


def first(*els):
    """First element that exists (an XML element with no children is falsy, so `or` cannot be used)."""
    return next((e for e in els if e is not None), None)


def parse_feed(data, source):
    """RSS 2.0 or Atom."""
    root = ET.fromstring(data)
    ns = {"a": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/"}
    items = []
    for it in root.iter("item"):
        img = first(it.find("media:content", ns), it.find("media:thumbnail", ns), it.find("enclosure"))
        items.append({"title": clean(it.findtext("title")), "link": (it.findtext("link") or "").strip(), "date": iso(it.findtext("pubDate")), "source": source,
                      "img": img.get("url") if img is not None and (img.get("type") or "image").startswith("image") else ""})
    for e in root.iter("{http://www.w3.org/2005/Atom}entry"):
        link = first(e.find("a:link[@rel='alternate']", ns), e.find("a:link", ns))
        items.append({"title": clean(e.findtext("a:title", default="", namespaces=ns)), "link": link.get("href") if link is not None else "",
                      "date": iso(e.findtext("a:updated", default="", namespaces=ns) or e.findtext("a:published", default="", namespaces=ns)), "source": source, "img": ""})
    return [i for i in items if i["title"] and i["link"]][:LIMIT]


def wizards():
    # Feed first; if Wizards offers none, read article links off the news page itself.
    for url in ("https://magic.wizards.com/en/rss/rss.xml", "https://magic.wizards.com/en/news/rss.xml", "https://magic.wizards.com/en/news.rss"):
        try:
            items = parse_feed(get(url), "Wizards")
            if items:
                return items
        except Exception:
            continue
    page = get("https://magic.wizards.com/en/news").decode("utf-8", "replace")
    return parse_wizards_page(page)


def parse_wizards_page(page):
    items, seen = [], set()
    for m in re.finditer(r'<a[^>]+href="((?:https://magic\.wizards\.com)?/en/news/[a-z0-9-]+/[a-z0-9-]+)"[^>]*>(.*?)</a>', page, re.S):
        link, inner = m.group(1), m.group(2)
        if link.startswith("/"):
            link = "https://magic.wizards.com" + link
        title = clean(inner)
        if link in seen or len(title) < 12:
            continue
        seen.add(link)
        img = re.search(r'<img[^>]+src="([^"]+)"', inner)
        items.append({"title": title[:180], "link": link, "date": "", "source": "Wizards", "img": img.group(1) if img else ""})
    return items[:LIMIT]


def edhrec():
    return parse_feed(get("https://edhrec.com/articles/feed"), "EDHREC")


def reddit():
    data = json.loads(get("https://www.reddit.com/r/magicTCG/hot.json?limit=40&raw_json=1"))
    return parse_reddit(data)


def parse_reddit(data):
    out = []
    for c in data.get("data", {}).get("children", []):
        p = c.get("data", {})
        if p.get("stickied"):
            continue
        flair = p.get("link_flair_text") or ""
        thumb = p.get("thumbnail") or ""
        out.append({"title": clean(p.get("title")), "link": "https://www.reddit.com" + p.get("permalink", ""), "date": datetime.fromtimestamp(p.get("created_utc", 0), timezone.utc).isoformat(),
                    "source": "r/magicTCG", "flair": flair, "leak": "leak" in flair.lower() or "leak" in (p.get("title") or "").lower()[:40],
                    "score": p.get("score", 0), "comments": p.get("num_comments", 0), "img": thumb if thumb.startswith("http") else ""})
    return out[:25]


def main():
    result = {"built": datetime.now(timezone.utc).isoformat(), "sources": {}}
    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT)).get("sources", {})
        except ValueError:
            old = {}
    for key, fn in (("wizards", wizards), ("edhrec", edhrec), ("reddit", reddit)):
        try:
            items = fn()
            result["sources"][key] = {"ok": bool(items), "items": items, "error": "" if items else "no items found"}
        except Exception as e:   # keep the last good headlines when a source has a bad day
            prev = old.get(key, {})
            result["sources"][key] = {"ok": False, "items": prev.get("items", []), "error": f"{type(e).__name__}: {e}"[:200]}
        print(key, "ok" if result["sources"][key]["ok"] else "FAILED " + result["sources"][key]["error"], len(result["sources"][key]["items"]), file=sys.stderr)
    # only rewrite the file when the headlines changed, so an unchanged run publishes nothing
    strip = lambda r: {k: [i.get("link") for i in v["items"]] for k, v in r["sources"].items()}
    if old and strip({"sources": old}) == strip(result):
        print("headlines unchanged", file=sys.stderr)
        return
    json.dump(result, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
