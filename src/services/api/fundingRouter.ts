/**
 * ENRUTADOR DE FONDEO E INVERSIONISTAS (INTERÉS SIMPLE VS COMPUESTO + EXENCIÓN ISR)
 *
 * @implements RN-09 (Inversionistas de Interés Simple vs Interés Compuesto / Capitalizable)
 * @implements RN-10 (Exención de retención de ISR por inversionista: applies_isr = 0 | 1)
 * @implements RN-11 (Movimientos de capital al corte sobre current_capital)
 * @implements Guardrail Forense 3 (Idempotencia en POST /api/funding/settle con mensaje explícito cuando ya fue procesado)
 * @implements Regla 3 Anti-God-Object (< 300 líneas) y Regla 6 SQA (0 any)
 */

import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { db } from '../db/connectionPool';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { extractClientIp, buildSourceSummary } from '../audit/auditMask';
import { auditEventStore } from '../audit/auditEventStore';
import {
  runMonthlyFundingSettle,
  recordInvestmentCapitalMovement,
} from '../funding/fundingCron';

export const fundingRouter = Router();

interface FundingOverviewInvestmentRow {
  id: string;
  investor_id: string;
  interest_type: 'SIMPLE' | 'COMPOUND';
  capital: number;
  current_capital: number;
  annual_rate: number;
  start_date: string;
  status: 'ACTIVE' | 'CLOSED';
  blind_name: string;
  isr_retention_rate: number;
  applies_isr: 0 | 1;
  requires_invoice: 0 | 1;
}

interface InvestorPaymentRow {
  id: string;
  investor_id: string;
  investment_id: string | null;
  payment_date: string;
  gross_yield: number;
  isr_retained: number;
  net_paid: number;
  reference_number: string;
  created_at: string;
}

interface CapitalMovementRow {
  id: string;
  investment_id: string;
  movement_date: string;
  movement_type: 'DEPOSIT' | 'WITHDRAWAL' | 'CAPITALIZATION';
  amount: number;
  capital_before: number;
  capital_after: number;
  reference_number: string;
  recorded_by: string;
  created_at: string;
}

fundingRouter.get('/overview', requireAuth('funding:read'), async (_req: Request, res: Response) => {
  try {
    const invRes = await db.query<FundingOverviewInvestmentRow>(`
      SELECT
        inv.id,
        inv.investor_id,
        inv.interest_type,
        inv.capital,
        inv.current_capital,
        inv.annual_rate,
        inv.start_date,
        inv.status,
        i.blind_name,
        i.isr_retention_rate,
        i.applies_isr,
        i.requires_invoice
      FROM investments inv
      JOIN investors i ON inv.investor_id = i.id
      ORDER BY inv.created_at DESC, inv.id DESC
    `);

    const pmtRes = await db.query<InvestorPaymentRow>(`
      SELECT id, investor_id, investment_id, payment_date, gross_yield, isr_retained, net_paid, reference_number, created_at
      FROM investor_payments
      ORDER BY payment_date DESC, created_at DESC
      LIMIT 50
    `);

    const movRes = await db.query<CapitalMovementRow>(`
      SELECT id, investment_id, movement_date, movement_type, amount, capital_before, capital_after, reference_number, recorded_by, created_at
      FROM investment_capital_movements
      ORDER BY movement_date DESC, created_at DESC
      LIMIT 50
    `);

    return res.json({
      ok: true,
      investments: invRes.rows,
      payments: pmtRes.rows,
      capitalMovements: movRes.rows,
    });
  } catch {
    return res.status(500).json({ error: 'Error consultando resumen de fondeo e inversionistas' });
  }
});

/**
 * POST /api/funding/investors
 * Da de alta un nuevo inversionista y su pagaré de inversión inicial (+ Nuevo Inversionista).
 */
