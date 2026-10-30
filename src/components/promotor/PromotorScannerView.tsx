import React, { useState, useRef, useEffect, useCallback } from 'react';
import Decimal from 'decimal.js';
import {
  Camera, RefreshCw, CheckCircle2, ShieldAlert, ArrowLeft,
  Send, Sparkles, AlertCircle, Zap, ShieldCheck, Edit3,
} from 'lucide-react';
import {
  AuthSession, DeterministicOcrExtractionResult, ExpedienteItem,
  IneQualityFlags, OcrDocumentSourceType, ProductId,
} from '../../types';
import { evaluateIneFrameQuality } from '../../services/scanner/ineCaptureQualityAnalyzer';
import { playCameraShutterSound } from '../../services/scanner/cameraShutterSound';
import { syncAndPurgeExpediente, APP_PURGE_COMPLETE_EVENT } from '../../services/sync/syncAckService';
import { useDrainPendingPurge } from '../../hooks/useDrainPendingPurge';
import { sanitizeDecimalString } from '../../config/riskMatrixWeights';

interface PromotorScannerViewProps {
  session: AuthSession;
  onBackToPortal: () => void;
}

export const PromotorScannerView: React.FC<PromotorScannerViewProps> = ({ session, onBackToPortal }) => {
  useDrainPendingPurge();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [documentType, setDocumentType] = useState<OcrDocumentSourceType>('INE_FRONT');
  const [simulateLowConfidenceMode, setSimulateLowConfidenceMode] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrEvaluation, setOcrEvaluation] = useState<DeterministicOcrExtractionResult | null>(null);
  const [assistedReviewConfirmed, setAssistedReviewConfirmed] = useState(false);

  const [quality, setQuality] = useState<IneQualityFlags>({
    isBlur: false, isTooDark: false, isTooBright: false, isTilted: false, isAcceptable: true,
    laplacianScore: 120, avgBrightness: 135, edgeRatio: 1.05,
    feedbackText: '✅ Encuadre óptimo: Listo para captura',
  });

  const [capturedData, setCapturedData] = useState<{
    fullName: string; curp: string; rfc: string; voterId: string;
    address: string; occupation: string; fortnightlyNetIncome: string;
    phone: string; requestedAmountMxn: string; termFortnights: number;
    productType: ProductId; thumbBase64?: string;
  } | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string; syncId?: string } | null>(null);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Cámara web no soportada por el navegador');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
        setStreamActive(true);
      }
    } catch (err: unknown) {
      setCameraError(err instanceof Error ? err.message : 'No se pudo acceder a la cámara');
      setStreamActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setStreamActive(false);
    }
  }, []);

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (!streamActive) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== 4) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      canvas.width = 320;
      canvas.height = 200;
      ctx.drawImage(video, 0, 0, 320, 200);
      try {
        const imgData = ctx.getImageData(0, 0, 320, 200);
        setQuality(evaluateIneFrameQuality(imgData.data, 320, 200));
      } catch {
        /* Ignora cross-origin */
      }
    }, 250);
    return () => clearInterval(interval);
  }, [streamActive]);

  useEffect(() => {
    const handlePurge = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.info(`[PWA Promotor] Evento ${APP_PURGE_COMPLETE_EVENT} recibido para ID: ${detail?.id}`);
    };
    window.addEventListener(APP_PURGE_COMPLETE_EVENT, handlePurge);
    return () => window.removeEventListener(APP_PURGE_COMPLETE_EVENT, handlePurge);
  }, []);

  const handleCapture = async () => {
    playCameraShutterSound();
    setOcrLoading(true);
    setSyncResult(null);
    setAssistedReviewConfirmed(false);

    let thumbBase64 = '';
    if (canvasRef.current) {
      try {
        thumbBase64 = canvasRef.current.toDataURL('image/jpeg', 0.6);
      } catch {
        thumbBase64 = '';
      }
    }

    try {
      const res = await fetch('/api/promotores/ocr-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          imageBase64: thumbBase64,
          documentType,
          requestedAmountMxn: '25000.00',
          termFortnights: 24,
          productType: 'normal',
          hubRegion: 'CHIHUAHUA',
          fallbackExtractedStrings: simulateLowConfidenceMode
            ? {
                extracted_curp: 'MECR881315HXXNRB09',
                extracted_rfc: 'INVALID_RFC',
                extracted_voter_id: 'SHORT_INE',
                extracted_fortnightly_net_income: '14500.00',
              }
            : undefined,
        }),
      });

      const data = (await res.json()) as DeterministicOcrExtractionResult & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Error al analizar documento con motor OCR');

      setOcrEvaluation(data);
      setCapturedData({
        fullName: data.rawExtracted.extracted_full_name,
        curp: data.rawExtracted.extracted_curp,
        rfc: data.rawExtracted.extracted_rfc,
        voterId: data.rawExtracted.extracted_voter_id,
        address: data.rawExtracted.extracted_address,
        occupation: data.rawExtracted.extracted_occupation,
        fortnightlyNetIncome: data.rawExtracted.extracted_fortnightly_net_income,
        phone: '614-239-1144',
        requestedAmountMxn: '25000.00',
        termFortnights: 24,
        productType: 'normal',
        thumbBase64: thumbBase64 || undefined,
      });
    } catch (err: unknown) {
      setSyncResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Fallo al ejecutar extracción OCR en servidor.',
      });
    } finally {
      setOcrLoading(false);
    }
  };

  // Punto de Control #1: Evaluación determinista con Decimal.js
  const globalConfDec = sanitizeDecimalString(ocrEvaluation?.confidence.globalConfidenceScore, '0.00');
  const isLowConfidenceOrException =
    globalConfDec.lessThan(new Decimal('80.00')) ||
    ocrEvaluation?.ocrStatus === 'LOW_CONFIDENCE_EXCEPTION' ||
    ocrEvaluation?.ocrStatus === 'DUPLICATE_DETECTED';

  const isSyncBlockedByException = isLowConfidenceOrException && !assistedReviewConfirmed;

  const handleSyncAndPurge = async () => {
    if (!capturedData || !ocrEvaluation || isSyncBlockedByException) return;
    setSyncing(true);
    setSyncResult(null);

    const expediente: ExpedienteItem = {
      id: `exp_${Date.now()}`,
      createdAt: new Date().toISOString(),
      fullName: capturedData.fullName,
      curp: capturedData.curp,
      curpMasked: `${capturedData.curp.slice(0, 4)}********${capturedData.curp.slice(-4)}`,
      blindCurp: '',
      voterId: capturedData.voterId,
      address: capturedData.address,
      phone: capturedData.phone,
      requestedAmount: 25000,
      termFortnights: capturedData.termFortnights,
      productType: capturedData.productType,
      status: 'capturado',
      promotorEmail: session.user.email,
    };

    const effectiveOcrStatus = assistedReviewConfirmed ? 'MANUAL_CORRECTED' : ocrEvaluation.ocrStatus;

    const ack = await syncAndPurgeExpediente(expediente, session.token, {
      documentImageSha256: ocrEvaluation.duplicateCheck.documentImageSha256,
      ocrConfidenceScore: ocrEvaluation.confidence.globalConfidenceScore,
      ocrStatus: effectiveOcrStatus,
      occupationLabel: capturedData.occupation,
      fortnightlyNetIncomeMxn: capturedData.fortnightlyNetIncome,
      riskMatrixScore: ocrEvaluation.riskMatrix.weightedScore,
      initialRiskGrade: ocrEvaluation.riskMatrix.initialRiskGrade,
      requiresDirectionAuthorization: ocrEvaluation.riskMatrix.requiresDirectionAuthorization,
    });

    setSyncing(false);

    if (ack.ok) {
      setSyncResult({
        ok: true,
        message: `Sincronización exitosa (ACK ${ack.status}). Score OCR: ${ocrEvaluation.confidence.globalConfidenceScore}% | Grado de Riesgo Inicial: ${ocrEvaluation.riskMatrix.initialRiskGrade} (${ocrEvaluation.riskMatrix.weightedScore} pts). Memoria local y RAM de servidor purgadas (Zero-PII).`,
        syncId: ack.syncId,
      });
      setCapturedData(null);
      setOcrEvaluation(null);
      setAssistedReviewConfirmed(false);
    } else {
      setSyncResult({
        ok: false,
        message: `Fallo de envío: ${ack.error}. Los datos permanecen protegidos para no perder la solicitud.`,
      });
    }
  };

  return (
    <div className="dark min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="px-4 py-3 bg-slate-900/90 border-b border-white/10 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToPortal}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Volver al Portal"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-sm font-bold text-white">Cruse PWA Móvil — OCR + Matriz PLD</h1>
            </div>
            <p className="text-[11px] text-slate-400">
              {session.user.name} ({session.user.email})
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-lg bg-[#249E82]/20 border border-[#249E82]/40 text-[#249E82] text-xs font-semibold flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" />
          Zero-PII RAM + Local
        </span>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col gap-4">
        <div className="p-3 rounded-2xl bg-slate-900/90 border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold">Documento a Escáner:</span>
            <select
              aria-label="Seleccionar tipo de documento"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as OcrDocumentSourceType)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-slate-100"
            >
              <option value="INE_FRONT">INE (Anverso)</option>
              <option value="INE_BACK">INE (Reverso)</option>
              <option value="PAYSTUB">Recibo de Nómina</option>
              <option value="PROOF_OF_ADDRESS">Comprobante de Domicilio</option>
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-[11px] text-amber-300">
            <input
              type="checkbox"
              checked={simulateLowConfidenceMode}
              onChange={(e) => setSimulateLowConfidenceMode(e.target.checked)}
              className="accent-amber-400"
            />
            <span>Simular Documento Ilegible / Baja Confianza (&lt; 80%)</span>
          </label>
        </div>

        {syncResult && (
          <div
            className={`p-4 rounded-2xl border text-xs flex items-start gap-3 animate-fade-in ${
              syncResult.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {syncResult.ok ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold text-sm">
                {syncResult.ok ? '✅ Expediente Sincronizado' : 'Error de Sincronización'}
              </p>
              <p className="mt-1">{syncResult.message}</p>
            </div>
          </div>
        )}

        <div className="relative rounded-3xl overflow-hidden bg-black aspect-[4/3] border-2 border-white/20 shadow-2xl flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              streamActive ? 'opacity-100' : 'opacity-20'
            }`}
          />
          <canvas ref={canvasRef} className="hidden" />

          {!streamActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/80">
              <Camera className="w-12 h-12 text-slate-500 mb-3 animate-bounce" />
              <p className="text-sm font-medium text-slate-300 mb-1">Cámara en Espera o No Disponible</p>
              <p className="text-xs text-slate-500 max-w-xs mb-4">
                {cameraError || 'Pulsa el botón del obturador abajo para ejecutar extracción OCR asistida.'}
              </p>
              <button
                onClick={startCamera}
                className="px-4 py-2 rounded-xl bg-[#249E82] text-white text-xs font-semibold hover:bg-[#1e856e] transition-colors"
              >
                Reintentar Conexión
              </button>
            </div>
          )}

          <div className="absolute top-3 left-3 right-3 bg-black/70 backdrop-blur-md rounded-xl p-2.5 flex items-center justify-between text-xs border border-white/10">
            <span className="font-medium text-slate-200">{quality.feedbackText}</span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[11px]">
              Nitidez: {quality.laplacianScore} | Brillo: {quality.avgBrightness}
            </span>
          </div>

          <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center">
            <button
              onClick={handleCapture}
              disabled={ocrLoading}
              className="p-4 rounded-full bg-white text-slate-950 hover:bg-slate-200 transition-all shadow-xl shadow-black/50 active:scale-95 flex items-center justify-center border-4 border-[#249E82]"
              title="Capturar y ejecutar OCR Determinista"
            >
              {ocrLoading ? (
                <RefreshCw className="w-7 h-7 text-[#249E82] animate-spin" />
              ) : (
                <Camera className="w-7 h-7 text-[#249E82]" />
              )}
            </button>
          </div>
        </div>

        {capturedData && ocrEvaluation && (
          <div className="rounded-3xl glass-panel p-5 border border-white/10 space-y-4 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#249E82]" />
                <h3 className="font-bold text-sm text-white">
                  Dictamen OCR Determinista & Matriz de Riesgo Inicial
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border ${
                    !isLowConfidenceOrException
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  }`}
                >
                  Confianza OCR: {ocrEvaluation.confidence.globalConfidenceScore}%
                </span>
                <span
                  className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border ${
                    ocrEvaluation.riskMatrix.initialRiskGrade === 'BAJO'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : ocrEvaluation.riskMatrix.initialRiskGrade === 'MEDIO'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  Riesgo Inicial: {ocrEvaluation.riskMatrix.initialRiskGrade} ({ocrEvaluation.riskMatrix.weightedScore} pts)
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
              <span
                className={`px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                  ocrEvaluation.idValidation.curpCheckDigitMod10Valid
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                CURP Mod-10 RENAPO: {ocrEvaluation.idValidation.curpCheckDigitMod10Valid ? 'VÁLIDO' : 'EXCEPCIÓN'}
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 font-mono">
                SHA-256 Doc: {ocrEvaluation.duplicateCheck.documentImageSha256.slice(0, 12)}...
              </span>
            </div>

            {isLowConfidenceOrException && (
              <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-xs space-y-2">
                <div className="flex items-start gap-2 text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div>
                    <p className="font-bold">
                      🛑 FLUJO DE EXCEPCIÓN DOCUMENTAL ACTIVADO ({ocrEvaluation.ocrStatus})
                    </p>
                    <p className="text-[11px] mt-0.5">
                      Score ({ocrEvaluation.confidence.globalConfidenceScore}%) &lt; 80.00% o errores: {ocrEvaluation.idValidation.validationErrors.join(' ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-amber-300">
                    Sincronización automática bloqueada hasta revisión asistida:
                  </span>
                  <button
                    type="button"
                    onClick={() => setAssistedReviewConfirmed((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      assistedReviewConfirmed
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    {assistedReviewConfirmed
                      ? 'Revisión Asistida Confirmada (MANUAL_CORRECTED)'
                      : 'Habilitar Revisión Asistida'}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <span className="text-slate-400 block text-[10px] uppercase">Nombre Titular</span>
                <input
                  type="text"
                  value={capturedData.fullName}
                  onChange={(e) => setCapturedData({ ...capturedData, fullName: e.target.value })}
                  className="w-full bg-transparent font-semibold text-slate-100 focus:outline-none"
                />
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <span className="text-slate-400 block text-[10px] uppercase">CURP (18 Posiciones)</span>
                <input
                  type="text"
                  value={capturedData.curp}
                  onChange={(e) => setCapturedData({ ...capturedData, curp: e.target.value.toUpperCase() })}
                  className="w-full bg-transparent font-mono font-semibold text-emerald-400 focus:outline-none"
                />
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <span className="text-slate-400 block text-[10px] uppercase">Ocupación / Giro</span>
                <input
                  type="text"
                  value={capturedData.occupation}
                  onChange={(e) => setCapturedData({ ...capturedData, occupation: e.target.value })}
                  className="w-full bg-transparent font-semibold text-slate-200 focus:outline-none"
                />
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <span className="text-slate-400 block text-[10px] uppercase">Ingreso Neto Quincenal (MXN)</span>
                <input
                  type="text"
                  value={capturedData.fortnightlyNetIncome}
                  onChange={(e) => setCapturedData({ ...capturedData, fortnightlyNetIncome: e.target.value })}
                  className="w-full bg-transparent font-mono font-semibold text-[#00D1FF] focus:outline-none"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <p>
                <strong>Protección LFPDPPP:</strong> Fotograma crudo purgado de la RAM del servidor (`rawImageBuffer.fill(0)`). Al sincronizar, se purga la memoria local del dispositivo.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setCapturedData(null);
                  setOcrEvaluation(null);
                }}
                className="w-1/3 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 font-semibold text-xs transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={handleSyncAndPurge}
                disabled={syncing || isSyncBlockedByException}
                className="w-2/3 py-3 rounded-xl bg-gradient-to-r from-[#249E82] to-[#396CAE] text-white font-semibold text-xs shadow-lg shadow-[#249E82]/30 flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {syncing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>
                      {isSyncBlockedByException
                        ? 'Bloqueado: Confirme Revisión Asistida'
                        : 'Sincronizar y Purgar (Zero-PII)'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
