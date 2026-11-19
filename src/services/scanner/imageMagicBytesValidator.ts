/**
 * VALIDADOR DE MAGIC BYTES PARA CARGA OCR DE IMÁGENES — CRUSE-APO-2026-072 (Guardrail 3)
 *
 * - Solo valida cuando `imageBase64` no está vacío (preserva flujo `fallbackExtractedStrings`).
 * - Acepta exclusivamente firmas binarias oficiales:
 *   * JPEG: FF D8 FF
 *   * PNG:  89 50 4E 47 0D 0A 1A 0A
 *   * WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
 */

export type ValidImageFormat = 'jpeg' | 'png' | 'webp';

export interface ImageMagicBytesValidationResult {
  valid: boolean;
  skippedEmpty?: boolean;
  detectedFormat?: ValidImageFormat;
  error?: string;
}

const DATA_URL_PREFIX_RE = /^data:([^;,]+);base64,/i;

export function validateImageBase64MagicBytes(rawInput: string): ImageMagicBytesValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: true, skippedEmpty: true };
  }

  const base64Payload = trimmed.replace(DATA_URL_PREFIX_RE, '').replace(/\s+/g, '');
  if (!base64Payload || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Payload)) {
    return {
      valid: false,
      error: 'El payload de imagen no contiene Base64 válido.',
    };
  }

  // Decodificar solo los primeros 24 caracteres Base64 (hasta 18 bytes) para inspeccionar magic bytes
  const headBytes = Buffer.from(base64Payload.slice(0, 24), 'base64');
  if (headBytes.length < 12) {
    return {
      valid: false,
      error: 'El archivo de imagen es demasiado pequeño o está corrupto.',
    };
  }

  // JPEG: FF D8 FF
  if (headBytes[0] === 0xff && headBytes[1] === 0xd8 && headBytes[2] === 0xff) {
    return { valid: true, detectedFormat: 'jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    headBytes[0] === 0x89 &&
    headBytes[1] === 0x50 &&
    headBytes[2] === 0x4e &&
    headBytes[3] === 0x47 &&
    headBytes[4] === 0x0d &&
    headBytes[5] === 0x0a &&
    headBytes[6] === 0x1a &&
    headBytes[7] === 0x0a
  ) {
    return { valid: true, detectedFormat: 'png' };
  }

  // WebP: 52 49 46 46 (RIFF) en 0..3 y 57 45 42 50 (WEBP) en 8..11
  if (
    headBytes[0] === 0x52 &&
    headBytes[1] === 0x49 &&
    headBytes[2] === 0x46 &&
    headBytes[3] === 0x46 &&
    headBytes[8] === 0x57 &&
    headBytes[9] === 0x45 &&
    headBytes[10] === 0x42 &&
    headBytes[11] === 0x50
  ) {
    return { valid: true, detectedFormat: 'webp' };
  }

  return {
    valid: false,
    error: 'Formato binario no permitido. Solo se aceptan imágenes válidas JPEG, PNG o WebP.',
  };
}
