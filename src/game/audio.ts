// ─── Procedural audio (Web Audio API, no assets) ─────────────────────────────
export type MaterialSound = 'stone' | 'dirt' | 'grass' | 'wood' | 'sand' | 'glass' | 'wool' | 'splash' | 'pop' | 'hurt';

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  volume = 0.7;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // pre-generate noise buffer
      const len = this.ctx.sampleRate * 0.4;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private noiseBurst(freq: number, dur: number, vol: number, type: BiquadFilterType = 'bandpass', q = 1.2, pitchDrop = 0.6): void {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuffer || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * pitchDrop), ctx.currentTime + dur);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'square', slideTo?: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  dig(material: MaterialSound): void {
    switch (material) {
      case 'stone': this.noiseBurst(720, 0.09, 0.28, 'bandpass', 1.4, 0.7); break;
      case 'dirt': this.noiseBurst(340, 0.1, 0.3, 'lowpass', 0.8); break;
      case 'grass': this.noiseBurst(520, 0.08, 0.24, 'bandpass', 0.9); break;
      case 'wood': this.noiseBurst(440, 0.08, 0.3, 'bandpass', 2.2); break;
      case 'sand': this.noiseBurst(1400, 0.09, 0.2, 'highpass', 0.7); break;
      case 'glass': this.noiseBurst(2400, 0.12, 0.26, 'highpass', 2); break;
      case 'wool': this.noiseBurst(260, 0.1, 0.22, 'lowpass'); break;
      default: this.noiseBurst(600, 0.09, 0.25);
    }
  }

  breakBlock(material: MaterialSound): void {
    this.dig(material);
    setTimeout(() => this.dig(material), 45);
  }

  place(material: MaterialSound): void {
    this.dig(material);
  }

  step(material: MaterialSound): void {
    const v = 0.11;
    switch (material) {
      case 'stone': this.noiseBurst(600, 0.05, v, 'bandpass', 1.2); break;
      case 'sand': this.noiseBurst(1600, 0.05, v * 0.8, 'highpass'); break;
      case 'wood': this.noiseBurst(420, 0.05, v, 'bandpass', 2); break;
      default: this.noiseBurst(380, 0.05, v, 'lowpass');
    }
  }

  pop(): void {
    this.tone(620, 0.07, 0.18, 'square', 980);
  }

  /** XP orb absorb — rising chirp */
  orb(): void {
    this.tone(880 + Math.random() * 240, 0.09, 0.14, 'sine', 1500);
  }

  /** achievement unlock — bright two-note fanfare */
  achievement(): void {
    this.tone(660, 0.12, 0.2, 'square', 660);
    window.setTimeout(() => this.tone(990, 0.22, 0.2, 'square', 990), 110);
  }

  hurt(): void {
    this.tone(240, 0.18, 0.3, 'sawtooth', 110);
    this.noiseBurst(300, 0.15, 0.2, 'lowpass');
  }

  splash(): void {
    this.noiseBurst(900, 0.3, 0.3, 'lowpass', 0.6, 0.3);
  }

  click(): void {
    this.tone(320, 0.06, 0.22, 'square', 220);
  }

  resume(): void {
    this.ensure();
  }

  // ── mob sounds ─────────────────────────────────────────────────────────────
  private withDistance(vol: number, dist: number): number {
    return vol * Math.max(0.12, 1 - dist / 20);
  }

  mobAmbient(kind: string, dist = 5): void {
    const v = this.withDistance(0.16, dist);
    if (v <= 0.01) return;
    switch (kind) {
      case 'oink': this.tone(280 + Math.random() * 80, 0.12, v, 'square', 190); break;
      case 'moo': this.tone(150 + Math.random() * 30, 0.45, v * 1.2, 'sawtooth', 95); break;
      case 'baa': this.tone(240, 0.32, v, 'square', 200); setTimeout(() => this.tone(210, 0.25, v * 0.8, 'square', 180), 140); break;
      case 'cluck': this.tone(520 + Math.random() * 200, 0.07, v, 'square', 700); break;
      case 'groan': this.tone(95 + Math.random() * 25, 0.65, v * 1.3, 'sawtooth', 68); this.noiseBurst(220, 0.5, v * 0.5, 'lowpass'); break;
      case 'rattle': this.noiseBurst(1800, 0.14, v * 0.8, 'highpass', 3); setTimeout(() => this.noiseBurst(1400, 0.12, v * 0.6, 'highpass', 3), 110); break;
      case 'spider': this.noiseBurst(2400, 0.16, v * 0.7, 'bandpass', 4, 0.8); setTimeout(() => this.noiseBurst(2000, 0.1, v * 0.5, 'bandpass', 4, 0.8), 130); break;
      case 'enderman': this.tone(210 + Math.random() * 40, 0.5, v * 0.9, 'sine', 130); this.noiseBurst(700, 0.35, v * 0.3, 'bandpass', 6, 0.5); break;
      case 'hiss': break; // creepers are silent until fuse
    }
  }

  mobHurt(kind: string): void {
    const v = 0.24;
    switch (kind) {
      case 'oink': this.tone(340, 0.1, v, 'square', 240); break;
      case 'moo': this.tone(170, 0.3, v, 'sawtooth', 110); break;
      case 'baa': this.tone(260, 0.25, v, 'square', 190); break;
      case 'cluck': this.tone(680, 0.09, v, 'square', 420); break;
      case 'groan': this.tone(110, 0.4, v * 1.2, 'sawtooth', 75); break;
      case 'rattle': this.noiseBurst(2000, 0.18, v, 'highpass', 2.5); break;
      case 'hiss': this.noiseBurst(900, 0.2, v, 'bandpass', 1.5); break;
      case 'spider': this.noiseBurst(2600, 0.18, v, 'bandpass', 3, 0.6); break;
      case 'enderman': this.tone(320, 0.3, v, 'sine', 90); this.noiseBurst(900, 0.25, v * 0.5, 'bandpass', 5, 0.4); break;
    }
  }

  zombieAttack(): void {
    this.noiseBurst(300, 0.18, 0.3, 'lowpass', 0.8);
    this.tone(130, 0.22, 0.24, 'sawtooth', 85);
  }

  fuseHiss(): void {
    this.noiseBurst(2600, 1.4, 0.3, 'highpass', 0.8, 1.4);
  }

  boom(): void {
    this.noiseBurst(120, 0.9, 0.6, 'lowpass', 0.5, 0.25);
    this.tone(70, 0.7, 0.5, 'sine', 28);
  }

  bowShoot(dist = 5): void {
    const v = this.withDistance(0.3, dist);
    this.noiseBurst(1200, 0.1, v, 'bandpass', 2, 0.4);
    this.tone(400, 0.08, v * 0.5, 'square', 700);
  }

  /** enderman warp: eerie descending warble */
  enderTeleport(): void {
    this.tone(900, 0.35, 0.22, 'sine', 140);
    this.tone(620, 0.3, 0.14, 'sawtooth', 110);
    this.noiseBurst(1500, 0.3, 0.14, 'bandpass', 6, 0.15);
  }

  /** enderman provoked screech (stared at) */
  enderStare(): void {
    this.tone(480, 0.55, 0.26, 'sawtooth', 1150);
    this.noiseBurst(2200, 0.5, 0.2, 'bandpass', 3, 1.6);
    setTimeout(() => this.tone(1150, 0.4, 0.18, 'sawtooth', 420), 160);
  }

  /** XP level-up: bright rising two-note */
  levelUp(): void {
    this.tone(520, 0.1, 0.2, 'square', 520);
    setTimeout(() => this.tone(780, 0.28, 0.22, 'square', 780), 110);
    setTimeout(() => this.tone(1170, 0.2, 0.14, 'sine', 1170), 240);
  }

  eat(): void {
    this.noiseBurst(500, 0.09, 0.24, 'lowpass', 1);
    setTimeout(() => this.noiseBurst(450, 0.09, 0.22, 'lowpass', 1), 160);
    setTimeout(() => this.noiseBurst(520, 0.1, 0.2, 'lowpass', 1), 320);
  }

  burp(): void {
    this.tone(140, 0.25, 0.3, 'sawtooth', 70);
  }

  /** arrow sticking into a block */
  arrowHit(): void {
    this.noiseBurst(2400, 0.07, 0.16, 'highpass', 1);
    this.tone(900, 0.05, 0.08, 'square', 300);
  }

  /** bow string pull creak (called while charging, throttled by caller) */
  bowDraw(): void {
    this.noiseBurst(300, 0.18, 0.05, 'bandpass', 4, 1.3);
  }

  // ─── weather ────────────────────────────────────────────────────────────────
  private rainSrc: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;

  /** start looping rain noise (idempotent) */
  startRain(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer || this.rainSrc) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 900;
    const filter2 = ctx.createBiquadFilter();
    filter2.type = 'lowpass';
    filter2.frequency.value = 4200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 2.5); // fade in
    src.connect(filter).connect(filter2).connect(g).connect(this.master);
    src.start();
    this.rainSrc = src;
    this.rainGain = g;
  }

  stopRain(): void {
    if (!this.rainSrc || !this.rainGain || !this.ctx) return;
    const g = this.rainGain;
    const src = this.rainSrc;
    g.gain.cancelScheduledValues(this.ctx.currentTime);
    g.gain.setValueAtTime(g.gain.value, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.2);
    setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, 1400);
    this.rainSrc = null;
    this.rainGain = null;
  }

  /** thunder rumble + crack (distance 0..1, 0 = close) */
  thunder(dist = 0.3): void {
    const close = 1 - Math.min(1, dist);
    // crack when close
    if (close > 0.55) {
      this.noiseBurst(3000, 0.18, 0.4 * close, 'highpass', 1);
    }
    // rumble always (delayed for far strikes)
    const delay = Math.round(dist * 1200);
    setTimeout(() => {
      this.noiseBurst(90, 2.6, 0.45 * (0.35 + close * 0.65), 'lowpass', 0.4, 0.85);
      this.tone(46, 2.2, 0.3 * (0.3 + close * 0.7), 'sine', 24);
    }, delay);
  }
}

export const audio = new AudioManager();
