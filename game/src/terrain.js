// terrain.js — Meridian Valley: a seeded heightfield, a river valley, one grass
// airfield, pine forest, ridge clouds and a gradient sky. Every height query is a
// pure function of (x, z), so the physics, the mesh and the minimap always agree.

export const WORLD = 4200; // terrain spans -2100..2100 on x and z
export const RUNWAY = { x: 0, z: 620, length: 620, width: 46, headingDeg: 90 };

// --- deterministic value noise ---------------------------------------------
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const u = smooth(fx), v = smooth(fz);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, z) {
  let sum = 0, amp = 1, freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * noise2(x * freq, z * freq);
    amp *= 0.5; freq *= 2.03;
  }
  return sum;
}

// --- height field -----------------------------------------------------------
function ridgeFactor(x, z) {
  // Ridges rise toward the map edges; the valley floor runs along the river.
  const r = Math.max(Math.abs(x), Math.abs(z)) / (WORLD / 2);
  return Math.pow(Math.max(0, r - 0.25) / 0.75, 1.6);
}
function riverDistance(x, z) {
  // The river snakes down the valley: x = 260*sin(z/700) - 120.
  const rx = 260 * Math.sin(z / 700) - 120;
  return Math.abs(x - rx);
}
export function groundHeight(x, z) {
  const base = fbm(x * 0.0011, z * 0.0011) * 55 + fbm(x * 0.004, z * 0.004) * 14;
  const ridge = ridgeFactor(x, z) * (170 + fbm(x * 0.0016 + 9, z * 0.0016 - 4) * 70);
  let h = 8 + base + ridge;
  // Carve the river channel.
  const d = riverDistance(x, z);
  if (d < 90) h -= (1 - d / 90) * 10;
  // Flatten the airfield plateau around the runway: dead flat (12 m) over the
  // whole strip footprint plus margin, blending out to raw terrain beyond it,
  // so the strip, hangar and windsock sit on level ground.
  const rdx = Math.max(0, Math.abs(x - RUNWAY.x) - 80);
  const rdz = Math.max(0, Math.abs(z - RUNWAY.z) - 360);
  const rd = Math.sqrt(rdx * rdx + rdz * rdz);
  if (rd < 200) {
    const t = smooth(rd / 200);
    h = h * t + 12 * (1 - t);
  }
  return h;
}

// --- colours ----------------------------------------------------------------
function terrainColor(x, z, h) {
  const n = fbm(x * 0.01 + 31, z * 0.01 - 17) * 0.5 + 0.5;
  if (h > 150) return [0.92, 0.93, 0.95]; // snow caps
  if (h > 105) return [0.45 + n * 0.08, 0.38 + n * 0.05, 0.30]; // rock
  if (riverDistance(x, z) < 26) return [0.16, 0.42, 0.62]; // river water
  if (riverDistance(x, z) < 60) return [0.72, 0.66, 0.42]; // sandy banks
  // meadow green, patchy with field gold near the airfield
  const field = Math.abs(x - RUNWAY.x) < 500 && Math.abs(z - RUNWAY.z) < 500 ? 0.25 : 0;
  return [0.23 + n * 0.10 + field * 0.35, 0.48 + n * 0.08 - field * 0.05, 0.20 + n * 0.05];
}

// --- scene construction ------------------------------------------------------
export function buildTerrain(scene) {
  const THREE = window.THREE;
  const seg = 150;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const c = terrainColor(x, z, h);
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'valley-floor';
  scene.add(mesh);

  // River ribbon (a slightly raised blue strip following the snake).
  const riverPts = [];
  for (let z = -2100; z <= 2100; z += 60) {
    riverPts.push(new THREE.Vector3(260 * Math.sin(z / 700) - 120, 0, z));
  }
  const riverCurve = new THREE.CatmullRomCurve3(riverPts);
  const riverGeo = new THREE.TubeGeometry(riverCurve, 120, 20, 6, false);
  const rpos = riverGeo.attributes.position;
  for (let i = 0; i < rpos.count; i++) {
    const y = groundHeight(rpos.getX(i), rpos.getZ(i));
    rpos.setY(i, Math.max(y + 0.6, 4.5));
  }
  riverGeo.computeVertexNormals();
  const river = new THREE.Mesh(riverGeo, new THREE.MeshLambertMaterial({ color: 0x2a7ab8 }));
  river.name = 'meridian-river';
  scene.add(river);

  buildRunway(scene);
  buildForest(scene);
  buildClouds(scene);
  buildSky(scene);
  return mesh;
}

