import { Body, ConflictException, Controller, Get, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { normalizarDominio, pool, resolverTenantPorDominio } from '@plataforma/db';
import { AuthGuard } from '../auth/auth.guard';

const OLD_BRAND_RE = /(attende|neural[-\s_]?lab|command\s*center)/i;
const OLD_COLOR_RE = /^#?(22c55e|14b8a6|0f172a|020617)$/i;

function legacyBrand(value?: string | null) {
  return Boolean(value && OLD_BRAND_RE.test(value));
}

function tableMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '42P01');
}

function normalizeAliasList(input: unknown, primaryDomain?: string | null): string[] {
  const primary = primaryDomain ? normalizarDominio(primaryDomain) : '';
  const values = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[\n,;]/)
      : [];

  return Array.from(new Set(
    values
      .map((value) => normalizarDominio(String(value || '')))
      .filter((value) => value && value !== primary),
  ));
}

async function listTenantDomains(tenantId: string): Promise<string[]> {
  try {
    const r = await pool.query(
      `select domain
         from tenant_domains
        where tenant_id=$1
          and kind <> 'primary'
        order by created_at asc`,
      [tenantId],
    );
    return r.rows.map((row) => row.domain);
  } catch (error) {
    if (tableMissing(error)) return [];
    throw error;
  }
}

async function assertDomainsAvailable(tenantId: string, domains: string[]): Promise<void> {
  const checkedDomains = Array.from(new Set(domains.map((domain) => normalizarDominio(domain)).filter(Boolean)));
  if (!checkedDomains.length) return;

  try {
    const conflicts = await pool.query(
      `select dominio as domain
         from tenants
        where lower(dominio)=any($1::text[])
          and id <> $2
       union
       select domain
         from tenant_domains
        where lower(domain)=any($1::text[])
          and tenant_id <> $2`,
      [checkedDomains, tenantId],
    );
    if (conflicts.rows.length) {
      throw new ConflictException(`Dominio ja usado por outro cliente: ${conflicts.rows[0].domain}`);
    }
  } catch (error) {
    if (tableMissing(error)) return;
    throw error;
  }
}

async function syncTenantDomains(tenantId: string, primaryDomain: string, aliases: string[]): Promise<void> {
  try {
    await pool.query(
      `insert into tenant_domains (tenant_id, domain, kind, verified_at)
       values ($1, $2, 'primary', now())
       on conflict (domain) do update
       set kind='primary',
           verified_at=coalesce(tenant_domains.verified_at, now()),
           updated_at=now()
       where tenant_domains.tenant_id=excluded.tenant_id`,
      [tenantId, normalizarDominio(primaryDomain)],
    );

    await pool.query(`delete from tenant_domains where tenant_id=$1 and kind='alias'`, [tenantId]);

    for (const alias of aliases) {
      await pool.query(
        `insert into tenant_domains (tenant_id, domain, kind, verified_at)
         values ($1, $2, 'alias', now())
         on conflict (domain) do nothing`,
        [tenantId, alias],
      );
    }
  } catch (error) {
    if (tableMissing(error)) return;
    throw error;
  }
}

@Controller('branding')
export class PublicBrandingController {
  @Get()
  async branding(@Query('dominio') dominio?: string) {
    const fallback = {
      name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Comunora',
      logoUrl: '/brand/comunora/comunora-logo-horizontal-light.svg',
      faviconUrl: '/brand/comunora/comunora-favicon.svg',
      primaryColor: '#1565FF',
      supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'suporte@comunora.com.br',
    };

    if (!dominio) return fallback;

    const tenant = await resolverTenantPorDominio(dominio);
    if (!tenant) return fallback;

    const r = await pool.query(
      `select nome, logo_url, favicon_url, cor_primaria, support_email, custom_css
         from tenants
        where id=$1 and status <> 'deleted'
        limit 1`,
      [tenant.id],
    );
    const row = r.rows[0];
    if (!row) return fallback;

    return {
      name: legacyBrand(row.nome) ? fallback.name : row.nome || fallback.name,
      logoUrl: legacyBrand(row.logo_url) ? fallback.logoUrl : row.logo_url || fallback.logoUrl,
      faviconUrl: legacyBrand(row.favicon_url) ? fallback.faviconUrl : row.favicon_url || fallback.faviconUrl,
      primaryColor: row.cor_primaria && !OLD_COLOR_RE.test(row.cor_primaria) ? row.cor_primaria : fallback.primaryColor,
      supportEmail: legacyBrand(row.support_email) ? fallback.supportEmail : row.support_email || fallback.supportEmail,
      customCss: row.custom_css || '',
    };
  }
}

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
    const tenant = r.rows[0];
    if (!tenant) return null;

    return {
      ...tenant,
      domain_aliases: await listTenantDomains(req.user.tenantId),
    };
  }

  @Patch('tenant')
  async atualizar(@Body() body: any, @Req() req: any) {
    const current = await pool.query(`select dominio from tenants where id=$1`, [req.user.tenantId]);
    const currentDomain = current.rows[0]?.dominio || '';
    const nextDomain = body.dominio === undefined ? currentDomain : normalizarDominio(body.dominio);
    const aliases = body.domain_aliases === undefined
      ? await listTenantDomains(req.user.tenantId)
      : normalizeAliasList(body.domain_aliases, nextDomain);
    await assertDomainsAvailable(req.user.tenantId, [nextDomain, ...aliases]);

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
        body.dominio === undefined ? null : nextDomain,
        body.logo_url ?? null,
        body.cor_primaria ?? null,
        body.favicon_url ?? null,
        body.custom_css ?? null,
        body.support_email ?? null,
      ],
    );

    const tenant = r.rows[0];
    if (tenant) await syncTenantDomains(req.user.tenantId, tenant.dominio, aliases);

    return {
      ...tenant,
      domain_aliases: await listTenantDomains(req.user.tenantId),
    };
  }
}
