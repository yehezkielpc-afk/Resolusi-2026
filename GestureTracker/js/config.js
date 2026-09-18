// Central tunable configuration for gesture thresholds, colors, and object libraries.

export const COLORS = [
  { name: 'Hitam',  hex: 0x111111 },
  { name: 'Merah',  hex: 0xe11d1d },
  { name: 'Kuning', hex: 0xf5d800 },
  { name: 'Hijau',  hex: 0x1db954 },
  { name: 'Biru',   hex: 0x1d6fe1 },
  { name: 'Oranye', hex: 0xff8a1d },
  { name: 'Ungu',   hex: 0x8a2be2 },
  { name: 'Pink',   hex: 0xff5cad },
  { name: 'Coklat', hex: 0x7b4a25 },
  { name: 'Putih',  hex: 0xf5f5f5 },
];

export const SHAPE_NAMES = [
  'Kubus',
  'Balok',
  'Bola',
  'Tabung',
  'Kerucut',
  'Limas Segiempat',
  'Limas Segitiga',
  'Prisma Segitiga',
];

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const GESTURE_CONFIG = {
  // Frames a discrete gesture must be held before it fires (debounce).
  holdFrames: 6,
  // Milliseconds to block the same discrete gesture from re-firing.
  cooldownMs: 650,
  // Finger curl angle (degrees) above which a non-thumb finger counts as "extended".
  // Kept close together on purpose (small dead zone) so a naturally-held hand pose
  // reliably lands on one side or the other instead of being classified as "neither".
  fingerStraightAngleDeg: 140,
  fingerCurledAngleDeg: 125,
  // Thumb "away from palm" distance, relative to hand size (wrist->middle_mcp distance).
  thumbExtendedRatio: 0.45,
  // How long (ms) a hand keeps reporting its last recognized gesture after a frame
  // fails to classify it, to bridge brief single-frame misreads without added lag.
  gestureStickyMs: 180,
  // Vertical margin (relative to hand size) used to classify thumb up/down.
  thumbUpDownMarginRatio: 0.25,
  // Continuous gesture sensitivity.
  dragSpeed: 3.2,
  rotateSpeed: 4.2,
  scaleSpeed: 2.6,
  minScale: 0.25,
  maxScale: 3.5,
  // Smoothing factor (0..1) applied to landmark positions each frame.
  landmarkSmoothing: 0.5,
  // Minimum per-frame change in inter-hand distance (normalized) to register scale up/down.
  scaleDeltaThreshold: 0.001,
  // Max normalized tip-to-tip distance (relative to hand size) for index/middle to count as "crossed".
  crossFingersMaxDist: 0.45,
};

// Self-hosted (not unpkg) so it loads even on networks that throttle/block that CDN.
export const FONT_URL = new URL('../fonts/helvetiker_bold.typeface.json', import.meta.url).href;
