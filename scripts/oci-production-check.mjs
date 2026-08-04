import { resolve4, resolveCname } from 'node:dns/promises';

const endpoints = [
  ['app', 'app.comunora.com.br', '/health', 'web'],
  ['api', 'api.comunora.com.br', '/health', 'api'],
  ['evolution', 'evolution.comunora.com.br', '/', 'Evolution'],
  ['relay', 'relay.comunora.com.br', '/health', 'embratel-rec-whatsapp-relay'],
];
const results = [];

for (const [name, host, path, expected] of endpoints) {
  await checkDns(name, host);
  await checkHttp(name, `https://${host}${path}`, expected);
}

for (const result of results) {
  console.log(`${result.ok ? 'OK' : 'FAIL'} ${result.name}: ${result.message}`);
}
if (results.some((result) => !result.ok)) process.exit(1);

async function checkDns(name, host) {
  try {
    let records;
    try {
      records = await resolveCname(host);
    } catch {
      records = await resolve4(host);
    }
    results.push({ ok: records.length > 0, name: `${name} DNS`, message: records.join(', ') || 'sem resposta' });
  } catch (error) {
    results.push({ ok: false, name: `${name} DNS`, message: error.code || error.message });
  }
}

async function checkHttp(name, url, expected) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    const body = await response.text();
    const ok = response.ok && body.toLowerCase().includes(expected.toLowerCase());
    results.push({ ok, name: `${name} HTTP`, message: `${response.status} ${url}` });
  } catch (error) {
    results.push({ ok: false, name: `${name} HTTP`, message: error.message });
  }
}
