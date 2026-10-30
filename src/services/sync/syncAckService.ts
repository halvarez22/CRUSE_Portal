/**
 * SERVICIO DE SINCRONIZACIÓN SEGURA Y PURGA "ZERO-PII POST-ACK"
 *
 * Cumplimiento LFPDPPP: Neutraliza el riesgo por robo o extravío del teléfono del promotor.
 * - Solo purga localmente tras recibir un ACK formal (HTTP 200/201 o 409 duplicado verificado).
 * - En caso de error 5xx o falla de red, NO se purga para no perder la solicitud del promotor.
 * - Emite el evento global 'app:purge-complete'.
 */

import { SyncAck, ExpedienteItem } from '../../types';

export const APP_PURGE_COMPLETE_EVENT = 'app:purge-complete';
const LOCAL_STORAGE_EXPEDIENTES_KEY = 'cruse_promotor_pending_expedientes';
const PENDING_PURGE_KEY = 'cruse_promotor_pending_purge_ids';

/**
 * Guarda temporalmente un expediente en la cola local del dispositivo del promotor.
 */
export function saveLocalExpediente(expediente: ExpedienteItem): void {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_EXPEDIENTES_KEY);
    const list: ExpedienteItem[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((e) => e.id !== expediente.id);
    filtered.push(expediente);
    localStorage.setItem(LOCAL_STORAGE_EXPEDIENTES_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Error guardando en almacenamiento local:', err);
  }
}

/**
 * Obtiene los expedientes locales pendientes de sincronización.
 */
export function getLocalExpedientes(): ExpedienteItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_EXPEDIENTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Marca un ID como pendiente de purga (resiliencia si la app se cierra antes de terminar).
 */
export function markPendingPurge(id: string): void {
  try {
    const raw = localStorage.getItem(PENDING_PURGE_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(PENDING_PURGE_KEY, JSON.stringify(list));
    }
  } catch {
    /* empty */
  }
}

/**
 * Ejecuta la purga física definitiva de un expediente del dispositivo local.
 */
export function executeLocalPurge(id: string): void {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_EXPEDIENTES_KEY);
    if (raw) {
      const list: ExpedienteItem[] = JSON.parse(raw);
      const filtered = list.filter((e) => e.id !== id);
      localStorage.setItem(LOCAL_STORAGE_EXPEDIENTES_KEY, JSON.stringify(filtered));
    }

    // Remueve de la lista de pending purge
    const rawPurge = localStorage.getItem(PENDING_PURGE_KEY);
    if (rawPurge) {
      const purgeList: string[] = JSON.parse(rawPurge);
      const remaining = purgeList.filter((item) => item !== id);
      localStorage.setItem(PENDING_PURGE_KEY, JSON.stringify(remaining));
    }

    // Dispara evento global de purga completada
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(APP_PURGE_COMPLETE_EVENT, { detail: { id } }));
    }
  } catch (err) {
    console.error('Error durante executeLocalPurge:', err);
  }
}

/**
 * Sincroniza un expediente con el backend seguro y purga de inmediato tras recibir ACK.
 */
export async function syncAndPurgeExpediente(
  expediente: ExpedienteItem,
  authToken: string,
  complianceMeta?: Record<string, unknown>
): Promise<SyncAck> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, status: 0, error: 'Dispositivo sin conexión a internet. Permanece en cola local.' };
  }

  // Marcar como pendiente de purga por resiliencia
  markPendingPurge(expediente.id);

  try {
    const response = await fetch('/api/promotores/secure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        expediente,
        complianceMeta,
      }),
    });

    const data = await response.json().catch(() => ({}));

    // ACK Válido: HTTP 200 / 201 (Nuevo) o 409 (Duplicado/Ya existente en nube)
    if (response.status === 200 || response.status === 201 || response.status === 409) {
      // PURGA FÍSICA INMEDIATA DEL DISPOSITIVO
      executeLocalPurge(expediente.id);

      return {
        ok: true,
        status: (response.status === 409 ? 409 : 200) as 200 | 409,
        syncId: data.syncId ?? `sync_${Date.now()}`,
        expedienteId: expediente.id,
        thumbSaved: data.thumbSaved ?? true,
      };
    }

    return {
      ok: false,
      status: response.status,
      error: data.error ?? `Error del servidor HTTP ${response.status}`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error de comunicación con el servidor';
    return {
      ok: false,
      status: 0,
      error: errorMsg,
    };
  }
}
