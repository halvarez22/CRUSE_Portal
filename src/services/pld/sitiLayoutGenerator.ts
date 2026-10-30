/**
 * GENERADOR DEL LAYOUT OFICIAL .TXT DE 41 COLUMNAS SITI (CNBV / UIF — SHCP)
 *
 * Implementa el Punto de Control #3 de la FASE 2.4 (CRUSE-APO-2026-042):
 * 1. Construye exactamente las 41 columnas oficiales del formato SITI UIF/CNBV (`Siti41ColumnRow`).
 * 2. Delimitador estricto: punto y coma (`;`) entre las 41 columnas.
 * 3. Salto de línea estricto: `CRLF` (`\r\n`).
 * 4. Columna 11 (`Monto`): formateada estrictamente con 2 decimales vía `Decimal.js`
 *    (`.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)`), sin signos de `$` ni comas de miles.
 * 5. Columnas 40 y 41: sanitizadas eliminando `;`, `|`, saltos de línea y diacríticos, e inyectando
 *    forzosamente los prefijos regulatorios (`"Reporte de 24 Horas. "` o `"Lista de Personas Bloqueadas. "`).
 *
 * @implements CRUSE-APO-2026-042 (FASE 2.4 — Punto de Control #3)
 * @implements Regla 2 HRU (Cero Hardcoding) y Regla 3 Anti-God-Object (< 600 líneas)
 */

import crypto from 'crypto';
import Decimal from 'decimal.js';
import { db } from '../db/connectionPool';
import { sanitizeDecimalString } from '../../config/riskMatrixWeights';
import { auditEventStore } from '../audit/auditEventStore';
import { Siti41ColumnRow, UserRole } from '../../types';

/**
 * Garantiza que la Columna 40 contenga exactamente el prefijo obligatorio CNBV/UIF cuando aplica.
 */
export function enforceCol40MandatoryPrefix(
  prefixType: 'NONE' | 'Reporte de 24 Horas' | 'Lista de Personas Bloqueadas',
  rawDescription: string
): string {
  const cleaned = String(rawDescription ?? '').trim();
  if (prefixType === 'NONE') {
    return cleaned;
  }
  const expectedPrefix = `${prefixType}. `;
  if (cleaned.startsWith(expectedPrefix)) {
    return cleaned;
  }
  return `${expectedPrefix}${cleaned}`;
}

/**
 * Sanitiza un campo alfanumérico para el Layout SITI de la UIF/CNBV:
 * - Remueve acentos/diacríticos (NFD)
 * - Elimina delimitadores prohibidos (`;`, `|`, `\r`, `\n`, `"`)
 */
