import { resolverSegredo } from '@plataforma/shared';
import { chamarOpenAI } from './openai';
import { TOOLS_SCHEMA, executarTool, type ToolCtx } from './tools';

const MAX_ITER = 4;

export interface ResultadoAgente {
  texto: string | null;
  tokensIn: number;
  tokensOut: number;
  handoff: boolean;
}

// Roda o agente: monta contexto, chama o LLM, executa tools em loop ate a resposta final.
export async function rodarAgente(opts: {
  agente: { prompt_sistema: string; modelo: string; provider: string; byok_key_ref: string };
  historico: { autor: string; conteudo: string }[];
  ctx: Omit<ToolCtx, 'handoff'>;
}): Promise<ResultadoAgente> {
  if (opts.agente.provider !== 'openai') {
    // TODO: providers anthropic/google. Estrutura pronta, falta o tradutor de formato.
    throw new Error(`provider ${opts.agente.provider} ainda nao implementado`);
  }

  const apiKey = await resolverSegredo(opts.agente.byok_key_ref); // chave do cofre, nunca do banco
  const ctx: ToolCtx = { ...opts.ctx, handoff: false };

  const messages: any[] = [
    { role: 'system', content: opts.agente.prompt_sistema || 'Voce e um assistente de atendimento.' },
    ...opts.historico
      .filter((m) => m.autor !== 'sistema')
      .map((m) => ({ role: m.autor === 'contato' ? 'user' : 'assistant', content: m.conteudo })),
  ];

  let tokensIn = 0, tokensOut = 0;

  for (let i = 0; i < MAX_ITER; i++) {
    const r = await chamarOpenAI({ apiKey, modelo: opts.agente.modelo, messages, tools: TOOLS_SCHEMA });
    tokensIn += r.tokensIn; tokensOut += r.tokensOut;

    if (r.toolCalls.length === 0) {
      return { texto: r.texto, tokensIn, tokensOut, handoff: ctx.handoff };
    }

    messages.push(r.message); // assistant com tool_calls
    for (const tc of r.toolCalls) {
      const resultado = await executarTool(ctx, tc.nome, tc.argumentos);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(resultado) });
    }
  }
  // Esgotou as iteracoes sem resposta textual.
  return { texto: null, tokensIn, tokensOut, handoff: ctx.handoff };
}
