"use strict";

const form = document.getElementById("config-form");
const monitorModeInput = document.getElementById("monitor-mode");
const serverUrlInput = document.getElementById("server-url");
const pollMinutesInput = document.getElementById("poll-minutes");
const fibraRioEsInput = document.getElementById("type-fibra-rio-es");
const fibraLesteInput = document.getElementById("type-fibra-leste");
const bsodInput = document.getElementById("type-bsod");
const statusBox = document.getElementById("status");
const soundEnabledInput = document.getElementById("sound-enabled");
const soundTypeInput = document.getElementById("sound-type");
const relayUrlInput = document.getElementById("relay-url");
const relaySecretInput = document.getElementById("relay-secret");
const testButton = document.getElementById("test-now");
const testNotificationButton = document.getElementById("test-notification");
const testWhatsappButton = document.getElementById("test-whatsapp");
const notifyRecentButton = document.getElementById("notify-recent");
const resetButton = document.getElementById("reset-baseline");

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function showStatus(value) {
  statusBox.textContent = JSON.stringify(value, null, 2);
}

function formValues() {
  return {
    monitorMode: monitorModeInput.value,
    serverUrl: serverUrlInput.value,
    pollMinutes: pollMinutesInput.value,
    recTypes: Array.from(form.querySelectorAll("input[name='recType']:checked")).map((input) => input.value),
    soundEnabled: soundEnabledInput.checked,
    soundType: soundTypeInput.value,
    relayUrl: relayUrlInput.value,
    relaySecret: relaySecretInput.value
  };
}

async function load() {
  const status = await sendMessage({ action: "get-status" });
  if (status && status.config) {
    monitorModeInput.value = status.config.monitorMode || "local";
    serverUrlInput.value = status.config.serverUrl;
    pollMinutesInput.value = status.config.pollMinutes;
    const recTypes = Array.isArray(status.config.recTypes) ? status.config.recTypes : [];
    fibraRioEsInput.checked = recTypes.includes("fibra-rio-es");
    fibraLesteInput.checked = recTypes.includes("fibra-leste");
    bsodInput.checked = recTypes.includes("bsod");
    soundEnabledInput.checked = status.config.soundEnabled !== false;
    soundTypeInput.value = status.config.soundType || "beep";
    relayUrlInput.value = status.config.relayUrl || "https://relay.comunora.com.br";
    relaySecretInput.value = "";
    relaySecretInput.placeholder = status.config.relaySecretConfigured
      ? "Credencial configurada; deixe vazio para manter"
      : "Cole a credencial fornecida pelo administrador";
  }
  showStatus(status);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await sendMessage({
    action: "save-config",
    values: formValues()
  });
  showStatus(result);
});

testButton.addEventListener("click", async () => {
  showStatus(await sendMessage({ action: "poll-now" }));
  await load();
});

testNotificationButton.addEventListener("click", async () => {
  await sendMessage({ action: "save-config", values: formValues() });
  showStatus(await sendMessage({ action: "test-notification", values: formValues() }));
  await load();
});

testWhatsappButton.addEventListener("click", async () => {
  await sendMessage({ action: "save-config", values: formValues() });
  showStatus(await sendMessage({ action: "test-whatsapp" }));
  await load();
});

notifyRecentButton.addEventListener("click", async () => {
  showStatus(await sendMessage({ action: "notify-recent" }));
  await load();
});

resetButton.addEventListener("click", async () => {
  const confirmed = confirm("Resetar a base local desta extensao? Ela criara uma nova base sem alertar eventos antigos.");
  if (!confirmed) return;
  showStatus(await sendMessage({ action: "reset-baseline" }));
  await load();
});

load();
