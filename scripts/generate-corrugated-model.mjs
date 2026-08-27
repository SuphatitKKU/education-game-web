import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve("public/assets/models/corrugated_cardboard.glb");

const materials = [
  {
    name: "MAT_Kraft_Liner",
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: { index: 0 },
      metallicFactor: 0,
      roughnessFactor: 0.98,
    },
  },
  {
    name: "MAT_Corrugated_Flute",
    pbrMetallicRoughness: {
      baseColorFactor: [0.82, 0.78, 0.7, 1],
      baseColorTexture: { index: 0 },
      metallicFactor: 0,
      roughnessFactor: 0.96,
    },
    doubleSided: true,
  },
  {
    name: "MAT_Outline",
    pbrMetallicRoughness: {
      baseColorFactor: [0.23, 0.15, 0.09, 1],
      metallicFactor: 0,
      roughnessFactor: 0.88,
    },
  },
];

const primitives = [];

function addBox(name, center, size, material) {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size.map((value) => value / 2);
  const positions = [];
  const normals = [];
  const texcoords = [];
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
    texcoords.push(0, 0, 3, 0, 3, 2, 0, 2);
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }

  primitives.push({ name, positions, normals, texcoords, indices, material });
}

function addCorrugatedFlute() {
  const positions = [];
  const normals = [];
  const texcoords = [];
  const indices = [];
  const segments = 240;
  const width = 5.96;
  const depth = 4.27;
  const amplitude = 0.14;
  const period = 0.48;
  const thickness = 0.045;

  const point = (index) => {
    const x = -width / 2 + (width * index) / segments;
    const phase = (Math.PI * 2 * x) / period;
    const y = amplitude * Math.sin(phase);
    const slope = amplitude * (Math.PI * 2 / period) * Math.cos(phase);
    const length = Math.hypot(slope, 1);
    return { x, y, nx: -slope / length, ny: 1 / length };
  };

  for (let index = 0; index <= segments; index += 1) {
    const current = point(index);
    const u = (index / segments) * 6;
    for (const side of [-1, 1]) {
      positions.push(current.x, current.y + thickness / 2, side * depth / 2);
      normals.push(current.nx, current.ny, 0);
      texcoords.push(u, side === -1 ? 0 : 3);
    }
    for (const side of [-1, 1]) {
      positions.push(current.x, current.y - thickness / 2, side * depth / 2);
      normals.push(-current.nx, -current.ny, 0);
      texcoords.push(u, side === -1 ? 0 : 3);
    }
  }

  for (let index = 0; index < segments; index += 1) {
    const a = index * 4;
    const b = (index + 1) * 4;
    indices.push(a, b, b + 1, a, b + 1, a + 1);
    indices.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
    indices.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3);
    indices.push(a + 2, b + 2, b, a + 2, b, a);
  }

  const start = 0;
  const end = segments * 4;
  indices.push(start, start + 1, start + 3, start, start + 3, start + 2);
  indices.push(end, end + 2, end + 3, end, end + 3, end + 1);

  primitives.push({
    name: "MESH_Corrugated_Flute",
    positions,
    normals,
    texcoords,
    indices,
    material: 1,
  });
}

const linerWidth = 6;
const linerDepth = 4.35;
const linerThickness = 0.065;
const linerY = 0.205;
const edgeThickness = 0.018;

addBox("MESH_Top_Liner", [0, linerY, 0], [linerWidth, linerThickness, linerDepth], 0);
addBox("MESH_Bottom_Liner", [0, -linerY, 0], [linerWidth, linerThickness, linerDepth], 0);
addCorrugatedFlute();

for (const y of [linerY, -linerY]) {
  addBox("MESH_Edge_Front", [0, y, linerDepth / 2 + 0.003], [linerWidth + 0.015, edgeThickness, edgeThickness], 2);
  addBox("MESH_Edge_Back", [0, y, -linerDepth / 2 - 0.003], [linerWidth + 0.015, edgeThickness, edgeThickness], 2);
  addBox("MESH_Edge_Left", [-linerWidth / 2 - 0.003, y, 0], [edgeThickness, edgeThickness, linerDepth + 0.015], 2);
  addBox("MESH_Edge_Right", [linerWidth / 2 + 0.003, y, 0], [edgeThickness, edgeThickness, linerDepth + 0.015], 2);
}

