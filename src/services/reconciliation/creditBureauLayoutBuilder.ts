/**
 * CONSTRUCTOR DETERMINISTA DE LAYOUTS OFICIALES PARA CÍRCULO DE CRÉDITO (SIC — PF v4 y PM v5)
 * Expedientes: CRUSE-APO-2026-024 y CRUSE-APO-2026-063 (Guardrail Forense 4 — Anti-God-Object < 580 líneas)
 *
 * - Cero importaciones de I/O (`fs`, `path`, `net`) y cero acceso a `Date.now()`.
 * - Cero `Math.round`, `Number.prototype.toFixed` ni `toLocaleString`.
 * - Delegación del formato Personas Morales (PM v5 con validación de longitud fija por segmento HD, EM, AC, CR)
 *   a `creditBureauPmLayoutBuilder.ts`.
 */

import Decimal from 'decimal.js';
import { CreditBureauControlTotals } from '../../types';
import {
  assertPmV5SegmentFixedLength,
  buildPmV5AccountRowAndSegments,
  CREDIT_BUREAU_SPEC,
  EXPECTED_LENGTH_BY_SEGMENT,
  formatIsoToDdMmYyyy,
  formatIsoToMmYyyy,
  formatIsoToYyyyMmDd,
  formatSicIntegerAmount,
  PM_LAYOUT_HEADERS,
  PmSegmentType,
  RawSicAccountInput,
  sanitizeSicText,
  splitSicPersonName,
} from './creditBureauPmLayoutBuilder';

export {
  assertPmV5SegmentFixedLength,
  buildPmV5AccountRowAndSegments,
  CREDIT_BUREAU_SPEC,
  EXPECTED_LENGTH_BY_SEGMENT,
  formatIsoToDdMmYyyy,
  formatIsoToMmYyyy,
  formatIsoToYyyyMmDd,
  formatSicIntegerAmount,
  PM_LAYOUT_HEADERS,
  sanitizeSicText,
  splitSicPersonName,
};
export type { PmSegmentType, RawSicAccountInput };

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

export function mapPaymentFrequencyToSicCode(frequency: string): 'Q' | 'M' | 'S' | 'C' | 'U' {
  const norm = String(frequency ?? '').trim().toUpperCase();
  if (norm === 'MENSUAL') return 'M';
  if (norm === 'SEMANAL') return 'S';
  if (norm === 'CATORCENAL') return 'C';
  if (norm === 'UNA_SOLA_EXHIBICION') return 'U';
  return 'Q';
}

export function calculateSicTermDaysOrMonths(termPeriods: number, sicFreq: 'Q' | 'M' | 'S' | 'C' | 'U'): number {
  const periodsDec = new Decimal(Math.max(1, termPeriods));
  if (sicFreq === 'M') {
    return Number(periodsDec.times(30).toDP(0, Decimal.ROUND_HALF_UP).toFixed(0));
  }
  return Number(periodsDec.times(15).toDP(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

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
      .toDP(0, Decimal.ROUND_UP)
      .toFixed(0)
  );
  const clamped = Math.min(84, Math.max(1, overduePeriods));
  const padded = String(clamped).padStart(2, '0');
  return { pagoActual: padded, pagosVencidos: String(clamped) };
}

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
 * Ensambla de manera 100% pura y determinista los layouts PF (CSV y Pipe) y PM v5 (CSV y TXT de ancho fijo validado).
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
  pmFixedTxtContent: string;
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
    if (acc.loanStatus === 'FROZEN_EXTRAJUDICIAL' || acc.loanStatus === 'BAJA_LABORAL_ACTIVA') {
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
  const pmFixedLines: string[] = [];

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
      const builtPm = buildPmV5AccountRowAndSegments(acc, cutoffDdMmYyyy, periodMmYyyy, sicFreq);
      pmRows.push(builtPm.csvRow);
      pmFixedLines.push(...builtPm.fixedSegments);
    } else {
      const nameParts = splitSicPersonName(acc.fullNameCleartext);
      const termDaysOrMonths = calculateSicTermDaysOrMonths(acc.termFortnights, sicFreq);
      const closeDateYyyyMmDd = currentBalStr === '0' ? cutoffYyyyMmDd : '';
      const tipoCuenta =
        acc.productType === 'CREDITO_ESPECIAL' || acc.productType === 'ESPECIAL'
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

  const pmFixedTxtContent = pmFixedLines.join('\r\n');

  return {
    cutoffYyyyMmDd,
    officialFileNameBase: baseFileName,
    controlTotals,
    pfCsvContent,
    pfPipeContent,
    pmCsvContent,
    pmFixedTxtContent,
  };
}
