/* MTGSME deck tools: parse pasted deck lists, check them for Commander, and suggest cards.
 * Pure functions; the app supplies the card list and the engine. */
(function (root) {
  "use strict";

  const HEADER = /^(?:\/\/\s*)?(commanders?|companions?|deck|main(?:board)?|sideboard|maybeboard|considering|tokens?)\s*:?\s*(?:\(\d+\))?\s*$/i;
  const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];
  const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

  // Moxfield, Archidekt, MTGO and plain "1 Card Name" lists. "(SET) 123 *F*" after a name is kept as that card's
  // printing in out.prints ({ name: { p: "set/123", f: "foil"|"etched" } }); the first printing listed for a name wins.
  // Besides the deck it notes what a missing commander could be: a sideboard (MTGO keeps the commander there)
  // and the last block after a blank line (MTGO text files). guessCommanders() decides.
  function parse(text, lookup) {
    const out = { commanders: [], companions: [], cards: [], unknown: [], skipped: 0, sideboard: [], lastBlock: [], prints: {} };
    let section = "main", headed = false;
    const blocks = [[]];
    for (let raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) { if (blocks[blocks.length - 1].length) blocks.push([]); continue; }
      const h = line.match(HEADER);
      if (h) {
        const k = h[1].toLowerCase();
        section = k.startsWith("commander") ? "commander" : k.startsWith("companion") ? "companion" : k === "sideboard" ? "sideboard" : /^(maybeboard|considering|tokens?)$/.test(k) ? "skip" : "main";
        headed = true; continue;
      }
      const m = line.match(/^(\d+)\s*x?\s+(.+)$/i) || [null, "1", line];
      let qty = parseInt(m[1], 10), name = m[2];
      const cmdr = /\*CMDR\*/i.test(name) || /\[[^\]]*\bcommander\b[^\]]*\]/i.test(name);
      const fin = /\s\*E\*/i.test(name) ? "etched" : /\s\*F\*/i.test(name) ? "foil" : "";
      name = name.replace(/\s+\^[^^]*\^/g, "").replace(/\s+\[[^\]]*\]/g, "").replace(/\s+\*[A-Z]+\*/gi, "").replace(/\s+#\S+/g, "");
      const pm = name.match(/\s+\(([A-Za-z0-9]{2,7})\)(?:\s+([\w★†-]+))?\s*$/);
      if (pm) name = name.slice(0, pm.index);
      name = name.trim();
      if (section === "skip") { out.skipped += qty; continue; }
      let card = lookup(name) || lookup(name.split(" // ")[0]) || lookup(name.split("/")[0].trim());
      if (!card) { out.unknown.push(line); continue; }
      // a back face or second half is the same card as its front face
      if (card.f && card.f[0] !== card.n) card = lookup(card.f[0]) || card;
      if (pm && pm[2] && !out.prints[card.n] && section !== "sideboard") out.prints[card.n] = Object.assign({ p: pm[1].toLowerCase() + "/" + pm[2] }, fin ? { f: fin } : {});
      if (section === "sideboard") { out.skipped += qty; out.sideboard.push({ n: card.n, q: qty }); continue; }
      if (section === "companion") { if (!out.companions.includes(card.n)) out.companions.push(card.n); continue; }
      if (section === "commander" || cmdr) { if (!out.commanders.includes(card.n)) out.commanders.push(card.n); }
      else {
        const have = out.cards.find((x) => x.n === card.n);
        if (have) have.q += qty; else out.cards.push({ n: card.n, q: qty });
        blocks[blocks.length - 1].push({ n: card.n, q: qty });
      }
    }
    const filled = blocks.filter((b) => b.length);
    if (!headed && filled.length > 1) out.lastBlock = filled[filled.length - 1];
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
  const NUMBERS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  // How many copies a deck may hold: 1, a printed cap ("up to seven"), or Infinity ("any number").
  function copyLimit(c) {
    if (isBasic(c) || /a deck can have any number of cards named/i.test(c.o)) return Infinity;
    const m = c.o.match(/a deck can have up to (\w+) cards named/i);
    return m ? NUMBERS[m[1].toLowerCase()] || +m[1] || Infinity : 1;
  }

  // Rule 903.3: a legendary creature, Vehicle, or Spacecraft with power/toughness, or a card that says it can be
  // your commander. Grist-style cards count: they are creature cards everywhere but the battlefield.
  function canBeCommander(c) {
    if (/can be your commander/i.test(c.o)) return true;
    if (!/\bLegendary\b/.test(c.t)) return false;
    if (/\bCreature\b/.test(c.t) || /\bVehicle\b/.test(c.t) || (/\bSpacecraft\b/.test(c.t) && !!c.pt)) return true;
    return /isn't on the battlefield, it's [^.]*\bcreature\b/i.test(c.o);
  }
  const isBackground = (c) => /\bLegendary\b/.test(c.t) && /\bEnchantment\b/.test(c.t) && /\bBackground\b/.test(c.t);
  const isDoctor = (c) => /\bLegendary\b/.test(c.t) && /\bCreature\b/.test(c.t) && (c.t.split(" — ")[1] || "").trim() === "Time Lord Doctor";
  // The partner abilities a card has (rule 702.124).
  function partners(c) {
    const out = [];
    for (const line of (c.o || "").split("\n")) {
      const l = line.replace(/\s*\(.*$/, "").trim();
      let m;
      if (/^partner$/i.test(l)) out.push("partner");
      else if ((m = l.match(/^partner\s*—\s*(.+)$/i))) out.push("partner—" + norm(m[1]));
      else if ((m = l.match(/^partner with (.+)$/i))) out.push("with:" + norm(m[1]));
      else if (/^choose a background$/i.test(l)) out.push("background");
      else if (/^doctor's companion$/i.test(l)) out.push("doctor");
    }
    return out;
  }
  // Whether two cards can be commanders together.
  function canPair(a, b) {
    if (!a || !b || a.n === b.n) return false;
    const pa = partners(a), pb = partners(b);
    if (pa.some((k) => (k === "partner" || k.startsWith("partner—")) && pb.includes(k))) return canBeCommander(a) && canBeCommander(b);
    if (pa.includes("with:" + norm(b.n)) && pb.includes("with:" + norm(a.n))) return canBeCommander(a) && canBeCommander(b);
    if (pa.includes("background") && isBackground(b) || pb.includes("background") && isBackground(a)) return isBackground(a) ? canBeCommander(b) : canBeCommander(a);
    if (pa.includes("doctor") && isDoctor(b) || pb.includes("doctor") && isDoctor(a)) return /\bLegendary\b/.test(a.t) && /\bCreature\b/.test(a.t) && /\bLegendary\b/.test(b.t) && /\bCreature\b/.test(b.t);
    return false;
  }
  // Problems with the commander choice, each { text, rule }.
  function commanderIssues(cmd) {
    if (!cmd.length) return [];
    if (cmd.length > 2) return [{ text: "A deck can have at most two commanders, and only when both have the same partner ability.", rule: "702.124g" }];
    if (cmd.length === 2 && !canPair(cmd[0], cmd[1])) {
      const [a, b] = cmd, bg = isBackground(a) ? a : isBackground(b) ? b : null;
      return [{ text: bg ? bg.n + " is a Background. It can only be a commander next to a legendary creature that has “Choose a Background”."
        : a.n + " and " + b.n + " can't be commanders together. Both need the same partner ability (or “Partner with” each other, a Background with “Choose a Background”, or a Doctor with “Doctor's companion”).", rule: bg ? "702.124k" : "702.124f" }];
    }
    return cmd.length === 1 && !canBeCommander(cmd[0]) ? [{ text: isBackground(cmd[0]) ? cmd[0].n + " is a Background. It can only be a second commander, next to a legendary creature that has “Choose a Background”."
      : cmd[0].n + " can't be a commander. It has to be a legendary creature, Vehicle, or Spacecraft with power and toughness, unless the card says it can be your commander.", rule: isBackground(cmd[0]) ? "702.124k" : "903.3" }] : [];
  }

  // If no commander was marked: a 1-2 card sideboard or final block of commander-ready cards, else the first legendary creature.
  function guessCommanders(parsed, byName) {
    const total = parsed.cards.reduce((s, x) => s + x.q, 0);
    const ready = (list) => {
      const cs = list.map((x) => x.q === 1 && byName(x.n)).filter(Boolean);
      return cs.length === list.length && (cs.length === 1 ? canBeCommander(cs[0]) : cs.length === 2 && canPair(cs[0], cs[1])) ? cs.map((c) => c.n) : null;
    };
    if (parsed.sideboard && parsed.sideboard.length && total >= 90) { const n = ready(parsed.sideboard); if (n) return { names: n, from: "sideboard" }; }
    if (parsed.lastBlock && parsed.lastBlock.length && total >= 90) { const n = ready(parsed.lastBlock); if (n) return { names: n, from: "main" }; }
    if (total < 90) return null;
    const leg = parsed.cards.find((x) => { const c = byName(x.n); return c && /\bCreature\b/.test(c.t) && canBeCommander(c); });
    return leg ? { names: [leg.n], from: "main" } : null;
  }
  // Applies guessCommanders() to a parsed list that has no commander; sets parsed.guessed to the names picked.
  function fillCommanders(parsed, byName) {
    const g = !parsed.commanders.length && guessCommanders(parsed, byName);
    if (!g) return parsed;
    parsed.commanders = g.names.slice();
    if (g.from === "sideboard") parsed.skipped -= g.names.length;
    else parsed.cards = parsed.cards.map((x) => (g.names.includes(x.n) ? { ...x, q: x.q - 1 } : x)).filter((x) => x.q > 0);
    parsed.guessed = g.names.join(" + ");
    return parsed;
  }

  // Checks against Commander deck construction (rule 903.5).
  function check(deck, byName) {
    const cmd = deck.commanders.map((n) => byName(n)).filter(Boolean);
    const comp = (deck.companions || []).map((n) => byName(n)).filter(Boolean);
    const all = deck.cards.map((x) => ({ ...x, c: byName(x.n) })).filter((x) => x.c);
    const identity = new Set(cmd.flatMap((c) => [...c.ci]));
    const outside = (c) => cmd.length && [...c.ci].some((ch) => !identity.has(ch));
    const r = { total: deck.cards.reduce((s, x) => s + x.q, 0) + cmd.length, identity: "WUBRG".split("").filter((x) => identity.has(x)).join(""),
      offColor: [], duplicates: [], banned: [], gameChangers: [], commanderIssues: commanderIssues(cmd), companionIssues: [],
      curve: [0, 0, 0, 0, 0, 0, 0, 0], types: {}, avg: 0 };
    let mvSum = 0, mvN = 0;
    for (const c of cmd) {
      if (c.s === "banned") r.banned.push(c.n);
      if (c.g) r.gameChangers.push(c.n);
    }
    for (const x of all) {
      const c = x.c;
      if (outside(c)) r.offColor.push(c.n);
      // a commander is one of the deck's 100 cards, so a second copy in the list is a duplicate
      const copies = x.q + (deck.commanders.includes(c.n) ? 1 : 0);
      if (copies > copyLimit(c)) r.duplicates.push(c.n);
      if (c.s === "banned") r.banned.push(c.n);
      if (c.g) r.gameChangers.push(c.n);
      const t = mainType(c.t);
      r.types[t] = (r.types[t] || 0) + x.q;
      if (t !== "Land") { const mv = manaValue(c.m); r.curve[Math.min(mv, 7)] += x.q; mvSum += mv * x.q; mvN += x.q; }
    }
    // A companion starts outside the game, so it is not one of the 100 (rules 702.139a, 903.11a).
    for (const c of comp) {
      if (!(c.k || []).includes("companion")) r.companionIssues.push({ text: c.n + " has no companion ability.", rule: "702.139a" });
      if (c.s === "banned" || c.s === "banned_as_companion") r.banned.push(c.n + (c.s === "banned_as_companion" ? " (as a companion)" : ""));
      if (outside(c)) r.companionIssues.push({ text: c.n + " is outside your commander's colors, so it can't be your companion.", rule: "903.11a" });
      if (all.some((x) => x.n === c.n) || deck.commanders.includes(c.n)) r.companionIssues.push({ text: c.n + " is also in your deck. A companion can't share a name with a card in your starting deck.", rule: "903.11a" });
    }
    if (comp.length > 1) r.companionIssues.push({ text: "Only one companion can be revealed.", rule: "702.139a" });
    if (comp.length) r.companionIssues.push({ text: "The companion's own deck condition isn't checked here; check it against the card.", rule: "702.139a" });
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
      if (inDeck.has(c.n) || c.s === "banned" || /\bBasic\b/.test(c.t) || [...c.ci].some((ch) => !ident.has(ch))) continue;
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

  // Moxfield-style text; known printings are written back as "(SET) 123 *F*" so the list re-imports with them.
  function exportText(deck) {
    const pr = deck.prints || {};
    const tag = (n) => { const x = pr[n]; if (!x || !x.p) return ""; const i = x.p.indexOf("/"); return " (" + x.p.slice(0, i).toUpperCase() + ") " + x.p.slice(i + 1) + (x.f === "foil" ? " *F*" : x.f === "etched" ? " *E*" : ""); };
    const comp = (deck.companions || []).length ? ["", "Companion"].concat(deck.companions.map((n) => "1 " + n + tag(n))) : [];
    return deck.commanders.map((n) => "1 " + n + tag(n) + " *CMDR*").concat(deck.cards.map((x) => x.q + " " + x.n + tag(x.n)), comp).join("\n");
  }

  // The Game Changers list: every card the card data flags (c.g), narrowed by color identity and sorted.
  // opts.ci: letters that must all be in the card's identity ("C" alone: colorless only); opts.sort: "name" (default), "mv" or "color" (white first, multicolor, colorless last).
  function gameChangers(cards, opts) {
    const o = opts || {}, ci = o.ci || "";
    const col = (c) => (c.ci.length > 1 ? 10 : c.ci === "" ? 11 : "WUBRG".indexOf(c.ci));
    const byName = (a, b) => a.n.localeCompare(b.n);
    const by = { name: byName, mv: (a, b) => manaValue(a.m) - manaValue(b.m) || byName(a, b), color: (a, b) => col(a) - col(b) || byName(a, b) }[o.sort] || byName;
    return cards.filter((c) => c.g && (!ci || (ci === "C" ? c.ci === "" : [...ci].every((x) => c.ci.includes(x))))).sort(by);
  }

  const api = { parse, check, suggest, manaValue, gameChangers, mainType, exportText, canBeCommander, canPair, isBackground, partners, copyLimit, guessCommanders, fillCommanders, TYPE_ORDER, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MTGDeck = api;
})(typeof self !== "undefined" ? self : this);
