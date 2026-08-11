# Larder — Product Requirements Document (PRD)

Status: **draft v1** · Owner: SoumeetKumal · Source of truth for *what* we build.
Gap ids (`GAP-xx`) are defined in `gaps.md`; feasibility/design in `architecture.md`.

---

## 1. Overview

Larder is a personal recipe manager + kitchen/household companion. It has two faces:

1. **Public website** (static GitHub Pages) — recipes and ingredient profiles, read-only.
2. **Personal app** (Electron CMS on the PC, plus a phone client later) — pantry,
   cooking log, meal planning, shopping lists, receipts, price history, stats.

One household shares the app. The website is a curated, public-facing window onto
the same recipe/ingredient data; all *personal* data stays private on the household's
own machine.

## 2. Goals

- Make it **fast and pleasant** to record a recipe and publish it.
- Make the **daily cooking loop** (cook → update pantry) take seconds, not minutes.
- Make the **shopping trip** shared and confident: correct list, live across two
  phones, expected prices from history.
- Turn **receipts into price history**, and price history into **our own inflation**.
- Make **monthly planning** progressively easier (templates, brand memory, macro help).
- Stay **offline-first and private**; sync is additive, not required.

## 3. Non-goals (for now)

- Public accounts/login; public sharing of plans/lists.
- Native iOS/Android apps before a PWA proves the workflow.
- Nutrition database curation at scale (we curate our own ingredients).
- Multi-household (e.g. roommates) — one household, multiple devices.

## 4. Personas

- **S** — the primary user (PC + phone). Authors recipes, plans meals, maintains pantry, does the heavy editing.
- **W** — co-shopper (phone only, minimal usage). Ticks items on a shared list, scans a receipt occasionally, never edits data deeply.
- **V** — website visitor. Reads recipes and ingredients. No account.

## 5. Functional requirements

Priorities: **P0** = must ship, **P1** = should, **P2** = could.

### 5.1 Recipe authoring (P0) — GAP-01,02,03,05,07
- FR-01 Create/edit recipe: title, tagline, servings, time, category, tags, note, variations, image (URL or local), status (draft/published).
- FR-02 **Prep section** separate from method (own steps + optional own time). *NEW*
- FR-03 **Subsections** in steps and ingredients, addable from the editor. *NEW*
- FR-04 **Ingredient links inside steps** with a token syntax and editor picker. *NEW*
- FR-05 Ingredient autocomplete from catalog by name/category + inline "Create", with a clear path to finish the new ingredient's details.
- FR-06 Save (draft) and Publish (to GitHub Pages) as separate actions.
- Acceptance: a new recipe with prep + subsections + linked ingredients is fully
  rendered on the website exactly as authored.

### 5.2 Website recipe/ingredient viewing (P0) — GAP-04
- FR-07 Ingredient names in recipes are links resolved by exact `foodId`.
- FR-08 Hover shows a clear "opens in a new tab" affordance (underline + icon).
- FR-09 Clicking opens the **ingredient detail page in a new tab**; linked mentions
  in instructions behave identically.
- FR-10 Ingredient detail page shows nutrition, category, and (if present) price info.

### 5.3 Cooking / pantry (P0) — GAP-08,09
- FR-11 **"I cooked this"** on a recipe: confirmation dialog lists ingredients/grams
  to subtract; per-item adjustment allowed; confirm → pantry decrements. *NEW*
- FR-12 Manual "**Used**" control per pantry item (type amount → done). *NEW*
- FR-13 Every consumption event is logged (`consumption.log`) with date, recipe or
  manual, items, amounts.
- Acceptance: cooking a recipe reduces exactly the amounts shown in the confirmation.

### 5.4 Shopping list (P0) — GAP-11,16
- FR-14 Generate from: meal plan, tracked pantry low, household low, manual; stock is subtracted automatically.
- FR-15 **Every generated list is saved and dated**; past lists are browsable/traceable. *NEW*
- FR-16 Per-item **include/exclude** toggle and "at home" amount on the generated list. *NEW*
- FR-17 Optional **min/max thresholds** on pantry/household items for restock source. *NEW*
- FR-18 Checklist with per-item tick; running expected total. *(shared-live is GAP-12/P1)*

### 5.5 Shared live checklist (P1) — GAP-12,25,26
- FR-19 Both phones see the same list; ticks sync live; either can join mid-trip.
- FR-20 Works on home Wi-Fi (LAN) first; cloud optional later.

### 5.6 Receipts & prices (P0/P1) — GAP-14,17,18,20
- FR-21 Add receipt by **pasted text** (P0) or **camera OCR** (P1); heuristic parse into lines.
- FR-22 **Confirmation screen**: each line matched/editable; store/date/total editable.
- FR-23 On confirm: show **% change vs last price** per item and **expected (list) vs
  real total**; offer **"Update price"** per item → writes `priceHistory[]`. *NEW*
- FR-24 Receipt can add matched items to pantry stock (exists today).
- FR-25 Price history per exact pantry product and per ingredient; **comparison across
  same-type products** (Granoro vs Barilla); charts. *NEW*

### 5.7 Meal planning (P1) — GAP-21,22,23
- FR-26 Per-eater plan; macro targets; pantry-stock-aware.
- FR-27 Pick a specific pantry product for an ingredient; **remember last pick per recipe**. *NEW*
- FR-28 Plan templates saved with name + saved-on date; reopen, edit, confirm (records version used). *NEW*
- FR-29 Live remaining-vs-target macro panel + suggestions. *NEW*

### 5.8 Stats (P2) — GAP-24
- FR-30 Totals (month/day/store/category), price charts, savings signals, **household inflation index**.

### 5.9 Data & platform (P0)
- FR-31 Export/Import ZIP round-trip (works today; must keep working).
- FR-32 Publish to website (works today).
- FR-33 Phone client as a **PWA** hitting the same `server.js` over LAN (P1) *NEW*.
- FR-34 Offline-first; sync additive (P1).

## 6. Data requirements (summary — full models in architecture.md)

- Recipe gains `prepSteps`, `prepTime`, and step/ingredient "section" support and
  link tokens in step text.
- New `consumption.log` (events), shopping list becomes a **collection of dated
  list records**, `priceHistory[]` becomes live on pantry products + ingredients.
- Ingredient links resolved by `foodId` everywhere.

## 7. Constraints

- Electron + local `server.js` on port 8000; JSON file data store; GitHub Pages publish.
- CMS must be tested in Electron (preload title bar) — see AGENTS.md.
- Website is static; it can only show data committed to the website repo.
- Backup/restore must pass before any release.

## 8. Acceptance checklist (top level)

A release is shippable when:
1. `npm test` and `npm run lint` pass.
2. Export → Import on a fresh `%APPDATA%\Larder\data` restores everything (round-trip).
3. Recipe with prep + subsections + linked ingredients renders correctly on the website.
4. Cooking flow subtracts the confirmed amounts.
5. Generated lists are dated, saved, and browsable.
6. A receipt confirm updates price history and shows expected-vs-real.
7. (P1) Two devices see one live shared list over LAN.
8. (P1) Phone PWA can view pantry and use the shared checklist.
