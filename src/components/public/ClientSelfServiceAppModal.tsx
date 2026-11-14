import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Upload,
  CheckCircle2,
  ShieldCheck,
  X,
  Lock,
  FileCheck2,
  RefreshCw,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import {
  ClientDigitalDocType,
  ClientDigitalSignatureRecord,
  ClientExpedienteSummary,
} from '../../types';
import { ClientDigitalSignaturePanel } from './ClientDigitalSignaturePanel';

interface ClientSelfServiceAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFolio?: string;
}

const REQUIRED_DOCS_META: ReadonlyArray<{
  docType: ClientDigitalDocType;
  label: string;
  helper: string;
}> = [
  {
    docType: 'INE_FRONT',
    label: '1. INE Vigente (Frente)',
    helper: 'Fotografía clara del anverso sin reflejos (Purga automática EXIF/GPS).',
  },
  {
    docType: 'INE_BACK',
    label: '2. INE Vigente (Reverso)',
    helper: 'Fotografía clara del reverso con código CIC/OCR legible.',
  },
  {
    docType: 'PAYSTUB',
    label: '3. Último Recibo de Nómina',
    helper: 'Talón quincenal vigente que acredite percepciones y deducciones.',
  },
  {
    docType: 'PROOF_OF_ADDRESS',
    label: '4. Comprobante de Domicilio (< 3 meses)',
    helper: 'Recibo de agua, luz o teléfono con antigüedad menor a 3 meses.',
  },
];

