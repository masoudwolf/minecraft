// ─── Weather: rain / snow / thunderstorm with sky darkening ──────────────────
import * as THREE from 'three';
import { audio } from './audio';
import type { Biome } from './world/terrain';

export type WeatherState = 'clear' | 'rain' | 'thunder';

interface Drop {
  x: number; y: number; z: number;
  vy: number;
}

const RAIN_COUNT = 900;
const SNOW_COUNT = 550;
/** precipitation box around the camera */
const RADIUS = 26;
const TOP = 20;   // spawn height above camera
const BOTTOM = -6; // despawn below camera

/** biomes where precipitation falls as snow */
const SNOW_BIOMES: Biome[] = ['snowy', 'mountains'];
/** biomes with no precipitation */
const DRY_BIOMES: Biome[] = ['desert'];

/** rain streak texture: 2×8 vertical white gradient */
function makeRainTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 16;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 16);
  grad.addColorStop(0, 'rgba(170,190,220,0)');
  grad.addColorStop(0.35, 'rgba(170,190,220,0.85)');
  grad.addColorStop(1, 'rgba(190,205,230,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(1, 0, 2, 16);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

/** snow flake texture: blocky white clump */
function makeSnowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect(2, 2, 4, 4);
  ctx.fillStyle = 'rgba(230,240,255,0.8)';
  ctx.fillRect(1, 3, 1, 2); ctx.fillRect(6, 3, 1, 2);
  ctx.fillRect(3, 1, 2, 1); ctx.fillRect(3, 6, 2, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

export class WeatherSystem {
  group = new THREE.Group();
  state: WeatherState = 'clear';
  /** 0..1 how "into" the current weather we are (fade in/out) */
  intensity = 0;
  /** thunder lightning flash 0..1 (drives sky brightening) */
  flash = 0;
  /** is it snowing at the player's position (biome-dependent) */
  snowing = false;

  private rain: THREE.Points;
  private snow: THREE.Points;
  private rainDrops: Drop[] = [];
  private snowFlakes: Drop[] = [];
  private stateTimer = 20 + Math.random() * 30; // first weather change within ~30s
  private thunderTimer = 0;
  private flashBlinks = 0;
  private rnd: () => number;
  /** biome query injected by engine (player pos → biome) */
  biomeAt: (x: number, z: number) => Biome;
  /** engine callback: lightning bolt visual at the strike point (ground level) */
  onStrike?: (x: number, y: number, z: number) => void;

  constructor(scene: THREE.Scene, seed: number, biomeAt: (x: number, z: number) => Biome) {
    this.rnd = (() => {
      let s = seed >>> 0;
      return () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
    })();
    this.biomeAt = biomeAt;

    // rain points (world-anchored, wrapped around the camera)
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_COUNT * 3), 3));
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
      map: makeRainTexture(), size: 0.55, transparent: true, opacity: 0.55,
      depthWrite: false, sizeAttenuation: true, fog: false,
    }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 8;
    this.group.add(this.rain);

    // snow points
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SNOW_COUNT * 3), 3));
    this.snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
      map: makeSnowTexture(), size: 0.32, transparent: true, opacity: 0.85,
      depthWrite: false, sizeAttenuation: true, fog: false,
    }));
    this.snow.visible = false;
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 8;
    this.group.add(this.snow);

    scene.add(this.group);
  }

  private newDrop(snow = false): Drop {
    const ang = this.rnd() * Math.PI * 2;
    const r = Math.sqrt(this.rnd()) * RADIUS;
    const h = snow ? 4 + this.rnd() * (TOP - 6) : this.rnd() * TOP;
    return {
      x: Math.cos(ang) * r,
      y: h,
      z: Math.sin(ang) * r,
      vy: snow ? 1.4 + this.rnd() * 1.1 : 21 + this.rnd() * 6,
    };
  }

  /** thunderstorm darkening factor 0..1 for sky/lighting */
  get darkness(): number {
    return this.intensity * (this.state === 'thunder' ? 0.72 : 0.5);
  }

  dispose(): void {
    audio.stopRain();
  }

  update(dt: number, camX: number, camY: number, camZ: number, groundY: (x: number, z: number) => number): void {
    // ── state machine ──
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      if (this.state === 'clear') {
        // 66% rain, 34% straight to thunder (rain stays the minority of playtime)
        this.state = this.rnd() < 0.66 ? 'rain' : 'thunder';
      } else {
        this.state = 'clear';
      }
      // durations (seconds) — long clear stretches, shorter wet ones (vanilla-ish)
      this.stateTimer =
        this.state === 'clear' ? 260 + this.rnd() * 320 :
        this.state === 'rain' ? 60 + this.rnd() * 110 :
        45 + this.rnd() * 60;
      if (this.state === 'thunder') {
        this.thunderTimer = 1.5 + this.rnd() * 3;
      }
      if (this.state === 'clear') audio.stopRain();
    }

    // fade intensity
    const target = this.state === 'clear' ? 0 : 1;
    const fade = this.state === 'clear' ? 0.5 : 0.25;
    this.intensity += Math.sign(target - this.intensity) * dt / fade;
    this.intensity = Math.max(0, Math.min(1, this.intensity));

    // biome check: rain vs snow vs dry
    const biome = this.biomeAt(Math.floor(camX), Math.floor(camZ));
    const dry = DRY_BIOMES.includes(biome);
    this.snowing = SNOW_BIOMES.includes(biome);

    const active = this.intensity > 0.02 && !dry;
    const raining = active && !this.snowing;
    const snowing = active && this.snowing;

    // audio (rain loop handles fade itself)
    if (raining && this.intensity > 0.5) audio.startRain();
    else if (!raining) audio.stopRain();

    // ── thunder ──
    if (this.state === 'thunder' && this.intensity > 0.6) {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0 && this.flashBlinks === 0) {
        // strike! pick a strike point near the camera + start blink sequence
        const ang = this.rnd() * Math.PI * 2;
        const dist = 8 + this.rnd() * 26;
        const sx = camX + Math.cos(ang) * dist;
        const sz = camZ + Math.sin(ang) * dist;
        const gy = groundY(sx, sz);
        this.flashBlinks = 2 + Math.floor(this.rnd() * 3);
        this.flash = 1;
        this.thunderTimer = 3 + this.rnd() * 7;
        audio.thunder(this.rnd() * 0.75);
        this.onStrike?.(sx, gy, sz);
      }
    }
    // flash decay + blink
    if (this.flash > 0) {
      this.flash -= dt * 7;
      if (this.flash <= 0 && this.flashBlinks > 0) {
        this.flashBlinks--;
        this.flash = this.flashBlinks > 0 ? 0.55 + this.rnd() * 0.45 : 0;
      }
      if (this.flash < 0) this.flash = 0;
    }

    // ── rain particles ──
    this.rain.visible = raining;
    this.snow.visible = snowing;
    (this.rain.material as THREE.PointsMaterial).opacity = 0.5 * this.intensity;
    (this.snow.material as THREE.PointsMaterial).opacity = 0.8 * this.intensity;

    // lazily seed drops on first activation (world-space positions around the camera)
    if (raining && this.rainDrops.length === 0) {
      for (let i = 0; i < RAIN_COUNT; i++) {
        const nd = this.newDrop(false);
        this.rainDrops.push({ x: camX + nd.x, y: nd.y, z: camZ + nd.z, vy: nd.vy });
      }
    }
    if (snowing && this.snowFlakes.length === 0) {
      for (let i = 0; i < SNOW_COUNT; i++) {
        const nd = this.newDrop(true);
        this.snowFlakes.push({ x: camX + nd.x, y: nd.y, z: camZ + nd.z, vy: nd.vy });
      }
    }

    if (raining) this.updateDrops(this.rainDrops, dt, camX, camY, camZ, groundY, this.rain.geometry, false);
    if (snowing) this.updateDrops(this.snowFlakes, dt, camX, camY, camZ, groundY, this.snow.geometry, true);
  }

  private updateDrops(
    drops: Drop[], dt: number, camX: number, camY: number, camZ: number,
    groundY: (x: number, z: number) => number, geo: THREE.BufferGeometry, snow: boolean,
  ): void {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const n = drops.length;
    const slant = snow ? 0 : 2.2; // rain slants, snow drifts
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      d.y -= d.vy * dt;
      if (!snow) { d.x += slant * dt; }
      else { d.x += Math.sin((d.y + i) * 0.7) * dt * 0.7; d.z += Math.cos((d.y + i * 1.3) * 0.5) * dt * 0.6; }
      d.x += camX; // make world-space
      d.z += camZ;
      // wrap horizontally into the box around the camera (world-anchored rain)
      if (d.x - camX > RADIUS) d.x -= RADIUS * 2;
      else if (d.x - camX < -RADIUS) d.x += RADIUS * 2;
      if (d.z - camZ > RADIUS) d.z -= RADIUS * 2;
      else if (d.z - camZ < -RADIUS) d.z += RADIUS * 2;
      const wy = camY + d.y;
      // hit ground / left the vertical band → respawn at the top (at the wrapped position)
      if (d.y < BOTTOM || wy < groundY(Math.floor(d.x), Math.floor(d.z))) {
        const nd = this.newDrop(snow);
        d.x = camX + nd.x;
        d.z = camZ + nd.z;
        d.y = nd.y;
        d.vy = nd.vy;
        arr[i * 3] = d.x;
        arr[i * 3 + 1] = camY + d.y;
        arr[i * 3 + 2] = d.z;
        continue;
      }
      arr[i * 3] = d.x;
      arr[i * 3 + 1] = wy;
      arr[i * 3 + 2] = d.z;
    }
    pos.needsUpdate = true;
  }
}
