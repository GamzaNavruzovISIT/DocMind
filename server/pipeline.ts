import { writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { query } from './db.js';
import { extractText } from './parse.js';
import { splitIntoChunks } from './chunk.js';
import { embedBatch } from './ollama.js';
import { regexEntities, llmEntities, customEntities, resolveOverlaps, type CustomPattern, type Entity } from './ner.js';
import { config } from './config.js';

async function loadCustomPatterns(): Promise<CustomPattern[]> {
  try {
    const { rows } = await query<{ label: string; pattern: string; is_regex: boolean }>(
      'SELECT label, pattern, is_regex FROM custom_patterns',
    );
    return rows.map((r) => ({ label: r.label, pattern: r.pattern, isRegex: r.is_regex }));
  } catch {
    return [];
  }
}

export async function findUploadedFile(docId: string): Promise<string | null> {
  try {
    const dir = path.resolve(config.uploadsDir);
    const files = await readdir(dir);
    const hit = files.find((f) => f.startsWith(`${docId}_`));
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

export async function processDocument(
  docId: string,
  buffer: Buffer,
  mime: string,
  filename: string,
): Promise<void> {
  try {
    const { text, ocrUsed } = await extractText(buffer, mime, filename);
    if (!text || text.length < 20) {
      throw new Error('Не удалось извлечь текст (пустой документ).');
    }

    await mkdir(config.uploadsDir, { recursive: true });
    const safeName = filename.replace(/[^\w.А-Яа-яЁё() -]+/g, '_');
    await writeFile(path.join(config.uploadsDir, `${docId}_${safeName}`), buffer);

    await query(
      'UPDATE documents SET full_text = $1, char_count = $2, ocr_used = $3 WHERE id = $4',
      [text, text.length, ocrUsed, docId],
    );

    const chunks = splitIntoChunks(text);
    for (const c of chunks) {
      await query(
        'INSERT INTO chunks (document_id, chunk_index, text, start_offset, end_offset) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (document_id, chunk_index) DO NOTHING',
        [docId, c.index, c.text, c.startOffset, c.endOffset],
      );
    }

    try {
      const BATCH = 8;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const batch = chunks.slice(i, i + BATCH);
        const vectors = await embedBatch(batch.map((b) => b.text));
        for (let j = 0; j < batch.length; j++) {
          await query(
            'UPDATE chunks SET embedding = $1 WHERE document_id = $2 AND chunk_index = $3',
            [JSON.stringify(vectors[j]), docId, batch[j].index],
          );
        }
      }
    } catch (err) {
      console.warn('[pipeline] эмбеддинги пропущены:', (err as Error).message);
    }

    const patterns = await loadCustomPatterns();
    const regexEnts = regexEntities(text);
    const customEnts = customEntities(text, patterns);
    await saveEntities(docId, resolveOverlaps([...customEnts, ...regexEnts]));

    await query("UPDATE documents SET status = 'ready' WHERE id = $1", [docId]);
    console.log(`[pipeline] документ ${docId} обработан${ocrUsed ? ' (OCR)' : ''}: ${chunks.length} фрагментов, ${regexEnts.length + customEnts.length} сущностей`);
  } catch (err) {
    console.error('[pipeline] ошибка:', err);
    await query("UPDATE documents SET status = 'error', error = $1 WHERE id = $2", [
      (err as Error).message,
      docId,
    ]);
  }
}

export async function runFullNer(docId: string): Promise<number> {
  const { rows } = await query<{ full_text: string }>(
    'SELECT full_text FROM documents WHERE id = $1',
    [docId],
  );
  const text = rows[0]?.full_text;
  if (!text) throw new Error('Документ ещё не обработан');

  await query('DELETE FROM entities WHERE document_id = $1', [docId]);
  const patterns = await loadCustomPatterns();
  const regexEnts = regexEntities(text);
  const customEnts = customEntities(text, patterns);
  const llmEnts = await llmEntities(text);
  const all = resolveOverlaps([...customEnts, ...regexEnts, ...llmEnts]);
  await saveEntities(docId, all);
  return all.length;
}

export async function highlightInDocument(
  docId: string,
  pattern: CustomPattern,
): Promise<number> {
  const { rows } = await query<{ full_text: string }>(
    'SELECT full_text FROM documents WHERE id = $1',
    [docId],
  );
  const text = rows[0]?.full_text;
  if (!text) throw new Error('Документ ещё не обработан');

  const found = resolveOverlaps(customEntities(text, [pattern]));
  if (found.length) {
    const values = [...new Set(found.map((e) => e.value))];
    await query(
      "DELETE FROM entities WHERE document_id = $1 AND source = 'custom' AND value = ANY($2)",
      [docId, values],
    );
  }
  await saveEntities(docId, found);
  return found.length;
}

export async function rescanCustom(docId: string): Promise<number> {
  const { rows } = await query<{ full_text: string }>(
    'SELECT full_text FROM documents WHERE id = $1',
    [docId],
  );
  const text = rows[0]?.full_text;
  if (!text) throw new Error('Документ ещё не обработан');

  await query("DELETE FROM entities WHERE document_id = $1 AND source = 'custom'", [docId]);
  const patterns = await loadCustomPatterns();
  const found = resolveOverlaps(customEntities(text, patterns));
  await saveEntities(docId, found);
  return found.length;
}

async function saveEntities(
  docId: string,
  entities: Entity[],
): Promise<void> {
  for (const e of entities) {
    await query(
      'INSERT INTO entities (document_id, type, value, start_offset, end_offset, source) VALUES ($1,$2,$3,$4,$5,$6)',
      [docId, e.type, e.value, e.startOffset, e.endOffset, e.source],
    );
  }
}
