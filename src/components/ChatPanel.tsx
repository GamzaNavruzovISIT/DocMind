import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Trash2, User } from 'lucide-react';
import { getHistory, clearHistory, streamChat } from '@/lib/api';
import type { ChatMessage } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Props {
  documentId: string | null;
  docReady: boolean;
  onSourceClick?: (startOffset: number) => void;
}

const SUGGESTIONS = [
  'Сделай краткое резюме документа',
  'Какие ключевые условия и суммы упоминаются?',
  'Перечисли всех участников и их роли',
  'Какие сроки и даты важны?',
];

export default function ChatPanel({ documentId, docReady, onSourceClick }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    getHistory(documentId ?? undefined)
      .then(setMessages)
      .catch(() => {});
  }, [documentId]);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      setInput('');
      setBusy(true);
      setMessages((m) => [
        ...m,
        { role: 'user', content: message },
        { role: 'assistant', content: '', streaming: true },
      ]);
      scrollDown();

      cancelRef.current = streamChat(
        { message, documentId },
        {
          onToken: (token) => {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.streaming) {
                copy[copy.length - 1] = { ...last, content: last.content + token };
              }
              return copy;
            });
            scrollDown();
          },
          onDone: (sources) => {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.streaming) {
                copy[copy.length - 1] = { ...last, streaming: false, sources };
              }
              return copy;
            });
            setBusy(false);
          },
          onError: (err) => {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.streaming) {
                copy[copy.length - 1] = {
                  ...last,
                  streaming: false,
                  content:
                    last.content ||
                    `Ошибка: ${err.message}. Проверьте, что Ollama запущен (ollama serve) и модель загружена.`,
                };
              }
              return copy;
            });
            setBusy(false);
          },
        },
      );
    },
    [busy, documentId, scrollDown],
  );

  useEffect(() => () => cancelRef.current?.(), []);

  const handleClear = async () => {
    try {
      await clearHistory(documentId ?? undefined);
      setMessages([]);
      toast.success('История чата очищена');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="text-sm font-semibold">Чат с документом</div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
            title="Очистить историю"
            onClick={handleClear}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="nice-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Задайте вопрос — отвечу по содержимому документа со ссылками на
              фрагменты.
            </div>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  disabled={!docReady}
                  onClick={() => send(s)}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent/40 disabled:opacity-50 min-h-[44px]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2.5', msg.role === 'user' && 'justify-end')}>
              {msg.role === 'assistant' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border',
                )}
              >
                <div className="whitespace-pre-wrap">
                  {msg.content}
                  {msg.streaming && (
                    <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-primary/70 align-middle" />
                  )}
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                    {msg.sources.map((s) => (
                      <button
                        key={s.n}
                        title={s.preview}
                        onClick={() => onSourceClick?.(s.startOffset)}
                        className="rounded-md bg-secondary px-2 py-1 text-[11px] font-mono text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground min-h-[28px]"
                      >
                        Фрагмент {s.n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border p-3">
        {!docReady && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Дождитесь окончания обработки документа
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Вопрос к документу… (Enter — отправить)"
            disabled={!docReady || busy}
            className="min-h-[44px] max-h-[160px] resize-none bg-card"
            rows={1}
          />
          <Button
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={!docReady || busy || !input.trim()}
            onClick={() => send(input)}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
