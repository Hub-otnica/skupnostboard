const fs = require("fs");
const path = require("path");

const dataDir = __dirname;

function getDataFilePath() {
  const customPath = String(process.env.SKORBORD_DATA_FILE_PATH || "").trim();
  return customPath || path.join(dataDir, "db.json");
}

const defaultData = {
  users: [
    {
      id: 1,
      name: "Alex",
      code: "ALEX01",
      points: 20,
      attendance: 0
    },
    {
      id: 2,
      name: "Sam",
      code: "SAM02",
      points: 12,
      attendance: 0
    }
  ],
  requests: [],
  meetings: [],
  quests: [],
  events: [],
  badges: [],
  badgeTransfers: [],
  directMessages: [],
  forumMessages: [],
  userAuth: [],
  adminAuth: {
    username: "admin",
    passwordHash: "",
    passwordSalt: "",
    passwordUpdatedAt: ""
  }
};

function ensureDataFile() {
  const dataFilePath = getDataFilePath();
  const resolvedDataDir = path.dirname(dataFilePath);

  if (!fs.existsSync(resolvedDataDir)) {
    fs.mkdirSync(resolvedDataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify(defaultData, null, 2));
  }
}

function readData() {
  const dataFilePath = getDataFilePath();
  ensureDataFile();
  const rawData = fs.readFileSync(dataFilePath, "utf8");
  const data = JSON.parse(rawData);

  if (!Array.isArray(data.users)) {
    data.users = [];
  }

  if (!Array.isArray(data.requests)) {
    data.requests = [];
  }

  if (!Array.isArray(data.meetings)) {
    data.meetings = [];
  }

  if (!Array.isArray(data.quests)) {
    data.quests = [];
  }

  if (!Array.isArray(data.events)) {
    data.events = [];
  }

  if (!Array.isArray(data.badges)) {
    data.badges = [];
  }

  if (!Array.isArray(data.badgeTransfers)) {
    data.badgeTransfers = [];
  }

  if (!Array.isArray(data.directMessages)) {
    data.directMessages = [];
  }

  if (!Array.isArray(data.forumMessages)) {
    data.forumMessages = [];
  }

  if (!Array.isArray(data.userAuth)) {
    data.userAuth = [];
  }

  if (!data.adminAuth || typeof data.adminAuth !== "object") {
    data.adminAuth = {};
  }

  data.adminAuth = {
    username: String(data.adminAuth.username || "admin").trim() || "admin",
    passwordHash: String(data.adminAuth.passwordHash || "").trim(),
    passwordSalt: String(data.adminAuth.passwordSalt || "").trim(),
    passwordUpdatedAt: String(data.adminAuth.passwordUpdatedAt || "").trim()
  };

  data.users = data.users.map((user) => ({
    ...user,
    points: Number.isInteger(user.points) ? user.points : 0,
    attendance: Number.isInteger(user.attendance) ? user.attendance : 0,
    userBadges: Array.isArray(user.userBadges) && user.userBadges.length > 0
      ? user.userBadges
        .map((entry) => ({
          badgeId: Number(entry.badgeId),
          level: Number.isInteger(entry.level) && entry.level > 0 ? entry.level : 1
        }))
        .filter((entry) => Number.isInteger(entry.badgeId))
      : (Array.isArray(user.badgeIds) ? user.badgeIds : [])
        .map((badgeId) => ({
          badgeId: Number(badgeId),
          level: 1
        }))
        .filter((entry) => Number.isInteger(entry.badgeId))
  })).map((user) => ({
    ...user,
    badgeIds: user.userBadges.map((entry) => entry.badgeId)
  }));

  data.quests = data.quests.map((quest) => ({
    ...quest,
    rewardPoints: Number.isInteger(quest.rewardPoints) ? quest.rewardPoints : 0,
    requiredPlayers: Number.isInteger(quest.requiredPlayers) ? quest.requiredPlayers : 1,
    participants: Array.isArray(quest.participants) ? quest.participants : [],
    steps: Array.isArray(quest.steps) ? quest.steps : [],
    active: quest.active !== false
  }));

  data.events = data.events.map((event) => ({
    ...event,
    targetValue: Number.isInteger(event.targetValue) ? event.targetValue : 0,
    rewardPoints: Number.isInteger(event.rewardPoints) ? event.rewardPoints : 0,
    penaltyPoints: Number.isInteger(event.penaltyPoints) ? event.penaltyPoints : 0,
    badgeId: Number.isInteger(event.badgeId) ? event.badgeId : null,
    status: String(event.status || "pending"),
    currentValue: Number.isInteger(event.currentValue) ? event.currentValue : null,
    success: typeof event.success === "boolean" ? event.success : null
  }));

  data.badges = data.badges.map((badge) => {
    const description = String(badge.description || "").trim();
    const name = String(badge.name || description || `Značka #${badge.id || "?"}`).trim();
    const levelDescriptions = Array.isArray(badge.levelDescriptions)
      ? badge.levelDescriptions.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];

    return {
      ...badge,
      name,
      requirements: String(badge.requirements || "").trim(),
      description,
      imagePath: String(badge.imagePath || "").trim(),
      levelDescriptions: levelDescriptions.length > 0 ? levelDescriptions : [description || "Opis ni podan."]
    };
  });

  data.badgeTransfers = data.badgeTransfers.map((transfer) => ({
    ...transfer,
    badgeId: Number(transfer.badgeId),
    badgeName: String(transfer.badgeName || "").trim(),
    fromUserCode: String(transfer.fromUserCode || "").trim().toUpperCase(),
    fromUserName: String(transfer.fromUserName || "").trim(),
    toUserCode: String(transfer.toUserCode || "").trim().toUpperCase(),
    toUserName: String(transfer.toUserName || "").trim(),
    level: Number.isInteger(transfer.level) && transfer.level > 0 ? transfer.level : 1,
    sourceType: String(transfer.sourceType || "unknown").trim(),
    requestId: Number.isInteger(transfer.requestId) ? transfer.requestId : null,
    rootUserCode: String(transfer.rootUserCode || transfer.toUserCode || "").trim().toUpperCase(),
    rootUserName: String(transfer.rootUserName || transfer.toUserName || "").trim(),
    lineageCodes: Array.isArray(transfer.lineageCodes)
      ? transfer.lineageCodes.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean)
      : [],
    lineageNames: Array.isArray(transfer.lineageNames)
      ? transfer.lineageNames.map((name) => String(name || "").trim())
      : [],
    depth: Number.isInteger(transfer.depth) && transfer.depth >= 0 ? transfer.depth : 0,
    createdAt: String(transfer.createdAt || "").trim(),
    updatedAt: String(transfer.updatedAt || transfer.createdAt || "").trim()
  })).filter((transfer) => Number.isInteger(transfer.badgeId) && transfer.toUserCode);

  data.directMessages = data.directMessages
    .map((message) => ({
      id: Number(message.id),
      fromType: String(message.fromType || message.senderType || "user").trim(),
      fromCode: String(message.fromCode || message.senderCode || "").trim().toUpperCase(),
      fromName: String(message.fromName || message.senderName || "").trim(),
      toType: String(message.toType || "").trim(),
      toCode: String(message.toCode || "").trim().toUpperCase(),
      toName: String(message.toName || "").trim(),
      content: String(message.content || "").trim(),
      createdAt: String(message.createdAt || "").trim()
    }))
    .map((message) => {
      if (!message.toType) {
        if (message.fromType === "admin") {
          message.toType = "user";
          message.toCode = String(message.toCode || message.userCode || "").trim().toUpperCase();
          message.toName = String(message.toName || message.userName || "").trim();
        } else {
          message.toType = "admin";
          message.toCode = "";
          message.toName = String(message.toName || "Admin").trim();
          message.fromCode = String(message.fromCode || message.userCode || "").trim().toUpperCase();
          message.fromName = String(message.fromName || message.userName || "").trim();
        }
      }

      return message;
    })
    .filter((message) => Number.isInteger(message.id) && message.content && message.fromType && message.toType);

  data.userAuth = data.userAuth
    .map((entry) => ({
      userId: Number(entry.userId),
      passwordHash: String(entry.passwordHash || "").trim(),
      passwordSalt: String(entry.passwordSalt || "").trim(),
      passwordUpdatedAt: String(entry.passwordUpdatedAt || "").trim(),
      mustChangePassword: entry.mustChangePassword !== false
    }))
    .filter((entry) => Number.isInteger(entry.userId));

  return data;
}

function writeData(data) {
  const dataFilePath = getDataFilePath();
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
}

function getNextId(items) {
  if (items.length === 0) {
    return 1;
  }

  return Math.max(...items.map((item) => item.id)) + 1;
}

module.exports = {
  ensureDataFile,
  getDataFilePath,
  readData,
  writeData,
  getNextId
};
