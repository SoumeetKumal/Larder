# Larder — Architecture & Technical Design

Status: **draft v1** · All refs are to the repo root files at the time of writing.

---

## 1. Current architecture

```
Electron shell (main.js + preload.js)
  └─ loads CMS pages (cms.html, workouts.html) over http://localhost:8000
        server.js  (Node http server, port 8000)
          ├─ serves static pages (index.html, ingredients.html, cms.html, styles.css, app.js, ...)
          ├─ REST /api/* (JSON files in DATA_DIR)
          └─ /api/publish → git commit+push to website repo (GitHub Pages)

GitHub Pages (static)  ── shows data/*.json committed on master
  └─ index.html + app.js render recipes/ingredients to visitors
```

- **Data store:** one JSON file per dataset under `DATA_DIR`
  (repo `data/` when running `node server.js`, or `%APPDATA%\Larder\data` in the
  packaged app; overridable with `LARDER_DATA_DIR`).
- **CMS front-end:** `cms.html` loads, in order: `calc.js`, `cms-utils.js`,
  `cms-state.js`, `cms-receipts.js`, `cms-planner.js`, `cms.js`. `cms.js` is the
  shell and dispatches per-tab rendering; `cms-state.js` holds shared state;
  `cms-utils.js` shared pure helpers; `cms-receipts.js` / `cms-planner.js` are
  extracted tab modules exposing `window.CMSReceipts` / `window.CMSPlanner`.
- **Public website:** `index.html` (recipes) + `app.js` (modal rendering),
  `ingredients.html` (ingredient list), `basics.html`, `reference.html`.
- **Auth:** local-only API key flow (server gates `/api/*`); static pages public.

## 2. Existing data models (verified)

### Recipe — `data/recipes.json` (array)
```jsonc
{
  "id": "string", "entryType": "recipe", "title": "string",
  "category": "string", "time": "25 mins", "iconTag": "string",
  "description": "string", "imageUrl": "url | data-url", "status": "published|draft",
  "macros": {
    "macroReference": { "type": "per_serving|total|per_100g|per_x_g", "referenceAmount": "string" },
    "yield": "string", "energy": "1035 kCal", "carbohydrate": "g", "protein": "g", "fat": "g",
    "fiberG": 0, "sugarG": 0, "saturatedFatG": 0, "...micros": 0
  },
  "ingredients": [ { "item": "string", "foodId": "string", "metric": "string", "imperial": "string" } ],
  "steps": [ "string..." ],            // "## " prefix = section header
  "tags": ["string"], "note": "string", "variations": "string",
  "_cmsStdMacros": { "normalized": { "energy": 0, "carbs": 0, "protein": 0, "fat": 0 } }
}
```

### Ingredient — `data/ingredients.json` (array)
```jsonc
{
  "foodId": "string", "name": "string", "servingSizeG": 100, "servingUnit": "g",
  "calories": 0, "proteinG": 0, "fatG": 0, "carbsG": 0, "fiberG": 0, "sugarG": 0,
  "saturatedFatG": 0, "category": "string", "fdcId": "string", "fdcDesc": "string",
  "...micros": 0,
  "averagePrice": 0, "priceCurrency": "MUR", "priceHistory": [ { "date": "YYYY-MM-DD", "price": 0 } ],
  "proteinSource": "string"
}
```
`priceHistory` exists on only a handful of entries and is **never read/written by
code** (dead data today).

### Pantry product — `data/pantry-items.json` (array) — *this is the brand/product model*
```jsonc
{
  "pantryId": "pantry_1_barilla_tagliatelle", "ingredientFoodId": "tagliatelle",
  "productName": "Tagliatelle", "brand": "Barilla",
  "packSize": 500, "packUnit": "g", "price": 45, "currency": "MUR",
  "quantity": 3, "isTracked": true,
  "avgDurationDays": 14, "lastOpenedDate": "2026-08-01", "notes": "string"
}
```
Legacy `data/pantry.json` also exists and is migrated (`migrateLegacyPantry`, `cms.js:809`).

