import React from 'react';
import { Smartphone, FileCheck, CheckCheck, Clock, ShieldCheck, ArrowRight } from 'lucide-react';

export const OperationalPhases: React.FC = () => {
  const phases = [
    {
      step: '01',
      title: 'Promoción y Atención Omnicanal',
      subtitle: 'Contacto directo y multicanal',
      description:
        'Atención personalizada persona a persona entre Cruse, el delegado seccional y el empleado. Canales digitales activos vía WhatsApp, SMS, llamadas y visitas programadas en sedes sindicales.',
      icon: Smartphone,
      accentColor: 'from-[#249E82] to-[#4CD360]',
      badge: 'Fase 1',
    },
    {
      step: '02',
      title: 'Simulación y Expediente Simplificado',
      subtitle: 'Resolución ágil en nómina',
      description:
        'El trabajador envía su último recibo de nómina, simula su crédito y elige el plazo idóneo. Con solo 3 documentos, el análisis financiero se realiza en minutos sin alterar su jornada.',
      icon: FileCheck,
      accentColor: 'from-[#396CAE] to-[#00D1FF]',
      badge: 'Fase 2',
    },
    {
      step: '03',
      title: 'Formalización y Entrega Cero-Fricción',
      subtitle: 'Dispersión directa sin salir del trabajo',
      description:
        'El promotor acude directamente al centro de trabajo o formaliza vía digital para que el trabajador no abandone sus funciones. Firma de contrato, anexo de descuento y depósito SPEI inmediato.',
      icon: CheckCheck,
      accentColor: 'from-purple-500 to-[#249E82]',
      badge: 'Fase 3',
    },
  ];

  return (
    <section id="fases" className="py-12 lg:py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-[#396CAE]/15 text-[#396CAE] dark:text-[#00D1FF] border border-[#396CAE]/30 mb-3">
            <Clock className="w-3.5 h-3.5" />
            <span>Flujo Operativo de Atención</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-[#041734] dark:text-white mb-3">
            Un Modelo Diseñado para Evitar la Fricción
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
            Asumimos la carga operativa y tecnológica para que el trabajador y la institución mantengan su ritmo laboral normal.
          </p>
        </div>

        {/* 3 Step Cards Grid (Inspired by Slides 3, 4, 5) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {phases.map((phase) => {
            const IconComponent = phase.icon;
            return (
              <div key={phase.step} className="glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative group hover:border-[#249E82]/50 transition-all shadow-lg">
                
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-3xl font-black font-mono text-slate-300 dark:text-slate-700">
                      {phase.step}
                    </span>
                    <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-[#249E82]/15 text-[#059669] dark:text-[#4CD360] border border-[#249E82]/30">
                      {phase.badge}
                    </span>
                  </div>

                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#041734] to-[#396CAE] dark:from-[#396CAE] dark:to-[#249E82] text-white flex items-center justify-center shadow-md mb-4">
                    <IconComponent className="w-6 h-6" />
                  </div>

                  <h3 className="text-xl font-black text-[#041734] dark:text-white mb-1">
                    {phase.title}
                  </h3>
                  <span className="text-xs font-semibold text-[#059669] dark:text-[#00D1FF] block mb-3">
                    {phase.subtitle}
                  </span>
                  <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
                    {phase.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-[#249E82] transition-colors">
                  <span>Trámite asistido y transparente</span>
                  <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                </div>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
