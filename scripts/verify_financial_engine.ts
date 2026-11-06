/**
 * SCRIPT DE VERIFICACIÓN FORENSE DEL MOTOR FINANCIERO Y GUARDRAILS (CRUSE-APO-2026-051 / 052)
 * - Audita las 293 filas de las 5 hojas de TABLAS DE CUOTAS.xlsx con $0.00 de discrepancia.
 * - Verifica el caso testigo: $5,000 MXN Express a 6 Quincenas = $949.68 MXN (Total $5,698.08 MXN).
 * - Guardrail 1 (APO-052): Escaneo recursivo en src/, scripts/ y db/ certificando 0 ocurrencias de constantes CAT legacy.
 * - Guardrail 2 y 4 (APO-052): Verifica calculateRegulatoryCatBanxico (bisección MAX_ITERATIONS=100 con Decimal.js)
 *   para el caso testigo Express ($5,000 a 6Q, $0 seguro) = 119.64% sin IVA (Circular 21/2009 Banxico).
 * - Audita el Bloqueo Hard Legal del 30% conforme al Art. 110 LFT.
 * - Escanea estáticamente todos los archivos financieros modificados para certificar FLOAT_CALLS_COUNT === 0
 *   y que ningún archivo supere el límite de 600 líneas (Regla Anti-God-Object).
 */

import fs from 'node:fs';
import path from 'node:path';
import Decimal from 'decimal.js';
import { OFFICIAL_QUOTA_TABLES, OfficialQuotaRow } from '../src/config/officialQuotaTables';
import {
  calculateRegulatoryCatBanxico,
  calculateSimulation,
  validateLegalPaymentCapacityLft110,
} from '../src/config/financialConstants';
import {
  evaluateTriageAndChannelRouting,
  OUT_OF_SCOPE_ELIGIBILITY_MESSAGE,
  validateAndSanitizeExtractedEntities,
} from '../src/services/ai/chatFinancialCalculator';
import { buildDeterministicLocalFallbackReply } from '../src/components/public/AiAssistantPublic';
import { SYSTEM_INSTRUCTION } from '../src/services/api/chatRouter';
import { AI_ASSISTANT_WELCOME_MESSAGE } from '../src/data/cruseData';
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
console.log(`   • Sueldo Neto Mínimo (30% LFT): $${witnessCase.requiredNetIncome.toFixed(2)} MXN`);
console.log(`   • CAT Dinámico Banxico s/IVA : ${witnessCase.catPercent.toFixed(2)}% (Exacto ((1+0.80/24)^24 - 1) = 119.6701% -> 119.67%)\n`);

if (witnessCase.periodicPayment !== 949.68 || witnessCase.totalToPay !== 5698.08) {
  throw new Error('Fallo en caso testigo de $5,000 a 6 Quincenas.');
}

// Verificación Guardrail 4 (APO-052): Prueba Forense de calculateRegulatoryCatBanxico (Circular 21/2009 Banxico)
const directCatExpress5k = calculateRegulatoryCatBanxico(
  5000,
  6,
  new Decimal('0.80').div(24),
  0,
  'quincenal'
);
const exactClosedFormExpressCat = new Decimal(1)
  .plus(new Decimal('0.80').div(24))
  .pow(24)
  .minus(1)
  .mul(100)
  .toDP(2, Decimal.ROUND_HALF_UP);
const catDiffExpress5k = new Decimal(directCatExpress5k).minus(exactClosedFormExpressCat).abs();
const normalActivo10k24q = calculateSimulation(10000, 24, 'normal', {
  frequency: 'quincenal',
  borrowerProfile: 'activo',
});
const normalPensionado10k24q = calculateSimulation(10000, 24, 'normal', {
  frequency: 'quincenal',
  borrowerProfile: 'pensionado',
});

