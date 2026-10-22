/**
 * MODAL ACCESIBLE DE DESGLOSE MANUAL EN PAGOS PARCIALES (MANUAL_OVERRIDE — RN-13)
 *
 * @implements RN-13 (Captura manual de Seguro, Interés, IVA y Capital en pagos parciales)
 * @implements Guardrail Forense 2 (Validación espejo con Decimal.js: Confirmar disabled si sumaDesglose !== amountReceived o overrideReason.length < 5)
 * @implements Guardrail Forense 4 (< 220 líneas y 0 any)
 */

import React, { useState, useMemo } from 'react';
import Decimal from 'decimal.js';
import { ShieldCheck, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { ReconciliationItem } from '../../types';

interface ManualOverrideModalProps {
  isOpen: boolean;
  item: ReconciliationItem | null;
  batchId: string;
  fortnightPeriod: string;
  token: string;
  onClose: () => void;
  onSuccess: (summaryText: string) => void;
}

export const ManualOverrideModal: React.FC<ManualOverrideModalProps> = ({
  isOpen,
  item,
  batchId,
  fortnightPeriod,
  token,
  onClose,
  onSuccess,
}) => {
  const [insuranceStr, setInsuranceStr] = useState('22.85');
  const [interestStr, setInterestStr] = useState('0.00');
  const [vatStr, setVatStr] = useState('0.00');
  const [capitalStr, setCapitalStr] = useState('0.00');
  const [overrideReason, setOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const calculation = useMemo(() => {
    const received = new Decimal(item?.actualPayment ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const parseSafe = (val: string): Decimal => {
      try {
        const d = new Decimal(val.trim() === '' ? '0' : val);
        return d.isFinite() && !d.isNegative() ? d : new Decimal(0);
      } catch {
        return new Decimal(0);
      }
    };
    const ins = parseSafe(insuranceStr);
    const int = parseSafe(interestStr);
    const vat = parseSafe(vatStr);
    const cap = parseSafe(capitalStr);

    const sumExact = ins.plus(int).plus(vat).plus(cap).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const diffExact = received.minus(sumExact).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const isBalanced = sumExact.equals(received);

    return { received, ins, int, vat, cap, sumExact, diffExact, isBalanced };
  }, [item?.actualPayment, insuranceStr, interestStr, vatStr, capitalStr]);

  if (!isOpen || !item) return null;

  const isReasonValid = overrideReason.trim().length >= 5;
  const canSubmit = calculation.isBalanced && isReasonValid && !submitting;

  const handleAssignRemainingToCapital = () => {
    const remaining = Decimal.max(0, calculation.received.minus(calculation.ins).minus(calculation.int).minus(calculation.vat));
    setCapitalStr(remaining.toFixed(2));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/reconciliation/manual-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          expedienteId: item.expedienteId,
          batchId,
          reconciliationItemId: item.id,
          fortnightPeriod,
          amountReceived: calculation.received.toNumber(),
          manualBreakdown: {
            appliedInsurance: calculation.ins.toNumber(),
            appliedInterest: calculation.int.toNumber(),
            appliedVat: calculation.vat.toNumber(),
            appliedCapital: calculation.cap.toNumber(),
          },
          overrideReason: overrideReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'Error aplicando desglose manual');
      } else {
        onSuccess(`MANUAL_OVERRIDE registrado: Cap $${calculation.cap.toFixed(2)}, Int $${calculation.int.toFixed(2)}, IVA $${calculation.vat.toFixed(2)}, Seg $${calculation.ins.toFixed(2)}`);
        onClose();
      }
    } catch {
      setErrorMsg('Error de red al conectar con el servidor');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="manual-override-title" className="w-full max-w-lg rounded-2xl bg-slate-950 border border-white/15 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-900/90 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <h2 id="manual-override-title" className="text-sm font-bold text-white">Desglose Manual de Pago Parcial (RN-13)</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-slate-400">Acreditado: <span className="text-white font-semibold">{item.employeeName}</span></p>
              <p className="text-slate-400 mt-0.5">Cuota esperada: ${item.expectedPayment.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase text-amber-400 font-bold">Monto Recibido</span>
              <p className="text-lg font-mono font-bold text-white">${calculation.received.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Seguro Aplicado ($)</label>
              <input type="number" step="0.01" min="0" value={insuranceStr} onChange={(e) => setInsuranceStr(e.target.value)} className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white font-mono" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Interés Aplicado ($)</label>
              <input type="number" step="0.01" min="0" value={interestStr} onChange={(e) => setInterestStr(e.target.value)} className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white font-mono" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">IVA Interés Aplicado ($)</label>
              <input type="number" step="0.01" min="0" value={vatStr} onChange={(e) => setVatStr(e.target.value)} className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white font-mono" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-400">Capital Aplicado ($)</label>
                <button type="button" onClick={handleAssignRemainingToCapital} className="text-[10px] text-[#00D1FF] hover:underline font-semibold">Asignar remanente</button>
              </div>
              <input type="number" step="0.01" min="0" value={capitalStr} onChange={(e) => setCapitalStr(e.target.value)} className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white font-mono" />
            </div>
          </div>

          <div className={`p-3 rounded-xl border flex items-center justify-between ${calculation.isBalanced ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-amber-500/10 border-amber-500/40 text-amber-300'}`}>
            <div className="flex items-center gap-2">
              {calculation.isBalanced ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span className="font-semibold">Suma del Desglose: ${calculation.sumExact.toFixed(2)}</span>
            </div>
            <span className="font-mono font-bold">Diferencia: ${calculation.diffExact.toFixed(2)}</span>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Justificación Forense Obligatoria (mín. 5 caracteres)</label>
            <input type="text" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Ej. Acuerdo con cliente para abonar remanente directo a capital..." className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white" />
          </div>

          {errorMsg && <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300">{errorMsg}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 font-semibold">Cancelar</button>
            <button type="submit" disabled={!canSubmit} className="px-4 py-2 rounded-xl bg-[#249E82] hover:bg-[#1fa789] text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed">
              {submitting ? 'Sellando en WORM...' : 'Confirmar Desglose Manual'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
