import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Smartphone,
  Shield,
  CheckCircle2,
  XCircle,
  RefreshCw,
  KeyRound,
  Mail,
  User,
  Copy,
  Check,
  Printer,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { AuthSession, UserRole } from '../../types';

interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phoneNumber: string | null;
  totpEnrolled: boolean;
  mustChangePassword: boolean;
  active: boolean;
  createdAt: string;
}

interface OneTimeCredentialsBundle {
  targetEmail: string;
  targetName: string;
  targetRole: UserRole;
  registeredPhone?: string | null;
  initialPassword?: string;
  recoveryCodes?: string[];
  outOfBandNotice: string;
}

interface UserManagementViewProps {
  session: AuthSession;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Dirección / Administrador General',
  oficial_cumplimiento: 'Oficial de Cumplimiento / Operaciones (Alma)',
  promotor: 'Promotor en Campo (PWA Captura)',
};

export const UserManagementView: React.FC<UserManagementViewProps> = ({ session }) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('oficial_cumplimiento');
  const [phoneNumber, setPhoneNumber] = useState('+52');
  const [submitting, setSubmitting] = useState(false);

  const [editingPhoneUserId, setEditingPhoneUserId] = useState<string | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState('');

  const [oneTimeBundle, setOneTimeBundle] = useState<OneTimeCredentialsBundle | null>(null);
  const [outOfBandConfirmed, setOutOfBandConfirmed] = useState(false);
  const [copiedBundle, setCopiedBundle] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${session.token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el catálogo de usuarios');
      setUsers(data.users || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ name, email, role, phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear el usuario');

      if (data.oneTimeCredentials) {
        setOneTimeBundle({
          targetEmail: data.user.email,
          targetName: data.user.name,
          targetRole: data.user.role,
          registeredPhone: data.user.phoneNumber ?? phoneNumber,
          initialPassword: data.oneTimeCredentials.initialPassword,
          recoveryCodes: data.oneTimeCredentials.recoveryCodes,
          outOfBandNotice: data.oneTimeCredentials.outOfBandNotice,
        });
        setOutOfBandConfirmed(false);
        setCopiedBundle(false);
      }

      setSuccessMsg(`Usuario ${data.user.email} creado con teléfono móvil registrado para 2FA vía SMS.`);
      setName('');
      setEmail('');
      setPhoneNumber('+52');
      await fetchUsers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al registrar usuario');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePatchUser = async (
    u: ManagedUser,
    patch: {
      active?: boolean;
      role?: UserRole;
      phoneNumber?: string;
      resetTotp?: boolean;
      generateTemporaryPassword?: boolean;
    },
    description: string
  ) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar usuario');

      if (data.oneTimeCredentials) {
        setOneTimeBundle({
          targetEmail: u.email,
          targetName: u.name,
          targetRole: patch.role ?? u.role,
          registeredPhone: patch.phoneNumber ?? u.phoneNumber,
          initialPassword: data.oneTimeCredentials.initialPassword,
          recoveryCodes: data.oneTimeCredentials.recoveryCodes,
          outOfBandNotice: data.oneTimeCredentials.outOfBandNotice,
        });
        setOutOfBandConfirmed(false);
        setCopiedBundle(false);
      }

      const revokedCount = data.auditDiff?.sessionsRevoked ?? 0;
      setSuccessMsg(
        `${description} (${u.email}).${revokedCount > 0 ? ` Sesiones revocadas atómicamente: ${revokedCount}.` : ''}`
      );
      setEditingPhoneUserId(null);
      await fetchUsers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error actualizando usuario');
    }
  };

  const handleCopyOneTimeBundle = async () => {
    if (!oneTimeBundle) return;
    const lines = [
      `CARTA DE BIENVENIDA Y ENTREGA FUERA DE BANDA (OUT-OF-BAND) — MICROFINANCIERA CRUSE`,
      `Operador: ${oneTimeBundle.targetName} (${oneTimeBundle.targetEmail})`,
      `Rol RBAC: ${oneTimeBundle.targetRole}`,
      oneTimeBundle.registeredPhone
        ? `Teléfono Móvil Registrado para Código SMS 2FA: ${oneTimeBundle.registeredPhone}`
        : null,
      oneTimeBundle.initialPassword
        ? `Contraseña Temporal (Cambio obligatorio en 1er acceso): ${oneTimeBundle.initialPassword}`
        : null,
      oneTimeBundle.recoveryCodes && oneTimeBundle.recoveryCodes.length > 0
        ? `Códigos de Emergencia (Un solo uso): ${oneTimeBundle.recoveryCodes.join(', ')}`
        : null,
      `AVISO: ${oneTimeBundle.outOfBandNotice}`,
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedBundle(true);
      window.setTimeout(() => setCopiedBundle(false), 2500);
    } catch {
      setCopiedBundle(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 p-6 rounded-3xl glass-panel border border-white/10 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#249E82] to-[#396CAE] flex items-center justify-center text-white">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">+ Nuevo Usuario (Alta 2FA SMS)</h2>
              <p className="text-[11px] text-slate-400">Código SMS al Celular Registrado (Cero Apps Externas)</p>
            </div>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Nombre Completo</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Alma Operadora Cruse"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white focus:border-[#00D1FF] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Correo Institucional</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alma@cruse.com.mx"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white focus:border-[#00D1FF] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Rol de Acceso (RBAC)</label>
              <div className="relative">
                <Shield className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white focus:border-[#00D1FF] focus:outline-none"
                >
                  <option value="admin">{ROLE_LABELS.admin}</option>
                  <option value="oficial_cumplimiento">{ROLE_LABELS.oficial_cumplimiento}</option>
                  <option value="promotor">{ROLE_LABELS.promotor}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Teléfono Móvil para Código SMS (10 dígitos / +52)
              </label>
              <div className="relative">
                <Smartphone className="w-4 h-4 text-[#00D1FF] absolute left-3 top-2.5" />
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+526141234567"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white font-mono focus:border-[#00D1FF] focus:outline-none"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#00D1FF]/10 border border-[#00D1FF]/25 text-[11px] text-slate-300 space-y-1">
              <div className="font-semibold text-[#00D1FF] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Doble Factor por SMS sin Instalar Aplicaciones</span>
              </div>
              <p>
                El sistema enviará un código SMS de 6 dígitos al teléfono móvil registrado cada vez que el colaborador inicie sesión y le pedirá cambiar su contraseña temporal en el primer ingreso.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{errorMsg}</div>
            )}
            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">{successMsg}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#249E82] to-[#396CAE] hover:opacity-95 text-white font-bold shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>{submitting ? 'Generando Credenciales...' : 'Crear Usuario'}</span>
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl flex flex-col">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Padrón de Operadores y Ciclo ABC ({users.length})</h3>
              <p className="text-xs text-slate-400">2FA vía Código SMS al celular registrado + Baja Inmediata (Kill-Switch)</p>
            </div>
            <button onClick={fetchUsers} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors" title="Actualizar padrón">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase font-mono text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Operador & Celular SMS</th>
                  <th className="py-3 px-4">Rol RBAC</th>
                  <th className="py-3 px-4">Estado 2FA SMS</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones ABC (Kill-Switch)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => {
                  const isSelf = u.id === session.user.id || u.email === session.user.email;
                  return (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{u.name}</div>
                        <div className="text-slate-400 font-mono text-[11px]">{u.email}</div>
                        {editingPhoneUserId === u.id ? (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <input
                              type="tel"
                              value={editingPhoneValue}
                              onChange={(e) => setEditingPhoneValue(e.target.value)}
                              placeholder="+526141234567"
                              className="px-2 py-1 rounded bg-slate-900 border border-[#00D1FF]/40 text-white font-mono text-[11px] w-36"
                            />
                            <button
                              type="button"
                              onClick={() => handlePatchUser(u, { phoneNumber: editingPhoneValue }, 'Teléfono móvil para SMS 2FA actualizado')}
                              className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold"
                            >
                              Guardar
                            </button>
                            <button type="button" onClick={() => setEditingPhoneUserId(null)} className="px-2 py-1 rounded bg-white/10 text-slate-300 text-[10px]">
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="text-slate-400 font-mono text-[10px] flex items-center gap-2 mt-0.5">
                            <span>📱 {u.phoneNumber || 'Sin celular asignado'}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPhoneUserId(u.id);
                                setEditingPhoneValue(u.phoneNumber || '+52');
                              }}
                              className="text-[#00D1FF] hover:underline font-sans font-semibold"
                            >
                              Cambiar Celular
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          disabled={isSelf}
                          value={u.role}
                          onChange={(e) => handlePatchUser(u, { role: e.target.value as UserRole }, `Cambio de rol RBAC a ${e.target.value}`)}
                          className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-slate-900 text-[#00D1FF] border border-[#00D1FF]/30 disabled:opacity-60"
                        >
                          <option value="admin">ADMIN / DIRECCIÓN</option>
                          <option value="oficial_cumplimiento">OFICIAL CUMPLIMIENTO</option>
                          <option value="promotor">PROMOTOR CAMPO</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4 space-y-1">
                        {u.totpEnrolled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#00D1FF]/10 text-[#00D1FF] border border-[#00D1FF]/30">
                            <Smartphone className="w-3 h-3" /> 2FA SMS ACTIVO
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            <Smartphone className="w-3 h-3" /> PENDIENTE 1ER SMS
                          </span>
                        )}
                        {u.mustChangePassword && <div className="text-[10px] text-amber-400 font-mono">Cambio clave pendiente</div>}
                      </td>
                      <td className="py-3.5 px-4">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <XCircle className="w-3.5 h-3.5" /> Baja / Suspendido
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handlePatchUser(u, { resetTotp: true }, 'Nuevos códigos de emergencia 2FA generados')}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#00D1FF]/15 hover:bg-[#00D1FF]/25 text-[#00D1FF] border border-[#00D1FF]/30 inline-flex items-center gap-1"
                            title="Regenerar 8 códigos de emergencia de un solo uso y revocar sesiones"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Resetear 2FA / Códigos</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handlePatchUser(u, { generateTemporaryPassword: true }, 'Contraseña temporal regenerada Out-of-Band')}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1"
                            title="Emitir nueva contraseña temporal Out-of-Band"
                          >
                            <KeyRound className="w-3 h-3" />
                            <span>Clave Temp</span>
                          </button>

                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() =>
                                handlePatchUser(
                                  u,
                                  { active: !u.active },
                                  u.active ? 'Baja administrativa con Kill-Switch' : 'Reactivación de cuenta'
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                                u.active
                                  ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {u.active ? 'Suspender Acceso (Baja)' : 'Reactivar Usuario'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {oneTimeBundle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl glass-panel p-6 border border-[#D4AF37]/40 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-[#D4AF37]" />
                <div>
                  <h3 className="text-sm font-bold text-white">Carta de Bienvenida de Un Solo Uso — Entrega Fuera de Banda</h3>
                  <p className="text-[11px] text-slate-400">
                    Operador: {oneTimeBundle.targetName} ({oneTimeBundle.targetEmail})
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-[11px] font-semibold">
              {oneTimeBundle.outOfBandNotice}
            </div>

            {oneTimeBundle.registeredPhone && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-white/10 space-y-1">
                <div className="text-[11px] text-slate-400">
                  Teléfono Móvil Registrado para recibir el Código SMS de 6 Dígitos (Sin instalar apps):
                </div>
                <div className="font-mono text-sm font-bold text-[#00D1FF] select-all">{oneTimeBundle.registeredPhone}</div>
              </div>
            )}

            {oneTimeBundle.initialPassword && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-white/10 space-y-1">
                <div className="text-[11px] text-slate-400">Contraseña Temporal (el sistema exigirá cambiarla en el 1er acceso):</div>
                <div className="font-mono text-sm font-bold text-emerald-400 select-all">{oneTimeBundle.initialPassword}</div>
              </div>
            )}

            {oneTimeBundle.recoveryCodes && oneTimeBundle.recoveryCodes.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-white/10 space-y-1.5">
                <div className="text-[11px] text-slate-400">
                  8 Códigos de Emergencia de Un Solo Uso (respaldo si algún día no tiene señal celular):
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[11px] text-slate-200">
                  {oneTimeBundle.recoveryCodes.map((c) => (
                    <span key={c} className="px-2 py-1 rounded bg-white/5 border border-white/10 text-center">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCopyOneTimeBundle}
                className="flex-1 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center justify-center gap-2"
              >
                {copiedBundle ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedBundle ? 'Copiado al portapapeles' : 'Copiar Carta de Bienvenida'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="py-2 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Acta</span>
              </button>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 cursor-pointer">
              <input
                type="checkbox"
                checked={outOfBandConfirmed}
                onChange={(e) => setOutOfBandConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-amber-400"
              />
              <span className="text-[11px] text-amber-200 font-semibold">
                Confirmo que estas credenciales han sido entregadas personalmente al colaborador, sin utilizar SMS, WhatsApp ni correo electrónico.
              </span>
            </label>

            <button
              type="button"
              disabled={!outOfBandConfirmed}
              onClick={() => {
                setOneTimeBundle(null);
                setOutOfBandConfirmed(false);
              }}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#249E82] to-[#396CAE] text-white font-bold disabled:opacity-40 transition-all"
            >
              Cerrar y Purgar Credenciales de Pantalla
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
