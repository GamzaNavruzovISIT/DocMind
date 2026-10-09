import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentFull, EntityItem, EntityType } from '@/types';
import { ENTITY_META } from '@/lib/entity-meta';
import { cn } from '@/lib/utils';
import {
  Download,
  Highlighter,
  Loader2,
  ScanSearch,
  ScanText,
  Send,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  clearCustomHighlights,
  exportDocumentUrl,
  highlightInDocument,
  sendDocument,
} from '@/lib/api';
import { PdfPreview } from '@/components/PdfPreview';
import { DocxPreview } from '@/components/DocxPreview';

interface Props {
  doc: DocumentFull;
  entities: EntityItem[];
  activeTypes: Set<EntityType>;
  jumpOffset: number | null;
  onEntityClick?: (entity: EntityItem) => void;
  onAnalyze?: () => void;
  analyzing?: boolean;
  onEntitiesChanged?: () => void;
}

interface Segment {
  text: string;
  entity?: EntityItem;
}

function buildSegments(text: string, entities: EntityItem[]): Segment[] {
  const visible = entities
    .filter(
      (e) =>
        e.startOffset >= 0 &&
        e.endOffset <= text.length &&
        e.endOffset > e.startOffset,
    )
    .sort((a, b) => a.startOffset - b.startOffset);

  const segments: Segment[] = [];
  let pos = 0;
  for (const e of visible) {
    if (e.startOffset < pos) continue;
    if (e.startOffset > pos) segments.push({ text: text.slice(pos, e.startOffset) });
    segments.push({ text: text.slice(e.startOffset, e.endOffset), entity: e });
    pos = e.endOffset;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos) });
  return segments;
}

function sourceLabel(source: EntityItem['source']): string {
  if (source === 'llm') return 'найдено ИИ';
  if (source === 'custom') return 'пользовательская подсветка';
  return 'найдено правилом';
}

export const DocumentViewer = memo(function DocumentViewer({
  doc,
  entities,
  activeTypes,
  jumpOffset,
  onEntityClick,
  onAnalyze,
  analyzing,
  onEntitiesChanged,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'text' | 'original'>('text');
  const [jumpValue, setJumpValue] = useState<{ value: string; seq: number } | null>(null);
  const [hlOpen, setHlOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const isPdf = doc.mime === 'application/pdf' || doc.filename.toLowerCase().endsWith('.pdf');
  const isDocx = doc.filename.toLowerCase().endsWith('.docx');

  const segments = useMemo(() => {
    if (!doc.full_text) return [];
    const filtered = entities.filter((e) => activeTypes.has(e.type));
    return buildSegments(doc.full_text, filtered);
  }, [doc.full_text, entities, activeTypes]);

  useEffect(() => {
    if (jumpOffset === null) return;
    if (view === 'original') {
      const ent = entities.find((e) => e.startOffset === jumpOffset);
      if (ent) setJumpValue((prev) => ({ value: ent.value, seq: (prev?.seq ?? 0) + 1 }));
      return;
    }
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-offset="${jumpOffset}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('mark-flash');
      void el.offsetWidth;
      el.classList.add('mark-flash');
    }
  }, [jumpOffset, view, entities]);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await sendDocument(doc.id);
      toast.success(`Данные отправлены на удалённый сервер (HTTP ${res.status})`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (doc.status === 'processing') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="font-medium">Обрабатываю документ…</div>
        <p className="max-w-sm text-sm text-muted-foreground">
          Извлекаю текст (для сканов — через OCR), режу на фрагменты и считаю
          эмбеддинги в локальной Ollama. Скан-копии распознаются дольше.
        </p>
      </div>
    );
  }

  if (doc.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="font-medium text-destructive">Не удалось обработать документ</div>
        <p className="max-w-sm text-sm text-muted-foreground">{doc.error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/70 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold">{doc.title}</div>
            {doc.ocr_used && (
              <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                <ScanText className="h-3 w-3" />
                OCR
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {doc.char_count.toLocaleString('ru-RU')} символов · {entities.length}{' '}
            сущностей
          </div>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as 'text' | 'original')}>
          <TabsList className="h-9">
            <TabsTrigger value="text" className="min-h-[32px] text-xs">Текст</TabsTrigger>
            <TabsTrigger value="original" className="min-h-[32px] text-xs">Оригинал</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setHlOpen(true)}
          className="min-h-[36px] gap-1.5"
          title="Подсветить свою сущность в документе"
        >
          <Highlighter className="h-4 w-4" />
          <span className="hidden sm:inline">Подсветить</span>
        </Button>

        <Button size="sm" variant="outline" asChild className="min-h-[36px] gap-1.5" title="Скачать извлечённые данные в JSON">
          <a href={exportDocumentUrl(doc.id)} download>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">JSON</span>
          </a>
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSend}
          disabled={sending}
          className="min-h-[36px] gap-1.5"
          title="Отправить извлечённые данные на удалённый сервер (URL задаётся в настройках)"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">Отправить</span>
        </Button>

        {onAnalyze && (
          <Button
            size="sm"
            variant="outline"
            onClick={onAnalyze}
            disabled={analyzing}
            className="min-h-[36px] gap-1.5"
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ScanSearch className="h-4 w-4" />
            )}
            {analyzing ? 'Анализ…' : 'Глубокий поиск сущностей (ИИ)'}
          </Button>
        )}
      </div>

      {view === 'text' ? (
        <div ref={containerRef} className="nice-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[820px] px-4 py-6 lg:px-10">
            <article className="whitespace-pre-wrap text-[15px] leading-[1.75] text-foreground/90 font-sans">
              {segments.length === 0 && !doc.full_text && 'Текст не извлечён.'}
              {segments.map((seg, i) =>
                seg.entity ? (
                  <mark
                    key={i}
                    data-offset={seg.entity.startOffset}
                    title={`${ENTITY_META[seg.entity.type].label} · ${sourceLabel(seg.entity.source)}`}
                    className={cn(ENTITY_META[seg.entity.type].mark)}
                    onClick={() => onEntityClick?.(seg.entity!)}
                  >
                    {seg.text}
                  </mark>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </article>
          </div>
        </div>
      ) : (
        <div className="nice-scroll min-h-0 flex-1 overflow-y-auto bg-muted/40">
          {isPdf ? (
            <PdfPreview
              docId={doc.id}
              entities={entities}
              activeTypes={activeTypes}
              jumpValue={jumpValue}
            />
          ) : isDocx ? (
            <DocxPreview
              docId={doc.id}
              entities={entities}
              activeTypes={activeTypes}
              jumpValue={jumpValue}
            />
          ) : (
            <iframe
              title="Оригинал файла"
              src={`/api/documents/${doc.id}/file`}
              className="h-full w-full border-0 bg-white"
            />
          )}
        </div>
      )}

      <HighlightDialog
        docId={doc.id}
        open={hlOpen}
        onOpenChange={setHlOpen}
        hasCustom={entities.some((e) => e.source === 'custom')}
        onDone={onEntitiesChanged}
      />
    </div>
  );
});

