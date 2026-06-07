'use client';

import { useEffect, useRef, useState } from 'react';
import Shell from '../../components/Shell';
import { expireSession, SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const QRCODE_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

declare global {
  interface Window {
    QRCode?: any;
  }
}

type QrResponse = {
  instancia?: string;
  qr?: string | null;
  qrCode?: string | null;
  pairingCode?: string | null;
  state?: string;
  message?: string;
  warning?: string;
};

type Projeto = { id: string; nome: string; phone_number_id: string | null; status: string };

function looksLikeImageBase64(value: string) {
  return /^(iVBORw0KGgo|\/9j\/|R0lGOD|PHN2Zy)/.test(value);
}

function splitQrPayload(data: QrResponse) {
  const raw = data.qr || data.qrCode || null;
  const qrImage = raw && (raw.startsWith('data:image') || looksLikeImageBase64(raw))
    ? raw
    : null;
  const qrText = raw && !qrImage ? raw : data.qrCode || null;

  return { qrImage, qrText, pairingCode: data.pairingCode || null };
}

async function parseJson(r: Response): Promise<any> {
  const text = await r.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function apiMessage(data: any) {
  return data?.message || data?.error || JSON.stringify(data);
}

function ensureAuth(r: Response, data: any) {
  const message = apiMessage(data);
  if (r.status === 401 || message.toLowerCase().includes('token invalido')) {
    expireSession();
    throw new Error('Sessao expirada. Entre novamente.');
  }
  return message;
}

function loadQrScript(): Promise<any> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    if (window.QRCode) return resolve(window.QRCode);

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${QRCODE_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.QRCode));
      existing.addEventListener('error', () => resolve(null));
      return;
    }

    const script = document.createElement('script');
    script.src = QRCODE_SCRIPT;
    script.onload = () => resolve(window.QRCode);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function QrCanvas({ text }: { text: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadQrScript().then((QRCode) => {
      if (!alive || !boxRef.current || !QRCode) {
        if (alive) setFailed(true);
        return;
      }

      boxRef.current.innerHTML = '';
      new QRCode(boxRef.current, {
        text,
        width: 240,
        height: 240,
        colorDark: '#111114',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel?.M ?? 0,
      });
    });

    return () => {
      alive = false;
    };
  }, [text]);

  if (failed) {
    return <p className="muted" style={{ maxWidth: 280 }}>Nao consegui carregar o gerador visual de QR. Use o codigo de pareamento abaixo.</p>;
  }

  return <div ref={boxRef} className="nl-qr-canvas" aria-label="QR code" />;
}

