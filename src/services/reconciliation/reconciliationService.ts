import { parsePayrollCsv } from './payrollFileParser';
import { validateAndPrepareRows } from './reconciliationValidator';
import { processReconciliationBatch, BatchProcessingResult } from './reconciliationEngine';
import { db } from '../db/connectionPool';

export async function processPayrollFile(
  csvContent: string,
  agreementName: string,
  fortnightPeriod: string,
  officerEmail: string,
  officerRole: string
): Promise<BatchProcessingResult> {
  // 1. Fase 1 (Asíncrona): Obtener layout, Parsear y Validar (Cero escrituras)
  const agreement = await db.query<{payroll_layout: string}>('SELECT payroll_layout FROM convenios WHERE code = ? AND active = 1', [agreementName]);
  if (agreement.rowCount === 0) {
    throw new Error(`Convenio '${agreementName}' no encontrado o inactivo.`);
  }

  const rawRows = parsePayrollCsv(csvContent, agreement.rows[0].payroll_layout);
  const preparedRows = await validateAndPrepareRows(rawRows);

  // 2. Fase 2 (Transaccional): Ejecución del lote y aplicación en cascada
  return processReconciliationBatch(
    agreementName,
    fortnightPeriod,
    officerEmail,
    officerRole,
    preparedRows
  );
}
