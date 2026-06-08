'use client';
import { useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function Billing() {
  const { token, ready } = useStoredToken();
  const [info, setInfo] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    if (!token) return;
    carregar();
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      setMsg('Pagamento recebido pelo Stripe. Aguarde alguns segundos enquanto confirmamos a assinatura.');
      window.history.replaceState(null, '', '/billing');
    }
    if (params.get('checkout') === 'cancel') {
      setMsg('Pagamento cancelado. Para acessar o dashboard, conclua a assinatura.');
      window.history.replaceState(null, '', '/billing');
    }
  }, [token]);

  async function carregar() {
    if (!token) return;
    const r = await fetch(`${API}/billing`, { headers: auth(token) });
    const d = await r.json();
    setInfo(d);
  }

  async function checkout() {
    if (!token) return;
    setLoadingCheckout(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/billing/checkout`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({ origem: window.location.origin }),
      });
      const d = await r.json();
      if (d.url) {
        window.location.href = d.url;
        return;
      }
      setMsg(d.message || 'Nao foi possivel iniciar o pagamento.');
    } catch {
      setMsg('Erro ao iniciar pagamento.');
    }
    setLoadingCheckout(false);
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  const valor = info?.valor_por_projeto_centavos ? (info.valor_por_projeto_centavos / 100).toFixed(2) : null;
  const status = info?.assinatura?.status ?? 'sem assinatura';
  const ativo = Boolean(info?.pago);

  return (
    <Shell title="Assinatura">
      <div className="nl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', maxWidth: 880 }}>
        <div className="nl-card nl-card--pad">
          <div className="eyebrow">Status</div>
          <div className="nl-row" style={{ marginTop: 10 }}>
            <span className={`nl-badge ${ativo ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{ativo ? 'ativa' : status}</span>
          </div>
          <div className="display" style={{ fontSize: '2.6rem', marginTop: 18 }}>
            {info?.projetos_ativos ?? '-'}<span className="faint" style={{ fontSize: '1rem', fontFamily: 'var(--font-body)', fontWeight: 600 }}> projetos ativos</span>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            {valor ? `R$ ${valor} por projeto / mes` : 'Plano configurado no Stripe'}
          </div>
        </div>

        <div className="nl-card nl-card--pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>{ativo ? 'Acesso liberado' : 'Pagamento necessario'}</div>
          <h2 className="display display-sm" style={{ marginBottom: 12 }}>
            {ativo ? 'Sua assinatura esta ativa.' : 'Conclua a assinatura para acessar o dashboard.'}
          </h2>
          <p className="muted" style={{ marginTop: 0 }}>
            O pagamento e processado pelo Stripe. A liberacao acontece quando o webhook confirma a assinatura.
          </p>
          {ativo ? (
            <a className="nl-btn nl-btn--accent" style={{ width: '100%' }} href="/dashboard">Ir para dashboard</a>
          ) : (
            <button className="nl-btn nl-btn--accent" style={{ width: '100%' }} onClick={checkout} disabled={loadingCheckout}>
              {loadingCheckout ? 'Abrindo Stripe...' : 'Ir para pagamento'}
            </button>
          )}
          {msg && <p className={msg.includes('cancelado') || msg.includes('Erro') ? 'nl-error' : 'nl-success'}>{msg}</p>}
        </div>
      </div>
    </Shell>
  );
}
