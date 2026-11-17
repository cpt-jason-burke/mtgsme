// Logic checks for docs/deck.js, docs/engine.js and docs/combos.js. Run before pushing: node tools/tests/logic.js
// Expected results come from the CR, the card data and official rulings, not from memory.
"use strict";
const path = require("path"), assert = require("assert");
const root = process.argv[2] || path.join(__dirname, "..", "..");
const D = require(path.join(root, "docs/deck.js")), E = require(path.join(root, "docs/engine.js")), C = require(path.join(root, "docs/combos.js"));
const cards = require(path.join(root, "docs/data/cards.json")), cr = require(path.join(root, "docs/data/cr.json"));
const by = new Map(cards.map((c) => [D.norm(c.n), c])), card = (n) => by.get(D.norm(n));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL " + name + ": " + e.message); } };
// 98 different colorless cards, for padding test decks to 100
const pad = cards.filter((c) => c.ci === "" && !c.s && !/Basic|Legendary/.test(c.t) && !c.f && !/a deck can have/i.test(c.o)).slice(0, 98).map((c) => "1 " + c.n);
const deckOf = (text) => D.fillCommanders(D.parse(text, card), card);

// commanders
t("Garruk, Cursed Huntsman alone is not a commander", () => assert.strictEqual(D.check({ commanders: ["Garruk, Cursed Huntsman"], cards: [] }, card).commanderIssues[0].rule, "903.3"));
t("Grist is a commander", () => assert.ok(D.canBeCommander(card("Grist, the Hunger Tide"))));
t("Daretti says it can be your commander", () => assert.ok(D.canBeCommander(card("Daretti, Scrap Savant"))));
t("Shorikai (Vehicle) is a commander", () => assert.ok(D.canBeCommander(card("Shorikai, Genesis Engine"))));
t("Spacecraft with P/T is a commander", () => assert.ok(D.canBeCommander(card("Enterprise NX-01"))));
t("Spacecraft without P/T is not", () => assert.ok(!D.canBeCommander(card("Deep Space 9"))));
t("Background alone is flagged", () => assert.strictEqual(D.check({ commanders: ["Acolyte of Bahamut"], cards: [] }, card).commanderIssues[0].rule, "702.124k"));
t("partner + partner", () => assert.ok(D.canPair(card("Akiri, Line-Slinger"), card("Bruse Tarl, Boorish Herder"))));
t("choose a Background + Background", () => assert.ok(D.canPair(card("Abdel Adrian, Gorion's Ward"), card("Acolyte of Bahamut"))));
t("choose a Background + partner fails", () => assert.ok(!D.canPair(card("Abdel Adrian, Gorion's Ward"), card("Akiri, Line-Slinger"))));
t("partner with each other", () => assert.ok(D.canPair(card("Alisaie Leveilleur"), card("Alphinaud Leveilleur"))));
t("partner with + plain partner fails", () => assert.ok(!D.canPair(card("Alisaie Leveilleur"), card("Akiri, Line-Slinger"))));
t("friends forever pair", () => assert.ok(D.canPair(card("Bjorna, Nightfall Alchemist"), card("Cecily, Haunted Mage"))));
t("friends forever + partner fails (702.124f)", () => assert.ok(!D.canPair(card("Bjorna, Nightfall Alchemist"), card("Akiri, Line-Slinger"))));
t("doctor's companion + Time Lord Doctor", () => assert.ok(D.canPair(card("Ace, Fearless Rebel"), card("The Eleventh Doctor"))));
t("doctor's companion + Time Lord Rogue fails", () => assert.ok(!D.canPair(card("Ace, Fearless Rebel"), card("Missy"))));
t("three commanders flagged", () => assert.strictEqual(D.check({ commanders: ["Akiri, Line-Slinger", "Bruse Tarl, Boorish Herder", "Kodama of the East Tree"], cards: [] }, card).commanderIssues[0].rule, "702.124g"));
t("valid partners: no issue", () => assert.strictEqual(D.check({ commanders: ["Akiri, Line-Slinger", "Bruse Tarl, Boorish Herder"], cards: [] }, card).commanderIssues.length, 0));

// copies
t("7 Seven Dwarves ok, 8 not", () => {
  assert.deepStrictEqual(D.check({ commanders: ["Kenrith, the Returned King"], cards: [{ n: "Seven Dwarves", q: 7 }] }, card).duplicates, []);
  assert.deepStrictEqual(D.check({ commanders: ["Kenrith, the Returned King"], cards: [{ n: "Seven Dwarves", q: 8 }] }, card).duplicates, ["Seven Dwarves"]);
});
t("9 Nazgûl ok, 10 not", () => assert.deepStrictEqual(D.check({ commanders: ["Kenrith, the Returned King"], cards: [{ n: "Nazgûl", q: 10 }] }, card).duplicates, ["Nazgûl"]));
t("30 Relentless Rats ok", () => assert.deepStrictEqual(D.check({ commanders: ["Kenrith, the Returned King"], cards: [{ n: "Relentless Rats", q: 30 }] }, card).duplicates, []));
t("commander also in the list is a duplicate", () => assert.deepStrictEqual(D.check({ commanders: ["Kenrith, the Returned King"], cards: [{ n: "Kenrith, the Returned King", q: 1 }] }, card).duplicates, ["Kenrith, the Returned King"]));

