
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
}

export interface OcrSettings {
  enabled: boolean;
  language: string;
  maxPages: number;
}

export interface RemoteSettings {
  url: string;
  token: string;
}

export interface AppSettings {
  port: number;
  databaseUrl: string;
  ollamaBaseUrl: string;
  chatModel: string;
  embedModel: string;
  uploadsDir: string;
  nerMaxChars: number;
  ocr: OcrSettings;
  remote: RemoteSettings;
}

const SETTINGS_FILE = path.resolve('settings.json');

function defaults(): AppSettings {
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5432/docmind',
    ollamaBaseUrl: (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, ''),
    chatModel: process.env.OLLAMA_CHAT_MODEL ?? 'qwen2.5:7b',
    embedModel: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',
    uploadsDir: process.env.UPLOADS_DIR ?? 'uploads',
    nerMaxChars: Number(process.env.NER_MAX_CHARS ?? 60000),
    ocr: {
      enabled: (process.env.OCR_ENABLED ?? 'true') !== 'false',
      language: process.env.OCR_LANGUAGE ?? 'rus+eng',
      maxPages: Math.max(1, Number(process.env.OCR_MAX_PAGES ?? 30)),
    },
    remote: {
      url: process.env.REMOTE_EXPORT_URL ?? '',
      token: process.env.REMOTE_EXPORT_TOKEN ?? '',
    },
  };
}

function loadFileSettings(): Partial<AppSettings> {
  try {
    if (!existsSync(SETTINGS_FILE)) return {};
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as Partial<AppSettings>;
  } catch (err) {
    console.warn('[settings] не удалось прочитать settings.json:', (err as Error).message);
    return {};
  }
}

function merge(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...base,
    ...patch,
    ocr: { ...base.ocr, ...(patch.ocr ?? {}) },
    remote: { ...base.remote, ...(patch.remote ?? {}) },
  };
}

export const config: AppSettings = merge(defaults(), loadFileSettings());

export function getSettings(): AppSettings {
  return JSON.parse(JSON.stringify(config)) as AppSettings;
}

export function applySettings(patch: Partial<AppSettings>): { databaseChanged: boolean } {
  const databaseChanged =
    patch.databaseUrl !== undefined && patch.databaseUrl !== config.databaseUrl;

  const next = merge(config, patch);
  next.ollamaBaseUrl = next.ollamaBaseUrl.replace(/\/$/, '');
  next.ocr.maxPages = Math.max(1, Math.min(500, Math.floor(next.ocr.maxPages) || 30));
  next.nerMaxChars = Math.max(1000, Math.floor(next.nerMaxChars) || 60000);
  next.port = Math.max(1, Math.min(65535, Math.floor(next.port) || 3000));

  Object.assign(config, next);

  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify(getSettings(), null, 2), 'utf-8');
  } catch (err) {
    console.warn('[settings] не удалось записать settings.json:', (err as Error).message);
  }
  return { databaseChanged };
}
