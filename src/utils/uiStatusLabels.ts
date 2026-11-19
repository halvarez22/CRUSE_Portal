/**
 * TRADUCTOR DE ESTATUS OPERATIVOS Y FECHAS EN ESPAÑOL — CRUSE-APO-2026-073 (Guardrail 6 / A05)
 *
 * Convierte enums internos de backend a etiquetas legibles para usuarios no técnicos
 * y formatea fechas consistentemente en español (es-MX).
 */

const STATUS_LABELS: Readonly<Record<string, string>> = {
  UPLOADED_TO_CIB: 'Cargado en CIB',
  APPROVED_BY_OC: 'Aprobado por Control',
  GENERATED_PENDING_OC: 'Pendiente Aprobación Control',
  CLEARED_EDD: 'Revisión Completada (DDR)',
  CONFIRMED_BLOCKED: 'Bloqueo Definitivo',
  FALSE_POSITIVE: 'Descartado por Homonimia',
  PENDING_REVIEW: 'Pendiente de Revisión',
  PENDING_DIRECTION: 'Pendiente de Dirección',
  AUTHORIZED_BY_DIRECTION: 'Autorizado por Dirección',
  REJECTED_BY_DIRECTION: 'Rechazado por Dirección',
  STAGING_PARALLEL: 'Paralelo en Validación',
  PRODUCTION_LIVE: 'Operación Activa',
  ROLLED_BACK: 'Revertido con Respaldo',
  ACTIVE_SUSPENSION: 'Licencia Activa',
  FROZEN_EXTRAJUDICIAL: 'Cobranza Extrajudicial',
};

export function getStatusLabel(enumValue?: string | null): string {
  const key = String(enumValue ?? '').trim().toUpperCase();
  if (!key) return 'Sin estatus';
  return STATUS_LABELS[key] ?? key.replace(/_/g, ' ');
}

export function formatSpanishDate(raw?: string | Date | null): string {
  if (!raw) return '—';
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