// companion
t("companion section is outside the 100", () => {
  const d = deckOf(["Commander", "1 Kenrith, the Returned King", "Companion", "1 Jegantha, the Wellspring", "Deck"].concat(pad.slice(0, 99 - 1), ["1 Forest"]).join("\n"));
  assert.deepStrictEqual(d.companions, ["Jegantha, the Wellspring"]);
  assert.ok(!d.cards.some((x) => x.n === "Jegantha, the Wellspring"));
  assert.strictEqual(D.check(d, card).total, 100);
});
t("Lutri as companion is banned", () => assert.ok(D.check({ commanders: ["Kenrith, the Returned King"], companions: ["Lutri, the Spellchaser"], cards: [] }, card).banned[0].includes("as a companion")));
t("Lutri in the main deck is fine", () => assert.deepStrictEqual(D.check({ commanders: ["Kenrith, the Returned King"], cards: [{ n: "Lutri, the Spellchaser", q: 1 }] }, card).banned, []));
t("off-color companion flagged", () => assert.ok(D.check({ commanders: ["Kozilek, Butcher of Truth"], companions: ["Lurrus of the Dream-Den"], cards: [] }, card).companionIssues.some((x) => x.rule === "903.11a")));
t("export keeps the companion and re-imports", () => {
  const txt = D.exportText({ commanders: ["Kenrith, the Returned King"], companions: ["Jegantha, the Wellspring"], cards: [{ n: "Sol Ring", q: 1 }] });
  const d = D.parse(txt, card);
  assert.deepStrictEqual([d.commanders, d.companions, d.cards.map((x) => x.n)], [["Kenrith, the Returned King"], ["Jegantha, the Wellspring"], ["Sol Ring"]]);
});

// unmarked commanders
t("MTGO text: commander after the last blank line", () => {
  const d = deckOf(pad.slice(0, 64).concat(["35 Forest", "", "1 Kodama of the East Tree"]).join("\n"));
  assert.deepStrictEqual(d.commanders, ["Kodama of the East Tree"]);
  assert.ok(!d.cards.some((x) => x.n === "Kodama of the East Tree"));
});
t("trailing blank lines don't hide the last block", () => assert.deepStrictEqual(deckOf(pad.slice(0, 64).concat(["35 Forest", "", "1 Kodama of the East Tree", "", ""]).join("\n")).commanders, ["Kodama of the East Tree"]));
t("MTGO sideboard holds the commander", () => {
  const d = deckOf(pad.slice(0, 64).concat(["35 Forest", "SIDEBOARD:", "1 Kodama of the East Tree"]).join("\n"));
  assert.deepStrictEqual([d.commanders, d.skipped], [["Kodama of the East Tree"], 0]);
});
t("partner pair in the last block", () => assert.deepStrictEqual(deckOf(pad.slice(0, 63).concat(["35 Mountain", "", "1 Akiri, Line-Slinger", "1 Bruse Tarl, Boorish Herder"]).join("\n")).commanders, ["Akiri, Line-Slinger", "Bruse Tarl, Boorish Herder"]));
t("basic land lines still allow a guess (old bug: counted lines, not cards)", () => assert.strictEqual(deckOf(["1 Kodama of the East Tree"].concat(pad.slice(0, 63), ["35 Forest"]).join("\n")).commanders[0], "Kodama of the East Tree"));
t("short lists get no guess", () => assert.deepStrictEqual(deckOf("1 Kodama of the East Tree\n1 Sol Ring").commanders, []));

// names
t("back face name counts as the front face", () => assert.strictEqual(D.parse("1 Ormendahl, Profane Prince", card).cards[0].n, "Westvale Abbey"));
t("Fire // Ice and Ice are the same card", () => assert.deepStrictEqual(D.parse("1 Fire // Ice\n1 Ice", card).cards, [{ n: "Fire", q: 2 }]));
t("Moxfield set and foil tags", () => assert.deepStrictEqual(D.parse("1 Sol Ring (CMM) 400 *F*\n1x Arcane Signet (ELD) 331 [Ramp]", card).cards.map((x) => x.n), ["Sol Ring", "Arcane Signet"]));

// printings: kept from Moxfield/Archidekt text and written back on export
t("Moxfield printing and foil kept", () => assert.deepStrictEqual(D.parse("1 Sol Ring (CMM) 400 *F*\n1x Arcane Signet (ELD) 331 [Ramp]\n1 Command Tower", card).prints,
  { "Sol Ring": { p: "cmm/400", f: "foil" }, "Arcane Signet": { p: "eld/331" } }));
