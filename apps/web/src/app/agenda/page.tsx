'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Agendamento = {
  id: string;
  projeto_nome: string;
  contato_nome: string | null;
  telefone: string | null;
  inicio_em: string;
  descricao: string | null;
  status: string;
  provider: string | null;
  erro: string | null;
};

export default function AgendaPage() {
  const { token, ready } = useStoredToken();
  const [items, setItems] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(false);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => { if (token) carregar(); }, [token]);

  async function carregar() {
    if (!token) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/agenda`, { headers: auth(token) });
      setItems(await r.json());
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Agenda">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Agenda</h1>
          <div className="sub">Compromissos criados pela tool agendar do agente</div>
        </div>
        <button className="nl-btn nl-btn--ghost" disabled={loading} onClick={carregar}>Atualizar</button>
      </div>

      <div className="nl-card" style={{ maxWidth: 1040, overflow: 'hidden' }}>
        <table className="nl-table">
          <thead>
            <tr>
              <th>Horario</th>
              <th>Lead</th>
              <th>Projeto</th>
              <th>Descricao</th>
              <th>Status</th>
              <th>Provider</th>
              <th>Erro</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="faint" style={{ padding: 24, textAlign: 'center' }}>
                  Nenhum agendamento criado ainda.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.inicio_em).toLocaleString('pt-BR')}</td>
                <td><b>{item.contato_nome || item.telefone || '-'}</b></td>
                <td>{item.projeto_nome}</td>
                <td>{item.descricao || '-'}</td>
                <td><span className={`nl-badge ${item.status === 'sincronizado' ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{item.status}</span></td>
                <td>{item.provider || '-'}</td>
                <td style={{ maxWidth: 240 }}>{item.erro || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