### Household item — `data/household.json` (array)
```jsonc
{
  "id": "string", "name": "Toothpaste", "category": "Toiletries",
  "unitSize": "ml", "currentStock": 1, "avgDurationDays": 90,
  "pricePerUnit": 135, "lastOpenedDate": "2026-07-27", "durationHistory": []
}
```

### Receipt — `data/receipts.json` (array)
```jsonc
{
  "id": "rc_...", "store": "string", "date": "YYYY-MM-DD",
  "total": 0, "currency": "MUR", "enteredTotal": 0,
  "items": [ { "name": "string", "qty": 1, "unit": "g", "price": 0,
               "foodId": "string|null", "matchedName": "string|null" } ]
}
```

### Shopping list — `data/shoppinglists.json` (array of items, NOT dated records)
```jsonc
{ "foodId": "string|null", "name": "string", "amount": 0, "unit": "g",
  "category": "string", "recipes": ["string"], "checked": false, "grams": 0,
  "cost": 0|null, "currency": "MUR", "sources": ["meals|planner|restock|household"],
  "pantryIds": ["pantryId"] }
```
Generated lists **overwrite** this file — no history.

### Meal plan — `data/mealplans.json` (array, per-eater format)
```jsonc
{
  "date": "YYYY-MM-DD", "slot": "dinner", "note": "string",
  "eaters": [ { "name": "string", "eatingOut": false,
    "items": [ { "type": "recipe|ingredient|pantry",
                 "referenceId": "string", "ingredientFoodId": "string|null",
                 "name": "string", "grams": 0, "defaultGrams": 0 } ] } ]
}
```
A `pantry`-type item carries the chosen product (`pantryId`); the picker exists in
`cms.js:2534-2598`.

### Planner — `data/planner.json`
```jsonc
{ "goals": { "proteinMin": 300, "budget": 6000, "currency": "MUR" }, "items": [] }
```

### Settings — `data/settings.json` (partial sketch)
```jsonc
{ "shopping": { "currency": "MUR", "amount": 0 },
  "website": { "repoPath": "...", "repoUrl": "https://github.com/SoumeetKumal/Larder.git", "token": "" },
  "nutrition": { /* energy/macros/micros targets */ }, "profile": { /* ... */ } }
```

## 3. API surface

**Special handlers** (validation): `GET/PUT /api/recipes`, `GET/PUT /api/ingredients`.
**Generic file API** (`handleGenericFileAPI`): `/api/mealplans`, `/api/pantry`,
`/api/pantry-items`, `/api/shoppinglists`, `/api/household`, `/api/receipts`,
`/api/exercises`, `/api/workout-templates`, `/api/consumption`,
`/api/product-prefs`, `/api/planner-templates`, `/api/plan-versions`.
**Other:** `GET/PUT /api/planner`, `GET /api/network-info`, `GET/PUT /api/settings`,
`GET /api/export` (ZIP), `POST /api/import` (ZIP), `POST /api/publish` (git push).

> **New endpoints needed** as features land (see §6): shopping-list history via
> existing generic API once the shape changes, `POST /api/receipts/apply` (or fold
> into receipt save), price-history write endpoint (or fold into
> ingredient/pantry save).

## 4. Key proposed schema changes

### 4.1 Recipe — prep, sections, links
```jsonc
{
  "prepSteps": [ "string" ],        // NEW — mise en place
  "prepTime": "15 mins",            // NEW — optional
  "steps": [ "string" ],            // unchanged; "## " = section header
  "stepsLinks": { "0": ["foodId"], "2": ["foodId"] }  // NEW — step index → linked ingredient foodIds
  // ALT: inline tokens in step text, e.g. "Add the [[tagliatelle]] to boiling water"
}
```
**Decision needed (D1):** structured `stepsLinks` map vs. inline `[[foodId]]`
tokens in the string.
- *Inline tokens*: survive copy/paste, self-describing, easy on the website; risk of
  user-typing collisions (need escape syntax `[[]]`).
