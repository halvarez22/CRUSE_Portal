/**
 * MÓDULO B.5: MATRIZ COMPARATIVA DE COMPETENCIA (PIZARRA DE ESTRATEGIA COMERCIAL EDITABLE)
 * Expediente: CRUSE-APO-2026-029 / CRUSE-APO-2026-058 — Guardrails 1, 2, 3 y 4 (< 600 líneas)
 */

import React, { useState, useEffect, useCallback } from 'react';
import Decimal from 'decimal.js';
import {
  BarChart3,
  Sparkles,
  DollarSign,
  Edit3,
  Check,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Award,
} from 'lucide-react';
import { CompetitorBenchmark } from '../../types/executive';
import { HOMOLOGATED_10K_COMPARISON_DATA } from '../../data/cruseExecutiveData';
import { PromotionalBrochureModal } from './PromotionalBrochureModal';

interface CompetitorMatrixTabProps {
  token: string;
  canEdit: boolean;
}

export const CompetitorMatrixTab: React.FC<CompetitorMatrixTabProps> = ({ token, canEdit }) => {
  const [competitors, setCompetitors] = useState<CompetitorBenchmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterBureauOnly, setFilterBureauOnly] = useState(false);
  const [homologated10kOnly, setHomologated10kOnly] = useState(true);
  const [isBrochureOpen, setIsBrochureOpen] = useState(false);

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

  // Guardrail 3 (CRUSE-APO-2026-058): Persistencia inmediata en backend vía PUT /api/executive/competitors/:id
  const handleSave = async (id: string) => {
    setSaving(true);
    setFeedback(null);
    try {
      const sampleTotalPayment = new Decimal(editPayment || 0)
        .mul(new Decimal(editTerm || 1))
        .toDP(2, Decimal.ROUND_HALF_UP)
        .toNumber();
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
      setFeedback('✓ Pizarra de Estrategia Comercial actualizada y sincronizada en Base de Datos.');
      await fetchCompetitors();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Error al guardar cambios');
    } finally {
      setSaving(false);
    }
  };

  const displayed = competitors.filter((c) => {
    if (filterBureauOnly && c.requiresBureau) return false;
    if (homologated10kOnly && c.sampleLoan !== 10000) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-[#0D1B3E]/80 to-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-[#D4AF37] border border-amber-500/30 text-xs font-bold mb-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Pizarra de Estrategia Comercial (B.5) · Efectivo Real en Mano vs. Fricciones</span>
          </span>
          <h3 className="text-xl font-extrabold text-white">
            Matriz Comparativa de Créditos de Nómina en México
          </h3>
          <p className="text-xs text-slate-400">
            En Microfinanciera Cruse, $10,000 solicitados son $10,000 depositados vía SPEI (0% comisiones ocultas, sin aval y sin freno por Buró).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsBrochureOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#249E82] to-[#396CAE] hover:opacity-95 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Folleto Promocional (PDF 2 Págs)</span>
          </button>
          <button
            type="button"
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
            type="button"
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

      {/* Comparador Visual Homologado: Efectivo Real en Mano vs. Comisiones ($10,000 MXN a 24 Quincenas) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <h4 className="text-sm md:text-base font-extrabold text-white flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>Comparativo de Desembolso Real y Costo Total para un Crédito Muestra de $10,000 MXN a 24 Quincenas</span>
          </h4>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            Muestra Homologada de Referencia (100% Comparable)
          </span>
        </div>

        <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-4 text-[11px] font-bold uppercase text-slate-400">
          <div className="lg:col-span-3">Institución & Estatus</div>
          <div className="lg:col-span-4 text-center">Efectivo Real vs. Comisiones (Neto en Mano)</div>
          <div className="lg:col-span-2 text-center">Cuota Quincenal y Costo Total</div>
          <div className="lg:col-span-3">Facilidad y Fricciones</div>
        </div>

        <div className="space-y-3">
          {HOMOLOGATED_10K_COMPARISON_DATA.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-2xl border grid grid-cols-1 lg:grid-cols-12 gap-4 items-center transition-all ${
                item.isCruse
                  ? 'bg-emerald-950/30 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-950/70 border-slate-800'
              }`}
            >
              {/* Columna 1: Institución */}
              <div className="lg:col-span-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  {item.isCruse && <Award className="w-4 h-4 text-[#D4AF37] shrink-0" />}
                  <span className={`text-sm font-extrabold ${item.isCruse ? 'text-emerald-400' : 'text-white'}`}>
                    {item.institution}
                  </span>
                </div>
                <div className="text-xs text-slate-400">({item.productLabel})</div>
                {item.badgeText && (
                  <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500 text-slate-950">
                    {item.badgeText}
                  </span>
                )}
              </div>

              {/* Columna 2: Efectivo Real en Mano vs Comisiones */}
              <div className="lg:col-span-4 space-y-1.5 text-center">
                <div className="w-full h-6 rounded-full bg-slate-900 border border-slate-700 overflow-hidden flex text-[11px] font-extrabold">
                  <div
                    className={`h-full flex items-center justify-center ${
                      item.isCruse
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950'
                        : 'bg-slate-600 text-white'
                    }`}
                    style={{ width: `${item.netPercent}%` }}
                  >
                    {item.isCruse ? '100% Neto en Mano' : `${item.netPercent}%`}
                  </div>
                  {item.withheldPercent > 0 && (
                    <div
                      className="h-full bg-rose-600 text-white flex items-center justify-center"
                      style={{ width: `${item.withheldPercent}%` }}
                    >
                      -{item.withheldPercent}%
                    </div>
                  )}
                </div>
                <div className={`text-xs font-extrabold ${item.isCruse ? 'text-white' : 'text-slate-200'}`}>
                  {item.netDisbursedText}
                </div>
                <div className={`text-[11px] font-semibold ${item.isCruse ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {item.withheldDetail}
                </div>
              </div>

              {/* Columna 3: Cuota Quincenal y Costo Total */}
              <div className="lg:col-span-2 text-center space-y-0.5">
                <div className="text-lg font-black text-white">{item.fortnightlyPaymentText}</div>
                <div className="text-[11px] text-slate-300 font-semibold">{item.totalPaymentText}</div>
                <div className="text-[11px] text-slate-400">{item.rateLabel}</div>
              </div>

              {/* Columna 4: Facilidad y Fricciones */}
              <div className="lg:col-span-3 space-y-1.5">
                {item.frictionBullets.map((bullet, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-xs">
                    {item.frictionStatus === 'recommended' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    )}
                    {item.frictionStatus === 'warning' && (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    {item.frictionStatus === 'critical' && (
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    )}
                    <span
                      className={
                        item.frictionStatus === 'recommended'
                          ? 'text-emerald-300 font-semibold'
                          : item.frictionStatus === 'warning'
                            ? 'text-amber-300'
                            : 'text-rose-300'
                      }
                    >
                      {bullet}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla Comparativa Editable Conectada a Base de Datos (Guardrail 3) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-extrabold uppercase text-white">
              Catálogo Editable de Competidores (Conectado en Vivo a Base de Datos)
            </h4>
            <p className="text-[11px] text-slate-400">
              Cualquier ajuste en tasas, plazos o comisiones se guarda directamente en el servidor mediante el botón Guardar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHomologated10kOnly(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                homologated10kOnly
                  ? 'bg-[#249E82] text-white border-teal-400'
                  : 'bg-slate-950 text-slate-400 border-slate-800'
              }`}
            >
              Muestra Homologada ($10,000 MXN)
            </button>
            <button
              type="button"
              onClick={() => setHomologated10kOnly(false)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                !homologated10kOnly
                  ? 'bg-[#396CAE] text-white border-cyan-400'
                  : 'bg-slate-950 text-slate-400 border-slate-800'
              }`}
            >
              Todos los Registros ({competitors.length})
            </button>
          </div>
        </div>

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
                const liveTotal = isEditing
                  ? new Decimal(editPayment || 0).mul(new Decimal(editTerm || 1)).toNumber()
                  : c.sampleTotalPayment;
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
                      ${liveTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
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

      <PromotionalBrochureModal
        isOpen={isBrochureOpen}
        onClose={() => setIsBrochureOpen(false)}
      />
    </div>
  );
};
