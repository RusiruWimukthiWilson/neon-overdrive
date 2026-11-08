import type { GlowKey, PuffKey, SpriteBank } from './sprites';

export const P_SPARK = 0;
export const P_GLOW = 1;
export const P_PUFF = 2;
export const P_SHARD = 3;
export const P_CONFETTI = 4;

export interface Particle {
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  g: number;
  drag: number;
  rot: number;
  vr: number;
  color: string;
  tex: HTMLCanvasElement | null;
  alpha: number;
}

export interface Popup {
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export interface Banner {
  text: string;
  sub: string;
  color: string;
  life: number;
  max: number;
  size: number;
}

const FONT = 'Orbitron, "Segoe UI", sans-serif';
const CONFETTI = ['#ff3fa4', '#00e5ff', '#ffe14d', '#7dff9a', '#b07bff', '#ffffff'];

export class FX {
  parts: Particle[] = [];
  private pool: Particle[] = [];
  popups: Popup[] = [];
  banners: Banner[] = [];
  maxParts = 460;
  private bank: SpriteBank;

  constructor(bank: SpriteBank) {
    this.bank = bank;
  }

  clear() {
    while (this.parts.length) this.pool.push(this.parts.pop()!);
    this.popups.length = 0;
    this.banners.length = 0;
  }

  spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number): Particle | null {
    if (this.parts.length >= this.maxParts) return null;
    const p = this.pool.pop() ?? ({} as Particle);
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.grow = 0;
    p.g = 0;
    p.drag = 0;
    p.rot = 0;
    p.vr = 0;
    p.color = '#fff';
    p.tex = null;
    p.alpha = 1;
    this.parts.push(p);
    return p;
  }

