/**
 * CONSTRUCTOR DETERMINISTA DE LAYOUTS OFICIALES PARA CÍRCULO DE CRÉDITO (SIC)
 * Expediente: CRUSE-APO-2026-024 (Guardrail Forense 1 / Directriz 1: Pureza Absoluta)
 *
 * - Cero importaciones de I/O (`fs`, `path`, `net`) y cero acceso a `Date.now()`.
 * - Cero `Math.round`, `Number.prototype.toFixed` ni `toLocaleString`.
 * - Todos los montos monetarios se formatean exclusivamente con `Decimal.js`:
 *   `new Decimal(amount).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)`.
 */

import Decimal from 'decimal.js';
import { CreditBureauControlTotals } from '../../types';

/** Constantes tipadas oficiales del Otorgante y Especificación Círculo de Crédito (Cero Magic Strings) */
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

/** Encabezados oficiales de CI-04-0009-Formato de carga PF */
export const PF_LAYOUT_HEADERS: readonly string[] = [
  'ClaveOtorgante',
  'NombreOtorgante',
  'IdentificadorDeMedio',
  'FechaExtraccion',
  'NotaOtorgante',
  'Version',
  'ApellidoPaterno',
  'ApellidoMaterno',
  'ApellidoAdicional',
  'Nombres',
  'FechaNacimiento',
  'RFC',
  'CURP',
  'NumeroSeguridadSocial',
  'Nacionalidad',
  'Residencia',
  'NumeroLicenciaConducir',
  'EstadoCivil',
  'Sexo',
  'ClaveElectorIFE',
  'NumeroDependientes',
  'FechaDefuncion',
  'IndicadorDefuncion',
  'TipoPersona',
  'Direccion',
  'ColoniaPoblacion',
  'DelegacionMunicipio',
  'Ciudad',
  'Estado',
  'CP',
  'FechaResidencia',
  'NumeroTelefono',
  'TipoDomicilio',
  'TipoAsentamiento',
  'OrigenDomicilio',
  'NombreEmpresa',
  'DireccionEmpleo',
  'ColoniaEmpleo',
  'MunicipioEmpleo',
  'CiudadEmpleo',
  'EstadoEmpleo',
  'CPEmpleo',
  'TelefonoEmpleo',
  'Extension',
  'Fax',
  'Puesto',
  'FechaContratacion',
  'ClaveMoneda',
  'SalarioMensual',
  'FechaUltimoDiaEmpleo',
  'FechaVerificacionEmpleo',
  'OrigenRazonSocialDomicilio',
  'ClaveActualOtorgante',
  'NombreOtorganteCuenta',
  'CuentaActual',
  'TipoResponsabilidad',
  'TipoCuenta',
  'TipoContrato',
  'ClaveUnidadMonetaria',
  'ValorActivoValuacion',
  'NumeroPagos',
  'FrecuenciaPagos',
  'MontoPagar',
  'FechaAperturaCuenta',
  'FechaUltimoPago',
  'FechaUltimaCompra',
  'FechaCierreCuenta',
  'FechaCorte',
  'Garantia',
  'CreditoMaximo',
  'SaldoActual',
  'LimiteCredito',
  'SaldoVencido',
  'NumeroPagosVencidos',
  'PagoActual',
  'HistoricoPagos',
  'ClavePrevencion',
  'TotalPagosReportados',
  'ClaveAnteriorOtorgante',
  'NombreAnteriorOtorgante',
  'NumeroCuentaAnterior',
  'FechaPrimerIncumplimiento',
  'SaldoInsoluto',
  'MontoUltimoPago',
  'FechaIngresoCarteraVencida',
  'MontoCorrespondienteIntereses',
  'FormaPagoActualIntereses',
  'DiasVencimiento',
  'PlazoMeses',
  'MontoCreditoOriginacion',
  'TotalSaldosActuales',
  'TotalSaldosVencidos',
  'TotalElementosNombreReportados',
  'TotalElementosDireccionReportados',
  'TotalElementosEmpleoReportados',
  'TotalElementosCuentaReportados',
  'NombreOtorganteControl',
] as const;

/** Encabezados oficiales de Formato PM */
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

