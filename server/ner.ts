import { generateJson } from './ollama.js';
import { config } from './config.js';

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

export interface Entity {
  type: EntityType;
  value: string;
  startOffset: number;
  endOffset: number;
  source: 'regex' | 'llm' | 'custom';
}

export interface CustomPattern {
  label: string;
  pattern: string;
  isRegex: boolean;
}

interface Rule {
  type: EntityType;
  re: RegExp;
  clean?: (m: string) => string;
}

const B = '(?<![А-Яа-яЁёA-Za-z0-9_])';
const T = '(?![А-Яа-яЁёA-Za-z0-9_])';

const RULES: Rule[] = [
  {
    type: 'phone',
    re: /(?:\+7|8)[\s(−-]*\d{3}[\s)−-]*\d{3}[\s−-]*\d{2}[\s−-]*\d{2}/g,
  },
  {
    type: 'phone',
    re: /(?:\+?\d{1,3}[\s−-]?)?\(\d{3,5}\)[\s−-]?\d{3}[\s−-]?\d{2}[\s−-]?\d{2}/g,
  },
  { type: 'email', re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/g },
  {
    type: 'date',
    re: /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g,
  },
  {
    type: 'date',
    re: /\b\d{4}-\d{2}-\d{2}\b/g,
  },
  {
    type: 'date',
    re: new RegExp(
      `${B}\\d{1,2}\\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\\s+\\d{4}\\s*г?\\.?`,
      'gi',
    ),
  },
  {
    type: 'money',
    re: new RegExp(
      `\\b\\d[\\d\\s\\u00a0]*(?:[.,]\\d{1,2})?\\s*(?:руб(?:лей|ля|ь)?\\.?|₽|долл(?:аров)?(?:\\.|а)?\\s*США|USD|EUR|€|\\$)${T}`,
      'gi',
    ),
  },
  {
    type: 'doc_number',
    re: new RegExp(`${B}ИНН\\s*[:№]?\\s*\\d{10,12}\\b`, 'gi'),
    clean: (m) => m.replace(/^ИНН\s*[:№]?\s*/i, ''),
  },
  {
    type: 'doc_number',
    re: new RegExp(`${B}(?:паспорт|серия)\\s+\\d{4}\\s*(?:№\\s*)?\\d{6}\\b`, 'gi'),
  },
  {
    type: 'doc_number',
    re: new RegExp(`${B}(?:СНИЛС|ОГРН|КПП)\\s*[:№]?\\s*[\\d\\s-]{9,15}\\d\\b`, 'gi'),
  },
  {
    type: 'person',
    re: new RegExp(
      `${B}[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\\s+[А-ЯЁ][а-яё]+\\s+[А-ЯЁ][а-яё]*(?:ович|овича|евич|евича|ич|ича|овна|овны|евна|евны|ична|ичны|инична|иничны)${T}`,
      'g',
    ),
  },
  {
    type: 'person',
    re: new RegExp(
      `${B}[А-ЯЁ]\\.\\s?[А-ЯЁ]\\.\\s?[А-ЯЁ][а-яё]+${T}|${B}[А-ЯЁ][а-яё]+\\s+[А-ЯЁ]\\.\\s?[А-ЯЁ]\\.${T}`,
      'g',
    ),
  },
  {
    type: 'org',
    re: new RegExp(
      `${B}(?:ООО|АО|ПАО|ЗАО|ОАО|НАО|ГК|МКУ|ГБУ|ФГБУ|АНО|ТСЖ)\\s*[«"]([^»"]{2,80})[»"]`,
      'g',
    ),
  },
  {
    type: 'org',
    re: new RegExp(
      `${B}(?:Общество с ограниченной ответственностью|Акционерное общество|Публичное акционерное общество|Индивидуальный предприниматель)\\s*[«"]([^»"]{2,80})[»"]`,
      'gi',
    ),
  },
  {
    type: 'address',
    re: new RegExp(
      `(?:^|[\\s,;(:])((?:г\\.|город|пос\\.|с\\.|дер\\.)\\s*[А-ЯЁA-Z][^;!\\n]{0,90}?(?:кв\\.|квартира|офис|д\\.|дом|корп\\.|стр\\.)\\s*[0-9А-Яа-яЁё/\\s-]{0,12})`,
      'g',
    ),
    clean: (m) => m.trim().replace(/[,\s]+$/, ''),
  },
  {
    type: 'address',
    re: new RegExp(
      `${B}(?:ул\\.|улица|пр-кт|проспект|пер\\.|переулок|б-р|бульвар|ш\\.|шоссе|наб\\.|набережная|пл\\.|площадь)\\s+[А-ЯЁA-Z«"][^.;!\\n]{2,70}?(?:д\\.|дом|стр\\.|корп\\.|кв\\.|офис)\\s*[0-9А-Яа-яЁё/\\s-]{0,12}`,
      'gi',
    ),
    clean: (m) => m.trim().replace(/[,\s]+$/, ''),
  },
];

