/**
 * MODAL DE BITÁCORA Y NOTAS OPERATIVAS DE PAGARÉS / INVERSIONES (RN-04)
 *
 * @implements CRUSE-APO-2026-059 Guardrail 2 (Focus Trap estricto Tab/Shift+Tab, cierre con Escape y clic en Backdrop)
 * @implements CRUSE-APO-2026-061 Barrera 2 (Estabilización referencial de handleCountChange con useCallback)
 * @implements Regla 3 Anti-God-Object (< 200 líneas) y Regla 4 U-First (Cero Callejones sin Salida)
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { X, MessageSquareText, Landmark } from 'lucide-react';
import { OperationalNotesPanel } from './OperationalNotesPanel';

interface InvestmentNotesModalProps {
  isOpen: boolean;
  investmentId: string | null;
  interestType?: 'SIMPLE' | 'COMPOUND';
  currentCapital?: number;
  token: string;
  onClose: () => void;
  onNotesCountChange: (investmentId: string, count: number) => void;
}

export const InvestmentNotesModal: React.FC<InvestmentNotesModalProps> = ({
  isOpen,
  investmentId,
  interestType,
  currentCapital,
  token,
  onClose,
  onNotesCountChange,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Barrera 2 (CRUSE-APO-2026-061): Callback estabilizado con useCallback (cero closures inline)
  const handleCountChange = useCallback(
    (count: number) => {
      if (investmentId) {
        onNotesCountChange(investmentId, count);
      }
    },
    [investmentId, onNotesCountChange]
  );

  useEffect(() => {
    if (!isOpen) return;

    const modalEl = modalRef.current;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const initialTimer = window.setTimeout(() => {
      if (!modalEl) return;
      const focusable = modalEl.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusable.length > 0) {
        focusable[0]?.focus();
      }
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalEl) {
        const focusable = Array.from(modalEl.querySelectorAll<HTMLElement>(focusableSelector));
        if (focusable.length === 0) return;

        const firstEl = focusable[0]!;
        const lastEl = focusable[focusable.length - 1]!;

        if (e.shiftKey) {
          if (document.activeElement === firstEl || !modalEl.contains(document.activeElement)) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl || !modalEl.contains(document.activeElement)) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !investmentId) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="investment-notes-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-4 bg-[#0D1B3E] border-b border-slate-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-400/30">
              <MessageSquareText className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 id="investment-notes-modal-title" className="text-sm font-extrabold text-white">
                Bitácora de Notas Operativas — Pagaré {investmentId}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300 mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <Landmark className="w-3 h-3 text-[#00D1FF]" />
                  {interestType === 'COMPOUND' ? 'Interés Compuesto (Capitalizable)' : 'Interés Simple (Pago Mensual)'}
                </span>
                {typeof currentCapital === 'number' && (
                  <span>
                    • Capital Actual: <strong className="text-[#00D1FF]">${currentCapital.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana de notas"
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <OperationalNotesPanel
            entityType="INVESTMENT"
            entityId={investmentId}
            token={token}
            title={`Notas Operativas de la Inversión ${investmentId}`}
            onNotesCountChange={handleCountChange}
          />
        </div>

        <div className="px-5 py-3 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>Presiona Esc o haz clic fuera de la ventana para cerrar</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
          >
            Cerrar Ventana
          </button>
        </div>
      </div>
    </div>
  );
};
