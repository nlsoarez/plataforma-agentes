import { Injectable } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { KnowledgeService } from '../knowledge/knowledge.service';

type TemplatePayload = {
  nome?: string;
  descricao?: string;
  prompt_sistema?: string;
  modelo?: string;
  provider?: string;
  pipeline?: { nome: string; ordem?: number }[];
  tags?: { nome: string; cor?: string; descricao?: string }[];
  propriedades?: { nome: string; tipo?: string; descricao?: string }[];
  automacoes?: { nome: string; gatilho: string; condicoes?: any; acoes?: any[]; ativo?: boolean }[];
  conhecimento?: { titulo: string; conteudo: string; tipo?: string }[];
};

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

      return { ok: true, projeto: projeto.rows[0] };
    });
  }
}
