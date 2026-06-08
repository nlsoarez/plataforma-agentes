import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';
import { hashSenha } from '../auth/senha';
import { assertLimit } from '../billing/entitlements';

@Controller('equipe')
@UseGuards(AuthGuard)
export class EquipeController {
  private assertAdmin(req: any) {
    if (!['owner', 'admin'].includes(req.user?.papel)) {
      throw new ForbiddenException('sem permissao para gerenciar equipe');
    }
  }

  @Get('departamentos')
  departamentos(@Req() req: any) {
    this.assertAdmin(req);
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(`select id, nome, descricao, criado_em from departamentos order by nome`);
      return r.rows;
    });
  }

  @Post('departamentos')
  salvarDepartamento(@Body() body: { nome: string; descricao?: string }, @Req() req: any) {
    this.assertAdmin(req);
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `insert into departamentos (tenant_id, nome, descricao)
         values ($1,$2,$3)
         returning id, nome, descricao, criado_em`,
        [req.user.tenantId, body.nome, body.descricao || null],
      );
      return r.rows[0];
    });
  }

  @Delete('departamentos/:id')
  removerDepartamento(@Param('id') id: string, @Req() req: any) {
    this.assertAdmin(req);
    return comTenant(req.user.tenantId, async (q) => {
      await q(`delete from departamentos where id=$1`, [id]);
      return { ok: true };
    });
  }

  @Get('usuarios')
  usuarios(@Req() req: any) {
    this.assertAdmin(req);
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `select u.id, u.nome, u.email, u.papel, u.status, u.departamento_id, d.nome as departamento_nome, u.criado_em, u.ultimo_login_em
         from usuarios u
         left join departamentos d on d.id=u.departamento_id
         order by u.criado_em desc`,
      );
      return r.rows;
    });
  }

  @Post('usuarios')
  async criarUsuario(@Body() body: { nome?: string; email: string; senha: string; papel?: string; departamentoId?: string }, @Req() req: any) {
    this.assertAdmin(req);
    const consumesSlot = await comTenant(req.user.tenantId, async (q) => {
      const r = await q(`select status from usuarios where lower(email)=lower($1) limit 1`, [body.email]);
      return !r.rows[0] || r.rows[0].status !== 'ativo';
    });
    if (consumesSlot) await assertLimit(req.user.tenantId, 'team_users', 1);

    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `insert into usuarios (tenant_id, nome, email, senha_hash, papel, departamento_id)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (tenant_id, email) do update
           set nome=excluded.nome, senha_hash=excluded.senha_hash, papel=excluded.papel, departamento_id=excluded.departamento_id, status='ativo'
         returning id, nome, email, papel, status, departamento_id`,
        [req.user.tenantId, body.nome || null, body.email, hashSenha(body.senha), body.papel || 'atendente', body.departamentoId || null],
      );
      return r.rows[0];
    });
  }

  @Patch('usuarios/:id')
  async atualizarUsuario(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    this.assertAdmin(req);
    if (body.status === 'ativo') {
      const consumesSlot = await comTenant(req.user.tenantId, async (q) => {
        const r = await q(`select status from usuarios where id=$1`, [id]);
        return r.rows[0]?.status !== 'ativo';
      });
      if (consumesSlot) await assertLimit(req.user.tenantId, 'team_users', 1);
    }
    return comTenant(req.user.tenantId, async (q) => {
      const r = await q(
        `update usuarios
         set nome=coalesce($2,nome),
             papel=coalesce($3,papel),
             departamento_id=$4::uuid,
             status=coalesce($5,status)
         where id=$1
         returning id, nome, email, papel, status, departamento_id`,
        [id, body.nome ?? null, body.papel ?? null, body.departamentoId ?? null, body.status ?? null],
      );
      return r.rows[0];
    });
  }
}
