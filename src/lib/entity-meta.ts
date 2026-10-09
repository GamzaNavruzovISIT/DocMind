import type { EntityType } from '@/types';
import {
  User,
  Phone,
  Mail,
  CalendarDays,
  MapPin,
  Building2,
  Banknote,
  Hash,
  Highlighter,
  type LucideIcon,
} from 'lucide-react';

export interface EntityMeta {
  label: string;
  plural: string;
  icon: LucideIcon;
  mark: string;
  chip: string;
  dot: string;
}

export const ENTITY_META: Record<EntityType, EntityMeta> = {
  person: {
    label: 'ФИО',
    plural: 'ФИО',
    icon: User,
    mark: 'mark bg-amber-300/60 text-amber-950 border-b-2 border-amber-500',
    chip: 'bg-amber-100 text-amber-900 border-amber-300',
    dot: 'bg-amber-500',
  },
  phone: {
    label: 'Телефон',
    plural: 'Телефоны',
    icon: Phone,
    mark: 'mark bg-sky-200/80 text-sky-950 border-b-2 border-sky-500',
    chip: 'bg-sky-100 text-sky-900 border-sky-300',
    dot: 'bg-sky-500',
  },
  email: {
    label: 'E-mail',
    plural: 'E-mail',
    icon: Mail,
    mark: 'mark bg-violet-200/80 text-violet-950 border-b-2 border-violet-500',
    chip: 'bg-violet-100 text-violet-900 border-violet-300',
    dot: 'bg-violet-500',
  },
  date: {
    label: 'Дата',
    plural: 'Даты',
    icon: CalendarDays,
    mark: 'mark bg-emerald-200/80 text-emerald-950 border-b-2 border-emerald-600',
    chip: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    dot: 'bg-emerald-500',
  },
  address: {
    label: 'Адрес',
    plural: 'Адреса',
    icon: MapPin,
    mark: 'mark bg-rose-200/80 text-rose-950 border-b-2 border-rose-500',
    chip: 'bg-rose-100 text-rose-900 border-rose-300',
    dot: 'bg-rose-500',
  },
  org: {
    label: 'Организация',
    plural: 'Организации',
    icon: Building2,
    mark: 'mark bg-indigo-200/80 text-indigo-950 border-b-2 border-indigo-500',
    chip: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    dot: 'bg-indigo-500',
  },
  money: {
    label: 'Сумма',
    plural: 'Суммы',
    icon: Banknote,
    mark: 'mark bg-lime-200/80 text-lime-950 border-b-2 border-lime-600',
    chip: 'bg-lime-100 text-lime-900 border-lime-300',
    dot: 'bg-lime-500',
  },
  doc_number: {
    label: 'Реквизит',
    plural: 'Реквизиты',
    icon: Hash,
    mark: 'mark bg-orange-200/80 text-orange-950 border-b-2 border-orange-500',
    chip: 'bg-orange-100 text-orange-900 border-orange-300',
    dot: 'bg-orange-500',
  },
  custom: {
    label: 'Своя сущность',
    plural: 'Свои сущности',
    icon: Highlighter,
    mark: 'mark bg-fuchsia-200/80 text-fuchsia-950 border-b-2 border-fuchsia-500',
    chip: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300',
    dot: 'bg-fuchsia-500',
  },
};

export const ENTITY_HIGHLIGHT_COLORS: Record<EntityType, string> = {
  person: 'rgba(251, 191, 36, 0.45)',
  phone: 'rgba(125, 211, 252, 0.5)',
  email: 'rgba(196, 181, 253, 0.5)',
  date: 'rgba(110, 231, 183, 0.45)',
  address: 'rgba(253, 164, 175, 0.45)',
  org: 'rgba(165, 180, 252, 0.5)',
  money: 'rgba(190, 242, 100, 0.45)',
  doc_number: 'rgba(253, 186, 116, 0.5)',
  custom: 'rgba(240, 171, 252, 0.5)',
};

export const ENTITY_TYPES = Object.keys(ENTITY_META) as EntityType[];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
