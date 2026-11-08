import { Sound } from './audio';
import {
  BASE_FOV, CENTRIFUGAL, GATE_OFFSET, KMH, LANE_CENTERS, MAX_SPEED, MAX_TIME, NEAR_MISS_GAP, NITRO_MULT,
  OFFROAD_LIMIT, ORB_W, PLAYER_VIS_W, PLAYER_W, PLAYER_Z, SEGMENT_LENGTH, START_TIME, TRACK_LENGTH,
  TRACK_SEGMENTS, UNIT_TO_KM, X_LIMIT, ZONE_LENGTH, CAR_SKINS
} from './config';
import { FX } from './fx';
import { Input } from './input';
import { LivePalette, ZONES, zoneForStage } from './palettes';
import { Renderer } from './renderer';
import { buildSprites, type SpriteBank } from './sprites';
import { Track, type Orb, type Segment } from './track';
import { Traffic, type Car } from './traffic';
import { approach, clamp, lerp, makeRng, wrap, wrapRel, type RNG } from './util';

const SEG = SEGMENT_LENGTH;

export type Phase = 'loading' | 'title' | 'countdown' | 'racing' | 'paused' | 'timeup' | 'gameover';

export interface HudData {
  score: number;
  mult: number;
  combo: number;
  time: number;
  stage: number;
  zone: string;
  progress: number;
  kmh: number;
  speedPct: number;
  nitro: number;
  nitroOn: boolean;
  nitroReady: boolean;
  cp: number;
  cpExt: number;
  steerL: boolean;
  steerR: boolean;
}

export interface RunStats {
  score: number;
  distance: number;
  topSpeed: number;
  nearMisses: number;
  bestCombo: number;
  smashes: number;
  orbs: number;
  stage: number;
  crashes: number;
  duration: number;
}

export interface GameCallbacks {
  onPhase: (p: Phase) => void;
  onGameOver: (s: RunStats) => void;
  onStartRequest?: () => void;
}

const vibrate = (p: number | number[]) => {
  try {
    if (navigator.vibrate) navigator.vibrate(p);
  } catch {
    /* ignore */
  }
};

