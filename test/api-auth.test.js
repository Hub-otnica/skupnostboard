const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setUserPasswordById } = require("../server/services/userAuthService");
const {
  formatMonthlyLeadersMessage,
  postDueEventReminders,
  postMonthlyLeaders,
  setDiscordSenderForTests
} = require("../server/services/discordService");

function withDiscordEnv(t, sentMessages) {
  const previousEnv = {
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_MENTOR_CHANNEL_ID: process.env.DISCORD_MENTOR_CHANNEL_ID,
    DISCORD_PUBLIC_BASE_URL: process.env.DISCORD_PUBLIC_BASE_URL,
    DISCORD_TIMEZONE: process.env.DISCORD_TIMEZONE,
    DISCORD_REMINDER_HOUR: process.env.DISCORD_REMINDER_HOUR,
    DISCORD_MONTHLY_HOUR: process.env.DISCORD_MONTHLY_HOUR
  };

  process.env.DISCORD_BOT_TOKEN = "test-token";
  process.env.DISCORD_MENTOR_CHANNEL_ID = "123456789012345678";
  process.env.DISCORD_PUBLIC_BASE_URL = "https://skorbord.test";
  process.env.DISCORD_TIMEZONE = "Europe/Ljubljana";
  process.env.DISCORD_REMINDER_HOUR = "9";
  process.env.DISCORD_MONTHLY_HOUR = "9";

  setDiscordSenderForTests({
    async sendChannelMessage(channelId, content) {
      sentMessages.push({ type: "channel", channelId, content });
    },
    async sendDirectMessage(userId, content) {
      sentMessages.push({ type: "dm", userId, content });
    }
  });

  t.after(() => {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    setDiscordSenderForTests(null);
  });
}

function flushAsyncNotifications() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function createTestServer(t, initialData = null) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skorbord-test-"));
  const dataFilePath = path.join(tmpDir, "db.json");

  if (initialData) {
    fs.writeFileSync(dataFilePath, JSON.stringify(initialData, null, 2));
  }

  process.env.SKORBORD_DATA_FILE_PATH = dataFilePath;

  const { createApp } = require("../server/app");
  const server = createApp().listen(0, "127.0.0.1");

  t.after(() => {
    server.close();
    delete process.env.SKORBORD_DATA_FILE_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    dataFilePath
  };
}

function extractCookie(response) {
  const setCookies = response.headers.getSetCookie();

  if (!Array.isArray(setCookies) || setCookies.length === 0) {
    return "";
  }

  return setCookies[0].split(";")[0];
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = await response.json().catch(() => ({}));

  return {
    response,
    body,
    cookie: extractCookie(response)
  };
}

test("protected routes require auth and mentor password change is enforced", async (t) => {
  const { baseUrl } = await createTestServer(t);

  const unauthenticatedRequest = await requestJson(baseUrl, "/api/requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      points: 5,
      reason: "Should fail"
    })
  });

  assert.equal(unauthenticatedRequest.response.status, 401);

  const adminSetup = await requestJson(baseUrl, "/api/admin/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "admin",
      password: "secret123"
    })
  });

  assert.equal(adminSetup.response.status, 201);
  assert.ok(adminSetup.cookie.includes("skorbord_admin_session="));

  const createUser = await requestJson(baseUrl, "/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Mentor Test",
      password: "temp-pass-1"
    })
  });

  assert.equal(createUser.response.status, 201);
  assert.equal(createUser.body.name, "Mentor Test");

  const userLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Mentor Test",
      password: "temp-pass-1"
    })
  });

  assert.equal(userLogin.response.status, 201);
  assert.equal(userLogin.body.mustChangePassword, true);
  assert.ok(userLogin.cookie.includes("skorbord_user_session="));

  const meBeforeChange = await requestJson(baseUrl, "/api/me", {
    headers: {
      Cookie: userLogin.cookie
    }
  });

  assert.equal(meBeforeChange.response.status, 200);
  assert.equal(meBeforeChange.body.mustChangePassword, true);

  const blockedRequest = await requestJson(baseUrl, "/api/requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: userLogin.cookie
    },
    body: JSON.stringify({
      points: 5,
      reason: "Blocked until password change"
    })
  });

  assert.equal(blockedRequest.response.status, 403);

  const passwordChange = await requestJson(baseUrl, "/api/auth/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: userLogin.cookie
    },
    body: JSON.stringify({
      currentPassword: "temp-pass-1",
      newPassword: "new-secret-1"
    })
  });

  assert.equal(passwordChange.response.status, 200);
  assert.equal(passwordChange.body.mustChangePassword, false);
  assert.ok(passwordChange.cookie.includes("skorbord_user_session="));

  const allowedRequest = await requestJson(baseUrl, "/api/requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: passwordChange.cookie
    },
    body: JSON.stringify({
      points: 5,
      reason: "Allowed after password change"
    })
  });

  assert.equal(allowedRequest.response.status, 201);
  assert.equal(allowedRequest.body.type, "points");
});

