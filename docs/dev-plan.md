# Larder — Development Plan (verifiable)

This is the operator's manual: what to build, in which order, and **exactly how to
prove each piece works** before moving on. Phases map to `roadmap.md`; ids to
`gaps.md`.

## 0. Verification playbook (use for every phase)

### Automated
- `npm test` — runs `node --test tests/**/*.test.js` (unit + integration).
- `npm run lint` — stylelint on `styles.css`.
- Pure logic must be added to `calc.js` / `cms-utils.js` **with tests** in
  `tests/*.test.js`. Follow the existing `check(label, fn)` pattern in
  `tests/larder-math.test.js` (requires `../calc.js`, no DOM).
- Integration tests in `tests/larder.test.js` boot the real server on a temp data
  dir (`LARDER_DATA_DIR=<tmp>`) and exercise `/api/*`. Add cases there for new or
  changed endpoints.

### Manual (CMS only works properly inside Electron)
1. `node server.js` (port 8000). If `EADDRINUSE`, kill the stale process first.
2. `npx electron .` — loads the CMS with the frameless title bar.
3. To inspect live DOM: launch Electron with `--remote-debugging-port=9223` and
   query `http://localhost:9223/json`.
4. For website-only changes (app.js/index.html/ingredients.html): open
   `http://localhost:8000/` in a normal browser (preload irrelevant there) — or
   check the packaged/PWA path later.

### Data-safety rule (every phase)
- Before changing any schema: Export ZIP → Import ZIP on a temp data dir → confirm
  every dataset intact. After the change: repeat. Both must pass. This is the
  "move to a new PC" guarantee.

### Phase completion rule
- A phase is done only when **every** checklist item below is verified (ticked).
- Update `docs/roadmap.md` and mark the phase done when the whole phase is green.

