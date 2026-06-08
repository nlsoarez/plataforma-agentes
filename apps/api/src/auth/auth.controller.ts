import { Body, Controller, Get, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { verificarEstadoGoogleOAuth } from './jwt';

@Controller('auth')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  @Post('login')
  login(@Body() body: { dominio?: string; email: string; senha: string }, @Req() req: any) {
    const dominio = body.dominio ?? req.headers['x-tenant-host'];
    return this.svc.login(dominio, body.email, body.senha);
  }

  @Post('google/start')
  googleStart(@Body() body: { dominio?: string; origem?: string }, @Req() req: any) {
    const dominio = body.dominio ?? req.headers['x-tenant-host'];
    return this.svc.googleStart(dominio, body.origem);
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
}
