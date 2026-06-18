'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Projeto = { id: string; nome: string; phone_number_id: string | null; connection_state?: string | null };
type Lead = { id: string; nome: string | null; telefone: string; tags: string[]; ultima_interacao: string | null; projeto_id: string };
type Campanha = { id: string; template_nome: string; status: string; total: string; enviados: string; entregues: string; lidas: string; falhas: string };

function formatPhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return digits ? `+${digits}` : value;
}

export default function Campanhas() {
  const { token, ready } = useStoredToken();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetoId, setProjetoId] = useState<string>('');
  const [lista, setLista] = useState<Campanha[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [texto, setTexto] = useState('');
  const [tags, setTags] = useState('');
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const projetoAtual = useMemo(() => projetos.find((p) => p.id === projetoId), [projetos, projetoId]);
  const filteredLeads = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) =>
      String(lead.nome || '').toLowerCase().includes(q)
      || lead.telefone.includes(q)
      || (lead.tags || []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [leads, busca]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/projetos`, { headers: auth(token) })
      .then((r) => r.json())
      .then((ps) => {
        const list = Array.isArray(ps) ? ps : [];
        setProjetos(list);
        if (list[0]) setProjetoId(list[0].id);
      });
  }, [token]);

  useEffect(() => {
    if (projetoId) carregar();
  }, [projetoId]);

  async function carregar() {
    if (!token || !projetoId) return;
    setLoading(true);
    try {
      const [campanhasRes, leadsRes] = await Promise.all([
        fetch(`${API}/campanhas?projetoId=${projetoId}`, { headers: auth(token) }),
        fetch(`${API}/leads?projetoId=${projetoId}`, { headers: auth(token) }),
      ]);
      const campanhas = await campanhasRes.json();
      const contatos = await leadsRes.json();
      setLista(Array.isArray(campanhas) ? campanhas : []);
      setLeads(Array.isArray(contatos) ? contatos : []);
      setSelectedLeads([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleLead(id: string) {
    setSelectedLeads((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selecionarVisiveis() {
    setSelectedLeads(Array.from(new Set([...selectedLeads, ...filteredLeads.map((lead) => lead.id)])));
  }

  async function enviar() {
    if (!token || !projetoId || !texto.trim()) return;
    if (!selectedLeads.length && !tags.trim()) {
      setMsg('Selecione pelo menos um lead ou informe uma tag.');
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const segmento: { tags?: string[]; contatoIds?: string[] } = {};
      if (selectedLeads.length) segmento.contatoIds = selectedLeads;
      if (tags.trim()) segmento.tags = tags.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await fetch(`${API}/campanhas`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({ projetoId, texto, segmento }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || JSON.stringify(d));
      setMsg(`Campanha enfileirada para ${d.total} lead(s).`);
      setTexto('');
      setTags('');
      setSelectedLeads([]);
      await carregar();
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao criar campanha');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Campanhas">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Campanhas</h1>
          <div className="sub">Escolha a conexão, selecione os leads e acompanhe a entrega.</div>
        </div>
      </div>

      <div className="nl-campaign-layout">
        <section className="nl-card nl-card--pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Novo disparo</div>

          <div className="nl-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
            <div>
              <label className="nl-label">Conexão WhatsApp</label>
              <select className="nl-select" value={projetoId} onChange={(e) => setProjetoId(e.target.value)}>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome} - {p.phone_number_id || 'sem instância'}</option>
                ))}
              </select>
            </div>
            <div className="nl-campaign-target">
              <span>Destinatários</span>
              <b>{selectedLeads.length}</b>
              <small>{selectedLeads.length ? 'selecionados manualmente' : tags.trim() ? 'por tag' : 'nenhum selecionado'}</small>
            </div>
          </div>

          <label className="nl-label">Mensagem</label>
          <textarea
            className="nl-textarea nl-campaign-message"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva a mensagem da campanha..."
          />
          <div className="faint" style={{ margin: '8px 0 14px' }}>
            Spintax suportado: {'{Oi|Olá}'} {'{fulano|amigo}'}!
          </div>

          <label className="nl-label">Tags opcionais</label>
          <input
            className="nl-input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="lead-quente, sp"
            style={{ marginBottom: 14 }}
          />

          <div className="nl-campaign-leads">
            <div className="nl-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <b>Selecionar leads</b>
                <div className="faint">{projetoAtual?.nome || 'Escolha uma conexão'} - {leads.length} lead(s) disponíveis</div>
              </div>
              <div className="nl-row">
                <input className="nl-input nl-input--search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar lead..." />
                <button className="nl-btn nl-btn--ghost nl-btn--sm" type="button" onClick={selecionarVisiveis} disabled={!filteredLeads.length}>
                  Selecionar visíveis
                </button>
                <button className="nl-btn nl-btn--ghost nl-btn--sm" type="button" onClick={() => setSelectedLeads([])} disabled={!selectedLeads.length}>
                  Limpar
                </button>
              </div>
            </div>

            <div className="nl-campaign-lead-list">
              {filteredLeads.length === 0 && <div className="nl-empty">Nenhum lead encontrado para esta conexão.</div>}
              {filteredLeads.map((lead) => (
                <label key={lead.id} className={`nl-campaign-lead ${selectedLeads.includes(lead.id) ? 'active' : ''}`}>
                  <input type="checkbox" checked={selectedLeads.includes(lead.id)} onChange={() => toggleLead(lead.id)} />
                  <span>
                    <b>{lead.nome || formatPhone(lead.telefone)}</b>
                    <small>{formatPhone(lead.telefone)}</small>
                  </span>
                  <em>{(lead.tags || []).slice(0, 2).join(', ') || 'sem tag'}</em>
                </label>
              ))}
            </div>
          </div>

          <div className="nl-row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
            <span className="faint">Campanhas são enfileiradas e enviadas pelo worker.</span>
            <button className="nl-btn nl-btn--accent" onClick={enviar} disabled={loading || !texto.trim() || (!selectedLeads.length && !tags.trim())}>
              {loading ? 'Enfileirando...' : 'Disparar campanha'}
            </button>
          </div>
          {msg && <p className={msg.includes('enfileirada') ? 'nl-success' : 'nl-error'}>{msg}</p>}
        </section>

        <section className="nl-card" style={{ overflow: 'hidden' }}>
          <table className="nl-table">
            <thead><tr><th>Mensagem</th><th>Status</th><th>Total</th><th>Enviados</th><th>Entregues</th><th>Lidas</th><th>Falhas</th></tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={7} className="faint" style={{ padding: 28, textAlign: 'center' }}>Nenhuma campanha ainda.</td></tr>}
              {lista.map((c) => (
                <tr key={c.id}>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.template_nome}</td>
                  <td><span className="nl-badge">{c.status}</span></td>
                  <td>{c.total}</td><td>{c.enviados}</td><td>{c.entregues}</td><td>{c.lidas}</td><td>{c.falhas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}
