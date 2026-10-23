/**
 * MOTOR AUTOMATIZADO DE REPORTE A CÍRCULO DE CRÉDITO (SIC) Y GESTIÓN DE CATÁLOGOS
 * Expediente: CRUSE-APO-2026-024 (Guardrails Forenses 1, 2, 3 y 4)
 *
 * - Directriz 1: Delegación total del formateo al módulo puro `creditBureauLayoutBuilder.ts`.
 * - Directriz 2: Extracción sobre transacción `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;`
 *   en PostgreSQL y sellado WORM con `pg_advisory_xact_lock(20260019)`.
 * - Directriz 3: Enmascaramiento forense estricto (`maskPiiForPreview`) y cero fuga de PII en logs o errores.
 * - Directriz 4: Cero `any` y límite Anti-God-Object (< 600 líneas).
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { auditEventStore } from '../audit/auditEventStore';
import { maskCurp } from '../audit/auditMask';
import { getServerKms } from '../crypto/serverKeyring';
import { decryptEnvelope, EnvelopeEncryptedPayload } from '../crypto/cryptoService';
import {
  CreditBureauCatalogItem,
  CreditBureauGenerateResult,
  CreditBureauPersonScope,
  CreditBureauPreviewRow,
  CreditBureauReportRecord,
  CreditBureauValidationIssue,
  UserRole,
} from '../../types';
import {
  buildDeterministicCreditBureauLayouts,
  calculateSicTermDaysOrMonths,
  computeSicPaymentStatus,
  formatIsoToYyyyMmDd,
  formatSicIntegerAmount,
  mapPaymentFrequencyToSicCode,
  RawSicAccountInput,
} from './creditBureauLayoutBuilder';

interface CatalogDbRow {
  id: string;
  catalog_group: string;
  code: string;
  description: string;
  active: number;
  updated_at: string | Date;
  updated_by: string;
}

interface PortfolioSicJoinRow {
  loan_account_id: string;
  contract_number: string;
  expediente_id: string;
  principal_original: string | number;
  current_principal_balance: string | number;
  fortnightly_payment: string | number;
  payment_frequency: string;
  activated_at: string | Date;
  product_type: string;
  loan_status: string;
  reports_to_credit_bureau: number;
  convenio: string;
  convenio_display_name: string | null;
  full_name_masked: string;
  curp_masked: string;
  blind_curp: string;
  voter_id: string | null;
  address_masked: string;
  phone_masked: string;
  term_fortnights: number;
  encrypted_pii_payload: string | null;
  person_type: string;
  rfc_masked: string | null;
  gender: string | null;
  birth_date: string | Date | null;
  last_payment_date: string | Date | null;
  last_payment_amount: string | number | null;
}

interface LegalMemberDbRow {
  id: string;
  expediente_id: string;
  member_role: string;
  rfc_masked: string;
  encrypted_pii_payload: string;
  shareholding_percent: string | number | null;
}

interface ReportHeaderDbRow {
  id: string;
  reporting_month: string;
  manifest_hash: string;
  created_at: string | Date;
  total_accounts: string | number;
  total_reported_balance: string | number;
}

interface DecryptedPiiEnvelope {
  fullName?: string;
  curp?: string;
  rfc?: string;
  voterId?: string;
  address?: string;
  phone?: string;
}

function normalizeIsoDateString(val: string | Date | null | undefined, fallbackIso: string): string {
  if (!val) return fallbackIso;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1]! : fallbackIso;
}

/**
 * Directriz 3 (Guardrail 4): Enmascaramiento forense estricto para previsualización y logs.
 * Garantiza que jamás salga un RFC, CURP o Nombre completo en texto plano hacia la UI de previsualización.
 */
