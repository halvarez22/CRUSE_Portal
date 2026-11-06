# 🏛️ DOSSIER DE EVIDENCIAS DE EJECUCIÓN FORENSE — TURNO 2 (CRUSE-APO-2026-054)

**Expediente:** `CRUSE-APO-2026-054` (Resolución de Bucle por Respuestas Parciales: Máquina de Estados Multi-Turno de 2 Dimensiones `Dependencia × Tipo de Plaza`, Extracción Híbrida con Validación de Enums y Adopción de Identidad "Alma" Opción 3)  
**Fecha:** 06 de noviembre de 2026  
**Auditor:** Qwen, Auditor Senior Forense de Software y Especialista en Riesgo Financiero  
**Estatus:** ✅ **EJECUCIÓN TURNO 2 COMPLETADA AL 100% — CONGELAMIENTO GIT ACTIVO (`HEAD = cb9e906`)**

---

## 1. Snippets de Código Modificado (Cumplimiento de los 4 Guardrails Forenses)

### 1.1 Saludo Inicial Oficial (Opción 3 — Breve y Ejecutiva) en [`src/data/cruseData.ts`](file:///c:/CRUSE_PORTAL/cruse-fintech-portal/src/data/cruseData.ts#L217-L220) y [`src/components/public/AiAssistantPublic.tsx`](file:///c:/CRUSE_PORTAL/cruse-fintech-portal/src/components/public/AiAssistantPublic.tsx#L71-L79)

```typescript
// src/data/cruseData.ts
export const AI_ASSISTANT_WELCOME_MESSAGE =
  "¡Bienvenido a Microfinanciera Cruse! Soy Alma, tu asistente inteligente. Para canalizar tu consulta al área correcta, por favor confírmame tu dependencia y tipo de plaza (sindicalizado, de confianza, jubilado o pensionado).";
```

```tsx
// src/components/public/AiAssistantPublic.tsx
export const AiAssistantPublic: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: AI_ASSISTANT_WELCOME_MESSAGE,
      timestamp: 'Ahora',
    },
  ]);
```

### 1.2 Extracción Híbrida + Validación contra Enums + Reductor Cronológico + Matriz de 8 Estados en [`src/services/ai/chatFinancialCalculator.ts`](file:///c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/ai/chatFinancialCalculator.ts#L181-L551)

```typescript
export const ALLOWED_DEPENDENCIES = [
  'tribunal_poder_judicial',
  'gobierno_estado',
  'agrupacion_jubilados',
  'out_of_scope',
  'unknown',
] as const;

export const ALLOWED_PLAZA_TYPES = [
  'sindicalizado',
  'confianza',
  'jubilado_pensionado',
  'unknown',
] as const;

export type DependencyKind = (typeof ALLOWED_DEPENDENCIES)[number];
export type PlazaTypeKind = (typeof ALLOWED_PLAZA_TYPES)[number];

export interface ExtractedTriageEntities {
  dependency: DependencyKind;
  plazaType: PlazaTypeKind;
}

export type TriageProfile =
  | 'unidentified'
  | 'out_of_scope'
  | 'partial_tribunal_missing_plaza'
  | 'partial_gob_missing_plaza'
  | 'partial_confianza_missing_dep'
  | 'resolved_confianza_no_convenio'
  | 'resolved_sindicalizado_or_jubilado'
  | 'resolved_confianza_tribunal';

export const OUT_OF_SCOPE_ELIGIBILITY_MESSAGE =
  'Actualmente, nuestros convenios de descuento vía nómina aplican exclusivamente para trabajadores del Poder Judicial / Supremo Tribunal de Justicia, Gobierno del Estado de Chihuahua (STSGECH) y la Agrupación de Jubilados y Pensionados. ¿Laboras en alguna de estas instituciones?';

export function validateAndSanitizeExtractedEntities(
  rawCandidate: unknown,
  fallbackEntities: ExtractedTriageEntities = { dependency: 'unknown', plazaType: 'unknown' }
): ExtractedTriageEntities {
  if (!rawCandidate || typeof rawCandidate !== 'object') {
    return { ...fallbackEntities };
  }
  const candidate = rawCandidate as Record<string, unknown>;
  const rawDep = typeof candidate.dependency === 'string' ? candidate.dependency.trim() : '';
  const rawPlaza = typeof candidate.plazaType === 'string' ? candidate.plazaType.trim() : '';

  const isValidDep = (ALLOWED_DEPENDENCIES as readonly string[]).includes(rawDep);
  const isValidPlaza = (ALLOWED_PLAZA_TYPES as readonly string[]).includes(rawPlaza);

  const safeDep: DependencyKind = isValidDep
    ? (rawDep as DependencyKind)
    : fallbackEntities.dependency;
  const safePlaza: PlazaTypeKind = isValidPlaza
    ? (rawPlaza as PlazaTypeKind)
    : fallbackEntities.plazaType;

  return {
    dependency: safeDep !== 'unknown' ? safeDep : fallbackEntities.dependency,
    plazaType: safePlaza !== 'unknown' ? safePlaza : fallbackEntities.plazaType,
  };
}
```

