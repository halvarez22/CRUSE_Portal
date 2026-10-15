/**
 * MATRIZ RBAC — CRUSE-APO-2026-005 (Bloque A.3)
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
  'dashboard:read_kpis': ['admin', 'oficial_cumplimiento', 'promotor'],
  'dashboard:read': ['admin', 'oficial_cumplimiento'],
  'dashboard:read_pii': ['oficial_cumplimiento', 'admin'],
  'users:manage': ['admin'],
};

/** Permisos que solo existen fuera de producción (en producción la ruta responde 404). */
export const NON_PRODUCTION_ONLY_PERMISSIONS: ReadonlySet<RbacPermission> = new Set<RbacPermission>([
  'reconciliation:sample-data',
]);

export function isRoleAuthorized(permission: RbacPermission, role: UserRole): boolean {
  return RBAC_POLICY[permission].includes(role);
}
