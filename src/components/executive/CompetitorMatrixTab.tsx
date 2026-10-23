/**
 * MÓDULO B.5: MATRIZ COMPARATIVA DE COMPETENCIA (PIZARRA DE ESTRATEGIA COMERCIAL EDITABLE)
 * Expediente: CRUSE-APO-2026-029 — Guardrail Forense 1 (< 400 líneas)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Sparkles,
  DollarSign,
  Edit3,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { CompetitorBenchmark } from '../../types/executive';

interface CompetitorMatrixTabProps {
  token: string;
  canEdit: boolean;
}

export const CompetitorMatrixTab: React.FC<CompetitorMatrixTabProps> = ({ token, canEdit }) => {
  const [competitors, setCompetitors] = useState<CompetitorBenchmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterBureauOnly, setFilterBureauOnly] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState('');
  const [editPayment, setEditPayment] = useState<number>(0);
  const [editTerm, setEditTerm] = useState<number>(24);
  const [editCommissions, setEditCommissions] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchCompetitors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/executive/competitors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.competitors) setCompetitors(data.competitors);
      }
    } catch (err) {
      console.error('Error cargando pizarra de competencia:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  const startEditing = (c: CompetitorBenchmark) => {
    setEditingId(c.id);
    setEditRate(c.annualInterestRate);
    setEditPayment(c.sampleFortnightlyPayment);
    setEditTerm(c.sampleTermQuincenas);
    setEditCommissions(c.commissions);
    setFeedback(null);
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    setFeedback(null);
    try {
      const sampleTotalPayment = Number((editPayment * editTerm).toFixed(2));
      const res = await fetch(`/api/executive/competitors/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          annualInterestRate: editRate,
          sampleFortnightlyPayment: editPayment,
          sampleTermQuincenas: editTerm,
          sampleTotalPayment,
          commissions: editCommissions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo actualizar el competidor');
      }
      setEditingId(null);
      setFeedback('✓ Pizarra de Estrategia Comercial actualizada y sellada en Bitácora WORM.');
      await fetchCompetitors();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Error al guardar cambios');
    } finally {
      setSaving(false);
    }
  };

  const displayed = filterBureauOnly
    ? competitors.filter((c) => !c.requiresBureau)
    : competitors;

  const sample10kList = competitors.filter((c) => c.sampleLoan === 10000);
  const max10kTotal = Math.max(15340, ...sample10kList.map((c) => c.sampleTotalPayment));

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-[#0D1B3E]/80 to-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-[#D4AF37] border border-amber-500/30 text-xs font-bold mb-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Pizarra de Estrategia Comercial (B.5) · Editable en Vivo</span>
          </span>
          <h3 className="text-xl font-extrabold text-white">
            Matriz Comparativa de Créditos de Nómina en México
          </h3>
          <p className="text-xs text-slate-400">
            El equipo comercial puede actualizar tasas, cuotas y comisiones de la competencia para demostrar la ventaja competitiva de Cruse.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterBureauOnly((v) => !v)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
              filterBureauOnly
                ? 'bg-emerald-600 text-white border-emerald-400'
                : 'bg-slate-950 text-slate-300 border-slate-800'
            }`}
          >
            {filterBureauOnly ? '✓ Mostrando Sin Buró (Cruse)' : 'Filtrar Opciones Sin Buró'}
          </button>
          <button
            onClick={fetchCompetitors}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white"
            title="Refrescar pizarra"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
          {feedback}
        </div>
      )}

      {/* Comparativo Visual para Crédito Muestra de $10,000 MXN */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <span>Comparativo de Costo Total para un Crédito Muestra de $10,000 MXN</span>
        </h4>
        <div className="space-y-2.5">
          {sample10kList.map((c) => {
            const pct = Math.min(100, Math.max(20, (c.sampleTotalPayment / max10kTotal) * 100));
            return (
              <div key={c.id} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className={c.isCruse ? 'text-emerald-400 font-extrabold flex items-center gap-1' : 'text-slate-300'}>
                    {c.isCruse && <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />}
                    {c.name} ({c.productName})
                  </span>
                  <span className={c.isCruse ? 'text-emerald-400 font-extrabold' : 'text-slate-300'}>
                    Total: ${c.sampleTotalPayment.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN | Tasa: {c.annualInterestRate}
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className={`h-full rounded-full ${
                      c.isCruse
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                        : c.id === 'independencia'
                          ? 'bg-rose-500/80'
                          : 'bg-slate-600'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabla Comparativa Editable */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase">
                <th className="p-3.5">Institución / Producto</th>
                <th className="p-3.5">Monto Muestra</th>
                <th className="p-3.5">Plazo (Qnas)</th>
                <th className="p-3.5">Cuota Quincenal</th>
                <th className="p-3.5">Total a Pagar</th>
                <th className="p-3.5">Tasa de Interés</th>
                <th className="p-3.5">Comisiones y Cargos</th>
                {canEdit && <th className="p-3.5 text-right">Estrategia</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {displayed.map((c) => {
                const isEditing = editingId === c.id;
                return (
                  <tr
                    key={c.id}
                    className={
                      c.isCruse
                        ? 'bg-emerald-950/35 text-white font-semibold'
                        : 'text-slate-300 hover:bg-slate-800/40'
                    }
                  >
                    <td className="p-3.5">
                      <div className="font-bold flex items-center gap-1.5 text-white">
                        {c.isCruse && <Sparkles className="w-3.5 h-3.5 text-emerald-400" />}
                        <span>{c.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">{c.productName}</span>
                    </td>
                    <td className="p-3.5 font-mono">${c.sampleLoan.toLocaleString('es-MX')}</td>
                    <td className="p-3.5">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editTerm}
                          onChange={(e) => setEditTerm(Number(e.target.value))}
                          className="w-16 bg-slate-950 border border-cyan-500 rounded px-2 py-1 text-white"
                        />
                      ) : (
                        `${c.sampleTermQuincenas} Qnas`
                      )}
                    </td>
                    <td className="p-3.5 font-mono font-bold text-white">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editPayment}
                          onChange={(e) => setEditPayment(Number(e.target.value))}
                          className="w-24 bg-slate-950 border border-cyan-500 rounded px-2 py-1 text-white"
                        />
                      ) : (
                        `$${c.sampleFortnightlyPayment.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                      )}
                    </td>
                    <td className="p-3.5 font-mono font-black text-emerald-400">
                      ${(isEditing ? editPayment * editTerm : c.sampleTotalPayment).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-cyan-300 font-semibold">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          className="w-40 bg-slate-950 border border-cyan-500 rounded px-2 py-1 text-white"
                        />
                      ) : (
                        c.annualInterestRate
                      )}
                    </td>
                    <td className="p-3.5 text-[11px]">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editCommissions}
                          onChange={(e) => setEditCommissions(e.target.value)}
                          className="w-48 bg-slate-950 border border-cyan-500 rounded px-2 py-1 text-white"
                        />
                      ) : (
                        c.commissions
                      )}
                    </td>
                    {canEdit && (
                      <td className="p-3.5 text-right">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleSave(c.id)}
                              disabled={saving}
                              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                              title="Guardar cambios"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditing(c)}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Actualizar</span>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
