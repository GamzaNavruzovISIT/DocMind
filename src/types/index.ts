export type DocStatus = 'processing' | 'ready' | 'error';

export interface DocumentMeta {
  id: string;
  title: string;
  filename: string;
  mime: string;
  size_bytes: number;
  status: DocStatus;
  error?: string | null;
  char_count: number;
  ocr_used?: boolean;
  created_at: string;
  entity_count?: number;
}

export interface DocumentFull extends DocumentMeta {
  full_text?: string | null;
}

export type EntityType =
  | 'person'
  | 'phone'
  | 'email'
  | 'date'
  | 'address'
  | 'org'
  | 'money'
  | 'doc_number'
  | 'custom';

export interface EntityItem {
  id: number;
  type: EntityType;
  value: string;
  startOffset: number;
  endOffset: number;
  source: 'regex' | 'llm' | 'custom';
}

export interface TemplateField {
  name: string;
  description: string;
  type: 'string' | 'date' | 'number' | 'list' | 'text';
}

export interface Template {
  id: string;
  name: string;
  description: string;
  fields: TemplateField[];
  created_at: string;
}

export interface SourceRef {
  n: number;
  chunkIndex: number;
  preview: string;
  startOffset: number;
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceRef[] | null;
  created_at?: string;
  streaming?: boolean;
}

export interface ExtractionResult {
  value: unknown;
  evidence: string;
}

export interface Extraction {
  id: string;
  template_name: string;
  document_title: string;
  results: Record<string, ExtractionResult>;
  status: string;
  created_at: string;
}

export interface Health {
  db: boolean;
  ollama: {
    ok: boolean;
    models: string[];
    chatModelReady: boolean;
    embedModelReady: boolean;
  };
  chatModel: string;
  embedModel: string;
}

export interface AppSettings {
  port: number;
  databaseUrl: string;
  ollamaBaseUrl: string;
  chatModel: string;
  embedModel: string;
  uploadsDir: string;
  nerMaxChars: number;
  ocr: {
    enabled: boolean;
    language: string;
    maxPages: number;
  };
  remote: {
    url: string;
    token: string;
  };
}

export interface CustomPattern {
  id: string;
  label: string;
  pattern: string;
  isRegex: boolean;
  created_at: string;
}

export interface TestResult {
  ok: boolean;
  error?: string;
  models?: string[];
  status?: number;
}
