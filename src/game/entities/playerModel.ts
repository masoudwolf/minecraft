// ─── Third-person player model: REAL vanilla Steve (official texture + boxUV) ─
// The player now uses the official vanilla steve.png (64×64 classic layout)
// mapped with Minecraft's standard box-UV cross (same pipeline as the mobs),
// and vanilla PlayerModel proportions (1px = 1/16m):
//   head 8×8×8 @ (0,0) · hat 8×8×8 @ (32,0) · body 8×12×4 @ (16,16)
//   arm 4×12×4 (R @ (40,16) · L @ (32,48)) · leg 4×12×4 (R @ (0,16) · L @ (16,48))
// Model faces +Z like every mob (player yaw 0 = −Z → group.rotation.y = yaw+π).
import * as THREE from 'three';
import { vanillaTex, boxUV, type BoxUVLayout } from './vanillaSkins';

const TEX_W = 64, TEX_H = 64;

/** vanilla texOffs + dims for each player part (texture pixels) */
const LAY = {
  head: { u: 0, v: 0, w: 8, h: 8, d: 8 } as BoxUVLayout,
  hat: { u: 32, v: 0, w: 8, h: 8, d: 8 } as BoxUVLayout,
  body: { u: 16, v: 16, w: 8, h: 12, d: 4 } as BoxUVLayout,
  armR: { u: 40, v: 16, w: 4, h: 12, d: 4 } as BoxUVLayout,
  armL: { u: 32, v: 48, w: 4, h: 12, d: 4 } as BoxUVLayout,
  legR: { u: 0, v: 16, w: 4, h: 12, d: 4 } as BoxUVLayout,
  legL: { u: 16, v: 48, w: 4, h: 12, d: 4 } as BoxUVLayout,
};

export interface PlayerModelParts {
  group: THREE.Group;
  head: THREE.Mesh;
  /** hair overlay layer (child of head) */
  hat: THREE.Mesh;
  body: THREE.Mesh;
  /** HIP PIVOTS (rotation.x swings the leg from the top, MC-style) */
  legs: THREE.Mesh[];
  /** the actual leg boxes (children of the pivots) — boots attach here */
  legMeshes: THREE.Mesh[];
  arms: THREE.Mesh[];
  shadow: THREE.Mesh;
  /** armor overlay meshes (rebuilt when armor changes) */
  armorGroup: THREE.Group;
  /** helmet shells (live on the NECK pivot so they track sneak/head pitch) */
  helmetGroup: THREE.Group;
  armorKey: string;
  /** boot shells (attached to leg meshes, tracked for removal) */
  bootMeshes: THREE.Mesh[];
}

/** standalone Steve body (no shadow/armor) — shared by the F5 model and the
 *  inventory 3D preview. Every call builds FRESH materials (the engine tints
 *  the F5 materials per-frame with the world light — the preview must stay lit). */
export interface SteveParts {
  group: THREE.Group;
  head: THREE.Mesh;
  hat: THREE.Mesh;
  body: THREE.Mesh;
  legs: THREE.Mesh[];
  legMeshes: THREE.Mesh[];
  arms: THREE.Mesh[];
}

