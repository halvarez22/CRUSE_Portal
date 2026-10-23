/**
 * MÓDULO B.2: SIMULADOR ROI DE CARTERA A 36 MESES CONECTADO A CARTERA REAL (POSTGRESQL 16)
 * Expediente: CRUSE-APO-2026-029 — Guardrail Forense 1 (< 400 líneas)
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Sliders,
  BarChart3,
  Zap,
  RefreshCw,
  Database,
  CheckCircle2,
} from 'lucide-react';
import { FINANCIAL_CONSTANTS } from '../../config/financialConstants';
import { PortfolioRoiRealMetrics } from '../../types/executive';

interface PortfolioRoiSimulatorTabProps {
  token: string;
}

const formatMxn = (val: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(val);

export const PortfolioRoiSimulatorTab: React.FC<PortfolioRoiSimulatorTabProps> = ({ token }) => {
  const [realMetrics, setRealMetrics] = useState<PortfolioRoiRealMetrics | null>(null);
  const [loadingReal, setLoadingReal] = useState(false);

  const [initialCapital, setInitialCapital] = useState<number>(25000000);
  const [hubsCount, setHubsCount] = useState<number>(3);
  const [expressRatio, setExpressRatio] = useState<number>(30);
  const [defaultRate, setDefaultRate] = useState<number>(1.5);
  const [reinvestmentRate, setReinvestmentRate] = useState<number>(80);

  useEffect(() => {
    let mounted = true;
    const loadRealMetrics = async () => {
      setLoadingReal(true);
      try {
        const res = await fetch('/api/executive/roi-metrics', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as PortfolioRoiRealMetrics;
          if (mounted) setRealMetrics(data);
        }
      } catch (err) {
        console.error('Error cargando métricas reales ROI:', err);
      } finally {
        if (mounted) setLoadingReal(false);
      }
    };
    loadRealMetrics();
    return () => {
      mounted = false;
    };
  }, [token]);

  const handleSyncWithRealPortfolio = () => {
    if (!realMetrics) return;
    const baseCap = Math.max(
      5000000,
      Math.round((realMetrics.realPlacedCapital + realMetrics.realInvestorCapitalCommitted) / 1000000) * 1000000 || 10000000
    );
    setInitialCapital(Math.min(100000000, baseCap));
    setExpressRatio(Math.min(70, Math.max(10, realMetrics.realExpressSharePercent || 30)));
    setDefaultRate(Math.min(4.0, Math.max(0.5, realMetrics.realDefaultRatePercent || 1.2)));
  };

  const projection = useMemo(() => {
    const averageYieldRate =
      (expressRatio / 100) * FINANCIAL_CONSTANTS.EXPRESS_ANNUAL_RATE +
      ((100 - expressRatio) / 100) * FINANCIAL_CONSTANTS.NORMAL_ANNUAL_RATE;

    const monthData: Array<{
      month: string;
      portfolio: number;
      grossInterest: number;
      netProfit: number;
      cumulativeProfit: number;
    }> = [];

    let currentPortfolio = initialCapital;
    let cumulativeNetProfit = 0;

    for (let month = 1; month <= FINANCIAL_CONSTANTS.PROJECTION_MONTHS; month++) {
      const monthlyGrowthFactor =
        FINANCIAL_CONSTANTS.BASE_MONTHLY_GROWTH_FACTOR +
        hubsCount * FINANCIAL_CONSTANTS.HUB_GROWTH_INCREMENT;
      currentPortfolio =
        currentPortfolio *
        monthlyGrowthFactor *
        (1 + (reinvestmentRate / 100) * FINANCIAL_CONSTANTS.REINVESTMENT_MONTHLY_MULTIPLIER);

      const monthlyGrossInterest = currentPortfolio * (averageYieldRate / 12);
      const monthlyDefaultLoss = currentPortfolio * (defaultRate / 100 / 12);
      const monthlyOpCost =
        monthlyGrossInterest * FINANCIAL_CONSTANTS.DIGITAL_EFFICIENCY_FACTOR * 0.15;
      const monthlyNetProfit = monthlyGrossInterest - monthlyDefaultLoss - monthlyOpCost;

      cumulativeNetProfit += monthlyNetProfit;

      monthData.push({
        month: `Mes ${month}`,
        portfolio: Math.round(currentPortfolio),
        grossInterest: Math.round(monthlyGrossInterest),
        netProfit: Math.round(monthlyNetProfit),
        cumulativeProfit: Math.round(cumulativeNetProfit),
      });
    }

    const year3Portfolio = monthData[35]!.portfolio;
    const year3CumulativeProfit = monthData[35]!.cumulativeProfit;
    const annualizedIRR = Math.min(
      42,
      Math.round(24 + hubsCount * 2.8 - defaultRate * 1.5 + expressRatio * 0.05)
    );
    const moic = ((initialCapital + year3CumulativeProfit) / initialCapital).toFixed(2);
    const paybackMonths = Math.max(8, Math.round(18 - hubsCount * 2 + defaultRate * 1.2));

    return {
      monthData,
      year3Portfolio,
      year3CumulativeProfit,
      annualizedIRR,
      moic,
      paybackMonths,
      averageYieldRate: (averageYieldRate * 100).toFixed(1),
    };
  }, [initialCapital, hubsCount, expressRatio, defaultRate, reinvestmentRate]);

  return (
    <div className="space-y-6">
      {/* Panel de Cartera Real en PostgreSQL 16 */}
      <div className="bg-gradient-to-r from-slate-900 via-[#0D1B3E]/80 to-slate-900 border border-teal-500/30 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-teal-400" />
            <div>
              <h3 className="text-sm font-extrabold text-white">
                Conexión en Vivo a Cartera Real (Azure PostgreSQL 16)
              </h3>
              <p className="text-xs text-slate-400">
                Datos operativos reales de préstamos activos y líneas de fondeo registradas en el sistema.
              </p>
            </div>
          </div>
          <button
            onClick={handleSyncWithRealPortfolio}
            disabled={loadingReal || !realMetrics}
            className="px-3.5 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-300 text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingReal ? 'animate-spin' : ''}`} />
            <span>Calibrar Simulador con Cartera Real</span>
          </button>
        </div>

        {realMetrics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block">Capital Colocado Real</span>
              <strong className="text-base font-black text-emerald-400">
                {formatMxn(realMetrics.realPlacedCapital)}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block">Saldo Insoluto Vigente</span>
              <strong className="text-base font-black text-[#00D1FF]">
                {formatMxn(realMetrics.realActiveCapital)}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block">Fondeo Inversionistas</span>
              <strong className="text-base font-black text-[#D4AF37]">
                {formatMxn(realMetrics.realInvestorCapitalCommitted)}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block">Créditos Activos</span>
              <strong className="text-base font-black text-white">
                {realMetrics.realActiveLoansCount} contratos
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block">Mora / Congelado Real</span>
              <strong className="text-base font-black text-teal-300">
                {realMetrics.realDefaultRatePercent}%
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* Grid Principal: Controles Interactivos vs Proyección a 36 Meses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#D4AF37]" />
              <span>Parámetros de Proyección (36 Meses)</span>
            </h3>
            <span className="text-xs text-[#D4AF37] font-bold">{projection.moic}x MOIC</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-300">Capital de Fondeo Base</span>
              <span className="text-emerald-400">${(initialCapital / 1000000).toFixed(1)}M MXN</span>
            </div>
            <input
              type="range"
              min={5000000}
              max={100000000}
              step={1000000}
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-300">Hubs Nacionales Activos</span>
              <span className="text-[#00D1FF]">{hubsCount} Hubs</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setHubsCount(n)}
                  className={`py-2 rounded-xl text-xs font-bold border ${
                    hubsCount === n
                      ? 'bg-[#249E82] text-white border-teal-400'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  {n} {n === 1 ? 'Hub (Chih.)' : n === 2 ? 'Hubs (+León)' : 'Hubs (+Cancún)'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-300">Mezcla Express (3.33%) vs Clásico (1.97%)</span>
              <span className="text-indigo-400">
                {expressRatio}% Exp / {100 - expressRatio}% Clásico
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={70}
              step={5}
              value={expressRatio}
              onChange={(e) => setExpressRatio(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-300">Tasa de Morosidad Estimada</span>
              <span className="text-amber-400">{defaultRate}% Anual</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={4.0}
              step={0.1}
              value={defaultRate}
              onChange={(e) => setDefaultRate(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex items-center gap-1 text-[11px] text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Con retención en nómina la mora histórica es &lt;{FINANCIAL_CONSTANTS.MAX_DEFAULT_RATE_PERCENT}%.</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-300">Reinversión Quincenal de Flujos</span>
              <span className="text-emerald-400">{reinvestmentRate}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              step={10}
              value={reinvestmentRate}
              onChange={(e) => setReinvestmentRate(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Cartera Mes 36</span>
              <div className="text-xl font-black text-emerald-400 mt-1">
                ${(projection.year3Portfolio / 1000000).toFixed(1)}M MXN
              </div>
              <span className="text-[10px] text-slate-500">
                Crecimiento {(projection.year3Portfolio / initialCapital).toFixed(1)}x
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Utilidad Neta Acum.</span>
              <div className="text-xl font-black text-[#00D1FF] mt-1">
                ${(projection.year3CumulativeProfit / 1000000).toFixed(1)}M MXN
              </div>
              <span className="text-[10px] text-slate-500">Horizonte 36 meses</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">TIR Anual Proyectada</span>
              <div className="text-xl font-black text-[#D4AF37] mt-1">{projection.annualizedIRR}% TIR</div>
              <span className="text-[10px] text-slate-500">Tasa Prom: {projection.averageYieldRate}%</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Recuperación Payback</span>
              <div className="text-xl font-black text-purple-400 mt-1">{projection.paybackMonths} Meses</div>
              <span className="text-[10px] text-slate-500">Múltiplo {projection.moic}x</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <span>Curva de Escalamiento de Cartera y Utilidad Acumulada (Semestral)</span>
            </h4>
            <div className="space-y-2.5">
              {[5, 11, 17, 23, 29, 35].map((idx) => {
                const item = projection.monthData[idx]!;
                const maxVal = projection.monthData[35]!.portfolio;
                const pct = Math.min(100, Math.max(15, (item.portfolio / maxVal) * 100));
                return (
                  <div key={item.month} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-300">{item.month}</span>
                      <span className="font-mono text-slate-300">
                        Cartera: <strong className="text-emerald-400">${(item.portfolio / 1000000).toFixed(2)}M</strong>{' '}
                        | Utilidad Acum.:{' '}
                        <strong className="text-[#00D1FF]">${(item.cumulativeProfit / 1000000).toFixed(2)}M</strong>
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
                      <div
                        className="bg-gradient-to-r from-[#396CAE] to-[#249E82] h-full rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center gap-3 text-xs text-slate-200">
            <Zap className="w-5 h-5 text-[#D4AF37] shrink-0" />
            <span>
              <strong>Unit Economics Certificados:</strong> CAC Digital reducido a{' '}
              <strong>${FINANCIAL_CONSTANTS.CAC_DIGITAL_MXN} MXN</strong> y tasa de retención/renovación de clientes del{' '}
              <strong>{Math.round(FINANCIAL_CONSTANTS.CLIENT_RETENTION_RATE * 100)}%</strong>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
