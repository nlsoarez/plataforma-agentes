import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { comTenant } from '@plataforma/db';
import { assertFeature, assertLimit, incrementUsage } from '../billing/entitlements';

@Injectable()
export class CampanhasService {
  private fila = new Queue('campanhas-envio', { connection: { url: process.env.REDIS_URL } as any });

  // Cria a campanha e enfileira um envio por contato do segmento.
  async criar(tenantId: string, dto: { projetoId: string; texto: string; segmento?: { tags?: string[]; contatoIds?: string[] } }) {
    await assertFeature(tenantId, 'campaigns');
    await assertLimit(tenantId, 'campaigns_monthly', 1);

    return comTenant(tenantId, async (q) => {
      const proj = await q(`select phone_number_id from projetos where id=$1`, [dto.projetoId]);
      if (!proj.rows[0]) throw new NotFoundException('projeto nao encontrado');
      const phoneNumberId = proj.rows[0].phone_number_id;
      if (!phoneNumberId) throw new BadRequestException('Conecte um WhatsApp antes de iniciar uma campanha');
      if (!String(dto.texto || '').trim()) throw new BadRequestException('Informe a mensagem da campanha');

      const camp = await q(
        `insert into campanhas (tenant_id, projeto_id, template_nome, segmento, status)
         values ($1,$2,$3,$4,'enviando') returning id`,
        [tenantId, dto.projetoId, dto.texto, JSON.stringify(dto.segmento ?? {})]);
      const campanhaId = camp.rows[0].id;

      const contatoIds = (dto.segmento?.contatoIds || []).filter(Boolean);
      const tags = dto.segmento?.tags;
      const contatos = (await q(
        contatoIds.length
          ? `select id, telefone
               from contatos
              where projeto_id=$1
                and id = any($2::uuid[])
                and telefone is not null
                and coalesce(opt_out_whatsapp,false)=false`
          : tags?.length
            ? `select id, telefone
                 from contatos
                where projeto_id=$1
                  and tags && $2::text[]
                  and telefone is not null
                  and coalesce(opt_out_whatsapp,false)=false`
            : `select id, telefone
                 from contatos
                where projeto_id=$1
                  and telefone is not null
                  and coalesce(opt_out_whatsapp,false)=false`,
        contatoIds.length ? [dto.projetoId, contatoIds] : tags?.length ? [dto.projetoId, tags] : [dto.projetoId])).rows;

      if (!contatos.length) {
        throw new BadRequestException('Nenhum lead encontrado para esta campanha');
      }

      await assertLimit(tenantId, 'campaign_recipients_monthly', contatos.length);

      for (const c of contatos) {
        const env = await q(
          `insert into campanha_envios (tenant_id, campanha_id, contato_id, status) values ($1,$2,$3,'enfileirado') returning id`,
          [tenantId, campanhaId, c.id]);
        await this.fila.add('envio', {
          tenantId, campanhaId, envioId: env.rows[0].id, projetoId: dto.projetoId,
          contatoId: c.id, telefone: c.telefone, phoneNumberId, texto: dto.texto,
        });
      }
      await incrementUsage(tenantId, 'campaigns_monthly', 1);
      await incrementUsage(tenantId, 'campaign_recipients_monthly', contatos.length);
      return { ok: true, campanhaId, total: contatos.length };
    });
  }

  listar(tenantId: string, projetoId: string) {
    return comTenant(tenantId, async (q) => {
      const r = await q(
        `select c.id, c.template_nome, c.status, c.criada_em,
                count(e.*) as total,
                count(e.*) filter (where e.status='enviado') as enviados,
                count(e.*) filter (where e.status='entregue') as entregues,
                count(e.*) filter (where e.status='lida') as lidas,
                count(e.*) filter (where e.status='falha') as falhas
         from campanhas c left join campanha_envios e on e.campanha_id=c.id
         where c.projeto_id=$1 group by c.id order by c.criada_em desc`,
        [projetoId]);
      return r.rows;
    });
  }
}
