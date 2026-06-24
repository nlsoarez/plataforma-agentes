import { Injectable } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { KnowledgeService } from '../knowledge/knowledge.service';

type TemplatePayload = {
  nome?: string;
  descricao?: string;
  segmento?: string;
  prompt_sistema?: string;
  modelo?: string;
  provider?: string;
  pipeline?: { nome: string; ordem?: number }[];
  tags?: { nome: string; cor?: string; descricao?: string }[];
  propriedades?: { nome: string; tipo?: string; descricao?: string }[];
  automacoes?: { nome: string; gatilho: string; condicoes?: any; acoes?: any[]; ativo?: boolean }[];
  conhecimento?: { titulo: string; conteudo: string; tipo?: string }[];
  lembrete?: { ativo?: boolean; antecedenciaHoras?: number; mensagem?: string };
  reativacao?: { ativo?: boolean; diasInatividade?: number; limiteDiario?: number; mensagem?: string };
};

export const PROFESSION_TEMPLATES: Array<TemplatePayload & { id: string; nome: string; descricao: string }> = [
  {
    id: 'nutricionista',
    segmento: 'nutricionista',
    nome: 'Nutricionista',
    descricao: 'Atendimento, triagem, retorno e agendamento de consultas nutricionais.',
    provider: 'anthropic',
    modelo: 'claude-haiku-4-5-20251001',
    prompt_sistema: [
      'Voce e um assistente de atendimento para nutricionista.',
      'Fale em portugues do Brasil, com tom acolhedor, profissional e objetivo.',
      'Ajude o cliente a entender modalidades de consulta, coletar objetivo principal, restricoes alimentares basicas e disponibilidade.',
      'Nunca prescreva dieta, suplemento, tratamento ou diagnostico. Para orientacao clinica, encaminhe para consulta.',
      'Antes de agendar, consulte disponibilidade. Se houver conflito, ofereca alternativas.',
      'Se o cliente demonstrar urgencia medica, oriente procurar atendimento de saude imediatamente.',
    ].join('\n'),
    pipeline: [
      { nome: 'Novo lead', ordem: 0 },
      { nome: 'Triagem', ordem: 1 },
      { nome: 'Consulta agendada', ordem: 2 },
      { nome: 'Retorno pendente', ordem: 3 },
      { nome: 'Cliente ativo', ordem: 4 },
    ],
    tags: [
      { nome: 'primeira-consulta', cor: '#1565FF' },
      { nome: 'retorno', cor: '#00C6A9' },
      { nome: 'urgente', cor: '#F59E0B' },
    ],
    conhecimento: [
      { titulo: 'Regras de atendimento nutricional', conteudo: 'O agente pode explicar formato da consulta, valores se estiverem na base, horarios disponiveis e preparar agendamento. O agente nao prescreve dieta, nao interpreta exames e nao substitui consulta profissional.' },
    ],
    lembrete: { ativo: true, mensagem: 'Ola, confirmando sua consulta nutricional em {{data}} as {{hora}}. Responda 1 para confirmar, 2 para remarcar ou 3 para cancelar.' },
    reativacao: { ativo: false, diasInatividade: 60, mensagem: 'Ola, {{nome}}. Faz um tempo que nao falamos. Deseja agendar sua consulta ou retorno nutricional?' },
  },
  {
    id: 'salao',
    segmento: 'salao',
    nome: 'Cabeleireiro / Salao',
    descricao: 'Agenda de servicos, confirmacao de horario e reativacao de clientes.',
    provider: 'anthropic',
    modelo: 'claude-haiku-4-5-20251001',
    prompt_sistema: [
      'Voce e um assistente de atendimento para salao de beleza ou cabeleireiro.',
      'Fale de forma simpatica, objetiva e comercial.',
      'Colete servico desejado, data, horario, profissional preferido e observacoes relevantes.',
      'Nunca prometa preco, duracao ou resultado que nao esteja na base de conhecimento.',
      'Consulte disponibilidade antes de confirmar qualquer horario.',
    ].join('\n'),
    pipeline: [
      { nome: 'Novo contato', ordem: 0 },
      { nome: 'Escolhendo servico', ordem: 1 },
      { nome: 'Horario agendado', ordem: 2 },
      { nome: 'Compareceu', ordem: 3 },
      { nome: 'Reativar', ordem: 4 },
    ],
    tags: [
      { nome: 'corte', cor: '#1565FF' },
      { nome: 'coloracao', cor: '#00C6A9' },
      { nome: 'retorno', cor: '#7ED957' },
    ],
    conhecimento: [
      { titulo: 'Regras de agenda do salao', conteudo: 'O agente agenda apenas depois de consultar disponibilidade. Para servicos tecnicos, colete informacoes basicas e ofereca avaliacao quando necessario.' },
    ],
    lembrete: { ativo: true, mensagem: 'Ola, passando para confirmar seu horario no salao em {{data}} as {{hora}}. Responda 1 para confirmar, 2 para remarcar ou 3 para cancelar.' },
    reativacao: { ativo: false, diasInatividade: 45, mensagem: 'Ola, {{nome}}. Ja faz um tempinho desde seu ultimo atendimento. Quer agendar um novo horario?' },
  },
  {
    id: 'advogado',
    segmento: 'advogado',
    nome: 'Advogado',
    descricao: 'Triagem juridica, organizacao de demanda e agendamento de reunioes.',
    provider: 'anthropic',
    modelo: 'claude-haiku-4-5-20251001',
    prompt_sistema: [
      'Voce e um assistente de atendimento para escritorio de advocacia.',
      'Fale em portugues do Brasil, com postura profissional e cuidadosa.',
      'Colete area do caso, resumo objetivo, urgencia, cidade/estado e melhor horario para reuniao.',
      'Nao de parecer juridico, nao prometa resultado e nao oriente conduta legal especifica.',
      'Quando houver duvida juridica, informe que um advogado analisara o caso.',
      'Consulte disponibilidade antes de agendar reuniao.',
    ].join('\n'),
    pipeline: [
      { nome: 'Novo caso', ordem: 0 },
      { nome: 'Triagem', ordem: 1 },
      { nome: 'Reuniao agendada', ordem: 2 },
      { nome: 'Em analise', ordem: 3 },
      { nome: 'Contratado', ordem: 4 },
    ],
    tags: [
      { nome: 'trabalhista', cor: '#1565FF' },
      { nome: 'familia', cor: '#00C6A9' },
      { nome: 'urgente', cor: '#EF4444' },
    ],
    conhecimento: [
      { titulo: 'Limites do assistente juridico', conteudo: 'O agente faz triagem e agenda reunioes. O agente nao presta consultoria juridica, nao interpreta documentos e nao garante resultados.' },
    ],
    lembrete: { ativo: true, mensagem: 'Ola, confirmando sua reuniao com o escritorio em {{data}} as {{hora}}. Responda 1 para confirmar, 2 para remarcar ou 3 para cancelar.' },
    reativacao: { ativo: false, diasInatividade: 60, mensagem: 'Ola, {{nome}}. Deseja retomar o atendimento ou agendar uma conversa com o escritorio?' },
  },
  {
    id: 'corretor-imoveis',
    segmento: 'corretor-imoveis',
    nome: 'Corretor de imoveis',
    descricao: 'Qualificacao de compradores, visitas e acompanhamento comercial.',
    provider: 'anthropic',
    modelo: 'claude-haiku-4-5-20251001',
    prompt_sistema: [
      'Voce e um assistente comercial para corretor de imoveis.',
      'Colete tipo de imovel, cidade/bairro, faixa de valor, financiamento, prazo de compra e melhor horario para visita.',
      'Nao invente preco, disponibilidade, comissao, condominio ou condicoes que nao estejam na base.',
      'Ao perceber interesse real, tente agendar visita ou reuniao, sempre consultando disponibilidade.',
    ].join('\n'),
    pipeline: [
      { nome: 'Novo lead', ordem: 0 },
      { nome: 'Qualificacao', ordem: 1 },
      { nome: 'Imovel indicado', ordem: 2 },
      { nome: 'Visita agendada', ordem: 3 },
      { nome: 'Proposta', ordem: 4 },
    ],
    tags: [
      { nome: 'compra', cor: '#1565FF' },
      { nome: 'aluguel', cor: '#00C6A9' },
      { nome: 'financiamento', cor: '#7ED957' },
    ],
    conhecimento: [
      { titulo: 'Regras comerciais imobiliarias', conteudo: 'O agente qualifica o interesse, apresenta informacoes que estejam na base e agenda visitas. Nao inventa valores, disponibilidade ou condicoes de negociacao.' },
    ],
    lembrete: { ativo: true, mensagem: 'Ola, confirmando sua visita/reuniao sobre imoveis em {{data}} as {{hora}}. Responda 1 para confirmar, 2 para remarcar ou 3 para cancelar.' },
    reativacao: { ativo: false, diasInatividade: 45, mensagem: 'Ola, {{nome}}. Ainda esta procurando imovel? Posso te ajudar a retomar a busca ou agendar uma visita.' },
  },
  {
    id: 'comercial',
    segmento: 'comercial',
    nome: 'Atendimento comercial',
    descricao: 'Template generico para atendimento, qualificacao e agendamento.',
    provider: 'anthropic',
    modelo: 'claude-haiku-4-5-20251001',
    prompt_sistema: [
      'Voce e um atendente objetivo, educado e comercial.',
      'Responda em portugues do Brasil.',
      'Faca perguntas curtas para entender a necessidade do lead.',
      'Quando houver interesse, consulte disponibilidade e agende um atendimento.',
      'Quando o cliente pedir atendimento humano, acione handoff.',
      'Nunca invente preco, prazo ou politica que nao esteja no contexto.',
    ].join('\n'),
    pipeline: [
      { nome: 'Novo lead', ordem: 0 },
      { nome: 'Qualificacao', ordem: 1 },
      { nome: 'Agendado', ordem: 2 },
      { nome: 'Proposta', ordem: 3 },
      { nome: 'Fechado', ordem: 4 },
    ],
    tags: [
      { nome: 'lead-quente', cor: '#22C55E' },
      { nome: 'retorno', cor: '#1565FF' },
      { nome: 'humano', cor: '#F59E0B' },
    ],
    conhecimento: [
      { titulo: 'Regras gerais do atendimento', conteudo: 'O agente qualifica leads, responde com base no contexto, agenda horarios e encaminha para humano quando necessario.' },
    ],
    lembrete: { ativo: true },
    reativacao: { ativo: false, diasInatividade: 60 },
  },
];