### 1.3 Orquestación Híbrida y Barrera Post-LLM en [`src/services/api/chatRouter.ts`](file:///c:/CRUSE_PORTAL/cruse-fintech-portal/src/services/api/chatRouter.ts#L133-L265)

```typescript
  const calcResult = evaluateDeterministicFinancialQuery(message, sanitizedHistory);
  const groq = getAiClient();

  // Guardrail 1 (CRUSE-APO-2026-054): Extracción Híbrida de Entidades (LLM + Validación Enums)
  let llmExtractedCandidate: unknown = undefined;
  if (groq) {
    try {
      const userTranscript = [
        ...sanitizedHistory
          .filter((h) => h.role === 'user')
          .map((h, idx) => `Turno ${idx + 1}: ${h.content}`),
        `Turno Actual: ${message}`,
      ].join('\n');

      const extractionCompletion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: ENTITY_EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: userTranscript },
        ],
        temperature: 0,
        max_tokens: 80,
      });

      const rawJson = extractionCompletion.choices[0]?.message?.content?.trim() ?? '';
      const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        llmExtractedCandidate = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback determinista cronológico validado contra Enums
    }
  }

  const triageResult = evaluateTriageAndChannelRouting(
    message,
    sanitizedHistory,
    llmExtractedCandidate
  );
```

---

## 2. Evidencia de Consola de `npx tsx scripts/verify_financial_engine.ts` (`EXIT_CODE = 0`)

