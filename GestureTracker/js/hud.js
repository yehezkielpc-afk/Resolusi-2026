// Small DOM helper for updating the HUD overlay and drawing the hand-skeleton debug view.
import { COLORS } from './config.js';

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

export class Hud {
  constructor() {
    this.modeEl = document.getElementById('hud-mode');
    this.nameEl = document.getElementById('hud-name');
    this.colorSwatchEl = document.getElementById('hud-color-swatch');
    this.colorNameEl = document.getElementById('hud-color-name');
    this.placedCountEl = document.getElementById('hud-placed-count');
    this.gestureLeftEl = document.getElementById('hud-gesture-left');
    this.gestureRightEl = document.getElementById('hud-gesture-right');
    this.twoHandEl = document.getElementById('hud-two-hand');
    this.statusEl = document.getElementById('hud-status');
    this.overlayCanvas = document.getElementById('overlay-canvas');
    this.overlayCtx = this.overlayCanvas.getContext('2d');
  }

  setStatus(text) {
    this.statusEl.textContent = text;
    this.statusEl.style.display = text ? 'block' : 'none';
  }

  update({ mode, name, colorHex, placedCount, hands, twoHandGesture }) {
    this.modeEl.textContent = mode === 'shape' ? 'Bangun Ruang' : 'Huruf';
    this.nameEl.textContent = name ?? '-';
    const colorEntry = COLORS.find((c) => c.hex === colorHex);
    this.colorSwatchEl.style.background = '#' + colorHex.toString(16).padStart(6, '0');
    this.colorNameEl.textContent = colorEntry ? colorEntry.name : '-';
    this.placedCountEl.textContent = String(placedCount);

    const left = hands.find((h) => h.label === 'Left');
    const right = hands.find((h) => h.label === 'Right');
    this.gestureLeftEl.textContent = left ? (left.gesture ?? '(tidak dikenali)') : '-';
    this.gestureRightEl.textContent = right ? (right.gesture ?? '(tidak dikenali)') : '-';
    this.twoHandEl.textContent = twoHandGesture ?? '-';
  }

  drawSkeleton(hands, videoWidth, videoHeight) {
    const canvas = this.overlayCanvas;
    if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
      canvas.width = videoWidth;
      canvas.height = videoHeight;
    }
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const hand of hands) {
      ctx.strokeStyle = hand.label === 'Left' ? '#4fd1ff' : '#ff9f4f';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        const pa = hand.landmarks[a];
        const pb = hand.landmarks[b];
        ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
        ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
      }
      ctx.stroke();
      for (const p of hand.landmarks) {
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
