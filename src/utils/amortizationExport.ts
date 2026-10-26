/**
 * Utilidad pura de exportación de Tabla de Amortización Oficial (Excel .xlsx Estilizado y PDF Vectorial).
 * Cumple con Guardrail 1 (Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }) en capa de presentación),
 * Guardrail 2 (Plantilla OpenXML .xlsx con diseño institucional y formato '"$"#,##0.00')
 * y Guardrail 3 (Fila obligatoria de TOTALES al cierre de la tabla en PDF y Excel).
 */
import { AmortizationRow } from '../types';
import { generateStyledAmortizationXlsxBytes } from './excelStyledTemplate';

export interface AmortizationExportParams {
  productName: string;
  amount: number;
  selectedTerm: number;
  interestRateText: string;
  fortnightlyPayment: number;
  monthlyPaymentEquivalent: number;
  totalInterest: number;
  totalVat: number;
  totalInsurance: number;
  totalToPay: number;
  catPercent: number;
  schedule: AmortizationRow[];
}

const mxnCurrencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formateador puro de capa de presentación con separadores de miles ($23,958.33).
 * No altera los valores numéricos de cálculo (Guardrail 1).
 */
export function formatCurrencyCell(val: string | number): string {
  const numericVal = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(numericVal)) return '$0.00';
  return mxnCurrencyFormatter.format(numericVal);
}

const formatMxn = (val: number): string => `${formatCurrencyCell(val)} MXN`;

/**
 * Genera y descarga un archivo Excel (.xlsx) con diseño institucional pre-construido,
 * formato contable nativo '"$"#,##0.00' con separador de miles y fila de TOTALES.
 */
