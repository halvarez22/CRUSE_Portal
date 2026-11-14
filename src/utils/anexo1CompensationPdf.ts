/**
 * GENERADOR DEL DOCUMENTO OFICIAL "ANEXO 1 — TABLA PARA COMPENSACIÓN (2 IMPRESIONES)"
 * Expediente: CRUSE-APO-2026-063 (Caso 6 — Homologación con 'tablas amortizacion quincenal y mensual.xlsx')
 *
 * - Imprime en una sola vista dos tantos idénticos (Tanto 1: Acuse Dependencia / Recursos Humanos y
 *   Tanto 2: Expediente Microfinanciera Cruse).
 * - Utiliza exclusivamente los datos fiscales de FINANCIAL_CONSTANTS.CRUSE_FISCAL_HEADER (Cero Hardcoding).
 * - Calcula el calendario de fechas periódicas de descuento y los totales con Decimal.js.
 */

import Decimal from 'decimal.js';
import { addDays, addMonths, format, parseISO } from 'date-fns';
import { AmortizationRow } from '../types';
import { FINANCIAL_CONSTANTS } from '../config/financialConstants';
import { formatCurrencyCell } from './amortizationExport';

export interface Anexo1CompensationParams {
  borrowerName?: string;
  convenioName?: string;
  openingDateIso?: string;
  productName: string;
  amount: number;
  selectedTerm: number;
  frequency?: 'quincenal' | 'mensual';
  periodicPayment: number;
  totalInterest: number;
  totalVat: number;
  totalInsurance: number;
  totalToPay: number;
  schedule: AmortizationRow[];
}

function computeScheduledDeductionDate(
  openingDateIso: string,
  periodNumber: number,
  frequency: 'quincenal' | 'mensual'
): string {
  try {
    const baseDate = parseISO(openingDateIso.trim().slice(0, 10));
    const targetDate =
      frequency === 'mensual'
        ? addMonths(baseDate, periodNumber)
        : addDays(baseDate, periodNumber * 15);
    return format(targetDate, 'dd/MM/yyyy');
  } catch {
    return `Periodo ${periodNumber}`;
  }
}

