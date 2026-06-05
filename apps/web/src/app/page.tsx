export default function Home() {
  const cards = [
    { href: '/inbox', t: 'Inbox', d: 'Conversas ao vivo com IA e atendimento humano.' },
    { href: '/pipeline', t: 'Pipeline', d: 'Funil visual — a IA move os leads sozinha.' },
    { href: '/campanhas', t: 'Campanhas', d: 'Disparos segmentados com proteção anti-ban.' },
    { href: '/billing', t: 'Assinatura', d: 'Cobrança por projeto e status da conta.' },
    { href: '/onboarding', t: 'Conectar WhatsApp', d: 'Ative um número via QR code em minutos.' },
  ];
  return (
    <main style={{ minHeight: '100vh', padding: 'clamp(40px, 8vw, 110px) clamp(24px, 8vw, 120px)' }}>
      <div className="eyebrow" style={{ marginBottom: 18 }}>Neural Lab · Plataforma</div>
      <h1 className="display display-xl" style={{ maxWidth: '16ch' }}>
        Agentes de IA no WhatsApp.
      </h1>
      <p className="muted" style={{ fontSize: '1.15rem', maxWidth: '46ch', marginTop: 22 }}>
        Atendimento, qualificação e fechamento no automático — com a cara da sua agência.
      </p>
      <div style={{ display: 'flex', gap: 12, marginTop: 30 }}>
        <a className="nl-btn nl-btn--accent" href="/login">Entrar</a>
        <a className="nl-btn nl-btn--ghost" href="/pipeline">Ver o painel</a>
      </div>

      <div className="nl-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', marginTop: 70 }}>
        {cards.map((c) => (
          <a key={c.href} href={c.href} className="nl-card nl-card--pad" style={{ display: 'block' }}>
            <div className="display display-md" style={{ fontSize: '1.4rem', marginBottom: 8 }}>{c.t}</div>
            <div className="muted" style={{ fontSize: '0.95rem' }}>{c.d}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
