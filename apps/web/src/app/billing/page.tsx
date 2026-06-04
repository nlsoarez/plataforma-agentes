'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function Billing() {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<any>(null);
  const [form, setForm] = useState({ nome: '', cpfCnpj: '', email: '', billingType: 'PIX' });
  const [msg, setMsg] = useState('');

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  useEffect(() => { setToken(localStorage.getItem('token')); }, []);
  useEffect(() => { if (token) carregar(); }, [token]);

  function carregar() {
    if (!token) return;
    fetch(`${API}/billing`, { headers: auth(token) }).then(r => r.json()).then(setInfo);
  }

  async function assinar() {
    if (!token) return;
    const r = await fetch(`${API}/billing/assinar`, { method: 'POST', headers: auth(token), body: JSON.stringify(form) });
    const d = await r.json();
    if (d.link) { setMsg(`assinatura criada — valor R$ ${d.valor}`); window.open(d.link, '_blank'); carregar(); }
    else setMsg(JSON.stringify(d));
  }

  if (!token) return <main style={{ padding: 40, fontFamily: 'sans-serif' }}>Faça login em <a href="/login">/login</a>.</main>;

  const valor = info?.valor_por_projeto_centavos ? (info.valor_por_projeto_centavos / 100).toFixed(2) : '—';

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24, maxWidth: 480 }}>
      <h1>Assinatura</h1>
      {info && (
        <p>
          Status: <strong>{info.assinatura?.status ?? 'sem assinatura'}</strong><br />
          Projetos ativos: <strong>{info.projetos_ativos}</strong> · R$ {valor}/projeto
        </p>
      )}
      <h3>Assinar / atualizar</h3>
      <input placeholder="nome/razão social" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={{ display: 'block', width: '100%', margin: '6px 0', padding: 8 }} />
      <input placeholder="CPF/CNPJ" value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} style={{ display: 'block', width: '100%', margin: '6px 0', padding: 8 }} />
      <input placeholder="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ display: 'block', width: '100%', margin: '6px 0', padding: 8 }} />
      <select value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })} style={{ display: 'block', width: '100%', margin: '6px 0', padding: 8 }}>
        <option value="PIX">PIX</option>
        <option value="BOLETO">Boleto</option>
        <option value="CREDIT_CARD">Cartão</option>
      </select>
      <button onClick={assinar}>Gerar cobrança</button>
      <p style={{ color: '#666' }}>{msg}</p>
    </main>
  );
}
