/**
 * SUITE FORENSE CRUSE-APO-2026-081 (12 CASOS — ZERO-DISPLAY UIF Y PURGA EN RAM)
 *
 * Verifica:
 * 1) Cargar archivo .xlsx -> csvContent vacío y preparedFile poblado en RAM privada
 * 2) Pegar texto manualmente -> csvContent poblado y preparedFile null
 * 3) Archivo con confianza >= 90% y 0 errores -> mapeo avanzado colapsado
 * 4) Archivo con confianza < 80% -> mapeo avanzado auto-expandido
 * 5) Archivo con invalidRowsCount > 0 (aun con confianza >= 90%) -> mapeo avanzado auto-expandido
 * 6) Edge cases null/undefined/invalidRowsCount undefined/confianza corrupta (fail-safe)
 * 7) Purga completa en RAM post-ingesta exitosa + incremento requestSeq anti-stale-closures
 * 8) Clic en "Quitar archivo" -> purga preparedFile, analysis, csvContent y sube requestSeq
 * 9) Inspección estructural del componente PldWatchlistIngestionCard.tsx (cero setCsvContent(prepared...),
 *    textarea condicional a !preparedFile && showManualPaste, tabla maskedPreviewRows eliminada)
 * 10) Límite Anti-God-Object (< 580L en PldWatchlistIngestionCard.tsx y < 120L en pldIngestionUiState.ts)
 * 11) No-regresión flujo de ingesta con archivo (resolveActiveIngestionCsv entrega CSV completo + SHA-256)
 * 12) No-regresión flujo de pegado manual (resolveActiveIngestionCsv entrega texto manual intacto)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyAnalysisResultState,
  applyFileLoadedState,
  applyManualPasteState,
  createInitialPldIngestionUiState,
  purgePldIngestionUiState,
  resolveActiveIngestionCsv,
  shouldAutoExpandAdvancedMapping,
} from '../src/utils/pldIngestionUiState';
import { SmartPldFileAnalysisResult } from '../src/types/pldSmartIngestion';
import { PreparedClientWatchlistPayload } from '../src/utils/pldWatchlistClientHelper';

function makeFakePreparedFile(): PreparedClientWatchlistPayload {
  return {
    fileName: 'lista_confidencial_sintetica.xlsx',
    fileExtension: 'XLSX',
    rawArrayBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
    originalFileSha256: 'a'.repeat(64),
    normalizedCsvContent: 'Columna1,Primer Nombre,Primer Apellido,Comentario\nINDIVIDUO,JUAN,PEREZ,Acuerdo 01/2026',
    selectedSheetName: 'PersonasBloqueadas',
  };
}

function makeFakeAnalysis(overrides?: {
  overallConfidencePct?: string;
  invalidRowsCount?: number | undefined;
}): SmartPldFileAnalysisResult {
  return {
    sourceFileHash: 'a'.repeat(64),
    canonicalPayloadHash: 'b'.repeat(64),
    delimiter: ',',
    hasHeaderRow: true,
    detectedHeaderLineNumber: 1,
    skippedTopBannerRowsCount: 0,
    inferenceEngineUsed: 'DETERMINISTIC_CONTENT_FIRST',
    overallConfidencePct: overrides?.overallConfidencePct ?? '94.57',
    humanFriendlyExplanation: 'Resumen sintetico Zero-PII',
    columns: [],
    stats: {
      totalDataRowsRead: 15516,
      validUniqueEntriesCount: 13290,
      curpCount: 254,
      rfcCount: 1664,
      nameOnlyCount: 11372,
      isoCountryCount: 0,
      excludedCleared69bCount: 0,
      skippedEmptyOrBannerRowsCount: 0,
      invalidRowsCount: overrides?.invalidRowsCount as number,
    },
    validationWarnings: [],
    maskedPreviewRows: [],
  };
}

function run(): void {
  let passed = 0;

  // CASO 1: Cargar archivo .xlsx -> csvContent vacío y preparedFile en RAM privada
  const init = createInitialPldIngestionUiState();
  const fakeFile = makeFakePreparedFile();
  const afterFile = applyFileLoadedState(init, fakeFile);
  assert.equal(afterFile.csvContent, '', 'Caso 1: csvContent debe permanecer vacio al cargar archivo');
  assert.equal(afterFile.preparedFile?.fileName, fakeFile.fileName);
  assert.equal(afterFile.showManualPaste, false);
  assert.equal(afterFile.requestSeq, 1);
  passed++;

  // CASO 2: Pegar texto manualmente -> csvContent poblado y preparedFile null
  const manualCsv = 'RFC,NOMBRE_COMPLETO\nGOMA850101AB1,JUAN GOMEZ';
  const afterManual = applyManualPasteState(afterFile, manualCsv);
  assert.equal(afterManual.csvContent, manualCsv);
  assert.equal(afterManual.preparedFile, null, 'Caso 2: preparedFile debe ser null en modo pegado manual');
  assert.equal(afterManual.showManualPaste, true);
  passed++;

  // CASO 3: Confianza >= 90% y 0 errores -> mapeo avanzado colapsado
  const highConfAnalysis = makeFakeAnalysis({ overallConfidencePct: '94.57', invalidRowsCount: 0 });
  const stateHighConf = applyAnalysisResultState(afterFile, highConfAnalysis);
  assert.equal(shouldAutoExpandAdvancedMapping(highConfAnalysis), false);
  assert.equal(stateHighConf.showAdvancedMapping, false, 'Caso 3: mapeo avanzado debe iniciar colapsado');
  passed++;

  // CASO 4: Confianza < 80% -> mapeo avanzado auto-expandido
  const lowConfAnalysis = makeFakeAnalysis({ overallConfidencePct: '79.99', invalidRowsCount: 0 });
  const stateLowConf = applyAnalysisResultState(afterFile, lowConfAnalysis);
  assert.equal(shouldAutoExpandAdvancedMapping(lowConfAnalysis), true);
  assert.equal(stateLowConf.showAdvancedMapping, true, 'Caso 4: confianza < 80% debe auto-expandir mapeo');
  passed++;

  // CASO 5: invalidRowsCount > 0 (aun con confianza alta) -> mapeo avanzado auto-expandido
  const withErrorsAnalysis = makeFakeAnalysis({ overallConfidencePct: '95.00', invalidRowsCount: 3 });
  assert.equal(shouldAutoExpandAdvancedMapping(withErrorsAnalysis), true, 'Caso 5: errores > 0 debe auto-expandir');
  passed++;

  // CASO 6: Edge cases null/undefined/invalidRowsCount undefined/confianza corrupta (fail-safe)
  assert.equal(shouldAutoExpandAdvancedMapping(null), false);
  assert.equal(shouldAutoExpandAdvancedMapping(undefined), false);
  assert.equal(
    shouldAutoExpandAdvancedMapping(makeFakeAnalysis({ overallConfidencePct: '92.00', invalidRowsCount: undefined })),
    false
  );
  assert.equal(
    shouldAutoExpandAdvancedMapping(makeFakeAnalysis({ overallConfidencePct: 'NaN_CORRUPT', invalidRowsCount: 0 })),
    true,
    'Caso 6: confianza no parseable debe activar fail-safe (expandir)'
  );
  passed++;

  // CASO 7: Purga completa en RAM post-ingesta exitosa + incremento de requestSeq
  const purgedPostIngest = purgePldIngestionUiState(stateHighConf);
  assert.equal(purgedPostIngest.preparedFile, null);
  assert.equal(purgedPostIngest.csvContent, '');
  assert.equal(purgedPostIngest.analysis, null);
  assert.deepEqual(purgedPostIngest.mappingOverride, {});
  assert.equal(purgedPostIngest.showAdvancedMapping, false);
  assert.equal(purgedPostIngest.showManualPaste, false);
  assert.ok(purgedPostIngest.requestSeq > stateHighConf.requestSeq, 'Caso 7: requestSeq debe incrementarse');
  passed++;

  // CASO 8: Clic en "Quitar archivo" purga estado y cancela callbacks en vuelo
  const purgedRemove = purgePldIngestionUiState(stateLowConf);
  assert.equal(purgedRemove.preparedFile, null);
  assert.equal(purgedRemove.analysis, null);
  assert.equal(purgedRemove.csvContent, '');
  assert.ok(purgedRemove.requestSeq > stateLowConf.requestSeq);
  passed++;

  // CASO 9: Inspección estructural de PldWatchlistIngestionCard.tsx (Zero-Display en DOM)
  const cardPath = path.resolve(process.cwd(), 'src/components/admin/PldWatchlistIngestionCard.tsx');
  const cardSrc = fs.readFileSync(cardPath, 'utf8');
  assert.equal(
    cardSrc.includes('setCsvContent(prepared.normalizedCsvContent)'),
    false,
    'Caso 9: PROHIBIDO asignar normalizedCsvContent a csvContent'
  );
  assert.equal(
    cardSrc.includes('analysis.maskedPreviewRows'),
    false,
    'Caso 9: tabla maskedPreviewRows debe estar suprimida de la pantalla'
  );
  assert.ok(cardSrc.includes('requestSeqRef'), 'Caso 9: debe usar requestSeqRef anti-stale-closures');
  assert.ok(cardSrc.includes('fileInputRef.current.value = \'\''), 'Caso 9: debe limpiar FileList del input');
  assert.ok(
    cardSrc.includes('{preparedFile ? (') && cardSrc.includes('{showManualPaste && ('),
    'Caso 9: textarea debe quedar estrictamente oculto cuando hay archivo cargado'
  );
  passed++;

  // CASO 10: Límites Anti-God-Object
  const cardLines = cardSrc.split(/\r?\n/).length;
  const helperPath = path.resolve(process.cwd(), 'src/utils/pldIngestionUiState.ts');
  const helperLines = fs.readFileSync(helperPath, 'utf8').split(/\r?\n/).length;
  assert.ok(cardLines < 580, `Caso 10: PldWatchlistIngestionCard.tsx (${cardLines}L) debe ser < 580L`);
  assert.ok(helperLines < 120, `Caso 10: pldIngestionUiState.ts (${helperLines}L) debe ser < 120L`);
  passed++;

  // CASO 11: No-regresión flujo de ingesta con archivo
  const resolvedFileCsv = resolveActiveIngestionCsv(afterFile.preparedFile, afterFile.csvContent);
  assert.equal(resolvedFileCsv, fakeFile.normalizedCsvContent);
  assert.equal(afterFile.preparedFile?.originalFileSha256, 'a'.repeat(64));
  passed++;

  // CASO 12: No-regresión flujo de pegado manual
  const resolvedManualCsv = resolveActiveIngestionCsv(afterManual.preparedFile, afterManual.csvContent);
  assert.equal(resolvedManualCsv, manualCsv);
  passed++;

  console.log(
    `APO-081 PASS: ${passed}/12 cases verified (Zero-Display UIF, RAM purge, anti-stale-closures, Anti-God-Object ${cardLines}L / ${helperLines}L).`
  );
}

run();
