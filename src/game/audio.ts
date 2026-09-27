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
}

export const audio = new AudioManager();
