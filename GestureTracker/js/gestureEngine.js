// Turns raw MediaPipe HandLandmarker output into named gestures per frame.
import { angleAt, dist, lerpPoint, sub, cross, normalize } from './vec3.js';
import { GESTURE_CONFIG as CFG } from './config.js';

const IDX = {
  wrist: 0,
  thumbCMC: 1, thumbMCP: 2, thumbIP: 3, thumbTIP: 4,
  indexMCP: 5, indexPIP: 6, indexDIP: 7, indexTIP: 8,
  middleMCP: 9, middlePIP: 10, middleDIP: 11, middleTIP: 12,
  ringMCP: 13, ringPIP: 14, ringDIP: 15, ringTIP: 16,
  pinkyMCP: 17, pinkyPIP: 18, pinkyDIP: 19, pinkyTIP: 20,
};

// Continuous 0..1 "how extended is this finger" confidence instead of a hard
// boolean — 0 at/below the curled angle, 1 at/above the straight angle, linear
// ramp between. A real hand rarely sits exactly at either extreme, so this lets
// a finger be "a bit ambiguous" without breaking the whole gesture match below.
function ramp(value, lowEdge, highEdge) {
  const t = (value - lowEdge) / (highEdge - lowEdge);
  return Math.max(0, Math.min(1, t));
}

function fingerConfidence(lm, mcp, pip, tip) {
  const angle = angleAt(lm[mcp], lm[pip], lm[tip]);
  return ramp(angle, CFG.fingerCurledAngleDeg, CFG.fingerStraightAngleDeg);
}

function handSize(lm) {
  return dist(lm[IDX.wrist], lm[IDX.middleMCP]) || 1e-6;
}

function thumbConfidence(lm) {
  const size = handSize(lm);
  const distRatio = dist(lm[IDX.thumbTIP], lm[IDX.indexMCP]) / size;
  return ramp(distRatio, CFG.thumbCurledRatio, CFG.thumbExtendedRatio);
}

function fingerConfidences(lm) {
  return {
    thumb: thumbConfidence(lm),
    index: fingerConfidence(lm, IDX.indexMCP, IDX.indexPIP, IDX.indexTIP),
    middle: fingerConfidence(lm, IDX.middleMCP, IDX.middlePIP, IDX.middleTIP),
    ring: fingerConfidence(lm, IDX.ringMCP, IDX.ringPIP, IDX.ringTIP),
    pinky: fingerConfidence(lm, IDX.pinkyMCP, IDX.pinkyPIP, IDX.pinkyTIP),
  };
}

// Each profile names which fingers should be extended (1) or curled (0); a
// finger left out (undefined) doesn't count toward that profile's score, e.g.
// indexMiddlePair doesn't care what the thumb is doing.
const GESTURE_PROFILES = [
  { name: 'thumbsUpDown', thumb: 1, index: 0, middle: 0, ring: 0, pinky: 0 },
  { name: 'indexMiddlePair', index: 1, middle: 1, ring: 0, pinky: 0 },
  { name: 'pinchOpen', thumb: 1, index: 1, middle: 0, ring: 0, pinky: 0 },
  { name: 'fist', thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
  { name: 'openHand', thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 },
];

// Average, over each finger a profile actually cares about, how well the
// measured confidence matches what that profile expects. 1.0 = perfect match,
// 0.0 = every specified finger is doing the exact opposite of expected.
function scoreProfile(conf, profile) {
  let total = 0;
  let count = 0;
  for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    const expected = profile[finger];
    if (expected === undefined) continue;
    total += expected === 1 ? conf[finger] : 1 - conf[finger];
    count++;
  }
  return count ? total / count : 0;
}

// Best-match against all known profiles instead of a strict boolean AND-chain:
// tolerates one finger being ambiguous or flat-out misread instead of the whole
// gesture failing to register, which is what a real hand + camera noise usually
// produces rather than textbook-perfect finger states.
function bestGestureProfile(conf) {
  let best = null;
  let bestScore = -1;
  for (const profile of GESTURE_PROFILES) {
    const score = scoreProfile(conf, profile);
    if (score > bestScore) {
      bestScore = score;
      best = profile;
    }
  }
  return { profile: best, score: bestScore };
}

// Orthonormal basis describing the palm's own orientation (not the hand's position),
// used to drive rotation by how much the hand actually turns/tilts rather than how
// far it slides across the frame. Framework-agnostic plain vectors; sceneManager.js
// turns this into a THREE.Quaternion since that's the only place that needs three.js.
function computeHandBasis(lm) {
  const xAxis = normalize(sub(lm[IDX.indexMCP], lm[IDX.pinkyMCP])); // across the palm
  let yAxis = normalize(sub(lm[IDX.middleMCP], lm[IDX.wrist])); // wrist -> fingers
  const zAxis = normalize(cross(xAxis, yAxis)); // palm normal
  yAxis = normalize(cross(zAxis, xAxis)); // re-orthogonalize
  return { x: xAxis, y: yAxis, z: zAxis };
}

function thumbDirection(lm) {
  const size = handSize(lm);
  const margin = size * CFG.thumbUpDownMarginRatio;
  const dy = lm[IDX.thumbTIP].y - lm[IDX.wrist].y; // image space: smaller y = higher on screen
  if (dy < -margin) return 'up';
  if (dy > margin) return 'down';
  return null;
}

