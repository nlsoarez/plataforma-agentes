import { Body, Controller, Headers, HttpStatus, Param, Post, Res, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EvolutionDriver } from '@plataforma/transport';
import { comTenant, resolverProjetoPorNumero } from '@plataforma/db';
import { sharedSecretMatches } from './webhook-auth';

const fila = new Queue('eventos-whatsapp', { connection: { url: process.env.REDIS_URL } as any });
const driver = new EvolutionDriver();

function extrairInstancia(body: any): string | null {
  if (typeof body?.instance === 'string') return body.instance;
  return body?.instance?.instanceName
    ?? body?.instance?.name
    ?? body?.data?.instanceName
    ?? body?.data?.instance
    ?? body?.data?.instanceId
    ?? null;
}

function normalizarEstado(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['open', 'opened', 'connected', 'conectado'].includes(raw)) return 'open';
  if (['close', 'closed', 'disconnected', 'disconnect', 'desconectado'].includes(raw)) return 'close';
  if (['connecting', 'pairing', 'qr', 'qrcode'].includes(raw)) return 'connecting';
  return raw || 'unknown';
}

function isEstadoConexao(state: string | null): state is 'open' | 'close' | 'connecting' {
  return state === 'open' || state === 'close' || state === 'connecting';
}

function extrairEstado(body: any): string | null {
  const value =
    body?.data?.state ??
    body?.data?.connection ??
    body?.data?.status ??
    body?.instance?.state ??
    body?.state ??
    body?.status ??
    null;
  return value == null ? null : normalizarEstado(value);
}

async function buscarProjetoPorInstancia(instancia: string) {
  const projeto = await resolverProjetoPorNumero(instancia);
  return projeto
    ? { id: projeto.projeto_id, tenant_id: projeto.tenant_id }
    : undefined;
}

async function logarWebhook(
  instancia: string | null,
  nivel: 'info' | 'warn' | 'error',
  evento: string,
  mensagem: string,
  payload: unknown,
) {
  if (!instancia) return;
  try {
    const projeto = await buscarProjetoPorInstancia(instancia);
    if (!projeto) return;
    await comTenant(projeto.tenant_id, (q) => q(
      `insert into eventos_operacionais (tenant_id, projeto_id, origem, nivel, evento, mensagem, payload)
       values ($1,$2,'evolution',$3,$4,$5,$6)`,
      [projeto.tenant_id, projeto.id, nivel, evento, mensagem, JSON.stringify(payload ?? {})],
    ));
  } catch (err: any) {
    console.warn('[webhook] falha ao registrar evento operacional', err?.message);
  }
}

@Controller('webhook')
export class EvolutionWebhookController {
  @Post('evolution')
  async receber(@Body() body: any, @Headers() headers: Record<string, string>, @Res() res: any) {
    return this.processar(body, headers, res);
  }

  @Post('evolution/:eventPath')
  async receberPorEvento(
    @Param('eventPath') eventPath: string,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
    @Res() res: any,
  ) {
    const event = body?.event ?? String(eventPath || '').toUpperCase().replace(/-/g, '_');
    return this.processar({ ...body, event }, headers, res, eventPath);
  }

  private async processar(body: any, headers: Record<string, string>, res: any, eventPath?: string) {
    const apikey = headers?.apikey ?? headers?.['x-api-key'];
    if (!process.env.EVOLUTION_API_KEY) {
      throw new ServiceUnavailableException('webhook Evolution nao configurado');
    }
    if (!sharedSecretMatches(apikey, process.env.EVOLUTION_API_KEY)) {
      return res.sendStatus(HttpStatus.UNAUTHORIZED);
    }

    const instancia = extrairInstancia(body);
    await this.atualizarConexao(body);

    const eventos = driver.parseWebhook(body);
    try {
      for (const ev of eventos) {
        await fila.add('evento', ev, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 2000,
          removeOnFail: 5000,
        });
      }
    } catch (err: any) {
      await logarWebhook(instancia, 'error', 'WEBHOOK_QUEUE_FAILED', err?.message || 'Falha ao publicar evento na fila', {
        event: body?.event,
        eventPath,
        parsedEvents: eventos.length,
      });
      throw err;
    }

    await logarWebhook(
      instancia,
      eventos.length ? 'info' : 'warn',
      'WEBHOOK_RECEIVED',
      `Webhook recebido; eventos normalizados: ${eventos.length}`,
      { event: body?.event, eventPath, parsedEvents: eventos.length },
    );

    return res.sendStatus(HttpStatus.OK);
  }

  private async atualizarConexao(body: any) {
    const event = String(body?.event ?? '').toUpperCase();
    const instancia = extrairInstancia(body);
    const state = extrairEstado(body);

    if (!instancia || !state) return;
    if (!event.includes('CONNECTION') && !isEstadoConexao(state)) return;

    const projeto = await buscarProjetoPorInstancia(instancia);
    if (!projeto) return;
    await comTenant(projeto.tenant_id, (q) => q(
      `update projetos
       set connection_state=$2,
           status=case
             when $2='open' then 'ativo'
             when $2='close' then 'onboarding'
             else status
           end,
           last_connection_update=now(),
           session_meta=$3,
           last_error=case when $2='open' then null else last_error end,
           last_error_at=case when $2='open' then null else last_error_at end
       where tenant_id=$4 and id=$1`,
      [projeto.id, state || 'unknown', JSON.stringify(body), projeto.tenant_id],
    ));
  }
}
