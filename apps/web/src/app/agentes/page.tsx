'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '../../components/Shell';
import { SessionLoading, SessionRequired, useStoredToken } from '../../components/SessionState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type AgentRow = {
  projeto_id: string;
  projeto_nome: string;
  phone_number_id: string | null;
  whatsapp_number: string | null;
  projeto_status: string;
  transporte_driver: string;
  agente_id: string | null;
  prompt_sistema: string | null;
  modelo: string | null;
  provider: string | null;
  byok_key_ref: string | null;
  agente_status: string | null;
  horario_ativo: boolean | null;
  horario_inicio: string | null;
  horario_fim: string | null;
  provider_default_model: string | null;
  provider_key_last4: string | null;
};

type ReportSetting = {
  projeto_id: string;
  projeto_nome: string;
  ativo: boolean;
  horario: string;
  canal: 'whatsapp' | 'email';
  destino: string;
  ultimo_envio_em: string | null;
  ultimo_erro: string | null;
};

type ProfessionTemplate = { id: string; nome: string; descricao: string };

const DEFAULT_PROMPT = `Você é um atendente objetivo, educado e comercial.
Responda em português do Brasil.
Faça perguntas curtas para entender a necessidade do lead.
Quando o cliente pedir atendimento humano, acione handoff.
Nunca invente preço, prazo ou política que não esteja no contexto.`;

const PROVIDERS: Record<string, { label: string; model: string; keyPageLabel: string }> = {
  openai: { label: 'OpenAI', model: 'gpt-4o-mini', keyPageLabel: 'OpenAI' },
  anthropic: { label: 'Anthropic Claude', model: 'claude-haiku-4-5-20251001', keyPageLabel: 'Anthropic' },
  google: { label: 'Google Gemini', model: 'gemini-1.5-flash', keyPageLabel: 'Google Gemini' },
};

const STATUS_OPTIONS = [
  {
    value: 'ativo',
    label: 'Ativo',
    description: 'Responde automaticamente quando chegar mensagem e estiver dentro do horário.',
  },
  {
    value: 'pausado',
    label: 'Pausado',
    description: 'Novas mensagens continuam no Inbox, sem resposta da IA.',
  },
  {
    value: 'inativo',
    label: 'Desativado',
    description: 'Mantém a configuração salva, mas este número fica sem agente automático.',
  },
] as const;

function badgeClass(status?: string | null) {
  if (status === 'ativo') return 'nl-badge--ok';
  if (status === 'inativo') return 'nl-badge--off';
  if (status === 'pausado') return 'nl-badge--warn';
  return 'nl-badge--muted';
}

function formatPhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return `+${digits}`;
}

function connectionTitle(row: AgentRow) {
  return formatPhone(row.whatsapp_number) || 'Número não identificado';
}

function isSuccessMessage(value: string) {
  return /salvo|ativado|pausado|desativado|excluido|excluído|enfileirado|enviad/i.test(value);
}

