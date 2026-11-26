/**
 * SUITE FORENSE DE VERIFICACIÓN — CRUSE-APO-2026-079
 * (Remediación de Falso Positivo en Barrera Zero-PII para RFC/CURP Sintéticos + Refactor Anti-God-Object)
 *
 * Verifica las 4 Condiciones Innegociables del Auditor:
 * - C1 (Cero Falsos Negativos): 12 casos reales (RFC PF/PM, &/Ñ, genéricos XAXX/XEXX, CURP pre/pos-2000,
 *      MD5 32-hex, SHA-256 64-hex, fecha alterada) son BLOQUEADOS con `ZERO_PII_BARRIER_TRIGGERED`.
 * - C2 (Cero Falsos Positivos): Las 16 variantes sintéticas de RFC (`A{3,4}9{6}[A9]{3}`), las 2 de CURP
 *      (`AAAA999999AAAAAA[A9]9`) y máscara larga `[A9]{40}` PASAN la barrera sin error.
 * - C3 (Irreversibilidad + E2E): 5 casos de enmascaramiento (incluyendo `M&O900101XXX` y colisión
 *      `XAXX010101000 === MAVA740512999 === AAAA999999999`) + flujo E2E `parseAndValidatePldCsvZeroPii`
 *      con columna adicional ambigua y RFCs con homoclave numérica en Comentario (disparando Fase B).
 * - C4 (Anti-God-Object & DAG Acíclico): `pldSmartColumnInferer.ts < 580` líneas y `pldZeroPiiBarrier.ts`
 *      sin imports desde `pldSmartColumnInferer`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  maskCellToIrreversibleSyntheticPattern,
  assertZeroPiiInPromptString,
} from '../src/services/ai/pldSmartColumnInferer';
import { parseAndValidatePldCsvZeroPii } from '../src/services/pld/pldListParserAndValidator';

function testIrreversibilityCases(): void {
  // 5 casos forenses exigidos + PM con & y Ñ
  assert.equal(maskCellToIrreversibleSyntheticPattern('GOMA850101H78'), 'AAAA999999A99');
  assert.equal(maskCellToIrreversibleSyntheticPattern('XAXX010101000'), 'AAAA999999999');
  assert.equal(maskCellToIrreversibleSyntheticPattern('XEXX010101000'), 'AAAA999999999');
  assert.equal(maskCellToIrreversibleSyntheticPattern('MAVA740512999'), 'AAAA999999999');
  assert.equal(maskCellToIrreversibleSyntheticPattern('M&O900101XXX'), 'AAA999999AAA');
  assert.equal(maskCellToIrreversibleSyntheticPattern('MAÑ900101XXX'), 'AAA999999AAA');
  assert.equal(maskCellToIrreversibleSyntheticPattern('HEAA010101HDFRRL02'), 'AAAA999999AAAAAA99');
  assert.equal(maskCellToIrreversibleSyntheticPattern('HEAA010101HDFRRLA2'), 'AAAA999999AAAAAAA9');

  const realSha256 = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
  const maskedHash = maskCellToIrreversibleSyntheticPattern(realSha256);
  assert.equal(maskedHash.length, 40);
  assert.match(maskedHash, /^[A9]{40}$/);
}

function testSyntheticPassCases(): number {
  const homoclaves = ['AAA', 'AA9', 'A9A', 'A99', '9AA', '9A9', '99A', '999'];
  const syntheticPayloads: string[] = [];

  // Las 16 variantes sintéticas de RFC (8 PF + 8 PM)
  for (const h of homoclaves) {
    syntheticPayloads.push(JSON.stringify({ structuralMasks: [`AAAA999999${h}`] }));
    syntheticPayloads.push(JSON.stringify({ structuralMasks: [`AAA999999${h}`] }));
  }

  // Las 2 variantes sintéticas de CURP (pre-2000 y pos-2000)
  syntheticPayloads.push(JSON.stringify({ structuralMasks: ['AAAA999999AAAAAA99'] }));
  syntheticPayloads.push(JSON.stringify({ structuralMasks: ['AAAA999999AAAAAAA9'] }));

  // Máscara larga de 40 caracteres puros {A, 9}
  syntheticPayloads.push(JSON.stringify({ structuralMasks: ['A9A9A9A9A9A9A9A9A9A9A9A9A9A9A9A9A9A9A9A9'] }));

  for (const payload of syntheticPayloads) {
    assert.doesNotThrow(
      () => assertZeroPiiInPromptString(payload),
      `Falso positivo detectado para payload sintético válido: ${payload}`
    );
  }
  return syntheticPayloads.length;
}

function testRealPiiBlockedCases(): number {
  const realLeaks: Array<{ label: string; token: string; expectedErr: RegExp }> = [
    { label: 'RFC real PF homoclave alfanum', token: 'GOMA850101H78', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Patrón RFC/ },
    { label: 'RFC genérico nacional SAT', token: 'XAXX010101000', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Patrón RFC/ },
    { label: 'RFC genérico extranjero SAT', token: 'XEXX010101000', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Patrón RFC/ },
    { label: 'RFC real PM con &', token: 'M&O900101XXX', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Patrón RFC/ },
    { label: 'RFC real PM con Ñ', token: 'MAÑ900101XXX', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Patrón RFC/ },
    { label: 'RFC real homoclave numérica', token: 'MAVA740512999', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Patrón RFC/ },
    { label: 'RFC con fecha no-999999', token: 'AAAA999998AAA', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Patrón RFC/ },
    { label: 'CURP real pre-2000', token: 'GOMA850101HDFRRN09', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Patrón CURP/ },
    { label: 'CURP real pos-2000 dígito', token: 'HEAA010101HDFRRL02', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Patrón CURP/ },
    { label: 'CURP real pos-2000 letra', token: 'HEAA010101HDFRRLA2', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Patrón CURP/ },
    { label: 'Hash MD5 real 32 hex', token: 'd41d8cd98f00b204e9800998ecf8427e', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Hash hexadecimal/ },
    { label: 'Hash SHA-256 real 64 hex', token: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', expectedErr: /ZERO_PII_BARRIER_TRIGGERED: Hash hexadecimal/ },
  ];

  for (const item of realLeaks) {
    const payload = JSON.stringify({ leaked: item.token });
    assert.throws(
      () => assertZeroPiiInPromptString(payload),
      item.expectedErr,
      `FALSO NEGATIVO CRÍTICO: La barrera NO bloqueó [${item.label}]`
    );
  }
  return realLeaks.length;
}

async function testE2EUifLpbWithAmbiguousColumnAndNumericHomoclave(): Promise<void> {
  // Simula el escenario real del Lic. Olvera: layout UIF-LPB con columna extra ambigua ("Control Interno")
  // que activa la Fase B (prompt estructural Zero-PII) + RFCs con homoclave numérica y CURP pos-2000 en Comentario.
  const csv = [
    'Tipo,Primer Nombre,Otros Nombres,Primer Apellido,Otros Apellidos,Alias,Comentario,Control Interno',
    'Física,JUAN,CARLOS,PEREZ,LOPEZ,,OFICIO 110/F/B/1234/2026 RFC: GOMA850101H78,REV-2026-A',
    'Física,MARIA,,GARCIA,RUIZ,,ACUERDO UIF CURP: HEAA010101HDFRRLA2 RFC: MAVA740512999,REV-2026-B',
    'Moral,COMERCIALIZADORA DEL NORTE,,,,CDN,RFC: M&O900101XXX OFICIO UIF 20/11/2026,REV-2026-C',
  ].join('\n');

  let inspectedPromptCount = 0;
  const parsed = await parseAndValidatePldCsvZeroPii(csv, 'UIF_PERSONAS_BLOQUEADAS', 'ACUERDO-UIF-LPB-2026', {
    fileExtensionHint: 'XLSX',
    allowPartialValidRowsInPreview: true,
    onPromptInspectedAuditHook: (serializedPrompt) => {
      inspectedPromptCount++;
      assertZeroPiiInPromptString(serializedPrompt);
      assert.equal(serializedPrompt.includes('GOMA850101H78'), false);
      assert.equal(serializedPrompt.includes('HEAA010101HDFRRLA2'), false);
      assert.equal(serializedPrompt.includes('MAVA740512999'), false);
      assert.equal(serializedPrompt.includes('M&O900101XXX'), false);
    },
  });

  assert.equal(inspectedPromptCount, 1, 'Debe ejecutarse el hook de inspección Zero-PII sin lanzar error');
  assert.equal(parsed.entries.length, 3, 'Los 3 registros UIF-LPB deben procesarse sin falso positivo');
  assert.equal(parsed.analysis.stats.invalidRowsCount, 0);
}

function testArchitectureGuardrails(): void {
  const repoRoot = process.cwd();
  const infererPath = path.join(repoRoot, 'src/services/ai/pldSmartColumnInferer.ts');
  const barrierPath = path.join(repoRoot, 'src/services/ai/pldZeroPiiBarrier.ts');

  const infererLines = fs.readFileSync(infererPath, 'utf8').split(/\r?\n/).length;
  const barrierSource = fs.readFileSync(barrierPath, 'utf8');
  const barrierLines = barrierSource.split(/\r?\n/).length;

  assert(infererLines < 580, `pldSmartColumnInferer.ts excede 580 líneas (${infererLines})`);
  assert(barrierLines < 200, `pldZeroPiiBarrier.ts debe ser conciso (${barrierLines})`);
  assert.equal(
    barrierSource.includes('pldSmartColumnInferer'),
    false,
    'pldZeroPiiBarrier.ts no debe importar nada de pldSmartColumnInferer (DAG acíclico)'
  );
}

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.CRUSE_KEK_CURRENT_VERSION = process.env.CRUSE_KEK_CURRENT_VERSION || '1';
  process.env.CRUSE_KEK_V1 = process.env.CRUSE_KEK_V1 || Buffer.alloc(32, 7).toString('base64');
  process.env.BLIND_INDEX_SECRET = process.env.BLIND_INDEX_SECRET || Buffer.alloc(32, 9).toString('base64');
  delete process.env.GROQ_API_KEY; // Sin red externa en prueba unitaria

  testIrreversibilityCases();
  const syntheticCount = testSyntheticPassCases();
  const realBlockedCount = testRealPiiBlockedCases();
  await testE2EUifLpbWithAmbiguousColumnAndNumericHomoclave();
  testArchitectureGuardrails();

  console.log(
    `✅ PASS [CRUSE-APO-2026-079]: ${syntheticCount} casos sintéticos aprobados + ${realBlockedCount} fugas reales bloqueadas (total=${syntheticCount + realBlockedCount} casos) + E2E UIF-LPB sin falso positivo + Anti-God-Object < 580L.`
  );
}

main().catch((err) => {
  console.error('❌ FAIL APO-079:', err);
  process.exit(1);
});
