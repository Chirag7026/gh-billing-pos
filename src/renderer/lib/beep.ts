// Web Audio "item not found" alert: 800Hz square wave, admin-set duration.
let ctx: AudioContext | null = null;

export function beepNotFound(durationSec = 1.5) {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 800;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + Math.min(5, Math.max(0.1, Number(durationSec) || 1.5)));
  } catch {
    /* audio unavailable — non-fatal */
  }
}