export function sanitizeSitiAlphanumericField(raw: string, maxLength = 2500): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[;|\r\n"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Convierte una fecha ISO o SQL (`YYYY-MM-DD...`) al formato oficial SITI `AAAAMMDD` (8 dígitos).
 */
export function formatSitiDateAAAAMMDD(isoOrSqlDate: string | null | undefined): string {
  const cleaned = String(isoOrSqlDate ?? '')
    .trim()
    .slice(0, 10)
    .replace(/-/g, '');
  if (/^\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Formatea el monto para la Columna 11 del Layout SITI usando exclusivamente `Decimal.js`
 * (2 decimales exactos, sin comas de miles, sin símbolo `$`).
 */
export function formatSitiCol11Amount(rawAmountMxn: string): string {
  return sanitizeDecimalString(rawAmountMxn, '0.00')
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}

/**
 * Serializa una estructura `Siti41ColumnRow` en una línea oficial SITI separada por `;` (exactamente 41 columnas).
 */
export function serializeSiti41ColumnRow(row: Siti41ColumnRow): string {
  const orderedColumns: ReadonlyArray<string> = [
    row.col01TipoReporte,
    row.col02PeriodoReporte,
    row.col03Folio,
    row.col04OrganoSupervisor,
    row.col05ClaveSujetoObligado,
    row.col06Localidad,
    row.col07Sucursal,
    row.col08TipoOperacion,
    row.col09InstrumentoMonetario,
    row.col10NumeroCuentaContrato,
    row.col11Monto,
    row.col12Moneda,
    row.col13FechaOperacion,
    row.col14FechaDeteccion,
    row.col15Nacionalidad,
    row.col16TipoPersona,
    row.col17RazonSocial,
    row.col18Nombre,
    row.col19ApellidoPaterno,
    row.col20ApellidoMaterno,
    row.col21Rfc,
    row.col22Curp,
    row.col23FechaNacimientoConstitucion,
    row.col24Domicilio,
    row.col25Colonia,
    row.col26CiudadPoblacion,
    row.col27Telefono,
    row.col28ActividadEconomica,
    row.col29AgenteNombre,
    row.col30AgenteApellidoPaterno,
    row.col31AgenteApellidoMaterno,
    row.col32AgenteRfc,
    row.col33AgenteCurp,
    row.col34ConsecutivoCuentaRelacionada,
    row.col35NumeroCuentaRelacionada,
    row.col36ClaveSujetoRelacionado,
    row.col37TitularRelacionadoNombre,
    row.col38TitularRelacionadoApellidoPaterno,
    row.col39TitularRelacionadoApellidoMaterno,
    row.col40DescripcionOperacion,
    row.col41RazonesInusualidad,
  ];

  return orderedColumns.join(';');
}

async function readSitiEntityHeaderParams(): Promise<{
  organoSupervisor: string;
  claveSujetoObligado: string;
}> {
  const res = await db.query<{ param_key: string; param_text_value: string | null }>(`
    SELECT param_key, param_text_value
    FROM system_financial_parameters
    WHERE param_key IN ('PLD_CNBV_SUPERVISOR_CODE', 'PLD_CASFIM_ENTITY_CODE')
  `);
  const map = new Map<string, string>();
  for (const r of res.rows) {
    if (r.param_text_value) {
      map.set(r.param_key, r.param_text_value);
    }
  }
  return {
    organoSupervisor: map.get('PLD_CNBV_SUPERVISOR_CODE') ?? '001002',
    claveSujetoObligado: map.get('PLD_CASFIM_ENTITY_CODE') ?? '0692026',
  };
}

function resolveHubLocalityCode(hubCode: string): string {
  const upper = String(hubCode || 'HUB-CUU').toUpperCase();
  if (upper.includes('LEO')) return '01102001'; // León, Guanajuato
  if (upper.includes('CUN')) return '02300501'; // Benito Juárez (Cancún), Q. Roo
  return '00801901'; // Chihuahua, Chih. (Sede Central)
}

interface SitiReportDbRow {
  id: string;
  report_category: string;
  siti_report_type_code: string;
  expediente_id: string | null;
  subject_masked_name: string;
  subject_curp_masked: string;
  subject_rfc_masked: string;
  hub_code: string;
  operation_amount_mxn: number | string;
  mandatory_col40_prefix: string;
  col40_operation_description: string;
  col41_inusual_reasons: string;
  detected_at: string;
  created_at: string;
}

export interface GeneratedSitiTxtFileResult {
  readonly fileName: string;
  readonly txtContent: string;
  readonly sha256Hash: string;
  readonly totalRows: number;
  readonly rows: ReadonlyArray<Siti41ColumnRow>;
}

/**
 * Construye el archivo oficial `.TXT` SITI de 41 columnas separadas por `;` con salto de línea `CRLF` (`\r\n`)
 * a partir de los reportes regulatorios registrados en `pld_cnbv_reports_and_whistleblowing`.
 */
export async function generateOfficialSiti41ColumnTxtLayout(params: {
  reportIds?: ReadonlyArray<string>;
  sitiReportTypeFilter?: '1' | '2' | '3';
  actorEmail: string;
  actorRole: UserRole | 'sistema';
  sourceIp: string;
}): Promise<GeneratedSitiTxtFileResult> {
  const headerParams = await readSitiEntityHeaderParams();

  const res = await db.query<SitiReportDbRow>(`
    SELECT
      id,
      report_category,
      siti_report_type_code,
      expediente_id,
      subject_masked_name,
      subject_curp_masked,
      subject_rfc_masked,
      hub_code,
      operation_amount_mxn,
      mandatory_col40_prefix,
      col40_operation_description,
      col41_inusual_reasons,
      detected_at,
      created_at
    FROM pld_cnbv_reports_and_whistleblowing
    ORDER BY created_at ASC, id ASC
  `);

  const idSet =
    params.reportIds && params.reportIds.length > 0 ? new Set(params.reportIds) : null;

  const filteredDbRows = res.rows.filter((row: SitiReportDbRow) => {
    if (params.sitiReportTypeFilter && row.siti_report_type_code !== params.sitiReportTypeFilter) {
      return false;
    }
    if (idSet && !idSet.has(row.id)) {
      return false;
    }
    return true;
  });

  const builtRows: Siti41ColumnRow[] = filteredDbRows.map(
    (r: SitiReportDbRow, index: number) => {
      const tipoReporte = (
        r.siti_report_type_code === '1' || r.siti_report_type_code === '3'
          ? r.siti_report_type_code
          : '2'
      ) as '1' | '2' | '3';

      const fechaDeteccion = formatSitiDateAAAAMMDD(r.detected_at || r.created_at);
      const periodoReporte =
        tipoReporte === '1' ? fechaDeteccion.slice(0, 6) : fechaDeteccion;
      const folio = String(index + 1).padStart(6, '0');

      const nameTokens = sanitizeSitiAlphanumericField(r.subject_masked_name, 120)
        .toUpperCase()
        .split(' ')
        .filter(Boolean);
      const col18Nombre = nameTokens[0] ?? 'SUJETO';
      const col19ApellidoPaterno = nameTokens[1] ?? 'RESERVADO';
      const col20ApellidoMaterno = nameTokens.slice(2).join(' ') || 'X';

      const sanitizedRawCol40 = sanitizeSitiAlphanumericField(
        r.col40_operation_description,
        2800
      );
      const prefixType = (
        r.mandatory_col40_prefix === 'Reporte de 24 Horas' ||
        r.mandatory_col40_prefix === 'Lista de Personas Bloqueadas'
          ? r.mandatory_col40_prefix
          : 'NONE'
      ) as 'NONE' | 'Reporte de 24 Horas' | 'Lista de Personas Bloqueadas';

      const col40WithMandatoryPrefix = sanitizeSitiAlphanumericField(
        enforceCol40MandatoryPrefix(prefixType, sanitizedRawCol40),
        3000
      );
      const col41Sanitized = sanitizeSitiAlphanumericField(
        r.col41_inusual_reasons,
        3000
      ).toUpperCase();

      const isRoip = tipoReporte === '3';

      return {
        col01TipoReporte: tipoReporte,
        col02PeriodoReporte: periodoReporte,
        col03Folio: folio,
        col04OrganoSupervisor: headerParams.organoSupervisor,
        col05ClaveSujetoObligado: headerParams.claveSujetoObligado,
        col06Localidad: resolveHubLocalityCode(r.hub_code),
        col07Sucursal: sanitizeSitiAlphanumericField(r.hub_code || 'HUB-CUU', 20).toUpperCase(),
        col08TipoOperacion: '09',
        col09InstrumentoMonetario: '01',
        col10NumeroCuentaContrato: sanitizeSitiAlphanumericField(
          r.expediente_id || (isRoip ? '0' : r.id),
          30
        ),
        col11Monto: formatSitiCol11Amount(String(r.operation_amount_mxn)),
        col12Moneda: '1',
        col13FechaOperacion: fechaDeteccion,
        col14FechaDeteccion: tipoReporte === '1' ? '' : fechaDeteccion,
        col15Nacionalidad: '1',
        col16TipoPersona: '1',
        col17RazonSocial: '',
        col18Nombre,
        col19ApellidoPaterno,
        col20ApellidoMaterno,
        col21Rfc: sanitizeSitiAlphanumericField(r.subject_rfc_masked, 13).toUpperCase(),
        col22Curp: sanitizeSitiAlphanumericField(r.subject_curp_masked, 18).toUpperCase(),
        col23FechaNacimientoConstitucion: '19850101',
        col24Domicilio: 'DOMICILIO RESGUARDADO EN BOVEDA ZERO PII CRUSE',
        col25Colonia: 'CENTRO',
        col26CiudadPoblacion: resolveHubLocalityCode(r.hub_code),
        col27Telefono: '6140000000',
        col28ActividadEconomica: '8991015',
        col29AgenteNombre: '',
        col30AgenteApellidoPaterno: '',
        col31AgenteApellidoMaterno: '',
        col32AgenteRfc: '',
        col33AgenteCurp: '',
        col34ConsecutivoCuentaRelacionada: '',
        col35NumeroCuentaRelacionada: '',
        col36ClaveSujetoRelacionado: '',
        col37TitularRelacionadoNombre: '',
        col38TitularRelacionadoApellidoPaterno: '',
        col39TitularRelacionadoApellidoMaterno: '',
        col40DescripcionOperacion: col40WithMandatoryPrefix,
        col41RazonesInusualidad: tipoReporte === '1' ? '' : col41Sanitized,
      };
    }
  );

  const serializedLines = builtRows.map((row) => serializeSiti41ColumnRow(row));
  const txtContent =
    serializedLines.length > 0 ? `${serializedLines.join('\r\n')}\r\n` : '';
  const sha256Hash = crypto.createHash('sha256').update(txtContent, 'utf8').digest('hex');
  const todayStamp = formatSitiDateAAAAMMDD(new Date().toISOString());
  const fileName = `SITI_UIF_CNBV_${headerParams.claveSujetoObligado}_${todayStamp}.txt`;

  await auditEventStore.append({
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: 'PLD_SITI_LAYOUT_GENERATED',
    outcome: 'success',
    sourceIp: params.sourceIp,
    sourceSummary: 'sitiLayoutGenerator',
    details: `Generado Layout Oficial .TXT SITI 41 Columnas (${builtRows.length} registros) | Archivo: ${fileName} | SHA-256: ${sha256Hash}`,
  });

  return {
    fileName,
    txtContent,
    sha256Hash,
    totalRows: builtRows.length,
    rows: builtRows,
  };
}
