import React, { useState, useEffect, useRef, useMemo } from 'react';
import Decimal from 'decimal.js';
import {
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  X,
  FileCheck2,
  MessageSquare,
  AlertCircle,
  MapPin,
  Scale,
} from 'lucide-react';
import { BorrowerProfile, PaymentFrequency, ProductId } from '../../types';
import { COMPANY_INFO } from '../../data/cruseData';
import { validateLegalPaymentCapacityLft110 } from '../../config/financialConstants';
import { formatExactMxn } from '../../utils/preApplicationsExcelExport';

export interface PreApplicationData {
  productId: ProductId;
  productName: string;
  amount: number;
  selectedTerm: number;
  frequency?: PaymentFrequency;
  borrowerProfile?: BorrowerProfile;
  periodicPayment?: number;
  fortnightlyPayment: number;
  monthlyPaymentEquivalent: number;
  annualRatePercentText?: string;
  interestRateText: string;
  totalToPay: number;
  catPercent: string | number;
  requiredNetIncome?: number;
}

export interface PreApplicationModalProps {
  isOpen: boolean;
  data: PreApplicationData;
  onClose: () => void;
}

const AGREEMENT_OPTIONS: ReadonlyArray<string> = [
  'Sindicato de Trabajadores al Servicio del Gobierno del Estado (STSGECH — Sindicalizados)',
  'Supremo Tribunal de Justicia del Estado de Chihuahua (Personal de Confianza)',
  'Supremo Tribunal de Justicia del Estado de Chihuahua (Personal Sindicalizado)',
  'Agrupación de los Jubilados y Pensionados al Servicio de Gobierno del Estado de Chihuahua',
  'Delegados Sindicales Municipales (Promotores Municipales STSGECH)',
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

  const frequency: PaymentFrequency = data.frequency ?? 'quincenal';
  const borrowerProfile: BorrowerProfile = data.borrowerProfile ?? 'activo';
  const periodicPayment = data.periodicPayment ?? data.fortnightlyPayment;
  const periodUnitPlural = frequency === 'mensual' ? 'meses' : 'quincenas';
  const periodUnitLabel = frequency === 'mensual' ? 'Mensual' : 'Quincenal';

  const annualRateDisplay =
    data.annualRatePercentText ?? (data.productId === 'express' ? '80.00%' : '47.50%');

  const periodicRateShort = useMemo(() => {
    if (data.productId === 'express') {
      return frequency === 'mensual' ? '6.6667% mensual sin IVA' : '3.3333% quincenal sin IVA';
    }
    return frequency === 'mensual' ? '3.9583% mensual sin IVA' : '1.9792% quincenal sin IVA';
  }, [data.productId, frequency]);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [convenio, setConvenio] = useState<string>(AGREEMENT_OPTIONS[0]!);
  const [netSalaryInput, setNetSalaryInput] = useState<string>('');
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

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);
    const defaultIncome =
      data.requiredNetIncome ??
      new Decimal(periodicPayment).div(new Decimal('0.30')).toDP(2, Decimal.ROUND_HALF_UP).toNumber();
    setNetSalaryInput(defaultIncome.toFixed(2));

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
  }, [isOpen, onClose, data.requiredNetIncome, periodicPayment]);

  const phoneDigits = useMemo(() => phone.replace(/\D/g, '').slice(0, 10), [phone]);
  const isEmailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email]
  );

  // Guardrail 2: Validación en tiempo real del tope legal 30% Art. 110 LFT con Decimal.js
  const capacityValidation = useMemo(() => {
    const cleanVal = netSalaryInput.replace(/[^0-9.]/g, '');
    if (!cleanVal) {
      return validateLegalPaymentCapacityLft110(periodicPayment, 0);
    }
    try {
      return validateLegalPaymentCapacityLft110(periodicPayment, new Decimal(cleanVal));
    } catch {
      return validateLegalPaymentCapacityLft110(periodicPayment, 0);
    }
  }, [periodicPayment, netSalaryInput]);

  // Guardrail 4: Enrutamiento determinista según dependencia seleccionada
  const isTribunalConfianza = useMemo(
    () => convenio.toLowerCase().includes('confianza'),
    [convenio]
  );

  const isFormValid =
    fullName.trim().length >= 5 &&
    phoneDigits.length === 10 &&
    isEmailValid &&
    convenio.trim().length > 0 &&
    capacityValidation.isValid &&
    privacyAccepted;

  if (!isOpen) return null;

  const buildPromoterWhatsAppUrl = (): string => {
    const strictWaPhone = COMPANY_INFO.promoterWhatsappE164.replace(/\D/g, '');
    const cleanApplicantName = fullName.trim().replace(/\s+/g, ' ');
    const cleanConvenio = convenio.trim();
    const cleanSchedule = preferredSchedule.trim() || 'Horario laboral por confirmar';
    const sedeDestino = isTribunalConfianza
      ? `Oficinas Cruse (${COMPANY_INFO.address})`
      : `${COMPANY_INFO.unionOfficeContact.venueName} (${COMPANY_INFO.unionOfficeContact.address})`;

    const messageLines = [
      `Hola ${COMPANY_INFO.promoterContactName}, he registrado mi Pre-Solicitud en el Portal Oficial de ${COMPANY_INFO.name}:`,
      ``,
      `• *Folio de Seguimiento:* ${folio}`,
      `• *Solicitante:* ${cleanApplicantName}`,
      `• *Dependencia / Convenio:* ${cleanConvenio}`,
      `• *Producto de Interés:* ${data.productName} (${data.selectedTerm} ${periodUnitPlural})`,
      `• *Sede de Firma Correspondiente:* ${sedeDestino}`,
      `• *Preferencia de Horario:* ${cleanSchedule}`,
      ``,
      `Mis datos y el desglose financiero han quedado resguardados bajo el folio ${folio}. Quedo atento(a) para la firma de Formatos Cruse y Autorización de Descuento de mi Dependencia.`,
    ];

    const encodedText = encodeURIComponent(messageLines.join('\n'));
    return `https://wa.me/${strictWaPhone}?text=${encodedText}`;
  };

  const handleConfirmAndOpenWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capacityValidation.isValid) {
      setSubmitError(
        capacityValidation.errorMessage ||
          'Excede el límite legal de descuento del 30% conforme al Art. 110 LFT'
      );
      return;
    }
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
          fortnightlyPayment: formatExactMxn(periodicPayment),
          monthlyPaymentEquivalent: formatExactMxn(data.monthlyPaymentEquivalent),
          totalToPay: formatExactMxn(data.totalToPay),
          catPercent: formatExactMxn(data.catPercent),
          interestRateText: `${annualRateDisplay} anual nominal (${periodicRateShort}) + 16% IVA`,
          netPeriodicSalary: formatExactMxn(netSalaryInput),
          paymentFrequency: frequency,
          borrowerProfile,
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
        className="bg-white dark:bg-slate-900/95 glass-panel w-full max-w-2xl rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-white/15 relative overflow-hidden my-auto"
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
          <div className="w-11 h-11 rounded-full bg-[#249E82]/20 border-2 border-[#249E82] flex items-center justify-center mb-1.5 shadow-lg glow-teal">
            <CheckCircle2 className="w-6 h-6 text-[#0F766E] dark:text-[#2EBD9B]" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-[#396CAE]/15 text-[#1E3A8A] dark:text-[#00D1FF] border border-[#396CAE]/30 mb-1">
            <FileCheck2 className="w-3.5 h-3.5" />
            Folio de Pre-Cotización: {folio}
          </span>
          <h3
            id="pre-app-modal-title"
            className="text-lg sm:text-xl font-black text-slate-900 dark:text-white"
          >
            Resumen de Condiciones Financieras y Pre-Solicitud
          </h3>
          <p
            id="pre-app-modal-desc"
            className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 max-w-lg"
          >
            Verifica la transparencia de tu cotización y registra tus datos para formalizar tus Formatos Cruse.
          </p>
        </div>

        {/* Guardrail 5: Resumen Oficial de Condiciones Financieras (Conforme a HALLAZGOS PRESOLICITUD-SIMULADOR.docx) */}
        <div className="glass-slab-emerald rounded-2xl p-4 mb-4 border border-slate-200 dark:border-white/10">
          <div className="flex flex-wrap justify-between items-center pb-2 mb-2.5 border-b border-slate-200 dark:border-white/10 gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              {data.productName} ({periodUnitLabel})
            </span>
            <span className="text-[11px] font-mono font-bold text-[#0F766E] dark:text-[#2EBD9B]">
              Tasa Anual Nominal: {annualRateDisplay} | Tasa {periodUnitLabel}: {periodicRateShort}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mb-2.5">
            <div className="glass-card rounded-xl p-2.5">
              <span className="text-[10px] text-slate-600 dark:text-slate-400 block">
                Monto Solicitado
              </span>
              <strong className="text-sm font-black font-mono text-slate-950 dark:text-white">
                ${formatExactMxn(data.amount)} MXN
              </strong>
            </div>
            <div className="glass-card rounded-xl p-2.5">
              <span className="text-[10px] text-slate-600 dark:text-slate-400 block">
                Descuento {periodUnitLabel} Estimado
              </span>
              <strong className="text-sm font-black font-mono text-[#0F766E] dark:text-[#2EBD9B] block">
                ${formatExactMxn(periodicPayment)} MXN
              </strong>
            </div>
            <div className="glass-card rounded-xl p-2.5 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-slate-600 dark:text-slate-400 block">
                Total Estimado a Pagar
              </span>
              <strong className="text-sm font-black font-mono text-slate-950 dark:text-white block">
                ${formatExactMxn(data.totalToPay)} MXN
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-white/10">
            <span>
              Plazo: <strong>{data.selectedTerm} {periodUnitPlural}</strong>
            </span>
            <span>
              IVA Aplicable: <strong>16% sobre intereses</strong>
            </span>
            <span>
              Ingreso Mín. (30% LFT):{' '}
              <strong className="font-mono text-[#0F766E] dark:text-[#2EBD9B]">
                ${capacityValidation.requiredMinNetIncome}
              </strong>
            </span>
          </div>

          <p className="text-[10.5px] text-slate-600 dark:text-slate-400 mt-2 pt-2 border-t border-slate-200/70 dark:border-white/10 italic">
            Importes sujetos a redondeo y calendario de amortización definitivo. CAT pendiente de validación conforme a la metodología regulatoria (CAT informativo: {formatExactMxn(data.catPercent)}% s/IVA).
          </p>
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
                Ingreso Neto {periodUnitLabel} Libre (Art. 110 LFT) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={netSalaryInput}
                onChange={(e) => setNetSalaryInput(e.target.value)}
                placeholder={`Mínimo $${capacityValidation.requiredMinNetIncome}`}
                className={`w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 border text-xs font-mono text-slate-900 dark:text-white focus:outline-none ${
                  capacityValidation.isValid
                    ? 'border-slate-300 dark:border-white/15 focus:border-[#249E82]'
                    : 'border-rose-500 ring-1 ring-rose-500'
                }`}
              />
            </div>
          </div>

          {/* Alerta Legal Art. 110 LFT cuando la cuota supera el 30% del ingreso neto */}
          {!capacityValidation.isValid && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
              <Scale className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">
                  {capacityValidation.errorMessage}
                </strong>
                <span className="text-[11px]">
                  La cuota de ${formatExactMxn(periodicPayment)} MXN representa el{' '}
                  <strong>{capacityValidation.ratioPercent}%</strong> de tu ingreso reportado. Para este monto y plazo requieres un ingreso neto {frequency} mínimo de{' '}
                  <strong>${capacityValidation.requiredMinNetIncome} MXN</strong>.
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div>
              <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-300 mb-1">
                Horario Preferente para Atención (Opcional)
              </label>
              <input
                type="text"
                value={preferredSchedule}
                onChange={(e) => setPreferredSchedule(e.target.value)}
                placeholder="Ej. Lunes a Viernes 9:00 a 14:00 hrs"
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-white/15 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#249E82]"
              />
            </div>
          </div>

          {/* Guardrail 4: Enrutamiento Determinista de Sede de Firma según Dependencia */}
          <div className="flex items-start gap-2.5 text-[11px] text-slate-700 dark:text-slate-300 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/30">
            <MapPin className="w-4 h-4 text-[#0F766E] dark:text-[#249E82] shrink-0 mt-0.5" />
            <div>
              <strong className="block text-slate-900 dark:text-white font-bold mb-0.5">
                {isTribunalConfianza
                  ? 'Sede de Firma — Personal de Confianza del Supremo Tribunal:'
                  : 'Sede de Firma — Trabajadores Sindicalizados / Agrupación:'}
              </strong>
              {isTribunalConfianza ? (
                <span>
                  Acude a las oficinas de <strong>{COMPANY_INFO.name}</strong> en{' '}
                  <strong>{COMPANY_INFO.address}</strong> (Tel. {COMPANY_INFO.officePhone}) para suscribir tus{' '}
                  <strong>Formatos Cruse y Autorización de Descuento de tu Dependencia</strong>. La dispersión SPEI se realiza una vez firmados los formatos.
                </span>
              ) : (
                <span>
                  Acude al <strong>Departamento de Prestaciones Económicas en el {COMPANY_INFO.unionOfficeContact.venueName}</strong> ubicado en{' '}
                  <strong>{COMPANY_INFO.unionOfficeContact.address}</strong> (Tels.{' '}
                  {COMPANY_INFO.unionOfficeContact.phones.join(' y ')}) o con tu delegado sindical municipal para firmar tus{' '}
                  <strong>Formatos Cruse y Autorización de Descuento</strong>. La dispersión SPEI se ejecuta posterior a la firma.
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
            <ShieldCheck className="w-4 h-4 text-[#0F766E] dark:text-[#249E82] shrink-0" />
            <label className="flex items-center gap-2 cursor-pointer select-none">
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
          </div>

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
                  : 'Guardar Pre-Solicitud y Enlazar por WhatsApp'}
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
              <span>¿Tienes dudas sobre tu sede de firma o requisitos? Consultar al Asistente IA 24/7</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
