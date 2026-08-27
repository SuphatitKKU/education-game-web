import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "public", "assets", "models", "damaged_box.glb");
const outputPath = path.join(root, "public", "assets", "models", "damaged_box_open_four_flaps.glb");

function readSourceCardboard() {
  const file = fs.readFileSync(sourcePath);
  const jsonLength = file.readUInt32LE(12);
  const sourceJson = JSON.parse(file.toString("utf8", 20, 20 + jsonLength).trim());
  const binaryHeader = 20 + jsonLength;
  const binaryLength = file.readUInt32LE(binaryHeader);
  const binary = file.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength);
  const primitive = sourceJson.meshes[0].primitives[0];
  const readAccessor = (index) => {
    const accessor = sourceJson.accessors[index];
    const view = sourceJson.bufferViews[accessor.bufferView];
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const components = accessor.type === "VEC3" ? 3 : 1;
    const ArrayType = accessor.componentType === 5126 ? Float32Array : accessor.componentType === 5123 ? Uint16Array : Uint32Array;
    return new ArrayType(binary.buffer, binary.byteOffset + offset, accessor.count * components);
  };
  return {
    positions: readAccessor(primitive.attributes.POSITION),
    normals: readAccessor(primitive.attributes.NORMAL),
    colors: readAccessor(primitive.attributes.COLOR_0),
    indices: readAccessor(primitive.indices),
  };
}

const sourceCardboard = readSourceCardboard();

const json = {
  asset: { version: "2.0", generator: "Parcel Lab open four-flap box generator" },
  scene: 0,
  scenes: [{ name: "OpenDamagedParcelScene", nodes: [0] }],
  nodes: [{ name: "OpenDamagedParcel", children: [], extras: { asset_revision: "four-open-flaps-v1", contains_visible_damaged_cup: true } }],
  meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }],
};

const binaryParts = [];
let binaryLength = 0;

function pad4(buffer, fill = 0) {
  const padding = (4 - buffer.length % 4) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, fill)]) : buffer;
}

function appendTypedArray(typedArray, target) {
  const aligned = (binaryLength + 3) & ~3;
  if (aligned > binaryLength) binaryParts.push(Buffer.alloc(aligned - binaryLength));
  binaryLength = aligned;
  const data = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  const view = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset: binaryLength, byteLength: data.length, target });
  binaryParts.push(data);
  binaryLength += data.length;
  return view;
}

function writeGlb() {
  const binary = Buffer.concat(binaryParts);
  json.buffers[0].byteLength = binary.length;
  const jsonChunk = pad4(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binChunk = pad4(binary);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(outputPath, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]));
}

function geometry() { return { positions: [], normals: [], colors: [], indices: [] }; }

function extractSourceRegion(test, transform = (position, normal) => ({ position, normal })) {
  const g = geometry();
  const { positions, normals, colors, indices } = sourceCardboard;
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const sourceIndices = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    const centroid = [0, 0, 0];
    for (const index of sourceIndices) for (let axis = 0; axis < 3; axis += 1) centroid[axis] += positions[index * 3 + axis] / 3;
    if (!test(centroid)) continue;
    const start = g.positions.length / 3;
    for (const index of sourceIndices) {
      const position = [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
      const normal = [normals[index * 3], normals[index * 3 + 1], normals[index * 3 + 2]];
      const mapped = transform(position, normal);
      g.positions.push(...mapped.position);
      g.normals.push(...mapped.normal);
      g.colors.push(colors[index * 3], colors[index * 3 + 1], colors[index * 3 + 2]);
    }
    g.indices.push(start, start + 1, start + 2);
  }
  return g;
}

