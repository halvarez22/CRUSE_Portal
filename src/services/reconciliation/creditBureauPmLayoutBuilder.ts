/**
 * CONSTRUCTOR PURO DE LAYOUT PERSONAS MORALES (PM v5 — HD, EM, AC, CR) Y UTILIDADES COMPARTIDAS SIC
 * Expediente: CRUSE-APO-2026-063 (Caso 4 — Guardrail Forense 4: Validación Estricta de Longitud Fija y Anti-God-Object)
 *
 * - Homologado a '9. Reporte Circulo de credito ..._PM.xlsx' (Lic. Alma):
 *   Segmentos obligatorios PM v5: HD (Encabezado), EM (Compañía), AC (Accionista/Aval), CR (Crédito 36 cols).
 * - Guardrail Forense 4: Aserción inquebrantable de longitud fija por segmento (EXPECTED_LENGTH_BY_SEGMENT)
 *   antes de emitir cada línea del archivo TXT regulatorio.
 * - Cero punto flotante nativo (FLOAT_CALLS_COUNT === 0; uso exclusivo de Decimal.js).
 */

import Decimal from 'decimal.js';

export type PmSegmentType = 'HD' | 'EM' | 'AC' | 'CR';

export const EXPECTED_LENGTH_BY_SEGMENT: Readonly<Record<PmSegmentType, number>> = {
  HD: 100,
  EM: 350,
  AC: 200,
  CR: 280,
} as const;

/** Constantes tipadas oficiales del Otorgante y Especificación Círculo de Crédito */
export const CREDIT_BUREAU_SPEC = {
  FILE_PREFIX_ID: '001496',
  FILE_COMPANY_SLUG: 'MICROFINANCIERACRUSE',
  OTORGANTE_CLAVE_PF: '0014960045',
  OTORGANTE_CLAVE_PM: '1496',
  OTORGANTE_NOMBRE: 'MICROFINANCIERA CRUSE',
  INSTITUCION_PM: '005',
  FORMATO_PM: '1',
  VERSION_PF: '4',
  VERSION_PM: '5',
  NACIONALIDAD_DEFAULT: 'MX',
  MONEDA_PF: 'MX',
  MONEDA_PM: '001',
  TIPO_RESPONSABILIDAD_INDIVIDUAL: 'I',
  TIPO_CUENTA_PAGOS_FIJOS: 'F',
  TIPO_CUENTA_REVOLVENTE: 'R',
  TIPO_CONTRATO_CONSUMO: 'CC',
  TIPO_CONTRATO_PM_COMERCIAL: '6280',
  CALIFICACION_CARTERA_A1: 'a1',
  SCIAN_DEFAULT_PM: '8519011',
  PAGO_ACTUAL_VIGENTE: 'V',
  MISSING_MATERNAL_SURNAME: 'SIN PROPORCIONAR',
  DEFAULT_CITY: 'CHIHUAHUA',
  DEFAULT_STATE_PF: 'CHIH',
  DEFAULT_STATE_PM: 'CHI',
  DEFAULT_ZIP: '31000',
  DEFAULT_EMPLOYER_NAME: 'GOBIERNO DEL ESTADO DE CHIHUAHUA',
  DEFAULT_EMPLOYER_STREET: 'TEOFILO BORUNDA 2219',
  DEFAULT_EMPLOYER_COLONY: 'CENTRO',
  DEFAULT_EMPLOYER_PHONE: '6144155754',
} as const;

/** Encabezados oficiales de Formato PM v5 */
export const PM_LAYOUT_HEADERS: readonly string[] = [
  'Otorgante',
  'NombreOtorgante',
  'Institucion',
  'Formato',
  'FechaGeneracion',
  'PeriodoQueReporta',
  'Version',
  'RFC_Empresa',
  'Compania',
  'Nacionalidad',
  'CalificacionCartera',
  'ClaveBanxicoSCIAN',
  'Direccion1',
  'Colonia',
  'DelegMun',
  'Ciudad',
  'Estado',
  'CP',
  'Telefono',
  'Pais',
  'RFC_Accionista',
  'Nombre1_Accionista',
  'ApellidoPaterno_Accionista',
  'ApellidoMaterno_Accionista',
  'Porcentaje_Accionista',
  'NumContrato',
  'FechaApertura',
  'PlazoMeses',
  'TipoCredito',
  'SaldoInicial',
  'Moneda',
  'NumPagos',
  'FrecuenciaPagosDias',
  'ImportePagos',
  'FechaUltimoPago',
  'FechaPrimerIncumplimiento',
  'SaldoInsoluto',
  'CreditoMaximoUtilizado',
  'DiasVencidos',
  'Cantidad',
  'ClaveObservacion',
] as const;

