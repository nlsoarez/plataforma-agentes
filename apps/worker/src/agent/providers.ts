import type { RespostaLlm } from './openai';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: any };

const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
let anthropicModelFallback: string | null = null;

async function lerJsonOuTexto(r: Response) {
  const text = await r.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function escolherModeloAnthropic(modelos: string[]) {
  return modelos.find((id) => id === DEFAULT_ANTHROPIC_MODEL)
    ?? modelos.find((id) => id.includes('haiku'))
    ?? modelos.find((id) => id.includes('sonnet'))
    ?? modelos[0]
    ?? DEFAULT_ANTHROPIC_MODEL;
}

async function resolverFallbackAnthropic(apiKey: string) {
  if (anthropicModelFallback) return anthropicModelFallback;
  const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
  });
  const data = await lerJsonOuTexto(r) as any;
  if (!r.ok) throw new Error(`anthropic models ${r.status}: ${JSON.stringify(data)}`);
  const modelos = Array.isArray(data?.data)
    ? data.data.map((item: any) => String(item.id || '')).filter(Boolean)
    : [];
  anthropicModelFallback = escolherModeloAnthropic(modelos);
  return anthropicModelFallback;
}

async function postAnthropic(opts: {
  apiKey: string;
  modelo: string;
  system: string;
  messages: { role: string; content: any }[];
  tools?: readonly unknown[];
}) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.modelo,
      max_tokens: 800,
      system: opts.system,
      messages: opts.messages,
      tools: opts.tools ? anthropicTools(opts.tools) : undefined,
    }),
  });
  const data = await lerJsonOuTexto(res);
  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${JSON.stringify(data)}`);
  }
  return data as any;
}

export async function chamarAnthropic(opts: {
  apiKey: string;
  modelo: string;
  messages: ChatMessage[];
  tools?: readonly unknown[];
}): Promise<RespostaLlm> {
  const system = opts.messages.find((m) => m.role === 'system')?.content ?? '';
  const messages = opts.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: normalizarConteudoAnthropic(m.content) }));

  const modelo = opts.modelo || DEFAULT_ANTHROPIC_MODEL;
  let data: any;
  try {
    data = await postAnthropic({ apiKey: opts.apiKey, modelo, system, messages, tools: opts.tools });
  } catch (err: any) {
    const message = String(err?.message || '');
    if (!message.includes('anthropic 404') || !message.includes('model')) throw err;
    const fallback = await resolverFallbackAnthropic(opts.apiKey);
    data = await postAnthropic({ apiKey: opts.apiKey, modelo: fallback, system, messages, tools: opts.tools });
  }
  const texto = (data.content ?? [])
    .filter((item: any) => item.type === 'text')
    .map((item: any) => item.text)
    .join('\n')
    .trim() || null;
  const toolCalls = (data.content ?? [])
    .filter((item: any) => item.type === 'tool_use')
    .map((item: any) => ({ id: item.id, nome: item.name, argumentos: item.input || {} }));
  return {
    message: { role: 'assistant', content: data.content ?? [] },
    toolCalls,
    texto,
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
  };
}

function anthropicTools(tools: readonly unknown[]) {
  return tools.map((tool: any) => ({
    name: tool.function?.name,
    description: tool.function?.description,
    input_schema: tool.function?.parameters || { type: 'object', properties: {} },
  })).filter((tool: any) => tool.name);
}

function normalizarConteudoAnthropic(content: any) {
  if (Array.isArray(content)) return content;
  return String(content ?? '');
}

export async function chamarGoogle(opts: {
  apiKey: string;
  modelo: string;
  messages: ChatMessage[];
  tools?: readonly unknown[];
}): Promise<RespostaLlm> {
  const model = opts.modelo || 'gemini-1.5-flash';
  const system = opts.messages.find((m) => m.role === 'system')?.content ?? '';
  const history = opts.messages.filter((m) => m.role !== 'system');
  const contents = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: normalizarConteudoGoogle(m.content),
  }));

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      tools: opts.tools ? googleTools(opts.tools) : undefined,
      generationConfig: { maxOutputTokens: 800 },
    }),
  });
  if (!res.ok) throw new Error(`google ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const texto = parts
    ?.map((part: any) => part.text)
    .filter(Boolean)
    .join('\n')
    .trim() || null;
  const toolCalls = parts
    .filter((part: any) => part.functionCall?.name)
    .map((part: any, index: number) => ({
      id: `google-tool-${index}`,
      nome: part.functionCall.name,
      argumentos: part.functionCall.args || {},
    }));
  return {
    message: { role: 'assistant', content: parts },
    toolCalls,
    texto,
    tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

function googleTools(tools: readonly unknown[]) {
  const functionDeclarations = tools.map((tool: any) => ({
    name: tool.function?.name,
    description: tool.function?.description,
    parameters: limparSchemaGoogle(tool.function?.parameters || { type: 'object', properties: {} }),
  })).filter((tool: any) => tool.name);
  return functionDeclarations.length ? [{ functionDeclarations }] : undefined;
}

function limparSchemaGoogle(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(limparSchemaGoogle);
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') continue;
    out[key] = limparSchemaGoogle(value);
  }
  return out;
}

function normalizarConteudoGoogle(content: any) {
  if (Array.isArray(content)) return content;
  return [{ text: String(content ?? '') }];
}