export function maskPiiForPreview(input: {
  rawName?: string | null;
  maskedNameFromDb: string;
  rawCurp?: string | null;
  curpMaskedFromDb: string;
  rawRfc?: string | null;
  rfcMaskedFromDb?: string | null;
  blindCurp: string;
}): {
  maskedName: string;
  curpMasked: string;
  rfcMasked: string;
  blindCurpPrefix: string;
} {
  const blindCurpPrefix = String(input.blindCurp || '').slice(0, 12) || '000000000000';
  const curpMasked =
    input.curpMaskedFromDb && input.curpMaskedFromDb.includes('*')
      ? input.curpMaskedFromDb
      : maskCurp(input.rawCurp);

  const cleanRfc = String(input.rfcMaskedFromDb || input.rawRfc || '').trim().toUpperCase();
  let rfcMasked = '—';
  if (cleanRfc && cleanRfc !== 'NO REGISTRADO EN EXPEDIENTE') {
    rfcMasked =
      cleanRfc.length >= 8
        ? `${cleanRfc.slice(0, 3)}******${cleanRfc.slice(-3)}`
        : '*********';
  } else if (curpMasked.length >= 10) {
    rfcMasked = `${curpMasked.slice(0, 4)}******`;
  }

  let maskedName = input.maskedNameFromDb;
  if (!maskedName.includes('*') && input.rawName) {
    maskedName = input.rawName
      .trim()
      .split(/\s+/)
      .map((part) => (part.length > 1 ? `${part[0]}${'*'.repeat(part.length - 1)}` : part))
      .join(' ');
  }

  return {
    maskedName,
    curpMasked,
    rfcMasked,
    blindCurpPrefix,
  };
}

async function decryptPiiSafely(
  encryptedJson: string | null | undefined,
  expedienteId: string,
  blindCurpPrefix: string
): Promise<DecryptedPiiEnvelope | null> {
  if (!encryptedJson) return null;
  try {
    const kms = getServerKms();
    const parsed = JSON.parse(encryptedJson) as EnvelopeEncryptedPayload;
    const clearText = await decryptEnvelope(parsed, kms);
    return JSON.parse(clearText) as DecryptedPiiEnvelope;
  } catch {
    // Guardrail 4: Cero PII en logs de error, solo expediente_id y blind_curp_prefix
    console.warn(
      `[SIC ZERO-PII WARN] Fallo al desencriptar sobre en expediente_id=${expedienteId} (blind_prefix=${blindCurpPrefix})`
    );
    return null;
  }
}

export async function listCreditBureauCatalogs(): Promise<CreditBureauCatalogItem[]> {
  const res = await db.query<CatalogDbRow>(
    `SELECT id, catalog_group, code, description, active, updated_at, updated_by
     FROM credit_bureau_catalogs
     ORDER BY catalog_group ASC, code ASC`
  );
  return res.rows.map((r) => ({
    id: r.id,
    catalogGroup: r.catalog_group,
    code: r.code,
    description: r.description,
    active: Number(r.active) === 1,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    updatedBy: r.updated_by,
  }));
}

export async function upsertCreditBureauCatalog(input: {
  catalogGroup: string;
  code: string;
  description: string;
  active: boolean;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
  sourceSummary: string;
}): Promise<CreditBureauCatalogItem> {
  const groupClean = input.catalogGroup.trim().toUpperCase();
  const codeClean = input.code.trim().toUpperCase();
  const descClean = input.description.trim();
  const activeInt = input.active ? 1 : 0;

  return db.transaction(async (tx) => {
    const existing = await tx.query<{ id: string }>(
      `SELECT id FROM credit_bureau_catalogs WHERE catalog_group = $1 AND code = $2`,
      [groupClean, codeClean]
    );

    let recordId = existing.rows[0]?.id ?? `cbc_${Date.now()}_${codeClean.toLowerCase()}`;

    if (existing.rowCount > 0) {
      await tx.execute(
        `UPDATE credit_bureau_catalogs
         SET description = $1, active = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3
         WHERE id = $4`,
        [descClean, activeInt, input.actorEmail, recordId]
      );
    } else {
      await tx.execute(
        `INSERT INTO credit_bureau_catalogs (id, catalog_group, code, description, active, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)`,
        [recordId, groupClean, codeClean, descClean, activeInt, input.actorEmail]
      );
    }

    await auditEventStore.appendInTx(tx, {
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      action: 'CREDIT_BUREAU_CATALOG_UPDATED',
      outcome: 'success',
      sourceIp: input.sourceIp,
      sourceSummary: input.sourceSummary,
      details: `Catálogo SIC actualizado [${groupClean}:${codeClean}] active=${activeInt}`,
    });

    return {
      id: recordId,
      catalogGroup: groupClean,
      code: codeClean,
      description: descClean,
      active: input.active,
      updatedAt: new Date().toISOString(),
      updatedBy: input.actorEmail,
    };
  });
}

