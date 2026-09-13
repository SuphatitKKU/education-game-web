import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { MaterialDefinition } from "./data";
import { ABSORPTION_STEP_MS, type AbsorptionPhase } from "./absorption";
import { createMaterialModelLibrary } from "./material-model-3d";
import { detectRenderCompatibility, handleWebGLContextLoss, listenToMediaQuery, observeElementResize } from "./browser-compat";

type StripAssembly = {
  root: THREE.Group;
  modelRoot: THREE.Group;
  wetMaterial: THREE.MeshBasicMaterial;
  wetLayer: THREE.Mesh;
  wetLine: THREE.Mesh;
  drops: THREE.Group;
};

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
    camera.position.set(Math.sin(angle) * 8.5, 4.8, Math.cos(angle) * 8.5);
    camera.lookAt(0, 1.2, 0);
  };
  pointCamera();

  const station = new THREE.Group();
  scene.add(station);
  box(station, [7.2, .22, 2.8], surface("#d9e4eb", .05, .52), 0, .12, 0, .09);
  box(station, [6.5, .16, 2.15], surface("#f4f8fb", .05, .65), 0, .3, 0, .08);

  const commonCupWall = surface("#8ed7f2", .02, .16, true, .28);
  const commonCupBase = surface("#9bdcf4", .02, .22, true, .52);
  const commonWater = surface("#238fe0", .02, .14, true, .76);
  const commonWaterSurface = surface("#54bdf0", .02, .1, true, .68);
  const beakerGlass = surface("#dff7ff", .04, .12, true, .24);
  beakerGlass.side = THREE.DoubleSide;
  const beakerRim = surface("#d9f4ff", .06, .15, true, .62);
  beakerRim.side = THREE.DoubleSide;
  const holderMaterial = surface("#4f8cad", .18, .34);
  const materialModels = createMaterialModelLibrary(track);
  const assemblies: StripAssembly[] = [];
  const xPositions = [-2.9, -1.45, 0, 1.45, 2.9];
  for (const x of xPositions) {
    const root = new THREE.Group();
    root.position.x = x;
    station.add(root);
    const cup = new THREE.Group();
    root.add(cup);
    // The beaker is a fixed child of the station (never the animated strip root),
    // with a foot and retaining collar that visually lock it to the test base.
    mesh(cup, new THREE.CylinderGeometry(.62, .56, 1.36, 40, 1, true), beakerGlass, 0, 1.12, 0);
    mesh(cup, new THREE.CylinderGeometry(.55, .53, .08, 40), commonCupBase, 0, .45, 0);
    mesh(cup, new THREE.CylinderGeometry(.52, .52, .72, 40), commonWater, 0, .82, 0);
    mesh(cup, new THREE.CylinderGeometry(.52, .52, .025, 40), commonWaterSurface, 0, 1.18, 0);
    const rim = mesh(cup, new THREE.TorusGeometry(.59, .045, 10, 40), beakerRim, 0, 1.81, 0);
    rim.rotation.x = Math.PI / 2;
    const foot = mesh(cup, new THREE.CylinderGeometry(.58, .62, .12, 40), holderMaterial, 0, .39, 0);
    foot.renderOrder = 1;
    const collar = mesh(cup, new THREE.TorusGeometry(.57, .065, 10, 40), holderMaterial, 0, .47, 0);
    collar.rotation.x = Math.PI / 2;
    collar.renderOrder = 2;

    const stripRoot = new THREE.Group();
    root.add(stripRoot);
    const modelRoot = new THREE.Group();
    modelRoot.position.set(0, 2.7, .02);
    stripRoot.add(modelRoot);
    const stripBorder = surface("#172033", 0, .68);
    box(stripRoot, [.045, 2.78, .055], stripBorder, -.45, 2.7, .16, .004);
    box(stripRoot, [.045, 2.78, .055], stripBorder, .45, 2.7, .16, .004);
    box(stripRoot, [.9, .045, .055], stripBorder, 0, 4.09, .16, .004);
    box(stripRoot, [.9, .045, .055], stripBorder, 0, 1.31, .16, .004);
    const wetMaterial = track(new THREE.MeshBasicMaterial({ color: "#24baf3", transparent: true, opacity: .62, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    const wetLayer = box(stripRoot, [.74, 1, .065], wetMaterial, 0, 1.3, .2, .018);
    wetLayer.renderOrder = 4;
    const wetLineMaterial = track(new THREE.MeshBasicMaterial({ color: "#0576b9", transparent: true, opacity: .95, depthWrite: false, depthTest: false }));
    const wetLine = box(stripRoot, [.8, .035, .075], wetLineMaterial, 0, 1.3, .22, .008);
    wetLine.renderOrder = 5;
    const drops = new THREE.Group();
    root.add(drops);
    const dropMaterial = surface("#54c6fb", .02, .08, true, .86);
    for (let index = 0; index < 3; index++) {
      const drop = mesh(drops, new THREE.SphereGeometry(.09, 16, 12), dropMaterial, (index - 1) * .25, 1.85 + index * .15, (index % 2 - .5) * .22);
      drop.scale.y = 1.4;
    }
    drops.visible = false;
    assemblies.push({ root: stripRoot, modelRoot, wetMaterial, wetLayer, wetLine, drops });
  }

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
  const shadow = mesh(station, new THREE.PlaneGeometry(7.6, 3.3), track(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false })), 0, .045, 0);
  shadow.rotation.x = -Math.PI / 2;
  station.scale.setScalar(.9);

  let selected: MaterialDefinition[] = [];
  let phase: AbsorptionPhase = "idle";
  let phaseStart = 0;
  let frame = 0;
  let disposed = false;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function applyPose(now: number) {
    const progress = motion.matches ? 1 : Math.min(1, (now - phaseStart) / ABSORPTION_STEP_MS);
    const immersing = phase === "immersing";
    const holding = phase === "holding";
    const submerged = holding || phase === "done";
    const immersionProgress = immersing ? progress * progress : submerged ? 1 : 0;
    const wetProgress = holding ? progress : phase === "done" ? 1 : 0;
    assemblies.forEach((assembly, index) => {
      const material = selected[index];
      const rise = material ? Math.min(1.85, Math.max(0, material.waterRiseCm / 10 * 1.85)) : 0;
      assembly.root.position.y = THREE.MathUtils.lerp(0, -.38, immersionProgress);
      assembly.drops.visible = immersing;
      assembly.drops.position.y = THREE.MathUtils.lerp(0, -.35, immersionProgress);
      assembly.wetLayer.visible = submerged && rise > 0;
      assembly.wetLine.visible = submerged && rise > 0;
      assembly.wetLayer.scale.y = Math.max(.02, rise * wetProgress);
      assembly.wetLayer.position.y = 1.3 + (rise * wetProgress) / 2;
      assembly.wetLine.position.y = 1.3 + rise * wetProgress;
      assembly.wetMaterial.opacity = rise > 0 ? .7 : 0;
    });
  }

  function render(now: number) {
    frame = 0;
    if (disposed || document.hidden) return;
    applyPose(now);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, compatibility.maxDevicePixelRatio);
    const renderWidth = Math.round(width * dpr);
    const renderHeight = Math.round(height * dpr);
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) renderer.setSize(renderWidth, renderHeight, false);
    const aspect = renderWidth / renderHeight;
    const halfHeight = angle === 0 ? 2.95 : 3.15;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    try { renderer.render(scene, camera); } catch { onFailure(); return; }
    if ((phase === "immersing" || phase === "holding") && now - phaseStart < ABSORPTION_STEP_MS) schedule();
  }
  function schedule() { if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(render); }
  const stopResize = observeElementResize(canvas, schedule);
  const visibilityChanged = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); };
  const contextLost = (event: Event) => handleWebGLContextLoss(event, onFailure, "absorption");
  document.addEventListener("visibilitychange", visibilityChanged);
  const stopMotion = listenToMediaQuery(motion, schedule);
  canvas.addEventListener("webglcontextlost", contextLost);

  return {
    update(materials: MaterialDefinition[], nextPhase: AbsorptionPhase, startedAt: number) {
      selected = materials;
      phase = nextPhase;
      phaseStart = startedAt;
      materials.forEach((material, index) => {
        const assembly = assemblies[index];
        if (!assembly) return;
        assembly.modelRoot.clear();
        const model = materialModels.get(material.id);
        // Material models are authored as horizontal slabs. Rotate the shared
        // model upright so this room shows the same 3D material geometry as
        // the compression and impact rooms.
        model.rotation.x = Math.PI / 2;
        model.scale.set(.38, .75, 1.85);
        model.position.set(0, 0, 0);
        assembly.modelRoot.add(model);
      });
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