export function regexEntities(text: string): Entity[] {
  const found: Entity[] = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[1] ?? m[0];
      if (!raw) continue;
      const localStart = m[0].indexOf(raw);
      const start = m.index + (localStart >= 0 ? localStart : 0);
      const value = (rule.clean ? rule.clean(raw) : raw).trim();
      if (value.length < 3 || value.length > 200) continue;
      found.push({
        type: rule.type,
        value,
        startOffset: start,
        endOffset: start + raw.length,
        source: 'regex',
      });
    }
  }
  return dedupe(found);
}

const LLM_SYSTEM = `Ты — модуль извлечения именованных сущностей из русскоязычных документов.
Найди в тексте сущности и верни СТРОГО JSON-массив объектов вида:
[{"type": "person" | "org" | "address", "value": "<точная подстрока из текста>"}]
Правила:
- person — ФИО людей (полные или с инициалами);
- org — названия организаций и компаний;
- address — почтовые адреса;
- value должен быть ТОЧНОЙ подстрокой исходного текста, без перефразирования;
- не выдумывай сущности, которых нет в тексте;
- если сущностей нет — верни [].`;

export async function llmEntities(text: string): Promise<Entity[]> {
  const limited = text.slice(0, config.nerMaxChars);
  const slice = 6000;
  const found: Entity[] = [];

  for (let from = 0; from < limited.length; from += slice) {
    const part = limited.slice(from, from + slice);
    try {
      const arr = await generateJson<{ type: string; value: string }[]>(
        LLM_SYSTEM,
        part,
      );
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (
          !item ||
          typeof item.value !== 'string' ||
          !['person', 'org', 'address'].includes(item.type)
        )
          continue;
        let searchFrom = 0;
        const lowerValue = item.value.toLowerCase();
        const lowerText = text.toLowerCase();
        let idx = lowerText.indexOf(lowerValue, searchFrom);
        while (idx !== -1) {
          found.push({
            type: item.type as EntityType,
            value: text.slice(idx, idx + item.value.length),
            startOffset: idx,
            endOffset: idx + item.value.length,
            source: 'llm',
          });
          searchFrom = idx + item.value.length;
          idx = lowerText.indexOf(lowerValue, searchFrom);
        }
      }
    } catch (err) {
      console.warn('[ner] ошибка LLM-прохода:', (err as Error).message);
    }
  }
  return dedupe(found);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CUSTOM_MAX_MATCHES = 500;

export function customEntities(text: string, patterns: CustomPattern[]): Entity[] {
  const found: Entity[] = [];
  for (const p of patterns) {
    const raw = p.pattern.trim();
    if (!raw) continue;
    let re: RegExp;
    try {
      re = new RegExp(p.isRegex ? raw : escapeRe(raw), 'giu');
    } catch {
      console.warn(`[ner] пропущен некорректный regex «${raw}»`);
      continue;
    }
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(text)) !== null && count < CUSTOM_MAX_MATCHES) {
      const value = m[0];
      if (value.length >= 2 && value.length <= 200) {
        found.push({
          type: 'custom',
          value,
          startOffset: m.index,
          endOffset: m.index + value.length,
          source: 'custom',
        });
        count++;
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return dedupe(found);
}

function dedupe(list: Entity[]): Entity[] {  const seen = new Set<string>();
  return list.filter((e) => {
    const key = `${e.type}:${e.startOffset}:${e.endOffset}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveOverlaps(entities: Entity[]): Entity[] {
  const priority = (s: Entity['source']) => (s === 'custom' ? 0 : s === 'regex' ? 1 : 2);
  const sorted = [...entities].sort((a, b) => {
    if (a.source !== b.source) return priority(a.source) - priority(b.source);
    return b.endOffset - b.startOffset - (a.endOffset - a.startOffset);
  });
  const accepted: Entity[] = [];
  for (const e of sorted) {
    const overlaps = accepted.some(
      (a) => e.startOffset < a.endOffset && a.startOffset < e.endOffset,
    );
    if (!overlaps) accepted.push(e);
  }
  return accepted.sort((a, b) => a.startOffset - b.startOffset);
}
