/**
 * VISTA EJECUTIVA DE REPORTE A CÍRCULO DE CRÉDITO (SIC) Y CATÁLOGOS OFICIALES
 * Expediente: CRUSE-APO-2026-024 / CRUSE-APO-2026-060 (RN-05, RN-06)
 *
 * - Guardrail 1 & 2: Aislamiento absoluto de filtrado óptico (`filteredPreviewRows`) sin mutar `controlTotals` ni `manifestHash`.
 * - Guardrail 3: Memoización estricta (`useMemo`) en `[previewResult?.previewRows, searchQuery]`.
 * - Guardrail 4 (Anti-God-Object): `< 450` líneas con extracción de `CreditBureauHistoryAndCatalogsPanel`.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileSpreadsheet,
  ShieldCheck,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Hash,
  Search,
  X,
} from 'lucide-react';
import {
  AuthSession,
  CreditBureauCatalogItem,
  CreditBureauGenerateResult,
  CreditBureauPersonScope,
  CreditBureauReportRecord,
} from '../../types';
import {
  CreditBureauHistoryAndCatalogsPanel,
  SaveCatalogPayload,
} from './CreditBureauHistoryAndCatalogsPanel';

interface CreditBureauViewProps {
  session: AuthSession;
}

export const CreditBureauView: React.FC<CreditBureauViewProps> = ({ session }) => {
  const [cutoffDate, setCutoffDate] = useState('2026-10-31');
  const [scope, setScope] = useState<CreditBureauPersonScope>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [subTab, setSubTab] = useState<'generator' | 'history' | 'catalogs'>('generator');

  const [previewResult, setPreviewResult] = useState<CreditBureauGenerateResult | null>(null);
  const [historicalReports, setHistoricalReports] = useState<CreditBureauReportRecord[]>([]);
  const [catalogs, setCatalogs] = useState<CreditBureauCatalogItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isAdmin = session.user.role === 'admin';

  const fetchHistoryAndCatalogs = useCallback(async () => {
    try {
      const [repRes, catRes] = await Promise.all([
        fetch('/api/credit-bureau/reports', { headers: { Authorization: `Bearer ${session.token}` } }),
        fetch('/api/credit-bureau/catalogs', { headers: { Authorization: `Bearer ${session.token}` } }),
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ cutoffDate, scope }),
      });
      const data = (await res.json()) as { ok?: boolean; result?: CreditBureauGenerateResult; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? 'Error al previsualizar el corte SIC.');
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

  // Guardrails 1 & 3 (CRUSE-APO-2026-060): Filtrado óptico memoizado exclusivamente sobre previewRows sin mutar controlTotals ni manifestHash
  const filteredPreviewRows = useMemo(() => {
    const rawRows = previewResult?.previewRows ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rawRows;
    return rawRows.filter(
      (row) =>
        row.contractNumber.toLowerCase().includes(q) ||
        row.convenio.toLowerCase().includes(q) ||
        row.maskedName.toLowerCase().includes(q) ||
        row.curpMasked.toLowerCase().includes(q) ||
        (row.observationCode ?? '').toLowerCase().includes(q)
    );
  }, [previewResult?.previewRows, searchQuery]);

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ cutoffDate, scope }),
      });
      const data = (await res.json()) as { ok?: boolean; result?: CreditBureauGenerateResult; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? 'Error al sellar y descargar el layout.');

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

  const handleSaveCatalog = async (payload: SaveCatalogPayload): Promise<boolean> => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/credit-bureau/catalogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Error al guardar catálogo SIC');
      setSuccessMsg('Clave oficial del catálogo SIC actualizada y registrada en Bitácora WORM.');
      await fetchHistoryAndCatalogs();
      return true;
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al actualizar catálogo');
      return false;
    }
  };

  // Guardrails 1 & 2: Cifras de Control Oficiales e Inmutabilidad del Sello Criptográfico
  const totals = previewResult?.controlTotals;

  return (
    <div className="space-y-6">
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
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${subTab === 'generator' ? 'bg-[#249E82] text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Generador & Corte Mensual
          </button>
          <button
            onClick={() => setSubTab('history')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${subTab === 'history' ? 'bg-[#396CAE] text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Historial WORM ({historicalReports.length})
          </button>
          <button
            onClick={() => setSubTab('catalogs')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${subTab === 'catalogs' ? 'bg-[#D4AF37]/80 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
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
        <div className="space-y-4">
          {/* 1. ARRIBA: Tarjetas de Cifras de Control Oficiales (Inmutables ante filtrado local — Guardrails 1 y 2) */}
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

          {/* 2. ABAJO DE LOS CARDS (Pegado a la Tabla): Barra de Búsqueda, Filtros de Corte y Botones de Descarga */}
          <div className="p-5 rounded-3xl glass-card border border-white/10 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
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

            {/* Buscador Rápido sobre la Tabla de Previsualización (Filtro Óptico Local — Guardrails 1 y 3) */}
            <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[260px]">
                <Search className="w-4 h-4 text-[#00D1FF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar lista por Contrato, Convenio, Acreditado enmascarado, CURP o Clave SIC..."
                  className="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#00D1FF]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Mostrando <strong className="text-[#00D1FF]">{filteredPreviewRows.length}</strong> de{' '}
                <strong className="text-white">{previewResult?.previewRows.length ?? 0}</strong> cuentas en previsualización
              </span>
            </div>
          </div>

          {/* 3. Tabla de Previsualización Determinista (Enmascarada Zero-PII) */}
          <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden">
            <div className="px-5 py-3.5 bg-white/5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">
                  Previsualización de Cuentas a Reportar (PII Enmascarado — Guardrail Forense 4)
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {filteredPreviewRows.length} / {previewResult?.previewRows.length ?? 0} registros
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
                  {filteredPreviewRows.slice(0, 60).map((row) => (
                    <tr key={row.loanAccountId} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-4 font-mono font-bold text-[#00D1FF]">{row.contractNumber}</td>
                      <td className="py-2.5 px-4 text-slate-300">{row.convenio}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-200">{row.maskedName}</td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">{row.curpMasked}</td>
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
                        <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold ${row.paymentStatusSic === 'V' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/20 text-amber-300'}`}>
                          {row.paymentStatusSic}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono text-slate-400">{row.observationCode ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(subTab === 'history' || subTab === 'catalogs') && (
        <CreditBureauHistoryAndCatalogsPanel
          subTab={subTab}
          historicalReports={historicalReports}
          catalogs={catalogs}
          isAdmin={isAdmin}
          onSaveCatalog={handleSaveCatalog}
        />
      )}
    </div>
  );
};
