# 🏛️ DOSSIER DE EVIDENCIAS DE EJECUCIÓN FORENSE — TURNO 2 (CRUSE-APO-2026-055)

**Expediente:** `CRUSE-APO-2026-055` (Erradicación del "Efecto Conmutador Grabado", Pool Dinámico de Variaciones Conversacionales, Orientación de Valor Pre-Triaje y Barrera Post-LLM)  
**Fecha:** 06 de noviembre de 2026  
**Auditor:** Qwen, Auditor Senior Forense de Software y Especialista en Riesgo Financiero  
**Estatus:** ✅ **EJECUCIÓN TURNO 2 COMPLETADA AL 100% — CONGELAMIENTO GIT ACTIVO (`HEAD = 2405ff1`)**

---

## 1. Snippets de Código Clave (Cumplimiento de los 4 Guardrails Forenses)

### 1.1 Guardrail 1 y 2: `TRIAGE_FOLLOWUP_VARIATION_POOL` (4 variantes distintas al saludo inicial, con orientación de valor y 0 fugas de sedes) en [`src/data/cruseData.ts`](file:///c:/CRUSE_PORTAL/cruse-fintech-portal/src/data/cruseData.ts#L222-L249)

```typescript
// Pool Rotativo de Variaciones Conversacionales de Seguimiento Pre-Triaje (CRUSE-APO-2026-055 — Guardrails 1, 2 y 4)
// Ninguna variante repite AI_ASSISTANT_WELCOME_MESSAGE ni revela sedes físicas o teléfonos antes de completar el triaje.
export const TRIAGE_FOLLOWUP_VARIATION_POOL = [
  "¡Con todo gusto te brindo los detalles! En **Microfinanciera Cruse** contamos con **Crédito Normal** ($10,000 a $500,000 MXN, plazos de 24 a 72 quincenas) y **Crédito Express** ($1,000 a $20,000 MXN, plazos de 6 a 20 quincenas) vía descuento de nómina, **sin aval, con 0% de comisión por apertura** y cuidando siempre el tope legal del **30% de tu sueldo neto (Art. 110 LFT)**.\n\nPara indicarte los requisitos y el área exacta donde se gestiona tu convenio, ¿me podrías comentar **en qué dependencia trabajas y si tu plaza es sindicalizada, de confianza o eres jubilado/pensionado**?",
  "¡Claro que sí, estoy para ayudarte! Nuestros créditos de nómina (**Crédito Normal** hasta $500,000 MXN y **Crédito Express** hasta $20,000 MXN) operan con pagos fijos quincenales o mensuales, **0% comisión por apertura y sin aval**, respetando el límite legal del **30% LFT**.\n\nDado que el canal de atención depende de tu convenio laboral, cuéntame por favor: **¿a qué institución o dependencia perteneces (por ejemplo, Poder Judicial o Gobierno del Estado) y cuál es tu tipo de contratación (sindicalizado, confianza o pensionado)?**",
  "¡Será un placer asesorarte con tu crédito! Manejamos dos esquemas principales con descuento vía nómina y **sin aval**: **Crédito Normal** ($10,000 a $500,000 MXN) y **Crédito Express** ($1,000 a $20,000 MXN), ambos con **0% de comisión por apertura** y protegidos bajo el tope del **30% del Art. 110 de la LFT**.\n\nPara darte los datos precisos de quién atiende tu trámite, solo ayúdame confirmando dos datos rápidos: **¿en qué dependencia laboras actualmente y si eres personal sindicalizado (de base), de confianza o jubilado/pensionado?**",
  "¡Por supuesto! En **Microfinanciera Cruse** te ofrecemos liquidez inmediata mediante **Crédito Express** ($1,000 a $20,000 MXN) o financiamiento patrimonial con **Crédito Normal** ($10,000 a $500,000 MXN), en plazos quincenales o mensuales, **sin aval, 0% comisión por apertura** y dentro del margen legal del **30% LFT**.\n\nPara guiarte paso a paso con el equipo correspondiente a tu convenio, **¿me indicas en qué dependencia trabajas y si cuentas con plaza sindicalizada, de confianza o eres jubilado/pensionado?**",
] as const;
```