@Injectable()
export class TemplatesService {
  constructor(private readonly knowledge: KnowledgeService) {}

  listar(tenantId: string) {
    return comTenant(tenantId, async (q) => {
      const r = await q(
        `select id, nome, descricao, versao, publico, origem, criado_em
         from project_templates
         order by criado_em desc`,
      );
      return r.rows;
    });
  }

  listarProfissoes() {
    return PROFESSION_TEMPLATES.map(({ id, nome, descricao, segmento }) => ({ id, nome, descricao, segmento }));
  }

  templateProfissao(id: string) {
    return PROFESSION_TEMPLATES.find((template) => template.id === id);
  }

  criar(tenantId: string, body: { nome: string; descricao?: string; payload: TemplatePayload; publico?: boolean }) {
    return comTenant(tenantId, async (q) => {
      const r = await q(
        `insert into project_templates (tenant_id, nome, descricao, payload, publico)
         values ($1,$2,$3,$4,$5)
         returning id, nome, descricao, versao, publico, origem, criado_em`,
        [tenantId, body.nome, body.descricao || null, JSON.stringify(body.payload), body.publico ?? false],
      );
      return r.rows[0];
    });
  }

  exportar(tenantId: string, projetoId: string) {
    return comTenant(tenantId, async (q) => {
      const projeto = (await q(`select id, nome from projetos where id=$1`, [projetoId])).rows[0];
      const agente = (await q(
        `select prompt_sistema, modelo, provider from agentes where projeto_id=$1 and status='ativo' limit 1`,
        [projetoId],
      )).rows[0];
      const pipeline = (await q(`select nome, ordem from etapas_pipeline where projeto_id=$1 order by ordem`, [projetoId])).rows;
      const automacoes = (await q(`select nome, gatilho, condicoes, acoes, ativo from automacoes where projeto_id=$1 or projeto_id is null order by criado_em`, [projetoId])).rows;
      const conhecimento = (await q(`select titulo, tipo, conteudo from knowledge_documents where projeto_id=$1 and status='ativo'`, [projetoId])).rows;

      return {
        nome: projeto?.nome || 'Template',
        descricao: `Exportado do projeto ${projeto?.nome || projetoId}`,
        prompt_sistema: agente?.prompt_sistema || '',
        modelo: agente?.modelo || 'gpt-4o-mini',
        provider: agente?.provider || 'openai',
        pipeline,
        automacoes,
        conhecimento,
      };
    });
  }

