# Larder — Gap Analysis (today vs. target)

Every work item in the roadmap references a `GAP-xx` id from this file. "Today"
column is verified against the current source (file:line refs). Effort is a
relative guide: **S** = small slice, **M** = medium, **L** = large, **A** =
architectural.

Legend — status:
- `[open]` needs building
- `[partial]` partly works, needs finishing/redoing
- `[works]` already satisfied (listed for traceability)

---

## 1. Recipe authoring & website (public)

### GAP-01 — Prep-work section in recipe editor `[open]` · S
- **User expects:** a section on top of the steps for prep/mise en place, distinct
  from the method, with its own optional time.
- **Today:** one flat `steps[]` array; single combined `time` field. No prep concept.
- **Change:** add `prepSteps[]` (and optionally `prepTime`) to the recipe schema,
  editor UI, and website rendering; include prep in the plan-cost/serving math.

### GAP-02 — Create instruction subsections from the editor `[open]` · S
- **User expects:** a button to add a subsection heading ("For the sauce") inside the steps.
- **Today:** the data model and website renderer support section headers via the
  `## ` string prefix (`app.js:1035-1051`; editor `createStepRow` at `cms.js:4723`),
  but there is **no button** to add one — headers only appear when editing data that
  already contains them (`cms.js:4744-4745`). Ingredient grouping has the same
  convention (`cms.js:4568-4590`) and the same missing button.
- **Change:** add "Add section" controls to the steps editor (and optionally the
  ingredient rows), save as `## ` entries, keep website render as-is.

### GAP-03 — Link ingredients inside instruction text `[open]` · M
- **User expects:** when writing a step I can reference an ingredient so it links to
  the ingredient profile on the website (same affordance as the ingredients table).
- **Today:** steps are plain strings; no linking, no token syntax.
- **Change:** define a token (e.g. `[[foodId]]` or `@[name]`), render linked mentions
  on the website, and add a picker in the editor. Needs an escape hatch for literal
  text and a migration for existing steps (none exist yet, so this is cheap today).

### GAP-04 — Website ingredient links: reliable + new-tab affordance `[partial]` · S
- **User expects:** ingredient names clearly indicate they open a profile, in a new tab.
- **Today:** recipe ingredients render as `.ingredient-link` buttons with a hover
  color change (`app.js:710-713`), but:
  - resolution is **fuzzy** — `recipesData.find(r => r.entryType === 'ingredient' &&
    ing.item.toLowerCase().includes(r.title.toLowerCase()))` (`app.js:710`) instead
    of the exact `foodId` already stored on the ingredient row;
  - clicks open **in the same modal** (`openModal(btn.dataset.id)`, `app.js:1168-1174`),
    not a new tab;
  - no external-link icon / underline affordance.
- **Change:** resolve by `foodId`, open a real ingredient detail page in a new tab,
  add hover affordance (underline + icon + cursor). Reuse `ingredients.html`/profile
  rendering as the detail page.

### GAP-05 — Discoverable place to edit a newly-created ingredient `[partial]` · S
- **User expects:** "somewhere this must appear for us to update the info for this"
  (nutrition, category, price) after inline-creating an ingredient.
- **Today:** inline `+ Create "name"` writes a minimal record with 0 macros
  (`cms.js:4392-4419`). Editing exists in the **Foods** tab, but nothing directs the
  user there after creation, and the created record is nutritionally empty until
  edited.
- **Change:** after inline-create, show a toast/direct link to the Foods editor;
  surface "unfinished" ingredients (zero nutrition, no category) in the Foods list.

### GAP-06 — Ingredients list & detail page on the website `[works]`
- `ingredients.html` exists; profiles render in the recipe modal. Will be promoted
  to a proper detail page as part of GAP-04.

### GAP-07 — Image from local file or URL `[works]`
- URL input + local-file picker resized to ≤1000px base64 data URL (`cms.js:4943-5010`).

---

## 2. Cooking / pantry loop (personal)

### GAP-08 — "I cooked this recipe" → confirm → auto-subtract pantry `[open]` · M
- **User expects:** open the recipe (or a "Cooked" action in the app), see a
  confirmation listing what will be subtracted, confirm, and pantry decrements.
  Bonus: adjust amounts on the confirmation ("we used half").
- **Today:** nothing. No consumption flow exists. Shopping/generation only reads stock.
- **Change:** add a consumption action on recipe + pantry; compute per-ingredient
  grams from the recipe (`metric`/`imperial`/`amount` + `yield`); subtract from the
  linked tracked pantry products (choose the product when ambiguous); record a
  `consumption` event (id, date, recipeId, items) for history and to feed
  usage-duration learning.

### GAP-09 — Quick "used X" per pantry item `[open]` · S
- **User expects:** from the pantry, a one-tap "Used" control — type an amount, done.
- **Today:** stock only editable through the full item editor (`cms.js:1199`).
- **Change:** "Used" / "+/-" buttons on pantry rows → inline amount prompt →
  decrement quantity and log a consumption event (reuse GAP-08 event shape).

