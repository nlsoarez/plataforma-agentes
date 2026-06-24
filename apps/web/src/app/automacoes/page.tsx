'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Automacao = { id: string; nome: string; gatilho: string; condicoes: any; acoes: any[]; ativo: boolean };
type AutomacoesPanel = 'lista' | 'nova';

export default function AutomacoesPage() {
  const { token, ready } = useStoredToken();
  const [items, setItems] = useState<Automacao[]>([]);
  const [activePanel, setActivePanel] = useState<AutomacoesPanel>('lista');
  const [form, setForm] = useState({ nome: '', gatilho: 'lead_criado', acoes: '[]' });
  const [msg, setMsg] = useState('');
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => { if (token) carregar(); }, [token]);

  async function carregar() {
    if (!token) return;
    const r = await fetch(`${API}/automacoes`, { headers: auth(token) });
    setItems(await r.json());
  }

  async function salvar() {
    if (!token) return;
    setMsg('');
    let acoes: any[] = [];
    try { acoes = JSON.parse(form.acoes || '[]'); }
    catch { setMsg('Ações precisa ser JSON valido.'); return; }
    const r = await fetch(`${API}/automacoes`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ nome: form.nome, gatilho: form.gatilho, acoes, ativo: true }),
    });
    setMsg(r.ok ? 'Automação criada.' : JSON.stringify(await r.json()));
    await carregar();
  }

  async function desativar(id: string) {
    if (!token) return;
    await fetch(`${API}/automacoes/${id}`, { method: 'DELETE', headers: auth(token) });
    await carregar();
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Automações">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Central de automações</h1>
          <div className="sub">Gatilhos: lead_criado, mensagem_recebida</div>
        </div>
      </div>

      <div className="nl-tabs nl-tabs--page" role="tablist" aria-label="Areas de automacoes">
        <button type="button" id="automations-tab-lista" role="tab" aria-selected={activePanel === 'lista'} aria-controls="automations-panel-lista" className={`nl-tab ${activePanel === 'lista' ? 'active' : ''}`} onClick={() => setActivePanel('lista')}>
          Automacoes
          <span>{items.length}</span>
        </button>
        <button type="button" id="automations-tab-nova" role="tab" aria-selected={activePanel === 'nova'} aria-controls="automations-panel-nova" className={`nl-tab ${activePanel === 'nova' ? 'active' : ''}`} onClick={() => setActivePanel('nova')}>
          Nova automacao
        </button>
      </div>

      {activePanel === 'nova' && (
        <section className="nl-card nl-card--pad nl-tab-panel" id="automations-panel-nova" role="tabpanel" aria-labelledby="automations-tab-nova" style={{ maxWidth: 820 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Nova automação</div>
          <label className="nl-label">Nome</label>
          <input className="nl-input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={{ marginBottom: 12 }} />
          <label className="nl-label">Gatilho</label>
          <select className="nl-select" value={form.gatilho} onChange={(e) => setForm({ ...form, gatilho: e.target.value })} style={{ marginBottom: 12 }}>
            <option value="lead_criado">Lead criado</option>
            <option value="mensagem_recebida">Mensagem recebida</option>
          </select>
          <label className="nl-label">Ações JSON</label>
          <textarea className="nl-textarea" value={form.acoes} onChange={(e) => setForm({ ...form, acoes: e.target.value })} />
          <button className="nl-btn nl-btn--accent" style={{ width: '100%', marginTop: 14 }} onClick={salvar}>Criar automação</button>
          {msg && <p className={msg.includes('criada') ? 'nl-success' : 'nl-error'}>{msg}</p>}
        </section>
      )}

      {activePanel === 'lista' && (
        <section className="nl-card nl-tab-panel" id="automations-panel-lista" role="tabpanel" aria-labelledby="automations-tab-lista" style={{ maxWidth: 980, overflow: 'hidden' }}>
          <table className="nl-table">
            <thead><tr><th>Nome</th><th>Gatilho</th><th>Status</th><th>Ação</th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={4} className="faint" style={{ padding: 24, textAlign: 'center' }}>Nenhuma automação.</td></tr>}
              {items.map((item) => (
                <tr key={item.id}>
                  <td><b>{item.nome}</b><div className="faint">{JSON.stringify(item.acoes)}</div></td>
                  <td>{item.gatilho}</td>
                  <td><span className={`nl-badge ${item.ativo ? 'nl-badge--ok' : ''}`}>{item.ativo ? 'ativa' : 'inativa'}</span></td>
                  <td><button className="nl-btn nl-btn--ghost nl-btn--sm" onClick={() => desativar(item.id)}>Desativar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </Shell>
  );
}
