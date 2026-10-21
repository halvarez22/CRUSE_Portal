import { db, TxHandle } from '../db/connectionPool';
import { calculateSimulation } from '../../config/financialConstants';
import { auditEventStore } from '../audit/auditEventStore';
import { ProductId } from '../../types';
import crypto from 'crypto';

export interface ActivateResult {
  success: boolean;
  expedienteId: string;
}

export function activateLoanAccount(
  expedienteId: string, 
  firstDeductionPeriod: string, 
  actorEmail: string, 
  actorRole: string
): ActivateResult {
  return db.transaction(tx => {
    // 1. Obtener expediente
    const res = tx.query<any>('SELECT * FROM expedientes WHERE id = ?', [expedienteId]);
    if (res.rowCount === 0) {
      throw new Error(`Expediente ${expedienteId} no encontrado`);
    }
    const exp = res.rows[0];
    
    if (exp.status !== 'aprobado' && exp.status !== 'capturado') {
      throw new Error(`El expediente debe estar capturado o aprobado para activarse. Estado actual: ${exp.status}`);
    }

    // 2. Calcular cuota y principales
    const sim = calculateSimulation(exp.requested_amount, exp.term_fortnights, exp.product_type as ProductId);
    
    // 3. Insertar en loan_accounts (Modelo 3FN v4: id PK UUIDv4, contract_number canónico CNT-YYYY-%04d, expediente_id FK 1:N)
    const loanAccountId = `la_${crypto.randomUUID()}`;
    const countRes = tx.query<{ total: number }>('SELECT COUNT(*) AS total FROM loan_accounts');
    const nextSeq = (countRes.rows[0]?.total ?? 0) + 1;
    const year = new Date().getFullYear();
    const contractNumber = `CNT-${year}-${String(nextSeq).padStart(4, '0')}`;
    tx.execute(`
      INSERT INTO loan_accounts (
        id, contract_number, expediente_id, principal_original, current_principal_balance, fortnightly_payment, first_deduction_period, activated_at, activated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      loanAccountId,
      contractNumber,
      exp.id, 
      exp.requested_amount,
      exp.requested_amount,
      sim.fortnightlyPayment, 
      firstDeductionPeriod, 
      new Date().toISOString(), 
      actorEmail
    ]);

    // 4. Actualizar status del expediente
    tx.execute(`UPDATE expedientes SET status = 'activo', updated_at = ? WHERE id = ?`, [new Date().toISOString(), exp.id]);

    // 5. Auditoría
    auditEventStore.appendInTx(tx, {
      action: 'EXPEDIENTE_ACTIVATE',
      actorEmail,
      actorRole: actorRole as any,
      outcome: 'success',
      sourceIp: '127.0.0.1',
      sourceSummary: 'loanAccountService',
      expedienteId: exp.id,
      details: `Expediente activado. Primera quincena: ${firstDeductionPeriod}. Cuota: ${sim.fortnightlyPayment}`
    });

    return { success: true, expedienteId: exp.id };
  });
}
