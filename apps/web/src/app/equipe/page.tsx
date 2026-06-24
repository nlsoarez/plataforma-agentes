'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Departamento = { id: string; nome: string; descricao: string | null };
type Usuario = { id: string; nome: string | null; email: string; papel: string; status: string; departamento_nome: string | null };
type EquipePanel = 'usuarios' | 'novo' | 'departamentos';

export default function EquipePage() {
  const { token, ready } = useStoredToken();
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [activePanel, setActivePanel] = useState<EquipePanel>('usuarios');
  const [dep, setDep] = useState({ nome: '', descricao: '' });
  const [user, setUser] = useState({ nome: '', email: '', senha: '', papel: 'atendente', departamentoId: '' });
  const [msg, setMsg] = useState('');
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    if (token) void carregar();
  }, [token]);

  async function carregar() {
    if (!token) return;
    const [d, u] = await Promise.all([
      fetch(`${API}/equipe/departamentos`, { headers: auth(token) }).then((r) => r.json()),
      fetch(`${API}/equipe/usuarios`, { headers: auth(token) }).then((r) => r.json()),
    ]);
    setDepartamentos(Array.isArray(d) ? d : []);
    setUsuarios(Array.isArray(u) ? u : []);
  }

  async function criarDepartamento() {
    if (!token || !dep.nome.trim()) return;
    const r = await fetch(`${API}/equipe/departamentos`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify(dep),
    });
    setMsg(r.ok ? 'Departamento criado.' : JSON.stringify(await r.json()));
    setDep({ nome: '', descricao: '' });
    await carregar();
  }

  async function criarUsuario() {
    if (!token || !user.email.trim() || !user.senha.trim()) return;
    const body = { ...user, departamentoId: user.departamentoId || undefined };
    const r = await fetch(`${API}/equipe/usuarios`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify(body),
    });
    setMsg(r.ok ? 'Usuário criado/atualizado.' : JSON.stringify(await r.json()));
    setUser({ nome: '', email: '', senha: '', papel: 'atendente', departamentoId: '' });
    await carregar();
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Equipe">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Equipe e departamentos</h1>
          <div className="sub">Subcontas, papéis e roteamento humano</div>
        </div>
      </div>

      <div className="nl-tabs nl-tabs--page" role="tablist" aria-label="Areas da equipe">
        <button type="button" id="team-tab-usuarios" role="tab" aria-selected={activePanel === 'usuarios'} aria-controls="team-panel-usuarios" className={`nl-tab ${activePanel === 'usuarios' ? 'active' : ''}`} onClick={() => setActivePanel('usuarios')}>
          Usuarios
          <span>{usuarios.length}</span>
        </button>
        <button type="button" id="team-tab-novo" role="tab" aria-selected={activePanel === 'novo'} aria-controls="team-panel-novo" className={`nl-tab ${activePanel === 'novo' ? 'active' : ''}`} onClick={() => setActivePanel('novo')}>
          Novo usuario
        </button>
        <button type="button" id="team-tab-departamentos" role="tab" aria-selected={activePanel === 'departamentos'} aria-controls="team-panel-departamentos" className={`nl-tab ${activePanel === 'departamentos' ? 'active' : ''}`} onClick={() => setActivePanel('departamentos')}>
          Departamentos
          <span>{departamentos.length}</span>
        </button>
      </div>

      {activePanel === 'novo' && (
        <section className="nl-card nl-card--pad nl-tab-panel" id="team-panel-novo" role="tabpanel" aria-labelledby="team-tab-novo" style={{ maxWidth: 820 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Novo usuário</div>
          <label className="nl-label">Nome</label>
          <input className="nl-input" value={user.nome} onChange={(e) => setUser({ ...user, nome: e.target.value })} style={{ marginBottom: 10 }} />
          <label className="nl-label">E-mail</label>
          <input className="nl-input" value={user.email} onChange={(e) => setUser({ ...user, email: e.target.value })} style={{ marginBottom: 10 }} />
          <label className="nl-label">Senha temporária</label>
          <input className="nl-input" type="password" value={user.senha} onChange={(e) => setUser({ ...user, senha: e.target.value })} style={{ marginBottom: 10 }} />
          <div className="nl-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
            <div>
              <label className="nl-label">Papel</label>
              <select className="nl-select" value={user.papel} onChange={(e) => setUser({ ...user, papel: e.target.value })}>
                <option value="atendente">Atendente</option>
                <option value="admin">Admin</option>
                <option value="cliente_final">Cliente final</option>
              </select>
            </div>
            <div>
              <label className="nl-label">Departamento</label>
              <select className="nl-select" value={user.departamentoId} onChange={(e) => setUser({ ...user, departamentoId: e.target.value })}>
                <option value="">Sem departamento</option>
                {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
          </div>
          <button className="nl-btn nl-btn--accent" style={{ width: '100%' }} onClick={criarUsuario}>Salvar usuário</button>
          {msg && <p className={msg.includes('criado') || msg.includes('atualizado') ? 'nl-success' : 'nl-error'}>{msg}</p>}
        </section>
      )}

      {activePanel === 'departamentos' && (
        <section className="nl-card nl-card--pad nl-tab-panel" id="team-panel-departamentos" role="tabpanel" aria-labelledby="team-tab-departamentos" style={{ maxWidth: 860 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Departamentos</div>
          <div className="nl-row" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label className="nl-label">Nome</label>
              <input className="nl-input" value={dep.nome} onChange={(e) => setDep({ ...dep, nome: e.target.value })} />
            </div>
            <button className="nl-btn nl-btn--accent" onClick={criarDepartamento}>Criar</button>
          </div>
          <table className="nl-table">
            <thead><tr><th>Nome</th><th>Descrição</th></tr></thead>
            <tbody>
              {departamentos.length > 0 ? (
                departamentos.map((d) => <tr key={d.id}><td>{d.nome}</td><td>{d.descricao || '-'}</td></tr>)
              ) : (
                <tr><td colSpan={2}><span className="faint">Nenhum departamento cadastrado.</span></td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {activePanel === 'usuarios' && (
      <section className="nl-card nl-tab-panel" id="team-panel-usuarios" role="tabpanel" aria-labelledby="team-tab-usuarios" style={{ maxWidth: 1120, overflow: 'hidden' }}>
        <table className="nl-table">
          <thead><tr><th>Usuário</th><th>Papel</th><th>Departamento</th><th>Status</th></tr></thead>
          <tbody>
            {usuarios.length > 0 ? (
              usuarios.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.nome || u.email}</b><div className="faint">{u.email}</div></td>
                  <td>{u.papel}</td>
                  <td>{u.departamento_nome || '-'}</td>
                  <td><span className={`nl-badge ${u.status === 'ativo' ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{u.status}</span></td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={4}><span className="faint">Nenhum usuário cadastrado.</span></td></tr>
            )}
          </tbody>
        </table>
      </section>
      )}
    </Shell>
  );
}
