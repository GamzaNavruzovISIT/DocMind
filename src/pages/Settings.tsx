import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Database,
  Globe,
  Highlighter,
  Loader2,
  Plus,
  Save,
  ScanText,
  Server,
  Trash2,
} from 'lucide-react';
import {
  createCustomPattern,
  deleteCustomPattern,
  getSettings,
  listCustomPatterns,
  saveSettings,
  testConnection,
} from '@/lib/api';
import type { AppSettings, CustomPattern } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

function parseDbUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: u.port || '5432',
      database: u.pathname.replace(/^\//, '') || 'docmind',
      user: decodeURIComponent(u.username) || 'postgres',
      password: decodeURIComponent(u.password) || '',
    };
  } catch {
    return { host: 'localhost', port: '5432', database: 'docmind', user: 'postgres', password: '' };
  }
}

function composeDbUrl(p: ReturnType<typeof parseDbUrl>): string {
  return `postgres://${encodeURIComponent(p.user)}:${encodeURIComponent(p.password)}@${p.host}:${p.port}/${p.database}`;
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [db, setDb] = useState(parseDbUrl(''));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<CustomPattern[]>([]);
  const [newPattern, setNewPattern] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newIsRegex, setNewIsRegex] = useState(false);

  const load = useCallback(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setDb(parseDbUrl(s.databaseUrl));
      })
      .catch((err) => toast.error((err as Error).message));
    listCustomPatterns().then(setPatterns).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const patch = (p: Partial<AppSettings>) =>
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));

  const handleSave = async () => {
    if (!settings || saving) return;
    setSaving(true);
    try {
      const res = await saveSettings({ ...settings, databaseUrl: composeDbUrl(db) });
      if (res.warning) toast.warning(res.warning, { duration: 8000 });
      else toast.success('Настройки сохранены и применены');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (kind: 'ollama' | 'database' | 'remote') => {
    if (!settings) return;
    setTesting(kind);
    try {
      const res = await testConnection(
        kind === 'ollama'
          ? { kind, baseUrl: settings.ollamaBaseUrl }
          : kind === 'database'
            ? { kind, url: composeDbUrl(db) }
            : { kind, url: settings.remote.url, token: settings.remote.token },
      );
      if (res.ok) {
        toast.success(
          kind === 'ollama'
            ? `Ollama доступен. Моделей: ${res.models?.length ?? 0}`
            : kind === 'database'
              ? 'PostgreSQL: подключение успешно'
              : `Сервер доступен (HTTP ${res.status ?? 'ok'})`,
        );
      } else {
        toast.error(res.error ?? 'Проверка не пройдена');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTesting(null);
    }
  };

  const addPattern = async () => {
    if (!newPattern.trim()) return;
    try {
      const created = await createCustomPattern({
        label: newLabel.trim() || undefined,
        pattern: newPattern.trim(),
        isRegex: newIsRegex,
      });
      setPatterns((prev) => [created, ...prev]);
      setNewPattern('');
      setNewLabel('');
      setNewIsRegex(false);
      toast.success('Шаблон добавлен — он применится к новым документам');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const removePattern = async (id: string) => {
    try {
      await deleteCustomPattern(id);
      setPatterns((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (!settings) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Настройки</h1>
          <p className="text-sm text-muted-foreground">
            Изменения применяются сразу и сохраняются в settings.json рядом с приложением.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="min-h-[44px] gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Сохранить
        </Button>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-primary" />
              Ollama
            </CardTitle>
            <CardDescription>Адрес сервера Ollama и модели для чата и эмбеддингов.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ollama-url">Базовый URL (хост и порт)</Label>
                <Input
                  id="ollama-url"
                  value={settings.ollamaBaseUrl}
                  onChange={(e) => patch({ ollamaBaseUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                  className="min-h-[44px] font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="chat-model">Чат-модель</Label>
                <Input
                  id="chat-model"
                  value={settings.chatModel}
                  onChange={(e) => patch({ chatModel: e.target.value })}
                  placeholder="qwen2.5:7b"
                  className="min-h-[44px] font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="embed-model">Модель эмбеддингов</Label>
                <Input
                  id="embed-model"
                  value={settings.embedModel}
                  onChange={(e) => patch({ embedModel: e.target.value })}
                  placeholder="nomic-embed-text"
                  className="min-h-[44px] font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ner-max">Макс. символов для ИИ-анализа</Label>
                <Input
                  id="ner-max"
                  type="number"
                  min={1000}
                  value={settings.nerMaxChars}
                  onChange={(e) => patch({ nerMaxChars: Number(e.target.value) })}
                  className="min-h-[44px] font-mono text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Сменили модель? Не забудьте: <code className="font-mono">ollama pull &lt;модель&gt;</code>
            </p>
            <Button
              variant="outline"
              onClick={() => runTest('ollama')}
              disabled={testing !== null}
              className="min-h-[44px] gap-1.5"
            >
              {testing === 'ollama' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Проверить подключение
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" />
              PostgreSQL
            </CardTitle>
            <CardDescription>
              Подключение к базе данных. При смене применяется без перезапуска.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="db-host">Хост</Label>
                <Input id="db-host" value={db.host} onChange={(e) => setDb({ ...db, host: e.target.value })} className="min-h-[44px] font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="db-port">Порт</Label>
                <Input id="db-port" type="number" value={db.port} onChange={(e) => setDb({ ...db, port: e.target.value })} className="min-h-[44px] font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="db-name">База данных</Label>
                <Input id="db-name" value={db.database} onChange={(e) => setDb({ ...db, database: e.target.value })} className="min-h-[44px] font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="db-user">Пользователь</Label>
                <Input id="db-user" value={db.user} onChange={(e) => setDb({ ...db, user: e.target.value })} className="min-h-[44px] font-mono text-sm" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="db-pass">Пароль</Label>
                <Input id="db-pass" type="password" value={db.password} onChange={(e) => setDb({ ...db, password: e.target.value })} className="min-h-[44px] font-mono text-sm" autoComplete="new-password" />
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => runTest('database')}
              disabled={testing !== null}
              className="min-h-[44px] gap-1.5"
            >
              {testing === 'database' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Проверить подключение
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanText className="h-4 w-4 text-primary" />
              OCR скан-копий
            </CardTitle>
            <CardDescription>
              Распознавание PDF без текстового слоя и изображений (локальный Tesseract).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 min-h-[44px]">
              <Label htmlFor="ocr-enabled" className="cursor-pointer font-normal">
                Распознавать сканы автоматически
              </Label>
              <Switch
                id="ocr-enabled"
                checked={settings.ocr.enabled}
                onCheckedChange={(v) => patch({ ocr: { ...settings.ocr, enabled: v } })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Языки распознавания</Label>
                <Select
                  value={settings.ocr.language}
                  onValueChange={(v) => patch({ ocr: { ...settings.ocr, language: v } })}
                >
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rus+eng">Русский + английский</SelectItem>
                    <SelectItem value="rus">Только русский</SelectItem>
                    <SelectItem value="eng">Только английский</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ocr-pages">Макс. страниц на документ</Label>
                <Input
                  id="ocr-pages"
                  type="number"
                  min={1}
                  max={500}
                  value={settings.ocr.maxPages}
                  onChange={(e) => patch({ ocr: { ...settings.ocr, maxPages: Number(e.target.value) } })}
                  className="min-h-[44px] font-mono text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              При первом распознавании Tesseract один раз скачивает языковые данные (~10 МБ) — нужен интернет.
              Дальше всё работает офлайн.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-primary" />
              Отправка на удалённый сервер
            </CardTitle>
            <CardDescription>
              Кнопка «Отправить» в документе делает POST с JSON (текст, сущности, извлечённые поля) на этот URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="remote-url">URL приёмника</Label>
              <Input
                id="remote-url"
                value={settings.remote.url}
                onChange={(e) => patch({ remote: { ...settings.remote, url: e.target.value } })}
                placeholder="https://example.com/api/ingest"
                className="min-h-[44px] font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="remote-token">Bearer-токен (необязательно)</Label>
              <Input
                id="remote-token"
                type="password"
                value={settings.remote.token}
                onChange={(e) => patch({ remote: { ...settings.remote, token: e.target.value } })}
                className="min-h-[44px] font-mono text-sm"
                autoComplete="new-password"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => runTest('remote')}
              disabled={testing !== null || !settings.remote.url}
              className="min-h-[44px] gap-1.5"
            >
              {testing === 'remote' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Проверить доступность
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Highlighter className="h-4 w-4 text-primary" />
              Свои сущности
            </CardTitle>
            <CardDescription>
              Постоянные шаблоны подсветки: применяются ко всем новым документам автоматически.
              Для разовой подсветки в одном документе используйте кнопку «Подсветить» в просмотрщике.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {patterns.length > 0 && (
              <div className="space-y-2">
                {patterns.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.label}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {p.isRegex ? 'regex: ' : ''}{p.pattern}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePattern(p.id)}
                      className="min-h-[44px] min-w-[44px] text-destructive"
                      title="Удалить шаблон"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-3 rounded-md border border-dashed border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Название (например: № договора)"
                  className="min-h-[44px]"
                />
                <Input
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  placeholder={newIsRegex ? String.raw`№\s*\d+-\d{4}` : 'Текст для подсветки'}
                  className="min-h-[44px] font-mono text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 min-h-[44px]">
                  <Checkbox
                    id="np-regex"
                    checked={newIsRegex}
                    onCheckedChange={(v) => setNewIsRegex(v === true)}
                  />
                  <Label htmlFor="np-regex" className="cursor-pointer font-normal">
                    Regex
                  </Label>
                </div>
                <Button
                  variant="outline"
                  onClick={addPattern}
                  disabled={!newPattern.trim()}
                  className="min-h-[44px] gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Добавить шаблон
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-primary" />
              Сервер приложения
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-[200px] space-y-1.5">
              <Label htmlFor="srv-port">Порт</Label>
              <Input
                id="srv-port"
                type="number"
                min={1}
                max={65535}
                value={settings.port}
                onChange={(e) => patch({ port: Number(e.target.value) })}
                className="min-h-[44px] font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Порт применяется после перезапуска сервера (npm start). Остальные настройки — сразу.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end pb-8">
          <Button onClick={handleSave} disabled={saving} className="min-h-[44px] gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Сохранить все настройки
          </Button>
        </div>
      </div>
    </div>
  );
}
