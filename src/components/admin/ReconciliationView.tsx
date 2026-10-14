import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Download,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Play,
  Database,
  ArrowRight,
} from 'lucide-react';
import {
  AuthSession,
  PayrollRecordInput,
  ReconciliationBatch,
  ReconciliationItem,
  ReconciliationProcessResult,
} from '../../types';

interface ReconciliationViewProps {
  session: AuthSession;
  onBatchProcessed?: () => void;
}

export const ReconciliationView: React.FC<ReconciliationViewProps> = ({
  session,
  onBatchProcessed,
}) => {
  const [agreement, setAgreement] = useState<'STSGECH' | 'SUPREMO_TRIBUNAL'>('STSGECH');
  const [period, setPeriod] = useState('2026-10-1Q');
  const [sampleData, setSampleData] = useState<{
    STSGECH: PayrollRecordInput[];
    SUPREMO_TRIBUNAL: PayrollRecordInput[];
  } | null>(null);

  const [activeRecords, setActiveRecords] = useState<PayrollRecordInput[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ReconciliationProcessResult | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadPayloads, setDownloadPayloads] = useState<{
    acta?: string;
    csv?: string;
  }>({});

  // Cargar datos muestra al montar
  useEffect(() => {
    fetch('/api/reconciliation/sample-data')
      .then((r) => r.json())
      .then((data) => {
        setSampleData(data);
        if (data.STSGECH) {
          setActiveRecords(data.STSGECH);
        }
      })
      .catch((err) => console.error('Error cargando muestras:', err));
  }, []);

  const handleSelectAgreement = (ag: 'STSGECH' | 'SUPREMO_TRIBUNAL') => {
    setAgreement(ag);
    setResult(null);
    if (sampleData && sampleData[ag]) {
      setActiveRecords(sampleData[ag]);
    }
  };

  const handleRunReconciliation = async () => {
    if (activeRecords.length === 0) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/reconciliation/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agreementName: agreement,
          fortnightPeriod: period,
          officerEmail: session.user.email,
          records: activeRecords,
          notes: `Lote quincenal ${period} procesado desde consola oficial por ${session.user.name}`,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setResult(data);
        setDownloadPayloads({
          acta: data.signedActaText,
          csv: data.sifCsvText,
        });
        if (onBatchProcessed) {
          onBatchProcessed();
        }
      } else {
        alert(data.error || 'Error al procesar conciliación');
      }
    } catch (err) {
      console.error('Error ejecutando conciliación:', err);
      alert('Error de conexión al procesar el lote quincenal');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadActa = () => {
    if (!downloadPayloads.acta) return;
    const blob = new Blob([downloadPayloads.acta], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CRUSE_ACTA_CONCILIACION_${period}_${agreement}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    if (!downloadPayloads.csv) return;
    const blob = new Blob([downloadPayloads.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LAYOUT_SIF_LOGIC_SYSTEMS_${period}_${agreement}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtrado de partidas
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
      {/* Barra de Configuración de Lote */}
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Convenio:</span>
          <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => handleSelectAgreement('STSGECH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                agreement === 'STSGECH'
                  ? 'bg-[#249E82] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Gobierno Chihuahua (STSGECH)
            </button>
            <button
              onClick={() => handleSelectAgreement('SUPREMO_TRIBUNAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                agreement === 'SUPREMO_TRIBUNAL'
                  ? 'bg-[#396CAE] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Supremo Tribunal
            </button>
          </div>

          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-2">Periodo:</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-[#249E82]"
          >
            <option value="2026-10-1Q">2026-10-1Q (1ra Quincena Octubre 2026)</option>
            <option value="2026-10-2Q">2026-10-2Q (2da Quincena Octubre 2026)</option>
            <option value="2026-11-1Q">2026-11-1Q (1ra Quincena Noviembre 2026)</option>
          </select>
        </div>

        <button
          onClick={handleRunReconciliation}
          disabled={isProcessing || activeRecords.length === 0}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#249E82] to-[#1e856e] hover:from-[#1fa789] hover:to-[#176d5b] text-white text-xs font-bold shadow-lg shadow-[#249E82]/30 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4 fill-white" />
          )}
          <span>Ejecutar Conciliación Automatizada</span>
        </button>
      </div>

      {/* Resumen de Métricas (Solo visible tras procesar) */}
      {result && (
        <div className="space-y-6 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400 font-medium">Total Retenciones Recibidas</span>
              <p className="text-xl font-bold text-white mt-1">
                ${result.summary.totalReceived.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-500">Remitido por el convenio</span>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400 font-medium">Cuotas de Amortización Esperadas</span>
              <p className="text-xl font-bold text-[#00D1FF] mt-1">
                ${result.summary.totalExpected.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-500">Cálculo exacto decimal.js</span>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400 font-medium">Discrepancia Neta</span>
              <p className={`text-xl font-bold mt-1 ${result.summary.netDifference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.summary.netDifference >= 0 ? '+' : ''}${result.summary.netDifference.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-500">Diferencia neta del periodo</span>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <span className="text-[11px] text-slate-400 font-medium">Partidas Auditadas</span>
              <p className="text-xl font-bold text-amber-400 mt-1">
                {result.summary.totalRecords}
              </p>
              <span className="text-[10px] text-slate-500">4 estados deterministas</span>
            </div>
          </div>

          {/* Sello Criptográfico y Acciones de Descarga */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-black/80 via-slate-900/50 to-black/80 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">Lote Sellado Criptográficamente (SHA-256)</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                    Inmutable WORM
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5 break-all">
                  {result.batch.batchManifestHash}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadActa}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-2 transition-colors border border-white/10"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Acta Firmada (.txt)</span>
              </button>
              <button
                onClick={handleDownloadCsv}
                className="px-3.5 py-2 rounded-xl bg-[#396CAE]/20 hover:bg-[#396CAE]/30 text-[#00D1FF] text-xs font-semibold flex items-center gap-2 transition-colors border border-[#396CAE]/30"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Layout SIF/CIB (.csv)</span>
              </button>
            </div>
          </div>

          {/* Filtros de la Matriz de 4 Estados */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap gap-1.5 p-1 bg-black/40 rounded-xl border border-white/5 text-xs font-medium">
              <button
                onClick={() => setFilterStatus('ALL')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  filterStatus === 'ALL' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos ({result.items.length})
              </button>
              <button
                onClick={() => setFilterStatus('MATCH_EXACT')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  filterStatus === 'MATCH_EXACT' ? 'bg-emerald-500 text-white font-bold' : 'text-emerald-400 hover:text-emerald-300'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Exactos ({result.summary.matchExactCount})</span>
              </button>
              <button
                onClick={() => setFilterStatus('DISCREPANCY_UNDERPAYMENT')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  filterStatus === 'DISCREPANCY_UNDERPAYMENT' ? 'bg-amber-500 text-black font-bold' : 'text-amber-400 hover:text-amber-300'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Retención Parcial ({result.summary.underpaymentCount})</span>
              </button>
              <button
                onClick={() => setFilterStatus('MISSING_IN_PAYROLL')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  filterStatus === 'MISSING_IN_PAYROLL' ? 'bg-rose-500 text-white font-bold' : 'text-rose-400 hover:text-rose-300'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Baja No Reportada ({result.summary.missingInPayrollCount})</span>
              </button>
              <button
                onClick={() => setFilterStatus('DISCREPANCY_OVERPAYMENT')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  filterStatus === 'DISCREPANCY_OVERPAYMENT' ? 'bg-[#00D1FF] text-black font-bold' : 'text-[#00D1FF] hover:text-cyan-300'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Excedentes ({result.summary.overpaymentCount})</span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar empleado o CURP..."
                className="bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#249E82]"
              />
            </div>
          </div>

          {/* Tabla Forense de Partidas */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.01] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03] text-slate-400 font-semibold">
                    <th className="py-3 px-4">Empleado</th>
                    <th className="py-3 px-4">CURP Enmascarada</th>
                    <th className="py-3 px-4 text-right">Cuota Esperada</th>
                    <th className="py-3 px-4 text-right">Retención Recibida</th>
                    <th className="py-3 px-4 text-right">Diferencia</th>
                    <th className="py-3 px-4 text-center">Estado Determinista</th>
                    <th className="py-3 px-4">Detalle / Acción Regulatoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredItems.map((item) => {
                    const isExact = item.status === 'MATCH_EXACT';
                    const isUnder = item.status === 'DISCREPANCY_UNDERPAYMENT';
                    const isMissing = item.status === 'MISSING_IN_PAYROLL';
                    const isOver = item.status === 'DISCREPANCY_OVERPAYMENT';

                    return (
                      <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4 font-semibold text-white">{item.employeeName}</td>
                        <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{item.curpMasked}</td>
                        <td className="py-3 px-4 text-right text-slate-300">
                          ${item.expectedPayment.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-white">
                          ${item.actualPayment.toFixed(2)}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono font-bold ${
                          item.difference === 0 ? 'text-emerald-400' : item.difference < 0 ? 'text-rose-400' : 'text-cyan-400'
                        }`}>
                          {item.difference > 0 ? '+' : ''}${item.difference.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isExact && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle className="w-3 h-3" /> Exacto
                            </span>
                          )}
                          {isUnder && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <AlertTriangle className="w-3 h-3" /> Parcial
                            </span>
                          )}
                          {isMissing && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              <AlertCircle className="w-3 h-3" /> Baja No Reportada
                            </span>
                          )}
                          {isOver && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              <TrendingUp className="w-3 h-3" /> Excedente
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px] max-w-xs truncate" title={item.auditNotes}>
                          {item.auditNotes}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Estado previo: Registros a conciliar en espera */}
      {!result && (
        <div className="p-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.01] text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-[#00D1FF]">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Lote de Nómina Cargado: {agreement === 'STSGECH' ? 'Gobierno del Estado (STSGECH)' : 'Supremo Tribunal'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              {activeRecords.length} registros listos para cruce determinista contra la cartera de créditos y cálculo de amortización quincenal libre de drift.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={handleRunReconciliation}
              disabled={isProcessing}
              className="px-6 py-2.5 rounded-xl bg-[#249E82] hover:bg-[#1fa789] text-white text-xs font-bold shadow-lg shadow-[#249E82]/30 inline-flex items-center gap-2 transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Procesar {activeRecords.length} Registros y Sellar Lote</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
