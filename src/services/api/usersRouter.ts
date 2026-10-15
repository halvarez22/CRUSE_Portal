/**
 * ENRUTADOR DE ADMINISTRACIÓN DE USUARIOS Y RBAC 2FA — SERVIDOR
 * Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
 *
 * Cumplimiento:
 * - Regla 3: Modular < 300 líneas con responsabilidad única.
 * - Regla 5 (SSD): Solo accesible por rol 'admin' (requireAuth('users:manage'))
 *   con registro inmutable en bitácora forense WORM.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import {
  listAllUsers,
  createUser,
  updateManagedUser,
  isUserRole,
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
    if (
      typeof email !== 'string' ||
      typeof name !== 'string' ||
      typeof role !== 'string' ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (nombre, correo, rol, contraseña).' });
    }
    if (!isUserRole(role)) {
      return res.status(400).json({ error: 'Rol institucional no válido.' });
    }

    const created = await createUser({
      email,
      name,
      role: role as UserRole,
      password,
      phoneNumber: typeof phoneNumber === 'string' && phoneNumber.trim() ? phoneNumber.trim() : undefined,
    });

    await auditEventStore.append({
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'USER_CREATE',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary,
      details: `Alta de usuario institucional: ${created.user.email} (${created.user.role})`,
    });

    return res.status(201).json({
      ok: true,
      user: created.user,
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
    const { name, role, phoneNumber, active, newPassword } = req.body ?? {};

    if (role !== undefined && (typeof role !== 'string' || !isUserRole(role))) {
      return res.status(400).json({ error: 'Rol institucional no válido.' });
    }

    await updateManagedUser(userId, {
      name: typeof name === 'string' ? name : undefined,
      role: typeof role === 'string' ? (role as UserRole) : undefined,
      phoneNumber: typeof phoneNumber === 'string' ? phoneNumber : undefined,
      active: typeof active === 'boolean' ? active : undefined,
      newPassword: typeof newPassword === 'string' ? newPassword : undefined,
    });

    await auditEventStore.append({
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'USER_UPDATE',
      outcome: 'success',
      sourceIp: ip,
      sourceSummary,
      details: `Actualización de usuario ID ${userId} (rol/teléfono/estado)`,
    });

    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al actualizar el usuario';
    return res.status(400).json({ error: msg });
  }
});
