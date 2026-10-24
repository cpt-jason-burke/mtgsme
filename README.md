# MTGSME

Pocket Commander rules judge and deck-building tools: Comprehensive Rules, card text and rulings.

## What's here

| Path | What it is |
| --- | --- |
| `rules_CR.txt` | Magic: The Gathering Comprehensive Rules (effective September 25, 2026) |
| `cards_lean/` | Card text for about 34,000 cards, one file per first letter (9 MB total). No rulings. |
| `cards_with_rulings/` | Same cards with their official rulings under each card (28 MB total) |
| `tools/build_cards.py` | Script that rebuilds the card files from the mtg.wtf data |

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
  Alchemy rebalanced cards (names starting with `A-`) are also left out.
  This is an approximation of Commander legality, not an official legality check.

## Source and rebuilding

Data comes from the open-source mtg.wtf search engine: https://github.com/taw/magic-search-engine (`index/cards.jsonl`, `index/rulings.jsonl`, `index/banlist_history.json`, `data/MagicCompRules.txt`).
Card text and rules belong to Wizards of the Coast.

```
python3 tools/build_cards.py <path-to-magic-search-engine> cards_with_rulings
python3 tools/build_cards.py <path-to-magic-search-engine> cards_lean lean
```
