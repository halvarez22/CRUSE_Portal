import React, { useState } from 'react';
import { Lock, Menu, X, ShieldCheck } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { ThemeMode } from '../../types';

interface HeaderNavbarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenInstitutionalAccess?: () => void;
}

export const HeaderNavbar: React.FC<HeaderNavbarProps> = ({
  theme,
  onToggleTheme,
  onOpenInstitutionalAccess,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Simulador', href: '#simulador' },
    { name: 'Requisitos', href: '#requisitos' },
    { name: 'Alianzas', href: '#alianzas' },
    { name: 'Modelo Operativo', href: '#fases' },
    { name: 'Asistente IA', href: '#asistente-ia' },
    { name: 'Contacto', href: '#contacto' },
  ];

  return (
    <header className="w-full bg-white dark:bg-[#030914] border-b border-slate-200 dark:border-white/15 shadow-md transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo Oficial de Cruse con Contenedor de Alto Contraste */}
          <a href="#" className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82] rounded-xl p-1">
            <div className="bg-white rounded-xl px-3 py-1.5 shadow-sm border border-slate-200 flex items-center justify-center transition-transform group-hover:scale-105">
              <img
                src="/branding/logotipo-cruse-oficial.png"
                alt="Microfinanciera Cruse SOFOM E.N.R."
                className="h-9 w-auto object-contain"
              />
            </div>
            <div className="hidden sm:block border-l border-slate-300 dark:border-white/20 pl-3">
              <span className="text-[11px] uppercase tracking-widest text-[#0F766E] dark:text-[#249E82] font-black block">
                SOFOM E.N.R.
              </span>
              <span className="text-xs font-bold text-slate-950 dark:text-slate-200">
                Crédito de Nómina Gubernamental
              </span>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="px-3 py-2 rounded-lg text-xs lg:text-sm font-bold text-slate-950 hover:text-[#0F766E] hover:bg-slate-100/80 dark:text-slate-200 dark:hover:text-[#4CD360] dark:hover:bg-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Actions & Utilities */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle Button */}
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />

            {/* Institutional Access (2FA) Button */}
            <button
              onClick={onOpenInstitutionalAccess}
              type="button"
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-[#041734] to-[#396CAE] dark:from-[#396CAE] dark:to-[#249E82] text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center gap-2 border border-slate-800/20 dark:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
              aria-label="Acceso Institucional Seguro con Autenticación de Doble Factor"
            >
              <Lock className="w-3.5 h-3.5 text-[#00D1FF] dark:text-white" />
              <span className="hidden sm:inline">Acceso Institucional (2FA)</span>
              <span className="sm:hidden">2FA</span>
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
              className="md:hidden p-2 rounded-xl glass-card text-slate-950 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
              aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú de navegación'}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-slate-200 dark:border-white/10 space-y-2">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-bold text-slate-950 hover:text-[#0F766E] dark:text-slate-200 dark:hover:text-[#4CD360] transition-colors"
              >
                {link.name}
              </a>
            ))}
            <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-400 px-3">
              <ShieldCheck className="w-4 h-4 text-[#0F766E] dark:text-[#249E82]" />
              <span>Plataforma blindada con cifrado bancario</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
