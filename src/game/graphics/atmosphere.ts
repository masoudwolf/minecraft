// ─── Atmosphere sky dome — analytic Rayleigh/Mie scattering, HDR sun disk ─────
// Replaces the flat scene.background color. The dome is an unlit sphere that
// follows the camera (depthTest off, drawn first), so terrain simply covers it.
// The sun disk is rendered IN-SHADER with HDR intensity (>1.0) so bloom and
// god-rays both key off it, exactly like shader packs do.

import * as THREE from 'three';

/** shared analytic sky function (also sampled by the water shader reflections) */
export const SKY_COLOR_GLSL = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uDay;      // 0 night → 1 full day
  uniform float uSunset;   // 0..1 twilight band
  uniform float uStorm;    // 0..1 weather darkening
  uniform float uFlash;    // 0..1 lightning flash
  uniform float uCover;    // 0 clear → 1 overcast (cloud coverage)

  // rd: normalized view ray; sd: normalized direction TOWARD the sun
  vec3 gfxSkyColor(vec3 rd, bool withSunDisk) {
    float mu = clamp(dot(rd, uSunDir), -1.0, 1.0);
    float up = clamp(rd.y, -1.0, 1.0);

    // zenith / horizon base colors by day amount
    vec3 dayZenith   = vec3(0.10, 0.32, 0.71);
    vec3 dayHorizon  = vec3(0.55, 0.74, 0.92);
    vec3 nightZenith = vec3(0.008, 0.013, 0.038);
    vec3 nightHorizon= vec3(0.035, 0.048, 0.095);
    vec3 zenith  = mix(nightZenith, dayZenith, uDay);
    vec3 horizon = mix(nightHorizon, dayHorizon, uDay);

    // sunset: warm the horizon, strongest on the sun side
    float sunProx = pow(max(mu, 0.0), 2.2);
    vec3 sunsetCol = vec3(0.98, 0.44, 0.14);
    horizon = mix(horizon, sunsetCol, uSunset * (0.5 + 0.5 * sunProx));
    zenith  = mix(zenith, vec3(0.24, 0.22, 0.38), uSunset * 0.35);

    float horiz = pow(1.0 - clamp(up, 0.0, 1.0), 3.0);
    vec3 col = mix(zenith, horizon, horiz);

    // below-horizon haze (dark falloff — the dome's lower hemisphere)
    col = mix(col, col * vec3(0.38, 0.40, 0.44), clamp(-up * 3.2, 0.0, 1.0));

    // Mie glow around the sun
    float mie = pow(max(mu, 0.0), 8.0) * 0.20 + pow(max(mu, 0.0), 56.0) * 0.52;
    vec3 mieCol = mix(vec3(0.95, 0.80, 0.60), vec3(1.0, 0.60, 0.28), uSunset);
    col += mieCol * mie * (uDay * 0.55 + uSunset * 0.85);

    // HDR sun disk (bloom + god rays key off this)
    if (withSunDisk) {
      float disk = smoothstep(0.99930, 0.99965, mu);
      vec3 sunCol = mix(vec3(1.0, 0.88, 0.60), vec3(1.0, 0.985, 0.94), 1.0 - uSunset);
      float rise = clamp(uSunDir.y * 5.0, 0.0, 1.0);
      col += sunCol * disk * (3.5 * rise + 0.25) * (1.0 - uStorm * 0.9);
      col += sunCol * pow(max(mu, 0.0), 350.0) * 2.0 * rise * (1.0 - uStorm * 0.8);
    }

    // moon (opposite the sun) — soft disk + glow, fades with daylight
    float muM = clamp(dot(rd, -uSunDir), -1.0, 1.0);
    float moonDisk = smoothstep(0.99955, 0.99985, muM);
    float night = 1.0 - uDay;
    col += vec3(0.85, 0.90, 1.0) * (moonDisk * 1.6 + pow(max(muM, 0.0), 90.0) * 0.25) * night;

    // overcast + storm desaturation
    float gray = dot(col, vec3(0.3333));
    vec3 overcast = mix(col, vec3(gray) * vec3(0.62, 0.65, 0.72), max(uStorm * 0.85, uCover * 0.55));
    col = overcast;

    // lightning flash whitens everything
    col += vec3(0.9, 0.93, 1.0) * uFlash * 0.8;
    return max(col, vec3(0.0));
  }
`;

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
  ${SKY_COLOR_GLSL}
  void main() {
    vec3 col = gfxSkyColor(normalize(vDir), true);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class AtmosphereSky {
  mesh: THREE.Mesh;
  uniforms: {
    uSunDir: { value: THREE.Vector3 };
    uDay: { value: number };
    uSunset: { value: number };
    uStorm: { value: number };
    uFlash: { value: number };
    uCover: { value: number };
  };

  constructor(scene: THREE.Scene) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uDay: { value: 1 },
      uSunset: { value: 0 },
      uStorm: { value: 0 },
      uFlash: { value: 0 },
      uCover: { value: 0.2 },
    };
    const geo = new THREE.SphereGeometry(470, 32, 20);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = -100;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(
    camera: THREE.Camera,
    sunDir: THREE.Vector3,
    day: number,
    sunset: number,
    storm: number,
    flash: number,
    cover: number,
  ): void {
    this.mesh.position.copy(camera.position);
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uDay.value = day;
    this.uniforms.uSunset.value = sunset;
    this.uniforms.uStorm.value = storm;
    this.uniforms.uFlash.value = flash;
    this.uniforms.uCover.value = cover;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
