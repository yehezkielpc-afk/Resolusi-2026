// Minimal 3D vector helpers working on plain {x,y,z} landmark objects.

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function length(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function dist(a, b) {
  return length(sub(a, b));
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function normalize(v) {
  const len = length(v) || 1e-6;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

// Angle in degrees at vertex `b`, formed by rays b->a and b->c.
export function angleAt(a, b, c) {
  const v1 = sub(a, b);
  const v2 = sub(c, b);
  const cos = dot(v1, v2) / ((length(v1) * length(v2)) || 1e-6);
  const clamped = Math.max(-1, Math.min(1, cos));
  return (Math.acos(clamped) * 180) / Math.PI;
}

export function centroid(points) {
  const c = { x: 0, y: 0, z: 0 };
  for (const p of points) {
    c.x += p.x; c.y += p.y; c.z += p.z;
  }
  c.x /= points.length; c.y /= points.length; c.z /= points.length;
  return c;
}
