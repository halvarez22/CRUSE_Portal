import { db } from '../db/connectionPool';
import { kyselyBuilder, executeKyselyMutation } from '../db/kyselyConfig';
import { calculateMonthlyYieldAndISR } from './fundingEngine';
import { getDaysInMonth, endOfMonth } from 'date-fns';
import crypto from 'crypto';

export interface FundingCronResult {
  processed: number;
  skipped: number;
  totalGrossYield: number;
  totalIsrRetained: number;
}

/**
 * Ejecuta el corte mensual de fondeo (Idempotente).
 * Idealmente ejecutado los primeros 5 días hábiles del mes, pero recibe el mes objetivo.
 *
 * @param targetDate - Fecha que representa el mes a liquidar (ej. '2026-10-01')
 */
export async function runMonthlyFundingSettle(targetDate: Date): Promise<FundingCronResult> {
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth(); // 0-indexed
  
  // Usamos date-fns para precisión forense en el número de días del mes.
  const daysInMonth = getDaysInMonth(targetDate);
  const paymentDate = endOfMonth(targetDate).toISOString().split('T')[0];
  const referencePrefix = `FND-${year}-${(month + 1).toString().padStart(2, '0')}`;

  let processed = 0;
  let skipped = 0;
  let totalGrossYield = 0;
  let totalIsrRetained = 0;

  // Utilizamos una transacción completa para todo el proceso
  db.transaction((tx) => {
    // 1. Obtener todas las inversiones activas
    const activeInvestments = tx.query<{
      id: string;
      investor_id: string;
      capital: number;
      annual_rate: number;
      start_date: string;
      isr_retention_rate: number;
    }>(`
      SELECT inv.id, inv.investor_id, inv.capital, inv.annual_rate, inv.start_date, i.isr_retention_rate
      FROM investments inv
      JOIN investors i ON inv.investor_id = i.id
      WHERE inv.status = 'ACTIVE'
    `).rows;

    for (const inv of activeInvestments) {
      const referenceNumber = `${referencePrefix}-${inv.id}`;

      // 2. Control de Idempotencia: Verificar si ya existe un pago con esta referencia
      const existing = tx.query(
        `SELECT id FROM investor_payments WHERE reference_number = ?`,
        [referenceNumber]
      );

      if (existing.rowCount > 0) {
        skipped++;
        continue; // Ya procesado, omitir (Idempotente)
      }

      // TODO: Manejo de meses incompletos (si la start_date es a mitad de mes)
      // Por simplicidad del modelo base, asumimos meses completos o calculamos basado en el mes completo.
      // Para un sistema real se prorratearía. Según requerimientos, enviamos el mes completo.
      
      // 3. Motor Matemático
      const yieldResult = calculateMonthlyYieldAndISR(
        inv.capital,
        inv.annual_rate,
        inv.isr_retention_rate,
        daysInMonth
      );

      // 4. Inserción Atómica WORM
      const paymentId = `pmt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      
      const insertQuery = kyselyBuilder
        .insertInto('investor_payments')
        .values({
          id: paymentId,
          investor_id: inv.investor_id,
          investment_id: inv.id,
          payment_date: paymentDate,
          gross_yield: yieldResult.grossYield,
          isr_retained: yieldResult.isrRetained,
          net_paid: yieldResult.netYield,
          reference_number: referenceNumber,
        })
        .compile();

      // Ejecutar la mutación a través de tx.execute para mantener la transacción
      tx.execute(insertQuery.sql, insertQuery.parameters as any[]);

      processed++;
      totalGrossYield += yieldResult.grossYield;
      totalIsrRetained += yieldResult.isrRetained;
    }
  });

  return {
    processed,
    skipped,
    totalGrossYield,
    totalIsrRetained,
  };
}
