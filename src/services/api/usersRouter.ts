/**
 * ENRUTADOR DE ADMINISTRACIÓN DE USUARIOS Y RBAC 2FA SMS — SERVIDOR (CRUSE-APO-2026-028 / 030)
 * Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
 *
 * Cumplimiento:
 * - Guardrail Forense 1: Generación criptográfica de credenciales iniciales en backend y entrega
 *   de un solo uso Out-of-Band (prohibido envío por SMS/email/WhatsApp).
 * - Guardrail Forense 2: Revocación atómica ACID (`revokeAllUserSessions`) al dar de baja,
 *   cambiar rol, cambiar teléfono móvil, cambiar contraseña o reiniciar 2FA, bloqueando auto-baja (`actor.id === userId`).
 * - Guardrail Forense 3: Higiene criptográfica en `resetTotp` (regeneración de códigos de emergencia
 *   `backup_codes_hash` y revocación de sesiones).
 * - Guardrail Forense 4: Registro del diferencial `before`/`after` en `audit_events` (`USER_UPDATE`).
 */

import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import {
  listAllUsers,
  createUser,
  updateManagedUser,
  isUserRole,
  maskPhoneForAudit,
} from '../auth/userRepository';
import { auditEventStore } from '../audit/auditEventStore';
import { extractClientIp, buildSourceSummary } from '../audit/auditMask';
import { UserRole } from '../../types';

export const usersRouter = Router();

usersRouter.get('/', requireAuth('users:manage'), async (_req: Request, res: Response) => {
  try {
    const users = await listAllUsers();
    return res.json({ users });
  } catch (err: unknown) {
    console.error('Error listando usuarios:', err);
    return res.status(500).json({
      error: 'Error al consultar el catálogo de usuarios',
    });
  }
});

usersRouter.post('/', requireAuth('users:manage'), async (req: Request, res: Response) => {
  const { user: actor } = getAuth(req);
  const ip = extractClientIp(req.headers);
  const sourceSummary = buildSourceSummary(ip, req.headers['user-agent']);

  try {
    const { email, name, role, password, phoneNumber } = req.body ?? {};
    if (typeof email !== 'string' || typeof name !== 'string' || typeof role !== 'string') {
      return res.status(400).json({ error: 'Faltan campos obligatorios (nombre, correo, rol).' });
    }
    if (typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
      return res.status(400).json({
        error: 'El teléfono móvil del usuario es obligatorio para el envío de códigos SMS de doble factor (2FA).',
      });
    }
    if (!isUserRole(role)) {
      return res.status(400).json({ error: 'Rol institucional no válido.' });
    }

    const created = await createUser({
      email,
      name,
      role: role as UserRole,
      password: typeof password === 'string' && password.trim() ? password.trim() : undefined,
      phoneNumber: phoneNumber.trim(),
      mustChangePassword: true,
    });

    await auditEventStore.append({
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'USER_CREATE',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary,
      details: JSON.stringify({
        targetUserId: created.user.id,
        targetEmail: created.user.email,
        role: created.user.role,
        phoneNumberMasked: maskPhoneForAudit(created.user.phoneNumber),
        totpEnrolled: false,
        mustChangePassword: true,
      }),
    });

    return res.status(201).json({
      ok: true,
      user: created.user,
      oneTimeCredentials: {
        initialPassword: created.initialPassword,
        registeredPhone: created.user.phoneNumber,
        recoveryCodes: created.recoveryCodes,
        outOfBandNotice:
          'PROHIBIDO enviar por SMS, WhatsApp o correo electrónico. Entregar personalmente o por canal seguro fuera de banda (Out-of-Band).',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al dar de alta al usuario';
    return res.status(400).json({ error: msg });
  }
});

usersRouter.patch('/:id', requireAuth('users:manage'), async (req: Request, res: Response) => {
  const { user: actor } = getAuth(req);
  const ip = extractClientIp(req.headers);
  const sourceSummary = buildSourceSummary(ip, req.headers['user-agent']);

  try {
    const userId = String(req.params.id ?? '');
    const {
      name,
      role,
      phoneNumber,
      active,
      newPassword,
      generateTemporaryPassword,
      resetTotp,
    } = req.body ?? {};

    if (role !== undefined && (typeof role !== 'string' || !isUserRole(role))) {
      return res.status(400).json({ error: 'Rol institucional no válido.' });
    }

    const result = await updateManagedUser(
      userId,
      {
        name: typeof name === 'string' ? name : undefined,
        role: typeof role === 'string' ? (role as UserRole) : undefined,
        phoneNumber: typeof phoneNumber === 'string' ? phoneNumber : undefined,
        active: typeof active === 'boolean' ? active : undefined,
        newPassword: typeof newPassword === 'string' ? newPassword : undefined,
        generateTemporaryPassword: typeof generateTemporaryPassword === 'boolean' ? generateTemporaryPassword : undefined,
        resetTotp: typeof resetTotp === 'boolean' ? resetTotp : undefined,
      },
      actor.id
    );

    await auditEventStore.append({
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'USER_UPDATE',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary,
      details: JSON.stringify(result.auditDiff),
    });

    return res.json({
      ok: true,
      auditDiff: result.auditDiff,
      oneTimeCredentials:
        result.newRecoveryCodes || result.generatedTemporaryPassword
          ? {
              initialPassword: result.generatedTemporaryPassword,
              recoveryCodes: result.newRecoveryCodes,
              outOfBandNotice:
                'PROHIBIDO enviar por SMS, WhatsApp o correo electrónico. Entregar personalmente o por canal seguro fuera de banda (Out-of-Band).',
            }
          : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al actualizar el usuario';
    return res.status(400).json({ error: msg });
  }
});
