/**
 * VISTA EJECUTIVA DE COBRANZA EXTRAJUDICIAL, CONGELAMIENTO DE MORA, SUSPENSIONES Y REESTRUCTURAS N-A-1
 * Expediente: CRUSE-APO-2026-025 (RN-05, RN-07, RN-08, RN-10, RN-11)
 *
 * - Directriz 2: Interfaz asistida para Reestructuras N-a-1 (1 hasta 4 créditos NOMINA_NORMAL -> 1 nuevo contrato),
 *   bloqueando visual y operativamente créditos EXPRESS.
 * - Directriz 3: Cotejo de Póliza Colectiva de Seguro de Vida ($35,000 / $22.85) con resaltado visual
 *   rosa pálido (`bg-rose-950/40 border-l-4 border-rose-400`) para exclusiones por Demanda o Convenio (`RN-08`).
 * - Directriz 4: Zero-PII absoluto (`blindCurpPrefix` 12 chars, `curpMasked`, `rfcMasked`, `maskedName`).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Decimal from 'decimal.js';
import {
  ShieldAlert,
  PauseCircle,
  PlayCircle,
  GitMerge,
  HeartHandshake,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  AuthSession,
  LoanPortfolioRiskRow,
  PortfolioRiskSummary,
  ProjectedLoanOperationalStatus,
  SuspensionOrFreezeReason,
} from '../../types';

interface CollectionsAndAgreementsViewProps {
  session: AuthSession;
}

export const CollectionsAndAgreementsView: React.FC<CollectionsAndAgreementsViewProps> = ({ session }) => {
  const [subTab, setSubTab] = useState<'collections' | 'restructures' | 'insurance_cotejo'>('collections');
  const [summary, setSummary] = useState<PortfolioRiskSummary | null>(null);
  const [rows, setRows] = useState<LoanPortfolioRiskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedLoan, setSelectedLoan] = useState<LoanPortfolioRiskRow | null>(null);
  const [modalAction, setModalAction] = useState<'SUSPEND_OR_FREEZE' | 'REACTIVATE'>('SUSPEND_OR_FREEZE');
  const [modalReason, setModalReason] = useState<SuspensionOrFreezeReason>('COBRANZA_EXTRAJUDICIAL');
  const [modalPeriod, setModalPeriod] = useState('2026-Q20');
  const [modalNotes, setModalNotes] = useState('');
  const [submittingModal, setSubmittingModal] = useState(false);

  const [selectedExpedienteId, setSelectedExpedienteId] = useState<string>('');
  const [selectedPrevLoanIds, setSelectedPrevLoanIds] = useState<string[]>([]);
  const [newPrincipalAmount, setNewPrincipalAmount] = useState<string>('25000');
  const [newTermFortnights, setNewTermFortnights] = useState<number>(24);
  const [firstDeductionPeriod, setFirstDeductionPeriod] = useState<string>('2026-Q21');
  const [restructureNotes, setRestructureNotes] = useState<string>('');
  const [submittingRestructure, setSubmittingRestructure] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/collections/portfolio', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = (await res.json()) as { summary?: PortfolioRiskSummary; rows?: LoanPortfolioRiskRow[]; error?: string };
      if (res.ok && data.summary && data.rows) {
        setSummary(data.summary);
        setRows(data.rows);
      } else {
        setFeedback({ type: 'error', text: data.error || 'No se pudo cargar el portafolio de cobranza.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Error de red al consultar el motor de cobranza y riesgo.' });
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'ALL' && r.projectedStatus !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        r.contractNumber.toLowerCase().includes(q) ||
        r.curpMasked.toLowerCase().includes(q) ||
        r.blindCurpPrefix.toLowerCase().includes(q) ||
        r.maskedName.toLowerCase().includes(q) ||
        r.convenio.toLowerCase().includes(q)
      );
    });
  }, [rows, statusFilter, searchQuery]);

  const expedientesWithNormalLoans = useMemo(() => {
    const map = new Map<
      string,
      { expedienteId: string; maskedName: string; curpMasked: string; blindCurpPrefix: string; convenio: string; loans: LoanPortfolioRiskRow[] }
    >();
    for (const r of rows) {
      if (r.projectedStatus === 'RESTRUCTURED' || r.projectedStatus === 'PAID_OFF') continue;
      const existing = map.get(r.expedienteId);
      if (existing) existing.loans.push(r);
      else map.set(r.expedienteId, { expedienteId: r.expedienteId, maskedName: r.maskedName, curpMasked: r.curpMasked, blindCurpPrefix: r.blindCurpPrefix, convenio: r.convenio, loans: [r] });
    }
    return Array.from(map.values());
  }, [rows]);

  const activeClientForRestructure = useMemo(
    () => expedientesWithNormalLoans.find((e) => e.expedienteId === selectedExpedienteId) ?? null,
    [expedientesWithNormalLoans, selectedExpedienteId]
  );

  const restructureCalc = useMemo(() => {
    let absorbedDec = new Decimal(0);
    if (activeClientForRestructure) {
      for (const loan of activeClientForRestructure.loans) {
        if (selectedPrevLoanIds.includes(loan.loanAccountId)) absorbedDec = absorbedDec.plus(new Decimal(loan.liveBalance || 0));
      }
    }
    const newPrinDec = new Decimal(newPrincipalAmount || 0);
    const netDisbursedDec = Decimal.max(0, newPrinDec.minus(absorbedDec));
    return { absorbedTotal: absorbedDec.toFixed(2), netDisbursed: netDisbursedDec.toFixed(2) };
  }, [activeClientForRestructure, selectedPrevLoanIds, newPrincipalAmount]);

  const openActionModal = (row: LoanPortfolioRiskRow, action: 'SUSPEND_OR_FREEZE' | 'REACTIVATE', defaultReason: SuspensionOrFreezeReason) => {
    setSelectedLoan(row);
    setModalAction(action);
    setModalReason(defaultReason);
    setModalPeriod('2026-Q20');
    setModalNotes(
      action === 'REACTIVATE'
        ? 'Reincorporación laboral confirmada por RH; se reactiva descuento quincenal.'
        : defaultReason === 'LICENCIA_SIN_GOCE'
          ? 'Empleado con licencia sin goce de sueldo; pausa temporal sin intereses moratorios.'
          : defaultReason === 'CONVENIO_EXTRAJUDICIAL'
            ? 'Convenio extrajudicial firmado con calendario de pagos domiciliados/transferencia.'
            : 'Baja laboral en dependencia; se congela mora y pasa a despacho de cobranza extrajudicial.'
    );
  };

  const handleConfirmModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;
    setSubmittingModal(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/collections/suspension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          loanAccountId: selectedLoan.loanAccountId,
          action: modalAction,
          reason: modalReason,
          startPeriod: modalPeriod,
          agreementNotes: modalNotes,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) setFeedback({ type: 'error', text: data.error || 'Error al registrar operación.' });
      else {
        setFeedback({ type: 'success', text: `Contrato ${selectedLoan.contractNumber} actualizado atómicamente (Estado, Póliza Seguro RN-08 y Sello WORM).` });
        setSelectedLoan(null);
        await fetchPortfolio();
      }
    } catch {
      setFeedback({ type: 'error', text: 'Fallo de conexión al registrar la operación.' });
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleTogglePrevLoan = (loanId: string) => {
    setSelectedPrevLoanIds((prev) => (prev.includes(loanId) ? prev.filter((id) => id !== loanId) : [...prev, loanId].slice(0, 4)));
  };

  const handleExecuteRestructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpedienteId || selectedPrevLoanIds.length === 0) return;
    setSubmittingRestructure(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/collections/restructure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          expedienteId: selectedExpedienteId,
          previousLoanIds: selectedPrevLoanIds,
          newPrincipalAmount: Number(newPrincipalAmount),
          newTermFortnights,
          firstDeductionPeriod,
          notes: restructureNotes,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; result?: { newContractNumber: string; absorbedLoans: unknown[]; totalAbsorbedPayoff: string } };
      if (!res.ok || !data.result) setFeedback({ type: 'error', text: data.error || 'No fue posible ejecutar la reestructura.' });
      else {
        setFeedback({
          type: 'success',
          text: `Reestructura N-a-1 sellada: Nuevo contrato ${data.result.newContractNumber} absorbió ${data.result.absorbedLoans.length} crédito(s) por $${data.result.totalAbsorbedPayoff} MXN.`,
        });
        setSelectedPrevLoanIds([]);
        setRestructureNotes('');
        await fetchPortfolio();
      }
    } catch {
      setFeedback({ type: 'error', text: 'Error de red al procesar la reestructura.' });
    } finally {
      setSubmittingRestructure(false);
    }
  };

  const renderStatusBadge = (status: ProjectedLoanOperationalStatus) => {
    if (status === 'ACTIVE') return <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">ACTIVO</span>;
    if (status === 'FROZEN_EXTRAJUDICIAL') return <span className="px-2 py-0.5 text-xs rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">CONGELADO / COBRANZA</span>;
    if (status === 'SUSPENDED_LEAVE') return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">PAUSA LICENCIA S/GOCE</span>;
    if (status === 'RESTRUCTURED') return <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">REESTRUCTURADO (RV)</span>;
    return <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-300">LIQUIDADO (CC)</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-white/10 rounded-xl p-5 backdrop-blur-md">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#00D1FF]" />
            Motor de Cobranza Extrajudicial, Suspensiones, Reestructuras y Cotejo de Seguro
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Proyección determinista basada en eventos (Condición 1 WORM) · Sincronización automática con Círculo de Crédito (001496) y Póliza Colectiva $35,000 MXN
          </p>
        </div>
        <button
          onClick={fetchPortfolio}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#00D1FF]' : ''}`} />
          Actualizar Proyección CTE
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/70 border border-white/10 rounded-xl p-4 backdrop-blur-md">
            <p className="text-xs text-slate-400">Cartera Activa Vigente</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">{summary.activeCount} contratos</p>
            <p className="text-xs text-slate-400 mt-1">Saldo vivo total: ${summary.totalLiveBalance} MXN</p>
          </div>
          <div className="bg-slate-900/70 border border-rose-500/30 rounded-xl p-4 backdrop-blur-md">
            <p className="text-xs text-rose-300">Mora Congelada / Cobranza (RN-05/07)</p>
            <p className="text-xl font-bold text-rose-400 mt-1">{summary.frozenExtrajudicialCount} contratos</p>
            <p className="text-xs text-rose-200/80 mt-1">Saldo congelado: ${summary.totalFrozenBalance} MXN</p>
          </div>
          <div className="bg-slate-900/70 border border-amber-500/30 rounded-xl p-4 backdrop-blur-md">
            <p className="text-xs text-amber-300">Licencia sin Goce / Reestructuras</p>
            <p className="text-xl font-bold text-amber-400 mt-1">{summary.suspendedLeaveCount} en pausa · {summary.restructuredCount} RV</p>
            <p className="text-xs text-slate-400 mt-1">Sin generación de intereses moratorios (RN-10)</p>
          </div>
          <div className="bg-rose-950/30 border border-rose-400/40 rounded-xl p-4 backdrop-blur-md">
            <p className="text-xs text-rose-200">Excluidos Seguro por Demanda/Convenio (RN-08)</p>
            <p className="text-xl font-bold text-rose-300 mt-1">{summary.excludedInsuranceCount} contratos</p>
            <p className="text-xs text-rose-200/80 mt-1">Resaltados en rosa pálido para cotejo de Alma</p>
          </div>
        </div>
      )}

      {feedback && (
        <div className={`p-3 rounded-lg border flex items-center justify-between text-xs ${feedback.type === 'success' ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200' : 'bg-rose-950/60 border-rose-500/40 text-rose-200'}`}>
          <span className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {feedback.text}
          </span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button onClick={() => setSubTab('collections')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold ${subTab === 'collections' ? 'bg-[#00D1FF] text-[#0D1B3E]' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
          <PauseCircle className="w-4 h-4" /> 1. Congelamiento de Mora, Convenios y Licencias (RN-05 / RN-07 / RN-10)
        </button>
        <button onClick={() => setSubTab('restructures')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold ${subTab === 'restructures' ? 'bg-[#00D1FF] text-[#0D1B3E]' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
          <GitMerge className="w-4 h-4" /> 2. Reestructura N-a-1 de Créditos Normales (RN-11)
        </button>
        <button onClick={() => setSubTab('insurance_cotejo')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold ${subTab === 'insurance_cotejo' ? 'bg-[#00D1FF] text-[#0D1B3E]' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
          <HeartHandshake className="w-4 h-4" /> 3. Cotejo Póliza Seguro de Vida $35,000 (Rosa Pálido Demanda — RN-08)
        </button>
      </div>

      {subTab === 'collections' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por contrato, CURP enmascarada, blindCurpPrefix (12 chars) o convenio..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white">
              <option value="ALL">Todos los estados proyectados</option>
              <option value="ACTIVE">ACTIVO</option>
              <option value="FROZEN_EXTRAJUDICIAL">CONGELADO / COBRANZA EXTRAJUDICIAL</option>
              <option value="SUSPENDED_LEAVE">SUSPENDIDO LICENCIA S/GOCE</option>
              <option value="RESTRUCTURED">REESTRUCTURADO (RV)</option>
              <option value="PAID_OFF">LIQUIDADO (CC)</option>
            </select>
          </div>

          <div className="overflow-x-auto max-h-[440px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/80 sticky top-0">
                  <th className="p-2.5">Contrato / Producto</th>
                  <th className="p-2.5">Acreditado (Zero-PII)</th>
                  <th className="p-2.5">Blind Prefix (12c)</th>
                  <th className="p-2.5">Saldo Vivo</th>
                  <th className="p-2.5">Estado Proyectado</th>
                  <th className="p-2.5">Proyección SIC (001496)</th>
                  <th className="p-2.5 text-right">Acciones Operativas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredRows.map((row) => (
                  <tr key={row.loanAccountId} className="hover:bg-slate-800/40">
                    <td className="p-2.5 font-mono text-cyan-300">
                      {row.contractNumber}
                      <div className="text-[10px] text-slate-400">{row.productType} · {row.convenio}</div>
                    </td>
                    <td className="p-2.5">
                      <div className="font-semibold text-white">{row.maskedName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">CURP: {row.curpMasked} | RFC: {row.rfcMasked}</div>
                    </td>
                    <td className="p-2.5 font-mono text-[11px] text-slate-400">{row.blindCurpPrefix}</td>
                    <td className="p-2.5 font-mono text-white">${row.liveBalance}</td>
                    <td className="p-2.5">
                      {renderStatusBadge(row.projectedStatus)}
                      {row.activeSuspensionReason && <div className="text-[10px] text-amber-300 mt-0.5">{row.activeSuspensionReason}</div>}
                    </td>
                    <td className="p-2.5 text-[11px] text-slate-300">{row.sicObservationPreview ?? 'V (Vigente Ordinario)'}</td>
                    <td className="p-2.5 text-right space-x-1.5">
                      {row.projectedStatus === 'ACTIVE' && (
                        <>
                          <button onClick={() => openActionModal(row, 'SUSPEND_OR_FREEZE', 'DEMANDA_JUDICIAL')} className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px]">Congelar / Demanda</button>
                          <button onClick={() => openActionModal(row, 'SUSPEND_OR_FREEZE', 'CONVENIO_EXTRAJUDICIAL')} className="px-2.5 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-[11px]">Convenio Pago</button>
                          <button onClick={() => openActionModal(row, 'SUSPEND_OR_FREEZE', 'LICENCIA_SIN_GOCE')} className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px]">Suspensión Temporal</button>
                        </>
                      )}
                      {(row.projectedStatus === 'FROZEN_EXTRAJUDICIAL' || row.projectedStatus === 'SUSPENDED_LEAVE') && (
                        <button onClick={() => openActionModal(row, 'REACTIVATE', 'LICENCIA_SIN_GOCE')} className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] inline-flex items-center gap-1">
                          <PlayCircle className="w-3.5 h-3.5" /> Reactivar Nómina
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'restructures' && (
        <form onSubmit={handleExecuteRestructure} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-300 mb-1 font-semibold">1. Seleccionar Acreditado (Zero-PII)</label>
              <select
                value={selectedExpedienteId}
                onChange={(e) => {
                  setSelectedExpedienteId(e.target.value);
                  setSelectedPrevLoanIds([]);
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
              >
                <option value="">-- Seleccione un expediente activo --</option>
                {expedientesWithNormalLoans.map((exp) => (
                  <option key={exp.expedienteId} value={exp.expedienteId}>
                    {exp.maskedName} · {exp.curpMasked} ({exp.loans.length} contrato[s])
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Nuevo Principal ($)</label>
                <input type="number" step="0.01" value={newPrincipalAmount} onChange={(e) => setNewPrincipalAmount(e.target.value)} className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white" />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Plazo (Quincenas)</label>
                <input type="number" value={newTermFortnights} onChange={(e) => setNewTermFortnights(Number(e.target.value))} className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white" />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">1er Periodo</label>
                <input type="text" value={firstDeductionPeriod} onChange={(e) => setFirstDeductionPeriod(e.target.value)} className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white" />
              </div>
            </div>
          </div>

          {activeClientForRestructure && (
            <div className="space-y-2">
              <p className="text-xs text-slate-300 font-semibold">2. Seleccione de 1 hasta 4 créditos NOMINA_NORMAL a absorber (RN-11: Créditos EXPRESS bloqueados)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {activeClientForRestructure.loans.map((loan) => {
                  const isExpress = loan.productType === 'EXPRESS';
                  const checked = selectedPrevLoanIds.includes(loan.loanAccountId);
                  return (
                    <label
                      key={loan.loanAccountId}
                      className={`flex items-center justify-between p-3 rounded-lg border text-xs ${isExpress ? 'bg-slate-950/50 border-rose-500/30 opacity-60 cursor-not-allowed' : checked ? 'bg-cyan-950/40 border-[#00D1FF]' : 'bg-slate-950 border-slate-800 cursor-pointer'}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input type="checkbox" disabled={isExpress} checked={checked} onChange={() => handleTogglePrevLoan(loan.loanAccountId)} />
                        <div>
                          <span className="font-mono font-bold text-white">{loan.contractNumber}</span>
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{loan.productType}</span>
                          {isExpress && <div className="text-[10px] text-rose-400">Bloqueado por RN-11 (No reestructurable)</div>}
                        </div>
                      </div>
                      <div className="font-mono text-cyan-300">${loan.liveBalance} MXN</div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-slate-800">
            <div className="text-xs text-slate-300 space-x-4">
              <span>Créditos seleccionados: <strong>{selectedPrevLoanIds.length}</strong></span>
              <span>Saldo absorbido (Decimal.js): <strong className="text-amber-300">${restructureCalc.absorbedTotal}</strong></span>
              <span>Remanente neto a entregar: <strong className="text-emerald-400">${restructureCalc.netDisbursed}</strong></span>
            </div>
            <button type="submit" disabled={submittingRestructure || selectedPrevLoanIds.length === 0} className="px-5 py-2 rounded-lg bg-[#00D1FF] hover:bg-cyan-400 disabled:opacity-40 text-[#0D1B3E] font-bold text-xs">
              {submittingRestructure ? 'Consolidando Contrato...' : 'Consolidar en Nuevo Contrato'}
            </button>
          </div>
        </form>
      )}

      {/* SUB-TAB 3: COTEJO PÓLIZA SEGURO DE VIDA CON RESALTADO ROSA PÁLIDO (RN-08 / DIRECTRIZ 3) */}
      {subTab === 'insurance_cotejo' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-300">
            <strong>Regla RN-08 (Cotejo de Seguro de Vida $35,000 MXN / Prima $22.85):</strong> Los créditos en{' '}
            <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-400 text-rose-200 font-semibold">Rosa Pálido (DEMANDA / CONVENIO)</span>{' '}
            se conservan visibles en el listado para facilitar el cotejo uno a uno contra la cartera general, pero están excluidos del pago a la aseguradora.
          </p>
          <div className="overflow-x-auto max-h-[440px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/80 sticky top-0">
                  <th className="p-2.5">Contrato</th>
                  <th className="p-2.5">Acreditado (Zero-PII)</th>
                  <th className="p-2.5">Blind Prefix</th>
                  <th className="p-2.5">Suma Asegurada</th>
                  <th className="p-2.5">Prima Quincenal</th>
                  <th className="p-2.5">Estatus Póliza (RN-08)</th>
                  <th className="p-2.5">Nota Operativa Anclada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {rows.map((row) => {
                  const isExcludedPink = row.insuranceStatus === 'EXCLUDED_DEMANDA' || row.insuranceStatus === 'EXCLUDED_CONVENIO';
                  return (
                    <tr
                      key={row.loanAccountId}
                      className={isExcludedPink ? 'bg-rose-950/40 border-l-4 border-rose-400 text-rose-100' : 'hover:bg-slate-800/40 text-slate-200'}
                    >
                      <td className="p-2.5 font-mono font-semibold">{row.contractNumber}</td>
                      <td className="p-2.5">{row.maskedName} <span className="font-mono text-[10px] opacity-80">({row.curpMasked})</span></td>
                      <td className="p-2.5 font-mono text-[11px]">{row.blindCurpPrefix}</td>
                      <td className="p-2.5 font-mono">${row.insuredAmount}</td>
                      <td className="p-2.5 font-mono">${isExcludedPink ? '0.00 (Exento)' : row.periodPremium}</td>
                      <td className="p-2.5 font-semibold">{row.insuranceStatus}</td>
                      <td className="p-2.5 text-[11px] truncate max-w-xs">{row.latestNoteContent ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedLoan && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <form onSubmit={handleConfirmModal} className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                {modalAction === 'REACTIVATE' ? `Reactivar Descuento por Nómina — ${selectedLoan.contractNumber}` : `Registrar Evento de Riesgo / Cobranza — ${selectedLoan.contractNumber}`}
              </h3>
              <button type="button" onClick={() => setSelectedLoan(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            {modalAction === 'SUSPEND_OR_FREEZE' && (
              <div>
                <label className="block text-xs text-slate-300 mb-1">Motivo Reglamentario (RN-05 / RN-07 / RN-10)</label>
                <select value={modalReason} onChange={(e) => setModalReason(e.target.value as SuspensionOrFreezeReason)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white">
                  <option value="DEMANDA_JUDICIAL">DEMANDA_JUDICIAL (Congela mora, SIC=SG, Seguro=EXCLUDED_DEMANDA)</option>
                  <option value="COBRANZA_EXTRAJUDICIAL">COBRANZA_EXTRAJUDICIAL (Congela mora, SIC=CL, Seguro=EXCLUDED_DEMANDA)</option>
                  <option value="BAJA_LABORAL">BAJA_LABORAL (Baja de dependencia, SIC=CL, Seguro=EXCLUDED_DEMANDA)</option>
                  <option value="CONVENIO_EXTRAJUDICIAL">CONVENIO_EXTRAJUDICIAL (Convenio de pago, SIC=CV, Seguro=EXCLUDED_CONVENIO)</option>
                  <option value="LICENCIA_SIN_GOCE">LICENCIA_SIN_GOCE (Pausa temporal sin mora, SIC=V, Seguro=ACTIVE)</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-300 mb-1">Periodo Quincenal/Mensual de Aplicación</label>
              <input type="text" value={modalPeriod} onChange={(e) => setModalPeriod(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Nota Operativa Anclada y Términos del Convenio / Acta WORM</label>
              <textarea rows={3} value={modalNotes} onChange={(e) => setModalNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setSelectedLoan(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs text-slate-300">Cancelar</button>
              <button type="submit" disabled={submittingModal} className="px-4 py-2 rounded-lg bg-[#00D1FF] text-[#0D1B3E] font-bold text-xs">
                {submittingModal ? 'Sellando en PostgreSQL...' : 'Confirmar y Sellar WORM'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
