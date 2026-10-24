/* MTGSME interaction engine: pure JavaScript, no AI.
 *
 * It reads each card's oracle text, sorts every ability into triggered / activated / static /
 * replacement, tags the game events it listens for or produces, and then links the chosen cards.
 * Every rule it cites is checked against the loaded Comprehensive Rules, so a cite that does not
 * exist is never shown. It finds mechanical connections; it does not replace the card text,
 * the official rulings, or a judge. */
(function (root) {
  "use strict";

  // Event tags. `listen` matches a trigger condition or a "would" clause; `emit` matches an effect.
  const EVENTS = {
    draw: { label: "drawing a card",
      listen: /\bdraws? (?:an? |one or more |their \w+ |your \w+ )?cards?\b/i,
      emit: /\bdraws? (?:an? |x |\d+ |two |three |four |five |six |seven |that many |up to \w+ |cards?\b)/i },
    land_enter: { label: "a land entering the battlefield",
      listen: /\blands? (?:you control |an opponent controls )?enters?\b|\blandfall\b/i,
      emit: /search your library for [^.]*\bland[^.]*onto the battlefield|put [^.]*\blands?\b[^.]*onto the battlefield|play an additional land|\bland cards?\b[^.]*onto the battlefield|lands? cards? onto the battlefield/i },
    creature_enter: { label: "a creature entering the battlefield",
      listen: /\b(?:another |nontoken |a |one or more )?(?:\w+ )?creatures?(?: you control| an opponent controls)? enters?\b|\bpermanents? (?:you control )?enters?\b/i,
      emit: /create [^.]*creature token|put [^.]*creature cards?[^.]* onto the battlefield|return [^.]*creature[^.]* to the battlefield|then return (?:it|that card)|\bpopulate\b|\bamass\b|\bincubate\b/i },
    token_create: { label: "creating a token",
      listen: /\btokens? (?:you control )?(?:is |are )?created\b|\bcreates? (?:a|one or more|an) [^,]*tokens?\b/i,
      emit: /\bcreate [^.]*\btokens?\b|\bamass\b|\bpopulate\b|\binvestigate\b|\bincubate\b/i },
    life_gain: { label: "gaining life",
      listen: /\bgains? life\b|\byou gain\b[^,]*\blife\b/i,
      emit: /\bgains? (?:\d+|x|that much|twice that much|an amount of|life equal)[^.]*\blife\b|\bgains? life\b|\blifelink\b/i },
    life_loss: { label: "losing life",
      listen: /\bloses? life\b|\bloses? (?:\d+|x) life\b/i,
      emit: /\bloses? (?:\d+|x|that much|life equal)[^.]*\blife\b|\bpays? \d+ life\b/i },
    counter_add: { label: "putting counters on a permanent",
      listen: /counters? (?:is |are )?(?:put|placed) on|\b(?:one or more )?[^,]*counters? (?:is |are )?put\b/i,
      emit: /\bput [^.]*counters? on\b|\bproliferate\b|\badapt\b|\bbolster\b|\bsupport\b|\bevolve\b|\bendure\b|\bearthbend\b|\bdistribute [^.]*counters\b|\bmodular\b|\boutlast\b|\btraining\b/i },
    spell_cast: { label: "casting a spell",
      listen: /\bcasts? (?:an? |your |their |one or more |a second )?[^,]*?\bspells?\b/i,
      emit: /\bcopy target (?:instant|sorcery)|cast [^.]*without paying|you may cast\b|\bcascade\b|\bstorm\b|\bdiscover\b|\bcast target\b|\bsuspend\b|\brebound\b/i },
    attack: { label: "attacking",
      listen: /\battacks?\b|\byou attack\b/i,
      emit: /additional combat phase|extra combat|tapped and attacking|\bgoad\b|attacking creature token/i },
    dies: { label: "a creature dying",
      listen: /\bdies\b|put into a graveyard from the battlefield/i,
      emit: /\bdestroy (?:target|all|each|up to)|\bsacrifices? |deals? (?:\d+|x|that much) damage to (?:target|each|any)|gets? -\d+\/-\d+|\bdeathtouch\b|\bwither\b/i },
    sacrifice: { label: "sacrificing a permanent",
      listen: /\bsacrifices? (?:an?|another|one or more|a)\b|\bis sacrificed\b/i,
      emit: /\bsacrifices? (?:an?|another|target|x|two|three|\w+ )|\bsacrifice (?:it|this|that)|\beach player sacrifices\b/i },
    discard: { label: "discarding a card",
      listen: /\bdiscards?\b/i,
      emit: /\bdiscards? (?:an?|\w+ cards?|your hand|their hand|x)|\bcycling\b|\bmadness\b|\bwheel\b/i },
    damage: { label: "damage being dealt",
      listen: /\bdeals? (?:combat )?damage|\bis dealt damage|\bdealt damage\b/i,
      emit: /\bdeals? (?:\d+|x|that much|damage equal)|\bfights?\b|\bdeathtouch\b|\binfect\b/i },
    mana: { label: "adding mana",
      listen: /\bfor mana\b|\badds? (?:an additional|one mana)/i,
      emit: /\badd \{|\badds? (?:an amount|one mana|two mana|x mana|that much|mana)|\btreasure\b|\bmana of any\b/i },
    graveyard: { label: "cards going to a graveyard",
      listen: /into (?:a|your|an opponent's) graveyard from|cards? leaves? (?:your|a) graveyard|\bmills?\b/i,
      emit: /\bmills?\b|\bsurveil\b|\bdredge\b|put [^.]*cards? [^.]*into your graveyard|\bdiscards?\b|into (?:a|your|their) graveyard/i },
    tap: { label: "tapping or untapping",
      listen: /\bbecomes? tapped\b|\btaps?\b|\buntaps?\b/i,
      emit: /\btap (?:target|up to|all|an untapped)|\buntap (?:target|all|up to|each)/i },
    search: { label: "searching a library",
      listen: /\bsearches? (?:their|a|your|an opponent's) library/i,
      emit: /\bsearch (?:your|target (?:player|opponent)'s|their) library|\bsearches? their library/i },
  };

  // Keywords that imply an event even when the oracle text is only reminder text.
  const KEYWORD_EMITS = { lifelink: "life_gain", proliferate: "counter_add", investigate: "token_create", amass: "token_create",
    cascade: "spell_cast", storm: "spell_cast", discover: "spell_cast", deathtouch: "damage", infect: "damage", wither: "damage",
    earthbend: "counter_add", surveil: "graveyard", mill: "graveyard" };

  const TRIGGER_START = /^(?:[A-Za-z' ]+ — )?(when|whenever|at the beginning of)\b/i;

  function stripReminder(t) { return t.replace(/\s*\([^)]*\)/g, ""); }
  function firstName(n) { return n.split(",")[0]; }

  function tags(text, which) {
    const out = [];
    for (const [id, e] of Object.entries(EVENTS)) if (e[which].test(text)) out.push(id);
    return out;
  }

  // Break a card into abilities and tag each one.
  function analyzeCard(card) {
    const isSpell = /\b(Instant|Sorcery)\b/.test(card.t);
    const nm = new RegExp(card.n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const fn = firstName(card.n);
    const clean = stripReminder(card.o || "").replace(nm, "~").replace(fn.length > 3 ? new RegExp("\\b" + fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g") : /$^/, "~");
    const abilities = [];
    for (const raw of clean.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const ab = { text: line, kind: "static", listens: [], emits: [], replaces: [], layers: [], optional: /\bmay\b/i.test(line) };
      let effect = line;
      if (TRIGGER_START.test(line)) {
        ab.kind = "triggered";
        const stripped = line.replace(/^[A-Za-z' ]+ — /, "");
        const i = stripped.indexOf(", ");
        ab.condition = i > 0 ? stripped.slice(0, i) : stripped;
        effect = i > 0 ? stripped.slice(i + 2) : "";
        ab.listens = tags(ab.condition, "listen");
        ab.intervening = /^(?:when|whenever|at)\b[^,]*,\s*if\b/i.test(stripped) || /,\s*if you\b/i.test(ab.condition);
        ab.leavesBattlefield = /\bdies\b|leaves the battlefield|put into a graveyard from the battlefield/i.test(ab.condition);
        ab.optional = /\bmay\b/i.test(effect);
      } else if (/^[^:]{1,140}:\s/.test(line)) {
        ab.kind = "activated";
        const i = line.indexOf(": ");
        ab.cost = line.slice(0, i);
        effect = line.slice(i + 2);
        ab.optional = true;
      } else if (/^(?:flying|trample|haste|deathtouch|lifelink|vigilance|reach|menace|first strike|double strike|hexproof|indestructible|defender|flash|ward|[a-z' ,{}0-9]+)$/i.test(line) && line.length < 60 && !/[.]/.test(line)) {
        ab.kind = "keywords";
      }
      ab.effect = effect;
      // Replacement and prevention effects: not triggers, they never use the stack.
      if (ab.kind === "static" || ab.kind === "triggered") {
        const rep = /\binstead\b|\bwould\b|\benters? (?:the battlefield )?(?:tapped|with|as)\b|\bas ~ enters\b|\bskip\b|twice that many|that many plus|an additional [\w+\/-]+ counter/i;
        const prev = /\bprevent\b/i;
        if (ab.kind === "static" && (rep.test(line) || prev.test(line))) {
          ab.kind = prev.test(line) && !rep.test(line) ? "prevention" : "replacement";
          ab.listens = tags(/\bwould\b/i.test(line) ? line.replace(/^.*?\bwould\b/i, "would") : line, "listen");
        }
      }
      if (isSpell && ab.kind === "static") ab.kind = "spell";
      const effText = ab.kind === "keywords" ? "" : effect;
      if (ab.kind === "triggered" || ab.kind === "activated" || ab.kind === "spell" || ab.kind === "replacement") {
        ab.emits = tags(effText, "emit");
        if (!ab.emits.includes("land_enter") && /search your library for [^.]*\bland\b[\s\S]*onto the battlefield/i.test(effText)) ab.emits.push("land_enter");
        if (/\bonto the battlefield tapped\b|\benters? tapped\b/i.test(effText) && ab.kind !== "replacement") ab.entersTapped = true;
      }
      ab.layers = ["static", "triggered", "activated", "spell"].includes(ab.kind) ? layersOf(effText || line) : [];
      abilities.push(ab);
    }
    for (const k of card.k || []) {
      const ev = KEYWORD_EMITS[k.toLowerCase()];
      if (ev) abilities.push({ text: k, kind: "keyword-event", listens: [], emits: [ev], replaces: [], layers: [], optional: false, keyword: k });
    }
    return { card, abilities };
  }

  function layersOf(t) {
    const out = [];
    if (/\bbecomes? (?:an? )?[^.]*\b(?:creature|land|artifact|enchantment)\b|in addition to (?:its|their) other types|\bis every creature type/i.test(t)) out.push(["613.1d", "type-changing (layer 4)"]);
    if (/\bbecomes? (?:an? )?[^.]*\d+\/\d+|base power and toughness/i.test(t)) out.push(["613.4b", "sets power/toughness (layer 7b)"]);
    if (/\bgets? [+-]\d+\/[+-]\d+|[+-]1\/[+-]1 counters?/i.test(t)) out.push(["613.4c", "modifies power/toughness (layer 7c)"]);
    if (/\b(?:gains?|have|has|loses?)\b[^.]*\b(?:abilit|flying|trample|haste|first strike|double strike|deathtouch|lifelink|hexproof|indestructible|vigilance|reach|menace|ward)/i.test(t)) out.push(["613.1f", "adds or removes abilities (layer 6)"]);
    if (/\bgain control of\b/i.test(t)) out.push(["613.1b", "control-changing (layer 2)"]);
    if (/\bbecomes? (?:white|blue|black|red|green|colorless)\b|\bis (?:that )?colou?r\b/i.test(t)) out.push(["613.1e", "color-changing (layer 5)"]);
    if (/\bbecomes? a copy\b|\bcopy of\b/i.test(t)) out.push(["613.1a", "copy effects (layer 1)"]);
    if (/change the text|text of/i.test(t)) out.push(["613.1c", "text-changing (layer 3)"]);
    return out;
  }

  // Link a set of cards together.
  function analyze(cards, opts) {
    opts = opts || {};
    const CR = opts.cr || { rules: {} };
    const rulings = opts.rulings || null;
    const has = (n) => !!(CR.rules && CR.rules[n]);
    const cite = (n) => (has(n) ? n : null);
    const analyzed = cards.map(analyzeCard);
    const result = { cards: analyzed, keywords: [], connections: [], replacements: [], loops: [], layers: [], gotchas: [], rulingLinks: [], colorIdentity: "" };
    const label = (a) => a.card.n;

    // Keywords expanded to the CR rule that defines them.
    for (const a of analyzed) for (const k of a.card.k || []) {
      const num = CR.kw && CR.kw[k.toLowerCase()];
      if (num) result.keywords.push({ card: label(a), keyword: k, rule: num });
    }

    // Trigger / emit connections.
    const nodes = [];
    analyzed.forEach((a, ci) => a.abilities.forEach((ab, ai) => nodes.push({ a, ab, ci, ai, id: ci + ":" + ai })));
    const emitters = nodes.filter((n) => n.ab.emits.length);
    const listeners = nodes.filter((n) => n.ab.listens.length && (n.ab.kind === "triggered"));
    const seen = new Set();
    for (const l of listeners) for (const e of emitters) {
      if (e.id === l.id || e.ab.kind === "triggered" && e.ci === l.ci && e.ai === l.ai) continue;
      const shared = e.ab.emits.filter((x) => l.ab.listens.includes(x));
      for (const ev of shared) {
        const key = e.id + ">" + l.id + ev;
        if (seen.has(key)) continue; seen.add(key);
        result.connections.push({ from: label(e.a), to: label(l.a), event: ev, eventLabel: EVENTS[ev].label,
          src: e.ab.text, dst: l.ab.text, optional: l.ab.optional, srcOptional: e.ab.optional, self: e.ci === l.ci,
          cites: [cite("603.2"), cite("603.3")].filter(Boolean) });
      }
    }

    // Replacement / prevention effects that modify events another card produces.
    const reps = nodes.filter((n) => n.ab.kind === "replacement" || n.ab.kind === "prevention");
    for (const r of reps) {
      result.replacements.push({ card: label(r.a), text: r.ab.text, kind: r.ab.kind,
        cites: [r.ab.kind === "prevention" ? cite("615.1") : cite("614.1"), /\binstead\b/i.test(r.ab.text) ? cite("614.1a") : null,
          /\benters? (?:the battlefield )?(?:tapped|with|as)|\bas ~ enters/i.test(r.ab.text) ? cite(/with/i.test(r.ab.text) ? "614.1c" : "614.1d") : null].filter(Boolean) });
    }
    for (const r of reps) for (const e of emitters) {
      if (r.ci === e.ci) continue;
      const shared = e.ab.emits.filter((x) => r.ab.listens.includes(x));
      for (const ev of shared) result.connections.push({ from: label(e.a), to: label(r.a), event: ev, eventLabel: EVENTS[ev].label,
        src: e.ab.text, dst: r.ab.text, replacement: true, cites: [cite("614.1")].filter(Boolean) });
    }
    if (reps.length > 1) result.gotchas.push({ text: "More than one replacement or prevention effect may apply to the same event. The affected player (or the controller of the affected object) chooses which to apply first, and each can change whether the others still apply.", cites: [cite("616.1")].filter(Boolean) });

    // Enters-tapped overlap, e.g. a spell that puts lands onto the battlefield tapped plus a land that enters tapped unless.
    const tappedEmit = nodes.find((n) => n.ab.entersTapped);
    const tappedLand = nodes.find((n) => n.ci !== (tappedEmit && tappedEmit.ci) && /\benters? (?:the battlefield )?tapped/i.test(n.ab.text) && n.ab.kind === "replacement");
    if (tappedEmit && tappedLand) result.gotchas.push({ text: label(tappedEmit.a) + " already puts the permanent onto the battlefield tapped, so " + label(tappedLand.a) + "'s own \"enters tapped\" condition makes no difference to the outcome. Check the official rulings for same-time entry.", cites: [cite("614.1d")].filter(Boolean) });

    // Loops: triggers whose effects feed each other.
    const trig = nodes.filter((n) => n.ab.kind === "triggered" && n.ab.listens.length && n.ab.emits.length);
    const graph = new Map(trig.map((n) => [n.id, trig.filter((m) => n.ab.emits.some((ev) => m.ab.listens.includes(ev)))]));
    const loopSeen = new Set();
    for (const start of trig) {
      const walk = (cur, path) => {
        for (const nxt of graph.get(cur.id) || []) {
          if (nxt.id === start.id) {
            const ids = path.map((p) => p.id).sort().join("|");
            if (loopSeen.has(ids)) continue; loopSeen.add(ids);
            const optional = path.some((p) => p.ab.optional);
            result.loops.push({ chain: path.map((p) => label(p.a) + ": " + p.ab.text), optional,
              cites: [cite("732.1b"), optional ? cite("732.5") : cite("732.4"), optional ? null : cite("104.4b")].filter(Boolean) });
          } else if (path.length < 3 && !path.some((p) => p.id === nxt.id)) walk(nxt, path.concat(nxt));
        }
      };
      walk(start, [start]);
    }

    // Layers across the group.
    const layered = nodes.filter((n) => n.ab.layers.length);
    for (const n of layered) for (const [num, why] of n.ab.layers)
      if (has(num)) result.layers.push({ card: label(n.a), rule: num, why, text: n.ab.text });
    if (layered.length > 1 && new Set(layered.map((n) => n.ci)).size > 1)
      result.gotchas.push({ text: "Several continuous effects touch the same characteristics. Apply them layer by layer; inside a layer, timestamp order decides unless one effect depends on another.", cites: [cite("613.7"), cite("613.8")].filter(Boolean) });

    // Generic judge gotchas from the abilities found.
    const trigAbs = nodes.filter((n) => n.ab.kind === "triggered");
    if (trigAbs.some((n) => n.ab.optional)) result.gotchas.push({ text: "Some triggered abilities here are optional (\"may\"). The controller decides on resolution, not when the ability triggers.", cites: [cite("603.5")].filter(Boolean) });
    if (trigAbs.length > 1) result.gotchas.push({ text: "If several abilities trigger at the same time, their controller puts them on the stack in any order they choose, and the last one put on resolves first. With several players, the active player puts theirs on first (APNAP).", cites: [cite("603.3b"), cite("101.4")].filter(Boolean) });
    if (trigAbs.some((n) => n.ab.intervening)) result.gotchas.push({ text: "An \"if\" in a trigger is an intervening-if. It is checked both when the ability triggers and again as it resolves.", cites: [cite("603.4")].filter(Boolean) });
    if (trigAbs.some((n) => n.ab.leavesBattlefield)) result.gotchas.push({ text: "Abilities that trigger when something dies or leaves the battlefield look back in time to how it last existed there.", cites: [cite("603.10a")].filter(Boolean) });

    // Color identity of the whole group (for a Commander deck).
    const ci = new Set();
    for (const c of cards) for (const ch of c.ci || "") ci.add(ch);
    result.colorIdentity = "WUBRG".split("").filter((x) => ci.has(x)).join("") || "colorless";
    result.gotchas.push({ text: "These cards together need a commander with color identity " + (result.colorIdentity === "colorless" ? "of any kind (all colorless)" : result.colorIdentity) + " or more.", cites: [cite("903.4")].filter(Boolean) });

    // Official rulings that mention another chosen card, or that two cards share.
    if (rulings) {
      cards.forEach((c, i) => {
        const mine = rulings.by[c.n] || [];
        cards.forEach((o, j) => {
          if (i === j) return;
          for (const [date, idx] of mine) {
            const t = rulings.texts[idx];
            if (t.toLowerCase().includes(o.n.toLowerCase()) && !result.rulingLinks.some((r) => r.text === t))
              result.rulingLinks.push({ about: c.n, mentions: o.n, date, text: t });
          }
        });
      });
    }
    result.confidence = "Heuristic. These links are found by reading the card text, so check each against the card and its rulings.";
    return result;
  }

  const api = { analyze, analyzeCard, EVENTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MTGEngine = api;
})(typeof self !== "undefined" ? self : this);
