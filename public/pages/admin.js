const createUserForm = document.getElementById("create-user-form");
const adminLoginCard = document.getElementById("admin-login-card");
const adminSessionCard = document.getElementById("admin-session-card");
const adminDashboard = document.getElementById("admin-dashboard");
const adminSetupPanel = document.getElementById("admin-setup-panel");
const adminLoginPanel = document.getElementById("admin-login-panel");
const adminSetupForm = document.getElementById("admin-setup-form");
const adminSetupMessage = document.getElementById("admin-setup-message");
const adminSetupUsername = document.getElementById("admin-setup-username");
const adminLoginForm = document.getElementById("admin-login-form");
const adminLogoutButton = document.getElementById("admin-logout-button");
const adminLoginMessage = document.getElementById("admin-login-message");
const adminSessionMessage = document.getElementById("admin-session-message");
const adminSessionSummary = document.getElementById("admin-session-summary");
const adminLoginUsername = document.getElementById("admin-login-username");
const editUserForm = document.getElementById("edit-user-form");
const manualPointsForm = document.getElementById("manual-points-form");
const meetingForm = document.getElementById("meeting-form");
const questForm = document.getElementById("quest-form");
const eventForm = document.getElementById("event-form");
const badgeForm = document.getElementById("badge-form");
const editBadgeForm = document.getElementById("edit-badge-form");
const assignBadgeForm = document.getElementById("assign-badge-form");
const createUserMessage = document.getElementById("create-user-message");
const editUserMessage = document.getElementById("edit-user-message");
const manualPointsMessage = document.getElementById("manual-points-message");
const meetingMessage = document.getElementById("meeting-message");
const questMessage = document.getElementById("quest-message");
const eventMessage = document.getElementById("event-message");
const badgeMessage = document.getElementById("badge-message");
const editBadgeMessage = document.getElementById("edit-badge-message");
const assignBadgeMessage = document.getElementById("assign-badge-message");
const pendingRequestsContainer = document.getElementById("pending-requests");
const refreshButton = document.getElementById("refresh-requests");
const meetingMembersContainer = document.getElementById("meeting-members");
const questStepsContainer = document.getElementById("quest-steps");
const addQuestStepButton = document.getElementById("add-quest-step");
const eventConditionTypeSelect = document.getElementById("event-condition-type");
const eventBadgeLabel = document.getElementById("event-badge-label");
const eventBadgeSelect = document.getElementById("event-badge-select");
const editUserSelect = document.getElementById("edit-user-select");
const manualPointsUserSelect = document.getElementById("manual-points-user-select");
const badgeSelect = document.getElementById("badge-select");
const badgeLevelSelect = document.getElementById("badge-level-select");
const editBadgeSelect = document.getElementById("edit-badge-select");
const badgeUserSelect = document.getElementById("badge-user-select");
const badgesList = document.getElementById("badges-list");
const badgeLineageSelect = document.getElementById("badge-lineage-select");
const refreshBadgeLineageButton = document.getElementById("refresh-badge-lineage");
const badgeLineageContainer = document.getElementById("badge-lineage");
const badgeLineageMessage = document.getElementById("badge-lineage-message");
const eventsList = document.getElementById("events-list");
const badgeLevelDescriptionsContainer = document.getElementById("badge-level-descriptions");
const addBadgeLevelButton = document.getElementById("add-badge-level");
const editBadgeLevelDescriptionsContainer = document.getElementById("edit-badge-level-descriptions");
const addEditBadgeLevelButton = document.getElementById("add-edit-badge-level");
const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");
let usersState = [];
let badgesState = [];
let adminSetupRequired = false;

async function adminApiFetch(path, options = {}) {
  try {
    return await apiFetch(path, options);
  } catch (error) {
    if (String(error.message || "").includes("administratorska prijava")) {
      setLoggedOutState("Seja je potekla. Prosim, prijavi se znova.");
    }
    throw error;
  }
}

async function adminFetch(path, options = {}) {
  return fetch(path, options);
}

function setAuthenticatedState(username) {
  adminLoginCard.hidden = true;
  adminSessionCard.hidden = false;
  adminDashboard.hidden = false;
  adminSessionSummary.textContent = `Prijavljen kot ${username}.`;
  clearMessage(adminLoginMessage);
  clearMessage(adminSetupMessage);
}

function syncAuthPanels() {
  adminSetupPanel.hidden = !adminSetupRequired;
  adminLoginPanel.hidden = adminSetupRequired;
}

