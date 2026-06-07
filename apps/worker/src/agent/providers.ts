import type { RespostaLlm } from './openai';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function chamarAnthropic(opts: { apiKey: string; modelo: string; messages: ChatMessage[] }): Promise<RespostaLlm> {
  const system = opts.messages.find((m) => m.role === 'system')?.content ?? '';
  const messages = opts.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.modelo || 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  const texto = (data.content ?? [])
    .filter((item: any) => item.type === 'text')
    .map((item: any) => item.text)
    .join('\n')
    .trim() || null;
  return {
    message: { role: 'assistant', content: texto },
    toolCalls: [],
    texto,
    tokensIn: data.usage?.input_tokens ?? 0,
    tokensOut: data.usage?.output_tokens ?? 0,
  };
}

export async function chamarGoogle(opts: { apiKey: string; modelo: string; messages: ChatMessage[] }): Promise<RespostaLlm> {
  const model = opts.modelo || 'gemini-1.5-flash';
  const system = opts.messages.find((m) => m.role === 'system')?.content ?? '';
  const history = opts.messages.filter((m) => m.role !== 'system');
  const contents = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig: { maxOutputTokens: 800 },
    }),
  });
  if (!res.ok) throw new Error(`google ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  const texto = data.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text)
    .filter(Boolean)
    .join('\n')
    .trim() || null;
  return {
    message: { role: 'assistant', content: texto },
    toolCalls: [],
    texto,
    tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
