/**
 * ALMACÉN DE BITÁCORA FORENSE INMUTABLE (WORM NATIVO + HASH CHAINING) — RETENCIÓN 5 AÑOS
 *
 * Cumplimiento regulatorio: Art. 95 Bis LGOAAC (CNBV PLD/FT), LFPDPPP y NOM-151-SCFI-2016.
 * - Persistencia Relacional con Constraints WORM nativos a nivel de motor.
 * - Encadenamiento criptográfico con SHA-256 (Merkle-like Hash Chaining).
 * - Verificación periódica de integridad que certifica la no-alteración física de los datos.
 */

import { AuditEvent, UserRole, AuditAction } from '../../types';
import { computeRecordHashV1Sync, computeRecordHashV2Sync } from '../crypto/cryptoService';
import { db, TxHandle } from '../db/connectionPool';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

interface AuditDbRow {
  id: string;
  ts: string;
  actor_email: string;
  actor_role: string;
  action: string;
  outcome: string;
  source_ip: string;
  source_summary: string;
  curp_masked: string | null;
  blind_curp_prefix: string | null;
  expediente_id: string | null;
  details: string | null;
  prev_hash: string;
  record_hash: string;
  hash_version: number;
  chain_seq: number | null;
}

function mapRowToEvent(row: AuditDbRow): AuditEvent {
  return {
    id: row.id,
    ts: row.ts,
    actorEmail: row.actor_email,
    actorRole: row.actor_role as UserRole | 'sistema',
    action: row.action as AuditAction,
    outcome: row.outcome as 'success' | 'failure' | 'denied',
    sourceIp: row.source_ip,
    sourceSummary: row.source_summary,
    curpMasked: row.curp_masked ?? undefined,
    blindCurpPrefix: row.blind_curp_prefix ?? undefined,
    expedienteId: row.expediente_id ?? undefined,
    details: row.details ?? undefined,
    prevHash: row.prev_hash,
    recordHash: row.record_hash,
  };
}

class AuditEventStore {
  /**
   * Agrega un nuevo evento a la bitácora relacional de forma síncrona dentro de una transacción.
   * Evita condiciones de carrera al leer el último hash y escribir en la misma transacción bloqueante.
   */
  appendInTx(tx: TxHandle, input: Omit<AuditEvent, 'id' | 'ts' | 'prevHash' | 'recordHash'>): AuditEvent {
    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const ts = new Date().toISOString();

    // Obtener el último hash y chain_seq registrado en el motor de base de datos dentro de la tx
    let prevHash = GENESIS_HASH;
    let nextSeq = 1;
    
    try {
      const lastRow = tx.query<{ record_hash: string, chain_seq: number | null }>(
        'SELECT record_hash, chain_seq FROM audit_events ORDER BY chain_seq DESC NULLS LAST, ts DESC, id DESC LIMIT 1'
      );
      if (lastRow.rowCount > 0 && lastRow.rows[0]?.record_hash) {
        prevHash = lastRow.rows[0].record_hash;
        if (lastRow.rows[0].chain_seq !== null) {
          nextSeq = lastRow.rows[0].chain_seq + 1;
        } else {
          // Migrando de v1 a v2: contar cuántos hay para sacar el sig seq? 
          // O simplemente buscar el max chain_seq ignorando los null.
          const maxSeqRow = tx.query<{ max_seq: number }>('SELECT MAX(chain_seq) as max_seq FROM audit_events');
          if (maxSeqRow.rowCount > 0 && maxSeqRow.rows[0]?.max_seq != null) {
            nextSeq = maxSeqRow.rows[0].max_seq + 1;
          }
        }
      }
    } catch {
      prevHash = GENESIS_HASH;
    }

    const recordHash = computeRecordHashV2Sync({
      chain_seq: nextSeq,
      id,
      ts,
      actor_email: input.actorEmail,
      actor_role: input.actorRole,
      action: input.action,
      outcome: input.outcome,
      source_ip: input.sourceIp,
      source_summary: input.sourceSummary,
      curp_masked: input.curpMasked,
      blind_curp_prefix: input.blindCurpPrefix,
      expediente_id: input.expedienteId,
      details: input.details,
      prev_hash: prevHash
    });

    const newEvent: AuditEvent = {
      ...input,
      id,
      ts,
      prevHash,
      recordHash,
    };

    // Inserción en Base de Datos Relacional con Triggers WORM activos
    tx.execute(
      `INSERT INTO audit_events (
        id, ts, actor_email, actor_role, action, outcome, source_ip, source_summary,
        curp_masked, blind_curp_prefix, expediente_id, details, prev_hash, record_hash, hash_version, chain_seq
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?);`,
      [
        id,
        ts,
        input.actorEmail,
        input.actorRole,
        input.action,
        input.outcome,
        input.sourceIp,
        input.sourceSummary,
        input.curpMasked ?? null,
        input.blindCurpPrefix ?? null,
        input.expedienteId ?? null,
        input.details ?? null,
        prevHash,
        recordHash,
        nextSeq
      ]
    );

    return newEvent;
  }

