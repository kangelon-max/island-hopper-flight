// world.js — Pelican Island: an analytic heightfield (the same function the
// flight model collides with), a flattened runway strip, a small town,
// trees, a lighthouse, distant peaks, clouds and sky. All geometry is built
// once into static meshes by MeshBuilder.

import { MeshBuilder } from './gl-utils.js';

export const SEA_LEVEL = 0;
export const RUNWAY = { cx: 0, cz: 620, halfLen: 360, halfWid: 26, elev: 18 };

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function gauss(x, z, cx, cz, r) {
  const dx = x - cx, dz = z - cz;
  return Math.exp(-(dx * dx + dz * dz) / (2 * r * r));
}

// Deterministic RNG (mulberry32) so the island is the same on every load.
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  let h = 52 * (1 - smoothstep(900, 2050, d));
  h += 34 * gauss(x, z, -750, -450, 430);
  h += 44 * gauss(x, z, 820, -260, 500);
  h += 24 * gauss(x, z, 150, -950, 380);
  h += 15 * gauss(x, z, -350, 1050, 420);
  h += 3.2 * Math.sin(x * 0.004 + 1.7) * Math.sin(z * 0.0035 - 0.6);
  h -= 9;
  // Carve the airfield flat: full runway elevation inside the strip, easing
  // back to natural ground over a wide skirt so there is no cliff edge.
  const maskX = 1 - smoothstep(RUNWAY.halfLen + 30, RUNWAY.halfLen + 230, Math.abs(x - RUNWAY.cx));
  const maskZ = 1 - smoothstep(RUNWAY.halfWid + 30, RUNWAY.halfWid + 230, Math.abs(z - RUNWAY.cz));
  const mask = maskX * maskZ;
  return h * (1 - mask) + RUNWAY.elev * mask;
}

export function onRunway(x, z) {
  return Math.abs(x - RUNWAY.cx) <= RUNWAY.halfLen && Math.abs(z - RUNWAY.cz) <= RUNWAY.halfWid;
}

function cone(b, cx, cy, cz, r, h, seg, color) {
  const apex = [cx, cy + h, cz];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r];
    const p1 = [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r];
    b.tri(p1, p0, apex, color);
  }
}

function terrainColor(h, slope) {
  if (h < 1.6) return [0.78, 0.71, 0.48]; // sand
  if (slope > 0.62) return [0.46, 0.43, 0.40]; // rock
  if (h > 86) return [0.74, 0.75, 0.77]; // pale rocky summit
  const t = Math.min(1, Math.max(0, (h - 2) / 70));
  return [0.24 + 0.18 * t, 0.52 + 0.10 * t, 0.24 + 0.04 * t]; // grass deepening
}

function buildTerrain(gl) {
  const b = new MeshBuilder();
  const EXT = 2100, STEP = 30;
  for (let gx = -EXT; gx < EXT; gx += STEP) {
    for (let gz = -EXT; gz < EXT; gz += STEP) {
      const x0 = gx, x1 = gx + STEP, z0 = gz, z1 = gz + STEP;
      const h00 = heightAt(x0, z0), h10 = heightAt(x1, z0);
      const h01 = heightAt(x0, z1), h11 = heightAt(x1, z1);
      const slope = Math.max(
        Math.abs(h10 - h00), Math.abs(h01 - h00),
        Math.abs(h11 - h10), Math.abs(h11 - h01),
      ) / STEP;
      const color = terrainColor((h00 + h10 + h01 + h11) / 4, slope);
      b.quad([x0, h01, z1], [x1, h11, z1], [x1, h10, z0], [x0, h00, z0], color);
    }
  }
  return b.upload(gl);
}

function buildSea(gl) {
  const b = new MeshBuilder();
  const E = 10000;
  b.quad([-E, 0, E], [E, 0, E], [E, 0, -E], [-E, 0, -E], [0.09, 0.30, 0.53]);
  return b.upload(gl);
}

