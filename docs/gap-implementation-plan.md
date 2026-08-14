# Larder Gap Implementation Plan & Roadmap

Generated from user workflow analysis (2026-08-14). All gaps are code-grounded with file:line references from the audit.

---

## Priority Matrix

| # | Gap | Priority | Effort | Area | Dependencies |
|---|-----|----------|--------|------|--------------|
| 1 | Website ingredient links dead (hover → open in new tab, `[[food]]` tokens in steps) | **P0** | M | Website / CMS | Fix data load on index.html |
| 2 | Phone receipt: no editable parsed-item confirmation, no price-history propagation | **P0** | M | Phone PWA | Uses existing parse + CMS dialog logic |
| 3 | No expected-total vs actual-total comparison on receipt save | **P1** | S | Receipts (CMS + Phone) | Standalone |
| 4 | Phone shows no running totals while shopping | **P1** | S | Phone PWA | Uses existing CMS cost logic |
| 5 | No per-brand price chart (Granoro vs Barilla vs Panzani) | **P1** | M | Stats / Receipts | Needs `normalizeForCompare` + brand-aware history |
| 6 | Receipt items never set `category` → categorySpend = Uncategorized-only | **P1** | S | Receipts | Map ingredient→category on parse |
| 7 | Editing pantry item wipes `priceHistory` (replaces whole object) | **P1** | S | CMS Pantry | Fix save to merge history |
| 8 | Cooked deduction never asks which product (multiple brands) | **P1** | M | CMS Cooking | Product picker in cooked dialog |
| 9 | Phone quick-use has no confirmation/cap | **P1** | S | Phone PWA | Mirror CMS "Used" dialog |
| 10 | Household items: no price history, no min/max thresholds | **P2** | M | Household | Add fields + persist + UI |
| 11 | No "send/share list to wife's phone" action (QR/clipboard/mailto) | **P2** | M | Mobile / CMS | Generate shareable URL + QR |
| 12 | Shopping-list templates missing; monthly planner templates missing | **P2** | M | Planning | New API + UI |
| 13 | Ingredient serving size & price not editable in CMS profile modal | **P2** | S | CMS Ingredients | Add fields to modal + save |

---

## Detailed Gap Specifications

### 1. Website Ingredient Links Dead (P0)

**Problem:** On `index.html` (recipe page), ingredients render as plain text. The link markup/CSS (`renderIngredientsHTML` → `.ingredient-link`) and `[[foodId|Label]]` token rendering (`renderStepHtml`) exist but resolve against `recipesData` which only contains recipes (`entryType: 'recipe'`). Ingredients are never loaded there.

**Root cause:** `app.js:130-131` loads only `/api/recipes` into `recipesData`. The lookup filters at `app.js:726-727` / `730-731` / `1076-1077` require `entryType === 'ingredient'`.

**Fix:** Load ingredients into a shared index on `index.html` (parallel fetch `/api/ingredients`), then resolve against it. Minimal change: add `const ingredientIndex = await fetchIngredients();` and use that in `resolveIngredientProfile` and token rendering.

**Files:** `app.js` (load + resolve), `index.html` (no change), `styles.css` (already has `.ingredient-link` + external-link icon).

**Acceptance:** Hover on ingredient in recipe → underline + external-link icon; click → opens `ingredients.html?foodId=...` in new tab. `[[ingredient]]` tokens in steps render as links.

---

### 2. Phone Receipt: Editable Confirmation + Price History (P0)

**Problem:** Phone PWA receipt screen (`phone/index.html:39-62`, `phone/app.js:176-224`) parses lines → renders read-only `<li>` → save with no review, no price-history update.

**Fix:**
- Make `renderParsed` output editable inputs (name, qty, unit, price) with remove buttons, mirroring CMS `cms-receipts.js:204-232`.
- After save, show a price-comparison modal (or inline) like CMS `showPriceComparison` (`cms-receipts.js:360-479`), then push to `pantry-items` + `ingredients` price history.
- Reuse `parseReceiptText` / `parseLine` from `calc.js` (already used).

