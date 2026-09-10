import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { MaterialDefinition } from "./data";
import { APPROACH_DURATION_MS, LIFT_DURATION_MS, PRESS_DURATION_MS, PRESS_GEOMETRY, compressionPose, type CompressionPhase } from "./compression";
import { createMaterialModelLibrary } from "./material-model-3d";
import { detectRenderCompatibility, handleWebGLContextLoss, listenToMediaQuery, observeElementResize } from "./browser-compat";

/** A single WebGL context renders both comparison views, only when something changes. */
export function createCompressionScene(canvas: HTMLCanvasElement, onFailure: () => void) {
  const compatibility = detectRenderCompatibility();
  if (compatibility.webglVersion === 0) throw new Error("WebGL is unavailable");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: compatibility.antialias, precision: compatibility.precision, powerPreference: "low-power" });
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.autoClear = false;

  const resources = new Set<{ dispose: () => void }>();
  const track = <T extends { dispose: () => void }>(value: T) => { resources.add(value); return value; };
  const surface = (color: string, metalness = 0, roughness = .55) => track(new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  const steel = surface("#b8c9d6", .62, .3);
  const chrome = surface("#d6e3ee", .75, .22);
  const dark = surface("#465a6c", .45);
  const blue = surface("#3984e7", .15, .3);
  const specimenBed = surface("#526d83", .12, .78);
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(track(geometry), material);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  };
  const box = (parent: THREE.Object3D, size: [number, number, number], material: THREE.Material, x: number, y: number, z: number, radius = .035) =>
    mesh(parent, new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map((v) => v / 3))), material, x, y, z);
  const cylinder = (parent: THREE.Object3D, radius: number, height: number, material: THREE.Material, x: number, y: number, z: number) =>
    mesh(parent, new THREE.CylinderGeometry(radius, radius, height, 20), material, x, y, z);
  const materialModels = createMaterialModelLibrary(track);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf5fbff, 0x8396a2, 2));
  const key = new THREE.DirectionalLight(0xfff6e9, 3.2);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8eaff, 2.5);
  rim.position.set(4, 3, -3);
  scene.add(rim);

  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
  let angle = 0;
  const pointCamera = () => {
    camera.position.set(Math.sin(angle) * 8, angle === 0 ? 2.05 : 3.35, Math.cos(angle) * 8);
    camera.lookAt(0, 1.48, 0);
  };
  pointCamera();

  const machine = new THREE.Group();
  box(machine, [3.12, .26, 2.05], steel, 0, .17, 0, .1);
  box(machine, [2.65, .13, 1.7], specimenBed, 0, .365, 0);
  for (const x of [-1.35, 1.35]) {
    cylinder(machine, .12, 2.45, chrome, x, 1.62, 0);
    for (const y of [.46, 2.72]) cylinder(machine, .17, .15, dark, x, y, 0);
    for (const z of [-.72, .72]) {
      cylinder(machine, .075, .055, dark, x, .32, z);
      box(machine, [.065, .008, .012], chrome, x, .352, z, .001);
    }
  }
  box(machine, [3.07, .29, .76], steel, 0, 2.94, 0, .07);
  box(machine, [2.6, .045, .035], chrome, 0, 3.04, .39, .01);
  box(machine, [.52, .16, .025], blue, 0, 2.95, .395, .012);
  cylinder(machine, .19, .38, dark, 0, 2.62, 0);
  const piston = cylinder(machine, .1, 1, chrome, 0, 2.2, 0);
  piston.name = "piston";
  const platen = box(machine, [2.38, PRESS_GEOMETRY.platenThickness, 1.65], steel, 0, 1.9, 0, .05);
  platen.name = "platen";
  const specimen = new THREE.Group();
  specimen.name = "specimen";
  specimen.position.y = PRESS_GEOMETRY.bedHeight;
  machine.add(specimen);

  // Soft contact shadow without a continuously updated shadow map.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 64;
  const context = shadowCanvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 32);
    gradient.addColorStop(0, "rgba(44,72,96,.24)");
    gradient.addColorStop(1, "rgba(44,72,96,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  const shadowTexture = track(new THREE.CanvasTexture(shadowCanvas));
  const shadow = mesh(machine, new THREE.PlaneGeometry(4.3, 3), track(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false })), 0, .02, 0);
  shadow.rotation.x = -Math.PI / 2;

  const baseline = machine.clone(true);
  scene.add(baseline, machine);
  const beforeSpecimen = baseline.getObjectByName("specimen")!;
  const beforePlaten = baseline.getObjectByName("platen")!;
  const beforePiston = baseline.getObjectByName("piston")!;

  let selected: MaterialDefinition | undefined;
  let phase: CompressionPhase = "idle";
  let phaseStart = 0;
  let frame = 0;
  let disposed = false;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function applyPose(rootSpecimen: THREE.Object3D, rootPlaten: THREE.Object3D, rootPiston: THREE.Object3D, pose: ReturnType<typeof compressionPose>) {
    rootSpecimen.scale.y = pose.scale;
    rootPlaten.position.y = pose.platenBottom + PRESS_GEOMETRY.platenThickness / 2;
    const top = pose.platenBottom + PRESS_GEOMETRY.platenThickness;
    rootPiston.scale.y = 2.61 - top;
    rootPiston.position.y = (2.61 + top) / 2;
  }

  function render(now: number) {
    frame = 0;
    if (disposed || !selected || document.hidden) return;
    const duration = phase === "lifting" ? LIFT_DURATION_MS : phase === "approach" ? APPROACH_DURATION_MS : PRESS_DURATION_MS;
    const progress = motion.matches ? 1 : Math.min(1, (now - phaseStart) / duration);
    applyPose(beforeSpecimen, beforePlaten, beforePiston, compressionPose(selected, "idle"));
    applyPose(specimen, platen, piston, compressionPose(selected, phase, progress));
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, compatibility.maxDevicePixelRatio);
    const renderWidth = Math.round(width * dpr);
    const renderHeight = Math.round(height * dpr);
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) renderer.setSize(renderWidth, renderHeight, false);
    const viewWidth = Math.floor(renderWidth * .475);
    const aspect = viewWidth / renderHeight;
    // Zoom the straight-on view; leave space for the corners when rotating.
    const verticalFit = angle === 0 ? 1.65 : 1.8 + .16 * Math.abs(Math.sin(angle));
    const halfHeight = Math.max(verticalFit, 1.9 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    try {
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
      for (const before of [true, false]) {
        baseline.visible = before;
        machine.visible = !before;
        const x = before ? 0 : renderWidth - viewWidth;
        renderer.setViewport(x, 0, viewWidth, renderHeight);
        renderer.setScissor(x, 0, viewWidth, renderHeight);
        renderer.render(scene, camera);
      }
    } catch {
      onFailure();
      return;
    }
    if ((phase === "lifting" || phase === "approach" || phase === "pressing") && progress < 1) schedule();
  }
  function schedule() { if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(render); }
  const stopResize = observeElementResize(canvas, schedule);
  const visibilityChanged = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); };
  const contextLost = (event: Event) => handleWebGLContextLoss(event, onFailure, "compression");
  document.addEventListener("visibilitychange", visibilityChanged);
  const stopMotion = listenToMediaQuery(motion, schedule);
  canvas.addEventListener("webglcontextlost", contextLost);

  return {
    update(material: MaterialDefinition, nextPhase: CompressionPhase, startedAt: number) {
      if (selected?.id !== material.id) {
        specimen.clear();
        beforeSpecimen.clear();
        specimen.add(materialModels.get(material.id));
        beforeSpecimen.add(materialModels.get(material.id));
      }
      selected = material;
      phase = nextPhase;
      phaseStart = startedAt;
      schedule();
    },
    setView(value: "front" | "perspective") { angle = value === "front" ? 0 : .3; pointCamera(); schedule(); },
    rotate(delta: number) { angle = THREE.MathUtils.clamp(angle + delta, -.75, .75); pointCamera(); schedule(); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      stopResize();
      document.removeEventListener("visibilitychange", visibilityChanged);
      stopMotion();
      canvas.removeEventListener("webglcontextlost", contextLost);
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

export type CompressionScene = ReturnType<typeof createCompressionScene>;
