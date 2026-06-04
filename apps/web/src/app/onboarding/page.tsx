'use client';
import { useEffect, useState } from 'react';

declare global { interface Window { FB: any; fbAsyncInit: any; } }

export default function Onboarding() {
  const [status, setStatus] = useState('');

  useEffect(() => {
    window.fbAsyncInit = function () {
      window.FB.init({
        appId: process.env.NEXT_PUBLIC_META_APP_ID,
        autoLogAppEvents: true, xfbml: false,
        version: process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v21.0',
      });
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js'; s.async = true;
    document.body.appendChild(s);

    // O Embedded Signup devolve waba_id e phone_number_id via postMessage.
    const onMsg = (e: MessageEvent) => {
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.type === 'WA_EMBEDDED_SIGNUP') (window as any).__es = d.data;
      } catch { /* ignora */ }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  function conectar() {
    window.FB.login(
      async (resp: any) => {
        const code = resp?.authResponse?.code;
        const es = (window as any).__es || {};
        if (!code) { setStatus('cancelado pelo usuario'); return; }
        const token = localStorage.getItem('token'); // sessao da agencia
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/onboarding/whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ code, wabaId: es.waba_id, phoneNumberId: es.phone_number_id }),
        });
        setStatus(JSON.stringify(await r.json()));
      },
      { config_id: process.env.NEXT_PUBLIC_META_CONFIG_ID, response_type: 'code', override_default_response_type: true, extras: { setup: {} } },
    );
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 40 }}>
      <h1>Conectar WhatsApp</h1>
      <p>Setup em 5 minutos. O cliente conecta o número dele sem sair daqui.</p>
      <button onClick={conectar}>Conectar com o Facebook</button>
      <pre>{status}</pre>
    </main>
  );
}
