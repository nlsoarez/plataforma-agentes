// Chamada ao Chat Completions da OpenAI usando a chave BYOK do cliente.
// Roda na sua infra (Railway/VPS), nao aqui. Multi-LLM: adicionar outros providers ao lado.
export interface RespostaLlm {
  message: any;                 // mensagem do assistant (pode ter tool_calls)
  toolCalls: { id: string; nome: string; argumentos: any }[];
  texto: string | null;
  tokensIn: number;
  tokensOut: number;
}

export async function chamarOpenAI(opts: {
  apiKey: string; modelo: string; messages: any[]; tools: readonly unknown[];
}): Promise<RespostaLlm> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: opts.modelo, messages: opts.messages, tools: opts.tools, tool_choice: 'auto' }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as any;
  const message = data.choices?.[0]?.message ?? {};
  const toolCalls = (message.tool_calls ?? []).map((tc: any) => ({
    id: tc.id, nome: tc.function.name, argumentos: JSON.parse(tc.function.arguments || '{}'),
  }));
  return {
    message,
    toolCalls,
    texto: message.content ?? null,
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  };
}