test("admin session works through cookies instead of localStorage-style bearer state", async (t) => {
  const { baseUrl } = await createTestServer(t);

  const unauthorizedSession = await requestJson(baseUrl, "/api/admin/session");
  assert.equal(unauthorizedSession.response.status, 401);

  const adminSetup = await requestJson(baseUrl, "/api/admin/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "admin",
      password: "secret123"
    })
  });

  assert.equal(adminSetup.response.status, 201);
  assert.ok(adminSetup.cookie.includes("skorbord_admin_session="));

  const adminSession = await requestJson(baseUrl, "/api/admin/session", {
    headers: {
      Cookie: adminSetup.cookie
    }
  });

  assert.equal(adminSession.response.status, 200);
  assert.equal(adminSession.body.username, "admin");

  const logout = await fetch(`${baseUrl}/api/admin/logout`, {
    method: "POST",
    headers: {
      Cookie: adminSetup.cookie
    }
  });

  assert.equal(logout.status, 204);

  const afterLogout = await requestJson(baseUrl, "/api/admin/session", {
    headers: {
      Cookie: adminSetup.cookie
    }
  });

  assert.equal(afterLogout.response.status, 401);
});

test("admin can subtract points with a negative manual adjustment", async (t) => {
  const { baseUrl, dataFilePath } = await createTestServer(t);

  const adminSetup = await requestJson(baseUrl, "/api/admin/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "admin",
      password: "secret123"
    })
  });

  assert.equal(adminSetup.response.status, 201);

  const createUser = await requestJson(baseUrl, "/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Manual Mentor",
      password: "temp-pass-1"
    })
  });

  assert.equal(createUser.response.status, 201);

  const addPoints = await requestJson(baseUrl, "/api/users/by-name/points", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Manual Mentor",
      points: 12,
      reason: "Bonus"
    })
  });

  assert.equal(addPoints.response.status, 200);
  assert.equal(addPoints.body.points, 12);

  const subtractPoints = await requestJson(baseUrl, "/api/users/by-name/points", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Manual Mentor",
      points: -5,
      reason: "Correction"
    })
  });

  assert.equal(subtractPoints.response.status, 200);
  assert.equal(subtractPoints.body.points, 7);

  const storedData = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));
  const manualCorrection = storedData.requests.find((request) => request.reason === "Correction");

  assert.equal(manualCorrection.points, -5);
  assert.equal(manualCorrection.type, "manual");
  assert.equal(manualCorrection.status, "approved");
});

