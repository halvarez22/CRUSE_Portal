import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Upload,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  FileText,
  X,
} from 'lucide-react';
import {
  AuthSession,
  PldComplianceOverview,
  PldHitAlertItem,
  PldListType,
} from '../../types';
import { PldGrayListDirectionPanel } from './PldGrayListDirectionPanel';

interface PldComplianceViewProps {
  session: AuthSession;
}

const LIST_TYPE_LABELS: Record<PldListType, string> = {
  SAT_69B_DEFINITIVO: 'SAT Art. 69-B Definitivo (EFOS)',
  SAT_69B_PRESUNTO: 'SAT Art. 69-B Presunto',
  UIF_PERSONAS_BLOQUEADAS: 'UIF Lista de Personas Bloqueadas',
  OFAC_SDN: 'OFAC SDN (Tesoro EE.UU.)',
  PEP_NACIONAL: 'Persona Políticamente Expuesta (PEP)',
};

export const PldComplianceView: React.FC<PldComplianceViewProps> = ({ session }) => {
  const [overview, setOverview] = useState<PldComplianceOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);

  const [selectedListType, setSelectedListType] = useState<PldListType>('SAT_69B_DEFINITIVO');
  const [officialReference, setOfficialReference] = useState('DOF-SAT-69B-2026-Q4');
  const [csvContent, setCsvContent] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [selectedAlert, setSelectedAlert] = useState<PldHitAlertItem | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<'CONFIRMED_BLOCKED' | 'CLEARED_EDD' | 'FALSE_POSITIVE'>('CONFIRMED_BLOCKED');
  const [justificationNotes, setJustificationNotes] = useState('');

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pld/overview', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = (await res.json()) as PldComplianceOverview & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Error cargando consola PLD/FT');
      setOverview(data);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error de red consultando PLD/FT',
      });
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvContent(typeof ev.target?.result === 'string' ? ev.target.result : '');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleIngestList = async () => {
    if (!csvContent.trim()) {
      setFeedback({
        type: 'error',
        message: 'Selecciona un archivo CSV/TXT o ingresa registros con encabezado CURP,NOMBRE.',
      });
      return;
    }
    setIngestLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/pld/lists/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          csvContent,
          defaultListType: selectedListType,
          defaultOfficialReference: officialReference,
        }),
      });
      const data = (await res.json()) as {
        sourceFileHash?: string;
        insertedCount?: number;
        skippedDuplicatesCount?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Error al ingerir lista PLD/FT');
      setFeedback({
        type: 'success',
        message: `Lista oficial ingerida con Blind Indexing Zero-PII. SourceSHA256: ${data.sourceFileHash?.slice(0, 16)}... | Nuevos: ${data.insertedCount ?? 0} | Omitidos idempotentes: ${data.skippedDuplicatesCount ?? 0}`,
      });
      setCsvContent('');
      await fetchOverview();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error validando lista PLD/FT',
      });
    } finally {
      setIngestLoading(false);
    }
  };

  const handleRunPortfolioScreening = async () => {
    setScreeningLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/pld/screen-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      });
      const data = (await res.json()) as {
        batch?: {
          id: string;
          hitsDetectedCount: number;
          newAlertsCreatedCount: number;
          batchManifestHash: string;
        };
        error?: string;
      };
      if (!res.ok || !data.batch) throw new Error(data.error || 'Error ejecutando barrido PLD/FT');
      setFeedback({
        type: 'success',
        message: `Barrido WORM ${data.batch.id} completado en Una Sola Pasada CTE. Coincidencias: ${data.batch.hitsDetectedCount} | Nuevas Alertas: ${data.batch.newAlertsCreatedCount} | Sello SHA-256: ${data.batch.batchManifestHash.slice(0, 16)}...`,
      });
      await fetchOverview();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error en barrido de cartera PLD/FT',
      });
    } finally {
      setScreeningLoading(false);
    }
  };

  const handleDownloadCertificate = () => {
    const latest = overview?.latestBatch;
    if (!latest) return;
    const blob = new Blob([latest.certificateActa], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CERTIFICADO_PLD_CNBV_${latest.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleResolveAlert = async () => {
    if (!selectedAlert) return;
    setResolveLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/pld/alerts/${selectedAlert.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ resolutionStatus, justificationNotes }),
      });
      const data = (await res.json()) as { resolutionId?: string; resolutionHash?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Error emitiendo dictamen PLD/FT');
      setFeedback({
        type: 'success',
        message: `Dictamen WORM (${resolutionStatus}) asentado para alerta ${selectedAlert.id}. Sello SHA-256: ${data.resolutionHash?.slice(0, 16)}...`,
      });
      setSelectedAlert(null);
      setJustificationNotes('');
      await fetchOverview();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al dictaminar alerta',
      });
    } finally {
      setResolveLoading(false);
    }
  };

  const kpis = overview?.kpis;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="p-6 rounded-3xl glass-panel border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-[#00D1FF]" />
            <h2 className="text-lg font-bold text-white">
              Motor Automatizado PLD/FT — Listas 69-B SAT, UIF, OFAC y PEPs (Zero-PII)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Cruce criptográfico en Una Sola Pasada CTE mediante Blind Indexing HMAC-SHA256 sin desencriptar PII en reposo (Art. 95 Bis LGOAAC / CNBV).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRunPortfolioScreening}
            disabled={screeningLoading}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#249E82] to-[#396CAE] hover:opacity-95 text-white text-xs font-bold shadow-lg flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {screeningLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>Ejecutar Barrido Integral (Cartera + Fondeo)</span>
          </button>

          {overview?.latestBatch && (
            <button
              onClick={handleDownloadCertificate}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-slate-100 text-xs font-semibold flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4 text-[#00D1FF]" />
              <span>Descargar Acta CNBV/UIF ({overview.latestBatch.id.slice(0, 14)})</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl glass-card border border-white/10">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Índices Ciegos en Listas PLD/FT</p>
          <p className="text-2xl font-extrabold text-white mt-1">{kpis?.totalRiskEntries ?? 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            69-B: {kpis?.sat69bCount ?? 0} · UIF/OFAC: {kpis?.uifOfacCount ?? 0} · PEPs: {kpis?.pepCount ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-2xl glass-card border border-amber-500/30 bg-amber-500/5">
          <p className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold">Alertas Pendientes de Dictamen</p>
          <p className="text-2xl font-extrabold text-amber-400 mt-1">{kpis?.pendingAlertsCount ?? 0}</p>
          <p className="text-[11px] text-amber-200/80 mt-1">Activación de crédito bloqueada preventivamente</p>
        </div>

        <div className="p-4 rounded-2xl glass-card border border-rose-500/30 bg-rose-500/5">
          <p className="text-[11px] uppercase tracking-wider text-rose-300 font-semibold">Sujetos Bloqueados Confirmados</p>
          <p className="text-2xl font-extrabold text-rose-400 mt-1">{kpis?.confirmedBlockedCount ?? 0}</p>
          <p className="text-[11px] text-rose-200/80 mt-1">
            Exposición retenida: ${Number(kpis?.totalExposureBlockedOrPending ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
          </p>
        </div>

        <div className="p-4 rounded-2xl glass-card border border-emerald-500/30 bg-emerald-500/5">
          <p className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">Último Sello WORM de Barrido</p>
          <p className="text-xs font-mono font-bold text-emerald-400 mt-2 truncate">
            {overview?.latestBatch ? `#${overview.latestBatch.batchManifestHash.slice(0, 20)}...` : 'Sin barrido registrado'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Liberados / Falso Positivo: {kpis?.clearedOrFalsePositiveCount ?? 0}</p>
        </div>
      </div>

      <div className="p-6 rounded-3xl glass-panel border border-white/10 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#249E82]" />
            <h3 className="text-sm font-bold text-white">
              Ingestar Lista Oficial (69-B SAT / UIF / OFAC / PEPs)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Encabezado esperado: CURP,NOMBRE,OFICIO (Delimitador: , ; | TAB)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1 font-semibold">Tipo de Lista Oficial</label>
            <select
              value={selectedListType}
              onChange={(e) => setSelectedListType(e.target.value as PldListType)}
              className="w-full px-3 py-2 rounded-xl glass-input text-xs text-slate-100 focus:outline-none"
            >
              {Object.entries(LIST_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k} className="bg-slate-900 text-slate-100">{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1 font-semibold">Oficio / Publicación DOF</label>
            <input
              type="text"
              value={officialReference}
              onChange={(e) => setOfficialReference(e.target.value)}
              className="w-full px-3 py-2 rounded-xl glass-input text-xs text-slate-100 focus:outline-none"
              placeholder="Ej. DOF-SAT-500-05-2026"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1 font-semibold">Cargar Archivo CSV / TXT Oficial</label>
            <label className="w-full px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs text-slate-200 flex items-center justify-center gap-2 cursor-pointer transition-colors">
              <Upload className="w-4 h-4 text-[#00D1FF]" />
              <span>Seleccionar archivo CSV/TXT...</span>
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        <textarea
          rows={3}
          value={csvContent}
          onChange={(e) => setCsvContent(e.target.value)}
          placeholder={'CURP,NOMBRE,OFICIO\nGOMA850101HCHLRN09,JUAN PEREZ CONTRIBUYENTE EFOS,DOF-69B-2026'}
          className="w-full p-3 rounded-xl glass-input text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              const lines = csvContent
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l.length > 0 && !l.toUpperCase().startsWith('CURP'));
              setFeedback({
                type: lines.length > 0 ? 'success' : 'error',
                message:
                  lines.length > 0
                    ? `Previsualización lista: ${lines.length} registro(s) detectados para la lista ${LIST_TYPE_LABELS[selectedListType]}. Haz clic en "Sellar e Ingresar a Base de Datos" para confirmar.`
                    : 'No se detectaron renglones válidos para previsualizar. Selecciona un archivo CSV o ingresa registros.',
              });
            }}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-all"
          >
            Previsualizar
          </button>
          <button
            onClick={handleIngestList}
            disabled={ingestLoading}
            className="px-5 py-2 rounded-xl bg-[#249E82] hover:bg-[#1e856e] text-white text-xs font-bold shadow-lg flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {ingestLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span>Sellar e Ingresar a Base de Datos</span>
          </button>
        </div>
      </div>

      <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">
              Alertas de Coincidencia PLD/FT Proyectadas ({overview?.alerts.length ?? 0})
            </h3>
          </div>
          <button
            onClick={() => void fetchOverview()}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-xs flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase font-mono text-[10px]">
              <tr>
                <th className="py-3 px-4">Fecha / Canal</th>
                <th className="py-3 px-4">Entidad & Sujeto (Zero-PII)</th>
                <th className="py-3 px-4">Blind Index Prefix</th>
                <th className="py-3 px-4">Lista Oficial & Nivel</th>
                <th className="py-3 px-4">Exposición MXN</th>
                <th className="py-3 px-4">Estado Proyectado</th>
                <th className="py-3 px-4 text-right">Dictamen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(overview?.alerts ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No existen alertas PLD/FT registradas.
                  </td>
                </tr>
              ) : (
                (overview?.alerts ?? []).map((alert) => (
                  <tr key={alert.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                      <div>{alert.createdAt.replace('T', ' ').slice(0, 19)}</div>
                      <span className="text-[10px] text-[#00D1FF]">{alert.detectionChannel}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">[{alert.entityType}] {alert.entityMaskedName}</div>
                      <div className="text-[11px] font-mono text-slate-400">{alert.entityMaskedId} · ID: {alert.entityId}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-400">#{alert.blindIndexPrefix}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-200">{alert.listType}</div>
                      <div className="text-[10px] text-slate-400">{alert.officialReference}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-200">
                      ${Number(alert.exposureAmount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          alert.projectedStatus === 'PENDING_REVIEW'
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : alert.projectedStatus === 'CONFIRMED_BLOCKED'
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {alert.projectedStatus}
                      </span>
                      {alert.latestResolutionNotes && (
                        <p className="text-[10px] text-slate-400 mt-1 max-w-xs truncate">{alert.latestResolutionNotes}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedAlert(alert);
                          setResolutionStatus('CONFIRMED_BLOCKED');
                          setJustificationNotes('');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#396CAE] hover:bg-[#2d5891] text-white text-[11px] font-semibold transition-all"
                      >
                        Dictaminar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fase 2.3: Rama Lista Gris (¿Autoriza Dirección?), Matriz de Riesgo Inicial y Reportes Tentativos */}
      <PldGrayListDirectionPanel
        session={session}
        onDecisionCompleted={() => void fetchOverview()}
      />

      {selectedAlert && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-3xl bg-slate-900 border border-white/15 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#00D1FF]" />
                <h4 className="text-sm font-bold text-white">Dictamen Inmutable del Oficial de Cumplimiento (WORM)</h4>
              </div>
              <button onClick={() => setSelectedAlert(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1">
              <p className="text-slate-300"><span className="text-slate-400">Alerta:</span> <span className="font-mono font-bold">{selectedAlert.id}</span></p>
              <p className="text-slate-300"><span className="text-slate-400">Sujeto Protegido:</span> {selectedAlert.entityMaskedName} ({selectedAlert.entityMaskedId})</p>
              <p className="text-slate-300"><span className="text-slate-400">Lista Coincidente:</span> {selectedAlert.listType} ({selectedAlert.officialReference})</p>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1 font-semibold">Resolución Regulatoria</label>
              <select
                value={resolutionStatus}
                onChange={(e) => setResolutionStatus(e.target.value as 'CONFIRMED_BLOCKED' | 'CLEARED_EDD' | 'FALSE_POSITIVE')}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs text-slate-100"
              >
                <option value="CONFIRMED_BLOCKED" className="bg-slate-900">CONFIRMED_BLOCKED — Confirmar Bloqueo Definitivo (Rechazar Expediente)</option>
                <option value="CLEARED_EDD" className="bg-slate-900">CLEARED_EDD — Autorizado con Debida Diligencia Reforzada (Liberar)</option>
                <option value="FALSE_POSITIVE" className="bg-slate-900">FALSE_POSITIVE — Descartar por Homonimia / Falso Positivo (Liberar)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1 font-semibold">Justificación Forense Obligatoria (mínimo 10 caracteres)</label>
              <textarea
                rows={3}
                value={justificationNotes}
                onChange={(e) => setJustificationNotes(e.target.value)}
                placeholder="Detalle el sustento documental del expediente u oficio SAT/UIF verificado..."
                className="w-full p-3 rounded-xl glass-input text-xs text-slate-100 placeholder-slate-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setSelectedAlert(null)} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-300 font-semibold">
                Cancelar
              </button>
              <button
                onClick={handleResolveAlert}
                disabled={resolveLoading}
                className="px-4 py-2 rounded-xl bg-[#249E82] hover:bg-[#1e856e] text-white text-xs font-bold shadow-lg disabled:opacity-50"
              >
                {resolveLoading ? 'Sellando...' : 'Firmar y Sellar Dictamen WORM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