function buildRunway(gl) {
  const b = new MeshBuilder();
  const { cx, cz, halfLen, halfWid, elev } = RUNWAY;
  const y = elev + 0.15;
  const asphalt = [0.16, 0.16, 0.18];
  const paint = [0.92, 0.93, 0.94];
  b.quad([cx - halfLen, y, cz + halfWid], [cx + halfLen, y, cz + halfWid],
    [cx + halfLen, y, cz - halfWid], [cx - halfLen, y, cz - halfWid], asphalt);
  // Threshold bars at both ends.
  for (const endX of [cx - halfLen + 14, cx + halfLen - 14]) {
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const z = cz + i * 6.4;
      b.quad([endX - 7, y + 0.03, z + 1.6], [endX + 7, y + 0.03, z + 1.6],
        [endX + 7, y + 0.03, z - 1.6], [endX - 7, y + 0.03, z - 1.6], paint);
    }
  }
  // Centreline dashes.
  for (let x = cx - halfLen + 55; x < cx + halfLen - 50; x += 46) {
    b.quad([x, y + 0.03, cz + 1.1], [x + 20, y + 0.03, cz + 1.1],
      [x + 20, y + 0.03, cz - 1.1], [x, y + 0.03, cz - 1.1], paint);
  }
  // Edge lights: small bright blocks down both sides.
  const light = [1.0, 0.88, 0.45];
  for (let x = cx - halfLen + 10; x <= cx + halfLen - 10; x += 58) {
    b.box(x, elev + 0.55, cz - halfWid - 3, 0.45, 0.4, 0.45, light);
    b.box(x, elev + 0.55, cz + halfWid + 3, 0.45, 0.4, 0.45, light);
  }
  // PAPI lights beside the west threshold: two white, two red.
  const papiCols = [[0.95, 0.95, 0.95], [0.95, 0.95, 0.95], [0.9, 0.15, 0.12], [0.9, 0.15, 0.12]];
  for (let i = 0; i < 4; i++) {
    b.box(cx - halfLen + 42, elev + 0.7, cz - halfWid - 9 - i * 3.4, 0.8, 0.55, 0.8, papiCols[i]);
  }
  return b.upload(gl);
}

function house(b, x, z, s, wall, roof) {
  const y = heightAt(x, z);
  const w = 7 * s, d = 6 * s, hgt = 3.4 * s, rh = 2.1 * s;
  b.box(x, y + hgt / 2 - 0.2, z, w / 2, hgt / 2, d / 2, wall);
  const ry = y + hgt - 0.2;
  b.quad([x - w / 2 - 0.4, ry, z - d / 2 - 0.4], [x + w / 2 + 0.4, ry, z - d / 2 - 0.4],
    [x + w / 2 + 0.4, ry + rh, z], [x - w / 2 - 0.4, ry + rh, z], roof);
  b.quad([x + w / 2 + 0.4, ry, z + d / 2 + 0.4], [x - w / 2 - 0.4, ry, z + d / 2 + 0.4],
    [x - w / 2 - 0.4, ry + rh, z], [x + w / 2 + 0.4, ry + rh, z], roof);
  b.tri([x - w / 2, ry, z - d / 2], [x - w / 2, ry, z + d / 2], [x - w / 2, ry + rh, z], wall);
  b.tri([x + w / 2, ry, z + d / 2], [x + w / 2, ry, z - d / 2], [x + w / 2, ry + rh, z], wall);
}

