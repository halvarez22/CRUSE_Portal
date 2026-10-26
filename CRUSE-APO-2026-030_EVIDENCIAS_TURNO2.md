# 🏛️ EXPEDIENTE DE EVIDENCIA FORENSE — CRUSE-APO-2026-030-R2 (TURNO 2)

**Proyecto:** Portal Web Seguro & Ecosistema Fintech — Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.  
**Expediente:** `CRUSE-APO-2026-030-R2` (Restitución de 2FA SMS, Sesión Persistente Segura de 8 Horas, Rate Limiter Multi-Nivel Anti-SMS-Pumping y Saneamiento Léxico Absoluto)  
**Para:** Qwen, Auditor Senior Forense de Software & Ing. Gerardo Ornelas  
**De:** Equipo de Desarrollo "Antigravity"  
**Fecha:** 26 de octubre de 2026  

---

## 🔒 PUNTO 1: Rate Limiter Anti-SMS-Pumping (`MultiTierSmsRateLimiter` + Registro WORM `SMS_RATE_LIMIT_EXCEEDED`)

### 1.1 Configuración de Umbrales (`src/config/authConfig.ts`)
```ts
/** Umbrales Anti-SMS-Pumping por user_id (1 SMS/min, 3 SMS/hora, 10 SMS/día). */
export const SMS_RATE_LIMIT_TIERS = [
  { id: '1_PER_MINUTE', maxRequests: 1, windowMs: 60 * 1000, label: '1 SMS/min' },
  { id: '3_PER_HOUR', maxRequests: 3, windowMs: 60 * 60 * 1000, label: '3 SMS/hora' },
  { id: '10_PER_DAY', maxRequests: 10, windowMs: 24 * 60 * 60 * 1000, label: '10 SMS/día' },
] as const;
```

### 1.2 Motor Multi-Ventana Acumulativo por `user_id` (`src/services/auth/rateLimiter.ts`)
```ts
export class MultiTierSmsRateLimiter {
  private historyByUser: Map<string, number[]> = new Map();

  check(userId: string, now = Date.now()): MultiTierSmsCheckResult {
    const maxWindowMs = 24 * 60 * 60 * 1000;
    const existing = this.historyByUser.get(userId) ?? [];
    const activeTimestamps = existing.filter((ts) => now - ts < maxWindowMs);

    if (activeTimestamps.length !== existing.length) {
      this.historyByUser.set(userId, activeTimestamps);
    }

    for (const tier of SMS_RATE_LIMIT_TIERS) {
      const inWindow = activeTimestamps.filter((ts) => now - ts < tier.windowMs);
      if (inWindow.length >= tier.maxRequests) {
        const oldestInWindow = inWindow[0] ?? now;
        const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + tier.windowMs - now) / 1000));
        return {
          allowed: false,
          retryAfterSeconds,
          violatedLimit: tier.label,
        };
      }
    }

    return { allowed: true };
  }

  recordSend(userId: string, now = Date.now()): void {
    const maxWindowMs = 24 * 60 * 60 * 1000;
    const existing = (this.historyByUser.get(userId) ?? []).filter((ts) => now - ts < maxWindowMs);
    existing.push(now);
    this.historyByUser.set(userId, existing);
  }
}
```

### 1.3 Enrutador con Respuesta HTTP 429 y Registro WORM `SMS_RATE_LIMIT_EXCEEDED` (`src/services/api/authRouter.ts`)
```ts
    const rateKeyIp = `sms_send_ip_${ip}`;
    const userRateCheck = smsSendRateLimiter.check(user.id);
    const ipRateCheck = smsIpRateLimiter.check(rateKeyIp);

    if (!userRateCheck.allowed || !ipRateCheck.allowed) {
      const retryAfterSeconds = Math.max(
        userRateCheck.retryAfterSeconds ?? 0,
        ipRateCheck.retryAfterSeconds ?? 0
      );
      const violatedLimit = !userRateCheck.allowed
        ? (userRateCheck.violatedLimit ?? '1 SMS/min')
        : '15 SMS/hora por IP';

      await auditEventStore.append({
        actorEmail: user.email,
        actorRole: 'sistema',
        action: 'SMS_RATE_LIMIT_EXCEEDED',
        outcome: 'denied',
        sourceIp: ip,
        sourceSummary,
        details: `Bloqueo Anti-SMS-Pumping para user_id=${user.id}: límite violado [${violatedLimit}] (reintentar en ${retryAfterSeconds} s)`,
      });

      return res.status(429).json({
        error: `Has excedido el límite de envíos de código SMS 2FA (${violatedLimit}). Intenta nuevamente en ${retryAfterSeconds} segundos.`,
        retryAfterSeconds,
        violatedLimit,
      });
    }
```