test("repeatable quests reopen until completion limit and can be cancelled", async (t) => {
  const { baseUrl, dataFilePath } = await createTestServer(t);

  const adminSetup = await requestJson(baseUrl, "/api/admin/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "admin",
      password: "secret123"
    })
  });

  const firstUser = await requestJson(baseUrl, "/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Quest Mentor One",
      password: "temp-pass-1"
    })
  });

  const secondUser = await requestJson(baseUrl, "/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Quest Mentor Two",
      password: "temp-pass-2"
    })
  });

  setUserPasswordById(firstUser.body.id, "ready-pass-1", { mustChangePassword: false });
  setUserPasswordById(secondUser.body.id, "ready-pass-2", { mustChangePassword: false });

  const firstLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Quest Mentor One",
      password: "ready-pass-1"
    })
  });

  const secondLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Quest Mentor Two",
      password: "ready-pass-2"
    })
  });

  const createQuest = await requestJson(baseUrl, "/api/quests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      title: "Repeatable Quest",
      rewardPoints: 7,
      requiredPlayers: 1,
      completionLimit: 2,
      steps: ["Naredi stvar"]
    })
  });

  assert.equal(createQuest.response.status, 201);
  assert.equal(createQuest.body.completionLimit, 2);

  const firstJoin = await requestJson(baseUrl, "/api/quest-joins", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: firstLogin.cookie
    },
    body: JSON.stringify({
      questId: createQuest.body.id
    })
  });

  assert.equal(firstJoin.response.status, 200);

  const firstSubmit = await requestJson(baseUrl, "/api/quest-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: firstLogin.cookie
    },
    body: JSON.stringify({
      questId: createQuest.body.id,
      completedSteps: ["Naredi stvar"]
    })
  });

  assert.equal(firstSubmit.response.status, 201);

  const firstApprove = await requestJson(baseUrl, `/api/requests/${firstSubmit.body.id}/approve`, {
    method: "POST",
    headers: {
      Cookie: adminSetup.cookie
    }
  });

  assert.equal(firstApprove.response.status, 200);

  const questsAfterFirstApproval = await requestJson(baseUrl, "/api/me/quests", {
    headers: {
      Cookie: secondLogin.cookie
    }
  });

  assert.equal(questsAfterFirstApproval.response.status, 200);
  assert.equal(questsAfterFirstApproval.body[0].completedCount, 1);
  assert.equal(questsAfterFirstApproval.body[0].completionLimit, 2);
  assert.equal(questsAfterFirstApproval.body[0].participantCount, 0);

  const secondJoin = await requestJson(baseUrl, "/api/quest-joins", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: secondLogin.cookie
    },
    body: JSON.stringify({
      questId: createQuest.body.id
    })
  });

  assert.equal(secondJoin.response.status, 200);

  const cancelQuest = await requestJson(baseUrl, `/api/quests/${createQuest.body.id}/cancel`, {
    method: "POST",
    headers: {
      Cookie: adminSetup.cookie
    }
  });

  assert.equal(cancelQuest.response.status, 200);
  assert.equal(cancelQuest.body.active, false);

  const storedData = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));
  const storedQuest = storedData.quests.find((quest) => quest.id === createQuest.body.id);

  assert.equal(storedQuest.completedCount, 1);
  assert.equal(storedQuest.active, false);
  assert.ok(storedQuest.cancelledAt);
});

