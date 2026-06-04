'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Campanha = { id: string; template_nome: string; status: string; total: string; enviados: string; entregues: string; lidas: string; falhas: string };

export default function Campanhas() {
  const [token, setToken] = useState<string | null>(null);
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [lista, setLista] = useState<Campanha[]>([]);
  const [texto, setTexto] = useState('');
  const [tags, setTags] = useState('');
  const [msg, setMsg] = useState('');

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => { setToken(localStorage.getItem('token')); }, []);
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
    setMsg(d.ok ? `enfileirado: ${d.total} envios` : JSON.stringify(d));
    setTexto(''); setTags(''); carregar();
  }

  if (!token) return <main style={{ padding: 40, fontFamily: 'sans-serif' }}>Faça login em <a href="/login">/login</a>.</main>;

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24, maxWidth: 760 }}>
      <h1>Campanhas</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input placeholder="mensagem (use spintax: {Oi|Olá} {fulano|amigo}!)" value={texto} onChange={(e) => setTexto(e.target.value)} style={{ flex: 1, padding: 8 }} />
        <input placeholder="tags (opcional, vírgula)" value={tags} onChange={(e) => setTags(e.target.value)} style={{ flex: 1, padding: 8 }} />
        <button onClick={enviar}>Disparar</button>
      </div>
      <p style={{ color: '#666' }}>{msg}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
        <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
          <th>Mensagem</th><th>Status</th><th>Total</th><th>Enviados</th><th>Entregues</th><th>Lidas</th><th>Falhas</th>
        </tr></thead>
        <tbody>
          {lista.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td>{c.template_nome}</td><td>{c.status}</td><td>{c.total}</td>
              <td>{c.enviados}</td><td>{c.entregues}</td><td>{c.lidas}</td><td>{c.falhas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