function buildProps(gl) {
  const b = new MeshBuilder();
  const rng = makeRng(20261126);
  const walls = [[0.92, 0.88, 0.78], [0.85, 0.78, 0.66], [0.78, 0.84, 0.88], [0.90, 0.80, 0.72]];
  const roofs = [[0.62, 0.25, 0.16], [0.35, 0.38, 0.44], [0.55, 0.32, 0.20]];
  // The town of Pelican Bay: a jittered grid of houses.
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (rng() < 0.18) continue;
      const x = -640 + i * 62 + (rng() - 0.5) * 22;
      const z = -190 + j * 62 + (rng() - 0.5) * 22;
      house(b, x, z, 0.9 + rng() * 0.5, walls[(rng() * walls.length) | 0], roofs[(rng() * roofs.length) | 0]);
    }
  }
  // Scattered farmhouses.
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2, r = 500 + rng() * 1000;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (heightAt(x, z) < 3 || onRunway(x, z)) continue;
    house(b, x, z, 0.8 + rng() * 0.4, walls[(rng() * walls.length) | 0], roofs[(rng() * roofs.length) | 0]);
  }
  // Control tower and hangar by the airfield.
  const towerBase = heightAt(170, RUNWAY.cz + 78);
  b.box(170, towerBase + 8, RUNWAY.cz + 78, 3.2, 8, 3.2, [0.85, 0.86, 0.88]);
  b.box(170, towerBase + 17.4, RUNWAY.cz + 78, 5.2, 1.8, 5.2, [0.30, 0.52, 0.68]);
  b.box(170, towerBase + 19.6, RUNWAY.cz + 78, 5.8, 0.5, 5.8, [0.25, 0.27, 0.30]);
  const hangBase = heightAt(300, RUNWAY.cz + 95);
  b.box(300, hangBase + 5, RUNWAY.cz + 95, 17, 5, 11, [0.55, 0.58, 0.62]);
  b.quad([283, hangBase + 10, RUNWAY.cz + 84], [317, hangBase + 10, RUNWAY.cz + 84],
    [317, hangBase + 14.5, RUNWAY.cz + 95], [283, hangBase + 14.5, RUNWAY.cz + 95], [0.40, 0.43, 0.48]);
  b.quad([317, hangBase + 10, RUNWAY.cz + 106], [283, hangBase + 10, RUNWAY.cz + 106],
    [283, hangBase + 14.5, RUNWAY.cz + 95], [317, hangBase + 14.5, RUNWAY.cz + 95], [0.40, 0.43, 0.48]);
  // Lighthouse on the north-east point.
  const lx = 1250, lz = 780, ly = heightAt(lx, lz);
  b.box(lx, ly + 4, lz, 2.4, 4.2, 2.4, [0.93, 0.93, 0.92]);
  b.box(lx, ly + 9.5, lz, 2.0, 1.6, 2.0, [0.80, 0.16, 0.13]);
  b.box(lx, ly + 12.4, lz, 1.7, 1.5, 1.7, [0.93, 0.93, 0.92]);
  b.box(lx, ly + 14.6, lz, 1.2, 0.9, 1.2, [1.0, 0.85, 0.35]);
  // Trees: trunk plus two stacked cones, kept off the airfield and town.
  const trunk = [0.36, 0.25, 0.15];
  const leafA = [0.16, 0.42, 0.18];
  const leafB = [0.22, 0.50, 0.20];
  let planted = 0;
  for (let i = 0; i < 900 && planted < 300; i++) {
    const a = rng() * Math.PI * 2, r = 120 + rng() * 1650;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 2.5 || h > 62) continue;
    if (Math.abs(x - RUNWAY.cx) < RUNWAY.halfLen + 90 && Math.abs(z - RUNWAY.cz) < 120) continue;
    if (x > -720 && x < -320 && z > -260 && z < 140) continue;
    const slope = Math.abs(heightAt(x + 7, z) - h) + Math.abs(heightAt(x, z + 7) - h);
    if (slope > 5) continue;
    const s = 0.8 + rng() * 0.7;
    b.box(x, h + 1.1 * s, z, 0.35 * s, 1.1 * s, 0.35 * s, trunk);
    cone(b, x, h + 1.6 * s, z, 2.6 * s, 4.6 * s, 7, rng() < 0.5 ? leafA : leafB);
    cone(b, x, h + 4.2 * s, z, 1.8 * s, 3.4 * s, 7, rng() < 0.5 ? leafB : leafA);
    planted++;
  }
  return b.upload(gl);
}

function buildPeaks(gl) {
  const b = new MeshBuilder();
  const rng = makeRng(777);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.4;
    const r = 3500 + rng() * 1000;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 480 + rng() * 420, rad = 650 + rng() * 420;
    cone(b, x, -30, z, rad, h, 12, [0.40, 0.46, 0.57]);
    cone(b, x, -30 + h * 0.60, z, rad * 0.42, h * 0.40, 12, [0.90, 0.92, 0.96]);
  }
  return b.upload(gl);
}

// A cloud puff: a squashed low-segment sphere, flat-shaded like the rest
// of the island, so clusters read as one consistent low-poly style.
function puff(b, cx, cy, cz, sx, sy, sz, color) {
  const SEG = 8, RINGS = 4;
  const pt = (i, j) => {
    const phi = (j / RINGS) * Math.PI - Math.PI / 2;
    const theta = (i / SEG) * Math.PI * 2;
    return [
      cx + Math.cos(phi) * Math.cos(theta) * sx,
      cy + Math.sin(phi) * sy,
      cz + Math.cos(phi) * Math.sin(theta) * sz,
    ];
  };
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < RINGS; j++) {
      b.quad(pt(i, j), pt(i, j + 1), pt(i + 1, j + 1), pt(i + 1, j), color);
    }
  }
}

