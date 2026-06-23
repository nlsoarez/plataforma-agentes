import { resolverSegredo } from '@plataforma/shared';
import { chamarOpenAI } from './openai';
import { chamarAnthropic, chamarGoogle } from './providers';
import { TOOLS_SCHEMA, executarTool, type ToolCtx } from './tools';
import { decryptSecret } from '../secrets';

const MAX_ITER = 4;

export interface ResultadoAgente {
  texto: string | null;
  tokensIn: number;
  tokensOut: number;
  handoff: boolean;
}

type AgenteRuntime = {
  prompt_sistema: string;
  modelo: string;
  provider: string;
  byok_key_ref?: string;
  encrypted_api_key?: string;
};

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function pareceChaveDireta(ref?: string | null) {
  const value = String(ref || '').trim();
  return /^(sk-|sk-ant-|AIza|ya29\.)/.test(value);
}

async function resolverApiKey(agente: AgenteRuntime) {
  if (agente.encrypted_api_key) return decryptSecret(agente.encrypted_api_key);
  const ref = String(agente.byok_key_ref || '').trim();
  if (!ref) return null;
  // Compatibilidade com agentes antigos onde o campo de referencia recebeu a chave em texto puro.
  if (pareceChaveDireta(ref)) return ref;
  return resolverSegredo(ref);
}

export async function rodarAgente(opts: {
  agente: AgenteRuntime;
  historico: { autor: string; conteudo: string }[];
  ctx: Omit<ToolCtx, 'handoff'>;
}): Promise<ResultadoAgente> {
  const apiKey = await resolverApiKey(opts.agente);
  if (!apiKey) throw new Error(`chave ${opts.agente.provider} nao configurada`);

  const ctx: ToolCtx = { ...opts.ctx, handoff: false };
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.agente.prompt_sistema || 'Voce e um assistente de atendimento.' },
    ...opts.historico
      .filter((m) => m.autor !== 'sistema')
      .map((m) => ({ role: m.autor === 'contato' ? 'user' : 'assistant', content: m.conteudo } as ChatMessage)),
  ];

  if (opts.agente.provider === 'anthropic') {
    let tokensIn = 0, tokensOut = 0;
    const anthropicMessages: any[] = [...messages];

    for (let i = 0; i < MAX_ITER; i++) {
      const r = await chamarAnthropic({ apiKey, modelo: opts.agente.modelo, messages: anthropicMessages, tools: TOOLS_SCHEMA });
      tokensIn += r.tokensIn;
      tokensOut += r.tokensOut;

      if (r.toolCalls.length === 0) {
        return { texto: r.texto, tokensIn, tokensOut, handoff: ctx.handoff };
      }

      anthropicMessages.push(r.message);
      const toolResults: any[] = [];
      for (const tc of r.toolCalls) {
        const resultado = await executarTool(ctx, tc.nome, tc.argumentos);
        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(resultado) });
      }
      anthropicMessages.push({ role: 'user', content: toolResults });
    }

    return { texto: null, tokensIn, tokensOut, handoff: ctx.handoff };
  }

  if (opts.agente.provider === 'google') {
    const r = await chamarGoogle({ apiKey, modelo: opts.agente.modelo, messages });
    return { texto: r.texto, tokensIn: r.tokensIn, tokensOut: r.tokensOut, handoff: false };
  }

  if (opts.agente.provider !== 'openai') {
    throw new Error(`provider ${opts.agente.provider} nao suportado`);
  }

  let tokensIn = 0, tokensOut = 0;
  const openAiMessages: any[] = [...messages];

  for (let i = 0; i < MAX_ITER; i++) {
    const r = await chamarOpenAI({ apiKey, modelo: opts.agente.modelo, messages: openAiMessages, tools: TOOLS_SCHEMA });
    tokensIn += r.tokensIn;
    tokensOut += r.tokensOut;

    if (r.toolCalls.length === 0) {
      return { texto: r.texto, tokensIn, tokensOut, handoff: ctx.handoff };
    }

    openAiMessages.push(r.message);
    for (const tc of r.toolCalls) {
      const resultado = await executarTool(ctx, tc.nome, tc.argumentos);
      openAiMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(resultado) });
    }
  }

  return { texto: null, tokensIn, tokensOut, handoff: ctx.handoff };
}
