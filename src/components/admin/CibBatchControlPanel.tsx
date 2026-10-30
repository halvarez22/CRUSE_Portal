import React, { useState, useEffect, useCallback } from 'react';
import {
  FileCheck2,
  ShieldCheck,
  UploadCloud,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Hash,
} from 'lucide-react';
import { CibExportBatchItem } from '../../types';

interface CibBatchControlPanelProps {
  token: string;
}

export const CibBatchControlPanel: React.FC<CibBatchControlPanelProps> = ({ token }) => {
  const [batches, setBatches] = useState<CibExportBatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const [selectedBatchForOc, setSelectedBatchForOc] = useState<CibExportBatchItem | null>(null);
  const [ocReviewNotes, setOcReviewNotes] = useState(
    'Expedientes validados con Score OCR >= 80% y 0 hits en Listas Negras UIF/OFAC/69-B.'
  );

  const [selectedBatchForUpload, setSelectedBatchForUpload] = useState<CibExportBatchItem | null>(
    null
  );
  const [cibConfirmationFolio, setCibConfirmationFolio] = useState('');

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cib-batches', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { batches?: CibExportBatchItem[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Error cargando lotes CIB');
      setBatches(data.batches ?? []);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error consultando lotes CIB',
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchBatches();
  }, [fetchBatches]);

  const handleGenerateBatch = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/cib-batches/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json()) as {
        batch?: CibExportBatchItem;
        csvLayoutContent?: string;
        error?: string;
      };
      if (!res.ok || !data.batch) throw new Error(data.error || 'Error generando lote CIB');

      if (data.csvLayoutContent) {
        const blob = new Blob([`\uFEFF${data.csvLayoutContent}`], {
          type: 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${data.batch.batchCode}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }

      setFeedback({
        type: 'success',
        message: `Paso 1 Completado: Lote ${data.batch.batchCode} generado (${data.batch.totalExpedientesIncluded} incluidos, ${data.batch.excludedLowConfidenceOrPldCount} excluidos por OCR/PLD). Estado: GENERATED_PENDING_OC.`,
      });
      await fetchBatches();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al generar lote CIB',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveOc = async () => {
    if (!selectedBatchForOc) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/cib-batches/${selectedBatchForOc.id}/approve-oc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ocReviewNotes }),
      });
      const data = (await res.json()) as { batch?: CibExportBatchItem; error?: string };
      if (!res.ok || !data.batch) throw new Error(data.error || 'Error aprobando lote CIB');

      setFeedback({
        type: 'success',
        message: `Paso 2 Completado: Lote ${data.batch.batchCode} aprobado por el Oficial de Cumplimiento (APPROVED_BY_OC) y sellado en audit_events WORM (CIB_BATCH_VALIDATED).`,
      });
      setSelectedBatchForOc(null);
      await fetchBatches();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al aprobar lote CIB',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!selectedBatchForUpload) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/cib-batches/${selectedBatchForUpload.id}/confirm-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cibConfirmationFolio }),
      });
      const data = (await res.json()) as { batch?: CibExportBatchItem; error?: string };
      if (!res.ok || !data.batch) throw new Error(data.error || 'Error confirmando carga CIB');

      setFeedback({
        type: 'success',
        message: `Paso 3 Completado: Carga en CIB Logic Systems confirmada (${data.batch.batchCode}) con Folio ${data.batch.cibConfirmationFolio}.`,
      });
      setSelectedBatchForUpload(null);
      setCibConfirmationFolio('');
      await fetchBatches();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al confirmar carga CIB',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl glass-card border border-white/10 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#00D1FF]">
            Entregable Fase 2 · Procedimiento de Carga Manual/Semiautomática CIB (Logic Systems)
          </span>
          <h4 className="text-sm font-bold text-white">
            Control de Lotes CIB (1. Generar Lote Pre-Validado → 2. Revisión Oficial de Cumplimiento → 3. Carga CIB y Bitácora WORM)
          </h4>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchBatches()}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-200 font-semibold flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={() => void handleGenerateBatch()}
            disabled={submitting}
            className="px-3.5 py-1.5 rounded-xl bg-[#249E82] hover:bg-[#1f876f] text-white text-xs font-bold flex items-center gap-1.5 shadow-lg"
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Paso 1: Generar Lote CIB Validado</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px] font-mono">
              <th className="py-2 px-3">Código Lote CIB</th>
              <th className="py-2 px-3">Expedientes (Incluidos / Excluidos)</th>
              <th className="py-2 px-3">Capital / Cuota Quincenal</th>
              <th className="py-2 px-3">Hash SHA-256</th>
              <th className="py-2 px-3">Estado Flujo 3 Pasos</th>
              <th className="py-2 px-3 text-right">Accióniguiente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {batches.map((b) => (
              <tr key={b.id} className="hover:bg-white/5">
                <td className="py-2.5 px-3 font-mono font-bold text-[#00D1FF]">{b.batchCode}</td>
                <td className="py-2.5 px-3 text-slate-200">
                  <span className="font-bold text-emerald-400">{b.totalExpedientesIncluded}</span>{' '}
                  incluidos ·{' '}
                  <span className="text-amber-300">{b.excludedLowConfidenceOrPldCount} excluidos</span>
                </td>
                <td className="py-2.5 px-3 font-mono text-slate-200">
                  ${b.totalPrincipalMxn} MXN / Qna: ${b.totalFortnightlyQuotaMxn}
                </td>
                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Hash className="w-3 h-3 text-[#00D1FF]" />
                    {b.fileSha256Hash.slice(0, 14)}...
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      b.workflowStatus === 'UPLOADED_TO_CIB'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : b.workflowStatus === 'APPROVED_BY_OC'
                          ? 'bg-sky-500/20 text-sky-300'
                          : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {b.workflowStatus}
                    {b.cibConfirmationFolio ? ` (${b.cibConfirmationFolio})` : ''}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right">
                  {b.workflowStatus === 'GENERATED_PENDING_OC' && (
                    <button
                      type="button"
                      onClick={() => setSelectedBatchForOc(b)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-[11px] inline-flex items-center gap-1"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Paso 2: Aprobar OC</span>
                    </button>
                  )}
                  {b.workflowStatus === 'APPROVED_BY_OC' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBatchForUpload(b);
                        setCibConfirmationFolio(`CIB-LOGIC-${new Date().getFullYear()}-0901`);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-bold text-[11px] inline-flex items-center gap-1"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Paso 3: Confirmar Folio CIB</span>
                    </button>
                  )}
                  {b.workflowStatus === 'UPLOADED_TO_CIB' && (
                    <span className="text-[11px] text-emerald-400 font-semibold">
                      Sellado en WORM
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedBatchForOc && (
        <div className="p-3.5 rounded-xl bg-slate-900/95 border border-amber-500/40 space-y-2.5 text-xs">
          <div className="font-bold text-amber-300">
            Paso 2: Revisión y Aprobación del Oficial de Cumplimiento — {selectedBatchForOc.batchCode}
          </div>
          <input
            type="text"
            value={ocReviewNotes}
            onChange={(e) => setOcReviewNotes(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-white/15 text-white"
            placeholder="Dictamen del Oficial de Cumplimiento..."
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSelectedBatchForOc(null)}
              className="px-3 py-1 rounded-lg bg-white/10 text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleApproveOc()}
              disabled={submitting}
              className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold"
            >
              Firmar Aprobación OC (Sellar CIB_BATCH_VALIDATED)
            </button>
          </div>
        </div>
      )}

      {selectedBatchForUpload && (
        <div className="p-3.5 rounded-xl bg-slate-900/95 border border-sky-500/40 space-y-2.5 text-xs">
          <div className="font-bold text-sky-300">
            Paso 3: Registro de Folio de Carga CIB Logic Systems — {selectedBatchForUpload.batchCode}
          </div>
          <input
            type="text"
            value={cibConfirmationFolio}
            onChange={(e) => setCibConfirmationFolio(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-white/15 text-white font-mono"
            placeholder="Ej: CIB-LOGIC-CHIH-2026-0901"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSelectedBatchForUpload(null)}
              className="px-3 py-1 rounded-lg bg-white/10 text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmUpload()}
              disabled={submitting}
              className="px-3 py-1 rounded-lg bg-sky-500 text-slate-950 font-bold"
            >
              Confirmar Carga en CIB
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
