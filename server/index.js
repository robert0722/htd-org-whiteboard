const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 10000;
const owner = process.env.GITHUB_REPO_OWNER || "robert0722";
const repo = process.env.GITHUB_REPO_NAME || "htd-org-whiteboard";
const branch = process.env.GITHUB_BRANCH || "main";
const dataPath = process.env.BOARD_DATA_PATH || "data/board.json";
const githubToken = process.env.GITHUB_TOKEN;
const MAIN_BOARD_ID = "main-board";
const DEFAULT_BOARD_NAME = "Untitled board";

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

function githubHeaders() {
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN is not configured");
  }

  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${githubToken}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

async function getDataFile() {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dataPath}?ref=${branch}`;
  const response = await fetch(url, { headers: githubHeaders() });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub read failed with ${response.status}`);
  }

  const payload = await response.json();
  const content = Buffer.from(payload.content, "base64").toString("utf8");
  return {
    value: JSON.parse(content),
    sha: payload.sha
  };
}

async function saveDataFile(document, sha, message) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dataPath}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(),
    body: JSON.stringify({
      branch,
      message,
      content: Buffer.from(JSON.stringify(document, null, 2)).toString("base64"),
      sha
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub save failed with ${response.status}: ${detail}`);
  }
}

function isBoardState(value) {
  return (
    value &&
    Array.isArray(value.people) &&
    Array.isArray(value.connections) &&
    typeof value.zoom === "number"
  );
}

function normalizeBoardName(value) {
  if (typeof value !== "string") {
    return DEFAULT_BOARD_NAME;
  }

  const trimmed = value.trim();
  return trimmed || DEFAULT_BOARD_NAME;
}

function normalizeBoardRecord(value, fallbackId) {
  if (!value || !isBoardState(value.state)) {
    return null;
  }

  const now = new Date().toISOString();
  const id =
    typeof value.id === "string" && value.id.trim()
      ? value.id.trim()
      : fallbackId;

  if (!id) {
    return null;
  }

  return {
    id,
    name: normalizeBoardName(value.name),
    createdAt:
      typeof value.createdAt === "string" && value.createdAt
        ? value.createdAt
        : now,
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt
        ? value.updatedAt
        : now,
    scenarioOf:
      typeof value.scenarioOf === "string" && value.scenarioOf.trim()
        ? value.scenarioOf.trim()
        : undefined,
    state: value.state
  };
}

function toBoardsDocument(value) {
  const now = new Date().toISOString();

  if (value?.version === 2 && Array.isArray(value.boards)) {
    return {
      document: {
        version: 2,
        boards: value.boards
          .map((board, index) => normalizeBoardRecord(board, `board-${index + 1}`))
          .filter(Boolean)
      },
      migrated: false
    };
  }

  if (isBoardState(value)) {
    return {
      document: {
        version: 2,
        boards: [
          {
            id: MAIN_BOARD_ID,
            name: "Main Board",
            createdAt: now,
            updatedAt: now,
            state: value
          }
        ]
      },
      migrated: true
    };
  }

  return {
    document: {
      version: 2,
      boards: []
    },
    migrated: false
  };
}

async function getBoardsFile() {
  const file = await getDataFile();
  if (!file) {
    return {
      document: {
        version: 2,
        boards: []
      },
      sha: undefined,
      migrated: false
    };
  }

  const { document, migrated } = toBoardsDocument(file.value);
  return {
    document,
    sha: file.sha,
    migrated
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/boards", async (_req, res) => {
  try {
    const file = await getBoardsFile();
    res.json({
      version: file.document.version,
      boards: file.document.boards,
      migrated: file.migrated,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/boards/:id", async (req, res) => {
  try {
    const id = req.params.id.trim();
    if (!id) {
      res.status(400).json({ error: "Board ID is required" });
      return;
    }

    if (!isBoardState(req.body?.state)) {
      res.status(400).json({ error: "Invalid board payload" });
      return;
    }

    const file = await getBoardsFile();
    const now = new Date().toISOString();
    const existing = file.document.boards.find((board) => board.id === id);
    const nextBoard = {
      id,
      name: normalizeBoardName(req.body.name ?? existing?.name),
      createdAt: existing?.createdAt ?? req.body.createdAt ?? now,
      updatedAt: now,
      scenarioOf:
        typeof req.body.scenarioOf === "string" && req.body.scenarioOf.trim()
          ? req.body.scenarioOf.trim()
          : existing?.scenarioOf,
      state: req.body.state
    };
    const document = {
      version: 2,
      boards: [
        ...file.document.boards.filter((board) => board.id !== id),
        nextBoard
      ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    };

    await saveDataFile(document, file.sha, `Save org whiteboard board: ${nextBoard.name}`);

    res.json({ ok: true, board: nextBoard, savedAt: now });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/boards/:id", async (req, res) => {
  try {
    const id = req.params.id.trim();
    if (!id) {
      res.status(400).json({ error: "Board ID is required" });
      return;
    }

    const file = await getBoardsFile();
    const document = {
      version: 2,
      boards: file.document.boards.filter((board) => board.id !== id)
    };

    await saveDataFile(document, file.sha, `Delete org whiteboard board: ${id}`);

    res.json({
      ok: true,
      deletedId: id,
      boards: document.boards,
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/board", async (_req, res) => {
  try {
    const file = await getBoardsFile();
    res.json({
      board: file.document.boards[0]?.state ?? null,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/board", async (req, res) => {
  try {
    if (!isBoardState(req.body)) {
      res.status(400).json({ error: "Invalid board payload" });
      return;
    }

    const file = await getBoardsFile();
    const now = new Date().toISOString();
    const existing = file.document.boards[0];
    const board = {
      id: existing?.id ?? MAIN_BOARD_ID,
      name: existing?.name ?? "Main Board",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      state: req.body
    };
    const document = {
      version: 2,
      boards: [
        board,
        ...file.document.boards.filter((entry) => entry.id !== board.id)
      ]
    };

    await saveDataFile(document, file.sha, "Save org whiteboard state");

    res.json({ ok: true, savedAt: now });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use(express.static(path.join(__dirname, "..", "dist")));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`HTD org whiteboard listening on ${port}`);
});