### 1.2 Guardrail 3 y 4: Rotación `selectVariationByTurn` y Expansión Semántica Coloquial en [`src/services/ai/chatFinancialCalculator.ts`](file:///c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/ai/chatFinancialCalculator.ts#L286-L368)

```typescript
  // 1. Detección de Dependencia (Prioridad a fuera de alcance para Guardrail 3, luego convenios oficiales y coloquiales)
  if (
    /\b(cfe|comision federal|imss|issste|pemex|municipio|presidencia municipal|ayuntamiento|uach|uacj|gobierno federal|maquila|maquiladora|empresa privada|telmex|bimbo|oxxo|walmart|coppel|bancomer|bbva|santander)\b/i.test(
      lower
    )
  ) {
    dependency = 'out_of_scope';
  } else if (
    /\b(poder judicial|supremo tribunal|tribunal de justicia|\bstj\b|\btsj\b|juzgad|tribunal|magistrad|juez|actuari|secretari[oa] de acuerdos|ciudad judicial)\b/i.test(
      lower
    )
  ) {
    dependency = 'tribunal_poder_judicial';
  } else if (/\b(agrupacion de jubilados|agrupacion de los jubilados|pensiones civiles)\b/i.test(lower)) {
    dependency = 'agrupacion_jubilados';
  } else if (
    /\b(gobierno del estado|gob del estado|gobierno estatal|trabajador del estado|emplead[oa] estatal|en gobierno|stsgech|secretaria de hacienda|secretaria de educacion|secretaria de salud|fiscalia|recaudacion de rentas|registro civil)\b/i.test(
      lower
    )
  ) {
    dependency = 'gobierno_estado';
  }
```

```typescript
/**
 * Guardrail 4 (CRUSE-APO-2026-055): Rotación Anti-Bucle basada en el conteo real de turnos del usuario.
 */
export function selectVariationByTurn(
  pool: readonly string[],
  history: ReadonlyArray<{ role?: string; sender?: string }> = []
): string {
  const userTurnsCount = Array.isArray(history)
    ? history.filter((m) => m.role === 'user' || m.sender === 'user').length
    : 0;
  return pool[userTurnsCount % pool.length] ?? AI_ASSISTANT_WELCOME_MESSAGE;
}
```

### 1.3 Eliminación del Cortocircuito Estático y Barrera Post-LLM (`Defense in Depth`) en [`src/services/api/chatRouter.ts`](file:///c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/api/chatRouter.ts#L83-L136)

```typescript
// Patrones prohibidos en Pre-Triaje (!isFullyResolved) — Guardrail 2 (CRUSE-APO-2026-055)
export const PRE_TRIAGE_FORBIDDEN_LEAK_REGEX =
  /citadela|pinos altos|laguna de bustillos|411-15-44|607[\s-]7301|141[\s-]2503|184-58-49|departamento de prestaciones/i;

export function enforcePostLlmTriageBarrier(
  rawReply: string,
  triageResult: TriageEvaluationResult,
  calcFallback?: string,
  lastAssistantReply?: string
): string {
  const deterministicFallback = calcFallback
    ? `${calcFallback}\n\n---\n\n${triageResult.siloedRoutingReply}`
    : triageResult.siloedRoutingReply;

  if (!rawReply) {
    return deterministicFallback;
  }

  if (!triageResult.isFullyResolved) {
    const leaksSensitiveRouting = PRE_TRIAGE_FORBIDDEN_LEAK_REGEX.test(rawReply);
    const repeatsWelcome = rawReply.includes('¡Bienvenido a Microfinanciera Cruse!');
    const repeatsLastTurn =
      Boolean(lastAssistantReply) && rawReply.trim() === lastAssistantReply?.trim();

    if (leaksSensitiveRouting || repeatsWelcome || repeatsLastTurn) {
      return calcFallback
        ? `${calcFallback}\n\n---\n\n${triageResult.triageQuestionReply}`
        : triageResult.triageQuestionReply;
    }
    return rawReply;
  }
```

