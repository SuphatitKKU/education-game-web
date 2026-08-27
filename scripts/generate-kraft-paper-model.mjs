import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve("public/assets/models/kraft_paper_single_sheet.glb");
const texturePath = resolve("public/assets/models/textures/kraft_paper_surface_v1.png");

const width = 5.05;
const depth = 3.75;
const thickness = 0.018;
const xSegments = 38;
const zSegments = 28;

const pad = (buffer, fill = 0) => {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, fill)]) : buffer;
};

const heightAt = (u, v) => {
  const longWave = 0.13 * Math.sin((u * 1.55 + 0.06) * Math.PI) * (0.3 + 0.7 * Math.sin(Math.PI * v));
  const crossWave = 0.09 * Math.sin((v * 1.72 - 0.12) * Math.PI) * (0.25 + 0.75 * Math.sin(Math.PI * u));
  const frontRipple = 0.2 * Math.exp(-Math.pow((v - 0.05) / 0.24, 2)) * Math.sin((u * 1.25 - 0.08) * Math.PI);
  const raisedCorner = 0.16 * Math.pow(u, 2.4) * Math.pow(v, 2.15);
  const softTwist = 0.12 * (u - 0.5) * (v - 0.5);
  return longWave + crossWave + frontRipple + raisedCorner + softTwist;
};

const buildFace = (top) => {
  const positions = [];
  const normals = [];
  const texcoords = [];
  const indices = [];
  const direction = top ? 1 : -1;
  const offset = direction * thickness / 2;

  for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
    const v = zIndex / zSegments;
    const z = -depth / 2 + depth * v;
    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const u = xIndex / xSegments;
      const x = -width / 2 + width * u;
      const epsilon = 0.001;
      const lowerU = Math.max(0, u - epsilon);
      const upperU = Math.min(1, u + epsilon);
      const lowerV = Math.max(0, v - epsilon);
      const upperV = Math.min(1, v + epsilon);
      const slopeX = (heightAt(upperU, v) - heightAt(lowerU, v)) / ((upperU - lowerU) * width);
      const slopeZ = (heightAt(u, upperV) - heightAt(u, lowerV)) / ((upperV - lowerV) * depth);
      const magnitude = Math.hypot(slopeX, 1, slopeZ) || 1;
      positions.push(x, heightAt(u, v) + offset, z);
      normals.push((-slopeX / magnitude) * direction, (1 / magnitude) * direction, (-slopeZ / magnitude) * direction);
      texcoords.push(u, 1 - v);
    }
  }

  const row = xSegments + 1;
  for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const a = zIndex * row + xIndex;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (top) indices.push(a, c, d, a, d, b);
      else indices.push(a, d, c, a, b, d);
    }
  }
  return { positions, normals, texcoords, indices };
};

const buildEdge = (edge) => {
  const positions = [];
  const normals = [];
  const texcoords = [];
  const indices = [];
  const alongX = edge === "front" || edge === "back";
  const count = alongX ? xSegments : zSegments;
  const normal = edge === "front" ? [0, 0, -1] : edge === "back" ? [0, 0, 1] : edge === "left" ? [-1, 0, 0] : [1, 0, 0];

  for (let index = 0; index <= count; index += 1) {
    const t = index / count;
    const u = edge === "left" ? 0 : edge === "right" ? 1 : t;
    const v = edge === "front" ? 0 : edge === "back" ? 1 : t;
    const x = -width / 2 + width * u;
    const z = -depth / 2 + depth * v;
    const y = heightAt(u, v);
    positions.push(x, y + thickness / 2, z, x, y - thickness / 2, z);
    normals.push(...normal, ...normal);
    texcoords.push(t, 0, t, 1);
  }

  for (let index = 0; index < count; index += 1) {
    const top = index * 2;
    const bottom = top + 1;
    const nextTop = top + 2;
    const nextBottom = top + 3;
    if (edge === "front" || edge === "right") indices.push(top, nextBottom, bottom, top, nextTop, nextBottom);
    else indices.push(top, bottom, nextBottom, top, nextBottom, nextTop);
  }
  return { positions, normals, texcoords, indices };
};

