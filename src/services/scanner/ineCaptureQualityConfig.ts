/**
 * CONFIGURACIÓN DE UMBRALES DE CALIDAD DE CAPTURA EN VIVO — INE & DOCUMENTOS
 */

export interface IneQualityThresholds {
  blurLaplacianMin: number;
  brightnessMin: number;
  brightnessMax: number;
  tiltMin: number;
  tiltMax: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: IneQualityThresholds = {
  blurLaplacianMin: 85,   // Umbral de nitidez (Varianza del Laplaciano)
  brightnessMin: 55,      // Penumbra / oscuridad excesiva
  brightnessMax: 215,     // Sobreexposición / reflejos de plástico o flash
  tiltMin: 0.65,          // Límite inferior relación de aspecto
  tiltMax: 1.55,          // Límite superior relación de aspecto
};
