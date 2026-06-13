const { readData, writeData } = require("../data/store");

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DEFAULT_TIMEZONE = "Europe/Ljubljana";
const DEFAULT_NOTIFICATION_HOUR = 9;
const DISCORD_REQUEST_TIMEOUT_MS = 8000;

let discordSenderOverride = null;
let schedulerInterval = null;

function getDiscordConfig() {
  const reminderHour = Number(process.env.DISCORD_REMINDER_HOUR || DEFAULT_NOTIFICATION_HOUR);
  const monthlyHour = Number(process.env.DISCORD_MONTHLY_HOUR || DEFAULT_NOTIFICATION_HOUR);

  return {
    botToken: String(process.env.DISCORD_BOT_TOKEN || "").trim(),
    mentorChannelId: String(process.env.DISCORD_MENTOR_CHANNEL_ID || "").trim(),
    publicBaseUrl: String(process.env.DISCORD_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, ""),
    timezone: String(process.env.DISCORD_TIMEZONE || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE,
    reminderHour: Number.isInteger(reminderHour) && reminderHour >= 0 && reminderHour <= 23
      ? reminderHour
      : DEFAULT_NOTIFICATION_HOUR,
    monthlyHour: Number.isInteger(monthlyHour) && monthlyHour >= 0 && monthlyHour <= 23
      ? monthlyHour
      : DEFAULT_NOTIFICATION_HOUR
  };
}

function isDiscordConfigured(config = getDiscordConfig()) {
  return Boolean(config.botToken && config.mentorChannelId);
}

function buildAppLink(pathname, config = getDiscordConfig()) {
  if (!config.publicBaseUrl) {
    return "";
  }

  return `${config.publicBaseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function appendLink(lines, label, pathname, config = getDiscordConfig()) {
  const link = buildAppLink(pathname, config);

  if (link) {
    lines.push(`${label}: ${link}`);
  }

  return lines;
}

function formatNewQuestMessage(quest, config = getDiscordConfig()) {
  const lines = [
    `Nov quest: ${quest.title}`,
    `Nagrada: ${quest.rewardPoints} točk`,
    `Ekipa: ${quest.requiredPlayers} mentoric/mentorjev`,
    `Izpolnitve: ${quest.completionLimit}`
  ];

  appendLink(lines, "Odpri", "/user", config);
  return lines.join("\n");
}

function formatEventReminderMessage(event, config = getDiscordConfig()) {
  const lines = [
    `Dogodek se približuje: ${event.title}`,
    `Datum preverjanja: ${event.date}`,
    `Pogoj: ${event.conditionLabel || "Pogoj ni nastavljen."}`,
    `Napredek: ${Number.isInteger(event.currentValue) ? event.currentValue : 0} / ${event.targetValue}`
  ];

  appendLink(lines, "Lestvica", "/", config);
  return lines.join("\n");
}

function formatBadgeRequestMessage(request, config = getDiscordConfig()) {
  const lines = [
    `${request.userName} prosi za značko "${request.badgeName}" (nivo ${request.badgeLevel || 1}).`,
    "Prošnjo lahko potrdiš na mentorski strani."
  ];

  appendLink(lines, "Odpri", "/user", config);
  return lines.join("\n");
}

function formatQuestJoinMessage(quest, joiner, config = getDiscordConfig()) {
  const participantCount = Array.isArray(quest.participants) ? quest.participants.length : 0;
  const lines = [
    `${joiner.name} se je pridružil/a skupinskemu questu "${quest.title}".`,
    `Ekipa: ${participantCount} / ${quest.requiredPlayers}`
  ];

  appendLink(lines, "Odpri", "/user", config);
  return lines.join("\n");
}

function countUserBadges(user) {
  if (Array.isArray(user.userBadges)) {
    return user.userBadges.length;
  }

  return Array.isArray(user.badgeIds) ? user.badgeIds.length : 0;
}

function getP2pCountsByCode(data) {
  return data.requests.reduce((counts, request) => {
    if (request.type === "badge-share" && request.status === "approved" && request.targetUserCode) {
      const code = String(request.targetUserCode || "").trim().toUpperCase();
      counts.set(code, (counts.get(code) || 0) + 1);
    }

    return counts;
  }, new Map());
}

function getTopLeaders(data, limit = 3) {
  const p2pCounts = getP2pCountsByCode(data);
  const categories = [
    {
      label: "Točke",
      getValue: (user) => user.points
    },
    {
      label: "Sestanki",
      getValue: (user) => user.attendance
    },
    {
      label: "Značke",
      getValue: (user) => countUserBadges(user)
    },
    {
      label: "P2P",
      getValue: (user) => p2pCounts.get(user.code) || 0
    }
  ];

  return categories.map((category) => ({
    label: category.label,
    users: [...data.users]
      .map((user) => ({
        name: user.name,
        value: category.getValue(user)
      }))
      .sort((a, b) => {
        if (b.value !== a.value) {
          return b.value - a.value;
        }

        return a.name.localeCompare(b.name);
      })
      .slice(0, limit)
  }));
}

function formatMonthlyLeadersMessage(data, date = new Date()) {
  const monthLabel = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const lines = [`Mesečna lestvica (${monthLabel})`];
  const leaders = getTopLeaders(data, 3);

  leaders.forEach((category) => {
    lines.push("");
    lines.push(`${category.label}:`);

    if (category.users.length === 0) {
      lines.push("Ni podatkov.");
      return;
    }

    category.users.forEach((user, index) => {
      lines.push(`${index + 1}. ${user.name} - ${user.value}`);
    });
  });

  return lines.join("\n");
}

async function requestDiscord(pathname, options = {}) {
  const config = getDiscordConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCORD_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${DISCORD_API_BASE}${pathname}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bot ${config.botToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.message || `Discord request failed with status ${response.status}.`);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function getDiscordSender() {
  if (discordSenderOverride) {
    return discordSenderOverride;
  }

  return {
    async sendChannelMessage(channelId, content) {
      await requestDiscord(`/channels/${encodeURIComponent(channelId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ content })
      });
    },
    async sendDirectMessage(userId, content) {
      const dmChannel = await requestDiscord("/users/@me/channels", {
        method: "POST",
        body: JSON.stringify({ recipient_id: userId })
      });

      await requestDiscord(`/channels/${encodeURIComponent(dmChannel.id)}/messages`, {
        method: "POST",
        body: JSON.stringify({ content })
      });
    }
  };
}

