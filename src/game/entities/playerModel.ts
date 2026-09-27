// ─── Third-person player model (Steve-style box humanoid, F5 view) ────────────
import * as THREE from 'three';

function makeTex(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  paint(ctx);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, colors: string[], x0: number, y0: number, w: number, h: number, seed: number): void {
  let s = seed;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
}

export interface PlayerModelParts {
  group: THREE.Group;
  head: THREE.Mesh;
  body: THREE.Mesh;
  legs: THREE.Mesh[];
  arms: THREE.Mesh[];
  shadow: THREE.Mesh;
}

/** build a Steve-like humanoid; textures are flat-color pixel noise (no per-face mapping) */
export function createPlayerModel(scene: THREE.Scene): PlayerModelParts {
  const skinTex = makeTex(8, 8, (ctx) => noise(ctx, ['#d8a17b', '#cf9871', '#e0aa84'], 0, 0, 8, 8, 42));
  const faceTex = makeTex(8, 8, (ctx) => {
    noise(ctx, ['#d8a17b', '#cf9871', '#e0aa84'], 0, 0, 8, 8, 42);
    // eyes (white + blue)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(1, 3, 2, 1); ctx.fillRect(5, 3, 2, 1);
    ctx.fillStyle = '#4a3ea8';
    ctx.fillRect(2, 3, 1, 1); ctx.fillRect(5, 3, 1, 1);
    // mouth hint
    ctx.fillStyle = '#a87858';
    ctx.fillRect(3, 5, 2, 1);
    // hair fringe
    ctx.fillStyle = '#3b2a1a';
    ctx.fillRect(0, 0, 8, 2);
  });
  const shirtTex = makeTex(8, 8, (ctx) => noise(ctx, ['#00a2a2', '#009090', '#0cb4b4'], 0, 0, 8, 8, 43));
  const pantsTex = makeTex(8, 8, (ctx) => noise(ctx, ['#3d3aa0', '#363390', '#4542b0'], 0, 0, 8, 8, 44));
  const shoeTex = makeTex(8, 8, (ctx) => noise(ctx, ['#5a5a5a', '#4e4e4e', '#666666'], 0, 0, 8, 8, 45));

  const mk = (t: THREE.Texture): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ map: t });
  const skinM = mk(skinTex);
  const faceM = mk(faceTex);
  const shirtM = mk(shirtTex);
  const pantsM = mk(pantsTex);
  const shoeM = mk(shoeTex);

  const group = new THREE.Group();

  // head (face material on +Z front — model faces +Z like mobs)
  const headMats = [skinM, skinM, skinM, skinM, faceM, skinM];
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMats);
  head.position.y = 1.72;
  group.add(head);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.26), shirtM);
  body.position.y = 1.1;
  group.add(body);

  const legs: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.74, 0.24), [pantsM, pantsM, pantsM, pantsM, shoeM, shoeM]);
    leg.position.set(sx * 0.125, 0.37, 0);
    group.add(leg);
    legs.push(leg);
  }

  const arms: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (0.25 + 0.11), 1.42, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), [skinM, skinM, skinM, skinM, shirtM, shirtM]);
    arm.position.y = -0.32;
    pivot.add(arm);
    group.add(pivot);
    arms.push(arm);
    (arm as unknown as { pivot: THREE.Group }).pivot = pivot;
  }

  // shadow blob
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  scene.add(shadow);

  scene.add(group);
  return { group, head, body, legs, arms, shadow };
}

/** animate + place the player model (third person). swing = limb swing amplitude */
export function animatePlayerModel(
  model: PlayerModelParts,
  x: number, y: number, z: number,
  yaw: number, pitch: number,
  walkPhase: number, moving: number, sneaking: boolean, dead: boolean, deathT: number,
): void {
  model.group.position.set(x, y, z);
  model.group.rotation.y = yaw + Math.PI; // model faces +Z; player yaw 0 = -Z
  const swing = Math.sin(walkPhase) * 0.7 * moving;
  model.legs[0].rotation.x = swing;
  model.legs[1].rotation.x = -swing;
  for (const arm of model.arms) {
    const pivot = (arm as unknown as { pivot?: THREE.Group }).pivot;
    if (pivot) {
      pivot.rotation.x = -swing * 0.8;
      pivot.rotation.z = Math.sin(walkPhase * 0.5) * 0.04;
    }
  }
  // head pitch (invert: camera pitch up = head up)
  model.head.rotation.x = -pitch * 0.85;
  // sneak crouch
  model.body.position.y = sneaking ? 1.02 : 1.1;
  model.head.position.y = sneaking ? 1.6 : 1.72;
  // death: fall over
  if (dead || deathT > 0) {
    model.group.rotation.z = Math.min(Math.PI / 2, model.group.rotation.z + 0.1);
  } else {
    model.group.rotation.z = 0;
  }
  model.shadow.position.set(x, y + 0.03, z);
}
