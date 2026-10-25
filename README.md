# MTGSME

Pocket Commander rules judge and deck-building tools: Comprehensive Rules, card text and rulings.

## What's here

| Path | What it is |
| --- | --- |
| `rules_CR.txt` | Magic: The Gathering Comprehensive Rules (effective September 25, 2026) |
| `cards_lean/` | Card text for about 33,400 cards, one file per first letter (9 MB total). No rulings. |
| `cards_with_rulings/` | Same cards with their official rulings under each card (28 MB total) |
| `docs/` | The MTGSME web app (search, rules, interaction checker). Served by GitHub Pages. |
| `tools/build_cards.py` | Script that rebuilds the text card files from the mtg.wtf data |
| `tools/build_site.py` | Script that rebuilds the web app's data files (`docs/data/`: cards, rulings, rules, sets, cards per set, precon lists) |
| `CLAUDE.md` | Judge instructions that every Claude Code session on this repo loads automatically |

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

## Source and rebuilding

Data comes from the open-source mtg.wtf search engine: https://github.com/taw/magic-search-engine (`index/cards.jsonl`, `index/rulings.jsonl`, `index/banlist_history.json`, `data/MagicCompRules.txt`).
Card text and rules belong to Wizards of the Coast.

```
python3 tools/build_cards.py <path-to-magic-search-engine> cards_with_rulings
python3 tools/build_cards.py <path-to-magic-search-engine> cards_lean lean
```

```
python3 tools/build_site.py <path-to-magic-search-engine>
```

## The web app

Served by GitHub Pages from the `docs` folder: https://cpt-jason-burke.github.io/mtgsme/

- **Search:** name, type and text search with color identity, card type, keyword (`kw:infect`), theme (`theme:poison`), Commander legal and Game Changer filters, plus a keyword browser that shows each keyword's rules definition.
- **Card page:** oracle text, rulings, keyword rules, wording notes, and a carousel of every paper printing with prices (non-foil, foil, etched).
- **Interact:** a card carousel; finds which triggers and replacement effects link the cards, and reads each card's wording for what it says and does not say. Every rule it cites is checked against the loaded Comprehensive Rules.
- **Decks:** import a Moxfield or Archidekt text export (or build from empty), check it for Commander (100 cards, color identity, singleton, bans, Game Changers), see the mana curve, search within the commander's colors, and get wording-based synergy suggestions.
- **Sets:** Magic's release history by year: every set with its symbol, date and card count, color-coded by kind (Commander decks, Secret Lair, reprint, Jumpstart). Filter by color, type, mana value and rarity; open a set for a grid of its cards; open a Commander precon or Secret Lair drop for its list and market value, and copy a precon into Decks.
- **Rules:** search and browse the full Comprehensive Rules, with tap-to-open rule references.

Card images load from Scryfall in the viewer's browser (`docs/scry.js`), batched and cached on the device; they can be turned off in Settings. Card text never comes from Scryfall.

Files: `docs/engine.js` (interaction and wording engine), `docs/deck.js` (deck parsing, checks, suggestions), `docs/scry.js` (images), `docs/app.js` (interface).
The interaction checker reads card text with pattern rules, so it is a fast first pass, not a judge.
