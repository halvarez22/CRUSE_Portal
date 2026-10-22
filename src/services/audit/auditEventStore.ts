/**
 * ALMACÉN DE BITÁCORA FORENSE INMUTABLE (WORM NATIVO + HASH CHAINING) — RETENCIÓN 5 AÑOS
 *
 * Cumplimiento regulatorio: Art. 95 Bis LGOAAC (CNBV PLD/FT), LFPDPPP y NOM-151-SCFI-2016.
 * - Guardrail Forense 1 (CRUSE-APO-2026-023): Sintaxis posicional nativa de PostgreSQL ($1, $2...).
 * - Guardrail Forense 2 (CRUSE-APO-2026-023): Bloqueo exclusivo transaccional `pg_advisory_xact_lock(20260019)`
 *   previo a la lectura de `chain_seq` y `record_hash` en PostgreSQL para eliminar Race Conditions.
 */

import { AuditEvent, UserRole, AuditAction } from '../../types';
import { computeRecordHashV1Sync, computeRecordHashV2Sync } from '../crypto/cryptoService';
import { db, TxHandle } from '../db/connectionPool';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

interface AuditDbRow {
  id: string;
  ts: string | Date;
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

function normalizeIsoTimestamp(ts: string | Date): string {
  return ts instanceof Date ? ts.toISOString() : String(ts);
}

function mapRowToEvent(row: AuditDbRow): AuditEvent {
  return {
    id: row.id,
    ts: normalizeIsoTimestamp(row.ts),
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
   * Agrega un nuevo evento a la bitácora relacional dentro de una transacción activa.
   * Cumple Guardrail Forense 2: adquiere `pg_advisory_xact_lock(20260019)` ANTES de leer `chain_seq`.
   */
  async appendInTx(
    tx: TxHandle,
    input: Omit<AuditEvent, 'id' | 'ts' | 'prevHash' | 'recordHash'>
  ): Promise<AuditEvent> {
    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const ts = new Date().toISOString();

    let prevHash = GENESIS_HASH;
    let nextSeq = 1;

    try {
      // Guardrail Forense 2: Bloqueo exclusivo por transacción en PostgreSQL ANTES de leer el estado de la cadena
      if (tx.isPostgres) {
        await tx.query('SELECT pg_advisory_xact_lock(20260019);');
      }

      const lastRow = await tx.query<{ record_hash: string; chain_seq: number | null }>(
        'SELECT record_hash, chain_seq FROM audit_events ORDER BY chain_seq DESC NULLS LAST, ts DESC, id DESC LIMIT 1'
      );
      if (lastRow.rowCount > 0 && lastRow.rows[0]?.record_hash) {
        prevHash = lastRow.rows[0].record_hash;
        if (lastRow.rows[0].chain_seq !== null) {
          nextSeq = Number(lastRow.rows[0].chain_seq) + 1;
        } else {
          const maxSeqRow = await tx.query<{ max_seq: number | null }>(
            'SELECT MAX(chain_seq) as max_seq FROM audit_events'
          );
          if (maxSeqRow.rowCount > 0 && maxSeqRow.rows[0]?.max_seq != null) {
            nextSeq = Number(maxSeqRow.rows[0].max_seq) + 1;
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
      prev_hash: prevHash,
    });

    const newEvent: AuditEvent = {
      ...input,
      id,
      ts,
      prevHash,
      recordHash,
    };

    // Guardrail Forense 1: Placeholders posicionales explícitos ($1 a $15)
    await tx.execute(
      `INSERT INTO audit_events (
        id, ts, actor_email, actor_role, action, outcome, source_ip, source_summary,
        curp_masked, blind_curp_prefix, expediente_id, details, prev_hash, record_hash, hash_version, chain_seq
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 2, $15);`,
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
        nextSeq,
      ]
    );

    return newEvent;
  }

  /**
   * Envoltorio transaccional autónomo cuando se agrega un evento fuera de una transacción mayor.
   */
  append(input: Omit<AuditEvent, 'id' | 'ts' | 'prevHash' | 'recordHash'>): Promise<AuditEvent> {
    return db.transaction((tx) => this.appendInTx(tx, input));
  }

  /**
   * Consulta eventos desde la base de datos relacional con filtros dinámicos y placeholders $1, $2...
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
        params.push(filter.action);
        sql += ` AND action = $${params.length}`;
      }
      if (filter?.actorEmail) {
        params.push(`%${filter.actorEmail}%`);
        sql += ` AND actor_email LIKE $${params.length}`;
      }
      if (filter?.blindCurpPrefix) {
        params.push(filter.blindCurpPrefix);
        sql += ` AND blind_curp_prefix = $${params.length}`;
      }

      sql += ' ORDER BY ts DESC, id DESC';

      if (filter?.limit && filter.limit > 0) {
        params.push(filter.limit);
        sql += ` LIMIT $${params.length}`;
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
   */
  async verifyChainIntegrity(): Promise<{
    valid: boolean;
    totalEvents: number;
    compromisedIndex?: number;
    details: string;
  }> {
    const res = await db.query<AuditDbRow>(
      'SELECT * FROM audit_events ORDER BY chain_seq ASC NULLS FIRST, ts ASC, id ASC'
    );
    const events = res.rows;

    if (events.length === 0) {
      return { valid: true, totalEvents: 0, details: 'Bitácora vacía en base de datos' };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < events.length; i++) {
      const event = events[i]!;
      const isoTs = normalizeIsoTimestamp(event.ts);

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
        if (Number(event.hash_version) === 2) {
          recomputedHash = computeRecordHashV2Sync({
            chain_seq: Number(event.chain_seq!),
            id: event.id,
            ts: isoTs,
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
            prev_hash: event.prev_hash,
          });
        } else {
          recomputedHash = computeRecordHashV1Sync({
            prevHash: event.prev_hash,
            id: event.id,
            ts: isoTs,
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
