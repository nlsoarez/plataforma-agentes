import Shell from '../../components/Shell';
import { BRAND } from '../../lib/brand';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const quickStart = [
  {
    title: '1. Conectar WhatsApp',
    text: 'Acesse Conectar WhatsApp, escolha ou crie um projeto, gere o QR Code e conecte pelo menu Aparelhos conectados do WhatsApp.',
    href: '/onboarding',
    action: 'Abrir conexao',
  },
  {
    title: '2. Configurar IA',
    text: 'Cadastre a chave do provedor em IA e Custos. Para Anthropic, use um modelo valido salvo na conta antes de ativar o agente.',
    href: '/ai-settings',
    action: 'Configurar IA',
  },
  {
    title: '3. Criar agente',
    text: 'Escolha o numero vinculado, selecione provider/modelo, revise prompt, horario de funcionamento e se o agente deve ficar ativo ou pausado.',
    href: '/agentes',
    action: 'Abrir agentes',
  },
  {
    title: '4. Conectar Google Calendar',
    text: 'Em Integracoes, conecte a agenda do proprio usuario. A Comunora consulta disponibilidade e cria eventos na agenda autorizada.',
    href: '/integracoes',
    action: 'Conectar agenda',
  },
  {
    title: '5. Ativar lembretes',
    text: 'Em Agenda, configure a mensagem de confirmacao. O cliente responde 1 para confirmar, 2 para remarcar ou 3 para cancelar.',
    href: '/agenda',
    action: 'Configurar agenda',
  },
  {
    title: '6. Ativar reativacao',
    text: 'Em Leads, defina dias de inatividade, limite diario e mensagem para retomar clientes parados sem depender de disparo manual.',
    href: '/leads',
    action: 'Configurar leads',
  },
];

const niches = [
  {
    title: 'Nutricionistas',
    text: 'Triagem de objetivo, restricoes, rotina alimentar, agendamento de consulta, lembrete 24h antes e reativacao de pacientes sem retorno.',
    prompt: 'Colete objetivo, restricoes, disponibilidade e encaminhe para consulta quando houver intencao clara.',
  },
  {
    title: 'Cabeleireiros e saloes',
    text: 'Agendamento por servico, confirmacao de horario, lista de espera, lembrete antes do atendimento e reativacao de clientes antigos.',
    prompt: 'Pergunte servico, profissional desejado, data, horario e confirme disponibilidade antes de fechar.',
  },
  {
    title: 'Advogados',
    text: 'Triagem inicial sem dar parecer juridico, coleta de dados do caso, agendamento de reuniao e organizacao do funil por area.',
    prompt: 'Colete dados objetivos, evite prometer resultado e direcione para reuniao com advogado responsavel.',
  },
  {
    title: 'Corretores de imoveis',
    text: 'Qualificacao por regiao, faixa de preco, tipo de imovel, visitas agendadas, follow-up de leads frios e pipeline comercial.',
    prompt: 'Qualifique interesse, orcamento, regiao, urgencia e agende visita se houver disponibilidade.',
  },
];

const playbooks = [
  {
    title: 'Agente nao respondeu',
    steps: [
      'Veja se a conversa chegou no Inbox.',
      'Confirme se o numero esta open em Conexoes.',
      'Confira se o agente esta ativo e dentro do horario configurado.',
      'Teste a chave de IA em IA e Custos.',
      'Veja eventos recentes em Conexoes WhatsApp.',
    ],
  },
  {
    title: 'Mensagem nao chegou no Inbox',
    steps: [
      'Confira se a instancia Evolution esta conectada.',
      'Clique em Verificar ou Sync em Conexoes.',
      'Confirme se o webhook esperado aponta para a API da Comunora.',
      'Envie uma mensagem nova para o numero conectado.',
      'Se o evento aparecer como normalizados: 0, revise o payload recebido.',
    ],
  },
  {
    title: 'Google Calendar nao conecta',
    steps: [
      'Confirme se o OAuth do Google esta publicado ou se o usuario esta como testador.',
      'Veja se os escopos calendar.events e calendar.events.freebusy estao configurados.',
      'Use a conta Google que sera dona da agenda.',
      'Depois de conectar, crie um agendamento de teste pela Agenda.',
    ],
  },
  {
    title: 'Campanha ou reativacao nao dispara',
    steps: [
      'Confirme se existem leads no projeto e se o telefone esta normalizado.',
      'Confira limite diario e janela de reenvio.',
      'Use Testar agora em Reativacao de Leads.',
      'Evite disparar para base real antes de validar com um numero controlado.',
    ],
  },
];

const policies = [
  'Nao deixe agente ativo sem prompt revisado.',
  'Nao use reativacao em base real sem testar com seu proprio numero.',
  'Nao prometa disponibilidade sem Google Calendar conectado.',
  'Nao use campanhas para spam. Trabalhe com leads que deram consentimento.',
  'Sempre mantenha atendimento humano disponivel para casos sensiveis.',
];

