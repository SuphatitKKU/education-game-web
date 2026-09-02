import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const padBuffer = (buffer, fill = 0) => {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, fill)]) : buffer;
};

const mapAxis = (axis, axial, u, v) => axis === "x" ? [axial, u, v] : [u, axial, v];

class GlbScene {
  constructor(materials, textureFiles = []) {
    this.materials = materials;
    this.textureFiles = textureFiles;
    this.primitives = [];
  }

  addPrimitive(name, positions, normals, indices, material, texcoords = null) {
    this.primitives.push({ name, positions, normals, indices, material, texcoords });
  }

  addTexturedPlane(name, center, width, depth, material, normalY = 1) {
    const [cx, cy, cz] = center;
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const positions = [
      cx - halfWidth, cy, cz - halfDepth,
      cx + halfWidth, cy, cz - halfDepth,
      cx + halfWidth, cy, cz + halfDepth,
      cx - halfWidth, cy, cz + halfDepth,
    ];
    const normals = Array.from({ length: 4 }, () => [0, normalY, 0]).flat();
    const indices = normalY > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    const texcoords = [0, 0, 1, 0, 1, 1, 0, 1];
    this.addPrimitive(name, positions, normals, indices, material, texcoords);
  }

  addBox(name, center, size, material) {
    const [cx, cy, cz] = center;
    const [sx, sy, sz] = size.map((value) => value / 2);
    const positions = [];
    const normals = [];
    const indices = [];
    const faces = [
      { normal: [1, 0, 0], corners: [[sx, -sy, -sz], [sx, -sy, sz], [sx, sy, sz], [sx, sy, -sz]] },
      { normal: [-1, 0, 0], corners: [[-sx, -sy, sz], [-sx, -sy, -sz], [-sx, sy, -sz], [-sx, sy, sz]] },
      { normal: [0, 1, 0], corners: [[-sx, sy, -sz], [sx, sy, -sz], [sx, sy, sz], [-sx, sy, sz]] },
      { normal: [0, -1, 0], corners: [[-sx, -sy, sz], [sx, -sy, sz], [sx, -sy, -sz], [-sx, -sy, -sz]] },
      { normal: [0, 0, 1], corners: [[sx, -sy, sz], [-sx, -sy, sz], [-sx, sy, sz], [sx, sy, sz]] },
      { normal: [0, 0, -1], corners: [[-sx, -sy, -sz], [sx, -sy, -sz], [sx, sy, -sz], [-sx, sy, -sz]] },
    ];
    for (const face of faces) {
      const offset = positions.length / 3;
      for (const corner of face.corners) {
        positions.push(cx + corner[0], cy + corner[1], cz + corner[2]);
        normals.push(...face.normal);
      }
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    }
    this.addPrimitive(name, positions, normals, indices, material);
  }

