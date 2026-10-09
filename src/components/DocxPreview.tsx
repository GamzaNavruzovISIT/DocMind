import { memo, useEffect, useRef, useState } from 'react';
import type { EntityItem, EntityType } from '@/types';
import { highlightEntities, flashRange, type LocatedRange } from '@/lib/highlight';
import { Loader2, FileWarning } from 'lucide-react';

interface Props {
  docId: string;
  entities: EntityItem[];
  activeTypes: Set<EntityType>;
  jumpValue: { value: string; seq: number } | null;
}

export const DocxPreview = memo(function DocxPreview({ docId, entities, activeTypes, jumpValue }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rangesRef = useRef<LocatedRange[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    fetch(`/api/documents/${docId}/preview-html`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ html: string }>;
      })
      .then((data) => {
        if (!cancelled) setHtml(data.html);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || html === null) return;
    rangesRef.current = highlightEntities(
      container,
      entities.filter((e) => activeTypes.has(e.type)),
      'docx',
    );
  }, [html, entities, activeTypes]);

  useEffect(() => {
    if (!jumpValue) return;
    const needle = jumpValue.value.toLowerCase();
    const hit = rangesRef.current.find((r) => r.value.toLowerCase() === needle);
    if (hit) flashRange(hit.range);
  }, [jumpValue]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <FileWarning className="h-8 w-8 text-destructive" />
        <div className="text-sm font-medium">Не удалось показать оригинал</div>
        <div className="max-w-sm text-xs text-muted-foreground">{error}</div>
      </div>
    );
  }

  if (html === null) {
    return (
      <div className="flex h-full items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Конвертирую DOCX…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[820px] px-4 py-6 lg:px-10">
      <div
        ref={containerRef}
        className="docx-preview rounded-lg bg-white p-8 text-[15px] leading-[1.7] text-neutral-900 shadow-sm dark:bg-card dark:text-foreground"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
});
