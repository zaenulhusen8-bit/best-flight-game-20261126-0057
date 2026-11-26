// main.js — Ridge Runner bootstrap and game loop. Wires the renderer, the
// camera, the flight model, the missions, the HUD and the audio together; owns
// the title screen, pause, crash and results states. No other file touches the
// render loop.

import { buildTerrain, groundHeight, RUNWAY } from './terrain.js';
import { buildAircraft, freshState, stepFlight, headingDegrees, knots, altitudeAgl } from './aircraft.js';
import { MissionRunner, missionScore, MISSIONS } from './missions.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { autopilotStick, readShotPreset, nextRingTarget } from './shots.js';

const THREE = window.THREE;
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 8000);

buildTerrain(scene);
const plane = buildAircraft();
scene.add(plane);

const hud = new Hud();
const input = new Input();
const audio = new AudioEngine();

let state = freshState();
let runner = null;
let phase = 'title'; // title | flying | paused | over
let cameraMode = 'chase'; // chase | cockpit
let autopilot = false;
let lastTime = performance.now();
let resultShown = false;
let thudPlayed = false;

const titleEl = document.getElementById('title');

function placePlaneOnRunway() {
  state = freshState();
  state.x = RUNWAY.x;
  state.z = RUNWAY.z + RUNWAY.length / 2 - 40;
  state.y = groundHeight(state.x, state.z) + 1.5;
  state.heading = 0; // north, down the runway
}

function startMission(missionId) {
  if (runner) runner.dispose();
  placePlaneOnRunway();
  runner = new MissionRunner(scene, missionId);
  runner.start();
  phase = 'flying';
  resultShown = false;
  thudPlayed = false;
  titleEl.style.display = 'none';
  audio.start();
  hud.showMessage(runner.mission.title, runner.mission.goal, 4);
}

function endMission(win, reason) {
  phase = 'over';
  const score = missionScore(runner, state);
  const title = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
  const sub = win
    ? `${reason}  ·  Score ${score}  ·  Fuel ${Math.round(state.fuel)}% left  ·  Airframe ${Math.round(100 - state.damage)}%`
    : `${reason}  ·  Score ${score}  ·  Press R to fly again`;
  hud.showMessage(title, sub, 30);
}

function crash(reason) {
  if (phase !== 'flying') return;
  phase = 'over';
  if (!thudPlayed) { audio.thud(true); thudPlayed = true; }
  hud.showMessage('CRASHED', `${reason}  ·  Press R to fly again`, 30);
}

// --- title screen wiring ---
document.querySelectorAll('#title .mission').forEach((el) => {
  el.addEventListener('click', () => startMission(el.dataset.mission));
});
input.onKey = (code) => {
  if (phase === 'title') {
    if (code === 'Digit1') startMission('rings');
    if (code === 'Digit2') startMission('landing');
    if (code === 'Digit3') startMission('trial');
    return;
  }
  if (code === 'KeyR') {
    startMission(runner ? runner.mission.id : 'rings');
    return;
  }
  if (code === 'KeyP' && (phase === 'flying' || phase === 'paused')) {
    phase = phase === 'flying' ? 'paused' : 'flying';
    hud.showMessage(phase === 'paused' ? 'PAUSED' : '', phase === 'paused' ? 'Press P to resume' : '', 2);
    return;
  }
  if (code === 'KeyC') cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
  if (code === 'KeyO') {
    autopilot = !autopilot;
    hud.showMessage(autopilot ? 'AUTOPILOT ON' : 'AUTOPILOT OFF', autopilot ? 'Demo flight — press O to take the stick' : '', 2.5);
  }
};

// --- screenshot presets: same game, a chosen starting pose ---
const preset = readShotPreset();
if (preset) {
  cameraMode = preset.camera;
  startMission(preset.mission);
  state.x = preset.pose[0];
  state.y = preset.pose[1];
  state.z = preset.pose[2];
  state.heading = (preset.headingDeg * Math.PI) / 180;
  state.throttle = preset.throttle;
  state.speed = 55;
  autopilot = preset.autopilot;
}

