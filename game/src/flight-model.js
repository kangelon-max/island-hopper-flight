// flight-model.js — an arcade flight model with real discipline: throttle
// and drag, gravity along the flight path, a wing that stalls when slow,
// banked turns that trade speed for heading, fuel that burns with throttle,
// and ground handling with judged touchdowns.

import { heightAt, onRunway, RUNWAY } from './world.js';
import { GEAR_CLEARANCE } from './aircraft.js';

export const STALL_SPEED = 24;
export const MAX_SPEED = 88;

export function createPlane() {
  return {
    pos: [0, 0, 0],
    yaw: Math.PI / 2,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 100,
    onGround: true,
    stalled: false,
    crashed: false,
    crashReason: '',
    stopped: false,
    vspeed: 0,
    touchdown: null, // { vs, speed, onRunway } at the moment of contact
    propAngle: 0,
  };
}

export function resetForTakeoff(plane) {
  Object.assign(plane, createPlane());
  plane.pos = [RUNWAY.cx - RUNWAY.halfLen + 70, RUNWAY.elev + GEAR_CLEARANCE, RUNWAY.cz];
  plane.yaw = Math.PI / 2; // facing east, down the strip
}

export function resetAirborne(plane, pos, yaw, pitch, speed, throttle) {
  Object.assign(plane, createPlane());
  plane.pos = [...pos];
  plane.yaw = yaw;
  plane.pitch = pitch;
  plane.speed = speed;
  plane.throttle = throttle;
  plane.onGround = false;
}

export function headingDeg(plane) {
  const d = (plane.yaw * 180) / Math.PI;
  return ((d % 360) + 360) % 360;
}

// Orthonormal basis of the aircraft: forward, right (rolled), up, back.
export function basisOf(plane) {
  const cp = Math.cos(plane.pitch), sp = Math.sin(plane.pitch);
  const forward = [Math.sin(plane.yaw) * cp, sp, -Math.cos(plane.yaw) * cp];
  let rx = -forward[2], rz = forward[0];
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl; rz /= rl;
  const r0 = [rx, 0, rz];
  const u0 = [
    r0[1] * forward[2] - r0[2] * forward[1],
    r0[2] * forward[0] - r0[0] * forward[2],
    r0[0] * forward[1] - r0[1] * forward[0],
  ];
  const cr = Math.cos(plane.roll), sr = Math.sin(plane.roll);
  const right = [
    r0[0] * cr - u0[0] * sr,
    r0[1] * cr - u0[1] * sr,
    r0[2] * cr - u0[2] * sr,
  ];
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { forward, right, up, back: [-forward[0], -forward[1], -forward[2]] };
}

function crash(plane, reason) {
  plane.crashed = true;
  plane.crashReason = reason;
  plane.speed = 0;
  plane.throttle = 0;
}

// input: { throttleDelta, pitch, roll, rudder, brake } — pitch/roll/rudder in
// -1..1 from keys and mouse combined (main.js builds it).
export function stepPlane(plane, input, dt) {
  if (plane.crashed) return;
  dt = Math.min(dt, 0.05);

  plane.throttle = Math.min(1, Math.max(0, plane.throttle + input.throttleDelta * dt));
  const hasFuel = plane.fuel > 0;
  if (hasFuel) plane.fuel = Math.max(0, plane.fuel - dt * (0.05 + plane.throttle * 0.24));
  const throttleEff = hasFuel ? plane.throttle : 0;

  const eff = Math.min(1, Math.max(0.22, plane.speed / 30));
  const targetRoll = input.roll * 1.02;
  const rollRate = 2.4 * eff;
  plane.roll += Math.max(-rollRate * dt, Math.min(rollRate * dt, targetRoll - plane.roll));

  if (plane.onGround) {
    const steer = Math.min(1, plane.speed / 14);
    plane.yaw += input.rudder * 0.55 * steer * dt;
    plane.yaw += input.roll * 0.22 * steer * dt;
    // Pitch is the pilot asking to rotate; below flying speed it does nothing.
    if (plane.speed > STALL_SPEED && input.pitch > 0.05) {
      plane.pitch = Math.min(0.30, plane.pitch + input.pitch * 0.7 * dt);
    } else {
      plane.pitch = Math.max(0, plane.pitch - 1.6 * dt);
    }
  } else {
    plane.pitch += input.pitch * 0.85 * eff * dt;
    plane.pitch = Math.max(-0.62, Math.min(0.55, plane.pitch));
    plane.yaw += (Math.tan(plane.roll) * 9.81 * 1.18) / Math.max(plane.speed, 12) * dt;
    plane.yaw += input.rudder * 0.28 * eff * dt;
    if (Math.abs(input.pitch) < 0.03) plane.pitch -= plane.pitch * 0.10 * dt; // gentle trim
  }

  // Stall: the wing lets go, the nose drops, the sink builds.
  plane.stalled = !plane.onGround && plane.speed < STALL_SPEED;
  if (plane.stalled) plane.pitch = Math.max(-0.62, plane.pitch - 0.5 * dt);

  // Speed: engine thrust against drag and the hill of gravity.
  let accel = throttleEff * 25 - 0.0042 * plane.speed * plane.speed - Math.sin(plane.pitch) * 9.81;
  if (plane.onGround) accel -= 1.1 + (input.brake ? 7.5 : 0);
  if (plane.stalled) accel -= 2.0;
  plane.speed = Math.max(0, plane.speed + accel * dt);
  if (!plane.onGround && plane.speed > MAX_SPEED) plane.speed = MAX_SPEED;

  const { forward } = basisOf(plane);
  plane.vspeed = forward[1] * plane.speed;
  const wasGround = plane.onGround;
  plane.pos[0] += forward[0] * plane.speed * dt;
  plane.pos[1] += forward[1] * plane.speed * dt;
  plane.pos[2] += forward[2] * plane.speed * dt;
  plane.pos[0] = Math.max(-2600, Math.min(2600, plane.pos[0]));
  plane.pos[2] = Math.max(-2600, Math.min(2600, plane.pos[2]));

  const groundY = heightAt(plane.pos[0], plane.pos[2]) + GEAR_CLEARANCE;
  if (plane.pos[1] <= groundY) {
    plane.pos[1] = groundY;
    if (!wasGround) {
      const vs = plane.vspeed;
      const onRwy = onRunway(plane.pos[0], plane.pos[2]);
      plane.touchdown = { vs, speed: plane.speed, onRunway: onRwy };
      if (vs < -8.5) return crash(plane, 'Came down too hard — the gear collapsed.');
      if (!onRwy && vs < -3.2) return crash(plane, 'Rough terrain tore the gear off.');
      if (!onRwy && plane.speed > 44) return crash(plane, 'Too fast for rough ground.');
      plane.onGround = true;
      plane.roll = 0;
    }
    // Rolling: stay glued to the ground unless fast and rotated.
    if (plane.speed > STALL_SPEED && plane.pitch > 0.05) {
      plane.onGround = false;
      plane.pos[1] = groundY + 0.15;
    } else {
      plane.pitch = Math.max(0, plane.pitch - 2.2 * dt);
    }
  } else if (plane.pos[1] > groundY + 0.4) {
    plane.onGround = false;
  }

  plane.stopped = plane.onGround && plane.speed < 0.4 && plane.throttle < 0.05;
  plane.propAngle += dt * (2 + throttleEff * 55);
}
