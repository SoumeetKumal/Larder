# Larder

Your personal recipe manager and kitchen companion — built for home cooks who love to organise, experiment, and eat well.

## Pages

- `index.html` — Browse and filter recipes (category, tags, prep/cook time, nutrition)
- `ingredients.html` — Ingredient library with nutrition lookup
- `basics.html` — Kitchen basics: equipment, techniques, and culinary cuts
- `reference.html` — Reference guide
- `cms.html` — Private content management (meal planning, data import/export)
- `legal.html` — Legal / privacy notices

## <a name="shopping-optimizer"></a>Shopping Optimizer (CMS)

Budget- and price-aware meal planning, built into the CMS:

- **Weekly budget vs meal-plan cost** (Shopping tab) — cost of the current week's meals is estimated from each ingredient's `averagePrice ÷ servingSizeG` (metric units, falling back to imperial amounts), compared against a weekly budget set in Settings → Shopping, with a progress bar, per-category breakdown, and a "not costed" notice for unpriced/unparsed ingredients.
- **Cost-aware shopping list** — every line shows an estimated cost plus a list total with an over/within-budget badge; when over budget, cheaper same-category swap suggestions are listed with the money you'd save.
- **Cost-aware meal planning** — each planned meal gets a cost chip and a "Week Meal Cost" card compares the week's total to the budget.
- **Price-aware ingredients** — the Ingredients tab shows a per-100g unit price on each priced item and marks the cheapest ingredient in every category.

## <a name="nutrition-budget"></a>Nutrition vs Budget Dashboard (CMS)

The Meal Plan tab opens with a consolidated **Nutrition vs Budget** overview panel built from the displayed week and every profile in Settings:

- **Weekly Goals vs Plan** — Calories / Protein / Carbs / Fat progress bars comparing the week's planned totals against the summed weekly targets of all profiles (each profile's per-day target × 7), with over-target values flagged in red.
- **Budget & Efficiency**
  - Planned cost vs the weekly shopping budget, with an over/within status pill and progress bar.
  - **Pantry savings** — value of planned ingredients already covered by tracked pantry stock.
  - **Protein cost** — Rs per 10 g of protein across the week's plan.
  - **Most expensive meal** — the costliest planned meal of the displayed week.
  - **Cheapest protein source** — the planned ingredient with the lowest Rs per 100 g of protein.

## <a name="price-trends"></a>Price History & Trends (CMS)

Per-ingredient price tracking so you can spot rising/falling costs:

- **Automatic capture** — saving an ingredient with a changed price records the new price into its `priceHistory` (date + price). The Pricing panel also offers **"Log today's price"** to snapshot a price without editing the profile.
- **Trend chips** — the Ingredients tab (grid and table) shows a small `▲`/`▼` chip with the % change versus the previous record next to each priced item.
- **Price History widget** (ingredient editor → Pricing tab) — a sparkline chart plus Current / Average / Low / High tiles, "vs last record" and "vs average" badges, and a recent-entries list.

## <a name="monthly-planner"></a>Monthly Planner (CMS)

Plan the month against a budget and nutrition targets, then split the shop into bulk staples and weekly fresh:

- **Nutrition goals** — set min/max boundaries for calories, macros, sat. fat, sugar, fiber and vitamin D, plus a target % of protein coming from animal sources and a monthly budget.
- **Live projection** — as you build the ingredient list, projected monthly totals are colour-coded against your goals (red = over/under, blue = within range), including an animal-protein split and running cost vs budget.
- **Builder** — search ingredients, set amount + unit, and mark each line "use stock" (leaves it off the shopping list) or "month" (bought in bulk). Suggestions surface the most expensive items.
- **Partitioned shopping list** — one click generates two lists: **monthly bulk** (long-life staples by category) and **weekly/fresh**, with existing pantry/household stock automatically deducted and surplus flagged.
- Persisted to `planner.json` (goals + items) via `POST /api/planner`.

## <a name="receipts"></a>Receipts & Shopping Analytics (CMS)

Capture what you actually spent and feed it back into the plan:

- **Add a receipt** — enter store, date, total, and items, or paste receipt text ("Rice 2kg 145.00" per line) and it is parsed automatically; item names are fuzzy-matched to ingredients (`→ matched`).
- **Push to pantry** — one click adds each matched line's quantity to pantry stock (`POST /api/pantry`).
- **Shopping analytics** — this month / last month / all-time spend, average per receipt, spend vs monthly budget (red when over), a last-8-weeks bar trend, and a per-store breakdown.
- Persisted to `receipts.json` via `POST /api/receipts`.

## <a name="restock"></a>Restock Alerts (CMS)

- **Pantry tab** — a "Restock needed" card lists tracked items that are out of stock or below a healthy level, each with a one-click **"Add to planner"** button (suggested reorder quantity pre-filled).
- **Household tab** — the header notes how many consumable items are running low based on stock × average duration vs estimated depletion.

## Tech

- **Electron** desktop app with a local Node server (`server.js`, loopback-only)
- Plain HTML/CSS/JS (no framework)
- Data stored as JSON in `data/` (recipes, ingredients, meal plans, pantry)

## Scripts

| Command | Description |
| --- | --- |
| `npm run server` | Start the local API server (serves pages + `/api/*` endpoints) |
| `npm start` | Launch the Electron desktop app |
| `npm run build` | Package installers (NSIS + portable) into `dist/` |
| `npm run build:portable` | Build the portable `.exe` only |
| `node tests/larder.test.js` | Run the integration suite: static syntax + data-JSON checks, auth gate, API round-trips, PUT validation, and pantry↔ingredient integrity (needs port 8000 free; uses a temp data dir) |
| `node tests/larder-math.test.js` | Run the pure-math unit suite for the shared `calc.js` module: `gramsOf`, `computeTotals`, `matchIngredient`, `parseLine`, and `parseReceiptText` (no server needed) |

The packaged app excludes `dist/`, `docs/`, `data/`, and `_archive/`; live data is copied into the app as extra resources so it stays editable at runtime.

## Security

The local server binds to loopback only and requires a bearer token for writes. Content is escaped before reaching `innerHTML` templates.
