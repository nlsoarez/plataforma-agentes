'use client';
import { useEffect, useRef, useState } from 'react';
import Shell from '../../components/Shell';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function Onboarding() {
  const [token, setToken] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [instancia, setInstancia] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [estado, setEstado] = useState('');
  const timer = useRef<any>(null);

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  useEffect(() => { setToken(localStorage.getItem('token')); }, []);

  async function criar() {
    if (!token || !nome.trim()) return;
    const r = await fetch(`${API}/onboarding/instancia`, { method: 'POST', headers: auth(token), body: JSON.stringify({ nome }) });
    const d = await r.json();
    setInstancia(d.instancia); setQr(d.qr); setEstado('aguardando leitura do QR');
    iniciarPolling(d.instancia);
  }

  function iniciarPolling(inst: string) {
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      if (!token) return;
      const s = await (await fetch(`${API}/onboarding/instancia/${inst}/status`, { headers: auth(token) })).json();
      setEstado(s.state);
      if (s.state === 'open') { clearInterval(timer.current); setQr(null); }
      else {
        const q = await (await fetch(`${API}/onboarding/instancia/${inst}/qr`, { headers: auth(token) })).json();
        if (q.qr) setQr(q.qr);
      }
    }, 4000);
  }
  useEffect(() => () => clearInterval(timer.current), []);

  if (!token) return <NaoLogado />;
  const conectado = estado === 'open';

  return (
    <Shell title="Conectar WhatsApp">
      <div className="nl-grid" style={{ gridTemplateColumns: 'minmax(280px, 380px) minmax(280px, 340px)', maxWidth: 760, alignItems: 'start' }}>
        <div className="nl-card nl-card--pad">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Nova conexão</div>
          <p className="muted" style={{ marginTop: 0 }}>
            Crie a instância e escaneie o QR no WhatsApp do cliente em <b>Aparelhos conectados</b>.
          </p>
          {!instancia ? (
            <>
              <label className="nl-label">Nome da instância</label>
              <input className="nl-input" value={nome} onChange={(e) => setNome(e.target.value)}
                placeholder="ex: clinica-x" style={{ marginBottom: 16 }} onKeyDown={(e) => e.key === 'Enter' && criar()} />
              <button className="nl-btn nl-btn--accent" style={{ width: '100%' }} onClick={criar}>Criar e gerar QR</button>
            </>
          ) : (
            <div className="nl-row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Instância <b>{instancia}</b></span>
              <span className={`nl-badge ${conectado ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{estado || '—'}</span>
            </div>
          )}
        </div>

        <div className="nl-card nl-card--pad" style={{ textAlign: 'center', minHeight: 320, display: 'grid', placeItems: 'center' }}>
          {qr ? (
            <div>
              <img alt="QR code" src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                style={{ width: 240, height: 240, borderRadius: 12, border: '1px solid var(--line)' }} />
              <p className="faint" style={{ fontSize: '0.82rem', marginBottom: 0 }}>Escaneie em até 60s</p>
            </div>
          ) : conectado ? (
            <div>
              <div className="display display-md" style={{ color: '#168c50' }}>Conectado</div>
              <p className="muted" style={{ marginBottom: 0 }}>O número está ativo e pronto.</p>
            </div>
          ) : (
            <div className="nl-empty" style={{ padding: 20 }}>
              <div className="display display-md">QR</div>
              <div>Aparece aqui após criar a instância.</div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function NaoLogado() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', textAlign: 'center' }}>
      <div><div className="display display-md" style={{ marginBottom: 10 }}>Sessão necessária</div>
      <a className="nl-btn nl-btn--accent" href="/login">Ir para o login</a></div>
    </main>
  );
}
