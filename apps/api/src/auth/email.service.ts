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
    const from = process.env.EMAIL_FROM || 'Attende <no-reply@attende.app>';
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
  const footer = params.footer || 'Se voce nao solicitou esta acao, ignore este e-mail.';
  return `
    <div style="font-family:Arial,sans-serif;background:#f6f7f9;padding:32px;color:#071127">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6ebf1;border-radius:12px;padding:28px">
        <h1 style="margin:0 0 12px;font-size:24px">${escapeHtml(params.title)}</h1>
        <p style="font-size:15px;line-height:1.5;color:#344054">${escapeHtml(params.intro)}</p>
        <p style="margin:28px 0">
          <a href="${escapeHtml(params.url)}" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">
            ${escapeHtml(params.ctaLabel)}
          </a>
        </p>
        <p style="font-size:12px;line-height:1.5;color:#667085">Se o botao nao abrir, copie este link:<br>${escapeHtml(params.url)}</p>
        <p style="font-size:12px;color:#98a2b3;margin-top:28px">${escapeHtml(footer)}</p>
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
