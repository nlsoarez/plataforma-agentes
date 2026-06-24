'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Projeto = { id: string; nome: string };

type Lead = {
  id: string;
  projeto_id: string;
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

type ReactivationSettings = {
  ativo: boolean;
  dias_inatividade: number;
  horario: string;
  timezone: string;
  limite_diario: number;
  janela_reenvio_dias: number;
  mensagem: string;
  ultimo_envio_em?: string | null;
  ultimo_erro?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return 'Sem interacao';
  return new Date(value).toLocaleString('pt-BR');
}

export default function LeadsPage() {
  const { token, ready } = useStoredToken();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetoId, setProjetoId] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ nome: '', tags: '', notes: '', metadata: '{}' });
  const [reactivation, setReactivation] = useState<ReactivationSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingReactivation, setSavingReactivation] = useState(false);
  const [msg, setMsg] = useState('');
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const selected = useMemo(() => leads.find((l) => l.id === selectedId) || leads[0], [leads, selectedId]);

  useEffect(() => { if (token) carregarInicial(); }, [token]);
  useEffect(() => { if (token && projetoId) carregar(); }, [token, projetoId]);
  useEffect(() => { if (token && projetoId) carregarReactivation(projetoId); }, [token, projetoId]);
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

  async function carregarInicial() {
    if (!token) return;
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/projetos`, { headers: auth(token) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message || 'Falha ao carregar projetos');
      const list = Array.isArray(d) ? d : [];
      setProjetos(list);
      setProjetoId((current) => current || list[0]?.id || '');
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao carregar projetos');
    } finally {
      setLoading(false);
    }
  }

  async function carregar() {
    if (!token) return;
    const params = new URLSearchParams();
    if (projetoId) params.set('projetoId', projetoId);
    if (query) params.set('q', query);
    const r = await fetch(`${API}/leads?${params.toString()}`, { headers: auth(token) });
    const d = await r.json();
    if (!r.ok) {
      setMsg(d?.message || 'Falha ao carregar leads');
      return;
    }
    setLeads(Array.isArray(d) ? d : []);
  }

  async function carregarReactivation(id: string) {
    if (!token || !id) return;
    const r = await fetch(`${API}/leads/reactivation/settings/${id}`, { headers: auth(token) });
    const d = await r.json();
    if (r.ok) setReactivation(d);
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

  async function salvarReactivation() {
    if (!token || !projetoId || !reactivation) return;
    setSavingReactivation(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/leads/reactivation/settings/${projetoId}`, {
        method: 'PUT',
        headers: auth(token),
        body: JSON.stringify({
          ativo: reactivation.ativo,
          diasInatividade: reactivation.dias_inatividade,
          horario: reactivation.horario,
          timezone: reactivation.timezone,
          limiteDiario: reactivation.limite_diario,
          janelaReenvioDias: reactivation.janela_reenvio_dias,
          mensagem: reactivation.mensagem,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || 'Falha ao salvar reativacao');
      setReactivation(d.settings);
      setMsg('Reativacao automatica salva.');
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao salvar reativacao');
    } finally {
      setSavingReactivation(false);
    }
  }

  async function testarReactivation() {
    if (!token || !projetoId) return;
    setMsg('');
    try {
      const r = await fetch(`${API}/leads/reactivation/test/${projetoId}`, {
        method: 'POST',
        headers: auth(token),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || 'Falha ao testar reativacao');
      setMsg('Teste de reativacao enfileirado.');
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao testar reativacao');
    }
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Leads">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>CRM de leads</h1>
          <div className="sub">Contatos reais, historico de interacao e reativacao automatica.</div>
        </div>
        <div className="nl-row">
          <select className="nl-select" style={{ width: 220 }} value={projetoId} onChange={(e) => setProjetoId(e.target.value)}>
            {projetos.map((projeto) => <option key={projeto.id} value={projeto.id}>{projeto.nome}</option>)}
          </select>
          <input className="nl-input" style={{ width: 240 }} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && carregar()} placeholder="Buscar lead" />
          <button className="nl-btn nl-btn--ghost" onClick={carregar} disabled={loading}>Buscar</button>
        </div>
      </div>

      {reactivation && (
        <section className="nl-card nl-card--pad" style={{ marginBottom: 18 }}>
          <div className="nl-agent-report-card__head">
            <div>
              <div className="eyebrow">Reativacao automatica</div>
              <h2>Recuperar leads sem interacao</h2>
              <p className="muted">O worker identifica contatos parados e envia WhatsApp dentro do limite diario configurado.</p>
            </div>
            <label className="nl-switch">
              <input type="checkbox" checked={reactivation.ativo} onChange={(e) => setReactivation({ ...reactivation, ativo: e.target.checked })} />
              <span>{reactivation.ativo ? 'Ativa' : 'Inativa'}</span>
            </label>
          </div>

          <div className="nl-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', margin: '12px 0' }}>
            <div>
              <label className="nl-label">Dias sem interacao</label>
              <input className="nl-input" type="number" min={7} max={730} value={reactivation.dias_inatividade} onChange={(e) => setReactivation({ ...reactivation, dias_inatividade: Number(e.target.value) })} />
            </div>
            <div>
              <label className="nl-label">Horario</label>
              <input className="nl-input" type="time" value={reactivation.horario} onChange={(e) => setReactivation({ ...reactivation, horario: e.target.value })} />
            </div>
            <div>
              <label className="nl-label">Limite diario</label>
              <input className="nl-input" type="number" min={1} max={500} value={reactivation.limite_diario} onChange={(e) => setReactivation({ ...reactivation, limite_diario: Number(e.target.value) })} />
            </div>
            <div>
              <label className="nl-label">Janela de reenvio</label>
              <input className="nl-input" type="number" min={1} max={365} value={reactivation.janela_reenvio_dias} onChange={(e) => setReactivation({ ...reactivation, janela_reenvio_dias: Number(e.target.value) })} />
            </div>
          </div>

          <label className="nl-label">Mensagem</label>
          <textarea className="nl-textarea" style={{ minHeight: 88 }} value={reactivation.mensagem} onChange={(e) => setReactivation({ ...reactivation, mensagem: e.target.value })} />
          <div className="faint" style={{ marginTop: 8 }}>Variaveis: {'{{nome}}'}, {'{{telefone}}'}. Ultimo envio: {formatDate(reactivation.ultimo_envio_em)}</div>
          {reactivation.ultimo_erro && <p className="nl-error">{reactivation.ultimo_erro}</p>}
          <div className="nl-row" style={{ marginTop: 12 }}>
            <button className="nl-btn nl-btn--accent" disabled={savingReactivation} onClick={salvarReactivation}>
              {savingReactivation ? 'Salvando...' : 'Salvar reativacao'}
            </button>
            <button className="nl-btn nl-btn--ghost" onClick={testarReactivation}>Testar agora</button>
          </div>
        </section>
      )}

      <div className="nl-agents-grid">
        <section className="nl-stack">
          {leads.map((lead) => (
            <button key={lead.id} className={`nl-agent-session ${lead.id === selected?.id ? 'active' : ''}`} onClick={() => setSelectedId(lead.id)}>
              <span>
                <b>{lead.nome || lead.telefone}</b>
                <small>{lead.projeto_nome} / {lead.etapa_nome || 'sem etapa'}</small>
                <small>Ultima interacao: {formatDate(lead.ultima_interacao)}</small>
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
              {msg && <p className={msg.includes('salvo') || msg.includes('enfileirado') || msg.includes('salva') ? 'nl-success' : 'nl-error'}>{msg}</p>}
            </>
          ) : (
            <div className="nl-empty">Selecione um lead.</div>
          )}
        </section>
      </div>
    </Shell>
  );
}
