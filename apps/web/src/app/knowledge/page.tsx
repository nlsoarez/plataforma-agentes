'use client';

import { ChangeEvent, useEffect, useState } from 'react';
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

const SUPPORTED = ['text/plain', 'text/markdown', 'application/json', 'text/csv'];

export default function KnowledgePage() {
  const { token, ready } = useStoredToken();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [form, setForm] = useState({ titulo: '', conteudo: '' });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => { if (token) carregar(); }, [token]);

  async function carregar() {
    if (!token) return;
    const r = await fetch(`${API}/knowledge`, { headers: auth(token) });
    setDocs(await r.json());
  }

  async function salvar() {
    if (!token || !form.titulo.trim() || !form.conteudo.trim() || loading) return;
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/knowledge`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({ titulo: form.titulo, conteudo: form.conteudo, tipo: 'text' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message || JSON.stringify(d));
      setMsg(`Documento indexado: ${d.chunk_count} chunks${d.embedding_model ? ` / ${d.embedding_model}` : ' / busca textual'}.`);
      setForm({ titulo: '', conteudo: '' });
      await carregar();
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao indexar documento');
    } finally {
      setLoading(false);
    }
  }

  async function remover(id: string) {
    if (!token) return;
    await fetch(`${API}/knowledge/${id}`, { method: 'DELETE', headers: auth(token) });
    await carregar();
  }

  async function importarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg('');

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setMsg('PDF ainda precisa de parser dedicado. Use TXT/MD/JSON/CSV por enquanto.');
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
          <div className="sub">Chunking, embeddings opcionais e fallback textual para o agente</div>
        </div>
      </div>

      <div className="nl-dashboard-grid">
        <section className="nl-card nl-card--pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Novo documento</div>
          <label className="nl-label">Upload TXT / MD / JSON / CSV</label>
          <input className="nl-input" type="file" accept=".txt,.md,.markdown,.json,.csv,text/plain,text/markdown,application/json,text/csv" onChange={importarArquivo} style={{ paddingTop: 9, marginBottom: 12 }} />
          <label className="nl-label">Titulo</label>
          <input className="nl-input" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} style={{ marginBottom: 12 }} />
          <label className="nl-label">Conteudo</label>
          <textarea className="nl-textarea" value={form.conteudo} onChange={(e) => setForm({ ...form, conteudo: e.target.value })} />
          <button className="nl-btn nl-btn--accent" disabled={loading} style={{ width: '100%', marginTop: 14 }} onClick={salvar}>
            {loading ? 'Indexando...' : 'Indexar conhecimento'}
          </button>
          {msg && <p className={msg.includes('indexado') ? 'nl-success' : 'nl-error'}>{msg}</p>}
        </section>

        <section className="nl-card" style={{ overflow: 'hidden' }}>
          <table className="nl-table">
            <thead><tr><th>Documento</th><th>Indice</th><th>Status</th><th>Ação</th></tr></thead>
            <tbody>
              {docs.length === 0 && <tr><td colSpan={4} className="faint" style={{ padding: 24, textAlign: 'center' }}>Nenhum documento.</td></tr>}
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td><b>{doc.titulo}</b><div className="faint">{doc.preview}</div></td>
                  <td>
                    <b>{doc.chunk_count || 0} chunks</b>
                    <div className="faint">{doc.embedding_model || 'busca textual'}</div>
                  </td>
                  <td><span className={`nl-badge ${doc.status === 'ativo' ? 'nl-badge--ok' : ''}`}>{doc.status}</span></td>
                  <td><button className="nl-btn nl-btn--ghost nl-btn--sm" onClick={() => remover(doc.id)}>Desativar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}
