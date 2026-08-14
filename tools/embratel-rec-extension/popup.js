"use strict";

const statusEl = document.getElementById("status");
const pollButton = document.getElementById("poll-now");
const optionsButton = document.getElementById("open-options");

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(label, value, className) {
  return `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="value ${className || ""}">${escapeHtml(value || "-")}</span></div>`;
}

function compactText(value, max = 44) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function etitStatusLabel(item) {
  const status = item && item.whatsappStatus || "pendente";
  if (status === "enviado") return "WhatsApp enviado";
  if (status === "deduplicado") return "WhatsApp dedup";
  if (status === "erro") return `Erro WhatsApp: ${compactText(item.whatsappError || "sem detalhe", 36)}`;
  if (status === "pronto") return "WhatsApp pronto";
  return "WhatsApp pendente";
}

function renderEtitWatchItems(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return "";
  const rows = list.map((item) => {
    const lastSeen = item.lastSeenSeconds === null || item.lastSeenSeconds === undefined
      ? "sem visto recente"
      : `visto ha ${item.lastSeenSeconds}s`;
    const missing = Number(item.missingDpScans || 0);
    const statusClass = item.whatsappStatus === "erro" ? "error" : "";
    return `
      <div class="watch-item">
        <div class="watch-rec">${escapeHtml(item.recId)}</div>
        <div class="watch-meta">${escapeHtml(compactText(item.cfExec, 42))}</div>
        <div class="watch-meta">${escapeHtml(item.ageMinutes)}min no DP | ${escapeHtml(lastSeen)}${missing ? ` | falhas ${escapeHtml(missing)}` : ""}</div>
        <div class="watch-meta ${statusClass}">${escapeHtml(etitStatusLabel(item))}</div>
      </div>`;
  }).join("");
  return `<div class="watch-list"><div class="watch-title">ETIT monitoradas</div>${rows}</div>`;
}

function filterLabel(config) {
  const recTypes = Array.isArray(config.recTypes) ? config.recTypes : [];
  if (!recTypes.length) return "Todos";
  const labels = [];
  if (recTypes.includes("fibra-rio-es")) labels.push("Fibra Rio/ES");
  if (recTypes.includes("fibra-leste")) labels.push("Fibra Leste");
  if (recTypes.includes("bsod")) labels.push("BSOD");
  return labels.join(", ") || "Todos";
}

function modeLabel(config) {
  return config.monitorMode === "server" ? "Servidor" : "Local no site";
}

function soundLabel(config) {
  if (config.soundEnabled === false) return "desligado";
  const labels = {
    beep: "padrao",
    bip: "BIP",
    urgent: "urgente",
    triple: "triplo",
    voice: "voz"
  };
  return labels[config.soundType] || "padrao";
}

function render(status) {
  const last = status && status.lastStatus || {};
  const local = status && status.localLastStatus || {};
  const config = status && status.config || {};
  const localMode = config.monitorMode !== "server";
  statusEl.innerHTML = [
    row("Modo", modeLabel(config)),
    localMode ? "" : row("Servidor", config.serverUrl),
    row("Filtro", filterLabel(config)),
    row("Som", soundLabel(config)),
    row("Estado", last.ok === false ? "erro" : "ativo", last.ok === false ? "error" : ""),
    localMode ? row("Base local", status && status.localInitialized ? "criada" : "aguardando tela") : row("Ultimo evento", String(status && status.lastEventId || 0)),
    localMode ? row("REC vistas", String(status && status.localSeenRecCount || 0)) : "",
    localMode ? row("ETIT monitoradas", String(status && status.etitWatchCount || 0)) : "",
    localMode ? row("Ultima leitura", local.updatedAt || "-") : row("Ultima consulta", last.updatedAt || "-"),
    localMode && local.rows !== undefined ? row("Linhas na tela", String(local.rows)) : "",
    localMode && local.newEvents !== undefined ? row("Novas na leitura", String(local.newEvents)) : "",
    localMode && last.localTabs !== undefined ? row("Abas EMBRATEL", String(last.localTabs)) : "",
    localMode && last.monitorsInjected ? row("Monitor injetado", String(last.monitorsInjected)) : "",
    localMode && last.scanRequestFailures ? row("Falhas leitura", String(last.scanRequestFailures), "error") : "",
    localMode && last.notifiedDuringScan ? row("Alertadas leitura", String(last.notifiedDuringScan)) : "",
    localMode && last.whatsappWarnings ? row("WhatsApp ETIT", String(last.whatsappWarnings)) : "",
    localMode && last.whatsappErrors ? row("Erro WhatsApp", String(last.whatsappErrors), "error") : "",
    localMode && local.activePage === false ? row("Tela REC", "nao encontrada", "error") : "",
    last.receivedCount !== undefined ? row("Recebidas servidor", String(last.receivedCount)) : "",
    last.eligibleCount !== undefined ? row("Passaram filtro", String(last.eligibleCount)) : "",
    last.notifiedCount !== undefined ? row("Alertadas", String(last.notifiedCount)) : "",
    last.filteredCount ? row("Filtradas", String(last.filteredCount)) : "",
    last.duplicateCount ? row("Duplicadas", String(last.duplicateCount)) : "",
    last.resetDetected ? row("Reset servidor", "detectado") : "",
    last.serverLastEventId !== undefined ? row("Evento servidor", String(last.serverLastEventId)) : "",
    last.notificationError ? row("Erro notificacao", last.notificationError, "error") : "",
    local.error ? row("Erro local", local.error, "error") : "",
    last.error ? row("Erro", last.error, "error") : "",
    renderEtitWatchItems(status && status.etitWatchItems),
    !localMode && last.ok === false && last.error && /fetch|network|econnrefused/i.test(last.error)
      ? '<div style="margin-top:8px;padding:8px;background:#fef2f2;border-radius:6px;font-size:11px;color:#991b1b">Nao conseguiu conectar ao servidor. Abra <b>Opcoes</b> e coloque o IP da maquina que roda o servidor (ex: http://10.x.x.x:8787).</div>'
      : ""
  ].join("");
}

async function load() {
  render(await sendMessage({ action: "get-status" }));
}

pollButton.addEventListener("click", async () => {
  pollButton.disabled = true;
  await sendMessage({ action: "poll-now" });
  await load();
  pollButton.disabled = false;
});

optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

load();
