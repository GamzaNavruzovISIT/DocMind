import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Play, Sparkles } from 'lucide-react';
import { listTemplates, streamExtract, listExtractions } from '@/lib/api';
import type { Extraction, ExtractionResult, Template } from '@/types';
import { formatDate } from '@/lib/entity-meta';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Link } from 'react-router';

interface Props {
  documentId: string;
  docReady: boolean;
  docTitle: string;
}

export default function ExtractPanel({ documentId, docReady, docTitle }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [currentField, setCurrentField] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ExtractionResult>>({});
  const [history, setHistory] = useState<Extraction[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    listTemplates()
      .then((t) => {
        setTemplates(t);
        if (t.length && !templateId) setTemplateId(t[0].id);
      })
      .catch(() => {});
    listExtractions(documentId).then(setHistory).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const run = useCallback(() => {
    if (!templateId || running) return;
    setRunning(true);
    setResults({});
    setCurrentField(null);

    cancelRef.current = streamExtract(
      { documentId, templateId },
      {
        onProgress: (field) => setCurrentField(field),
        onField: (field, result) => {
          setResults((r) => ({ ...r, [field]: result }));
          setCurrentField(null);
        },
        onDone: (all) => {
          setResults(all);
          setRunning(false);
          setCurrentField(null);
          toast.success('Извлечение завершено');
          listExtractions(documentId).then(setHistory).catch(() => {});
        },
        onError: (err) => {
          setRunning(false);
          setCurrentField(null);
          toast.error(`Ошибка извлечения: ${err.message}`);
        },
      },
    );
  }, [documentId, templateId, running]);

  useEffect(() => () => cancelRef.current?.(), []);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const exportCsv = () => {
    const rows = [
      ['Поле', 'Значение', 'Цитата из документа'],
      ...Object.entries(results).map(([k, v]) => [
        k,
        v.value === null ? '' : String(v.value),
        v.evidence,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docTitle}_извлечение.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="nice-scroll flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">
        Извлечение по шаблону
      </div>

      <div className="space-y-3 p-4">
        {templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
            Шаблонов пока нет.{' '}
            <Link to="/templates" className="font-medium text-primary underline">
              Создайте шаблон
            </Link>{' '}
            — например «Договор»: стороны, сумма, срок действия, реквизиты.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="min-h-[44px] flex-1 bg-card">
                  <SelectValue placeholder="Выберите шаблон" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.fields.length} полей)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={run}
                disabled={!docReady || !templateId || running}
                className="min-h-[44px] gap-1.5"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {running ? 'Извлекаю…' : 'Извлечь'}
              </Button>
            </div>
            {selectedTemplate && (
              <div className="text-xs text-muted-foreground">
                Поля: {selectedTemplate.fields.map((f) => f.name).join(' · ')}
              </div>
            )}
          </>
        )}

        {currentField && (
          <div className="flex items-center gap-2 rounded-md bg-accent/50 px-3 py-2 text-sm">
            <Sparkles className="h-4 w-4 animate-pulse text-primary" />
            Извлекаю поле «{currentField}»…
          </div>
        )}

        {Object.keys(results).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Результаты</div>
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                className="min-h-[36px] gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[38%]">Поле</TableHead>
                    <TableHead>Значение</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(results).map(([field, res]) => (
                    <TableRow key={field}>
                      <TableCell className="align-top font-medium">{field}</TableCell>
                      <TableCell className="align-top">
                        {res.value === null || res.value === '' ? (
                          <span className="text-muted-foreground">— не найдено —</span>
                        ) : (
                          <span className="font-medium">{String(res.value)}</span>
                        )}
                        {res.evidence && (
                          <div className="mt-1 border-l-2 border-primary/40 pl-2 text-xs italic text-muted-foreground">
                            «{res.evidence}»
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-sm font-semibold text-muted-foreground">
              История извлечений
            </div>
            {history.map((h) => (
              <details
                key={h.id}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <summary className="cursor-pointer select-none font-medium min-h-[32px] leading-8">
                  {h.template_name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {formatDate(h.created_at)}
                  </span>
                </summary>
                <div className="mt-1 space-y-1 pb-1">
                  {Object.entries(h.results).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="w-[40%] shrink-0 text-muted-foreground">{k}</span>
                      <span className="break-words">
                        {v.value === null ? '—' : String(v.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
