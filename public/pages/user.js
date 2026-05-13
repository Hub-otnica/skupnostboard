const lookupForm = document.getElementById("lookup-form");
const requestForm = document.getElementById("request-form");
const badgeShareForm = document.getElementById("badge-share-form");
const directMessageForm = document.getElementById("direct-message-form");
const lookupMessage = document.getElementById("lookup-message");
const passwordChangeForm = document.getElementById("password-change-form");
const passwordChangeMessage = document.getElementById("password-change-message");
const requestMessage = document.getElementById("request-message");
const questMessage = document.getElementById("quest-message");
const badgeShareMessage = document.getElementById("badge-share-message");
const incomingBadgeMessage = document.getElementById("incoming-badge-message");
const directMessageStatus = document.getElementById("direct-message-status");
const userLoginPanel = document.getElementById("user-login-panel");
const passwordChangePanel = document.getElementById("password-change-panel");
const userSummary = document.getElementById("user-summary");
const userLogoutButton = document.getElementById("user-logout-button");
const userActions = document.getElementById("user-actions");
const questsList = document.getElementById("quests-list");
const selectedQuestContainer = document.getElementById("selected-quest");
const userBadgesContainer = document.getElementById("user-badges");
const badgeShareSelect = document.getElementById("badge-share-select");
const badgeHolderSelect = document.getElementById("badge-holder-select");
const badgeRequirementsContainer = document.getElementById("badge-requirements");
const badgeHoldersContainer = document.getElementById("badge-holders");
const incomingBadgeRequestsContainer = document.getElementById("incoming-badge-requests");
const directMessageThreadList = document.getElementById("direct-message-thread-list");
const directMessageThreadTitle = document.getElementById("direct-message-thread-title");
const directMessageThreadDescription = document.getElementById("direct-message-thread-description");
const directMessagesContainer = document.getElementById("direct-messages");
const refreshDirectMessagesButton = document.getElementById("refresh-direct-messages");
const directMessageInput = document.getElementById("direct-message-input");
const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");

let currentUser = null;
let quests = [];
let selectedQuestId = null;
let badgeShareOptions = [];
let directMessageThreads = [];
let selectedDirectMessageTargetType = "admin";
let selectedDirectMessageTargetCode = "";

async function userApiFetch(path, options = {}) {
  try {
    return await apiFetch(path, options);
  } catch (error) {
    if (String(error.message || "").includes("prijaviti kot mentorica/mentor")) {
      setLoggedOutState("Seja je potekla. Prosim, prijavi se znova.");
    }

    throw error;
  }
}

function renderLoggedOutPlaceholders() {
  questsList.innerHTML = '<p class="muted">Prijavi se, da vidiš svoje queste.</p>';
  selectedQuestContainer.innerHTML = '<p class="muted">Prijavi se, da lahko odpreš in oddaš quest.</p>';
  userBadgesContainer.innerHTML = '<p class="muted">Prijavi se, da vidiš svoje značke.</p>';
  badgeShareSelect.innerHTML = '<option value="">Najprej se prijavi</option>';
  badgeHolderSelect.innerHTML = '<option value="">Najprej se prijavi</option>';
  badgeRequirementsContainer.innerHTML = '<p class="muted">Prijavi se, da vidiš značke, ki jih lahko pridobiš.</p>';
  badgeHoldersContainer.innerHTML = '<p class="muted">Prijavi se, da vidiš mentorice/mentorje z izbrano značko.</p>';
  incomingBadgeRequestsContainer.innerHTML = '<p class="muted">Prijavi se, da vidiš prejete prošnje.</p>';
  directMessageThreadList.innerHTML = '<p class="muted">Prijavi se, da vidiš pogovore.</p>';
  directMessageThreadTitle.textContent = "Pogovor";
  directMessageThreadDescription.textContent = "Izberi pogovor na levi, da vidiš sporočila.";
  directMessagesContainer.innerHTML = '<p class="muted">Prijavi se, da vidiš pogovore.</p>';
  directMessageInput.placeholder = "Napiši kratko vprašanje ali obvestilo";
}

function renderBadgeCard(badge) {
  return `
    <details class="badge-card badge-card-details">
      <summary class="badge-card-summary">
        <div class="badge-visual">
          <img src="${badge.imagePath || badge.imageData}" alt="${escapeHtml(badge.name)}" class="badge-image" />
          <span class="badge-level-badge">${badge.level || 1}</span>
        </div>
        <p class="badge-name">${escapeHtml(badge.name)}</p>
      </summary>
      <div class="badge-meta">
        <p>${escapeHtml(badge.description || "Opis ni podan.")}</p>
      </div>
    </details>
  `;
}

