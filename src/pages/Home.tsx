import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  FileText,
  FileUp,
  Loader2,
  Trash2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { listDocuments, uploadDocument, deleteDocument } from '@/lib/api';
import type { DocumentMeta } from '@/types';
import { formatBytes, formatDate } from '@/lib/entity-meta';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function StatusBadge({ doc }: { doc: DocumentMeta }) {
  if (doc.status === 'processing')
    return (
      <Badge variant="secondary" className="gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        Обработка…
      </Badge>
    );
  if (doc.status === 'error')
    return (
      <Badge variant="destructive" className="gap-1.5">
        <AlertTriangle className="h-3 w-3" />
        Ошибка
      </Badge>
    );
  return (
    <Badge className="gap-1.5 bg-emerald-600/15 text-emerald-800 border border-emerald-600/30 hover:bg-emerald-600/20">
      Готов
    </Badge>
  );
}

export default function Home() {
  const [docs, setDocs] = useState<DocumentMeta[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<DocumentMeta | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    listDocuments()
      .then(setDocs)
      .catch((err) => {
        setDocs([]);
        if ((err as Error).message !== 'HTTP 404') {
        }
      });
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      setDocs((prev) => prev);
      listDocuments().then(setDocs).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      for (const file of arr) {
        setUploading((u) => [...u, file.name]);
        try {
          const res = await uploadDocument(file);
          toast.success(`«${file.name}» загружен, идёт обработка`);
          refresh();
          void res;
        } catch (err) {
          toast.error(`«${file.name}»: ${(err as Error).message}`);
        } finally {
          setUploading((u) => u.filter((n) => n !== file.name));
        }
      }
    },
    [refresh],
  );

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteDocument(toDelete.id);
      toast.success('Документ удалён');
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setToDelete(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Мои документы</h1>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            Всё обрабатывается локально: Ollama на вашей машине, документы — в вашем
            PostgreSQL.
          </p>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'mb-8 flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card/60 hover:border-primary/50 hover:bg-card',
        )}
      >
        <FileUp className="h-7 w-7 text-primary" />
        <div className="text-sm font-medium">
          Перетащите файлы сюда или нажмите для выбора
        </div>
        <div className="text-xs text-muted-foreground">
          PDF (включая сканы — OCR), DOCX, TXT, MD, CSV, PNG/JPEG · до 50 МБ
        </div>
        {uploading.length > 0 && (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Загрузка: {uploading.join(', ')}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.log,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {docs === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[118px] animate-pulse rounded-xl bg-card/70" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/60 px-6 py-12 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <div className="font-medium">Пока нет документов</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Загрузите первый документ — после обработки с ним можно будет общаться в
            чате, подсвечивать сущности и извлекать данные по шаблонам.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <div
              key={doc.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/doc/${doc.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/doc/${doc.id}`)}
              className="group relative flex cursor-pointer flex-col rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md min-h-[118px]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium leading-snug" title={doc.title}>
                    {doc.title}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground font-mono">
                    {doc.filename}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge doc={doc} />
                <span>{formatBytes(doc.size_bytes)}</span>
                {Number(doc.entity_count) > 0 && (
                  <span>· {doc.entity_count} сущн.</span>
                )}
                <span className="ml-auto">{formatDate(doc.created_at)}</span>
              </div>
              {doc.status === 'error' && doc.error && (
                <div className="mt-2 line-clamp-2 text-xs text-destructive">
                  {doc.error}
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 h-9 w-9 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setToDelete(doc);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить документ?</AlertDialogTitle>
            <AlertDialogDescription>
              «{toDelete?.title}» будет удалён вместе с фрагментами, сущностями и
              историей чата. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