  addTube(name, axis, radiusOuter, radiusInner, length, radialSegments, material, center = [0, 0, 0]) {
    const positions = [];
    const normals = [];
    const indices = [];
    const half = length / 2;
    const push = (point, normal) => {
      positions.push(point[0] + center[0], point[1] + center[1], point[2] + center[2]);
      normals.push(...normal);
    };
    for (let index = 0; index <= radialSegments; index += 1) {
      const angle = (index / radialSegments) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const outerNormal = mapAxis(axis, 0, c, s);
      const innerNormal = mapAxis(axis, 0, -c, -s);
      push(mapAxis(axis, -half, c * radiusOuter, s * radiusOuter), outerNormal);
      push(mapAxis(axis, half, c * radiusOuter, s * radiusOuter), outerNormal);
      push(mapAxis(axis, -half, c * radiusInner, s * radiusInner), innerNormal);
      push(mapAxis(axis, half, c * radiusInner, s * radiusInner), innerNormal);
    }
    for (let index = 0; index < radialSegments; index += 1) {
      const a = index * 4;
      const b = (index + 1) * 4;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
      indices.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
      indices.push(a, a + 2, b + 2, a, b + 2, b);
      indices.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3);
    }
    this.addPrimitive(name, positions, normals, indices, material);
  }

  addFlexiblePanel(name, width, depth, xSegments, zSegments, material, customHeightAt = null) {
    const positions = [];
    const normals = [];
    const indices = [];
    const defaultHeightAt = (u, v) => {
      const waveAcross = 0.2 * Math.sin((u * 1.7 - 0.18) * Math.PI) * (0.35 + 0.65 * Math.sin(Math.PI * v));
      const waveDepth = 0.16 * Math.sin((v * 1.55 + 0.08) * Math.PI) * (0.3 + 0.7 * Math.sin(Math.PI * u));
      const softTwist = 0.42 * (u - 0.5) * (v - 0.5);
      const liftedBackCorner = 0.2 * Math.pow(u, 2.4) * Math.pow(v, 2.6);
      return waveAcross + waveDepth + softTwist + liftedBackCorner;
    };
    const heightAt = customHeightAt ?? defaultHeightAt;
    for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
      const v = zIndex / zSegments;
      const z = -depth / 2 + depth * v;
      for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
        const u = xIndex / xSegments;
        const x = -width / 2 + width * u;
        const y = heightAt(u, v);
        const epsilon = 0.001;
        const slopeX = (heightAt(Math.min(1, u + epsilon), v) - heightAt(Math.max(0, u - epsilon), v)) / (Math.min(1, u + epsilon) - Math.max(0, u - epsilon)) / width;
        const slopeZ = (heightAt(u, Math.min(1, v + epsilon)) - heightAt(u, Math.max(0, v - epsilon))) / (Math.min(1, v + epsilon) - Math.max(0, v - epsilon)) / depth;
        const magnitude = Math.hypot(slopeX, 1, slopeZ) || 1;
        positions.push(x, y, z);
        normals.push(-slopeX / magnitude, 1 / magnitude, -slopeZ / magnitude);
      }
    }
    const rowSize = xSegments + 1;
    for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
      for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
        const a = zIndex * rowSize + xIndex;
        const b = a + 1;
        const c = a + rowSize;
        const d = c + 1;
        indices.push(a, c, d, a, d, b);
      }
    }
    this.addPrimitive(name, positions, normals, indices, material);
  }

  addDome(name, center, radius, height, rings, radialSegments, material, direction = 1) {
    const positions = [center[0], center[1] + height * direction, center[2]];
    const normals = [0, direction, 0];
    const indices = [];
    for (let ring = 1; ring <= rings; ring += 1) {
      const theta = (ring / rings) * Math.PI / 2;
      const ringRadius = radius * Math.sin(theta);
      const y = height * Math.cos(theta) * direction;
      for (let segment = 0; segment < radialSegments; segment += 1) {
        const angle = (segment / radialSegments) * Math.PI * 2;
        const x = ringRadius * Math.cos(angle);
        const z = ringRadius * Math.sin(angle);
        positions.push(center[0] + x, center[1] + y, center[2] + z);
        const nx = x / (radius * radius);
        const ny = y / (height * height);
        const nz = z / (radius * radius);
        const magnitude = Math.hypot(nx, ny, nz) || 1;
        normals.push(nx / magnitude, ny / magnitude, nz / magnitude);
      }
    }
    const pushTriangle = (a, b, c) => {
      if (direction > 0) indices.push(a, b, c);
      else indices.push(a, c, b);
    };
    for (let segment = 0; segment < radialSegments; segment += 1) {
      pushTriangle(0, 1 + segment, 1 + ((segment + 1) % radialSegments));
    }
    for (let ring = 1; ring < rings; ring += 1) {
      const first = 1 + (ring - 1) * radialSegments;
      const next = first + radialSegments;
      for (let segment = 0; segment < radialSegments; segment += 1) {
        const following = (segment + 1) % radialSegments;
        pushTriangle(first + segment, next + segment, next + following);
        pushTriangle(first + segment, next + following, first + following);
      }
    }
    this.addPrimitive(name, positions, normals, indices, material);
  }

  addFlatRing(name, center, innerRadius, outerRadius, radialSegments, material, normalY = 1) {
    const positions = [];
    const normals = [];
    const indices = [];
    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      positions.push(
        center[0] + c * innerRadius, center[1], center[2] + s * innerRadius,
        center[0] + c * outerRadius, center[1], center[2] + s * outerRadius,
      );
      normals.push(0, normalY, 0, 0, normalY, 0);
    }
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const inner = segment * 2;
      const outer = inner + 1;
      const nextInner = inner + 2;
      const nextOuter = inner + 3;
      if (normalY > 0) indices.push(inner, outer, nextOuter, inner, nextOuter, nextInner);
      else indices.push(inner, nextOuter, outer, inner, nextInner, nextOuter);
    }
    this.addPrimitive(name, positions, normals, indices, material);
  }

  async write(outputPath) {
    const bufferParts = [];
    const bufferViews = [];
    const accessors = [];
    const meshes = [];
    const nodes = [];
    let byteOffset = 0;

    const addBufferView = (buffer, target) => {
      const padded = padBuffer(buffer);
      const index = bufferViews.length;
      const view = { buffer: 0, byteOffset, byteLength: buffer.length };
      if (target) view.target = target;
      bufferViews.push(view);
      bufferParts.push(padded);
      byteOffset += padded.length;
      return index;
    };
    const bounds = (values) => {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let index = 0; index < values.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], values[index + axis]);
          max[axis] = Math.max(max[axis], values[index + axis]);
        }
      }
      return { min, max };
    };

    const images = [];
    const textures = [];
    const samplers = [];
    for (const textureFile of this.textureFiles) {
      const imageData = await readFile(textureFile.path);
      const imageView = addBufferView(imageData);
      const sampler = samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }) - 1;
      const image = images.push({ bufferView: imageView, mimeType: textureFile.mimeType ?? "image/png", name: textureFile.name }) - 1;
      textures.push({ sampler, source: image, name: textureFile.name });
    }

    for (const primitive of this.primitives) {
      const positionArray = new Float32Array(primitive.positions);
      const normalArray = new Float32Array(primitive.normals);
      const indexArray = new Uint16Array(primitive.indices);
      const positionView = addBufferView(Buffer.from(positionArray.buffer), 34962);
      const normalView = addBufferView(Buffer.from(normalArray.buffer), 34962);
      const indexView = addBufferView(Buffer.from(indexArray.buffer), 34963);
      const positionAccessor = accessors.push({ bufferView: positionView, componentType: 5126, count: positionArray.length / 3, type: "VEC3", ...bounds(primitive.positions) }) - 1;
      const normalAccessor = accessors.push({ bufferView: normalView, componentType: 5126, count: normalArray.length / 3, type: "VEC3" }) - 1;
      let minIndex = Infinity;
      let maxIndex = -Infinity;
      for (const index of primitive.indices) {
        minIndex = Math.min(minIndex, index);
        maxIndex = Math.max(maxIndex, index);
      }
      const indexAccessor = accessors.push({ bufferView: indexView, componentType: 5123, count: indexArray.length, type: "SCALAR", min: [minIndex], max: [maxIndex] }) - 1;
      const attributes = { POSITION: positionAccessor, NORMAL: normalAccessor };
      if (primitive.texcoords) {
        const texcoordArray = new Float32Array(primitive.texcoords);
        const texcoordView = addBufferView(Buffer.from(texcoordArray.buffer), 34962);
        attributes.TEXCOORD_0 = accessors.push({ bufferView: texcoordView, componentType: 5126, count: texcoordArray.length / 2, type: "VEC2", min: [0, 0], max: [1, 1] }) - 1;
      }
      const meshIndex = meshes.push({ name: primitive.name, primitives: [{ attributes, indices: indexAccessor, material: primitive.material }] }) - 1;
      nodes.push({ name: primitive.name, mesh: meshIndex });
    }

    const binaryChunk = Buffer.concat(bufferParts);
    const gltf = {
      asset: { version: "2.0", generator: "Parcel Lab flexible material generator" },
      scene: 0,
      scenes: [{ name: "Flexible_Material", nodes: nodes.map((_, index) => index) }],
      nodes,
      meshes,
      materials: this.materials,
      accessors,
      bufferViews,
      buffers: [{ byteLength: binaryChunk.length }],
    };
    const extensionsUsed = [...new Set(this.materials.flatMap((material) => Object.keys(material.extensions ?? {})))];
    if (extensionsUsed.length) gltf.extensionsUsed = extensionsUsed;
    if (images.length) {
      gltf.images = images;
      gltf.textures = textures;
      gltf.samplers = samplers;
    }
    const jsonText = JSON.stringify(gltf);
    const jsonChunk = padBuffer(Buffer.from(jsonText, "utf8"), 0x20);
    const totalLength = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(totalLength, 8);
    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonChunk.length, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4);
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binaryChunk.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binaryChunk]));
    console.log(`Created ${outputPath} (${Math.round(totalLength / 1024)} KB)`);
  }
}