function switchTab(targetId) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === targetId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.id === targetId;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
}

function renderUser(user) {
  document.getElementById("user-name").textContent = user.name;
  document.getElementById("user-points").textContent = user.points;
  document.getElementById("user-attendance").textContent = user.attendance;
  renderUserBadges(user.badges || []);
}

function setAuthenticatedState(user) {
  currentUser = user;
  userLoginPanel.hidden = true;
  userSummary.hidden = false;
  passwordChangePanel.hidden = !user.mustChangePassword;
  userActions.hidden = user.mustChangePassword === true;
  clearMessage(lookupMessage);
  clearMessage(passwordChangeMessage);
  renderUser(user);

  if (user.mustChangePassword) {
    renderLoggedOutPlaceholders();
  }
}

function setLoggedOutState(message = "", type = "error") {
  currentUser = null;
  quests = [];
  badgeShareOptions = [];
  selectedQuestId = null;
  directMessageThreads = [];
  selectedDirectMessageTargetType = "admin";
  selectedDirectMessageTargetCode = "";
  userLoginPanel.hidden = false;
  passwordChangePanel.hidden = true;
  userSummary.hidden = true;
  userActions.hidden = true;
  clearMessage(requestMessage);
  clearMessage(questMessage);
  clearMessage(badgeShareMessage);
  clearMessage(incomingBadgeMessage);
  clearMessage(directMessageStatus);
  clearMessage(passwordChangeMessage);
  renderLoggedOutPlaceholders();

  if (message) {
    setMessage(lookupMessage, message, type);
  } else {
    clearMessage(lookupMessage);
  }
}

function renderUserBadges(badges) {
  if (!badges.length) {
    userBadgesContainer.innerHTML = '<p class="muted">Ta mentorica/mentor še nima značk.</p>';
    return;
  }

  userBadgesContainer.innerHTML = badges
    .map(renderBadgeCard)
    .join("");
}

function renderQuestList() {
  if (quests.length === 0) {
    questsList.innerHTML = '<p class="muted">Trenutno ni aktivnih questov.</p>';
    selectedQuestContainer.innerHTML = '<p class="muted">Ko bo admin objavil quest, bo prikazan tukaj.</p>';
    return;
  }

  questsList.innerHTML = quests
    .map((quest) => `
      <button type="button" class="quest-card ${quest.id === selectedQuestId ? "active" : ""}" data-quest-id="${quest.id}">
        <strong>${escapeHtml(quest.title)}</strong>
        <span class="quest-meta">${quest.rewardPoints} točk</span>
        <span class="muted">${quest.steps.length} korakov</span>
        <span class="muted">${quest.participantCount} / ${quest.requiredPlayers} igralcev</span>
        <span class="muted">Izpolnitve: ${quest.completedCount || 0} / ${quest.completionLimit || 1}</span>
        <span class="muted">${quest.participantNames.length ? quest.participantNames.map((name) => escapeHtml(name)).join(", ") : "Še brez prijavljenih."}</span>
      </button>
    `)
    .join("");
}