export async function listHistoricalCreditBureauReports(): Promise<CreditBureauReportRecord[]> {
  const res = await db.query<ReportHeaderDbRow>(
    `SELECT
       r.id,
       r.reporting_month,
       r.manifest_hash,
       r.created_at,
       COUNT(d.id) AS total_accounts,
       COALESCE(SUM(d.reported_balance), 0) AS total_reported_balance
     FROM credit_bureau_reports r
     LEFT JOIN credit_bureau_report_details d ON d.report_id = r.id
     GROUP BY r.id, r.reporting_month, r.manifest_hash, r.created_at
     ORDER BY r.created_at DESC
     LIMIT 36`
  );

  return res.rows.map((r) => ({
    id: r.id,
    reportingMonth: r.reporting_month,
    manifestHash: r.manifest_hash,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    totalAccounts: Number(r.total_accounts ?? 0),
    totalReportedBalance: new Decimal(r.total_reported_balance || 0).toFixed(2),
  }));
}

/**
 * Ejecuta la extracción aislada READ ONLY desde PostgreSQL 16, construye el layout determinista
 * y, si `commitSeal === true`, sella el reporte en `credit_bureau_reports`, `credit_bureau_report_details`
 * y `audit_events` bajo bloqueo transaccional `pg_advisory_xact_lock(20260019)`.
 */
