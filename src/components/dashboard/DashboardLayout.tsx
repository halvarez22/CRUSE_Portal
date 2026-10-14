import React, { useState } from 'react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { MetricsCards } from './MetricsCards';
import { ReconciliationMasterTable } from './ReconciliationMasterTable';
import { ExpedientDetailModal } from './ExpedientDetailModal';

export const DashboardLayout: React.FC = () => {
  const {
    kpis,
    latestLoans,
    kpisLoading,
    loansLoading,
    error,
    fetchExpedientDetails
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex justify-between items-end border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Dashboard Financiero</h1>
            <p className="text-slate-400">Visión general y conciliación maestra de cartera.</p>
          </div>
        </header>

        {error && (
          <div className="bg-red-900/20 border border-red-800 text-red-400 p-4 rounded-xl shadow-lg">
            <h3 className="font-bold flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Error de conexión
            </h3>
            <p className="mt-1 ml-7">{error}</p>
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
