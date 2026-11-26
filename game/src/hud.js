// hud.js — the instrument panel, drawn on a 2D canvas over the 3D view:
// heading tape, airspeed and altitude readouts, an artificial horizon with
// a pitch ladder, throttle and fuel bars, stall and fuel warnings, the
// mission panel and end-of-sortie banners. Everything a screenshot needs
// to read as a real flight game at a glance.

import { headingDeg, STALL_SPEED } from './flight-model.js';
import { MISSION_TITLES, missionLines } from './missions.js';

const GREEN = '#7dff8a';
const AMBER = '#ffd75e';
const RED = '#ff5f4d';
const INK = 'rgba(6, 18, 30, 0.72)';
const LINE = 'rgba(150, 210, 255, 0.55)';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = INK;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fill();
  ctx.stroke();
}

function bar(ctx, x, y, w, h, frac, color, label, value) {
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
  ctx.strokeStyle = LINE;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#dcefff';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y - 5);
  ctx.textAlign = 'right';
  ctx.fillText(value, x + w, y - 5);
}

function headingTape(ctx, w, heading) {
  const cx = w / 2, tw = 360, th = 46, x0 = cx - tw / 2, y0 = 14;
  panel(ctx, x0, y0, tw, th);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 + 4, y0 + 4, tw - 8, th - 8);
  ctx.clip();
  ctx.fillStyle = '#eaf4ff';
  ctx.textAlign = 'center';
  const pxPerDeg = 3.4;
  const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let d = -60; d <= 60; d += 5) {
    const deg = ((Math.round((heading + d) / 5) * 5) % 360 + 360) % 360;
    const x = cx + (deg - heading + (deg - heading > 180 ? -360 : deg - heading < -180 ? 360 : 0)) * pxPerDeg;
    if (x < x0 + 6 || x > x0 + tw - 6) continue;
    ctx.fillRect(x, y0 + th - 14, 1.6, deg % 30 === 0 ? 10 : 6);
    if (deg % 30 === 0) {
      ctx.font = deg % 90 === 0 ? '800 15px system-ui, sans-serif' : '600 11px system-ui, sans-serif';
      ctx.fillText(names[deg] ?? String(deg / 10).padStart(2, '0'), x, y0 + 19);
    }
  }
  ctx.restore();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx - 7, y0 + th + 2);
  ctx.lineTo(cx + 7, y0 + th + 2);
  ctx.lineTo(cx, y0 + th - 7);
  ctx.closePath();
  ctx.fill();
  ctx.font = '800 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(heading)).padStart(3, '0')}°`, cx, y0 + th + 24);
}

function horizon(ctx, cx, cy, r, plane) {
  ctx.save();
  panel(ctx, cx - r - 10, cy - r - 10, r * 2 + 20, r * 2 + 20);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll);
  const pitchPx = plane.pitch * 150;
  ctx.fillStyle = '#3f7fc4';
  ctx.fillRect(-r * 1.6, -r * 1.6 + pitchPx, r * 3.2, r * 1.6);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(-r * 1.6, pitchPx, r * 3.2, r * 1.6);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 1.6, pitchPx);
  ctx.lineTo(r * 1.6, pitchPx);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const deg of [-20, -10, 10, 20]) {
    const y = pitchPx - deg * 2.6;
    const half = deg % 20 === 0 ? 17 : 11;
    ctx.beginPath();
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
    ctx.stroke();
    ctx.fillText(String(Math.abs(deg)), half + 9, y + 3);
  }
  ctx.restore();
  // Fixed aircraft symbol and roll pointer.
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy);
  ctx.lineTo(cx - 9, cy);
  ctx.moveTo(cx + 9, cy);
  ctx.lineTo(cx + 30, cy);
  ctx.stroke();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  const pa = -plane.roll - Math.PI / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx + Math.cos(pa) * (r - 7), cy + Math.sin(pa) * (r - 7), 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#dcefff';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HORIZON', cx, cy + r + 24);
}

function bigReadout(ctx, x, y, w, label, value, unit, color) {
  panel(ctx, x, y, w, 58);
  ctx.fillStyle = '#9fb9d4';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 10, y + 17);
  ctx.fillStyle = color;
  ctx.font = '800 27px system-ui, sans-serif';
  ctx.fillText(value, x + 10, y + 46);
  ctx.fillStyle = '#9fb9d4';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(unit, x + w - 9, y + 46);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}