function buildRunway(scene) {
  const THREE = window.THREE;
  const g = new THREE.Group();
  g.name = 'airfield-runway-09';
  const y = 12.6;
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length),
    new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(RUNWAY.x, y, RUNWAY.z);
  g.add(strip);
  // Centre dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf2f2e8 });
  for (let d = -RUNWAY.length / 2 + 40; d < RUNWAY.length / 2 - 20; d += 60) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(3, 28), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(RUNWAY.x, y + 0.15, RUNWAY.z + d);
    g.add(dash);
  }
  // Threshold bars and the big "09" — drawn as simple white blocks.
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(5, 18), dashMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(RUNWAY.x + k * 8, y + 0.15, RUNWAY.z + end * (RUNWAY.length / 2 - 22));
      g.add(bar);
    }
  }
  // Windsock pole + orange cone sock.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 14, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.set(RUNWAY.x + 42, y + 7, RUNWAY.z + 180);
  g.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 7, 8),
    new THREE.MeshLambertMaterial({ color: 0xff7f2a }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(RUNWAY.x + 46, y + 13, RUNWAY.z + 180);
  g.add(sock);
  // A small hangar beside the strip.
  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(46, 16, 30),
    new THREE.MeshLambertMaterial({ color: 0x8a6f4d }),
  );
  hangar.position.set(RUNWAY.x - 70, y + 8, RUNWAY.z + 150);
  g.add(hangar);
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(15, 15, 46, 12, 1, false, 0, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0x5d6b7a }),
  );
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.set(RUNWAY.x - 70, y + 16, RUNWAY.z + 150);
  g.add(roof);
  scene.add(g);
}

function buildForest(scene) {
  const THREE = window.THREE;
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1.1, 7, 5);
  const coneGeo = new THREE.ConeGeometry(4.2, 16, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4426 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x1e5c2a });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x2a7034 });
  const count = 420;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const cones = new THREE.InstancedMesh(coneGeo, leafMat, count);
  const cones2 = new THREE.InstancedMesh(coneGeo, leafMat2, count);
  const dummy = new THREE.Object3D();
  let placed = 0, guard = 0;
  while (placed < count && guard++ < 6000) {
    const x = (hash2(placed * 3 + 1, 7) * 2 - 1) * 2000;
    const z = (hash2(placed * 5 + 2, 11) * 2 - 1) * 2000;
    const h = groundHeight(x, z);
    if (h > 110) continue; // no trees above the treeline
    if (Math.abs(x - RUNWAY.x) < 420 && Math.abs(z - RUNWAY.z) < 420) continue; // keep the airfield clear
    if (riverDistance(x, z) < 40) continue;
    const s = 0.8 + hash2(placed, 3) * 0.9;
    dummy.position.set(x, h + 3.5 * s, z);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = h + 12 * s;
    dummy.updateMatrix();
    cones.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = h + 19 * s;
    dummy.scale.setScalar(s * 0.7);
    dummy.updateMatrix();
    cones2.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  trunks.count = placed; cones.count = placed; cones2.count = placed;
  trunks.name = 'pine-forest-trunks';
  scene.add(trunks); scene.add(cones); scene.add(cones2);
}

function buildClouds(scene) {
  const THREE = window.THREE;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const group = new THREE.Group();
  group.name = 'ridge-clouds';
  for (let i = 0; i < 26; i++) {
    const puffs = 3 + Math.floor(hash2(i, 21) * 3);
    const cx = (hash2(i, 22) * 2 - 1) * 1900;
    const cz = (hash2(i, 23) * 2 - 1) * 1900;
    const cy = 260 + hash2(i, 24) * 140;
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(geo, mat);
      const s = 26 + hash2(i * 10 + p, 25) * 42;
      puff.scale.set(s, s * 0.42, s * 0.8);
      puff.position.set(cx + (hash2(p, i + 30) * 2 - 1) * 55, cy + (hash2(p, i + 31) - 0.5) * 14, cz + (hash2(p, i + 32) * 2 - 1) * 40);
      group.add(puff);
    }
  }
  scene.add(group);
}

function buildSky(scene) {
  const THREE = window.THREE;
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9ec8e8, 900, 3600);
  const hemi = new THREE.HemisphereLight(0xbfdfff, 0x3d5a2e, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.5);
  sun.position.set(900, 1400, 400);
  scene.add(sun);
  // A simple bright sun disc so the sky reads at a glance.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(60, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }),
  );
  disc.position.set(1500, 1100, -2400);
  disc.lookAt(0, 0, 0);
  disc.name = 'sun-disc';
  scene.add(disc);
}