export function createSteveModel(): SteveParts {
  const tex = vanillaTex('steve');

  const mk = (opts?: { cutout?: boolean }): THREE.MeshLambertMaterial => {
    const params: THREE.MeshLambertMaterialParameters = { map: tex, side: THREE.FrontSide };
    if (opts?.cutout) { params.alphaTest = 0.45; params.transparent = true; }
    return new THREE.MeshLambertMaterial(params);
  };

  const group = new THREE.Group();

  // ── head: mesh centered in a NECK PIVOT at y=1.5 (vanilla: head sits on the
  //    body top, rotation happens at the neck so the look-at feels natural)
  const headPivot = new THREE.Group();
  headPivot.position.y = 1.5;
  group.add(headPivot);

  const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  boxUV(headGeo, LAY.head, TEX_W, TEX_H);
  const head = new THREE.Mesh(headGeo, mk());
  head.position.y = 0.25; // head occupies 1.5..2.0
  headPivot.add(head);

  // hat layer: same box +0.5px inflate, hair texels only (cutout)
  const hatGeo = new THREE.BoxGeometry(0.5625, 0.5625, 0.5625);
  boxUV(hatGeo, LAY.hat, TEX_W, TEX_H);
  const hat = new THREE.Mesh(hatGeo, mk({ cutout: true }));
  hat.position.y = 0.25;
  hat.renderOrder = 2;
  headPivot.add(hat);

  // ── body 0.5×0.75×0.25 (0.75..1.5)
  const bodyGeo = new THREE.BoxGeometry(0.5, 0.75, 0.25);
  boxUV(bodyGeo, LAY.body, TEX_W, TEX_H);
  const body = new THREE.Mesh(bodyGeo, mk());
  body.position.y = 1.125;
  group.add(body);

  // ── legs: HIP PIVOTS at y=0.75 (top of leg), boxes hang below
  const legs: THREE.Mesh[] = [];
  const legMeshes: THREE.Mesh[] = [];
  const legLay = [LAY.legR, LAY.legL];
  for (let i = 0; i < 2; i++) {
    const sx = i === 0 ? -1 : 1;
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.125, 0.75, 0);
    const geo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
    boxUV(geo, legLay[i], TEX_W, TEX_H);
    const leg = new THREE.Mesh(geo, mk());
    leg.position.y = -0.375;
    pivot.add(leg);
    group.add(pivot);
    legs.push(pivot as unknown as THREE.Mesh);
    legMeshes.push(leg);
  }

  // ── arms: SHOULDER PIVOTS at y=1.375 (vanilla 22px), boxes hang below with a
  //    2px rise above the pivot (vanilla addBox(±3,−2,−2,4,12,4))
  const arms: THREE.Mesh[] = [];
  const armLay = [LAY.armR, LAY.armL];
  for (let i = 0; i < 2; i++) {
    const sx = i === 0 ? -1 : 1;
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.3125, 1.375, 0);
    const geo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
    boxUV(geo, armLay[i], TEX_W, TEX_H);
    const arm = new THREE.Mesh(geo, mk());
    arm.position.y = -0.25; // spans pivot+0.125 .. pivot−0.625
    pivot.add(arm);
    group.add(pivot);
    arms.push(arm);
    (arm as unknown as { limbPivot: THREE.Group }).limbPivot = pivot;
  }

  return { group, head, hat, body, legs, legMeshes, arms };
}

export function createPlayerModel(scene: THREE.Scene): PlayerModelParts {
  const steve = createSteveModel();
  const group = steve.group;

  const armorGroup = new THREE.Group();
  group.add(armorGroup);

  const helmetGroup = new THREE.Group();
  helmetGroup.visible = false;

  // shadow blob
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  scene.add(shadow);

  scene.add(group);
  return {
    group,
    head: steve.head,
    hat: steve.hat,
    body: steve.body,
    legs: steve.legs,
    legMeshes: steve.legMeshes,
    arms: steve.arms,
    shadow,
    armorGroup,
    helmetGroup,
    armorKey: '',
    bootMeshes: [],
  };
}

// ─── armor overlays (3rd person) ────────────────────────────────────────────
const ARMOR_MODEL_COLORS: Record<string, number> = {
  leather: 0xa5662c,
  iron: 0xd8d8d8,
  gold: 0xf6d33c,
  diamond: 0x5ce8d5,
};

function armorMat(id: number): THREE.MeshLambertMaterial {
  const tier = id >= 313 ? 'diamond' : id >= 309 ? 'gold' : id >= 305 ? 'iron' : 'leather';
  const c = ARMOR_MODEL_COLORS[tier];
  return new THREE.MeshLambertMaterial({
    color: c,
    transparent: tier === 'leather' ? true : false,
    opacity: tier === 'leather' ? 0.92 : 1,
  });
}

function aBox(w: number, h: number, d: number, mat: THREE.MeshLambertMaterial): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = false;
  return m;
}

/**
 * sync the 3rd-person model's armor overlays with the player's equipped pieces.
 * armorIds: [helmet, chest, legs, boots] item ids (null = empty).
 */
