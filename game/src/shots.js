// shots.js — the autopilot and the screenshot presets. The autopilot is a real
// game feature (key O: "demo flight" — the plane flies itself to the next ring
// so a new pilot can watch how it is done). The URL presets (?shot=cover etc.)
// only choose a starting camera, mission and autopilot state; the game renders
// exactly the same code either way, which is what makes the screenshots honest.

import { MISSIONS } from './missions.js';
import { groundHeight } from './terrain.js';

// Steer the plane toward a point: returns stick values for the flight model.
export function autopilotStick(state, target, dt) {
  const dx = target[0] - state.x;
  const dz = target[2] - state.z;
  const wantHeading = Math.atan2(dx, -dz);
  let diff = wantHeading - state.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // Bank hard into the turn and slow down while the heading error is large:
  // a slow plane turns on a much smaller radius, so it stops orbiting the ring.
  const bank = Math.max(-1, Math.min(1, diff * 2.2));
  const dy = target[1] - state.y;
  const pitch = Math.max(-0.8, Math.min(0.9, dy * 0.02 - 0.05));
  // Climb hard if terrain is close ahead.
  const aheadX = state.x + Math.sin(state.heading) * 120;
  const aheadZ = state.z - Math.cos(state.heading) * 120;
  const clearance = state.y - groundHeight(aheadX, aheadZ);
  const safePitch = clearance < 60 ? 0.9 : pitch;
  const throttleDelta = Math.abs(diff) > 0.7
    ? (state.throttle > 0.45 ? -0.55 : 0)
    : (state.throttle < 0.8 ? 0.55 : 0);
  return { pitch: safePitch, bank, throttleDelta };
}

// Presets used by the screenshot captures. Each names a mission, a camera and
// a starting pose; main.js applies them after the title screen is dismissed.
export const SHOT_PRESETS = {
  cover: { mission: 'rings', camera: 'chase', pose: [-260, 185, -180], headingDeg: 35, throttle: 0.72, autopilot: true },
  rings: { mission: 'rings', camera: 'chase', pose: [180, 145, -20], headingDeg: 55, throttle: 0.75, autopilot: true },
  landing: { mission: 'landing', camera: 'chase', pose: [60, 95, 1150], headingDeg: 0, throttle: 0.35, autopilot: true },
  cockpit: { mission: 'trial', camera: 'cockpit', pose: [-120, 210, -700], headingDeg: 10, throttle: 0.8, autopilot: true },
};

export function readShotPreset() {
  const q = new URLSearchParams(window.location.search);
  const name = q.get('shot');
  if (name && SHOT_PRESETS[name]) return { name, ...SHOT_PRESETS[name] };
  if (q.get('demo') === '1') return { name: 'demo', mission: 'rings', camera: 'chase', pose: [0, 150, 300], headingDeg: 0, throttle: 0.7, autopilot: true };
  return null;
}

export function nextRingTarget(runner) {
  const next = runner.mission.rings[runner.index];
  if (next) return next;
  return [0, 150, 620]; // no rings left: head home to the airfield
}
