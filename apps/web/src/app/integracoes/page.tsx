'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type ApiKey = { id: string; nome: string; prefixo: string; escopos: string[]; ativo: boolean; ultimo_uso_em: string | null };
type Hook = { id: string; nome: string; url: string; eventos: string[]; ativo: boolean };
type CalendarOption = { id: string; summary: string; primary?: boolean; accessRole?: string | null; backgroundColor?: string | null };
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
    calendars?: CalendarOption[];
    calendarsCacheAt?: string | null;
  };
  calendarWebhook?: { configured: boolean };
};
type AutomationStatus = {
  appointmentReminders?: { pendentes?: number; enviados_24h?: number; falhas_24h?: number };
  leadReactivation?: { pendentes?: number; enviados_24h?: number; falhas_24h?: number };
};
type IntegracoesPanel = 'calendar' | 'automacoes' | 'api' | 'webhooks';

export default function IntegracoesPage() {
  const { token, ready } = useStoredToken();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [calendarId, setCalendarId] = useState('');
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [novaKey, setNovaKey] = useState('');
  const [keyMsg, setKeyMsg] = useState('');
  const [hook, setHook] = useState({ nome: '', url: '', secret: '' });
  const [msg, setMsg] = useState('');
  const [calendarMsg, setCalendarMsg] = useState('');
  const [activePanel, setActivePanel] = useState<IntegracoesPanel>('calendar');
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => { if (token) carregar(); }, [token]);

  async function carregar() {
    if (!token) return;
    const [k, h, s, a] = await Promise.all([
      fetch(`${API}/api-keys`, { headers: auth(token) }).then((r) => r.json()),
      fetch(`${API}/integracoes/webhooks`, { headers: auth(token) }).then((r) => r.json()),
      fetch(`${API}/integracoes/status`, { headers: auth(token) }).then((r) => r.json()),
      fetch(`${API}/integracoes/automations/status`, { headers: auth(token) }).then((r) => r.json()).catch(() => null),
    ]);
    setKeys(k);
    setHooks(h);
    setStatus(s);
    setAutomationStatus(a);
    const cachedCalendars = s?.googleCalendar?.calendars || [];
    setCalendars(cachedCalendars);
    setCalendarId(s?.googleCalendar?.calendarId || cachedCalendars.find((c: CalendarOption) => c.primary)?.id || cachedCalendars[0]?.id || '');
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

  async function carregarCalendarios() {
    if (!token) return;
    setCalendarLoading(true);
    setCalendarMsg('');
    try {
      const r = await fetch(`${API}/integracoes/google-calendar/calendars`, { headers: auth(token) });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d.message || JSON.stringify(d));
      setCalendars(d.calendars || []);
      setCalendarId(d.selectedCalendarId || d.calendars?.find((c: CalendarOption) => c.primary)?.id || d.calendars?.[0]?.id || '');
    } catch (e: any) {
      setCalendarMsg(e?.message || 'Falha ao listar agendas.');
    } finally {
      setCalendarLoading(false);
    }
  }

  async function salvarCalendario() {
    if (!token || !calendarId) return;
    setCalendarMsg('');
    const r = await fetch(`${API}/integracoes/google-calendar/calendar`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ calendarId }),
    });
    const d = await r.json();
    setCalendarMsg(r.ok && d.ok ? 'Agenda selecionada salva.' : d.message || JSON.stringify(d));
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

      <div className="nl-tabs nl-tabs--page" role="tablist" aria-label="Areas de integracoes">
        <button type="button" id="integrations-tab-calendar" role="tab" aria-selected={activePanel === 'calendar'} aria-controls="integrations-panel-calendar" className={`nl-tab ${activePanel === 'calendar' ? 'active' : ''}`} onClick={() => setActivePanel('calendar')}>
          Google Calendar
          <span>{status?.googleCalendar?.tenantConnected ? 'ok' : 'off'}</span>
        </button>
        <button type="button" id="integrations-tab-automacoes" role="tab" aria-selected={activePanel === 'automacoes'} aria-controls="integrations-panel-automacoes" className={`nl-tab ${activePanel === 'automacoes' ? 'active' : ''}`} onClick={() => setActivePanel('automacoes')}>
          Automacoes
        </button>
        <button type="button" id="integrations-tab-api" role="tab" aria-selected={activePanel === 'api'} aria-controls="integrations-panel-api" className={`nl-tab ${activePanel === 'api' ? 'active' : ''}`} onClick={() => setActivePanel('api')}>
          API publica
          <span>{keys.length}</span>
        </button>
        <button type="button" id="integrations-tab-webhooks" role="tab" aria-selected={activePanel === 'webhooks'} aria-controls="integrations-panel-webhooks" className={`nl-tab ${activePanel === 'webhooks' ? 'active' : ''}`} onClick={() => setActivePanel('webhooks')}>
          Webhooks
          <span>{hooks.length}</span>
        </button>
      </div>

      <div className="nl-dashboard-grid">
        {activePanel === 'calendar' && (
        <section className="nl-card nl-card--pad nl-tab-panel" id="integrations-panel-calendar" role="tabpanel" aria-labelledby="integrations-tab-calendar">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Google Calendar</div>
          <h2 style={{ marginTop: 0 }}>Agenda do cliente</h2>
          <p className="sub">
            {status?.googleCalendar?.tenantConnected
              ? `Conectado em ${status.googleCalendar.accountEmail}. Os agendamentos do agente entram nessa conta.`
              : 'Cada cliente deve conectar a propria conta Google para o agente criar eventos e validar conflitos na agenda dele.'}
          </p>
          <div className="nl-row" style={{ flexWrap: 'wrap', marginTop: 14 }}>
            <span className={status?.googleCalendar?.tenantConnected ? 'nl-badge nl-badge--ok' : 'nl-badge nl-badge--warn'}>
              {status?.googleCalendar?.tenantConnected ? 'conectado' : 'desconectado'}
            </span>
            <span className={status?.googleCalendar?.oauthConfigured ? 'nl-badge nl-badge--ok' : 'nl-badge nl-badge--warn'}>
              oauth {status?.googleCalendar?.oauthConfigured ? 'ativo' : 'pendente'}
            </span>
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
              <button className="nl-btn nl-btn--ghost" onClick={carregarCalendarios} disabled={calendarLoading}>
                {calendarLoading ? 'Carregando...' : 'Atualizar agendas'}
              </button>
            )}
            {status?.googleCalendar?.tenantConnected && (
              <button className="nl-btn nl-btn--ghost" onClick={desconectarCalendar}>Desconectar</button>
            )}
          </div>
          {status?.googleCalendar?.tenantConnected && (
            <div style={{ marginTop: 16 }}>
              <label className="nl-label">Agenda usada pelo agente</label>
              <div className="nl-row" style={{ alignItems: 'flex-end' }}>
                <select className="nl-input" value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
                  {calendars.length === 0 && status?.googleCalendar?.calendarId && (
                    <option value={status.googleCalendar.calendarId}>{status.googleCalendar.calendarId}</option>
                  )}
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.summary}{calendar.primary ? ' (principal)' : ''}
                    </option>
                  ))}
                </select>
                <button className="nl-btn nl-btn--accent" onClick={salvarCalendario} disabled={!calendarId}>Salvar agenda</button>
              </div>
              <p className="sub" style={{ marginTop: 8 }}>A Comunora grava eventos somente na agenda selecionada por este cliente.</p>
            </div>
          )}
        </section>
        )}

        {activePanel === 'automacoes' && (
        <section className="nl-card nl-card--pad nl-tab-panel" id="integrations-panel-automacoes" role="tabpanel" aria-labelledby="integrations-tab-automacoes">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Automacoes</div>
          <h2 style={{ marginTop: 0 }}>Status operacional</h2>
          <p className="sub">Acompanhe se lembretes e reativacoes estao acumulando falhas ou fila.</p>
          <div className="nl-dashboard-grid" style={{ marginTop: 14 }}>
            <div style={{ border: '1px solid var(--comunora-border, #DDE3EA)', borderRadius: 16, padding: 16 }}>
              <div className="eyebrow">Lembretes</div>
              <strong>{automationStatus?.appointmentReminders?.pendentes ?? 0}</strong>
              <p className="sub">pendentes</p>
              <p className="sub">{automationStatus?.appointmentReminders?.enviados_24h ?? 0} enviados em 24h</p>
              <p className="sub">{automationStatus?.appointmentReminders?.falhas_24h ?? 0} falhas em 24h</p>
            </div>
            <div style={{ border: '1px solid var(--comunora-border, #DDE3EA)', borderRadius: 16, padding: 16 }}>
              <div className="eyebrow">Reativacao</div>
              <strong>{automationStatus?.leadReactivation?.pendentes ?? 0}</strong>
              <p className="sub">pendentes</p>
              <p className="sub">{automationStatus?.leadReactivation?.enviados_24h ?? 0} enviados em 24h</p>
              <p className="sub">{automationStatus?.leadReactivation?.falhas_24h ?? 0} falhas em 24h</p>
            </div>
          </div>
        </section>
        )}

        {activePanel === 'api' && (
        <section className="nl-card nl-card--pad nl-tab-panel" id="integrations-panel-api" role="tabpanel" aria-labelledby="integrations-tab-api">
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
        )}

        {activePanel === 'webhooks' && (
        <section className="nl-card nl-card--pad nl-tab-panel" id="integrations-panel-webhooks" role="tabpanel" aria-labelledby="integrations-tab-webhooks">
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
        )}
      </div>
    </Shell>
  );
}
