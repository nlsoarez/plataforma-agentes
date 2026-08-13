import { BadRequestException, Injectable } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { assertLimit } from '../billing/entitlements';
import {
  evolutionCreatePayload,
  evolutionWebhookConfig,
  extractEvolutionQr,
} from './evolution-onboarding';

@Injectable()
export class OnboardingService {
  private base = (process.env.EVOLUTION_API_URL ?? '').replace(/\/+$/, '');
  private apikey = process.env.EVOLUTION_API_KEY ?? '';
  private webhookGarantido = new Set<string>();

  private headers() {
    return { apikey: this.apikey, 'Content-Type': 'application/json' };
  }

  private assertConfig() {
    if (!this.base) throw new BadRequestException('EVOLUTION_API_URL nao configurada');
    if (!this.apikey) throw new BadRequestException('EVOLUTION_API_KEY nao configurada');
  }

  private webhookUrl() {
    const publicUrl = (process.env.API_PUBLIC_URL ?? '').replace(/\/+$/, '');
    return publicUrl ? `${publicUrl}/webhook/evolution` : '';
  }

  private normalizarEstado(value: unknown): string {
    const raw = String(value ?? '').trim().toLowerCase();
    if (['open', 'opened', 'connected', 'conectado'].includes(raw)) return 'open';
    if (['close', 'closed', 'disconnected', 'disconnect', 'desconectado'].includes(raw)) return 'close';
    if (['connecting', 'pairing', 'qr', 'qrcode'].includes(raw)) return 'connecting';
    return raw || 'unknown';
  }