function addQuad(g, a, b, c, d, normal) {
  const start = g.positions.length / 3;
  g.positions.push(...a, ...b, ...c, ...d);
  for (let i = 0; i < 4; i += 1) g.normals.push(...normal);
  g.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function addTriangle(g, a, b, c, normal) {
  const start = g.positions.length / 3;
  g.positions.push(...a, ...b, ...c);
  g.normals.push(...normal, ...normal, ...normal);
  g.indices.push(start, start + 1, start + 2);
}

function addAutoTriangle(g, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const length = Math.hypot(...cross) || 1;
  addTriangle(g, a, b, c, cross.map((value) => value / length));
}

function addRibbon3D(g, a, b, offset) {
  const aPlus = a.map((value, index) => value + offset[index]);
  const aMinus = a.map((value, index) => value - offset[index]);
  const bPlus = b.map((value, index) => value + offset[index]);
  const bMinus = b.map((value, index) => value - offset[index]);
  addAutoTriangle(g, aPlus, aMinus, bMinus);
  addAutoTriangle(g, aPlus, bMinus, bPlus);
}

function addBox(g, center, size) {
  const [cx, cy, cz] = center;
  const [hx, hy, hz] = size.map((v) => v / 2);
  const p = {
    lbf: [cx - hx, cy - hy, cz + hz], rbf: [cx + hx, cy - hy, cz + hz], rtf: [cx + hx, cy + hy, cz + hz], ltf: [cx - hx, cy + hy, cz + hz],
    lbb: [cx - hx, cy - hy, cz - hz], rbb: [cx + hx, cy - hy, cz - hz], rtb: [cx + hx, cy + hy, cz - hz], ltb: [cx - hx, cy + hy, cz - hz],
  };
  addQuad(g, p.lbf, p.rbf, p.rtf, p.ltf, [0, 0, 1]);
  addQuad(g, p.rbb, p.lbb, p.ltb, p.rtb, [0, 0, -1]);
  addQuad(g, p.rbf, p.rbb, p.rtb, p.rtf, [1, 0, 0]);
  addQuad(g, p.lbb, p.lbf, p.ltf, p.ltb, [-1, 0, 0]);
  addQuad(g, p.ltf, p.rtf, p.rtb, p.ltb, [0, 1, 0]);
  addQuad(g, p.lbb, p.rbb, p.rbf, p.lbf, [0, -1, 0]);
}

function addEllipsoid(g, center, radii, segments = 14, rings = 7, wobble = 0.1) {
  const [cx, cy, cz] = center;
  const [rx, ry, rz] = radii;
  for (let ring = 0; ring < rings; ring += 1) {
    const v0 = ring / rings;
    const v1 = (ring + 1) / rings;
    const p0 = -Math.PI / 2 + v0 * Math.PI;
    const p1 = -Math.PI / 2 + v1 * Math.PI;
    for (let segment = 0; segment < segments; segment += 1) {
      const a0 = segment / segments * Math.PI * 2;
      const a1 = (segment + 1) / segments * Math.PI * 2;
      const point = (p, a) => {
        const noise = 1 + wobble * Math.sin(a * 3 + p * 4) * Math.cos(a * 2 - p * 3);
        return [cx + rx * Math.cos(p) * Math.cos(a) * noise, cy + ry * Math.sin(p) * noise, cz + rz * Math.cos(p) * Math.sin(a) * noise];
      };
      const normal = (p, a) => [Math.cos(p) * Math.cos(a), Math.sin(p), Math.cos(p) * Math.sin(a)];
      const start = g.positions.length / 3;
      g.positions.push(...point(p0, a0), ...point(p0, a1), ...point(p1, a1), ...point(p1, a0));
      g.normals.push(...normal(p0, a0), ...normal(p0, a1), ...normal(p1, a1), ...normal(p1, a0));
      g.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  }
}

function addCupBody(g, center, height, bottomRadius, topRadius, segments = 28) {
  const [cx, cy, cz] = center;
  const bottomY = cy - height / 2;
  const shoulderY = cy + height * 0.28;
  const topY = cy + height / 2;
  const chipStart = 5;
  const chipEnd = 8;
  const addBand = (lowY, highY, lowR, highR, chipped) => {
    for (let i = 0; i < segments; i += 1) {
      if (chipped && i >= chipStart && i <= chipEnd) continue;
      const a0 = i / segments * Math.PI * 2;
      const a1 = (i + 1) / segments * Math.PI * 2;
      const n0 = [Math.cos(a0), 0.08, Math.sin(a0)];
      const n1 = [Math.cos(a1), 0.08, Math.sin(a1)];
      const start = g.positions.length / 3;
      g.positions.push(cx + lowR * Math.cos(a0), lowY, cz + lowR * Math.sin(a0), cx + lowR * Math.cos(a1), lowY, cz + lowR * Math.sin(a1), cx + highR * Math.cos(a1), highY, cz + highR * Math.sin(a1), cx + highR * Math.cos(a0), highY, cz + highR * Math.sin(a0));
      g.normals.push(...n0, ...n1, ...n1, ...n0);
      g.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  };
  addBand(bottomY, shoulderY, bottomRadius, topRadius * 0.96, false);
  addBand(shoulderY, topY, topRadius * 0.96, topRadius, true);
  const innerRadius = topRadius * 0.80;
  for (let i = 0; i < segments; i += 1) {
    if (i >= chipStart && i <= chipEnd) continue;
    const a0 = i / segments * Math.PI * 2;
    const a1 = (i + 1) / segments * Math.PI * 2;
    addQuad(g, [cx + innerRadius * Math.cos(a0), topY, cz + innerRadius * Math.sin(a0)], [cx + innerRadius * Math.cos(a1), topY, cz + innerRadius * Math.sin(a1)], [cx + topRadius * Math.cos(a1), topY, cz + topRadius * Math.sin(a1)], [cx + topRadius * Math.cos(a0), topY, cz + topRadius * Math.sin(a0)], [0, 1, 0]);
  }
}

function addTorusArc(g, center, arcRadius, tubeRadius, startAngle, endAngle, arcSegments = 18, tubeSegments = 8) {
  const [cx, cy, cz] = center;
  for (let i = 0; i < arcSegments; i += 1) {
    const a0 = startAngle + (endAngle - startAngle) * i / arcSegments;
    const a1 = startAngle + (endAngle - startAngle) * (i + 1) / arcSegments;
    for (let j = 0; j < tubeSegments; j += 1) {
      const b0 = j / tubeSegments * Math.PI * 2;
      const b1 = (j + 1) / tubeSegments * Math.PI * 2;
      const point = (a, b) => [cx + (arcRadius + tubeRadius * Math.cos(b)) * Math.cos(a), cy + (arcRadius + tubeRadius * Math.cos(b)) * Math.sin(a), cz + tubeRadius * Math.sin(b)];
      const normal = (a, b) => [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)];
      const start = g.positions.length / 3;
      g.positions.push(...point(a0, b0), ...point(a1, b0), ...point(a1, b1), ...point(a0, b1));
      g.normals.push(...normal(a0, b0), ...normal(a1, b0), ...normal(a1, b1), ...normal(a0, b1));
      g.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  }
}

function addFlatLine(g, a, b, width, z) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const ox = -dy / length * width / 2;
  const oy = dx / length * width / 2;
  addQuad(g, [a[0] + ox, a[1] + oy, z], [a[0] - ox, a[1] - oy, z], [b[0] - ox, b[1] - oy, z], [b[0] + ox, b[1] + oy, z], [0, 0, 1]);
}

function addDiscXY(g, center, radii, z, segments = 18) {
  const start = g.positions.length / 3;
  g.positions.push(center[0], center[1], z);
  g.normals.push(0, 0, 1);
  for (let i = 0; i <= segments; i += 1) {
    const a = i / segments * Math.PI * 2;
    const wobble = 1 + 0.12 * Math.sin(a * 5);
    g.positions.push(center[0] + radii[0] * Math.cos(a) * wobble, center[1] + radii[1] * Math.sin(a) * wobble, z);
    g.normals.push(0, 0, 1);
    if (i > 0) g.indices.push(start, start + i, start + i + 1);
  }
}

function addDiscXZ(g, center, radii, y, segments = 24) {
  const start = g.positions.length / 3;
  g.positions.push(center[0], y, center[1]);
  g.normals.push(0, -1, 0);
  for (let i = 0; i <= segments; i += 1) {
    const a = i / segments * Math.PI * 2;
    const wobble = 1 + 0.08 * Math.sin(a * 5);
    g.positions.push(center[0] + radii[0] * Math.cos(a) * wobble, y, center[1] + radii[1] * Math.sin(a) * wobble);
    g.normals.push(0, -1, 0);
    if (i > 0) g.indices.push(start, start + i + 1, start + i);
  }
}

function addLineXZ(g, a, b, width, y) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz) || 1;
  const ox = -dz / length * width / 2;
  const oz = dx / length * width / 2;
  addQuad(g, [a[0] + ox, y, a[1] + oz], [b[0] + ox, y, b[1] + oz], [b[0] - ox, y, b[1] - oz], [a[0] - ox, y, a[1] - oz], [0, -1, 0]);
}

