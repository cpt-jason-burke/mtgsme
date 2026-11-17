/* MTGSME effect reader: turns oracle text into continuous-effect data for the layer engine (layers.js).
 *
 * It only reads templates it knows exactly. Anything that looks like a continuous effect but does not
 * parse is returned as "unmodeled" with its text, so the app can say "not modeled" instead of guessing.
 * Nothing here is copied from another rules engine; the templates follow the Comprehensive Rules
 * (205.1a/b for type-setting, 305.7 for basic land types, 604.3 for characteristic-defining abilities). */
(function (root) {
  "use strict";

  const COLOR = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
  const CARD_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Kindred", "Land", "Planeswalker"];
  const SUPERTYPES = ["Basic", "Legendary", "Snow", "World", "Ongoing"];
  const BASIC_LAND = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
  const STATES = /^(?:attacking|blocking|blocked|unblocked|tapped|untapped|enchanted|equipped|modified|face-down|suspected|goaded|saddled|crewed|historic|commander|outlaw|party)$/i;
  // Keyword abilities (rule 702) used when no rules data is loaded; init(cr) replaces the list.
  let KEYWORDS = ["deathtouch", "defender", "double strike", "first strike", "flash", "flying", "haste", "hexproof", "indestructible", "lifelink",
    "menace", "reach", "trample", "vigilance", "ward", "protection", "shroud", "fear", "intimidate", "shadow", "horsemanship", "flanking", "skulk",
    "wither", "infect", "persist", "undying", "changeling", "prowess", "banding", "phasing", "exalted", "devoid", "toxic", "annihilator", "landwalk",
    "equip", "crew", "cycling", "decayed", "battle cry", "cascade", "storm", "myriad", "melee", "mentor", "training", "riot", "afflict", "bushido", "rampage"];
  let SUB = { creature: new Set(), land: new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Desert", "Gate", "Cave", "Locus", "Lair", "Urza's", "Mine", "Tower", "Power-Plant", "Sphere", "Town"]),
    artifact: new Set(["Equipment", "Vehicle", "Treasure", "Food", "Clue", "Blood", "Fortification"]), enchantment: new Set(["Aura", "Saga", "Shrine", "Curse", "Role", "Class", "Case", "Room", "Rune", "Background", "Cartouche"]),
    planeswalker: new Set(), battle: new Set(["Siege"]) };
  let FORMS = new Map();   // lowercase singular or plural -> [Type, category]
  let KW_RE = null;

  function plurals(t) {
    const irregular = { Elf: "Elves", Dwarf: "Dwarves", Wolf: "Wolves", Werewolf: "Werewolves", Mouse: "Mice", Ox: "Oxen", Cyclops: "Cyclopes", Pegasus: "Pegasi", Homunculus: "Homunculi", Fungus: "Fungi", Thief: "Thieves" };
    const out = [t];
    if (irregular[t]) out.push(irregular[t]);
    else if (/(?:s|x|ch|sh|z)$/i.test(t)) out.push(t + "es");
    else if (/[^aeiou]y$/i.test(t)) out.push(t.slice(0, -1) + "ies");
    else out.push(t + "s");
    return out;
  }

  function rebuild() {
    FORMS = new Map();
    for (const cat of ["planeswalker", "battle", "enchantment", "artifact", "land", "creature"])
      for (const t of SUB[cat]) for (const f of plurals(t)) FORMS.set(f.toLowerCase(), [t, cat]);
    const kws = KEYWORDS.slice().sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    KW_RE = new RegExp("^(?:" + kws.join("|") + "|(?:plains|island|swamp|mountain|forest|desert|land|nonbasic land|legendary land|snow land)walk)\\b", "i");
  }

  // Read the subtype lists (205.3) and the keyword abilities (702) out of the loaded rules.
  function init(cr) {
    if (!cr || !cr.rules) return;
    const list = (phrase, lead) => {
      for (const n in cr.rules) {
        const t = cr.rules[n].t || "";
        if (!t.includes(phrase)) continue;
        const i = t.indexOf(lead);
        if (i < 0) continue;
        return t.slice(i + lead.length).replace(/\([^)]*\)/g, "").replace(/\.\s*Of that list.*$/, "").replace(/\.$/, "")
          .split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim().replace(/\.$/, "").replace(/’/g, "'")).filter(Boolean);
      }
      return null;
    };
    const set = (cat, arr) => { if (arr && arr.length > 3) SUB[cat] = new Set(arr); };
    set("artifact", list("these subtypes are called artifact types", "The artifact types are "));
    set("enchantment", list("these subtypes are called enchantment types", "The enchantment types are "));
    set("land", list("these subtypes are called land types", "The land types are "));
    set("planeswalker", list("these subtypes are called planeswalker types", "The planeswalker types are "));
    const cre = list("these subtypes are called creature types", "one word long: ");
    if (cre && cre.length > 100) { cre.push("Time Lord"); SUB.creature = new Set(cre); }
    if (cr.kw) {
      const ks = Object.keys(cr.kw).filter((k) => /^702\./.test(cr.kw[k]) && k.length < 40);
      if (ks.length > 50) KEYWORDS = ks;
    }
    rebuild();
  }
  rebuild();

  function subCategory(t) { for (const cat in SUB) if (SUB[cat].has(t)) return cat; return null; }
  function manaValue(cost) {
    let v = 0;
    for (const m of String(cost || "").matchAll(/\{([^}]+)\}/g)) {
      const s = m[1].toLowerCase();
      if (/^\d+$/.test(s)) v += +s;
      else if (s === "x" || s === "y" || s === "z") v += 0;
      else if (/^2\//.test(s)) v += 2;
      else if (s === "½" || s === "hw" || s === "hr") v += 0.5;
      else v += 1;
    }
    return v;
  }
  function costColors(cost) {
    const out = new Set();
    for (const m of String(cost || "").matchAll(/\{([^}]+)\}/g)) for (const ch of m[1].toUpperCase()) if ("WUBRG".includes(ch)) out.add(ch);
    return "WUBRG".split("").filter((c) => out.has(c));
  }

  // ---------- small parsers ----------
  function splitSentences(text) {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') q = !q;
      cur += ch;
      if (ch === "." && !q && (i + 1 >= text.length || text[i + 1] === " ")) { out.push(cur.trim()); cur = ""; }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function parseValue(str) {
    const s = str.trim().replace(/\.$/, "");
    if (/^\d+$/.test(s)) return +s;
    if (/^X$/.test(s)) return { x: true };
    if (/^(?:its|that (?:permanent|artifact|enchantment|card)'s) mana value$/i.test(s)) return { mv: true };
    let m = s.match(/^(?:(\d+) plus )?the number of (.+?)(?: plus (\d+))?$/i);
    if (m) {
      const g = countable(m[2]);
      if (g) return Object.assign(g, { plus: +(m[1] || m[3] || 0) });
    }
    return { unknown: s };
  }
  // "lands you control", "+1/+1 counter on it", "Aura attached to it": things the board can count.
  function countable(str) {
    const s = str.trim();
    let m = s.match(/^(\+1\/\+1|-1\/-1|[a-z]+) counters? on (?:it|~)$/i);
    if (m) return { counters: m[1].toLowerCase() };
    m = s.match(/^(Aura|Equipment|Aura and Equipment|Equipment and Aura)s? attached to (?:it|~)$/i);
    if (m) return { attached: /and/i.test(m[1]) ? ["Aura", "Equipment"] : [m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()] };
    const g = parseGroup(s.replace(/^(?:each|all) /i, ""));
    if (g && !hasUnknown(g)) return { count: g };
    return null;
  }
  function hasUnknown(sel) { return !!(sel.unknown || (sel.any && sel.any.some(hasUnknown))); }

  // A noun phrase such as "other nontoken Elf creatures you control with flying".
  function parseGroup(np) {
    let s = np.trim();
    const sel = { kind: "group" };
    let m = s.match(/^(.*?)\s*\b(you control|your opponents control|an opponent controls|you don't control)\b\s*(.*)$/i);
    if (m) { sel.control = /^you control$/i.test(m[2]) ? "you" : "opp"; s = (m[1] + " " + m[3]).trim(); }
    else if ((m = s.match(/^(.*?)\s*\byou own\b\s*(.*)$/i))) { sel.owned = true; s = (m[1] + " " + m[2]).trim(); }
    m = s.match(/^(.*?) of the chosen (type|colou?r)$/i);
    if (m) { if (/type/i.test(m[2])) sel.chosenType = true; else sel.chosenColor = true; s = m[1]; }
    m = s.match(/^(.*?) with(out)? (.+)$/i);
    if (m) {
      const w = m[3];
      let k;
      if ((k = w.match(/^(power|toughness|mana value) (\d+) or (greater|less)$/i))) sel.stat = { what: k[1].toLowerCase(), n: +k[2], op: k[3].toLowerCase() === "greater" ? ">=" : "<=" };
      else if ((k = w.match(/^(?:an? |one or more )?(\+1\/\+1|-1\/-1) counters? on (?:it|them)$/i))) sel.counter = k[1];
      else if (/^(?:a counter|counters|one or more counters) on (?:it|them)$/i.test(w)) sel.counter = "*";
      else if ((k = KW_RE.exec(w)) && k[0].length === w.length) sel[m[2] ? "withoutKw" : "withKw"] = w.toLowerCase();
      else return null;
      if (m[2] && !sel.withoutKw) return null;
      s = m[1];
    }
    if ((m = s.match(/^(.*?) that(?:'s| is| are) (?:an? )?([A-Z][a-z]+)(?: or (?:an? )?([A-Z][a-z]+))?$/)) && FORMS.has(m[2].toLowerCase()) && (!m[3] || FORMS.has(m[3].toLowerCase()))) {
      sel.anySub = [FORMS.get(m[2].toLowerCase())[0]].concat(m[3] ? [FORMS.get(m[3].toLowerCase())[0]] : []); s = m[1];
    }
    if (/\b(?:that|which|named|if|as long as|other than)\b/i.test(s)) return null;
    // "A and B", "A, B, or C": any of several simple groups
    if (/,| or | and /i.test(s)) {
      const parts = s.split(/,\s*(?:and |or )?(?:all |each )?| (?:and|or|and\/or) (?:all |each )?/i).map((x) => x.trim()).filter(Boolean);
      const noun = parts[parts.length - 1].split(" ").pop();
      const any = parts.map((p) => simpleGroup(p) || simpleGroup(p + " " + noun));   // "white or blue creature": the noun is shared
      if (any.some((x) => !x)) return null;
      // "artifact and enchantment creatures": earlier parts are adjectives sharing the last noun
      return Object.assign(sel, { any });
    }
    const g = simpleGroup(s);
    return g ? Object.assign(g, sel) : null;
  }
  function simpleGroup(s) {
    const sel = { kind: "group" };
    const words = s.split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    let noun = false;
    for (let i = 0; i < words.length; i++) {
      let w = words[i], two = i + 1 < words.length ? w + " " + words[i + 1] : "";
      const lw = w.toLowerCase();
      if (two && FORMS.has(two.toLowerCase()) && /^[A-Z]/.test(w)) { push(sel, "subtypes", FORMS.get(two.toLowerCase())[0]); noun = true; i++; continue; }
      if (lw === "other" || lw === "another") { sel.other = true; continue; }
      if (lw === "each" || lw === "all" || lw === "a" || lw === "an") continue;
      if (COLOR[lw]) { push(sel, "colors", COLOR[lw]); continue; }
      if (lw === "colorless") { sel.colorless = true; continue; }
      if (lw === "multicolored") { sel.multicolored = true; continue; }
      if (lw === "token" || lw === "tokens") { sel.token = true; if (i === words.length - 1) noun = true; continue; }
      if (lw === "nontoken") { sel.token = false; continue; }
      if (lw === "permanent" || lw === "permanents") { noun = true; continue; }
      const non = lw.match(/^non-?(.+)$/);
      if (non) {
        const x = non[1];
        if (COLOR[x]) { push(sel, "notColors", COLOR[x]); continue; }
        const ct = cardType(x), st = superType(x), f = FORMS.get(x);
        if (ct) { push(sel, "notTypes", ct); continue; }
        if (st) { push(sel, "notSupertypes", st); continue; }
        if (f) { push(sel, "notSubtypes", f[0]); continue; }
        return null;
      }
      const ct = cardType(lw), st = superType(lw);
      if (ct) { push(sel, "types", ct); noun = true; continue; }
      if (st) { push(sel, "supertypes", st); continue; }
      if (STATES.test(lw)) { sel.unknown = lw; continue; }
      if (FORMS.has(lw) && /^[A-Z]/.test(w)) { push(sel, "subtypes", FORMS.get(lw)[0]); noun = true; continue; }
      return null;
    }
    return noun ? sel : null;
  }
  function push(o, k, v) { (o[k] = o[k] || []).push(v); }
  function cardType(w) { const s = w.replace(/s$/, ""); const t = CARD_TYPES.find((c) => c.toLowerCase() === s); return t || null; }
  function superType(w) { return SUPERTYPES.find((c) => c.toLowerCase() === w) || null; }

  function parseSubject(str) {
    const s = str.trim();
    if (/^~$/.test(s)) return { kind: "self" };
    if (/^(?:it|that (?:creature|permanent|land|artifact|enchantment|planeswalker|card|Vehicle|Equipment))$/i.test(s)) return { kind: "that" };
    if (/^(?:they|those (?:creatures|permanents|lands|artifacts)|each of (?:them|those creatures)|both creatures)$/i.test(s)) return { kind: "that", plural: true };
    let m = s.match(/^(enchanted|equipped|fortified) (creature|permanent|land|artifact|enchantment|planeswalker|Equipment|Vehicle|Forest|Island|Swamp|Mountain|Plains)$/i);
    if (m) return { kind: "attached" };
    m = s.match(/^(up to )?(one |two |three |four |five |X |any number of )?(another |other )?target (.+?)( each)?$/i);
    if (m) {
      const g = parseGroup(m[4]);
      if (!g) return null;
      const n = { one: 1, two: 2, three: 3, four: 4, five: 5 }[(m[2] || "one").trim().toLowerCase()] || 9;
      return { kind: "target", filter: Object.assign(g, m[3] ? { other: true } : {}), optional: !!m[1], count: n };
    }
    if (/\btarget\b/i.test(s)) return null;
    return parseGroup(s);
  }

  // "flying, first strike, and protection from red" or quoted abilities. Returns {items, rest} or null.
  function parseAbilityList(str) {
    let s = str; const items = [];
    for (;;) {
      let m = s.match(/^"([^"]+)"/);
      if (m) { items.push({ text: m[1], quoted: true }); s = s.slice(m[0].length); }
      else if ((m = KW_RE.exec(s))) {
        let len = m[0].length, kw = m[0].toLowerCase();
        const after = s.slice(len);
        let p = after.match(/^ from (?:[a-z' -]+?)(?=$|\.|,| and (?!from)| until | this turn| as long as | for as long as )/i) ||
          after.match(/^(?: \d+| \{[^ ,.]*\}(?:\{[^ ,.]*\})*|—[^,."]+)/);
        if (kw === "protection" || kw === "hexproof" || !/^ from/.test(p ? p[0] : "")) { if (p) len += p[0].length; }
        items.push({ text: s.slice(0, len), kw: /walk$/.test(kw) ? "landwalk" : kw });
        s = s.slice(len);
      } else return items.length ? null : null;
      const sep = s.match(/^(?:, and |, | and )(?=")/) || s.match(/^(?:, and |, | and )/);
      if (!sep) break;
      const next = s.slice(sep[0].length);
      if (/^"/.test(next) || KW_RE.test(next)) s = next; else break;
    }
    return { items, rest: s };
  }

  // The words after "is / are / becomes": types, colors, P/T. Returns {parts, rest} or null.
  function parseCharacteristic(str, verb) {
    let s = str; const parts = []; let m;
    const done = (rest) => ({ parts, rest });
    if ((m = s.match(/^every creature type/i))) { parts.push({ layer: "4", allCreatureTypes: true }); return done(s.slice(m[0].length)); }
    if ((m = s.match(/^every basic land type in addition to (?:its|their) other types/i))) { parts.push({ layer: "4", addSub: BASIC_LAND.slice() }); return done(s.slice(m[0].length)); }
    if ((m = s.match(/^all colors/i))) { parts.push({ layer: "5", setColors: ["W", "U", "B", "R", "G"] }); return done(s.slice(m[0].length)); }
    if ((m = s.match(/^the chosen (?:creature )?type( in addition to (?:its|their) other (?:creature )?types)?/i))) {
      parts.push(m[1] ? { layer: "4", addSub: ["*chosen"] } : { layer: "4", setCreatureTypes: ["*chosen"] }); return done(s.slice(m[0].length));
    }
    if ((m = s.match(/^the chosen colou?r( in addition to (?:its|their) other colors)?/i))) {
      parts.push(m[1] ? { layer: "5", addColors: ["*chosen"] } : { layer: "5", setColors: ["*chosen"] }); return done(s.slice(m[0].length));
    }
    if ((m = s.match(/^the colou?r(?: or colors)? of your choice/i))) { parts.push({ layer: "5", setColors: ["*chosen"] }); return done(s.slice(m[0].length)); }
    // general noun phrase
    s = s.replace(/^an? /i, "");
    let pt = null, colors = null, colorless = false;
    if ((m = s.match(/^(\d+|X)\/(\d+|X)(?: |$)/))) { pt = [parseValue(m[1]), parseValue(m[2])]; s = s.slice(m[0].length); }
    if ((m = s.match(/^((?:white|blue|black|red|green)(?:(?:, and |, | and )(?:white|blue|black|red|green))*)(?= |$|\.|,)/i))) {
      colors = m[1].toLowerCase().split(/, and |, | and /).map((c) => COLOR[c]); s = s.slice(m[0].length).replace(/^ /, "");
    } else if ((m = s.match(/^colorless(?= |$|\.|,)/i))) { colorless = true; s = s.slice(m[0].length).replace(/^ /, ""); }
    const card = [], sup = [], subs = [];
    for (;;) {
      m = s.match(/^([A-Za-z'’-]+)(?: ([A-Z][a-z]+))?/);
      if (!m) break;
      let w = m[1], used = w.length;
      const two = m[2] ? (w + " " + m[2]).toLowerCase() : "";
      if (two && FORMS.has(two) && /^[A-Z]/.test(w)) { subs.push(FORMS.get(two)); used = m[0].length; }
      else if (cardType(w.toLowerCase()) && w === w.toLowerCase()) card.push(cardType(w.toLowerCase()));
      else if (superType(w.toLowerCase()) && w === w.toLowerCase()) sup.push(superType(w.toLowerCase()));
      else if (FORMS.has(w.toLowerCase()) && /^[A-Z]/.test(w)) subs.push(FORMS.get(w.toLowerCase()));
      else if (w === "and" && (card.length || subs.length) && /^and (?:[A-Z][a-z'-]+ )*(?:[A-Z][a-z'-]+|artifacts?|creatures?|lands?|enchantments?)(?= |$|\.|,)/.test(s) && !/^and (?:has|have|gains?|loses?|gets?|is|are)\b/.test(s)) { /* joins two type groups */ }
      else break;
      s = s.slice(used).replace(/^ /, "");
    }
    if (!card.length && !sup.length && !subs.length && !colors && !colorless && !pt) return null;
    let addition = false, addColors = false, name = null;
    const abil = [];
    for (;;) {
      if ((m = s.match(/^,? ?with base power and toughness (\d+|X)\/(\d+|X)/i))) { pt = [parseValue(m[1]), parseValue(m[2])]; }
      else if ((m = s.match(/^,? ?with (?:base )?power and (?:base )?toughness each equal to (.+?)(?=$|\.| in addition| until | that's| and (?:has|have|gains?|loses?)\b)/i))) { const v = parseValue(m[1]); pt = [v, v]; }
      else if ((m = s.match(/^,? ?in addition to (?:its|their) other (creature |land |card )?(types|colors)(?: and (?:types|colors))?/i))) { addition = true; if (/colors/.test(m[0])) addColors = true; }
      else if ((m = s.match(/^,? ?(?:that's|that are|that is) still (?:an? )?[a-z]+/i))) { addition = true; }
      else if ((m = s.match(/^ named ([A-Z][A-Za-z' -]+?)(?=$|\.|,)/))) { name = m[1]; }
      else if ((m = s.match(/^,? ?with /i))) {
        const al = parseAbilityList(s.slice(m[0].length));
        if (!al) return null;
        abil.push(...al.items); s = al.rest; continue;
      } else break;
      s = s.slice(m[0].length);
    }
    const cre = subs.filter((x) => x[1] === "creature").map((x) => x[0]);
    const land = subs.filter((x) => x[1] === "land").map((x) => x[0]);
    const other = subs.filter((x) => x[1] !== "creature" && x[1] !== "land").map((x) => x[0]);
    const tp = { layer: "4" };
    if (addition) {
      if (card.length) tp.addCard = card;
      if (sup.length) tp.addSuper = sup;
      if (subs.length) tp.addSub = subs.map((x) => x[0]);
    } else if (card.includes("Artifact") && card.includes("Creature") && card.length === 2) {   // 205.1b
      tp.addCard = card;
      if (cre.length) tp.setCreatureTypes = cre;
      if (land.length || other.length) tp.addSub = land.concat(other);
      if (sup.length) tp.addSuper = sup;
    } else {
      if (card.length) tp.setCard = card;   // 205.1a
      if (cre.length) tp.setCreatureTypes = cre;
      if (land.length) tp.setLandTypes = land;
      if (other.length) tp.addSub = other;
      if (sup.length) tp.addSuper = sup;
    }
    if (Object.keys(tp).length > 1) parts.push(tp);
    if (colors || colorless) parts.push(addColors ? { layer: "5", addColors: colors || [] } : { layer: "5", setColors: colors || [] });
    if (abil.length) parts.push({ layer: "6", add: abil });
    if (pt) parts.push({ layer: "7b", p: pt[0], t: pt[1] });
    if (name) parts.push({ layer: "4", setName: name });
    void verb;
    return done(s);
  }

  const NEXT_PRED = "(?=$|\\.|,? and (?:it |they )?(?:has|have|gains?|loses?|gets?|is|are|becomes?|can't)\\b|, (?:has|have|gains?|loses?|gets?|is|are)\\b| until end of turn| as long as | for as long as )";

  // After a characteristic change, a clause that only changes what the permanent may do (613.11) is kept as a note.
  const ALSO = /^(?:can't|must|is goaded|are goaded|is suspected|attacks? each|blocks? each|doesn't untap|don't untap|can (?:attack|block)|may (?:attack|block)|is unblockable|assigns?|deals? )/;

  function parsePredicates(str) {
    let s = str; const parts = []; let first = true, m;
    while (s && !/^\.?$/.test(s)) {
      if (!first) {
        m = s.match(/^(?:, and |, | and )(?:it |they |each |also )?/);
        if (!m) return { parts, rest: s };
        s = s.slice(m[0].length);
      }
      first = false;
      if (parts.length && (m = s.match(ALSO))) { parts.also = (parts.also ? parts.also + " " : "") + s.replace(/\.$/, ""); s = ""; break; }
      if ((m = s.match(/^gets? ([+-](?:\d+|X))\/([+-](?:\d+|X))/))) {
        s = s.slice(m[0].length);
        const sign = (v) => (/X/.test(v) ? { x: true, neg: v[0] === "-" } : +v);
        let p = sign(m[1]), t = sign(m[2]), k;
        if ((k = s.match(new RegExp("^ for each (.+?)" + NEXT_PRED)))) {
          const c = countable(k[1]) || { unknown: k[1] };
          const mul = (base) => (base === 0 ? 0 : Object.assign({}, c, { mult: base }));
          if (typeof p !== "number" || typeof t !== "number") return null;
          p = mul(p); t = mul(t); s = s.slice(k[0].length);
        } else if ((k = s.match(/^,? where X is (.+?)(?=$|\.$)/))) {
          const v = parseValue(k[1]);
          const use = (o) => (typeof o === "number" ? o : typeof v === "number" ? (o.neg ? -v : v) : Object.assign({}, v, o.neg ? { mult: -1 } : {}));
          p = use(p); t = use(t); s = s.slice(k[0].length);
        }
        parts.push({ layer: "7c", p, t });
      } else if ((m = s.match(/^(?:has|have) base power and toughness (\d+|X)\/(\d+|X)/))) {
        parts.push({ layer: "7b", p: parseValue(m[1]), t: parseValue(m[2]) }); s = s.slice(m[0].length);
      } else if ((m = s.match(new RegExp("^(?:has|have) base power and (?:base )?toughness each equal to (.+?)" + NEXT_PRED)))) {
        const v = parseValue(m[1]); parts.push({ layer: "7b", p: v, t: v }); s = s.slice(m[0].length);
      } else if ((m = s.match(/^(?:has|have) base (power|toughness) (\d+)/))) {
        parts.push(m[1] === "power" ? { layer: "7b", p: +m[2] } : { layer: "7b", t: +m[2] }); s = s.slice(m[0].length);
      } else if ((m = s.match(/^loses? all (other )?((?:abilities|card types|creature types|land types|colors|names)(?:(?:, and |, | and )(?:all )?(?:other )?(?:abilities|card types|creature types|land types|colors|names))*)/))) {
        const what = m[2];
        if (/abilities/.test(what)) parts.push(m[1] ? { layer: "6", removeAllOther: true } : { layer: "6", removeAll: true });
        const tp = { layer: "4" };
        if (/card types/.test(what)) tp.onlyGivenCard = true;
        if (/creature types/.test(what)) tp.onlyGivenCreature = true;
        if (/land types/.test(what)) tp.loseLandTypes = true;
        if (Object.keys(tp).length > 1) parts.push(tp);
        if (/colors/.test(what)) parts.push({ layer: "5", onlyGivenColors: true });
        s = s.slice(m[0].length);
      } else if ((m = s.match(/^(?:gains?|has|have) all creature types/))) {
        parts.push({ layer: "4", allCreatureTypes: true }); s = s.slice(m[0].length);
      } else if ((m = s.match(/^loses? /))) {
        const al = parseAbilityList(s.slice(m[0].length));
        if (!al || al.items.some((i) => i.quoted)) return null;
        parts.push({ layer: "6", remove: al.items.map((i) => i.kw) }); s = al.rest;
      } else if ((m = s.match(/^(?:has|have|gains?) /))) {
        const al = parseAbilityList(s.slice(m[0].length));
        if (!al) return null;
        parts.push({ layer: "6", add: al.items }); s = al.rest;
      } else if ((m = s.match(/^can't have or gain /))) {
        const al = parseAbilityList(s.slice(m[0].length));
        if (!al) return null;
        parts.push({ layer: "6", cant: al.items.map((i) => i.kw) }); s = al.rest;
      } else if ((m = s.match(/^(?:isn't|aren't) (?:an? )?(creature|artifact|land|enchantment)s?/))) {
        parts.push({ layer: "4", removeCard: [cardType(m[1])] }); s = s.slice(m[0].length);
      } else if ((m = s.match(/^(is|are|becomes?) /))) {
        const ch = parseCharacteristic(s.slice(m[0].length), m[1]);
        if (!ch) return null;
        parts.push(...ch.parts); s = ch.rest;
      } else return null;
    }
    return { parts, rest: s, also: parts.also };
  }

  // Looks like a continuous effect that changes characteristics or control (the coverage denominator).
  const LOOKS = new RegExp([
    "\\bgets? [+-](?:\\d+|X)\\/[+-](?:\\d+|X)",
    "(?<!didn't |doesn't |don't |not )\\b(?:has|have|gains?) (?:\"|base power|base toughness|all creature types|(?:" + "flying|first strike|double strike|deathtouch|defender|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|ward|protection|shroud|fear|intimidate|shadow|horsemanship|flanking|skulk|wither|infect|persist|undying|changeling|prowess|banding|phasing|exalted|toxic|annihilator|\\w+walk" + ")\\b)",
    "\\bloses? (?:all (?:other )?(?:abilities|card types|creature types)|flying|defender|hexproof|indestructible|reach|trample|first strike|haste|vigilance)",
    "\\bbecomes? (?:an? )?(?:\\d+\\/\\d+|X\\/X|white|blue|black|red|green|colorless|artifact|creature|land|enchantment|[A-Z][a-z]+ (?:artifact |land |enchantment )?creature|the colou?r|every|a copy|the chosen)",
    "\\b(?:is|are) (?:an? )?[^.\"]*in addition to (?:its|their) other",
    "\\b(?:is|are) (?:every creature type|every basic land type|the chosen (?:creature )?type|the chosen colou?r|all colors)",
    "^(?:[A-Z][a-z]+ )?(?:[Ll]ands?|[A-Z][a-z]+s)(?: you control)? are (?:[A-Z][a-z]+s|white|blue|black|red|green|colorless)\\b",
    "\\b(?:[Ee]nchanted|[Ee]quipped) (?:creature|permanent|land|artifact) is (?:an? )?(?!attacking|blocking|tapped|untapped|dealt|put|destroyed|exiled|sacrificed|returned|goaded|monstrous|suspected|enchanted|equipped|legendary\\b|blocked)[a-zA-Z]",
    "[Ss]witch [^.]*power and toughness",
    "\\b[Gg]ains? control of\\b|^You control enchanted",
    "power and toughness are each equal to|'s power is equal to|'s toughness is equal to",
    "\\bcan't have or gain\\b",
    "\\b[Cc]hange the text of\\b",
    "\\bspells, and permanents are\\b",
    "\\b(?:isn't|aren't) (?:an? )?creatures?\\b",
  ].join("|"));
  const COPYISH = /\b(?:enters?|become|becomes) (?:tapped )?(?:as )?a copy of\b/i;

  // One sentence -> {templates} | {unmodeled: why} | null (not a continuous effect).
  function parseSentence(sentence, ctx) {
    let s = sentence.trim().replace(/\.$/, "");
    const looks = LOOKS.test(s);
    const tpl = { who: null, parts: [], cond: null, duration: ctx.kind === "static" ? "static" : "indefinite", text: sentence.trim() };
    let m;
    s = s.replace(/^[A-Z][A-Za-z' ]{2,24} — /, "");
    if (/^• /.test(s)) s = s.slice(2);
    if (ctx.kind === "static") s = s.replace(/\b([Ii])t's (?=an? )/, "$1t is ");
    if (/^(?:You|Players|Each player|Your opponents|Each opponent) (?:has|have|gains?|can't)\b/.test(s) && !/\bgains? control of\b/.test(s)) return null;   // affects players, not permanents (613.10)
    if (ctx.kind !== "static") {
      const lead = s.match(/^(?:If you do|When you do|Then|Also|In addition), /i);
      if (lead) { tpl.ifText = lead[0].replace(/, $/, ""); s = s.slice(lead[0].length); }
      s = s.replace(/^you may have (?=(?:up to |another )?(?:target|~|it|that|each|all|creatures))/i, "");
      s = s.replace(/^(.*?gets? [+-](?:\d+|X)\/[+-](?:\d+|X)) until end of turn (for each .+)$/, "$1 $2 until end of turn");
      s = s.replace(/^Untap (target [^.]+?) and gain control of it\b/i, "Gain control of $1");
      if (/ until end of turn(?=,? and |, )/.test(s)) { s = s.replace(/ until end of turn(?=,? and |, )/g, ""); tpl.duration = "eot"; }
    }
    for (let again = true; again;) {
      again = false;
      if ((m = s.match(/^Until end of turn, /i))) { tpl.duration = "eot"; s = s.slice(m[0].length); again = true; }
      else if ((m = s.match(/^As long as ([^,]+), /i))) { tpl.cond = parseCond(m[1]); s = s.slice(m[0].length); again = true; }
      else if ((m = s.match(/^During your turn, /i))) { tpl.cond = { unknown: "it's your turn" }; s = s.slice(m[0].length); again = true; }
      else if ((m = s.match(/^During turns other than yours, /i))) { tpl.cond = { unknown: "it's not your turn" }; s = s.slice(m[0].length); again = true; }
    }
    const tail = () => {
      for (let again = true; again;) {
        again = false;
        if ((m = s.match(/ until end of turn$/i))) { tpl.duration = "eot"; s = s.slice(0, m.index); again = true; }
        else if ((m = s.match(/ until (?:your next turn|the end of your next turn|end of combat|the beginning of your next (?:upkeep|end step))$/i))) { tpl.duration = "eot"; tpl.until = m[0].trim(); s = s.slice(0, m.index); again = true; }
        else if ((m = s.match(/ this turn$/i)) && ctx.kind !== "static") { tpl.duration = "eot"; s = s.slice(0, m.index); again = true; }
        else if ((m = s.match(/ for as long as (.+)$/i))) { tpl.duration = "while"; tpl.whileText = m[1]; s = s.slice(0, m.index); again = true; }
        else if ((m = s.match(/,? as long as ((?:(?!, ).)+)$/i))) { tpl.cond = parseCond(m[1]); s = s.slice(0, m.index); again = true; }
      }
    };
    tail();
    if (/^[a-z]/.test(s)) s = s[0].toUpperCase() + s.slice(1);
    const fail = (why) => (looks ? { unmodeled: why || "wording not recognized" } : null);
    const ok = () => {
      if (!tpl.parts.length) return fail();
      if (tpl.parts.also) tpl.also = tpl.parts.also;
      tpl.parts = tidy(tpl.parts);
      if (tpl.who.kind === "that" && ctx.kind === "static") {
        const ct = tpl.cond ? tpl.cond.text || tpl.cond.unknown || "" : "";
        if (tpl.who.plural) return fail("which permanents \"they\" are");
        if (tpl.cond && (tpl.cond.on === "attached" || /\b(?:enchanted|equipped|fortified) (?:creature|permanent|land|artifact)\b/i.test(ct))) tpl.who = { kind: "attached" };
        else if (tpl.cond && (tpl.cond.on === "self" || /~/.test(ct))) tpl.who = { kind: "self" };
        else return fail("which permanent \"it\" is");
      }
      if (ctx.kind === "static" && tpl.who.kind === "self" && !tpl.cond && !ctx.granted &&
        tpl.parts.every((p) => p.cdaPT || (p.layer === "5" && p.setColors && !p.setColors.includes("*chosen")) || (p.layer === "4" && p.allCreatureTypes && Object.keys(p).length === 2)))
        tpl.cda = true;   // 604.3a
      return { templates: [tpl] };
    };

    if ((m = s.match(/^You control enchanted (\w+)$/i))) { tpl.who = { kind: "attached" }; tpl.parts.push({ layer: "2", control: true }); return ok(); }
    if ((m = s.match(/^(?:You )?[Gg]ains? control of (.+)$/))) {
      const who = parseSubject(m[1]);
      if (!who || who.kind === "group") return fail("which permanents change control");
      tpl.who = who; tpl.parts.push({ layer: "2", control: true }); return ok();
    }
    if ((m = s.match(/^(?:Target opponent|Target player|That player|That opponent|An opponent|The player to your (?:left|right)|Defending player) gains control of (.+)$/i))) {
      const who = parseSubject(m[1]);
      if (!who || who.kind === "group") return fail("which permanents change control");
      tpl.who = who; tpl.parts.push({ layer: "2", control: "other" }); return ok();
    }
    if ((m = s.match(/^You get an emblem with "([^"]+)"$/i))) {
      const r = parseAbilityText(m[1], { kind: "static", granted: true });
      if (!r.templates.length || r.unmodeled.length) return looks ? { unmodeled: "the emblem's wording" } : null;
      for (const t of r.templates) { t.emblem = true; t.duration = "emblem"; }
      return { templates: r.templates };
    }
    if ((m = s.match(/^Switch (.+?)'s power and toughness$/i))) {
      const who = parseSubject(m[1]);
      if (!who) return fail();
      tpl.who = who; tpl.parts.push({ layer: "7d", switch: true }); return ok();
    }
    if ((m = s.match(/^~'s power and toughness are each equal to (.+)$/i))) {
      const v = parseValue(m[1]); tpl.who = { kind: "self" };
      tpl.parts.push({ layer: ctx.kind === "static" && !ctx.granted ? "7a" : "7b", p: v, t: v, cdaPT: true }); return ok();
    }
    if ((m = s.match(/^~'s power is equal to (.+?) and its toughness is equal to (.+)$/i))) {
      const p = parseValue(m[1]); let t;
      const k = m[2].match(/^that number(?: plus (\d+))?$/i);
      if (k) t = typeof p === "number" ? p + +(k[1] || 0) : Object.assign({}, p, { plus: (p.plus || 0) + +(k[1] || 0) }); else t = parseValue(m[2]);
      tpl.who = { kind: "self" }; tpl.parts.push({ layer: "7a", p, t, cdaPT: true }); return ok();
    }
    if ((m = s.match(/^~'s (power|toughness) is equal to (.+)$/i))) {
      const v = parseValue(m[2]); tpl.who = { kind: "self" };
      tpl.parts.push(Object.assign({ layer: "7a", cdaPT: true }, m[1].toLowerCase() === "power" ? { p: v } : { t: v })); return ok();
    }
    if ((m = s.match(/^All cards that aren't on the battlefield, spells, and permanents are (.+)$/i))) {
      const ch = parseCharacteristic(m[1], "are");
      if (!ch || ch.rest) return { unmodeled: "the effect's wording" };
      tpl.who = { kind: "group" }; tpl.parts = ch.parts; return ok();
    }
    if (/^(?:Devoid)$/i.test(s)) return null;

    // subject + predicates: try each verb position until the words before it read as a subject
    const verb = /\b(gets?|has|have|gains?|loses?|is|are|becomes?|isn't|aren't|can't have)\b/g;
    let v, tried = false;
    while ((v = verb.exec(s))) {
      if (v.index === 0) continue;
      const subj = s.slice(0, v.index).trim();
      if (subj.split(" ").length > 12) break;
      const who = parseSubject(subj);
      if (!who) continue;
      tried = true;
      const pr = parsePredicates(s.slice(v.index));
      if (!pr || !pr.parts.length) continue;
      if (pr.rest && !/^\.?$/.test(pr.rest)) continue;
      tpl.who = who; tpl.parts = pr.parts; if (pr.also) tpl.parts.also = pr.also;
      if (who.kind === "target" && who.filter && hasUnknown(who.filter)) { /* a target is chosen by the user, so a state word doesn't block it */ }
      return ok();
    }
    return fail(tried ? "the effect's wording" : "who it applies to");
  }

  function tidy(parts) {
    const flag = (k) => parts.some((p) => p[k]);
    const type = parts.find((p) => p.layer === "4" && (p.addCard || p.setCard));
    if (flag("onlyGivenCard") && type && type.addCard) { type.setCard = type.addCard; delete type.addCard; }
    const six = parts.filter((p) => p.layer === "6");
    if (six.some((p) => p.removeAllOther)) {
      const merged = { layer: "6", removeAll: true, add: [].concat(...six.map((p) => p.add || [])) };
      const i = parts.indexOf(six[0]);
      parts = parts.filter((p) => p.layer !== "6");
      parts.splice(Math.min(i, parts.length), 0, merged);
    }
    return parts.filter((p) => Object.keys(p).some((k) => !["layer", "onlyGivenCard", "onlyGivenCreature", "onlyGivenColors"].includes(k)));
  }

  function parseCond(text) {
    const s = text.trim();
    let m;
    if ((m = s.match(/^(enchanted (?:permanent|creature|artifact|land)|equipped creature|it|~)(?:'s| is) (?:an? )?([A-Za-z-]+)$/i))) {
      const w = m[2], ct = cardType(w.toLowerCase()), f = FORMS.get(w.toLowerCase()), col = COLOR[w.toLowerCase()];
      const on = /^(?:enchanted|equipped)/i.test(m[1]) ? "attached" : m[1] === "~" ? "self" : "subject";
      if (ct && w === w.toLowerCase()) return { is: { types: [ct] }, on, text: s };
      if (f && /^[A-Z]/.test(w)) return { is: { subtypes: [f[0]] }, on, text: s };
      if (col) return { is: { colors: [col] }, on, text: s };
    }
    if ((m = s.match(/^you control (an?|another|two or more|three or more|four or more|five or more|\d+ or more) (.+)$/i))) {
      const g = parseGroup(m[2]);
      const n = { a: 1, an: 1, another: 1, "two or more": 2, "three or more": 3, "four or more": 4, "five or more": 5 }[m[1].toLowerCase()] || parseInt(m[1], 10);
      if (g && !hasUnknown(g)) { g.control = "you"; if (/another/i.test(m[1])) g.other = true; return { count: g, min: n, text: s }; }
    }
    if ((m = s.match(/^your devotion to (white|blue|black|red|green)(?: and (white|blue|black|red|green))? is less than (\w+)$/i))) {
      const n = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }[m[3].toLowerCase()] || parseInt(m[3], 10);
      if (n) return { devotion: { colors: [COLOR[m[1].toLowerCase()]].concat(m[2] ? [COLOR[m[2].toLowerCase()]] : []), lt: n }, text: s };
    }
    if ((m = s.match(/^~ is (enchanted|equipped)$/i))) return { attachedBy: m[1].toLowerCase() === "enchanted" ? "Aura" : "Equipment", text: s };
    return { unknown: s };
  }

  // ---------- whole cards ----------
  function normalize(card) {
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let t = (card.o || "").replace(/\s*\([^()]*\)/g, "");
    t = t.replace(new RegExp(esc(card.n), "g"), "~");
    const short = card.n.split(",")[0];
    if (short.length > 3 && short !== card.n) t = t.replace(new RegExp("\\b" + esc(short) + "\\b", "g"), "~");
    t = t.replace(/\b[Tt]his (?:creature|enchantment|artifact|land|permanent|Aura|Equipment|Vehicle|planeswalker|Saga|Fortification|Spacecraft|token|battle|Class|Case|Room|Siege)\b/g, "~");
    t = t.replace(/( until end of turn)?\.(")? (?:It's|They're) still (an? )?(\w+)\./g, (all, u, q, a, w) => (q ? '."' : "") + " that's still " + (a || "") + w + (u || "") + ".");
    return t;
  }

  function keywordItems(line) {
    if (/\.$/.test(line) && !/—/.test(line)) return null;
    if (line.length > 90) return null;
    const items = line.replace(/\.$/, "").split(/, |; /);
    const out = [];
    for (const it of items) {
      const m = KW_RE.exec(it.trim());
      if (!m) return null;
      const rest = it.trim().slice(m[0].length);
      if (rest && !/^(?: \d+| X| \{|—| from | with | [A-Z]|\s*$)/.test(rest)) return null;
      out.push({ text: it.trim(), kw: /walk$/i.test(m[0]) ? "landwalk" : m[0].toLowerCase() });
    }
    return out;
  }

  // Parse one ability's text. ctx.kind: static | resolved; ctx.granted: the ability was given by another effect.
  function parseAbilityText(text, ctx) {
    const templates = [], unmodeled = [];
    let madeToken = false, mode = 0;
    for (const s of splitSentences(text)) {
      if (/^• /.test(s)) mode++;
      // "Create a token. It has ..." describes the new token, not something already on the battlefield
      if (madeToken && /^(?:It|They|That token|Those tokens|The token|Each of those tokens)\b/.test(s) && !/\btarget\b/.test(s)) continue;
      madeToken = /\b[Cc]reates?\b[^.]*\btokens?\b/.test(s) || (madeToken && /^(?:It|They)\b/.test(s));
      const masked = ctx.kind !== "static" && /\b[Cc]reates?\b/.test(s) ? s.replace(/"[^"]*"/g, '""') : s;
      if (COPYISH.test(masked)) { if (!ctx.copyHandled) unmodeled.push({ text: s, why: "copy effect outside \"enters as a copy\"" }); continue; }
      if (/\b[Cc]reates?\b[^.]*\btokens?\b/.test(masked) && !/\b(?:gets?|gains?) [+-]?\w*\/?/.test(masked.replace(/\b[Cc]reates?\b[^.]*?\btokens?\b[^.]*?(?:\.|$)/, ""))) continue;
      const r = parseSentence(masked, ctx);
      if (!r) continue;
      if (r.unmodeled) unmodeled.push({ text: s, why: r.unmodeled });
      else { if (mode) for (const x of r.templates) x.mode = mode; templates.push(...r.templates); }
    }
    // "It gains haste until end of turn." after a target sentence refers to the same object
    let last = null;
    const named = () => {
      const m = text.match(/((?:up to one )?(?:another )?target [A-Za-z ,'-]+?)(?=\.|,| and | until | gets?\b| gains?\b| becomes?\b|'s\b)/);
      const who = m && parseSubject(m[1]);
      return who && who.kind === "target" ? who : null;
    };
    const keep = [];
    for (const t of templates) {
      if (t.who.kind === "that") {
        const who = (last && (!t.mode || last.mode === t.mode) ? last.who : null) || (t.mode ? null : named());
        if (!who && (ctx.selfIt || /~/.test(text.slice(0, Math.max(0, text.indexOf(t.text))))) && !t.who.plural) { t.who = { kind: "self" }; keep.push(t); continue; }
        if (!who && t.who.plural) {   // "Put a counter on each creature you control. Those creatures gain ..."
          const g = text.slice(0, Math.max(0, text.indexOf(t.text))).match(/\b(?:each|all) ((?:other )?[A-Za-z ]+?)(?=\.|,| and )/);
          const grp = g && parseGroup(g[1]);
          if (grp && !hasUnknown(grp)) { t.who = grp; keep.push(t); continue; }
        }
        // otherwise "it" is whatever the ability is talking about (the attacker, the returned card): the user points at it
        t.who = who ? JSON.parse(JSON.stringify(who)) : { kind: "target", filter: null, pronoun: true, count: t.who.plural ? 9 : 1 };
      } else last = { who: t.who, mode: t.mode };
      keep.push(t);
    }
    return { templates: keep, unmodeled };
  }

  const cache = new Map();
  function parseCard(card) {
    if (cache.has(card.n)) return cache.get(card.n);
    const text = normalize(card);
    const isSpell = /\b(?:Instant|Sorcery)\b/.test(card.t) ;
    const out = { name: card.n, abilities: [], enchant: null, copy: null, choices: [], spell: isSpell };
    let modes = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const ab = { text: line, kind: "static", templates: [], unmodeled: [] };
      let m;
      const prev = out.abilities[out.abilities.length - 1];
      if (/^• /.test(line) && prev && prev.kind !== "keyword" && prev.kind !== "enchant") {   // one mode of the ability above
        modes++;
        const r = parseAbilityText(line.slice(2), { kind: "resolved", selfIt: /~/.test(line) });
        for (const t of r.templates) t.mode = modes;
        prev.templates.push(...r.templates); prev.unmodeled.push(...r.unmodeled); prev.text += "\n" + line; prev.modal = true;
        if (prev.kind === "static") prev.kind = isSpell ? "spell" : "triggered";
        continue;
      }
      modes = 0;
      if ((m = line.match(/^Enchant (.+)$/)) && !/\.$/.test(line)) {
        ab.kind = "enchant"; ab.kw = "enchant";
        out.enchant = /\b(?:player|opponent)\b/.test(m[1]) ? { player: true } : parseGroup(m[1]) || { unknownText: m[1] };
        out.abilities.push(ab); continue;
      }
      const kws = keywordItems(line);
      if (kws) {
        for (const k of kws) {
          const a = { text: k.text, kind: "keyword", kw: k.kw, templates: [], unmodeled: [] };
          if (k.kw === "changeling") a.templates.push({ who: { kind: "self" }, parts: [{ layer: "4", allCreatureTypes: true }], cda: true, duration: "static", text: "Changeling", cond: null });
          if (k.kw === "devoid") a.templates.push({ who: { kind: "self" }, parts: [{ layer: "5", setColors: [] }], cda: true, duration: "static", text: "Devoid", cond: null });
          out.abilities.push(a);
        }
        continue;
      }
      if ((m = line.match(/^As ~ enters, (?:you may )?choose (an? [^.]+?)\.(.*)$/i))) {
        ab.kind = "choice";
        if (/creature type/i.test(m[1])) out.choices.push("type"); else if (/\bcolou?r\b/i.test(m[1])) out.choices.push("color"); else out.choices.push(m[1]);
        out.abilities.push(ab); continue;
      }
      if (/^(?:You may have )?~ enters? as a copy of /i.test(line.replace(/^As ~ enters, you may have it become/i, "~ enters as"))) {
        ab.kind = "copy"; out.copy = parseCopy(line); out.abilities.push(ab); continue;
      }
      if (/^(?:[A-Z][A-Za-z' ]+ — )?(?:When|Whenever|At the beginning of|At end of)\b/.test(line)) {
        ab.kind = "triggered";
        const i = line.indexOf(", ");
        const r = parseAbilityText(i > 0 ? line.slice(i + 2) : "", { kind: "resolved", selfIt: /^(?:[A-Z][A-Za-z' ]+ — )?(?:When|Whenever) ~ /.test(line) });
        ab.templates = r.templates; ab.unmodeled = r.unmodeled;
      } else if (/^[^:"]{1,160}: /.test(line)) {
        ab.kind = "activated";
        const i = line.indexOf(": ");
        ab.cost = line.slice(0, i);
        const r = parseAbilityText(line.slice(i + 2), { kind: "resolved" });
        ab.templates = r.templates; ab.unmodeled = r.unmodeled;
      } else if (!isSpell && /\buntil end of turn\b|\bWhen you do, /.test(line) && !/^As long as|^During /.test(line)) {
        ab.kind = "triggered";   // "You may exert ~ as it attacks. When you do, it gets ...": a one-shot effect, not always on
        const r = parseAbilityText(line, { kind: "resolved", selfIt: true });
        ab.templates = r.templates; ab.unmodeled = r.unmodeled;
      } else {
        ab.kind = isSpell ? "spell" : "static";
        const r = parseAbilityText(line, { kind: isSpell ? "resolved" : "static" });
        ab.templates = r.templates; ab.unmodeled = r.unmodeled;
      }
      out.abilities.push(ab);
    }
    for (const k of card.k || []) if (k === "crew" && /Vehicle/.test(card.t)) out.crew = true;
    cache.set(card.n, out);
    return out;
  }

  // "You may have ~ enter as a copy of any creature on the battlefield, except ..." (707.9)
  function parseCopy(line) {
    const m = line.match(/enters? as a copy of (?:any |an? |another )?(.+?)(?: on the battlefield)?(?:, except (.+?))?\.?$/i);
    const copy = { of: null, except: [], notes: [], text: line };
    if (!m) { copy.notes.push("copy wording not recognized"); return copy; }
    copy.of = parseGroup(m[1].replace(/ on the battlefield$/i, "")) || { unknownText: m[1] };
    if (m[2]) {
      let ex = m[2];
      // split the exceptions; quoted abilities stay whole
      const pieces = []; let cur = "", q = false;
      for (let i = 0; i < ex.length; i++) {
        if (ex[i] === '"') q = !q;
        if (!q && /^(?:, and | and |, )(?:it|its)\b/.test(ex.slice(i))) { pieces.push(cur); cur = ""; i += ex.slice(i).match(/^(?:, and | and |, )/)[0].length - 1; continue; }
        cur += ex[i];
      }
      pieces.push(cur);
      for (let p of pieces) {
        p = p.trim(); let k;
        if ((k = p.match(/^it's (\d+)\/(\d+)$/i))) copy.except.push({ setPT: [+k[1], +k[2]] });
        else if (/^it doesn't copy that (?:creature|permanent)'s colou?r$/i.test(p)) copy.except.push({ keepColor: true });
        else if ((k = p.match(/^it has (.+)$/i))) {
          if (/^this ability$/i.test(k[1])) copy.except.push({ keepAbility: true });
          else { const al = parseAbilityList(k[1]); if (al && !al.rest) copy.except.push({ add: al.items }); else copy.notes.push("exception not modeled: " + p); }
        } else if ((k = p.match(/^it(?:'s| is) (.+)$/i))) {
          const ch = parseCharacteristic(k[1], "is");
          if (ch && !ch.rest) copy.except.push({ parts: ch.parts });
          else if (/^(?:n't|not) legendary$/i.test(k[1]) || /^it isn't legendary$/i.test(p)) copy.except.push({ notLegendary: true });
          else copy.notes.push("exception not modeled: " + p);
        } else if (/^it isn't legendary$/i.test(p)) copy.except.push({ notLegendary: true });
        else if (/^it enters with /i.test(p)) copy.notes.push("\"" + p + "\" adds counters as it enters; it is not part of what gets copied (707.9e)");
        else copy.notes.push("exception not modeled: " + p);
      }
    }
    return copy;
  }

  // Coverage of one card: every sentence that looks like a continuous effect, parsed or not.
  function coverage(card) {
    const p = parseCard(card);
    const out = { parsed: 0, conditional: 0, unmodeled: [], kinds: {}, static: [0, 0] };
    for (const ab of p.abilities) {
      for (const t of ab.templates) {
        const cond = (t.cond && t.cond.unknown) || (t.who.kind === "group" && hasUnknown(t.who)) || t.parts.some((x) => [x.p, x.t].some((v) => v && typeof v === "object" && (v.unknown || v.x)));
        if (cond) out.conditional++; else out.parsed++;
        if (ab.kind === "static" || ab.kind === "keyword") out.static[0]++;
        out.kinds[ab.kind] = (out.kinds[ab.kind] || 0) + 1;
      }
      for (const u of ab.unmodeled) { out.unmodeled.push({ kind: ab.kind, text: u.text, why: u.why }); if (ab.kind === "static") out.static[1]++; }
    }
    if (p.copy) { if (p.copy.of && !p.copy.notes.some((n) => /not (?:modeled|recognized)/.test(n))) out.parsed++; else out.unmodeled.push({ kind: "copy", text: p.copy.text, why: p.copy.notes.join("; ") }); }
    return out;
  }

  const api = { init, parseCard, parseAbilityText, parseSentence, parseSubject, parseGroup, parseValue, coverage, manaValue, costColors, subCategory, hasUnknown,
    BASIC_LAND, CARD_TYPES, SUPERTYPES, get SUB() { return SUB; }, clearCache: () => cache.clear() };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MTGEffects = api;
})(typeof self !== "undefined" ? self : this);