export function drawHud(ctx, w, h, plane, mission, nowMs) {
  ctx.clearRect(0, 0, w, h);
  const heading = headingDeg(plane);
  const knots = plane.speed * 1.944;
  const altFt = Math.max(0, Math.round((plane.pos[1] - 18) * 3.281));
  const vsi = Math.round(plane.vspeed * 196.85);

  headingTape(ctx, w, heading);
  bigReadout(ctx, 18, 84, 148, 'AIRSPEED', String(Math.round(knots)), 'KT',
    plane.stalled ? RED : GREEN);
  bigReadout(ctx, w - 166, 84, 148, 'ALTITUDE', altFt.toLocaleString('en-US'), 'FT', GREEN);
  bigReadout(ctx, w - 166, 152, 148, 'VERT SPEED', (vsi > 0 ? '+' : '') + vsi, 'FPM',
    vsi < -900 ? AMBER : '#eaf4ff');

  horizon(ctx, w / 2, h - 128, 56, plane);

  // Throttle and fuel, bottom left.
  bar(ctx, 20, h - 62, 190, 13, plane.throttle, AMBER, 'THROTTLE', `${Math.round(plane.throttle * 100)}%`);
  const fuelColor = plane.fuel < 20 ? RED : plane.fuel < 45 ? AMBER : GREEN;
  bar(ctx, 20, h - 26, 190, 13, plane.fuel / 100, fuelColor, 'FUEL', `${Math.round(plane.fuel)}%`);

  // Mission panel, bottom right.
  const lines = missionLines(mission, plane);
  panel(ctx, w - 232, h - 96, 214, 78);
  ctx.fillStyle = AMBER;
  ctx.font = '800 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(MISSION_TITLES[mission.kind], w - 218, h - 72);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '600 13px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, w - 218, h - 50 + i * 17));
  if (mission.phase === 'done') {
    ctx.fillStyle = GREEN;
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillText(`SCORE ${mission.score}`, w - 218, h - 50 + lines.length * 17);
  }

  // Camera mode tag.
  ctx.fillStyle = 'rgba(220, 239, 255, 0.85)';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(plane.cameraMode === 'cockpit' ? 'CAMERA: COCKPIT (C)' : 'CAMERA: CHASE (C)', 20, 30);

  // Warnings.
  ctx.textAlign = 'center';
  if (plane.stalled && Math.floor(nowMs / 380) % 2 === 0) {
    ctx.fillStyle = RED;
    ctx.font = '900 30px system-ui, sans-serif';
    ctx.fillText('STALL', w / 2, 128);
  }
  if (!plane.onGround && plane.fuel <= 0) {
    ctx.fillStyle = RED;
    ctx.font = '800 19px system-ui, sans-serif';
    ctx.fillText('OUT OF FUEL — GLIDE!', w / 2, 158);
  } else if (plane.fuel > 0 && plane.fuel < 20) {
    ctx.fillStyle = AMBER;
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.fillText('LOW FUEL', w / 2, 158);
  }

  // End-of-sortie banner.
  if (mission.phase === 'done' || mission.phase === 'crashed') {
    const bw = Math.min(560, w - 60);
    panel(ctx, w / 2 - bw / 2, 178, bw, 104);
    ctx.fillStyle = mission.phase === 'crashed' ? RED : GREEN;
    ctx.font = '900 27px system-ui, sans-serif';
    ctx.fillText(mission.headline, w / 2, 216);
    ctx.fillStyle = '#eaf4ff';
    ctx.font = '600 14.5px system-ui, sans-serif';
    wrapText(ctx, mission.detail, w / 2, 242, bw - 36, 19);
  } else if (mission.phase === 'flying' && mission.elapsed < 6 && mission.detail) {
    ctx.fillStyle = 'rgba(234, 244, 255, 0.92)';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(mission.detail, w / 2, h - 196);
  }

  // Speed below the stall on approach gets a quiet hint.
  if (!plane.onGround && !plane.stalled && plane.speed < STALL_SPEED + 4 && plane.pos[1] < 120) {
    ctx.fillStyle = AMBER;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText('WATCH YOUR SPEED', w / 2, 100);
  }
}