function addJaggedHoleYZ(g, x, points) {
  const centerY = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const centerZ = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const center = g.positions.length / 3;
  g.positions.push(x, centerY, centerZ);
  g.normals.push(-1, 0, 0);
  for (let i = 0; i <= points.length; i += 1) {
    const p = points[i % points.length];
    g.positions.push(x, p[0], p[1]);
    g.normals.push(-1, 0, 0);
    if (i > 0) g.indices.push(center, center + i + 1, center + i);
  }
}

function addSurfaceLine(g, a, b, width, surface) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const ox = -dy / length * width / 2;
  const oy = dx / length * width / 2;
  const points = [[a[0] + ox, a[1] + oy], [a[0] - ox, a[1] - oy], [b[0] - ox, b[1] - oy], [b[0] + ox, b[1] + oy]];
  const start = g.positions.length / 3;
  for (const [x, y] of points) {
    const value = surface(x, y);
    g.positions.push(x, y, value.z);
    g.normals.push(...value.normal);
  }
  g.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function minMax(values) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < values.length; i += 3) for (let axis = 0; axis < 3; axis += 1) { min[axis] = Math.min(min[axis], values[i + axis]); max[axis] = Math.max(max[axis], values[i + axis]); }
  return { min, max };
}

function addMaterial(name, color, options = {}) {
  const index = json.materials.length;
  json.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: options.roughness ?? 0.86 }, doubleSided: options.doubleSided ?? false, ...(options.alphaMode ? { alphaMode: options.alphaMode } : {}) });
  return index;
}