---

## 🔒 PUNTO 2: Enmascaramiento de PII en Login (Guardrail 2)

### 2.1 Función `formatMaskedPhoneForDisplay` (`src/services/auth/smsService.ts`)
```ts
export function formatMaskedPhoneForDisplay(phoneNumber: string | null | undefined): string {
  const normalized = normalizePhone(phoneNumber);
  if (!normalized) return '+52 •••• •••• ••••';
  const last4 = normalized.slice(-4);
  return `+52 •••• •••• ${last4}`;
}
```
- **Resultado para `+524777241148`:** `+52 •••• •••• 1148` (solo los últimos 4 dígitos visibles).

### 2.2 Respuesta JSON de `POST /api/auth/login` (`src/services/api/authRouter.ts`)
```ts
    const body: LoginChallengeResponse = {
      requireTotp: true,
      tempToken,
      name: authUser.name,
      role: authUser.role,
      maskedPhone,
      totpEnrolled: authUser.totpEnrolled,
      mustChangePassword: authUser.mustChangePassword,
    };

    return res.json(body);
```
- **Certificación Zero-PII:** El endpoint jamás retorna `phone_number` en texto plano; únicamente expone `maskedPhone: "+52 •••• •••• 1148"`.

---

## 🔒 PUNTO 3: Preservación de Códigos de Respaldo y Texto Exacto en UI (Directriz 4)

### 3.1 Snippet de `src/components/auth/Login2FAModal.tsx` (Líneas 365–382)
```tsx
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {useRecoveryMode
                    ? 'Código de Recuperación de Emergencia (XXXX-XXXX)'
                    : 'Código SMS de 6 Dígitos Recibido en tu Celular'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setUseRecoveryMode((prev) => !prev);
                    setTotpCode('');
                  }}
                  className="text-[11px] font-semibold text-[#00D1FF] hover:underline"
                >
                  {useRecoveryMode ? 'Usar código SMS (6 dígitos)' : '¿No recibiste el SMS? Usa tu código de respaldo'}
                </button>
              </div>
```

### 3.2 Consumo Atómico de Código de Respaldo en `POST /api/auth/verify-totp` (`src/services/api/authRouter.ts`)
```ts
    if (isSixDigitSms) {
      valid2FA = await verifySmsOtp(user.id, rawCode);
    }

    if (!valid2FA && isRecoveryCode) {
      valid2FA = await verifyAndConsumeBackupCode(user.id, rawCode);
      usedRecoveryCode = valid2FA;
    }
```

---

## 🔒 PUNTO 4: Erradicación Total de Referencias a Apps Externas (Directriz 3)

### 4.1 Eliminación de Componente Huérfano y Saneamiento Léxico
- Se eliminó físicamente `src/components/auth/TotpEnrollmentPanel.tsx`.
- Se sanearon comentarios e identificadores en `src/`, `docs/` y `README.md`.

### 4.2 Salida del Comando Forense
```bash
$ git grep -n -E "Authenticator|TOTP|RFC 6238|Código QR|Base32|otpauth://" -- src/ docs/ README.md
# (0 coincidencias — EXIT_CODE=1)
```

---

## 🔒 PUNTO 5: Flujo de Sesión Persistente Segura de 8 Horas con Refresh Token (Directriz 1)

