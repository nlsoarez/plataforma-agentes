"use strict";

const DEFAULTS = {
  monitorMode: "local",
  serverUrl: "http://127.0.0.1:8787",
  pollMinutes: 0.5,
  recTypes: [],
  soundEnabled: true,
  soundType: "beep",
  relayUrl: "https://relay.comunora.com.br",
  relaySecret: ""
};

const POLL_ALARM = "embratel-rec-monitor-poll";
const ETIT_ALARM = "embratel-rec-etit-watch";
const WHATSAPP_ALARM_PREFIX = "embratel-whatsapp-etit-";
const MAX_STORED_REC_IDS = 800;
const MAX_ETIT_WATCH_ITEMS = 500;
const WHATSAPP_ETIT_WARNING_MS = 20 * 60 * 1000;
const ETIT_WARNING_MS = 25 * 60 * 1000;
const ETIT_WATCH_TTL_MS = 2 * 60 * 60 * 1000;
const ETIT_ALARM_MINUTES = 1;
const ETIT_MISSING_SCAN_LIMIT = 3;
const WHATSAPP_ALARM_RETRY_MINUTES = 1;
const WHATSAPP_ALARM_MIN_DELAY_MINUTES = 0.1;
const SUPPORTED_REC_TYPES = ["fibra-rio-es", "fibra-leste", "bsod"];
const EMBRATEL_TAB_URLS = [
  "http://10.13.54.150:20020/*",
  "http://10.53.224.155/*",
  "http://sir.nt.embratel.com.br/*",
  "http://172.30.130.133/*"
];
const SSE_RECONNECT_ALARM = "sse-reconnect";
const pendingAlerts = new Map();
const recentlyNotified = new Set(); // In-memory dedup against SSE+poll race
let etitTickRunning = false;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function normalizeServerUrl(value) {
  const raw = String(value || DEFAULTS.serverUrl).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) return `http://${raw}`;
  return raw;
}

function normalizeRecTypes(value) {
  if (!Array.isArray(value)) return [];
  const expanded = [];
  for (const item of value) {
    const v = String(item || "").toLowerCase();
    if (v === "fibra") { expanded.push("fibra-rio-es", "fibra-leste"); }
    else if (SUPPORTED_REC_TYPES.includes(v)) { expanded.push(v); }
  }
  return Array.from(new Set(expanded));
}

function normalizeMonitorMode(value) {
  return value === "server" ? "server" : "local";
}

function normalizeRelayUrl(value) {
  const relayUrl = String(value || DEFAULTS.relayUrl).trim().replace(/\/+$/, "");
  if (!relayUrl.startsWith("https://")) throw new Error("O relay WhatsApp deve usar HTTPS.");
  return relayUrl;
}

function isServerMode(config) {
  return normalizeMonitorMode(config && config.monitorMode) === "server";
}

async function getConfig() {
  const saved = await storageGet(DEFAULTS);
  return {
    monitorMode: normalizeMonitorMode(saved.monitorMode),
    serverUrl: normalizeServerUrl(saved.serverUrl),
    pollMinutes: Math.max(0.5, Number(saved.pollMinutes || DEFAULTS.pollMinutes)),
    recTypes: normalizeRecTypes(saved.recTypes),
    soundEnabled: saved.soundEnabled !== false,
    soundType: ["beep", "bip", "urgent", "triple", "voice"].includes(saved.soundType) ? saved.soundType : "beep",
    relayUrl: normalizeRelayUrl(saved.relayUrl),
    relaySecret: String(saved.relaySecret || "")
  };
}

async function relayRequestConfig() {
  const config = await getConfig();
  if (config.relaySecret.length < 32) {
    throw new Error("Configure a credencial do relay WhatsApp nas opcoes da extensao.");
  }
  return config;
}

async function ensureAlarm() {
  const config = await getConfig();
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: config.pollMinutes });
  chrome.alarms.create(ETIT_ALARM, { periodInMinutes: ETIT_ALARM_MINUTES });
  await reschedulePendingEtitWhatsappAlarms();
  if (!isServerMode(config)) {
    chrome.alarms.clear(SSE_RECONNECT_ALARM);
  }
}

function trimObjectByValue(object, maxEntries) {
  const entries = Object.entries(object || {});
  if (entries.length <= maxEntries) return object || {};
  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  return Object.fromEntries(entries.slice(0, maxEntries));
}

function trimEtitWatch(watch) {
  const entries = Object.entries(watch || {});
  if (entries.length <= MAX_ETIT_WATCH_ITEMS) return watch || {};
  entries.sort((a, b) => Number(b[1] && b[1].detectedAtMs || 0) - Number(a[1] && a[1].detectedAtMs || 0));
  return Object.fromEntries(entries.slice(0, MAX_ETIT_WATCH_ITEMS));
}

function safeAlarmPart(value) {
  return String(value || "rec").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
}

function etitWhatsappAlarmName(recId) {
  return `${WHATSAPP_ALARM_PREFIX}${safeAlarmPart(recId)}`;
}

function findEtitWatchByAlarmName(watch, alarmName) {
  for (const [recId, item] of Object.entries(watch || {})) {
    if ((item && item.whatsapp20AlarmName) === alarmName) return { recId, item };
    if (etitWhatsappAlarmName(recId) === alarmName) return { recId, item };
  }
  return null;
}

async function scheduleEtitWhatsappAlarm(recId, item = {}) {
  if (!recId || (item && item.whatsapp20Sent)) return { ok: true, skipped: true };
  if (!chrome.alarms || typeof chrome.alarms.create !== "function") {
    return { ok: false, error: "API chrome.alarms indisponivel." };
  }
  const alarmName = etitWhatsappAlarmName(recId);
  const detectedAtMs = Number(item.detectedAtMs || Date.now());
  const dueAtMs = detectedAtMs + WHATSAPP_ETIT_WARNING_MS;
  const delayInMinutes = Math.max(WHATSAPP_ALARM_MIN_DELAY_MINUTES, (dueAtMs - Date.now()) / 60000);
  try { await chrome.alarms.clear(alarmName); } catch (_err) {}
  await chrome.alarms.create(alarmName, { delayInMinutes });
  return { ok: true, alarmName, dueAtMs, delayInMinutes };
}

async function reschedulePendingEtitWhatsappAlarms() {
  const state = await storageGet({ dpEtitWatch: {} });
  const watch = Object.assign({}, state.dpEtitWatch || {});
  for (const [recId, item] of Object.entries(watch)) {
    if (item && !item.whatsapp20Sent) await scheduleEtitWhatsappAlarm(recId, item).catch(() => {});
  }
}

