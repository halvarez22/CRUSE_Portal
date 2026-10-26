async function fetchRoute(path: string, method: string) {
  const res = await fetch(`http://localhost:3000${path}`, { method });
  return res.status;
}

async function main() {
  console.log('=== VERIFICACIÓN A.4 (Routing Modular) ===');
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
}

main().catch(err => {
  console.error('\n❌ ERROR FATAL:', err.message);
  process.exit(1);
});