export function buildAnexo1CompensationHtml(params: Anexo1CompensationParams): string {
  const header = FINANCIAL_CONSTANTS.CRUSE_FISCAL_HEADER;
  const borrower = (params.borrowerName || 'ACREDITADO TITULAR EN NÓMINA').toUpperCase();
  const convenio = (params.convenioName || 'DEPENDENCIA / CONVENIO INSTITUCIONAL').toUpperCase();
  const openingIso = params.openingDateIso || new Date().toISOString().slice(0, 10);
  const freq = params.frequency ?? 'quincenal';
  const freqLabel = freq === 'mensual' ? 'MENSUAL' : 'QUINCENAL';

  const totalCapitalDec = params.schedule.reduce(
    (sum, r) => sum.plus(new Decimal(r.capital || 0)),
    new Decimal(0)
  );
  const totalInterestDec = new Decimal(params.totalInterest || 0);
  const totalVatDec = new Decimal(params.totalVat || 0);
  const totalInsDec = new Decimal(params.totalInsurance || 0);
  const totalPayDec = new Decimal(params.totalToPay || 0);

  const renderCopyBlock = (copyTitle: string): string => {
    const rowsHtml = params.schedule
      .map(
        (row) => `
          <tr>
            <td class="center bold">${row.period}</td>
            <td class="center">${computeScheduledDeductionDate(openingIso, row.period, freq)}</td>
            <td class="num">${formatCurrencyCell(row.balance)}</td>
            <td class="num">${formatCurrencyCell(row.capital)}</td>
            <td class="num">${formatCurrencyCell(row.interest)}</td>
            <td class="num">${formatCurrencyCell(row.vat)}</td>
            <td class="num">${formatCurrencyCell(row.insurance)}</td>
            <td class="num bold">${formatCurrencyCell(row.payment)}</td>
          </tr>`
      )
      .join('');

    return `
      <section class="anexo-copy">
        <div class="copy-badge">${copyTitle}</div>
        <div class="header-box">
          <div>
            <h1 class="company-title">${header.legalName}</h1>
            <p class="fiscal-line">RFC: <strong>${header.rfc}</strong> · ${header.addressLine1}</p>
            <p class="fiscal-line">${header.cityStateZip} · ${header.phones}</p>
          </div>
          <div class="anexo-title-block">
            <h2>ANEXO 1</h2>
            <p>TABLA PARA COMPENSACIÓN</p>
          </div>
        </div>

        <div class="meta-grid">
          <div><strong>NOMBRE DEL ACREDITADO:</strong> ${borrower}</div>
          <div><strong>FECHA DE APERTURA:</strong> ${openingIso}</div>
          <div><strong>DEPENDENCIA / CONVENIO:</strong> ${convenio}</div>
          <div><strong>MODALIDAD / PLAZO:</strong> ${freqLabel} (${params.selectedTerm} PAGOS)</div>
          <div><strong>IMPORTE AUTORIZADO:</strong> ${formatCurrencyCell(params.amount)} MXN</div>
          <div><strong>RETENCIÓN PERIÓDICA:</strong> ${formatCurrencyCell(params.periodicPayment)} MXN</div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="center">No.</th>
              <th class="center">Fecha Prog.</th>
              <th>Saldo Insoluto</th>
              <th>Capital</th>
              <th>Interés</th>
              <th>IVA (16%)</th>
              <th>Seguro</th>
              <th>Descuento</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td colspan="3" class="center bold">TOTALES DEL CALENDARIO</td>
              <td class="num bold">${formatCurrencyCell(totalCapitalDec.toNumber())}</td>
              <td class="num bold">${formatCurrencyCell(totalInterestDec.toNumber())}</td>
              <td class="num bold">${formatCurrencyCell(totalVatDec.toNumber())}</td>
              <td class="num bold">${formatCurrencyCell(totalInsDec.toNumber())}</td>
              <td class="num bold">${formatCurrencyCell(totalPayDec.toNumber())}</td>
            </tr>
          </tfoot>
        </table>

        <div class="signatures">
          <div class="sig-box">
            <div class="sig-line"></div>
            <p class="sig-name">${borrower}</p>
            <p class="sig-role">FIRMA DE CONFORMIDAD Y AUTORIZACIÓN DE DESCUENTO</p>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <p class="sig-name">${header.legalName}</p>
            <p class="sig-role">SELLO Y VALIDACIÓN DE CONTROL OPERATIVO / COMPENSACIÓN</p>
          </div>
        </div>
      </section>
    `;
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Anexo 1 — Tabla para Compensación (2 Impresiones) — Microfinanciera Cruse</title>
  <style>
    @page { size: letter portrait; margin: 10mm; }
    * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
    body { margin: 0; padding: 10px; color: #0D1B3E; background: #fff; font-size: 9.5px; }
    .anexo-copy { border: 1.5px solid #0D1B3E; border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; page-break-inside: avoid; }
    .copy-badge { background: #0D1B3E; color: #D4AF37; font-weight: 800; font-size: 9px; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-bottom: 6px; letter-spacing: 0.5px; }
    .header-box { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #249E82; padding-bottom: 6px; margin-bottom: 8px; }
    .company-title { font-size: 12px; font-weight: 800; margin: 0; color: #041734; }
    .fiscal-line { margin: 1px 0; font-size: 8.5px; color: #334155; }
    .anexo-title-block { text-align: right; background: #f1f5f9; padding: 4px 10px; border-radius: 6px; border-left: 3px solid #D4AF37; }
    .anexo-title-block h2 { margin: 0; font-size: 13px; color: #041734; font-weight: 900; }
    .anexo-title-block p { margin: 0; font-size: 8.5px; font-weight: 700; color: #0f766e; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; font-size: 9px; }
    table { width: 100%; border-collapse: collapse; font-family: 'Consolas', monospace; font-size: 8.5px; }
    th { background: #041734; color: #fff; padding: 4px 6px; text-align: right; text-transform: uppercase; }
    th.center, td.center { text-align: center; }
    td { padding: 3px 6px; border-bottom: 1px solid #e2e8f0; text-align: right; }
    .totals-row td { background: #e6f7f3; border-top: 1.5px solid #041734; font-weight: 800; }
    .bold { font-weight: 700; }
    .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 28px; margin-top: 18px; padding-top: 6px; }
    .sig-box { text-align: center; }
    .sig-line { border-bottom: 1px solid #0D1B3E; height: 22px; margin-bottom: 4px; }
    .sig-name { margin: 0; font-weight: 800; font-size: 8.5px; }
    .sig-role { margin: 1px 0 0 0; font-size: 7.5px; color: #475569; }
  </style>
</head>
<body>
  ${renderCopyBlock('IMPRESIÓN 1 DE 2 — EJEMPLAR PARA COMPENSACIÓN / RECURSOS HUMANOS DEPENDENCIA')}
  ${renderCopyBlock('IMPRESIÓN 2 DE 2 — ACUSE EXPEDIENTE MICROFINANCIERA CRUSE (MCR1002231B7)')}
</body>
</html>`;
}

export function exportAnexo1CompensationPDF(params: Anexo1CompensationParams): void {
  const htmlDocument = buildAnexo1CompensationHtml(params);
  const printWindow = window.open('', '_blank', 'width=980,height=860');
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.open();
  printWindow.document.write(htmlDocument);
  printWindow.document.close();
}