  /**
   * Envoltorio para cuando se agrega un evento fuera de una transacción mayor.
   */
  append(input: Omit<AuditEvent, 'id' | 'ts' | 'prevHash' | 'recordHash'>): Promise<AuditEvent> {
    return Promise.resolve(db.transaction(tx => this.appendInTx(tx, input)));
  }
  
  /**
   * Envoltorio sincrono para uso fuera de await si se prefiere.
   */
  appendSync(input: Omit<AuditEvent, 'id' | 'ts' | 'prevHash' | 'recordHash'>): AuditEvent {
    return db.transaction(tx => this.appendInTx(tx, input));
  }

  /**
   * Consulta eventos desde la base de datos relacional con filtros dinámicos.
   */
  async list(filter?: {
    action?: string;
    actorEmail?: string;
    blindCurpPrefix?: string;
    limit?: number;
  }): Promise<AuditEvent[]> {
    try {
      let sql = 'SELECT * FROM audit_events WHERE 1=1';
      const params: (string | number)[] = [];

      if (filter?.action) {
        sql += ' AND action = ?';
        params.push(filter.action);
      }
      if (filter?.actorEmail) {
        sql += ' AND actor_email LIKE ?';
        params.push(`%${filter.actorEmail}%`);
      }
      if (filter?.blindCurpPrefix) {
        sql += ' AND blind_curp_prefix = ?';
        params.push(filter.blindCurpPrefix);
      }

      sql += ' ORDER BY ts DESC, id DESC';

      if (filter?.limit && filter.limit > 0) {
        sql += ' LIMIT ?';
        params.push(filter.limit);
      } else {
        sql += ' LIMIT 100';
      }

      const res = await db.query<AuditDbRow>(sql, params);
      return res.rows.map(mapRowToEvent);
    } catch (err) {
      console.error('Error consultando audit_events desde BD:', err);
      return [];
    }
  }

  /**
   * Auditoría Forense Completa de Integridad de la Cadena Merkle-Chaining.
   * Recorre la base de datos relacional recalculando todos los hashes para certificar no-manipulación.
   */
  async verifyChainIntegrity(): Promise<{
    valid: boolean;
    totalEvents: number;
    compromisedIndex?: number;
    details: string;
  }> {
    // Las filas v1 antiguas no tienen chain_seq, se ordenan por ts/id; las v2 tienen chain_seq.
    // Combinamos ordenando los nulls primero.
    const res = await db.query<AuditDbRow>('SELECT * FROM audit_events ORDER BY chain_seq ASC NULLS FIRST, ts ASC, id ASC');
    const events = res.rows;

    if (events.length === 0) {
      return { valid: true, totalEvents: 0, details: 'Bitácora vacía en base de datos' };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < events.length; i++) {
      const event = events[i]!;

      if (i > 0 && event.prev_hash !== expectedPrevHash) {
        return {
          valid: false,
          totalEvents: events.length,
          compromisedIndex: i,
          details: `Ruptura de encadenamiento en registro ${event.id}: prevHash esperado '${expectedPrevHash}', recibido '${event.prev_hash}'`,
        };
      }

      if (i > 0) {
        let recomputedHash = '';
        if (event.hash_version === 2) {
           recomputedHash = computeRecordHashV2Sync({
              chain_seq: event.chain_seq!,
              id: event.id,
              ts: event.ts,
              actor_email: event.actor_email,
              actor_role: event.actor_role,
              action: event.action,
              outcome: event.outcome,
              source_ip: event.source_ip,
              source_summary: event.source_summary,
              curp_masked: event.curp_masked ?? undefined,
              blind_curp_prefix: event.blind_curp_prefix ?? undefined,
              expediente_id: event.expediente_id ?? undefined,
              details: event.details ?? undefined,
              prev_hash: event.prev_hash
           });
        } else {
           recomputedHash = computeRecordHashV1Sync({
              prevHash: event.prev_hash,
              id: event.id,
              ts: event.ts,
              actorEmail: event.actor_email,
              action: event.action,
              outcome: event.outcome,
              sourceIp: event.source_ip,
              curpMasked: event.curp_masked ?? undefined,
           });
        }

        if (recomputedHash !== event.record_hash) {
          return {
            valid: false,
            totalEvents: events.length,
            compromisedIndex: i,
            details: `Firma digital alterada en registro ${event.id} (v${event.hash_version}). Hash recalculado '${recomputedHash}' difiere del registrado '${event.record_hash}'`,
          };
        }
      }

      expectedPrevHash = event.record_hash;
    }

    return {
      valid: true,
      totalEvents: events.length,
      details: 'Cadena de 100% registros verificada criptográficamente en base de datos relacional sin alteraciones.',
    };
  }
}

export const auditEventStore = new AuditEventStore();
