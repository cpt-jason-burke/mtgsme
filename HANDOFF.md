# Handoff: next MTGSME features

Written 2026-11-15 for a fresh Claude Code session. Read all of it before you start.

The user may run these steps on their most capable (and most expensive) model. Check facts carefully, but keep token use down (section 11).

When you finish a step, update the status table at the end of this file in the same commit.

## 1. Start here

1. Call `get_environment`. You need the **mtgsme** environment, which allows the data and price sites listed in section 4. If the session is on **Default**, move it with `switch_environment`. If that isn't possible, ask the user to start a new session and pick **mtgsme** in the environment menu.
2. Run `git pull`. A bot pushes data refreshes to `main` every 6 hours.
3. Read `CLAUDE.md` and `README.md`, then the part of section 10 for your step.
4. If the user didn't name a step, ask which (see "Next up" in section 10), then ask that step's open questions. Use AskUserQuestion with the recommended option first; the user likes that format.
5. Build, then test (section 12).
6. Commit to `main` and push; that is how the site deploys. Then watch the Actions runs with the GitHub MCP tools (`actions_list`, `get_job_logs`).
7. Tell the user in plain words what changed, how to see it on their phone, and what's next.

## 2. The user

- Not technical. They use only an iPhone or iPad (no PC) and follow the session in the Claude app. Use plain language and short updates, one step at a time.
- Their focus is Commander-legal sets and cards, Commander precons, and anything Magic from Secret Lair.
- They said "trust but verify". Check claims against primary sources, and say how sure you are.
- They watch cost. Don't waste tokens.
- The repo and the site are public. Keep personal details (location, email) out of every file. Ask for local shop names in chat when Step 4b starts.

## 3. Where things stand

Everything below is live on `main`. The site is https://cpt-jason-burke.github.io/mtgsme/ (GitHub Pages serves `docs/`).

- **App tabs:** Search (its home page has countdowns, previews, events and news), Interact, Decks, Sets, Play and Rules. Vanilla JS with no build step.
- **Combos (added 2026-11-15):** Decks lists the known combos already in a deck. Add cards lists single cards, in the commander's colors, that would each finish one.
  - `tools/build_combos.py` reads Commander Spellbook's export. It writes `docs/data/combos.json` (6.1 MB, about 1 MB gzipped) for the app, and `combos/combos_<identity><n>.txt` (67 files, about 122 MB, with steps) for the judge.
  - `docs/combos.js` does the matching (`index`, `check`, `withCards`). `tools/combos.js` is the command-line version that `CLAUDE.md` tells the judge to use.
  - The data has 122,775 combos. Eleven joke cards aren't in the card data, so 92 combos never match; that is expected.
  - Verified: 21 logic checks and 21 browser checks (phone and desktop) passed, and the GitHub rebuild produced identical files.
