import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * One procedural model library shared by every experiment room.
 * Each scene owns an instance so WebGL resources can be disposed with that scene.
 */
export function createMaterialModelLibrary(track: <T extends { dispose: () => void }>(value: T) => T) {
  const surface = (color: string, metalness = 0, roughness = .55) =>
    track(new THREE.MeshStandardMaterial({ color, metalness, roughness }));
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
    mesh(parent, new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map((value) => value / 3))), material, x, y, z);
  const outlineSlab = (parent: THREE.Object3D, height: number, y: number, material = specimenEdge) => {
    const shape = new THREE.BoxGeometry(2.18, height, 1.48);
    const outline = new THREE.LineSegments(track(new THREE.EdgesGeometry(shape)), material);
    shape.dispose();
    outline.position.y = y;
    parent.add(outline);
  };

  const prototypes = new Map<string, THREE.Group>();

  function createModel(id: string) {
    const group = new THREE.Group();
    group.name = `material-${id}`;
    const height = .24;

    if (id === "corrugated_cardboard") {
      const paper = surface("#d99b49", 0, .9);
      const flute = surface("#b67c32", 0, .9);
      for (const y of [.015, height - .015]) {
        box(group, [2.18, .03, 1.48], paper, 0, y, 0, .005);
        outlineSlab(group, .03, y, paperEdge);
      }
      const wave = new THREE.Shape();
      const yAt = (x: number) => height / 2 + .092 * Math.sin((x + 1.09) * Math.PI * 2 * 5);
      for (let index = 0; index <= 160; index++) {
        const x = -1.09 + 2.18 * index / 160;
        if (index === 0) wave.moveTo(x, yAt(x) + .012);
        else wave.lineTo(x, yAt(x) + .012);
      }
      for (let index = 160; index >= 0; index--) {
        const x = -1.09 + 2.18 * index / 160;
        wave.lineTo(x, yAt(x) - .012);
      }
      wave.closePath();
      mesh(group, new THREE.ExtrudeGeometry(wave, { depth: 1.46, bevelEnabled: false, steps: 1 }), flute, 0, 0, -.73);
      const grain = surface("#c48c43", 0, 1);
      for (let index = 0; index < 9; index++) {
        box(group, [.45 + (index % 3) * .15, .002, .008], grain, (index % 3 - 1) * .63, height + .001, (Math.floor(index / 3) - 1) * .42, .001);
      }
    } else if (id === "bubble_wrap") {
      const plastic = surface("#dcecf4", .04, .26);
      const bubble = surface("#e6f5ff", .1, .18);
      box(group, [2.18, .035, 1.48], plastic, 0, .0175, 0, .008);
      outlineSlab(group, .035, .0175);
      const geometry = track(new THREE.SphereGeometry(.135, 16, 10));
      for (let x = 0; x < 8; x++) for (let z = 0; z < 5; z++) {
        const dome = mesh(group, geometry, bubble, -.94 + x * .268, .1475, -.58 + z * .29);
        dome.scale.y = .1125 / .135;
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
      for (let index = 0; index < 150; index++) {
        const x = ((index * 73) % 149) / 149 * 2.1 - 1.05;
        const z = ((index * 37) % 151) / 151 * 1.4 - .7;
        const pore = mesh(group, geometry, pores, x, height - .006, z);
        pore.scale.y = .4;
      }
    } else if (id === "cardboard") {
      box(group, [2.18, height - .035, 1.48], surface("#a5a7a5", 0, .95), 0, (height - .035) / 2, 0, .008);
      box(group, [2.18, .035, 1.48], surface("#fafaf7", 0, .8), 0, height - .0175, 0, .006);
      outlineSlab(group, height, height / 2);
      outlineSlab(group, .035, height - .0175);
      const edge = surface("#878e90", 0, 1);
      for (let index = 1; index < 5; index++) box(group, [2.15, .004, .008], edge, 0, index * .043, .741, .001);
    } else {
      const plastic = surface("#92d0f4", .08, .2);
      box(group, [2.18, height, 1.48], plastic, 0, height / 2, 0, .018);
      outlineSlab(group, height, height / 2);
      const highlight = surface("#d8f0ff", 0, .2);
      for (let index = 0; index < 3; index++) {
        const strip = box(group, [.07, .003, .88], highlight, -.68 + index * .57, height + .002, .05, .001);
        strip.rotation.y = .55;
      }
    }
    return group;
  }

  return {
    get(id: string) {
      let prototype = prototypes.get(id);
      if (!prototype) {
        prototype = createModel(id);
        prototypes.set(id, prototype);
      }
      return prototype.clone(true);
    },
  };
}
