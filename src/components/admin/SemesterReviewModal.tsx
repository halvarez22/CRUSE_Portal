import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  FileWarning,
  History,
  X,
  ShieldCheck,
} from 'lucide-react';
import {
  CnbvRiskGrade,
  ExpedienteComplianceProfileItem,
  SemesterTransactionalReviewHistoryItem,
} from '../../types';

export interface SemesterReviewModalProps {
  readonly token: string;
  readonly profile: ExpedienteComplianceProfileItem;
  readonly onClose: () => void;
  readonly onCompleted: (message: string) => Promise<void>;
  readonly onError: (message: string) => void;
}

export const SemesterReviewModal: React.FC<SemesterReviewModalProps> = ({
  token,
  profile,
  onClose,
  onCompleted,
  onError,
}) => {
  const [profileChanged, setProfileChanged] = useState<boolean | null>(null);
  const [requiresInusualReport, setRequiresInusualReport] = useState<boolean | null>(null);
  const [newTransactionalProfileMxn, setNewTransactionalProfileMxn] = useState(
    profile.initialTransactionalProfileMxn
  );
  const [newRiskGrade, setNewRiskGrade] = useState<CnbvRiskGrade>(
    profile.currentRiskGrade === 'BAJO' ? 'MEDIO' : 'ALTO'
  );
  const [roiOperationAmountMxn, setRoiOperationAmountMxn] = useState(
    profile.initialTransactionalProfileMxn
  );
  const [roiCol40CriteriaDescription, setRoiCol40CriteriaDescription] = useState(
    `DESVIACION DEL PERFIL TRANSACCIONAL DETECTADA EN REVISION SEMESTRAL (180 DIAS CAPITULO X FRACCION VIII DCG ART 115 LIC) DEL EXPEDIENTE ${profile.expedienteId}.`
  );
  const [reviewJustificationNotes, setReviewJustificationNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<SemesterTransactionalReviewHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/pld/semester-reviews?expedienteId=${encodeURIComponent(profile.expedienteId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = (await res.json()) as {
        reviews?: SemesterTransactionalReviewHistoryItem[];
      };
      if (res.ok && data.reviews) {
        setHistory(data.reviews);
      }
    } catch {
      // Silencioso en carga inicial de historial
    } finally {
      setLoadingHistory(false);
    }
  }, [profile.expedienteId, token]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleSubmit = async () => {
    if (profileChanged === null) {
      onError('Guardrail 4: Responde primero la Pregunta 1 (¿Cambió algo en el perfil transaccional?).');
      return;
    }
    if (profileChanged && requiresInusualReport === null) {
      onError('Guardrail 4: Responde la Pregunta 2 (¿El cambio detectado amerita Reporte de Operación Inusual?).');
      return;
    }
    if (reviewJustificationNotes.trim().length < 10) {
      onError('Ingresa al menos 10 caracteres de sustento regulatorio para sellar la revisión semestral en WORM.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/pld/semester-reviews/${profile.expedienteId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          profileChanged,
          requiresInusualReport: profileChanged ? requiresInusualReport : undefined,
          newTransactionalProfileMxn: profileChanged ? newTransactionalProfileMxn : undefined,
          newRiskGrade: profileChanged ? newRiskGrade : undefined,
          roiOperationAmountMxn:
            profileChanged && requiresInusualReport ? roiOperationAmountMxn : undefined,
          roiCol40CriteriaDescription:
            profileChanged && requiresInusualReport ? roiCol40CriteriaDescription : undefined,
          reviewJustificationNotes,
        }),
      });

      const data = (await res.json()) as {
        reviewItem?: SemesterTransactionalReviewHistoryItem;
        generatedReportId?: string | null;
        error?: string;
      };
      if (!res.ok || !data.reviewItem) {
        throw new Error(data.error || 'Error ejecutando revisión semestral de perfil transaccional');
      }

      const item = data.reviewItem;
      const summaryMsg =
        item.wormAction === 'SEMESTER_REVIEW_NO_CHANGES'
          ? `Revisión Semestral (180d) sellada en WORM (${item.wormAction}): Sin cambios en perfil ($${item.updatedTransactionalProfileMxn} MXN). Próxima revisión programada: ${item.nextSemesterReviewAt.slice(0, 10)}.`
          : item.wormAction === 'SEMESTER_REVIEW_ESCALATED_TO_ROI'
            ? `Revisión Semestral sellada en WORM (${item.wormAction}): Generado simultáneamente Reporte Inusual ROI (${data.generatedReportId}) + Cambio de Grado de Riesgo (${item.previousRiskGrade} -> ${item.updatedRiskGrade}).`
            : `Revisión Semestral sellada en WORM (${item.wormAction}): Actualizado Perfil Transaccional ($${item.previousTransactionalProfileMxn} -> $${item.updatedTransactionalProfileMxn} MXN) y Grado de Riesgo (${item.previousRiskGrade} -> ${item.updatedRiskGrade}) sin ROI.`;

      await onCompleted(summaryMsg);
      onClose();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Error al registrar revisión semestral');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="glass-panel rounded-3xl max-w-2xl w-full p-6 border border-[#00D1FF]/40 space-y-4 my-8 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-5 h-5 text-[#00D1FF]" />
            <div>
              <h4 className="text-sm font-bold text-white">
                Revisión Semestral de Perfil Transaccional (Cada 6 Meses / 180 Días — Cap. X Fracc. VIII)
              </h4>
              <p className="text-[11px] text-slate-400">
                Expediente: <span className="font-mono text-white font-bold">{profile.expedienteId}</span> · Perfil Actual: <span className="font-mono text-emerald-300">${profile.initialTransactionalProfileMxn} MXN</span> · Grado Actual: <span className="font-bold text-amber-300">{profile.currentRiskGrade}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PREGUNTA 1 SECUENCIAL (Diagrama Manuscrito Lic. Gerardo: ¿Cambió algo en el perfil?) */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-white">
            1. ¿Cambió algo en el perfil transaccional del cliente en los últimos 6 meses?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setProfileChanged(false);
                setRequiresInusualReport(null);
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                profileChanged === false
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                  : 'bg-white/5 border-white/10 text-slate-300'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>NO — Sin cambios en el perfil</span>
              </div>
              <p className="text-[11px] mt-1 text-slate-300">
                Extiende reloj +180 días, mantiene grado de riesgo ({profile.currentRiskGrade}) y sella WORM <code className="text-[10px]">SEMESTER_REVIEW_NO_CHANGES</code>.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setProfileChanged(true)}
              className={`p-3 rounded-xl border text-left transition-all ${
                profileChanged === true
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                  : 'bg-white/5 border-white/10 text-slate-300'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>SÍ — Se detectó desviación / cambio en el perfil</span>
              </div>
              <p className="text-[11px] mt-1 text-slate-300">
                Habilita la Pregunta 2 del diagrama CNBV (¿Se reporta como Operación Inusual?).
              </p>
            </button>
          </div>
        </div>

        {/* PREGUNTA 2 SECUENCIAL (Diagrama Manuscrito Lic. Gerardo: ¿Se reporta?) */}
        {profileChanged === true && (
          <div className="space-y-3 p-3.5 rounded-2xl bg-slate-900/90 border border-amber-500/30">
            <label className="block text-xs font-bold text-amber-300">
              2. ¿El cambio detectado amerita Reporte de Operación Inusual (ROI)?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <button
                type="button"
                onClick={() => setRequiresInusualReport(true)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  requiresInusualReport === true
                    ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <FileWarning className="w-4 h-4 text-rose-400" />
                  <span>SÍ SE REPORTA (ROI + Cambio Grado de Riesgo)</span>
                </div>
                <p className="text-[11px] mt-1 text-slate-300">
                  Genera simultáneamente (1) Reporte Inusual ROI SITI Tipo 2, (2) Cambio de Grado de Riesgo y (3) WORM <code className="text-[10px]">SEMESTER_REVIEW_ESCALATED_TO_ROI</code>.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setRequiresInusualReport(false)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  requiresInusualReport === false
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>NO SE REPORTA (Solo Perfil + Grado de Riesgo)</span>
                </div>
                <p className="text-[11px] mt-1 text-slate-300">
                  Actualiza Perfil Transaccional y Grado de Riesgo sin emitir ROI y sella WORM <code className="text-[10px]">SEMESTER_REVIEW_PROFILE_UPDATED_NO_ROI</code>.
                </p>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Nuevo Perfil Transaccional Quincenal (MXN)
                </label>
                <input
                  type="text"
                  value={newTransactionalProfileMxn}
                  onChange={(e) => setNewTransactionalProfileMxn(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Nuevo Grado de Riesgo EBR (CNBV)
                </label>
                <select
                  value={newRiskGrade}
                  onChange={(e) => setNewRiskGrade(e.target.value as CnbvRiskGrade)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-xs text-white"
                >
                  <option value="BAJO">BAJO</option>
                  <option value="MEDIO">MEDIO</option>
                  <option value="ALTO">ALTO (Debida Diligencia Reforzada)</option>
                </select>
              </div>
            </div>

            {requiresInusualReport === true && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-rose-300 mb-1 font-semibold">
                    Monto de la Operación Inusual — Columna 11 SITI (MXN)
                  </label>
                  <input
                    type="text"
                    value={roiOperationAmountMxn}
                    onChange={(e) => setRoiOperationAmountMxn(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-rose-500/40 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-rose-300 mb-1 font-semibold">
                    Criterio y Descripción — Columna 40 SITI
                  </label>
                  <input
                    type="text"
                    value={roiCol40CriteriaDescription}
                    onChange={(e) => setRoiCol40CriteriaDescription(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-rose-500/40 text-xs text-white font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs text-slate-300 mb-1 font-semibold">
            Dictamen y Justificación Forense del Oficial de Cumplimiento (Mínimo 10 caracteres)
          </label>
          <textarea
            rows={2}
            value={reviewJustificationNotes}
            onChange={(e) => setReviewJustificationNotes(e.target.value)}
            placeholder="Documente el análisis semestral de pagos, abonos e ingresos del acreditado..."
            className="w-full p-2.5 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
          />
        </div>

        {/* Historial completo de revisiones previas del mismo expediente */}
        <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[#00D1FF]" />
              <span>Historial Inmutable WORM de Revisiones Semestrales ({history.length})</span>
            </span>
            {loadingHistory && <span className="text-slate-400">Cargando...</span>}
          </div>
          {history.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              Aún no existen revisiones semestrales previas selladas para este expediente.
            </p>
          ) : (
            <div className="max-h-32 overflow-y-auto space-y-1.5 text-[11px]">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="p-2 rounded-lg bg-slate-950/80 border border-white/10 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-mono font-bold text-[#00D1FF]">{h.wormAction}</span>
                    <span className="text-slate-400 ml-2">
                      Perfil: ${h.previousTransactionalProfileMxn} → ${h.updatedTransactionalProfileMxn} MXN · Grado: {h.previousRiskGrade} → {h.updatedRiskGrade}
                    </span>
                    {h.generatedReportId && (
                      <span className="ml-2 text-rose-300 font-mono">ROI: {h.generatedReportId}</span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">
                    {h.createdAt.slice(0, 10)} · #{h.recordSha256Hash.slice(0, 10)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 text-xs text-slate-300 font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-[#249E82] hover:bg-[#1e856e] text-white text-xs font-bold shadow-lg"
          >
            {submitting ? 'Sellando en WORM...' : 'Firmar y Sellar Revisión Semestral WORM'}
          </button>
        </div>
      </div>
    </div>
  );
};
