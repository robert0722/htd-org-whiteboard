# Project Context for Future Threads

## Summary

This repo contains the HTD Org Whiteboard, a small React/Vite planning app for headcount and reporting-line planning. It is deployed on Render and uses a tiny Express API to persist multiple shared board states in GitHub.

## Important URLs

- Staging app: https://htd-org-whiteboard.onrender.com
- API service: https://htd-org-whiteboard-api.onrender.com
- GitHub repo: https://github.com/robert0722/htd-org-whiteboard
- Static service dashboard: https://dashboard.render.com/static/srv-d8gnqd3bc2fs73eq6ko0
- API service dashboard: https://dashboard.render.com/web/srv-d8gnu1rbc2fs73eqbjhg

## Current Architecture

- `src/App.tsx` owns the full client UI and board behavior.
- `server/index.js` exposes the shared board API and serves the production frontend for the API web service.
- `data/board.json` is the shared v2 boards document. It is written by the API through the GitHub Contents API.
- Localhost and staging both default to `https://htd-org-whiteboard-api.onrender.com` for shared state.

## Persistence Model

The app is not multiplayer realtime. It is shared-save synchronization:

- App load: fetches `/api/boards` from the shared API.
- Save button: sends the active board to `PUT /api/boards/:id`.
- Delete board: sends `DELETE /api/boards/:id`.
- API writes the full v2 boards document back to `data/board.json` in GitHub.
- Legacy `/api/board` GET/PUT remains for stale frontends and maps to the first board.
- When a browser has no unsaved local edits, it polls every 6 seconds and applies newer shared state for the active board.
- Local storage remains as a fallback if the shared API is unavailable.

Render free services may cold start. The frontend has retry/backoff for API load/save.

## Render Services

Static staging service:

- Name: `htd-org-whiteboard`
- ID: `srv-d8gnqd3bc2fs73eq6ko0`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`

API web service:

- Name: `htd-org-whiteboard-api`
- ID: `srv-d8gnu1rbc2fs73eqbjhg`
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health path: `/api/health`
- Required env var: `GITHUB_TOKEN`

## Safe Commands

```bash
npm run build
render deploys list srv-d8gnqd3bc2fs73eq6ko0 --output json
render deploys list srv-d8gnu1rbc2fs73eqbjhg --output json
curl -sS https://htd-org-whiteboard-api.onrender.com/api/boards
```

## Gotchas

- Do not commit or expose the Render API `GITHUB_TOKEN`.
- Saving or deleting boards creates commits to `data/board.json`, so local pushes may need `git pull --rebase` first.
- The GitHub repo is public because Render initially could not fetch it while private.
- If staging appears stale, use a cache-busting URL like `https://htd-org-whiteboard.onrender.com/?v=<timestamp>`.
- If the first API request fails after inactivity, wait a few seconds and retry; free Render services can wake slowly.
