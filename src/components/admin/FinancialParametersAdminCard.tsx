/**
 * PANEL ADMINISTRATIVO DE PARÁMETROS FINANCIEROS DINÁMICOS (EXCLUSIVO DIRECCIÓN / ADMIN)
 * Expediente: CRUSE-APO-2026-067 (Guardrails Forenses 7 y 8)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Sliders, Save, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { AuthSession } from '../../types';

interface FinancialParametersAdminCardProps {
  session: AuthSession;
}

interface FinancialParameterRow {
  paramKey: string;
  numericValue: string;
  description: string;
  updatedBy: string;
  updatedAt: string;
}

const FRIENDLY_LABELS: Readonly<Record<string, string>> = {
  LIFE_INSURANCE_FORTNIGHTLY_MXN: 'Seguro de Vida Quincenal (MXN)',
  LIFE_INSURANCE_MONTHLY_MXN: 'Seguro de Vida Mensual (MXN)',
  LIFE_INSURANCE_COVERAGE_MXN: 'Suma Asegurada de Póliza (MXN)',
  SPECIAL_CREDIT_MIN_MONTHLY_RATE: 'Tasa Mensual Mínima Crédito Especial (decimal)',
  SPECIAL_CREDIT_MAX_MONTHLY_RATE: 'Tasa Mensual Máxima Crédito Especial (decimal)',
  ISR_FINANCIAL_SYSTEM_RATE_2025: 'Tasa ISR Anual LIF 2025 sobre Capital (decimal)',
  ISR_FINANCIAL_SYSTEM_RATE_2026: 'Tasa ISR Anual LIF 2026 sobre Capital (decimal)',
  ISR_MUTUO_PF_INTEREST_RATE: 'Tasa ISR Mutuo PF sobre Interés (decimal)',
  SUSTAINED_PAYMENTS_REQUIRED_COUNT: 'Pagos Oportunos para Pago Sostenido CNBV',
  PLD_RETENTION_YEARS_MINIMUM: 'Retención Documental PLD/FT Mínima (años)',
};

export const FinancialParametersAdminCard: React.FC<FinancialParametersAdminCardProps> = ({ session }) => {
  const [rows, setRows] = useState<FinancialParameterRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadParams = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/system-params', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = (await res.json()) as { ok?: boolean; parameters?: FinancialParameterRow[]; error?: string };
      if (!res.ok || !data.parameters) {
        throw new Error(data.error || 'No se pudieron cargar los parámetros financieros.');
      }
      setRows(data.parameters);
      const nextDrafts: Record<string, string> = {};
      for (const p of data.parameters) {
        nextDrafts[p.paramKey] = p.numericValue;
      }
      setDrafts(nextDrafts);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error de conexión.' });
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    void loadParams();
  }, [loadParams]);

  const handleSave = async (paramKey: string) => {
    setSavingKey(paramKey);
    setFeedback(null);
    try {
      const res = await fetch(`/api/system-params/${encodeURIComponent(paramKey)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          value: drafts[paramKey],
          effectiveFrom: new Date().toISOString().slice(0, 10),
          reason: 'Actualización desde Panel de Configuración de Dirección',
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo guardar el parámetro.');
      }
      setFeedback({
        type: 'ok',
        text: `Parámetro "${FRIENDLY_LABELS[paramKey] ?? paramKey}" actualizado y registrado en la bitácora blindada (sin alterar contratos firmados).`,
      });
      await loadParams();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error guardando cambio.' });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
            <Sliders className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Configuración de Parámetros Financieros y Regulatorios</h3>
            <p className="text-xs text-slate-400">
              Ajusta montos de seguro, rangos de tasas y tasas oficiales de ISR sin depender de programación. Los cambios aplican solo a operaciones nuevas.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadParams()}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'ok' ? <ShieldCheck className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-4">Cargando parámetros vigentes...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((row) => (
            <div key={row.paramKey} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="text-xs font-bold text-white">{FRIENDLY_LABELS[row.paramKey] ?? row.paramKey}</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{row.description}</p>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={drafts[row.paramKey] ?? ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [row.paramKey]: e.target.value }))}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  disabled={savingKey === row.paramKey}
                  onClick={() => void handleSave(row.paramKey)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingKey === row.paramKey ? 'Guardando...' : 'Guardar'}</span>
                </button>
              </div>
              <div className="text-[10px] text-slate-500">
                Último cambio por: {row.updatedBy}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
