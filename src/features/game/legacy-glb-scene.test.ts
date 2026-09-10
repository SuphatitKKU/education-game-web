import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { makeMaterialWebgl1Compatible, readLegacyOrbit, readLegacyTarget } from "./legacy-glb-scene";

describe("legacy GLB camera values", () => {
  it("reads model-viewer targets with metre suffixes", () => {
    const target = readLegacyTarget("0.25m -1.5m 2m");
    expect(target.toArray()).toEqual([0.25, -1.5, 2]);
  });

  it("converts degree orbits and preserves radius", () => {
    const orbit = readLegacyOrbit("90deg 45deg 3.5m");
    expect(orbit.theta).toBeCloseTo(Math.PI / 2);
    expect(orbit.phi).toBeCloseTo(Math.PI / 4);
    expect(orbit.radius).toBe(3.5);
  });

  it("accepts radians and supplies defaults for auto values", () => {
    const radians = readLegacyOrbit("1.2rad 0.75rad 6m");
    expect(radians).toEqual({ theta: 1.2, phi: 0.75, radius: 6 });

    const automatic = readLegacyOrbit("auto auto auto");
    expect(automatic.theta).toBeCloseTo(Math.PI / 6);
    expect(automatic.phi).toBeCloseTo(65 * Math.PI / 180);
    expect(automatic.radius).toBe(8);
  });
});

describe("legacy GLB materials", () => {
  it("downgrades transmission materials to WebGL 1 shaders", () => {
    const physical = new THREE.MeshPhysicalMaterial({ color: 0x55aaff, transmission: .8 });
    const compatible = makeMaterialWebgl1Compatible(physical);

    expect(compatible).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((compatible as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial).not.toBe(true);
    expect(compatible.transparent).toBe(true);
    expect(compatible.opacity).toBeCloseTo(.48);
    expect(compatible.depthWrite).toBe(false);
  });

  it("keeps materials that already use WebGL 1-safe shaders", () => {
    const standard = new THREE.MeshStandardMaterial();
    expect(makeMaterialWebgl1Compatible(standard)).toBe(standard);
    standard.dispose();
  });
});