**Files:** `phone/app.js` (renderParsed, saveReceipt), `phone/index.html` (add editable rows container), `calc.js` (no change), optionally share price-comparison logic with CMS.

**Acceptance:** Phone receipt parse → editable rows → confirm → price comparison dialog with Update checkboxes → saves to price history.

---

### 3. Expected vs Actual Total Comparison (P1)

**Problem:** CMS receipt (`cms-receipts.js:316-319`) and phone (`phone/app.js:207-212`) only use computed sum as fallback when entered total is 0. No mismatch warning/dialog.

**Fix:** After parse, if `enteredTotal > 0` and `Math.abs(enteredTotal - computedSum) > 0.01`, show a small banner/dialog: "Entered total X differs from item sum Y (diff Z%) — proceed anyway?" Log the delta.

**Files:** `cms-receipts.js` (parse handler), `phone/app.js` (saveReceipt).

**Acceptance:** Receipt with entered total shows comparison; user can confirm or adjust.

---

### 4. Phone Shopping Totals (P1)

**Problem:** Phone list view (`phone/app.js:63-107`) shows only "X / Y done". No estimated cost, no running total on tick.

**Fix:** Reuse `backfillListCosts` / `perGramPrice` logic from CMS (`cms.js:3587-3599`, `cms.js:1729-1737`) in phone `renderShoppingList`. Show "Estimated: X" above list; update on tick/include.

**Files:** `phone/app.js`, `calc.js` (export helpers if needed).

**Acceptance:** Phone shows running estimated total; updates live when items checked.

---

### 5. Per-Brand Price Chart (P1)

**Problem:** Receipts tab price chart (`cms-receipts.js:86-145`) keys by `ingredientFoodId` and merges all brands into one series. `normalizeForCompare` (`calc.js:282-298`) and `applyPriceUpdate` (`calc.js:257-277`) exist but are dead code.

**Fix:**
- Wire `applyPriceUpdate` as the single writer for price history (replace inline pushes in `cms-receipts.js:454-468`).
- In Receipts tab, add brand selector (distinct brands from pantry-item histories for that foodId) and plot each brand as a separate series/color using `normalizeForCompare` to align dates.
- Optionally add the same chart to Stats tab.

**Files:** `calc.js` (applyPriceUpdate), `cms-receipts.js` (chart + price-comparison dialog), `cms.js` (Stats tab if desired).

**Acceptance:** Chart shows Granoro (blue), Barilla (orange), Panzani (green) lines for the same ingredient; hover shows brand+date+price.

---

### 6. Receipt Category Bug (P1)

**Problem:** Receipt items never get a `category` field. `categorySpend` (`calc.js:351-374`) aggregates by `item.category` → all "Uncategorized".

**Fix:** In `parseReceiptText` / `parseLine` (`calc.js:185-200`, `calc.js:146-180`), when a line matches an ingredient (`matchedName` → `foodId`), copy `ingredients[foodId].category` onto the parsed item. If no match, leave as "Uncategorized" or infer from name.

**Files:** `calc.js` (parseLine), `cms-receipts.js` (receipt save), `phone/app.js` (saveReceipt).

**Acceptance:** "Spend by category" bars show real categories (Pasta, Dairy, Meat, etc.) instead of 100% Uncategorized.

---

### 7. Pantry Editor Wipes Price History (P1)

**Problem:** `cms.js:1582-1604` builds a fresh `itemData` object and does `pantryItems[idx] = itemData`, dropping `priceHistory`, `lastPrice`, `lastPriceDate`.

**Fix:** Merge existing `priceHistory`/`lastPrice`/`lastPriceDate` into `itemData` before save. Or use `applyPriceUpdate` for price field changes.

**Files:** `cms.js` (savePantryTracking / full editor), `calc.js` (applyPriceUpdate).

**Acceptance:** Edit pantry item name/quantity/brand → price history preserved.

---

### 8. Cooked Deduction: Which Product? (P1)

**Problem:** `cms.js:6109` does `pantryItems.find(p => p.ingredientFoodId === item.foodId && p.isTracked)` — first match only. If user stocks Barilla AND De Cecco tagliatelle, it silently decrements the first.