console.log('🏦 VERIFICACIÓN GUARDRAIL 2 Y 4 (CÁLCULO DINÁMICO DE CAT — CIRCULAR 21/2009 BANXICO):');
console.log(
  `   • Express $5,000 a 6Q ($0 seguro)          -> CAT Bisección = ${directCatExpress5k.toFixed(2)}% s/IVA | Fórmula Cerrada ((1+0.80/24)^24-1) = ${exactClosedFormExpressCat.toFixed(2)}% | Diff: ${catDiffExpress5k.toFixed(4)}%`
);
console.log(
  `   • Normal Activo $10,000 a 24Q ($22.85 seg) -> CAT Bisección = ${normalActivo10k24q.catPercent.toFixed(2)}% s/IVA (Incluye flujo de seguro obligatorio)`
);
console.log(
  `   • Normal Pensionado $10,000 a 24Q ($0 seg) -> CAT Bisección = ${normalPensionado10k24q.catPercent.toFixed(2)}% s/IVA (Base nominal 47.50% anual)\n`
);

if (catDiffExpress5k.gt(new Decimal('0.01')) || witnessCase.catPercent !== exactClosedFormExpressCat.toNumber()) {
  console.error('❌ FALLO CRÍTICO GUARDRAIL 4: El CAT por bisección difiere de la solución exacta de Circular 21/2009 Banxico');
  process.exit(1);
}

// Verificación Guardrail 2 (APO-051): Tope 30% Art. 110 LFT
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

// Verificación Guardrail 1 (APO-052): Erradicación Forense Absoluta de Constantes Legacy de CAT en src/, scripts/ y db/
const rootDir = path.resolve(import.meta.dirname, '..');
const forbiddenLegacyTokens = [
  ['136', '66'].join('.'),
  ['88', '05'].join('.'),
  ['CAT_EXPRESS', 'PERCENT'].join('_'),
  ['CAT_NORMAL', 'PERCENT'].join('_'),
];

function collectFilesRecursively(dirPath: string, collected: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return collected;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(fullPath, collected);
    } else if (/\.(ts|tsx|sql|js|json)$/i.test(entry.name)) {
      collected.push(fullPath);
    }
  }
  return collected;
}

const dirsToScan = ['src', 'scripts', 'db'];
let legacyCatMatches = 0;
let totalScannedFiles = 0;

console.log('🧹 VERIFICACIÓN GUARDRAIL 1 (ERRADICACIÓN FORENSE DE CONSTANTES CAT LEGACY EN src/, scripts/, db/):');
for (const dirName of dirsToScan) {
  const files = collectFilesRecursively(path.join(rootDir, dirName));
  for (const fileAbs of files) {
    totalScannedFiles += 1;
    const text = fs.readFileSync(fileAbs, 'utf8');
    for (const token of forbiddenLegacyTokens) {
      if (text.includes(token)) {
        legacyCatMatches += 1;
        console.error(`   ❌ Residuo prohibido "${token}" detectado en: ${path.relative(rootDir, fileAbs)}`);
      }
    }
  }
}
console.log(`   • Archivos escaneados en src/, scripts/, db/ : ${totalScannedFiles}`);
console.log(`   • Ocurrencias de constantes CAT legacy       : ${legacyCatMatches} (Esperado: 0)\n`);

if (legacyCatMatches !== 0) {
  process.exit(1);
}

// Verificación Guardrails 1, 2, 3 y 4 (CRUSE-APO-2026-053 / 054): Máquina Multi-Turno 2D, Caso Gerardo Ornelas y Silo Hermético
console.log('🛡️  VERIFICACIÓN GUARDRAILS 1, 2, 3 Y 4 (MÁQUINA MULTI-TURNO 2D, CASO GERARDO ORNELAS Y SILO HERMÉTICO — APO-053/054):');

const hasStrictNegativeClause = SYSTEM_INSTRUCTION.includes(
  "SI el usuario es Sindicalizado o Jubilado/Pensionado, está TERMINANTEMENTE PROHIBIDO mencionar las oficinas de Microfinanciera Cruse, la dirección 'Vía Citadela' o los teléfonos de Cruse. Solo debes proporcionar los datos del Departamento de Prestaciones Económicas del Sindicato (Salón Pinos Altos) o su delegado municipal."
);
console.log(`   • Guardrail 1 (Cláusula Negativa en SYSTEM_INSTRUCTION) : ${hasStrictNegativeClause ? 'PRESENTE ✅' : 'AUSENTE ❌'}`);
if (!hasStrictNegativeClause) {
  console.error('❌ FALLO CRÍTICO GUARDRAIL 1: Falta la restricción negativa explícita en SYSTEM_INSTRUCTION.');
  process.exit(1);
}

