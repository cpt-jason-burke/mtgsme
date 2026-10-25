/* MTGSME deck tools: parse pasted deck lists, check them for Commander, and suggest cards.
 * Pure functions; the app supplies the card list and the engine. */
(function (root) {
  "use strict";

  const HEADER = /^(?:\/\/\s*)?(commanders?|companions?|deck|main(?:board)?|sideboard|maybeboard|considering|tokens?)\s*:?\s*(?:\(\d+\))?\s*$/i;
  const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];
  const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

  // Moxfield, Archidekt, MTGO and plain "1 Card Name" lists.
  function parse(text, lookup) {
    const out = { commanders: [], cards: [], unknown: [], skipped: 0 };
    let section = "main";
    for (let raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const h = line.match(HEADER);
      if (h) { const k = h[1].toLowerCase(); section = k.startsWith("commander") ? "commander" : /^(sideboard|maybeboard|considering|tokens?)$/.test(k) ? "skip" : "main"; continue; }
      const m = line.match(/^(\d+)\s*x?\s+(.+)$/i) || [null, "1", line];
      let qty = parseInt(m[1], 10), name = m[2];
      const cmdr = /\*CMDR\*/i.test(name) || /\[[^\]]*\bcommander\b[^\]]*\]/i.test(name);
      name = name.replace(/\s+\^[^^]*\^/g, "").replace(/\s+\[[^\]]*\]/g, "").replace(/\s+\*[A-Z]+\*/gi, "").replace(/\s+#\S+/g, "")
        .replace(/\s+\([A-Za-z0-9]{2,7}\)(?:\s+[\w★-]+)?\s*$/, "").trim();
      if (section === "skip") { out.skipped += qty; continue; }
      const card = lookup(name) || lookup(name.split(" // ")[0]) || lookup(name.split("/")[0].trim());
      if (!card) { out.unknown.push(line); continue; }
      if (section === "commander" || cmdr) out.commanders.push(card.n);
      else {
        const have = out.cards.find((x) => x.n === card.n);
        if (have) have.q += qty; else out.cards.push({ n: card.n, q: qty });
      }
    }
    return out;
  }

  function manaValue(cost) {
    if (!cost) return 0;
    let v = 0;
    for (const [, s] of cost.matchAll(/\{([^}]+)\}/g)) {
      if (/^\d+$/.test(s)) v += +s;
      else if (/^[xyz]$/i.test(s)) continue;
      else v += /^2\//.test(s) ? 2 : 1;
    }
    return v;
  }
  const mainType = (t) => TYPE_ORDER.find((x) => t.includes(x)) || "Other";
  const isBasic = (c) => /\bBasic\b/.test(c.t);
  const anyNumber = (c) => /a deck can have any number of cards named/i.test(c.o) || /a deck can have up to \w+ cards named/i.test(c.o);

  // Checks against Commander deck construction (rule 903.5).
  function check(deck, byName) {
    const cmd = deck.commanders.map((n) => byName(n)).filter(Boolean);
    const all = deck.cards.map((x) => ({ ...x, c: byName(x.n) })).filter((x) => x.c);
    const identity = new Set(cmd.flatMap((c) => [...c.ci]));
    const r = { total: deck.cards.reduce((s, x) => s + x.q, 0) + cmd.length, identity: "WUBRG".split("").filter((x) => identity.has(x)).join(""),
      offColor: [], duplicates: [], banned: [], gameChangers: [], curve: [0, 0, 0, 0, 0, 0, 0, 0], types: {}, avg: 0 };
    let mvSum = 0, mvN = 0;
    for (const c of cmd) {
      if (c.s === "banned" || c.s === "banned_as_commander") r.banned.push(c.n);
      if (c.g) r.gameChangers.push(c.n);
    }
    for (const x of all) {
      const c = x.c;
      if (cmd.length && [...c.ci].some((ch) => !identity.has(ch))) r.offColor.push(c.n);
      if (x.q > 1 && !isBasic(c) && !anyNumber(c)) r.duplicates.push(c.n);
      if (c.s === "banned") r.banned.push(c.n);
      if (c.g) r.gameChangers.push(c.n);
      const t = mainType(c.t);
      r.types[t] = (r.types[t] || 0) + x.q;
      if (t !== "Land") { const mv = manaValue(c.m); r.curve[Math.min(mv, 7)] += x.q; mvSum += mv * x.q; mvN += x.q; }
    }
    r.avg = mvN ? Math.round((mvSum / mvN) * 100) / 100 : 0;
    return r;
  }

  // Synergy suggestions: cards in the commander's colors that trigger on what the deck does, or do what the deck triggers on.
  const WEIGHT = { mana: 0.15, tap: 0.2, damage: 0.4, graveyard: 0.6, attack: 0.7 };
  function suggest(deck, cards, byName, engine, cache, opts) {
    opts = opts || {};
    const cmd = deck.commanders.map((n) => byName(n)).filter(Boolean);
    const inDeck = new Set(deck.cards.map((x) => x.n).concat(deck.commanders));
    const deckCards = deck.cards.map((x) => byName(x.n)).filter(Boolean).concat(cmd);
    const ident = new Set((cmd.length ? cmd : deckCards).flatMap((c) => [...c.ci]));
    const an = (c) => { let a = cache.get(c.n); if (!a) { a = engine.analyzeCard(c); cache.set(c.n, a); } return a; };
    const emits = {}, listens = {}, tribes = {};
    for (const c of deckCards) {
      for (const ab of an(c).abilities) {
        for (const e of ab.emits) emits[e] = (emits[e] || 0) + 1;
        if (ab.kind === "triggered" || ab.kind === "replacement") for (const e of ab.listens) listens[e] = (listens[e] || 0) + 1;
      }
      if (/Creature/.test(c.t) && c.t.includes(" — ")) for (const s of c.t.split(" — ")[1].split(" ")) tribes[s] = (tribes[s] || 0) + 1;
    }
    const topTribe = Object.entries(tribes).sort((a, b) => b[1] - a[1])[0];
    const tribe = topTribe && topTribe[1] >= 8 ? topTribe[0] : null;
    const scored = [];
    for (const c of cards) {
      if (inDeck.has(c.n) || c.s || /\bBasic\b/.test(c.t) || [...c.ci].some((ch) => !ident.has(ch))) continue;
      let score = 0, why = null, best = 0;
      for (const ab of an(c).abilities) {
        if (ab.kind === "triggered") for (const e of ab.listens) {
          const v = (emits[e] || 0) * (WEIGHT[e] || 1);
          score += v; if (v > best) { best = v; why = "Triggers on " + engine.EVENTS[e].label + ". " + emits[e] + " card" + (emits[e] === 1 ? "" : "s") + " in your deck cause that."; }
        }
        for (const e of ab.emits) {
          const v = (listens[e] || 0) * 1.2 * (WEIGHT[e] || 1);
          score += v; if (v > best) { best = v; why = "Causes " + engine.EVENTS[e].label + ", which " + listens[e] + " card" + (listens[e] === 1 ? "" : "s") + " in your deck trigger on."; }
        }
      }
      if (tribe && new RegExp("\\b" + tribe + "s?\\b").test(c.o)) { const v = 3 + tribes[tribe] / 4; score += v; if (v > best) { best = v; why = "Rewards " + tribe + "s, and your deck has " + tribes[tribe] + "."; } }
      if (score > 0 && why) scored.push({ n: c.n, score, why });
    }
    scored.sort((a, b) => b.score - a.score);
    return { identity: [...ident].join(""), tribe, items: scored.slice(0, opts.limit || 30) };
  }

  function exportText(deck) {
    return deck.commanders.map((n) => "1 " + n + " *CMDR*").concat(deck.cards.map((x) => x.q + " " + x.n)).join("\n");
  }

  const api = { parse, check, suggest, manaValue, mainType, exportText, TYPE_ORDER, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MTGDeck = api;
})(typeof self !== "undefined" ? self : this);
