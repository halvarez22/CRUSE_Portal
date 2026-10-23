/**
 * CONSOLA EJECUTIVA DE CORTE QUINCENAL DE NÓMINA, EMISIÓN SINDICAL, DRY-RUN Y SELLADO WORM
 *
 * @implements CRUSE-APO-2026-026 (Catálogo dinámico de convenios, Emisión Sindical RN-07 con "SUSPENSION",
 *   Ingesta CSV/TXT Multi-Crédito RN-10, Previsualización Dry-Run con sourceFileHash SHA-256 y Sellado WORM)
 * @implements RN-13 (Integración con ManualOverrideModal para partidas DISCREPANCY_UNDERPAYMENT)
 * @implements Regla 3 Anti-God-Object (< 600 líneas y tipado estricto TypeScript)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Download,
  ShieldCheck,
  RefreshCw,
  Search,
  TrendingUp,
  AlertTriangle,
  Play,
  Database,
  Sliders,
  Upload,
  Eye,
  PauseCircle,
  FileCheck2,
} from 'lucide-react';
import {
  AuthSession,
  ConvenioCatalogItem,
  PayrollIngestionPreviewResult,
  ReconciliationItem,
  ReconciliationProcessResult,
} from '../../types';
import { ManualOverrideModal } from './ManualOverrideModal';

interface ReconciliationViewProps {
  session: AuthSession;
  onBatchProcessed?: () => void;
}

const PERIOD_OPTIONS = [
  { value: '2026-10-1Q', label: '2026-10-1Q (1ra Quincena Octubre 2026)' },
  { value: '2026-10-2Q', label: '2026-10-2Q (2da Quincena Octubre 2026)' },
  { value: '2026-11-1Q', label: '2026-11-1Q (1ra Quincena Noviembre 2026)' },
  { value: '2026-11-2Q', label: '2026-11-2Q (2da Quincena Noviembre 2026)' },
  { value: '2026-12-1Q', label: '2026-12-1Q (1ra Quincena Diciembre 2026)' },
];

export const ReconciliationView: React.FC<ReconciliationViewProps> = ({
  session,
  onBatchProcessed,
}) => {
  const [convenios, setConvenios] = useState<ConvenioCatalogItem[]>([]);
  const [agreement, setAgreement] = useState<string>('STSGECH');
  const [period, setPeriod] = useState<string>('2026-10-2Q');
  const [csvContent, setCsvContent] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isLoadingTemplate, setIsLoadingTemplate] = useState<boolean>(false);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [isSealing, setIsSealing] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<PayrollIngestionPreviewResult | null>(null);
  const [sealedResult, setSealedResult] = useState<ReconciliationProcessResult | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [downloadPayloads, setDownloadPayloads] = useState<{ acta?: string; csv?: string }>({});
  const [selectedOverrideItem, setSelectedOverrideItem] = useState<ReconciliationItem | null>(null);
  const [overrideFeedback, setOverrideFeedback] = useState<Record<string, string>>({});

  const downloadFile = (content: string | undefined, filename: string, mime: string) => {
    if (!content) return;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadConvenios = useCallback(async () => {
    try {
      const res = await fetch('/api/reconciliation/convenios', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.convenios)) {
        setConvenios(data.convenios);
        if (data.convenios.length > 0 && !data.convenios.some((c: ConvenioCatalogItem) => c.code === agreement)) {
          setAgreement(data.convenios[0].code);
        }
      }
    } catch {
      // Mantiene fallback STSGECH si la red tarda
    }
  }, [session.token, agreement]);

  const loadEmissionTemplateIntoBuffer = useCallback(
    async (targetAgreement: string, targetPeriod: string, triggerDownload: boolean) => {
      setIsLoadingTemplate(true);
      setErrorBanner(null);
      try {
        const q = new URLSearchParams({ agreementName: targetAgreement, fortnightPeriod: targetPeriod });
        const res = await fetch(`/api/reconciliation/emission-layout?${q.toString()}`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setErrorBanner(data.error || 'No se pudo generar el layout de emisión sindical.');
          return;
        }
        setCsvContent(data.csvContent || '');
        setUploadedFileName(`EMISION_${targetPeriod}_${targetAgreement}.csv`);
        setPreviewResult(null);
        setSealedResult(null);
        if (triggerDownload && data.csvContent) {
          downloadFile(data.csvContent, `EMISION_SINDICAL_${targetPeriod}_${targetAgreement}.csv`, 'text/csv;charset=utf-8');
        }
      } catch {
        setErrorBanner('Error de red al consultar el layout de emisión del convenio.');
      } finally {
        setIsLoadingTemplate(false);
      }
    },
    [session.token]
  );

  useEffect(() => {
    void loadConvenios();
    void loadEmissionTemplateIntoBuffer('STSGECH', '2026-10-2Q', false);
  }, [loadConvenios, loadEmissionTemplateIntoBuffer]);

  const handleSelectAgreement = (code: string) => {
    setAgreement(code);
    setPreviewResult(null);
    setSealedResult(null);
    setErrorBanner(null);
    void loadEmissionTemplateIntoBuffer(code, period, false);
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    setPreviewResult(null);
    setSealedResult(null);
    setErrorBanner(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorBanner(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
      setCsvContent(text);
      setUploadedFileName(file.name);
      setPreviewResult(null);
      setSealedResult(null);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleRunDryRunPreview = async () => {
    if (!csvContent.trim()) {
      setErrorBanner('Cargue un archivo CSV/TXT o genere la plantilla desde la cartera viva.');
      return;
    }
    setIsPreviewing(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/reconciliation/ingest-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ agreementName: agreement, fortnightPeriod: period, csvContent }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.preview) {
        setPreviewResult(data.preview);
        setSealedResult(null);
      } else {
        setErrorBanner(data.error || 'Error al previsualizar el archivo de nómina.');
      }
    } catch {
      setErrorBanner('Error de conexión durante la previsualización Dry-Run.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSealReconciliationBatch = async () => {
    if (!csvContent.trim() && !previewResult?.sourceFileHash) return;
    setIsSealing(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/reconciliation/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          agreementName: agreement,
          fortnightPeriod: period,
          csvContent,
          expectedSourceFileHash: previewResult?.sourceFileHash,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSealedResult(data);
        setDownloadPayloads({ acta: data.signedActaText, csv: data.sifCsvText });
        void loadConvenios();
        if (onBatchProcessed) onBatchProcessed();
      } else {
        setErrorBanner(data.error || 'Error al sellar el corte quincenal en WORM.');
      }
    } catch {
      setErrorBanner('Error de conexión al sellar el lote quincenal.');
    } finally {
      setIsSealing(false);
    }
  };

  const activeConvenioMeta = convenios.find((c) => c.code === agreement);
  const activeDisplayData = sealedResult
    ? {
        isSealed: true,
        sourceFileHash: sealedResult.sourceFileHash ?? previewResult?.sourceFileHash ?? '',
        manifestHash: sealedResult.batch.batchManifestHash,
        batchId: sealedResult.batch.id,
        summary: sealedResult.summary,
        items: sealedResult.items,
        warnings: [] as string[],
      }
    : previewResult
      ? {
          isSealed: false,
          sourceFileHash: previewResult.sourceFileHash,
          manifestHash: 'PENDIENTE DE SELLADO WORM (MODO PREVISUALIZACIÓN DRY-RUN)',
          batchId: 'DRY-RUN',
          summary: previewResult.summary,
          items: previewResult.items,
          warnings: previewResult.warnings,
        }
      : null;

  const filteredItems = activeDisplayData
    ? activeDisplayData.items.filter((item) => {
        const matchesFilter = filterStatus === 'ALL' || item.status === filterStatus;
        const matchesSearch =
          searchTerm === '' ||
          item.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.curpMasked.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.contractNumber ?? '').toLowerCase().includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
      })
    : [];

  const convenioList: ConvenioCatalogItem[] =
    convenios.length > 0
      ? convenios
      : [
          {
            code: 'STSGECH',
            displayName: 'Gobierno Chihuahua (STSGECH)',
            defaultFrequency: 'QUINCENAL',
            chargesLifeInsurance: true,
            sendsUnionLetter: true,
            activeLoansCount: 0,
            suspendedLeaveCount: 0,
            expectedFortnightlyTotal: '0.00',
          },
        ];

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 uppercase">Convenio Activo:</span>
            <div className="flex flex-wrap gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
              {convenioList.map((conv) => (
                <button
                  key={conv.code}
                  onClick={() => handleSelectAgreement(conv.code)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    agreement === conv.code ? 'bg-[#249E82] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {conv.displayName} ({conv.activeLoansCount})
                </button>
              ))}
            </div>

            <span className="text-xs font-semibold text-slate-400 uppercase ml-2">Periodo:</span>
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void loadEmissionTemplateIntoBuffer(agreement, period, true)}
              disabled={isLoadingTemplate}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-[#00D1FF]" />
              <span>Emitir Layout Sindical (.csv)</span>
            </button>

            <label className="px-3.5 py-2 rounded-xl bg-[#396CAE]/25 hover:bg-[#396CAE]/40 border border-[#00D1FF]/30 text-[#00D1FF] text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Subir Layout Retención (.csv/.txt)</span>
              <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-300 flex flex-wrap items-center gap-3">
            <span className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 font-mono text-[11px] text-[#00D1FF]">
              Archivo: {uploadedFileName || 'Sin archivo'}
            </span>
            {activeConvenioMeta && (
              <span className="text-slate-400">
                Cartera Viva: <strong className="text-white">{activeConvenioMeta.activeLoansCount}</strong> activos •{' '}
                <strong className="text-amber-300">{activeConvenioMeta.suspendedLeaveCount}</strong> en licencia (RN-07) • Cuota Esperada:{' '}
                <strong className="text-emerald-400">${activeConvenioMeta.expectedFortnightlyTotal}</strong>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleRunDryRunPreview}
              disabled={isPreviewing || isSealing || !csvContent.trim()}
              className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              {isPreviewing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              <span>1. Previsualizar Corte (Dry-Run)</span>
            </button>

            <button
              onClick={handleSealReconciliationBatch}
              disabled={isSealing || isPreviewing || !csvContent.trim() || Boolean(sealedResult)}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#249E82] to-[#1e856e] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {isSealing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
              <span>2. Confirmar y Sellar Corte WORM</span>
            </button>
          </div>
        </div>
      </div>

      {errorBanner && (
        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5 whitespace-pre-line">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>{errorBanner}</div>
        </div>
      )}

      {activeDisplayData ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400">Total Retenciones Recibidas</span>
              <p className="text-xl font-bold text-white mt-1">${activeDisplayData.summary.totalReceived.toFixed(2)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400">Cuotas Esperadas (Activos)</span>
              <p className="text-xl font-bold text-[#00D1FF] mt-1">${activeDisplayData.summary.totalExpected.toFixed(2)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400">Discrepancia Neta</span>
              <p className={`text-xl font-bold mt-1 ${activeDisplayData.summary.netDifference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${activeDisplayData.summary.netDifference.toFixed(2)}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400">Partidas Proyectadas</span>
              <p className="text-xl font-bold text-amber-400 mt-1">{activeDisplayData.summary.totalRecords}</p>
            </div>
          </div>

          {activeDisplayData.warnings.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs space-y-1">
              {activeDisplayData.warnings.map((w, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div
            className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
              activeDisplayData.isSealed ? 'bg-slate-900/60 border-emerald-500/30' : 'bg-slate-900/40 border-amber-500/30'
            }`}
          >
            <div className="flex items-center gap-3">
              {activeDisplayData.isSealed ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <FileCheck2 className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white">
                  {activeDisplayData.isSealed
                    ? `Lote Sellado Criptográficamente en WORM (${activeDisplayData.batchId})`
                    : 'Previsualización Determinista (Dry-Run) — Lista para Sellado WORM'}
                </span>
                <p className="text-[11px] text-slate-400 font-mono break-all">
                  Archivo Fuente SHA-256: {activeDisplayData.sourceFileHash}
                </p>
                {activeDisplayData.isSealed && (
                  <p className="text-[11px] text-emerald-300 font-mono break-all">
                    Manifiesto WORM SHA-256: {activeDisplayData.manifestHash}
                  </p>
                )}
              </div>
            </div>

            {activeDisplayData.isSealed && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadFile(downloadPayloads.acta, `ACTA_${period}_${agreement}.txt`, 'text/plain;charset=utf-8')}
                  className="px-3 py-1.5 rounded-xl bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" /> Acta (.txt)
                </button>
                <button
                  onClick={() => downloadFile(downloadPayloads.csv, `SIF_${period}_${agreement}.csv`, 'text/csv;charset=utf-8')}
                  className="px-3 py-1.5 rounded-xl bg-[#396CAE]/20 text-[#00D1FF] text-xs font-semibold flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Layout SIF (.csv)
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5 p-1 bg-black/40 rounded-xl border border-white/5 text-xs">
              <button onClick={() => setFilterStatus('ALL')} className={`px-3 py-1 rounded-lg ${filterStatus === 'ALL' ? 'bg-white/20 text-white' : 'text-slate-400'}`}>
                Todos ({activeDisplayData.items.length})
              </button>
              <button onClick={() => setFilterStatus('MATCH_EXACT')} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${filterStatus === 'MATCH_EXACT' ? 'bg-emerald-500 text-white font-bold' : 'text-emerald-400'}`}>
                <CheckCircle className="w-3.5 h-3.5" /> Exactos ({activeDisplayData.summary.matchExactCount})
              </button>
              <button onClick={() => setFilterStatus('DISCREPANCY_UNDERPAYMENT')} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${filterStatus === 'DISCREPANCY_UNDERPAYMENT' ? 'bg-amber-500 text-black font-bold' : 'text-amber-400'}`}>
                <AlertTriangle className="w-3.5 h-3.5" /> Parcial ({activeDisplayData.summary.underpaymentCount})
              </button>
              <button onClick={() => setFilterStatus('MISSING_IN_PAYROLL')} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${filterStatus === 'MISSING_IN_PAYROLL' ? 'bg-rose-500 text-white font-bold' : 'text-rose-400'}`}>
                <AlertCircle className="w-3.5 h-3.5" /> Baja ({activeDisplayData.summary.missingInPayrollCount})
              </button>
              <button onClick={() => setFilterStatus('SUSPENDED_IN_PAYROLL')} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${filterStatus === 'SUSPENDED_IN_PAYROLL' ? 'bg-purple-500 text-white font-bold' : 'text-purple-300'}`}>
                <PauseCircle className="w-3.5 h-3.5" /> Licencia RN-07 ({activeDisplayData.summary.suspendedInPayrollCount ?? 0})
              </button>
              <button onClick={() => setFilterStatus('DISCREPANCY_OVERPAYMENT')} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${filterStatus === 'DISCREPANCY_OVERPAYMENT' ? 'bg-[#00D1FF] text-black font-bold' : 'text-[#00D1FF]'}`}>
                <TrendingUp className="w-3.5 h-3.5" /> Excedentes ({activeDisplayData.summary.overpaymentCount})
              </button>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar contrato o CURP..."
                className="bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.01] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-slate-400 font-semibold">
                  <th className="py-3 px-4">Empleado (Zero-PII)</th>
                  <th className="py-3 px-4">CURP Enmascarada</th>
                  <th className="py-3 px-4 text-right">Cuota Esperada</th>
                  <th className="py-3 px-4 text-right">Retención Recibida</th>
                  <th className="py-3 px-4 text-right">Diferencia</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4">Acción Regulatoria / RN-13</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-semibold text-white">{item.employeeName}</td>
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{item.curpMasked}</td>
                    <td className="py-3 px-4 text-right text-slate-300">${item.expectedPayment.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right font-medium text-white">${item.actualPayment.toFixed(2)}</td>
                    <td className={`py-3 px-4 text-right font-mono font-bold ${item.difference === 0 ? 'text-emerald-400' : item.difference < 0 ? 'text-rose-400' : 'text-cyan-400'}`}>
                      {item.difference > 0 ? '+' : ''}${item.difference.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-200">{item.status}</span>
                    </td>
                    <td className="py-3 px-4 text-[11px]">
                      {overrideFeedback[item.id] ? (
                        <span className="text-emerald-400 font-semibold">{overrideFeedback[item.id]}</span>
                      ) : activeDisplayData.isSealed && item.status === 'DISCREPANCY_UNDERPAYMENT' ? (
                        <button
                          onClick={() => setSelectedOverrideItem(item)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold inline-flex items-center gap-1"
                        >
                          <Sliders className="w-3 h-3" /> Desglose Manual (RN-13)
                        </button>
                      ) : (
                        <span className="text-slate-400">{item.auditNotes || 'Prelación automática WORM'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.01] text-center space-y-3">
          <Database className="w-8 h-8 text-[#00D1FF] mx-auto" />
          <h3 className="text-sm font-bold text-white">
            Layout de Retención Listo ({csvContent ? csvContent.trim().split(/\r?\n/).length - 1 : 0} partidas en memoria)
          </h3>
          <p className="text-xs text-slate-400 max-w-xl mx-auto">
            Haga clic en <strong>&ldquo;1. Previsualizar Corte (Dry-Run)&rdquo;</strong> para validar el hash SHA-256 del archivo fuente y verificar la distribución Multi-Crédito antes del sellado WORM.
          </p>
        </div>
      )}

      <ManualOverrideModal
        isOpen={Boolean(selectedOverrideItem)}
        item={selectedOverrideItem}
        batchId={sealedResult?.batch.id ?? ''}
        fortnightPeriod={period}
        token={session.token}
        onClose={() => setSelectedOverrideItem(null)}
        onSuccess={(msg) => {
          if (selectedOverrideItem) setOverrideFeedback((prev) => ({ ...prev, [selectedOverrideItem.id]: msg }));
        }}
      />
    </div>
  );
};
