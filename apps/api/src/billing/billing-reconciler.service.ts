import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { pool } from '@plataforma/db';
import { BillingService } from './billing.service';

const LOCK_KEY = 91024017;

@Injectable()
export class BillingReconcilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingReconcilerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly billing: BillingService) {}

  onModuleInit() {
    if (process.env.BILLING_RECONCILE_ENABLED === 'false') return;
    if (!process.env.ASAAS_API_KEY) return;

    const intervalMs = Math.max(60_000, Number(process.env.BILLING_RECONCILE_INTERVAL_MS || 15 * 60_000));
    const initialDelayMs = Math.max(10_000, Number(process.env.BILLING_RECONCILE_INITIAL_DELAY_MS || 60_000));

    setTimeout(() => this.run().catch((err) => this.logger.warn(`reconciliacao inicial falhou: ${err?.message || err}`)), initialDelayMs);
    this.timer = setInterval(() => {
      this.run().catch((err) => this.logger.warn(`reconciliacao falhou: ${err?.message || err}`));
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<void> {
    const locked = (await pool.query('select pg_try_advisory_lock($1) as locked', [LOCK_KEY])).rows[0]?.locked;
    if (!locked) return;

    try {
      const tenants = await pool.query(
        `select id
           from tenants
          where status <> 'deleted'
          order by criado_em desc
          limit $1`,
        [Math.max(1, Number(process.env.BILLING_RECONCILE_TENANT_LIMIT || 200))],
      );

      let ok = 0;
      let skipped = 0;
      let failed = 0;
      for (const row of tenants.rows) {
        try {
          const result = await this.billing.sincronizar(row.id);
          if (result.ok) ok += 1;
          else skipped += 1;
        } catch (err: any) {
          failed += 1;
          this.logger.warn(`tenant ${row.id}: ${err?.message || err}`);
        }
      }

      this.logger.log(`reconciliacao Asaas concluida: ok=${ok} ignorados=${skipped} falhas=${failed}`);
    } finally {
      await pool.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => null);
    }
  }
}
