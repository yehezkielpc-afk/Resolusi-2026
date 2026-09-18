// Loads the three.js typeface font once and builds extruded letter geometry.
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FONT_URL } from './config.js';

let cachedFont = null;
let loadingPromise = null;

export function loadFont() {
  if (cachedFont) return Promise.resolve(cachedFont);
  if (loadingPromise) return loadingPromise;
  const loader = new FontLoader();
  const loadPromise = new Promise((resolve, reject) => {
    loader.load(FONT_URL, (font) => {
      cachedFont = font;
      resolve(font);
    }, undefined, reject);
  });
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Waktu habis memuat font huruf 3D.')), 15000);
  });
  loadingPromise = Promise.race([loadPromise, timeout]).catch((err) => {
    loadingPromise = null; // allow retrying on next call instead of caching the failure
    throw err;
  });
  return loadingPromise;
}

export function buildLetterGeometry(letter) {
  if (!cachedFont) throw new Error('Font not loaded yet');
  const geo = new TextGeometry(letter, {
    font: cachedFont,
    size: 1.4,
    height: 0.45, // this three.js version's TextGeometry reads `height`, not `depth`, for extrusion thickness
    curveSegments: 8,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 3,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx = -(bb.max.x + bb.min.x) / 2;
  const cy = -(bb.max.y + bb.min.y) / 2;
  const cz = -(bb.max.z + bb.min.z) / 2;
  geo.translate(cx, cy, cz);
  return geo;
}
