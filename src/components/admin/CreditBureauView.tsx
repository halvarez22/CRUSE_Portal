/**
 * VISTA EJECUTIVA DE REPORTE A CÍRCULO DE CRÉDITO (SIC) Y CATÁLOGOS OFICIALES
 * Expediente: CRUSE-APO-2026-024 (RN-05, RN-06)
 *
 * - Regla 3: Anti-God-Object (< 450 líneas).
 * - Regla 4: U-First (Previsualización Zero-PII, Cifras de Control, Descarga Oficial y Editor de Catálogos).
 * - Regla 6: Cero `any`.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  ShieldCheck,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Database,
  PlusCircle,
  Lock,
  Hash,
} from 'lucide-react';
import {
  AuthSession,
  CreditBureauCatalogItem,
  CreditBureauGenerateResult,
  CreditBureauPersonScope,
  CreditBureauReportRecord,
} from '../../types';

interface CreditBureauViewProps {
  session: AuthSession;
}

export const CreditBureauView: React.FC<CreditBureauViewProps> = ({ session }) => {
  const [cutoffDate, setCutoffDate] = useState('2026-10-31');
  const [scope, setScope] = useState<CreditBureauPersonScope>('ALL');
  const [subTab, setSubTab] = useState<'generator' | 'history' | 'catalogs'>('generator');

  const [previewResult, setPreviewResult] = useState<CreditBureauGenerateResult | null>(null);
  const [historicalReports, setHistoricalReports] = useState<CreditBureauReportRecord[]>([]);
  const [catalogs, setCatalogs] = useState<CreditBureauCatalogItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Formulario de Catálogos Oficiales (RN-06 — exclusivo Admin)
  const [newGroup, setNewGroup] = useState('OBSERVATION_CODE');
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newActive, setNewActive] = useState(true);

  const isAdmin = session.user.role === 'admin';

  const fetchHistoryAndCatalogs = useCallback(async () => {
    try {
      const [repRes, catRes] = await Promise.all([
        fetch('/api/credit-bureau/reports', {
          headers: { Authorization: `Bearer ${session.token}` },
        }),
        fetch('/api/credit-bureau/catalogs', {
          headers: { Authorization: `Bearer ${session.token}` },
        }),
      ]);
      const repJson = (await repRes.json()) as { reports?: CreditBureauReportRecord[] };
      const catJson = (await catRes.json()) as { catalogs?: CreditBureauCatalogItem[] };
      if (repJson.reports) setHistoricalReports(repJson.reports);
      if (catJson.catalogs) setCatalogs(catJson.catalogs);
    } catch {
      // Silencioso en carga secundaria
    }
  }, [session.token]);

  const handlePreview = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/credit-bureau/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ cutoffDate, scope }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        result?: CreditBureauGenerateResult;
        error?: string;
      };
      if (!res.ok || !data.result) {
        throw new Error(data.error ?? 'Error al previsualizar el corte SIC.');
      }
      setPreviewResult(data.result);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [cutoffDate, scope, session.token]);

  useEffect(() => {
    fetchHistoryAndCatalogs();
    handlePreview();
  }, [fetchHistoryAndCatalogs, handlePreview]);

  const triggerBrowserDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob(['\uFEFF' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleGenerateAndDownload = async (format: 'CSV_PF' | 'PIPE_PF' | 'CSV_PM') => {
    setSealing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/credit-bureau/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ cutoffDate, scope }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        result?: CreditBureauGenerateResult;
        error?: string;
      };
      if (!res.ok || !data.result) {
        throw new Error(data.error ?? 'Error al sellar y descargar el layout.');
      }

      setPreviewResult(data.result);
      await fetchHistoryAndCatalogs();

      const base = data.result.officialFileNameBase;
      if (format === 'PIPE_PF' && data.result.pfPipeContent) {
        triggerBrowserDownload(`${base}_PF.txt`, data.result.pfPipeContent, 'text/plain;charset=utf-8');
      } else if (format === 'CSV_PM' && data.result.pmCsvContent) {
        triggerBrowserDownload(`${base}_PM.csv`, data.result.pmCsvContent, 'text/csv;charset=utf-8');
      } else if (data.result.pfCsvContent) {
        triggerBrowserDownload(`${base}.csv`, data.result.pfCsvContent, 'text/csv;charset=utf-8');
      }

      setSuccessMsg(
        `Reporte ${base} sellado en WORM (Folio: ${data.result.reportId ?? 'N/A'}) con SHA-256: ${data.result.manifestHash.slice(0, 16)}...`
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Fallo en generación');
    } finally {
      setSealing(false);
    }
  };

  const handleSaveCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/credit-bureau/catalogs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          catalogGroup: newGroup,
          code: newCode,
          description: newDesc,
          active: newActive,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? 'Error al guardar catálogo SIC');
      }
      setNewCode('');
      setNewDesc('');
      setSuccessMsg('Clave oficial del catálogo SIC actualizada y registrada en Bitácora WORM.');
      await fetchHistoryAndCatalogs();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al actualizar catálogo');
    }
  };

  const totals = previewResult?.controlTotals;

  return (
    <div className="space-y-6">
      {/* Encabezado Ejecutivo y Sub-navegación */}
      <div className="p-5 rounded-3xl glass-panel border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[#00D1FF]" />
            <h2 className="text-lg font-bold text-white">
              Motor Automatizado de Reporte a Círculo de Crédito (`001496_MICROFINANCIERACRUSE`)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Generación determinista desde PostgreSQL 16 (`READ ONLY`), Cifras de Control exactas con Decimal.js y Sello WORM SHA-256 (RN-05 / RN-06).
          </p>
        </div>

        <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-900/80 border border-white/10">
          <button
            onClick={() => setSubTab('generator')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'generator' ? 'bg-[#249E82] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Generador & Corte Mensual
          </button>
          <button
            onClick={() => setSubTab('history')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'history' ? 'bg-[#396CAE] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Historial WORM ({historicalReports.length})
          </button>
          <button
            onClick={() => setSubTab('catalogs')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'catalogs' ? 'bg-[#D4AF37]/80 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Catálogos SIC ({catalogs.length})
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {subTab === 'generator' && (
        <div className="space-y-6">
          {/* Controles de Fecha de Corte y Botones de Exportación */}
          <div className="p-5 rounded-3xl glass-card border border-white/10 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                  Fecha de Corte Oficial (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  value={cutoffDate}
                  onChange={(e) => setCutoffDate(e.target.value)}
                  className="px-3.5 py-2 rounded-xl glass-input text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                  Universo de Cartera
                </label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as CreditBureauPersonScope)}
                  className="px-3.5 py-2 rounded-xl glass-input text-xs text-white focus:outline-none"
                >
                  <option value="ALL">Todas las Cuentas (PF + PM)</option>
                  <option value="PF">Personas Físicas (CI-04-0009 PF)</option>
                  <option value="PM">Personas Morales (Formato PM)</option>
                </select>
              </div>

              <button
                onClick={handlePreview}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-2 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Recalcular Previsualización</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => handleGenerateAndDownload('CSV_PF')}
                disabled={sealing || loading}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#249E82] to-emerald-600 hover:from-[#1f8a71] hover:to-emerald-500 text-white text-xs font-bold shadow-lg shadow-[#249E82]/25 flex items-center gap-2 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Sellar y Descargar CSV Oficial (`001496...csv`)</span>
              </button>

              <button
                onClick={() => handleGenerateAndDownload('PIPE_PF')}
                disabled={sealing || loading}
                className="px-4 py-2 rounded-xl bg-[#396CAE] hover:bg-[#2f5b94] text-white text-xs font-bold flex items-center gap-2 transition-all"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Descargar Layout Pipe (`.txt`)</span>
              </button>
            </div>
          </div>

          {/* Tarjetas de Cifras de Control Oficiales */}
          {totals && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/30">
                <p className="text-[11px] text-slate-400 uppercase font-mono">Cuentas Reportadas</p>
                <p className="text-2xl font-bold text-white mt-1">{totals.totalAccountsReported}</p>
                <p className="text-[11px] text-cyan-400 mt-1">
                  PF: {totals.totalPfAccounts} · PM: {totals.totalPmAccounts}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/30">
                <p className="text-[11px] text-slate-400 uppercase font-mono">Total Saldos Actuales</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">
                  ${Number(totals.totalCurrentBalance).toLocaleString('es-MX')} MXN
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Entero exacto sin decimales (SIC)</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-amber-500/30">
                <p className="text-[11px] text-slate-400 uppercase font-mono">Total Saldos Vencidos</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">
                  ${Number(totals.totalPastDueBalance).toLocaleString('es-MX')} MXN
                </p>
                <p className="text-[11px] text-amber-300/80 mt-1">
                  Cobranza Extrajudicial (RN-05): {totals.totalFrozenExtrajudicialAccounts}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-indigo-500/30">
                <p className="text-[11px] text-slate-400 uppercase font-mono">Archivo & Sello SHA-256</p>
                <p className="text-xs font-mono font-bold text-indigo-300 mt-1 truncate">
                  {previewResult?.officialFileNameBase}
                </p>
                <p className="text-[10px] font-mono text-slate-400 mt-1.5 flex items-center gap-1">
                  <Hash className="w-3 h-3 text-emerald-400" />
                  {previewResult?.manifestHash.slice(0, 20)}...
                </p>
              </div>
            </div>
          )}

          {/* Tabla de Previsualización Determinista (Enmascarada Zero-PII) */}
          <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden">
            <div className="px-5 py-3.5 bg-white/5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">
                  Previsualización de Cuentas a Reportar (PII Enmascarado — Guardrail Forense 4)
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Mostrando {previewResult?.previewRows.length ?? 0} registros activos
              </span>
            </div>

            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 border-b border-white/10 text-slate-400 uppercase font-mono text-[10px] sticky top-0">
                  <tr>
                    <th className="py-3 px-4">Contrato</th>
                    <th className="py-3 px-4">Convenio</th>
                    <th className="py-3 px-4">Acreditado (Masked)</th>
                    <th className="py-3 px-4">CURP / RFC Protegido</th>
                    <th className="py-3 px-4">Frec. / Plazo</th>
                    <th className="py-3 px-4 text-right">Crédito Máx.</th>
                    <th className="py-3 px-4 text-right">Saldo Actual</th>
                    <th className="py-3 px-4 text-center">Pago Actual</th>
                    <th className="py-3 px-4 text-center">Obs. SIC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(previewResult?.previewRows ?? []).slice(0, 60).map((row) => (
                    <tr key={row.loanAccountId} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-4 font-mono font-bold text-[#00D1FF]">
                        {row.contractNumber}
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">{row.convenio}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-200">{row.maskedName}</td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                        {row.curpMasked}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-300">
                        {row.paymentFrequencySic} · {row.termPeriods}p ({row.termMonthsSic}d)
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-300">
                        ${Number(row.originalPrincipal).toLocaleString('es-MX')}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-400">
                        ${Number(row.currentBalance).toLocaleString('es-MX')}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                            row.paymentStatusSic === 'V'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {row.paymentStatusSic}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono text-slate-400">
                        {row.observationCode ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'history' && (
        <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden">
          <div className="px-5 py-3.5 bg-white/5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#00D1FF]" />
              <span className="text-xs font-bold text-white">
                Lotes Históricos Sellados en `credit_bureau_reports` (WORM Inmutable)
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-3 px-4">Folio Reporte</th>
                  <th className="py-3 px-4">Periodo Reportado</th>
                  <th className="py-3 px-4">Fecha de Sellado</th>
                  <th className="py-3 px-4 text-right">Cuentas Detalladas</th>
                  <th className="py-3 px-4 text-right">Saldo Total Reportado</th>
                  <th className="py-3 px-4">Sello Criptográfico SHA-256</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {historicalReports.map((rep) => (
                  <tr key={rep.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-mono font-bold text-[#00D1FF]">{rep.id}</td>
                    <td className="py-3 px-4 font-mono text-white">{rep.reportingMonth}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {rep.createdAt.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-200">
                      {rep.totalAccounts}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      ${Number(rep.totalReportedBalance).toLocaleString('es-MX')} MXN
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {rep.manifestHash.slice(0, 18)}...{rep.manifestHash.slice(-8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'catalogs' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-3xl glass-panel border border-white/10 overflow-hidden">
            <div className="px-5 py-3.5 bg-white/5 border-b border-white/10">
              <span className="text-xs font-bold text-white">
                Catálogos Oficiales de Círculo de Crédito (`credit_bureau_catalogs` — RN-06)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Grupo</th>
                    <th className="py-3 px-4">Clave</th>
                    <th className="py-3 px-4">Descripción Oficial</th>
                    <th className="py-3 px-4">Estatus</th>
                    <th className="py-3 px-4">Actualizado Por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {catalogs.map((cat) => (
                    <tr key={cat.id} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-4 font-mono text-slate-300">{cat.catalogGroup}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-[#D4AF37]">{cat.code}</td>
                      <td className="py-2.5 px-4 text-slate-200">{cat.description}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            cat.active
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-rose-500/15 text-rose-400'
                          }`}
                        >
                          {cat.active ? 'ACTIVO' : 'INACTIVO'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                        {cat.updatedBy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {isAdmin && (
            <form
              onSubmit={handleSaveCatalog}
              className="p-5 rounded-3xl glass-card border border-white/10 space-y-4 self-start"
            >
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="text-sm font-bold text-white">
                  Agregar / Editar Clave Oficial SIC (RN-06)
                </h3>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Grupo de Catálogo</label>
                <select
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                >
                  <option value="OBSERVATION_CODE">OBSERVATION_CODE (Claves Observación)</option>
                  <option value="ACCOUNT_TYPE">ACCOUNT_TYPE (Tipos de Cuenta)</option>
                  <option value="CONTRACT_TYPE">CONTRACT_TYPE (Tipos de Contrato)</option>
                  <option value="PAYMENT_FREQUENCY">PAYMENT_FREQUENCY (Frecuencias)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Clave Oficial (Ej. CC, SG, UP)</label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="Ej. CV"
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Descripción Oficial</label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Descripción del manual de Círculo de Crédito"
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newActive}
                  onChange={(e) => setNewActive(e.target.checked)}
                />
                <span>Clave vigente para reportes mensuales</span>
              </label>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#c29d2f] text-slate-950 font-bold text-xs transition-all"
              >
                Guardar Clave en Catálogo SIC
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
