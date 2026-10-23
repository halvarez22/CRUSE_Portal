/**
 * ROUTER DE MÓDULOS EJECUTIVOS, SCORING PARAMÉTRICO, COMPETENCIA Y ASISTENTE IA INTERNO
 * Expediente: CRUSE-APO-2026-029 (Bloques B y C)
 *
 * Implementa:
 * - GET  /api/executive/roi-metrics        (B.2 Simulador ROI conectado a cartera real)
 * - POST /api/executive/scoring-evaluate   (B.3 Scoring Paramétrico Explicable — Guardrail 3)
 * - GET  /api/executive/competitors        (B.5 Matriz Comparativa de Competencia)
 * - PUT  /api/executive/competitors/:id    (B.5 Edición de tasas y comisiones en Pizarra Comercial)
 * - POST /api/executive/internal-ai-query  (B.4 Asistente IA Operativo Interno Zero-PII — Guardrail 2)
 */

import { Router } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { extractClientIp, buildSourceSummary } from '../audit/auditMask';
import { evaluateParametricCreditScoring } from '../executive/scoringService';
import { answerInternalOperationalQuery } from '../executive/internalAiService';
import {
  CompetitorBenchmark,
  HubRegion,
  PortfolioRoiRealMetrics,
  ScoringEvaluationInput,
} from '../../types/executive';

export const executiveRouter = Router();

interface CompetitorDbRow {
  id: string;
  name: string;
  product_name: string;
  sample_loan: number;
  sample_term_quincenas: number;
  sample_fortnightly_payment: number;
  sample_total_payment: number;
  annual_interest_rate: string;
  commissions: string;
  target_audience: string;
  requires_bureau: number;
  speed: string;
  is_cruse: number;
  updated_at: string;
  updated_by: string;
}

function mapCompetitorRow(row: CompetitorDbRow): CompetitorBenchmark {
  return {
    id: row.id,
    name: row.name,
    productName: row.product_name,
    sampleLoan: Number(row.sample_loan),
    sampleTermQuincenas: Number(row.sample_term_quincenas),
    sampleFortnightlyPayment: Number(row.sample_fortnightly_payment),
    sampleTotalPayment: Number(row.sample_total_payment),
    annualInterestRate: row.annual_interest_rate,
    commissions: row.commissions,
    targetAudience: row.target_audience,
    requiresBureau: Number(row.requires_bureau) === 1,
    speed: row.speed,
    isCruse: Number(row.is_cruse) === 1,
    updatedAt: String(row.updated_at),
    updatedBy: row.updated_by,
  };
}