**Fix:** In `openCookedDialog` (`cms.js:5991-6134`), when multiple tracked pantry products match the ingredient, add a "Choose product" step per ingredient (dropdown or radio) before the "Log & Decrement" confirm.

**Files:** `cms.js` (openCookedDialog, cooked confirm), `cms.html` (cooked dialog markup).

**Acceptance:** Cooking tagliatelle with 2 brands → dialog shows "Tagliatelle: ▼ Barilla / ▼ De Cecco" per row.

---

### 9. Phone Quick-Use Confirmation (P1)

**Problem:** `phone/app.js:147-173` `usePantry` decrements immediately, no confirm, no cap to available stock, no duration learning.

**Fix:** Add a confirm step (`confirm("Use X g of Y? Available: Z g")`), cap `grams = Math.min(grams, availableGrams)`, call `learnDurationFromConsumption` (port from `cms.js:6257-6290` or reuse `calc.js:240-251`).

**Files:** `phone/app.js`, `calc.js` (rollingAvgDuration).

**Acceptance:** Phone "Use" → confirm modal → decrements capped → logs consumption → learns duration.

---

### 10. Household: Price History + Thresholds (P2)

**Problem:** `data/household.json` items have `pricePerUnit` but no `priceHistory[]`. No `minStock`/`maxStock` fields (only hardcoded ≤7-day low rule in `householdRunningLow` `cms.js:1739-1749`).

