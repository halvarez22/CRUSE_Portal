/**
 * SPLITTER CSV RFC 4180 QUOTE-AWARE PARA LISTAS PLD/FT (UIF / ONU / OFAC / SAT 69-B)
 *
 * Módulo hoja puro (0 dependencias externas — Regla 3 Anti-God-Object).
 * Respeta saltos de línea embebidos (`\r\n` / `\n`) dentro de celdas entrecomilladas
 * producidas por Excel (`Alt+Enter` vía `XLSX.utils.sheet_to_csv`) y preserva intactas
 * las comillas RFC 4180 (`"..."` y escapes `""`) para `splitDelimitedLineSafe`.
 *
 * @implements CRUSE-APO-2026-080
 */

export function splitCsvRecordsRespectingQuotes(content: string): string[] {
  const records: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!;

    if (ch === '"') {
      if (inQuotes && i + 1 < content.length && content[i + 1] === '"') {
        // Preservar escape RFC 4180 ("") intacto para el separador de columnas aguas abajo
        current += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += '"';
      }
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && i + 1 < content.length && content[i + 1] === '\n') {
        i++; // Consumir CRLF como un solo salto lógico
      }
      if (inQuotes) {
        // Salto embebido dentro de celda entrecomillada: colapsar a espacio simple
        // preservando límites de palabra (\b) para extractUifLpbEmbeddedMetadata
        current += ' ';
      } else {
        if (current.trim().length > 0) {
          records.push(current);
        }
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current.trim().length > 0) {
    records.push(current);
  }

  return records;
}
