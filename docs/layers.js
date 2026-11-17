/* MTGSME layer engine: works out what permanents on the battlefield look like after every continuous
 * effect is applied in the order rule 613 sets (layers, timestamps, dependency).
 *
 * It is exact for the effects effects.js can read and says "not modeled" for the rest; it never guesses.
 * Pure JavaScript for the browser and Node. Rule numbers are cited only when the loaded rules have them. */
(function (root) {
  "use strict";
  const FX = typeof module !== "undefined" && module.exports ? require("./effects.js") : root.MTGEffects;
  let CR = null;
  function init(cr) { CR = cr; FX.init(cr); }
  const cite = (n) => (!CR || (CR.rules && CR.rules[n]) ? n : null);

  const LAYERS = ["2", "4", "5", "6", "7a", "7b", "7c", "7d"];
  const LAYER_RULE = { "1": "613.2", "2": "613.1b", "3": "613.1c", "4": "613.1d", "5": "613.1e", "6": "613.1f", "7a": "613.4a", "7b": "613.4b", "7c": "613.4c", "7d": "613.4d" };
  const LAYER_NAME = { "1": "Layer 1 (copy)", "2": "Layer 2 (control)", "4": "Layer 4 (types)", "5": "Layer 5 (color)", "6": "Layer 6 (abilities)", "7a": "Layer 7a (P/T from its own text)", "7b": "Layer 7b (P/T set)", "7c": "Layer 7c (P/T changed)", "7d": "Layer 7d (P/T switched)" };
  const KEYWORD_COUNTERS = ["flying", "first strike", "double strike", "deathtouch", "decayed", "exalted", "haste", "hexproof", "indestructible", "lifelink", "menace", "reach", "shadow", "trample", "vigilance"];
  const COLOR_NAME = { W: "white", U: "blue", B: "black", R: "red", G: "green" };
  const LAND_MANA = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };

  // ---------- the printed card ----------
  function printed(card, lookup) {
    const [left, right] = String(card.t || "").split(" — ");
    const v = { name: card.n, card: [], sup: [], sub: [], colors: [], abilities: [], p: null, t: null, mv: 0 };
    for (const w of left.split(" ")) {
      if (FX.SUPERTYPES.includes(w)) v.sup.push(w); else if (w) v.card.push(w);
    }
    if (right) {
      const words = right.split(" ");
      for (let i = 0; i < words.length; i++) {
        if (words[i] === "Time" && words[i + 1] === "Lord") { v.sub.push("Time Lord"); i++; } else if (words[i]) v.sub.push(words[i]);
      }
    }
    v.colors = card.c != null ? String(card.c).toUpperCase().split("").filter((c) => "WUBRG".includes(c)) : FX.costColors(card.m);
    let cost = card.m;
    if (!cost && card.f && card.f[0] !== card.n && lookup) { const front = lookup(card.f[0]); if (front) cost = front.m; }   // a back face uses the front's mana value
    v.mv = FX.manaValue(cost);
    if (card.pt) {
      const [p, t] = card.pt.split("/");
      v.p = /^-?\d+$/.test(p) ? +p : NaN; v.t = /^-?\d+$/.test(t) ? +t : NaN;
    }
    const parsed = FX.parseCard(card);
    parsed.abilities.forEach((a, i) => { if (a.kind !== "enchant" || true) v.abilities.push({ uid: "p" + i, text: a.text, kw: a.kw || null, kind: a.kind, templates: a.kind === "static" || a.kind === "keyword" ? a.templates : [], src: "printed" }); });
    return v;
  }

  // Copiable values (707.2): the printed card, as changed by copy effects and face-down status.
  function copiable(perm, state, lookup, seen) {
    seen = seen || new Set();
    let v = printed(perm.card, lookup);
    const notes = [];
    let c = perm.copy;
    if (!c && perm.copyOf != null && !seen.has(perm.id)) {
      const of = state.permanents.find((p) => p.id === perm.copyOf);
      if (of) { seen.add(perm.id); c = { values: copiable(of, state, lookup, seen).values }; }
    }
    if (c && c.values) {
      const own = v, src = JSON.parse(JSON.stringify(c.values));
      const spec = FX.parseCard(perm.card).copy || { except: [], notes: [] };
      v = src;
      v.abilities = v.abilities.map((a, i) => Object.assign({}, a, { uid: "c" + i, src: "copy" }));
      for (const ex of c.except || spec.except) {
        if (ex.keepColor) v.colors = own.colors.slice();
        if (ex.setPT) { v.p = ex.setPT[0]; v.t = ex.setPT[1]; v.abilities = v.abilities.filter((a) => !(a.templates || []).some((t) => t.parts.some((p) => p.cdaPT))); }   // 707.9d
        if (ex.notLegendary) v.sup = v.sup.filter((s) => s !== "Legendary");
        if (ex.add) for (const it of ex.add) v.abilities.push(grant(it, "x" + v.abilities.length, "copy"));
        if (ex.keepAbility) { const mine = own.abilities.find((a) => a.kind === "copy"); if (mine) v.abilities.push(Object.assign({}, mine, { uid: "x" + v.abilities.length })); }
        if (ex.parts) for (const p of ex.parts) {
          if (p.addCard) for (const t of p.addCard) if (!v.card.includes(t)) v.card.push(t);
          if (p.addSuper) for (const t of p.addSuper) if (!v.sup.includes(t)) v.sup.push(t);
          if (p.addSub) for (const t of p.addSub) if (!v.sub.includes(t)) v.sub.push(t);
          if (p.setColors) v.colors = p.setColors.slice();
          if (p.layer === "7b") { v.p = p.p; v.t = p.t; }
        }
      }
      for (const n of spec.notes || []) notes.push(n);
      notes.push("Copies only what is printed on the original (as changed by other copy effects): no counters, Auras or other effects" + (cite("707.2") ? " (707.2)." : "."));
    }
    if (perm.faceDown) {   // 708.2a
      v = { name: "(face-down)", card: ["Creature"], sup: [], sub: [], colors: [], abilities: [], p: 2, t: 2, mv: 0 };
      notes.push("Face down: a 2/2 creature with no name, types, abilities or mana cost" + (cite("708.2a") ? " (708.2a)." : "."));
    }
    return { values: v, notes };
  }

  function grant(item, uid, src) {
    if (item.quoted) {
      const r = FX.parseAbilityText(item.text, { kind: "static", granted: true });
      const isStatic = !/^(?:When|Whenever|At the beginning)\b/.test(item.text) && !/^[^:"]{1,160}: /.test(item.text);
      return { uid, text: item.text.replace(/~/g, "this permanent"), kw: null, kind: isStatic ? "static" : "other", templates: isStatic ? r.templates : [], unmodeled: isStatic ? r.unmodeled : [], src };
    }
    return { uid, text: item.text, kw: item.kw, kind: "keyword", templates: [], src };
  }

  // ---------- objects during the calculation ----------
  function makeObject(perm, state, lookup) {
    const c = copiable(perm, state, lookup);
    const v = c.values;
    return { id: perm.id, perm, name: v.name, printedName: perm.label || perm.card.n, mv: v.mv, controller: perm.controller || "you", owner: perm.owner || perm.controller || "you",
      types: new Set(v.card), supers: new Set(v.sup), subs: new Set(v.sub), allCT: false, colors: new Set(v.colors),
      abil: v.abilities.map((a) => Object.assign({}, a)), p: v.p, t: v.t, base: v, counters: Object.assign({}, perm.counters || {}),
      attachedTo: perm.attachedTo == null ? null : perm.attachedTo, token: !!perm.token, cant: new Set(), ts: perm.ts, notes: c.notes, unknownPT: [] };
  }
  function cloneObjs(objs) {
    const m = new Map();
    for (const [k, o] of objs) m.set(k, Object.assign({}, o, { types: new Set(o.types), supers: new Set(o.supers), subs: new Set(o.subs), colors: new Set(o.colors), abil: o.abil.slice(), cant: new Set(o.cant), counters: o.counters, unknownPT: o.unknownPT.slice(), notes: o.notes }));
    return m;
  }
  function hasSub(o, t) { return o.subs.has(t) || (o.allCT && FX.subCategory(t) === "creature" && (o.types.has("Creature") || o.types.has("Kindred"))); }
  // 205.1a: a subtype goes away while the object has none of the card types it belongs to.
  function prune(o) {
    const cats = { creature: o.types.has("Creature") || o.types.has("Kindred"), land: o.types.has("Land"), artifact: o.types.has("Artifact"), enchantment: o.types.has("Enchantment"), planeswalker: o.types.has("Planeswalker"), battle: o.types.has("Battle") };
    for (const s of [...o.subs]) { const c = FX.subCategory(s); if (c && !cats[c]) o.subs.delete(s); }
    if (!cats.creature) o.allCT = false;
  }

  function matches(sel, o, ctx) {
    if (!sel) return false;
    if (sel.unknown) return false;
    if (sel.other && o.id === ctx.srcId) return false;
    if (sel.control === "you" && o.controller !== ctx.controller) return false;
    if (sel.control === "opp" && o.controller === ctx.controller) return false;
    if (sel.types && !sel.types.every((t) => o.types.has(t))) return false;
    if (sel.notTypes && sel.notTypes.some((t) => o.types.has(t))) return false;
    if (sel.supertypes && !sel.supertypes.every((t) => o.supers.has(t))) return false;
    if (sel.notSupertypes && sel.notSupertypes.some((t) => o.supers.has(t))) return false;
    if (sel.subtypes && !sel.subtypes.every((t) => hasSub(o, t))) return false;
    if (sel.notSubtypes && sel.notSubtypes.some((t) => hasSub(o, t))) return false;
    if (sel.colors && !sel.colors.every((c) => o.colors.has(c))) return false;
    if (sel.notColors && sel.notColors.some((c) => o.colors.has(c))) return false;
    if (sel.colorless && o.colors.size) return false;
    if (sel.multicolored && o.colors.size < 2) return false;
    if (sel.token != null && o.token !== sel.token) return false;
    if (sel.withKw && !o.abil.some((a) => a.kw === sel.withKw)) return false;
    if (sel.withoutKw && o.abil.some((a) => a.kw === sel.withoutKw)) return false;
    if (sel.counter && !(sel.counter === "*" ? Object.values(o.counters).some((n) => n > 0) : o.counters[sel.counter] > 0)) return false;
    if (sel.chosenType) { const t = ctx.chosen && ctx.chosen.type; if (!t || !hasSub(o, t)) return false; }
    if (sel.stat) {
      const v = sel.stat.what === "power" ? o.p : sel.stat.what === "toughness" ? o.t : o.mv;
      if (!(sel.stat.op === ">=" ? v >= sel.stat.n : v <= sel.stat.n)) return false;
    }
    if (sel.any && !sel.any.some((s) => matches(s, o, ctx))) return false;
    return true;
  }

  // ---------- effects ----------
  function condHolds(inst, objs, state) {
    const c = inst.tpl.cond;
    if (!c) return true;
    const src = objs.get(inst.srcId);
    const ctx = ctxOf(inst, objs);
    if (c.unknown) return !!(state.assume && state.assume[inst.srcId + "|" + c.unknown]);
    if (c.is) {
      const o = c.on === "attached" ? objs.get(src && src.attachedTo) : c.on === "self" ? src : (inst.tpl.who.kind === "attached" ? objs.get(src && src.attachedTo) : src);
      return !!o && matches(Object.assign({ kind: "group" }, c.is), o, ctx);
    }
    if (c.count) { let n = 0; for (const o of objs.values()) if (matches(c.count, o, ctx)) n++; return n >= c.min; }
    if (c.devotion) {
      let n = 0;
      for (const o of objs.values()) if (o.controller === ctx.controller)
        for (const m of String(o.perm.faceDown ? "" : o.perm.card.m || "").matchAll(/\{([^}]+)\}/g)) if (c.devotion.colors.some((col) => m[1].toUpperCase().includes(col))) n++;
      return n < c.devotion.lt;
    }
    if (c.attachedBy) { for (const o of objs.values()) if (o.attachedTo === inst.srcId && o.subs.has(c.attachedBy)) return true; return false; }
    return false;
  }
  function ctxOf(inst, objs) {
    const src = inst.srcId != null ? objs.get(inst.srcId) : null;
    return { srcId: inst.srcId, controller: inst.kind === "static" || inst.kind === "counter" ? (src ? src.controller : "you") : inst.controller, chosen: inst.chosen || (src && src.perm.chosen) || null };
  }
  function exists(inst, objs) {
    if (inst.kind !== "static") return true;
    if (inst.started) return true;
    const src = objs.get(inst.srcId);
    return !!src && src.abil.some((a) => a.uid === inst.abilUid);
  }
  function setOf(inst, objs) {
    const who = inst.tpl.who, src = objs.get(inst.srcId), ctx = ctxOf(inst, objs);
    if (who.kind === "self") return src ? [src.id] : [];
    if (who.kind === "attached") return src && src.attachedTo != null && objs.has(src.attachedTo) ? [src.attachedTo] : [];
    if (who.kind === "target") return inst.target != null && objs.has(inst.target) ? [inst.target] : [];
    if (who.kind === "group") {
      if (inst.locked) return inst.locked.filter((id) => objs.has(id));
      const out = [];
      for (const o of objs.values()) if (matches(who, o, ctx)) out.push(o.id);
      return out;
    }
    return [];
  }
  function value(v, o, inst, objs, state) {
    if (v == null) return null;
    if (typeof v === "number") return v;
    const mult = v.mult == null ? 1 : v.mult, plus = v.plus || 0;
    if (v.x) { const x = inst.x; return x == null ? NaN : (v.neg ? -x : x) * mult; }
    if (v.mv) return o.mv;
    if (v.count) { const ctx = ctxOf(inst, objs); let n = 0; for (const p of objs.values()) if (matches(v.count, p, ctx)) n++; return n * mult + plus; }
    if (v.counters) return (o.counters[v.counters] || 0) * mult + plus;
    if (v.attached) { let n = 0; for (const p of objs.values()) if (p.attachedTo === o.id && v.attached.some((s) => p.subs.has(s))) n++; return n * mult + plus; }
    if (v.unknown) { const given = state.values && state.values[inst.srcId != null ? inst.srcId : inst.key]; return given == null ? NaN : given * mult + plus; }
    return NaN;
  }
  // What an effect would do right now in one layer, without changing anything (used for dependency, 613.8a).
  function signature(inst, L, objs, state) {
    if (!exists(inst, objs)) return "gone";
    if (!inst.started && !condHolds(inst, objs, state)) return "off";
    const ids = inst.started ? inst.set : setOf(inst, objs);
    const vals = [];
    for (const part of inst.tpl.parts) if (part.layer === L) for (const k of ["p", "t"]) if (part[k] != null && typeof part[k] === "object")
      for (const id of ids) { const o = objs.get(id); if (o) vals.push(value(part[k], o, inst, objs, state)); }
    const ctx = ctxOf(inst, objs);
    return ids.slice().sort().join(",") + "|" + vals.join(",") + "|" + (L === "2" ? ctx.controller : "") + "|" + (ctx.chosen ? (ctx.chosen.type || "") + (ctx.chosen.color || "") : "");
  }

  function apply(inst, L, objs, state, log, sim) {
    if (!exists(inst, objs)) return false;
    let ids;
    if (inst.started && !sim) ids = inst.set.filter((id) => objs.has(id));
    else if (inst.started) ids = inst.set.filter((id) => objs.has(id));
    else {
      if (!condHolds(inst, objs, state)) return false;
      ids = setOf(inst, objs);
      if (!sim) { inst.started = true; inst.set = ids; }
    }
    const ctx = ctxOf(inst, objs);
    for (const part of inst.tpl.parts) {
      if (part.layer !== L) continue;
      const said = [];
      for (const id of ids) {
        const o = objs.get(id);
        if (!o) continue;
        const what = applyPart(part, o, inst, ctx, objs, state);
        if (what && !sim) said.push([o, what]);
      }
      if (log && !sim && said.length) {
        const by = new Map();
        for (const [o, what] of said) { if (!by.has(what)) by.set(what, []); by.get(what).push(o.printedName); }
        for (const [what, names] of by) log.push({ layer: L, rule: cite(LAYER_RULE[L]), source: inst.name, ts: inst.ts, affected: names, what, cda: !!inst.cda });
      }
    }
    return true;
  }

  function chosenOf(list, ctx, key) { return list.map((x) => (x === "*chosen" ? ctx.chosen && ctx.chosen[key] : x)); }

  function applyPart(part, o, inst, ctx, objs, state) {
    const L = part.layer, did = [];
    if (L === "2") {
      if (o.controller !== ctx.controller) { o.controller = ctx.controller; did.push("is now controlled by " + who(ctx.controller)); }
      else did.push("stays under " + (ctx.controller === "you" ? "your" : "the opponent's") + " control");
    } else if (L === "4") {
      if (part.setCard) { o.types = new Set(part.setCard); did.push("becomes only: " + part.setCard.join(" ") + (cite("205.1a") ? " (205.1a)" : "")); }
      if (part.addCard) { const add = part.addCard.filter((t) => !o.types.has(t)); for (const t of add) o.types.add(t); if (add.length) did.push("is also: " + add.join(", ")); }
      if (part.removeCard) { for (const t of part.removeCard) o.types.delete(t); did.push("stops being: " + part.removeCard.join(", ")); }
      if (part.addSuper) for (const t of part.addSuper) o.supers.add(t);
      if (part.setCreatureTypes) {
        const list = chosenOf(part.setCreatureTypes, ctx, "type");
        if (list.some((x) => !x)) return "needs a creature type to be chosen";
        for (const s of [...o.subs]) if (FX.subCategory(s) === "creature") o.subs.delete(s);
        o.allCT = false;
        for (const s of list) o.subs.add(s);
        did.push("creature type becomes only " + list.join(" "));
      }
      if (part.loseLandTypes) for (const s of [...o.subs]) if (FX.subCategory(s) === "land") o.subs.delete(s);
      if (part.setLandTypes) {
        for (const s of [...o.subs]) if (FX.subCategory(s) === "land") o.subs.delete(s);
        for (const s of part.setLandTypes) o.subs.add(s);
        if (o.types.has("Land") && part.setLandTypes.some((s) => FX.BASIC_LAND.includes(s))) {
          const lost = o.abil.length;
          o.abil = [];
          did.push("land type becomes only " + part.setLandTypes.join(" ") + (lost ? "; it loses its old land types and its abilities" : "; it loses its old land types") + (cite("305.7") ? " (305.7)" : ""));
        } else did.push("land type becomes only " + part.setLandTypes.join(" "));
      }
      if (part.addSub) {
        const list = chosenOf(part.addSub, ctx, "type");
        if (list.some((x) => !x)) return "needs a creature type to be chosen";
        const add = list.filter((s) => !o.subs.has(s));
        for (const s of add) o.subs.add(s);
        if (add.length) did.push("is also: " + add.join(", "));
      }
      if (part.allCreatureTypes) { o.allCT = true; did.push("is every creature type"); }
      if (part.setName) { o.name = part.setName; did.push("is named " + part.setName); }
      prune(o);
    } else if (L === "5") {
      const key = part.setColors ? "setColors" : "addColors";
      const list = chosenOf(part[key] || [], ctx, "color");
      if (list.some((x) => !x)) return "needs a color to be chosen";
      if (part.setColors) { o.colors = new Set(list); did.push(list.length ? "becomes " + list.map((c) => COLOR_NAME[c]).join(" and ") + " only" + (cite("105.3") ? " (105.3)" : "") : "becomes colorless"); }
      else { for (const c of list) o.colors.add(c); did.push("is also " + list.map((c) => COLOR_NAME[c]).join(" and ")); }
    } else if (L === "6") {
      if (part.removeAll) { const n = o.abil.length; o.abil = []; did.push(n ? "loses all abilities" : "has no abilities to lose"); }
      if (part.remove) { const before = o.abil.length; o.abil = o.abil.filter((a) => !part.remove.includes(a.kw)); did.push((before !== o.abil.length ? "loses " : "has no ") + part.remove.join(", ") + (before !== o.abil.length ? "" : " to lose")); }
      if (part.cant) { for (const k of part.cant) o.cant.add(k); o.abil = o.abil.filter((a) => !part.cant.includes(a.kw)); did.push("can't have " + part.cant.join(", ") + (cite("113.11") ? " (113.11)" : "")); }
      if (part.add) {
        const got = [];
        part.add.forEach((it, i) => {
          if (it.kw && o.cant.has(it.kw)) return;
          const a = grant(it, inst.key + ">" + o.id + ">" + i, "effect");
          a.ts = Math.max(inst.ts, o.ts || 0); a.from = inst.name;
          o.abil.push(a); got.push(it.quoted ? "\"" + a.text + "\"" : it.text);
        });
        if (got.length) did.push("gains " + got.join(", "));
      }
    } else if (L === "7a" || L === "7b") {
      const p = value(part.p, o, inst, objs, state), t = value(part.t, o, inst, objs, state);
      if (p != null) { o.p = p; if (Number.isNaN(p)) noteUnknown(o, part.p, inst); }
      if (t != null) { o.t = t; if (Number.isNaN(t)) noteUnknown(o, part.t, inst); }
      did.push((L === "7a" ? "power/toughness defined as " : "base power/toughness set to ") + show(p != null ? p : o.p) + "/" + show(t != null ? t : o.t));
    } else if (L === "7c") {
      const p = value(part.p, o, inst, objs, state) || 0, t = value(part.t, o, inst, objs, state) || 0;
      const np = value(part.p, o, inst, objs, state), nt = value(part.t, o, inst, objs, state);
      if (Number.isNaN(np)) noteUnknown(o, part.p, inst);
      if (Number.isNaN(nt)) noteUnknown(o, part.t, inst);
      o.p = (o.p == null ? 0 : o.p) + (Number.isNaN(np) ? NaN : p); o.t = (o.t == null ? 0 : o.t) + (Number.isNaN(nt) ? NaN : t);
      did.push("gets " + signed(np) + "/" + signed(nt));
    } else if (L === "7d") {
      const p = o.p; o.p = o.t; o.t = p; did.push("power and toughness are switched");
    }
    return did.join("; ");
  }
  function noteUnknown(o, v, inst) {
    const why = v && v.unknown ? v.unknown : v && v.x ? "X (" + inst.name + ")" : "a number the board doesn't show";
    if (!o.unknownPT.includes(why)) o.unknownPT.push(why);
  }
  const show = (n) => (n == null ? "-" : Number.isNaN(n) ? "?" : String(n));
  const signed = (n) => (Number.isNaN(n) ? "+?" : (n >= 0 ? "+" : "") + n);
  const who = (c) => (c === "you" ? "you" : c === "opp" ? "the opponent" : c);

  // Pick the next effect to apply in a layer: CDAs first, then timestamps, with dependency on top (613.3, 613.7, 613.8).
  function pick(cands, L, objs, state, log) {
    let pool = cands;
    if (L !== "7b" && L !== "7c" && L !== "7d") { const cdas = cands.filter((i) => i.cda); if (cdas.length) pool = cdas; }
    const byTs = (a, b) => a.ts - b.ts || a.order - b.order;
    pool = pool.slice().sort(byTs);
    if (pool.length === 1) return pool[0];
    const deps = new Map(pool.map((i) => [i.key, new Set()]));
    for (const a of pool) {
      const before = signature(a, L, objs, state);
      for (const b of pool) {
        if (a === b || !!a.cda !== !!b.cda) continue;
        const sim = cloneObjs(objs);
        if (!apply(b, L, sim, state, null, true)) continue;
        if (signature(a, L, sim, state) !== before) deps.get(a.key).add(b.key);
      }
    }
    // a dependency loop falls back to timestamps (613.8b): drop the edges inside any cycle
    const reach = (from, to, seen) => { if (from === to) return true; if (seen.has(from)) return false; seen.add(from); for (const n of deps.get(from)) if (reach(n, to, seen)) return true; return false; };
    const looped = [];
    for (const a of pool) for (const b of [...deps.get(a.key)]) if (reach(b, a.key, new Set())) looped.push([a.key, b]);
    for (const [a, b] of looped) deps.get(a).delete(b);
    const free = pool.filter((i) => deps.get(i.key).size === 0);
    const next = free[0] || pool[0];
    if (log) {
      if (looped.length && looped.some(([a, b]) => a === next.key || b === next.key)) {
        const names = [...new Set(looped.flat())].map((k) => pool.find((i) => i.key === k).name);
        note(log, L, cite("613.8b"), names.join(" and ") + " each depend on the other (a dependency loop), so they apply in timestamp order.");
      }
      for (const i of pool) if (i !== next && byTs(i, next) < 0 && deps.get(i.key).size) {
        const on = [...deps.get(i.key)].map((k) => pool.find((x) => x.key === k).name);
        note(log, L, cite("613.8a"), i.name + " has the earlier timestamp but depends on " + on.join(" and ") + ", so it waits until after " + (on.length > 1 ? "they apply" : "it applies") + ".");
      }
    }
    return next;
  }
  function note(log, L, rule, text) { if (!log.some((e) => e.note === text && e.layer === L)) log.push({ layer: L, rule, note: text }); }

  // ---------- one pass over the battlefield ----------
  function compute(state, opts) {
    const lookup = opts.lookup || null;
    const objs = new Map();
    const log = [];
    const unmodeled = [], conditions = [], needs = [];
    for (const perm of state.permanents) {
      const o = makeObject(perm, state, lookup);
      objs.set(perm.id, o);
      if (perm.copy || perm.copyOf != null) log.push({ layer: "1", rule: cite("613.2a"), source: perm.card.n, affected: [perm.card.n], what: "is a copy of " + o.name + (o.notes.length ? ". " + o.notes.join(" ") : "") });
      else if (perm.faceDown) log.push({ layer: "1", rule: cite("613.2b"), source: perm.card.n, affected: [perm.card.n], what: o.notes.join(" ") });
    }
    const insts = new Map();
    let order = 0;
    const gather = () => {
      for (const o of objs.values()) for (const a of o.abil) (a.templates || []).forEach((tpl, i) => {
        const key = o.id + "#" + a.uid + "#" + i;
        if (insts.has(key)) return;
        insts.set(key, { key, kind: "static", srcId: o.id, abilUid: a.uid, tpl, ts: a.ts != null ? a.ts : o.ts, cda: !!tpl.cda && a.src !== "effect", name: o.printedName, order: order++, started: false, set: null, granted: a.src === "effect" });
      });
    };
    gather();
    for (const e of state.effects || []) (e.templates || []).forEach((tpl, i) => {
      const key = "e" + e.id + "#" + i;
      insts.set(key, { key, kind: "resolved", srcId: e.sourceId != null ? e.sourceId : null, tpl, ts: e.ts, controller: e.controller || "you", target: e.target, x: e.x, name: e.name, order: order++, started: false, set: null, locked: e.locked ? e.locked[i] || null : null, chosen: e.chosen || null });
    });
    for (const o of objs.values()) {
      const plus = (o.counters["+1/+1"] || 0) - (o.counters["-1/-1"] || 0);
      if (o.counters["+1/+1"] || o.counters["-1/-1"]) {
        const text = [o.counters["+1/+1"] ? o.counters["+1/+1"] + " +1/+1 counter" + (o.counters["+1/+1"] > 1 ? "s" : "") : "", o.counters["-1/-1"] ? o.counters["-1/-1"] + " -1/-1 counter" + (o.counters["-1/-1"] > 1 ? "s" : "") : ""].filter(Boolean).join(" and ");
        insts.set("k" + o.id, { key: "k" + o.id, kind: "counter", srcId: o.id, tpl: { who: { kind: "self" }, parts: [{ layer: "7c", p: plus, t: plus }], cond: null }, ts: o.ts, name: text + " on " + o.printedName, order: order++, started: false, set: null });
      }
      for (const k of KEYWORD_COUNTERS) if (o.counters[k] > 0)
        insts.set("k" + o.id + k, { key: "k" + o.id + k, kind: "counter", srcId: o.id, tpl: { who: { kind: "self" }, parts: [{ layer: "6", add: [{ text: k, kw: k }] }], cond: null }, ts: o.ts, name: "a " + k + " counter on " + o.printedName, order: order++, started: false, set: null });
    }

    for (const L of LAYERS) {
      const done = new Set();
      for (;;) {
        if (L === "6") gather();   // abilities granted in this layer can carry their own effects (613.7a)
        const cands = [...insts.values()].filter((i) => !done.has(i.key) && i.tpl.parts.some((p) => p.layer === L) && exists(i, objs) && !(i.granted && !["6", "7b", "7c", "7d"].includes(L)));
        if (!cands.length) break;
        const next = pick(cands, L, objs, state, log);
        apply(next, L, objs, state, log, false);
        done.add(next.key);
      }
      for (const i of insts.values()) if (i.kind === "static" && !done.has(i.key) && !i.started && i.tpl.parts.some((p) => p.layer === L) && objs.has(i.srcId) && !exists(i, objs) && !i.saidGone) {
        i.saidGone = true;
        log.push({ layer: L, rule: cite("613.6"), note: i.name + " no longer has the ability \"" + i.tpl.text + "\", so that effect does not apply." });
      }
      if (L === "4") for (const o of objs.values()) {   // 305.6: a land with a basic land type has that type's mana ability
        if (!o.types.has("Land")) continue;
        for (const t of FX.BASIC_LAND) if (o.subs.has(t)) o.abil.push({ uid: "i" + t, text: "{T}: Add {" + LAND_MANA[t] + "}.", kw: null, kind: "other", templates: [], src: "intrinsic" });
      }
    }

    // effects the reader could not model, conditions the board can't see, choices still needed
    for (const perm of state.permanents) {
      const parsed = FX.parseCard(objs.get(perm.id).base.name === perm.card.n ? perm.card : perm.card);
      for (const a of parsed.abilities) {
        if (a.kind === "static") for (const u of a.unmodeled) unmodeled.push({ id: perm.id, card: perm.card.n, text: u.text, why: u.why });
        if (a.kind === "static" || a.kind === "keyword") for (const t of a.templates) {
          if (t.cond && t.cond.unknown) conditions.push({ key: perm.id + "|" + t.cond.unknown, id: perm.id, card: perm.card.n, text: t.cond.unknown, effect: t.text, on: !!(state.assume && state.assume[perm.id + "|" + t.cond.unknown]) });
          if (t.who.kind === "group" && FX.hasUnknown(t.who)) unmodeled.push({ id: perm.id, card: perm.card.n, text: t.text, why: "it only applies to " + (t.who.unknown || "some") + " permanents, which the board doesn't track" });
        }
      }
      if (parsed.copy && parsed.copy.notes.length && (perm.copy || perm.copyOf != null)) for (const n of parsed.copy.notes) if (/not (?:modeled|recognized)/.test(n)) unmodeled.push({ id: perm.id, card: perm.card.n, text: parsed.copy.text, why: n });
      for (const c of parsed.choices) if (!(perm.chosen && perm.chosen[c])) needs.push({ id: perm.id, card: perm.card.n, choice: c });
    }
    for (const i of insts.values()) if (i.granted && i.tpl.parts.some((p) => !["6", "7b", "7c", "7d"].includes(p.layer)))
      unmodeled.push({ id: i.srcId, card: i.name, text: i.tpl.text, why: "an ability gained from another effect that changes types, colors or control" });
    for (const o of objs.values()) for (const a of o.abil) for (const u of a.unmodeled || []) unmodeled.push({ id: o.id, card: o.printedName, text: u.text, why: u.why });

    const finals = [];
    for (const o of objs.values()) {
      const creature = o.types.has("Creature");
      let p = null, t = null;
      if (creature) { p = o.p == null ? 0 : o.p; t = o.t == null ? 0 : o.t; }   // 208.5
      const order = ["Kindred", "Artifact", "Enchantment", "Land", "Creature", "Planeswalker", "Battle", "Instant", "Sorcery"];
      const types = [...o.types].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const supers = FX.SUPERTYPES.filter((s) => o.supers.has(s));
      const subs = [...o.subs];
      const typeLine = supers.concat(types).join(" ") + (subs.length || o.allCT ? " — " + subs.join(" ") + (o.allCT ? (subs.length ? " + " : "") + "every creature type" : "") : "");
      const printedAbil = o.base.abilities.map((a) => a.text);
      const kept = new Set(o.abil.filter((a) => a.src === "printed" || a.src === "copy").map((a) => a.text));
      finals.push({ id: o.id, name: o.name, card: o.printedName, controller: o.controller, owner: o.owner, types, supertypes: supers, subtypes: subs, allCreatureTypes: o.allCT, typeLine,
        colors: "WUBRG".split("").filter((c) => o.colors.has(c)), abilities: o.abil.map((a) => ({ text: a.text, kw: a.kw, from: a.src === "effect" ? a.from : a.src === "intrinsic" ? "its land type" : a.src === "counter" ? "a counter" : null })),
        lost: printedAbil.filter((x) => !kept.has(x)), p, t, pt: creature ? show(p) + "/" + show(t) : null, unknownPT: o.unknownPT, counters: o.counters, attachedTo: o.attachedTo, token: o.token, mv: o.mv, ts: o.ts });
    }
    return { finals, log, unmodeled: dedupe(unmodeled), conditions: dedupe(conditions), needs, objs };
  }
  function dedupe(a) { const seen = new Set(); return a.filter((x) => { const k = JSON.stringify([x.id, x.text, x.why]); if (seen.has(k)) return false; seen.add(k); return true; }); }

  // A group effect from a resolved spell or ability only affects what matched when it resolved (611.2c).
  function lockSets(state, opts) {
    const effects = (state.effects || []).filter((e) => !e.locked && (e.templates || []).some((t) => t.who.kind === "group"));
    if (!effects.length) return state;
    const out = Object.assign({}, state, { effects: (state.effects || []).map((e) => Object.assign({}, e)) });
    for (const e of out.effects.slice().sort((a, b) => a.ts - b.ts)) {
      if (e.locked || !(e.templates || []).some((t) => t.who.kind === "group")) continue;
      const earlier = { permanents: out.permanents.filter((p) => p.ts < e.ts).map((p) => (p.attachedTo != null && !out.permanents.some((q) => q.id === p.attachedTo && q.ts < e.ts) ? Object.assign({}, p, { attachedTo: null }) : p)),
        effects: out.effects.filter((x) => x.ts < e.ts), assume: out.assume, values: out.values };
      const r = compute(lockSets(earlier, opts), opts);
      const ctx = { srcId: e.sourceId != null ? e.sourceId : null, controller: e.controller || "you", chosen: e.chosen || null };
      if (ctx.srcId != null && r.objs.has(ctx.srcId)) ctx.controller = r.objs.get(ctx.srcId).controller;
      e.locked = e.templates.map((t) => (t.who.kind === "group" ? [...r.objs.values()].filter((o) => matches(t.who, o, ctx)).map((o) => o.id) : null));
    }
    return out;
  }

  // ---------- state-based actions that follow from the result (704) ----------
  function checkSBA(state, r, opts) {
    const acts = [];
    const fin = new Map(r.finals.map((f) => [f.id, f]));
    for (const f of r.finals) {
      if (f.types.includes("Creature") && typeof f.t === "number" && !Number.isNaN(f.t) && f.t <= 0)
        acts.push({ id: f.id, card: f.card, kind: "dies", rule: cite("704.5f"), text: f.card + " has toughness " + f.t + ", so it is put into its owner's graveyard." });
      const isAura = f.subtypes.includes("Aura"), isEquip = f.subtypes.includes("Equipment") || f.subtypes.includes("Fortification");
      const host = f.attachedTo != null ? fin.get(f.attachedTo) : null;
      if (isAura) {
        const spec = FX.parseCard(state.permanents.find((p) => p.id === f.id).card).enchant;
        if (f.types.includes("Creature") && host) acts.push({ id: f.id, card: f.card, kind: "dies", rule: cite("303.4d"), text: f.card + " is an Aura that's also a creature, so it can't enchant anything: it becomes unattached and is put into its owner's graveyard." });
        else if (!host) { if (!(spec && spec.player)) acts.push({ id: f.id, card: f.card, kind: "dies", rule: cite("704.5m"), text: f.card + " is an Aura that isn't attached to anything, so it is put into its owner's graveyard." }); }
        else if (spec && spec.kind === "group" && !matches(spec, r.objs.get(host.id), { srcId: f.id, controller: f.controller, chosen: null }))
          acts.push({ id: f.id, card: f.card, kind: "dies", rule: cite("704.5m"), text: f.card + " can no longer enchant " + host.card + " (it needs: " + enchantText(state, f.id) + "), so it is put into its owner's graveyard." });
      } else if (isEquip && host) {
        if (f.types.includes("Creature")) acts.push({ id: f.id, card: f.card, kind: "unattach", rule: cite("301.5c"), text: f.card + " is now a creature, so it can't equip anything: it becomes unattached and stays on the battlefield." });
        else if (!host.types.includes(f.subtypes.includes("Fortification") ? "Land" : "Creature")) acts.push({ id: f.id, card: f.card, kind: "unattach", rule: cite("704.5n"), text: f.card + " is attached to " + host.card + ", which it can't be attached to any more: it becomes unattached and stays on the battlefield." });
      } else if (host && !isAura && !isEquip) acts.push({ id: f.id, card: f.card, kind: "unattach", rule: cite("704.5n"), text: f.card + " is no longer an Aura or Equipment, so it becomes unattached." });
      if (f.counters["+1/+1"] > 0 && f.counters["-1/-1"] > 0) acts.push({ id: f.id, card: f.card, kind: "counters", rule: cite("704.5q"), text: f.card + " has both +1/+1 and -1/-1 counters; they cancel out in pairs." });
    }
    const legends = new Map();
    for (const f of r.finals) if (f.supertypes.includes("Legendary")) { const k = f.controller + "|" + f.name; legends.set(k, (legends.get(k) || []).concat(f)); }
    const warn = [];
    for (const list of legends.values()) if (list.length > 1) warn.push({ rule: cite("704.5j"), text: who(list[0].controller)[0].toUpperCase() + who(list[0].controller).slice(1) + " control" + (list[0].controller === "you" ? "" : "s") + " " + list.length + " legendary permanents named " + list[0].name + ": that player keeps one and the rest go to the graveyard (the \"legend rule\")." });
    void opts;
    return { acts, warn };
  }
  function enchantText(state, id) { const c = state.permanents.find((p) => p.id === id).card; const m = (c.o || "").match(/^Enchant ([^\n(]+)/m); return m ? m[1].trim() : "a legal permanent"; }

  // Resolve the board. With opts.sba (default on) it also performs the state-based actions that follow and recalculates.
  function resolve(state, opts) {
    opts = opts || {};
    let cur = Object.assign({}, state, { permanents: state.permanents.map((p) => Object.assign({}, p, { counters: Object.assign({}, p.counters || {}) })) });
    const sba = [], warnings = [];
    cur = lockSets(cur, opts);   // what each resolved group effect applies to is fixed from here on (611.2c)
    let r = compute(cur, opts);
    const first = r;
    for (let round = 0; opts.sba !== false && round < 12; round++) {
      const { acts, warn } = checkSBA(cur, r, opts);
      if (round === 0 || !acts.length) { warnings.length = 0; warnings.push(...warn); }
      if (!acts.length) break;
      sba.push(...acts.map((a) => Object.assign({ round: round + 1 }, a)));
      const dead = new Set(acts.filter((a) => a.kind === "dies").map((a) => a.id));
      const unatt = new Set(acts.filter((a) => a.kind === "unattach").map((a) => a.id));
      const cancel = new Set(acts.filter((a) => a.kind === "counters").map((a) => a.id));
      cur = Object.assign({}, cur, {
        permanents: cur.permanents.filter((p) => !dead.has(p.id)).map((p) => {
          const q = Object.assign({}, p, { counters: Object.assign({}, p.counters) });
          if (unatt.has(p.id) || (p.attachedTo != null && dead.has(p.attachedTo))) q.attachedTo = null;
          if (cancel.has(p.id)) { const n = Math.min(q.counters["+1/+1"], q.counters["-1/-1"]); q.counters["+1/+1"] -= n; q.counters["-1/-1"] -= n; }
          return q;
        }),
        effects: (cur.effects || []).filter((e) => !(e.target != null && dead.has(e.target))),
      });
      r = compute(cur, opts);
    }
    return { permanents: r.finals, before: sba.length ? first.finals : null, log: first.log, logAfter: sba.length ? r.log : null, sba, warnings, unmodeled: first.unmodeled, conditions: first.conditions, needs: first.needs };
  }

  // ---------- every timestamp order ----------
  function fingerprint(res) {
    return JSON.stringify(res.permanents.map((f) => [f.id, f.name, f.controller, f.typeLine, f.colors.join(""), f.pt, f.abilities.map((a) => a.text).sort(), f.attachedTo]).sort()) + "|" + res.sba.map((a) => a.id + a.kind).sort().join(",");
  }
  // Try each possible order in which the entries could have arrived and group the orders by result.
  function outcomes(state, opts) {
    opts = opts || {};
    const items = state.permanents.map((p) => ({ kind: "p", ref: p, name: p.label || p.card.n })).concat((state.effects || []).map((e) => ({ kind: "e", ref: e, name: e.name })));
    const matters = items.filter((it) => {
      if (it.kind === "e") return true;
      const p = it.ref, parsed = FX.parseCard(p.card);
      return parsed.abilities.some((a) => (a.kind === "static" || a.kind === "keyword") && a.templates.length && !a.templates.every((t) => t.cda)) || p.copy || p.copyOf != null || p.attachedTo != null;
    });
    const limit = opts.maxOrders || 720;
    const base = resolve(state, opts);
    const n = matters.length;
    let count = 1; for (let i = 2; i <= n; i++) count *= i;
    if (n < 2) return { base, outcomes: [{ result: base, orders: 1, current: true }], tried: 1, complete: true, pairs: [] };
    const slots = matters.map((it) => it.ref.ts).sort((a, b) => a - b);
    const mustFollow = (it) => {   // an Aura, a targeted effect or a copy comes after the thing it points at
      const r = it.ref, out = [];
      if (it.kind === "p") { if (r.attachedTo != null) out.push(r.attachedTo); if (r.copyOf != null) out.push(r.copyOf); }
      else { if (r.target != null) out.push(r.target); if (r.sourceId != null) out.push(r.sourceId); }
      return out;
    };
    const tsOf = (id, assign) => { const i = matters.findIndex((m) => m.kind === "p" && m.ref.id === id); if (i >= 0) return assign[i]; const p = state.permanents.find((q) => q.id === id); return p ? p.ts : -Infinity; };
    const groups = new Map();
    let tried = 0;
    const perm = [], used = new Array(n).fill(false);
    const run = () => {
      const assign = new Array(n);
      perm.forEach((mi, pos) => { assign[mi] = slots[pos]; });
      for (let i = 0; i < n; i++) for (const id of mustFollow(matters[i])) if (tsOf(id, assign) >= assign[i]) return;
      const st = Object.assign({}, state, {
        permanents: state.permanents.map((p) => { const i = matters.findIndex((m) => m.kind === "p" && m.ref === p); return i < 0 ? p : Object.assign({}, p, { ts: assign[i] }); }),
        effects: (state.effects || []).map((e) => { const i = matters.findIndex((m) => m.kind === "e" && m.ref === e); return Object.assign({}, e, { ts: assign[i], locked: e.lockedByUser ? e.locked : null }); }),
      });
      const res = resolve(st, opts);
      tried++;
      const fp = fingerprint(res);
      const seq = perm.map((mi) => mi);
      if (!groups.has(fp)) groups.set(fp, { result: res, orders: 0, seqs: [], current: false });
      const g = groups.get(fp); g.orders++; g.seqs.push(seq);
      if (seq.every((mi, pos) => matters[mi].ref.ts === slots[pos])) g.current = true;
    };
    const rec = () => {
      if (tried >= limit) return;
      if (perm.length === n) { run(); return; }
      for (let i = 0; i < n; i++) if (!used[i]) { used[i] = true; perm.push(i); rec(); perm.pop(); used[i] = false; }
    };
    rec();
    const list = [...groups.values()];
    // for each result, the "A before B" facts that are true in all of its orders but not in every order
    const all = list.flatMap((g) => g.seqs);
    const before = (seq, a, b) => seq.indexOf(a) < seq.indexOf(b);
    for (const g of list) {
      g.when = [];
      if (list.length < 2) continue;
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        if (a === b) continue;
        if (g.seqs.every((s) => before(s, a, b)) && !all.every((s) => before(s, a, b))) g.when.push([matters[a].name, matters[b].name, a, b]);
      }
      // keep only the facts that separate this result from another one
      g.when = g.when.filter(([, , a, b]) => list.some((o) => o !== g && o.seqs.some((s) => before(s, b, a))));
      g.order = g.seqs[0].map((mi) => matters[mi].name);
    }
    list.sort((x, y) => (y.current ? 1 : 0) - (x.current ? 1 : 0) || y.orders - x.orders);
    for (const g of list) delete g.seqs;
    return { base, outcomes: list, tried, complete: tried >= count || tried < limit, entries: matters.map((m) => m.name) };
  }

  // ---------- building a board from a list of picked cards ----------
  /* entries, in timestamp order: [{ id, card, controller, counters, attach, target, copy, chosen, x, faceDown, use }].
   * Instants and sorceries become resolved effects. A "use" entry ({of: entry id, ability: index} or
   * {of, crew: true}) is an ability of an earlier entry that has resolved. */
  function buildState(entries, opts) {
    opts = opts || {};
    const state = { permanents: [], effects: [], assume: opts.assume || {}, values: opts.values || {} };
    const seenNames = {}, total = {};
    for (const e of entries) if (e.card && !e.use) total[e.card.n] = (total[e.card.n] || 0) + 1;
    for (const e of entries) if (e.card && !e.use) { seenNames[e.card.n] = (seenNames[e.card.n] || 0) + 1; e.label = total[e.card.n] > 1 ? e.card.n + " (" + seenNames[e.card.n] + ")" : e.card.n; }
    const notes = [];
    const printedOf = new Map();
    let now = null, nowAt = -1;
    const fits = (sel, e, ctx) => {
      if (!sel || sel.kind !== "group") return true;
      if (nowAt !== state.permanents.length + state.effects.length) { now = compute(lockSets(state, opts), opts).objs; nowAt = state.permanents.length + state.effects.length; }
      const o = now.get(e.id) || makeObject({ id: e.id, card: e.card, controller: e.controller || "you", ts: 0 }, { permanents: [] }, opts.lookup);
      return matches(sel, o, ctx);
    };
    entries.forEach((e, idx) => {
      const ts = idx + 1, ctrl = e.controller || "you";
      const parsed = e.card && !e.use ? FX.parseCard(e.card) : null;
      const earlier = entries.slice(0, idx).filter((x) => x.card && !FX.parseCard(x.card).spell && !x.use);
      const others = entries.filter((x, j) => j !== idx && x.card && !FX.parseCard(x.card).spell && !x.use);
      const pickTarget = (filter, chosen, pool) => {
        if (chosen != null && pool.some((x) => x.id === chosen)) return chosen;
        const ctx = { srcId: e.id, controller: ctrl, chosen: null };
        const hit = pool.find((x) => fits(filter, x, ctx));
        return hit ? hit.id : null;
      };
      if (e.use) {
        const src = entries.find((x) => x.id === e.use.of);
        if (src && e.use.crew) {   // 702.122a
          state.effects.push({ id: e.id, name: "Crew (" + (src.label || src.card.n) + ")", sourceId: src.id, templates: [{ who: { kind: "target" }, parts: [{ layer: "4", addCard: ["Artifact", "Creature"] }], cond: null, duration: "eot", text: "This permanent becomes an artifact creature until end of turn." }], controller: src.controller || "you", ts, target: src.id });
          return;
        }
        const ab = src && FX.parseCard(src.card).abilities[e.use.ability];
        if (!src || !ab || !ab.templates.length) { notes.push("An ability to use was not found."); return; }
        const tpls = ab.templates;
        const tgt = tpls.find((t) => t.who.kind === "target");
        const target = tgt ? pickTarget(tgt.who.filter, e.target, entries.slice(0, idx).filter((x) => x.card && !x.use && !FX.parseCard(x.card).spell)) : null;
        state.effects.push({ id: e.id, name: (src.label || src.card.n) + (ab.kind === "activated" ? " (ability)" : " (trigger)"), sourceId: src.id, templates: tpls.map((t) => (t.who.kind === "self" ? Object.assign({}, t, { who: { kind: "target" } }) : t)),
          controller: src.controller || "you", ts, target: tgt ? target : tpls.some((t) => t.who.kind === "self") ? src.id : null, x: e.x, chosen: e.chosen || src.chosen || null });
        if (tgt && target == null) notes.push(src.card.n + "'s ability has no legal target on the board.");
        return;
      }
      if (parsed.spell) {
        const tpls = [].concat(...parsed.abilities.map((a) => a.templates));
        const tgt = tpls.find((t) => t.who.kind === "target");
        const target = tgt ? pickTarget(tgt.who.filter, e.target, earlier) : null;
        if (tpls.length) state.effects.push({ id: e.id, name: e.label || e.card.n, templates: tpls, controller: ctrl, ts, target, x: e.x, chosen: e.chosen || null });
        if (tgt && target == null) notes.push(e.card.n + " has no legal target among the cards before it.");
        for (const a of parsed.abilities) for (const u of a.unmodeled) notes.push("Not modeled: " + e.card.n + ": " + u.text);
        return;
      }
      const perm = { id: e.id, label: e.label, card: e.card, controller: ctrl, owner: e.owner || ctrl, ts, counters: Object.assign({}, e.counters || {}), attachedTo: null, faceDown: !!e.faceDown, token: !!e.token, chosen: e.chosen || null };
      const isAura = /\bAura\b/.test(e.card.t.split(" — ")[1] || ""), isEquip = /\b(?:Equipment|Fortification)\b/.test(e.card.t.split(" — ")[1] || "");
      if (isAura && !(parsed.enchant && parsed.enchant.player)) {
        perm.attachedTo = pickTarget(parsed.enchant, e.attach, earlier);
        if (perm.attachedTo == null) notes.push(e.card.n + " has nothing it can enchant among the cards before it.");
      } else if (isEquip && e.attach !== "none") {
        const want = /Fortification/.test(e.card.t) ? { kind: "group", types: ["Land"], control: "you" } : { kind: "group", types: ["Creature"], control: "you" };
        perm.attachedTo = pickTarget(want, e.attach, others);
      }
      if (parsed.copy && e.copy !== "none") {   // by default it copies the first thing it can
        const pool = earlier.filter((x) => state.permanents.some((p) => p.id === x.id));
        const id = pickTarget(parsed.copy.of, e.copy, pool);
        const of = state.permanents.find((p) => p.id === id);
        if (of) perm.copy = { values: copiable(of, state, opts.lookup).values };
      }
      printedOf.set(e.id, perm);
      state.permanents.push(perm);
    });
    // an Equipment can be attached to something that arrived later: it gets a new timestamp then (613.7e)
    for (const p of state.permanents) if (p.attachedTo != null) { const host = state.permanents.find((q) => q.id === p.attachedTo); if (host && host.ts > p.ts) { p.ts = host.ts + 0.5; } }
    return { state, notes };
  }

  const api = { init, resolve, outcomes, buildState, copiable, printed, matches, LAYER_NAME, LAYER_RULE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MTGLayers = api;
})(typeof self !== "undefined" ? self : this);
