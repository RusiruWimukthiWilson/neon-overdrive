import {
  CAMERA_HEIGHT, FOG_DENSITY, FOG_LEVELS, LANES, MAX_SPEED, ORB_W, PLAYER_VIS_W, PLAYER_Z, ROAD_WIDTH,
  SEGMENT_LENGTH, TRACK_LENGTH, TRACK_SEGMENTS, fovToDepth,
} from './config';
import type { Game } from './game';
import type { LivePalette } from './palettes';
import type { Segment } from './track';
import { clamp, lerp, makeRng, rgbCss, wrap } from './util';

const GRID_OFFS = [1.75, 2.5, 3.4, 4.6, 6.2, 8.5];

function mountainHeights(seed: number, n: number): Float32Array {
  const r = makeRng(seed);
  const a = new Float32Array(n);
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const h =
      0.5 + 0.28 * Math.sin(t * 2 + ph[0]) + 0.17 * Math.sin(t * 5 + ph[1]) +
      0.1 * Math.sin(t * 11 + ph[2]) + 0.06 * Math.sin(t * 23 + ph[3]) + (r() - 0.5) * 0.08;
    a[i] = clamp(h, 0.06, 1);
  }
  return a;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 1;
  H = 1;
  pr = 1;
  xF = 1;
  yF = 1;
  horizon = 0;
  pad = 0;
  u = 1;
  quality = 2;
  drawDistance = 300;
  carX = 0;
  carY = 0;
  carW = 0;
  carH = 0;
  private palVer = -1;
  private sizeVer = 0;
  private builtSize = -1;
  private skyGrad: CanvasGradient | string = '#000';
  private farGrad: CanvasGradient | string = '#000';
  private nearGrad: CanvasGradient | string = '#000';
  private sun: HTMLCanvasElement;
  private sunG: CanvasRenderingContext2D;
  private halo: HTMLCanvasElement;
  private haloG: CanvasRenderingContext2D;
  private redVig: HTMLCanvasElement;
  private sunR = 100;
  private mountFar = mountainHeights(7, 56);
  private mountNear = mountainHeights(19, 40);
  private stars: { x: number; y: number; s: number; p: number }[] = [];
  private lines: { a: number; r: number; v: number; l: number }[] = [];
  private gridNear = new Float32Array(400 * GRID_OFFS.length * 2 * 4);
  private gridFar = new Float32Array(400 * GRID_OFFS.length * 2 * 4);
  private gnN = 0;
  private gfN = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.sun = document.createElement('canvas');
    this.sun.width = this.sun.height = 256;
    this.sunG = this.sun.getContext('2d')!;
    this.halo = document.createElement('canvas');
    this.halo.width = this.halo.height = 128;
    this.haloG = this.halo.getContext('2d')!;
    this.redVig = document.createElement('canvas');
    this.redVig.width = this.redVig.height = 256;
    const rg = this.redVig.getContext('2d')!;
    const gr = rg.createRadialGradient(128, 128, 60, 128, 128, 182);
    gr.addColorStop(0, 'rgba(255,0,60,0)');
    gr.addColorStop(1, 'rgba(255,20,70,0.85)');
    rg.fillStyle = gr;
    rg.fillRect(0, 0, 256, 256);
    const r = makeRng(42);
    for (let i = 0; i < 110; i++) this.stars.push({ x: r(), y: r() * r(), s: r() < 0.15 ? 2 : 1, p: r() * 6.28 });
    for (let i = 0; i < 46; i++) {
      let a = r() * Math.PI * 2;
      if (a > Math.PI * 0.32 && a < Math.PI * 0.68) a += Math.PI * 0.5;
      this.lines.push({ a, r: 0.2 + r(), v: 0.8 + r() * 1.4, l: 0.05 + r() * 0.12 });
    }
  }

  resize(cssW: number, cssH: number, quality: number) {
    this.quality = quality;
    const dprCap = [1, 1.5, 2][quality];
    const maxPixels = [0.9e6, 1.7e6, 2.9e6][quality];
    let pr = Math.min(window.devicePixelRatio || 1, dprCap);
    if (cssW * cssH * pr * pr > maxPixels) pr = Math.sqrt(maxPixels / (cssW * cssH));
    this.pr = pr;
    this.W = Math.max(1, Math.floor(cssW * pr));
    this.H = Math.max(1, Math.floor(cssH * pr));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    const W = this.W, H = this.H;
    this.xF = Math.min(W * 0.42, H * 0.62);
    this.yF = Math.max(this.xF * 0.8, H * 0.44);
    this.horizon = H * 0.9 - this.yF;
    this.pad = Math.ceil(Math.max(W, H) * 0.08);
    this.drawDistance = [170, 230, 300][quality];
    this.u = (PLAYER_VIS_W * 2 * this.xF) / 340;
    this.sunR = Math.min(this.yF * 0.46, W * 0.22);
    this.sizeVer++;
  }

  private rebuild(pal: LivePalette) {
    const ctx = this.ctx;
    const hz = this.horizon;
    const sky = ctx.createLinearGradient(0, hz - this.H * 0.8, 0, hz);
    sky.addColorStop(0, pal.css.skyTop);
    sky.addColorStop(0.55, pal.css.skyMid);
    sky.addColorStop(1, pal.css.skyBottom);
    this.skyGrad = sky;
    const fg = ctx.createLinearGradient(0, hz - this.yF * 0.36, 0, hz);
    fg.addColorStop(0, pal.css.mountFar);
    fg.addColorStop(1, pal.css.fog);
    this.farGrad = fg;
    const ng = ctx.createLinearGradient(0, hz - this.yF * 0.2, 0, hz);
    ng.addColorStop(0, pal.css.mountNear);
    ng.addColorStop(1, pal.css.fog);
    this.nearGrad = ng;
    // sun with retro stripes
    const g = this.sunG;
    const S = 256;
    g.clearRect(0, 0, S, S);
    const sg = g.createLinearGradient(0, 0, 0, S);
    sg.addColorStop(0, pal.css.sunTop);
    sg.addColorStop(1, pal.css.sunBottom);
    g.fillStyle = sg;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) g.fillRect(0, S * 0.5 + i * S * 0.072, S, 2 + i * 2.4);
    g.globalCompositeOperation = 'source-over';
    const hg = this.haloG;
    hg.clearRect(0, 0, 128, 128);
    const c = pal.rgb.sunGlow;
    const hr = hg.createRadialGradient(64, 64, 0, 64, 64, 64);
    hr.addColorStop(0, rgbCss(c, 0.9));
    hr.addColorStop(0.3, rgbCss(c, 0.35));
    hr.addColorStop(1, rgbCss(c, 0));
    hg.fillStyle = hr;
    hg.fillRect(0, 0, 128, 128);
    this.palVer = pal.version;
    this.builtSize = this.sizeVer;
  }

  private quad(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  render(g: Game, dt: number) {
    const ctx = this.ctx;
    const W = this.W, H = this.H, pad = this.pad;
    const pal = g.palette;
    if (pal.version !== this.palVer || this.builtSize !== this.sizeVer) this.rebuild(pal);

    const segs = g.track.segs;
    const N = TRACK_SEGMENTS;
    const position = g.position;
    const depth = fovToDepth(g.fov);
    const base = g.track.find(position);
    const basePct = (position % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const pz = wrap(position + PLAYER_Z, TRACK_LENGTH);
    const pSeg = g.track.find(pz);
    const pPct = (pz % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerY = lerp(pSeg.y1, pSeg.y2, pPct);
    const camY = playerY + CAMERA_HEIGHT;
    const camX = g.playerX * ROAD_WIDTH;
    const horizon = this.horizon;
    const xF = this.xF, yF = this.yF, cx = W / 2;

    // camera shake + roll
    const tr = g.trauma * g.trauma;
    const shx = (Math.random() * 2 - 1) * 0.022 * tr * H;
    const shy = (Math.random() * 2 - 1) * 0.022 * tr * H;
    const shr = (Math.random() * 2 - 1) * 0.018 * tr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(cx + shx, H / 2 + shy);
    ctx.rotate(g.roll + shr);
    ctx.translate(-cx, -H / 2);

    this.drawBackground(g, horizon);

    // ---------------- road (front to back)
    const dd = this.drawDistance;
    let maxy = H + pad;
    let x = 0;
    let dx = -(base.curve * basePct);
    this.gnN = 0;
    this.gfN = 0;
    const gridMax = this.quality > 0 ? Math.min(dd, 160) : 0;
    for (let n = 0; n < dd; n++) {
      const s = segs[(base.index + n) % N];
      const looped = s.index < base.index;
      const camZ = position - (looped ? TRACK_LENGTH : 0);
      s.n = n;
      s.clip = maxy;
      const cz1 = s.z1 - camZ;
      const cz2 = s.z2 - camZ;
      s.proj = cz1 > depth;
      if (s.proj) {
        const sc1 = depth / cz1, sc2 = depth / cz2;
        s.sc1 = sc1;
        s.sc2 = sc2;
        s.sx1 = cx + sc1 * (x - camX) * xF;
        s.sy1 = horizon - sc1 * (s.y1 - camY) * yF;
        s.sw1 = sc1 * ROAD_WIDTH * xF;
        s.sx2 = cx + sc2 * (x + dx - camX) * xF;
        s.sy2 = horizon - sc2 * (s.y2 - camY) * yF;
        s.sw2 = sc2 * ROAD_WIDTH * xF;
      }
      x += dx;
      dx += s.curve;
      const fogF = Math.exp(-(n / dd) * (n / dd) * FOG_DENSITY);
      s.fogLevel = Math.min(FOG_LEVELS - 1, Math.round((1 - fogF) * (FOG_LEVELS - 1)));
      if (!s.proj || s.sy2 >= s.sy1 || s.sy2 >= maxy) continue;
      const yb = Math.min(s.sy1, maxy);
      this.drawSegment(s, yb, pal);
      if (n < gridMax) this.collectGrid(s, yb, n < gridMax * 0.35);
      maxy = s.sy2;
    }
    if (this.gnN || this.gfN) this.drawGrid(pal);

    // ---------------- sprites (back to front)
    const bank = g.bank;
    const t = g.time;
    const blinkOn = (t * 3.2) % 1 < 0.55;
    for (let n = dd - 1; n > 0; n--) {
      const s = segs[(base.index + n) % N];
      if (s.proj) {
        const fade = clamp((1 - n / dd) * 5, 0, 1);
        const sp = s.sprites;
        for (let i = 0; i < sp.length; i++) {
          const inst = sp[i];
          const d = inst.def;
          const dw = d.wN * s.sw1;
          const dh = dw * d.aspect;
          let sx = s.sx1 + s.sw1 * inst.offset;
          if (inst.center) sx -= dw / 2;
          else if (inst.offset < 0) sx -= dw;
          this.drawSprite(d.img, sx, s.sy1 - dh, dw, dh, s.clip, fade);
        }
        const orbs = s.orbs;
        if (orbs.length && n > pSeg.n) {
          const mw = (s.sw1 + s.sw2) * 0.5;
          const mx = (s.sx1 + s.sx2) * 0.5;
          const my = (s.sy1 + s.sy2) * 0.5;
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < orbs.length; i++) {
            const o = orbs[i];
            if (o.collected) continue;
            const pulse = 1 + 0.14 * Math.sin(t * 7 + o.phase);
            const size = ORB_W * mw * pulse * 1.3;
            const hover = mw * (0.17 + 0.04 * Math.sin(t * 4 + o.phase));
            const oy = my - hover;
            if (oy > s.clip || size < 1) continue;
            ctx.globalAlpha = fade;
            ctx.drawImage(bank.orb, mx + mw * o.offset - size / 2, oy - size / 2, size, size);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        const cars = s.cars;
        for (let i = 0; i < cars.length; i++) {
          const car = cars[i];
          const p = car.percent;
          const w = lerp(s.sw1, s.sw2, p);
          const d = car.def;
          const dw = d.wN * w, dh = dw * d.aspect;
          const bx = lerp(s.sx1, s.sx2, p) + w * (car.offset + car.fx);
          const by = lerp(s.sy1, s.sy2, p) - car.fy * w;
          if (car.flying > 0 || car.bump > 0) {
            ctx.save();
            ctx.globalAlpha = fade * (car.flying > 0 ? Math.min(1, car.flying / 0.4) : 1);
            ctx.translate(bx, by - dh / 2);
            ctx.rotate(car.frot + car.bump * 0.12 * Math.sin(t * 45));
            ctx.drawImage(d.img, -dw / 2, -dh / 2, dw, dh);
            ctx.restore();
          } else {
            this.drawSprite(d.img, bx - dw / 2, by - dh, dw, dh, s.clip, fade);
          }
          if (car.blinking && blinkOn && car.flying <= 0) {
            const sig = car.signalDir < 0 ? d.sigL : d.sigR;
            const gx = bx - dw / 2 + sig[0] * dw;
            const gy = by - dh + sig[1] * dh;
            const gs = dw * 0.34;
            if (gy < s.clip) {
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = fade;
              ctx.drawImage(bank.glow.gold, gx - gs / 2, gy - gs / 2, gs, gs);
              ctx.globalCompositeOperation = 'source-over';
            }
          }
        }
      }
      if (s === pSeg) this.drawPlayer(g, pSeg, pPct, camY, depth);
    }
    ctx.globalAlpha = 1;

    // ---------------- fx in world space (shaken)
    g.fx.draw(ctx);
    this.drawSpeedLines(g, dt);

    // ---------------- screen-space overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(bank.vignette, 0, 0, W, H);
    if (g.lowTime > 0) {
      ctx.globalAlpha = g.lowTime;
      ctx.drawImage(this.redVig, 0, 0, W, H);
    }
    if (g.nitroOn) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + 0.06 * Math.sin(t * 30);
      ctx.drawImage(bank.vignette, 0, 0, W, H);
    }
    if (g.flash > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, g.flash) * 0.55;
      ctx.fillStyle = g.flashColor;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    g.fx.drawText(ctx, W, H, this.u, this.quality > 0);
  }

  private drawSegment(s: Segment, y1: number, pal: LivePalette) {
    const ctx = this.ctx;
    const f = pal.fog;
    const fl = s.fogLevel;
    const light = s.light;
    const x1 = s.sx1, w1 = s.sw1, x2 = s.sx2, y2 = s.sy2, w2 = s.sw2;
    const pad = this.pad, W = this.W;
    ctx.fillStyle = (light ? f.groundLight : f.groundDark)[fl];
    ctx.fillRect(-pad, y2, W + pad * 2, y1 - y2 + 1);
    if (s.index % 4 === 0) {
      ctx.fillStyle = f.grid[Math.min(FOG_LEVELS - 1, fl + 2)];
      const lh = Math.max(1, (y1 - y2) * 0.16);
      ctx.fillRect(-pad, y1 - lh, W + pad * 2, lh);
    }
    const r1 = w1 / 6.5, r2 = w2 / 6.5;
    ctx.fillStyle = (light ? f.rumbleLight : f.rumbleDark)[fl];
    this.quad(x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2);
    this.quad(x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2);
    ctx.fillStyle = (light ? f.roadLight : f.roadDark)[fl];
    this.quad(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2);
    if (w2 > 5) {
      const e1 = w1 / 48, e2 = w2 / 48;
      ctx.fillStyle = f.edge[fl];
      this.quad(x1 - w1, y1, x1 - w1 + e1, y1, x2 - w2 + e2, y2, x2 - w2, y2);
      this.quad(x1 + w1 - e1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 - e2, y2);
    }
    if (light && w2 > 8) {
      const l1 = w1 / 34, l2 = w2 / 34;
      const lw1 = (w1 * 2) / LANES, lw2 = (w2 * 2) / LANES;
      let lx1 = x1 - w1 + lw1, lx2 = x2 - w2 + lw2;
      ctx.fillStyle = f.lane[fl];
      for (let lane = 1; lane < LANES; lane++, lx1 += lw1, lx2 += lw2) {
        this.quad(lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2);
      }
    }
  }

  private collectGrid(s: Segment, y1: number, near: boolean) {
    const buf = near ? this.gridNear : this.gridFar;
    let k = near ? this.gnN : this.gfN;
    const lim = -this.pad, rim = this.W + this.pad;
    for (let i = 0; i < GRID_OFFS.length; i++) {
      const o = GRID_OFFS[i];
      for (let side = -1; side <= 1; side += 2) {
        const ax = s.sx1 + side * o * s.sw1;
        const bx = s.sx2 + side * o * s.sw2;
        if ((ax < lim && bx < lim) || (ax > rim && bx > rim)) continue;
        if (k + 4 > buf.length) break;
        buf[k++] = ax;
        buf[k++] = y1;
        buf[k++] = bx;
        buf[k++] = s.sy2;
      }
    }
    if (near) this.gnN = k;
    else this.gfN = k;
  }

  private drawGrid(pal: LivePalette) {
    const ctx = this.ctx;
    ctx.strokeStyle = pal.css.grid;
    ctx.lineWidth = Math.max(1, this.pr * 1.4);
    for (let pass = 0; pass < 2; pass++) {
      const buf = pass === 0 ? this.gridFar : this.gridNear;
      const n = pass === 0 ? this.gfN : this.gnN;
      if (!n) continue;
      ctx.globalAlpha = pass === 0 ? 0.22 : 0.5;
      ctx.beginPath();
      for (let i = 0; i < n; i += 4) {
        ctx.moveTo(buf[i], buf[i + 1]);
        ctx.lineTo(buf[i + 2], buf[i + 3]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawSprite(img: HTMLCanvasElement, dx: number, dy: number, dw: number, dh: number, clip: number, alpha: number) {
    if (dw < 1 || dx > this.W + this.pad || dx + dw < -this.pad || alpha <= 0.01) return;
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    const bottom = dy + dh;
    if (bottom > clip) {
      const clipH = bottom - clip;
      if (clipH >= dh) return;
      ctx.drawImage(img, 0, 0, img.width, img.height * (1 - clipH / dh), dx, dy, dw, dh - clipH);
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
    }
  }

  private drawPlayer(g: Game, seg: Segment, pct: number, camY: number, depth: number) {
    const ctx = this.ctx;
    const bank = g.bank;
    const scale = depth / PLAYER_Z;
    const half = scale * ROAD_WIDTH * this.xF;
    const w = PLAYER_VIS_W * half;
    const h = w * bank.playerAspect;
    const roadY = lerp(seg.y1, seg.y2, pct);
    const y = this.horizon - scale * (roadY - camY) * this.yF;
    const x = this.W / 2;
    this.carX = x;
    this.carY = y;
    this.carW = w;
    this.carH = h;
    const sp = g.speed / MAX_SPEED;
    let bounce = Math.sin(g.time * 31) * h * 0.006 * Math.min(1, sp);
    if (g.offroad && sp > 0.05) bounce += (Math.random() - 0.5) * h * 0.05;
    let rot = -g.steer * 0.025 * Math.min(1, sp * 1.5);
    if (g.crashT > 0) rot += Math.sin(g.crashT * 26) * 0.22 * (g.crashT / 0.9) * g.spinDir;
    const skew = g.steer * 0.09 * Math.min(1, sp * 2);
    const sq = g.squash;
    ctx.save();
    ctx.translate(x, y + bounce);
    ctx.rotate(rot);
    ctx.transform(1, 0, skew, 1, 0, 0);
    ctx.scale(1 + sq * 0.07, 1 - sq * 0.07);
    ctx.globalAlpha = g.invulnT > 0 && Math.floor(g.time * 18) % 2 === 0 ? 0.4 : 1;
    ctx.drawImage(bank.player, -w / 2, -h, w, h);
    ctx.globalCompositeOperation = 'lighter';
    if (g.braking && g.speed > 200) ctx.drawImage(bank.playerBrake, -w / 2, -h, w, h);
    if (g.nitroOn) {
      for (const ex of [0.293, 0.707]) {
        const fl = h * (0.45 + Math.random() * 0.35);
        const fw = w * (0.09 + Math.random() * 0.035);
        const ox = (ex - 0.5) * w;
        ctx.drawImage(bank.flame, ox - fw / 2, -h * 0.15, fw, fl);
        const gs = w * 0.22;
        ctx.drawImage(bank.glow.cyan, ox - gs / 2, -h * 0.143 - gs / 2, gs, gs);
      }
    }
    ctx.restore();
  }

  private drawSpeedLines(g: Game, dt: number) {
    const sp = g.speed / MAX_SPEED;
    const I = clamp((sp - 0.82) / 0.4, 0, 1) * 0.55 + (g.nitroOn ? 0.75 : 0);
    if (I < 0.02) return;
    const ctx = this.ctx;
    const cx = this.W / 2, cy = this.horizon;
    const R = Math.hypot(this.W, this.H) * 0.8;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = g.nitroOn ? '#7ff6ff' : '#ffffff';
    ctx.globalAlpha = 0.2 * Math.min(1.2, I);
    ctx.lineWidth = Math.max(1, 2 * this.pr);
    ctx.beginPath();
    for (const l of this.lines) {
      l.r += dt * l.v * (0.6 + I * 2.2);
      if (l.r > 1.25) {
        l.r = 0.18 + Math.random() * 0.25;
        let a = Math.random() * Math.PI * 2;
        if (a > Math.PI * 0.32 && a < Math.PI * 0.68) a += Math.PI * 0.5;
        l.a = a;
      }
      const r0 = l.r * R, r1 = (l.r + l.l * (0.6 + I)) * R;
      const ca = Math.cos(l.a), sa = Math.sin(l.a) * 0.75;
      ctx.moveTo(cx + ca * r0, cy + sa * r0);
      ctx.lineTo(cx + ca * r1, cy + sa * r1);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawBackground(g: Game, horizon: number) {
    const ctx = this.ctx;
    const W = this.W, H = this.H, pad = this.pad;
    const pal = g.palette;
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(-pad, -pad, W + pad * 2, horizon + pad + 2);
    if (pal.stars > 0.02) {
      ctx.fillStyle = '#ffffff';
      const off = g.mountOff * 0.25;
      const sw = W + pad * 2;
      for (const st of this.stars) {
        const a = pal.stars * (0.55 + 0.45 * Math.sin(g.time * 2.2 + st.p * 3));
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        const sx = wrap(st.x - off, 1) * sw - pad;
        const sy = st.y * (horizon * 0.95 + pad) - pad;
        const sz = st.s * this.pr;
        ctx.fillRect(sx, sy, sz, sz);
      }
      ctx.globalAlpha = 1;
    }
    const R = this.sunR;
    const sx = W / 2 - g.sunOff * W;
    const sy = horizon - R * 0.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(this.halo, sx - R * 2.4, sy - R * 2.4, R * 4.8, R * 4.8);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.sun, sx - R, sy - R, R * 2, R * 2);

    this.drawMountains(this.mountFar, g.mountOff, W * 1.7, horizon, this.yF * 0.36, this.farGrad, pal.css.mountFarLine, 0.75);
    if (pal.skyline > 0.02) {
      const img = g.bank.skyline;
      const sh = this.yF * 0.34;
      const tw = sh * (img.width / img.height);
      const o = wrap(g.mountOff * 1.5 * tw, tw);
      ctx.globalAlpha = pal.skyline;
      for (let xx = -pad - o; xx < W + pad; xx += tw) ctx.drawImage(img, xx, horizon - sh, tw + 1, sh);
      ctx.globalAlpha = 1;
    }
    this.drawMountains(this.mountNear, g.mountOff * 2.2, W * 1.25, horizon, this.yF * 0.2, this.nearGrad, pal.css.mountNearLine, 1);
    ctx.fillStyle = pal.css.fog;
    ctx.fillRect(-pad, horizon - 1, W + pad * 2, H + pad - horizon + 1);
  }

  private drawMountains(
    hs: Float32Array, off: number, tileW: number, base: number, scaleH: number,
    fill: CanvasGradient | string, line: string, alpha: number,
  ) {
    const ctx = this.ctx;
    const n = hs.length;
    const step = tileW / n;
    const o = wrap(off * tileW, tileW);
    const x0 = -this.pad, x1 = this.W + this.pad;
    const i0 = Math.floor((x0 + o) / step) - 1;
    const i1 = Math.ceil((x1 + o) / step) + 1;
    const hAt = (i: number) => hs[((i % n) + n) % n] * scaleH;
    ctx.beginPath();
    ctx.moveTo(i0 * step - o, base + 2);
    for (let i = i0; i <= i1; i++) ctx.lineTo(i * step - o, base - hAt(i));
    ctx.lineTo(i1 * step - o, base + 2);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      if (i === i0) ctx.moveTo(i * step - o, base - hAt(i));
      else ctx.lineTo(i * step - o, base - hAt(i));
    }
    ctx.strokeStyle = line;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(1, this.pr * 1.6);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
