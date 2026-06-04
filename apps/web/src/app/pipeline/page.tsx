'use client';
import { useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Etapa = { id: string; nome: string; ordem: number };
type Card = { id: string; nome: string | null; telefone: string; etapa_pipeline: string | null };

export default function Pipeline() {
  const [token, setToken] = useState<string | null>(null);
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const arrastando = useRef<string | null>(null);

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => { setToken(localStorage.getItem('token')); }, []);

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
    if (!token || !contatoId) return;
    setCards((cs) => cs.map((c) => (c.id === contatoId ? { ...c, etapa_pipeline: etapaId } : c))); // otimista
    await fetch(`${API}/pipeline/mover`, { method: 'POST', headers: auth(token), body: JSON.stringify({ contatoId, etapaId }) });
    arrastando.current = null;
  }

  if (!token) return <main style={{ padding: 40, fontFamily: 'sans-serif' }}>Faça login em <a href="/login">/login</a>.</main>;

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>Pipeline</h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', overflowX: 'auto' }}>
        {etapas.map((e) => (
          <div key={e.id}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={() => soltar(e.id)}
            style={{ minWidth: 220, background: '#f6f7f9', borderRadius: 10, padding: 10 }}>
            <h3 style={{ margin: '4px 8px 10px' }}>{e.nome}</h3>
            {cards.filter((c) => c.etapa_pipeline === e.id).map((c) => (
              <div key={c.id} draggable onDragStart={() => (arrastando.current = c.id)}
                style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, marginBottom: 8, cursor: 'grab' }}>
                <strong>{c.nome || c.telefone}</strong>
                <div style={{ fontSize: 12, color: '#666' }}>{c.telefone}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
