/**
 * UTILIDAD DE FORMATEO DECIMAL DETERMINISTA Y EXPORTACIÓN SEGURA A EXCEL (.CSV UTF-8 BOM)
 * PARA EL BUZÓN DE PRE-SOLICITUDES
 *
 * @implements CRUSE-APO-2026-045 (Evidencia Forense #3)
 * @implements Regla 2 HRU (100% Decimal.js, Cero Punto Flotante)
 */

import Decimal from 'decimal.js';
import { PreApplicationSummaryItem } from '../types';

export function formatExactMxn(rawValue: number | string | null | undefined): string {
  const cleaned = String(rawValue ?? '0.00')
    .trim()
    .replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') {
    return '0.00';
  }
  try {
    return new Decimal(cleaned)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2);
  } catch {
    return '0.00';
  }
}

export function escapeCsvFormulaSafeCell(raw: string | null | undefined): string {
  const clean = String(raw ?? '').replace(/\r?\n/g, ' ').trim();
  const safeFormula = /^[=+\-@]/.test(clean) ? `'${clean}` : clean;
  return `"${safeFormula.replace(/"/g, '""')}"`;
}

export function exportPreApplicationsToExcelCsv(
  items: ReadonlyArray<PreApplicationSummaryItem>,
  statusFilterLabel = 'ALL'
): void {
  const headers = [
    'Folio Pre-Solicitud',
    'Fecha y Hora Registro',
    'Estatus Buzón',
    'Solicitante (Protegido)',
    'Teléfono (Protegido)',
    'Correo (Protegido)',
    'Dependencia / Convenio',
    'Producto',
    'Monto Solicitado (MXN)',
    'Plazo (Quincenas)',
    'Descuento Quincenal (MXN)',
    'Total a Pagar (MXN)',
    'CAT (%)',
    'Leído Por',
    'Atendido Por',
    'Notas de Seguimiento Promotor',
  ];

  const rows = items.map((item) => {
    const formattedDate = item.createdAt
      ? new Date(item.createdAt).toLocaleString('es-MX')
      : 'SIN FECHA';
    return [
      escapeCsvFormulaSafeCell(item.folio),
      escapeCsvFormulaSafeCell(formattedDate),
      escapeCsvFormulaSafeCell(item.inboxStatus),
      escapeCsvFormulaSafeCell(item.applicantNameMasked),
      escapeCsvFormulaSafeCell(item.phoneMasked),
      escapeCsvFormulaSafeCell(item.emailMasked),
      escapeCsvFormulaSafeCell(item.convenio),
      escapeCsvFormulaSafeCell(item.productName),
      formatExactMxn(item.requestedAmountMxn),
      String(item.termFortnights),
      formatExactMxn(item.fortnightlyPaymentMxn),
      formatExactMxn(item.totalToPayMxn),
      formatExactMxn(item.catPercent),
      escapeCsvFormulaSafeCell(item.readByEmail || '—'),
      escapeCsvFormulaSafeCell(item.attendedByEmail || '—'),
      escapeCsvFormulaSafeCell(item.promoterNotes || '—'),
    ].join(',');
  });

  const csvContent = [headers.map((h) => `"${h}"`).join(','), ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = statusFilterLabel.toLowerCase();
  const dateSlug = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `CRUSE_Buzon_PreSolicitudes_${slug}_${dateSlug}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
