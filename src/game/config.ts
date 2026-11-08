// Core tuning constants for the pseudo-3D racer.
export const SEGMENT_LENGTH = 200;
export const RUMBLE_LENGTH = 3;
export const ROAD_WIDTH = 2000;
export const LANES = 3;
export const LANE_CENTERS = [-2 / 3, 0, 2 / 3];
export const CAMERA_HEIGHT = 1000;
export const BASE_FOV = 100;
export const fovToDepth = (fov: number) => 1 / Math.tan(((fov / 2) * Math.PI) / 180);
export const BASE_DEPTH = fovToDepth(BASE_FOV);
export const PLAYER_Z = CAMERA_HEIGHT * BASE_DEPTH;

export const MAX_SPEED = 12000; // world units / second
export const NITRO_MULT = 1.45;
export const CENTRIFUGAL = 0.3;

export const ZONE_SEGMENTS = 1200;
export const TRACK_SEGMENTS = ZONE_SEGMENTS * 2;
export const TRACK_LENGTH = TRACK_SEGMENTS * SEGMENT_LENGTH;
export const ZONE_LENGTH = ZONE_SEGMENTS * SEGMENT_LENGTH;
export const GATE_OFFSET = 20; // segment index (within zone) of the checkpoint gate

export const PLAYER_W = 0.3; // collision width (normalized road units, road = -1..1)
export const PLAYER_VIS_W = 0.36; // visual width
export const ORB_W = 0.24;
export const X_LIMIT = 2.15;
export const OFFROAD_LIMIT = 0.42;
export const NEAR_MISS_GAP = 0.2;

export const START_TIME = 35;
export const MAX_TIME = 99;

export const FOG_LEVELS = 24;
export const FOG_DENSITY = 4.2;

export const KMH = 290 / MAX_SPEED;
export const UNIT_TO_KM = 80.56 / MAX_SPEED / 1000;

/* ------------------------------------------------------------------ New Gameplay & Shop Tuning */
export const SHIELD_ORB_CHANCE = 0.15; // 15% spawn chance for Shield Orbs
export const COIN_ORB_CHANCE = 0.35;   // 35% spawn chance for Coins

export interface CarSkin {
  id: string;
  name: string;
  price: number;
  color: string;
  stripeColor: string;
}

export const CAR_SKINS: CarSkin[] = [
  { id: 'cyan_blaster', name: 'CYAN BLASTER', price: 0, color: '#00e5ff', stripeColor: '#ff0055' },
  { id: 'neon_pink', name: 'NEON RUNNER', price: 50, color: '#ff0055', stripeColor: '#ffe14d' },
  { id: 'gold_phantom', name: 'GOLD PHANTOM', price: 150, color: '#ffcf3a', stripeColor: '#00e5ff' },
  { id: 'cyber_purple', name: 'VOID VIPER', price: 300, color: '#9900ff', stripeColor: '#00ff66' },
];