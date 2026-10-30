import React, { useState } from 'react';
import {
  FileWarning,
  Clock,
  Download,
  Calculator,
  MessageSquareWarning,
  Gavel,
  FlaskConical,
  FilePlus2,
} from 'lucide-react';
import { CnbvReportAndWhistleblowingItem } from '../../types';

export interface PldSitiReportsAndCccPanelProps {
  readonly token: string;
  readonly reports: ReadonlyArray<CnbvReportAndWhistleblowingItem>;
  readonly onRefreshRequested: () => Promise<void>;
  readonly onNotifyFeedback: (feedback: { type: 'success' | 'error'; message: string }) => void;
}

const DEMO_FRACTIONED_OPS = [
  {
    operationId: 'sim_frac_01',
    blindCurp: 'blind_demo_frac_oct_2026',
    subjectMaskedName: 'JUAN P*** D*** (DEMO)',
    subjectCurpMasked: 'PEDJ8204********04',
    subjectRfcMasked: 'PEDJ820410***',
    hubCode: 'HUB-CUU',
    amountMxn: '40000.00',
    operationDateIso: '2026-10-04',
  },
  {
    operationId: 'sim_frac_02',
    blindCurp: 'blind_demo_frac_oct_2026',
    subjectMaskedName: 'JUAN P*** D*** (DEMO)',
    subjectCurpMasked: 'PEDJ8204********04',
    subjectRfcMasked: 'PEDJ820410***',
    hubCode: 'HUB-CUU',
    amountMxn: '40000.00',
    operationDateIso: '2026-10-11',
  },
  {
    operationId: 'sim_frac_03',
    blindCurp: 'blind_demo_frac_oct_2026',
    subjectMaskedName: 'JUAN P*** D*** (DEMO)',
    subjectCurpMasked: 'PEDJ8204********04',
    subjectRfcMasked: 'PEDJ820410***',
    hubCode: 'HUB-CUU',
    amountMxn: '40000.00',
    operationDateIso: '2026-10-19',
  },
  {
    operationId: 'sim_frac_04',
    blindCurp: 'blind_demo_frac_oct_2026',
    subjectMaskedName: 'JUAN P*** D*** (DEMO)',
    subjectCurpMasked: 'PEDJ8204********04',
    subjectRfcMasked: 'PEDJ820410***',
    hubCode: 'HUB-CUU',
    amountMxn: '40000.00',
    operationDateIso: '2026-10-26',
  },
];

