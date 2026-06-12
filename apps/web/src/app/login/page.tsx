'use client';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BRAND } from '../../lib/brand';
import { useTenantBranding } from '../../lib/useTenantBranding';

const API = BRAND.apiUrl;

export default function Login() {
  const [modo, setModo] = useState<'login' | 'cadastro' | 'recuperar' | 'reset'>('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [googleCarregando, setGoogleCarregando] = useState(false);
  const [lembrarEmail, setLembrarEmail] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const branding = useTenantBranding();

  useEffect(() => {
    const savedEmail = window.localStorage.getItem('comunora:login-email');
    if (savedEmail) {
      setEmail(savedEmail);
      setLembrarEmail(true);
    }

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('token');
    if (token) {
      localStorage.setItem('token', token);
      window.history.replaceState(null, '', '/login');
      redirectAfterAuth(token);
      return;
    }

    const erroGoogle = new URLSearchParams(window.location.search).get('google_error');
    const tokenReset = new URLSearchParams(window.location.search).get('reset_token');
    const tokenVerify = new URLSearchParams(window.location.search).get('verify_token');
    if (tokenReset) {
      setResetToken(tokenReset);
      setModo('reset');
      window.history.replaceState(null, '', '/login');
      return;
    }
    if (tokenVerify) {
      verificarEmail(tokenVerify);
      window.history.replaceState(null, '', '/login');
      return;
    }
    if (erroGoogle) {
      setMsg(`Falha no login com Google: ${erroGoogle}`);
      window.history.replaceState(null, '', '/login');
    }
  }, []);

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
        if (lembrarEmail) {
          localStorage.setItem('comunora:login-email', email.trim());
        } else {
          localStorage.removeItem('comunora:login-email');
        }
        localStorage.setItem('token', d.token);
        await redirectAfterAuth(d.token);
        return;
      }
      setMsg('Credenciais inválidas.');
    } catch {
      setMsg('Erro de conexão.');
    }
    setCarregando(false);
  }

  async function cadastrar() {
    if (senha.length < 8) {
      setMsg('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirmarSenha) {
      setMsg('As senhas não conferem.');
      return;
    }

    setCarregando(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dominio: window.location.host, nome, email, senha, origem: window.location.origin }),
      });
      const d = await r.json();
      if (d.token) {
        localStorage.setItem('token', d.token);
        await redirectAfterAuth(d.token);
        return;
      }
      setMsg(d.message || 'Não foi possível criar a conta.');
    } catch {
      setMsg('Erro ao criar conta.');
    }
    setCarregando(false);
  }

  async function entrarGoogle() {
    setGoogleCarregando(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/auth/google/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dominio: window.location.host, origem: window.location.origin }),
      });
      const d = await r.json();
      if (d.url) {
        window.location.href = d.url;
        return;
      }
      setMsg(d.message || 'Google não configurado.');
    } catch {
      setMsg('Erro ao iniciar login com Google.');
    }
    setGoogleCarregando(false);
  }

  async function recuperarSenha() {
    if (!email.trim()) {
      setMsg('Informe seu e-mail.');
      return;
    }
    setCarregando(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/auth/password/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dominio: window.location.host, email, origem: window.location.origin }),
      });
      const d = await r.json();
      setMsg(d.url ? `Link de teste: ${d.url}` : 'Se o e-mail existir, enviaremos o link de redefinição.');
    } catch {
      setMsg('Erro ao solicitar redefinição.');
    }
    setCarregando(false);
  }

  async function redefinirSenha() {
    if (senha.length < 8) {
      setMsg('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirmarSenha) {
      setMsg('As senhas não conferem.');
      return;
    }
    setCarregando(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/auth/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dominio: window.location.host, token: resetToken, senha }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) {
        setMsg(d.message || 'Token inválido ou expirado.');
      } else {
        setMsg('Senha redefinida. Entre com a nova senha.');
        setModo('login');
        setSenha('');
        setConfirmarSenha('');
      }
    } catch {
      setMsg('Erro ao redefinir senha.');
    }
    setCarregando(false);
  }

  async function verificarEmail(token: string) {
    setMsg('');
    try {
      const r = await fetch(`${API}/auth/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dominio: window.location.host, token }),
      });
      const d = await r.json();
      setMsg(r.ok && d.ok !== false ? 'E-mail verificado. Entre para continuar.' : d.message || 'Token de verificação inválido.');
    } catch {
      setMsg('Erro ao verificar e-mail.');
    }
  }

  async function redirectAfterAuth(token: string) {
    try {
      const r = await fetch(`${API}/billing`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      window.location.href = d.pago ? '/dashboard' : '/billing';
    } catch {
      window.location.href = '/billing';
    }
  }

  const action = modo === 'login'
    ? entrar
    : modo === 'cadastro'
      ? cadastrar
      : modo === 'reset'
        ? redefinirSenha
        : recuperarSenha;

  return (
    <main className="nl-login nl-login--comunora" style={{ ['--accent' as any]: branding.primaryColor || '#1565FF' }}>
      <section className="nl-login__brand">
        <LoginWaveCanvas />
        <div className="nl-login__brand-inner">
          <a href="/" className="nl-login__logo" aria-label={`${branding.name || BRAND.name} - página inicial`}>
            <img src={branding.logoUrl || BRAND.logoLight} alt={branding.name || BRAND.name} />
          </a>

          <div className="nl-login__hero">
            <h2>
              Comunicação inteligente.
              <em>Resultados reais.</em>
            </h2>
            <p>Agentes de IA, atendimento humano, CRM e automações em uma operação integrada.</p>
            <div className="nl-login__features" aria-label="Recursos da plataforma">
              <FeatureCard icon={<WhatsAppIcon />} title="Atendimento" description="no WhatsApp" />
              <FeatureCard icon={<BotIcon />} title="Agentes" description="de IA" />
              <FeatureCard icon={<UserFlowIcon />} title="Funil" description="comercial" />
              <FeatureCard icon={<ChartIcon />} title="Relatórios e" description="performance" />
            </div>
          </div>

          <p className="nl-login__footer-brand">
            Plataforma white-label <span>•</span> <strong>{branding.name || BRAND.name}</strong>
          </p>
        </div>
      </section>

      <section className="nl-login__form">
        <div className="nl-login__orb nl-login__orb--top" aria-hidden="true" />
        <div className="nl-login__orb nl-login__orb--bottom" aria-hidden="true" />
        <div className="nl-login__form-wrap">
          <img className="nl-login__mobile-logo" src={BRAND.logoDark} alt={BRAND.name} />
          <div className="nl-login__card">
            <header>
              <h1>{modo === 'login' ? 'Entrar' : modo === 'cadastro' ? 'Criar conta' : modo === 'reset' ? 'Nova senha' : 'Recuperar senha'}</h1>
              <p>{modo === 'login' ? 'Acesse sua conta para continuar.' : 'Informe seus dados para continuar.'}</p>
            </header>

            {modo === 'cadastro' && (
              <div className="nl-login__field">
                <label className="nl-label">Nome</label>
                <div className="nl-login__input-wrap">
                  <UserIcon />
                  <input className="nl-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
                </div>
              </div>
            )}

            <div className="nl-login__field">
              <label className="nl-label">E-mail</label>
              <div className="nl-login__input-wrap">
                <MailIcon />
                <input className="nl-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
              </div>
            </div>

            {modo !== 'recuperar' && (
              <div className="nl-login__field">
                <div className="nl-login__label-row">
                  <label className="nl-label">Senha</label>
                  {modo === 'login' && (
                    <button type="button" onClick={() => { setModo('recuperar'); setMsg(''); }}>
                      Esqueceu sua senha?
                    </button>
                  )}
                </div>
                <div className="nl-login__input-wrap">
                  <LockIcon />
                  <input
                    className="nl-input"
                    type={mostrarSenha ? 'text' : 'password'}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && action()}
                    placeholder="Sua senha"
                  />
                  <button
                    type="button"
                    className="nl-login__eye"
                    aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setMostrarSenha((current) => !current)}
                  >
                    <EyeIcon />
                  </button>
                </div>
              </div>
            )}

            {(modo === 'cadastro' || modo === 'reset') && (
              <div className="nl-login__field">
                <label className="nl-label">Confirmar senha</label>
                <div className="nl-login__input-wrap">
                  <LockIcon />
                  <input
                    className="nl-input"
                    type={mostrarSenha ? 'text' : 'password'}
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && action()}
                    placeholder="Confirme sua senha"
                  />
                </div>
              </div>
            )}

            {modo === 'login' && (
              <label className="nl-login__remember">
                <input type="checkbox" checked={lembrarEmail} onChange={(e) => setLembrarEmail(e.target.checked)} />
                <span>Lembrar meu e-mail</span>
              </label>
            )}

            <button className="nl-btn nl-btn--accent nl-login__primary" onClick={action} disabled={carregando}>
              {carregando
                ? 'Aguarde...'
                : modo === 'login' ? 'Entrar' : modo === 'cadastro' ? 'Criar conta' : modo === 'reset' ? 'Redefinir senha' : 'Enviar link'}
            </button>

            {modo !== 'reset' && (
              <>
                <div className="nl-login__divider"><span>ou</span></div>
                <button className="nl-btn nl-login__google" onClick={entrarGoogle} disabled={googleCarregando || carregando}>
                  <GoogleIcon />
                  {googleCarregando ? 'Abrindo Google...' : 'Entrar com Google'}
                </button>
              </>
            )}

            <p className="nl-login__account">
              {modo === 'login' ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'}
              <button
                type="button"
                onClick={() => {
                  setModo(modo === 'login' ? 'cadastro' : 'login');
                  setMsg('');
                  setSenha('');
                  setConfirmarSenha('');
                }}
              >
                {modo === 'login' ? 'Criar conta' : 'Entrar'}
              </button>
            </p>

            {msg && <p className="nl-login__message">{msg}</p>}
          </div>

          <footer className="nl-login__support">
            <p><HeadsetIcon /> Precisa de ajuda? <a href={`mailto:${branding.supportEmail}`}>Fale com o suporte</a></p>
            <p>© {new Date().getFullYear()} <strong>{branding.name || BRAND.name}</strong>. Todos os direitos reservados.</p>
          </footer>
        </div>
      </section>
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="nl-login__feature-card">
      <i>{icon}</i>
      <b>{title}<span>{description}</span></b>
    </div>
  );
}

function IconSvg({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

function WhatsAppIcon() {
  return <IconSvg><path d="M5.4 18.6 6.2 15A7.2 7.2 0 1 1 9 17.8l-3.6.8Z" /><path d="M9.2 8.7c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.5c.1.3 0 .5-.2.7l-.4.5c.7 1.2 1.7 2.1 3 2.7l.5-.6c.2-.2.4-.3.7-.2l1.6.7c.3.1.4.3.4.6v.4c0 .4-.2.7-.5.9-.5.3-1.3.5-2.3.2-2.7-.8-5-3-5.8-5.7-.3-.9-.1-1.6.1-2.1Z" /></IconSvg>;
}

function BotIcon() {
  return <IconSvg><rect x="5" y="8" width="14" height="10" rx="3" /><path d="M12 5v3" /><path d="M9 12h.01" /><path d="M15 12h.01" /><path d="M9.5 15h5" /></IconSvg>;
}

function UserFlowIcon() {
  return <IconSvg><circle cx="12" cy="7" r="3" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></IconSvg>;
}

function ChartIcon() {
  return <IconSvg><path d="M5 19V9" /><path d="M11 19V5" /><path d="M17 19v-7" /><path d="M4 19h16" /></IconSvg>;
}

function MailIcon() {
  return <IconSvg><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></IconSvg>;
}

function LockIcon() {
  return <IconSvg><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></IconSvg>;
}

function UserIcon() {
  return <IconSvg><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></IconSvg>;
}

function EyeIcon() {
  return <IconSvg><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></IconSvg>;
}

function HeadsetIcon() {
  return <IconSvg><path d="M4 13a8 8 0 0 1 16 0" /><path d="M4 13v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2Z" /><path d="M20 13v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z" /><path d="M16 21h-4" /></IconSvg>;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.2c1.9-1.8 3-4.3 3-7.5Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.8A6 6 0 0 1 6.1 12c0-.6.1-1.3.3-1.8V7.5H3.1A10 10 0 0 0 2 12c0 1.6.4 3.1 1.1 4.5l3.3-2.7Z" />
      <path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.5l3.3 2.7C7.2 7.8 9.4 6.1 12 6.1Z" />
    </svg>
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
          ctx.fillStyle = `rgba(${depth > 0.45 ? '0, 198, 169' : '126, 217, 87'}, ${alpha})`;
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
