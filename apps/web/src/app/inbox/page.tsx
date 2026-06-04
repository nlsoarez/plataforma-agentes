'use client';
import { useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Conversa = { id: string; nome: string | null; telefone: string; ultima: string | null; ia_pausada: boolean };
type Mensagem = { autor: string; direcao: string; conteudo: string; status_entrega: string | null; criada_em: string };

export default function Inbox() {
  const [token, setToken] = useState<string | null>(null);
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [sel, setSel] = useState<Conversa | null>(null);
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const selRef = useRef<Conversa | null>(null);
  selRef.current = sel;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => { setToken(localStorage.getItem('token')); }, []);

  // carrega projeto e abre o stream ao vivo
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/projetos`, { headers: auth(token) }).then(r => r.json()).then((ps) => {
      if (ps[0]) setProjetoId(ps[0].id);
    });
    const es = new EventSource(`${API}/inbox/stream?token=${token}`);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        carregarConversas();
        if (selRef.current && ev.conversaId === selRef.current.id) abrir(selRef.current);
      } catch { /* ignora */ }
    };
    return () => es.close();
  }, [token]);

  useEffect(() => { if (projetoId) carregarConversas(); }, [projetoId]);

  function carregarConversas() {
    if (!token || !projetoId) return;
    fetch(`${API}/conversas?projetoId=${projetoId}`, { headers: auth(token) })
      .then(r => r.json()).then(setConversas);
  }

  function abrir(c: Conversa) {
    setSel(c);
    if (!token) return;
    fetch(`${API}/conversas/${c.id}/mensagens`, { headers: auth(token) })
      .then(r => r.json()).then(setMsgs);
  }

  async function responder() {
    if (!token || !sel || !texto.trim()) return;
    await fetch(`${API}/conversas/${sel.id}/responder`, { method: 'POST', headers: auth(token), body: JSON.stringify({ texto }) });
    setTexto(''); abrir(sel);
  }

  async function toggleIa() {
    if (!token || !sel) return;
    await fetch(`${API}/conversas/${sel.id}/ia`, { method: 'POST', headers: auth(token), body: JSON.stringify({ pausar: !sel.ia_pausada }) });
    const novo = { ...sel, ia_pausada: !sel.ia_pausada };
    setSel(novo); carregarConversas();
  }

  if (!token) return <main style={{ padding: 40, fontFamily: 'sans-serif' }}>Faça login em <a href="/login">/login</a>.</main>;

  return (
    <main style={{ fontFamily: 'sans-serif', display: 'flex', height: '100vh' }}>
      <aside style={{ width: 300, borderRight: '1px solid #ddd', overflowY: 'auto' }}>
        <h2 style={{ padding: '12px 16px', margin: 0 }}>Conversas</h2>
        {conversas.map((c) => (
          <div key={c.id} onClick={() => abrir(c)}
            style={{ padding: 12, borderBottom: '1px solid #eee', cursor: 'pointer', background: sel?.id === c.id ? '#f0f4ff' : '#fff' }}>
            <strong>{c.nome || c.telefone}</strong>
            {c.ia_pausada && <span style={{ fontSize: 11, color: '#b45309' }}> · humano</span>}
            <div style={{ color: '#666', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.ultima}</div>
          </div>
        ))}
      </aside>

      <section style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!sel ? <div style={{ padding: 40, color: '#888' }}>Selecione uma conversa.</div> : (
          <>
            <header style={{ padding: 12, borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{sel.nome || sel.telefone}</strong>
              <button onClick={toggleIa}>{sel.ia_pausada ? 'Devolver pra IA' : 'Assumir (pausar IA)'}</button>
            </header>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {msgs.map((m, i) => (
                <div key={i} style={{ textAlign: m.direcao === 'outbound' ? 'right' : 'left', margin: '6px 0' }}>
                  <span style={{ display: 'inline-block', padding: '8px 12px', borderRadius: 12, background: m.autor === 'ia' ? '#ede9fe' : m.autor === 'humano' ? '#dcfce7' : '#f1f5f9' }}>
                    {m.conteudo}
                    <span style={{ display: 'block', fontSize: 10, color: '#888' }}>{m.autor}{m.status_entrega ? ` · ${m.status_entrega}` : ''}</span>
                  </span>
                </div>
              ))}
            </div>
            <footer style={{ padding: 12, borderTop: '1px solid #ddd', display: 'flex', gap: 8 }}>
              <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && responder()}
                placeholder="Responder como humano..." style={{ flex: 1, padding: 8 }} />
              <button onClick={responder}>Enviar</button>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}
