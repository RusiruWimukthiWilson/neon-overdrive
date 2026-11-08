import { clamp } from './util';

type Engine = {
  o1: OscillatorNode;
  o2: OscillatorNode;
  o3: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  nf: BiquadFilterNode;
  ng: GainNode;
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const MUSIC_VOL = 0.3;

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private eng: Engine | null = null;
  sfxOn = true;
  musicOn = true;
  private musicTimer: number | null = null;
  private musicWanted = false;
  private nextNote = 0;
  private step = 0;

  unlock() {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.musicWanted) this.startMusic();
  }

  private build() {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? MUSIC_VOL : 0;
    this.musicBus.connect(this.master);

    const len = Math.floor(ctx.sampleRate * 1.5);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.detune.value = 9;
    const o3 = ctx.createOscillator();
    o3.type = 'square';
    const g3 = ctx.createGain();
    g3.gain.value = 0.35;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 5;
    filter.frequency.value = 600;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    o1.connect(filter);
    o2.connect(filter);
    o3.connect(g3);
    g3.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    const ns = ctx.createBufferSource();
    ns.buffer = this.noiseBuf;
    ns.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 500;
    nf.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.value = 0;
    ns.connect(nf);
    nf.connect(ng);
    ng.connect(this.sfx);
    o1.start();
    o2.start();
    o3.start();
    ns.start();
    this.eng = { o1, o2, o3, filter, gain, nf, ng };
  }

  /** sp = speed ratio (0..1.45). rev > 0 overrides rpm (countdown revving). */
  setEngine(sp: number, active: boolean, nitro: boolean, offroad: boolean, rev = 0) {
    if (!this.ctx || !this.eng) return;
    const t = this.ctx.currentTime;
    const gears = [0, 0.22, 0.42, 0.62, 0.82, 1.05, 1.6];
    let gear = 0;
    while (gear < gears.length - 2 && sp > gears[gear + 1]) gear++;
    const rpm = rev > 0 ? rev : clamp((sp - gears[gear]) / (gears[gear + 1] - gears[gear]), 0, 1);
    const f = 46 + rpm * 95 + gear * 10 + (nitro ? 28 : 0);
    const e = this.eng;
    e.o1.frequency.setTargetAtTime(f, t, 0.04);
    e.o2.frequency.setTargetAtTime(f * 1.005, t, 0.04);
    e.o3.frequency.setTargetAtTime(f / 2, t, 0.04);
    e.filter.frequency.setTargetAtTime(350 + rpm * 1400 + sp * 900 + (nitro ? 900 : 0), t, 0.05);
    e.gain.gain.setTargetAtTime(active ? 0.07 + Math.min(sp, 1.4) * 0.035 : 0, t, 0.08);
    e.nf.frequency.setTargetAtTime(offroad ? 260 : 900 + sp * 1600, t, 0.1);
    e.ng.gain.setTargetAtTime(active ? (offroad ? 0.24 : sp * sp * 0.035) : 0, t, 0.08);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide?: number, delay = 0, bus?: GainNode) {
    const ctx = this.ctx;
    if (!ctx || (!bus && !this.sfxOn)) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, type: BiquadFilterType, f0: number, f1?: number, q = 1, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxOn) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(t, Math.random() * 0.8);
    s.stop(t + dur + 0.05);
  }

  crash(heavy = false) {
    this.noise(0.7, 0.75, 'lowpass', 2800, 150, 0.7);
    this.tone(150, 0.45, 'sine', 0.6, 38);
    this.tone(260 + Math.random() * 180, 0.18, 'square', 0.12, 70);
    if (heavy) this.noise(0.3, 0.4, 'highpass', 2500, 6000, 0.5, 0.02);
  }
  smash() {
    this.noise(0.4, 0.55, 'bandpass', 2600, 300, 0.7);
    this.tone(95, 0.35, 'sine', 0.55, 35);
    this.tone(1400, 0.1, 'square', 0.08, 2600, 0.02);
    this.tone(1900, 0.2, 'triangle', 0.1, undefined, 0.07);
  }
  nearMiss(combo: number) {
    this.noise(0.35, 0.42, 'bandpass', 500, 3500, 2.5);
    const f = 520 * Math.pow(2, Math.min(combo, 12) / 12);
    this.tone(f, 0.1, 'triangle', 0.12, undefined, 0.04);
    this.tone(f * 1.5, 0.14, 'triangle', 0.1, undefined, 0.1);
  }
  pickup(streak: number) {
    const f = 880 * Math.pow(2, Math.min(streak, 14) / 12);
    this.tone(f, 0.07, 'square', 0.06);
    this.tone(f * 2, 0.12, 'triangle', 0.09, undefined, 0.04);
  }
  nitro() {
    this.noise(1.0, 0.45, 'bandpass', 250, 3200, 1.4);
    this.tone(55, 0.7, 'sawtooth', 0.18, 160);
    this.tone(880, 0.25, 'triangle', 0.08, 1760, 0.05);
  }
  checkpoint() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.16, 'square', 0.1, undefined, i * 0.075));
    this.tone(1046.5, 0.6, 'triangle', 0.14, undefined, 0.3);
    this.tone(1318.5, 0.6, 'triangle', 0.1, undefined, 0.3);
  }
  beep(go: boolean) {
    this.tone(go ? 880 : 440, go ? 0.55 : 0.18, 'square', 0.14);
    if (go) this.tone(1760, 0.4, 'triangle', 0.06);
  }
  tick() {
    this.tone(1600, 0.05, 'square', 0.07);
  }
  rumble() {
    this.tone(62, 0.09, 'square', 0.12, 45);
  }
  comboLost() {
    this.tone(320, 0.22, 'triangle', 0.08, 140);
  }
  timeUp() {
    [659, 523, 415, 330].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.16, undefined, i * 0.16));
    this.tone(110, 0.9, 'sawtooth', 0.08, 55, 0.1);
  }
  fanfare() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 0.22, 'square', 0.08, undefined, 0.5 + i * 0.09));
  }
  click() {
    this.tone(1100, 0.05, 'square', 0.05);
  }

  /* ------------------------------------------------------------ music */
  setMusic(want: boolean) {
    this.musicWanted = want;
    if (want) this.startMusic();
    else this.stopMusic();
  }
  setSfxOn(on: boolean) {
    this.sfxOn = on;
    if (this.ctx && this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }
  setMusicOn(on: boolean) {
    this.musicOn = on;
    if (this.ctx && this.musicBus) this.musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, this.ctx.currentTime, 0.05);
    if (on && this.musicWanted) this.startMusic();
    if (!on) this.stopMusic();
  }
  duck(k: number) {
    if (this.ctx && this.musicBus && this.musicOn) this.musicBus.gain.setTargetAtTime(MUSIC_VOL * k, this.ctx.currentTime, 0.15);
  }
  suspend() {
    this.stopMusic();
    this.ctx?.suspend().catch(() => {});
  }
  resume() {
    if (!this.ctx) return;
    this.ctx.resume().catch(() => {});
    if (this.musicWanted) this.startMusic();
  }

  private startMusic() {
    if (!this.ctx || this.musicTimer !== null || !this.musicOn) return;
    this.nextNote = this.ctx.currentTime + 0.08;
    this.musicTimer = window.setInterval(() => this.schedule(), 25);
  }
  private stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const spb = 60 / 112 / 4;
    if (this.nextNote < ctx.currentTime - 0.2) this.nextNote = ctx.currentTime + 0.05;
    while (this.nextNote < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextNote, spb);
      this.nextNote += spb;
      this.step = (this.step + 1) % 128;
    }
  }
  private playStep(step: number, t: number, spb: number) {
    const bar = Math.floor(step / 16) % 8;
    const s = step % 16;
    const prog = [
      [45, 52, 57, 60, 64],
      [41, 48, 53, 57, 60],
      [36, 43, 48, 52, 55],
      [43, 50, 55, 59, 62],
    ];
    const ch = prog[Math.floor(bar / 2) % 4];
    if (s % 2 === 0) this.mNote(midi(ch[0] - 12 + (s % 4 === 2 ? 12 : 0)), t, spb * 1.7, 'sawtooth', 0.32, 650);
    if (s % 4 === 0) this.mKick(t);
    if (s === 4 || s === 12) this.mSnare(t);
    if (s % 2 === 1) this.mHat(t);
    const arp = [ch[2], ch[3], ch[4], ch[3]];
    this.mNote(midi(arp[s % 4] + 12), t, spb * 0.9, 'square', 0.05, 2600);
    if (s === 0 && bar % 2 === 0) {
      for (const n of [ch[2], ch[3], ch[4]]) this.mPad(midi(n), t, spb * 32);
    }
  }
  private mNote(f: number, t: number, dur: number, type: OscillatorType, vol: number, lp: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl);
    fl.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private mPad(f: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 1300;
    fl.connect(g);
    g.connect(this.musicBus);
    for (const det of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(fl);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
  private mKick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.3);
  }
  private mSnare(t: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    s.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    s.start(t, Math.random());
    s.stop(t + 0.22);
    this.tone(190, 0.1, 'triangle', 0.2, 120, t - ctx.currentTime, this.musicBus);
  }
  private mHat(t: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    s.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    s.start(t, Math.random());
    s.stop(t + 0.06);
  }
}
