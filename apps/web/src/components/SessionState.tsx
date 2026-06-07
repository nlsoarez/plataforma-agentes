'use client';

import { useEffect, useState } from 'react';

type StoredTokenState = {
  token: string | null;
  ready: boolean;
};

export function useStoredToken(): StoredTokenState {
  const [session, setSession] = useState<StoredTokenState>({ token: null, ready: false });

  useEffect(() => {
    setSession({ token: window.localStorage.getItem('token'), ready: true });
  }, []);

  return session;
}

export function expireSession() {
  window.localStorage.removeItem('token');
  window.location.href = '/login';
}

export function SessionLoading() {
  return (
    <main className="nl-session-state">
      <div className="nl-card nl-card--pad">
        <div className="display display-md">Verificando sessão</div>
        <p className="muted">Aguarde enquanto validamos seu acesso.</p>
      </div>
    </main>
  );
}

export function SessionRequired() {
  return (
    <main className="nl-session-state">
      <div className="nl-card nl-card--pad">
        <div className="display display-md">Sessão necessária</div>
        <p className="muted">Entre novamente para acessar esta área.</p>
        <a className="nl-btn nl-btn--accent" href="/login">Ir para o login</a>
      </div>
    </main>
  );
}
