import type { EntityItem, EntityType } from '@/types';
import { ENTITY_HIGHLIGHT_COLORS } from '@/lib/entity-meta';

const PREFIX = 'docmind-hl-';
let cssInjected = false;

export const highlightApiSupported =
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

function injectCss() {
  if (cssInjected) return;
  cssInjected = true;
  const rules = (Object.keys(ENTITY_HIGHLIGHT_COLORS) as EntityType[])
    .map(
      (t) =>
        `::highlight(${PREFIX}${t}) { background-color: ${ENTITY_HIGHLIGHT_COLORS[t]}; color: inherit; }`,
    )
    .join('\n');
  const style = document.createElement('style');
  style.textContent = rules + `\n::highlight(${PREFIX}flash) { background-color: rgba(250, 204, 21, 0.9); }`;
  document.head.appendChild(style);
}

export interface LocatedRange {
  range: Range;
  type: EntityType;
  value: string;
}

export function highlightEntities(
  container: HTMLElement,
  entities: EntityItem[],
  highlightKey: string,
): LocatedRange[] {
  if (!highlightApiSupported) return [];
  injectCss();

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const offsets: number[] = [];
  let total = '';
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = node as Text;
    offsets.push(total.length);
    total += t.data;
    nodes.push(t);
  }
  if (!total) return [];
  const lower = total.toLowerCase();

  const queries: { value: string; type: EntityType }[] = [];
  const seen = new Set<string>();
  for (const e of entities) {
    const key = `${e.type}:${e.value.toLowerCase()}`;
    if (seen.has(key) || e.value.length < 2) continue;
    seen.add(key);
    queries.push({ value: e.value, type: e.type });
  }
  queries.sort((a, b) => b.value.length - a.value.length);

  const located: LocatedRange[] = [];
  const byType = new Map<EntityType, Range[]>();
  const MAX_PER_VALUE = 100;

  for (const q of queries) {
    const needle = q.value.toLowerCase();
    let from = 0;
    let count = 0;
    for (;;) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1 || count >= MAX_PER_VALUE) break;
      const end = idx + needle.length;
      const startIdx = findNode(offsets, idx);
      const endIdx = findNode(offsets, end - 1);
      if (startIdx >= 0 && endIdx >= startIdx) {
        const range = new Range();
        range.setStart(nodes[startIdx], idx - offsets[startIdx]);
        range.setEnd(nodes[endIdx], end - offsets[endIdx]);
        located.push({ range, type: q.type, value: q.value });
        if (!byType.has(q.type)) byType.set(q.type, []);
        byType.get(q.type)!.push(range);
      }
      from = end;
      count++;
    }
  }

  for (const [type, ranges] of byType) {
    const name = `${PREFIX}${type}`;
    const existing = (CSS.highlights as unknown as Map<string, Highlight>).get(name);
    const all = existing ? [...(existing as unknown as Set<Range>), ...ranges] : ranges;
    CSS.highlights.set(name, new Highlight(...all));
  }
  void highlightKey;
  return located;
}

function findNode(offsets: number[], pos: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= pos) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function flashRange(range: Range) {
  if (!highlightApiSupported) return;
  injectCss();
  const name = `${PREFIX}flash`;
  const hl = new Highlight(range);
  CSS.highlights.set(name, hl);
  const el =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setTimeout(() => CSS.highlights.delete(name), 1800);
}

export function clearAllHighlights() {
  if (!highlightApiSupported) return;
  CSS.highlights.clear();
}
