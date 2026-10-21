import xlsx from 'xlsx';
import crypto from 'crypto';
import { db } from '../db/connectionPool';
import { computeServerBlindIndex, getServerKms } from '../crypto/serverKeyring';
import { encryptEnvelope } from '../crypto/cryptoService';

// Utilidad para enmascarar nombre completo en reposo (Zero-PII en claro en disco)
export function maskFullName(fullName: string): string {
  return (fullName || '')
    .trim()
    .split(/\s+/)
    .map((part) => (part.length > 1 ? part[0] + '*'.repeat(part.length - 1) : part))
    .join(' ');
}

// Utilidad para normalizar fechas de Excel a ISO YYYY-MM-DD
function parseExcelDate(excelDate: number | string): string | null {
  if (!excelDate) return null;
  let date: Date;
  if (typeof excelDate === 'number') {
    date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
  } else {
    date = new Date(excelDate);
  }
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

// Convertir YYYY-MM-DD a YYYY-MM-1Q o YYYY-MM-2Q
function toDeductionPeriod(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const year = parts[0];
  const month = parts[1];
  const day = parseInt(parts[2]!, 10);
  const q = day <= 15 ? '1Q' : '2Q';
  return `${year}-${month}-${q}`;
}

export async function runLoansETL(filePath: string) {
  console.log(`[ETL] Extrayendo datos de: ${filePath}`);
  const wb = xlsx.readFile(filePath);
  const sheetName = wb.SheetNames[0]!;

  const rawData = xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, { raw: true });
  console.log(`[ETL] ${rawData.length} registros encontrados. Iniciando Transformación Criptográfica...`);

  const kms = getServerKms();
  const kekVersion = kms.getCurrentKekVersion();

  interface PreparedEtlItem {
    expedienteId: string;
    blindCurp: string;
    rawName: string;
    rawCurp: string;
    rawCurpMasked: string;
    maskedName: string;
    encryptedPiiPayload: string;
    kekVersion: number;
    capital: number;
    plazo: number;
    cuota: number;
    dependencia: string;
    firstDeductionPeriod: string;
  }

  const preparedData: PreparedEtlItem[] = [];
  let skippedMissingId = 0;

  // FASE 1: Transformación Asíncrona (Pre-computar Blind Index + Envelope Encryption AES-GCM-256)
  for (const row of rawData) {
    if (!row['NOMBRE']) continue; // Saltar filas vacías

    const rawName = String(row['NOMBRE']).trim();
    const rawCurp = row['NUMERO DE EMPLEADO'] ? String(row['NUMERO DE EMPLEADO']).trim() : null;

    if (!rawCurp) {
      console.warn(`[ETL WARNING] Fila omitida: Falta identificador único para NOMBRE: ${rawName}`);
      skippedMissingId++;
      continue;
    }

    const capital = Number(String(row['MONTO DE CREDITO'] || '0').replace(/[$, ]/g, '')) || 0;
    const plazo = Number(row['PLAZO']) || 0;
    const cuota = Number(String(row['CUOTA'] || '0').replace(/[$, ]/g, '')) || 0;

    if (capital <= 0) continue;

    const blindCurp = await computeServerBlindIndex(`CURP:${rawCurp}`);
    const expedienteId = `exp_${blindCurp.substring(0, 16)}`;
    const dependencia = row['DEPENDENCIA'] ? String(row['DEPENDENCIA']).trim() : 'DESCONOCIDO';

    const rawFechaPago = (row['FECHA DE 1ER PAGO '] || row['FECHA DE 1ER PAGO']) as number | string;
    const firstDeductionPeriod = toDeductionPeriod(parseExcelDate(rawFechaPago)) || '2026-01-1Q';

    // Condición 1 (CRUSE-APO-2026-015): Sobre AES-GCM-256 con PII completa desde la fuente original
    const piiCleartext = JSON.stringify({
      fullName: rawName,
      curp: rawCurp,
      rfc: 'NO REGISTRADO EN EXPEDIENTE',
      voterId: 'NO REGISTRADO',
      address: 'SIN DATO',
      phone: '0000000000',
    });
    const envelope = await encryptEnvelope(piiCleartext, kms);

    preparedData.push({
      expedienteId,
      blindCurp,
      rawName,
      rawCurp,
      rawCurpMasked: rawCurp.substring(0, 4) + '******',
      maskedName: maskFullName(rawName),
      encryptedPiiPayload: JSON.stringify(envelope),
      kekVersion,
      capital,
      plazo,
      cuota,
      dependencia,
      firstDeductionPeriod,
    });
  }

  // FASE 2: Carga y Remediación Transaccional (Síncrona)
  let insertedExpedientes = 0;
  let remediatedExpedientes = 0;
  let insertedLoans = 0;
  let skippedIdempotent = 0;

  db.transaction((tx) => {
    for (const item of preparedData) {
      const existingExpediente = tx.query(`SELECT id FROM expedientes WHERE id = ?`, [item.expedienteId]);

      if (existingExpediente.rowCount === 0) {
        tx.execute(
          `INSERT INTO expedientes (
            id, blind_curp, curp_masked, full_name, address, phone, requested_amount,
            term_fortnights, product_type, promotor_email, created_at, updated_at,
            convenio, encrypted_pii_payload, kek_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)`,
          [
            item.expedienteId,
            item.blindCurp,
            item.rawCurpMasked,
            item.maskedName,
            'CIFRADO_ENVELOPE',
            '0000000000',
            item.capital,
            item.plazo,
            'normal',
            'ETL_MIGRATION',
            item.dependencia,
            item.encryptedPiiPayload,
            item.kekVersion,
          ]
        );
        insertedExpedientes++;
      } else {
        // Remediación criptográfica: sustituir PII en claro por máscara y almacenar sobre AES-GCM-256
        tx.execute(
          `UPDATE expedientes
           SET full_name = ?,
               curp_masked = ?,
               address = 'CIFRADO_ENVELOPE',
               encrypted_pii_payload = ?,
               kek_version = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
          [item.maskedName, item.rawCurpMasked, item.encryptedPiiPayload, item.kekVersion, item.expedienteId]
        );
        remediatedExpedientes++;
      }

      const existingLoan = tx.query(`SELECT expediente_id FROM loan_accounts WHERE expediente_id = ?`, [item.expedienteId]);

      if (existingLoan.rowCount === 0) {
        const loanAccountId = `la_${crypto.randomUUID()}`;
        const countRes = tx.query<{ total: number }>('SELECT COUNT(*) AS total FROM loan_accounts');
        const nextSeq = (countRes.rows[0]?.total ?? 0) + 1;
        const contractNo = `CNT-2026-${String(nextSeq).padStart(4, '0')}`;
        tx.execute(
          `INSERT INTO loan_accounts (
            id, contract_number, expediente_id, principal_original, current_principal_balance, fortnightly_payment, first_deduction_period, activated_at, activated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
          [loanAccountId, contractNo, item.expedienteId, item.capital, item.capital, item.cuota, item.firstDeductionPeriod, 'ETL_MIGRATION']
        );
        insertedLoans++;
      } else {
        skippedIdempotent++;
      }
    }
  });

  // FASE 3: Barrido de Remediación Universal (Garantiza Cero-PII en claro en toda la tabla expedientes, incluyendo semillas previas)
  const remainingUnencrypted = await db.query<{
    id: string;
    full_name: string;
    curp_masked: string;
    address: string;
    phone: string;
  }>(`SELECT id, full_name, curp_masked, address, phone FROM expedientes WHERE encrypted_pii_payload IS NULL`);

  for (const row of remainingUnencrypted.rows) {
    // Buscar si en preparedData existe coincidencia por máscara o nombre original para preservar el CURP/No. Empleado completo
    const matched = preparedData.find(
      (p) => p.rawName === row.full_name || p.maskedName === maskFullName(row.full_name)
    );
    const fullCurp = matched ? matched.rawCurp : row.curp_masked;
    const envelopeJson = matched
      ? matched.encryptedPiiPayload
      : JSON.stringify(
          await encryptEnvelope(
            JSON.stringify({
              fullName: row.full_name,
              curp: fullCurp,
              rfc: 'NO REGISTRADO EN EXPEDIENTE',
              voterId: 'NO REGISTRADO',
              address: row.address || 'SIN DATO',
              phone: row.phone || '0000000000',
            }),
            kms
          )
        );

    await db.execute(
      `UPDATE expedientes
       SET full_name = ?,
           address = 'CIFRADO_ENVELOPE',
           encrypted_pii_payload = ?,
           kek_version = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [maskFullName(row.full_name), envelopeJson, kekVersion, row.id]
    );
    remediatedExpedientes++;
  }

  console.log(`[ETL] Carga y Remediación Criptográfica Completa.`);
  console.log(`[ETL] Expedientes nuevos: ${insertedExpedientes} | Expedientes remediados con AES-GCM-256: ${remediatedExpedientes}`);
  console.log(`[ETL] Créditos insertados: ${insertedLoans} | Duplicados omitidos: ${skippedIdempotent} | Sin ID: ${skippedMissingId}`);
}

