/**
 * BANNER Y MANUAL INTERACTIVO EN LENGUAJE CLARO (SIN TECNICISMOS)
 * Expediente: CRUSE-APO-2026-067 (Hallazgos A.1–A.6, D.1, D.7 + Guardrail Forense 8)
 *
 * Catálogo extraído a `src/data/moduleGuidesCatalog.ts` (< 360 líneas).
 * Incluye descarga limpia en PDF de la Guía Operativa y de la Cédula de Pruebas Paralelas UAT.
 */

import React, { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Sparkles,
  X,
  FileDown,
  ClipboardCheck,
} from 'lucide-react';
import {
  AdminTabId,
  FriendlyGuideModuleId,
  MODULE_FRIENDLY_GUIDES,
  MODULE_GUIDES,
  ModuleFriendlyGuide,
  ORDERED_MODULE_GUIDES,
} from '../../data/moduleGuidesCatalog';
import {
  downloadCleanFriendlyManualPdf,
  downloadParallelUatCertificatePdf,
} from '../../services/reports/uatParallelCertificatePdf';

export type { AdminTabId, FriendlyGuideModuleId, ModuleFriendlyGuide };
export { MODULE_FRIENDLY_GUIDES };

interface ModuleFriendlyGuideBannerProps {
  activeTab?: AdminTabId;
  moduleId?: FriendlyGuideModuleId;
  isManualModalOpen?: boolean;
  onOpenManualModal?: () => void;
  onCloseManualModal?: () => void;
}

export const ModuleFriendlyGuideBanner: React.FC<ModuleFriendlyGuideBannerProps> = ({
  activeTab,
  moduleId,
  isManualModalOpen,
  onOpenManualModal,
  onCloseManualModal,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [internalModalOpen, setInternalModalOpen] = useState(false);

  const resolvedId = activeTab ?? moduleId ?? 'dashboard';
  const showFullManual = isManualModalOpen !== undefined ? isManualModalOpen : internalModalOpen;
  const openManual = () => {
    if (onOpenManualModal) onOpenManualModal();
    else setInternalModalOpen(true);
  };
  const closeManual = () => {
    if (onCloseManualModal) onCloseManualModal();
    else setInternalModalOpen(false);
  };

  const guide = MODULE_GUIDES[resolvedId];
  const totalModules = ORDERED_MODULE_GUIDES.length;
  if (!guide) return null;

  return (
    <>
      <div className="mb-5 rounded-2xl border border-cyan-500/25 bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-cyan-950/35 px-4 py-3.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-300">
                  Guía Operativa en Lenguaje Claro
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  {guide.phaseBadge}
                </span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  · {guide.title}
                </span>
              </div>
              <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
                {guide.plainSummary}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              <span>{expanded ? 'Ocultar pasos' : '¿Cómo usar este módulo?'}</span>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={openManual}
              className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-300" />
              <span>Ver Guía ({totalModules} Módulos)</span>
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3.5 pt-3.5 border-t border-slate-800/90 grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
            <div className="lg:col-span-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="font-bold text-white">Pasos rápidos para operar este módulo:</div>
              <ul className="space-y-1.5 text-slate-300">
                {guide.steps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="font-bold text-amber-300 mb-1">Qué trabajo manual elimina:</div>
                <p className="text-slate-300 leading-relaxed">{guide.whatItReplaces}</p>
              </div>
              <div className="pt-2 border-t border-slate-800">
                <div className="font-bold text-emerald-300 mb-1 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Tip de validación práctica:</span>
                </div>
                <p className="text-slate-300 leading-relaxed">{guide.verifyTip}</p>
                <p className="text-[10px] text-slate-400 mt-2 font-semibold">
                  Referencia Contractual ({guide.phaseBadge}): {guide.contractRef}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {showFullManual && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[88vh] flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-white">
                  Guía Operativa del Portal Cruse — {totalModules} Módulos (Fases 1, 2 y 3)
                </h2>
                <p className="text-xs text-slate-400">
                  Explicación en lenguaje cotidiano para Dirección, Mesa de Control, Tesorería, Cumplimiento y Promotores.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadCleanFriendlyManualPdf()}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Descargar Guía PDF Limpia</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadParallelUatCertificatePdf()}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  <span>Cédula Pruebas Paralelas UAT (PDF)</span>
                </button>
                <button
                  type="button"
                  onClick={closeManual}
                  aria-label="Cerrar ventana"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {ORDERED_MODULE_GUIDES.map((item, idx) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-slate-950/75 border border-slate-800 p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-extrabold text-cyan-300">{item.title}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                        {item.phaseBadge}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        Módulo {idx + 1} de {totalModules}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">{item.plainSummary}</p>
                  <p className="text-[11px] text-amber-300/90">
                    <strong>Qué sustituye:</strong> {item.whatItReplaces}
                  </p>
                  <ul className="space-y-1 text-xs text-slate-300 pl-4 list-disc">
                    {item.steps.map((s, sIdx) => (
                      <li key={sIdx}>{s}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-emerald-300/90">
                    <strong>Prueba sugerida:</strong> {item.verifyTip}
                  </p>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Referencia Contractual ({item.phaseBadge}): {item.contractRef}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
