const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const {
  createAdminSession,
  extractBearerToken,
  getAdminSession,
  getConfiguredUsername,
  isAdminSetupRequired,
  isValidAdminCredentials,
  setupAdminCredentials,
  revokeAdminSession
} = require("../services/adminAuthService");
const {
  createUser,
  updateUserByCode,
  addPointsToUser,
  addPointsToUserByName,
  assignBadgeToUserByName,
  acceptBadgeShareRequest,
  createBadge,
  updateBadge,
  createBadgeShareRequest,
  createForumMessage,
  createQuest,
  createEvent,
  joinQuest,
  createQuestRequest,
  createRequest,
  getAvailableQuests,
  getAvailableQuestsForUser,
  getBadges,
  getBadgeNetworkByBadgeId,
  getBadgeChainsByBadgeId,
  getBadgeChainsByUserCode,
  getBadgeShareOptionsForUser,
  getForumMessages,
  getCommunityEvents,
  getIncomingBadgeShareRequests,
  getApprovedRequestsByUserCode,
  getPendingRequests,
  recordMeeting,
  getSortedUsers,
  getUserByCode,
  processRequest
} = require("../services/scoreboardService");

const router = express.Router();
const badgesUploadDir = path.join(__dirname, "..", "..", "public", "uploads", "badges");

