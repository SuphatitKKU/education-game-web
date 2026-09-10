import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { MaterialDefinition } from "./data";
import { ABSORPTION_STEP_MS, type AbsorptionPhase } from "./absorption";
import { createMaterialModelLibrary } from "./material-model-3d";
import { detectRenderCompatibility, handleWebGLContextLoss, listenToMediaQuery, observeElementResize } from "./browser-compat";

export function createAbsorptionScene(canvas: HTMLCanvasElement, onFailure: () => void) {
  const compatibility = detectRenderCompatibility();
  if (compatibility.webglVersion === 0) throw new Error("WebGL is unavailable");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: compatibility.antialias, precision: compatibility.precision, powerPreference: "low-power" });
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.17;

  const resources = new Set<{ dispose: () => void }>();
  const track = <T extends { dispose: () => void }>(value: T) => { resources.add(value); return value; };
  const surface = (color: string, metalness = 0, roughness = .55, transparent = false, opacity = 1) =>
    track(new THREE.MeshStandardMaterial({ color, metalness, roughness, transparent, opacity, depthWrite: !transparent }));
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(track(geometry), material);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  };
  const box = (parent: THREE.Object3D, size: [number, number, number], material: THREE.Material, x: number, y: number, z: number, radius = .04) =>
    mesh(parent, new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map((value) => value / 3))), material, x, y, z);
  const materialModels = createMaterialModelLibrary(track);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf7fcff, 0x82939c, 2.35));
  const key = new THREE.DirectionalLight(0xfff4e3, 3.5);
  key.position.set(-4, 7, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcde8ff, 2.6);
  rim.position.set(4, 4, -4);
  scene.add(rim);

  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
  let angle = 0;
  const pointCamera = () => {
    camera.position.set(Math.sin(angle) * 7.5, 3.6, Math.cos(angle) * 7.5);
    camera.lookAt(0, 1.25, 0);
  };
  pointCamera();

  const scale = new THREE.Group();
  scene.add(scale);
  const shell = surface("#7e8b92", .56, .35);
  const trim = surface("#cbd5da", .65, .25);
  const well = surface("#9daab0", .45, .38);
  const display = surface("#dcefe4", .02, .35);
  const dark = surface("#41525a", .25, .55);
  box(scale, [3.2, .9, 2.25], shell, 0, .55, 0, .16);
  box(scale, [2.85, .18, 1.92], trim, 0, 1.04, 0, .07);
  box(scale, [2.58, .1, 1.7], well, 0, 1.17, 0, .04);
  const screenFrame = box(scale, [1.8, .46, .08], dark, 0, .5, 1.13, .05);
  screenFrame.rotation.x = -.04;
  const screen = box(scale, [1.58, .31, .085], display, 0, .5, 1.175, .025);
  screen.rotation.x = -.04;

  const materialRoot = new THREE.Group();
  materialRoot.position.set(0, 1.23, 0);
  scale.add(materialRoot);

  const wetMaterial = surface("#36a9ef", .05, .18, true, .42);
  const wetLayer = mesh(scale, new RoundedBoxGeometry(2.06, .018, 1.36, 2, .008), wetMaterial, 0, 1.49, 0);
  wetLayer.visible = false;

  const drops = new THREE.Group();
  scale.add(drops);
  const water = surface("#3aaeff", .08, .12, true, .82);
  for (let index = 0; index < 7; index++) {
    const drop = mesh(drops, new THREE.SphereGeometry(.105, 18, 14), water, (index % 4 - 1.5) * .43, 2.47 + Math.floor(index / 4) * .22, (index % 3 - 1) * .3);
    drop.scale.y = 1.35;
  }
  drops.visible = false;

  const cloth = box(scale, [.92, .07, 1.15], surface("#f8fbff", 0, .92), -1.55, 1.64, 0, .035);
  cloth.rotation.z = -.1;
  cloth.visible = false;

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 64;
  const context = shadowCanvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 3, 32, 32, 32);
    gradient.addColorStop(0, "rgba(33,60,76,.25)");
    gradient.addColorStop(1, "rgba(33,60,76,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  const shadowTexture = track(new THREE.CanvasTexture(shadowCanvas));
  const shadow = mesh(scale, new THREE.PlaneGeometry(4.5, 3.3), track(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false })), 0, .045, 0);
  shadow.rotation.x = -Math.PI / 2;

  let selected: MaterialDefinition | undefined;
  let phase: AbsorptionPhase = "idle";
  let phaseStart = 0;
  let frame = 0;
  let disposed = false;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function applyPose(now: number) {
    if (!selected) return;
    const progress = motion.matches ? 1 : Math.min(1, (now - phaseStart) / ABSORPTION_STEP_MS);
    drops.visible = phase === "wetting";
    drops.position.y = phase === "wetting" ? THREE.MathUtils.lerp(0, -1.05, progress * progress) : 0;
    cloth.visible = phase === "wiping";
    cloth.position.x = phase === "wiping" ? THREE.MathUtils.lerp(-1.55, 1.55, progress) : -1.55;
    const afterWater = phase === "wetting" || phase === "wiping" || phase === "weighAfter" || phase === "done";
    wetLayer.visible = afterWater;
    wetMaterial.opacity = phase === "wetting" ? .48 : selected.waterDrops[2] === 0 ? .09 : Math.min(.58, .16 + selected.waterDrops[2] * .052);
    const absorbed = Math.min(.045, selected.waterDrops[2] * .005);
    wetLayer.scale.set(1 - absorbed, 1, 1 - absorbed);
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
    const halfHeight = angle === 0 ? 1.9 : 2.05;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    try { renderer.render(scene, camera); } catch { onFailure(); return; }
    if ((phase === "wetting" || phase === "wiping") && now - phaseStart < ABSORPTION_STEP_MS) schedule();
  }
  function schedule() { if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(render); }
  const stopResize = observeElementResize(canvas, schedule);
  const visibilityChanged = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); };
  const contextLost = (event: Event) => handleWebGLContextLoss(event, onFailure, "absorption");
  document.addEventListener("visibilitychange", visibilityChanged);
  const stopMotion = listenToMediaQuery(motion, schedule);
  canvas.addEventListener("webglcontextlost", contextLost);

  return {
    update(material: MaterialDefinition, nextPhase: AbsorptionPhase, startedAt: number) {
      if (selected?.id !== material.id) {
        materialRoot.clear();
        materialRoot.add(materialModels.get(material.id));
      }
      selected = material;
      phase = nextPhase;
      phaseStart = startedAt;
      schedule();
    },
    setView(value: "front" | "perspective") { angle = value === "front" ? 0 : .3; pointCamera(); schedule(); },
    rotate(delta: number) { angle = THREE.MathUtils.clamp(angle + delta, -.72, .72); pointCamera(); schedule(); },
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

export type AbsorptionScene = ReturnType<typeof createAbsorptionScene>;
