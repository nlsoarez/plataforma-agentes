import { Injectable, BadRequestException } from '@nestjs/common';
import { comTenant } from '@plataforma/db';

@Injectable()
export class OnboardingService {
  private base = process.env.EVOLUTION_API_URL ?? '';
  private apikey = process.env.EVOLUTION_API_KEY ?? '';
  private headers() { return { apikey: this.apikey, 'Content-Type': 'application/json' }; }

  // Cria uma instância no Evolution (nome único por tenant) e o projeto.
  async criarInstancia(tenantId: string, nome: string) {
    const instancia = `t${tenantId.slice(0, 8)}_${nome}`.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 60);
    const r = await fetch(`${this.base}/instance/create`, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({
        instanceName: instancia,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook: {
          url: `${process.env.API_PUBLIC_URL ?? ''}/webhook/evolution`,
          base64: true,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
        },
      }),
    });
    if (!r.ok) throw new BadRequestException(`criar instancia falhou: ${await r.text()}`);
    const data = (await r.json()) as any;

    await comTenant(tenantId, (q) =>
      q(`insert into projetos (tenant_id, nome, phone_number_id, status, transporte_driver)
         values ($1,$2,$3,'onboarding','evolution')
         on conflict (phone_number_id) do update set nome=excluded.nome`,
        [tenantId, nome, instancia]));

    return { instancia, qr: data?.qrcode?.base64 ?? null };
  }

  // Recupera/renova o QR de conexão.
  async qr(instancia: string) {
    const r = await fetch(`${this.base}/instance/connect/${instancia}`, { headers: this.headers() });
    const d = (await r.json()) as any;
    return { qr: d?.base64 ?? d?.qrcode?.base64 ?? null };
  }

  // Estado da conexão; ao conectar ('open'), ativa o projeto.
  async status(tenantId: string, instancia: string) {
    const r = await fetch(`${this.base}/instance/connectionState/${instancia}`, { headers: this.headers() });
    const d = (await r.json()) as any;
    const state = d?.instance?.state ?? d?.state ?? 'unknown';
    if (state === 'open') {
      await comTenant(tenantId, (q) => q(`update projetos set status='ativo' where phone_number_id=$1`, [instancia]));
    }
    return { state };
  }
}
