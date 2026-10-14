/**
 * ANALIZADOR DE CALIDAD DE FOTOGRAMAS EN TIEMPO REAL — CANVAS CLIENT-SIDE
 *
 * Micro-servicio liviano (< 3 KB) para ejecución en PWA sin impactar el LCP inicial (OBS-1):
 * - Varianza del Laplaciano para detección de desenfoque (Blur).
 * - Muestreo de luminancia para detectar oscuridad o reflejos intensos.
 * - Conteo ortogonal de gradientes para verificar alineación de la tarjeta con el visor.
 */

import { IneQualityFlags } from '../../types';
import { DEFAULT_QUALITY_THRESHOLDS, IneQualityThresholds } from './ineCaptureQualityConfig';

/**
 * Calcula la varianza del Laplaciano sobre la luminancia de los píxeles.
 * Valores mayores indican bordes nítidos y texto legible.
 */
export function calculateLaplacianVariance(
  data: Uint8ClampedArray,
  width: number,
  height: number
): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  const step = 3; // Muestreo optimizado para móviles (GPU/CPU friendly)

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const idx = (y * width + x) * 4;
      const center = data[idx]!;
      const left = data[(y * width + (x - 1)) * 4]!;
      const right = data[(y * width + (x + 1)) * 4]!;
      const top = data[((y - 1) * width + x) * 4]!;
      const bottom = data[((y + 1) * width + x) * 4]!;

      // Convolución discreta del kernel laplaciano [0, 1, 0; 1, -4, 1; 0, 1, 0]
      const lap = Math.abs(4 * center - left - right - top - bottom);
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/**
 * Evalúa las banderas de calidad de un frame capturado en el elemento Canvas.
 */
export function evaluateIneFrameQuality(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  thresholds: IneQualityThresholds = DEFAULT_QUALITY_THRESHOLDS
): IneQualityFlags {
  let totalBrightness = 0;
  let samples = 0;
  const stride = 6; // Submuestreo para alta tasa de refresco a 30fps

  for (let i = 0; i < data.length; i += 4 * stride) {
    // Luminancia estándar BT.601
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
    samples++;
  }

  const avgBrightness = samples > 0 ? totalBrightness / samples : 0;
  const laplacianScore = calculateLaplacianVariance(data, width, height);

  // Estimación de bordes e inclinación
  let horizontalEdges = 0;
  let verticalEdges = 0;
  for (let y = 1; y < height - 1; y += 6) {
    for (let x = 1; x < width - 1; x += 6) {
      const left = data[(y * width + (x - 1)) * 4]!;
      const right = data[(y * width + (x + 1)) * 4]!;
      const top = data[((y - 1) * width + x) * 4]!;
      const bottom = data[((y + 1) * width + x) * 4]!;

      if (Math.abs(right - left) > 35) horizontalEdges++;
      if (Math.abs(bottom - top) > 35) verticalEdges++;
    }
  }

  const edgeRatio = verticalEdges > 0 ? horizontalEdges / verticalEdges : 1.0;

  const isBlur = laplacianScore < thresholds.blurLaplacianMin;
  const isTooDark = avgBrightness < thresholds.brightnessMin;
  const isTooBright = avgBrightness > thresholds.brightnessMax;
  const isTilted = edgeRatio < thresholds.tiltMin || edgeRatio > thresholds.tiltMax;

  const isAcceptable = !isBlur && !isTooDark && !isTooBright && !isTilted;

  // Generación de retroalimentación en tiempo real para el promotor
  let feedbackText = 'Enfoca la credencial dentro del marco guía';
  if (isTooDark) {
    feedbackText = '⚠️ Demasiada sombra: Acércate a la luz';
  } else if (isTooBright) {
    feedbackText = '⚠️ Reflejo detectado: Evita el flash o brillo directo';
  } else if (isTilted) {
    feedbackText = '⚠️ Alinea la INE recta con las esquinas';
  } else if (isBlur) {
    feedbackText = '⚠️ Movimiento detectado: Mantén el teléfono firme';
  } else if (isAcceptable) {
    feedbackText = '✅ Encuadre óptimo: Listo para captura';
  }

  return {
    isBlur,
    isTooDark,
    isTooBright,
    isTilted,
    isAcceptable,
    laplacianScore: Math.round(laplacianScore),
    avgBrightness: Math.round(avgBrightness),
    edgeRatio: Number(edgeRatio.toFixed(2)),
    feedbackText,
  };
}