export const PldSitiReportsAndCccPanel: React.FC<PldSitiReportsAndCccPanelProps> = ({
  token,
  reports,
  onRefreshRequested,
  onNotifyFeedback,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [selectedReportForCcc, setSelectedReportForCcc] =
    useState<CnbvReportAndWhistleblowingItem | null>(null);
  const [cccDecision, setCccDecision] = useState<'REPORT_TO_UIF' | 'DISMISSED_WITH_JUSTIFICATION'>(
    'REPORT_TO_UIF'
  );
  const [cccJustificationNotes, setCccJustificationNotes] = useState('');
  const [lastDryRunPreview, setLastDryRunPreview] = useState<{
    accumulatedAmountMxn: string;
    accumulatedAmountUsd: string;
    qualifyingOperationsCount: number;
    fxRateUsdMxn: string;
  } | null>(null);

  const handleDownloadSiti41ColTxt = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/pld/siti-layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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

      onNotifyFeedback({
        type: 'success',
        message: `Layout Oficial .TXT SITI 41 Columnas descargado (${data.totalRows} registros separados por ';' y CRLF) | SHA-256: ${data.sha256Hash?.slice(0, 16)}...`,
      });
    } catch (err: unknown) {
      onNotifyFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error descargando Layout SITI',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEvaluateSlaClocks = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/pld/evaluate-sla-clocks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as {
        evaluatedReportsCount?: number;
        semesterReviewsDueCount?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Error evaluando Reloj Normativo CNBV');
      onNotifyFeedback({
        type: 'success',
        message: `Reloj Normativo CNBV Evaluado (60d CCC + 3d hábiles UIF): ${data.evaluatedReportsCount} reportes auditados y ${data.semesterReviewsDueCount} revisiones semestrales (180d) detectadas.`,
      });
      await onRefreshRequested();
    } catch (err: unknown) {
      onNotifyFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error evaluando Reloj SLA',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFractionedEvaluation = async (dryRunMode: boolean) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/pld/evaluate-fractioned-cash', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dryRun: dryRunMode,
          operations: DEMO_FRACTIONED_OPS,
        }),
      });
      const data = (await res.json()) as {
        dryRun?: boolean;
        fxRateUsdMxn?: string;
        triggeredFractionedReports?: Array<{
          reportId: string;
          qualifyingOperationsCount: number;
          accumulatedAmountMxn: string;
          accumulatedAmountUsd: string;
        }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Error evaluando operativa fraccionada');
      const firstHit = data.triggeredFractionedReports?.[0];

      if (dryRunMode && firstHit) {
        setLastDryRunPreview({
          accumulatedAmountMxn: firstHit.accumulatedAmountMxn,
          accumulatedAmountUsd: firstHit.accumulatedAmountUsd,
          qualifyingOperationsCount: firstHit.qualifyingOperationsCount,
          fxRateUsdMxn: data.fxRateUsdMxn ?? '19.850000',
        });
        onNotifyFeedback({
          type: 'success',
          message: `Simulación Read-Only (dryRun=true, Cero INSERT en BD): ${firstHit.qualifyingOperationsCount} pagos individuales >= $500 USD acumulan $${firstHit.accumulatedAmountMxn} MXN ($${firstHit.accumulatedAmountUsd} USD >= $7,500 USD). Haz clic en "Generar Reporte Formal" si deseas persistirlo.`,
        });
      } else if (!dryRunMode && firstHit) {
        setLastDryRunPreview(null);
        onNotifyFeedback({
          type: 'success',
          message: `Reporte Formal de Operación Fraccionada persistido (${firstHit.reportId}) por $${firstHit.accumulatedAmountMxn} MXN ($${firstHit.accumulatedAmountUsd} USD) y sellado en WORM.`,
        });
        await onRefreshRequested();
      }
    } catch (err: unknown) {
      onNotifyFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error en motor de operaciones fraccionadas',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickRoipDemo = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/pld/whistleblowing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
      const data = (await res.json()) as {
        reportId?: string;
        investigationDeadlineAt?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Error registrando ROIP');
      onNotifyFeedback({
        type: 'success',
        message: `Denuncia Confidencial ROIP registrada (${data.reportId}, SITI Tipo '3'). Límite de investigación 60 días naturales: ${data.investigationDeadlineAt?.slice(0, 10)}.`,
      });
      await onRefreshRequested();
    } catch (err: unknown) {
      onNotifyFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error registrando denuncia ROIP',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCccDecision = async () => {
    if (!selectedReportForCcc) return;
    if (cccJustificationNotes.trim().length < 10) {
      onNotifyFeedback({
        type: 'error',
        message: 'El acta de sesión del CCC requiere al menos 10 caracteres de justificación.',
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/pld/reports/${selectedReportForCcc.id}/ccc-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cccDecision,
          cccJustificationNotes,
        }),
      });
      const data = (await res.json()) as {
        reportId?: string;
        cccDecision?: string;
        uifTransmissionDeadlineAt?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Error registrando sesión del CCC');
      onNotifyFeedback({
        type: 'success',
        message:
          cccDecision === 'REPORT_TO_UIF'
            ? `Sesión CCC registrada para ${data.reportId}: Aprobado envío a UIF. Fecha límite fatal (3 días hábiles bancarios CNBV): ${data.uifTransmissionDeadlineAt?.slice(0, 10)}.`
            : `Sesión CCC registrada para ${data.reportId}: Archivado con justificación en acta (DISMISSED_WITH_JUSTIFICATION).`,
      });
      setSelectedReportForCcc(null);
      setCccJustificationNotes('');
      await onRefreshRequested();
    } catch (err: unknown) {
      onNotifyFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error procesando sesión del CCC',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <FileWarning className="w-4 h-4 text-[#00D1FF]" />
          <span>
            Bandeja de Reportes Regulatorios SITI CNBV/UIF (Columna 11 Monto, Columna 40 y Sesión CCC 60+3d)
          </span>
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleFractionedEvaluation(true)}
            disabled={submitting}
            className="px-2.5 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-[11px] font-bold flex items-center gap-1"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Simular Fraccionadas ($500-$7.5k USD · Read-Only)</span>
          </button>
          {lastDryRunPreview && (
            <button
              type="button"
              onClick={() => void handleFractionedEvaluation(false)}
              disabled={submitting}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 shadow"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>Generar Reporte Formal (${lastDryRunPreview.accumulatedAmountUsd} USD)</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleEvaluateSlaClocks()}
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
              <th className="py-2 px-3 text-right">Sesión CCC</th>
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
                  {rep.uifTransmissionDeadlineAt && (
                    <div className="text-[10px] text-[#00D1FF] font-mono mt-0.5">
                      Límite 3d UIF: {rep.uifTransmissionDeadlineAt.slice(0, 10)}
                    </div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right">
                  {rep.cccDecision === 'PENDING_CCC' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReportForCcc(rep);
                        setCccDecision('REPORT_TO_UIF');
                        setCccJustificationNotes('');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#396CAE]/30 hover:bg-[#396CAE]/50 border border-[#00D1FF]/40 text-[#00D1FF] text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <Gavel className="w-3.5 h-3.5" />
                      <span>Sesionar CCC</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-mono text-emerald-400">{rep.cccDecision}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedReportForCcc && (
        <div className="p-4 rounded-xl bg-slate-900 border border-[#00D1FF]/40 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#00D1FF]">
              Sesión del Comité de Comunicación y Control (CCC) — Reporte {selectedReportForCcc.id}
            </span>
            <button
              type="button"
              onClick={() => setSelectedReportForCcc(null)}
              className="text-slate-400 hover:text-white"
            >
              Cerrar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCccDecision('REPORT_TO_UIF')}
              className={`p-2.5 rounded-xl border text-left ${
                cccDecision === 'REPORT_TO_UIF'
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                  : 'bg-white/5 border-white/10 text-slate-300'
              }`}
            >
              <div className="font-bold">REPORT_TO_UIF — Aprobar Envío a UIF (SITI)</div>
              <div className="text-[11px] text-slate-300">
                Activa la ventana fatal de 3 días hábiles bancarios CNBV.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setCccDecision('DISMISSED_WITH_JUSTIFICATION')}
              className={`p-2.5 rounded-xl border text-left ${
                cccDecision === 'DISMISSED_WITH_JUSTIFICATION'
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                  : 'bg-white/5 border-white/10 text-slate-300'
              }`}
            >
              <div className="font-bold">DISMISSED_WITH_JUSTIFICATION — Desestimar con Acta</div>
              <div className="text-[11px] text-slate-300">
                Archiva con resguardo regulatorio por 10 años sin envío SITI.
              </div>
            </button>
          </div>
          <textarea
            rows={2}
            value={cccJustificationNotes}
            onChange={(e) => setCccJustificationNotes(e.target.value)}
            placeholder="Asiente el acuerdo del Comité (CCC) y el dictamen del Oficial de Cumplimiento (Lic. Gerardo Olvera)..."
            className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/15 text-white"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSelectedReportForCcc(null)}
              className="px-3 py-1.5 rounded-lg bg-white/10 text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSubmitCccDecision()}
              disabled={submitting}
              className="px-3.5 py-1.5 rounded-lg bg-[#249E82] text-white font-bold"
            >
              Firmar Acta CCC y Calcular 3 Días Hábiles CNBV
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