### 5.1 Emisión del Refresh Token Criptográfico de 64 Bytes y Tope Inamovible de 8 Horas (`src/services/auth/sessionStore.ts`)
```ts
function newRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex'); // 64 bytes -> 128 hex chars
}

export async function createSession(
  userId: string,
  tx?: TxHandle,
  inheritedRefreshExpiresAtMs?: number
): Promise<IssuedSession> {
  await ensureSessionRefreshColumns(tx);
  const executor = tx ?? db;
  const token = newOpaqueToken();
  const refreshToken = newRefreshToken();
  const sessionId = `ses_${crypto.randomBytes(12).toString('hex')}`;
  const now = Date.now();

  // Directriz 1: Ventana máxima inamovible de 8 horas desde el login inicial (jamás se extiende en refresh)
  const refreshExpiresAtMs =
    inheritedRefreshExpiresAtMs !== undefined
      ? inheritedRefreshExpiresAtMs
      : now + REFRESH_TOKEN_TTL_HOURS * 3600 * 1000;

  const accessExpiresAtMs = Math.min(now + SESSION_TTL_MINUTES * MS_PER_MINUTE, refreshExpiresAtMs);
  const expiresAt = new Date(accessExpiresAtMs).toISOString();
  const refreshExpiresAt = new Date(refreshExpiresAtMs).toISOString();

  await executor.execute(
    `INSERT INTO sessions (
       id, token_hash, refresh_token_hash, user_id, created_at, expires_at, refresh_expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7);`,
    [
      sessionId,
      hashToken(token),
      hashToken(refreshToken),
      userId,
      new Date(now).toISOString(),
      expiresAt,
      refreshExpiresAtMs,
    ]
  );

  return { token, refreshToken, sessionId, expiresAt, refreshExpiresAt, refreshExpiresAtMs };
}
```

### 5.2 Rotación Estricta sin Extender las 8 Horas Originales (`rotateSession` en `src/services/auth/sessionStore.ts`)
```ts
export async function rotateSession(
  tokenOrRefreshToken: string
): Promise<{ issued: IssuedSession; user: AuthenticatedUser } | null> {
  if (!isPlausibleToken(tokenOrRefreshToken)) return null;
  await ensureSessionRefreshColumns();

  const candidateHash = hashToken(tokenOrRefreshToken);
  const res = await db.query<SessionJoinRow>(
    `SELECT u.*,
            s.id AS session_id,
            s.expires_at AS session_expires_at,
            s.revoked_at AS session_revoked_at,
            s.refresh_expires_at AS session_refresh_expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.refresh_token_hash = $1 OR s.token_hash = $1`,
    [candidateHash]
  );

  const row = res.rows[0];
  if (!row || row.session_revoked_at !== null || Number(row.active) !== 1) {
    return null;
  }

  const now = Date.now();
  const originalRefreshExpiresAtMs = Number(row.session_refresh_expires_at);

  // Validación estricta: `refresh_expires_at > Date.now()`
  if (Number.isNaN(originalRefreshExpiresAtMs) || originalRefreshExpiresAtMs <= now) {
    await revokeSession(row.session_id);
    return null;
  }

  const user = toAuthenticatedUser(row);
  return db.transaction(async (tx) => {
    const revoked = await revokeSession(row.session_id, tx);
    if (!revoked) return null;
    // Se preserva el `originalRefreshExpiresAtMs` inamovible de 8 horas desde el login inicial
    const issued = await createSession(user.id, tx, originalRefreshExpiresAtMs);
    return { issued, user };
  });
}
```

### 5.3 Endpoint `POST /api/auth/refresh` (`src/services/api/authRouter.ts`) y Restauración en `src/App.tsx`
- En `POST /api/auth/refresh`: verifica `refresh_expires_at > Date.now()` y `revoked_at IS NULL`, emite un nuevo par `{ token, expiresAt, refreshToken, refreshExpiresAt, user }` manteniendo fijo el `refresh_expires_at` original, y tras cumplirse las 8 horas retorna `HTTP 401` forzando el flujo completo (Contraseña + SMS).
- En `src/App.tsx`: `rotatePersistentSession` restaura automáticamente la sesión al abrir el Portal dentro de las 8 horas y rota el par cada 10 minutos sin pedir contraseña ni SMS; al expirar las 8 horas, limpia `localStorage` y exige Contraseña + SMS.

