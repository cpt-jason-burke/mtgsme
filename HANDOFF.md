# Handoff: next MTGSME features

Written 2026-11-15 for a fresh Claude Code session. Read all of it before you start.

The user may run these steps on their most capable (and most expensive) model. Check facts carefully, but keep token use down (section 11).

When you finish a step, update the status table at the end of this file in the same commit.

## 1. Start here

1. Call `get_environment`. You need the **mtgsme** environment, which allows the data and price sites listed in section 4. If the session is on **Default**, move it with `switch_environment`. If that isn't possible, ask the user to start a new session and pick **mtgsme** in the environment menu.
2. Run `git pull`. A bot pushes data refreshes to `main` every 6 hours.
3. Read `CLAUDE.md` and `README.md`, then the part of section 10 for your step.
4. Ask the user which step to do (default: Step 4, the next one not started) and that step's open questions. Use AskUserQuestion with the recommended option first; the user likes that format.
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
- **Refresh workflow** `.github/workflows/refresh-data.yml`, cron `17 */6 * * *` (runs often start about an hour late):
  - News is fetched on every run; card data is rebuilt only when mtg.wtf changes.
  - Combos rebuild on the first run of each UTC day, and on a manual run or a push to `tools/`.
  - It commits only when something changed, as `github-actions[bot]`.
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
- A stop hook asks you to commit and push before a turn ends. Keep scratch files and tests in the session scratchpad, not the repo, and delete `tools/__pycache__`.

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
| `cards.json` | `tools/build_site.py` | Every card: `{n, t, ci, o, m, pt, ly, s, g, k, f, u}` |
| `rulings.json`, `cr.json` | `tools/build_site.py` | Official rulings; the Comprehensive Rules |
| `sets.json` | `tools/build_site.py` | `[{c code, n name, d date, k kind, t card count, h hidden, cm paired Commander set, bs base set size}]`, where `k` is main, commander, secret, reprint, jumpstart, draft or other |
| `setcards.json` | `tools/build_site.py` | `{n, s: {set: [[cardIndex, collectorNumber, rarity]]}}`, rarity 0–5 = L C U R M S |
| `precons.json` | `tools/build_site.py` | `{n, d: [{n, y: "cmd"\|"sld", s, sn, d, cmd: [[qty, cardIndex, set, num]], main: [...]}]}`: 206 Commander decks and 786 Secret Lair drops |
| `combos.json` | `tools/build_combos.py` | Keyed by card names, so it skips `DATA_V` |
| `news.json` | `tools/fetch_news.py` | Headlines |
| `headliners.json` | `tools/build_headliners.py` | `{about, featured, checked, sets: [...facts], cards: [{key "set/num", set, num, name, date, artist, fin, tags, border, img {s,n,l,a}, scry, cmd, tcg {id, url, low, market}, sf, signer?}]}` |
| `top25.json` | `tools/build_top25.py` | `{about, src, cards, sets: {code: {u, r: [[name, num, fin n\|f\|e, usd, legal 0\|1]]}}, decks: {"set:deck name": {u, r: [[..., set]]}}}` |
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

## 7. The user's decisions (2026-11-15)

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

**Next up: Step 4** (sealed price comparison).

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

## 11. Cost and pace

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

1. Run `node --check` on every JS file you touched. Run each builder twice: the second run should report no change. Then feed it a broken or truncated file and confirm it refuses to replace good data.
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
- Repo size: the combo text files change a little every day. If history grows too fast, refresh the combos weekly instead.

## Status

| Step | Status | Notes |
| --- | --- | --- |
| Combos (Commander Spellbook) | Done, live 2026-11-15 | Decks tab, `tools/combos.js`, daily refresh |
| 1. Headliner section and tracker | Done, live 2026-11-15 | Home banner + Sets chip, daily `tools/build_headliners.py`, finds by hand (no Reddit bot) |
| 2. Transporter console | Done, live 2026-11-15 | `docs/trek.js`, opened by the home banner; the user approved the private preview |
| 3. Top 25 per set | Done, live 2026-11-15 | Set, deck and drop pages; daily `tools/build_top25.py`; top 10 of up to 25, $5 floor |
| 4. Sealed price comparison | Not started | 4b (local shops) after 4 works |
| 5. Comm badge cinematic | Not started | After Step 2 |
