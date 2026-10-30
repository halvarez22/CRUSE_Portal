import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { isRoleAuthorized } from '../../config/rbacPolicy';
import { db } from '../db/connectionPool';
import { getServerKms } from '../crypto/serverKeyring';
import { decryptEnvelope } from '../crypto/cryptoService';
import {
  RawDashboardKpiRow,
  RawLatestLoanDbRow,
  aggregateDashboardKpisDeterministic,
  computeLoanSemaphore,
  deduplicateLatestLoanRows,
  normalizeHubFilter,
  rawToJsonDecimalStrict,
  rawToJsonIntegerStrict,
  resolveHubRegion,
} from '../dashboard/kpiAggregator';

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
// GET /api/dashboard/kpis (Soporta ?hub=CHIHUAHUA|LEON|CANCUN + Semáforo de Morosidad)
// ==============================================================================
dashboardRouter.get('/kpis', requireAuth('dashboard:read_kpis'), async (req, res) => {
  try {
    const hubFilter = normalizeHubFilter(req.query.hub);

    const rowsRes = await db.query<RawDashboardKpiRow>(`
      SELECT
        e.id AS exp_id,
        e.status AS exp_status,
        COALESCE(e.hub_region, 'CHIHUAHUA') AS hub_region,
        e.requested_amount,
        la.id AS loan_id,
        la.status AS loan_status,
        la.principal_original,
        COALESCE(latest_lpa.balance_after, la.current_principal_balance, la.principal_original) AS current_balance,
        lsp.reason AS suspension_reason
      FROM expedientes e
      LEFT JOIN loan_accounts la ON la.expediente_id = e.id
      LEFT JOIN (
        SELECT l1.expediente_id, MIN(l1.balance_after) AS balance_after
        FROM loan_payment_applications l1
        INNER JOIN (
          SELECT expediente_id, MAX(created_at) AS max_created_at
          FROM loan_payment_applications
          GROUP BY expediente_id
        ) l2 ON l1.expediente_id = l2.expediente_id AND l1.created_at = l2.max_created_at
        GROUP BY l1.expediente_id
      ) latest_lpa ON latest_lpa.expediente_id = e.id
      LEFT JOIN (
        SELECT loan_account_id, MAX(reason) AS reason
        FROM loan_suspension_periods
        WHERE status = 'ACTIVE_SUSPENSION'
        GROUP BY loan_account_id
      ) lsp ON lsp.loan_account_id = la.id
      ORDER BY e.created_at DESC, e.id DESC
    `);

    const kpisPayload = aggregateDashboardKpisDeterministic(rowsRes.rows, hubFilter);
    return res.json(kpisPayload);
  } catch (err: unknown) {
    console.error('Error fetching KPIs:', err);
    return res.status(500).json({ error: 'Error calculating metrics' });
  }
});