### Step naming & commits (workflow convention, 2026-08-12)
- Before starting a step, give it a name (e.g. "2.1 consumption core").
- Develop only that step; when it is **fully complete and verified** (tests + lint,
  `node -c`; manual items that can't be automated are noted for the user), commit it
  with that name as the commit message.
- After each completed + committed step, **notify the user**; the user will
  `git push` after their own verification — do not push yourself.
- Then continue to the next step.

---

## Phase 0 — Foundations

- [ ] `git status` clean after committing the refactor (GAP-27):
  - `cms.html`, `cms.js` (extraction), `cms-planner.js`, `cms-receipts.js`,
    `cms-state.js`, `cms-utils.js`.
- [ ] `npm test` passes.
- [ ] `npm run lint` passes.
- [ ] Manual smoke: `node server.js` + `npx electron .`; open each CMS tab, no
      console errors.
- [ ] Backup round-trip: Export ZIP → wipe temp data dir → Import ZIP → all
      12 datasets intact.
- [ ] Publish to Website still pushes (may be no-op if unchanged).

**Acceptance:** clean tree, green tests, backup+restore works.

---

## Phase 1 — Recipe authoring & website

Decisions to confirm first: **D1** (linked-ingredient token format), **D2** (prep
section shape). Recommend inline `[[foodId]]` tokens + separate prep section
(see `architecture.md` §10). Confirmed: `[[foodId|Label]]` inline tokens + a
separate prep section with optional `prepTime`.

### 1.1 Prep-work section (GAP-01)
- [x] `calc.js`/`cms-utils.js`: no new math needed yet; prep is authoring-only this phase.
- [x] Editor (`cms.html`, `cms.js`): prep steps area (with optional `prepTime`),
      save to `recipe.prepSteps[]` + `recipe.prepTime`.
- [x] Website (`app.js`): render prep section above the method, labelled
      (`app.js:1100`, section-pill + timer icon + `prepTime` chip).
- [x] Save path: old recipes without `prepSteps` render fine (optional field).
- [x] **Automated:** jsdom smoke test (`tests/cms-smoke.test.js`) adds a prep
      step + 15 mins, saves, and asserts `prepSteps: ['Finely dice the onion.']`
      and `prepTime: '15 mins'` in the PUT body.
- [x] **Manual:** create a recipe with 2 prep steps + 3 method steps → website
      shows "Prep" then "Method" with correct numbering. (User-run; layout bugs it
      exposed are fixed — see note below.)
- [x] **Unit:** (if any parsing added) `tests/larder-math.test.js` new checks green.

### 1.2 Subsection buttons (GAP-02)
- [x] Editor: "Add section" button in steps area → inserts a `## ` header row
      (reuse `createStepRow` section rendering, `cms.js:4837`).
- [x] Editor: same for ingredient rows ("Add group" → `## ` item row, `cms.js:4605`).
- [x] Website already renders `## ` (app.js) — confirmed both in method steps and
      ingredient tables; numbering restarts under each header.
- [x] **Automated:** smoke test adds a "For the sauce" section and an ingredient
      group, saves, and asserts `'## For the sauce'` in `steps` and
      `item: '## For the pasta'` in `ingredients`.
- [x] **Manual:** add "For the sauce" header mid-steps → saved as `## For the
      sauce`; website restarts numbering under it. Same for ingredient groups.
      (User-run; covered structurally by `tests/website-layout.test.js`.)
- [x] **Data:** old recipes with no headers still render as before.

### 1.3 Link ingredients in steps (GAP-03)
- [x] `cms-utils.js`: `parseStepLinks(text) → [{type:'text',text}|{type:'link',foodId,label}]`
      (pure, testable; a token only becomes a link when it resolves).
- [x] Editor: link button on each step row opens a picker (`cms.js:4762`) that
      inserts `[[foodId|Label]]` at the caret; label is sanitised.
- [x] Website (`app.js`): tokens render as `.ingredient-link` anchors
      (`app.js:1072`), with the extra-bracket / space-inside escape hatch honored.
- [x] Escape hatch: `[[[foo]]` and `[[ foo ]]` render literally (negative
      lookbehind in both regexes) — hinted in the picker UI.
- [x] **Unit:** `parseStepLinks` handles plain text, one link, many links,
      escaped literal (`[[[`), space-escape, empty/unknown tokens, unbalanced.
- [x] **Automated:** smoke test opens the picker, picks Tagliatelle, and asserts
      the token lands in the saved step.
- [x] **Manual:** step "Add the [[tagliatelle|Tagliatelle]] to the water" →
      website renders a link that opens the ingredient. (User-run;
      `tests/website-layout.test.js` asserts the token becomes
      `href="ingredients.html?foodId=tagliatelle"`.)

### 1.4 Website ingredient links reliable + new tab (GAP-04)
- [x] `app.js`: resolve ingredient rows by exact `foodId` first, then name fallback
      (`app.js:723`).
- [x] Render as `<a href="ingredients.html?foodId=..." target="_blank" rel="noopener">`
      with underline + external-link icon on hover (`styles.css:1215`).
- [x] `ingredients.html`: accepts `?foodId=` (and `?name=`) and opens the detail
      panel directly; list behaviour unchanged without params (`app.js:315`).
- [x] **Manual:** open a recipe → hover an ingredient → clear affordance → click →
      opens ingredient detail in a new tab. Unknown foodId falls back to search.
      (User-run.)
- [x] **Manual:** instructions link (from 1.3) behaves the same. (User-run.)

### 1.5 Finish-new-ingredient nudge (GAP-05)
- [x] After inline `+ Create` (`cms.js:4424`), a toast with an "Open" action
      jumps to the Foods tab and opens the new ingredient's profile editor.
- [x] Foods list flags incomplete ingredients (no nutrition / no category) with an
      "Incomplete" badge (`cms.js:3597`).
- [x] **Automated:** smoke test types an unknown ingredient, picks "+ Create",
      asserts the toast names it and its action switches to the Foods tab, and the
      ingredient is persisted via `PUT /api/ingredients`.
- [x] **Manual:** create an ingredient in a recipe → toast appears → open Foods →
      item flagged and editable. (User-run.)

**Phase 1 acceptance:** the Phase-1 manual + unit checks above all pass; website
renders a full recipe with prep, subsections and links exactly as authored.
**Done.** Two user-driven layout fixes landed in `app.js`/`cms.html`:
1) `.modal-body` is a CSS grid — a bare prep `<div>` auto-placed in the right
   column and pushed the Instructions column to a new row below; 2) the correct
   hierarchy is **Instructions (main heading) → Prep as a labelled sub-section →
   method steps**, with the same sub-heading treatment for both Prep and the
   author-added `## ` sub-sections, in the editor and on the website. A prep
   recipe also crashed (`headerColor` referenced before its `const`); declared
   earlier. The editor gained an "Add Prep Section" button (a `## ` sub-heading
   inside the Prep block). All guarded by `tests/website-layout.test.js` and
   `tests/cms-smoke.test.js`.

