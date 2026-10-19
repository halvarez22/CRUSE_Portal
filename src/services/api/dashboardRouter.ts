import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { isRoleAuthorized } from '../../config/rbacPolicy';
import { db } from '../db/connectionPool';
import { getServerKms } from '../crypto/serverKeyring';
import { decryptEnvelope } from '../crypto/cryptoService';

export const dashboardRouter = Router();

export interface DecryptedExpedientePii {
  fullName?: string;
  curp?: string;
  rfc?: string;
  voterId?: string;
  address?: string;
  phone?: string;
}

export async function decryptExpedientePiiIfAuthorized(
  encryptedPiiPayload: string | null | undefined,
  canReadPii: boolean
): Promise<DecryptedExpedientePii | null> {
  if (!canReadPii || !encryptedPiiPayload) {
    return null;
  }
  try {
    const kms = getServerKms();
    const envelopeObj = JSON.parse(encryptedPiiPayload);
    const jsonStr = await decryptEnvelope(envelopeObj, kms);
    return JSON.parse(jsonStr) as DecryptedExpedientePii;
  } catch (err) {
    console.error('Fallo al desencriptar encrypted_pii_payload:', err);
    return null;
  }
}

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
dashboardRouter.get('/latest_loans', requireAuth('dashboard:read'), async (req, res) => {
  try {
    const auth = getAuth(req);
    const canReadPii = isRoleAuthorized('dashboard:read_pii', auth.user.role);

    const result = await db.query<{
      id: string;
      created_at: string;
      convenio: string | null;
      raw_full_name: string | null;
      curp_masked: string;
      requested_amount: number;
      term_fortnights: number;
      product_type: string | null;
      status: string;
      encrypted_pii_payload: string | null;
      principal_original: number | null;
      fortnightly_payment: number | null;
    }>(`
      SELECT 
        e.id, 
        e.created_at,
        e.convenio,
        e.full_name as raw_full_name,
        e.curp_masked,
        e.requested_amount,
        e.term_fortnights,
        e.product_type,
        e.status,
        e.encrypted_pii_payload,
        l.principal_original,
        l.fortnightly_payment
      FROM expedientes e
      LEFT JOIN loan_accounts l ON e.id = l.expediente_id
      ORDER BY e.created_at DESC, e.id DESC
    `);

    const rows = await Promise.all(
      result.rows.map(async (row) => {
        const nameParts = (row.raw_full_name || '').split(' ');
        const fallbackMaskedName = nameParts
          .map((p: string) => (p.length > 1 ? p[0] + '*'.repeat(p.length - 1) : p))
          .join(' ');

        const amount = Number(row.principal_original || row.requested_amount || 0);

        // Condición 3 (CRUSE-APO-2026-015): Validación explícita del permiso dashboard:read_pii
        if (!canReadPii) {
          return {
            id: row.id,
            convenio: row.convenio || 'STSGECH',
            createdAt: row.created_at,
            date: row.created_at,
            maskedName: fallbackMaskedName,
            fullName: fallbackMaskedName,
            curpMasked: row.curp_masked,
            amount,
            payment: Number(row.fortnightly_payment ?? 0),
            termFortnights: Number(row.term_fortnights ?? 0),
            productType: row.product_type || 'normal',
            status: row.status
          };
        } else {
          const decryptedPii = await decryptExpedientePiiIfAuthorized(row.encrypted_pii_payload, true);
          const unmaskedName = decryptedPii?.fullName || row.raw_full_name || fallbackMaskedName;
          const unmaskedCurp = decryptedPii?.curp || row.curp_masked;

          return {
            id: row.id,
            convenio: row.convenio || 'STSGECH',
            createdAt: row.created_at,
            date: row.created_at,
            maskedName: fallbackMaskedName,
            fullName: unmaskedName,
            curpMasked: unmaskedCurp,
            curp: unmaskedCurp,
            amount,
            payment: Number(row.fortnightly_payment ?? 0),
            termFortnights: Number(row.term_fortnights ?? 0),
            productType: row.product_type || 'normal',
            status: row.status
          };
        }
      })
    );

    return res.json(rows);
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
    const auth = getAuth(req);
    const canReadPii = isRoleAuthorized('dashboard:read_pii', auth.user.role);

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
      encrypted_pii_payload: string | null;
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

    const decryptedPii = await decryptExpedientePiiIfAuthorized(record.encrypted_pii_payload, canReadPii);

    return res.json({
      id: record.id,
      fullName: decryptedPii?.fullName || record.full_name,
      curp: decryptedPii?.curp || record.curp_masked || 'NO REGISTRADO',
      rfc: decryptedPii?.rfc || 'NO REGISTRADO EN EXPEDIENTE',
      voterId: decryptedPii?.voterId || record.voter_id || 'NO REGISTRADO',
      address: decryptedPii?.address || record.address || 'SIN DATO',
      phone: decryptedPii?.phone || record.phone || 'SIN DATO',
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