// --- camera ---
const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const fx = Math.sin(state.heading);
  const fz = -Math.cos(state.heading);
  // The mesh's nose sits on local -Z. Yaw -heading points it along the compass
  // heading, +pitch raises the nose, -bank drops the inside wing in a turn.
  plane.position.set(state.x, state.y, state.z);
  plane.rotation.set(0, 0, 0);
  plane.rotateY(-state.heading);
  plane.rotateX(state.pitch);
  plane.rotateZ(-state.bank);
  const prop = plane.getObjectByName('propeller');
  if (prop) prop.rotation.z += dt * (4 + state.throttle * 60);

  if (cameraMode === 'cockpit') {
    // Over-the-nose view: high enough that the cowling sits at the bottom of
    // the frame, the propeller hidden so it never bars the sky.
    const prop = plane.getObjectByName('propeller');
    if (prop) prop.visible = false;
    const spinner = plane.getObjectByName('prop-spinner');
    if (spinner) spinner.visible = false;
    camPos.set(state.x + fx * 2.2, state.y + 1.9, state.z + fz * 2.2);
    camTarget.set(state.x + fx * 60, state.y + Math.sin(state.pitch) * 40 - 6, state.z + fz * 60);
    camera.position.lerp(camPos, Math.min(1, dt * 14));
    camera.lookAt(camTarget);
    camera.rotation.z = state.bank * 0.25;
  } else {
    const prop = plane.getObjectByName('propeller');
    if (prop) prop.visible = true;
    const spinner = plane.getObjectByName('prop-spinner');
    if (spinner) spinner.visible = true;
    // Chase: behind and above, easing in so the camera never fights the pilot.
    const back = 26, up = 8;
    camPos.set(
      state.x - fx * back - Math.sin(state.bank) * 4,
      state.y + up - Math.sin(state.pitch) * 6,
      state.z - fz * back,
    );
    const ground = groundHeight(camPos.x, camPos.z);
    if (camPos.y < ground + 4) camPos.y = ground + 4;
    camera.position.lerp(camPos, Math.min(1, dt * 5));
    camTarget.set(state.x + fx * 30, state.y + 1, state.z + fz * 30);
    camera.lookAt(camTarget);
  }
}

// --- main loop ---
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (phase === 'flying') {
    const stick = input.poll();
    if (autopilot) {
      const target = nextRingTarget(runner);
      const auto = autopilotStick(state, target, dt);
      stepFlight(state, auto, dt, groundHeight);
    } else {
      stepFlight(state, stick, dt, groundHeight);
    }
    const result = runner.update(state, dt);
    if (result === 'ring') {
      audio.chime();
      hud.showMessage(`RING ${runner.passed} / ${runner.mission.rings.length}`, 'Clean pass — next ring is gold.', 1.6);
    } else if (result === 'done') {
      endMission(true, runner.landedClean ? 'Wheels down on runway 09. Beautiful.' : 'All rings flown.');
    } else if (result === 'timeout') {
      endMission(false, 'Out of time on the trial clock.');
    }
    if (state.crashed) {
      crash(state.damage >= 100 ? 'Airframe gave out after too many hard hits.' : 'Terrain strike.');
    } else if (state.damage > 0 && !thudPlayed && state.damage > 30) {
      audio.thud(false);
      thudPlayed = true;
    }
    if (state.fuel <= 0 && state.y <= groundHeight(state.x, state.z) + 2 && state.speed < 4) {
      endMission(false, 'Out of fuel — she glided in, but the sortie is over.');
    }
    audio.update(state.throttle, knots(state));
    hud.update(state, runner, groundHeight);
    hud.tickMessage(dt);
  } else if (phase === 'title') {
    // Attract mode: slow orbit over the valley behind the title card.
    const t = now * 0.00008;
    camera.position.set(Math.sin(t) * 700, 320, Math.cos(t) * 700);
    camera.lookAt(0, 60, 0);
    plane.position.set(0, 150, 300);
    plane.rotation.set(0, t * 4, 0.12);
  } else if (phase === 'over') {
    hud.tickMessage(dt);
  }

  // Rings pulse gently so the next one catches the eye.
  if (runner) {
    const pulse = 1 + Math.sin(now * 0.004) * 0.06;
    for (let i = 0; i < runner.ringMeshes.length; i++) {
      const m = runner.ringMeshes[i];
      if (i === runner.index) m.scale.setScalar(pulse);
    }
  }
  if (phase !== 'title') updateCamera(dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

placePlaneOnRunway();
if (!preset) {
  // Park the plane on the runway behind the title card.
  plane.position.set(state.x, state.y, state.z);
}
requestAnimationFrame(frame);

// Expose a tiny probe for play-testing: window.__ridge returns live state.
window.__ridge = {
  state: () => ({ ...state, phase, cameraMode, autopilot, mission: runner ? runner.mission.id : null, rings: runner ? runner.passed : 0 }),
  start: startMission,
};
