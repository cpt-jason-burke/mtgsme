#!/usr/bin/env node
/* Layer engine on the command line (docs/layers.js), for the rules judge.

   node tools/layers.js "Humility" "Opalescence"          cards in the order they arrived (timestamp order)
   node tools/layers.js "opp:Grizzly Bears" "Act of Treason"
   node tools/layers.js --coverage [--top 40]             how much card text the effect reader understands

   A card can carry options in brackets: "Grizzly Bears[opp, +1=2, -1=1]", "Conspiracy[type=Elf]",
   "Painter's Servant[color=W]", "Rancor[on=1]" (attach to card 1), "Giant Growth[on=2]" (target card 2),
   "Clone[copy=1]" or "Clone[copy=none]", "Grinning Demon[facedown]", "Tarmogoyf[value=4]" (a number the board can't see).
   --use N:K[:X]   card N's ability K has resolved (K is the number shown under "Abilities you can use"), with X if it has one
   --crew N        card N (a Vehicle) is crewed
   --assume all    treat conditions the board can't see ("as long as it's your turn") as true
   --order 2,1,3   try the same cards in another arrival order
   --json          print the raw result                                                                    */
"use strict";
const path = require("path");
const root = path.join(__dirname, "..");
const L = require(path.join(root, "docs/layers.js")), FX = require(path.join(root, "docs/effects.js"));
const cards = require(path.join(root, "docs/data/cards.json")), cr = require(path.join(root, "docs/data/cr.json"));
L.init(cr);
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const by = new Map(cards.map((c) => [norm(c.n), c]));
const lookup = (n) => by.get(norm(n));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v == null ? "" : v; };
const has = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };

if (has("--coverage")) { const kind = flag("--kind"); coverage(+(flag("--top") || 30), kind); process.exit(0); }

function coverage(top, onlyKind) {
  const tot = { cards: 0, withEffects: 0, fully: 0, parsed: 0, conditional: 0, unmodeled: 0, st: 0, stBad: 0 }, kinds = {}, shapes = new Map();
  const kwRe = /\b(?:flying|first strike|double strike|deathtouch|defender|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|shroud|fear|intimidate|shadow|flanking|wither|infect|persist|undying|prowess|protection from [a-z ]+?|ward \{[^}]+\})(?=[ ,.]|$)/gi;
  for (const c of cards) {
    tot.cards++;
    const cov = FX.coverage(c);
    const n = cov.parsed + cov.conditional + cov.unmodeled.length;
    if (!n) continue;
    tot.withEffects++; if (!cov.unmodeled.length) tot.fully++;
    tot.parsed += cov.parsed; tot.conditional += cov.conditional; tot.unmodeled += cov.unmodeled.length;
    tot.st += cov.static[0]; tot.stBad += cov.static[1];
    for (const u of cov.unmodeled) {
      kinds[u.kind] = (kinds[u.kind] || 0) + 1;
      if (onlyKind && u.kind !== onlyKind) continue;
      const shape = u.text.replace(/"[^"]*"/g, '"…"').replace(/[+-](?:\d+|X)\/[+-](?:\d+|X)/g, "+N/+N").replace(/\b\d+\/\d+\b/g, "N/N").replace(kwRe, "KW").replace(/\b(?:white|blue|black|red|green)\b/g, "COLOR")
        .replace(/\{[^}]+\}/g, "{}").replace(/\b\d+\b/g, "N").replace(/\b(?:two|three|four|five|six|seven)\b/g, "N").replace(/(?<=[a-z,] )[A-Z][a-z]+(?:s|es)?\b/g, "Type").slice(0, 110);
      const e = shapes.get(shape) || { n: 0, ex: c.n }; e.n++; shapes.set(shape, e);
    }
  }
  const all = tot.parsed + tot.conditional + tot.unmodeled;
  const pct = (a, b) => (100 * a / b).toFixed(1) + "%";
  console.log("Continuous effects found in " + tot.cards + " cards: " + all + " (on " + tot.withEffects + " cards)");
  console.log("  read exactly:                 " + tot.parsed + "  (" + pct(tot.parsed, all) + ")");
  console.log("  read, needs something the board can't see: " + tot.conditional + "  (" + pct(tot.conditional, all) + ")");
  console.log("  not modeled:                  " + tot.unmodeled + "  (" + pct(tot.unmodeled, all) + ")");
  console.log("Cards whose continuous effects are all read: " + tot.fully + " of " + tot.withEffects + "  (" + pct(tot.fully, tot.withEffects) + ")");
  console.log("Static abilities (always on while the card is on the battlefield): " + tot.st + " read, " + tot.stBad + " not modeled  (" + pct(tot.st, tot.st + tot.stBad) + " read)");
  console.log("Not modeled, by where the text is: " + Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + v).join(", "));
  console.log("\nMost common wordings not modeled:");
  for (const [shape, e] of [...shapes.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, top)) console.log(String(e.n).padStart(5) + "  " + shape + "   [" + e.ex + "]");
}