  /** Bright spark streaks with gravity. u = pixel unit (scales with car size). */
  sparks(x: number, y: number, n: number, u: number, dirX = 0, dirY = -1, spread = Math.PI, speed = 1) {
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * spread;
      const v = (120 + Math.random() * 420) * u * speed;
      const p = this.spawn(P_SPARK, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.45, (1.2 + Math.random() * 2.2) * u);
      if (!p) return;
      p.g = 900 * u;
      p.drag = 1.5;
      p.color = Math.random() < 0.3 ? '#ffffff' : Math.random() < 0.5 ? '#ffd36b' : '#ff8a3d';
    }
  }

  burst(x: number, y: number, n: number, key: GlowKey, u: number, speed = 1, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (60 + Math.random() * 260) * u * speed;
      const p = this.spawn(P_GLOW, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.4, (10 + Math.random() * 16) * u * size);
      if (!p) return;
      p.tex = this.bank.glow[key];
      p.drag = 3;
      p.grow = -8 * u;
    }
  }

  glow(x: number, y: number, vx: number, vy: number, life: number, size: number, key: GlowKey, grow = 0) {
    const p = this.spawn(P_GLOW, x, y, vx, vy, life, size);
    if (!p) return;
    p.tex = this.bank.glow[key];
    p.grow = grow;
  }

  puff(x: number, y: number, vx: number, vy: number, size: number, key: PuffKey, life = 0.6, alpha = 0.6) {
    const p = this.spawn(P_PUFF, x, y, vx, vy, life, size);
    if (!p) return;
    p.tex = this.bank.puff[key];
    p.grow = size * 1.6;
    p.drag = 1.2;
    p.alpha = alpha;
  }

  shards(x: number, y: number, n: number, color: string, u: number) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
      const v = (200 + Math.random() * 380) * u;
      const p = this.spawn(P_SHARD, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.6 + Math.random() * 0.5, (5 + Math.random() * 9) * u);
      if (!p) return;
      p.g = 1100 * u;
      p.vr = (Math.random() - 0.5) * 24;
      p.color = Math.random() < 0.25 ? '#2a2238' : color;
    }
  }

  confetti(W: number, H: number, n: number, u: number) {
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W;
      const p = this.spawn(P_CONFETTI, x, -20 * u - Math.random() * H * 0.2, (Math.random() - 0.5) * 120 * u, (100 + Math.random() * 220) * u, 1.6 + Math.random() * 1.2, (6 + Math.random() * 6) * u);
      if (!p) return;
      p.g = 120 * u;
      p.drag = 0.6;
      p.vr = (Math.random() - 0.5) * 14;
      p.rot = Math.random() * 6;
      p.color = CONFETTI[(Math.random() * CONFETTI.length) | 0];
    }
  }

  popup(text: string, x: number, y: number, color: string, size: number, life = 0.95) {
    if (this.popups.length > 7) this.popups.shift();
    this.popups.push({ text, x, y, vy: -size * 2.2, life, max: life, color, size });
  }

  banner(text: string, sub: string, color: string, dur: number, size = 1) {
    this.banners = this.banners.filter((b) => b.life < b.max * 0.5 && b.text !== text);
    this.banners.push({ text, sub, color, life: dur, max: dur, size });
  }

  update(dt: number) {
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        this.pool.push(p);
        continue;
      }
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size = Math.max(0.1, p.size + p.grow * dt);
      p.rot += p.vr * dt;
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y += p.vy * dt;
      p.vy *= Math.max(0, 1 - 3 * dt);
      if (p.life <= 0) this.popups.splice(i, 1);
    }
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const b = this.banners[i];
      b.life -= dt;
      if (b.life <= 0) this.banners.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const parts = this.parts;
    // normal blended first
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const t = p.life / p.max;
      if (p.kind === P_PUFF && p.tex) {
        ctx.globalAlpha = t * p.alpha;
        const s = p.size;
        ctx.drawImage(p.tex, p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.kind === P_SHARD || p.kind === P_CONFETTI) {
        ctx.globalAlpha = Math.min(1, t * 2.5);
        ctx.fillStyle = p.color;
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        const w = p.size, h = p.kind === P_CONFETTI ? p.size * 0.5 * Math.abs(Math.cos(p.rot * 1.7)) + 0.5 : p.size * 0.55;
        ctx.save();
        ctx.transform(c, s, -s, c, p.x, p.y);
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const t = p.life / p.max;
      if (p.kind === P_SPARK) {
        ctx.globalAlpha = Math.min(1, t * 1.8);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else if (p.kind === P_GLOW && p.tex) {
        ctx.globalAlpha = Math.min(1, t * 1.6) * p.alpha;
        const s = p.size;
        ctx.drawImage(p.tex, p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  drawText(ctx: CanvasRenderingContext2D, W: number, H: number, u: number, fancy: boolean) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const p of this.popups) {
      const t = 1 - p.life / p.max;
      const pop = t < 0.12 ? 1 + (0.12 - t) * 5 : 1;
      const size = p.size * pop;
      ctx.globalAlpha = Math.min(1, p.life / 0.3);
      ctx.font = `900 ${size.toFixed(1)}px ${FONT}`;
      ctx.lineWidth = size * 0.2;
      ctx.strokeStyle = 'rgba(12,0,28,0.85)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    for (const b of this.banners) {
      const t = 1 - b.life / b.max;
      const inT = Math.min(1, t / 0.1);
      const outA = Math.min(1, b.life / Math.min(0.35, b.max * 0.25));
      const scale = inT < 1 ? 1.8 - 0.8 * (1 - (1 - inT) * (1 - inT)) : 1;
      const size = Math.min(W * 0.11, 64 * u) * b.size * scale;
      const y = H * 0.3;
      ctx.globalAlpha = outA;
      ctx.font = `900 ${size.toFixed(1)}px ${FONT}`;
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = 'rgba(12,0,28,0.9)';
      ctx.strokeText(b.text, W / 2, y);
      if (fancy) {
        ctx.shadowColor = b.color;
        ctx.shadowBlur = size * 0.45;
      }
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, W / 2, y);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(b.text, W / 2, y);
      if (b.sub) {
        const ss = size * 0.36;
        ctx.font = `700 ${ss.toFixed(1)}px ${FONT}`;
        ctx.lineWidth = ss * 0.25;
        ctx.strokeText(b.sub, W / 2, y + size * 0.85);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(b.sub, W / 2, y + size * 0.85);
      }
    }
    ctx.globalAlpha = 1;
  }
}
