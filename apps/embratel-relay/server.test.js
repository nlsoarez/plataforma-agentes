"use strict";

const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { test } = require("node:test");

test("relay fails closed and exposes only a dependency health summary", { timeout: 15000 }, async () => {
  const port = await freePort();
  const secret = "a".repeat(64);
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      EVOLUTION_BASE_URL: "http://127.0.0.1:65534",
      EVOLUTION_INSTANCE: "test",
      EVOLUTION_TOKEN: "test-token",
      WHATSAPP_FO_GROUP_ID: "1@g.us",
      WHATSAPP_BS_GROUP_ID: "2@g.us",
      RELAY_SHARED_SECRET: secret,
      REDIS_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(port, child);
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 503);
    const healthBody = await health.json();
    assert.equal(healthBody.service, "embratel-rec-whatsapp-relay");
    assert.equal("evolutionInstance" in healthBody, false);
    assert.equal("groupIds" in healthBody, false);

    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/test-message`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-relay-secret": "wrong" },
      body: "{}",
    });
    assert.equal(unauthorized.status, 401);
  } finally {
    child.kill();
  }
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(port, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Relay encerrou com codigo ${child.exitCode}`);
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Relay nao iniciou a tempo");
}