function setDiscordSenderForTests(sender) {
  discordSenderOverride = sender;
}

function getNotificationKeySet(data = readData()) {
  return new Set(data.discordNotifications.map((notification) => notification.key));
}

function hasNotification(key) {
  return getNotificationKeySet().has(key);
}

function recordNotification(key, type, target) {
  const data = readData();

  if (data.discordNotifications.some((notification) => notification.key === key)) {
    return;
  }

  data.discordNotifications.push({
    key,
    type,
    target,
    sentAt: new Date().toISOString()
  });
  writeData(data);
}

async function sendChannelNotification(key, type, content, config = getDiscordConfig()) {
  if (!isDiscordConfigured(config) || hasNotification(key)) {
    return false;
  }

  try {
    await getDiscordSender().sendChannelMessage(config.mentorChannelId, content);
    recordNotification(key, type, config.mentorChannelId);
    return true;
  } catch (error) {
    console.error(`Discord ${type} notification failed:`, error.message);
    return false;
  }
}

async function sendDirectNotification(key, type, discordUserId, content, config = getDiscordConfig()) {
  if (!isDiscordConfigured(config) || !discordUserId || hasNotification(key)) {
    return false;
  }

  try {
    await getDiscordSender().sendDirectMessage(discordUserId, content);
    recordNotification(key, type, discordUserId);
    return true;
  } catch (error) {
    console.error(`Discord ${type} DM failed:`, error.message);
    return false;
  }
}

function decorateEventForDiscord(event, data) {
  let currentValue = 0;

  if (event.conditionType === "points-total") {
    currentValue = data.users.reduce((total, user) => total + user.points, 0);
  } else if (event.conditionType === "attendance-total") {
    currentValue = data.users.reduce((total, user) => total + user.attendance, 0);
  } else if (event.conditionType === "badge-count") {
    currentValue = data.users.filter((user) =>
      (Array.isArray(user.userBadges) ? user.userBadges : []).some((entry) => entry.badgeId === event.badgeId)
    ).length;
  }

  let conditionLabel = "Pogoj ni nastavljen.";

  if (event.conditionType === "points-total") {
    conditionLabel = `Skupne točke vseh mentoric/mentorjev: ${event.targetValue}`;
  } else if (event.conditionType === "attendance-total") {
    conditionLabel = `Skupni sestanki vseh mentoric/mentorjev: ${event.targetValue}`;
  } else if (event.conditionType === "badge-count") {
    const badge = data.badges.find((entry) => entry.id === event.badgeId);
    conditionLabel = `Mentorice/Mentorji z značko "${badge ? badge.name : "neznana značka"}": ${event.targetValue}`;
  }

  return {
    ...event,
    currentValue,
    conditionLabel
  };
}

function getLocalParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(date);

  return parts.reduce((result, part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }

    return result;
  }, {});
}

function toDateStringFromParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysToDateString(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

async function notifyQuestCreated(quest) {
  const config = getDiscordConfig();
  const key = `quest-created:${quest.id}`;
  const content = formatNewQuestMessage(quest, config);
  return sendChannelNotification(key, "quest-created", content, config);
}

async function notifyBadgeShareRequestCreated(request) {
  const data = readData();
  const target = data.users.find((user) => user.code === request.targetUserCode);

  if (!target) {
    return false;
  }

  const config = getDiscordConfig();
  const key = `badge-share-request:${request.id}:${target.code}`;
  const content = formatBadgeRequestMessage(request, config);
  return sendDirectNotification(key, "badge-share-request", target.discordUserId, content, config);
}

async function notifyQuestJoined(quest, previousQuest, joiningUserCode) {
  if (!quest || Number(quest.requiredPlayers) <= 1) {
    return [];
  }

  const data = readData();
  const joiner = data.users.find((user) => user.code === String(joiningUserCode || "").trim().toUpperCase());

  if (!joiner) {
    return [];
  }

  const previousParticipantCodes = new Set(
    (Array.isArray(previousQuest && previousQuest.participants) ? previousQuest.participants : [])
      .map((participant) => participant.code)
  );

  if (previousParticipantCodes.has(joiner.code)) {
    return [];
  }

  const config = getDiscordConfig();
  const content = formatQuestJoinMessage(quest, joiner, config);
  const recipients = data.users.filter((user) =>
    previousParticipantCodes.has(user.code) &&
    user.code !== joiner.code
  );

  const results = [];

  for (const recipient of recipients) {
    const key = `quest-join:${quest.id}:${joiner.code}:${recipient.code}`;
    results.push(await sendDirectNotification(key, "quest-join", recipient.discordUserId, content, config));
  }

  return results;
}

async function postDueEventReminders(now = new Date()) {
  const config = getDiscordConfig();
  const parts = getLocalParts(now, config.timezone);

  if (Number(parts.hour) < config.reminderHour) {
    return [];
  }

  const today = toDateStringFromParts(parts);
  const throughDate = addDaysToDateString(today, 7);
  const data = readData();
  const pendingEvents = data.events
    .filter((event) => event.status === "pending" && event.date >= today && event.date <= throughDate)
    .sort((a, b) => a.date.localeCompare(b.date) || new Date(a.createdAt) - new Date(b.createdAt));
  const results = [];

  for (const event of pendingEvents) {
    const key = `event-reminder:${today}:${event.id}`;
    const content = formatEventReminderMessage(decorateEventForDiscord(event, data), config);
    results.push(await sendChannelNotification(key, "event-reminder", content, config));
  }

  return results;
}

async function postMonthlyLeaders(now = new Date()) {
  const config = getDiscordConfig();
  const parts = getLocalParts(now, config.timezone);

  if (parts.day !== "01" || Number(parts.hour) < config.monthlyHour) {
    return false;
  }

  const data = readData();
  const monthKey = `${parts.year}-${parts.month}`;
  const key = `monthly-leaders:${monthKey}`;
  const content = formatMonthlyLeadersMessage(data, new Date(`${monthKey}-01T00:00:00.000Z`));
  return sendChannelNotification(key, "monthly-leaders", content, config);
}

async function runScheduledDiscordNotifications(now = new Date()) {
  const eventResults = await postDueEventReminders(now);
  const monthlyResult = await postMonthlyLeaders(now);

  return {
    eventResults,
    monthlyResult
  };
}

function startDiscordScheduler() {
  if (schedulerInterval) {
    return schedulerInterval;
  }

  if (!isDiscordConfigured()) {
    return null;
  }

  schedulerInterval = setInterval(() => {
    runScheduledDiscordNotifications().catch((error) => {
      console.error("Discord scheduled notifications failed:", error.message);
    });
  }, 15 * 60 * 1000);

  if (typeof schedulerInterval.unref === "function") {
    schedulerInterval.unref();
  }

  runScheduledDiscordNotifications().catch((error) => {
    console.error("Discord scheduled notifications failed:", error.message);
  });

  return schedulerInterval;
}

function stopDiscordScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

module.exports = {
  formatBadgeRequestMessage,
  formatEventReminderMessage,
  formatMonthlyLeadersMessage,
  formatNewQuestMessage,
  formatQuestJoinMessage,
  getTopLeaders,
  notifyBadgeShareRequestCreated,
  notifyQuestCreated,
  notifyQuestJoined,
  postDueEventReminders,
  postMonthlyLeaders,
  runScheduledDiscordNotifications,
  setDiscordSenderForTests,
  startDiscordScheduler,
  stopDiscordScheduler
};
