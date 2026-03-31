const { getNextId, readData, writeData } = require("../data/store");

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function validatePoints(points, fieldName = "Točke") {
  const value = Number(points);

  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw createError(400, `${fieldName} morajo biti celo število.`);
  }

  if (value <= 0) {
    throw createError(400, `${fieldName} morajo biti večje od nič.`);
  }

  return value;
}

function validateNonNegativeInteger(value, fieldName) {
  const normalizedValue = Number(value);

  if (!Number.isFinite(normalizedValue) || !Number.isInteger(normalizedValue)) {
    throw createError(400, `${fieldName} mora biti celo število.`);
  }

  if (normalizedValue < 0) {
    throw createError(400, `${fieldName} ne sme biti manjše od nič.`);
  }

  return normalizedValue;
}

function validateQuestSteps(steps) {
  if (!Array.isArray(steps)) {
    throw createError(400, "Koraki questa morajo biti podani v seznamu.");
  }

  const normalizedSteps = steps
    .map((step) => String(step || "").trim())
    .filter(Boolean);

  if (normalizedSteps.length === 0) {
    throw createError(400, "Quest mora imeti vsaj en korak.");
  }

  if (normalizedSteps.length > 10) {
    throw createError(400, "Quest ima lahko največ 10 korakov.");
  }

  return normalizedSteps;
}

function validateRequiredPlayers(requiredPlayers) {
  const value = Number(requiredPlayers);

  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw createError(400, "Število igralcev mora biti celo število.");
  }

  if (value <= 0) {
    throw createError(400, "Število igralcev mora biti večje od nič.");
  }

  return value;
}

function validateEventDate(dateValue) {
  const normalizedDate = String(dateValue || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    throw createError(400, "Datum dogodka mora biti v obliki LLLL-MM-DD.");
  }

  return normalizedDate;
}

function validateEventConditionType(conditionType) {
  const normalizedType = String(conditionType || "").trim();
  const allowedTypes = ["points-total", "attendance-total", "badge-count"];

  if (!allowedTypes.includes(normalizedType)) {
    throw createError(400, "Vrsta pogoja dogodka ni veljavna.");
  }

  return normalizedType;
}

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validateBadgeImagePath(imagePath) {
  const value = String(imagePath || "").trim();

  if (!value) {
    throw createError(400, "Slika značke je obvezna.");
  }

  if (!value.startsWith("/uploads/badges/")) {
    throw createError(400, "Slika značke mora biti veljavna slikovna datoteka.");
  }

  return value;
}

function validateBadgeText(value, fieldName) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    throw createError(400, `${fieldName} značke je obvezen.`);
  }

  return normalizedValue;
}

function validateBadgeLevel(level, maxLevel) {
  const value = Number(level);

  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw createError(400, "Nivo značke mora biti pozitivno celo število.");
  }

  if (maxLevel && value > maxLevel) {
    throw createError(400, "Izbrani nivo značke ne obstaja.");
  }

  return value;
}

function validateBadgeLevelDescriptions(levelDescriptions) {
  if (!Array.isArray(levelDescriptions)) {
    throw createError(400, "Opisi nivojev značke morajo biti podani v seznamu.");
  }

  const normalizedDescriptions = levelDescriptions
    .map((description) => String(description || "").trim())
    .filter(Boolean);

  if (normalizedDescriptions.length === 0) {
    throw createError(400, "Značka mora imeti vsaj en nivo.");
  }

  if (normalizedDescriptions.length > 10) {
    throw createError(400, "Značka ima lahko največ 10 nivojev.");
  }

  return normalizedDescriptions;
}

function getBadgeLevelDescription(badge, level) {
  const levelDescriptions = Array.isArray(badge.levelDescriptions) && badge.levelDescriptions.length > 0
    ? badge.levelDescriptions
    : [badge.description || "Opis ni podan."];
  const normalizedLevel = validateBadgeLevel(level, levelDescriptions.length);

  return levelDescriptions[normalizedLevel - 1] || levelDescriptions[0];
}

function getUserBadgeEntry(user, badgeId) {
  return (Array.isArray(user.userBadges) ? user.userBadges : []).find((entry) => entry.badgeId === badgeId);
}

function setUserBadgeLevel(user, badgeId, level) {
  if (!Array.isArray(user.userBadges)) {
    user.userBadges = [];
  }

  const existingEntry = getUserBadgeEntry(user, badgeId);

  if (existingEntry) {
    existingEntry.level = level;
  } else {
    user.userBadges.push({ badgeId, level });
  }

  user.badgeIds = user.userBadges.map((entry) => entry.badgeId);
}

function getBadgeTransferEntry(data, badgeId, userCode) {
  return (Array.isArray(data.badgeTransfers) ? data.badgeTransfers : []).find(
    (entry) => entry.badgeId === badgeId && entry.toUserCode === userCode
  );
}

function getBadgeTransferLineage(transfer) {
  const lineageCodes = Array.isArray(transfer.lineageCodes) && transfer.lineageCodes.length > 0
    ? transfer.lineageCodes
    : [transfer.toUserCode].filter(Boolean);
  const lineageNames = Array.isArray(transfer.lineageNames) && transfer.lineageNames.length > 0
    ? transfer.lineageNames
    : [transfer.toUserName].filter(Boolean);

  return lineageCodes.map((code, index) => ({
    code,
    name: lineageNames[index] || ""
  }));
}

