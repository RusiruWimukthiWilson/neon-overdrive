import {
  GATE_OFFSET, LANE_CENTERS, RUMBLE_LENGTH, SEGMENT_LENGTH, TRACK_LENGTH, TRACK_SEGMENTS, ZONE_SEGMENTS,
  SHIELD_ORB_CHANCE, COIN_ORB_CHANCE
} from './config';
import { zoneForStage } from './palettes';
import type { SpriteBank, SpriteDef } from './sprites';
import type { Car } from './traffic';
import { clamp, easeIn, easeInOut, lerp, makeRng, pick, rand, smooth, wrap } from './util';

export interface SpriteInst {
  def: SpriteDef;
  offset: number;
  center?: boolean;
}

export type OrbType = 'nitro' | 'shield' | 'coin';

export interface Orb {
  offset: number;
  z: number;
  type: OrbType;
  collected: boolean;
  phase: number;
}

export interface Segment {
  index: number;
  z1: number;
  z2: number;
  y1: number;
  y2: number;
  curve: number;
  light: boolean;
  sprites: SpriteInst[];
  cars: Car[];
  orbs: Orb[];
  // per-frame projection scratch
  sx1: number; sy1: number; sw1: number; sc1: number;
  sx2: number; sy2: number; sw2: number; sc2: number;
  clip: number;
  fogLevel: number;
  n: number;
  proj: boolean;
}

export class Track {
  segs: Segment[] = [];

  constructor() {
    for (let i = 0; i < TRACK_SEGMENTS; i++) {
      this.segs.push({
        index: i,
        z1: i * SEGMENT_LENGTH,
        z2: (i + 1) * SEGMENT_LENGTH,
        y1: 0,
        y2: 0,
        curve: 0,
        light: Math.floor(i / RUMBLE_LENGTH) % 2 === 0,
        sprites: [],
        cars: [],
        orbs: [],
        sx1: 0, sy1: 0, sw1: 0, sc1: 0, sx2: 0, sy2: 0, sw2: 0, sc2: 0,
        clip: 0, fogLevel: 0, n: 0, proj: false,
      });
    }
  }

  find(z: number): Segment {
    return this.segs[Math.floor(wrap(z, TRACK_LENGTH) / SEGMENT_LENGTH) % TRACK_SEGMENTS];
  }

  /** Procedurally (re)build one half of the looping track for the given stage. */
  build(half: number, stage: number, bank: SpriteBank, seed: number) {
    const r = makeRng(seed);
    const start = half * ZONE_SEGMENTS;
    const end = start + ZONE_SEGMENTS;
    const zone = zoneForStage(stage);
    const diff = clamp((stage - 1) / 6, 0, 1);

    for (let i = start; i < end; i++) {
      const s = this.segs[i];
      s.sprites.length = 0;
      s.orbs.length = 0;
      s.curve = 0;
      s.y1 = 0;
      s.y2 = 0;
    }

    let i = start;
    let lastY = 0;
    const put = (curve: number, y: number) => {
      if (i >= end) return;
      const s = this.segs[i++];
      s.curve = curve;
      s.y1 = lastY;
      s.y2 = y;
      lastY = y;
    };
    const road = (enter: number, hold: number, leave: number, curve: number, endY: number) => {
      const startY = lastY;
      const total = Math.max(1, enter + hold + leave);
      let k = 0;
      for (let n = 0; n < enter; n++, k++) put(easeIn(0, curve, n / enter), easeInOut(startY, endY, (k + 1) / total));
      for (let n = 0; n < hold; n++, k++) put(curve, easeInOut(startY, endY, (k + 1) / total));
      for (let n = 0; n < leave; n++, k++) put(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (k + 1) / total));
    };
    const LIMIT = 15000;
    const hill = (h: number) => {
      let dy = (r() < 0.5 ? -1 : 1) * h * SEGMENT_LENGTH;
      if (Math.abs(lastY + dy) > LIMIT) dy = -dy;
      return lastY + dy;
    };

    // lead-in straight for the gate
    road(0, 40, 10, 0, 0);
    let lastDir = r() < 0.5 ? -1 : 1;
    while (end - i > 360) {
      const k = r();
      const dir = (lastDir = r() < 0.65 ? -lastDir : lastDir);
      if (k < 0.16) {
        const L = pick(r, [15, 25, 35]);
        road(L, L, L, 0, hill(pick(r, [0, 10, 20, 30])));
      } else if (k < 0.42) {
        const L = pick(r, [20, 30, 45]);
        const c = dir * pick(r, [2, 3, 3.5 + diff * 1.5]);
        road(Math.floor(L * 0.6), L, Math.floor(L * 0.6), c, hill(pick(r, [0, 0, 15, 25])));
      } else if (k < 0.6) {
        const L = pick(r, [14, 18, 24]);
        for (let q = 0; q < 3; q++) road(L, L, L, (q % 2 ? -1 : 1) * dir * pick(r, [2, 3, 3.5 + diff]), hill(pick(r, [0, 10, 20])));
      } else if (k < 0.75) {
        const up = pick(r, [15, 22, 30]);
        road(14, 6, 14, 0, clamp(lastY + up * SEGMENT_LENGTH, -LIMIT, LIMIT));
        road(14, 6, 14, dir * rand(r, 0, 2), clamp(lastY - up * SEGMENT_LENGTH * 1.2, -LIMIT, LIMIT));
        road(12, 4, 12, 0, hill(pick(r, [10, 20])));
      } else if (k < 0.9) {
        road(40, 50, 40, dir * pick(r, [1.5, 2.5]), hill(pick(r, [20, 40])));
      } else {
        road(20, 25, 20, dir * (4.4 + diff * 1.2), lastY);
      }
    }
    const rem = end - i;
    const back = rem - 30;
    const third = Math.floor(back / 3);
    road(third, back - 2 * third, third, 0, 0);
    while (i < end) put(0, 0);

