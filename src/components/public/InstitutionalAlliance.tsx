import React from 'react';
import { Landmark, Check, ArrowRightLeft, Users, HeartHandshake } from 'lucide-react';

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
            Mediante convenios formales de retención, conectamos nuestro motor financiero con las dependencias y agrupaciones afiliadas respetando estrictamente el límite legal del 30% (Art. 110 LFT).
          </p>
        </div>

        {/* 3 Institutional Pillars Showcase */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 mb-12">
          {/* Card 1: Supremo Tribunal (Solo Activos Sindicalizados y de Confianza) */}
          <div className="bg-white dark:bg-slate-900/60 glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between border border-slate-200 dark:border-white/10 border-l-4 border-l-[#396CAE] shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[#396CAE]/15 border border-[#396CAE]/30 flex items-center justify-center text-[#1E3A8A] dark:text-[#00D1FF] mb-4">
                <Landmark className="w-6 h-6" />
              </div>
              <span className="text-xs uppercase tracking-wider font-bold text-[#1E3A8A] dark:text-[#00D1FF] block mb-1">
                Poder Judicial de Chihuahua
              </span>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">
                Supremo Tribunal de Justicia del Estado
              </h3>
              <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
                Convenio de retención directa vía nómina quincenal o mensual vía compensación para <strong>trabajadores activos (sindicalizados y personal de confianza)</strong> del Supremo Tribunal de Justicia.
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-300 font-semibold">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#4CD360] shrink-0" />
                <span>Personal activo sindicalizado y de confianza</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#4CD360] shrink-0" />
                <span>Atención a personal de confianza en Vía Citadela #5710 Int. #401</span>
              </div>
            </div>
          </div>

          {/* Card 2: Sindicato STSGECH y Delegados Sindicales Municipales */}
          <div className="bg-white dark:bg-slate-900/60 glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between border border-slate-200 dark:border-white/10 border-l-4 border-l-[#249E82] shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-[#249E82]/15 border border-[#249E82]/30 flex items-center justify-center text-[#0F766E] dark:text-[#4CD360] mb-4">
                <Users className="w-6 h-6" />
              </div>
              <span className="text-xs uppercase tracking-wider font-bold text-[#0F766E] dark:text-[#4CD360] block mb-1">
                Gremio de Servidores Públicos
              </span>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">
                Sindicato de Trabajadores del Estado (STSGECH)
              </h3>
              <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
                Créditos con condiciones preferenciales para trabajadores sindicalizados del Gobierno del Estado, con apoyo de <strong>delegados del sindicato en cada municipio (promotores municipales pertenecientes al sindicato)</strong>.
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-300 font-semibold">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#4CD360] shrink-0" />
                <span>Atención en Depto. de Prestaciones Económicas (Salón Pinos Altos)</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#4CD360] shrink-0" />
                <span>Red de delegados sindicales municipales en el estado</span>
              </div>
            </div>
          </div>

          {/* Card 3: Agrupación de Jubilados y Pensionados */}
          <div className="bg-white dark:bg-slate-900/60 glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between border border-slate-200 dark:border-white/10 border-l-4 border-l-amber-500 shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-700 dark:text-[#D4AF37] mb-4">
                <HeartHandshake className="w-6 h-6" />
              </div>
              <span className="text-xs uppercase tracking-wider font-bold text-amber-700 dark:text-[#D4AF37] block mb-1">
                Convenio Exclusivo de Retiro
              </span>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3">
                Agrupación de los Jubilados y Pensionados
              </h3>
              <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
                Esquema especializado para miembros de la <strong>Agrupación de los Jubilados y Pensionados al Servicio de Gobierno del Estado de Chihuahua</strong>, con tabla de cuotas preferencial exenta del cobro de seguro de vida.
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-300 font-semibold">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#4CD360] shrink-0" />
                <span>Crédito Normal Quincenal hasta $150,000 MXN sin prima de seguro</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#0F766E] dark:text-[#4CD360] shrink-0" />
                <span>Protección patrimonial bajo el tope del 30% (Art. 110 LFT)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Matrix of Sinergia Operativa */}
        <div className="bg-white dark:bg-slate-900/60 glass-panel rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-white/10 shadow-xl">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200 dark:border-white/10">
            <ArrowRightLeft className="w-6 h-6 text-[#0F766E] dark:text-[#249E82]" />
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Matriz de Sinergia Operativa
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Cruse asume el 100% de la carga de cálculo, validación normativa y preparación de formatos para facilitar la operación institucional.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm">
            {/* Gestión Cruse */}
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-wider text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-[#249E82]" />
                Gestión Operativa Cruse (Nosotros)
              </h4>
              <ul className="space-y-3 text-slate-700 dark:text-slate-300">
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10">
                  <strong className="text-slate-900 dark:text-white">Gestión Omnicanal:</strong> Simulación financiera exacta, validación del límite legal del 30% (Art. 110 LFT) y orientación multicanal.
                </li>
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10">
                  <strong className="text-slate-900 dark:text-white">Recolección de Firmas en Sedes Oficiales:</strong> Suscripción de Formatos Cruse y Autorización de Descuento en el Salón Pinos Altos (sindicalizados) o en Oficinas Cruse Vía Citadela (confianza).
                </li>
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10">
                  <strong className="text-slate-900 dark:text-white">Dispersión SPEI Post-Firma y Conciliación:</strong> Transferencia electrónica posterior a la firma de documentos Cruse y cruce automatizado de listados de retención.
                </li>
              </ul>
            </div>

            {/* Facilitación Institucional */}
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-wider text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-[#396CAE]" />
                Facilitación Institucional (Dependencia y Sindicato)
              </h4>
              <ul className="space-y-3 text-slate-700 dark:text-slate-300">
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                  <span>Habilitar atención en sedes sindicales (Salón Pinos Altos y delegados sindicales municipales) para recabar firmas</span>
                  <Check className="w-5 h-5 text-[#0F766E] dark:text-[#4CD360] shrink-0" />
                </li>
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                  <span>Validar la Autorización de Descuento de su Dependencia conforme al tope legal del 30%</span>
                  <Check className="w-5 h-5 text-[#0F766E] dark:text-[#4CD360] shrink-0" />
                </li>
                <li className="p-3 glass-card rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                  <span>Ejecutar la retención periódica vía nómina y enterar el consolidado institucional</span>
                  <Check className="w-5 h-5 text-[#0F766E] dark:text-[#4CD360] shrink-0" />
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
