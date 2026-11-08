export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeIn = (a: number, b: number, p: number) => a + (b - a) * p * p;
export const easeInOut = (a: number, b: number, p: number) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const approach = (v: number, target: number, delta: number) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
export const wrap = (v: number, max: number) => {
  v %= max;
  return v < 0 ? v + max : v;
};
/** Wrap into [-max/2, max/2) – relative distance on a looping track. */
export const wrapRel = (v: number, max: number) => {
  v = wrap(v, max);
  return v >= max / 2 ? v - max : v;
};

export type RNG = () => number;
export function makeRng(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = (r: RNG, a: number, b: number) => a + (b - a) * r();
export const pick = <T>(r: RNG, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length];

export type RGB = [number, number, number];
export function hexRgb(h: string): RGB {
  let s = h.replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbCss = (c: RGB, a = 1) =>
  a >= 1
    ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
    : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
export const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
/** Lighten (amt > 0) or darken (amt < 0) a hex colour. */
export function shade(hex: string, amt: number): string {
  const c = hexRgb(hex);
  const target: RGB = amt >= 0 ? [255, 255, 255] : [0, 0, 0];
  return rgbCss(mixRgb(c, target, Math.abs(amt)));
}
export function alpha(hex: string, a: number): string {
  return rgbCss(hexRgb(hex), a);
}
export function formatScore(n: number): string {
  const s = Math.floor(n).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
}
