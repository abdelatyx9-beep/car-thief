// سارق السيارات — open-city crime game in a blocky style (three.js). Everything here is drawn in code: no outside assets.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const IS_TOUCH = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
document.body.classList.toggle("touch", IS_TOUCH);
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const SAVE = Object.assign({ money: 0, done: 0, sound: true, outfit: "Male_Adult_19" }, store.get("cthief.save", {}));
const save = () => store.set("cthief.save", SAVE);
const SET = Object.assign({ vol: 0.8, sens: 1, camDist: 1, quality: matchMedia("(pointer: coarse)").matches ? "med" : "high", invY: false, steer: 1, pedals: true, drive: "buttons", tiltInv: false }, store.get("cthief.set", {}));
if (!["buttons", "wheel", "tilt", "stick"].includes(SET.drive)) SET.drive = "buttons";
function applyDriveMode() { document.body.classList.remove("dm-buttons", "dm-wheel", "dm-tilt", "dm-stick"); document.body.classList.add("dm-" + SET.drive); }
applyDriveMode();
const saveSet = () => store.set("cthief.set", SET);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261104);

// ---------------- renderer ----------------
const canvas = $("cv");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.25 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = new THREE.Color(0x9fd0f0);
scene.background = SKY; scene.fog = new THREE.Fog(SKY, 100, 240);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 260);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x5d5a4e, 0.85));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 220 }); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
{ // a soft sky dome for reflections on paint and glass
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: {}, vertexShader: "varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }", fragmentShader: "varying vec3 vp; void main(){ float h = normalize(vp).y; vec3 sky = mix(vec3(0.85,0.9,0.95), vec3(0.35,0.58,0.9), clamp(h,0.0,1.0)); vec3 gr = vec3(0.32,0.31,0.3); gl_FragColor = vec4(h > 0.0 ? sky : mix(gr, vec3(0.7), clamp(1.0 + h * 4.0, 0.0, 1.0)), 1.0); }" }));
  es.add(dome); const sunB = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); sunB.material.color.setScalar(8); sunB.position.set(25, 35, 15); es.add(sunB);
  scene.environment = pm.fromScene(es, 0.02).texture;
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

const matCache = new Map(); const mat = (c) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })); return matCache.get(c); };
function mergeGeoms(list) { let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index.count; } const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), U = new Float32Array(n * 2), I = []; let o = 0; for (const g of list) { P.set(g.attributes.position.array, o * 3); Nn.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2); for (const k of g.index.array) I.push(k + o); o += g.attributes.position.count; } const m = new THREE.BufferGeometry(); m.setAttribute("position", new THREE.BufferAttribute(P, 3)); m.setAttribute("normal", new THREE.BufferAttribute(Nn, 3)); m.setAttribute("uv", new THREE.BufferAttribute(U, 2)); m.setIndex(I); m.computeVertexNormals(); return m; }
function canvasTex(w, h, draw, rep) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.magFilter = THREE.NearestFilter; return t; }
const noise = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { const v = Math.random() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };

// ---------------- city layout ----------------
// a grid of blocks with roads between them. roads run along x = i*CELL..+ROAD and z = j*CELL..+ROAD
const N = 9, BLOCK = 56, ROAD = 16, CELL = BLOCK + ROAD, SIZE = N * CELL + ROAD, WALK = 3.2;
const roadC = (i) => i * CELL + ROAD / 2; // centre line of road i (0..N)
const blockX0 = (i) => i * CELL + ROAD;    // first metre of block i
const solids = []; // { x0, z0, x1, z1, h } rectangles you can't move through
const grid = new Map(); const gkey = (bx, bz) => bx * 100 + bz;
function addSolid(x0, z0, x1, z1, h, tag) { const s = { x0, z0, x1, z1, h, tag }; solids.push(s); const bx0 = Math.floor(x0 / CELL), bx1 = Math.floor(x1 / CELL), bz0 = Math.floor(z0 / CELL), bz1 = Math.floor(z1 / CELL); for (let a = bx0; a <= bx1; a++) for (let b = bz0; b <= bz1; b++) { const k = gkey(a, b); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); } return s; }
function nearSolids(x, z) { const bx = Math.floor(x / CELL), bz = Math.floor(z / CELL), out = []; for (let a = bx - 1; a <= bx + 1; a++) for (let b = bz - 1; b <= bz + 1; b++) { const l = grid.get(gkey(a, b)); if (l) for (const s of l) out.push(s); } return out; }
// push a circle out of every solid; returns the push normal (or null)
const _n = { x: 0, z: 0 };
function collide(o, r) {
  let hit = null;
  for (const s of nearSolids(o.x, o.z)) {
    const cx = clamp(o.x, s.x0, s.x1), cz = clamp(o.z, s.z0, s.z1), dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); o.x = cx + dx / d * r; o.z = cz + dz / d * r; _n.x = dx / d; _n.z = dz / d; }
    else { const l = o.x - s.x0, rr = s.x1 - o.x, t = o.z - s.z0, b = s.z1 - o.z, m = Math.min(l, rr, t, b); if (m === l) { o.x = s.x0 - r; _n.x = -1; _n.z = 0; } else if (m === rr) { o.x = s.x1 + r; _n.x = 1; _n.z = 0; } else if (m === t) { o.z = s.z0 - r; _n.x = 0; _n.z = -1; } else { o.z = s.z1 + r; _n.x = 0; _n.z = 1; } }
    hit = _n;
  }
  if (o.x < 2 + r) { o.x = 2 + r; hit = { x: 1, z: 0 }; } if (o.z < 2 + r) { o.z = 2 + r; hit = { x: 0, z: 1 }; }
  if (o.x > SIZE - 2 - r) { o.x = SIZE - 2 - r; hit = { x: -1, z: 0 }; } if (o.z > SIZE - 2 - r) { o.z = SIZE - 2 - r; hit = { x: 0, z: -1 }; }
  return hit;
}
function rayBlocked(x0, z0, x1, z1) { // does a straight line hit a building?
  const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2);
  for (let i = 1; i < steps; i++) { const t = i / steps, x = lerp(x0, x1, t), z = lerp(z0, z1, t); for (const s of nearSolids(x, z)) if (s.h > 1.6 && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) return true; }
  return false;
}

// special places (block coordinates)
const PLACES = {
  hideout: { bx: 4, bz: 4, name: "المخبأ" }, garage: { bx: 1, bz: 6, name: "الكراج" }, bank: { bx: 6, bz: 2, name: "البنك" },
  police: { bx: 2, bz: 2, name: "مركز الشرطة" }, hospital: { bx: 6, bz: 6, name: "المستشفى" }, warehouse: { bx: 7, bz: 8, name: "المستودع" },
  park: { bx: 3, bz: 5 }, park2: { bx: 5, bz: 1 }, lot: { bx: 0, bz: 3 },
};
const placeAt = (bx, bz) => Object.values(PLACES).find((p) => p.bx === bx && p.bz === bz);
const blockCentre = (p) => ({ x: blockX0(p.bx) + BLOCK / 2, z: blockX0(p.bz) + BLOCK / 2 });
// a point on the road right in front of a block (south side) — mission markers go here
const frontOf = (p) => ({ x: blockX0(p.bx) + BLOCK / 2, z: blockX0(p.bz) + BLOCK + ROAD * 0.3 });