export default function AgentesPage() {
  const { token, ready } = useStoredToken();
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [templates, setTemplates] = useState<ProfessionTemplate[]>([]);
  const [templateId, setTemplateId] = useState('comercial');
  const [templateProjectName, setTemplateProjectName] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [form, setForm] = useState({
    prompt_sistema: DEFAULT_PROMPT,
    modelo: PROVIDERS.openai.model,
    provider: 'openai',
    byok_key_ref: '',
    status: 'ativo',
    horario_ativo: false,
    horario_inicio: '08:00',
    horario_fim: '18:00',
  });
  const [reportSettings, setReportSettings] = useState<Record<string, ReportSetting>>({});
  const [reportForm, setReportForm] = useState({
    ativo: false,
    horario: '18:00',
    canal: 'whatsapp' as 'whatsapp' | 'email',
    destino: '',
  });
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState('');

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const selected = useMemo(() => rows.find((r) => r.projeto_id === selectedId) ?? rows[0], [rows, selectedId]);
  const selectedReport = selected ? reportSettings[selected.projeto_id] : null;

  useEffect(() => { if (token) carregar(); }, [token]);

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.projeto_id);
    const provider = selected.provider || 'openai';
    setForm({
      prompt_sistema: selected.prompt_sistema || DEFAULT_PROMPT,
      modelo: selected.modelo || selected.provider_default_model || PROVIDERS[provider]?.model || PROVIDERS.openai.model,
      provider,
      byok_key_ref: selected.byok_key_ref || '',
      status: selected.agente_status === 'pausado' || selected.agente_status === 'inativo' ? selected.agente_status : 'ativo',
      horario_ativo: Boolean(selected.horario_ativo),
      horario_inicio: selected.horario_inicio || '08:00',
      horario_fim: selected.horario_fim || '18:00',
    });
  }, [selected?.projeto_id]);

  useEffect(() => {
    if (!selected) return;
    const current = reportSettings[selected.projeto_id];
    setReportForm({
      ativo: Boolean(current?.ativo),
      horario: current?.horario || '18:00',
      canal: current?.canal || 'whatsapp',
      destino: current?.destino || '',
    });
  }, [selected?.projeto_id, reportSettings]);

  function trocarProvider(provider: string) {
    setForm((current) => ({
      ...current,
      provider,
      modelo: PROVIDERS[provider]?.model || current.modelo,
    }));
  }

  async function carregar(options?: { preserveMessage?: boolean }) {
    if (!token) return;
    setLoading(true);
    if (!options?.preserveMessage) setMsg('');
    try {
      const [agentsResponse, reportsResponse] = await Promise.all([
        fetch(`${API}/agentes`, { headers: auth(token) }),
        fetch(`${API}/reports/settings`, { headers: auth(token) }),
      ]);
      const agents = await agentsResponse.json();
      const reports = await reportsResponse.json();
      if (!agentsResponse.ok) throw new Error(agents?.message || 'Falha ao carregar agentes');
      if (!reportsResponse.ok) throw new Error(reports?.message || 'Falha ao carregar relatórios');
      const list = Array.isArray(agents) ? agents : [];
      setRows(list);
      setReportSettings(Object.fromEntries((Array.isArray(reports) ? reports : []).map((item: ReportSetting) => [item.projeto_id, item])));
      if (!selectedId && list[0]) setSelectedId(list[0].projeto_id);
      fetch(`${API}/templates/professions`, { headers: auth(token) })
        .then((response) => response.ok ? response.json() : [])
        .then((data) => setTemplates(Array.isArray(data) ? data : []))
        .catch(() => null);
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao carregar agentes');
    } finally {
      setLoading(false);
    }
  }

  async function criarAgentePorTemplate() {
    if (!token || !templateId || loading) return;
    setLoading(true);
    setMsg('');
    try {
      const selectedTemplate = templates.find((template) => template.id === templateId);
      const r = await fetch(`${API}/templates/professions/${templateId}/importar`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({ nomeProjeto: templateProjectName || selectedTemplate?.nome || 'Novo agente' }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || 'Falha ao criar agente por segmento');
      setTemplateProjectName('');
      setSelectedId(d.projeto?.id || '');
      setMsg('Agente criado por template. Conecte um WhatsApp para este projeto.');
      await carregar({ preserveMessage: true });
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao criar agente por segmento');
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    if (!token || !selected) return;
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/agentes/${selected.projeto_id}`, {
        method: 'PUT',
        headers: auth(token),
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || 'Falha ao salvar agente');
      setMsg(form.status === 'inativo' ? 'Agente salvo e desativado.' : form.status === 'pausado' ? 'Agente salvo e pausado.' : 'Agente salvo e ativado.');
      await carregar({ preserveMessage: true });
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao salvar agente');
    } finally {
      setLoading(false);
    }
  }

  async function excluirAgente() {
    if (!token || !selected || deleting) return;
    if (!confirm(`Excluir a configuração do agente de "${connectionTitle(selected)}"? A conexão WhatsApp será mantida.`)) return;

    setDeleting(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/agentes/${selected.projeto_id}`, { method: 'DELETE', headers: auth(token) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d?.message || 'Falha ao excluir agente');
      setMsg(Number(d.deleted || 0) > 0 ? 'Agente excluído. A conexão WhatsApp foi mantida.' : 'Nenhuma configuração de agente encontrada para excluir.');
      await carregar({ preserveMessage: true });
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao excluir agente');
    } finally {
      setDeleting(false);
    }
  }

  async function salvarRelatorio() {
    if (!token || !selected) return;
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/reports/settings/${selected.projeto_id}`, {
        method: 'PUT',
        headers: auth(token),
        body: JSON.stringify({ ...reportForm, timezone: 'America/Sao_Paulo' }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || 'Falha ao salvar relatório');
      setMsg(reportForm.ativo ? 'Relatório diário salvo e ativado.' : 'Relatório diário salvo e desativado.');
      await carregar({ preserveMessage: true });
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao salvar relatório diário');
    } finally {
      setLoading(false);
    }
  }

  async function enviarRelatorioTeste() {
    if (!token || !selected) return;
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/reports/settings/${selected.projeto_id}/test`, {
        method: 'POST',
        headers: auth(token),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) throw new Error(d?.message || 'Falha ao enfileirar teste');
      setMsg('Relatório de teste enfileirado. O worker fará o envio em instantes.');
      await carregar({ preserveMessage: true });
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao enviar relatório de teste');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <SessionLoading />;
  if (!token) return <SessionRequired />;

  return (
    <Shell title="Agentes">
      <div className="nl-page-head nl-rise">
        <div>
          <h1>Agentes</h1>
          <div className="sub">Configure qual agente responde em cada número conectado.</div>
        </div>
        <button className="nl-btn nl-btn--ghost" onClick={() => carregar()} disabled={loading}>Atualizar</button>
      </div>

      {templates.length > 0 && (
        <section className="nl-card nl-card--pad" style={{ maxWidth: 1120, marginBottom: 16 }}>
          <div className="nl-agent-report-card__head">
            <div>
              <div className="eyebrow">Novo agente por segmento</div>
              <h2>Comece com um modelo profissional</h2>
              <p className="muted">Cria prompt, pipeline, base inicial, lembrete de agenda e regra de reativacao para o nicho escolhido.</p>
            </div>
          </div>
          <div className="nl-grid" style={{ gridTemplateColumns: 'minmax(220px, 280px) minmax(220px, 1fr) auto', alignItems: 'end' }}>
            <div>
              <label className="nl-label">Segmento</label>
              <select className="nl-select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="nl-label">Nome do projeto/agente</label>
              <input className="nl-input" value={templateProjectName} onChange={(e) => setTemplateProjectName(e.target.value)} placeholder="ex: Atendimento Dra. Ana" />
            </div>
            <button className="nl-btn nl-btn--ghost" onClick={criarAgentePorTemplate} disabled={loading}>Criar agente</button>
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="nl-card nl-card--pad nl-empty" style={{ maxWidth: 520 }}>
          <div className="display display-md">Nenhuma conexão</div>
          <div>Conecte um número em Conectar WhatsApp primeiro.</div>
        </div>
      ) : (
        <div className="nl-agents-grid">
          <section className="nl-stack">
            <div className="nl-agent-list-head">
              <span>Números WhatsApp</span>
              <small>Cada conexão pode ter um agente próprio.</small>
            </div>
            {rows.map((row) => (
              <button
                key={row.projeto_id}
                className={`nl-agent-session ${row.projeto_id === selected?.projeto_id ? 'active' : ''}`}
                onClick={() => setSelectedId(row.projeto_id)}
              >
                <span>
                  <b>{row.projeto_nome}</b>
                  <small>{connectionTitle(row)}</small>
                  <small>Instância: {row.phone_number_id || 'sem conexão'}</small>
                </span>
                <i className={row.agente_status === 'ativo' ? 'ok' : row.agente_status === 'inativo' ? 'off' : ''}>
                  {row.agente_status || 'sem agente'}
                </i>
              </button>
            ))}
          </section>

          <section className="nl-card nl-card--pad">
            {selected && (
              <>
                <div className="nl-agent-head">
                  <div>
                    <div className="eyebrow">Agente do número</div>
                    <h2>{selected.projeto_nome}</h2>
                    <p className="muted">WhatsApp / {connectionTitle(selected)}</p>
                    <p className="faint">Instância Evolution: {selected.phone_number_id || 'sem rota'}</p>
                  </div>
                  <span className={`nl-badge ${badgeClass(selected.agente_status)}`}>{selected.agente_status || 'sem agente'}</span>
                </div>

                {msg && <div className={`nl-agent-feedback ${isSuccessMessage(msg) ? 'ok' : 'error'}`}>{msg}</div>}

                <div className="nl-agent-link-card">
                  <div>
                    <div className="eyebrow">Número vinculado</div>
                    <p>Este agente responde somente pelo número selecionado. Para outro WhatsApp, selecione outra conexão e salve uma configuração própria.</p>
                  </div>
                  <select className="nl-select" value={selected.projeto_id} onChange={(e) => setSelectedId(e.target.value)}>
                    {rows.map((row) => (
                      <option key={row.projeto_id} value={row.projeto_id}>
                        {row.projeto_nome} - {connectionTitle(row)}{row.phone_number_id ? ` - instância ${row.phone_number_id}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="nl-agent-runtime">
                  <div className="nl-agent-state-card">
                    <div>
                      <b>Estado do agente</b>
                      <small>Controla se a IA pode responder automaticamente neste número.</small>
                    </div>
                    <div className="nl-agent-status-options">
                      {STATUS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`nl-agent-status-option ${form.status === option.value ? 'active' : ''} ${option.value}`}
                          onClick={() => setForm({ ...form, status: option.value })}
                        >
                          <span>{option.label}</span>
                          <small>{option.description}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="nl-agent-schedule">
                    <label className="nl-agent-toggle">
                      <input
                        type="checkbox"
                        checked={form.horario_ativo}
                        onChange={(e) => setForm({ ...form, horario_ativo: e.target.checked })}
                      />
                      <span>
                        <b>Usar horário de funcionamento</b>
                        <small>Fora desse período, o atendimento fica humano/manual. Horário de Brasília.</small>
                      </span>
                    </label>
                    <div className="nl-agent-schedule__times">
                      <div>
                        <label className="nl-label">Início</label>
                        <input className="nl-input" type="time" value={form.horario_inicio} disabled={!form.horario_ativo} onChange={(e) => setForm({ ...form, horario_inicio: e.target.value })} />
                      </div>
                      <div>
                        <label className="nl-label">Fim</label>
                        <input className="nl-input" type="time" value={form.horario_fim} disabled={!form.horario_ativo} onChange={(e) => setForm({ ...form, horario_fim: e.target.value })} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="nl-agent-report-card">
                  <div className="nl-agent-report-card__head">
                    <div>
                      <div className="eyebrow">Relatório diário</div>
                      <h3>Resumo automático da operação</h3>
                      <p className="muted">Envia conversas, respostas da IA, novos contatos, agendamentos e handoffs para WhatsApp ou e-mail.</p>
                    </div>
                    <label className="nl-switch">
                      <input type="checkbox" checked={reportForm.ativo} onChange={(e) => setReportForm({ ...reportForm, ativo: e.target.checked })} />
                      <span>{reportForm.ativo ? 'Ativo' : 'Inativo'}</span>
                    </label>
                  </div>

                  <div className="nl-grid nl-agent-report-grid">
                    <div>
                      <label className="nl-label">Horário de envio</label>
                      <input className="nl-input" type="time" value={reportForm.horario} onChange={(e) => setReportForm({ ...reportForm, horario: e.target.value })} />
                    </div>
                    <div>
                      <label className="nl-label">Canal</label>
                      <select className="nl-select" value={reportForm.canal} onChange={(e) => setReportForm({ ...reportForm, canal: e.target.value as 'whatsapp' | 'email', destino: '' })}>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">E-mail</option>
                      </select>
                    </div>
                    <div>
                      <label className="nl-label">{reportForm.canal === 'whatsapp' ? 'WhatsApp destino' : 'E-mail destino'}</label>
                      <input
                        className="nl-input"
                        value={reportForm.destino}
                        onChange={(e) => setReportForm({ ...reportForm, destino: e.target.value })}
                        placeholder={reportForm.canal === 'whatsapp' ? '5511999999999' : 'gestor@empresa.com'}
                      />
                    </div>
                    <div className="nl-agent-report-action" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="nl-btn nl-btn--ghost" onClick={salvarRelatorio} disabled={loading}>Salvar relatório</button>
                      <button className="nl-btn nl-btn--accent" onClick={enviarRelatorioTeste} disabled={loading}>Enviar teste</button>
                    </div>
                  </div>
                  <div className="faint">
                    {selectedReport?.ultimo_envio_em
                      ? `Último envio: ${new Date(selectedReport.ultimo_envio_em).toLocaleString('pt-BR')}`
                      : 'Ainda nenhum relatório foi enviado.'}
                    {selectedReport?.ultimo_erro ? ` Erro recente: ${selectedReport.ultimo_erro}` : ''}
                  </div>
                </div>

                {form.status !== 'inativo' && form.provider !== 'openai' && !selected.provider_key_last4 && !form.byok_key_ref && (
                  <div className="nl-error" style={{ marginBottom: 14 }}>
                    Chave {PROVIDERS[form.provider]?.keyPageLabel || form.provider} ainda não foi salva em IA e Custos.
                  </div>
                )}

                <div className="nl-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
                  <div>
                    <label className="nl-label">Provider</label>
                    <select className="nl-select" value={form.provider} onChange={(e) => trocarProvider(e.target.value)}>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic Claude</option>
                      <option value="google">Google Gemini</option>
                    </select>
                  </div>
                  <div>
                    <label className="nl-label">Modelo</label>
                    <input className="nl-input" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
                  </div>
                </div>

                <div className="nl-card nl-card--pad" style={{ background: 'rgba(21,101,255,0.06)', marginBottom: 14 }}>
                  <b>Chave {PROVIDERS[form.provider]?.keyPageLabel || 'IA'}</b>
                  <p className="muted" style={{ margin: '6px 0 12px', fontSize: '0.9rem' }}>
                    Configure, teste e salve a chave em IA e Custos. OpenAI, Anthropic e Google executam ferramentas como agenda, base de conhecimento e handoff.
                    {selected.provider_key_last4 ? ` Chave salva: ****${selected.provider_key_last4}.` : ''}
                  </p>
                  <a className="nl-btn nl-btn--ghost nl-btn--sm" href="/ai-settings">Abrir IA e Custos</a>
                </div>

                <label className="nl-label">Referência BYOK legada opcional</label>
                <input
                  className="nl-input"
                  value={form.byok_key_ref}
                  onChange={(e) => setForm({ ...form, byok_key_ref: e.target.value })}
                  placeholder="ex: OPENAI_KEY_CLIENTE_A"
                  style={{ marginBottom: 14 }}
                />

                <label className="nl-label">Prompt do sistema</label>
                <textarea className="nl-textarea" value={form.prompt_sistema} onChange={(e) => setForm({ ...form, prompt_sistema: e.target.value })} />

                <div className="nl-agent-actions">
                  <span className="faint">O worker responde somente quando o agente está ativo e dentro do horário configurado.</span>
                  <div className="nl-row" style={{ gap: 8 }}>
                    <button className="nl-btn nl-btn--danger" onClick={excluirAgente} disabled={loading || deleting}>
                      {deleting ? 'Excluindo...' : 'Excluir agente'}
                    </button>
                    <button className="nl-btn nl-btn--accent" onClick={salvar} disabled={loading || deleting}>Salvar agente</button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
