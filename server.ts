import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { FINANCIAL_CONSTANTS } from './src/config/financialConstants';
import { COMPANY_INFO } from './src/data/cruseData';
import { privateApiRouter } from './src/services/api/privateApi';
import { runMigrations } from './src/services/db/migrationRunner';
import { loadServerEnv, getServerEnv, ServerEnvError } from './src/config/serverEnv';

dotenv.config();


const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '5mb' }));

// Montar endpoints seguros de la API privada (2FA, Auditoría Forense y Sincronización)
app.use('/api', privateApiRouter);


// Inicialización de Groq SDK en el servidor (Regla 5 SSD: Secrets solo en server-side)
const getAiClient = () => {
  const apiKey = getServerEnv().groqApiKey;
  if (!apiKey) return null;
  return new Groq({ apiKey });
};

const GROQ_MODEL = 'openai/gpt-oss-20b';

// System prompt restrictivo oficial (Watch Item 2 de Auditoría Forense Qwen)
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
3. Capacidad de Pago Máxima:
   - Hasta el 35% del sueldo neto libre quincenal.
4. Atención y UNE:
   - Horario: Lunes a Viernes de 8:00 a 15:00 hrs.
   - Ubicación: Vía Citadela #5710 Int. #401, Edificio Quorum, Col. Saucito, CP 31110, Chihuahua, Chih.
   - Tel: (614) 411-15-44 | Cel/WhatsApp: (614) 184-58-49. Correo UNE: gerardo.olvera@cruse.com.mx.

Directrices de Seguridad (Zero-PII / LFPDPPP):
- NUNCA solicites ni almacenes nombres completos, CURP, RFC, correos personales, números de tarjeta o teléfonos de solicitantes.
- Si un usuario introduce un CURP o RFC, recuérdale amablemente que no es necesario proporcionar datos personales en este canal informativo.
- Responde siempre con tono formal, institucional, empático, claro y en español mexicano.
`;

// Healthcheck
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    company: COMPANY_INFO.name,
    aiModel: GROQ_MODEL,
    timestamp: new Date().toISOString(),
  });
});

// Middleware de Bloqueo de PII y Sanitización (Watch Item 2)
const PII_REGEX = [
  /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d/i, // CURP
  /[A-Z&Ñ]{3,4}\d{6}[A-V1-9][A-Z\d]{2}/i, // RFC
  /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/, // Email
  /(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/, // Phone
];

// Chatbot Endpoint (Zero-PII)
app.post('/api/chat', async (req, res) => {
  try {
    const { message: rawMessage, history } = req.body;

    if (!rawMessage || typeof rawMessage !== 'string') {
      return res.status(400).json({ error: 'El mensaje es requerido y debe ser texto' });
    }

    const message = rawMessage.trim().slice(0, 2000);
    if (!message) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    }

    // Bloqueo estricto de PII
    const containsPii = PII_REGEX.some((re) => re.test(message));
    if (containsPii) {
      return res.status(400).json({
        error: 'Por protección de datos personales LFPDPPP, este asistente no procesa CURP, RFC, correos o teléfonos. Realiza tu consulta financiera de forma general.',
      });
    }

    const groq = getAiClient();
    if (!groq) {
      return res.json({
        reply: `[Simulación Local Cruse AI]: Bienvenido a Microfinanciera Cruse. Contamos con Crédito Clásico (tasa 1.97% quincenal, CAT 88.05%, hasta $500,000 a 72 quincenas con seguro de vida de $35,000 incluido) y Crédito Express (3.33% quincenal, hasta $20,000 a 20 quincenas en menos de 2 horas vía nómina). ¿En qué más podemos ayudarte?`,
      });
    }

    const chatMessages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
    ];

    if (Array.isArray(history) && history.length > 0) {
      for (const msg of history.slice(-4)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          chatMessages.push({
            role: msg.role,
            content: String(msg.content).slice(0, 500),
          });
        }
      }
    }

    chatMessages.push({ role: 'user', content: message });

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: chatMessages,
      temperature: 0.5,
      max_tokens: 500,
    });

    const reply = completion.choices[0]?.message?.content ?? 'Disculpa, no pude procesar la consulta en este momento.';
    return res.json({ reply });
  } catch (err: unknown) { // unknown con captura segura (Regla 6 SQA)
    console.error('Error in /api/chat:', err);
    return res.status(500).json({
      error: 'Error procesando la consulta en el servidor',
      details: err instanceof Error ? err.message : 'Error desconocido',
    });
  }
});

// Guardián JSON 404 para cualquier ruta /api/* no registrada (evita caer en el catch-all HTML de la SPA)
app.use('/api', (_req, res) => {
  return res.status(404).json({ error: 'Endpoint de API no encontrado' });
});

// Start Express Server with Vite integration
async function startServer() {
  // Regla 5 SSD (CRUSE-APO-2026-005 A.1): sin secretos válidos el servidor no arranca
  try {
    const env = loadServerEnv();
    console.log(`[Seguridad] Secretos validados (KEK vigente v${env.kekCurrentVersion}, ${env.keks.size} versión(es) cargadas).`);
  } catch (err) {
    console.error(err instanceof ServerEnvError ? `ALERTA FATAL: ${err.message}` : err);
    process.exit(1);
  }

  try {
    console.log('[Base de Datos] Verificando esquema relacional y triggers WORM...');
    const migrationStatus = await runMigrations();
    console.log(`[Base de Datos] Migraciones aplicadas: ${migrationStatus.appliedCount}, Omitidas con checksum verificado: ${migrationStatus.skippedCount}`);
  } catch (err) {
    console.error('ALERTA FATAL: Fallo al aplicar migraciones relacionales:', err);
    process.exit(1);
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Cruse Fintech Portal] Servidor escuchando en http://localhost:${PORT}`);
    console.log(`[Seguridad] Modo Zero-PII, Cifrado Envelope y WORM Nativo Activo`);
  });
}

startServer();

