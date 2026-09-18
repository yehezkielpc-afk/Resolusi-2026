import * as THREE from 'three';
import { buildShapeGeometry } from './shapeDefs.js';
import { buildLetterGeometry, loadFont } from './letterUtil.js';
import { GESTURE_CONFIG as CFG } from './config.js';

const SPAWN_POSITION = new THREE.Vector3(0, 0, 0);
// A hand briefly lost and re-found elsewhere in frame produces one large
// per-tick delta; a real intentional move rarely exceeds ~15% of frame size
// between detection ticks, so anything past this is almost certainly a
// tracking glitch, not the user's actual hand motion.
const MAX_DELTA = 0.15;

function clampDelta(v) {
  return Math.max(-MAX_DELTA, Math.min(MAX_DELTA, v));
}

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 1.4, 6.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    // Capped lower than devicePixelRatio's max (often 2-3 on laptops) — this runs
    // alongside MediaPipe's own WebGL context, so keeping GPU fragment work down
    // matters more here than on a page that owns the GPU alone.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this._setupLights();
    this._setupGround();

    this.placedGroup = new THREE.Group();
    this.scene.add(this.placedGroup);
    this.placedObjects = [];

    this.mode = 'shape';
    this.currentName = null;
    this.colorHex = 0x1d6fe1;

    this.controlled = null; // { mesh, edges }
    this.fontReady = false;
    loadFont().then(() => { this.fontReady = true; }).catch((err) => {
      console.error('Gagal memuat font huruf 3D:', err);
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.1);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(3, 5, 4);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
    fill.position.set(-4, -2, -3);
    this.scene.add(fill);
  }

  _setupGround() {
    const grid = new THREE.GridHelper(14, 28, 0x2a3346, 0x1a2130);
    grid.position.y = -1.6;
    this.scene.add(grid);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _buildGeometry(mode, name) {
    if (mode === 'letter') {
      if (!this.fontReady) return new THREE.BoxGeometry(1, 1, 1);
      return buildLetterGeometry(name);
    }
    return buildShapeGeometry(name);
  }

  _makeMesh(geometry, colorHex) {
    const material = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.35,
      metalness: 0.15,
      emissive: new THREE.Color(colorHex).multiplyScalar(0.08),
    });
    return new THREE.Mesh(geometry, material);
  }

  /** (Re)build the live "controlled" object, keeping current transform if it exists. */
  _rebuildControlled() {
    if (this.mode === 'letter' && !this.fontReady) {
      // Defer until font finishes loading.
      loadFont().then(() => this._rebuildControlled()).catch((err) => {
        console.error('Gagal memuat font huruf 3D:', err);
      });
      return;
    }
    const prevTransform = this.controlled
      ? { pos: this.controlled.mesh.position.clone(), rot: this.controlled.mesh.rotation.clone(), scale: this.controlled.mesh.scale.clone() }
      : { pos: SPAWN_POSITION.clone(), rot: new THREE.Euler(0.3, 0.5, 0), scale: new THREE.Vector3(1, 1, 1) };

    if (this.controlled) {
      this.scene.remove(this.controlled.mesh);
      this.controlled.mesh.geometry.dispose();
      this.controlled.mesh.material.dispose();
    }

    const geometry = this._buildGeometry(this.mode, this.currentName);
    const mesh = this._makeMesh(geometry, this.colorHex);
    mesh.position.copy(prevTransform.pos);
    mesh.rotation.copy(prevTransform.rot);
    mesh.scale.copy(prevTransform.scale);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
    );
    mesh.add(edges);

    this.scene.add(mesh);
    this.controlled = { mesh, edges };
  }

  setModeAndName(mode, name) {
    this.mode = mode;
    this.currentName = name;
    this._rebuildControlled();
  }

  setName(name) {
    this.currentName = name;
    this._rebuildControlled();
  }

  setColor(hex) {
    this.colorHex = hex;
    if (this.controlled) {
      this.controlled.mesh.material.color.setHex(hex);
      this.controlled.mesh.material.emissive.setHex(hex).multiplyScalar(0.08);
    }
  }

  translateControlled(dxNorm, dyNorm) {
    if (!this.controlled) return;
    if (!Number.isFinite(dxNorm) || !Number.isFinite(dyNorm)) return;
    // A hand briefly lost and re-found elsewhere in frame can otherwise produce
    // one huge delta; clamp it so a bad reading can't fling the object off-screen
    // (and, combined with a NaN/Infinity guess elsewhere, poison the transform for good).
    dxNorm = clampDelta(dxNorm);
    dyNorm = clampDelta(dyNorm);
    // dxNorm/dyNorm are normalized-image-space deltas; image y grows downward.
    this.controlled.mesh.position.x += dxNorm * CFG.dragSpeed;
    this.controlled.mesh.position.y -= dyNorm * CFG.dragSpeed;
  }

  rotateControlled(dxNorm, dyNorm) {
    if (!this.controlled) return;
    if (!Number.isFinite(dxNorm) || !Number.isFinite(dyNorm)) return;
    dxNorm = clampDelta(dxNorm);
    dyNorm = clampDelta(dyNorm);
    this.controlled.mesh.rotation.y += dxNorm * CFG.rotateSpeed;
    this.controlled.mesh.rotation.x += dyNorm * CFG.rotateSpeed;
  }

  scaleControlled(factor) {
    if (!this.controlled) return;
    if (!Number.isFinite(factor) || factor <= 0) return;
    const s = this.controlled.mesh.scale.x * factor;
    if (!Number.isFinite(s)) return;
    const clamped = Math.min(CFG.maxScale, Math.max(CFG.minScale, s));
    this.controlled.mesh.scale.setScalar(clamped);
  }

  placeCurrent() {
    if (!this.controlled) return;
    const placedMesh = this.controlled.mesh;
    placedMesh.remove(this.controlled.edges);
    this.controlled.edges.geometry.dispose();
    this.controlled.edges.material.dispose();
    this.placedGroup.add(placedMesh);
    this.placedObjects.push(placedMesh);
    this.controlled = null;
    this._rebuildControlled();
  }

  deleteLastPlaced() {
    const mesh = this.placedObjects.pop();
    if (!mesh) return false;
    this.placedGroup.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    return true;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