function renderSelectedQuest() {
  clearMessage(questMessage);

  if (!quests.length) {
    selectedQuestContainer.innerHTML = '<p class="muted">Izberi quest iz seznama na levi.</p>';
    return;
  }

  const quest = quests.find((entry) => entry.id === selectedQuestId) || quests[0];
  selectedQuestId = quest.id;
  const canJoin = currentUser && !quest.isParticipant && !quest.isFull && !quest.hasPendingRequest;
  const canSubmit = currentUser && quest.isParticipant && quest.isFull && !quest.hasPendingRequest;
  const participantList = quest.participantNames.length
    ? quest.participantNames.map((name) => `<div class="quest-mini-item">${escapeHtml(name)}</div>`).join("")
    : '<p class="muted">Na quest še ni prijavljenih igralcev.</p>';
  let questStatus = "";

  if (quest.hasPendingRequest) {
    questStatus = '<p class="muted">Ta quest je že oddan in čaka na potrditev administratorja.</p>';
  } else if (quest.isParticipant) {
    questStatus = '<p class="muted">Na ta quest si že prijavljen.</p>';
  } else if (quest.isFull) {
    questStatus = '<p class="muted">Ekipa za ta quest je že polna.</p>';
  } else {
    questStatus = '<p class="muted">Na ta quest se lahko prijaviš, dokler ekipa ni polna.</p>';
  }

  selectedQuestContainer.innerHTML = `
    <div class="quest-detail">
      <h3>${escapeHtml(quest.title)}</h3>
      <p><strong>Nagrada:</strong> ${quest.rewardPoints} točk</p>
      <p><strong>Ekipa:</strong> ${quest.participantCount} / ${quest.requiredPlayers}</p>
      <p><strong>Izpolnitve:</strong> ${quest.completedCount || 0} / ${quest.completionLimit || 1}</p>
      <div class="quest-mini-list">${participantList}</div>
      ${questStatus}
      <button type="button" id="join-quest-button" ${canJoin ? "" : "disabled"}>Prijavi se na quest</button>
      <p class="muted">Quest lahko odda katerakoli prijavljena mentorica/katerikoli prijavljeni mentor, ko je ekipa popolna in so vsi koraki odkljukani.</p>
      <form id="quest-submit-form">
        <div class="quest-checklist">
          ${quest.steps
            .map(
              (step, index) => `
                <label class="member-option">
                  <input type="checkbox" name="completedStep" value="${escapeHtml(step)}" />
                  <span>${index + 1}. ${escapeHtml(step)}</span>
                </label>
              `
            )
            .join("")}
        </div>
        <button type="submit" ${canSubmit ? "" : "disabled"}>Oddaj quest v potrditev</button>
      </form>
    </div>
  `;
}

function renderBadgeShareOptions() {
  if (!badgeShareOptions.length) {
    badgeShareSelect.innerHTML = '<option value="">Ni značk za pridobitev</option>';
    badgeHolderSelect.innerHTML = '<option value="">Ni mentoric/mentorjev</option>';
    badgeRequirementsContainer.innerHTML = '<p class="muted">Trenutno ni značk, ki bi jih lahko pridobil.</p>';
    badgeHoldersContainer.innerHTML = '<p class="muted">Trenutno ni značk, ki bi jih lahko pridobil.</p>';
    return;
  }

  badgeShareSelect.innerHTML = `
    <option value="">Izberi značko</option>
    ${badgeShareOptions
      .map((badge) => `<option value="${badge.id}">${escapeHtml(badge.name)}</option>`)
      .join("")}
  `;

  renderSelectedBadgeHolders();
}

function renderSelectedBadgeHolders() {
  const selectedBadgeId = Number(badgeShareSelect.value);
  const badge = badgeShareOptions.find((entry) => entry.id === selectedBadgeId);

  if (!badge) {
    badgeHolderSelect.innerHTML = '<option value="">Izberi mentorico/mentorja</option>';
    badgeRequirementsContainer.innerHTML = '<p class="muted">Izberi značko, da vidiš pogoje za pridobitev.</p>';
    badgeHoldersContainer.innerHTML = '<p class="muted">Izberi značko, da vidiš kdo jo ima.</p>';
    return;
  }

  badgeRequirementsContainer.innerHTML = `
    <p><strong>Pogoji za pridobitev:</strong></p>
    <p>${escapeHtml(badge.requirements || "Pogoji niso podani.")}</p>
  `;

  badgeHoldersContainer.innerHTML = badge.holders
    .map((holder) => `<div class="quest-mini-item">${escapeHtml(holder.name)} <strong>(nivo ${holder.level || 1})</strong></div>`)
    .join("");

  badgeHolderSelect.innerHTML = `
    <option value="">Izberi mentorico/mentorja</option>
    ${badge.holders
      .map((holder) => `<option value="${escapeHtml(holder.code)}">${escapeHtml(holder.name)} - nivo ${holder.level || 1}</option>`)
      .join("")}
  `;

  badgeHoldersContainer.innerHTML = '<p class="muted">Izberi mentorski profil, da vidiš podrobnosti.</p>';
}

