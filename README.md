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

The packaged app excludes `dist/`, `docs/`, `data/`, and `_archive/`; live data is copied into the app as extra resources so it stays editable at runtime.

## Security

The local server binds to loopback only and requires a bearer token for writes. Content is escaped before reaching `innerHTML` templates.