    // ---------- gate
    const gateSeg = this.segs[start + GATE_OFFSET];
    gateSeg.sprites.push({ def: stage === 1 ? bank.gateStart : bank.gateCheck, offset: 0, center: true });

    // ---------- scenery
    const kind = zone.kind;
    const lampEvery = kind === 'city' ? 12 : kind === 'desert' ? 36 : 18;
    for (let n = start + 2; n < end - 1; n++) {
      if (n === start + GATE_OFFSET) continue;
      const s = this.segs[n];
      const rel = n - start;
      if (Math.abs(s.curve) >= 2.6 && rel % 6 === 0) {
        if (s.curve > 0) s.sprites.push({ def: bank.chevR, offset: -1.14 });
        else s.sprites.push({ def: bank.chevL, offset: 1.14 });
        continue;
      }
      if (rel % lampEvery === 0) {
        s.sprites.push({ def: bank.lampL, offset: -1.12 });
        s.sprites.push({ def: bank.lampR, offset: 1.12 });
        continue;
      }
      if (rel % 120 === 60) {
        s.sprites.push({ def: pick(r, bank.billboards), offset: r() < 0.5 ? -1.3 : 1.3 });
        continue;
      }
      const side = r() < 0.5 ? -1 : 1;
      switch (kind) {
        case 'sunset':
          if (r() < 0.24) s.sprites.push({ def: pick(r, bank.palms), offset: side * rand(r, 1.3, 2.7) });
          break;
        case 'dawn':
          if (r() < 0.14) s.sprites.push({ def: pick(r, bank.palms), offset: side * rand(r, 1.3, 2.4) });
          else if (r() < 0.05) s.sprites.push({ def: pick(r, bank.billboards), offset: side * 1.4 });
          break;
        case 'city':
          if (rel % 5 === 0) s.sprites.push({ def: pick(r, bank.buildings), offset: -rand(r, 1.6, 2.1) });
          else if (rel % 5 === 2) s.sprites.push({ def: pick(r, bank.buildings), offset: rand(r, 1.6, 2.1) });
          break;
        case 'desert':
          if (r() < 0.12) s.sprites.push({ def: pick(r, bank.cacti), offset: side * rand(r, 1.3, 3.0) });
          else if (r() < 0.04) s.sprites.push({ def: pick(r, bank.rocks), offset: side * rand(r, 1.4, 2.6) });
          break;
      }
    }

    // ---------- collectible orbs (nitro, shield, coin)
    let n = start + 60;
    while (n < end - 70) {
      const pattern = r();
      const lane = Math.floor(r() * 3);
      let lane2 = lane + (r() < 0.5 ? -1 : 1);
      if (lane2 < 0 || lane2 > 2) lane2 = lane - (lane2 - lane);
      if (pattern < 0.38) {
        for (let q = 0; q < 5; q++) this.addOrb(n + q * 3, LANE_CENTERS[lane], r());
        n += 15;
      } else if (pattern < 0.72) {
        for (let q = 0; q < 7; q++) this.addOrb(n + q * 3, lerp(LANE_CENTERS[lane], LANE_CENTERS[lane2], smooth(q / 6)), r());
        n += 21;
      } else {
        for (let q = 0; q < 6; q++) this.addOrb(n + q * 5, LANE_CENTERS[q % 2 ? lane2 : lane], r());
        n += 30;
      }
      n += Math.floor(rand(r, 45, 85 - diff * 20));
    }
  }

  private addOrb(idx: number, offset: number, ph: number) {
    const s = this.segs[idx % TRACK_SEGMENTS];
    const randVal = Math.random();
    const type: OrbType = randVal < SHIELD_ORB_CHANCE ? 'shield' : randVal < (SHIELD_ORB_CHANCE + COIN_ORB_CHANCE) ? 'coin' : 'nitro';
    s.orbs.push({ offset, z: s.z1 + SEGMENT_LENGTH * 0.5, type, collected: false, phase: ph * Math.PI * 2 });
  }
}