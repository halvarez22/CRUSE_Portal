import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/authMiddleware';
import { db } from '../db/connectionPool';
import { getServerKms } from '../crypto/serverKeyring';
import { decryptEnvelope } from '../crypto/cryptoService';

export const dashboardRouter = Router();

// ==============================================================================
// GET /api/dashboard/kpis
// ==============================================================================
dashboardRouter.get('/kpis', requireAuth('dashboard:read_kpis'), async (_req, res) => {
  try {
    const placedCapitalResult = await db.query<{ total_colocado: number | null }>(`
      SELECT COALESCE(SUM(principal_original), 0) AS total_colocado 
      FROM loan_accounts
    `);

    const activeCapitalResult = await db.query<{ capital_vigente: number | null }>(`
      SELECT COALESCE(SUM(
        COALESCE(latest_lpa.balance_after, la.principal_original)
      ), 0) AS capital_vigente
      FROM loan_accounts la
      INNER JOIN expedientes e ON e.id = la.expediente_id
      LEFT JOIN (
        SELECT l1.expediente_id, l1.balance_after
        FROM loan_payment_applications l1
        INNER JOIN (
          SELECT expediente_id, MAX(created_at) AS max_created_at
          FROM loan_payment_applications
          GROUP BY expediente_id
        ) l2 ON l1.expediente_id = l2.expediente_id AND l1.created_at = l2.max_created_at
      ) latest_lpa ON latest_lpa.expediente_id = la.expediente_id
      WHERE e.status IN ('activo', 'capturado')
    `);

    const activeLoansResult = await db.query<{ creditos_activos: number }>(`
      SELECT COUNT(*) AS creditos_activos 
      FROM expedientes 
      WHERE status = 'activo' OR status = 'capturado'
    `);

    const overdueResult = await db.query<{ cartera_vencida: number | null }>(`
      SELECT COALESCE(SUM(vencido_por_credito), 0) AS cartera_vencida
      FROM (
        SELECT
          CASE
            WHEN MAX(CASE
              WHEN am.due_date < CURRENT_DATE AND COALESCE(lpa_sum.total_received, 0) < am.expected_payment
              THEN 1 ELSE 0
            END) = 1
            THEN la.principal_original - COALESCE(lpa_tot.total_applied_capital, 0)
            ELSE 0
          END AS vencido_por_credito
        FROM loan_accounts la
        INNER JOIN expedientes e ON e.id = la.expediente_id
        LEFT JOIN amortization_schedules am ON la.expediente_id = am.loan_account_id
        LEFT JOIN (
          SELECT expediente_id, fortnight_period, SUM(amount_received) AS total_received
          FROM loan_payment_applications
          GROUP BY expediente_id, fortnight_period
        ) lpa_sum ON la.expediente_id = lpa_sum.expediente_id AND lpa_sum.fortnight_period = CAST(am.period_number AS TEXT)
        LEFT JOIN (
          SELECT expediente_id, SUM(applied_capital) AS total_applied_capital
          FROM loan_payment_applications
          GROUP BY expediente_id
        ) lpa_tot ON la.expediente_id = lpa_tot.expediente_id
        WHERE e.status = 'activo'
        GROUP BY la.expediente_id, la.principal_original, lpa_tot.total_applied_capital
      ) AS sub
    `);

    const totalColocado = Number(placedCapitalResult.rows[0]?.total_colocado ?? 0);
    return res.json({
      capitalColocado: totalColocado,
      totalColocado,
      capitalVigente: Number(activeCapitalResult.rows[0]?.capital_vigente ?? 0),
      creditosActivos: Number(activeLoansResult.rows[0]?.creditos_activos ?? 0),
      carteraVencida: Number(overdueResult.rows[0]?.cartera_vencida ?? 0)
    });
  } catch (err: unknown) {
    console.error('Error fetching KPIs:', err);
    return res.status(500).json({ error: 'Error calculating metrics' });
  }
});

// ==============================================================================
// GET /api/dashboard/latest_loans
// ==============================================================================
dashboardRouter.get('/latest_loans', requireAuth('dashboard:read'), async (_req, res) => {
  try {
    const result = await db.query<{
      id: string;
      created_at: string;
      raw_full_name: string | null;
      curp_masked: string;
      requested_amount: number;
      product_type: string | null;
      status: string;
      principal_original: number | null;
      fortnightly_payment: number | null;
    }>(`
      SELECT 
        e.id, 
        e.created_at, 
        e.full_name as raw_full_name,
        e.curp_masked,
        e.requested_amount,
        e.product_type,
        e.status,
        l.principal_original,
        l.fortnightly_payment
      FROM expedientes e
      LEFT JOIN loan_accounts l ON e.id = l.expediente_id
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 50
    `);

    const maskedRows = result.rows.map(row => {
      const nameParts = (row.raw_full_name || '').split(' ');
      const maskedName = nameParts.map((p: string) => 
        p.length > 1 ? p[0] + '*'.repeat(p.length - 1) : p
      ).join(' ');

      const amount = Number(row.principal_original || row.requested_amount || 0);
      return {
        id: row.id,
        createdAt: row.created_at,
        date: row.created_at,
        maskedName,
        fullName: maskedName,
        curpMasked: row.curp_masked,
        amount,
        payment: row.fortnightly_payment,
        productType: row.product_type || 'normal',
        status: row.status
      };
    });

    return res.json(maskedRows);
  } catch (err: unknown) {
    console.error('Error fetching latest loans:', err);
    return res.status(500).json({ error: 'Error fetching loans' });
  }
});

// ==============================================================================
// GET /api/dashboard/expedientes/:id/details (PII Unmasked)
// ==============================================================================
export async function handleGetExpedientDetails(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const result = await db.query<{
      id: string;
      created_at: string;
      full_name: string;
      curp_masked: string;
      voter_id: string | null;
      address: string;
      phone: string;
      requested_amount: number;
      term_fortnights: number;
      product_type: string;
      status: string;
      encrypted_thumb_payload: string | null;
    }>(`SELECT * FROM expedientes WHERE id = ?`, [id]);
    const record = result.rows[0];

    if (!record) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }

    let decryptedThumb: string | null = null;
    if (record.encrypted_thumb_payload) {
      try {
        const kms = getServerKms();
        const payloadObj = JSON.parse(record.encrypted_thumb_payload);
        decryptedThumb = await decryptEnvelope(payloadObj, kms);
      } catch (decryptErr) {
        console.error('Fallo criptográfico al desencriptar PII:', decryptErr);
        return res.status(500).json({ error: 'Falla interna de seguridad al acceder al expediente.' });
      }
    }

    return res.json({
      id: record.id,
      fullName: record.full_name,
      curp: record.curp_masked || 'NO REGISTRADO',
      rfc: 'NO REGISTRADO EN EXPEDIENTE',
      voterId: record.voter_id || 'NO REGISTRADO',
      address: record.address || 'SIN DATO',
      phone: record.phone || 'SIN DATO',
      productType: record.product_type || 'normal',
      requestedAmount: Number(record.requested_amount ?? 0),
      termFortnights: Number(record.term_fortnights ?? 0),
      status: record.status || 'capturado',
      createdAt: record.created_at,
      thumbData: decryptedThumb
    });
  } catch (err: unknown) {
    console.error('Error fetching expedient details:', err);
    return res.status(500).json({ error: 'Error reading details' });
  }
}

dashboardRouter.get('/expedientes/:id/details', requireAuth('dashboard:read_pii'), handleGetExpedientDetails);

