import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { config, getSettings, applySettings, type AppSettings } from './config.js';
import { dbOk, ensureSchema, query, resetPool, testDatabaseUrl } from './db.js';
import { ollamaStatus, embed, chatStream, cosine, generateJson, type OllamaMessage } from './ollama.js';
import { processDocument, runFullNer, findUploadedFile, highlightInDocument, rescanCustom } from './pipeline.js';

const app = new Hono();
app.use('/api/*', cors());

app.get('/api/health', async (c) => {
  const [db, ollama] = await Promise.all([dbOk(), ollamaStatus()]);
  return c.json({
    db,
    ollama,
    chatModel: config.chatModel,
    embedModel: config.embedModel,
  });
});

app.get('/api/documents', async (c) => {
  const { rows } = await query(
    `SELECT d.id, d.title, d.filename, d.mime, d.size_bytes, d.status, d.error,
            d.char_count, d.ocr_used, d.created_at,
            (SELECT count(*) FROM entities e WHERE e.document_id = d.id) AS entity_count
     FROM documents d ORDER BY d.created_at DESC`,
  );
  return c.json(rows);
});

const MAX_UPLOAD = 50 * 1024 * 1024;

app.post('/api/documents', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!(file instanceof File)) {
    return c.json({ error: 'Файл не передан (поле "file")' }, 400);
  }
  if (file.size > MAX_UPLOAD) {
    return c.json({ error: 'Файл больше 50 МБ' }, 413);
  }
  const title =
    (typeof body['title'] === 'string' && body['title'].trim()) ||
    file.name.replace(/\.[^.]+$/, '');

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows } = await query<{ id: string }>(
    'INSERT INTO documents (title, filename, mime, size_bytes) VALUES ($1,$2,$3,$4) RETURNING id',
    [title, file.name, file.type || 'application/octet-stream', file.size],
  );
  const id = rows[0].id;

  void processDocument(id, buffer, file.type, file.name);
  return c.json({ id, title, status: 'processing' }, 201);
});

app.get('/api/documents/:id', async (c) => {
  const id = c.req.param('id');
  const { rows } = await query(
    'SELECT id, title, filename, mime, size_bytes, status, error, full_text, char_count, ocr_used, created_at FROM documents WHERE id = $1',
    [id],
  );
  if (!rows[0]) return c.json({ error: 'Документ не найден' }, 404);
  return c.json(rows[0]);
});

app.delete('/api/documents/:id', async (c) => {
  await query('DELETE FROM documents WHERE id = $1', [c.req.param('id')]);
  return c.json({ ok: true });
});

app.post('/api/documents/:id/reindex', async (c) => {
  const id = c.req.param('id');
  const { rows } = await query<{ id: number; text: string }>(
    'SELECT id, text FROM chunks WHERE document_id = $1 AND embedding IS NULL ORDER BY chunk_index',
    [id],
  );
  if (!rows.length) return c.json({ ok: true, indexed: 0 });
  let indexed = 0;
  const BATCH = 8;
  const { embedBatch } = await import('./ollama.js');
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vectors = await embedBatch(batch.map((b) => b.text));
    for (let j = 0; j < batch.length; j++) {
      await query('UPDATE chunks SET embedding = $1 WHERE id = $2', [
        JSON.stringify(vectors[j]),
        batch[j].id,
      ]);
      indexed++;
    }
  }
  return c.json({ ok: true, indexed });
});

app.get('/api/documents/:id/entities', async (c) => {
  const { rows } = await query(
    'SELECT id, type, value, start_offset AS "startOffset", end_offset AS "endOffset", source FROM entities WHERE document_id = $1 ORDER BY start_offset',
    [c.req.param('id')],
  );
  return c.json(rows);
});

