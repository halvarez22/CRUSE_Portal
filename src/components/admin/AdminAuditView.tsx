import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, ArrowLeft, RefreshCw, FileText, Download, Hash, Clock, Filter, FileCheck2, LayoutDashboard, Users } from 'lucide-react';
import { AuthSession, AuditEvent, ExpedienteItem } from '../../types';
import { formatAuditActionLabel } from '../../services/audit/auditMask';
import { ReconciliationView } from './ReconciliationView';
import { UserManagementView } from './UserManagementView';
import { DashboardLayout } from '../dashboard/DashboardLayout';

interface AdminAuditViewProps {
  session: AuthSession;
  onLogout: () => void;
  onBackToPortal: () => void;
}

export const AdminAuditView: React.FC<AdminAuditViewProps> = ({
  session,
  onLogout,
  onBackToPortal,
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'audit' | 'expedientes' | 'reconciliation' | 'users'>('dashboard');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [expedientes, setExpedientes] = useState<ExpedienteItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Estado de verificación de integridad criptográfica
  const [integrityStatus, setIntegrityStatus] = useState<{
    verified: boolean;
    valid?: boolean;
    details?: string;
    totalEvents?: number;
    verifying?: boolean;
  }>({ verified: false });

  // Filtros
  const [actionFilter, setActionFilter] = useState('');
  const [searchEmail, setSearchEmail] = useState('');

  // Cargar eventos de bitácora con Bearer token
  const fetchAuditEvents = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (actionFilter) query.append('action', actionFilter);
      if (searchEmail) query.append('actorEmail', searchEmail);
      query.append('limit', '100');

      const res = await fetch(`/api/audit/events?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      const data = await res.json();
      if (data.events) {
        setEvents(data.events);
      }
    } catch (err) {
      console.error('Error cargando bitácora forense:', err);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, searchEmail, session.token]);

  // Cargar expedientes con Bearer token
  const fetchExpedientes = useCallback(async () => {
    try {
      const res = await fetch('/api/expedientes', {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      const data = await res.json();
      if (data.expedientes) {
        setExpedientes(data.expedientes);
      }
    } catch (err) {
      console.error('Error cargando expedientes:', err);
    }
  }, [session.token]);

  useEffect(() => {
    localStorage.setItem('auth_token', session.token);
    fetchAuditEvents();
    fetchExpedientes();
  }, [fetchAuditEvents, fetchExpedientes, session.token]);

  // Ejecutar verificación criptográfica de la cadena SHA-256
  const handleVerifyChain = async () => {
    setIntegrityStatus({ verified: false, verifying: true });
    try {
      const res = await fetch('/api/audit/verify', {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      const result = await res.json();
      setIntegrityStatus({
        verified: true,
        valid: result.valid,
        details: result.details,
        totalEvents: result.totalEvents,
        verifying: false,
      });
    } catch {
      setIntegrityStatus({
        verified: true,
        valid: false,
        details: 'Fallo al conectar con el motor de verificación',
        verifying: false,
      });
    }
  };

  // Simulación de descarga de Layout para Logic Systems (SIF / CIB)
  const handleDownloadSifLayout = () => {
    const header = 'CONVENIO,RFC,NOMBRE,IMPORTE_PRESTAMO,PLAZO_QUINCENAS,CUOTA_QUINCENAL,FECHA_REGISTRO\n';
    const rows = expedientes.map(exp => {
      return `STSGECH,${exp.curpMasked.slice(0, 10)},"${exp.fullName}",${exp.requestedAmount},${exp.termFortnights},569.44,${exp.createdAt.slice(0, 10)}`;
    }).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CRUSE_LAYOUT_SIF_CIB_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header Institucional de Control */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-white/10 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToPortal}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Volver a la vista pública"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Portal Público</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#249E82]" />
              <h1 className="text-base font-bold text-white">Centro de Control Operativo & Cumplimiento Forense (WORM)</h1>
            </div>
            <p className="text-xs text-slate-400">
              {session.user.name} — <span className="text-[#00D1FF] font-medium">{session.user.role.replace('_', ' ').toUpperCase()}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>2FA SMS Autenticado</span>
          </div>
          <button
            onClick={onLogout}
            className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/30 hover:bg-rose-500/30 text-rose-400 text-xs font-semibold transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* Navegación por pestañas */}
      <div className="max-w-7xl w-full mx-auto px-6 pt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 p-1 rounded-2xl bg-white/5 border border-white/10">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'dashboard'
                ? 'bg-[#249E82] text-white shadow-lg shadow-[#249E82]/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard Cartera (317)</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'bg-[#249E82] text-white shadow-lg shadow-[#249E82]/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Hash className="w-4 h-4" />
            <span>Bitácora Forense (5 Años)</span>
          </button>
          <button
            onClick={() => setActiveTab('expedientes')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'expedientes'
                ? 'bg-[#396CAE] text-white shadow-lg shadow-[#396CAE]/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Expedientes ({expedientes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('reconciliation')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'reconciliation'
                ? 'bg-[#249E82] text-white shadow-lg shadow-[#249E82]/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Conciliación Quincenal</span>
          </button>
          {session.user.role === 'admin' && (
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'users'
                  ? 'bg-[#396CAE] text-white shadow-lg shadow-[#396CAE]/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Usuarios y Accesos 2FA</span>
            </button>
          )}
        </div>

        {activeTab === 'audit' && (
          <button
            onClick={handleVerifyChain}
            disabled={integrityStatus.verifying}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-[#249E82] hover:from-emerald-500 hover:to-[#1e856e] text-white text-xs font-semibold shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all"
          >
            {integrityStatus.verifying ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            <span>Verificar Integridad SHA-256</span>
          </button>
        )}

        {activeTab === 'expedientes' && (
          <button
            onClick={handleDownloadSifLayout}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#396CAE] to-[#249E82] hover:opacity-90 text-white text-xs font-semibold shadow-lg shadow-[#396CAE]/20 flex items-center gap-2 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Descargar Layout SIF / CIB</span>
          </button>
        )}
      </div>

      {/* Banner de Verificación Criptográfica */}
      {integrityStatus.verified && (
        <div className="max-w-7xl w-full mx-auto px-6 mt-4 animate-fade-in">
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between text-xs ${
              integrityStatus.valid
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-3">
              {integrityStatus.valid ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <div>
                <p className="font-bold text-sm">
                  {integrityStatus.valid
                    ? '✅ Certificación de Integridad Forense Exitosa'
                    : '⚠️ Alerta de Integridad Comprometida'}
                </p>
                <p className="mt-0.5">{integrityStatus.details}</p>
              </div>
            </div>
            <span className="font-mono text-[11px] px-2.5 py-1 rounded bg-black/40 border border-white/10">
              Total Bloques: {integrityStatus.totalEvents}
            </span>
          </div>
        </div>
      )}

      {/* Contenido Principal */}
      <main className="max-w-7xl w-full mx-auto p-6 flex-1 flex flex-col">
        {activeTab === 'dashboard' && <DashboardLayout />}

        {activeTab === 'audit' && (
          <div className="space-y-4">
            {/* Filtros de Bitácora */}
            <div className="p-4 rounded-2xl glass-card border border-white/10 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Filter className="w-4 h-4 text-[#249E82]" />
                  <span>Filtrar por Acción:</span>
                </div>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl glass-input text-xs text-slate-200 focus:outline-none"
                >
                  <option value="">Todas las acciones</option>
                  <option value="LOGIN_2FA_SUCCESS">Acceso Seguro 2FA</option>
                  <option value="LOGIN_FAILURE">Intento Fallido</option>
                  <option value="EXPEDIENTE_CREATE">Expediente Creado</option>
                  <option value="EXPEDIENTE_SYNC">Sincronización Nube</option>
                  <option value="EXPEDIENTE_PURGE">Purga Zero-PII</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Buscar por correo..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  className="px-3 py-1.5 rounded-xl glass-input text-xs text-slate-200 placeholder-slate-500 focus:outline-none w-48"
                />
                <button
                  onClick={fetchAuditEvents}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                  title="Actualizar tabla"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Tabla de Bitácora Forense */}
            <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase font-mono text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Fecha y Hora (ISO)</th>
                      <th className="py-3 px-4">Actor & Rol</th>
                      <th className="py-3 px-4">Acción Auditada</th>
                      <th className="py-3 px-4">CURP Protegido</th>
                      <th className="py-3 px-4">Origen IP & Dispositivo</th>
                      <th className="py-3 px-4">Sello SHA-256 (Merkle)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {events.map((evt) => {
                      const isSuccess = evt.outcome === 'success';
                      return (
                        <tr key={evt.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-300 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            {evt.ts.replace('T', ' ').slice(0, 19)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-200">{evt.actorEmail}</div>
                            <span className="text-[10px] text-slate-400 capitalize">{evt.actorRole}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                                isSuccess
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              }`}
                            >
                              {formatAuditActionLabel(evt.action, evt.curpMasked)}
                            </span>
                            {evt.details && (
                              <p className="text-[11px] text-slate-400 mt-1 max-w-xs">{evt.details}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-300">
                            {evt.curpMasked || '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-[11px]">
                            {evt.sourceSummary || evt.sourceIp}
                          </td>
                          <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                            <div className="flex items-center gap-1" title={evt.recordHash}>
                              <span className="text-emerald-400">#</span>
                              <span>{evt.recordHash.slice(0, 12)}...{evt.recordHash.slice(-6)}</span>
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
        )}

        {activeTab === 'expedientes' && (
          /* Pestaña de Expedientes Recibidos */
          <div className="space-y-4">
            <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase font-mono text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Folio</th>
                      <th className="py-3 px-4">Cliente / Solicitante</th>
                      <th className="py-3 px-4">CURP (Enmascarado)</th>
                      <th className="py-3 px-4">Monto Solicitado</th>
                      <th className="py-3 px-4">Plazo</th>
                      <th className="py-3 px-4">Promotor Asignado</th>
                      <th className="py-3 px-4">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {expedientes.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No hay expedientes pendientes de conciliación. Usa la PWA móvil de promotores para capturar uno.
                        </td>
                      </tr>
                    ) : (
                      expedientes.map((exp) => (
                        <tr key={exp.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-4 font-mono text-[#00D1FF] font-semibold">{exp.id}</td>
                          <td className="py-3 px-4 font-medium text-slate-200">{exp.fullName}</td>
                          <td className="py-3 px-4 font-mono text-emerald-400">{exp.curpMasked}</td>
                          <td className="py-3 px-4 font-bold text-slate-200">
                            ${exp.requestedAmount.toLocaleString()} MXN
                          </td>
                          <td className="py-3 px-4 text-slate-300 font-semibold">{exp.termFortnights} quincenas</td>
                          <td className="py-3 px-4 text-slate-400 text-[11px]">{exp.promotorEmail}</td>
                          <td className="py-3 px-4">
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {exp.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reconciliation' && (
          <ReconciliationView session={session} onBatchProcessed={fetchExpedientes} />
        )}

        {activeTab === 'users' && session.user.role === 'admin' && (
          <UserManagementView session={session} />
        )}
      </main>
    </div>
  );
};
