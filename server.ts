import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { COMPANY_INFO } from './src/data/cruseData';
import { privateApiRouter } from './src/services/api/privateApi';
import { chatRouter, GROQ_MODEL } from './src/services/api/chatRouter';
import { runMigrations } from './src/services/db/migrationRunner';
import { loadServerEnv, ServerEnvError } from './src/config/serverEnv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '5mb' }));

// Healthcheck
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    company: COMPANY_INFO.name,
    aiModel: GROQ_MODEL,
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