// ---- a board ----
const json = has("--json"), assumeAll = flag("--assume") === "all" ? true : false;
const uses = []; let u;
while ((u = flag("--use")) != null) uses.push(u);
const crews = []; while ((u = flag("--crew")) != null) crews.push(+u);
const order = flag("--order");
if (!args.length) { console.log("usage: node tools/layers.js \"Card A\" \"Card B\" ...   (see the top of this file for options)"); process.exit(1); }

let entries = [], values = {};
const missing = [];
args.forEach((a, i) => {
  let name = a, opt = "";
  const m = a.match(/^(.*?)\[(.*)\]$/);
  if (m) { name = m[1]; opt = m[2]; }
  const e = { id: "c" + (i + 1), controller: "you", counters: {} };
  if (/^opp:/i.test(name)) { e.controller = "opp"; name = name.slice(4); }
  e.card = lookup(name.trim());
  if (!e.card) { missing.push(name); return; }
  for (const o of opt.split(",").map((x) => x.trim()).filter(Boolean)) {
    let k;
    if (o === "opp") e.controller = "opp";
    else if (o === "facedown") e.faceDown = true;
    else if ((k = o.match(/^\+1=(\d+)$/))) e.counters["+1/+1"] = +k[1];
    else if ((k = o.match(/^-1=(\d+)$/))) e.counters["-1/-1"] = +k[1];
    else if ((k = o.match(/^type=(.+)$/))) e.chosen = Object.assign(e.chosen || {}, { type: k[1] });
    else if ((k = o.match(/^color=([WUBRG])$/i))) e.chosen = Object.assign(e.chosen || {}, { color: k[1].toUpperCase() });
    else if ((k = o.match(/^on=(\d+)$/))) { e.attach = "c" + k[1]; e.target = "c" + k[1]; }
    else if ((k = o.match(/^copy=(\d+|none)$/))) e.copy = k[1] === "none" ? "none" : "c" + k[1];
    else if ((k = o.match(/^x=(\d+)$/))) e.x = +k[1];
    else if ((k = o.match(/^value=(\d+)$/))) values[e.id] = +k[1];
    else { console.log("Unknown option \"" + o + "\" on " + name); process.exit(1); }
  }
  entries.push(e);
});
if (missing.length) { console.log("Not found in the card data (check the spelling; do not guess): " + missing.join(", ")); process.exit(1); }
if (order) entries = order.split(",").map((n) => entries.find((e) => e.id === "c" + n.trim())).filter(Boolean);
const usable = (e) => FX.parseCard(e.card).abilities.map((a, i) => ({ a, i })).filter((x) => (x.a.kind === "activated" || x.a.kind === "triggered") && x.a.templates.length);
uses.forEach((s, i) => { const [n, k, x] = s.split(":"); const src = entries.find((e) => e.id === "c" + n); const ab = src && usable(src)[+k - 1]; if (!ab) { console.log("No such ability: --use " + s); process.exit(1); } entries.push({ id: "u" + i, use: { of: src.id, ability: ab.i }, x: x == null ? undefined : +x }); });
crews.forEach((n, i) => entries.push({ id: "w" + i, use: { of: "c" + n, crew: true } }));

let built = L.buildState(entries, { lookup, values });
if (assumeAll) {
  const first = L.resolve(built.state, { lookup });
  const assume = {}; for (const c of first.conditions) assume[c.key] = true;
  built = L.buildState(entries, { lookup, values, assume });
}
const out = L.outcomes(built.state, { lookup });
if (json) { console.log(JSON.stringify({ notes: built.notes, outcomes: out.outcomes.map((g) => ({ current: g.current, orders: g.orders, when: g.when, permanents: g.result.permanents, sba: g.result.sba, log: g.result.log })) }, null, 1)); process.exit(0); }

