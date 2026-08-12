# Larder — Roadmap

Order is chosen so that each phase makes the app *more useful on its own* and
de-risks the next one. Only one phase is "in progress" at a time. Details and
verifiable steps for every phase are in `dev-plan.md`; gap ids in `gaps.md`.

## Phase 0 — Foundations (before any feature work)
**Goal:** a clean, committed, tested baseline so later work can't be lost.
- Commit & validate the in-flight CMS refactor (GAP-27): `cms-planner.js`,
  `cms-receipts.js`, `cms-state.js`, `cms-utils.js` extraction.
- Confirm `npm test`, `npm run lint`, and the Electron smoke test are green.
- Verify Export/Import round-trip and Publish still work.
- **Done when:** clean `git status`, all tests green, backup round-trip passes.

## Phase 1 — Recipe authoring & website (public)
**Goal:** authoring matches how we really write recipes; the website does them justice.
- GAP-01 prep section (steps + optional prep time).
- GAP-02 subsection buttons in steps and ingredients.
- GAP-03 link ingredients inside steps (decide D1: inline tokens).
- GAP-04 website links resolve by `foodId`, open ingredient detail in a new tab with
  hover affordance.
- GAP-05 nudge to finish a newly-created ingredient.
- **Done when:** a recipe with prep + subsections + linked ingredients renders
  exactly as authored on the website (manual check in `dev-plan.md`).
- **Status:** ✅ Phase 1 complete (Aug 2026). All checkboxes verified; `docs/dev-plan.md`
  log records the Electron-pass layout fix (instructions column grid placement +
  prep-recipe `headerColor` TDZ crash).

## Phase 2 — Cooking / pantry loop (personal)
**Goal:** after dinner, updating stock takes seconds.
- GAP-08 "I cooked this" → confirmation → auto-subtract (with per-item adjust).
- GAP-09 quick "Used" control per pantry item.
- GAP-13 (part) consumption log (feeds later learning).
- **Done when:** cooking a recipe subtracts the confirmed amounts; manual use works.

## Phase 3 — Shopping list history & totals
**Goal:** every list is a saved, dated, traceable artifact with reliable totals.
- GAP-11 dated list records + Past-lists view.
- GAP-16 per-item include/exclude + "at home" column + min/max thresholds.
- GAP-13 running expected total as items are ticked.
- **Done when:** generating creates a dated record, tick/untick persists, past lists
  reopen with their state.

## Phase 4 — Receipts → price history
**Goal:** receipts become price data, and price data becomes visible.
- GAP-14 price history on pantry products + ingredients + charts (pure helpers in
  `calc.js`, UI in Receipts).
- GAP-18 confirm → compare (% change) → "update price" flow; expected-vs-real total.
- GAP-17 OCR (paste-first already works; OCR is the camera bonus — P1).
- **Done when:** confirming a receipt updates price history; charts show a trend.

## Phase 5 — Stats & household inflation
**Goal:** the data we collect tells us our own story.
- GAP-24 stats screens: per-product price charts, category trends, savings signals.
- GAP-20 household inflation index from our own purchases.
- **Done when:** a Stats view shows at least: product price trend, spend trends,
  and an inflation number computed from our receipts.
- **Status:** ✅ Phase 5 complete (Aug 2026). New Stats tab ships KPI cards
  (inflation index, total spend, avg/receipt, savings found), inflation-contributor
  bars, spend-by-category bars and savings-signal rows; period selector
  (All/3m/6m/1y). Electron-verified with live receipts.

## Phase 6 — Meal planning smartness
**Goal:** monthly planning gets easier every month.
- GAP-21 remember last chosen product per recipe.
- GAP-22 plan templates saved with name/date; confirm-plan records version used.
- GAP-23 live remaining-vs-target macro panel + suggestions.
- **Done when:** re-adding a recipe pre-selects the last product; a saved plan
  reloads with edits and records its saved-on date.

## Phase 7 — Sync & mobile (architectural)
**Goal:** the household works from two phones.
- GAP-25 LAN sync: WebSocket on `server.js`, `SyncClient` abstraction, shopping list
  first (live shared checklist), then pantry, then full data.
- GAP-26 phone PWA: mobile UI, shared checklist screen, pantry quick-use, receipt camera.
- GAP-12 both phones see one live checklist; mid-trip join works.
- **Done when:** two devices on the same Wi-Fi share a live shopping list and both
  can tick it; phone can read pantry and use the list.

## After Phase 7 (backlog, no commitment)
- Cloud sync transport behind the `SyncClient` abstraction.
- Native app wrapper if the PWA proves out.
- Richer suggestions/ML for meal planning.
- Public recipe collections / sharing.

## Dependency notes
- Phase 4 depends on Phase 3 (list records hold expected totals for compare).
- Phase 5 depends on Phase 4 (inflation needs price history).
- Phase 7 is independent of 3–6 but is *built on top of* the dated-list + price
  history models, so it lands last.
- Phases 1–2 have no dependencies and could be swapped if real life calls for it.
