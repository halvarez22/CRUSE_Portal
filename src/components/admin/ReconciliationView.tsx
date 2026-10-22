/**
 * CONSOLA OFICIAL DE CONCILIACIÓN QUINCENAL Y DESGLOSE MANUAL (RN-13)
 *
 * @implements RN-13 (Integración con ManualOverrideModal para partidas DISCREPANCY_UNDERPAYMENT)
 * @implements Guardrail Forense 4 (< 295 líneas y 0 any)
 */

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
  AuthSession,
  PayrollRecordInput,
  ReconciliationItem,
  ReconciliationProcessResult,
} from '../../types';
import { ManualOverrideModal } from './ManualOverrideModal';

interface ReconciliationViewProps {
  session: AuthSession;
  onBatchProcessed?: () => void;
}

export const ReconciliationView: React.FC<ReconciliationViewProps> = ({ session, onBatchProcessed }) => {
  const [agreement, setAgreement] = useState<'STSGECH' | 'SUPREMO_TRIBUNAL'>('STSGECH');
  const [period, setPeriod] = useState('2026-10-1Q');
  const [sampleData, setSampleData] = useState<{ STSGECH: PayrollRecordInput[]; SUPREMO_TRIBUNAL: PayrollRecordInput[] } | null>(null);
  const [activeRecords, setActiveRecords] = useState<PayrollRecordInput[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ReconciliationProcessResult | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadPayloads, setDownloadPayloads] = useState<{ acta?: string; csv?: string }>({});
  const [selectedOverrideItem, setSelectedOverrideItem] = useState<ReconciliationItem | null>(null);
  const [overrideFeedback, setOverrideFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/reconciliation/sample-data', { headers: { Authorization: `Bearer ${session.token}` } })
      .then((r) => r.json())
      .then((data) => {
        setSampleData(data);
        if (data.STSGECH) setActiveRecords(data.STSGECH);
      })
      .catch((err) => console.error('Error cargando muestras:', err));
  }, [session.token]);

  const handleSelectAgreement = (ag: 'STSGECH' | 'SUPREMO_TRIBUNAL') => {
    setAgreement(ag);
    setResult(null);
    if (sampleData && sampleData[ag]) setActiveRecords(sampleData[ag]);
  };

  const handleRunReconciliation = async () => {
    if (activeRecords.length === 0) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/reconciliation/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ agreementName: agreement, fortnightPeriod: period, records: activeRecords }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(data);
        setDownloadPayloads({ acta: data.signedActaText, csv: data.sifCsvText });
        if (onBatchProcessed) onBatchProcessed();
      } else {
        alert(data.error || 'Error al procesar conciliación');
      }
    } catch {
      alert('Error de conexión al procesar el lote quincenal');
    } finally {
      setIsProcessing(false);
    }
  };

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

  const filteredItems = result
    ? result.items.filter((item) => {
        const matchesFilter = filterStatus === 'ALL' || item.status === filterStatus;
        const matchesSearch =
          searchTerm === '' ||
          item.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.curpMasked.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-400 uppercase">Convenio:</span>
          <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
            {(['STSGECH', 'SUPREMO_TRIBUNAL'] as const).map((ag) => (
              <button key={ag} onClick={() => handleSelectAgreement(ag)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${agreement === ag ? 'bg-[#249E82] text-white' : 'text-slate-400 hover:text-white'}`}>
                {ag === 'STSGECH' ? 'Gobierno Chihuahua (STSGECH)' : 'Supremo Tribunal'}
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase ml-2">Periodo:</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white">
            <option value="2026-10-1Q">2026-10-1Q (1ra Quincena Octubre 2026)</option>
            <option value="2026-10-2Q">2026-10-2Q (2da Quincena Octubre 2026)</option>
            <option value="2026-11-1Q">2026-11-1Q (1ra Quincena Noviembre 2026)</option>
          </select>
        </div>

        <button onClick={handleRunReconciliation} disabled={isProcessing || activeRecords.length === 0} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#249E82] to-[#1e856e] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">
          {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
          <span>Ejecutar Conciliación Automatizada</span>
        </button>
      </div>

      {result ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400">Total Retenciones Recibidas</span>
              <p className="text-xl font-bold text-white mt-1">${result.summary.totalReceived.toFixed(2)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400">Cuotas Esperadas</span>
              <p className="text-xl font-bold text-[#00D1FF] mt-1">${result.summary.totalExpected.toFixed(2)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400">Discrepancia Neta</span>
              <p className={`text-xl font-bold mt-1 ${result.summary.netDifference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${result.summary.netDifference.toFixed(2)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400">Partidas Auditadas</span>
              <p className="text-xl font-bold text-amber-400 mt-1">{result.summary.totalRecords}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <div>
                <span className="text-xs font-bold text-white">Lote Sellado Criptográficamente (WORM SHA-256)</span>
                <p className="text-[11px] text-slate-400 font-mono break-all">{result.batch.batchManifestHash}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => downloadFile(downloadPayloads.acta, `ACTA_${period}_${agreement}.txt`, 'text/plain;charset=utf-8')} className="px-3 py-1.5 rounded-xl bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-emerald-400" /> Acta (.txt)
              </button>
              <button onClick={() => downloadFile(downloadPayloads.csv, `SIF_${period}_${agreement}.csv`, 'text/csv;charset=utf-8')} className="px-3 py-1.5 rounded-xl bg-[#396CAE]/20 text-[#00D1FF] text-xs font-semibold flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Layout SIF (.csv)
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5 p-1 bg-black/40 rounded-xl border border-white/5 text-xs">
              <button onClick={() => setFilterStatus('ALL')} className={`px-3 py-1 rounded-lg ${filterStatus === 'ALL' ? 'bg-white/20 text-white' : 'text-slate-400'}`}>Todos ({result.items.length})</button>
              <button onClick={() => setFilterStatus('MATCH_EXACT')} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${filterStatus === 'MATCH_EXACT' ? 'bg-emerald-500 text-white font-bold' : 'text-emerald-400'}`}><CheckCircle className="w-3.5 h-3.5" /> Exactos ({result.summary.matchExactCount})</button>
              <button onClick={() => setFilterStatus('DISCREPANCY_UNDERPAYMENT')} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${filterStatus === 'DISCREPANCY_UNDERPAYMENT' ? 'bg-amber-500 text-black font-bold' : 'text-amber-400'}`}><AlertTriangle className="w-3.5 h-3.5" /> Parcial ({result.summary.underpaymentCount})</button>
              <button onClick={() => setFilterStatus('MISSING_IN_PAYROLL')} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${filterStatus === 'MISSING_IN_PAYROLL' ? 'bg-rose-500 text-white font-bold' : 'text-rose-400'}`}><AlertCircle className="w-3.5 h-3.5" /> Baja ({result.summary.missingInPayrollCount})</button>
              <button onClick={() => setFilterStatus('DISCREPANCY_OVERPAYMENT')} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${filterStatus === 'DISCREPANCY_OVERPAYMENT' ? 'bg-[#00D1FF] text-black font-bold' : 'text-[#00D1FF]'}`}><TrendingUp className="w-3.5 h-3.5" /> Excedentes ({result.summary.overpaymentCount})</button>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar empleado o CURP..." className="bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white" />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.01] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-slate-400 font-semibold">
                  <th className="py-3 px-4">Empleado</th>
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
                      ) : item.status === 'DISCREPANCY_UNDERPAYMENT' ? (
                        <button onClick={() => setSelectedOverrideItem(item)} className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold inline-flex items-center gap-1">
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
          <h3 className="text-sm font-bold text-white">Lote Cargado ({activeRecords.length} registros listos para cruce determinista)</h3>
        </div>
      )}

      <ManualOverrideModal
        isOpen={Boolean(selectedOverrideItem)}
        item={selectedOverrideItem}
        batchId={result?.batch.id ?? ''}
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
