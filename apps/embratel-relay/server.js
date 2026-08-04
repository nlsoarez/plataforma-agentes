"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const net = require("node:net");
const tls = require("node:tls");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8788);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const EVOLUTION_BASE_URL = String(process.env.EVOLUTION_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || "";
const EVOLUTION_TOKEN = process.env.EVOLUTION_TOKEN || "";
const FO_WHATSAPP_GROUP_ID = process.env.WHATSAPP_FO_GROUP_ID || "";
const BS_WHATSAPP_GROUP_ID = process.env.WHATSAPP_BS_GROUP_ID || "";
const DEFAULT_WHATSAPP_GROUP_IDS = [
  FO_WHATSAPP_GROUP_ID
];
const WHATSAPP_GROUP_IDS = parseWhatsappGroupIds(process.env.WHATSAPP_GROUP_IDS || process.env.WHATSAPP_GROUP_ID);
const RELAY_SHARED_SECRET = process.env.RELAY_SHARED_SECRET || "";
const DEDUP_TTL_MS = Number(process.env.DEDUP_TTL_MS || 6 * 60 * 60 * 1000);
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "data", "dedup-state.json");
const REDIS_URL = process.env.REDIS_URL || "";
const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || "embratel-rec-relay";

validateRuntimeConfig();

let state = { sent: {} };
let stateLoaded = false;

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Relay-Secret"
  });
  res.end(body);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeRecId(value) {
  const match = cleanText(value).toUpperCase().match(/\bREC-\d+\/\d+\b/);
  return match ? match[0] : "";
}

function normalizeCfExec(value) {
  return cleanText(value).toUpperCase().replace(/\s*\/\s*/g, "/");
}

function parseWhatsappGroupIds(value) {
  const ids = String(value || "")
    .split(/[,\s;]+/)
    .map(cleanText)
    .filter(Boolean);
  const selected = ids.length ? ids : DEFAULT_WHATSAPP_GROUP_IDS;
  return Array.from(new Set(selected));
}

function validateRuntimeConfig() {
  const missing = [
    ["EVOLUTION_BASE_URL", EVOLUTION_BASE_URL],
    ["EVOLUTION_INSTANCE", EVOLUTION_INSTANCE],
    ["EVOLUTION_TOKEN", EVOLUTION_TOKEN],
    ["WHATSAPP_FO_GROUP_ID", FO_WHATSAPP_GROUP_ID],
    ["WHATSAPP_BS_GROUP_ID", BS_WHATSAPP_GROUP_ID],
    ["RELAY_SHARED_SECRET", RELAY_SHARED_SECRET]
  ].filter(([, value]) => !String(value || "").trim()).map(([name]) => name);
  if (missing.length) throw new Error(`Variaveis obrigatorias ausentes: ${missing.join(", ")}`);
  if (RELAY_SHARED_SECRET.length < 32) throw new Error("RELAY_SHARED_SECRET deve ter pelo menos 32 caracteres.");
  if (IS_PRODUCTION && !EVOLUTION_BASE_URL.startsWith("https://")) {
    throw new Error("EVOLUTION_BASE_URL deve usar HTTPS em producao.");
  }
  if (IS_PRODUCTION && !REDIS_URL) throw new Error("REDIS_URL deve ser configurada em producao.");
}