test("Discord notifications fire for quests, badge requests, and group quest joins", async (t) => {
  const sentMessages = [];
  withDiscordEnv(t, sentMessages);

  const { baseUrl } = await createTestServer(t, {
    users: [
      {
        id: 1,
        name: "Alice",
        code: "ALICE",
        points: 0,
        attendance: 0,
        discordUserId: "111111111111111111",
        userBadges: [],
        badgeIds: []
      },
      {
        id: 2,
        name: "Bob",
        code: "BOB",
        points: 0,
        attendance: 0,
        discordUserId: "222222222222222222",
        userBadges: [
          {
            badgeId: 1,
            level: 1
          }
        ],
        badgeIds: [1]
      }
    ],
    requests: [],
    meetings: [],
    quests: [],
    events: [],
    badges: [
      {
        id: 1,
        name: "Pomocnik",
        requirements: "Pomagaj skupnosti",
        description: "Osnovna značka",
        levelDescriptions: ["Osnovna značka"],
        imagePath: "/uploads/badges/test.png",
        createdAt: new Date().toISOString()
      }
    ],
    badgeTransfers: [],
    directMessages: [],
    forumMessages: [],
    discordNotifications: [],
    userAuth: [],
    adminAuth: {
      username: "admin",
      passwordHash: "",
      passwordSalt: "",
      passwordUpdatedAt: ""
    }
  });

  setUserPasswordById(1, "alice-pass");
  setUserPasswordById(2, "bob-pass");

  const adminSetup = await requestJson(baseUrl, "/api/admin/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "admin",
      password: "secret123"
    })
  });
  const aliceLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Alice",
      password: "alice-pass"
    })
  });
  const bobLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Bob",
      password: "bob-pass"
    })
  });

  const createdQuest = await requestJson(baseUrl, "/api/quests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      title: "Skupinski Quest",
      rewardPoints: 5,
      requiredPlayers: 2,
      completionLimit: 1,
      steps: ["Naredi korak"]
    })
  });

  assert.equal(createdQuest.response.status, 201);
  await flushAsyncNotifications();
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "channel");
  assert.match(sentMessages[0].content, /Nov quest: Skupinski Quest/);

  const aliceJoin = await requestJson(baseUrl, "/api/quest-joins", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: aliceLogin.cookie
    },
    body: JSON.stringify({
      questId: createdQuest.body.id
    })
  });

  assert.equal(aliceJoin.response.status, 200);
  await flushAsyncNotifications();
  assert.equal(sentMessages.length, 1);

  const bobJoin = await requestJson(baseUrl, "/api/quest-joins", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: bobLogin.cookie
    },
    body: JSON.stringify({
      questId: createdQuest.body.id
    })
  });

  assert.equal(bobJoin.response.status, 200);
  await flushAsyncNotifications();
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[1].type, "dm");
  assert.equal(sentMessages[1].userId, "111111111111111111");
  assert.match(sentMessages[1].content, /Bob se je pridružil\/a/);

  const duplicateBobJoin = await requestJson(baseUrl, "/api/quest-joins", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: bobLogin.cookie
    },
    body: JSON.stringify({
      questId: createdQuest.body.id
    })
  });

  assert.equal(duplicateBobJoin.response.status, 200);
  await flushAsyncNotifications();
  assert.equal(sentMessages.length, 2);

  const badgeRequest = await requestJson(baseUrl, "/api/badge-share-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: aliceLogin.cookie
    },
    body: JSON.stringify({
      targetCode: "BOB",
      badgeId: 1
    })
  });

  assert.equal(badgeRequest.response.status, 201);
  await flushAsyncNotifications();
  assert.equal(sentMessages.length, 3);
  assert.equal(sentMessages[2].type, "dm");
  assert.equal(sentMessages[2].userId, "222222222222222222");
  assert.match(sentMessages[2].content, /Alice prosi za značko "Pomocnik"/);
});

test("scheduled Discord event reminders and monthly leaders are deduped", async (t) => {
  const sentMessages = [];
  withDiscordEnv(t, sentMessages);

  const { dataFilePath } = await createTestServer(t, {
    users: [
      {
        id: 1,
        name: "Ana",
        code: "ANA",
        points: 10,
        attendance: 1,
        userBadges: [{ badgeId: 1, level: 1 }],
        badgeIds: [1]
      },
      {
        id: 2,
        name: "Bojan",
        code: "BOJAN",
        points: 20,
        attendance: 3,
        userBadges: [],
        badgeIds: []
      }
    ],
    requests: [
      {
        id: 1,
        type: "badge-share",
        status: "approved",
        targetUserCode: "ANA"
      }
    ],
    meetings: [],
    quests: [],
    events: [
      {
        id: 1,
        title: "Skupni cilj",
        date: "2026-06-15",
        conditionType: "points-total",
        targetValue: 50,
        badgeId: null,
        rewardPoints: 5,
        penaltyPoints: 1,
        status: "pending",
        currentValue: null,
        success: null,
        createdAt: "2026-06-01T00:00:00.000Z"
      }
    ],
    badges: [
      {
        id: 1,
        name: "Pomocnik",
        requirements: "Pomagaj skupnosti",
        description: "Osnovna značka",
        levelDescriptions: ["Osnovna značka"],
        imagePath: "/uploads/badges/test.png",
        createdAt: "2026-06-01T00:00:00.000Z"
      }
    ],
    badgeTransfers: [],
    directMessages: [],
    forumMessages: [],
    discordNotifications: [],
    userAuth: [],
    adminAuth: {
      username: "admin",
      passwordHash: "",
      passwordSalt: "",
      passwordUpdatedAt: ""
    }
  });

  await postDueEventReminders(new Date("2026-06-12T08:00:00.000Z"));
  await postDueEventReminders(new Date("2026-06-12T10:00:00.000Z"));

  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].content, /Dogodek se približuje: Skupni cilj/);

  await postMonthlyLeaders(new Date("2026-06-01T08:00:00.000Z"));
  await postMonthlyLeaders(new Date("2026-06-01T10:00:00.000Z"));

  assert.equal(sentMessages.length, 2);
  assert.match(sentMessages[1].content, /Mesečna lestvica/);
  assert.match(sentMessages[1].content, /Točke:\n1\. Bojan - 20/);

  const storedData = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));
  const notificationKeys = storedData.discordNotifications.map((notification) => notification.key);

  assert.deepEqual(notificationKeys.sort(), [
    "event-reminder:2026-06-12:1",
    "monthly-leaders:2026-06"
  ]);
});

