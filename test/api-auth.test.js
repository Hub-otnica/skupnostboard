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
