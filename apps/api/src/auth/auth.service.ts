import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { comTenant, resolverTenantPorDominio } from '@plataforma/db';
import { createHash, randomBytes } from 'crypto';
import { hashSenha, verificarSenha } from './senha';
import { assinarEstadoGoogleOAuth, assinarToken, verificarEstadoGoogleOAuth } from './jwt';
import { ensureTrialSubscription } from '../billing/entitlements';
import { actionEmail, EmailService } from './email.service';

interface GoogleTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

@Injectable()
export class AuthService {
  constructor(private readonly emailService: EmailService) {}

  // Login é escopado pelo domínio da agência (white-label): o mesmo email pode
  // existir em agências diferentes, então o tenant vem do domínio, não do email.
  async login(dominio: string, email: string, senha: string): Promise<{ token: string }> {
    const tenant = dominio ? await resolverTenantPorDominio(dominio) : null;
    if (!tenant) throw new UnauthorizedException('agencia nao encontrada para este dominio');

    const user = await comTenant(tenant.id, async (q) => {
      const r = await q(`select id, senha_hash, papel, status, email_verified_at from usuarios where lower(email)=lower($1)`, [email]);
      return r.rows[0];
    });
    if (!user || user.status !== 'ativo' || !verificarSenha(senha, user.senha_hash)) {
      throw new UnauthorizedException('credenciais invalidas');
    }
    if (process.env.EMAIL_VERIFICATION_REQUIRED === 'true' && !user.email_verified_at) {
      throw new UnauthorizedException('email ainda nao verificado');
    }
    await ensureTrialSubscription(tenant.id);
    await this.audit(tenant.id, user.id, 'auth.login', 'usuario', user.id);
    return { token: assinarToken({ sub: user.id, tenantId: tenant.id, papel: user.papel }) };
  }

  async registrar(dominio: string, body: { nome?: string; email: string; senha: string; origem?: string }): Promise<{ token: string }> {
    const tenant = dominio ? await resolverTenantPorDominio(dominio) : null;
    if (!tenant) throw new UnauthorizedException('agencia nao encontrada para este dominio');

    const email = this.normalizarEmail(body.email);
    const nome = body.nome?.trim() || null;
    const senha = body.senha || '';
    if (!email) throw new BadRequestException('email invalido');
    if (senha.length < 8) throw new BadRequestException('senha deve ter pelo menos 8 caracteres');

    const user = await comTenant(tenant.id, async (q) => {
      const existente = await q(`select id from usuarios where lower(email)=lower($1) limit 1`, [email]);
      if (existente.rows[0]) throw new ConflictException('email ja cadastrado');

      const r = await q(
        `insert into usuarios (tenant_id, nome, email, senha_hash, papel, status, auth_provider, ultimo_login_em, email_verified_at)
         values ($1,$2,$3,$4,'cliente_final','ativo','password',now(),case when $5::boolean then null else now() end)
         returning id, papel`,
        [tenant.id, nome, email, hashSenha(senha), process.env.EMAIL_VERIFICATION_REQUIRED === 'true'],
      );
      return r.rows[0];
    });

    await ensureTrialSubscription(tenant.id);
    await this.audit(tenant.id, user.id, 'auth.register', 'usuario', user.id);
    if (process.env.EMAIL_VERIFICATION_REQUIRED === 'true') {
      await this.criarEnviarVerificacaoEmail(tenant.id, user.id, email, this.origemPermitida(body.origem, dominio));
    }
    return { token: assinarToken({ sub: user.id, tenantId: tenant.id, papel: user.papel }) };
  }

