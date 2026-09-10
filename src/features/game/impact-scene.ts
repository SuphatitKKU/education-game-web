import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { ImpactDamage, MaterialDefinition } from "./data";
import { IMPACT_DROP_MS, IMPACT_GRIPPER_MS, IMPACT_SETTLE_MS, impactDamageFor, type ImpactPhase } from "./impact";
import { createMaterialModelLibrary } from "./material-model-3d";
import { detectRenderCompatibility, handleWebGLContextLoss, observeElementResize } from "./browser-compat";

export function createImpactScene(canvas: HTMLCanvasElement, onFailure: () => void) {
  const compatibility = detectRenderCompatibility();
  if (compatibility.webglVersion === 0) throw new Error("WebGL is unavailable");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: compatibility.antialias, precision: compatibility.precision, powerPreference: "low-power" });
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const resources = new Set<{ dispose: () => void }>();
  const track = <T extends { dispose: () => void }>(value: T) => { resources.add(value); return value; };
  const surface = (color: string, metalness = 0, roughness = .55, transparent = false, opacity = 1) =>
    track(new THREE.MeshStandardMaterial({ color, metalness, roughness, transparent, opacity }));
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(track(geometry), material);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  };
  const box = (parent: THREE.Object3D, size: [number, number, number], material: THREE.Material, x: number, y: number, z: number, radius = .04) =>
    mesh(parent, new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map((value) => value / 3))), material, x, y, z);
  const cylinder = (parent: THREE.Object3D, radius: number, height: number, material: THREE.Material, x: number, y: number, z: number) =>
    mesh(parent, new THREE.CylinderGeometry(radius, radius, height, 24), material, x, y, z);
  const materialModels = createMaterialModelLibrary(track);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf8fcff, 0x80919b, 2.3));
  const key = new THREE.DirectionalLight(0xfff3df, 3.4);
  key.position.set(-4, 7, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd7eaff, 2.4);
  rim.position.set(4, 4, -4);
  scene.add(rim);

  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
  let angle = 0;
  const pointCamera = () => {
    camera.position.set(Math.sin(angle) * 8, 3.2, Math.cos(angle) * 8);
    camera.lookAt(0, 1.78, 0);
  };
  pointCamera();

  const rig = new THREE.Group();
  scene.add(rig);
  const steel = surface("#b8c8d4", .58, .32);
  const chrome = surface("#dce6ed", .72, .22);
  const dark = surface("#526879", .35, .5);
  const blue = surface("#6d9fdc", .18, .34);
  const bed = surface("#617d91", .12, .7);
  box(rig, [3.25, .25, 2.05], steel, 0, .16, 0, .09);
  box(rig, [2.76, .13, 1.7], bed, 0, .36, 0, .025);
  for (const x of [-1.34, 1.34]) {
    cylinder(rig, .11, 2.9, chrome, x, 1.82, 0);
    cylinder(rig, .16, .13, dark, x, .42, 0);
    cylinder(rig, .16, .13, dark, x, 3.22, 0);
  }
  box(rig, [3.02, .3, .82], blue, 0, 3.34, 0, .07);
  box(rig, [2.7, .045, .04], chrome, 0, 3.46, .42, .01);
  cylinder(rig, .09, .4, chrome, 0, 3.01, 0);

  // A visible two-jaw gripper holds the egg before each drop.
  const gripper = new THREE.Group();
  gripper.name = "animated-egg-gripper";
  rig.add(gripper);
  box(gripper, [.58, .27, .52], steel, 0, 2.76, 0, .08);
  const hinge = cylinder(gripper, .13, .69, dark, 0, 2.68, 0);
  hinge.rotation.x = Math.PI / 2;
  const gripPad = surface("#34556d", .12, .72);
  const makeJaw = (side: -1 | 1) => {
    const jaw = new THREE.Group();
    jaw.position.set(side * .3, 2.66, 0);
    gripper.add(jaw);
    const arm = box(jaw, [.105, .56, .17], steel, side * .06, -.25, 0, .04);
    arm.rotation.z = side * .12;
    const pad = box(jaw, [.115, .25, .28], gripPad, side * .115, -.51, 0, .045);
    pad.rotation.z = side * .12;
    return jaw;
  };
  const leftJaw = makeJaw(-1);
  const rightJaw = makeJaw(1);

  const materialRoot = new THREE.Group();
  materialRoot.position.y = .43;
  rig.add(materialRoot);

  let selected: MaterialDefinition | undefined;
  let phase: ImpactPhase = "idle";
  let phaseStart = 0;
  let frame = 0;
  let disposed = false;

  const egg = new THREE.Group();
  egg.name = "egg";
  const eggModelRoot = new THREE.Group();
  egg.add(eggModelRoot);
  const eggShape = [
    new THREE.Vector2(0, -.48), new THREE.Vector2(.28, -.42), new THREE.Vector2(.39, -.18),
    new THREE.Vector2(.42, .08), new THREE.Vector2(.34, .34), new THREE.Vector2(.17, .55), new THREE.Vector2(0, .62),
  ];
  const fallbackEgg = mesh(eggModelRoot, new THREE.LatheGeometry(eggShape, 64), surface("#f2d3a2", 0, .31), 0, 0, 0);
  fallbackEgg.scale.setScalar(.8);
  egg.position.y = 2;
  rig.add(egg);

  const eggVariants = new Map<ImpactDamage, THREE.Object3D>();
  let shownVariant: ImpactDamage | "fallback" = "fallback";
  const modelAsset = (name: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/models/${name}.glb`;
  const modelFiles: Record<ImpactDamage, string> = {
    none: "impact_egg_intact",
    slight: "impact_egg_slight",
    much: "impact_egg_much",
  };
  const collectModelResources = (root: THREE.Object3D) => root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  const disposeModelResources = (root: THREE.Object3D) => root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
  const showEggVariant = (damage: ImpactDamage) => {
    const model = eggVariants.get(damage);
    if (!model || shownVariant === damage) return;
    eggModelRoot.clear();
    model.scale.setScalar(.72);
    eggModelRoot.add(model);
    shownVariant = damage;
  };
  const loader = new GLTFLoader();
  for (const damage of Object.keys(modelFiles) as ImpactDamage[]) {
    void loader.loadAsync(modelAsset(modelFiles[damage])).then(({ scene: model }) => {
      if (disposed) {
        disposeModelResources(model);
        return;
      }
      model.name = `blender-egg-${damage}`;
      collectModelResources(model);
      eggVariants.set(damage, model);
      const hit = phase === "settling" || phase === "done";
      const desired = hit && selected ? impactDamageFor(selected.id) : "none";
      if (desired === damage) showEggVariant(damage);
      schedule();
    }).catch(() => { /* Keep the procedural egg if a model cannot be loaded. */ });
  }

  const shadowTextureCanvas = document.createElement("canvas");
  shadowTextureCanvas.width = shadowTextureCanvas.height = 64;
  const context = shadowTextureCanvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 3, 32, 32, 32);
    gradient.addColorStop(0, "rgba(34,61,82,.28)");
    gradient.addColorStop(1, "rgba(34,61,82,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  const shadowTexture = track(new THREE.CanvasTexture(shadowTextureCanvas));
  const shadow = mesh(rig, new THREE.PlaneGeometry(4.3, 2.8), track(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false })), 0, .025, 0);
  shadow.rotation.x = -Math.PI / 2;

  function applyPose(now: number) {
    const elapsed = now - phaseStart;
    // These movements communicate the experiment itself, so they must not be
    // skipped by an OS-level reduced-motion preference.
    const gripperProgress = Math.min(1, elapsed / IMPACT_GRIPPER_MS);
    const dropProgress = Math.min(1, elapsed / IMPACT_DROP_MS);
    const settleProgress = Math.min(1, elapsed / IMPACT_SETTLE_MS);
    const startY = 2;
    const contactY = 1.13;
    egg.position.y = phase === "dropping"
      ? THREE.MathUtils.lerp(startY, contactY, dropProgress * dropProgress)
      : phase === "settling"
        ? contactY + Math.sin(settleProgress * Math.PI * 2) * .13 * (1 - settleProgress)
        : phase === "done" ? contactY : startY;
    const damage = selected ? impactDamageFor(selected.id) : "none";
    const hit = phase === "settling" || phase === "done";
    showEggVariant(hit ? damage : "none");
    let jawAngle = 0;
    let squeeze = 0;
    if (phase === "preparing") {
      const clampEnd = .36;
      const holdEnd = .48;
      if (gripperProgress <= clampEnd) {
        const progress = gripperProgress / clampEnd;
        const eased = progress * progress * (3 - 2 * progress);
        jawAngle = -.06 * eased;
        squeeze = eased;
      } else if (gripperProgress <= holdEnd) {
        jawAngle = -.06;
        squeeze = 1;
      } else {
        const progress = (gripperProgress - holdEnd) / (1 - holdEnd);
        const eased = progress * progress * (3 - 2 * progress);
        jawAngle = THREE.MathUtils.lerp(-.06, .58, eased);
        squeeze = 1 - eased;
      }
    } else if (phase !== "idle") jawAngle = .58;

    egg.scale.set(1 - squeeze * .015, 1 + squeeze * .006, 1);
    egg.rotation.z = 0;
    leftJaw.rotation.z = -jawAngle;
    rightJaw.rotation.z = jawAngle;
  }

  function render(now: number) {
    frame = 0;
    if (disposed || !selected || document.hidden) return;
    applyPose(now);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, compatibility.maxDevicePixelRatio);
    const renderWidth = Math.round(width * dpr);
    const renderHeight = Math.round(height * dpr);
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) renderer.setSize(renderWidth, renderHeight, false);
    const aspect = renderWidth / renderHeight;
    const halfHeight = angle === 0 ? 2.02 : 2.18;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    try { renderer.render(scene, camera); } catch { onFailure(); return; }
    const duration = phase === "preparing" ? IMPACT_GRIPPER_MS : phase === "dropping" ? IMPACT_DROP_MS : phase === "settling" ? IMPACT_SETTLE_MS : 0;
    if (duration && now - phaseStart < duration) schedule();
  }
  function schedule() { if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(render); }
  const stopResize = observeElementResize(canvas, schedule);
  const visibilityChanged = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); };
  const contextLost = (event: Event) => handleWebGLContextLoss(event, onFailure, "impact");
  document.addEventListener("visibilitychange", visibilityChanged);
  canvas.addEventListener("webglcontextlost", contextLost);

  return {
    update(material: MaterialDefinition, nextPhase: ImpactPhase, startedAt: number) {
      if (selected?.id !== material.id) {
        materialRoot.clear();
        materialRoot.add(materialModels.get(material.id));
      }
      selected = material;
      phase = nextPhase;
      phaseStart = startedAt;
      schedule();
    },
    setView(value: "front" | "perspective") { angle = value === "front" ? 0 : .28; pointCamera(); schedule(); },
    rotate(delta: number) { angle = THREE.MathUtils.clamp(angle + delta, -.72, .72); pointCamera(); schedule(); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      stopResize();
      document.removeEventListener("visibilitychange", visibilityChanged);
      canvas.removeEventListener("webglcontextlost", contextLost);
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

export type ImpactScene = ReturnType<typeof createImpactScene>;
