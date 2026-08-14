"use strict";

(() => {
  const SCAN_INTERVAL_MS = 10000;
  const FETCH_INTERVAL_MS = 30000;
  const FETCH_TIMEOUT_MS = 20000;
  const MUTATION_DEBOUNCE_MS = 2500;
  const HIDDEN_FRAME_ID = "__embratel_rec_monitor_refresh_frame";
  const REC_PATTERN = /\bREC-\d+\/\d+\b/i;
  const CF_EXEC_PATTERN = /\b[A-Z]{2,5}\s*\/\s*[A-Z0-9]{2,8}\s*\/\s*[A-Z0-9]{2,8}\s*\/\s*NET\s*\/\s*(?:FO|BS)\b/i;
  const STORAGE_KEYS = {
    initialized: "localMonitorInitialized",
    seen: "localSeenRecIds",
    status: "localLastStatus"
  };

  if (window.__embratelRecMonitorLoaded) return;
  window.__embratelRecMonitorLoaded = true;

  let scanTimer = null;
  let mutationTimer = null;
  let running = false;
  let lastFetchAt = 0;
  let lastHiddenRefreshAt = 0;
  let hiddenRefreshPromise = null;
  let observer = null;
  let stopped = false;
  let pageBaselineCreated = false;

  try {
    if (window.frameElement && window.frameElement.id === HIDDEN_FRAME_ID) return;
  } catch (_err) {}

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function extensionContextOk() {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local);
    } catch (_err) {
      return false;
    }
  }

  function stopMonitor() {
    stopped = true;
    clearInterval(scanTimer);
    clearTimeout(mutationTimer);
    if (observer) observer.disconnect();
  }

  function storageGet(defaults) {
    return new Promise((resolve) => {
      if (!extensionContextOk()) {
        stopMonitor();
        resolve(defaults);
        return;
      }
      try {
        chrome.storage.local.get(defaults, (result) => {
          if (chrome.runtime.lastError) {
            stopMonitor();
            resolve(defaults);
            return;
          }
          resolve(result || defaults);
        });
      } catch (_err) {
        stopMonitor();
        resolve(defaults);
      }
    });
  }

  function storageSet(values) {
    return new Promise((resolve) => {
      if (!extensionContextOk()) {
        stopMonitor();
        resolve(false);
        return;
      }
      try {
        chrome.storage.local.set(values, () => {
          if (chrome.runtime.lastError) {
            stopMonitor();
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (_err) {
        stopMonitor();
        resolve(false);
      }
    });
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      if (!extensionContextOk()) {
        stopMonitor();
        resolve(null);
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response);
        });
      } catch (_err) {
        stopMonitor();
        resolve(null);
      }
    });
  }

  function normalizeHeader(value) {
    return cleanText(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function headerIndex(cells) {
    const map = {};
    cells.forEach((cell, index) => {
      const key = normalizeHeader(cell.textContent);
      if (key.includes("numrecup")) map.recId = index;
      if (key.includes("cfexec")) map.cfExec = index;
      if (key.includes("cliente")) map.cliente = index;
      if (key.includes("designacao")) map.designacao = index;
      if (key.includes("abertura")) map.abertura = index;
    });
    return map;
  }

  function rowFromCells(cells, headers) {
    const values = cells.map((cell) => cleanText(cell.textContent));
    const joined = values.join(" ");
    const recMatch = joined.match(REC_PATTERN);
    if (!recMatch) return null;

    const recId = headers.recId !== undefined ? values[headers.recId] : recMatch[0];
    if (!REC_PATTERN.test(recId)) return null;

    const looksLikeRecTable = headers.recId === undefined && headers.cfExec === undefined && values.length >= 7 && REC_PATTERN.test(values[2] || "");
    const inferred = looksLikeRecTable
      ? { recId: 2, cliente: 3, designacao: 4, abertura: 5, cfExec: 6 }
      : {};
    const indexes = Object.assign({}, inferred, headers);

    const recIdValue = indexes.recId !== undefined ? values[indexes.recId] : recMatch[0];
    if (!REC_PATTERN.test(recIdValue)) return null;

    const cfExecFromHeader = indexes.cfExec !== undefined ? values[indexes.cfExec] : "";
    const cfMatch = (cfExecFromHeader || joined).match(CF_EXEC_PATTERN);

    return {
      recId: recIdValue.match(REC_PATTERN)[0].toUpperCase(),
      cfExec: cleanText(cfExecFromHeader || (cfMatch ? cfMatch[0] : "")),
      cliente: indexes.cliente !== undefined ? values[indexes.cliente] : "",
      designacao: indexes.designacao !== undefined ? values[indexes.designacao] : "",
      abertura: indexes.abertura !== undefined ? values[indexes.abertura] : "",
      sourceUrl: location.href,
      detectedAt: new Date().toISOString()
    };
  }

  function extractFromTables(doc) {
    const rows = [];
    for (const table of Array.from(doc.querySelectorAll("table"))) {
      const tableText = cleanText(table.textContent);
      if (!REC_PATTERN.test(tableText)) continue;

      let headers = {};
      for (const tr of Array.from(table.querySelectorAll("tr"))) {
        const cells = Array.from(tr.cells || []);
        if (!cells.length) continue;

        const candidateHeaders = headerIndex(cells);
        if (candidateHeaders.recId !== undefined || candidateHeaders.cfExec !== undefined) {
          headers = Object.assign(headers, candidateHeaders);
          continue;
        }

        const parsed = rowFromCells(cells, headers);
        if (parsed) rows.push(parsed);
      }
    }
    return rows;
  }

  function extractFromText(doc) {
    const text = cleanText(doc.body ? doc.body.innerText : "");
    if (!REC_PATTERN.test(text)) return [];

    const rows = [];
    const lines = text.split(/\n+/).map(cleanText).filter(Boolean);
    for (const line of lines) {
      const recMatch = line.match(REC_PATTERN);
      if (!recMatch) continue;
      const cfMatch = line.match(CF_EXEC_PATTERN);
      rows.push({
        recId: recMatch[0].toUpperCase(),
        cfExec: cfMatch ? cleanText(cfMatch[0]) : "",
        cliente: "",
        designacao: "",
        abertura: "",
        sourceUrl: location.href,
        detectedAt: new Date().toISOString()
      });
    }
    return rows;
  }

  function uniqueRows(rows) {
    const byRec = new Map();
    for (const row of rows) {
      if (!row.recId) continue;
      const previous = byRec.get(row.recId);
      if (!previous || (!previous.cfExec && row.cfExec)) byRec.set(row.recId, row);
    }
    return Array.from(byRec.values());
  }

  function extractRows(doc) {
    const tableRows = extractFromTables(doc);
    if (tableRows.length) return uniqueRows(tableRows);
    return uniqueRows(extractFromText(doc));
  }

  async function fetchRowsSnapshot() {
    const now = Date.now();
    if (now - lastFetchAt < FETCH_INTERVAL_MS) return [];
    lastFetchAt = now;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(location.href, {
        cache: "no-store",
        credentials: "include",
        signal: controller.signal
      });
      if (!response.ok) return [];
      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, "text/html");
      return extractRows(parsed);
    } catch (_err) {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  function getHiddenRefreshFrame() {
    if (!document.body) return null;
    let iframe = document.getElementById(HIDDEN_FRAME_ID);
    if (iframe) return iframe;

    iframe = document.createElement("iframe");
    iframe.id = HIDDEN_FRAME_ID;
    iframe.dataset.embratelRecMonitor = "1";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    Object.assign(iframe.style, {
      position: "fixed",
      left: "-10000px",
      top: "-10000px",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
      border: "0"
    });
    document.body.appendChild(iframe);
    return iframe;
  }

  async function refreshHiddenFrameRows() {
    const now = Date.now();
    if (now - lastHiddenRefreshAt < FETCH_INTERVAL_MS) return [];
    if (hiddenRefreshPromise) return hiddenRefreshPromise;

    lastHiddenRefreshAt = now;
    hiddenRefreshPromise = new Promise((resolve) => {
      const iframe = getHiddenRefreshFrame();
      if (!iframe) {
        resolve([]);
        return;
      }

      let settled = false;
      const finish = (rows) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        iframe.onload = null;
        iframe.onerror = null;
        resolve(rows || []);
      };

      const timeout = setTimeout(() => finish([]), FETCH_TIMEOUT_MS);
      iframe.onload = () => {
        setTimeout(() => {
          try {
            finish(extractRows(iframe.contentDocument || iframe.contentWindow.document));
          } catch (_err) {
            finish([]);
          }
        }, 1500);
      };
      iframe.onerror = () => finish([]);

      try {
        iframe.src = "about:blank";
        setTimeout(() => {
          try {
            iframe.src = location.href;
          } catch (_err) {
            finish([]);
          }
        }, 50);
      } catch (_err) {
        finish([]);
      }
    }).finally(() => {
      hiddenRefreshPromise = null;
    });

    return hiddenRefreshPromise;
  }

  function hasRecScreen(doc, rows) {
    if (rows.length > 0) return true;
    const text = cleanText(doc.body ? doc.body.innerText : "");
    return /Itens Recebidos pelo Centro Funcional/i.test(text) || /Num\.?\s*Recup/i.test(text);
  }

  async function publishStatus(status) {
    const payload = Object.assign({
      frameUrl: location.href,
      updatedAt: new Date().toISOString()
    }, status);
    await storageSet({ [STORAGE_KEYS.status]: payload });
    await sendMessage({ action: "local-monitor-status", status: payload });
  }

  async function scan(reason) {
    if (stopped) return;
    if (running) return;
    running = true;
    try {
      const pageRows = extractRows(document);
      const hiddenRows = hasRecScreen(document, pageRows) ? await refreshHiddenFrameRows() : [];
      const fetchedRows = await fetchRowsSnapshot();
      const rows = hiddenRows.length ? hiddenRows : (fetchedRows.length ? fetchedRows : pageRows);
      if (!hasRecScreen(document, rows)) {
        return { ok: true, activePage: false, rows: 0, newEvents: 0, confirmedEvents: 0 };
      }

      const state = await storageGet({
        [STORAGE_KEYS.initialized]: false,
        [STORAGE_KEYS.seen]: {}
      });
      const initialized = Boolean(state[STORAGE_KEYS.initialized]);
      const seen = Object.assign({}, state[STORAGE_KEYS.seen] || {});

      if (!rows.length) {
        await publishStatus({ ok: false, reason, activePage: true, rows: 0, error: "Tela REC encontrada, mas nenhuma linha REC foi lida." });
        return { ok: false, activePage: true, rows: 0, newEvents: 0, confirmedEvents: 0 };
      }

      const snapshotResult = await sendMessage({ action: "local-rec-snapshot", rows });
      const etitWarnings = Number(snapshotResult && snapshotResult.etitWarnings || 0);
      const whatsappWarnings = Number(snapshotResult && snapshotResult.whatsappWarnings || 0);
      const whatsappErrors = Number(snapshotResult && snapshotResult.whatsappErrors || 0);

      if (!initialized || !pageBaselineCreated) {
        for (const row of rows) seen[row.recId] = Date.now();
        await storageSet({
          [STORAGE_KEYS.initialized]: true,
          [STORAGE_KEYS.seen]: seen
        });
        pageBaselineCreated = true;
        await publishStatus({ ok: true, reason, activePage: true, bootstrapped: true, pageBootstrapped: true, rows: rows.length, newEvents: 0 });
        return { ok: true, activePage: true, rows: rows.length, newEvents: 0, confirmedEvents: 0, etitWarnings, whatsappWarnings, whatsappErrors };
      }

      const newRows = [];
      for (const row of rows) {
        if (seen[row.recId]) continue;
        newRows.push(row);
      }

      let confirmedEvents = 0;
      if (newRows.length) {
        for (const row of newRows) {
          const response = await sendMessage({ action: "local-rec-detected", event: row });
          if (response && response.ok) {
            seen[row.recId] = Date.now();
            confirmedEvents += 1;
          }
        }
        if (confirmedEvents) await storageSet({ [STORAGE_KEYS.seen]: seen });
      }

      await publishStatus({ ok: true, reason, activePage: true, rows: rows.length, newEvents: newRows.length, confirmedEvents });
      return { ok: true, activePage: true, rows: rows.length, newEvents: newRows.length, confirmedEvents, etitWarnings, whatsappWarnings, whatsappErrors };
    } catch (err) {
      await publishStatus({ ok: false, reason, activePage: true, rows: 0, error: err.message });
      return { ok: false, activePage: true, rows: 0, newEvents: 0, confirmedEvents: 0, error: err.message };
    } finally {
      running = false;
    }
  }

  function scheduleMutationScan() {
    if (stopped) return;
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => scan("mutation"), MUTATION_DEBOUNCE_MS);
  }

  document.documentElement.setAttribute("data-embratel-rec-monitor", "local");
  scanTimer = setInterval(() => scan("interval"), SCAN_INTERVAL_MS);
  window.addEventListener("beforeunload", () => clearInterval(scanTimer));

  observer = new MutationObserver(scheduleMutationScan);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  if (extensionContextOk()) {
    try {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || message.action !== "force-local-scan") return false;
        scan(message.reason || "forced")
          .then((result) => sendResponse(result || { ok: true }))
          .catch((err) => sendResponse({ ok: false, error: err.message }));
        return true;
      });
    } catch (_err) {
      stopMonitor();
    }
  }

  scan("startup");
})();
