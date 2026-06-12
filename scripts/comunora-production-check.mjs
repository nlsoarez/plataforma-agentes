import { resolveCname, resolveTxt } from 'node:dns/promises';

const DEFAULTS = {
  appHost: 'app.comunora.com.br',
  apiHost: 'api.comunora.com.br',
  appCname: 'ltqiq8fh.up.railway.app',
  apiCname: '3z7xvypo.up.railway.app',
  appVerifyHost: '_railway-verify.app.comunora.com.br',
  apiVerifyHost: '_railway-verify.api.comunora.com.br',
  appVerifyValue: 'railway-verify=8c41d452f1b2c975a1a5a4ab307116caadc9a64a0acaa2159f87feb7de5b6991',
  apiVerifyValue: 'railway-verify=0f44e0a3c60e76f30d9b540df7720a779ba09f98c8ccb35aae2b70788e3ad701',
};

const options = parseArgs(process.argv.slice(2));
const cfg = {
  appHost: options.appHost || process.env.COMUNORA_APP_HOST || DEFAULTS.appHost,
  apiHost: options.apiHost || process.env.COMUNORA_API_HOST || DEFAULTS.apiHost,
  appCname: options.appCname || process.env.COMUNORA_APP_CNAME || DEFAULTS.appCname,
  apiCname: options.apiCname || process.env.COMUNORA_API_CNAME || DEFAULTS.apiCname,
  appVerifyHost: options.appVerifyHost || process.env.COMUNORA_APP_VERIFY_HOST || DEFAULTS.appVerifyHost,
  apiVerifyHost: options.apiVerifyHost || process.env.COMUNORA_API_VERIFY_HOST || DEFAULTS.apiVerifyHost,
  appVerifyValue: options.appVerifyValue || process.env.COMUNORA_APP_VERIFY_VALUE || DEFAULTS.appVerifyValue,
  apiVerifyValue: options.apiVerifyValue || process.env.COMUNORA_API_VERIFY_VALUE || DEFAULTS.apiVerifyValue,
  soft: options.soft || process.env.SOFT === '1',
};

const checks = [];

await checkCname('app CNAME', cfg.appHost, cfg.appCname);
await checkCname('api CNAME', cfg.apiHost, cfg.apiCname);
await checkTxt('app Railway TXT', cfg.appVerifyHost, cfg.appVerifyValue);
await checkTxt('api Railway TXT', cfg.apiVerifyHost, cfg.apiVerifyValue);
await checkHttp('app health', `https://${cfg.appHost}/health`, 'web');
await checkHttp('api health', `https://${cfg.apiHost}/health`, 'api');
await checkHttp('app login', `https://${cfg.appHost}/login`, 'Comunora');

console.log('\nResumo');
for (const item of checks) {
  const icon = item.status === 'ok' ? 'OK' : item.status === 'warn' ? 'WARN' : 'FAIL';
  console.log(`${icon} ${item.name}: ${item.message}`);
}

const failed = checks.some((item) => item.status === 'fail');
if (failed && !cfg.soft) process.exit(1);

function parseArgs(args) {
  const parsed = {};
  for (const arg of args) {
    if (arg === '--soft') {
      parsed.soft = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) parsed[match[1]] = match[2];
  }
  return parsed;
}

async function checkCname(name, host, expected) {
  try {
    const records = await resolveCname(host);
    const normalized = records.map(normalizeDnsValue);
    const wanted = normalizeDnsValue(expected);
    if (normalized.includes(wanted)) {
      ok(name, `${host} -> ${expected}`);
      return;
    }
    fail(name, `${host} retornou ${records.join(', ') || 'vazio'}; esperado ${expected}`);
  } catch (error) {
    fail(name, `${host} ainda nao resolve CNAME (${error.code || error.message})`);
  }
}

async function checkTxt(name, host, expected) {
  try {
    const records = (await resolveTxt(host)).map((parts) => parts.join(''));
    if (records.includes(expected)) {
      ok(name, `${host} TXT verificado`);
      return;
    }
    fail(name, `${host} retornou ${records.join(', ') || 'vazio'}; esperado ${expected}`);
  } catch (error) {
    fail(name, `${host} ainda nao resolve TXT (${error.code || error.message})`);
  }
}

async function checkHttp(name, url, expectedText) {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    const text = await response.text();
    if (!response.ok) {
      fail(name, `${url} retornou HTTP ${response.status}`);
      return;
    }
    if (expectedText && !text.includes(expectedText)) {
      warn(name, `${url} respondeu HTTP ${response.status}, mas nao contem "${expectedText}"`);
      return;
    }
    ok(name, `${url} HTTP ${response.status}`);
  } catch (error) {
    fail(name, `${url} falhou (${error.message})`);
  }
}

function normalizeDnsValue(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

function ok(name, message) {
  checks.push({ name, message, status: 'ok' });
}

function warn(name, message) {
  checks.push({ name, message, status: 'warn' });
}

function fail(name, message) {
  checks.push({ name, message, status: 'fail' });
}
