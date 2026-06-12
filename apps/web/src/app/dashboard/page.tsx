'use client';
import { useEffect, useRef, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
declare global { interface Window { Chart?: any } }

const GREEN = '#22C55E';
const TEAL = '#14B8A6';
const TEAL_LIGHT = '#5EEAD4';
const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

const DEMO = {
  conversas: 1284,
  leads: 342,
  fechamento: 28,
  receita: 18200,
  campanhas: 4,
  funnel: [
    { n: 'Novo', v: 342 },
    { n: 'Qualificado', v: 210 },
    { n: 'Agendado', v: 96 },
    { n: 'Fechado', v: 61 },
  ],
  donut: [72, 21, 7],
  linha: { ia: [120, 148, 135, 180, 172, 96, 110], humano: [30, 34, 28, 40, 38, 18, 22] },
  campanhasTop: [
    { nome: 'Promo Inverno', enviadas: '1.200', lidas: '78%', status: 'ativa' },
    { nome: 'Reativacao', enviadas: '860', lidas: '64%', status: 'ativa' },
    { nome: 'Black Friday', enviadas: '540', lidas: '71%', status: 'rascunho' },
    { nome: 'Boas-vindas', enviadas: '320', lidas: '89%', status: 'ativa' },
  ],
};

function loadChart(): Promise<any> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    if (window.Chart) return resolve(window.Chart);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    script.onload = () => resolve(window.Chart);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function fmtMoney(value: number) {
  return `R$ ${(value / 1000).toFixed(1).replace('.', ',')}k`;
}

export default function Dashboard() {
  const { token, ready } = useStoredToken();
  const [range, setRange] = useState('7 dias');
  const [data, setData] = useState<any>(null);
  const [setup, setSetup] = useState<any>(null);
  const [billingReady, setBillingReady] = useState(false);
  const lineRef = useRef<HTMLCanvasElement | null>(null);
  const barRef = useRef<HTMLCanvasElement | null>(null);
  const donutRef = useRef<HTMLCanvasElement | null>(null);
  const charts = useRef<any[]>([]);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    if (!token) return;
    (async () => {
      const billing = await fetch(`${API}/billing`, { headers: auth(token) }).then(r => r.json()).catch(() => null);
      if (!billing?.pago) {
        window.location.href = '/billing';
        return;
      }
      setBillingReady(true);
    })();
  }, [token]);

  useEffect(() => {
    if (!token || !billingReady) return;
    (async () => {
      const [projetos, agentes, aiSettings] = await Promise.all([
        fetch(`${API}/projetos`, { headers: auth(token) }).then(r => r.json()).catch(() => []),
        fetch(`${API}/agentes`, { headers: auth(token) }).then(r => r.json()).catch(() => []),
        fetch(`${API}/ai-settings`, { headers: auth(token) }).then(r => r.json()).catch(() => []),
      ]);
      const projetoId = projetos?.[0]?.id;
      let pipeline: any = { etapas: [], cards: [] };
      let conversas: any[] = [];
      let campanhas: any[] = [];
      const connectedProject = Array.isArray(projetos) && projetos.find((p: any) => p.phone_number_id);
      const activeAgent = Array.isArray(agentes) && agentes.find((a: any) => a.agente_status === 'ativo');
      const configuredProvider = Array.isArray(aiSettings) && aiSettings.find((s: any) => s.key_last4);

      setSetup({
        hasProject: Array.isArray(projetos) && projetos.length > 0,
        hasWhatsApp: Boolean(connectedProject),
        hasAiKey: Boolean(configuredProvider),
        hasAgent: Boolean(activeAgent),
      });

      if (projetoId) {
        [pipeline, conversas, campanhas] = await Promise.all([
          fetch(`${API}/pipeline?projetoId=${projetoId}`, { headers: auth(token) }).then(r => r.json()).catch(() => ({ etapas: [], cards: [] })),
          fetch(`${API}/conversas?projetoId=${projetoId}`, { headers: auth(token) }).then(r => r.json()).catch(() => []),
          fetch(`${API}/campanhas?projetoId=${projetoId}`, { headers: auth(token) }).then(r => r.json()).catch(() => []),
        ]);
      }

      const etapas = pipeline?.etapas || [];
      const cards = pipeline?.cards || [];
      const funnel = etapas.map((e: any) => ({ n: e.nome, v: cards.filter((c: any) => c.etapa_pipeline === e.id).length }));
      const agg = campanhas.reduce((a: any, c: any) => ({
        ent: a.ent + (+c.entregues || 0),
        lid: a.lid + (+c.lidas || 0),
        fal: a.fal + (+c.falhas || 0),
      }), { ent: 0, lid: 0, fal: 0 });
      const vazio = (conversas?.length || 0) === 0 && cards.length <= 2 && campanhas.length === 0;
      const total = cards.length || 1;
      const fechados = funnel.length ? funnel[funnel.length - 1].v : 0;

      setData({
        demo: vazio,
        conversas: vazio ? DEMO.conversas : conversas.length,
        leads: vazio ? DEMO.leads : cards.length,
        fechamento: vazio ? DEMO.fechamento : Math.round((fechados / total) * 100),
        receita: vazio ? DEMO.receita : Math.max(fechados * 300, 0),
        campanhas: vazio ? DEMO.campanhas : campanhas.length,
        funnel: vazio || !funnel.length ? DEMO.funnel : funnel,
        donut: vazio || (agg.ent + agg.lid + agg.fal) === 0 ? DEMO.donut : [agg.ent, agg.lid, agg.fal],
        campanhasTop: vazio ? DEMO.campanhasTop : campanhas.slice(0, 4).map((c: any) => ({
          nome: c.template_nome || 'Campanha',
          enviadas: String(c.enviados || c.total || 0),
          lidas: `${c.total ? Math.round(((+c.lidas || 0) / +c.total) * 100) : 0}%`,
          status: c.status,
        })),
      });
    })();
  }, [token, billingReady]);

  useEffect(() => {
    if (!data) return;
    let alive = true;
    loadChart().then((Chart) => {
      if (!alive || !Chart) return;
      charts.current.forEach((chart) => chart?.destroy?.());
      charts.current = [];

      Chart.defaults.font.family = "'Sora', 'Inter', sans-serif";
      Chart.defaults.color = '#9a9a9e';
      Chart.defaults.font.size = 11;

      const xAxis = { grid: { display: false }, border: { display: false } };
      const yAxis = { grid: { color: '#f0f0ee' }, border: { display: false } };

      if (lineRef.current) {
        charts.current.push(new Chart(lineRef.current, {
          type: 'line',
          data: {
            labels: DAYS,
            datasets: [
              { label: 'IA', data: DEMO.linha.ia, borderColor: GREEN, backgroundColor: 'rgba(34,197,94,.10)', fill: true, tension: .4, borderWidth: 2, pointRadius: 0 },
              { label: 'Humano', data: DEMO.linha.humano, borderColor: '#c9c4dd', borderDash: [5, 4], fill: false, tension: .4, borderWidth: 2, pointRadius: 0 },
            ],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: yAxis, x: xAxis } },
        }));
      }

      if (barRef.current) {
        charts.current.push(new Chart(barRef.current, {
          type: 'bar',
          data: {
            labels: data.funnel.map((f: any) => f.n),
            datasets: [{ data: data.funnel.map((f: any) => f.v), backgroundColor: [GREEN, TEAL, TEAL_LIGHT, '#A7F3D0'], borderRadius: 6 }],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: yAxis, x: xAxis } },
        }));
      }

      if (donutRef.current) {
        charts.current.push(new Chart(donutRef.current, {
          type: 'doughnut',
          data: {
            labels: ['Entregues', 'Lidas', 'Falhas'],
            datasets: [{ data: data.donut, backgroundColor: [GREEN, TEAL, '#d8d8dc'], borderWidth: 0 }],
          },
          options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } },
        }));
      }
    });

    return () => {
      alive = false;
      charts.current.forEach((chart) => chart?.destroy?.());
    };
  }, [data]);

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;
  if (!billingReady) return <SessionLoading />;

  const d = data || DEMO;
  const maxFunnel = Math.max(1, ...(d.funnel || []).map((f: any) => f.v));
  const donutTotal = (d.donut || [0]).reduce((a: number, b: number) => a + b, 0) || 1;
  const deliveredPct = Math.round(((d.donut?.[0] || 0) / donutTotal) * 100);

  return (
    <Shell title="Dashboard">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Attende — visão geral — atualizado agora</div>
        </div>
        <div className="nl-filterbar" aria-label="Periodo">
          {['Hoje', '7 dias', '30 dias'].map((item) => (
            <button key={item} className={`nl-pill ${range === item ? 'active' : ''}`} onClick={() => setRange(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {d.demo && <div className="nl-demo-note">Modo demonstracao - dados de exemplo ate o WhatsApp gerar trafego</div>}
      {setup && !setupComplete(setup) && <SetupGuide setup={setup} />}

      <div className="nl-kpis">
        <Kpi label="Conversas" value={d.conversas.toLocaleString('pt-BR')} delta="+12% vs. periodo anterior" />
        <Kpi label="Leads no funil" value={d.leads.toLocaleString('pt-BR')} delta="+8% novos hoje" />
        <Kpi label="Fechamento" value={`${d.fechamento}%`} delta="+3pts no mes" />
        <Kpi label="Receita estimada" value={fmtMoney(d.receita)} delta="+15%" />
      </div>

      <div className="nl-dashboard-grid">
        <section className="nl-card nl-panel nl-rise">
          <div className="nl-panel-head">
            <h3>Conversas por dia</h3>
            <span className="meta">IA vs. humano</span>
          </div>
          <div className="nl-chart"><canvas ref={lineRef} role="img" aria-label="Conversas por dia" /></div>
        </section>

        <section className="nl-card nl-panel nl-rise">
          <div className="nl-panel-head">
            <h3>Leads por etapa</h3>
            <span className="meta">pipeline</span>
          </div>
          <div className="nl-chart"><canvas ref={barRef} role="img" aria-label="Leads por etapa" /></div>
        </section>
      </div>

      <div className="nl-dashboard-grid-3">
        <section className="nl-card nl-panel nl-rise">
          <div className="nl-panel-head">
            <h3>Entrega</h3>
            <span className="meta">campanhas</span>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 130, height: 130, flex: 'none' }}>
              <canvas ref={donutRef} role="img" aria-label="Status de entrega" />
            </div>
            <div className="nl-legend">
              <div><i style={{ background: GREEN }} />Entregues {deliveredPct}%</div>
              <div><i style={{ background: TEAL }} />Lidas</div>
              <div><i style={{ background: '#d8d8dc' }} />Falhas</div>
            </div>
          </div>
        </section>

        <section className="nl-card nl-panel nl-rise">
          <div className="nl-panel-head">
            <h3>Funil</h3>
            <span className="meta">conversao</span>
          </div>
          {d.funnel.map((f: any) => (
            <div className="nl-funnel-row" key={f.n}>
              <span className="name">{f.n}</span>
              <div className="nl-funnel-track">
                <div className="nl-funnel-fill" style={{ width: `${Math.round((f.v / maxFunnel) * 100)}%` }} />
              </div>
              <span className="num">{f.v}</span>
            </div>
          ))}
        </section>

        <section className="nl-card nl-panel nl-rise">
          <div className="nl-panel-head">
            <h3>Top campanhas</h3>
            <span className="meta">{range}</span>
          </div>
          <table className="nl-table">
            <thead><tr><th>Campanha</th><th>Enviadas</th><th>Lidas</th><th>Status</th></tr></thead>
            <tbody>
              {d.campanhasTop.map((c: any) => (
                <tr key={c.nome}>
                  <td>{c.nome}</td>
                  <td>{c.enviadas}</td>
                  <td>{c.lidas}</td>
                  <td><span className={`nl-badge ${c.status === 'ativa' ? 'nl-badge--ok' : ''}`}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}

function SetupGuide({ setup }: { setup: any }) {
  const steps = [
    { label: 'Conectar WhatsApp', done: setup.hasWhatsApp, href: '/onboarding' },
    { label: 'Configurar chave de IA', done: setup.hasAiKey, href: '/ai-settings' },
    { label: 'Ativar agente', done: setup.hasAgent, href: '/agentes' },
    { label: 'Receber primeira conversa', done: false, href: '/inbox' },
  ];
  return (
    <section className="nl-card nl-card--pad nl-rise" style={{ marginBottom: 14 }}>
      <div className="nl-panel-head" style={{ marginBottom: 8 }}>
        <h3>Proximos passos</h3>
        <span className="meta">onboarding</span>
      </div>
      <div className="nl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {steps.map((step, index) => (
          <a key={step.label} href={step.href} className="nl-cardlet" style={{ display: 'block', textDecoration: 'none' }}>
            <span className={`nl-badge ${step.done ? 'nl-badge--ok' : 'nl-badge--warn'}`}>
              {step.done ? 'feito' : `passo ${index + 1}`}
            </span>
            <b style={{ display: 'block', marginTop: 10 }}>{step.label}</b>
          </a>
        ))}
      </div>
    </section>
  );
}

function setupComplete(setup: any) {
  return setup.hasWhatsApp && setup.hasAiKey && setup.hasAgent;
}

function Kpi({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <section className="nl-card nl-kpi nl-rise">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="delta">{delta}</div>
    </section>
  );
}