function secretsMatch(received, expected) {
  const actualBuffer = Buffer.from(String(received || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function recTransportType(cfExec) {
  const normalized = normalizeCfExec(cfExec);
  if (/\/NET\/FO\b/.test(normalized)) return "fo";
  if (/\/NET\/BS\b/.test(normalized)) return "bs";
  return "unknown";
}

function whatsappGroupsForCfExec(cfExec) {
  const type = recTransportType(cfExec);
  if (type === "bs") return [BS_WHATSAPP_GROUP_ID];
  if (type === "fo") return [FO_WHATSAPP_GROUP_ID];
  return WHATSAPP_GROUP_IDS;
}

function relayLog(event, details = {}) {
  const payload = {
    event,
    recId: details.recId || undefined,
    cfExec: details.cfExec || undefined,
    groupId: details.groupId || undefined,
    backend: details.backend || undefined,
    dedupKey: details.dedupKey || undefined,
    status: details.status || undefined,
    state: details.state || undefined,
    error: details.error || undefined
  };
  console.log(JSON.stringify(payload));
}

function redisEncode(args) {
  return Buffer.concat([
    Buffer.from(`*${args.length}\r\n`),
    ...args.flatMap((arg) => {
      const value = Buffer.from(String(arg));
      return [Buffer.from(`$${value.length}\r\n`), value, Buffer.from("\r\n")];
    })
  ]);
}

function parseRedisResponse(buffer, offset = 0) {
  if (offset >= buffer.length) return null;
  const type = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf("\r\n", offset);
  if (lineEnd === -1) return null;
  const line = buffer.slice(offset + 1, lineEnd).toString();
  const next = lineEnd + 2;

  if (type === "+") return { value: line, offset: next };
  if (type === "-") return { value: new Error(line), offset: next };
  if (type === ":") return { value: Number(line), offset: next };
  if (type === "$") {
    const length = Number(line);
    if (length === -1) return { value: null, offset: next };
    const end = next + length;
    if (buffer.length < end + 2) return null;
    return { value: buffer.slice(next, end).toString(), offset: end + 2 };
  }
  if (type === "*") {
    const length = Number(line);
    if (length === -1) return { value: null, offset: next };
    const values = [];
    let cursor = next;
    for (let i = 0; i < length; i += 1) {
      const parsed = parseRedisResponse(buffer, cursor);
      if (!parsed) return null;
      values.push(parsed.value);
      cursor = parsed.offset;
    }
    return { value: values, offset: cursor };
  }
  throw new Error(`Resposta Redis desconhecida: ${type}`);
}

async function redisCommand(args) {
  if (!REDIS_URL) throw new Error("REDIS_URL nao configurado.");
  const redisUrl = new URL(REDIS_URL);
  const useTls = redisUrl.protocol === "rediss:";
  const port = Number(redisUrl.port || (useTls ? 6380 : 6379));
  const host = redisUrl.hostname;
  const password = decodeURIComponent(redisUrl.password || "");
  const username = decodeURIComponent(redisUrl.username || "");
  const db = redisUrl.pathname && redisUrl.pathname !== "/" ? redisUrl.pathname.slice(1) : "";

  const commands = [];
  if (password && username) commands.push(["AUTH", username, password]);
  else if (password) commands.push(["AUTH", password]);
  if (db) commands.push(["SELECT", db]);
  commands.push(args);

  return new Promise((resolve, reject) => {
    const socket = useTls
      ? tls.connect({ host, port, servername: host })
      : net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let settled = false;
    let commandsWritten = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error("Timeout Redis."));
    }, 5000);

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.end();
      if (err) reject(err);
      else resolve(value);
    };

    const writeCommands = () => {
      if (commandsWritten) return;
      commandsWritten = true;
      socket.write(Buffer.concat(commands.map(redisEncode)));
    };

    socket.on("connect", () => {
      if (!useTls) writeCommands();
    });
    socket.on("secureConnect", writeCommands);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        let cursor = 0;
        let lastValue;
        for (let i = 0; i < commands.length; i += 1) {
          const parsed = parseRedisResponse(buffer, cursor);
          if (!parsed) return;
          if (parsed.value instanceof Error) {
            finish(parsed.value);
            return;
          }
          lastValue = parsed.value;
          cursor = parsed.offset;
        }
        finish(null, lastValue);
      } catch (err) {
        finish(err);
      }
    });
    socket.on("error", (err) => finish(err));
  });
}

function redisDedupKey(dedupKey) {
  return `${REDIS_KEY_PREFIX}:${dedupKey}`;
}

async function loadState() {
  if (stateLoaded) return;
  stateLoaded = true;
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.sent) state = parsed;
  } catch (_err) {
    state = { sent: {} };
  }
}

async function saveState() {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("Payload muito grande.");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  return JSON.parse(raw);
}

function pruneDedup(now) {
  for (const [key, item] of Object.entries(state.sent || {})) {
    if (!item || now - Number(item.sentAtMs || 0) > DEDUP_TTL_MS) delete state.sent[key];
  }
}

async function claimFileDedup(dedupKey, metadata) {
  await loadState();
  const now = Date.now();
  pruneDedup(now);
  const existing = state.sent[dedupKey];
  if (existing) return { claimed: false, backend: "file", existing };
  state.sent[dedupKey] = Object.assign({}, metadata, {
    state: "pending",
    claimedAtMs: now,
    claimedAt: new Date(now).toISOString()
  });
  await saveState();
  return { claimed: true, backend: "file" };
}

async function markFileDedupSent(dedupKey, metadata) {
  await loadState();
  const now = Date.now();
  state.sent[dedupKey] = Object.assign({}, state.sent[dedupKey] || {}, metadata, {
    state: "sent",
    sentAtMs: now,
    sentAt: new Date(now).toISOString()
  });
  await saveState();
}

async function releaseFileDedup(dedupKey) {
  await loadState();
  delete state.sent[dedupKey];
  await saveState();
}

