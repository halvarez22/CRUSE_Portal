import xlsx from 'xlsx';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';

const loanFile = 'C:\\CRUSE_PORTAL\\Exceles_Alma\\Q. CREDITOS ACTIVOS admon y cotejo.xlsx';
const dbFile = 'C:\\CRUSE_PORTAL\\cruse-fintech-portal\\db\\cruse_fintech.db';

const db = new DatabaseSync(dbFile);

// Utilidad para normalizar fechas de Excel
function parseExcelDate(excelDate) {
  if (typeof excelDate === 'number') {
    const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }
  return new Date(excelDate).toISOString().split('T')[0];
}

function generateBlindIndex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function runLoansETL(filePath) {
  console.log(`[ETL] Extrayendo datos de: ${filePath}`);
  const wb = xlsx.readFile(filePath);
  const sheetName = wb.SheetNames[0]; // LISTA HDA 30 SEP 2026
  
  const rawData = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { raw: true });
  console.log(`[ETL] ${rawData.length} registros encontrados. Iniciando Transformación...`);

  let insertedExpedientes = 0;
  let insertedLoans = 0;
  let skipped = 0;

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of rawData) {
      if (!row['NOMBRE']) continue; // Saltar filas vacías
      
      const rawName = String(row['NOMBRE']).trim();
      const rawCurp = row['NUMERO DE EMPLEADO'] ? String(row['NUMERO DE EMPLEADO']).trim() : `FAKE_CURP_${crypto.randomBytes(4).toString('hex')}`;
      
      const capital = Number(row['MONTO DE CREDITO']) || 0;
      const plazo = Number(row['PLAZO']) || 0;
      const cuota = Number(row['CUOTA']) || 0;
      
      const blindCurp = generateBlindIndex(rawCurp);
      const expedienteId = `exp_${blindCurp.substring(0, 16)}`;
      
      // 1. Cargar Expediente (INSERT OR IGNORE)
      const existingExpediente = db.prepare(`SELECT id FROM expedientes WHERE id = ?`).all(expedienteId);
      
      if (existingExpediente.length === 0) {
        db.prepare(`
          INSERT INTO expedientes (id, curp_blind_index, encrypted_first_name, encrypted_last_name, encrypted_phone, encrypted_address)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(expedienteId, blindCurp, `ENC(${rawName})`, 'ENC()', 'ENC()', 'ENC()');
        insertedExpedientes++;
      }

      // 2. Cargar Loan Account
      const contractNumber = row['NUMERO DE CONTRATO '] ? String(row['NUMERO DE CONTRATO ']).trim() : `CTX-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const existingLoan = db.prepare(`SELECT expediente_id FROM loan_accounts WHERE contract_number = ?`).all(contractNumber);
      
      if (existingLoan.length === 0) {
        db.prepare(`
          INSERT INTO loan_accounts (
            expediente_id, agreement_code, contract_number, capital_balance, 
            status, initial_capital, product_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          expedienteId, 
          'HACIENDA', 
          contractNumber, 
          capital, 
          'ACTIVE', 
          capital,
          'NOMINA_NORMAL'
        );
        insertedLoans++;
      } else {
        skipped++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.log(`[ETL] Carga Completa.`);
  console.log(`[ETL] Expedientes creados: ${insertedExpedientes}`);
  console.log(`[ETL] Créditos insertados: ${insertedLoans}`);
  console.log(`[ETL] Duplicados omitidos (Idempotencia): ${skipped}`);
}

async function main() {
  console.log('Iniciando proceso ETL Histórico (Standalone)...');
  try {
    runLoansETL(loanFile);
    console.log('✅ Migración exitosa.');
  } catch (err) {
    console.error('❌ Error en la migración:', err);
  }
}

main();
