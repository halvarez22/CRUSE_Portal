/**
 * PARSER MULTI-DELIMITADOR DE LAYOUTS DE RETENCIÓN DE NÓMINA Y SELLO SHA-256
 *
 * @implements CRUSE-APO-2026-026 (Directriz 3: Cálculo inmediato de sourceFileHash SHA-256 sobre contenido crudo)
 * @implements CRUSE-APO-2026-026 (Directriz 4: Sanitización temprana y Cero-PII en excepciones)
 * @implements RN-07 / RN-10 (Soporte para marcador "SUSPENSION" y columna opcional NUMERO_CONTRATO / EQUIVCIA)
 */

import crypto from 'crypto';

export interface RawPayrollRow {
  curp: string;
  name: string;
  amount: string;
  originalLine: number;
  contractNumber?: string;
  isSuspensionMarker?: boolean;
}

export interface ParsedPayrollFileManifest {
  sourceFileHash: string;
  delimiter: ',' | ';' | '\t' | '|';
  rows: RawPayrollRow[];
}

const CURP_HEADER_ALIASES = ['CURP', 'CLAVE_CURP', 'TRABAJADOR_CURP', 'CURP_EMPLEADO', 'CURP_ENMASCARADA'];
const NAME_HEADER_ALIASES = ['NOMBRE', 'EMPLEADO', 'NOMBRE_EMPLEADO', 'TRABAJADOR', 'NOMBRE_COMPLETO', 'ACREDITADO'];
const AMOUNT_HEADER_ALIASES = [
  'IMPORTE_RETENIDO',
  'IMPORTE',
  'MONTO',
  'MONTO_DESCUENTO',
  'DESCUENTO',
  'RETENCION',
  'CUOTA',
  'PAGO',
  'RETENCION_RECIBIDA',
];
const CONTRACT_HEADER_ALIASES = [
  'NUMERO_CONTRATO',
  'NUM_CONTRATO',
  'CONTRATO',
  'EQUIVCIA',
  'EQUIVALENCIA',
  'FOLIO',
  'ID_CONTRATO',
];

function detectDelimiter(headerLine: string): ',' | ';' | '\t' | '|' {
  const candidates: Array<{ sep: ',' | ';' | '\t' | '|'; count: number }> = [
    { sep: ',', count: (headerLine.match(/,/g) || []).length },
    { sep: ';', count: (headerLine.match(/;/g) || []).length },
    { sep: '\t', count: (headerLine.match(/\t/g) || []).length },
    { sep: '|', count: (headerLine.match(/\|/g) || []).length },
  ];
  candidates.sort((a, b) => b.count - a.count);
  return candidates[0] && candidates[0].count > 0 ? candidates[0].sep : ',';
}

function splitDelimitedLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function findColumnIndex(headers: string[], configuredName: string | undefined, aliases: string[]): number {
  const candidates = configuredName
    ? [configuredName.trim().toUpperCase(), ...aliases]
    : aliases;
  for (const candidate of candidates) {
    const idx = headers.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

function sanitizeAmountCell(rawAmount: string): { normalizedAmount: string; isSuspensionMarker: boolean } {
  const upper = rawAmount.trim().toUpperCase();
  if (upper === 'SUSPENSION' || upper === 'SUSPENSIÓN' || upper === 'LICENCIA') {
    return { normalizedAmount: '0.00', isSuspensionMarker: true };
  }
  const cleaned = upper.replace(/[$\s,]/g, '');
  return { normalizedAmount: cleaned || '0.00', isSuspensionMarker: false };
}

/**
 * Directriz 3: Calcula inmediatamente el SHA-256 sobre el contenido crudo del archivo
 * antes de realizar cualquier transformación o parsing.
 */
export function computeRawFileSha256(rawContent: string): string {
  return crypto.createHash('sha256').update(rawContent, 'utf8').digest('hex');
}

export function parsePayrollCsvWithManifest(
  csvContent: string,
  layoutJson: string = '{}'
): ParsedPayrollFileManifest {
  // Directriz 3: Hash SHA-256 inmediato sobre el buffer/string crudo recibido
  const sourceFileHash = computeRawFileSha256(csvContent);

  let layout: Record<string, string> = {};
  if (layoutJson && layoutJson.trim().length > 0) {
    try {
      const parsed: unknown = JSON.parse(layoutJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        layout = parsed as Record<string, string>;
      }
    } catch {
      throw new Error('Configuración JSON de layout de nómina inválida en el convenio.');
    }
  }

  let content = csvContent;
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('El archivo de retenciones está vacío.');
  }

  const headerLine = lines[0]!;
  const delimiter = detectDelimiter(headerLine);
  const headers = splitDelimitedLine(headerLine, delimiter).map((h) =>
    h.replace(/^["']|["']$/g, '').trim().toUpperCase()
  );

  const colCurp = findColumnIndex(headers, layout['curp'], CURP_HEADER_ALIASES);
  const colName = findColumnIndex(headers, layout['name'], NAME_HEADER_ALIASES);
  const colAmount = findColumnIndex(headers, layout['amount'], AMOUNT_HEADER_ALIASES);
  const colContract = findColumnIndex(headers, layout['contractNumber'], CONTRACT_HEADER_ALIASES);

  if (colCurp === -1 || colAmount === -1) {
    throw new Error(
      `El layout no contiene las columnas obligatorias (CURP e IMPORTE/MONTO). Encabezados detectados: ${headers.slice(0, 8).join(', ')}`
    );
  }

  const rows: RawPayrollRow[] = [];
  const minRequiredIdx = Math.max(colCurp, colAmount, colName !== -1 ? colName : 0);

  for (let i = 1; i < lines.length; i++) {
    const cols = splitDelimitedLine(lines[i]!, delimiter);
    if (cols.length <= minRequiredIdx) {
      continue;
    }

    const rawCurp = (cols[colCurp] ?? '').trim().toUpperCase();
    const rawName = colName !== -1 ? (cols[colName] ?? '').trim() : 'TRABAJADOR CONVENIO';
    const rawAmountCell = cols[colAmount] ?? '0';
    const rawContract = colContract !== -1 ? (cols[colContract] ?? '').trim().toUpperCase() : undefined;

    if (!rawCurp && !rawContract) {
      continue;
    }

    const { normalizedAmount, isSuspensionMarker } = sanitizeAmountCell(rawAmountCell);

    rows.push({
      curp: rawCurp,
      name: rawName || 'TRABAJADOR CONVENIO',
      amount: normalizedAmount,
      originalLine: i + 1,
      contractNumber: rawContract && rawContract.length > 0 ? rawContract : undefined,
      isSuspensionMarker,
    });
  }

  return {
    sourceFileHash,
    delimiter,
    rows,
  };
}

export function parsePayrollCsv(csvContent: string, layoutJson: string): RawPayrollRow[] {
  return parsePayrollCsvWithManifest(csvContent, layoutJson).rows;
}