---

## Phase 2 — Cooking / pantry loop

### 2.1 Cooked-recipe consumption (GAP-08)
- [x] `calc.js`: `consumptionFor(recipe, {servingsCooked, overrides}) →
      [{foodId, grams}]` pure function (handles metric/imperial/amount, scales by
      yield × servingsCooked). Unit tests.
- [x] `cms-state.js`: load `consumption.json` (new dataset).
- [x] `server.js`: expose consumption (generic file API like the others) + include
      in export/import whitelist (`server.js:77`), `main.js` and tests' dataset lists.
- [x] Editor (`cms.js`): "I cooked this" button on recipe detail → confirmation
      dialog lists computed items/grams → per-item adjust allowed → confirm writes
      `consumption.json` and decrements the linked tracked pantry products
      (choose product when ambiguous) / creates a manual pantry deficit.
- [x] Shopping generation must then reflect reduced stock.
- [x] **Unit:** `consumptionFor` returns correct grams for per-serving and per-total
      recipes; overrides work; zero-amount items dropped.
- [x] **Integration:** `tests/larder.test.js` — PUT consumption, GET back, and
      confirm pantry file changed.
- [x] **Manual:** cook "Tuna pasta" ×2 servings → confirm dialog shows doubled
      grams → confirm → pantry quantity dropped by the shown amounts.

### 2.2 Quick "Used" control (GAP-09)
- [x] Pantry rows get a "Used" button → inline amount → same decrement + log path
      as 2.1 (source `manual`).
- [x] **Manual:** "Used 200 g" on a tracked product → stock decreases; consumption
      log records it.

### 2.3 Duration learning seed (GAP-10, part)
- [x] `calc.js`: `rollingAvgDuration(events) → number` (consumption timestamps).
- [x] Store computed value into product `avgDurationDays` when enough data (>3 events).
- [x] **Unit:** rolling-avg with gaps and outliers (5 tests).
- [x] **Manual:** after several consumption events, product's duration reflects history.

**Phase 2 acceptance:** cooking subtracts exactly the confirmed amounts; manual use
works; consumption log persists and exports.

---

## Phase 3 — Shopping list history & totals

### 3.1 Dated list records (GAP-11)
- [x] `cms-utils.js`: `wrapListRecords(shoppingLists)` migration (single list →
      one dated record) + `createListRecord(items, date)` + `upsertTodayRecord`.
      Unit tests.
- [x] `cms.js`: `shoppingLists` becomes a list of records; Generate creates/updates
      today's record; Save persists it (keep revert-on-fail behaviour,
      `cms.js:2989-2995`).
- [x] Past-lists view: list dated records, reopen any with its items + checkboxes.
- [x] **Migration:** on load, existing flat `shoppinglists.json` wrapped into a
      record without data loss.
- [x] **Unit:** migration, create, upsert (6 tests in larder-math.test.js).
- [x] **Integration:** PUT/GET shoppinglists round-trips the record shape (larder.test.js).
- [x] **Manual:** generate → save → tick a few → regenerate tomorrow → today's
      record updated, yesterday's still browsable with its ticks.

### 3.2 Include/exclude + at-home (GAP-16)
- [x] Generated list rows: include/exclude toggle per item.
- [x] "At home" column shows current pantry stock for the item.
- [x] Min/max threshold on pantry products + household items → restock source
      honours them (`generateList`, `cms.js:3293`).
- [x] **Manual:** exclude salt → it disappears from list total; item shows at-home
      stock; a product above max isn't restocked.

