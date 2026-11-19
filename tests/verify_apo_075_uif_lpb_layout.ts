/**
 * SUITE FORENSE DE VERIFICACIÓN — CRUSE-APO-2026-075 (Layout Oficial UIF-LPB 7 Columnas)
 *
 * Verifica los 5 Guardrails Forenses con las 22 filas reales proporcionadas por el Lic. Gerardo Olvera:
 * - G1: Aislamiento condicional para UIF_PERSONAS_BLOQUEADAS / layout 7 columnas UIF-LPB.
 * - G2: Concatenación robusta sin espacios dobles ni "undefined".
 * - G3: Extracción determinista Zero-PII de CURP (18), RFC (12-13) y Fecha ISO YYYY-MM-DD desde "Comentario".
 * - G5: 22/22 registros únicos válidos, curpCount === 1, rfcCount === 2, nameOnlyCount === 19, 0 errores.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';

if (!process.env.CRUSE_KEK_CURRENT_VERSION) process.env.CRUSE_KEK_CURRENT_VERSION = '1';
if (!process.env.CRUSE_KEK_V1) process.env.CRUSE_KEK_V1 = crypto.randomBytes(32).toString('base64');
if (!process.env.BLIND_INDEX_SECRET) process.env.BLIND_INDEX_SECRET = crypto.randomBytes(32).toString('base64');

import {
  assembleSplitPersonName,
  extractUifLpbEmbeddedMetadata,
  isUifLpbSevenColumnLayout,
} from '../src/services/pld/uifLpbCommentExtractor';
import { parseAndValidatePldCsvZeroPii } from '../src/services/pld/pldListParserAndValidator';

const OLVERA_UIF_LPB_22_ROWS = `Tipo,Primer Nombre,Otros Nombres,Primer Apellido,Otros Apellidos,Alias,Comentario
INDIVIDUO,EDGAR,VALERIANO,OROZCO,CABADAS,,LPB: 110_A_237_2025_EDGAR RFC: OOCE851021DX7 FECHA: 14/8/2025
INDIVIDUO,CESAR,ALEJANDRO,SEPULVEDA,ARELLANO,,LPB: 110_A_237_2025_CESAR CURP: SEAC821126HMNPRS08 FECHA: 14/8/2025
INDIVIDUO,ANTONIO,,ROMERO,SANCHEZ,,LPB: 2 Antonio_ RFC: ROSA8407279A6 FECHA: 6/8/2025
INDIVIDUO,ABD,AL HAMID,AL MASLI,,,110-A-699/2013
INDIVIDUO,NAZIR,MOHAMMAD,ABDUL,BASIR,,110-B-006/2014
INDIVIDUO,ZIA,UR,RAHMAN,MADANI,,110-B-006/2014
ENTIDAD,SHAMSUDDIN,,,,,110-B-006/2014
INDIVIDUO,ABDUL,GHAFAR,QUIRISHI,ABDUL GHANI,,110-B-006/2014
INDIVIDUO,ABDUL,MANAN,NYAZI,,,110-B-006/2014
INDIVIDUO,SAID,AHMED,SHAHIDKHEL,,,110-B-006/2014
INDIVIDUO,AREFULLAH,AREF,GHAZI,MOHAMMAD,,110-B-006/2014
INDIVIDUO,MOHAMMED,OMAR,GHULAM,NABI,,110-B-006/2014
INDIVIDUO,MOHAMMAD,NAIM,BARICH,KHUDAIDAD,,110-B-006/2014
INDIVIDUO,NIK,MOHAMMAD,DOST,MOHAMMAD,,110-B-006/2014
ENTIDAD,MATIULLAH,,,,,110-B-006/2014
INDIVIDUO,ALLAH,DAD,MATIN,,,110-B-006/2014
INDIVIDUO,UBAIDULLAH,AKHUND,YAR MOHAMMAD,MOHAMMAD,,110-B-006/2014
INDIVIDUO,FAZL,MOHAMMAD,MAZLOOM,,,110-B-006/2014
INDIVIDUO,MOHAMMAD,,AHMADI,,,110-B-006/2014
INDIVIDUO,ABDUL,JALILI,HAQQANI,WALI MOHAMMAD,,110-B-006/2014
INDIVIDUO,ABDULHAI,,MOTMAEN,,,110-B-006/2014
INDIVIDUO,MOHAMMAD,AZIM,AGHA,,,110-B-006/2014`;

async function main(): Promise<void> {
  // 1. Guardrail 2: Ensamblado robusto de nombres sin dobles espacios ni undefined
  assert.equal(
    assembleSplitPersonName(['INDIVIDUO', 'EDGAR', 'VALERIANO', 'OROZCO', 'CABADAS'], [1, 2], [3], [4]),
    'EDGAR VALERIANO OROZCO CABADAS'
  );
  assert.equal(
    assembleSplitPersonName(['INDIVIDUO', 'ANTONIO', '', 'ROMERO', 'SANCHEZ'], [1, 2], [3], [4]),
    'ANTONIO ROMERO SANCHEZ'
  );
  assert.equal(
    assembleSplitPersonName(['ENTIDAD', 'SHAMSUDDIN', null, undefined, ''], [1, 2], [3], [4]),
    'SHAMSUDDIN'
  );

  // 2. Guardrail 3: Extracción determinista de CURP, RFC y Fecha ISO desde Comentario
  const edgarMeta = extractUifLpbEmbeddedMetadata('LPB: 110_A_237_2025_EDGAR RFC: OOCE851021DX7 FECHA: 14/8/2025');
  assert.equal(edgarMeta.extractedCurp, '');
  assert.equal(edgarMeta.extractedRfc, 'OOCE851021DX7');
  assert.equal(edgarMeta.extractedDateIso, '2025-08-14');

  const cesarMeta = extractUifLpbEmbeddedMetadata('LPB: 110_A_237_2025_CESAR CURP: SEAC821126HMNPRS08 FECHA: 14/8/2025');
  assert.equal(cesarMeta.extractedCurp, 'SEAC821126HMNPRS08');
  assert.equal(cesarMeta.extractedRfc, '');
  assert.equal(cesarMeta.extractedDateIso, '2025-08-14');

  const antonioMeta = extractUifLpbEmbeddedMetadata('LPB: 2 Antonio_ RFC: ROSA8407279A6 FECHA: 6/8/2025');
  assert.equal(antonioMeta.extractedCurp, '');
  assert.equal(antonioMeta.extractedRfc, 'ROSA8407279A6');
  assert.equal(antonioMeta.extractedDateIso, '2025-08-06');

  // 3. Guardrail 1: Detección explícita del layout 7 columnas UIF-LPB
  assert.equal(
    isUifLpbSevenColumnLayout([
      'Tipo',
      'Primer Nombre',
      'Otros Nombres',
      'Primer Apellido',
      'Otros Apellidos',
      'Alias',
      'Comentario',
    ]),
    true
  );
  assert.equal(isUifLpbSevenColumnLayout(['RFC', 'NOMBRE_DEL_CONTRIBUYENTE', 'OFICIO_DOF']), false);

  // 4. Guardrail 5: Prueba integral E2E con las 22 filas reales del Lic. Olvera
  const parsed = await parseAndValidatePldCsvZeroPii(
    OLVERA_UIF_LPB_22_ROWS,
    'UIF_PERSONAS_BLOQUEADAS',
    'UIF-LPB-OLVERA-2026',
    { enableGroqSemanticAssist: false }
  );

  assert.equal(parsed.entries.length, 22, `Esperado 22 registros únicos, obtenido ${parsed.entries.length}`);
  assert.equal(parsed.analysis.stats.validUniqueEntriesCount, 22);
  assert.equal(parsed.analysis.stats.curpCount, 1, 'Debe detectar exactamente 1 CURP (Sepúlveda)');
  assert.equal(parsed.analysis.stats.rfcCount, 2, 'Debe detectar exactamente 2 RFCs (Orozco y Romero)');
  assert.equal(parsed.analysis.stats.nameOnlyCount, 19, 'Debe indexar exactamente 19 sujetos por nombre completo');
  assert.equal(parsed.analysis.stats.invalidRowsCount, 0, 'Debe haber 0 errores de parsing');

  // Verificar fechas normalizadas y nombres enmascarados correctos (nunca INDIVIDUO ni ENTIDAD)
  assert.equal(parsed.entries[0]?.identifierType, 'RFC');
  assert.equal(parsed.entries[0]?.publicationDate, '2025-08-14');
  assert.equal(parsed.entries[0]?.subjectMaskedName, 'E**** V**** O**** C****');

  assert.equal(parsed.entries[1]?.identifierType, 'CURP');
  assert.equal(parsed.entries[1]?.publicationDate, '2025-08-14');
  assert.equal(parsed.entries[1]?.subjectMaskedName, 'C**** A**** S**** A****');

  assert.equal(parsed.entries[2]?.identifierType, 'RFC');
  assert.equal(parsed.entries[2]?.publicationDate, '2025-08-06');
  assert.equal(parsed.entries[2]?.subjectMaskedName, 'A**** R**** S****');

  // Verificar ENTIDAD SHAMSUDDIN y MATIULLAH indexadas por su nombre real
  assert.equal(parsed.entries[6]?.identifierType, 'NOMBRE');
  assert.equal(parsed.entries[6]?.subjectMaskedName, 'S****');
  assert.equal(parsed.entries[14]?.identifierType, 'NOMBRE');
  assert.equal(parsed.entries[14]?.subjectMaskedName, 'M****');

  console.log('✅ PASS [Guardrail 1-5]: Layout Oficial UIF-LPB 7 columnas (22/22 registros reales Lic. Olvera, 1 CURP, 2 RFCs, 19 nombres, 0 errores).');
}

main().catch((err: unknown) => {
  console.error('❌ FALLO EN SUITE APO-075:', err);
  process.exit(1);
});