const roundedRectanglePoints = (halfWidth, halfDepth, radius, cornerSegments) => {
  const points = [];
  const corners = [
    [halfWidth - radius, halfDepth - radius, 0],
    [-halfWidth + radius, halfDepth - radius, Math.PI / 2],
    [-halfWidth + radius, -halfDepth + radius, Math.PI],
    [halfWidth - radius, -halfDepth + radius, Math.PI * 1.5],
  ];
  for (const [centerX, centerZ, start] of corners) {
    for (let segment = 0; segment <= cornerSegments; segment += 1) {
      const angle = start + (segment / cornerSegments) * Math.PI / 2;
      points.push([centerX + Math.cos(angle) * radius, centerZ + Math.sin(angle) * radius]);
    }
  }
  return points;
};

const mergePrimitivesByPrefix = (scene, name, prefixes, material) => {
  const selected = scene.primitives.filter((primitive) => prefixes.some((prefix) => primitive.name.startsWith(prefix)));
  if (!selected.length) return;
  const positions = [];
  const normals = [];
  const indices = [];
  for (const primitive of selected) {
    const offset = positions.length / 3;
    positions.push(...primitive.positions);
    normals.push(...primitive.normals);
    indices.push(...primitive.indices.map((index) => index + offset));
  }
  scene.primitives = scene.primitives.filter((primitive) => !selected.includes(primitive));
  scene.addPrimitive(name, positions, normals, indices, material);
};

