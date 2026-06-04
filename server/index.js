const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 10000;
const owner = process.env.GITHUB_REPO_OWNER || "robert0722";
const repo = process.env.GITHUB_REPO_NAME || "htd-org-whiteboard";
const branch = process.env.GITHUB_BRANCH || "main";
const dataPath = process.env.BOARD_DATA_PATH || "data/board.json";
const githubToken = process.env.GITHUB_TOKEN;

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
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

async function getBoardFile() {
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
    board: JSON.parse(content),
    sha: payload.sha
  };
}

function isBoardState(value) {
  return (
    value &&
    Array.isArray(value.people) &&
    Array.isArray(value.connections) &&
    typeof value.zoom === "number"
  );
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/board", async (_req, res) => {
  try {
    const file = await getBoardFile();
    res.json({
      board: file?.board ?? null,
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

    const existing = await getBoardFile();
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dataPath}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: githubHeaders(),
      body: JSON.stringify({
        branch,
        message: "Save org whiteboard state",
        content: Buffer.from(JSON.stringify(req.body, null, 2)).toString("base64"),
        sha: existing?.sha
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`GitHub save failed with ${response.status}: ${detail}`);
    }

    res.json({ ok: true, savedAt: new Date().toISOString() });
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
