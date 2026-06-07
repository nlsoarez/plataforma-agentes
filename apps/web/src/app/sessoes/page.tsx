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
    setMsg(d.ok ? `${nome} executado.` : d.message || JSON.stringify(d));
    await carregar();
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Sessoes">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Sessoes Evolution</h1>
          <div className="sub">Estado persistente das instancias conectadas</div>
        </div>
        <a className="nl-btn nl-btn--accent" href="/onboarding">Nova conexao</a>
      </div>

      {diagnostico && (
        <div className="nl-card nl-card--pad" style={{ maxWidth: 980, marginBottom: 16 }}>
          <div className="nl-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <b>Diagnostico do fluxo</b>
              <div className="faint" style={{ marginTop: 4 }}>
                Webhook esperado: {diagnostico.webhookUrl || 'API_PUBLIC_URL nao configurada'}
              </div>
            </div>
            <div className="nl-row">
              <span className={`nl-badge ${diagnostico.evolutionApiUrl ? 'nl-badge--ok' : 'nl-badge--warn'}`}>URL</span>
              <span className={`nl-badge ${diagnostico.evolutionApiKey ? 'nl-badge--ok' : 'nl-badge--warn'}`}>API key</span>
              <span className={`nl-badge ${diagnostico.apiPublicUrl ? 'nl-badge--ok' : 'nl-badge--warn'}`}>Webhook</span>
              <span className={`nl-badge ${diagnostico.redisUrl ? 'nl-badge--ok' : 'nl-badge--warn'}`}>Redis</span>
            </div>
          </div>
          {!diagnostico.apiPublicUrl && (
            <p className="nl-error" style={{ marginBottom: 0 }}>
              Sem API_PUBLIC_URL publica, o QR pode conectar, mas as mensagens reais nao chegam no sistema.
            </p>
          )}
        </div>
      )}

      <div className="nl-card" style={{ maxWidth: 980, overflow: 'hidden' }}>
        <table className="nl-table">
          <thead>
            <tr>
              <th>Projeto</th>
              <th>Instancia</th>
              <th>Conexao</th>
              <th>Status</th>
              <th>Atualizado</th>
              <th>Ultimo erro</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {sessoes.length === 0 && (
              <tr><td colSpan={7} className="faint" style={{ padding: 24, textAlign: 'center' }}>Nenhuma sessao conectada.</td></tr>
            )}
            {sessoes.map((s) => (
              <tr key={s.id}>
                <td><b>{s.nome}</b><div className="faint">{s.transporte_driver}</div></td>
                <td>{s.phone_number_id || '-'}</td>
                <td><span className={`nl-badge ${s.connection_state === 'open' ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{s.connection_state}</span></td>
                <td>{s.status}</td>
                <td>{s.last_connection_update ? new Date(s.last_connection_update).toLocaleString('pt-BR') : '-'}</td>
                <td style={{ maxWidth: 220 }}>
                  {s.last_error ? (
                    <span title={s.last_error}>{s.last_error.length > 58 ? `${s.last_error.slice(0, 58)}...` : s.last_error}</span>
                  ) : <span className="faint">-</span>}
                </td>
                <td>
                  <div className="nl-row">
                    <button className="nl-btn nl-btn--ghost nl-btn--sm" disabled={loading} onClick={() => acao(s.id, 'sincronizar')}>Sync</button>
                    <button className="nl-btn nl-btn--ghost nl-btn--sm" disabled={loading} onClick={() => acao(s.id, 'logout')}>Logout</button>
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
          {eventos.length === 0 && <div className="faint">Nenhum erro operacional registrado ainda.</div>}
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

      {msg && <p className={msg.includes('executado') ? 'nl-success' : 'nl-error'} style={{ maxWidth: 980 }}>{msg}</p>}
    </Shell>
  );
}
