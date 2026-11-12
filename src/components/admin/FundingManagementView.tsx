/**
 * PANEL DE FONDEO E INVERSIONISTAS — MODELO 3FN v4 (RN-09, RN-10, RN-11)
 *
 * @implements RN-09 (Interés Simple vs Compuesto), RN-10 (Exención ISR applies_isr) y RN-11 (Capital al Corte)
 * @implements CRUSE-APO-2026-059 (Desacoplamiento de KPIs Inversiones Activas vs Movimientos y Modal de Notas Operativas con Focus Trap)
 * @implements Regla 3 Anti-God-Object (< 500 líneas) y Regla 6 SQA (0 any)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Play, Landmark, CheckCircle2, RefreshCw, Plus, X, MessageSquareText } from 'lucide-react';
import { AuthSession } from '../../types';
import { InvestmentNotesModal } from './InvestmentNotesModal';

interface FundingInvestmentItem {
  id: string;
  investor_id: string;
  interest_type: 'SIMPLE' | 'COMPOUND';
  capital: number;
  current_capital: number;
  annual_rate: number;
  start_date: string;
  status: 'ACTIVE' | 'CLOSED';
  blind_name: string;
  isr_retention_rate: number;
  applies_isr: 0 | 1;
  requires_invoice: 0 | 1;
  notes_count?: number;
}

interface CapitalMovementItem {
  id: string;
  investment_id: string;
  movement_date: string;
  movement_type: 'DEPOSIT' | 'WITHDRAWAL' | 'CAPITALIZATION';
  amount: number;
}

interface FundingManagementViewProps {
  session: AuthSession;
}

export const FundingManagementView: React.FC<FundingManagementViewProps> = ({ session }) => {
  const [investments, setInvestments] = useState<FundingInvestmentItem[]>([]);
  const [movements, setMovements] = useState<CapitalMovementItem[]>([]);
  const [notesModalInvestmentId, setNotesModalInvestmentId] = useState<string | null>(null);
  const [targetMonthDate, setTargetMonthDate] = useState('2026-10-15');
  const [loading, setLoading] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleBanner, setSettleBanner] = useState<{ message: string; alreadyProcessed: boolean } | null>(null);

  const [showNewModal, setShowNewModal] = useState(false);
  const [invName, setInvName] = useState('');
  const [invCapital, setInvCapital] = useState('250000');
  const [invRate, setInvRate] = useState('18');
  const [invType, setInvType] = useState<'SIMPLE' | 'COMPOUND'>('SIMPLE');
  const [invIsrOption, setInvIsrOption] = useState<'RETENCION_0_9' | 'EXENTO'>('RETENCION_0_9');
  const [creatingInv, setCreatingInv] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/funding/overview', { headers: { Authorization: `Bearer ${session.token}` } });
      const data = await res.json();
      if (data.ok) {
        const invList: FundingInvestmentItem[] = (data.investments ?? []).map((item: FundingInvestmentItem) => ({
          ...item,
          notes_count: typeof item.notes_count === 'number' ? item.notes_count : Number(item.notes_count ?? 0),
        }));
        setInvestments(invList);
        setMovements(data.capitalMovements ?? []);
      }
    } catch (err: unknown) {
      console.error('Error cargando fondeo:', err);
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Guardrail 4 (CRUSE-APO-2026-061): Cortocircuito idempotente de igualdad referencial (aborta re-render si el conteo no cambió)
  const handleNotesCountChange = useCallback((investmentId: string, count: number) => {
    setInvestments((prev) => {
      const target = prev.find((inv) => inv.id === investmentId);
      if (!target || target.notes_count === count) return prev;
      return prev.map((inv) => (inv.id === investmentId ? { ...inv, notes_count: count } : inv));
    });
  }, []);

  const handleCreateInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingInv(true);
    setSettleBanner(null);
    try {
      const res = await fetch('/api/funding/investors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          name: invName,
          capital: Number(invCapital),
          annualRate: Number(invRate),
          interestType: invType,
          appliesIsr: invIsrOption === 'RETENCION_0_9' ? 1 : 0,
          isrRetentionRate: 0.009,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSettleBanner({ message: String(data.message), alreadyProcessed: false });
        setShowNewModal(false);
        setInvName('');
        await fetchOverview();
      } else {
        setSettleBanner({ message: String(data.error || 'Error al crear pagaré'), alreadyProcessed: true });
      }
    } catch {
      setSettleBanner({ message: 'Error de red al guardar inversionista', alreadyProcessed: true });
    } finally {
      setCreatingInv(false);
    }
  };

  const handleRunMonthlySettle = async () => {
    if (settling) return;
    setSettling(true);
    setSettleBanner(null);
    try {
      const res = await fetch('/api/funding/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ targetDate: targetMonthDate }),
      });
      const data = await res.json();
      if (data.ok) {
        setSettleBanner({ message: String(data.message), alreadyProcessed: Boolean(data.alreadyProcessed) });
        await fetchOverview();
      }
    } catch (err: unknown) {
      console.error('Error ejecutando corte mensual:', err);
    } finally {
      setSettling(false);
    }
  };

  const totalInitialCapital = investments.reduce((acc, i) => acc + Number(i.capital), 0);
  const totalCurrentCapital = investments.reduce(
    (acc, i) => acc + Number(i.current_capital > 0 ? i.current_capital : i.capital),
    0
  );

  const activeModalInvestment = investments.find((i) => i.id === notesModalInvestmentId) ?? null;

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Landmark className="w-5 h-5 text-[#00D1FF]" />
          <div>
            <h2 className="text-sm font-bold text-white">
              Fondeo e Inversionistas (Pagarés Interés Simple y Compuesto • Retención ISR)
            </h2>
            <p className="text-xs text-slate-400">Control de capital aportado, pagarés activos y corte mensual</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {session.user.role === 'admin' && (
            <>
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="px-3.5 py-2 rounded-xl bg-[#00D1FF] hover:bg-cyan-400 text-[#0D1B3E] text-xs font-bold flex items-center gap-1.5 shadow-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Nuevo Inversionista</span>
              </button>
              <input
                type="date"
                value={targetMonthDate}
                onChange={(e) => setTargetMonthDate(e.target.value)}
                className="bg-black/50 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white"
              />
              <button
                onClick={handleRunMonthlySettle}
                disabled={settling}
                className="px-4 py-2 rounded-xl bg-[#249E82] hover:bg-[#1fa789] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
              >
                {settling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                <span>Ejecutar Corte Mensual Idempotente</span>
              </button>
            </>
          )}
        </div>
      </div>

      {settleBanner && (
        <div className={`p-4 rounded-2xl border flex items-center gap-3 text-xs ${settleBanner.alreadyProcessed ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'}`}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-semibold">{settleBanner.message}</span>
        </div>
      )}

      {showNewModal && (
        <form onSubmit={handleCreateInvestor} className="p-5 rounded-2xl bg-slate-900 border border-[#00D1FF]/40 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <h3 className="font-bold text-white text-sm">Alta de Nuevo Inversionista y Emisión de Pagaré</h3>
            <button type="button" onClick={() => setShowNewModal(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Nombre</label>
              <input
                type="text"
                required
                value={invName}
                onChange={(e) => setInvName(e.target.value)}
                placeholder="Nombre del Inversionista"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Capital Inicial ($)</label>
              <input
                type="number"
                required
                min={1000}
                step="0.01"
                value={invCapital}
                onChange={(e) => setInvCapital(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Tasa Anual (%)</label>
              <input
                type="number"
                required
                step="0.1"
                value={invRate}
                onChange={(e) => setInvRate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Esquema de Interés</label>
              <select
                value={invType}
                onChange={(e) => setInvType(e.target.value as 'SIMPLE' | 'COMPOUND')}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white"
              >
                <option value="SIMPLE">Interés Simple (Pago Mensual)</option>
                <option value="COMPOUND">Interés Compuesto (Capitalizable)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Régimen de Retención ISR</label>
              <select
                value={invIsrOption}
                onChange={(e) => setInvIsrOption(e.target.value as 'RETENCION_0_9' | 'EXENTO')}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white"
              >
                <option value="RETENCION_0_9">Retención ISR: 0.9%</option>
                <option value="EXENTO">Exento de ISR: 0.0%</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowNewModal(false)} className="px-4 py-2 rounded-xl bg-white/10 text-slate-300 font-semibold">
              Cancelar
            </button>
            <button type="submit" disabled={creatingInv} className="px-5 py-2 rounded-xl bg-[#249E82] hover:bg-[#1fa789] text-white font-bold">
              {creatingInv ? 'Generando Pagaré...' : 'Guardar y Generar Pagaré'}
            </button>
          </div>
        </form>
      )}

      {/* CRUSE-APO-2026-059: 4 Tarjetas KPI independientes para eliminar la ambigüedad visual de "1 / 0" */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
          <span className="text-[11px] text-slate-400">Capital Original Colocado</span>
          <p className="text-xl font-bold text-white mt-1">
            ${totalInitialCapital.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
          <span className="text-[11px] text-slate-400">Capital Base Actual</span>
          <p className="text-xl font-bold text-[#00D1FF] mt-1">
            ${totalCurrentCapital.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-emerald-500/30 text-center">
          <span className="text-[11px] text-slate-300 font-semibold block">Inversiones Activas</span>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">{investments.length}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-emerald-500/30 text-center">
          <span className="text-[11px] text-slate-300 font-semibold block">Movimientos</span>
          <p className="text-2xl font-extrabold text-white mt-1">{movements.length}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.01] overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03] text-slate-400 font-semibold">
              <th className="py-3 px-4">ID Inversión</th>
              <th className="py-3 px-4">Esquema</th>
              <th className="py-3 px-4 text-right">Capital Inicial</th>
              <th className="py-3 px-4 text-right">Capital Actual</th>
              <th className="py-3 px-4 text-right">Tasa Anual</th>
              <th className="py-3 px-4 text-center">Régimen ISR</th>
              <th className="py-3 px-4 text-center">Bitácora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr><td colSpan={7} className="py-6 text-center text-slate-400">Cargando cartera de fondeo...</td></tr>
            ) : (
              investments.map((inv) => {
                const currentCap = inv.current_capital > 0 ? inv.current_capital : inv.capital;
                const notesCount = inv.notes_count ?? 0;
                return (
                  <tr key={inv.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-mono text-white">{inv.id}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${inv.interest_type === 'COMPOUND' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-white/10 text-slate-300'}`}>
                        {inv.interest_type === 'COMPOUND' ? 'COMPUESTO (Capitalizable)' : 'SIMPLE (Pago Mensual)'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">${Number(inv.capital).toFixed(2)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#00D1FF]">${Number(currentCap).toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-emerald-400 font-semibold">{(Number(inv.annual_rate) * 100).toFixed(2)}%</td>
                    <td className="py-3 px-4 text-center">
                      {inv.applies_isr === 1 ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-semibold">Retención ISR: {(Number(inv.isr_retention_rate) * 100).toFixed(1)}%</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold">Exento ISR (0%)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setNotesModalInvestmentId(inv.id)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-all ${
                          notesCount > 0
                            ? 'bg-[#249E82] hover:bg-[#1fa789] text-white shadow'
                            : 'bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/15'
                        }`}
                      >
                        <MessageSquareText className="w-3.5 h-3.5" />
                        <span>Ver Notas ({notesCount})</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <InvestmentNotesModal
        isOpen={Boolean(notesModalInvestmentId)}
        investmentId={notesModalInvestmentId}
        interestType={activeModalInvestment?.interest_type}
        currentCapital={
          activeModalInvestment
            ? activeModalInvestment.current_capital > 0
              ? activeModalInvestment.current_capital
              : activeModalInvestment.capital
            : undefined
        }
        token={session.token}
        onClose={() => setNotesModalInvestmentId(null)}
        onNotesCountChange={handleNotesCountChange}
      />
    </div>
  );
};