async function clearPendingEtitWhatsappAlarms() {
  if (!chrome.alarms || typeof chrome.alarms.getAll !== "function") return;
  const alarms = await chrome.alarms.getAll();
  await Promise.all((alarms || [])
    .filter((alarm) => alarm.name && alarm.name.startsWith(WHATSAPP_ALARM_PREFIX))
    .map((alarm) => chrome.alarms.clear(alarm.name).catch(() => false)));
}

function etitWhatsappStatus(item, now = Date.now()) {
  if (!item) return "pendente";
  if (item.whatsapp20Sent) return item.whatsapp20Deduped ? "deduplicado" : "enviado";
  if (item.whatsapp20LastError) return "erro";
  const detectedAtMs = Number(item.detectedAtMs || 0);
  if (detectedAtMs && now - detectedAtMs >= WHATSAPP_ETIT_WARNING_MS) return "pronto";
  return "pendente";
}

function summarizeEtitWatch(watch) {
  const now = Date.now();
  return Object.values(watch || {})
    .filter((item) => item && item.recId)
    .sort((a, b) => Number(a.detectedAtMs || 0) - Number(b.detectedAtMs || 0))
    .slice(0, 5)
    .map((item) => {
      const detectedAtMs = Number(item.detectedAtMs || 0);
      const lastSeenAtMs = Number(item.lastSeenAtMs || 0);
      return {
        recId: item.recId || "",
        cfExec: item.cfExec || "",
        cliente: item.cliente || "",
        ageMinutes: detectedAtMs ? Math.max(0, Math.floor((now - detectedAtMs) / 60000)) : 0,
        lastSeenSeconds: lastSeenAtMs ? Math.max(0, Math.floor((now - lastSeenAtMs) / 1000)) : null,
        missingDpScans: Number(item.missingDpScans || 0),
        whatsappStatus: etitWhatsappStatus(item, now),
        whatsappError: item.whatsapp20LastError || ""
      };
    });
}

function normalizeCfExec(value) {
  return String(value || "").toUpperCase().replace(/\s*\/\s*/g, "/").trim();
}

function isDpEvent(event) {
  return normalizeCfExec(event && event.cfExec).startsWith("DP/");
}

async function setStatus(status) {
  await storageSet({
    lastStatus: Object.assign({
      updatedAt: new Date().toISOString()
    }, status)
  });
}

async function updateBadge(text, color) {
  try {
    await chrome.action.setBadgeText({ text: text || "" });
    if (color) await chrome.action.setBadgeBackgroundColor({ color });
  } catch (_err) {}
}

async function setBadgeState(state, count) {
  if (state === "reading") return updateBadge("R", "#2563eb");
  if (state === "no-tabs") return updateBadge("0", "#64748b");
  if (state === "error") return updateBadge("!", "#dc2626");
  if (state === "new") return updateBadge(String(Math.min(Number(count || 1), 99)), "#dc2626");
  return updateBadge("", "#2563eb");
}

function notificationMessage(event) {
  const lines = [];
  if (event.alertMessage) lines.push(event.alertMessage);
  lines.push(
    `REC: ${event.recId || "nao identificada"}`,
    `CF Exec.: ${event.cfExec || "nao identificado"}`
  );
  if (event.cidade) lines.push(`Cidade: ${event.cidade}`);
  if (event.cliente) lines.push(`Cliente: ${event.cliente}`);
  return lines.join("\n");
}

function createNotification(id, event) {
  return new Promise((resolve) => {
    chrome.notifications.create(id, {
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: event.title || "Nova REC",
      message: notificationMessage(event),
      priority: 2,
      requireInteraction: true
    }, (notificationId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }
      if (!notificationId) {
        resolve({ ok: false, error: "Chrome nao retornou id da notificacao." });
        return;
      }
      resolve({ ok: true, notificationId });
    });
  });
}

async function alertWindowUrl(event) {
  const config = await getConfig();
  const params = new URLSearchParams({
    alertTitle: event.alertTitle || event.title || "Nova REC",
    alertMessage: event.alertMessage || "",
    recId: event.recId || "REC nao identificada",
    cfExec: event.cfExec || "CF Exec. nao identificado",
    cidade: event.cidade || "",
    cliente: event.cliente || "",
    designacao: event.designacao || "",
    abertura: event.abertura || "",
    detectedAt: event.detectedAt || new Date().toISOString(),
    sound: event.soundEnabled === false ? "0" : (config.soundEnabled ? "1" : "0"),
    soundType: event.soundType || config.soundType || "beep"
  });
  return chrome.runtime.getURL(`alert.html?${params.toString()}`);
}

async function openAlertWindow(event) {
  if (!chrome.windows || typeof chrome.windows.create !== "function") {
    return { ok: false, error: "API chrome.windows indisponivel." };
  }
  const url = await alertWindowUrl(event);
  return new Promise((resolve) => {
    chrome.windows.create({
      url,
      type: "popup",
      focused: true,
      width: 460,
      height: event.alertMessage ? 340 : 300
    }, (createdWindow) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }
      if (!createdWindow) {
        resolve({ ok: false, error: "Chrome nao abriu a janela de alerta." });
        return;
      }
      resolve({ ok: true, windowId: createdWindow.id });
    });
  });
}

async function openAlertTab(event) {
  if (!chrome.tabs || typeof chrome.tabs.create !== "function") {
    return { ok: false, error: "API chrome.tabs indisponivel." };
  }
  const url = await alertWindowUrl(event);
  return new Promise((resolve) => {
    chrome.tabs.create({
      url,
      active: true
    }, (createdTab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }
      if (!createdTab) {
        resolve({ ok: false, error: "Chrome nao abriu a aba de alerta." });
        return;
      }
      resolve({ ok: true, tabId: createdTab.id });
    });
  });
}

async function notifyEvent(event) {
  // In-memory dedup: prevent SSE + poll from both notifying the same REC
  const recId = String(event.recId || "");
  const skipDedup = event && event.skipDedup === true;
  if (!skipDedup && recId && recentlyNotified.has(recId)) return { ok: true, skipped: true };
  if (!skipDedup && recId) {
    recentlyNotified.add(recId);
    setTimeout(() => recentlyNotified.delete(recId), 120000);
  }

  const safeId = String(event.id || event.recId || Date.now()).replace(/[^a-z0-9_-]+/gi, "-");

  // Try popup window first (richer alert with sound)
  const windowResult = await openAlertWindow(event);
  if (windowResult.ok) {
    return { ok: true, windowId: windowResult.windowId, notificationId: null, tabId: null };
  }

  // Window failed â€” try tab
  const tabResult = await openAlertTab(event);
  if (tabResult.ok) {
    return { ok: true, tabId: tabResult.tabId, windowId: null, notificationId: null };
  }

  // Window and tab both failed â€” fall back to OS notification
  const notifResult = await createNotification(`nova-rec-${safeId}`, event);
  if (notifResult.ok) {
    pendingAlerts.set(notifResult.notificationId, event);
    return { ok: true, notificationId: notifResult.notificationId, windowId: null, tabId: null };
  }

  throw new Error(windowResult.error || tabResult.error || notifResult.error || "Falha ao criar alerta.");
}

