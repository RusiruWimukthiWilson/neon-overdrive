import { LANE_CENTERS, MAX_SPEED, SEGMENT_LENGTH, TRACK_LENGTH, TRACK_SEGMENTS } from './config';
import type { CarDef, SpriteBank } from './sprites';
import type { Track } from './track';
import { approach, pick, rand, wrap, wrapRel, type RNG } from './util';

const SEG = SEGMENT_LENGTH;

export interface Car {
  z: number;
  offset: number;
  targetOffset: number;
  lane: number;
  pendingLane: number;
  speed: number;
  factor: number;
  def: CarDef;
  segIndex: number;
  percent: number;
  signal: number;
  signalDir: number;
  blinking: boolean;
  laneTimer: number;
  rel: number;
  nearArmed: boolean;
  flying: number;
  fx: number;
  fy: number;
  frot: number;
  fvx: number;
  fvy: number;
  fvr: number;
  bump: number;
}

/* ------------------------------------------------------------------ Object Pool for Cars */
class CarPool {
  private pool: Car[] = [];

  obtain(): Car {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    // Fallback default structure
    return {
      z: 0, offset: 0, targetOffset: 0, lane: 0, pendingLane: 0,
      speed: 0, factor: 1, def: {} as CarDef, segIndex: 0, percent: 0,
      signal: 0, signalDir: 0, blinking: false, laneTimer: 0, rel: 0,
      nearArmed: true, flying: 0, fx: 0, fy: 0, frot: 0, fvx: 0, fvy: 0, fvr: 0, bump: 0,
    };
  }

  release(car: Car) {
    this.pool.push(car);
  }
}

const carPool = new CarPool();

/* ------------------------------------------------------------------ Traffic Engine */
export class Traffic {
  cars: Car[] = [];
  private track: Track;
  private bank: SpriteBank;

  constructor(track: Track, bank: SpriteBank) {
    this.track = track;
    this.bank = bank;
  }