export interface RawSicAccountInput {
  contractNumber: string;
  personType: 'FISICA' | 'MORAL';
  fullNameCleartext: string;
  rfcCleartext: string;
  curpCleartext: string;
  birthDateIso: string | null;
  gender: string | null;
  voterIdCleartext: string | null;
  addressCleartext: string;
  phoneCleartext: string;
  convenioName: string;
  productType: string;
  loanStatus: string;
  paymentFrequency: string;
  termFortnights: number;
  originalPrincipal: string | number;
  currentPrincipalBalance: string | number;
  scheduledPayment: string | number;
  activatedAtIso: string;
  lastPaymentDateIso: string | null;
  lastPaymentAmount: string | number;
  daysPastDue: number;
  pastDueBalance: string | number;
  observationCode: string | null;
  shareholderRfc?: string | null;
  shareholderName?: string | null;
  shareholderPercent?: string | number | null;
}

export function formatSicIntegerAmount(amount: string | number | Decimal): string {
  const dec = new Decimal(amount || 0);
  if (!dec.isFinite() || dec.isNegative()) {
    return '0';
  }
  return dec.toDP(0, Decimal.ROUND_HALF_UP).toFixed(0);
}

export function formatIsoToYyyyMmDd(isoDate: string | null | undefined, fallbackYyyyMmDd: string): string {
  const clean = String(isoDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return fallbackYyyyMmDd;
  }
  return clean.replace(/-/g, '');
}

export function formatIsoToDdMmYyyy(isoDate: string | null | undefined, fallbackDdMmYyyy: string): string {
  const clean = String(isoDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return fallbackDdMmYyyy;
  }
  const [yyyy, mm, dd] = clean.split('-');
  return `${dd}${mm}${yyyy}`;
}

export function formatIsoToMmYyyy(isoDate: string): string {
  const clean = String(isoDate).trim().slice(0, 10);
  const [yyyy, mm] = clean.split('-');
  return `${mm ?? '01'}${yyyy ?? '2026'}`;
}

export function sanitizeSicText(input: string | null | undefined, maxLen = 100): string {
  const raw = String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[|"\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return raw.slice(0, maxLen);
}

export function splitSicPersonName(fullName: string): {
  paternalSurname: string;
  maternalSurname: string;
  givenNames: string;
} {
  const clean = sanitizeSicText(fullName, 120);
  const tokens = clean.split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return {
      paternalSurname: 'SIN DATO',
      maternalSurname: CREDIT_BUREAU_SPEC.MISSING_MATERNAL_SURNAME,
      givenNames: 'SIN DATO',
    };
  }
  if (tokens.length === 1) {
    return {
      paternalSurname: tokens[0]!,
      maternalSurname: CREDIT_BUREAU_SPEC.MISSING_MATERNAL_SURNAME,
      givenNames: tokens[0]!,
    };
  }
  if (tokens.length === 2) {
    return {
      paternalSurname: tokens[0]!,
      maternalSurname: CREDIT_BUREAU_SPEC.MISSING_MATERNAL_SURNAME,
      givenNames: tokens[1]!,
    };
  }
  return {
    paternalSurname: tokens[0]!,
    maternalSurname: tokens[1]!,
    givenNames: tokens.slice(2).join(' '),
  };
}

function padRightExact(value: string, len: number): string {
  return sanitizeSicText(value, len).padEnd(len, ' ').slice(0, len);
}

function padLeftZeroExact(value: string | number, len: number): string {
  const digits = String(value ?? '0').replace(/[^0-9]/g, '');
  return digits.padStart(len, '0').slice(-len);
}

/**
 * Guardrail Forense 4: Valida que cada segmento del layout PM v5 cumpla estrictamente
 * la longitud fija de caracteres antes de anexarse al archivo TXT.
 */
export function assertPmV5SegmentFixedLength(segmentType: PmSegmentType, line: string): string {
  if (line.length !== EXPECTED_LENGTH_BY_SEGMENT[segmentType]) {
    throw new Error(
      `PM v5 Layout Error: Segment ${segmentType} has ${line.length} chars, expected ${EXPECTED_LENGTH_BY_SEGMENT[segmentType]}`
    );
  }
  return line;
}

/**
 * Construye una fila CSV PM y los 4 segmentos de longitud fija (HD, EM, AC, CR) del layout PM v5.
 */