// Open alert window when user clicks OS notification
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const event = pendingAlerts.get(notificationId);
  if (event) {
    pendingAlerts.delete(notificationId);
    await openAlertWindow(event).catch(() => openAlertTab(event).catch(() => {}));
  }
  try { chrome.notifications.clear(notificationId); } catch (_e) {}
});

function detectRecType(event) {
  const cfExec = normalizeCfExec(event && event.cfExec);
  if (/\/NET\/FO\b/.test(cfExec)) {
    // Region = 3rd segment: DP/XXX/YY/NET/FO  â€”  AM=Rio, JM=ES/Vitoria
    const parts = cfExec.split("/");
    const region = parts.length >= 5 ? parts[2] : "";
    if (region === "AM" || region === "JM") return "fibra-rio-es";
    return "fibra-leste";
  }
  if (/\/NET\/BS\b/.test(cfExec)) return "bsod";
  return "";
}

function shouldNotifyEvent(event, config) {
  const cfExec = normalizeCfExec(event && event.cfExec);
  if (!cfExec.startsWith("DP/")) return false;
  if (!config.recTypes.length) return true;
  const activeTypes = config.recTypes;
  const eventType = detectRecType(event);
  return Boolean(eventType && activeTypes.includes(eventType));
}

async function fetchEvents(config, after, limit = 200) {
  const url = new URL("/api/events", config.serverUrl);
  url.searchParams.set("after", String(after));
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return {
    payload,
    events: Array.isArray(payload.events) ? payload.events.slice().sort((a, b) => Number(a.id) - Number(b.id)) : [],
    serverLastEventId: Number(payload.lastEventId || 0)
  };
}

async function pollEvents(source = "alarm") {
  const config = await getConfig();
  if (!isServerMode(config)) {
    await setStatus({
      ok: true,
      source,
      monitorMode: config.monitorMode,
      skipped: "Modo local ativo; a leitura acontece na aba EMBRATEL do usuario."
    });
    await updateBadge("", "#2563eb");
    return { ok: true, skipped: true, monitorMode: config.monitorMode };
  }
  const state = await storageGet({
    initialized: false,
    lastEventId: 0,
    notifiedRecIds: {}
  });

  const after = state.initialized ? Number(state.lastEventId || 0) : 0;

  try {
    let result = await fetchEvents(config, after, 200);
    let events = result.events;
    let serverLastEventId = result.serverLastEventId;
    let resetDetected = false;
    if (state.initialized && serverLastEventId < after) {
      resetDetected = true;
      result = await fetchEvents(config, 0, 200);
      events = result.events;
      serverLastEventId = result.serverLastEventId;
    }
    const lastEventId = Math.max(serverLastEventId, resetDetected ? 0 : after, ...events.map((event) => Number(event.id || 0)));

    if (!state.initialized) {
      await storageSet({
        initialized: true,
        lastEventId,
        notifiedRecIds: state.notifiedRecIds || {}
      });
      await setStatus({
        ok: true,
        source,
        serverUrl: config.serverUrl,
        bootstrapped: true,
        notifiedCount: 0,
        receivedCount: events.length,
        serverLastEventId,
        requestedAfter: after,
        lastEventId
      });
      await updateBadge("", "#2563eb");
      return { ok: true, bootstrapped: true, notifiedCount: 0, lastEventId };
    }

    const notifiedRecIds = Object.assign({}, state.notifiedRecIds || {});
    let notifiedCount = 0;
    let filteredCount = 0;
    let duplicateCount = 0;
    let eligibleCount = 0;
    let notificationError = null;
    let storedLastEventId = resetDetected ? 0 : after;
    for (const event of events) {
      const eventId = Number(event.id || 0);
      const recId = String(event.recId || "");
      if (!recId || notifiedRecIds[recId]) {
        duplicateCount += 1;
        storedLastEventId = Math.max(storedLastEventId, eventId);
        continue;
      }
      if (!shouldNotifyEvent(event, config)) {
        filteredCount += 1;
        storedLastEventId = Math.max(storedLastEventId, eventId);
        continue;
      }
      eligibleCount += 1;
      try {
        await notifyEvent(event);
        notifiedRecIds[recId] = Date.now();
        notifiedCount += 1;
        storedLastEventId = Math.max(storedLastEventId, eventId);
      } catch (err) {
        notificationError = err.message;
        break;
      }
    }

    await storageSet({
      lastEventId: notificationError ? storedLastEventId : lastEventId,
      notifiedRecIds: trimObjectByValue(notifiedRecIds, MAX_STORED_REC_IDS)
    });
    await setStatus({
      ok: true,
      source,
      serverUrl: config.serverUrl,
      receivedCount: events.length,
      eligibleCount,
      notifiedCount,
      filteredCount,
      duplicateCount,
      notificationError,
      resetDetected,
      requestedAfter: after,
      serverLastEventId,
      lastEventId: notificationError ? storedLastEventId : lastEventId
    });
    await updateBadge(notifiedCount ? String(Math.min(notifiedCount, 99)) : "", notifiedCount ? "#dc2626" : "#2563eb");
    return {
      ok: !notificationError,
      receivedCount: events.length,
      eligibleCount,
      notifiedCount,
      filteredCount,
      duplicateCount,
      notificationError,
      resetDetected,
      requestedAfter: after,
      serverLastEventId,
      lastEventId: notificationError ? storedLastEventId : lastEventId
    };
  } catch (err) {
    await setStatus({
      ok: false,
      source,
      serverUrl: config.serverUrl,
      error: err.message
    });
    await updateBadge("!", "#dc2626");
    return { ok: false, error: err.message };
  }
}

async function testNotification(values = {}) {
  const soundType = ["beep", "bip", "urgent", "triple", "voice"].includes(values.soundType) ? values.soundType : undefined;
  const result = await notifyEvent({
    id: `teste-${Date.now()}`,
    title: "Teste Nova REC",
    recId: "REC-TESTE/2026",
    cfExec: "DP/TESTE/CO/NET/FO",
    cliente: "Teste local",
    soundEnabled: values.soundEnabled !== false,
    soundType,
    skipDedup: true
  });
  await setStatus({
    ok: true,
    source: "test-notification",
    testNotification: true,
    notificationId: result.notificationId
  });
  await updateBadge("", "#2563eb");
  return { ok: true, notificationId: result.notificationId };
}

