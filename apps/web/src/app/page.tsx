export default function Home() {
  const cards = [
    { href: '/dashboard', t: 'Dashboard', d: 'Metricas, funil, campanhas e leitura rapida da operacao.' },
    { href: '/sessoes', t: 'Sessoes', d: 'Estado das instancias Evolution conectadas.' },
    { href: '/agentes', t: 'Agentes', d: 'Sessoes conectadas e prompt ativo por projeto.' },
    { href: '/templates', t: 'Templates', d: 'Importe JSON e crie projetos completos.' },
    { href: '/ai-settings', t: 'IA e Custos', d: 'Chave OpenAI do cliente e valores por token.' },
    { href: '/leads', t: 'Leads', d: 'CRM com notas, tags e propriedades.' },
    { href: '/inbox', t: 'Inbox', d: 'Conversas ao vivo com IA e atendimento humano.' },
    { href: '/pipeline', t: 'Pipeline', d: 'Funil visual para acompanhar e mover leads.' },
    { href: '/agenda', t: 'Agenda', d: 'Compromissos criados pelos agentes e sincronizacao externa.' },
    { href: '/knowledge', t: 'Conhecimento', d: 'Base consultada pelos agentes.' },
    { href: '/automacoes', t: 'Automacoes', d: 'Gatilhos e acoes para operar leads.' },
    { href: '/campanhas', t: 'Campanhas', d: 'Disparos segmentados com ritmo controlado.' },
    { href: '/integracoes', t: 'Integracoes', d: 'API keys e webhooks outbound.' },
    { href: '/api-docs', t: 'API Docs', d: 'Endpoints publicos para integrações externas.' },
    { href: '/equipe', t: 'Equipe', d: 'Usuarios, papeis e departamentos.' },
    { href: '/settings', t: 'Marca', d: 'White-label, dominio, logo e tema.' },
    { href: '/onboarding', t: 'Conectar WhatsApp', d: 'Ative uma instancia via QR code.' },
    { href: '/billing', t: 'Assinatura', d: 'Status de cobranca e quantidade de projetos.' },
  ];

  return (
    <main style={{ minHeight: '100vh', padding: '28px', width: '100%', maxWidth: 1240, margin: '0 auto', overflowX: 'hidden' }}>
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Neural Lab</h1>
          <div className="sub">Plataforma white-label para agentes de IA no WhatsApp</div>
        </div>
        <div className="nl-filterbar">
          <a className="nl-pill active" href="/login">Entrar</a>
          <a className="nl-pill" href="/dashboard">Command Center</a>
        </div>
      </div>

      <section className="nl-card nl-card--pad nl-rise" style={{ marginBottom: 14 }}>
        <div className="nl-kpis" style={{ marginBottom: 0 }}>
          <div className="nl-kpi">
            <div className="label">Operacao</div>
            <div className="value">24/7</div>
            <div className="delta">IA + humano</div>
          </div>
          <div className="nl-kpi">
            <div className="label">Canais</div>
            <div className="value">WA</div>
            <div className="delta">Cloud API ou Evolution</div>
          </div>
          <div className="nl-kpi">
            <div className="label">Funil</div>
            <div className="value">CRM</div>
            <div className="delta">Pipeline em tempo real</div>
          </div>
          <div className="nl-kpi">
            <div className="label">Modelo</div>
            <div className="value">BYOK</div>
            <div className="delta">Chave por cliente</div>
          </div>
        </div>
      </section>

      <div className="nl-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))' }}>
        {cards.map((card) => (
          <a key={card.href} href={card.href} className="nl-card nl-card--pad nl-rise" style={{ display: 'block', minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.12rem', marginBottom: 8 }}>{card.t}</div>
            <div className="muted" style={{ fontSize: '0.92rem', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{card.d}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
