// "Bangun ruang" (3D geometric solid) geometry builders, keyed by SHAPE_NAMES order.
import * as THREE from 'three';

export function buildShapeGeometry(name) {
  switch (name) {
    case 'Kubus':
      return new THREE.BoxGeometry(1.4, 1.4, 1.4);
    case 'Balok':
      return new THREE.BoxGeometry(1.9, 1.2, 1.0);
    case 'Bola':
      return new THREE.SphereGeometry(0.95, 32, 24);
    case 'Tabung':
      return new THREE.CylinderGeometry(0.8, 0.8, 1.6, 32);
    case 'Kerucut':
      return new THREE.ConeGeometry(0.9, 1.7, 32);
    case 'Limas Segiempat':
      return new THREE.ConeGeometry(1.0, 1.5, 4);
    case 'Limas Segitiga':
      return new THREE.TetrahedronGeometry(1.15);
    case 'Prisma Segitiga':
      return new THREE.CylinderGeometry(0.95, 0.95, 1.5, 3);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}
