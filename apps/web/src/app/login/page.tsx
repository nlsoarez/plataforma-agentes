'use client';
import { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState('');

  async function entrar() {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // dominio = host atual (white-label). Em dev, ex: localhost:3001
      body: JSON.stringify({ dominio: window.location.host, email, senha }),
    });
    const d = await r.json();
    if (d.token) { localStorage.setItem('token', d.token); setMsg('logado'); }
    else setMsg(JSON.stringify(d));
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 40, maxWidth: 360 }}>
      <h1>Entrar</h1>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: 'block', margin: '8px 0', width: '100%' }} />
      <input placeholder="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} style={{ display: 'block', margin: '8px 0', width: '100%' }} />
      <button onClick={entrar}>Entrar</button>
      <p>{msg}</p>
    </main>
  );
}
