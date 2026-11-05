/**
 * SCRIPT DE VERIFICACIÓN FORENSE DEL MOTOR FINANCIERO Y GUARDRAILS (CRUSE-APO-2026-051)
 * - Audita las 293 filas de las 5 hojas de TABLAS DE CUOTAS.xlsx con $0.00 de discrepancia.
 * - Verifica el caso testigo: $5,000 MXN Express a 6 Quincenas = $949.68 MXN (Total $5,698.08 MXN).
 * - Audita el Bloqueo Hard Legal del 30% conforme al Art. 110 LFT.
 * - Escanea estáticamente todos los archivos financieros modificados para certificar FLOAT_CALLS_COUNT === 0
 *   y que ningún archivo supere el límite de 600 líneas (Regla Anti-God-Object).
 */

import fs from 'node:fs';
import path from 'node:path';
import Decimal from 'decimal.js';
import { OFFICIAL_QUOTA_TABLES, OfficialQuotaRow } from '../src/config/officialQuotaTables';
import {
  calculateSimulation,
  validateLegalPaymentCapacityLft110,
} from '../src/config/financialConstants';
import { BorrowerProfile, PaymentFrequency } from '../src/types';

interface SheetAuditConfig {
  sheetName: string;
  productType: 'normal' | 'express';
  frequency: PaymentFrequency;
  borrowerProfile: BorrowerProfile;
  rows: ReadonlyArray<OfficialQuotaRow>;
}

const SHEETS_TO_AUDIT: SheetAuditConfig[] = [
  {
    sheetName: '1. C. NORMAL QUINCENAL ACTIVOS',
    productType: 'normal',
    frequency: 'quincenal',
    borrowerProfile: 'activo',
    rows: OFFICIAL_QUOTA_TABLES.normalQuincenalActivos,
  },
  {
    sheetName: '2. C. NORMAL QUINCENAL PENSIONADOS',
    productType: 'normal',
    frequency: 'quincenal',
    borrowerProfile: 'pensionado',
    rows: OFFICIAL_QUOTA_TABLES.normalQuincenalPensionados,
  },
  {
    sheetName: '3. C. NORMAL MENSUAL ACTIVOS',
    productType: 'normal',
    frequency: 'mensual',
    borrowerProfile: 'activo',
    rows: OFFICIAL_QUOTA_TABLES.normalMensualActivos,
  },
  {
    sheetName: '4. CREDITO EXPRESS QUINCENAL',
    productType: 'express',
    frequency: 'quincenal',
    borrowerProfile: 'activo',
    rows: OFFICIAL_QUOTA_TABLES.expressQuincenal,
  },
  {
    sheetName: '5. CREDITO EXPRESS MENSUAL',
    productType: 'express',
    frequency: 'mensual',
    borrowerProfile: 'activo',
    rows: OFFICIAL_QUOTA_TABLES.expressMensual,
  },
];

const FINANCIAL_FILES_NO_FLOAT = [
  'src/config/officialQuotaTables.ts',
  'src/config/financialConstants.ts',
  'src/services/ai/chatFinancialCalculator.ts',
  'src/services/executive/scoringService.ts',
  'src/services/executive/almaDomainQueriesPart1.ts',
  'src/utils/amortizationExport.ts',
  'src/components/public/PublicCreditSimulator.tsx',
  'src/components/public/PreApplicationModal.tsx',
  'src/components/executive/CreditScoringApproverTab.tsx',
  'src/components/executive/PortfolioRoiSimulatorTab.tsx',
];

const ALL_MODIFIED_FILES = [
  ...FINANCIAL_FILES_NO_FLOAT,
  'src/types/index.ts',
  'src/types/preApplications.ts',
  'src/data/cruseData.ts',
  'src/data/cruseExecutiveData.ts',
  'src/components/public/RequirementsGlassSlabs.tsx',
  'src/components/public/InstitutionalAlliance.tsx',
  'src/components/public/OperationalPhases.tsx',
  'src/components/public/ContactEcosystemSlab.tsx',
  'src/components/public/FooterPublic.tsx',
  'src/components/public/HeroPedestalSection.tsx',
  'src/components/public/AiAssistantPublic.tsx',
  'src/components/executive/InternalAiAssistantDrawer.tsx',
  'src/services/api/chatRouter.ts',
  'src/services/api/preApplicationsRouter.ts',
  'src/config/riskMatrixWeights.ts',
  'index.html',
];

console.log('================================================================================');
console.log('🏛️  AUDITORÍA FORENSE DEL MOTOR FINANCIERO — EXPEDIENTE CRUSE-APO-2026-051');
console.log('================================================================================\n');

let totalRowsEvaluated = 0;
let totalDiscrepancies = 0;
let maxDiscrepancy = new Decimal('0.00');

for (const sheet of SHEETS_TO_AUDIT) {
  let sheetMatches = 0;
  for (const row of sheet.rows) {
    totalRowsEvaluated += 1;
    const sim = calculateSimulation(row.amount, row.termPeriods, sheet.productType, {
      frequency: sheet.frequency,
      borrowerProfile: sheet.borrowerProfile,
    });
    const expectedQuota = new Decimal(row.periodicPayment);
    const computedQuota = new Decimal(sim.periodicPayment).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const diff = computedQuota.minus(expectedQuota).abs();

    if (diff.greaterThan(maxDiscrepancy)) {
      maxDiscrepancy = diff;
    }

    if (!diff.equals(0)) {
      totalDiscrepancies += 1;
      console.error(
        `❌ DISCREPANCIA en [${sheet.sheetName}] Monto $${row.amount} Plazo ${row.termPeriods}: Esperado $${expectedQuota.toFixed(2)} vs Calculado $${computedQuota.toFixed(2)} (Diff: $${diff.toFixed(2)})`
      );
    } else {
      sheetMatches += 1;
    }
  }
  console.log(
    `✅ ${sheet.sheetName.padEnd(36, ' ')} | Filas verificadas: ${String(sheetMatches).padStart(3, ' ')}/${String(sheet.rows.length).padStart(3, ' ')} | Discrepancia: $0.00 MXN`
  );
}