- **Headliners (Step 1, added 2026-11-15):** a banner on the Search home page and a "★ Headliners" chip in Sets open a sheet listing Scryfall's `is:headliner` printings (23), Star Trek's seven signed cards first. Tapping a card opens its details: signer, print run, odds, where it's found, TCGplayer prices, reported finds and sources.
  - `tools/build_headliners.py` (daily) writes `docs/data/headliners.json` from Scryfall, TCGCSV prices (matched by Scryfall's `tcgplayer_id`, else set code and number) and the hand-entered `tools/headliner_facts.json`.
  - `docs/data/headliner-finds.json` is hand-maintained and starts empty. `CLAUDE.md` tells any session how to add a find the user approves.
  - The app code is the `// ---------- headliners` block in `docs/app.js` (`ensureHL`, `hlBanner`, `hlView`, `hlCardView`) and the `/* headliners */` CSS in `docs/index.html`. This plain view is the reduced-motion fallback for Step 2.
  - Also fixed: on screens 1,000 px and wider (iPad landscape), the Search home page squeezed into a narrow column; home sections now span the full width.
- **Transporter console (Step 2, added 2026-11-15):** the home banner opens a full-screen console: slide the bar up, the seven cards beam in on the pads, then a carousel; tapping the front card opens a details panel.
  - `docs/trek.js` is self-contained (it injects its own CSS, every class starts with `tk-`) and loads only on first use. `Trek.open({cards, set, finds, onCard, onAll, onClose})` shows it; `Trek.beam(canvas, columns, opts)` is the beam effect alone, for Step 5. Sounds are generated with WebAudio and start off.
  - `openTrek()` in `docs/app.js` falls back to the plain list when Reduce Motion is on, pictures are off, or the script fails to load. The Sets chip still opens the plain list, which has an "Open the transporter room" button.
  - The private preview is a claude.ai Artifact with the card pictures embedded (Artifacts can't load outside images). The user approved it, and said the sound is fine.
  - Back gestures: opening the console adds one history step (`TREK` and `navPush({trek: 1})` in `openTrek()`), so a back swipe closes just the console; closing it by ✕, "All headliners" or "Full details" gives the step back or replaces it.
- **Most valuable (Step 3, added 2026-11-15):** set pages, Commander deck pages and Secret Lair drop pages have a "Most valuable" block: the top 10, a "Show all" button for up to 25, only cards worth $5 or more (the user's choices). Each row: rank, picture, name, set and number, finish, price (links to the Scryfall page), and a "Not Commander-legal" badge.
  - `tools/build_top25.py` (daily) streams Scryfall's `default_cards` bulk file (now gzipped JSON Lines, `jsonl_download_uri`, about 81 MB) and writes `docs/data/top25.json` (about 650 KB, 175 KB gzipped). Sets older than 90 days are re-ranked weekly, newer ones daily.
  - Finishes: in a set every finish counts separately; a Secret Lair drop lists non-foil and foil editions separately; a Commander deck uses non-foil when the printing has it.
  - The app code is `renderTop25`/`drawTop25` in `docs/app.js` and the `.t25` CSS in `docs/index.html`.
  - Known gap: mtg.wtf's Federation Fleet list (TRC) has 81 cards and no commander, so its block shows nothing over $5. About 1% of deck rows (287 of 21,724, mostly upcoming Secret Lair cards) match no Scryfall printing yet.
- **Sealed prices (Step 4, added 2026-11-15):** each set page has a "Sealed prices" block (the set's products plus its paired Commander set's; 6 shown, "Show all" adds the rest and the cases), and a "Sealed deals" chip in Sets opens a page with "Furthest under list price" and "Biggest gap between stores".
  - `tools/build_sealed.py` (daily, about 1 minute, about 165 requests) writes `docs/data/sealed.json` (about 92 KB): sets of the last two years plus every Commander deck set. TCGplayer comes from TCGCSV (a product with no "Number" field is sealed), Card Kingdom from `https://api.cardkingdom.com/api/sealed_pricelist`. Products are matched by set and normalized name, with a guarded second pass for longer names; 310 of 717 products are priced at both stores.
  - The user's choices: CoolStuff is a "Check CoolStuff" search link only (its search returns nothing to scripts, so prices would need hand-found product ids); Amazon is a search link; cases are shown.
  - List prices live in `tools/sealed_list.json`, keyed by TCGplayer product id. Only Star Trek is entered. Adding a set's prices from its Wizards "Collecting" article makes it appear under "Furthest under list price".
  - A TCGplayer lowest listing under 70% of the market price is flagged "far under recent sales; check shipping" and left out of the deals page (`slOdd` in `docs/app.js`). The app code is `ensureSealed`, `slRow`, `renderSealed`, `sealedView`; CSS `.sl`.
  - Not done: Secret Lair sealed, local shops (Step 4b), Card Kingdom singles.
- **Refresh workflow** `.github/workflows/refresh-data.yml`, cron `17 */6 * * *` (runs often start about an hour late):
  - News is fetched on every run; card data is rebuilt only when mtg.wtf changes.
  - Combos rebuild on the first run of each UTC day, and on a manual run or a push to `tools/`.
  - It commits only when something changed, as `github-actions[bot]`.
- **Logic check (2026-11-17):** a correctness pass over the rules and deck logic.
  - `docs/deck.js` now checks the commander choice (rule 903.3: legendary creature, Vehicle, Spacecraft with P/T, "can be your commander", Grist-style cards) and two-commander pairs (702.124: partner, partner—[text], partner with, Background, Doctor's companion); `canBeCommander`, `canPair`.
  - Companions (a "Companion" heading) stay outside the 100, with their own checks (banned as companion, colors, same name; 702.139a, 903.11a). Export keeps them.
  - Copy limits: "up to seven/nine" caps are enforced, and a commander also listed in the deck counts as a second copy. A back face or second half (Ice, Ormendahl) is read as its card.
  - An unmarked commander is guessed from a 1–2 card MTGO sideboard or a last block after a blank line, then the first legendary creature. The old guess counted lines, not cards, so lists with "35 Forest" got no guess. `tools/combos.js deck` guesses the same way.
  - `docs/engine.js` cited loop rules as 732.x; the current rules number them 733.x, so the cites silently vanished. It now finds them by their wording. "No may" no longer fires on "at random".
  - `tools/build_site.py` builds everything before writing and refuses data 5% smaller than last time (or rules missing 100.1/903.5a); the workflow then keeps the old card data and rules and retries next run.
- **Layer engine and synergy finder (Step 6, added 2026-11-17):** Interact now shows the chosen cards as a battlefield worked out by the layer rules.
  - `docs/effects.js` reads continuous effects from oracle text into data (who it applies to, parts by layer, condition, duration). Anything that looks like a continuous effect but doesn't parse is returned as "unmodeled". It reads the subtype lists and keyword abilities from `cr.json`, so `init(cr)` must run first (`MTGLayers.init(CR)` does it).
  - `docs/layers.js` applies rule 613: copy effects and face-down (layer 1), control, types, colors, abilities, P/T 7a–7d; CDAs first (613.3); timestamps; dependency by trying each effect on a copy of the board (613.8a), loops falling back to timestamps (613.8b), re-checked after every effect (613.8c); an effect keeps its set of objects across layers (613.6); resolved group effects are locked to what matched when they resolved (611.2c); 305.6/305.7 for basic land types; 205.1a/b for type-setting; devotion (700.5); then the state-based actions that follow (0 toughness, Auras and Equipment that can't stay attached, opposite counters), recalculating until stable. `outcomes()` tries every arrival order (up to 720; the app caps at 240) and groups them by result.
  - `buildState(entries)` turns a list of picked cards into a board: instants and sorceries become resolved effects, Auras and Equipment attach to the first legal permanent, Clone-style cards copy the first legal one, and `use` entries switch on an activated or triggered ability (or crew).
  - `tools/tests/layers.js` (61 checks): every example under rule 613 (the first check fails if the rules stop having 12, so a rules update gets a re-check), the 611.2c/611.3b/707.x examples, the rulings for Humility + Opalescence (both rulings, all orders), Turn to Frog, Darksteel Mutation, Inside Out, Mycosynth Lattice + March of the Machines, Blood Moon/Magus + Urborg, Song of the Dryads, Imprisoned in the Moon, Frogify, Conspiracy/Maskwood, Life and Limb, Ashaya, Clone, Kudo, Mirror Entity; and derived cases (Dryad of the Ilysian Grove + Blood Moon, Life and Limb + Ashaya, Act of Treason with anthems). Each test asserts that the ruling or example it relies on is still in the data.
  - Coverage (`node tools/layers.js --coverage`, 2026-11-17): 10,256 continuous effects on 9,248 cards; 73.8% read exactly, 12.1% read but needing something off the board (X, "attacking", cards in a graveyard), 14.1% not modeled. Always-on (static) abilities: 92.6% read. `--kind static` lists the unread wordings, most common first.
  - Not modeled, on purpose or not yet: text-changing effects (layer 3), soulbond, "target player controls", kicker-style "instead" clauses, effects on players, tokens (the board has none), protection, an ability gained from another effect that changes types or colors, keyword-counter timestamps (they use the permanent's). Triggers, replacement effects and combat are not simulated; the older `docs/engine.js` still finds those links by pattern.
  - Correction to the plan's wording: a ruling does cover Blood Moon + Urborg (Urborg's 2021-03-19 ruling about Magus of the Moon), so that test cites it.
  - `cards.json` gained `c` (color) on the 488 cards whose mana cost doesn't give their color (color indicators, back faces, devoid), from mtg.wtf's own color field; `tools/build_site.py` writes it.
  - Interact (`docs/app.js`, the `// ---------- interact: the battlefield` block: `boardEntries`, `boardAct`, `boardChange`, `boardHTML`, `boardOrders`; CSS `/* interact: battlefield */`): rows with ▲▼ order, Yours/Opponent's, counters, attach/target/copy pickers, creature type and color choices, "Abilities you can switch on", "Things the board can't see", then "Step by step", "If they arrived in a different order", "Not modeled". The board's choices are saved in localStorage `board`.
  - Wording notes: `MTGEngine.relevantWording` keeps only notes that can change the answer for the chosen cards (judged from the links found); the full list is folded under "All wording notes". This answers the "too literal" feedback.
  - Synergy finder: `docs/synergy.js` (`index`, `find`), the "Cards that work with these" block in Interact (`synInner`, `runSyn`) and `node tools/synergy.js`. Tiers: finishes a known combo (Commander Spellbook id and bracket), in a known combo with all the cards, possible loop, links to two or more cards, links to one. Layer link: when a chosen card turns other permanents into creatures, plain creature anthems are suggested. Each suggestion is put on the board with the chosen cards and gets a warning (or is dropped) if the layer engine says it loses its abilities there.
  - Measured (`node tools/synergy.js --measure`, 400 known three-card combos, one card hidden, seed 1): the text-reading path alone ranks the hidden card in its top 10 in 0.8% of cases (top 30: 3.3%; linked at all: 27%). With the combo list on, a listed combo's missing card is always in the first tier. So today the finder's real strength is the combo list plus layer checks; the text links are weak leads. Not tuned to the sample. The likely gain is reading costs and resources (sacrifice outlets, untap effects, mana sinks), which most combos run on and the event tags don't see.
- **Deck editor (Step 7, added 2026-11-17; the user approved the phone preview):**
  - Deck buttons (Precons, Upgrade, Copy list, Import, Clear) sit in the Decks toolbar (`#deckbar`, `renderDeckBar`), five equal buttons on a phone.
  - Precon picker (the user chose a picker page over a dropdown): sheet `precons` (`preconsView`, `renderPreconList`): search by deck, set or commander; set, year and color filters (colors mean "has all of these"; C = colorless); sort newest, oldest, name, priciest, cheapest. Tapping a deck loads it (`copyPrecon`, confirms first); "Cards ›" opens its deck page. Totals come from `docs/data/precon-prices.json`, written daily by `tools/build_top25.py` (rounded to whole dollars, written only when a total changes, kept if fewer than 90% of last time's decks).
  - Printings in decks: `deck.prints = { name: { p: "set/num", f?: "foil"|"etched" } }`, one printing per name (the first listed wins). `MTGDeck.parse` keeps Moxfield/Archidekt "(SET) 123 *F*/*E*" (returned as `prints`), `exportText` writes them back. `copyPrecon` keeps each precon card's printing. A map was used instead of `p`/`f` on each entry so commanders and companions (plain names) get printings too. Six tests in `tools/tests/logic.js`.
  - Deck views (`renderDeckCards`, settings in localStorage `deckview`): Grid (default; full pictures of the exact printing, 2 columns on a phone), Rows, Text; group by type, mana value, color identity or none; sort by name, mana value or price. A market value line sits under the stats (`loadDeckPrices`: the exact printing's price, else Scryfall's default printing).
  - Printings ring, `docs/ring.js` (`Ring.mount`): on every card page, a 3D ring of up to 24 printings with "Show all"; full pictures near the front, small ones behind. The caption shows set, number, year and prices; for a card in the deck it has "Use non-foil/foil/etched" buttons. With Reduce Motion, or fewer than 3 printings, the old flat swipe stays.
  - Upgrade sheet `upgrade` (`upgradeView`, `upPick`, `applyUpgrade`; choices in localStorage `upgrade`): "Ballin' on a budget", "High roller", "Pick art types" (only types the deck's cards have, with counts; any/all; cheapest/priciest). Shows before, after and difference, and each card's old and new printing. Tapping a card opens it; the ring's "Use" buttons then set that card's pick. "Use these N printings" saves them to the deck. Printings come from `Scry.printingsMany` (one Scryfall search per 12 names, basics by price both ways, cached on the device for a day): about 5–35 s for a 100-card deck the first time.
  - `Scry.getPrint` now matches collector numbers case-insensitively (mtg.wtf `1701d`, Scryfall `1701D`); the image cache moved to `scry-img-v3` (it now also keeps the default printing's set, number and price).
  - Scrolling: measured with Playwright at 390×844, CPU slowed 4×, scrolling the deck page for 3 s. Before: about 33 fps (p95 frame 50 ms, ~75 of ~100 frames slow). After: 60 fps in grid, rows and text (p95 16.8 ms). The cause was the drifting background fog: its animation made every blurred panel redraw each frame. The fog is now still, `.panel` has no backdrop blur (its color is a little more opaque), and long lists use `content-visibility: auto`.
- Two old branches, `add-combo-checker` and `combos-on-main`, are merged or obsolete. The last session couldn't delete them; the user can, in the GitHub app.

## 4. Environment and tools

- The **mtgsme** cloud environment (personal) allows these hosts:
  - `json.commanderspellbook.com`, `commanderspellbook.com`
  - `api.scryfall.com`, `cards.scryfall.io`, `svgs.scryfall.io`
  - `magic.wizards.com`, `tcgcsv.com`, `api.cardkingdom.com`, `www.coolstuffinc.com`
  - `data.scryfall.io` (added for Step 3)
  - package registries and MCP servers
- **Not allowed yet:**
  - `www.reddit.com`: no longer needed. The user chose not to have a bot read Reddit for finds (section 7).

  When a step needs one, propose `update_environment` with that exact host. GitHub's runners have open internet, so the workflow itself can reach both.
- WebSearch works for research. WebFetch and curl only reach allowed hosts.
- The container has Python 3.13, Node 22, and Chromium with Playwright preinstalled (`require('playwright')`, `chromium.launch()`, no install step).
- There is no `gh` CLI; use the GitHub MCP tools.
- A stop hook asks you to commit and push before a turn ends. Keep scratch files in the session scratchpad, not the repo, and delete `tools/__pycache__`.
- Logic tests live in `tools/tests/` (`node tools/tests/logic.js`: deck checks, commanders, companions, combos, engine cites, wording, synergy; `node tools/tests/layers.js`: the layer engine). They must pass before you push; add cases when you change rules logic.
- `git clone --depth 1 --filter=blob:none --no-checkout https://github.com/taw/magic-search-engine` works from the container (the workflow's own command), so `tools/build_site.py` can be run here when the build changes.

## 5. How the app is built

### `docs/index.html`
All the CSS: a dark "grimoire" theme with variables `--bg --panel --line --text --mute --ember --ember-hi --good --bad --warn`. It also holds the header toolbars `#tb-<tab>`, the tab sections `#tab-<tab>` and the bottom tab bar. The bar already has 6 tabs, so a 7th is tight on a phone.

### `docs/app.js`
About 100 KB. Don't read it whole: `grep -n`, then `sed -n 'a,bp'`.

- **Loading:** `load()` fetches `cards.json` and `cr.json`, with `DATA_V` (the built-at stamp) as a cache-buster. It then runs `initSearch`, `initInteract`, `initDecks` and `initRules`, then `loadHome()`.
- **Sheets:** `openSheet({type, ...})` uses the `VIEWS` map (`card`, `settings`, `keywords`, `set`, `sld`, `deck`, `rule`), where each entry is `[title(v), body(v)]`. `drawSheet()` draws the page. Back gestures work through `navPush`, and `saveNav`/`restoreNav` survive reloads.
- **Pictures:**
  - `hydrate(root)` fills elements that have `data-img="Card Name"` and `data-kind="art|small|normal"`.
  - `lazyPrints(root)` fills tiles that have `data-print="set/num"`.
  - `data-zoom` opens the full-screen preview (tilt and foil glare).
  - `tilt()` and `tiltFlat()` give 3D tilt.
- **Sets:** `ensureSets()` loads `sets.json`, `setcards.json` and `precons.json` into `SETS.data = {sets, setcards, precons, precBySet, byCode}`.
  - The views are `setView`, `sldView` and `deckView`.
  - `deckValue` adds up a deck's live Scryfall price, and `cardsBlock` draws the grid or list with sorting.
- **Home:** `renderHome()` draws the countdown banners (`.cdban`), previews (`.sprow`), the chart, events and news.
- **Combos:** `renderCombos()` fills `#dcombos` on the deck page and `#nearcombo` in Add cards.
- **Helpers:**
  - `esc()`: escape everything you put into HTML.
  - `mana()`, `money()`, `shortDate()`, `TODAY`, `symbol(code)`
  - `rowHTML(card, extra, why)`

### `docs/scry.js`
Talks to Scryfall from the viewer's browser.

- `Scry.get(name, cb)` gets pictures.
- `Scry.getPrint(set, num, cb)` gets an exact printing with its prices (`usd`, `usd_foil`, `usd_etched`).
- `Scry.printings(name)` lists every printing.
- It batches 75 cards per request, waits about 120 ms between calls, and caches in localStorage. Settings can turn pictures off.

### Data files in `docs/data/`
All are generated, except the two marked hand-maintained.

| File | Built by | What it holds |
| --- | --- | --- |
| `cards.json` | `tools/build_site.py` | Every card: `{n, t, ci, o, m, c, pt, ly, s, g, k, f, u}` (`c`: color, only when the mana cost doesn't give it) |
| `rulings.json`, `cr.json` | `tools/build_site.py` | Official rulings; the Comprehensive Rules |
| `sets.json` | `tools/build_site.py` | `[{c code, n name, d date, k kind, t card count, h hidden, cm paired Commander set, bs base set size}]`, where `k` is main, commander, secret, reprint, jumpstart, draft or other |
| `setcards.json` | `tools/build_site.py` | `{n, s: {set: [[cardIndex, collectorNumber, rarity]]}}`, rarity 0–5 = L C U R M S |
| `precons.json` | `tools/build_site.py` | `{n, d: [{n, y: "cmd"\|"sld", s, sn, d, cmd: [[qty, cardIndex, set, num]], main: [...]}]}`: 206 Commander decks and 786 Secret Lair drops |
| `combos.json` | `tools/build_combos.py` | Keyed by card names, so it skips `DATA_V` |
| `news.json` | `tools/fetch_news.py` | Headlines |
| `headliners.json` | `tools/build_headliners.py` | `{about, featured, checked, sets: [...facts], cards: [{key "set/num", set, num, name, date, artist, fin, tags, border, img {s,n,l,a}, scry, cmd, tcg {id, url, low, market}, sf, signer?}]}` |
| `precon-prices.json` | `tools/build_top25.py` | `{about, u, d: {"set:deck name": [total USD, lines priced, lines]}}`, Commander decks only |
| `top25.json` | `tools/build_top25.py` | `{about, src, cards, sets: {code: {u, r: [[name, num, fin n\|f\|e, usd, legal 0\|1]]}}, decks: {"set:deck name": {u, r: [[..., set]]}}}` |
| `sealed.json` | `tools/build_sealed.py` | `{about, checked, sets: {code: {n, d, p: [{n, id, low, mkt, ck: [path, price, stock], list?, case?}]}}}` |
| `headliner-finds.json` | **Hand-maintained** | `{about, finds: [{card, date, kind: pull\|sale\|listing, url, price?, note}]}` |
| `announced.json`, `events.json` | **Hand-maintained** | Announced sets, events |

- Files that point at card positions carry `n`. The app refetches them if `n` doesn't equal the number of cards.
- mtg.wtf writes collector numbers in lowercase (`1701d`); Scryfall and TCGplayer use uppercase (`1701D`). Compare them case-insensitively.

## 6. Conventions and guardrails

- **Code style:** vanilla JS modules that export to `window` or `module.exports`, Python standard library only, no frameworks, no build step, few and plain comments. Match the code around you.
- **Builders** follow the pattern in `tools/build_combos.py`:
  - Stream big inputs.
  - Validate counts and ids, and **never replace good data** when a download fails or looks incomplete.
  - Write a `.tmp` file, then `os.replace`.
  - Keep the order fixed and round numbers, so daily changes stay small.
  - If nothing changed, don't rewrite the file.
  - Print a one-line summary.
- **Workflow:**
  - Add new refresh steps before "Publish only if something changed".
  - End each with `|| echo "... failed; keeping the previous ..."`, so one broken source doesn't block the others.
  - Publish runs `git add -A`, so every file a builder writes gets committed.
- **Git:**
  - Pull first; the bot only touches generated data.
  - After local tests, commit to `main`. Never force-push.
  - End commit messages with the attribution lines your session's instructions give.
  - Never edit generated files by hand.
- **Fetching from websites:**
  - Use an identifiable User-Agent: `MTGSME/1.0 (personal Magic app; +https://github.com/cpt-jason-burke/mtgsme)`.
  - Space out requests, and respect robots.txt and each site's terms.
  - Never disguise the client as a browser; the last session's safety check refused such a request.
  - No logins, and no Amazon scraping.
- **Copyright and trademarks:**
  - Magic content falls under Wizards' Fan Content Policy (free and unofficial).
  - Star Trek belongs to Paramount. Draw original art inspired by the show: no footage, audio clips or logos.
  - Put a small "Unofficial fan app" line on the Star Trek section.
- **Layout:**
  - Design for a phone first (390 px wide), then iPad and desktop.
  - No sideways scrolling, and keep inputs at 16 px or larger so iOS doesn't zoom.
  - Respect `prefers-reduced-motion` and the safe-area insets.

## 7. The user's decisions

### Decisions of 2026-11-15

1. **Sealed products to price:** Commander precons (including Collector's Editions) plus booster products: booster packs and boxes, Collector Booster packs and boxes, bundles (including Beam Me Up), Draft Night and Scene Boxes. Not deck storage accessories.
2. **Animations:** both, the console first. The transporter console is the headliner section's entrance. The comm badge cinematic comes later as a hidden entrance. Both share one beam-in effect.
3. **Top 25:** each version counts separately; every printing and finish is its own entry.
4. **Shops:** online stores first (TCGplayer, Card Kingdom, CoolStuff). Local shops come once that works, from shop names the user gives in chat.
5. **Step 1 (decided in that session):**
   - Entry point: the home banner plus a Sets chip, not a 7th tab.
   - No bot reads Reddit for finds. Since July 2024 Reddit's robots.txt blocks bots that have no deal with Reddit, and the user chose to stay within that. Finds come only from links the user sends, so `tools/find_headliners.py` was not built.
   - Finds are approved in a Claude chat.
   - Pushing a tested step to `main` is OK.
   - The home-page news (`tools/fetch_news.py` and the app's `loadRedditHere`) keeps reading r/magicTCG: the user said to leave it while it works without issue.
   - The user confirmed on their phone that the Headliners banner is live.

### Decisions of 2026-11-17
1. **Fable for logic only.** The most capable model (Fable) does Step 6 (layers engine, synergy finder). A mid-tier model does Step 7 (deck editor screens). "I don't want to waste it on aesthetics, I want pure value on functionality/logic."
2. **Paused:** Step 4b (local shops) and Step 5 (comm badge cinematic).
3. **The layers engine matters most.** In the user's words, the app "will be useless if it can't definitively understand and predict all card interactions", using the layer rules together with the whole CR. The "said / not said" wording notes "took it a bit too literally": the goal is to understand interactions, and to suggest cards not yet listed that work with 2, 3, 4 or more chosen cards.
4. **Upgrade means fancier versions of the same cards** (alternate art, finishes, prices), never different cards. It should work for any deck list; test with precons first. Modes run from "ballin' on a budget" (cheapest versions) to "high roller" (most expensive).
5. **Deck editor:** a precon picker page (chosen over a dropdown in the Step 7 session), newest first, with filters, a full-picture grid grouped by type like Moxfield, plus row and text views, a 3D carousel of each card's printings, deck buttons always reachable at the top, and smoother scrolling.

## 8. Promises made to the user

- Headliner finds count only after review, and are labeled as an estimate, since one card can be reported twice.
- Listing prices are labeled as asking prices, not sales.
- Amazon gets a "Check Amazon" link only.
- No footage, audio or logos from the show, and sounds start off.
- The user sees a private preview of the console (a claude.ai Artifact) before it goes into the app.
- Prices exclude shipping and tax, and say so.

## 9. Verified facts

### Star Trek signed headliners (set TRK, released 2026-11-13)

| # | Card | Signed by | TCGplayer product id |
| --- | --- | --- | --- |
| 1701 | Captain James T. Kirk | William Shatner | 706185 |
| 1701D | Captain Jean-Luc Picard | Patrick Stewart | 725061 |
| 1702 | Mr. Spock, Science Officer | Ethan Peck | 725062 |
| 1703 | Lieutenant Commander Data | Brent Spiner | 725063 |
| 1704 | Captain Kathryn Janeway | Kate Mulgrew | 706184 |
| 1705 | Seven of Nine, Unassimilated | Jeri Ryan | 725064 |
| 1706 | Lt. Cmdr. Geordi La Forge | LeVar Burton | 725065 |

- **Print run:** Wizards' "Collecting Magic: The Gathering | Star Trek" (Oct 20, 2026; https://magic.wizards.com/en/news/feature/collecting-star-trek, re-checked 2026-11-15, along with the product contents and list prices below) says: "There are 7 different signed cards ... There are fewer than 250 copies of each signed card ... Signed cards can only appear in Collector Boosters of any language, but the card will always be in English." So there are fewer than 1,750 in total. No exact count is published, and the cards aren't numbered.
- **Signers:** the names come from CoolStuffInc's recap of the debut stream (Oct 20, 2026; https://www.coolstuffinc.com/a/everything-revealed-star-trek-debut-stream-pas, re-checked 2026-11-15); Wizards' articles show the cards but don't name the actors. One pre-reveal article called Spock's signer unannounced, so re-check if a Wizards source turns up.
- **Where they're found:** only Collector Boosters. The products that contain one:
  - a Collector Booster pack
  - a Collector Booster box (12 packs)
  - the **Beam Me Up Bundle** (8 Play Boosters + 1 Collector Booster)
  - **Draft Night** (12 Play Boosters + 1 Collector Booster)

  They are not in Play Boosters, the regular Bundle (9 Play Boosters), Commander decks, Scene Boxes (3 Play Boosters), Prerelease Packs (6 Play Boosters) or Welcome Decks.
- **Odds:** none published. Wizards only says "an extremely low quantity of Collector Boosters".
- **Scryfall:** the search `e:trk cn>=1700` returns the seven (promo type `headliner`, foil, borderless; no prices yet).
  - Artists: Kirk, Chris Rallis; Picard, Irvin Rodriguez; Spock, Gal Or; Data, Tyler Jacobson; Janeway, Lie Setiawan; Seven, Jack Hughes; Geordi, Tyler Jacobson.
- **TCGplayer** (via TCGCSV, 2026-11-14): only Janeway and Geordi show a price, $15,000 listings with no market price. They are asking prices, not sales.
- **List prices (Wizards):** Play Booster $6.99, Collector Booster $37.99, Commander Deck $74.99, Collector's Edition Commander Deck $159.99, Bundle $69.99, Beam Me Up Bundle $99.99, Draft Night $119.99, Scene Box $41.99.
- **Set codes:**
  - TRK: the main set.
  - TRC: the Commander decks Federation Fleet, Landing Party, Klingon Fury and We Are the Borg, each also in a Collector's Edition.
  - SDS: Stardates.
- Wizards' full card image gallery comes out Nov 30, 2026.

### Headliners in other sets
Scryfall's `is:headliner` search returns 23 printings. Prices are foil USD from Scryfall, taken 2026-11-15.

| Set | Card | Price |
| --- | --- | --- |
| INR | Edgar Markov #491 | $2,825 |
| DFT | The Aetherspark #376 | $1,875 |
| TDM | Mox Jasper #419 | $2,850 |
| FIN | Traveling Chocobo #551f | none |
| EOE | Sothera, the Supervoid #382 | $1,492 |
| SPM | The Soul Stone #242 | none |
| TLA | Avatar Aang #363 | $4,549 |
| ECL | Bitterbloom Bearer #352 | none |
| TMT | The four Turtles #301–304 | about $2,200–3,000 (Raphael none) |
| SOS | Emeritus of Ideation #306 | $2,900 |
| MSH | The Mind Stone #385 | none |
| HOB | Smaug the Magnificent #249 | $24,500 |
| FRA | Bloodline Recollector #402 | $3,100 |
| TRK | The seven signed cards | none yet |

Several of these are also `is:serialized`. There are 298 serialized printings in all, a possible later addition.

## 10. The plan

**Steps 6 and 7 are done** (section 3). Nothing new is planned yet; ask the user. Steps 4b and 5 are paused (section 7, 2026-11-17).

Follow-ups for Step 6, in order of value: grow effect coverage from `node tools/layers.js --coverage --kind static`; tokens on the board; triggers and replacement effects in the same engine (today they are pattern links); cost and resource links in the synergy finder.

Do each step in its own fresh session, then build, test, commit and verify. Cost estimates are in section 11.

### Step 1. Headliner section and tracker
**Done 2026-11-15** (section 3). The Reddit finds helper below was dropped by the user's choice (section 7, item 5).

**Goal:** a special section for chase cards. Start with the seven Star Trek signed headliners, then add every Scryfall headliner.

- **Data:** `tools/build_headliners.py`, run daily in the workflow, writes `docs/data/headliners.json`. It holds:
  - the cards from Scryfall's `is:headliner` search, paginated (name, set, number, release date, pictures, finishes, promo types, artist, prices)
  - TCGplayer prices from TCGCSV, matched on group abbreviation (= set code) and collector number, case-insensitive, with the product link. Label low or mid listing prices "asking", and `marketPrice` "recent sales" when present.
  - hand-entered facts in a small file such as `tools/headliner_facts.json`: signer, print run ("fewer than 250"), the products that can contain the card, and sources
- **Finds tracker:**
  - Keep a hand-curated `docs/data/headliner-finds.json` with `{card, date, kind: pull|sale|listing, source URL, note}`.
  - A helper, `tools/find_headliners.py`, runs in the workflow (Reddit isn't reachable from the container). It collects candidate posts into a review list that **doesn't count** until the user approves.
  - Show "reported finds (estimate; one card can be reported twice)".
  - The user can also send links; X, Instagram, TikTok and Facebook can't be read automatically.
- **Screen:** a plain section with no animation yet.
  - Its entry point is a home-page banner like `.cdban`, plus a chip in Sets.
  - Star Trek comes first. Each card shows its picture, signer, print run, where it's found, prices and finds. Tapping one opens a detail page with links.
  - This plain view stays as the reduced-motion fallback for Step 2.
- **Open questions for the user:**
  - Where the entry point goes. Recommend the home banner plus a Sets chip, not a 7th tab.
  - Which subreddits to watch. Suggest r/magicTCG and r/mtgfinance.

### Step 2. Transporter console
**Done 2026-11-15** (section 3); the text below is the original plan. The user approved the private preview, and it is live.

- **Look:** an original console drawn in SVG and CSS, inspired by the transporter room in The Next Generation: panels that light up, and a vertical slider.
- **Sequence:**
  1. The user slides the bar up.
  2. The pad lights and a beam shimmer plays (canvas particles: a few hundred at most, `requestAnimationFrame`, paused when hidden).
  3. The seven cards materialize, then appear in a carousel (reuse `.carousel`/`.mcard` and the preview's tilt and glare).
  4. Tapping a card opens an info panel built from Step 1's data.
- **Sound and motion:** sounds are generated with WebAudio (no clips) and start off. With reduced motion, skip straight to the carousel.
- **Loading:** load the code (such as `docs/trek.js`) only when the console opens.
- **Preview:** publish a private claude.ai Artifact for the user to try on their phone first, then merge it into the app.

### Step 3. Top 25 most valuable cards per set
**Done 2026-11-15** (section 3); the text below is the original plan. The user chose top 10 with "Show all", and a $5 floor.

- **Data:** `tools/build_top25.py`, run in the workflow weekly (daily for sets under 90 days old), uses Scryfall's `default_cards` bulk file.
  - Rank each set's printings by price. Each printing and finish counts separately (non-foil, foil, etched; surge foil and the like are separate printings).
  - Do the same for Secret Lair drops (precons with `y` "sld"; their rows give set and number) and Commander precons (`y` "cmd").
- **Output:** `docs/data/top25.json`, keyed by set code, drop and deck: name, number, finish, price and date. Load it only when a set, drop or deck page opens.
- **Screen:** a "Most valuable" block in `setView`, the Secret Lair drop page and `deckView`.
  - Each row shows rank, picture, name, finish, price and link.
  - Note under the block: "TCGplayer market price via Scryfall, updated ...".
  - Mark cards that aren't legal in Commander.
- **Testing:** needs `data.scryfall.io` here. Otherwise test a few sets with the search API.

### Step 4. Sealed price comparison
**Done 2026-11-15** for TCGplayer and Card Kingdom (section 3); the text below is the original plan. CoolStuff is a link only, by the user's choice.

- **Scope:** Commander precons (regular and Collector's Edition) and booster products. Start with products from about the last two years plus every Commander deck still on sale. Secret Lair sealed comes in a second pass; confirm with the user.
- **Data:** `tools/build_sealed.py`, run daily, combines:
  - TCGCSV sealed products
  - Card Kingdom's sealed list
  - CoolStuff product pages, through a hand-made map `tools/sealed_map.json` (product to TCGplayer product id, Card Kingdom id and CoolStuff id), with normalized-name matching for the rest
  - list prices from Wizards' collecting articles, entered by hand
- **Output:** `docs/data/sealed.json`. For each product: every store's price, stock and link; the lowest in-stock price; the average; the difference from list price; and when it was updated.
- **Screen:** a "Sealed prices" block on each set's page, plus a "Best prices" list (home or Sets). Say that shipping and tax aren't included, and make Amazon a search link.
- **Step 4b, local shops:**
  - Ask the user for their shops. Check each for an online store (a Shopify `products.json`, BinderPOS, a TCGplayer storefront and so on), and read its terms and robots.txt.
  - Expect most small shops to post no prices.

### Step 5. Comm badge cinematic
- **Trigger:** a small, original comm-badge-style decoration on the home page, as an Easter egg.
- **Sequence:** tapping it opens a full-screen scene.
  1. A first-person walk down a corridor; the doors part.
  2. You enter the transporter room and tell the officer at the console to "activate the transporter, seven to beam up" (the user's wording).
  3. Step 2's beam-in reveals the seven cards.
- **Extras:** a skip button, a reduced-motion fallback, and lazy loading.

### Step 6. Layers engine and synergy finder (most capable model)
**Done 2026-11-17** (section 3); the text below is the original plan.

**Why:** the user's top priority (section 7, 2026-11-17). Interact must work out what the chosen cards actually do together, through the layer system (rule 613) and the rest of the CR, and suggest cards that would work with them. Today `docs/engine.js` only tags text with regexes, and its wording notes read words too literally.

- **The honest bar:** no app without a hand-written script per card can model every card. So: exact for every effect it says it understands, a visible "not modeled" note for everything else, never a silent guess. Report coverage numbers to the user.
- **Ground truth:** expected results come only from the CR (`docs/data/cr.json`, including its examples; in 613 they sit under 613.4d, 613.5, 613.6, 613.7a and 613.9), official rulings (`docs/data/rulings.json`) and oracle text. Where none covers a case (no ruling covers Blood Moon + Urborg, for example), derive it step by step with rule cites and label it "derived". Look up every rule number; don't trust these notes or memory (the loop rules moved from 732 to 733 in the current CR).
- **Cost:** commit and push after each phase, with tests, so nothing is lost if the Fable limit runs out (section 11).

1. **Layer core,** `docs/layers.js` (pure JS for the browser and Node, no dependencies):
   - Input: permanents on the battlefield (card, controller, owner, timestamp, counters, attachments, face-down or transformed state) plus temporary effects ("until end of turn").
   - Continuous effects as data: layer and sublayer, which objects it affects (re-checked continuously, 611.3a), what it does, source, timestamp, duration, and whether it's a characteristic-defining ability.
   - Apply rule 613 in full: layer 1's sublayers (613.2), CDAs first in layers 2–6 (613.3), 7a–7d (613.4), timestamps (613.7), dependency (613.8a–c, re-evaluated after each effect; loops fall back to timestamps), effects that span layers keep the same objects (613.6), and 305.7 (setting a basic land type removes the old land types and rules-text abilities). Copy effects with their exceptions (707.2, 707.9).
   - Output for each permanent: final types, subtypes, supertypes, colors, abilities, power/toughness and controller, plus a step log ("Layer 4: …") with CR cites.
   - Tests in `tools/tests/layers.js`: every 613 example in the CR; Humility + Opalescence in both timestamp orders (rulings of 2006-02-01); Turn to Frog and Darksteel Mutation with counters and pump effects, Inside Out, Mycosynth Lattice + March of the Machines (their rulings); and derived cases: Blood Moon + Urborg, Dryad of the Ilysian Grove + Blood Moon, Conspiracy with a changeling, Life and Limb, Ashaya, Soul of the Wild, Act of Treason with an anthem. When timestamp order changes the result, show both outcomes.
2. **Reading effects from card text** (`docs/effects.js`, or inside `layers.js`):
   - Turn common static and continuous templates into effects: "[group] get(s) +X/+Y"; "have / gain / lose [ability]"; "loses all abilities"; "has base power and toughness X/Y"; "is a [color] [type] with base power and toughness X/Y"; "is a [type] in addition to its other types"; "becomes a X/Y [type] creature"; "[group] are [basic land type]" (305.7); "every basic land type"; "[group] are [color]"; "You control enchanted creature"; "enters as / becomes a copy of … except …"; switching power and toughness; changeling and other CDAs ("power and toughness are each equal to …"); "As long as …" conditions.
   - Coverage report, `node tools/layers.js --coverage`: across all cards, how many continuous effects parse and how many don't, and the most common unparsed templates. Grow coverage in order of how many cards a template covers. Anything unparsed shows as "not modeled" in the app and in the judge's output.
   - Don't copy card scripts or code from other projects (Forge, XMage and the like) without asking the user: their licenses would apply to this public repo.
3. **Interact board** (plain looks, matching the app):
   - The cards picked in Interact become permanents you control, timestamped in the order added. The user can change controller, add +1/+1 or -1/-1 counters, and reorder.
   - Show each permanent's final characteristics, the layer log, and every outcome when order matters (CLAUDE.md protocol).
   - Lead with the resolved interaction: layers, triggers, replacement effects and their order (616), loops. Keep a wording note only when it changes the answer for these cards (for example "another" only when the card's own arrival is the question). That answers the "too literal" feedback.
   - For the judge: `node tools/layers.js "Card A" "Card B" [--order …]`, added to `CLAUDE.md` (Sources and Interaction protocol).
4. **Synergy finder** ("is there a card not listed that works with these?"): for any 2 or more cards in Interact, within their combined colors or a chosen commander's.
   - Combo completion: Commander Spellbook combos that hold the chosen cards and need one more (reuse `MTGCombos.check` with the cards as a deck), with the combo id and bracket.
   - Mechanical links: cards whose triggers fire on what these cards do, whose effects feed these cards' triggers, or that make a loop with them (reuse the engine's events; `MTGDeck.suggest` does a version for decks).
   - Layer links: for example, if the cards turn lands into creatures, anthems apply; if they remove abilities, warn which suggestions stop working.
   - Rank: completes a known combo, then makes a loop, then feeds two or more of the cards, then feeds one. Each suggestion says why, with cites; heuristic ones say "possible synergy, check the card".
   - Measure it: take a sample of known 3-card combos, hide one card, and report how often the mechanical-link path alone ranks it in its top 10. Tell the user the number; don't tune to the sample.
5. **Done when** both test files pass, the coverage numbers are reported, Interact shows layer results on a phone, the judge's command works, and this file is updated.

### Step 7. Deck editor: precon picker, views, printings carousel, upgrades, scrolling (mid-tier model)
The user's request of 2026-11-17, with screenshots of Moxfield's deck page (Visual Spoiler grouped by type, a text view, a 3D ring of cards) as the model.

1. **Deck buttons always at the top:** Copy list, Import another, Clear deck and any future deck actions move from the bottom of the deck page into the Decks toolbar (`#tb-decks`, beside the Deck / Add cards switch). The user had to scroll to the very bottom to clear a deck.
2. **Precon picker** at the top of the Deck pane. "Load a precon" opens a picker sheet, which handles 206 decks on a phone better than a plain dropdown (the user asked for a dropdown; show them this first):
   - Commander decks from `precons.json`, newest first.
   - Search by deck or commander name; filter by set, color identity and year; sort by newest, oldest, name or price.
   - Price is the deck's total market value. Per-deck live totals would take thousands of Scryfall calls, so add each precon's total to a daily builder (`tools/build_top25.py` already streams Scryfall's bulk file), following section 6's builder rules.
   - Picking a deck loads it like `copyPrecon()` (confirm before replacing a deck) and keeps each card's printing.
3. **Deck views** (remember the choice):
   - Grid, the default: full card pictures grouped by type with counts (Commander, Creatures, Planeswalkers, Battles, Instants, Sorceries, Artifacts, Enchantments, Lands), 2 columns on a phone and more on wider screens, using each card's exact printing when known.
   - Rows: today's list with small art.
   - Text: quantity, name and mana cost; tapping a name opens the card.
   - Group by type (default), mana value, color or none; sort by name, mana value or price. The Check block, stats and curve stay above the cards.
4. **Card view with a 3D carousel:** tapping a card in any view opens it large, with a ring of all its paper printings (like the user's reference picture: a circle of cards seen from slightly above). Swipe turns the ring; the front card shows set, collector number, finishes and prices; tapping it opens the full-screen zoom (`zoom()`, `tilt()`).
   - Reuse `docs/trek.js`'s carousel pieces where they fit, and `Scry.printings()`.
   - Load pictures only near the front. Cap the ring (about 24) with "Show all" for cards with many printings (Sol Ring, basic lands).
   - With Reduce Motion or pictures off, keep today's flat swipe (`renderTopSwipe`).
5. **Upgrade: fancier versions of the same cards,** never different cards (section 7). It works on any deck; test with precons first.
   - Keep printings in the deck: entries get an optional `p` ("set/num") and `f` (finish). `MTGDeck.parse` must keep Moxfield and Archidekt "(SET) 123 *F*" instead of dropping it, and export writes them back so the list re-imports into Moxfield. Add tests to `tools/tests/logic.js`.
   - Printings per card come from `Scry.printings()` (one request per card, about 120 ms apart: show progress and cache) or a daily file for precon cards. Stay within Scryfall's rate guidance.
   - Art types to multi-select, from Scryfall's fields: borderless (`border_color`), extended art and showcase (`frame_effects`), full art (`full_art`), retro frame (`frame` 1993/1997), foil and etched (`finishes`), Secret Lair (set `sld`), serialized and other special foils (`promo_types`). Offer only types that exist for the deck's cards.
   - Modes: "Ballin' on a budget" (cheapest version of each card), "High roller" (most expensive), or "Pick art types" (cheapest or priciest among the chosen types). Tapping a card lets the user choose its version in the carousel.
   - Show original and upgraded printing with each price, the totals before and after, and the difference. Cards with no matching version keep theirs and say so. Prices are Scryfall's market prices and exclude shipping and tax (section 8).
6. **Scrolling lag** ("laggy at times"): measure first (Playwright at phone size, CPU throttled, a performance trace), fix, measure again, and report both numbers. Likely causes:
   - `.panel` in `docs/index.html` has `backdrop-filter: blur(12px)`, and nearly every row is a panel.
   - Behind them, the fixed `.fog` layer is blurred (`filter: blur(20px)`) and animates forever, so every blurred panel is redrawn each frame. Try solid panel backgrounds and a still fog (or pause it while scrolling).
   - Long lists: `content-visibility: auto`, and pictures that load only near the screen.
7. **Done when** everything works at 390 px and 1280 px with no sideways scroll, tests pass, and the user has approved a preview.

## 11. Cost and pace

- The user's most capable model is Fable, with a weekly limit (64% used on 2026-11-17; it resets Fridays). Spend it on Step 6's logic, and commit after each phase.
- The user may switch to their most capable model for these steps. By public price pages (not official), it costs roughly 5× the mid-tier model per token.
- Earlier estimates, one fresh session per step, each ±2×:
  - Mid-tier model: about $1–3 per step, $9–13 for all five.
  - Most capable model: about $5–15 per step, $45–65 for all five.
- Most of the cost is re-reading the conversation on every step, so keep sessions short:
  - Don't read `docs/app.js` (about 100 KB) or `docs/index.html` (about 41 KB) whole: grep, then read ranges.
  - Process big data with scripts and print only summaries.
  - Take few screenshots, and batch independent tool calls.
  - Keep large downloads in the scratchpad instead of fetching them again: the combo export is about 33 MB; Scryfall's bulk file is about 81 MB.

## 12. Testing recipe

1. Run `node tools/tests/logic.js` and `node tools/tests/layers.js`; both must pass. Run `node --check` on every JS file you touched. Run each builder twice: the second run should report no change. Then feed it a broken or truncated file and confirm it refuses to replace good data.
2. Start a local server in the background: `cd docs && python3 -m http.server 8765 --bind 127.0.0.1`.
3. Drive it with Playwright at phone size (390×844, `isMobile`, `hasTouch`) and at 1280×900:

```js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8765/index.html');
  await p.waitForFunction(() => /cards/.test(document.querySelector('#status').textContent));
  // exercise the new feature here, then the regression pass below
  console.log('sideways scroll:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'errors:', errs);
  await p.screenshot({ path: '<scratchpad>/shot.png' });
  await b.close();
})();
```

4. **Regression pass:**
   - Search: the home page, a search, and a card page with printings.
   - Interact: two cards.
   - Sets: the timeline and a set page.
   - Play: the setup screen.
   - Rules: a search.
   - Decks: import a list and check the Combos block.
   - Settings: the About text.
5. Look at a phone screenshot of every new screen. After pushing, confirm the "Refresh card data" run and the Pages deployment both finish green.

## 13. Known unknowns

- Spock's signer (Ethan Peck) comes from CoolStuffInc and community wikis, not a Wizards article.
- No exact copy counts, serial numbers or pull odds are published for the signed cards.
- Card Kingdom probably has a singles price list at `/api/pricelist`, but it hasn't been checked.
- CoolStuff's product ids have to be found by hand once; its search page returns nothing to scripts.
- The news job currently reads Reddit from GitHub's runners, but Reddit sometimes refuses cloud servers. `tools/fetch_news.py` falls back to RSS.
- Some TCGCSV products have no price rows.
- Headliner coverage depends on how Scryfall tags cards.
- mtg.wtf lists 2× Mossfire Valley in the Upgrades Unleashed precon (NEC), so the deck check flags it. Source data, not the checker.
- A split card's mana value in the deck curve uses the half that was looked up (Fire counts as 2, not 4).
- Repo size: the combo text files change a little every day. If history grows too fast, refresh the combos weekly instead.

## Status

| Step | Status | Notes |
| --- | --- | --- |
| Combos (Commander Spellbook) | Done, live 2026-11-15 | Decks tab, `tools/combos.js`, daily refresh |
| 1. Headliner section and tracker | Done, live 2026-11-15 | Home banner + Sets chip, daily `tools/build_headliners.py`, finds by hand (no Reddit bot) |
| 2. Transporter console | Done, live 2026-11-15 | `docs/trek.js`, opened by the home banner; the user approved the private preview |
| 3. Top 25 per set | Done, live 2026-11-15 | Set, deck and drop pages; daily `tools/build_top25.py`; top 10 of up to 25, $5 floor |
| 4. Sealed price comparison | Done, live 2026-11-15 | TCGplayer + Card Kingdom; CoolStuff and Amazon are links; 4b (local shops) paused by the user |
| 5. Comm badge cinematic | Paused by the user (2026-11-17) | After Step 2 |
| Logic check | Done, live 2026-11-17 | Commander, partner, companion and copy checks; loop cites; guarded card build; `tools/tests/logic.js` |
| 6. Layers engine and synergy finder | Done 2026-11-17 | `docs/effects.js`, `docs/layers.js`, `docs/synergy.js`, `tools/layers.js`, `tools/synergy.js`, `tools/tests/layers.js`; 73.8% of continuous effects read exactly, 14.1% not modeled |
| 7. Deck editor screens and upgrades | Done, live 2026-11-17 | Toolbar, precon picker, grid/rows/text views, printings ring (`docs/ring.js`), upgrades, scrolling fix (33 to 60 fps); daily `docs/data/precon-prices.json` |