function addMesh(name, g, material) {
  const pView = appendTypedArray(new Float32Array(g.positions), 34962);
  const nView = appendTypedArray(new Float32Array(g.normals), 34962);
  const IndexArray = g.positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
  const iView = appendTypedArray(new IndexArray(g.indices), 34963);
  const bounds = minMax(g.positions);
  const pAccessor = json.accessors.length;
  json.accessors.push({ bufferView: pView, componentType: 5126, count: g.positions.length / 3, type: "VEC3", ...bounds });
  const nAccessor = json.accessors.length;
  json.accessors.push({ bufferView: nView, componentType: 5126, count: g.normals.length / 3, type: "VEC3" });
  const iAccessor = json.accessors.length;
  json.accessors.push({ bufferView: iView, componentType: IndexArray === Uint32Array ? 5125 : 5123, count: g.indices.length, type: "SCALAR", min: [Math.min(...g.indices)], max: [Math.max(...g.indices)] });
  const attributes = { POSITION: pAccessor, NORMAL: nAccessor };
  if (g.colors.length === g.positions.length) {
    const colorView = appendTypedArray(new Float32Array(g.colors), 34962);
    const colorAccessor = json.accessors.length;
    json.accessors.push({ bufferView: colorView, componentType: 5126, count: g.colors.length / 3, type: "VEC3" });
    attributes.COLOR_0 = colorAccessor;
  }
  const mesh = json.meshes.length;
  json.meshes.push({ name, primitives: [{ attributes, indices: iAccessor, material }] });
  return mesh;
}

function addNode(name, mesh, extras = {}, transform = {}) {
  const index = json.nodes.length;
  json.nodes.push({ name, ...(mesh === null ? {} : { mesh }), ...transform, extras });
  json.nodes[0].children.push(index);
  return index;
}

