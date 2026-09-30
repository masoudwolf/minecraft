'use client';

// ─── Inventory 3D player preview (Minecraft-style) ───────────────────────────
// A live Steve rendered in the survival inventory. Like Minecraft, the model's
// HEAD (and slightly the body) track the mouse cursor while it moves around the
// screen, and smoothly return to facing forward when the cursor leaves.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createSteveModel } from '@/game/entities/playerModel';

export function InventoryPlayer3D({ width = 118 }: { width?: number }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = width;
    const H = Math.round(width * 1.72);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return; // no webgl — preview silently absent (non-critical feature)
    }
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 50);
    cam.position.set(0, 1.08, 3.55);
    cam.lookAt(0, 1.08, 0);

    // flat "inventory" lighting — always bright, independent of the world sun
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(1.4, 3.0, 4.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.4);
    rim.position.set(-2.2, 1.6, -2.5);
    scene.add(rim);

    const model = createSteveModel();
    scene.add(model.group);

    // ── mouse tracking (head looks at the cursor, Minecraft-style) ──
    let tYaw = 0, tPitch = 0, tBody = 0;
    let yaw = 0, pitch = 0, body = 0;
    const onMove = (e: MouseEvent): void => {
      const r = mount.getBoundingClientRect();
      const hx = r.left + r.width / 2;
      const hy = r.top + r.height * 0.34; // approx head position on screen
      const dx = THREE.MathUtils.clamp((e.clientX - hx) / 140, -1, 1);
      const dy = THREE.MathUtils.clamp((e.clientY - hy) / 140, -1, 1);
      tYaw = dx * 1.15;      // head yaw  (±66°)
      tPitch = dy * 0.62;    // head pitch (±35°)
      tBody = dx * 0.30;     // body follows a little (vanilla-ish)
    };
    const onLeave = (): void => { tYaw = 0; tPitch = 0; tBody = 0; };
    window.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);

    // subtle idle: breathing arms + weight shift (kept gentle — MC's is static)
    let raf = 0;
    let last = performance.now();
    let idle = Math.random() * 10;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      idle += dt;
      const k = 1 - Math.exp(-dt * 9);
      yaw += (tYaw - yaw) * k;
      pitch += (tPitch - pitch) * k;
      body += (tBody - body) * k;

      const hp = model.head.parent;
      if (hp) {
        hp.rotation.y = yaw;
        hp.rotation.x = pitch;
      }
      model.group.rotation.y = body;

      const breathe = Math.sin(idle * 1.7) * 0.03;
      const sway = Math.sin(idle * 0.9) * 0.015;
      for (let i = 0; i < 2; i++) {
        const p = (model.arms[i] as unknown as { limbPivot?: THREE.Group }).limbPivot;
        if (!p) continue;
        p.rotation.z = (i === 0 ? 1 : -1) * breathe;
        p.rotation.x = sway;
      }

      renderer.render(scene, cam);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      scene.remove(model.group);
      model.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => m.dispose());
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [width]);

  return <div ref={mountRef} style={{ width, height: Math.round(width * 1.72) }} aria-hidden />;
}
