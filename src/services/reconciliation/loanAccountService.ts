import { db } from '../db/connectionPool';
import { calculateSimulation } from '../../config/financialConstants';
import { auditEventStore } from '../audit/auditEventStore';
import { ProductId, UserRole } from '../../types';
import crypto from 'crypto';

export interface ActivateResult {
  success: boolean;
  expedienteId: string;
}

interface ExpedienteRowForActivation {
  id: string;
  status: string;
  requested_amount: number;
  term_fortnights: number;
  product_type: string;
}

export async function activateLoanAccount(
  expedienteId: string,
  firstDeductionPeriod: string,
  actorEmail: string,
  actorRole: UserRole
): Promise<ActivateResult> {
  return db.transaction(async (tx) => {
    const res = await tx.query<ExpedienteRowForActivation>(
      'SELECT id, status, requested_amount, term_fortnights, product_type FROM expedientes WHERE id = $1',
      [expedienteId]
    );
    if (res.rowCount === 0 || !res.rows[0]) {
      throw new Error(`Expediente ${expedienteId} no encontrado`);
    }
    const exp = res.rows[0];

    if (exp.status !== 'aprobado' && exp.status !== 'capturado') {
      throw new Error(
        `El expediente debe estar capturado o aprobado para activarse. Estado actual: ${exp.status}`
      );
    }

    const sim = calculateSimulation(
      Number(exp.requested_amount),
      Number(exp.term_fortnights),
      exp.product_type as ProductId
    );

    const loanAccountId = `la_${crypto.randomUUID()}`;
    const countRes = await tx.query<{ total: number }>('SELECT COUNT(*) AS total FROM loan_accounts');
    const nextSeq = Number(countRes.rows[0]?.total ?? 0) + 1;
    const year = new Date().getFullYear();
    const contractNumber = `CNT-${year}-${String(nextSeq).padStart(4, '0')}`;

    await tx.execute(
      `INSERT INTO loan_accounts (
        id, contract_number, expediente_id, principal_original, current_principal_balance, fortnightly_payment, first_deduction_period, activated_at, activated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        loanAccountId,
        contractNumber,
        exp.id,
        Number(exp.requested_amount),
        Number(exp.requested_amount),
        sim.fortnightlyPayment,
        firstDeductionPeriod,
        new Date().toISOString(),
        actorEmail,
      ]
    );

    await tx.execute(`UPDATE expedientes SET status = 'activo', updated_at = $1 WHERE id = $2`, [
      new Date().toISOString(),
      exp.id,
    ]);

    await auditEventStore.appendInTx(tx, {
      action: 'EXPEDIENTE_ACTIVATE',
      actorEmail,
      actorRole,
      outcome: 'success',
      sourceIp: '127.0.0.1',
      sourceSummary: 'loanAccountService',
      expedienteId: exp.id,
      details: `Expediente activado. Primera quincena: ${firstDeductionPeriod}. Cuota: ${sim.fortnightlyPayment}`,
    });

    return { success: true, expedienteId: exp.id };
  });
}
