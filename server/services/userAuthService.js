const crypto = require("crypto");
const { readData, writeData } = require("../data/store");

const USER_SESSION_COOKIE_NAME = "skorbord_user_session";
const USER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_KEYLEN = 64;
const PASSWORD_MIN_LENGTH = 6;
const sessions = new Map();

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function derivePasswordHash(password, passwordSalt) {
  return crypto
    .scryptSync(String(password || ""), String(passwordSalt || ""), PASSWORD_KEYLEN, {
      N: 16384,
      r: 8,
      p: 1
    })
    .toString("hex");
}

function validateUserPassword(password) {
  const normalizedPassword = String(password || "");

  if (normalizedPassword.length < PASSWORD_MIN_LENGTH) {
    const error = new Error(`Geslo mora imeti vsaj ${PASSWORD_MIN_LENGTH} znakov.`);
    error.statusCode = 400;
    throw error;
  }

  return normalizedPassword;
}

function getUserAuthRecord(data, userId) {
  return (Array.isArray(data.userAuth) ? data.userAuth : []).find((entry) => entry.userId === userId);
}

function getUserByUsername(data, username) {
  const normalizedUsername = normalizeUsername(username);

  return data.users.find((entry) => normalizeUsername(entry.name) === normalizedUsername) || null;
}

function revokeSessionsForUser(userId) {
  sessions.forEach((session, token) => {
    if (session.userId === userId) {
      sessions.delete(token);
    }
  });
}

function buildAuthenticatedUser(user, authRecord = null) {
  return {
    id: user.id,
    code: user.code,
    name: user.name,
    mustChangePassword: authRecord ? authRecord.mustChangePassword === true : false
  };
}

function verifyUserPassword(userId, password, data = readData()) {
  const authRecord = getUserAuthRecord(data, Number(userId));

  if (!authRecord || !authRecord.passwordHash || !authRecord.passwordSalt) {
    return {
      valid: false,
      authRecord
    };
  }

  const submittedHash = derivePasswordHash(String(password || ""), authRecord.passwordSalt);

  return {
    valid: safeEqual(submittedHash, authRecord.passwordHash),
    authRecord
  };
}

function setUserPasswordById(userId, password, options = {}) {
  const normalizedPassword = validateUserPassword(password);
  const mustChangePassword = options.mustChangePassword === true;
  const data = readData();
  const user = data.users.find((entry) => entry.id === Number(userId));

  if (!user) {
    const error = new Error("Uporabnik ne obstaja.");
    error.statusCode = 404;
    throw error;
  }

  if (!Array.isArray(data.userAuth)) {
    data.userAuth = [];
  }

  const passwordSalt = crypto.randomBytes(16).toString("hex");
  const passwordHash = derivePasswordHash(normalizedPassword, passwordSalt);
  const passwordUpdatedAt = new Date().toISOString();
  const existingRecord = getUserAuthRecord(data, user.id);

  if (existingRecord) {
    existingRecord.passwordHash = passwordHash;
    existingRecord.passwordSalt = passwordSalt;
    existingRecord.passwordUpdatedAt = passwordUpdatedAt;
    existingRecord.mustChangePassword = mustChangePassword;
  } else {
    data.userAuth.push({
      userId: user.id,
      passwordHash,
      passwordSalt,
      passwordUpdatedAt,
      mustChangePassword
    });
  }

  revokeSessionsForUser(user.id);
  writeData(data);
}

function authenticateUser(username, password) {
  const data = readData();
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = String(password || "");

  if (!normalizedUsername) {
    const error = new Error("Uporabniško ime je obvezno.");
    error.statusCode = 400;
    throw error;
  }

  const user = getUserByUsername(data, normalizedUsername);

  if (!user) {
    const error = new Error("Napačno uporabniško ime ali geslo.");
    error.statusCode = 401;
    throw error;
  }

  const { valid, authRecord } = verifyUserPassword(user.id, normalizedPassword, data);

  if (!authRecord || !authRecord.passwordHash || !authRecord.passwordSalt) {
    const error = new Error("Ta mentorski račun še nima nastavljenega gesla. Obrni se na administratorja.");
    error.statusCode = 403;
    throw error;
  }

  if (!valid) {
    const error = new Error("Napačno uporabniško ime ali geslo.");
    error.statusCode = 401;
    throw error;
  }

  return buildAuthenticatedUser(user, authRecord);
}

function createUserSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + USER_SESSION_TTL_MS;

  sessions.set(token, {
    userId: user.id,
    expiresAt
  });

  return {
    token,
    expiresAt
  };
}

function extractUserSessionToken(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return "";
  }

  return headerValue
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${USER_SESSION_COOKIE_NAME}=`))
    ?.slice(USER_SESSION_COOKIE_NAME.length + 1) || "";
}

function getUserSession(token) {
  if (!token) {
    return null;
  }

  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  const data = readData();
  const user = data.users.find((entry) => entry.id === session.userId);
  const authRecord = getUserAuthRecord(data, session.userId);

  if (!user) {
    sessions.delete(token);
    return null;
  }

  return {
    ...session,
    user: buildAuthenticatedUser(user, authRecord)
  };
}

function serializeCookie(token, maxAgeSeconds) {
  const secureAttribute = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${USER_SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureAttribute}`;
}

function attachUserSessionCookie(res, session) {
  res.append("Set-Cookie", serializeCookie(session.token, Math.floor(USER_SESSION_TTL_MS / 1000)));
}

function clearUserSessionCookie(res) {
  const secureAttribute = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${USER_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttribute}`
  );
}

function revokeUserSession(token) {
  if (!token) {
    return;
  }

  sessions.delete(token);
}

function changeUserPasswordById(userId, currentPassword, nextPassword) {
  const data = readData();
  const user = data.users.find((entry) => entry.id === Number(userId));

  if (!user) {
    const error = new Error("Uporabnik ne obstaja.");
    error.statusCode = 404;
    throw error;
  }

  const { valid } = verifyUserPassword(user.id, currentPassword, data);

  if (!valid) {
    const error = new Error("Trenutno geslo ni pravilno.");
    error.statusCode = 401;
    throw error;
  }

  setUserPasswordById(user.id, nextPassword, { mustChangePassword: false });

  return buildAuthenticatedUser(user, { mustChangePassword: false });
}

module.exports = {
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
};