function renderSelectedBadgeHolderDetails() {
  const selectedBadgeId = Number(badgeShareSelect.value);
  const selectedHolderCode = String(badgeHolderSelect.value || "").trim();
  const badge = badgeShareOptions.find((entry) => entry.id === selectedBadgeId);

  if (!badge) {
    badgeHoldersContainer.innerHTML = '<p class="muted">Najprej izberi značko.</p>';
    return;
  }

  if (!selectedHolderCode) {
    badgeHoldersContainer.innerHTML = '<p class="muted">Izberi mentorski profil, da vidiš podrobnosti.</p>';
    return;
  }

  const holder = (badge.holders || []).find((entry) => entry.code === selectedHolderCode);

  if (!holder) {
    badgeHoldersContainer.innerHTML = '<p class="muted">Izbrani mentorski profil ni na voljo.</p>';
    return;
  }

  badgeHoldersContainer.innerHTML = `
    <div class="quest-mini-item">
      ${escapeHtml(holder.name)} <strong>(nivo ${holder.level || 1})</strong>
    </div>
  `;
}

function renderIncomingBadgeRequests(requests) {
  if (!requests.length) {
    incomingBadgeRequestsContainer.innerHTML = '<p class="muted">Ni prejetih prošenj.</p>';
    return;
  }

  incomingBadgeRequestsContainer.innerHTML = requests
    .map((request) => `
      <article class="card">
        <h3>${escapeHtml(request.userName)}</h3>
        <p><strong>Želi značko:</strong> ${escapeHtml(request.badgeName)} (nivo ${request.badgeLevel || 1})</p>
        <p><strong>Pogoji za pridobitev:</strong> ${escapeHtml(request.badgeRequirements || "Pogoji niso podani.")}</p>
        <label>
          Potrdi nivo
          <select data-badge-request-level="${request.id}">
            ${Array.from({ length: request.maxApprovableLevel || 1 }, (_, index) => {
              const level = index + 1;
              const isSelected = level === (request.badgeLevel || request.maxApprovableLevel || 1);
              return `<option value="${level}" ${isSelected ? "selected" : ""}>Nivo ${level}</option>`;
            }).join("")}
          </select>
        </label>
        <p class="muted">Poslano: ${new Date(request.createdAt).toLocaleString()}</p>
        <button type="button" data-badge-request-id="${request.id}">Sprejmi deljenje značke</button>
      </article>
    `)
    .join("");
}

function getSelectedDirectMessageThread() {
  return directMessageThreads.find(
    (thread) =>
      thread.targetType === selectedDirectMessageTargetType &&
      String(thread.targetCode || "") === String(selectedDirectMessageTargetCode || "")
  ) || null;
}

function renderDirectMessageThreadList(threads) {
  directMessageThreads = threads;

  if (!threads.length) {
    directMessageThreadList.innerHTML = '<p class="muted">Trenutno ni drugih profilov za klepet.</p>';
    directMessageThreadTitle.textContent = "Pogovor";
    directMessageThreadDescription.textContent = "Ko bo ustvarjen še kak profil, bo tukaj prikazan seznam pogovorov.";
    directMessagesContainer.innerHTML = '<p class="muted">Pogovor še ni na voljo.</p>';
    directMessageForm.querySelector("button[type='submit']").disabled = true;
    return;
  }

  directMessageForm.querySelector("button[type='submit']").disabled = false;

  directMessageThreadList.innerHTML = threads
    .map((thread) => `
      <button
        type="button"
        class="message-thread-button ${thread.targetType === selectedDirectMessageTargetType && String(thread.targetCode || "") === String(selectedDirectMessageTargetCode || "") ? "active" : ""}"
        data-thread-target-type="${escapeHtml(thread.targetType)}"
        data-thread-target-code="${escapeHtml(thread.targetCode || "")}"
      >
        <strong>${escapeHtml(thread.targetName)}</strong>
        <span class="message-thread-preview">${escapeHtml(thread.lastMessagePreview || "Še ni sporočil.")}</span>
        <span class="muted">
          ${thread.lastMessageAt ? `${new Date(thread.lastMessageAt).toLocaleString()} • ` : ""}
          ${thread.messageCount} sporočil
        </span>
      </button>
    `)
    .join("");
}

