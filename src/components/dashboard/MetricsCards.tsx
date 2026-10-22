import React from 'react';
import { Landmark, Wallet, FileCheck2, AlertTriangle } from 'lucide-react';
import { DashboardKPIs } from '../../types/dashboard';

interface MetricsCardsProps {
  kpis: DashboardKPIs | null;
  loading: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(value);
};

export const MetricsCards: React.FC<MetricsCardsProps> = ({ kpis, loading }) => {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-2xl border border-white/10 animate-pulse shadow-lg"
          >
            <div className="flex justify-between items-center mb-4">
              <div className="h-4 bg-slate-800 rounded w-1/2"></div>
              <div className="h-10 w-10 bg-slate-800 rounded-xl"></div>
            </div>
            <div className="h-8 bg-slate-800 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-slate-800/70 rounded w-2/3"></div>
          </div>
        ))}
      </div>
    );
  }

  const metrics = [
    {
      label: 'Capital Colocado',
      subtitle: 'Dispersión histórica acumulada',
      value: formatCurrency(kpis.capitalColocado),
      icon: Landmark,
      cardBg: 'bg-gradient-to-br from-cyan-500/18 via-slate-900/85 to-slate-950/95',
      borderClass: 'border-cyan-400/35 hover:border-cyan-400/60',
      glowClass: 'shadow-[0_0_28px_-6px_rgba(6,182,212,0.35)]',
      topBarClass: 'from-cyan-400 to-blue-500',
      iconBadgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30',
      badgeText: 'Originación Total',
    },
    {
      label: 'Capital Vigente',
      subtitle: 'Saldo insoluto activo en cartera',
      value: formatCurrency(kpis.capitalVigente),
      icon: Wallet,
      cardBg: 'bg-gradient-to-br from-emerald-500/18 via-slate-900/85 to-slate-950/95',
      borderClass: 'border-emerald-400/35 hover:border-emerald-400/60',
      glowClass: 'shadow-[0_0_28px_-6px_rgba(16,185,129,0.35)]',
      topBarClass: 'from-emerald-400 to-teal-500',
      iconBadgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
      badgeText: 'Cartera Productiva',
    },
    {
      label: 'Créditos Activos',
      subtitle: 'Contratos vigentes en descuento',
      value: kpis.creditosActivos.toLocaleString('es-MX'),
      icon: FileCheck2,
      cardBg: 'bg-gradient-to-br from-amber-500/16 via-slate-900/85 to-slate-950/95',
      borderClass: 'border-amber-400/35 hover:border-amber-400/60',
      glowClass: 'shadow-[0_0_28px_-6px_rgba(212,175,55,0.30)]',
      topBarClass: 'from-amber-400 to-yellow-500',
      iconBadgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
      badgeText: 'Cuentas 3FN v4',
    },
    {
      label: 'Cartera Vencida',
      subtitle: 'Exposición en mora > 90 días',
      value: formatCurrency(kpis.carteraVencida),
      icon: AlertTriangle,
      cardBg: 'bg-gradient-to-br from-rose-500/18 via-slate-900/85 to-slate-950/95',
      borderClass: 'border-rose-400/35 hover:border-rose-400/60',
      glowClass: 'shadow-[0_0_28px_-6px_rgba(244,63,94,0.32)]',
      topBarClass: 'from-rose-400 to-red-500',
      iconBadgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
      badgeText: kpis.carteraVencida === 0 ? 'Riesgo Controlado' : 'Requiere Atención',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {metrics.map((metric) => {
        const IconComponent = metric.icon;
        return (
          <div
            key={metric.label}
            className={`relative overflow-hidden backdrop-blur-xl p-6 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 ${metric.cardBg} ${metric.borderClass} ${metric.glowClass}`}
          >
            {/* Barra de acento luminosa superior */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${metric.topBarClass}`} />

            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  {metric.label}
                </h3>
                <span className="text-[11px] font-medium text-slate-300 block mt-0.5">
                  {metric.subtitle}
                </span>
              </div>
              <div
                className={`p-2.5 rounded-xl border shrink-0 ${metric.iconBadgeClass}`}
                aria-hidden="true"
              >
                <IconComponent className="w-5 h-5" />
              </div>
            </div>

            <p className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight my-2">
              {metric.value}
            </p>

            <div className="pt-2.5 mt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-200">{metric.badgeText}</span>
              <span className="text-slate-300 font-mono">Tiempo Real</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
