import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, CheckCircle2, ShieldAlert, ArrowLeft, Send, Sparkles, AlertCircle, Scan, Zap } from 'lucide-react';
import { AuthSession, ExpedienteItem, IneQualityFlags, ProductId } from '../../types';
import { evaluateIneFrameQuality } from '../../services/scanner/ineCaptureQualityAnalyzer';
import { playCameraShutterSound } from '../../services/scanner/cameraShutterSound';
import { syncAndPurgeExpediente, APP_PURGE_COMPLETE_EVENT } from '../../services/sync/syncAckService';
import { useDrainPendingPurge } from '../../hooks/useDrainPendingPurge';

interface PromotorScannerViewProps {
  session: AuthSession;
  onBackToPortal: () => void;
}

export const PromotorScannerView: React.FC<PromotorScannerViewProps> = ({
  session,
  onBackToPortal,
}) => {
  // Drenar cualquier residuo previo al arranque (resiliencia post-ACK)
  useDrainPendingPurge();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Calidad de fotograma en tiempo real
  const [quality, setQuality] = useState<IneQualityFlags>({
    isBlur: false,
    isTooDark: false,
    isTooBright: false,
    isTilted: false,
    isAcceptable: true,
    laplacianScore: 120,
    avgBrightness: 135,
    edgeRatio: 1.05,
    feedbackText: '✅ Encuadre óptimo: Listo para captura',
  });

  // Estado del expediente capturado
  const [capturedData, setCapturedData] = useState<{
    fullName: string;
    curp: string;
    voterId: string;
    address: string;
    phone: string;
    requestedAmount: number;
    termFortnights: number;
    productType: ProductId;
    thumbBase64?: string;
  } | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string; syncId?: string } | null>(null);

  // Iniciar flujo de cámara
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Cámara web no soportada por el navegador');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setStreamActive(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo acceder a la cámara';
      setCameraError(msg);
      setStreamActive(false);
    }
  }, []);

  // Detener cámara
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setStreamActive(false);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Ciclo de evaluación de calidad en tiempo real (cada 250ms)
  useEffect(() => {
    if (!streamActive) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== 4) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const w = 320;
      const h = 200;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);

      try {
        const imgData = ctx.getImageData(0, 0, w, h);
        const evalResult = evaluateIneFrameQuality(imgData.data, w, h);
        setQuality(evalResult);
      } catch {
        /* Ignora errores de cross-origin si ocurren */
      }
    }, 250);

    return () => clearInterval(interval);
  }, [streamActive]);

  // Escuchar evento global de purga completada
  useEffect(() => {
    const handlePurge = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.info(`[PWA Promotor] Evento ${APP_PURGE_COMPLETE_EVENT} recibido para ID: ${detail?.id}`);
    };
    window.addEventListener(APP_PURGE_COMPLETE_EVENT, handlePurge);
    return () => window.removeEventListener(APP_PURGE_COMPLETE_EVENT, handlePurge);
  }, []);

  // Disparador de captura asistida
  const handleCapture = () => {
    playCameraShutterSound();

    let thumbBase64: string | undefined;
    if (canvasRef.current) {
      thumbBase64 = canvasRef.current.toDataURL('image/jpeg', 0.6);
    }

    // Extracción en memoria (Lazy-load simulado para demo)
    setCapturedData({
      fullName: 'ROBERTO CARLOS MENDEZ CHAVEZ',
      curp: 'MECR880415HCHNRB02',
      voterId: 'MNCHRB88041508H300',
      address: 'C. Vía Citadela 5710, Col. Saucito, Chihuahua, Chih.',
      phone: '614-239-1144',
      requestedAmount: 25000,
      termFortnights: 24,
      productType: 'normal',
      thumbBase64,
    });

    setSyncResult(null);
  };

  // Enviar y purgar inmediatamente
  const handleSyncAndPurge = async () => {
    if (!capturedData) return;
    setSyncing(true);
    setSyncResult(null);

    const expediente: ExpedienteItem = {
      id: `exp_${Date.now()}`,
      createdAt: new Date().toISOString(),
      fullName: capturedData.fullName,
      curpMasked: 'MECR********RB02',
      blindCurp: '',
      voterId: capturedData.voterId,
      address: capturedData.address,
      phone: capturedData.phone,
      requestedAmount: capturedData.requestedAmount,
      termFortnights: capturedData.termFortnights,
      productType: capturedData.productType,
      status: 'capturado',
      promotorEmail: session.user.email,
    };

    const ack = await syncAndPurgeExpediente(expediente, session.token);
    setSyncing(false);

    if (ack.ok) {
      setSyncResult({
        ok: true,
        message: `Sincronización exitosa (ACK ${ack.status}). La memoria local del dispositivo fue purgada por protocolo Zero-PII. Cero datos residuales.`,
        syncId: ack.syncId,
      });
      // Limpiar datos del formulario de inmediato
      setCapturedData(null);
    } else {
      setSyncResult({
        ok: false,
        message: `Fallo de envío: ${ack.error}. Los datos permanecen protegidos para no perder la solicitud.`,
      });
    }
  };

  return (
    <div className="dark min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Barra superior de la PWA */}
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
              <h1 className="text-sm font-bold text-white">Cruse PWA Móvil — Promotores</h1>
            </div>
            <p className="text-[11px] text-slate-400">
              {session.user.name} ({session.user.email})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-[#249E82]/20 border border-[#249E82]/40 text-[#249E82] text-xs font-semibold flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Zero-PII Activo
          </span>
        </div>
      </header>

      {/* Contenido principal del visor */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col gap-4">
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
              <p className="font-semibold text-sm">{syncResult.ok ? '✅ Expediente Sincronizado' : 'Error de Sincronización'}</p>
              <p className="mt-1">{syncResult.message}</p>
              {syncResult.syncId && (
                <p className="mt-1 font-mono text-[10px] text-slate-400">ID Sync: {syncResult.syncId}</p>
              )}
            </div>
          </div>
        )}

        {/* Visor de Cámara con Marcadores */}
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

          {/* Fallback si no hay cámara activa */}
          {!streamActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/80">
              <Camera className="w-12 h-12 text-slate-500 mb-3 animate-bounce" />
              <p className="text-sm font-medium text-slate-300 mb-1">Cámara en Espera o No Disponible</p>
              <p className="text-xs text-slate-500 max-w-xs mb-4">
                {cameraError || 'Permite el acceso a la cámara o utiliza la simulación asistida de escaneo en campo.'}
              </p>
              <button
                onClick={startCamera}
                className="px-4 py-2 rounded-xl bg-[#249E82] text-white text-xs font-semibold hover:bg-[#1e856e] transition-colors"
              >
                Reintentar Conexión
              </button>
            </div>
          )}

          {/* Guía de encuadre rectangular con esquinas estilo pasaporte/INE */}
          <div className="absolute inset-0 pointer-events-none p-6 flex items-center justify-center">
            <div
              className={`w-[85%] h-[68%] rounded-2xl border-2 transition-colors duration-300 relative ${
                quality.isAcceptable
                  ? 'border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.4)]'
                  : 'border-amber-400/80'
              }`}
            >
              {/* Esquinas destacadas */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

              {/* Marca de agua / Leyenda institucional en visor */}
              <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] text-white/60 font-mono">
                <span>MICROFINANCIERA CRUSE</span>
                <span>COPIA DIGITAL ENCRIPTADA</span>
              </div>
            </div>
          </div>

          {/* Barra de retroalimentación de calidad en vivo */}
          <div className="absolute top-3 left-3 right-3 bg-black/70 backdrop-blur-md rounded-xl p-2.5 flex items-center justify-between text-xs border border-white/10">
            <span className="font-medium text-slate-200">{quality.feedbackText}</span>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className={`px-1.5 py-0.5 rounded ${quality.isBlur ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                Nitidez: {quality.laplacianScore}
              </span>
              <span className={`px-1.5 py-0.5 rounded ${quality.isTooDark || quality.isTooBright ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                Brillo: {quality.avgBrightness}
              </span>
            </div>
          </div>

          {/* Botón de captura flotante */}
          <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center">
            <button
              onClick={handleCapture}
              className="p-4 rounded-full bg-white text-slate-950 hover:bg-slate-200 transition-all shadow-xl shadow-black/50 active:scale-95 flex items-center justify-center border-4 border-[#249E82]"
              title="Tomar fotografía de credencial"
            >
              <Camera className="w-7 h-7 text-[#249E82]" />
            </button>
          </div>
        </div>

        {/* Datos extraídos en memoria (antes de enviar) */}
        {capturedData && (
          <div className="rounded-3xl glass-panel p-5 border border-white/10 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#249E82]" />
                <h3 className="font-bold text-sm text-white">Extracción de Identidad en Memoria</h3>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Memoria RAM Efímera
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 block text-[10px] uppercase">Nombre Titular</span>
                <span className="font-semibold text-slate-200">{capturedData.fullName}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 block text-[10px] uppercase">CURP</span>
                <span className="font-mono font-semibold text-emerald-400">{capturedData.curp}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 block text-[10px] uppercase">Clave Elector</span>
                <span className="font-mono text-slate-300">{capturedData.voterId}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 block text-[10px] uppercase">Teléfono</span>
                <span className="font-semibold text-slate-200">{capturedData.phone}</span>
              </div>
            </div>

            {/* Configuración del Crédito */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">Monto Solicitado (Nómina):</span>
                <span className="font-bold text-[#249E82] text-sm">${capturedData.requestedAmount.toLocaleString()} MXN</span>
              </div>
              <input
                type="range"
                min={10000}
                max={100000}
                step={5000}
                value={capturedData.requestedAmount}
                onChange={(e) => setCapturedData({ ...capturedData, requestedAmount: Number(e.target.value) })}
                className="w-full accent-[#249E82]"
              />

              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">Plazo en Quincenas:</span>
                <div className="flex gap-2">
                  {[24, 48, 72].map((term) => (
                    <button
                      key={term}
                      onClick={() => setCapturedData({ ...capturedData, termFortnights: term })}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                        capturedData.termFortnights === term
                          ? 'bg-[#249E82] text-white shadow-md'
                          : 'bg-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {term}q
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Aviso LFPDPPP y Purga */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <p>
                <strong>Protección LFPDPPP:</strong> Al pulsar Sincronizar, los datos viajarán cifrados con AES-GCM 256. Tras recibir el ACK del servidor, este dispositivo purgará de forma inmediata toda copia local de la INE.
              </p>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCapturedData(null)}
                className="w-1/3 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 font-semibold text-xs transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={handleSyncAndPurge}
                disabled={syncing}
                className="w-2/3 py-3 rounded-xl bg-gradient-to-r from-[#249E82] to-[#396CAE] text-white font-semibold text-xs shadow-lg shadow-[#249E82]/30 flex items-center justify-center gap-2 hover:opacity-90 transition-all"
              >
                {syncing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Sincronizar y Purgar (Zero-PII)</span>
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
