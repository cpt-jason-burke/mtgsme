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

// precon timeline (docs/timeline.js): the counts are computed from precons.json, so a new deck shows up on its own
const TL = require(path.join(root, "docs/timeline.js"));
const PCD = require(path.join(root, "docs/data/precons.json")).d; PCD.forEach((p, i) => { p.i = i; });
const THEMES = require(path.join(root, "docs/data/precon-themes.json")), UPCOMING = require(path.join(root, "docs/data/precon-upcoming.json"));
const tlRows = (extra) => TL.rows(PCD, (i) => cards[i].n, extra);
const ceName = (n) => /collector'?s edition/i.test(n);
t("timeline: every Commander precon becomes a row (none dropped for a bad date)", () => assert.strictEqual(tlRows().length, PCD.filter((p) => p.y === "cmd").length));
t("timeline: a date without its leading zero is padded", () => assert.strictEqual(TL.normDate("2022-11-1"), "2022-11-01"));
t("timeline: bar counts match the data, year by year (Collector's Editions hidden by default)", () => {
  const rows = tlRows(), c = TL.counts(rows, { sl: "include", ce: false });
  const want = new Map();
  for (const p of PCD.filter((x) => x.y === "cmd" && !ceName(x.n))) { const y = +TL.normDate(p.d).slice(0, 4), w = want.get(y) || { r: 0, s: 0 }; w[p.s === "sld" ? "s" : "r"]++; want.set(y, w); }
  for (const [y, w] of want) assert.deepStrictEqual(c.get(y), w, "year " + y);
  assert.strictEqual([...c.values()].reduce((a, x) => a + x.r + x.s, 0), [...want.values()].reduce((a, x) => a + x.r + x.s, 0));
});
t("timeline: a gap year inside the range counts as 0", () => { const c = TL.counts(tlRows(), { sl: "include" }); assert.deepStrictEqual(c.get(2012), { r: 0, s: 0 }); });
t("timeline: Collector's Editions and Secret Lair decks switch on and off", () => {
  const rows = tlRows(), n = (o) => TL.visible(rows, o).length, base = n({ sl: "include", ce: false });
  assert.ok(n({ sl: "include", ce: true }) - base === PCD.filter((p) => p.y === "cmd" && ceName(p.n)).length);
  assert.ok(n({ sl: "hide", ce: false }) + n({ sl: "only", ce: false }) === base);
  assert.ok(TL.visible(rows, { sl: "only", ce: true }).every((r) => r.s === "sld"));
  assert.ok(TL.visible(rows, { from: 2024, to: 2024, sl: "include", ce: true }).every((r) => r.y === 2024));
});
t("timeline: Secret Lair Commander decks are found (they are Commander decks in set sld)", () => {
  const sld = tlRows().filter((r) => r.sl); assert.ok(sld.length >= 7);
  for (const n of ["Raining Cats and Dogs", "Goblin Storm", "20 Ways to Win"]) assert.ok(sld.some((r) => r.n === n), n);
});
t("timeline: search finds a deck by a card inside it", () => {
  const rows = tlRows(), r = rows.find((x) => !x.ce && x.p && (x.p.main || []).length > 50), card = cards[r.p.main[40][1]].n;
  assert.ok(TL.visible(rows, { sl: "include", ce: true, q: card }, true).includes(r));
  assert.strictEqual(TL.visible(rows, { sl: "include", ce: true, q: "zzzz no such thing" }, true).length, 0);
});
t("timeline: an announced deck shows until the data has it (same name, name plus a suffix, or same commander that year); a bad entry is ignored", () => {
  const have = tlRows().find((r) => r.y === 2026 && !r.ce && r.cmd.length);
  const extra = { themes: {}, up: [
    { n: "Some Future Deck", d: "2027-02-05", sn: "Future Commander" },
    { n: have.n, d: have.d, sn: "x" },
    { n: have.n + " Commander Deck", d: have.d, sn: "x" },
    { n: "Renamed Upstream", d: have.d, sn: "x", cmd: have.cmd[0] },
    { n: "Same Commander Another Year", d: "2027-03-01", sn: "x", cmd: have.cmd[0] },
    { n: "No Date" }, null] };
  const rows = tlRows(extra), ann = rows.filter((r) => r.ann).map((r) => r.n).sort();
  assert.deepStrictEqual(ann, ["Same Commander Another Year", "Some Future Deck"]);
  assert.strictEqual(TL.counts(rows, { sl: "include" }).get(2027).r, 2);
  assert.strictEqual(TL.latest(rows, "2026-12-01").ann, undefined);
});
t("timeline: hand-kept summaries still match decks in the data (a few orphans are only noted), and a Collector's Edition borrows its base deck's", () => {
  const keys = new Set(PCD.filter((p) => p.y === "cmd").map((p) => p.s + ":" + p.n)), all = Object.keys(THEMES.t), orphan = all.filter((k) => !keys.has(k));
  if (orphan.length) console.log("  note: " + orphan.length + " deck summaries name a deck the data no longer has (fix the key in precon-themes.json): " + orphan.slice(0, 6).join("; "));
  assert.ok(orphan.length <= all.length * 0.1, orphan.length + " of " + all.length + " summaries have no deck");
  const rows = tlRows({ themes: THEMES.t }), ce = rows.find((r) => r.ce && THEMES.t[r.s + ":" + r.n.replace(/\s*collector'?s edition/i, "")]);
  assert.ok(ce && ce.th, "a Collector's Edition with a base deck summary");
});
t("timeline: announced-deck file is well formed", () => {
  for (const u of UPCOMING.decks) assert.ok(u.n && /^\d{4}-\d{2}-\d{2}$/.test(u.d) && u.sn, JSON.stringify(u));
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

// wording notes are kept only when they can change the answer for the chosen cards
t("relevant wording: Soul Warden's \"another\" matters next to a token maker; unrelated notes are dropped", () => {
  const cs = [card("Soul Warden"), card("Avenger of Zendikar")], r = E.analyze(cs, { cr });
  const rel = E.relevantWording(cs, r, { cr }), all = E.wording(cs, { cr });
  assert.ok(rel.some((w) => w.card === "Soul Warden" && w.key === "another"));
  assert.ok(rel.length < all.length && all.every((w) => w.key));
});
t("relevant wording: two cards with no link between them get no notes", () => {
  const cs = [card("Humility"), card("Opalescence")];
  assert.strictEqual(E.relevantWording(cs, E.analyze(cs, { cr }), { cr }).length, 0);
});
// synergy finder
t("synergy: a card that finishes a known combo comes first, with the combo id", () => {
  const S = require(path.join(root, "docs/synergy.js"));
  const small = cards.filter((c) => /\bB\b|^$/.test(c.ci) && c.ci.length < 2).slice(0, 4000).concat(card("Exquisite Blood"));
  const ix = S.index(small); ix.step();
  const cx = C.index(require(path.join(root, "docs/data/combos.json")), card);
  const r = S.find([card("Sanguine Bond"), card("Vito, Thorn of the Dusk Rose")], ix, { combos: { api: C, ix: cx }, cr });
  const top = r.items[0];
  assert.strictEqual(top.tier, 1); assert.ok(top.why[0].combo && top.why[0].combo.id);
  assert.ok(r.items.some((x) => x.n === "Exquisite Blood" && x.tier === 1));
  assert.ok(r.items.every((x) => !x.card || [...x.card.ci].every((ch) => "B".includes(ch))), "suggestions stay inside the chosen cards' colors");
});
t("synergy: text-found links are marked possible, and Humility draws a warning on creatures", () => {
  const S = require(path.join(root, "docs/synergy.js"));
  const ix = S.index(cards.filter((c) => c.ci === "W" || c.ci === "").slice(0, 6000)); ix.step();
  const r = S.find([card("Humility"), card("Soul Warden")], ix, { cr, limit: 40 });
  assert.ok(r.items.length && r.items.every((x) => x.possible));
  assert.ok(r.items.some((x) => x.warn && /Humility/.test(x.warn.text)));
});
// synergy finder with one card: that card's partners
t("synergy: one card finds the cards that finish its two-card combos first, then the rest of its longer combos", () => {
  const S = require(path.join(root, "docs/synergy.js")), short = (n) => n.split(",")[0];
  assert.ok(card("Sanguine Bond") && card("Exquisite Blood"), "precondition: both cards are in the card data");
  const small = cards.filter((c) => /\bB\b|^$/.test(c.ci) && c.ci.length < 2).slice(0, 4000).concat(card("Sanguine Bond"), card("Exquisite Blood"));
  const ix = S.index(small); ix.step();
  const cx = C.index(require(path.join(root, "docs/data/combos.json")), card);
  const r = S.find([card("Sanguine Bond")], ix, { combos: { api: C, ix: cx }, cr });
  assert.strictEqual(r.items[0].tier, 1); assert.ok(r.items[0].why[0].combo && r.items[0].why[0].combo.id);
  assert.ok(r.items.some((x) => x.n === "Exquisite Blood" && x.tier === 1), "Exquisite Blood should finish a known combo with Sanguine Bond (is that combo still in the combo list?)");
  assert.ok(r.items.some((x) => x.tier === 1.5), "Sanguine Bond should have partners in longer known combos");
  assert.ok(r.items.every((x) => !x.card || [...x.card.ci].every((ch) => "B".includes(ch))), "stays inside the card's colors");
  assert.ok(r.items.every((x) => !/\ball your cards\b|two or more|one of your cards/.test(x.label)), "labels talk about one card");
  // the longer combos name the other cards they need, so the suggestion can be judged
  for (const x of r.items.filter((y) => y.tier === 1.5)) for (const w of x.why.filter((z) => z.combo)) {
    assert.ok(/Part of a known combo with Sanguine Bond/.test(w.text), w.text);
    for (const other of w.combo.cards.filter((n) => n !== x.n && n !== "Sanguine Bond")) assert.ok(w.text.includes(short(other)), w.text + " should name " + other);
  }
});
t("synergy: one colorless card looks in any color, a card with colors stays in its own, and two cards keep their labels", () => {
  const S = require(path.join(root, "docs/synergy.js"));
  const named = ["Sol Ring", "Humility", "Soul Warden"].map(card);
  assert.ok(named.every(Boolean), "precondition: Sol Ring, Humility and Soul Warden are in the card data");
  const ix = S.index(cards.filter((c) => c.ci === "W" || c.ci === "" || c.ci === "B").slice(0, 7000).concat(named)); ix.step();
  assert.strictEqual(S.find([card("Sol Ring")], ix, { cr }).identity, "WUBRG");
  assert.strictEqual(S.find([card("Sol Ring")], ix, { cr, identity: "" }).identity, "", "an identity given by the caller wins");
  assert.strictEqual(S.find([card("Humility")], ix, { cr }).identity, "W");
  const one = S.find([card("Soul Warden")], ix, { cr, limit: 40 }), two = S.find([card("Humility"), card("Soul Warden")], ix, { cr, limit: 40 });
  assert.ok(one.items.length && one.items.every((x) => /this card|Possible loop/.test(x.label)), one.items.map((x) => x.label).join("; "));
  assert.ok(two.items.every((x) => !/this card/.test(x.label)));
});
t("synergy: a card with nothing to link to (Grizzly Bears, no combo list) gives an empty list, not an error", () => {
  const S = require(path.join(root, "docs/synergy.js"));
  assert.ok(card("Grizzly Bears"), "precondition: Grizzly Bears is in the card data");
  const ix = S.index(cards.slice(0, 3000)); ix.step();
  const r = S.find([card("Grizzly Bears")], ix, { cr });
  assert.deepStrictEqual([r.items.length, r.total], [0, 0]);
});

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
