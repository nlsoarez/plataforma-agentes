import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';
import {
  excluirEventoGoogleCalendar,
  sincronizarAgendamentoGoogleCalendar,
  verificarDisponibilidadeGoogleCalendarTenant,
} from './google-calendar-sync';

type AgendaDto = {
  projetoId?: string;
  contatoId?: string | null;
  inicioEm?: string;
  fimEm?: string | null;
  duracaoMinutos?: number | null;
  descricao?: string | null;
  status?: string | null;
};

@Controller('agenda')
@UseGuards(AuthGuard)
export class AgendaController {
  @Get()
  listar(@Req() req: any, @Query('projetoId') projetoId?: string) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select a.id, a.projeto_id, p.nome as projeto_nome, a.conversa_id, a.contato_id,
                c.nome as contato_nome, c.telefone, a.inicio_em, a.fim_em, a.duracao_minutos, a.descricao, a.status,
                a.provider, a.provider_ref, a.erro, a.criado_em
         from agendamentos a
         join projetos p on p.id=a.projeto_id
         left join contatos c on c.id=a.contato_id
         where ($1::uuid is null or a.projeto_id=$1)
         order by a.inicio_em desc
         limit 200`,
        [projetoId || null],
      );
      return r.rows;
    });
  }

  @Post()
  criar(@Body() body: AgendaDto, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const projetoId = String(body.projetoId || '').trim();
      if (!projetoId) throw new BadRequestException('Informe o projeto');
      await validarProjeto(q, req.user.tenantId, projetoId);

      const inicio = parseDate(body.inicioEm, 'inicioEm');
      const duracao = normalizarDuracao(body.duracaoMinutos);
      const fim = body.fimEm ? parseDate(body.fimEm, 'fimEm') : new Date(inicio.getTime() + duracao * 60_000);
      if (fim <= inicio) throw new BadRequestException('O fim deve ser posterior ao inicio');

      await validarContato(q, req.user.tenantId, projetoId, body.contatoId);
      await assertSemConflito(q, req.user.tenantId, projetoId, inicio, fim);
      const googleBusy = await verificarDisponibilidadeGoogleCalendarTenant(q, req.user.tenantId, inicio, duracao);
      if (googleBusy && !googleBusy.available) {
        throw new BadRequestException('Horario indisponivel: ja existe evento neste periodo no Google Calendar conectado');
      }

      const r = await q(
        `insert into agendamentos (
           tenant_id, projeto_id, contato_id, inicio_em, fim_em, duracao_minutos, descricao, status, provider
         )
         values ($1,$2,$3,$4,$5,$6,$7,'pendente','manual')
         returning id, projeto_id, contato_id, inicio_em, fim_em, duracao_minutos, descricao, status, provider`,
        [
          req.user.tenantId,
          projetoId,
          body.contatoId || null,
          inicio.toISOString(),
          fim.toISOString(),
          Math.max(15, Math.round((fim.getTime() - inicio.getTime()) / 60_000)),
          body.descricao || null,
        ],
      );
      const agendamento = r.rows[0];
      const sync = await sincronizarAgendamentoGoogleCalendar(q, req.user.tenantId, agendamento.id, {
        summary: await resumoAgendamento(q, projetoId, body.contatoId, body.descricao),
        description: body.descricao || null,
        startsAt: inicio,
        durationMinutes: agendamento.duracao_minutos,
      });
      const atualizado = await buscarAgendamento(q, req.user.tenantId, agendamento.id);
      return { ok: true, agendamento: atualizado || agendamento, calendarSync: sync };
    });
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() body: AgendaDto, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const atual = (await q(
        `select id, projeto_id, contato_id, inicio_em, fim_em, duracao_minutos, descricao, provider_ref
           from agendamentos
          where id=$1 and tenant_id=$2
          limit 1`,
        [id, req.user.tenantId],
      )).rows[0];
      if (!atual) return { ok: false, message: 'Agendamento nao encontrado' };

      const projetoId = String(body.projetoId || atual.projeto_id);
      const inicio = body.inicioEm ? parseDate(body.inicioEm, 'inicioEm') : new Date(atual.inicio_em);
      const duracao = normalizarDuracao(body.duracaoMinutos ?? atual.duracao_minutos);
      const fim = body.fimEm ? parseDate(body.fimEm, 'fimEm') : new Date(inicio.getTime() + duracao * 60_000);
      if (fim <= inicio) throw new BadRequestException('O fim deve ser posterior ao inicio');
      await validarProjeto(q, req.user.tenantId, projetoId);
      await validarContato(q, req.user.tenantId, projetoId, body.contatoId ?? atual.contato_id);
      await assertSemConflito(q, req.user.tenantId, projetoId, inicio, fim, id);
      if (!atual.provider_ref) {
        const googleBusy = await verificarDisponibilidadeGoogleCalendarTenant(q, req.user.tenantId, inicio, duracao);
        if (googleBusy && !googleBusy.available) {
          throw new BadRequestException('Horario indisponivel: ja existe evento neste periodo no Google Calendar conectado');
        }
      }

      const status = normalizarStatus(body.status);
      const r = await q(
        `update agendamentos
            set projeto_id=$2,
                contato_id=$3,
                inicio_em=$4,
                fim_em=$5,
                duracao_minutos=$6,
                descricao=$7,
                status=coalesce($8, status),
                atualizado_em=now()
          where id=$1 and tenant_id=$9
          returning id, projeto_id, contato_id, inicio_em, fim_em, duracao_minutos, descricao, status, provider, provider_ref, erro`,
        [
          id,
          projetoId,
          body.contatoId ?? atual.contato_id ?? null,
          inicio.toISOString(),
          fim.toISOString(),
          Math.max(15, Math.round((fim.getTime() - inicio.getTime()) / 60_000)),
          body.descricao ?? atual.descricao ?? null,
          status,
          req.user.tenantId,
        ],
      );
      const agendamento = r.rows[0];
      let sync = null;
      if (agendamento.status !== 'cancelado') {
        sync = await sincronizarAgendamentoGoogleCalendar(q, req.user.tenantId, agendamento.id, {
          summary: await resumoAgendamento(q, projetoId, body.contatoId ?? atual.contato_id, agendamento.descricao),
          description: agendamento.descricao || null,
          startsAt: inicio,
          durationMinutes: agendamento.duracao_minutos,
          providerRef: agendamento.provider_ref,
        });
      }
      const atualizado = await buscarAgendamento(q, req.user.tenantId, agendamento.id);
      return { ok: true, agendamento: atualizado || agendamento, calendarSync: sync };
    });
  }

  @Delete(':id')
  cancelar(@Param('id') id: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const atual = (await q(
        `select id, provider_ref
           from agendamentos
          where id=$1 and tenant_id=$2
          limit 1`,
        [id, req.user.tenantId],
      )).rows[0];
      const sync = atual ? await excluirEventoGoogleCalendar(q, req.user.tenantId, atual.provider_ref) : { ok: true };
      const r = await q(
        `update agendamentos
            set status='cancelado',
                erro=case when $3::text is null then null else $3 end,
                atualizado_em=now()
          where id=$1 and tenant_id=$2
          returning id`,
        [id, req.user.tenantId, sync.ok ? null : sync.error || 'falha ao cancelar evento externo'],
      );
      return { ok: true, updated: r.rowCount ?? r.rows.length, calendarSync: sync };
    });
  }
}

function parseDate(value: unknown, field: string) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} invalido`);
  return date;
}

