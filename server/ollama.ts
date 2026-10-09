import { config } from './config.js';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaStatus {
  ok: boolean;
  models: string[];
  chatModelReady: boolean;
  embedModelReady: boolean;
}

export async function ollamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${config.ollamaBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name);
    const has = (needle: string) =>
      models.some((m) => m === needle || m.startsWith(needle.split(':')[0] + ':'));
    return {
      ok: true,
      models,
      chatModelReady: has(config.chatModel),
      embedModelReady: has(config.embedModel),
    };
  } catch {
    return { ok: false, models: [], chatModelReady: false, embedModelReady: false };
  }
}

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${config.ollamaBaseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.embedModel, input: text.slice(0, 8000) }),
  });
  if (!res.ok) throw new Error(`Ollama embed: HTTP ${res.status}`);
  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings[0];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${config.ollamaBaseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.embedModel,
      input: texts.map((t) => t.slice(0, 8000)),
    }),
  });
  if (!res.ok) throw new Error(`Ollama embed batch: HTTP ${res.status}`);
  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings;
}

export async function chatStream(
  messages: OllamaMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.chatModel, messages, stream: true }),
      signal,
    });
  } catch (err) {
    throw ollamaFetchError(err);
  }
  if (!res.ok) throw new Error(`Ollama chat: HTTP ${res.status}`);
  if (!res.body) throw new Error('Ollama chat: пустой ответ');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed) as {
          message?: { content?: string };
          done?: boolean;
        };
        const token = json.message?.content ?? '';
        if (token) {
          full += token;
          onToken(token);
        }
      } catch {
      }
    }
  }
  return full;
}

export async function generateJson<T>(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.chatModel,
        stream: false,
        format: 'json',
        options: { temperature: 0.1 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal,
    });
  } catch (err) {
    throw ollamaFetchError(err);
  }
  if (!res.ok) throw new Error(`Ollama generate: HTTP ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content ?? '';
  const match = content.match(/[\[{][\s\S]*[\]}]/);
  if (!match) throw new Error('LLM не вернул JSON');
  return JSON.parse(match[0]) as T;
}

function ollamaFetchError(err: unknown): Error {
  const msg = (err as Error)?.message ?? String(err);
  if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
    return new Error(
      `Ollama недоступен (${config.ollamaBaseUrl}). Запустите: ollama serve`,
    );
  }
  return err as Error;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
