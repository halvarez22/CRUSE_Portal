/**
 * HOOK DE DRENAJE RESILIENTE DE PURGA AL ARRANQUE (useDrainPendingPurge)
 *
 * Se ejecuta al iniciar la aplicación o el módulo de promotores:
 * Escanea registros huérfanos con bandera 'pending_purge' y los purga físicamente,
 * garantizando cero retención de PII en caso de apagado súbito del teléfono durante la sincronización.
 */

import { useEffect, useRef } from 'react';
import { executeLocalPurge } from '../services/sync/syncAckService';

export function useDrainPendingPurge(): void {
  const hasDrained = useRef(false);

  useEffect(() => {
    if (hasDrained.current) return;
    hasDrained.current = true;

    try {
      const raw = localStorage.getItem('cruse_promotor_pending_purge_ids');
      if (!raw) return;

      const ids: string[] = JSON.parse(raw);
      if (Array.isArray(ids) && ids.length > 0) {
        console.info(`[Zero-PII Drain] Drenando ${ids.length} registros huérfanos pendientes de purga...`);
        for (const id of ids) {
          executeLocalPurge(id);
        }
      }
    } catch (err) {
      console.warn('[Zero-PII Drain] Error en drenaje al arranque:', err);
    }
  }, []);
}
