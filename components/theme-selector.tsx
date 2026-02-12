'use client';

import { useTheme } from '@/shared/lib';
import { Button } from '@/shared/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui';
import { Palette, Check } from 'lucide-react';

const themes = [
  { value: 'light' as const, label: 'Светлая', color: 'bg-white border' },
  { value: 'dark' as const, label: 'Тёмная', color: 'bg-gray-900' },
  { value: 'purple' as const, label: 'Фиолетовая', color: 'bg-purple-600' },
  { value: 'orange' as const, label: 'Оранжевая', color: 'bg-orange-500' },
  { value: 'green' as const, label: 'Зелёная', color: 'bg-green-600' },
  { value: 'pink' as const, label: 'Розовая', color: 'bg-pink-500' },
];

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-1">
          <h4 className="font-medium text-sm mb-2">Выберите тему</h4>
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
            >
              <div className={`w-6 h-6 rounded-full ${t.color}`} />
              <span className="flex-1 text-left text-sm">{t.label}</span>
              {theme === t.value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
