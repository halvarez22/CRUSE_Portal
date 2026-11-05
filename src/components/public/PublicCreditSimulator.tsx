import React, { useState, useMemo } from 'react';
import Decimal from 'decimal.js';
import {
  Calculator,
  ShieldAlert,
  Sparkles,
  FileText,
  ChevronRight,
  CheckCircle,
  FileSpreadsheet,
  Printer,
  Scale,
} from 'lucide-react';
import { BorrowerProfile, PaymentFrequency, ProductId } from '../../types';
import { LOAN_PRODUCTS } from '../../data/cruseData';
import { FINANCIAL_CONSTANTS, calculateSimulation } from '../../config/financialConstants';
import { getAllowedExpressTerm } from '../../config/officialQuotaTables';
import { PreApplicationModal } from './PreApplicationModal';
import {
  exportAmortizationToExcel,
  exportAmortizationToPdf,
  formatCurrencyCell,
  AmortizationExportParams,
} from '../../utils/amortizationExport';

export const PublicCreditSimulator: React.FC = () => {
  const [productType, setProductType] = useState<ProductId>('normal');
  const [frequency, setFrequency] = useState<PaymentFrequency>('quincenal');
  const [borrowerProfile, setBorrowerProfile] = useState<BorrowerProfile>('activo');

  const activeProduct = useMemo(
    () => LOAN_PRODUCTS.find((p) => p.id === productType) || LOAN_PRODUCTS[0]!,
    [productType]
  );

  const [amount, setAmount] = useState<number>(25000);
  const [selectedTerm, setSelectedTerm] = useState<number>(24);
  const [showAmortizationModal, setShowAmortizationModal] = useState<boolean>(false);
  const [showPreAppModal, setShowPreAppModal] = useState<boolean>(false);

  const maxAllowedAmount = useMemo(() => {
    if (productType === 'express') return 20000;
    if (frequency === 'quincenal' && borrowerProfile === 'pensionado') return 150000;
    return activeProduct.maxAmount;
  }, [productType, frequency, borrowerProfile, activeProduct.maxAmount]);

  const availableTerms = useMemo(() => {
    if (frequency === 'mensual') {
      return activeProduct.monthlyTerms ?? (productType === 'normal' ? [12, 24, 36] : [3, 7, 10]);
    }
    return activeProduct.terms;
  }, [frequency, activeProduct, productType]);

  const handleSelectProduct = (type: ProductId) => {
    setProductType(type);
    if (type === 'normal') {
      setAmount(25000);
      setSelectedTerm(frequency === 'mensual' ? 12 : 24);
    } else {
      setAmount(5000);
      setSelectedTerm(frequency === 'mensual' ? 3 : 6);
    }
  };

  const handleSelectFrequency = (nextFreq: PaymentFrequency) => {
    setFrequency(nextFreq);
    if (nextFreq === 'mensual' && borrowerProfile === 'pensionado') {
      setBorrowerProfile('activo');
    }
    if (productType === 'normal') {
      setSelectedTerm(nextFreq === 'mensual' ? 12 : 24);
    } else {
      setSelectedTerm(getAllowedExpressTerm(amount, nextFreq));
    }
  };

  const handleSelectProfile = (nextProfile: BorrowerProfile) => {
    setBorrowerProfile(nextProfile);
    if (nextProfile === 'pensionado' && amount > 150000) {
      setAmount(150000);
    }
  };

  const handleAmountChange = (rawVal: string) => {
    const nextAmount = new Decimal(rawVal || '0').toNumber();
    setAmount(nextAmount);
    if (productType === 'express') {
      setSelectedTerm(getAllowedExpressTerm(nextAmount, frequency));
    }
  };

  const handleTermClick = (term: number) => {
    setSelectedTerm(term);
    if (productType === 'express') {
      const isShort = term === 6 || term === 3;
      const isMid = term === 14 || term === 7;
      if (isShort && amount > 5000) setAmount(5000);
      if (isMid && (amount < 6000 || amount > 10000)) setAmount(10000);
      if (!isShort && !isMid && amount < 11000) setAmount(15000);
    }
  };

  const simulation = useMemo(() => {
    return calculateSimulation(amount, selectedTerm, productType, {
      frequency,
      borrowerProfile,
    });
  }, [amount, selectedTerm, productType, frequency, borrowerProfile]);

  const periodicRateLabel = useMemo(() => {
    if (productType === 'normal') {
      return frequency === 'mensual'
        ? '3.9583% mensual fija sin IVA (47.50% anual nominal)'
        : '1.9792% quincenal fija sin IVA (47.50% anual nominal)';
    }
    return frequency === 'mensual'
      ? '6.6667% mensual fija sin IVA (80.00% anual nominal)'
      : '3.3333% quincenal fija sin IVA (80.00% anual nominal)';
  }, [productType, frequency]);

  const periodUnitPlural = frequency === 'mensual' ? 'meses' : 'quincenas';
  const periodUnitLabel = frequency === 'mensual' ? 'Mensual' : 'Quincenal';

  const exportParams: AmortizationExportParams = useMemo(
    () => ({
      productName: activeProduct.name,
      amount,
      selectedTerm,
      frequency,
      interestRateText: periodicRateLabel,
      fortnightlyPayment: simulation.fortnightlyPayment,
      periodicPayment: simulation.periodicPayment,
      monthlyPaymentEquivalent: simulation.monthlyPaymentEquivalent,
      totalInterest: simulation.totalInterest,
      totalVat: simulation.totalVat,
      totalInsurance: simulation.totalInsurance,
      totalToPay: simulation.totalToPay,
      catPercent: simulation.catPercent,
      schedule: simulation.schedule,
    }),
    [activeProduct, amount, selectedTerm, frequency, periodicRateLabel, simulation]
  );

  const getExpressBracketHint = (term: number): string => {
    if (term === 6 || term === 3) return '($1,000 a $5,000)';
    if (term === 14 || term === 7) return '($6,000 a $10,000)';
    return '($11,000 a $20,000)';
  };

  return (
    <section id="simulador" className="py-12 lg:py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-[#396CAE]/15 text-[#1E3A8A] dark:text-[#00D1FF] border border-[#396CAE]/30 mb-3">
            <Calculator className="w-3.5 h-3.5" />
            <span>Simulador Financiero Oficial — Tablas de Cuotas Certificadas</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-3">
            Calcula tu Crédito con Descuento Vía Nómina
          </h2>
          <p className="text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
            Transparencia total en tasas nominales anuales, IVA sobre intereses y protección salarial del 30% conforme al Art. 110 de la Ley Federal del Trabajo.
          </p>
        </div>

        {/* Simulator Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Controls Column (7 cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900/60 glass-panel rounded-3xl p-6 sm:p-8 h-full flex flex-col justify-between border border-slate-200 dark:border-white/10">
            {/* Product Switcher Tabs */}
            <div className="flex bg-slate-200/80 dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-300/80 dark:border-white/10 mb-5">
              <button
                type="button"
                onClick={() => handleSelectProduct('normal')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  productType === 'normal'
                    ? 'bg-[#249E82] text-white shadow-md glow-teal'
                    : 'text-slate-800 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <span>Crédito Normal (47.50% anual nominal)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectProduct('express')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  productType === 'express'
                    ? 'bg-[#396CAE] text-white shadow-md glow-blue'
                    : 'text-slate-800 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <span>Crédito Express (80.00% anual nominal)</span>
              </button>
            </div>

            {/* Frequency & Profile Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-slate-700 dark:text-slate-400 block mb-1.5">
                  Modalidad de Descuento:
                </span>
                <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-300/70 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => handleSelectFrequency('quincenal')}
                    className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all ${
                      frequency === 'quincenal'
                        ? 'bg-[#0D1B3E] text-white dark:bg-[#249E82]'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Quincenal (Nómina)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectFrequency('mensual')}
                    className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all ${
                      frequency === 'mensual'
                        ? 'bg-[#0D1B3E] text-white dark:bg-[#249E82]'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Mensual (Compensación)
                  </button>
                </div>
              </div>

              {productType === 'normal' && frequency === 'quincenal' ? (
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-bold text-slate-700 dark:text-slate-400 block mb-1.5">
                    Esquema de Afiliación:
                  </span>
                  <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-300/70 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => handleSelectProfile('activo')}
                      className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all ${
                        borrowerProfile === 'activo'
                          ? 'bg-[#0D1B3E] text-white dark:bg-[#249E82]'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Activos (Con Seguro)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectProfile('pensionado')}
                      className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all ${
                        borrowerProfile === 'pensionado'
                          ? 'bg-[#0D1B3E] text-white dark:bg-[#249E82]'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Pensionados (Sin Seguro)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-end">
                  <div className="w-full py-2 px-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-[11px] text-slate-700 dark:text-slate-300">
                    <strong>Convenio Aplicable:</strong> Trabajadores Sindicalizados (STSGECH) y Personal de Confianza del Supremo Tribunal.
                  </div>
                </div>
              )}
            </div>

            {/* Amount Slider */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <label
                  htmlFor="amount-slider"
                  className="text-xs uppercase tracking-wider font-bold text-slate-700 dark:text-slate-400"
                >
                  Monto Solicitado:
                </label>
                <span className="text-2xl sm:text-3xl font-black text-[#0F766E] dark:text-[#4CD360] font-mono">
                  ${amount.toLocaleString('es-MX')} MXN
                </span>
              </div>
              <input
                id="amount-slider"
                type="range"
                min={activeProduct.minAmount}
                max={maxAllowedAmount}
                step={productType === 'normal' ? 5000 : 1000}
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#249E82]"
                aria-label="Monto solicitado de crédito"
              />
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mt-2 font-mono font-semibold">
                <span>Min: ${activeProduct.minAmount.toLocaleString('es-MX')}</span>
                <span>Max: ${maxAllowedAmount.toLocaleString('es-MX')}</span>
              </div>
            </div>

            {/* Term Selector */}
            <div className="mb-6">
              <label className="text-xs uppercase tracking-wider font-bold text-slate-700 dark:text-slate-400 block mb-3">
                Plazo de Pago ({periodUnitPlural}):
              </label>
              <div className="grid grid-cols-3 gap-3">
                {availableTerms.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => handleTermClick(term)}
                    className={`py-3 px-3 rounded-xl text-center font-bold text-sm transition-all glass-input ${
                      selectedTerm === term
                        ? 'border-[#249E82] bg-[#249E82]/20 text-slate-950 dark:text-white shadow-sm ring-1 ring-[#249E82]'
                        : 'text-slate-800 dark:text-slate-300 hover:border-[#249E82]/50'
                    }`}
                  >
                    <span className="block text-base">
                      {term} {periodUnitPlural}
                    </span>
                    <span className="text-[11px] font-normal text-slate-600 dark:text-slate-400 block">
                      {productType === 'express'
                        ? getExpressBracketHint(term)
                        : frequency === 'mensual'
                          ? `${new Decimal(term).div(12).toNumber()} año(s)`
                          : `${new Decimal(term).div(24).toNumber()} año(s)`}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Insurance & LFT 30% Badges */}
            {productType === 'normal' && borrowerProfile === 'activo' ? (
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-[#249E82] flex items-start gap-3 mb-4">
                <ShieldAlert className="w-5 h-5 text-[#0F766E] dark:text-[#249E82] shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <strong className="text-slate-900 dark:text-white block font-bold mb-0.5">
                    Seguro de Vida Institucional con Cobertura de ${FINANCIAL_CONSTANTS.LIFE_INSURANCE_COVERAGE_MXN.toLocaleString('es-MX')} MXN Incluido
                  </strong>
                  Tu cuota ya integra la prima fija de $
                  {frequency === 'mensual'
                    ? FINANCIAL_CONSTANTS.LIFE_INSURANCE_MONTHLY_MXN.toFixed(2)
                    : FINANCIAL_CONSTANTS.LIFE_INSURANCE_FORTNIGHTLY_MXN.toFixed(2)}{' '}
                  MXN {frequency}. En caso de siniestro, liquida el saldo insoluto del préstamo y el remanente se entrega a tus beneficiarios.
                </div>
              </div>
            ) : (
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-[#396CAE] flex items-start gap-3 mb-4">
                <Sparkles className="w-5 h-5 text-[#396CAE] shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <strong className="text-slate-900 dark:text-white block font-bold mb-0.5">
                    {productType === 'express'
                      ? 'Crédito Express de Liquidez Ágil (Plazo según Rango de Monto)'
                      : 'Esquema Especial Jubilados y Pensionados (Exento de Prima de Seguro)'}
                  </strong>
                  {productType === 'express'
                    ? 'Plazos escalonados oficiales: $1,000 a $5,000 en 6 quincenas (3 meses); $6,000 a $10,000 en 14 quincenas (7 meses); $11,000 a $20,000 en 20 quincenas (10 meses).'
                    : 'Para la Agrupación de Jubilados y Pensionados al Servicio de Gobierno del Estado de Chihuahua, la cuota quincenal está exenta del cobro de póliza de seguro de vida.'}
                </div>
              </div>
            )}

            {/* Regulatory Notice for CAT */}
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
              * Importes sujetos a redondeo y calendario de amortización definitivo. CAT estimado por flujos de efectivo conforme a la Circular 21/2009 de Banxico:{' '}
              <strong className="text-amber-700 dark:text-[#D4AF37] font-bold">
                {simulation.catPercent.toFixed(2)}% sin IVA
              </strong>{' '}
              (sujeto a fecha efectiva de disposición y calendario definitivo). Límite máximo de retención salarial: <strong>30% del ingreso neto</strong> conforme al Art. 110 de la Ley Federal del Trabajo.
            </p>
          </div>

          {/* Results Summary Card (5 cols) */}
          <div className="lg:col-span-5 glass-slab-emerald rounded-3xl p-6 sm:p-8 h-full flex flex-col justify-between shadow-xl border border-slate-200 dark:border-white/10">
            <div>
              <span className="text-xs uppercase tracking-wider font-bold text-slate-800 dark:text-slate-300 block mb-2">
                Resumen de tu Cotización Oficial
              </span>

              {/* Payment Display */}
              <div className="bg-white dark:bg-black/40 backdrop-blur-md rounded-2xl p-5 border border-slate-200 dark:border-white/20 mb-5 text-center shadow-inner">
                <span className="text-xs text-slate-700 dark:text-slate-400 font-semibold block mb-1">
                  Tu Pago {periodUnitLabel} Estimado
                </span>
                <span className="text-3xl sm:text-4xl font-black text-slate-950 dark:text-white font-mono block">
                  ${simulation.periodicPayment.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <Scale className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#4CD360]" />
                  <span>Ingreso neto {frequency} requerido (Art. 110 LFT 30%):</span>
                  <strong className="font-mono font-bold text-slate-950 dark:text-white">
                    ${simulation.requiredNetIncome.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
                <span className="text-xs text-[#0F766E] dark:text-[#4CD360] font-bold mt-2 inline-flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Descuento directo por nómina institucional
                </span>
              </div>

              {/* Financial Metrics Breakdown */}
              <div className="space-y-2.5 text-xs mb-6">
                <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-white/10">
                  <span className="text-slate-700 dark:text-slate-400">Tasa anual nominal:</span>
                  <strong className="text-slate-950 dark:text-white font-mono font-bold">
                    {activeProduct.annualRatePercentText} fija sin IVA
                  </strong>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-white/10">
                  <span className="text-slate-700 dark:text-slate-400">Tasa {frequency}:</span>
                  <strong className="text-slate-950 dark:text-white font-mono font-bold">
                    {periodicRateLabel}
                  </strong>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-white/10">
                  <span className="text-slate-700 dark:text-slate-400">Total de intereses calculados:</span>
                  <strong className="text-slate-900 dark:text-slate-200 font-mono font-bold">
                    ${simulation.totalInterest.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-white/10">
                  <span className="text-slate-700 dark:text-slate-400">IVA aplicable (16% sobre intereses):</span>
                  <strong className="text-slate-900 dark:text-slate-200 font-mono font-bold">
                    ${simulation.totalVat.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-white/10">
                  <span className="text-slate-700 dark:text-slate-400">Comisión por apertura:</span>
                  <strong className="text-[#0F766E] dark:text-[#4CD360] font-bold">
                    $0.00 MXN (0%)
                  </strong>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-white/10">
                  <span className="text-slate-700 dark:text-slate-400">Total estimado a pagar ({selectedTerm} {periodUnitPlural}):</span>
                  <strong className="text-slate-950 dark:text-white font-mono font-bold text-sm">
                    ${simulation.totalToPay.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowAmortizationModal(true)}
                className="w-full py-2.5 rounded-xl glass-card text-xs font-bold text-slate-950 dark:text-white hover:border-[#249E82] transition-all flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-[#396CAE]" />
                <span>
                  Ver Tabla de Amortización Completa ({selectedTerm} {periodUnitPlural})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowPreAppModal(true)}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#249E82] to-[#1E9F81] text-white font-black text-sm shadow-lg hover:opacity-95 transition-all text-center flex items-center justify-center gap-2 glow-teal"
              >
                <span>Solicitar Crédito Ahora</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Institutional Pre-Application Confirmation Modal */}
        <PreApplicationModal
          isOpen={showPreAppModal}
          onClose={() => setShowPreAppModal(false)}
          data={{
            productId: productType,
            productName: activeProduct.name,
            amount,
            selectedTerm,
            frequency,
            borrowerProfile,
            periodicPayment: simulation.periodicPayment,
            fortnightlyPayment: simulation.fortnightlyPayment,
            monthlyPaymentEquivalent: simulation.monthlyPaymentEquivalent,
            annualRatePercentText: activeProduct.annualRatePercentText,
            interestRateText: periodicRateLabel,
            totalToPay: simulation.totalToPay,
            catPercent: simulation.catPercent,
            requiredNetIncome: simulation.requiredNetIncome,
          }}
        />

        {/* Amortization Schedule Modal */}
        {showAmortizationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <div className="bg-white dark:bg-slate-900/90 glass-panel w-full max-w-4xl max-h-[85vh] rounded-3xl p-6 flex flex-col justify-between overflow-hidden shadow-2xl border border-slate-200 dark:border-white/20">
              <div className="flex flex-wrap justify-between items-center gap-3 pb-4 border-b border-slate-200 dark:border-white/10 mb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Tabla de Amortización {periodUnitLabel} Oficial
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {activeProduct.name} — ${amount.toLocaleString('es-MX')} MXN a {selectedTerm} {periodUnitPlural} ({periodicRateLabel})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportAmortizationToExcel(exportParams)}
                    className="px-3 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-[#0F766E] dark:text-emerald-300 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    title="Descargar corrida financiera en Excel (.xlsx)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Exportar Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportAmortizationToPdf(exportParams)}
                    className="px-3 py-2 rounded-xl bg-[#396CAE]/15 hover:bg-[#396CAE]/25 border border-[#396CAE]/40 text-slate-900 dark:text-[#00D1FF] text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    title="Imprimir o Guardar como PDF Oficial"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Exportar PDF</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Schedule Table */}
              <div className="flex-1 overflow-y-auto pr-2">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900 border-b border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="py-2.5 px-2">{frequency === 'mensual' ? 'Mes' : 'Qna'}</th>
                      <th className="py-2.5 px-2 text-right">Saldo Insoluto</th>
                      <th className="py-2.5 px-2 text-right">Capital</th>
                      <th className="py-2.5 px-2 text-right">Interés</th>
                      <th className="py-2.5 px-2 text-right">IVA (16%)</th>
                      <th className="py-2.5 px-2 text-right">Seguro</th>
                      <th className="py-2.5 px-2 text-right">Pago Fijo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-[11px]">
                    {simulation.schedule.map((row) => (
                      <tr key={row.period} className="hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="py-2 px-2 text-slate-600 dark:text-slate-400 font-bold">{row.period}</td>
                        <td className="py-2 px-2 text-right text-slate-800 dark:text-slate-300">{formatCurrencyCell(row.balance)}</td>
                        <td className="py-2 px-2 text-right text-[#0F766E] dark:text-[#4CD360] font-semibold">{formatCurrencyCell(row.capital)}</td>
                        <td className="py-2 px-2 text-right text-[#1E3A8A] dark:text-[#00D1FF]">{formatCurrencyCell(row.interest)}</td>
                        <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{formatCurrencyCell(row.vat)}</td>
                        <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{formatCurrencyCell(row.insurance)}</td>
                        <td className="py-2 px-2 text-right font-black text-slate-950 dark:text-white">{formatCurrencyCell(row.payment)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-emerald-50/95 dark:bg-slate-900 border-t-2 border-slate-900 dark:border-[#249E82] text-[11px] font-black">
                    <tr>
                      <td className="py-2.5 px-2 text-slate-950 dark:text-white">TOTALES</td>
                      <td className="py-2.5 px-2 text-right text-slate-800 dark:text-slate-300">{formatCurrencyCell(0)}</td>
                      <td className="py-2.5 px-2 text-right text-[#0F766E] dark:text-[#4CD360]">{formatCurrencyCell(amount)}</td>
                      <td className="py-2.5 px-2 text-right text-[#1E3A8A] dark:text-[#00D1FF]">{formatCurrencyCell(simulation.totalInterest)}</td>
                      <td className="py-2.5 px-2 text-right text-slate-800 dark:text-slate-200">{formatCurrencyCell(simulation.totalVat)}</td>
                      <td className="py-2.5 px-2 text-right text-slate-800 dark:text-slate-200">{formatCurrencyCell(simulation.totalInsurance)}</td>
                      <td className="py-2.5 px-2 text-right text-[#0F766E] dark:text-[#4CD360]">{formatCurrencyCell(simulation.totalToPay)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex justify-between items-center text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  Importes sujetos a redondeo y calendario de amortización definitivo. Verificado con Decimal.js.
                </span>
                <button
                  type="button"
                  onClick={() => setShowAmortizationModal(false)}
                  className="px-5 py-2 rounded-xl bg-[#249E82] text-white font-bold"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