async function testWhatsappRelay() {
  const config = await relayRequestConfig();
  const response = await fetch(`${config.relayUrl}/api/test-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Secret": config.relaySecret
    },
    body: JSON.stringify({
      text: [
        "Teste EMBRATEL Nova REC",
        "Enviado pela extensao Chrome/Edge.",
        `Data: ${new Date().toISOString()}`
      ].join("\n")
    })
  });
  const text = await response.text();
  let payload = text;
  try { payload = JSON.parse(text); } catch (_err) {}
  if (!response.ok) {
    throw new Error(`Relay teste WhatsApp HTTP ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }
  await setStatus({
    ok: true,
    source: "test-whatsapp",
    whatsappTest: true,
    relayResult: payload,
    whatsappWarnings: payload && payload.evolution && payload.evolution.sentCount || 0,
    whatsappErrors: payload && payload.evolution && payload.evolution.failedCount || 0
  });
  return { ok: true, relayResult: payload };
}

async function notifyRecentEvents() {
  const config = await getConfig();
  if (!isServerMode(config)) {
    return { ok: false, error: "Notificar recentes depende do modo servidor. No modo local, abra a tela EMBRATEL e aguarde a extensao monitorar a tabela." };
  }
  const state = await storageGet({
    notifiedRecIds: {}
  });
  const { events, serverLastEventId } = await fetchEvents(config, 0, 20);
  const notifiedRecIds = Object.assign({}, state.notifiedRecIds || {});
  let notifiedCount = 0;
  let filteredCount = 0;
  let duplicateCount = 0;
  for (const event of events) {
    const recId = String(event.recId || "");
    if (!recId || notifiedRecIds[recId]) {
      duplicateCount += 1;
      continue;
    }
    if (!shouldNotifyEvent(event, config)) {
      filteredCount += 1;
      continue;
    }
    await notifyEvent(event);
    notifiedRecIds[recId] = Date.now();
    notifiedCount += 1;
  }
  await storageSet({
    lastEventId: Math.max(serverLastEventId, ...events.map((event) => Number(event.id || 0))),
    initialized: true,
    notifiedRecIds: trimObjectByValue(notifiedRecIds, MAX_STORED_REC_IDS)
  });
  await setStatus({
    ok: true,
    source: "notify-recent",
    serverUrl: config.serverUrl,
    receivedCount: events.length,
    notifiedCount,
    filteredCount,
    duplicateCount,
    lastEventId: serverLastEventId
  });
  return { ok: true, receivedCount: events.length, notifiedCount, filteredCount, duplicateCount, lastEventId: serverLastEventId };
}

async function getStatus() {
  const config = await getConfig();
  const state = await storageGet({
    initialized: false,
    lastEventId: 0,
    notifiedRecIds: {},
    lastStatus: null,
    localLastStatus: null,
    localMonitorInitialized: false,
    localSeenRecIds: {},
    dpEtitWatch: {}
  });
  return {
    ok: true,
    config: Object.assign({}, config, {
      relaySecret: undefined,
      relaySecretConfigured: config.relaySecret.length >= 32
    }),
    initialized: Boolean(state.initialized),
    lastEventId: Number(state.lastEventId || 0),
    notifiedRecCount: Object.keys(state.notifiedRecIds || {}).length,
    localInitialized: Boolean(state.localMonitorInitialized),
    localSeenRecCount: Object.keys(state.localSeenRecIds || {}).length,
    etitWatchCount: Object.keys(state.dpEtitWatch || {}).length,
    etitWatchItems: summarizeEtitWatch(state.dpEtitWatch || {}),
    lastStatus: state.lastStatus,
    localLastStatus: state.localLastStatus
  };
}

async function saveConfig(values) {
  const current = await getConfig();
  const monitorMode = normalizeMonitorMode(values.monitorMode);
  const serverUrl = normalizeServerUrl(values.serverUrl);
  const pollMinutes = Math.max(0.5, Number(values.pollMinutes || DEFAULTS.pollMinutes));
  const recTypes = normalizeRecTypes(values.recTypes);
  const soundEnabled = values.soundEnabled !== false;
  const soundType = ["beep", "bip", "urgent", "triple", "voice"].includes(values.soundType) ? values.soundType : "beep";
  const relayUrl = normalizeRelayUrl(values.relayUrl || current.relayUrl);
  const relaySecret = String(values.relaySecret || current.relaySecret);
  if (relaySecret && relaySecret.length < 32) throw new Error("A credencial do relay deve ter pelo menos 32 caracteres.");
  await storageSet({ monitorMode, serverUrl, pollMinutes, recTypes, soundEnabled, soundType, relayUrl, relaySecret });
  await ensureAlarm();
  disconnectSSE();
  if (monitorMode === "server") connectSSE();
  else await setStatus({ ok: true, source: "save-config", monitorMode });
  return getStatus();
}

async function resetLocalBaseline() {
  recentlyNotified.clear();
  pendingAlerts.clear();
  await clearPendingEtitWhatsappAlarms();
  await storageRemove([
    "initialized",
    "lastEventId",
    "notifiedRecIds",
    "lastStatus",
    "localMonitorInitialized",
    "localSeenRecIds",
    "localLastStatus",
    "dpEtitWatch"
  ]);
  await updateBadge("", "#2563eb");
  const config = await getConfig();
  if (isServerMode(config)) return pollEvents("reset");
  await setStatus({ ok: true, source: "reset", monitorMode: config.monitorMode });
  return getStatus();
}

// â”€â”€ SSE (Server-Sent Events) for instant push â”€â”€
let sseAbort = null;
let sseRetryTimer = null;
const SSE_RETRY_MS = 5000;

async function connectSSE() {
  // Clean up previous connection
  if (sseAbort) { try { sseAbort.abort(); } catch (_e) {} }
  if (sseRetryTimer) { clearTimeout(sseRetryTimer); sseRetryTimer = null; }
  try { chrome.alarms.clear(SSE_RECONNECT_ALARM); } catch (_e) {}

  const config = await getConfig();
  if (!isServerMode(config)) return;
  const url = `${config.serverUrl}/api/stream`;
  sseAbort = new AbortController();

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: sseAbort.signal
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE frames
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        if (!part.trim() || part.trim().startsWith(":")) continue;   // comment / ping
        const eventMatch = part.match(/^event:\s*(.+)$/m);
        const dataMatch = part.match(/^data:\s*(.+)$/m);
        if (!eventMatch || !dataMatch) continue;
        const eventName = eventMatch[1].trim();
        if (eventName === "nova-rec") {
          // New REC pushed from server â€” process immediately
          try {
            const data = JSON.parse(dataMatch[1]);
            if (Array.isArray(data.events) && data.events.length > 0) {
              await handlePushedEvents(data.events);
            }
          } catch (_parseErr) {}
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") return;   // intentional disconnect
  }
  // Reconnect via alarm (survives service-worker sleep)
  try { chrome.alarms.create(SSE_RECONNECT_ALARM, { delayInMinutes: 0.1 }); } catch (_e) {}
}

