import Redis from 'ioredis';

// Pub/sub por tenant. O worker PUBLICA eventos; a api ASSINA e empurra pro navegador (SSE).
// Pacote node-only: nunca importar no app web (quebraria o bundle do browser).

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
let pub: Redis | null = null;
const pubClient = () => (pub ??= new Redis(url));

const canal = (tenantId: string) => `inbox:${tenantId}`;

export type EventoInbox =
  | { tipo: 'mensagem'; conversaId: string; autor: string; conteudo: string }
  | { tipo: 'status'; conversaId: string; metaId: string; status: string }
  | { tipo: 'handoff'; conversaId: string };

export async function publicar(tenantId: string, ev: EventoInbox): Promise<void> {
  await pubClient().publish(canal(tenantId), JSON.stringify(ev));
}

// Assina o canal de um tenant. Retorna função para cancelar.
export function assinar(tenantId: string, cb: (ev: EventoInbox) => void): () => void {
  const sub = new Redis(url);
  sub.subscribe(canal(tenantId));
  sub.on('message', (_ch, msg) => {
    try { cb(JSON.parse(msg) as EventoInbox); } catch { /* ignora payload invalido */ }
  });
  return () => { sub.unsubscribe(canal(tenantId)).finally(() => sub.quit()); };
}
