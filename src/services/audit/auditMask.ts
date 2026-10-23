/**
 * UTILIDADES DE AUDITORÍA Y ENMASCARADO FORENSE — LFPDPPP & CNBV
 *
 * Enmascara datos personales sensibles y extrae metadatos de red para la bitácora inmutable.
 */

/**
 * Enmascara CURP preservando 4 caracteres iniciales y 4 finales:
 * AAGH650922HGTLTC04 → AAGH********TC04
 */
export function maskCurp(curp?: string | null): string {
  const c = String(curp ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!c) return '—';
  if (c.length < 10) return '********';
  return `${c.slice(0, 4)}${'*'.repeat(Math.max(4, c.length - 8))}${c.slice(-4)}`;
}

/**
 * Normaliza y resume el User-Agent para registro forense limpio.
 */
export function briefUserAgent(ua?: string | null): string {
  const s = String(ua ?? '').trim();
  if (!s) return 'Navegador Web';
  if (/iPhone|iPad/i.test(s)) return 'iOS Safari Móvil';
  if (/Android/i.test(s)) return 'Android PWA Móvil';
  if (/Edg\//i.test(s)) return 'Microsoft Edge';
  if (/Chrome\//i.test(s) && !/Edg\//i.test(s)) return 'Google Chrome';
  if (/Firefox\//i.test(s)) return 'Mozilla Firefox';
  if (/Safari\//i.test(s)) return 'Apple Safari';
  return s.slice(0, 32);
}

/**
 * Extrae la IP real del cliente resolviendo proxies y cabeceras CDN.
 */
export function extractClientIp(headers: Record<string, string | string[] | undefined>): string {
  const xf = headers['x-forwarded-for'];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  if (raw && raw.trim()) {
    return raw.split(',')[0]!.trim();
  }
  const real = headers['x-real-ip'];
  const r = Array.isArray(real) ? real[0] : real;
  if (r && r.trim()) return r.trim();
  return '127.0.0.1';
}

/**
 * Construye el resumen de origen "IP · Dispositivo".
 */
export function buildSourceSummary(ip: string, ua?: string | null): string {
  const parts = [ip.trim(), briefUserAgent(ua)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'origen no identificado';
}

/**
 * Traduce la acción de auditoría a una etiqueta ejecutiva para el Oficial de Cumplimiento.
 */
export function formatAuditActionLabel(action: string, curpMasked?: string): string {
  switch (action) {
    case 'LOGIN_2FA_SUCCESS':
      return 'Acceso Seguro 2FA Exitoso';
    case 'LOGIN_FAILURE':
      return 'Intento de Acceso Fallido';
    case 'LOGOUT':
      return 'Cierre de Sesión';
    case 'ACCESS_DENIED':
      return 'Acceso Denegado por Rol (RBAC)';
    case 'EXPEDIENTE_CREATE':
      return curpMasked ? `Expediente Creado (${curpMasked})` : 'Expediente Creado';
    case 'EXPEDIENTE_SYNC':
      return curpMasked ? `Sincronización Nube (${curpMasked})` : 'Sincronización Nube';
    case 'EXPEDIENTE_PURGE':
      return 'Purga Zero-PII en Dispositivo Móvil';
    case 'EXPEDIENTE_VIEW':
      return curpMasked ? `Consulta Expediente (${curpMasked})` : 'Consulta de Expediente';
    case 'LAYOUT_SIF_GENERATE':
      return 'Generación de Layout SIF / CIB';
    case 'RECONCILIATION_BATCH_SEALED':
      return 'Sello Criptográfico de Lote Quincenal (Acta)';
    case 'CREDIT_BUREAU_REPORT_GENERATED':
      return 'Reporte Oficial Círculo de Crédito (001496)';
    case 'CREDIT_BUREAU_CATALOG_UPDATED':
      return 'Actualización de Catálogo Oficial SIC';
    case 'CONFIG_CHANGE':
      return 'Cambio de Configuración Operativa';
    case 'SCREEN_VIEW':
      return 'Visualización de Pantalla';
    default:
      return action;
  }
}
