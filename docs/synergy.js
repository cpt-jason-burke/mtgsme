/* MTGSME synergy finder: for two or more chosen cards, cards not yet listed that work with them.
 *
 * Ranked: finishes a known combo (Commander Spellbook), then makes a possible loop, then links to two or
 * more of the chosen cards, then to one. Combo results come from the combo list; every other link is found
 * by reading card text (engine.js events, effects.js layers), so it is marked "possible" and must be checked. */
(function (root) {
  "use strict";
  const node = typeof module !== "undefined" && module.exports;
  const ENG = node ? require("./engine.js") : root.MTGEngine;
  const FX = node ? require("./effects.js") : root.MTGEffects;
  const LY = node ? require("./layers.js") : root.MTGLayers;

  const EVENTS = Object.keys(ENG.EVENTS);
  const BIT = Object.fromEntries(EVENTS.map((e, i) => [e, 1 << i]));
  // very common events say little about whether two cards belong together
  const BASE = { mana: 0.15, tap: 0.25, damage: 0.5, attack: 0.7, graveyard: 0.7 };

  // Two bit masks per card: the events its triggers listen for, and the events its text causes.
  function tag(card) {
    let listen = 0, emit = 0, trigEmit = 0;
    for (const ab of ENG.analyzeCard(card).abilities) {
      if (ab.kind === "triggered" || ab.kind === "replacement") for (const e of ab.listens) listen |= BIT[e];
      for (const e of ab.emits) { emit |= BIT[e]; if (ab.kind === "triggered") trigEmit |= BIT[e]; }
    }
    return [listen, emit, trigEmit];
  }

  // index(cards): tags for every card, built in slices so a phone stays responsive. Returns { step(), done, tags, idf }.
  function index(cards) {
    const tags = new Array(cards.length), ix = { cards, tags, done: false, at: 0, idf: null, byName: new Map(cards.map((c) => [c.n, c])) };
    ix.step = (n) => {
      const end = Math.min(cards.length, ix.at + (n || cards.length));
      for (; ix.at < end; ix.at++) tags[ix.at] = tag(cards[ix.at]);
      if (ix.at >= cards.length && !ix.done) {
        const cl = {}, ce = {};
        for (const e of EVENTS) { cl[e] = 0; ce[e] = 0; }
        for (const t of tags) for (const e of EVENTS) { if (t[0] & BIT[e]) cl[e]++; if (t[1] & BIT[e]) ce[e]++; }
        // a link through an event is worth less the more cards share it
        ix.idf = Object.fromEntries(EVENTS.map((e) => [e, { listen: Math.log(cards.length / (1 + cl[e])), emit: Math.log(cards.length / (1 + ce[e])) }]));
        ix.done = true;
      }
      return ix.done;
    };
    return ix;
  }

  const inColors = (c, allowed) => !allowed || [...c.ci].every((ch) => allowed.has(ch));
  const short = (n) => n.split(",")[0];

  // What the chosen cards do in the layer system, for layer links and warnings.
  function layerFacts(chosen) {
    const f = { animates: [], strips: [], anthemFor: [] };
    for (const c of chosen) for (const ab of FX.parseCard(c).abilities) {
      if (ab.kind !== "static") continue;
      for (const t of ab.templates) {
        if (t.who.kind !== "group") continue;
        const makesCreature = t.parts.some((p) => p.layer === "4" && ((p.addCard || []).includes("Creature") || (p.setCard || []).includes("Creature")));
        const fromNon = (t.who.types || []).some((x) => x !== "Creature") || (t.who.notTypes || []).includes("Creature") || (t.who.subtypes || []).length || t.who.any;
        if (makesCreature && fromNon) f.animates.push({ card: c.n, text: t.text });
        if (t.parts.some((p) => p.layer === "6" && p.removeAll) && (t.who.types || []).includes("Creature") && !t.who.other) f.strips.push({ card: c.n, text: t.text, control: t.who.control || "any" });
      }
    }
    return f;
  }
  // A static "creatures you control get +N/+N" or "have [keyword]" effect.
  function anthem(card) {
    for (const ab of FX.parseCard(card).abilities) {
      if (ab.kind !== "static") continue;
      for (const t of ab.templates) {
        if (t.who.kind !== "group" || t.cond || FX.hasUnknown(t.who)) continue;
        const w = t.who;
        if (!(w.types || []).includes("Creature") || w.types.length > 1 || w.control === "opp" || w.subtypes || w.colors || w.anySub || w.withKw || w.counter || w.stat || w.token != null || w.notTypes || w.chosenType || w.chosenColor || w.colorless || w.multicolored || w.supertypes || w.notSupertypes || w.notColors || w.notSubtypes || w.owned || w.any) continue;
        const pt = t.parts.find((p) => p.layer === "7c" && typeof p.p === "number" && typeof p.t === "number" && p.p >= 0 && p.t >= 0 && p.p + p.t > 0);
        const kw = t.parts.find((p) => p.layer === "6" && p.add && p.add.length);
        if (pt || kw) return { text: t.text, size: (pt ? pt.p + pt.t : 0) + (kw ? 1 : 0) };
      }
    }
    return null;
  }

  /* find(chosen, ix, opts)
   *   chosen: the picked cards. ix: index(cards) with step() finished.
   *   opts.identity: "WUBRG" letters allowed (default: the chosen cards' combined colors)
   *   opts.combos: { api: MTGCombos, ix: its index } to add known combos; leave out for mechanical links only
   *   opts.cr: the rules, so cites are only shown when the rule exists. opts.limit: default 30 */
  function find(chosen, ix, opts) {
    opts = opts || {};
    const cite = (n) => (!opts.cr || (opts.cr.rules && opts.cr.rules[n]) ? [n] : []);
    const ident = opts.identity != null ? opts.identity : "WUBRG".split("").filter((ch) => chosen.some((c) => c.ci.includes(ch))).join("");
    const allowed = new Set(ident);
    const picked = new Set(chosen.map((c) => c.n));
    const mine = chosen.map((c) => ({ c, t: tag(c) }));
    const items = new Map();
    const item = (n) => { if (!items.has(n)) items.set(n, { n, tier: 9, score: 0, why: [], links: new Set(), combos: [] }); return items.get(n); };

    // 1. known combos these cards are one card short of, or that use all of them
    if (opts.combos && opts.combos.ix) {
      const C = opts.combos.api, cx = opts.combos.ix;
      const r = C.check(cx, { commanders: [], cards: chosen.map((c) => ({ n: c.n, q: 1 })) }, { identity: ident, limit: 40, each: 2 });
      for (const g of r.near) {
        const it = item(g.n); it.tier = 1; it.score += 100 + Math.log(1 + g.pop);
        for (const cb of g.combos) it.combos.push(cb);
        const cb = g.combos[0];
        it.why.push({ text: "Finishes a known combo with " + cb.cards.filter((x) => x !== g.n).map(short).join(" + ") + (cb.needs.length ? " (also needs " + cb.needs.join(", ") + ")" : "") + ": " + cb.results.slice(0, 3).join(", ") + ".", combo: cb });
      }
      if (chosen.length > 1) {
        const w = C.withCards(cx, chosen.map((c) => c.n), 12);
        for (const cb of w.combos) {
          if (!cb.known || cb.tag === "B") continue;
          for (const n of cb.cards) {
            if (picked.has(n)) continue;
            const c = cx.lookup(n);
            if (!c || c.s === "banned" || !inColors(c, allowed)) continue;
            const it = item(n);
            if (it.combos.some((x) => x.id === cb.id)) continue;
            if (it.tier > 1) { it.tier = Math.min(it.tier, 1.5); it.score += 50 + Math.log(1 + cb.pop); }
            it.combos.push(cb);
            if (it.why.length < 2) it.why.push({ text: "Part of a known combo that uses all of your cards (" + cb.cards.length + " cards in total): " + cb.results.slice(0, 3).join(", ") + ".", combo: cb });
          }
        }
      }
    }
    if (opts.combosOnly) return finish();

    // 2-4. mechanical links
    const facts = layerFacts(chosen);
    for (let i = 0; i < ix.cards.length; i++) {
      const c = ix.cards[i];
      if (picked.has(c.n) || c.s === "banned" || /\bBasic\b/.test(c.t) || !inColors(c, allowed)) continue;
      const t = ix.tags[i];
      if (!t || (!t[0] && !t[1])) continue;
      let score = 0; const linked = new Set(), why = [], mutual = [];
      for (const m of mine) {
        const fed = t[0] & m.t[1], feeds = t[1] & m.t[0];
        if (!fed && !feeds) continue;
        linked.add(m.c.n);
        for (const e of EVENTS) {
          if (fed & BIT[e]) { const v = ix.idf[e].listen * (BASE[e] || 1); score += v; why.push({ v, text: "Triggers on " + ENG.EVENTS[e].label + ", which " + short(m.c.n) + " causes." }); }
          if (feeds & BIT[e]) { const v = ix.idf[e].emit * (BASE[e] || 1) * 1.1; score += v; why.push({ v, text: "Causes " + ENG.EVENTS[e].label + ", which " + short(m.c.n) + " triggers on." }); }
        }
        // each sets the other off through a trigger: a possible loop
        if ((t[2] & m.t[0]) && (m.t[2] & t[0])) mutual.push(m.c.n);
      }
      if (!linked.size) continue;
      const it = item(c.n);
      it.score += score * (1 + 0.5 * (linked.size - 1));
      for (const n of linked) it.links.add(n);
      why.sort((a, b) => b.v - a.v);
      for (const w of why.slice(0, 2)) it.why.push({ text: w.text, heuristic: true, cites: cite("603.2") });
      const tier = mutual.length ? 2 : linked.size >= 2 ? 3 : 4;
      if (mutual.length) { it.loopWith = mutual; it.why.unshift({ text: "Possible loop with " + mutual.map(short).join(" and ") + ": each one's trigger can set off the other's.", heuristic: true, cites: cite("603.2") }); }
      it.tier = Math.min(it.tier, tier);
    }

    // layer links: your cards turn other permanents into creatures, so creature anthems reach them
    if (facts.animates.length) {
      const an = [];
      for (const c of ix.cards) {
        if (picked.has(c.n) || c.s === "banned" || !inColors(c, allowed) || !/Enchantment|Artifact|Creature/.test(c.t)) continue;
        const a = anthem(c);
        if (a) an.push({ c, a });
      }
      an.sort((x, y) => y.a.size - x.a.size || FX.manaValue(x.c.m) - FX.manaValue(y.c.m) || (x.c.n < y.c.n ? -1 : 1));
      for (const { c, a } of an.slice(0, 6)) {
        const it = item(c.n);
        it.tier = Math.min(it.tier, 4); it.score += 2 + a.size / 2;
        it.why.unshift({ text: short(facts.animates[0].card) + " turns other permanents into creatures (layer 4), so \"" + a.text + "\" applies to them too (layer " + (/get/.test(a.text) ? "7c" : "6") + ").", cites: cite("613.1d").concat(cite("613.4c")), layer: true });
      }
    }
    return finish();

    function finish() {
      const out = [...items.values()];
      // a chosen card removes creature abilities: a creature suggested for its own ability stops working
      const facts2 = layerFacts(chosen);
      out.sort((a, b) => a.tier - b.tier || b.score - a.score || (a.n < b.n ? -1 : 1));
      out.length = Math.min(out.length, (opts.limit || 30) + 6);
      const keep = [];
      for (const it of out) {
        const c = ix.byName.get(it.n) || (opts.combos && opts.combos.ix && opts.combos.ix.lookup(it.n));
        it.card = c || null;
        // put the suggestion on the battlefield after the chosen cards and see what the layer rules leave of it
        if (c && LY && facts2.strips.length && !FX.parseCard(c).spell) {
          try {
            const entries = chosen.concat([c]).map((x, i) => ({ id: "s" + i, card: x }));
            const res = LY.resolve(LY.buildState(entries, { lookup: opts.lookup }).state, { lookup: opts.lookup });
            const f = res.permanents.find((p) => p.id === "s" + chosen.length);
            if (f && f.lost.length) {
              if (it.why.some((w) => w.layer) && it.tier >= 4 && !it.links.size) continue;   // the anthem itself is switched off
              it.why = it.why.filter((w) => !w.layer);
              it.warn = { text: "With " + facts2.strips.map((x) => short(x.card)).join(" and ") + " on the battlefield this card loses its abilities (layer 6), so what it does through them stops.", cites: cite("613.1f") };
            } else if (!f && res.sba.some((a) => a.id === "s" + chosen.length)) it.warn = { text: "On this battlefield it would be put into the graveyard: " + res.sba.find((a) => a.id === "s" + chosen.length).text, cites: [] };
          } catch (e) { /* the suggestion stands without the check */ }
        }
        keep.push(it);
      }
      out.length = 0; out.push(...keep);
      const TIER = { 1: "Finishes a known combo", 1.5: "In a known combo with all your cards", 2: "Possible loop", 3: "Works with two or more of your cards", 4: "Works with one of your cards" };
      const limit = opts.limit || 30;
      return { identity: ident, total: items.size, linked: new Set(items.keys()), items: out.slice(0, limit).map((it) => ({ n: it.n, card: it.card, tier: it.tier, label: TIER[it.tier] || "", score: Math.round(it.score * 100) / 100, why: it.why.filter((w) => w.combo).concat(it.why.filter((w) => !w.combo)).slice(0, 3), links: [...it.links], combos: it.combos.slice(0, 2), warn: it.warn || null, possible: it.tier >= 2 })) };
    }
  }

  const api = { index, find, tag, layerFacts };
  if (node) module.exports = api; else root.MTGSynergy = api;
})(typeof self !== "undefined" ? self : this);
