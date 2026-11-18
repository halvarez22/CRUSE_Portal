/**
 * CANDADO TRANSACCIONAL PRE-ROLLBACK DE INTEGRIDAD REFERENCIAL (FASE 3.3)
 * Expediente: CRUSE-APO-2026-067 (Guardrails Forenses 4 y 8)
 *
 * Bloquea con HTTP 409 Conflict y evento WORM `MIGRATION_ROLLBACK_BLOCKED_POST_ACTIVITY`
 * cualquier intento de rollback si `PRODUCTION_CUTOVER_ACTIVE` está activo o si existen
 * transacciones posteriores dependientes sobre los contratos del lote.
 */

import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { UserRole } from '../../types';

export class MigrationRollbackBlockedError extends Error {
  public readonly statusCode = 409;
  public readonly blockingReason: string;
  public readonly dependentTransactions: Record<string, number>;

  constructor(
    message: string,
    blockingReason: string,
    dependentTransactions: Record<string, number>
  ) {
    super(message);
    this.name = 'MigrationRollbackBlockedError';
    this.blockingReason = blockingReason;
    this.dependentTransactions = dependentTransactions;
  }
}

export async function assertMigrationRollbackAllowed(params: {
  batchId: string;
  batchCode: string;
  batchCreatedAt: string;
  actorEmail: string;
  actorRole?: UserRole | 'sistema';
  sourceIp?: string;
  sourceSummary?: string;
}): Promise<void> {
  const cutoverRes = await db.query<{
    param_numeric_value: number | string | null;
    param_text_value: string | null;
  }>(
    `SELECT param_numeric_value, param_text_value
     FROM system_financial_parameters
     WHERE param_key = 'CLOUD_MIGRATION_CUTOVER_ACTIVE'`
  );

  const cutoverActive =
    Number(cutoverRes.rows[0]?.param_numeric_value ?? 0) === 1 ||
    cutoverRes.rows[0]?.param_text_value === 'PRODUCTION_CUTOVER_ACTIVE';

  const contractsRes = await db.query<{ legacy_contract_number: string }>(
    `SELECT legacy_contract_number FROM cleaned_migrated_portfolio WHERE batch_id = $1`,
    [params.batchId]
  );
  const contractNumbers = contractsRes.rows.map((r) => r.legacy_contract_number).filter(Boolean);

  let loanPaymentApplications = 0;
  let loanRestructures = 0;
  let operationalNotes = 0;
  let investmentCapitalMovements = 0;

  for (const contractNum of contractNumbers) {
    const pmtRes = await db.query<{ cnt: number | string }>(
      `SELECT COUNT(*) AS cnt
       FROM loan_payment_applications lpa
       JOIN loan_accounts la ON la.id = lpa.loan_account_id
       WHERE la.contract_number = $1 AND lpa.created_at >= $2`,
      [contractNum, params.batchCreatedAt]
    );
    loanPaymentApplications += Number(pmtRes.rows[0]?.cnt ?? 0);

    const restRes = await db.query<{ cnt: number | string }>(
      `SELECT COUNT(*) AS cnt
       FROM loan_restructures lr
       JOIN loan_accounts la ON (la.id = lr.previous_loan_id OR la.id = lr.new_loan_id)
       WHERE la.contract_number = $1 AND lr.restructured_at >= $2`,
      [contractNum, params.batchCreatedAt]
    );
    loanRestructures += Number(restRes.rows[0]?.cnt ?? 0);

    const noteRes = await db.query<{ cnt: number | string }>(
      `SELECT COUNT(*) AS cnt
       FROM operational_notes n
       JOIN loan_accounts la ON la.id = n.entity_id
       WHERE n.entity_type = 'LOAN_ACCOUNT' AND la.contract_number = $1 AND n.created_at >= $2`,
      [contractNum, params.batchCreatedAt]
    );
    operationalNotes += Number(noteRes.rows[0]?.cnt ?? 0);
  }

  if (contractNumbers.length > 0) {
    const capMovRes = await db.query<{ cnt: number | string }>(
      `SELECT COUNT(*) AS cnt FROM investment_capital_movements WHERE created_at >= $1`,
      [params.batchCreatedAt]
    );
    investmentCapitalMovements = Number(capMovRes.rows[0]?.cnt ?? 0);
  }

  const totalDependentOps =
    loanPaymentApplications + loanRestructures + operationalNotes + investmentCapitalMovements;

  if (!cutoverActive && totalDependentOps === 0) {
    return;
  }

  const dependentTransactions = {
    loanPaymentApplications,
    loanRestructures,
    operationalNotes,
    investmentCapitalMovements,
  };
  const blockingReason = cutoverActive
    ? 'PRODUCTION_CUTOVER_ACTIVE'
    : 'DEPENDENT_POST_MIGRATION_TRANSACTIONS_DETECTED';

  await auditEventStore.append({
    actorEmail: params.actorEmail,
    actorRole: params.actorRole ?? 'admin',
    action: 'MIGRATION_ROLLBACK_BLOCKED_POST_ACTIVITY',
    outcome: 'denied',
    sourceIp: params.sourceIp ?? '127.0.0.1',
    sourceSummary: params.sourceSummary ?? 'cloudMigrationRollbackGuard',
    details: JSON.stringify({
      batchId: params.batchId,
      batchCode: params.batchCode,
      blockingReason,
      cutoverActive,
      dependentTransactions,
    }),
  });

  throw new MigrationRollbackBlockedError(
    cutoverActive
      ? `BLOQUEO DE INTEGRIDAD REFERENCIAL (HTTP 409): No se puede ejecutar rollback instantáneo sobre '${params.batchCode}' porque el corte productivo (PRODUCTION_CUTOVER_ACTIVE) está activo.`
      : `BLOQUEO DE INTEGRIDAD REFERENCIAL (HTTP 409): El lote '${params.batchCode}' tiene ${totalDependentOps} transacción(es) posteriores dependientes. Usa pólizas de ajuste contable individual.`,
    blockingReason,
    dependentTransactions
  );
}