app.post('/api/documents/:id/entities/analyze', async (c) => {
  try {
    const count = await runFullNer(c.req.param('id'));
    return c.json({ ok: true, count });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

app.post('/api/documents/:id/highlight', async (c) => {
  const body = await c.req.json<{
    pattern?: string;
    label?: string;
    isRegex?: boolean;
    save?: boolean;
  }>();
  const pattern = (body.pattern ?? '').trim();
  if (!pattern) return c.json({ error: 'Укажите текст или regex для подсветки' }, 400);
  if (body.isRegex) {
    try {
      new RegExp(pattern, 'giu');
    } catch {
      return c.json({ error: 'Некорректное регулярное выражение' }, 400);
    }
  }
  const id = c.req.param('id');
  try {
    const count = await highlightInDocument(id, {
      label: (body.label ?? '').trim(),
      pattern,
      isRegex: !!body.isRegex,
    });
    if (body.save && count >= 0) {
      await query(
        'INSERT INTO custom_patterns (label, pattern, is_regex) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [(body.label ?? '').trim() || pattern, pattern, !!body.isRegex],
      );
    }
    return c.json({ ok: true, count });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

app.delete('/api/documents/:id/highlight', async (c) => {
  await query("DELETE FROM entities WHERE document_id = $1 AND source = 'custom'", [
    c.req.param('id'),
  ]);
  return c.json({ ok: true });
});

app.get('/api/documents/:id/file', async (c) => {
  const id = c.req.param('id');
  const { rows } = await query<{ filename: string; mime: string }>(
    'SELECT filename, mime FROM documents WHERE id = $1',
    [id],
  );
  const docRow = rows[0];
  if (!docRow) return c.json({ error: 'Документ не найден' }, 404);
  const filePath = await findUploadedFile(id);
  if (!filePath) return c.json({ error: 'Файл оригинала не найден на диске' }, 404);
  const buf = await readFile(filePath);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': docRow.mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(docRow.filename)}`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

app.get('/api/documents/:id/preview-html', async (c) => {
  const id = c.req.param('id');
  const filePath = await findUploadedFile(id);
  if (!filePath) return c.json({ error: 'Файл оригинала не найден на диске' }, 404);
  if (!filePath.toLowerCase().endsWith('.docx')) {
    return c.json({ error: 'HTML-превью доступно только для DOCX' }, 400);
  }
  const buffer = await readFile(filePath);
  const result = await mammoth.convertToHtml({ buffer });
  return c.json({ html: result.value });
});

interface ExportRow {
  id: string;
  title: string;
  filename: string;
  mime: string;
  size_bytes: number;
  status: string;
  full_text: string | null;
  char_count: number;
  ocr_used: boolean;
  created_at: string;
}

async function buildExportJson(docId: string) {
  const { rows: docs } = await query<ExportRow>(
    'SELECT * FROM documents WHERE id = $1',
    [docId],
  );
  const doc = docs[0];
  if (!doc) return null;

  const [{ rows: entities }, { rows: extractions }] = await Promise.all([
    query(
      'SELECT type, value, start_offset AS "startOffset", end_offset AS "endOffset", source FROM entities WHERE document_id = $1 ORDER BY start_offset',
      [docId],
    ),
    query(
      `SELECT x.id, x.results, x.created_at, t.name AS "templateName"
       FROM extractions x JOIN templates t ON t.id = x.template_id
       WHERE x.document_id = $1 ORDER BY x.created_at DESC`,
      [docId],
    ),
  ]);

  return {
    app: 'DocMind',
    version: 1,
    exportedAt: new Date().toISOString(),
    document: {
      id: doc.id,
      title: doc.title,
      filename: doc.filename,
      mime: doc.mime,
      sizeBytes: Number(doc.size_bytes),
      charCount: doc.char_count,
      ocrUsed: doc.ocr_used,
      createdAt: doc.created_at,
    },
    text: doc.full_text,
    entities,
    extractions,
  };
}

app.get('/api/documents/:id/export', async (c) => {
  const data = await buildExportJson(c.req.param('id'));
  if (!data) return c.json({ error: 'Документ не найден' }, 404);
  const safe = data.document.title.replace(/[^\wА-Яа-яЁё -]+/g, '_').slice(0, 80);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.json`,
    },
  });
});

app.post('/api/documents/:id/send', async (c) => {
  const body = await c.req
    .json<{ url?: string; token?: string }>()
    .catch(() => ({}) as { url?: string; token?: string });
  const url = (body.url ?? config.remote.url).trim();
  const token = (body.token ?? config.remote.token).trim();
  if (!url) {
    return c.json({ error: 'URL удалённого сервера не задан — укажите его в настройках' }, 400);
  }
  const data = await buildExportJson(c.req.param('id'));
  if (!data) return c.json({ error: 'Документ не найден' }, 404);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return c.json({ error: `Удалённый сервер ответил HTTP ${res.status}` }, 502);
    }
    return c.json({ ok: true, status: res.status });
  } catch (err) {
    return c.json({ error: `Не удалось отправить: ${(err as Error).message}` }, 502);
  }
});

app.get('/api/custom-patterns', async (c) => {
  const { rows } = await query(
    'SELECT id, label, pattern, is_regex AS "isRegex", created_at FROM custom_patterns ORDER BY created_at DESC',
  );
  return c.json(rows);
});

app.post('/api/custom-patterns', async (c) => {
  const body = await c.req.json<{ label?: string; pattern?: string; isRegex?: boolean }>();
  const pattern = (body.pattern ?? '').trim();
  if (!pattern) return c.json({ error: 'Укажите текст или regex' }, 400);
  if (body.isRegex) {
    try {
      new RegExp(pattern, 'giu');
    } catch {
      return c.json({ error: 'Некорректное регулярное выражение' }, 400);
    }
  }
  const { rows } = await query(
    'INSERT INTO custom_patterns (label, pattern, is_regex) VALUES ($1,$2,$3) RETURNING id, label, pattern, is_regex AS "isRegex", created_at',
    [(body.label ?? '').trim() || pattern, pattern, !!body.isRegex],
  );
  return c.json(rows[0], 201);
});

app.delete('/api/custom-patterns/:id', async (c) => {
  await query('DELETE FROM custom_patterns WHERE id = $1', [c.req.param('id')]);
  return c.json({ ok: true });
});

app.post('/api/documents/:id/rescan-custom', async (c) => {
  try {
    const count = await rescanCustom(c.req.param('id'));
    return c.json({ ok: true, count });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

app.get('/api/settings', (c) => c.json(getSettings()));

app.put('/api/settings', async (c) => {
  const body = await c.req.json<Partial<AppSettings>>();
  const { databaseChanged } = applySettings(body);
  if (databaseChanged) {
    await resetPool();
    try {
      await ensureSchema();
    } catch (err) {
      return c.json({
        ok: true,
        warning: `Настройки сохранены, но новая БД пока недоступна: ${(err as Error).message}`,
      });
    }
  }
  return c.json({ ok: true, settings: getSettings() });
});

app.post('/api/settings/test', async (c) => {
  const body = await c.req.json<{
    kind?: 'ollama' | 'database' | 'remote';
    baseUrl?: string;
    url?: string;
    token?: string;
  }>();

  if (body.kind === 'ollama') {
    const baseUrl = (body.baseUrl ?? config.ollamaBaseUrl).replace(/\/$/, '');
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { models?: { name: string }[] };
      return c.json({ ok: true, models: (data.models ?? []).map((m) => m.name) });
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message });
    }
  }

  if (body.kind === 'database') {
    const url = (body.url ?? config.databaseUrl).trim();
    return c.json(await testDatabaseUrl(url));
  }

  if (body.kind === 'remote') {
    const url = (body.url ?? config.remote.url).trim();
    if (!url) return c.json({ ok: false, error: 'URL не задан' });
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: body.token ? { Authorization: `Bearer ${body.token}` } : {},
        signal: AbortSignal.timeout(8000),
      });
      return c.json({ ok: res.status < 500, status: res.status });
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message });
    }
  }

  return c.json({ error: 'Неизвестный kind (ollama | database | remote)' }, 400);
});

app.get('/api/templates', async (c) => {
  const { rows } = await query('SELECT * FROM templates ORDER BY created_at DESC');
  return c.json(rows);
});

const FIELD_TYPES = ['string', 'date', 'number', 'list', 'text'];

app.post('/api/templates', async (c) => {
  const body = await c.req.json<{
    name?: string;
    description?: string;
    fields?: { name: string; description?: string; type?: string }[];
  }>();
  if (!body.name?.trim()) return c.json({ error: 'Укажите название шаблона' }, 400);
  const fields = (body.fields ?? [])
    .filter((f) => f.name?.trim())
    .map((f) => ({
      name: f.name.trim(),
      description: (f.description ?? '').trim(),
      type: FIELD_TYPES.includes(f.type ?? '') ? f.type : 'string',
    }));
  if (!fields.length) return c.json({ error: 'Добавьте хотя бы одно поле' }, 400);
  const { rows } = await query(
    'INSERT INTO templates (name, description, fields) VALUES ($1,$2,$3) RETURNING *',
    [body.name.trim(), body.description ?? '', JSON.stringify(fields)],
  );
  return c.json(rows[0], 201);
});

app.put('/api/templates/:id', async (c) => {
  const body = await c.req.json<{
    name?: string;
    description?: string;
    fields?: { name: string; description?: string; type?: string }[];
  }>();
  const fields = (body.fields ?? [])
    .filter((f) => f.name?.trim())
    .map((f) => ({
      name: f.name.trim(),
      description: (f.description ?? '').trim(),
      type: FIELD_TYPES.includes(f.type ?? '') ? f.type : 'string',
    }));
  const { rows } = await query(
    'UPDATE templates SET name = $1, description = $2, fields = $3 WHERE id = $4 RETURNING *',
    [body.name, body.description ?? '', JSON.stringify(fields), c.req.param('id')],
  );
  if (!rows[0]) return c.json({ error: 'Шаблон не найден' }, 404);
  return c.json(rows[0]);
});

app.delete('/api/templates/:id', async (c) => {
  await query('DELETE FROM templates WHERE id = $1', [c.req.param('id')]);
  return c.json({ ok: true });
});

interface ChunkRow {
  chunk_index: number;
  text: string;
  start_offset: number;
  embedding: number[] | null;
}

async function retrieve(
  question: string,
  documentId: string | null,
  topK = 5,
): Promise<ChunkRow[]> {
  const { rows } = await query<ChunkRow>(
    documentId
      ? 'SELECT chunk_index, text, start_offset, embedding FROM chunks WHERE document_id = $1'
      : 'SELECT chunk_index, text, start_offset, embedding FROM chunks',
    documentId ? [documentId] : [],
  );
  if (!rows.length) return [];

  let qv: number[] | null = null;
  try {
    qv = await embed(question);
  } catch {
  }
  if (!qv) return rows.slice(0, topK);

  const withEmb = rows.filter((r) => Array.isArray(r.embedding));
  if (!withEmb.length) return rows.slice(0, topK);

  return withEmb
    .map((r) => ({ ...r, score: cosine(qv!, r.embedding as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .sort((a, b) => a.chunk_index - b.chunk_index);
}

app.post('/api/chat', async (c) => {
  const body = await c.req.json<{ message?: string; documentId?: string | null }>();
  const message = body.message?.trim();
  if (!message) return c.json({ error: 'Пустое сообщение' }, 400);
  const documentId = body.documentId ?? null;

  const chunks = await retrieve(message, documentId);
  const context = chunks
    .map((ch, i) => `[Фрагмент ${i + 1}]\n${ch.text}`)
    .join('\n\n---\n\n');

  const { rows: history } = await query<{ role: string; content: string }>(
    documentId
      ? 'SELECT role, content FROM messages WHERE document_id = $1 ORDER BY id DESC LIMIT 8'
      : 'SELECT role, content FROM messages WHERE document_id IS NULL ORDER BY id DESC LIMIT 8',
    documentId ? [documentId] : [],
  );

  const system = documentId
    ? `Ты — ассистент DocMind, отвечаешь на вопросы по документу на русском языке.
Опирайся ТОЛЬКО на приведённые фрагменты документа. Если ответа во фрагментах нет — честно скажи об этом.
В конце ответа указывай, на какие фрагменты опирался, в формате: (Источники: 1, 3).`
    : `Ты — ассистент DocMind. Отвечаешь на русском, опираясь на фрагменты из базы документов пользователя.
Если фрагменты не помогают ответить — скажи об этом честно.`;

  const messages: OllamaMessage[] = [
    { role: 'system', content: system },
    ...history.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    {
      role: 'user',
      content: context
        ? `Фрагменты документа:\n\n${context}\n\n---\nВопрос: ${message}`
        : message,
    },
  ];

  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    let full = '';
    try {
      full = await chatStream(
        messages,
        (token) => {
          void stream.writeSSE({ event: 'token', data: JSON.stringify({ token }) });
        },
        abort.signal,
      );
      const sources = chunks.map((ch, i) => ({
        n: i + 1,
        chunkIndex: ch.chunk_index,
        preview: ch.text.slice(0, 200),
        startOffset: ch.start_offset,
      }));
      await query(
        'INSERT INTO messages (document_id, role, content) VALUES ($1,$2,$3)',
        [documentId, 'user', message],
      );
      await query(
        'INSERT INTO messages (document_id, role, content, sources) VALUES ($1,$2,$3,$4)',
        [documentId, 'assistant', full, JSON.stringify(sources)],
      );
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ sources }) });
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: (err as Error).message }),
      });
    }
  });
});

app.get('/api/chat/history', async (c) => {
  const documentId = c.req.query('documentId');
  const { rows } = await query(
    documentId
      ? 'SELECT id, role, content, sources, created_at FROM messages WHERE document_id = $1 ORDER BY id'
      : 'SELECT id, role, content, sources, created_at FROM messages WHERE document_id IS NULL ORDER BY id',
    documentId ? [documentId] : [],
  );
  return c.json(rows);
});

app.delete('/api/chat/history', async (c) => {
  const documentId = c.req.query('documentId');
  if (documentId) {
    await query('DELETE FROM messages WHERE document_id = $1', [documentId]);
  } else {
    await query('DELETE FROM messages WHERE document_id IS NULL');
  }
  return c.json({ ok: true });
});

app.post('/api/extract', async (c) => {
  const body = await c.req.json<{ documentId?: string; templateId?: string }>();
  if (!body.documentId || !body.templateId) {
    return c.json({ error: 'Нужны documentId и templateId' }, 400);
  }

  const [{ rows: docs }, { rows: tpls }] = await Promise.all([
    query<{ full_text: string; title: string }>(
      'SELECT full_text, title FROM documents WHERE id = $1',
      [body.documentId],
    ),
    query<{ name: string; fields: { name: string; description?: string; type?: string }[] }>(
      'SELECT name, fields FROM templates WHERE id = $1',
      [body.templateId],
    ),
  ]);
  const doc = docs[0];
  const tpl = tpls[0];
  if (!doc) return c.json({ error: 'Документ не найден' }, 404);
  if (!tpl) return c.json({ error: 'Шаблон не найден' }, 404);
  if (!doc.full_text) return c.json({ error: 'Документ ещё обрабатывается' }, 409);

  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    const results: Record<string, { value: unknown; evidence: string }> = {};

    try {
      for (const field of tpl.fields) {
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({ field: field.name, status: 'extracting' }),
        });

        const q = `${field.name}: ${field.description ?? ''}`;
        const chunks = await retrieve(q, body.documentId!, 4);
        const context = chunks.length
          ? chunks.map((ch) => ch.text).join('\n\n---\n\n')
          : doc.full_text.slice(0, 6000);

        const typeHint =
          field.type === 'date'
            ? 'дата в формате ДД.ММ.ГГГГ'
            : field.type === 'number'
              ? 'число'
              : field.type === 'list'
                ? 'список значений через запятую'
                : 'строка';

        const answer = await generateJson<{ value: unknown; evidence?: string }>(
          `Ты извлекаешь структурированные данные из русскоязычного документа.
Верни СТРОГО JSON: {"value": <значение>, "evidence": "<точная цитата из документа, подтверждающая значение>"}.
Если информации нет — {"value": null, "evidence": ""}. Тип значения: ${typeHint}.`,
          `Документ «${doc.title}» (фрагменты):\n\n${context}\n\n---\nИзвлеки поле: «${field.name}»${field.description ? ` — ${field.description}` : ''}`,
          abort.signal,
        );

        results[field.name] = {
          value: answer?.value ?? null,
          evidence: answer?.evidence ?? '',
        };
        await stream.writeSSE({
          event: 'field',
          data: JSON.stringify({ field: field.name, ...results[field.name] }),
        });
      }

      const { rows } = await query<{ id: string }>(
        'INSERT INTO extractions (document_id, template_id, results) VALUES ($1,$2,$3) RETURNING id',
        [body.documentId, body.templateId, JSON.stringify(results)],
      );
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ extractionId: rows[0].id, results }),
      });
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: (err as Error).message }),
      });
    }
  });
});

app.get('/api/extractions', async (c) => {
  const documentId = c.req.query('documentId');
  const { rows } = await query(
    `SELECT x.id, x.results, x.status, x.created_at,
            t.name AS template_name, d.title AS document_title
     FROM extractions x
     JOIN templates t ON t.id = x.template_id
     JOIN documents d ON d.id = x.document_id
     ${documentId ? 'WHERE x.document_id = $1' : ''}
     ORDER BY x.created_at DESC LIMIT 50`,
    documentId ? [documentId] : [],
  );
  return c.json(rows);
});

const dist = path.resolve('dist');
if (existsSync(dist)) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

async function main() {
  try {
    await ensureSchema();
    console.log('[db] схема PostgreSQL готова');
  } catch (err) {
    console.error(
      '[db] PostgreSQL недоступен:',
      (err as Error).message,
      '\n     Проверьте DATABASE_URL и что сервер запущен. См. README.md',
    );
  }

  const ollama = await ollamaStatus();
  if (ollama.ok) {
    console.log(`[ollama] подключено. Модели: чат=${config.chatModel} ${ollama.chatModelReady ? '✓' : '✗ (выполните: ollama pull ' + config.chatModel + ')'}, эмбеддинги=${config.embedModel} ${ollama.embedModelReady ? '✓' : '✗ (ollama pull ' + config.embedModel + ')'}`);
  } else {
    console.error('[ollama] недоступен по адресу', config.ollamaBaseUrl, '— запустите: ollama serve');
  }

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`\nDocMind запущен: http://localhost:${info.port}\n`);
  });
}

void main();
