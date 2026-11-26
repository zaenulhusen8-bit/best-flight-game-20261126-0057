// aircraft.js — the "Kestrel" skylark: a small high-wing bush plane built from
// primitives, plus its arcade flight model. One clear job: how the plane looks
// and how it flies. Nothing here touches the HUD, the missions or the terrain.

export const KNOTS_PER_MS = 1.94384;

// Build the aircraft mesh. Faces +Z as "forward" (three.js convention here:
// the plane's nose points along local -Z after we rotate the group; the flight
// model keeps heading as a compass angle and we convert when we place it).
export function buildAircraft() {
  const THREE = window.THREE;
  const g = new THREE.Group();
  g.name = 'kestrel-aircraft';

  const cream = new THREE.MeshLambertMaterial({ color: 0xf3e6c8 });
  const red = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8e8, emissive: 0x2a4a5a });
  const metal = new THREE.MeshLambertMaterial({ color: 0xb9c0c7 });

  // Fuselage: a tapered cylinder along Z, nose forward.
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 5.6, 12), cream);
  fus.rotation.x = Math.PI / 2;
  fus.position.z = 0.2;
  g.add(fus);
  // Nose cone + spinner.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 12), red);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.7;
  g.add(nose);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), metal);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -4.6;
  spinner.name = 'prop-spinner';
  g.add(spinner);
  // Propeller blades (spin in the loop).
  const bladeGeo = new THREE.BoxGeometry(0.28, 3.6, 0.08);
  const blade = new THREE.Mesh(bladeGeo, dark);
  blade.position.z = -4.55;
  blade.name = 'propeller';
  g.add(blade);
  // Cabin glass.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.75, 1.9), glass);
  cabin.position.set(0, 0.55, -0.4);
  g.add(cabin);
  // High wing, slightly swept, with red tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.18, 1.9), cream);
  wing.position.set(0, 0.72, -0.3);
  g.add(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 1.9), red);
    tip.position.set(s * 5.55, 0.72, -0.3);
    g.add(tip);
    // Wing struts.
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), metal);
    strut.position.set(s * 2.4, -0.15, -0.3);
    strut.rotation.z = s * 0.5;
    g.add(strut);
  }
  // Tail: horizontal stabiliser + vertical fin, red.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.1), red);
  stab.position.set(0, 0.25, 2.9);
  g.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 1.4), red);
  fin.position.set(0, 0.85, 2.9);
  g.add(fin);
  // Tail wheel + main gear.
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6), dark);
    leg.position.set(s * 0.85, -0.9, -0.6);
    g.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 0.85, -1.45, -0.6);
    g.add(wheel);
  }
  // Navigation lights: red left, green right, white tail (small emissive spheres).
  const nav = [
    [new THREE.MeshBasicMaterial({ color: 0xff2a2a }), -5.9, 0.72, -0.3],
    [new THREE.MeshBasicMaterial({ color: 0x2aff5a }), 5.9, 0.72, -0.3],
    [new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0.3, 3.6],
  ];
  for (const [m, x, y, z] of nav) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), m);
    light.position.set(x, y, z);
    g.add(light);
  }
  // Landing light under the nose (lit when the gear is down / on approach).
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  );
  lamp.position.set(0, -0.55, -3.2);
  lamp.name = 'landing-light';
  g.add(lamp);
  return g;
}

// --- flight model ------------------------------------------------------------
// State is plain data: position (metres, y up), heading (radians, 0 = north,
// increasing clockwise), pitch and bank (radians), speed (m/s), throttle 0..1,
// fuel 0..100, damage 0..100. The model is arcade but honest: speed bleeds in a
// climb, the turn rate follows bank, and below flying speed the nose drops.
export function freshState() {
  return {
    x: 0, y: 60, z: 620 + 310 - 40, // on runway 09, at the southern threshold
    heading: 0, // facing north along the runway (runway runs north-south here)
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    fuel: 100,
    damage: 0,
    crashed: false,
    landed: false,
    verticalSpeed: 0,
    groundSpeed: 0,
  };
}

const MAX_SPEED = 95; // m/s ≈ 185 kt
const STALL_SPEED = 22; // m/s ≈ 43 kt
const TAKEOFF_SPEED = 30;

