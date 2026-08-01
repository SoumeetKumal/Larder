# Larder

Your personal recipe manager and kitchen companion — built for home cooks who love to organise, experiment, and eat well.

## Pages

- `index.html` — Browse and filter recipes (category, tags, prep/cook time, nutrition)
- `ingredients.html` — Ingredient library with nutrition lookup
- `basics.html` — Kitchen basics: equipment, techniques, and culinary cuts
- `reference.html` — Reference guide
- `cms.html` — Private content management (meal planning, data import/export)
- `legal.html` — Legal / privacy notices

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