### GAP-10 — Usage-duration learning for pantry products `[partial]` · M
- **User expects:** the app learns how long we take to use items (by tracking dates)
  and can estimate "runs low in N days" for the shopping list.
- **Today:** pantry items have `avgDurationDays` (static) and household items have
  `avgDurationDays` + `durationHistory[]` (`data/household.json`), and there is a
  running-low detector + depletion estimates in the Household tab (`cms.js:1433,2729`),
  but pantry `avgDurationDays` is a manual field with no history/learning.
- **Change:** record consumption timestamps (GAP-08/09), compute rolling average
  duration per product, feed the "running low soon" shopping-list source.

---

## 3. Shopping list (personal + shared)

### GAP-11 — Every generated list is saved, dated, traceable `[open]` · M
- **User expects:** each generated list persists with its date, its item state
  (incl. checkboxes), and can be revisited/traced later.
- **Today:** generating **replaces** the in-memory list and `shoppingLists = list`
  (`cms.js:3502`); Save List overwrites the single `shoppinglists.json`. No history.
- **Change:** model `shoppinglists.json` as a collection of list records
  `{ id, date, label, items[], totals }`; Generate creates a new record (or updates
  today's), Save persists it; add a "Past lists" view.

### GAP-12 — Shared live checklist across devices (wife + me) `[open]` · L/A
- **User expects:** both phones see the same list, ticking syncs live, either can
  join mid-trip.
- **Today:** single-machine files; no sync, no multi-device, no phone.
- **Change:** this is the sync + mobile work. See `architecture.md` sync strategy.
  Requires the phone app (GAP-20) plus a transport (LAN WebSocket or cloud).

### GAP-13 — Expected totals from historical prices + running total `[partial]` · M
- **User expects:** items show expected cost from historical prices for the exact
  product; a running expected total as we tick.
- **Today:** the list computes `cost` from the cheapest linked pantry product price
  or the ingredient `averagePrice` (`cms.js:3437-3472`); budget card exists; no
  running tick-total and no history-based average.
- **Change:** price history (GAP-14) feeds a per-item "expected" price; add
  tick-driven running totals per list.

### GAP-14 — Brand-vs-brand price comparison + charts `[open]` · M
- **User expects:** pick Granoro fettuccine, see its price history chart, and compare
  against Barilla/Panzani data we have.
- **Today:** `priceHistory[]` exists on a few ingredients (`data/ingredients.json:44`)
  but **nothing reads or writes it** — no UI, no charts, no update path. Pantry
  products have only a single `price` field.
- **Change:** price-history storage per pantry product and per ingredient; chart
  widget (per product + by product type); comparison view. Fed by receipts (GAP-15).

### GAP-15 — Household items in the shopping list `[works]`
- Running-low household items are added to the generated list (`cjs:3478-3495`).

### GAP-16 — Min/max thresholds + include/exclude with at-home view `[partial]` · S
- **User expects:** set minimum and maximum quantity per item, and when generating
  the end-of-month list see what's at home per item and include/exclude individually.
- **Today:** the generator lets you tick whole sources and shows pantry stock being
  subtracted automatically, but there is no per-item include/exclude toggle on the
  *generated* list and no min/max threshold concept.
- **Change:** per-item toggle + "at home" column on the generated list; optional
  min/max on pantry/household items that the restock source honours.

---

## 4. Receipts & price recording (personal)

### GAP-17 — Real OCR from a receipt photo `[open]` · L
- **User expects:** scan the receipt with the phone camera → lines extracted.
- **Today:** paste text + heuristic line parser (`calc.js:122`, `cms-receipts.js`).
  No image input, no OCR engine.
- **Change:** add an OCR step (e.g. Tesseract.js in the app/phone) that feeds the
  existing parser. Note: this is nice-to-have; pasted text already reaches the same
  confirmation screen.

### GAP-18 — Confirmation → compare → update price flow `[open]` · M
- **User expects:** after scanning/parsing, review each line, see % change vs last
  price and expected-vs-real total, then confirm "update price".
- **Today:** the receipt form shows matches (`→ name` badges) and a computed total
  (`cms-receipts.js:100-109,172-182`) but there is no expected-vs-real comparison,
  no % change, and no price-update step. Saving a receipt only stores the receipt.
- **Change:** on save, present per-item diff (last price vs new price, % change);
  per-item "update price" writes to price history (GAP-14) and pantry product price.

### GAP-19 — Receipt line → pantry stock update `[works]`
- "Add items to pantry" per receipt (`cms-receipts.js:235-251`).

### GAP-20 — Receipts → price history → stats/inflation `[works]` · M
- **User expects:** over time, per-product price trends and our own household
  inflation from what we actually buy.
- **Today:** receipts are stored but never feed price history; analytics in the
  Receipts tab are spend-level only (monthly, store, 8-week trend).
- **Change:** receipts write `priceHistory[]`; a Stats area charts per-product price,
  category price indexes, and a household-inflation number.

---

## 5. Meal planning (personal)

### GAP-21 — Remember the last chosen product per recipe `[works]` · S
- **User expects:** pick Granoro this time; next time it pre-selects Granoro; switch
  to Barilla and it remembers Barilla.
- **Today:** the planner picker lists all pantry products for an ingredient
  (`cms.js:2534-2598`) but always starts neutral — no memory of the last pick.
- **Change:** store `lastPantryId` on the recipe ingredient (or a
  recipe-ingredient→product preference table); use as default in the picker.
- **Done:** `data/product-prefs.json` (foodId → pantryId) + `GET/PUT
  /api/product-prefs`; picker saves on pick and renders the preferred product first
  with a "✓ last used" badge (Electron-verified, Barilla/De Cecco switch works).

### GAP-22 — Plan templates saved with name + date, reloadable `[works]` · M
- **User expects:** end-of-month plan saves as a template; next month reopen, edit,
  confirm; confirmation records date/month/time.
- **Today:** template chips exist (`cms.js:2233`); planner goals exist
  (`data/planner.json`). Need to verify persistence of full plan snapshots and add
  saved-on timestamp + "confirm plan" record.
- **Change:** plan snapshot save/load with metadata; confirm-plan records the plan
  version used (which then drives shopping lists & stats).
- **Done:** templates persisted to `data/planner-templates.json` with `savedOn`
  (migrated from localStorage once); "Confirm Plan" records a version snapshot
  (`data/plan-versions.json` with `confirmedAt`, counts, full plan). Electron
  manual pass complete (save → reopen → edit → confirm → saved-on recorded).

### GAP-23 — Macro-driven suggestions while building the plan `[done]` · M
- **User expects:** targets from settings (energy/macros/micros); the app helps reach
  them with suggestions.
- **Today:** macro targets + monthly goals exist; the planner cost/macro math exists.
- **Done:** live "remaining vs target" panels while building — Monthly Planner's
  "Build the ingredient list" shows month remaining vs targets (with a ≈/day hint)
  and the meal-assign modal shows per-eater "this meal vs daily targets" + a
  rest-of-today line. Suggestions close the biggest macro gaps via new pure helpers
  `macroGaps` / `macroGapSuggestions` in calc.js: the planner's chips now rank by gap
  fill (then price, cheap first) and clicked chips add the suggested amount to the
  plan; the modal's "Quick add for today's gaps" chips open the picker preloaded.

---

## 6. Stats / insights (personal)

### GAP-24 — Stats screens (patterns, savings, inflation) `[works]` · M
- **User expects:** totals, patterns, what we like, what we can save on, our own
  inflation.
- **Today:** only the Receipts analytics card (spend by month/store/week).
- **Change:** Stats tab with per-product price charts (GAP-14), category breakdowns,
  savings signals, household inflation index.

---

## 7. Sync & mobile

### GAP-25 — Multi-device sync (LAN and/or cloud) `[open]` · A
- **User expects:** phone + PC + wife's phone share live data (shopping lists at
  minimum; realistically the whole app data).
