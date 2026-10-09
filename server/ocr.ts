import { pdf } from 'pdf-to-img';
import { createWorker, type Worker } from 'tesseract.js';
import { config } from './config.js';

let workerPromise: Promise<Worker> | null = null;
let workerLang = '';

async function getWorker(language: string): Promise<Worker> {
  if (workerPromise && workerLang === language) return workerPromise;
  if (workerPromise) {
    try {
      (await workerPromise).terminate();
    } catch {
    }
    workerPromise = null;
  }
  workerLang = language;
  const langs = language.split('+').map((l) => l.trim()).filter(Boolean);
  workerPromise = createWorker(langs.length ? langs : ['eng']);
  return workerPromise;
}

export interface OcrResult {
  text: string;
  pages: number;
}

export async function ocrPdf(
  buffer: Buffer,
  onProgress?: (page: number, total: number) => void,
): Promise<OcrResult> {
  const { language, maxPages } = config.ocr;
  const worker = await getWorker(language);

  const doc = await pdf(buffer, { scale: 2 });
  const total = Math.min(doc.length ?? maxPages, maxPages);

  const parts: string[] = [];
  let page = 0;
  for await (const image of doc) {
    page++;
    if (page > maxPages) break;
    onProgress?.(page, total);
    try {
      const { data } = await worker.recognize(Buffer.from(image));
      const text = (data.text ?? '').trim();
      if (text) parts.push(text);
    } catch (err) {
      console.warn(`[ocr] страница ${page}:`, (err as Error).message);
    }
  }

  return { text: parts.join('\n\n'), pages: page };
}

export async function shutdownOcr(): Promise<void> {
  if (workerPromise) {
    try {
      (await workerPromise).terminate();
    } catch {
    }
    workerPromise = null;
  }
}
