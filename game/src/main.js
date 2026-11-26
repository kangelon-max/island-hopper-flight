// main.js — boots Island Hopper: WebGL scene, input, cameras, the game
// loop, and the menu wiring. A `?shot=<name>` URL freezes a composed scene
// (cover / approach / coast / landed) so the entry's screenshots are real
// renders of this code, taken in a browser.

import { createProgram, drawMesh, mat4Perspective, mat4LookAt, mat4FromBasis, mat4Multiply, mat4RotateZ, mat4Translation } from './gl-utils.js';
import { buildWorld, buildRingMesh, RUNWAY } from './world.js';
import { buildAircraft, GEAR_CLEARANCE } from './aircraft.js';
import { createPlane, resetForTakeoff, basisOf, stepPlane } from './flight-model.js';
import { createMissionState, startMission, updateMission, RINGS } from './missions.js';
import { drawHud } from './hud.js';
import { createEngineAudio } from './audio.js';

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const hudCtx = hudCanvas.getContext('2d');
const menuEl = document.getElementById('menu');
const statusEl = document.getElementById('status');

const gl = glCanvas.getContext('webgl', { antialias: true });
if (!gl) throw new Error('WebGL is not available in this browser.');
const program = createProgram(gl);
gl.useProgram(program.prog);
gl.enable(gl.DEPTH_TEST);
gl.disable(gl.CULL_FACE);

const world = buildWorld(gl);
const aircraft = buildAircraft(gl);
const ringGold = buildRingMesh(gl, [1.0, 0.72, 0.15]);
const ringTeal = buildRingMesh(gl, [0.15, 0.85, 0.80]);

const plane = createPlane();
plane.cameraMode = 'chase';
resetForTakeoff(plane);
const mission = createMissionState();
const audio = createEngineAudio();

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// ---------------------------------------------------------------- input
const keys = new Set();
let mouseNX = 0, mouseNY = 0;
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  audio.start();
  if (e.code === 'KeyC') plane.cameraMode = plane.cameraMode === 'chase' ? 'cockpit' : 'chase';
  if (e.code === 'KeyR' && mission.phase !== 'menu') startMission(mission, mission.kind, plane);
  if (e.code === 'Digit1') startMission(mission, 'rings', plane);
  if (e.code === 'Digit2') startMission(mission, 'landing', plane);
  if (e.code === 'Digit3') startMission(mission, 'free', plane);
  syncMenu();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('mousemove', (e) => {
  mouseNX = (e.clientX / innerWidth) * 2 - 1;
  mouseNY = (e.clientY / innerHeight) * 2 - 1;
});
addEventListener('mousedown', () => audio.start());

function buildInput() {
  const key = (code) => (keys.has(code) ? 1 : 0);
  let pitch = key('ArrowUp') - key('ArrowDown') - mouseNY * 0.5;
  let roll = key('ArrowRight') - key('ArrowLeft') + mouseNX * 0.6;
  pitch = Math.max(-1, Math.min(1, pitch));
  roll = Math.max(-1, Math.min(1, roll));
  return {
    throttleDelta: key('KeyW') + key('ShiftLeft') + key('ShiftRight') - key('KeyS') - key('ControlLeft') - key('ControlRight'),
    pitch,
    roll,
    rudder: key('KeyD') - key('KeyA'),
    brake: keys.has('KeyB') || keys.has('Space'),
  };
}

// ---------------------------------------------------------------- menu
function syncMenu() {
  menuEl.classList.toggle('hidden', mission.phase === 'flying');
}
menuEl.querySelectorAll('button[data-mission]').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.start();
    startMission(mission, btn.dataset.mission, plane);
    syncMenu();
  });
});
syncMenu();

// ------------------------------------------------------- screenshot scenes
function setupShot(name) {
  menuEl.classList.add('hidden');
  mission.phase = 'flying';
  if (name === 'cover') {
    startMission(mission, 'rings', plane);
    plane.pos = [368, 96, 557];
    plane.pitch = 0.03;
    plane.speed = 47;
    plane.throttle = 0.66;
    plane.vspeed = 1.4;
    mission.elapsed = 34.2;
  } else if (name === 'approach') {
    startMission(mission, 'landing', plane);
    plane.pos = [-700, RUNWAY.elev + 58, RUNWAY.cz + 6];
    plane.pitch = -0.045;
    plane.speed = 36;
    plane.throttle = 0.30;
    plane.vspeed = -3.2;
    mission.elapsed = 41.7;
  } else if (name === 'coast') {
    startMission(mission, 'free', plane);
    plane.pos = [1450, 330, 1250];
    plane.yaw = -0.86;
    plane.pitch = -0.02;
    plane.speed = 52;
    plane.throttle = 0.55;
    plane.vspeed = -0.6;
    plane.onGround = false;
    mission.elapsed = 96.0;
  } else if (name === 'landed') {
    startMission(mission, 'landing', plane);
    plane.pos = [RUNWAY.cx + 110, RUNWAY.elev + GEAR_CLEARANCE, RUNWAY.cz];
    plane.speed = 0;
    plane.throttle = 0;
    plane.onGround = true;
    plane.stopped = true;
    plane.touchdown = { vs: -1.3, speed: 24, onRunway: true };
    mission.judged = true;
    mission.phase = 'done';
    mission.score = 934;
    mission.headline = 'GREASED IT';
    mission.detail = 'Sink at touch -1.3 m/s, stopped on the strip. Score 934. Press R to go again.';
    mission.elapsed = 58.4;
  }
  plane.propAngle = 0.8;
}
if (shotName) setupShot(shotName);