export const ClientSelfServiceAppModal: React.FC<ClientSelfServiceAppModalProps> = ({
  isOpen,
  onClose,
  initialFolio = '',
}) => {
  const [folio, setFolio] = useState(initialFolio);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<ClientDigitalDocType | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [expediente, setExpediente] = useState<ClientExpedienteSummary | null>(null);
  const [pwaInstalledHint, setPwaInstalledHint] = useState(false);

  useEffect(() => {
    if (initialFolio) setFolio(initialFolio);
  }, [initialFolio]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOpenExpediente = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusBanner(null);
    setLoading(true);
    try {
      const res = await fetch('/api/client-self-service/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folio: folio.trim(), phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'No se encontró el expediente o el teléfono no coincide.');
        return;
      }
      setExpediente(data.expediente as ClientExpedienteSummary);
    } catch {
      setErrorMsg('Error de conexión al consultar tu expediente digital.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadDoc = async (docType: ClientDigitalDocType, file?: File | null) => {
    if (!expediente) return;
    setErrorMsg(null);
    setStatusBanner(null);
    setUploadingDoc(docType);

    try {
      let fileBase64 = '';
      let fileName = `${docType}_${expediente.folio}.jpg`;

      if (file) {
        fileName = file.name;
        fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Error leyendo archivo'));
          reader.readAsDataURL(file);
        });
      } else {
        // Muestra sintética JPEG con segmento APP1 EXIF simulado para demostrar la purga Zero-EXIF en 1 clic
        const syntheticJpegWithExif = Buffer.concat([
          Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10]),
          Buffer.from('Exif\x00\x00GPS_DATA', 'ascii'),
          Buffer.from([0xff, 0xda]),
          Buffer.from(`CRUSE_CLEAN_IMAGE_${docType}_${expediente.folio}_${Date.now()}`, 'utf8'),
          Buffer.from([0xff, 0xd9]),
        ]);
        fileBase64 = syntheticJpegWithExif.toString('base64');
      }

      const res = await fetch('/api/client-self-service/upload-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folio: expediente.folio,
          phone: phone.trim(),
          docType,
          fileBase64,
          fileName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Error al subir el documento.');
        return;
      }
      setExpediente(data.expediente as ClientExpedienteSummary);
      setStatusBanner(
        `✅ ${docType} sanitizado (Zero-EXIF/GPS en RAM) y cifrado con AES-256-GCM. Hash SHA-256: ${data.sanitizedMeta?.sanitizedSha256?.slice(0, 16)}...`
      );
    } catch {
      setErrorMsg('Fallo al procesar y sanitizar el documento.');
    } finally {
      setUploadingDoc(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="App Cruse — Portal de Autoservicio Digital 24/7"
    >
      <div
        className="bg-slate-950 border border-[#00D1FF]/40 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera Institucional */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#041734] via-slate-900 to-[#041734] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#249E82]/20 border border-[#249E82]/40 text-[#00D1FF]">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Fase 3.1 y 3.2 · App Cruse (iOS / Android)
                </span>
                <h3 className="text-base font-extrabold text-white">
                  Portal de Autoservicio del Cliente y Firma Digital NOM-151
                </h3>
              </div>
              <p className="text-xs text-slate-300">
                Sube tus 4 documentos con limpieza automática de ubicación GPS (Zero-EXIF) y firma tu contrato desde tu celular.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPwaInstalledHint((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-[#00D1FF]/40 hover:bg-cyan-500/25 text-[#00D1FF] text-xs font-extrabold flex items-center gap-1.5 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Instalar App Cruse</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              <span>Cerrar</span>
            </button>
          </div>
        </div>

        {/* Cuerpo Scrollable */}
        <div className="p-6 overflow-y-auto space-y-5">
          {pwaInstalledHint && (
            <div className="p-4 rounded-2xl bg-cyan-950/50 border border-[#00D1FF]/40 text-xs text-slate-200 space-y-1.5">
              <p className="font-extrabold text-[#00D1FF]">
                📲 Cómo instalar la App Cruse en la pantalla de inicio de tu celular:
              </p>
              <p>
                • <strong>En Android (Chrome):</strong> Toca el menú de 3 puntos del navegador y selecciona <em>"Instalar aplicación"</em> o <em>"Agregar a la pantalla principal"</em>.
              </p>
              <p>
                • <strong>En iPhone (Safari):</strong> Toca el icono <em>"Compartir"</em> en la barra inferior y selecciona <em>"Agregar a inicio"</em>.
              </p>
            </div>
          )}

          {/* Formulario de Acceso con Folio + Teléfono a 10 dígitos */}
          <form
            onSubmit={handleOpenExpediente}
            className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
          >
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Folio de Pre-Solicitud
              </label>
              <input
                type="text"
                value={folio}
                onChange={(e) => setFolio(e.target.value.toUpperCase())}
                placeholder="Ej. PRE-2026-0001"
                required
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-[#00D1FF]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Teléfono Celular Registrado (10 dígitos)
              </label>
              <input
                type="tel"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Ej. 6141234567"
                required
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-[#00D1FF]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#249E82] to-[#396CAE] hover:opacity-95 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              <span>Abrir Mi Expediente Digital</span>
            </button>
          </form>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {statusBanner && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{statusBanner}</span>
            </div>
          )}

          {/* Vista del Expediente Digital cuando el cliente autenticó su Folio + Celular */}
          {expediente && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-mono text-[#00D1FF] block">
                    Folio Activo: {expediente.folio} · {expediente.convenio}
                  </span>
                  <h4 className="text-sm font-extrabold text-white">
                    Solicitante: {expediente.applicantMaskedName} ({expediente.phoneMasked})
                  </h4>
                  <p className="text-xs text-slate-400">
                    Producto: {expediente.productType} · Monto: ${expediente.requestedAmountMxn} MXN ({expediente.termFortnights} qnas)
                  </p>
                </div>
                <div className="text-right">
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-[#249E82]/20 text-emerald-300 border border-[#249E82]/40">
                    Progreso Documental: {expediente.completedDocsCount} de 4 ({expediente.completedDocsCount * 25}%)
                  </span>
                </div>
              </div>

              {/* 4 Tarjetas de Documentos con Limpieza Zero-EXIF */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {REQUIRED_DOCS_META.map((meta) => {
                  const uploaded = expediente.documents.find((d) => d.docType === meta.docType);
                  const isBusy = uploadingDoc === meta.docType;

                  return (
                    <div
                      key={meta.docType}
                      className={`p-4 rounded-2xl border transition-all space-y-2.5 ${
                        uploaded
                          ? 'bg-emerald-950/25 border-emerald-500/40'
                          : 'bg-slate-900/90 border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h5 className="text-xs font-extrabold text-white flex items-center gap-1.5">
                            {uploaded ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <FileCheck2 className="w-4 h-4 text-[#00D1FF] shrink-0" />
                            )}
                            <span>{meta.label}</span>
                          </h5>
                          <p className="text-[11px] text-slate-400 mt-0.5">{meta.helper}</p>
                        </div>
                        {uploaded && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                            Zero-EXIF ✓
                          </span>
                        )}
                      </div>

                      {uploaded && (
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 text-[11px] font-mono text-slate-300 space-y-0.5">
                          <div>SHA-256: {uploaded.documentSha256.slice(0, 24)}...</div>
                          {uploaded.isOverwrite && uploaded.previousDocumentSha256 && (
                            <div className="text-amber-300">
                              Reemplazó hash previo: {uploaded.previousDocumentSha256.slice(0, 16)}...
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <label className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all">
                          <Upload className="w-3.5 h-3.5 text-[#00D1FF]" />
                          <span>{uploaded ? 'Reemplazar Archivo' : 'Seleccionar Foto / PDF'}</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUploadDoc(meta.docType, f);
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleUploadDoc(meta.docType, null)}
                          className="px-3 py-1.5 rounded-xl bg-[#249E82]/25 hover:bg-[#249E82]/40 border border-[#249E82]/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all"
                        >
                          {isBusy ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          <span>Carga Rápida Demo (Zero-EXIF)</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Panel de Firma Digital NOM-151 (Se habilita al tener 4/4 documentos) */}
              {expediente.isReadyForSignature && (
                <ClientDigitalSignaturePanel
                  expediente={expediente}
                  phone10Digits={phone}
                  onSignatureCompleted={(sig: ClientDigitalSignatureRecord) => {
                    setExpediente((prev) => (prev ? { ...prev, signatureRecord: sig } : prev));
                    setStatusBanner(
                      `🎉 Contrato firmado con validez jurídica NOM-151 (Constancia SHA-256: ${sig.nom151ConstanciaSha256.slice(0, 16)}...).`
                    );
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
