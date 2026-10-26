import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { ThemeMode } from '../../types';

interface ThemeToggleProps {
  theme: ThemeMode;
  onToggle: () => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const isDark = theme === 'dark';

  return (
    <button
      onClick={onToggle}
      type="button"
      className="relative p-2 rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82] glass-card border border-slate-200 dark:border-white/10 hover:border-[#249E82]/50 text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white shadow-sm"
      aria-label={isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
      title={isDark ? 'Activar Modo Claro' : 'Activar Modo Oscuro'}
    >
      <div className="relative w-5 h-5 flex items-center justify-center">
        {isDark ? (
          <Sun className="w-5 h-5 text-amber-400 transition-transform duration-300 hover:rotate-45" />
        ) : (
          <Moon className="w-5 h-5 text-[#0F172A] transition-transform duration-300 hover:-rotate-12" />
        )}
      </div>
    </button>
  );
};