export function setPlayerModelArmor(model: PlayerModelParts, armorIds: (number | null)[]): void {
  const key = armorIds.map((a) => a ?? 0).join(',');
  if (key === model.armorKey) return;
  model.armorKey = key;

  // clear old (boots live on the leg meshes — remove them first)
  for (const boot of model.bootMeshes) {
    boot.parent?.remove(boot);
    (boot.material as THREE.MeshLambertMaterial).dispose();
    boot.geometry.dispose();
  }
  model.bootMeshes = [];
  for (const child of [...model.armorGroup.children]) {
    model.armorGroup.remove(child);
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.MeshLambertMaterial | THREE.MeshLambertMaterial[];
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
    mesh.geometry.dispose();
  }

  // helmet (0): parented to the NECK PIVOT (follows sneak/head bob), face open.
  // local coords: pivot y=1.5 world → cap at local 0.38 = world 1.88, etc.
  {
    const headPivot = model.head.parent;
    for (const c of [...model.helmetGroup.children]) {
      model.helmetGroup.remove(c);
      const mesh = c as THREE.Mesh;
      const mat = mesh.material as THREE.MeshLambertMaterial;
      mat.dispose();
      mesh.geometry.dispose();
    }
    model.helmetGroup.visible = !!armorIds[0];
    model.hat.visible = !armorIds[0]; // hair hides under a helmet (vanilla)
    if (armorIds[0] && headPivot) {
      headPivot.add(model.helmetGroup);
      const mat = armorMat(armorIds[0]!);
      const cap = aBox(0.58, 0.24, 0.58, mat);
      cap.position.y = 0.38; // world 1.88 (head top 2.0)
      const shell = aBox(0.58, 0.36, 0.58, mat);
      shell.position.set(0, 0.18, 0.05); // shifted back, front open
      const brow = aBox(0.58, 0.12, 0.08, mat);
      brow.position.set(0, 0.4, 0.27);
      model.helmetGroup.add(cap, shell, brow);
    }
  }

  // chestplate (1): torso shell + shoulder pads
  if (armorIds[1]) {
    const mat = armorMat(armorIds[1]!);
    const torso = aBox(0.54, 0.78, 0.3, mat);
    torso.position.y = 1.125;
    const shL = aBox(0.29, 0.28, 0.29, mat);
    shL.position.set(-0.3125, 1.42, 0);
    const shR = aBox(0.29, 0.28, 0.29, mat);
    shR.position.set(0.3125, 1.42, 0);
    model.armorGroup.add(torso, shL, shR);
  }

  // leggings (2): upper-leg shells + waistband
  if (armorIds[2]) {
    const mat = armorMat(armorIds[2]!);
    const waist = aBox(0.54, 0.18, 0.3, mat);
    waist.position.y = 0.84;
    for (const sx of [-1, 1]) {
      const leg = aBox(0.29, 0.46, 0.29, mat);
      leg.position.set(sx * 0.125, 0.58, 0);
      model.armorGroup.add(leg);
    }
    model.armorGroup.add(waist);
  }

  // boots (3): lower-leg + toe shells (attach to the leg boxes inside the hip
  // pivots so they swing with walk)
  if (armorIds[3]) {
    const mat = armorMat(armorIds[3]!);
    for (let i = 0; i < 2; i++) {
      const boot = aBox(0.29, 0.3, 0.31, mat);
      boot.position.set(0, -0.55, 0.02);
      model.legMeshes[i].add(boot);
      model.bootMeshes.push(boot);
    }
  }

  // hide the whole group when nothing equipped (helmet handled above)
  model.armorGroup.visible = armorIds.some((a, i) => !!a && i > 0);
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
    const pivot = (arm as unknown as { limbPivot?: THREE.Group }).limbPivot;
    if (pivot) {
      pivot.rotation.x = -swing * 0.8;
      pivot.rotation.z = Math.sin(walkPhase * 0.5) * 0.04;
    }
  }
  // head pitch at the NECK pivot (invert: camera pitch up = head up)
  const headPivot = model.head.parent;
  if (headPivot) headPivot.rotation.x = -pitch * 0.85;
  // sneak crouch
  model.body.position.y = sneaking ? 1.05 : 1.125;
  const hp = model.head.parent;
  if (hp) hp.position.y = sneaking ? 1.42 : 1.5;
  // death: fall over
  if (dead || deathT > 0) {
    model.group.rotation.z = Math.min(Math.PI / 2, model.group.rotation.z + 0.1);
  } else {
    model.group.rotation.z = 0;
  }
  model.shadow.position.set(x, y + 0.03, z);
}
