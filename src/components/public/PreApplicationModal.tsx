import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  X,
  FileCheck2,
  MessageSquare,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { ProductId } from '../../types';
import { COMPANY_INFO } from '../../data/cruseData';
import { formatExactMxn } from '../../utils/preApplicationsExcelExport';

export interface PreApplicationData {
  productId: ProductId;
  productName: string;
  amount: number;
  selectedTerm: number;
  fortnightlyPayment: number;
  monthlyPaymentEquivalent: number;
  interestRateText: string;
  totalToPay: number;
  catPercent: string | number;
}

export interface PreApplicationModalProps {
  isOpen: boolean;
  data: PreApplicationData;
  onClose: () => void;
}

const AGREEMENT_OPTIONS: ReadonlyArray<string> = [
  'Supremo Tribunal de Justicia del Estado de Chihuahua',
  'Sindicato de Trabajadores al Servicio del Gobierno del Estado (STSGECH)',
  'Gobierno del Estado de Chihuahua (Dependencia Central)',
  'Poder Judicial / Salud Guanajuato (Hub Bajío)',
  'Otra Dependencia Afiliada',
];

function generateDeterministicFolioSuffix(): string {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(arr);
    const sixDigits = String((arr[0]! % 900000) + 100000);
    return `CRUSE-PRE-${sixDigits}`;
  }
  return `CRUSE-PRE-${String(Date.now()).slice(-6)}`;
}

