// ─── Volumetric clouds — raymarched slab with self-shadowing (shader-pack style)
// A dome (BackSide sphere) fragment-raymarches a cloud slab y∈[base, top].
// Density = 2D fbm shaped by a height gradient; light = 2-tap march toward the
// sun with HG phase for silver linings. Quality scales step count.

import * as THREE from 'three';
import { GLSL_NOISE } from './glsl';

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = normalize(wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  uniform float uWind;
  uniform float uCover;    // 0 clear → 1 overcast
  uniform float uStorm;
  uniform float uDay;      // 0 night → 1 day
  uniform float uSteps;    // march steps (quality)
  ${GLSL_NOISE}

  const float CLOUD_BASE = 112.0;
  const float CLOUD_TOP = 150.0;
  const float SCALE = 0.0115;

  // cloud density at a world point (xz); shaped vertically for puffy tops
  float cloudDensity(vec3 p) {
    vec2 q = p.xz * SCALE + vec2(uWind * 0.85, uWind * 0.5);
    float shape = fbm3(q);
    // detail layer drifts faster than the base shape (wind shear with altitude)
    float detail = fbm3(q * 3.4 + vec2(uWind * 4.6, -uWind * 3.2)) * 0.42;
    float d = shape * 0.85 + detail * 0.55;
    float cov = mix(0.545, 0.30, clamp(uCover, 0.0, 1.0)) + uStorm * 0.06;
    float h = clamp((p.y - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE), 0.0, 1.0);
    // vertical profile: fade at bottom edge, rounder tops
    float profile = smoothstep(0.0, 0.28, h) * (1.0 - smoothstep(0.5, 0.92, h));
    return max(0.0, (d - cov)) * profile * 3.4;
  }

  void main() {
    vec3 rd = normalize(vDir);
    vec3 ro = cameraPosition;

    // slab intersection
    float t0, t1;
    if (abs(rd.y) < 1e-4) {
      if (ro.y < CLOUD_BASE || ro.y > CLOUD_TOP) { discard; }
      t0 = 0.0; t1 = 900.0;
    } else {
      float ta = (CLOUD_BASE - ro.y) / rd.y;
      float tb = (CLOUD_TOP - ro.y) / rd.y;
      t0 = min(ta, tb);
      t1 = max(ta, tb);
      t0 = max(t0, 0.0);
      if (t1 <= 0.0) discard;
    }
    t1 = min(t1, 900.0);
    if (t0 >= t1) discard;

    float steps = uSteps;
    float dt = (t1 - t0) / steps;
    float t = t0 + dt * 0.5;

    vec3 scatter = vec3(0.0);
    float transmittance = 1.0;
    float mu = dot(rd, uSunDir);
    // Henyey-Greenstein phase (forward scattering = silver lining)
    float g = 0.62;
    float hg = (1.0 - g * g) / (4.0 * 3.14159 * pow(1.0 + g * g - 2.0 * g * mu, 1.5));

    for (int i = 0; i < 30; i++) {
      if (float(i) >= steps || transmittance < 0.03) break;
      vec3 p = ro + rd * t;
      float d = cloudDensity(p);
      if (d > 0.01) {
        // light march (2 taps toward the sun)
        vec3 ld = uSunDir;
        float lstep = 14.0;
        float shade = cloudDensity(p + ld * lstep) * 0.6 + cloudDensity(p + ld * lstep * 2.2) * 0.4;
        float lightT = exp(-shade * 6.5);
        float powder = 1.0 - exp(-d * 1.4);
        vec3 sunLight = uSunColor * (lightT * (0.5 + hg * 1.7) + powder * 0.15)
          // v0.48: moonlit clouds drop to ~1/3 — at Photon's 9.4% moon the old
          // unattenuated HG term painted midnight clouds day-gray (user: night
          // must feel dangerous). Moon-side rims keep a subtle cold glow.
          * mix(0.32, 1.0, uDay);
        vec3 ambient = mix(vec3(0.016, 0.020, 0.042), vec3(0.30, 0.37, 0.47), uDay) * (1.0 + uCover * 0.3);
        vec3 lum = sunLight + ambient;
        float a = 1.0 - exp(-d * dt * 0.115);
        scatter += lum * a * transmittance;
        transmittance *= 1.0 - a;
      }
      t += dt;
    }

    if (transmittance >= 0.995) discard;
    vec3 col = scatter / max(1e-4, 1.0 - transmittance) * 0.985;
    float alpha = clamp(1.0 - transmittance, 0.0, 1.0);
    alpha = pow(alpha, 0.82); // soften edges
    gl_FragColor = vec4(col, alpha);
  }
`;

export class VolumetricClouds {
  mesh: THREE.Mesh;
  uniforms: {
    uSunDir: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
    uTime: { value: number };
    uWind: { value: number };
    uCover: { value: number };
    uStorm: { value: number };
    uDay: { value: number };
    uSteps: { value: number };
  };

  constructor(scene: THREE.Scene) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uTime: { value: 0 },
      uWind: { value: 0 },
      uCover: { value: 0.25 },
      uStorm: { value: 0 },
      uDay: { value: 1 },
      uSteps: { value: 14 },
    };
    const geo = new THREE.SphereGeometry(460, 28, 18);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = -95;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(
    camera: THREE.Camera,
    dt: number,
    sunDir: THREE.Vector3,
    sunColor: THREE.Color,
    day: number,
    cover: number,
    storm: number,
  ): void {
    this.mesh.position.copy(camera.position);
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uTime.value = performance.now() / 1000;
    // Realistic drift: the shape layer moves uWind*0.85/SCALE ≈ 73.9 world
    // blocks per unit of uWind, so a rate of 0.0068/s ≈ 0.5 blocks/s calm
    // (Minecraft-vanilla feel; the old 2.2/s raced clouds at ~160 blocks/s).
    // Storms push it to ~2.5 blocks/s.
    this.uniforms.uWind.value += dt * (0.0068 + storm * 0.027);
    this.uniforms.uCover.value = cover;
    this.uniforms.uStorm.value = storm;
    this.uniforms.uDay.value = day;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
