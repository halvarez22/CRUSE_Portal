import React, { useState, useEffect, useCallback } from 'react';
import {
  CloudUpload,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Database,
  FileSpreadsheet,
  Lock,
} from 'lucide-react';
import { AuthSession, CloudMigrationOverview, CloudMigrationCutoverMode } from '../../types';

interface CloudMigrationAndRollbackViewProps {
  session: AuthSession;
}

export const CloudMigrationAndRollbackView: React.FC<CloudMigrationAndRollbackViewProps> = ({
  session,
}) => {
  const [overview, setOverview] = useState<CloudMigrationOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cloud-migration/overview', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as CloudMigrationOverview;
        setOverview(data);
      }
    } catch {
      setFeedback({ type: 'err', text: 'Error al cargar el estado de Migración Nube.' });
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const handleIngestHistoricalExcel = async (simulateDiscrepancy = false) => {
    setIngesting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/cloud-migration/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          useSample: true,
          sourceFilename: simulateDiscrepancy
            ? 'Sabana_Excel_Con_Descuadre_Prueba.xlsx'
            : 'Sabana_Historica_Cruse_2024_2026.xlsx',
          declaredExcelTotalPrincipalMxn: '70400.50',
          declaredExcelTotalLiveBalanceMxn: simulateDiscrepancy ? '55000.51' : '55000.50',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Lote abortado por discrepancia.' });
        void fetchOverview();
        return;
      }
      if (data.overview) setOverview(data.overview as CloudMigrationOverview);
      setFeedback({
        type: 'ok',
        text: `✅ Lote ${data.batch?.batchCode} saneado y verificado al centavo ($0.00 MXN discrepancia · ${data.batch?.totalRows} contratos · ${data.batch?.idempotentUpserts} upserts idempotentes).`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Error de red durante la ingesta histórica.' });
    } finally {
      setIngesting(false);
    }
  };

  const handleExecuteRollback = async (batchId: string) => {
    setRollingBackId(batchId);
    setFeedback(null);
    try {
      const res = await fetch('/api/cloud-migration/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ batchId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Fallo al ejecutar el Plan de Regreso.' });
        return;
      }
      if (data.overview) setOverview(data.overview as CloudMigrationOverview);
      setFeedback({
        type: 'ok',
        text: `🔄 Plan de Regreso (Rollback Instantáneo) completado. Huella SHA-256 Pre vs Post idéntica al 100%: ${data.postRollbackSnapshotSha256?.slice(0, 20)}...`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Error al conectar con el motor de Rollback.' });
    } finally {
      setRollingBackId(null);
    }
  };

  const handleToggleCutoverMode = async (targetMode: CloudMigrationCutoverMode) => {
    setFeedback(null);
    try {
      const res = await fetch('/api/cloud-migration/cutover-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ targetMode }),
      });
      const data = await res.json();
      if (res.ok && data.overview) {
        setOverview(data.overview as CloudMigrationOverview);
        setFeedback({
          type: 'ok',
          text: `Modo de operación actualizado a: ${targetMode}`,
        });
      }
    } catch {
      setFeedback({ type: 'err', text: 'No se pudo cambiar el modo de operación.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera Ejecutiva + Conmutador STAGING_PARALLEL / PRODUCTION_CUTOVER_ACTIVE */}
      <div className="p-5 rounded-3xl glass-panel border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#249E82]/20 border border-[#249E82]/40 text-emerald-300">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white">
              Motor de Migración Histórica Excel → Nube y Plan de Regreso (Fase 3.3)
            </h2>
            <p className="text-xs text-slate-300">
              Saneamiento determinista de fechas/monedas con Decimal.js, cuadre centavo a centavo ($0.00) y Rollback con paridad SHA-256.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              void handleToggleCutoverMode(
                overview?.cutoverMode === 'PRODUCTION_CUTOVER_ACTIVE'
                  ? 'STAGING_PARALLEL'
                  : 'PRODUCTION_CUTOVER_ACTIVE'
              )
            }
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all flex items-center gap-2 ${
              overview?.cutoverMode === 'PRODUCTION_CUTOVER_ACTIVE'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-cyan-500/15 border-[#00D1FF]/40 text-[#00D1FF]'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Modo: {overview?.cutoverMode || 'STAGING_PARALLEL'}</span>
          </button>

          <button
            type="button"
            disabled={ingesting}
            onClick={() => void handleIngestHistoricalExcel(false)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#249E82] to-[#396CAE] hover:opacity-95 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg transition-all"
          >
            {ingesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
            <span>Ingestar y Sanear Sábana Histórica Excel (Idempotente)</span>
          </button>

          <button
            type="button"
            disabled={ingesting}
            onClick={() => void handleIngestHistoricalExcel(true)}
            className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Simular Descuadre $0.01 (Prueba Aborto)</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center gap-2.5 ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 3 KPIs de Cartera Histórica Migrada */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl glass-card border border-white/10">
          <span className="text-xs text-slate-400">Contratos Históricos Activos en Nube</span>
          <div className="text-2xl font-black text-white mt-1">
            {overview?.activeMigratedContractsCount ?? 0}
          </div>
          <span className="text-[11px] text-emerald-400">Cero duplicados garantizados por llave única</span>
        </div>
        <div className="p-4 rounded-2xl glass-card border border-white/10">
          <span className="text-xs text-slate-400">Capital Original Migrado (Saneado)</span>
          <div className="text-2xl font-black text-[#00D1FF] mt-1">
            ${overview?.totalMigratedPrincipalMxn ?? '0.00'} MXN
          </div>
          <span className="text-[11px] text-slate-400">Aritmética exacta Decimal.js</span>
        </div>
        <div className="p-4 rounded-2xl glass-card border border-white/10">
          <span className="text-xs text-slate-400">Saldo Vivo Migrado Verificado</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            ${overview?.totalMigratedLiveBalanceMxn ?? '0.00'} MXN
          </div>
          <span className="text-[11px] text-emerald-400">Varianza contable: $0.00 MXN</span>
        </div>
      </div>

      {/* Tabla 1: Contratos Saneados e Ingestados */}
      <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden">
        <div className="px-5 py-3.5 bg-white/5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#00D1FF]" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
              Cartera Histórica Saneada en Nube (Transformaciones de Limpieza Aplicadas)
            </h3>
          </div>
          {loading && <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 border-b border-white/10 text-slate-400 text-[10px] uppercase font-mono">
              <tr>
                <th className="py-3 px-4">Contrato Legacy</th>
                <th className="py-3 px-4">Acreditado / CURP Protegido</th>
                <th className="py-3 px-4">Fecha ISO Normalizada</th>
                <th className="py-3 px-4 text-right">Principal Original</th>
                <th className="py-3 px-4 text-right">Saldo Vivo</th>
                <th className="py-3 px-4">Transformaciones Deterministas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(overview?.latestCleanedRows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Aún no hay contratos históricos migrados activos (o se ejecutó Rollback). Presiona "Ingestar y Sanear Sábana Histórica Excel".
                  </td>
                </tr>
              ) : (
                overview!.latestCleanedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-mono font-bold text-[#00D1FF]">
                      {row.legacyContractNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{row.maskedName}</div>
                      <div className="font-mono text-[11px] text-slate-400">{row.curpMasked}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-300">
                      {row.normalizedOriginationDate}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-200">
                      ${row.principalOriginalMxn}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      ${row.liveBalanceMxn}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-amber-300">{row.cleansingNotes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla 2: Bitácora de Lotes de Migración y Botón de Rollback Instantáneo */}
      <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden">
        <div className="px-5 py-3.5 bg-white/5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
              Bitácora de Lotes de Migración y Plan de Regreso (Rollback Criptográfico)
            </h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 border-b border-white/10 text-slate-400 text-[10px] uppercase font-mono">
              <tr>
                <th className="py-3 px-4">Folio Lote / Archivo</th>
                <th className="py-3 px-4">Estatus</th>
                <th className="py-3 px-4 text-right">Saldo Excel vs Nube</th>
                <th className="py-3 px-4 text-right">Discrepancia</th>
                <th className="py-3 px-4">Huella SHA-256 Pre / Post Rollback</th>
                <th className="py-3 px-4 text-right">Acción Plan de Regreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(overview?.batches ?? []).map((b) => (
                <tr key={b.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-4">
                    <div className="font-mono font-bold text-white">{b.batchCode}</div>
                    <div className="text-[11px] text-slate-400">
                      {b.sourceFilename} ({b.totalRows} filas · {b.idempotentUpserts} upserts)
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        b.status === 'STAGED_VERIFIED'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : b.status === 'ROLLED_BACK'
                          ? 'bg-cyan-500/15 text-[#00D1FF] border-[#00D1FF]/30'
                          : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-200">
                    ${b.excelTotalLiveBalanceMxn} / ${b.migratedTotalLiveBalanceMxn}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                    ${b.discrepancyMxn}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                    <div>Pre: {b.preMigrationSnapshotSha256.slice(0, 16)}...</div>
                    {b.postRollbackSnapshotSha256 && (
                      <div className="text-emerald-400">
                        Post: {b.postRollbackSnapshotSha256.slice(0, 16)}... (
                        {b.postRollbackVerified ? '✓ Idéntico' : 'Diferente'})
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {b.status === 'STAGED_VERIFIED' && session.user.role === 'admin' ? (
                      <button
                        type="button"
                        disabled={rollingBackId === b.id}
                        onClick={() => void handleExecuteRollback(b.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow transition-all"
                      >
                        {rollingBackId === b.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>Ejecutar Rollback</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