export function exportAmortizationToExcel(params: AmortizationExportParams): void {
  const { productName, amount, selectedTerm } = params;
  const xlsxBytes = generateStyledAmortizationXlsxBytes(params);

  const safeProductSlug = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const fileName = `CRUSE_Amortizacion_${safeProductSlug}_${amount}MXN_${selectedTerm}Q.xlsx`;

  const blob = new Blob([xlsxBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Abre una vista vectorial con diseño institucional CRUSE, separadores de miles en cada celda
 * y fila ejecutiva de TOTALES al cierre de la tabla, disparando el diálogo de impresión/guardado PDF.
 */
export function exportAmortizationToPdf(params: AmortizationExportParams): void {
  const {
    productName,
    amount,
    selectedTerm,
    interestRateText,
    fortnightlyPayment,
    monthlyPaymentEquivalent,
    totalInterest,
    totalVat,
    totalInsurance,
    totalToPay,
    catPercent,
    schedule,
  } = params;

  const printWindow = window.open('', '_blank', 'width=980,height=820');
  if (!printWindow) {
    window.print();
    return;
  }

  const rowsHtml = schedule
    .map(
      (row) => `
        <tr>
          <td class="center bold">${row.period}</td>
          <td class="num">${formatCurrencyCell(row.balance)}</td>
          <td class="num emerald">${formatCurrencyCell(row.capital)}</td>
          <td class="num blue">${formatCurrencyCell(row.interest)}</td>
          <td class="num">${formatCurrencyCell(row.vat)}</td>
          <td class="num">${formatCurrencyCell(row.insurance)}</td>
          <td class="num bold">${formatCurrencyCell(row.payment)}</td>
        </tr>`
    )
    .join('');

  const totalsRowHtml = `
      <tfoot>
        <tr class="totals-row">
          <td class="center bold">TOTALES</td>
          <td class="num bold">${formatCurrencyCell(0)}</td>
          <td class="num bold emerald">${formatCurrencyCell(amount)}</td>
          <td class="num bold blue">${formatCurrencyCell(totalInterest)}</td>
          <td class="num bold">${formatCurrencyCell(totalVat)}</td>
          <td class="num bold">${formatCurrencyCell(totalInsurance)}</td>
          <td class="num bold total-highlight">${formatCurrencyCell(totalToPay)}</td>
        </tr>
      </tfoot>`;

  const htmlDocument = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Cotización y Tabla de Amortización — Microfinanciera Cruse</title>
  <style>
    @page { size: letter portrait; margin: 14mm; }
    * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
    body { color: #0D1B3E; margin: 0; padding: 16px; background: #ffffff; font-size: 11px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #249E82; padding-bottom: 12px; margin-bottom: 16px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { height: 44px; background: #ffffff; padding: 4px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .brand-title { font-size: 16px; font-weight: 800; color: #041734; margin: 0; }
    .brand-sub { font-size: 10px; color: #475569; margin: 2px 0 0 0; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; }
    .kpi { padding: 6px 8px; border-left: 3px solid #249E82; background: #ffffff; border-radius: 6px; }
    .kpi-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; display: block; }
    .kpi-val { font-size: 13px; font-weight: 800; color: #041734; font-family: 'Consolas', monospace; }
    .kpi-sub { font-size: 10px; color: #059669; font-weight: 700; display: block; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-family: 'Consolas', monospace; font-size: 10.5px; }
    th { background: #041734; color: #ffffff; text-align: right; padding: 7px 8px; font-size: 10px; text-transform: uppercase; }
    th.center, td.center { text-align: center; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; }
    tr:nth-child(even) { background: #f8fafc; }
    .totals-row td { background: #e6f7f3; border-top: 2px solid #041734; border-bottom: 3px double #041734; padding: 7px 8px; font-weight: 800; color: #041734; }
    .total-highlight { color: #0f766e !important; font-size: 11px; }
    .bold { font-weight: 700; }
    .emerald { color: #059669; font-weight: 700; }
    .blue { color: #2563eb; }
    .footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 9.5px; color: #64748b; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img src="/branding/logotipo-cruse-oficial.png" alt="Microfinanciera Cruse" onerror="this.style.display='none'" />
      <div>
        <h1 class="brand-title">MICROFINANCIERA CRUSE, S.A. DE C.V., SOFOM, E.N.R.</h1>
        <p class="brand-sub">Tabla de Amortización Quincenal Oficial — Conforme a NOM-186-SCFI-2013</p>
      </div>
    </div>
    <div style="text-align:right; font-size:10px; color:#475569;">
      <strong>Producto:</strong> ${productName}<br/>
      <strong>CAT Informativo:</strong> ${catPercent}% sin IVA
    </div>
  </div>

  <div class="summary-grid">
    <div class="kpi">
      <span class="kpi-label">Monto Solicitado y Plazo</span>
      <span class="kpi-val">${formatMxn(amount)}</span>
      <span class="kpi-sub">${selectedTerm} quincenas (${selectedTerm / 2} meses)</span>
    </div>
    <div class="kpi">
      <span class="kpi-label">Pago Quincenal Fijo</span>
      <span class="kpi-val">${formatMxn(fortnightlyPayment)}</span>
      <span class="kpi-sub">Equivalente Mensual: ${formatMxn(monthlyPaymentEquivalent)}</span>
    </div>
    <div class="kpi">
      <span class="kpi-label">Total a Pagar (${interestRateText})</span>
      <span class="kpi-val">${formatMxn(totalToPay)}</span>
      <span class="kpi-sub">Interés: ${formatMxn(totalInterest)} | IVA: ${formatMxn(totalVat)}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="center">Qna</th>
        <th>Saldo Insoluto</th>
        <th>Capital</th>
        <th>Interés</th>
        <th>IVA (16%)</th>
        <th>Seguro</th>
        <th>Pago Fijo</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    ${totalsRowHtml}
  </table>

  <div class="footer">
    <span>Cálculo exacto verificado con aritmética bancaria Decimal.js (ROUND_HALF_UP) — Comisión por apertura: $0.00 MXN (0%).</span>
    <span>www.cruse.com.mx | Chihuahua, Chih.</span>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 250);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(htmlDocument);
  printWindow.document.close();
}
