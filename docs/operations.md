# Operations

## How Saving Works

The Save button writes the whole board to the shared API. The API commits the board to:

```txt
data/board.json
```

That means normal user saves can create Git commits. If a future code push is rejected, run:

```bash
git pull --rebase
git push
```

Review `data/board.json` before resolving conflicts.

## Restoring or Editing Board State

The safest way to update the board is through the app UI and Save button.

For manual recovery:

1. Inspect `data/board.json`.
2. Restore a previous Git version if needed.
3. Push the restored file.
4. Refresh staging.

Example:

```bash
git log --oneline -- data/board.json
git show <commit>:data/board.json
```

## Common Issues

### Staging Loads Starter Data

Likely causes:

- The API is cold-starting.
- The frontend is using an old cached static bundle.
- `data/board.json` is missing or invalid.

Checks:

```bash
curl -sS https://htd-org-whiteboard-api.onrender.com/api/board
curl -sS 'https://htd-org-whiteboard.onrender.com/?v=debug'
```

### Save Says Cloud Save Failed

Likely causes:

- API service is waking up.
- `GITHUB_TOKEN` is missing or expired in Render.
- GitHub rejected the Contents API write because the file changed concurrently.

Checks:

```bash
render logs --resources srv-d8gnu1rbc2fs73eqbjhg --limit 100 --output text
curl -sS https://htd-org-whiteboard-api.onrender.com/api/health
```

### Push Rejected After User Saves

The API likely committed `data/board.json` after your local branch was last pulled.

Fix:

```bash
git pull --rebase
git push
```

### First API Request Shows a CORS-Looking Error

On Render free services, the first request after inactivity may hit before the instance is awake. The frontend retries load/save requests with backoff. Wait a few seconds and refresh if needed.

## Changing the Shared API URL

The frontend reads:

```txt
VITE_BOARD_API_URL
```

If unset, it defaults to:

```txt
https://htd-org-whiteboard-api.onrender.com
```

For local full-stack testing:

```bash
npm run build
GITHUB_TOKEN=<token> npm start
VITE_BOARD_API_URL=http://localhost:10000 npm run dev
```

Run the API and Vite dev server in separate terminals.

## Current Shared Board

As of the first shared-sync setup, the board had:

- 8 people
- 7 reporting connections
- $91,000 annualized total cost

The source of truth is always `data/board.json`.
