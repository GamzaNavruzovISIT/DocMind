import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { FileText, LayoutTemplate, Menu, ScanText, Settings as SettingsIcon } from 'lucide-react';
import { getHealth } from '@/lib/api';
import type { Health } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const items = [
    { to: '/', label: 'Документы', icon: FileText, end: true },
    { to: '/templates', label: 'Шаблоны извлечения', icon: LayoutTemplate, end: false },
    { to: '/settings', label: 'Настройки', icon: SettingsIcon, end: false },
  ];
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px]',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-sidebar-foreground hover:bg-sidebar-accent',
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function HealthIndicator() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = () =>
      getHealth()
        .then((h) => {
          setHealth(h);
          setFailed(false);
        })
        .catch(() => setFailed(true));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const dot = (ok: boolean | null) => (
    <span
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        ok === null
          ? 'bg-muted-foreground/40'
          : ok
            ? 'bg-emerald-500'
            : 'bg-red-500',
      )}
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-md border border-sidebar-border bg-card/60 p-3 text-xs space-y-1.5">
        <div className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">
          Локальные сервисы
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 min-h-[24px]">
              {dot(failed ? false : health ? health.db : null)}
              <span>PostgreSQL</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            {health?.db ? 'Подключено' : 'Недоступен — проверьте DATABASE_URL'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 min-h-[24px]">
              {dot(failed ? false : health ? health.ollama.ok : null)}
              <span>Ollama</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[240px]">
            {health?.ollama.ok
              ? `Модели: ${health.chatModel}${health.ollama.chatModelReady ? ' ✓' : ' — не загружена!'} / ${health.embedModel}${health.ollama.embedModelReady ? ' ✓' : ' — не загружена!'}`
              : 'Недоступен — выполните: ollama serve'}
          </TooltipContent>
        </Tooltip>
        {failed && (
          <div className="text-destructive leading-snug">
            API-сервер недоступен.
            <br />
            Запустите: <code className="font-mono">npm run dev</code>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden lg:flex w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar-background p-4 gap-5 sticky top-0 h-dvh">
        <Link to="/" className="flex items-center gap-2.5 px-1 pt-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ScanText className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-[15px]">DocMind</div>
            <div className="text-[11px] text-muted-foreground">
              локальный ИИ · 100% приватно
            </div>
          </div>
        </Link>
        <NavItems />
        <div className="mt-auto">
          <HealthIndicator />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-2 border-b border-sidebar-border bg-sidebar-background/95 backdrop-blur px-3 h-14">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] bg-sidebar-background p-4">
              <div className="flex items-center gap-2.5 mb-5 px-1 pt-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ScanText className="h-5 w-5" />
                </div>
                <div className="leading-tight">
                  <div className="font-bold text-[15px]">DocMind</div>
                  <div className="text-[11px] text-muted-foreground">
                    локальный ИИ · 100% приватно
                  </div>
                </div>
              </div>
              <NavItems onNavigate={() => setOpen(false)} />
              <div className="mt-6">
                <HealthIndicator />
              </div>
            </SheetContent>
          </Sheet>
          <Link to="/" className="flex items-center gap-2 font-bold text-[15px]">
            <ScanText className="h-5 w-5 text-primary" />
            DocMind
          </Link>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