// index & middle both extended, ring & pinky curled: distinguish crossed vs not-crossed
// by comparing left/right order of tips vs order of their MCP bases.
function indexMiddleCrossState(lm) {
  const tipDelta = lm[IDX.indexTIP].x - lm[IDX.middleTIP].x;
  const baseDelta = lm[IDX.indexMCP].x - lm[IDX.middleMCP].x;
  const flipped = Math.sign(tipDelta) !== Math.sign(baseDelta);
  const closeTogether = dist(lm[IDX.indexTIP], lm[IDX.middleTIP]) / handSize(lm) < CFG.crossFingersMaxDist;
  return flipped && closeTogether ? 'crossed' : 'notCrossed';
}

function classifySingleHandGesture(lm) {
  const conf = fingerConfidences(lm);
  const { profile, score } = bestGestureProfile(conf);

  if (score < CFG.gestureMatchThreshold) return { name: null, fingers: conf };

  if (profile.name === 'thumbsUpDown') {
    const dir = thumbDirection(lm);
    if (dir === 'up') return { name: 'thumbsUp', fingers: conf };
    if (dir === 'down') return { name: 'thumbsDown', fingers: conf };
    return { name: null, fingers: conf }; // thumb out but not clearly up/down yet
  }

  if (profile.name === 'indexMiddlePair') {
    const crossState = indexMiddleCrossState(lm);
    return { name: crossState === 'crossed' ? 'fingersCrossed' : 'peaceSign', fingers: conf };
  }

  return { name: profile.name, fingers: conf };
}

class SmoothedHand {
  constructor() {
    this.landmarks = null;
  }
  push(rawLandmarks) {
    if (!this.landmarks) {
      this.landmarks = rawLandmarks.map((p) => ({ ...p }));
    } else {
      const t = 1 - CFG.landmarkSmoothing;
      this.landmarks = this.landmarks.map((prev, i) => lerpPoint(prev, rawLandmarks[i], t));
    }
    return this.landmarks;
  }
}

export class GestureEngine {
  constructor() {
    this.smoothers = { Left: new SmoothedHand(), Right: new SmoothedHand() };
    this.prevCentroid = { Left: null, Right: null };
    this.lastGesture = { Left: { name: null, time: 0 }, Right: { name: null, time: 0 } };
    this.prevPairDist = null;
  }

  reset(label) {
    this.prevCentroid[label] = null;
    this.lastGesture[label] = { name: null, time: 0 };
  }

  // Bridges brief single-frame misclassifications: if this frame didn't recognize a
  // gesture but one was seen very recently, keep reporting it instead of flickering null.
  _stickyGesture(label, rawName, now) {
    if (rawName) {
      this.lastGesture[label] = { name: rawName, time: now };
      return rawName;
    }
    const last = this.lastGesture[label];
    if (last.name && now - last.time < CFG.gestureStickyMs) return last.name;
    return null;
  }

  /**
   * @param {Array<{landmarks: Array<{x,y,z}>, handedness: 'Left'|'Right'}>} rawHands
   */
  update(rawHands) {
    const seen = new Set();
    const hands = [];
    const now = performance.now();

    for (const raw of rawHands) {
      const label = raw.handedness;
      seen.add(label);
      const lm = this.smoothers[label].push(raw.landmarks);
      const rawGesture = classifySingleHandGesture(lm);
      const gestureName = this._stickyGesture(label, rawGesture.name, now);
      // Wrist position, not the full 21-point centroid: finger curl shifts the
      // centroid on its own, adding noise unrelated to actual hand movement.
      const c = { x: lm[IDX.wrist].x, y: lm[IDX.wrist].y, z: lm[IDX.wrist].z };
      const prevC = this.prevCentroid[label];
      const delta = prevC ? { x: c.x - prevC.x, y: c.y - prevC.y, z: c.z - prevC.z } : { x: 0, y: 0, z: 0 };
      this.prevCentroid[label] = c;
      const basis = computeHandBasis(lm);
      hands.push({ label, landmarks: lm, gesture: gestureName, fingers: rawGesture.fingers, centroid: c, delta, basis, size: handSize(lm) });
    }

    for (const label of ['Left', 'Right']) {
      if (!seen.has(label)) this.reset(label);
    }

    let twoHand = null;
    if (hands.length === 2) {
      const [a, b] = hands;
      const pairDist = dist(a.centroid, b.centroid);
      const pairDelta = this.prevPairDist == null ? 0 : pairDist - this.prevPairDist;
      this.prevPairDist = pairDist;

      const bothPinch = a.gesture === 'pinchOpen' && b.gesture === 'pinchOpen';
      const bothOpen = a.gesture === 'openHand' && b.gesture === 'openHand';

      if (bothPinch) {
        const t = CFG.scaleDeltaThreshold;
        twoHand = { name: pairDelta > t ? 'scaleUp' : pairDelta < -t ? 'scaleDown' : 'scaleHold', pairDist, pairDelta };
      } else if (bothOpen) {
        // Crossed = wrists appear on the opposite screen side from what the hand's
        // own label would suggest, i.e. Left hand's wrist sits left of Right hand's wrist.
        const leftHand = hands.find((h) => h.label === 'Left');
        const rightHand = hands.find((h) => h.label === 'Right');
        const crossed = leftHand.centroid.x < rightHand.centroid.x;
        twoHand = { name: crossed ? 'handsCrossedOpen' : 'handsOpenPlace' };
      }
    } else {
      this.prevPairDist = null;
    }

    return { hands, twoHand };
  }
}
