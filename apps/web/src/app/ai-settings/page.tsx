'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const DEFAULTS: Record<string, { label: string; model: string; embedding: string; keyHint: string }> = {
  openai: { label: 'OpenAI', model: 'gpt-4o-mini', embedding: 'text-embedding-3-small', keyHint: 'sk-...' },
  anthropic: { label: 'Anthropic', model: 'claude-haiku-4-5-20251001', embedding: '', keyHint: 'sk-ant-...' },
  google: { label: 'Google Gemini', model: 'gemini-1.5-flash', embedding: '', keyHint: 'AIza...' },
};

type AiSetting = {
  id: string;
  provider: string;
  key_last4: string | null;
  default_model: string;
  embedding_model: string | null;
  input_cost_per_1m: string;
  output_cost_per_1m: string;
  embedding_cost_per_1m: string;
  currency: string;
  ativo: boolean;
};

export default function AiSettingsPage() {
  const { token, ready } = useStoredToken();
  const [settings, setSettings] = useState<AiSetting[]>([]);
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'google'>('openai');
  const [form, setForm] = useState({
    apiKey: '',
    defaultModel: DEFAULTS.openai.model,
    embeddingModel: DEFAULTS.openai.embedding,
    inputCostPer1M: '0',
    outputCostPer1M: '0',
    embeddingCostPer1M: '0',
    currency: 'USD',
  });
  const [msg, setMsg] = useState('');
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  const active = useMemo(() => settings.find((s) => s.provider === provider), [settings, provider]);

  useEffect(() => { if (token) carregar(); }, [token]);
  useEffect(() => carregarProvider(provider), [provider, settings]);

  async function carregar() {
    if (!token) return;
    const r = await fetch(`${API}/ai-settings`, { headers: auth(token) });
    const d = await r.json();
    setSettings(Array.isArray(d) ? d : []);
  }

  function carregarProvider(nextProvider: 'openai' | 'anthropic' | 'google') {
    const defaults = DEFAULTS[nextProvider];
    const current = settings.find((s) => s.provider === nextProvider);
    setForm((f) => ({
      ...f,
      apiKey: '',
      defaultModel: current?.default_model || defaults.model,
      embeddingModel: current?.embedding_model || defaults.embedding,
      inputCostPer1M: String(current?.input_cost_per_1m ?? '0'),
      outputCostPer1M: String(current?.output_cost_per_1m ?? '0'),
      embeddingCostPer1M: String(current?.embedding_cost_per_1m ?? '0'),
      currency: current?.currency || 'USD',
    }));
  }

  async function salvar() {
    if (!token) return;
    setMsg('');
    const r = await fetch(`${API}/ai-settings/${provider}`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify(form),
    });
    setMsg(r.ok ? `${DEFAULTS[provider].label} salvo.` : JSON.stringify(await r.json()));
    setForm({ ...form, apiKey: '' });
    await carregar();
  }

  async function testar() {
    if (!token) return;
    setMsg('');
    const r = await fetch(`${API}/ai-settings/${provider}/test`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ apiKey: form.apiKey, defaultModel: form.defaultModel }),
    });
    const d = await r.json();
    if (d.resolvedModel && d.resolvedModel !== form.defaultModel) {
      setForm((current) => ({ ...current, defaultModel: d.resolvedModel }));
    }
    if (d.ok) {
      const modelMsg = d.resolvedModel ? ` Modelo: ${d.resolvedModel}.` : '';
      setMsg(`${DEFAULTS[provider].label} validado.${modelMsg} Clique em Salvar IA para gravar a chave.`);
      return;
    }
    const models = Array.isArray(d.availableModels) && d.availableModels.length
      ? ` Modelos disponiveis: ${d.availableModels.slice(0, 5).join(', ')}`
      : '';
    setMsg(d.message ? `${d.message}${models}` : `Falha ${DEFAULTS[provider].label}: ${d.status}${models}`);
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="IA e Custos">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Providers de IA</h1>
          <div className="sub">Chaves BYOK criptografadas e custos por 1M tokens</div>
        </div>
        {active && <span className={`nl-badge ${active.ativo ? 'nl-badge--ok' : 'nl-badge--warn'}`}>chave ****{active.key_last4 || '----'}</span>}
      </div>

      <section className="nl-card nl-card--pad" style={{ maxWidth: 820 }}>
        <label className="nl-label">Provider</label>
        <select className="nl-select" value={provider} onChange={(e) => setProvider(e.target.value as any)} style={{ marginBottom: 14 }}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google Gemini</option>
        </select>

        <label className="nl-label">API Key</label>
        <input
          className="nl-input"
          type="password"
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          placeholder={active?.key_last4 ? 'Preencha apenas se quiser trocar a chave' : DEFAULTS[provider].keyHint}
          style={{ marginBottom: 14 }}
        />

        <div className="nl-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
          <Field label="Modelo padrao" value={form.defaultModel} onChange={(v) => setForm({ ...form, defaultModel: v })} />
          <Field label="Modelo embeddings" value={form.embeddingModel} onChange={(v) => setForm({ ...form, embeddingModel: v })} disabled={provider !== 'openai'} />
          <Field label="Input / 1M tokens" value={form.inputCostPer1M} onChange={(v) => setForm({ ...form, inputCostPer1M: v })} />
          <Field label="Output / 1M tokens" value={form.outputCostPer1M} onChange={(v) => setForm({ ...form, outputCostPer1M: v })} />
          <Field label="Embedding / 1M tokens" value={form.embeddingCostPer1M} onChange={(v) => setForm({ ...form, embeddingCostPer1M: v })} disabled={provider !== 'openai'} />
          <Field label="Moeda" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} />
        </div>

        <div className="nl-row" style={{ justifyContent: 'space-between' }}>
          <p className="faint" style={{ margin: 0, fontSize: '0.84rem' }}>
            OpenAI suporta tools do agente. Anthropic e Google ja respondem texto, mas tools avancadas ainda ficam restritas ao OpenAI.
          </p>
          <div className="nl-row">
            <button className="nl-btn nl-btn--ghost" onClick={testar}>Testar chave</button>
            <button className="nl-btn nl-btn--accent" onClick={salvar}>Salvar IA</button>
          </div>
        </div>

        {msg && <p className={msg.includes('salvo') || msg.includes('validado') ? 'nl-success' : 'nl-error'}>{msg}</p>}
      </section>
    </Shell>
  );
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <label className="nl-label">{label}</label>
      <input className="nl-input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}
