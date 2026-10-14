/**
 * LLAVERO CRIPTOGRÁFICO DE SERVIDOR — CRUSE-APO-2026-005 (Bloque A.1)
 *
 * Construye, de forma perezosa, el KMS y la llave de Blind Index a partir de
 * serverEnv. Los servicios de servidor obtienen las llaves exclusivamente por aquí.
 * Exclusivo de servidor: NUNCA importar desde componentes React.
 */

import { getServerEnv } from '../../config/serverEnv';
import { LocalKmsProvider, KmsProvider, computeBlindIndex } from './cryptoService';

let kmsInstance: LocalKmsProvider | null = null;

export function getServerKms(): KmsProvider {
  if (!kmsInstance) {
    const env = getServerEnv();
    kmsInstance = new LocalKmsProvider(env.keks, env.kekCurrentVersion);
  }
  return kmsInstance;
}

/**
 * Índice ciego HMAC-SHA256 con la llave del entorno validado.
 */
export function computeServerBlindIndex(input: string): Promise<string> {
  return computeBlindIndex(input, getServerEnv().blindIndexKey);
}
