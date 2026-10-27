/**
 * ALMA VIRTUAL — ORQUESTADOR DE TOOL CALLING CON GROQ LLaMA 3.3 70B (MÓDULO B.4)
 * Expediente: CRUSE-APO-2026-033-R3
 * Guardrail A: Cero Text-to-SQL directo (uso exclusivo de ALMA_VIRTUAL_TOOLS).
 * Guardrail B: Validación Zero-Trust de parámetros en dispatchAlmaToolCall().
 * Guardrail C: Declinación institucional estricta ante preguntas fuera de dominio.
 * Guardrail D: Zero-PII inquebrantable (datos enmascarados en origen + negativa explícita LFPDPPP).
 */

import Groq from 'groq-sdk';
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';
import { db } from '../db/connectionPool';
import {
  HubRegion,
  InternalAiAggregatedContext,
  InternalAiQueryResponse,
} from '../../types/executive';
import { ALMA_VIRTUAL_TOOLS } from './toolsSchema';
import {
  dispatchAlmaToolCall,
  enforceAlmaToolCallRateLimit,
} from './almaVirtualQueryEngine';

const GROQ_INTERNAL_MODEL = 'llama-3.3-70b-versatile';

/**
 * Ajuste Obligatorio 6: System Prompt explícito con reglas inquebrantables (Guardrails C y D).
 */
export const ALMA_VIRTUAL_SYSTEM_PROMPT = `Eres "Alma Virtual", el Copiloto Financiero y Operativo Interno 24/7 de Microfinanciera Cruse SOFOM E.N.R.
REGLAS INQUEBRANTABLES:
1. SOLO puedes responder preguntas operativas, financieras y de cumplimiento usando las herramientas proporcionadas conectadas a PostgreSQL 16. Cuando una consulta abarque múltiples dominios (por ejemplo: Cobranza/Prelación, Póliza de Seguro y Bitácora Forense WORM), DEBES invocar todas las herramientas correspondientes en paralelo.
2. NUNCA reveles nombres completos, CURP, RFC o direcciones en texto plano. Si el usuario los solicita, incluye obligatoriamente en tu respuesta: "⚠️ ACCESO DENEGADO: Las políticas de LFPDPPP y CNBV prohíben la exposición de datos personales. Solo puedo proporcionar identificadores enmascarados (ej. MAGR************01)."
3. Si la pregunta no puede responderse con las herramientas disponibles o es ajena a la operación de Microfinanciera Cruse (ej. clima, recetas de cocina, deportes, historia general), NO invoques ninguna herramienta y responde exactamente: "Lo siento, solo estoy capacitado para responder preguntas operativas, financieras y de cumplimiento de Microfinanciera Cruse. ¿En qué más puedo ayudarte dentro de mi ámbito?"
4. Estructura tus respuestas en tablas Markdown ejecutivas cuando sea apropiado, respetando las cifras exactas centavo a centavo ($#,##0.00 MXN).
5. Sé conciso, profesional y basado únicamente en los datos que las herramientas te devuelvan.`;