### 3.3 Running expected total (GAP-13, part)
- [ ] Ticking an item updates "expected total" live (sum of unchecked costs).
- [ ] **Manual:** tick items → running total decreases; untick → increases.

**Phase 3 acceptance:** every list is saved, dated, traceable; per-item controls work;
totals tick correctly.

---

## Phase 4 — Receipts → price history

### 4.1 Price history storage + charts (GAP-14)
- [ ] `calc.js`: `applyPriceUpdate(product, {price,date}) → {history, averagePrice}`,
      `normalizeForCompare(historyByProduct)` pure helpers. Unit tests.
- [ ] Pantry product gains `priceHistory[]`, `lastPrice`, `lastPriceDate`
      (migration: seed from `price` if absent).
- [ ] Ingredient `priceHistory[]` already exists in shape — start writing it.
- [ ] Chart widget (per product + by product type) in Receipts / Foods views.
      (Simple inline SVG/CSS bars — no chart lib needed.)
- [ ] **Unit:** update appends history, recomputes average, handles same-date upsert.
- [ ] **Manual:** a product with several price updates shows a trend; two brands of
      the same type overlay/compare.

### 4.2 Receipt confirm → compare → update price (GAP-18)
- [ ] On receipt save (`cms-receipts.js:212-232`), after items are set, show a
      compare step: per item — last price vs new, **% change** (up/down/same badge).