- **Today:** single machine, local JSON files. No sync.
- **Change:** transport + conflict policy + identity. See `architecture.md`.

### GAP-26 — Phone app (PWA) `[open]` · A
- **User expects:** use Larder on the phone for pantry, shopping checklist, receipts.
- **Today:** Electron-only. But the CMS is plain HTML/CSS/JS served by `server.js`,
  so a responsive **PWA** hitting the same server over LAN is the natural first
  phone client; native apps are a later option.
- **Change:** mobile-friendly CMS routes, service worker, installability, camera
  access for receipts.

---

## 8. Foundational / hygiene

### GAP-27 — Commit & validate the in-flight CMS refactor `[open]` · S
- **Today:** `git status` shows uncommitted `cms.html`, `cms.js` and untracked
  `cms-planner.js` (phase-3 extraction work). Future feature work on top of
  uncommitted churn risks conflicts and lost work.
- **Change:** run `npm test`, smoke-test in Electron, commit the refactor first
  (Phase 0), then build features.

### GAP-28 — Automated coverage for pure logic as features land `[open]` · ongoing
- **Today:** `calc.js`/`cms-utils.js` hold pure helpers with `tests/` coverage for
  parse/convert math; new features (GAP-08 subtract math, GAP-11 list records,
  GAP-14 price history) must bring their own unit tests.
- **Change:** every feature phase includes `tests/*.test.js` additions + `npm test`
  green as a done-criterion.

---

## Quick index

| Id | Area | Status | Phase |
|---|---|---|---|
| GAP-01..07 | Recipe authoring & website | 3 open / 3 partial / 1 works | 1 |
| GAP-08..10 | Cooking & pantry | 2 open / 1 partial | 2 |
| GAP-11..16 | Shopping list | 2 open / 2 partial / 1 works / 1 L | 3 (+7 for sync) |
| GAP-17..20 | Receipts & prices | 2 open / 2 works | 4 |
| GAP-21..23 | Meal planning | 2 works / 1 partial | 6 |
| GAP-24 | Stats | works | 5 |
| GAP-25..26 | Sync & mobile | open (A) | 7 |
| GAP-27..28 | Foundations | open | 0 / ongoing |

Phases come from `roadmap.md`; implementation steps live in `dev-plan.md`.
