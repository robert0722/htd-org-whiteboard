# HTD Org Whiteboard

A lightweight HTD Talent org planning whiteboard for headcount planning sessions.

## What It Does

- Drag people cards around a whiteboard-style canvas.
- Edit name, job title, reporting manager, annual/monthly cost, and cost cadence.
- Connect people into an org hierarchy.
- Show total annualized and monthly team cost.
- Save one shared board that syncs between localhost and staging.

## Live URLs

- Staging app: https://htd-org-whiteboard.onrender.com
- Shared board API: https://htd-org-whiteboard-api.onrender.com
- GitHub repo: https://github.com/robert0722/htd-org-whiteboard

The staging app and local dev app both use the same shared API by default.

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173.

The local Vite app defaults to the deployed shared API:

```txt
https://htd-org-whiteboard-api.onrender.com
```

To point local dev at a different API:

```bash
VITE_BOARD_API_URL=http://localhost:10000 npm run dev
```

## Build

```bash
npm run build
```

The production build is written to `dist/`.

## Local Full-Stack Run

Build the frontend, then run the Express API/static server:

```bash
npm run build
GITHUB_TOKEN=<github-token-with-repo-access> npm start
```

Open http://localhost:10000.

## Documentation

- [Project context](./AGENTS.md)
- [Architecture](./docs/architecture.md)
- [Deployment](./docs/deployment.md)
- [Operations](./docs/operations.md)
