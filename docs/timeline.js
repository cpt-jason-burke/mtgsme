/* MTGSME precon timeline: the data side of Sets > Precon timeline. Pure functions with no page access; app.js draws the screen.
 * Decks, sets, release dates, commanders and card lists all come from data/precons.json, which the refresh job rebuilds from the
 * card source about every 6 hours, so a new precon shows up here on its own once the source lists it.
 * Hand-kept: data/precon-themes.json (one-line summaries) and data/precon-upcoming.json (decks announced before the source has them). */
(function (root) {
  "use strict";

  const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  // some source dates lack the leading zero ("2022-11-1"); pad them so dates sort and parse
  const normDate = (d) => String(d || "").replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (m, y, mo, da) => y + "-" + mo.padStart(2, "0") + "-" + da.padStart(2, "0"));
  const CE = /\s*collector'?s edition/i;
  const isCE = (name) => CE.test(name);

  // Every Commander precon as one row. precons: the file's deck list (each deck has its position in `i`);
  // cardName(i): a card's name from its position in the card file; extra: { themes: {"set:deck name": text}, up: [announced decks] }.
  // Secret Lair Commander decks are Commander decks whose set code is "sld". Collector's Editions are flagged `ce`.
  function rows(precons, cardName, extra) {
    const ex = extra || {}, themes = ex.themes || {}, out = [];
    for (const p of precons || []) {
      if (p.y !== "cmd") continue;
      const d = normDate(p.d);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;   // the logic check makes sure no deck is lost this way
      out.push({
        p, i: p.i, n: p.n, d, y: +d.slice(0, 4), s: p.s, sn: p.sn, sl: p.s === "sld", ce: isCE(p.n),
        cmd: (p.cmd || []).map((r) => cardName(r[1])),
        th: themes[p.s + ":" + p.n] || themes[p.s + ":" + p.n.replace(CE, "")] || "",
        names: () => (p.cmd || []).concat(p.main || []).map((r) => cardName(r[1])),
      });
    }
    for (const u of ex.up || []) {
      if (!u || !u.n || !/^\d{4}-\d{2}-\d{2}$/.test(u.d || "")) continue;
      const y = +u.d.slice(0, 4), nu = norm(u.n), uc = [].concat(u.cmd || []).map(norm);
      // an announced deck drops out once the data has it: a deck in the same year with the same name (or that name plus a suffix, either way round) or the same commander
      if (out.some((r) => !r.ann && r.y === y && (norm(r.n) === nu || norm(r.n).startsWith(nu + " ") || nu.startsWith(norm(r.n) + " ") || r.cmd.some((c) => uc.includes(norm(c)))))) continue;
      out.push({ p: null, i: -1, n: u.n, d: u.d, y, s: u.s || "", sn: u.sn || "Announced", sl: !!u.sl, ce: false, cmd: [].concat(u.cmd || []), th: u.theme || "", ann: true, names: () => [] });
    }
    return out;
  }

  const blob = (r) => r.h || (r.h = norm([r.n, r.sn, r.th, r.cmd.join(" ")].join(" ")));
  const cardsOf = (r) => (r.cl != null ? r.cl : (r.cl = norm(r.names().join("|"))));   // built the first time someone searches

  // opts: { from, to (years), sl: "hide" | "include" | "only", ce: show Collector's Editions, q: search text }.
  // withQuery false ignores the search text, which is how the year bars count.
  function visible(list, opts, withQuery) {
    const o = opts || {}, q = withQuery ? norm(o.q) : "";
    return list.filter((r) => {
      if ((o.from != null && r.y < o.from) || (o.to != null && r.y > o.to)) return false;
      if ((o.sl === "hide" && r.sl) || (o.sl === "only" && !r.sl) || (!o.ce && r.ce)) return false;
      return !q || blob(r).includes(q) || cardsOf(r).includes(q);
    });
  }

  // [first year, last year] of the data, or null when there are no decks
  function years(list) {
    if (!list.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (const r of list) { if (r.y < lo) lo = r.y; if (r.y > hi) hi = r.y; }
    return [lo, hi];
  }

  // decks per year, every year from the first to the last (so a gap year shows as 0): Map year -> { r: Commander decks, s: Secret Lair decks }
  function counts(list, opts) {
    const span = years(list), out = new Map();
    if (!span) return out;
    for (let y = span[0]; y <= span[1]; y++) out.set(y, { r: 0, s: 0 });
    for (const r of visible(list, opts, false)) out.get(r.y)[r.sl ? "s" : "r"]++;
    return out;
  }

  // one list of decks grouped by set (all Secret Lair decks form one group), oldest set first
  function groups(list) {
    const m = new Map();
    for (const r of list) { const k = r.sl ? "sld" : r.s || r.sn; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    const by = (a, b) => a.d.localeCompare(b.d) || a.n.localeCompare(b.n);
    return [...m.values()].map((g) => g.sort(by)).sort((a, b) => a[0].d.localeCompare(b[0].d) || a[0].sn.localeCompare(b[0].sn));
  }

  // the newest deck already released (announced decks don't count), or undefined
  function latest(list, today) {
    return list.filter((r) => !r.ann && r.d <= today).sort((a, b) => b.d.localeCompare(a.d) || a.n.localeCompare(b.n))[0];
  }

  // the year to open on: this year, or the latest earlier year that has decks, within [from, to]
  function defaultYear(list, today, from, to) {
    const have = new Set(list.map((r) => r.y));
    let y = Math.min(+today.slice(0, 4), to);
    while (y > from && !have.has(y)) y--;
    return y;
  }

  const api = { norm, normDate, isCE, rows, visible, years, counts, groups, latest, defaultYear };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MTGTimeline = api;
})(typeof self !== "undefined" ? self : this);
