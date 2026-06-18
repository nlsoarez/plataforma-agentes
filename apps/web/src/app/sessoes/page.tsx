'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';
import { expireSession, SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Sessao = {
  id: string;
  nome: string;
  phone_number_id: string | null;
  whatsapp_number: string | null;
  status: string;
  connection_state: string;
  last_connection_update: string | null;
  last_error: string | null;
  last_error_at: string | null;
  transporte_driver: string;
};

type Diagnostico = {
  evolutionApiUrl: boolean;
  evolutionApiKey: boolean;
  apiPublicUrl: boolean;
  redisUrl: boolean;
  webhookUrl: string | null;
};

type Evento = {
  id: string;
  projeto_nome: string | null;
  origem: string;
  nivel: string;
  evento: string;
  mensagem: string;
  criado_em: string;
};

function formatPhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return `+${digits}`;
}

function connectionLabel(state: string | null | undefined) {
  if (state === 'open') return 'Conectado';
  if (state === 'close') return 'Desconectado';
  if (state === 'connecting') return 'Conectando';
  return 'Verificando';
}

function stateClass(state: string | null | undefined) {
  if (state === 'open') return 'nl-badge--ok';
  if (state === 'close') return 'nl-badge--off';
  return 'nl-badge--warn';
}

export default function SessoesPage() {
  const { token, ready } = useStoredToken();
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => { if (token) carregar(); }, [token]);

  const fluxoPronto = Boolean(diagnostico?.apiPublicUrl && diagnostico?.redisUrl && diagnostico?.evolutionApiUrl && diagnostico?.evolutionApiKey);
  const resumo = useMemo(() => ({
    total: sessoes.length,
    conectadas: sessoes.filter((s) => s.connection_state === 'open').length,
    pendentes: sessoes.filter((s) => s.connection_state !== 'open').length,
  }), [sessoes]);

  async function carregar() {
    if (!token) return;
    setLoading(true);
    try {
      const [sessoesRes, diagnosticoRes, eventosRes] = await Promise.all([
        fetch(`${API}/sessoes`, { headers: auth(token) }),
        fetch(`${API}/sessoes/diagnostico`, { headers: auth(token) }),
        fetch(`${API}/sessoes/eventos`, { headers: auth(token) }),
      ]);
      if ([sessoesRes, diagnosticoRes, eventosRes].some((r) => r.status === 401)) {
        expireSession();
        return;
      }
      const sessoesData = await sessoesRes.json();
      const diagnosticoData = await diagnosticoRes.json();
      const eventosData = await eventosRes.json();
      setSessoes(Array.isArray(sessoesData) ? sessoesData : []);
      setDiagnostico(diagnosticoData);
      setEventos(Array.isArray(eventosData) ? eventosData : []);
    } finally {
      setLoading(false);
    }
  }

  async function acao(id: string, nome: 'sincronizar' | 'logout') {
    if (!token) return;
    setMsg('');
    const r = await fetch(`${API}/sessoes/${id}/${nome}`, { method: 'POST', headers: auth(token) });
    const d = await r.json();
    if (r.status === 401) {
      expireSession();
      return;
    }
    setMsg(d.ok ? (nome === 'sincronizar' ? 'Conexão verificada.' : 'WhatsApp desconectado.') : d.message || JSON.stringify(d));
    await carregar();
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Conexões WhatsApp">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Conexões WhatsApp</h1>
          <div className="sub">Números conectados, webhook e saúde das instâncias Evolution.</div>
        </div>
        <a className="nl-btn nl-btn--accent" href="/onboarding">Nova conexão</a>
      </div>

      <section className="nl-session-hero nl-card nl-card--pad">
        <div>
          <div className="eyebrow">Fluxo automático</div>
          <h2>WhatsApp conectado sem configuração manual por cliente.</h2>
          <p>A Comunora cria a instância, aponta o webhook para a API e roteia as mensagens para o Inbox correto.</p>
        </div>
        <div className="nl-session-health">
          <span className={`nl-badge ${diagnostico?.evolutionApiUrl ? 'nl-badge--ok' : 'nl-badge--warn'}`}>Evolution URL</span>
          <span className={`nl-badge ${diagnostico?.evolutionApiKey ? 'nl-badge--ok' : 'nl-badge--warn'}`}>API key</span>
          <span className={`nl-badge ${diagnostico?.apiPublicUrl ? 'nl-badge--ok' : 'nl-badge--warn'}`}>Webhook</span>
          <span className={`nl-badge ${diagnostico?.redisUrl ? 'nl-badge--ok' : 'nl-badge--warn'}`}>Fila</span>
        </div>
      </section>

      {!fluxoPronto && diagnostico && (
        <p className="nl-error" style={{ maxWidth: 980 }}>
          A conexão técnica ainda não está completa. Mensagens reais podem não chegar até a configuração ser finalizada.
        </p>
      )}

      <section className="nl-session-summary">
        <div className="nl-card nl-card--pad">
          <span>Total</span>
          <b>{resumo.total}</b>
          <small>conexões criadas</small>
        </div>
        <div className="nl-card nl-card--pad">
          <span>Conectadas</span>
          <b>{resumo.conectadas}</b>
          <small>prontas para receber mensagem</small>
        </div>
        <div className="nl-card nl-card--pad">
          <span>Pendentes</span>
          <b>{resumo.pendentes}</b>
          <small>aguardando QR, sync ou reconexão</small>
        </div>
      </section>

      <section className="nl-session-grid">
        {sessoes.length === 0 && (
          <div className="nl-card nl-card--pad nl-empty">Nenhuma conexão criada.</div>
        )}
        {sessoes.map((s) => {
          const phone = formatPhone(s.whatsapp_number);
          return (
            <article key={s.id} className="nl-session-card nl-card nl-card--pad">
              <div className="nl-session-card__top">
                <div>
                  <h3>{s.nome}</h3>
                  <p>{phone || 'Número ainda não identificado'}</p>
                </div>
                <span className={`nl-badge ${stateClass(s.connection_state)}`}>{connectionLabel(s.connection_state)}</span>
              </div>
              <dl>
                <div><dt>Instância</dt><dd>{s.phone_number_id || '-'}</dd></div>
                <div><dt>Driver</dt><dd>{s.transporte_driver}</dd></div>
                <div><dt>Status</dt><dd>{s.status}</dd></div>
                <div><dt>Atualizado</dt><dd>{s.last_connection_update ? new Date(s.last_connection_update).toLocaleString('pt-BR') : '-'}</dd></div>
              </dl>
              {s.last_error && (
                <div className="nl-session-error" title={s.last_error}>
                  {s.last_error.length > 120 ? `${s.last_error.slice(0, 120)}...` : s.last_error}
                </div>
              )}
              <div className="nl-row" style={{ marginTop: 14 }}>
                <button className="nl-btn nl-btn--ghost nl-btn--sm" disabled={loading} onClick={() => acao(s.id, 'sincronizar')}>Verificar</button>
                <button className="nl-btn nl-btn--ghost nl-btn--sm" disabled={loading} onClick={() => acao(s.id, 'logout')}>Desconectar</button>
              </div>
            </article>
          );
        })}
      </section>

      <div className="nl-card nl-card--pad nl-session-events">
        <div className="nl-row" style={{ justifyContent: 'space-between' }}>
          <b>Eventos recentes</b>
          <button className="nl-btn nl-btn--ghost nl-btn--sm" disabled={loading} onClick={carregar}>Atualizar</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {eventos.length === 0 && <div className="faint">Nenhum evento operacional registrado ainda.</div>}
          {eventos.map((e) => (
            <div key={e.id} className="nl-log-row">
              <span className={`nl-badge ${e.nivel === 'error' ? 'nl-badge--warn' : e.nivel === 'info' ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{e.nivel}</span>
              <div>
                <b>{e.evento}</b>
                <div className="faint">{e.projeto_nome || 'Projeto'} - {e.origem} - {new Date(e.criado_em).toLocaleString('pt-BR')}</div>
                <div>{e.mensagem}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {msg && <p className={msg.includes('verificada') || msg.includes('desconectado') ? 'nl-success' : 'nl-error'} style={{ maxWidth: 980 }}>{msg}</p>}
    </Shell>
  );
}
