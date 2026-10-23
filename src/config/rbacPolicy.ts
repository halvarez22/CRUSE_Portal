/**
 * MATRIZ RBAC — CRUSE-APO-2026-005 (Bloque A.3) y CRUSE-APO-2026-021 (Servicios 3FN v4)
 *
 * Única fuente de verdad de autorización por rol (Regla 2 HRU). Ningún router decide
 * permisos por su cuenta: todos usan requireAuth(permission) con estas entradas.
 */

import { RbacPermission, UserRole } from '../types';

export const RBAC_POLICY: Readonly<Record<RbacPermission, readonly UserRole[]>> = {
  'expedientes:create': ['promotor', 'admin'],
  'expedientes:list': ['admin', 'oficial_cumplimiento'],
  'expedientes:activate': ['admin'],
  'audit:read': ['admin', 'oficial_cumplimiento'],
  'reconciliation:process': ['oficial_cumplimiento', 'admin'],
  'reconciliation:read': ['admin', 'oficial_cumplimiento'],
  'reconciliation:sample-data': ['admin', 'oficial_cumplimiento'],
  'reconciliation:manual-override': ['admin', 'oficial_cumplimiento'],
  'special_credit:manage': ['admin', 'oficial_cumplimiento'],
  'notes:manage': ['admin', 'oficial_cumplimiento'],
  'funding:read': ['admin', 'oficial_cumplimiento'],
  'funding:manage': ['admin'],
  'dashboard:read_kpis': ['admin', 'oficial_cumplimiento', 'promotor'],
  'dashboard:read': ['admin', 'oficial_cumplimiento'],
  'dashboard:read_pii': ['oficial_cumplimiento', 'admin'],
  'users:manage': ['admin'],
  'credit_bureau:read': ['admin', 'oficial_cumplimiento'],
  'credit_bureau:generate': ['admin', 'oficial_cumplimiento'],
  'credit_bureau:catalogs_manage': ['admin'],
  'collections:read': ['admin', 'oficial_cumplimiento'],
  'collections:manage': ['admin', 'oficial_cumplimiento'],
  'restructures:execute': ['admin', 'oficial_cumplimiento'],
  'pld:read': ['admin', 'oficial_cumplimiento'],
  'pld:screen': ['admin', 'oficial_cumplimiento'],
  'pld:manage_lists': ['admin', 'oficial_cumplimiento'],
  'pld:resolve_alert': ['admin', 'oficial_cumplimiento'],
  'executive:read': ['admin', 'oficial_cumplimiento', 'promotor'],
  'executive:scoring': ['admin', 'oficial_cumplimiento'],
  'executive:competitors_manage': ['admin', 'oficial_cumplimiento'],
  'executive:internal_ai': ['admin', 'oficial_cumplimiento'],
};

/** Permisos que solo existen fuera de producción (en producción la ruta responde 404). */
export const NON_PRODUCTION_ONLY_PERMISSIONS: ReadonlySet<RbacPermission> = new Set<RbacPermission>([
  'reconciliation:sample-data',
]);

export function isRoleAuthorized(permission: RbacPermission, role: UserRole): boolean {
  return RBAC_POLICY[permission].includes(role);
}
