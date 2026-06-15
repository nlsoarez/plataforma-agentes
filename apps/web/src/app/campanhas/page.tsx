'use client';
import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Campanha = { id: string; template_nome: string; status: string; total: string; enviados: string; entregues: string; lidas: string; falhas: string };

export default function Campanhas() {
  const { token, ready } = useStoredToken();
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [lista, setLista] = useState<Campanha[]>([]);
  const [texto, setTexto] = useState('');
  const [tags, setTags] = useState('');
  const [msg, setMsg] = useState('');

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/projetos`, { headers: auth(token) }).then(r => r.json()).then((ps) => { if (ps[0]) setProjetoId(ps[0].id); });
  }, [token]);
  useEffect(() => { if (projetoId) carregar(); }, [projetoId]);

  function carregar() {
    if (!token || !projetoId) return;
    fetch(`${API}/campanhas?projetoId=${projetoId}`, { headers: auth(token) }).then(r => r.json()).then(setLista);
  }
  async function enviar() {
    if (!token || !projetoId || !texto.trim()) return;
    const segmento = tags.trim() ? { tags: tags.split(',').map(s => s.trim()) } : undefined;
    const r = await fetch(`${API}/campanhas`, { method: 'POST', headers: auth(token), body: JSON.stringify({ projetoId, texto, segmento }) });
    const d = await r.json();
    setMsg(d.ok ? `Enfileirado: ${d.total} envios.` : JSON.stringify(d));
    setTexto(''); setTags(''); carregar();
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Campanhas">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Campanhas</h1>
          <div className="sub">Disparos segmentados, métricas de entrega e histórico comercial</div>
        </div>
      </div>

      <div className="nl-card nl-card--pad" style={{ maxWidth: 820, marginBottom: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Novo disparo</div>
        <label className="nl-label">Mensagem <span className="faint">(spintax: {'{Oi|Olá}'} {'{fulano|amigo}'}!)</span></label>
        <input className="nl-input" value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva a mensagem…" style={{ marginBottom: 14 }} />
        <div className="nl-row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label className="nl-label">Tags <span className="faint">(opcional, separadas por vírgula)</span></label>
            <input className="nl-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="lead-quente, sp" />
          </div>
          <button className="nl-btn nl-btn--accent" onClick={enviar}>Disparar</button>
        </div>
        {msg && <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>{msg}</p>}
      </div>

      <div className="nl-card" style={{ maxWidth: 820, overflow: 'hidden' }}>
        <table className="nl-table">
          <thead><tr><th>Mensagem</th><th>Status</th><th>Total</th><th>Enviados</th><th>Entregues</th><th>Lidas</th><th>Falhas</th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={7} className="faint" style={{ padding: 28, textAlign: 'center' }}>Nenhuma campanha ainda.</td></tr>}
            {lista.map((c) => (
              <tr key={c.id}>
                <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.template_nome}</td>
                <td><span className="nl-badge">{c.status}</span></td>
                <td>{c.total}</td><td>{c.enviados}</td><td>{c.entregues}</td><td>{c.lidas}</td><td>{c.falhas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
