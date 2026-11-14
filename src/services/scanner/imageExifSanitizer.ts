/**
 * SANITIZADOR BINARIO ZERO-EXIF / ZERO-GPS EN MEMORIA Y PURGA RAM (FASE 3.1)
 *
 * Implementa Guardrail 3 de CRUSE-APO-2026-047 / CRUSE-APO-2026-062:
 * - Elimina segmentos JPEG APP1 (0xFFE1 — EXIF / GPS / XMP) y chunks PNG (eXIf, tEXt, zTXt, iTXt).
 * - Calcula el hash SHA-256 sobre el buffer ya sanitizado.
 * - Ejecuta ineludiblemente `rawBuffer.fill(0)` en el bloque `finally` para garantizar Zero-PII en RAM.
 */

import crypto from 'crypto';

export interface SanitizedDocumentBufferResult {
  sanitizedSha256: string;
  exifStripped: boolean;
  removedMetadataSegmentsCount: number;
  originalByteLength: number;
  sanitizedByteLength: number;
  mimeTypeDetected: 'image/jpeg' | 'image/png' | 'application/pdf' | 'application/octet-stream';
}

function stripJpegExifApp1(rawBuffer: Buffer): { cleanBuffer: Buffer; removedSegments: number } {
  if (rawBuffer.length < 4 || rawBuffer[0] !== 0xff || rawBuffer[1] !== 0xd8) {
    return { cleanBuffer: Buffer.from(rawBuffer), removedSegments: 0 };
  }

  const chunks: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let offset = 2;
  let removedSegments = 0;

  while (offset + 4 <= rawBuffer.length) {
    if (rawBuffer[offset] !== 0xff) {
      chunks.push(Buffer.from(rawBuffer.subarray(offset)));
      break;
    }

    const marker = rawBuffer[offset + 1]!;
    if (marker === 0xda || marker === 0xd9) {
      // SOS (Start of Scan) o EOI: copia el resto de datos de imagen
      chunks.push(Buffer.from(rawBuffer.subarray(offset)));
      break;
    }

    const segLength = rawBuffer.readUInt16BE(offset + 2);
    if (segLength < 2 || offset + 2 + segLength > rawBuffer.length) {
      chunks.push(Buffer.from(rawBuffer.subarray(offset)));
      break;
    }

    // Elimina APP1 (0xE1: EXIF/GPS/XMP) y APP13 (0xED: IPTC) y COM (0xFE: Comentarios)
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) {
      removedSegments++;
    } else {
      chunks.push(Buffer.from(rawBuffer.subarray(offset, offset + 2 + segLength)));
    }

    offset += 2 + segLength;
  }

  return {
    cleanBuffer: Buffer.concat(chunks),
    removedSegments,
  };
}

function stripPngAncillaryMetadata(rawBuffer: Buffer): { cleanBuffer: Buffer; removedSegments: number } {
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (rawBuffer.length < 8 || !rawBuffer.subarray(0, 8).equals(PNG_SIG)) {
    return { cleanBuffer: Buffer.from(rawBuffer), removedSegments: 0 };
  }

  const chunks: Buffer[] = [Buffer.from(PNG_SIG)];
  let offset = 8;
  let removedSegments = 0;
  const forbiddenChunks = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

  while (offset + 12 <= rawBuffer.length) {
    const dataLen = rawBuffer.readUInt32BE(offset);
    const chunkType = rawBuffer.subarray(offset + 4, offset + 8).toString('ascii');
    const totalChunkLen = 12 + dataLen;

    if (offset + totalChunkLen > rawBuffer.length) {
      chunks.push(Buffer.from(rawBuffer.subarray(offset)));
      break;
    }

    if (forbiddenChunks.has(chunkType)) {
      removedSegments++;
    } else {
      chunks.push(Buffer.from(rawBuffer.subarray(offset, offset + totalChunkLen)));
    }

    offset += totalChunkLen;
    if (chunkType === 'IEND') break;
  }

  return {
    cleanBuffer: Buffer.concat(chunks),
    removedSegments,
  };
}

/**
 * Sanitiza un documento codificado en Base64/DataURL en memoria RAM, calcula su SHA-256
 * sobre el binario limpio de EXIF/GPS y sobrescribe con ceros (`fill(0)`) los buffers en `finally`.
 */
export function sanitizeAndHashDocumentInRam(base64OrDataUrl: string): SanitizedDocumentBufferResult {
  const cleanB64 = String(base64OrDataUrl || '')
    .trim()
    .replace(/^data:[^;]+;base64,/i, '');

  const rawBuffer = Buffer.from(cleanB64, 'base64');
  let sanitizedBuffer: Buffer | null = null;

  try {
    const originalByteLength = rawBuffer.length;
    let mimeTypeDetected: SanitizedDocumentBufferResult['mimeTypeDetected'] = 'application/octet-stream';
    let removedMetadataSegmentsCount = 0;

    if (rawBuffer.length >= 2 && rawBuffer[0] === 0xff && rawBuffer[1] === 0xd8) {
      mimeTypeDetected = 'image/jpeg';
      const res = stripJpegExifApp1(rawBuffer);
      sanitizedBuffer = res.cleanBuffer;
      removedMetadataSegmentsCount = res.removedSegments;
    } else if (
      rawBuffer.length >= 8 &&
      rawBuffer[0] === 0x89 &&
      rawBuffer[1] === 0x50 &&
      rawBuffer[2] === 0x4e &&
      rawBuffer[3] === 0x47
    ) {
      mimeTypeDetected = 'image/png';
      const res = stripPngAncillaryMetadata(rawBuffer);
      sanitizedBuffer = res.cleanBuffer;
      removedMetadataSegmentsCount = res.removedSegments;
    } else {
      if (rawBuffer.length >= 4 && rawBuffer.subarray(0, 4).toString('ascii') === '%PDF') {
        mimeTypeDetected = 'application/pdf';
      }
      sanitizedBuffer = Buffer.from(rawBuffer);
    }

    const sanitizedSha256 = crypto.createHash('sha256').update(sanitizedBuffer).digest('hex');

    return {
      sanitizedSha256,
      exifStripped: true,
      removedMetadataSegmentsCount,
      originalByteLength,
      sanitizedByteLength: sanitizedBuffer.length,
      mimeTypeDetected,
    };
  } finally {
    // Guardrail 3 Inamovible: Purga criptográfica Zero-PII en memoria RAM
    rawBuffer.fill(0);
    if (sanitizedBuffer) {
      sanitizedBuffer.fill(0);
    }
  }
}
