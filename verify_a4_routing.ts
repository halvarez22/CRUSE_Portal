import { spawn } from 'child_process';

async function fetchRoute(path: string, method: string) {
  const res = await fetch(`http://localhost:3000${path}`, { method });
  return res.status;
}

async function main() {
  console.log('=== VERIFICACIÓN A.4 (Routing Modular) ===');
  
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const server = spawn(npxCmd, ['dotenvx', 'run', '--', npxCmd, 'tsx', 'server.ts'], {
    env: { ...process.env, NODE_ENV: 'development' },
    shell: true
  });

  await new Promise<void>((resolve, reject) => {
    let started = false;
    server.stdout.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('escuchando en')) {
        started = true;
        resolve();
      }
    });
    server.stderr.on('data', (data) => {
      // ignore
    });
    setTimeout(() => {
      if (!started) reject(new Error('Timeout esperando al servidor'));
    }, 10000);
  });

  try {
    console.log('Servidor levantado. Probando endpoints extraídos:\n');
    
    const endpoints = [
      { path: '/api/expedientes', method: 'GET' },
      { path: '/api/promotores/secure', method: 'POST' },
      { path: '/api/audit/events', method: 'GET' },
      { path: '/api/audit/verify', method: 'GET' },
    ];

    let success = true;
    for (const ep of endpoints) {
      const status = await fetchRoute(ep.path, ep.method);
      console.log(`[${ep.method}] ${ep.path.padEnd(25)} -> HTTP ${status}`);
      if (status !== 401) {
        console.error(`❌ FALLO: Se esperaba 401 Unauthorized, se obtuvo ${status}`);
        success = false;
      }
    }

    if (success) {
      console.log('\n✅ ÉXITO: Los nuevos routers modulares responden y protegen sus rutas con requireAuth (401).');
    } else {
      throw new Error('Validación de rutas fallida.');
    }
  } finally {
    server.kill();
  }
}

main().catch(err => {
  console.error('\n❌ ERROR FATAL:', err.message);
  process.exit(1);
});
