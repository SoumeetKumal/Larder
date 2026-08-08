# Larder — Development Guide

## Testing the CMS

**Always test the CMS inside Electron, never in a plain browser.**

The CMS pages (`cms.html`, `workouts.html`) rely on `preload.js`, which injects a
frameless 38px title bar into every page and adjusts the page layout to fit under
it. A plain browser tab does not run the preload, so layout, scrolling and theme
behaviour will NOT match the real app there.

How to test the real app:

1. Start the server: `node server.js` (listens on port 8000).
2. Launch Electron pointing at the source tree (uses the same code as the packaged
   app): `npx electron .` — or for the packaged experience: `npm run build` then run
   the built exe.
3. If port 8000 is already in use (`EADDRINUSE`), kill the stale `node`/`Larder`
   process first: `Stop-Process -Id <pid> -Force`.

To inspect the live DOM of a running Electron app, launch with
`--remote-debugging-port=9223` and use the DevTools protocol (`http://localhost:9223/json`).

## Data locations

There are two independent data stores; don't confuse them:

- **App data** — `%APPDATA%\Larder\data\*.json`. This is what the packaged app (and
  the CMS) read/write. This is the *live* data: `node server.js` alone reads the
  repo's `data/`, NOT this folder.
- **Repo data** — `data/*.json` in this source tree. Used by bare `node server.js`
  and as the packaged app's seed. The repo `data/` is also what **GitHub Pages
  serves** for the live website — see "Publishing to the website" below.

To make the server read the app data (e.g. to inspect the real data without
launching Electron), set `LARDER_DATA_DIR`:

```powershell
$env:LARDER_DATA_DIR = "$env:APPDATA\Larder\data"
node server.js
```

## Backup / restore

Always make sure backup and restore work properly before shipping a build:

1. **Backup** — CMS → Settings → Data → **Export (ZIP)** downloads
   `larder-data-YYYY-MM-DD.zip` via `GET /api/export`.
2. **Restore** — CMS → Settings → Data → **Import (ZIP)** pushes the zip through
   `POST /api/import`, which only accepts the app's known data files (zip-slip
   protected, no subfolders allowed).
3. Test both end-to-end in Electron: export, then import the archive and confirm
   every dataset (recipes, ingredients, pantry, planner, settings, receipts,
   household, shopping lists, exercises, workout templates) is intact.

The exported zip must round-trip: importing it on a fresh `%APPDATA%\Larder\data`
folder should restore everything the app had. This is the "move to a new PC"
scenario — install Larder, import the backup, done.

## Publishing to the website (GitHub Pages)

The live site (`https://soumeetkumal.github.io/Larder/`) is **static GitHub
Pages** — it shows only the `data/*.json` files committed to the repo's `master`
branch. There is no server on Pages, so the CMS's app-data changes never reach it
automatically.

To publish: CMS → Settings → Data → **Publish to Website**. The app keeps its own
clone of the website repo *inside the app's data folder* — `%APPDATA%\Larder\website-repo`
— so after a "install → import backup" move to a new PC the first Publish simply
downloads a fresh clone automatically, then copies the live data into `<repo>/data/`,
runs `git add data && git commit && git push`. GitHub Pages rebuilds within a minute.

Settings the publish uses (all stored in `settings.json` under `settings.website`):

- `repoPath` — local clone location. Optional; defaults to
  `%APPDATA%\Larder\website-repo` and is remembered after the first publish.
- `repoUrl` — website repo remote (default
  `https://github.com/SoumeetKumal/Larder.git`).
- `token` — optional GitHub personal-access token (for private repos). When absent,
  git uses its own credential helpers (e.g. Windows Credential Manager), so on a PC
  that has already authenticated with GitHub nothing needs to be entered.

A stale `repoPath` (e.g. carried over from a previous PC's backup) is ignored if the
folder no longer exists, and publishing falls back to the in-app clone.

Alternatively, publish manually:

```powershell
Copy-Item "$env:APPDATA\Larder\data\*.json" "data\"
git add data
git commit -m "Publish data from Larder CMS"
git push
```

## Other conventions

- Lint: `npm run lint` (stylelint on styles.css)
- Tests: `npm test`
- Do not add code comments unless asked.