- *Side map*: keeps step text clean; breaks when steps are reordered unless keys are
  per-step ids; migration harder.
> Recommendation: **inline tokens** `[[foodId]]` + editor picker; store a friendly
> label next to it for robustness (`[[tagliatelle|Tagliatelle]]`).

### 4.2 Consumption log — `data/consumption.json` (NEW)
```jsonc
{
  "id": "cons_...", "date": "YYYY-MM-DD", "source": "recipe|manual",
  "recipeId": "string|null", "note": "string",
  "items": [ { "ingredientFoodId": "string", "pantryId": "string|null",
               "grams": 0, "amount": 0, "unit": "g" } ]
}
```
Drives GAP-08/09 (subtract) and GAP-10 (duration learning).

### 4.3 Shopping list — dated records (GAP-11)
```jsonc
[ { "id": "sl_...", "date": "YYYY-MM-DD", "label": "Weekly shop",
    "createdAt": "ISO", "status": "active|done|archived",
    "totals": { "expected": 0, "real": null, "currency": "MUR" },
    "items": [ /* existing item shape + checked */ ] } ]
```
Generate = create-or-update record for today; Save persists; Past-lists view lists
records. Migration: wrap existing single list into one dated record on load.

### 4.4 Price history — live on products + ingredients (GAP-14)
```jsonc
// pantry product gains:
"priceHistory": [ { "date": "YYYY-MM-DD", "price": 45 } ],
"lastPrice": 45, "lastPriceDate": "YYYY-MM-DD"
// ingredient: keep existing averagePrice + priceHistory[] (already in shape)
// receipt write path: GAP-18 confirmation → upsert history + recompute averagePrice
```

## 5. Pure-logic placement (testability)

New logic that can be made pure goes into `calc.js` or `cms-utils.js` so it can be
unit-tested in `tests/` with `node --test`:
- Recipe consumption math: `consumptionFor(recipe, {scale, overrides}) → [{foodId, grams}]`.
- Price-history ops: `applyPriceUpdate(product, price, date) → {history, averagePrice}`.
- Shopping-list record ops: `createListRecord(items, date)`, `mergeTick(listId, foodId, checked)`.
- Inflation/stat aggregation: `householdInflationIndex(historyByProduct, weights) → number`.

DOM, fetch, and rendering stay in the CMS modules. This keeps the "verifiable steps"
model from `dev-plan.md` cheap: pure parts get automated tests, UI parts get manual
Electron checks.

## 6. Feature → files map (where each change lands)

| GAP | Files touched |
|---|---|
| 01 prep section | `cms.html`, `cms.js` (editor + save), `app.js` (render), `server.js` (none) |
| 02 subsection buttons | `cms.js` (`createStepRow`/`createIngredientRow`), `cms.html` |
| 03 links in steps | `cms.js` (picker + token insert), `app.js` (render), `cms-utils.js` (token parse) |
| 04 foodId links + new tab | `app.js` (resolve by foodId, `<a target="_blank">`, icon), `ingredients.html` (detail page route) |
| 05 unfinished-ingredient nudge | `cms.js` (toast + Foods list flags) |
| 08 cook&subtract | `cms.js` (confirm dialog), `calc.js` (consumptionFor), `cms-state.js` (consumption log), `server.js` (consumption endpoint or reuse generic) |
| 09 quick use | `cms.js` (pantry row button) |
| 10 duration learning | `cms.js`, `calc.js` (rolling avg) |
| 11 dated lists | `cms.js` (`shoppingLists` shape + past-lists view), `cms-utils.js` (helpers), `server.js` (unchanged generic API) |
| 12 shared live list | sync layer (§7) + PWA (§8) + `cms.js`/phone UI |
| 13 running totals | `cms.js` (list render), `cms-utils.js` |
| 14 price history/charts | `calc.js` (pure), `cms.js` (charts UI), `ingredients.html` (public price if wanted) |
| 16 include/exclude + at-home | `cms.js` (generate + list render) |
| 17 OCR | `cms-receipts.js` (image→text), phone PWA camera |
| 18 confirm/compare/update | `cms-receipts.js`, `calc.js` (diff), `server.js` (apply endpoint) |
| 20 stats/inflation | `cms.js` (Stats tab) or `cms-receipts.js` extension, `calc.js` |
| 21 remember brand | `cms.js` (picker default), `data/recipes.json` or preference table |
| 22 plan templates | `cms-planner.js`, `cms.js` |
| 23 macro suggestions | `cms-planner.js` |
| 24 stats screens | `cms.js` / `cms-receipts.js`, `calc.js` |
| 25 sync | §7 |
| 26 PWA | new `phone/` route + service worker + `server.js` static config |

