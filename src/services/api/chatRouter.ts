/**
 * ENRUTADOR DEL ASISTENTE INTELIGENTE IA 24/7 — CRUSE-APO-2026-014 / 016 / 017
 *
 * Cumple con:
 * - Regla Inamovible 2 (HRU / Watch Item 1): Integración con Calculadora Financiera Determinista (Decimal.js).
 * - Regla Inamovible 3 (Anti-God-Object / SOLID): Aísla la lógica de IA y el motor determinista.
 * - Regla Inamovible 5 (SSD / Zero-PII LFPDPPP): Barrera de servidor contra CURP, RFC, correos y teléfonos (HTTP 400).
 */

import { Router, Request, Response } from 'express';
import Groq from 'groq-sdk';
import { getServerEnv } from '../../config/serverEnv';
import {
  evaluateDeterministicFinancialQuery,
  ChatHistoryTurn,
} from '../ai/chatFinancialCalculator';

export const chatRouter = Router();

export const GROQ_MODEL = 'openai/gpt-oss-20b';

// Inicialización de Groq SDK en el servidor (Regla 5 SSD: Secrets solo en server-side)
const getAiClient = () => {
  const apiKey = getServerEnv().groqApiKey;
  if (!apiKey) return null;
  return new Groq({ apiKey });
};

// System prompt restrictivo oficial (CRUSE-APO-2026-017: Prohibición de aritmética por el LLM)
const SYSTEM_INSTRUCTION = `
Eres el Asistente Financiero Oficial de Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R. (fundada en 2010 en Chihuahua, Chih., miembro activo de ASOFOM desde 2012 con Certificación 2.9 SOFOM Alta Calidad).

Tu función exclusiva es responder a trabajadores del Gobierno del Estado de Chihuahua y del Supremo Tribunal de Justicia sobre préstamos con descuento vía nómina.

Parámetros Inmutables del Negocio (financialConstants):
1. Crédito Clásico (Normal):
   - Montos: $10,000 a $500,000 MXN en plazos de 24, 48 y 72 quincenas.
   - Tasa fija: 1.97% quincenal sin IVA (47.50% anual fija). CAT informativo: 88.05% sin IVA.
   - Seguro de Vida: $35,000.00 MXN de suma asegurada ($22.85 quincenales ya integrados en cuota).
   - Comisión por apertura: 0% ($0.00). Sin aval y sin buró tradicional.
   - Requisitos: 2 copias de INE, 1 copia de recibo de nómina, 1 comprobante de domicilio reciente (< 3 meses).
2. Crédito Express:
   - Montos: $1,000 a $20,000 MXN en plazos de 6, 14 y 20 quincenas.
   - Tasa fija: 3.33% quincenal sin IVA (48.00% anual). CAT informativo: 136.66% sin IVA.
   - Desembolso en menos de 2 horas vía SPEI sin póliza de seguro de vida quincenal.
   - Requisitos: 2 copias de INE vigente y los últimos 2 recibos de nómina. No se requiere comprobante de domicilio, seguro de vida ni aval.
3. Capacidad de Pago Máxima:
   - Hasta el 35% del sueldo neto libre quincenal.
4. Atención y UNE:
   - Horario: Lunes a Viernes de 8:00 a 15:00 hrs.
   - Ubicación: Vía Citadela #5710 Int. #401, Edificio Quorum, Col. Saucito, CP 31110, Chihuahua, Chih.
   - Tel: (614) 411-15-44 | Cel/WhatsApp: (614) 184-58-49. Correo UNE: gerardo.olvera@cruse.com.mx.

REGLA INQUEBRANTABLE DE CÁLCULO FINANCIERO DETERMINISTA (CRUSE-APO-2026-017):
- TIENES PROHIBIDO REALIZAR CUALQUIER OPERACIÓN MATEMÁTICA (SUMA, RESTA, MULTIPLICACIÓN, DIVISIÓN O DESPEJE) POR TU CUENTA.
- JAMÁS multipliques la cuota máxima por el número de quincenas para estimar el préstamo máximo.
- Cuando en el mensaje se incluya un bloque delimitado por las etiquetas <deterministic_financial_data> ... </deterministic_financial_data>, TU ÚNICA FUNCIÓN ES REDACTAR UNA RESPUESTA EMPÁTICA, EJECUTIVA Y CLARA UTILIZANDO EXCLUSIVAMENTE LAS CIFRAS Y LA TABLA CONTENIDAS DENTRO DE LAS ETIQUETAS <deterministic_financial_data>, SIN ALTERAR NI UN SOLO CENTAVO.
- NUNCA imprimas las etiquetas literales <deterministic_financial_data> ni </deterministic_financial_data> en tu respuesta al usuario; presenta directamente el contenido en Markdown limpio.

Directrices de Seguridad (Zero-PII / LFPDPPP):
- NUNCA solicites ni almacenes nombres completos, CURP, RFC, correos personales, números de tarjeta o teléfonos de solicitantes.
- Si un usuario introduce un CURP o RFC, recuérdale amablemente que no es necesario proporcionar datos personales en este canal informativo.
- Responde siempre con tono formal, institucional, empático, claro, completo y en español mexicano.

Directrices de Formato Visual (UX / Markdown Limpio — CRUSE-APO-2026-016):
- PROHIBIDO emitir etiquetas HTML crudas como <br>, <br/> o <br /> en tus respuestas o dentro de tablas.
- Usa siempre saltos de línea naturales (\\n) para separar párrafos e ítems.
- Estructura tus respuestas con listas numeradas (1., 2., 3.), viñetas (- ), tablas Markdown limpias y negritas (**texto**).
`;