// ============================================================================
// GET /api/executive/roi-metrics (Módulo B.2 conectado a Cartera Real)
// ============================================================================
executiveRouter.get('/roi-metrics', requireAuth('executive:read'), async (_req, res) => {
  try {
    const portfolioRes = await db.query<{
      placed_capital: number;
      active_capital: number;
      active_loans: number;
      express_count: number;
      frozen_balance: number;
    }>(`
      SELECT
        COALESCE(SUM(la.principal_original), 0) AS placed_capital,
        COALESCE(SUM(la.current_principal_balance), 0) AS active_capital,
        COUNT(la.id) AS active_loans,
        COALESCE(SUM(CASE WHEN la.product_type = 'EXPRESS' THEN 1 ELSE 0 END), 0) AS express_count,
        COALESCE(SUM(CASE WHEN la.status = 'FROZEN_EXTRAJUDICIAL' THEN la.current_principal_balance ELSE 0 END), 0) AS frozen_balance
      FROM loan_accounts la
    `);

    const investorRes = await db.query<{ committed_capital: number }>(`
      SELECT COALESCE(SUM(CASE WHEN current_capital > 0 THEN current_capital ELSE capital END), 0) AS committed_capital
      FROM investments
      WHERE status = 'ACTIVE'
    `);

    const hubRes = await db.query<{
      hub_region: string;
      loans_count: number;
      active_balance: number;
    }>(`
      SELECT
        COALESCE(e.hub_region, 'CHIHUAHUA') AS hub_region,
        COUNT(la.id) AS loans_count,
        COALESCE(SUM(la.current_principal_balance), 0) AS active_balance
      FROM expedientes e
      LEFT JOIN loan_accounts la ON la.expediente_id = e.id
      GROUP BY COALESCE(e.hub_region, 'CHIHUAHUA')
    `);

    const hubBreakdown: Record<HubRegion, { loansCount: number; activeBalance: number }> = {
      CHIHUAHUA: { loansCount: 0, activeBalance: 0 },
      LEON: { loansCount: 0, activeBalance: 0 },
      CANCUN: { loansCount: 0, activeBalance: 0 },
    };

    for (const r of hubRes.rows) {
      const key = (['CHIHUAHUA', 'LEON', 'CANCUN'].includes(r.hub_region)
        ? r.hub_region
        : 'CHIHUAHUA') as HubRegion;
      hubBreakdown[key] = {
        loansCount: Number(r.loans_count ?? 0),
        activeBalance: Number(r.active_balance ?? 0),
      };
    }

    const p = portfolioRes.rows[0];
    const placedCapital = Number(p?.placed_capital ?? 0);
    const activeCapital = Number(p?.active_capital ?? 0);
    const activeLoansCount = Number(p?.active_loans ?? 0);
    const expressCount = Number(p?.express_count ?? 0);
    const frozenBalance = Number(p?.frozen_balance ?? 0);

    const metrics: PortfolioRoiRealMetrics = {
      realPlacedCapital: placedCapital,
      realActiveCapital: activeCapital,
      realActiveLoansCount: activeLoansCount,
      realInvestorCapitalCommitted: Number(investorRes.rows[0]?.committed_capital ?? 0),
      realDefaultRatePercent:
        placedCapital > 0 ? Number(((frozenBalance / placedCapital) * 100).toFixed(2)) : 1.2,
      realExpressSharePercent:
        activeLoansCount > 0 ? Math.round((expressCount / activeLoansCount) * 100) : 30,
      hubBreakdown,
    };

    return res.json(metrics);
  } catch (err) {
    console.error('[executiveRouter] Error en GET /roi-metrics:', err);
    return res.status(500).json({ error: 'Error al obtener métricas reales para el Simulador ROI.' });
  }
});

// ============================================================================
// POST /api/executive/scoring-evaluate (Módulo B.3 — Guardrail Forense 3)
// ============================================================================
executiveRouter.post('/scoring-evaluate', requireAuth('executive:scoring'), async (req, res) => {
  try {
    const auth = getAuth(req);
    const body = req.body as Partial<ScoringEvaluationInput>;

    const input: ScoringEvaluationInput = {
      productType: body.productType === 'normal' ? 'normal' : 'express',
      requestedAmount: Number(body.requestedAmount ?? 10000),
      termFortnights: Number(body.termFortnights ?? 14),
      fortnightlyNetSalary: Number(body.fortnightlyNetSalary ?? 9500),
      currentPayrollDeductions: Number(body.currentPayrollDeductions ?? 0),
      seniorityMonths: Number(body.seniorityMonths ?? 24),
      convenio: String(body.convenio ?? 'STSGECH').trim(),
      hubRegion:
        body.hubRegion && ['CHIHUAHUA', 'LEON', 'CANCUN'].includes(body.hubRegion)
          ? body.hubRegion
          : 'CHIHUAHUA',
    };

    const evaluation = await evaluateParametricCreditScoring(input);

    const ip = extractClientIp(req.headers);
    await auditEventStore.append({
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'SCORING_EVALUATED',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary: buildSourceSummary(ip, req.headers['user-agent']),
      details: `Scoring paramétrico evaluado: Producto=${input.productType.toUpperCase()}, Monto=$${input.requestedAmount}, Plazo=${input.termFortnights}Q, DTI=${evaluation.totalDeductionRatioPercent}%, Antigüedad=${input.seniorityMonths}m -> Dictamen=${evaluation.riskLevel} (${evaluation.score}/950 pts)`,
    });

    return res.json(evaluation);
  } catch (err) {
    console.error('[executiveRouter] Error en POST /scoring-evaluate:', err);
    return res.status(500).json({ error: 'Error al evaluar el scoring paramétrico de la solicitud.' });
  }
});

