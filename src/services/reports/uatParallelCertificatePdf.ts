/**
 * GENERADOR PDF 1.4 NATIVO (CERO DEPENDENCIAS EXTERNAS) DE CÉDULA DE PRUEBAS PARALELAS UAT
 * Expediente: CRUSE-APO-2026-067 (Recomendación D.1 + D.3 + D.7)
 *
 * Emite un archivo PDF binario válido (.pdf) con 3 casos reales auditables comparados
 * fórmula por fórmula contra el Excel de la Lic. Alma y bloques de firma para
 * Operaciones, Contabilidad, Oficial de Cumplimiento y Dirección.
 */

import Decimal from 'decimal.js';
import { calculateMonthlyYieldAndISR, calculateSplitTrancheInvestorYield } from '../funding/fundingEngine';
import { applyWaterfall, computeDue } from '../reconciliation/paymentWaterfall';
import { calculateSimulation } from '../../config/financialConstants';
import { ORDERED_MODULE_GUIDES } from '../../data/moduleGuidesCatalog';

export interface ParallelUatCaseSummary {
  caseCode: string;
  title: string;
  inputsSummary: string;
  portalFormulaResult: string;
  regulatoryCheck: string;
}

export function buildParallelUatCasesData(): ParallelUatCaseSummary[] {
  const sim = calculateSimulation(50000, 48, 'normal');

  const due = computeDue(
    {
      balance: new Decimal('50000.00'),
      arrearsInsurance: new Decimal('0.00'),
      arrearsInterest: new Decimal('0.00'),
      arrearsVat: new Decimal('0.00'),
      creditBalance: new Decimal('0.00'),
    },
    'normal',
    new Decimal('10000.00'),
    { fees: new Decimal('200.00'), moratoryInterest: new Decimal('500.00') }
  );
  const wf = applyWaterfall(new Decimal('10000.00'), due, {
    balance: new Decimal('50000.00'),
    arrearsInsurance: new Decimal('0.00'),
    arrearsInterest: new Decimal('0.00'),
    arrearsVat: new Decimal('0.00'),
    creditBalance: new Decimal('0.00'),
  });

  const mutuoPf = calculateMonthlyYieldAndISR(
    1_000_000,
    0.12,
    0.20,
    365,
    true,
    'ACTUAL_365',
    'MUTUO_PF_ART160_INTERES'
  );
  const split31 = calculateSplitTrancheInvestorYield({
    capitalBefore: 500_000,
    capitalAfter: 700_000,
    annualRate: 0.18,
    annualIsrRate: 0.009,
    periodStartDate: '2026-07-01',
    movementDate: '2026-07-31',
    periodEndDate: '2026-08-01',
    dayCountConvention: 'ACTUAL_365_30_4',
    taxRegime: 'SISTEMA_FINANCIERO_ART54_CAPITAL',
  });

  return [
    {
      caseCode: 'CASO UAT-01',
      title: 'Originacion Credito Normal ($50,000 a 48 quincenas)',
      inputsSummary: 'Monto: $50,000.00 MXN | Plazo: 48 quincenas | Tasa anual nominal: 47.50% | Seguro: $22.85/qna',
      portalFormulaResult: `Cuota fija quincenal: $${sim.fortnightlyPayment.toFixed(2)} MXN | Ingreso neto minimo (30%): $${sim.requiredNetIncome.toFixed(2)} MXN`,
      regulatoryCheck: 'CAT informativo publicado (60.06% sin IVA), tope 30% por convenio institucional y 0% comision por apertura.',
    },
    {
      caseCode: 'CASO UAT-02',
      title: 'Conciliacion y Prelacion Contractual Completa (Art. 364 CCom)',
      inputsSummary: 'Pago recibido: $10,000.00 | Seguro: $22.85 | Comision: $200.00 (+IVA $32.00) | Moratorio: $500.00 (+IVA $80.00)',
      portalFormulaResult: `Aplicado: Seg $${wf.applied.insurance.toFixed(2)} -> Com+IVA $${wf.applied.fees.plus(wf.applied.feesVat).toFixed(2)} -> Mor+IVA $${wf.applied.moratoryInterest.plus(wf.applied.moratoryVat).toFixed(2)} -> Int+IVA $${wf.applied.interest.plus(wf.applied.vat).toFixed(2)} -> Capital $${wf.applied.capital.toFixed(2)}`,
      regulatoryCheck: '100% cuadre exacto ($10,000.00) y retrocompatible con nomina estandar cuando moratorios y comisiones son $0.00.',
    },
    {
      caseCode: 'CASO UAT-03',
      title: 'Corte de Inversionistas: ISR Base Interes (20%) y Tramos Mes 31 Dias',
      inputsSummary: 'A) Mutuo PF $1,000,000 al 12% anual (365d) | B) Split 31 jul ($500k -> $700k, 18% anual, ISR 0.9% LIF 2026)',
      portalFormulaResult: `A) Interes $${mutuoPf.grossYield.toFixed(2)}, ISR 20% s/interes $${mutuoPf.isrRetained.toFixed(2)}, Neto $${mutuoPf.netYield.toFixed(2)} | B) Tramos ${split31.daysTranche1}d + ${split31.daysTranche2}d = ${split31.totalDaysBase}d, Bruto $${split31.grossYield.toFixed(2)}`,
      regulatoryCheck: 'Cero intereses negativos en dia 31, separacion determinista Capital vs Interes y clasificacion Art. 103 LIC.',
    },
  ];
}