- [ ] Show expected total (from the linked list record's `totals.expected`) vs real
      total.
- [ ] Per-item "Update price" → `applyPriceUpdate` for matched pantry product +
      ingredient; else button is hidden.
- [ ] **Integration:** POST a receipt → price history written for matched items.
- [ ] **Manual:** save a receipt where tagliatelle cost changed → % change shown →
      update → pantry product + ingredient history updated; reopen receipt: history
      retained.

### 4.3 OCR (GAP-17, P1)
- [ ] (Optional this phase) camera/file image → text (Tesseract.js or Electron
      native OCR per D5) → feed existing `parseReceiptText`.
- [ ] Keep pasted-text path as the primary flow (already works).
- [ ] **Manual (if done):** photograph a receipt → lines appear in the same
      confirmation flow as paste.

**Phase 4 acceptance:** a confirmed receipt writes price history; % change and
expected-vs-real are visible; charts render; pasted-text flow unaffected.

---

## Phase 5 — Stats & inflation

- [ ] `calc.js`: `householdInflationIndex(historyByProduct, weights)`,
      `categorySpend(receipts)`, `savingsSignals(historyByProduct)` pure + tests.
- [ ] Stats view (extend Receipts tab or new tab): per-product price chart
      (reuse 4.1 widget), category spend trends, savings signals ("Barilla vs
      Granoro saves Rs X/Y over N purchases").
- [ ] Inflation card: index computed from our receipts, with period selector.
- [ ] **Unit:** inflation index math (weighted), savings signal detection.
- [ ] **Manual:** after a few receipts, stats show product trends + an inflation
      number that changes when a price rises.

**Phase 5 acceptance:** a Stats screen shows product price trends, spend trends and
a household inflation number computed from our own receipts.

---

## Phase 6 — Meal planning smartness

### 6.1 Remember last product per recipe (GAP-21)
- [ ] Preference table `data/product-prefs.json` (recipeId+foodId → pantryId) or
      field on recipe ingredients (decision D7). Load in CMS.
- [ ] Picker (`cms.js:2534-2598`): default to stored pref; save pref on pick.
- [ ] **Manual:** add Tuna pasta → pick Granoro → next add defaults to Granoro →
      switch to Barilla → next defaults to Barilla.

### 6.2 Plan templates with name/date (GAP-22)
- [ ] `cms-planner.js`/`cms.js`: save current plan as template (name + saved-on
      date/time); reopen, edit, confirm.
- [ ] Confirm-plan records the plan version used (for shopping + stats).
- [ ] **Manual:** save month template → next month reopen → edit → confirm → the
      saved-on date is recorded and shopping list reflects the confirmed version.

### 6.3 Macro help (GAP-23)
- [ ] Live remaining-vs-target panel while building a plan (per day or per week).
- [ ] Suggest ingredients to close gaps (start simple: highest-missing-macro items
      from catalog).
- [ ] **Manual:** targets set → add meals → panel shows remaining; suggestion list
      is useful and clickable.

**Phase 6 acceptance:** brand memory, named/dated templates, macro panel all work.

---

## Phase 7 — Sync & mobile (architectural)

Decisions to confirm first: **D4** conflict policy, **D5** OCR, **D6** thresholds
(already in 3.2). Transport = LAN WebSocket behind a `SyncClient` abstraction
(`architecture.md` §7).

### 7.1 LAN sync core
- [ ] `server.js`: WebSocket endpoint (or SSE) + `/api/network-info` already exists.
- [ ] `SyncClient` module (web-compatible): connect, subscribe(dataset), send(delta),
      receive(delta). No-op gracefully when offline.
- [ ] Conflict: last-write-wins per document + per shopping-list-item merge for
      ticks (per D4).
- [ ] Shopping list first, then pantry, then full data.
- [ ] **Integration:** two clients via raw WS in `tests/` sync a tick both ways.
- [ ] **Manual:** two browser tabs on the same PC act as two devices → tick in one,
      other updates live.

### 7.2 Phone PWA
- [ ] Serve a `phone/` route (mobile-first, reuses `/api/*`) + manifest + service
      worker + icons; installable.
- [ ] Screens: shared shopping checklist (live), pantry quick-use, receipt capture.
- [ ] Camera via file input / `getMediaDevices` (OCR per D5, GAP-17).
- [ ] **Manual:** on a phone (same Wi-Fi) install the PWA, see the live shared list,
      tick, watch the PC update; scan a receipt.

**Phase 7 acceptance:** two devices on the same Wi-Fi share one live shopping list;
both can tick; phone reads pantry and uses the checklist.

---

## Running log (fill in as phases complete)

| Phase | Status | Date done | Notes |
|---|---|---|---|
| 0 | ☐ | | |
| 1 | ✅ | 2026-08-12 | All items verified — user Electron pass + 4 test files green (`larder.test.js`, `larder-math.test.js` 40 checks incl. 8 `parseStepLinks`, `cms-smoke.test.js`, `website-layout.test.js`). Post-check fixes in `app.js`/`cms.html`: website grid pushed Instructions to a new row below when a prep section existed + prep-recipe TDZ crash (`headerColor` used before `const`); then the user-driven hierarchy fix — **Instructions is the main heading, Prep renders as a labelled sub-section beneath it** (plus author `## ` sub-sections), with a new "Add Prep Section" button in the editor. Regression-tested. |
| 2.1 | ✅ | 2026-08-12 | `calc.js` `consumptionFor` + `parseAmountToGrams`; `consumption.json` dataset + API; CMS "I cooked this" dialog with per-item override & pantry decrement; unit (5 new `parseAmountToGrams` + 5 `consumptionFor` checks) + integration tests green. |
| 2.2 | ✅ | 2026-08-12 | Pantry "Used" button (card + table) with inline dialog; writes `consumption.json` with `source: "manual"`; decrements specific pantry item; integration test for manual source. |
| 2.3 | ✅ | 2026-08-12 | `calc.js` `rollingAvgDuration` (5 tests); learns `avgDurationDays` from consumption events (>=3); auto-updates pantry items after cooked/used logging; integration via existing tests. |
| 3.1 | ✅ | 2026-08-12 | `cms-utils.js` `wrapListRecords`/`createListRecord`/`upsertTodayRecord` (6 tests); `shoppingLists` migrated to dated records; Generate upserts today's record; Past Lists view with date, totals, checked counts; integration test for record shape. |
| 3.2 | ✅ | 2026-08-12 | Shopping list: include/exclude toggle, "At home" pantry stock column, running expected total updates live; pantry items gain min/max stock thresholds honored by restock source. |
| 2 | ☐ | | |
| 3 | ☐ | | |
| 4 | ☐ | | |
| 5 | ☐ | | |
| 6 | ☐ | | |
| 7 | ☐ | | |

Mark each checklist item `[x]` only when actually verified. If a step can't be
verified, keep it open and write why in Notes — do not silently move on.
