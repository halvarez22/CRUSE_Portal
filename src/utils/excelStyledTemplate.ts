/**
 * Motor de Plantilla Pre-Diseñada OpenXML (.xlsx) para Tabla de Amortización Oficial (CRUSE-APO-2026-032).
 * Cumple con Guardrail 1 (Formato contable nativo z: '"$"#,##0.00'), Guardrail 2 (< 400 líneas + validación XML estricta)
 * y Guardrail 3 (Fila de Totales ejecutiva con sumatoria exacta).
 */
import { AmortizationExportParams } from './amortizationExport';

export const EXCEL_CURRENCY_FORMAT = '"$"#,##0.00';

interface StyledCell {
  col: number; // 1-based (1 = A ... 7 = G)
  type: 'str' | 'num';
  value: string | number;
  styleIndex: number;
  z?: string;
}

interface StyledRow {
  rowNumber: number;
  height: number;
  cells: StyledCell[];
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(colIndex1Based: number): string {
  return String.fromCharCode(64 + colIndex1Based);
}

/**
 * Valida que cada documento XML generado para el contenedor OpenXML (.xlsx) esté bien formado
 * antes de empaquetarlo, previniendo cualquier advertencia de "Archivo reparado" en Microsoft Excel.
 */
export function validateOpenXmlPart(partName: string, xmlContent: string): void {
  if (!xmlContent.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')) {
    throw new Error(`[ExcelTemplate] Encabezado XML inválido en ${partName}`);
  }
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`[ExcelTemplate] Error de sintaxis XML en ${partName}: ${parserError.textContent}`);
    }
  }
}

/**
 * Empaqueta archivos en un contenedor ZIP estándar (Store / método 0 con CRC-32 IEEE 802.3)
 * 100% compatible con ECMA-376 OpenXML (.xlsx) sin dependencias externas de Node.
 */
function buildZipArchive(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  const crc32 = (buf: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = file.data;
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x555a, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x555a, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  let centralSize = 0;
  for (const cp of centralParts) centralSize += cp.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalOut = new Uint8Array(offset + centralSize + 22);
  let pos = 0;
  for (const lp of localParts) {
    totalOut.set(lp, pos);
    pos += lp.length;
  }
  for (const cp of centralParts) {
    totalOut.set(cp, pos);
    pos += cp.length;
  }
  totalOut.set(eocd, pos);
  return totalOut;
}

/**
 * Construye la hoja de estilos institucional (xl/styles.xml) con los colores oficiales de Microfinanciera Cruse
 * (#041734 Azul Marino Institucional, #249E82 Esmeralda Oficial, #F8FAFC Zebra y #059669 Capital)
 * y el formato numérico contable '"$"#,##0.00' (numFmtId="164").
 */
function buildInstitutionalStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/>
  </numFmts>
  <fonts count="8">
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/><family val="2"/></font>
    <font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF041734"/><name val="Segoe UI"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF0F766E"/><name val="Consolas"/><family val="3"/></font>
    <font><sz val="10"/><color rgb="FF1E293B"/><name val="Consolas"/><family val="3"/></font>
    <font><b/><sz val="10"/><color rgb="FF059669"/><name val="Consolas"/><family val="3"/></font>
    <font><b/><sz val="10"/><color rgb="FF041734"/><name val="Consolas"/><family val="3"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF041734"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF249E82"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE6F7F3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FF041734"/></left>
      <right style="thin"><color rgb="FF041734"/></right>
      <top style="medium"><color rgb="FF041734"/></top>
      <bottom style="double"><color rgb="FF041734"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="15">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="164" fontId="4" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="5" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="6" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="6" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="7" fillId="6" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}

/**
 * Genera el binario OpenXML (.xlsx) rellenando la plantilla institucional con los parámetros de la simulación.
 */
