import { Body, Controller, Get, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { verificarEstadoGoogleOAuth } from './jwt';
import { assertAuthRateLimit } from './auth-rate-limit';

@Controller('auth')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  @Post('login')
  login(@Body() body: { dominio?: string; email: string; senha: string }, @Req() req: any) {
    const dominio = body.dominio ?? req.headers['x-tenant-host'];
    this.limit('login', dominio, body.email, req);
    return this.svc.login(dominio, body.email, body.senha);
  }

  @Post('register')
  register(@Body() body: { dominio?: string; nome?: string; email: string; senha: string; origem?: string }, @Req() req: any) {
    const dominio = body.dominio ?? req.headers['x-tenant-host'];
    this.limit('register', dominio, body.email, req);
    return this.svc.registrar(dominio, body);
  }

  @Post('google/start')
  googleStart(@Body() body: { dominio?: string; origem?: string }, @Req() req: any) {
    const dominio = body.dominio ?? req.headers['x-tenant-host'];
    this.limit('google-start', dominio, 'oauth', req);
    return this.svc.googleStart(dominio, body.origem);
  }

  @Post('password/forgot')
  forgotPassword(@Body() body: { dominio?: string; email: string; origem?: string }, @Req() req: any) {
    const dominio = body.dominio ?? req.headers['x-tenant-host'];
    this.limit('password-forgot', dominio, body.email, req);
    return this.svc.solicitarResetSenha(dominio, body.email, body.origem);
  }

  @Post('password/reset')
  resetPassword(@Body() body: { dominio?: string; token: string; senha: string }, @Req() req: any) {
    const dominio = body.dominio ?? req.headers['x-tenant-host'];
    return this.svc.redefinirSenha(dominio, body.token, body.senha);
  }

  @Post('email/verify/request')
  requestEmailVerification(@Body() body: { dominio?: string; email: string; origem?: string }, @Req() req: any) {
    const dominio = body.dominio ?? req.headers['x-tenant-host'];
    this.limit('email-verify-request', dominio, body.email, req);
    return this.svc.solicitarVerificacaoEmail(dominio, body.email, body.origem);
  }

  @Post('email/verify')
  verifyEmail(@Body() body: { dominio?: string; token: string }, @Req() req: any) {
    const dominio = body.dominio ?? req.headers['x-tenant-host'];
    return this.svc.verificarEmail(dominio, body.token);
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: any,
  ) {
    if (error) return res.redirect(this.googleErrorRedirect(state, error));
    if (!code || !state) throw new UnauthorizedException('callback google invalido');

    try {
      const { token, origem } = await this.svc.googleCallback(code, state);
      return res.redirect(`${origem}/login#token=${encodeURIComponent(token)}`);
    } catch (err: any) {
      return res.redirect(this.googleErrorRedirect(state, err?.message || 'falha no login google'));
    }
  }

  private googleErrorRedirect(state: string | undefined, erro: string): string {
    try {
      if (state) {
        const estado = verificarEstadoGoogleOAuth(state);
        return `${estado.origem}/login?google_error=${encodeURIComponent(erro)}`;
      }
    } catch {
      // fallback abaixo
    }
    const fallback = (process.env.WEB_APP_URL || 'http://localhost:3001').replace(/\/+$/, '');
    return `${fallback}/login?google_error=${encodeURIComponent(erro)}`;
  }

  private limit(
    action: 'login' | 'password-forgot' | 'email-verify-request' | 'register' | 'google-start',
    dominio: string,
    account: string,
    req: any,
  ) {
    const firstHeader = (value: unknown) => String(Array.isArray(value) ? value[0] : value ?? '').split(',')[0].trim();
    // Caddy sobrescreve X-Forwarded-For com o cliente efetivo. Nao priorize
    // CF-Connecting-IP, que pode ser forjado quando o host e acessado direto.
    const source = firstHeader(req.headers['x-real-ip'])
      || firstHeader(req.headers['x-forwarded-for'])
      || firstHeader(req.headers['cf-connecting-ip'])
      || req.ip
      || req.socket?.remoteAddress;
    assertAuthRateLimit(action, { domain: dominio, account, source });
  }
}
