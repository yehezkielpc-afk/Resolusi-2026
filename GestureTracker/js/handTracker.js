// Wraps MediaPipe Tasks Vision HandLandmarker + webcam access.
import { HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

export class HandTracker {
  constructor(videoEl) {
    this.video = videoEl;
    this.landmarker = null;
    this.lastVideoTime = -1;
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

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
