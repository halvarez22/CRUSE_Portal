import { calculateMonthlyYieldAndISR } from './src/services/funding/fundingEngine';
import { runMonthlyFundingSettle } from './src/services/funding/fundingCron';
import { db } from './src/services/db/connectionPool';
import crypto from 'crypto';

async function runTests() {
  console.log('--- TEST A: Mes de 31 días (Ej. Octubre) ---');
  // Capital $100,000 MXN, Tasa Anual 18% (0.18), ISR 0.5% (0.005)
  const res31 = calculateMonthlyYieldAndISR(100000, 0.18, 0.005, 31);
  console.log('Gross:', res31.grossYield, '(Expected: 1550)'); // 100000 * 0.18 / 360 * 31 = 1550
  console.log('ISR:', res31.isrRetained, '(Expected: 43.06)'); // 100000 * 0.005 / 360 * 31 = 43.055... -> 43.06
  console.log('Net:', res31.netYield, '(Expected: 1506.94)');
  if (res31.grossYield !== 1550 || res31.isrRetained !== 43.06 || res31.netYield !== 1506.94) {
    throw new Error('TEST A FAILED');
  }

  console.log('\n--- TEST B: Mes de 30 días (Ej. Noviembre) ---');
  // Tasa Anual 24% (0.24), ISR 0.9% (0.009)
  const res30 = calculateMonthlyYieldAndISR(100000, 0.24, 0.009, 30);
  console.log('Gross:', res30.grossYield, '(Expected: 2000)'); // 100000 * 0.24 / 360 * 30 = 2000
  console.log('ISR:', res30.isrRetained, '(Expected: 75.00)'); // 100000 * 0.009 / 360 * 30 = 75
  console.log('Net:', res30.netYield, '(Expected: 1925)');
  if (res30.grossYield !== 2000 || res30.isrRetained !== 75 || res30.netYield !== 1925) {
    throw new Error('TEST B FAILED');
  }

  console.log('\n--- TEST C: Mes de 28 días (Ej. Febrero) ---');
  // Tasa Anual 18% (0.18), ISR 0.5% (0.005)
  const res28 = calculateMonthlyYieldAndISR(100000, 0.18, 0.005, 28);
  console.log('Gross:', res28.grossYield, '(Expected: 1400)'); // 100000 * 0.18 / 360 * 28 = 1400
  console.log('ISR:', res28.isrRetained, '(Expected: 38.89)'); // 100000 * 0.005 / 360 * 28 = 38.888... -> 38.89
  console.log('Net:', res28.netYield, '(Expected: 1361.11)');
  if (res28.grossYield !== 1400 || res28.isrRetained !== 38.89 || res28.netYield !== 1361.11) {
    throw new Error('TEST C FAILED');
  }

  console.log('\n--- TEST D: Idempotencia y DB ---');
  
  // Preparar estado DB: Insertar un inversor y una inversión
  const investorId = `inv_${crypto.randomBytes(4).toString('hex')}`;
  const investmentId = `invmt_${crypto.randomBytes(4).toString('hex')}`;

  db.execute(`
    INSERT INTO investors (id, blind_name, encrypted_name, isr_retention_rate)
    VALUES (?, ?, ?, ?)
  `, [investorId, crypto.randomBytes(32).toString('hex'), 'ENC_NAME', 0.005]);

  db.execute(`
    INSERT INTO investments (id, investor_id, capital, annual_rate, start_date, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [investmentId, investorId, 100000, 0.18, '2026-10-01', 'ACTIVE']);

  // Run CRON for October 2026 (31 days)
  const dateStr = '2026-10-15T00:00:00.000Z';
  const targetDate = new Date(dateStr);
  
  console.log('Ejecutando Cron 1...');
  const resCron1 = await runMonthlyFundingSettle(targetDate);
  console.log('Result 1:', resCron1);
  if (resCron1.processed === 0) throw new Error('TEST D FAILED (no process on first run)');

  console.log('Ejecutando Cron 2 (idempotencia)...');
  const resCron2 = await runMonthlyFundingSettle(targetDate);
  console.log('Result 2:', resCron2);
  if (resCron2.processed !== 0 || resCron2.skipped !== resCron1.processed) {
    throw new Error('TEST D FAILED (not idempotent)');
  }

  console.log('\n✅ ALL TESTS PASSED SUCCESSFULLY');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