function HighlightDialog({
  docId,
  open,
  onOpenChange,
  hasCustom,
  onDone,
}: {
  docId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hasCustom: boolean;
  onDone?: () => void;
}) {
  const [pattern, setPattern] = useState('');
  const [label, setLabel] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pattern.trim() || busy) return;
    setBusy(true);
    try {
      const res = await highlightInDocument(docId, {
        pattern: pattern.trim(),
        label: label.trim() || undefined,
        isRegex,
        save,
      });
      if (res.count > 0) {
        toast.success(`Подсвечено совпадений: ${res.count}`);
      } else {
        toast.info('Совпадений не найдено — проверьте написание');
      }
      setPattern('');
      setLabel('');
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    setBusy(true);
    try {
      await clearCustomHighlights(docId);
      toast.success('Пользовательские подсветки сняты');
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Подсветить свою сущность</DialogTitle>
          <DialogDescription>
            Введите слово, фразу или регулярное выражение — все совпадения будут
            подчёркнуты в документе как сущности типа «Своя сущность».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="hl-pattern">Текст или regex</Label>
            <Input
              id="hl-pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={isRegex ? String.raw`\d{2}/\d{2}/\d{4}` : 'Например: ООО «Вектор»'}
              className="min-h-[44px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
          </div>

          <div className="flex items-center gap-2 min-h-[44px]">
            <Checkbox
              id="hl-regex"
              checked={isRegex}
              onCheckedChange={(v) => setIsRegex(v === true)}
            />
            <Label htmlFor="hl-regex" className="cursor-pointer font-normal">
              Это регулярное выражение
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hl-label">Название (необязательно)</Label>
            <Input
              id="hl-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Например: Номер договора"
              className="min-h-[44px]"
            />
          </div>

          <div className="flex items-center gap-2 min-h-[44px]">
            <Checkbox
              id="hl-save"
              checked={save}
              onCheckedChange={(v) => setSave(v === true)}
            />
            <Label htmlFor="hl-save" className="cursor-pointer font-normal">
              Сохранить как постоянный шаблон для всех документов
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {hasCustom ? (
            <Button
              variant="ghost"
              onClick={clearAll}
              disabled={busy}
              className="min-h-[44px] gap-1.5 text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Снять все мои подсветки
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={submit} disabled={!pattern.trim() || busy} className="min-h-[44px] gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Highlighter className="h-4 w-4" />}
            Подсветить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