async function claimRedisDedup(dedupKey, metadata) {
  const now = Date.now();
  const key = redisDedupKey(dedupKey);
  const pending = JSON.stringify(Object.assign({}, metadata, {
    state: "pending",
    claimedAtMs: now,
    claimedAt: new Date(now).toISOString()
  }));
  const result = await redisCommand(["SET", key, pending, "NX", "PX", DEDUP_TTL_MS]);
  if (result === "OK") return { claimed: true, backend: "redis" };
  const existingRaw = await redisCommand(["GET", key]);
  let existing = existingRaw;
  try { existing = existingRaw ? JSON.parse(existingRaw) : null; } catch (_err) {}
  return { claimed: false, backend: "redis", existing };
}

async function markRedisDedupSent(dedupKey, metadata) {
  const now = Date.now();
  const key = redisDedupKey(dedupKey);
  await redisCommand(["SET", key, JSON.stringify(Object.assign({}, metadata, {
    state: "sent",
    sentAtMs: now,
    sentAt: new Date(now).toISOString()
  })), "XX", "PX", DEDUP_TTL_MS]);
}

async function releaseRedisDedup(dedupKey) {
  await redisCommand(["DEL", redisDedupKey(dedupKey)]);
}

async function claimDedup(dedupKey, metadata) {
  if (REDIS_URL) return claimRedisDedup(dedupKey, metadata);
  return claimFileDedup(dedupKey, metadata);
}

async function markDedupSent(dedupKey, metadata) {
  if (REDIS_URL) return markRedisDedupSent(dedupKey, metadata);
  return markFileDedupSent(dedupKey, metadata);
}

async function releaseDedup(dedupKey) {
  if (REDIS_URL) return releaseRedisDedup(dedupKey);
  return releaseFileDedup(dedupKey);
}

async function redisHealth() {
  if (!REDIS_URL) return { configured: false, ok: false };
  try {
    const pong = await redisCommand(["PING"]);
    return { configured: true, ok: pong === "PONG" };
  } catch (err) {
    return { configured: true, ok: false, error: err.message };
  }
}

function etitMessage(payload) {
  const recId = normalizeRecId(payload.recId);
  const cfExec = normalizeCfExec(payload.cfExec);
  const cliente = cleanText(payload.cliente);
  const detectedAt = cleanText(payload.detectedAt);
  const elapsedMinutes = Math.max(20, Math.round(Number(payload.elapsedMinutes || 20)));
  const type = recTransportType(cfExec);
  const lines = type === "bs"
    ? [
        `REC no DP`,
        `${recId} esta ha ${elapsedMinutes}min no DP.`
      ]
    : [
        `Risco de perda de ETIT`,
        `${recId} esta ha ${elapsedMinutes}min no DP.`,
        `Faltam aproximadamente 10min para perda do ETIT.`
      ];
  if (cfExec) lines.push(`CF Exec.: ${cfExec}`);
  if (cliente) lines.push(`Cliente: ${cliente}`);
  if (detectedAt) lines.push(`Detectada: ${detectedAt}`);
  return lines.join("\n");
}

function testMessage(payload = {}) {
  const customText = cleanText(payload.text);
  if (customText) return customText.slice(0, 1500);
  return [
    "Teste EMBRATEL Nova REC",
    "Relay EvolutionAPI ativo.",
    `Grupos: ${WHATSAPP_GROUP_IDS.join(", ")}`,
    `Data: ${new Date().toISOString()}`
  ].join("\n");
}

