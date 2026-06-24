'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Doc = {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  preview: string;
  chunk_count: number;
  embedding_model: string | null;
  indexado_em: string | null;
};
type KnowledgePanel = 'documentos' | 'editor';

const SUPPORTED = ['text/plain', 'text/markdown', 'application/json', 'text/csv'];

export default function KnowledgePage() {
  const { token, ready } = useStoredToken();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [form, setForm] = useState({ titulo: '', conteudo: '' });
  const [activePanel, setActivePanel] = useState<KnowledgePanel>('documentos');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  const totalChunks = useMemo(() => docs.reduce((sum, doc) => sum + Number(doc.chunk_count || 0), 0), [docs]);

  useEffect(() => { if (token) carregar(); }, [token]);

  async function carregar() {
    if (!token) return;
    const r = await fetch(`${API}/knowledge`, { headers: auth(token) });
    const data = await r.json();
    setDocs(Array.isArray(data) ? data : []);
  }

  async function salvar() {
    if (!token || !form.titulo.trim() || !form.conteudo.trim() || loading) return;
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(editingId ? `${API}/knowledge/${editingId}` : `${API}/knowledge`, {
        method: editingId ? 'PUT' : 'POST',
        headers: auth(token),
        body: JSON.stringify({ titulo: form.titulo, conteudo: form.conteudo, tipo: 'text' }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || JSON.stringify(d));
      setMsg(
        editingId
          ? `Documento atualizado: ${d.chunk_count} chunks${d.embedding_model ? ` / ${d.embedding_model}` : ' / busca textual'}.`
          : `Documento indexado: ${d.chunk_count} chunks${d.embedding_model ? ` / ${d.embedding_model}` : ' / busca textual'}.`,
      );
      setForm({ titulo: '', conteudo: '' });
      setEditingId(null);
      await carregar();
    } catch (e: any) {
      setMsg(e?.message || (editingId ? 'Falha ao atualizar documento' : 'Falha ao indexar documento'));
    } finally {
      setLoading(false);
    }
  }

  async function editar(id: string) {
    if (!token || loadingEditId) return;
    setLoadingEditId(id);
    setMsg('');
    try {
      const r = await fetch(`${API}/knowledge/${id}`, { headers: auth(token) });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || 'Falha ao carregar documento');
      setEditingId(id);
      setForm({ titulo: d.titulo || '', conteudo: d.conteudo || '' });
      setActivePanel('editor');
      setMsg('Documento carregado para edicao.');
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao carregar documento');
    } finally {
      setLoadingEditId(null);
    }
  }

  function cancelarEdicao() {
    setEditingId(null);
    setForm({ titulo: '', conteudo: '' });
    setMsg('');
  }

  async function remover(id: string) {
    if (!token) return;
    const doc = docs.find((item) => item.id === id);
    if (!confirm(`Excluir definitivamente "${doc?.titulo || 'este documento'}" da base de conhecimento?`)) return;

    setRemovingId(id);
    setMsg('');
    try {
      const r = await fetch(`${API}/knowledge/${id}`, { method: 'DELETE', headers: auth(token) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d?.message || 'Falha ao excluir documento');
      setDocs((current) => current.filter((item) => item.id !== id));
      setMsg('Documento excluido da base de conhecimento.');
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao excluir documento');
    } finally {
      setRemovingId(null);
    }
  }

  async function importarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg('');

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setMsg('PDF ainda precisa de parser dedicado. Use TXT, MD, JSON ou CSV por enquanto.');
      e.target.value = '';
      return;
    }

    if (file.type && !SUPPORTED.includes(file.type) && !/\.(txt|md|markdown|json|csv)$/i.test(file.name)) {
      setMsg('Formato nao suportado. Use TXT, MD, JSON ou CSV.');
      e.target.value = '';
      return;
    }

    const text = await file.text();
    setForm({ titulo: form.titulo || file.name.replace(/\.[^.]+$/, ''), conteudo: text });
    e.target.value = '';
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Conhecimento">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Base de conhecimento</h1>
          <div className="sub">Documentos que o agente pode consultar antes de responder.</div>
        </div>
      </div>

      <div className="nl-tabs nl-tabs--page" role="tablist" aria-label="Areas da base de conhecimento">
        <button type="button" id="knowledge-tab-documentos" role="tab" aria-selected={activePanel === 'documentos'} aria-controls="knowledge-panel-documentos" className={`nl-tab ${activePanel === 'documentos' ? 'active' : ''}`} onClick={() => setActivePanel('documentos')}>
          Documentos
          <span>{docs.length}</span>
        </button>
        <button type="button" id="knowledge-tab-editor" role="tab" aria-selected={activePanel === 'editor'} aria-controls="knowledge-panel-editor" className={`nl-tab ${activePanel === 'editor' ? 'active' : ''}`} onClick={() => setActivePanel('editor')}>
          {editingId ? 'Editar documento' : 'Adicionar conteudo'}
          <span>{totalChunks} chunks</span>
        </button>
      </div>

      {activePanel === 'editor' && (
        <section className="nl-card nl-card--pad nl-knowledge-form nl-tab-panel" id="knowledge-panel-editor" role="tabpanel" aria-labelledby="knowledge-tab-editor" style={{ maxWidth: 860 }}>
          <div className="nl-panel-head">
            <div>
              <div className="eyebrow">Novo documento</div>
              <h3>{editingId ? 'Editar conteudo' : 'Adicionar conteudo'}</h3>
            </div>
            <span className="nl-badge">{editingId ? 'Reindexacao' : 'TXT / MD / JSON / CSV'}</span>
          </div>

          <label className="nl-label">Upload</label>
          <input
            className="nl-input"
            type="file"
            accept=".txt,.md,.markdown,.json,.csv,text/plain,text/markdown,application/json,text/csv"
            onChange={importarArquivo}
            style={{ paddingTop: 9, marginBottom: 12 }}
          />
          <label className="nl-label">Titulo</label>
          <input
            className="nl-input"
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            placeholder="Ex: Politica comercial, FAQ, regras de atendimento"
            style={{ marginBottom: 12 }}
          />
          <label className="nl-label">Conteudo</label>
          <textarea
            className="nl-textarea nl-knowledge-textarea"
            value={form.conteudo}
            onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
            placeholder="Cole aqui as informacoes que o agente deve usar nas respostas."
          />
          <div className="nl-knowledge-form__actions">
            {editingId && (
              <button className="nl-btn nl-btn--ghost" disabled={loading} onClick={cancelarEdicao}>
                Cancelar edicao
              </button>
            )}
            <button className="nl-btn nl-btn--accent" disabled={loading} onClick={salvar}>
              {loading ? (editingId ? 'Salvando...' : 'Indexando...') : (editingId ? 'Salvar alteracoes' : 'Indexar conhecimento')}
            </button>
          </div>
          {msg && <p className={msg.includes('indexado') || msg.includes('atualizado') || msg.includes('excluido') || msg.includes('carregado') ? 'nl-success' : 'nl-error'}>{msg}</p>}
        </section>
      )}

      {activePanel === 'documentos' && (
        <section className="nl-card nl-card--pad nl-knowledge-list nl-tab-panel" id="knowledge-panel-documentos" role="tabpanel" aria-labelledby="knowledge-tab-documentos" style={{ maxWidth: 1120 }}>
          <div className="nl-panel-head">
            <div>
              <div className="eyebrow">Documentos indexados</div>
              <h3>{docs.length} {docs.length === 1 ? 'documento' : 'documentos'}</h3>
              <p className="muted" style={{ marginTop: 4 }}>{totalChunks} chunks disponiveis para busca.</p>
            </div>
            <button className="nl-btn nl-btn--ghost nl-btn--sm" onClick={carregar}>Atualizar</button>
          </div>

          {docs.length === 0 ? (
            <div className="nl-empty" style={{ padding: 28 }}>
              <div className="display display-sm">Nenhum documento</div>
              <p className="muted">Adicione instrucoes, politicas, respostas ou arquivos para o agente consultar.</p>
            </div>
          ) : (
            <div className="nl-knowledge-docs">
              {docs.map((doc) => (
                <article key={doc.id} className="nl-knowledge-doc">
                  <div className="nl-knowledge-doc__main">
                    <div className="nl-knowledge-doc__top">
                      <h3>{doc.titulo}</h3>
                      <span className={`nl-badge ${doc.status === 'ativo' ? 'nl-badge--ok' : ''}`}>{doc.status}</span>
                    </div>
                    <p>{doc.preview || 'Sem previa disponivel.'}</p>
                    <div className="nl-knowledge-doc__meta">
                      <span>{doc.chunk_count || 0} chunks</span>
                      <span>{doc.embedding_model || 'busca textual'}</span>
                    </div>
                  </div>
                  <div className="nl-knowledge-doc__actions">
                    <button
                      className="nl-btn nl-btn--ghost nl-btn--sm"
                      onClick={() => editar(doc.id)}
                      disabled={loadingEditId === doc.id || removingId === doc.id}
                    >
                      {loadingEditId === doc.id ? 'Abrindo...' : 'Editar'}
                    </button>
                    <button
                      className="nl-btn nl-btn--danger nl-btn--sm"
                      onClick={() => remover(doc.id)}
                      disabled={removingId === doc.id || loadingEditId === doc.id}
                    >
                      {removingId === doc.id ? 'Excluindo...' : 'Excluir'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </Shell>
  );
}
