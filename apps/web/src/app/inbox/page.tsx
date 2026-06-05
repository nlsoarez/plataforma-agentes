'use client';
import { useEffect, useRef, useState } from 'react';
import Shell from '../../components/Shell';

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

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/projetos`, { headers: auth(token) }).then(r => r.json()).then((ps) => { if (ps[0]) setProjetoId(ps[0].id); });
    const es = new EventSource(`${API}/inbox/stream?token=${token}`);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        carregarConversas();
        if (selRef.current && ev.conversaId === selRef.current.id) abrir(selRef.current);
      } catch {}
    };
    return () => es.close();
  }, [token]);

  useEffect(() => { if (projetoId) carregarConversas(); }, [projetoId]);

  function carregarConversas() {
    if (!token || !projetoId) return;
    fetch(`${API}/conversas?projetoId=${projetoId}`, { headers: auth(token) }).then(r => r.json()).then(setConversas);
  }
  function abrir(c: Conversa) {
    setSel(c);
    if (!token) return;
    fetch(`${API}/conversas/${c.id}/mensagens`, { headers: auth(token) }).then(r => r.json()).then(setMsgs);
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

  if (!token) return <NaoLogado />;

  return (
    <Shell title="Inbox">
      <div className="nl-inbox">
        <div className="nl-convos">
          {conversas.length === 0 && <div className="faint" style={{ padding: 14, fontSize: '0.88rem' }}>Nenhuma conversa ainda.</div>}
          {conversas.map((c) => (
            <div key={c.id} className={`nl-convo ${sel?.id === c.id ? 'active' : ''}`} onClick={() => abrir(c)}>
              <div className="nl-row" style={{ justifyContent: 'space-between' }}>
                <b>{c.nome || c.telefone}</b>
                {c.ia_pausada && <span className="nl-badge nl-badge--warn">humano</span>}
              </div>
              <div className="last">{c.ultima || '—'}</div>
            </div>
          ))}
        </div>

        <div className="nl-card nl-thread">
          {!sel ? (
            <div className="nl-empty" style={{ margin: 'auto' }}>
              <div className="display display-md">Selecione uma conversa</div>
              <div>As mensagens aparecem aqui em tempo real.</div>
            </div>
          ) : (
            <>
              <div className="nl-thread__head">
                <div>
                  <b style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>{sel.nome || sel.telefone}</b>
                  <div className="faint" style={{ fontSize: '0.8rem' }}>{sel.telefone}</div>
                </div>
                <button className="nl-btn nl-btn--ghost nl-btn--sm" onClick={toggleIa}>
                  {sel.ia_pausada ? 'Devolver pra IA' : 'Assumir conversa'}
                </button>
              </div>
              <div className="nl-msgs">
                {msgs.map((m, i) => {
                  const cls = m.direcao === 'inbound' ? 'in' : m.autor === 'ia' ? 'ia' : 'out';
                  return (
                    <div key={i} className={`nl-bubble ${cls}`}>
                      {m.conteudo}
                      <small>{m.autor}{m.status_entrega ? ` · ${m.status_entrega}` : ''}</small>
                    </div>
                  );
                })}
              </div>
              <div className="nl-composer">
                <input className="nl-input" value={texto} onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && responder()} placeholder="Responder como humano…" />
                <button className="nl-btn nl-btn--accent" onClick={responder}>Enviar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

function NaoLogado() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', textAlign: 'center' }}>
      <div><div className="display display-md" style={{ marginBottom: 10 }}>Sessão necessária</div>
      <a className="nl-btn nl-btn--accent" href="/login">Ir para o login</a></div>
    </main>
  );
}