const who = (c) => (c === "you" ? "you" : "opponent");
const colors = (f) => (f.colors.length ? f.colors.join("") : "colorless");
function showPerm(f, state) {
  const host = f.attachedTo != null ? state.permanents.find((p) => p.id === f.attachedTo) : null;
  const bits = [f.typeLine, colors(f)];
  if (f.pt) bits.push(f.pt + (f.unknownPT.length ? " (? = " + f.unknownPT.join("; ") + ")" : ""));
  let s = "  " + f.card + (f.name !== f.card ? " (as " + f.name + ")" : "") + " [" + who(f.controller) + "]: " + bits.join(", ");
  if (host) s += ", attached to " + (host.label || host.card.n);
  s += "\n      abilities: " + (f.abilities.length ? f.abilities.map((a) => a.text + (a.from ? " (from " + a.from + ")" : "")).join(" | ") : "none");
  if (f.lost.length) s += "\n      lost: " + f.lost.join(" | ");
  return s;
}
function showResult(res, state) {
  for (const f of res.permanents) console.log(showPerm(f, state));
  for (const a of res.sba) console.log("  State-based action" + (a.rule ? " (" + a.rule + ")" : "") + ": " + a.text);
  for (const w of res.warnings) console.log("  Note" + (w.rule ? " (" + w.rule + ")" : "") + ": " + w.text);
}

console.log("Arrival order (timestamps, rule 613.7): " + entries.map((e, i) => (i + 1) + ". " + (e.use ? (e.use.crew ? "crew " : "ability of ") + (entries.find((x) => x.id === e.use.of).card.n) : e.card.n + (e.controller === "opp" ? " [opponent]" : ""))).join("  "));
for (const n of built.notes) console.log("Note: " + n);
const cur = out.outcomes.find((g) => g.current) || out.outcomes[0];
console.log("\nResult:");
showResult(cur.result, built.state);
console.log("\nHow it was worked out (effects of a state-based action are not repeated):");
for (const e of cur.result.log) console.log("  " + (L.LAYER_NAME[e.layer] || "Layer " + e.layer) + (e.rule ? ", " + e.rule : "") + ": " + (e.note || e.source + (e.cda ? " (characteristic-defining, applies first)" : "") + ": " + e.affected.join(", ") + " " + e.what));
if (!cur.result.log.length) console.log("  No continuous effect here changes another card.");
if (out.outcomes.length > 1) {
  console.log("\nThe arrival order matters. Other results (" + out.tried + " orders tried" + (out.complete ? "" : ", not all") + "):");
  out.outcomes.filter((g) => g !== cur).forEach((g, i) => {
    console.log(" Other result " + (i + 1) + ", when " + (g.when.length ? g.when.map((w) => w[0] + " arrived before " + w[1]).join(" and ") : "the order is " + g.order.join(", ")) + ":");
    showResult(g.result, built.state);
  });
  if (cur.when && cur.when.length) console.log(" (The result at the top needs: " + cur.when.map((w) => w[0] + " before " + w[1]).join(" and ") + ".)");
} else if (out.tried > 1) console.log("\nArrival order does not matter here (" + out.tried + " orders tried, same result).");
const r = cur.result;
if (r.needs.length) console.log("\nNeeds a choice: " + r.needs.map((n) => n.card + " (" + n.choice + ")").join(", ") + ". Add it in brackets, for example \"Conspiracy[type=Elf]\".");
if (r.conditions.length) console.log("\nConditions the board can't see (treated as " + (assumeAll ? "TRUE" : "false; --assume all turns them on") + "):\n" + r.conditions.map((c) => "  " + c.card + ": " + c.text).join("\n"));
if (r.unmodeled.length) console.log("\nNOT MODELED (read the card; the result above ignores these):\n" + r.unmodeled.map((x) => "  " + x.card + ": " + x.text + "  [" + x.why + "]").join("\n"));
const offers = entries.filter((e) => e.card && !e.use).map((e) => [e, usable(e)]).filter((x) => x[1].length);
if (offers.length) {
  console.log("\nAbilities you can use (--use card:number[:X]):");
  for (const [e, list] of offers) list.forEach((x, k) => console.log("  " + e.id.slice(1) + ":" + (k + 1) + "  " + e.card.n + ": " + x.a.text.slice(0, 150)));
}
const spellsOff = entries.filter((e) => e.card && !e.use).flatMap((e) => FX.parseCard(e.card).abilities.filter((a) => (a.kind === "activated" || a.kind === "triggered" || a.kind === "spell") && a.unmodeled.length).map((a) => e.card.n + ": " + a.unmodeled.map((x) => x.text).join(" ")));
if (spellsOff.length) console.log("\nAbilities with continuous effects that are not modeled:\n" + spellsOff.map((x) => "  " + x).join("\n"));
console.log("\nThis covers continuous effects (rule 613) and the state-based actions that follow. Triggers, replacement effects and combat are not simulated; check every step against the card text and rulings.");
