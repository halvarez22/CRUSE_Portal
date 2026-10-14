/**
 * PERFILES DE DESARROLLO PARA `npm run seed:dev` — CRUSE-APO-2026-005 (Bloque A.2)
 *
 * Solo identidades ficticias (dominio reservado .local). NO contiene contraseñas ni secretos:
 * las credenciales se generan aleatoriamente en cada alta y se muestran una única vez en la terminal.
 */

import { UserRole } from '../types';

export interface DevSeedProfile {
  email: string;
  name: string;
  role: UserRole;
}

export const DEV_SEED_PROFILES: readonly DevSeedProfile[] = [
  { email: 'admin.dev@cruse.local', name: 'Dirección General (Desarrollo)', role: 'admin' },
  { email: 'oficial.dev@cruse.local', name: 'Oficial de Cumplimiento (Desarrollo)', role: 'oficial_cumplimiento' },
  { email: 'promotor.dev@cruse.local', name: 'Promotor de Campo (Desarrollo)', role: 'promotor' },
];
