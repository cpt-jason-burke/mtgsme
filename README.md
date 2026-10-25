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
| `tools/build_site.py` | Script that rebuilds the web app's data files (`docs/data/`) |
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

Open `docs/index.html` through a web server (it loads JSON files, so it will not work from a saved file). With GitHub Pages turned on for the `docs` folder of `main`, it is served at https://cpt-jason-burke.github.io/mtgsme/.

- **Search:** name, type and text search with color identity, Commander legal and Game Changer filters.
- **Interact:** pick cards and see which triggers and replacement effects link them. Every rule it cites is checked against the loaded Comprehensive Rules.
- **Rules:** search and browse the full Comprehensive Rules, with tap-to-open rule references.

The interaction checker (`docs/engine.js`) reads card text with pattern rules, so it is a fast first pass, not a judge.