const cardboard = addMaterial("MAT_Cardboard_Fiber", [0.71, 0.39, 0.15, 1], { roughness: 0.95, doubleSided: true });
const edge = addMaterial("MAT_Cardboard_Edge", [0.88, 0.61, 0.30, 1], { roughness: 1, doubleSided: true });
const interior = addMaterial("MAT_Box_Interior", [0.30, 0.13, 0.045, 1], { roughness: 1, doubleSided: true });
const paper = addMaterial("MAT_Crumpled_Packing_Paper", [0.92, 0.88, 0.77, 1], { roughness: 1, doubleSided: true });
const ceramic = addMaterial("MAT_Damaged_Cup", [0.94, 0.89, 0.78, 1], { roughness: 0.55, doubleSided: true });
const cupInner = addMaterial("MAT_Cup_Inner", [0.50, 0.45, 0.38, 1], { roughness: 0.85, doubleSided: true });
const crack = addMaterial("MAT_Cup_Cracks", [0.12, 0.045, 0.018, 1], { roughness: 1, doubleSided: true });
const wet = addMaterial("MAT_Wet_Stain", [0.13, 0.055, 0.018, 0.96], { roughness: 0.48, doubleSided: true, alphaMode: "BLEND" });
const darkDamage = addMaterial("MAT_Damage_Shadow", [0.08, 0.025, 0.01, 1], { roughness: 1, doubleSided: true });
const dentCardboard = addMaterial("MAT_Dented_Cardboard", [0.55, 0.265, 0.085, 1], { roughness: 1, doubleSided: true });
const crease = addMaterial("MAT_Cardboard_Crease", [0.31, 0.12, 0.035, 1], { roughness: 1, doubleSided: true });
const sourceCardboardMaterial = addMaterial("MAT_Original_Damage_Vertex_Color", [1, 1, 1, 1], { roughness: 0.96, doubleSided: true });

const shell = geometry();
addBox(shell, [0, -1.12, 0], [3.42, 0.16, 2.52]);
// Leave the lower front-right corner open so the crumpled impact facets are real geometry.
addBox(shell, [-0.305, -0.32, 1.25], [2.81, 1.72, 0.14]);
addBox(shell, [1.405, 0.045, 1.25], [0.61, 0.99, 0.14]);
addBox(shell, [0, -0.32, -1.25], [3.42, 1.72, 0.14]);
addBox(shell, [-1.70, -0.32, 0], [0.14, 1.72, 2.52]);
addBox(shell, [1.70, -0.32, -0.25], [0.14, 1.72, 2.00]);
addBox(shell, [1.70, 0.045, 1.00], [0.14, 0.99, 0.50]);
addNode("OpenBoxBody", addMesh("OpenBoxBodyMesh", shell, cardboard), { visual_role: "open_box_body" });

const floor = geometry();
addQuad(floor, [-1.58, -1.02, -1.13], [1.58, -1.02, -1.13], [1.58, -1.02, 1.13], [-1.58, -1.02, 1.13], [0, 1, 0]);
addNode("VisibleBoxInterior", addMesh("VisibleBoxInteriorMesh", floor, interior), { visual_role: "inside" });

const frontFlap = geometry();
addBox(frontFlap, [-1.08, 0, 0], [1.26, 1.40, 0.10]);
addBox(frontFlap, [1.465, 0, 0], [0.49, 1.40, 0.10]);
addBox(frontFlap, [0.385, -0.66, 0], [1.67, 0.08, 0.10]);
addBox(frontFlap, [0.385, 0.66, 0], [1.67, 0.08, 0.10]);
const frontFlapMesh = addMesh("FrontOpenFlapMesh", frontFlap, cardboard);
addNode("FrontOpenFlap", frontFlapMesh, { visual_role: "open_flap", side: "front", damage_source: "original_model" }, { translation: [0, 0.15, 1.856], rotation: [-0.5, 0, 0, 0.8660254] });

const originalTopDent = extractSourceRegion(
  ([x, y, z]) => y > 0.72 && x > -0.42 && x < 1.20 && z > -0.70 && z < 0.70,
  (position, normal) => {
    const mappedNormal = [normal[0], normal[2], normal[1]];
    const length = Math.hypot(...mappedNormal) || 1;
    return {
      position: [position[0], position[2] * 0.86, 0.052 + (position[1] - 1.175) * 0.90],
      normal: mappedNormal.map((value) => value / length),
    };
  },
);
addNode("OriginalTopCrushDent", addMesh("OriginalTopCrushDentMesh", originalTopDent, sourceCardboardMaterial), { damage_type: "crushed", description_th: "รอยยุบด้านบนที่ดึงรูปทรงมาจากโมเดลแรก" }, { translation: [0, 0.15, 1.856], rotation: [-0.5, 0, 0, 0.8660254] });

const backFlap = geometry(); addBox(backFlap, [0, 0, 0], [3.42, 1.40, 0.10]);
const backFlapMesh = addMesh("BackOpenFlapMesh", backFlap, cardboard);
addNode("BackOpenFlap", backFlapMesh, { visual_role: "open_flap", side: "back" }, { translation: [0, 0.15, -1.856], rotation: [0.5, 0, 0, 0.8660254] });

