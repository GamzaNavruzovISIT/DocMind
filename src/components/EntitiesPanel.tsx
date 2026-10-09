import { useMemo } from 'react';
import type { EntityItem, EntityType } from '@/types';
import { ENTITY_META, ENTITY_TYPES } from '@/lib/entity-meta';
import { cn } from '@/lib/utils';

interface Props {
  entities: EntityItem[];
  activeTypes: Set<EntityType>;
  onToggleType: (type: EntityType) => void;
  onJump: (offset: number) => void;
}

export default function EntitiesPanel({
  entities,
  activeTypes,
  onToggleType,
  onJump,
}: Props) {
  const grouped = useMemo(() => {
    const map = new Map<EntityType, Map<string, number>>();
    for (const e of entities) {
      if (!map.has(e.type)) map.set(e.type, new Map());
      const values = map.get(e.type)!;
      values.set(e.value, (values.get(e.value) ?? 0) + 1);
    }
    return map;
  }, [entities]);

  const firstOffset = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entities) {
      const key = `${e.type}::${e.value}`;
      if (!map.has(key)) map.set(key, e.startOffset);
    }
    return map;
  }, [entities]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">
        Сущности в документе
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3">
        {ENTITY_TYPES.map((type) => {
          const meta = ENTITY_META[type];
          const count = grouped.get(type)?.size ?? 0;
          const active = activeTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => onToggleType(type)}
              disabled={count === 0}
              className={cn(
                'flex min-h-[32px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-all',
                active
                  ? meta.chip
                  : 'border-border bg-card text-muted-foreground opacity-50',
                count === 0 && 'cursor-not-allowed opacity-30',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
              {meta.plural}
              {count > 0 && <span className="font-mono">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {entities.length === 0 ? (
          <div className="pt-6 text-center text-sm text-muted-foreground">
            Сущности пока не найдены.
            <br />
            Нажмите «Глубокий поиск сущностей (ИИ)» над текстом документа.
          </div>
        ) : (
          ENTITY_TYPES.filter((t) => activeTypes.has(t) && grouped.has(t)).map(
            (type) => {
              const meta = ENTITY_META[type];
              const values = [...(grouped.get(type)?.entries() ?? [])];
              return (
                <div key={type} className="mb-4">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <meta.icon className="h-3.5 w-3.5" />
                    {meta.plural}
                  </div>
                  <div className="space-y-1">
                    {values.map(([value, count]) => (
                      <button
                        key={value}
                        onClick={() => onJump(firstOffset.get(`${type}::${value}`) ?? 0)}
                        className="flex w-full items-start justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors hover:border-border hover:bg-card min-h-[36px]"
                        title={value}
                      >
                        <span className="flex min-w-0 items-start gap-2">
                          <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', meta.dot)} />
                          <span className="break-words leading-snug">{value}</span>
                        </span>
                        {count > 1 && (
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            ×{count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            },
          )
        )}
      </div>
    </div>
  );
}
