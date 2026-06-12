'use client';
import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const FEATURE_LABELS: Record<string, string> = {
  projects: 'projetos',
  whatsapp_connections: 'WhatsApp',
  team_users: 'usuarios',
  ai_agents: 'agentes IA',
  contacts: 'contatos',
  active_automations: 'automacoes',
  campaigns_monthly: 'campanhas/mes',
  public_api: 'API publica',
  white_label_branding: 'white-label',
};

export default function Billing() {
  const { token, ready } = useStoredToken();
  const [info, setInfo] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [msgKind, setMsgKind] = useState<'success' | 'error' | ''>('');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [pixQrCode, setPixQrCode] = useState('');
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [planCode, setPlanCode] = useState('pro');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [billingType, setBillingType] = useState<'PIX' | 'BOLETO' | 'CREDIT_CARD'>('PIX');
  const [name, setName] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [phone, setPhone] = useState('');

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    if (!token) return;
    carregar();
  }, [token]);

  async function carregar() {
    if (!token) return;
    const r = await fetch(`${API}/billing`, { headers: auth(token) });
    const d = await r.json();
    setInfo(d);
    if (d?.plano?.code) setPlanCode(d.plano.code);
  }

  async function checkout() {
    if (!token) return;
    setLoadingCheckout(true);
    setMsg('');
    setMsgKind('');
    setPaymentUrl('');
    setPixQrCode('');
    try {
      const r = await fetch(`${API}/billing/assinar`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({
          origem: window.location.origin,
          planCode,
          billingCycle,
          billingType,
          name,
          cpfCnpj,
          phone,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg(d?.message || d?.error?.message || 'Nao foi possivel iniciar a assinatura.');
        setMsgKind('error');
        setLoadingCheckout(false);
        return;
      }
      setPaymentUrl(d.url || '');
      setPixQrCode(d.pixQrCode || '');
      setMsg('Assinatura criada no Asaas. Conclua o pagamento pela cobranca gerada.');
      setMsgKind('success');
      await carregar();
    } catch {
      setMsg('Erro ao iniciar assinatura.');
      setMsgKind('error');
    }
    setLoadingCheckout(false);
  }

  async function sincronizar() {
    if (!token) return;
    setMsg('');
    setMsgKind('');
    try {
      const r = await fetch(`${API}/billing/sincronizar`, { method: 'POST', headers: auth(token) });
      const d = await r.json();
      if (!r.ok || d.ok === false) {
        setMsg(d?.message || 'Nao foi possivel sincronizar com o Asaas.');
        setMsgKind('error');
      } else {
        setMsg(`Sincronizado com Asaas. Status: ${d.status || 'atualizado'}.`);
        setMsgKind('success');
        await carregar();
      }
    } catch {
      setMsg('Erro ao sincronizar assinatura.');
      setMsgKind('error');
    }
  }

  async function cancelar() {
    if (!token) return;
    const ok = window.confirm('Cancelar a assinatura no Asaas e suspender o acesso agora?');
    if (!ok) return;
    setMsg('');
    setMsgKind('');
    try {
      const r = await fetch(`${API}/billing/cancelar`, { method: 'POST', headers: auth(token) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) {
        setMsg(d?.message || 'Nao foi possivel cancelar a assinatura.');
        setMsgKind('error');
      } else {
        setMsg('Assinatura cancelada.');
        setMsgKind('success');
        await carregar();
      }
    } catch {
      setMsg('Erro ao cancelar assinatura.');
      setMsgKind('error');
    }
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  const status = info?.acesso?.state ?? info?.assinatura?.status ?? 'carregando';
  const ativo = Boolean(info?.pago);
  const plans = info?.planos || [];
  const selectedPlan = plans.find((p: any) => p.code === planCode) || plans[0];
  const selectedPrice = selectedPlan ? priceFor(selectedPlan, billingCycle) : 0;

  return (
    <Shell title="Assinatura">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Assinatura</h1>
          <div className="sub">Planos Comunora, cobrança Asaas e limites de uso</div>
        </div>
        <a className="nl-btn nl-btn--ghost" href="/dashboard">Dashboard</a>
      </div>

      <div className="nl-grid" style={{ gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', alignItems: 'start' }}>
        <aside className="nl-stack">
          <section className="nl-card nl-card--pad">
            <div className="eyebrow">Status</div>
            <div className="nl-row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
              <span className={`nl-badge ${ativo ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{statusLabel(status)}</span>
              <span className="faint" style={{ fontSize: '.78rem', fontWeight: 800 }}>Asaas</span>
            </div>
            <h2 className="display display-md" style={{ marginTop: 18 }}>
              {info?.plano?.name || 'Sem plano'}
            </h2>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: '.9rem' }}>
              {statusHelp(info)}
            </p>
            <div className="nl-row" style={{ marginTop: 16 }}>
              <button className="nl-btn nl-btn--ghost" onClick={sincronizar}>Sincronizar Asaas</button>
              {info?.assinatura?.provider === 'asaas' && (
                <button className="nl-btn nl-btn--ghost" onClick={cancelar}>Cancelar</button>
              )}
            </div>
          </section>

          <section className="nl-card nl-card--pad">
            <div className="eyebrow">Uso atual</div>
            <UsageRows usage={info?.uso || {}} />
          </section>

          <section className="nl-card nl-card--pad">
            <div className="eyebrow">Cobranças</div>
            <InvoiceList invoices={info?.invoices || []} />
          </section>

          <section className="nl-card nl-card--pad">
            <div className="eyebrow">Pagamento</div>
            {info && !info.asaas_configurado && (
              <p className="nl-error">
                Asaas ainda nao configurado. Defina ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN no Railway antes de criar cobrancas reais.
              </p>
            )}
            <div className="nl-row" style={{ marginTop: 14 }}>
              <button className={`nl-pill ${billingCycle === 'monthly' ? 'active' : ''}`} onClick={() => setBillingCycle('monthly')}>Mensal</button>
              <button className={`nl-pill ${billingCycle === 'annual' ? 'active' : ''}`} onClick={() => setBillingCycle('annual')}>Anual</button>
            </div>
            <label className="nl-label" style={{ marginTop: 16 }}>Metodo</label>
            <select className="nl-select" value={billingType} onChange={(e) => setBillingType(e.target.value as any)}>
              <option value="PIX">PIX</option>
              <option value="BOLETO">Boleto</option>
              <option value="CREDIT_CARD">Cartao</option>
            </select>
            <label className="nl-label" style={{ marginTop: 12 }}>Nome / razao social</label>
            <input className="nl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do pagador" />
            <label className="nl-label" style={{ marginTop: 12 }}>CPF/CNPJ</label>
            <input className="nl-input" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} placeholder="Somente numeros" />
            <label className="nl-label" style={{ marginTop: 12 }}>Telefone</label>
            <input className="nl-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Opcional" />
            <button className="nl-btn nl-btn--accent" style={{ width: '100%', marginTop: 16 }} onClick={checkout} disabled={loadingCheckout || !selectedPlan || info?.asaas_configurado === false}>
              {loadingCheckout ? 'Criando cobranca...' : info?.asaas_configurado === false ? 'Configure Asaas primeiro' : `Assinar ${selectedPlan?.name || ''} - ${formatCurrency(selectedPrice)}`}
            </button>
            {paymentUrl && <a className="nl-btn nl-btn--ghost" style={{ width: '100%', marginTop: 10 }} href={paymentUrl} target="_blank">Abrir cobranca</a>}
            {pixQrCode && <textarea className="nl-textarea" style={{ minHeight: 96, marginTop: 10 }} readOnly value={pixQrCode} />}
            {msg && <p className={msgKind === 'success' ? 'nl-success' : 'nl-error'}>{msg}</p>}
          </section>
        </aside>

        <section className="nl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {plans.map((plan: any) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              active={plan.code === planCode}
              billingCycle={billingCycle}
              onSelect={() => setPlanCode(plan.code)}
            />
          ))}
        </section>

        <section className="nl-card nl-card--pad">
          <div className="eyebrow">Eventos de pagamento</div>
          <BillingEvents events={info?.eventos || []} />
        </section>
      </div>
    </Shell>
  );
}

function InvoiceList({ invoices }: { invoices: any[] }) {
  if (!invoices.length) return <p className="muted" style={{ marginBottom: 0 }}>Nenhuma cobrança gerada ainda.</p>;
  return (
    <div style={{ marginTop: 12 }}>
      {invoices.slice(0, 5).map((invoice) => (
        <div key={invoice.id || invoice.external_invoice_id} className="nl-row" style={{ justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          <div>
            <b>{formatCurrency(Number(invoice.amount_cents || 0))}</b>
            <div className="faint" style={{ fontSize: '.78rem' }}>
              {invoice.payment_method || '-'} / {invoice.due_date ? dateLabel(invoice.due_date) : '-'}
            </div>
          </div>
          <div className="nl-row">
            <span className={`nl-badge ${paidStatus(invoice.status) ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{invoice.status}</span>
            {(invoice.invoice_url || invoice.boleto_url) && (
              <a className="nl-btn nl-btn--ghost" href={invoice.invoice_url || invoice.boleto_url} target="_blank">Abrir</a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function BillingEvents({ events }: { events: any[] }) {
  if (!events.length) return <p className="muted" style={{ marginBottom: 0 }}>Nenhum evento recebido ainda.</p>;
  return (
    <div className="nl-stack" style={{ marginTop: 12 }}>
      {events.slice(0, 8).map((event, index) => (
        <div key={`${event.event_type}-${event.created_at}-${index}`} className="nl-row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <div>
            <b>{event.event_type || '-'}</b>
            <div className="faint" style={{ fontSize: '.78rem' }}>{event.created_at ? new Date(event.created_at).toLocaleString('pt-BR') : '-'}</div>
            {event.processing_error && <div className="nl-error" style={{ marginTop: 6 }}>{event.processing_error}</div>}
          </div>
          <span className={`nl-badge ${event.processing_status === 'processed' ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{event.processing_status}</span>
        </div>
      ))}
    </div>
  );
}

function PlanCard({ plan, active, billingCycle, onSelect }: any) {
  const entitlements = importantEntitlements(plan.entitlements || []);
  return (
    <button
      type="button"
      className="nl-card nl-card--pad"
      onClick={onSelect}
      style={{
        textAlign: 'left',
        cursor: 'pointer',
        borderColor: active ? 'var(--accent)' : 'var(--line)',
        boxShadow: active ? '0 0 0 3px rgba(21,101,255,.12)' : 'var(--shadow-sm)',
        minHeight: 330,
      }}
    >
      <div className="nl-row" style={{ justifyContent: 'space-between' }}>
        <div className="eyebrow">{plan.metadata?.popular ? 'Recomendado' : 'Plano'}</div>
        {active && <span className="nl-badge nl-badge--ok">selecionado</span>}
      </div>
      <h2 className="display display-md" style={{ marginTop: 14 }}>{plan.name}</h2>
      <p className="muted" style={{ minHeight: 54, fontSize: '.88rem' }}>{plan.description}</p>
      <div className="display" style={{ fontSize: '2rem', margin: '14px 0 4px' }}>
        {formatCurrency(priceFor(plan, billingCycle))}
      </div>
      <div className="faint" style={{ fontSize: '.8rem', fontWeight: 800 }}>
        {billingCycle === 'annual' ? 'por ano' : 'por mes'}
      </div>
      <div className="nl-stack" style={{ gap: 8, marginTop: 18 }}>
        {entitlements.map((item: string) => (
          <div key={item} className="nl-row" style={{ gap: 8 }}>
            <span className="nl-badge nl-badge--accent" style={{ width: 22, height: 22, padding: 0, justifyContent: 'center' }}>✓</span>
            <span style={{ fontSize: '.86rem', fontWeight: 700, color: 'var(--ink-soft)' }}>{item}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

function UsageRows({ usage }: { usage: Record<string, number> }) {
  const keys = ['projects', 'whatsapp_connections', 'team_users', 'ai_agents', 'contacts', 'active_automations'];
  return (
    <div style={{ marginTop: 12 }}>
      {keys.map((key) => (
        <div key={key} className="nl-row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
          <span className="muted" style={{ fontSize: '.84rem' }}>{FEATURE_LABELS[key]}</span>
          <b>{Number(usage[key] || 0).toLocaleString('pt-BR')}</b>
        </div>
      ))}
    </div>
  );
}

function importantEntitlements(entitlements: any[]) {
  const keys = ['projects', 'whatsapp_connections', 'team_users', 'ai_agents', 'contacts', 'campaigns_monthly', 'public_api', 'white_label_branding'];
  return keys
    .map((key) => entitlements.find((e) => e.key === key))
    .filter((item) => item?.enabled)
    .slice(0, 6)
    .map((item) => `${formatLimit(item.limit)} ${FEATURE_LABELS[item.key] || item.key}`);
}

function priceFor(plan: any, cycle: 'monthly' | 'annual') {
  return Number(cycle === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents) || 0;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatLimit(limit: number | null) {
  if (limit === null || limit >= 999999) return 'Ilimitado';
  return Number(limit).toLocaleString('pt-BR');
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    active: 'ativa',
    trialing: 'trial',
    past_due_grace: 'tolerancia',
    past_due_restricted: 'restrita',
    canceled: 'cancelada',
    needs_subscription: 'sem assinatura',
  };
  return map[status] || status;
}

function paidStatus(status?: string) {
  return ['received', 'confirmed', 'paid', 'recebida', 'recebido'].includes(String(status || '').toLowerCase());
}

function statusHelp(info: any) {
  const state = info?.acesso?.state;
  if (state === 'trialing') return `Trial liberado ate ${dateLabel(info?.acesso?.trialEndsAt)}. Depois disso, conclua a cobranca.`;
  if (state === 'active') return 'Acesso liberado. Alteracoes de plano sao processadas via Asaas.';
  if (state === 'past_due_grace') return `Pagamento atrasado. Escrita liberada ate ${dateLabel(info?.acesso?.graceEndsAt)}.`;
  if (state === 'past_due_restricted') return 'Assinatura restrita. Voce pode visualizar dados e regularizar a cobranca.';
  return 'Escolha um plano e gere a cobranca para ativar o acesso completo.';
}

function dateLabel(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}
