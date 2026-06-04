'use client';
import { useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function Onboarding() {
  const [token, setToken] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [instancia, setInstancia] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [estado, setEstado] = useState('');
  const timer = useRef<any>(null);

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  useEffect(() => { setToken(localStorage.getItem('token')); }, []);

  async function criar() {
    if (!token || !nome.trim()) return;
    const r = await fetch(`${API}/onboarding/instancia`, { method: 'POST', headers: auth(token), body: JSON.stringify({ nome }) });
    const d = await r.json();
    setInstancia(d.instancia); setQr(d.qr); setEstado('aguardando leitura do QR');
    iniciarPolling(d.instancia);
  }

  function iniciarPolling(inst: string) {
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      if (!token) return;
      const s = await (await fetch(`${API}/onboarding/instancia/${inst}/status`, { headers: auth(token) })).json();
      setEstado(s.state);
      if (s.state === 'open') { clearInterval(timer.current); setQr(null); }
      else {
        const q = await (await fetch(`${API}/onboarding/instancia/${inst}/qr`, { headers: auth(token) })).json();
        if (q.qr) setQr(q.qr);
      }
    }, 4000);
  }
  useEffect(() => () => clearInterval(timer.current), []);

  if (!token) return <main style={{ padding: 40, fontFamily: 'sans-serif' }}>Faça login em <a href="/login">/login</a>.</main>;

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 40, maxWidth: 480 }}>
      <h1>Conectar WhatsApp</h1>
      <p>Crie a instância e escaneie o QR com o WhatsApp do cliente (Aparelhos conectados).</p>
      {!instancia && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="nome (ex: clinica-x)" value={nome} onChange={(e) => setNome(e.target.value)} style={{ flex: 1, padding: 8 }} />
          <button onClick={criar}>Criar e gerar QR</button>
        </div>
      )}
      {estado && <p>Status: <strong>{estado}</strong></p>}
      {qr && <img alt="QR code" src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`} style={{ width: 280, height: 280 }} />}
      {estado === 'open' && <p style={{ color: 'green' }}>Conectado! O número está ativo.</p>}
    </main>
  );
}
