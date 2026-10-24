# MTGSME

Pocket Commander rules judge and deck-building tools: Comprehensive Rules, card text and rulings.

## What's here

| Path | What it is |
| --- | --- |
| `rules_CR.txt` | Magic: The Gathering Comprehensive Rules (effective September 25, 2026) |
| `cards_lean/` | Card text for about 34,000 cards, one file per first letter (9 MB total). No rulings. |
| `cards_with_rulings/` | Same cards with their official rulings under each card (28 MB total) |
| `tools/build_cards.py` | Script that rebuilds the card files from the mtg.wtf data |
| `combos/` | Commander Spellbook combos, one file per color identity (built by `tools/build_combos.py`) |
| `tools/build_combos.py` | Script that downloads Commander Spellbook's combo list and writes the combo files |
| `tools/check_deck.py` | Combo checker: lists the combos a decklist has and the ones it is one card away from |

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

## Combo checker

Combo data comes from Commander Spellbook (https://commanderspellbook.com, code at https://github.com/SpaceCowMedia/commander-spellbook-backend).
Build the combo files (downloads `https://json.commanderspellbook.com/variants.json.gz` unless you pass a local copy):

```
python3 tools/build_combos.py [variants.json.gz] [combos]
```

Each combo looks like:

```
## Combo 1234-5678
Cards: Card A + Card B
Color identity: UB | Bracket: Ruthless | Popularity: 50000 | Commander: legal | Mana needed: {U}{B}
Produces: Win the game
Requires: generic pieces the combo also needs, e.g. a sacrifice outlet (battlefield)
Start: where each card has to be when the combo starts
Prerequisites: what has to be true first
Steps: how to do it
```

Check a decklist (one card per line, `1 Sol Ring` or `1x Sol Ring (CMR) 263` both work):

```
python3 tools/check_deck.py my_deck.txt [--identity UB] [--near 20]
```

It prints the combos already in the deck and the cards that would each complete a combo, limited to the deck's color identity.
The color identity is worked out from `cards_lean/`. Names it doesn't recognise are listed, so you can catch typos.
"Requires" lines are generic pieces the checker can't confirm on its own, so check those yourself.
