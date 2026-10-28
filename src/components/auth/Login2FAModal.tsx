import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  KeyRound,
  Lock,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  Eye,
  EyeOff,
  Smartphone,
  RefreshCw,
} from 'lucide-react';
import { AuthSession, UserRole, LoginChallengeResponse } from '../../types';

interface Login2FAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (session: AuthSession) => void;
}

export const Login2FAModal: React.FC<Login2FAModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [totpCode, setTotpCode] = useState('');
  const [useRecoveryMode, setUseRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [tempToken, setTempToken] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('+52 •••• •••• ••••');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('oficial_cumplimiento');
  const [userName, setUserName] = useState('');

  const [loading, setLoading] = useState(false);
  const [resendingSms, setResendingSms] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);
  const [smsWarningMsg, setSmsWarningMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  if (!isOpen) return null;

  const resetChallenge = () => {
    setStep('credentials');
    setTempToken('');
    setMaskedPhone('+52 •••• •••• ••••');
    setMustChangePassword(false);
    setTotpCode('');
    setUseRecoveryMode(false);
    setNewPassword('');
    setShowPassword(false);
    setShowNewPassword(false);
    setResendCooldown(0);
    setResendFeedback(null);
    setSmsWarningMsg(null);
    setRemainingAttempts(null);
    setErrorMsg(null);
  };

  const handleClose = () => {
    resetChallenge();
    setPassword('');
    onClose();
  };

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setResendFeedback(null);
    setSmsWarningMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Credenciales inválidas');
      }

      const challenge = data as LoginChallengeResponse;
      const isSmsDelivered = challenge.smsDelivered !== false;
      setTempToken(challenge.tempToken);
      setMaskedPhone(challenge.maskedPhone || '+52 •••• •••• ••••');
      setMustChangePassword(Boolean(challenge.mustChangePassword));
      setUserRole(challenge.role);
      setUserName(challenge.name);
      setUseRecoveryMode(!isSmsDelivered);
      setSmsWarningMsg(!isSmsDelivered ? (challenge.smsWarning ?? null) : null);
      setPassword('');
      setShowPassword(false);
      setResendCooldown(isSmsDelivered ? 45 : 0);
      setStep('totp');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al procesar credenciales');
    } finally {
      setLoading(false);
    }
  };

  const handleResendSms = async () => {
    if (resendingSms || resendCooldown > 0 || !tempToken) return;
    setResendingSms(true);
    setErrorMsg(null);
    setResendFeedback(null);

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo reenviar el código SMS');
      }
      if (data.maskedPhone) {
        setMaskedPhone(String(data.maskedPhone));
      }
      setResendFeedback(`Nuevo código SMS enviado a ${data.maskedPhone || maskedPhone}.`);
      setResendCooldown(60);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al reenviar código SMS');
    } finally {
      setResendingSms(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempToken,
          code: totpCode.trim(),
          newPassword: mustChangePassword ? newPassword : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.remainingAttempts !== undefined) {
          setRemainingAttempts(data.remainingAttempts);
        }
        throw new Error(data.error || 'Código SMS 2FA inválido');
      }

      const session: AuthSession = {
        user: data.user,
        token: data.token,
        expiresAt: data.expiresAt,
        refreshToken: data.refreshToken,
        refreshExpiresAt: data.refreshExpiresAt,
      };

      onLoginSuccess(session);
      resetChallenge();
      setEmail('');
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al verificar código SMS 2FA');
    } finally {
      setLoading(false);
    }
  };

  const isCodeReady = useRecoveryMode ? totpCode.trim().length >= 8 : totpCode.length === 6;
  const isNewPasswordReady = !mustChangePassword || newPassword.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl glass-panel p-6 sm:p-8 border border-slate-200 dark:border-white/10 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-login-title"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#249E82]/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20 opacity-0 dark:opacity-100" />

        {/* Encabezado */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#249E82] to-[#396CAE] flex items-center justify-center text-white shadow-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="modal-login-title" className="text-xl font-bold text-slate-900 dark:text-white">
                Acceso Institucional 2FA
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verificación de Doble Factor vía Código SMS al Móvil Registrado (Cero Apps)
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">{errorMsg}</span>
              {remainingAttempts !== null && remainingAttempts > 0 && (
                <p className="mt-1 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                  Te restan {remainingAttempts} intento(s) antes del bloqueo preventivo de 15 min.
                </p>
              )}
            </div>
          </div>
        )}

        {resendFeedback && !errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{resendFeedback}</span>
          </div>
        )}

        {step === 'credentials' ? (
          <form onSubmit={handleCredentialSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Correo Electrónico Institucional
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
                  placeholder="usuario@cruse.com.mx"
                />
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl glass-input text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
                  placeholder="••••••••••••"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label="Mostrar u ocultar contraseña"
                  aria-pressed={showPassword}
                  className="absolute right-3 top-2.5 p-0.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-[#249E82] to-[#396CAE] hover:from-[#1e856e] hover:to-[#2e578c] transition-all shadow-lg shadow-[#249E82]/25 flex items-center justify-center gap-2 mt-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Enviar Código SMS a mi Celular</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleTotpSubmit} className="mt-6 space-y-4 animate-fade-in">
            {smsWarningMsg ? (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-200">
                      {userName} ({userRole.replace('_', ' ').toUpperCase()})
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                      {smsWarningMsg}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={resendingSms || resendCooldown > 0}
                  onClick={handleResendSms}
                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-[11px] font-semibold text-cyan-700 dark:text-[#00D1FF] border border-cyan-600/40 dark:border-[#00D1FF]/30 disabled:opacity-50 inline-flex items-center gap-1 shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${resendingSms ? 'animate-spin' : ''}`} />
                  <span>{resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : 'Reintentar SMS'}</span>
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-200">
                      {userName} ({userRole.replace('_', ' ').toUpperCase()})
                    </p>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300">
                      Se envió un código SMS de 6 dígitos a tu celular registrado:{' '}
                      <span className="font-mono font-bold text-cyan-700 dark:text-[#00D1FF]">{maskedPhone}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={resendingSms || resendCooldown > 0}
                  onClick={handleResendSms}
                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-[11px] font-semibold text-cyan-700 dark:text-[#00D1FF] border border-cyan-600/40 dark:border-[#00D1FF]/30 disabled:opacity-50 inline-flex items-center gap-1 shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${resendingSms ? 'animate-spin' : ''}`} />
                  <span>{resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : 'Reenviar SMS'}</span>
                </button>
              </div>
            )}

            {mustChangePassword && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
                  <Lock className="w-4 h-4" />
                  <span>Cambio Obligatorio de Contraseña Temporal (Primer Ingreso)</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Por seguridad, debes reemplazar la contraseña temporal entregada por el Administrador por una contraseña personal definitiva (mínimo 10 caracteres).
                </p>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={10}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nueva contraseña personal (mín. 10 caracteres)"
                    className="w-full pl-9 pr-10 py-2 rounded-xl glass-input text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-2 text-slate-400 hover:text-white"
                    aria-label="Mostrar u ocultar nueva contraseña"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {useRecoveryMode
                    ? 'Código de Recuperación de Emergencia (XXXX-XXXX)'
                    : 'Código SMS de 6 Dígitos Recibido en tu Celular'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setUseRecoveryMode((prev) => !prev);
                    setTotpCode('');
                  }}
                  className="text-[11px] font-semibold text-cyan-700 dark:text-[#00D1FF] hover:underline"
                >
                  {useRecoveryMode ? 'Usar código SMS (6 dígitos)' : '¿No recibiste el SMS? Usa tu código de respaldo'}
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  maxLength={useRecoveryMode ? 9 : 6}
                  required
                  autoFocus
                  value={totpCode}
                  onChange={(e) =>
                    setTotpCode(
                      useRecoveryMode
                        ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')
                        : e.target.value.replace(/\D/g, '')
                    )
                  }
                  className="w-full tracking-[0.35em] text-center font-mono font-bold text-xl py-2.5 rounded-xl glass-input text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
                  placeholder={useRecoveryMode ? 'XXXX-XXXX' : '000000'}
                />
                {useRecoveryMode ? (
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                ) : (
                  <Smartphone className="w-4 h-4 text-cyan-700 dark:text-[#00D1FF] absolute left-3 top-3.5" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={resetChallenge}
                className="w-1/3 py-2.5 px-3 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={loading || !isCodeReady || !isNewPasswordReady}
                className="w-2/3 py-2.5 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-[#249E82] to-[#396CAE] hover:from-[#1e856e] hover:to-[#2e578c] transition-all shadow-lg shadow-[#249E82]/25 flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>{useRecoveryMode ? 'Verificar Código de Respaldo y Entrar' : 'Verificar Código SMS y Entrar'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
