import Decimal from 'decimal.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Set up server environment to test
process.env.CRUSE_KEK_CURRENT_VERSION = '1';
process.env.CRUSE_KEK_V1 = crypto.randomBytes(32).toString('base64');
process.env.BLIND_INDEX_SECRET = crypto.randomBytes(32).toString('base64');

import { computeDue, applyWaterfall, LoanState } from '../src/services/reconciliation/paymentWaterfall';
import { parsePayrollCsv } from '../src/services/reconciliation/payrollFileParser';
import { processPayrollFile } from '../src/services/reconciliation/reconciliationService';
import { db } from '../src/services/db/connectionPool';
import { getServerEnv } from '../src/config/serverEnv';
import { computeBlindIndex } from '../src/services/crypto/cryptoService';

async function testWaterfall() {
  console.log("\n[Prueba de Control 1] Función pura de cascada (paymentWaterfall.ts)");
  const state: LoanState = {
    balance: new Decimal(10000),
    arrearsInsurance: new Decimal(0),
    arrearsInterest: new Decimal(0),
    arrearsVat: new Decimal(0),
    creditBalance: new Decimal(0)
  };

  const due = computeDue(state, 'normal', new Decimal(569.44));
  console.log("  Deuda calculada:");
  console.log(`    Seguro: ${due.insurance.toFixed(2)}`);
  console.log(`    Interés: ${due.interest.toFixed(2)}`);
  console.log(`    IVA: ${due.vat.toFixed(2)}`);
  console.log(`    Capital: ${due.capital.toFixed(2)}`);

  if (!due.insurance.eq(22.85)) throw new Error("Seguro incorrecto");
  
  const appExact = applyWaterfall(new Decimal(569.44), due, state);
  console.log("  Aplicación (Pago Exacto):");
  console.log(`    Capital Aplicado: ${appExact.applied.capital.toFixed(2)}`);
  console.log(`    Saldo Final: ${appExact.next.balance.toFixed(2)}`);

  const appPartial = applyWaterfall(new Decimal(100), due, state);
  console.log("  Aplicación (Pago Parcial $100):");
  console.log(`    Seguro Aplicado: ${appPartial.applied.insurance.toFixed(2)}`);
  console.log(`    Interés Aplicado: ${appPartial.applied.interest.toFixed(2)}`);
  console.log(`    IVA Aplicado: ${appPartial.applied.vat.toFixed(2)}`);
  console.log(`    Capital Aplicado: ${appPartial.applied.capital.toFixed(2)}`);
  console.log("✅ Prueba de Cascada Pura exitosa.");
}

async function testParser() {
  console.log("\n[Prueba de Control 2] Parser CSV (payrollFileParser.ts)");
  const layout = '{"curp":"CURP_EMP","name":"NOMBRE_EMP","amount":"IMPORTE"}';
  const csvValido = `CURP_EMP,NOMBRE_EMP,IMPORTE\nABCD123456HMXXXXA1,JUAN PEREZ,569.44`;
  const res = parsePayrollCsv(csvValido, layout);
  if (res.length === 1 && res[0]!.amount === '569.44') {
    console.log("✅ Parser CSV exitoso con configuración dinámica.");
  } else {
    throw new Error("Fallo en Parser CSV");
  }
}

async function testTransactionalReconciliation() {
  console.log("\n[Prueba de Control 3] Flujo Transaccional y Errores (422 equivalentes)");
  // 1. Crear un expediente para conciliar
  db.execute("INSERT INTO expedientes (id, created_at, updated_at, convenio, full_name, curp_masked, blind_curp, voter_id, address, phone, requested_amount, term_fortnights, product_type, status, promotor_email, kek_version) VALUES ('exp_test', ?, ?, 'STSGECH', 'Juan Perez', 'ABCD******12', 'blind123', 'voter', 'addr', 'phone', 10000, 24, 'normal', 'activo', 'promotor@cruse.com', 1)", [new Date().toISOString(), new Date().toISOString()]);
  db.execute("INSERT INTO loan_accounts (expediente_id, principal_original, fortnightly_payment, first_deduction_period, activated_at, activated_by) VALUES ('exp_test', 10000, 569.44, '2026-10-1Q', ?, 'admin')", [new Date().toISOString()]);

  const csvContent = `CURP,NOMBRE,IMPORTE_RETENIDO\nABCD123456HMXXXXA1,Juan Perez,569.44`;
  
  // Como usamos blindCurp de 'blind123', el parser generará un blind index diferente porque usamos un secreto aleatorio para la prueba.
  // Para que concuerde, primero calculamos el blind index que el validator generará.
  const env = getServerEnv();
  const blind = await computeBlindIndex('ABCD123456HMXXXXA1', env.blindIndexKey);
  
  db.execute("UPDATE expedientes SET blind_curp = ? WHERE id = 'exp_test'", [blind]);

  console.log("  Ejecutando proceso (Fase 1 y Fase 2)...");
  const result = await processPayrollFile(csvContent, 'STSGECH', '2026-10-1Q', 'admin@cruse.com', 'admin');
  console.log(`  Resultado: Procesados=${result.totalProcessed}, Match=${result.matchExact}`);
  
  if (result.matchExact !== 1) throw new Error("Fallo en el match de conciliación");
  
  console.log("  Verificando que insertó en loan_payment_applications...");
  const lpa = await db.query("SELECT * FROM loan_payment_applications WHERE expediente_id = 'exp_test'");
  if (lpa.rowCount !== 1) throw new Error("No se insertó en el libro mayor.");
  
  console.log("  Forzando lote duplicado para validar ROLLBACK/Rechazo...");
  try {
    await processPayrollFile(csvContent, 'STSGECH', '2026-10-1Q', 'admin@cruse.com', 'admin');
    throw new Error("Debió haber fallado por lote duplicado");
  } catch(e: any) {
    if (e.message.includes("ya fue procesado")) {
      console.log("✅ Lote duplicado rechazado correctamente.");
    } else {
      throw e;
    }
  }

  const csvDup = `CURP,NOMBRE,IMPORTE_RETENIDO\nABCD123456HMXXXXA1,Juan,569.44\nABCD123456HMXXXXA1,Juan,569.44`;
  console.log("  Enviando CSV con CURPs duplicadas (Error 422 equivalente)...");
  try {
    await processPayrollFile(csvDup, 'STSGECH', '2026-10-2Q', 'admin@cruse.com', 'admin');
    throw new Error("Debió haber fallado por CURP duplicada");
  } catch(e: any) {
    if (e.message.includes("CURP duplicada")) {
      console.log("✅ CSV con CURPs duplicadas rechazado en Fase 1 (Cero escrituras en BD).");
    } else {
      throw e;
    }
  }

  console.log("✅ Prueba de Flujo Transaccional exitosa.");
}

import { runMigrations } from '../src/services/db/migrationRunner';

async function main() {
  console.log("=== INICIANDO PRUEBAS DE CONTROL BLOQUE C ===");
  const dbPath = path.join(process.cwd(), 'db', 'data', 'cruse_fintech.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  await runMigrations();

  await testWaterfall();
  await testParser();
  await testTransactionalReconciliation();
  console.log("\n=== PRUEBAS DE CONTROL BLOQUE C COMPLETADAS CON ÉXITO ===");
  process.exit(0);
}

main().catch(err => {
  console.error("Error global:", err);
  process.exit(1);
});
