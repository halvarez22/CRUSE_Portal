import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { COMPANY_INFO } from './src/data/cruseData';
import { privateApiRouter } from './src/services/api/privateApi';
import { chatRouter, GROQ_MODEL } from './src/services/api/chatRouter';
import { runMigrations } from './src/services/db/migrationRunner';
import { loadServerEnv, ServerEnvError } from './src/config/serverEnv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Guardrail 1 (CRUSE-APO-2026-072): Cabeceras HTTP de Seguridad OWASP ASVS sin romper escáner PWA
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '5mb' }));

declare const __GIT_COMMIT__: string | undefined;
declare const __BUILD_TIMESTAMP__: string | undefined;

const RELEASE_EXPEDIENTE = 'CRUSE-APO-2026-072';
const BUILD_COMMIT = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : 'local-dev';
const BUILD_TIMESTAMP =
  typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : new Date().toISOString();

// Healthcheck (Guardrail 3 APO-068 / Guardrail 4 APO-069: máximo 8 campos, cero secretos)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    company: COMPANY_INFO.name,
    aiModel: GROQ_MODEL,
    timestamp: new Date().toISOString(),
    releaseExpediente: RELEASE_EXPEDIENTE,
    buildCommit: BUILD_COMMIT,
    buildTimestamp: BUILD_TIMESTAMP,
    phase3Active: true,
  });
});

// Guardrail 4 Permanente (CRUSE-APO-2026-071): Prueba criptográfica pública del binario en ejecución sin credenciales Kudu
app.get('/api/build-proof', (_req, res) => {
  const serverBundlePath = path.join(process.cwd(), 'dist', 'server.cjs');
  let serverCjsSha256 = 'UNAVAILABLE_IN_DEV_TSX';
  let serverCjsBytes = 0;
  try {
    if (fs.existsSync(serverBundlePath)) {
      const buf = fs.readFileSync(serverBundlePath);
      serverCjsBytes = buf.length;
      serverCjsSha256 = crypto.createHash('sha256').update(buf).digest('hex');
    }
  } catch {
    serverCjsSha256 = 'READ_ERROR';
  }
  res.json({
    releaseExpediente: RELEASE_EXPEDIENTE,
    buildCommit: BUILD_COMMIT,
    buildTimestamp: BUILD_TIMESTAMP,
    serverCjsSha256,
    serverCjsBytes,
    verificationMethod: 'Runtime SHA-256 of dist/server.cjs on Azure host (zero Kudu credentials required)',
    timestamp: new Date().toISOString(),
  });
});

// Montar router modular del Asistente Inteligente IA 24/7 (Zero-PII LFPDPPP)
app.use('/api/chat', chatRouter);

// Montar endpoints seguros de la API privada (2FA, Auditoría Forense y Sincronización)
app.use('/api', privateApiRouter);

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
    const { createServer: createViteServer } = await import('vite');
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