async function postEvolutionText(body) {
  if (!EVOLUTION_TOKEN) throw new Error("EVOLUTION_TOKEN nao configurado no servidor.");
  const url = `${EVOLUTION_BASE_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": EVOLUTION_TOKEN
    },
    body: JSON.stringify(body)
  });
  const responseText = await response.text();
  let responseBody = responseText;
  try { responseBody = JSON.parse(responseText); } catch (_err) {}
  return { ok: response.ok, status: response.status, body: responseBody };
}

async function sendEvolutionTextToGroup(groupId, text) {
  const primary = await postEvolutionText({
    number: groupId,
    textMessage: { text }
  });
  if (primary.ok) return primary.body;

  const fallback = await postEvolutionText({
    number: groupId,
    text
  });
  if (fallback.ok) return fallback.body;

  const primaryBody = typeof primary.body === "string" ? primary.body : JSON.stringify(primary.body);
  const fallbackBody = typeof fallback.body === "string" ? fallback.body : JSON.stringify(fallback.body);
  throw new Error(`EvolutionAPI HTTP ${primary.status}/${fallback.status}: ${primaryBody} | fallback: ${fallbackBody}`);
}

async function sendEvolutionText(text, groupIds = WHATSAPP_GROUP_IDS) {
  const results = [];
  for (const groupId of Array.from(new Set(groupIds || []))) {
    try {
      const body = await sendEvolutionTextToGroup(groupId, text);
      results.push({ groupId, ok: true, body });
    } catch (err) {
      results.push({ groupId, ok: false, error: err.message });
    }
  }

  const sentCount = results.filter((result) => result.ok).length;
  if (!sentCount) {
    throw new Error(`EvolutionAPI falhou em todos os grupos: ${results.map((result) => `${result.groupId}: ${result.error}`).join(" | ")}`);
  }
  return {
    sentCount,
    failedCount: results.length - sentCount,
    results
  };
}

async function authorizeRelayRequest(req, res) {
  if (!secretsMatch(req.headers["x-relay-secret"], RELAY_SHARED_SECRET)) {
    jsonResponse(res, 401, { ok: false, error: "Nao autorizado." });
    return false;
  }
  return true;
}

async function handleTestMessage(req, res) {
  if (!(await authorizeRelayRequest(req, res))) return;
  const payload = await readJson(req);
  const text = testMessage(payload);
  relayLog("test-message:received", { status: "received" });
  try {
    const evolution = await sendEvolutionText(text);
    for (const result of evolution.results || []) {
      relayLog(result.ok ? "test-message:sent" : "test-message:error", {
        groupId: result.groupId,
        status: result.ok ? "sent" : "error",
        error: result.error
      });
    }
    jsonResponse(res, 200, {
      ok: true,
      sent: true,
      groupIds: WHATSAPP_GROUP_IDS,
      evolution
    });
  } catch (err) {
    relayLog("test-message:error", { status: "error", error: err.message });
    throw err;
  }
}

async function handleEtitAlert(req, res) {
  if (!(await authorizeRelayRequest(req, res))) return;

  const payload = await readJson(req);
  const recId = normalizeRecId(payload.recId);
  const cfExec = normalizeCfExec(payload.cfExec);
  if (!recId) {
    jsonResponse(res, 400, { ok: false, error: "recId invalido." });
    return;
  }
  if (!cfExec.startsWith("DP/")) {
    relayLog("etit-alert:skipped", { recId, cfExec, status: "not-dp" });
    jsonResponse(res, 200, { ok: true, skipped: true, reason: "REC nao esta no DP." });
    return;
  }

  const recType = recTransportType(cfExec);
  const now = Date.now();
  const dedupKey = `etit-20:${recType}:${recId}`;
  const groupIds = whatsappGroupsForCfExec(cfExec);
  relayLog("etit-alert:received", { recId, cfExec, dedupKey, status: recType });
  const text = etitMessage(Object.assign({}, payload, { recId, cfExec }));
  const metadata = {
    recId,
    cfExec,
    recType,
    groupIds,
    text,
    requestedAtMs: now,
    requestedAt: new Date(now).toISOString()
  };
  const claim = await claimDedup(dedupKey, metadata);
  if (!claim.claimed) {
    relayLog("etit-alert:deduped", {
      recId,
      cfExec,
      dedupKey,
      backend: claim.backend,
      state: claim.existing && claim.existing.state
    });
    jsonResponse(res, 200, {
      ok: true,
      deduped: true,
      dedupKey,
      backend: claim.backend,
      firstSentAt: claim.existing && claim.existing.sentAt,
      state: claim.existing && claim.existing.state
    });
    return;
  }

  try {
    const evolution = await sendEvolutionText(text, groupIds);
    await markDedupSent(dedupKey, Object.assign({}, metadata, { evolution }));
    for (const result of evolution.results || []) {
      relayLog(result.ok ? "etit-alert:sent" : "etit-alert:group-error", {
        recId,
        cfExec,
        groupId: result.groupId,
        dedupKey,
        backend: claim.backend,
        status: result.ok ? "sent" : "error",
        error: result.error
      });
    }
    jsonResponse(res, 200, { ok: true, sent: true, dedupKey, backend: claim.backend, recType, groupIds, evolution });
  } catch (err) {
    await releaseDedup(dedupKey).catch(() => {});
    relayLog("etit-alert:error", { recId, cfExec, dedupKey, backend: claim.backend, error: err.message });
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      jsonResponse(res, 204, {});
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/health") {
      const redis = await redisHealth();
      let fileDedupCount = null;
      if (!REDIS_URL) {
        await loadState();
        pruneDedup(Date.now());
        fileDedupCount = Object.keys(state.sent || {}).length;
      }
      const healthy = Boolean(redis.ok);
      jsonResponse(res, healthy ? 200 : 503, {
        ok: healthy,
        service: "embratel-rec-whatsapp-relay",
        dedupBackend: REDIS_URL ? "redis" : "file",
        dedupCount: fileDedupCount,
        redis
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/etit-alert") {
      await handleEtitAlert(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/test-message") {
      await handleTestMessage(req, res);
      return;
    }
    jsonResponse(res, 404, { ok: false, error: "Rota nao encontrada." });
  } catch (err) {
    jsonResponse(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[relay] WhatsApp relay ouvindo na porta ${PORT}`);
});
