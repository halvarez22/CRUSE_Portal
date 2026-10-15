import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Smartphone, Shield, CheckCircle2, XCircle, RefreshCw, KeyRound, Mail, User } from 'lucide-react';
import { AuthSession, UserRole } from '../../types';

interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phoneNumber: string | null;
  active: boolean;
  createdAt: string;
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

  // Formulario de alta
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('oficial_cumplimiento');
  const [phoneNumber, setPhoneNumber] = useState('+52');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/users', {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo cargar el catálogo de usuarios');
      }
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          name,
          email,
          role,
          phoneNumber,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al crear el usuario');
      }
      setSuccessMsg(`Usuario ${data.user.email} creado exitosamente con 2FA SMS habilitado.`);
      setName('');
      setEmail('');
      setPassword('');
      setPhoneNumber('+52');
      await fetchUsers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al registrar usuario');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (u: ManagedUser) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ active: !u.active }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al actualizar estatus');
      }
      setSuccessMsg(`Estatus de ${u.email} actualizado.`);
      await fetchUsers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error actualizando usuario');
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado y Alta de Usuarios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 p-6 rounded-3xl glass-panel border border-white/10 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#249E82] to-[#396CAE] flex items-center justify-center text-white">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Alta de Usuario Institucional</h2>
              <p className="text-[11px] text-slate-400">Control de Acceso Basado en Roles (RBAC) + 2FA SMS</p>
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
              <label className="block text-slate-300 font-semibold mb-1">Rol y Nivel de Acceso (RBAC)</label>
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
              <label className="block text-slate-300 font-semibold mb-1">Celular para Código 2FA SMS (E.164)</label>
              <div className="relative">
                <Smartphone className="w-4 h-4 text-[#00D1FF] absolute left-3 top-2.5" />
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+524777241148"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white font-mono focus:border-[#00D1FF] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Contraseña Inicial (mín. 10 caracteres)</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white focus:border-[#00D1FF] focus:outline-none"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#249E82] to-[#396CAE] hover:opacity-95 text-white font-bold shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>{submitting ? 'Registrando...' : 'Crear Usuario con 2FA SMS'}</span>
            </button>
          </form>
        </div>

        {/* Tabla de Usuarios Registrados */}
        <div className="lg:col-span-2 rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl flex flex-col">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Padrón de Operadores Autorizados ({users.length})</h3>
              <p className="text-xs text-slate-400">Cada inicio de sesión exige contraseña scrypt + OTP vía Twilio Verify SMS</p>
            </div>
            <button
              onClick={fetchUsers}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Actualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase font-mono text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Operador</th>
                  <th className="py-3 px-4">Rol Institucional</th>
                  <th className="py-3 px-4">Teléfono 2FA SMS</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white">{u.name}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{u.email}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#396CAE]/20 text-[#00D1FF] border border-[#00D1FF]/30">
                        {u.role.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-200">
                      {u.phoneNumber || <span className="text-amber-400 text-[11px]">Usa teléfono maestro (.env)</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      {u.active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle className="w-3.5 h-3.5" /> Suspendido
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {u.email !== session.user.email && (
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                            u.active
                              ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {u.active ? 'Suspender' : 'Reactivar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
