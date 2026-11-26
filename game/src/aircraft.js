// aircraft.js — the "Pelican" trainer, modelled from raw geometry in model
// space (nose toward -Z, up +Y, right +X): a sectioned fuselage, cowling and
// spinner, wing, tail feathers, canopy and fixed gear. The propeller is a
// separate mesh so it can spin.

import { MeshBuilder } from './gl-utils.js';

export const GEAR_CLEARANCE = 1.15; // fuselage centre height above ground on gear

const CREAM = [0.93, 0.89, 0.80];
const RED = [0.78, 0.16, 0.12];
const GLASS = [0.22, 0.42, 0.58];
const DARK = [0.13, 0.12, 0.12];
const TYRE = [0.08, 0.08, 0.09];

// Fuselage cross-sections: [z, radius, centre height, colour].
const SECTIONS = [
  [-4.20, 0.34, 0.00, RED],
  [-3.40, 0.58, 0.00, RED],
  [-2.20, 0.70, 0.02, CREAM],
  [-0.60, 0.74, 0.05, CREAM],
  [0.80, 0.70, 0.08, CREAM],
  [2.20, 0.52, 0.16, CREAM],
  [3.40, 0.30, 0.30, CREAM],
  [3.90, 0.10, 0.38, RED],
];

function buildFuselage(b) {
  const SIDES = 9;
  const ring = (s) => {
    const pts = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2 + Math.PI / 2;
      pts.push([Math.cos(a) * s[1], s[2] + Math.sin(a) * s[1], s[0]]);
    }
    return pts;
  };
  for (let s = 0; s < SECTIONS.length - 1; s++) {
    const r0 = ring(SECTIONS[s]);
    const r1 = ring(SECTIONS[s + 1]);
    for (let i = 0; i < SIDES; i++) {
      const n = (i + 1) % SIDES;
      b.quad(r0[i], r0[n], r1[n], r1[i], SECTIONS[s][3]);
    }
  }
  // Nose cap behind the spinner.
  const first = ring(SECTIONS[0]);
  const noseC = [0, SECTIONS[0][2], SECTIONS[0][0]];
  for (let i = 0; i < SIDES; i++) {
    const n = (i + 1) % SIDES;
    b.tri(noseC, first[n], first[i], RED);
  }
}

function buildSpinner(b) {
  const SEG = 12;
  const apex = [0, 0, -5.05];
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
    const p0 = [Math.cos(a0) * 0.30, Math.sin(a0) * 0.30, -4.22];
    const p1 = [Math.cos(a1) * 0.30, Math.sin(a1) * 0.30, -4.22];
    b.tri(apex, p1, p0, RED);
  }
}

export function buildAircraft(gl) {
  const frame = new MeshBuilder();
  buildFuselage(frame);
  // Tail feathers: stabiliser and a red fin.
  frame.box(0, 0.42, 3.35, 1.85, 0.07, 0.55, CREAM);
  frame.box(0, 1.05, 3.30, 0.07, 0.75, 0.62, RED);
  frame.box(0, 1.72, 3.05, 0.075, 0.14, 0.30, RED);
  // Canopy greenhouse.
  frame.box(0, 0.78, -0.55, 0.44, 0.34, 0.85, GLASS);
  frame.box(0, 1.10, -0.55, 0.30, 0.06, 0.60, RED);
  // Fixed gear: two mains and a tail wheel.
  frame.box(-1.05, -0.62, -0.35, 0.09, 0.5, 0.09, DARK);
  frame.box(1.05, -0.62, -0.35, 0.09, 0.5, 0.09, DARK);
  frame.box(-1.05, -1.12, -0.35, 0.30, 0.16, 0.42, TYRE);
  frame.box(1.05, -1.12, -0.35, 0.30, 0.16, 0.42, TYRE);
  frame.box(0, -0.28, 3.30, 0.07, 0.30, 0.07, DARK);
  frame.box(0, -0.52, 3.30, 0.12, 0.10, 0.24, TYRE);
  // Exhaust stub.
  frame.box(0.45, -0.45, -3.3, 0.09, 0.09, 0.35, DARK);

  const fore = new MeshBuilder();
  buildSpinner(fore);
  // Main wing with red tips, slight gull bend faked by tip boxes.
  fore.box(0, 0.10, -0.55, 5.5, 0.09, 0.95, CREAM);
  fore.box(-5.15, 0.16, -0.55, 0.42, 0.10, 0.95, RED);
  fore.box(5.15, 0.16, -0.55, 0.42, 0.10, 0.95, RED);
  // Cowling cheeks either side of the nose.
  fore.box(-0.52, -0.05, -3.7, 0.16, 0.30, 0.55, RED);
  fore.box(0.52, -0.05, -3.7, 0.16, 0.30, 0.55, RED);

  const prop = new MeshBuilder();
  prop.box(0, 0, -4.92, 0.10, 1.48, 0.045, DARK);
  prop.box(0, 1.30, -4.92, 0.105, 0.20, 0.05, [0.95, 0.75, 0.20]);
  prop.box(0, -1.30, -4.92, 0.105, 0.20, 0.05, [0.95, 0.75, 0.20]);
  prop.box(0, 0, -4.92, 0.16, 0.16, 0.10, RED);

  return {
    airframe: frame.upload(gl),
    foreplane: fore.upload(gl),
    prop: prop.upload(gl),
  };
}