function sanitizeQuestionZeroPii(rawQuestion: string): string {
  return rawQuestion
    .replace(/[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/gi, '[CURP_OMITIDO_ZERO_PII]')
    .replace(/[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/gi, '[RFC_OMITIDO_ZERO_PII]')
    .slice(0, 1200)
    .trim();
}

/**
 * Construye el snapshot estadístico 100% agregado y anonimizado desde PostgreSQL 16.
 */
export async function buildAggregatedOperationalSnapshot(): Promise<InternalAiAggregatedContext> {
  const portfolioAgg = await db.query<{
    total_active_loans: number;
    total_placed_mxn: number;
    total_active_balance_mxn: number;
    loans_this_month: number;
  }>(`
    SELECT
      COUNT(*) AS total_active_loans,
      COALESCE(SUM(la.principal_original), 0) AS total_placed_mxn,
      COALESCE(SUM(la.current_principal_balance), 0) AS total_active_balance_mxn,
      SUM(CASE
        WHEN CAST(la.activated_at AS TEXT) >= SUBSTR(CAST(CURRENT_TIMESTAMP AS TEXT), 1, 7)
        THEN 1 ELSE 0
      END) AS loans_this_month
    FROM loan_accounts la
  `);

  const hubRows = await db.query<{
    hub_region: string;
    active_loans: number;
    placed_amount_mxn: number;
    verde_count: number;
    amarillo_count: number;
    rojo_count: number;
    overdue_balance_mxn: number;
  }>(`
    SELECT
      COALESCE(e.hub_region, 'CHIHUAHUA') AS hub_region,
      COUNT(la.id) AS active_loans,
      COALESCE(SUM(la.principal_original), 0) AS placed_amount_mxn,
      SUM(CASE
        WHEN la.status = 'ACTIVE' AND NOT EXISTS (
          SELECT 1 FROM loan_suspension_periods lsp
          WHERE lsp.loan_account_id = la.id AND lsp.status = 'ACTIVE_SUSPENSION'
        ) THEN 1 ELSE 0
      END) AS verde_count,
      SUM(CASE
        WHEN EXISTS (
          SELECT 1 FROM loan_suspension_periods lsp
          WHERE lsp.loan_account_id = la.id AND lsp.status = 'ACTIVE_SUSPENSION' AND lsp.reason = 'LICENCIA_SIN_GOCE'
        ) THEN 1 ELSE 0
      END) AS amarillo_count,
      SUM(CASE
        WHEN la.status = 'FROZEN_EXTRAJUDICIAL' OR EXISTS (
          SELECT 1 FROM loan_suspension_periods lsp
          WHERE lsp.loan_account_id = la.id AND lsp.status = 'ACTIVE_SUSPENSION' AND lsp.reason <> 'LICENCIA_SIN_GOCE'
        ) THEN 1 ELSE 0
      END) AS rojo_count,
      COALESCE(SUM(CASE
        WHEN la.status = 'FROZEN_EXTRAJUDICIAL' OR EXISTS (
          SELECT 1 FROM loan_suspension_periods lsp
          WHERE lsp.loan_account_id = la.id AND lsp.status = 'ACTIVE_SUSPENSION' AND lsp.reason <> 'LICENCIA_SIN_GOCE'
        ) THEN la.current_principal_balance ELSE 0
      END), 0) AS overdue_balance_mxn
    FROM expedientes e
    LEFT JOIN loan_accounts la ON la.expediente_id = e.id
    GROUP BY COALESCE(e.hub_region, 'CHIHUAHUA')
  `);

  const pldAgg = await db.query<{
    pending_alerts: number;
    confirmed_blocked: number;
  }>(`
    SELECT
      COALESCE(SUM(CASE
        WHEN COALESCE(latest_res.resolution_status, a.status) = 'PENDING_REVIEW' THEN 1 ELSE 0
      END), 0) AS pending_alerts,
      COALESCE(SUM(CASE
        WHEN COALESCE(latest_res.resolution_status, a.status) = 'CONFIRMED_BLOCKED' THEN 1 ELSE 0
      END), 0) AS confirmed_blocked
    FROM pld_hit_alerts a
    LEFT JOIN (
      SELECT r1.hit_alert_id, r1.resolution_status
      FROM pld_alert_resolutions r1
      WHERE r1.id = (
        SELECT r2.id
        FROM pld_alert_resolutions r2
        WHERE r2.hit_alert_id = r1.hit_alert_id
        ORDER BY r2.created_at DESC, r2.id DESC
        LIMIT 1
      )
    ) latest_res ON latest_res.hit_alert_id = a.id
  `);

  const pldEntriesAgg = await db.query<{ total_entries: number }>(
    `SELECT COUNT(*) AS total_entries FROM pld_risk_entries`
  );

  const fundingAgg = await db.query<{
    investors_count: number;
    committed_capital: number;
  }>(`
    SELECT
      COUNT(DISTINCT investor_id) AS investors_count,
      COALESCE(SUM(CASE WHEN current_capital > 0 THEN current_capital ELSE capital END), 0) AS committed_capital
    FROM investments
    WHERE status = 'ACTIVE'
  `);

  const hubSummary: Record<
    HubRegion,
    { activeLoans: number; placedAmountMxn: number; delinquencyRatePercent: string }
  > = {
    CHIHUAHUA: { activeLoans: 0, placedAmountMxn: 0, delinquencyRatePercent: '0.0%' },
    LEON: { activeLoans: 0, placedAmountMxn: 0, delinquencyRatePercent: '0.0%' },
    CANCUN: { activeLoans: 0, placedAmountMxn: 0, delinquencyRatePercent: '0.0%' },
  };

  let totalVerde = 0;
  let totalAmarillo = 0;
  let totalRojo = 0;
  let totalOverdueMxn = 0;

  for (const row of hubRows.rows) {
    const hubKey = (['CHIHUAHUA', 'LEON', 'CANCUN'].includes(row.hub_region)
      ? row.hub_region
      : 'CHIHUAHUA') as HubRegion;
    const activeLoans = Number(row.active_loans ?? 0);
    const placedAmountMxn = Number(row.placed_amount_mxn ?? 0);
    const overdueMxn = Number(row.overdue_balance_mxn ?? 0);
    const ratePct = placedAmountMxn > 0 ? ((overdueMxn / placedAmountMxn) * 100).toFixed(1) : '0.0';

    hubSummary[hubKey] = {
      activeLoans,
      placedAmountMxn,
      delinquencyRatePercent: `${ratePct}%`,
    };

    totalVerde += Number(row.verde_count ?? 0);
    totalAmarillo += Number(row.amarillo_count ?? 0);
    totalRojo += Number(row.rojo_count ?? 0);
    totalOverdueMxn += overdueMxn;
  }

  const pRow = portfolioAgg.rows[0];

  return {
    timestampIso: new Date().toISOString(),
    totalLoansThisMonth: Number(pRow?.loans_this_month ?? 0),
    totalActiveLoans: Number(pRow?.total_active_loans ?? 0),
    totalCapitalPlacedMxn: Number(pRow?.total_placed_mxn ?? 0),
    totalActiveBalanceMxn: Number(pRow?.total_active_balance_mxn ?? 0),
    totalOverdueBalanceMxn: totalOverdueMxn,
    pldAlertsPendingCount: Number(pldAgg.rows[0]?.pending_alerts ?? 0),
    pldAlertsConfirmedBlockedCount: Number(pldAgg.rows[0]?.confirmed_blocked ?? 0),
    pldTotalRiskEntriesCount: Number(pldEntriesAgg.rows[0]?.total_entries ?? 0),
    semaphoreDistribution: {
      VERDE: totalVerde,
      AMARILLO: totalAmarillo,
      ROJO: totalRojo,
    },
    hubSummary,
    fundingSummary: {
      activeInvestorsCount: Number(fundingAgg.rows[0]?.investors_count ?? 0),
      totalCommittedCapitalMxn: Number(fundingAgg.rows[0]?.committed_capital ?? 0),
    },
  };
}

/**
 * Ejecuta el ciclo completo de Tool Calling de 2 etapas con Groq LLaMA 3.3 70B.
 */
export async function answerInternalOperationalQuery(
  rawQuestion: string,
  actorEmail = 'admin@cruse.com.mx'
): Promise<InternalAiQueryResponse> {
  const sanitizedQuestion = sanitizeQuestionZeroPii(rawQuestion);
  const aggregatedSnapshot = await buildAggregatedOperationalSnapshot();

  const zeroPiiAggregatedPayload = {
    total_loans_this_month: aggregatedSnapshot.totalLoansThisMonth,
    total_active_loans: aggregatedSnapshot.totalActiveLoans,
    total_amount_placed_mxn: aggregatedSnapshot.totalCapitalPlacedMxn,
    total_active_balance_mxn: aggregatedSnapshot.totalActiveBalanceMxn,
    total_overdue_balance_mxn: aggregatedSnapshot.totalOverdueBalanceMxn,
    pld_alerts_pending: aggregatedSnapshot.pldAlertsPendingCount,
    pld_alerts_confirmed_blocked: aggregatedSnapshot.pldAlertsConfirmedBlockedCount,
    pld_catalog_entries: aggregatedSnapshot.pldTotalRiskEntriesCount,
    semaphore_distribution: aggregatedSnapshot.semaphoreDistribution,
    delinquency_by_hub: aggregatedSnapshot.hubSummary,
    funding_summary: aggregatedSnapshot.fundingSummary,
  };

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey && groqKey.startsWith('gsk_')) {
    const groq = new Groq({ apiKey: groqKey });

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: ALMA_VIRTUAL_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: sanitizedQuestion,
      },
    ];

    // Etapa 1: El LLM analiza la intención semántica y selecciona 0, 1 o N herramientas en paralelo
    const stage1 = await groq.chat.completions.create({
      model: GROQ_INTERNAL_MODEL,
      temperature: 0.0,
      max_tokens: 600,
      messages,
      tools: ALMA_VIRTUAL_TOOLS,
      tool_choice: 'auto',
    });

    const assistantMsg = stage1.choices[0]?.message;
    const toolCalls = assistantMsg?.tool_calls ?? [];

    // Caso A: El LLM determinó que no requiere herramientas (ej. Pregunta Fuera de Dominio - Guardrail C)
    if (toolCalls.length === 0) {
      const directReply =
        assistantMsg?.content?.trim() ||
        'Lo siento, solo estoy capacitado para responder preguntas operativas, financieras y de cumplimiento de Microfinanciera Cruse. ¿En qué más puedo ayudarte dentro de mi ámbito?';

      return {
        answer: directReply,
        model: `${GROQ_INTERNAL_MODEL} · Tool Calling (0 tools)`,
        zeroPiiCertified: true,
        aggregatedSnapshot,
        intentCode: 'OUT_OF_DOMAIN_GUARDRAIL_C',
        domain: 'RESUMEN_EJECUTIVO',
        questionNumber: null,
        toolsInvoked: [],
      };
    }

    // Caso B: El LLM solicitó 1 o más tool_calls -> Ajuste 3: Verificar Rate Limiter (máx 5 paralelas, máx 30/min)
    enforceAlmaToolCallRateLimit(actorEmail, toolCalls.length);

    messages.push({
      role: 'assistant',
      content: assistantMsg?.content ?? null,
      tool_calls: toolCalls,
    });

    const toolsInvoked: string[] = [];

    // Ejecutar todas las herramientas solicitadas en paralelo (Promise.all) con validación Zero-Trust y Timeout 10s
    const dispatchedResults = await Promise.all(
      toolCalls.map(async (tc) => {
        const fnName = tc.function.name;
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = tc.function.arguments
            ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
            : {};
        } catch {
          parsedArgs = {};
        }

        if (fnName === 'get_executive_portfolio_overview') {
          toolsInvoked.push('get_executive_portfolio_overview');
          return {
            toolCallId: tc.id,
            payload: {
              status: 'SUCCESS',
              domain: 'RESUMEN_EJECUTIVO',
              data: zeroPiiAggregatedPayload,
            },
          };
        }

        const execResult = await dispatchAlmaToolCall(fnName, parsedArgs);
        toolsInvoked.push(`${fnName}(${execResult.queryType})`);
        return {
          toolCallId: tc.id,
          payload: execResult.llmPayload,
        };
      })
    );

    for (const item of dispatchedResults) {
      messages.push({
        role: 'tool',
        tool_call_id: item.toolCallId,
        content: JSON.stringify(item.payload),
      });
    }

    // Etapa 2: El LLM redacta la respuesta ejecutiva final en Markdown usando los resultados verificados
    const stage2 = await groq.chat.completions.create({
      model: GROQ_INTERNAL_MODEL,
      temperature: 0.1,
      max_tokens: 950,
      messages,
    });

    const finalAnswer = stage2.choices[0]?.message?.content?.trim();
    if (finalAnswer) {
      return {
        answer: finalAnswer,
        model: `${GROQ_INTERNAL_MODEL} · Tool Calling (${toolsInvoked.length} tools)`,
        zeroPiiCertified: true,
        aggregatedSnapshot,
        intentCode: toolsInvoked.join(' + '),
        domain: 'RESUMEN_EJECUTIVO',
        questionNumber: null,
        toolsInvoked,
      };
    }
  }

  // Fallback si GROQ_API_KEY no está configurada en el entorno
  const fallbackAnswer = [
    `📊 **Reporte Ejecutivo en Tiempo Real (Zero-PII Certificado):**`,
    `• **Colocación y Cartera:** Se registran **${aggregatedSnapshot.totalActiveLoans} créditos activos** (${aggregatedSnapshot.totalLoansThisMonth} originados este mes), con un capital colocado acumulado de **$${aggregatedSnapshot.totalCapitalPlacedMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN** y saldo insoluto vigente de **$${aggregatedSnapshot.totalActiveBalanceMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN**.`,
    `• **Blindaje PLD/FT (CNBV / UIF):** Hay **${aggregatedSnapshot.pldAlertsPendingCount} alerta(s) pendiente(s) de revisión**, **${aggregatedSnapshot.pldAlertsConfirmedBlockedCount} alerta(s) bloqueada(s) confirmada(s)** y **${aggregatedSnapshot.pldTotalRiskEntriesCount} registros** activos en listas de riesgo (69-B SAT, UIF, OFAC, PEPs).`,
  ].join('\n');

  return {
    answer: fallbackAnswer,
    model: 'Motor Estadístico Determinista PostgreSQL 16 (Zero-PII)',
    zeroPiiCertified: true,
    aggregatedSnapshot,
    intentCode: 'MACRO_EXECUTIVE_SUMMARY',
    domain: 'RESUMEN_EJECUTIVO',
    questionNumber: null,
    toolsInvoked: [],
  };
}
