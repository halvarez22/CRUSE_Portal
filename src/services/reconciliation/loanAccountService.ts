import { db, TxHandle } from '../db/connectionPool';
import { calculateSimulation } from '../../config/financialConstants';
import { auditEventStore } from '../audit/auditEventStore';
import { ProductId } from '../../types';

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
    
    // 3. Insertar en loan_accounts
    tx.execute(`
      INSERT INTO loan_accounts (
        expediente_id, principal_original, fortnightly_payment, first_deduction_period, activated_at, activated_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      exp.id, 
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
