# Larder — Project Docs

This folder is the single source of truth for *what* Larder should be and *how*
we get there. It exists because the roadmap is long, so we need to stay on track
without breaking what already works.

## How to use these docs

Read them in order the first time, then come back to individual files as needed:

| File | Purpose |
|---|---|
| `README.md` | You are here. Index, conventions, "how to keep working". |
| `workflow.md` | The realistic day-to-day workflow — how the app should *feel* to use. Written as user stories from real life. |
| `gaps.md` | Gap analysis: what exists today vs. what the workflow needs. Every gap has an id. |
| `prd.md` | Formal product requirements: goals, personas, functional requirements, priorities, acceptance criteria. |
| `architecture.md` | Technical design: current architecture, data models, proposed changes, sync strategy. |
| `roadmap.md` | Phased plan (Phase 0 → 7), each with scope, dependencies and "done" criteria. |
| `dev-plan.md` | The implementation checklist. One section per phase, each with **verifiable steps** (tests + manual checks). |

## The workflow in one paragraph

Larder serves two audiences that share the same data:

- **Public website (GitHub Pages):** recipes + ingredients, published from the CMS.
- **Personal app (Electron CMS + phone):** pantry, cooking, shopping, receipts,
  price history, stats, and monthly meal planning — for the household.

The heart of the product is the **household loop**: plan meals → check pantry →
generate a shopping list → shop with a shared live checklist → scan the receipt →
prices get recorded → stats/inflation update → next plan gets cheaper to build.

## Conventions (from AGENTS.md — abbreviated)

- Test the CMS **inside Electron** (`node server.js` + `npx electron .`), never in a
  plain browser — `preload.js` injects the 38px frameless title bar.
- Two data stores, don't mix them:
  - **App data**: `%APPDATA%\Larder\data\*.json` — what the packaged app reads.
  - **Repo data**: `data\*.json` — what `node server.js` reads and what GitHub Pages serves.
  - Use `$env:LARDER_DATA_DIR = "$env:APPDATA\Larder\data"` to make the server read app data.
- Backup/restore must work end-to-end before shipping (Export ZIP / Import ZIP, and
  "Publish to Website").
- Lint: `npm run lint`. Tests: `npm test`. Never commit without being asked.

## How to keep working (workflow for the developer)

1. **Start from the roadmap.** Open `roadmap.md`, pick the current phase. A phase is
   never "in progress" in two places — finish one, mark it done, move on.
2. **Implement in small slices.** Each slice has a checklist in `dev-plan.md`.
3. **Verify as you go.** Pure logic goes into `calc.js` / `cms-utils.js` with unit
   tests in `tests/`. UI changes get a manual Electron check from `dev-plan.md`.
4. **Update the docs when reality diverges.** If a decision changes (e.g. we choose
   a different sync approach), update `architecture.md` and the affected phase in
   `dev-plan.md`. Keep ids stable so traceability survives.
5. **Backup before breaking changes.** The Export/Import round-trip is the safety
   net. Test it before and after any data-model change.
6. **Commit at phase boundaries**, only when asked, with a message referencing the
   gap id(s) closed, e.g. `feat: prep section + instruction subsections (GAP-01, GAP-02)`.

## Gap ids used throughout

All work items reference `GAP-xx` ids defined in `gaps.md`. A feature is only
"done" when its acceptance criteria in `prd.md` and its verifiable steps in
`dev-plan.md` are all green.

## Status

- Current state: **pre-Phase 1.** Recipe/website gaps are the first implementation
  slice. The in-flight CMS refactor (`cms-planner.js`, `cms-receipts.js`,
  `cms-state.js`, `cms-utils.js` extraction) should be committed and validated in
  Phase 0 before any feature work.
