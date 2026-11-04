/** A two-note chime for a new deal. The audio context needs a click first, so `unlock` on any. */
export class Chime {
  private ctx: AudioContext | null = null;

  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* no audio */ }
  }

  play(): void {
    const a = this.ctx;
    if (!a) return;
    const t = a.currentTime;
    for (const [f, dt] of [[880, 0], [1320, 0.13]] as const) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.25, t + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.16);
      o.connect(g).connect(a.destination);
      o.start(t + dt); o.stop(t + dt + 0.18);
    }
  }
}
