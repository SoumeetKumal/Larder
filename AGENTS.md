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

## Other conventions

- Lint: `npm run lint` (stylelint on styles.css)
- Tests: `npm test`
- Do not add code comments unless asked.
