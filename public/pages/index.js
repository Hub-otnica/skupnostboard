const tbody = document.getElementById("scoreboard-body");
const eventsList = document.getElementById("events-list");
const sortModeSelect = document.getElementById("sort-mode");
const badgeNetworkSelect = document.getElementById("badge-network-select");
const badgeNetworkCanvas = document.getElementById("badge-network-canvas");
const badgeNetworkCanvasWrap = badgeNetworkCanvas ? badgeNetworkCanvas.parentElement : null;
const badgeNetworkMessage = document.getElementById("badge-network-message");
const badgeNetworkSummary = document.getElementById("badge-network-summary");

const BADGE_NETWORK_PADDING = 52;
const BADGE_NETWORK_LABEL_SIDE_PADDING = 12;
let scoreboardUsers = [];
let badgesState = [];
let badgeNetworkState = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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
  if (sortMode === "p2p") {
    return [...users].sort((a, b) => {
      const aP2p = Number.isInteger(a.p2p) ? a.p2p : 0;
      const bP2p = Number.isInteger(b.p2p) ? b.p2p : 0;

      if (bP2p !== aP2p) {
        return bP2p - aP2p;
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
    tbody.innerHTML = '<tr><td colspan="6">Mentoric/mentorjev še ni.</td></tr>';
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
        <td>${Number.isInteger(user.p2p) ? user.p2p : 0}</td>
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
        <p><strong>Nagrada ob uspehu:</strong> +${event.rewardPoints} točk vsem mentoricam/mentorjem</p>
        <p><strong>Kazen ob neuspehu:</strong> -${event.penaltyPoints} točk vsem mentoricam/mentorjem</p>
      </article>
    `)
    .join("");
}

function hashString(input) {
  let hash = 0;
  const value = String(input || "");

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getUserColor(userId) {
  const hue = hashString(userId) % 360;
  return `hsl(${hue}, 76%, 62%)`;
}

function fitBadgeNetworkCanvasToContainer() {
  if (!badgeNetworkCanvas || !badgeNetworkCanvasWrap) {
    return { width: 0, height: 0 };
  }

  const dpr = window.devicePixelRatio || 1;
  const rect = badgeNetworkCanvasWrap.getBoundingClientRect();
  const cssWidth = Math.max(320, Math.floor(rect.width));
  const cssHeight = Math.max(320, Math.floor(rect.height));

  badgeNetworkCanvas.width = Math.floor(cssWidth * dpr);
  badgeNetworkCanvas.height = Math.floor(cssHeight * dpr);
  badgeNetworkCanvas.style.width = `${cssWidth}px`;
  badgeNetworkCanvas.style.height = `${cssHeight}px`;

  const context = badgeNetworkCanvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  return {
    width: cssWidth,
    height: cssHeight
  };
}

function buildBadgeNetworkLayout(nodes, edges, width, height) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const childrenById = new Map();
  const indegreeById = new Map();
  const seenEdges = new Set();

  nodes.forEach((node) => {
    childrenById.set(node.id, []);
    indegreeById.set(node.id, 0);
  });

  edges.forEach((edge) => {
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) {
      return;
    }

    const dedupeKey = `${edge.from}->${edge.to}`;

    if (seenEdges.has(dedupeKey)) {
      return;
    }

    seenEdges.add(dedupeKey);
    childrenById.get(edge.from).push(edge.to);
    indegreeById.set(edge.to, (indegreeById.get(edge.to) || 0) + 1);
  });

  childrenById.forEach((children, parentId) => {
    children.sort((leftId, rightId) => {
      const leftName = (nodesById.get(leftId).name || "").toLowerCase();
      const rightName = (nodesById.get(rightId).name || "").toLowerCase();

      if (leftName === rightName) {
        return leftId.localeCompare(rightId);
      }

      return leftName.localeCompare(rightName);
    });
  });

  const roots = nodes
    .filter((node) => (indegreeById.get(node.id) || 0) === 0)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((node) => node.id);

  const visited = new Set();
  const allRoots = [...roots];

  nodes.forEach((node) => {
    if (!allRoots.includes(node.id)) {
      allRoots.push(node.id);
    }
  });

  const subtreeWidthMemo = new Map();

  function computeSubtreeWidth(nodeId, path = new Set()) {
    if (subtreeWidthMemo.has(nodeId)) {
      return subtreeWidthMemo.get(nodeId);
    }

    if (path.has(nodeId)) {
      return 1;
    }

    path.add(nodeId);
    const children = childrenById.get(nodeId) || [];
    const unvisitedChildren = children.filter((childId) => !path.has(childId));
    const widthUnits = unvisitedChildren.length === 0
      ? 1
      : Math.max(1, unvisitedChildren.reduce((sum, childId) => sum + computeSubtreeWidth(childId, new Set(path)), 0));
    subtreeWidthMemo.set(nodeId, widthUnits);
    return widthUnits;
  }

  const positions = new Map();
  let maxDepth = 0;
  let currentX = 0;
  const forestGap = 1;

  function assignNodePosition(nodeId, depth, leftBound) {
    if (visited.has(nodeId)) {
      return 0;
    }

    visited.add(nodeId);
    const children = (childrenById.get(nodeId) || []).filter((childId) => !visited.has(childId));
    const subtreeWidth = computeSubtreeWidth(nodeId);

    if (children.length === 0) {
      positions.set(nodeId, {
        xUnit: leftBound + 0.5,
        depth
      });
      maxDepth = Math.max(maxDepth, depth);
      return subtreeWidth;
    }

    let cursor = leftBound;
    const childCenters = [];
    children.forEach((childId) => {
      const childWidth = assignNodePosition(childId, depth + 1, cursor);
      const childPosition = positions.get(childId);
      if (childPosition) {
        childCenters.push(childPosition.xUnit);
      }
      cursor += childWidth;
    });

    const fallbackCenter = leftBound + (subtreeWidth / 2);
    const center = childCenters.length
      ? childCenters.reduce((sum, value) => sum + value, 0) / childCenters.length
      : fallbackCenter;

    positions.set(nodeId, {
      xUnit: center,
      depth
    });
    maxDepth = Math.max(maxDepth, depth);
    return subtreeWidth;
  }

  allRoots.forEach((rootId) => {
    if (visited.has(rootId)) {
      return;
    }

    const usedWidth = assignNodePosition(rootId, 0, currentX);
    currentX += usedWidth + forestGap;
  });

  const xUnits = Array.from(positions.values()).map((entry) => entry.xUnit);
  const minX = xUnits.length ? Math.min(...xUnits) : 0;
  const maxX = xUnits.length ? Math.max(...xUnits) : 1;
  const xRange = maxX - minX || 1;
  const usableWidth = Math.max(1, width - (2 * BADGE_NETWORK_PADDING));
  const usableHeight = Math.max(1, height - (2 * BADGE_NETWORK_PADDING));
  const depthRange = Math.max(1, maxDepth);

  const renderedNodes = nodes.map((node) => {
    const position = positions.get(node.id) || {
      xUnit: minX,
      depth: 0
    };
    return {
      ...node,
      x: BADGE_NETWORK_PADDING + (((position.xUnit - minX) / xRange) * usableWidth),
      y: BADGE_NETWORK_PADDING + ((position.depth / depthRange) * usableHeight),
      depth: position.depth
    };
  });

  const nodeById = new Map(renderedNodes.map((node) => [node.id, node]));
  const renderedEdges = edges
    .map((edge) => ({
      ...edge,
      fromNode: nodeById.get(edge.from),
      toNode: nodeById.get(edge.to)
    }))
    .filter((edge) => edge.fromNode && edge.toNode);

  return {
    nodes: renderedNodes,
    edges: renderedEdges
  };
}

function drawEmptyNetworkState(text) {
  if (!badgeNetworkCanvas) {
    return;
  }

  const { width, height } = fitBadgeNetworkCanvasToContainer();
  const context = badgeNetworkCanvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(191, 168, 168, 0.92)";
  context.font = "600 16px Verdana, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height / 2);
}

function renderBadgeNetwork() {
  if (!badgeNetworkCanvas) {
    return;
  }

  if (!badgeNetworkState || !Array.isArray(badgeNetworkState.nodes) || badgeNetworkState.nodes.length === 0) {
    drawEmptyNetworkState("Za izbrano značko še ni delitev.");
    return;
  }

  const { width, height } = fitBadgeNetworkCanvasToContainer();
  const context = badgeNetworkCanvas.getContext("2d");
  const layout = buildBadgeNetworkLayout(badgeNetworkState.nodes, badgeNetworkState.edges || [], width, height);
  const nodeCount = Math.max(1, layout.nodes.length);
  const densityScale = clamp(24 / Math.sqrt(nodeCount), 0.45, 2.2);
  const nodeRadius = clamp(((Math.min(width, height) / 28) * densityScale), 3, 18);
  const lineWidth = clamp(nodeRadius * 0.38, 1, 5);

  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";

  layout.edges.forEach((edge) => {
    context.beginPath();
    context.moveTo(edge.fromNode.x, edge.fromNode.y);
    context.lineTo(edge.toNode.x, edge.toNode.y);
    context.strokeStyle = "rgba(255, 172, 172, 0.42)";
    context.lineWidth = lineWidth;
    context.stroke();
  });

  layout.nodes.forEach((node) => {
    context.beginPath();
    context.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
    context.fillStyle = getUserColor(node.code || node.id);
    context.fill();

    context.lineWidth = Math.max(1, lineWidth * 0.5);
    context.strokeStyle = "rgba(10, 10, 10, 0.85)";
    context.stroke();
  });

  if (layout.nodes.length <= 36) {
    const fontSize = clamp(nodeRadius * 1.25, 11, 15);
    context.font = `600 ${fontSize}px Verdana, sans-serif`;
    context.textBaseline = "bottom";
    layout.nodes.forEach((node) => {
      const label = node.name || node.code || "?";
      const textWidth = context.measureText(label).width;
      const minLabelX = (textWidth / 2) + BADGE_NETWORK_LABEL_SIDE_PADDING;
      const maxLabelX = width - (textWidth / 2) - BADGE_NETWORK_LABEL_SIDE_PADDING;
      const labelX = clamp(node.x, minLabelX, maxLabelX);
      const labelY = clamp(
        node.y - (nodeRadius + 6),
        fontSize + BADGE_NETWORK_LABEL_SIDE_PADDING,
        height - BADGE_NETWORK_LABEL_SIDE_PADDING
      );
      context.fillStyle = "rgba(255, 240, 240, 0.94)";
      context.textAlign = "center";
      context.fillText(label, labelX, labelY);
    });
  }
}

function renderBadgeNetworkSelector() {
  if (!badgeNetworkSelect) {
    return;
  }

  if (!Array.isArray(badgesState) || badgesState.length === 0) {
    badgeNetworkSelect.innerHTML = '<option value="">Ni značk</option>';
    badgeNetworkSummary.textContent = "";
    drawEmptyNetworkState("Najprej ustvari značko.");
    return;
  }

  const previousBadgeId = String(badgeNetworkSelect.value || "");
  badgeNetworkSelect.innerHTML = `
    ${badgesState.map((badge) => `<option value="${badge.id}">${escapeHtml(badge.name)}</option>`).join("")}
  `;

  const selectedBadge = badgesState.find((badge) => String(badge.id) === previousBadgeId) || badgesState[0];
  badgeNetworkSelect.value = String(selectedBadge.id);
}

async function loadBadgeNetwork(badgeId) {
  clearMessage(badgeNetworkMessage);

  if (!badgeId) {
    badgeNetworkState = null;
    badgeNetworkSummary.textContent = "";
    drawEmptyNetworkState("Izberi značko za prikaz mreže.");
    return;
  }

  try {
    const network = await apiFetch(`/api/badges/${encodeURIComponent(badgeId)}/network`);
    badgeNetworkState = {
      nodes: Array.isArray(network.nodes) ? network.nodes : [],
      edges: Array.isArray(network.edges) ? network.edges : []
    };

    const nodeCount = badgeNetworkState.nodes.length;
    const edgeCount = badgeNetworkState.edges.length;
    badgeNetworkSummary.textContent = `${nodeCount} mentoric/mentorjev • ${edgeCount} povezav deljenja`;
    renderBadgeNetwork();
  } catch (error) {
    badgeNetworkState = null;
    badgeNetworkSummary.textContent = "";
    setMessage(badgeNetworkMessage, error.message, "error");
    drawEmptyNetworkState("Mreže ni bilo mogoče naložiti.");
  }
}

async function loadBadgeNetworkBadges() {
  try {
    badgesState = await apiFetch("/api/badges");
    renderBadgeNetworkSelector();
    await loadBadgeNetwork(badgeNetworkSelect.value);
  } catch (error) {
    badgesState = [];
    badgeNetworkSelect.innerHTML = '<option value="">Napaka pri nalaganju</option>';
    setMessage(badgeNetworkMessage, error.message, "error");
    drawEmptyNetworkState("Značk ni bilo mogoče naložiti.");
  }
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
    tbody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
    eventsList.innerHTML = `<p class="message visible error">${error.message}</p>`;
  }
}

sortModeSelect.addEventListener("change", renderScoreboard);
badgeNetworkSelect.addEventListener("change", async () => {
  await loadBadgeNetwork(badgeNetworkSelect.value);
});

loadScoreboard();
loadBadgeNetworkBadges();
