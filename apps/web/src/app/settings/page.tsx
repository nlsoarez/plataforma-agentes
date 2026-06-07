'use client';

import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function SettingsPage() {
  const { token, ready } = useStoredToken();
  const [form, setForm] = useState<any>({});
  const [msg, setMsg] = useState('');
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => { if (token) carregar(); }, [token]);

  async function carregar() {
    if (!token) return;
    const r = await fetch(`${API}/settings/tenant`, { headers: auth(token) });
    setForm(await r.json());
  }

  async function salvar() {
    if (!token) return;
    const r = await fetch(`${API}/settings/tenant`, { method: 'PATCH', headers: auth(token), body: JSON.stringify(form) });
    setMsg(r.ok ? 'Marca atualizada.' : JSON.stringify(await r.json()));
    if (r.ok) setForm(await r.json());
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Marca">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>White-label</h1>
          <div className="sub">Identidade da agência, domínio e aparência básica</div>
        </div>
      </div>

      <section className="nl-card nl-card--pad" style={{ maxWidth: 760 }}>
        <div className="nl-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label="Nome" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
          <Field label="Domínio" value={form.dominio} onChange={(v) => setForm({ ...form, dominio: v })} />
          <Field label="Logo URL" value={form.logo_url} onChange={(v) => setForm({ ...form, logo_url: v })} />
          <Field label="Favicon URL" value={form.favicon_url} onChange={(v) => setForm({ ...form, favicon_url: v })} />
          <Field label="Cor primária" value={form.cor_primaria} onChange={(v) => setForm({ ...form, cor_primaria: v })} />
          <Field label="E-mail suporte" value={form.support_email} onChange={(v) => setForm({ ...form, support_email: v })} />
        </div>
        <label className="nl-label" style={{ marginTop: 14 }}>CSS customizado</label>
        <textarea className="nl-textarea" style={{ minHeight: 120 }} value={form.custom_css || ''} onChange={(e) => setForm({ ...form, custom_css: e.target.value })} />
        <div className="nl-row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <div className="nl-row">
            <span className="nl-badge">{form.plano || 'trial'}</span>
            <span className={`nl-badge ${form.status === 'active' ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{form.status || '-'}</span>
          </div>
          <button className="nl-btn nl-btn--accent" onClick={salvar}>Salvar marca</button>
        </div>
        {msg && <p className={msg.includes('atualizada') ? 'nl-success' : 'nl-error'}>{msg}</p>}
      </section>
    </Shell>
  );
}

function Field({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="nl-label">{label}</label>
      <input className="nl-input" value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