/**
 * Formatea un monto monetario como entero exacto redondeado HALF_UP sin decimales ni comas.
 * Cumple Directriz 1: Uso explícito y exclusivo de Decimal.js.
 */
export function formatSicIntegerAmount(amount: string | number | Decimal): string {
  const dec = new Decimal(amount || 0);
  if (!dec.isFinite() || dec.isNegative()) {
    return '0';
  }
  return dec.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0);
}

/**
 * Convierte una cadena ISO (YYYY-MM-DD...) al formato oficial PF de 8 dígitos: YYYYMMDD.
 * Función 100% pura sin usar Date ni métodos dependientes del timezone del SO.
 */
export function formatIsoToYyyyMmDd(isoDate: string | null | undefined, fallbackYyyyMmDd: string): string {
  const clean = String(isoDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return fallbackYyyyMmDd;
  }
  return clean.replace(/-/g, '');
}

/**
 * Convierte una cadena ISO (YYYY-MM-DD...) al formato oficial PM de 8 dígitos: DDMMYYYY.
 */
export function formatIsoToDdMmYyyy(isoDate: string | null | undefined, fallbackDdMmYyyy: string): string {
  const clean = String(isoDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return fallbackDdMmYyyy;
  }
  const [yyyy, mm, dd] = clean.split('-');
  return `${dd}${mm}${yyyy}`;
}

/**
 * Extrae el periodo MMYYYY (6 dígitos) desde una fecha ISO YYYY-MM-DD para reportes PM.
 */
export function formatIsoToMmYyyy(isoDate: string): string {
  const clean = String(isoDate).trim().slice(0, 10);
  const [yyyy, mm] = clean.split('-');
  return `${mm ?? '01'}${yyyy ?? '2026'}`;
}

/**
 * Normaliza cadenas alfanuméricas al estándar ASCII mayúsculas de Círculo de Crédito.
 */
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

/**
 * Separa de forma determinista el nombre completo en Apellido Paterno, Apellido Materno y Nombres.
 */
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

/**
 * Mapea la frecuencia de pago de PostgreSQL al código oficial de 1 carácter de Círculo de Crédito.
 */
export function mapPaymentFrequencyToSicCode(frequency: string): 'Q' | 'M' | 'S' | 'C' | 'U' {
  const norm = String(frequency ?? '').trim().toUpperCase();
  if (norm === 'MENSUAL') return 'M';
  if (norm === 'SEMANAL') return 'S';
  if (norm === 'CATORCENAL') return 'C';
  if (norm === 'UNA_SOLA_EXHIBICION') return 'U';
  return 'Q';
}

/**
 * Calcula el plazo en días o meses con Decimal.js sin usar flotantes nativos.
 */