const bufferParts = [];
const bufferViews = [];
const accessors = [];
const meshes = [];
const nodes = [];
let byteOffset = 0;

function padBuffer(buffer) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding)]) : buffer;
}

function addBufferView(buffer, target) {
  const padded = padBuffer(buffer);
  const index = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length, target });
  bufferParts.push(padded);
  byteOffset += padded.length;
  return index;
}

function bounds(values) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < values.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], values[index + axis]);
      max[axis] = Math.max(max[axis], values[index + axis]);
    }
  }
  return { min, max };
}

function bounds2(values) {
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  for (let index = 0; index < values.length; index += 2) {
    min[0] = Math.min(min[0], values[index]);
    min[1] = Math.min(min[1], values[index + 1]);
    max[0] = Math.max(max[0], values[index]);
    max[1] = Math.max(max[1], values[index + 1]);
  }
  return { min, max };
}

const textureData = await readFile(resolve("public/assets/models/textures/corrugated_cardboard_surface_v1.png"));
const textureView = addBufferView(textureData);
const samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
const images = [{ bufferView: textureView, mimeType: "image/png", name: "Corrugated_Cardboard_Surface_Texture" }];
const textures = [{ sampler: 0, source: 0, name: "Corrugated_Cardboard_Surface_Texture" }];

for (const primitive of primitives) {
  const positionArray = new Float32Array(primitive.positions);
  const normalArray = new Float32Array(primitive.normals);
  const texcoordArray = new Float32Array(primitive.texcoords);
  const indexArray = new Uint16Array(primitive.indices);
  const positionView = addBufferView(Buffer.from(positionArray.buffer), 34962);
  const normalView = addBufferView(Buffer.from(normalArray.buffer), 34962);
  const texcoordView = addBufferView(Buffer.from(texcoordArray.buffer), 34962);
  const indexView = addBufferView(Buffer.from(indexArray.buffer), 34963);
  const positionBounds = bounds(primitive.positions);
  const positionAccessor = accessors.push({
    bufferView: positionView,
    componentType: 5126,
    count: positionArray.length / 3,
    type: "VEC3",
    ...positionBounds,
  }) - 1;
  const normalAccessor = accessors.push({
    bufferView: normalView,
    componentType: 5126,
    count: normalArray.length / 3,
    type: "VEC3",
  }) - 1;
  const texcoordAccessor = accessors.push({
    bufferView: texcoordView,
    componentType: 5126,
    count: texcoordArray.length / 2,
    type: "VEC2",
    ...bounds2(primitive.texcoords),
  }) - 1;
  const indexAccessor = accessors.push({
    bufferView: indexView,
    componentType: 5123,
    count: indexArray.length,
    type: "SCALAR",
    min: [Math.min(...primitive.indices)],
    max: [Math.max(...primitive.indices)],
  }) - 1;

  const meshIndex = meshes.push({
    name: primitive.name,
    primitives: [{
      attributes: { POSITION: positionAccessor, NORMAL: normalAccessor, TEXCOORD_0: texcoordAccessor },
      indices: indexAccessor,
      material: primitive.material,
    }],
  }) - 1;
  nodes.push({ name: primitive.name, mesh: meshIndex });
}

const binaryChunk = Buffer.concat(bufferParts);
const gltf = {
  asset: { version: "2.0", generator: "Parcel Lab corrugated cardboard generator" },
  scene: 0,
  scenes: [{ name: "Corrugated_Cardboard", nodes: nodes.map((_, index) => index) }],
  nodes,
  meshes,
  materials,
  samplers,
  images,
  textures,
  accessors,
  bufferViews,
  buffers: [{ byteLength: binaryChunk.length }],
};

const jsonChunk = padBuffer(Buffer.from(JSON.stringify(gltf), "utf8"));
jsonChunk.fill(0x20, Buffer.byteLength(JSON.stringify(gltf), "utf8"));
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binaryChunk.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binaryChunk.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binaryChunk]));
console.log(`Created ${outputPath} (${(header.length + jsonHeader.length + jsonChunk.length + binHeader.length + binaryChunk.length) / 1024 | 0} KB)`);