  clear() {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      this.unlink(c);
      carPool.release(c);
    }
    this.cars.length = 0;
  }

  laneSpeed(lane: number, stage: number) {
    const base = [0.6, 0.5, 0.4][lane] ?? 0.5;
    return MAX_SPEED * (base + Math.min(0.1, (stage - 1) * 0.015));
  }

  spawn(count: number, pz: number, minAhead: number, maxAhead: number, stage: number, r: RNG) {
    for (let k = 0; k < count; k++) {
      for (let tries = 0; tries < 24; tries++) {
        const z = wrap(pz + rand(r, minAhead, maxAhead), TRACK_LENGTH);
        const truck = r() < 0.18;
        const lane = truck ? (r() < 0.7 ? 2 : 1) : Math.floor(r() * 3);
        if (!this.laneFree(lane, z, 6 * SEG)) continue;
        if (this.abreast(z, lane) >= 2) continue;
        const def = truck ? pick(r, this.bank.trucks) : pick(r, this.bank.cars);
        const factor = (truck ? 0.9 : 1) * rand(r, 0.96, 1.04);
        const off = LANE_CENTERS[lane] + rand(r, -0.04, 0.04);
        
        // Obtain recycled car object from pool
        const car = carPool.obtain();
        car.z = z;
        car.offset = off;
        car.targetOffset = off;
        car.lane = lane;
        car.pendingLane = lane;
        car.speed = this.laneSpeed(lane, stage) * factor;
        car.factor = factor;
        car.def = def;
        car.segIndex = 0;
        car.percent = 0;
        car.signal = 0;
        car.signalDir = 0;
        car.blinking = false;
        car.laneTimer = rand(r, 1, 6);
        car.rel = wrapRel(z - pz, TRACK_LENGTH);
        car.nearArmed = true;
        car.flying = 0;
        car.fx = 0;
        car.fy = 0;
        car.frot = 0;
        car.fvx = 0;
        car.fvy = 0;
        car.fvr = 0;
        car.bump = 0;

        this.cars.push(car);
        this.link(car);
        break;
      }
    }
  }

  laneFree(lane: number, z: number, gap: number, except?: Car): boolean {
    const lc = LANE_CENTERS[lane];
    for (const c of this.cars) {
      if (c === except || c.flying > 0) continue;
      const near = Math.abs(c.offset - lc) < 0.4 || Math.abs(c.targetOffset - lc) < 0.4;
      if (near && Math.abs(wrapRel(c.z - z, TRACK_LENGTH)) < gap) return false;
    }
    return true;
  }

  /** number of other lanes occupied near z – used to avoid unavoidable 3-car walls */
  abreast(z: number, lane: number): number {
    const busy = [false, false, false];
    for (const c of this.cars) {
      if (c.flying > 0 || c.lane === lane) continue;
      if (Math.abs(wrapRel(c.z - z, TRACK_LENGTH)) < 7 * SEG) busy[c.lane] = true;
    }
    return (busy[0] ? 1 : 0) + (busy[1] ? 1 : 0) + (busy[2] ? 1 : 0);
  }

  private segIdx(z: number) {
    return Math.floor(z / SEG) % TRACK_SEGMENTS;
  }

  private link(car: Car) {
    car.segIndex = this.segIdx(car.z);
    car.percent = (car.z % SEG) / SEG;
    this.track.segs[car.segIndex].cars.push(car);
  }

  // Optimized Swap-and-Pop Array Removal (replaces arr.splice)
  private unlink(car: Car) {
    const arr = this.track.segs[car.segIndex].cars;
    const i = arr.indexOf(car);
    if (i >= 0) {
      arr[i] = arr[arr.length - 1];
      arr.pop();
    }
  }

  private relink(car: Car) {
    const idx = this.segIdx(car.z);
    if (idx !== car.segIndex) {
      this.unlink(car);
      car.segIndex = idx;
      this.track.segs[idx].cars.push(car);
    }
    car.percent = (car.z % SEG) / SEG;
  }

  private carAhead(car: Car, segsAhead: number): Car | null {
    for (let k = 0; k <= segsAhead; k++) {
      const seg = this.track.segs[(car.segIndex + k) % TRACK_SEGMENTS];
      for (const o of seg.cars) {
        if (o === car || o.flying > 0) continue;
        if (k === 0 && o.percent <= car.percent) continue;
        if (Math.abs(o.offset - car.offset) < 0.36) return o;
      }
    }
    return null;
  }

  update(dt: number, pz: number, pSpeed: number, pX: number, stage: number, r: RNG) {
    let playerLane = 0;
    let best = 99;
    for (let l = 0; l < 3; l++) {
      const d = Math.abs(LANE_CENTERS[l] - pX);
      if (d < best) {
        best = d;
        playerLane = l;
      }
    }

    // Process traffic updates
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (car.flying > 0) {
        car.flying -= dt;
        car.fx += car.fvx * dt;
        car.fy += car.fvy * dt;
        car.fvy -= 3.4 * dt;
        car.frot += car.fvr * dt;
        car.z = wrap(car.z + car.speed * dt, TRACK_LENGTH);
        if (car.flying <= 0) this.respawnAhead(car, pz, stage, r);
        this.relink(car);
        continue;
      }
      const rel = wrapRel(car.z - pz, TRACK_LENGTH);
      car.laneTimer -= dt;
      if (car.signal > 0) {
        car.signal -= dt;
        if (car.signal <= 0) {
          car.lane = car.pendingLane;
          car.targetOffset = LANE_CENTERS[car.lane] + rand(r, -0.04, 0.04);
        }
      } else if (car.laneTimer <= 0) {
        car.laneTimer = rand(r, 2.5, 6);
        const prob = 0.25 + Math.min(0.45, (stage - 1) * 0.07);
        if (!car.def.truck && rel > 18 * SEG && rel < 110 * SEG && r() < prob) {
          let nl = car.lane + (r() < 0.5 ? -1 : 1);
          if (nl < 0 || nl > 2) nl = car.lane - (nl - car.lane);
          if (!(nl === playerLane && rel < 30 * SEG) && this.laneFree(nl, car.z, 6 * SEG, car)) {
            car.pendingLane = nl;
            car.signal = 1.1;
            car.signalDir = nl - car.lane;
          }
        }
      }
      car.blinking = car.signal > 0 || Math.abs(car.offset - car.targetOffset) > 0.04;
      car.offset = approach(car.offset, car.targetOffset, dt * 0.55);

      let target = this.laneSpeed(car.lane, stage) * car.factor;
      const ahead = this.carAhead(car, 4);
      if (ahead && ahead.speed < target) target = ahead.speed;
      if (rel < 0 && rel > -14 * SEG) target = Math.min(target, pSpeed * 0.92);
      car.speed = approach(car.speed, target, MAX_SPEED * 0.6 * dt);
      car.bump = Math.max(0, car.bump - dt * 2.5);
      car.z = wrap(car.z + car.speed * dt, TRACK_LENGTH);
      this.relink(car);
    }
  }

  respawnAhead(car: Car, pz: number, stage: number, r: RNG) {
    car.flying = 0;
    car.fx = car.fy = car.frot = 0;
    car.bump = 0;
    car.signal = 0;
    for (let tries = 0; tries < 16; tries++) {
      const z = wrap(pz + rand(r, 230, 290) * SEG, TRACK_LENGTH);
      const lane = car.def.truck ? 1 + Math.floor(r() * 2) : Math.floor(r() * 3);
      if (this.laneFree(lane, z, 6 * SEG, car)) {
        car.z = z;
        car.lane = car.pendingLane = lane;
        car.offset = car.targetOffset = LANE_CENTERS[lane];
        car.speed = this.laneSpeed(lane, stage) * car.factor;
        break;
      }
    }
    car.rel = wrapRel(car.z - pz, TRACK_LENGTH);
    car.nearArmed = true;
  }
}