'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Template = { id: string; nome: string; descricao: string | null; versao: number; origem: string; criado_em: string };
type Projeto = { id: string; nome: string; phone_number_id: string | null; status: string };

const EXEMPLO = `{
  "nome": "Sofia Seguro Fácil",
  "descricao": "Agente comercial para corretora de seguros",
  "prompt_sistema": "Voce e Sofia, atendente de uma corretora de seguros. Qualifique o lead, colete tipo de seguro, cidade e urgencia. Se pedir humano, faca handoff.",
  "modelo": "gpt-4o-mini",
  "provider": "openai",
  "pipeline": [
    { "nome": "Novo lead", "ordem": 0 },
    { "nome": "Em qualificacao", "ordem": 1 },
    { "nome": "Qualificado", "ordem": 2 },
    { "nome": "Atendimento humano", "ordem": 3 },
    { "nome": "Arquivado", "ordem": 4 }
  ],
  "tags": [
    { "nome": "seguro-auto", "cor": "#22C55E" },
    { "nome": "lead-quente", "cor": "#168c50" }
  ],
  "propriedades": [
    { "nome": "tipo_seguro", "tipo": "texto" },
    { "nome": "urgencia", "tipo": "texto" }
  ],
  "automacoes": [
    { "nome": "Tag novo lead", "gatilho": "lead_criado", "acoes": [{ "tipo": "tag", "tag": "novo-lead" }] }
  ],
  "conhecimento": [
    { "titulo": "Politica comercial", "conteudo": "Atendimento inicial deve coletar nome, cidade, tipo de seguro e melhor horario de contato." }
  ]
}`;

export default function TemplatesPage() {
  const { token, ready } = useStoredToken();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [payload, setPayload] = useState(EXEMPLO);
  const [nomeProjeto, setNomeProjeto] = useState('Sofia Seguro Fácil');
  const [organizacao, setOrganizacao] = useState('Seguro Fácil');
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
    catch { setMsg('Template precisa ser JSON valido.'); return; }
    const r = await fetch(`${API}/templates/importar`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ payload: parsed, nomeProjeto, organizacao }),
    });
    const d = await r.json();
    setMsg(r.ok ? `Projeto criado: ${d.projeto?.nome}. Agora conecte o WhatsApp em Conectar WhatsApp.` : JSON.stringify(d));
    await carregar();
  }

  async function salvarTemplate() {
    if (!token) return;
    let parsed: any;
    try { parsed = JSON.parse(payload); }
    catch { setMsg('Template precisa ser JSON valido.'); return; }
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

      <div className="nl-dashboard-grid">
        <section className="nl-card nl-card--pad">
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

        <section className="nl-stack">
          <div className="nl-card nl-card--pad">
            <div className="eyebrow" style={{ marginBottom: 14 }}>Exportar existente</div>
            <label className="nl-label">Projeto</label>
            <select className="nl-select" value={exportProjetoId} onChange={(e) => setExportProjetoId(e.target.value)} style={{ marginBottom: 14 }}>
              {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <button className="nl-btn nl-btn--accent" style={{ width: '100%' }} onClick={exportar}>Exportar JSON</button>
          </div>

          <div className="nl-card" style={{ overflow: 'hidden' }}>
            <table className="nl-table">
              <thead><tr><th>Biblioteca</th><th>Origem</th></tr></thead>
              <tbody>
                {templates.length === 0 && <tr><td colSpan={2} className="faint" style={{ padding: 24, textAlign: 'center' }}>Nenhum template salvo.</td></tr>}
                {templates.map((t) => (
                  <tr key={t.id}><td><b>{t.nome}</b><div className="faint">{t.descricao || 'sem descricao'}</div></td><td>{t.origem}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Shell>
  );
}
