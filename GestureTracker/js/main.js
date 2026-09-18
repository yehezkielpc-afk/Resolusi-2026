// Lightweight, CDN-independent imports only — this guarantees the consent button
// always gets its click handler attached, even if the heavy three.js/MediaPipe
// CDN modules (imported lazily below) fail to load in a given browser/network.
import { GestureEngine } from './gestureEngine.js';
import { Hud } from './hud.js';
import { COLORS, SHAPE_NAMES, LETTERS, GESTURE_CONFIG as CFG } from './config.js';

class DebounceTrigger {
  constructor(holdFrames, cooldownMs) {
    this.holdFrames = holdFrames;
    this.cooldownMs = cooldownMs;
    this.count = 0;
    this.coolUntil = 0;
  }
  update(active) {
    const now = performance.now();
    if (!active) { this.count = 0; return false; }
    if (now < this.coolUntil) return false;
    this.count++;
    if (this.count === this.holdFrames) {
      this.coolUntil = now + this.cooldownMs;
      this.count = 0;
      return true;
    }
    return false;
  }
}

class App {
  constructor() {
    this.video = document.getElementById('webcam');
    this.canvas = document.getElementById('scene-canvas');
    this.hud = new Hud();
    this.engine = new GestureEngine();

    // Created lazily inside _initAndRun(), only once the user has clicked through
    // the consent card — these depend on CDN modules (three.js, MediaPipe) that
    // may fail to load, so they must never block constructing App itself.
    this.tracker = null;
    this.scene = null;

    this.mode = 'shape';
    this.shapeIndex = 0;
    this.letterIndex = 0;
    this.colorIndex = 4; // biru

    this.triggers = {
      next: new DebounceTrigger(CFG.holdFrames, CFG.cooldownMs),
      prev: new DebounceTrigger(CFG.holdFrames, CFG.cooldownMs),
      toggleMode: new DebounceTrigger(CFG.holdFrames, CFG.cooldownMs),
      cycleColor: new DebounceTrigger(CFG.holdFrames, CFG.cooldownMs),
      place: new DebounceTrigger(CFG.holdFrames, CFG.cooldownMs),
      delete: new DebounceTrigger(CFG.holdFrames, CFG.cooldownMs),
    };

    this._lastDetectTime = 0;
    this._rotatingHandLabel = null; // which hand (if any) is currently driving orientation-tracked rotation

    this._bindKeyboardFallback();
  }

  get currentName() {
    return this.mode === 'shape' ? SHAPE_NAMES[this.shapeIndex] : LETTERS[this.letterIndex];
  }

  /** Binds the consent button immediately. Must not throw or await anything before addEventListener. */
  bindConsentButton() {
    const overlay = document.getElementById('camera-consent');
    const allowBtn = document.getElementById('consent-allow-btn');
    const errorEl = document.getElementById('consent-error');

    allowBtn.addEventListener('click', async () => {
      allowBtn.disabled = true;
      allowBtn.textContent = 'Memulai...';
      errorEl.style.display = 'none';
      try {
        await this._initAndRun((status) => { allowBtn.textContent = status; });
        overlay.classList.add('hidden');
      } catch (err) {
        console.error('Gesture Tracker gagal memulai:', err);
        errorEl.textContent = this._describeError(err);
        errorEl.style.display = 'block';
        allowBtn.disabled = false;
        allowBtn.textContent = 'Coba Lagi';
      }
    });
  }

  _describeError(err) {
    const name = err?.name;
    const message = String(err?.message || err || '');
    if (name === 'NotAllowedError') {
      return 'Izin kamera ditolak. Klik ikon kamera di address bar browser untuk mengizinkan, lalu coba lagi.';
    }
    if (name === 'NotFoundError') {
      return 'Tidak ada kamera yang terdeteksi di perangkat ini.';
    }
    if (name === 'NotReadableError') {
      return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi lain yang memakai kamera, lalu coba lagi.';
    }
    if (/failed to fetch|dynamically imported module|networkerror/i.test(message)) {
      return 'Gagal memuat komponen 3D/AI dari CDN — kemungkinan diblokir ad-blocker, ekstensi privasi, atau firewall jaringan. Coba nonaktifkan sementara lalu klik lagi. (' + message + ')';
    }
    return 'Gagal mengakses kamera/model: ' + message;
  }

  async _initAndRun(onStatus) {
    onStatus('Memuat modul 3D...');
    const [{ SceneManager }, { HandTracker }] = await Promise.all([
      import('./sceneManager.js'),
      import('./handTracker.js'),
    ]);
    this.scene = new SceneManager(this.canvas);
    this.tracker = new HandTracker(this.video);

    await this.tracker.init(onStatus);
    this.scene.setModeAndName(this.mode, this.currentName);
    this.scene.setColor(COLORS[this.colorIndex].hex);
    this._loop();
  }

  _advance(dir) {
    if (this.mode === 'shape') {
      this.shapeIndex = (this.shapeIndex + dir + SHAPE_NAMES.length) % SHAPE_NAMES.length;
    } else {
      this.letterIndex = (this.letterIndex + dir + LETTERS.length) % LETTERS.length;
    }
    this.scene?.setName(this.currentName);
  }

  _toggleMode() {
    this.mode = this.mode === 'shape' ? 'letter' : 'shape';
    this.scene?.setModeAndName(this.mode, this.currentName);
  }

  _cycleColor() {
    this.colorIndex = (this.colorIndex + 1) % COLORS.length;
    this.scene?.setColor(COLORS[this.colorIndex].hex);
  }

