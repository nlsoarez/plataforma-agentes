import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';
import { decryptSecret, encryptSecret } from '../secrets/crypto';

const PROVIDERS = {
  openai: { nome: 'OpenAI', defaultModel: 'gpt-4o-mini', embeddingModel: 'text-embedding-3-small' },
  anthropic: { nome: 'Anthropic', defaultModel: 'claude-3-5-haiku-20241022', embeddingModel: null },
  google: { nome: 'Google Gemini', defaultModel: 'gemini-1.5-flash', embeddingModel: null },
} as const;

type Provider = keyof typeof PROVIDERS;

function normalizarProvider(provider: string): Provider {
  if (provider === 'openai' || provider === 'anthropic' || provider === 'google') return provider;
  throw new BadRequestException(`provider ${provider} nao suportado`);
}

async function lerJsonOuTexto(r: Response) {
  const text = await r.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function escolherModeloAnthropic(modelos: string[], preferido?: string) {
  if (preferido && modelos.includes(preferido)) return preferido;
  return modelos.find((id) => id.includes('haiku'))
    ?? modelos.find((id) => id.includes('sonnet'))
    ?? modelos[0]
    ?? preferido
    ?? PROVIDERS.anthropic.defaultModel;
}

@Controller('ai-settings')
@UseGuards(AuthGuard)
export class AiSettingsController {
  @Get()
  listar(@Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select id, provider, nome, key_last4, default_model, embedding_model,
                input_cost_per_1m, output_cost_per_1m, embedding_cost_per_1m,
                currency, ativo, atualizado_em
         from ai_provider_settings
         order by provider`,
      );
      return r.rows;
    });
  }

  @Post('openai')
  salvarOpenAI(@Body() body: any, @Req() req: any) {
    return this.salvarProvider('openai', body, req);
  }

  @Post(':provider')
  salvarGenerico(@Param('provider') provider: string, @Body() body: any, @Req() req: any) {
    return this.salvarProvider(provider, body, req);
  }

  @Patch(':provider/test')
  testar(@Param('provider') providerParam: string, @Body() body: any, @Req() req: any) {
    const provider = normalizarProvider(providerParam);
    return comTenant(req.user.tenantId, async (q) => {
      const row = (await q(`select encrypted_api_key from ai_provider_settings where provider=$1 and ativo=true limit 1`, [provider])).rows[0];
      const apiKey = String(body?.apiKey ?? '').trim() || decryptSecret(row?.encrypted_api_key);
      if (!apiKey) return { ok: false, message: `Chave ${provider} nao configurada` };
      if (provider === 'openai') {
        const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
        return { ok: r.ok, status: r.status };
      }
      if (provider === 'anthropic') {
        const modelosRes = await fetch('https://api.anthropic.com/v1/models?limit=100', {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        });
        const modelosData = await lerJsonOuTexto(modelosRes) as any;
        if (!modelosRes.ok) return { ok: false, status: modelosRes.status, message: JSON.stringify(modelosData) };

        const availableModels = Array.isArray(modelosData?.data)
          ? modelosData.data.map((item: any) => item.id).filter(Boolean)
          : [];
        const requestedModel = String(body?.defaultModel ?? '').trim();
        const selectedModel = escolherModeloAnthropic(availableModels, requestedModel);

        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
        });
        const data = await lerJsonOuTexto(r);
        return {
          ok: r.ok,
          status: r.status,
          resolvedModel: selectedModel,
          availableModels: availableModels.slice(0, 20),
          message: r.ok ? undefined : JSON.stringify(data),
        };
      }
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      return { ok: r.ok, status: r.status };
    });
  }

  private salvarProvider(providerParam: string, body: any, req: any) {
    const provider = normalizarProvider(providerParam);
    const defaults = PROVIDERS[provider];
    return comTenant(req.user.tenantId, async (q) => {
      const apiKey = body.apiKey?.trim();
      const encrypted = apiKey ? encryptSecret(apiKey) : null;
      const keyLast4 = apiKey ? apiKey.slice(-4) : null;
      const r = await q(
        `insert into ai_provider_settings (
           tenant_id, provider, nome, encrypted_api_key, key_last4, default_model, embedding_model,
           input_cost_per_1m, output_cost_per_1m, embedding_cost_per_1m, currency, ativo
         )
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
         on conflict (tenant_id, provider) do update
           set encrypted_api_key=coalesce(excluded.encrypted_api_key, ai_provider_settings.encrypted_api_key),
               key_last4=coalesce(excluded.key_last4, ai_provider_settings.key_last4),
               default_model=excluded.default_model,
               embedding_model=excluded.embedding_model,
               input_cost_per_1m=excluded.input_cost_per_1m,
               output_cost_per_1m=excluded.output_cost_per_1m,
               embedding_cost_per_1m=excluded.embedding_cost_per_1m,
               currency=excluded.currency,
               ativo=true,
               atualizado_em=now()
         returning id, provider, nome, key_last4, default_model, embedding_model,
                   input_cost_per_1m, output_cost_per_1m, embedding_cost_per_1m, currency, ativo, atualizado_em`,
        [
          req.user.tenantId,
          provider,
          defaults.nome,
          encrypted,
          keyLast4,
          body.defaultModel || defaults.defaultModel,
          body.embeddingModel ?? defaults.embeddingModel,
          Number(body.inputCostPer1M ?? 0),
          Number(body.outputCostPer1M ?? 0),
          Number(body.embeddingCostPer1M ?? 0),
          body.currency || 'USD',
        ],
      );
      return r.rows[0];
    });
  }
}
