import React, { useEffect, useRef, useMemo } from 'react';
import { CheckCircle2, Sparkles, ShieldCheck, ArrowRight, X, FileCheck2 } from 'lucide-react';
import { ProductId } from '../../types';

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

export const PreApplicationModal: React.FC<PreApplicationModalProps> = ({
  isOpen,
  data,
  onClose,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);

  const folio = useMemo(() => {
    const suffix = Math.floor(100000 + Math.random() * 900000);
    return `CRUSE-PRE-${suffix}`;
  }, [data.amount, data.selectedTerm, data.productId]);

  useEffect(() => {
    if (!isOpen) return;

    // Focus initial interactive element inside modal
    const timer = window.setTimeout(() => {
      primaryActionRef.current?.focus();
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

  const handleProceedToAdvisor = () => {
    onClose();
    const targetSection = document.getElementById('asistente-ia') || document.getElementById('contacto');
    if (targetSection) {
      targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md transition-opacity"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-app-modal-title"
        aria-describedby="pre-app-modal-desc"
        onClick={(e) => e.stopPropagation()}
        className="glass-panel w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#249E82]/40 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Top Close Button */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar confirmación de pre-solicitud"
          className="absolute top-4 right-4 p-2 rounded-xl glass-card text-slate-500 hover:text-[#041734] dark:text-slate-400 dark:hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* SweetAlert2-style Animated Icon Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-[#249E82]/20 border-2 border-[#249E82] flex items-center justify-center mb-3 shadow-lg glow-teal">
            <CheckCircle2 className="w-9 h-9 text-[#249E82] dark:text-[#4CD360]" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-[#396CAE]/15 text-[#396CAE] dark:text-[#00D1FF] border border-[#396CAE]/30 mb-2">
            <FileCheck2 className="w-3.5 h-3.5" />
            Folio de Pre-Cotización: {folio}
          </span>
          <h3
            id="pre-app-modal-title"
            className="text-xl sm:text-2xl font-black text-[#041734] dark:text-white"
          >
            ¡Pre-Solicitud Lista para Formalizar!
          </h3>
          <p
            id="pre-app-modal-desc"
            className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-md"
          >
            Hemos preparado los parámetros financieros de tu crédito con descuento vía nómina institucional.
          </p>
        </div>

        {/* Summary Card */}
        <div className="glass-slab-emerald rounded-2xl p-4 sm:p-5 mb-5 border border-[#249E82]/30">
          <div className="flex justify-between items-center pb-3 mb-3 border-b border-slate-200/70 dark:border-white/10">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {data.productName}
            </span>
            <span className="text-xs font-mono font-bold text-[#059669] dark:text-[#4CD360]">
              Tasa {data.interestRateText}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs mb-3">
            <div className="glass-card rounded-xl p-3">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Monto Solicitado</span>
              <strong className="text-base sm:text-lg font-black font-mono text-[#041734] dark:text-white">
                ${data.amount.toLocaleString('es-MX')} MXN
              </strong>
            </div>
            <div className="glass-card rounded-xl p-3">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Descuento Quincenal</span>
              <strong className="text-base sm:text-lg font-black font-mono text-[#059669] dark:text-[#4CD360] block">
                ${data.fortnightlyPayment.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block mt-0.5">
                Mensual: ${data.monthlyPaymentEquivalent.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap justify-between items-center text-[11px] text-slate-600 dark:text-slate-300 gap-2 pt-2 border-t border-slate-200/70 dark:border-white/10">
            <span>Plazo: <strong>{data.selectedTerm} quincenas ({data.selectedTerm / 2} meses)</strong></span>
            <span>Total a pagar: <strong className="font-mono">${data.totalToPay.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></span>
            <span>CAT: <strong className="text-[#D4AF37]">{data.catPercent}% s/IVA</strong></span>
          </div>
        </div>

        {/* Institutional Trust Notice */}
        <div className="flex items-start gap-2.5 text-[11px] text-slate-600 dark:text-slate-300 mb-6 bg-slate-100/80 dark:bg-white/5 p-3 rounded-xl border border-slate-200/60 dark:border-white/10">
          <ShieldCheck className="w-4 h-4 text-[#249E82] shrink-0 mt-0.5" />
          <span>
            Trámite 100% gratuito y sin comisiones por apertura. Un asesor certificado o nuestro Asistente IA validará tus 3 documentos básicos para dispersión SPEI.
          </span>
        </div>

        {/* Modal Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl glass-card text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-[#249E82]/50 transition-all"
          >
            Modificar Simulación
          </button>
          <button
            ref={primaryActionRef}
            type="button"
            onClick={handleProceedToAdvisor}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#249E82] to-[#1E9F81] text-white font-black text-xs shadow-lg hover:opacity-95 transition-all flex items-center justify-center gap-2 glow-teal"
          >
            <Sparkles className="w-4 h-4" />
            <span>Continuar con Asistente IA</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
