import type {
  AppSettings,
  ChatMessage,
  CustomPattern,
  DocumentFull,
  DocumentMeta,
  EntityItem,
  Extraction,
  ExtractionResult,
  Health,
  SourceRef,
  Template,
  TemplateField,
  TestResult,
} from '@/types';

const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const getHealth = () => req<Health>('/health');

export const listDocuments = () => req<DocumentMeta[]>('/documents');
export const getDocument = (id: string) => req<DocumentFull>(`/documents/${id}`);
export const deleteDocument = (id: string) =>
  req<{ ok: boolean }>(`/documents/${id}`, { method: 'DELETE' });
export const reindexDocument = (id: string) =>
  req<{ ok: boolean; indexed: number }>(`/documents/${id}/reindex`, { method: 'POST' });

export function uploadDocument(file: File): Promise<{ id: string; title: string }> {
  const fd = new FormData();
  fd.append('file', file);
  return req(`/documents`, { method: 'POST', body: fd });
}

export const getEntities = (docId: string) =>
  req<EntityItem[]>(`/documents/${docId}/entities`);
export const analyzeEntities = (docId: string) =>
  req<{ ok: boolean; count: number }>(`/documents/${docId}/entities/analyze`, {
    method: 'POST',
  });

export const highlightInDocument = (
  docId: string,
  data: { pattern: string; label?: string; isRegex?: boolean; save?: boolean },
) =>
  req<{ ok: boolean; count: number }>(`/documents/${docId}/highlight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const clearCustomHighlights = (docId: string) =>
  req<{ ok: boolean }>(`/documents/${docId}/highlight`, { method: 'DELETE' });

export const rescanCustom = (docId: string) =>
  req<{ ok: boolean; count: number }>(`/documents/${docId}/rescan-custom`, {
    method: 'POST',
  });

export const exportDocumentUrl = (docId: string) => `${BASE}/documents/${docId}/export`;

export const sendDocument = (docId: string) =>
  req<{ ok: boolean; status: number }>(`/documents/${docId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

export const getSettings = () => req<AppSettings>('/settings');
export const saveSettings = (patch: Partial<AppSettings>) =>
  req<{ ok: boolean; settings?: AppSettings; warning?: string }>('/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
export const testConnection = (data: {
  kind: 'ollama' | 'database' | 'remote';
  baseUrl?: string;
  url?: string;
  token?: string;
}) =>
  req<TestResult>('/settings/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const listCustomPatterns = () => req<CustomPattern[]>('/custom-patterns');
export const createCustomPattern = (data: {
  label?: string;
  pattern: string;
  isRegex?: boolean;
}) =>
  req<CustomPattern>('/custom-patterns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
export const deleteCustomPattern = (id: string) =>
  req<{ ok: boolean }>(`/custom-patterns/${id}`, { method: 'DELETE' });

export const listTemplates = () => req<Template[]>('/templates');
export const createTemplate = (data: {
  name: string;
  description: string;
  fields: TemplateField[];
}) =>
  req<Template>('/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
export const updateTemplate = (
  id: string,
  data: { name: string; description: string; fields: TemplateField[] },
) =>
  req<Template>(`/templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
export const deleteTemplate = (id: string) =>
  req<{ ok: boolean }>(`/templates/${id}`, { method: 'DELETE' });

export const getHistory = (documentId?: string) =>
  req<ChatMessage[]>(
    `/chat/history${documentId ? `?documentId=${documentId}` : ''}`,
  );
export const clearHistory = (documentId?: string) =>
  req<{ ok: boolean }>(
    `/chat/history${documentId ? `?documentId=${documentId}` : ''}`,
    { method: 'DELETE' },
  );

export const listExtractions = (documentId?: string) =>
  req<Extraction[]>(`/extractions${documentId ? `?documentId=${documentId}` : ''}`);

interface SseHandlers {
  onEvent: (event: string, data: unknown) => void;
  onError?: (err: Error) => void;
}

export function ssePost(path: string, body: unknown, handlers: SseHandlers): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
        }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          let event = 'message';
          let data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          try {
            handlers.onEvent(event, JSON.parse(data));
          } catch {
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handlers.onError?.(err as Error);
    }
  })();

  return () => controller.abort();
}

export function streamChat(
  payload: { message: string; documentId: string | null },
  handlers: {
    onToken: (token: string) => void;
    onDone: (sources: SourceRef[]) => void;
    onError: (err: Error) => void;
  },
): () => void {
  return ssePost('/chat', payload, {
    onEvent: (event, data) => {
      if (event === 'token') handlers.onToken((data as { token: string }).token);
      else if (event === 'done')
        handlers.onDone((data as { sources: SourceRef[] }).sources);
      else if (event === 'error')
        handlers.onError(new Error((data as { error: string }).error));
    },
    onError: handlers.onError,
  });
}

export function streamExtract(
  payload: { documentId: string; templateId: string },
  handlers: {
    onProgress: (field: string) => void;
    onField: (field: string, result: ExtractionResult) => void;
    onDone: (results: Record<string, ExtractionResult>) => void;
    onError: (err: Error) => void;
  },
): () => void {
  return ssePost('/extract', payload, {
    onEvent: (event, data) => {
      if (event === 'progress')
        handlers.onProgress((data as { field: string }).field);
      else if (event === 'field') {
        const d = data as { field: string; value: unknown; evidence: string };
        handlers.onField(d.field, { value: d.value, evidence: d.evidence });
      } else if (event === 'done')
        handlers.onDone(
          (data as { results: Record<string, ExtractionResult> }).results,
        );
      else if (event === 'error')
        handlers.onError(new Error((data as { error: string }).error));
    },
    onError: handlers.onError,
  });
}
