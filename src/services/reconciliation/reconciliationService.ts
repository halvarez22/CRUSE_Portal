import { parsePayrollCsv } from './payrollFileParser';
import { validateAndPrepareRows } from './reconciliationValidator';
import { processReconciliationBatch, BatchProcessingResult } from './reconciliationEngine';
import { db } from '../db/connectionPool';
import { UserRole } from '../../types';

export async function processPayrollFile(
  csvContent: string,
  agreementName: string,
  fortnightPeriod: string,
  officerEmail: string,
  officerRole: UserRole
): Promise<BatchProcessingResult> {
  const agreement = await db.query<{ payroll_layout: string }>(
    'SELECT payroll_layout FROM convenios WHERE code = $1 AND active = 1',
    [agreementName]
  );
  if (agreement.rowCount === 0 || !agreement.rows[0]) {
    throw new Error(`Convenio '${agreementName}' no encontrado o inactivo.`);
  }

  const rawRows = parsePayrollCsv(csvContent, agreement.rows[0].payroll_layout);
  const preparedRows = await validateAndPrepareRows(rawRows);

  return processReconciliationBatch(
    agreementName,
    fortnightPeriod,
    officerEmail,
    officerRole,
    preparedRows
  );
}
