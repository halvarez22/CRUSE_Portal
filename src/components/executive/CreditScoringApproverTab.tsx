/**
 * MÓDULO B.3: SIMULADOR Y SCORING DE CRÉDITOS EXPLICABLE PARA EL APROBADOR
 * Expediente: CRUSE-APO-2026-029 — Guardrail Forense 1 (< 400 líneas) y Guardrail Forense 3
 */

import React, { useState } from 'react';
import Decimal from 'decimal.js';
import {
  Calculator,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Sparkles,
  Download,
} from 'lucide-react';
import { LOAN_PRODUCTS } from '../../data/cruseData';
import { HubRegion, ScoringEvaluationResult } from '../../types/executive';

interface CreditScoringApproverTabProps {
  token: string;
}

export const CreditScoringApproverTab: React.FC<CreditScoringApproverTabProps> = ({ token }) => {
  const [productType, setProductType] = useState<'normal' | 'express'>('normal');
  const [requestedAmount, setRequestedAmount] = useState<number>(30000);
  const [termFortnights, setTermFortnights] = useState<number>(24);
  const [fortnightlyNetSalary, setFortnightlyNetSalary] = useState<number>(12000);
  const [currentPayrollDeductions, setCurrentPayrollDeductions] = useState<number>(800);
  const [seniorityMonths, setSeniorityMonths] = useState<number>(36);
  const [convenio, setConvenio] = useState<string>('STSGECH');
  const [hubRegion, setHubRegion] = useState<HubRegion>('CHIHUAHUA');

  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<ScoringEvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const product = LOAN_PRODUCTS.find((p) => p.id === productType)!;

  const handleSwitchProduct = (type: 'normal' | 'express') => {
    setProductType(type);
    if (type === 'express') {
      setRequestedAmount(10000);
      setTermFortnights(14);
    } else {
      setRequestedAmount(30000);
      setTermFortnights(24);
    }
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    setError(null);
    try {
      const res = await fetch('/api/executive/scoring-evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productType,
          requestedAmount,
          termFortnights,
          fortnightlyNetSalary,
          currentPayrollDeductions,
          seniorityMonths,
          convenio,
          hubRegion,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al evaluar scoring paramétrico');
      }
      setResult(data as ScoringEvaluationResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fallo de conexión con el motor de scoring');
    } finally {
      setEvaluating(false);
    }
  };

  // Guardrail 1 (CRUSE-APO-2026-058): Sumatoria estricta de la Tabla de Amortización con Decimal.js (cero '+' nativo sobre floats)
  const scheduleTotals = result
    ? result.schedule.reduce(
        (acc, row) => ({
          capital: acc.capital.plus(new Decimal(row.capital)),
          interest: acc.interest.plus(new Decimal(row.interest)),
          vat: acc.vat.plus(new Decimal(row.vat)),
          insurance: acc.insurance.plus(new Decimal(row.insurance)),
          payment: acc.payment.plus(new Decimal(row.payment)),
        }),
        {
          capital: new Decimal(0),
          interest: new Decimal(0),
          vat: new Decimal(0),
          insurance: new Decimal(0),
          payment: new Decimal(0),
        }
      )
    : null;

  const handleExportScheduleCsv = () => {
    if (!result || !scheduleTotals) return;
    const headerMeta = [
      `"MICROFINANCIERA CRUSE, S.A. DE C.V. SOFOM E.N.R. - TABLA DE AMORTIZACIÓN Y SCORING APROBADOR"`,
      `"Producto","${product.name}","Monto Solicitado","$${new Decimal(requestedAmount).toFixed(2)}","Plazo","${termFortnights} Quincenas","CAT s/IVA","${result.catPercent}%"`,
      `"Convenio","${convenio}","Hub","${hubRegion}","Dictamen","${result.riskLevel} (${result.score}/950 pts)"`,
      '',
      '"Quincena","Capital ($)","Interés ($)","IVA ($)","Seguro de Vida ($)","Cuota Quincenal ($)","Saldo Insoluto ($)"',
    ];

    const dataRows = result.schedule.map(
      (r) =>
        `"${r.period}","${new Decimal(r.capital).toFixed(2)}","${new Decimal(r.interest).toFixed(2)}","${new Decimal(r.vat).toFixed(2)}","${new Decimal(r.insurance).toFixed(2)}","${new Decimal(r.payment).toFixed(2)}","${new Decimal(r.balance).toFixed(2)}"`
    );

    const totalRow = `"TOTALES","${scheduleTotals.capital.toFixed(2)}","${scheduleTotals.interest.toFixed(2)}","${scheduleTotals.vat.toFixed(2)}","${scheduleTotals.insurance.toFixed(2)}","${scheduleTotals.payment.toFixed(2)}","0.00"`;

    const csvContent = [...headerMeta, ...dataRows, totalRow].join('\r\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TABLA_AMORTIZACION_CRUSE_${productType.toUpperCase()}_${requestedAmount}_${termFortnights}Q.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-[#0D1B3E]/80 to-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 text-[#00D1FF] border border-cyan-500/30 text-xs font-bold mb-1.5">
            <Calculator className="w-3.5 h-3.5" />
            <span>Mesa de Control & Aprobación · Guardrail CNBV Scoring Explicable</span>
          </span>
          <h3 className="text-xl font-extrabold text-white">
            Simulador de Crédito y Evaluador de Riesgo (Bajo / Medio / Alto)
          </h3>
          <p className="text-xs text-slate-400">
            Evalúa capacidad real de descuento quincenal (tope legal 30% Art. 110 LFT), antigüedad laboral y convenio, generando un dictamen determinista auditable.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSwitchProduct('normal')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              productType === 'normal'
                ? 'bg-[#249E82] text-white shadow-lg'
                : 'bg-slate-950 text-slate-400 border border-slate-800'
            }`}
          >
            Crédito Normal (47.50% anual)
          </button>
          <button
            onClick={() => handleSwitchProduct('express')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              productType === 'express'
                ? 'bg-[#396CAE] text-white shadow-lg'
                : 'bg-slate-950 text-slate-400 border border-slate-800'
            }`}
          >
            Crédito Express (80.00% anual)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario del Aprobador */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h4 className="font-extrabold text-sm text-white border-b border-slate-800 pb-2.5 flex justify-between">
            <span>Parámetros de la Solicitud</span>
            <span className="text-xs text-[#D4AF37]">{product.name}</span>
          </h4>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-300">Monto Solicitado</span>
              <span className="text-emerald-400">${requestedAmount.toLocaleString('es-MX')} MXN</span>
            </div>
            <input
              type="range"
              min={product.minAmount}
              max={product.maxAmount}
              step={productType === 'express' ? 500 : 5000}
              value={requestedAmount}
              onChange={(e) => setRequestedAmount(new Decimal(e.target.value || '0').toNumber())}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">Plazo en Quincenas</label>
            <div className="grid grid-cols-3 gap-2">
              {product.terms.map((t) => (
                <button
                  key={t}
                  onClick={() => setTermFortnights(t)}
                  className={`py-2 rounded-xl text-xs font-bold border ${
                    termFortnights === t
                      ? 'bg-[#396CAE] text-white border-cyan-400'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  {t} Qnas
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Sueldo Neto Quincenal ($)</label>
              <input
                type="number"
                value={fortnightlyNetSalary}
                onChange={(e) => setFortnightlyNetSalary(new Decimal(e.target.value || '0').toNumber())}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Deducciones Actuales ($)</label>
              <input
                type="number"
                value={currentPayrollDeductions}
                onChange={(e) => setCurrentPayrollDeductions(new Decimal(e.target.value || '0').toNumber())}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Antigüedad (Meses)</label>
              <input
                type="number"
                value={seniorityMonths}
                onChange={(e) => setSeniorityMonths(new Decimal(e.target.value || '0').toNumber())}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Hub Nacional</label>
              <select
                value={hubRegion}
                onChange={(e) => setHubRegion(e.target.value as HubRegion)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              >
                <option value="CHIHUAHUA">CHIHUAHUA (HQ)</option>
                <option value="LEON">LEÓN (BAJÍO)</option>
                <option value="CANCUN">CANCÚN (SUR)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Convenio Institucional</label>
            <select
              value={convenio}
              onChange={(e) => setConvenio(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
            >
              <option value="STSGECH">STSGECH (Gobierno Chihuahua)</option>
              <option value="SUPREMO_TRIBUNAL">Supremo Tribunal de Justicia Chih.</option>
              <option value="PODER_JUDICIAL_GTO">Poder Judicial Guanajuato (Hub León)</option>
              <option value="SINDICATO_SALUD_GTO">Sindicato Salud Guanajuato (Hub León)</option>
              <option value="PODER_JUDICIAL_QROO">Poder Judicial Q. Roo (Hub Cancún)</option>
              <option value="AYUNTAMIENTO_CANCUN">Ayuntamiento Cancún (Hub Cancún)</option>
            </select>
          </div>

          <button
            onClick={handleEvaluate}
            disabled={evaluating}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#249E82] to-[#396CAE] hover:opacity-95 text-white font-extrabold text-xs shadow-lg flex items-center justify-center gap-2 transition-all"
          >
            <Sparkles className="w-4 h-4 text-[#D4AF37]" />
            <span>{evaluating ? 'Evaluando Reglas Paramétricas...' : 'Emitir Dictamen de Scoring para Aprobador'}</span>
          </button>

          {error && <p className="text-xs text-rose-400 font-semibold">{error}</p>}

          {/* ① Desglose de Puntajes y Reglas Paramétricas debajo de los Parámetros (Columna Izquierda) */}
          {result && (
            <div className="pt-4 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase text-[#00D1FF]">
                  Desglose de Puntajes y Reglas Auditables
                </span>
                <span className="text-[11px] font-mono font-bold text-[#D4AF37]">
                  Base 700 → {result.score} pts
                </span>
              </div>
              <div className="space-y-2">
                {result.parametricRules.map((r) => (
                  <div
                    key={r.ruleCode}
                    className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-200 leading-snug">{r.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{r.valueFormatted}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-bold text-xs shrink-0 ${
                        r.pointsDelta >= 0
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {r.pointsDelta >= 0 ? `+${r.pointsDelta}` : r.pointsDelta} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Panel de Resultados y Dictamen Explicable */}
        <div className="lg:col-span-2 space-y-5">
          {!result ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
              <Cpu className="w-10 h-10 text-[#00D1FF] mx-auto opacity-80" />
              <h4 className="text-base font-bold text-white">
                Configure los datos de la solicitud y presione &ldquo;Emitir Dictamen de Scoring&rdquo;
              </h4>
              <p className="text-xs text-slate-400 max-w-lg mx-auto">
                El sistema calculará la tabla de amortización exacta, validará las 4 reglas paramétricas de riesgo (DTI, antigüedad, margen libre y convenio) y clasificará la operación en{' '}
                <strong className="text-emerald-400">Bajo</strong>,{' '}
                <strong className="text-amber-300">Medio</strong> o{' '}
                <strong className="text-rose-400">Alto Riesgo</strong>.
              </p>
            </div>
          ) : (
            <>
              {/* Tarjeta del Semáforo de Riesgo para el Aprobador */}
              <div
                className={`p-6 rounded-2xl border space-y-4 ${
                  result.riskLevel === 'BAJO'
                    ? 'bg-emerald-950/25 border-emerald-500/40'
                    : result.riskLevel === 'MEDIO'
                      ? 'bg-amber-950/25 border-amber-500/40'
                      : 'bg-rose-950/25 border-rose-500/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2.5">
                    {result.riskLevel === 'BAJO' && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                    {result.riskLevel === 'MEDIO' && <AlertTriangle className="w-6 h-6 text-amber-400" />}
                    {result.riskLevel === 'ALTO' && <XCircle className="w-6 h-6 text-rose-400" />}
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Dictamen Paramétrico Determinista para el Aprobador
                      </span>
                      <h4 className="text-base font-extrabold text-white">{result.riskLabel}</h4>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-slate-400 font-bold block">Puntaje Cruse</span>
                    <span className="text-2xl font-black text-[#D4AF37]">{result.score} / 950</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-slate-400 block">Cuota Quincenal</span>
                    <strong className="text-base font-black text-emerald-400">
                      ${result.fortnightlyPayment.toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-slate-400 block">Margen Disponible (30% LFT)</span>
                    <strong className="text-base font-black text-[#00D1FF]">
                      ${result.availableFortnightlyCapacity.toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-slate-400 block">Compromiso Neto Total</span>
                    <strong className="text-base font-black text-white">
                      {result.totalDeductionRatioPercent.toFixed(1)}%
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-slate-400 block">Monto Máx. Sugerido</span>
                    <strong className="text-base font-black text-[#D4AF37]">
                      ${result.recommendedMaxAmount.toLocaleString('es-MX')}
                    </strong>
                  </div>
                </div>

                {/* ② Justificación Ejecutiva elevada directamente al lugar del Desglose */}
                <div className="p-4 rounded-xl bg-slate-950/90 border border-cyan-500/30 text-xs text-slate-200 leading-relaxed">
                  <strong className="text-[#00D1FF] block mb-1">
                    Justificación Ejecutiva ({result.generatedByModel}):
                  </strong>
                  {result.aiExecutiveJustification}
                </div>
              </div>

              {/* ③ y ④ Tabla de Amortización Ampliada con Fila de Totales (Decimal.js) y Exportación a Excel (.CSV) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-xs font-extrabold uppercase text-white flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>Tabla de Amortización Quincenal ({termFortnights} periodos · CAT {result.catPercent}%)</span>
                  </h4>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-emerald-400">
                      Total a Pagar: ${scheduleTotals ? scheduleTotals.payment.toFixed(2) : result.totalToPay.toFixed(2)} MXN
                    </span>
                    <button
                      type="button"
                      onClick={handleExportScheduleCsv}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Exportar a Excel (.CSV)</span>
                    </button>
                  </div>
                </div>
                <div className="max-h-[420px] overflow-y-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 sticky top-0 z-10 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">Qna</th>
                        <th className="p-2.5">Capital</th>
                        <th className="p-2.5">Interés</th>
                        <th className="p-2.5">IVA</th>
                        <th className="p-2.5">Seguro</th>
                        <th className="p-2.5">Cuota</th>
                        <th className="p-2.5">Saldo Insoluto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                      {result.schedule.map((row) => (
                        <tr key={row.period} className="hover:bg-slate-800/40">
                          <td className="p-2.5 font-bold">{row.period}</td>
                          <td className="p-2.5">${new Decimal(row.capital).toFixed(2)}</td>
                          <td className="p-2.5 text-amber-300">${new Decimal(row.interest).toFixed(2)}</td>
                          <td className="p-2.5">${new Decimal(row.vat).toFixed(2)}</td>
                          <td className="p-2.5">${new Decimal(row.insurance).toFixed(2)}</td>
                          <td className="p-2.5 font-bold text-emerald-400">${new Decimal(row.payment).toFixed(2)}</td>
                          <td className="p-2.5">${new Decimal(row.balance).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {scheduleTotals && (
                      <tfoot className="bg-slate-950 sticky bottom-0 z-10 border-t-2 border-emerald-500/40 text-white font-mono font-extrabold">
                        <tr>
                          <td className="p-2.5 text-[#00D1FF]">TOTALES</td>
                          <td className="p-2.5">${scheduleTotals.capital.toFixed(2)}</td>
                          <td className="p-2.5 text-amber-300">${scheduleTotals.interest.toFixed(2)}</td>
                          <td className="p-2.5">${scheduleTotals.vat.toFixed(2)}</td>
                          <td className="p-2.5">${scheduleTotals.insurance.toFixed(2)}</td>
                          <td className="p-2.5 text-emerald-400">${scheduleTotals.payment.toFixed(2)}</td>
                          <td className="p-2.5 text-slate-400">$0.00</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