// ==============================================================================
// GET /api/dashboard/latest_loans (Soporta ?hub=CHIHUAHUA|LEON|CANCUN + Semáforo)
// ==============================================================================
dashboardRouter.get('/latest_loans', requireAuth('dashboard:read'), async (req, res) => {
  try {
    const auth = getAuth(req);
    const canReadPii = isRoleAuthorized('dashboard:read_pii', auth.user.role);
    const hubFilter = normalizeHubFilter(req.query.hub);

    const result = await db.query<RawLatestLoanDbRow>(`
      SELECT 
        e.id, 
        e.created_at,
        e.convenio,
        COALESCE(e.hub_region, 'CHIHUAHUA') AS hub_region,
        e.full_name as raw_full_name,
        e.curp_masked,
        e.requested_amount,
        e.term_fortnights,
        e.product_type,
        e.status,
        e.encrypted_pii_payload,
        l.status as loan_status,
        l.principal_original,
        l.fortnightly_payment,
        lsp.reason as suspension_reason
      FROM expedientes e
      LEFT JOIN loan_accounts l ON e.id = l.expediente_id
      LEFT JOIN (
        SELECT loan_account_id, MAX(reason) AS reason
        FROM loan_suspension_periods
        WHERE status = 'ACTIVE_SUSPENSION'
        GROUP BY loan_account_id
      ) lsp ON lsp.loan_account_id = l.id
      ORDER BY e.created_at DESC, e.id DESC
    `);

    const filteredSource = deduplicateLatestLoanRows(result.rows, hubFilter);

    const rows = await Promise.all(
      filteredSource.map(async (row) => {
        const nameParts = (row.raw_full_name || '').split(' ');
        const fallbackMaskedName = nameParts
          .map((p: string) => (p.length > 1 ? p[0] + '*'.repeat(p.length - 1) : p))
          .join(' ');

        const amount = rawToJsonDecimalStrict(
          row.principal_original ?? row.requested_amount ?? '0.00',
          '0.00'
        );
        const payment = rawToJsonDecimalStrict(row.fortnightly_payment ?? '0.00', '0.00');
        const termFortnights = rawToJsonIntegerStrict(row.term_fortnights ?? '0', '0');
        const hubRegion = resolveHubRegion(row.hub_region);
        const semaphore = computeLoanSemaphore(row.status, row.loan_status, row.suspension_reason);

        if (!canReadPii) {
          return {
            id: row.id,
            convenio: (row.convenio || 'STSGECH').trim(),
            hubRegion,
            semaphore,
            createdAt: row.created_at,
            date: row.created_at,
            maskedName: fallbackMaskedName,
            fullName: fallbackMaskedName,
            curpMasked: row.curp_masked,
            amount,
            payment,
            termFortnights,
            productType: row.product_type || 'normal',
            status: (row.status || 'capturado').trim().toLowerCase(),
          };
        } else {
          const decryptedPii = await decryptExpedientePiiIfAuthorized(
            row.encrypted_pii_payload,
            true
          );
          const unmaskedName = decryptedPii?.fullName || row.raw_full_name || fallbackMaskedName;
          const unmaskedCurp = decryptedPii?.curp || row.curp_masked;

          return {
            id: row.id,
            convenio: (row.convenio || 'STSGECH').trim(),
            hubRegion,
            semaphore,
            createdAt: row.created_at,
            date: row.created_at,
            maskedName: fallbackMaskedName,
            fullName: unmaskedName,
            curpMasked: unmaskedCurp,
            curp: unmaskedCurp,
            amount,
            payment,
            termFortnights,
            productType: row.product_type || 'normal',
            status: (row.status || 'capturado').trim().toLowerCase(),
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
      requested_amount: number | string | null;
      term_fortnights: number | string | null;
      product_type: string;
      status: string;
      encrypted_thumb_payload: string | null;
      encrypted_pii_payload: string | null;
    }>(`SELECT * FROM expedientes WHERE id = $1`, [id]);
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
        return res
          .status(500)
          .json({ error: 'Falla interna de seguridad al acceder al expediente.' });
      }
    }

    const decryptedPii = await decryptExpedientePiiIfAuthorized(
      record.encrypted_pii_payload,
      canReadPii
    );

    return res.json({
      id: record.id,
      fullName: decryptedPii?.fullName || record.full_name,
      curp: decryptedPii?.curp || record.curp_masked || 'NO REGISTRADO',
      rfc: decryptedPii?.rfc || 'NO REGISTRADO EN EXPEDIENTE',
      voterId: decryptedPii?.voterId || record.voter_id || 'NO REGISTRADO',
      address: decryptedPii?.address || record.address || 'SIN DATO',
      phone: decryptedPii?.phone || record.phone || 'SIN DATO',
      productType: record.product_type || 'normal',
      requestedAmount: rawToJsonDecimalStrict(record.requested_amount ?? '0.00', '0.00'),
      termFortnights: rawToJsonIntegerStrict(record.term_fortnights ?? '0', '0'),
      status: record.status || 'capturado',
      createdAt: record.created_at,
      thumbData: decryptedThumb,
    });
  } catch (err: unknown) {
    console.error('Error fetching expedient details:', err);
    return res.status(500).json({ error: 'Error reading details' });
  }
}

dashboardRouter.get(
  '/expedientes/:id/details',
  requireAuth('dashboard:read_pii'),
  handleGetExpedientDetails
);
