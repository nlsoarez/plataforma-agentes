'use client';

import { useEffect, useMemo, useState } from 'react';

type TourStep = {
  title: string;
  what: string;
  how: string;
  why: string;
};

type TourConfig = {
  section: string;
  steps: TourStep[];
};

const TOUR_VERSION = 'v1';

const DEFAULT_TOUR: TourConfig = {
  section: 'Comunora',
  steps: [
    {
      title: 'Navegue pela operacao',
      what: 'Use o menu lateral para acessar cada area da plataforma.',
      how: 'Clique em uma aba para abrir o modulo correspondente. O item em azul mostra onde voce esta.',
      why: 'Isso mantem atendimento, CRM, automacoes e cobranca separados sem perder o fluxo da operacao.',
    },
    {
      title: 'Revise o tutorial quando quiser',
      what: 'O tutorial aparece automaticamente na primeira visita de cada aba.',
      how: 'Depois disso, use o botao Tutorial no rodape da sidebar para abrir novamente.',
      why: 'Assim a ajuda nao fica interrompendo seu trabalho depois que voce ja entendeu a tela.',
    },
  ],
};

const TOURS: Record<string, TourConfig> = {
  '/dashboard': {
    section: 'Dashboard',
    steps: [
      {
        title: 'Resumo da operacao',
        what: 'O Dashboard concentra os indicadores reais da sua operacao.',
        how: 'Acompanhe conversas, leads, fechamento, receita estimada, funil e desempenho por periodo.',
        why: 'Ele existe para mostrar rapidamente se o atendimento esta gerando demanda, organizacao e resultado.',
      },
      {
        title: 'Próximos passos',
        what: 'Esta area mostra o que ainda precisa ser configurado.',
        how: 'Conecte o WhatsApp, configure a chave de IA, ative o agente e acompanhe a primeira conversa.',
        why: 'Sem esses passos, a plataforma pode abrir normalmente, mas nao automatiza o atendimento de ponta a ponta.',
      },
      {
        title: 'Graficos e funil',
        what: 'Os graficos ajudam a enxergar volume, origem e conversao.',
        how: 'Use os filtros de periodo e compare os paineis para entender onde a operacao esta travando.',
        why: 'A decisao fica melhor quando voce ve gargalos por etapa, nao apenas mensagens soltas no Inbox.',
      },
    ],
  },
  '/sessoes': {
    section: 'Conexoes WhatsApp',
    steps: [
      {
        title: 'Instancias Evolution',
        what: 'Esta tela lista os numeros WhatsApp conectados pela Evolution API.',
        how: 'Confira instancia, status, conexao e ultima atualizacao. Use Sync para atualizar o estado da instancia.',
        why: 'O agente so recebe e envia mensagens se a instancia estiver ativa e com webhook funcionando.',
      },
      {
        title: 'Diagnostico do fluxo',
        what: 'Os indicadores no topo mostram se URL, API key, webhook e Redis estao configurados.',
        how: 'Quando algo falhar, revise o item indicado antes de testar mensagens no WhatsApp.',
        why: 'Isso reduz tentativa e erro: problemas de webhook ou fila impedem mensagens de chegar ao Inbox.',
      },
      {
        title: 'Eventos recentes',
        what: 'Eventos mostram o que a plataforma recebeu ou tentou processar.',
        how: 'Leia os avisos e erros depois de conectar, sincronizar ou enviar uma mensagem de teste.',
        why: 'Eles sao o primeiro lugar para descobrir se o erro esta na Evolution, no agente ou na configuracao do projeto.',
      },
    ],
  },
  '/agentes': {
    section: 'Agentes',
    steps: [
      {
        title: 'Projeto ativo',
        what: 'Cada projeto pode ter um agente configurado para responder pelo WhatsApp conectado.',
        how: 'Selecione o projeto na coluna da esquerda e ajuste provider, modelo e prompt do sistema.',
        why: 'Isso evita que um numero use prompt, chave ou comportamento de outro cliente ou operacao.',
      },
      {
        title: 'Prompt do sistema',
        what: 'O prompt define o comportamento, tom e limites do agente.',
        how: 'Escreva instrucoes objetivas: idioma, papel, regras de atendimento, quando transferir para humano e o que nunca prometer.',
        why: 'Um prompt ruim gera respostas longas, vagas ou perigosas. O prompt e o manual operacional do agente.',
      },
      {
        title: 'Salvar e testar',
        what: 'O worker usa somente agente com status ativo.',
        how: 'Salve o agente, envie uma mensagem pelo WhatsApp e acompanhe o Inbox e os eventos.',
        why: 'Isso confirma o fluxo completo: webhook recebido, conversa criada, IA chamada e resposta enviada.',
      },
    ],
  },
  '/templates': {
    section: 'Templates',
    steps: [
      {
        title: 'Modelos de configuracao',
        what: 'Templates aceleram a criacao de projetos com estruturas reutilizaveis.',
        how: 'Importe ou edite JSON com configuracoes padrao e aplique ao projeto certo.',
        why: 'Isso padroniza operacoes repetidas sem recriar tudo manualmente a cada cliente.',
      },
      {
        title: 'Edicao com cuidado',
        what: 'O JSON precisa estar valido para ser salvo e aplicado.',
        how: 'Altere campos pequenos, valide a estrutura e salve antes de aplicar.',
        why: 'Um template malformado pode impedir importacao ou criar uma operacao incompleta.',
      },
    ],
  },
  '/ai-settings': {
    section: 'IA e Custos',
    steps: [
      {
        title: 'Chaves BYOK',
        what: 'Aqui voce cadastra chaves de IA por provider, como OpenAI ou Anthropic.',
        how: 'Escolha o provider, informe a chave, defina modelo padrao e teste antes de salvar.',
        why: 'A chave correta garante que cada cliente use seu proprio saldo e controle seus custos.',
      },
      {
        title: 'Custos por token',
        what: 'Os campos de custo ajudam a estimar gasto de entrada, saida e embeddings.',
        how: 'Preencha os valores por 1M tokens conforme a tabela do provider utilizado.',
        why: 'Sem custo configurado, a operacao funciona, mas o financeiro perde previsibilidade.',
      },
    ],
  },
  '/leads': {
    section: 'Leads',
    steps: [
      {
        title: 'Base de contatos',
        what: 'Leads sao pessoas ou empresas que entram no seu funil comercial.',
        how: 'Use filtros, tags, notas e propriedades para organizar contatos vindos do WhatsApp ou cadastrados manualmente.',
        why: 'Atendimento sem CRM vira historico solto; leads organizados viram oportunidade acompanhavel.',
      },
      {
        title: 'Dados reais',
        what: 'A lista deve refletir contatos reais da sua operacao.',
        how: 'Conecte WhatsApp, receba mensagens e complete dados importantes conforme a conversa evolui.',
        why: 'Isso prepara o lead para pipeline, campanhas e atendimento humano com contexto.',
      },
    ],
  },
  '/inbox': {
    section: 'Inbox',
    steps: [
      {
        title: 'Conversas em tempo real',
        what: 'O Inbox centraliza mensagens recebidas e enviadas pelo WhatsApp.',
        how: 'Selecione um contato na lista, leia o historico e acompanhe mensagens da IA ou de humanos.',
        why: 'Ele e a mesa de atendimento: tudo que acontece com o cliente precisa aparecer aqui.',
      },
      {
        title: 'Assumir conversa',
        what: 'O atendimento humano pode assumir quando a IA nao deve continuar sozinha.',
        how: 'Clique em Assumir conversa e responda pelo campo inferior.',
        why: 'Isso protege casos sensiveis, clientes irritados ou situacoes comerciais que precisam de uma pessoa.',
      },
    ],
  },
  '/pipeline': {
    section: 'Pipeline',
    steps: [
      {
        title: 'Funil comercial',
        what: 'O Pipeline mostra leads por etapa da venda ou atendimento.',
        how: 'Mova cards entre colunas conforme o lead avanca: novo, qualificado, agendado, fechado ou etapas personalizadas.',
        why: 'Isso transforma conversas em gestao comercial, com previsibilidade e prioridade clara.',
      },
      {
        title: 'Responsabilidade',
        what: 'Cada card deve ter contexto suficiente para a equipe agir.',
        how: 'Revise nome, ultima mensagem, responsavel, valor e observacoes quando disponiveis.',
        why: 'Um funil sem contexto vira apenas uma lista bonita. O objetivo e decisao rapida.',
      },
    ],
  },
  '/agenda': {
    section: 'Agenda',
    steps: [
      {
        title: 'Agendamentos',
        what: 'A Agenda exibe compromissos criados manualmente ou pela automacao.',
        how: 'Conecte Google Calendar nas integracoes e acompanhe eventos relacionados aos leads.',
        why: 'Isso evita perda de reunioes e permite que o agente ajude no agendamento com contexto.',
      },
      {
        title: 'Calendario por cliente',
        what: 'Cada usuario deve conectar a propria agenda.',
        how: 'A conexao OAuth autoriza a Comunora a criar eventos na conta escolhida.',
        why: 'Assim cada cliente usa sua agenda, nao uma agenda global da plataforma.',
      },
    ],
  },
  '/knowledge': {
    section: 'Conhecimento',
    steps: [
      {
        title: 'Base de conhecimento',
        what: 'Esta area guarda informacoes que o agente pode consultar para responder melhor.',
        how: 'Adicione materiais confiaveis, revise chunks e mantenha conteudo atualizado.',
        why: 'A IA responde melhor quando tem fonte da sua operacao, nao apenas conhecimento generico.',
      },
      {
        title: 'Qualidade da fonte',
        what: 'Conteudo ruim gera resposta ruim.',
        how: 'Prefira documentos objetivos com precos, politicas, horarios, servicos, restricoes e perguntas frequentes.',
        why: 'Isso reduz alucinacao e deixa o atendimento mais consistente.',
      },
    ],
  },
  '/automacoes': {
    section: 'Automacoes',
    steps: [
      {
        title: 'Gatilhos e acoes',
        what: 'Automacoes executam tarefas quando algo acontece na operacao.',
        how: 'Defina gatilho, filtros e acoes. Ative somente depois de revisar o comportamento esperado.',
        why: 'Automacao boa economiza tempo; automacao mal configurada cria mensagens erradas em escala.',
      },
      {
        title: 'Teste antes de escalar',
        what: 'Toda automacao deve ser validada com um caso pequeno.',
        how: 'Use um contato de teste e acompanhe Inbox, eventos e logs antes de usar em campanhas reais.',
        why: 'Isso evita disparos indevidos e protege a reputacao do numero WhatsApp.',
      },
    ],
  },
  '/campanhas': {
    section: 'Campanhas',
    steps: [
      {
        title: 'Disparos segmentados',
        what: 'Campanhas enviam mensagens para listas ou segmentos de leads.',
        how: 'Escolha publico, mensagem, canal e revise antes de enviar.',
        why: 'Segmentacao correta melhora resposta e evita incomodar contatos fora do contexto.',
      },
      {
        title: 'Metricas',
        what: 'Acompanhe enviados, lidos, respostas e falhas.',
        how: 'Depois do envio, monitore entrega e conversas abertas no Inbox.',
        why: 'Campanha sem acompanhamento vira spam. O resultado esta nas respostas e oportunidades geradas.',
      },
    ],
  },
  '/integracoes': {
    section: 'Integracoes',
    steps: [
      {
        title: 'Servicos conectados',
        what: 'Integracoes ligam a Comunora a Google Calendar, webhooks, APIs e outros servicos.',
        how: 'Conecte cada servico com a conta correta e confira se os callbacks usam o dominio atual.',
        why: 'Integrações quebradas afetam agenda, cobrança, automações e dados externos.',
      },
      {
        title: 'Tokens e seguranca',
        what: 'Credenciais liberam acesso a sistemas externos.',
        how: 'Use chaves oficiais, nao compartilhe tokens e substitua credenciais quando houver suspeita de vazamento.',
        why: 'Um token exposto pode permitir acesso indevido a dados e operacoes de clientes.',
      },
    ],
  },
  '/api-docs': {
    section: 'API Docs',
    steps: [
      {
        title: 'Documentacao da API',
        what: 'Esta tela mostra endpoints para integrar sistemas externos.',
        how: 'Leia metodo, rota, payload e headers antes de chamar a API.',
        why: 'Integracao correta evita dados duplicados, mensagens fora de ordem e falhas silenciosas.',
      },
      {
        title: 'Autenticacao',
        what: 'Chamadas publicas exigem credenciais validas.',
        how: 'Use a chave gerada no painel e envie no header esperado.',
        why: 'Isso protege a API contra uso indevido e separa dados por cliente.',
      },
    ],
  },
  '/configuracoes': {
    section: 'Configurações',
    steps: [
      {
        title: 'Perfil do usuário',
        what: 'Esta tela guarda seus dados pessoais dentro da plataforma.',
        how: 'Atualize nome, telefone, cargo, idioma e envie uma foto do seu computador quando quiser trocar o avatar.',
        why: 'Esses dados ajudam a identificar quem está operando a conta e preparar recursos futuros de notificação e auditoria.',
      },
      {
        title: 'Segurança da conta',
        what: 'Você pode trocar sua senha de acesso.',
        how: 'Contas com senha pedem a senha atual. Contas criadas pelo Google podem adicionar uma senha local.',
        why: 'Isso reduz dependência de um único método de login e melhora o controle de acesso.',
      },
      {
        title: 'Assinatura e preferências',
        what: 'A tela mostra status da assinatura e preferências básicas da sua conta.',
        how: 'Revise o plano, acesse a página de assinatura e ajuste notificações por e-mail.',
        why: 'Configuração de usuário deve ser separada da Marca, que controla o white-label da empresa.',
      },
    ],
  },
  '/equipe': {
    section: 'Equipe',
    steps: [
      {
        title: 'Usuarios e acesso',
        what: 'Equipe controla quem pode operar a conta.',
        how: 'Convide usuarios, revise papeis e remova acessos que nao devem continuar.',
        why: 'Permissão correta evita que pessoas erradas alterem agentes, cobranças ou dados de clientes.',
      },
      {
        title: 'Atendimento humano',
        what: 'Membros da equipe podem assumir conversas no Inbox.',
        how: 'Defina quem atende, quem administra e quem apenas acompanha indicadores.',
        why: 'Isso separa operacao diaria de configuracoes sensiveis.',
      },
    ],
  },
  '/settings': {
    section: 'Marca',
    steps: [
      {
        title: 'White-label',
        what: 'Marca permite ajustar identidade visual da plataforma para o tenant.',
        how: 'Configure nome, logo, cores, favicon, dominio e CSS com cuidado.',
        why: 'Clientes podem operar com identidade propria sem quebrar o padrao Comunora.',
      },
      {
        title: 'Dominio e assets',
        what: 'Logo e dominio precisam estar consistentes.',
        how: 'Use imagens leves, com boa resolucao, e confira DNS antes de divulgar o link.',
        why: 'Uma marca mal configurada passa inseguranca e pode quebrar OAuth, callbacks e links.',
      },
    ],
  },
  '/billing': {
    section: 'Assinatura',
    steps: [
      {
        title: 'Status de pagamento',
        what: 'Assinatura controla acesso ao Dashboard e aos modulos pagos.',
        how: 'Escolha plano, forma de pagamento e acompanhe se o pagamento foi confirmado.',
        why: 'A plataforma precisa liberar recursos somente para contas com acesso valido.',
      },
      {
        title: 'Dados de cobranca',
        what: 'CPF/CNPJ, nome e metodo precisam estar corretos.',
        how: 'Revise antes de gerar cobranca por PIX, cartao ou boleto.',
        why: 'Dados errados geram falha de pagamento ou problemas financeiros depois.',
      },
    ],
  },
  '/onboarding': {
    section: 'Conectar WhatsApp',
    steps: [
      {
        title: 'Criar instancia',
        what: 'O onboarding cria ou conecta a instancia WhatsApp pela Evolution API.',
        how: 'Informe os dados necessarios, gere o QR Code e escaneie com o aparelho correto.',
        why: 'Sem instancia conectada, mensagens nao chegam ao Inbox e o agente nao responde.',
      },
      {
        title: 'Depois do QR Code',
        what: 'A conexao precisa persistir e registrar webhook.',
        how: 'Apos conectar, volte em Conexoes, use Sync e envie uma mensagem de teste.',
        why: 'Isso valida o fluxo inteiro antes de colocar o numero em producao.',
      },
    ],
  },
};

