import { Injectable } from '@nestjs/common';

export type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

@Injectable()
export class EmailService {
  async send(input: EmailInput): Promise<{ ok: boolean; provider: string; skipped?: boolean; error?: string }> {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) return this.sendResend(resendKey, input);

    return {
      ok: false,
      provider: 'none',
      skipped: true,
      error: 'RESEND_API_KEY nao configurada',
    };
  }

  private async sendResend(apiKey: string, input: EmailInput): Promise<{ ok: boolean; provider: string; error?: string }> {
    const from = process.env.EMAIL_FROM || 'Comunora <no-reply@comunora.com.br>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text || stripHtml(input.html),
      }),
    });

    if (response.ok) return { ok: true, provider: 'resend' };
    const text = await response.text().catch(() => '');
    return { ok: false, provider: 'resend', error: text || `HTTP ${response.status}` };
  }
}

export function actionEmail(params: {
  title: string;
  intro: string;
  ctaLabel: string;
  url: string;
  footer?: string;
}) {
  const brandName = process.env.PUBLIC_BRAND_NAME || process.env.NEXT_PUBLIC_BRAND_NAME || 'Comunora';
  const footer = params.footer || 'Se voce nao solicitou esta acao, ignore este e-mail.';
  return `
    <div style="font-family:Poppins,Inter,Arial,sans-serif;background:#F8FAFC;padding:32px;color:#0B132B">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #DDE3EA;border-radius:16px;padding:28px">
        <div style="font-weight:700;font-size:18px;margin:0 0 20px;color:#0B132B">${escapeHtml(brandName)}</div>
        <h1 style="margin:0 0 12px;font-size:24px;color:#0B132B">${escapeHtml(params.title)}</h1>
        <p style="font-size:15px;line-height:1.5;color:#526070">${escapeHtml(params.intro)}</p>
        <p style="margin:28px 0">
          <a href="${escapeHtml(params.url)}" style="display:inline-block;background:#1565FF;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">
            ${escapeHtml(params.ctaLabel)}
          </a>
        </p>
        <p style="font-size:12px;line-height:1.5;color:#526070">Se o botao nao abrir, copie este link:<br>${escapeHtml(params.url)}</p>
        <p style="font-size:12px;color:#8A95A3;margin-top:28px">${escapeHtml(footer)}</p>
      </div>
    </div>
  `;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
