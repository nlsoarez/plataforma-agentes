"use strict";

const params = new URLSearchParams(location.search);

function value(key, fallback = "-") {
  return params.get(key) || fallback;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || "-";
}

function alertType(cfExec) {
  const normalized = String(cfExec || "").toUpperCase().replace(/\s*\/\s*/g, "/");
  if (/\/NET\/FO\b/.test(normalized)) return "Fibra";
  if (/\/NET\/BS\b/.test(normalized)) return "Bsod";
  return "Alerta";
}

// â”€â”€ Alert sound (Web Audio API â€” no external file needed) â”€â”€
async function playTonePattern(pattern) {
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      await ctx.resume().catch(() => {});
    }

    let maxEnd = 0;
    for (const note of pattern) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + note.at;
      const duration = note.duration || 0.16;
      osc.type = note.type || "square";
      osc.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(note.volume || 0.42, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.01);
      maxEnd = Math.max(maxEnd, note.at + duration);
    }
    setTimeout(() => ctx.close().catch(() => {}), Math.ceil((maxEnd + 0.5) * 1000));
  } catch (_err) {
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance("Nova REC"));
    } catch (_speechErr) {}
  }
}

function soundPattern(type) {
  if (type === "etit") {
    return [
      { at: 0, frequency: 420, duration: 0.28, volume: 0.55, type: "sawtooth" },
      { at: 0.38, frequency: 420, duration: 0.28, volume: 0.55, type: "sawtooth" },
      { at: 0.9, frequency: 760, duration: 0.16, volume: 0.5, type: "square" },
      { at: 1.12, frequency: 760, duration: 0.16, volume: 0.5, type: "square" },
      { at: 1.34, frequency: 760, duration: 0.16, volume: 0.5, type: "square" }
    ];
  }
  if (type === "bip") {
    return [
      { at: 0, frequency: 1000, duration: 0.18, volume: 0.5, type: "sine" },
      { at: 0.32, frequency: 1000, duration: 0.18, volume: 0.5, type: "sine" }
    ];
  }
  if (type === "urgent") {
    return [
      { at: 0, frequency: 1500, duration: 0.09, volume: 0.55 },
      { at: 0.13, frequency: 1500, duration: 0.09, volume: 0.55 },
      { at: 0.26, frequency: 1500, duration: 0.09, volume: 0.55 },
      { at: 0.52, frequency: 650, duration: 0.28, volume: 0.52, type: "sawtooth" },
      { at: 0.88, frequency: 1500, duration: 0.2, volume: 0.55 }
    ];
  }
  if (type === "triple") {
    return [
      { at: 0, frequency: 520, duration: 0.18, type: "triangle" },
      { at: 0.25, frequency: 780, duration: 0.18, type: "triangle" },
      { at: 0.5, frequency: 1040, duration: 0.22, type: "triangle" },
      { at: 1.0, frequency: 520, duration: 0.18, type: "triangle" },
      { at: 1.25, frequency: 780, duration: 0.18, type: "triangle" },
      { at: 1.5, frequency: 1040, duration: 0.22, type: "triangle" }
    ];
  }
  return [
    { at: 0, frequency: 880, duration: 0.16 },
    { at: 0.18, frequency: 1175, duration: 0.16 },
    { at: 0.7, frequency: 880, duration: 0.16 },
    { at: 0.88, frequency: 1175, duration: 0.16 },
    { at: 1.4, frequency: 880, duration: 0.16 },
    { at: 1.58, frequency: 1175, duration: 0.16 }
  ];
}

async function playAlertSound(type) {
  if (type === "voice") {
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance("Nova REC"));
      return;
    } catch (_err) {}
  }
  await playTonePattern(soundPattern(type));
}

const recId = value("recId");
const cfExec = value("cfExec");
const cliente = value("cliente", "");
const alertTitle = value("alertTitle", "Nova REC");
const alertMessage = value("alertMessage", "");
setText("alert-title", alertTitle);
setText("alert-message", alertMessage);
setText("rec-id", recId);
setText("cf-exec", cfExec);
setText("cliente", cliente || "-");
setText("tipo", alertType(cfExec));
if (!cliente) {
  const clienteField = document.getElementById("cliente-field");
  if (clienteField) clienteField.style.display = "none";
}
if (!alertMessage) {
  const messageField = document.getElementById("message-field");
  if (messageField) messageField.style.display = "none";
}

document.title = `${alertTitle} - ${recId}`;

// Play sound if enabled
if (params.get("sound") !== "0") {
  const soundType = params.get("soundType") || "beep";
  playAlertSound(soundType);
  if (soundType === "beep") setTimeout(() => playAlertSound(soundType), 700);
}

document.getElementById("close").addEventListener("click", () => window.close());
document.getElementById("copy").addEventListener("click", async () => {
  const btn = document.getElementById("copy");
  const text = `${alertTitle}${alertMessage ? `\n${alertMessage}` : ""}\nREC: ${recId}\nCF Exec.: ${cfExec}${cliente ? `\nCliente: ${cliente}` : ""}`;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Copiado!";
    setTimeout(() => { btn.textContent = "Copiar"; }, 1500);
  } catch (_err) {}
});
