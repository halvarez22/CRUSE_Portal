import xlsx from 'xlsx';
import { db } from '../db/connectionPool';
import { computeServerBlindIndex } from '../crypto/serverKeyring';

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
  const day = parseInt(parts[2], 10);
  const q = day <= 15 ? '1Q' : '2Q';
  return `${year}-${month}-${q}`;
}

export async function runLoansETL(filePath: string) {
  console.log(`[ETL] Extrayendo datos de: ${filePath}`);
  const wb = xlsx.readFile(filePath);
  const sheetName = wb.SheetNames[0]; 
  
  const rawData = xlsx.utils.sheet_to_json<any>(wb.Sheets[sheetName], { raw: true });
  console.log(`[ETL] ${rawData.length} registros encontrados. Iniciando Transformación...`);

  const preparedData: any[] = [];
  let skippedMissingId = 0;

  // FASE 1: Transformación Asíncrona (Pre-computar Criptografía)
  for (const row of rawData) {
    if (!row['NOMBRE']) continue; // Saltar filas vacías
    
    const rawName = String(row['NOMBRE']).trim();
    const rawCurp = row['NUMERO DE EMPLEADO'] ? String(row['NUMERO DE EMPLEADO']).trim() : null;
    
    // Hallazgo ETL-3: Rechazar si no hay identificador único
    if (!rawCurp) {
      console.warn(`[ETL WARNING] Fila omitida: Falta identificador único para NOMBRE: ${rawName}`);
      skippedMissingId++;
      continue;
    }

    // Sanitización de Montos (Regex para comas y signos $)
    const capital = Number(String(row['MONTO DE CREDITO'] || '0').replace(/[$, ]/g, '')) || 0;
    const plazo = Number(row['PLAZO']) || 0;
    const cuota = Number(String(row['CUOTA'] || '0').replace(/[$, ]/g, '')) || 0;
    
    if (capital <= 0) continue; 
    
    // Hallazgo ETL-1: Uso correcto del servicio criptográfico y HMAC
    const blindCurp = await computeServerBlindIndex(`CURP:${rawCurp}`);
    const expedienteId = `exp_${blindCurp.substring(0, 16)}`;
    
    // Hallazgo ETL-4: Convenios dinámicos
    const dependencia = row['DEPENDENCIA'] ? String(row['DEPENDENCIA']).trim() : 'DESCONOCIDO';
    
    // Hallazgo ETL-2: Leer fecha histórica
    const rawFechaPago = row['FECHA DE 1ER PAGO '] || row['FECHA DE 1ER PAGO'];
    const firstDeductionPeriod = toDeductionPeriod(parseExcelDate(rawFechaPago)) || '2026-01-1Q'; // Fallback a inicio de año operativo si falla

    preparedData.push({
      expedienteId,
      blindCurp,
      rawCurpMasked: rawCurp.substring(0, 4) + '******',
      rawName,
      capital,
      plazo,
      cuota,
      dependencia,
      firstDeductionPeriod
    });
  }

  // FASE 2: Carga Transaccional (Síncrona)
  let insertedExpedientes = 0;
  let insertedLoans = 0;
  let skippedIdempotent = 0;

  db.transaction((tx) => {
    for (const item of preparedData) {
      // 1. Cargar Expediente (Idempotente)
      const existingExpediente = tx.query(`SELECT id FROM expedientes WHERE id = ?`, [item.expedienteId]);
      
      if (existingExpediente.rowCount === 0) {
        tx.execute(`
          INSERT INTO expedientes (
            id, blind_curp, curp_masked, full_name, address, phone, requested_amount, term_fortnights, product_type, promotor_email, created_at, updated_at, convenio
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
        `, [
          item.expedienteId, item.blindCurp, item.rawCurpMasked, item.rawName, 'SIN DATO', '0000000000', item.capital, item.plazo, 'normal', 'ETL_MIGRATION', item.dependencia
        ]);
        insertedExpedientes++;
      }

      // 2. Cargar Loan Account
      const existingLoan = tx.query(`SELECT expediente_id FROM loan_accounts WHERE expediente_id = ?`, [item.expedienteId]);
      
      if (existingLoan.rowCount === 0) {
        tx.execute(`
          INSERT INTO loan_accounts (
            expediente_id, principal_original, fortnightly_payment, first_deduction_period, activated_at, activated_by
          ) VALUES (?, ?, ?, ?, datetime('now'), ?)
        `, [
          item.expedienteId, item.capital, item.cuota, item.firstDeductionPeriod, 'ETL_MIGRATION'
        ]);
        insertedLoans++;
      } else {
        skippedIdempotent++;
      }
    }
  });

  console.log(`[ETL] Carga Completa.`);
  console.log(`[ETL] Expedientes creados: ${insertedExpedientes}`);
  console.log(`[ETL] Créditos insertados: ${insertedLoans}`);
  console.log(`[ETL] Duplicados omitidos (Idempotencia): ${skippedIdempotent}`);
  console.log(`[ETL] Registros omitidos (Sin ID): ${skippedMissingId}`);
}