export function calculateSicTermDaysOrMonths(termPeriods: number, sicFreq: 'Q' | 'M' | 'S' | 'C' | 'U'): number {
  const periodsDec = new Decimal(Math.max(1, termPeriods));
  if (sicFreq === 'M') {
    return Number(periodsDec.times(30).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
  }
  return Number(periodsDec.times(15).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

/**
 * Calcula el estatus de PagoActual ('V' para vigente o '01'..'84' para periodos vencidos).
 */
export function computeSicPaymentStatus(daysPastDue: number, sicFreq: 'Q' | 'M' | 'S' | 'C' | 'U'): {
  pagoActual: string;
  pagosVencidos: string;
} {
  if (daysPastDue <= 0) {
    return { pagoActual: CREDIT_BUREAU_SPEC.PAGO_ACTUAL_VIGENTE, pagosVencidos: '' };
  }
  const divisor = sicFreq === 'M' ? 30 : 15;
  const overduePeriods = Number(
    new Decimal(daysPastDue)
      .dividedBy(divisor)
      .toDecimalPlaces(0, Decimal.ROUND_UP)
      .toFixed(0)
  );
  const clamped = Math.min(84, Math.max(1, overduePeriods));
  const padded = String(clamped).padStart(2, '0');
  return { pagoActual: padded, pagosVencidos: String(clamped) };
}

/**
 * Construye el nombre oficial del archivo regulatorio: 001496_MICROFINANCIERACRUSE_YYYYMMDD
 */
export function buildOfficialCreditBureauFileName(cutoffDateIso: string): {
  cutoffYyyyMmDd: string;
  baseFileName: string;
} {
  const cutoffYyyyMmDd = formatIsoToYyyyMmDd(cutoffDateIso, '20261031');
  return {
    cutoffYyyyMmDd,
    baseFileName: `${CREDIT_BUREAU_SPEC.FILE_PREFIX_ID}_${CREDIT_BUREAU_SPEC.FILE_COMPANY_SLUG}_${cutoffYyyyMmDd}`,
  };
}

/**
 * Ensambla de manera 100% pura y determinista los layouts PF y PM junto con las Cifras de Control.
 */
export function buildDeterministicCreditBureauLayouts(
  accounts: readonly RawSicAccountInput[],
  cutoffDateIso: string
): {
  cutoffYyyyMmDd: string;
  officialFileNameBase: string;
  controlTotals: CreditBureauControlTotals;
  pfCsvContent: string;
  pfPipeContent: string;
  pmCsvContent: string;
} {
  const { cutoffYyyyMmDd, baseFileName } = buildOfficialCreditBureauFileName(cutoffDateIso);
  const cutoffDdMmYyyy = formatIsoToDdMmYyyy(cutoffDateIso, '31102026');
  const periodMmYyyy = formatIsoToMmYyyy(cutoffDateIso);

  let sumCurrentBalance = new Decimal(0);
  let sumPastDueBalance = new Decimal(0);
  let pfCount = 0;
  let pmCount = 0;
  let frozenCount = 0;

  for (const acc of accounts) {
    sumCurrentBalance = sumCurrentBalance.plus(new Decimal(acc.currentPrincipalBalance || 0));
    sumPastDueBalance = sumPastDueBalance.plus(new Decimal(acc.pastDueBalance || 0));
    if (acc.personType === 'MORAL') {
      pmCount++;
    } else {
      pfCount++;
    }
    if (acc.loanStatus === 'FROZEN_EXTRAJUDICIAL') {
      frozenCount++;
    }
  }

  const totalCurrentStr = formatSicIntegerAmount(sumCurrentBalance);
  const totalPastDueStr = formatSicIntegerAmount(sumPastDueBalance);

  const controlTotals: CreditBureauControlTotals = {
    totalAccountsReported: accounts.length,
    totalPfAccounts: pfCount,
    totalPmAccounts: pmCount,
    totalFrozenExtrajudicialAccounts: frozenCount,
    totalCurrentBalance: totalCurrentStr,
    totalPastDueBalance: totalPastDueStr,
    totalNameElements: accounts.length,
    totalAddressElements: accounts.length,
    totalEmploymentElements: accounts.length,
  };

  const pfRows: string[][] = [];
  const pmRows: string[][] = [];

  for (const acc of accounts) {
    const sicFreq = mapPaymentFrequencyToSicCode(acc.paymentFrequency);
    const openedYyyyMmDd = formatIsoToYyyyMmDd(acc.activatedAtIso, cutoffYyyyMmDd);
    const lastPayYyyyMmDd = formatIsoToYyyyMmDd(acc.lastPaymentDateIso, openedYyyyMmDd);
    const birthYyyyMmDd = formatIsoToYyyyMmDd(acc.birthDateIso, '19800101');
    const { pagoActual, pagosVencidos } = computeSicPaymentStatus(acc.daysPastDue, sicFreq);
    const currentBalStr = formatSicIntegerAmount(acc.currentPrincipalBalance);
    const origPrincipalStr = formatSicIntegerAmount(acc.originalPrincipal);
    const pastDueStr = acc.daysPastDue > 0 ? formatSicIntegerAmount(acc.pastDueBalance) : '0';
    const scheduledPayStr = currentBalStr === '0' ? '0' : formatSicIntegerAmount(acc.scheduledPayment);
    const lastPayAmountStr = formatSicIntegerAmount(acc.lastPaymentAmount);
    const cleanAccountNo = sanitizeSicText(acc.contractNumber, 25).replace(/[^A-Z0-9]/g, '') || '000001';

    if (acc.personType === 'MORAL') {
      const shParts = splitSicPersonName(acc.shareholderName || 'REPRESENTANTE LEGAL CRUSE');
      pmRows.push([
        CREDIT_BUREAU_SPEC.OTORGANTE_CLAVE_PM,
        CREDIT_BUREAU_SPEC.OTORGANTE_NOMBRE,
        CREDIT_BUREAU_SPEC.INSTITUCION_PM,
        CREDIT_BUREAU_SPEC.FORMATO_PM,
        cutoffDdMmYyyy,
        periodMmYyyy,
        CREDIT_BUREAU_SPEC.VERSION_PM,
        sanitizeSicText(acc.rfcCleartext, 13),
        sanitizeSicText(acc.fullNameCleartext, 100),
        CREDIT_BUREAU_SPEC.NACIONALIDAD_DEFAULT,
        CREDIT_BUREAU_SPEC.CALIFICACION_CARTERA_A1,
        CREDIT_BUREAU_SPEC.SCIAN_DEFAULT_PM,
        sanitizeSicText(acc.addressCleartext, 60) || 'DOMICILIO CONOCIDO',
        CREDIT_BUREAU_SPEC.DEFAULT_EMPLOYER_COLONY,
        CREDIT_BUREAU_SPEC.DEFAULT_CITY,
        CREDIT_BUREAU_SPEC.DEFAULT_CITY,
        CREDIT_BUREAU_SPEC.DEFAULT_STATE_PM,
        CREDIT_BUREAU_SPEC.DEFAULT_ZIP,
        sanitizeSicText(acc.phoneCleartext, 15) || CREDIT_BUREAU_SPEC.DEFAULT_EMPLOYER_PHONE,
        CREDIT_BUREAU_SPEC.NACIONALIDAD_DEFAULT,
        sanitizeSicText(acc.shareholderRfc || 'XAXX010101000', 13),
        shParts.givenNames,
        shParts.paternalSurname,
        shParts.maternalSurname,
        formatSicIntegerAmount(acc.shareholderPercent ?? 50),
        cleanAccountNo,
        formatIsoToDdMmYyyy(acc.activatedAtIso, cutoffDdMmYyyy),
        String(Math.max(1, acc.termFortnights)),
        CREDIT_BUREAU_SPEC.TIPO_CONTRATO_PM_COMERCIAL,
        origPrincipalStr,
        CREDIT_BUREAU_SPEC.MONEDA_PM,
        String(Math.max(1, acc.termFortnights)),
        sicFreq === 'M' ? '30' : '15',
        scheduledPayStr,
        formatIsoToDdMmYyyy(acc.lastPaymentDateIso, cutoffDdMmYyyy),
        acc.daysPastDue > 0 ? cutoffDdMmYyyy : '00000000',
        currentBalStr,
        origPrincipalStr,
        String(Math.max(0, acc.daysPastDue)),
        currentBalStr,
        sanitizeSicText(acc.observationCode, 10),
      ]);
    } else {
      const nameParts = splitSicPersonName(acc.fullNameCleartext);
      const termDaysOrMonths = calculateSicTermDaysOrMonths(acc.termFortnights, sicFreq);
      const closeDateYyyyMmDd = currentBalStr === '0' ? cutoffYyyyMmDd : '';
      const tipoCuenta =
        acc.productType === 'CREDITO_ESPECIAL'
          ? CREDIT_BUREAU_SPEC.TIPO_CUENTA_REVOLVENTE
          : CREDIT_BUREAU_SPEC.TIPO_CUENTA_PAGOS_FIJOS;

      pfRows.push([
        CREDIT_BUREAU_SPEC.OTORGANTE_CLAVE_PF,
        CREDIT_BUREAU_SPEC.OTORGANTE_NOMBRE,
        '',
        cutoffYyyyMmDd,
        '',
        CREDIT_BUREAU_SPEC.VERSION_PF,
        nameParts.paternalSurname,
        nameParts.maternalSurname,
        '',
        nameParts.givenNames,
        birthYyyyMmDd,
        sanitizeSicText(acc.rfcCleartext, 13),
        sanitizeSicText(acc.curpCleartext, 18),
        '',
        CREDIT_BUREAU_SPEC.NACIONALIDAD_DEFAULT,
        '',
        '',
        '',
        sanitizeSicText(acc.gender, 1),
        sanitizeSicText(acc.voterIdCleartext, 20),
        '',
        '',
        '',
        'PF',
        sanitizeSicText(acc.addressCleartext, 60) || 'DOMICILIO CONOCIDO',
        CREDIT_BUREAU_SPEC.DEFAULT_EMPLOYER_COLONY,
        CREDIT_BUREAU_SPEC.DEFAULT_CITY,
        CREDIT_BUREAU_SPEC.DEFAULT_CITY,
        CREDIT_BUREAU_SPEC.DEFAULT_STATE_PF,
        CREDIT_BUREAU_SPEC.DEFAULT_ZIP,
        '',
        sanitizeSicText(acc.phoneCleartext, 15),
        '',
        '6',
        '',
        sanitizeSicText(acc.convenioName, 60) || CREDIT_BUREAU_SPEC.DEFAULT_EMPLOYER_NAME,
        CREDIT_BUREAU_SPEC.DEFAULT_EMPLOYER_STREET,
        CREDIT_BUREAU_SPEC.DEFAULT_EMPLOYER_COLONY,
        CREDIT_BUREAU_SPEC.DEFAULT_CITY,
        CREDIT_BUREAU_SPEC.DEFAULT_CITY,
        CREDIT_BUREAU_SPEC.DEFAULT_STATE_PF,
        CREDIT_BUREAU_SPEC.DEFAULT_ZIP,
        CREDIT_BUREAU_SPEC.DEFAULT_EMPLOYER_PHONE,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        CREDIT_BUREAU_SPEC.NACIONALIDAD_DEFAULT,
        CREDIT_BUREAU_SPEC.OTORGANTE_CLAVE_PF,
        CREDIT_BUREAU_SPEC.OTORGANTE_NOMBRE,
        cleanAccountNo,
        CREDIT_BUREAU_SPEC.TIPO_RESPONSABILIDAD_INDIVIDUAL,
        tipoCuenta,
        CREDIT_BUREAU_SPEC.TIPO_CONTRATO_CONSUMO,
        CREDIT_BUREAU_SPEC.MONEDA_PF,
        '',
        String(Math.max(1, acc.termFortnights)),
        sicFreq,
        scheduledPayStr,
        openedYyyyMmDd,
        lastPayYyyyMmDd,
        openedYyyyMmDd,
        closeDateYyyyMmDd,
        cutoffYyyyMmDd,
        '',
        origPrincipalStr,
        currentBalStr,
        origPrincipalStr,
        pastDueStr,
        pagosVencidos,
        pagoActual,
        '',
        sanitizeSicText(acc.observationCode, 10),
        '',
        '',
        '',
        '',
        '',
        currentBalStr,
        lastPayAmountStr,
        '',
        '',
        '',
        acc.daysPastDue > 0 ? String(acc.daysPastDue) : '',
        String(termDaysOrMonths),
        origPrincipalStr,
        totalCurrentStr,
        totalPastDueStr === '0' ? '' : totalPastDueStr,
        String(pfCount),
        String(pfCount),
        String(pfCount),
        String(pfCount),
        CREDIT_BUREAU_SPEC.OTORGANTE_NOMBRE,
      ]);
    }
  }

  const escapeCsvCell = (v: string): string => `"${v.replace(/"/g, '""')}"`;

  const pfCsvContent = [
    PF_LAYOUT_HEADERS.map(escapeCsvCell).join(','),
    ...pfRows.map((r) => r.map(escapeCsvCell).join(',')),
  ].join('\r\n');

  const pfPipeContent = [
    PF_LAYOUT_HEADERS.join('|'),
    ...pfRows.map((r) => r.join('|')),
  ].join('\r\n');

  const pmCsvContent = [
    PM_LAYOUT_HEADERS.map(escapeCsvCell).join(','),
    ...pmRows.map((r) => r.map(escapeCsvCell).join(',')),
  ].join('\r\n');

  return {
    cutoffYyyyMmDd,
    officialFileNameBase: baseFileName,
    controlTotals,
    pfCsvContent,
    pfPipeContent,
    pmCsvContent,
  };
}
