/**
 * MÓDULO B.3: SIMULADOR Y SCORING DE CRÉDITOS EXPLICABLE PARA EL APROBADOR
 * Expediente: CRUSE-APO-2026-029 — Guardrail Forense 1 (< 400 líneas) y Guardrail Forense 3
 */

import React, { useState } from 'react';
import {
  Calculator,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Sparkles,
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
            Evalúa capacidad real de descuento quincenal (tope 35%), antigüedad laboral y convenio, generando un dictamen determinista auditable.
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
            Crédito Clásico (1.97% qnal)
          </button>
          <button
            onClick={() => handleSwitchProduct('express')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              productType === 'express'
                ? 'bg-[#396CAE] text-white shadow-lg'
                : 'bg-slate-950 text-slate-400 border border-slate-800'
            }`}
          >
            Crédito Express (3.33% qnal)
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
              onChange={(e) => setRequestedAmount(Number(e.target.value))}
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
                onChange={(e) => setFortnightlyNetSalary(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Deducciones Actuales ($)</label>
              <input
                type="number"
                value={currentPayrollDeductions}
                onChange={(e) => setCurrentPayrollDeductions(Number(e.target.value))}
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
                onChange={(e) => setSeniorityMonths(Number(e.target.value))}
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
                    <span className="text-slate-400 block">Margen Disponible (35%)</span>
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

                {/* Desglose de Reglas Paramétricas Deterministas */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase text-slate-400">
                    Desglose de Reglas Paramétricas Auditables (Guardrail CNBV):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {result.parametricRules.map((r) => (
                      <div
                        key={r.ruleCode}
                        className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-200">{r.label}</div>
                          <div className="text-[11px] text-slate-400">{r.valueFormatted}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                            r.pointsDelta >= 0
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-rose-500/15 text-rose-400'
                          }`}
                        >
                          {r.pointsDelta >= 0 ? `+${r.pointsDelta}` : r.pointsDelta} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-200 leading-relaxed">
                  <strong className="text-[#00D1FF] block mb-1">
                    Justificación Ejecutiva ({result.generatedByModel}):
                  </strong>
                  {result.aiExecutiveJustification}
                </div>
              </div>

              {/* Tabla de Amortización resumida */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase text-white flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>Tabla de Amortización Quincenal ({termFortnights} periodos · CAT {result.catPercent}%)</span>
                  </h4>
                  <span className="text-xs font-bold text-emerald-400">
                    Total a Pagar: ${result.totalToPay.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </span>
                </div>
                <div className="max-h-52 overflow-y-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 sticky top-0 text-slate-400">
                      <tr>
                        <th className="p-2">Qna</th>
                        <th className="p-2">Capital</th>
                        <th className="p-2">Interés</th>
                        <th className="p-2">IVA</th>
                        <th className="p-2">Seguro</th>
                        <th className="p-2">Cuota</th>
                        <th className="p-2">Saldo Insoluto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                      {result.schedule.map((row) => (
                        <tr key={row.period}>
                          <td className="p-2 font-bold">{row.period}</td>
                          <td className="p-2">${row.capital}</td>
                          <td className="p-2 text-amber-300">${row.interest}</td>
                          <td className="p-2">${row.vat}</td>
                          <td className="p-2">${row.insurance}</td>
                          <td className="p-2 font-bold text-emerald-400">${row.payment}</td>
                          <td className="p-2">${row.balance}</td>
                        </tr>
                      ))}
                    </tbody>
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
