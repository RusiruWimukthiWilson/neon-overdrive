interface Ptr {
  x: number;
  y: number;
  sy: number;
  t: number;
  side: -1 | 1;
  swiped: boolean;
}

const STEER_L = ['ArrowLeft', 'KeyA'];
const STEER_R = ['ArrowRight', 'KeyD'];
const BRAKE = ['ArrowDown', 'KeyS'];
const NITRO = ['Space', 'ShiftLeft', 'ShiftRight', 'KeyN', 'ArrowUp', 'KeyW'];
const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

export class Input {
  private keys = new Set<string>();
  private lastSteer = 0;
  private nitroQueued = false;
  private pointers = new Map<number, Ptr>();
  private bothSince = 0;
  private el: HTMLElement | null = null;
  private gpX = 0;
  private gpBrake = false;
  private gpNitroPrev = false;
  private gpStartPrev = false;
  onGamepadStart: (() => void) | null = null;
  lastDevice: 'keys' | 'touch' | 'pad' = 'keys';

  attach(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    window.addEventListener('blur', this.reset);
    el.addEventListener('pointerdown', this.pd);
    window.addEventListener('pointermove', this.pm, { passive: true });
    window.addEventListener('pointerup', this.pu);
    window.addEventListener('pointercancel', this.pu);
    el.addEventListener('contextmenu', this.prevent);
  }

  detach() {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    window.removeEventListener('blur', this.reset);
    window.removeEventListener('pointermove', this.pm);
    window.removeEventListener('pointerup', this.pu);
    window.removeEventListener('pointercancel', this.pu);
    if (this.el) {
      this.el.removeEventListener('pointerdown', this.pd);
      this.el.removeEventListener('contextmenu', this.prevent);
    }
  }

  private prevent = (e: Event) => e.preventDefault();

  private isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private kd = (e: KeyboardEvent) => {
    if (this.isTyping(e)) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    this.lastDevice = 'keys';
    if (e.repeat) return;
    this.keys.add(e.code);
    if (STEER_L.includes(e.code)) this.lastSteer = -1;
    if (STEER_R.includes(e.code)) this.lastSteer = 1;
    if (NITRO.includes(e.code)) this.nitroQueued = true;
  };

  private ku = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  reset = () => {
    this.keys.clear();
    this.pointers.clear();
    this.nitroQueued = false;
    this.bothSince = 0;
  };

  private mid() {
    const r = this.el?.getBoundingClientRect();
    return r ? r.left + r.width / 2 : window.innerWidth / 2;
  }

  private pd = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.lastDevice = e.pointerType === 'mouse' ? 'keys' : 'touch';
    this.pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sy: e.clientY,
      t: performance.now(),
      side: e.clientX < this.mid() ? -1 : 1,
      swiped: false,
    });
  };

  private pm = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!p.swiped && p.sy - p.y > 42 && performance.now() - p.t < 450) {
      p.swiped = true;
      this.nitroQueued = true;
    }
    p.side = e.clientX < this.mid() ? -1 : 1;
  };

  private pu = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
  };

  private has(list: string[]) {
    for (const k of list) if (this.keys.has(k)) return true;
    return false;
  }

  touchSides(): [boolean, boolean] {
    let l = false;
    let r = false;
    for (const p of this.pointers.values()) {
      if (p.swiped) continue;
      if (p.side < 0) l = true;
      else r = true;
    }
    return [l, r];
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let found = false;
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      found = true;
      let x = gp.axes[0] ?? 0;
      if (gp.buttons[14]?.pressed) x = -1;
      if (gp.buttons[15]?.pressed) x = 1;
      this.gpX = Math.abs(x) > 0.18 ? x : 0;
      this.gpBrake = !!(gp.buttons[1]?.pressed || gp.buttons[6]?.pressed || gp.buttons[13]?.pressed);
      const n = !!(gp.buttons[0]?.pressed || gp.buttons[7]?.pressed || gp.buttons[5]?.pressed);
      if (n && !this.gpNitroPrev) this.nitroQueued = true;
      this.gpNitroPrev = n;
      const st = !!gp.buttons[9]?.pressed;
      if (st && !this.gpStartPrev) this.onGamepadStart?.();
      this.gpStartPrev = st;
      if (this.gpX !== 0 || n || this.gpBrake) this.lastDevice = 'pad';
      break;
    }
    if (!found) {
      this.gpX = 0;
      this.gpBrake = false;
    }
  }

  get steer(): number {
    const l = this.has(STEER_L);
    const r = this.has(STEER_R);
    let s = 0;
    if (l && r) s = this.lastSteer;
    else if (l) s = -1;
    else if (r) s = 1;
    const [tl, tr] = this.touchSides();
    if (tl && !tr) s = -1;
    else if (tr && !tl) s = 1;
    if (this.gpX !== 0) s = this.gpX;
    return s;
  }

  get brake(): boolean {
    const [tl, tr] = this.touchSides();
    const now = performance.now();
    if (tl && tr) {
      if (!this.bothSince) this.bothSince = now;
    } else this.bothSince = 0;
    return this.has(BRAKE) || this.gpBrake || (this.bothSince > 0 && now - this.bothSince > 120);
  }

  queueNitro() {
    this.nitroQueued = true;
  }

  consumeNitro(): boolean {
    const n = this.nitroQueued;
    this.nitroQueued = false;
    return n;
  }
}
