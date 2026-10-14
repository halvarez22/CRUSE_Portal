export interface RawPayrollRow {
  curp: string;
  name: string;
  amount: string;
  originalLine: number;
}

export function parsePayrollCsv(csvContent: string, layoutJson: string): RawPayrollRow[] {
  let layout: Record<string, string>;
  try {
    layout = JSON.parse(layoutJson);
  } catch(e) {
    throw new Error('Configuración de layout de nómina inválida en el convenio.');
  }

  // Quitar BOM UTF-8 si existe
  let content = csvContent;
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('El archivo CSV está vacío.');
  }

  // Detectar separador
  const headerLine = lines[0]!;
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  const separator = semiCount > commaCount ? ';' : ',';

  // Parser simple que respeta comillas (RFC 4180)
  function splitCsvLine(line: string): string[] {
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

  const headers = splitCsvLine(headerLine).map(h => h.toUpperCase());
  
  const colCurp = headers.indexOf((layout['curp'] || 'CURP').toUpperCase());
  const colName = headers.indexOf((layout['name'] || 'NOMBRE').toUpperCase());
  const colAmount = headers.indexOf((layout['amount'] || 'IMPORTE_RETENIDO').toUpperCase());

  if (colCurp === -1 || colName === -1 || colAmount === -1) {
    throw new Error(`El archivo no tiene las columnas requeridas según el convenio. Columnas encontradas: ${headers.join(', ')}`);
  }

  const rows: RawPayrollRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    if (cols.length < Math.max(colCurp, colName, colAmount) + 1) {
      continue;
    }
    rows.push({
      curp: cols[colCurp]!,
      name: cols[colName]!,
      amount: cols[colAmount]!,
      originalLine: i + 1
    });
  }

  return rows;
}