  async solicitarResetSenha(dominio: string, emailRaw: string, origem?: string): Promise<any> {
    const tenant = dominio ? await resolverTenantPorDominio(dominio) : null;
    if (!tenant) throw new UnauthorizedException('agencia nao encontrada para este dominio');
    const email = this.normalizarEmail(emailRaw);
    if (!email) throw new BadRequestException('email invalido');

    const token = this.base64Url(randomBytes(32));
    const tokenHash = this.hashToken(token);
    const user = await comTenant(tenant.id, async (q) => {
      const row = (await q(`select id from usuarios where lower(email)=lower($1) limit 1`, [email])).rows[0];
      if (!row?.id) return null;
      await q(
        `insert into auth_tokens (tenant_id, usuario_id, tipo, token_hash, expires_at)
         values ($1,$2,'password_reset',$3,now() + interval '30 minutes')`,
        [tenant.id, row.id, tokenHash],
      );
      return row;
    });
    if (user?.id) await this.audit(tenant.id, user.id, 'auth.password_reset_requested', 'usuario', user.id);

    const url = this.authLink('reset', token, this.origemPermitida(origem, dominio));
    const emailResult = user?.id
      ? await this.emailService.send({
        to: email,
        subject: 'Redefina sua senha',
        html: actionEmail({
          title: 'Redefinir senha',
          intro: 'Recebemos uma solicitacao para redefinir sua senha. O link expira em 30 minutos.',
          ctaLabel: 'Redefinir senha',
          url,
        }),
      })
      : { ok: true, provider: 'none' };

    return this.authLinkResponse(url, emailResult);
  }

  async redefinirSenha(dominio: string, token: string, senha: string): Promise<{ ok: true }> {
    const tenant = dominio ? await resolverTenantPorDominio(dominio) : null;
    if (!tenant) throw new UnauthorizedException('agencia nao encontrada para este dominio');
    if (!token) throw new BadRequestException('token obrigatorio');
    if (!senha || senha.length < 8) throw new BadRequestException('senha deve ter pelo menos 8 caracteres');

    const tokenHash = this.hashToken(token);
    const user = await comTenant(tenant.id, async (q) => {
      const row = (await q(
        `select id, usuario_id
           from auth_tokens
          where tenant_id=$1 and tipo='password_reset' and token_hash=$2
            and used_at is null and expires_at > now()
          limit 1`,
        [tenant.id, tokenHash],
      )).rows[0];
      if (!row?.usuario_id) throw new BadRequestException('token invalido ou expirado');

      await q(`update auth_tokens set used_at=now() where id=$1`, [row.id]);
      await q(
        `update usuarios
            set senha_hash=$2,
                ultimo_reset_senha_em=now(),
                auth_provider=case when auth_provider='google' then 'password_google' else auth_provider end
          where id=$1`,
        [row.usuario_id, hashSenha(senha)],
      );
      return { id: row.usuario_id };
    });
    await this.audit(tenant.id, user.id, 'auth.password_reset_completed', 'usuario', user.id);
    return { ok: true };
  }

  async solicitarVerificacaoEmail(dominio: string, emailRaw: string, origem?: string): Promise<any> {
    const tenant = dominio ? await resolverTenantPorDominio(dominio) : null;
    if (!tenant) throw new UnauthorizedException('agencia nao encontrada para este dominio');
    const email = this.normalizarEmail(emailRaw);
    if (!email) throw new BadRequestException('email invalido');

    const user = await comTenant(tenant.id, async (q) => {
      const row = (await q(`select id, email_verified_at from usuarios where lower(email)=lower($1) limit 1`, [email])).rows[0];
      return row;
    });
    let emailResult: any = { ok: true, provider: 'none' };
    let url = '';
    if (user?.id && !user.email_verified_at) {
      const sent = await this.criarEnviarVerificacaoEmail(tenant.id, user.id, email, this.origemPermitida(origem, dominio));
      emailResult = sent.emailResult;
      url = sent.url;
    }

    return this.authLinkResponse(url, emailResult);
  }

  async verificarEmail(dominio: string, token: string): Promise<{ ok: true }> {
    const tenant = dominio ? await resolverTenantPorDominio(dominio) : null;
    if (!tenant) throw new UnauthorizedException('agencia nao encontrada para este dominio');
    if (!token) throw new BadRequestException('token obrigatorio');

    const tokenHash = this.hashToken(token);
    const user = await comTenant(tenant.id, async (q) => {
      const row = (await q(
        `select id, usuario_id
           from auth_tokens
          where tenant_id=$1 and tipo='email_verify' and token_hash=$2
            and used_at is null and expires_at > now()
          limit 1`,
        [tenant.id, tokenHash],
      )).rows[0];
      if (!row?.usuario_id) throw new BadRequestException('token invalido ou expirado');

      await q(`update auth_tokens set used_at=now() where id=$1`, [row.id]);
      await q(`update usuarios set email_verified_at=coalesce(email_verified_at, now()) where id=$1`, [row.usuario_id]);
      return { id: row.usuario_id };
    });
    await this.audit(tenant.id, user.id, 'auth.email_verified', 'usuario', user.id);
    return { ok: true };
  }

