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

const MODEL_URL = new URL('../models/hand_landmarker.task', self.location.href).href;
const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

let landmarker = null;

async function createLandmarker(HandLandmarker, vision, delegate) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

async function init() {
  const { HandLandmarker, FilesetResolver } = await import(BUNDLE_URL);
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
  try {
    landmarker = await createLandmarker(HandLandmarker, vision, 'GPU');
  } catch (gpuErr) {
    console.warn('[handWorker] GPU delegate gagal, mencoba CPU:', gpuErr);
    landmarker = await createLandmarker(HandLandmarker, vision, 'CPU');
  }
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