  private async readJson(r: Response) {
    const text = await r.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  private async connect(instancia: string) {
    const r = await fetch(`${this.base}/instance/connect/${encodeURIComponent(instancia)}`, { headers: this.headers() });
    const data = await this.readJson(r);
    if (!r.ok || data?.error === true) {
      throw new BadRequestException(`buscar QR falhou: ${JSON.stringify(data)}`);
    }
    return extractEvolutionQr(data);
  }

  private async garantirWebhook(instancia: string) {
    const url = this.webhookUrl();
    if (!url) {
      return { ok: false, message: 'API_PUBLIC_URL nao configurada' };
    }

    const r = await fetch(`${this.base}/webhook/set/${encodeURIComponent(instancia)}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ webhook: evolutionWebhookConfig(url, this.apikey) }),
    });
    const data = await this.readJson(r);
    if (!r.ok) {
      return { ok: false, message: `Falha ao configurar webhook Evolution: ${r.status}`, raw: data };
    }

    this.webhookGarantido.add(instancia);
    return { ok: true };
  }

  private async garantirWebhookUmaVez(instancia: string) {
    if (this.webhookGarantido.has(instancia)) return { ok: true, cached: true };
    return this.garantirWebhook(instancia);
  }

  private async assertInstanciaDoTenant(tenantId: string, instancia: string) {
    const existe = await comTenant(tenantId, async (q) => {
      const r = await q(`select id from projetos where phone_number_id=$1 limit 1`, [instancia]);
      return Boolean(r.rows[0]);
    });
    if (!existe) throw new BadRequestException('conexao nao encontrada para este cliente');
  }

  private async salvarProjeto(tenantId: string, nome: string, instancia: string, projetoId?: string) {
    await comTenant(tenantId, async (q) => {
      if (projetoId) {
        await q(
          `update projetos
           set nome=coalesce(nullif($2,''), nome),
               phone_number_id=$3,
               status='onboarding',
               transporte_driver='evolution',
               connection_state='connecting',
               last_connection_update=now()
           where id=$1`,
          [projetoId, nome, instancia],
        );
        return;
      }
      await q(`insert into projetos (tenant_id, nome, phone_number_id, status, transporte_driver)
               values ($1,$2,$3,'onboarding','evolution')
               on conflict (phone_number_id) do update
                 set nome=excluded.nome,
                     transporte_driver='evolution',
                     connection_state='connecting',
                     last_connection_update=now()`,
        [tenantId, nome, instancia]);
    });
  }

  async criarInstancia(tenantId: string, nome: string, projetoId?: string) {
    this.assertConfig();

    const cleanNome = (nome || 'principal').trim() || 'principal';
    const slot = await comTenant(tenantId, async (q) => {
      if (!projetoId) return { project: true, whatsapp: true };
      const p = (await q(`select phone_number_id from projetos where id=$1`, [projetoId])).rows[0];
      if (!p) throw new BadRequestException('projeto nao encontrado para este cliente');
      if (p.phone_number_id) throw new BadRequestException('este projeto ja possui uma conexao WhatsApp');
      return { project: false, whatsapp: true };
    });
    if (slot.project) await assertLimit(tenantId, 'projects', 1);
    if (slot.whatsapp) await assertLimit(tenantId, 'whatsapp_connections', 1);

    const instancia = `t${tenantId.slice(0, 8)}_${cleanNome}`.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 60);
    const webhookUrl = this.webhookUrl();
    const r = await fetch(`${this.base}/instance/create`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(evolutionCreatePayload(instancia, webhookUrl, this.apikey)),
    });
    const data = await this.readJson(r);
    if (!r.ok) {
      const message = JSON.stringify(data).toLowerCase();
      if (message.includes('exist') || message.includes('already') || message.includes('existe')) {
        await this.salvarProjeto(tenantId, cleanNome, instancia, projetoId);
        const webhook = await this.garantirWebhook(instancia);
        if (!webhook.ok) {
          return {
            instancia,
            warning: webhook.message,
            ...(await this.connect(instancia)),
          };
        }
        return { instancia, warning: webhookUrl ? undefined : 'API_PUBLIC_URL nao configurada; o QR pode conectar, mas mensagens reais nao chegam no sistema.', ...(await this.connect(instancia)) };
      }

      throw new BadRequestException(`criar instancia falhou: ${JSON.stringify(data)}`);
    }

    await this.salvarProjeto(tenantId, cleanNome, instancia, projetoId);
    const webhook = await this.garantirWebhook(instancia);

    const qr = extractEvolutionQr(data);
    if (qr.qr || qr.qrCode || qr.pairingCode) {
      return { instancia, warning: webhook.ok ? undefined : webhook.message, ...qr };
    }

    return { instancia, warning: webhook.ok ? undefined : webhook.message, ...(await this.connect(instancia)) };
  }

  async qr(tenantId: string, instancia: string) {
    this.assertConfig();
    await this.assertInstanciaDoTenant(tenantId, instancia);
    return this.connect(instancia);
  }

  async status(tenantId: string, instancia: string) {
    this.assertConfig();
    await this.assertInstanciaDoTenant(tenantId, instancia);

    const r = await fetch(`${this.base}/instance/connectionState/${encodeURIComponent(instancia)}`, { headers: this.headers() });
    const data = await this.readJson(r);
    if (!r.ok) {
      throw new BadRequestException(`status instancia falhou: ${JSON.stringify(data)}`);
    }

    const state = this.normalizarEstado(data?.instance?.state ?? data?.state ?? data?.status ?? 'unknown');
    const webhook = state === 'open' ? await this.garantirWebhookUmaVez(instancia) : { ok: true };
    if (state === 'open') {
      await comTenant(tenantId, (q) => q(
        `update projetos
         set status='ativo',
             connection_state=$2,
             last_connection_update=now(),
             session_meta=$3,
             last_error=case when $4::boolean then null else $5 end,
             last_error_at=case when $4::boolean then null else now() end
         where phone_number_id=$1`,
        [instancia, state, JSON.stringify(data), webhook.ok, (webhook as any).message ?? null],
      ));
    } else if (state === 'close') {
      await comTenant(tenantId, (q) => q(
        `update projetos set status='onboarding', connection_state=$2, last_connection_update=now(), session_meta=$3 where phone_number_id=$1`,
        [instancia, state, JSON.stringify(data)],
      ));
    } else {
      await comTenant(tenantId, (q) => q(
        `update projetos set connection_state=$2, last_connection_update=now(), session_meta=$3 where phone_number_id=$1`,
        [instancia, state, JSON.stringify(data)],
      ));
    }
    return { state, webhookOk: webhook.ok };
  }
}
