'use client';

import { useEffect, useRef, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
declare global { interface Window { Chart?: any } }

const BLUE = '#1565FF';
const TEAL = '#00C6A9';
const GREEN = '#7ED957';
const NEUTRAL = '#DDE3EA';
const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

type DashboardData = {
  conversas: number;
  leads: number;
  fechamento: number;
  receita: number;
  campanhas: number;
  funnel: { n: string; v: number }[];
  donut: number[];
  linha: { ia: number[]; humano: number[] };
  campanhasTop: { nome: string; enviadas: string; lidas: string; status: string }[];
};

const EMPTY_DATA: DashboardData = {
  conversas: 0,
  leads: 0,
  fechamento: 0,
  receita: 0,
  campanhas: 0,
  funnel: [],
  donut: [0, 0, 0],
  linha: { ia: [0, 0, 0, 0, 0, 0, 0], humano: [0, 0, 0, 0, 0, 0, 0] },
  campanhasTop: [],
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
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function weekdayIndex(dateValue: string | null | undefined) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export default function Dashboard() {
  const { token, ready } = useStoredToken();
  const [range, setRange] = useState('7 dias');
  const [data, setData] = useState<DashboardData | null>(null);
  const [setup, setSetup] = useState<any>(null);
  const lineRef = useRef<HTMLCanvasElement | null>(null);
  const barRef = useRef<HTMLCanvasElement | null>(null);
  const donutRef = useRef<HTMLCanvasElement | null>(null);
  const charts = useRef<any[]>([]);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    if (!token) return;
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

      const etapas = Array.isArray(pipeline?.etapas) ? pipeline.etapas : [];
      const cards = Array.isArray(pipeline?.cards) ? pipeline.cards : [];
      const funnel = etapas.map((e: any) => ({ n: e.nome, v: cards.filter((c: any) => c.etapa_pipeline === e.id).length }));
      const agg = (Array.isArray(campanhas) ? campanhas : []).reduce((a: any, c: any) => ({
        ent: a.ent + (+c.entregues || 0),
        lid: a.lid + (+c.lidas || 0),
        fal: a.fal + (+c.falhas || 0),
      }), { ent: 0, lid: 0, fal: 0 });
      const total = cards.length;
      const fechados = funnel.length ? funnel[funnel.length - 1].v : 0;
      const linha = { ia: [...EMPTY_DATA.linha.ia], humano: [...EMPTY_DATA.linha.humano] };
      for (const conversa of conversas) {
        const idx = weekdayIndex(conversa.atualizada_em);
        if (idx !== null) linha.humano[idx] += 1;
      }

      setData({
        conversas: conversas.length,
        leads: cards.length,
        fechamento: total > 0 ? Math.round((fechados / total) * 100) : 0,
        receita: 0,
        campanhas: campanhas.length,
        funnel,
        donut: [agg.ent, agg.lid, agg.fal],
        linha,
        campanhasTop: campanhas.slice(0, 4).map((c: any) => ({
          nome: c.template_nome || 'Campanha',
          enviadas: String(c.enviados || c.total || 0),
          lidas: `${c.total ? Math.round(((+c.lidas || 0) / +c.total) * 100) : 0}%`,
          status: c.status,
        })),
      });
    })();
  }, [token]);

  useEffect(() => {
    if (!data) return;
    let alive = true;
    loadChart().then((Chart) => {
      if (!alive || !Chart) return;
      charts.current.forEach((chart) => chart?.destroy?.());
      charts.current = [];

      Chart.defaults.font.family = "'Poppins', 'Inter', sans-serif";
      Chart.defaults.color = '#526070';
      Chart.defaults.font.size = 11;

      const xAxis = { grid: { display: false }, border: { display: false } };
      const yAxis = { beginAtZero: true, grid: { color: '#EEF2F6' }, border: { display: false } };

      if (lineRef.current) {
        charts.current.push(new Chart(lineRef.current, {
          type: 'line',
          data: {
            labels: DAYS,
            datasets: [
              { label: 'IA', data: data.linha.ia, borderColor: BLUE, backgroundColor: 'rgba(21,101,255,.10)', fill: true, tension: .4, borderWidth: 2, pointRadius: 0 },
              { label: 'Humano', data: data.linha.humano, borderColor: TEAL, borderDash: [5, 4], fill: false, tension: .4, borderWidth: 2, pointRadius: 0 },
            ],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: yAxis, x: xAxis } },
        }));
      }

      if (barRef.current) {
        charts.current.push(new Chart(barRef.current, {
          type: 'bar',
          data: {
            labels: data.funnel.map((f) => f.n),
            datasets: [{ data: data.funnel.map((f) => f.v), backgroundColor: [BLUE, TEAL, GREEN, '#A7F3D0'], borderRadius: 6 }],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: yAxis, x: xAxis } },
        }));
      }

      if (donutRef.current) {
        charts.current.push(new Chart(donutRef.current, {
          type: 'doughnut',
          data: {
            labels: ['Entregues', 'Lidas', 'Falhas'],
            datasets: [{ data: data.donut, backgroundColor: [BLUE, TEAL, NEUTRAL], borderWidth: 0 }],
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

  const d = data || EMPTY_DATA;
  const maxFunnel = Math.max(1, ...d.funnel.map((f) => f.v));
  const donutTotal = d.donut.reduce((a, b) => a + b, 0);
  const deliveredPct = donutTotal > 0 ? Math.round(((d.donut[0] || 0) / donutTotal) * 100) : 0;

  return (
    <Shell title="Dashboard">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Comunora - visão geral - atualizado agora</div>
        </div>
        <div className="nl-filterbar" aria-label="Período">
          {['Hoje', '7 dias', '30 dias'].map((item) => (
            <button key={item} className={`nl-pill ${range === item ? 'active' : ''}`} onClick={() => setRange(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {setup && !setupComplete(setup) && <SetupGuide setup={setup} />}

      <div className="nl-kpis">
        <Kpi label="Conversas" value={d.conversas.toLocaleString('pt-BR')} />
        <Kpi label="Leads no funil" value={d.leads.toLocaleString('pt-BR')} />
        <Kpi label="Fechamento" value={`${d.fechamento}%`} />
        <Kpi label="Receita registrada" value={fmtMoney(d.receita)} />
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
          {d.funnel.length > 0 ? (
            <div className="nl-chart"><canvas ref={barRef} role="img" aria-label="Leads por etapa" /></div>
          ) : (
            <EmptyMetric message="Crie etapas e receba leads para visualizar o funil." />
          )}
        </section>
      </div>

      <div className="nl-dashboard-grid-3">
        <section className="nl-card nl-panel nl-rise">
          <div className="nl-panel-head">
            <h3>Entrega</h3>
            <span className="meta">campanhas</span>
          </div>
          {donutTotal > 0 ? (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ width: 130, height: 130, flex: 'none' }}>
                <canvas ref={donutRef} role="img" aria-label="Status de entrega" />
              </div>
              <div className="nl-legend">
                <div><i style={{ background: BLUE }} />Entregues {deliveredPct}%</div>
                <div><i style={{ background: TEAL }} />Lidas</div>
                <div><i style={{ background: NEUTRAL }} />Falhas</div>
              </div>
            </div>
          ) : (
            <EmptyMetric message="Nenhuma campanha enviada ainda." />
          )}
        </section>

        <section className="nl-card nl-panel nl-rise">
          <div className="nl-panel-head">
            <h3>Funil</h3>
            <span className="meta">conversão</span>
          </div>
          {d.funnel.length > 0 ? d.funnel.map((f) => (
            <div className="nl-funnel-row" key={f.n}>
              <span className="name">{f.n}</span>
              <div className="nl-funnel-track">
                <div className="nl-funnel-fill" style={{ width: `${Math.round((f.v / maxFunnel) * 100)}%` }} />
              </div>
              <span className="num">{f.v}</span>
            </div>
          )) : (
            <EmptyMetric message="O funil será preenchido conforme os contatos entrarem no pipeline." />
          )}
        </section>

        <section className="nl-card nl-panel nl-rise">
          <div className="nl-panel-head">
            <h3>Top campanhas</h3>
            <span className="meta">{range}</span>
          </div>
          {d.campanhasTop.length > 0 ? (
            <table className="nl-table">
              <thead><tr><th>Campanha</th><th>Enviadas</th><th>Lidas</th><th>Status</th></tr></thead>
              <tbody>
                {d.campanhasTop.map((c) => (
                  <tr key={c.nome}>
                    <td>{c.nome}</td>
                    <td>{c.enviadas}</td>
                    <td>{c.lidas}</td>
                    <td><span className={`nl-badge ${c.status === 'ativa' ? 'nl-badge--ok' : ''}`}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyMetric message="As campanhas aparecerão aqui depois do primeiro disparo." />
          )}
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
        <h3>Próximos passos</h3>
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <section className="nl-card nl-kpi nl-rise">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </section>
  );
}

function EmptyMetric({ message }: { message: string }) {
  return <div className="nl-empty nl-empty--compact">{message}</div>;
}
