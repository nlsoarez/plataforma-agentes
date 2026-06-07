'use client';
import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function Billing() {
  const { token, ready } = useStoredToken();
  const [info, setInfo] = useState<any>(null);
  const [form, setForm] = useState({ nome: '', cpfCnpj: '', email: '', billingType: 'PIX' });
  const [msg, setMsg] = useState('');

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  useEffect(() => { if (token) carregar(); }, [token]);

  function carregar() {
    if (!token) return;
    fetch(`${API}/billing`, { headers: auth(token) }).then(r => r.json()).then(setInfo);
  }
  async function assinar() {
    if (!token) return;
    const r = await fetch(`${API}/billing/assinar`, { method: 'POST', headers: auth(token), body: JSON.stringify(form) });
    const d = await r.json();
    if (d.link) { setMsg(`Assinatura criada — R$ ${d.valor}`); window.open(d.link, '_blank'); carregar(); }
    else setMsg(JSON.stringify(d));
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;
  const valor = info?.valor_por_projeto_centavos ? (info.valor_por_projeto_centavos / 100).toFixed(2) : '—';
  const status = info?.assinatura?.status ?? 'sem assinatura';
  const ativo = status === 'active' || status === 'CONFIRMED' || status === 'RECEIVED';

  return (
    <Shell title="Assinatura">
      <div className="nl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', maxWidth: 820 }}>
        <div className="nl-card nl-card--pad">
          <div className="eyebrow">Status</div>
          <div className="nl-row" style={{ marginTop: 10 }}>
            <span className={`nl-badge ${ativo ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{status}</span>
          </div>
          <div className="display" style={{ fontSize: '2.6rem', marginTop: 18 }}>
            {info?.projetos_ativos ?? '—'}<span className="faint" style={{ fontSize: '1rem', fontFamily: 'var(--font-body)', fontWeight: 600 }}> projetos ativos</span>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>R$ {valor} por projeto / mês</div>
        </div>

        <div className="nl-card nl-card--pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Assinar / atualizar</div>
          <label className="nl-label">Nome / razão social</label>
          <input className="nl-input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={{ marginBottom: 12 }} />
          <label className="nl-label">CPF / CNPJ</label>
          <input className="nl-input" value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} style={{ marginBottom: 12 }} />
          <label className="nl-label">E-mail</label>
          <input className="nl-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ marginBottom: 12 }} />
          <label className="nl-label">Forma de pagamento</label>
          <select className="nl-select" value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })} style={{ marginBottom: 16 }}>
            <option value="PIX">PIX</option><option value="BOLETO">Boleto</option><option value="CREDIT_CARD">Cartão</option>
          </select>
          <button className="nl-btn nl-btn--accent" style={{ width: '100%' }} onClick={assinar}>Gerar cobrança</button>
          {msg && <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>{msg}</p>}
        </div>
      </div>
    </Shell>
  );
}