**Fix:**
- Add `priceHistory[]`, `lastPrice`, `lastPriceDate`, `averagePrice` to household items (migrate on load like pantry-items `cms.js:880-885`).
- Add `minStock`, `maxStock` fields + UI inputs in Household tab editor (`cms.html` + `cms.js`).
- Update `householdRunningLow` to use thresholds if set, else fall back to 7-day heuristic.
- Include household in price-comparison on receipt? (Optional — household items aren't matched to receipt lines currently.)

**Files:** `cms.js` (Household tab, householdRunningLow, save), `cms.html` (household editor), `server.js` (validation if needed).

**Acceptance:** Household item editor shows price history chart + min/max; low detection uses thresholds; price history feeds inflation.

---

### 11. Send/Share List to Wife's Phone (P2)

**Problem:** No explicit share action. Both phones get the list via live WS sync only if they open the app on the same LAN.

**Fix:** Add a "Share" button in Shopping tab (CMS) and phone list view that:
- Generates a deep-link URL: `https://.../phone/?listDate=YYYY-MM-DD` (or local `http://<lan-ip>:8000/phone/?listDate=...`).
- Shows a QR code (use `qrcode` lib — add to deps) and "Copy link" button.
- Phone PWA: register as `share_target` in `manifest.webmanifest` to receive shared links natively.

**Files:** `cms.js` (Shopping tab share button), `phone/app.js` (share button), `phone/manifest.webmanifest` (share_target), `phone/index.html` (QR modal), add `qrcode` npm dep.

**Acceptance:** Click "Share" → QR code + link; wife scans / opens → phone opens directly to that day's list.

---

### 12. Shopping-List Templates + Monthly Planner Templates (P2)

**Problem:** Day/meal templates exist (`/api/planner-templates`, `data/planner-templates.json`). Shopping-list templates and monthly-planner templates do not.

**Fix:**
- **Shopping-list templates:** New API `GET/POST /api/shopping-templates` (store `data/shopping-templates.json`), UI "Save as template" in Shopping tab, "Use template" pre-fills generate sources + include/exclude + quantities.
- **Monthly planner templates:** Add "Save Template" button in `cms-planner.js` (currently zero template code), store to new `data/planner-month-templates.json` or reuse `planner-templates.json` with a type field.

**Files:** `server.js` (new routes), `cms.js` (Shopping tab), `cms-planner.js` (planner template save), `cms.html` (UI).

**Acceptance:** "Save this list as 'Monthly big shop'" → next month click → pre-filled with same items + quantities.

---

### 13. Ingredient Serving Size & Price Editable (P2)

**Problem:** `cms.html` profile modal (`#cms-food-modal`) has Overview/Culinary/Nutrition tabs. No serving-size or price inputs. `servingSizeG`/`servingUnit` hardcoded to 100g at creation (`cms.js:5015-5016`, `cms.js:5918-5919`). Price fields read-only everywhere.

**Fix:** Add "Pricing" tab or extend Overview with: serving size (number + unit select), `averagePrice`, `priceBasisAmount`, `priceBasisUnit`, `priceCurrency`. Save via `PUT /api/ingredients` (already bulk-replace, will persist new fields).

**Files:** `cms.html` (modal), `cms.js` (openProfileEditor, save handler), `server.js` (validation already generic).

**Acceptance:** Edit ingredient → change serving to "250 g" → recipe cost math uses 250 g; enter price → cost math uses it.

---

## Implementation Sequence (Roadmap)

### Sprint 1 — Core Website + Phone Fixes (Week 1)
1. **Gap 1** — Website ingredient links (load ingredients on index.html)
2. **Gap 2** — Phone receipt editable confirmation + price history
3. **Gap 3** — Expected vs actual total comparison (both)
4. **Gap 4** — Phone shopping totals

*All four touch the same data paths (ingredients index, price helpers, receipt flow). Doing them together avoids rework.*

### Sprint 2 — Price History Integrity + Brand Charts (Week 2)
5. **Gap 7** — Pantry editor preserves price history (merge on save)
6. **Gap 5** — Wire `applyPriceUpdate` as single writer; build per-brand chart in Receipts tab
7. **Gap 6** — Receipt items inherit category from matched ingredient
8. **Gap 13** — Ingredient serving size & price editable in modal

*These form a coherent "price history pipeline" — write path, read path, chart, category, ingredient metadata.*

### Sprint 3 — Cooking/Shopping Polish (Week 3)
9. **Gap 8** — Cooked dialog: choose product when multiple brands
10. **Gap 9** — Phone quick-use: confirm + cap + learn duration
11. **Gap 10** — Household price history + min/max thresholds

*All touch pantry/household consumption and editor logic.*

### Sprint 4 — Sharing + Templates (Week 4)
12. **Gap 11** — Share list (QR + deep-link + share_target)
13. **Gap 12** — Shopping-list templates + monthly planner templates

*Independent features, can be parallelized.*

---

## Risks & Notes

- **Phone PWA** changes need Electron re-test (preload + CDP) — budget time for `npm test` + manual Electron smoke.
- **Website changes** (`app.js`) need GitHub Pages publish verification after commit.
- **Server routes** additions (share, templates) must honor `DATA_FILES` whitelist for export/import/publish.
- `applyPriceUpdate` wiring (Gap 5) touches both receipts dialog and pantry editor — test both.
- `normalizeForCompare` expects brand-tagged history points — household + ingredient histories currently lack brand; pantry items have it. May need to add `brand` to ingredient history points for cross-brand chart to work.

---

## Success Criteria (Definition of Done per Gap)

| Gap | Done When |
|-----|-----------|
| 1 | `ingredients.html?foodId=...` opens from recipe page hover; `[[token]]` in steps clickable |
| 2 | Phone receipt parse → editable rows → confirm → price dialog → history updated |
| 3 | Receipt entered total ≠ computed sum → shows diff + confirm |
| 4 | Phone list shows "Estimated: X" updating on tick |
| 5 | Receipts tab chart shows separate lines per brand for same ingredient |
| 6 | "Spend by category" shows real categories (not Uncategorized) |
| 7 | Edit pantry item name/brand → price history intact on reload |
| 8 | Cooked tagliatelle with 2 brands → dropdown per ingredient |
| 9 | Phone "Use" → confirm → capped → learns duration |
| 10 | Household editor has price chart + min/max; low detection uses thresholds |
| 11 | "Share" → QR code → wife scans → opens that day's list on her phone |
| 12 | "Save template" in Shopping + Planner → reuse next month |
| 13 | Ingredient modal lets me set serving=250g, price=1.20 → recipes use it |

---

## Next Action

Start **Sprint 1, Item 1** — fix website ingredient links by loading `/api/ingredients` on `index.html` and resolving against it. This unblocks the website UX the user described first.