// Patrones de Bloqueo de PII y Sanitización (Watch Item 2 - LFPDPPP)
const PII_REGEX = [
  /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d/i, // CURP
  /[A-Z&Ñ]{3,4}\d{6}[A-V1-9][A-Z\d]{2}/i, // RFC
  /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/, // Email
  /(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/, // Phone
];

/**
 * GET /api/chat — Estado y observabilidad del servicio IA Zero-PII + Calculadora Determinista
 */
chatRouter.get('/', (_req: Request, res: Response) => {
  return res.json({
    status: 'online',
    endpoint: 'POST /api/chat',
    zeroPiiFilter: 'active',
    deterministicCalculator: 'active (decimal.js)',
    model: GROQ_MODEL,
    maxTokens: 2048,
  });
});

/**
 * POST /api/chat — Consulta al Asistente Inteligente con doble barrera LFPDPPP y Calculadora Determinista
 */
chatRouter.post('/', async (req: Request, res: Response) => {
  const { message: rawMessage, history } = req.body ?? {};

  if (!rawMessage || typeof rawMessage !== 'string') {
    return res.status(400).json({ error: 'El mensaje es requerido y debe ser texto' });
  }

  const message = rawMessage.trim().slice(0, 2000);
  if (!message) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  }

  // Barrera 2 (Servidor): Bloqueo estricto de PII (LFPDPPP)
  const containsPii = PII_REGEX.some((re) => re.test(message));
  if (containsPii) {
    return res.status(400).json({
      error: 'Por protección de datos personales LFPDPPP, este asistente no procesa CURP, RFC, correos o teléfonos. Realiza tu consulta financiera de forma general.',
    });
  }

  // Evaluación por la Calculadora Financiera Determinista (Decimal.js)
  const sanitizedHistory: ChatHistoryTurn[] = Array.isArray(history)
    ? history.slice(-6).map((m: Record<string, unknown>) => ({
        role: String(m?.role || ''),
        content: String(m?.content || '').slice(0, 1500),
      }))
    : [];

  const calcResult = evaluateDeterministicFinancialQuery(message, sanitizedHistory);

  // Condición 2 (Qwen): Si requiere aclaración de sueldo/monto, responder de inmediato sin alucinar
  if (calcResult.detected && calcResult.needsClarification && calcResult.clarificationReply) {
    return res.json({ reply: calcResult.clarificationReply });
  }

  const groq = getAiClient();
  if (!groq) {
    return res.json({
      reply:
        calcResult.fallbackMarkdownReply ??
        `[Simulación Local Cruse AI]: Bienvenido a Microfinanciera Cruse. Contamos con Crédito Clásico (tasa 1.97% quincenal, CAT 88.05%, hasta $500,000 a 72 quincenas con seguro de vida de $35,000 incluido) y Crédito Express (3.33% quincenal, hasta $20,000 a 20 quincenas en menos de 2 horas vía nómina). ¿En qué más podemos ayudarte?`,
    });
  }

  try {
    const chatMessages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
    ];

    for (const msg of sanitizedHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        chatMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Condición 3 (Qwen): Inyección delimitada por etiquetas XML <deterministic_financial_data>
    const enrichedUserContent = calcResult.xmlContextBlock
      ? `${message}\n\n${calcResult.xmlContextBlock}`
      : message;

    chatMessages.push({ role: 'user', content: enrichedUserContent });

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: chatMessages,
      temperature: 0.2,
      max_tokens: 2048,
    });

    const rawReply = completion.choices[0]?.message?.content
      ?.replace(/<\/?deterministic_financial_data>/gi, '')
      .trim();

    // Condición 2 de Reglas de Oro: Fallback Determinista Garantizado si el LLM devuelve content vacío
    if (!rawReply) {
      return res.json({
        reply:
          calcResult.fallbackMarkdownReply ??
          'Estoy a tu disposición para resolver tus dudas sobre nuestros créditos vía nómina. ¿Deseas conocer los requisitos o calcular tu capacidad de descuento?',
      });
    }

    return res.json({ reply: rawReply });
  } catch (err: unknown) {
    console.error('Error in /api/chat:', err);
    // Fallback Determinista Garantizado en caso de timeout o excepción de Groq
    if (calcResult.fallbackMarkdownReply) {
      return res.json({ reply: calcResult.fallbackMarkdownReply });
    }
    return res.status(500).json({
      error: 'Error procesando la consulta en el servidor',
      details: err instanceof Error ? err.message : 'Error desconocido',
    });
  }
});
