import React from 'react';
import { CreditCard, Receipt, Home, CheckCircle2, Sparkles, Layers } from 'lucide-react';

export const RequirementsGlassSlabs: React.FC = () => {
  return (
    <section id="requisitos" className="py-12 lg:py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-[#249E82]/15 text-emerald-800 dark:text-[#4CD360] border border-emerald-300 dark:border-[#249E82]/30 mb-3">
            <Layers className="w-3.5 h-3.5" />
            <span>Expediente Simplificado — Cero Complicaciones</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-3">
            Solo 3 Documentos Fáciles de Reunir
          </h2>
          <p className="text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
            Eliminamos la burocracia bancaria tradicional. Sin aval, sin garantías hipotecarias y sin vueltas innecesarias.
          </p>
        </div>

        {/* 3D Glass Slabs Grid (Directly inspired by Slide 4) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {/* Slab 1: INE / Identificación */}
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-[#249E82] to-[#00D1FF] opacity-0 dark:opacity-15 blur-xl rounded-3xl dark:group-hover:opacity-30 transition-opacity" />
            <div className="relative glass-slab-emerald rounded-3xl p-6 sm:p-8 flex flex-col justify-between h-full transform hover:-translate-y-1.5 transition-all shadow-md dark:shadow-xl">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900/90 border border-emerald-300 dark:border-[#249E82]/40 flex items-center justify-center text-emerald-700 dark:text-[#4CD360] shadow-sm">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <span className="px-3.5 py-1 rounded-full text-xs font-black bg-[#249E82] text-white shadow-sm">
                    2 Copias
                  </span>
                </div>

                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
                  Identificación Oficial
                </h3>
                <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed mb-4">
                  Credencial de Elector (INE / IFE) vigente o Pasaporte mexicano. Debe presentarse con fotografía nítida y firma visible por ambos lados.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-[#4CD360]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Aplica para Clásico y Express</span>
              </div>
            </div>
          </div>

          {/* Slab 2: Recibo de Nómina */}
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-[#396CAE] to-[#249E82] opacity-0 dark:opacity-15 blur-xl rounded-3xl dark:group-hover:opacity-30 transition-opacity" />
            <div className="relative glass-slab-emerald rounded-3xl p-6 sm:p-8 flex flex-col justify-between h-full transform hover:-translate-y-1.5 transition-all shadow-md dark:shadow-xl">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900/90 border border-blue-300 dark:border-[#396CAE]/40 flex items-center justify-center text-[#1E40AF] dark:text-[#00D1FF] shadow-sm">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <span className="px-3.5 py-1 rounded-full text-xs font-black bg-[#396CAE] text-white shadow-sm">
                    1 Copia
                  </span>
                </div>

                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
                  Recibo de Nómina
                </h3>
                <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed mb-4">
                  Último talón o comprobante de pago quincenal donde se aprecien percepciones y deducciones emitido por la dependencia de Gobierno o Supremo Tribunal.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-[#4CD360]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Aplica para Clásico y Express</span>
              </div>
            </div>
          </div>

          {/* Slab 3: Comprobante de Domicilio */}
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-purple-500 to-[#396CAE] opacity-0 dark:opacity-15 blur-xl rounded-3xl dark:group-hover:opacity-30 transition-opacity" />
            <div className="relative glass-slab-emerald rounded-3xl p-6 sm:p-8 flex flex-col justify-between h-full transform hover:-translate-y-1.5 transition-all shadow-md dark:shadow-xl">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900/90 border border-purple-300 dark:border-purple-500/40 flex items-center justify-center text-purple-800 dark:text-purple-300 shadow-sm">
                    <Home className="w-6 h-6" />
                  </div>
                  <span className="px-3.5 py-1 rounded-full text-xs font-black bg-purple-600 text-white shadow-sm">
                    1 Copia
                  </span>
                </div>

                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
                  Comprobante de Domicilio
                </h3>
                <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed mb-4">
                  Recibo reciente de luz (CFE), agua o predial con antigüedad menor a 3 meses.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex items-center gap-2 text-xs font-semibold text-purple-800 dark:text-purple-300">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Exclusivo para Crédito Clásico (Normal)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
