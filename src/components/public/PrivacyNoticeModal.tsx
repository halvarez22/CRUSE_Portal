import React, { useEffect, useRef } from 'react';
import { ShieldCheck, FileText, Download, X, Lock, Mail, CheckCircle2 } from 'lucide-react';
import { PRIVACY_NOTICE_LFPDPPP } from '../../data/cruseData';

export interface PrivacyNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyNoticeModal: React.FC<PrivacyNoticeModalProps> = ({ isOpen, onClose }) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
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

  const handleDownloadTxt = () => {
    const lines: string[] = [
      '================================================================================',
      `  ${PRIVACY_NOTICE_LFPDPPP.title.toUpperCase()}`,
      `  ${PRIVACY_NOTICE_LFPDPPP.responsibleEntity}`,
      `  Folio Normativo: ${PRIVACY_NOTICE_LFPDPPP.documentId} | Actualización: ${PRIVACY_NOTICE_LFPDPPP.lastUpdated}`,
      '================================================================================',
      '',
      `MARCO LEGAL: ${PRIVACY_NOTICE_LFPDPPP.legalFramework}`,
      '',
    ];

    for (const clause of PRIVACY_NOTICE_LFPDPPP.clauses) {
      lines.push(`${clause.number}. ${clause.title.toUpperCase()}`);
      lines.push(clause.content);
      if (clause.highlights && clause.highlights.length > 0) {
        for (const item of clause.highlights) {
          lines.push(`  • ${item}`);
        }
      }
      lines.push('');
    }

    lines.push('--------------------------------------------------------------------------------');
    lines.push(`Contacto Oficial UNE / Derechos ARCO: ${PRIVACY_NOTICE_LFPDPPP.uneEmail}`);
    lines.push(`Teléfonos: ${PRIVACY_NOTICE_LFPDPPP.unePhone}`);
    lines.push(`Domicilio: ${PRIVACY_NOTICE_LFPDPPP.responsibleAddress}`);
    lines.push('================================================================================');

    const utf8Content = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([utf8Content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Aviso_Privacidad_Integral_Microfinanciera_Cruse_2026.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-notice-modal-title"
        aria-describedby="privacy-notice-modal-subtitle"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-[#041734] border border-slate-200 dark:border-white/15 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100"
      >
        {/* Encabezado Institucional Fijo */}
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#030914]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#249E82] to-[#396CAE] flex items-center justify-center text-white shadow-md shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-100 dark:bg-[#249E82]/20 text-emerald-900 dark:text-[#4CD360] border border-emerald-300 dark:border-[#249E82]/40">
                  {PRIVACY_NOTICE_LFPDPPP.documentId}
                </span>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Vigente: {PRIVACY_NOTICE_LFPDPPP.lastUpdated}
                </span>
              </div>
              <h2
                id="privacy-notice-modal-title"
                className="text-lg sm:text-xl font-black text-slate-950 dark:text-white"
              >
                {PRIVACY_NOTICE_LFPDPPP.title} — {PRIVACY_NOTICE_LFPDPPP.responsibleEntity}
              </h2>
              <p
                id="privacy-notice-modal-subtitle"
                className="text-xs text-slate-700 dark:text-slate-300"
              >
                {PRIVACY_NOTICE_LFPDPPP.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar Aviso de Privacidad Integral"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo Desplazable con Articulado LFPDPPP */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm leading-relaxed">
          <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-white/10 flex items-start gap-3">
            <FileText className="w-4 h-4 text-[#0F766E] dark:text-[#00D1FF] shrink-0 mt-0.5" />
            <p className="text-xs text-slate-800 dark:text-slate-200">
              <strong className="font-bold">Fundamento Regulatorio:</strong>{' '}
              {PRIVACY_NOTICE_LFPDPPP.legalFramework}
            </p>
          </div>

          {PRIVACY_NOTICE_LFPDPPP.clauses.map((clause) => (
            <section
              key={clause.id}
              className="p-4 rounded-2xl bg-slate-50/90 dark:bg-[#030914]/80 border border-slate-200 dark:border-white/10 space-y-2"
            >
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-[#0F766E] dark:text-[#4CD360] flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-[#249E82]/20 font-mono text-emerald-950 dark:text-[#4CD360]">
                  {clause.number}
                </span>
                <span>{clause.title}</span>
              </h3>
              <p className="text-slate-800 dark:text-slate-200">{clause.content}</p>
              {clause.highlights && clause.highlights.length > 0 && (
                <ul className="pt-1.5 space-y-1 text-xs text-slate-900 dark:text-slate-300 font-medium">
                  {clause.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#249E82] shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* Cintilla de Garantía Criptográfica y UNE */}
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-[#249E82]/15 border border-emerald-300 dark:border-[#249E82]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-emerald-800 dark:text-[#4CD360] shrink-0 mt-0.5" />
              <div className="text-xs">
                <strong className="text-slate-950 dark:text-white block">
                  Atención de Derechos ARCO — Unidad Especializada (UNE)
                </strong>
                <span className="text-slate-700 dark:text-slate-300">
                  Correo oficial: {PRIVACY_NOTICE_LFPDPPP.uneEmail} | Tel: {PRIVACY_NOTICE_LFPDPPP.unePhone}
                </span>
              </div>
            </div>
            <a
              href={`mailto:${PRIVACY_NOTICE_LFPDPPP.uneEmail}?subject=Solicitud%20Derechos%20ARCO%20-%20Microfinanciera%20Cruse`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-black/40 text-emerald-900 dark:text-[#4CD360] border border-emerald-300 dark:border-[#249E82]/40 text-xs font-bold hover:opacity-90 shrink-0"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Contactar UNE</span>
            </a>
          </div>
        </div>

        {/* Pie de Acciones del Modal */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:p-5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#030914]">
          <button
            type="button"
            onClick={handleDownloadTxt}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/15 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 text-xs font-bold flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
          >
            <Download className="w-4 h-4 text-[#0F766E] dark:text-[#00D1FF]" />
            <span>Descargar Aviso Integral (.txt)</span>
          </button>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#249E82] to-[#396CAE] text-white text-xs font-black shadow-md hover:opacity-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
          >
            Entendido y Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
