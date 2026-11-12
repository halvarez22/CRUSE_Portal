import React from 'react';
import { CheckCircle2, AlertTriangle, Printer, X, QrCode } from 'lucide-react';
import { HOMOLOGATED_10K_COMPARISON_DATA } from '../../data/cruseExecutiveData';
import { COMPANY_INFO } from '../../data/cruseData';

interface PromotionalBrochureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VALUE_PILLARS = [
  { title: '0% Comisión de Apertura', desc: 'Sin recortes iniciales. Recibes el 100% íntegro de tu préstamo vía SPEI.' },
  { title: '47.50% Tasa Anual Fija', desc: 'Equivalente a 1.9792% quincenal fija sin IVA. Sabes con exactitud cuánto pagarás.' },
  { title: 'Sin Aval Requerido', desc: 'Proceso simplificado con descuento automático directo y seguro de vida vía nómina.' },
  { title: 'Sin Freno por Buró', desc: 'Evaluamos tu estabilidad laboral e ingresos reales, no penalizamos tu historial.' },
];

const PROCESS_STEPS = [
  { step: '1', title: 'Atención y Simulación', desc: 'Omnicanal (WhatsApp o en nuestras sedes). Solo requerimos tu último recibo de nómina para perfilarte.' },
  { step: '2', title: 'Firma de Formatos', desc: 'Acude a Salón Pinos Altos (sindicalizados) o Vía Citadela #5710 Int. 401 (personal de confianza) para formalizar.' },
  { step: '3', title: 'Dispersión Inmediata', desc: 'Depósito vía SPEI una vez firmados los formatos. Protegemos tu salario respetando siempre el límite legal del 30% (Art. 110 LFT).' },
];

