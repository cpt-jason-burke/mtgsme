// Layer engine checks for docs/layers.js and docs/effects.js. Run before pushing: node tools/tests/layers.js
// Every expected result comes from the Comprehensive Rules (the examples under rule 613 and others), an official
// ruling, or the card's oracle text. Cases no rule example or ruling covers are marked "derived" and give the rules used.
"use strict";
const path = require("path"), assert = require("assert");
const root = process.argv[2] || path.join(__dirname, "..", "..");
const L = require(path.join(root, "docs/layers.js")), FX = require(path.join(root, "docs/effects.js"));
const cards = require(path.join(root, "docs/data/cards.json")), cr = require(path.join(root, "docs/data/cr.json")), rulings = require(path.join(root, "docs/data/rulings.json"));
L.init(cr);
const by = new Map(cards.map((c) => [c.n, c]));
const lookup = (n) => by.get(n);
let pass = 0, fail = 0, made = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL " + name + ": " + e.message); } };

// A made-up plain card, for rule examples that only describe "a 1/3 creature" or "an Aura that says ...".
const mk = (type, pt, text, cost) => ({ n: "Test card " + (++made), t: type, pt: pt || undefined, o: text || "", m: cost || "", ci: "" });
// A resolved spell or ability with this rules text, for examples that say "an effect that reads ...".
const fx = (text, opts) => Object.assign({ card: { n: "Effect " + (++made), t: "Instant", o: text, m: "", ci: "" } }, opts || {});
// board("Card", ["Card", {controller: "opp"}], fx("..."), ...) in timestamp order
function board(...items) {
  const entries = items.map((it, i) => {
    const e = typeof it === "string" ? { card: it } : Array.isArray(it) ? Object.assign({ card: it[0] }, it[1]) : Object.assign({}, it);
    if (typeof e.card === "string") { if (!by.get(e.card)) throw new Error("card not in the data: " + e.card); e.card = by.get(e.card); }
    if (!e.id) e.id = "e" + i;
    return e;
  });
  return entries;
}
function run(entries, opts) {
  const b = L.buildState(entries, Object.assign({ lookup }, opts || {}));
  const res = L.resolve(b.state, { lookup });
  res.state = b.state; res.notes = b.notes;
  res.get = (name) => { const f = res.permanents.find((p) => p.card === name || p.id === name); if (!f) throw new Error(name + " is not on the battlefield"); return f; };
  res.has = (name) => res.permanents.some((p) => p.card === name || p.id === name);
  return res;
}
const all = (entries, opts) => L.outcomes(L.buildState(entries, Object.assign({ lookup }, opts || {})).state, { lookup });
const abil = (f) => f.abilities.map((a) => a.text.toLowerCase());
const ruling = (card, phrase) => assert.ok((rulings.by[card] || []).some(([, i]) => rulings.texts[i].includes(phrase)), "the ruling this test relies on is no longer in the data: " + card + " / " + phrase);
const example = (rule, phrase) => assert.ok((cr.rules[rule].ex || []).some((x) => x.includes(phrase)), "the example this test relies on is no longer under rule " + rule);

// ---- the rules data the tests lean on ----
t("rule 613 still has the examples these tests were written from", () => {
  const n = Object.keys(cr.rules).filter((k) => /^613\./.test(k)).reduce((s, k) => s + (cr.rules[k].ex || []).length, 0);
  assert.strictEqual(n, 12, "rule 613 now has " + n + " examples; re-check the tests against the new rules");
});
t("subtype lists are read from the rules", () => { assert.ok(FX.SUB.creature.has("Saproling") && FX.SUB.creature.has("Time Lord") && FX.SUB.land.has("Urza's") && FX.SUB.artifact.has("Equipment") && FX.SUB.enchantment.has("Aura")); });

// ---- 613.4d examples: switching power and toughness ----
const wall = () => mk("Creature — Wall", "1/3");
t("613.4d ex 1: 1/3, +0/+1, switch = 4/1; then +5/+0 = 4/6", () => {
  example("613.4d", "Its new power and toughness is 4/1. A new effect gives the creature +5/+0");
  const w = wall();
  const base = [{ card: w }, fx("Target creature gets +0/+1 until end of turn."), fx("Switch target creature's power and toughness until end of turn.")];
  assert.strictEqual(run(board(...base)).get(w.n).pt, "4/1");
  assert.strictEqual(run(board(...base, fx("Target creature gets +5/+0 until end of turn."))).get(w.n).pt, "4/6");
});
t("613.4d ex 2: the +0/+1 ends first = 3/1", () => {
  example("613.4d", "the creature becomes 3/1");
  const w = wall();
  assert.strictEqual(run(board({ card: w }, fx("Switch target creature's power and toughness until end of turn."))).get(w.n).pt, "3/1");
});
t("613.4d ex 3: two switches cancel = 1/4", () => {
  example("613.4d", "the creature becomes 1/4");
  const w = wall(), sw = "Switch target creature's power and toughness until end of turn.";
  assert.strictEqual(run(board({ card: w }, fx("Target creature gets +0/+1 until end of turn."), fx(sw), fx(sw))).get(w.n).pt, "1/4");
});

