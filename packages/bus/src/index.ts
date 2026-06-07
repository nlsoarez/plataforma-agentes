import Redis from 'ioredis';

// Pub/sub por tenant. O worker e a api PUBLICAM; a api ASSINA e empurra pro navegador (SSE).
// Pacote node-only: nunca importar no app web.

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
let pub: Redis | null = null;
const pubClient = () => (pub ??= new Redis(url));
const canal = (tenantId: string) => `inbox:${tenantId}`;

export type EventoInbox =
  | { tipo: 'mensagem'; conversaId: string; autor: string; conteudo: string }
  | { tipo: 'status'; conversaId: string; metaId: string; status: string }
  | { tipo: 'handoff'; conversaId: string }
  | { tipo: 'card'; contatoId: string; etapaId: string }
  | { tipo: 'erro'; conversaId: string; mensagem: string };

export async function publicar(tenantId: string, ev: EventoInbox): Promise<void> {
  await pubClient().publish(canal(tenantId), JSON.stringify(ev));
}

export function assinar(tenantId: string, cb: (ev: EventoInbox) => void): () => void {
  const sub = new Redis(url);
  sub.subscribe(canal(tenantId));
  sub.on('message', (_ch, msg) => { try { cb(JSON.parse(msg) as EventoInbox); } catch { /* ignora */ } });
  return () => { sub.unsubscribe(canal(tenantId)).finally(() => sub.quit()); };
}