function renderDirectMessages(conversation) {
  directMessageThreadTitle.textContent = `Pogovor z ${conversation.target.name}`;
  directMessageThreadDescription.textContent = conversation.target.type === "admin"
    ? "Tukaj lahko pišeš administratorju in vidiš njegove odgovore."
    : `Tukaj lahko pišeš mentorici/mentorju ${conversation.target.name}.`;
  directMessageInput.placeholder = conversation.target.type === "admin"
    ? "Napiši kratko vprašanje ali obvestilo administratorju"
    : `Napiši sporočilo za ${conversation.target.name}`;

  if (!conversation.messages.length) {
    directMessagesContainer.innerHTML = '<p class="muted">V tem pogovoru še ni sporočil.</p>';
    return;
  }

  directMessagesContainer.innerHTML = conversation.messages
    .map((message) => {
      const isOwnMessage = message.senderType === "user" && currentUser && message.senderCode === currentUser.code;
      const senderLabel = isOwnMessage ? "Ti" : (message.senderLabel || "Mentorica/Mentor");

      return `
        <article class="direct-message-card ${isOwnMessage ? "outgoing" : "incoming"}">
          <div class="inline-actions" style="justify-content: space-between; align-items: center; gap: 0.75rem;">
            <strong>${escapeHtml(senderLabel)}</strong>
            <span class="muted">${new Date(message.createdAt).toLocaleString()}</span>
          </div>
          <p>${escapeHtml(message.content)}</p>
        </article>
      `;
    })
    .join("");

  directMessagesContainer.scrollTop = directMessagesContainer.scrollHeight;
}

async function loadQuests() {
  if (!currentUser) {
    renderLoggedOutPlaceholders();
    return;
  }

  try {
    quests = await userApiFetch("/api/me/quests");
    if (!selectedQuestId && quests[0]) {
      selectedQuestId = quests[0].id;
    }
    if (selectedQuestId && !quests.some((quest) => quest.id === selectedQuestId)) {
      selectedQuestId = quests[0] ? quests[0].id : null;
    }
    renderQuestList();
    renderSelectedQuest();
  } catch (error) {
    questsList.innerHTML = renderErrorHtml(error.message);
    selectedQuestContainer.innerHTML = '<p class="muted">Questov ni bilo mogoče naložiti.</p>';
  }
}

async function loadBadgeShareOptions() {
  if (!currentUser) {
    renderLoggedOutPlaceholders();
    return;
  }

  try {
    badgeShareOptions = await userApiFetch("/api/me/badge-share-options");
    renderBadgeShareOptions();
  } catch (error) {
    badgeShareSelect.innerHTML = '<option value="">Napaka pri nalaganju</option>';
    badgeHolderSelect.innerHTML = '<option value="">Napaka pri nalaganju</option>';
    badgeRequirementsContainer.innerHTML = renderErrorHtml(error.message);
    badgeHoldersContainer.innerHTML = renderErrorHtml(error.message);
  }
}

async function loadIncomingBadgeRequests() {
  if (!currentUser) {
    renderLoggedOutPlaceholders();
    return;
  }

  try {
    const requests = await userApiFetch("/api/me/incoming-badge-requests");
    renderIncomingBadgeRequests(requests);
  } catch (error) {
    incomingBadgeRequestsContainer.innerHTML = renderErrorHtml(error.message);
  }
}

async function loadDirectMessageThreads() {
  if (!currentUser) {
    renderLoggedOutPlaceholders();
    return;
  }

  try {
    const threads = await userApiFetch("/api/me/direct-message-threads");

    if (
      !threads.some(
        (thread) =>
          thread.targetType === selectedDirectMessageTargetType &&
          String(thread.targetCode || "") === String(selectedDirectMessageTargetCode || "")
      )
    ) {
      const defaultThread = threads[0] || null;
      selectedDirectMessageTargetType = defaultThread ? defaultThread.targetType : "admin";
      selectedDirectMessageTargetCode = defaultThread ? String(defaultThread.targetCode || "") : "";
    }

    renderDirectMessageThreadList(threads);

    if (threads.length > 0) {
      await loadSelectedDirectMessages();
    }
  } catch (error) {
    directMessageThreadList.innerHTML = renderErrorHtml(error.message);
    directMessagesContainer.innerHTML = renderErrorHtml(error.message);
  }
}

