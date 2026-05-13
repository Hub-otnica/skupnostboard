const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setUserPasswordById } = require("../server/services/userAuthService");

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
