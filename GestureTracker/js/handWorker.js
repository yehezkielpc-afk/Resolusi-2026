// Runs MediaPipe HandLandmarker off the main thread so slow inference (especially
// with 2 hands in frame, needed for the resize gesture) never blocks rendering/UI.
import { HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const MODEL_URL = new URL('../models/hand_landmarker.task', import.meta.url).href;
const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

let landmarker = null;

async function createLandmarker(vision, delegate) {
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
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
  try {
    landmarker = await createLandmarker(vision, 'GPU');
  } catch (gpuErr) {
    console.warn('[handWorker] GPU delegate gagal, mencoba CPU:', gpuErr);
    landmarker = await createLandmarker(vision, 'CPU');
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