async function handlePushedEvents(events) {
  const config = await getConfig();
  if (!isServerMode(config)) return;
  const state = await storageGet({
    initialized: false,
    lastEventId: 0,
    notifiedRecIds: {}
  });
  if (!state.initialized) return;  // wait for first normal poll

  const notifiedRecIds = Object.assign({}, state.notifiedRecIds || {});
  let notifiedCount = 0;
  let storedLastEventId = Number(state.lastEventId || 0);

  for (const event of events) {
    const eventId = Number(event.id || 0);
    const recId = String(event.recId || "");
    if (!recId || notifiedRecIds[recId]) continue;
    if (!shouldNotifyEvent(event, config)) {
      storedLastEventId = Math.max(storedLastEventId, eventId);
      continue;
    }
    try {
      await notifyEvent(event);
      notifiedRecIds[recId] = Date.now();
      notifiedCount += 1;
      storedLastEventId = Math.max(storedLastEventId, eventId);
    } catch (_err) { break; }
  }

  if (notifiedCount > 0) {
    await storageSet({
      lastEventId: storedLastEventId,
      notifiedRecIds: trimObjectByValue(notifiedRecIds, MAX_STORED_REC_IDS)
    });
    await updateBadge(String(Math.min(notifiedCount, 99)), "#dc2626");
  }
}

function disconnectSSE() {
  if (sseAbort) { try { sseAbort.abort(); } catch (_e) {} sseAbort = null; }
  if (sseRetryTimer) { clearTimeout(sseRetryTimer); sseRetryTimer = null; }
  try { chrome.alarms.clear(SSE_RECONNECT_ALARM); } catch (_e) {}
}

async function setLocalMonitorStatus(status) {
  await storageSet({
    localLastStatus: Object.assign({
      updatedAt: new Date().toISOString()
    }, status || {})
  });
  return { ok: true };
}

async function startEtitWatch(event) {
  if (!isDpEvent(event)) return { ok: true, skipped: true };
  const recId = String(event && event.recId || "");
  if (!recId) return { ok: false, error: "REC sem identificador para ETIT." };
  const now = Date.now();
  const state = await storageGet({ dpEtitWatch: {} });
  const watch = Object.assign({}, state.dpEtitWatch || {});
  const existing = watch[recId] || {};
  const detectedAtMs = existing.detectedAtMs ? existing.detectedAtMs : now;
  const alarmName = etitWhatsappAlarmName(recId);
  watch[recId] = Object.assign({}, watch[recId] || {}, {
    recId,
    cfExec: event.cfExec || "",
    cliente: event.cliente || "",
    designacao: event.designacao || "",
    abertura: event.abertura || "",
    sourceUrl: event.sourceUrl || "",
    detectedAtMs,
    detectedAt: existing.detectedAt ? existing.detectedAt : (event.detectedAt || new Date(now).toISOString()),
    lastSeenAtMs: now,
    lastSeenAt: new Date(now).toISOString(),
    missingDpScans: 0,
    whatsapp20AlarmName: alarmName,
    whatsapp20DueAtMs: detectedAtMs + WHATSAPP_ETIT_WARNING_MS,
    whatsapp20DueAt: new Date(detectedAtMs + WHATSAPP_ETIT_WARNING_MS).toISOString(),
    warned25: Boolean(watch[recId] && watch[recId].warned25)
  });
  await storageSet({ dpEtitWatch: trimEtitWatch(watch) });
  await scheduleEtitWhatsappAlarm(recId, watch[recId]).catch(() => {});
  return { ok: true };
}

async function sendWhatsappEtitAlert(item, elapsedMinutes) {
  const config = await relayRequestConfig();
  const response = await fetch(`${config.relayUrl}/api/etit-alert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Secret": config.relaySecret
    },
    body: JSON.stringify({
      recId: item.recId,
      cfExec: item.cfExec || "",
      cliente: item.cliente || "",
      designacao: item.designacao || "",
      abertura: item.abertura || "",
      detectedAt: item.detectedAt || "",
      elapsedMinutes,
      source: "chrome-extension"
    })
  });
  const text = await response.text();
  let payload = text;
  try { payload = JSON.parse(text); } catch (_err) {}
  if (!response.ok) {
    throw new Error(`Relay WhatsApp HTTP ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }
  return payload;
}

function buildRecRowMaps(rows) {
  const allRows = new Map();
  const activeDpRows = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const recId = String(row && row.recId || "");
    if (!recId) continue;
    allRows.set(recId, row);
    if (isDpEvent(row)) activeDpRows.set(recId, row);
  }
  return { allRows, activeDpRows };
}

async function maybeSendEtitWarnings(watch, recId, now, counters, options = {}) {
  const item = watch[recId];
  if (!item) return false;
  const allowWhatsapp = options.allowWhatsapp === true;

  const detectedAtMs = Number(item.detectedAtMs || 0);
  const missingDpScans = Number(item.missingDpScans || 0);
  if (!detectedAtMs || missingDpScans > 0) {
    counters.etitStaleCount += 1;
    return false;
  }

  let changed = false;
  if (allowWhatsapp && !item.whatsapp20Sent && now - detectedAtMs >= WHATSAPP_ETIT_WARNING_MS) {
    try {
      const elapsedMinutes = Math.max(20, Math.floor((now - detectedAtMs) / 60000));
      const relayResult = await sendWhatsappEtitAlert(item, elapsedMinutes);
      item.whatsapp20Sent = true;
      item.whatsapp20SentAtMs = now;
      item.whatsapp20SentAt = new Date(now).toISOString();
      item.whatsapp20Deduped = Boolean(relayResult && relayResult.deduped);
      delete item.whatsapp20LastError;
      delete item.whatsapp20LastErrorAtMs;
      try { await chrome.alarms.clear(item.whatsapp20AlarmName || etitWhatsappAlarmName(recId)); } catch (_err) {}
      changed = true;
      counters.whatsappWarnings += 1;
    } catch (err) {
      item.whatsapp20LastError = err.message;
      item.whatsapp20LastErrorAtMs = now;
      item.whatsapp20LastErrorAt = new Date(now).toISOString();
      await scheduleEtitWhatsappAlarm(recId, Object.assign({}, item, {
        detectedAtMs: now - WHATSAPP_ETIT_WARNING_MS + WHATSAPP_ALARM_RETRY_MINUTES * 60 * 1000
      })).catch(() => {});
      changed = true;
      counters.whatsappErrors += 1;
    }
  }

  if (!item.warned25 && now - detectedAtMs >= ETIT_WARNING_MS) {
    const alertMessage = `${recId} 25min no DP, falta 5 min para perder o ETIT`;
    await createNotification(`etit-25-${recId}-${now}`.replace(/[^a-z0-9_-]+/gi, "-"), {
      title: "REC 25min no DP",
      alertMessage,
      recId,
      cfExec: item.cfExec || "",
      cliente: item.cliente || "",
      detectedAt: new Date(now).toISOString()
    });
    item.warned25 = true;
    item.warned25AtMs = now;
    item.warned25At = new Date(now).toISOString();
    changed = true;
    counters.etitWarnings += 1;
  }

  return changed;
}

