import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { MaterialDefinition } from "./data";
import { APPROACH_DURATION_MS, LIFT_DURATION_MS, PRESS_DURATION_MS, PRESS_GEOMETRY, compressionPose, type CompressionPhase } from "./compression";

/** A single WebGL context renders both comparison views, only when something changes. */
export function createCompressionScene(canvas: HTMLCanvasElement, onFailure: () => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
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
  const specimenEdge = track(new THREE.LineBasicMaterial({ color: "#38566d", toneMapped: false }));
  const paperEdge = track(new THREE.LineBasicMaterial({ color: "#795027", toneMapped: false }));
  const bubbleOutline = track(new THREE.MeshBasicMaterial({ color: "#63849b", side: THREE.BackSide, toneMapped: false }));
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
  const outlineSlab = (parent: THREE.Object3D, height: number, y: number, material = specimenEdge) => {
    const shape = new THREE.BoxGeometry(2.18, height, 1.48);
    const outline = new THREE.LineSegments(track(new THREE.EdgesGeometry(shape)), material);
    shape.dispose();
    outline.position.y = y;
    parent.add(outline);
  };

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf5fbff, 0x8396a2, 2));
  const key = new THREE.DirectionalLight(0xfff6e9, 3.2);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8eaff, 2.5);
  rim.position.set(4, 3, -3);
  scene.add(rim);

  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
  let angle = .3;
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
  const specimens = new Map<string, THREE.Group>();

  function createSpecimen(id: string) {
    const cached = specimens.get(id);
    if (cached) return cached;
    const group = new THREE.Group();
    const height = PRESS_GEOMETRY.specimenHeight;
    if (id === "corrugated_cardboard") {
      const paper = surface("#d99b49", 0, .9);
      const flute = surface("#b67c32", 0, .9);
      for (const y of [.015, height - .015]) {
        box(group, [2.18, .03, 1.48], paper, 0, y, 0, .005);
        outlineSlab(group, .03, y, paperEdge);
      }
      const wave = new THREE.Shape();
      const yAt = (x: number) => height / 2 + .092 * Math.sin((x + 1.09) * Math.PI * 2 * 5);
      for (let i = 0; i <= 160; i++) {
        const x = -1.09 + 2.18 * i / 160;
        if (i === 0) wave.moveTo(x, yAt(x) + .012);
        else wave.lineTo(x, yAt(x) + .012);
      }
      for (let i = 160; i >= 0; i--) {
        const x = -1.09 + 2.18 * i / 160;
        wave.lineTo(x, yAt(x) - .012);
      }
      wave.closePath();
      mesh(group, new THREE.ExtrudeGeometry(wave, { depth: 1.46, bevelEnabled: false, steps: 1 }), flute, 0, 0, -.73);
      const grain = surface("#c48c43", 0, 1);
      for (let i = 0; i < 9; i++) box(group, [.45 + (i % 3) * .15, .002, .008], grain, (i % 3 - 1) * .63, height + .001, (Math.floor(i / 3) - 1) * .42, .001);
    } else if (id === "bubble_wrap") {
      const plastic = surface("#dcecf4", .04, .26);
      const bubble = surface("#e6f5ff", .1, .18);
      box(group, [2.18, .035, 1.48], plastic, 0, .0175, 0, .008);
      outlineSlab(group, .035, .0175);
      const geometry = track(new THREE.SphereGeometry(.135, 16, 10));
      for (let x = 0; x < 8; x++) for (let z = 0; z < 5; z++) {
        const dome = mesh(group, geometry, bubble, -.94 + x * .268, .035 + .1125, -.58 + z * .29);
        dome.scale.y = .1125 / .135;
        // The back-face shell draws a silhouette without a wireframe over the bubble.
        const outline = new THREE.Mesh(geometry, bubbleOutline);
        outline.scale.setScalar(1.08);
        dome.add(outline);
      }
    } else if (id === "closed_cell_pe_foam") {
      const foam = surface("#f0f2e9", 0, 1);
      box(group, [2.18, height, 1.48], foam, 0, height / 2, 0, .025);
      outlineSlab(group, height, height / 2);
      const pores = surface("#d6ddd5", 0, 1);
      const geometry = track(new THREE.SphereGeometry(.012, 5, 4));
      for (let i = 0; i < 150; i++) {
        // Deterministic pores; the surface stays the same between comparison views.
        const x = ((i * 73) % 149) / 149 * 2.1 - 1.05;
        const z = ((i * 37) % 151) / 151 * 1.4 - .7;
        const pore = mesh(group, geometry, pores, x, height - .006, z);
        pore.scale.y = .4;
      }
    } else if (id === "cardboard") {
      box(group, [2.18, height - .035, 1.48], surface("#a5a7a5", 0, .95), 0, (height - .035) / 2, 0, .008);
      box(group, [2.18, .035, 1.48], surface("#fafaf7", 0, .8), 0, height - .0175, 0, .006);
      outlineSlab(group, height, height / 2);
      outlineSlab(group, .035, height - .0175);
      const edge = surface("#878e90", 0, 1);
      for (let i = 1; i < 5; i++) box(group, [2.15, .004, .008], edge, 0, i * .043, .741, .001);
    } else {
      const plastic = surface("#92d0f4", .08, .2);
      box(group, [2.18, height, 1.48], plastic, 0, height / 2, 0, .018);
      outlineSlab(group, height, height / 2);
      const highlight = surface("#d8f0ff", 0, .2);
      for (let i = 0; i < 3; i++) {
        const strip = box(group, [.07, .003, .88], highlight, -.68 + i * .57, height + .002, .05, .001);
        strip.rotation.y = .55;
      }
    }
    specimens.set(id, group);
    return group;
  }

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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
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
  const resize = new ResizeObserver(schedule);
  resize.observe(canvas);
  const visibilityChanged = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); };
  const contextLost = (event: Event) => { event.preventDefault(); onFailure(); };
  document.addEventListener("visibilitychange", visibilityChanged);
  motion.addEventListener("change", schedule);
  canvas.addEventListener("webglcontextlost", contextLost);

  return {
    update(material: MaterialDefinition, nextPhase: CompressionPhase, startedAt: number) {
      if (selected?.id !== material.id) {
        specimen.clear();
        beforeSpecimen.clear();
        const model = createSpecimen(material.id);
        specimen.add(model.clone(true));
        beforeSpecimen.add(model.clone(true));
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
      resize.disconnect();
      document.removeEventListener("visibilitychange", visibilityChanged);
      motion.removeEventListener("change", schedule);
      canvas.removeEventListener("webglcontextlost", contextLost);
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

export type CompressionScene = ReturnType<typeof createCompressionScene>;