export function buildPmV5AccountRowAndSegments(
  acc: RawSicAccountInput,
  cutoffDdMmYyyy: string,
  periodMmYyyy: string,
  sicFreq: 'Q' | 'M' | 'S' | 'C' | 'U'
): {
  csvRow: string[];
  fixedSegments: string[];
} {
  const currentBalStr = formatSicIntegerAmount(acc.currentPrincipalBalance);
  const origPrincipalStr = formatSicIntegerAmount(acc.originalPrincipal);
  const scheduledPayStr = currentBalStr === '0' ? '0' : formatSicIntegerAmount(acc.scheduledPayment);
  const cleanAccountNo = sanitizeSicText(acc.contractNumber, 25).replace(/[^A-Z0-9]/g, '') || '000001';
  const shParts = splitSicPersonName(acc.shareholderName || 'REPRESENTANTE LEGAL CRUSE');
  const rfcEmpresa = sanitizeSicText(acc.rfcCleartext, 13) || 'MCR1002231B7';
  const nombreEmpresa = sanitizeSicText(acc.fullNameCleartext, 100) || 'EMPRESA ACREDITADA SA DE CV';
  const direccionEmpresa = sanitizeSicText(acc.addressCleartext, 60) || 'DOMICILIO CONOCIDO';
  const telEmpresa = sanitizeSicText(acc.phoneCleartext, 15) || CREDIT_BUREAU_SPEC.DEFAULT_EMPLOYER_PHONE;
  const shRfc = sanitizeSicText(acc.shareholderRfc || 'XAXX010101000', 13);
  const shPercent = formatSicIntegerAmount(acc.shareholderPercent ?? 50);
  const openedDdMmYyyy = formatIsoToDdMmYyyy(acc.activatedAtIso, cutoffDdMmYyyy);
  const lastPayDdMmYyyy = formatIsoToDdMmYyyy(acc.lastPaymentDateIso, cutoffDdMmYyyy);
  const firstDefaultDdMmYyyy = acc.daysPastDue > 0 ? cutoffDdMmYyyy : '00000000';
  const obsClean = sanitizeSicText(acc.observationCode, 10);

  const csvRow: string[] = [
    CREDIT_BUREAU_SPEC.OTORGANTE_CLAVE_PM,
    CREDIT_BUREAU_SPEC.OTORGANTE_NOMBRE,
    CREDIT_BUREAU_SPEC.INSTITUCION_PM,
    CREDIT_BUREAU_SPEC.FORMATO_PM,
    cutoffDdMmYyyy,
    periodMmYyyy,
    CREDIT_BUREAU_SPEC.VERSION_PM,
    rfcEmpresa,
    nombreEmpresa,
    CREDIT_BUREAU_SPEC.NACIONALIDAD_DEFAULT,
    CREDIT_BUREAU_SPEC.CALIFICACION_CARTERA_A1,
    CREDIT_BUREAU_SPEC.SCIAN_DEFAULT_PM,
    direccionEmpresa,
    CREDIT_BUREAU_SPEC.DEFAULT_EMPLOYER_COLONY,
    CREDIT_BUREAU_SPEC.DEFAULT_CITY,
    CREDIT_BUREAU_SPEC.DEFAULT_CITY,
    CREDIT_BUREAU_SPEC.DEFAULT_STATE_PM,
    CREDIT_BUREAU_SPEC.DEFAULT_ZIP,
    telEmpresa,
    CREDIT_BUREAU_SPEC.NACIONALIDAD_DEFAULT,
    shRfc,
    shParts.givenNames,
    shParts.paternalSurname,
    shParts.maternalSurname,
    shPercent,
    cleanAccountNo,
    openedDdMmYyyy,
    String(Math.max(1, acc.termFortnights)),
    CREDIT_BUREAU_SPEC.TIPO_CONTRATO_PM_COMERCIAL,
    origPrincipalStr,
    CREDIT_BUREAU_SPEC.MONEDA_PM,
    String(Math.max(1, acc.termFortnights)),
    sicFreq === 'M' ? '30' : '15',
    scheduledPayStr,
    lastPayDdMmYyyy,
    firstDefaultDdMmYyyy,
    currentBalStr,
    origPrincipalStr,
    String(Math.max(0, acc.daysPastDue)),
    currentBalStr,
    obsClean,
  ];

  // Segmento HD (100 chars exactos): 2 + 6 + 50 + 3 + 1 + 8 + 6 + 2 + 22 = 100
  const hdLine = assertPmV5SegmentFixedLength(
    'HD',
    'HD' +
      padRightExact(CREDIT_BUREAU_SPEC.OTORGANTE_CLAVE_PM, 6) +
      padRightExact(CREDIT_BUREAU_SPEC.OTORGANTE_NOMBRE, 50) +
      padRightExact(CREDIT_BUREAU_SPEC.INSTITUCION_PM, 3) +
      padRightExact(CREDIT_BUREAU_SPEC.FORMATO_PM, 1) +
      padRightExact(cutoffDdMmYyyy, 8) +
      padRightExact(periodMmYyyy, 6) +
      padRightExact(CREDIT_BUREAU_SPEC.VERSION_PM, 2) +
      padRightExact('', 22)
  );

  // Segmento EM (350 chars exactos): 2 + 13 + 100 + 2 + 2 + 10 + 60 + 40 + 40 + 40 + 4 + 5 + 15 + 2 + 15 = 350
  const emLine = assertPmV5SegmentFixedLength(
    'EM',
    'EM' +
      padRightExact(rfcEmpresa, 13) +
      padRightExact(nombreEmpresa, 100) +
      padRightExact(CREDIT_BUREAU_SPEC.NACIONALIDAD_DEFAULT, 2) +
      padRightExact(CREDIT_BUREAU_SPEC.CALIFICACION_CARTERA_A1, 2) +
      padRightExact(CREDIT_BUREAU_SPEC.SCIAN_DEFAULT_PM, 10) +
      padRightExact(direccionEmpresa, 60) +
      padRightExact(CREDIT_BUREAU_SPEC.DEFAULT_EMPLOYER_COLONY, 40) +
      padRightExact(CREDIT_BUREAU_SPEC.DEFAULT_CITY, 40) +
      padRightExact(CREDIT_BUREAU_SPEC.DEFAULT_CITY, 40) +
      padRightExact(CREDIT_BUREAU_SPEC.DEFAULT_STATE_PM, 4) +
      padRightExact(CREDIT_BUREAU_SPEC.DEFAULT_ZIP, 5) +
      padRightExact(telEmpresa, 15) +
      padRightExact(CREDIT_BUREAU_SPEC.NACIONALIDAD_DEFAULT, 2) +
      padRightExact('', 15)
  );

  // Segmento AC (200 chars exactos): 2 + 13 + 13 + 50 + 50 + 50 + 3 + 19 = 200
  const acLine = assertPmV5SegmentFixedLength(
    'AC',
    'AC' +
      padRightExact(rfcEmpresa, 13) +
      padRightExact(shRfc, 13) +
      padRightExact(shParts.givenNames, 50) +
      padRightExact(shParts.paternalSurname, 50) +
      padRightExact(shParts.maternalSurname, 50) +
      padLeftZeroExact(shPercent, 3) +
      padRightExact('', 19)
  );

  // Segmento CR (280 chars exactos): 2 + 13 + 25 + 8 + 4 + 4 + 15 + 3 + 4 + 3 + 15 + 8 + 8 + 15 + 15 + 4 + 15 + 4 + 115 = 280
  const crLine = assertPmV5SegmentFixedLength(
    'CR',
    'CR' +
      padRightExact(rfcEmpresa, 13) +
      padRightExact(cleanAccountNo, 25) +
      padRightExact(openedDdMmYyyy, 8) +
      padLeftZeroExact(Math.max(1, acc.termFortnights), 4) +
      padRightExact(CREDIT_BUREAU_SPEC.TIPO_CONTRATO_PM_COMERCIAL, 4) +
      padLeftZeroExact(origPrincipalStr, 15) +
      padRightExact(CREDIT_BUREAU_SPEC.MONEDA_PM, 3) +
      padLeftZeroExact(Math.max(1, acc.termFortnights), 4) +
      padLeftZeroExact(sicFreq === 'M' ? 30 : 15, 3) +
      padLeftZeroExact(scheduledPayStr, 15) +
      padRightExact(lastPayDdMmYyyy, 8) +
      padRightExact(firstDefaultDdMmYyyy, 8) +
      padLeftZeroExact(currentBalStr, 15) +
      padLeftZeroExact(origPrincipalStr, 15) +
      padLeftZeroExact(Math.max(0, acc.daysPastDue), 4) +
      padLeftZeroExact(currentBalStr, 15) +
      padRightExact(obsClean, 4) +
      padRightExact('', 115)
  );

  return {
    csvRow,
    fixedSegments: [hdLine, emLine, acLine, crLine],
  };
}