## 7. Sync strategy (GAP-25/12) — options + recommendation

### Options
1. **LAN WebSocket (recommended first).** `server.js` already runs on the PC; add a
   WebSocket endpoint + `network-info` (already exists, `server.js:476`). Phone PWA
   connects over home Wi-Fi; server pushes deltas; server is the source of truth.
   - Pros: no accounts, no cloud, private, reuses all current code. Cons: requires
     same network; PC must be on.
   - Conflict policy: last-write-wins per document + per-shopping-list-item; server
     serialises writes.
2. **Cloud sync (later, optional).** A hosted backend or self-hosted endpoint storing
   the same JSON; both devices sync to it. Pros: works anywhere. Cons: accounts,
   hosting, privacy, much bigger lift. Keep LAN first; design the API so a remote
   transport can be swapped in later (a thin `SyncTransport` interface).
3. **GitHub-based.** Use the existing website-repo publish as a sync channel. Too
   heavy and public for personal pantry data — rejected.

### Recommendation
Phase 7 ships **LAN sync (option 1)** as the transport, wrapped behind a small
`SyncClient` abstraction so option 2 can be added without rewriting the app. The
**shopping list** is the first synced dataset (highest value), then pantry, then
full app data.

## 8. Phone client (GAP-26) — PWA

The CMS is already responsive-ish plain HTML/CSS/JS served by `server.js`. A phone
client is a **service-worker-enabled PWA** served from the same server:
- Route: `phone/` with mobile-first layout reusing the same `/api/*`.
- Screens first: shared shopping checklist (live via WS), pantry quick-use,
  receipt capture (camera → OCR).
- Installable (manifest + icons), offline-cache static assets, camera via
  `getUserMedia`/file input.
- Later native wrapper (Capacitor) only if the PWA proves out.

## 9. Migration & safety

- **Schema migrations:** a versioned `data/version.json` + one-time migrators run on
  load (pattern already exists: `migrateLegacyPantry`, `normalizePlan`).
  Migrations must be idempotent and covered by the Export/Import round-trip test.
- **Backup first:** any schema change is preceded by an Export ZIP validation.
- **Backwards compat:** the website should still render old recipes (no prep/links)
  — treat new fields as optional, never required.
- **Failure handling:** shopping-list save already reverts on failure
  (`cms.js:2989-2995`); keep this pattern for new writes.

## 10. Open decisions

- **D1** — linked-ingredient representation in step text: inline tokens vs side map (recommend inline).
- **D2** — prep as its own section in the editor vs a tagged section inside steps (recommend own section, both optional time and steps).
- **D3** — where "I cooked this" lives: recipe detail page only, or also a quick action on the plan/meal day (recommend both, same code path).
- **D4** — sync conflict rule beyond last-write-wins (e.g. merge for shopping ticks).
- **D5** — OCR engine choice for PWA/Electron (Tesseract.js vs native OS OCR via Electron).
- **D6** — per-item min/max: on pantry product + household only, or also ingredients.
