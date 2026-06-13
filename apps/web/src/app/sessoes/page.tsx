'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { expireSession, SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Sessao = {
  id: string;
  nome: string;
  phone_number_id: string | null;
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

function connectionLabel(state: string | null | undefined) {
  if (state === 'open') return 'Conectado';
  if (state === 'close') return 'Desconectado';
  if (state === 'connecting') return 'Conectando';
  return 'Verificando';
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

  const fluxoPronto = Boolean(diagnostico?.apiPublicUrl && diagnostico?.redisUrl && diagnostico?.evolutionApiUrl && diagnostico?.evolutionApiKey);

  return (
    <Shell title="Conexões WhatsApp">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Conexões WhatsApp</h1>
          <div className="sub">Números conectados, estado da conexão e eventos recentes</div>
        </div>
        <a className="nl-btn nl-btn--accent" href="/onboarding">Nova conexão</a>
      </div>

      {diagnostico && (
        <div className="nl-card nl-card--pad" style={{ maxWidth: 980, marginBottom: 16 }}>
          <div className="nl-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <b>Fluxo automático</b>
              <div className="faint" style={{ marginTop: 4 }}>
                A Comunora cria a conexão, configura o recebimento de mensagens e roteia tudo para o inbox correto.
              </div>
            </div>
            <div className="nl-row">
              <span className={`nl-badge ${diagnostico.apiPublicUrl ? 'nl-badge--ok' : 'nl-badge--warn'}`}>Webhook</span>
              <span className={`nl-badge ${fluxoPronto ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{fluxoPronto ? 'Pronto' : 'Atenção'}</span>
            </div>
          </div>
          {!fluxoPronto && (
            <p className="nl-error" style={{ marginBottom: 0 }}>
              A conexão técnica ainda não está completa. Mensagens reais podem não chegar até a configuração ser finalizada.
            </p>
          )}
        </div>
      )}

      <div className="nl-card" style={{ maxWidth: 980, overflow: 'hidden' }}>
        <table className="nl-table">
          <thead>
            <tr>
              <th>Projeto</th>
              <th>Conexão</th>
              <th>Estado</th>
              <th>Status</th>
              <th>Atualizado</th>
              <th>Último erro</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sessoes.length === 0 && (
              <tr><td colSpan={7} className="faint" style={{ padding: 24, textAlign: 'center' }}>Nenhuma conexão criada.</td></tr>
            )}
            {sessoes.map((s) => (
              <tr key={s.id}>
                <td><b>{s.nome}</b><div className="faint">WhatsApp</div></td>
                <td>{s.phone_number_id || '-'}</td>
                <td><span className={`nl-badge ${s.connection_state === 'open' ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{connectionLabel(s.connection_state)}</span></td>
                <td>{s.status}</td>
                <td>{s.last_connection_update ? new Date(s.last_connection_update).toLocaleString('pt-BR') : '-'}</td>
                <td style={{ maxWidth: 220 }}>
                  {s.last_error ? (
                    <span title={s.last_error}>{s.last_error.length > 58 ? `${s.last_error.slice(0, 58)}...` : s.last_error}</span>
                  ) : <span className="faint">-</span>}
                </td>
                <td>
                  <div className="nl-row">
                    <button className="nl-btn nl-btn--ghost nl-btn--sm" disabled={loading} onClick={() => acao(s.id, 'sincronizar')}>Verificar</button>
                    <button className="nl-btn nl-btn--ghost nl-btn--sm" disabled={loading} onClick={() => acao(s.id, 'logout')}>Desconectar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="nl-card nl-card--pad" style={{ maxWidth: 980, marginTop: 16 }}>
        <div className="nl-row" style={{ justifyContent: 'space-between' }}>
          <b>Eventos recentes</b>
          <button className="nl-btn nl-btn--ghost nl-btn--sm" disabled={loading} onClick={carregar}>Atualizar</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {eventos.length === 0 && <div className="faint">Nenhum evento operacional registrado ainda.</div>}
          {eventos.map((e) => (
            <div key={e.id} className="nl-log-row">
              <span className={`nl-badge ${e.nivel === 'error' ? 'nl-badge--warn' : 'nl-badge--ok'}`}>{e.nivel}</span>
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
