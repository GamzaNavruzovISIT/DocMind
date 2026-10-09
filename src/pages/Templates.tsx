import { useCallback, useEffect, useState } from 'react';
import { LayoutTemplate, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from '@/lib/api';
import type { Template, TemplateField } from '@/types';
import { formatDate } from '@/lib/entity-meta';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const FIELD_TYPE_LABELS: Record<TemplateField['type'], string> = {
  string: 'Строка',
  date: 'Дата',
  number: 'Число',
  list: 'Список',
  text: 'Текст',
};

const EXAMPLES: { name: string; description: string; fields: TemplateField[] }[] = [
  {
    name: 'Договор',
    description: 'Ключевые условия договора',
    fields: [
      { name: 'Стороны договора', description: 'Полные названия всех сторон', type: 'list' },
      { name: 'Номер договора', description: '', type: 'string' },
      { name: 'Дата заключения', description: '', type: 'date' },
      { name: 'Сумма договора', description: 'Полная сумма с валютой', type: 'string' },
      { name: 'Срок действия', description: 'До какой даты действует', type: 'date' },
      { name: 'Предмет договора', description: 'Кратко, о чём договор', type: 'text' },
    ],
  },
  {
    name: 'Счёт на оплату',
    description: 'Реквизиты и суммы счёта',
    fields: [
      { name: 'Поставщик', description: 'Название и ИНН', type: 'string' },
      { name: 'Покупатель', description: '', type: 'string' },
      { name: 'Номер счёта', description: '', type: 'string' },
      { name: 'Дата счёта', description: '', type: 'date' },
      { name: 'Сумма к оплате', description: 'Итоговая сумма с НДС', type: 'number' },
      { name: 'Банковские реквизиты', description: 'Банк, БИК, счёт', type: 'text' },
    ],
  },
  {
    name: 'Резюме кандидата',
    description: 'Основная информация о кандидате',
    fields: [
      { name: 'ФИО', description: '', type: 'string' },
      { name: 'Контакты', description: 'Телефон и e-mail', type: 'list' },
      { name: 'Желаемая должность', description: '', type: 'string' },
      { name: 'Опыт работы', description: 'Общий стаж в годах', type: 'number' },
      { name: 'Ключевые навыки', description: '', type: 'list' },
      { name: 'Образование', description: '', type: 'text' },
    ],
  },
];

interface EditorState {
  id: string | null;
  name: string;
  description: string;
  fields: TemplateField[];
}

const emptyEditor = (): EditorState => ({
  id: null,
  name: '',
  description: '',
  fields: [{ name: '', description: '', type: 'string' }],
});

export default function Templates() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Template | null>(null);

  const refresh = useCallback(() => {
    listTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  useEffect(refresh, [refresh]);

  const save = async () => {
    if (!editor) return;
    if (!editor.name.trim()) {
      toast.error('Укажите название шаблона');
      return;
    }
    const fields = editor.fields.filter((f) => f.name.trim());
    if (!fields.length) {
      toast.error('Добавьте хотя бы одно поле');
      return;
    }
    setSaving(true);
    try {
      if (editor.id) {
        await updateTemplate(editor.id, { ...editor, fields });
        toast.success('Шаблон обновлён');
      } else {
        await createTemplate({ ...editor, fields });
        toast.success('Шаблон создан');
      }
      setEditor(null);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteTemplate(toDelete.id);
      toast.success('Шаблон удалён');
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
          <h1 className="text-2xl font-bold tracking-tight">Шаблоны извлечения</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Опишите поля, которые нужно вытащить из документа — локальная модель
            найдёт их и вернёт со ссылками-цитатами.
          </p>
        </div>
        <Button onClick={() => setEditor(emptyEditor())} className="min-h-[44px] gap-1.5">
          <Plus className="h-4 w-4" />
          Новый шаблон
        </Button>
      </div>

      <div className="mb-8">
        <div className="mb-2 text-sm font-semibold text-muted-foreground">
          Начать с готового
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.name}
              onClick={() =>
                setEditor({
                  id: null,
                  name: ex.name,
                  description: ex.description,
                  fields: ex.fields.map((f) => ({ ...f })),
                })
              }
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-accent/40 min-h-[40px]"
            >
              {ex.name}
            </button>
          ))}
        </div>
      </div>

      {templates === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/60 px-6 py-12 text-center">
          <LayoutTemplate className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <div className="font-medium">Шаблонов пока нет</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Создайте свой или воспользуйтесь готовым примером выше.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex flex-col rounded-xl border border-border bg-card p-4"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="font-semibold leading-snug">{tpl.name}</div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() =>
                      setEditor({
                        id: tpl.id,
                        name: tpl.name,
                        description: tpl.description,
                        fields: tpl.fields.map((f) => ({ ...f })),
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => setToDelete(tpl)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {tpl.description && (
                <div className="mb-2 text-sm text-muted-foreground">{tpl.description}</div>
              )}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {tpl.fields.map((f) => (
                  <Badge key={f.name} variant="secondary" className="font-normal">
                    {f.name}
                  </Badge>
                ))}
              </div>
              <div className="mt-auto text-xs text-muted-foreground">
                {formatDate(tpl.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editor} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>
              {editor?.id ? 'Редактировать шаблон' : 'Новый шаблон'}
            </DialogTitle>
            <DialogDescription>
              Каждое поле — это то, что модель должна найти в документе. Хорошее
              описание поля заметно повышает точность.
            </DialogDescription>
          </DialogHeader>

          {editor && (
            <div className="space-y-4">
              <Input
                placeholder="Название шаблона (например, «Договор аренды»)"
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                className="min-h-[44px]"
              />
              <Textarea
                placeholder="Описание (необязательно)"
                value={editor.description}
                onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                rows={2}
              />

              <div className="space-y-2">
                <div className="text-sm font-semibold">Поля для извлечения</div>
                {editor.fields.map((field, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-secondary/40 p-3 sm:grid-cols-[1fr_130px_36px]"
                  >
                    <div className="space-y-2">
                      <Input
                        placeholder="Название поля, напр. «Сумма договора»"
                        value={field.name}
                        onChange={(e) => {
                          const fields = [...editor.fields];
                          fields[i] = { ...field, name: e.target.value };
                          setEditor({ ...editor, fields });
                        }}
                        className="min-h-[40px] bg-card"
                      />
                      <Input
                        placeholder="Подсказка для модели (необязательно)"
                        value={field.description}
                        onChange={(e) => {
                          const fields = [...editor.fields];
                          fields[i] = { ...field, description: e.target.value };
                          setEditor({ ...editor, fields });
                        }}
                        className="min-h-[40px] bg-card text-sm"
                      />
                    </div>
                    <Select
                      value={field.type}
                      onValueChange={(v) => {
                        const fields = [...editor.fields];
                        fields[i] = { ...field, type: v as TemplateField['type'] };
                        setEditor({ ...editor, fields });
                      }}
                    >
                      <SelectTrigger className="min-h-[40px] bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FIELD_TYPE_LABELS).map(([v, label]) => (
                          <SelectItem key={v} value={v}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 justify-self-end text-muted-foreground hover:text-destructive"
                      disabled={editor.fields.length <= 1}
                      onClick={() =>
                        setEditor({
                          ...editor,
                          fields: editor.fields.filter((_, j) => j !== i),
                        })
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[40px] gap-1.5"
                  onClick={() =>
                    setEditor({
                      ...editor,
                      fields: [
                        ...editor.fields,
                        { name: '', description: '', type: 'string' },
                      ],
                    })
                  }
                >
                  <Plus className="h-4 w-4" />
                  Добавить поле
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)} className="min-h-[44px]">
              Отмена
            </Button>
            <Button onClick={save} disabled={saving} className="min-h-[44px]">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить шаблон?</AlertDialogTitle>
            <AlertDialogDescription>
              «{toDelete?.name}» будет удалён вместе с историей извлечений по нему.
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
