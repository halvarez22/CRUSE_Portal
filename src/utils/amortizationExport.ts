/**
 * Utilidad pura de exportación de Tabla de Amortización Oficial (Excel .xlsx y PDF / Impresión Vectorial).
 * Cumple con Guardrail 1 (Cero dependencias pesadas de PDF), Guardrail 2 (Valores Decimal.js pre-calculados)
 * y Guardrail 3 (Módulo 100% puro sin imports de React ni estado global).
 */
import * as XLSX from 'xlsx';
import { AmortizationRow } from '../types';

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

const formatMxn = (val: number): string =>
  `$${val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

/**
 * Genera y descarga un archivo Excel (.xlsx) nativo con la ficha resumen y la tabla completa de amortización.
 */
export function exportAmortizationToExcel(params: AmortizationExportParams): void {
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

  const summaryRows: (string | number)[][] = [
    ['MICROFINANCIERA CRUSE, S.A. DE C.V., SOFOM, E.N.R.'],
    ['TABLA DE AMORTIZACIÓN QUINCENAL OFICIAL — CONFORME A NOM-186-SCFI-2013'],
    [],
    ['Producto Financiero', productName],
    ['Monto Solicitado (MXN)', amount],
    ['Plazo Contratado', `${selectedTerm} quincenas (${selectedTerm / 2} meses)`],
    ['Tasa de Interés Ordinaria', interestRateText],
    ['Pago Quincenal Fijo (MXN)', fortnightlyPayment],
    ['Importe Mensual Equivalente (2 Quincenas MXN)', monthlyPaymentEquivalent],
    ['Total de Intereses Calculados (MXN)', totalInterest],
    ['IVA sobre Intereses 16% (MXN)', totalVat],
    ['Total Seguro de Vida Institucional (MXN)', totalInsurance],
    ['Comisión por Apertura', '$0.00 MXN (0%)'],
    ['Monto Total a Pagar (MXN)', totalToPay],
    ['CAT Promedio Ponderado Informativo', `${catPercent}% sin IVA`],
    [],
    [
      'Quincena',
      'Saldo Insoluto (MXN)',
      'Capital (MXN)',
      'Interés (MXN)',
      'IVA 16% (MXN)',
      'Seguro (MXN)',
      'Pago Fijo Quincenal (MXN)',
    ],
  ];

  const scheduleRows: (string | number)[][] = schedule.map((row) => [
    row.period,
    Number(row.balance),
    Number(row.capital),
    Number(row.interest),
    Number(row.vat),
    Number(row.insurance),
    Number(row.payment),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([...summaryRows, ...scheduleRows]);
  worksheet['!cols'] = [
    { wch: 36 },
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 24 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Tabla_Amortizacion');

  const safeProductSlug = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const fileName = `CRUSE_Amortizacion_${safeProductSlug}_${amount}MXN_${selectedTerm}Q.xlsx`;

  XLSX.writeFile(workbook, fileName);
}

/**
 * Abre una vista vectorial con diseño institucional CRUSE y dispara el diálogo nativo de impresión/guardado PDF.
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
          <td class="num">$${row.balance}</td>
          <td class="num emerald">$${row.capital}</td>
          <td class="num blue">$${row.interest}</td>
          <td class="num">$${row.vat}</td>
          <td class="num">$${row.insurance}</td>
          <td class="num bold">$${row.payment}</td>
        </tr>`
    )
    .join('');

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
      <img src="/CRUSE_LOGO.png" alt="Microfinanciera Cruse" onerror="this.style.display='none'" />
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