---

## 2. Evidencia de Consola de `npx tsx scripts/verify_financial_engine.ts` (`EXIT_CODE = 0`)

```text
🛡️  VERIFICACIÓN GUARDRAILS 1, 2, 3 Y 4 (MÁQUINA MULTI-TURNO 2D, CASO GERARDO ORNELAS Y SILO HERMÉTICO — APO-053/054):
   • Guardrail 1 (Cláusula Negativa en SYSTEM_INSTRUCTION) : PRESENTE ✅
   • Guardrail 1 APO-054 (Sanitización contra Enums)       : BLOQUEA ALUCINACIÓN Y PRESERVA ENUM ✅
   • Guardrail 1 APO-055 (WELCOME !== VARIATION_POOL[i])   : 4/4 DISTINTAS AL SALUDO INICIAL ✅
   • Guardrail 4 APO-055 (3 Consultas Generales Consecutivas): 3 RESPUESTAS DISTINTAS (CERO IVR GRABADO) ✅
   • Guardrail 2 APO-055 (Orientación Valor Pre-Triaje 0 Fugas): 0 FUGAS SEDES/TELS + BARRERA POST-LLM ACTIVA ✅
   • Caso Gerardo Ornelas [Turno 1: "Trabajo en el poder judicial de Chihuahua"]:
     -> Estado: partial_tribunal_missing_plaza | Reconoce Dependencia y pide SOLO plaza: SÍ (CERO BUCLE) ✅
   • Caso Gerardo Ornelas [Turno 2: "Soy sindicalizado" + Historial Turno 1]:
     -> Estado: resolved_sindicalizado_or_jubilado | Canaliza a Salón Pinos Altos (0 fugas Vía Citadela): SÍ (SILO HERMÉTICO) ✅
   • Guardrail 3 APO-054 [Turno 3 Corrección: "Perdón, soy de confianza"]:
     -> Actualiza estado a resolved_confianza_tribunal (Vía Citadela exclusivo): ACTUALIZACIÓN LIMPIA ✅
   • Guardrail 2 APO-054 [Fuera de Alcance: "Trabajo en la CFE"] : MENSAJE ELEGIBILIDAD OFICIAL ✅

🔒 ESCANEO ESTÁTICO DE ARCHIVOS FINANCIEROS (CERO PUNTO FLOTANTE):
   => FLOAT_CALLS_COUNT GLOBAL = 0

📏 AUDITORÍA DE LÍMITE ANTI-GOD-OBJECT (< 600 LÍNEAS):
   • src/services/ai/chatFinancialCalculator.ts             | 578 / 600 líneas
   • src/data/cruseData.ts                                  | 250 / 600 líneas
   • src/components/public/AiAssistantPublic.tsx            | 341 / 600 líneas
   • src/services/api/chatRouter.ts                         | 311 / 600 líneas

================================================================================
✅ VEREDICTO FORENSE: 293/293 FILAS CON $0.00 DE DISCREPANCIA · FLOAT_CALLS_COUNT = 0
================================================================================
VERIFY_EXIT=0
```

---

## 3. Certificación SQA y Compilación Limpia

- `npx tsc --noEmit` -> **`EXIT_CODE = 0`** (0 errores de tipos).
- `npm run build` -> **`EXIT_CODE = 0`** (`dist/index.html`, `dist/assets/index-DrNtI9En.js`, `dist/server.cjs` compilados sin errores).
- **Límite Anti-God-Object (`< 600` líneas):** Todos los archivos auditados permanecen estrictamente bajo 600 líneas (`chatFinancialCalculator.ts`: `578/600`, `AiAssistantPublic.tsx`: `341/600`, `chatRouter.ts`: `311/600`, `cruseData.ts`: `250/600`).

---

## 4. Declaración Jurada de Congelamiento Git (Turn 2 Freeze)

- Se certifica bajo protesta de rigor forense que **NO se ha ejecutado `git commit`, `git push` ni sincronización a Azure** durante este Turno 2.
- `git rev-parse --short HEAD` permanece intacto en **`2405ff1`**.