  async googleStart(dominio: string, origem?: string): Promise<{ url: string }> {
    const tenant = dominio ? await resolverTenantPorDominio(dominio) : null;
    if (!tenant) throw new UnauthorizedException('agencia nao encontrada para este dominio');

    const clientId = this.googleClientId();
    const redirectUri = this.googleRedirectUri();
    const codeVerifier = this.base64Url(randomBytes(32));
    const codeChallenge = this.base64Url(createHash('sha256').update(codeVerifier).digest());
    const estado = assinarEstadoGoogleOAuth({
      typ: 'google_oauth',
      dominio,
      origem: this.origemPermitida(origem, dominio),
      codeVerifier,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: estado,
      prompt: 'select_account',
      access_type: 'online',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return { url: `${GOOGLE_AUTH_URL}?${params.toString()}` };
  }

  async googleCallback(code: string, state: string): Promise<{ token: string; origem: string }> {
    const estado = verificarEstadoGoogleOAuth(state);
    const tenant = await resolverTenantPorDominio(estado.dominio);
    if (!tenant) throw new UnauthorizedException('agencia nao encontrada para este dominio');

    const googleToken = await this.trocarCodigoGoogle(code, estado.codeVerifier);
    if (!googleToken.access_token) throw new UnauthorizedException('google nao retornou access_token');

    const perfil = await this.buscarPerfilGoogle(googleToken.access_token);
    const email = perfil.email?.trim().toLowerCase();
    const emailVerificado = perfil.email_verified === true || perfil.email_verified === 'true';
    if (!perfil.sub || !email || !emailVerificado) {
      throw new UnauthorizedException('conta google sem email verificado');
    }

    const user = await comTenant(tenant.id, async (q) => {
      const porGoogle = await q(
        `select id, email, papel from usuarios where google_sub=$1 limit 1`,
        [perfil.sub],
      );
      if (porGoogle.rows[0]) return porGoogle.rows[0];

      const porEmail = await q(
        `select id, email, papel, google_sub from usuarios where lower(email)=lower($1) limit 1`,
        [email],
      );
      const encontrado = porEmail.rows[0];
      if (!encontrado) {
        const criado = await q(
          `insert into usuarios
            (tenant_id, nome, email, senha_hash, papel, status, google_sub, avatar_url, auth_provider, ultimo_login_em, email_verified_at)
           values ($1,$2,$3,$4,'cliente_final','ativo',$5,$6,'google',now(),now())
           returning id, email, papel`,
          [tenant.id, perfil.name || null, email, hashSenha(this.base64Url(randomBytes(32))), perfil.sub, perfil.picture || null],
        );
        return criado.rows[0];
      }
      if (encontrado.google_sub && encontrado.google_sub !== perfil.sub) {
        throw new UnauthorizedException('email ja vinculado a outra conta google');
      }

      const atualizado = await q(
        `update usuarios
            set google_sub=$2,
                nome=coalesce(nome,$3),
                avatar_url=coalesce(avatar_url,$4),
                auth_provider=case when auth_provider='password' then 'password_google' else auth_provider end,
                email_verified_at=coalesce(email_verified_at, now()),
                ultimo_login_em=now()
          where id=$1
          returning id, email, papel`,
        [encontrado.id, perfil.sub, perfil.name || null, perfil.picture || null],
      );
      return atualizado.rows[0];
    });

    if (!user) {
      throw new UnauthorizedException('usuario google nao encontrado neste tenant');
    }

    await ensureTrialSubscription(tenant.id);
    await this.audit(tenant.id, user.id, 'auth.google_login', 'usuario', user.id);
    await comTenant(tenant.id, async (q) => {
      await q(
        `update usuarios
            set nome=coalesce(nome,$2),
                avatar_url=coalesce(avatar_url,$3),
                ultimo_login_em=now()
          where id=$1`,
        [user.id, perfil.name || null, perfil.picture || null],
      );
    });

    return {
      token: assinarToken({ sub: user.id, tenantId: tenant.id, papel: user.papel }),
      origem: estado.origem,
    };
  }

  private async trocarCodigoGoogle(code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
    const params = new URLSearchParams({
      code,
      client_id: this.googleClientId(),
      client_secret: this.googleClientSecret(),
      redirect_uri: this.googleRedirectUri(),
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });

    const resposta = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const payload = (await resposta.json()) as GoogleTokenResponse;
    if (!resposta.ok) {
      throw new UnauthorizedException(payload.error_description || payload.error || 'falha no oauth google');
    }
    return payload;
  }

  private async buscarPerfilGoogle(accessToken: string): Promise<GoogleUserInfo> {
    const resposta = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await resposta.json()) as GoogleUserInfo;
    if (!resposta.ok) throw new UnauthorizedException('falha ao buscar perfil google');
    return payload;
  }

  private googleClientId(): string {
    const valor = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!valor) throw new UnauthorizedException('google oauth nao configurado');
    return valor;
  }

