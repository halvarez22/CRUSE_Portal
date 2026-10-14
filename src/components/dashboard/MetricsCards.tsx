import React from 'react';
import { DashboardKPIs } from '../../types/dashboard';

interface MetricsCardsProps {
  kpis: DashboardKPIs | null;
  loading: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(value);
};

export const MetricsCards: React.FC<MetricsCardsProps> = ({ kpis, loading }) => {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-slate-950 p-6 rounded-xl border border-slate-800 animate-pulse">
            <div className="h-4 bg-slate-800 rounded w-1/2 mb-4"></div>
            <div className="h-8 bg-slate-800 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  const metrics = [
    { label: 'Capital Colocado', value: formatCurrency(kpis.capitalColocado), color: 'text-cyan-400' },
    { label: 'Capital Vigente', value: formatCurrency(kpis.capitalVigente), color: 'text-teal-400' },
    { label: 'Créditos Activos', value: kpis.creditosActivos, color: 'text-white' },
    { label: 'Cartera Vencida', value: formatCurrency(kpis.carteraVencida), color: 'text-red-400' }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {metrics.map((metric, index) => (
        <div key={index} className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow-lg">
          <h3 className="text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">
            {metric.label}
          </h3>
          <p className={`text-3xl font-bold ${metric.color}`}>
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  );
};
