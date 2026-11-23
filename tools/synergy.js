#!/usr/bin/env node
/* Synergy finder on the command line (docs/synergy.js), for the rules judge.

   node tools/synergy.js "Card A" ["Card B" ...] [--colors WUBRG] [--limit 20]
       cards that are not listed but work with these: known combos first, then possible loops and links.
       One card finds that card's partners (two-card combos it finishes, the rest of its longer combos, then links)
   node tools/synergy.js --measure [--sample 400] [--seed 1]
       hide one card of known three-card combos and see how often the text-reading path alone
       (no combo list) ranks it in its top 10                                                        */
"use strict";
const path = require("path");
const root = path.join(__dirname, "..");
const S = require(path.join(root, "docs/synergy.js")), C = require(path.join(root, "docs/combos.js")), FX = require(path.join(root, "docs/effects.js"));
const cards = require(path.join(root, "docs/data/cards.json")), cr = require(path.join(root, "docs/data/cr.json"));
FX.init(cr);
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const by = new Map(cards.map((c) => [norm(c.n), c]));
const lookup = (n) => by.get(norm(n));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v == null ? "" : v; };
const has = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };

const measure = has("--measure"), sample = +(flag("--sample") || 400), seed = +(flag("--seed") || 1), colors = flag("--colors"), limit = +(flag("--limit") || 20);
const ix = S.index(cards); ix.step();
const data = require(path.join(root, "docs/data/combos.json"));
const cx = C.index(data, lookup);

if (measure) {
  // three named cards, nothing else needed, all in the card data
  const pool = [];
  data.combos.forEach((c, i) => { const d = C.describe(cx, i); if (d.cards.length === 3 && d.known && !d.needs.length && d.tag !== "B" && new Set(d.cards).size === 3) pool.push(d); });
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const picks = [];
  const used = new Set();
  while (picks.length < Math.min(sample, pool.length)) { const k = Math.floor(rnd() * pool.length); if (!used.has(k)) { used.add(k); picks.push(pool[k]); } }
  let top10 = 0, top30 = 0, found = 0, n = 0;
  for (const d of picks) {
    const three = d.cards.map(lookup);
    const hide = Math.floor(rnd() * 3), hidden = three[hide], shown = three.filter((_, j) => j !== hide);
    const identity = "WUBRG".split("").filter((ch) => three.some((c) => c.ci.includes(ch))).join("");
    const r = S.find(shown, ix, { identity, limit: 30 });
    const pos = r.items.findIndex((x) => x.n === hidden.n);
    if (r.linked && r.linked.has(hidden.n)) found++;
    n++; if (pos >= 0 && pos < 10) top10++; if (pos >= 0 && pos < 30) top30++;
  }
  const pct = (a) => (100 * a / n).toFixed(1) + "%";
  console.log("Known three-card combos with nothing else needed: " + pool.length + ". Sampled " + n + " (seed " + seed + "), one card hidden each.");
  console.log("Text-reading links alone (no combo list), within the three cards' colors:");
  console.log("  hidden card in the top 10: " + top10 + " of " + n + " (" + pct(top10) + ")");
  console.log("  hidden card in the top 30: " + top30 + " of " + n + " (" + pct(top30) + ")");
  console.log("  hidden card linked at all: " + found + " of " + n + " (" + pct(found) + ")");
  console.log("With the combo list on, a hidden card of a listed combo is always found: it is the first tier.");
  process.exit(0);
}

if (!args.length) { console.log("usage: node tools/synergy.js \"Card A\" [\"Card B\" ...] [--colors WUBRG] [--limit 20]   |   --measure"); process.exit(1); }
const chosen = [], missing = [];
for (const a of args) { const c = lookup(a); if (c) chosen.push(c); else missing.push(a); }
if (missing.length) { console.log("Not found in the card data (check the spelling; do not guess): " + missing.join(", ")); process.exit(1); }
const r = S.find(chosen, ix, { identity: colors == null ? undefined : colors.toUpperCase(), combos: { api: C, ix: cx }, cr, limit, lookup });
console.log("Cards that work with " + chosen.map((c) => c.n).join(" + ") + " (colors: " + (r.identity || "colorless") + "; " + r.total + " candidates, top " + r.items.length + ")");
console.log("Combos come from Commander Spellbook's list. Everything marked \"possible\" was found by reading card text: check the card.\n");
let last = "";
for (const it of r.items) {
  if (it.label !== last) { console.log(it.label.toUpperCase()); last = it.label; }
  console.log("  " + it.n + (it.card ? "  [" + it.card.t + "]" : ""));
  for (const w of it.why) console.log("      " + (w.heuristic ? "possible: " : "") + w.text + (w.combo ? "  combo " + w.combo.id + (w.combo.bracket ? " (" + w.combo.bracket[0] + ", bracket " + w.combo.bracket[1] + ")" : "") : "") + (w.cites && w.cites.length ? "  CR " + w.cites.join(", ") : ""));
  if (it.warn) console.log("      WARNING: " + it.warn.text);
}
