# MTGSME

Pocket Commander rules judge and deck-building tools: Comprehensive Rules, card text, rulings and known combos.

## What's here

| Path | What it is |
| --- | --- |
| `rules_CR.txt` | Magic: The Gathering Comprehensive Rules (effective September 25, 2026) |
| `cards_lean/` | Card text for about 33,700 cards, one file per first letter (9 MB total). No rulings. |
| `cards_with_rulings/` | Same cards with their official rulings under each card (28 MB total) |
| `combos/` | Every known Commander combo from Commander Spellbook, with its steps, one group of files per color identity (about 123,000 combos, 122 MB total) |
| `docs/` | The MTGSME web app (search, interaction checker, decks, sets, a table-top life counter, rules). Served by GitHub Pages. |
| `tools/build_cards.py` | Script that rebuilds the text card files from the mtg.wtf data |
| `tools/build_site.py` | Script that rebuilds the web app's data files (`docs/data/`: cards, rulings, rules, sets, cards per set, precon lists) |
| `tools/build_combos.py` | Script that rebuilds the combos from Commander Spellbook's export (`combos/` and `docs/data/combos.json`) |
| `tools/build_top25.py` | Script that ranks the most valuable printings in each set, Commander deck and Secret Lair drop (`docs/data/top25.json`), and each Commander precon's total value (`docs/data/precon-prices.json`), from Scryfall's daily price file |
| `tools/build_sealed.py` | Script that compares sealed product prices (TCGplayer via TCGCSV, Card Kingdom) into `docs/data/sealed.json`; list prices are hand-entered in `tools/sealed_list.json` |
| `tools/combos.js` | Combo lookup for a deck list or for named cards, using the same code as the web app |
| `tools/layers.js` | Layer engine on the command line: what a list of cards looks like on the battlefield after rule 613, every result when arrival order matters, and `--coverage` for how much card text the effect reader understands |
| `tools/synergy.js` | Cards that work with one or more named cards (known combos, then text-found links; one card finds that card's partners), and `--measure` for how well the text-found links do on known combos |
| `tools/tests/` | `logic.js` (deck checks, commanders, combos, wording, synergy) and `layers.js` (every example under rule 613, official rulings, derived cases). Run both before pushing logic changes. |
| `tools/build_headliners.py` | Script that rebuilds `docs/data/headliners.json`: the cards Scryfall tags as headliners, with TCGplayer prices (from TCGCSV) and the hand-entered facts in `tools/headliner_facts.json` |
| `docs/data/headliner-finds.json` | Reported pulls, sales and listings of headliner cards. Hand-maintained: an entry is added only after the owner approves it in a Claude chat. |
| `docs/timeline.js`, `docs/data/precon-themes.json`, `docs/data/precon-upcoming.json` | The Precon timeline in Sets. Its counts are worked out from `precons.json` (`timeline.js`), so new precons appear on their own; the one-line deck summaries and the list of announced-but-unlisted decks are hand-maintained. |
| `tools/fetch_news.py` | Fetches the news headlines (Wizards, EDHREC, r/magicTCG) into `docs/data/news.json`. A source that fails keeps its last headlines. |
| `docs/data/events.json` | Upcoming MagicCons and championships for the home page. Hand-maintained: check dates against Wizards' announcements before editing. |
| `docs/data/announced.json` | Sets Wizards has announced that have no cards in the data yet, for the home page countdowns. Hand-maintained; an entry hides itself once a set with a matching name appears in the data, and can then be deleted. |
| `CLAUDE.md` | Judge instructions that every Claude Code session on this repo loads automatically |
| `HANDOFF.md` | Plan, the owner's decisions and verified facts for the work still to do, plus what is already built |

## Card format

```
## Card Name
Cost: {2}{g} | Type: Legendary Creature — Elf Druid | Color identity: G | P/T: 1/1 | Commander: legal | Game Changer
Text: oracle text
Ruling (2025-10-02): ruling text
```

- `Commander:` is the card's status on the Commander ban list: `legal`, `banned`, `banned_as_commander` or `banned_as_companion`.
- Multi-face cards have one entry per face, plus a `Faces:` line.
- Funny/Un-set cards, planes, schemes, vanguards, conspiracies, dungeons, contraptions, attractions and stickers are left out.
  Alchemy rebalanced cards (names starting with `A-`) and cards using Arena-only mechanics (conjure, seek, perpetually, spellbook, and similar) or Unfinity Attractions and stickers are also left out.
  This is an approximation of Commander legality, not an official legality check.

## Combo format

```
## Combo 742-1295
Cards: Demonic Consultation + Thassa's Oracle
Color identity: UB | Bracket: 4+ (Ruthless) | Popularity: 150000 | Commander: legal | Mana needed: {U}{U}{B}
Produces: Win the game; Exile your library
Requires: a generic piece the combo also needs, such as a sacrifice outlet (and where it starts)
Start: Demonic Consultation (hand); Thassa's Oracle (hand)
Prerequisites: what has to be true first
Steps: how to do it, one step per line
```

- The number after `Combo` is Commander Spellbook's id; the combo's page is `https://commanderspellbook.com/combo/<id>/`.
- `Bracket:` is Commander Spellbook's estimate of the lowest Commander bracket the combo suits. `Popularity:` is roughly how many EDHREC decks hold the combo's named cards.
- Files are named `combos_<color identity><part>.txt`; `C` is colorless. Combos stay in id order so a daily refresh changes little.
- `docs/data/combos.json` holds the same combos without the steps, for the web app and `tools/combos.js`; its `about` field explains the layout.

```
node tools/combos.js deck my_deck.txt [--steps]        # combos in a deck, and the cards that would each finish one
node tools/combos.js with "Basalt Monolith" [--steps]  # known combos that use every card named
```

## Source and rebuilding

Data comes from the open-source mtg.wtf search engine: https://github.com/taw/magic-search-engine (`index/cards.jsonl`, `index/rulings.jsonl`, `index/banlist_history.json`, `index/sets.json`, `index/deck_index.json`, `data/MagicCompRules.txt`).
Card text and rules belong to Wizards of the Coast.

```
python3 tools/build_cards.py <path-to-magic-search-engine> cards_with_rulings
python3 tools/build_cards.py <path-to-magic-search-engine> cards_lean lean
```

```
python3 tools/build_site.py <path-to-magic-search-engine>
```

Combos come from Commander Spellbook (https://commanderspellbook.com, code at https://github.com/SpaceCowMedia/commander-spellbook-backend): its bulk export `https://json.commanderspellbook.com/variants.json.gz`.
Only reviewed, working combos are kept. Nothing is replaced if the export cannot be read to the end or looks incomplete.

```
python3 tools/build_combos.py [variants.json.gz]
```

Headliners come from Scryfall's search (`is:headliner`, https://scryfall.com/docs/api) and TCGplayer prices from TCGCSV (https://tcgcsv.com). Nothing is replaced if Scryfall's answer looks incomplete, and prices that can't be fetched keep their previous values.

```
python3 tools/build_headliners.py
```

The `Refresh card data` workflow runs all of this by itself: news every 6 hours, card data when mtg.wtf changes, combos, headliners, sealed prices and the most valuable cards once a day (`python3 tools/build_top25.py [default-cards.jsonl.gz]`; sets older than 90 days are re-ranked weekly).

## The web app

Served by GitHub Pages from the `docs` folder: https://cpt-jason-burke.github.io/mtgsme/

- **Search:** name, type and text search with color identity, card type, keyword (`kw:infect`), theme (`theme:poison`), Commander legal and Game Changer filters, a separate Game Changer list (all flagged cards, by color and sort, with the ones in your deck marked), plus a keyword browser that shows each keyword's rules definition.
- **Search home page** (shown while the box is empty): a live countdown banner for each upcoming release date, including announced sets that have no cards yet (`announced.json`); the newest official previews from Scryfall, loaded on the viewer's device; a chart of cards revealed so far per upcoming set; upcoming events (`events.json`) and a link to Wizards' event locator; news tabs for Wizards, EDHREC and the community (posts that mention a leak are hidden unless switched on). Cards and printings that are not out yet are tagged Upcoming with their date.
- **Card page:** oracle text, rulings, keyword rules, wording notes, and a 3D ring of the card's paper printings (drag to turn, tap the front card to zoom; a flat swipe with Reduce Motion) plus a list of every printing with prices (non-foil, foil, etched).
- **Interact:** a card carousel and a battlefield. The chosen cards count as permanents that arrived in the order shown (reorder them, give one to the opponent, add +1/+1 or -1/-1 counters, pick what an Aura is on or what a Clone copies, switch abilities on). It shows each permanent's final types, colors, abilities, power/toughness and controller after the layer rules (CR 613: timestamps, dependency, copy effects, basic land types), the steps with rule cites, the state-based actions that follow, every other result when the arrival order matters, and a "Not modeled" list for text it does not read. Below that: trigger and replacement links, possible loops, only the wording notes that can change the answer, and "Cards that work with these" (known combos first, then text-found links). Every rule it cites is checked against the loaded Comprehensive Rules.
- **Decks:** load any Commander precon from a picker (search, filter by set, colors and year, sort by date, name or value), import a Moxfield or Archidekt text export (each card's printing and foil are kept and written back by Copy list), or build from empty. View the deck as a picture grid, rows or text, grouped by type, mana value or color and sorted by name, mana value or price, with its market value. Upgrade swaps every card for a different printing of the same card: the cheapest ("Ballin' on a budget"), the priciest ("High roller") or chosen art types (borderless, extended art, showcase, full art, retro frame, foil, etched, Secret Lair, serialized, special foils), with before and after totals; tap a card to pick its version in the ring. Deck buttons sit in the toolbar. Check it for Commander (100 cards, color identity, singleton, bans, Game Changers), see the mana curve, search within the commander's colors, and get wording-based synergy suggestions. It also lists the known combos already in the deck, and the single cards in the commander's colors that would each finish one.
- **Sets:** Magic's release history by year: every set with its symbol, date and card count, color-coded by kind (Commander decks, Secret Lair, reprint, Jumpstart). Filter by color, type, mana value and rarity; open a set for a grid of its cards; open a Commander precon or Secret Lair drop for its list and market value, and copy a precon into Decks. Set, deck and drop pages show the most valuable cards (top 10, up to 25, $5 or more; every printing and finish counts separately). Set pages also compare sealed product prices between TCGplayer and Card Kingdom, and a "Sealed deals" chip lists the products furthest under list price and with the biggest gap between stores.
- **Play:** a table-top life counter for an iPad in the middle of the table, 2 to 6 players, each panel facing its seat. Tap the top or bottom of a panel for +1 or −1, hold for 10. Commander damage tiles for each opponent (partners included), counters (poison, commander tax, energy, experience, treasure, rad, monarch, initiative, city's blessing, day/night) each linked to its rule, and a banner naming the rule when someone has lost. A chess clock: tap your clock to pass the turn, another player's to give them priority, with an optional turn limit. Dice, coin, random player, mana and storm counters, a game log, card-art backgrounds and saved player profiles. The game is saved on the device after every change and the screen stays awake; haptic taps work on iPhone with iOS 18 or later (iPads have no haptic motor).
- **Rules:** search and browse the full Comprehensive Rules, with tap-to-open rule references.
- **Headliners:** the rarest chase cards (a banner on the Search home page and a chip in Sets). Star Trek's seven signed cards come first, with signer, print run, where they're found, TCGplayer prices and reported finds; tap a card for its details and sources. The banner opens a transporter-room console: slide the bar up and the seven cards beam in (sound is off by default; with Reduce Motion on it shows the plain list instead).

Card images load from Scryfall in the viewer's browser (`docs/scry.js`), batched and cached on the device; they can be turned off in Settings. Card text never comes from Scryfall.

Files: `docs/engine.js` (trigger links and wording notes), `docs/effects.js` (reads continuous effects from oracle text), `docs/layers.js` (the layer engine), `docs/synergy.js` (cards that work with the chosen ones), `docs/deck.js` (deck parsing, checks, suggestions), `docs/combos.js` (known combos), `docs/scry.js` (images and printings), `docs/ring.js` (the printings ring), `docs/play.js` (the Play tab), `docs/trek.js` (transporter console, loaded only when opened), `docs/app.js` (interface).
The layer engine is exact for the effects it reads (about 74% of the continuous effects in the card data, 93% of always-on abilities; `node tools/layers.js --coverage`) and lists the rest as not modeled. The trigger links and text-found synergy read card text with pattern rules, so they are a fast first pass, not a judge.