  async importar(tenantId: string, payload: TemplatePayload, opts: { nomeProjeto?: string; organizacao?: string }) {
    return comTenant(tenantId, async (q) => {
      const nomeProjeto = opts.nomeProjeto || payload.nome || 'Projeto importado';
      const projeto = await q(
        `insert into projetos (tenant_id, nome, status, transporte_driver, session_meta)
         values ($1,$2,'onboarding','evolution',$3)
         returning id, nome, status`,
        [tenantId, nomeProjeto, JSON.stringify({ origem: 'template_import', organizacao: opts.organizacao || null })],
      );
      const projetoId = projeto.rows[0].id;

      await q(
        `insert into agentes (tenant_id, projeto_id, prompt_sistema, modelo, provider, status)
         values ($1,$2,$3,$4,$5,'ativo')`,
        [tenantId, projetoId, payload.prompt_sistema || '', payload.modelo || 'gpt-4o-mini', payload.provider || 'openai'],
      );

      const pipeline = payload.pipeline?.length ? payload.pipeline : [
        { nome: 'Novo lead', ordem: 0 },
        { nome: 'Em qualificacao', ordem: 1 },
        { nome: 'Qualificado', ordem: 2 },
        { nome: 'Atendimento humano', ordem: 3 },
        { nome: 'Arquivado', ordem: 4 },
      ];
      for (let i = 0; i < pipeline.length; i++) {
        const etapa = pipeline[i];
        await q(
          `insert into etapas_pipeline (tenant_id, projeto_id, nome, ordem)
           values ($1,$2,$3,$4)`,
          [tenantId, projetoId, etapa.nome, etapa.ordem ?? i],
        );
      }

      for (const tag of payload.tags ?? []) {
        await q(
          `insert into tags (tenant_id, nome, descricao, cor)
           values ($1,$2,$3,$4)
           on conflict (tenant_id, nome) do update set descricao=excluded.descricao, cor=excluded.cor`,
          [tenantId, tag.nome, tag.descricao || null, tag.cor || '#1565FF'],
        );
      }

      for (const automacao of payload.automacoes ?? []) {
        await q(
          `insert into automacoes (tenant_id, projeto_id, nome, gatilho, condicoes, acoes, ativo)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            tenantId,
            projetoId,
            automacao.nome,
            automacao.gatilho,
            JSON.stringify(automacao.condicoes ?? {}),
            JSON.stringify(automacao.acoes ?? []),
            automacao.ativo ?? true,
          ],
        );
      }

      for (const doc of payload.conhecimento ?? []) {
        await this.knowledge.criar(tenantId, { projetoId, titulo: doc.titulo, conteudo: doc.conteudo, tipo: doc.tipo || 'text' });
      }

      if (payload.lembrete) {
        await q(
          `insert into appointment_reminder_settings (
             tenant_id, projeto_id, ativo, antecedencia_horas, mensagem, atualizado_em
           )
           values ($1,$2,$3,$4,$5,now())
           on conflict (tenant_id, projeto_id) do update
             set ativo=excluded.ativo,
                 antecedencia_horas=excluded.antecedencia_horas,
                 mensagem=excluded.mensagem,
                 atualizado_em=now()`,
          [
            tenantId,
            projetoId,
            payload.lembrete.ativo ?? true,
            payload.lembrete.antecedenciaHoras ?? 24,
            payload.lembrete.mensagem || 'Ola, confirmando seu atendimento em {{data}} as {{hora}}. Responda 1 para confirmar, 2 para remarcar ou 3 para cancelar.',
          ],
        );
      }

      if (payload.reativacao) {
        await q(
          `insert into lead_reactivation_settings (
             tenant_id, projeto_id, ativo, dias_inatividade, limite_diario, mensagem, atualizado_em
           )
           values ($1,$2,$3,$4,$5,$6,now())
           on conflict (tenant_id, projeto_id) do update
             set ativo=excluded.ativo,
                 dias_inatividade=excluded.dias_inatividade,
                 limite_diario=excluded.limite_diario,
                 mensagem=excluded.mensagem,
                 atualizado_em=now()`,
          [
            tenantId,
            projetoId,
            payload.reativacao.ativo ?? false,
            payload.reativacao.diasInatividade ?? 60,
            payload.reativacao.limiteDiario ?? 30,
            payload.reativacao.mensagem || 'Ola, {{nome}}. Passando para saber se deseja retomar seu atendimento ou agendar um novo horario.',
          ],
        );
      }

      return { ok: true, projeto: projeto.rows[0] };
    });
  }
}
