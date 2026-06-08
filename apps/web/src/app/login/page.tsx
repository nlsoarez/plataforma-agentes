'use client';
import { useEffect, useRef, useState } from 'react';

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
      setMsg('Credenciais inválidas.');
    } catch {
      setMsg('Erro de conexão.');
    }
    setCarregando(false);
  }

  return (
    <main className="nl-login">
      <section className="nl-login__brand">
        <LoginWaveCanvas />
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

function LoginWaveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time = 0) => {
      const t = time * 0.001;
      ctx.clearRect(0, 0, width, height);

      const cols = Math.max(26, Math.floor(width / 18));
      const rows = 30;
      const horizon = height * 0.2;
      const span = width * 1.22;

      for (let row = 0; row < rows; row += 1) {
        const depth = row / (rows - 1);
        const perspective = depth * depth;
        const rowY = horizon + perspective * height * 0.78;
        const waveA = Math.sin(t * 1.15 + row * 0.42) * (18 + depth * 26);
        const waveB = Math.sin(t * 0.72 + row * 0.24 + 1.8) * (8 + depth * 18);
        const rowLift = waveA + waveB;
        const rowSpread = span * (0.38 + perspective * 0.76);
        const rowStart = (width - rowSpread) / 2;

        for (let col = 0; col < cols; col += 1) {
          const u = col / (cols - 1);
          const arc = Math.sin((u - 0.5) * Math.PI);
          const sideDip = Math.cos((u - 0.5) * Math.PI * 2) * depth * 22;
          const xWave = Math.sin(t * 0.9 + u * 8 + row * 0.16) * (2 + depth * 7);
          const x = rowStart + u * rowSpread + xWave;
          const y = rowY + rowLift * (0.25 + depth) - arc * (36 + depth * 74) + sideDip;
          const size = 0.65 + depth * 1.65 + Math.sin(t * 2 + col * 0.45 + row * 0.25) * 0.18;
          const alpha = Math.max(0, Math.min(1, 0.08 + depth * 0.78));

          ctx.beginPath();
          ctx.fillStyle = `rgba(${depth > 0.45 ? '45, 255, 207' : '34, 197, 94'}, ${alpha})`;
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!reduceMotion) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    resize();
    draw();

    const observer = new ResizeObserver(() => {
      resize();
      if (reduceMotion) draw();
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas ref={canvasRef} className="nl-login__wave" aria-hidden="true" />;
}