// ---- 613.5 examples ----
t("613.5 ex 1: Honor of the Pure follows the creature's color", () => {
  example("613.5", "Honor of the Pure and a 2/2 black creature");
  assert.strictEqual(run(board("Honor of the Pure", "Walking Corpse")).get("Walking Corpse").pt, "2/2");
  const white = fx("Target creature becomes white until end of turn.");
  assert.strictEqual(run(board("Honor of the Pure", "Walking Corpse", white)).get("Walking Corpse").pt, "3/3");
  assert.strictEqual(run(board("Honor of the Pure", "Walking Corpse", white, fx("Target creature becomes red until end of turn."))).get("Walking Corpse").pt, "2/2");
});
t("613.5 ex 2: Gray Ogre 3/3, 7/7, 7/9, then \"becomes 0/1\" = 5/8", () => {
  example("613.5", "making it 5/8");
  const ogre = ["Gray Ogre", { counters: { "+1/+1": 1 } }], ench = mk("Enchantment", null, "Creatures you control get +0/+2.");
  assert.strictEqual(run(board(ogre)).get("Gray Ogre").pt, "3/3");
  const grow = fx("Target creature gets +4/+4 until end of turn.");
  assert.strictEqual(run(board(ogre, grow)).get("Gray Ogre").pt, "7/7");
  assert.strictEqual(run(board(ogre, grow, { card: ench })).get("Gray Ogre").pt, "7/9");
  assert.strictEqual(run(board(ogre, grow, { card: ench }, fx("Target creature becomes 0/1 until end of turn."))).get("Gray Ogre").pt, "5/8");
});

// ---- 613.6 examples: one effect in several layers ----
t("613.6 ex 1: +1/+1 and a color: color in layer 5, then +1/+1 in layer 7c", () => {
  example("613.6", "becomes the color of your choice");
  const r = run(board("Grizzly Bears", fx("Target creature gets +1/+1 and becomes the color of your choice until end of turn.", { chosen: { color: "U" } })));
  const f = r.get("Grizzly Bears");
  assert.strictEqual(f.pt, "3/3"); assert.deepStrictEqual(f.colors, ["U"]);
  const layers = r.log.filter((e) => e.source).map((e) => e.layer);
  assert.deepStrictEqual(layers, ["5", "7c"]);
});
t("613.6 ex 2: Act of Treason: control in layer 2, haste in layer 6", () => {
  example("613.6", "Act of Treason");
  const r = run(board(["Runeclaw Bear", { controller: "opp" }], "Act of Treason"));
  const f = r.get("Runeclaw Bear");
  assert.strictEqual(f.controller, "you"); assert.ok(abil(f).includes("haste"));
  assert.deepStrictEqual(r.log.filter((e) => e.source).map((e) => e.layer), ["2", "6"]);
});
t("613.6 ex 3: noncreature artifacts become 2/2 artifact creatures: P/T still applies once they are creatures", () => {
  example("613.6", "All noncreature artifacts become 2/2 artifact creatures until end of turn");
  const eff = fx("All noncreature artifacts become 2/2 artifact creatures until end of turn.");
  const r = run(board("Sol Ring", "Ornithopter", eff, "Darksteel Citadel"));
  assert.strictEqual(r.get("Sol Ring").pt, "2/2"); assert.strictEqual(r.get("Sol Ring").typeLine, "Artifact Creature");
  assert.strictEqual(r.get("Ornithopter").pt, "0/2", "it was already a creature, so it is not affected");
  assert.strictEqual(r.get("Darksteel Citadel").pt, null, "611.2c: it arrived after the effect began, so it is not affected");
});
t("613.6 ex 4: Svogthos: 4/4, then 11/11 with ten creature cards, then 4/4 again", () => {
  example("613.6", "It becomes an 11/11 land creature");
  const animate = () => fx("Until end of turn, target land becomes a 3/3 creature that's still a land.");
  const pump = fx("Target creature gets +1/+1 until end of turn.");
  const first = board("Svogthos, the Restless Tomb", animate(), pump);
  let f = run(first).get("Svogthos, the Restless Tomb");
  assert.strictEqual(f.pt, "4/4"); assert.deepStrictEqual(f.types, ["Land", "Creature"]);
  const idx = FX.parseCard(by.get("Svogthos, the Restless Tomb")).abilities.findIndex((a) => a.kind === "activated" && a.templates.length);
  const second = first.concat([{ id: "use", use: { of: "e0", ability: idx } }]);
  f = run(second, { values: { e0: 10 } }).get("Svogthos, the Restless Tomb");
  assert.strictEqual(f.pt, "11/11"); assert.deepStrictEqual(f.colors, ["B", "G"]);
  assert.ok(f.subtypes.includes("Plant") && f.subtypes.includes("Zombie") && f.types.includes("Land"));
  f = run(second.concat([Object.assign(animate(), { id: "again" })]), { values: { e0: 10 } }).get("Svogthos, the Restless Tomb");
  assert.strictEqual(f.pt, "4/4");
});

// ---- 613.7a example ----
t("613.7a ex: Rune of Flight on Colossus Hammer: the granted ability uses the Rune's later timestamp", () => {
  example("613.7a", "Rune of Flight");
  const f = run(board("Serra Angel", "Colossus Hammer", ["Rune of Flight", { attach: "e1" }])).get("Serra Angel");
  assert.ok(abil(f).includes("flying")); assert.strictEqual(f.pt, "14/14");
});
t("Colossus Hammer ruling: flying gained after the Hammer is attached is kept; flying from before is lost", () => {
  ruling("Colossus Hammer", "gains flying after Colossus Hammer became attached");
  assert.ok(abil(run(board("Grizzly Bears", "Colossus Hammer", "Flight")).get("Grizzly Bears")).includes("flying"));
  assert.ok(!abil(run(board("Grizzly Bears", "Flight", ["Colossus Hammer", { attach: "e0" }])).get("Grizzly Bears")).includes("flying"));
  assert.ok(!abil(run(board("Serra Angel", "Colossus Hammer")).get("Serra Angel")).includes("flying"));
});

