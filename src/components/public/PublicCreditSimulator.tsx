import React, { useState, useMemo } from 'react';
import { Calculator, ShieldAlert, Sparkles, FileText, ChevronRight, CheckCircle, FileSpreadsheet, Printer } from 'lucide-react';
import { ProductId } from '../../types';
import { LOAN_PRODUCTS } from '../../data/cruseData';
import { FINANCIAL_CONSTANTS, calculateSimulation } from '../../config/financialConstants';
import { PreApplicationModal } from './PreApplicationModal';
import { exportAmortizationToExcel, exportAmortizationToPdf, AmortizationExportParams } from '../../utils/amortizationExport';

export const PublicCreditSimulator: React.FC = () => {
  const [productType, setProductType] = useState<ProductId>('normal');
  const activeProduct = useMemo(
    () => LOAN_PRODUCTS.find((p) => p.id === productType) || LOAN_PRODUCTS[0],
    [productType]
  );

  const [amount, setAmount] = useState<number>(25000);
  const [selectedTerm, setSelectedTerm] = useState<number>(24);
  const [showAmortizationModal, setShowAmortizationModal] = useState<boolean>(false);
  const [showPreAppModal, setShowPreAppModal] = useState<boolean>(false);

  // Switch product logic
  const handleSelectProduct = (type: ProductId) => {
    setProductType(type);
    if (type === 'normal') {
      setAmount(25000);
      setSelectedTerm(24);
    } else {
      setAmount(5000);
      setSelectedTerm(6);
    }
  };

  // Perform calculation with decimal.js
  const simulation = useMemo(() => {
    return calculateSimulation(amount, selectedTerm, productType);
  }, [amount, selectedTerm, productType]);

  const exportParams: AmortizationExportParams = useMemo(
    () => ({
      productName: activeProduct.name,
      amount,
      selectedTerm,
      interestRateText: activeProduct.interestRateText,
      fortnightlyPayment: simulation.fortnightlyPayment,
      monthlyPaymentEquivalent: simulation.monthlyPaymentEquivalent,
      totalInterest: simulation.totalInterest,
      totalVat: simulation.totalVat,
      totalInsurance: simulation.totalInsurance,
      totalToPay: simulation.totalToPay,
      catPercent: simulation.catPercent,
      schedule: simulation.schedule,
    }),
    [activeProduct, amount, selectedTerm, simulation]
  );

  return (
    <section id="simulador" className="py-12 lg:py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-[#396CAE]/15 text-[#396CAE] dark:text-[#00D1FF] border border-[#396CAE]/30 mb-3">
            <Calculator className="w-3.5 h-3.5" />
            <span>Simulador Financiero Oficial — Conforme a NOM-186-SCFI-2013</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-[#041734] dark:text-white mb-3">
            Calcula tu Crédito con Descuento Vía Nómina
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
            Transparencia total y sin letras chiquitas. Selecciona tu producto, monto y plazo para conocer tu cuota fija quincenal.
          </p>
        </div>

        {/* Simulator Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* Controls Column (7 cols) */}
          <div className="lg:col-span-7 glass-panel rounded-3xl p-6 sm:p-8 h-full flex flex-col justify-between">
            
            {/* Product Switcher Tabs */}
            <div className="flex bg-slate-200/80 dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-300/80 dark:border-white/10 mb-8">
              <button
                type="button"
                onClick={() => handleSelectProduct('normal')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  productType === 'normal'
                    ? 'bg-[#249E82] text-white shadow-md glow-teal'
                    : 'text-slate-700 dark:text-slate-300 hover:text-[#041734] dark:hover:text-white'
                }`}
              >
                <span>Crédito Clásico (1.97% quincenal)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectProduct('express')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  productType === 'express'
                    ? 'bg-[#396CAE] text-white shadow-md glow-blue'
                    : 'text-slate-700 dark:text-slate-300 hover:text-[#041734] dark:hover:text-white'
                }`}
              >
                <span>Crédito Express (3.33% quincenal)</span>
              </button>
            </div>

            {/* Amount Slider */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-3">
                <label htmlFor="amount-slider" className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                  Monto Solicitado:
                </label>
                <span className="text-2xl sm:text-3xl font-black text-[#059669] dark:text-[#4CD360] font-mono">
                  ${amount.toLocaleString('es-MX')} MXN
                </span>
              </div>
              <input
                id="amount-slider"
                type="range"
                min={activeProduct.minAmount}
                max={activeProduct.maxAmount}
                step={productType === 'normal' ? 5000 : 1000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#249E82]"
                aria-label="Monto solicitado de crédito"
              />
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono">
                <span>Min: ${activeProduct.minAmount.toLocaleString('es-MX')}</span>
                <span>Max: ${activeProduct.maxAmount.toLocaleString('es-MX')}</span>
              </div>
            </div>

            {/* Term Selector */}
            <div className="mb-8">
              <label className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 block mb-3">
                Plazo de Pago (Quincenas):
              </label>
              <div className="grid grid-cols-3 gap-3">
                {activeProduct.terms.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setSelectedTerm(term)}
                    className={`py-3 px-4 rounded-xl text-center font-bold text-sm transition-all glass-input ${
                      selectedTerm === term
                        ? 'border-[#249E82] bg-[#249E82]/25 text-[#041734] dark:text-white shadow-sm ring-1 ring-[#249E82]'
                        : 'text-slate-700 dark:text-slate-300 hover:border-[#249E82]/50'
                    }`}
                  >
                    <span className="block text-base">{term}</span>
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      quincenas ({term / 2} meses)
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Insurance Badge (Resolves Audit Finding C-5 & M-4) */}
            {productType === 'normal' ? (
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-[#249E82] flex items-start gap-3 mb-4">
                <ShieldAlert className="w-5 h-5 text-[#249E82] shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <strong className="text-[#041734] dark:text-white block font-bold mb-0.5">
                    Seguro de Vida Institucional con Cobertura de ${FINANCIAL_CONSTANTS.LIFE_INSURANCE_COVERAGE_MXN.toLocaleString('es-MX')} MXN Incluido
                  </strong>
                  Tu cuota ya integra la prima fija de ${FINANCIAL_CONSTANTS.LIFE_INSURANCE_FORTNIGHTLY_MXN} MXN quincenal. En caso de siniestro, liquida al 100% el saldo insoluto del préstamo y el remanente se entrega en efectivo a tus beneficiarios designados.
                </div>
              </div>
            ) : (
              <div className="glass-card rounded-2xl p-4 border-l-4 border-l-[#396CAE] flex items-start gap-3 mb-4">
                <Sparkles className="w-5 h-5 text-[#396CAE] shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <strong className="text-[#041734] dark:text-white block font-bold mb-0.5">
                    Microfinanciamiento Ágil sin Póliza Extendida
                  </strong>
                  El Crédito Express es de resolución rápida para emergencias de liquidez en menos de 2 horas. No tiene cobro de póliza de seguro de vida quincenal.
                </div>
              </div>
            )}

            {/* Regulatory Notice for CAT (Resolves Audit Finding C-2) */}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
              * CAT (Costo Anual Total) Promedio Ponderado:{' '}
              <strong className="text-[#D4AF37] font-bold">{simulation.catPercent}% sin IVA</strong>. Fecha de cálculo: Enero 2026. Para fines informativos y de comparación. Crédito sujeto a capacidad de retención en nómina gubernamental.
            </p>

          </div>

          {/* Results Summary Card (5 cols) */}
          <div className="lg:col-span-5 glass-slab-emerald rounded-3xl p-6 sm:p-8 h-full flex flex-col justify-between shadow-xl">
            
            <div>
              <span className="text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-slate-300 block mb-2">
                Resumen de tu Cotización Oficial
              </span>
              
              {/* Payment Display */}
              <div className="bg-white/80 dark:bg-black/40 backdrop-blur-md rounded-2xl p-5 border border-white/20 mb-6 text-center shadow-inner">
                <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                  Tu Pago Quincenal Fijo
                </span>
                <span className="text-3xl sm:text-4xl font-black text-[#041734] dark:text-white font-mono block">
                  ${simulation.fortnightlyPayment.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span>Importe mensual (2 quincenas):</span>
                  <strong className="font-mono font-bold text-[#041734] dark:text-white">
                    ${simulation.monthlyPaymentEquivalent.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                  </strong>
                </div>
                <span className="text-xs text-[#059669] dark:text-[#4CD360] font-semibold mt-2 inline-flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Descuento directo por nómina institucional
                </span>
              </div>

              {/* Financial Metrics Breakdown */}
              <div className="space-y-3 text-xs mb-6">
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-white/10">
                  <span className="text-slate-600 dark:text-slate-400">Tasa de interés quincenal:</span>
                  <strong className="text-[#041734] dark:text-white font-mono font-bold">
                    {activeProduct.interestRateText}
                  </strong>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-white/10">
                  <span className="text-slate-600 dark:text-slate-400">Total de intereses calculados:</span>
                  <strong className="text-slate-800 dark:text-slate-200 font-mono font-bold">
                    ${simulation.totalInterest.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-white/10">
                  <span className="text-slate-600 dark:text-slate-400">IVA sobre intereses (16%):</span>
                  <strong className="text-slate-800 dark:text-slate-200 font-mono font-bold">
                    ${simulation.totalVat.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-white/10">
                  <span className="text-slate-600 dark:text-slate-400">Comisión por apertura:</span>
                  <strong className="text-[#059669] dark:text-[#4CD360] font-bold">
                    $0.00 MXN (0%)
                  </strong>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-white/10">
                  <span className="text-slate-600 dark:text-slate-400">Monto total a pagar:</span>
                  <strong className="text-[#041734] dark:text-white font-mono font-bold text-sm">
                    ${simulation.totalToPay.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowAmortizationModal(true)}
                className="w-full py-2.5 rounded-xl glass-card text-xs font-bold text-[#041734] dark:text-white hover:border-[#249E82] transition-all flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-[#396CAE]" />
                <span>Ver Tabla de Amortización Completa ({selectedTerm} Quincenas)</span>
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

        {/* Institutional SweetAlert2-style Pre-Application Confirmation Modal */}
        <PreApplicationModal
          isOpen={showPreAppModal}
          onClose={() => setShowPreAppModal(false)}
          data={{
            productId: productType,
            productName: activeProduct.name,
            amount,
            selectedTerm,
            fortnightlyPayment: simulation.fortnightlyPayment,
            monthlyPaymentEquivalent: simulation.monthlyPaymentEquivalent,
            interestRateText: activeProduct.interestRateText,
            totalToPay: simulation.totalToPay,
            catPercent: simulation.catPercent,
          }}
        />

        {/* Amortization Schedule Modal */}
        {showAmortizationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <div className="glass-panel w-full max-w-4xl max-h-[85vh] rounded-3xl p-6 flex flex-col justify-between overflow-hidden shadow-2xl border border-white/20">
              
              <div className="flex flex-wrap justify-between items-center gap-3 pb-4 border-b border-slate-200 dark:border-white/10 mb-4">
                <div>
                  <h3 className="text-lg font-black text-[#041734] dark:text-white">
                    Tabla de Amortización Quincenal Oficial
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeProduct.name} — ${amount.toLocaleString('es-MX')} MXN a {selectedTerm} quincenas ({selectedTerm / 2} meses)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportAmortizationToExcel(exportParams)}
                    className="px-3 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    title="Descargar corrida financiera en Excel (.xlsx)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Exportar Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportAmortizationToPdf(exportParams)}
                    className="px-3 py-2 rounded-xl bg-[#396CAE]/15 hover:bg-[#396CAE]/25 border border-[#396CAE]/40 text-[#041734] dark:text-[#00D1FF] text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    title="Imprimir o Guardar como PDF Oficial"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Exportar PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAmortizationModal(false)}
                    className="p-2 rounded-xl glass-card text-slate-500 hover:text-[#041734] dark:hover:text-white text-xs font-bold"
                  >
                    Cerrar ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Schedule Table */}
              <div className="flex-1 overflow-y-auto pr-2">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900 border-b border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="py-2.5 px-2">Qna</th>
                      <th className="py-2.5 px-2">Saldo Insoluto</th>
                      <th className="py-2.5 px-2">Capital</th>
                      <th className="py-2.5 px-2">Interés</th>
                      <th className="py-2.5 px-2">IVA (16%)</th>
                      <th className="py-2.5 px-2">Seguro</th>
                      <th className="py-2.5 px-2 text-right">Pago Fijo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-[11px]">
                    {simulation.schedule.map((row) => (
                      <tr key={row.period} className="hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="py-2 px-2 text-slate-500 font-bold">{row.period}</td>
                        <td className="py-2 px-2 text-slate-700 dark:text-slate-300">${row.balance}</td>
                        <td className="py-2 px-2 text-[#059669] dark:text-[#4CD360] font-semibold">${row.capital}</td>
                        <td className="py-2 px-2 text-[#396CAE] dark:text-[#00D1FF]">${row.interest}</td>
                        <td className="py-2 px-2 text-slate-500">${row.vat}</td>
                        <td className="py-2 px-2 text-slate-500">${row.insurance}</td>
                        <td className="py-2 px-2 text-right font-black text-[#041734] dark:text-white">${row.payment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Cálculo preciso libre de redondeo flotante verificado con decimal.js
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