const primitives = [
  { name: "MESH_Kraft_Fibrous_Top", material: 0, ...buildFace(true) },
  { name: "MESH_Kraft_Fibrous_Bottom", material: 0, ...buildFace(false) },
  ...["front", "back", "left", "right"].map((edge) => ({ name: `MESH_Kraft_Thin_Edge_${edge}`, material: 1, ...buildEdge(edge) })),
];

const materials = [
  {
    name: "MAT_Natural_Kraft_Fiber",
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.94 },
    doubleSided: false,
  },
  {
    name: "MAT_Natural_Kraft_Thin_Edge",
    pbrMetallicRoughness: { baseColorFactor: [0.49, 0.34, 0.2, 1], metallicFactor: 0, roughnessFactor: 1 },
    doubleSided: true,
  },
];

const bufferParts = [];
const bufferViews = [];
const accessors = [];
const meshes = [];
const nodes = [];
let byteOffset = 0;

const addBufferView = (buffer, target) => {
  const padded = pad(buffer);
  const view = { buffer: 0, byteOffset, byteLength: buffer.length };
  if (target) view.target = target;
  const index = bufferViews.push(view) - 1;
  bufferParts.push(padded);
  byteOffset += padded.length;
  return index;
};

const bounds = (values, stride) => {
  const min = Array(stride).fill(Infinity);
  const max = Array(stride).fill(-Infinity);
  for (let index = 0; index < values.length; index += stride) {
    for (let axis = 0; axis < stride; axis += 1) {
      min[axis] = Math.min(min[axis], values[index + axis]);
      max[axis] = Math.max(max[axis], values[index + axis]);
    }
  }
  return { min, max };
};

const textureData = await readFile(texturePath);
const textureView = addBufferView(textureData);

for (const primitive of primitives) {
  const positions = new Float32Array(primitive.positions);
  const normals = new Float32Array(primitive.normals);
  const texcoords = new Float32Array(primitive.texcoords);
  const indices = new Uint16Array(primitive.indices);
  const positionView = addBufferView(Buffer.from(positions.buffer), 34962);
  const normalView = addBufferView(Buffer.from(normals.buffer), 34962);
  const texcoordView = addBufferView(Buffer.from(texcoords.buffer), 34962);
  const indexView = addBufferView(Buffer.from(indices.buffer), 34963);
  const positionAccessor = accessors.push({ bufferView: positionView, componentType: 5126, count: positions.length / 3, type: "VEC3", ...bounds(primitive.positions, 3) }) - 1;
  const normalAccessor = accessors.push({ bufferView: normalView, componentType: 5126, count: normals.length / 3, type: "VEC3", ...bounds(primitive.normals, 3) }) - 1;
  const texcoordAccessor = accessors.push({ bufferView: texcoordView, componentType: 5126, count: texcoords.length / 2, type: "VEC2", ...bounds(primitive.texcoords, 2) }) - 1;
  const indexAccessor = accessors.push({ bufferView: indexView, componentType: 5123, count: indices.length, type: "SCALAR", min: [Math.min(...primitive.indices)], max: [Math.max(...primitive.indices)] }) - 1;
  const mesh = meshes.push({ name: primitive.name, primitives: [{ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor, TEXCOORD_0: texcoordAccessor }, indices: indexAccessor, material: primitive.material }] }) - 1;
  nodes.push({ name: primitive.name, mesh });
}

const binaryChunk = Buffer.concat(bufferParts);
const gltf = {
  asset: { version: "2.0", generator: "Parcel Lab single-sheet kraft paper generator" },
  scene: 0,
  scenes: [{ name: "Natural_Kraft_Paper_Single_Sheet", nodes: nodes.map((_, index) => index) }],
  nodes,
  meshes,
  materials,
  images: [{ bufferView: textureView, mimeType: "image/png", name: "Natural_Kraft_Paper_Surface" }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  textures: [{ sampler: 0, source: 0, name: "Natural_Kraft_Paper_Surface" }],
  accessors,
  bufferViews,
  buffers: [{ byteLength: binaryChunk.length }],
};

const jsonChunk = pad(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
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
console.log(`Created ${outputPath} (${Math.round(totalLength / 1024)} KB, ${meshes.length} meshes)`);