// ============================================================================
// GET & PUT /api/executive/competitors (Módulo B.5 — Pizarra Comercial Editable)
// ============================================================================
executiveRouter.get('/competitors', requireAuth('executive:read'), async (_req, res) => {
  try {
    const result = await db.query<CompetitorDbRow>(
      `SELECT * FROM competitor_benchmarks ORDER BY is_cruse DESC, sample_total_payment ASC`
    );
    return res.json({ competitors: result.rows.map(mapCompetitorRow) });
  } catch (err) {
    console.error('[executiveRouter] Error en GET /competitors:', err);
    return res.status(500).json({ error: 'Error al consultar la matriz comparativa de competencia.' });
  }
});

executiveRouter.put('/competitors/:id', requireAuth('executive:competitors_manage'), async (req, res) => {
  try {
    const auth = getAuth(req);
    const id = String(req.params.id ?? '').trim();
    const body = req.body as Partial<CompetitorBenchmark>;

    const existing = await db.query<CompetitorDbRow>(
      `SELECT * FROM competitor_benchmarks WHERE id = $1`,
      [id]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'Competidor no encontrado en la pizarra comercial.' });
    }

    const curr = existing.rows[0]!;
    const sampleLoan = Math.max(1000, Number(body.sampleLoan ?? curr.sample_loan));
    const sampleTermQuincenas = Math.max(1, Number(body.sampleTermQuincenas ?? curr.sample_term_quincenas));
    const sampleFortnightlyPayment = Math.max(
      1,
      Number(body.sampleFortnightlyPayment ?? curr.sample_fortnightly_payment)
    );
    const sampleTotalPayment =
      body.sampleTotalPayment !== undefined
        ? Number(body.sampleTotalPayment)
        : Number((sampleFortnightlyPayment * sampleTermQuincenas).toFixed(2));
    const annualInterestRate = String(body.annualInterestRate ?? curr.annual_interest_rate).trim().slice(0, 80);
    const commissions = String(body.commissions ?? curr.commissions).trim().slice(0, 255);
    const speed = String(body.speed ?? curr.speed).trim().slice(0, 100);

    await db.execute(
      `UPDATE competitor_benchmarks
       SET sample_loan = $1,
           sample_term_quincenas = $2,
           sample_fortnightly_payment = $3,
           sample_total_payment = $4,
           annual_interest_rate = $5,
           commissions = $6,
           speed = $7,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = $8
       WHERE id = $9`,
      [
        sampleLoan,
        sampleTermQuincenas,
        sampleFortnightlyPayment,
        sampleTotalPayment,
        annualInterestRate,
        commissions,
        speed,
        auth.user.email,
        id,
      ]
    );

    const updatedRes = await db.query<CompetitorDbRow>(
      `SELECT * FROM competitor_benchmarks WHERE id = $1`,
      [id]
    );

    const ip = extractClientIp(req.headers);
    await auditEventStore.append({
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'COMPETITOR_BENCHMARK_UPDATED',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary: buildSourceSummary(ip, req.headers['user-agent']),
      details: `Pizarra comercial actualizada (${curr.name}): Tasa="${annualInterestRate}", Cuota=$${sampleFortnightlyPayment}, Total=$${sampleTotalPayment}, Comisiones="${commissions}"`,
    });

    return res.json({ competitor: mapCompetitorRow(updatedRes.rows[0]!) });
  } catch (err) {
    console.error('[executiveRouter] Error en PUT /competitors/:id:', err);
    return res.status(500).json({ error: 'Error al actualizar el registro de competencia.' });
  }
});

// ============================================================================
// POST /api/executive/internal-ai-query (Módulo B.4 — Guardrail Forense 2 Zero-PII)
// ============================================================================
executiveRouter.post('/internal-ai-query', requireAuth('executive:internal_ai'), async (req, res) => {
  try {
    const auth = getAuth(req);
    const rawQuestion = String(req.body?.question ?? '').trim();
    if (!rawQuestion) {
      return res.status(400).json({ error: 'La consulta operativa no puede estar vacía.' });
    }

    const result = await answerInternalOperationalQuery(rawQuestion);

    const ip = extractClientIp(req.headers);
    await auditEventStore.append({
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'INTERNAL_AI_QUERY',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary: buildSourceSummary(ip, req.headers['user-agent']),
      details: `Consulta operativa IA interna Zero-PII ejecutada (Modelo: ${result.model})`,
    });

    return res.json(result);
  } catch (err) {
    console.error('[executiveRouter] Error en POST /internal-ai-query:', err);
    return res.status(500).json({ error: 'Error al procesar la consulta en el Asistente Operativo Interno.' });
  }
});
