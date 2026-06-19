import { BadRequestException, Body, Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';
import { assertLimit } from '../billing/entitlements';
import { encryptSecret } from '../secrets/crypto';

type SalvarAgenteDto = {
  prompt_sistema?: string;
  modelo?: string;
  provider?: string;
  byok_key_ref?: string;
  status?: string;
  horario_ativo?: boolean;
  horario_inicio?: string | null;
  horario_fim?: string | null;
};

const PROVIDERS = {
  openai: { nome: 'OpenAI', defaultModel: 'gpt-4o-mini', embeddingModel: 'text-embedding-3-small' },
  anthropic: { nome: 'Anthropic', defaultModel: 'claude-haiku-4-5-20251001', embeddingModel: '' },
  google: { nome: 'Google Gemini', defaultModel: 'gemini-1.5-flash', embeddingModel: '' },
} as const;

type Provider = keyof typeof PROVIDERS;

function normalizarProvider(provider: string): Provider {
  if (provider === 'openai' || provider === 'anthropic' || provider === 'google') return provider;
  return 'openai';
}

function normalizarStatus(status?: string | null): 'ativo' | 'pausado' | 'inativo' {
  if (status === 'pausado' || status === 'inativo') return status;
  return 'ativo';
}

function pareceChaveDireta(ref?: string | null) {
  const value = String(ref || '').trim();
  return /^(sk-|sk-ant-|AIza|ya29\.)/.test(value);
}

@Controller('agentes')
@UseGuards(AuthGuard)
export class AgentesController {
  @Get()
  listar(@Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(`
        select
          p.id as projeto_id,
          p.nome as projeto_nome,
          p.phone_number_id,
          coalesce(
            p.session_meta #>> '{instance,ownerJid}',
            p.session_meta #>> '{instance,owner}',
            p.session_meta #>> '{instance,number}',
            p.session_meta #>> '{instance,phone}',
            p.session_meta #>> '{evolution_instance,ownerJid}',
            p.session_meta #>> '{evolution_instance,owner}',
            p.session_meta #>> '{evolution_instance,number}',
            p.session_meta #>> '{data,ownerJid}',
            p.session_meta #>> '{data,owner}',
            p.session_meta #>> '{data,number}',
            p.session_meta #>> '{ownerJid}',
            p.session_meta #>> '{number}'
          ) as whatsapp_number,
          p.status as projeto_status,
          p.transporte_driver,
          a.id as agente_id,
          a.prompt_sistema,
          a.modelo,
          a.provider,
          case
            when a.byok_key_ref ~ '^(sk-|sk-ant-|AIza|ya29\\.)' then null
            else a.byok_key_ref
          end as byok_key_ref,
          a.status as agente_status,
          a.horario_ativo,
          to_char(a.horario_inicio, 'HH24:MI') as horario_inicio,
          to_char(a.horario_fim, 'HH24:MI') as horario_fim,
          a.horario_timezone,
          s.default_model as provider_default_model,
          s.key_last4 as provider_key_last4
        from projetos p
        left join lateral (
          select *
          from agentes
          where projeto_id = p.id
            and tenant_id = p.tenant_id
            and status in ('ativo', 'pausado', 'inativo')
          order by case when status = 'ativo' then 0 when status = 'pausado' then 1 else 2 end, id desc
          limit 1
        ) a on true
        left join ai_provider_settings s
          on s.tenant_id=p.tenant_id
         and s.provider=coalesce(a.provider, 'openai')
         and s.ativo=true
        where p.tenant_id=$1
        order by p.criado_em desc
      `, [req.user.tenantId]);

      return r.rows;
    });
  }

  @Put(':projetoId')
  async salvar(@Param('projetoId') projetoId: string, @Body() body: SalvarAgenteDto, @Req() req: any) {
    const status = normalizarStatus(body.status);
    const hasConfigured = await comTenant(req.user.tenantId, async (q) => {
      const r = await q(`select 1 from agentes where tenant_id=$1 and projeto_id=$2 and status in ('ativo','pausado') limit 1`, [req.user.tenantId, projetoId]);
      return Boolean(r.rows[0]);
    });
    if (!hasConfigured && status !== 'inativo') await assertLimit(req.user.tenantId, 'ai_agents', 1);

    return comTenant(req.user.tenantId, async (q) => {
      const projeto = await q(`select id from projetos where id=$1 and tenant_id=$2`, [projetoId, req.user.tenantId]);
      if (!projeto.rows[0]) return { ok: false, message: 'Projeto nao encontrado' };

      const prompt = (body.prompt_sistema ?? '').trim();
      const provider = normalizarProvider((body.provider ?? 'openai').trim());
      const modelo = (body.modelo ?? '').trim();
      const requestedByok = (body.byok_key_ref ?? '').trim();
      const horarioAtivo = Boolean(body.horario_ativo);
      const horarioInicio = normalizarHorario(body.horario_inicio);
      const horarioFim = normalizarHorario(body.horario_fim);
      if (horarioAtivo && (!horarioInicio || !horarioFim)) {
        throw new BadRequestException('Informe horario de inicio e fim para ativar a janela de funcionamento');
      }
      const existing = (await q(
        `select byok_key_ref from agentes
          where tenant_id=$1 and projeto_id=$2 and status in ('ativo','pausado','inativo')
          order by case when status='ativo' then 0 when status='pausado' then 1 else 2 end, id desc
          limit 1`,
        [req.user.tenantId, projetoId],
      )).rows[0];

      let byok = requestedByok || null;
      let setting = (await q(`select id, default_model from ai_provider_settings where tenant_id=$1 and provider=$2 and ativo=true limit 1`, [req.user.tenantId, provider])).rows[0];
      const directKey = pareceChaveDireta(requestedByok)
        ? requestedByok
        : (!requestedByok && pareceChaveDireta(existing?.byok_key_ref) ? existing.byok_key_ref : null);

      if (directKey) {
        const defaults = PROVIDERS[provider];
        setting = (await q(
          `insert into ai_provider_settings (
             tenant_id, provider, nome, encrypted_api_key, key_last4, default_model, embedding_model, ativo
           )
           values ($1,$2,$3,$4,$5,$6,$7,true)
           on conflict (tenant_id, provider) do update
             set encrypted_api_key=excluded.encrypted_api_key,
                 key_last4=excluded.key_last4,
                 default_model=coalesce(nullif(ai_provider_settings.default_model,''), excluded.default_model),
                 embedding_model=coalesce(ai_provider_settings.embedding_model, excluded.embedding_model),
                 ativo=true,
                 atualizado_em=now()
           returning id, default_model`,
          [
            req.user.tenantId,
            provider,
            defaults.nome,
            encryptSecret(directKey),
            directKey.slice(-4),
            modelo || defaults.defaultModel,
            defaults.embeddingModel,
          ],
        )).rows[0];
        byok = null;
      }

      if (status !== 'inativo' && !setting && !byok) {
        throw new BadRequestException(`Configure e salve a chave ${provider} em IA e Custos antes de ativar o agente`);
      }

      await q(`update agentes set status='inativo' where tenant_id=$1 and projeto_id=$2 and status in ('ativo','pausado','inativo')`, [req.user.tenantId, projetoId]);

      const r = await q(
        `insert into agentes (
           tenant_id, projeto_id, prompt_sistema, modelo, provider, byok_key_ref, ai_provider_setting_id,
           status, horario_ativo, horario_inicio, horario_fim, horario_timezone
         )
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::time,$11::time,'America/Sao_Paulo')
         returning id, prompt_sistema, modelo, provider, byok_key_ref, status, horario_ativo,
                   to_char(horario_inicio, 'HH24:MI') as horario_inicio,
                   to_char(horario_fim, 'HH24:MI') as horario_fim,
                   horario_timezone`,
        [
          req.user.tenantId,
          projetoId,
          prompt,
          modelo || setting?.default_model || PROVIDERS[provider].defaultModel,
          provider,
          byok,
          setting?.id || null,
          status,
          horarioAtivo,
          horarioAtivo ? horarioInicio : null,
          horarioAtivo ? horarioFim : null,
        ],
      );

      return { ok: true, agente: r.rows[0] };
    });
  }

  @Delete(':projetoId')
  async excluir(@Param('projetoId') projetoId: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const projeto = await q(`select id from projetos where id=$1 and tenant_id=$2`, [projetoId, req.user.tenantId]);
      if (!projeto.rows[0]) return { ok: false, message: 'Projeto nao encontrado' };

      const deleted = await q(`delete from agentes where tenant_id=$1 and projeto_id=$2 returning id`, [req.user.tenantId, projetoId]);
      return { ok: true, deleted: deleted.rowCount ?? deleted.rows.length };
    });
  }
}

function normalizarHorario(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^\d{2}:\d{2}$/.test(raw)) throw new BadRequestException('Horario invalido. Use HH:MM');
  const [hh, mm] = raw.split(':').map(Number);
  if (hh > 23 || mm > 59) throw new BadRequestException('Horario invalido. Use HH:MM');
  return raw;
}
