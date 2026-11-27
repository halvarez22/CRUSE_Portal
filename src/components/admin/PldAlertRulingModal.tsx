import React, { useEffect, useRef, useState } from 'react';
import { FileText, X, ShieldCheck, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import {
  AuthSession,
  PldAlertRulingDossier,
  PldHitAlertItem,
  PldListType,
} from '../../types';

export type PldRulingResolutionStatus = 'CONFIRMED_BLOCKED' | 'CLEARED_EDD' | 'FALSE_POSITIVE';

export function buildSuggestedRulingJustification(input: {
  resolutionStatus: PldRulingResolutionStatus;
  entityType: 'EXPEDIENTE' | 'INVESTOR';
  entityId: string;
  listLabel: string;
  officialReference: string;
}): string {
  const ref = input.officialReference || 'Sin oficio especificado';
  if (input.resolutionStatus === 'CONFIRMED_BLOCKED') {
    return `Se confirma coincidencia positiva para ${input.entityType} ${input.entityId} contra ${input.listLabel} (${ref}). Se dicta bloqueo definitivo conforme al Art. 95 Bis LGOAAC y escalamiento a reporte regulatorio UIF.`;
  }
  if (input.resolutionStatus === 'CLEARED_EDD') {
    return `Se revisó expediente ${input.entityType} ${input.entityId} con coincidencia en lista gris (${input.listLabel}, ${ref}). Se documenta Debida Diligencia Reforzada (EDD) y se autoriza continuidad bajo monitoreo reforzado.`;
  }
  return `Se cotejó identidad documental de ${input.entityType} ${input.entityId} contra ${input.listLabel} (${ref}), determinándose homonimia / falso positivo sin coincidencia en CURP/RFC. Se descarta alerta y se libera operación.`;
}

interface PldAlertRulingModalProps {
  session: AuthSession;
  alert: PldHitAlertItem;
  listTypeLabels: Record<PldListType, string>;
  resolutionStatus: PldRulingResolutionStatus;
  justificationNotes: string;
  resolveLoading: boolean;
  onResolutionStatusChange: (status: PldRulingResolutionStatus) => void;
  onJustificationNotesChange: (notes: string) => void;
  onSubmit: () => Promise<void> | void;
  onClose: () => void;
}

export const PldAlertRulingModal: React.FC<PldAlertRulingModalProps> = ({
  session,
  alert,
  listTypeLabels,
  resolutionStatus,
  justificationNotes,
  resolveLoading,
  onResolutionStatusChange,
  onJustificationNotesChange,
  onSubmit,
  onClose,
}) => {
  const [dossier, setDossier] = useState<PldAlertRulingDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState<boolean>(true);
  const [dossierError, setDossierError] = useState<string | null>(null);

  const requestSeqRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  const purgeDossierFromMemory = () => {
    requestSeqRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setDossier(null);
    setDossierError(null);
  };

  useEffect(() => {
    const reqSeq = ++requestSeqRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setDossier(null);
    setDossierError(null);
    setLoadingDossier(true);

    void (async () => {
      try {
        const res = await fetch(`/api/pld/alerts/${encodeURIComponent(alert.id)}/dossier`, {
          headers: { Authorization: `Bearer ${session.token}` },
          signal: controller.signal,
        });
        const data = (await res.json()) as { dossier?: PldAlertRulingDossier; error?: string };
        if (requestSeqRef.current !== reqSeq) return;
        if (!res.ok || !data.dossier) {
          throw new Error(data.error || 'No fue posible consultar el expediente de dictamen.');
        }
        setDossier(data.dossier);
      } catch (err: unknown) {
        if (requestSeqRef.current !== reqSeq) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setDossierError(err instanceof Error ? err.message : 'Error consultando dossier de alerta');
      } finally {
        if (requestSeqRef.current === reqSeq) {
          setLoadingDossier(false);
        }
      }
    })();

    return () => {
      requestSeqRef.current += 1;
      controller.abort();
      setDossier(null);
    };
  }, [alert.id, session.token]);

  const handleClose = () => {
    purgeDossierFromMemory();
    onClose();
  };

  const handleConfirm = async () => {
    await onSubmit();
  };

  const listLabel = listTypeLabels[alert.listType] ?? alert.listType;
  const isCriticalBlock = alert.riskLevel === 'CRITICAL_BLOCK';
  const exposureFormatted = Number(dossier?.exposureAmount ?? alert.exposureAmount ?? 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-xl w-full rounded-3xl bg-slate-900 border border-white/15 p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#00D1FF]" />
            <h4 className="text-sm font-bold text-white">Dictamen Inmutable del Oficial de Cumplimiento</h4>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar modal de dictamen"
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-white flex items-center gap-1.5">
              <AlertTriangle className={`w-4 h-4 ${isCriticalBlock ? 'text-rose-400' : 'text-amber-400'}`} />
              Coincidencia detectada en Lista de Riesgo PLD/FT
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                isCriticalBlock
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              {isCriticalBlock ? 'Bloqueo Crítico' : 'Lista Gris · Debida Diligencia (EDD)'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] pt-1 border-t border-white/10">
            <p className="text-slate-300">
              <span className="text-slate-400">Folio Alerta:</span>{' '}
              <span className="font-mono">{alert.id}</span>
            </p>
            <p className="text-slate-300">
              <span className="text-slate-400">Entidad / Folio:</span>{' '}
              <span className="font-mono font-semibold text-white">
                {alert.entityType === 'EXPEDIENTE' ? 'Expediente' : 'Inversionista'} · {alert.entityId}
              </span>
            </p>
            <p className="text-slate-300">
              <span className="text-slate-400">Exposición:</span>{' '}
              <span className="font-mono font-bold text-[#00D1FF]">${exposureFormatted} MXN</span>
            </p>
            <p className="text-slate-300">
              <span className="text-slate-400">Canal:</span>{' '}
              <span className="font-mono">{alert.detectionChannel}</span>
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-[#00D1FF]/25 space-y-1">
            {loadingDossier ? (
              <div className="flex items-center gap-2 text-[#00D1FF] text-[11px]">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Descifrando identidad del expediente (registro WORM CNBV)...</span>
              </div>
            ) : dossierError ? (
              <p className="text-amber-300 text-[11px]">
                Sujeto Protegido: {alert.entityMaskedName} ({alert.entityMaskedId}) · {dossierError}
              </p>
            ) : (
              <>
                <p className="text-slate-200">
                  <span className="text-slate-400">Sujeto Protegido:</span>{' '}
                  <span className="font-bold text-white">{dossier?.subjectFullName ?? alert.entityMaskedName}</span>
                </p>
                <p className="text-[11px] font-mono text-slate-300">
                  {dossier?.subjectCurp ? `CURP: ${dossier.subjectCurp}` : `ID: ${alert.entityMaskedId}`}
                  {dossier?.subjectRfc ? ` · RFC: ${dossier.subjectRfc}` : ''}
                </p>
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Consulta auditada en Bitácora Forense WORM (LFPDPPP / CNBV) · Purga automática al cerrar.</span>
                </p>
              </>
            )}
          </div>

          <p className="text-slate-300 text-[11px]">
            <span className="text-slate-400">Lista Coincidente:</span>{' '}
            <span className="font-semibold text-white">{listLabel}</span>{' '}
            <span className="text-slate-400">({alert.officialReference})</span>
          </p>
        </div>

        <div>
          <label className="block text-xs text-slate-300 mb-1 font-semibold">Resolución Regulatoria</label>
          <select
            value={resolutionStatus}
            onChange={(e) => onResolutionStatusChange(e.target.value as PldRulingResolutionStatus)}
            className="w-full px-3 py-2 rounded-xl glass-input text-xs text-slate-100"
          >
            <option value="CONFIRMED_BLOCKED" className="bg-slate-900">
              Confirmar Bloqueo Definitivo (Rechazar Expediente / Escalar Alerta UIF)
            </option>
            <option value="CLEARED_EDD" className="bg-slate-900">
              Autorizar con Debida Diligencia Reforzada — Lista Gris (Liberar)
            </option>
            <option value="FALSE_POSITIVE" className="bg-slate-900">
              Descartar por Homonimia / Falso Positivo (Rechazar Alerta y Liberar)
            </option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-slate-300 font-semibold">
              Justificación Forense Obligatoria (mínimo 10 caracteres)
            </label>
            <button
              type="button"
              onClick={() =>
                onJustificationNotesChange(
                  buildSuggestedRulingJustification({
                    resolutionStatus,
                    entityType: alert.entityType,
                    entityId: alert.entityId,
                    listLabel,
                    officialReference: alert.officialReference,
                  })
                )
              }
              className="text-[11px] text-[#00D1FF] hover:text-cyan-200 flex items-center gap-1 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>Insertar plantilla sugerida</span>
            </button>
          </div>
          <textarea
            rows={3}
            value={justificationNotes}
            onChange={(e) => onJustificationNotesChange(e.target.value)}
            placeholder="Detalle el sustento documental del expediente u oficio SAT/UIF verificado..."
            className="w-full p-3 rounded-xl glass-input text-xs text-slate-100 placeholder-slate-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-300 font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={resolveLoading}
            className="px-4 py-2 rounded-xl bg-[#249E82] hover:bg-[#1e856e] text-white text-xs font-bold shadow-lg disabled:opacity-50"
          >
            {resolveLoading ? 'Sellando...' : 'Firmar y Sellar Dictamen Inmutable'}
          </button>
        </div>
      </div>
    </div>
  );
};
