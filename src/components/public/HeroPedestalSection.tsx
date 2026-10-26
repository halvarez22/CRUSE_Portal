import React from 'react';
import { Shield, Sparkles, ArrowRight, ChevronDown } from 'lucide-react';
import { COMPANY_INFO } from '../../data/cruseData';

export const HeroPedestalSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden pt-8 pb-16 lg:pt-14 lg:pb-24">
      {/* Background Ambient Glow Elements (Neutralizados en Modo Claro conforme a Guardrail 3; intactos en Modo Oscuro) */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-b from-[#249E82]/20 via-[#396CAE]/15 to-transparent blur-[120px] rounded-full pointer-events-none -z-10 opacity-0 dark:opacity-100" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main 3D Pedestal Banner (Inspired by Slide 1) */}
        <div className="glass-panel rounded-3xl p-6 sm:p-10 lg:p-14 relative overflow-hidden text-center flex flex-col items-center">
          {/* Subtle perimeter light border */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#249E82]/5 dark:from-[#249E82]/10 via-transparent to-transparent pointer-events-none" />

          {/* Top Trust Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-[#249E82]/15 text-emerald-800 dark:text-[#4CD360] border border-emerald-300 dark:border-[#249E82]/30 mb-8 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-emerald-700 dark:text-[#4CD360]" />
            <span>Respaldando a los trabajadores del Estado desde {COMPANY_INFO.foundedYear}</span>
          </div>

          {/* 3D Glass Pedestal Graphic Simulation */}
          <div className="relative mb-8 group">
            {/* Ambient pedestal glow (Solo en Modo Oscuro conforme a Guardrail 3) */}
            <div className="absolute -inset-4 bg-gradient-to-r from-[#249E82] via-[#00D1FF] to-[#396CAE] opacity-0 dark:opacity-30 blur-2xl rounded-full dark:group-hover:opacity-50 transition-opacity" />

            {/* The Frosted Glass Pedestal Slab */}
            <div className="relative w-56 sm:w-72 h-28 sm:h-36 rounded-2xl bg-slate-50 dark:bg-transparent glass-slab-emerald flex items-center justify-center p-4 border border-slate-200 dark:border-[#249E82]/50 shadow-md dark:shadow-2xl transform hover:-translate-y-1 transition-transform">
              <div className="bg-white rounded-xl px-4 py-2 shadow-sm dark:shadow-xl border border-slate-200 flex items-center justify-center">
                <img
                  src="/branding/logotipo-cruse-oficial.png"
                  alt="Cruse Microfinanciera"
                  className="h-10 sm:h-12 w-auto object-contain"
                />
              </div>
            </div>

            {/* Bottom pedestal reflection rim (Atenuado en Modo Claro) */}
            <div className="w-48 sm:w-60 h-3 bg-gradient-to-r from-transparent via-[#4CD360]/60 to-transparent mx-auto blur-xs -mt-1 opacity-0 dark:opacity-100" />
          </div>

          {/* Main Title (Slide 1 Typography — Contraste WCAG AAA en Modo Claro) */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white max-w-4xl leading-tight mb-4">
            Ecosistema Operativo Cruse
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg lg:text-xl text-slate-700 dark:text-slate-300 max-w-3xl leading-relaxed mb-8">
            {COMPANY_INFO.tagline}. Créditos de nómina directos para empleados en activo, jubilados y pensionados del{' '}
            <strong className="text-slate-900 dark:text-white font-bold">Gobierno del Estado de Chihuahua</strong> y del{' '}
            <strong className="text-slate-900 dark:text-white font-bold">Supremo Tribunal de Justicia</strong>.
          </p>

          {/* 4 Feature Cards (Pillars — Guardrail 2: Contraste WCAG AA/AAA en Modo Claro, intacto en Modo Oscuro) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full max-w-4xl mb-10">
            <div className="glass-card rounded-2xl p-4 text-center border border-slate-200 dark:border-emerald-500/30 shadow-sm">
              <span className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-[#4CD360] font-mono block">
                0%
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-200 block mt-0.5">
                Comisión por Apertura
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-0.5">
                Recibes el 100% de tu préstamo
              </span>
            </div>

            <div className="glass-card rounded-2xl p-4 text-center border border-slate-200 dark:border-blue-500/30 shadow-sm">
              <span className="text-2xl sm:text-3xl font-black text-[#1E40AF] dark:text-[#00D1FF] font-mono block">
                1.97%
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-200 block mt-0.5">
                Tasa Quincenal Fija
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-0.5">
                Sin variaciones ni sorpresas
              </span>
            </div>

            <div className="glass-card rounded-2xl p-4 text-center border border-slate-200 dark:border-teal-500/30 shadow-sm">
              <span className="text-xl sm:text-2xl font-black text-teal-800 dark:text-[#249E82] block">
                Sin Aval
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-200 block mt-0.5">
                Garantía en Nómina
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-0.5">
                Descuento quincenal automático
              </span>
            </div>

            <div className="glass-card rounded-2xl p-4 text-center border border-slate-200 dark:border-purple-500/30 shadow-sm">
              <span className="text-xl sm:text-2xl font-black text-purple-800 dark:text-purple-300 block">
                Sin Buró
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-200 block mt-0.5">
                Capacidad Real de Pago
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-0.5">
                Evaluamos tu estabilidad laboral
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="#simulador"
              className="px-7 py-3.5 rounded-xl bg-gradient-to-r from-[#249E82] to-[#1E9F81] text-white font-bold text-sm shadow-md glow-teal hover:opacity-95 transition-all flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
            >
              <span>Simular mi Crédito Oficial</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <a
              href="#alianzas"
              className="px-6 py-3.5 rounded-xl bg-white dark:bg-white/5 text-slate-900 dark:text-slate-200 hover:bg-slate-50 hover:text-emerald-800 dark:hover:text-white font-bold text-sm transition-all border border-slate-300 dark:border-white/20 shadow-sm flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
            >
              <Shield className="w-4 h-4 text-[#1E40AF] dark:text-[#396CAE]" />
              <span>Ver Convenios y Modelo Operativo</span>
            </a>
          </div>

          {/* Scroll Down Indicator */}
          <div className="mt-8 text-slate-600 dark:text-slate-500 text-xs font-medium flex items-center gap-1">
            <span>Desliza para calcular cuotas y requisitos</span>
            <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
          </div>
        </div>
      </div>
    </section>
  );
};
