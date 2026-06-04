import { Injectable, BadRequestException } from '@nestjs/common';
import { comTenant } from '@plataforma/db';

// Adapter Asaas (recorrência BR: PIX/boleto/cartão). Gated por env.
@Injectable()
export class BillingService {
  private base = process.env.ASAAS_API_URL ?? 'https://sandbox.asaas.com/api/v3';
  private key = process.env.ASAAS_API_KEY ?? '';
  private h() { return { access_token: this.key, 'Content-Type': 'application/json' }; }

  private async post(path: string, body: unknown) {
    const r = await fetch(`${this.base}${path}`, { method: 'POST', headers: this.h(), body: JSON.stringify(body) });
    if (!r.ok) throw new BadRequestException(`asaas ${path} ${r.status}: ${await r.text()}`);
    return r.json() as any;
  }
  private async get(path: string) {
    const r = await fetch(`${this.base}${path}`, { headers: this.h() });
    if (!r.ok) throw new BadRequestException(`asaas ${path} ${r.status}: ${await r.text()}`);
    return r.json() as any;
  }
  private amanha() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

  // Status atual da assinatura do tenant.
  status(tenantId: string) {
    return comTenant(tenantId, async (q) => {
      const plano = (await q(`select valor_centavos, ciclo from planos order by valor_centavos limit 1`)).rows[0];
      const ass = (await q(`select status, qtd_projetos, provider, atualizado_em from assinaturas where tenant_id=$1 order by criado_em desc limit 1`, [tenantId])).rows[0] ?? null;
      const ativos = (await q(`select count(*)::int as n from projetos where status='ativo'`)).rows[0].n;
      return { assinatura: ass, projetos_ativos: ativos, valor_por_projeto_centavos: plano?.valor_centavos ?? null };
    });
  }

  // Cria cliente + assinatura no Asaas e devolve o link de pagamento.
  async assinar(tenantId: string, dto: { nome: string; cpfCnpj: string; email: string; billingType?: string }) {
    return comTenant(tenantId, async (q) => {
      const plano = (await q(`select id, valor_centavos, ciclo from planos order by valor_centavos limit 1`)).rows[0];
      const qtd = Math.max((await q(`select count(*)::int as n from projetos where status='ativo'`)).rows[0].n, 1);
      const valor = (plano.valor_centavos * qtd) / 100;

      const cust = await this.post('/customers', { name: dto.nome, cpfCnpj: dto.cpfCnpj, email: dto.email });
      const sub = await this.post('/subscriptions', {
        customer: cust.id, billingType: dto.billingType ?? 'PIX', value: valor,
        nextDueDate: this.amanha(), cycle: plano.ciclo, description: `Plataforma — ${qtd} projeto(s)`,
      });
      const pays = await this.get(`/payments?subscription=${sub.id}`);
      const link = pays?.data?.[0]?.invoiceUrl ?? null;

      await q(`insert into assinaturas (tenant_id, plano_id, provider, provider_customer_id, provider_subscription_id, status, qtd_projetos)
               values ($1,$2,'asaas',$3,$4,'pendente',$5)`,
        [tenantId, plano.id, cust.id, sub.id, qtd]);

      return { ok: true, link, valor, qtd };
    });
  }
}
