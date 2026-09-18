// Turns raw MediaPipe HandLandmarker output into named gestures per frame.
import { angleAt, dist, lerpPoint, centroid } from './vec3.js';
import { GESTURE_CONFIG as CFG } from './config.js';

const IDX = {
  wrist: 0,
  thumbCMC: 1, thumbMCP: 2, thumbIP: 3, thumbTIP: 4,
  indexMCP: 5, indexPIP: 6, indexDIP: 7, indexTIP: 8,
  middleMCP: 9, middlePIP: 10, middleDIP: 11, middleTIP: 12,
  ringMCP: 13, ringPIP: 14, ringDIP: 15, ringTIP: 16,
  pinkyMCP: 17, pinkyPIP: 18, pinkyDIP: 19, pinkyTIP: 20,
};

function fingerExtended(lm, mcp, pip, tip) {
  const angle = angleAt(lm[mcp], lm[pip], lm[tip]);
  return angle > CFG.fingerStraightAngleDeg;
}

function fingerCurled(lm, mcp, pip, tip) {
  const angle = angleAt(lm[mcp], lm[pip], lm[tip]);
  return angle < CFG.fingerCurledAngleDeg;
}

function handSize(lm) {
  return dist(lm[IDX.wrist], lm[IDX.middleMCP]) || 1e-6;
}

function thumbExtended(lm) {
  const size = handSize(lm);
  return dist(lm[IDX.thumbTIP], lm[IDX.indexMCP]) / size > CFG.thumbExtendedRatio;
}

function analyzeFingers(lm) {
  return {
    thumb: thumbExtended(lm),
    index: fingerExtended(lm, IDX.indexMCP, IDX.indexPIP, IDX.indexTIP),
    middle: fingerExtended(lm, IDX.middleMCP, IDX.middlePIP, IDX.middleTIP),
    ring: fingerExtended(lm, IDX.ringMCP, IDX.ringPIP, IDX.ringTIP),
    pinky: fingerExtended(lm, IDX.pinkyMCP, IDX.pinkyPIP, IDX.pinkyTIP),
    indexCurled: fingerCurled(lm, IDX.indexMCP, IDX.indexPIP, IDX.indexTIP),
    middleCurled: fingerCurled(lm, IDX.middleMCP, IDX.middlePIP, IDX.middleTIP),
    ringCurled: fingerCurled(lm, IDX.ringMCP, IDX.ringPIP, IDX.ringTIP),
    pinkyCurled: fingerCurled(lm, IDX.pinkyMCP, IDX.pinkyPIP, IDX.pinkyTIP),
  };
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
  const f = analyzeFingers(lm);

  const fourCurled = f.indexCurled && f.middleCurled && f.ringCurled && f.pinkyCurled;
  const fourExtended = f.index && f.middle && f.ring && f.pinky;

  // Thumb up / down: thumb clearly out, the other four fingers curled into a loose fist.
  if (f.thumb && fourCurled) {
    const dir = thumbDirection(lm);
    if (dir === 'up') return { name: 'thumbsUp', fingers: f };
    if (dir === 'down') return { name: 'thumbsDown', fingers: f };
  }

  // Index + middle extended, ring + pinky curled -> crossed / not-crossed variants.
  if (f.index && f.middle && f.ringCurled && f.pinkyCurled) {
    const crossState = indexMiddleCrossState(lm);
    return { name: crossState === 'crossed' ? 'fingersCrossed' : 'peaceSign', fingers: f };
  }

  // Shaka / hang-loose: thumb + pinky extended, index/middle/ring curled. Used two-handed.
  if (f.thumb && f.pinky && f.indexCurled && f.middleCurled && f.ringCurled) {
    return { name: 'shaka', fingers: f };
  }

  // Fist: everything curled (thumb tucked in, not held out).
  if (!f.thumb && fourCurled) {
    return { name: 'fist', fingers: f };
  }

  // Open hand: all five fingers extended.
  if (f.thumb && fourExtended) {
    return { name: 'openHand', fingers: f };
  }

  return { name: null, fingers: f };
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
    this.prevPairDist = null;
  }

  reset(label) {
    this.prevCentroid[label] = null;
  }

  /**
   * @param {Array<{landmarks: Array<{x,y,z}>, handedness: 'Left'|'Right'}>} rawHands
   */
  update(rawHands) {
    const seen = new Set();
    const hands = [];

    for (const raw of rawHands) {
      const label = raw.handedness;
      seen.add(label);
      const lm = this.smoothers[label].push(raw.landmarks);
      const gesture = classifySingleHandGesture(lm);
      const c = centroid(lm);
      const prevC = this.prevCentroid[label];
      const delta = prevC ? { x: c.x - prevC.x, y: c.y - prevC.y, z: c.z - prevC.z } : { x: 0, y: 0, z: 0 };
      this.prevCentroid[label] = c;
      hands.push({ label, landmarks: lm, gesture: gesture.name, fingers: gesture.fingers, centroid: c, delta, size: handSize(lm) });
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

      const bothShaka = a.gesture === 'shaka' && b.gesture === 'shaka';
      const bothOpen = a.gesture === 'openHand' && b.gesture === 'openHand';

      if (bothShaka) {
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