// ---------------- building the city ----------------
function facadeTex(style) {
  // one tile = 4 m wide, 3.5 m tall (a floor). white wall (tinted per building), framed glass with a sky reflection
  const t = canvasTex(256, 224, (g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { const v = 200 + Math.random() * 55 | 0; g.fillStyle = `rgba(${v},${v},${v - 6},0.35)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = "rgba(0,0,0,0.10)"; g.fillRect(0, h - 6, w, 6); // floor line
    const glass = (x, y, ww, hh) => { const gr = g.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, "#9fb9cf"); gr.addColorStop(0.45, "#4f6f8c"); gr.addColorStop(1, "#22364a"); g.fillStyle = gr; g.fillRect(x, y, ww, hh); g.fillStyle = "rgba(255,255,255,0.18)"; g.beginPath(); g.moveTo(x + ww * 0.15, y + hh); g.lineTo(x + ww * 0.45, y); g.lineTo(x + ww * 0.62, y); g.lineTo(x + ww * 0.32, y + hh); g.fill(); };
    if (style === 0) { // two classic windows with frames and sills
      for (const x0 of [28, 140]) { g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x0 - 6, 44, 100, 132); g.fillStyle = "#e9e6df"; g.fillRect(x0 - 4, 46, 96, 128); glass(x0, 50, 88, 120); g.fillStyle = "#e9e6df"; g.fillRect(x0 + 42, 50, 5, 120); g.fillRect(x0, 96, 88, 5); g.fillStyle = "#cfc9bd"; g.fillRect(x0 - 10, 174, 108, 9); g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(x0 - 10, 183, 108, 4); }
    } else if (style === 1) { // modern ribbon window
      g.fillStyle = "#2d3036"; g.fillRect(0, 54, w, 118); glass(0, 58, w, 110); g.fillStyle = "#2d3036"; for (const x of [0, 64, 128, 192]) g.fillRect(x, 58, 5, 110);
    } else { // balconies
      for (const x0 of [22, 136]) { glass(x0, 40, 98, 146); g.fillStyle = "#d8d4cc"; g.fillRect(x0 + 47, 40, 4, 146); }
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(8, 186, w - 16, 8); g.fillStyle = "#cfcac0"; g.fillRect(8, 150, w - 16, 36); g.fillStyle = "rgba(60,60,60,0.5)"; for (let x = 12; x < w - 10; x += 12) g.fillRect(x, 150, 3, 36);
    }
  }, true);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; return t;
}
const facades = [facadeTex(0), facadeTex(1), facadeTex(2)];
const shopTex = (() => { const t = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#33373d"; g.fillRect(0, 20, w, 46); // sign band
  const cols = ["#c0392b", "#1e6f9f", "#d68910", "#1e8449", "#6c3483", "#b9770e"]; g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.fillRect(14, 28, w - 28, 30);
  g.fillStyle = "rgba(255,255,255,0.85)"; for (let i = 0; i < 6; i++) g.fillRect(30 + i * 34, 38, 22, 10);
  const gr = g.createLinearGradient(0, 70, 0, h); gr.addColorStop(0, "#8fb2c8"); gr.addColorStop(0.5, "#3f5f78"); gr.addColorStop(1, "#1d2b38"); g.fillStyle = gr; g.fillRect(10, 72, w - 20, h - 78);
  g.fillStyle = "#2a2d31"; g.fillRect(124, 72, 8, h - 78); g.fillRect(10, 72, w - 20, 6);
  g.fillStyle = "rgba(255,240,200,0.25)"; g.fillRect(20, 150, 90, 70); g.fillRect(146, 140, 90, 80);
  g.fillStyle = "#9a958c"; g.fillRect(0, h - 8, w, 8);
}, true); t.magFilter = THREE.LinearFilter; t.anisotropy = 8; return t; })();
function boxFaces(P, U, C, NN, x0, y0, z0, x1, y1, z1, col, uS, vS, top) {
  // 4 walls (+ top if asked), uv in world units so windows keep their size
  const faces = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], x1 - x0],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], x1 - x0],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], z1 - z0],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], z1 - z0],
  ];
  if (top) faces.push([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], 0]);
  for (const [a, b, c, d, n, len] of faces) {
    const base = P.length / 3;
    P.push(...a, ...b, ...c, ...d); for (let k = 0; k < 4; k++) { NN.push(...n); C.push(col.r, col.g, col.b); }
    const uu = len / uS, vv = (y1 - y0) / vS;
    U.push(0, 0, uu, 0, uu, vv, 0, vv);
    U.idx = U.idx || []; U.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
function meshFrom(P, U, C, NN, mat) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(NN, 3)); g.setIndex(U.idx || []); const m = new THREE.Mesh(g, mat); return m; }
const BCOLS = [0xe9dcc4, 0xd8c6a6, 0xc9b28e, 0xf1ece2, 0xbfc3c6, 0xb07a62, 0xd9cdb8, 0x9aa3a8, 0xe4d2b0, 0xcdb79a, 0xeae6dc];
const treeSpots = [], lampSpots = [], parkedSpots = [];
const beacons = {};
function buildCity() {
  const WS = [0, 1, 2].map(() => ({ P: [], U: [], C: [], N: [] })), GF = { P: [], U: [], C: [], N: [] }, W = WS[0], S = { P: [], U: [], C: [], N: [] }, T = { P: [], U: [], C: [], N: [] }, F = { P: [], U: [], C: [], N: [] };
  const col = new THREE.Color();
  for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
    const x0 = blockX0(bx), z0 = blockX0(bz), x1 = x0 + BLOCK, z1 = z0 + BLOCK, pl = placeAt(bx, bz);
    // the raised pavement of the block
    boxFaces(F.P, F.U, F.C, F.N, x0, 0, z0, x1, 0.2, z1, col.setHex(0xa9a397), 4, 4, true);
    const ix0 = x0 + WALK, iz0 = z0 + WALK, ix1 = x1 - WALK, iz1 = z1 - WALK;
    const isPark = pl === PLACES.park || pl === PLACES.park2, isLot = pl === PLACES.lot;
    if (isPark) {
      boxFaces(F.P, F.U, F.C, F.N, ix0, 0.2, iz0, ix1, 0.28, iz1, col.setHex(0x6fbf4a), 4, 4, true);
      for (let k = 0; k < 14; k++) treeSpots.push([ix0 + 4 + R() * (BLOCK - 2 * WALK - 8), iz0 + 4 + R() * (BLOCK - 2 * WALK - 8)]);
      continue;
    }
    if (isLot) { for (let k = 0; k < 6; k++) parkedSpots.push({ x: ix0 + 8 + (k % 3) * 14, z: iz0 + 12 + Math.floor(k / 3) * 22, a: Math.PI / 2 }); continue; }
    if (pl && pl.name) {
      // one landmark building with a coloured sign
      const h = pl === PLACES.bank ? 22 : pl === PLACES.police ? 12 : pl === PLACES.hospital ? 26 : pl === PLACES.warehouse ? 9 : pl === PLACES.garage ? 7 : 10;
      const c = { hideout: 0x6a5a4a, garage: 0x8a8f96, bank: 0xf2efe6, police: 0x2f5fb0, hospital: 0xf4f4f4, warehouse: 0xa07a52 }[Object.keys(PLACES).find((k) => PLACES[k] === pl)];
      const bx0 = ix0 + 6, bz0 = iz0 + 4, bx1 = ix1 - 6, bz1 = iz1 - 14;
      boxFaces(W.P, W.U, W.C, W.N, bx0, 0, bz0, bx1, h, bz1, col.setHex(c), 4, 3.5, false);
      boxFaces(T.P, T.U, T.C, T.N, bx0, h, bz0, bx1, h + 0.4, bz1, col.setHex(0x555a60), 4, 4, true);
      addSolid(bx0, bz0, bx1, bz1, h, "bld");
      signs.push({ pl, x: (bx0 + bx1) / 2, z: bz1 + 0.05, y: 5.2, w: Math.min(12, (bx1 - bx0) * 0.5) });
      continue;
    }
    // 2–4 buildings per block, sometimes a little plaza
    const split = R() < 0.5;
    const parts = split ? [[ix0, iz0, (ix0 + ix1) / 2 - 1, iz1], [(ix0 + ix1) / 2 + 1, iz0, ix1, iz1]] : [[ix0, iz0, ix1, (iz0 + iz1) / 2 - 1], [ix0, (iz0 + iz1) / 2 + 1, ix1, iz1]];
    for (const [a0, b0, a1, b1] of parts) {
      const sub = R() < 0.5 && (a1 - a0) > 20 ? [[a0, b0, (a0 + a1) / 2 - 1, b1], [(a0 + a1) / 2 + 1, b0, a1, b1]] : [[a0, b0, a1, b1]];
      for (const [c0, d0, c1, d1] of sub) {
        if (R() < 0.12) { treeSpots.push([(c0 + c1) / 2, (d0 + d1) / 2]); continue; }
        const far = Math.hypot((c0 + c1) / 2 - SIZE / 2, (d0 + d1) / 2 - SIZE / 2) / (SIZE / 2);
        const h = Math.round((far < 0.45 ? 14 + R() * 32 : 7 + R() * 14) / 3.5) * 3.5;
        boxFaces(GF.P, GF.U, GF.C, GF.N, c0, 0, d0, c1, 4.5, d1, col.setHex(0xffffff).lerp(new THREE.Color(BCOLS[Math.floor(R() * BCOLS.length)]), 0.5), 8, 4.5, false); // shops on the ground floor
        const c = col.setHex(BCOLS[Math.floor(R() * BCOLS.length)]), Wb = WS[Math.floor(R() * 3)];
        boxFaces(Wb.P, Wb.U, Wb.C, Wb.N, c0, 4.5, d0, c1, h, d1, c, 4, 3.5, false);
        boxFaces(T.P, T.U, T.C, T.N, c0 - 0.2, h, d0 - 0.2, c1 + 0.2, h + 0.5, d1 + 0.2, col.setHex(0x6a6e74), 4, 4, true);
        if (R() < 0.4) boxFaces(T.P, T.U, T.C, T.N, c0 + 2, h + 0.5, d0 + 2, c0 + 5, h + 2.5, d0 + 4, col.setHex(0x9aa0a6), 4, 4, true); // AC unit / roof box
        addSolid(c0, d0, c1, d1, h, "bld");
      }
    }
    // street lamps on the block corners
    lampSpots.push([x0 + 1, z0 + 1], [x1 - 1, z1 - 1]);
  }
  WS.forEach((Wb, i) => { const m = meshFrom(Wb.P, Wb.U, Wb.C, Wb.N, new THREE.MeshStandardMaterial({ map: facades[i], vertexColors: true, roughness: 0.8, envMapIntensity: 0.5 })); m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  { const m = meshFrom(GF.P, GF.U, GF.C, GF.N, new THREE.MeshStandardMaterial({ map: shopTex, vertexColors: true, roughness: 0.6, envMapIntensity: 0.6 })); m.receiveShadow = true; scene.add(m); }
  const roofs = meshFrom(T.P, T.U, T.C, T.N, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); roofs.castShadow = true; roofs.receiveShadow = true; scene.add(roofs);
  const floors = meshFrom(F.P, F.U, F.C, F.N, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: (() => { const t = canvasTex(128, 128, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); for (let i = 0; i < 1500; i++) { const v = 215 + Math.random() * 40 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } g.fillStyle = "rgba(0,0,0,.16)"; for (let k = 0; k < w; k += 32) { g.fillRect(0, k, w, 2); g.fillRect(k, 0, 2, h); } }, true); t.magFilter = THREE.LinearFilter; t.anisotropy = 8; return t; })() }));
  floors.receiveShadow = true; scene.add(floors);
  // asphalt with lane marks: one big plane, a texture that repeats once per CELL so lines land on every road
  const roadTex = canvasTex(576, 576, (g, w, h) => {
    const k = w / CELL; g.fillStyle = "#45474b"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { const v = 50 + Math.random() * 40 | 0; g.fillStyle = `rgba(${v},${v},${v + 2},0.6)`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    g.fillStyle = "rgba(20,20,20,0.18)"; for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 30, 4 + Math.random() * 10, Math.random() * 3, 0, 7); g.fill(); }
    g.fillStyle = "rgba(240,240,240,0.85)"; for (const o of [0.8, ROAD - 0.95]) { g.fillRect(o * k, ROAD * k, 0.15 * k, h); g.fillRect(ROAD * k, o * k, w, 0.15 * k); } // edge lines
    g.fillStyle = "#f2f2f2"; // dashed centre lines
    for (let y = ROAD * k; y < h; y += 6 * k) g.fillRect(ROAD / 2 * k - 1, y, 2, 3 * k);
    for (let x = ROAD * k; x < w; x += 6 * k) g.fillRect(x, ROAD / 2 * k - 1, 3 * k, 2);
    g.fillStyle = "rgba(255,255,255,.9)"; // zebra crossings near the junction
    for (let s = 0; s < 6; s++) { g.fillRect(ROAD * k + 1, (1.5 + s * 2.3) * k, 3 * k, 1.2 * k); g.fillRect((1.5 + s * 2.3) * k, ROAD * k + 1, 1.2 * k, 3 * k); }
  }, true);
  roadTex.repeat.set(SIZE / CELL, SIZE / CELL); roadTex.magFilter = THREE.LinearFilter;
  roadTex.anisotropy = 8; roadTex.minFilter = THREE.LinearMipmapLinearFilter;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(SIZE / 2, 0, SIZE / 2); ground.receiveShadow = true; scene.add(ground);
  roadTex.offset.set(0, 0);
  // grass all around the city and a low wall at the edge
  const out = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 4, SIZE * 4), new THREE.MeshStandardMaterial({ color: 0x5aa046, roughness: 1 }));
  out.rotation.x = -Math.PI / 2; out.position.set(SIZE / 2, -0.05, SIZE / 2); scene.add(out);
  const edge = new THREE.MeshStandardMaterial({ color: 0x8a8478 });
  for (const [x, z, w, d] of [[SIZE / 2, 0, SIZE, 2], [SIZE / 2, SIZE, SIZE, 2], [0, SIZE / 2, 2, SIZE], [SIZE, SIZE / 2, 2, SIZE]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), edge); m.position.set(x, 0.6, z); scene.add(m); }
  // palm trees: a tapered trunk and drooping fronds
  const trunkG = new THREE.CylinderGeometry(0.16, 0.26, 6, 7, 6); trunkG.translate(0, 3, 0);
  { const p = trunkG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 0.35) * 0.25); } trunkG.computeVertexNormals(); }
  const frondTex = canvasTex(64, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = "#4a6a2a"; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); g.strokeStyle = "#3f7a2a"; g.lineWidth = 2.5; for (let y = 6; y < h - 6; y += 5) { const l = Math.sin((y / h) * Math.PI) * (w / 2 - 2); g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 - l, y + 12); g.moveTo(w / 2, y); g.lineTo(w / 2 + l, y + 12); g.stroke(); } });
  frondTex.magFilter = THREE.LinearFilter;
  const fr = []; for (let i = 0; i < 9; i++) { const pg = new THREE.PlaneGeometry(1.1, 3.6, 1, 4); pg.translate(0, 1.8, 0); const pp = pg.attributes.position; for (let k = 0; k < pp.count; k++) { const y = pp.getY(k); pp.setZ(k, -0.06 * y * y); } pg.rotateX(-1.05); pg.rotateY(i / 9 * TAU + (i % 2) * 0.2); pg.translate(Math.sin(6 * 0.35) * 0.25, 6, 0); fr.push(pg); }
  const frondG = mergeGeoms(fr);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x8a7255, roughness: 1 }), treeSpots.length);
  const leaves = new THREE.InstancedMesh(frondG, new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }), treeSpots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), lc = new THREE.Color();
  treeSpots.forEach(([x, z], i) => { const s = 0.85 + R() * 0.45; m4.compose(v.set(x, 0.2, z), q.setFromAxisAngle(up, R() * 6), sc.set(s, s, s)); trunks.setMatrixAt(i, m4); leaves.setMatrixAt(i, m4); leaves.setColorAt(i, lc.setHSL(0.25 + R() * 0.05, 0.5, 0.55 + R() * 0.2)); addSolid(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 3, "tree"); });
  trunks.castShadow = leaves.castShadow = true; scene.add(trunks, leaves);
  const poleG = new THREE.CylinderGeometry(0.07, 0.11, 7, 8); poleG.translate(0, 3.5, 0); const headG = new THREE.BoxGeometry(1.6, 0.12, 0.3); headG.translate(0.75, 7, 0);
  const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: 0x3a3d42 }), lampSpots.length), heads = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0x554422 }), lampSpots.length);
  lampSpots.forEach(([x, z], i) => { m4.compose(v.set(x, 0.2, z), q.identity(), sc.set(1, 1, 1)); poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4); });
  scene.add(poles, heads);
  // shop signs on the landmark buildings
  for (const s of signs) {
    const t = canvasTex(256, 64, (g, w, h) => { const c = { "المخبأ": "#6a3b1e", "الكراج": "#d97a1e", "البنك": "#1e7a3b", "مركز الشرطة": "#1e4fb0", "المستشفى": "#d42020", "المستودع": "#7a5a2e" }[s.pl.name] || "#333"; g.fillStyle = "#1e2126"; g.fillRect(0, 0, w, h); g.fillStyle = c; g.fillRect(0, h - 8, w, 8); g.fillRect(0, 0, 10, h); g.fillStyle = "#fff"; g.font = "bold 36px Tahoma, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.direction = "rtl"; g.fillText(s.pl.name, w / 2, h / 2 + 2); });
    t.magFilter = THREE.LinearFilter;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.w / 4, 0.25), [mat(0x1e2126), mat(0x1e2126), mat(0x1e2126), mat(0x1e2126), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35 }), mat(0x1e2126)]); m.position.set(s.x, s.y, s.z + 0.15); scene.add(m);
  }
}
const signs = [];
buildCity();

// ---------------- blocky people ----------------
const BOXG = new THREE.BoxGeometry(1, 1, 1);
const SKINS = [0xf2c9a0, 0xd9a272, 0xa8744a, 0x7a4e30, 0xf6d7b8];
const SHIRTS = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d, 0xffd166, 0x8338ec, 0x06d6a0, 0xef476f, 0x3a86ff, 0xffffff];
const PANTS = [0x22313f, 0x3d405b, 0x5c4033, 0x1d3557, 0x6b705c, 0x2b2d42];
function part(g, c, w, h, d, x, y, z) { const m = new THREE.Mesh(BOXG, mat(c)); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = false; g.add(m); return m; }
function makePerson(o) {
  if (o.kind) { const id = o.id || (o.kind === "player" ? SAVE.outfit : pickId(o.kind === "cop" ? COP_IDS : o.kind === "gang" ? GANG_IDS : CIV_IDS)); const v = id && makeHuman(id, o.kind === "player" ? "pistol" : o.kind === "civ" ? null : o.kind === "cop" ? "pistol" : "rifle"); if (v) return v; }
  const skin = o.skin ?? SKINS[Math.floor(R() * SKINS.length)], shirt = o.shirt ?? SHIRTS[Math.floor(R() * SHIRTS.length)], pants = o.pants ?? PANTS[Math.floor(R() * PANTS.length)];
  const g = new THREE.Group();
  const hip = new THREE.Group(); hip.position.y = 0.9; g.add(hip);
  const body = part(hip, shirt, 0.62, 0.72, 0.36, 0, 0.36, 0); body.castShadow = true;
  const head = new THREE.Group(); head.position.y = 0.72 + 0.04; hip.add(head);
  part(head, skin, 0.5, 0.5, 0.5, 0, 0.25, 0);
  part(head, 0x111111, 0.08, 0.08, 0.02, 0.11, 0.3, 0.255); part(head, 0x111111, 0.08, 0.08, 0.02, -0.11, 0.3, 0.255); // eyes
  part(head, 0x7a2a2a, 0.18, 0.04, 0.02, 0, 0.14, 0.255); // mouth
  if (o.hair !== false) part(head, o.hairC ?? [0x2a1a10, 0x111111, 0x6b4a2e, 0xc9a050][Math.floor(R() * 4)], 0.54, 0.16, 0.54, 0, 0.53, -0.01);
  if (o.cap) part(head, o.cap, 0.56, 0.14, 0.56, 0, 0.56, 0), part(head, o.cap, 0.4, 0.05, 0.3, 0, 0.5, 0.3);
  const limb = (x, y, w, h, c, c2) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = part(p, c, w, h, w, 0, -h / 2, 0); if (c2) part(p, c2, w * 1.02, 0.16, w * 1.02, 0, -h + 0.08, 0); return p; };
  const armL = limb(0.42, 0.68, 0.22, 0.7, shirt, skin), armR = limb(-0.42, 0.68, 0.22, 0.7, shirt, skin);
  const legL = limb(0.16, 0, 0.26, 0.9, pants, 0x222222), legR = limb(-0.16, 0, 0.26, 0.9, pants, 0x222222);
  hip.add(armL, armR); hip.add(legL, legR);
  if (o.badge) part(hip, 0xffd21e, 0.12, 0.12, 0.02, 0.15, 0.55, 0.19);
  const gun = new THREE.Group(); part(gun, 0x1b1b1d, 0.08, 0.12, 0.34, 0, -0.05, 0.12); part(gun, 0x1b1b1d, 0.07, 0.16, 0.08, 0, -0.16, 0); gun.position.set(0, -0.72, 0.05); gun.visible = false; armR.add(gun);
  scene.add(g);
  return { g, hip, head, armL, armR, legL, legR, gun, body };
}
function animPerson(v, st, dt) {
  if (v.human) return animHuman(v, st, dt);
  // st: { speed, aiming, dead, inAir }
  v.phase = (v.phase || 0) + dt * st.speed * 2.2;
  const s = Math.sin(v.phase) * clamp(st.speed / 4, 0, 1) * 0.9;
  if (st.dead) { v.hip.rotation.x = lerp(v.hip.rotation.x, -Math.PI / 2, 1 - Math.exp(-dt * 8)); v.hip.position.y = lerp(v.hip.position.y, 0.3, 1 - Math.exp(-dt * 8)); return; }
  v.hip.rotation.x = 0; v.hip.position.y = 0.9 + Math.abs(Math.cos(v.phase)) * 0.05 * clamp(st.speed / 4, 0, 1);
  v.legL.rotation.x = s; v.legR.rotation.x = -s;
  if (st.inAir) { v.legL.rotation.x = -0.5; v.legR.rotation.x = 0.3; }
  if (st.aiming) { v.armR.rotation.x = -Math.PI / 2 + (st.pitch || 0); v.armL.rotation.x = -Math.PI / 2.4 + (st.pitch || 0); v.armL.rotation.z = -0.5; v.armR.rotation.z = 0; }
  else if (st.panic) { v.armL.rotation.x = -2.6 + s * 0.3; v.armR.rotation.x = -2.6 - s * 0.3; v.armL.rotation.z = v.armR.rotation.z = 0; }
  else { v.armL.rotation.x = -s * 0.9; v.armR.rotation.x = s * 0.9; v.armL.rotation.z = v.armR.rotation.z = 0; }
}


// ---------------- real people (motion-captured) ----------------
// characters from the Microsoft Rocketbox library (MIT licence), animations retargeted onto them
const OUTFITS = [
  ["Male_Adult_19", "ثوب وشماغ"], ["Male_Adult_21", "ثوب وشماغ أبيض"], ["Male_Adult_15", "ثوب وطاقية"], ["Male_Adult_09", "تيشيرت وجينز"],
  ["Male_Adult_06", "بلوزة حمراء"], ["Male_Adult_12", "جاكيت جينز"], ["Male_Adult_17", "جاكيت رياضي"], ["Male_Adult_08", "قميص سماوي"],
  ["Male_Adult_16", "تيشيرت أزرق"], ["Male_Adult_13", "بلوفر"], ["Male_Adult_01", "شورت وتيشيرت"], ["Male_Adult_20", "بلوزة بنية"], ["Male_Adult_02", "بلوفر بيج"],
];
const CIV_IDS = ["Male_Adult_01", "Male_Adult_02", "Male_Adult_06", "Male_Adult_08", "Male_Adult_09", "Male_Adult_12", "Male_Adult_13", "Male_Adult_15", "Male_Adult_16", "Male_Adult_17", "Male_Adult_19", "Male_Adult_20", "Male_Adult_21", "Female_Adult_01", "Female_Adult_02", "Female_Adult_04"];
const COP_IDS = ["Police_Male_03", "Police_Male_06", "Police_Male_07"], GANG_IDS = ["Male_Adult_04", "Male_Adult_18", "Male_Adult_10"];
const ANIM_ID = "Male_Adult_19";
const HUM = {}, humLoading = {}; let CLIPS = null;
const gltfLoader = new GLTFLoader();
function loadHuman(id) {
  if (!humLoading[id]) humLoading[id] = new Promise((res) => gltfLoader.load("models/people/" + id + ".glb", (g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; for (const m of [].concat(o.material)) { m.envMapIntensity = 0.7; if (m.map) m.map.anisotropy = 4; } } });
    HUM[id] = g; if (id === ANIM_ID) CLIPS = g.animations; res(g);
  }, undefined, () => res(null)));
  return humLoading[id];
}
const loadedOf = (ids) => ids.filter((i) => HUM[i]);
const pickId = (ids) => { const l = loadedOf(ids); return l.length ? l[Math.floor(R() * l.length)] : null; };
const GUN_MAT = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.45, metalness: 0.6 });
function heldGun(kind) {
  const g = new THREE.Group(), B = (w, h, d, x, y, z, m) => { const k = new THREE.Mesh(BOXG, m || GUN_MAT); k.scale.set(w, h, d); k.position.set(x, y, z); g.add(k); };
  if (kind === "pistol") { B(0.035, 0.05, 0.19, 0, 0.03, 0.05); B(0.03, 0.11, 0.045, 0, -0.03, -0.01); }
  else if (kind === "shotgun") { B(0.05, 0.08, 0.7, 0, 0.0, 0.18); B(0.045, 0.1, 0.25, 0, -0.02, -0.24, mat(0x5a3a22)); B(0.05, 0.06, 0.25, 0, -0.06, 0.3, mat(0x5a3a22)); }
  else { B(0.05, 0.09, 0.55, 0, 0, 0.12); B(0.04, 0.15, 0.06, 0, -0.1, 0.17); B(0.04, 0.1, 0.045, 0, -0.07, 0.0); B(0.045, 0.08, 0.22, 0, -0.02, -0.24); B(0.025, 0.025, 0.18, 0, 0.02, 0.48); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
const _hv = new THREE.Vector3();
function makeHuman(id, gunKind) {
  const G = HUM[id]; if (!G || !CLIPS) return null;
  const root = SkeletonUtils.clone(G.scene); root.rotation.y = Math.PI;
  const hi = [], lo = []; root.traverse((o) => { if (o.isSkinnedMesh) (/_LOD$/.test(o.name) ? lo : hi).push(o); });
  for (const o of lo) o.visible = false;
  const g = new THREE.Group(); g.add(root); scene.add(g);
  const mixer = new THREE.AnimationMixer(root), acts = {};
  for (const c of CLIPS) { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(c.name === "Idle" ? 1 : 0); acts[c.name] = a; }
  let rh = null, lh = null; root.traverse((o) => { if (o.isBone && /RightHand$/.test(o.name)) rh = o; if (o.isBone && /LeftHand$/.test(o.name)) lh = o; });
  const guns = {}; const gun = (k) => { if (!guns[k]) { guns[k] = heldGun(k); guns[k].visible = false; scene.add(guns[k]); } return guns[k]; };
  const v = { g, root, mixer, acts, cur: "Idle", rh, lh, hi, lo, far: false, human: true, id, guns, gunOf: gun, gunKind: gunKind || null, armed: !!gunKind, shadow: false };
  v.gun = { set visible(x) { v.armed = x; }, get visible() { return v.armed; } };
  return v;
}
function disposeHuman(v) { scene.remove(v.g); for (const k in v.guns) scene.remove(v.guns[k]); v.mixer.stopAllAction(); }
function setAct(v, name, rate) {
  if (!v.acts[name]) name = "Idle";
  const a = v.acts[name]; a.timeScale = rate || 1;
  if (v.cur === name) return;
  const from = v.acts[v.cur]; a.enabled = true; a.setEffectiveWeight(1);
  if (from) { const loco = /Walk|Run|Strafe/; if (loco.test(v.cur) && loco.test(name)) a.time = (from.time / from.getClip().duration) * a.getClip().duration; a.crossFadeFrom(from, 0.22, false); }
  v.cur = name;
}
function animHuman(v, st, dt) {
  const d = Math.abs(v.g.position.x - camera.position.x) + Math.abs(v.g.position.z - camera.position.z);
  // far people: simple mesh, and the animation runs at a lower rate
  const far = d > 26; if (far !== v.far) { v.far = far; for (const o of v.hi) o.visible = !far; for (const o of v.lo) o.visible = far; }
  if (st.dead) {
    if (v.fall == null) { v.fall = 0; setAct(v, "Idle", 0.2); }
    v.fall = Math.min(1, v.fall + dt * 2.2); v.root.rotation.x = -Math.PI / 2 * v.fall * v.fall; v.root.position.y = 0.12 * v.fall;
    v.mixer.update(dt); hideGuns(v); return;
  }
  const sp = st.speed || 0, aim = st.aiming && v.armed;
  if (sp < 0.35) setAct(v, "Idle", 1);
  else if (sp < 4.4 && !st.panic) setAct(v, aim && st.strafe ? "Strafe" : "Walk", clamp(sp / 1.45, 0.6, 1.9));
  else setAct(v, "Run", clamp(sp / 6.2, 0.75, 1.35));
  v.acc = (v.acc || 0) + dt; const step = far ? 1 / 12 : 0;
  if (v.acc >= step) { v.mixer.update(v.acc); v.acc = 0; }
  if (!far || aim) poseArms(v, aim, st.aimDir || _gf.set(Math.sin(v.g.rotation.y), 0, Math.cos(v.g.rotation.y)));
  placeGun(v, aim, st.aimDir);
}
const _ga = new THREE.Vector3(), _gb = new THREE.Vector3(), _gf = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _ax = new THREE.Vector3();
function rotWorld(bone, qW) { bone.parent.getWorldQuaternion(_q2); _q1.copy(_q2).invert().multiply(qW).multiply(_q2); bone.quaternion.premultiply(_q1); bone.updateMatrixWorld(true); }
function aimBone(bone, tip, dir) { bone.getWorldPosition(_v1); tip.getWorldPosition(_v2); _v2.sub(_v1).normalize(); _q1.setFromUnitVectors(_v2, dir); rotWorld(bone, _q1.clone()); }
function bones(v) { if (v.B) return v.B; const B = {}; v.root.traverse((o) => { if (o.isBone) { const m = o.name.match(/(Left|Right)(Arm|ForeArm|Hand)$/); if (m) B[m[1][0] + m[2]] = o; if (/Spine2$/.test(o.name)) B.spine = o; } }); return (v.B = B); }
let ARMOUT = -0.2;
function poseArms(v, aim, aimDir) {
  const B = bones(v); if (!B.LArm || !B.RArm) return;
  v.g.updateMatrixWorld(true);
  const a = v.g.rotation.y, fwd = _ax.set(Math.sin(a), 0, Math.cos(a));
  if (!aim) { // hang the arms a little away from the body so they never sink into wide clothes
    for (const [k, s] of [["LArm", 1], ["RArm", -1]]) { _q1.setFromAxisAngle(fwd, s * ARMOUT); rotWorld(B[k], _q1.clone()); }
    return;
  }
  // straighten the elbows, point the gun arm at the target, the other hand on the grip
  const dir = aimDir.clone().normalize();
  aimBone(B.RArm, B.RHand, dir); aimBone(B.RForeArm, B.RHand, dir);
  B.RHand.getWorldPosition(_v3); const toGrip = _v3.clone().addScaledVector(dir, -0.05); B.LArm.getWorldPosition(_v1);
  const ld = toGrip.sub(_v1).normalize(); aimBone(B.LArm, B.LHand, ld); aimBone(B.LForeArm, B.LHand, ld);
}
function hideGuns(v) { for (const k in v.guns) v.guns[k].visible = false; }
function placeGun(v, aim, aimDir) {
  hideGuns(v); if (!v.armed || !v.gunKind || !v.rh || !v.g.visible || v.far && !aim) return;
  const gun = v.gunOf(v.gunKind); gun.visible = true;
  v.g.updateMatrixWorld(true); v.rh.getWorldPosition(_ga); v.lh.getWorldPosition(_gb);
  gun.position.copy(_ga); const d = _ga.distanceTo(_gb), a = v.g.rotation.y;
  if (aim) { const ad = aimDir || _v3.set(Math.sin(a), 0, Math.cos(a)); _gf.copy(_ga).add(ad); gun.lookAt(_gf); }
  else { _gf.set(_ga.x + Math.sin(a) * 0.35, _ga.y - 0.9, _ga.z + Math.cos(a) * 0.35); gun.lookAt(_gf); } // held low at the side
}

// ---------------- blocky cars ----------------
const CAR_TYPES = {
  sedan: { len: 4.45, wid: 1.9, h: 0.75, cab: [2.2, 0.62, -0.2], max: 24, acc: 11, steer: 1.0, hp: 100 },
  sport: { len: 4.55, wid: 1.95, h: 0.6, cab: [1.8, 0.5, -0.4], max: 34, acc: 16, steer: 1.15, hp: 90 },
  van: { len: 5.05, wid: 2.05, h: 1.2, cab: [3.6, 0.9, -0.5], max: 19, acc: 8, steer: 0.85, hp: 140 },
  taxi: { len: 4.45, wid: 1.9, h: 0.75, cab: [2.2, 0.62, -0.2], max: 25, acc: 11, steer: 1.0, hp: 100 },
  police: { len: 4.45, wid: 1.9, h: 0.75, cab: [2.2, 0.62, -0.2], max: 33, acc: 15, steer: 1.1, hp: 160 },
};
const CAR_COLS = [0xd62828, 0x1d6fe0, 0xf2f2f2, 0x2a2a2a, 0x2a9d8f, 0xffb703, 0x8338ec, 0x6b705c, 0xfb8500, 0x90be6d];
const wheelG = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 10); wheelG.rotateZ(Math.PI / 2);
// car silhouettes (side view: [z, y] from rear bumper to front), extruded across the width
const CAR_SHAPES = {
  sedan: { body: [[-2.2, 0.62], [-2.2, 0.95], [-2.0, 1.02], [-1.35, 1.05], [-0.85, 1.48], [0.55, 1.5], [1.1, 1.06], [2.05, 0.96], [2.22, 0.78], [2.22, 0.62]], glass: [[-1.25, 1.06], [-0.82, 1.43], [0.52, 1.45], [1.02, 1.07]], wz: [1.38, -1.35] },
  taxi: null, police: null,
  sport: { body: [[-2.25, 0.55], [-2.25, 0.88], [-1.9, 0.95], [-1.1, 1.0], [-0.55, 1.28], [0.35, 1.3], [1.0, 0.98], [2.2, 0.8], [2.3, 0.62], [2.3, 0.55]], glass: [[-1.0, 1.0], [-0.52, 1.24], [0.33, 1.26], [0.92, 0.99]], wz: [1.45, -1.4] },
  van: { body: [[-2.5, 0.62], [-2.5, 2.1], [-2.35, 2.2], [1.25, 2.2], [1.95, 1.3], [2.48, 1.12], [2.52, 0.85], [2.52, 0.62]], glass: [[0.9, 1.35], [0.95, 2.05], [1.22, 2.08], [1.85, 1.33]], side: [[-2.0, 1.45], [-2.0, 1.95], [0.7, 1.95], [0.7, 1.45]], wz: [1.65, -1.7] },
};
CAR_SHAPES.taxi = CAR_SHAPES.sedan; CAR_SHAPES.police = CAR_SHAPES.sedan;
const carGeoCache = {};
function extrudeSide(pts, width, bevel, arches) {
  const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
  if (arches) { const b = pts[pts.length - 1][1], AR = 0.46; for (const wz of [...arches].sort((a, c) => c - a)) { sh.lineTo(wz + AR, b); sh.lineTo(wz + AR, 0.4); sh.absarc(wz, 0.4, AR, 0, Math.PI, false); sh.lineTo(wz - AR, b); } }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2); g.computeVertexNormals(); return g;
}
function carGeos(type) {
  if (carGeoCache[type]) return carGeoCache[type];
  const S = CAR_SHAPES[type], W = CAR_TYPES[type].wid;
  const body = extrudeSide(S.body, W, 0.1, S.wz);
  // the body with wheel arches cut out: we cheat with dark arch blocks drawn over it
  const glass = extrudeSide(S.glass, W - 0.06, 0.06);
  const side = S.side ? extrudeSide(S.side, W + 0.02, 0) : null;
  return (carGeoCache[type] = { body, glass, side });
}
const tireG = new THREE.CylinderGeometry(0.37, 0.37, 0.27, 18); tireG.rotateZ(Math.PI / 2);
const rimG = new THREE.CylinderGeometry(0.24, 0.24, 0.29, 12); rimG.rotateZ(Math.PI / 2);
const archG = new THREE.CylinderGeometry(0.47, 0.47, 1, 16, 1, false, 0, Math.PI); archG.rotateZ(Math.PI / 2); archG.rotateX(Math.PI / 2);
const MAT_TIRE = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9 }), MAT_RIM = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.25 });
const MAT_GLASS = new THREE.MeshPhysicalMaterial({ color: 0x0b141c, metalness: 0.2, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.6 });
const MAT_BLACK = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.6 }), MAT_CHROME = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15 });
const MAT_HEAD = new THREE.MeshStandardMaterial({ color: 0xfff8e8, emissive: 0xfff0c0, emissiveIntensity: 0.6 }), MAT_TAIL = new THREE.MeshStandardMaterial({ color: 0x9a0a0a, emissive: 0xff1010, emissiveIntensity: 0.5 });
// real car models (Comrade1280's "Generic passenger car pack" and "Generic civil service vehicles pack", CC BY 4.0)
const CAR_MODELS = { sedan: ["sedan", "compact", "hatch"], sport: ["sport"], van: ["minivan", "postvan", "pickup"], taxi: ["taxi"], police: ["police"] };
const CARG = {}, carLoading = {};
function loadCar(id) {
  if (!carLoading[id]) carLoading[id] = new Promise((res) => gltfLoader.load("models/cars/" + id + ".glb", (g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; for (const m of [].concat(o.material)) { m.envMapIntensity = 1.1; if (/glass/i.test(m.name)) { m.transparent = true; m.opacity = Math.min(m.opacity, 0.85); m.roughness = 0.05; m.metalness = 0.3; m.envMapIntensity = 1.8; } } } });
    const box = new THREE.Box3().setFromObject(g.scene); CARG[id] = { scene: g.scene, size: box.getSize(new THREE.Vector3()) }; res(g);
  }, undefined, () => res(null)));
  return carLoading[id];
}
// paint variants made by recolouring the body texture once
const PAINTS = ["", "hue-rotate(120deg)", "hue-rotate(220deg)", "saturate(0) brightness(1.55)", "saturate(0.15) brightness(0.38)", "saturate(0.1) brightness(1.05)", "hue-rotate(300deg) saturate(1.2)", "hue-rotate(40deg)"];
const paintCache = new Map();
function paintMat(m, filter) {
  if (!filter || !m.map || !m.map.image) return m;
  const key = m.uuid + filter; if (paintCache.has(key)) return paintCache.get(key);
  const im = m.map.image, c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d"); x.filter = filter; x.drawImage(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = m.map.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = m.map.wrapS; t.wrapT = m.map.wrapT; t.anisotropy = 4;
  const n = m.clone(); n.map = t; paintCache.set(key, n); return n;
}
function makeRealCar(type, color, modelId) {
  const id = modelId || (CAR_MODELS[type] || ["sedan"]).filter((k) => CARG[k])[Math.floor(R() * 3) % Math.max(1, (CAR_MODELS[type] || ["sedan"]).filter((k) => CARG[k]).length)];
  const G = id && CARG[id]; if (!G) return null;
  const g = new THREE.Group(), body = G.scene.clone(true); g.add(body);
  const filter = color === 0xffc21e ? "sepia(1) saturate(4) hue-rotate(-8deg) brightness(1.45)" : type === "sedan" || type === "sport" || type === "van" ? (id === "postvan" ? "" : PAINTS[Math.floor(R() * PAINTS.length)]) : "";
  let paint = null;
  body.traverse((o) => { if (o.isMesh) { if (/^Body/.test(o.material.name)) { o.material = paintMat(o.material, filter); paint = o.material; } if (/^(police_sedan|taxi)$/.test(o.material.name)) paint = o.material; o.castShadow = /^Body|police_sedan|taxi|minivan|postvan|pickup/.test(o.material.name); } });
  const wheels = []; for (const n of ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"]) { const w = body.getObjectByName(n); if (w) { w.rotation.order = "YXZ"; wheels.push(w); } }
  let lights = null;
  if (type === "police") {
    const y = 1.5, r = new THREE.Mesh(BOXG, new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 0 })), bl = new THREE.Mesh(BOXG, new THREE.MeshStandardMaterial({ color: 0x2050ff, emissive: 0x0030ff, emissiveIntensity: 0 }));
    r.scale.set(0.42, 0.1, 0.17); bl.scale.set(0.42, 0.1, 0.17); r.position.set(-0.24, y, -0.2); bl.position.set(0.24, y, -0.2); r.visible = bl.visible = false; body.add(r, bl); lights = [r, bl];
  }
  scene.add(g);
  return { g, body, wheels, lights, paint: paint || new THREE.MeshStandardMaterial(), real: id };
}
function makeCarMesh(type, color) {
  const real = makeRealCar(type, color); if (real) return real;
  const T = CAR_TYPES[type], S = CAR_SHAPES[type], G = carGeos(type), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 });
  const add = (geo, m, shadow) => { const k = new THREE.Mesh(geo, m); k.castShadow = !!shadow; body.add(k); return k; };
  add(G.body, paint, true); add(G.glass, MAT_GLASS); if (G.side) add(G.side, MAT_GLASS);
  const W = T.wid, front = S.body[S.body.length - 1][0], rear = S.body[0][0];
  // lights, grille, bumpers, mirrors
  for (const sx of [-1, 1]) {
    const hl = add(BOXG, MAT_HEAD); hl.scale.set(0.42, 0.13, 0.06); hl.position.set(sx * W * 0.32, type === "van" ? 1.0 : 0.82, front + 0.02);
    const tl = add(BOXG, MAT_TAIL); tl.scale.set(0.38, 0.12, 0.06); tl.position.set(sx * W * 0.34, type === "van" ? 1.6 : 0.88, rear - 0.02);
    const mr = add(BOXG, paint); mr.scale.set(0.18, 0.12, 0.1); mr.position.set(sx * (W / 2 + 0.06), type === "van" ? 1.45 : 1.08, type === "van" ? 1.0 : 0.95);
    // dark wheel arches over the paint
  }
  for (const wz of S.wz) { const well = add(BOXG, MAT_BLACK); well.scale.set(W - 0.5, 0.5, 0.9); well.position.set(0, 0.72, wz); }
  const grille = add(BOXG, MAT_BLACK); grille.scale.set(W * 0.38, 0.14, 0.05); grille.position.set(0, type === "van" ? 0.9 : 0.72, front + 0.03);
  for (const [z, y] of [[front + 0.04, 0.6], [rear - 0.04, 0.62]]) { const bp = add(BOXG, MAT_BLACK); bp.scale.set(W * 0.98, 0.16, 0.12); bp.position.set(0, y, z); }
  const plate = add(BOXG, mat(0xf4f4f4)); plate.scale.set(0.5, 0.13, 0.02); plate.position.set(0, 0.68, rear - 0.11);
  const wheels = [];
  for (const [x, z] of [[1, S.wz[0]], [-1, S.wz[0]], [1, S.wz[1]], [-1, S.wz[1]]]) {
    const w = new THREE.Group(); const t = new THREE.Mesh(tireG, MAT_TIRE), r = new THREE.Mesh(rimG, MAT_RIM); t.castShadow = true; w.add(t, r);
    const sp = new THREE.Mesh(BOXG, MAT_RIM); sp.scale.set(0.3, 0.36, 0.06); w.add(sp); const sp2 = sp.clone(); sp2.rotation.x = Math.PI / 2; w.add(sp2);
    w.position.set(x * (W / 2 - 0.16), 0.37, z); g.add(w); wheels.push(w);
  }
  let lights = null;
  const roofY = Math.max(...S.glass.map((p) => p[1])) + 0.06, roofZ = (S.glass[1][0] + S.glass[2][0]) / 2;
  if (type === "taxi") { const sg = add(BOXG, new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0x806000, emissiveIntensity: 0.5 })); sg.scale.set(0.6, 0.16, 0.25); sg.position.set(0, roofY + 0.08, roofZ); }
  if (type === "police") {
    for (const sx of [-1, 1]) { const d = add(BOXG, MAT_BLACK); d.scale.set(0.02, 0.36, 2.1); d.position.set(sx * (W / 2 + 0.005), 0.84, 0.1); }
    const bar = add(BOXG, MAT_BLACK); bar.scale.set(1.1, 0.08, 0.28); bar.position.set(0, roofY + 0.04, roofZ);
    const r = add(BOXG, new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 0 })), bl = add(BOXG, new THREE.MeshStandardMaterial({ color: 0x2050ff, emissive: 0x0030ff, emissiveIntensity: 0 }));
    r.scale.set(0.45, 0.12, 0.24); bl.scale.set(0.45, 0.12, 0.24); r.position.set(0.27, roofY + 0.12, roofZ); bl.position.set(-0.27, roofY + 0.12, roofZ);
    lights = [r, bl];
  }
  scene.add(g);
  return { g, body, wheels, lights, paint };
}

// ---------------- entities ----------------
const cars = [], peds = [], cops = [], gang = [], fx = [];
function newCar(type, x, z, a, color, ai) {
  const T = CAR_TYPES[type], c = { type, T, x, z, a, vx: 0, vz: 0, steer: 0, hp: T.hp, mesh: makeCarMesh(type, color ?? CAR_COLS[Math.floor(R() * CAR_COLS.length)]), ai: ai || null, driver: null, dead: false, burnT: 0, spin: 0, siren: 0 };
  if (c.mesh.real) { const sz = CARG[c.mesh.real].size; c.T = Object.assign({}, T, { len: sz.z, wid: Math.min(sz.x, 2.2) - 0.1 }); }
  cars.push(c); return c;
}
// traffic follows the road grid: drive to the next junction on the right-hand lane, then pick a new direction
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function laneTarget(c) { const [dx, dz] = DIRS[c.ai.dir]; const off = 3.6; return { x: roadC(c.ai.ix) - dz * off, z: roadC(c.ai.iz) + dx * off }; }
function spawnTraffic(n) {
  for (let k = 0; k < n; k++) {
    const horiz = R() < 0.5, i = Math.floor(R() * (N + 1)), j = Math.floor(R() * N), dir = horiz ? (R() < 0.5 ? 0 : 2) : (R() < 0.5 ? 1 : 3);
    const ai = { kind: "traffic", dir, ix: 0, iz: 0, wait: 0 };
    let x, z;
    if (horiz) { z = roadC(i); x = blockX0(j) + BLOCK * R(); ai.iz = i; ai.ix = dir === 0 ? j + 1 : j; } else { x = roadC(i); z = blockX0(j) + BLOCK * R(); ai.ix = i; ai.iz = dir === 1 ? j + 1 : j; }
    const type = R() < 0.15 ? "taxi" : R() < 0.15 ? "van" : R() < 0.12 ? "sport" : "sedan";
    const c = newCar(type, x, z, Math.atan2(DIRS[dir][0], DIRS[dir][1]), type === "taxi" ? 0xffd21e : null, ai);
    const t = laneTarget(c); if (horiz) c.z = t.z; else c.x = t.x;
    c.driver = "npc";
  }
}
function pickNextDir(c) {
  const opts = [];
  for (let d = 0; d < 4; d++) { if (d === (c.ai.dir + 2) % 4) continue; const nx = c.ai.ix + DIRS[d][0], nz = c.ai.iz + DIRS[d][1]; if (nx >= 0 && nx <= N && nz >= 0 && nz <= N) opts.push(d); }
  const straight = opts.includes(c.ai.dir);
  c.ai.dir = straight && R() < 0.55 ? c.ai.dir : opts[Math.floor(R() * opts.length)] ?? (c.ai.dir + 2) % 4;
  c.ai.ix += DIRS[c.ai.dir][0]; c.ai.iz += DIRS[c.ai.dir][1];
}
// people walk around their block on the pavement
function spawnPeds(n) {
  for (let k = 0; k < n; k++) {
    const bx = Math.floor(R() * N), bz = Math.floor(R() * N), p = { v: makePerson({ kind: "civ" }), bx, bz, t: R() * 4, dir: R() < 0.5 ? 1 : -1, x: 0, z: 0, a: 0, hp: 30, dead: false, deadT: 0, panic: 0, speed: 1.4 + R() * 0.6, kind: "ped" };
    pedOnPath(p); peds.push(p);
  }
}
function pedPathPoint(p, t) { // t in 0..4 goes once around the block, 1.6 m from the kerb
  const x0 = blockX0(p.bx) + 1.6, z0 = blockX0(p.bz) + 1.6, L = BLOCK - 3.2, s = ((t % 4) + 4) % 4, f = s % 1;
  if (s < 1) return { x: x0 + L * f, z: z0 }; if (s < 2) return { x: x0 + L, z: z0 + L * f }; if (s < 3) return { x: x0 + L * (1 - f), z: z0 + L }; return { x: x0, z: z0 + L * (1 - f) };
}
function pedOnPath(p) { const q = pedPathPoint(p, p.t); p.x = q.x; p.z = q.z; }

// ---------------- player ----------------
const player = { x: 0, z: 0, y: 0, vy: 0, a: 0, hp: 100, armor: 0, car: null, v: null, dead: false, onGround: true, speed: 0, weapon: 0, ammo: [Infinity, 120, 0, 0], fireT: 0, aimT: 0 };
const WEAPONS = [
  { name: "مسدس", dmg: 22, rate: 0.32, range: 60, spread: 0.02, snd: 1 },
  { name: "رشاش", dmg: 14, rate: 0.09, range: 55, spread: 0.05, snd: 0.8 },
  { name: "شوزن", dmg: 12, rate: 0.85, range: 22, spread: 0.12, pel: 6, snd: 1.4 },
];
function spawnPlayer() {
  const h = frontOf(PLACES.hideout); player.x = h.x; player.z = h.z - 2; player.a = Math.PI; player.y = 0; player.hp = 100; player.dead = false; player.car = null;
  if (!player.v) player.v = makePerson({ kind: "player", skin: 0xf0c090, shirt: 0xffffff, pants: 0x2b4a8a, cap: 0xd62828, hairC: 0x2a1a10 });
  player.v.g.visible = true; camYaw = player.a;
}

// ---------------- wanted level & police ----------------
const wanted = { stars: 0, cool: 0, seenT: 0 };
function addWanted(n, why) { const before = wanted.stars; wanted.stars = clamp(Math.max(wanted.stars, 0) + n, 0, 5); wanted.cool = 0; if (wanted.stars > before) { sfx.alarm(); } }
function nearestRoadPoint(x, z) { const ix = clamp(Math.round((x - ROAD / 2) / CELL), 0, N), iz = clamp(Math.round((z - ROAD / 2) / CELL), 0, N); return { ix, iz, x: roadC(ix), z: roadC(iz) }; }
function spawnCop() {
  // a police car on a road 90–140 m away from you
  for (let k = 0; k < 30; k++) {
    const a = R() * TAU, d = 90 + R() * 50, p = nearestRoadPoint(px() + Math.cos(a) * d, pz() + Math.sin(a) * d);
    if (Math.hypot(p.x - px(), p.z - pz()) < 70) continue;
    const c = newCar("police", p.x, p.z, R() * TAU, 0xf4f4f4, { kind: "police", stuck: 0, rev: 0, shootT: 1 + R() });
    c.driver = "cop"; return c;
  }
}
const px = () => (player.car ? player.car.x : player.x), pz = () => (player.car ? player.car.z : player.z);

// ---------------- missions ----------------
// each step: text, where (marker), and a check run every frame; reaching the last step pays the reward
let mission = null, missionIdx = -1, missionT = 0;
const MISSIONS = [
  { name: "أول سرقة", desc: "اسرق أي سيارة ووصّلها للكراج", reward: 500, start: "hideout",
    steps: [
      { text: "اسرق أي سيارة من الشارع (قرّب منها واضغط <b>سرقة</b>)", check: () => !!player.car },
      { text: "وصّل السيارة لـ <b>الكراج</b>", at: () => frontOf(PLACES.garage), r: 9, check: (m) => player.car && near(frontOf(PLACES.garage), 9) },
    ] },
  { name: "التوصيلة", desc: "استلم الشنطة ووصّلها قبل ما يخلص الوقت", reward: 900, start: "garage",
    steps: [
      { text: "اركب سيارة وروح استلم الشنطة من <b>المستودع</b>", at: () => frontOf(PLACES.warehouse), r: 9, check: () => player.car && near(frontOf(PLACES.warehouse), 9) },
      { text: "وصّل الشنطة لـ <b>البنك</b> بسرعة!", at: () => frontOf(PLACES.bank), r: 9, time: 90, check: () => player.car && near(frontOf(PLACES.bank), 9) },
    ] },
  { name: "سيارة الزعيم", desc: "اسرق السيارة الذهبية من موقف المستشفى", reward: 1500, start: "hideout",
    steps: [
      { text: "لقيت <b>السيارة الذهبية</b> عند المستشفى؟ اسرقها!", at: () => (mission.gold ? { x: mission.gold.x, z: mission.gold.z } : frontOf(PLACES.hospital)), r: 5,
        enter: (m) => { const p = frontOf(PLACES.hospital); m.gold = newCar("sport", p.x - 12, p.z, Math.PI / 2, 0xffc21e); }, check: (m) => player.car === m.gold },
      { text: "الشرطة شافتك! وصّل السيارة الذهبية لـ <b>الكراج</b> وهي سليمة", at: () => frontOf(PLACES.garage), r: 9, enter: () => addWanted(2), check: (m) => player.car === m.gold && near(frontOf(PLACES.garage), 9), fail: (m) => (m.gold.dead ? "انفجرت السيارة الذهبية!" : null) },
    ] },
  { name: "السطو الكبير", desc: "اسطُ على البنك واهرب من الشرطة", reward: 2500, start: "garage",
    steps: [
      { text: "روح لباب <b>البنك</b> على رجولك", at: () => frontOf(PLACES.bank), r: 4, check: () => !player.car && near(frontOf(PLACES.bank), 4) },
      { text: "<b>تم السطو!</b> اهرب من الشرطة لين تختفي النجوم", enter: () => { addWanted(3); toast("💰 سطو!", "+ $1000 في الشنطة"); }, check: () => wanted.stars === 0 },
      { text: "ارجع لـ <b>المخبأ</b>", at: () => frontOf(PLACES.hideout), r: 6, check: () => near(frontOf(PLACES.hideout), 6) },
    ] },
  { name: "تصفية العصابة", desc: "عصابة الأحمر احتلت المستودع، طلّعهم", reward: 3000, start: "hideout",
    steps: [
      { text: "روح لـ <b>المستودع</b> وخذ سلاح الرشاش من الزعيم", at: () => frontOf(PLACES.warehouse), r: 9, enter: () => { player.ammo[1] = Math.max(player.ammo[1], 150); }, check: () => near(frontOf(PLACES.warehouse), 9) },
      { text: "صفِّ <b>أفراد العصابة</b> (باقي <b id='gangN'>5</b>)", enter: (m) => spawnGang(5), check: () => gang.every((g) => g.dead) },
      { text: "ارجع لـ <b>المخبأ</b> وخذ فلوسك", at: () => frontOf(PLACES.hideout), r: 6, check: () => near(frontOf(PLACES.hideout), 6) },
    ] },
];
const near = (p, r) => Math.hypot(px() - p.x, pz() - p.z) < r;
function missionStartPoint(i) { const m = MISSIONS[i]; const p = frontOf(PLACES[m.start]); return { x: p.x + (m.start === "hideout" ? 6 : -6), z: p.z }; }
function startMission(i) { $("hint").hidden = true; hintT = 0; missionIdx = i; mission = { def: MISSIONS[i], step: -1 }; nextStep(); toast(MISSIONS[i].name, "مهمة جديدة"); sfx.mission(); }
function nextStep() {
  mission.step++;
  const s = mission.def.steps[mission.step];
  if (!s) return completeMission();
  missionT = s.time || 0; if (s.enter) s.enter(mission);
  showObj();
}
function showObj() { const s = mission && mission.def.steps[mission.step]; const o = $("obj"); if (!s) { o.hidden = true; return; } o.hidden = false; o.innerHTML = s.text + (s.time ? ` <span class="timer" id="mTime"></span>` : "") + (s.at ? ` <span class="dist">📍 <span id="mDist"></span></span>` : "") + `<small>${mission.def.name}</small>`; }
function completeMission() {
  const d = mission.def; SAVE.money += d.reward; SAVE.done = Math.max(SAVE.done, missionIdx + 1); save();
  toast("المهمة نجحت!", "+ $" + d.reward.toLocaleString("en")); sfx.win(); mission = null; missionIdx = -1; $("obj").hidden = true;
  if (wanted.stars > 0 && d.name !== "السطو الكبير") wanted.cool = 0;
}
function failMission(why) { toast("فشلت المهمة", why); sfx.fail(); if (mission && mission.gold && player.car !== mission.gold) mission.gold.ai = mission.gold.ai; mission = null; missionIdx = -1; $("obj").hidden = true; }
function spawnGang(n) {
  gang.length = 0; const c = blockCentre(PLACES.warehouse), f = frontOf(PLACES.warehouse);
  for (let k = 0; k < n; k++) { const p = { v: makePerson({ kind: "gang", shirt: 0xb01818, pants: 0x1a1a1a, cap: 0x111111, skin: SKINS[k % SKINS.length] }), x: f.x - 14 + k * 7, z: f.z - 5 - (k % 2) * 3, a: 0, hp: 60, dead: false, deadT: 0, shootT: 1 + R() * 1.5, kind: "gang" }; p.v.gun.visible = true; gang.push(p); peds.push(p); }
}

// ---------------- input ----------------
const pedal = { gas: false, brake: false, left: false, right: false, wheel: 0, wheelHeld: false, tilt: 0, btnSteer: 0 };
// phone tilt: gravity along the screen's long side
let tiltOk = false;
function askTilt() { try { if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) DeviceMotionEvent.requestPermission().then((r) => (tiltOk = r === "granted")).catch(() => {}); else tiltOk = true; } catch (e) {} }
addEventListener("devicemotion", (e) => { const g = e.accelerationIncludingGravity; if (!g || g.y == null) return; tiltOk = true; const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0; const v = ang === 90 ? g.y : ang === 270 || ang === -90 ? -g.y : g.x; pedal.tilt = clamp(v / 5.5, -1, 1) * (SET.tiltInv ? -1 : 1); });
const keys = {}; let camYaw = 0, camPitch = 0.32, firing = false, joy = { x: 0, y: 0 }, jumpQ = false, actQ = false;
addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); keys[k] = true; if (k === "f" || k === "e") actQ = true; if (k === " ") jumpQ = true; if (k === "q") cycleWeapon(); if (k === "m") openMissions(); if (k === "escape") openMissions(); });
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener("mousedown", () => { if (!IS_TOUCH && mode === "play") { if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); else firing = true; } });
addEventListener("mouseup", () => { if (!IS_TOUCH) firing = false; });
addEventListener("mousemove", (e) => { if (document.pointerLockElement === canvas) { camYaw -= e.movementX * 0.0032 * SET.sens; camPitch = clamp(camPitch + e.movementY * 0.0026 * SET.sens * (SET.invY ? -1 : 1), 0.05, 0.9); } });
// touch: a floating joystick on the left, drag on the right to look
(function touch() {
  // floating joystick: touch anywhere on the left side and it appears under your thumb
  const J = $("joy"), K = $("joyK"), Z = $("joyZone"); let jid = null, cx = 0, cy = 0; const home = () => { J.style.left = ""; J.style.top = ""; J.style.bottom = ""; };
  Z.addEventListener("pointerdown", (e) => { if (jid !== null) return; jid = e.pointerId; Z.setPointerCapture(e.pointerId); const R2 = J.offsetWidth / 2; const zr = Z.getBoundingClientRect(); cx = clamp(e.clientX, zr.left + R2 + 6, zr.right - R2); cy = clamp(e.clientY, zr.top + R2, innerHeight - R2 - 6); J.style.left = cx - R2 + "px"; J.style.top = cy - R2 + "px"; J.style.bottom = "auto"; J.classList.add("on"); move(e); });
  const move = (e) => { if (e.pointerId !== jid) return; const R2 = J.offsetWidth / 2; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy); if (l > R2) { dx *= R2 / l; dy *= R2 / l; } const dz = l < 8 ? 0 : 1; joy.x = dx / R2 * dz; joy.y = dy / R2 * dz; K.style.transform = `translate(${dx}px,${dy}px)`; };
  Z.addEventListener("pointermove", move);
  const end = (e) => { if (e.pointerId !== jid) return; jid = null; joy.x = joy.y = 0; K.style.transform = ""; J.classList.remove("on"); home(); };
  Z.addEventListener("pointerup", end); Z.addEventListener("pointercancel", end);
  const L = $("look"); const looks = new Map();
  L.addEventListener("pointerdown", (e) => { looks.set(e.pointerId, [e.clientX, e.clientY]); L.setPointerCapture(e.pointerId); });
  L.addEventListener("pointermove", (e) => { const p = looks.get(e.pointerId); if (!p) return; camYaw -= (e.clientX - p[0]) * 0.0055 * SET.sens; camPitch = clamp(camPitch + (e.clientY - p[1]) * 0.004 * SET.sens * (SET.invY ? -1 : 1), 0.05, 0.9); looks.set(e.pointerId, [e.clientX, e.clientY]); });
  const le = (e) => looks.delete(e.pointerId); L.addEventListener("pointerup", le); L.addEventListener("pointercancel", le);
  const hold = (id, on, off) => { const b = $(id); b.addEventListener("pointerdown", (e) => { e.preventDefault(); b.classList.add("down"); b.setPointerCapture(e.pointerId); on(); }); const up = () => { b.classList.remove("down"); off && off(); }; b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); };
  hold("fireBtn", () => (firing = true), () => (firing = false));
  hold("actBtn", () => (actQ = true));
  hold("jumpBtn", () => { jumpQ = true; keys[" "] = true; }, () => (keys[" "] = false));
  hold("wepBtn", () => cycleWeapon());
  hold("gasBtn", () => (pedal.gas = true), () => (pedal.gas = false));
  hold("steerL", () => (pedal.left = true), () => (pedal.left = false));
  hold("steerR", () => (pedal.right = true), () => (pedal.right = false));
  // steering wheel: turn it with your thumb, it springs back when you let go
  const Wh = $("wheel"); let wid = null, wa0 = 0, wv0 = 0;
  const ang = (e) => { const r = Wh.getBoundingClientRect(); return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))); };
  Wh.addEventListener("pointerdown", (e) => { wid = e.pointerId; Wh.setPointerCapture(e.pointerId); wa0 = ang(e); wv0 = pedal.wheel; });
  Wh.addEventListener("pointermove", (e) => { if (e.pointerId !== wid) return; pedal.wheel = clamp(wv0 + angDiff(wa0, ang(e)), -2.2, 2.2); });
  const wend = (e) => { if (e.pointerId === wid) { wid = null; pedal.wheelHeld = false; } }; Wh.addEventListener("pointerup", wend); Wh.addEventListener("pointercancel", wend);
  Wh.addEventListener("pointerdown", () => (pedal.wheelHeld = true));
  hold("brakeBtn", () => (pedal.brake = true), () => (pedal.brake = false));
  $("menuBtn").addEventListener("click", openMissions);
})();
function cycleWeapon() { for (let k = 1; k <= WEAPONS.length; k++) { const w = (player.weapon + k) % WEAPONS.length; if (player.ammo[w] > 0) { player.weapon = w; break; } } updateHud(); }

// ---------------- sound (made in code) ----------------
let ac = null, nb = null, master = null;
function audio() { if (!SAVE.sound) return null; if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = SET.vol; master.connect(ac.destination); nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } catch (e) { return null; } } if (ac.state === "suspended") ac.resume(); return ac; }
function burst(vol, dur, f0, f1, type = "lowpass") { const a = audio(); if (!a) return; const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime; s.buffer = nb; f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur); }
function tone(fr, dur, type = "square", vol = 0.05, slide = 0) { const a = audio(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(fr, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, fr + slide), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur); }
const sfx = {
  shot: (k, w) => { const W = WEAPONS[w || 0]; burst(0.35 * k * W.snd, 0.12 + W.snd * 0.08, 4200, 200); burst(0.2 * k, 0.04, 7000, 2500, "highpass"); tone(90, 0.12, "sine", 0.25 * k * W.snd, -50); },
  hit: () => tone(1400, 0.04, "square", 0.04), crash: (k) => burst(0.3 * k, 0.3, 1800, 120), alarm: () => { tone(880, 0.15, "square", 0.05); setTimeout(() => tone(660, 0.18, "square", 0.05), 160); },
  mission: () => { tone(523, 0.12, "triangle", 0.08); setTimeout(() => tone(784, 0.2, "triangle", 0.08), 130); }, win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.08), i * 110)),
  fail: () => [400, 300, 200].forEach((f, i) => setTimeout(() => tone(f, 0.22, "sawtooth", 0.05), i * 160)), boom: () => { burst(0.6, 1.2, 900, 40); tone(60, 0.8, "sine", 0.4, -30); }, coin: () => tone(1320, 0.08, "triangle", 0.06),
};
let eng = null, sir = null;
// engine: a looped recording-like cycle built from firing pulses (4 cylinders), pitched with the revs
function makeEngineBuffer(a) {
  const sr = a.sampleRate, f0 = 30, cycles = 24, len = Math.round(sr * cycles / f0), buf = a.createBuffer(1, len, sr), d = buf.getChannelData(0);
  let lp = 0, rnd = 0;
  for (let c = 0; c < cycles; c++) {
    const amp = 0.75 + Math.random() * 0.35, start = Math.round(c * sr / f0), plen = Math.round(sr / f0);
    for (let i = 0; i < plen && start + i < len; i++) {
      const t = i / sr, env = Math.exp(-t * 70) * amp;
      rnd = rnd * 0.6 + (Math.random() * 2 - 1) * 0.4;
      d[start + i] += env * (Math.sin(2 * Math.PI * 62 * t) * 0.8 + Math.sin(2 * Math.PI * 124 * t) * 0.3 + rnd * 0.55);
    }
  }
  for (let i = 0; i < len; i++) { lp += (d[i] - lp) * 0.25; d[i] = lp; }
  let mx = 0; for (let i = 0; i < len; i++) mx = Math.max(mx, Math.abs(d[i])); for (let i = 0; i < len; i++) d[i] /= mx;
  return buf;
}
function engineSound(on, rpm, thr) {
  const a = audio(); if (!a) return;
  if (!eng) {
    const src = a.createBufferSource(); src.buffer = makeEngineBuffer(a); src.loop = true;
    const lo = a.createBiquadFilter(); lo.type = "lowpass"; lo.frequency.value = 900; lo.Q.value = 0.7;
    const body = a.createBiquadFilter(); body.type = "peaking"; body.frequency.value = 160; body.gain.value = 6; body.Q.value = 1;
    const g = a.createGain(); g.gain.value = 0;
    const hum = a.createOscillator(); hum.type = "sine"; const hg = a.createGain(); hg.gain.value = 0; hum.connect(hg).connect(master); hum.start();
    src.connect(body).connect(lo).connect(g).connect(master); src.start();
    eng = { src, lo, g, hum, hg };
  }
  const t = a.currentTime, r = clamp(rpm, 0, 1), th = thr == null ? 0.5 : thr;
  eng.src.playbackRate.setTargetAtTime(0.75 + r * 2.6, t, 0.06);
  eng.lo.frequency.setTargetAtTime(500 + r * 1500 + th * 900, t, 0.08);
  eng.hum.frequency.setTargetAtTime((0.75 + r * 2.6) * 30, t, 0.06);
  eng.g.gain.setTargetAtTime(on ? 0.1 + r * 0.07 + th * 0.06 : 0, t, 0.05);
  eng.hg.gain.setTargetAtTime(on ? 0.03 : 0, t, 0.05);
}
function sirenSound(level) {
  const a = audio(); if (!a) return;
  if (!sir) { const o = a.createOscillator(), g = a.createGain(); o.type = "triangle"; g.gain.value = 0; o.connect(g).connect(master); o.start(); sir = { o, g }; }
  const t = performance.now() / 1000; sir.o.frequency.value = 650 + Math.sin(t * 5) * 220; sir.g.gain.value = clamp(level, 0, 1) * 0.035;
}

// ---------------- effects ----------------
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.9 });
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
function tracer(a, b) { const g = new THREE.BufferGeometry().setFromPoints([a, b]); const l = new THREE.Line(g, tracerMat.clone()); scene.add(l); fx.push({ o: l, life: 0.06, max: 0.06, kind: "line" }); }
function puff(x, y, z, c, s, life) { const m = new THREE.Mesh(BOXG, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8 })); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.set(R() * 3, R() * 3, 0); scene.add(m); fx.push({ o: m, life, max: life, kind: "puff", grow: s * 2.5, vy: 1.2 }); }
function explode(x, z) {
  sfx.boom(); shake = 1;
  for (let i = 0; i < 18; i++) puff(x + (R() - 0.5) * 3, 0.8 + R() * 2, z + (R() - 0.5) * 3, i < 9 ? 0xff8a1e : 0x3a3530, 1 + R(), 0.8 + R() * 0.8);
  for (const p of [...peds, ...cops]) if (!p.dead && Math.hypot(p.x - x, p.z - z) < 7) hurtPed(p, 200, true);
  if (!player.car && Math.hypot(player.x - x, player.z - z) < 7) hurtPlayer(70);
  for (const c of cars) if (!c.dead && Math.hypot(c.x - x, c.z - z) < 7 && c !== player.car) c.hp -= 60;
}
let shake = 0;

// ---------------- combat ----------------
const _ray = new THREE.Raycaster();
function shoot() {
  const W = WEAPONS[player.weapon]; if (player.fireT > 0 || player.ammo[player.weapon] <= 0) return;
  player.fireT = W.rate; if (isFinite(player.ammo[player.weapon])) player.ammo[player.weapon]--;
  player.aimT = 1.2; sfx.shot(1, player.weapon);
  const from = new THREE.Vector3(px(), (player.car ? 1.6 : player.y + 1.55), pz());
  // aim where the crosshair points
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const aimPoint = camera.position.clone().addScaledVector(dir, 40);
  let base = aimPoint.sub(from).normalize();
  if (IS_TOUCH || SET.assist) { let best = null, bs = 0.93; for (const e of [...cops, ...gang, ...peds]) { if (e.dead) continue; const v = new THREE.Vector3(e.x - from.x, 1.2 - from.y, e.z - from.z), l = v.length(); if (l > 40 || l < 1) continue; v.divideScalar(l); const dd = v.dot(base) - (e.kind === "ped" ? 0.03 : 0); if (dd > bs && !rayBlocked(from.x, from.z, e.x, e.z)) { bs = dd; best = v; } } if (best) base = best; }
  for (let p = 0; p < (W.pel || 1); p++) {
    const d = base.clone(); d.x += (R() - 0.5) * W.spread * 2; d.y += (R() - 0.5) * W.spread; d.z += (R() - 0.5) * W.spread * 2; d.normalize();
    const hit = castShot(from, d, W.range, true);
    tracer(from.clone().addScaledVector(d, 0.8), from.clone().addScaledVector(d, hit.t));
    if (hit.ent) { hurtPed(hit.ent, W.dmg); sfx.hit(); }
    else if (hit.car) { hit.car.hp -= W.dmg * 0.5; puff(from.x + d.x * hit.t, from.y + d.y * hit.t, from.z + d.z * hit.t, 0xffd27a, 0.15, 0.2); }
    else if (hit.t < W.range) puff(from.x + d.x * hit.t, from.y + d.y * hit.t, from.z + d.z * hit.t, 0xb0a890, 0.25, 0.35);
  }
  // gunshots scare people and draw the police
  for (const p of peds) if (!p.dead && p.kind === "ped" && Math.hypot(p.x - px(), p.z - pz()) < 35) p.panic = 6;
  if (cops.length || copsNear(40)) addWanted(wanted.stars === 0 ? 1 : 0);
}
function castShot(from, d, range, byPlayer) {
  let best = { t: range };
  // buildings
  for (let t = 1; t < range; t += 1) { const x = from.x + d.x * t, y = from.y + d.y * t, z = from.z + d.z * t; if (y < 0) { best = { t }; break; } let b = false; for (const s of nearSolids(x, z)) if (y < s.h && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) { b = true; break; } if (b) { best = { t }; break; } }
  const test = (e, r, h) => { const ox = e.x - from.x, oz = e.z - from.z, t = ox * d.x + oz * d.z; if (t < 0 || t > best.t) return; const cx = from.x + d.x * t - e.x, cz = from.z + d.z * t - e.z, y = from.y + d.y * t - (e.y || 0); if (cx * cx + cz * cz < r * r && y > 0 && y < h) best = { t, ent: e }; };
  if (byPlayer) { for (const p of peds) if (!p.dead) test(p, 0.45, 2.0); for (const p of cops) if (!p.dead) test(p, 0.45, 2.0); }
  for (const c of cars) { if (c === player.car || c.dead) continue; const ox = c.x - from.x, oz = c.z - from.z, t = ox * d.x + oz * d.z; if (t < 0 || t > best.t) continue; const cx = from.x + d.x * t - c.x, cz = from.z + d.z * t - c.z; if (cx * cx + cz * cz < 1.6 * 1.6 && from.y + d.y * t < 2) best = { t, car: c }; }
  return best;
}
function hurtPed(p, dmg, silent) {
  if (p.dead) return; p.hp -= dmg; p.panic = 8;
  if (p.hp <= 0) {
    p.dead = true; p.deadT = 0;
    if (p.kind === "ped") { addWanted(wanted.stars < 1 ? 1 : 0); if (R() < 0.6) dropCash(p.x, p.z, 20 + Math.floor(R() * 60)); }
    if (p.kind === "cop") addWanted(1);
    if (p.kind === "gang") { const n = gang.filter((g) => !g.dead).length; const el = $("gangN"); if (el) el.textContent = n; dropCash(p.x, p.z, 100); }
  }
}
function hurtPlayer(dmg) {
  if (player.dead) return;
  if (player.armor > 0) { const a = Math.min(player.armor, dmg * 0.7); player.armor -= a; dmg -= a; }
  player.hp -= dmg; hurtFx = 1; if (player.hp <= 0) die("انقتلت!", PLACES.hospital, "المستشفى");
  updateHud();
}
const cash = [];
const cashG = new THREE.BoxGeometry(0.5, 0.25, 0.3);
function dropCash(x, z, n) { const m = new THREE.Mesh(cashG, new THREE.MeshStandardMaterial({ color: 0x3fc04a, emissive: 0x0f4a12 })); m.position.set(x, 0.5, z); scene.add(m); cash.push({ m, x, z, n, t: 0 }); }
const copsNear = (r) => cars.some((c) => c.type === "police" && !c.dead && Math.hypot(c.x - px(), c.z - pz()) < r);

// ---------------- dying / busted ----------------
let hurtFx = 0, busyT = 0;
function die(title, place, where) {
  if (busyT > 0) return; busyT = 3.2; player.dead = true; sfx.fail();
  if (mission) failMission(title === "انقبض عليك!" ? "الشرطة قبضت عليك" : "انقتلت");
  const lose = Math.min(SAVE.money, title === "انقبض عليك!" ? 300 : 150); SAVE.money -= lose; save();
  $("fade").textContent = title; setTimeout(() => $("fade").classList.add("on"), 900);
  setTimeout(() => {
    if (player.car) { player.car.driver = null; player.car = null; }
    player.v.g.visible = true; engineSound(false, 0); document.body.classList.remove("driving");
    const p = frontOf(place); player.x = p.x; player.z = p.z; player.y = 0; player.hp = 100; player.dead = false; wanted.stars = 0; camYaw = Math.PI;
    for (const c of cars.filter((c) => c.type === "police")) removeCar(c); for (const k of cops) removePerson(k); cops.length = 0;
    toast(where, "-$" + lose); $("fade").classList.remove("on"); updateHud();
  }, 2400);
}
function removeCar(c) { scene.remove(c.mesh.g); const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); }

// ---------------- updates ----------------
const GRAV = 22;
function updatePlayer(dt) {
  if (player.dead) return;
  player.fireT = Math.max(0, player.fireT - dt); player.aimT = Math.max(0, player.aimT - dt);
  if (firing || keys["mouse"]) { player.aimT = Math.max(player.aimT, 0.8); shoot(); }
  if (player.car) { driveCar(player.car, dt, playerCarInput()); if (actQ) exitCar(); actQ = false; return; }
  // walk relative to the camera
  let mx = (keys["d"] || keys["arrowright"] ? 1 : 0) - (keys["a"] || keys["arrowleft"] ? 1 : 0) + joy.x, mz = (keys["w"] || keys["arrowup"] ? 1 : 0) - (keys["s"] || keys["arrowdown"] ? 1 : 0) - joy.y;
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  const run = !IS_TOUCH ? !keys["shift"] : l > 0.62;
  const sp = IS_TOUCH ? (run ? 6.4 : 3.4 * Math.min(1, l / 0.62)) : (run ? 6.8 : 3.4) * Math.min(1, l);
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -fz, rz = fx; // camera forward and camera right
  const tvx = (fx * mz + rx * mx) * sp, tvz = (fz * mz + rz * mx) * sp, ka = 1 - Math.exp(-dt * 12);
  const vx = lerp(player.vx || 0, tvx, ka), vz = lerp(player.vz || 0, tvz, ka);
  player.vx = vx; player.vz = vz; player.x += vx * dt; player.z += vz * dt; player.speed = Math.hypot(vx, vz);
  player.fwdPush = l > 0.2 ? mz / l : 0;
  collide(player, 0.45);
  // face where you walk, or where you shoot
  const ta = player.aimT > 0 ? camYaw : player.speed > 0.3 ? Math.atan2(vx, vz) : player.a;
  player.a += angDiff(player.a, ta) * Math.min(1, dt * (player.aimT > 0 ? 22 : 12));
  if (jumpQ && player.onGround) { player.vy = 7.5; player.onGround = false; }
  jumpQ = false;
  player.vy -= GRAV * dt; player.y += player.vy * dt; const floor = onPavement(player.x, player.z) ? 0.2 : 0; if (player.y <= floor) { player.y = floor; player.vy = 0; player.onGround = true; }
  // steal / get in
  const c = nearestCar(player.x, player.z, 3.6);
  $("actBtn").hidden = !c; if (c) $("actBtn").textContent = c.driver ? "سرقة" : "اركب";
  if (actQ && c) enterCar(c);
  actQ = false;
  // cash pickup
  for (let i = cash.length - 1; i >= 0; i--) { const k = cash[i]; if (Math.hypot(k.x - player.x, k.z - player.z) < 1.3) { SAVE.money += k.n; save(); sfx.coin(); scene.remove(k.m); cash.splice(i, 1); updateHud(); } }
}
const onPavement = (x, z) => { const fx = ((x % CELL) + CELL) % CELL, fz = ((z % CELL) + CELL) % CELL; return fx > ROAD && fz > ROAD; };
function nearestCar(x, z, r) { let best = null, bd = r; for (const c of cars) { if (c.dead || c.type === "police" && c.driver === "cop" && wanted.stars > 0 && false) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } } return best; }
function enterCar(c) {
  if (c.driver === "npc") { // throw the driver out
    const p = { v: makePerson({ kind: "civ" }), x: c.x + Math.cos(c.a) * 2.2, z: c.z - Math.sin(c.a) * 2.2, a: 0, hp: 30, dead: false, deadT: 0, panic: 10, speed: 2, kind: "ped", bx: -1 };
    peds.push(p); if (copsNear(60)) addWanted(1);
  }
  if (c.type === "police") addWanted(2);
  c.driver = "player"; c.ai = null; player.car = c; player.v.g.visible = false; document.body.classList.add("driving"); lookIdle = 9; $("actBtn").textContent = "انزل"; tone(300, 0.08, "square", 0.04);
  camYaw = c.a;
}
function exitCar(force) {
  const c = player.car; if (!c) return; if (!force && Math.hypot(c.vx, c.vz) > 8) return; // too fast to jump out
  player.car = null; c.driver = null; player.x = c.x + Math.cos(c.a) * 1.9; player.z = c.z - Math.sin(c.a) * 1.9; player.y = 0.2; collide(player, 0.45);
  player.v.g.visible = true; engineSound(false, 0); camYaw = c.a; document.body.classList.remove("driving"); pedal.gas = pedal.brake = pedal.left = pedal.right = false; pedal.wheel = 0;
}
function playerCarInput() {
  let thr = (keys["w"] || keys["arrowup"] ? 1 : 0) - (keys["s"] || keys["arrowdown"] ? 1 : 0);
  const jx = Math.abs(joy.x) < 0.12 ? 0 : (joy.x - Math.sign(joy.x) * 0.12) / 0.88;
  let steer = (keys["a"] || keys["arrowleft"] ? 1 : 0) - (keys["d"] || keys["arrowright"] ? 1 : 0) - jx * Math.abs(jx) * SET.steer;
  if (IS_TOUCH) {
    if (SET.drive === "stick") thr -= joy.y; else thr += (pedal.gas ? 1 : 0) - (pedal.brake ? 1 : 0);
    if (SET.drive === "buttons") { const want = (pedal.left ? 1 : 0) - (pedal.right ? 1 : 0); pedal.btnSteer = lerp(pedal.btnSteer, want, 0.18); steer = pedal.btnSteer * SET.steer; }
    else if (SET.drive === "wheel") steer = clamp(-pedal.wheel / 1.6, -1, 1) * SET.steer;
    else if (SET.drive === "tilt") { const t = Math.abs(pedal.tilt) < 0.06 ? 0 : pedal.tilt; steer = clamp(-t * 1.25, -1, 1) * SET.steer; }
  }
  return { thr: clamp(thr, -1, 1), steer: clamp(steer, -1, 1), hb: !!keys[" "] };
}
function driveCar(c, dt, inp) {
  if (c.dead) { c.vx *= 0.95; c.vz *= 0.95; return; }
  if (c.burning) inp = { thr: inp.thr * 0.5, steer: inp.steer, hb: inp.hb };
  const T = c.T, fx = Math.sin(c.a), fz = Math.cos(c.a);
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * fz - c.vz * fx;
  if (inp.thr > 0) vf += T.acc * inp.thr * dt * (vf < 0 ? 2.5 : 1) * clamp(1 - vf / T.max, 0, 1);
  else if (inp.thr < 0) { if (vf > 0.5) vf += inp.thr * 22 * dt; else vf = Math.max(-T.max * 0.4, vf + inp.thr * T.acc * 0.7 * dt); }
  else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 4 * dt);
  if (inp.hb) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 9 * dt);
  c.steer = lerp(c.steer, inp.steer, 1 - Math.exp(-dt * 7));
  const grip = inp.hb ? 1.2 : 7;
  vl *= Math.exp(-dt * grip);
  c.a += c.steer * T.steer * clamp(vf / 7, -1, 1) * dt * (1.9 - Math.min(1, Math.abs(vf) / T.max) * 0.8) * (inp.hb ? 1.5 : 1);
  const nfx = Math.sin(c.a), nfz = Math.cos(c.a);
  c.vx = nfx * vf + nfz * vl; c.vz = nfz * vf - nfx * vl;
  moveCar(c, dt);
  c.spin += vf * dt / 0.38;
}
function moveCar(c, dt) {
  const sp = Math.hypot(c.vx, c.vz);
  c.x += c.vx * dt; c.z += c.vz * dt;
  // two circles (front and back) against buildings
  const fx = Math.sin(c.a), fz = Math.cos(c.a), off = c.T.len / 2 - c.T.wid / 2, r = c.T.wid / 2 + 0.05;
  let hit = false;
  for (const s of [1, -1]) { const o = { x: c.x + fx * off * s, z: c.z + fz * off * s }, ox = o.x, oz = o.z, n = collide(o, r); if (n) { c.x += o.x - ox; c.z += o.z - oz; const vn = c.vx * n.x + c.vz * n.z; if (vn < 0) { c.vx -= 1.4 * vn * n.x; c.vz -= 1.4 * vn * n.z; hit = Math.max(hit || 0, -vn); } } }
  if (hit > 6) { c.hp -= (hit - 6) * 1.3; if (c === player.car) { sfx.crash(clamp(hit / 15, 0.2, 1)); shake = Math.min(1, hit / 14); } c.vx *= 0.7; c.vz *= 0.7; }
  // cars bump each other
  for (const o of cars) { if (o === c) continue; const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = (c.T.len + o.T.len) * 0.36; if (d > 0.01 && d < m) { const nx = dx / d, nz = dz / d, pen = (m - d) / 2; c.x -= nx * pen; c.z -= nz * pen; o.x += nx * pen; o.z += nz * pen; const rel = (c.vx - o.vx) * nx + (c.vz - o.vz) * nz; if (rel > 0) { c.vx -= rel * nx * 0.6; c.vz -= rel * nz * 0.6; o.vx += rel * nx * 0.6; o.vz += rel * nz * 0.6; if (rel > 6) { c.hp -= (rel - 6) * 0.8; o.hp -= (rel - 6) * 0.8; if (c === player.car || o === player.car) { sfx.crash(clamp(rel / 15, 0.2, 1)); if (o.type === "police" || c.type === "police") addWanted(wanted.stars < 1 ? 1 : 0); } } if (o.ai && o.ai.kind === "traffic" && (c === player.car)) o.ai.wait = 3; } } }
  // run people over
  if (sp > 4) for (const p of [...peds, ...cops]) { if (p.dead) continue; const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < 1.6) { hurtPed(p, sp * 5); p.x += c.vx * 0.1; p.z += c.vz * 0.1; if (c === player.car) sfx.crash(0.3); } else if (d < 9 && p.kind === "ped" && c === player.car) p.panic = Math.max(p.panic, 2); }
  // wrecked: the engine catches fire and burns for a while before it blows up
  if (c.hp <= 0 && !c.burning && !c.dead) { c.burning = true; c.burnT = 10; if (c === player.car) { toast("🔥 السيارة تحترق!", "انزل منها قبل ما تنفجر"); } }
}
const BURNT = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 });
function burnCar(c) { c.mesh.g.traverse((o) => { if (o.isMesh && !(c.mesh.lights || []).includes(o)) o.material = BURNT; }); }
let trafT = 0;
function recycleTraffic(dt) {
  trafT -= dt; if (trafT > 0) return; trafT = 0.2;
  const far = cars.find((c) => c.driver === "npc" && c.ai && c.ai.kind === "traffic" && Math.hypot(c.x - px(), c.z - pz()) > 140);
  if (!far) return;
  for (let k = 0; k < 10; k++) {
    const a = R() * TAU, d = 55 + R() * 65, horiz = R() < 0.5, x0 = px() + Math.cos(a) * d, z0 = pz() + Math.sin(a) * d;
    const i = clamp(Math.round(((horiz ? z0 : x0) - ROAD / 2) / CELL), 0, N), j = clamp(Math.floor((horiz ? x0 : z0) / CELL), 0, N - 1);
    const dir = horiz ? (R() < 0.5 ? 0 : 2) : (R() < 0.5 ? 1 : 3);
    const ai = { kind: "traffic", dir, ix: 0, iz: 0, wait: 0 }; let x, z;
    if (horiz) { z = roadC(i); x = blockX0(j) + BLOCK * R(); ai.iz = i; ai.ix = dir === 0 ? j + 1 : j; } else { x = roadC(i); z = blockX0(j) + BLOCK * R(); ai.ix = i; ai.iz = dir === 1 ? j + 1 : j; }
    const dd = Math.hypot(x - px(), z - pz()); if (dd < 45) continue;
    // in front of the camera and in the open? skip, so cars never pop in where you look
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw); if (((x - px()) * fx + (z - pz()) * fz) / dd > 0.5 && !rayBlocked(px(), pz(), x, z)) continue;
    if (cars.some((o) => o !== far && Math.hypot(o.x - x, o.z - z) < 8)) continue;
    far.ai = ai; far.x = x; far.z = z; far.vx = far.vz = 0; far.a = Math.atan2(DIRS[dir][0], DIRS[dir][1]); const t = laneTarget(far); if (horiz) far.z = t.z; else far.x = t.x;
    far.hp = far.T.hp; return;
  }
}
function updateTraffic(c, dt) {
  const ai = c.ai; if (ai.wait > 0) { ai.wait -= dt; driveCar(c, dt, { thr: -0.3, steer: 0 }); return; }
  const t = laneTarget(c), dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz);
  if (d < 3) { pickNextDir(c); return; }
  // slow down behind other cars or people in front
  const fx = Math.sin(c.a), fz = Math.cos(c.a); let block = false;
  for (const o of cars) { if (o === c) continue; const ox = o.x - c.x, oz = o.z - c.z, ahead = ox * fx + oz * fz, side = Math.abs(ox * fz - oz * fx); if (ahead > 0 && ahead < 9 && side < 2.2) { block = true; break; } }
  if (!block && !player.car) { const ox = player.x - c.x, oz = player.z - c.z, ahead = ox * fx + oz * fz, side = Math.abs(ox * fz - oz * fx); if (ahead > 0 && ahead < 7 && side < 1.8) block = true; }
  const want = Math.atan2(dx, dz), err = angDiff(c.a, want), sp = c.vx * fx + c.vz * fz;
  const target = block ? 0 : Math.abs(err) > 0.4 ? 6 : 11;
  driveCar(c, dt, { thr: sp < target ? 0.6 : sp > target + 1 ? -0.6 : 0, steer: clamp(err * 2.2, -1, 1) });
}
function updatePolice(c, dt) {
  const ai = c.ai; if (c.dead) return;
  // lights and siren
  const t = performance.now() / 1000, on = wanted.stars > 0;
  if (c.mesh.lights) { const a = on && Math.sin(t * 14) > 0, b = on && !a; c.mesh.lights[0].material.emissiveIntensity = a ? 3 : 0; c.mesh.lights[1].material.emissiveIntensity = b ? 3 : 0; if (c.mesh.real) { c.mesh.lights[0].visible = a; c.mesh.lights[1].visible = b; } }
  if (!on) { driveCar(c, dt, { thr: 0, steer: 0, hb: true }); return; }
  const tx = px(), tz = pz(), dist = Math.hypot(tx - c.x, tz - c.z);
  // follow the road grid toward you, drive straight at you when close
  let goal = { x: tx, z: tz };
  if (dist > 28) { const me = nearestRoadPoint(c.x, c.z), you = nearestRoadPoint(tx, tz); let nx = me.ix, nz = me.iz; if (Math.abs(you.ix - me.ix) >= Math.abs(you.iz - me.iz)) nx += Math.sign(you.ix - me.ix); else nz += Math.sign(you.iz - me.iz); const onX = Math.abs(c.z - roadC(me.iz)) < 6, onZ = Math.abs(c.x - roadC(me.ix)) < 6; goal = Math.hypot(c.x - me.x, c.z - me.z) > 8 && !(onX && nx !== me.ix && nz === me.iz) && !(onZ && nz !== me.iz && nx === me.ix) ? { x: me.x, z: me.z } : { x: roadC(nx), z: roadC(nz) }; }
  if (ai.deployed && cops.some((k) => k.car === c && !k.dead) && dist < 60) { driveCar(c, dt, { thr: 0, steer: 0, hb: true }); return; }
  if (ai.deployed && !cops.some((k) => k.car === c && !k.dead)) ai.deployed = dist < 30;
  const want = Math.atan2(goal.x - c.x, goal.z - c.z); let err = angDiff(c.a, want);
  const sp = Math.hypot(c.vx, c.vz);
  if (ai.rev > 0) { ai.rev -= dt; driveCar(c, dt, { thr: -1, steer: -Math.sign(err) }); return; }
  if (sp < 1.5) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt);
  if (ai.stuck > 1.6) { ai.rev = 1.1; ai.stuck = 0; }
  // close and slow: officers get out and chase you on foot
  if (!ai.deployed && dist < 24 && (sp < 4 || dist < 13) && !player.car && !rayBlocked(c.x, c.z, tx, tz) && cops.filter((k) => !k.dead).length < 6) {
    ai.deployed = true;
    for (const side of [1, -1]) { const v = makePerson({ kind: "cop" }); if (!v) break; const k = { v, x: c.x + Math.cos(c.a) * 1.6 * side, z: c.z - Math.sin(c.a) * 1.6 * side, a: c.a, hp: 50, dead: false, deadT: 0, shootT: 0.8 + R(), kind: "cop", car: c, speed: 0 }; collide(k, 0.4); cops.push(k); }
  }
  const close = dist < 10 && !player.car;
  driveCar(c, dt, { thr: close ? (sp > 3 ? -1 : 0) : Math.abs(err) > 1.2 ? 0.5 : 1, steer: clamp(err * 2.5, -1, 1), hb: close || (Math.abs(err) > 1.4 && sp > 10) });
  // shoot from the window at 2+ stars
  ai.shootT -= dt;
  if (wanted.stars >= 2 && dist < 32 && ai.shootT <= 0 && !rayBlocked(c.x, c.z, tx, tz)) {
    ai.shootT = 1.4 - wanted.stars * 0.15 + R() * 0.6; const from = new THREE.Vector3(c.x, 1.5, c.z), to = new THREE.Vector3(tx + (R() - 0.5) * 2, 1.2, tz + (R() - 0.5) * 2);
    tracer(from, to); sfx.shot(clamp(1 - dist / 60, 0.2, 0.8), 0);
    if (R() < 0.45) { if (player.car) player.car.hp -= 6; else hurtPlayer(7); }
  }
  // busted: a cop right next to you while you stand still / sit in a stopped car
  if (dist < 6 && (!player.car ? player.speed < 1.5 : Math.hypot(player.car.vx, player.car.vz) < 1.5)) { bustT += dt; if (bustT > 2) { bustT = 0; die("انقبض عليك!", PLACES.police, "مركز الشرطة"); } }
}
let bustT = 0;
function updatePeds(dt) {
  for (const p of peds) {
    if (p.dead) { p.deadT += dt; animPerson(p.v, { dead: true, speed: 0 }, dt); continue; }
    if (p.kind === "gang") { updateGang(p, dt); continue; }
    if (p.panic > 0) {
      p.panic -= dt; const ax = p.x - px(), az = p.z - pz(), l = Math.hypot(ax, az) || 1; const sp = 5;
      p.x += ax / l * sp * dt; p.z += az / l * sp * dt; p.a = Math.atan2(ax, az); collide(p, 0.4);
      animPerson(p.v, { speed: sp, panic: true }, dt); continue;
    }
    if (p.bx < 0) { animPerson(p.v, { speed: 0 }, dt); continue; }
    const ox = p.x, oz = p.z; p.t += p.dir * p.speed * dt / (BLOCK - 3.2); const q = pedPathPoint(p, p.t);
    p.x = lerp(p.x, q.x, 1 - Math.exp(-dt * 4)); p.z = lerp(p.z, q.z, 1 - Math.exp(-dt * 4));
    const mv = Math.hypot(p.x - ox, p.z - oz) / dt; if (mv > 0.2) p.a = Math.atan2(p.x - ox, p.z - oz);
    animPerson(p.v, { speed: mv }, dt);
  }
  // recycle dead bodies far away / after a while
  for (let i = peds.length - 1; i >= 0; i--) { const p = peds[i]; if (p.dead && p.deadT > 25 && p.kind !== "gang") { removePerson(p); peds.splice(i, 1); } }
}
function removePerson(p) { if (p.v.human) disposeHuman(p.v); else scene.remove(p.v.g); }
// keep the streets around you busy: people far away move to a block near you (with a new face)
let recycleT = 0;
function recyclePeds(dt) {
  recycleT -= dt; if (recycleT > 0) return; recycleT = 0.4;
  const far = peds.find((p) => p.kind === "ped" && Math.hypot(p.x - px(), p.z - pz()) > 120);
  if (!far) return;
  const bx0 = Math.floor(px() / CELL), bz0 = Math.floor(pz() / CELL);
  for (let k = 0; k < 8; k++) {
    const bx = clamp(bx0 + Math.floor(R() * 5) - 2, 0, N - 1), bz = clamp(bz0 + Math.floor(R() * 5) - 2, 0, N - 1);
    const q = { bx, bz, t: R() * 4 }; const pt = pedPathPoint(q, q.t);
    if (Math.hypot(pt.x - px(), pt.z - pz()) < 40) continue;
    const v = makePerson({ kind: "civ" }); if (!v) return;
    removePerson(far); far.v = v; Object.assign(far, q, { x: pt.x, z: pt.z, hp: 30, dead: false, deadT: 0, panic: 0, dir: R() < 0.5 ? 1 : -1 });
    return;
  }
}
function updateCops(dt) {
  for (let i = cops.length - 1; i >= 0; i--) {
    const k = cops[i];
    if (k.dead) { k.deadT += dt; animPerson(k.v, { dead: true }, dt); if (k.deadT > 20) { removePerson(k); cops.splice(i, 1); } continue; }
    const tx = px(), tz = pz(), d = Math.hypot(tx - k.x, tz - k.z);
    if (wanted.stars === 0 || d > 140) { k.idle = (k.idle || 0) + dt; if (k.idle > 6 || d > 140) { removePerson(k); cops.splice(i, 1); continue; } animPerson(k.v, { speed: 0 }, dt); continue; }
    k.idle = 0;
    const want = Math.atan2(tx - k.x, tz - k.z); k.a += angDiff(k.a, want) * Math.min(1, dt * 8);
    const shooter = wanted.stars >= 2, stop = shooter ? 9 : 1.2;
    let sp = 0;
    if (d > stop) { sp = d > 14 ? 5.6 : 3; k.x += Math.sin(k.a) * sp * dt; k.z += Math.cos(k.a) * sp * dt; collide(k, 0.4); }
    k.shootT -= dt;
    if (shooter && d < 38 && k.shootT <= 0 && !rayBlocked(k.x, k.z, tx, tz)) {
      k.shootT = 1.2 + R() * 0.8; const from = new THREE.Vector3(k.x, 1.45, k.z), to = new THREE.Vector3(tx + (R() - 0.5) * 1.6, 1.2, tz + (R() - 0.5) * 1.6);
      tracer(from, to); sfx.shot(clamp(1 - d / 60, 0.2, 0.8), 0); if (R() < 0.38) { if (player.car) player.car.hp -= 5; else hurtPlayer(6); }
    }
    // an officer right next to you arrests you
    if (d < 1.9 && !player.dead && (!player.car || Math.hypot(player.car.vx, player.car.vz) < 2)) { k.cuff = (k.cuff || 0) + dt; if (k.cuff > 1.3) { k.cuff = 0; die("انقبض عليك!", PLACES.police, "مركز الشرطة"); } } else k.cuff = 0;
    animPerson(k.v, { speed: sp, aiming: shooter && d < 38, aimDir: new THREE.Vector3(tx - k.x, 0.1, tz - k.z).normalize() }, dt);
  }
}
function updateGang(p, dt) {
  const tx = px(), tz = pz(), d = Math.hypot(tx - p.x, tz - p.z);
  p.a = Math.atan2(tx - p.x, tz - p.z); p.shootT -= dt;
  let moving = 0;
  if (d > 14 && d < 60) { p.x += Math.sin(p.a) * 3 * dt; p.z += Math.cos(p.a) * 3 * dt; collide(p, 0.4); moving = 3; }
  if (d < 45 && p.shootT <= 0 && !rayBlocked(p.x, p.z, tx, tz)) {
    p.shootT = 1.1 + R() * 0.9; const from = new THREE.Vector3(p.x, 1.5, p.z), to = new THREE.Vector3(tx + (R() - 0.5) * 1.5, 1.2, tz + (R() - 0.5) * 1.5);
    tracer(from, to); sfx.shot(clamp(1 - d / 60, 0.2, 0.8), 0); if (R() < 0.4) { if (player.car) player.car.hp -= 5; else hurtPlayer(6); }
  }
  animPerson(p.v, { speed: moving, aiming: d < 50, aimDir: new THREE.Vector3(tx - p.x, 0.1, tz - p.z).normalize() }, dt);
}
function updateWanted(dt) {
  if (wanted.stars <= 0) { sirenSound(0); return; }
  // keep enough police cars around: 1 per star (max 5), more if you're fast
  const police = cars.filter((c) => c.type === "police" && !c.dead && c.driver === "cop");
  if (police.length < wanted.stars + 1 && R() < dt * 0.8) spawnCop();
  const seen = police.some((c) => Math.hypot(c.x - px(), c.z - pz()) < 60 && !rayBlocked(c.x, c.z, px(), pz()));
  if (seen) { wanted.cool = 0; } else { wanted.cool += dt; }
  const need = 8 + wanted.stars * 3;
  $("stars").classList.toggle("flash", !seen && wanted.cool > 1.5);
  if (wanted.cool > need) { wanted.stars = 0; wanted.cool = 0; toast("اختفيت عن الشرطة", ""); for (const c of police) c.driver = "cop-idle"; }
  const nearest = police.reduce((m, c) => Math.min(m, Math.hypot(c.x - px(), c.z - pz())), 999);
  sirenSound(clamp(1 - nearest / 120, 0, 1));
}

// ---------------- camera ----------------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(); let camAim = 0;
let camDistS = 4, lookIdle = 9, camLastYaw = 0;
function camBlocked(x, y, z, m) { for (const s of nearSolids(x, z)) if (y < s.h + m && x > s.x0 - m && x < s.x1 + m && z > s.z0 - m && z < s.z1 + m) return true; return y < 0.2; }
function updateCamera(dt) {
  let tx, ty, tz, dist, lookAhead, lookDown, pitch;
  // you looked around just now?
  if (Math.abs(angDiff(camLastYaw, camYaw)) > 1e-4) lookIdle = 0; else lookIdle += dt;
  if (player.car) {
    const c = player.car, sp = Math.hypot(c.vx, c.vz), fwd = c.vx * Math.sin(c.a) + c.vz * Math.cos(c.a);
    // swing in behind the car (or in front of it when reversing), not while you look around
    const behind = fwd < -2 ? c.a + Math.PI : c.a;
    if (lookIdle > 1.2) camYaw += angDiff(camYaw, behind) * Math.min(1, dt * (sp > 2 ? 2.8 : 1.2));
    tx = c.x; ty = 1.5; tz = c.z; dist = (7.6 + Math.min(sp, 30) * 0.06) * SET.camDist; pitch = 0.27; lookAhead = 3; lookDown = 0.2;
  } else {
    camAim = lerp(camAim, player.aimT > 0 ? 1 : 0, 1 - Math.exp(-dt * 8));
    // walking forward slowly turns the camera behind you
    if (lookIdle > 1.4 && player.speed > 1 && player.fwdPush > 0.6 && player.aimT <= 0) camYaw += angDiff(camYaw, player.a) * Math.min(1, dt * 1.3);
    const sh = 0.45 + camAim * 0.2;
    tx = player.x - Math.cos(camYaw) * sh; ty = player.y + 1.62; tz = player.z + Math.sin(camYaw) * sh;
    dist = (4.2 - camAim * 1.6) * SET.camDist; pitch = camPitch; lookAhead = 2.2; lookDown = -0.12;
  }
  camLastYaw = camYaw;
  const yaw = camYaw, cp = Math.cos(pitch), sp2 = Math.sin(pitch);
  const dx = -Math.sin(yaw) * cp, dy = sp2, dz = -Math.cos(yaw) * cp;
  // how far back can the camera go before it hits a wall? (fine steps)
  let free = dist; const n = 24;
  for (let i = 1; i <= n; i++) { const d = dist * i / n; if (camBlocked(tx + dx * d, ty + dy * d, tz + dz * d, 0.35)) { free = Math.max(0, dist * (i - 1) / n); break; } }
  // pull in fast, ease back out slowly: no popping
  camDistS = free < camDistS ? lerp(camDistS, free, 1 - Math.exp(-dt * 25)) : lerp(camDistS, free, 1 - Math.exp(-dt * 3));
  let d = Math.max(camDistS, 0.9), up = 0;
  if (camDistS < 1.6 && !player.car) up = (1.6 - camDistS) * 0.9; // tight spot: rise over the shoulder so you still see yourself
  const want = new THREE.Vector3(tx + dx * d, ty + dy * d + up, tz + dz * d);
  const k = 1 - Math.exp(-dt * (player.car ? 10 : 18));
  if (!camPos.lengthSq() || camPos.distanceTo(want) > 30) camPos.copy(want); else camPos.lerp(want, k);
  shake = Math.max(0, shake - dt * 2.5);
  camera.position.copy(camPos); if (shake > 0) camera.position.add(new THREE.Vector3((R() - 0.5) * shake * 0.3, (R() - 0.5) * shake * 0.3, 0));
  camLook.set(tx + Math.sin(yaw) * lookAhead, ty + lookDown, tz + Math.cos(yaw) * lookAhead);
  camera.lookAt(camLook);
  sun.position.set(tx + 40, 80, tz + 30); sun.target.position.set(tx, 0, tz);
}

// ---------------- sync meshes ----------------
function syncAll(dt) {
  for (const c of cars) {
    const g = c.mesh.g; g.position.set(c.x, 0, c.z); g.rotation.y = c.a;
    const vf = c.vx * Math.sin(c.a) + c.vz * Math.cos(c.a);
    for (let i = 0; i < c.mesh.wheels.length; i++) { const w = c.mesh.wheels[i]; w.rotation.order = "YXZ"; w.rotation.x = c.spin; if (i < 2) w.rotation.y = c.steer * 0.45; }
    c.mesh.body.rotation.z = lerp(c.mesh.body.rotation.z, -c.steer * clamp(vf / 25, -1, 1) * 0.05, 0.2);
    { const hx = c.x + Math.sin(c.a) * c.T.len * 0.32, hz = c.z + Math.cos(c.a) * c.T.len * 0.32, near = Math.abs(c.x - camera.position.x) + Math.abs(c.z - camera.position.z) < 120;
      if (!c.dead && !c.burning && c.hp < c.T.hp * 0.4 && near && R() < dt * (c.hp < c.T.hp * 0.2 ? 10 : 4)) puff(hx + (R() - 0.5) * 0.6, 1.2, hz + (R() - 0.5) * 0.6, c.hp < c.T.hp * 0.2 ? 0x2e2b28 : 0x9a9690, 0.45, 1.4); // smoke from the bonnet
      if (c.burning) { c.burnT -= dt; if (near && R() < dt * 16) puff(hx + (R() - 0.5), 1.1 + R() * 0.4, hz + (R() - 0.5), R() < 0.6 ? 0xff7a1e : 0x2a2622, 0.6, 0.8);
        if (c.burnT <= 0) { c.burning = false; c.dead = true; burnCar(c); explode(c.x, c.z); if (c === player.car) { exitCar(true); hurtPlayer(60); } } } }
  }
  const pv = player.v; if (pv && !player.car) { pv.g.position.set(player.x, player.y, player.z); pv.g.rotation.y = player.a; if (pv.human) { pv.armed = true; pv.gunKind = ["pistol", "rifle", "shotgun"][player.weapon]; } const fwd = Math.sin(player.a) * player.vx + Math.cos(player.a) * player.vz, side = Math.cos(player.a) * player.vx - Math.sin(player.a) * player.vz; animPerson(pv, { aimDir: camera.getWorldDirection(new THREE.Vector3()), strafe: Math.abs(side) > Math.abs(fwd), speed: player.speed, aiming: player.aimT > 0, pitch: -camPitch * 0.6 + 0.25, inAir: !player.onGround }, dt); }
  const cx0 = px(), cz0 = pz();
  for (const c of cars) c.mesh.g.visible = Math.abs(c.x - cx0) + Math.abs(c.z - cz0) < 210;
  for (const p of cops) { p.v.g.position.set(p.x, onPavement(p.x, p.z) ? 0.2 : 0, p.z); p.v.g.rotation.y = p.a; }
  for (const p of peds) p.v.g.visible = Math.abs(p.x - cx0) + Math.abs(p.z - cz0) < 95;
  for (const p of peds) { p.v.g.position.set(p.x, onPavement(p.x, p.z) ? 0.2 : 0, p.z); p.v.g.rotation.y = p.a; }
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.life -= dt; const k = f.life / f.max; f.o.material.opacity = Math.max(0, k) * 0.9; if (f.kind === "puff") { const s = f.grow * (1.2 - k * 0.6); f.o.scale.setScalar(s); f.o.position.y += f.vy * dt; } if (f.life <= 0) { scene.remove(f.o); f.o.geometry !== BOXG && f.o.geometry.dispose(); fx.splice(i, 1); } }
  for (const k of cash) { k.t += dt; k.m.rotation.y = k.t * 3; k.m.position.y = 0.6 + Math.sin(k.t * 4) * 0.12; }
  // mission beacons: tall glowing pillars
  updateBeacons();
}
const beaconG = new THREE.CylinderGeometry(1.2, 1.2, 40, 16, 1, true); beaconG.translate(0, 20, 0);
const beaconMats = { y: new THREE.MeshBasicMaterial({ color: 0xffc21e, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }), b: new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }) };
const beaconPool = []; let beaconN = 0;
function beacon(x, z, kind, r = 1.2) { let b = beaconPool[beaconN]; if (!b) { b = new THREE.Mesh(beaconG, beaconMats.y); scene.add(b); beaconPool.push(b); } b.visible = true; b.material = beaconMats[kind]; b.position.set(x, 0, z); b.scale.set(r / 1.2, 1, r / 1.2); beaconN++; }
function updateBeacons() {
  beaconN = 0;
  if (mission) { const s = mission.def.steps[mission.step]; if (s && s.at) { const p = s.at(); beacon(p.x, p.z, "b", Math.min(3, s.r * 0.5)); } }
  else { const i = SAVE.done; if (i < MISSIONS.length) { const p = missionStartPoint(i); beacon(p.x, p.z, "y", 1.5); } }
  for (let i = beaconN; i < beaconPool.length; i++) beaconPool[i].visible = false;
  const t = performance.now() / 600; beaconMats.y.opacity = beaconMats.b.opacity = 0.25 + Math.sin(t) * 0.08;
}

// ---------------- GPS: shortest way along the roads ----------------
let gps = null, gpsT = 0;
function currentTarget() { if (mission) { const st = mission.def.steps[mission.step]; return st && st.at ? st.at() : null; } if (SAVE.done < MISSIONS.length) return missionStartPoint(SAVE.done); return null; }
function gpsRoute(from, to) {
  const a = nearestRoadPoint(from.x, from.z), b = nearestRoadPoint(to.x, to.z), K = (i, j) => i * (N + 1) + j;
  const prev = new Int32Array((N + 1) * (N + 1)).fill(-1), q = [K(a.ix, a.iz)]; prev[q[0]] = q[0];
  while (q.length) { const c = q.shift(), i = Math.floor(c / (N + 1)), j = c % (N + 1); if (i === b.ix && j === b.iz) break; for (const [di, dj] of DIRS) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni > N || nj > N) continue; const k = K(ni, nj); if (prev[k] < 0) { prev[k] = c; q.push(k); } } }
  const pts = [{ x: to.x, z: to.z }]; let c = K(b.ix, b.iz);
  while (prev[c] >= 0) { pts.push({ x: roadC(Math.floor(c / (N + 1))), z: roadC(c % (N + 1)) }); if (prev[c] === c) break; c = prev[c]; }
  pts.push({ x: from.x, z: from.z }); return pts.reverse();
}
const guide = (() => { // a chevron on the ground that points the way
  const sh = new THREE.Shape(); sh.moveTo(0, 1.3); sh.lineTo(0.9, -0.2); sh.lineTo(0.45, -0.2); sh.lineTo(0, 0.55); sh.lineTo(-0.45, -0.2); sh.lineTo(-0.9, -0.2); sh.closePath();
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.85, depthWrite: false }));
  m.renderOrder = 2; m.visible = false; scene.add(m); return m;
})();
const ring = (() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return m; })();
function updateGps(dt) {
  const t = currentTarget(); gpsT -= dt;
  if (!t) { gps = null; guide.visible = ring.visible = false; return; }
  if (gpsT <= 0 || !gps) { gpsT = 0.5; gps = gpsRoute({ x: px(), z: pz() }, t); }
  const col = mission ? 0x3aa0ff : 0xffc21e; guide.material.color.setHex(col); ring.material.color.setHex(col);
  // next turn on the route that is not right under us
  let nx = t.x, nz = t.z; for (let i = 1; i < gps.length; i++) { if (Math.hypot(gps[i].x - px(), gps[i].z - pz()) > 9) { nx = gps[i].x; nz = gps[i].z; break; } }
  const a = Math.atan2(nx - px(), nz - pz()), dd = Math.hypot(t.x - px(), t.z - pz());
  guide.visible = dd > 8; const ahead = player.car ? 6 : 2.6;
  guide.position.set(px() + Math.sin(a) * ahead, 0.25, pz() + Math.cos(a) * ahead); guide.rotation.y = a; guide.scale.setScalar(player.car ? 1.6 : 0.8);
  const st = mission && mission.def.steps[mission.step], r = st ? st.r || 6 : 3.2, pulse = 1 + Math.sin(performance.now() / 250) * 0.06;
  ring.visible = true; ring.position.set(t.x, 0.26, t.z); ring.scale.setScalar(r * pulse);
  const dEl = $("mDist"); if (dEl) dEl.textContent = dd > 1000 ? (dd / 1000).toFixed(1) + " كم" : Math.round(dd) + " م";
}

// ---------------- missions tick ----------------
function updateMission(dt) {
  if (!mission) {
    const i = SAVE.done; if (i < MISSIONS.length && !player.dead) { const p = missionStartPoint(i); if (Math.hypot(px() - p.x, pz() - p.z) < 3.2) startMission(i); }
    return;
  }
  const s = mission.def.steps[mission.step];
  if (s.time) { missionT -= dt; const el = $("mTime"); if (el) el.textContent = "⏱ " + Math.max(0, Math.ceil(missionT)); if (missionT <= 0) return failMission("خلص الوقت"); }
  const f = s.fail && s.fail(mission); if (f) return failMission(f);
  if (s.check(mission)) { sfx.coin(); nextStep(); }
}

// ---------------- HUD ----------------
let toastT = 0, hintT = 0;
function toast(a, b) { const t = $("toast"); t.innerHTML = a + (b ? `<small>${b}</small>` : ""); t.hidden = false; toastT = 2.6; }
function hint(s, ms = 3000) { const h = $("hint"); h.textContent = s; h.hidden = false; hintT = ms / 1000; }
function updateHud() {
  $("money").textContent = "$" + Math.floor(SAVE.money).toLocaleString("en");
  [...$("stars").children].forEach((el, i) => el.classList.toggle("on", i < wanted.stars));
  $("hpBar").style.width = clamp(player.hp, 0, 100) + "%"; $("armBar").style.width = clamp(player.armor, 0, 100) + "%";
  const W = WEAPONS[player.weapon], am = player.ammo[player.weapon]; $("wep").textContent = W.name + (isFinite(am) ? " • " + am : "");
}
const mctx = $("mini").getContext("2d");
function drawMini() {
  const W = 300, s = 1.5, cx = px(), cz = pz(); mctx.save(); mctx.clearRect(0, 0, W, W);
  mctx.beginPath(); mctx.arc(W / 2, W / 2, W / 2, 0, TAU); mctx.clip();
  mctx.fillStyle = "#c9c4b4"; mctx.fillRect(0, 0, W, W);
  mctx.translate(W / 2, W / 2); mctx.rotate(Math.PI + camYaw); mctx.scale(s, s); mctx.translate(-cx, -cz);
  mctx.fillStyle = "#4a4e56"; for (let i = 0; i <= N; i++) { mctx.fillRect(i * CELL, 0, ROAD, SIZE); mctx.fillRect(0, i * CELL, SIZE, ROAD); }
  mctx.fillStyle = "#7fbf5a"; for (const k of ["park", "park2"]) { const p = PLACES[k]; mctx.fillRect(blockX0(p.bx), blockX0(p.bz), BLOCK, BLOCK); }
  mctx.fillStyle = "#9a9384"; for (const b of solids) if (b.tag === "bld") mctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  const dot = (x, z, c, r) => { mctx.fillStyle = c; mctx.beginPath(); mctx.arc(x, z, r / s, 0, TAU); mctx.fill(); };
  for (const c of cars) if (c.type === "police" && !c.dead && wanted.stars > 0) dot(c.x, c.z, Math.floor(performance.now() / 250) % 2 ? "#ff3030" : "#3060ff", 5);
  for (const g of gang) if (!g.dead) dot(g.x, g.z, "#ff2020", 4);
  for (const k of cops) if (!k.dead) dot(k.x, k.z, "#4a7dff", 3.5);
  // mission marker (clamped to the edge if far)
  const markOf = () => { if (mission) { const st = mission.def.steps[mission.step]; return st && st.at ? [st.at(), "#3aa0ff"] : null; } if (SAVE.done < MISSIONS.length) return [missionStartPoint(SAVE.done), "#ffc21e"]; return null; };
  const mk = markOf();
  if (gps) { mctx.strokeStyle = mission ? "#3aa0ff" : "#ffc21e"; mctx.lineWidth = 5 / s; mctx.lineJoin = "round"; mctx.beginPath(); gps.forEach((q, i) => (i ? mctx.lineTo(q.x, q.z) : mctx.moveTo(q.x, q.z))); mctx.stroke(); }
  mctx.restore();
  if (mk) { const [p, c] = mk; let dx = p.x - cx, dz = p.z - cz; const a = -(Math.PI + camYaw), rx = (dx * Math.cos(a) - dz * Math.sin(a)) * s, rz = (dx * Math.sin(a) + dz * Math.cos(a)) * s; let l = Math.hypot(rx, rz), k = l > W / 2 - 14 ? (W / 2 - 14) / l : 1; mctx.fillStyle = c; mctx.strokeStyle = "#000"; mctx.lineWidth = 3; mctx.beginPath(); mctx.arc(W / 2 + rx * k, W / 2 + rz * k, 11, 0, TAU); mctx.fill(); mctx.stroke(); if (!mission) { mctx.fillStyle = "#000"; mctx.font = "bold 14px sans-serif"; mctx.textAlign = "center"; mctx.textBaseline = "middle"; mctx.fillText("M", W / 2 + rx * k, W / 2 + rz * k + 1); } }
  // you: an arrow in the middle
  const pa = player.car ? player.car.a : player.a; mctx.save(); mctx.translate(W / 2, W / 2); mctx.rotate(-(pa - camYaw)); mctx.fillStyle = "#fff"; mctx.strokeStyle = "#000"; mctx.lineWidth = 2; mctx.beginPath(); mctx.moveTo(0, -12); mctx.lineTo(8, 9); mctx.lineTo(0, 4); mctx.lineTo(-8, 9); mctx.closePath(); mctx.fill(); mctx.stroke(); mctx.restore();
}

// ---------------- screens ----------------
let mode = "title";
function openMissions() {
  const L = $("mlist"); L.innerHTML = "";
  MISSIONS.forEach((m, i) => { const d = document.createElement("div"); d.className = "mitem" + (i < SAVE.done ? " done" : i === SAVE.done ? " next" : ""); d.innerHTML = `<b>${i + 1}. ${m.name}</b><span>${m.desc}</span><span class="st">${i < SAVE.done ? "✅ خلصت" : i === SAVE.done ? "▶ التالية" : "🔒"} • $${m.reward}</span>`; L.append(d); });
  if (SAVE.done >= MISSIONS.length) { const d = document.createElement("div"); d.className = "mitem"; d.innerHTML = "<b>🏆 خلّصت كل المهمات!</b><span>المدينة لك – تجوّل واسرق براحتك. مهمات جديدة قريب.</span>"; L.append(d); }
  $("soundBtn").textContent = "الصوت: " + (SAVE.sound ? "شغّال" : "مطفي");
  $("missions").hidden = false; if (mode === "play") mode = "pause"; document.exitPointerLock?.();
}
$("resumeBtn").addEventListener("click", () => { $("missions").hidden = true; if (mode === "pause") mode = "play"; else startGame(); });
$("soundBtn").addEventListener("click", () => { SAVE.sound = !SAVE.sound; save(); $("soundBtn").textContent = "الصوت: " + (SAVE.sound ? "شغّال" : "مطفي"); if (!SAVE.sound && eng) eng.g.gain.value = 0; if (!SAVE.sound && sir) sir.g.gain.value = 0; });
$("missBtn").addEventListener("click", openMissions);
function openOutfits() {
  const L = $("olist"); L.innerHTML = "";
  for (const [id, name] of OUTFITS) {
    const b = document.createElement("button"); b.type = "button"; b.className = "oitem" + (SAVE.outfit === id ? " on" : "");
    b.innerHTML = `<img src="thumbs/${id}.webp" alt=""><span>${name}</span>`;
    b.addEventListener("click", async () => { SAVE.outfit = id; save(); [...L.children].forEach((c) => c.classList.toggle("on", c === b)); b.classList.add("wait"); await loadHuman(id); b.classList.remove("wait"); swapPlayerModel(); });
    L.append(b);
  }
  $("outfits").hidden = false; if (mode === "play") mode = "pause"; document.exitPointerLock?.();
}
function swapPlayerModel() {
  if (!player.v || !HUM[SAVE.outfit]) return; const vis = player.v.g.visible;
  if (player.v.human) disposeHuman(player.v); else scene.remove(player.v.g);
  player.v = makePerson({ kind: "player" }); player.v.g.visible = vis;
}
$("setOutfit").addEventListener("click", () => { $("settings").hidden = true; openOutfits(); });
$("outfitDone").addEventListener("click", () => { $("outfits").hidden = true; openSettings(); });
// ---- settings screen
function applyQuality() {
  const q = SET.quality, dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(q === "low" ? Math.min(dpr, 0.85) : q === "med" ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
  sun.castShadow = q !== "low"; const ms = q === "high" ? 2048 : 1024; if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.fog.far = q === "low" ? 190 : q === "med" ? 240 : 300; camera.far = scene.fog.far + 20; camera.updateProjectionMatrix(); resize();
}
function openSettings() {
  const seg = (id, v) => [...$(id).children].forEach((b) => b.classList.toggle("on", b.dataset.v === String(v)));
  $("sVol").value = SET.vol; $("sSens").value = SET.sens; $("sSteer").value = SET.steer;
  seg("sDist", SET.camDist); seg("sQ", SET.quality); seg("sInv", SET.invY ? 1 : 0); seg("sDrive", SET.drive); seg("sTiltInv", SET.tiltInv ? 1 : 0); $("tiltRow").hidden = SET.drive !== "tilt";
  $("settings").hidden = false; if (mode === "play") mode = "pause"; document.exitPointerLock?.();
}
$("sVol").addEventListener("input", (e) => { SET.vol = +e.target.value; if (master) master.gain.value = SET.vol; saveSet(); });
$("sSens").addEventListener("input", (e) => { SET.sens = +e.target.value; saveSet(); });
$("sSteer").addEventListener("input", (e) => { SET.steer = +e.target.value; saveSet(); });
for (const [id, fn] of [["sDist", (v) => (SET.camDist = +v)], ["sQ", (v) => { SET.quality = v; applyQuality(); }], ["sInv", (v) => (SET.invY = v === "1")], ["sDrive", (v) => { SET.drive = v; SET.pedals = v !== "stick"; applyDriveMode(); $("tiltRow").hidden = v !== "tilt"; if (v === "tilt") askTilt(); }], ["sTiltInv", (v) => (SET.tiltInv = v === "1")]])
  $(id).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; fn(b.dataset.v); saveSet(); [...$(id).children].forEach((x) => x.classList.toggle("on", x === b)); });
$("setBtn").addEventListener("click", openSettings); $("setBtn2").addEventListener("click", openSettings);
$("setDone").addEventListener("click", () => { $("settings").hidden = true; if (mode === "pause") mode = "play"; });
applyQuality();
$("creditsBtn").addEventListener("click", () => { $("credits").hidden = false; }); $("creditsDone").addEventListener("click", () => { $("credits").hidden = true; });
$("playBtn").addEventListener("click", startGame);
if (IS_TOUCH) $("keys").textContent = "العصا يسار للمشي والسواقة، اسحب يمين الشاشة عشان تلف الكاميرا";
async function startGame() {
  $("title").hidden = true; $("missions").hidden = true; $("hud").hidden = false; document.body.classList.add("playing"); mode = "play"; audio();
  if (IS_TOUCH) { try { await document.documentElement.requestFullscreen?.(); await screen.orientation?.lock?.("landscape"); } catch (e) {} }
  else canvas.requestPointerLock?.();
  hint(SAVE.done < MISSIONS.length ? "روح للعمود الأصفر عشان تبدأ المهمة 🟡" : "المدينة لك!", 5000); updateHud();
}

// ---------------- world population ----------------
let worldReady = false;
{ const pb = $("playBtn"); pb.disabled = true; pb.dataset.t = pb.textContent; pb.textContent = "جاري تحميل الشخصيات… 0%"; }
{
  if (!OUTFITS.some((o) => o[0] === SAVE.outfit)) SAVE.outfit = OUTFITS[0][0];
  const first = [...new Set([ANIM_ID, SAVE.outfit, "Police_Male_03", "Male_Adult_04", "Male_Adult_09", "Female_Adult_01", "Male_Adult_17", "Male_Adult_21"])];
  let n = 0; const pct = () => { $("playBtn").textContent = "جاري تحميل الشخصيات… " + Math.round((++n / first.length) * 100) + "%"; };
  const carsFirst = ["sedan", "compact", "police", "taxi", "sport", "minivan"];
  window.__boot = Promise.all([loadHuman(ANIM_ID).then(() => Promise.all(first.map((id) => loadHuman(id).then(pct)))), ...carsFirst.map((id) => loadCar(id).then(pct))]);
  first.push(...carsFirst);
}
window.__boot.then(() => {
  // the rest of the people load quietly in the background, one after another
  (async () => { for (const id of ["hatch", "postvan", "pickup"]) await loadCar(id); for (const id of [...CIV_IDS, ...COP_IDS, ...GANG_IDS]) await loadHuman(id); })();
  spawnPlayer();
  spawnTraffic(SET.quality === "low" ? 24 : SET.quality === "med" ? 34 : 44);
  spawnPeds(SET.quality === "low" ? 12 : SET.quality === "med" ? 20 : 30);
  for (const s of parkedSpots) newCar(R() < 0.3 ? "sport" : "sedan", s.x, s.z, s.a);
  { const h = frontOf(PLACES.hideout); newCar("sport", h.x + 10, h.z + 1, -Math.PI / 2, 0x1d6fe0); } // a car waiting at the hideout
  renderer.compile(scene, camera); worldReady = true;
  const pb = $("playBtn"); pb.disabled = false; pb.textContent = pb.dataset.t;
});

// ---------------- main loop ----------------
let last = performance.now(), miniT = 0, hudT = 0;
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mode === "play") {
    busyT = Math.max(0, busyT - dt);
    updatePlayer(dt);
    for (const c of [...cars]) { if (c === player.car) continue; if (c.ai && c.ai.kind === "traffic" && c.driver === "npc") updateTraffic(c, dt); else if (c.ai && c.ai.kind === "police" && c.driver === "cop") updatePolice(c, dt); else driveCar(c, dt, { thr: 0, steer: 0, hb: true }); }
    updatePeds(dt); updateCops(dt); recyclePeds(dt); updateWanted(dt); updateMission(dt); updateGps(dt);
    // keep traffic alive: drop wrecks far away, and replace lost traffic
    for (const c of [...cars]) { const d = Math.hypot(c.x - px(), c.z - pz()); if (c !== player.car && (c.dead && c.burnT <= 0 && d > 60 || (c.driver === "cop-idle" && d > 90))) removeCar(c); }
    if (cars.filter((c) => c.driver === "npc").length < (SET.quality === "low" ? 24 : SET.quality === "med" ? 34 : 44) && R() < dt * 2) spawnTraffic(1);
    recycleTraffic(dt);
    if (player.car) { const kmh = Math.hypot(player.car.vx, player.car.vz) * 3.6, g = Math.min(5, Math.floor(kmh / 28)), inp = playerCarInput(); engineSound(true, clamp(0.08 + (kmh - g * 28) / 36 + g * 0.05 + (kmh < 3 && inp.thr > 0 ? 0.35 : 0), 0, 1), Math.max(0, inp.thr)); } else engineSound(false, 0);
    hurtFx = Math.max(0, hurtFx - dt * 1.5); $("hurt").style.opacity = hurtFx;
    if (!player.dead && player.hp < 100 && wanted.stars === 0) player.hp = Math.min(100, player.hp + dt * 2);
    toastT -= dt; if (toastT <= 0) $("toast").hidden = true; hintT -= dt; if (hintT <= 0) $("hint").hidden = true;
    hudT += dt; if (hudT > 0.25) { hudT = 0; updateHud(); }
    if (!pedal.wheelHeld) pedal.wheel = lerp(pedal.wheel, 0, 1 - Math.exp(-dt * 6)); { const w = $("wheel"); if (w) w.style.transform = `rotate(${pedal.wheel}rad)`; }
    { const sp = $("speedo"); sp.hidden = !player.car; if (player.car) { const c = player.car, v = c.vx * Math.sin(c.a) + c.vz * Math.cos(c.a), kmh = Math.round(Math.abs(v) * 3.6); $("spdN").textContent = kmh; $("gearN").textContent = v < -0.5 ? "R" : kmh < 2 ? "N" : String(Math.min(6, 1 + Math.floor(kmh / 28))); } }
  } else if (mode === "title") { camYaw += dt * 0.08; }
  syncAll(dt); updateCamera(dt);
  miniT += dt; if (miniT > 0.1 && mode !== "title") { miniT = 0; drawMini(); }
  $("cross").style.display = player.car ? "none" : "";
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__g = { setArm: (x) => (ARMOUT = x), shootNow: () => { player.fireT = 0; shoot(); }, look: (x, z) => { camYaw = Math.atan2(x - px(), z - pz()); }, cops, renderer, scene, camera, THREE, HUM, makePerson, player, cars, peds, wanted, MISSIONS, startMission, SAVE, PLACES, frontOf, get mission() { return mission; }, enterCar, addWanted };
