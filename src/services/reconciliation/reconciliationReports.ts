/**
 * GENERADOR DE ACTAS OFICIALES, LAYOUTS SIF/CIB (LOGIC SYSTEMS) Y EMISIÓN SINDICAL DE DESCUENTO
 * Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
 *
 * @implements CRUSE-APO-2026-026 (Emisión de Layout Sindical RN-07 con marcador "SUSPENSION" y Acta con sourceFileHash SHA-256)
 */

import {
  PayrollEmissionRow,
  ReconciliationBatch,
  ReconciliationItem,
  ReconciliationProcessResult,
} from '../../types';
import { COMPANY_INFO } from '../../data/cruseData';

/**
 * Genera el Acta Oficial de Conciliación Quincenal con Sello Criptográfico Doble
 * (Archivo Fuente SHA-256 + Manifiesto WORM SHA-256).
 */
export function generateSignedReconciliationActa(
  batch: ReconciliationBatch,
  summary: ReconciliationProcessResult['summary'],
  sourceFileHash?: string
): string {
  const dateFormatted = new Date(batch.createdAt).toLocaleString('es-MX', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const divider = '═'.repeat(80);
  const subDivider = '─'.repeat(80);
  const resolvedSourceHash = sourceFileHash || batch.sourceFileHash || 'LOTE_DETERMINISTA_INTERNO';

  return `${divider}
                 ${COMPANY_INFO.name.toUpperCase()}
           SOCIEDAD FINANCIERA DE OBJETO MÚLTIPLE, ENTIDAD NO REGULADA
               UNIDAD ESPECIALIZADA DE ATENCIÓN A USUARIOS (UNE)
${divider}

ACTA OFICIAL DE CONCILIACIÓN QUINCENAL DE RETENCIONES DE NÓMINA
FOLIO DE CONTROL: ${batch.id}
FECHA Y HORA DE EMISIÓN: ${dateFormatted}
CONVENIO COLECTIVO: ${batch.agreementName}
PERIODO QUINCENAL AUDITADO: ${batch.fortnightPeriod}
OFICIAL RESPONSABLE: ${batch.officerEmail} (${COMPANY_INFO.uneContact.title})

${subDivider}
I. RESUMEN EJECUTIVO Y TOTALES AUDITADOS
${subDivider}
• Total de Registros Auditados:          ${summary.totalRecords} partidas
• Importe Total Retenido Recibido:       $${summary.totalReceived.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
• Importe Total Cuotas Esperadas:        $${summary.totalExpected.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
• Discrepancia Neta Consolidada:         $${summary.netDifference.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
• Estatus Regulatorio del Lote:          ${batch.status.toUpperCase()}

${subDivider}
II. DESGLOSE DETERMINISTA DE PARTIDAS (MATRIZ REGULATORIA)
${subDivider}
1. Retenciones Exactas (MATCH_EXACT):              ${summary.matchExactCount} casos
   - Conciliación al 100% de cuotas de amortización según tabla financiera.
2. Retenciones Parciales (UNDERPAYMENT):           ${summary.underpaymentCount} casos
   - Aplicación en cascada regulatoria: Seguro ($22.85) -> Intereses -> IVA -> Capital.
3. Bajas / Omisiones (MISSING_IN_PAYROLL):         ${summary.missingInPayrollCount} casos
   - ALERTA: Créditos activos sin retención gubernamental remitida.
4. Excedentes (OVERPAYMENT):                       ${summary.overpaymentCount} casos
   - Abono extraordinario a capital o saldo a favor en custodia.
5. Licencias sin Goce (SUSPENDED_IN_PAYROLL RN-07): ${summary.suspendedInPayrollCount ?? 0} casos
   - Pausa temporal autorizada sin generación de intereses moratorios.
6. No Vinculados en Cartera (NOT_IN_PORTFOLIO):    ${summary.notInPortfolioCount ?? 0} casos

${subDivider}
III. CONSTANCIA DE BLINDAJE CRIPTOGRÁFICO Y BITÁCORA WORM
${subDivider}
El presente lote ha sido sellado criptográficamente mediante algoritmo SHA-256
y asentado de forma inmutable en la bitácora relacional de Microfinanciera Cruse:

HASH SHA-256 DEL ARCHIVO FUENTE DE RETENCIÓN:
${resolvedSourceHash}

SELLO MANIFIESTO WORM SHA-256:
${batch.batchManifestHash}

ALMACENAMIENTO WORM:
- Tabla: reconciliation_batches (ID: ${batch.id})
- Bitácora CNBV: audit_events (Acción: RECONCILIATION_BATCH_SEALED)
- Cumplimiento: Art. 95 Bis LGOAAC y Ley Federal de Protección de Datos Personales (LFPDPPP).

${subDivider}
IV. FIRMAS DE VALIDEZ INSTITUCIONAL
${subDivider}


__________________________________________           __________________________________________
${COMPANY_INFO.uneContact.title}                      Dirección General
Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.    Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
Sede Central: Vía Citadela #5710 Int. 401, Chih.    ${COMPANY_INFO.uneContact.email}

${divider}
`;
}

/**
 * Genera el archivo Layout CSV compatible con Logic Systems (SIF / CIB Core Banking)
 */
export function generateSifLogicSystemsCsv(
  batch: ReconciliationBatch,
  items: ReconciliationItem[]
): string {
  const headers = [
    'BATCH_ID',
    'PERIODO',
    'CONVENIO',
    'ID_EXPEDIENTE',
    'NUMERO_CONTRATO',
    'CURP_ENMASCARADA',
    'NOMBRE_EMPLEADO',
    'CUOTA_ESPERADA',
    'RETENCION_APLICADA',
    'DIFERENCIA',
    'ESTATUS_CONCILIACION',
    'SELLO_MANIFIESTO',
  ];

  const escapeCsv = (val: string | number | undefined | null) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = items.map((item) =>
    [
      escapeCsv(batch.id),
      escapeCsv(batch.fortnightPeriod),
      escapeCsv(batch.agreementName),
      escapeCsv(item.expedienteId || 'NO_VINCULADO'),
      escapeCsv(item.contractNumber || 'S/C'),
      escapeCsv(item.curpMasked),
      escapeCsv(item.employeeName),
      item.expectedPayment.toFixed(2),
      item.actualPayment.toFixed(2),
      item.difference.toFixed(2),
      escapeCsv(item.status),
      escapeCsv(batch.batchManifestHash.slice(0, 16)),
    ].join(',')
  );

  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Genera el Layout Oficial de Emisión de Descuento Sindical / Dependencia
 * (M. EMISION MENSUAL / Q. CREDITOS ACTIVOS).
 * Los créditos en SUSPENDED_LEAVE llevan explícitamente la palabra "SUSPENSION" (RN-07).
 */
export function generateUnionDiscountEmissionCsv(
  agreementName: string,
  fortnightPeriod: string,
  rows: PayrollEmissionRow[]
): string {
  const headers = [
    'CONVENIO',
    'PERIODO',
    'OFICIO_1ER_PAGO',
    'NUMERO_CONTRATO',
    'CURP',
    'NOMBRE',
    'IMPORTE_RETENIDO',
    'SALDO_INSOLUTO_REFERENCIA',
  ];

  const escapeCsv = (val: string | number | undefined | null) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };

  const csvLines = rows.map((r) =>
    [
      escapeCsv(agreementName),
      escapeCsv(fortnightPeriod),
      escapeCsv(r.unionOfficialLetterNo),
      escapeCsv(r.contractNumber),
      escapeCsv(r.curpMasked),
      escapeCsv(r.maskedName),
      escapeCsv(r.expectedDeductionOrStatus),
      r.liveBalance,
    ].join(',')
  );

  return [headers.join(','), ...csvLines].join('\r\n');
}