async function loadSelectedDirectMessages() {
  if (!currentUser) {
    renderLoggedOutPlaceholders();
    return;
  }

  const selectedThread = getSelectedDirectMessageThread();

  if (!selectedThread) {
    directMessageThreadTitle.textContent = "Pogovor";
    directMessageThreadDescription.textContent = "Izberi pogovor na levi, da vidiš sporočila.";
    directMessagesContainer.innerHTML = '<p class="muted">Izberi pogovor na levi.</p>';
    return;
  }

  directMessagesContainer.innerHTML = '<p class="muted">Nalagam pogovor ...</p>';

  try {
    const searchParams = new URLSearchParams({
      targetType: selectedDirectMessageTargetType
    });

    if (selectedDirectMessageTargetCode) {
      searchParams.set("targetCode", selectedDirectMessageTargetCode);
    }

    const conversation = await userApiFetch(`/api/me/direct-messages?${searchParams.toString()}`);
    renderDirectMessages(conversation);
  } catch (error) {
    directMessagesContainer.innerHTML = renderErrorHtml(error.message);
  }
}

async function refreshUserData() {
  if (!currentUser) {
    return;
  }

  const user = await userApiFetch("/api/me");
  currentUser = user;
  renderUser(user);
}

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(lookupMessage);

  const formData = new FormData(lookupForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  try {
    await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    const user = await userApiFetch("/api/me");
    lookupForm.reset();
    setAuthenticatedState(user);
    if (user.mustChangePassword) {
      setMessage(lookupMessage, "Prijava je uspela. Pred nadaljevanjem moraš nastaviti novo geslo.", "error");
      return;
    }

    setMessage(lookupMessage, `Prijavljen si kot ${user.name}.`, "success");
    await Promise.all([loadQuests(), loadBadgeShareOptions(), loadIncomingBadgeRequests(), loadDirectMessageThreads()]);
  } catch (error) {
    setLoggedOutState();
    setMessage(lookupMessage, error.message, "error");
  }
});

passwordChangeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(passwordChangeMessage);

  const formData = new FormData(passwordChangeForm);
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (newPassword !== confirmPassword) {
    setMessage(passwordChangeMessage, "Gesli se ne ujemata.", "error");
    return;
  }

  try {
    await userApiFetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });

    passwordChangeForm.reset();
    const user = await userApiFetch("/api/me");
    setAuthenticatedState(user);
    setMessage(lookupMessage, "Novo geslo je shranjeno. Zdaj lahko uporabljaš mentorsko stran.", "success");
    await Promise.all([loadQuests(), loadBadgeShareOptions(), loadIncomingBadgeRequests(), loadDirectMessageThreads()]);
  } catch (error) {
    setMessage(passwordChangeMessage, error.message, "error");
  }
});

userLogoutButton.addEventListener("click", async () => {
  try {
    await apiFetch("/api/auth/logout", {
      method: "POST"
    });
  } finally {
    lookupForm.reset();
    setLoggedOutState("Odjavljen si iz mentorskega računa.", "success");
  }
});

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(requestMessage);

  const formData = new FormData(requestForm);
  const payload = {
    points: Number(formData.get("points")),
    reason: String(formData.get("reason") || "").trim()
  };

  try {
    const request = await userApiFetch("/api/requests", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    requestForm.reset();
    setMessage(requestMessage, `Zahtevek #${request.id} za ${request.points} točk je bil poslan.`, "success");
  } catch (error) {
    setMessage(requestMessage, error.message, "error");
  }
});

directMessageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(directMessageStatus);

  if (!currentUser) {
    setMessage(directMessageStatus, "Najprej se moraš prijaviti.", "error");
    return;
  }

  const formData = new FormData(directMessageForm);
  const content = String(formData.get("content") || "").trim();
  const selectedThread = getSelectedDirectMessageThread();

  if (!selectedThread) {
    setMessage(directMessageStatus, "Najprej izberi pogovor.", "error");
    return;
  }

  try {
    await userApiFetch("/api/me/direct-messages", {
      method: "POST",
      body: JSON.stringify({
        targetType: selectedThread.targetType,
        targetCode: selectedThread.targetCode,
        content
      })
    });

    directMessageForm.reset();
    setMessage(
      directMessageStatus,
      selectedThread.targetType === "admin"
        ? "Sporočilo za admina je bilo poslano."
        : `Sporočilo za ${selectedThread.targetName} je bilo poslano.`,
      "success"
    );
    await loadDirectMessageThreads();
  } catch (error) {
    setMessage(directMessageStatus, error.message, "error");
  }
});

badgeShareForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(badgeShareMessage);

  if (!currentUser) {
    setMessage(badgeShareMessage, "Najprej se moraš prijaviti.", "error");
    return;
  }

  const formData = new FormData(badgeShareForm);
  const badgeId = Number(formData.get("badgeId"));
  const targetCode = String(formData.get("targetCode") || "").trim();

  try {
    await userApiFetch("/api/badge-share-requests", {
      method: "POST",
      body: JSON.stringify({
        targetCode,
        badgeId
      })
    });

    badgeShareForm.reset();
    renderSelectedBadgeHolders();
    setMessage(badgeShareMessage, "Prošnja za deljenje značke je bila poslana.", "success");
  } catch (error) {
    setMessage(badgeShareMessage, error.message, "error");
  }
});

badgeShareSelect.addEventListener("change", () => {
  clearMessage(badgeShareMessage);
  renderSelectedBadgeHolders();
});

badgeHolderSelect.addEventListener("change", () => {
  clearMessage(badgeShareMessage);
  renderSelectedBadgeHolderDetails();
});

questsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-quest-id]");

  if (!button) {
    return;
  }

  selectedQuestId = Number(button.dataset.questId);
  renderQuestList();
  renderSelectedQuest();
});

selectedQuestContainer.addEventListener("submit", async (event) => {
  const form = event.target.closest("#quest-submit-form");

  if (!form) {
    return;
  }

  event.preventDefault();
  clearMessage(questMessage);

  if (!currentUser) {
    setMessage(questMessage, "Pred oddajo questa se moraš najprej prijaviti.", "error");
    return;
  }

  const formData = new FormData(form);
  const completedSteps = formData.getAll("completedStep");

  try {
    const request = await userApiFetch("/api/quest-requests", {
      method: "POST",
      body: JSON.stringify({
        questId: selectedQuestId,
        completedSteps
      })
    });

    form.reset();
    setMessage(questMessage, `Quest "${request.questTitle}" je bil uspešno oddan v potrditev.`, "success");
    await loadQuests();
  } catch (error) {
    setMessage(questMessage, error.message, "error");
  }
});

selectedQuestContainer.addEventListener("click", async (event) => {
  const button = event.target.closest("#join-quest-button");

  if (!button) {
    return;
  }

  clearMessage(questMessage);

  if (!currentUser) {
    setMessage(questMessage, "Pred prijavo na quest se moraš najprej prijaviti.", "error");
    return;
  }

  try {
    await userApiFetch("/api/quest-joins", {
      method: "POST",
      body: JSON.stringify({
        questId: selectedQuestId
      })
    });

    setMessage(questMessage, "Uspešno si se prijavil na quest.", "success");
    await loadQuests();
  } catch (error) {
    setMessage(questMessage, error.message, "error");
  }
});

incomingBadgeRequestsContainer.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-badge-request-id]");

  if (!button || !currentUser) {
    return;
  }

  clearMessage(incomingBadgeMessage);

  const levelSelect = incomingBadgeRequestsContainer.querySelector(
    `[data-badge-request-level="${button.dataset.badgeRequestId}"]`
  );
  const approvedLevel = Number(levelSelect ? levelSelect.value : 1);

  try {
    await userApiFetch(`/api/badge-share-requests/${button.dataset.badgeRequestId}/accept`, {
      method: "POST",
      body: JSON.stringify({
        approvedLevel
      })
    });

    setMessage(incomingBadgeMessage, `Deljenje značke je bilo potrjeno za nivo ${approvedLevel}.`, "success");
    await Promise.all([refreshUserData(), loadBadgeShareOptions(), loadIncomingBadgeRequests()]);
  } catch (error) {
    setMessage(incomingBadgeMessage, error.message, "error");
  }
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tabTarget);
  });
});

directMessageThreadList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-thread-target-type]");

  if (!button) {
    return;
  }

  selectedDirectMessageTargetType = String(button.dataset.threadTargetType || "admin");
  selectedDirectMessageTargetCode = String(button.dataset.threadTargetCode || "");
  renderDirectMessageThreadList(directMessageThreads);
  await loadSelectedDirectMessages();
});

refreshDirectMessagesButton.addEventListener("click", async () => {
  clearMessage(directMessageStatus);
  await loadDirectMessageThreads();
});

async function restoreSession() {
  try {
    const user = await apiFetch("/api/me");
    setAuthenticatedState(user);

    if (!user.mustChangePassword) {
      await Promise.all([loadQuests(), loadBadgeShareOptions(), loadIncomingBadgeRequests(), loadDirectMessageThreads()]);
    }
  } catch (_error) {
    setLoggedOutState();
  }
}

setLoggedOutState();
restoreSession();
