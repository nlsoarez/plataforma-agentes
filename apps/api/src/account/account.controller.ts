import { BadRequestException, Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';
import { hashSenha, verificarSenha } from '../auth/senha';
import { getSubscriptionAccess } from '../billing/entitlements';

type ProfileInput = {
  nome?: string;
  telefone?: string;
  cargo?: string;
  avatarUrl?: string;
  timezone?: string;
  locale?: string;
  preferencias?: {
    emailNotifications?: boolean;
    productUpdates?: boolean;
    compactMode?: boolean;
  };
};

type SupportTicketInput = {
  topic?: string;
  description?: string;
};

const SUPPORT_TOPICS = new Map([
  ['whatsapp', 'WhatsApp, QR Code ou instância'],
  ['agent', 'Agente de IA não responde'],
  ['inbox', 'Mensagens não chegam no Inbox'],
  ['billing', 'Assinatura, pagamento ou acesso'],
  ['calendar', 'Google Calendar ou integrações'],
  ['profile', 'Perfil, senha ou acesso'],
  ['bug', 'Erro ou tela quebrada'],
  ['other', 'Outra dúvida'],
]);

@Controller('account')
@UseGuards(AuthGuard)
export class AccountController {
  @Get()
  async me(@Req() req: any) {
    const [profile, access] = await Promise.all([
      comTenant(req.user.tenantId, async (q) => {
        const r = await q(
          `select u.id, u.nome, u.email, u.papel, u.status, u.avatar_url, u.auth_provider,
                  u.telefone, u.cargo, u.timezone, u.locale, u.preferencias,
                  u.email_verified_at, u.ultimo_login_em, u.criado_em, u.atualizado_em,
                  d.nome as departamento_nome,
                  t.nome as tenant_nome, t.dominio as tenant_dominio
             from usuarios u
             join tenants t on t.id=u.tenant_id
             left join departamentos d on d.id=u.departamento_id
            where u.id=$1
            limit 1`,
          [req.user.sub],
        );
        return r.rows[0] ?? null;
      }),
      getSubscriptionAccess(req.user.tenantId),
    ]);

    if (!profile) throw new BadRequestException('usuario nao encontrado');

    return {
      usuario: profile,
      assinatura: {
        acesso: access.state,
        pode_usar: access.canUsePaidFeatures,
        assinatura: access.subscription,
        plano: access.plan,
      },
    };
  }

  @Patch('profile')
  atualizarPerfil(@Body() body: ProfileInput, @Req() req: any) {
    const preferencias = sanitizePreferences(body.preferencias);
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `update usuarios
            set nome=$2,
                telefone=$3,
                cargo=$4,
                avatar_url=$5,
                timezone=$6,
                locale=$7,
                preferencias=coalesce(preferencias,'{}'::jsonb) || $8::jsonb,
                atualizado_em=now()
          where id=$1
          returning id, nome, email, papel, status, avatar_url, auth_provider,
                    telefone, cargo, timezone, locale, preferencias,
                    email_verified_at, ultimo_login_em, criado_em, atualizado_em`,
        [
          req.user.sub,
          clean(body.nome),
          clean(body.telefone),
          clean(body.cargo),
          cleanAvatar(body.avatarUrl),
          clean(body.timezone) || 'America/Sao_Paulo',
          clean(body.locale) || 'pt-BR',
          JSON.stringify(preferencias),
        ],
      );
      return r.rows[0];
    });
  }

  @Patch('password')
  async alterarSenha(@Body() body: { senhaAtual?: string; novaSenha?: string }, @Req() req: any) {
    const novaSenha = String(body.novaSenha || '');
    if (novaSenha.length < 12) throw new BadRequestException('nova senha deve ter pelo menos 12 caracteres');

    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select id, senha_hash, auth_provider
           from usuarios
          where id=$1
          limit 1`,
        [req.user.sub],
      );
      const user = r.rows[0];
      if (!user) throw new BadRequestException('usuario nao encontrado');

      const provider = String(user.auth_provider || 'password');
      const precisaSenhaAtual = provider.includes('password');
      if (precisaSenhaAtual && !verificarSenha(String(body.senhaAtual || ''), user.senha_hash)) {
        throw new BadRequestException('senha atual invalida');
      }

      await q(
        `update usuarios
            set senha_hash=$2,
                auth_provider=case
                  when auth_provider='google' then 'password_google'
                  else auth_provider
                end,
                ultimo_reset_senha_em=now(),
                atualizado_em=now()
          where id=$1`,
        [req.user.sub, hashSenha(novaSenha)],
      );
      return { ok: true };
    });
  }

  @Post('support-ticket')
  async abrirChamado(@Body() body: SupportTicketInput, @Req() req: any) {
    const topic = String(body.topic || '').trim();
    const subject = SUPPORT_TOPICS.get(topic);
    if (!subject) throw new BadRequestException('assunto do chamado invalido');

    const description = String(body.description || '').trim();
    if (description.length < 10) throw new BadRequestException('descreva a duvida com pelo menos 10 caracteres');
    if (description.length > 2000) throw new BadRequestException('descricao do chamado deve ter no maximo 2000 caracteres');

    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `insert into support_tickets (tenant_id, usuario_id, topic, subject, description, metadata)
         values ($1, $2, $3, $4, $5, $6::jsonb)
         returning id, status, created_at`,
        [
          req.user.tenantId,
          req.user.sub,
          topic,
          subject,
          description,
          JSON.stringify({
            email: req.user.email || null,
            source: 'account_settings',
          }),
        ],
      );

      return {
        ok: true,
        chamado: {
          ...r.rows[0],
          subject,
        },
      };
    });
  }
}

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function cleanAvatar(value: unknown): string | null {
  const text = clean(value);
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(text) && text.length <= 180_000) return text;
  throw new BadRequestException('foto deve ser uma URL http/https ou uma imagem enviada pelo perfil');
}

function sanitizePreferences(value: ProfileInput['preferencias']) {
  return {
    emailNotifications: value?.emailNotifications !== false,
    productUpdates: value?.productUpdates !== false,
    compactMode: value?.compactMode === true,
  };
}