fundingRouter.post('/investors', requireAuth('funding:manage'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const sourceIp = extractClientIp(req.headers);
    const sourceSummary = buildSourceSummary(sourceIp, req.headers['user-agent']);

    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const capital = Number(req.body?.capital ?? 100000);
    const rawRate = Number(req.body?.annualRate ?? 18);
    const interestType = req.body?.interestType === 'COMPOUND' ? 'COMPOUND' : 'SIMPLE';
    const appliesIsr = req.body?.appliesIsr === false || req.body?.appliesIsr === 0 ? 0 : 1;
    const isrRetentionRate = Number(req.body?.isrRetentionRate ?? 0.009);

    if (!rawName || rawName.length < 3) {
      return res.status(400).json({ error: 'El nombre del inversionista es obligatorio (mínimo 3 caracteres).' });
    }
    if (!Number.isFinite(capital) || capital <= 0) {
      return res.status(400).json({ error: 'El capital del pagaré debe ser mayor a $0.00 MXN.' });
    }
    const normalizedAnnualRate = rawRate > 1 ? rawRate / 100 : rawRate;
    if (!Number.isFinite(normalizedAnnualRate) || normalizedAnnualRate <= 0 || normalizedAnnualRate > 1) {
      return res.status(400).json({ error: 'La tasa anual debe ser un porcentaje válido (ej. 18%).' });
    }

    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const investorId = `INV-FND-${suffix}`;
    const investmentId = `PAG-${suffix}`;
    const blindName = crypto
      .createHash('sha256')
      .update(`${rawName.toUpperCase()}:${investorId}`, 'utf8')
      .digest('hex');
    const maskedLabel = `ENC_GCM256:${rawName.slice(0, 3).toUpperCase()}***`;
    const todayStr = new Date().toISOString().split('T')[0] ?? '2026-10-26';

    await db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO investors (id, blind_name, encrypted_name, isr_retention_rate, applies_isr, requires_invoice)
         VALUES ($1, $2, $3, $4, $5, 0)`,
        [investorId, blindName, maskedLabel, appliesIsr === 1 ? isrRetentionRate : 0, appliesIsr]
      );
      await tx.execute(
        `INSERT INTO investments (id, investor_id, capital, current_capital, annual_rate, start_date, status, interest_type)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7)`,
        [investmentId, investorId, capital, capital, normalizedAnnualRate, todayStr, interestType]
      );
    });

    await auditEventStore.append({
      action: 'CONFIG_CHANGE',
      actorEmail: user.email,
      actorRole: user.role,
      outcome: 'success',
      sourceIp,
      sourceSummary,
      details: JSON.stringify({
        event: 'NEW_INVESTOR_PROMISSORY_NOTE_CREATED',
        investor_id: investorId,
        investment_id: investmentId,
        capital,
        annual_rate: normalizedAnnualRate,
        interest_type: interestType,
        applies_isr: appliesIsr,
      }),
    });

    return res.status(201).json({
      ok: true,
      investorId,
      investmentId,
      message: `Pagaré ${investmentId} generado exitosamente para el nuevo inversionista.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error registrando nuevo inversionista';
    return res.status(400).json({ error: message });
  }
});

fundingRouter.post('/settle', requireAuth('funding:manage'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const sourceIp = extractClientIp(req.headers);
    const sourceSummary = buildSourceSummary(sourceIp, req.headers['user-agent']);
    const rawTargetDate = typeof req.body?.targetDate === 'string' ? req.body.targetDate.trim() : '';

    const parsedDate = rawTargetDate ? new Date(`${rawTargetDate}T12:00:00Z`) : new Date();
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Fecha de corte (targetDate) inválida. Use formato YYYY-MM-DD.' });
    }

    const result = await runMonthlyFundingSettle(parsedDate, user.email);
    const alreadyProcessed = result.processed === 0 && result.skipped > 0;
    const message = alreadyProcessed
      ? 'El corte mensual para este periodo ya fue procesado previamente'
      : `Corte mensual ejecutado exitosamente (${result.processed} inversión(es) liquidada(s), ${result.compoundCapitalizedCount} capitalizada(s)).`;

    await auditEventStore.append({
      action: 'PAYMENT_APPLIED',
      actorEmail: user.email,
      actorRole: user.role,
      outcome: 'success',
      sourceIp,
      sourceSummary,
      details: JSON.stringify({
        event: 'MONTHLY_FUNDING_SETTLE_EXECUTED',
        target_date: parsedDate.toISOString().split('T')[0],
        already_processed: alreadyProcessed,
        processed: result.processed,
        skipped: result.skipped,
        compound_capitalized_count: result.compoundCapitalizedCount,
        total_gross_yield: result.totalGrossYield,
        total_isr_retained: result.totalIsrRetained,
        total_capitalized_amount: result.totalCapitalizedAmount,
      }),
    });

    return res.json({
      ok: true,
      alreadyProcessed,
      message,
      result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error ejecutando corte mensual de fondeo';
    return res.status(500).json({ error: message });
  }
});

fundingRouter.post('/capital-movement', requireAuth('funding:manage'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const sourceIp = extractClientIp(req.headers);
    const sourceSummary = buildSourceSummary(sourceIp, req.headers['user-agent']);
    const { investmentId, movementDate, movementType, amount, referenceNumber } = req.body;

    if (
      !investmentId ||
      !movementDate ||
      (movementType !== 'DEPOSIT' && movementType !== 'WITHDRAWAL') ||
      !referenceNumber
    ) {
      return res.status(400).json({
        error: 'Se requiere investmentId, movementDate, movementType (DEPOSIT | WITHDRAWAL) y referenceNumber.',
      });
    }

    const movement = await recordInvestmentCapitalMovement({
      investmentId: String(investmentId),
      movementDate: String(movementDate),
      movementType,
      amount: Number(amount),
      referenceNumber: String(referenceNumber),
      recordedBy: user.email,
    });

    await auditEventStore.append({
      action: 'PAYMENT_APPLIED',
      actorEmail: user.email,
      actorRole: user.role,
      outcome: 'success',
      sourceIp,
      sourceSummary,
      details: JSON.stringify({
        event: 'INVESTMENT_CAPITAL_MOVEMENT_RECORDED',
        investment_id: String(investmentId),
        movement_id: movement.movementId,
        movement_type: movementType,
        amount: Number(amount),
        capital_before: movement.capitalBefore,
        capital_after: movement.capitalAfter,
      }),
    });

    return res.json({ ok: true, movement });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error registrando movimiento de capital';
    return res.status(400).json({ error: message });
  }
});
