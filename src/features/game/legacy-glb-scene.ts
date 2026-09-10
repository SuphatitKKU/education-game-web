import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { detectRenderCompatibility, handleWebGLContextLoss, observeElementResize } from "./browser-compat";

export type LegacyHotspotPosition = { left: number; top: number; visible: boolean };
export type LegacyGlbScene = {
  rotate: (delta: number) => void;
  setOrbit: (orbit: string, target?: string) => void;
  dispose: () => void;
};

function values(value: string) {
  return value.trim().split(/\s+/).map((part) => Number.parseFloat(part));
}

export function readLegacyTarget(value = "0m 0m 0m") {
  const [x = 0, y = 0, z = 0] = values(value);
  return new THREE.Vector3(x, y, z);
}

export function readLegacyOrbit(value = "30deg 65deg 8m") {
  const parts = value.trim().split(/\s+/);
  const angle = (part: string | undefined, fallback: number) => {
    if (!part || part === "auto") return fallback;
    const amount = Number.parseFloat(part);
    return part.includes("rad") ? amount : THREE.MathUtils.degToRad(amount);
  };
  return {
    theta: angle(parts[0], THREE.MathUtils.degToRad(30)),
    phi: angle(parts[1], THREE.MathUtils.degToRad(65)),
    radius: Number.parseFloat(parts[2] ?? "8") || 8,
  };
}

export function makeMaterialWebgl1Compatible(material: THREE.Material) {
  const physical = material as THREE.MeshPhysicalMaterial;
  if (!physical.isMeshPhysicalMaterial) return material;

  const replacement = new THREE.MeshStandardMaterial().copy(physical);
  if (physical.transmission > 0) {
    replacement.transparent = true;
    replacement.opacity = Math.max(.28, 1 - physical.transmission * .65);
    replacement.depthWrite = false;
  }
  replacement.name = physical.name;
  replacement.userData = physical.userData;
  replacement.needsUpdate = true;
  physical.dispose();
  return replacement;
}

export function createLegacyGlbScene(canvas: HTMLCanvasElement, options: {
  src: string;
  orbit?: string;
  target?: string;
  hotspots: ReadonlyArray<{ id: string; position: string }>;
  onHotspots: (positions: Record<string, LegacyHotspotPosition>) => void;
  onLoad: () => void;
  onFailure: () => void;
}): LegacyGlbScene {
  const profile = detectRenderCompatibility();
  if (profile.webglVersion === 0) throw new Error("WebGL is unavailable");

  const Renderer = profile.webglVersion === 1 ? THREE.WebGL1Renderer : THREE.WebGLRenderer;
  const renderer = new Renderer({
    canvas,
    alpha: true,
    antialias: profile.antialias,
    powerPreference: "low-power",
    precision: profile.precision,
  });
  renderer.setPixelRatio(profile.maxDevicePixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7b91a0, 2.25));
  const key = new THREE.DirectionalLight(0xffffff, 3.1);
  key.position.set(4, 7, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8e6ff, 1.65);
  fill.position.set(-5, 3, -4);
  scene.add(fill);

  let disposed = false;
  let model: THREE.Object3D | null = null;
  let orbit = readLegacyOrbit(options.orbit);
  let target = readLegacyTarget(options.target);
  const hotspotVectors = options.hotspots.map((hotspot) => ({ id: hotspot.id, point: readLegacyTarget(hotspot.position) }));

  const updateCamera = () => {
    const sinPhi = Math.sin(orbit.phi);
    camera.position.set(
      target.x + orbit.radius * sinPhi * Math.sin(orbit.theta),
      target.y + orbit.radius * Math.cos(orbit.phi),
      target.z + orbit.radius * sinPhi * Math.cos(orbit.theta),
    );
    camera.lookAt(target);
  };

  const render = () => {
    if (disposed) return;
    try {
      renderer.render(scene, camera);
      const projected: Record<string, LegacyHotspotPosition> = {};
      hotspotVectors.forEach(({ id, point }) => {
        const screen = point.clone().project(camera);
        projected[id] = {
          left: (screen.x * .5 + .5) * 100,
          top: (-screen.y * .5 + .5) * 100,
          visible: screen.z >= -1 && screen.z <= 1,
        };
      });
      options.onHotspots(projected);
    } catch {
      options.onFailure();
    }
  };

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateCamera();
    render();
  };
  const stopResize = observeElementResize(canvas, resize);
  const contextLost = (event: Event) => handleWebGLContextLoss(event, options.onFailure, "legacy-glb");
  canvas.addEventListener("webglcontextlost", contextLost);
  resize();

  new GLTFLoader().load(options.src, (gltf) => {
    if (disposed) return;
    model = gltf.scene;
    if (profile.webglVersion === 1) {
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.material) return;
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(makeMaterialWebgl1Compatible)
          : makeMaterialWebgl1Compatible(mesh.material);
      });
    }
    scene.add(model);
    updateCamera();
    render();
    options.onLoad();
  }, undefined, options.onFailure);

  return {
    rotate(delta) {
      orbit.theta -= delta;
      updateCamera();
      render();
    },
    setOrbit(nextOrbit, nextTarget) {
      orbit = readLegacyOrbit(nextOrbit);
      if (nextTarget) target = readLegacyTarget(nextTarget);
      updateCamera();
      render();
    },
    dispose() {
      disposed = true;
      stopResize();
      canvas.removeEventListener("webglcontextlost", contextLost);
      if (model) {
        model.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose();
          const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
          materials.forEach((material) => {
            Object.values(material).forEach((value) => {
              if (value && typeof value === "object" && "isTexture" in value) (value as THREE.Texture).dispose();
            });
            material.dispose();
          });
        });
      }
      renderer.dispose();
    },
  };
}
