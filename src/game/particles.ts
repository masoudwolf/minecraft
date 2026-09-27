// ─── Particle system (block break, explosion, splash...) ─────────────────────
import * as THREE from 'three';

const MAX_PARTICLES = 900;

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number;
  gravity: number;
  r: number; g: number; b: number;
}

export class ParticleSystem {
  private points: THREE.Points;
  private particles: Particle[] = [];
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setAttribute('size', this.sizeAttr);
    geo.setDrawRange(0, 0);

    // small white square texture (Minecraft particles are squares)
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 8, 8);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex } },
      vertexShader: /* glsl */ `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (140.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uTex, gl_PointCoord);
          if (tex.a < 0.5) discard;
          gl_FragColor = vec4(vColor, 1.0);
        }
      `,
      vertexColors: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawnParticle(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    color: [number, number, number],
    size: number, life: number, gravity = 18
  ): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ x, y, z, vx, vy, vz, life, maxLife: life, size, gravity, r: color[0], g: color[1], b: color[2] });
  }

  burstBlockBreak(bx: number, by: number, bz: number, tileColor: [number, number, number]): void {
    const [r, g, b] = tileColor;
    for (let i = 0; i < 22; i++) {
      const jitter = 0.18;
      this.spawnParticle(
        bx + 0.2 + Math.random() * 0.6,
        by + 0.2 + Math.random() * 0.6,
        bz + 0.2 + Math.random() * 0.6,
        (Math.random() - 0.5) * 3.4,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 3.4,
        [r * (0.75 + Math.random() * 0.4), g * (0.75 + Math.random() * 0.4), b * (0.75 + Math.random() * 0.4)],
        0.09 + Math.random() * 0.06,
        0.5 + Math.random() * 0.4
      );
    }
  }

  burstLand(x: number, y: number, z: number, color: [number, number, number], count = 6): void {
    for (let i = 0; i < count; i++) {
      this.spawnParticle(
        x + (Math.random() - 0.5) * 0.6, y + 0.05, z + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 1.4, Math.random() * 1.6 + 0.4, (Math.random() - 0.5) * 1.4,
        color, 0.07 + Math.random() * 0.04, 0.35
      );
    }
  }

  splash(x: number, y: number, z: number): void {
    for (let i = 0; i < 14; i++) {
      this.spawnParticle(
        x + (Math.random() - 0.5) * 0.8, y + 0.1, z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 2.2, Math.random() * 3.2 + 1.2, (Math.random() - 0.5) * 2.2,
        [0.35, 0.55, 0.9], 0.08, 0.5, 14
      );
    }
  }

  hurt(x: number, y: number, z: number): void {
    for (let i = 0; i < 10; i++) {
      this.spawnParticle(
        x + (Math.random() - 0.5) * 0.5, y + Math.random() * 1.4, z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 2, Math.random() * 2.4, (Math.random() - 0.5) * 2,
        [0.75, 0.1, 0.1], 0.08, 0.4
      );
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      // simple ground stop
      p.vx *= Math.pow(0.6, dt);
      p.vz *= Math.pow(0.6, dt);
    }
    for (const p of this.particles) {
      this.posAttr.setXYZ(n, p.x, p.y, p.z);
      const fade = Math.min(1, p.life / (p.maxLife * 0.4));
      this.colAttr.setXYZ(n, p.r * fade, p.g * fade, p.b * fade);
      this.sizeAttr.setX(n, p.size);
      n++;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.points.geometry.setDrawRange(0, n);
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