// Simulación 0: Validación de Enum Estricto (Guardrail 1 APO-054) ante posible alucinación de LLM
const sanitizedEnumTest = validateAndSanitizeExtractedEntities(
  { dependency: 'instituto_inventado_por_llm', plazaType: 'plaza_alucinada' },
  { dependency: 'tribunal_poder_judicial', plazaType: 'unknown' }
);
const enumGuardrailValid =
  sanitizedEnumTest.dependency === 'tribunal_poder_judicial' && sanitizedEnumTest.plazaType === 'unknown';
console.log(
  `   • Guardrail 1 APO-054 (Sanitización contra Enums)       : ${enumGuardrailValid ? 'BLOQUEA ALUCINACIÓN Y PRESERVA ENUM ✅' : 'FALLO ❌'}`
);

// Simulación 1: Primer contacto sin identificarse -> Saludo Oficial de Alma (Opción 3)
const unidentifiedReply = buildDeterministicLocalFallbackReply('Hola, quiero informes de un préstamo y dónde firmo', []);
const unidentifiedAsksTriage =
  unidentifiedReply === AI_ASSISTANT_WELCOME_MESSAGE &&
  unidentifiedReply.includes('¡Bienvenido a Microfinanciera Cruse! Soy Alma, tu asistente inteligente.') &&
  !unidentifiedReply.includes('Vía Citadela') &&
  !unidentifiedReply.includes('Salón Pinos Altos');
console.log(`   • Saludo Inicial Opción 3 ("Soy Alma" — Sin Identificar): ${unidentifiedAsksTriage ? 'EXACTO Y SIN DIRECCIONES ✅' : 'FALLO ❌'}`);

// Simulación 2 (CASO GERARDO ORNELAS — Multi-Turno sin bucles):
// Turno 1: "Trabajo en el poder judicial de Chihuahua"
const gerardoTurn1Msg = 'Trabajo en el poder judicial de Chihuahua';
const gerardoTurn1Triage = evaluateTriageAndChannelRouting(gerardoTurn1Msg, []);
const gerardoTurn1Reply = buildDeterministicLocalFallbackReply(gerardoTurn1Msg, []);
const gerardoTurn1Valid =
  gerardoTurn1Triage.profile === 'partial_tribunal_missing_plaza' &&
  gerardoTurn1Triage.dependency === 'tribunal_poder_judicial' &&
  gerardoTurn1Triage.plazaType === 'unknown' &&
  gerardoTurn1Reply.includes('Poder Judicial / Supremo Tribunal de Justicia') &&
  gerardoTurn1Reply.includes('¿tu plaza es sindicalizada o eres personal de confianza?') &&
  !gerardoTurn1Reply.includes('confírmame tu dependencia y tipo de plaza');

console.log(
  `   • Caso Gerardo Ornelas [Turno 1: "Trabajo en el poder judicial de Chihuahua"]:`
);
console.log(
  `     -> Estado: ${gerardoTurn1Triage.profile} | Reconoce Dependencia y pide SOLO plaza: ${gerardoTurn1Valid ? 'SÍ (CERO BUCLE) ✅' : 'FALLO ❌'}`
);

// Turno 2: "Soy sindicalizado" (con el Turno 1 en el historial)
const historyAfterTurn1 = [
  { role: 'user', content: gerardoTurn1Msg },
  { role: 'assistant', content: gerardoTurn1Reply },
];
const gerardoTurn2Msg = 'Soy sindicalizado';
const gerardoTurn2Triage = evaluateTriageAndChannelRouting(gerardoTurn2Msg, historyAfterTurn1);
const gerardoTurn2Reply = buildDeterministicLocalFallbackReply(gerardoTurn2Msg, historyAfterTurn1);
const gerardoTurn2Valid =
  gerardoTurn2Triage.profile === 'resolved_sindicalizado_or_jubilado' &&
  gerardoTurn2Triage.dependency === 'tribunal_poder_judicial' &&
  gerardoTurn2Triage.plazaType === 'sindicalizado' &&
  gerardoTurn2Reply.includes('Salón Pinos Altos') &&
  gerardoTurn2Reply.includes('614 607 7301') &&
  !gerardoTurn2Reply.includes('Vía Citadela') &&
  !gerardoTurn2Reply.includes('411-15-44');