```text
================================================================================
🏛️  AUDITORÍA FORENSE DEL MOTOR FINANCIERO — EXPEDIENTE CRUSE-APO-2026-051
================================================================================

✅ 1. C. NORMAL QUINCENAL ACTIVOS       | Filas verificadas:  85/ 85 | Discrepancia: $0.00 MXN
✅ 2. C. NORMAL QUINCENAL PENSIONADOS   | Filas verificadas:  66/ 66 | Discrepancia: $0.00 MXN
✅ 3. C. NORMAL MENSUAL ACTIVOS         | Filas verificadas: 102/102 | Discrepancia: $0.00 MXN
✅ 4. CREDITO EXPRESS QUINCENAL         | Filas verificadas:  20/ 20 | Discrepancia: $0.00 MXN
✅ 5. CREDITO EXPRESS MENSUAL           | Filas verificadas:  20/ 20 | Discrepancia: $0.00 MXN
--------------------------------------------------------------------------------
📊 TOTAL FILAS TABLAS OFICIALES VERIFICADAS : 293 / 293
📊 DISCREPANCIA ACUMULADA                   : $0.00 MXN (Filas con error: 0)
--------------------------------------------------------------------------------

🔍 VERIFICACIÓN DE CASO TESTIGO OFICIAL ($5,000 MXN Express · 6 Quincenas):
   • Monto Solicitado           : $5000.00 MXN
   • Plazo                      : 6 Quincenas
   • Tasa Anual Nominal         : 80.00% (sin IVA)
   • Cuota Quincenal Calculada  : $949.68 MXN (Esperado: $949.68 MXN)
   • Total a Pagar              : $5698.08 MXN (Esperado: $5,698.08 MXN)
   • Sueldo Neto Mínimo (30% LFT): $3165.60 MXN
   • CAT Dinámico Banxico s/IVA : 119.67% (Exacto ((1+0.80/24)^24 - 1) = 119.6701% -> 119.67%)

🏦 VERIFICACIÓN GUARDRAIL 2 Y 4 (CÁLCULO DINÁMICO DE CAT — CIRCULAR 21/2009 BANXICO):
   • Express $5,000 a 6Q ($0 seguro)          -> CAT Bisección = 119.67% s/IVA | Fórmula Cerrada ((1+0.80/24)^24-1) = 119.67% | Diff: 0.0000%
   • Normal Activo $10,000 a 24Q ($22.85 seg) -> CAT Bisección = 74.90% s/IVA (Incluye flujo de seguro obligatorio)
   • Normal Pensionado $10,000 a 24Q ($0 seg) -> CAT Bisección = 60.06% s/IVA (Base nominal 47.50% anual)

⚖️  VERIFICACIÓN GUARDRAIL 2 (BLOQUEO HARD LEGAL 30% ART. 110 LFT):
   • Cuota $949.68 vs Sueldo Neto $3,000.00 (Ratio 31.66%) -> isValid: false | Msg: "Excede el límite legal de descuento del 30% conforme al Art. 110 LFT"
   • Cuota $949.68 vs Sueldo Neto $3,165.60 (Ratio 30.00%) -> isValid: true | Límite 30%: $949.68 MXN

🧹 VERIFICACIÓN GUARDRAIL 1 (ERRADICACIÓN FORENSE DE CONSTANTES CAT LEGACY EN src/, scripts/, db/):
   • Archivos escaneados en src/, scripts/, db/ : 187
   • Ocurrencias de constantes CAT legacy       : 0 (Esperado: 0)

🛡️  VERIFICACIÓN GUARDRAILS 1, 2, 3 Y 4 (MÁQUINA MULTI-TURNO 2D, CASO GERARDO ORNELAS Y SILO HERMÉTICO — APO-053/054):
   • Guardrail 1 (Cláusula Negativa en SYSTEM_INSTRUCTION) : PRESENTE ✅
   • Guardrail 1 APO-054 (Sanitización contra Enums)       : BLOQUEA ALUCINACIÓN Y PRESERVA ENUM ✅
   • Saludo Inicial Opción 3 ("Soy Alma" — Sin Identificar): EXACTO Y SIN DIRECCIONES ✅
   • Caso Gerardo Ornelas [Turno 1: "Trabajo en el poder judicial de Chihuahua"]:
     -> Estado: partial_tribunal_missing_plaza | Reconoce Dependencia y pide SOLO plaza: SÍ (CERO BUCLE) ✅
   • Caso Gerardo Ornelas [Turno 2: "Soy sindicalizado" + Historial Turno 1]:
     -> Estado: resolved_sindicalizado_or_jubilado | Canaliza a Salón Pinos Altos (0 fugas Vía Citadela): SÍ (SILO HERMÉTICO) ✅
   • Guardrail 3 APO-054 [Turno 3 Corrección: "Perdón, soy de confianza"]:
     -> Actualiza estado a resolved_confianza_tribunal (Vía Citadela exclusivo): ACTUALIZACIÓN LIMPIA ✅
   • Guardrail 2 APO-054 [Fuera de Alcance: "Trabajo en la CFE"] : MENSAJE ELEGIBILIDAD OFICIAL ✅

🔒 ESCANEO ESTÁTICO DE ARCHIVOS FINANCIEROS (CERO PUNTO FLOTANTE):
   • src/config/officialQuotaTables.ts                      | FLOAT_CALLS: 0
   • src/config/financialConstants.ts                       | FLOAT_CALLS: 0
   • src/services/ai/chatFinancialCalculator.ts             | FLOAT_CALLS: 0
   • src/services/executive/scoringService.ts               | FLOAT_CALLS: 0
   • src/services/executive/almaDomainQueriesPart1.ts       | FLOAT_CALLS: 0
   • src/utils/amortizationExport.ts                        | FLOAT_CALLS: 0
   • src/components/public/PublicCreditSimulator.tsx        | FLOAT_CALLS: 0
   • src/components/public/PreApplicationModal.tsx          | FLOAT_CALLS: 0
   • src/components/executive/CreditScoringApproverTab.tsx  | FLOAT_CALLS: 0
   • src/components/executive/PortfolioRoiSimulatorTab.tsx  | FLOAT_CALLS: 0
   => FLOAT_CALLS_COUNT GLOBAL = 0

📏 AUDITORÍA DE LÍMITE ANTI-GOD-OBJECT (< 600 LÍNEAS):
   • src/services/ai/chatFinancialCalculator.ts             | 551 / 600 líneas
   • src/data/cruseData.ts                                  | 222 / 600 líneas
   • src/components/public/AiAssistantPublic.tsx            | 341 / 600 líneas
   • src/services/api/chatRouter.ts                         | 279 / 600 líneas

================================================================================
✅ VEREDICTO FORENSE: 293/293 FILAS CON $0.00 DE DISCREPANCIA · FLOAT_CALLS_COUNT = 0
================================================================================
VERIFY_EXIT=0
```

---

## 3. Certificación SQA y Compilación Limpia

- `npx tsc --noEmit` -> **`EXIT_CODE = 0`** (0 errores de tipos TypeScript).
- `npm run build` -> **`EXIT_CODE = 0`** (`dist/index.html`, `dist/assets/index-CHMIuqBQ.js`, `dist/server.cjs` compilados sin errores).
- **Límite Anti-God-Object (< 600 líneas):** Todos los archivos auditados permanecen estrictamente por debajo de 600 líneas (`chatFinancialCalculator.ts`: `551` líneas; `AiAssistantPublic.tsx`: `341` líneas; `chatRouter.ts`: `279` líneas; `cruseData.ts`: `222` líneas).

---

## 4. Declaración Jurada de Congelamiento Git (Turn 2 Freeze)

- Se certifica bajo protesta de rigor forense que **NO se ha ejecutado `git commit`, `git push` ni despliegue a Azure** durante este Turno 2.
- `git rev-parse --short HEAD` permanece intacto en **`cb9e906`**.
