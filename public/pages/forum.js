const forumLoginForm = document.getElementById("forum-login-form");
const forumMessageForm = document.getElementById("forum-message-form");
const forumLoginMessage = document.getElementById("forum-login-message");
const forumMessageStatus = document.getElementById("forum-message-status");
const forumUserSummary = document.getElementById("forum-user-summary");
const forumCompose = document.getElementById("forum-compose");
const forumMessagesContainer = document.getElementById("forum-messages");

let currentForumUser = null;

function renderForumUser(user) {
  document.getElementById("forum-user-name").textContent = user.name;
  forumUserSummary.hidden = false;
  forumCompose.hidden = false;
}

function hideForumUser() {
  currentForumUser = null;
  forumUserSummary.hidden = true;
  forumCompose.hidden = true;
  clearMessage(forumMessageStatus);
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
    forumMessagesContainer.innerHTML = `<p class="message visible error">${error.message}</p>`;
  }
}

forumLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(forumLoginMessage);

  const formData = new FormData(forumLoginForm);
  const code = String(formData.get("code") || "").trim();

  try {
    const user = await apiFetch(`/api/users/${encodeURIComponent(code)}`);
    currentForumUser = user;
    renderForumUser(user);
    setMessage(forumLoginMessage, `Vpisan si kot ${user.name}.`, "success");
  } catch (error) {
    hideForumUser();
    setMessage(forumLoginMessage, error.message, "error");
  }
});

forumMessageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(forumMessageStatus);

  if (!currentForumUser) {
    setMessage(forumMessageStatus, "Za objavo se moraš najprej vpisati s kodo.", "error");
    return;
  }

  const formData = new FormData(forumMessageForm);
  const content = String(formData.get("content") || "").trim();

  try {
    await apiFetch("/api/forum-messages", {
      method: "POST",
      body: JSON.stringify({
        code: currentForumUser.code,
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

hideForumUser();
loadForumMessages();