function setLoggedOutState(message = "") {
  adminLoginCard.hidden = false;
  adminSessionCard.hidden = true;
  adminDashboard.hidden = true;
  adminSessionSummary.textContent = "";
  clearMessage(adminSessionMessage);
  syncAuthPanels();
  if (message) {
    if (adminSetupRequired) {
      setMessage(adminSetupMessage, message, "error");
    } else {
      setMessage(adminLoginMessage, message, "error");
    }
  } else {
    clearMessage(adminLoginMessage);
    clearMessage(adminSetupMessage);
  }
}

async function parseResponseOrThrow(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Prišlo je do napake.");
    if (String(error.message || "").includes("administratorska prijava")) {
      setLoggedOutState("Seja je potekla. Prosim, prijavi se znova.");
    }
    throw error;
  }
  return data;
}

function formatDateTime(value) {
  if (!value) {
    return "Ni podatka.";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toLocaleString();
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

function resetEditUserForm() {
  editUserForm.reset();
  editUserSelect.value = "";
}

function populateEditUserForm(user) {
  if (!user) {
    resetEditUserForm();
    return;
  }

  editUserSelect.value = user.code;
  document.getElementById("edit-user-name").value = user.name || "";
  document.getElementById("edit-user-password").value = "";
  document.getElementById("edit-user-confirm-password").value = "";
}

function createBadgeLevelField(value = "", levelNumber = 1, removeClassName = "badge-level-remove") {
  const wrapper = document.createElement("div");
  wrapper.className = "quest-step-row";
  wrapper.innerHTML = `
    <textarea name="levelDescriptions" placeholder="Opis za nivo ${levelNumber}" required>${escapeHtml(value)}</textarea>
    <button type="button" class="danger ${removeClassName}">Odstrani</button>
  `;
  return wrapper;
}

function syncBadgeLevelFields(container, addButton, removeClassName) {
  const rows = container.querySelectorAll(".quest-step-row");

  rows.forEach((row, index) => {
    const textarea = row.querySelector('textarea[name="levelDescriptions"]');
    const removeButton = row.querySelector(`.${removeClassName}`);
    textarea.placeholder = `Opis za nivo ${index + 1}`;
    removeButton.disabled = rows.length === 1;
  });

  addButton.disabled = rows.length >= 10;
}

function addBadgeLevelRow(container, addButton, messageElement, value = "", removeClassName = "badge-level-remove") {
  if (container.querySelectorAll(".quest-step-row").length >= 10) {
    setMessage(messageElement, "Značka ima lahko največ 10 nivojev.", "error");
    return;
  }

  const nextLevelNumber = container.querySelectorAll(".quest-step-row").length + 1;
  container.append(createBadgeLevelField(value, nextLevelNumber, removeClassName));
  syncBadgeLevelFields(container, addButton, removeClassName);
}

function resetBadgeForm() {
  badgeForm.reset();
  badgeLevelDescriptionsContainer.innerHTML = "";
  addBadgeLevelRow(badgeLevelDescriptionsContainer, addBadgeLevelButton, badgeMessage);
}

function resetEditBadgeForm() {
  editBadgeForm.reset();
  editBadgeLevelDescriptionsContainer.innerHTML = "";
  editBadgeSelect.value = "";
  addBadgeLevelRow(editBadgeLevelDescriptionsContainer, addEditBadgeLevelButton, editBadgeMessage, "", "edit-badge-level-remove");
}

function populateEditBadgeForm(badge) {
  if (!badge) {
    resetEditBadgeForm();
    return;
  }

  editBadgeSelect.value = String(badge.id);
  document.getElementById("edit-badge-name").value = badge.name || "";
  document.getElementById("edit-badge-requirements").value = badge.requirements || "";
  document.getElementById("edit-badge-description").value = badge.description || "";
  editBadgeLevelDescriptionsContainer.innerHTML = "";

  (badge.levelDescriptions || [badge.description || ""])
    .forEach((description) => {
      addBadgeLevelRow(
        editBadgeLevelDescriptionsContainer,
        addEditBadgeLevelButton,
        editBadgeMessage,
        description,
        "edit-badge-level-remove"
      );
    });

  syncBadgeLevelFields(editBadgeLevelDescriptionsContainer, addEditBadgeLevelButton, "edit-badge-level-remove");
}

function syncAssignBadgeLevels() {
  const selectedBadgeId = Number(badgeSelect.value);
  const badge = badgesState.find((entry) => entry.id === selectedBadgeId);

  if (!badge) {
    badgeLevelSelect.innerHTML = '<option value="">Najprej izberi značko</option>';
    return;
  }

  const levelDescriptions = Array.isArray(badge.levelDescriptions) && badge.levelDescriptions.length > 0
    ? badge.levelDescriptions
    : [badge.description || "Opis ni podan."];

  badgeLevelSelect.innerHTML = `
    ${levelDescriptions
      .map((description, index) => `<option value="${index + 1}">Nivo ${index + 1}: ${escapeHtml(description)}</option>`)
      .join("")}
  `;
}

function syncEventBadgeField() {
  const isBadgeCondition = eventConditionTypeSelect.value === "badge-count";
  eventBadgeLabel.hidden = !isBadgeCondition;
  eventBadgeSelect.required = isBadgeCondition;
}

function renderBadgeCard(badge) {
  return `
    <details class="badge-card badge-card-details">
      <summary class="badge-card-summary">
        <div class="badge-visual">
          <img src="${badge.imagePath || badge.imageData}" alt="${escapeHtml(badge.name)}" class="badge-image" />
        </div>
        <p class="badge-name">${escapeHtml(badge.name)}</p>
      </summary>
      <div class="badge-meta">
        <p><strong>Pogoji:</strong> ${escapeHtml(badge.requirements || "Ni določeno.")}</p>
        <div class="quest-mini-list">
          ${(badge.levelDescriptions || [badge.description || "Opis ni podan."])
            .map((description, index) => `<div class="quest-mini-item"><strong>Nivo ${index + 1}:</strong> ${escapeHtml(description)}</div>`)
            .join("")}
        </div>
      </div>
    </details>
  `;
}

function renderLineagePath(lineage) {
  if (!Array.isArray(lineage) || lineage.length === 0) {
    return "Ni podatka o poti.";
  }

  return lineage
    .map((entry) => escapeHtml(entry.name || entry.code || "Neznana mentorica/neznan mentor"))
    .join(" &rarr; ");
}

function renderBadgeChainNode(node) {
  return `
    <li class="badge-chain-node">
      <div class="badge-chain-node-card">
        <p><strong>${escapeHtml(node.toUserName || node.toUserCode || "Neznana mentorica/neznan mentor")}</strong></p>
        <p class="muted">Prejel od: ${escapeHtml(node.fromUserName || "Admin sistem")}</p>
        <p class="muted">Nivo: ${node.level || 1} • Globina: ${node.depth || 0}</p>
        <p class="muted">Pot: ${renderLineagePath(node.lineage)}</p>
      </div>
      ${(node.children || []).length > 0 ? `<ul class="badge-chain-children">${node.children.map(renderBadgeChainNode).join("")}</ul>` : ""}
    </li>
  `;
}

function renderBadgeLineage(data) {
  const roots = Array.isArray(data.roots) ? data.roots : [];
  const transfers = Array.isArray(data.transfers) ? data.transfers : [];

  if (transfers.length === 0) {
    badgeLineageContainer.innerHTML = `
      <p class="muted">Ta značka še nima zabeleženih prenosov. Veriga se začne beležiti pri novih dodelitvah in delitvah.</p>
    `;
    return;
  }

  badgeLineageContainer.innerHTML = `
    <div class="badge-lineage-summary">
      <article class="card badge-lineage-stat">
        <p class="muted">Skupaj prenosov</p>
        <p class="badge-lineage-number">${transfers.length}</p>
      </article>
      <article class="card badge-lineage-stat">
        <p class="muted">Začetne veje</p>
        <p class="badge-lineage-number">${roots.length}</p>
      </article>
      <article class="card badge-lineage-stat">
        <p class="muted">Najdlje v verigi</p>
        <p class="badge-lineage-number">${Math.max(...transfers.map((entry) => entry.depth || 0))}</p>
      </article>
    </div>
    <div class="grid" style="margin-top: 1rem;">
      <div class="card">
        <h3>Drevo Delitev</h3>
        <div class="badge-chain-tree">
          <ul class="badge-chain-roots">
            ${roots.map(renderBadgeChainNode).join("")}
          </ul>
        </div>
      </div>
      <div class="card">
        <h3>Zgodovina Prenosov</h3>
        <div class="quest-mini-list">
          ${transfers
            .map((transfer) => `
              <div class="quest-mini-item">
                <p><strong>${escapeHtml(transfer.toUserName || transfer.toUserCode || "Neznana mentorica/neznan mentor")}</strong></p>
                <p class="muted">${escapeHtml(transfer.fromUserName || "Admin sistem")} -> ${escapeHtml(transfer.toUserName || transfer.toUserCode || "Neznana mentorica/neznan mentor")}</p>
                <p class="muted">Pot: ${renderLineagePath(transfer.lineage)}</p>
                <p class="muted">Vir: ${escapeHtml(transfer.sourceType || "unknown")} • Nivo: ${transfer.level || 1}</p>
                <p class="muted">Čas: ${escapeHtml(formatDateTime(transfer.createdAt))}</p>
              </div>
            `)
            .join("")}
        </div>
      </div>
    </div>
  `;
}

async function loadBadgeLineage() {
  const badgeId = Number(badgeLineageSelect.value);

  clearMessage(badgeLineageMessage);

  if (!badgeId) {
    badgeLineageContainer.innerHTML = '<p class="muted">Izberi značko, da prikažeš verigo.</p>';
    return;
  }

  badgeLineageContainer.innerHTML = '<p class="muted">Nalagam verigo značke ...</p>';

  try {
    const lineage = await adminApiFetch(`/api/badges/${badgeId}/chains`);
    renderBadgeLineage(lineage);
  } catch (error) {
    badgeLineageContainer.innerHTML = renderErrorHtml(error.message);
    setMessage(badgeLineageMessage, error.message, "error");
  }
}

function renderBadges(badges) {
  badgesState = badges;

  if (badges.length === 0) {
    badgesList.innerHTML = '<p class="muted">Še ni ustvarjenih značk.</p>';
    badgeSelect.innerHTML = '<option value="">Ni značk</option>';
    badgeLevelSelect.innerHTML = '<option value="">Ni nivojev</option>';
    editBadgeSelect.innerHTML = '<option value="">Ni značk</option>';
    eventBadgeSelect.innerHTML = '<option value="">Ni značk</option>';
    badgeLineageSelect.innerHTML = '<option value="">Ni značk</option>';
    badgeLineageContainer.innerHTML = '<p class="muted">Najprej ustvari značko, da lahko pregledaš verige.</p>';
    return;
  }

  badgesList.innerHTML = badges
    .map(renderBadgeCard)
    .join("");

  badgeSelect.innerHTML = `
    <option value="">Izberi značko</option>
    ${badges
      .map((badge) => `<option value="${badge.id}">${escapeHtml(badge.name)}</option>`)
      .join("")}
  `;

  editBadgeSelect.innerHTML = `
    <option value="">Izberi značko</option>
    ${badges
      .map((badge) => `<option value="${badge.id}">${escapeHtml(badge.name)}</option>`)
      .join("")}
  `;

  eventBadgeSelect.innerHTML = `
    <option value="">Izberi značko</option>
    ${badges
      .map((badge) => `<option value="${badge.id}">${escapeHtml(badge.name)}</option>`)
      .join("")}
  `;

  const previousLineageBadgeId = badgeLineageSelect.value;
  badgeLineageSelect.innerHTML = `
    <option value="">Izberi značko</option>
    ${badges
      .map((badge) => `<option value="${badge.id}">${escapeHtml(badge.name)}</option>`)
      .join("")}
  `;

  const selectedLineageBadge = badges.find((badge) => String(badge.id) === previousLineageBadgeId) || badges[0];

  if (selectedLineageBadge) {
    badgeLineageSelect.value = String(selectedLineageBadge.id);
  }

  syncAssignBadgeLevels();
  syncEventBadgeField();
}

function renderEvents(events) {
  if (events.length === 0) {
    eventsList.innerHTML = '<p class="muted">Še ni razpisanih dogodkov.</p>';
    return;
  }

  eventsList.innerHTML = events
    .map((event) => `
      <article class="card">
        <p><span class="pill">${event.status === "pending" ? "V teku" : event.status === "success" ? "Uspeh" : "Neuspeh"}</span></p>
        <h3>${escapeHtml(event.title)}</h3>
        <p><strong>Datum preverjanja:</strong> ${escapeHtml(event.date)}</p>
        <p><strong>Pogoj:</strong> ${escapeHtml(event.conditionLabel)}</p>
        <p><strong>Napredek:</strong> ${event.currentValue} / ${event.targetValue}</p>
        <p><strong>Nagrada:</strong> +${event.rewardPoints} točk vsem mentoricam/mentorjem</p>
        <p><strong>Kazen:</strong> -${event.penaltyPoints} točk vsem mentoricam/mentorjem</p>
      </article>
    `)
    .join("");
}

async function loadEvents() {
  try {
    const events = await adminApiFetch("/api/events");
    renderEvents(events);
  } catch (error) {
    eventsList.innerHTML = renderErrorHtml(error.message);
  }
}

async function loadBadges() {
  try {
    const previousEditBadgeId = editBadgeSelect.value;
    const badges = await adminApiFetch("/api/badges");
    renderBadges(badges);
    const selectedBadge = badges.find((badge) => String(badge.id) === previousEditBadgeId) || badges[0];

    if (selectedBadge) {
      populateEditBadgeForm(selectedBadge);
    } else {
      resetEditBadgeForm();
    }

    await loadBadgeLineage();
  } catch (error) {
    badgesList.innerHTML = renderErrorHtml(error.message);
    badgeSelect.innerHTML = '<option value="">Napaka pri nalaganju</option>';
    badgeLevelSelect.innerHTML = '<option value="">Napaka pri nalaganju</option>';
    editBadgeSelect.innerHTML = '<option value="">Napaka pri nalaganju</option>';
    badgeLineageSelect.innerHTML = '<option value="">Napaka pri nalaganju</option>';
    badgeLineageContainer.innerHTML = renderErrorHtml(error.message);
  }
}

function createQuestStepField(value = "") {
  const wrapper = document.createElement("div");
  wrapper.className = "quest-step-row";
  wrapper.innerHTML = `
    <input type="text" name="questStep" placeholder="Vpiši korak questa" value="${escapeHtml(value)}" required />
    <button type="button" class="danger quest-step-remove">Odstrani</button>
  `;
  return wrapper;
}

function syncQuestStepButtons() {
  const rows = questStepsContainer.querySelectorAll(".quest-step-row");

  rows.forEach((row) => {
    const removeButton = row.querySelector(".quest-step-remove");
    removeButton.disabled = rows.length === 1;
  });

  addQuestStepButton.disabled = rows.length >= 10;
}

function addQuestStep(value = "") {
  if (questStepsContainer.querySelectorAll(".quest-step-row").length >= 10) {
    setMessage(questMessage, "Quest ima lahko največ 10 korakov.", "error");
    return;
  }

  questStepsContainer.append(createQuestStepField(value));
  syncQuestStepButtons();
}

function resetQuestForm() {
  questForm.reset();
  questStepsContainer.innerHTML = "";
  addQuestStep();
  addQuestStep();
}

function renderMeetingMembers(users) {
  usersState = users;

  if (users.length === 0) {
    meetingMembersContainer.innerHTML = '<p class="muted">Pred beleženjem sestanka najprej ustvari mentorice/mentorje.</p>';
    editUserSelect.innerHTML = '<option value="">Ni mentoric/mentorjev</option>';
    manualPointsUserSelect.innerHTML = '<option value="">Ni mentoric/mentorjev</option>';
    badgeUserSelect.innerHTML = '<option value="">Ni mentoric/mentorjev</option>';
    return;
  }

  meetingMembersContainer.innerHTML = users
    .map((user) => `
      <label class="member-option">
        <input type="checkbox" name="presentCodes" value="${escapeHtml(user.code)}" />
        <span>${escapeHtml(user.name)}</span>
      </label>
    `)
    .join("");

  editUserSelect.innerHTML = `
    <option value="">Izberi mentorico/mentorja</option>
    ${users
      .map((user) => `<option value="${escapeHtml(user.code)}">${escapeHtml(user.name)}</option>`)
      .join("")}
  `;

  manualPointsUserSelect.innerHTML = `
    <option value="">Izberi mentorico/mentorja</option>
    ${users
      .map((user) => `<option value="${escapeHtml(user.name)}">${escapeHtml(user.name)}</option>`)
      .join("")}
  `;

  badgeUserSelect.innerHTML = `
    <option value="">Izberi mentorico/mentorja</option>
    ${users
      .map((user) => `<option value="${escapeHtml(user.name)}">${escapeHtml(user.name)}</option>`)
      .join("")}
  `;
}

async function loadMeetingMembers() {
  try {
    const previousUserCode = editUserSelect.value;
    const users = await adminApiFetch("/api/users");
    renderMeetingMembers(users);
    const selectedUser = users.find((user) => user.code === previousUserCode) || users[0];

    if (selectedUser) {
      populateEditUserForm(selectedUser);
    } else {
      resetEditUserForm();
    }
  } catch (error) {
    meetingMembersContainer.innerHTML = renderErrorHtml(error.message);
  }
}

function renderPendingRequest(request) {
  const questStepsMarkup = request.type === "quest" && Array.isArray(request.questSteps)
    ? `
        <div class="quest-mini-list">
          ${request.questSteps.map((step) => `<div class="quest-mini-item">✓ ${escapeHtml(step)}</div>`).join("")}
        </div>
      `
    : "";
  const participantMarkup = request.type === "quest" && Array.isArray(request.participantNames)
    ? `
        <p><strong>Ekipa:</strong> ${request.participantNames.map((name) => escapeHtml(name)).join(", ")}</p>
        <p><strong>Število igralcev:</strong> ${request.participantNames.length}${request.requiredPlayers ? ` / ${request.requiredPlayers}` : ""}</p>
      `
    : "";

  return `
    <article class="card">
      <p><span class="pill">${request.type === "quest" ? "Quest" : "V čakanju"}</span></p>
      <h3>${escapeHtml(request.userName)}</h3>
      <p><strong>Točke:</strong> ${request.points}</p>
      <p><strong>Razlog:</strong> ${escapeHtml(request.reason || "Razlog ni podan.")}</p>
      ${request.type === "quest" ? `<p><strong>Quest:</strong> ${escapeHtml(request.questTitle || request.reason || "")}</p>` : ""}
      ${participantMarkup}
      ${questStepsMarkup}
      <p class="muted">Poslano: ${new Date(request.createdAt).toLocaleString()}</p>
      <div class="inline-actions">
        <button type="button" data-action="approve" data-id="${request.id}">Odobri</button>
        <button type="button" class="danger" data-action="reject" data-id="${request.id}">Zavrni</button>
      </div>
    </article>
  `;
}

async function loadPendingRequests() {
  try {
    const requests = await adminApiFetch("/api/requests/pending");

    if (requests.length === 0) {
      pendingRequestsContainer.innerHTML = '<p class="muted">Trenutno ni čakajočih zahtevkov.</p>';
      return;
    }

    pendingRequestsContainer.innerHTML = requests.map(renderPendingRequest).join("");
  } catch (error) {
    pendingRequestsContainer.innerHTML = renderErrorHtml(error.message);
  }
}

createUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(createUserMessage);

  const formData = new FormData(createUserForm);
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password !== confirmPassword) {
    setMessage(createUserMessage, "Gesli se ne ujemata.", "error");
    return;
  }

  const payload = {
    name: String(formData.get("name") || "").trim(),
    password
  };

  try {
    const user = await adminApiFetch("/api/users", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    createUserForm.reset();
    setMessage(createUserMessage, `Ustvarjena je bila mentorica/mentor ${user.name}.`, "success");
    await loadMeetingMembers();
  } catch (error) {
    setMessage(createUserMessage, error.message, "error");
  }
});

editUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(editUserMessage);

  const formData = new FormData(editUserForm);
  const currentCode = String(formData.get("currentCode") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password || confirmPassword) {
    if (password !== confirmPassword) {
      setMessage(editUserMessage, "Gesli se ne ujemata.", "error");
      return;
    }
  }

  try {
    const user = await adminApiFetch(`/api/users/${encodeURIComponent(currentCode)}`, {
      method: "PUT",
      body: JSON.stringify({ name, password })
    });

    setMessage(editUserMessage, `Podatki mentorice/mentorja ${user.name} so bili posodobljeni.`, "success");
    await loadMeetingMembers();
    populateEditUserForm(user);
  } catch (error) {
    setMessage(editUserMessage, error.message, "error");
  }
});

manualPointsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(manualPointsMessage);

  const formData = new FormData(manualPointsForm);
  const name = String(formData.get("name") || "").trim();
  const points = Number(formData.get("points"));
  const reason = String(formData.get("reason") || "").trim();

  try {
    const user = await adminApiFetch("/api/users/by-name/points", {
      method: "POST",
      body: JSON.stringify({ name, points, reason })
    });

    manualPointsForm.reset();
    setMessage(manualPointsMessage, `${user.name} ima zdaj ${user.points} točk.`, "success");
  } catch (error) {
    setMessage(manualPointsMessage, error.message, "error");
  }
});

meetingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(meetingMessage);

  const formData = new FormData(meetingForm);
  const presentCodes = formData.getAll("presentCodes");
  const note = String(formData.get("note") || "").trim();

  try {
    const result = await adminApiFetch("/api/meetings", {
      method: "POST",
      body: JSON.stringify({ presentCodes, note })
    });

    meetingForm.reset();
    setMessage(
      meetingMessage,
      `Prisotnost na sestanku je bila zabeležena za ${result.attendees.length} članov.`,
      "success"
    );
    await loadMeetingMembers();
  } catch (error) {
    setMessage(meetingMessage, error.message, "error");
  }
});

questForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(questMessage);

  const formData = new FormData(questForm);
  const title = String(formData.get("title") || "").trim();
  const rewardPoints = Number(formData.get("rewardPoints"));
  const requiredPlayers = Number(formData.get("requiredPlayers"));
  const steps = formData.getAll("questStep").map((step) => String(step || "").trim()).filter(Boolean);

  try {
    const quest = await adminApiFetch("/api/quests", {
      method: "POST",
      body: JSON.stringify({ title, rewardPoints, requiredPlayers, steps })
    });

    resetQuestForm();
    setMessage(questMessage, `Quest "${quest.title}" za ${quest.requiredPlayers} igralcev je bil objavljen.`, "success");
  } catch (error) {
    setMessage(questMessage, error.message, "error");
  }
});

eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(eventMessage);

  const formData = new FormData(eventForm);
  const title = String(formData.get("title") || "").trim();
  const date = String(formData.get("date") || "").trim();
  const conditionType = String(formData.get("conditionType") || "").trim();
  const badgeId = Number(formData.get("badgeId"));
  const targetValue = Number(formData.get("targetValue"));
  const rewardPoints = Number(formData.get("rewardPoints"));
  const penaltyPoints = Number(formData.get("penaltyPoints"));

  try {
    const createdEvent = await adminApiFetch("/api/events", {
      method: "POST",
      body: JSON.stringify({
        title,
        date,
        conditionType,
        badgeId,
        targetValue,
        rewardPoints,
        penaltyPoints
      })
    });

    eventForm.reset();
    syncEventBadgeField();
    setMessage(eventMessage, `Dogodek "${createdEvent.title}" je bil objavljen.`, "success");
    await loadEvents();
  } catch (error) {
    setMessage(eventMessage, error.message, "error");
  }
});

badgeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(badgeMessage);

  const formData = new FormData(badgeForm);
  const file = formData.get("image");
  const name = String(formData.get("name") || "").trim();
  const requirements = String(formData.get("requirements") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const levelDescriptions = formData.getAll("levelDescriptions").map((entry) => String(entry || "").trim()).filter(Boolean);

  try {
    if (!(file instanceof File) || !file.size) {
      throw new Error("Izberi sliko značke.");
    }

    const uploadData = new FormData();
    uploadData.append("image", file);
    uploadData.append("name", name);
    uploadData.append("requirements", requirements);
    uploadData.append("description", description);
    levelDescriptions.forEach((entry) => {
      uploadData.append("levelDescriptions", entry);
    });

    const response = await adminFetch("/api/badges", {
      method: "POST",
      body: uploadData
    });
    const badge = await parseResponseOrThrow(response);

    resetBadgeForm();
    setMessage(badgeMessage, `Značka "${badge.name}" je bila ustvarjena.`, "success");
    await loadBadges();
  } catch (error) {
    setMessage(badgeMessage, error.message, "error");
  }
});

editBadgeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(editBadgeMessage);

  const formData = new FormData(editBadgeForm);
  const badgeId = Number(formData.get("badgeId"));
  const file = formData.get("image");
  const name = String(formData.get("name") || "").trim();
  const requirements = String(formData.get("requirements") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const levelDescriptions = formData.getAll("levelDescriptions").map((entry) => String(entry || "").trim()).filter(Boolean);

  try {
    if (!badgeId) {
      throw new Error("Izberi značko za urejanje.");
    }

    const uploadData = new FormData();
    uploadData.append("name", name);
    uploadData.append("requirements", requirements);
    uploadData.append("description", description);

    if (file instanceof File && file.size) {
      uploadData.append("image", file);
    }

    levelDescriptions.forEach((entry) => {
      uploadData.append("levelDescriptions", entry);
    });

    const response = await adminFetch(`/api/badges/${badgeId}`, {
      method: "PUT",
      body: uploadData
    });
    const badge = await parseResponseOrThrow(response);

    setMessage(editBadgeMessage, `Značka "${badge.name}" je bila posodobljena.`, "success");
    await loadBadges();
    populateEditBadgeForm(badge);
  } catch (error) {
    setMessage(editBadgeMessage, error.message, "error");
  }
});

assignBadgeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(assignBadgeMessage);

  const formData = new FormData(assignBadgeForm);
  const name = String(formData.get("name") || "").trim();
  const badgeId = Number(formData.get("badgeId"));
  const level = Number(formData.get("level"));

  try {
    const user = await adminApiFetch("/api/badges/assign", {
      method: "POST",
      body: JSON.stringify({ name, badgeId, level })
    });

    assignBadgeForm.reset();
    syncAssignBadgeLevels();
    setMessage(assignBadgeMessage, `Značka nivoja ${level} je bila dodeljena mentorici/mentorju ${user.name}.`, "success");
    await loadBadges();
  } catch (error) {
    setMessage(assignBadgeMessage, error.message, "error");
  }
});