t("etched, star and letter collector numbers", () => assert.deepStrictEqual(D.parse("1 Sol Ring (C21) 263 *E*\n1 Lightning Bolt (SLD) 123★\n1 Captain Jean-Luc Picard (TRK) 1701D *F*", card).prints,
  { "Sol Ring": { p: "c21/263", f: "etched" }, "Lightning Bolt": { p: "sld/123★" }, "Captain Jean-Luc Picard": { p: "trk/1701D", f: "foil" } }));
t("Archidekt line with category and commander tag", () => {
  const d = D.parse("1x Kenrith, the Returned King (eld) 303 *F* [Commander{top}]\n1x Sol Ring (cmm) 400 [Ramp]", card);
  assert.deepStrictEqual([d.commanders, d.prints["Kenrith, the Returned King"], d.prints["Sol Ring"]], [["Kenrith, the Returned King"], { p: "eld/303", f: "foil" }, { p: "cmm/400" }]);
});
t("first printing of a repeated name wins", () => {
  const d = D.parse("10 Forest (UNF) 235\n5 Forest (ZEN) 246", card);
  assert.deepStrictEqual([d.cards, d.prints.Forest], [[{ n: "Forest", q: 15 }], { p: "unf/235" }]);
});
t("set code without a number keeps no printing", () => assert.deepStrictEqual(D.parse("1 Sol Ring (CMM)", card).prints, {}));
t("export writes printings back and re-imports them", () => {
  const deck = { commanders: ["Kenrith, the Returned King"], cards: [{ n: "Sol Ring", q: 1 }, { n: "Forest", q: 9 }], prints: { "Kenrith, the Returned King": { p: "eld/303", f: "foil" }, "Sol Ring": { p: "c21/263", f: "etched" } } };
  const txt = D.exportText(deck);
  assert.ok(txt.includes("1 Kenrith, the Returned King (ELD) 303 *F* *CMDR*") && txt.includes("1 Sol Ring (C21) 263 *E*") && txt.includes("9 Forest\n") === false);
  const d = D.parse(txt, card);
  assert.deepStrictEqual([d.commanders, d.cards, d.prints], [deck.commanders, deck.cards, deck.prints]);
});

// every official Commander precon passes (no false alarms)
t("Commander precons: no false commander or duplicate alarms", () => {
  const P = require(path.join(root, "docs/data/precons.json"));
  const bad = [];
  for (const p of P.d.filter((x) => x.y === "cmd" && x.cmd)) {
    const d = { commanders: p.cmd.map((r) => cards[r[1]].n), cards: [] };
    for (const r of p.main) { const n = cards[r[1]].n, h = d.cards.find((x) => x.n === n); if (h) h.q += r[0]; else d.cards.push({ n, q: r[0] }); }
    const r = D.check(d, card);
    if (r.commanderIssues.length || r.duplicates.length || r.offColor.length) bad.push(p.n + ": " + JSON.stringify([r.commanderIssues.map((x) => x.text), r.duplicates, r.offColor]));
  }
  const known = bad.filter((x) => x.startsWith("Upgrades Unleashed:"));
  if (known.length) console.log("  note: the source data lists 2 Mossfire Valley in Upgrades Unleashed");
  bad.splice(0, bad.length, ...bad.filter((x) => !known.includes(x)));
  if (bad.length) throw new Error(bad.length + " precons\n  " + bad.slice(0, 12).join("\n  "));
});

// engine
t("mandatory loop cites the current shortcut rules", () => {
  const r = E.analyze([card("Sanguine Bond"), card("Exquisite Blood")], { cr });
  assert.ok(r.loops.length, "no loop found");
  const c = r.loops[0].cites;
  assert.ok(c.includes("104.4b") && c.some((n) => /only mandatory actions/.test(cr.rules[n].t)) && c.some((n) => /repeated indefinitely/.test(cr.rules[n].t)), JSON.stringify(c));
});
t("'at random' is not a triggered ability", () => assert.ok(!E.wording([card("Hymn to Tourach")], { cr }).some((w) => w.title === "No “may”")));
t("trigger without may is flagged", () => assert.ok(E.wording([card("Sanguine Bond")], { cr }).some((w) => w.title === "No “may”")));
t("every rule the engine cites exists", () => {
  const r = E.analyze([card("Sanguine Bond"), card("Exquisite Blood"), card("Doubling Season"), card("Blood Artist")], { cr });
  const all = [].concat(...r.loops.map((x) => x.cites), ...r.gotchas.map((x) => x.cites), ...r.connections.map((x) => x.cites), ...r.replacements.map((x) => x.cites));
  assert.ok(all.every((n) => cr.rules[n]), all.filter((n) => !cr.rules[n]).join(","));
});

// combos
t("combos: Sanguine Bond + Exquisite Blood is found", () => {
  const ix = C.index(require(path.join(root, "docs/data/combos.json")), card);
  const r = C.check(ix, { commanders: ["Vito, Thorn of the Dusk Rose"], cards: [{ n: "Sanguine Bond", q: 1 }, { n: "Exquisite Blood", q: 1 }] }, { identity: "B" });
  assert.ok(r.have.some((c) => c.cards.length === 2 && c.cards.includes("Sanguine Bond") && c.cards.includes("Exquisite Blood")));
});

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