export async function executeCreditBureauReportWorkflow(options: {
  cutoffDateIso: string;
  scope: CreditBureauPersonScope;
  commitSeal: boolean;
  actorEmail: string;
  actorRole: UserRole;
  sourceIp: string;
  sourceSummary: string;
}): Promise<CreditBureauGenerateResult> {
  const cutoffIso = normalizeIsoDateString(options.cutoffDateIso, '2026-10-31');
  const reportingMonth = cutoffIso.slice(0, 7);

  // Directriz 2 (Guardrail 3): Extracción de cartera en transacción aislada READ ONLY en PostgreSQL
  const extracted = await db.transaction(async (tx) => {
    if (tx.isPostgres) {
      await tx.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    }

    const portfolioRes = await tx.query<PortfolioSicJoinRow>(
      `SELECT
         la.id AS loan_account_id,
         la.contract_number,
         la.expediente_id,
         la.principal_original,
         la.current_principal_balance,
         la.fortnightly_payment,
         la.payment_frequency,
         la.activated_at,
         la.product_type,
         la.status AS loan_status,
         la.reports_to_credit_bureau,
         e.convenio,
         c.display_name AS convenio_display_name,
         e.full_name AS full_name_masked,
         e.curp_masked,
         e.blind_curp,
         e.voter_id,
         e.address AS address_masked,
         e.phone AS phone_masked,
         e.term_fortnights,
         e.encrypted_pii_payload,
         e.person_type,
         e.rfc_masked,
         e.gender,
         e.birth_date,
         lpa_last.last_payment_date,
         lpa_last.last_payment_amount
       FROM loan_accounts la
       INNER JOIN expedientes e ON e.id = la.expediente_id
       LEFT JOIN convenios c ON c.code = e.convenio
       LEFT JOIN (
         SELECT
           l1.loan_account_id,
           l1.created_at AS last_payment_date,
           l1.amount_received AS last_payment_amount
         FROM loan_payment_applications l1
         INNER JOIN (
           SELECT loan_account_id, MAX(created_at) AS max_ts
           FROM loan_payment_applications
           GROUP BY loan_account_id
         ) l2 ON l1.loan_account_id = l2.loan_account_id AND l1.created_at = l2.max_ts
       ) lpa_last ON lpa_last.loan_account_id = la.id
       WHERE la.reports_to_credit_bureau = 1
       ORDER BY la.contract_number ASC`
    );

    const membersRes = await tx.query<LegalMemberDbRow>(
      `SELECT id, expediente_id, member_role, rfc_masked, encrypted_pii_payload, shareholding_percent
       FROM legal_entity_members`
    );

    const catalogsRes = await tx.query<CatalogDbRow>(
      `SELECT id, catalog_group, code, description, active, updated_at, updated_by
       FROM credit_bureau_catalogs
       WHERE active = 1`
    );

    return {
      portfolioRows: portfolioRes.rows,
      legalMembers: membersRes.rows,
      activeCatalogs: catalogsRes.rows,
    };
  });

  const activeObsCodes = new Set(
    extracted.activeCatalogs
      .filter((c) => c.catalog_group === 'OBSERVATION_CODE')
      .map((c) => c.code)
  );

  const membersByExpediente = new Map<string, LegalMemberDbRow[]>();
  for (const m of extracted.legalMembers) {
    const arr = membersByExpediente.get(m.expediente_id) ?? [];
    arr.push(m);
    membersByExpediente.set(m.expediente_id, arr);
  }

  const rawAccounts: RawSicAccountInput[] = [];
  const previewRows: CreditBureauPreviewRow[] = [];
  const validationIssues: CreditBureauValidationIssue[] = [];

  for (const row of extracted.portfolioRows) {
    const pType: 'FISICA' | 'MORAL' = row.person_type === 'MORAL' ? 'MORAL' : 'FISICA';
    if (options.scope === 'PF' && pType !== 'FISICA') continue;
    if (options.scope === 'PM' && pType !== 'MORAL') continue;

    const blindPrefix = String(row.blind_curp || '').slice(0, 12) || '000000000000';
    const decrypted = await decryptPiiSafely(
      row.encrypted_pii_payload,
      row.expediente_id,
      blindPrefix
    );

    const maskedPreview = maskPiiForPreview({
      rawName: decrypted?.fullName,
      maskedNameFromDb: row.full_name_masked,
      rawCurp: decrypted?.curp,
      curpMaskedFromDb: row.curp_masked,
      rawRfc: decrypted?.rfc,
      rfcMaskedFromDb: row.rfc_masked,
      blindCurp: row.blind_curp,
    });

    const curpClear = decrypted?.curp || row.curp_masked;
    const derivedRfc =
      decrypted?.rfc && decrypted.rfc !== 'NO REGISTRADO EN EXPEDIENTE'
        ? decrypted.rfc
        : curpClear.slice(0, 10) + '000';

    if (!decrypted?.rfc || decrypted.rfc === 'NO REGISTRADO EN EXPEDIENTE') {
      validationIssues.push({
        expedienteId: row.expediente_id,
        blindCurpPrefix: blindPrefix,
        loanAccountId: row.loan_account_id,
        contractNumber: row.contract_number,
        severity: 'WARNING',
        code: 'RFC_DERIVED_FROM_CURP_PREFIX',
        message: `Expediente ${row.expediente_id} (blind_prefix=${blindPrefix}): RFC derivado de los primeros 10 caracteres de clave oficial para layout SIC.`,
      });
    }

    // RN-06: Personas Morales requieren socio/representante legal en legal_entity_members
    let shareholderRfc: string | null = null;
    let shareholderName: string | null = null;
    let shareholderPercent: string | number | null = null;

    if (pType === 'MORAL') {
      const members = membersByExpediente.get(row.expediente_id) ?? [];
      if (members.length === 0) {
        validationIssues.push({
          expedienteId: row.expediente_id,
          blindCurpPrefix: blindPrefix,
          loanAccountId: row.loan_account_id,
          contractNumber: row.contract_number,
          severity: 'ERROR',
          code: 'RN06_MISSING_LEGAL_MEMBER',
          message: `RN-06: Persona Moral en expediente ${row.expediente_id} (blind_prefix=${blindPrefix}) carece de Obligado Solidario / Socio en legal_entity_members.`,
        });
      } else {
        const primaryMember = members[0]!;
        const decMember = await decryptPiiSafely(
          primaryMember.encrypted_pii_payload,
          row.expediente_id,
          blindPrefix
        );
        shareholderRfc = decMember?.rfc || primaryMember.rfc_masked;
        shareholderName = decMember?.fullName || 'ACCIONISTA REGISTRADO';
        shareholderPercent = primaryMember.shareholding_percent ?? 50;
      }
    }

    // RN-05: Determinación de mora y clave de observación en Cobranza Extrajudicial / Liquidación
    const currentBalDec = new Decimal(row.current_principal_balance || 0);
    let daysPastDue = 0;
    let pastDueBalanceDec = new Decimal(0);
    let observationCode: string | null = null;

    if (row.loan_status === 'FROZEN_EXTRAJUDICIAL') {
      daysPastDue = 90;
      pastDueBalanceDec = currentBalDec;
      observationCode = activeObsCodes.has('SG') ? 'SG' : 'UP';
    } else if (row.loan_status === 'DEFAULTED') {
      daysPastDue = 60;
      pastDueBalanceDec = currentBalDec;
      observationCode = activeObsCodes.has('UP') ? 'UP' : null;
    } else if (row.loan_status === 'PAID' || currentBalDec.isZero()) {
      daysPastDue = 0;
      pastDueBalanceDec = new Decimal(0);
      observationCode = activeObsCodes.has('CC') ? 'CC' : null;
    }

    const activatedIso = normalizeIsoDateString(row.activated_at, cutoffIso);
    const lastPayIso = normalizeIsoDateString(row.last_payment_date, activatedIso);
    const birthIso =
      row.birth_date
        ? normalizeIsoDateString(row.birth_date, '1980-01-01')
        : '1980-01-01';

    rawAccounts.push({
      contractNumber: row.contract_number,
      personType: pType,
      fullNameCleartext: decrypted?.fullName || row.full_name_masked,
      rfcCleartext: derivedRfc,
      curpCleartext: curpClear,
      birthDateIso: birthIso,
      gender: row.gender,
      voterIdCleartext: decrypted?.voterId || row.voter_id,
      addressCleartext: decrypted?.address || 'CHIHUAHUA CHIH',
      phoneCleartext: decrypted?.phone || '6144155754',
      convenioName: row.convenio_display_name || row.convenio,
      productType: row.product_type,
      loanStatus: row.loan_status,
      paymentFrequency: row.payment_frequency,
      termFortnights: Number(row.term_fortnights || 24),
      originalPrincipal: row.principal_original,
      currentPrincipalBalance: row.current_principal_balance,
      scheduledPayment: row.fortnightly_payment,
      activatedAtIso: activatedIso,
      lastPaymentDateIso: lastPayIso,
      lastPaymentAmount: row.last_payment_amount ?? row.fortnightly_payment,
      daysPastDue,
      pastDueBalance: pastDueBalanceDec.toFixed(2),
      observationCode,
      shareholderRfc,
      shareholderName,
      shareholderPercent,
    });

    const sicFreq = mapPaymentFrequencyToSicCode(row.payment_frequency);
    const { pagoActual } = computeSicPaymentStatus(daysPastDue, sicFreq);

    previewRows.push({
      loanAccountId: row.loan_account_id,
      expedienteId: row.expediente_id,
      blindCurpPrefix: maskedPreview.blindCurpPrefix,
      contractNumber: row.contract_number,
      personType: pType,
      convenio: row.convenio,
      maskedName: maskedPreview.maskedName,
      curpMasked: maskedPreview.curpMasked,
      rfcMasked: maskedPreview.rfcMasked,
      productType: row.product_type,
      loanStatus: row.loan_status,
      paymentFrequencySic: sicFreq,
      termPeriods: Number(row.term_fortnights || 24),
      termMonthsSic: calculateSicTermDaysOrMonths(Number(row.term_fortnights || 24), sicFreq),
      originalPrincipal: formatSicIntegerAmount(row.principal_original),
      currentBalance: formatSicIntegerAmount(row.current_principal_balance),
      pastDueBalance: formatSicIntegerAmount(pastDueBalanceDec),
      scheduledPayment: formatSicIntegerAmount(row.fortnightly_payment),
      daysPastDue,
      paymentStatusSic: pagoActual,
      observationCode,
      openedDateSic: formatIsoToYyyyMmDd(activatedIso, '20260101'),
      cutoffDateSic: formatIsoToYyyyMmDd(cutoffIso, '20261031'),
    });
  }

  const built = buildDeterministicCreditBureauLayouts(rawAccounts, cutoffIso);
  const combinedPayloadForHash = `${built.pfPipeContent}\n---PM---\n${built.pmCsvContent}`;
  const manifestHash = crypto
    .createHash('sha256')
    .update(combinedPayloadForHash, 'utf8')
    .digest('hex');

  let reportId: string | undefined;

  // Directriz 2 (Guardrail 2): Trazabilidad WORM y pg_advisory_xact_lock(20260019)
  await db.transaction(async (tx) => {
    if (tx.isPostgres) {
      await tx.query('SELECT pg_advisory_xact_lock(20260019);');
    }

    if (options.commitSeal) {
      reportId = `cbr_${Date.now()}_${manifestHash.slice(0, 8)}`;
      await tx.execute(
        `INSERT INTO credit_bureau_reports (id, reporting_month, manifest_hash, created_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [reportId, reportingMonth, manifestHash]
      );

      for (const row of previewRows) {
        const detailId = `cbrd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        await tx.execute(
          `INSERT INTO credit_bureau_report_details (
             id, report_id, loan_account_id, reported_balance, days_past_due, observation_code, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [
            detailId,
            reportId,
            row.loanAccountId,
            Number(row.currentBalance),
            row.daysPastDue,
            row.observationCode,
          ]
        );
      }
    }

    await auditEventStore.appendInTx(tx, {
      actorEmail: options.actorEmail,
      actorRole: options.actorRole,
      action: 'CREDIT_BUREAU_REPORT_GENERATED',
      outcome: 'success',
      sourceIp: options.sourceIp,
      sourceSummary: options.sourceSummary,
      details: JSON.stringify({
        mode: options.commitSeal ? 'WORM_SEALED_EXPORT' : 'DETERMINISTIC_PREVIEW',
        reportId: reportId ?? null,
        officialFileName: built.officialFileNameBase,
        reportingMonth,
        cutoffDate: cutoffIso,
        scope: options.scope,
        totalAccounts: built.controlTotals.totalAccountsReported,
        manifestHash,
      }),
    });
  });

  return {
    reportId,
    reportingMonth,
    cutoffDateIso: cutoffIso,
    cutoffDateYyyyMmDd: built.cutoffYyyyMmDd,
    officialFileNameBase: built.officialFileNameBase,
    manifestHash,
    controlTotals: built.controlTotals,
    previewRows,
    validationIssues,
    pfCsvContent: options.commitSeal ? built.pfCsvContent : undefined,
    pfPipeContent: options.commitSeal ? built.pfPipeContent : undefined,
    pmCsvContent: options.commitSeal ? built.pmCsvContent : undefined,
  };
}
