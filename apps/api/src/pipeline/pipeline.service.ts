import { Injectable, NotFoundException } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { publicar } from '@plataforma/bus';

@Injectable()
export class PipelineService {
  // Etapas + cards (contatos) de um projeto.
  quadro(tenantId: string, projetoId: string) {
    return comTenant(tenantId, async (q) => {
      const etapas = (await q(`select id, nome, ordem from etapas_pipeline where projeto_id=$1 order by ordem`, [projetoId])).rows;
      const cards = (await q(`select id, nome, telefone, etapa_pipeline, tags from contatos where projeto_id=$1`, [projetoId])).rows;
      return { etapas, cards };
    });
  }

  async mover(tenantId: string, contatoId: string, etapaId: string) {
    return comTenant(tenantId, async (q) => {
      const r = await q(`update contatos set etapa_pipeline=$2 where id=$1 returning id`, [contatoId, etapaId]);
      if (!r.rows[0]) throw new NotFoundException('contato nao encontrado');
      await publicar(tenantId, { tipo: 'card', contatoId, etapaId });
      return { ok: true };
    });
  }
}