async function checkEtitWatchDeadlines(source = "etit-deadline") {
  const now = Date.now();
  const state = await storageGet({ dpEtitWatch: {} });
  const watch = Object.assign({}, state.dpEtitWatch || {});
  const counters = {
    etitWarnings: 0,
    whatsappWarnings: 0,
    whatsappErrors: 0,
    etitStaleCount: 0,
    removedExpired: 0,
    removedMissing: 0
  };
  let changed = false;

  for (const [recId, item] of Object.entries(watch)) {
    const detectedAtMs = Number(item && item.detectedAtMs || 0);
    if (!detectedAtMs || now - detectedAtMs > ETIT_WATCH_TTL_MS) {
      try { await chrome.alarms.clear(item.whatsapp20AlarmName || etitWhatsappAlarmName(recId)); } catch (_err) {}
      delete watch[recId];
      counters.removedExpired += 1;
      changed = true;
      continue;
    }
    if (Number(item.missingDpScans || 0) >= ETIT_MISSING_SCAN_LIMIT) {
      try { await chrome.alarms.clear(item.whatsapp20AlarmName || etitWhatsappAlarmName(recId)); } catch (_err) {}
      delete watch[recId];
      counters.removedMissing += 1;
      changed = true;
      continue;
    }
    if (await maybeSendEtitWarnings(watch, recId, now, counters)) changed = true;
  }

  if (changed) await storageSet({ dpEtitWatch: trimEtitWatch(watch) });
  if (counters.etitWarnings) await setBadgeState("new", counters.etitWarnings);
  return Object.assign({
    ok: counters.whatsappErrors === 0,
    source,
    watchedCount: Object.keys(watch).length
  }, counters);
}

async function sendScheduledEtitWhatsappAlert(alarmName) {
  const state = await storageGet({ dpEtitWatch: {} });
  const watch = Object.assign({}, state.dpEtitWatch || {});
  const match = findEtitWatchByAlarmName(watch, alarmName);
  if (!match) return { ok: true, skipped: true, reason: "Watch ETIT nao encontrado." };

  const { recId, item } = match;
  const now = Date.now();
  if (item.whatsapp20Sent) return { ok: true, skipped: true, reason: "WhatsApp ja enviado." };
  if (!isDpEvent(item) || Number(item.missingDpScans || 0) >= ETIT_MISSING_SCAN_LIMIT) {
    try { await chrome.alarms.clear(alarmName); } catch (_err) {}
    delete watch[recId];
    await storageSet({ dpEtitWatch: trimEtitWatch(watch) });
    return { ok: true, skipped: true, reason: "REC nao confirmada no DP." };
  }
  if (Number(item.missingDpScans || 0) > 0) {
    await scheduleEtitWhatsappAlarm(recId, Object.assign({}, item, {
      detectedAtMs: now - WHATSAPP_ETIT_WARNING_MS + WHATSAPP_ALARM_RETRY_MINUTES * 60 * 1000
    })).catch(() => {});
    await setStatus({
      ok: true,
      source: "whatsapp-alarm",
      recId,
      etitStaleCount: Number(item.missingDpScans || 0),
      message: "REC sem confirmacao DP nesta leitura; envio WhatsApp reagendado."
    });
    return { ok: true, retry: true, reason: "Aguardando confirmacao DP." };
  }

  const detectedAtMs = Number(item.detectedAtMs || 0);
  if (detectedAtMs && now - detectedAtMs < WHATSAPP_ETIT_WARNING_MS) {
    await scheduleEtitWhatsappAlarm(recId, item).catch(() => {});
    return { ok: true, rescheduled: true, reason: "Ainda nao completou 20min." };
  }

  try {
    const elapsedMinutes = Math.max(20, Math.floor((now - detectedAtMs) / 60000));
    const relayResult = await sendWhatsappEtitAlert(item, elapsedMinutes);
    watch[recId] = Object.assign({}, item, {
      whatsapp20Sent: true,
      whatsapp20SentAtMs: now,
      whatsapp20SentAt: new Date(now).toISOString(),
      whatsapp20Deduped: Boolean(relayResult && relayResult.deduped),
      whatsapp20RelayResult: relayResult
    });
    delete watch[recId].whatsapp20LastError;
    delete watch[recId].whatsapp20LastErrorAtMs;
    await storageSet({ dpEtitWatch: trimEtitWatch(watch) });
    await setStatus({
      ok: true,
      source: "whatsapp-alarm",
      recId,
      cfExec: item.cfExec || "",
      whatsappWarnings: 1,
      etitWatchCount: Object.keys(watch).length
    });
    return { ok: true, sent: true, recId };
  } catch (err) {
    watch[recId] = Object.assign({}, item, {
      whatsapp20LastError: err.message,
      whatsapp20LastErrorAtMs: now,
      whatsapp20LastErrorAt: new Date(now).toISOString()
    });
    await storageSet({ dpEtitWatch: trimEtitWatch(watch) });
    await scheduleEtitWhatsappAlarm(recId, Object.assign({}, watch[recId], {
      detectedAtMs: now - WHATSAPP_ETIT_WARNING_MS + WHATSAPP_ALARM_RETRY_MINUTES * 60 * 1000
    })).catch(() => {});
    await setStatus({
      ok: false,
      source: "whatsapp-alarm",
      recId,
      cfExec: item.cfExec || "",
      whatsappErrors: 1,
      error: err.message
    });
    return { ok: false, error: err.message, recId };
  }
}