  private googleClientSecret(): string {
    const valor = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!valor) throw new UnauthorizedException('google oauth nao configurado');
    return valor;
  }

  private googleRedirectUri(): string {
    const valor = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!valor) throw new UnauthorizedException('google oauth redirect nao configurado');
    return valor;
  }

  private origemPermitida(origem: string | undefined, dominio: string): string {
    if (origem) {
      try {
        const url = new URL(origem);
        if ((url.protocol === 'http:' || url.protocol === 'https:') && url.host === dominio) {
          return url.origin;
        }
      } catch {
        // fallback abaixo
      }
    }
    if (process.env.WEB_APP_URL) return process.env.WEB_APP_URL.replace(/\/+$/, '');
    const protocolo = dominio.startsWith('localhost') || dominio.startsWith('127.0.0.1') ? 'http' : 'https';
    return `${protocolo}://${dominio}`;
  }

  private base64Url(valor: Buffer): string {
    return valor
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private authLink(kind: 'reset' | 'verify', token: string, origem: string): string {
    const path = kind === 'reset' ? '/login?reset_token=' : '/login?verify_token=';
    return `${origem}${path}${encodeURIComponent(token)}`;
  }

  private authLinkResponse(url: string, emailResult: any): any {
    const response: any = {
      ok: true,
      email: {
        sent: Boolean(emailResult?.ok),
        provider: emailResult?.provider || 'none',
      },
    };
    if (emailResult?.error && process.env.NODE_ENV !== 'production') response.email.error = emailResult.error;
    if (url && (process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG_LINKS === 'true')) response.url = url;
    return response;
  }

  private async criarEnviarVerificacaoEmail(tenantId: string, userId: string, email: string, origem: string): Promise<{ url: string; emailResult: any }> {
    const token = this.base64Url(randomBytes(32));
    const tokenHash = this.hashToken(token);
    await comTenant(tenantId, async (q) => {
      await q(
        `insert into auth_tokens (tenant_id, usuario_id, tipo, token_hash, expires_at)
         values ($1,$2,'email_verify',$3,now() + interval '24 hours')`,
        [tenantId, userId, tokenHash],
      );
    });
    await this.audit(tenantId, userId, 'auth.email_verify_requested', 'usuario', userId);
    const url = this.authLink('verify', token, origem);
    const emailResult = await this.emailService.send({
      to: email,
      subject: 'Verifique seu e-mail',
      html: actionEmail({
        title: 'Verifique seu e-mail',
        intro: 'Confirme seu e-mail para proteger sua conta e concluir o acesso.',
        ctaLabel: 'Verificar e-mail',
        url,
      }),
    });
    return { url, emailResult };
  }

  private async audit(
    tenantId: string,
    userId: string | null,
    eventType: string,
    entityType?: string,
    entityId?: string,
    metadata: Record<string, any> = {},
  ): Promise<void> {
    try {
      await comTenant(tenantId, async (q) => {
        await q(
          `insert into audit_events (tenant_id, usuario_id, event_type, entity_type, entity_id, metadata)
           values ($1,$2,$3,$4,$5,$6::jsonb)`,
          [tenantId, userId, eventType, entityType ?? null, entityId ?? null, JSON.stringify(metadata)],
        );
      });
    } catch {
      // Auditoria nao pode quebrar login/cadastro.
    }
  }

  private normalizarEmail(email: string): string | null {
    const normalizado = email?.trim().toLowerCase();
    if (!normalizado || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) return null;
    return normalizado;
  }
}
