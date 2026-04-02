const playerSummary = document.getElementById("player-summary");
const playerBadges = document.getElementById("player-badges");
const approvedRequestsBody = document.getElementById("approved-requests-body");
const query = new URLSearchParams(window.location.search);
const playerCode = String(query.get("code") || "").trim();

function renderPlayerSummary(user) {
  playerSummary.innerHTML = `
    <h3>${user.name}</h3>
    <p>Trenutne točke: <strong>${user.points}</strong></p>
    <p>Sestanki: <strong>${user.attendance}</strong></p>
  `;
}

function renderBadges(badges) {
  if (!badges.length) {
    playerBadges.innerHTML = '<p class="muted">Ta mentorica/mentor še nima značk.</p>';
    return;
  }

  playerBadges.innerHTML = badges
    .map((badge) => `
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
    `)
    .join("");
}

function renderApprovedRequests(requests) {
  if (requests.length === 0) {
    approvedRequestsBody.innerHTML = '<tr><td colspan="3">Odobrenih zahtevkov še ni.</td></tr>';
    return;
  }

  approvedRequestsBody.innerHTML = requests
    .map((request) => `
      <tr>
        <td>${request.points}</td>
        <td>${request.reason || "Razlog ni podan."}</td>
        <td>${new Date(request.processedAt || request.createdAt).toLocaleString()}</td>
      </tr>
    `)
    .join("");
}

async function loadPlayerLog() {
  if (!playerCode) {
    playerSummary.innerHTML = '<p class="message visible error">Manjka koda igralca.</p>';
    approvedRequestsBody.innerHTML = '<tr><td colspan="3">Zahtevkov ni bilo mogoče naložiti.</td></tr>';
    return;
  }

  try {
    const data = await apiFetch(`/api/users/${encodeURIComponent(playerCode)}/approved-requests`);
    renderPlayerSummary(data.user);
    renderBadges(data.user.badges || []);
    renderApprovedRequests(data.approvedRequests);
  } catch (error) {
    playerSummary.innerHTML = `<p class="message visible error">${error.message}</p>`;
    playerBadges.innerHTML = `<p class="message visible error">${error.message}</p>`;
    approvedRequestsBody.innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`;
  }
}

loadPlayerLog();
