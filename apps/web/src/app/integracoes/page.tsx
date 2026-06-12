'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type ApiKey = { id: string; nome: string; prefixo: string; escopos: string[]; ativo: boolean; ultimo_uso_em: string | null };
type Hook = { id: string; nome: string; url: string; eventos: string[]; ativo: boolean };
type Status = {
  googleCalendar?: {
    configured: boolean;
    tenantConnected: boolean;
    accountEmail: string | null;
    calendarId: string | null;
    mode: string | null;
    lastSyncAt: string | null;
    lastError: string | null;
    oauthConfigured: boolean;
    redirectUri: string;
  };
  calendarWebhook?: { configured: boolean };
};

export default function IntegracoesPage() {
  const { token, ready } = useStoredToken();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [novaKey, setNovaKey] = useState('');
  const [keyMsg, setKeyMsg] = useState('');
  const [hook, setHook] = useState({ nome: '', url: '', secret: '' });
  const [msg, setMsg] = useState('');
  const [calendarMsg, setCalendarMsg] = useState('');
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => { if (token) carregar(); }, [token]);

  async function carregar() {
    if (!token) return;
    const [k, h, s] = await Promise.all([
      fetch(`${API}/api-keys`, { headers: auth(token) }).then((r) => r.json()),
      fetch(`${API}/integracoes/webhooks`, { headers: auth(token) }).then((r) => r.json()),
      fetch(`${API}/integracoes/status`, { headers: auth(token) }).then((r) => r.json()),
    ]);
    setKeys(k);
    setHooks(h);
    setStatus(s);
  }

  async function criarKey() {
    if (!token) return;
    const r = await fetch(`${API}/api-keys`, { method: 'POST', headers: auth(token), body: JSON.stringify({ nome: novaKey || 'Chave API' }) });
    const d = await r.json();
    setKeyMsg(d.apiKey ? `Copie agora: ${d.apiKey}` : JSON.stringify(d));
    setNovaKey('');
    await carregar();
  }

  async function criarHook() {
    if (!token) return;
    const r = await fetch(`${API}/integracoes/webhooks`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify(hook),
    });
    setMsg(r.ok ? 'Webhook criado.' : JSON.stringify(await r.json()));
    setHook({ nome: '', url: '', secret: '' });
    await carregar();
  }

  async function testarHook(id: string) {
    if (!token) return;
    const r = await fetch(`${API}/integracoes/webhooks/${id}/testar`, { method: 'POST', headers: auth(token) });
    setMsg(JSON.stringify(await r.json()));
  }

  async function conectarCalendar() {
    if (!token) return;
    setCalendarMsg('');
    const r = await fetch(`${API}/integracoes/google-calendar/start`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ origem: window.location.origin }),
    });
    const d = await r.json();
    if (d.url) window.location.href = d.url;
    else setCalendarMsg(d.message || JSON.stringify(d));
  }

  async function desconectarCalendar() {
    if (!token) return;
    const r = await fetch(`${API}/integracoes/google-calendar/disconnect`, { method: 'POST', headers: auth(token) });
    setCalendarMsg(r.ok ? 'Google Calendar desconectado.' : JSON.stringify(await r.json()));
    await carregar();
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Integrações">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>API e webhooks</h1>
          <div className="sub">Compatível com integrações externas via x-api-key e eventos outbound</div>
        </div>
      </div>

      <div className="nl-dashboard-grid">
        <section className="nl-card nl-card--pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Google Calendar</div>
          <h2 style={{ marginTop: 0 }}>Agenda do cliente</h2>
          <p className="sub">
            {status?.googleCalendar?.tenantConnected
              ? `Conectado em ${status.googleCalendar.accountEmail}. Os agendamentos do agente entram nessa conta.`
              : 'Cada cliente deve conectar a propria conta Google para o agente criar eventos na agenda dele.'}
          </p>
          <div className="nl-row" style={{ flexWrap: 'wrap', marginTop: 14 }}>
            <span className={status?.googleCalendar?.tenantConnected ? 'nl-badge nl-badge--ok' : 'nl-badge nl-badge--warn'}>
              {status?.googleCalendar?.tenantConnected ? 'conectado' : 'desconectado'}
            </span>
            <span className={status?.googleCalendar?.oauthConfigured ? 'nl-badge nl-badge--ok' : 'nl-badge nl-badge--warn'}>
              oauth {status?.googleCalendar?.oauthConfigured ? 'ativo' : 'pendente'}
            </span>
            {status?.googleCalendar?.mode === 'service_account' && <span className="nl-badge">fallback global</span>}
          </div>
          {status?.googleCalendar?.lastError && <p className="nl-error">{status.googleCalendar.lastError}</p>}
          {calendarMsg && <p className="nl-success">{calendarMsg}</p>}
          {!status?.googleCalendar?.oauthConfigured && (
            <p className="nl-error">OAuth do Google Calendar nao esta configurado na API.</p>
          )}
          <div className="nl-row" style={{ marginTop: 16 }}>
            <button className="nl-btn nl-btn--accent" onClick={conectarCalendar} disabled={!status?.googleCalendar?.oauthConfigured}>
              {status?.googleCalendar?.tenantConnected ? 'Reconectar' : 'Conectar Google Calendar'}
            </button>
            {status?.googleCalendar?.tenantConnected && (
              <button className="nl-btn nl-btn--ghost" onClick={desconectarCalendar}>Desconectar</button>
            )}
          </div>
        </section>

        <section className="nl-card nl-card--pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>API pública</div>
          <label className="nl-label">Nome da chave</label>
          <div className="nl-row" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
            <input className="nl-input" value={novaKey} onChange={(e) => setNovaKey(e.target.value)} placeholder="ex: n8n produção" />
            <button className="nl-btn nl-btn--accent" onClick={criarKey}>Gerar</button>
          </div>
          {keyMsg && <p className="nl-success" style={{ overflowWrap: 'anywhere' }}>{keyMsg}</p>}
          <table className="nl-table">
            <thead><tr><th>Nome</th><th>Prefixo</th><th>Status</th></tr></thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}><td>{key.nome}</td><td>{key.prefixo}</td><td>{key.ativo ? 'ativa' : 'revogada'}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="nl-card nl-card--pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Webhook outbound</div>
          <label className="nl-label">Nome</label>
          <input className="nl-input" value={hook.nome} onChange={(e) => setHook({ ...hook, nome: e.target.value })} style={{ marginBottom: 12 }} />
          <label className="nl-label">URL</label>
          <input className="nl-input" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} style={{ marginBottom: 12 }} />
          <label className="nl-label">Secret opcional</label>
          <input className="nl-input" value={hook.secret} onChange={(e) => setHook({ ...hook, secret: e.target.value })} style={{ marginBottom: 12 }} />
          <button className="nl-btn nl-btn--accent" style={{ width: '100%' }} onClick={criarHook}>Adicionar webhook</button>
          {msg && <p className="nl-success">{msg}</p>}
          <table className="nl-table" style={{ marginTop: 14 }}>
            <thead><tr><th>Nome</th><th>URL</th><th>Ação</th></tr></thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id}><td>{h.nome}</td><td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.url}</td><td><button className="nl-btn nl-btn--ghost nl-btn--sm" onClick={() => testarHook(h.id)}>Testar</button></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}
