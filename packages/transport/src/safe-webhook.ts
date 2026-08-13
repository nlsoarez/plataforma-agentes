import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export type SafeWebhookResponse = { ok: boolean; status: number; body: string };
type ResolvedTarget = { url: URL; address: string; family: 4 | 6 };

function ipv4ToNumber(address: string): number {
  return address.split('.').reduce((value, octet) => (value * 256) + Number(octet), 0) >>> 0;
}

function ipv4InCidr(address: string, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(base) & mask);
}

export function isPublicIp(addressRaw: string): boolean {
  const address = addressRaw.toLowerCase().split('%')[0];
  const family = isIP(address);
  if (family === 4) {
    const blocked: Array<[string, number]> = [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
      ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['224.0.0.0', 4], ['240.0.0.0', 4],
    ];
    return !blocked.some(([base, prefix]) => ipv4InCidr(address, base, prefix));
  }
  if (family === 6) {
    if (address === '::' || address === '::1') return false;
    if (address.startsWith('::ffff:')) return isPublicIp(address.slice(7));
    return !address.startsWith('fc')
      && !address.startsWith('fd')
      && !/^fe[89ab]/.test(address)
      && !address.startsWith('ff')
      && !address.startsWith('2001:db8:');
  }
  return false;
}

export async function resolveSafeWebhookTarget(rawUrl: string, allowHttp = process.env.NODE_ENV !== 'production'): Promise<ResolvedTarget> {
  let url: URL;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('URL de webhook invalida');
  }
  if (url.username || url.password) throw new Error('URL de webhook nao pode conter credenciais');
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new Error('webhook deve usar HTTPS');
  }
  if (url.href.length > 2048) throw new Error('URL de webhook excede o limite');
  if (['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase()) || url.hostname.toLowerCase().endsWith('.local')) {
    throw new Error('destino interno de webhook bloqueado');
  }

  const literalFamily = isIP(url.hostname);
  const addresses = literalFamily
    ? [{ address: url.hostname, family: literalFamily as 4 | 6 }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicIp(entry.address))) {
    throw new Error('destino interno ou reservado de webhook bloqueado');
  }
  return { url, address: addresses[0].address, family: addresses[0].family as 4 | 6 };
}

export async function safeWebhookPost(
  rawUrl: string,
  headers: Record<string, string>,
  body: string,
  options: { timeoutMs?: number; allowHttp?: boolean; maxResponseBytes?: number } = {},
): Promise<SafeWebhookResponse> {
  const target = await resolveSafeWebhookTarget(rawUrl, options.allowHttp);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 65_536;
  const request = target.url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = request({
      protocol: target.url.protocol,
      hostname: target.address,
      family: target.family,
      port: target.url.port || (target.url.protocol === 'https:' ? 443 : 80),
      method: 'POST',
      path: `${target.url.pathname}${target.url.search}`,
      servername: target.url.hostname,
      headers: { ...headers, Host: target.url.host, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= maxResponseBytes) chunks.push(chunk);
      });
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        resolve({ ok: status >= 200 && status < 300, status, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout do webhook')));
    req.on('error', reject);
    req.end(body);
  });
}
