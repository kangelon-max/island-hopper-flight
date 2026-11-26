// missions.js — the three sorties of Island Hopper: a ring course against
// the clock, a judged landing challenge, and free flight. Owns the ring
// layout, pass detection, scoring and the words the HUD shows.

import { RUNWAY, onRunway } from './world.js';
import { resetAirborne, resetForTakeoff } from './flight-model.js';

export const RING_RADIUS = 16;

// A loop around the island: [x, y, z, yaw of travel through the ring].
const RING_DEFS = [
  [500, 95, 560, Math.PI / 2],
  [1050, 130, 150, 0.93],
  [1150, 170, -650, 0.12],
  [450, 150, -1150, -0.95],
  [-450, 120, -1050, -1.68],
  [-1050, 100, -350, -2.43],
  [-950, 85, 400, 3.01],
  [-250, 80, 620, 1.87],
];

export const RINGS = RING_DEFS.map(([x, y, z, yaw]) => {
  const normal = [Math.sin(yaw), 0, -Math.cos(yaw)];
  const right = [normal[2], 0, -normal[0]]; // up × normal, kept horizontal
  return { pos: [x, y, z], yaw, normal, right, up: [0, 1, 0] };
});

export function createMissionState() {
  return {
    kind: 'free',
    phase: 'menu', // menu | flying | done | crashed
    ringIndex: 0,
    prevSide: 0,
    elapsed: 0,
    score: 0,
    headline: '',
    detail: '',
    judged: false,
  };
}

export function startMission(state, kind, plane) {
  state.kind = kind;
  state.phase = 'flying';
  state.ringIndex = 0;
  state.elapsed = 0;
  state.score = 0;
  state.judged = false;
  state.headline = '';
  state.detail = '';
  if (kind === 'rings') {
    resetAirborne(plane, [-120, 92, 552], Math.PI / 2, 0.02, 46, 0.65);
    state.prevSide = sideOf(RINGS[0], plane.pos);
    state.detail = 'Thread the gold ring, then chase the teal ones. Fast and low burns fuel.';
  } else if (kind === 'landing') {
    resetAirborne(plane, [-1180, RUNWAY.elev + 108, RUNWAY.cz], Math.PI / 2, -0.03, 38, 0.30);
    state.detail = 'Runway ahead, 1.2 km. Ease her down: sink under 5.5 m/s at touch, stop on the strip.';
  } else {
    resetForTakeoff(plane);
    state.detail = 'Full throttle with W, rotate past 24 m/s, explore. Land back on the strip when fuel runs low.';
  }
}

function sideOf(ring, pos) {
  return (pos[0] - ring.pos[0]) * ring.normal[0]
    + (pos[1] - ring.pos[1]) * ring.normal[1]
    + (pos[2] - ring.pos[2]) * ring.normal[2];
}

function crossedRing(ring, plane) {
  const side = sideOf(ring, plane.pos);
  const crossed = (state.prevSide <= 0 && side > 0) || (state.prevSide >= 0 && side < 0);
  state.prevSide = side;
  if (!crossed) return false;
  const d = [
    plane.pos[0] - ring.pos[0] - ring.normal[0] * side,
    plane.pos[1] - ring.pos[1] - ring.normal[1] * side,
    plane.pos[2] - ring.pos[2] - ring.normal[2] * side,
  ];
  return Math.hypot(d[0], d[1], d[2]) < RING_RADIUS;
}

let state; // bound by update() each frame; keeps crossedRing's signature small

export function updateMission(m, plane, dt) {
  state = m;
  if (m.phase !== 'flying') return;
  if (plane.crashed) {
    m.phase = 'crashed';
    m.headline = 'CRASHED';
    m.detail = plane.crashReason + ' Press R to fly again.';
    return;
  }
  m.elapsed += dt;

  if (m.kind === 'rings') {
    const ring = RINGS[m.ringIndex];
    if (ring && crossedRing(ring, plane)) {
      m.ringIndex++;
      if (m.ringIndex >= RINGS.length) {
        m.phase = 'done';
        m.score = Math.round(1000 + Math.max(0, 900 - m.elapsed * 3) + plane.fuel * 5);
        m.headline = 'COURSE COMPLETE';
        m.detail = `All ${RINGS.length} rings in ${m.elapsed.toFixed(1)}s. Score ${m.score}. Press R to fly it again.`;
      } else {
        state.prevSide = sideOf(RINGS[m.ringIndex], plane.pos);
      }
    }
  } else if (m.kind === 'landing') {
    if (plane.touchdown && !m.judged && plane.onGround) {
      m.judged = true;
      if (!plane.touchdown.onRunway) {
        m.phase = 'done';
        m.score = 120;
        m.headline = 'DOWN — OFF THE STRIP';
        m.detail = 'In one piece, but the judges wanted runway. Press R and try the approach again.';
      }
    }
    if (m.judged && plane.stopped && onRunway(plane.pos[0], plane.pos[2])) {
      const smoothness = Math.max(0, 1 + plane.touchdown.vs / 5.5); // 1 = feather, 0 = limit
      m.phase = 'done';
      m.score = Math.round(500 + smoothness * 500 + plane.fuel * 2);
      m.headline = plane.touchdown.vs > -2.2 ? 'GREASED IT' : 'TOUCHDOWN — ON THE RUNWAY';
      m.detail = `Sink at touch ${plane.touchdown.vs.toFixed(1)} m/s, stopped on the strip. Score ${m.score}. Press R to go again.`;
    } else if (m.judged && plane.stopped && !onRunway(plane.pos[0], plane.pos[2])) {
      m.phase = 'done';
      m.score = 150;
      m.headline = 'STOPPED — OFF THE RUNWAY';
      m.detail = 'Safe, but off the strip scores little. Press R and fly the approach again.';
    }
  }
}

// Short lines for the HUD's mission panel.
export function missionLines(m, plane) {
  if (m.kind === 'rings') {
    return [
      `RING ${Math.min(m.ringIndex + 1, RINGS.length)} / ${RINGS.length}`,
      `TIME ${m.elapsed.toFixed(1)}s`,
    ];
  }
  if (m.kind === 'landing') {
    const dx = RUNWAY.cx - RUNWAY.halfLen - plane.pos[0];
    return [
      m.judged ? 'TOUCHED DOWN' : `RUNWAY ${Math.max(0, Math.round(dx))} m`,
      `TIME ${m.elapsed.toFixed(1)}s`,
    ];
  }
  return ['FREE FLIGHT', `TIME ${m.elapsed.toFixed(1)}s`];
}

export const MISSION_TITLES = {
  rings: 'RING COURSE',
  landing: 'LANDING CHALLENGE',
  free: 'FREE FLIGHT',
};