test("admin cannot create duplicate usernames", async (t) => {
  const { baseUrl } = await createTestServer(t);

  const adminSetup = await requestJson(baseUrl, "/api/admin/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "admin",
      password: "secret123"
    })
  });

  assert.equal(adminSetup.response.status, 201);

  const firstUser = await requestJson(baseUrl, "/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Duplicate Name",
      password: "temp-pass-1"
    })
  });

  assert.equal(firstUser.response.status, 201);

  const duplicateUser = await requestJson(baseUrl, "/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Duplicate Name",
      password: "temp-pass-2"
    })
  });

  assert.equal(duplicateUser.response.status, 409);
  assert.match(duplicateUser.body.error, /ime je že v uporabi/i);
});

test("admin can manage Discord IDs without exposing them publicly", async (t) => {
  const { baseUrl } = await createTestServer(t);

  const adminSetup = await requestJson(baseUrl, "/api/admin/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "admin",
      password: "secret123"
    })
  });

  const invalidDiscordUser = await requestJson(baseUrl, "/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Invalid Discord",
      password: "temp-pass-1",
      discordUserId: "not-a-snowflake"
    })
  });

  assert.equal(invalidDiscordUser.response.status, 400);

  const createdUser = await requestJson(baseUrl, "/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Discord Mentor",
      password: "temp-pass-1",
      discordUserId: "123456789012345678"
    })
  });

  assert.equal(createdUser.response.status, 201);
  assert.equal(createdUser.body.discordUserId, "123456789012345678");

  const adminUsers = await requestJson(baseUrl, "/api/admin/users", {
    headers: {
      Cookie: adminSetup.cookie
    }
  });

  assert.equal(adminUsers.response.status, 200);
  assert.equal(
    adminUsers.body.find((user) => user.code === createdUser.body.code).discordUserId,
    "123456789012345678"
  );

  const publicUsers = await requestJson(baseUrl, "/api/users");
  const publicUser = publicUsers.body.find((user) => user.code === createdUser.body.code);

  assert.equal(publicUsers.response.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(publicUser, "discordUserId"), false);

  const publicProfile = await requestJson(baseUrl, `/api/users/${createdUser.body.code}`);

  assert.equal(publicProfile.response.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(publicProfile.body, "discordUserId"), false);

  const updatedUser = await requestJson(baseUrl, `/api/users/${createdUser.body.code}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Discord Mentor",
      discordUserId: "223456789012345678"
    })
  });

  assert.equal(updatedUser.response.status, 200);
  assert.equal(updatedUser.body.discordUserId, "223456789012345678");
});

test("Discord messages format monthly leaders by scoreboard categories", () => {
  const message = formatMonthlyLeadersMessage({
    users: [
      {
        name: "Ana",
        code: "ANA",
        points: 10,
        attendance: 1,
        userBadges: [{ badgeId: 1, level: 1 }]
      },
      {
        name: "Bojan",
        code: "BOJAN",
        points: 20,
        attendance: 3,
        userBadges: []
      },
      {
        name: "Cene",
        code: "CENE",
        points: 15,
        attendance: 2,
        userBadges: [{ badgeId: 1, level: 1 }, { badgeId: 2, level: 1 }]
      }
    ],
    requests: [
      {
        type: "badge-share",
        status: "approved",
        targetUserCode: "ANA"
      },
      {
        type: "badge-share",
        status: "approved",
        targetUserCode: "ANA"
      }
    ]
  }, new Date("2026-06-01T00:00:00.000Z"));

  assert.match(message, /Točke:\n1\. Bojan - 20\n2\. Cene - 15\n3\. Ana - 10/);
  assert.match(message, /Sestanki:\n1\. Bojan - 3\n2\. Cene - 2\n3\. Ana - 1/);
  assert.match(message, /Značke:\n1\. Cene - 2\n2\. Ana - 1\n3\. Bojan - 0/);
  assert.match(message, /P2P:\n1\. Ana - 2\n2\. Bojan - 0\n3\. Cene - 0/);
});

test("admin and mentor can exchange direct messages", async (t) => {
  const { baseUrl } = await createTestServer(t);

  const adminSetup = await requestJson(baseUrl, "/api/admin/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "admin",
      password: "secret123"
    })
  });

  assert.equal(adminSetup.response.status, 201);

  const createdUser = await requestJson(baseUrl, "/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      name: "Mentor Chat",
      password: "temp-pass-1"
    })
  });

  assert.equal(createdUser.response.status, 201);

  setUserPasswordById(createdUser.body.id, "mentor-pass");

  const userLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Mentor Chat",
      password: "mentor-pass"
    })
  });

  assert.equal(userLogin.response.status, 201);

  const mentorMessage = await requestJson(baseUrl, "/api/me/direct-messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: userLogin.cookie
    },
    body: JSON.stringify({
      content: "Pozdrav admin, imam vprasanje."
    })
  });

  assert.equal(mentorMessage.response.status, 201);
  assert.equal(mentorMessage.body.senderType, "user");
  assert.equal(mentorMessage.body.senderCode, createdUser.body.code);
  assert.equal(mentorMessage.body.recipientType, "admin");

  const adminThreads = await requestJson(baseUrl, "/api/admin/direct-messages", {
    headers: {
      Cookie: adminSetup.cookie
    }
  });

  assert.equal(adminThreads.response.status, 200);
  assert.ok(adminThreads.body.length >= 1);
  assert.equal(adminThreads.body[0].userCode, createdUser.body.code);
  assert.equal(adminThreads.body[0].lastMessagePreview, "Pozdrav admin, imam vprasanje.");

  const adminConversation = await requestJson(baseUrl, `/api/admin/direct-messages/${createdUser.body.code}`, {
    headers: {
      Cookie: adminSetup.cookie
    }
  });

  assert.equal(adminConversation.response.status, 200);
  assert.equal(adminConversation.body.messages.length, 1);
  assert.equal(adminConversation.body.messages[0].content, "Pozdrav admin, imam vprasanje.");

  const adminReply = await requestJson(baseUrl, "/api/admin/direct-messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      targetCode: createdUser.body.code,
      content: "Zivjo, tukaj admin."
    })
  });

  assert.equal(adminReply.response.status, 201);
  assert.equal(adminReply.body.senderType, "admin");

  const mentorConversation = await requestJson(baseUrl, "/api/me/direct-messages", {
    headers: {
      Cookie: userLogin.cookie
    }
  });

  assert.equal(mentorConversation.response.status, 200);
  assert.equal(mentorConversation.body.target.type, "admin");
  assert.equal(mentorConversation.body.messages.length, 2);
  assert.equal(mentorConversation.body.messages[1].content, "Zivjo, tukaj admin.");
  assert.equal(mentorConversation.body.messages[1].isFromAdmin, true);
});

test("mentors can exchange direct messages with each other", async (t) => {
  const { baseUrl } = await createTestServer(t, {
    users: [
      {
        id: 1,
        name: "Alice",
        code: "ALICE",
        points: 0,
        attendance: 0,
        userBadges: [],
        badgeIds: []
      },
      {
        id: 2,
        name: "Bob",
        code: "BOB",
        points: 0,
        attendance: 0,
        userBadges: [],
        badgeIds: []
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
  });

  setUserPasswordById(1, "alice-pass");
  setUserPasswordById(2, "bob-pass");

  const aliceLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Alice",
      password: "alice-pass"
    })
  });

  const bobLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Bob",
      password: "bob-pass"
    })
  });

  assert.equal(aliceLogin.response.status, 201);
  assert.equal(bobLogin.response.status, 201);

  const aliceThreads = await requestJson(baseUrl, "/api/me/direct-message-threads", {
    headers: {
      Cookie: aliceLogin.cookie
    }
  });

  assert.equal(aliceThreads.response.status, 200);
  assert.equal(aliceThreads.body[0].targetType, "admin");
  assert.equal(aliceThreads.body[1].targetCode, "BOB");

  const mentorMessage = await requestJson(baseUrl, "/api/me/direct-messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: aliceLogin.cookie
    },
    body: JSON.stringify({
      targetType: "user",
      targetCode: "BOB",
      content: "Zivjo Bob, kako si?"
    })
  });

  assert.equal(mentorMessage.response.status, 201);
  assert.equal(mentorMessage.body.senderType, "user");
  assert.equal(mentorMessage.body.recipientType, "user");
  assert.equal(mentorMessage.body.recipientCode, "BOB");

  const bobConversation = await requestJson(baseUrl, "/api/me/direct-messages?targetType=user&targetCode=ALICE", {
    headers: {
      Cookie: bobLogin.cookie
    }
  });

  assert.equal(bobConversation.response.status, 200);
  assert.equal(bobConversation.body.target.code, "ALICE");
  assert.equal(bobConversation.body.messages.length, 1);
  assert.equal(bobConversation.body.messages[0].content, "Zivjo Bob, kako si?");
  assert.equal(bobConversation.body.messages[0].senderCode, "ALICE");
  assert.equal(bobConversation.body.messages[0].recipientCode, "BOB");
});

test("only the badge holder can approve a badge-share request", async (t) => {
  const { baseUrl } = await createTestServer(t, {
    users: [
      {
        id: 1,
        name: "Alice",
        code: "ALICE",
        points: 0,
        attendance: 0,
        userBadges: [],
        badgeIds: []
      },
      {
        id: 2,
        name: "Bob",
        code: "BOB",
        points: 0,
        attendance: 0,
        userBadges: [
          {
            badgeId: 1,
            level: 1
          }
        ],
        badgeIds: [1]
      },
      {
        id: 3,
        name: "Cara",
        code: "CARA",
        points: 0,
        attendance: 0,
        userBadges: [],
        badgeIds: []
      }
    ],
    requests: [],
    meetings: [],
    quests: [],
    events: [],
    badges: [
      {
        id: 1,
        name: "Pomocnik",
        requirements: "Pomagaj skupnosti",
        description: "Osnovna značka",
        levelDescriptions: ["Osnovna značka"],
        imagePath: "/uploads/badges/test.png",
        createdAt: new Date().toISOString()
      }
    ],
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
  });

  setUserPasswordById(1, "alice-pass");
  setUserPasswordById(2, "bob-pass");
  setUserPasswordById(3, "cara-pass");

  const aliceLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Alice",
      password: "alice-pass"
    })
  });

  const bobLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Bob",
      password: "bob-pass"
    })
  });

  const caraLogin = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Cara",
      password: "cara-pass"
    })
  });

  assert.equal(aliceLogin.response.status, 201);
  assert.equal(bobLogin.response.status, 201);
  assert.equal(caraLogin.response.status, 201);

  const createShareRequest = await requestJson(baseUrl, "/api/badge-share-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: aliceLogin.cookie
    },
    body: JSON.stringify({
      targetCode: "BOB",
      badgeId: 1
    })
  });

  assert.equal(createShareRequest.response.status, 201);
  assert.equal(createShareRequest.body.targetUserName, "Bob");

  const incomingForBob = await requestJson(baseUrl, "/api/me/incoming-badge-requests", {
    headers: {
      Cookie: bobLogin.cookie
    }
  });

  assert.equal(incomingForBob.response.status, 200);
  assert.equal(incomingForBob.body.length, 1);

  const incomingForCara = await requestJson(baseUrl, "/api/me/incoming-badge-requests", {
    headers: {
      Cookie: caraLogin.cookie
    }
  });

  assert.equal(incomingForCara.response.status, 200);
  assert.equal(incomingForCara.body.length, 0);

  const unauthorizedAccept = await requestJson(
    baseUrl,
    `/api/badge-share-requests/${createShareRequest.body.id}/accept`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: caraLogin.cookie
      },
      body: JSON.stringify({
        approvedLevel: 1
      })
    }
  );

  assert.equal(unauthorizedAccept.response.status, 403);

  const authorizedAccept = await requestJson(
    baseUrl,
    `/api/badge-share-requests/${createShareRequest.body.id}/accept`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: bobLogin.cookie
      },
      body: JSON.stringify({
        approvedLevel: 1
      })
    }
  );

  assert.equal(authorizedAccept.response.status, 200);
  assert.equal(authorizedAccept.body.status, "approved");
});

test("admin deletes a badge only after typing its exact name", async (t) => {
  const { baseUrl, dataFilePath } = await createTestServer(t, {
    users: [
      {
        id: 1,
        name: "Alice",
        code: "ALICE",
        points: 0,
        attendance: 0,
        userBadges: [
          {
            badgeId: 1,
            level: 1
          }
        ],
        badgeIds: [1]
      },
      {
        id: 2,
        name: "Bob",
        code: "BOB",
        points: 0,
        attendance: 0,
        userBadges: [],
        badgeIds: []
      }
    ],
    requests: [
      {
        id: 1,
        type: "badge-share",
        userCode: "BOB",
        userName: "Bob",
        targetUserCode: "ALICE",
        targetUserName: "Alice",
        badgeId: 1,
        badgeName: "Test Badge",
        badgeLevel: 1,
        status: "pending",
        createdAt: "2026-06-01T00:00:00.000Z"
      }
    ],
    meetings: [],
    quests: [],
    events: [
      {
        id: 1,
        title: "Badge Event",
        date: "2026-06-20",
        conditionType: "badge-count",
        targetValue: 1,
        badgeId: 1,
        rewardPoints: 1,
        penaltyPoints: 0,
        status: "pending",
        currentValue: null,
        success: null,
        createdAt: "2026-06-01T00:00:00.000Z"
      }
    ],
    badges: [
      {
        id: 1,
        name: "Test Badge",
        requirements: "Test requirements",
        description: "Test description",
        levelDescriptions: ["Test description"],
        imagePath: "/uploads/badges/test.png",
        createdAt: "2026-06-01T00:00:00.000Z"
      }
    ],
    badgeTransfers: [
      {
        id: 1,
        badgeId: 1,
        badgeName: "Test Badge",
        fromUserCode: "",
        fromUserName: "",
        toUserCode: "ALICE",
        toUserName: "Alice",
        level: 1,
        sourceType: "admin",
        requestId: null,
        rootUserCode: "ALICE",
        rootUserName: "Alice",
        lineageCodes: ["ALICE"],
        lineageNames: ["Alice"],
        depth: 0,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z"
      }
    ],
    directMessages: [],
    forumMessages: [],
    userAuth: [],
    adminAuth: {
      username: "admin",
      passwordHash: "",
      passwordSalt: "",
      passwordUpdatedAt: ""
    }
  });

  const adminSetup = await requestJson(baseUrl, "/api/admin/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "admin",
      password: "secret123"
    })
  });

  const wrongConfirmation = await requestJson(baseUrl, "/api/badges/1", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      confirmationName: "test badge"
    })
  });

  assert.equal(wrongConfirmation.response.status, 400);

  const deletedBadge = await requestJson(baseUrl, "/api/badges/1", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminSetup.cookie
    },
    body: JSON.stringify({
      confirmationName: "Test Badge"
    })
  });

  assert.equal(deletedBadge.response.status, 200);
  assert.equal(deletedBadge.body.badge.name, "Test Badge");
  assert.equal(deletedBadge.body.removedUserBadgeCount, 1);
  assert.equal(deletedBadge.body.removedRequestCount, 1);
  assert.equal(deletedBadge.body.removedTransferCount, 1);
  assert.equal(deletedBadge.body.removedEventCount, 1);

  const storedData = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));

  assert.equal(storedData.badges.length, 0);
  assert.equal(storedData.users[0].userBadges.length, 0);
  assert.equal(storedData.users[0].badgeIds.length, 0);
  assert.equal(storedData.requests.length, 0);
  assert.equal(storedData.badgeTransfers.length, 0);
  assert.equal(storedData.events.length, 0);
});
