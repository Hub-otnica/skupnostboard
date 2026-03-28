const express = require("express");
const path = require("path");
const { router: apiRouter } = require("./routes/api");
const { ensureDataFile } = require("./data/store");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const publicDir = path.join(__dirname, "..", "public");

ensureDataFile();

app.use(express.json());
app.use(express.static(publicDir));

app.use("/api", apiRouter);

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/user", (_req, res) => {
  res.sendFile(path.join(publicDir, "user.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

app.get("/player", (_req, res) => {
  res.sendFile(path.join(publicDir, "player.html"));
});

app.get("/forum", (_req, res) => {
  res.sendFile(path.join(publicDir, "forum.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);

  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Slika značke je prevelika. Največja dovoljena velikost je 5 MB." });
  }

  return res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, HOST, () => {
  console.log(`Scoreboard app running at http://${HOST}:${PORT}`);
});