async function handleLocalRecSnapshot(rows) {
  const now = Date.now();
  const { allRows, activeDpRows } = buildRecRowMaps(rows);

  const state = await storageGet({ dpEtitWatch: {} });
  const watch = Object.assign({}, state.dpEtitWatch || {});
  const counters = {
    etitWarnings: 0,
    whatsappWarnings: 0,
    whatsappErrors: 0,
    etitStaleCount: 0,
    removedExpired: 0,
    removedMissing: 0,
    removedOutOfDp: 0
  };
  let changed = false;

  for (const [recId, item] of Object.entries(watch)) {
    const detectedAtMs = Number(item.detectedAtMs || 0);
    if (!detectedAtMs || now - detectedAtMs > ETIT_WATCH_TTL_MS) {
      try { await chrome.alarms.clear(item.whatsapp20AlarmName || etitWhatsappAlarmName(recId)); } catch (_err) {}
      delete watch[recId];
      counters.removedExpired += 1;
      changed = true;
      continue;
    }

    const current = activeDpRows.get(recId);
    if (!current) {
      const currentAnyState = allRows.get(recId);
      if (currentAnyState) {
        try { await chrome.alarms.clear(item.whatsapp20AlarmName || etitWhatsappAlarmName(recId)); } catch (_err) {}
        delete watch[recId];
        counters.removedOutOfDp += 1;
        changed = true;
        continue;
      }

      const missingDpScans = Number(item.missingDpScans || 0) + 1;
      if (missingDpScans >= ETIT_MISSING_SCAN_LIMIT) {
        try { await chrome.alarms.clear(item.whatsapp20AlarmName || etitWhatsappAlarmName(recId)); } catch (_err) {}
        delete watch[recId];
        counters.removedMissing += 1;
        changed = true;
        continue;
      }
      watch[recId] = Object.assign({}, item, {
        missingDpScans,
        lastMissingAtMs: now,
        lastMissingAt: new Date(now).toISOString()
      });
      changed = true;
      continue;
    }

    watch[recId] = Object.assign({}, item, {
      cfExec: current.cfExec || item.cfExec || "",
      cliente: current.cliente || item.cliente || "",
      designacao: current.designacao || item.designacao || "",
      abertura: current.abertura || item.abertura || "",
      sourceUrl: current.sourceUrl || item.sourceUrl || "",
      lastSeenAtMs: now,
      lastSeenAt: new Date(now).toISOString(),
      missingDpScans: 0
    });
    changed = true;

    if (await maybeSendEtitWarnings(watch, recId, now, counters)) changed = true;
  }

  if (changed) await storageSet({ dpEtitWatch: trimEtitWatch(watch) });
  if (counters.etitWarnings) await setBadgeState("new", counters.etitWarnings);
  return Object.assign({
    ok: counters.whatsappErrors === 0,
    activeDpCount: activeDpRows.size,
    watchedCount: Object.keys(watch).length
  }, counters);
}

async function handleLocalRecDetected(event) {
  const config = await getConfig();
  const state = await storageGet({
    notifiedRecIds: {}
  });
  const recId = String(event && event.recId || "");
  const notifiedRecIds = Object.assign({}, state.notifiedRecIds || {});
  if (!recId) return { ok: false, error: "Evento local sem Num.Recup." };
  if (notifiedRecIds[recId]) {
    if (isDpEvent(event)) await startEtitWatch(event);
    await setStatus({
      ok: true,
      source: "local-monitor",
      monitorMode: config.monitorMode,
      duplicateCount: 1,
      notifiedCount: 0
    });
    return { ok: true, duplicate: true };
  }
  if (!shouldNotifyEvent(event, config)) {
    if (isDpEvent(event)) await startEtitWatch(event);
    notifiedRecIds[recId] = Date.now();
    await storageSet({ notifiedRecIds: trimObjectByValue(notifiedRecIds, MAX_STORED_REC_IDS) });
    await setStatus({
      ok: true,
      source: "local-monitor",
      monitorMode: config.monitorMode,
      receivedCount: 1,
      filteredCount: 1,
      notifiedCount: 0,
      recId,
      cfExec: event.cfExec || ""
    });
    return { ok: true, filtered: true };
  }

  await startEtitWatch(event);
  await notifyEvent(Object.assign({
    id: `local-${recId}-${Date.now()}`,
    title: "Nova REC"
  }, event));
  notifiedRecIds[recId] = Date.now();
  await storageSet({ notifiedRecIds: trimObjectByValue(notifiedRecIds, MAX_STORED_REC_IDS) });
  await setStatus({
    ok: true,
    source: "local-monitor",
    monitorMode: config.monitorMode,
    receivedCount: 1,
    eligibleCount: 1,
    notifiedCount: 1,
    recId,
    cfExec: event.cfExec || ""
  });
  await setBadgeState("new", 1);
  return { ok: true, notified: true };
}

async function triggerLocalScans(source) {
  if (!chrome.tabs || typeof chrome.tabs.query !== "function") {
    return { ok: false, error: "API chrome.tabs indisponivel." };
  }
  await setBadgeState("reading");

  const tabs = await new Promise((resolve) => {
    chrome.tabs.query({ url: EMBRATEL_TAB_URLS }, (items) => {
      resolve(Array.isArray(items) ? items : []);
    });
  });

  async function sendScanMessage(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: "force-local-scan", reason: source }, (response) => {
        const error = chrome.runtime.lastError;
        resolve(error ? { ok: false, error: error.message } : (response || { ok: true }));
      });
    });
  }

  async function injectLocalMonitor(tabId) {
    if (!chrome.scripting || typeof chrome.scripting.executeScript !== "function") {
      return { ok: false, error: "Permissao/API chrome.scripting indisponivel." };
    }
    return new Promise((resolve) => {
      chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["local-monitor.js"]
      }, () => {
        const error = chrome.runtime.lastError;
        resolve(error ? { ok: false, error: error.message } : { ok: true });
      });
    });
  }

  let sent = 0;
  let failed = 0;
  let injected = 0;
  let notifiedDuringScan = 0;
  let etitWarnings = 0;
  let whatsappWarnings = 0;
  let whatsappErrors = 0;
  const errors = [];
  for (const tab of tabs) {
    if (!tab.id) continue;
    let result = await sendScanMessage(tab.id);
    if (!result.ok && /receiving end does not exist|could not establish connection/i.test(String(result.error || ""))) {
      const injection = await injectLocalMonitor(tab.id);
      if (injection.ok) {
        injected += 1;
        result = await sendScanMessage(tab.id);
      } else {
        errors.push(injection.error);
      }
    }
    if (result && result.ok) {
      sent += 1;
      etitWarnings += Number(result.etitWarnings || 0);
      notifiedDuringScan += Number(result.confirmedEvents || 0) + Number(result.etitWarnings || 0);
      whatsappWarnings += Number(result.whatsappWarnings || 0);
      whatsappErrors += Number(result.whatsappErrors || 0);
    }
    else {
      failed += 1;
      if (result && result.error) errors.push(result.error);
    }
  }

  await setStatus({
    ok: failed === 0,
    source,
    monitorMode: "local",
    localTabs: tabs.length,
    scansRequested: sent,
    monitorsInjected: injected,
    scanRequestFailures: failed,
    notifiedDuringScan,
    etitWarnings,
    whatsappWarnings,
    whatsappErrors,
    error: failed && !sent ? `Nenhuma aba EMBRATEL respondeu ao pedido de leitura. ${errors[0] || ""}`.trim() : undefined
  });
  if (!tabs.length) await setBadgeState("no-tabs");
  else if (failed && !sent) await setBadgeState("error");
  else if (notifiedDuringScan) await setBadgeState("new", notifiedDuringScan);
  else await setBadgeState("idle");
  return { ok: failed === 0, localTabs: tabs.length, scansRequested: sent, monitorsInjected: injected, scanRequestFailures: failed, notifiedDuringScan, etitWarnings, whatsappWarnings, whatsappErrors, errors: errors.slice(0, 3) };
}