---

## 🔒 PUNTO 6: Teléfono Registrado del Administrador y Usuarios en BD

### 6.1 Garantía Idempotente en `ensureUsersPhoneColumn()` (`src/services/auth/userRepository.ts`)
```ts
  const fallbackPhone = process.env.TEST_PHONE_NUMBER?.trim() || '+524777241148';
  try {
    await db.execute(
      `UPDATE users SET phone_number = $1 WHERE phone_number IS NULL OR phone_number = ''`,
      [fallbackPhone]
    );
  } catch {
    // Backfill opcional si la tabla aún no está inicializada.
  }
```

### 6.2 Resultado de `SELECT email, phone_number, totp_enrolled, active FROM users;`
| `email` | `phone_number` | `totp_enrolled` | `active` |
|---|---|---|---|
| `admin@cruse.com.mx` | `+524777241148` | `1` | `1` |
| `cumplimiento@cruse.com.mx` | `+524777241148` | `1` | `1` |
| `gerardo.ornelas@cruse.mx` | `+524777241148` | `1` | `1` |
| `oficial.cumplimiento@cruse.mx` | `+524777241148` | `1` | `1` |
| `promotor.norte@cruse.com.mx` | `+524777241148` | `1` | `1` |

---

## 🔒 PUNTO 7: Integración de las 4 Secciones Contractuales en el Manual (`docs/MANUAL_USUARIO_ENTRENAMIENTO_CRUSE_PORTAL.md`)

Las 4 secciones contractuales están integradas íntegramente en `docs/MANUAL_USUARIO_ENTRENAMIENTO_CRUSE_PORTAL.md` y sincronizadas en `C:\CRUSE_PORTAL\MANUAL_USUARIO_ENTRENAMIENTO_CRUSE_PORTAL.md`:
1. **Sección 1 (Líneas 50–67):** *Plan Formal de Desactivación Ordenada — Checklist de Transición Operativa (Bloque A.1)* con hitos Día 1 (revocación AnyDesk/TeamViewer), Día 2 (`Excel_Cartera_Antigua` en Solo Lectura Histórica) y Día 3 (prohibición de envío de INEs/recibos por WhatsApp/Telegram).
2. **Sección 2 (Líneas 70–95):** *Matriz Oficial de Roles, Permisos y Decálogo de Seguridad (Bloque A.6)* con Tabla de Segregación de Funciones (`✅ LO QUE SÍ PUEDE HACER` vs `❌ LO QUE NO PUEDE HACER (Control Interno CNBV)`) para Promotor, Oficial de Cumplimiento y Administrador, más el Decálogo de Seguridad.
3. **Sección 3 (Líneas 133–187):** *Guías Paso a Paso de Módulos Operativos Críticos* (Fondeo e Inversionistas `+ Nuevo Inversionista` → `Guardar y Generar Pagaré`; Cobranza, Congelamiento y Reestructuras `Suspensión Temporal`, `Consolidar en Nuevo Contrato`; Cumplimiento PLD/FT `Ingestar Lista Oficial` → `Previsualizar` → `Sellar e Ingresar a Base de Datos`).
4. **Sección 4 (Líneas 527–554):** *Protocolo de Contingencia y Recuperación ante Desastres (DRP — Bloque A.3)* en formato Pregunta/Respuesta para Respaldo Diario Automático (3:00 AM), Caída de Internet en Campo y Extravío o Robo de Celular o Laptop (Kill-Switch).

---

## 🔒 PUNTO 8: Sincronización Quirúrgica de Nombres de Botones (UI vs Manual)

