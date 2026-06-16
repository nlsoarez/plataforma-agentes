import { BadRequestException, Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';
import { assertLimit } from '../billing/entitlements';
import { encryptSecret } from '../secrets/crypto';

type SalvarAgenteDto = {
  prompt_sistema?: string;
  modelo?: string;
  provider?: string;
  byok_key_ref?: string;
};

const PROVIDERS = {
  openai: { nome: 'OpenAI', defaultModel: 'gpt-4o-mini', embeddingModel: 'text-embedding-3-small' },
  anthropic: { nome: 'Anthropic', defaultModel: 'claude-3-5-haiku-20241022', embeddingModel: '' },
  google: { nome: 'Google Gemini', defaultModel: 'gemini-1.5-flash', embeddingModel: '' },
} as const;

type Provider = keyof typeof PROVIDERS;

function normalizarProvider(provider: string): Provider {
  if (provider === 'openai' || provider === 'anthropic' || provider === 'google') return provider;
  return 'openai';
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
          s.default_model as provider_default_model,
          s.key_last4 as provider_key_last4
        from projetos p
        left join lateral (
          select *
          from agentes
          where projeto_id = p.id
          order by case when status = 'ativo' then 0 else 1 end, id
          limit 1
        ) a on true
        left join ai_provider_settings s
          on s.tenant_id=p.tenant_id
         and s.provider=coalesce(a.provider, 'openai')
         and s.ativo=true
        order by p.criado_em desc
      `);

      return r.rows;
    });
  }

  @Put(':projetoId')
  async salvar(@Param('projetoId') projetoId: string, @Body() body: SalvarAgenteDto, @Req() req: any) {
    const hasActive = await comTenant(req.user.tenantId, async (q) => {
      const r = await q(`select 1 from agentes where projeto_id=$1 and status='ativo' limit 1`, [projetoId]);
      return Boolean(r.rows[0]);
    });
    if (!hasActive) await assertLimit(req.user.tenantId, 'ai_agents', 1);

    return comTenant(req.user.tenantId, async (q) => {
      const projeto = await q(`select id from projetos where id=$1`, [projetoId]);
      if (!projeto.rows[0]) return { ok: false, message: 'Projeto nao encontrado' };

      const prompt = (body.prompt_sistema ?? '').trim();
      const provider = normalizarProvider((body.provider ?? 'openai').trim());
      const modelo = (body.modelo ?? '').trim();
      const requestedByok = (body.byok_key_ref ?? '').trim();
      const existing = (await q(
        `select byok_key_ref from agentes where projeto_id=$1 and status='ativo' order by id limit 1`,
        [projetoId],
      )).rows[0];

      let byok = requestedByok || null;
      let setting = (await q(`select id, default_model from ai_provider_settings where provider=$1 and ativo=true limit 1`, [provider])).rows[0];
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

      if (!setting && !byok) {
        throw new BadRequestException(`Configure e salve a chave ${provider} em IA e Custos antes de ativar o agente`);
      }

      await q(`update agentes set status='inativo' where projeto_id=$1 and status='ativo'`, [projetoId]);

      const r = await q(
        `insert into agentes (tenant_id, projeto_id, prompt_sistema, modelo, provider, byok_key_ref, ai_provider_setting_id, status)
         values ($1,$2,$3,$4,$5,$6,$7,'ativo')
         returning id, prompt_sistema, modelo, provider, byok_key_ref, status`,
        [req.user.tenantId, projetoId, prompt, modelo || setting?.default_model || PROVIDERS[provider].defaultModel, provider, byok, setting?.id || null],
      );

      return { ok: true, agente: r.rows[0] };
    });
  }
}
