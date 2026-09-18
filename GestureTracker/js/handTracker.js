// Orchestrates the hand-tracking Web Worker + webcam access. All ML inference
// happens in handWorker.js; this class only ever does cheap, non-blocking work
// on the main thread so the render loop and page stay responsive.
export class HandTracker {
  constructor(videoEl) {
    this.video = videoEl;
    this.worker = null;
    this.ready = false;
    this.busy = false;
    this._lastResult = [];
  }

  async init(onStatus = () => {}) {
    onStatus('Memuat model deteksi tangan (di background thread)...');
    await this._initWorker();

    onStatus('Meminta izin kamera...');
    const stream = await navigator.mediaDevices.getUserMedia({
      // `ideal` (not exact) so the browser can pick a supported mode instead of
      // forcing a resize pass; 640x480 is plenty for landmark accuracy and cuts
      // per-frame inference/copy cost noticeably vs. a larger capture size.
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
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

  _initWorker() {
    // Classic (not module) worker on purpose -- see the comment at the top of
    // handWorker.js for why: MediaPipe's WASM loader needs importScripts(), which
    // browsers disable inside type:"module" workers.
    this.worker = new Worker(new URL('./handWorker.js', import.meta.url), { type: 'classic' });

    return new Promise((resolve, reject) => {
      // Generous outer bound -- the worker's own per-step timeouts (handWorker.js)
      // fire first with a more specific message in the normal failure case; this
      // is only a last-resort catch-all if the worker never responds at all.
      const timer = setTimeout(() => {
        reject(new Error('Waktu habis memuat model deteksi tangan (>60s). Kemungkinan jaringan/firewall memblokir permintaan ini.'));
      }, 60000);

      this.worker.onerror = (err) => {
        clearTimeout(timer);
        reject(new Error('Worker deteksi tangan gagal: ' + (err?.message || 'unknown error')));
      };

      this.worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'ready') {
          clearTimeout(timer);
          this.ready = true;
          this.worker.onmessage = (e2) => this._handleWorkerMessage(e2.data);
          resolve();
        } else if (msg.type === 'initError') {
          clearTimeout(timer);
          reject(new Error(msg.error));
        }
      };

      this.worker.postMessage({ type: 'init' });
    });
  }

  _handleWorkerMessage(msg) {
    if (msg.type === 'result') {
      this._lastResult = msg.hands;
    } else if (msg.type === 'detectError') {
      console.error('Deteksi tangan gagal:', msg.error);
    }
    this.busy = false;
  }

  /**
   * Non-blocking: if the worker is idle, asynchronously hands it the current
   * video frame (fire-and-forget) and immediately returns the latest known
   * result. Never waits on inference, so this is always cheap to call from
   * the render loop regardless of how slow detection is on this device.
   */
  detect() {
    if (!this.ready || this.busy || this.video.readyState < 2) return this._lastResult;
    this.busy = true;
    createImageBitmap(this.video)
      .then((bitmap) => {
        this.worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now() }, [bitmap]);
      })
      .catch((err) => {
        console.error('Gagal mengambil frame kamera:', err);
        this.busy = false;
      });
    return this._lastResult;
  }
}
