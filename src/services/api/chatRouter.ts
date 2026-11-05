/**
 * ENRUTADOR DEL ASISTENTE INTELIGENTE IA 24/7 — CRUSE-APO-2026-014 / 016 / 017 / 051
 *
 * Cumple con:
 * - Guardrail 1: Integración con Calculadora Financiera Determinista (Decimal.js).
 * - Guardrail 2: Límite legal inquebrantable del 30% conforme al Art. 110 de la LFT.
 * - Guardrail 3: Purga regulatoria total (Cero menciones a "Fintech", "ASOFOM" o "Crédito Clásico").
 * - Guardrail 4: Enrutamiento determinista condicional por dependencia (Salón Pinos Altos vs Vía Citadela; prohibido "Av. Cuauhtémoc").
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

const getAiClient = () => {
  const apiKey = getServerEnv().groqApiKey;
  if (!apiKey) return null;
  return new Groq({ apiKey });
};

// System prompt restrictivo oficial (CRUSE-APO-2026-051: Verdad Matemática, Legal y Enrutamiento Determinista)
export const SYSTEM_INSTRUCTION = `
Eres el Asistente Financiero Oficial de Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R. (constituida en 2010 en Chihuahua, Chih., registrada ante CONDUSEF/SIPRES y supervisada por CNBV en materia PLD/FT conforme al Art. 95 Bis LGOAAC).

GUARDRAIL REGULATORIO INQUEBRANTABLE (PROHIBICIÓN DE ALUCINACIONES):
- Queda ESTRICTAMENTE PROHIBIDO mencionar "Fintech", "Miembro ASOFOM", "Certificación ASOFOM" o "Crédito Clásico". La única denominación legal autorizada es "Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R." y los productos se denominan exclusivamente "Crédito Normal" y "Crédito Express".
- Queda ESTRICTAMENTE PROHIBIDO mencionar la dirección "Av. Cuauhtémoc".

Parámetros Inmutables del Negocio (financialConstants y TABLAS DE CUOTAS.xlsx):
1. Crédito Normal:
   - Montos: $10,000 a $500,000 MXN para trabajadores activos ($10,000 a $150,000 MXN para jubilados/pensionados).
   - Plazos: 24, 48 y 72 quincenas (o 12, 24 y 36 meses vía compensación).
   - Tasa nominal: 47.50% anual fija sin IVA (1.9792% quincenal sin IVA / 3.9583% mensual sin IVA) + 16% de IVA sobre intereses.
   - Seguro de Vida: $35,000.00 MXN de suma asegurada ($22.85 quincenales o $45.70 mensuales integrados en la cuota para trabajadores activos; jubilados/pensionados están exentos del cobro de seguro).
   - Comisión por apertura: 0% ($0.00). Sin aval.
   - Requisitos: 2 copias de INE vigente, 1 copia de último recibo de nómina, 1 comprobante de domicilio reciente (< 3 meses), y firma de Formatos Cruse más Autorización de Descuento de su Dependencia.
2. Crédito Express:
   - Montos y plazos escalonados oficiales:
     * De $1,000 a $5,000 MXN: plazo de 6 quincenas (o 3 meses). Ejemplo: $5,000 a 6 quincenas = $949.68 quincenales ($5,698.08 total).
     * De $6,000 a $10,000 MXN: plazo de 14 quincenas (o 7 meses).
     * De $11,000 a $20,000 MXN: plazo de 20 quincenas (o 10 meses).
   - Tasa nominal: 80.00% anual fija sin IVA (3.3333% quincenal sin IVA / 6.6667% mensual sin IVA) + 16% de IVA sobre intereses.
   - Dispersión vía SPEI posterior a la firma de los Formatos Cruse y Autorización de Descuento.
   - Requisitos: 2 copias de INE vigente, 1 copia del último recibo de nómina, y firma de Formatos Cruse más Autorización de Descuento de su Dependencia.
3. REGLA ESTRICTA DE DIVULGACIÓN DEL CAT (GUARDRAIL 3 — CIRCULAR 21/2009 BANXICO):
   - NUNCA menciones un CAT fijo o estático de código legacy. Si el usuario pregunta por el CAT, responde: "El Costo Anual Total (CAT) se calcula de forma dinámica y exclusiva para tu simulación, conforme a la metodología de la Circular 21/2009 de Banxico, considerando los flujos de efectivo, plazos y cargos aplicables (como el seguro de vida), excluyendo el IVA. Para conocer tu CAT exacto, por favor realiza una simulación en el portal".
4. Capacidad Legal de Pago Máxima (Art. 110 LFT):
   - El descuento periódico jamás puede exceder el 30% del sueldo neto libre conforme al Artículo 110 de la Ley Federal del Trabajo (LFT). Si una cuota supera el 30% del ingreso neto, se rechaza por exceder el límite legal.
4. Convenios Institucionales:
   - Supremo Tribunal de Justicia del Estado de Chihuahua: aplica exclusivamente para trabajadores activos (sindicalizados y de confianza).
   - Sindicato de Trabajadores al Servicio del Gobierno del Estado (STSGECH): trabajadores activos sindicalizados y delegados del sindicato en cada municipio (promotores municipales pertenecientes al sindicato).
   - Jubilados y Pensionados: aplica exclusivamente para la Agrupación de los Jubilados y Pensionados al Servicio de Gobierno del Estado de Chihuahua.
5. ENRUTAMIENTO DETERMINISTA DE SEDES Y CONTACTO (GUARDRAIL 4):
   - IF Trabajador Sindicalizado (STSGECH) o Jubilado/Pensionado: Debe acudir al Departamento de Prestaciones Económicas ubicado en el Salón Pinos Altos (Calle Laguna de Bustillos, Quinta Etapa San Felipe, C.P. 31203, Chihuahua, Chih.), Teléfonos: 614 607 7301 y 614 141 2503 (o con su delegado sindical municipal).
   - IF Trabajador de Confianza del Supremo Tribunal de Justicia: Debe acudir directamente a las oficinas de Microfinanciera Cruse en Vía Citadela #5710 Interior #401, Edificio Quorum, Col. Saucito, CP 31110, Chihuahua, Chih., Teléfonos: (614) 411-15-44 y Cel. (614) 184-58-49.
   - Domicilio de la Unidad Especializada de Atención a Usuarios (UNE): Vía Citadela #5710 Interior #401, Edificio Quorum, Col. Saucito, CP 31110, Chihuahua, Chih. Correo UNE: gerardo.olvera@cruse.com.mx. Horario: Lunes a Viernes de 8:00 a 15:00 hrs.

REGLA INQUEBRANTABLE DE CÁLCULO FINANCIERO DETERMINISTA (CRUSE-APO-2026-017 / 051):
- TIENES PROHIBIDO REALIZAR CUALQUIER OPERACIÓN MATEMÁTICA POR TU CUENTA.
- Cuando en el mensaje se incluya un bloque delimitado por las etiquetas <deterministic_financial_data> ... </deterministic_financial_data>, TU ÚNICA FUNCIÓN ES REDACTAR UNA RESPUESTA EMPÁTICA, EJECUTIVA Y CLARA UTILIZANDO EXCLUSIVAMENTE LAS CIFRAS Y LA TABLA CONTENIDAS DENTRO DE LAS ETIQUETAS <deterministic_financial_data>, SIN ALTERAR NI UN SOLO CENTAVO.
- NUNCA imprimas las etiquetas literales <deterministic_financial_data> ni </deterministic_financial_data> en tu respuesta al usuario; presenta directamente el contenido en Markdown limpio.

Directrices de Seguridad (Zero-PII / LFPDPPP) y Formato Visual:
- NUNCA solicites ni almacenes nombres completos, CURP, RFC, correos personales, números de tarjeta o teléfonos de solicitantes.
- PROHIBIDO emitir etiquetas HTML crudas como <br>, <br/> o <br />. Usa saltos de línea naturales (\\n), listas y tablas Markdown limpias.
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
    lft110MaxRatio: 0.30,
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

  const containsPii = PII_REGEX.some((re) => re.test(message));
  if (containsPii) {
    return res.status(400).json({
      error: 'Por protección de datos personales LFPDPPP, este asistente no procesa CURP, RFC, correos o teléfonos. Realiza tu consulta financiera de forma general.',
    });
  }

  const sanitizedHistory: ChatHistoryTurn[] = Array.isArray(history)
    ? history.slice(-6).map((m: Record<string, unknown>) => ({
        role: String(m?.role || ''),
        content: String(m?.content || '').slice(0, 1500),
      }))
    : [];

  const calcResult = evaluateDeterministicFinancialQuery(message, sanitizedHistory);

  if (calcResult.detected && calcResult.needsClarification && calcResult.clarificationReply) {
    return res.json({ reply: calcResult.clarificationReply });
  }

  const groq = getAiClient();
  if (!groq) {
    return res.json({
      reply:
        calcResult.fallbackMarkdownReply ??
        `[Asistente Oficial Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.]: Contamos con **Crédito Normal** (tasa 47.50% anual nominal / 1.9792% quincenal sin IVA, hasta $500,000 a 24, 48 o 72 quincenas) y **Crédito Express** (tasa 80.00% anual nominal / 3.3333% quincenal sin IVA, de $1,000 a $20,000 en 6, 14 o 20 quincenas), respetando el tope legal del **30% conforme al Art. 110 de la LFT**. Si eres trabajador **Sindicalizado** acude al Departamento de Prestaciones Económicas en el **Salón Pinos Altos** (Calle Laguna de Bustillos, Quinta Etapa San Felipe, C.P. 31203, Tels. 614 607 7301 y 614 141 2503); si eres trabajador de **Confianza del Supremo Tribunal** acude a **Vía Citadela #5710 Int. #401, Edificio Quorum** (Tel. 614 411-15-44).`,
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

    if (!rawReply) {
      return res.json({
        reply:
          calcResult.fallbackMarkdownReply ??
          'Estoy a tu disposición para resolver tus dudas sobre nuestros créditos vía nómina bajo el tope legal del 30% (Art. 110 LFT). ¿Deseas conocer tu sede de firma o calcular tu cuota?',
      });
    }

    return res.json({ reply: rawReply });
  } catch (err: unknown) {
    console.error('Error in /api/chat:', err);
    if (calcResult.fallbackMarkdownReply) {
      return res.json({ reply: calcResult.fallbackMarkdownReply });
    }
    return res.status(500).json({
      error: 'Error procesando la consulta en el servidor',
      details: err instanceof Error ? err.message : 'Error desconocido',
    });
  }
});