const addFoamSlab = (scene, name, width, height, depth, radius, bevel, material) => {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfDepth = depth / 2;
  const outer = roundedRectanglePoints(halfWidth, halfDepth, radius, 5);
  const inset = roundedRectanglePoints(halfWidth - bevel, halfDepth - bevel, Math.max(0.04, radius - bevel), 5);
  const rings = [
    { points: inset, y: halfHeight, vertical: 0.9, radial: 0.25 },
    { points: outer, y: halfHeight - bevel, vertical: 0.35, radial: 0.94 },
    { points: outer, y: -halfHeight + bevel, vertical: -0.35, radial: 0.94 },
    { points: inset, y: -halfHeight, vertical: -0.9, radial: 0.25 },
  ];
  const positions = [];
  const normals = [];
  const texcoords = [];
  const indices = [];
  const perimeterSize = outer.length;
  for (const ring of rings) {
    for (let pointIndex = 0; pointIndex < ring.points.length; pointIndex += 1) {
      const [x, z] = ring.points[pointIndex];
      positions.push(x, ring.y, z);
      const nx = x / halfWidth;
      const nz = z / halfDepth;
      const magnitude = Math.hypot(nx * ring.radial, ring.vertical, nz * ring.radial) || 1;
      normals.push((nx * ring.radial) / magnitude, ring.vertical / magnitude, (nz * ring.radial) / magnitude);
      texcoords.push(pointIndex / perimeterSize, (ring.y + halfHeight) / height);
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const current = ring * perimeterSize;
    const next = current + perimeterSize;
    for (let index = 0; index < perimeterSize; index += 1) {
      const following = (index + 1) % perimeterSize;
      indices.push(current + index, next + index, next + following, current + index, next + following, current + following);
    }
  }
  const topCenter = positions.length / 3;
  positions.push(0, halfHeight, 0);
  normals.push(0, 1, 0);
  texcoords.push(0.5, 1);
  const bottomCenter = positions.length / 3;
  positions.push(0, -halfHeight, 0);
  normals.push(0, -1, 0);
  texcoords.push(0.5, 0);
  for (let index = 0; index < perimeterSize; index += 1) {
    const following = (index + 1) % perimeterSize;
    indices.push(topCenter, following, index);
    const bottom = (rings.length - 1) * perimeterSize;
    indices.push(bottomCenter, bottom + index, bottom + following);
  }
  scene.addPrimitive(name, positions, normals, indices, material, texcoords);
};

const transparentFilm = {
  name: "MAT_Milky_Translucent_PE_Film",
  pbrMetallicRoughness: { baseColorFactor: [0.97, 0.99, 1, 1], metallicFactor: 0, roughnessFactor: 0.2 },
  extensions: {
    KHR_materials_transmission: { transmissionFactor: 0.8 },
    KHR_materials_volume: { thicknessFactor: 0.012, attenuationDistance: 8, attenuationColor: [0.98, 0.995, 1] },
    KHR_materials_ior: { ior: 1.49 },
    KHR_materials_specular: { specularFactor: 0.66, specularColorFactor: [1, 1, 1] },
  },
  doubleSided: true,
};
const peScene = new GlbScene([transparentFilm]);
peScene.addFlexiblePanel("MESH_PE_Single_Clear_Sheet", 5.1, 4, 38, 30, 0);
await peScene.write(resolve("public/assets/models/pe_sheet.glb"));

const bubbleFilm = {
  name: "MAT_Clear_Flexible_Bubble_Backing_Film",
  pbrMetallicRoughness: { baseColorFactor: [0.98, 0.995, 1, 1], metallicFactor: 0, roughnessFactor: 0.18 },
  extensions: {
    KHR_materials_transmission: { transmissionFactor: 0.88 },
    KHR_materials_volume: { thicknessFactor: 0.006, attenuationDistance: 12, attenuationColor: [0.98, 0.995, 1] },
    KHR_materials_ior: { ior: 1.47 },
    KHR_materials_specular: { specularFactor: 0.72, specularColorFactor: [1, 1, 1] },
  },
  doubleSided: true,
};
const bubbleHighlight = {
  name: "MAT_Clear_Air_Dome",
  pbrMetallicRoughness: { baseColorFactor: [0.99, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.1 },
  extensions: {
    KHR_materials_transmission: { transmissionFactor: 0.84 },
    KHR_materials_volume: { thicknessFactor: 0.018, attenuationDistance: 10, attenuationColor: [0.98, 0.995, 1] },
    KHR_materials_ior: { ior: 1.47 },
    KHR_materials_specular: { specularFactor: 0.86, specularColorFactor: [1, 1, 1] },
  },
  doubleSided: true,
};
const bubbleSeal = {
  name: "MAT_Bubble_Heat_Seal_Ring",
  pbrMetallicRoughness: { baseColorFactor: [0.94, 0.98, 1, 0.36], metallicFactor: 0, roughnessFactor: 0.2 },
  alphaMode: "BLEND",
  doubleSided: true,
};
const bubbleScene = new GlbScene([bubbleFilm, bubbleHighlight, bubbleSeal]);
const bubbleSheetHeight = (u, v) => {
  const lengthWave = 0.16 * Math.sin((u * 1.68 - 0.16) * Math.PI) * (0.35 + 0.65 * Math.sin(Math.PI * v));
  const depthWave = 0.12 * Math.sin((v * 1.58 + 0.08) * Math.PI) * (0.3 + 0.7 * Math.sin(Math.PI * u));
  const gentleTwist = 0.3 * (u - 0.5) * (v - 0.5);
  const liftedBackCorner = 0.14 * Math.pow(u, 2.4) * Math.pow(v, 2.6);
  return lengthWave + depthWave + gentleTwist + liftedBackCorner;
};
bubbleScene.addFlexiblePanel("MESH_Bubble_Thin_Flexible_Backing_Film", 4.75, 3.6, 40, 30, 0, bubbleSheetHeight);
const columns = 13;
const rows = 10;
for (let row = 0; row < rows; row += 1) {
  for (let column = 0; column < columns; column += 1) {
    const x = -2.02 + column * 0.33 + (row % 2) * 0.165;
    const z = -1.5 + row * 0.33;
    if (x > 2.14) continue;
    const u = (x + 2.375) / 4.75;
    const v = (z + 1.8) / 3.6;
    const sheetY = bubbleSheetHeight(u, v);
    const radius = 0.135;
    const height = 0.125;
    const topCenter = [x, sheetY + 0.006, z];
    bubbleScene.addFlatRing(`MESH_Seal_Ring_${row + 1}_${column + 1}`, [x, sheetY + 0.008, z], radius * 0.86, radius * 1.13, 18, 2);
    bubbleScene.addDome(`MESH_Air_Bubble_${row + 1}_${column + 1}`, topCenter, radius, height, 6, 18, 1);
  }
}
mergePrimitivesByPrefix(bubbleScene, "MESH_All_Top_Air_Bubbles", ["MESH_Air_Bubble_"], 1);
mergePrimitivesByPrefix(bubbleScene, "MESH_All_Top_Seal_Rings", ["MESH_Seal_Ring_"], 2);
await bubbleScene.write(resolve("public/assets/models/bubble_wrap.glb"));

const foamBody = {
  name: "MAT_PE_Foam_White_Body",
  pbrMetallicRoughness: { baseColorFactor: [0.96, 0.97, 0.95, 1], metallicFactor: 0, roughnessFactor: 0.94 },
  doubleSided: true,
};
const foamSurface = {
  name: "MAT_PE_Foam_Continuous_Fine_Surface",
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.88 },
  doubleSided: true,
};
const foamScene = new GlbScene([foamBody, foamSurface], [
  { path: resolve("public/assets/models/textures/pe_foam_surface_v1.png"), mimeType: "image/png", name: "PE_Foam_Fine_Surface_Texture" },
]);
addFoamSlab(foamScene, "MESH_PE_Foam_Single_Thin_Sheet", 5, 0.34, 3.7, 0.22, 0.055, 1);
foamScene.addTexturedPlane("MESH_PE_Foam_Fine_Top_Surface", [0, 0.171, 0], 4.66, 3.36, 1, 1);
foamScene.addTexturedPlane("MESH_PE_Foam_Fine_Bottom_Surface", [0, -0.171, 0], 4.66, 3.36, 1, -1);
await foamScene.write(resolve("public/assets/models/pe_foam_sheet.glb"));

const waxPaperSurface = {
  name: "MAT_Paraffin_Coated_Translucent_Wax_Paper",
  pbrMetallicRoughness: {
    baseColorFactor: [1, 0.985, 0.95, 1],
    baseColorTexture: { index: 0 },
    metallicFactor: 0,
    roughnessFactor: 0.36,
  },
  extensions: {
    KHR_materials_transmission: { transmissionFactor: 0.52 },
    KHR_materials_volume: { thicknessFactor: 0.008, attenuationDistance: 4.5, attenuationColor: [1, 0.975, 0.91] },
    KHR_materials_ior: { ior: 1.46 },
    KHR_materials_specular: { specularFactor: 0.52, specularColorFactor: [1, 0.98, 0.93] },
  },
  doubleSided: true,
};
const waxPaperHeight = (u, v) => {
  const longWave = 0.23 * Math.sin((u * 1.72 - 0.12) * Math.PI) * (0.35 + 0.65 * Math.sin(Math.PI * v));
  const crossWave = 0.17 * Math.sin((v * 1.58 + 0.06) * Math.PI) * (0.3 + 0.7 * Math.sin(Math.PI * u));
  const frontEdgeCurl = 0.28 * Math.pow(1 - v, 2.3) * Math.sin((u * 1.38 - 0.12) * Math.PI);
  const liftedCorner = 0.24 * Math.pow(u, 2.5) * Math.pow(v, 2.25);
  const softTwist = 0.32 * (u - 0.5) * (v - 0.5);
  return longWave + crossWave + frontEdgeCurl + liftedCorner + softTwist;
};
const waxPaperScene = new GlbScene([waxPaperSurface], [
  { path: resolve("public/assets/models/textures/wax_paper_surface_v1.png"), mimeType: "image/png", name: "Wax_Paper_Fine_Fiber_Surface" },
]);
waxPaperScene.addFlexiblePanel("MESH_Wax_Paper_Single_Thin_Flexible_Sheet", 5.05, 3.75, 44, 34, 0, waxPaperHeight);
await waxPaperScene.write(resolve("public/assets/models/wax_paper_single_sheet.glb"));
