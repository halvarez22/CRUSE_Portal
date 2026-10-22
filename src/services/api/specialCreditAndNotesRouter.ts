/**
 * ENRUTADOR DE LÍNEA ABIERTA (CRÉDITO ESPECIAL RN-01) Y BLOCK DE NOTAS OPERATIVAS (RN-02, RN-04)
 *
 * @implements RN-01 (Movimientos de Crédito Especial Revolvente sin calendario fijo)
 * @implements RN-02, RN-04 (Block de Notas Operativas Siempre Visible en Créditos, Expedientes e Inversionistas)
 * @implements Regla 3 Anti-God-Object (< 240 líneas)
 * @implements Regla 5 SSD (Actor extraído exclusivamente de getAuth(req).user)
 * @implements Regla 6 SQA (0 any)
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db/connectionPool';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { extractClientIp, buildSourceSummary } from '../audit/auditMask';
import { auditEventStore } from '../audit/auditEventStore';
import {
  getSpecialCreditBalanceSummary,
  recordSpecialCreditMovement,
  SpecialMovementType,
  SpecialDisbursementMethod,
  SpecialCreditMovementRow,
} from '../reconciliation/specialCreditService';

export const specialCreditAndNotesRouter = Router();

type AllowedNoteEntityType = 'LOAN_ACCOUNT' | 'INVESTOR' | 'INVESTMENT' | 'EXPEDIENTE';

interface OperationalNoteRow {
  id: string;
  entity_type: AllowedNoteEntityType;
  entity_id: string;
  note_content: string;
  is_pinned: 0 | 1;
  author_email: string;
  created_at: string;
}

const VALID_ENTITY_TYPES: ReadonlySet<AllowedNoteEntityType> = new Set([
  'LOAN_ACCOUNT',
  'INVESTOR',
  'INVESTMENT',
  'EXPEDIENTE',
]);

const VALID_MOVEMENT_TYPES: ReadonlySet<SpecialMovementType> = new Set([
  'DISPOSICION',
  'ABONO',
  'CARGO_INTERES',
]);

/**
 * GET /api/special-credit/:loanAccountId/summary
 * Consulta el saldo vivo determinista y los movimientos de un Crédito Especial (RN-01).
 */
