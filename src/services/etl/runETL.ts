import xlsx from 'xlsx';
import crypto from 'crypto';
import { db } from '../db/connectionPool';
import { computeServerBlindIndex, getServerKms } from '../crypto/serverKeyring';
import { encryptEnvelope } from '../crypto/cryptoService';

export function maskFullName(fullName: string): string {
  return (fullName || '')
    .trim()
    .split(/\s+/)
    .map((part) => (part.length > 1 ? part[0] + '*'.repeat(part.length - 1) : part))
    .join(' ');
}

function parseExcelDate(excelDate: number | string): string | null {
  if (!excelDate) return null;
  let date: Date;
  if (typeof excelDate === 'number') {
    date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
  } else {
    date = new Date(excelDate);
  }
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0] ?? null;
}

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

  const rawData = xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, {
    raw: true,
  });
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

  for (const row of rawData) {
    if (!row['NOMBRE']) continue;

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

  let insertedExpedientes = 0;
  let remediatedExpedientes = 0;
  let insertedLoans = 0;
  let skippedIdempotent = 0;

  await db.transaction(async (tx) => {
    for (const item of preparedData) {
      const existingExpediente = await tx.query(`SELECT id FROM expedientes WHERE id = $1`, [
        item.expedienteId,
      ]);

      if (existingExpediente.rowCount === 0) {
        await tx.execute(
          `INSERT INTO expedientes (
            id, blind_curp, curp_masked, full_name, address, phone, requested_amount,
            term_fortnights, product_type, promotor_email, created_at, updated_at,
            convenio, encrypted_pii_payload, kek_version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $11, $12, $13)`,
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
        await tx.execute(
          `UPDATE expedientes
           SET full_name = $1,
               curp_masked = $2,
               address = 'CIFRADO_ENVELOPE',
               encrypted_pii_payload = $3,
               kek_version = $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [
            item.maskedName,
            item.rawCurpMasked,
            item.encryptedPiiPayload,
            item.kekVersion,
            item.expedienteId,
          ]
        );
        remediatedExpedientes++;
      }

      const existingLoan = await tx.query(
        `SELECT expediente_id FROM loan_accounts WHERE expediente_id = $1`,
        [item.expedienteId]
      );

      if (existingLoan.rowCount === 0) {
        const loanAccountId = `la_${crypto.randomUUID()}`;
        const countRes = await tx.query<{ total: number }>(
          'SELECT COUNT(*) AS total FROM loan_accounts'
        );
        const nextSeq = Number(countRes.rows[0]?.total ?? 0) + 1;
        const contractNo = `CNT-2026-${String(nextSeq).padStart(4, '0')}`;
        await tx.execute(
          `INSERT INTO loan_accounts (
            id, contract_number, expediente_id, principal_original, current_principal_balance, fortnightly_payment, first_deduction_period, activated_at, activated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8)`,
          [
            loanAccountId,
            contractNo,
            item.expedienteId,
            item.capital,
            item.capital,
            item.cuota,
            item.firstDeductionPeriod,
            'ETL_MIGRATION',
          ]
        );
        insertedLoans++;
      } else {
        skippedIdempotent++;
      }
    }
  });

  const remainingUnencrypted = await db.query<{
    id: string;
    full_name: string;
    curp_masked: string;
    address: string;
    phone: string;
  }>(
    `SELECT id, full_name, curp_masked, address, phone FROM expedientes WHERE encrypted_pii_payload IS NULL`
  );

  for (const row of remainingUnencrypted.rows) {
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
       SET full_name = $1,
           address = 'CIFRADO_ENVELOPE',
           encrypted_pii_payload = $2,
           kek_version = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [maskFullName(row.full_name), envelopeJson, kekVersion, row.id]
    );
    remediatedExpedientes++;
  }

  console.log(`[ETL] Carga y Remediación Criptográfica Completa.`);
  console.log(
    `[ETL] Expedientes nuevos: ${insertedExpedientes} | Expedientes remediados con AES-GCM-256: ${remediatedExpedientes}`
  );
  console.log(
    `[ETL] Créditos insertados: ${insertedLoans} | Duplicados omitidos: ${skippedIdempotent} | Sin ID: ${skippedMissingId}`
  );
}