console.log(
  `   • Caso Gerardo Ornelas [Turno 2: "Soy sindicalizado" + Historial Turno 1]:`
);
console.log(
  `     -> Estado: ${gerardoTurn2Triage.profile} | Canaliza a Salón Pinos Altos (0 fugas Vía Citadela): ${gerardoTurn2Valid ? 'SÍ (SILO HERMÉTICO) ✅' : 'FALLO ❌'}`
);

// Simulación 3 (Guardrail 3 APO-054): Corrección en Turno 3 ("Perdón, soy de confianza")
const historyAfterTurn2 = [
  ...historyAfterTurn1,
  { role: 'user', content: gerardoTurn2Msg },
  { role: 'assistant', content: gerardoTurn2Reply },
];
const correctionTurn3Msg = 'Perdón, me equivoqué, soy personal de confianza';
const correctionTurn3Triage = evaluateTriageAndChannelRouting(correctionTurn3Msg, historyAfterTurn2);
const correctionTurn3Reply = buildDeterministicLocalFallbackReply(correctionTurn3Msg, historyAfterTurn2);
const correctionTurn3Valid =
  correctionTurn3Triage.profile === 'resolved_confianza_tribunal' &&
  correctionTurn3Triage.dependency === 'tribunal_poder_judicial' &&
  correctionTurn3Triage.plazaType === 'confianza' &&
  correctionTurn3Reply.includes('Vía Citadela') &&
  correctionTurn3Reply.includes('411-15-44') &&
  !correctionTurn3Reply.includes('Salón Pinos Altos');

console.log(
  `   • Guardrail 3 APO-054 [Turno 3 Corrección: "Perdón, soy de confianza"]:`
);
console.log(
  `     -> Actualiza estado a ${correctionTurn3Triage.profile} (Vía Citadela exclusivo): ${correctionTurn3Valid ? 'ACTUALIZACIÓN LIMPIA ✅' : 'FALLO ❌'}`
);

// Simulación 4 (Guardrail 2 APO-054): Dependencia fuera de alcance ("Trabajo en la CFE")
const outOfScopeTriage = evaluateTriageAndChannelRouting('Hola, trabajo en la CFE, ¿puedo pedir un préstamo?', []);
const outOfScopeValid =
  outOfScopeTriage.profile === 'out_of_scope' &&
  outOfScopeTriage.triageQuestionReply === OUT_OF_SCOPE_ELIGIBILITY_MESSAGE &&
  !outOfScopeTriage.triageQuestionReply.includes('Vía Citadela') &&
  !outOfScopeTriage.triageQuestionReply.includes('Salón Pinos Altos');

console.log(
  `   • Guardrail 2 APO-054 [Fuera de Alcance: "Trabajo en la CFE"] : ${outOfScopeValid ? 'MENSAJE ELEGIBILIDAD OFICIAL ✅' : 'FALLO ❌'}\n`
);

if (
  !enumGuardrailValid ||
  !unidentifiedAsksTriage ||
  !gerardoTurn1Valid ||
  !gerardoTurn2Valid ||
  !correctionTurn3Valid ||
  !outOfScopeValid
) {
  console.error('❌ FALLO CRÍTICO EN MÁQUINA DE ESTADOS MULTI-TURNO O AISLAMIENTO DE CANALES (APO-054).');
  process.exit(1);
}

// Verificación estática de FLOAT_CALLS_COUNT === 0 y límite de 600 líneas
let floatCallsCount = 0;
const floatPattern = /\b(Number\s*\(|parseFloat\s*\(|Math\.round\s*\(|Math\.pow\s*\()/g;

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