const sideFlap = geometry(); addBox(sideFlap, [0, 0, 0], [1.40, 0.10, 2.52]);
const sideFlapMesh = addMesh("SideOpenFlapMesh", sideFlap, cardboard);
addNode("LeftOpenFlap", sideFlapMesh, { visual_role: "open_flap", side: "left" }, { translation: [-2.358, 0.261, 0], rotation: [0, 0, 0.1736482, 0.9848078] });
addNode("RightOpenFlap", sideFlapMesh, { visual_role: "open_flap", side: "right" }, { translation: [2.358, 0.261, 0], rotation: [0, 0, -0.1736482, 0.9848078] });

const flapEdges = geometry();
addBox(flapEdges, [0, 0, 0.055], [3.46, 0.055, 0.035]);
const flapEdgeMesh = addMesh("FlapEdgeMesh", flapEdges, edge);
addNode("FrontFlapEdge", flapEdgeMesh, {}, { translation: [0, 0.15, 1.856], rotation: [-0.5, 0, 0, 0.8660254] });
addNode("BackFlapEdge", flapEdgeMesh, {}, { translation: [0, 0.15, -1.856], rotation: [0.5, 0, 0, 0.8660254] });

const packing = geometry();
addEllipsoid(packing, [-0.90, -0.30, 0.10], [0.72, 0.48, 0.70], 14, 7, 0.14);
addEllipsoid(packing, [0.82, -0.34, -0.18], [0.68, 0.43, 0.74], 14, 7, 0.16);
addEllipsoid(packing, [0.10, -0.53, -0.65], [0.82, 0.38, 0.55], 14, 7, 0.13);
addEllipsoid(packing, [-0.22, -0.60, 0.73], [0.78, 0.34, 0.47], 14, 7, 0.15);
addNode("CrumpledPackingPaper", addMesh("CrumpledPackingPaperMesh", packing, paper), { visual_role: "packing_material" });

const mug = geometry();
addCupBody(mug, [0.03, 0.18, 0.28], 1.16, 0.31, 0.42);
addNode("DamagedCup", addMesh("DamagedCupMesh", mug, ceramic), { visual_role: "damaged_object", damage: "cracked_and_chipped" });

const inner = geometry();
const innerY = 0.18 + 1.16 / 2 - 0.018;
const innerR = 0.42 * 0.79;
const innerStart = inner.positions.length / 3;
inner.positions.push(0.03, innerY, 0.28); inner.normals.push(0, 1, 0);
for (let i = 0; i <= 28; i += 1) {
  const a = i / 28 * Math.PI * 2;
  inner.positions.push(0.03 + innerR * Math.cos(a), innerY, 0.28 + innerR * Math.sin(a)); inner.normals.push(0, 1, 0);
  if (i > 0) inner.indices.push(innerStart, innerStart + i, innerStart + i + 1);
}
addNode("DamagedCupInterior", addMesh("DamagedCupInteriorMesh", inner, cupInner));

const handle = geometry();
addTorusArc(handle, [0.41, 0.18, 0.28], 0.34, 0.075, -Math.PI / 2, Math.PI / 2);
addNode("DamagedCupHandle", addMesh("DamagedCupHandleMesh", handle, ceramic));

const cracks = geometry();
const cupSurface = (x, y) => {
  const bottomY = -0.40;
  const shoulderY = 0.18 + 1.16 * 0.28;
  const topY = 0.76;
  const lowerT = Math.max(0, Math.min(1, (y - bottomY) / (shoulderY - bottomY)));
  const upperT = Math.max(0, Math.min(1, (y - shoulderY) / (topY - shoulderY)));
  const radius = y <= shoulderY ? 0.31 + (0.42 * 0.96 - 0.31) * lowerT : 0.42 * 0.96 + (0.42 - 0.42 * 0.96) * upperT;
  const localX = x - 0.03;
  const localZ = Math.sqrt(Math.max(0.002, radius * radius - localX * localX));
  return { z: 0.28 + localZ + 0.006, normal: [localX / radius, 0, localZ / radius] };
};
const cp = [[0.15, 0.51], [0.04, 0.36], [0.16, 0.18], [0.03, -0.02], [0.17, -0.27]];
for (let i = 0; i < cp.length - 1; i += 1) addSurfaceLine(cracks, cp[i], cp[i + 1], 0.030, cupSurface);
addSurfaceLine(cracks, [0.04, 0.36], [-0.18, 0.27], 0.024, cupSurface);
addSurfaceLine(cracks, [0.16, 0.18], [0.32, 0.29], 0.024, cupSurface);
addSurfaceLine(cracks, [0.03, -0.02], [-0.16, -0.13], 0.022, cupSurface);
addNode("VisibleCupCracks", addMesh("VisibleCupCracksMesh", cracks, crack), { visual_role: "visible_cracks" });

