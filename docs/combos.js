/* MTGSME combos: known Commander combos from Commander Spellbook (data/combos.json).
 * Pure functions; the app supplies the card lookup. It finds the combos a deck already holds and the
 * cards that would each finish one. It is a list of known combos, not a rules engine: a combo that
 * Commander Spellbook does not list is not found, and every step still has to be checked against the cards. */
(function (root) {
  "use strict";

  const SITE = "https://commanderspellbook.com/combo/";
  // Commander Spellbook's bracket tags, with the brackets its own site shows for each.
  const BRACKETS = { R: ["Ruthless", "4+"], S: ["Spicy", "3-4+"], P: ["Powerful", "3+"], O: ["Oddball", "2-3+"], C: ["Core", "2+"], E: ["Exhibition", "1+"], B: ["Not legal", ""] };

  const cardIds = (c) => c[0].split("--")[0].split("-").map(Number);
  const templateIds = (c) => c[0].split("--").slice(1);

  // index(data, lookup): lookup(name) returns the app's card ({ n, ci, s }) or nothing.
  function index(data, lookup) {
    const name = new Map(), ids = new Map(), by = new Map();
    for (const id in data.cards) {
      // "Front // Back" names are found by their front face, the same way deck import finds them
      const c = lookup(data.cards[id]) || lookup(data.cards[id].split(" // ")[0]);
      if (!c) continue;
      name.set(+id, c.n);
      if (!ids.has(c.n)) ids.set(c.n, []);
      ids.get(c.n).push(+id);
    }
    const size = new Uint8Array(data.combos.length);
    data.combos.forEach((c, i) => {
      const list = cardIds(c);
      size[i] = list.length;
      for (const id of list) { if (!by.has(id)) by.set(id, []); by.get(id).push(i); }
    });
    return { data, lookup, name, ids, by, size };
  }

  // One combo, in words.
  function describe(ix, i) {
    const d = ix.data, c = d.combos[i], x = c[4] || {};
    const list = cardIds(c);
    return {
      id: c[0], url: SITE + c[0] + "/", pop: c[2], tag: c[3], bracket: BRACKETS[c[3]] || null,
      cards: list.map((id) => ix.name.get(id) || d.cards[id]),
      known: list.every((id) => ix.name.has(id)),
      copies: Object.fromEntries(Object.entries(x.q || {}).map(([id, q]) => [ix.name.get(+id) || d.cards[id], q])),
      commander: (x.c || []).map((id) => ix.name.get(id) || d.cards[id]),
      results: c[1].map((f) => d.features[f]).filter(Boolean),
      needs: templateIds(c).map((t) => ((x.tq || {})[t] > 1 ? x.tq[t] + "× " : "") + (d.templates[t] || "another piece")),
    };
  }
  // Combos that need nothing else come first, then the most played. (A combo that also needs a generic piece
  // is counted in every deck that holds its named cards, so its popularity runs high.)
  const loose = (c) => (c.needs.length ? 1 : 0);
  const byPop = (a, b) => loose(a) - loose(b) || b.pop - a.pop || a.cards.length - b.cards.length || (a.id < b.id ? -1 : 1);

  // check(ix, deck, opts): deck is { commanders: [names], cards: [{ n, q }] }.
  // opts.identity ("UB", "" for colorless) keeps one-card-away suggestions inside the commander's colors.
  // Returns { have: [combo], near: [{ n, count, pop, combos }], nearCount }.
  function check(ix, deck, opts) {
    opts = opts || {};
    const qty = new Map(), cmd = new Set();
    const add = (n, q, isCmd) => { for (const id of ix.ids.get(n) || []) { qty.set(id, (qty.get(id) || 0) + q); if (isCmd) cmd.add(id); } };
    (deck.commanders || []).forEach((n) => add(n, 1, true));
    (deck.cards || []).forEach((x) => add(x.n, x.q, false));
    const hits = new Map();   // combo -> how many of its different cards the deck has
    for (const id of qty.keys()) for (const i of ix.by.get(id) || []) hits.set(i, (hits.get(i) || 0) + 1);
    const allowed = opts.identity == null ? null : new Set(opts.identity);
    const have = [], near = new Map();
    for (const [i, h] of hits) {
      const n = ix.size[i];
      if (h < n - 1) continue;
      const c = ix.data.combos[i], x = c[4] || {};
      // a card the combo needs in the command zone only counts when it is the deck's commander
      if ((x.c || []).some((id) => qty.has(id) && !cmd.has(id))) continue;
      if (h === n) {
        if (Object.keys(x.q || {}).every((id) => qty.get(+id) >= x.q[id])) have.push(describe(ix, i));
        continue;
      }
      const miss = cardIds(c).find((id) => !qty.has(id)), card = ix.name.has(miss) && ix.lookup(ix.name.get(miss));
      if (!card || card.s === "banned" || c[3] === "B" || (x.c || []).includes(miss) || (x.q || {})[miss] > 1) continue;
      if (allowed && [...card.ci].some((ch) => !allowed.has(ch))) continue;
      if (!near.has(card.n)) near.set(card.n, []);
      near.get(card.n).push(i);
    }
    have.sort(byPop);
    const groups = [...near].map(([n, list]) => {
      const combos = list.map((i) => describe(ix, i)).sort(byPop);
      return { n, count: combos.length, pop: combos[0].pop, combos: combos.slice(0, opts.each || 3) };
    }).sort((a, b) => loose(a.combos[0]) - loose(b.combos[0]) || b.pop - a.pop || b.count - a.count || (a.n < b.n ? -1 : 1));
    return { have, near: groups.slice(0, opts.limit || 20), nearCount: groups.length };
  }

  // withCards(ix, names, limit): the known combos that use every one of these cards, most popular first.
  function withCards(ix, names, limit) {
    let set = null;
    for (const n of names) {
      const mine = new Set((ix.ids.get(n) || []).flatMap((id) => ix.by.get(id) || []));
      set = set ? new Set([...set].filter((i) => mine.has(i))) : mine;
    }
    const all = [...(set || [])].map((i) => describe(ix, i)).sort(byPop);
    return { count: all.length, combos: all.slice(0, limit || 20) };
  }

  const api = { index, check, withCards, describe, BRACKETS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MTGCombos = api;
})(typeof self !== "undefined" ? self : this);