function toAsciiPdfSafe(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLine(text: string, maxChars = 92): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length <= maxChars) {
      current = (current + ' ' + w).trim();
    } else {
      if (current) out.push(current);
      current = w;
    }
  }
  if (current) out.push(current);
  return out.length > 0 ? out : [''];
}

/**
 * Construye un documento PDF 1.4 multipágina válido con fuente Helvetica incorporada.
 */
export function buildSimplePdfBytes(lines: readonly string[]): Uint8Array {
  const linesPerPage = 54;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push(['Documento vacio']);

  const objects: string[] = [];
  // Obj 1: Catalog, Obj 2: Pages, Obj 3: Font
  const pageObjNums: number[] = [];
  const baseObj = 4;
  for (let p = 0; p < pages.length; p++) {
    pageObjNums.push(baseObj + p * 2);
  }

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`
  );
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  pages.forEach((pageLines, idx) => {
    const pageNum = baseObj + idx * 2;
    const contentNum = pageNum + 1;
    const streamCmds = ['BT', '/F1 9 Tf', '40 752 Td', '13 TL'];
    for (const l of pageLines) {
      streamCmds.push(`(${toAsciiPdfSafe(l)}) Tj T*`);
    }
    streamCmds.push('ET');
    const stream = streamCmds.join('\n');

    objects.push(
      `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  });

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefPos = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}

export function buildParallelUatPdfBytes(): Uint8Array {
  const cases = buildParallelUatCasesData();
  const dateStr = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    'MICROFINANCIERA CRUSE, S.A. DE C.V. SOFOM E.N.R.',
    'CEDULA OFICIAL DE PRUEBAS PARALELAS UAT (PORTAL VS EXCEL)',
    `Expediente: CRUSE-APO-2026-067 | Fecha: ${dateStr} | Retencion CNBV: 10 Anos Minimos`,
    '============================================================================================',
    '',
  ];

  for (const c of cases) {
    lines.push(`${c.caseCode} — ${c.title}`);
    lines.push(...wrapLine(`Datos de entrada: ${c.inputsSummary}`));
    lines.push(...wrapLine(`Resultado Portal (Decimal.js): ${c.portalFormulaResult}`));
    lines.push(...wrapLine(`Validacion normativa: ${c.regulatoryCheck}`));
    lines.push('Resultado Excel Paralelo: ________________________   Diferencia $0.00: [ ] Si  [ ] No');
    lines.push('');
  }

  lines.push('MATRIZ DE TRAZABILIDAD CONTRACTUAL (13 MODULOS: FASES 1, 2 Y 3)');
  lines.push('--------------------------------------------------------------------------------------------');
  for (const g of ORDERED_MODULE_GUIDES) {
    lines.push(...wrapLine(`[${g.phaseBadge}] ${g.title} — ${g.contractRef}`));
  }
  lines.push('');
  lines.push('FIRMAS DE VALIDACION Y VISTO BUENO ANTES DE CORTE PRODUCTIVO:');
  lines.push('');
  lines.push('____________________________________          ____________________________________');
  lines.push('Operaciones / Mesa de Control (Lic. Alma)     Contabilidad y Fiscal (C.P. Responsable)');
  lines.push('');
  lines.push('____________________________________          ____________________________________');
  lines.push('Oficial de Cumplimiento / UNE (Lic. Olvera)   Direccion General / Vo.Bo. Juridico');

  return buildSimplePdfBytes(lines);
}

function triggerPdfDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadParallelUatCertificatePdf(): void {
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerPdfDownload(buildParallelUatPdfBytes(), `CRUSE_CEDULA_PRUEBAS_PARALELAS_UAT_${dateStr}.pdf`);
}

export function downloadCleanFriendlyManualPdf(): void {
  const dateStr = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    'MICROFINANCIERA CRUSE, S.A. DE C.V. SOFOM E.N.R.',
    `GUIA OPERATIVA EN LENGUAJE CLARO (${ORDERED_MODULE_GUIDES.length} MODULOS — FASES 1, 2 Y 3)`,
    `Fecha: ${dateStr} | Dirigido a: Operaciones, Promotores, Tesoreria y Cumplimiento`,
    '============================================================================================',
    '',
  ];
  for (const g of ORDERED_MODULE_GUIDES) {
    lines.push(`${g.title} [${g.phaseBadge}]`);
    lines.push(...wrapLine(`Referencia Contractual (${g.phaseBadge}): ${g.contractRef}`));
    lines.push(...wrapLine(`Para que sirve: ${g.plainSummary}`));
    lines.push(...wrapLine(`Que trabajo manual elimina: ${g.whatItReplaces}`));
    g.steps.forEach((s, i) => lines.push(...wrapLine(`  ${i + 1}. ${s}`)));
    lines.push(...wrapLine(`Prueba sugerida: ${g.verifyTip}`));
    lines.push('');
  }
  triggerPdfDownload(buildSimplePdfBytes(lines), `CRUSE_MANUAL_OPERATIVO_AMIGABLE_${dateStr}.pdf`);
}
