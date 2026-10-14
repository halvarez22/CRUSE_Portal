import { Router } from 'express';
import { requireAuth } from '../auth/authMiddleware';
import { db } from '../db/connectionPool';
import { getServerKms } from '../crypto/serverKeyring';
import { decryptEnvelope } from '../crypto/cryptoService';
import { kyselyBuilder } from '../db/kyselyConfig';

export const dashboardRouter = Router();

// ==============================================================================
// GET /api/dashboard/kpis
// ==============================================================================
dashboardRouter.get('/kpis', requireAuth('dashboard:read_kpis'), async (req, res) => {
  try {
    const placedCapitalResult = await db.query<{ total_colocado: number | null }>(`
      SELECT SUM(principal_original) AS total_colocado 
      FROM loan_accounts
    `);

    const activeCapitalResult = await db.query<{ capital_vigente: number | null }>(`
      SELECT SUM(balance_after) AS capital_vigente 
      FROM loan_payment_applications 
      WHERE (expediente_id, created_at) IN (
        SELECT expediente_id, MAX(created_at) 
        FROM loan_payment_applications 
        GROUP BY expediente_id
      )
    `);

    const activeLoansResult = await db.query<{ creditos_activos: number }>(`
      SELECT COUNT(*) AS creditos_activos 
      FROM expedientes 
      WHERE status = 'activo' OR status = 'capturado'
    `);

    const overdueResult = await db.query<{ cartera_vencida: number | null }>(`
      SELECT SUM(vencido_por_cuota) AS cartera_vencida
      FROM (
        SELECT a.expected_payment - COALESCE(SUM(l.applied_payment), 0) AS vencido_por_cuota
        FROM amortization_schedules a
        LEFT JOIN loan_payment_applications l 
          ON a.loan_account_id = l.expediente_id 
          AND a.period_number = l.period_number
        WHERE a.due_date < CURRENT_DATE
        GROUP BY a.id, a.expected_payment
        HAVING COALESCE(SUM(l.applied_payment), 0) < a.expected_payment
      ) AS sub
    `);

    return res.json({
      totalColocado: placedCapitalResult.rows[0]?.total_colocado || 0,
      capitalVigente: activeCapitalResult.rows[0]?.capital_vigente || 0,
      creditosActivos: activeLoansResult.rows[0]?.creditos_activos || 0,
      carteraVencida: overdueResult.rows[0]?.cartera_vencida || 0
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
    const result = await db.query<any>(`
      SELECT 
        e.id, 
        e.created_at, 
        e.full_name as raw_full_name,
        e.curp_masked,
        e.requested_amount,
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

      return {
        id: row.id,
        createdAt: row.created_at,
        maskedName,
        curpMasked: row.curp_masked,
        amount: row.principal_original || row.requested_amount,
        payment: row.fortnightly_payment,
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
dashboardRouter.get('/expedientes/:id/details', requireAuth('dashboard:read_pii'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query<any>(`SELECT * FROM expedientes WHERE id = ?`, [id]);
    const record = result.rows[0];

    if (!record) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }

    let decryptedThumb = null;
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
      address: record.address,
      phone: record.phone,
      productType: record.product_type,
      requestedAmount: record.requested_amount,
      createdAt: record.created_at,
      thumbData: decryptedThumb
    });
  } catch (err: unknown) {
    console.error('Error fetching expedient details:', err);
    return res.status(500).json({ error: 'Error reading details' });
  }
});
