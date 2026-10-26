import React from 'react';
import { Landmark, Check, ArrowRightLeft, Users } from 'lucide-react';

export const InstitutionalAlliance: React.FC = () => {
  return (
    <section id="alianzas" className="py-12 lg:py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-[#249E82]/15 text-[#0F766E] dark:text-[#2EBD9B] border border-[#249E82]/30 mb-3">
            <Landmark className="w-3.5 h-3.5" />
            <span>Alianza Institucional Integrada</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-3">
            Convenios con Sectores e Instituciones del Estado
          </h2>
          <p className="text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
            Mediante convenios formales de retención, conectamos nuestro motor financiero con la infraestructura administrativa de las dependencias sin alterar su flujo de trabajo cotidiano.
          </p>
        </div>

        {/* 2 Institutional Pillars Showcase (Inspired by Slide 2) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          
          {/* Card 1: Supremo Tribunal */}
          <div className="bg-white dark:bg-slate-900/60 glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between border border-slate-200 dark:border-white/10 border-l-4 border-l-[#396CAE] shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[#396CAE]/15 border border-[#396CAE]/30 flex items-center justify-center text-[#1E3A8A] dark:text-[#00D1FF] mb-4">
                <Landmark className="w-6 h-6" />
              </div>
              <span className="text-xs uppercase tracking-wider font-bold text-[#1E3A8A] dark:text-[#00D1FF] block mb-1">
                Poder Judicial de Chihuahua
              </span>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-3">
                El Supremo Tribunal de Justicia
              </h3>
              <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
                Convenio de retención directa vía nómina para personal activo, administrativo, juzgados y pensionados. Respetando el tope legal de capacidad de descuento para resguardar el patrimonio familiar.
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-300 font-semibold">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#4CD360]" />
                <span>Descuento automatizado y transparente</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#4CD360]" />
                <span>Sin trámites bancarios engorrosos</span>
              </div>
            </div>
          </div>

          {/* Card 2: Sindicato STSGECH */}
          <div className="bg-white dark:bg-slate-900/60 glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between border border-slate-200 dark:border-white/10 border-l-4 border-l-[#249E82] shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[#249E82]/15 border border-[#249E82]/30 flex items-center justify-center text-[#0F766E] dark:text-[#4CD360] mb-4">
                <Users className="w-6 h-6" />
              </div>
              <span className="text-xs uppercase tracking-wider font-bold text-[#0F766E] dark:text-[#4CD360] block mb-1">
                Gremio de Servidores Públicos
              </span>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-3">
                Sindicato de Trabajadores del Estado (STSGECH)
              </h3>
              <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
                Créditos con condiciones gremiales preferenciales (tasa 1.97% quincenal fija sin comisión) para sindicalizados, delegaciones municipales y empleados de Gobierno del Estado.
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-300 font-semibold">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#4CD360]" />
                <span>Atención directa con delegados seccionales</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#4CD360]" />
                <span>Dispersión en menos de 24 horas por SPEI</span>
              </div>
            </div>
          </div>

        </div>

        {/* Matrix of Sinergia Operativa (Inspired by Slide 8) */}
        <div className="bg-white dark:bg-slate-900/60 glass-panel rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-white/10 shadow-xl">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200 dark:border-white/10">
            <ArrowRightLeft className="w-6 h-6 text-[#0F766E] dark:text-[#249E82]" />
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Matriz de Sinergia Operativa
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Cruse asume el 100% de la carga de cálculo y validación tecnológica para garantizar cero fricción en la institución.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm">
            {/* Gestión Cruse */}
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-wider text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-[#249E82]" />
                Gestión Tecnológica Cruse (Nosotros)
              </h4>
              <ul className="space-y-3 text-slate-700 dark:text-slate-300">
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10">
                  <strong className="text-slate-900 dark:text-white">Gestión Omnicanal:</strong> Cálculo en tiempo real, scoring de riesgo y captura segura de expedientes digitales.
                </li>
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10">
                  <strong className="text-slate-900 dark:text-white">Atención Presencial en Sitio:</strong> Visita de promotores certificados, verificación de firmas y resguardo documental.
                </li>
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10">
                  <strong className="text-slate-900 dark:text-white">Emisión de Listados y Conciliación:</strong> Cruce automático de importes de retención quincenal y gestión de contra-recibos.
                </li>
              </ul>
            </div>

            {/* Facilitación Institucional */}
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-wider text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-[#396CAE]" />
                Facilitación Institucional (Dependencia)
              </h4>
              <ul className="space-y-3 text-slate-700 dark:text-slate-300">
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
                  <span>Otorgar permisos de espacios en sedes sindicales</span>
                  <Check className="w-5 h-5 text-[#0F766E] dark:text-[#4CD360]" />
                </li>
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
                  <span>Cero fricción: El empleado no sale ni abandona su puesto</span>
                  <Check className="w-5 h-5 text-[#0F766E] dark:text-[#4CD360]" />
                </li>
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
                  <span>Ejecutar la retención vía nómina y depositar el consolidado</span>
                  <Check className="w-5 h-5 text-[#0F766E] dark:text-[#4CD360]" />
                </li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
