import { FOG_LEVELS } from './config';
import { hexRgb, mixRgb, rgbCss, smooth, type RGB } from './util';

export type ThemeKind = 'sunset' | 'city' | 'desert' | 'dawn';

const COLOR_KEYS = [
  'skyTop', 'skyMid', 'skyBottom', 'fog',
  'sunTop', 'sunBottom', 'sunGlow',
  'mountFar', 'mountFarLine', 'mountNear', 'mountNearLine',
  'groundLight', 'groundDark', 'grid',
  'roadLight', 'roadDark', 'rumbleLight', 'rumbleDark', 'lane', 'edge',
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export const FOG_KEYS = [
  'groundLight', 'groundDark', 'grid', 'roadLight', 'roadDark', 'rumbleLight', 'rumbleDark', 'lane', 'edge',
] as const;
export type FogKey = (typeof FOG_KEYS)[number];

export interface ZoneDef {
  name: string;
  kind: ThemeKind;
  stars: number;
  skyline: number;
  colors: Record<ColorKey, string>;
}

export const ZONES: ZoneDef[] = [
  {
    name: 'SUNSET BOULEVARD',
    kind: 'sunset',
    stars: 0.15,
    skyline: 0,
    colors: {
      skyTop: '#140430', skyMid: '#5a1670', skyBottom: '#ff7b5c', fog: '#d9457f',
      sunTop: '#fff27a', sunBottom: '#ff2d8e', sunGlow: '#ff5f8f',
      mountFar: '#5d1d78', mountFarLine: '#ff7ad9', mountNear: '#2c0b4a', mountNearLine: '#ff3fa4',
      groundLight: '#2b0f49', groundDark: '#240c3f', grid: '#ff3fa4',
      roadLight: '#2c2142', roadDark: '#261b3a', rumbleLight: '#ff3fa4', rumbleDark: '#f6ecff',
      lane: '#8ff7ff', edge: '#ff6ac6',
    },
  },
  {
    name: 'NEON CITY',
    kind: 'city',
    stars: 1,
    skyline: 1,
    colors: {
      skyTop: '#03020c', skyMid: '#140b3a', skyBottom: '#4b1780', fog: '#4a1d7a',
      sunTop: '#ff6af0', sunBottom: '#5a2cff', sunGlow: '#a347ff',
      mountFar: '#1d1446', mountFarLine: '#7a6cff', mountNear: '#120c30', mountNearLine: '#00e5ff',
      groundLight: '#0f0c27', groundDark: '#0b0920', grid: '#00e5ff',
      roadLight: '#1d1b36', roadDark: '#18162e', rumbleLight: '#00e5ff', rumbleDark: '#ff2fd1',
      lane: '#ffffff', edge: '#00e5ff',
    },
  },
  {
    name: 'CHROME DESERT',
    kind: 'desert',
    stars: 0.35,
    skyline: 0,
    colors: {
      skyTop: '#06162e', skyMid: '#14557d', skyBottom: '#ffb46b', fog: '#e0886b',
      sunTop: '#fff0b0', sunBottom: '#ff5a36', sunGlow: '#ff9a5a',
      mountFar: '#6a2d4e', mountFarLine: '#ffa36b', mountNear: '#3c1732', mountNearLine: '#ffbf47',
      groundLight: '#3c1d2f', groundDark: '#341928', grid: '#ffb347',
      roadLight: '#2f2535', roadDark: '#2a2130', rumbleLight: '#ffb347', rumbleDark: '#fff4e0',
      lane: '#fff4e0', edge: '#ffb347',
    },
  },
  {
    name: 'VAPOR DAWN',
    kind: 'dawn',
    stars: 0.05,
    skyline: 0,
    colors: {
      skyTop: '#28195c', skyMid: '#b44ea6', skyBottom: '#ffd0e6', fog: '#ee9fd0',
      sunTop: '#ffffff', sunBottom: '#ff8fd2', sunGlow: '#ffb0e0',
      mountFar: '#7d4cab', mountFarLine: '#ffffff', mountNear: '#4e2b7d', mountNearLine: '#7df9ff',
      groundLight: '#3d2066', groundDark: '#361c5b', grid: '#7df9ff',
      roadLight: '#3b3057', roadDark: '#352b50', rumbleLight: '#7df9ff', rumbleDark: '#ffffff',
      lane: '#ffffff', edge: '#7df9ff',
    },
  },
];

export const zoneForStage = (stage: number) => ZONES[(stage - 1) % ZONES.length];

type Parsed = { c: Record<ColorKey, RGB>; stars: number; skyline: number };
function parse(z: ZoneDef): Parsed {
  const c = {} as Record<ColorKey, RGB>;
  for (const k of COLOR_KEYS) c[k] = hexRgb(z.colors[k]);
  return { c, stars: z.stars, skyline: z.skyline };
}

/** Palette that cross-fades between zones and keeps fog lookup tables ready for rendering. */
export class LivePalette {
  private from: Parsed;
  private to: Parsed;
  private t = 1;
  private dur = 2.6;
  rgb = {} as Record<ColorKey, RGB>;
  css = {} as Record<ColorKey, string>;
  fog = {} as Record<FogKey, string[]>;
  stars = 0;
  skyline = 0;
  version = 0;

  constructor(z: ZoneDef) {
    this.from = parse(z);
    this.to = this.from;
    for (const k of FOG_KEYS) this.fog[k] = new Array(FOG_LEVELS).fill('#000');
    this.apply(1);
  }

  set(z: ZoneDef, instant = false) {
    const target = parse(z);
    if (instant) {
      this.from = target;
      this.to = target;
      this.t = 1;
      this.apply(1);
      return;
    }
    this.from = { c: { ...this.rgb }, stars: this.stars, skyline: this.skyline };
    this.to = target;
    this.t = 0;
  }

  update(dt: number) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.dur);
    this.apply(smooth(this.t));
  }

  private apply(k: number) {
    for (const key of COLOR_KEYS) {
      const c = mixRgb(this.from.c[key], this.to.c[key], k);
      this.rgb[key] = c;
      this.css[key] = rgbCss(c);
    }
    this.stars = this.from.stars + (this.to.stars - this.from.stars) * k;
    this.skyline = this.from.skyline + (this.to.skyline - this.from.skyline) * k;
    const fogC = this.rgb.fog;
    for (const key of FOG_KEYS) {
      const arr = this.fog[key];
      const base = this.rgb[key];
      for (let i = 0; i < FOG_LEVELS; i++) arr[i] = rgbCss(mixRgb(base, fogC, i / (FOG_LEVELS - 1)));
    }
    this.version++;
  }
}