questStepsContainer.addEventListener("click", (event) => {
  const button = event.target.closest(".quest-step-remove");

  if (!button) {
    return;
  }

  if (questStepsContainer.querySelectorAll(".quest-step-row").length === 1) {
    return;
  }

  button.closest(".quest-step-row").remove();
  syncQuestStepButtons();
});

badgeLevelDescriptionsContainer.addEventListener("click", (event) => {
  const button = event.target.closest(".badge-level-remove");

  if (!button) {
    return;
  }

  if (badgeLevelDescriptionsContainer.querySelectorAll(".quest-step-row").length === 1) {
    return;
  }

  button.closest(".quest-step-row").remove();
  syncBadgeLevelFields(badgeLevelDescriptionsContainer, addBadgeLevelButton, "badge-level-remove");
});

editBadgeLevelDescriptionsContainer.addEventListener("click", (event) => {
  const button = event.target.closest(".edit-badge-level-remove");

  if (!button) {
    return;
  }

  if (editBadgeLevelDescriptionsContainer.querySelectorAll(".quest-step-row").length === 1) {
    return;
  }

  button.closest(".quest-step-row").remove();
  syncBadgeLevelFields(editBadgeLevelDescriptionsContainer, addEditBadgeLevelButton, "edit-badge-level-remove");
});

