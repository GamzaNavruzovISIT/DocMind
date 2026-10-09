import { memo, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { EntityItem, EntityType } from '@/types';
import { highlightEntities, flashRange, highlightApiSupported, type LocatedRange } from '@/lib/highlight';
import { Loader2, FileWarning } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_PAGES = 100;

interface Props {
  docId: string;
  entities: EntityItem[];
  activeTypes: Set<EntityType>;
  jumpValue: { value: string; seq: number } | null;
}

interface PageHandle {
  num: number;
  wrapper: HTMLDivElement;
  rendered: boolean;
}

export const PdfPreview = memo(function PdfPreview({ docId, entities, activeTypes, jumpValue }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rangesRef = useRef<LocatedRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScan, setIsScan] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const handles: PageHandle[] = [];
    rangesRef.current = [];

    setLoading(true);
    setError(null);
    container.innerHTML = '';

    const active = entities.filter((e) => activeTypes.has(e.type));

    (async () => {
      try {
        const doc = await pdfjs.getDocument(`/api/documents/${docId}/file`).promise;
        if (cancelled) return;
        const total = Math.min(doc.numPages, MAX_PAGES);
        setPageCount(doc.numPages);
        let pagesWithText = 0;
        let pagesChecked = 0;

        const renderPage = async (h: PageHandle) => {
          if (h.rendered || cancelled) return;
          h.rendered = true;
          try {
            const page = await doc.getPage(h.num);
            const scale = Math.min(2, Math.max(1, (container.clientWidth - 32) / page.getViewport({ scale: 1 }).width));
            const viewport = page.getViewport({ scale });
            h.wrapper.style.width = `${viewport.width}px`;
            h.wrapper.style.height = `${viewport.height}px`;
            h.wrapper.querySelector('.page-hint')?.remove();

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width * window.devicePixelRatio);
            canvas.height = Math.floor(viewport.height * window.devicePixelRatio);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            const ctx = canvas.getContext('2d')!;
            await page.render({
              canvas,
              canvasContext: ctx,
              viewport,
              transform: window.devicePixelRatio !== 1 ? [window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0] : undefined,
            }).promise;
            h.wrapper.appendChild(canvas);

            const textContent = await page.getTextContent();
            pagesChecked++;
            if (textContent.items.length > 0) pagesWithText++;
            if (!cancelled && pagesChecked >= Math.min(3, total)) {
              setIsScan(pagesWithText === 0);
            }
            const layer = document.createElement('div');
            layer.className = 'pdf-text-layer';
            layer.style.cssText =
              'position:absolute;inset:0;overflow:hidden;line-height:1;user-select:none;';
            for (const item of textContent.items) {
              if (!('str' in item) || !item.str) continue;
              const tx = item.transform as number[];
              const fontHeight = Math.hypot(tx[2], tx[3]) * scale;
              const [x, y] = viewport.convertToViewportPoint(tx[4], tx[5]);
              const span = document.createElement('span');
              span.textContent = item.str;
              span.style.cssText = `position:absolute;left:${x}px;top:${y - fontHeight}px;font-size:${fontHeight}px;color:transparent;white-space:pre;`;
              layer.appendChild(span);
            }
            h.wrapper.appendChild(layer);

            if (highlightApiSupported && layer.textContent) {
              const found = highlightEntities(layer, active, `p${h.num}`);
              rangesRef.current.push(...found);
            }
          } catch (err) {
            console.warn('[pdf-preview] страница', h.num, err);
          }
        };

        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const h = handles.find((x) => x.wrapper === entry.target);
              if (h) {
                observer.unobserve(h.wrapper);
                void renderPage(h);
              }
            }
          },
          { root: container.closest('.nice-scroll'), rootMargin: '600px' },
        );

        for (let num = 1; num <= total; num++) {
          const wrapper = document.createElement('div');
          wrapper.className = 'pdf-page';
          wrapper.style.cssText =
            'position:relative;margin:0 auto 16px;background:white;box-shadow:0 1px 4px rgba(0,0,0,.15);min-height:200px;';
          const hint = document.createElement('div');
          hint.className = 'page-hint';
          hint.style.cssText =
            'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px;';
          hint.textContent = `Страница ${num}…`;
          wrapper.appendChild(hint);
          container.appendChild(wrapper);
          const h: PageHandle = { num, wrapper, rendered: false };
          handles.push(h);
          observer.observe(wrapper);
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || 'Не удалось открыть PDF');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, entities, activeTypes]);

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

  return (
    <div className="relative h-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/60">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Загружаю PDF…</span>
        </div>
      )}
      {isScan && (
        <div className="mx-auto my-3 max-w-[820px] rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Это скан без текстового слоя — подсветка сущностей доступна во вкладке «Текст» (распознано через OCR).
        </div>
      )}
      <div ref={containerRef} className="px-4 py-4" />
      {pageCount > MAX_PAGES && (
        <div className="pb-4 text-center text-xs text-muted-foreground">
          Показаны первые {MAX_PAGES} страниц из {pageCount}
        </div>
      )}
    </div>
  );
});