async function loadFonts() {
  if (!document.fonts) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('900 40px Orbitron'),
        document.fonts.load('700 20px Orbitron'),
        document.fonts.load('400 40px Monoton'),
      ]),
      new Promise((r) => setTimeout(r, 1800)),
    ]);
  } catch {
    /* ignore */
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Game {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  input = new Input();
  sound = new Sound();
  bank!: SpriteBank;
  track = new Track();
  traffic!: Traffic;
  fx!: FX;
  palette = new LivePalette(ZONES[0]);
  cb: GameCallbacks;
  onHud: ((h: HudData) => void) | null = null;
  phase: Phase = 'loading';
  private pausedFrom: Phase = 'racing';
  private destroyed = false;

  // shop & power-ups
  selectedSkin = typeof window !== 'undefined' ? localStorage.getItem('neon_skin') || 'cyan_blaster' : 'cyan_blaster';
  hasShield = false;
  totalCoins = typeof window !== 'undefined' ? Number(localStorage.getItem('neon_coins') || '0') : 0;

  // world
  position = 0;
  dist = 0;
  playerX = 0;
  speed = 0;
  steer = 0;
  xVel = 0;
  nitro = 0;
  nitroOn = false;
  crashT = 0;
  invulnT = 0;
  spinDir = 1;
  offroad = false;
  braking = false;
  squash = 0;
  time = 0;
  fov = BASE_FOV;
  roll = 0;
  trauma = 0;
  flash = 0;
  flashColor = '#ffffff';
  hitStop = 0;
  sunOff = 0;
  mountOff = 0;
  lowTime = 0;

  // run
  score = 0;
  timeLeft = START_TIME;
  stage = 1;
  mult = 1;
  comboT = 0;
  phaseT = 0;
  private lastBeat = -1;
  private builtUpTo = 2;
  private seed = 1;
  private rng: RNG = makeRng(1);
  private stats = { topSpeed: 0, nearMisses: 0, bestCombo: 1, smashes: 0, orbs: 0, crashes: 0, runTime: 0 };
  private pickupStreak = 0;
  private lastPickupT = -9;
  private cpCount = 0;
  private cpExt = 0;
  private rumbleT = 0;
  private popStack = 0;
  private lastPopT = -9;
  private aiLane = 1;
  private aiThink = 0;
  private dustAcc = 0;
  private flameAcc = 0;
  private smokeAcc = 0;
  quality = 2;
  private raf = 0;
  private last = 0;
  private perfAcc = 0;
  private perfFrames = 0;
  private perfWarm = 0;
  private slowWindows = 0;
  private hud: HudData = {
    score: 0, mult: 1, combo: 0, time: START_TIME, stage: 1, zone: ZONES[0].name, progress: 0, kmh: 0,
    speedPct: 0, nitro: 0, nitroOn: false, nitroReady: false, cp: 0, cpExt: 0, steerL: false, steerR: false,
  };

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.renderer = new Renderer(canvas);
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    this.quality = coarse ? 1 : 2;
  }

  get currentSkin() {
    return CAR_SKINS.find((s) => s.id === this.selectedSkin) || CAR_SKINS[0];
  }

  async init() {
    await loadFonts();
    if (this.destroyed) return;
    this.bank = buildSprites();
    this.traffic = new Traffic(this.track, this.bank);
    this.fx = new FX(this.bank);
    this.input.attach(this.canvas);
    this.input.onGamepadStart = () => this.cb.onStartRequest?.();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVis);
    this.onResize();
    this.setupWorld(true);
    this.setPhase('title');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVis);
    this.sound.setMusic(false);
    this.sound.ctx?.close().catch(() => {});
  }

  private setPhase(p: Phase, keepT = false) {
    this.phase = p;
    if (!keepT) this.phaseT = 0;
    this.cb.onPhase(p);
  }

  private carCount(stage: number) {
    return Math.min(116, 56 + (stage - 1) * 8);
  }

  private setupWorld(attract: boolean) {
    this.seed = (Math.random() * 1e9) | 0;
    this.rng = makeRng(this.seed ^ 0x9e3779b9);
    this.stage = 1;
    this.track.build(0, 1, this.bank, this.seed + 1);
    this.track.build(1, 2, this.bank, this.seed + 2);
    this.builtUpTo = 2;
    this.traffic.clear();
    this.position = 0;
    this.dist = 0;
    this.playerX = 0;
    this.speed = attract ? MAX_SPEED * 0.85 : 0;
    this.steer = 0;
    this.xVel = 0;
    this.nitro = attract ? 0.6 : 0;
    this.nitroOn = false;
    this.crashT = 0;
    this.invulnT = 0;
    this.hasShield = false;
    this.offroad = false;
    this.fov = BASE_FOV;
    this.roll = 0;
    this.trauma = 0;
    this.flash = 0;
    this.hitStop = 0;
    this.sunOff = 0;
    this.mountOff = 0;
    this.lowTime = 0;
    this.palette.set(ZONES[0], true);
    this.traffic.spawn(4, PLAYER_Z, 26 * SEG, 110 * SEG, 1, this.rng);
    this.traffic.spawn(this.carCount(1) - 4, PLAYER_Z, 40 * SEG, TRACK_LENGTH - 20 * SEG, 1, this.rng);
    this.fx.clear();
    this.score = 0;
    this.timeLeft = START_TIME;
    this.mult = 1;
    this.comboT = 0;
    this.stats = { topSpeed: 0, nearMisses: 0, bestCombo: 1, smashes: 0, orbs: 0, crashes: 0, runTime: 0 };
    this.pickupStreak = 0;
    this.cpCount = 0;
    this.cpExt = 0;
    this.aiLane = 1;
  }

  start() {
    if (!this.bank) return;
    this.sound.unlock();
    this.setupWorld(false);
    this.input.reset();
    this.lastBeat = -1;
    this.setPhase('countdown');
    this.sound.setMusic(true);
    this.sound.duck(1);
  }

  pause() {
    if (this.phase !== 'racing' && this.phase !== 'countdown') return;
    this.pausedFrom = this.phase;
    this.setPhase('paused', true);
    this.sound.setEngine(0, false, false, false);
    this.sound.duck(0.35);
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.input.reset();
    this.last = performance.now();
    this.setPhase(this.pausedFrom, true);
    this.sound.duck(1);
  }

  toTitle() {
    if (!this.bank) return;
    this.setupWorld(true);
    this.setPhase('title');
    this.sound.duck(1);
  }

  queueNitro() {
    this.input.queueNitro();
  }

  setSound(sfx: boolean, music: boolean) {
    this.sound.setSfxOn(sfx);
    this.sound.setMusicOn(music);
  }

  unlockAudio() {
    this.sound.unlock();
    if (this.phase === 'title') this.sound.setMusic(true);
  }

  private onResize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.resize(rect.width || window.innerWidth, rect.height || window.innerHeight, this.quality);
    if (this.fx) this.fx.maxParts = [200, 330, 460][this.quality];
  };

  private onBlur = () => {
    if (this.phase === 'racing' || this.phase === 'countdown') this.pause();
  };

  private onVis = () => {
    if (document.hidden) {
      this.pause();
      this.sound.suspend();
    } else {
      this.sound.resume();
      this.last = performance.now();
      this.perfWarm = 1.5;
      this.perfAcc = 0;
      this.perfFrames = 0;
    }
  };

  private loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt <= 0) return;
    if (dt > 0.1) dt = 0.1;
    this.input.pollGamepad();
    if (this.phase === 'paused' || this.phase === 'loading') return;
    this.monitorPerf(dt);
    if (this.hitStop > 0) {
      this.hitStop -= dt;
    } else {
      let rem = dt;
      while (rem > 1e-6) {
        const step = Math.min(rem, 1 / 60);
        this.update(step);
        rem -= step;
      }
    }
    this.updateFx(dt);
    this.renderer.render(this, dt);
    this.emitHud();
    this.updateAudio();
  };

  private monitorPerf(dt: number) {
    if (this.perfWarm < 3) {
      this.perfWarm += dt;
      return;
    }
    this.perfAcc += dt;
    this.perfFrames++;
    if (this.perfAcc >= 2) {
      const avg = this.perfAcc / this.perfFrames;
      this.slowWindows = avg > 1 / 50 ? this.slowWindows + 1 : 0;
      if (this.slowWindows >= 2 && this.quality > 0) {
        this.quality--;
        this.slowWindows = 0;
        this.onResize();
      }
      this.perfAcc = 0;
      this.perfFrames = 0;
    }
  }

  private updateFx(dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.squash = Math.max(0, this.squash - dt * 4);
    this.palette.update(dt);
    this.fx.update(dt);
    const low = this.phase === 'racing' && this.timeLeft <= 10;
    const target = low ? (0.25 + 0.3 * Math.max(0, Math.sin(this.time * Math.PI * 2))) * (1 - this.timeLeft / 14) : 0;
    this.lowTime = approach(this.lowTime, target, dt * 2);
  }

  addShake(a: number) {
    this.trauma = Math.min(1, this.trauma + a);
  }

  private flashScreen(a: number, color: string) {
    this.flash = Math.max(this.flash, a);
    this.flashColor = color;
  }

  private update(dt: number) {
    this.time += dt;
    this.phaseT += dt;

    if (this.phase === 'countdown') {
      const beat = Math.floor(this.phaseT / 0.6);
      if (beat !== this.lastBeat) {
        this.lastBeat = beat;
        if (beat < 3) {
          this.fx.banner(String(3 - beat), '', '#ffe14d', 0.58, 1.6);
          this.sound.beep(false);
          this.addShake(0.08);
        } else {
          this.fx.banner('GO!', '', '#4ff4ff', 0.9, 1.8);
          this.sound.beep(true);
          this.addShake(0.3);
          this.flashScreen(0.3, '#4ff4ff');
          this.squash = 1;
          this.setPhase('racing');
        }
      }
    }

    const racing = this.phase === 'racing';
    const ai = this.phase === 'title';
    let steerIn = 0;
    let brake = false;
    let nitroReq = false;
    if (racing) {
      steerIn = this.input.steer;
      brake = this.input.brake;
      nitroReq = this.input.consumeNitro();
    } else if (ai) {
      const a = this.aiControl(dt);
      steerIn = a.steer;
      nitroReq = a.nitro;
    } else {
      this.input.consumeNitro();
    }
    this.braking = brake;

    const pz0 = this.position + PLAYER_Z;
    const seg = this.track.find(pz0);
    let sp = this.speed / MAX_SPEED;

    if (nitroReq && !this.nitroOn && this.nitro >= 0.25 && this.crashT <= 0) this.fireNitro(racing);
    if (this.nitroOn) {
      this.nitro -= dt * 0.38;
      if (this.nitro <= 0) {
        this.nitro = 0;
        this.nitroOn = false;
      }
    }

    const driving = racing || ai;
    let target = driving ? (this.nitroOn ? MAX_SPEED * NITRO_MULT : MAX_SPEED) : 0;
    if (ai && !this.nitroOn) target *= 0.9;
    if (this.offroad) target = Math.min(target, MAX_SPEED * (this.nitroOn ? 0.62 : OFFROAD_LIMIT));
    if (brake) this.speed -= MAX_SPEED * 1.25 * dt;
    else if (this.crashT > 0.3) this.speed -= MAX_SPEED * 0.5 * dt;
    else if (this.speed < target) {
      const a = this.nitroOn ? MAX_SPEED * 1.3 : MAX_SPEED * (0.62 - 0.4 * Math.min(1, sp));
      this.speed = Math.min(target, this.speed + a * dt);
    } else {
      const decel = !driving ? 0.45 : this.offroad ? 1.0 : 0.3;
      this.speed = Math.max(target, this.speed - MAX_SPEED * decel * dt);
    }
    this.speed = clamp(this.speed, 0, MAX_SPEED * NITRO_MULT);
    sp = this.speed / MAX_SPEED;

    const canSteer = this.crashT < 0.4;
    const want = canSteer ? steerIn : 0;
    this.steer = approach(this.steer, want, dt * (Math.abs(want) > Math.abs(this.steer) ? 9 : 13));
    const rate = (1.2 + 1.5 * Math.min(sp, NITRO_MULT)) * Math.min(1, sp * 3);
    this.playerX += this.steer * rate * dt;
    this.playerX -= dt * sp * sp * seg.curve * CENTRIFUGAL;
    this.playerX += this.xVel * dt;
    this.xVel = approach(this.xVel, 0, dt * 5);
    this.playerX = clamp(this.playerX, -X_LIMIT, X_LIMIT);
    this.offroad = Math.abs(this.playerX) > 1.12;

    const dz = this.speed * dt;
    this.position = wrap(this.position + dz, TRACK_LENGTH);
    this.dist += dz;
    const pz = this.position + PLAYER_Z;

    this.mountOff += seg.curve * (dz / SEG) * 0.0011;
    this.sunOff = clamp(this.sunOff + seg.curve * (dz / SEG) * 0.0016, -0.42, 0.42);
    this.sunOff *= Math.max(0, 1 - dt * 0.25);

    this.traffic.update(dt, pz, this.speed, this.playerX, this.stage, this.rng);

    if (driving || this.phase === 'timeup') {
      this.checkCars(pz, racing);
      this.checkPickups(pz0, pz, racing);
      this.checkScenery(pz0, pz, racing);
    }
    this.checkProgress(racing);

    if (this.crashT > 0) this.crashT = Math.max(0, this.crashT - dt);
    if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - dt);
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0 && this.mult > 1) {
        if (racing) this.sound.comboLost();
        this.mult = 1;
      }
    }

    const ax = Math.abs(this.playerX);
    if (driving && ax > 0.98 && ax < 1.16 && sp > 0.25) {
      this.rumbleT -= dt;
      if (this.rumbleT <= 0) {
        this.rumbleT = 0.11;
        this.addShake(0.07);
        if (racing) this.sound.rumble();
      }
    }

    if (racing) {
      this.stats.runTime += dt;
      this.score += dz * 0.01;
      this.stats.topSpeed = Math.max(this.stats.topSpeed, this.speed * KMH);
      const prevT = this.timeLeft;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 10 && this.timeLeft > 0 && Math.ceil(this.timeLeft) !== Math.ceil(prevT)) this.sound.tick();
      if (this.timeLeft <= 0) this.timeUp();
    }
    if (this.phase === 'timeup' && this.phaseT > 1.5) this.gameOver();

    this.emitFx(dt, sp, seg);

    const targetFov = BASE_FOV + (this.nitroOn ? 16 : 0) + Math.min(sp, 1) * 4;
    this.fov = approach(this.fov, targetFov, dt * (this.nitroOn ? 60 : 25));
    const rollT = -(seg.curve * 0.0035 + this.steer * 0.012) * Math.min(1, sp);
    this.roll = lerp(this.roll, rollT, Math.min(1, dt * 4));
  }

  private aiControl(dt: number) {
    const pz = this.position + PLAYER_Z;
    this.aiThink -= dt;
    if (this.aiThink <= 0) {
      this.aiThink = 0.15;
      let best = this.aiLane;
      let bestScore = -1e9;
      for (let lane = 0; lane < 3; lane++) {
        let nearest = 70 * SEG;
        for (const car of this.traffic.cars) {
          if (car.flying > 0) continue;
          const rel = wrapRel(car.z - pz, TRACK_LENGTH);
          if (rel < -SEG || rel > 70 * SEG) continue;
          if (Math.abs(car.offset - LANE_CENTERS[lane]) < 0.45) nearest = Math.min(nearest, rel);
        }
        const sc = nearest + (lane === this.aiLane ? 8 * SEG : 0) - Math.abs(LANE_CENTERS[lane] - this.playerX) * 10 * SEG;
        if (sc > bestScore) {
          bestScore = sc;
          best = lane;
        }
      }
      this.aiLane = best;
    }
    const seg = this.track.find(pz);
    const sp = this.speed / MAX_SPEED;
    const rate = Math.max(0.3, (1.2 + 1.5 * Math.min(sp, NITRO_MULT)) * Math.min(1, sp * 3));
    const comp = (sp * sp * seg.curve * CENTRIFUGAL) / rate;
    const steer = clamp((LANE_CENTERS[this.aiLane] - this.playerX) * 4 + comp, -1, 1);
    const nitro = this.nitro >= 0.6 && Math.abs(seg.curve) < 1 && Math.random() < dt * 0.4;
    return { steer, nitro };
  }

  private checkCars(pz: number, racing: boolean) {
    for (const car of this.traffic.cars) {
      if (car.flying > 0) continue;
      const rel = wrapRel(car.z - pz, TRACK_LENGTH);
      const prev = car.rel;
      car.rel = rel;
      if (rel > 8 * SEG || rel < -8 * SEG) {
        car.nearArmed = true;
        continue;
      }
      const crossedFwd = prev > 0 && rel <= 0;
      const crossedBack = prev < 0 && rel >= 0;
      const alongside = rel <= SEG * 0.25 && rel >= -SEG * 1.2;
      if (!crossedFwd && !crossedBack && !alongside) continue;
      const reach = (PLAYER_W + car.def.wN) * 0.5 * 0.82;
      const dx = Math.abs(this.playerX - car.offset);
      if (dx < reach) {
        if (this.nitroOn) this.smash(car, racing);
        else if (this.invulnT <= 0) this.crashIntoCar(car, pz, racing);
      } else if (crossedFwd && car.nearArmed) {
        car.nearArmed = false;
        if (dx - reach < NEAR_MISS_GAP && this.speed > MAX_SPEED * 0.45 && this.invulnT <= 0) this.nearMiss(car, racing);
      }
    }
  }

  private segRange(z0: number, z1: number, inclusive: boolean, fn: (s: Segment) => boolean | void) {
    const i0 = Math.floor(wrap(z0, TRACK_LENGTH) / SEG) % TRACK_SEGMENTS;
    const i1 = Math.floor(wrap(z1, TRACK_LENGTH) / SEG) % TRACK_SEGMENTS;
    let i = i0;
    if (inclusive && fn(this.track.segs[i]) === true) return;
    let guard = 0;
    while (i !== i1 && guard++ < 12) {
      i = (i + 1) % TRACK_SEGMENTS;
      if (fn(this.track.segs[i]) === true) return;
    }
  }

  private checkPickups(z0: number, z1: number, racing: boolean) {
    this.segRange(z0, z1, true, (s) => {
      for (const orb of s.orbs) {
        if (orb.collected) continue;
        const a = wrapRel(orb.z - z0, TRACK_LENGTH);
        const b = wrapRel(orb.z - z1, TRACK_LENGTH);
        if (a > 0 && b <= 0 && Math.abs(this.playerX - orb.offset) < (PLAYER_W + ORB_W) * 0.5) this.collect(orb, racing);
      }
    });
  }

  private checkScenery(z0: number, z1: number, racing: boolean) {
    if (this.invulnT > 0 || Math.abs(this.playerX) < 1.05) return;
    this.segRange(z0, z1, false, (s) => {
      for (const inst of s.sprites) {
        const d = inst.def;
        if (inst.center || d.hit <= 0) continue;
        const xl = inst.offset < 0 ? inst.offset - d.wN : inst.offset;
        const hx = xl + d.hitC * d.wN;
        if (Math.abs(this.playerX - hx) < (PLAYER_W * 0.8 + d.hit) * 0.5) {
          this.crashScenery(racing);
          return true;
        }
      }
      return false;
    });
  }

  private halfRoadPx() {
    return this.renderer.carW / PLAYER_VIS_W;
  }

  private popup(text: string, color: string, side: number, scale = 1) {
    const r = this.renderer;
    const size = clamp(24 * r.u, 13 * r.pr, 42 * r.pr) * scale;
    this.popStack = this.time - this.lastPopT < 0.45 ? (this.popStack + 1) % 3 : 0;
    this.lastPopT = this.time;
    const stack = this.popStack;
    this.fx.popup(text, r.carX + side * r.carW * 0.42, r.carY - r.carH * 1.35 - stack * size * 0.9, color, size);
  }

  private bumpCombo() {
    this.mult = Math.min(10, this.mult + 1);
    this.comboT = 3.2;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.mult);
  }

  private endCombo(racing: boolean) {
    if (this.mult > 2 && racing) this.popup('COMBO LOST', '#ff7a9c', 0, 0.8);
    this.mult = 1;
    this.comboT = 0;
  }

  private fireNitro(racing: boolean) {
    this.nitroOn = true;
    this.addShake(0.4);
    this.flashScreen(0.3, '#4ff4ff');
    this.squash = 1;
    const r = this.renderer;
    for (const ex of [-0.207, 0.207]) this.fx.burst(r.carX + ex * r.carW, r.carY - r.carH * 0.14, 8, 'cyan', r.u, 1.2);
    if (racing) {
      this.popup('NITRO!', '#4ff4ff', 0, 1.25);
      vibrate(30);
    }
    this.sound.nitro();
  }

  private collect(orb: Orb, racing: boolean) {
    orb.collected = true;
    const r = this.renderer;
    const ox = r.carX + (orb.offset - this.playerX) * this.halfRoadPx();
    const oy = r.carY - r.carH * 0.75;

    if (orb.type === 'shield') {
      this.hasShield = true;
      this.fx.burst(ox, oy, 14, '#00ff66', r.u, 1.2);
      this.sound.pickup(3);
      if (racing) this.popup('SHIELD ACTIVE!', '#00ff66', 0, 1.1);
    } else if (orb.type === 'coin') {
      this.totalCoins++;
      if (typeof window !== 'undefined') localStorage.setItem('neon_coins', String(this.totalCoins));
      this.score += 100 * this.mult;
      this.fx.burst(ox, oy, 10, '#ffcf3a', r.u, 1);
      this.sound.pickup(1);
      if (racing) this.popup('+1 COIN', '#ffcf3a', 0, 0.85);
    } else {
      const before = this.nitro;
      this.nitro = Math.min(1, this.nitro + 0.1);
      this.pickupStreak = this.time - this.lastPickupT < 1.2 ? this.pickupStreak + 1 : 0;
      this.lastPickupT = this.time;
      const pts = 50 * this.mult;
      this.fx.burst(ox, oy, 10, 'cyan', r.u, 1, 0.8);
      this.fx.glow(ox, oy, 0, 0, 0.3, r.carW * 0.3, 'white', r.carW * 3);
      this.sound.pickup(this.pickupStreak);
      if (racing) {
        this.score += pts;
        this.stats.orbs++;
        this.popup(`+${pts}`, '#7df9ff', clamp(orb.offset - this.playerX, -1, 1), 0.75);
        if (before < 1 && this.nitro >= 1) this.popup('NITRO FULL!', '#4ff4ff', 0, 0.9);
      }
    }
  }

  private nearMiss(car: Car, racing: boolean) {
    const side = car.offset > this.playerX ? 1 : -1;
    const pts = 150 * this.mult;
    if (racing) this.bumpCombo();
    this.nitro = Math.min(1, this.nitro + 0.05);
    this.addShake(0.16);
    const r = this.renderer;
    const sx = r.carX + side * r.carW * 0.52;
    for (let i = 0; i < 8; i++) {
      this.fx.glow(sx + rnd(-4, 4) * r.u, r.carY - r.carH * rnd(0.2, 0.8), side * rnd(40, 120) * r.u, rnd(300, 700) * r.u, 0.3, r.carW * 0.08, 'gold', 0);
    }
    if (racing) {
      this.score += pts;
      this.stats.nearMisses++;
      this.popup(`NEAR MISS +${pts}`, '#ffe14d', side * 0.6);
      this.sound.nearMiss(this.mult);
      vibrate(15);
    }
  }

  private smash(car: Car, racing: boolean) {
    const side = car.offset >= this.playerX ? 1 : -1;
    car.flying = 1.2;
    car.fvx = side * rnd(1.4, 2.4);
    car.fvy = rnd(1.5, 2.3);
    car.fvr = rnd(-9, 9);
    car.fx = 0;
    car.fy = 0;
    car.frot = 0;
    car.speed = this.speed * 1.04;
    car.blinking = false;
    this.addShake(0.5);
    this.hitStop = 0.045;
    this.flashScreen(0.25, '#4ff4ff');
    const r = this.renderer;
    const hx = r.carX + side * r.carW * 0.25;
    const hy = r.carY - r.carH * 0.8;
    const shardColor = car.def.color || '#ff0055';
    this.fx.shards(hx, hy, 18, shardColor, r.u);
    this.fx.sparks(hx, hy, 24, r.u, side, -1, Math.PI * 0.9);
    this.fx.burst(hx, hy, 8, 'cyan', r.u);
    this.sound.smash();
    if (racing) {
      const pts = 400 * this.mult;
      this.score += pts;
      this.stats.smashes++;
      this.bumpCombo();
      this.popup(`SMASH! +${pts}`, '#4ff4ff', side * 0.5, 1.1);
      vibrate(40);
    }
  }

  private crashIntoCar(car: Car, pz: number, racing: boolean) {
    if (this.hasShield) {
      this.hasShield = false;
      this.invulnT = 1.5;
      this.addShake(0.3);
      this.flashScreen(0.3, '#00ff66');
      if (racing) this.popup('SHIELD ABSORBED CRASH!', '#00ff66', 0, 1.1);
      this.sound.smash();
      return;
    }

    const side = this.playerX >= car.offset ? 1 : -1;
    this.speed = Math.min(this.speed, car.speed) * 0.55;
    this.xVel = side * 1.5;
    this.crashT = 0.9;
    this.invulnT = 1.7;
    this.spinDir = side;
    car.z = wrap(pz + SEG * 1.0, TRACK_LENGTH);
    car.rel = SEG;
    car.speed = Math.max(car.speed, MAX_SPEED * 0.45);
    car.bump = 1;
    this.nitroOn = false;
    this.endCombo(racing);
    this.addShake(0.85);
    this.hitStop = 0.08;
    this.flashScreen(0.45, '#ff3355');
    const r = this.renderer;
    const hx = r.carX - side * r.carW * 0.15;
    const hy = r.carY - r.carH * 0.75;
    const shardColor = car.def.color || '#ff0055';
    this.fx.sparks(hx, hy, 40, r.u, 0, -1, Math.PI * 1.6, 1.2);
    this.fx.shards(hx, hy, 10, shardColor, r.u);
    this.fx.burst(hx, hy, 6, 'spark', r.u);
    for (let i = 0; i < 6; i++) this.fx.puff(hx + rnd(-30, 30) * r.u, hy, rnd(-80, 80) * r.u, rnd(-60, 40) * r.u, r.carW * 0.25, 'smoke', 0.8, 0.5);
    this.sound.crash();
    if (racing) {
      this.stats.crashes++;
      this.popup('CRASH!', '#ff4060', 0, 1.1);
      vibrate(120);
    }
  }

  private crashScenery(racing: boolean) {
    if (this.hasShield) {
      this.hasShield = false;
      this.invulnT = 1.5;
      this.addShake(0.3);
      this.flashScreen(0.3, '#00ff66');
      if (racing) this.popup('SHIELD ABSORBED WIPEOUT!', '#00ff66', 0, 1.1);
      this.sound.smash();
      return;
    }

    const toward = this.playerX > 0 ? -1 : 1;
    this.speed = Math.min(this.speed, MAX_SPEED * 0.12);
    this.xVel = toward * 1.8;
    this.crashT = 0.9;
    this.invulnT = 0.9;
    this.spinDir = toward;
    this.nitroOn = false;
    this.endCombo(racing);
    this.addShake(1);
    this.hitStop = 0.1;
    this.flashScreen(0.5, '#ff3355');
    const r = this.renderer;
    const hx = r.carX - toward * r.carW * 0.3;
    const hy = r.carY - r.carH * 0.6;
    this.fx.sparks(hx, hy, 50, r.u, 0, -1, Math.PI * 1.8, 1.3);
    this.fx.shards(hx, hy, 12, '#3a2a50', r.u);
    for (let i = 0; i < 10; i++) this.fx.puff(hx + rnd(-40, 40) * r.u, hy + rnd(0, 30) * r.u, rnd(-100, 100) * r.u, rnd(-80, 30) * r.u, r.carW * 0.3, 'dust', 0.9, 0.6);
    this.sound.crash(true);
    if (racing) {
      this.stats.crashes++;
      this.popup('WIPEOUT!', '#ff4060', 0, 1.2);
      vibrate([80, 40, 120]);
    }
  }

  private checkProgress(racing: boolean) {
    const pAbs = this.dist + PLAYER_Z;
    const nextGate = this.stage * ZONE_LENGTH + (GATE_OFFSET + 0.5) * SEG;
    if (pAbs >= nextGate) this.checkpoint(racing);
    const zoneStart = (this.stage - 1) * ZONE_LENGTH;
    if (this.builtUpTo < this.stage + 1 && pAbs > zoneStart + 70 * SEG) {
      const st = this.stage + 1;
      this.track.build((st - 1) % 2, st, this.bank, this.seed + st);
      this.builtUpTo = st;
    }
  }

  private checkpoint(racing: boolean) {
    this.stage++;
    const zone = zoneForStage(this.stage);
    this.palette.set(zone);
    const want = this.carCount(this.stage);
    const have = this.traffic.cars.length;
    if (want > have) this.traffic.spawn(want - have, this.position + PLAYER_Z, 310 * SEG, TRACK_LENGTH - 30 * SEG, this.stage, this.rng);
    if (!racing) return;
    const ext = Math.max(14, Math.round(26 - (this.stage - 2) * 1.5));
    this.timeLeft = Math.min(MAX_TIME, this.timeLeft + ext);
    this.score += 500 * (this.stage - 1);
    this.cpCount++;
    this.cpExt = ext;
    this.fx.banner('CHECKPOINT', `+${ext} SEC  ·  ${zone.name}`, '#4ff4ff', 2.3, 1);
    const r = this.renderer;
    this.fx.confetti(r.W, r.H, 90, r.u);
    this.addShake(0.3);
    this.flashScreen(0.35, '#ffffff');
    this.sound.checkpoint();
    vibrate([30, 30, 30]);
  }

  private timeUp() {
    this.setPhase('timeup');
    this.nitroOn = false;
    this.fx.banner('TIME UP', '', '#ff3fa4', 1.7, 1.3);
    this.sound.timeUp();
    this.sound.duck(0.45);
    this.addShake(0.3);
  }

  private gameOver() {
    this.setPhase('gameover');
    this.cb.onGameOver({
      score: Math.floor(this.score),
      distance: (this.dist * UNIT_TO_KM),
      topSpeed: Math.round(this.stats.topSpeed),
      nearMisses: this.stats.nearMisses,
      bestCombo: this.stats.bestCombo,
      smashes: this.stats.smashes,
      orbs: this.stats.orbs,
      stage: this.stage,
      crashes: this.stats.crashes,
      duration: this.stats.runTime,
    });
  }

  private emitFx(dt: number, sp: number, seg: Segment) {
    const r = this.renderer;
    if (!r.carW) return;
    const u = r.u, cx = r.carX, cy = r.carY, w = r.carW, h = r.carH;
    if (this.offroad && sp > 0.08) {
      this.dustAcc += dt * 36 * sp;
      while (this.dustAcc >= 1) {
        this.dustAcc--;
        for (const side of [-1, 1]) {
          this.fx.puff(cx + side * w * 0.38 + rnd(-6, 6) * u, cy - h * 0.05, side * rnd(30, 140) * u, rnd(40, 170) * u, w * 0.2, 'dust', 0.55, 0.55);
        }
      }
    }
    if (this.nitroOn) {
      this.flameAcc += dt * 70;
      while (this.flameAcc >= 1) {
        this.flameAcc--;
        for (const ex of [-0.207, 0.207]) {
          this.fx.glow(cx + ex * w + rnd(-3, 3) * u, cy - h * 0.14, rnd(-50, 50) * u, rnd(200, 420) * u, 0.22, w * rnd(0.08, 0.15), Math.random() < 0.6 ? 'cyan' : 'white', -w * 0.25);
        }
      }
    }
    const drifting = Math.abs(this.steer) > 0.7 && sp > 0.75 && Math.abs(seg.curve) > 2.2;
    if (!this.offroad && (drifting || (this.braking && sp > 0.3) || this.crashT > 0.2)) {
      this.smokeAcc += dt * 32;
      while (this.smokeAcc >= 1) {
        this.smokeAcc--;
        const side = Math.random() < 0.5 ? -1 : 1;
        this.fx.puff(cx + side * w * 0.36, cy - h * 0.04, side * rnd(10, 70) * u, rnd(60, 150) * u, w * 0.15, 'smoke', 0.6, 0.32);
      }
    }
  }

  private emitHud() {
    if (!this.onHud) return;
    const h = this.hud;
    h.score = Math.floor(this.score);
    h.mult = this.mult;
    h.combo = this.mult > 1 ? clamp(this.comboT / 3.2, 0, 1) : 0;
    h.time = this.timeLeft;
    h.stage = this.stage;
    h.zone = zoneForStage(this.stage).name;
    const pAbs = this.dist + PLAYER_Z;
    const prevGate = (this.stage - 1) * ZONE_LENGTH + (GATE_OFFSET + 0.5) * SEG;
    h.progress = clamp((pAbs - prevGate) / ZONE_LENGTH, 0, 1);
    h.kmh = Math.round(this.speed * KMH);
    h.speedPct = this.speed / (MAX_SPEED * NITRO_MULT);
    h.nitro = this.nitro;
    h.nitroOn = this.nitroOn;
    h.nitroReady = this.nitro >= 0.25;
    h.cp = this.cpCount;
    h.cpExt = this.cpExt;
    const [l, r] = this.input.touchSides();
    h.steerL = l;
    h.steerR = r;
    this.onHud(h);
  }

  private updateAudio() {
    const sp = this.speed / MAX_SPEED;
    const ph = this.phase;
    const active = ph === 'racing' || ph === 'countdown' || ph === 'timeup' || (ph === 'gameover' && sp > 0.02);
    const rev = ph === 'countdown' ? 0.3 + 0.3 * Math.abs(Math.sin(this.phaseT * 5)) : 0;
    this.sound.setEngine(sp, active, this.nitroOn, this.offroad && sp > 0.05, rev);
  }
}