export default function Onboarding() {
  const { token, ready } = useStoredToken();
  const [nome, setNome] = useState('');
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetoId, setProjetoId] = useState('');
  const [instancia, setInstancia] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrText, setQrText] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [estado, setEstado] = useState('');
  const [erro, setErro] = useState('');
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const timer = useRef<any>(null);

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/projetos`, { headers: auth(token) })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(ensureAuth(r, data));
        return data;
      })
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setProjetos(list);
        const pending = list.find((p: Projeto) => !p.phone_number_id);
        if (pending && !projetoId) {
          setProjetoId(pending.id);
          setNome(pending.nome);
        }
      })
      .catch(() => null);
  }, [token]);

  function aplicarQr(data: QrResponse) {
    const next = splitQrPayload(data);
    if (next.qrImage) setQrImage(next.qrImage);
    if (next.qrText) setQrText(next.qrText);
    if (next.pairingCode) setPairingCode(next.pairingCode);
  }

  async function criar() {
    if (!token || !nome.trim() || loading) return;
    setLoading(true);
    setErro('');
    setWarning('');
    setQrImage(null);
    setQrText(null);
    setPairingCode(null);

    try {
      const r = await fetch(`${API}/onboarding/instancia`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({ nome, projetoId: projetoId || undefined }),
      });
      const d = await parseJson(r);
      if (!r.ok) throw new Error(ensureAuth(r, d));

      setInstancia(d.instancia);
      if (d.warning) setWarning(d.warning);
      aplicarQr(d);
      setEstado('aguardando QR');
      iniciarPolling(d.instancia);
    } catch (e: any) {
      setErro(e?.message || 'Falha ao criar instancia');
    } finally {
      setLoading(false);
    }
  }

  function iniciarPolling(inst: string) {
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      if (!token) return;

      try {
        const statusRes = await fetch(`${API}/onboarding/instancia/${inst}/status`, { headers: auth(token) });
        const statusData = await parseJson(statusRes);
        if (!statusRes.ok) throw new Error(ensureAuth(statusRes, statusData));

        setEstado(statusData.state);
        if (statusData.state === 'open') {
          clearInterval(timer.current);
          setQrImage(null);
          setQrText(null);
          setPairingCode(null);
          return;
        }

        const qrRes = await fetch(`${API}/onboarding/instancia/${inst}/qr`, { headers: auth(token) });
        const qrData = await parseJson(qrRes);
        if (!qrRes.ok) throw new Error(ensureAuth(qrRes, qrData));
        aplicarQr(qrData);
      } catch (e: any) {
        setErro(e?.message || 'Falha ao atualizar QR');
      }
    }, 4000);
  }

  useEffect(() => () => clearInterval(timer.current), []);

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  const conectado = estado === 'open';
  const canSubmit = nome.trim().length > 0 && !loading;

  return (
    <Shell title="Conectar WhatsApp">
      <div className="nl-grid" style={{ gridTemplateColumns: 'minmax(280px, 380px) minmax(280px, 360px)', maxWidth: 800, alignItems: 'start' }}>
        <div className="nl-card nl-card--pad">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Nova conexao</div>
          <p className="muted" style={{ marginTop: 0 }}>
            Crie a instancia e escaneie o QR no WhatsApp do cliente em <b>Aparelhos conectados</b>.
          </p>

          {!instancia ? (
            <>
              {projetos.some((p) => !p.phone_number_id) && (
                <>
                  <label className="nl-label">Projeto importado</label>
                  <select
                    className="nl-select"
                    value={projetoId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setProjetoId(id);
                      const p = projetos.find((item) => item.id === id);
                      if (p) setNome(p.nome);
                    }}
                    style={{ marginBottom: 12 }}
                  >
                    <option value="">Criar projeto novo</option>
                    {projetos.filter((p) => !p.phone_number_id).map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </>
              )}
              <label className="nl-label">Nome da instancia</label>
              <input
                className="nl-input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="ex: clinica-x"
                style={{ marginBottom: 16 }}
                onKeyDown={(e) => e.key === 'Enter' && criar()}
              />
              <button className="nl-btn nl-btn--accent" style={{ width: '100%' }} disabled={!canSubmit} onClick={criar}>
                {loading ? 'Gerando...' : 'Criar e gerar QR'}
              </button>
            </>
          ) : (
            <div className="nl-row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Instancia <b>{instancia}</b></span>
              <span className={`nl-badge ${conectado ? 'nl-badge--ok' : 'nl-badge--warn'}`}>{estado || '-'}</span>
            </div>
          )}

          {erro && <p className="nl-error">{erro}</p>}
          {warning && <p className="nl-error">{warning}</p>}
        </div>

        <div className="nl-card nl-card--pad nl-qr-panel">
          {qrImage ? (
            <div>
              <img
                alt="QR code"
                src={qrImage.startsWith('data:image') ? qrImage : `data:image/png;base64,${qrImage}`}
                className="nl-qr-image"
              />
              <p className="faint" style={{ fontSize: '0.82rem', marginBottom: 0 }}>Escaneie em ate 60s</p>
            </div>
          ) : qrText ? (
            <div>
              <QrCanvas text={qrText} />
              <p className="faint" style={{ fontSize: '0.82rem', marginBottom: 8 }}>Escaneie em ate 60s</p>
              {pairingCode && <PairingCode value={pairingCode} />}
            </div>
          ) : conectado ? (
            <div>
              <div className="display display-md" style={{ color: '#168c50' }}>Conectado</div>
              <p className="muted" style={{ marginBottom: 0 }}>O numero esta ativo e pronto.</p>
            </div>
          ) : (
            <div className="nl-empty" style={{ padding: 20 }}>
              <div className="display display-md">QR</div>
              <div>{instancia ? 'Evolution ainda nao retornou o QR.' : 'Aparece aqui apos criar a instancia.'}</div>
              {instancia && <p className="faint" style={{ fontSize: '0.82rem', marginBottom: 0 }}>A tela tenta renovar automaticamente a cada 4s.</p>}
              {pairingCode && <PairingCode value={pairingCode} />}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function PairingCode({ value }: { value: string }) {
  return (
    <div className="nl-pairing-code">
      <span>Codigo de pareamento</span>
      <b>{value}</b>
    </div>
  );
}
