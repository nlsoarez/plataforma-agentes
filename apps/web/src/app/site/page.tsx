import { BRAND } from '../../lib/brand';

const modules = [
  ['WhatsApp conectado', 'Evolution API para sessões, QR code, inbox e respostas em tempo real.'],
  ['Agentes de IA', 'Atendimento automatizado com modelos BYOK, prompts por projeto e passagem para humano.'],
  ['CRM e pipeline', 'Leads, etapas, responsáveis, histórico de conversas e oportunidades organizadas.'],
  ['Automações e campanhas', 'Gatilhos, mensagens segmentadas, cadência e operação comercial em uma só plataforma.'],
];

export default function SitePage() {
  return (
    <main className="nl-site">
      <header className="nl-site__nav">
        <a href="/" aria-label={`${BRAND.name} - início`}>
          <img src={BRAND.logoDark} alt={BRAND.name} />
        </a>
        <nav>
          <a href="#plataforma">Plataforma</a>
          <a href="#operacao">Operação</a>
          <a href={`mailto:${BRAND.supportEmail}`}>Contato</a>
          <a className="nl-site__nav-cta" href={BRAND.appUrl}>Entrar</a>
        </nav>
      </header>

      <section className="nl-site__hero">
        <div>
          <h1>Comunicação inteligente. Resultados reais.</h1>
          <p>{BRAND.institutionalDescription}</p>
          <div className="nl-site__actions">
            <a className="nl-btn nl-btn--accent" href={BRAND.appUrl}>Acessar plataforma</a>
            <a className="nl-btn nl-btn--ghost" href={`mailto:${BRAND.supportEmail}`}>Falar com suporte</a>
          </div>
        </div>
        <aside aria-label="Resumo da operação Comunora">
          <div className="nl-site__signal">
            <span>WhatsApp</span>
            <strong>IA + humano</strong>
          </div>
          <div className="nl-site__metric">
            <span>Inbox</span>
            <b>Conversas, leads e funil em uma operação integrada</b>
          </div>
          <div className="nl-site__wave" />
        </aside>
      </section>

      <section id="plataforma" className="nl-site__modules">
        <div className="nl-site__section-head">
          <h2>Uma base única para atendimento e vendas</h2>
          <p>Sem trocar de ferramenta para cada etapa da conversa.</p>
        </div>
        <div className="nl-site__module-grid">
          {modules.map(([title, description]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="operacao" className="nl-site__band">
        <h2>Projetada para operação real, não para demonstração bonita.</h2>
        <p>
          A Comunora combina automação, controle humano, cobrança, integrações e white-label para empresas que precisam
          vender e atender pelo WhatsApp com organização.
        </p>
      </section>
    </main>
  );
}
