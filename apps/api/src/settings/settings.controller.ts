import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { pool } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';

@Controller('settings')
@UseGuards(AuthGuard)
export class SettingsController {
  @Get('tenant')
  async tenant(@Req() req: any) {
    const r = await pool.query(
      `select id, nome, dominio, logo_url, cor_primaria, favicon_url, custom_css, support_email, plano, status
       from tenants where id=$1`,
      [req.user.tenantId],
    );
    return r.rows[0];
  }

  @Patch('tenant')
  async atualizar(@Body() body: any, @Req() req: any) {
    const r = await pool.query(
      `update tenants
       set nome=coalesce($2,nome),
           dominio=coalesce($3,dominio),
           logo_url=coalesce($4,logo_url),
           cor_primaria=coalesce($5,cor_primaria),
           favicon_url=coalesce($6,favicon_url),
           custom_css=coalesce($7,custom_css),
           support_email=coalesce($8,support_email),
           updated_at=now()
       where id=$1
       returning id, nome, dominio, logo_url, cor_primaria, favicon_url, custom_css, support_email, plano, status`,
      [
        req.user.tenantId,
        body.nome ?? null,
        body.dominio ?? null,
        body.logo_url ?? null,
        body.cor_primaria ?? null,
        body.favicon_url ?? null,
        body.custom_css ?? null,
        body.support_email ?? null,
      ],
    );
    return r.rows[0];
  }
}
