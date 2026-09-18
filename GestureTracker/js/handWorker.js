// Runs MediaPipe HandLandmarker off the main thread so slow inference (especially
// with 2 hands in frame, needed for the resize gesture) never blocks rendering/UI.
//
// This MUST be a classic (non-module) worker: MediaPipe's WASM glue code calls the
// legacy importScripts() API internally when it detects it's running in a Worker,
// and browsers throw ("Module scripts don't support importScripts()") if the worker
// itself was created with {type: 'module'}. So instead of a static top-level
// `import`, we load the ESM bundle via dynamic import() below, which classic worker
// scripts do support — that keeps this a classic worker (importScripts works) while
// still getting at the ESM-only library.
//
// import.meta is invalid syntax outside a module, so self.location (always
// available in a Worker) is used instead to resolve the model path.
//
// Delegate is CPU-only on purpose: MediaPipe's GPU delegate creates its own
// WebGL/OffscreenCanvas context, which is a known rough edge inside Workers across
// browsers/GPUs -- it can hang instead of cleanly failing, which a normal
// try/catch fallback can't recover from. We're already throttling detection to a
// low fixed rate, so raw GPU speed isn't worth that reliability risk here.

const MODEL_URL = new URL('../models/hand_landmarker.task', self.location.href).href;
const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

let landmarker = null;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Waktu habis saat ${label} (>${ms / 1000}s).`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function init() {
  const { HandLandmarker, FilesetResolver } = await withTimeout(
    import(BUNDLE_URL),
    15000,
    'memuat pustaka MediaPipe'
  );
  const vision = await withTimeout(
    FilesetResolver.forVisionTasks(WASM_BASE_URL),
    15000,
    'memuat runtime WASM'
  );
  landmarker = await withTimeout(
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
    20000,
    'memuat model deteksi tangan'
  );
}

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      await init();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'initError', error: String(err?.message || err) });
    }
    return;
  }

  if (msg.type === 'frame') {
    const { bitmap, timestamp } = msg;
    try {
      if (!landmarker) throw new Error('Landmarker belum siap');
      const result = landmarker.detectForVideo(bitmap, timestamp);
      const hands = [];
      for (let i = 0; i < result.landmarks.length; i++) {
        const handedness = result.handedness?.[i]?.[0]?.categoryName || (i === 0 ? 'Right' : 'Left');
        hands.push({ landmarks: result.landmarks[i], handedness });
      }
      self.postMessage({ type: 'result', hands });
    } catch (err) {
      self.postMessage({ type: 'detectError', error: String(err?.message || err) });
    } finally {
      bitmap.close();
    }
  }
};
