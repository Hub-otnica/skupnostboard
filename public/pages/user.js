const lookupForm = document.getElementById("lookup-form");
const requestForm = document.getElementById("request-form");
const badgeShareForm = document.getElementById("badge-share-form");
const lookupMessage = document.getElementById("lookup-message");
const requestMessage = document.getElementById("request-message");
const questMessage = document.getElementById("quest-message");
const badgeShareMessage = document.getElementById("badge-share-message");
const incomingBadgeMessage = document.getElementById("incoming-badge-message");
const userSummary = document.getElementById("user-summary");
const userActions = document.getElementById("user-actions");
const questsList = document.getElementById("quests-list");
const selectedQuestContainer = document.getElementById("selected-quest");
const userBadgesContainer = document.getElementById("user-badges");
const badgeShareSelect = document.getElementById("badge-share-select");
const badgeHolderSelect = document.getElementById("badge-holder-select");
const badgeRequirementsContainer = document.getElementById("badge-requirements");
const badgeHoldersContainer = document.getElementById("badge-holders");
const incomingBadgeRequestsContainer = document.getElementById("incoming-badge-requests");
const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");

let currentUser = null;
let quests = [];
let selectedQuestId = null;
let badgeShareOptions = [];

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
  userSummary.hidden = false;
  userActions.hidden = false;
  renderUserBadges(user.badges || []);
}

function hideUserState() {
  currentUser = null;
  quests = [];
  badgeShareOptions = [];
  selectedQuestId = null;
  userSummary.hidden = true;
  userActions.hidden = true;
  clearMessage(requestMessage);
  clearMessage(questMessage);
  clearMessage(badgeShareMessage);
  clearMessage(incomingBadgeMessage);
}

