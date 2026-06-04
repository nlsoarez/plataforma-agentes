// Camada anti-ban para disparos via Evolution (não-oficial).
// Configurável por env; defaults conservadores.

const TZ = process.env.ANTIBAN_TZ ?? 'America/Sao_Paulo';
const INI = parseInt(process.env.ANTIBAN_HORA_INICIO ?? '8', 10);
const FIM = parseInt(process.env.ANTIBAN_HORA_FIM ?? '20', 10);
const DIAS = (process.env.ANTIBAN_DIAS ?? '1,2,3,4,5').split(',').map((d) => parseInt(d, 10)); // 0=dom
const DELAY_MEDIO = parseInt(process.env.ANTIBAN_DELAY_MEDIO_MS ?? '8000', 10);
const DELAY_MIN = parseInt(process.env.ANTIBAN_DELAY_MIN_MS ?? '3000', 10);
const WARM_BASE = parseInt(process.env.ANTIBAN_WARMUP_BASE ?? '20', 10);
const WARM_INC = parseInt(process.env.ANTIBAN_WARMUP_INCREMENTO ?? '20', 10);
const WARM_MAX = parseInt(process.env.ANTIBAN_WARMUP_MAX ?? '400', 10);

// "Agora" no fuso configurado.
function agoraLocal(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

export function dentroDoHorario(): boolean {
  const d = agoraLocal();
  return DIAS.includes(d.getDay()) && d.getHours() >= INI && d.getHours() < FIM;
}

// ms até a próxima janela comercial. minDias=1 força "a partir de amanhã".
export function msAteProximaJanela(minDias = 0): number {
  const local = agoraLocal();
  for (let add = minDias; add < 9; add++) {
    const c = new Date(local);
    c.setDate(local.getDate() + add);
    c.setHours(INI, 0, 0, 0);
    if (c.getTime() > local.getTime() && DIAS.includes(c.getDay())) return c.getTime() - local.getTime();
  }
  return 60 * 60 * 1000;
}

// Atraso gaussiano (Box-Muller) em torno da média, com piso e teto.
export function atrasoGaussiano(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const ms = DELAY_MEDIO + n * (DELAY_MEDIO * 0.4);
  return Math.min(Math.max(ms, DELAY_MIN), DELAY_MEDIO * 3);
}

// Teto diário de envios por instância (aquecimento: cresce com a idade).
export function capDiario(idadeDias: number): number {
  return Math.min(WARM_BASE + idadeDias * WARM_INC, WARM_MAX);
}

// Expande spintax: "Oi {fulano|amigo}, {tudo bem|como vai}?" -> uma variação aleatória.
export function expandirSpintax(texto: string): string {
  const re = /\{([^{}]*)\}/;
  let t = texto;
  let guard = 0;
  while (re.test(t) && guard++ < 50) {
    t = t.replace(re, (_m, g) => {
      const opts = String(g).split('|');
      return opts[Math.floor(Math.random() * opts.length)];
    });
  }
  return t;
}