function decorateBadgeTransfer(transfer, data) {
  const badge = data.badges.find((entry) => entry.id === transfer.badgeId);

  return {
    ...transfer,
    badgeName: transfer.badgeName || (badge && badge.name) || "Značka",
    lineage: getBadgeTransferLineage(transfer)
  };
}

function recordBadgeTransfer(data, { badge, recipient, level, giver = null, sourceType, requestId = null, timestamp }) {
  if (!Array.isArray(data.badgeTransfers)) {
    data.badgeTransfers = [];
  }

  const existingTransfer = getBadgeTransferEntry(data, badge.id, recipient.code);
  const giverTransfer = giver ? getBadgeTransferEntry(data, badge.id, giver.code) : null;
  const lineage = giverTransfer
    ? [...getBadgeTransferLineage(giverTransfer), { code: recipient.code, name: recipient.name }]
    : [{ code: recipient.code, name: recipient.name }];
  const rootUserCode = giverTransfer ? giverTransfer.rootUserCode : recipient.code;
  const rootUserName = giverTransfer ? giverTransfer.rootUserName : recipient.name;

  if (existingTransfer) {
    existingTransfer.level = level;
    existingTransfer.badgeName = badge.name;
    existingTransfer.updatedAt = timestamp;

    if (!existingTransfer.lineageCodes || existingTransfer.lineageCodes.length === 0) {
      existingTransfer.lineageCodes = lineage.map((entry) => entry.code);
      existingTransfer.lineageNames = lineage.map((entry) => entry.name);
      existingTransfer.depth = Math.max(0, lineage.length - 1);
      existingTransfer.rootUserCode = rootUserCode;
      existingTransfer.rootUserName = rootUserName;
    }

    if (!existingTransfer.sourceType || existingTransfer.sourceType === "unknown") {
      existingTransfer.sourceType = sourceType;
    }

    if (!existingTransfer.requestId && Number.isInteger(requestId)) {
      existingTransfer.requestId = requestId;
    }

    if (!existingTransfer.fromUserCode && giver) {
      existingTransfer.fromUserCode = giver.code;
      existingTransfer.fromUserName = giver.name;
    }

    return existingTransfer;
  }

  const transfer = {
    id: getNextId(data.badgeTransfers),
    badgeId: badge.id,
    badgeName: badge.name,
    fromUserCode: giver ? giver.code : "",
    fromUserName: giver ? giver.name : "",
    toUserCode: recipient.code,
    toUserName: recipient.name,
    level,
    sourceType,
    requestId: Number.isInteger(requestId) ? requestId : null,
    rootUserCode,
    rootUserName,
    lineageCodes: lineage.map((entry) => entry.code),
    lineageNames: lineage.map((entry) => entry.name),
    depth: Math.max(0, lineage.length - 1),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  data.badgeTransfers.push(transfer);

  return transfer;
}

function getBadgeChainSummary(data, badgeId, userCode) {
  const incomingTransfer = getBadgeTransferEntry(data, badgeId, userCode);
  const outgoingTransfers = (Array.isArray(data.badgeTransfers) ? data.badgeTransfers : [])
    .filter((entry) => entry.badgeId === badgeId && entry.fromUserCode === userCode)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((entry) => decorateBadgeTransfer(entry, data));

  if (!incomingTransfer) {
    return {
      sourceType: "unknown",
      fromUserCode: "",
      fromUserName: "",
      rootUserCode: userCode,
      rootUserName: "",
      depth: 0,
      lineage: [{ code: userCode, name: "" }],
      receivedAt: "",
      sharedWith: outgoingTransfers
    };
  }

  return {
    sourceType: incomingTransfer.sourceType,
    fromUserCode: incomingTransfer.fromUserCode,
    fromUserName: incomingTransfer.fromUserName,
    rootUserCode: incomingTransfer.rootUserCode,
    rootUserName: incomingTransfer.rootUserName,
    depth: incomingTransfer.depth,
    lineage: getBadgeTransferLineage(incomingTransfer),
    receivedAt: incomingTransfer.createdAt,
    sharedWith: outgoingTransfers
  };
}

function syncBadgeDependents(data, badge) {
  const maxLevel = Array.isArray(badge.levelDescriptions) && badge.levelDescriptions.length > 0
    ? badge.levelDescriptions.length
    : 1;

  data.users.forEach((user) => {
    const badgeEntry = getUserBadgeEntry(user, badge.id);

    if (badgeEntry && badgeEntry.level > maxLevel) {
      badgeEntry.level = maxLevel;
      user.badgeIds = user.userBadges.map((entry) => entry.badgeId);
    }
  });

  data.requests.forEach((request) => {
    if (request.type !== "badge-share" || request.badgeId !== badge.id) {
      return;
    }

    const nextLevel = Math.min(Number(request.badgeLevel) || 1, maxLevel);
    request.badgeLevel = nextLevel;
    request.badgeName = badge.name;
    request.badgeRequirements = badge.requirements;
    request.badgeDescription = getBadgeLevelDescription(badge, nextLevel);
  });

  data.badgeTransfers.forEach((transfer) => {
    if (transfer.badgeId !== badge.id) {
      return;
    }

    transfer.badgeName = badge.name;
    transfer.level = Math.min(Number(transfer.level) || 1, maxLevel);
    transfer.updatedAt = new Date().toISOString();
  });
}

function getBadgeRecordById(badgeId, data = readData()) {
  const id = Number(badgeId);

  if (!Number.isInteger(id)) {
    throw createError(400, "Neveljaven ID značke.");
  }

  const badge = data.badges.find((entry) => entry.id === id);

  if (!badge) {
    throw createError(404, "Značka ne obstaja.");
  }

  return badge;
}

function getQuestRecordById(questId, data = readData()) {
  const id = Number(questId);

  if (!Number.isInteger(id)) {
    throw createError(400, "Neveljaven ID questa.");
  }

  const quest = data.quests.find((entry) => entry.id === id);

  if (!quest) {
    throw createError(404, "Quest ne obstaja.");
  }

  return quest;
}

function buildEventConditionLabel(event, data) {
  if (event.conditionType === "points-total") {
    return `Skupne točke vseh mentorjev: ${event.targetValue}`;
  }

  if (event.conditionType === "attendance-total") {
    return `Skupni sestanki vseh mentorjev: ${event.targetValue}`;
  }

  if (event.conditionType === "badge-count") {
    const badge = event.badgeId ? data.badges.find((entry) => entry.id === event.badgeId) : null;
    return `Mentorji z značko "${badge ? badge.name : "neznana značka"}": ${event.targetValue}`;
  }

  return "Pogoj ni nastavljen.";
}

function getEventCurrentValue(event, data) {
  if (event.conditionType === "points-total") {
    return data.users.reduce((total, user) => total + user.points, 0);
  }

  if (event.conditionType === "attendance-total") {
    return data.users.reduce((total, user) => total + user.attendance, 0);
  }

  if (event.conditionType === "badge-count") {
    return data.users.filter((user) => Boolean(getUserBadgeEntry(user, event.badgeId))).length;
  }

  return 0;
}

function decorateEvent(event, data) {
  const currentValue = Number.isInteger(event.currentValue)
    ? event.currentValue
    : getEventCurrentValue(event, data);

  return {
    ...event,
    currentValue,
    conditionLabel: buildEventConditionLabel(event, data),
    badgeName: event.badgeId
      ? (data.badges.find((entry) => entry.id === event.badgeId) || {}).name || ""
      : ""
  };
}

function processDueEvents(data) {
  const today = getTodayDateString();
  let hasChanges = false;

  const dueEvents = [...data.events]
    .filter((event) => event.status === "pending" && event.date <= today)
    .sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }

      return new Date(a.createdAt) - new Date(b.createdAt);
    });

  dueEvents.forEach((event) => {
    const currentValue = getEventCurrentValue(event, data);
    const success = currentValue >= event.targetValue;

    data.users.forEach((user) => {
      if (success) {
        user.points += event.rewardPoints;
        return;
      }

      user.points = Math.max(0, user.points - event.penaltyPoints);
    });

    event.currentValue = currentValue;
    event.success = success;
    event.status = success ? "success" : "failed";
    event.processedAt = new Date().toISOString();
    hasChanges = true;
  });

  if (hasChanges) {
    writeData(data);
  }

  return data;
}

