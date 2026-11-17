#!/usr/bin/env node
/* Known Commander combos for the rules judge, from the same data and code the web app uses.
 *
 * usage: node tools/combos.js deck <decklist.txt> [--steps] [--limit N]
 *        node tools/combos.js with "Card A" ["Card B" ...] [--steps] [--limit N]
 * deck  lists the combos a deck already holds, and the cards that would each finish one.
 * with  lists the known combos that use every card named.
 * --steps adds each combo's full entry (start, prerequisites, steps) from combos/*.txt. */
"use strict";
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const MTGDeck = require(path.join(root, "docs", "deck.js")), MTGCombos = require(path.join(root, "docs", "combos.js"));

const args = process.argv.slice(2);
const take = (flag, hasValue) => { const i = args.indexOf(flag); return i < 0 ? null : args.splice(i, hasValue ? 2 : 1)[hasValue ? 1 : 0]; };
const steps = !!take("--steps"), limit = +take("--limit", true) || 20;
const mode = args.shift();
if (!["deck", "with"].includes(mode) || !args.length) {
  console.error('usage: node tools/combos.js deck <decklist.txt> [--steps] [--limit N]\n       node tools/combos.js with "Card A" ["Card B" ...] [--steps] [--limit N]');
  process.exit(2);
}

const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "docs", "data", f), "utf8"));
const cards = read("cards.json"), data = read("combos.json");
const byNorm = new Map(cards.map((c) => [MTGDeck.norm(c.n), c]));
const card = (n) => byNorm.get(MTGDeck.norm(n));
const ix = MTGCombos.index(data, card);

// Full entries from the text files, found by combo id.
function entries(ids) {
  const want = new Set(ids), out = new Map(), dir = path.join(root, "combos");
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith("combos_")).sort()) {
    if (!want.size) break;
    const text = "\n\n" + fs.readFileSync(path.join(dir, f), "utf8");
    for (const id of [...want]) {
      const at = text.indexOf("\n\n## Combo " + id + "\n");
      if (at < 0) continue;
      const end = text.indexOf("\n\n## Combo ", at + 2);
      out.set(id, text.slice(at + 2, end < 0 ? undefined : end).trim());
      want.delete(id);
    }
  }
  return out;
}
const num = (n) => n.toLocaleString("en-US");
function show(c, full, pad) {
  const lines = [c.cards.map((n) => (c.copies[n] ? c.copies[n] + "× " : "") + n).join(" + "),
    "  Produces: " + (c.results.join("; ") || "(no listed result)")];
  if (c.needs.length) lines.push("  Also needs: " + c.needs.join("; "));
  if (c.commander.length) lines.push("  Must be your commander: " + c.commander.join(", "));
  lines.push("  " + (c.bracket ? (c.bracket[1] ? "Bracket " + c.bracket[1] + " (" + c.bracket[0] + ")" : c.bracket[0] + " in Commander") : "No bracket tag") +
    " · about " + num(c.pop) + " EDHREC decks · combo " + c.id + " · " + c.url);
  if (full && full.get(c.id)) lines.push(...full.get(c.id).split("\n").filter((l) => !/^(## Combo|Cards:|Color identity:|Produces:) /.test(l)).map((l) => "  | " + l));
  return lines.map((l) => pad + l).join("\n");
}

console.log("Combo data: Commander Spellbook, updated " + data.updated + " (" + num(data.combos.length) + " combos). A list of known combos: check every step against the card text.");
if (mode === "with") {
  const names = args.map((a) => { const c = card(a) || card(a.split(" // ")[0]); if (!c) { console.error("No card named \"" + a + "\" in the data. Check the spelling."); process.exit(1); } return c.n; });
  const r = MTGCombos.withCards(ix, names, limit), full = steps ? entries(r.combos.map((c) => c.id)) : null;
  console.log("\nKnown combos using " + names.join(" + ") + ": " + num(r.count) + (r.count > r.combos.length ? " (showing the " + r.combos.length + " most popular)" : ""));
  r.combos.forEach((c, i) => console.log("\n" + (i + 1) + ". " + show(c, full, "   ").trimStart()));
} else {
  const deck = MTGDeck.fillCommanders(MTGDeck.parse(fs.readFileSync(args[0], "utf8"), card), card);
  const chk = MTGDeck.check(deck, card);
  // without a marked commander, suggestions stay inside the colors the list already uses
  const identity = deck.commanders.length ? chk.identity : [...new Set(deck.cards.flatMap((x) => [...card(x.n).ci]))].join("");
  const r = MTGCombos.check(ix, deck, { identity, limit });
  const ids = r.have.map((c) => c.id).concat(r.near.flatMap((g) => g.combos.map((c) => c.id)));
  const full = steps ? entries(ids) : null;
  console.log("Deck: " + chk.total + " cards · " + (deck.commanders.length ? "commander " + deck.commanders.join(" + ") + (deck.guessed ? " (guessed; none was marked)" : "") : "no commander marked") + " · colors " + (identity || "colorless"));
  if (deck.unknown.length) console.log("Not found (check spelling): " + deck.unknown.join("; "));
  console.log("\nCombos in this deck: " + r.have.length);
  r.have.forEach((c, i) => console.log("\n" + (i + 1) + ". " + show(c, full, "   ").trimStart()));
  console.log("\nOne card away: " + r.nearCount + " card" + (r.nearCount === 1 ? "" : "s") + " would each finish a combo" + (r.nearCount > r.near.length ? " (showing the top " + r.near.length + ")" : ""));
  for (const g of r.near) {
    console.log("\n+ " + g.n + ": finishes " + g.count + " combo" + (g.count === 1 ? "" : "s") + (g.count > g.combos.length ? " (top " + g.combos.length + " shown)" : ""));
    g.combos.forEach((c) => console.log(show(c, full, "    ")));
  }
}