export const PromotionalBrochureModal: React.FC<PromotionalBrochureModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      {/* Guardrail 2 (CRUSE-APO-2026-058): Aislamiento estricto @media print para Folleto Carta/A4 de 2 Páginas */}
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 10mm; }
          body * { visibility: hidden !important; }
          .no-print, header, nav, aside, footer { display: none !important; }
          #cruse-promotional-brochure-print-root,
          #cruse-promotional-brochure-print-root * { visibility: visible !important; }
          #cruse-promotional-brochure-print-root {
            position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important;
            max-height: none !important; overflow: visible !important; display: block !important;
            background: #ffffff !important; color: #0f172a !important; box-shadow: none !important;
          }
          .brochure-page-break { page-break-after: always !important; break-after: page !important; }
        }
      `}</style>

      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="no-print px-6 py-3.5 bg-[#0D1B3E] border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm md:text-base font-extrabold text-white">
              Folleto Promocional Oficial (2 Páginas Tamaño Carta / PDF)
            </h3>
            <p className="text-xs text-slate-300">
              Maquetación calibrada para impresión o guardado directo en PDF desde el navegador.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Guardar como PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              <span>Cerrar</span>
            </button>
          </div>
        </div>

        <div id="cruse-promotional-brochure-print-root" className="overflow-y-auto p-6 md:p-8 bg-white text-slate-900 space-y-8">
          {/* ================= PÁGINA 1 ================= */}
          <div className="brochure-page-break space-y-5">
            <div className="rounded-2xl bg-[#0D1B3E] text-white p-6 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-extrabold text-sm">Microfinanciera Cruse</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 uppercase">
                  Convenio Oficial
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black leading-tight">
                Tu Crédito de Nómina Institucional: Directo, Transparente y Seguro.
              </h1>
              <p className="text-xs text-slate-300">
                Diseñado en exclusiva para personal del Gobierno del Estado de Chihuahua, Supremo Tribunal de Justicia y Agrupación de Jubilados y Pensionados.
              </p>
            </div>

            <div className="rounded-xl bg-emerald-600 text-white py-3 px-4 text-center font-extrabold text-sm shadow">
              En Cruse, $10,000 solicitados son $10,000 depositados en tu cuenta.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {VALUE_PILLARS.map((pillar) => (
                <div key={pillar.title} className="p-3.5 rounded-xl border-l-4 border-emerald-500 bg-slate-50 border border-slate-200">
                  <strong className="text-slate-900 block text-sm">{pillar.title}</strong>
                  <span className="text-slate-600">{pillar.desc}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h2 className="text-base font-black text-slate-900">Comparativa de Transparencia y Desembolso Real</h2>
              <p className="text-xs text-slate-600 font-semibold">Muestra homologada: Crédito de $10,000 MXN a 24 Quincenas</p>

              <div className="space-y-2.5 pt-1">
                {HOMOLOGATED_10K_COMPARISON_DATA.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs ${
                      item.isCruse ? 'bg-emerald-50/90 border-2 border-emerald-500' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="md:col-span-3">
                      <div className={`font-extrabold text-sm ${item.isCruse ? 'text-emerald-800' : 'text-slate-900'}`}>
                        {item.institution}
                      </div>
                      <div className="text-[11px] text-slate-600">{item.productLabel}</div>
                      {item.badgeText && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                          Opción Recomendada
                        </span>
                      )}
                    </div>

                    <div className="md:col-span-4 space-y-1">
                      <div className={`font-bold ${item.isCruse ? 'text-emerald-700' : 'text-slate-800'}`}>{item.netDisbursedText}</div>
                      <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden flex">
                        <div className={item.isCruse ? 'bg-emerald-600 h-full' : 'bg-slate-500 h-full'} style={{ width: `${item.netPercent}%` }} />
                        {item.withheldPercent > 0 && <div className="bg-rose-500 h-full" style={{ width: `${item.withheldPercent}%` }} />}
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="font-semibold text-slate-600">{item.netPercent}% neto</span>
                        <span className={item.isCruse ? 'text-emerald-700 font-bold' : 'text-rose-600 font-semibold'}>{item.withheldDetail}</span>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <div className={`text-sm font-black ${item.isCruse ? 'text-emerald-700' : 'text-slate-900'}`}>{item.fortnightlyPaymentText}</div>
                      <div className="text-[11px] text-slate-700">{item.totalPaymentText}</div>
                      <div className="text-[10px] text-slate-500">{item.rateLabel}</div>
                    </div>

                    <div className="md:col-span-3 space-y-1">
                      {item.frictionBullets.map((b, i) => (
                        <div key={i} className="flex items-start gap-1 text-[11px]">
                          {item.isCruse ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                          )}
                          <span className={item.isCruse ? 'text-slate-800 font-semibold' : 'text-slate-700'}>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-between text-[11px] text-slate-500">
              <span>{COMPANY_INFO.name} — Crédito de Nómina Institucional</span>
              <span>Página 1 de 2</span>
            </div>
          </div>

          {/* ================= PÁGINA 2 ================= */}
          <div className="space-y-6 pt-4">
            <h2 className="text-lg font-black text-slate-900 border-b border-slate-200 pb-2">Tu Trámite en 3 Pasos Simples</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {PROCESS_STEPS.map((s) => (
                <div key={s.step} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <span className="w-7 h-7 rounded-lg bg-[#0D1B3E] text-white font-black flex items-center justify-center">{s.step}</span>
                  <strong className="text-sm text-slate-900 block">{s.title}</strong>
                  <p className="text-slate-600 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-[#0D1B3E] text-white p-5 flex flex-wrap items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-white text-slate-900 border-2 border-emerald-400 flex flex-col items-center justify-center p-2 shrink-0">
                <QrCode className="w-9 h-9 text-[#0D1B3E]" />
                <span className="text-[9px] font-extrabold text-center leading-tight mt-0.5">WhatsApp {COMPANY_INFO.promoterWhatsappDisplay}</span>
              </div>
              <div className="space-y-1 text-xs flex-1">
                <strong className="text-emerald-400 text-sm block">Inicia tu solicitud hoy mismo</strong>
                <p className="text-slate-200">
                  <strong>Atención Presencial:</strong> Vía Citadela #5710 Int. 401 (Personal de Confianza) | Módulo Salón Pinos Altos (Trabajadores Sindicalizados).
                </p>
                <p className="text-slate-400 text-[11px]">
                  {COMPANY_INFO.name} opera bajo estricto cumplimiento normativo y transparencia institucional. Sujeto a aprobación basada en capacidad de pago y políticas internas.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-between text-[11px] text-slate-500">
              <span>{COMPANY_INFO.name} — Crédito de Nómina Institucional</span>
              <span>Página 2 de 2</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
