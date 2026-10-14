import React, { useState } from 'react';
import { Smartphone, Copy, Check, ExternalLink } from 'lucide-react';
import { TotpEnrollment } from '../../types';

interface TotpEnrollmentPanelProps {
  enrollment: TotpEnrollment;
}

/**
 * Panel de enrolamiento TOTP de primer acceso (CRUSE-APO-2026-005 A.2).
 * El servidor solo entrega estos datos mientras el usuario NO está enrolado;
 * tras la primera verificación exitosa nunca se vuelven a mostrar.
 */
export const TotpEnrollmentPanel: React.FC<TotpEnrollmentPanelProps> = ({ enrollment }) => {
  const [copied, setCopied] = useState(false);
  const groupedKey = enrollment.manualKey.match(/.{1,4}/g)?.join(' ') ?? enrollment.manualKey;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(enrollment.manualKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // El portapapeles puede no estar disponible (contexto no seguro); la clave sigue visible.
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-[#00D1FF]/10 border border-[#00D1FF]/30 text-xs space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
        <Smartphone className="w-4 h-4 text-[#00D1FF]" />
        Primer acceso: registra tu aplicación autenticadora
      </div>
      <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
        <li>Abre Google Authenticator, Microsoft Authenticator o 1Password.</li>
        <li>Toca el botón de abajo (desde tu celular) o captura la clave manualmente.</li>
        <li>Escribe el código de 6 dígitos que muestre la app para activar tu 2FA.</li>
      </ol>
      <a
        id="totp-enrollment-open-app"
        href={enrollment.otpauthUri}
        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-[#0D1B3E] text-white font-semibold hover:bg-[#13285a] transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Abrir en mi app autenticadora
      </a>
      <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/70 dark:bg-black/30 border border-slate-200 dark:border-white/10">
        <span className="font-mono text-[12px] tracking-wider text-slate-800 dark:text-slate-100 break-all">{groupedKey}</span>
        <button
          id="totp-enrollment-copy-key"
          type="button"
          onClick={handleCopy}
          className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-[#00D1FF] transition-colors"
          aria-label="Copiar clave de configuración"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400">
        Esta clave es personal y solo se muestra durante tu primer acceso. No la compartas ni la fotografíes.
      </p>
    </div>
  );
};
