'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Projeto = { id: string; nome: string };
type Lead = { id: string; projeto_id: string; nome: string | null; telefone: string };
type Agendamento = {
  id: string;
  projeto_id: string;
  projeto_nome: string;
  contato_id: string | null;
  contato_nome: string | null;
  telefone: string | null;
  inicio_em: string;
  fim_em: string | null;
  duracao_minutos: number | null;
  descricao: string | null;
  status: string;
  provider: string | null;
  erro: string | null;
};

function localInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatPhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return digits ? `+${digits}` : '-';
}

export default function AgendaPage() {
  const { token, ready } = useStoredToken();
  const [items, setItems] = useState<Agendamento[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    projetoId: '',
    contatoId: '',
    inicioEm: '',
    duracaoMinutos: 60,
    descricao: '',
  });
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  const leadsDoProjeto = useMemo(
    () => leads.filter((lead) => lead.projeto_id === form.projetoId),
    [leads, form.projetoId],
  );

  useEffect(() => { if (token) carregarTudo(); }, [token]);
  useEffect(() => { if (form.projetoId && token) carregarLeads(form.projetoId); }, [form.projetoId, token]);

  async function carregarTudo() {
    if (!token) return;
    setLoading(true);
    setMsg('');
    try {
      const [agendaRes, projetosRes] = await Promise.all([
        fetch(`${API}/agenda`, { headers: auth(token) }),
        fetch(`${API}/projetos`, { headers: auth(token) }),
      ]);
      const agenda = await agendaRes.json();
      const projetosData = await projetosRes.json();
      if (!agendaRes.ok) throw new Error(agenda?.message || 'Falha ao carregar agenda');
      if (!projetosRes.ok) throw new Error(projetosData?.message || 'Falha ao carregar projetos');
      const projetosList = Array.isArray(projetosData) ? projetosData : [];
      setItems(Array.isArray(agenda) ? agenda : []);
      setProjetos(projetosList);
      setForm((current) => ({ ...current, projetoId: current.projetoId || projetosList[0]?.id || '' }));
      if (projetosList[0]) await carregarLeads(projetosList[0].id);
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao carregar agenda');
    } finally {
      setLoading(false);
    }
  }

  async function carregarLeads(projetoId: string) {
    if (!token || !projetoId) return;
    const r = await fetch(`${API}/leads?projetoId=${projetoId}`, { headers: auth(token) });
    const d = await r.json();
    if (r.ok) setLeads((current) => {
      const outros = current.filter((lead) => lead.projeto_id !== projetoId);
      return [...outros, ...(Array.isArray(d) ? d : [])];
    });
  }

  function limparForm() {
    setEditingId(null);
    setForm((current) => ({
      projetoId: current.projetoId || projetos[0]?.id || '',
      contatoId: '',
      inicioEm: '',
      duracaoMinutos: 60,
      descricao: '',
    }));
  }

  function editar(item: Agendamento) {
    setEditingId(item.id);
    setForm({
      projetoId: item.projeto_id,
      contatoId: item.contato_id || '',
      inicioEm: localInputValue(item.inicio_em),
      duracaoMinutos: item.duracao_minutos || 60,
      descricao: item.descricao || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function salvar() {
    if (!token) return;
    if (!form.projetoId || !form.inicioEm) {
      setMsg('Informe projeto e horario do agendamento.');
      return;
    }

    setLoading(true);
    setMsg('');
    try {
      const payload = {
        projetoId: form.projetoId,
        contatoId: form.contatoId || null,
        inicioEm: new Date(form.inicioEm).toISOString(),
        duracaoMinutos: Number(form.duracaoMinutos || 60),
        descricao: form.descricao,
      };
      const url = editingId ? `${API}/agenda/${editingId}` : `${API}/agenda`;
      const r = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: auth(token),
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || 'Falha ao salvar agendamento');
      setMsg(editingId ? 'Agendamento atualizado.' : 'Agendamento criado.');
      limparForm();
      await carregarTudo();
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao salvar agendamento');
    } finally {
      setLoading(false);
    }
  }

  async function cancelar(id: string) {
    if (!token) return;
    if (!confirm('Cancelar este agendamento?')) return;
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/agenda/${id}`, { method: 'DELETE', headers: auth(token) });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || 'Falha ao cancelar agendamento');
      setMsg('Agendamento cancelado.');
      await carregarTudo();
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao cancelar agendamento');
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
          <div className="sub">Compromissos criados pelo agente ou cadastrados manualmente.</div>
        </div>
        <button className="nl-btn nl-btn--ghost" disabled={loading} onClick={carregarTudo}>Atualizar</button>
      </div>

      <div className="nl-grid" style={{ gridTemplateColumns: 'minmax(360px, 520px) minmax(520px, 1fr)', alignItems: 'start' }}>
        <section className="nl-card nl-card--pad">
          <div className="eyebrow">{editingId ? 'Editar agendamento' : 'Novo agendamento'}</div>
          <h2>{editingId ? 'Atualizar compromisso' : 'Criar compromisso'}</h2>
          <p className="muted">A Comunora bloqueia horarios conflitantes na agenda local e na agenda Google conectada.</p>

          <label className="nl-label">Projeto / WhatsApp</label>
          <select className="nl-select" value={form.projetoId} onChange={(e) => setForm({ ...form, projetoId: e.target.value, contatoId: '' })}>
            {projetos.map((projeto) => <option key={projeto.id} value={projeto.id}>{projeto.nome}</option>)}
          </select>

          <label className="nl-label" style={{ marginTop: 12 }}>Lead opcional</label>
          <select className="nl-select" value={form.contatoId} onChange={(e) => setForm({ ...form, contatoId: e.target.value })}>
            <option value="">Sem lead vinculado</option>
            {leadsDoProjeto.map((lead) => (
              <option key={lead.id} value={lead.id}>{lead.nome || formatPhone(lead.telefone)} - {formatPhone(lead.telefone)}</option>
            ))}
          </select>

          <div className="nl-grid" style={{ gridTemplateColumns: '1fr 140px', marginTop: 12 }}>
            <div>
              <label className="nl-label">Data e hora</label>
              <input className="nl-input" type="datetime-local" value={form.inicioEm} onChange={(e) => setForm({ ...form, inicioEm: e.target.value })} />
            </div>
            <div>
              <label className="nl-label">Duracao</label>
              <select className="nl-select" value={form.duracaoMinutos} onChange={(e) => setForm({ ...form, duracaoMinutos: Number(e.target.value) })}>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hora</option>
                <option value={90}>1h30</option>
                <option value={120}>2 horas</option>
              </select>
            </div>
          </div>

          <label className="nl-label" style={{ marginTop: 12 }}>Descricao</label>
          <textarea
            className="nl-textarea"
            style={{ minHeight: 130 }}
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            placeholder="Ex: reuniao comercial, atendimento tecnico, retorno do lead..."
          />

          <div className="nl-row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
            <button className="nl-btn nl-btn--ghost" type="button" onClick={limparForm} disabled={loading}>Limpar</button>
            <button className="nl-btn nl-btn--accent" type="button" onClick={salvar} disabled={loading}>
              {editingId ? 'Salvar alteracoes' : 'Criar agendamento'}
            </button>
          </div>
          {msg && <p className={msg.includes('Falha') || msg.includes('Horario') || msg.includes('Informe') ? 'nl-error' : 'nl-success'}>{msg}</p>}
        </section>

        <section className="nl-card" style={{ overflow: 'hidden' }}>
          <table className="nl-table">
            <thead>
              <tr>
                <th>Horario</th>
                <th>Lead</th>
                <th>Projeto</th>
                <th>Descricao</th>
                <th>Status</th>
                <th>Origem</th>
                <th>Erro</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="faint" style={{ padding: 24, textAlign: 'center' }}>
                    Nenhum agendamento criado ainda.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <b>{new Date(item.inicio_em).toLocaleString('pt-BR')}</b>
                    <div className="faint">{item.duracao_minutos || 60} min</div>
                  </td>
                  <td>{item.contato_nome || formatPhone(item.telefone)}</td>
                  <td>{item.projeto_nome}</td>
                  <td style={{ maxWidth: 280 }}>{item.descricao || '-'}</td>
                  <td><span className={`nl-badge ${item.status === 'sincronizado' ? 'nl-badge--ok' : item.status === 'cancelado' ? 'nl-badge--off' : 'nl-badge--warn'}`}>{item.status}</span></td>
                  <td>{item.provider || '-'}</td>
                  <td style={{ maxWidth: 220 }}>{item.erro || '-'}</td>
                  <td>
                    <div className="nl-row" style={{ gap: 8 }}>
                      <button className="nl-btn nl-btn--ghost nl-btn--sm" onClick={() => editar(item)}>Editar</button>
                      {item.status !== 'cancelado' && (
                        <button className="nl-btn nl-btn--danger nl-btn--sm" onClick={() => cancelar(item.id)}>Cancelar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}
