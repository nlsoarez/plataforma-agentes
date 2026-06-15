'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';
import { BRAND } from '../../lib/brand';

const API = BRAND.apiUrl || 'http://localhost:3000';

type AccountResponse = {
  usuario: {
    id: string;
    nome: string | null;
    email: string;
    papel: string;
    status: string;
    avatar_url: string | null;
    auth_provider: string;
    telefone: string | null;
    cargo: string | null;
    timezone: string | null;
    locale: string | null;
    preferencias: {
      emailNotifications?: boolean;
      productUpdates?: boolean;
      compactMode?: boolean;
    } | null;
    email_verified_at: string | null;
    ultimo_login_em: string | null;
    criado_em: string;
    atualizado_em: string | null;
    departamento_nome: string | null;
    tenant_nome: string;
    tenant_dominio: string;
  };
  assinatura: {
    acesso: string;
    pode_usar: boolean;
    assinatura: any;
    plano: any;
  };
};

type ProfileForm = {
  nome: string;
  telefone: string;
  cargo: string;
  avatarUrl: string;
  timezone: string;
  locale: string;
  emailNotifications: boolean;
  productUpdates: boolean;
  compactMode: boolean;
};

export default function ConfiguracoesPage() {
  const { token, ready } = useStoredToken();
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm());
  const [password, setPassword] = useState({ senhaAtual: '', novaSenha: '', confirmar: '' });
  const [profileMsg, setProfileMsg] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    if (!token) return;
    void carregar();
  }, [token]);

  async function carregar() {
    if (!token) return;
    const r = await fetch(`${API}/account`, { headers: auth(token) });
    const data = await r.json();
    if (!r.ok) {
      setProfileMsg(data?.message || 'Erro ao carregar configuracoes.');
      return;
    }
    setAccount(data);
    setForm(fromAccount(data));
  }

  async function salvarPerfil() {
    if (!token) return;
    setSavingProfile(true);
    setProfileMsg('');
    const r = await fetch(`${API}/account/profile`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({
        nome: form.nome,
        telefone: form.telefone,
        cargo: form.cargo,
        avatarUrl: form.avatarUrl,
        timezone: form.timezone,
        locale: form.locale,
        preferencias: {
          emailNotifications: form.emailNotifications,
          productUpdates: form.productUpdates,
          compactMode: form.compactMode,
        },
      }),
    });
    const data = await r.json();
    setSavingProfile(false);
    if (!r.ok) {
      setProfileMsg(data?.message || JSON.stringify(data));
      return;
    }
    setAccount((current) => current ? { ...current, usuario: { ...current.usuario, ...data } } : current);
    setProfileMsg('Configuracoes salvas.');
  }

  async function alterarSenha() {
    if (!token) return;
    setPasswordMsg('');
    if (password.novaSenha.length < 8) {
      setPasswordMsg('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password.novaSenha !== password.confirmar) {
      setPasswordMsg('A confirmacao da senha nao confere.');
      return;
    }
    setSavingPassword(true);
    const r = await fetch(`${API}/account/password`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ senhaAtual: password.senhaAtual, novaSenha: password.novaSenha }),
    });
    const data = await r.json();
    setSavingPassword(false);
    if (!r.ok) {
      setPasswordMsg(data?.message || JSON.stringify(data));
      return;
    }
    setPassword({ senhaAtual: '', novaSenha: '', confirmar: '' });
    setPasswordMsg('Senha alterada.');
  }

  const initials = useMemo(() => {
    const base = form.nome || account?.usuario.email || 'C';
    return base.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C';
  }, [form.nome, account?.usuario.email]);

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  const user = account?.usuario;
  const planName = account?.assinatura?.plano?.name || account?.assinatura?.plano?.nome || 'Sem plano ativo';
  const subscriptionStatus = account?.assinatura?.assinatura?.status || account?.assinatura?.acesso || '-';
  const canUse = account?.assinatura?.pode_usar;
  const needsCurrentPassword = user?.auth_provider?.includes('password') ?? true;

  return (
    <Shell title="Configurações">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Configurações</h1>
          <div className="sub">Perfil, segurança, assinatura e preferências da sua conta</div>
        </div>
      </div>

      <div className="nl-settings-layout nl-rise">
        <section className="nl-card nl-card--pad nl-profile-card">
          <div className="nl-profile-hero">
            <div className="nl-avatar-preview">
              {form.avatarUrl ? <img src={form.avatarUrl} alt="Foto do perfil" /> : <span>{initials}</span>}
            </div>
            <div>
              <h2>{form.nome || user?.email || 'Seu perfil'}</h2>
              <p>{user?.email || 'Carregando e-mail...'}</p>
              <div className="nl-row" style={{ marginTop: 10, gap: 8 }}>
                <span className="nl-badge">{user?.papel || 'usuario'}</span>
                <span className={`nl-badge ${user?.status === 'ativo' ? 'nl-badge--ok' : 'nl-badge--warn'}`}>
                  {user?.status || '-'}
                </span>
              </div>
            </div>
          </div>

          <div className="nl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 22 }}>
            <Field label="Nome completo" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
            <Field label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} placeholder="(00) 00000-0000" />
            <Field label="Cargo ou função" value={form.cargo} onChange={(v) => setForm({ ...form, cargo: v })} placeholder="Ex: gestor comercial" />
            <Field label="URL da foto" value={form.avatarUrl} onChange={(v) => setForm({ ...form, avatarUrl: v })} placeholder="https://..." />
            <Field label="Fuso horário" value={form.timezone} onChange={(v) => setForm({ ...form, timezone: v })} />
            <Field label="Idioma" value={form.locale} onChange={(v) => setForm({ ...form, locale: v })} />
          </div>

          <div className="nl-settings-actions">
            <button className="nl-btn nl-btn--accent" onClick={salvarPerfil} disabled={savingProfile}>
              {savingProfile ? 'Salvando...' : 'Salvar perfil'}
            </button>
            {profileMsg ? <span className={profileMsg.includes('salvas') ? 'nl-success' : 'nl-error'}>{profileMsg}</span> : null}
          </div>
        </section>

        <aside className="nl-settings-side">
          <section className="nl-card nl-card--pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Assinatura</div>
            <h3 className="nl-settings-card-title">{planName}</h3>
            <p className="muted" style={{ marginTop: 8 }}>
              Status: <b>{subscriptionStatus}</b>
            </p>
            <span className={`nl-badge ${canUse ? 'nl-badge--ok' : 'nl-badge--warn'}`} style={{ marginTop: 14 }}>
              {canUse ? 'Acesso liberado' : 'Acesso restrito'}
            </span>
            <a className="nl-btn nl-btn--ghost" href="/billing" style={{ width: '100%', marginTop: 16 }}>
              Ver assinatura
            </a>
          </section>

          <section className="nl-card nl-card--pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Conta</div>
            <div className="nl-settings-meta">
              <span>Empresa</span>
              <b>{user?.tenant_nome || '-'}</b>
              <span>Domínio</span>
              <b>{user?.tenant_dominio || '-'}</b>
              <span>Departamento</span>
              <b>{user?.departamento_nome || 'Sem departamento'}</b>
              <span>Último login</span>
              <b>{formatDate(user?.ultimo_login_em)}</b>
            </div>
          </section>
        </aside>
      </div>

      <div className="nl-dashboard-grid" style={{ marginTop: 14 }}>
        <section className="nl-card nl-card--pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Segurança</div>
          <h3 className="nl-settings-card-title">Alterar senha</h3>
          <p className="muted" style={{ marginTop: 6, marginBottom: 18 }}>
            {needsCurrentPassword
              ? 'Informe a senha atual para proteger a troca.'
              : 'Sua conta veio do Google. Voce pode criar uma senha local para tambem entrar por e-mail.'}
          </p>
          {needsCurrentPassword ? (
            <Field
              type="password"
              label="Senha atual"
              value={password.senhaAtual}
              onChange={(v) => setPassword({ ...password, senhaAtual: v })}
            />
          ) : null}
          <div className="nl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 12 }}>
            <Field
              type="password"
              label="Nova senha"
              value={password.novaSenha}
              onChange={(v) => setPassword({ ...password, novaSenha: v })}
            />
            <Field
              type="password"
              label="Confirmar nova senha"
              value={password.confirmar}
              onChange={(v) => setPassword({ ...password, confirmar: v })}
            />
          </div>
          <div className="nl-settings-actions">
            <button className="nl-btn nl-btn--accent" onClick={alterarSenha} disabled={savingPassword}>
              {savingPassword ? 'Alterando...' : 'Alterar senha'}
            </button>
            {passwordMsg ? <span className={passwordMsg.includes('alterada') ? 'nl-success' : 'nl-error'}>{passwordMsg}</span> : null}
          </div>
        </section>

        <section className="nl-card nl-card--pad">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Preferências</div>
          <h3 className="nl-settings-card-title">Notificações e uso</h3>
          <div className="nl-settings-switches">
            <CheckRow
              title="Receber alertas por e-mail"
              text="Avisos de cobrança, integrações e falhas importantes."
              checked={form.emailNotifications}
              onChange={(checked) => setForm({ ...form, emailNotifications: checked })}
            />
            <CheckRow
              title="Receber novidades do produto"
              text="Atualizações de recursos, melhorias e comunicados da Comunora."
              checked={form.productUpdates}
              onChange={(checked) => setForm({ ...form, productUpdates: checked })}
            />
            <CheckRow
              title="Modo compacto"
              text="Preferência visual para telas com mais densidade de informação."
              checked={form.compactMode}
              onChange={(checked) => setForm({ ...form, compactMode: checked })}
            />
          </div>
          <button className="nl-btn nl-btn--ghost" onClick={salvarPerfil} disabled={savingProfile} style={{ marginTop: 18 }}>
            Salvar preferências
          </button>
        </section>
      </div>
    </Shell>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="nl-label">{label}</label>
      <input
        className="nl-input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function CheckRow({
  title,
  text,
  checked,
  onChange,
}: {
  title: string;
  text: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="nl-settings-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <b>{title}</b>
        <small>{text}</small>
      </span>
    </label>
  );
}

function emptyForm(): ProfileForm {
  return {
    nome: '',
    telefone: '',
    cargo: '',
    avatarUrl: '',
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
    emailNotifications: true,
    productUpdates: true,
    compactMode: false,
  };
}

function fromAccount(account: AccountResponse): ProfileForm {
  const prefs = account.usuario.preferencias || {};
  return {
    nome: account.usuario.nome || '',
    telefone: account.usuario.telefone || '',
    cargo: account.usuario.cargo || '',
    avatarUrl: account.usuario.avatar_url || '',
    timezone: account.usuario.timezone || 'America/Sao_Paulo',
    locale: account.usuario.locale || 'pt-BR',
    emailNotifications: prefs.emailNotifications !== false,
    productUpdates: prefs.productUpdates !== false,
    compactMode: prefs.compactMode === true,
  };
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
