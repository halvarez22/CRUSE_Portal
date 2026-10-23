/**
 * MÓDULOS C.7 Y A.6: MAPA DE LOS 3 HUBS NACIONALES (CHIHUAHUA, LEÓN, CANCÚN) Y MANUAL OPERATIVO
 * Expediente: CRUSE-APO-2026-029 — Guardrail Forense 1 (< 400 líneas)
 */

import React, { useState } from 'react';
import {
  MapPin,
  CheckCircle2,
  FileText,
  Zap,
  Clock,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import {
  EXPANSION_HUBS_DATA,
  OPERATIONS_MANUAL_STEPS,
} from '../../data/cruseExecutiveData';
import { ExpansionHubItem } from '../../types/executive';

export const NationalHubsAndManualTab: React.FC = () => {
  const [selectedHub, setSelectedHub] = useState<ExpansionHubItem>(EXPANSION_HUBS_DATA[0]!);
  const [selectedStepId, setSelectedStepId] = useState<number>(1);

  const selectedStep =
    OPERATIONS_MANUAL_STEPS.find((s) => s.id === selectedStepId) || OPERATIONS_MANUAL_STEPS[0]!;

  return (
    <div className="space-y-8">
      {/* SECCIÓN 1: LOS 3 HUBS NACIONALES (CHIHUAHUA, LEÓN Y CANCÚN) */}
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-slate-900 via-[#0D1B3E]/80 to-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 text-[#00D1FF] border border-cyan-500/30 text-xs font-bold mb-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>Visión Ejecutiva (Punto C.7) · Expansión Multi-Región</span>
            </span>
            <h3 className="text-xl font-extrabold text-white">
              Mapa de los 3 Hubs Nacionales: Chihuahua, León y Cancún
            </h3>
            <p className="text-xs text-slate-400">
              Operación centralizada en la nube para controlar convenios, promotores y cobranza en las 3 regiones estratégicas.
            </p>
          </div>
          <span className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-extrabold">
            Meta Consolidada: $400M+ MXN
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Mapa Interactivo de la República Mexicana */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
            <div className="relative w-full h-64 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden">
              <div className="text-center opacity-20 select-none pointer-events-none">
                <div className="text-4xl font-black text-slate-600 tracking-widest">MÉXICO</div>
                <div className="text-xs text-slate-500 font-bold">3 HUBS NACIONALES DE COLOCACIÓN</div>
              </div>

              {EXPANSION_HUBS_DATA.map((hub) => {
                const isSelected = selectedHub.id === hub.id;
                return (
                  <button
                    key={hub.id}
                    onClick={() => setSelectedHub(hub)}
                    style={{ left: `${hub.coordinates.x}%`, top: `${hub.coordinates.y}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all ${
                      isSelected ? 'scale-110 z-20' : 'hover:scale-105 z-10'
                    }`}
                  >
                    <div className="relative flex items-center justify-center">
                      {hub.status === 'active' && (
                        <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-emerald-400 opacity-40" />
                      )}
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-lg ${
                          hub.hubCode === 'CHIHUAHUA'
                            ? 'bg-emerald-600 border-emerald-400 text-white'
                            : hub.hubCode === 'LEON'
                              ? 'bg-[#396CAE] border-cyan-400 text-white'
                              : 'bg-amber-600 border-amber-300 text-white'
                        } ${isSelected ? 'ring-4 ring-white/30' : ''}`}
                      >
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="absolute top-11 whitespace-nowrap bg-slate-900/95 border border-slate-700 px-2.5 py-0.5 rounded-lg text-[11px] font-bold text-white shadow">
                        {hub.region}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-4">
              {EXPANSION_HUBS_DATA.map((hub) => (
                <button
                  key={hub.id}
                  onClick={() => setSelectedHub(hub)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    selectedHub.id === hub.id
                      ? 'bg-[#249E82] text-white border-teal-400'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {hub.region}
                </button>
              ))}
            </div>
          </div>

          {/* Detalle del Hub Seleccionado */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Código Hub: {selectedHub.hubCode}
                </span>
                <span className="text-xs text-slate-400 font-semibold">{selectedHub.launchMonth}</span>
              </div>

              <h4 className="text-lg font-extrabold text-white">{selectedHub.name}</h4>
              <p className="text-xs text-slate-300 leading-relaxed">{selectedHub.description}</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Mercado Objetivo</span>
                  <strong className="text-base font-black text-[#00D1FF]">
                    {selectedHub.targetEmployees.toLocaleString('es-MX')} empleados
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Cartera Meta</span>
                  <strong className="text-base font-black text-emerald-400">
                    ${selectedHub.projectedPortfolioMillions}M MXN
                  </strong>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <span className="text-xs font-bold text-slate-200 block">Convenios e Instituciones Clave:</span>
                <ul className="space-y-1 text-xs text-slate-300">
                  {selectedHub.targetAgreements.map((ag, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{ag}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: MANUAL OPERATIVO INSTITUCIONAL INTERACTIVO (6 ETAPAS — PUNTO A.6) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <span className="text-xs font-bold text-[#D4AF37] uppercase flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span>Manual Operativo Institucional (Bloque A.6)</span>
            </span>
            <h3 className="text-lg font-extrabold text-white mt-0.5">
              Flujo Operativo End-to-End en 6 Etapas (De Papel/Excel a Core Digital + IA)
            </h3>
          </div>
          <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
            <Zap className="w-4 h-4" /> 10x Reducción en Tiempos Operativos
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
          {OPERATIONS_MANUAL_STEPS.map((step) => {
            const active = step.id === selectedStepId;
            return (
              <button
                key={step.id}
                onClick={() => setSelectedStepId(step.id)}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  active
                    ? 'bg-gradient-to-br from-[#249E82] to-[#396CAE] text-white border-teal-400 shadow-lg'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-white/20 text-white text-[11px] font-bold flex items-center justify-center">
                    {step.id}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
                <div className="text-xs font-bold leading-snug">{step.title}</div>
                <div className="text-[10px] opacity-85 mt-1">SLA: {step.slaAfter}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-1.5">
            <div className="text-xs font-bold text-rose-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Proceso Anterior (Manual / Excel)
              </span>
              <span>{selectedStep.slaBefore}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{selectedStep.manualProcess}</p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-950/25 border border-emerald-500/30 space-y-1.5">
            <div className="text-xs font-bold text-emerald-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Proceso Actual en Portal Cruse
              </span>
              <span>{selectedStep.slaAfter}</span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">{selectedStep.digitalProcess}</p>
          </div>

          <div className="p-4 rounded-xl bg-cyan-950/25 border border-cyan-500/30 space-y-1.5">
            <div className="text-xs font-bold text-[#00D1FF] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" /> Blindaje & IA
              </span>
              <span className="text-[10px] text-slate-300">{selectedStep.responsibleRole}</span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">{selectedStep.aiEnhancement}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
