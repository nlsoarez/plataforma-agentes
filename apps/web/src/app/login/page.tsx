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
              <FeatureCard icon={<WhatsAppIcon />} title="Atendimento no WhatsApp" description="Conversas e respostas em tempo real." />
              <FeatureCard icon={<BotIcon />} title="Agentes de IA" description="Automação com passagem para humano." />
              <FeatureCard icon={<UserFlowIcon />} title="Funil comercial" description="Leads organizados por etapa." />
              <FeatureCard icon={<ChartIcon />} title="Relatórios e performance" description="Indicadores para acompanhar resultado." />
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
            <p>
              <a href="/politica-de-privacidade">Política de Privacidade</a>
              {' '}•{' '}
              <a href="/termos-de-uso">Termos de Uso</a>
            </p>
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
      <span className="nl-login__feature-copy">
        <b>{title}</b>
        <small>{description}</small>
      </span>
    </div>
  );
}

function IconSvg({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="nl-login__brand-icon">
      <path fill="currentColor" d="M16.02 4C9.4 4 4 9.3 4 15.84c0 2.1.56 4.12 1.62 5.92L4.02 28l6.42-1.58a12.18 12.18 0 0 0 5.58 1.36C22.65 27.78 28 22.48 28 15.9 28 9.32 22.65 4 16.02 4Zm0 21.74c-1.76 0-3.48-.48-4.98-1.38l-.36-.22-3.8.94 1-3.68-.24-.38a9.82 9.82 0 0 1-1.52-5.18c0-5.4 4.44-9.8 9.9-9.8 5.45 0 9.88 4.42 9.88 9.86 0 5.43-4.43 9.84-9.88 9.84Zm5.42-7.36c-.3-.14-1.76-.86-2.03-.96-.27-.1-.47-.14-.67.14-.2.3-.76.96-.94 1.16-.17.2-.34.22-.64.08-.3-.14-1.26-.46-2.4-1.48-.88-.78-1.48-1.74-1.66-2.04-.17-.3-.02-.46.13-.6.14-.13.3-.34.44-.5.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.52-.08-.14-.67-1.6-.92-2.2-.24-.58-.48-.5-.67-.5h-.58c-.2 0-.52.08-.8.38-.27.3-1.04 1-1.04 2.46 0 1.44 1.08 2.84 1.22 3.04.15.2 2.12 3.2 5.14 4.5.72.3 1.28.48 1.72.62.72.22 1.38.18 1.9.12.58-.08 1.76-.72 2-1.4.25-.68.25-1.26.18-1.4-.08-.12-.28-.2-.58-.34Z" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="nl-login__brand-icon">
      <path fill="currentColor" d="M14.8 4h2.4v4.2h-2.4V4Z" />
      <circle cx="16" cy="4.6" r="2.6" fill="currentColor" />
      <path fill="currentColor" d="M7 12.1A4.1 4.1 0 0 1 11.1 8h9.8A4.1 4.1 0 0 1 25 12.1v6.2a7.2 7.2 0 0 1-7.2 7.2h-3.6A7.2 7.2 0 0 1 7 18.3v-6.2Z" />
      <path fill="currentColor" d="M3.5 15a2.6 2.6 0 0 1 2.6-2.6H7v7.8h-.9A2.6 2.6 0 0 1 3.5 17.6V15ZM25 12.4h.9a2.6 2.6 0 0 1 2.6 2.6v2.6a2.6 2.6 0 0 1-2.6 2.6H25v-7.8Z" />
      <circle cx="12.4" cy="15.6" r="1.55" fill="#fff" />
      <circle cx="19.6" cy="15.6" r="1.55" fill="#fff" />
      <path fill="#fff" d="M12.2 19.5h7.6a4.05 4.05 0 0 1-7.6 0Z" />
    </svg>
  );
}

function UserFlowIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="nl-login__brand-icon">
      <circle cx="16" cy="9.2" r="4.7" fill="currentColor" />
      <path fill="currentColor" d="M7.2 25.8c.85-5.1 4.16-8.1 8.8-8.1s7.95 3 8.8 8.1c.16.96-.6 1.8-1.58 1.8H8.78c-.98 0-1.74-.84-1.58-1.8Z" />
      <path fill="#fff" opacity=".75" d="M4.8 15.2a2.7 2.7 0 1 1 5.4 0 2.7 2.7 0 0 1-5.4 0Zm17 0a2.7 2.7 0 1 1 5.4 0 2.7 2.7 0 0 1-5.4 0Z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="nl-login__brand-icon">
      <path fill="currentColor" d="M6 24.4h20.5a1.3 1.3 0 1 1 0 2.6H4.7A1.7 1.7 0 0 1 3 25.3V6.5a1.3 1.3 0 0 1 2.6 0v17.9H6Z" />
      <rect x="8.2" y="15.2" width="4.2" height="7.2" rx="1.2" fill="currentColor" />
      <rect x="14" y="8.6" width="4.2" height="13.8" rx="1.2" fill="currentColor" />
      <rect x="19.8" y="12" width="4.2" height="10.4" rx="1.2" fill="currentColor" />
    </svg>
  );
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
