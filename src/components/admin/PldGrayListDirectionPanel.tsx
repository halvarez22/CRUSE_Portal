import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileWarning,
  RefreshCw,
  Clock,
  Scale,
  Download,
  Calculator,
  MessageSquareWarning,
} from 'lucide-react';
import {
  AuthSession,
  CnbvReportAndWhistleblowingItem,
  ExpedienteComplianceProfileItem,
  TentativeAmountReportingMode,
} from '../../types';

interface PldGrayListDirectionPanelProps {
  session: AuthSession;
  onDecisionCompleted?: () => void;
}

export const PldGrayListDirectionPanel: React.FC<PldGrayListDirectionPanelProps> = ({
  session,
  onDecisionCompleted,
}) => {
  const [profiles, setProfiles] = useState<ExpedienteComplianceProfileItem[]>([]);
  const [reports, setReports] = useState<CnbvReportAndWhistleblowingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [selectedProfile, setSelectedProfile] = useState<ExpedienteComplianceProfileItem | null>(null);
  const [decision, setDecision] = useState<'AUTHORIZED_CONTINUE' | 'REJECTED_GENERATE_INUSUAL'>(
    'REJECTED_GENERATE_INUSUAL'
  );
  const [tentativeAmountMode, setTentativeAmountMode] =
    useState<TentativeAmountReportingMode>('ZERO_EOPERATIVO');
  const [justificationNotes, setJustificationNotes] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pld/gray-list-and-exceptions', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = (await res.json()) as {
        profiles?: ExpedienteComplianceProfileItem[];
        tentativeAndRegulatoryReports?: CnbvReportAndWhistleblowingItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Error cargando flujos de Lista Gris');
      setProfiles(data.profiles ?? []);
      setReports(data.tentativeAndRegulatoryReports ?? []);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error consultando Lista Gris y Excepciones',
      });
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleDirectionSubmit = async () => {
    if (!selectedProfile) return;
    if (justificationNotes.trim().length < 10) {
      setFeedback({
        type: 'error',
        message: 'La justificación regulatoria de Dirección debe tener al menos 10 caracteres.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/pld/gray-list/${selectedProfile.expedienteId}/direction-decision`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({
            decision,
            tentativeAmountMode,
            justificationNotes,
          }),
        }
      );

      const data = (await res.json()) as {
        expedienteId?: string;
        directionAuthStatus?: string;
        generatedReportId?: string | null;
        col11AmountFormatted?: string | null;
        col40DescriptionFormatted?: string | null;
        error?: string;
      };

      if (!res.ok) throw new Error(data.error || 'Error registrando dictamen de Dirección');

      setFeedback({
        type: 'success',
        message:
          decision === 'AUTHORIZED_CONTINUE'
            ? `Autorización de Dirección registrada (CLEARED_EDD). Expediente ${selectedProfile.expedienteId} liberado con Grado de Riesgo ALTO.`
            : `Rechazo de Dirección aplicado. Generado Reporte Inusual Tentativo / 24h (${data.generatedReportId}) Tipo '2' | Columna 11 Monto: ${data.col11AmountFormatted} | Columna 40: "${data.col40DescriptionFormatted?.slice(0, 70)}..."`,
      });

      setSelectedProfile(null);
      setJustificationNotes('');
      await fetchData();
      if (onDecisionCompleted) onDecisionCompleted();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error procesando decisión de Dirección',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadSiti41ColTxt = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/pld/siti-layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        fileName?: string;
        txtContent?: string;
        sha256Hash?: string;
        totalRows?: number;
        error?: string;
      };
      if (!res.ok || !data.txtContent) {
        throw new Error(data.error || 'Error generando Layout SITI 41 Columnas');
      }
      const blob = new Blob([data.txtContent], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.fileName || 'SITI_UIF_CNBV_41_COL.txt';
      link.click();
      URL.revokeObjectURL(url);

      setFeedback({
        type: 'success',
        message: `Layout Oficial .TXT SITI 41 Columnas descargado (${data.totalRows} registros separados por ';' y CRLF) | SHA-256: ${data.sha256Hash?.slice(0, 16)}...`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error descargando Layout SITI',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEvaluateSlaAndFractionedDemo = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/pld/evaluate-sla-clocks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = (await res.json()) as {
        evaluatedReportsCount?: number;
        semesterReviewsDueCount?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Error evaluando Reloj Normativo CNBV');
      setFeedback({
        type: 'success',
        message: `Reloj Normativo CNBV Evaluado (60d CCC + 3d hábiles UIF): ${data.evaluatedReportsCount} reportes auditados y ${data.semesterReviewsDueCount} revisiones semestrales (180d) detectadas.`,
      });
      await fetchData();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error evaluando Reloj SLA',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickRoipDemo = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/pld/whistleblowing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          subjectMaskedName: 'COLABORADOR VENTANILLA ZONA NORTE',
          hubCode: 'HUB-CUU',
          col40OperationDescription:
            'DENUNCIA CONFIDENCIAL EN BUZON INTERNO CAPITULO X SOBRE INTENTO DE RECEPCION DE PAGOS EN EFECTIVO FRACCIONADOS SIN IDENTIFICACION ACTUALIZADA.',
          col41InusualReasons:
            'OMISION DE DEBIDA DILIGENCIA EN OPERACION DE VENTANILLA REPORTADA ANONIMAMENTE AL OFICIAL DE CUMPLIMIENTO.',
          isAnonymous: true,
        }),
      });
      const data = (await res.json()) as { reportId?: string; investigationDeadlineAt?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Error registrando ROIP');
      setFeedback({
        type: 'success',
        message: `Denuncia Confidencial ROIP registrada (${data.reportId}, SITI Tipo '3'). Límite de investigación 60 días naturales: ${data.investigationDeadlineAt?.slice(0, 10)}.`,
      });
      await fetchData();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error registrando denuncia ROIP',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold mb-1">
              <Scale className="w-3.5 h-3.5" />
              <span>Diagrama CNBV Lic. Gerardo · Rama Lista Gris y Matriz de Riesgo Inicial</span>
            </div>
            <h3 className="text-base font-bold text-white">
              Control de Lista Gris (¿Autoriza Dirección?), Excepciones OCR y Reportes Tentativos (SITI Tipo 2)
            </h3>
          </div>

          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar Flujos</span>
          </button>
        </div>

        {feedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Tabla de Perfiles de Cumplimiento y Escalamiento a Dirección */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px]">
                <th className="py-2 px-3">Expediente</th>
                <th className="py-2 px-3">Confianza OCR / Estado</th>
                <th className="py-2 px-3">Ocupación / Ingreso Quincenal</th>
                <th className="py-2 px-3">Matriz de Riesgo Inicial</th>
                <th className="py-2 px-3">¿Autoriza Dirección? (Lista Gris)</th>
                <th className="py-2 px-3 text-right">Acción Regulatoria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {profiles.slice(0, 12).map((p) => (
                <tr key={p.expedienteId} className="hover:bg-white/5">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-200">
                    {p.expedienteId}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-md font-mono font-semibold text-[11px] ${
                        p.ocrStatus === 'VALIDATED'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : p.ocrStatus === 'MANUAL_CORRECTED'
                            ? 'bg-sky-500/15 text-sky-300'
                            : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {p.ocrConfidenceScore}% ({p.ocrStatus})
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    <div className="font-medium">{p.occupationLabel}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Ingreso: ${p.fortnightlyNetIncomeMxn} MXN | Perfil: ${p.initialTransactionalProfileMxn} MXN
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        p.currentRiskGrade === 'BAJO'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : p.currentRiskGrade === 'MEDIO'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {p.currentRiskGrade} ({p.riskMatrixScore} pts)
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                        p.directionAuthStatus === 'PENDING_DIRECTION'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : p.directionAuthStatus === 'AUTHORIZED_CONTINUE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : p.directionAuthStatus === 'REJECTED_GENERATE_INUSUAL'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {p.directionAuthStatus}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => {
                        setSelectedProfile(p);
                        setDecision('REJECTED_GENERATE_INUSUAL');
                        setJustificationNotes('');
                      }}
                      className="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-bold transition-colors"
                    >
                      Dictaminar Dirección
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla de Reportes Tentativos / Inusuales / 24h y Buzón ROIP (Punto de Control #3) */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-[#00D1FF]" />
            <span>
              Bandeja de Reportes Regulatorios SITI CNBV/UIF (Columna 11 Monto y Columna 40 Leyendas Oficiales)
            </span>
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleEvaluateSlaAndFractionedDemo()}
              disabled={submitting}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[11px] font-bold flex items-center gap-1"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Evaluar Reloj 60+3d / 180d</span>
            </button>
            <button
              type="button"
              onClick={() => void handleQuickRoipDemo()}
              disabled={submitting}
              className="px-2.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-[11px] font-bold flex items-center gap-1"
            >
              <MessageSquareWarning className="w-3.5 h-3.5" />
              <span>Buzón ROIP (Tipo 3)</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadSiti41ColTxt()}
              disabled={submitting}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#396CAE] to-[#249E82] text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar Layout .TXT SITI (41 Cols · ;)</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px]">
                <th className="py-2 px-3">ID / Tipo SITI</th>
                <th className="py-2 px-3">Sujeto / CURP</th>
                <th className="py-2 px-3">Columna 11 (Monto)</th>
                <th className="py-2 px-3">Columna 40 (Descripción + Leyenda Obligatoria)</th>
                <th className="py-2 px-3">Reloj SLA (60+3d / 24h)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {reports.map((rep) => (
                <tr key={rep.id} className="hover:bg-white/5">
                  <td className="py-2.5 px-3">
                    <div className="font-mono font-bold text-white">{rep.id}</div>
                    <div className="text-[10px] text-[#00D1FF] font-semibold">
                      Tipo SITI '{rep.sitiReportTypeCode}' · {rep.reportCategory}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-200">{rep.subjectMaskedName}</div>
                    <div className="font-mono text-[11px] text-slate-400">{rep.subjectCurpMasked}</div>
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                    {rep.operationAmountMxn} MXN
                    <div className="text-[10px] text-slate-400 font-normal">
                      ({rep.tentativeAmountMode})
                    </div>
                  </td>
                  <td className="py-2.5 px-3 max-w-md">
                    <p className="text-[11px] text-slate-200 font-mono line-clamp-2">
                      {rep.col40OperationDescription}
                    </p>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[11px] font-semibold">
                      <Clock className="w-3 h-3" />
                      {rep.slaClockStatus} ({rep.remainingCalendarDaysForCcc}d CCC)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Resolución de Dirección para Lista Gris (Puntos de Control #2 y #3) */}
      {selectedProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-xl w-full p-6 border border-white/15 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-400" />
                <span>¿Autoriza Dirección? — Dictamen de Lista Gris ({selectedProfile.expedienteId})</span>
              </h4>
              <button
                onClick={() => setSelectedProfile(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <button
                type="button"
                onClick={() => setDecision('AUTHORIZED_CONTINUE')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  decision === 'AUTHORIZED_CONTINUE'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Autorizar (CLEARED_EDD)</span>
                </div>
                <p className="text-[11px] mt-1 text-slate-300">
                  Sí, continuar captura con Grado de Riesgo ALTO y Debida Diligencia Reforzada.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDecision('REJECTED_GENERATE_INUSUAL')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  decision === 'REJECTED_GENERATE_INUSUAL'
                    ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-rose-400" />
                  <span>Rechazar (Reporte Inusual 24h)</span>
                </div>
                <p className="text-[11px] mt-1 text-slate-300">
                  Bloquea expediente y genera Reporte SITI Tipo 2 con prefijo "Lista de Personas Bloqueadas. ".
                </p>
              </button>
            </div>

            {decision === 'REJECTED_GENERATE_INUSUAL' && (
              <div>
                <label className="block text-xs text-slate-300 mb-1 font-semibold">
                  Modalidad de Columna 11 (Monto) para Layout SITI UIF
                </label>
                <select
                  value={tentativeAmountMode}
                  onChange={(e) => setTentativeAmountMode(e.target.value as TentativeAmountReportingMode)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-slate-100"
                >
                  <option value="ZERO_EOPERATIVO">
                    ZERO_EOPERATIVO — Columna 11 en '0.00' (Reporte Eoperativo estricto SHCP)
                  </option>
                  <option value="REQUESTED_AMOUNT_BLOCKED">
                    REQUESTED_AMOUNT_BLOCKED — Columna 11 con Monto Solicitado Bloqueado
                  </option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-300 mb-1 font-semibold">
                Sustento y Justificación de Dirección / Oficial de Cumplimiento (mínimo 10 caracteres)
              </label>
              <textarea
                rows={3}
                value={justificationNotes}
                onChange={(e) => setJustificationNotes(e.target.value)}
                placeholder="Documente el acuerdo de Dirección General y el análisis del Oficial de Cumplimiento..."
                className="w-full p-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedProfile(null)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs text-slate-300 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDirectionSubmit()}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-[#249E82] hover:bg-[#1e856e] text-white text-xs font-bold"
              >
                {submitting ? 'Procesando...' : 'Confirmar Resolución de Dirección'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
