# Architecture

## Overview

HTD Org Whiteboard is a single-page React app with a small Express API. It is built for simple org planning: multiple named boards, draggable people cards, reporting-line connections, cost entry, total team cost, and a manual Save workflow.

## Frontend

The frontend lives in `src/`.

- `src/main.tsx` mounts the app.
- `src/App.tsx` contains the board list, active board draft, drag behavior, connector behavior, manager changes, cost totals, save/load sync, and the inspector panel.
- `src/styles.css` contains the HTD-branded visual system.

The app uses Vite and React. It has no router and no client-side auth.

## Board Data Shape

The saved file is a v2 document with multiple board records:

```ts
type BoardsDocument = {
  version: 2;
  boards: BoardRecord[];
};

type BoardRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  state: BoardState;
};
```

Each board record keeps the original board state shape:

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

1. Fetch `GET /api/boards` from the shared API.
2. If shared boards exist, use them and reopen the browser's last active board when possible.
3. If the API has no boards or is unavailable, use local storage as a fallback.
4. Old single-board documents are migrated into one board named `Main Board`.

On Save:

1. Send the active board record to `PUT /api/boards/:id`.
2. API updates only that board in the shared v2 document.
3. API writes the full document to GitHub as `data/board.json`.
4. The frontend updates its saved signature and clears the unsaved-changes state for the active board.

While open:

- If the current browser has no unsaved edits, it checks the shared API every 6 seconds.
- If another saved update changes the active board, it updates the local canvas.
- If the current browser has unsaved edits, it does not overwrite them.
- Switching boards with unsaved edits opens an in-app discard confirmation.

## Backend API

The backend lives in `server/index.js`.

Endpoints:

- `GET /api/health`: Render health check.
- `GET /api/boards`: returns `{ version, boards, updatedAt }`.
- `PUT /api/boards/:id`: validates and saves one board record.
- `DELETE /api/boards/:id`: deletes one board record.
- `GET /api/board`: legacy compatibility endpoint returning the first board state.
- `PUT /api/board`: legacy compatibility endpoint saving the first board state into the v2 document.

The API persists board state by using `GITHUB_TOKEN` to call GitHub's Contents API. It reads and writes `data/board.json` on the configured branch.

## Persistence Tradeoff

GitHub-backed persistence was chosen because this project needed quick shared state without introducing a database. It is appropriate for a small set of planning boards with manual saves. It is not ideal for high-frequency editing, concurrent editing, audit-grade history, or large-board collections.

If this becomes a heavier product, move persistence to a small database table with optimistic concurrency.
