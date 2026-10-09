import mammoth from 'mammoth';
// @ts-expect-error у pdf-parse нет типов для этого пути
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { ocrPdf } from './ocr.js';
import { config } from './config.js';

export interface ParseResult {
  text: string;
  ocrUsed: boolean;
}

const MIN_CHARS_PER_PAGE = 15;

export async function extractText(
  buffer: Buffer,
  mime: string,
  filename: string,
): Promise<ParseResult> {
  const name = filename.toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    const data = (await pdfParse(buffer)) as { text: string; numpages?: number };
    const text = normalize(data.text);
    const pages = data.numpages ?? 1;

    if (text.length < pages * MIN_CHARS_PER_PAGE) {
      if (!config.ocr.enabled) {
        throw new Error(
          'В PDF нет текстового слоя (это скан). Включите OCR на странице «Настройки» и загрузите документ ещё раз.',
        );
      }
      console.log(`[parse] «${filename}»: текстового слоя нет, запускаю OCR (${config.ocr.language})…`);
      const ocr = await ocrPdf(buffer, (page, total) =>
        console.log(`[parse] OCR: страница ${page}/${total}`),
      );
      const ocrText = normalize(ocr.text);
      if (ocrText.length < 20) {
        throw new Error('OCR не смог распознать текст — документ пустой или слишком низкое качество скана.');
      }
      return { text: ocrText, ocrUsed: true };
    }
    return { text, ocrUsed: false };
  }

  if (
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: normalize(result.value), ocrUsed: false };
  }

  if (
    mime.startsWith('text/') ||
    /\.(txt|md|markdown|csv|json|log)$/.test(name)
  ) {
    return { text: normalize(buffer.toString('utf-8')), ocrUsed: false };
  }

  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/.test(name)) {
    if (!config.ocr.enabled) {
      throw new Error('Распознавание картинок выключено. Включите OCR на странице «Настройки».');
    }
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(config.ocr.language.split('+'));
    try {
      const { data } = await worker.recognize(buffer);
      const text = normalize(data.text ?? '');
      if (text.length < 5) throw new Error('OCR не смог распознать текст на изображении.');
      return { text, ocrUsed: true };
    } finally {
      await worker.terminate();
    }
  }

  throw new Error(
    `Неподдерживаемый формат файла (${mime || filename}). Поддерживаются: PDF (в т.ч. сканы), DOCX, TXT, MD, CSV, а также изображения PNG/JPEG.`,
  );
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