function renderUserBadges(badges) {
  if (!badges.length) {
    userBadgesContainer.innerHTML = '<p class="muted">Ta mentor še nima značk.</p>';
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
      <div class="quest-mini-list">${participantList}</div>
      ${questStatus}
      <button type="button" id="join-quest-button" ${canJoin ? "" : "disabled"}>Prijavi se na quest</button>
      <p class="muted">Quest lahko odda katerikoli prijavljeni mentor, ko je ekipa popolna in so vsi koraki odkljukani.</p>
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
    badgeHolderSelect.innerHTML = '<option value="">Ni mentorjev</option>';
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
    badgeHolderSelect.innerHTML = '<option value="">Izberi mentorja</option>';
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
    <option value="">Izberi mentorja</option>
    ${badge.holders
      .map((holder) => `<option value="${escapeHtml(holder.code)}">${escapeHtml(holder.name)} - nivo ${holder.level || 1}</option>`)
      .join("")}
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

async function loadQuests() {
  if (!currentUser) {
    quests = [];
    renderQuestList();
    renderSelectedQuest();
    return;
  }

  try {
    quests = await apiFetch(`/api/users/${encodeURIComponent(currentUser.code)}/quests`);
    if (!selectedQuestId && quests[0]) {
      selectedQuestId = quests[0].id;
    }
    if (selectedQuestId && !quests.some((quest) => quest.id === selectedQuestId)) {
      selectedQuestId = quests[0] ? quests[0].id : null;
    }
    renderQuestList();
    renderSelectedQuest();
  } catch (error) {
    questsList.innerHTML = `<p class="message visible error">${error.message}</p>`;
    selectedQuestContainer.innerHTML = '<p class="muted">Questov ni bilo mogoče naložiti.</p>';
  }
}

async function loadBadgeShareOptions() {
  if (!currentUser) {
    badgeShareOptions = [];
    renderBadgeShareOptions();
    return;
  }

  try {
    badgeShareOptions = await apiFetch(`/api/users/${encodeURIComponent(currentUser.code)}/badge-share-options`);
    renderBadgeShareOptions();
  } catch (error) {
    badgeShareSelect.innerHTML = '<option value="">Napaka pri nalaganju</option>';
    badgeHolderSelect.innerHTML = '<option value="">Napaka pri nalaganju</option>';
    badgeRequirementsContainer.innerHTML = `<p class="message visible error">${error.message}</p>`;
    badgeHoldersContainer.innerHTML = `<p class="message visible error">${error.message}</p>`;
  }
}

async function loadIncomingBadgeRequests() {
  if (!currentUser) {
    incomingBadgeRequestsContainer.innerHTML = '<p class="muted">Ni prejetih prošenj.</p>';
    return;
  }

  try {
    const requests = await apiFetch(`/api/users/${encodeURIComponent(currentUser.code)}/incoming-badge-requests`);
    renderIncomingBadgeRequests(requests);
  } catch (error) {
    incomingBadgeRequestsContainer.innerHTML = `<p class="message visible error">${error.message}</p>`;
  }
}

async function refreshUserData() {
  if (!currentUser) {
    return;
  }

  const user = await apiFetch(`/api/users/${encodeURIComponent(currentUser.code)}`);
  currentUser = user;
  renderUser(user);
}

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(lookupMessage);

  const formData = new FormData(lookupForm);
  const code = String(formData.get("code") || "").trim();

  try {
    const user = await apiFetch(`/api/users/${encodeURIComponent(code)}`);
    currentUser = user;
    renderUser(user);
    document.getElementById("request-code").value = user.code;
    setMessage(lookupMessage, `Naložene so trenutne točke mentorja ${user.name}.`, "success");
    await Promise.all([loadQuests(), loadBadgeShareOptions(), loadIncomingBadgeRequests()]);
  } catch (error) {
    hideUserState();
    setMessage(lookupMessage, error.message, "error");
    await Promise.all([loadQuests(), loadBadgeShareOptions(), loadIncomingBadgeRequests()]);
  }
});

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(requestMessage);

  const formData = new FormData(requestForm);
  const payload = {
    code: String(formData.get("code") || "").trim(),
    points: Number(formData.get("points")),
    reason: String(formData.get("reason") || "").trim()
  };

  try {
    const request = await apiFetch("/api/requests", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    requestForm.reset();
    if (currentUser) {
      document.getElementById("request-code").value = currentUser.code;
    }
    setMessage(requestMessage, `Zahtevek #${request.id} za ${request.points} točk je bil poslan.`, "success");
  } catch (error) {
    setMessage(requestMessage, error.message, "error");
  }
});

badgeShareForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(badgeShareMessage);

  if (!currentUser) {
    setMessage(badgeShareMessage, "Najprej se moraš vpisati.", "error");
    return;
  }

  const formData = new FormData(badgeShareForm);
  const badgeId = Number(formData.get("badgeId"));
  const targetCode = String(formData.get("targetCode") || "").trim();

  try {
    await apiFetch("/api/badge-share-requests", {
      method: "POST",
      body: JSON.stringify({
        requesterCode: currentUser.code,
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
    setMessage(questMessage, "Pred oddajo questa moraš najprej naložiti svoj profil s kodo.", "error");
    return;
  }

  const formData = new FormData(form);
  const completedSteps = formData.getAll("completedStep");

  try {
    const request = await apiFetch("/api/quest-requests", {
      method: "POST",
      body: JSON.stringify({
        code: currentUser.code,
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
    setMessage(questMessage, "Pred prijavo na quest moraš najprej naložiti svoj profil s kodo.", "error");
    return;
  }

  try {
    await apiFetch("/api/quest-joins", {
      method: "POST",
      body: JSON.stringify({
        code: currentUser.code,
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
    await apiFetch(`/api/badge-share-requests/${button.dataset.badgeRequestId}/accept`, {
      method: "POST",
      body: JSON.stringify({
        targetCode: currentUser.code,
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

hideUserState();
loadQuests();
loadBadgeShareOptions();
loadIncomingBadgeRequests();
