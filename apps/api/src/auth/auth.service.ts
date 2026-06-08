import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { comTenant, resolverTenantPorDominio } from '@plataforma/db';
import { createHash, randomBytes } from 'crypto';
import { hashSenha, verificarSenha } from './senha';
import { assinarEstadoGoogleOAuth, assinarToken, verificarEstadoGoogleOAuth } from './jwt';

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
  // Login é escopado pelo domínio da agência (white-label): o mesmo email pode
  // existir em agências diferentes, então o tenant vem do domínio, não do email.
  async login(dominio: string, email: string, senha: string): Promise<{ token: string }> {
    const tenant = dominio ? await resolverTenantPorDominio(dominio) : null;
    if (!tenant) throw new UnauthorizedException('agencia nao encontrada para este dominio');

    const user = await comTenant(tenant.id, async (q) => {
      const r = await q(`select id, senha_hash, papel, status from usuarios where lower(email)=lower($1)`, [email]);
      return r.rows[0];
    });
    if (!user || user.status !== 'ativo' || !verificarSenha(senha, user.senha_hash)) {
      throw new UnauthorizedException('credenciais invalidas');
    }
    return { token: assinarToken({ sub: user.id, tenantId: tenant.id, papel: user.papel }) };
  }

  async registrar(dominio: string, body: { nome?: string; email: string; senha: string }): Promise<{ token: string }> {
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
        `insert into usuarios (tenant_id, nome, email, senha_hash, papel, status, auth_provider, ultimo_login_em)
         values ($1,$2,$3,$4,'cliente_final','ativo','password',now())
         returning id, papel`,
        [tenant.id, nome, email, hashSenha(senha)],
      );
      return r.rows[0];
    });

    return { token: assinarToken({ sub: user.id, tenantId: tenant.id, papel: user.papel }) };
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
      if (!encontrado) return null;
      if (encontrado.google_sub && encontrado.google_sub !== perfil.sub) {
        throw new UnauthorizedException('email ja vinculado a outra conta google');
      }

      const atualizado = await q(
        `update usuarios
            set google_sub=$2,
                nome=coalesce(nome,$3),
                avatar_url=coalesce(avatar_url,$4),
                auth_provider=case when auth_provider='password' then 'password_google' else auth_provider end,
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

  private normalizarEmail(email: string): string | null {
    const normalizado = email?.trim().toLowerCase();
    if (!normalizado || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) return null;
    return normalizado;
  }
}