export const PreApplicationModal: React.FC<PreApplicationModalProps> = ({
  isOpen,
  data,
  onClose,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [convenio, setConvenio] = useState<string>(AGREEMENT_OPTIONS[0]!);
  const [preferredSchedule, setPreferredSchedule] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const folio = useMemo(() => {
    void data.amount;
    void data.selectedTerm;
    void data.productId;
    return generateDeterministicFolioSuffix();
  }, [data.amount, data.selectedTerm, data.productId]);

  const phoneDigits = useMemo(() => phone.replace(/\D/g, '').slice(0, 10), [phone]);
  const isEmailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email]
  );
  const isFormValid =
    fullName.trim().length >= 5 &&
    phoneDigits.length === 10 &&
    isEmailValid &&
    convenio.trim().length > 0 &&
    privacyAccepted;

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);

    const timer = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const buildPromoterWhatsAppUrl = (): string => {
    // Garantiza formato estricto 526141965449 (código de país + 10 dígitos, cero signos '+' o espacios)
    const strictWaPhone = COMPANY_INFO.promoterWhatsappE164.replace(/\D/g, '');
    const cleanApplicantName = fullName.trim().replace(/\s+/g, ' ');
    const cleanConvenio = convenio.trim();
    const cleanSchedule = preferredSchedule.trim() || 'Horario laboral por confirmar';

    // Zero-PII en URL: solo Folio, Nombre, Convenio y Producto para cruce en el Buzón Cifrado
    const messageLines = [
      `Hola ${COMPANY_INFO.promoterContactName}, he registrado mi Pre-Solicitud en el Portal Oficial de Microfinanciera Cruse:`,
      ``,
      `• *Folio de Seguimiento:* ${folio}`,
      `• *Solicitante:* ${cleanApplicantName}`,
      `• *Dependencia / Convenio:* ${cleanConvenio}`,
      `• *Producto de Interés:* ${data.productName} (${data.selectedTerm} quincenas)`,
      `• *Preferencia para Cita en Sitio:* ${cleanSchedule}`,
      ``,
      `Mis datos de contacto y el desglose financiero ya quedaron resguardados bajo el folio ${folio}. Quedo atento(a) para agendar la visita del promotor en mi centro de trabajo.`,
    ];

    const encodedText = encodeURIComponent(messageLines.join('\n'));
    return `https://wa.me/${strictWaPhone}?text=${encodedText}`;
  };

  const handleConfirmAndOpenWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/pre-applications/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folio,
          fullName: fullName.trim(),
          phone: phoneDigits,
          email: email.trim().toLowerCase(),
          convenio,
          preferredSchedule: preferredSchedule.trim(),
          productId: data.productId,
          productName: data.productName,
          amount: formatExactMxn(data.amount),
          selectedTerm: data.selectedTerm,
          fortnightlyPayment: formatExactMxn(data.fortnightlyPayment),
          monthlyPaymentEquivalent: formatExactMxn(data.monthlyPaymentEquivalent),
          totalToPay: formatExactMxn(data.totalToPay),
          catPercent: formatExactMxn(data.catPercent),
          interestRateText: data.interestRateText,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || 'No fue posible registrar tu pre-solicitud.');
      }

      const whatsappUrl = buildPromoterWhatsAppUrl();
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error de conexión con el servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProceedToAdvisorChat = () => {
    onClose();
    const targetSection =
      document.getElementById('asistente-ia') || document.getElementById('contacto');
    if (targetSection) {
      targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md transition-opacity overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-app-modal-title"
        aria-describedby="pre-app-modal-desc"
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900/95 glass-panel w-full max-w-xl rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-white/15 relative overflow-hidden my-auto"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar confirmación de pre-solicitud"
          className="absolute top-4 right-4 p-2 rounded-xl glass-card text-slate-700 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Encabezado con Folio */}
        <div className="flex flex-col items-center text-center mb-4">
          <div className="w-12 h-12 rounded-full bg-[#249E82]/20 border-2 border-[#249E82] flex items-center justify-center mb-2 shadow-lg glow-teal">
            <CheckCircle2 className="w-7 h-7 text-[#0F766E] dark:text-[#2EBD9B]" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-[#396CAE]/15 text-[#1E3A8A] dark:text-[#00D1FF] border border-[#396CAE]/30 mb-1.5">
            <FileCheck2 className="w-3.5 h-3.5" />
            Folio de Pre-Cotización: {folio}
          </span>
          <h3
            id="pre-app-modal-title"
            className="text-lg sm:text-xl font-black text-slate-900 dark:text-white"
          >
            Formaliza tu Pre-Solicitud y Agenda con Promotor
          </h3>
          <p
            id="pre-app-modal-desc"
            className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 max-w-md"
          >
            Registra tus datos de contacto para resguardar tu cotización y enlazar con un promotor certificado.
          </p>
        </div>

        {/* Resumen Financiero del Crédito Simulado */}
        <div className="glass-slab-emerald rounded-2xl p-3.5 mb-4 border border-slate-200 dark:border-white/10">
          <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-200 dark:border-white/10">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-300">
              {data.productName}
            </span>
            <span className="text-[11px] font-mono font-bold text-[#0F766E] dark:text-[#2EBD9B]">
              {data.interestRateText}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs mb-2">
            <div className="glass-card rounded-xl p-2.5">
              <span className="text-[10px] text-slate-600 dark:text-slate-400 block">
                Monto Solicitado
              </span>
              <strong className="text-sm sm:text-base font-black font-mono text-slate-950 dark:text-white">
                ${formatExactMxn(data.amount)} MXN
              </strong>
            </div>
            <div className="glass-card rounded-xl p-2.5">
              <span className="text-[10px] text-slate-600 dark:text-slate-400 block">
                Descuento Quincenal Fijo
              </span>
              <strong className="text-sm sm:text-base font-black font-mono text-[#0F766E] dark:text-[#2EBD9B] block">
                ${formatExactMxn(data.fortnightlyPayment)} MXN
              </strong>
            </div>
          </div>

          <div className="flex flex-wrap justify-between items-center text-[11px] text-slate-700 dark:text-slate-300 gap-2 pt-1.5 border-t border-slate-200 dark:border-white/10">
            <span>
              Plazo: <strong>{data.selectedTerm} quincenas</strong>
            </span>
            <span>
              Total: <strong className="font-mono">${formatExactMxn(data.totalToPay)}</strong>
            </span>
            <span>
              CAT: <strong className="text-amber-700 dark:text-[#D4AF37]">{formatExactMxn(data.catPercent)}% s/IVA</strong>
            </span>
          </div>
        </div>

        {/* Formulario Obligatorio de Datos del Solicitante */}
        <form onSubmit={handleConfirmAndOpenWhatsApp} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-300 mb-1">
                Nombre Completo del Solicitante *
              </label>
              <input
                ref={nameInputRef}
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. Juan Pérez García"
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-white/15 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#249E82]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-300 mb-1">
                Teléfono Celular (10 dígitos) *
              </label>
              <input
                type="tel"
                required
                inputMode="numeric"
                maxLength={10}
                value={phoneDigits}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. 6141234567"
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-white/15 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-[#249E82]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-300 mb-1">
                Correo Electrónico *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.gob.mx"
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-white/15 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#249E82]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-300 mb-1">
                Dependencia / Convenio Laboral *
              </label>
              <select
                value={convenio}
                onChange={(e) => setConvenio(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-white/15 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#249E82]"
              >
                {AGREEMENT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-300 mb-1">
              Horario o Centro de Trabajo para Cita con Promotor (Opcional)
            </label>
            <input
              type="text"
              value={preferredSchedule}
              onChange={(e) => setPreferredSchedule(e.target.value)}
              placeholder="Ej. Lunes a Viernes 9:00 a 14:00 hrs en Ciudad Judicial"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-white/15 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#249E82]"
            />
          </div>

          {/* Aviso del Proceso Operativo Interno: Cita con Promotor en Campo */}
          <div className="flex items-start gap-2.5 text-[11px] text-slate-700 dark:text-slate-300 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/30">
            <ShieldCheck className="w-4 h-4 text-[#0F766E] dark:text-[#249E82] shrink-0 mt-0.5" />
            <div>
              <strong className="block text-slate-900 dark:text-white font-bold mb-0.5">
                Protocolo Seguro en Sitio (Sin subida de documentos en línea)
              </strong>
              <span>
                Por tu seguridad y políticas de operación interna,{' '}
                <strong>no solicitamos subir documentos en internet</strong>. Tu pre-solicitud se guarda de forma cifrada y se enlaza por WhatsApp con{' '}
                <strong>{COMPANY_INFO.promoterContactName} ({COMPANY_INFO.promoterWhatsappDisplay})</strong> para agendar una{' '}
                <strong>cita presencial en tu lugar de trabajo</strong> donde el promotor recabará tus documentos en campo.
              </span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              className="rounded accent-[#249E82] w-3.5 h-3.5"
            />
            <span>
              Acepto el Aviso de Privacidad Integral (LFPDPPP) para el resguardo cifrado de mi pre-solicitud.
            </span>
          </label>

          {submitError && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Botones de Acción */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl glass-card text-xs font-bold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 hover:border-[#249E82]/50 transition-all"
            >
              Modificar Simulación
            </button>
            <button
              type="submit"
              disabled={!isFormValid || submitting}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#249E82] to-[#1E9F81] disabled:opacity-45 disabled:cursor-not-allowed text-white font-black text-xs shadow-lg hover:opacity-95 transition-all flex items-center justify-center gap-2 glow-teal"
            >
              <MessageSquare className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Guardando Pre-Solicitud...'
                  : 'Guardar Pre-Solicitud y Agendar por WhatsApp'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={handleProceedToAdvisorChat}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-[#249E82] dark:hover:text-[#00D1FF] transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>¿Aún tienes dudas antes de agendar? Consultar al Asistente IA 24/7</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