// ---- 613.9 examples ----
t("613.9 ex 1: \"has flying\" and \"loses flying\": the later timestamp wins", () => {
  example("613.9", "Enchanted creature loses flying");
  const lose = () => mk("Enchantment — Aura", null, "Enchant creature\nEnchanted creature loses flying.");
  assert.ok(!abil(run(board("Grizzly Bears", "Flight", { card: lose() })).get("Grizzly Bears")).includes("flying"));
  assert.ok(abil(run(board("Grizzly Bears", { card: lose() }, "Flight")).get("Grizzly Bears")).includes("flying"));
  assert.ok(!abil(run(board("Grizzly Bears", "Flight", fx("All creatures lose flying until end of turn."))).get("Grizzly Bears")).includes("flying"));
});
t("613.9 ex 2: \"White creatures get +1/+1\" and \"Enchanted creature is white\", either order", () => {
  example("613.9", "Enchanted creature is white");
  const anthem = () => mk("Enchantment", null, "White creatures get +1/+1."), aura = () => mk("Enchantment — Aura", null, "Enchant creature\nEnchanted creature is white.");
  assert.strictEqual(run(board("Walking Corpse", { card: anthem() }, { card: aura() })).get("Walking Corpse").pt, "3/3");
  assert.strictEqual(run(board("Walking Corpse", { card: aura() }, { card: anthem() })).get("Walking Corpse").pt, "3/3");
});
t("611.3b ex: a static \"All white creatures get +1/+1\" is not locked in", () => {
  example("611.3b", "All white creatures get +1/+1");
  const anthem = mk("Enchantment", null, "All white creatures get +1/+1.");
  assert.strictEqual(run(board({ card: anthem }, "Serra Angel", "Walking Corpse")).get("Serra Angel").pt, "5/5");
});
t("611.2c ex: a resolved \"All white creatures get +1/+1\" is locked in", () => {
  example("611.2c", "All white creatures get +1/+1 until end of turn");
  const eff = fx("All white creatures get +1/+1 until end of turn.");
  const r = run(board("Serra Angel", "Walking Corpse", eff, "Isamaru, Hound of Konda", fx("Target creature becomes red until end of turn.", { target: "e0" }), fx("Target creature becomes white until end of turn.", { target: "e1" })));
  assert.strictEqual(r.get("Serra Angel").pt, "5/5", "it keeps the bonus after turning red");
  assert.strictEqual(r.get("Walking Corpse").pt, "2/2", "it turned white afterward");
  assert.strictEqual(r.get("Isamaru, Hound of Konda").pt, "2/2", "it entered afterward");
});

// ---- Humility + Opalescence (rulings of 2006-02-01 and 2009-10-01) ----
t("Humility then Opalescence: Humility is 4/4; Opalescence then Humility: 1/1", () => {
  ruling("Humility", "But if Humility entered before Opalescence");
  let r = run(board("Humility", "Opalescence", "Worship"));
  assert.strictEqual(r.get("Humility").pt, "4/4"); assert.strictEqual(r.get("Worship").pt, "4/4"); assert.strictEqual(abil(r.get("Worship")).length, 0);
  r = run(board("Opalescence", "Humility", "Worship"));
  assert.strictEqual(r.get("Humility").pt, "1/1"); assert.strictEqual(r.get("Worship").pt, "1/1");
  assert.deepStrictEqual(r.get("Humility").types, ["Enchantment", "Creature"]);
  assert.strictEqual(r.get("Opalescence").pt, null, "Opalescence does not animate itself");
});
t("Humility and two Opalescences, all three timestamp orders", () => {
  ruling("Humility", "If the timestamp order is Opalescence, Humility, Opalescence");
  let r = run(board("Opalescence", "Opalescence", "Humility"));
  assert.deepStrictEqual(r.permanents.map((p) => p.pt), ["1/1", "1/1", "1/1"]);
  assert.ok(r.permanents.every((p) => !p.abilities.length));
  r = run(board("Opalescence", "Humility", "Opalescence"));
  assert.deepStrictEqual([r.get("Opalescence (1)").pt, r.get("Humility").pt, r.get("Opalescence (2)").pt], ["4/4", "4/4", "1/1"]);
  r = run(board("Humility", "Opalescence", "Opalescence"));
  assert.deepStrictEqual(r.permanents.map((p) => p.pt), ["4/4", "4/4", "4/4"]);
});
t("outcomes(): Humility + Opalescence gives two results and names the order that decides", () => {
  const o = all(board("Humility", "Opalescence"));
  assert.strictEqual(o.outcomes.length, 2);
  assert.ok(o.outcomes[0].current && o.outcomes[0].when.some((w) => w[0] === "Humility" && w[1] === "Opalescence"));
  assert.ok(o.outcomes[1].when.some((w) => w[0] === "Opalescence" && w[1] === "Humility"));
});
t("Humility ruling: an animated land loses its mana ability too", () => {
  ruling("Humility", "Animated lands will also lose the ability to tap for mana");
  const r = run(board("Forest", "Life and Limb", "Humility"));
  assert.strictEqual(abil(r.get("Forest")).length, 0); assert.strictEqual(r.get("Forest").pt, "1/1");
});

