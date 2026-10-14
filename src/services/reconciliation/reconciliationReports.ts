/**
 * GENERADOR DE ACTAS OFICIALES Y LAYOUTS SIF/CIB (LOGIC SYSTEMS)
 * Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
 *
 * Cumplimiento:
 * - Regla 2 (HRU): Formatos institucionales y estandarizados.
 * - Regla 3: Archivo modular < 300 líneas.
 * - Expediente: CRUSE-APO-2026-004
 */

import { ReconciliationBatch, ReconciliationItem, ReconciliationProcessResult } from '../../types';
import { COMPANY_INFO } from '../../data/cruseData';

/**
 * Genera el Acta Oficial de Conciliación Quincenal con Sello Criptográfico
 * Lista para impresión, firma y archivo regulatorio (CNBV / CONDUSEF / UNE).
 */
export function generateSignedReconciliationActa(
  batch: ReconciliationBatch,
  summary: ReconciliationProcessResult['summary']
): string {
  const dateFormatted = new Date(batch.createdAt).toLocaleString('es-MX', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const divider = '═'.repeat(80);
  const subDivider = '─'.repeat(80);

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
• Total de Registros Auditados:          ${summary.totalRecords} trabajadores
• Importe Total Retenido Recibido:       $${summary.totalReceived.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
• Importe Total Cuotas Esperadas:        $${summary.totalExpected.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
• Discrepancia Neta Consolidada:         $${summary.netDifference.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
• Estatus Regulatorio del Lote:          ${batch.status.toUpperCase()}

${subDivider}
II. DESGLOSE DETERMINISTA DE PARTIDAS (MATRIZ 4 ESTADOS)
${subDivider}
1. Retenciones Exactas (MATCH_EXACT):           ${summary.matchExactCount} casos
   - Conciliación al 100% de cuotas de amortización según tabla financiera.
2. Retenciones Parciales (UNDERPAYMENT):        ${summary.underpaymentCount} casos
   - Aplicación en cascada regulatoria: Seguro de Vida ($22.85) -> Intereses -> IVA -> Capital.
3. Bajas No Reportadas (MISSING_IN_PAYROLL):    ${summary.missingInPayrollCount} casos
   - ALERTA: Créditos activos sin retención gubernamental remitida.
4. Excedentes / No Identificados (OVERPAYMENT): ${summary.overpaymentCount} casos
   - Saldo a favor en custodia o aclaración con Recursos Humanos.

${subDivider}
III. CONSTANCIA DE BLINDAJE CRIPTOGRÁFICO Y BITÁCORA WORM
${subDivider}
El presente lote ha sido sellado criptográficamente mediante algoritmo SHA-256
y asentado de forma inmutable en la bitácora relacional de Microfinanciera Cruse:

SELLO MANIFIESTO SHA-256:
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