// ---------------------------------------------------------------- camera
const camEye = [plane.pos[0] - 14, plane.pos[1] + 5, plane.pos[2]];
const camUp = [0, 1, 0];

function updateCamera(dt, nowSec) {
  const basis = basisOf(plane);
  if (mission.phase === 'menu' && !shotName) {
    const a = nowSec * 0.12;
    camEye[0] = plane.pos[0] + Math.cos(a) * 17;
    camEye[1] = plane.pos[1] + 5.5;
    camEye[2] = plane.pos[2] + Math.sin(a) * 17;
    camUp[0] = 0; camUp[1] = 1; camUp[2] = 0;
    return { eye: camEye, center: [plane.pos[0], plane.pos[1] + 0.8, plane.pos[2]], up: camUp };
  }
  if (plane.cameraMode === 'cockpit') {
    const eye = [
      plane.pos[0] + basis.up[0] * 1.02 - basis.forward[0] * 0.2,
      plane.pos[1] + basis.up[1] * 1.02 - basis.forward[1] * 0.2,
      plane.pos[2] + basis.up[2] * 1.02 - basis.forward[2] * 0.2,
    ];
    const center = [
      eye[0] + basis.forward[0] * 10,
      eye[1] + basis.forward[1] * 10,
      eye[2] + basis.forward[2] * 10,
    ];
    return { eye, center, up: basis.up };
  }
  const want = [
    plane.pos[0] + basis.back[0] * 13.5 + basis.up[0] * 4.6,
    plane.pos[1] + basis.back[1] * 13.5 + basis.up[1] * 4.6,
    plane.pos[2] + basis.back[2] * 13.5 + basis.up[2] * 4.6,
  ];
  const k = shotName ? 1 : 1 - Math.exp(-dt * 5.5);
  for (let i = 0; i < 3; i++) {
    camEye[i] += (want[i] - camEye[i]) * k;
    camUp[i] += (basis.up[i] - camUp[i]) * k;
  }
  const center = [
    plane.pos[0] + basis.forward[0] * 26,
    plane.pos[1] + basis.forward[1] * 26 + 1.0,
    plane.pos[2] + basis.forward[2] * 26,
  ];
  return { eye: camEye, center, up: camUp };
}

// ---------------------------------------------------------------- render
function resize() {
  const w = innerWidth, h = innerHeight;
  for (const c of [glCanvas, hudCanvas]) {
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  gl.viewport(0, 0, w, h);
}
addEventListener('resize', resize);
resize();

const FOG = [0.74, 0.84, 0.93];
function setFog(near, far) {
  gl.uniform3fv(program.uFogColor, FOG);
  gl.uniform1f(program.uFogNear, near);
  gl.uniform1f(program.uFogFar, far);
}

let lastMs = performance.now();
let shownPhase = mission.phase;

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (nowMs - lastMs) / 1000);
  lastMs = nowMs;
  const nowSec = nowMs / 1000;

  if (!shotName && mission.phase === 'flying') {
    stepPlane(plane, buildInput(), dt);
    updateMission(mission, plane, dt);
    audio.update(plane.throttle, plane.speed, plane.crashed);
    if (mission.phase !== shownPhase) {
      shownPhase = mission.phase;
      statusEl.textContent = mission.headline || '';
      if (mission.phase === 'done' || mission.phase === 'crashed') syncMenu();
    }
  }

  const cam = updateCamera(shotName ? 0 : dt, nowSec);
  const proj = mat4Perspective((62 * Math.PI) / 180, innerWidth / innerHeight, 0.3, 16000);
  const view = mat4LookAt(cam.eye, cam.center, cam.up);
  gl.uniformMatrix4fv(program.uProj, false, proj);
  gl.uniformMatrix4fv(program.uView, false, view);
  gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  setFog(1e8, 2e8); // sky and sun sit beyond the fog
  drawMesh(gl, program, world.sky, IDENTITY, true);
  drawMesh(gl, program, world.sun, IDENTITY, true);
  setFog(500, 7000);
  drawMesh(gl, program, world.sea, IDENTITY, false);
  drawMesh(gl, program, world.terrain, IDENTITY, false);
  drawMesh(gl, program, world.runway, IDENTITY, false);
  drawMesh(gl, program, world.props, IDENTITY, false);
  drawMesh(gl, program, world.peaks, IDENTITY, false);
  drawMesh(gl, program, world.clouds, IDENTITY, true); // unlit: bright at every angle

  // Rings: the next one gold, the rest teal; a gentle pulse on the target.
  RINGS.forEach((ring, i) => {
    const isNext = mission.kind === 'rings' && i === mission.ringIndex;
    const s = isNext ? 1 + 0.035 * Math.sin(nowSec * 3.2) : 1;
    const scaled = mat4FromBasis(
      ring.right.map((v) => v * s), ring.up.map((v) => v * s), ring.normal.map((v) => v * s), ring.pos);
    drawMesh(gl, program, isNext ? ringGold : ringTeal, scaled, true);
  });

  // The aircraft. In cockpit view the fuselage is skipped — you sit in it.
  const basis = basisOf(plane);
  const model = mat4FromBasis(basis.right, basis.up, basis.back, plane.pos);
  if (plane.cameraMode !== 'cockpit') drawMesh(gl, program, aircraft.airframe, model, false);
  drawMesh(gl, program, aircraft.foreplane, model, false);
  const propModel = mat4Multiply(model,
    mat4Multiply(mat4Translation(0, 0, 0), mat4RotateZ(plane.propAngle)));
  drawMesh(gl, program, aircraft.prop, propModel, false);

  drawHud(hudCtx, innerWidth, innerHeight, plane, mission, shotName ? 1000 : nowMs);
}
requestAnimationFrame(frame);