// ---- Turn to Frog (rulings of 2014-07-18) ----
t("Turn to Frog: counters and pump still apply, whenever they started", () => {
  ruling("Turn to Frog", "will apply to the creature no matter when they started to take effect");
  const f = run(board(["Serra Angel", { counters: { "+1/+1": 2 } }], "Giant Growth", "Turn to Frog")).get("Serra Angel");
  assert.strictEqual(f.pt, "6/6"); assert.strictEqual(f.typeLine, "Creature — Frog"); assert.deepStrictEqual(f.colors, ["U"]); assert.strictEqual(f.abilities.length, 0);
});
t("Turn to Frog: an ability gained afterward is kept; an earlier P/T-setting effect is overwritten", () => {
  ruling("Turn to Frog", "If the affected creature gains an ability after Turn to Frog resolves, it will keep that ability");
  const f = run(board("Serra Angel", fx("Target creature becomes 0/1 until end of turn."), "Turn to Frog", fx("Target creature gains flying until end of turn."))).get("Serra Angel");
  assert.deepStrictEqual(abil(f), ["flying"]); assert.strictEqual(f.pt, "1/1");
  assert.strictEqual(run(board("Serra Angel", "Turn to Frog", fx("Target creature becomes 0/1 until end of turn."))).get("Serra Angel").pt, "0/1");
});
t("Turn to Frog on a Theros God: a legendary blue Frog, or a legendary blue enchantment with no abilities", () => {
  ruling("Turn to Frog", "it will be a legendary blue enchantment with no abilities");
  // devotion to white is 1 here, so Heliod is not a creature: the Frog effect was aimed at it while it still was one
  let f = run(board("Heliod, God of the Sun", ["Turn to Frog", { target: "e0" }])).get("Heliod, God of the Sun");
  assert.ok(run(board("Heliod, God of the Sun", "Turn to Frog")).notes.some((n) => /no legal target/.test(n)), "a noncreature God is not offered as a target");
  assert.strictEqual(f.typeLine, "Legendary Enchantment"); assert.deepStrictEqual(f.colors, ["U"]); assert.strictEqual(f.abilities.length, 0);
  f = run(board("Heliod, God of the Sun", "Serra Angel", "Serra Angel", "Turn to Frog")).get("Heliod, God of the Sun");   // devotion 5
  assert.strictEqual(f.typeLine, "Legendary Enchantment Creature — Frog"); assert.strictEqual(f.pt, "1/1"); assert.strictEqual(f.abilities.length, 0);
});

// ---- Darksteel Mutation (rulings of 2013-10-17) ----
t("Darksteel Mutation: 0/1 Insect artifact creature, indestructible only; anthems and counters still apply; color stays", () => {
  ruling("Darksteel Mutation", "It also won't overwrite the effect of counters");
  const f = run(board(["Serra Angel", { counters: { "+1/+1": 1 } }], "Darksteel Mutation", "Glorious Anthem")).get("Serra Angel");
  assert.strictEqual(f.typeLine, "Artifact Creature — Insect"); assert.strictEqual(f.pt, "2/3"); assert.deepStrictEqual(abil(f), ["indestructible"]); assert.deepStrictEqual(f.colors, ["W"]);
});
t("Darksteel Mutation: keeps legendary and artifact subtypes; abilities gained later work", () => {
  ruling("Darksteel Mutation", "If it had any other artifact subtypes (such as Equipment), it will retain those");
  assert.strictEqual(run(board("Isamaru, Hound of Konda", "Darksteel Mutation")).get("Isamaru, Hound of Konda").typeLine, "Legendary Artifact Creature — Insect");
  assert.strictEqual(run(board("Lion Sash", "Darksteel Mutation")).get("Lion Sash").typeLine, "Artifact Creature — Equipment Insect");
  assert.deepStrictEqual(abil(run(board("Grizzly Bears", "Darksteel Mutation", "Flight")).get("Grizzly Bears")), ["indestructible", "flying"]);
  assert.deepStrictEqual(abil(run(board("Grizzly Bears", "Flight", "Darksteel Mutation")).get("Grizzly Bears")), ["indestructible"]);
});
t("Darksteel Mutation overwrites a characteristic-defining P/T ability", () => {
  ruling("Darksteel Mutation", "as well as any characteristic-defining abilities that define power and/or toughness");
  assert.strictEqual(run(board("Swamp", "Swamp", "Nightmare", "Darksteel Mutation")).get("Nightmare").pt, "0/1");
  assert.strictEqual(run(board("Swamp", "Swamp", "Nightmare")).get("Nightmare").pt, "2/2");
});

// ---- Inside Out (ruling of 2021-03-19) ----
t("Inside Out: a 1/2 given +2/+0 later is 2/3, not 4/1", () => {
  ruling("Inside Out", "it's a 2/3 creature, not a 4/1 creature");
  const c = mk("Creature — Human", "1/2");
  assert.strictEqual(run(board({ card: c }, "Inside Out", fx("Target creature gets +2/+0 until end of turn."))).get(c.n).pt, "2/3");
});

