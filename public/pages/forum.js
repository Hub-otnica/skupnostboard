const forumLoginForm = document.getElementById("forum-login-form");
const forumMessageForm = document.getElementById("forum-message-form");
const forumLoginPanel = document.getElementById("forum-login-panel");
const forumLoginMessage = document.getElementById("forum-login-message");
const forumPasswordChangeForm = document.getElementById("forum-password-change-form");
const forumPasswordChangeMessage = document.getElementById("forum-password-change-message");
const forumPasswordChangePanel = document.getElementById("forum-password-change-panel");
const forumMessageStatus = document.getElementById("forum-message-status");
const forumUserSummary = document.getElementById("forum-user-summary");
const forumLogoutButton = document.getElementById("forum-logout-button");
const forumCompose = document.getElementById("forum-compose");
const forumMessagesContainer = document.getElementById("forum-messages");

let currentForumUser = null;

async function forumApiFetch(path, options = {}) {
  try {
    return await apiFetch(path, options);
  } catch (error) {
    if (String(error.message || "").includes("prijaviti kot mentorica/mentor")) {
      setLoggedOutState("Seja je potekla. Prosim, prijavi se znova.");
    }

    throw error;
  }
}

function renderForumUser(user) {
  currentForumUser = user;
  document.getElementById("forum-user-name").textContent = user.name;
  forumLoginPanel.hidden = true;
  forumUserSummary.hidden = false;
  forumPasswordChangePanel.hidden = !user.mustChangePassword;
  forumCompose.hidden = user.mustChangePassword === true;
  clearMessage(forumPasswordChangeMessage);
}

function setLoggedOutState(message = "", type = "error") {
  currentForumUser = null;
  forumLoginPanel.hidden = false;
  forumUserSummary.hidden = true;
  forumPasswordChangePanel.hidden = true;
  forumCompose.hidden = true;
  clearMessage(forumMessageStatus);
  clearMessage(forumPasswordChangeMessage);

  if (message) {
    setMessage(forumLoginMessage, message, type);
  } else {
    clearMessage(forumLoginMessage);
  }
}

function renderForumMessages(messages) {
  if (!messages.length) {
    forumMessagesContainer.innerHTML = '<p class="muted">Na forumu še ni objav.</p>';
    return;
  }

  forumMessagesContainer.innerHTML = messages
    .map((message) => `
      <article class="forum-post">
        <div class="inline-actions" style="justify-content: space-between; align-items: center;">
          <strong>${escapeHtml(message.userName)}</strong>
          <span class="muted">${new Date(message.createdAt).toLocaleString()}</span>
        </div>
        <p>${escapeHtml(message.content)}</p>
      </article>
    `)
    .join("");
}

async function loadForumMessages() {
  try {
    const messages = await apiFetch("/api/forum-messages");
    renderForumMessages(messages);
  } catch (error) {
    forumMessagesContainer.innerHTML = renderErrorHtml(error.message);
  }
}

forumLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(forumLoginMessage);

  const formData = new FormData(forumLoginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  try {
    await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    const user = await forumApiFetch("/api/me");
    forumLoginForm.reset();
    renderForumUser(user);
    if (user.mustChangePassword) {
      setMessage(forumLoginMessage, "Prijava je uspela. Pred pisanjem moraš nastaviti novo geslo.", "error");
      return;
    }

    setMessage(forumLoginMessage, `Prijavljen si kot ${user.name}.`, "success");
  } catch (error) {
    setLoggedOutState();
    setMessage(forumLoginMessage, error.message, "error");
  }
});

forumPasswordChangeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(forumPasswordChangeMessage);

  const formData = new FormData(forumPasswordChangeForm);
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (newPassword !== confirmPassword) {
    setMessage(forumPasswordChangeMessage, "Gesli se ne ujemata.", "error");
    return;
  }

  try {
    await forumApiFetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });

    forumPasswordChangeForm.reset();
    const user = await forumApiFetch("/api/me");
    renderForumUser(user);
    setMessage(forumLoginMessage, "Novo geslo je shranjeno. Zdaj lahko objavljaš na forumu.", "success");
  } catch (error) {
    setMessage(forumPasswordChangeMessage, error.message, "error");
  }
});

forumLogoutButton.addEventListener("click", async () => {
  try {
    await apiFetch("/api/auth/logout", {
      method: "POST"
    });
  } finally {
    forumLoginForm.reset();
    setLoggedOutState("Odjavljen si iz mentorskega računa.", "success");
  }
});

forumMessageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(forumMessageStatus);

  if (!currentForumUser) {
    setMessage(forumMessageStatus, "Za objavo se moraš najprej prijaviti.", "error");
    return;
  }

  const formData = new FormData(forumMessageForm);
  const content = String(formData.get("content") || "").trim();

  try {
    await forumApiFetch("/api/forum-messages", {
      method: "POST",
      body: JSON.stringify({
        content
      })
    });

    forumMessageForm.reset();
    setMessage(forumMessageStatus, "Sporočilo je bilo objavljeno.", "success");
    await loadForumMessages();
  } catch (error) {
    setMessage(forumMessageStatus, error.message, "error");
  }
});

async function restoreForumSession() {
  try {
    const user = await apiFetch("/api/me");
    renderForumUser(user);
  } catch (_error) {
    setLoggedOutState();
  }
}

setLoggedOutState();
loadForumMessages();
restoreForumSession();