function requireAdminAuth(req, _res, next) {
  const token = extractBearerToken(req.get("authorization"));
  const session = getAdminSession(token);

  if (!session) {
    const error = new Error("Za to dejanje je potrebna administratorska prijava.");
    error.statusCode = 401;
    throw error;
  }

  req.adminSession = session;
  next();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(badgesUploadDir, { recursive: true });
    cb(null, badgesUploadDir);
  },
  filename: (_req, file, cb) => {
    const sanitizedBaseName = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 40) || "badge";
    const extension = path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `${Date.now()}-${sanitizedBaseName}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Datoteka značke mora biti slika."));
      return;
    }

    cb(null, true);
  }
});

router.get("/users", (_req, res) => {
  res.json(getSortedUsers());
});

router.get("/users/:code/approved-requests", (req, res) => {
  const result = getApprovedRequestsByUserCode(req.params.code);
  res.json(result);
});

router.get("/users/:code/quests", (req, res) => {
  res.json(getAvailableQuestsForUser(req.params.code));
});

router.get("/users/:code/badge-share-options", (req, res) => {
  res.json(getBadgeShareOptionsForUser(req.params.code));
});

router.get("/users/:code/badge-chains", (req, res) => {
  res.json(getBadgeChainsByUserCode(req.params.code));
});

router.get("/users/:code/incoming-badge-requests", (req, res) => {
  res.json(getIncomingBadgeShareRequests(req.params.code));
});

router.get("/users/:code", (req, res) => {
  const user = getUserByCode(req.params.code);
  res.json(user);
});

router.get("/quests", (_req, res) => {
  res.json(getAvailableQuests());
});

router.get("/events", (_req, res) => {
  res.json(getCommunityEvents());
});

router.get("/badges", (_req, res) => {
  res.json(getBadges());
});

router.get("/badges/:id/chains", requireAdminAuth, (req, res) => {
  res.json(getBadgeChainsByBadgeId(req.params.id));
});

router.get("/badges/:id/network", (req, res) => {
  res.json(getBadgeNetworkByBadgeId(req.params.id));
});

router.get("/forum-messages", (_req, res) => {
  res.json(getForumMessages());
});

router.post("/admin/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (isAdminSetupRequired()) {
    const error = new Error("Najprej nastavi administratorsko geslo.");
    error.statusCode = 403;
    throw error;
  }

  if (!isValidAdminCredentials(username, password)) {
    const error = new Error("Napačno administratorsko uporabniško ime ali geslo.");
    error.statusCode = 401;
    throw error;
  }

  const resolvedUsername = getConfiguredUsername();
  const session = createAdminSession(resolvedUsername);

  res.status(201).json({
    token: session.token,
    username: resolvedUsername,
    expiresAt: session.expiresAt
  });
});

router.post("/admin/setup", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const configuredAdmin = setupAdminCredentials(username, password);
  const session = createAdminSession(configuredAdmin.username);

  res.status(201).json({
    token: session.token,
    username: configuredAdmin.username,
    expiresAt: session.expiresAt
  });
});

router.get("/admin/session", requireAdminAuth, (req, res) => {
  res.json({
    username: req.adminSession.username,
    expiresAt: req.adminSession.expiresAt
  });
});

router.post("/admin/logout", requireAdminAuth, (req, res) => {
  const token = extractBearerToken(req.get("authorization"));
  revokeAdminSession(token);
  res.status(204).send();
});

router.get("/admin/config", (_req, res) => {
  res.json({
    username: getConfiguredUsername(),
    setupRequired: isAdminSetupRequired()
  });
});

router.post("/users", requireAdminAuth, (req, res) => {
  const user = createUser(req.body);
  res.status(201).json(user);
});

router.put("/users/:code", requireAdminAuth, (req, res) => {
  const user = updateUserByCode(req.params.code, req.body);
  res.json(user);
});

router.post("/quests", requireAdminAuth, (req, res) => {
  const quest = createQuest(req.body);
  res.status(201).json(quest);
});

router.post("/events", requireAdminAuth, (req, res) => {
  const event = createEvent(req.body);
  res.status(201).json(event);
});

router.post("/badges", requireAdminAuth, upload.single("image"), (req, res) => {
  const badge = createBadge({
    name: req.body.name,
    requirements: req.body.requirements,
    description: req.body.description,
    levelDescriptions: Array.isArray(req.body.levelDescriptions)
      ? req.body.levelDescriptions
      : [req.body.levelDescriptions].filter(Boolean),
    imagePath: req.file ? `/uploads/badges/${req.file.filename}` : ""
  });
  res.status(201).json(badge);
});

router.put("/badges/:id", requireAdminAuth, upload.single("image"), (req, res) => {
  const badge = updateBadge(req.params.id, {
    name: req.body.name,
    requirements: req.body.requirements,
    description: req.body.description,
    levelDescriptions: Array.isArray(req.body.levelDescriptions)
      ? req.body.levelDescriptions
      : [req.body.levelDescriptions].filter(Boolean),
    imagePath: req.file ? `/uploads/badges/${req.file.filename}` : ""
  });
  res.json(badge);
});

router.post("/badges/assign", requireAdminAuth, (req, res) => {
  const user = assignBadgeToUserByName(req.body.name, req.body.badgeId, req.body.level);
  res.json(user);
});

router.post("/badge-share-requests", (req, res) => {
  const request = createBadgeShareRequest(req.body);
  res.status(201).json(request);
});

router.post("/badge-share-requests/:id/accept", (req, res) => {
  const request = acceptBadgeShareRequest(req.params.id, req.body.targetCode, req.body.approvedLevel);
  res.json(request);
});

router.post("/forum-messages", (req, res) => {
  const message = createForumMessage(req.body);
  res.status(201).json(message);
});

router.post("/quest-joins", (req, res) => {
  const quest = joinQuest(req.body);
  res.json(quest);
});

router.post("/requests", (req, res) => {
  const request = createRequest(req.body);
  res.status(201).json(request);
});

router.post("/quest-requests", (req, res) => {
  const request = createQuestRequest(req.body);
  res.status(201).json(request);
});

router.get("/requests/pending", requireAdminAuth, (_req, res) => {
  res.json(getPendingRequests());
});

router.post("/meetings", requireAdminAuth, (req, res) => {
  const result = recordMeeting(req.body);
  res.status(201).json(result);
});

router.post("/requests/:id/approve", requireAdminAuth, (req, res) => {
  const result = processRequest(req.params.id, "approved");
  res.json(result);
});

router.post("/requests/:id/reject", requireAdminAuth, (req, res) => {
  const result = processRequest(req.params.id, "rejected");
  res.json(result);
});

router.post("/users/by-name/points", requireAdminAuth, (req, res) => {
  const user = addPointsToUserByName(req.body.name, req.body.points, req.body.reason);
  res.json(user);
});

router.post("/users/:code/points", (req, res) => {
  const user = addPointsToUser(req.params.code, req.body.points);
  res.json(user);
});

module.exports = {
  router
};
