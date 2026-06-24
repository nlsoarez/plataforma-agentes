import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Queue } from 'bullmq';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';

type ReactivationSettingsDto = {
  ativo?: boolean;
  diasInatividade?: number;
  horario?: string;
  timezone?: string;
  limiteDiario?: number;
  janelaReenvioDias?: number;
  mensagem?: string;
};

@Controller('leads')
@UseGuards(AuthGuard)
export class LeadsController {
  private reactivationQueue?: Queue;

  private queue() {
    if (!this.reactivationQueue) this.reactivationQueue = new Queue('lead-reactivation', { connection: { url: process.env.REDIS_URL } as any });
    return this.reactivationQueue;
  }

  @Get()
  listar(@Query('projetoId') projetoId: string | undefined, @Query('q') busca: string | undefined, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select c.id, c.projeto_id, p.nome as projeto_nome, c.nome, c.telefone, c.tags,
                c.notes, c.metadata, c.unread_messages, c.ai_response_block_until,
                c.ultima_interacao, c.origem, c.criado_em,
                e.id as etapa_id, e.nome as etapa_nome
         from contatos c
         join projetos p on p.id=c.projeto_id
         left join etapas_pipeline e on e.id=c.etapa_pipeline
         where ($1::uuid is null or c.projeto_id=$1)
           and ($2::text is null or c.telefone ilike '%' || $2 || '%' or c.nome ilike '%' || $2 || '%')
         order by coalesce(c.ultima_interacao, c.criado_em) desc
         limit 200`,
        [projetoId || null, busca || null],
      );
      return r.rows;
    });
  }

  @Get('reactivation/settings/:projetoId')
  reactivationSettings(@Param('projetoId') projetoId: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      await validarProjeto(q, req.user.tenantId, projetoId);
      const r = await q(
        `insert into lead_reactivation_settings (tenant_id, projeto_id)
         values ($1,$2)
         on conflict (tenant_id, projeto_id) do update set atualizado_em=lead_reactivation_settings.atualizado_em
         returning id, projeto_id, ativo, dias_inatividade,
                   to_char(horario, 'HH24:MI') as horario,
                   timezone, limite_diario, janela_reenvio_dias, mensagem, ultimo_envio_em, ultimo_erro`,
        [req.user.tenantId, projetoId],
      );
      return r.rows[0];
    });
  }

  @Put('reactivation/settings/:projetoId')
  salvarReactivationSettings(@Param('projetoId') projetoId: string, @Body() body: ReactivationSettingsDto, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      await validarProjeto(q, req.user.tenantId, projetoId);
      const dias = clampNumber(body.diasInatividade, 60, 7, 730);
      const limite = clampNumber(body.limiteDiario, 30, 1, 500);
      const janela = clampNumber(body.janelaReenvioDias, 30, 1, 365);
      const horario = normalizarHorario(body.horario || '10:00');
      const timezone = String(body.timezone || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo';
      const mensagem = String(body.mensagem || '').trim()
        || 'Ola, {{nome}}. Passando para saber se deseja retomar seu atendimento ou agendar um novo horario.';
      const r = await q(
        `insert into lead_reactivation_settings (
           tenant_id, projeto_id, ativo, dias_inatividade, horario, timezone, limite_diario, janela_reenvio_dias, mensagem, atualizado_em
         )
         values ($1,$2,$3,$4,$5::time,$6,$7,$8,$9,now())
         on conflict (tenant_id, projeto_id) do update
           set ativo=excluded.ativo,
               dias_inatividade=excluded.dias_inatividade,
               horario=excluded.horario,
               timezone=excluded.timezone,
               limite_diario=excluded.limite_diario,
               janela_reenvio_dias=excluded.janela_reenvio_dias,
               mensagem=excluded.mensagem,
               ultimo_erro=null,
               atualizado_em=now()
         returning id, projeto_id, ativo, dias_inatividade,
                   to_char(horario, 'HH24:MI') as horario,
                   timezone, limite_diario, janela_reenvio_dias, mensagem, ultimo_envio_em, ultimo_erro`,
        [req.user.tenantId, projetoId, body.ativo ?? false, dias, horario, timezone, limite, janela, mensagem],
      );
      return { ok: true, settings: r.rows[0] };
    });
  }

  @Post('reactivation/test/:projetoId')
  testarReactivation(@Param('projetoId') projetoId: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      await validarProjeto(q, req.user.tenantId, projetoId);
      const setting = (await q(
        `select id from lead_reactivation_settings where tenant_id=$1 and projeto_id=$2 limit 1`,
        [req.user.tenantId, projetoId],
      )).rows[0];
      if (!setting) throw new BadRequestException('Salve a configuracao de reativacao antes de testar');
      await this.queue().add(
        'scan',
        { tenantId: req.user.tenantId, settingId: setting.id, force: true },
        { jobId: `lead-reactivation-test:${setting.id}:${Date.now()}`, removeOnComplete: 100, removeOnFail: 200 },
      );
      return { ok: true, message: 'Reativacao de teste enfileirada' };
    });
  }

  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `update contatos
         set nome=coalesce($2,nome),
             notes=coalesce($3,notes),
             metadata=coalesce($4::jsonb,metadata),
             tags=coalesce($5::text[],tags),
             etapa_pipeline=coalesce($6::uuid,etapa_pipeline),
             responsavel_id=coalesce($7::uuid,responsavel_id),
             departamento_id=coalesce($8::uuid,departamento_id),
             ai_response_block_until=$9::timestamptz
         where id=$1
         returning *`,
        [
          id,
          body.nome ?? null,
          body.notes ?? null,
          body.metadata ? JSON.stringify(body.metadata) : null,
          body.tags ?? null,
          body.etapaId ?? null,
          body.responsavelId ?? null,
          body.departamentoId ?? null,
          body.ai_response_block_until ?? null,
        ],
      );
      return r.rows[0];
    });
  }
}

async function validarProjeto(q: any, tenantId: string, projetoId: string) {
  const projeto = await q(`select id from projetos where id=$1 and tenant_id=$2`, [projetoId, tenantId]);
  if (!projeto.rows[0]) throw new BadRequestException('Projeto nao encontrado');
}

function normalizarHorario(value: string) {
  const raw = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) throw new BadRequestException('Horario invalido. Use HH:MM');
  const [hh, mm] = raw.split(':').map(Number);
  if (hh > 23 || mm > 59) throw new BadRequestException('Horario invalido. Use HH:MM');
  return raw;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
