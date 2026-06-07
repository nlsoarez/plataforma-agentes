import { BadRequestException, Injectable } from '@nestjs/common';
import { comTenant } from '@plataforma/db';

@Injectable()
export class OnboardingService {
  private base = (process.env.EVOLUTION_API_URL ?? '').replace(/\/+$/, '');
  private apikey = process.env.EVOLUTION_API_KEY ?? '';

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

  private webhookConfig(url: string) {
    return {
      enabled: true,
      url,
      headers: {},
      webhookByEvents: false,
      webhookBase64: true,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
    };
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

  private extractQr(data: any) {
    const qr =
      data?.base64 ??
      data?.qrcode?.base64 ??
      data?.qrcode?.qrCode ??
      data?.qrcode?.code ??
      data?.qrCode ??
      null;

    return {
      qr,
      qrCode: data?.code ?? data?.qrcode?.code ?? null,
      pairingCode: data?.pairingCode ?? data?.qrcode?.pairingCode ?? null,
    };
  }

  private async connect(instancia: string) {
    const r = await fetch(`${this.base}/instance/connect/${instancia}`, { headers: this.headers() });
    const data = await this.readJson(r);
    if (!r.ok) {
      throw new BadRequestException(`buscar QR falhou: ${JSON.stringify(data)}`);
    }
    return this.extractQr(data);
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
    const instancia = `t${tenantId.slice(0, 8)}_${cleanNome}`.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 60);
    const webhookUrl = this.webhookUrl();
    const r = await fetch(`${this.base}/instance/create`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        instanceName: instancia,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook: webhookUrl ? this.webhookConfig(webhookUrl) : undefined,
      }),
    });
    const data = await this.readJson(r);
    if (!r.ok) {
      const message = JSON.stringify(data).toLowerCase();
      if (message.includes('exist') || message.includes('already') || message.includes('existe')) {
        await this.salvarProjeto(tenantId, cleanNome, instancia, projetoId);
        return { instancia, warning: webhookUrl ? undefined : 'API_PUBLIC_URL nao configurada; o QR pode conectar, mas mensagens reais nao chegam no sistema.', ...(await this.connect(instancia)) };
      }

      throw new BadRequestException(`criar instancia falhou: ${JSON.stringify(data)}`);
    }

    await this.salvarProjeto(tenantId, cleanNome, instancia, projetoId);

    const qr = this.extractQr(data);
    if (qr.qr || qr.qrCode || qr.pairingCode) {
      return { instancia, warning: webhookUrl ? undefined : 'API_PUBLIC_URL nao configurada; o QR pode conectar, mas mensagens reais nao chegam no sistema.', ...qr };
    }

    return { instancia, warning: webhookUrl ? undefined : 'API_PUBLIC_URL nao configurada; o QR pode conectar, mas mensagens reais nao chegam no sistema.', ...(await this.connect(instancia)) };
  }

  async qr(instancia: string) {
    this.assertConfig();
    return this.connect(instancia);
  }

  async status(tenantId: string, instancia: string) {
    this.assertConfig();

    const r = await fetch(`${this.base}/instance/connectionState/${instancia}`, { headers: this.headers() });
    const data = await this.readJson(r);
    if (!r.ok) {
      throw new BadRequestException(`status instancia falhou: ${JSON.stringify(data)}`);
    }

    const state = this.normalizarEstado(data?.instance?.state ?? data?.state ?? data?.status ?? 'unknown');
    if (state === 'open') {
      await comTenant(tenantId, (q) => q(
        `update projetos
         set status='ativo', connection_state=$2, last_connection_update=now(), session_meta=$3, last_error=null, last_error_at=null
         where phone_number_id=$1`,
        [instancia, state, JSON.stringify(data)],
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
    return { state };
  }
}