function normalizarDuracao(value: unknown) {
  const n = Number(value || 60);
  if (!Number.isFinite(n)) return 60;
  return Math.min(480, Math.max(15, Math.round(n)));
}

function normalizarStatus(value: unknown) {
  const status = String(value || '').trim();
  if (!status) return null;
  if (['pendente', 'sincronizado', 'cancelado'].includes(status)) return status;
  throw new BadRequestException('Status invalido');
}

async function validarProjeto(q: any, tenantId: string, projetoId: string) {
  const projeto = await q(`select id from projetos where id=$1 and tenant_id=$2`, [projetoId, tenantId]);
  if (!projeto.rows[0]) throw new BadRequestException('Projeto nao encontrado');
}

async function validarContato(q: any, tenantId: string, projetoId: string, contatoId?: string | null) {
  if (!contatoId) return;
  const contato = await q(
    `select id from contatos where id=$1 and tenant_id=$2 and projeto_id=$3`,
    [contatoId, tenantId, projetoId],
  );
  if (!contato.rows[0]) throw new BadRequestException('Contato nao encontrado neste projeto');
}

async function assertSemConflito(q: any, tenantId: string, projetoId: string, inicio: Date, fim: Date, ignoreId?: string) {
  const conflito = await q(
    `select id, inicio_em, fim_em, descricao
       from agendamentos
      where tenant_id=$1
        and projeto_id=$2
        and status in ('pendente','sincronizado')
        and ($5::uuid is null or id <> $5)
        and tstzrange(inicio_em, coalesce(fim_em, inicio_em + make_interval(mins => greatest(15, duracao_minutos))), '[)')
            && tstzrange($3::timestamptz, $4::timestamptz, '[)')
      limit 1`,
    [tenantId, projetoId, inicio.toISOString(), fim.toISOString(), ignoreId || null],
  );
  if (conflito.rows[0]) {
    throw new BadRequestException('Horario indisponivel: ja existe agendamento neste periodo');
  }
}

async function resumoAgendamento(q: any, projetoId: string, contatoId?: string | null, descricao?: string | null) {
  const projeto = (await q(`select nome from projetos where id=$1`, [projetoId])).rows[0];
  const contato = contatoId ? (await q(`select nome, telefone from contatos where id=$1`, [contatoId])).rows[0] : null;
  const alvo = contato?.nome || contato?.telefone || projeto?.nome || 'Agenda';
  const titulo = String(descricao || '').split(/\r?\n/)[0].trim();
  return titulo ? `${alvo}: ${titulo}` : `Atendimento Comunora - ${alvo}`;
}

async function buscarAgendamento(q: any, tenantId: string, id: string) {
  return (await q(
    `select id, projeto_id, contato_id, inicio_em, fim_em, duracao_minutos, descricao, status, provider, provider_ref, erro
       from agendamentos
      where id=$1 and tenant_id=$2
      limit 1`,
    [id, tenantId],
  )).rows[0];
}
