/**
 * MÓDULO B.1: PITCH INVERSIONISTAS (DECK INSTITUCIONAL DE 10 SLIDES INTERACTIVOS)
 * Expediente: CRUSE-APO-2026-029 — Guardrail Forense 1 (< 400 líneas)
 */

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Info,
  CheckCircle2,
  Sparkles,
  Award,
  TrendingUp,
} from 'lucide-react';
import { PITCH_SLIDES_DATA } from '../../data/cruseExecutiveData';
import { ExecutiveTabId } from '../../types/executive';

interface PitchDeckTabProps {
  onSelectTab: (tab: ExecutiveTabId) => void;
}

export const PitchDeckTab: React.FC<PitchDeckTabProps> = ({ onSelectTab }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showNotes, setShowNotes] = useState(true);

  const totalSlides = PITCH_SLIDES_DATA.length;
  const slide = PITCH_SLIDES_DATA[currentIdx]!;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setCurrentIdx((p) => (p < totalSlides - 1 ? p + 1 : p));
      } else if (e.key === 'ArrowLeft') {
        setCurrentIdx((p) => (p > 0 ? p - 1 : p));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [totalSlides]);

  return (
    <div className="space-y-6">
      {/* Barra de Control Superior del Deck */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-xl bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 font-extrabold text-xs">
            Diapositiva {slide.id} de {totalSlides}
          </span>
          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
            {slide.category}
          </span>
        </div>

        {/* Selector rápido 1..10 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {PITCH_SLIDES_DATA.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setCurrentIdx(idx)}
              title={`${s.id}. ${s.title}`}
              className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                idx === currentIdx
                  ? 'bg-[#249E82] text-white ring-2 ring-[#00D1FF]/50 scale-105'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {s.id}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowNotes((v) => !v)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
            showNotes
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}
        >
          <Info className="w-3.5 h-3.5" />
          <span>Guía de Presentación</span>
        </button>
      </div>

      {/* Lienzo Principal del Slide */}
      <div className="bg-gradient-to-br from-slate-900 via-[#0D1B3E]/70 to-slate-950 border border-slate-800 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-[#D4AF37]" />
          <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
            Presentación Institucional · Microfinanciera Cruse SOFOM E.N.R.
          </span>
        </div>

        <h2 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
          {slide.title}
        </h2>
        <p className="text-sm md:text-base text-slate-300 mt-2 font-medium">{slide.subtitle}</p>

        {/* Tarjetas de Métricas Clave del Slide */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          {slide.metrics.map((m, i) => (
            <div
              key={i}
              className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 flex flex-col justify-between"
            >
              <span className="text-[11px] font-bold uppercase text-slate-400">{m.label}</span>
              <span
                className={`text-2xl font-black mt-1 ${
                  m.accent === 'emerald'
                    ? 'text-emerald-400'
                    : m.accent === 'cyan'
                      ? 'text-[#00D1FF]'
                      : 'text-[#D4AF37]'
                }`}
              >
                {m.value}
              </span>
            </div>
          ))}
        </div>

        {/* Puntos Ejecutivos Clave */}
        <div className="mt-6 space-y-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#D4AF37]" />
            <span>Puntos Clave de Valor Institucional</span>
          </h3>
          <ul className="space-y-2.5 text-sm text-slate-200">
            {slide.highlights.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Notas del Presentador */}
        {showNotes && (
          <div className="mt-5 p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200">
            <strong className="text-amber-300 block mb-1">
              💡 Nota Estratégica para Dirección / Comité de Inversión:
            </strong>
            {slide.investorNotes}
          </div>
        )}

        {/* Controles Anterior / Siguiente + Atajos Directos */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentIdx((p) => (p > 0 ? p - 1 : p))}
              disabled={currentIdx === 0}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>
            <button
              onClick={() => setCurrentIdx((p) => (p < totalSlides - 1 ? p + 1 : p))}
              disabled={currentIdx === totalSlides - 1}
              className="px-4 py-2 rounded-xl bg-[#249E82] hover:bg-[#1e856e] disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1.5"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onSelectTab('roi-simulator')}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Abrir Simulador ROI 36 Meses</span>
            </button>
            <button
              onClick={() => onSelectTab('credit-scoring')}
              className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold"
            >
              Evaluador de Scoring
            </button>
            <button
              onClick={() => onSelectTab('national-hubs')}
              className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold"
            >
              Ver 3 Hubs Nacionales
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