function readDataWithProcessedEvents() {
  const data = readData();
  return processDueEvents(data);
}

function getSortedUsers() {
  const data = readDataWithProcessedEvents();

  return [...data.users].sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    if (b.attendance !== a.attendance) {
      return b.attendance - a.attendance;
    }

    return a.name.localeCompare(b.name);
  });
}

function getForumMessages() {
  const data = readData();

  return [...data.forumMessages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function isQuestSubmittedOrCompleted(questId, data) {
  return data.requests.some(
    (request) =>
      request.type === "quest" &&
      request.questId === questId &&
      (request.status === "pending" || request.status === "approved")
  );
}

function getAvailableQuests() {
  const data = readDataWithProcessedEvents();

  return [...data.quests]
    .filter((quest) => quest.active !== false && !isQuestSubmittedOrCompleted(quest.id, data))
    .map((quest) => ({
      ...quest,
      participantCount: quest.participants.length,
      participantNames: quest.participants.map((participant) => participant.name),
      hasPendingRequest: data.requests.some(
        (request) =>
          request.type === "quest" &&
          request.questId === quest.id &&
          request.status === "pending"
      )
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getAvailableQuestsForUser(code) {
  const data = readDataWithProcessedEvents();
  const user = getUserRecordByCode(code, data);

  return data.quests
    .filter((quest) => quest.active !== false && !isQuestSubmittedOrCompleted(quest.id, data))
    .map((quest) => {
      const hasPendingRequest = data.requests.some(
        (request) =>
          request.type === "quest" &&
          request.questId === quest.id &&
          request.status === "pending"
      );
      const isParticipant = quest.participants.some(
        (participant) => participant.code === user.code
      );

      return {
        ...quest,
        participantCount: quest.participants.length,
        participantNames: quest.participants.map((participant) => participant.name),
        isParticipant,
        hasPendingRequest,
        isFull: quest.participants.length >= quest.requiredPlayers
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getUserRecordByCode(code, data = readData()) {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode) {
    throw createError(400, "Koda uporabnika je obvezna.");
  }

  const user = data.users.find((entry) => entry.code === normalizedCode);

  if (!user) {
    throw createError(404, "Uporabnik s to kodo ne obstaja.");
  }

  return user;
}

function getUserByCode(code) {
  const data = readDataWithProcessedEvents();
  const user = getUserRecordByCode(code, data);
  return decorateUserWithBadges(user, data);
}

function decorateUserWithBadges(user, data) {
  const userBadges = Array.isArray(user.userBadges)
    ? user.userBadges
    : (Array.isArray(user.badgeIds) ? user.badgeIds.map((badgeId) => ({ badgeId, level: 1 })) : []);

  return {
    ...user,
    badges: userBadges
      .map((entry) => {
        const badge = data.badges.find((candidate) => candidate.id === entry.badgeId);

        if (!badge) {
          return null;
        }

        return {
          ...badge,
          level: entry.level,
          description: getBadgeLevelDescription(badge, entry.level),
          chain: getBadgeChainSummary(data, badge.id, user.code)
        };
      })
      .filter(Boolean)
  };
}

function getUserRecordByName(name, data = readData()) {
  const normalizedName = normalizeName(name);

  if (!normalizedName) {
    throw createError(400, "Ime uporabnika je obvezno.");
  }

  const matches = data.users.filter(
    (entry) => normalizeName(entry.name) === normalizedName
  );

  if (matches.length === 0) {
    throw createError(404, "Uporabnik s tem imenom ne obstaja.");
  }

  if (matches.length > 1) {
    throw createError(409, "Več uporabnikov ima isto ime. Pred dodeljevanjem točk poskrbi za unikatna imena.");
  }

  return matches[0];
}

function createUser(payload) {
  const data = readData();
  const name = String(payload.name || "").trim();
  const normalizedName = normalizeName(name);
  const code = normalizeCode(payload.code);

  if (!name) {
    throw createError(400, "Ime je obvezno.");
  }

  if (!code) {
    throw createError(400, "Koda je obvezna.");
  }

  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
    throw createError(400, "Koda mora imeti 3 do 30 znakov in lahko vsebuje črke, številke, vezaje ali podčrtaje.");
  }

  if (data.users.some((user) => user.code === code)) {
    throw createError(409, "Ta koda je že v uporabi.");
  }

  if (data.users.some((user) => normalizeName(user.name) === normalizedName)) {
    throw createError(409, "To ime je že v uporabi.");
  }

  const user = {
    id: getNextId(data.users),
    name,
    code,
    points: 0,
    attendance: 0,
    userBadges: [],
    badgeIds: []
  };

  data.users.push(user);
  writeData(data);

  return user;
}

function syncUserReferences(data, previousUser, nextUser) {
  data.requests.forEach((request) => {
    if (request.userCode === previousUser.code) {
      request.userCode = nextUser.code;
      request.userName = nextUser.name;
    }

    if (request.targetUserCode === previousUser.code) {
      request.targetUserCode = nextUser.code;
      request.targetUserName = nextUser.name;
    }

    if (Array.isArray(request.participantCodes) || Array.isArray(request.participantNames)) {
      const participantEntries = (request.participantCodes || []).map((code, index) => ({
        code,
        name: (request.participantNames || [])[index] || ""
      }));

      participantEntries.forEach((entry) => {
        if (entry.code === previousUser.code) {
          entry.code = nextUser.code;
          entry.name = nextUser.name;
        }
      });

      request.participantCodes = participantEntries.map((entry) => entry.code);
      request.participantNames = participantEntries.map((entry) => entry.name);
    }
  });

  data.meetings.forEach((meeting) => {
    const attendees = (meeting.presentCodes || []).map((code, index) => ({
      code,
      name: (meeting.presentNames || [])[index] || ""
    }));

    attendees.forEach((entry) => {
      if (entry.code === previousUser.code) {
        entry.code = nextUser.code;
        entry.name = nextUser.name;
      }
    });

    meeting.presentCodes = attendees.map((entry) => entry.code);
    meeting.presentNames = attendees.map((entry) => entry.name);
  });

  data.quests.forEach((quest) => {
    if (!Array.isArray(quest.participants)) {
      return;
    }

    quest.participants.forEach((participant) => {
      if (participant.code === previousUser.code) {
        participant.code = nextUser.code;
        participant.name = nextUser.name;
      }
    });
  });

  data.forumMessages.forEach((message) => {
    if (message.userCode === previousUser.code) {
      message.userCode = nextUser.code;
      message.userName = nextUser.name;
    }
  });

  data.badgeTransfers.forEach((transfer) => {
    if (transfer.fromUserCode === previousUser.code) {
      transfer.fromUserCode = nextUser.code;
      transfer.fromUserName = nextUser.name;
    }

    if (transfer.toUserCode === previousUser.code) {
      transfer.toUserCode = nextUser.code;
      transfer.toUserName = nextUser.name;
    }

    if (transfer.rootUserCode === previousUser.code) {
      transfer.rootUserCode = nextUser.code;
      transfer.rootUserName = nextUser.name;
    }

    if (Array.isArray(transfer.lineageCodes) || Array.isArray(transfer.lineageNames)) {
      const lineageEntries = (transfer.lineageCodes || []).map((entry, index) => ({
        code: entry,
        name: (transfer.lineageNames || [])[index] || ""
      }));

      lineageEntries.forEach((entry) => {
        if (entry.code === previousUser.code) {
          entry.code = nextUser.code;
          entry.name = nextUser.name;
        }
      });

      transfer.lineageCodes = lineageEntries.map((entry) => entry.code);
      transfer.lineageNames = lineageEntries.map((entry) => entry.name);
    }
  });
}

function updateUserByCode(code, payload) {
  const data = readData();
  const user = getUserRecordByCode(code, data);
  const previousUser = {
    code: user.code,
    name: user.name
  };
  const name = String(payload.name || "").trim();
  const normalizedName = normalizeName(name);
  const nextCode = normalizeCode(payload.code);

  if (!name) {
    throw createError(400, "Ime je obvezno.");
  }

  if (!nextCode) {
    throw createError(400, "Koda je obvezna.");
  }

  if (!/^[A-Z0-9_-]{3,30}$/.test(nextCode)) {
    throw createError(400, "Koda mora imeti 3 do 30 znakov in lahko vsebuje črke, številke, vezaje ali podčrtaje.");
  }

  if (data.users.some((entry) => entry.id !== user.id && entry.code === nextCode)) {
    throw createError(409, "Ta koda je že v uporabi.");
  }

  if (data.users.some((entry) => entry.id !== user.id && normalizeName(entry.name) === normalizedName)) {
    throw createError(409, "To ime je že v uporabi.");
  }

  user.name = name;
  user.code = nextCode;

  syncUserReferences(data, previousUser, user);
  writeData(data);

  return user;
}

function createRequest(payload) {
  const data = readData();
  const user = getUserRecordByCode(payload.code, data);
  const points = validatePoints(payload.points, "Zahtevane točke");
  const reason = String(payload.reason || "").trim();

  const request = {
    id: getNextId(data.requests),
    userCode: user.code,
    userName: user.name,
    points,
    reason,
    type: "points",
    status: "pending",
    createdAt: new Date().toISOString()
  };

  data.requests.push(request);
  writeData(data);

  return request;
}

function createForumMessage(payload) {
  const data = readData();
  const user = getUserRecordByCode(payload.code, data);
  const content = String(payload.content || "").trim();

  if (!content) {
    throw createError(400, "Sporočilo ne sme biti prazno.");
  }

  const message = {
    id: getNextId(data.forumMessages),
    userCode: user.code,
    userName: user.name,
    content,
    createdAt: new Date().toISOString()
  };

  data.forumMessages.push(message);
  writeData(data);

  return message;
}

function createQuest(payload) {
  const data = readData();
  const title = String(payload.title || "").trim();
  const rewardPoints = validatePoints(payload.rewardPoints, "Nagrada");
  const requiredPlayers = validateRequiredPlayers(payload.requiredPlayers);
  const steps = validateQuestSteps(payload.steps);

  if (!title) {
    throw createError(400, "Naziv questa je obvezen.");
  }

  const quest = {
    id: getNextId(data.quests),
    title,
    rewardPoints,
    requiredPlayers,
    steps,
    participants: [],
    active: true,
    createdAt: new Date().toISOString()
  };

  data.quests.push(quest);
  writeData(data);

  return quest;
}

function createEvent(payload) {
  const data = readDataWithProcessedEvents();
  const title = String(payload.title || "").trim();
  const date = validateEventDate(payload.date);
  const conditionType = validateEventConditionType(payload.conditionType);
  const targetValue = validateNonNegativeInteger(payload.targetValue, "Ciljna vrednost");
  const rewardPoints = validateNonNegativeInteger(payload.rewardPoints, "Nagrada");
  const penaltyPoints = validateNonNegativeInteger(payload.penaltyPoints, "Kazen");
  const badgeId = conditionType === "badge-count"
    ? Number(payload.badgeId)
    : null;

  if (!title) {
    throw createError(400, "Naziv dogodka je obvezen.");
  }

  if (conditionType === "badge-count") {
    getBadgeRecordById(badgeId, data);
  }

  const event = {
    id: getNextId(data.events),
    title,
    date,
    conditionType,
    targetValue,
    badgeId: conditionType === "badge-count" ? badgeId : null,
    rewardPoints,
    penaltyPoints,
    status: "pending",
    currentValue: null,
    success: null,
    createdAt: new Date().toISOString()
  };

  data.events.push(event);
  writeData(data);

  return decorateEvent(event, data);
}

function getCommunityEvents() {
  const data = readDataWithProcessedEvents();

  return [...data.events]
    .map((event) => decorateEvent(event, data))
    .sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") {
        return -1;
      }

      if (a.status !== "pending" && b.status === "pending") {
        return 1;
      }

      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }

      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function createBadge(payload) {
  const data = readData();
  const name = validateBadgeText(payload.name, "Ime");
  const requirements = validateBadgeText(payload.requirements, "Pogoj");
  const description = validateBadgeText(payload.description, "Opis");
  const levelDescriptions = validateBadgeLevelDescriptions(payload.levelDescriptions);
  const imagePath = validateBadgeImagePath(payload.imagePath);

  const badge = {
    id: getNextId(data.badges),
    name,
    requirements,
    description,
    levelDescriptions,
    imagePath,
    createdAt: new Date().toISOString()
  };

  data.badges.push(badge);
  writeData(data);

  return badge;
}

function updateBadge(badgeId, payload) {
  const data = readData();
  const badge = getBadgeRecordById(badgeId, data);
  const name = validateBadgeText(payload.name, "Ime");
  const requirements = validateBadgeText(payload.requirements, "Pogoj");
  const description = validateBadgeText(payload.description, "Opis");
  const levelDescriptions = validateBadgeLevelDescriptions(payload.levelDescriptions);
  const imagePath = payload.imagePath ? validateBadgeImagePath(payload.imagePath) : badge.imagePath;

  badge.name = name;
  badge.requirements = requirements;
  badge.description = description;
  badge.levelDescriptions = levelDescriptions;
  badge.imagePath = imagePath;
  badge.updatedAt = new Date().toISOString();

  syncBadgeDependents(data, badge);
  writeData(data);

  return badge;
}

function getBadges() {
  const data = readData();

  return [...data.badges].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getBadgeShareOptionsForUser(code) {
  const data = readData();
  const user = getUserRecordByCode(code, data);
  const ownedBadgeIds = new Set((user.userBadges || []).map((entry) => entry.badgeId));

  return data.badges
    .filter((badge) => !ownedBadgeIds.has(badge.id))
    .map((badge) => {
      const holders = data.users
        .map((entry) => ({
          user: entry,
          badgeEntry: getUserBadgeEntry(entry, badge.id)
        }))
        .filter(({ user: entry, badgeEntry }) => badgeEntry && entry.code !== user.code)
        .map((entry) => ({
          name: entry.user.name,
          code: entry.user.code,
          level: entry.badgeEntry.level
        }));

      return {
        ...badge,
        holders
      };
    })
    .filter((badge) => badge.holders.length > 0)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function createBadgeShareRequest(payload) {
  const data = readData();
  const requester = getUserRecordByCode(payload.requesterCode, data);
  const target = getUserRecordByCode(payload.targetCode, data);
  const badge = getBadgeRecordById(payload.badgeId, data);

  if (requester.code === target.code) {
    throw createError(400, "Značke si ne moreš poslati sam.");
  }

  if (getUserBadgeEntry(requester, badge.id)) {
    throw createError(400, "To značko že imaš.");
  }

  const targetBadgeEntry = getUserBadgeEntry(target, badge.id);

  if (!targetBadgeEntry) {
    throw createError(400, "Izbrani uporabnik te značke nima.");
  }

  const existingPending = data.requests.find(
    (request) =>
      request.type === "badge-share" &&
      request.badgeId === badge.id &&
      request.userCode === requester.code &&
      request.targetUserCode === target.code &&
      request.status === "pending"
  );

  if (existingPending) {
    throw createError(409, "Ta zahteva za deljenje značke je že poslana.");
  }

  const request = {
    id: getNextId(data.requests),
    type: "badge-share",
    userCode: requester.code,
    userName: requester.name,
    targetUserCode: target.code,
    targetUserName: target.name,
    badgeId: badge.id,
    badgeLevel: targetBadgeEntry.level,
    badgeName: badge.name,
    badgeRequirements: badge.requirements,
    badgeDescription: getBadgeLevelDescription(badge, targetBadgeEntry.level),
    status: "pending",
    createdAt: new Date().toISOString()
  };

  data.requests.push(request);
  writeData(data);

  return request;
}

function getIncomingBadgeShareRequests(code) {
  const data = readData();
  const user = getUserRecordByCode(code, data);

  return data.requests
    .filter(
      (request) =>
        request.type === "badge-share" &&
        request.targetUserCode === user.code &&
        request.status === "pending"
    )
    .map((request) => {
      const badge = data.badges.find((entry) => entry.id === request.badgeId);
      const badgeEntry = badge ? getUserBadgeEntry(user, badge.id) : null;
      const maxApprovableLevel = badgeEntry ? badgeEntry.level : (request.badgeLevel || 1);
      const badgeLevel = request.badgeLevel || maxApprovableLevel || 1;

      return {
        ...request,
        badgeLevel,
        maxApprovableLevel,
        badgeName: request.badgeName || (badge && badge.name) || request.badgeDescription || "Značka",
        badgeRequirements: request.badgeRequirements || (badge && badge.requirements) || "",
        badgeDescription: request.badgeDescription || (badge ? getBadgeLevelDescription(badge, badgeLevel) : "")
      };
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function acceptBadgeShareRequest(requestId, targetCode, approvedLevel) {
  const data = readData();
  const id = Number(requestId);
  const request = data.requests.find((entry) => entry.id === id);
  const target = getUserRecordByCode(targetCode, data);
  const timestamp = new Date().toISOString();

  if (!Number.isInteger(id)) {
    throw createError(400, "Neveljaven ID zahtevka.");
  }

  if (!request || request.type !== "badge-share") {
    throw createError(404, "Zahtevek za deljenje značke ne obstaja.");
  }

  if (request.targetUserCode !== target.code) {
    throw createError(403, "Tega zahtevka ne moreš potrditi.");
  }

  if (request.status !== "pending") {
    throw createError(400, "Ta zahtevek je že bil obdelan.");
  }

  const requester = getUserRecordByCode(request.userCode, data);
  const badge = getBadgeRecordById(request.badgeId, data);
  const targetBadgeEntry = getUserBadgeEntry(target, badge.id);

  if (!targetBadgeEntry) {
    throw createError(400, "Te značke ne moreš več potrditi, ker je nimaš več.");
  }

  const badgeLevel = validateBadgeLevel(
    approvedLevel || targetBadgeEntry.level,
    targetBadgeEntry.level
  );

  setUserBadgeLevel(requester, request.badgeId, badgeLevel);
  recordBadgeTransfer(data, {
    badge,
    recipient: requester,
    level: badgeLevel,
    giver: target,
    sourceType: "share",
    requestId: request.id,
    timestamp
  });

  request.badgeLevel = badgeLevel;
  request.badgeDescription = getBadgeLevelDescription(badge, badgeLevel);
  request.status = "approved";
  request.processedAt = timestamp;
  writeData(data);

  return request;
}

function assignBadgeToUserByName(name, badgeId, level) {
  const data = readData();
  const user = getUserRecordByName(name, data);
  const badge = getBadgeRecordById(badgeId, data);
  const timestamp = new Date().toISOString();
  const badgeLevel = validateBadgeLevel(
    level,
    Array.isArray(badge.levelDescriptions) ? badge.levelDescriptions.length : 1
  );

  setUserBadgeLevel(user, badge.id, badgeLevel);
  recordBadgeTransfer(data, {
    badge,
    recipient: user,
    level: badgeLevel,
    sourceType: "admin",
    timestamp
  });
  writeData(data);

  return decorateUserWithBadges(user, data);
}

function getBadgeChainsByUserCode(code) {
  const data = readDataWithProcessedEvents();
  const user = getUserRecordByCode(code, data);
  const transfers = (Array.isArray(data.badgeTransfers) ? data.badgeTransfers : []);

  return {
    user: decorateUserWithBadges(user, data),
    received: transfers
      .filter((entry) => entry.toUserCode === user.code)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((entry) => decorateBadgeTransfer(entry, data)),
    shared: transfers
      .filter((entry) => entry.fromUserCode === user.code)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((entry) => decorateBadgeTransfer(entry, data))
  };
}

function buildBadgeChainTreeNode(transfer, transfersByGiver, data) {
  return {
    ...decorateBadgeTransfer(transfer, data),
    children: (transfersByGiver.get(transfer.toUserCode) || [])
      .map((entry) => buildBadgeChainTreeNode(entry, transfersByGiver, data))
  };
}

function getBadgeChainsByBadgeId(badgeId) {
  const data = readDataWithProcessedEvents();
  const badge = getBadgeRecordById(badgeId, data);
  const transfers = (Array.isArray(data.badgeTransfers) ? data.badgeTransfers : [])
    .filter((entry) => entry.badgeId === badge.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const transfersByGiver = new Map();

  transfers.forEach((transfer) => {
    const key = transfer.fromUserCode || "";
    const existingEntries = transfersByGiver.get(key) || [];
    existingEntries.push(transfer);
    transfersByGiver.set(key, existingEntries);
  });

  return {
    badge,
    transfers: transfers.map((entry) => decorateBadgeTransfer(entry, data)),
    roots: transfers
      .filter((entry) => !entry.fromUserCode)
      .map((entry) => buildBadgeChainTreeNode(entry, transfersByGiver, data))
  };
}

function joinQuest(payload) {
  const data = readData();
  const user = getUserRecordByCode(payload.code, data);
  const quest = getQuestRecordById(payload.questId, data);

  if (quest.active === false) {
    throw createError(400, "Ta quest ni več aktiven.");
  }

  const hasPendingRequest = data.requests.some(
    (request) =>
      request.type === "quest" &&
      request.questId === quest.id &&
      request.status === "pending"
  );

  if (hasPendingRequest) {
    throw createError(400, "Ta quest že čaka na administratorsko potrditev.");
  }

  if (quest.participants.some((participant) => participant.code === user.code)) {
    return quest;
  }

  if (quest.participants.length >= quest.requiredPlayers) {
    throw createError(400, "Ekipa za ta quest je že polna.");
  }

  quest.participants.push({
    code: user.code,
    name: user.name
  });

  writeData(data);

  return quest;
}

function createQuestRequest(payload) {
  const data = readData();
  const user = getUserRecordByCode(payload.code, data);
  const quest = getQuestRecordById(payload.questId, data);
  const completedSteps = Array.isArray(payload.completedSteps)
    ? payload.completedSteps.map((step) => String(step || "").trim()).filter(Boolean)
    : [];

  if (quest.active === false) {
    throw createError(400, "Ta quest ni več aktiven.");
  }

  const isParticipant = quest.participants.some(
    (participant) => participant.code === user.code
  );

  if (!isParticipant) {
    throw createError(400, "Na ta quest se moraš najprej prijaviti.");
  }

  if (quest.participants.length !== quest.requiredPlayers) {
    throw createError(400, "Quest lahko oddate šele, ko je ekipa popolna.");
  }

  if (completedSteps.length !== quest.steps.length) {
    throw createError(400, "Za oddajo moraš označiti vse korake questa.");
  }

  const allStepsCompleted = quest.steps.every((step) => completedSteps.includes(step));

  if (!allStepsCompleted) {
    throw createError(400, "Za oddajo moraš označiti vse korake questa.");
  }

  const existingRequest = data.requests.find(
    (request) =>
      request.type === "quest" &&
      request.questId === quest.id &&
      (request.status === "pending" || request.status === "approved")
  );

  if (existingRequest) {
    throw createError(409, "Ta quest je že oddan ali zaključen.");
  }

  const request = {
    id: getNextId(data.requests),
    userCode: user.code,
    userName: user.name,
    points: quest.rewardPoints,
    reason: quest.title,
    type: "quest",
    questId: quest.id,
    questTitle: quest.title,
    requiredPlayers: quest.requiredPlayers,
    questSteps: quest.steps,
    participantCodes: quest.participants.map((participant) => participant.code),
    participantNames: quest.participants.map((participant) => participant.name),
    completedSteps,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  data.requests.push(request);
  writeData(data);

  return request;
}

function getPendingRequests() {
  const data = readData();

  return data.requests
    .filter((request) => request.status === "pending" && request.type !== "badge-share")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getApprovedRequestsByUserCode(code) {
  const data = readDataWithProcessedEvents();
  const user = getUserRecordByCode(code, data);

  const approvedRequests = data.requests
    .filter(
      (request) =>
        request.userCode === user.code &&
        request.status === "approved"
    )
    .sort((a, b) => new Date(b.processedAt || b.createdAt) - new Date(a.processedAt || a.createdAt));

  return {
    user: decorateUserWithBadges(user, data),
    approvedRequests
  };
}

function recordMeeting(payload) {
  const data = readData();
  const presentCodes = Array.isArray(payload.presentCodes) ? payload.presentCodes : [];
  const normalizedCodes = [...new Set(
    presentCodes
      .map((code) => normalizeCode(code))
      .filter(Boolean)
  )];
  const note = String(payload.note || "").trim();

  if (normalizedCodes.length === 0) {
    throw createError(400, "Za sestanek izberi vsaj enega člana.");
  }

  const attendees = normalizedCodes.map((code) => getUserRecordByCode(code, data));

  attendees.forEach((user) => {
    user.attendance += 1;
  });

  const meeting = {
    id: getNextId(data.meetings),
    presentCodes: attendees.map((user) => user.code),
    presentNames: attendees.map((user) => user.name),
    note,
    createdAt: new Date().toISOString()
  };

  data.meetings.push(meeting);
  writeData(data);

  return {
    meeting,
    attendees
  };
}

function processRequest(requestId, status) {
  const data = readData();
  const id = Number(requestId);
  const request = data.requests.find((entry) => entry.id === id);

  if (!Number.isInteger(id)) {
    throw createError(400, "Neveljaven ID zahtevka.");
  }

  if (!request) {
    throw createError(404, "Zahtevek ne obstaja.");
  }

  if (request.status !== "pending") {
    throw createError(400, "Ta zahtevek je že bil obdelan.");
  }

  request.status = status;
  request.processedAt = new Date().toISOString();

  if (status === "approved") {
    if (request.type === "quest" && Array.isArray(request.participantCodes)) {
      request.participantCodes.forEach((code) => {
        const user = getUserRecordByCode(code, data);
        user.points += request.points;
      });

      const quest = data.quests.find((entry) => entry.id === request.questId);

      if (quest) {
        quest.active = false;
      }
    } else {
      const user = getUserRecordByCode(request.userCode, data);
      user.points += request.points;
    }
  }

  writeData(data);

  return request;
}

function addPointsToUser(code, points) {
  const data = readData();
  const user = getUserRecordByCode(code, data);
  const amount = validatePoints(points);

  user.points += amount;
  writeData(data);

  return user;
}

function addPointsToUserByName(name, points, reason = "") {
  const data = readData();
  const user = getUserRecordByName(name, data);
  const amount = validatePoints(points);
  const normalizedReason = String(reason || "").trim();
  const timestamp = new Date().toISOString();

  user.points += amount;

  data.requests.push({
    id: getNextId(data.requests),
    userCode: user.code,
    userName: user.name,
    points: amount,
    reason: normalizedReason,
    type: "manual",
    status: "approved",
    source: "manual",
    createdAt: timestamp,
    processedAt: timestamp
  });

  writeData(data);

  return user;
}

module.exports = {
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
  getBadgeShareOptionsForUser,
  getBadgeChainsByBadgeId,
  getBadgeChainsByUserCode,
  getForumMessages,
  getCommunityEvents,
  getIncomingBadgeShareRequests,
  getApprovedRequestsByUserCode,
  getPendingRequests,
  recordMeeting,
  getSortedUsers,
  getUserByCode,
  processRequest
};