export default function ApiDocsPage() {
  return (
    <Shell title="Ajuda e API">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Ajuda e API</h1>
          <div className="sub">Guia operacional para iniciar, vender e dar suporte sem depender de improviso.</div>
        </div>
        <a className="nl-btn nl-btn--accent" href={`mailto:${BRAND.supportEmail}`}>Falar com suporte</a>
      </div>

      <section className="nl-doc-hero nl-rise">
        <div>
          <span className="eyebrow">Primeiros 15 minutos</span>
          <h2>Configure o minimo viavel antes de colocar cliente real.</h2>
          <p>
            A Comunora so entrega valor quando WhatsApp, IA, agenda e regras do agente estao conectados.
            Pular essa ordem cria falso problema tecnico.
          </p>
        </div>
        <div className="nl-doc-hero__panel">
          <b>Fluxo oficial</b>
          <span>WhatsApp conectado</span>
          <span>IA validada</span>
          <span>Agente ativo</span>
          <span>Agenda conectada</span>
          <span>Lembretes e reativacao ligados</span>
        </div>
      </section>

      <section className="nl-doc-section">
        <div className="nl-doc-section__head">
          <span className="eyebrow">Checklist</span>
          <h2>Passo a passo de implantacao</h2>
        </div>
        <div className="nl-doc-grid">
          {quickStart.map((item) => (
            <article className="nl-doc-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <a href={item.href}>{item.action}</a>
            </article>
          ))}
        </div>
      </section>

      <section className="nl-doc-section">
        <div className="nl-doc-section__head">
          <span className="eyebrow">Segmentos</span>
          <h2>Modelos de uso por profissao</h2>
        </div>
        <div className="nl-doc-grid nl-doc-grid--two">
          {niches.map((item) => (
            <article className="nl-doc-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <pre>{item.prompt}</pre>
            </article>
          ))}
        </div>
      </section>

      <section className="nl-doc-section">
        <div className="nl-doc-section__head">
          <span className="eyebrow">Suporte</span>
          <h2>Diagnostico rapido</h2>
        </div>
        <div className="nl-doc-grid nl-doc-grid--two">
          {playbooks.map((item) => (
            <article className="nl-doc-card" key={item.title}>
              <h3>{item.title}</h3>
              <ol>
                {item.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section className="nl-doc-section">
        <div className="nl-doc-section__head">
          <span className="eyebrow">Operacao segura</span>
          <h2>Regras que evitam problema com cliente</h2>
        </div>
        <div className="nl-doc-rules">
          {policies.map((policy) => <span key={policy}>{policy}</span>)}
        </div>
      </section>

      <section className="nl-card nl-card--pad" style={{ maxWidth: 980 }}>
        <div className="nl-doc-section__head">
          <span className="eyebrow">API publica</span>
          <h2>Endpoints para integracoes externas</h2>
          <p>Use o header <code>x-api-key</code> gerado em Integracoes.</p>
        </div>
        <ApiBlock method="GET" path="/api/v1/leads" />
        <ApiBlock method="PATCH" path="/api/v1/leads/:leadNumber/notes" body={'{ "notes": "Cliente quer retorno amanha" }'} />
        <ApiBlock method="PATCH" path="/api/v1/leads/:leadNumber/properties" body={'{ "prop_name": "plano", "prop_value": "premium" }'} />
        <ApiBlock method="PATCH" path="/api/v1/leads/:leadNumber/kanban" body={'{ "column_id": "uuid-da-coluna" }'} />
        <ApiBlock method="POST" path="/api/v1/leads/:leadNumber/tags" body={'{ "tag": "lead-quente" }'} />
        <ApiBlock method="PATCH" path="/api/v1/leads/:leadNumber/tags/remove" body={'{ "tag": "lead-quente" }'} />
        <ApiBlock method="GET" path="/api/v1/messages/history?leadNumber=5511999999999" />
        <ApiBlock method="POST" path="/api/v1/messages/text" body={'{ "leadNumber": "5511999999999", "text": "Ola!" }'} />
        <ApiBlock method="POST" path="/api/v1/messages/media" body={'{ "leadNumber": "5511999999999", "mediaType": "image", "mediaUrl": "https://..." }'} />
      </section>
    </Shell>
  );
}

function ApiBlock({ method, path, body }: { method: string; path: string; body?: string }) {
  return (
    <div className="nl-api-block">
      <div><span>{method}</span> <code>{BASE}{path}</code></div>
      <pre>{`curl -X ${method} "${BASE}${path}" \\
  -H "x-api-key: SUA_CHAVE"`}{body ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'` : ''}</pre>
    </div>
  );
}
