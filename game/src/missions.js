// missions.js — the three sorties. Each mission is a list of glowing rings (or a
// runway to land on) plus its own win condition, clock and fuel budget. Rings
// are torus meshes; passing through one in order chimes and lights the next.

import { RUNWAY, groundHeight } from './terrain.js';

export const MISSIONS = {
  rings: {
    id: 'rings',
    title: 'RING RUN',
    goal: 'Fly through the glowing rings in order.',
    fuel: 100,
    timeLimit: null,
    rings: [
      [0, 120, 260], [320, 150, -60], [640, 170, -420], [420, 200, -860],
      [-80, 190, -1150], [-560, 210, -900], [-760, 180, -420], [-380, 150, 40],
    ],
  },
  landing: {
    id: 'landing',
    title: 'RUNWAY LANDING',
    goal: 'Take off, fly the circuit, land softly on runway 09.',
    fuel: 100,
    timeLimit: null,
    rings: [
      [0, 150, 200], [420, 170, -300], [300, 180, -900], [-300, 170, -900], [-420, 150, -300],
    ],
    landing: true,
  },
  trial: {
    id: 'trial',
    title: 'RIDGE TIME TRIAL',
    goal: '10 rings against the clock. Fastest clean run wins.',
    fuel: 100,
    timeLimit: 240,
    rings: [
      [0, 130, 260], [380, 160, -120], [700, 190, -520], [520, 230, -980],
      [60, 220, -1250], [-480, 240, -1050], [-820, 200, -620], [-700, 170, -120],
      [-300, 150, 180], [0, 130, 420],
    ],
  },
};

function ringMesh(THREE, x, y, z, active) {
  const g = new THREE.Group();
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(26, 2.2, 12, 40),
    new THREE.MeshBasicMaterial({ color: active ? 0xffd23e : 0x3ec6ff, transparent: true, opacity: 0.92 }),
  );
  torus.name = 'ring-hoop';
  g.add(torus);
  // A soft glow disc so the ring reads from far away.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: active ? 0xffd23e : 0x3ec6ff, transparent: true, opacity: 0.10, side: THREE.DoubleSide }),
  );
  disc.name = 'ring-glow';
  g.add(disc);
  g.position.set(x, y, z);
  g.userData = { x, y, z };
  return g;
}

export class MissionRunner {
  constructor(scene, missionId) {
    this.THREE = window.THREE;
    this.mission = MISSIONS[missionId] || MISSIONS.rings;
    this.scene = scene;
    this.index = 0; // next ring to fly through
    this.done = false;
    this.failed = false;
    this.elapsed = 0;
    this.passed = 0;
    this.started = false;
    this.landedClean = false;
    this.group = new this.THREE.Group();
    this.group.name = `mission-${this.mission.id}`;
    this.ringMeshes = this.mission.rings.map(([x, y, z], i) => {
      const m = ringMesh(this.THREE, x, y, z, i === 0);
      this.group.add(m);
      return m;
    });
    // A beacon column over the next ring so it can be found at a glance.
    this.beacon = new this.THREE.Mesh(
      new this.THREE.CylinderGeometry(3, 3, 320, 8, 1, true),
      new this.THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.16, side: this.THREE.DoubleSide, depthWrite: false }),
    );
    this.beacon.name = 'next-ring-beacon';
    this.group.add(this.beacon);
    this.updateBeacon();
    scene.add(this.group);
  }

  start() { this.started = true; this.elapsed = 0; }

  updateBeacon() {
    const next = this.mission.rings[this.index];
    if (!next) { this.beacon.visible = false; return; }
    this.beacon.visible = true;
    this.beacon.position.set(next[0], next[1] + 140, next[2]);
  }

  // Returns 'ring' | 'landed' | 'done' | null. `onRing` fires the chime in main.
  update(state, dt) {
    if (!this.started || this.done || this.failed) return null;
    this.elapsed += dt;
    if (this.mission.timeLimit && this.elapsed > this.mission.timeLimit) {
      this.failed = true;
      return 'timeout';
    }
    const next = this.mission.rings[this.index];
    if (next) {
      const dx = state.x - next[0], dy = state.y - next[1], dz = state.z - next[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 26) {
        this.passed++;
        this.index++;
        // Light the next ring gold, dim the passed one.
        const passed = this.ringMeshes[this.index - 1];
        passed.children[0].material = passed.children[0].material.clone();
        passed.children[0].material.color.setHex(0x37d67a);
        passed.children[0].material.opacity = 0.45;
        passed.children[1].visible = false;
        if (this.index < this.ringMeshes.length) {
          const nxt = this.ringMeshes[this.index];
          nxt.children[0].material = nxt.children[0].material.clone();
          nxt.children[0].material.color.setHex(0xffd23e);
          nxt.children[1].material.color.setHex(0xffd23e);
        }
        this.updateBeacon();
        if (this.index >= this.mission.rings.length && !this.mission.landing) {
          this.done = true;
          return 'done';
        }
        return 'ring';
      }
    }
    // Landing mission: after the rings, a clean runway touchdown wins.
    if (this.mission.landing && this.index >= this.mission.rings.length && state.landed) {
      const onRunway = Math.abs(state.x - RUNWAY.x) < 23 && Math.abs(state.z - RUNWAY.z) < 310;
      const soft = Math.abs(state.verticalSpeed) < 3.5 && state.speed < 45;
      if (onRunway && soft) {
        this.done = true;
        this.landedClean = true;
        return 'done';
      }
    }
    return null;
  }

  ringsLeft() { return this.mission.rings.length - this.index; }

  progressText() {
    if (this.mission.landing && this.index >= this.mission.rings.length) {
      return 'Rings done — land on runway 09, gently.';
    }
    return `Rings ${this.passed} / ${this.mission.rings.length}`;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

// Score: rings are worth 1000 each, clean airframe and leftover fuel pay a
// bonus, and the trial pays for speed. Shown on the results screen.
export function missionScore(runner, state) {
  const rings = runner.passed * 1000;
  const fuelBonus = Math.round(state.fuel * 8);
  const frameBonus = Math.round((100 - state.damage) * 6);
  const timeBonus = runner.mission.timeLimit
    ? Math.max(0, Math.round((runner.mission.timeLimit - runner.elapsed) * 12))
    : 0;
  return rings + fuelBonus + frameBonus + timeBonus;
}
