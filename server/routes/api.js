const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const {
  attachAdminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  extractAdminSessionToken,
  extractBearerToken,
  getAdminSession,
  getConfiguredUsername,
  isAdminSetupRequired,
  isValidAdminCredentials,
  setupAdminCredentials,
  revokeAdminSession
} = require("../services/adminAuthService");
const {
  attachUserSessionCookie,
  authenticateUser,
  changeUserPasswordById,
  clearUserSessionCookie,
  createUserSession,
  extractUserSessionToken,
  getUserSession,
  revokeUserSession,
  setUserPasswordById,
  validateUserPassword
} = require("../services/userAuthService");
const {
  createUser,
  updateUserByCode,
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
  const token = extractBearerToken(req.get("authorization")) || extractAdminSessionToken(req.get("cookie"));
  const session = getAdminSession(token);

  if (!session) {
    const error = new Error("Za to dejanje je potrebna administratorska prijava.");
    error.statusCode = 401;
    throw error;
  }

  req.adminSession = session;
  next();
}

function requireUserAuth(req, _res, next) {
  const token = extractUserSessionToken(req.get("cookie"));
  const session = getUserSession(token);

  if (!session) {
    const error = new Error("Za to dejanje se moraš prijaviti kot mentorica/mentor.");
    error.statusCode = 401;
    throw error;
  }

  req.userSession = session;
  req.authenticatedUser = session.user;
  next();
}

function requireMatchingUser(req, _res, next) {
  const token = extractUserSessionToken(req.get("cookie"));
  const session = getUserSession(token);

  if (!session) {
    const error = new Error("Za to dejanje se moraš prijaviti kot mentorica/mentor.");
    error.statusCode = 401;
    throw error;
  }

  if (String(req.params.code || "").trim().toUpperCase() !== session.user.code) {
    const error = new Error("Dostopaš lahko le do svojega mentorskega profila.");
    error.statusCode = 403;
    throw error;
  }

  req.userSession = session;
  req.authenticatedUser = session.user;
  next();
}

function requireUserReady(req, _res, next) {
  if (req.authenticatedUser.mustChangePassword) {
    const error = new Error("Pred nadaljevanjem moraš nastaviti novo geslo.");
    error.statusCode = 403;
    throw error;
  }

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

router.get("/users/:code/quests", requireMatchingUser, (req, res) => {
  res.json(getAvailableQuestsForUser(req.params.code));
});

router.get("/users/:code/badge-share-options", requireMatchingUser, (req, res) => {
  res.json(getBadgeShareOptionsForUser(req.params.code));
});

router.get("/users/:code/badge-chains", requireMatchingUser, (req, res) => {
  res.json(getBadgeChainsByUserCode(req.params.code));
});

router.get("/users/:code/incoming-badge-requests", requireMatchingUser, (req, res) => {
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

router.post("/auth/login", (req, res) => {
  const username = String(req.body.username || req.body.code || "").trim();
  const password = String(req.body.password || "");
  const user = authenticateUser(username, password);
  const session = createUserSession(user);

  attachUserSessionCookie(res, session);
  res.status(201).json({
    name: user.name,
    mustChangePassword: user.mustChangePassword === true,
    expiresAt: session.expiresAt
  });
});

router.post("/auth/logout", (req, res) => {
  const token = extractUserSessionToken(req.get("cookie"));
  revokeUserSession(token);
  clearUserSessionCookie(res);
  res.status(204).send();
});

router.get("/me", requireUserAuth, (req, res) => {
  res.json({
    ...getUserByCode(req.authenticatedUser.code),
    mustChangePassword: req.authenticatedUser.mustChangePassword === true
  });
});

router.post("/auth/change-password", requireUserAuth, (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  const updatedUser = changeUserPasswordById(req.authenticatedUser.id, currentPassword, newPassword);
  const session = createUserSession(updatedUser);

  attachUserSessionCookie(res, session);
  res.json({
    name: updatedUser.name,
    mustChangePassword: false,
    expiresAt: session.expiresAt
  });
});

router.get("/me/quests", requireUserAuth, requireUserReady, (req, res) => {
  res.json(getAvailableQuestsForUser(req.authenticatedUser.code));
});

router.get("/me/badge-share-options", requireUserAuth, requireUserReady, (req, res) => {
  res.json(getBadgeShareOptionsForUser(req.authenticatedUser.code));
});

router.get("/me/badge-chains", requireUserAuth, requireUserReady, (req, res) => {
  res.json(getBadgeChainsByUserCode(req.authenticatedUser.code));
});

router.get("/me/incoming-badge-requests", requireUserAuth, requireUserReady, (req, res) => {
  res.json(getIncomingBadgeShareRequests(req.authenticatedUser.code));
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

  attachAdminSessionCookie(res, session);
  res.status(201).json({
    username: resolvedUsername,
    expiresAt: session.expiresAt
  });
});

router.post("/admin/setup", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const configuredAdmin = setupAdminCredentials(username, password);
  const session = createAdminSession(configuredAdmin.username);

  attachAdminSessionCookie(res, session);
  res.status(201).json({
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
  const token = extractBearerToken(req.get("authorization")) || extractAdminSessionToken(req.get("cookie"));
  revokeAdminSession(token);
  clearAdminSessionCookie(res);
  res.status(204).send();
});

router.get("/admin/config", (_req, res) => {
  res.json({
    username: getConfiguredUsername(),
    setupRequired: isAdminSetupRequired()
  });
});

router.post("/users", requireAdminAuth, (req, res) => {
  validateUserPassword(req.body.password);
  const user = createUser(req.body);
  setUserPasswordById(user.id, req.body.password, { mustChangePassword: true });
  res.status(201).json(user);
});

router.put("/users/:code", requireAdminAuth, (req, res) => {
  if (String(req.body.password || "").trim()) {
    validateUserPassword(req.body.password);
  }

  const user = updateUserByCode(req.params.code, req.body);

  if (String(req.body.password || "").trim()) {
    setUserPasswordById(user.id, req.body.password, { mustChangePassword: true });
  }

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

router.post("/badge-share-requests", requireUserAuth, requireUserReady, (req, res) => {
  const request = createBadgeShareRequest({
    requesterCode: req.authenticatedUser.code,
    targetCode: req.body.targetCode,
    badgeId: req.body.badgeId
  });
  res.status(201).json(request);
});

router.post("/badge-share-requests/:id/accept", requireUserAuth, requireUserReady, (req, res) => {
  const request = acceptBadgeShareRequest(req.params.id, req.authenticatedUser.code, req.body.approvedLevel);
  res.json(request);
});

router.post("/forum-messages", requireUserAuth, requireUserReady, (req, res) => {
  const message = createForumMessage({
    code: req.authenticatedUser.code,
    content: req.body.content
  });
  res.status(201).json(message);
});

router.post("/quest-joins", requireUserAuth, requireUserReady, (req, res) => {
  const quest = joinQuest({
    code: req.authenticatedUser.code,
    questId: req.body.questId
  });
  res.json(quest);
});

router.post("/requests", requireUserAuth, requireUserReady, (req, res) => {
  const request = createRequest({
    code: req.authenticatedUser.code,
    points: req.body.points,
    reason: req.body.reason
  });
  res.status(201).json(request);
});

router.post("/quest-requests", requireUserAuth, requireUserReady, (req, res) => {
  const request = createQuestRequest({
    code: req.authenticatedUser.code,
    questId: req.body.questId,
    completedSteps: req.body.completedSteps
  });
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

module.exports = {
  router
};