async function runEtitWatchTick(source = "etit-alarm") {
  if (etitTickRunning) return { ok: true, skipped: true, reason: "ETIT tick ja em andamento." };
  etitTickRunning = true;
  try {
    const scanResult = await triggerLocalScans(source).catch((err) => ({ ok: false, error: err.message }));
    let deadlineResult;
    if (Number(scanResult.localTabs || 0) > 0 && Number(scanResult.scansRequested || 0) > 0) {
      deadlineResult = await checkEtitWatchDeadlines(source).catch((err) => ({ ok: false, error: err.message, whatsappErrors: 1 }));
    } else {
      const state = await storageGet({ dpEtitWatch: {} });
      deadlineResult = {
        ok: scanResult.ok !== false,
        skipped: true,
        reason: "Sem leitura SIR confirmada para validar ETIT.",
        watchedCount: Object.keys(state.dpEtitWatch || {}).length,
        etitWarnings: 0,
        whatsappWarnings: 0,
        whatsappErrors: 0,
        etitStaleCount: 0,
        removedExpired: 0,
        removedMissing: 0
      };
    }
    const ok = scanResult.ok !== false && deadlineResult.ok !== false;
    await setStatus({
      ok,
      source,
      monitorMode: "local",
      localTabs: Number(scanResult.localTabs || 0),
      scansRequested: Number(scanResult.scansRequested || 0),
      monitorsInjected: Number(scanResult.monitorsInjected || 0),
      scanRequestFailures: Number(scanResult.scanRequestFailures || 0),
      notifiedDuringScan: Number(scanResult.notifiedDuringScan || 0),
      etitWatchCount: Number(deadlineResult.watchedCount || 0),
      etitWarnings: Number(scanResult.etitWarnings || 0) + Number(deadlineResult.etitWarnings || 0),
      whatsappWarnings: Number(scanResult.whatsappWarnings || 0) + Number(deadlineResult.whatsappWarnings || 0),
      whatsappErrors: Number(scanResult.whatsappErrors || 0) + Number(deadlineResult.whatsappErrors || 0),
      etitStaleCount: Number(deadlineResult.etitStaleCount || 0),
      removedExpired: Number(deadlineResult.removedExpired || 0),
      removedMissing: Number(deadlineResult.removedMissing || 0),
      error: scanResult.error || deadlineResult.error || undefined
    });
    if (!ok) await setBadgeState("error");
    return { ok, scanResult, deadlineResult };
  } finally {
    etitTickRunning = false;
  }
}

async function bootExtension(source) {
  await ensureAlarm();
  const config = await getConfig();
  if (isServerMode(config)) {
    await pollEvents(source);
    await connectSSE();
    return;
  }
  disconnectSSE();
  await setStatus({
    ok: true,
    source,
    monitorMode: config.monitorMode,
    message: "Modo local ativo. Abra a tela EMBRATEL logada para a extensao monitorar."
  });
  await updateBadge("", "#2563eb");
  await triggerLocalScans(source).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  storageGet(DEFAULTS).then((saved) => {
    return storageSet({
      monitorMode: normalizeMonitorMode(saved.monitorMode),
      serverUrl: saved.serverUrl || DEFAULTS.serverUrl,
      pollMinutes: saved.pollMinutes || DEFAULTS.pollMinutes,
      recTypes: normalizeRecTypes(saved.recTypes),
      soundEnabled: saved.soundEnabled !== false,
      soundType: ["beep", "bip", "urgent", "triple", "voice"].includes(saved.soundType) ? saved.soundType : "beep",
      relayUrl: saved.relayUrl || DEFAULTS.relayUrl,
      relaySecret: saved.relaySecret || ""
    });
  }).then(() => bootExtension("install"));
});

chrome.runtime.onStartup.addListener(() => {
  bootExtension("startup");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name && alarm.name.startsWith(WHATSAPP_ALARM_PREFIX)) {
    sendScheduledEtitWhatsappAlert(alarm.name)
      .catch((err) => setStatus({ ok: false, source: "whatsapp-alarm", error: err.message }));
    return;
  }
  if (alarm.name === SSE_RECONNECT_ALARM) {
    connectSSE();
    return;
  }
  if (alarm.name === ETIT_ALARM) {
    getConfig().then((config) => {
      if (!isServerMode(config)) return runEtitWatchTick("etit-alarm");
      return Promise.resolve({ ok: true, skipped: true, monitorMode: config.monitorMode });
    }).catch((err) => setStatus({ ok: false, source: "etit-alarm", error: err.message }));
    return;
  }
  if (alarm.name === POLL_ALARM) {
    getConfig().then((config) => {
      if (!isServerMode(config)) return triggerLocalScans("alarm");
      pollEvents("alarm");
      // Ensure SSE stays connected (service worker may have restarted)
      if (!sseAbort || sseAbort.signal.aborted) connectSSE();
    });
  }
});

bootExtension("worker-start").catch((err) => {
  setStatus({ ok: false, source: "worker-start", error: err.message });
  updateBadge("!", "#dc2626");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action = message && message.action;
  let job;
  if (action === "get-status") job = getStatus();
  else if (action === "save-config") job = saveConfig(message.values || {});
  else if (action === "poll-now") job = getConfig().then((config) => isServerMode(config) ? pollEvents("manual") : triggerLocalScans("manual"));
  else if (action === "test-notification") job = testNotification(message.values || {});
  else if (action === "test-whatsapp") job = testWhatsappRelay();
  else if (action === "notify-recent") job = notifyRecentEvents();
  else if (action === "reset-baseline") job = resetLocalBaseline();
  else if (action === "local-monitor-status") job = setLocalMonitorStatus(message.status || {});
  else if (action === "local-rec-snapshot") job = handleLocalRecSnapshot(message.rows || []);
  else if (action === "local-rec-detected") job = handleLocalRecDetected(message.event || {});
  else job = Promise.resolve({ ok: false, error: "Acao desconhecida" });

  job.then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
  return true;
});