addQuestStepButton.addEventListener("click", () => {
  clearMessage(questMessage);
  addQuestStep();
});

addBadgeLevelButton.addEventListener("click", () => {
  clearMessage(badgeMessage);
  addBadgeLevelRow(badgeLevelDescriptionsContainer, addBadgeLevelButton, badgeMessage);
});

addEditBadgeLevelButton.addEventListener("click", () => {
  clearMessage(editBadgeMessage);
  addBadgeLevelRow(editBadgeLevelDescriptionsContainer, addEditBadgeLevelButton, editBadgeMessage, "", "edit-badge-level-remove");
});

badgeSelect.addEventListener("change", () => {
  clearMessage(assignBadgeMessage);
  syncAssignBadgeLevels();
});

badgeLineageSelect.addEventListener("change", () => {
  loadBadgeLineage();
});

refreshBadgeLineageButton.addEventListener("click", loadBadgeLineage);

eventConditionTypeSelect.addEventListener("change", () => {
  clearMessage(eventMessage);
  syncEventBadgeField();
});

editBadgeSelect.addEventListener("change", () => {
  clearMessage(editBadgeMessage);
  const badge = badgesState.find((entry) => entry.id === Number(editBadgeSelect.value));
  populateEditBadgeForm(badge);
});

editUserSelect.addEventListener("change", () => {
  clearMessage(editUserMessage);
  const user = usersState.find((entry) => entry.code === editUserSelect.value);
  populateEditUserForm(user);
});

pendingRequestsContainer.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const requestId = button.dataset.id;
  const action = button.dataset.action;

  try {
    await adminApiFetch(`/api/requests/${requestId}/${action}`, {
      method: "POST"
    });
    await loadPendingRequests();
  } catch (error) {
    alert(error.message);
  }
});

refreshButton.addEventListener("click", loadPendingRequests);

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tabTarget);
  });
});

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(adminLoginMessage);

  const formData = new FormData(adminLoginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  try {
    const session = await apiFetch("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    adminLoginForm.reset();
    adminLoginUsername.value = String(session.username || username);
    setAuthenticatedState(session.username || username);
    await initializeDashboard();
  } catch (error) {
    setMessage(adminLoginMessage, error.message, "error");
  }
});

adminSetupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(adminSetupMessage);

  const formData = new FormData(adminSetupForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password !== confirmPassword) {
    setMessage(adminSetupMessage, "Gesli se ne ujemata.", "error");
    return;
  }

  try {
    const session = await apiFetch("/api/admin/setup", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    adminSetupRequired = false;
    adminSetupForm.reset();
    adminSetupUsername.value = String(session.username || username);
    adminLoginUsername.value = String(session.username || username);
    setAuthenticatedState(session.username || username);
    await initializeDashboard();
  } catch (error) {
    setMessage(adminSetupMessage, error.message, "error");
  }
});

adminLogoutButton.addEventListener("click", async () => {
  clearMessage(adminSessionMessage);
  try {
    await adminApiFetch("/api/admin/logout", {
      method: "POST"
    });
  } catch (error) {
    setMessage(adminSessionMessage, error.message, "error");
  } finally {
    setLoggedOutState("Odjavljen si iz administratorskega računa.");
  }
});

async function initializeDashboard() {
  resetQuestForm();
  resetBadgeForm();
  resetEditBadgeForm();
  resetEditUserForm();
  await Promise.all([
    loadPendingRequests(),
    loadMeetingMembers(),
    loadBadges(),
    loadEvents()
  ]);
}

async function initializeLoginDefaults() {
  try {
    const config = await apiFetch("/api/admin/config");
    adminSetupRequired = Boolean(config.setupRequired);
    if (config.username) {
      adminLoginUsername.value = String(config.username);
      adminSetupUsername.value = String(config.username);
    }
  } catch (_error) {
    adminLoginUsername.value = "admin";
    adminSetupUsername.value = "admin";
    adminSetupRequired = false;
  }
  syncAuthPanels();
}

async function restoreExistingSession() {
  if (adminSetupRequired) {
    setLoggedOutState("Najprej nastavi administratorsko geslo.");
    return;
  }

  try {
    const session = await adminApiFetch("/api/admin/session");
    setAuthenticatedState(session.username || "admin");
    await initializeDashboard();
  } catch (_error) {
    setLoggedOutState("Prejšnja seja ni več veljavna. Prijavi se znova.");
  }
}

async function initializeAdminPage() {
  await initializeLoginDefaults();
  await restoreExistingSession();
}

initializeAdminPage();
