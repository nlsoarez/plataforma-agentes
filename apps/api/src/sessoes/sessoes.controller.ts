import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';

function normalizarEstado(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['open', 'opened', 'connected', 'conectado'].includes(raw)) return 'open';
  if (['close', 'closed', 'disconnected', 'disconnect', 'desconectado'].includes(raw)) return 'close';
  if (['connecting', 'pairing', 'qr', 'qrcode'].includes(raw)) return 'connecting';
  return raw || 'unknown';
}

async function readJson(r: Response) {
  const text = await r.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

@Controller('sessoes')
@UseGuards(AuthGuard)
export class SessoesController {
  private base = (process.env.EVOLUTION_API_URL ?? '').replace(/\/+$/, '');
  private apikey = process.env.EVOLUTION_API_KEY ?? '';
  private headers() { return { apikey: this.apikey, 'Content-Type': 'application/json' }; }
  private webhookUrl() {
    const publicUrl = (process.env.API_PUBLIC_URL ?? '').replace(/\/+$/, '');
    return publicUrl ? `${publicUrl}/webhook/evolution` : '';
  }
  private webhookConfig(url: string) {
    return {
      webhook: {
        enabled: true,
        url,
        headers: {},
        webhookByEvents: false,
        webhookBase64: true,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      },
    };
  }

  @Get()
  listar(@Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select id, nome, phone_number_id, status, transporte_driver, connection_state,
                last_connection_update, session_meta, last_error, last_error_at, criado_em
         from projetos
         order by criado_em desc`,
      );
      return r.rows;
    });
  }

  @Get('diagnostico')
  diagnostico() {
    return {
      evolutionApiUrl: Boolean(this.base),
      evolutionApiKey: Boolean(this.apikey),
      apiPublicUrl: Boolean(process.env.API_PUBLIC_URL),
      redisUrl: Boolean(process.env.REDIS_URL),
      webhookUrl: process.env.API_PUBLIC_URL ? `${String(process.env.API_PUBLIC_URL).replace(/\/+$/, '')}/webhook/evolution` : null,
    };
  }

  @Get('eventos')
  eventos(@Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select e.id, e.projeto_id, p.nome as projeto_nome, e.origem, e.nivel, e.evento,
                e.mensagem, e.payload, e.criado_em
         from eventos_operacionais e
         left join projetos p on p.id=e.projeto_id
         order by e.criado_em desc
         limit 50`,
      );
      return r.rows;
    });
  }

  @Post(':id/sincronizar')
  sincronizar(@Param('id') id: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const p = (await q(`select phone_number_id from projetos where id=$1`, [id])).rows[0];
      if (!p?.phone_number_id) return { ok: false, message: 'Projeto sem instancia' };
      if (!this.base || !this.apikey) {
        const message = 'Evolution API nao configurada no .env';
        await q(`update projetos set last_error=$2, last_error_at=now() where id=$1`, [id, message]);
        return { ok: false, message };
      }

      try {
        const webhookUrl = this.webhookUrl();
        let webhookOk: boolean | null = null;
        if (webhookUrl) {
          const webhookRes = await fetch(`${this.base}/webhook/set/${p.phone_number_id}`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(this.webhookConfig(webhookUrl)),
          });
          webhookOk = webhookRes.ok;
          if (!webhookRes.ok) {
            await q(
              `update projetos set last_error=$2, last_error_at=now() where id=$1`,
              [id, `Falha ao configurar webhook Evolution: ${webhookRes.status}`],
            );
          }
        }

        const r = await fetch(`${this.base}/instance/connectionState/${p.phone_number_id}`, { headers: this.headers() });
        const data = await readJson(r);
        if (!r.ok) {
          const message = `Evolution connectionState ${r.status}: ${JSON.stringify(data)}`;
          await q(`update projetos set last_error=$2, last_error_at=now(), session_meta=$3 where id=$1`, [id, message, JSON.stringify(data)]);
          return { ok: false, message, raw: data };
        }

        const state = normalizarEstado(data?.instance?.state ?? data?.state ?? data?.status ?? 'unknown');
        await q(
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
           where id=$1`,
          [id, state, JSON.stringify(data)],
        );
        return { ok: true, state, webhookOk, raw: data };
      } catch (err: any) {
        const message = err?.message || 'Falha ao consultar Evolution API';
        await q(`update projetos set last_error=$2, last_error_at=now() where id=$1`, [id, message]);
        return { ok: false, message };
      }
    });
  }

  @Post(':id/logout')
  async logout(@Param('id') id: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const p = (await q(`select phone_number_id from projetos where id=$1`, [id])).rows[0];
      if (!p?.phone_number_id) return { ok: false, message: 'Projeto sem instancia' };
      if (!this.base || !this.apikey) return { ok: false, message: 'Evolution API nao configurada no .env' };

      const r = await fetch(`${this.base}/instance/logout/${p.phone_number_id}`, { method: 'DELETE', headers: this.headers() });
      await q(
        `update projetos
         set connection_state='close', status='onboarding', last_connection_update=now()
         where id=$1`,
        [id],
      );
      return { ok: r.ok, status: r.status };
    });
  }

  @Delete(':id')
  async remover(@Param('id') id: string, @Req() req: any) {
    return comTenant(req.user.tenantId, async (q) => {
      const p = (await q(`select phone_number_id from projetos where id=$1`, [id])).rows[0];
      if (p?.phone_number_id && this.base && this.apikey) {
        await fetch(`${this.base}/instance/delete/${p.phone_number_id}`, { method: 'DELETE', headers: this.headers() }).catch(() => null);
      }
      await q(`delete from projetos where id=$1`, [id]);
      return { ok: true };
    });
  }
}
