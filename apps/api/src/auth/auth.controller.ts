import { Body, Controller, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  @Post('login')
  login(@Body() body: { dominio?: string; email: string; senha: string }, @Req() req: any) {
    // Em produção o domínio vem do host da requisição (proxy do web seta x-tenant-host).
    const dominio = body.dominio ?? req.headers['x-tenant-host'];
    return this.svc.login(dominio, body.email, body.senha);
  }
}