const fragment = geometry();
addTriangle(fragment, [0.48, -0.43, 0.83], [0.75, -0.46, 0.72], [0.60, -0.22, 0.78], [0, 0.3, 0.95]);
addNode("BrokenCupFragment", addMesh("BrokenCupFragmentMesh", fragment, ceramic), { visual_role: "broken_fragment" });

const stain = geometry();
addDiscXY(stain, [-1.00, -0.28], [0.62, 0.70], 1.326);
addDiscXY(stain, [-0.55, -0.68], [0.43, 0.38], 1.328);
addDiscXY(stain, [-1.35, -0.80], [0.22, 0.28], 1.330);
addQuad(stain, [-1.39, -0.30, 1.331], [-1.26, -0.30, 1.331], [-1.30, -1.06, 1.331], [-1.43, -1.06, 1.331], [0, 0, 1]);
addQuad(stain, [-0.93, -0.10, 1.332], [-0.81, -0.10, 1.332], [-0.85, -0.94, 1.332], [-0.97, -0.94, 1.332], [0, 0, 1]);
addNode("WetStain", addMesh("WetStainMesh", stain, wet), { damage_type: "wet" });

const tear = geometry();
const tearPoints = [[-0.62, -0.36], [-0.71, -0.06], [-0.48, 0.28], [-0.15, 0.42], [0.18, 0.23], [0.31, -0.06], [0.11, -0.39], [-0.24, -0.49]];
addJaggedHoleYZ(tear, -1.776, tearPoints);
addNode("TornOpening", addMesh("TornOpeningMesh", tear, darkDamage), { damage_type: "torn" });

const tornFlaps = geometry();
addTriangle(tornFlaps, [-1.784, -0.71, -0.06], [-1.784, -0.48, 0.28], [-2.02, -0.43, 0.06], [-0.7, 0.1, 0.7]);
addTriangle(tornFlaps, [-1.784, -0.15, 0.42], [-1.784, 0.18, 0.23], [-1.98, 0.08, 0.50], [-0.7, 0.6, 0.3]);
addTriangle(tornFlaps, [-1.784, 0.31, -0.06], [-1.784, 0.11, -0.39], [-2.00, 0.28, -0.26], [-0.7, 0.6, -0.2]);
addTriangle(tornFlaps, [-1.784, -0.24, -0.49], [-1.784, -0.62, -0.36], [-1.99, -0.43, -0.55], [-0.8, -0.2, -0.5]);
addNode("TornPaperFlaps", addMesh("TornPaperFlapsMesh", tornFlaps, edge), { damage_type: "torn_fibers" });

const originalCornerDent = extractSourceRegion(([x, y, z]) => x > 1.05 && y < -0.38 && z > 0.68);
addNode("OriginalDentedCorner", addMesh("OriginalDentedCornerMesh", originalCornerDent, sourceCardboardMaterial), { damage_type: "dented", description_th: "มุมบุบจากการตกกระแทกที่ดึงรูปทรงมาจากโมเดลแรก" });

addNode("Hotspot_Crushed", null, { hotspot: "crushed" }, { translation: [0.52, 0.08, 1.70] });
addNode("Hotspot_DentedCorner", null, { hotspot: "dented" }, { translation: [1.43, -0.78, 1.175] });
addNode("Hotspot_Torn", null, { hotspot: "torn" }, { translation: [-1.82, -0.15, -0.05] });
addNode("Hotspot_Wet", null, { hotspot: "wet" }, { translation: [-1.08, -0.02, 1.33] });

writeGlb();
console.log(`Wrote ${path.relative(root, outputPath)} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
