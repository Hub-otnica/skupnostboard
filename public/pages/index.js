const tbody = document.getElementById("scoreboard-body");
const eventsList = document.getElementById("events-list");
const sortModeSelect = document.getElementById("sort-mode");
let scoreboardUsers = [];

function assignPointsRank(users) {
  return users.reduce((rankedUsers, user, index) => {
    const previousUser = rankedUsers[index - 1];
    const hasSharedRank =
      previousUser &&
      previousUser.points === user.points &&
      previousUser.attendance === user.attendance;

    rankedUsers.push({
      ...user,
      pointsRank: hasSharedRank ? previousUser.pointsRank : index + 1
    });

    return rankedUsers;
  }, []);
}

function getSortedUsers(users, sortMode) {
  if (sortMode === "badges") {
    return [...users].sort((a, b) => {
      const aBadgeCount = Array.isArray(a.userBadges) ? a.userBadges.length : Array.isArray(a.badgeIds) ? a.badgeIds.length : 0;
      const bBadgeCount = Array.isArray(b.userBadges) ? b.userBadges.length : Array.isArray(b.badgeIds) ? b.badgeIds.length : 0;

      if (bBadgeCount !== aBadgeCount) {
        return bBadgeCount - aBadgeCount;
      }

      if (b.points !== a.points) {
        return b.points - a.points;
      }

      if (b.attendance !== a.attendance) {
        return b.attendance - a.attendance;
      }

      return a.name.localeCompare(b.name);
    });
  }

  if (sortMode === "attendance") {
    return [...users].sort((a, b) => {
      if (b.attendance !== a.attendance) {
        return b.attendance - a.attendance;
      }

      if (b.points !== a.points) {
        return b.points - a.points;
      }

      return a.name.localeCompare(b.name);
    });
  }

  return [...users];
}

function renderScoreboard() {
  const sortMode = sortModeSelect.value;
  const users = getSortedUsers(scoreboardUsers, sortMode);

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Mentorjev še ni.</td></tr>';
    return;
  }

  tbody.innerHTML = users
    .map((user) => `
      <tr>
        <td>${user.pointsRank}</td>
        <td><a class="player-link" href="/player?code=${encodeURIComponent(user.code)}">${user.name}</a></td>
        <td>${user.points}</td>
        <td>${user.attendance}</td>
        <td>${Array.isArray(user.userBadges) ? user.userBadges.length : Array.isArray(user.badgeIds) ? user.badgeIds.length : 0}</td>
      </tr>
    `)
    .join("");
}

function renderEvents(events) {
  if (events.length === 0) {
    eventsList.innerHTML = '<p class="muted">Trenutno ni razpisanih dogodkov.</p>';
    return;
  }

  eventsList.innerHTML = events
    .map((event) => `
      <article class="card">
        <p><span class="pill">${event.status === "pending" ? "V teku" : event.status === "success" ? "Uspeh" : "Neuspeh"}</span></p>
        <h3>${escapeHtml(event.title)}</h3>
        <p><strong>Datum preverjanja:</strong> ${escapeHtml(event.date)}</p>
        <p><strong>Pogoj:</strong> ${escapeHtml(event.conditionLabel)}</p>
        <p><strong>Napredek skupnosti:</strong> ${event.currentValue} / ${event.targetValue}</p>
        <p><strong>Nagrada ob uspehu:</strong> +${event.rewardPoints} točk vsem mentorjem</p>
        <p><strong>Kazen ob neuspehu:</strong> -${event.penaltyPoints} točk vsem mentorjem</p>
      </article>
    `)
    .join("");
}

async function loadScoreboard() {
  try {
    const [users, events] = await Promise.all([
      apiFetch("/api/users"),
      apiFetch("/api/events")
    ]);
    scoreboardUsers = assignPointsRank(users);
    renderScoreboard();
    renderEvents(events);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
    eventsList.innerHTML = `<p class="message visible error">${error.message}</p>`;
  }
}

sortModeSelect.addEventListener("change", renderScoreboard);

loadScoreboard();
