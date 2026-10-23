import React, { useState } from 'react';
import { MapPin, ShieldCheck, Activity } from 'lucide-react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { MetricsCards } from './MetricsCards';
import { ReconciliationMasterTable } from './ReconciliationMasterTable';
import { ExpedientDetailModal } from './ExpedientDetailModal';
import { HubFilterOption, HubRegion } from '../../types/executive';

const HUB_OPTIONS: ReadonlyArray<{
  id: HubFilterOption;
  label: string;
  subtitle: string;
}> = [
  { id: 'ALL', label: 'Nacional (3 Hubs)', subtitle: 'Consolidado República Mexicana' },
  { id: 'CHIHUAHUA', label: 'Hub 1: Chihuahua (HQ)', subtitle: 'Norte · STSGECH / Supremo Tribunal' },
  { id: 'LEON', label: 'Hub 2: León (Bajío)', subtitle: 'Centro · Poder Judicial & Salud Gto.' },
  { id: 'CANCUN', label: 'Hub 3: Cancún (Sur)', subtitle: 'Sur · Q. Roo & Riviera Maya' },
];

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(val);

export const DashboardLayout: React.FC = () => {
  const {
    selectedHub,
    setSelectedHub,
    kpis,
    latestLoans,
    kpisLoading,
    loansLoading,
    error,
    fetchExpedientDetails,
  } = useDashboardData();

  const [selectedExpedientId, setSelectedExpedientId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewDetails = (id: string) => {
    setSelectedExpedientId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedExpedientId(null);
  };

  const semCounts = kpis?.semaphoreCounts ?? { VERDE: 0, AMARILLO: 0, ROJO: 0 };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between border-b border-slate-800 pb-4 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-400 text-xs font-bold mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Core Relacional Azure PostgreSQL 16 · Cero Excel</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Dashboard Financiero y Semáforo de Cartera
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1">
              Monitoreo en tiempo real por Hub Nacional (Chihuahua, León y Cancún) y Semáforo de Morosidad.
            </p>
          </div>

          {/* Semáforo Ejecutivo de Morosidad (Verde, Amarillo, Rojo) */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-slate-300 font-medium">Al Corriente:</span>
              <strong className="text-emerald-400 font-bold">{semCounts.VERDE}</strong>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-slate-300 font-medium">Preventivo / Licencia:</span>
              <strong className="text-amber-400 font-bold">{semCounts.AMARILLO}</strong>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-300 font-medium">Morosidad / Congelado:</span>
              <strong className="text-rose-400 font-bold">{semCounts.ROJO}</strong>
            </div>
          </div>
        </header>

        {/* Selector de los 3 Hubs Nacionales (Punto C.7) */}
        <section aria-label="Filtro por Hub Nacional" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {HUB_OPTIONS.map((hub) => {
            const isSelected = selectedHub === hub.id;
            const hubMetrics =
              hub.id !== 'ALL' && kpis?.hubBreakdown
                ? kpis.hubBreakdown[hub.id as HubRegion]
                : null;

            return (
              <button
                key={hub.id}
                onClick={() => setSelectedHub(hub.id)}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-gradient-to-br from-[#0D1B3E] to-slate-900 border-[#00D1FF] shadow-lg shadow-[#00D1FF]/15 ring-1 ring-[#00D1FF]/40'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                    <MapPin className={`w-4 h-4 ${isSelected ? 'text-[#00D1FF]' : 'text-teal-400'}`} />
                    {hub.label}
                  </span>
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00D1FF]/20 text-[#00D1FF]">
                      Activo
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{hub.subtitle}</p>
                {hubMetrics && (
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">{hubMetrics.loansCount} expedientes</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {formatCurrency(hubMetrics.capitalColocado)}
                    </span>
                  </div>
                )}
                {hub.id === 'ALL' && kpis && (
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Activity className="w-3 h-3 text-[#00D1FF]" /> Vista Consolidada
                    </span>
                    <span className="font-mono font-bold text-[#00D1FF]">
                      {formatCurrency(kpis.capitalColocado)}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </section>

        {error && (
          <div className="bg-red-900/20 border border-red-800 text-red-400 p-4 rounded-xl shadow-lg">
            <h3 className="font-bold">Error de conexión</h3>
            <p className="mt-1 text-xs">{error}</p>
          </div>
        )}

        <section aria-label="Indicadores Clave">
          <MetricsCards kpis={kpis} loading={kpisLoading} />
        </section>

        <section aria-label="Conciliación Maestra">
          <ReconciliationMasterTable
            loans={latestLoans}
            loading={loansLoading}
            onViewDetails={handleViewDetails}
          />
        </section>
      </div>

      <ExpedientDetailModal
        isOpen={isModalOpen}
        expedientId={selectedExpedientId}
        onClose={handleCloseModal}
        fetchDetails={fetchExpedientDetails}
      />
    </div>
  );
};
