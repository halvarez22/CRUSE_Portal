/**
 * SINTETIZADOR DE SONIDO DE OBTURADOR DE CÁMARA (WEB AUDIO API)
 *
 * Provee retroalimentación auditiva inmediata al promotor al capturar un documento (Regla 4: U-First).
 * Totalmente sintetizado en memoria con oscilador y filtro; cero descargas de audio externas.
 */

export function playCameraShutterSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Primer chasquido (apertura del obturador)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(800, now);
    osc1.frequency.exponentialRampToValueAtTime(120, now + 0.04);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.04);

    // Segundo chasquido (cierre del obturador mecánico)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(600, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(80, now + 0.09);
    gain2.gain.setValueAtTime(0.35, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.09);
  } catch {
    // Si el usuario no ha interactuado aún o el navegador bloquea audio, silenciar sin error
  }
}
