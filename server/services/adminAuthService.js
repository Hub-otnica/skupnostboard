const crypto = require("crypto");
const { readData, writeData } = require("../data/store");

const ADMIN_SESSION_COOKIE_NAME = "skorbord_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();
const PASSWORD_KEYLEN = 64;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_HASH_ALGORITHM = "sha512";

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function getEnvConfiguredPassword() {
  return String(process.env.ADMIN_PASSWORD || "");
}

function isEnvAuthEnabled() {
  return Boolean(getEnvConfiguredPassword());
}

function getConfiguredUsername() {
  if (isEnvAuthEnabled()) {
    return String(process.env.ADMIN_USERNAME || "admin").trim() || "admin";
  }

  const data = readData();
  return String(data.adminAuth.username || "admin").trim() || "admin";
}

function getStoredAdminAuth() {
  const data = readData();
  return {
    username: String(data.adminAuth.username || "admin").trim() || "admin",
    passwordHash: String(data.adminAuth.passwordHash || "").trim(),
    passwordSalt: String(data.adminAuth.passwordSalt || "").trim()
  };
}

function isAdminSetupRequired() {
  if (isEnvAuthEnabled()) {
    return false;
  }

  const storedAuth = getStoredAdminAuth();
  return !storedAuth.passwordHash || !storedAuth.passwordSalt;
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

function isStrongEnoughPassword(password) {
  return String(password || "").length >= PASSWORD_MIN_LENGTH;
}

function setupAdminCredentials(username, password) {
  if (isEnvAuthEnabled()) {
    const error = new Error("Admin setup ni na voljo, ker je geslo nastavljeno prek okoljske spremenljivke.");
    error.statusCode = 400;
    throw error;
  }

  const normalizedUsername = String(username || "").trim() || "admin";
  const normalizedPassword = String(password || "");

  if (!isStrongEnoughPassword(normalizedPassword)) {
    const error = new Error(`Geslo mora imeti vsaj ${PASSWORD_MIN_LENGTH} znakov.`);
    error.statusCode = 400;
    throw error;
  }

  const data = readData();
  const existingHash = String((data.adminAuth && data.adminAuth.passwordHash) || "").trim();
  const existingSalt = String((data.adminAuth && data.adminAuth.passwordSalt) || "").trim();

  if (existingHash && existingSalt) {
    const error = new Error("Admin geslo je že nastavljeno.");
    error.statusCode = 400;
    throw error;
  }

  const passwordSalt = crypto.randomBytes(16).toString("hex");
  const passwordHash = derivePasswordHash(normalizedPassword, passwordSalt);

  data.adminAuth = {
    username: normalizedUsername,
    passwordHash,
    passwordSalt,
    passwordUpdatedAt: new Date().toISOString()
  };

  writeData(data);

  return {
    username: normalizedUsername
  };
}

function createAdminSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, {
    username,
    expiresAt
  });
  return {
    token,
    expiresAt
  };
}

function getAdminSession(token) {
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

  return session;
}

function revokeAdminSession(token) {
  if (!token) {
    return;
  }

  sessions.delete(token);
}

function extractAdminSessionToken(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return "";
  }

  return headerValue
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=`))
    ?.slice(ADMIN_SESSION_COOKIE_NAME.length + 1) || "";
}

function serializeAdminSessionCookie(token, maxAgeSeconds) {
  const secureAttribute = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureAttribute}`;
}

function attachAdminSessionCookie(res, session) {
  res.append("Set-Cookie", serializeAdminSessionCookie(session.token, Math.floor(SESSION_TTL_MS / 1000)));
}

function clearAdminSessionCookie(res) {
  const secureAttribute = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttribute}`
  );
}

function isValidAdminCredentials(username, password) {
  if (isEnvAuthEnabled()) {
    const expectedUsername = String(process.env.ADMIN_USERNAME || "admin").trim() || "admin";
    const expectedPassword = getEnvConfiguredPassword();
    return safeEqual(String(username || "").trim(), expectedUsername)
      && safeEqual(String(password || ""), expectedPassword);
  }

  const storedAuth = getStoredAdminAuth();

  if (!storedAuth.passwordHash || !storedAuth.passwordSalt) {
    return false;
  }

  const submittedUsername = String(username || "").trim();
  const submittedHash = derivePasswordHash(String(password || ""), storedAuth.passwordSalt);

  return safeEqual(submittedUsername, storedAuth.username)
    && safeEqual(submittedHash, storedAuth.passwordHash);
}

function extractBearerToken(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return "";
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

module.exports = {
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
};
