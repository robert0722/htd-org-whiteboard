# Architecture

## Overview

HTD Org Whiteboard is a single-page React app with a small Express API. It is built for simple org planning: draggable people cards, reporting-line connections, cost entry, total team cost, and a manual Save workflow.

## Frontend

The frontend lives in `src/`.

- `src/main.tsx` mounts the app.
- `src/App.tsx` contains board state, drag behavior, connector behavior, manager changes, cost totals, save/load sync, and the inspector panel.
- `src/styles.css` contains the HTD-branded visual system.

The app uses Vite and React. It has no router and no client-side auth.

## Board Data Shape

The saved board has three top-level fields:

```ts
type BoardState = {
  people: PersonCard[];
  connections: Connection[];
  zoom: number;
};
```

Each person card includes:

```ts
type PersonCard = {
  id: string;
  name: string;
  title: string;
  costType: "monthly" | "annual";
  costAmount: string;
  x: number;
  y: number;
};
```

Each connection represents one reporting line:

```ts
type Connection = {
  id: string;
  fromId: string;
  toId: string;
};
```

`fromId` is the manager. `toId` is the report.

## Sync Behavior

The app is shared-save, not realtime collaborative editing.

On load:

1. Fetch `GET /api/board` from the shared API.
2. If a shared board exists, use it.
3. If no shared board exists but local storage has a board, seed the shared API once.
4. If the API is unavailable, use local storage as a fallback.

On Save:

1. Send the full board to `PUT /api/board`.
2. API writes the board to GitHub as `data/board.json`.
3. The frontend updates its saved signature and clears the unsaved-changes state.

While open:

- If the current browser has no unsaved edits, it checks the shared API every 6 seconds.
- If another saved board appears, it updates the local canvas.
- If the current browser has unsaved edits, it does not overwrite them.

## Backend API

The backend lives in `server/index.js`.

Endpoints:

- `GET /api/health`: Render health check.
- `GET /api/board`: returns `{ board, updatedAt }`.
- `PUT /api/board`: validates and saves a full `BoardState`.

The API persists board state by using `GITHUB_TOKEN` to call GitHub's Contents API. It reads and writes `data/board.json` on the configured branch.

## Persistence Tradeoff

GitHub-backed persistence was chosen because this project needed quick shared state without introducing a database. It is appropriate for one planning board with manual saves. It is not ideal for high-frequency editing, concurrent editing, audit-grade history, or multi-board support.

If this becomes a heavier product, move persistence to a small database table with optimistic concurrency.