export function generateStyledAmortizationXlsxBytes(params: AmortizationExportParams): Uint8Array {
  const {
    productName,
    amount,
    selectedTerm,
    interestRateText,
    fortnightlyPayment,
    monthlyPaymentEquivalent,
    totalInterest,
    totalVat,
    totalInsurance,
    totalToPay,
    catPercent,
    schedule,
  } = params;

  const rows: StyledRow[] = [
    {
      rowNumber: 1,
      height: 30,
      cells: [1, 2, 3, 4, 5, 6, 7].map((c) => ({
        col: c,
        type: 'str',
        value: c === 1 ? '  MICROFINANCIERA CRUSE, S.A. DE C.V., SOFOM, E.N.R.' : '',
        styleIndex: 1,
      })),
    },
    {
      rowNumber: 2,
      height: 22,
      cells: [1, 2, 3, 4, 5, 6, 7].map((c) => ({
        col: c,
        type: 'str',
        value: c === 1 ? '  TABLA DE AMORTIZACIÓN QUINCENAL OFICIAL — CONFORME A NOM-186-SCFI-2013' : '',
        styleIndex: 2,
      })),
    },
    {
      rowNumber: 4,
      height: 20,
      cells: [
        { col: 1, type: 'str', value: 'Producto Financiero', styleIndex: 3 },
        { col: 2, type: 'str', value: productName, styleIndex: 4 },
        { col: 3, type: 'str', value: '', styleIndex: 4 },
        { col: 5, type: 'str', value: 'Pago Quincenal Fijo', styleIndex: 3 },
        { col: 6, type: 'num', value: fortnightlyPayment, styleIndex: 5, z: EXCEL_CURRENCY_FORMAT },
        { col: 7, type: 'str', value: 'MXN', styleIndex: 3 },
      ],
    },
    {
      rowNumber: 5,
      height: 20,
      cells: [
        { col: 1, type: 'str', value: 'Monto Solicitado', styleIndex: 3 },
        { col: 2, type: 'num', value: amount, styleIndex: 5, z: EXCEL_CURRENCY_FORMAT },
        { col: 3, type: 'str', value: 'MXN', styleIndex: 4 },
        { col: 5, type: 'str', value: 'Importe Mensual (2 Qnas)', styleIndex: 3 },
        { col: 6, type: 'num', value: monthlyPaymentEquivalent, styleIndex: 5, z: EXCEL_CURRENCY_FORMAT },
        { col: 7, type: 'str', value: 'MXN', styleIndex: 3 },
      ],
    },
    {
      rowNumber: 6,
      height: 20,
      cells: [
        { col: 1, type: 'str', value: 'Plazo Contratado', styleIndex: 3 },
        { col: 2, type: 'str', value: `${selectedTerm} quincenas (${selectedTerm / 2} meses)`, styleIndex: 4 },
        { col: 3, type: 'str', value: '', styleIndex: 4 },
        { col: 5, type: 'str', value: 'Total de Intereses', styleIndex: 3 },
        { col: 6, type: 'num', value: totalInterest, styleIndex: 9, z: EXCEL_CURRENCY_FORMAT },
        { col: 7, type: 'str', value: 'MXN', styleIndex: 4 },
      ],
    },
    {
      rowNumber: 7,
      height: 20,
      cells: [
        { col: 1, type: 'str', value: 'Tasa Ordinaria Fija', styleIndex: 3 },
        { col: 2, type: 'str', value: interestRateText, styleIndex: 4 },
        { col: 3, type: 'str', value: '', styleIndex: 4 },
        { col: 5, type: 'str', value: 'IVA sobre Intereses (16%)', styleIndex: 3 },
        { col: 6, type: 'num', value: totalVat, styleIndex: 9, z: EXCEL_CURRENCY_FORMAT },
        { col: 7, type: 'str', value: 'MXN', styleIndex: 4 },
      ],
    },
    {
      rowNumber: 8,
      height: 20,
      cells: [
        { col: 1, type: 'str', value: 'Comisión por Apertura', styleIndex: 3 },
        { col: 2, type: 'str', value: '$0.00 MXN (0%)', styleIndex: 4 },
        { col: 3, type: 'str', value: '', styleIndex: 4 },
        { col: 5, type: 'str', value: 'Total Seguro de Vida', styleIndex: 3 },
        { col: 6, type: 'num', value: totalInsurance, styleIndex: 9, z: EXCEL_CURRENCY_FORMAT },
        { col: 7, type: 'str', value: 'MXN', styleIndex: 4 },
      ],
    },
    {
      rowNumber: 9,
      height: 22,
      cells: [
        { col: 1, type: 'str', value: 'CAT Promedio Ponderado', styleIndex: 3 },
        { col: 2, type: 'str', value: `${catPercent}% sin IVA`, styleIndex: 4 },
        { col: 3, type: 'str', value: '', styleIndex: 4 },
        { col: 5, type: 'str', value: 'MONTO TOTAL A PAGAR', styleIndex: 3 },
        { col: 6, type: 'num', value: totalToPay, styleIndex: 5, z: EXCEL_CURRENCY_FORMAT },
        { col: 7, type: 'str', value: 'MXN', styleIndex: 3 },
      ],
    },
    {
      rowNumber: 11,
      height: 25,
      cells: [
        { col: 1, type: 'str', value: 'QUINCENA', styleIndex: 6 },
        { col: 2, type: 'str', value: 'SALDO INSOLUTO (MXN)', styleIndex: 6 },
        { col: 3, type: 'str', value: 'CAPITAL (MXN)', styleIndex: 6 },
        { col: 4, type: 'str', value: 'INTERÉS (MXN)', styleIndex: 6 },
        { col: 5, type: 'str', value: 'IVA 16% (MXN)', styleIndex: 6 },
        { col: 6, type: 'str', value: 'SEGURO (MXN)', styleIndex: 6 },
        { col: 7, type: 'str', value: 'PAGO FIJO QUINCENAL (MXN)', styleIndex: 6 },
      ],
    },
  ];

  let currentRow = 12;
  for (let idx = 0; idx < schedule.length; idx++) {
    const r = schedule[idx]!;
    const isEven = idx % 2 === 1;
    rows.push({
      rowNumber: currentRow++,
      height: 19,
      cells: [
        { col: 1, type: 'num', value: r.period, styleIndex: isEven ? 8 : 7 },
        { col: 2, type: 'num', value: Number(r.balance), styleIndex: isEven ? 10 : 9, z: EXCEL_CURRENCY_FORMAT },
        { col: 3, type: 'num', value: Number(r.capital), styleIndex: isEven ? 12 : 11, z: EXCEL_CURRENCY_FORMAT },
        { col: 4, type: 'num', value: Number(r.interest), styleIndex: isEven ? 10 : 9, z: EXCEL_CURRENCY_FORMAT },
        { col: 5, type: 'num', value: Number(r.vat), styleIndex: isEven ? 10 : 9, z: EXCEL_CURRENCY_FORMAT },
        { col: 6, type: 'num', value: Number(r.insurance), styleIndex: isEven ? 10 : 9, z: EXCEL_CURRENCY_FORMAT },
        { col: 7, type: 'num', value: Number(r.payment), styleIndex: isEven ? 5 : 5, z: EXCEL_CURRENCY_FORMAT },
      ],
    });
  }

  // Fila de Totales Ejecutiva al cierre (Guardrail 3)
  rows.push({
    rowNumber: currentRow,
    height: 24,
    cells: [
      { col: 1, type: 'str', value: 'TOTALES', styleIndex: 13 },
      { col: 2, type: 'num', value: 0, styleIndex: 14, z: EXCEL_CURRENCY_FORMAT },
      { col: 3, type: 'num', value: amount, styleIndex: 14, z: EXCEL_CURRENCY_FORMAT },
      { col: 4, type: 'num', value: totalInterest, styleIndex: 14, z: EXCEL_CURRENCY_FORMAT },
      { col: 5, type: 'num', value: totalVat, styleIndex: 14, z: EXCEL_CURRENCY_FORMAT },
      { col: 6, type: 'num', value: totalInsurance, styleIndex: 14, z: EXCEL_CURRENCY_FORMAT },
      { col: 7, type: 'num', value: totalToPay, styleIndex: 14, z: EXCEL_CURRENCY_FORMAT },
    ],
  });

  const rowsXml = rows
    .map((r) => {
      const cellsXml = r.cells
        .map((c) => {
          const ref = `${colLetter(c.col)}${r.rowNumber}`;
          if (c.type === 'num') {
            return `<c r="${ref}" s="${c.styleIndex}"><v>${c.value}</v></c>`;
          }
          return `<c r="${ref}" s="${c.styleIndex}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(c.value))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r.rowNumber}" ht="${r.height}" customHeight="1">${cellsXml}</row>`;
    })
    .join('');

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0" showGridLines="1"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="26" customWidth="1"/>
    <col min="2" max="2" width="24" customWidth="1"/>
    <col min="3" max="3" width="20" customWidth="1"/>
    <col min="4" max="4" width="20" customWidth="1"/>
    <col min="5" max="5" width="26" customWidth="1"/>
    <col min="6" max="6" width="22" customWidth="1"/>
    <col min="7" max="7" width="26" customWidth="1"/>
  </cols>
  <sheetData>${rowsXml}</sheetData>
  <mergeCells count="6">
    <mergeCell ref="A1:G1"/>
    <mergeCell ref="A2:G2"/>
    <mergeCell ref="B4:C4"/>
    <mergeCell ref="B6:C6"/>
    <mergeCell ref="B7:C7"/>
    <mergeCell ref="B9:C9"/>
  </mergeCells>
  <pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
</worksheet>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Tabla_Amortizacion" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = buildInstitutionalStylesXml();

  const xmlParts: Array<[string, string]> = [
    ['[Content_Types].xml', contentTypesXml],
    ['_rels/.rels', rootRelsXml],
    ['xl/workbook.xml', workbookXml],
    ['xl/_rels/workbook.xml.rels', workbookRelsXml],
    ['xl/styles.xml', stylesXml],
    ['xl/worksheets/sheet1.xml', sheetXml],
  ];

  const encoder = new TextEncoder();
  const archiveEntries = xmlParts.map(([name, xml]) => {
    validateOpenXmlPart(name, xml);
    return { name, data: encoder.encode(xml) };
  });

  return buildZipArchive(archiveEntries);
}