// ---- Mycosynth Lattice + March of the Machines (their rulings) ----
t("Lattice + March: everything is an artifact creature in either order; lands die as 0/0s", () => {
  ruling("March of the Machines", "makes them 0/0 creatures, which are put into the graveyard");
  for (const order of [["Mycosynth Lattice", "March of the Machines", "Forest"], ["March of the Machines", "Mycosynth Lattice", "Forest"]]) {
    const r = run(board(...order));
    assert.strictEqual(r.get("Mycosynth Lattice").pt, "6/6"); assert.strictEqual(r.get("March of the Machines").pt, "4/4");
    assert.strictEqual(r.get("March of the Machines").typeLine, "Artifact Enchantment Creature");
    assert.ok(!r.has("Forest") && r.sba.some((a) => a.card === "Forest" && a.rule === "704.5f"));
    assert.deepStrictEqual(r.get("Mycosynth Lattice").colors, []);
  }
  assert.strictEqual(all(board("Mycosynth Lattice", "March of the Machines", "Forest")).outcomes.length, 1);
});
t("Lattice + March: an Aura becomes a creature, falls off and goes to the graveyard", () => {
  ruling("Mycosynth Lattice", "An Aura that's also a creature can't enchant anything");
  const r = run(board("Grizzly Bears", "Rancor", "Mycosynth Lattice", "March of the Machines"));
  assert.ok(!r.has("Rancor") && r.sba.some((a) => a.card === "Rancor" && a.rule === "303.4d"));
  assert.strictEqual(r.get("Grizzly Bears").pt, "2/2");
});
t("March of the Machines: an Equipment that becomes a creature comes off; a later animation overrides March", () => {
  ruling("March of the Machines", "If it's currently attached to a creature, it becomes unattached");
  let r = run(board("Grizzly Bears", "Bonesplitter", "March of the Machines"));
  assert.strictEqual(r.get("Bonesplitter").attachedTo, null); assert.strictEqual(r.get("Bonesplitter").pt, "1/1"); assert.strictEqual(r.get("Grizzly Bears").pt, "2/2");
  ruling("March of the Machines", "Chimeric Staff will be a 5/5 artifact creature for the rest of the turn");
  const idx = FX.parseCard(by.get("Chimeric Staff")).abilities.findIndex((a) => a.kind === "activated");
  r = run(board("Chimeric Staff", "March of the Machines"));
  assert.strictEqual(r.get("Chimeric Staff").pt, "4/4");
  r = run(board("Chimeric Staff", "March of the Machines", { id: "u", use: { of: "e0", ability: idx }, x: 5 }));
  assert.strictEqual(r.get("Chimeric Staff").pt, "5/5"); assert.strictEqual(r.get("Chimeric Staff").typeLine, "Artifact Creature — Construct");
});

// ---- basic land types (305.7) ----
t("Blood Moon + Urborg: no Swamps in either order (Urborg ruling, 305.7, 613.8)", () => {
  ruling("Urborg, Tomb of Yawgmoth", "it won't turn lands into Swamps, no matter in what order those effects started to apply");
  for (const order of [["Blood Moon", "Urborg, Tomb of Yawgmoth", "Forest"], ["Urborg, Tomb of Yawgmoth", "Blood Moon", "Forest"], ["Magus of the Moon", "Urborg, Tomb of Yawgmoth", "Forest"]]) {
    const r = run(board(...order));
    assert.strictEqual(r.get("Urborg, Tomb of Yawgmoth").typeLine, "Legendary Land — Mountain");
    assert.deepStrictEqual(abil(r.get("Urborg, Tomb of Yawgmoth")), ["{t}: add {r}."]);
    assert.strictEqual(r.get("Forest").typeLine, "Basic Land — Forest");
  }
  assert.strictEqual(all(board("Urborg, Tomb of Yawgmoth", "Blood Moon", "Forest")).outcomes.length, 1);
  assert.strictEqual(run(board("Urborg, Tomb of Yawgmoth", "Forest")).get("Forest").typeLine, "Basic Land — Forest Swamp");
});
t("Magus of the Moon keeps making Mountains after it loses its abilities (ruling)", () => {
  ruling("Magus of the Moon", "If Magus of the Moon loses its abilities, it continues to turn nonbasic lands into Mountains");
  for (const order of [["Magus of the Moon", "Humility", "Command Tower"], ["Humility", "Magus of the Moon", "Command Tower"]])
    assert.strictEqual(run(board(...order)).get("Command Tower").typeLine, "Land — Mountain");
});
t("derived: Dryad of the Ilysian Grove + Blood Moon depends on timestamps (305.7, 613.7)", () => {
  // Neither effect changes what the other applies to or does, and Blood Moon does not remove the Dryad's ability, so there is
  // no dependency (613.8a) and they apply in timestamp order. Blood Moon last: only a Mountain. Dryad last: a Mountain that
  // also gets every basic land type, keeping the abilities loss from 305.7 but gaining each type's mana ability (305.6).
  let f = run(board("Dryad of the Ilysian Grove", "Blood Moon", "Command Tower")).get("Command Tower");
  assert.strictEqual(f.typeLine, "Land — Mountain"); assert.deepStrictEqual(abil(f), ["{t}: add {r}."]);
  f = run(board("Blood Moon", "Dryad of the Ilysian Grove", "Command Tower")).get("Command Tower");
  assert.deepStrictEqual(f.subtypes.slice().sort(), ["Forest", "Island", "Mountain", "Plains", "Swamp"]);
  assert.strictEqual(f.abilities.length, 5); assert.ok(!abil(f).some((a) => a.includes("any color")));
  assert.strictEqual(all(board("Blood Moon", "Dryad of the Ilysian Grove", "Command Tower")).outcomes.length, 2);
});
t("Song of the Dryads and Imprisoned in the Moon (rulings)", () => {
  ruling("Song of the Dryads", "It gains \"{T}: Add {G}\" and loses all other abilities from its rules text");
  let r = run(board("Serra Angel", "Song of the Dryads"));
  let f = r.get("Serra Angel");
  assert.strictEqual(f.typeLine, "Land — Forest"); assert.deepStrictEqual(f.colors, []); assert.deepStrictEqual(abil(f), ["{t}: add {g}."]); assert.strictEqual(f.pt, null);
  r = run(board("Isamaru, Hound of Konda", "Rancor", "Song of the Dryads"));
  assert.ok(!r.has("Rancor"), "an Aura with enchant creature falls off a land"); assert.strictEqual(r.get("Isamaru, Hound of Konda").typeLine, "Legendary Land — Forest");
  ruling("Imprisoned in the Moon", "a Plains enchanted by Imprisoned in the Moon is still a Plains, but it can't tap for {W}, only for {C}");
  f = run(board("Plains", "Imprisoned in the Moon")).get("Plains");
  assert.strictEqual(f.typeLine, "Basic Land — Plains"); assert.deepStrictEqual(abil(f), ["{t}: add {c}"]);
});
t("Frogify and Oko: card types are replaced, supertypes stay (rulings, 205.1a)", () => {
  ruling("Frogify", "loses any other card types it has (such as artifact)");
  assert.strictEqual(run(board("Ornithopter", "Frogify")).get("Ornithopter").typeLine, "Creature — Frog");
  ruling("Ensoul Artifact", "The artifact retains any types, subtypes, or supertypes it has");
  const f = run(board("Bonesplitter", "Ensoul Artifact")).get("Bonesplitter");
  assert.strictEqual(f.typeLine, "Artifact Creature — Equipment"); assert.strictEqual(f.pt, "5/5");
});