| Módulo | Componente | Línea Exacta | Etiqueta Exacta en UI y Manual |
|---|---|---|---|
| **Fondeo e Inversionistas** | `src/components/admin/FundingManagementView.tsx` | Línea `221` | `+ Nuevo Inversionista` |
| **Fondeo e Inversionistas** | `src/components/admin/FundingManagementView.tsx` | Línea `321` | `Guardar y Generar Pagaré` |
| **Cobranza y Reestructuras** | `src/components/admin/CollectionsAndAgreementsView.tsx` | Línea `262` | `Suspensión Temporal` |
| **Cobranza y Reestructuras** | `src/components/admin/CollectionsAndAgreementsView.tsx` | Línea `441` | `Consolidar en Nuevo Contrato` |
| **Cumplimiento PLD/FT** | `src/components/admin/PldComplianceView.tsx` | Línea `210` | `Ingestar Lista Oficial` |
| **Cumplimiento PLD/FT** | `src/components/admin/PldComplianceView.tsx` | Línea `361` | `Previsualizar` |
| **Cumplimiento PLD/FT** | `src/components/admin/PldComplianceView.tsx` | Línea `368` | `Sellar e Ingresar a Base de Datos` |

---

## 🔒 PUNTO 9: Regeneración y Sincronización de Artefactos (`.md`, `.html`, `.pdf`)

| Artefacto en `C:\CRUSE_PORTAL\` | Tamaño (Bytes) | Fecha de Generación | Hash SHA-256 |
|---|---|---|---|
| `MANUAL_USUARIO_ENTRENAMIENTO_CRUSE_PORTAL.md` | `33,721 bytes` | `2026-10-26 11:24:36` | Sincronizado con `docs/` |
| `MANUAL_USUARIO_ENTRENAMIENTO_CRUSE_PORTAL.html` | `44,761 bytes` | `2026-10-26 11:24:36` | Generado con estilos institucionales |
| `MANUAL_USUARIO_ENTRENAMIENTO_CRUSE_PORTAL.pdf` | `980,983 bytes` | `2026-10-26 11:24:37` | `9B15F8FCD537508EA37DE3C020E1F9F059BC566F82C9EE5F1678E91D49D07EBC` |

---

## 🔒 PUNTO 10: Certificación de Calidad (SQA, Regla 3 `< 600` Líneas y Cero Regresiones)

### 10.1 Verificación de Tipos y Build de Producción
- `npx tsc --noEmit` → **`TSC_EXIT=0`** (0 errores de tipos, `0 any`).
- `npm run build` → **`BUILD_EXIT=0`** (`dist/index.html`, `dist/assets/*`, `dist/server.cjs` compilados exitosamente).

### 10.2 Conteo de Líneas (Regla 3 Anti-God-Object `< 600` líneas)
| Archivo | Líneas | Límite Máximo | Estatus |
|---|---|---|---|
| `src/config/authConfig.ts` | `58` | `600` | ✅ Cumple |
| `src/services/auth/rateLimiter.ts` | `179` | `600` | ✅ Cumple |
| `src/services/auth/sessionStore.ts` | `330` | `600` | ✅ Cumple |
| `src/services/auth/smsService.ts` | `200` | `600` | ✅ Cumple |
| `src/services/auth/totpService.ts` | `147` | `600` | ✅ Cumple |
| `src/services/auth/userRepository.ts` | `530` | `600` | ✅ Cumple |
| `src/services/api/authRouter.ts` | `417` | `600` | ✅ Cumple |
| `src/services/api/privateApi.ts` | `58` | `600` | ✅ Cumple |
| `src/components/auth/Login2FAModal.tsx` | `437` | `600` | ✅ Cumple |
| `src/components/admin/UserManagementView.tsx` | `560` | `600` | ✅ Cumple |
| `src/components/admin/AdminAuditView.tsx` | `416` | `600` | ✅ Cumple |
| `src/App.tsx` | `201` | `600` | ✅ Cumple |

### 10.3 Inmutabilidad de los 5 Motores Core de Negocio (`git diff` = 0 líneas alteradas)
- `src/services/creditBureau/creditBureauService.ts` — Intacto
- `src/services/pld/pldScreeningService.ts` — Intacto
- `src/services/portfolio/collectionsAndAgreementsService.ts` — Intacto
- `src/services/reconciliation/reconciliationEngine.ts` — Intacto
- `src/services/executive/scoringService.ts` — Intacto