specialCreditAndNotesRouter.get(
  '/special-credit/:loanAccountId/summary',
  requireAuth('special_credit:manage'),
  async (req: Request, res: Response) => {
    try {
      const loanAccountId = String(req.params.loanAccountId ?? '').trim();
      const summary = getSpecialCreditBalanceSummary(loanAccountId);
      const movRes = await db.query<SpecialCreditMovementRow>(
        `SELECT * FROM special_credit_movements WHERE loan_account_id = ? ORDER BY created_at DESC, id DESC`,
        [loanAccountId]
      );
      return res.json({ ok: true, summary, movements: movRes.rows });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error consultando Crédito Especial';
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * POST /api/special-credit/:loanAccountId/movements
 * Registra atómicamente una disposición, cargo de interés o abono en un Crédito Especial (RN-01).
 */
specialCreditAndNotesRouter.post(
  '/special-credit/:loanAccountId/movements',
  requireAuth('special_credit:manage'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const sourceIp = extractClientIp(req.headers);
      const loanAccountId = String(req.params.loanAccountId ?? '').trim();
      const { movementDate, movementType, amount, disbursementMethod, referenceNumber } = req.body;

      if (!movementDate || !VALID_MOVEMENT_TYPES.has(movementType as SpecialMovementType)) {
        return res.status(400).json({
          error: 'Se requiere movementDate y movementType válido (DISPOSICION | ABONO | CARGO_INTERES).',
        });
      }

      const movement = recordSpecialCreditMovement({
        loanAccountId,
        movementDate: String(movementDate),
        movementType: movementType as SpecialMovementType,
        amount: Number(amount),
        disbursementMethod: (disbursementMethod as SpecialDisbursementMethod | undefined) ?? null,
        referenceNumber: referenceNumber ? String(referenceNumber) : null,
        actorEmail: user.email,
        actorRole: user.role,
        sourceIp,
      });

      const summary = getSpecialCreditBalanceSummary(loanAccountId);
      return res.json({ ok: true, movement, summary });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error registrando movimiento de Crédito Especial';
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * GET /api/notes/:entityType/:entityId
 * Obtiene el Block de Notas Operativas siempre visible (RN-02 y RN-04).
 */
specialCreditAndNotesRouter.get(
  '/notes/:entityType/:entityId',
  requireAuth('notes:manage'),
  async (req: Request, res: Response) => {
    try {
      const rawType = String(req.params.entityType ?? '').toUpperCase() as AllowedNoteEntityType;
      const entityId = String(req.params.entityId ?? '').trim();

      if (!VALID_ENTITY_TYPES.has(rawType) || !entityId) {
        return res.status(400).json({ error: 'entityType o entityId inválido.' });
      }

      const notesRes = await db.query<OperationalNoteRow>(
        `SELECT id, entity_type, entity_id, note_content, is_pinned, author_email, created_at
         FROM operational_notes
         WHERE entity_type = ? AND entity_id = ?
         ORDER BY is_pinned DESC, created_at DESC`,
        [rawType, entityId]
      );

      return res.json({ ok: true, notes: notesRes.rows });
    } catch {
      return res.status(500).json({ error: 'Error consultando notas operativas' });
    }
  }
);

/**
 * POST /api/notes
 * Crea una nueva nota operativa fijable (is_pinned = 1 | 0) con rastro forense WORM.
 * El autor se extrae exclusivamente de getAuth(req).user.email (Regla A.3).
 */
specialCreditAndNotesRouter.post(
  '/notes',
  requireAuth('notes:manage'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const sourceIp = extractClientIp(req.headers);
      const sourceSummary = buildSourceSummary(sourceIp, req.headers['user-agent']);
      const { entityType, entityId, noteContent, isPinned } = req.body;

      const normalizedType = String(entityType ?? '').toUpperCase() as AllowedNoteEntityType;
      const trimmedEntityId = String(entityId ?? '').trim();
      const trimmedContent = String(noteContent ?? '').trim();

      if (!VALID_ENTITY_TYPES.has(normalizedType) || !trimmedEntityId || trimmedContent.length < 3) {
        return res.status(400).json({
          error: 'Se requiere entityType válido, entityId y noteContent de al menos 3 caracteres.',
        });
      }

      const noteId = `note_${crypto.randomUUID()}`;
      const createdAt = new Date().toISOString();
      const pinnedFlag: 0 | 1 = isPinned === false || isPinned === 0 ? 0 : 1;

      db.transaction((tx) => {
        tx.execute(
          `INSERT INTO operational_notes (id, entity_type, entity_id, note_content, is_pinned, author_email, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [noteId, normalizedType, trimmedEntityId, trimmedContent, pinnedFlag, user.email, createdAt]
        );

        auditEventStore.appendInTx(tx, {
          action: 'EXPEDIENTE_VIEW',
          actorEmail: user.email,
          actorRole: user.role,
          outcome: 'success',
          sourceIp,
          sourceSummary,
          expedienteId: normalizedType === 'EXPEDIENTE' ? trimmedEntityId : undefined,
          details: JSON.stringify({
            event: 'OPERATIONAL_NOTE_CREATED',
            note_id: noteId,
            entity_type: normalizedType,
            entity_id: trimmedEntityId,
            is_pinned: pinnedFlag,
          }),
        });
      });

      return res.json({
        ok: true,
        note: {
          id: noteId,
          entity_type: normalizedType,
          entity_id: trimmedEntityId,
          note_content: trimmedContent,
          is_pinned: pinnedFlag,
          author_email: user.email,
          created_at: createdAt,
        },
      });
    } catch {
      return res.status(500).json({ error: 'Error al guardar nota operativa' });
    }
  }
);