// ---- creature types ----
t("Conspiracy on a changeling: only the chosen type, but it still has changeling (Maskwood Nexus rulings, 613.3)", () => {
  ruling("Maskwood Nexus", "it will be only that new creature type. It will still have changeling");
  let f = run(board("Mirror Entity", ["Conspiracy", { chosen: { type: "Elf" } }])).get("Mirror Entity");
  assert.deepStrictEqual(f.subtypes, ["Elf"]); assert.strictEqual(f.allCreatureTypes, false); assert.ok(abil(f).includes("changeling"));
  f = run(board(["Conspiracy", { chosen: { type: "Elf" } }], "Mirror Entity")).get("Mirror Entity");
  assert.deepStrictEqual(f.subtypes, ["Elf"], "the changeling ability applies first even with the later timestamp (613.3)");
  f = run(board("Mirror Entity", ["Arcane Adaptation", { chosen: { type: "Elf" } }])).get("Mirror Entity");
  assert.strictEqual(f.allCreatureTypes, true);
  ruling("Maskwood Nexus", "it will remain all creature types, even though it will no longer have changeling");
  f = run(board("Mirror Entity", "Humility")).get("Mirror Entity");
  assert.strictEqual(f.allCreatureTypes, true); assert.strictEqual(f.abilities.length, 0);
});
t("Conspiracy without a chosen type asks for one instead of guessing", () => {
  const r = run(board("Grizzly Bears", "Conspiracy"));
  assert.deepStrictEqual(r.get("Grizzly Bears").subtypes, ["Bear"]); assert.ok(r.needs.some((n) => n.card === "Conspiracy" && n.choice === "type"));
});

// ---- lands that are creatures ----
t("Life and Limb: Forests are 1/1 green Saproling land creatures that still tap for green (rulings)", () => {
  ruling("Life and Limb", "Each Forest has the ability \"{T}: Add {G}.\"");
  const f = run(board("Life and Limb", "Forest")).get("Forest");
  assert.strictEqual(f.typeLine, "Basic Land Creature — Forest Saproling"); assert.strictEqual(f.pt, "1/1"); assert.deepStrictEqual(f.colors, ["G"]); assert.deepStrictEqual(abil(f), ["{t}: add {g}."]);
});
t("Ashaya counts itself as a land (ruling)", () => {
  ruling("Ashaya, Soul of the Wild", "it's affected by its second ability and thus its first ability counts itself");
  const r = run(board("Ashaya, Soul of the Wild", "Forest", "Forest", "Grizzly Bears"));
  assert.strictEqual(r.get("Ashaya, Soul of the Wild").pt, "4/4");
  assert.strictEqual(r.get("Grizzly Bears").typeLine, "Land Creature — Bear Forest");
});
t("derived: Life and Limb + Ashaya form a dependency loop, so timestamps decide (613.8b, 613.6)", () => {
  // Each changes what the other applies to (Ashaya makes itself a Forest; Life and Limb makes Forests creatures), which is a
  // dependency loop, so 613.8b applies them in timestamp order. Life and Limb first: its set is fixed before Ashaya is a
  // Forest (613.6), so Ashaya keeps its own P/T. Ashaya first: Ashaya is a Forest when Life and Limb applies, so it is 1/1 (7b after 7a).
  let r = run(board("Life and Limb", "Ashaya, Soul of the Wild", "Forest"));
  assert.strictEqual(r.get("Ashaya, Soul of the Wild").pt, "2/2"); assert.ok(!r.get("Ashaya, Soul of the Wild").subtypes.includes("Saproling"));
  assert.ok(r.log.some((e) => e.rule === "613.8b"));
  r = run(board("Ashaya, Soul of the Wild", "Life and Limb", "Forest"));
  assert.strictEqual(r.get("Ashaya, Soul of the Wild").pt, "1/1"); assert.ok(r.get("Ashaya, Soul of the Wild").subtypes.includes("Saproling"));
  assert.strictEqual(all(board("Life and Limb", "Ashaya, Soul of the Wild", "Forest")).outcomes.length, 2);
});
t("Dryad Arbor is green without a mana cost (color indicator)", () => {
  assert.deepStrictEqual(run(board("Dryad Arbor", "Honor of the Pure")).get("Dryad Arbor").colors, ["G"]);
});