export function getTourSection(path: string | null) {
  const key = normalizePath(path);
  return (TOURS[key] || DEFAULT_TOUR).section;
}

export default function ProductTour({ path, request }: { path: string | null; request: number }) {
  const routeKey = normalizePath(path);
  const config = useMemo(() => TOURS[routeKey] || DEFAULT_TOUR, [routeKey]);
  const storageKey = `comunora.tutorial.${TOUR_VERSION}.${routeKey}`;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem(storageKey)) {
      setIndex(0);
      setOpen(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (request <= 0) return;
    setIndex(0);
    setOpen(true);
  }, [request]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeTour();
      if (event.key === 'ArrowRight') nextStep();
      if (event.key === 'ArrowLeft') previousStep();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, index, config.steps.length]);

  if (!open) return null;

  const step = config.steps[index] || config.steps[0];
  const isLast = index === config.steps.length - 1;

  function closeTour() {
    if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, '1');
    setOpen(false);
  }

  function nextStep() {
    if (index >= config.steps.length - 1) {
      closeTour();
      return;
    }
    setIndex((current) => current + 1);
  }

  function previousStep() {
    setIndex((current) => Math.max(0, current - 1));
  }

  return (
    <div className="nl-tour" role="dialog" aria-modal="true" aria-labelledby="nl-tour-title">
      <div className="nl-tour__backdrop" onClick={closeTour} />
      <section className="nl-tour__card">
        <button className="nl-tour__close" type="button" onClick={closeTour} aria-label="Fechar tutorial">
          <CloseIcon />
        </button>
        <div className="nl-tour__header">
          <span className="nl-tour__eyebrow">Tutorial de {config.section}</span>
          <div className="nl-tour__counter">
            {index + 1} de {config.steps.length}
          </div>
        </div>
        <h2 id="nl-tour-title">{step.title}</h2>
        <div className="nl-tour__body">
          <article>
            <strong>O que é</strong>
            <p>{step.what}</p>
          </article>
          <article>
            <strong>Como usar</strong>
            <p>{step.how}</p>
          </article>
          <article>
            <strong>Por que importa</strong>
            <p>{step.why}</p>
          </article>
        </div>
        <div className="nl-tour__progress" aria-hidden="true">
          {config.steps.map((_, stepIndex) => (
            <span key={stepIndex} className={stepIndex === index ? 'active' : ''} />
          ))}
        </div>
        <footer className="nl-tour__actions">
          <button type="button" className="nl-btn nl-btn--ghost" onClick={previousStep} disabled={index === 0}>
            Voltar
          </button>
          <button type="button" className="nl-btn nl-btn--accent" onClick={nextStep}>
            {isLast ? 'Concluir' : 'Próximo'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function normalizePath(path: string | null) {
  if (!path) return '/dashboard';
  const clean = path.split('?')[0].replace(/\/$/, '');
  return clean || '/dashboard';
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

