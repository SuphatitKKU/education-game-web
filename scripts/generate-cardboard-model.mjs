import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve("public/assets/models/cardboard_gray_white_400gsm.glb");
const texturePath = resolve("public/assets/models/textures/cardboard_gray_fiber_v1.png");

const padBuffer = (buffer, fill = 0) => {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, fill)]) : buffer;
};

const heightAt = (u, v) => {
  const gentleBow = 0.055 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
  const frontEdgeLift = 0.12 * Math.pow(1 - v, 2.4) * Math.sin(Math.PI * u);
  const cornerCurl = 0.32 * Math.pow(u, 3.1) * Math.pow(v, 2.35);
  const subtleTwist = 0.055 * (u - 0.5) * (v - 0.5);
  return gentleBow + frontEdgeLift + cornerCurl + subtleTwist;
};

const sheetWidth = 5.2;
const sheetDepth = 3.75;
// The real caliper of 400 gsm board is sub-millimetre. The teaching model uses
// a slightly exaggerated edge so primary-school students can inspect it.
const sheetThickness = 0.0275;
const xSegments = 34;
const zSegments = 26;

const buildFace = (top) => {
  const positions = [];
  const normals = [];
  const texcoords = [];
  const indices = [];
  const direction = top ? 1 : -1;
  const offset = top ? sheetThickness / 2 : -sheetThickness / 2;

  for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
    const v = zIndex / zSegments;
    const z = -sheetDepth / 2 + sheetDepth * v;
    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const u = xIndex / xSegments;
      const x = -sheetWidth / 2 + sheetWidth * u;
      const epsilon = 0.001;
      const lowerU = Math.max(0, u - epsilon);
      const upperU = Math.min(1, u + epsilon);
      const lowerV = Math.max(0, v - epsilon);
      const upperV = Math.min(1, v + epsilon);
      const slopeX = (heightAt(upperU, v) - heightAt(lowerU, v)) / ((upperU - lowerU) * sheetWidth);
      const slopeZ = (heightAt(u, upperV) - heightAt(u, lowerV)) / ((upperV - lowerV) * sheetDepth);
      const magnitude = Math.hypot(slopeX, 1, slopeZ) || 1;

      positions.push(x, heightAt(u, v) + offset, z);
      normals.push((-slopeX / magnitude) * direction, (1 / magnitude) * direction, (-slopeZ / magnitude) * direction);
      texcoords.push(u * 2.2, v * 1.6);
    }
  }

  const rowSize = xSegments + 1;
  for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const a = zIndex * rowSize + xIndex;
      const b = a + 1;
      const c = a + rowSize;
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
  const segmentCount = alongX ? xSegments : zSegments;
  const outward = edge === "front" ? [0, 0, -1] : edge === "back" ? [0, 0, 1] : edge === "left" ? [-1, 0, 0] : [1, 0, 0];

  for (let index = 0; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    const u = edge === "left" ? 0 : edge === "right" ? 1 : t;
    const v = edge === "front" ? 0 : edge === "back" ? 1 : t;
    const x = -sheetWidth / 2 + sheetWidth * u;
    const z = -sheetDepth / 2 + sheetDepth * v;
    const centerY = heightAt(u, v);
    positions.push(x, centerY + sheetThickness / 2, z, x, centerY - sheetThickness / 2, z);
    normals.push(...outward, ...outward);
    texcoords.push(t * 7, 0, t * 7, 1);
  }

  for (let index = 0; index < segmentCount; index += 1) {
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
  { name: "MESH_White_Smooth_Front", material: 0, ...buildFace(true) },
  { name: "MESH_Gray_Fibrous_Back", material: 1, ...buildFace(false) },
  ...["front", "back", "left", "right"].map((edge) => ({ name: `MESH_400gsm_Edge_${edge}`, material: 2, ...buildEdge(edge) })),
];

const materials = [
  {
    name: "MAT_White_Smooth_Front",
    pbrMetallicRoughness: { baseColorFactor: [0.985, 0.99, 0.985, 1], metallicFactor: 0, roughnessFactor: 0.84 },
    doubleSided: false,
  },
  {
    name: "MAT_Gray_Fibrous_Back",
    pbrMetallicRoughness: { baseColorFactor: [0.93, 0.94, 0.92, 1], baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.96 },
    doubleSided: false,
  },
  {
    name: "MAT_400gsm_Dense_Edge",
    pbrMetallicRoughness: { baseColorFactor: [0.42, 0.44, 0.43, 1], metallicFactor: 0, roughnessFactor: 1 },
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
  const padded = padBuffer(buffer);
  const view = { buffer: 0, byteOffset, byteLength: buffer.length };
  if (target) view.target = target;
  const index = bufferViews.push(view) - 1;
  bufferParts.push(padded);
  byteOffset += padded.length;
  return index;
};

const findBounds = (values, stride) => {
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
  const positionAccessor = accessors.push({ bufferView: positionView, componentType: 5126, count: positions.length / 3, type: "VEC3", ...findBounds(primitive.positions, 3) }) - 1;
  const normalAccessor = accessors.push({ bufferView: normalView, componentType: 5126, count: normals.length / 3, type: "VEC3", ...findBounds(primitive.normals, 3) }) - 1;
  const texcoordAccessor = accessors.push({ bufferView: texcoordView, componentType: 5126, count: texcoords.length / 2, type: "VEC2", ...findBounds(primitive.texcoords, 2) }) - 1;
  const indexAccessor = accessors.push({ bufferView: indexView, componentType: 5123, count: indices.length, type: "SCALAR", min: [Math.min(...primitive.indices)], max: [Math.max(...primitive.indices)] }) - 1;
  const mesh = meshes.push({ name: primitive.name, primitives: [{ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor, TEXCOORD_0: texcoordAccessor }, indices: indexAccessor, material: primitive.material }] }) - 1;
  nodes.push({ name: primitive.name, mesh });
}

const binaryChunk = Buffer.concat(bufferParts);
const gltf = {
  asset: { version: "2.0", generator: "Parcel Lab gray-white 400 gsm cardboard generator" },
  scene: 0,
  scenes: [{ name: "Gray_White_400gsm_Cardboard", nodes: nodes.map((_, index) => index) }],
  nodes,
  meshes,
  materials,
  images: [{ bufferView: textureView, mimeType: "image/png", name: "Gray_Fibrous_Cardboard_Texture" }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  textures: [{ sampler: 0, source: 0, name: "Gray_Fibrous_Cardboard_Texture" }],
  accessors,
  bufferViews,
  buffers: [{ byteLength: binaryChunk.length }],
};

const jsonChunk = padBuffer(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
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
