/**
 * COMPILADOR DE SERVIDOR CON INYECCIÓN DETERMINISTA DEL SHA DE GIT (GUARDRAIL 4 APO-069)
 * Inyecta únicamente el SHA corto de `git rev-parse --short HEAD` y el timestamp ISO de build.
 * Cero secretos, cero rutas de filesystem, cero tokens.
 */

import { execSync } from 'node:child_process';

let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  gitSha = 'local-dev';
}

const buildTs = new Date().toISOString();
const cmd = [
  'npx esbuild server.ts',
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--external:vite',
  '--sourcemap',
  '--outfile=dist/server.cjs',
  `--define:__GIT_COMMIT__='"${gitSha}"'`,
  `--define:__BUILD_TIMESTAMP__='"${buildTs}"'`,
].join(' ');

console.log(`[buildServer] Inyectando __GIT_COMMIT__=${gitSha} (__BUILD_TIMESTAMP__=${buildTs})`);
execSync(cmd, { stdio: 'inherit' });