export function stepFlight(state, input, dt, groundAt) {
  if (state.crashed) return;
  // Throttle: shift up, ctrl down; fuel burns with throttle — a full-throttle
  // sortie lasts about two minutes, so fuel is a real decision, not a timer.
  state.throttle = Math.max(0, Math.min(1, state.throttle + input.throttleDelta * dt));
  const burn = (0.25 + state.throttle * 0.8) * dt;
  state.fuel = Math.max(0, state.fuel - burn);
  if (state.fuel <= 0) state.throttle = 0;

  // Pitch and bank follow the stick, eased toward the target.
  const pitchTarget = input.pitch * 0.42;
  const bankTarget = input.bank * 1.05;
  state.pitch += (pitchTarget - state.pitch) * Math.min(1, dt * 3.2);
  state.bank += (bankTarget - state.bank) * Math.min(1, dt * 2.6);

  // Speed: thrust minus drag minus the climb penalty; stalls bleed lift.
  const thrust = state.throttle * 26;
  const drag = 0.0042 * state.speed * state.speed + 2.2;
  const climbPenalty = Math.sin(state.pitch) * 9.8 * 1.4;
  state.speed += (thrust - drag - climbPenalty) * dt;
  if (state.speed < 0) state.speed = 0;
  if (state.speed > MAX_SPEED) state.speed = MAX_SPEED;

  // Turn: heading rate follows bank and speed; the nose drops below stall speed.
  const turnRate = Math.tan(state.bank) * 9.8 / Math.max(state.speed, 12);
  state.heading += turnRate * dt;
  let pitch = state.pitch;
  if (state.speed < STALL_SPEED) {
    pitch -= (STALL_SPEED - state.speed) * 0.012; // mush toward the ground
  }
  state.verticalSpeed = Math.sin(pitch) * state.speed;
  // Below flying speed the wing quits: the plane sinks instead of hovering.
  // Only while actually airborne — on the ground the gear holds her up, and a
  // sink term there would grind damage into the airframe every frame.
  const groundNow = groundAt(state.x, state.z);
  if (state.speed < STALL_SPEED && state.y > groundNow + 2.0) {
    state.verticalSpeed -= (STALL_SPEED - state.speed) * 0.3;
  }

  // Integrate.
  const fx = Math.sin(state.heading);
  const fz = -Math.cos(state.heading);
  state.x += fx * state.speed * Math.cos(pitch) * dt;
  state.z += fz * state.speed * Math.cos(pitch) * dt;
  state.y += state.verticalSpeed * dt;
  state.groundSpeed = state.speed * Math.cos(pitch);

  // Ground contact.
  const ground = groundAt(state.x, state.z);
  const gearHeight = 1.5;
  if (state.y <= ground + gearHeight) {
    state.y = ground + gearHeight;
    const hard = Math.abs(state.verticalSpeed) > 6 || state.speed > 55;
    const onRunway = Math.abs(state.x - 0) < 23 && Math.abs(state.z - 620) < 310;
    if (state.speed < 4 && state.throttle < 0.05) {
      // Parked: at rest on the ground. Parked on the runway, the ground crew
      // refuels her — landing to refuel is a legal way to finish a long sortie.
      state.landed = true;
      state.speed = 0;
      if (onRunway) state.fuel = Math.min(100, state.fuel + 25 * dt);
    } else if (hard && !onRunway) {
      state.damage += Math.min(40, 12 + Math.abs(state.verticalSpeed) * 3);
      state.speed *= 0.55;
      state.verticalSpeed = 0;
      if (state.damage >= 100) state.crashed = true;
    } else if (hard && onRunway) {
      // A firm runway touchdown: bounce a little, cost a little airframe.
      state.damage += 6;
      state.speed *= 0.7;
      state.verticalSpeed = 1.5;
    } else {
      // Rolling on the ground: light friction, so a takeoff roll starts at
      // modest throttle and the plane is not glued to the strip.
      state.speed = Math.max(0, state.speed - 4 * dt);
      state.verticalSpeed = 0;
    }
    state.pitch = 0;
  } else {
    state.landed = false; // airborne again: a landing only counts while on the ground
  }
  if (state.damage >= 100) state.crashed = true;
  if (state.speed < TAKEOFF_SPEED && state.y <= ground + gearHeight + 0.01) state.landed = state.speed < 4;
}

export function headingDegrees(state) {
  let d = (state.heading * 180) / Math.PI;
  d = ((d % 360) + 360) % 360;
  return d;
}
export function altitudeAgl(state, groundAt) {
  return Math.max(0, state.y - groundAt(state.x, state.z));
}
export function knots(state) {
  return state.speed * KNOTS_PER_MS;
}
