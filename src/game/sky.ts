// ─── Dynamic sky: sun/moon, stars, blocky clouds, day-night fog ──────────────
import * as THREE from 'three';
import { DAY_LENGTH } from './constants';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// day-night color palette
const DAY_SKY = new THREE.Color(0x87ceeb);
const DAY_HORIZON = new THREE.Color(0xc4e0f5);
const NIGHT_SKY = new THREE.Color(0x0a0e1e);
const NIGHT_HORIZON = new THREE.Color(0x101828);
const SUNSET_SKY = new THREE.Color(0x35507a);
const SUNSET_HORIZON = new THREE.Color(0xe8873a);

export class SkySystem {
  group: THREE.Group;
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;
  private clouds: THREE.InstancedMesh;
  private cloudNoise: (x: number, y: number) => number;
  time = DAY_LENGTH * 0.25; // start morning
  sunLevel = 1;             // 0..1, drives voxel lighting
  private fogColor = new THREE.Color();
  private skyColor = new THREE.Color();
  private horizonColor = new THREE.Color();
  private cloudOffset = 0;
  private lastCloudRebuild = 0;
  private lastCamChunk = { x: 9999, z: 9999 };
  cloudsEnabled = true;

  constructor(scene: THREE.Scene, seed: number) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // sun quad
    const sunGeo = new THREE.PlaneGeometry(52, 52);
    const sunCanvas = document.createElement('canvas');
    sunCanvas.width = 16; sunCanvas.height = 16;
    const sctx = sunCanvas.getContext('2d')!;
    sctx.fillStyle = '#fdf4c2';
    sctx.fillRect(0, 0, 16, 16);
    sctx.fillStyle = '#fffbe0';
    sctx.fillRect(2, 2, 12, 12);
    const sunTex = new THREE.CanvasTexture(sunCanvas);
    sunTex.magFilter = THREE.NearestFilter;
    this.sun = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({ map: sunTex, fog: false, transparent: true, depthWrite: false }));
    this.sun.renderOrder = -10;
    this.group.add(this.sun);

    // moon quad
    const moonCanvas = document.createElement('canvas');
    moonCanvas.width = 16; moonCanvas.height = 16;
    const mctx = moonCanvas.getContext('2d')!;
    mctx.fillStyle = '#e8e8dc';
    mctx.fillRect(0, 0, 16, 16);
    mctx.fillStyle = '#c8c8bc';
    mctx.fillRect(3, 3, 4, 4);
    mctx.fillRect(9, 8, 3, 3);
    mctx.fillRect(5, 10, 2, 2);
    const moonTex = new THREE.CanvasTexture(moonCanvas);
    moonTex.magFilter = THREE.NearestFilter;
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), new THREE.MeshBasicMaterial({ map: moonTex, fog: false, transparent: true, depthWrite: false }));
    this.moon.renderOrder = -10;
    this.group.add(this.moon);

    // stars
    const starCount = 420;
    const starPos = new Float32Array(starCount * 3);
    const rnd = mulberry32(seed);
    for (let i = 0; i < starCount; i++) {
      // random direction on sphere
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(rnd() * 2 - 1);
      const r = 480;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi));
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    this.stars.renderOrder = -11;
    this.group.add(this.stars);

    // clouds (blocky instanced quads)
    this.cloudNoise = (x, y) => {
      const n = Math.sin(x * 0.52 + seed * 0.13) * Math.cos(y * 0.41 - seed * 0.07) + Math.sin((x + y) * 0.23 + 1.7) * 0.55;
      return n;
    };
    const cloudGeo = new THREE.BoxGeometry(12, 2.6, 12);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    this.clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 520);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -5;
    this.group.add(this.clouds);

    this.rebuildClouds(0, 0);
  }

  /** advance time and update sky visuals; returns fog color to apply */
  update(dt: number, camera: THREE.Camera, scene: THREE.Scene, fogNear: number, fogFar: number): void {
    this.time = (this.time + dt) % DAY_LENGTH;
    const dayFrac = this.time / DAY_LENGTH; // 0=midnight, .25=sunrise, .5=noon, .75=sunset

    // sun angle: sunrise at 0.25 → sun at horizon east; noon 0.5 → top
    const angle = (dayFrac - 0.25) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.18).normalize();
    const camPos = camera.position;

    this.sun.position.copy(camPos).addScaledVector(sunDir, 420);
    this.sun.lookAt(camPos);
    this.moon.position.copy(camPos).addScaledVector(sunDir, -420);
    this.moon.lookAt(camPos);

    const sunHeight = Math.sin(angle);
    // sunLevel: smooth transition, min 0.14 at night (moonlight)
    const dayAmount = THREE.MathUtils.clamp((sunHeight + 0.12) / 0.32, 0, 1);
    this.sunLevel = 0.14 + 0.86 * dayAmount;

    // star opacity
    const starMat = this.stars.material as THREE.PointsMaterial;
    starMat.opacity = THREE.MathUtils.clamp(1 - dayAmount * 1.6, 0, 0.9);
    this.stars.position.copy(camPos);
    this.stars.rotation.y = dayFrac * Math.PI * 2;

    // sky colors
    const sunsetAmount = THREE.MathUtils.clamp(1 - Math.abs(sunHeight) / 0.28, 0, 1) * (dayAmount > 0.02 ? 1 : 0.35);
    this.skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, dayAmount);
    this.horizonColor.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, dayAmount);
    this.horizonColor.lerp(SUNSET_HORIZON, sunsetAmount * 0.75);
    this.skyColor.lerp(SUNSET_SKY, sunsetAmount * 0.4);

    this.fogColor.copy(this.horizonColor).lerp(this.skyColor, 0.45);
    scene.background = this.skyColor;
    if (!scene.fog) scene.fog = new THREE.Fog(this.fogColor, fogNear, fogFar);
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(this.fogColor);
    fog.near = fogNear;
    fog.far = fogFar;

    // clouds drift + follow player in grid
    this.cloudOffset += dt * 0.7;
    const cpx = Math.floor(camPos.x / 12);
    const cpz = Math.floor(camPos.z / 12);
    if (this.cloudsEnabled && (performance.now() - this.lastCloudRebuild > 3000 || cpx !== this.lastCamChunk.x || cpz !== this.lastCamChunk.z)) {
      this.rebuildClouds(camPos.x, camPos.z);
      this.lastCamChunk = { x: cpx, z: cpz };
    }
    this.clouds.visible = this.cloudsEnabled;
    const cloudY = 114 + Math.sin(this.time * 0.01) * 2;
    // instances are placed at absolute world grid coords; only drift + height here
    this.clouds.position.set(this.cloudOffset % 12, cloudY, 0);
  }

  private rebuildClouds(camX: number, camZ: number): void {
    const m = new THREE.Matrix4();
    let i = 0;
    const R = 30; // cloud grid radius
    const gx = Math.floor(camX / 12);
    const gz = Math.floor(camZ / 12);
    for (let dx = -R; dx <= R && i < 520; dx++) {
      for (let dz = -R; dz <= R && i < 520; dz++) {
        const nx = gx + dx;
        const nz = gz + dz;
        const n = this.cloudNoise(nx * 0.35, nz * 0.35);
        if (n > 1.04) {
          m.makeTranslation(nx * 12, 0, nz * 12);
          this.clouds.setMatrixAt(i, m);
          i++;
        }
      }
    }
    this.clouds.count = i;
    this.clouds.instanceMatrix.needsUpdate = true;
    this.lastCloudRebuild = performance.now();
  }

  getFogColor(): THREE.Color {
    return this.fogColor;
  }
}

/** time-of-day helpers for UI */
export function getTimeLabel(time: number): string {
  const hours = Math.floor(((time / DAY_LENGTH) * 24 + 6) % 24);
  const minutes = Math.floor((((time / DAY_LENGTH) * 24 + 6) % 1) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
