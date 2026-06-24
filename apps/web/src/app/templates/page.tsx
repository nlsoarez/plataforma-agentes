'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Template = { id: string; nome: string; descricao: string | null; versao: number; origem: string; criado_em: string };
type Projeto = { id: string; nome: string; phone_number_id: string | null; status: string };
type TemplatesPanel = 'editor' | 'exportar' | 'biblioteca';

const TEMPLATE_VAZIO = `{
  "nome": "",
  "descricao": "",
  "prompt_sistema": "",
  "modelo": "",
  "provider": "",
  "pipeline": [],
  "tags": [],
  "propriedades": [],
  "automacoes": [],
  "conhecimento": []
}`;

export default function TemplatesPage() {
  const { token, ready } = useStoredToken();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [activePanel, setActivePanel] = useState<TemplatesPanel>('editor');
  const [payload, setPayload] = useState(TEMPLATE_VAZIO);
  const [nomeProjeto, setNomeProjeto] = useState('');
  const [organizacao, setOrganizacao] = useState('');
  const [exportProjetoId, setExportProjetoId] = useState('');
  const [msg, setMsg] = useState('');
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => { if (token) carregar(); }, [token]);

  async function carregar() {
    if (!token) return;
    const [tpl, proj] = await Promise.all([
      fetch(`${API}/templates`, { headers: auth(token) }).then((r) => r.json()),
      fetch(`${API}/projetos`, { headers: auth(token) }).then((r) => r.json()),
    ]);
    setTemplates(Array.isArray(tpl) ? tpl : []);
    setProjetos(Array.isArray(proj) ? proj : []);
    if (!exportProjetoId && proj?.[0]) setExportProjetoId(proj[0].id);
  }

  async function importarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPayload(await file.text());
    e.target.value = '';
  }

  async function importar() {
    if (!token) return;
    setMsg('');
    let parsed: any;
    try { parsed = JSON.parse(payload); }
    catch { setMsg('Template precisa ser um JSON válido.'); return; }
    const r = await fetch(`${API}/templates/importar`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ payload: parsed, nomeProjeto, organizacao }),
    });
    const d = await r.json();
    setMsg(r.ok ? `Projeto criado: ${d.projeto?.nome}. Agora conecte o WhatsApp.` : JSON.stringify(d));
    await carregar();
  }

  async function salvarTemplate() {
    if (!token) return;
    let parsed: any;
    try { parsed = JSON.parse(payload); }
    catch { setMsg('Template precisa ser um JSON válido.'); return; }
    const r = await fetch(`${API}/templates`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ nome: parsed.nome || nomeProjeto || 'Template', descricao: parsed.descricao, payload: parsed }),
    });
    setMsg(r.ok ? 'Template salvo na biblioteca.' : JSON.stringify(await r.json()));
    await carregar();
  }

  async function exportar() {
    if (!token || !exportProjetoId) return;
    const r = await fetch(`${API}/templates/exportar/${exportProjetoId}`, { headers: auth(token) });
    const d = await r.json();
    setPayload(JSON.stringify(d, null, 2));
    setNomeProjeto(d.nome || '');
    setMsg('Projeto exportado para o editor JSON.');
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Templates">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Templates de projeto</h1>
          <div className="sub">Importe JSON com prompt, pipeline, tags, automações e conhecimento</div>
        </div>
      </div>

      <div className="nl-tabs nl-tabs--page" role="tablist" aria-label="Areas de templates">
        <button type="button" id="templates-tab-editor" role="tab" aria-selected={activePanel === 'editor'} aria-controls="templates-panel-editor" className={`nl-tab ${activePanel === 'editor' ? 'active' : ''}`} onClick={() => setActivePanel('editor')}>
          Editor JSON
        </button>
        <button type="button" id="templates-tab-exportar" role="tab" aria-selected={activePanel === 'exportar'} aria-controls="templates-panel-exportar" className={`nl-tab ${activePanel === 'exportar' ? 'active' : ''}`} onClick={() => setActivePanel('exportar')}>
          Exportar projeto
          <span>{projetos.length}</span>
        </button>
        <button type="button" id="templates-tab-biblioteca" role="tab" aria-selected={activePanel === 'biblioteca'} aria-controls="templates-panel-biblioteca" className={`nl-tab ${activePanel === 'biblioteca' ? 'active' : ''}`} onClick={() => setActivePanel('biblioteca')}>
          Biblioteca
          <span>{templates.length}</span>
        </button>
      </div>

      {activePanel === 'editor' && (
        <section className="nl-card nl-card--pad nl-tab-panel" id="templates-panel-editor" role="tabpanel" aria-labelledby="templates-tab-editor" style={{ maxWidth: 980 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Importar template</div>
          <label className="nl-label">Arquivo JSON</label>
          <input className="nl-input" type="file" accept=".json,application/json" onChange={importarArquivo} style={{ paddingTop: 9, marginBottom: 12 }} />
          <div className="nl-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
            <div>
              <label className="nl-label">Nome do projeto</label>
              <input className="nl-input" value={nomeProjeto} onChange={(e) => setNomeProjeto(e.target.value)} />
            </div>
            <div>
              <label className="nl-label">Organização</label>
              <input className="nl-input" value={organizacao} onChange={(e) => setOrganizacao(e.target.value)} />
            </div>
          </div>
          <label className="nl-label">JSON</label>
          <textarea className="nl-textarea" style={{ minHeight: 360 }} value={payload} onChange={(e) => setPayload(e.target.value)} />
          <div className="nl-row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
            <button className="nl-btn nl-btn--ghost" onClick={salvarTemplate}>Salvar na biblioteca</button>
            <button className="nl-btn nl-btn--accent" onClick={importar}>Criar projeto</button>
          </div>
          {msg && <p className={msg.includes('criado') || msg.includes('salvo') || msg.includes('exportado') ? 'nl-success' : 'nl-error'}>{msg}</p>}
        </section>
      )}

      {activePanel === 'exportar' && (
          <section className="nl-card nl-card--pad nl-tab-panel" id="templates-panel-exportar" role="tabpanel" aria-labelledby="templates-tab-exportar" style={{ maxWidth: 620 }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>Exportar existente</div>
            <label className="nl-label">Projeto</label>
            <select className="nl-select" value={exportProjetoId} onChange={(e) => setExportProjetoId(e.target.value)} style={{ marginBottom: 14 }}>
              {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <button className="nl-btn nl-btn--accent" style={{ width: '100%' }} onClick={exportar}>Exportar JSON</button>
          </section>
      )}

      {activePanel === 'biblioteca' && (
          <section className="nl-card nl-tab-panel" id="templates-panel-biblioteca" role="tabpanel" aria-labelledby="templates-tab-biblioteca" style={{ maxWidth: 980, overflow: 'hidden' }}>
            <table className="nl-table">
              <thead><tr><th>Biblioteca</th><th>Origem</th></tr></thead>
              <tbody>
                {templates.length === 0 && <tr><td colSpan={2} className="faint" style={{ padding: 24, textAlign: 'center' }}>Nenhum template salvo.</td></tr>}
                {templates.map((t) => (
                  <tr key={t.id}><td><b>{t.nome}</b><div className="faint">{t.descricao || 'sem descrição'}</div></td><td>{t.origem}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
      )}
    </Shell>
  );
}
