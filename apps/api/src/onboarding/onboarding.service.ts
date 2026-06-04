import { Injectable, BadRequestException } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { guardarSegredo } from '@plataforma/shared';

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? 'v21.0'}`;

@Injectable()
export class OnboardingService {
  // Recebe o que o Embedded Signup devolve no front e finaliza o onboarding do número.
  async conectarWhatsapp(tenantId: string, dados: { code: string; wabaId: string; phoneNumberId: string }) {
    const { code, wabaId, phoneNumberId } = dados;
    if (!code || !wabaId || !phoneNumberId) throw new BadRequestException('code, wabaId e phoneNumberId obrigatorios');

    // 1. Troca o code pelo token de acesso (credenciais do SEU app Meta).
    const token = await this.trocarCodePorToken(code);

    // 2. Assina seu app aos webhooks da WABA do cliente.
    await this.assinarApp(wabaId, token);

    // 3. Registra o número na Cloud API.
    await this.registrarNumero(phoneNumberId, token);

    // 4. Guarda o token no cofre (NUNCA no banco). Ref previsível por número.
    await guardarSegredo(`WABA_TOKEN_${phoneNumberId}`, token);

    // 5. Cria o projeto no tenant da agência logada.
    await comTenant(tenantId, (q) =>
      q(`insert into projetos (tenant_id, nome, waba_id, phone_number_id, status, transporte_driver)
         values ($1,$2,$3,$4,'ativo','cloud_api')`,
        [tenantId, 'WhatsApp', wabaId, phoneNumberId]),
    );

    return { ok: true, phoneNumberId, wabaId };
  }

  private async trocarCodePorToken(code: string): Promise<string> {
    const url = `${GRAPH()}/oauth/access_token`
      + `?client_id=${process.env.META_APP_ID}`
      + `&client_secret=${process.env.META_APP_SECRET}`
      + `&code=${encodeURIComponent(code)}`;
    const r = await fetch(url);
    if (!r.ok) throw new BadRequestException(`troca de code falhou: ${await r.text()}`);
    return ((await r.json()) as any).access_token;
  }

  private async assinarApp(wabaId: string, token: string): Promise<void> {
    const r = await fetch(`${GRAPH()}/${wabaId}/subscribed_apps`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new BadRequestException(`assinar app falhou: ${await r.text()}`);
  }

  private async registrarNumero(phoneNumberId: string, token: string): Promise<void> {
    const r = await fetch(`${GRAPH()}/${phoneNumberId}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: process.env.META_REGISTER_PIN ?? '000000' }),
    });
    if (!r.ok) throw new BadRequestException(`registrar numero falhou: ${await r.text()}`);
  }
}
