/**
 * CONTENEDOR PURO DE NAVEGACIÓN DE LOS 5 MÓDULOS DE VALOR EJECUTIVO Y COMERCIAL (BLOQUES B Y C)
 * Expediente: CRUSE-APO-2026-029 — Guardrail Forense 1 (< 600 líneas; actúa exclusivamente como layout de Tabs)
 */

import React, { useState } from 'react';
import {
  Presentation,
  TrendingUp,
  Calculator,
  BarChart3,
  MapPin,
  Bot,
} from 'lucide-react';
import { AuthSession } from '../../types';
import { ExecutiveTabId } from '../../types/executive';
import { PitchDeckTab } from './PitchDeckTab';
import { PortfolioRoiSimulatorTab } from './PortfolioRoiSimulatorTab';
import { CreditScoringApproverTab } from './CreditScoringApproverTab';
import { CompetitorMatrixTab } from './CompetitorMatrixTab';
import { NationalHubsAndManualTab } from './NationalHubsAndManualTab';

interface ExecutiveSuiteViewProps {
  session: AuthSession;
  onOpenInternalAi: () => void;
}

const EXECUTIVE_TABS: ReadonlyArray<{
  id: ExecutiveTabId;
  label: string;
  badge: string;
}> = [
  { id: 'pitch-deck', label: '1. Pitch Inversionistas (10 Slides)', badge: 'B.1' },
  { id: 'roi-simulator', label: '2. Simulador ROI Cartera (36m)', badge: 'B.2' },
  { id: 'credit-scoring', label: '3. Simulador & Scoring Aprobador', badge: 'B.3' },
  { id: 'competitor-matrix', label: '4. Pizarra de Competencia', badge: 'B.5' },
  { id: 'national-hubs', label: '5. Los 3 Hubs & Manual Operativo', badge: 'C.7 / A.6' },
];

export const ExecutiveSuiteView: React.FC<ExecutiveSuiteViewProps> = ({
  session,
  onOpenInternalAi,
}) => {
  const [activeTab, setActiveTab] = useState<ExecutiveTabId>('pitch-deck');

  const canEditCompetitors =
    session.user.role === 'admin' || session.user.role === 'oficial_cumplimiento';

  return (
    <div className="space-y-6">
      {/* Barra Superior de Sub-Módulos de Valor de Negocio */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {EXECUTIVE_TABS.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-gradient-to-r from-[#249E82] to-[#396CAE] text-white shadow-lg'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {t.id === 'pitch-deck' && <Presentation className="w-3.5 h-3.5" />}
                {t.id === 'roi-simulator' && <TrendingUp className="w-3.5 h-3.5" />}
                {t.id === 'credit-scoring' && <Calculator className="w-3.5 h-3.5" />}
                {t.id === 'competitor-matrix' && <BarChart3 className="w-3.5 h-3.5" />}
                {t.id === 'national-hubs' && <MapPin className="w-3.5 h-3.5" />}
                <span>{t.label}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/30 text-[10px] font-mono">
                  {t.badge}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={onOpenInternalAi}
          className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-[#D4AF37]/50 text-[#D4AF37] text-xs font-extrabold flex items-center gap-2 transition-all"
        >
          <Bot className="w-4 h-4" />
          <span>Asistente IA Interno 24/7 (B.4)</span>
        </button>
      </div>

      {/* Renderizado Modular de la Pestaña Seleccionada */}
      {activeTab === 'pitch-deck' && <PitchDeckTab onSelectTab={setActiveTab} />}
      {activeTab === 'roi-simulator' && <PortfolioRoiSimulatorTab token={session.token} />}
      {activeTab === 'credit-scoring' && <CreditScoringApproverTab token={session.token} />}
      {activeTab === 'competitor-matrix' && (
        <CompetitorMatrixTab token={session.token} canEdit={canEditCompetitors} />
      )}
      {activeTab === 'national-hubs' && <NationalHubsAndManualTab />}
    </div>
  );
};