  _bindKeyboardFallback() {
    window.addEventListener('keydown', (e) => {
      if (!this.scene) return; // not initialized yet (consent not granted)
      switch (e.key) {
        case 'ArrowUp': this._advance(1); break;
        case 'ArrowDown': this._advance(-1); break;
        case 'Tab': e.preventDefault(); this._toggleMode(); break;
        case 'c': case 'C': this._cycleColor(); break;
        case 'a': case 'A': this.scene.translateControlled(-0.02, 0); break;
        case 'd': case 'D': this.scene.translateControlled(0.02, 0); break;
        case 'w': case 'W': this.scene.translateControlled(0, -0.02); break;
        case 's': case 'S': this.scene.translateControlled(0, 0.02); break;
        case 'q': case 'Q': this.scene.rotateControlled(-0.05, 0); break;
        case 'e': case 'E': this.scene.rotateControlled(0.05, 0); break;
        case 'r': case 'R': this.scene.rotateControlled(0, -0.05); break;
        case 'f': case 'F': this.scene.rotateControlled(0, 0.05); break;
        case 'z': case 'Z': this.scene.scaleControlled(0.96); break;
        case 'x': case 'X': this.scene.scaleControlled(1.04); break;
        case ' ': e.preventDefault(); this.scene.placeCurrent(); this._flashPlaced(); break;
        case 'Backspace': this.scene.deleteLastPlaced(); this._flashPlaced(); break;
      }
    });
  }

  _flashPlaced() {
    this.hud.placedCountEl.textContent = String(this.scene.placedObjects.length);
  }

  _handleGestures(frame) {
    const { hands, twoHand } = frame;

    // Two-hand gestures take priority and suppress the per-hand continuous ones.
    const twoHandActive = !!twoHand;
    let twoHandLabel = twoHand ? twoHand.name : null;

    if (twoHand) {
      if (twoHand.name === 'scaleUp') {
        this.scene.scaleControlled(1 + Math.min(0.06, twoHand.pairDelta * CFG.scaleSpeed));
      } else if (twoHand.name === 'scaleDown') {
        this.scene.scaleControlled(1 - Math.min(0.06, -twoHand.pairDelta * CFG.scaleSpeed));
      }
    }

    if (this.triggers.place.update(twoHand?.name === 'handsOpenPlace')) {
      this.scene.placeCurrent();
      this._flashPlaced();
    }
    if (this.triggers.delete.update(twoHand?.name === 'handsCrossedOpen')) {
      this.scene.deleteLastPlaced();
      this._flashPlaced();
    }

    let anyThumbsUp = false, anyThumbsDown = false, anyCrossed = false, anyPeace = false;
    let rotatingHand = null;

    for (const hand of hands) {
      if (hand.gesture === 'thumbsUp') anyThumbsUp = true;
      if (hand.gesture === 'thumbsDown') anyThumbsDown = true;
      if (hand.gesture === 'fingersCrossed') anyCrossed = true;
      if (hand.gesture === 'peaceSign') anyPeace = true;

      if (!twoHandActive) {
        if (hand.gesture === 'fist') {
          this.scene.translateControlled(hand.delta.x, hand.delta.y);
        } else if (hand.gesture === 'openHand') {
          rotatingHand = hand;
        }
      }
    }

    // Rotation tracks the hand's actual orientation (turn/tilt), not how far it
    // slides across the frame — beginRotate() anchors a baseline the first tick
    // the gesture is seen, updateRotate() re-derives the absolute orientation
    // from it every subsequent tick, and endRotate() releases it once the hand
    // stops showing openHand (so the next gesture starts its own fresh baseline).
    if (rotatingHand) {
      if (this._rotatingHandLabel !== rotatingHand.label) {
        this.scene.beginRotate(rotatingHand.basis);
        this._rotatingHandLabel = rotatingHand.label;
      }
      this.scene.updateRotate(rotatingHand.basis);
    } else if (this._rotatingHandLabel !== null) {
      this.scene.endRotate();
      this._rotatingHandLabel = null;
    }

    if (this.triggers.next.update(anyThumbsUp)) this._advance(1);
    if (this.triggers.prev.update(anyThumbsDown)) this._advance(-1);
    if (this.triggers.toggleMode.update(anyCrossed)) this._toggleMode();
    if (this.triggers.cycleColor.update(anyPeace)) this._cycleColor();

    this.hud.update({
      mode: this.mode,
      name: this.currentName,
      colorHex: COLORS[this.colorIndex].hex,
      placedCount: this.scene.placedObjects.length,
      hands,
      twoHandGesture: twoHandLabel,
    });
    this.hud.drawSkeleton(hands, this.video.videoWidth || 960, this.video.videoHeight || 720);
  }

  _loop() {
    // Anything thrown in here must not stop requestAnimationFrame from being
    // rescheduled below -- an uncaught error would otherwise silently kill the
    // loop forever (the page just stops updating, indistinguishable from a freeze,
    // even though the browser/OS itself is fine).
    try {
      // Hand-tracking inference is the expensive part (runs on the main thread) --
      // throttle it independently of the render loop so the 3D view stays smooth
      // instead of the whole page janking/freezing while the model runs every frame.
      const now = performance.now();
      if (now - this._lastDetectTime >= CFG.detectIntervalMs) {
        this._lastDetectTime = now;
        const rawHands = this.tracker.detect();
        const frame = this.engine.update(rawHands);
        this._handleGestures(frame);
      }
      this.scene.render();
    } catch (err) {
      console.error('Render loop error (dipulihkan, lanjut ke frame berikutnya):', err);
    }
    requestAnimationFrame(() => this._loop());
  }
}

const app = new App();
app.bindConsentButton();

// Last-resort safety net: surface truly unexpected errors instead of a silently dead page.
window.addEventListener('error', (e) => {
  console.error('Unhandled error:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});