function buildClouds(gl) {
  const b = new MeshBuilder();
  const rng = makeRng(4242);
  const white = [0.97, 0.98, 1.0];
  for (let i = 0; i < 34; i++) {
    const a = rng() * Math.PI * 2, r = 300 + rng() * 2400;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const cy = 390 + rng() * 180;
    const puffs = 3 + ((rng() * 3) | 0);
    for (let j = 0; j < puffs; j++) {
      puff(b, cx + (rng() - 0.5) * 90, cy + (rng() - 0.5) * 14, cz + (rng() - 0.5) * 60,
        26 + rng() * 30, 8 + rng() * 6, 20 + rng() * 22, white);
    }
  }
  return b.upload(gl);
}

function buildSky(gl) {
  const b = new MeshBuilder();
  const R = 8200, SEG = 20, RINGS = 10;
  const horizon = [0.74, 0.84, 0.93], zenith = [0.20, 0.46, 0.82];
  const pt = (i, j) => {
    const phi = (j / RINGS) * Math.PI - Math.PI / 2;
    const theta = (i / SEG) * Math.PI * 2;
    return [Math.cos(phi) * Math.cos(theta) * R, Math.sin(phi) * R, Math.cos(phi) * Math.sin(theta) * R];
  };
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < RINGS; j++) {
      const a = pt(i, j), c = pt(i + 1, j), d = pt(i + 1, j + 1), e = pt(i, j + 1);
      const t = Math.min(1, Math.max(0, (a[1] / R) * 0.5 + 0.5));
      const col = [
        horizon[0] + (zenith[0] - horizon[0]) * t,
        horizon[1] + (zenith[1] - horizon[1]) * t,
        horizon[2] + (zenith[2] - horizon[2]) * t,
      ];
      b.quad(a, c, d, e, col);
    }
  }
  return b.upload(gl);
}

function buildSun(gl) {
  const b = new MeshBuilder();
  const dir = [0.45, 0.62, 0.35];
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  const c = [dir[0] / len * 7800, dir[1] / len * 7800, dir[2] / len * 7800];
  const u = [1, 0, 0];
  const v = [
    dir[1] * u[2] - dir[2] * u[1],
    dir[2] * u[0] - dir[0] * u[2],
    dir[0] * u[1] - dir[1] * u[0],
  ];
  const vl = Math.hypot(v[0], v[1], v[2]);
  const vv = [v[0] / vl, v[1] / vl, v[2] / vl];
  const uu = [
    vv[1] * dir[2] - vv[2] * dir[1],
    vv[2] * dir[0] - vv[0] * dir[2],
    vv[0] * dir[1] - vv[1] * dir[0],
  ];
  const SEG = 18, R = 300;
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
    const p0 = [c[0] + (uu[0] * Math.cos(a0) + vv[0] * Math.sin(a0)) * R,
      c[1] + (uu[1] * Math.cos(a0) + vv[1] * Math.sin(a0)) * R,
      c[2] + (uu[2] * Math.cos(a0) + vv[2] * Math.sin(a0)) * R];
    const p1 = [c[0] + (uu[0] * Math.cos(a1) + vv[0] * Math.sin(a1)) * R,
      c[1] + (uu[1] * Math.cos(a1) + vv[1] * Math.sin(a1)) * R,
      c[2] + (uu[2] * Math.cos(a1) + vv[2] * Math.sin(a1)) * R];
    b.tri(c, p0, p1, [1.0, 0.93, 0.70]);
  }
  return b.upload(gl);
}

// A target ring in local space: a torus whose hole faces +Z, so a model
// matrix whose back axis is the direction of travel aims it down a course.
export function buildRingMesh(gl, color) {
  const b = new MeshBuilder();
  const R = 16, TUBE = 1.1, SEG = 22, SIDES = 8;
  for (let i = 0; i < SEG; i++) {
    const u0 = (i / SEG) * Math.PI * 2, u1 = ((i + 1) / SEG) * Math.PI * 2;
    for (let j = 0; j < SIDES; j++) {
      const v0 = (j / SIDES) * Math.PI * 2, v1 = ((j + 1) / SIDES) * Math.PI * 2;
      const pt = (u, v) => [
        (R + TUBE * Math.cos(v)) * Math.cos(u),
        (R + TUBE * Math.cos(v)) * Math.sin(u),
        TUBE * Math.sin(v),
      ];
      b.quad(pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1), color);
    }
  }
  return b.upload(gl);
}

export function buildWorld(gl) {
  return {
    terrain: buildTerrain(gl),
    sea: buildSea(gl),
    runway: buildRunway(gl),
    props: buildProps(gl),
    peaks: buildPeaks(gl),
    clouds: buildClouds(gl),
    sky: buildSky(gl),
    sun: buildSun(gl),
  };
}
