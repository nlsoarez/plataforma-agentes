'use client';
import { useEffect, useRef, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Etapa = { id: string; nome: string; ordem: number };
type Card = { id: string; nome: string | null; telefone: string; etapa_pipeline: string | null };

export default function Pipeline() {
  const { token, ready } = useStoredToken();
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [sobre, setSobre] = useState<string | null>(null);
  const arrastando = useRef<string | null>(null);

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/projetos`, { headers: auth(token) }).then(r => r.json()).then((ps) => { if (ps[0]) setProjetoId(ps[0].id); });
    const es = new EventSource(`${API}/inbox/stream?token=${token}`);
    es.onmessage = (e) => { try { if (JSON.parse(e.data).tipo === 'card') carregar(); } catch {} };
    return () => es.close();
  }, [token]);

  useEffect(() => { if (projetoId) carregar(); }, [projetoId]);

  function carregar() {
    if (!token || !projetoId) return;
    fetch(`${API}/pipeline?projetoId=${projetoId}`, { headers: auth(token) })
      .then(r => r.json()).then((d) => { setEtapas(d.etapas); setCards(d.cards); });
  }

  async function soltar(etapaId: string) {
    const contatoId = arrastando.current;
    setSobre(null);
    if (!token || !contatoId) return;
    setCards((cs) => cs.map((c) => (c.id === contatoId ? { ...c, etapa_pipeline: etapaId } : c)));
    await fetch(`${API}/pipeline/mover`, { method: 'POST', headers: auth(token), body: JSON.stringify({ contatoId, etapaId }) });
    arrastando.current = null;
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Pipeline">
      <div className="nl-board">
        {etapas.map((e) => {
          const lista = cards.filter((c) => c.etapa_pipeline === e.id);
          return (
            <div key={e.id}
              className="nl-col"
              onDragOver={(ev) => { ev.preventDefault(); setSobre(e.id); }}
              onDragLeave={() => setSobre((s) => (s === e.id ? null : s))}
              onDrop={() => soltar(e.id)}
              style={sobre === e.id ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px rgba(109,61,245,0.12)' } : undefined}>
              <div className="nl-col__head">
                <h3>{e.nome}</h3>
                <span className="nl-col__count">{lista.length}</span>
              </div>
              {lista.map((c) => (
                <div key={c.id} className="nl-cardlet" draggable onDragStart={() => (arrastando.current = c.id)}>
                  <b>{c.nome || c.telefone}</b>
                  <div className="tel">{c.telefone}</div>
                </div>
              ))}
              {lista.length === 0 && <div className="faint" style={{ fontSize: '0.8rem', padding: '8px 6px' }}>Vazio</div>}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
