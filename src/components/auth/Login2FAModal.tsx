import React, { useState } from 'react';
import { X, ShieldCheck, KeyRound, Lock, ArrowRight, AlertTriangle, CheckCircle2, UserCheck, Eye, EyeOff } from 'lucide-react';
import { AuthSession, UserRole, LoginChallengeResponse, TotpEnrollment } from '../../types';
import { TotpEnrollmentPanel } from './TotpEnrollmentPanel';

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
  const [tempToken, setTempToken] = useState('');
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('oficial_cumplimiento');
  const [userName, setUserName] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  if (!isOpen) return null;

  const resetChallenge = () => {
    setStep('credentials');
    setTempToken('');
    setEnrollment(null);
    setTotpCode('');
    setShowPassword(false);
    setRemainingAttempts(null);
    setErrorMsg(null);
  };

  const handleClose = () => {
    resetChallenge();
    setPassword('');
    setShowPassword(false);
    onClose();
  };

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

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
      setTempToken(challenge.tempToken);
      setEnrollment(challenge.enrollment ?? null);
      setUserRole(challenge.role);
      setUserName(challenge.name);
      setPassword('');
      setShowPassword(false);
      setStep('totp');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al procesar credenciales');
    } finally {
      setLoading(false);
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
        body: JSON.stringify({ tempToken, code: totpCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.remainingAttempts !== undefined) {
          setRemainingAttempts(data.remainingAttempts);
        }
        throw new Error(data.error || 'Código 2FA inválido');
      }

      // Éxito: sesion autorizada
      const session: AuthSession = {
        user: data.user,
        token: data.token,
        expiresAt: data.expiresAt,
      };

      onLoginSuccess(session);
      resetChallenge();
      setEmail('');
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al verificar 2FA');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-lg rounded-3xl glass-panel p-6 sm:p-8 border border-white/20 dark:border-white/10 shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-login-title"
      >
        {/* Fondo decorativo */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#249E82]/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        {/* Encabezado */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#249E82] to-[#396CAE] flex items-center justify-center text-white shadow-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="modal-login-title" className="text-xl font-bold text-slate-900 dark:text-white">
                Acceso Institucional Seguro
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Autenticación de 2 Factores (2FA Código SMS Móvil)
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
                  OBS-3: Te restan {remainingAttempts} intento(s) antes del bloqueo de 15 min.
                </p>
              )}
            </div>
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
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
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
                  <span>Continuar a Desafío 2FA</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleTotpSubmit} className="mt-6 space-y-4 animate-fade-in">
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {userName} ({userRole.replace('_', ' ').toUpperCase()})
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Introduce el código de 6 dígitos enviado por SMS a tu teléfono móvil.
                </p>
              </div>
            </div>

            {enrollment && <TotpEnrollmentPanel enrollment={enrollment} />}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Código de Seguridad de 6 Dígitos
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full tracking-[0.5em] text-center font-mono font-bold text-xl py-2.5 rounded-xl glass-input text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
                  placeholder="000000"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
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
                disabled={loading || totpCode.length !== 6}
                className="w-2/3 py-2.5 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-[#249E82] to-[#396CAE] hover:from-[#1e856e] hover:to-[#2e578c] transition-all shadow-lg shadow-[#249E82]/25 flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Validar 2FA</span>
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