// ---- control ----
t("derived: Act of Treason with anthems: the creature gets its new controller's anthem only (613.1b before 613.4c)", () => {
  const r = run(board(["Runeclaw Bear", { controller: "opp" }], ["Glorious Anthem", { controller: "opp" }], "Honor of the Pure", "Glorious Anthem", "Act of Treason"));
  assert.strictEqual(r.get("Runeclaw Bear").controller, "you"); assert.strictEqual(r.get("Runeclaw Bear").pt, "3/3");
  const back = run(board(["Runeclaw Bear", { controller: "opp" }], ["Glorious Anthem", { controller: "opp" }], "Glorious Anthem"));
  assert.strictEqual(back.get("Runeclaw Bear").pt, "3/3"); assert.strictEqual(back.get("Runeclaw Bear").controller, "opp");
});
t("Control Magic changes control of the creature, not of its Auras (303.4e)", () => {
  const r = run(board(["Grizzly Bears", { controller: "opp" }], ["Rancor", { controller: "opp" }], "Control Magic"));
  assert.strictEqual(r.get("Grizzly Bears").controller, "you"); assert.strictEqual(r.get("Rancor").controller, "opp"); assert.strictEqual(r.get("Grizzly Bears").pt, "4/2");
});
t("Elesh Norn: your other creatures get +2/+2, the opponent's get -2/-2 and a 2/2 dies (704.5f)", () => {
  const r = run(board("Elesh Norn, Grand Cenobite", "Grizzly Bears", ["Runeclaw Bear", { controller: "opp" }], ["Serra Angel", { controller: "opp" }]));
  assert.strictEqual(r.get("Elesh Norn, Grand Cenobite").pt, "4/7"); assert.strictEqual(r.get("Grizzly Bears").pt, "4/4");
  assert.strictEqual(r.get("Serra Angel").pt, "2/2"); assert.ok(!r.has("Runeclaw Bear"));
});

// ---- copies (707) ----
t("Clone copies the printed card only: no counters, no other effects (707.2, Clone ruling)", () => {
  ruling("Clone", "It doesn't copy whether that creature is tapped or untapped, whether it has any counters on it");
  const r = run(board(["Grizzly Bears", { counters: { "+1/+1": 3 } }], "Giant Growth", "Clone"));
  assert.strictEqual(r.get("Grizzly Bears").pt, "8/8");
  const c = r.get("Clone");
  assert.strictEqual(c.name, "Grizzly Bears"); assert.strictEqual(c.pt, "2/2"); assert.strictEqual(c.typeLine, "Creature — Bear"); assert.deepStrictEqual(c.colors, ["G"]);
});
t("707.2 ex: Clone of an animated Chimeric Staff is just an artifact", () => {
  example("707.2", "The Clone is an artifact, not a 5/5 Construct artifact creature");
  const idx = FX.parseCard(by.get("Chimeric Staff")).abilities.findIndex((a) => a.kind === "activated");
  const r = run(board("Chimeric Staff", { id: "u", use: { of: "e0", ability: idx }, x: 5 }, ["Clone", { copy: "e0" }]));
  assert.strictEqual(r.get("Chimeric Staff").pt, "5/5"); assert.strictEqual(r.get("Clone").typeLine, "Artifact"); assert.strictEqual(r.get("Clone").pt, null);
});
t("707.2 ex: Clone of a face-down creature is a colorless 2/2 with nothing else", () => {
  example("707.2", "The Clone is a colorless 2/2 creature with no name, no types, no abilities, and no mana cost");
  const r = run(board(["Grinning Demon", { faceDown: true }], "Glorious Anthem", "Clone"));
  const c = r.get("Clone");
  assert.strictEqual(c.pt, "3/3"); assert.strictEqual(c.typeLine, "Creature"); assert.deepStrictEqual(c.colors, []); assert.strictEqual(c.abilities.length, 0);
  assert.strictEqual(r.get("Grinning Demon").pt, "3/3");
});
t("707.3 ex: Vesuvan Doppelganger copies Runeclaw Bear but stays blue; a Clone of it is a blue Bear with the upkeep ability", () => {
  example("707.3", "The Clone is a 2/2 blue Bear named Runeclaw Bear that has the Doppelganger’s upkeep-triggered ability");
  const r = run(board("Runeclaw Bear", "Vesuvan Doppelganger", ["Clone", { copy: "e1" }]));
  for (const n of ["Vesuvan Doppelganger", "Clone"]) {
    const f = r.get(n);
    assert.strictEqual(f.name, "Runeclaw Bear"); assert.strictEqual(f.pt, "2/2"); assert.deepStrictEqual(f.colors, ["U"]); assert.strictEqual(f.typeLine, "Creature — Bear");
    assert.ok(f.abilities.some((a) => /At the beginning of your upkeep/.test(a.text)));
  }
});
t("707.9b ex: Copy Artifact copying an artifact creature is an artifact enchantment creature", () => {
  example("707.9b", "its types are now artifact, creature, and enchantment");
  const f = run(board("Ornithopter", "Copy Artifact")).get("Copy Artifact");
  assert.deepStrictEqual(f.types, ["Artifact", "Enchantment", "Creature"]); assert.strictEqual(f.pt, "0/2"); assert.deepStrictEqual(f.colors, []);
});
t("707.9d ex: Quicksilver Gargantuan copying a creature with a P/T-defining ability is 7/7 without that ability", () => {
  example("707.9d", "Quicksilver Gargantuan does not have that ability. It will be 7/7");
  const f = run(board("Swamp", "Nightmare", "Quicksilver Gargantuan")).get("Quicksilver Gargantuan");
  assert.strictEqual(f.pt, "7/7"); assert.strictEqual(f.name, "Nightmare"); assert.ok(!f.abilities.some((a) => /power and toughness are each equal/.test(a.text))); assert.ok(abil(f).includes("flying"));
});
t("707.9d ex: Glasspool Mimic copying a changeling keeps changeling and every creature type", () => {
  example("707.9d", "Glasspool Mimic will have changeling and will have all creature types");
  const f = run(board("Chameleon Colossus", "Glasspool Mimic")).get("Glasspool Mimic");
  assert.strictEqual(f.allCreatureTypes, true); assert.ok(abil(f).includes("changeling")); assert.ok(f.subtypes.includes("Rogue")); assert.strictEqual(f.pt, "4/4");
});
t("Clone that copies nothing is a 0/0 and dies (Clone ruling, 704.5f)", () => {
  ruling("Clone", "Clone enters as a 0/0 Shapeshifter creature, and is probably put into the graveyard immediately");
  const r = run(board("Grizzly Bears", ["Clone", { copy: "none" }]));
  assert.ok(!r.has("Clone") && r.sba.some((a) => a.card === "Clone"));
});

