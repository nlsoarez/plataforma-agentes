'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type AgentRow = {
  projeto_id: string;
  projeto_nome: string;
  phone_number_id: string | null;
  projeto_status: string;
  transporte_driver: string;
  agente_id: string | null;
  prompt_sistema: string | null;
  modelo: string | null;
  provider: string | null;
  byok_key_ref: string | null;
  agente_status: string | null;
  provider_default_model: string | null;
  provider_key_last4: string | null;
};

const DEFAULT_PROMPT = `Você é um atendente objetivo, educado e comercial.
Responda em português do Brasil.
Faça perguntas curtas para entender a necessidade do lead.
Quando o cliente pedir atendimento humano, acione handoff.
Nunca invente preço, prazo ou política que não esteja no contexto.`;

const PROVIDERS: Record<string, { label: string; model: string; keyPageLabel: string }> = {
  openai: { label: 'OpenAI', model: 'gpt-4o-mini', keyPageLabel: 'OpenAI' },
  anthropic: { label: 'Anthropic Claude', model: 'claude-3-5-haiku-20241022', keyPageLabel: 'Anthropic' },
  google: { label: 'Google Gemini', model: 'gemini-1.5-flash', keyPageLabel: 'Google Gemini' },
};

export default function AgentesPage() {
  const { token, ready } = useStoredToken();
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [form, setForm] = useState({
    prompt_sistema: DEFAULT_PROMPT,
    modelo: PROVIDERS.openai.model,
    provider: 'openai',
    byok_key_ref: '',
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const selected = useMemo(() => rows.find((r) => r.projeto_id === selectedId) ?? rows[0], [rows, selectedId]);

  useEffect(() => {
    if (token) carregar();
  }, [token]);

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.projeto_id);
    setForm({
      prompt_sistema: selected.prompt_sistema || DEFAULT_PROMPT,
      modelo: selected.modelo || selected.provider_default_model || PROVIDERS[selected.provider || 'openai']?.model || PROVIDERS.openai.model,
      provider: selected.provider || 'openai',
      byok_key_ref: selected.byok_key_ref || '',
    });
  }, [selected?.projeto_id]);

  function trocarProvider(provider: string) {
    setForm((current) => ({
      ...current,
      provider,
      modelo: PROVIDERS[provider]?.model || current.modelo,
    }));
  }

  async function carregar() {
    if (!token) return;
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/agentes`, { headers: auth(token) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message || JSON.stringify(d));
      setRows(d);
      if (!selectedId && d[0]) setSelectedId(d[0].projeto_id);
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao carregar agentes');
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    if (!token || !selected) return;
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/agentes/${selected.projeto_id}`, {
        method: 'PUT',
        headers: auth(token),
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || JSON.stringify(d));
      setMsg('Agente salvo e ativado.');
      await carregar();
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao salvar agente');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Agentes">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Agentes e conexões</h1>
          <div className="sub">Números conectados, roteamento e configuração do agente ativo</div>
        </div>
        <button className="nl-btn nl-btn--ghost" onClick={carregar} disabled={loading}>Atualizar</button>
      </div>

      {rows.length === 0 ? (
        <div className="nl-card nl-card--pad nl-empty" style={{ maxWidth: 520 }}>
          <div className="display display-md">Nenhuma conexão</div>
          <div>Conecte um número em Conectar WhatsApp primeiro.</div>
        </div>
      ) : (
        <div className="nl-agents-grid">
          <section className="nl-stack">
            {rows.map((row) => (
              <button
                key={row.projeto_id}
                className={`nl-agent-session ${row.projeto_id === selected?.projeto_id ? 'active' : ''}`}
                onClick={() => setSelectedId(row.projeto_id)}
              >
                <span>
                  <b>{row.projeto_nome}</b>
                  <small>{row.phone_number_id || 'sem conexão'}</small>
                </span>
                <i className={row.projeto_status === 'ativo' ? 'ok' : ''}>{row.projeto_status}</i>
              </button>
            ))}
          </section>

          <section className="nl-card nl-card--pad">
            {selected && (
              <>
                <div className="nl-agent-head">
                  <div>
                    <div className="eyebrow">Projeto ativo</div>
                    <h2>{selected.projeto_nome}</h2>
                    <p className="muted">WhatsApp / {selected.phone_number_id || 'sem rota'}</p>
                  </div>
                  <span className={`nl-badge ${selected.agente_status === 'ativo' ? 'nl-badge--ok' : 'nl-badge--warn'}`}>
                    {selected.agente_status || 'sem agente'}
                  </span>
                </div>

                {form.provider !== 'openai' && !selected.provider_key_last4 && !form.byok_key_ref && (
                  <div className="nl-error" style={{ marginBottom: 14 }}>
                    Chave {PROVIDERS[form.provider]?.keyPageLabel || form.provider} ainda não foi salva em IA e Custos.
                  </div>
                )}

                <div className="nl-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
                  <div>
                    <label className="nl-label">Provider</label>
                    <select className="nl-select" value={form.provider} onChange={(e) => trocarProvider(e.target.value)}>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic Claude</option>
                      <option value="google">Google Gemini</option>
                    </select>
                  </div>
                  <div>
                    <label className="nl-label">Modelo</label>
                    <input className="nl-input" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
                  </div>
                </div>

                <div className="nl-card nl-card--pad" style={{ background: 'rgba(21,101,255,0.06)', marginBottom: 14 }}>
                  <b>Chave {PROVIDERS[form.provider]?.keyPageLabel || 'IA'}</b>
                  <p className="muted" style={{ margin: '6px 0 12px', fontSize: '0.9rem' }}>
                    Configure, teste e salve a chave em IA e Custos. Anthropic e Google respondem texto; tools avançadas ainda ficam no OpenAI.
                    {selected.provider_key_last4 ? ` Chave salva: ****${selected.provider_key_last4}.` : ''}
                  </p>
                  <a className="nl-btn nl-btn--ghost nl-btn--sm" href="/ai-settings">Abrir IA e Custos</a>
                </div>

                <label className="nl-label">Referência BYOK legada opcional</label>
                <input
                  className="nl-input"
                  value={form.byok_key_ref}
                  onChange={(e) => setForm({ ...form, byok_key_ref: e.target.value })}
                  placeholder="ex: OPENAI_KEY_CLIENTE_A"
                  style={{ marginBottom: 14 }}
                />

                <label className="nl-label">Prompt do sistema</label>
                <textarea
                  className="nl-textarea"
                  value={form.prompt_sistema}
                  onChange={(e) => setForm({ ...form, prompt_sistema: e.target.value })}
                />

                <div className="nl-row" style={{ justifyContent: 'space-between', marginTop: 14, alignItems: 'center' }}>
                  <span className="faint" style={{ fontSize: '0.82rem' }}>O worker usa somente o agente com status ativo.</span>
                  <button className="nl-btn nl-btn--accent" onClick={salvar} disabled={loading}>Salvar agente</button>
                </div>

                {msg && <p className={msg.includes('salvo') ? 'nl-success' : 'nl-error'}>{msg}</p>}
              </>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
