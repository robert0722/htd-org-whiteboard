# Deployment

## Services

The project is deployed to Render with two services.

Static staging app:

- URL: https://htd-org-whiteboard.onrender.com
- Render service ID: `srv-d8gnqd3bc2fs73eq6ko0`
- Type: static site
- Build command: `npm ci && npm run build`
- Publish directory: `dist`

Shared API:

- URL: https://htd-org-whiteboard-api.onrender.com
- Render service ID: `srv-d8gnu1rbc2fs73eqbjhg`
- Type: web service
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

## Required API Environment Variables

The API service needs:

```txt
GITHUB_TOKEN=<token with repo contents read/write access>
GITHUB_REPO_OWNER=robert0722
GITHUB_REPO_NAME=htd-org-whiteboard
GITHUB_BRANCH=main
BOARD_DATA_PATH=data/board.json
```

Do not put `GITHUB_TOKEN` in frontend code or commit it.

## Deploying Code Changes

1. Build locally:

```bash
npm run build
```

2. Commit and push:

```bash
git add .
git commit -m "<message>"
git push
```

3. If Render does not auto-deploy the static site, trigger it:

```bash
render deploys create srv-d8gnqd3bc2fs73eq6ko0 --confirm --output json
```

4. If API code changed and Render does not auto-deploy it, trigger it:

```bash
render deploys create srv-d8gnu1rbc2fs73eqbjhg --confirm --output json
```

## Checking Deploy Status

```bash
render deploys list srv-d8gnqd3bc2fs73eq6ko0 --output json
render deploys list srv-d8gnu1rbc2fs73eqbjhg --output json
```

## Smoke Test

Check API health:

```bash
curl -sS https://htd-org-whiteboard-api.onrender.com/api/health
```

Check shared boards:

```bash
curl -sS https://htd-org-whiteboard-api.onrender.com/api/boards
```

The legacy single-board endpoint should also return the first board for old clients:

```bash
curl -sS https://htd-org-whiteboard-api.onrender.com/api/board
```

Open staging:

```txt
https://htd-org-whiteboard.onrender.com
```

Expected result:

- App loads the board selector and the org board.
- Save button is present.
- Total team cost appears in the right panel.
- Existing shared people appear from `data/board.json`.

## Cache Notes

Render static pages can briefly serve cached HTML after a deploy. If staging looks stale, use:

```txt
https://htd-org-whiteboard.onrender.com/?v=<timestamp>
```
