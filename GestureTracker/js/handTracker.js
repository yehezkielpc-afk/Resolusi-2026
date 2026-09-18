// Wraps MediaPipe Tasks Vision HandLandmarker + webcam access.
import { HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

// Self-hosted (not on storage.googleapis.com) so the model still loads on
// networks that block/throttle Google Cloud Storage but allow jsdelivr.
const MODEL_URL = new URL('../models/hand_landmarker.task', import.meta.url).href;
const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Waktu habis saat ${label} (>${ms / 1000}s). Kemungkinan jaringan/firewall memblokir permintaan ini.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class HandTracker {
  constructor(videoEl) {
    this.video = videoEl;
    this.landmarker = null;
    this.lastVideoTime = -1;
  }

  async init(onStatus = () => {}) {
    onStatus('Memuat runtime AI (WASM)...');
    const vision = await withTimeout(
      FilesetResolver.forVisionTasks(WASM_BASE_URL),
      25000,
      'memuat runtime AI'
    );

    onStatus('Memuat model deteksi tangan...');
    this.landmarker = await this._createLandmarker(vision);

    onStatus('Meminta izin kamera...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 960, height: 720, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    await new Promise((resolve) => {
      this.video.onloadedmetadata = () => {
        this.video.play();
        resolve();
      };
    });
  }

  async _createLandmarker(vision) {
    const baseConfig = {
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    try {
      return await withTimeout(
        HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          ...baseConfig,
        }),
        25000,
        'memuat model deteksi tangan (GPU)'
      );
    } catch (gpuErr) {
      console.warn('GPU delegate gagal, mencoba CPU delegate:', gpuErr);
      return await withTimeout(
        HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          ...baseConfig,
        }),
        25000,
        'memuat model deteksi tangan (CPU)'
      );
    }
  }

  /** Call once per animation frame. Returns [] if no new video frame is ready. */
  detect() {
    if (!this.landmarker || this.video.readyState < 2) return [];
    if (this.video.currentTime === this.lastVideoTime) return this._lastResult || [];
    this.lastVideoTime = this.video.currentTime;

    const result = this.landmarker.detectForVideo(this.video, performance.now());
    const hands = [];
    for (let i = 0; i < result.landmarks.length; i++) {
      const handedness = result.handedness?.[i]?.[0]?.categoryName || (i === 0 ? 'Right' : 'Left');
      hands.push({ landmarks: result.landmarks[i], handedness });
    }
    this._lastResult = hands;
    return hands;
  }
}
