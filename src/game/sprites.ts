import { makeRng, pick, shade, type RNG } from './util';

export interface SpriteDef {
  img: HTMLCanvasElement;
  wN: number; // world width in normalized road units
  aspect: number; // h / w
  hit: number; // collision width (normalized), 0 = no collision
  hitC: number; // collision centre as fraction of the image width
}

export interface CarDef extends SpriteDef {
  sigL: [number, number];
  sigR: [number, number];
  truck: boolean;
  color: string;
}

export type GlowKey = 'spark' | 'cyan' | 'pink' | 'white' | 'gold' | 'red';
export type PuffKey = 'smoke' | 'dust' | 'dark';

export interface SpriteBank {
  player: HTMLCanvasElement;
  playerBrake: HTMLCanvasElement;
  playerAspect: number;
  cars: CarDef[];
  trucks: CarDef[];
  palms: SpriteDef[];
  lampL: SpriteDef;
  lampR: SpriteDef;
  billboards: SpriteDef[];
  chevL: SpriteDef;
  chevR: SpriteDef;
  buildings: SpriteDef[];
  cacti: SpriteDef[];
  rocks: SpriteDef[];
  gateStart: SpriteDef;
  gateCheck: SpriteDef;
  orb: HTMLCanvasElement;
  flame: HTMLCanvasElement;
  glow: Record<GlowKey, HTMLCanvasElement>;
  puff: Record<PuffKey, HTMLCanvasElement>;
  skyline: HTMLCanvasElement;
  vignette: HTMLCanvasElement;
}

const FONT = 'Orbitron, "Segoe UI", sans-serif';

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return [c, c.getContext('2d')!];
}

function rr(p: CanvasPath, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
}

function fillRR(
  g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
  style: string | CanvasGradient,
) {
  g.beginPath();
  rr(g, x, y, w, h, r);
  g.fillStyle = style;
  g.fill();
}

function mkDef(img: HTMLCanvasElement, wN: number, hit = 0, hitC = 0.5): SpriteDef {
  return { img, wN, aspect: img.height / img.width, hit, hitC };
}

function mirror(d: SpriteDef): SpriteDef {
  const [c, g] = mk(d.img.width, d.img.height);
  g.translate(c.width, 0);
  g.scale(-1, 1);
  g.drawImage(d.img, 0, 0);
  return { ...d, img: c, hitC: 1 - d.hitC };
}

function polyline(g: CanvasRenderingContext2D, pts: [number, number][]) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
}