// ---- other rulings ----
t("Kudo, King Among Bears: a crewed Vehicle is a 2/2 Bear (ruling)", () => {
  ruling("Kudo, King Among Bears", "a Vehicle will be a 2/2 creature once crewed");
  let r = run(board("Kudo, King Among Bears", "Smuggler's Copter"));
  assert.strictEqual(r.get("Smuggler's Copter").pt, null);
  r = run(board("Kudo, King Among Bears", "Smuggler's Copter", { id: "c", use: { of: "e1", crew: true } }));
  assert.strictEqual(r.get("Smuggler's Copter").pt, "2/2"); assert.strictEqual(r.get("Smuggler's Copter").typeLine, "Artifact Creature — Vehicle Bear");
  assert.strictEqual(run(board("Smuggler's Copter", { id: "c", use: { of: "e0", crew: true } })).get("Smuggler's Copter").pt, "3/3");
});
t("Mirror Entity X=0 makes your creatures 0/0, and counters still apply (rulings)", () => {
  ruling("Mirror Entity", "Activating the ability with X = 0 will cause all creatures you control to become 0/0");
  const idx = FX.parseCard(by.get("Mirror Entity")).abilities.findIndex((a) => a.kind === "activated");
  const r = run(board("Mirror Entity", ["Grizzly Bears", { counters: { "+1/+1": 1 } }], ["Runeclaw Bear", { controller: "opp" }], { id: "u", use: { of: "e0", ability: idx }, x: 0 }));
  assert.ok(!r.has("Mirror Entity")); assert.strictEqual(r.get("Grizzly Bears").pt, "1/1"); assert.strictEqual(r.get("Grizzly Bears").allCreatureTypes, true); assert.strictEqual(r.get("Runeclaw Bear").pt, "2/2");
});
t("Painter's Servant adds a color, which Honor of the Pure then sees (613.9 second example pattern)", () => {
  const r = run(board("Walking Corpse", ["Painter's Servant", { chosen: { color: "W" } }], "Honor of the Pure"));
  assert.deepStrictEqual(r.get("Walking Corpse").colors, ["W", "B"]); assert.strictEqual(r.get("Walking Corpse").pt, "3/3"); assert.strictEqual(r.get("Painter's Servant").pt, "2/4");
});
t("\"can't have or gain flying\" beats a later grant (113.11)", () => {
  const r = run(board("Archetype of Imagination", ["Serra Angel", { controller: "opp" }], ["Flight", { controller: "opp" }], "Grizzly Bears"));
  assert.ok(!abil(r.get("Serra Angel")).includes("flying")); assert.ok(abil(r.get("Grizzly Bears")).includes("flying"));
});
t("opposite counters cancel as a state-based action (704.5q)", () => {
  const r = run(board(["Grizzly Bears", { counters: { "+1/+1": 3, "-1/-1": 1 } }]));
  assert.strictEqual(r.get("Grizzly Bears").pt, "4/4"); assert.strictEqual(r.get("Grizzly Bears").counters["+1/+1"], 2);
});

// ---- honesty: unmodeled text is reported, never guessed ----
t("an effect the reader can't model is listed as not modeled", () => {
  const odd = mk("Enchantment", null, "Creatures you control that are enchanted get +1/+1 and have ward {2} as long as it's raining.");
  const r = run(board("Grizzly Bears", { card: odd }));
  assert.strictEqual(r.get("Grizzly Bears").pt, "2/2"); assert.ok(r.unmodeled.some((u) => u.card === odd.n));
});
t("a condition the board can't see is off until the user turns it on", () => {
  const c = mk("Enchantment", null, "As long as it's your turn, creatures you control get +1/+1.");
  let r = run(board("Grizzly Bears", { card: c }));
  assert.strictEqual(r.get("Grizzly Bears").pt, "2/2"); assert.strictEqual(r.conditions.length, 1);
  r = run(board("Grizzly Bears", { card: c }), { assume: { [r.conditions[0].key]: true } });
  assert.strictEqual(r.get("Grizzly Bears").pt, "3/3");
});
t("a P/T that depends on something off the board shows as unknown, not a number", () => {
  const f = run(board("Tarmogoyf")).get("Tarmogoyf");
  assert.strictEqual(f.pt, "?/?"); assert.ok(f.unknownPT.length);
  assert.strictEqual(run(board("Tarmogoyf"), { values: { e0: 3 } }).get("Tarmogoyf").pt, "3/4");
});

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
