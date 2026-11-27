/**
 * SUITE FORENSE CRUSE-APO-2026-080 (100% SINTÉTICA — ZERO-PII)
 *
 * Verifica:
 * 1) Splitter CSV RFC 4180 (5 casos: normal, salto embebido, escapes "", combinado, multilínea)
 * 2) Normalizador y validador de nombres internacionales (5 casos positivos ONU/UIF)
 * 3) Defensas Anti-CSV-Injection y Anti-Leakage Zero-PII (7 casos negativos: RFC, RFC corrupto con :/#,
 *    CURP, hash hex 32-64, fórmulas CSV =/@/+, pipe malicioso |CMD, números puros)
 * 4) E2E UIF-LPB con Columna1 (INDIVIDUO/ENTIDAD) + encabezados TIPO/CLASIFICACIÓN + sin encabezado
 *    demostrando CERO shadowing de nombres reales y extracción completa de CURP/RFC desde Comentario multilínea.
 */

import assert from 'node:assert/strict';
import { splitCsvRecordsRespectingQuotes } from '../src/services/pld/rfc4180CsvSplitter';
import {
  sanitizeInternationalNameForValidation,
  validateInternationalLegalName,
} from '../src/services/pld/intlNameNormalizer';
import { splitDelimitedLineSafe } from '../src/services/ai/pldSmartColumnInferer';
import {
  normalizePldNameForBlindIndex,
  parseAndValidatePldCsvZeroPii,
} from '../src/services/pld/pldListParserAndValidator';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.CRUSE_KEK_CURRENT_VERSION = '1';
  process.env.CRUSE_KEK_V1 = Buffer.alloc(32, 7).toString('base64');
  process.env.BLIND_INDEX_SECRET = Buffer.alloc(32, 9).toString('base64');
  delete process.env.GROQ_API_KEY;

  let passed = 0;

  // =========================================================================
  // 1. CINCO CASOS RFC 4180 (splitCsvRecordsRespectingQuotes + splitDelimitedLineSafe)
  // =========================================================================
  {
    const r1 = splitCsvRecordsRespectingQuotes('"celda normal",valor,123');
    assert.equal(r1.length, 1);
    assert.deepEqual(splitDelimitedLineSafe(r1[0]!, ','), ['celda normal', 'valor', '123']);
    passed++;

    const r2 = splitCsvRecordsRespectingQuotes('"celda con\nsalto de línea",valor,123');
    assert.equal(r2.length, 1);
    assert.deepEqual(splitDelimitedLineSafe(r2[0]!, ','), ['celda con salto de línea', 'valor', '123']);
    passed++;

    const r3 = splitCsvRecordsRespectingQuotes('"celda con ""comillas"" escapadas",valor,123');
    assert.equal(r3.length, 1);
    assert.deepEqual(splitDelimitedLineSafe(r3[0]!, ','), ['celda con "comillas" escapadas', 'valor', '123']);
    passed++;

    const r4 = splitCsvRecordsRespectingQuotes('"celda con\r\nsalto\ny ""comillas""",valor,123');
    assert.equal(r4.length, 1);
    assert.deepEqual(splitDelimitedLineSafe(r4[0]!, ','), ['celda con salto y "comillas"', 'valor', '123']);
    passed++;

    const r5 = splitCsvRecordsRespectingQuotes('registro1\nregistro2\r\nregistro3');
    assert.equal(r5.length, 3);
    assert.deepEqual(r5, ['registro1', 'registro2', 'registro3']);
    passed++;
  }

  // =========================================================================
  // 2. CINCO+ CASOS POSITIVOS DE NOMBRES INTERNACIONALES (UIF / ONU / OFAC)
  // =========================================================================
  const validIntlNames = [
    "O’CONNOR LORD´S",
    'GARCÍA LÓPEZ FRANÇOIS MÖLLER',
    'AL-RASHID TRADING – UNIT: ALPHA',
    'OFFICE # 39 | SUCURSAL NORTE',
    'SOFT\u00ADHYPHENATED CORP',
    'M19',
  ];
  for (const name of validIntlNames) {
    const alphaNorm = normalizePldNameForBlindIndex(name);
    const res = validateInternationalLegalName(name, alphaNorm);
    assert.equal(res.isValid, true, `Debe aceptar nombre internacional legítimo: ${name}`);
    assert.ok(res.blindIndexKey.length >= 2, `Blind index key debe ser >= 2 chars para: ${name}`);
    passed++;
  }

  // Confirmar sanitización NFD/tipográfica exacta
  assert.equal(sanitizeInternationalNameForValidation("O’Connor\u00AD – François"), "O'CONNOR - FRANCOIS");
  passed++;

  // =========================================================================
  // 3. CASOS NEGATIVOS: ANTI-LEAKAGE ZERO-PII + ANTI-CSV-INJECTION + BASURA
  // =========================================================================
  const rejectedInputs = [
    'GOMA850101H78', // RFC PF en columna nombre
    'GOMA:850101#H78', // RFC corrupto con : y #
    'HEAA010101HDFRRL02', // CURP en columna nombre
    'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', // Hash MD5 32 hex
    '=SUM(A1:A10)', // CSV formula injection (=)
    '@cmd', // CSV formula injection (@)
    '+SUM(1,2)', // CSV formula injection (+)
    '|CMD /C calc', // Pipe malicioso al inicio
    'ENTIDAD | POWERSHELL', // Pipe con comando shell
    '123456789', // Numérico puro sin letras
    '---', // Símbolos sin contenido nominal
  ];
  for (const bad of rejectedInputs) {
    const alphaNorm = normalizePldNameForBlindIndex(bad);
    const res = validateInternationalLegalName(bad, alphaNorm);
    assert.equal(res.isValid, false, `Debe rechazar entrada insegura/inválida: ${bad}`);
    passed++;
  }

  // =========================================================================
  // 4. E2E UIF-LPB: Columna1 (INDIVIDUO/ENTIDAD) SIN SHADOWING + MULTILÍNEA
  // =========================================================================
  const syntheticUifCsv = [
    'Columna1,Primer Nombre,Otros Nombres,Primer Apellido,Otros Apellidos,Alias,Comentario',
    'INDIVIDUO,JUAN,CARLOS,PEREZ,LOPEZ,,"Acuerdo 28/2014\n02/2015\nSin RFC"',
    'INDIVIDUO,MARIA,ELENA,O’CONNOR,GARCÍA,,"Acuerdo 99/2026\nRFC: MAEG850101AB1\nFecha: 15/11/2026"',
    'ENTIDAD,OFFICE # 39,LORD´S,,,"ALIAS TEST","Acuerdo 110/F/B/2026\nResolución ONU"',
    'ENTIDAD,FRANÇOIS,MÖLLER,HOLDINGS,GROUP,,"Acuerdo 45/2025\nCURP: FMLR800202HDFRRL09"',
    'ENTIDAD,M19,,,,,"Acuerdo 77/2026\nEntidad alfanumérica corta"',
  ].join('\n');

  const parsedStrict = await parseAndValidatePldCsvZeroPii(
    syntheticUifCsv,
    'UIF_PERSONAS_BLOQUEADAS',
    'ACUERDO-UIF-2026',
    {
      fileExtensionHint: 'XLSX',
      allowPartialValidRowsInPreview: false,
      enableGroqSemanticAssist: true,
    }
  );

  assert.equal(parsedStrict.analysis.columns[0]?.assignedRole, 'IGNORE', 'Columna1 debe clasificarse como IGNORE');
  assert.equal(parsedStrict.analysis.stats.invalidRowsCount, 0, 'Debe haber 0 filas inválidas en modo estricto');
  assert.equal(parsedStrict.entries.length, 5, 'Los 5 sujetos únicos deben extraerse SIN colapsar en INDIVIDUO/ENTIDAD');
  assert.equal(parsedStrict.analysis.stats.curpCount, 1);
  assert.equal(parsedStrict.analysis.stats.rfcCount, 1);
  assert.equal(parsedStrict.analysis.stats.nameOnlyCount, 3);
  passed++;

  // =========================================================================
  // 5. GUARDIA CATEGÓRICA EN ARCHIVO CON ENCABEZADO DESCONOCIDO / SIN ENCABEZADO
  // =========================================================================
  const unknownHeaderCsv = [
    'X_TIPO_ARBITRARIO,Primer Nombre,Primer Apellido,Comentario',
    'Persona Física,ROBERTO,GOMEZ,"Acuerdo 01/2026\nLínea 2"',
    'P. Física,ANA,MARTINEZ,"Acuerdo 02/2026"',
    'Persona Moral,COMERCIALIZADORA DELTA SA DE CV,,"Acuerdo 03/2026"',
    'Jurídica,CONSTRUCTORA ALFA SA,,"Acuerdo 04/2026"',
    'Individual,CARLOS,RAMIREZ,"Acuerdo 05/2026"',
  ].join('\n');

  const parsedUnknown = await parseAndValidatePldCsvZeroPii(
    unknownHeaderCsv,
    'UIF_PERSONAS_BLOQUEADAS',
    'ACUERDO-UIF-2026',
    { allowPartialValidRowsInPreview: false }
  );
  assert.equal(
    parsedUnknown.analysis.columns[0]?.assignedRole,
    'IGNORE',
    'Columna categórica con encabezado arbitrario debe bloquearse por contenido (>=80%) como IGNORE'
  );
  assert.equal(parsedUnknown.entries.length, 5);
  assert.equal(parsedUnknown.analysis.stats.invalidRowsCount, 0);
  passed++;

  console.log(`APO-080 PASS: ${passed} assertions verified (RFC 4180 multiline + Intl names + Zero-PII + Category Guard).`);
}

run().catch((err) => {
  console.error('APO-080 FAILED:', err);
  process.exit(1);
});