function drawPlayerCar() {
  const W = 512, H = 300;
  const [c, g] = mk(W, H);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.ellipse(256, 282, 250, 18, 0, 0, Math.PI * 2);
  g.fill();
  fillRR(g, 30, 196, 86, 90, 16, '#07060c');
  fillRR(g, 396, 196, 86, 90, 16, '#07060c');
  g.fillStyle = '#231d33';
  for (let i = 0; i < 5; i++) {
    g.fillRect(40, 208 + i * 15, 66, 4);
    g.fillRect(406, 208 + i * 15, 66, 4);
  }
  const body = new Path2D();
  body.moveTo(44, 264);
  body.lineTo(468, 264);
  body.quadraticCurveTo(500, 262, 502, 232);
  body.lineTo(504, 178);
  body.quadraticCurveTo(502, 148, 470, 136);
  body.lineTo(42, 136);
  body.quadraticCurveTo(10, 148, 8, 178);
  body.lineTo(10, 232);
  body.quadraticCurveTo(12, 262, 44, 264);
  body.closePath();
  const bg = g.createLinearGradient(0, 130, 0, 266);
  bg.addColorStop(0, '#ff86a6');
  bg.addColorStop(0.22, '#ff2a62');
  bg.addColorStop(0.65, '#b3103f');
  bg.addColorStop(1, '#45051a');
  g.fillStyle = bg;
  g.fill(body);
  const sg = g.createLinearGradient(0, 0, W, 0);
  sg.addColorStop(0, 'rgba(0,0,0,0.38)');
  sg.addColorStop(0.12, 'rgba(0,0,0,0)');
  sg.addColorStop(0.88, 'rgba(0,0,0,0)');
  sg.addColorStop(1, 'rgba(0,0,0,0.38)');
  g.fillStyle = sg;
  g.fill(body);

  const cabin = new Path2D();
  cabin.moveTo(108, 140);
  cabin.lineTo(404, 140);
  cabin.lineTo(364, 62);
  cabin.quadraticCurveTo(357, 48, 340, 48);
  cabin.lineTo(172, 48);
  cabin.quadraticCurveTo(155, 48, 148, 62);
  cabin.closePath();
  const cg = g.createLinearGradient(0, 48, 0, 140);
  cg.addColorStop(0, '#ff7396');
  cg.addColorStop(1, '#c0154a');
  g.fillStyle = cg;
  g.fill(cabin);

  const win = new Path2D();
  win.moveTo(132, 132);
  win.lineTo(380, 132);
  win.lineTo(347, 64);
  win.lineTo(165, 64);
  win.closePath();
  const wg = g.createLinearGradient(0, 64, 0, 132);
  wg.addColorStop(0, '#3a2468');
  wg.addColorStop(1, '#0c0720');
  g.fillStyle = wg;
  g.fill(win);
  g.save();
  g.clip(win);
  g.fillStyle = 'rgba(255,255,255,0.13)';
  g.beginPath();
  g.moveTo(210, 64);
  g.lineTo(262, 64);
  g.lineTo(206, 132);
  g.lineTo(154, 132);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(140,240,255,0.28)';
  g.fillRect(150, 64, 220, 3);
  g.restore();

  g.strokeStyle = 'rgba(255,225,235,0.8)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(46, 139);
  g.lineTo(466, 139);
  g.stroke();

  const panel = new Path2D();
  rr(panel, 30, 158, 452, 60, 10);
  g.save();
  g.shadowColor = '#ff2050';
  g.shadowBlur = 26;
  g.fillStyle = '#ff1744';
  g.fill(panel);
  g.restore();
  const tg = g.createLinearGradient(30, 0, 482, 0);
  tg.addColorStop(0, '#ff2a50');
  tg.addColorStop(0.16, '#ff8aa2');
  tg.addColorStop(0.3, '#c0123a');
  tg.addColorStop(0.42, '#3a0614');
  tg.addColorStop(0.58, '#3a0614');
  tg.addColorStop(0.7, '#c0123a');
  tg.addColorStop(0.84, '#ff8aa2');
  tg.addColorStop(1, '#ff2a50');
  g.fillStyle = tg;
  g.fill(panel);
  g.save();
  g.clip(panel);
  g.fillStyle = 'rgba(25,0,10,0.72)';
  for (let y = 162; y < 220; y += 8) g.fillRect(30, y, 452, 3);
  g.restore();
  g.fillStyle = '#ffd36b';
  g.beginPath();
  g.moveTo(256, 174);
  g.lineTo(267, 188);
  g.lineTo(256, 202);
  g.lineTo(245, 188);
  g.closePath();
  g.fill();

  fillRR(g, 22, 224, 468, 34, 12, '#1c0c1a');
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.fillRect(34, 226, 444, 3);
  fillRR(g, 212, 230, 88, 22, 3, '#efe9ff');
  g.fillStyle = '#2a1050';
  g.font = 'bold 15px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('OVR-86', 256, 242);
  for (const ex of [150, 362]) {
    g.fillStyle = '#3a3646';
    g.beginPath();
    g.ellipse(ex, 257, 17, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#05050a';
    g.beginPath();
    g.ellipse(ex, 257, 11, 5.5, 0, 0, Math.PI * 2);
    g.fill();
  }

  const [b, bg2] = mk(W, H);
  bg2.save();
  bg2.shadowColor = '#ff2050';
  bg2.shadowBlur = 40;
  bg2.fillStyle = 'rgba(255,70,100,0.95)';
  bg2.beginPath();
  rr(bg2, 30, 158, 150, 60, 10);
  rr(bg2, 332, 158, 150, 60, 10);
  bg2.fill();
  bg2.restore();
  return { img: c, brake: b, aspect: H / W };
}

function glowRR(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, col: string, blur: number) {
  g.save();
  g.shadowColor = col;
  g.shadowBlur = blur;
  fillRR(g, x, y, w, h, r, col);
  g.restore();
}

function carShadow(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function drawSedan(color: string): CarDef {
  const W = 320, H = 232;
  const [c, g] = mk(W, H);
  carShadow(g, 160, 218, 156, 13);
  fillRR(g, 20, 150, 56, 70, 10, '#08070d');
  fillRR(g, 244, 150, 56, 70, 10, '#08070d');
  const bg = g.createLinearGradient(0, 100, 0, 210);
  bg.addColorStop(0, shade(color, 0.35));
  bg.addColorStop(0.4, color);
  bg.addColorStop(1, shade(color, -0.6));
  fillRR(g, 10, 102, 300, 104, 16, bg);
  const cab = new Path2D();
  cab.moveTo(50, 110);
  cab.lineTo(270, 110);
  cab.lineTo(246, 34);
  cab.quadraticCurveTo(242, 26, 232, 26);
  cab.lineTo(88, 26);
  cab.quadraticCurveTo(78, 26, 74, 34);
  cab.closePath();
  g.fillStyle = shade(color, -0.18);
  g.fill(cab);
  const win = new Path2D();
  win.moveTo(66, 104);
  win.lineTo(254, 104);
  win.lineTo(234, 38);
  win.lineTo(86, 38);
  win.closePath();
  const wg = g.createLinearGradient(0, 38, 0, 104);
  wg.addColorStop(0, '#2c2550');
  wg.addColorStop(1, '#0a0818');
  g.fillStyle = wg;
  g.fill(win);
  g.save();
  g.clip(win);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.moveTo(120, 38);
  g.lineTo(152, 38);
  g.lineTo(120, 104);
  g.lineTo(88, 104);
  g.closePath();
  g.fill();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.fillRect(16, 106, 288, 2);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(16, 122, 288, 3);
  for (const x of [20, 228]) {
    glowRR(g, x, 130, 72, 30, 6, '#ff2448', 16);
    fillRR(g, x + 6, 134, 60, 9, 3, '#ff8a9c');
  }
  fillRR(g, 20, 130, 18, 30, 5, '#6a3200');
  fillRR(g, 282, 130, 18, 30, 5, '#6a3200');
  const cb = g.createLinearGradient(0, 178, 0, 200);
  cb.addColorStop(0, '#e6e6f2');
  cb.addColorStop(1, '#5a5a70');
  fillRR(g, 8, 178, 304, 22, 8, cb);
  fillRR(g, 128, 166, 64, 20, 3, '#f0f0ff');
  g.fillStyle = '#333';
  g.fillRect(138, 174, 44, 4);
  return { ...mkDef(c, 0.34, 0.34), sigL: [29 / W, 145 / H], sigR: [291 / W, 145 / H], truck: false, color };
}

function drawCoupe(color: string): CarDef {
  const W = 320, H = 196;
  const [c, g] = mk(W, H);
  carShadow(g, 160, 184, 156, 11);
  fillRR(g, 18, 128, 60, 60, 10, '#08070d');
  fillRR(g, 242, 128, 60, 60, 10, '#08070d');
  const body = new Path2D();
  body.moveTo(24, 176);
  body.lineTo(296, 176);
  body.quadraticCurveTo(316, 172, 316, 150);
  body.lineTo(314, 112);
  body.quadraticCurveTo(310, 92, 290, 88);
  body.lineTo(30, 88);
  body.quadraticCurveTo(10, 92, 6, 112);
  body.lineTo(4, 150);
  body.quadraticCurveTo(4, 172, 24, 176);
  body.closePath();
  const bg = g.createLinearGradient(0, 86, 0, 178);
  bg.addColorStop(0, shade(color, 0.4));
  bg.addColorStop(0.35, color);
  bg.addColorStop(1, shade(color, -0.65));
  g.fillStyle = bg;
  g.fill(body);
  const cab = new Path2D();
  cab.moveTo(76, 92);
  cab.lineTo(244, 92);
  cab.lineTo(220, 34);
  cab.quadraticCurveTo(216, 26, 206, 26);
  cab.lineTo(114, 26);
  cab.quadraticCurveTo(104, 26, 100, 34);
  cab.closePath();
  g.fillStyle = shade(color, -0.12);
  g.fill(cab);
  const win = new Path2D();
  win.moveTo(90, 88);
  win.lineTo(230, 88);
  win.lineTo(212, 38);
  win.lineTo(108, 38);
  win.closePath();
  g.fillStyle = '#0d0a20';
  g.fill(win);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.beginPath();
  g.moveTo(130, 38);
  g.lineTo(150, 38);
  g.lineTo(128, 88);
  g.lineTo(108, 88);
  g.closePath();
  g.fill();
  fillRR(g, 12, 78, 296, 10, 4, shade(color, -0.4));
  glowRR(g, 14, 112, 292, 16, 6, '#ff1f4a', 18);
  fillRR(g, 30, 115, 260, 5, 2, '#ff9aaa');
  fillRR(g, 14, 112, 24, 16, 5, '#6a3200');
  fillRR(g, 282, 112, 24, 16, 5, '#6a3200');
  fillRR(g, 30, 146, 260, 24, 6, '#15121e');
  for (const ex of [124, 196]) {
    g.fillStyle = '#3a3646';
    g.beginPath();
    g.arc(ex, 160, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(ex, 160, 5, 0, Math.PI * 2);
    g.fill();
  }
  return { ...mkDef(c, 0.35, 0.35), sigL: [26 / W, 120 / H], sigR: [294 / W, 120 / H], truck: false, color };
}

function drawTruck(color: string, stripe: string, label: string): CarDef {
  const W = 320, H = 340;
  const [c, g] = mk(W, H);
  carShadow(g, 160, 328, 156, 12);
  fillRR(g, 22, 262, 58, 72, 10, '#08070d');
  fillRR(g, 240, 262, 58, 72, 10, '#08070d');
  const bg = g.createLinearGradient(0, 6, 0, 276);
  bg.addColorStop(0, shade(color, 0.3));
  bg.addColorStop(1, shade(color, -0.45));
  fillRR(g, 6, 6, 308, 270, 10, bg);
  g.fillStyle = 'rgba(0,0,0,0.14)';
  for (let y = 30; y < 262; y += 34) g.fillRect(14, y, 292, 3);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(158, 14, 4, 252);
  g.fillStyle = '#555066';
  g.fillRect(140, 180, 12, 30);
  g.fillRect(168, 180, 12, 30);
  g.fillStyle = stripe;
  g.fillRect(6, 112, 308, 38);
  g.fillStyle = '#ffffff';
  g.font = `900 22px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 160, 132);
  fillRR(g, 4, 270, 312, 22, 4, '#1a1822');
  glowRR(g, 12, 236, 40, 24, 4, '#ff2448', 14);
  glowRR(g, 268, 236, 40, 24, 4, '#ff2448', 14);
  fillRR(g, 12, 210, 40, 20, 4, '#6a3200');
  fillRR(g, 268, 210, 40, 20, 4, '#6a3200');
  fillRR(g, 130, 274, 60, 14, 2, '#f0f0ff');
  return { ...mkDef(c, 0.42, 0.42), sigL: [32 / W, 220 / H], sigR: [288 / W, 220 / H], truck: true, color };
}

function drawFrond(g: CanvasRenderingContext2D, x0: number, y0: number, ang: number, L: number, fill: string, rim: string) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const p1x = x0 + dx * L * 0.55, p1y = y0 + dy * L * 0.55 - L * 0.18;
  const p2x = x0 + dx * L, p2y = y0 + dy * L * 0.6 + L * 0.42;
  const N = 18;
  const top: [number, number][] = [];
  const bot: [number, number][] = [];
  const mid: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * p1x + t * t * p2x;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * p1y + t * t * p2y;
    const tx = 2 * (1 - t) * (p1x - x0) + 2 * t * (p2x - p1x);
    const ty = 2 * (1 - t) * (p1y - y0) + 2 * t * (p2y - p1y);
    const l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l, ny = tx / l;
    const w = Math.sin(Math.PI * Math.min(1, t * 1.1)) * 17 * (1 - t * 0.35) * (i % 2 ? 0.5 : 1);
    top.push([x + nx * w, y + ny * w]);
    bot.push([x - nx * w, y - ny * w]);
    mid.push([x, y]);
  }
  g.beginPath();
  g.moveTo(x0, y0);
  top.forEach((p) => g.lineTo(p[0], p[1]));
  for (let i = N; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = rim;
  g.lineWidth = 2.5;
  polyline(g, top);
  g.stroke();
  g.strokeStyle = 'rgba(255,170,230,0.45)';
  g.lineWidth = 1.5;
  polyline(g, mid);
  g.stroke();
}

function drawPalm(seed: number, lean: number): SpriteDef {
  const r = makeRng(seed);
  const W = 480, H = 660;
  const [c, g] = mk(W, H);
  const bx = 240, by = 656;
  const tx = 240 + lean * 55, ty = 175;
  const cx = 240 - lean * 35, cy = 430;
  const N = 26;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * cx + t * t * tx;
    const y = (1 - t) * (1 - t) * by + 2 * (1 - t) * t * cy + t * t * ty;
    const dx = 2 * (1 - t) * (cx - bx) + 2 * t * (tx - cx);
    const dy = 2 * (1 - t) * (cy - by) + 2 * t * (ty - cy);
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const w = 17 - t * 8;
    left.push([x + nx * w, y + ny * w]);
    right.push([x - nx * w, y - ny * w]);
  }
  g.beginPath();
  g.moveTo(left[0][0], left[0][1]);
  left.forEach((p) => g.lineTo(p[0], p[1]));
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath();
  g.fillStyle = '#22103a';
  g.fill();
  g.strokeStyle = '#ff4fa3';
  g.lineWidth = 3;
  polyline(g, right);
  g.stroke();
  g.strokeStyle = 'rgba(255,120,200,0.28)';
  g.lineWidth = 2;
  for (let i = 1; i < N; i += 2) {
    g.beginPath();
    g.moveTo(left[i][0], left[i][1]);
    g.lineTo(right[i][0], right[i][1]);
    g.stroke();
  }
  const fronds = 9;
  for (let k = 0; k < fronds; k++) {
    const ang = -Math.PI / 2 + (k - (fronds - 1) / 2) * ((Math.PI * 1.25) / (fronds - 1)) + (r() - 0.5) * 0.25;
    drawFrond(g, tx, ty, ang, 125 + r() * 50, k % 2 ? '#2b1248' : '#331656', '#ff4fa3');
  }
  g.fillStyle = '#1a0a24';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(tx - 10 + i * 10, ty + 10 + (i % 2) * 5, 8, 0, Math.PI * 2);
    g.fill();
  }
  return mkDef(c, 1.1, 0.12, bx / W);
}

function drawLamp(): SpriteDef {
  const W = 220, H = 640;
  const [c, g] = mk(W, H);
  const pg = g.createLinearGradient(30, 0, 52, 0);
  pg.addColorStop(0, '#1b1530');
  pg.addColorStop(0.5, '#4f4472');
  pg.addColorStop(1, '#141024');
  g.fillStyle = pg;
  g.fillRect(32, 80, 18, 560);
  fillRR(g, 22, 600, 38, 40, 4, '#1b1530');
  g.fillStyle = '#ff4fd8';
  g.fillRect(40, 140, 3, 440);
  g.strokeStyle = '#2e2648';
  g.lineWidth = 12;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(41, 92);
  g.quadraticCurveTo(48, 52, 120, 52);
  g.lineTo(170, 54);
  g.stroke();
  const gl = g.createRadialGradient(176, 66, 2, 176, 66, 62);
  gl.addColorStop(0, 'rgba(230,255,255,1)');
  gl.addColorStop(0.25, 'rgba(90,240,255,0.7)');
  gl.addColorStop(1, 'rgba(90,240,255,0)');
  g.fillStyle = gl;
  g.fillRect(108, 20, 112, 120);
  fillRR(g, 140, 44, 68, 18, 8, '#2e2648');
  fillRR(g, 146, 60, 56, 6, 3, '#eaffff');
  return mkDef(c, 0.5, 0.07, 41 / W);
}

function drawBillboard(text: string, main: string, border: string, sub: string): SpriteDef {
  const W = 520, H = 420;
  const [c, g] = mk(W, H);
  g.fillStyle = '#1a1430';
  g.fillRect(120, 250, 20, 170);
  g.fillRect(380, 250, 20, 170);
  g.fillStyle = '#2a2248';
  g.fillRect(100, 300, 320, 10);
  fillRR(g, 14, 14, 492, 250, 14, '#120626');
  const inner = g.createLinearGradient(0, 14, 0, 264);
  inner.addColorStop(0, '#22103f');
  inner.addColorStop(1, '#0b0418');
  fillRR(g, 22, 22, 476, 234, 10, inner);
  g.save();
  g.shadowColor = border;
  g.shadowBlur = 18;
  g.strokeStyle = border;
  g.lineWidth = 6;
  g.beginPath();
  rr(g, 30, 30, 460, 218, 10);
  g.stroke();
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 1.5;
  g.beginPath();
  rr(g, 30, 30, 460, 218, 10);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 92;
  g.font = `900 ${size}px ${FONT}`;
  while (g.measureText(text).width > 420 && size > 40) {
    size -= 4;
    g.font = `900 ${size}px ${FONT}`;
  }
  g.save();
  g.shadowColor = main;
  g.shadowBlur = 26;
  g.fillStyle = main;
  g.fillText(text, 260, 118);
  g.shadowBlur = 0;
  g.globalAlpha = 0.5;
  g.fillStyle = '#ffffff';
  g.fillText(text, 260, 118);
  g.restore();
  g.font = `700 28px ${FONT}`;
  g.fillStyle = border;
  g.fillText(sub, 260, 208);
  return mkDef(c, 1.25, 0.68, 0.5);
}

function drawChevron(dir: 1 | -1): SpriteDef {
  const W = 200, H = 260;
  const [c, g] = mk(W, H);
  g.fillStyle = '#2a2240';
  g.fillRect(92, 120, 16, 140);
  fillRR(g, 8, 8, 184, 120, 12, '#14081f');
  g.save();
  g.shadowColor = '#ffd23f';
  g.shadowBlur = 14;
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 5;
  g.beginPath();
  rr(g, 14, 14, 172, 108, 9);
  g.stroke();
  g.restore();
  g.save();
  g.translate(100, 68);
  g.scale(dir, 1);
  g.shadowColor = '#ff3fa4';
  g.shadowBlur = 12;
  g.fillStyle = '#ffe14d';
  for (const ox of [-40, 0, 40]) {
    g.beginPath();
    g.moveTo(ox - 16, -34);
    g.lineTo(ox + 4, -34);
    g.lineTo(ox + 26, 0);
    g.lineTo(ox + 4, 34);
    g.lineTo(ox - 16, 34);
    g.lineTo(ox + 6, 0);
    g.closePath();
    g.fill();
  }
  g.restore();
  return mkDef(c, 0.38, 0.08, 0.5);
}

function drawBuilding(seed: number, H: number, hue: string): SpriteDef {
  const r = makeRng(seed);
  const W = 300;
  const [c, g] = mk(W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1d143c');
  bg.addColorStop(1, '#0a0716');
  g.fillStyle = bg;
  g.fillRect(10, 40, 280, H - 40);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(232, 40, 58, H - 40);
  const colors = ['#ffd36b', '#7df9ff', '#ff6ad5', '#ffffff'];
  for (let y = 66; y < H - 36; y += 30) {
    for (let i = 0; i < 6; i++) {
      const x = 24 + i * 42;
      if (r() < 0.5) {
        g.globalAlpha = 0.45 + r() * 0.55;
        g.fillStyle = pick(r, colors);
      } else {
        g.globalAlpha = 1;
        g.fillStyle = '#1f1838';
      }
      g.fillRect(x, y, 26, 16);
    }
  }
  g.globalAlpha = 1;
  g.save();
  g.shadowColor = hue;
  g.shadowBlur = 16;
  g.fillStyle = hue;
  g.fillRect(10, 36, 280, 6);
  g.fillRect(10, 36, 4, H - 36);
  g.restore();
  g.fillStyle = '#2a2248';
  g.fillRect(146, 0, 6, 40);
  g.fillStyle = '#ff2448';
  g.beginPath();
  g.arc(149, 5, 5, 0, Math.PI * 2);
  g.fill();
  return mkDef(c, 1.5, 1.4, 0.5);
}

function drawCactus(seed: number): SpriteDef {
  const r: RNG = makeRng(seed);
  const W = 240, H = 440;
  const [c, g] = mk(W, H);
  const p = new Path2D();
  rr(p, 98, 60, 44, 380, 22);
  const la = 110 + r() * 50, ra = 150 + r() * 50;
  rr(p, 48, la + 70, 64, 30, 15);
  rr(p, 48, la, 30, 100, 15);
  rr(p, 128, ra + 70, 64, 30, 15);
  rr(p, 162, ra, 30, 100, 15);
  g.save();
  g.shadowColor = '#3dffb0';
  g.shadowBlur = 14;
  g.fillStyle = '#0d3b3a';
  g.fill(p);
  g.restore();
  g.fillStyle = '#0d3b3a';
  g.fill(p);
  g.strokeStyle = '#3dffb0';
  g.lineWidth = 3;
  g.stroke(p);
  g.strokeStyle = 'rgba(61,255,176,0.25)';
  g.lineWidth = 2;
  for (const x of [110, 120, 130]) {
    g.beginPath();
    g.moveTo(x, 80);
    g.lineTo(x, 430);
    g.stroke();
  }
  return mkDef(c, 0.55, 0.12, 0.5);
}

function drawRock(seed: number): SpriteDef {
  const r = makeRng(seed);
  const W = 320, H = 180;
  const [c, g] = mk(W, H);
  const pts: [number, number][] = [[6, 178]];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = 10 + t * 300;
    const y = 178 - Math.sin(t * Math.PI) * (110 + r() * 50) - r() * 20;
    pts.push([x, Math.min(170, y)]);
  }
  pts.push([314, 178]);
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#5a2a52');
  gr.addColorStop(1, '#1e0c22');
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = '#ffb347';
  g.lineWidth = 3;
  polyline(g, pts.slice(1, -1));
  g.stroke();
  return mkDef(c, 0.8, 0.62, 0.5);
}

function drawGate(text: string, main: string): SpriteDef {
  const W = 1200, H = 440;
  const [c, g] = mk(W, H);
  for (const x of [0, 1136]) {
    const pg = g.createLinearGradient(x, 0, x + 64, 0);
    pg.addColorStop(0, '#120a24');
    pg.addColorStop(0.5, '#3a2c60');
    pg.addColorStop(1, '#120a24');
    fillRR(g, x, 70, 64, 370, 6, pg);
    g.save();
    g.shadowColor = main;
    g.shadowBlur = 14;
    g.fillStyle = main;
    g.fillRect(x + 28, 160, 8, 270);
    g.restore();
  }
  fillRR(g, 16, 18, 1168, 146, 12, '#0c0518');
  for (const y of [26, 140]) {
    for (let x = 28, i = 0; x < 1172; x += 16, i++) {
      g.fillStyle = i % 2 === (y === 26 ? 0 : 1) ? '#ffffff' : '#140a22';
      g.fillRect(x, y, 16, 16);
    }
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 78px ${FONT}`;
  g.save();
  g.shadowColor = main;
  g.shadowBlur = 30;
  g.fillStyle = main;
  g.fillText(text, 600, 92);
  g.shadowBlur = 0;
  g.globalAlpha = 0.55;
  g.fillStyle = '#ffffff';
  g.fillText(text, 600, 92);
  g.restore();
  return mkDef(c, 2.9, 0, 0.5);
}

function drawOrb(): HTMLCanvasElement {
  const S = 128;
  const [c, g] = mk(S, S);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(170,255,255,1)');
  gr.addColorStop(0.42, 'rgba(0,220,255,0.55)');
  gr.addColorStop(1, 'rgba(0,120,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(64, 28);
  g.lineTo(92, 64);
  g.lineTo(64, 100);
  g.lineTo(36, 64);
  g.closePath();
  g.stroke();
  return c;
}

function drawFlame(): HTMLCanvasElement {
  const W = 64, H = 192;
  const [c, g] = mk(W, H);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.15, 'rgba(150,250,255,0.95)');
  gr.addColorStop(0.5, 'rgba(60,140,255,0.6)');
  gr.addColorStop(1, 'rgba(140,60,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(32, 0);
  g.bezierCurveTo(66, 24, 50, 120, 32, 192);
  g.bezierCurveTo(14, 120, -2, 24, 32, 0);
  g.fill();
  return c;
}

function glowTex(color: string, S = 64): HTMLCanvasElement {
  const [c, g] = mk(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.22, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

function puffTex(r: number, gC: number, b: number, S = 64): HTMLCanvasElement {
  const [c, g] = mk(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, `rgba(${r},${gC},${b},0.9)`);
  gr.addColorStop(0.5, `rgba(${r},${gC},${b},0.45)`);
  gr.addColorStop(1, `rgba(${r},${gC},${b},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

function drawSkyline(): HTMLCanvasElement {
  const W = 1024, H = 256;
  const [c, g] = mk(W, H);
  const r = makeRng(77);
  const cols = ['#ffd36b', '#7df9ff', '#ff6ad5'];
  let x = 0;
  while (x < W) {
    let bw = 30 + r() * 70;
    if (x + bw > W - 30) bw = W - x;
    const bh = 50 + r() * 190;
    g.fillStyle = '#0b0822';
    g.fillRect(x, H - bh, bw + 1, bh);
    for (let wy = H - bh + 8; wy < H - 6; wy += 9) {
      for (let wx = x + 5; wx < x + bw - 6; wx += 8) {
        if (r() < 0.2) {
          g.globalAlpha = 0.4 + r() * 0.6;
          g.fillStyle = pick(r, cols);
          g.fillRect(wx, wy, 3, 4);
        }
      }
    }
    g.globalAlpha = 1;
    if (r() < 0.35) {
      g.fillStyle = pick(r, ['#ff3fa4', '#00e5ff']);
      g.fillRect(x, H - bh, bw, 2);
    }
    x += bw;
  }
  return c;
}

function drawVignette(): HTMLCanvasElement {
  const S = 256;
  const [c, g] = mk(S, S);
  const gr = g.createRadialGradient(128, 128, 70, 128, 128, 182);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(6,0,18,0.72)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

export function buildSprites(): SpriteBank {
  const p = drawPlayerCar();
  const palmBase = [drawPalm(11, 0.6), drawPalm(23, -0.35), drawPalm(37, 0.15)];
  const lampL = drawLamp();
  return {
    player: p.img,
    playerBrake: p.brake,
    playerAspect: p.aspect,
    cars: [
      drawSedan('#00c8e8'),
      drawSedan('#ffcf3a'),
      drawSedan('#eeeefa'),
      drawSedan('#8a5cff'),
      drawCoupe('#ff8a3d'),
      drawCoupe('#3dff9a'),
      drawCoupe('#ff4fd8'),
      drawSedan('#ff0055'),
      drawSedan('#00ff66'),
      drawCoupe('#9900ff'),
    ],
    trucks: [
      drawTruck('#e8e6f0', '#ff3fa4', 'NEON EXPRESS'),
      drawTruck('#b9c3d6', '#00a8c8', 'SYNTH FREIGHT'),
      drawTruck('#1a1a2e', '#ffb347', 'CYBER CARGO'),
      drawTruck('#2d0b00', '#ff2448', 'HAZMAT 86'),
    ],
    palms: [...palmBase, ...palmBase.map(mirror)],
    lampL,
    lampR: mirror(lampL),
    billboards: [
      drawBillboard('TURBO', '#ff4fd8', '#00e5ff', 'MAXIMUM POWER'),
      drawBillboard('NEON', '#00f0ff', '#ff3fa4', 'NIGHTS FOREVER'),
      drawBillboard('1986', '#ffd23f', '#ff6a3d', 'RADIO 86.5 FM'),
      drawBillboard('DRIVE', '#7dff9a', '#b07bff', 'NEVER STOP'),
    ],
    chevL: drawChevron(-1),
    chevR: drawChevron(1),
    buildings: [
      drawBuilding(5, 760, '#00e5ff'),
      drawBuilding(9, 620, '#ff3fa4'),
      drawBuilding(13, 700, '#b07bff'),
      drawBuilding(17, 540, '#ffd36b'),
    ],
    cacti: [drawCactus(3), drawCactus(8), drawCactus(21)],
    rocks: [drawRock(4), drawRock(12)],
    gateStart: drawGate('START', '#ffe14d'),
    gateCheck: drawGate('CHECKPOINT', '#4ff4ff'),
    orb: drawOrb(),
    flame: drawFlame(),
    glow: {
      spark: glowTex('rgba(255,170,60,0.9)'),
      cyan: glowTex('rgba(80,240,255,0.9)'),
      pink: glowTex('rgba(255,80,170,0.9)'),
      white: glowTex('rgba(255,255,255,0.9)'),
      gold: glowTex('rgba(255,215,70,0.9)'),
      red: glowTex('rgba(255,50,80,0.9)'),
    },
    puff: {
      smoke: puffTex(225, 215, 240),
      dust: puffTex(170, 120, 170),
      dark: puffTex(40, 30, 50),
    },
    skyline: drawSkyline(),
    vignette: drawVignette(),
  };
}