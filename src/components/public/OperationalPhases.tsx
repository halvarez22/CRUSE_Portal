import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, FileCheck, CheckCheck, Clock, ShieldCheck, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { COMPANY_INFO } from '../../data/cruseData';

interface OperationalPhaseItem {
  step: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  badge: string;
  slaText: string;
  checklist: string[];
  targetSectionId: string;
  actionLabel: string;
}

export const OperationalPhases: React.FC = () => {
  const [selectedPhase, setSelectedPhase] = useState<OperationalPhaseItem | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const phases: OperationalPhaseItem[] = [
    {
      step: '01',
      title: 'Promoción y Atención Omnicanal',
      subtitle: 'Orientación directa y multicanal',
      description:
        'Atención personalizada entre Microfinanciera Cruse, los delegados sindicales municipales y el trabajador. Canales activos vía WhatsApp, llamadas telefónicas, sede sindical en Salón Pinos Altos y oficinas en Vía Citadela.',
      icon: Smartphone,
      accentColor: 'from-[#249E82] to-[#4CD360]',
      badge: 'Fase 1',
      slaText: 'Tiempo estimado: Orientación inmediata (< 5 minutos)',
      checklist: [
        'Asesoría sin costo en sede sindical (Salón Pinos Altos), delegados sindicales municipales u oficinas Cruse.',
        'Validación de capacidad de descuento vía nómina bajo el límite legal del 30% (Art. 110 LFT).',
        'Orientación transparente entre Crédito Normal (47.50% anual nominal) y Crédito Express (80.00% anual nominal).',
      ],
      targetSectionId: 'simulador',
      actionLabel: 'Ir al Simulador Oficial',
    },
    {
      step: '02',
      title: 'Simulación y Expediente Simplificado',
      subtitle: 'Revisión documental normativa',
      description:
        'El trabajador presenta su último recibo de nómina, elige el monto y plazo conforme a las tablas oficiales de cuotas y reúne sus documentos básicos sin requerir aval.',
      icon: FileCheck,
      accentColor: 'from-[#396CAE] to-[#00D1FF]',
      badge: 'Fase 2',
      slaText: 'Tiempo estimado: Validación documental en 15 a 30 minutos',
      checklist: [
        '2 copias de Identificación Oficial vigente (INE por ambos lados o Pasaporte).',
        '1 copia del último recibo de nómina gubernamental, judicial o de pensión.',
        '1 copia de comprobante de domicilio reciente (exclusivo para Crédito Normal).',
      ],
      targetSectionId: 'requisitos',
      actionLabel: 'Revisar Requisitos Documentales',
    },
    {
      step: '03',
      title: 'Firma de Formatos Cruse y Dispersión SPEI',
      subtitle: 'Suscripción en sede correspondiente y transferencia',
      description:
        'El trabajador acude a su sede correspondiente (Salón Pinos Altos para sindicalizados o Vía Citadela #5710 Int. #401 para personal de confianza del Supremo Tribunal) para firmar los Formatos Cruse y la Autorización de Descuento de su Dependencia. Una vez firmados los documentos, se ejecuta la dispersión vía SPEI.',
      icon: CheckCheck,
      accentColor: 'from-purple-500 to-[#249E82]',
      badge: 'Fase 3',
      slaText: 'Tiempo estimado: Dispersión SPEI posterior a la firma de documentos Cruse',
      checklist: [
        `Sindicalizados: Firma en Depto. de Prestaciones Económicas, ${COMPANY_INFO.unionOfficeContact.venueName} (${COMPANY_INFO.unionOfficeContact.address}).`,
        `Confianza Supremo Tribunal: Firma en Oficinas Cruse (${COMPANY_INFO.address}).`,
        'Transferencia electrónica vía SPEI una vez suscritos los Formatos Cruse y la Autorización de Descuento.',
      ],
      targetSectionId: 'asistente-ia',
      actionLabel: 'Consultar con Asistente IA 24/7',
    },
  ];

  useEffect(() => {
    if (!selectedPhase) return;
    const timer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedPhase(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPhase]);

  const handleNavigateSection = (sectionId: string) => {
    setSelectedPhase(null);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section id="fases" className="py-12 lg:py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-[#396CAE]/15 text-[#1E3A8A] dark:text-[#00D1FF] border border-[#396CAE]/30 mb-3">
            <Clock className="w-3.5 h-3.5" />
            <span>Flujo Operativo de Atención</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-3">
            Proceso Transparente en 3 Etapas
          </h2>
          <p className="text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
            Desde la simulación financiera y validación del límite legal del 30% hasta la firma presencial de tus Formatos Cruse y dispersión por SPEI.
          </p>
        </div>

        {/* 3 Step Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {phases.map((phase) => {
            const IconComponent = phase.icon;
            return (
              <div
                key={phase.step}
                className="bg-white dark:bg-slate-900/60 glass-panel rounded-3xl p-6 sm:p-8 h-full flex flex-col justify-between relative group border border-slate-200 dark:border-white/10 hover:border-[#249E82]/50 transition-all shadow-lg"
              >
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-3xl font-black font-mono text-slate-400 dark:text-slate-700">
                      {phase.step}
                    </span>
                    <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-[#249E82]/15 text-[#0F766E] dark:text-[#4CD360] border border-[#249E82]/30">
                      {phase.badge}
                    </span>
                  </div>

                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#041734] to-[#396CAE] dark:from-[#396CAE] dark:to-[#249E82] text-white flex items-center justify-center shadow-md mb-4">
                    <IconComponent className="w-6 h-6" />
                  </div>

                  <h3 className="text-xl font-black text-slate-900 dark:text-white mb-1">
                    {phase.title}
                  </h3>
                  <span className="text-xs font-semibold text-[#0F766E] dark:text-[#00D1FF] block mb-3">
                    {phase.subtitle}
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
                    {phase.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPhase(phase)}
                  className="w-full pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-xs font-bold text-[#0F766E] dark:text-[#4CD360] hover:text-slate-950 dark:hover:text-white transition-colors text-left focus:outline-none"
                >
                  <span>Trámite asistido y transparente (Ver detalle)</span>
                  <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform shrink-0" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Phase Detail Modal */}
        {selectedPhase && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
            onClick={() => setSelectedPhase(null)}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="phase-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900/80 glass-panel w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-[#249E82]/40 relative"
            >
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setSelectedPhase(null)}
                aria-label="Cerrar detalle de fase operativa"
                className="absolute top-4 right-4 p-2 rounded-xl glass-card text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-[#249E82]/15 text-[#0F766E] dark:text-[#4CD360] border border-[#249E82]/30 mb-3">
                {selectedPhase.badge} — Etapa {selectedPhase.step}
              </span>
              <h3 id="phase-modal-title" className="text-xl font-black text-slate-900 dark:text-white mb-1">
                {selectedPhase.title}
              </h3>
              <p className="text-xs font-semibold text-[#1E3A8A] dark:text-[#00D1FF] mb-4">
                {selectedPhase.slaText}
              </p>

              <div className="space-y-2.5 mb-5">
                {selectedPhase.checklist.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-800 dark:text-slate-200 glass-card p-3 rounded-xl border border-slate-200 dark:border-white/10">
                    <CheckCircle2 className="w-4 h-4 text-[#0F766E] dark:text-[#249E82] shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 mb-6">
                <ShieldCheck className="w-4 h-4 text-[#0F766E] dark:text-[#249E82] shrink-0" />
                <span>Protección de datos garantizada conforme a la LFPDPPP y lineamientos SOFOM E.N.R.</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPhase(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl glass-card text-xs font-bold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateSection(selectedPhase.targetSectionId)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#249E82] to-[#1E9F81] text-white font-black text-xs shadow-lg flex items-center justify-center gap-1.5"
                >
                  <span>{selectedPhase.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
