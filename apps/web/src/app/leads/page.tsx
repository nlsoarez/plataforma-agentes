'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Lead = {
  id: string;
  projeto_nome: string;
  nome: string | null;
  telefone: string;
  tags: string[];
  notes: string | null;
  metadata: Record<string, any>;
  unread_messages: number;
  etapa_nome: string | null;
  ultima_interacao: string | null;
};

export default function LeadsPage() {
  const { token, ready } = useStoredToken();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ nome: '', tags: '', notes: '', metadata: '{}' });
  const [msg, setMsg] = useState('');
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const selected = useMemo(() => leads.find((l) => l.id === selectedId) || leads[0], [leads, selectedId]);

  useEffect(() => { if (token) carregar(); }, [token]);
  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setForm({
      nome: selected.nome || '',
      tags: (selected.tags || []).join(', '),
      notes: selected.notes || '',
      metadata: JSON.stringify(selected.metadata || {}, null, 2),
    });
  }, [selected?.id]);

  async function carregar() {
    if (!token) return;
    const url = query ? `${API}/leads?q=${encodeURIComponent(query)}` : `${API}/leads`;
    const r = await fetch(url, { headers: auth(token) });
    setLeads(await r.json());
  }

  async function salvar() {
    if (!token || !selected) return;
    setMsg('');
    let metadata: any = {};
    try { metadata = JSON.parse(form.metadata || '{}'); }
    catch { setMsg('Metadata precisa ser JSON valido.'); return; }
    const r = await fetch(`${API}/leads/${selected.id}`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({
        nome: form.nome,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        notes: form.notes,
        metadata,
      }),
    });
    setMsg(r.ok ? 'Lead salvo.' : JSON.stringify(await r.json()));
    await carregar();
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Leads">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>CRM de leads</h1>
          <div className="sub">Tags, notas, propriedades e vínculo com pipeline</div>
        </div>
        <div className="nl-row">
          <input className="nl-input" style={{ width: 240 }} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && carregar()} placeholder="Buscar lead" />
          <button className="nl-btn nl-btn--ghost" onClick={carregar}>Buscar</button>
        </div>
      </div>

      <div className="nl-agents-grid">
        <section className="nl-stack">
          {leads.map((lead) => (
            <button key={lead.id} className={`nl-agent-session ${lead.id === selected?.id ? 'active' : ''}`} onClick={() => setSelectedId(lead.id)}>
              <span>
                <b>{lead.nome || lead.telefone}</b>
                <small>{lead.projeto_nome} / {lead.etapa_nome || 'sem etapa'}</small>
              </span>
              <i className={lead.unread_messages > 0 ? '' : 'ok'}>{lead.unread_messages}</i>
            </button>
          ))}
          {leads.length === 0 && <div className="nl-card nl-card--pad nl-empty">Nenhum lead ainda.</div>}
        </section>

        <section className="nl-card nl-card--pad">
          {selected ? (
            <>
              <div className="nl-agent-head">
                <div>
                  <div className="eyebrow">Lead</div>
                  <h2>{selected.nome || selected.telefone}</h2>
                  <p className="muted">{selected.telefone} / {selected.etapa_nome || 'sem etapa'}</p>
                </div>
                <span className="nl-badge">{selected.projeto_nome}</span>
              </div>

              <label className="nl-label">Nome</label>
              <input className="nl-input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={{ marginBottom: 12 }} />
              <label className="nl-label">Tags</label>
              <input className="nl-input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} style={{ marginBottom: 12 }} />
              <label className="nl-label">Notas</label>
              <textarea className="nl-textarea" style={{ minHeight: 140, marginBottom: 12 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <label className="nl-label">Propriedades JSON</label>
              <textarea className="nl-textarea" style={{ minHeight: 140 }} value={form.metadata} onChange={(e) => setForm({ ...form, metadata: e.target.value })} />
              <div className="nl-row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
                <a className="nl-btn nl-btn--ghost" href="/inbox">Abrir inbox</a>
                <button className="nl-btn nl-btn--accent" onClick={salvar}>Salvar lead</button>
              </div>
              {msg && <p className={msg.includes('salvo') ? 'nl-success' : 'nl-error'}>{msg}</p>}
            </>
          ) : (
            <div className="nl-empty">Selecione um lead.</div>
          )}
        </section>
      </div>
    </Shell>
  );
}
