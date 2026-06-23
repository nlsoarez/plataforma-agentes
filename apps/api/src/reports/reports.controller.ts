import { BadRequestException, Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';

type SaveReportSettingsDto = {
  ativo?: boolean;
  horario?: string;
  timezone?: string;
  canal?: string;
  destino?: string;
};

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  @Get('settings')
  listarSettings(@Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select
           p.id as projeto_id,
           p.nome as projeto_nome,
           p.phone_number_id,
           s.id,
           coalesce(s.ativo, false) as ativo,
           coalesce(to_char(s.horario, 'HH24:MI'), '18:00') as horario,
           coalesce(s.timezone, 'America/Sao_Paulo') as timezone,
           coalesce(s.canal, 'whatsapp') as canal,
           coalesce(s.destino, '') as destino,
           s.ultimo_envio_em,
           s.ultimo_erro
         from projetos p
         left join agent_report_settings s
           on s.tenant_id=p.tenant_id
          and s.projeto_id=p.id
         where p.tenant_id=$1
         order by p.criado_em desc`,
        [req.user.tenantId],
      );
      return r.rows;
    });
  }

  @Get('runs')
  listarRuns(@Req() req: any, @Query('projetoId') projetoId?: string) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select id, projeto_id, periodo_inicio, periodo_fim, canal, destino, conteudo,
                status, erro, enviado_em, criado_em
           from agent_report_runs
          where tenant_id=$1
            and ($2::uuid is null or projeto_id=$2)
          order by criado_em desc
          limit 50`,
        [req.user.tenantId, projetoId || null],
      );
      return r.rows;
    });
  }

  @Put('settings/:projetoId')
  salvarSettings(@Param('projetoId') projetoId: string, @Body() body: SaveReportSettingsDto, @Req() req: any) {
    const horario = normalizarHorario(body.horario || '18:00');
    const timezone = String(body.timezone || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo';
    const canal = normalizarCanal(body.canal || 'whatsapp');
    const destino = String(body.destino || '').trim();
    const ativo = Boolean(body.ativo);

    if (ativo && !destino) {
      throw new BadRequestException('Informe o destino do relatorio antes de ativar');
    }
    if (ativo && canal === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) {
      throw new BadRequestException('Informe um e-mail valido para receber o relatorio');
    }
    if (ativo && canal === 'whatsapp' && !/^\+?\d{10,15}$/.test(destino.replace(/\D/g, ''))) {
      throw new BadRequestException('Informe um WhatsApp com DDI e DDD. Exemplo: 5511999999999');
    }

    return comTenant(req.user.tenantId, async (q) => {
      const projeto = await q(`select id from projetos where id=$1 and tenant_id=$2`, [projetoId, req.user.tenantId]);
      if (!projeto.rows[0]) return { ok: false, message: 'Projeto nao encontrado' };

      const r = await q(
        `insert into agent_report_settings (
           tenant_id, projeto_id, ativo, horario, timezone, canal, destino, atualizado_em
         )
         values ($1,$2,$3,$4::time,$5,$6,$7,now())
         on conflict (tenant_id, projeto_id) do update
           set ativo=excluded.ativo,
               horario=excluded.horario,
               timezone=excluded.timezone,
               canal=excluded.canal,
               destino=excluded.destino,
               ultimo_erro=null,
               atualizado_em=now()
         returning id, projeto_id, ativo, to_char(horario, 'HH24:MI') as horario,
                   timezone, canal, destino, ultimo_envio_em, ultimo_erro`,
        [req.user.tenantId, projetoId, ativo, horario, timezone, canal, canal === 'whatsapp' ? destino.replace(/\D/g, '') : destino],
      );

      return { ok: true, settings: r.rows[0] };
    });
  }
}

function normalizarHorario(value: string) {
  const raw = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) throw new BadRequestException('Horario invalido. Use HH:MM');
  const [hh, mm] = raw.split(':').map(Number);
  if (hh > 23 || mm > 59) throw new BadRequestException('Horario invalido. Use HH:MM');
  return raw;
}

function normalizarCanal(value: string) {
  const canal = String(value || '').trim().toLowerCase();
  if (canal === 'whatsapp' || canal === 'email') return canal;
  throw new BadRequestException('Canal invalido');
}