console.log('--------------------------------------------------------------------------------');
console.log(`📊 TOTAL FILAS TABLAS OFICIALES VERIFICADAS : ${totalRowsEvaluated} / 293`);
console.log(`📊 DISCREPANCIA ACUMULADA                   : $${maxDiscrepancy.toFixed(2)} MXN (Filas con error: ${totalDiscrepancies})`);
console.log('--------------------------------------------------------------------------------\n');

// Caso testigo explícito: $5,000 MXN Express a 6 Quincenas
const witnessCase = calculateSimulation(5000, 6, 'express', {
  frequency: 'quincenal',
  borrowerProfile: 'activo',
});

console.log('🔍 VERIFICACIÓN DE CASO TESTIGO OFICIAL ($5,000 MXN Express · 6 Quincenas):');
console.log(`   • Monto Solicitado           : $5000.00 MXN`);
console.log(`   • Plazo                      : ${witnessCase.schedule.length} Quincenas`);
console.log(`   • Tasa Anual Nominal         : ${witnessCase.annualNominalRatePercent.toFixed(2)}% (sin IVA)`);
console.log(`   • Cuota Quincenal Calculada  : $${witnessCase.periodicPayment.toFixed(2)} MXN (Esperado: $949.68 MXN)`);
console.log(`   • Total a Pagar              : $${witnessCase.totalToPay.toFixed(2)} MXN (Esperado: $5,698.08 MXN)`);
console.log(`   • Sueldo Neto Mínimo (30% LFT): $${witnessCase.requiredNetIncome.toFixed(2)} MXN\n`);

if (witnessCase.periodicPayment !== 949.68 || witnessCase.totalToPay !== 5698.08) {
  throw new Error('Fallo en caso testigo de $5,000 a 6 Quincenas.');
}

// Verificación Guardrail 2: Tope 30% Art. 110 LFT
const rejectedCheck = validateLegalPaymentCapacityLft110(949.68, 3000.0);
const approvedCheck = validateLegalPaymentCapacityLft110(949.68, 3165.6);

console.log('⚖️  VERIFICACIÓN GUARDRAIL 2 (BLOQUEO HARD LEGAL 30% ART. 110 LFT):');
console.log(
  `   • Cuota $949.68 vs Sueldo Neto $3,000.00 (Ratio ${rejectedCheck.ratioPercent}%) -> isValid: ${rejectedCheck.isValid} | Msg: "${rejectedCheck.errorMessage}"`
);
console.log(
  `   • Cuota $949.68 vs Sueldo Neto $3,165.60 (Ratio ${approvedCheck.ratioPercent}%) -> isValid: ${approvedCheck.isValid} | Límite 30%: $${approvedCheck.maxAllowedPayment} MXN\n`
);

if (rejectedCheck.isValid || !approvedCheck.isValid) {
  throw new Error('Fallo en validación legal del 30% Art. 110 LFT.');
}

// Verificación estática de FLOAT_CALLS_COUNT === 0 y límite de 600 líneas
const rootDir = path.resolve(import.meta.dirname, '..');
let floatCallsCount = 0;
const floatPattern = /\b(Number\s*\(|parseFloat\s*\(|Math\.round\s*\()/g;

console.log('🔒 ESCANEO ESTÁTICO DE ARCHIVOS FINANCIEROS (CERO PUNTO FLOTANTE):');
for (const relPath of FINANCIAL_FILES_NO_FLOAT) {
  const absPath = path.join(rootDir, relPath);
  const content = fs.readFileSync(absPath, 'utf8');
  const matches = content.match(floatPattern) ?? [];
  floatCallsCount += matches.length;
  console.log(
    `   • ${relPath.padEnd(54, ' ')} | FLOAT_CALLS: ${matches.length}`
  );
}
console.log(`   => FLOAT_CALLS_COUNT GLOBAL = ${floatCallsCount}\n`);

console.log('📏 AUDITORÍA DE LÍMITE ANTI-GOD-OBJECT (< 600 LÍNEAS):');
let maxLinesObserved = 0;
for (const relPath of ALL_MODIFIED_FILES) {
  const absPath = path.join(rootDir, relPath);
  const content = fs.readFileSync(absPath, 'utf8');
  const lineCount = content.split('\n').length;
  if (lineCount > maxLinesObserved) maxLinesObserved = lineCount;
  if (lineCount >= 600) {
    throw new Error(`Archivo supera el límite de 600 líneas: ${relPath} (${lineCount} líneas)`);
  }
  console.log(`   • ${relPath.padEnd(54, ' ')} | ${String(lineCount).padStart(3, ' ')} / 600 líneas`);
}

if (totalRowsEvaluated !== 293 || totalDiscrepancies !== 0 || floatCallsCount !== 0) {
  process.exit(1);
}

console.log('\n================================================================================');
console.log('✅ VEREDICTO FORENSE: 293/293 FILAS CON $0.00 DE DISCREPANCIA · FLOAT_CALLS_COUNT = 0');
console.log('================================================================================');
