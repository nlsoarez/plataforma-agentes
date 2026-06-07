'use client';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setCarregando(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dominio: window.location.host, email, senha }),
      });
      const d = await r.json();
      if (d.token) {
        localStorage.setItem('token', d.token);
        window.location.href = '/dashboard';
        return;
      }
      setMsg('Credenciais invalidas.');
    } catch {
      setMsg('Erro de conexão.');
    }
    setCarregando(false);
  }

  return (
    <main className="nl-login">
      <section className="nl-login__brand">
        <div className="nl-brand" style={{ position: 'relative', zIndex: 1, padding: 0 }}>
          <img src="/brand/attende-logo-horizontal-light.svg" alt="Attende" style={{ height: 72, width: 'auto' }} />
        </div>
        <div className="nl-login__hero">
          <h2>Atendimento<br /><em>Inteligente.</em></h2>
          <p>Agentes de IA no WhatsApp, atendimento humano e funil comercial em uma operação única.</p>
        </div>
        <div style={{ position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.42)', fontSize: '0.82rem' }}>
          Plataforma white-label — Attende
        </div>
      </section>

      <section className="nl-login__form">
        <div className="inner">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Acesso</div>
          <h1 className="display display-md" style={{ marginBottom: 26 }}>Entrar</h1>

          <label className="nl-label">E-mail</label>
          <input
            className="nl-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@agencia.com"
            style={{ marginBottom: 16 }}
          />

          <label className="nl-label">Senha</label>
          <input
            className="nl-input"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && entrar()}
            placeholder="********"
            style={{ marginBottom: 22 }}
          />

          <button className="nl-btn nl-btn--accent" style={{ width: '100%' }} onClick={entrar} disabled={carregando}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
          {msg && <p style={{ color: '#c0392b', fontSize: '0.88rem', marginTop: 14 }}>{msg}</p>}
        </div>
      </section>
    </main>
  );
}
