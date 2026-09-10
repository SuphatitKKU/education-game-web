import bpy
import math
import os
from mathutils import Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BLEND_PATH = os.path.join(ROOT, "blender", "impact_egg_models.blend")
MODEL_DIR = os.path.join(ROOT, "public", "assets", "models")
PREVIEW_DIR = os.path.join(ROOT, "public", "assets", "impact")

VARIANTS = {
    "none": "impact_egg_intact",
    "slight": "impact_egg_slight",
    "much": "impact_egg_much",
}

os.makedirs(os.path.dirname(BLEND_PATH), exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)


def material(name, color, roughness=0.38, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = metallic
        coat = shader.inputs.get("Coat Weight")
        if coat:
            coat.default_value = 0.16
    return mat


SHELL = material("Egg shell - warm cream", (0.93, 0.66, 0.31), 0.31)
SHELL_EDGE = material("Fresh shell edge", (0.98, 0.80, 0.51), 0.42)
INNER = material("Dark inner break", (0.25, 0.105, 0.042), 0.58)
CRACK = material("Crack groove", (0.285, 0.12, 0.052), 0.66)


def radius_at(z):
    normalized = max(-1.0, min(1.0, z / 0.68))
    return 0.48 * math.sqrt(max(0.0, 1.0 - normalized * normalized)) * (1.0 - 0.17 * normalized)


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def create_full_egg(name, collection, flatten=1.0, lean=0.0):
    rings = 64
    segments = 96
    vertices = [(0.0, 0.0, -0.68)]
    for ring in range(1, rings):
        t = ring / rings
        normalized = -1.0 + 2.0 * t
        z = normalized * 0.68
        radius = radius_at(z)
        # Gentle irregularity keeps the silhouette organic without becoming lumpy.
        for segment in range(segments):
            angle = 2.0 * math.pi * segment / segments
            variation = 1.0 + 0.008 * math.sin(angle * 3.0 + normalized * 2.1)
            x = radius * variation * math.cos(angle)
            y = radius * variation * math.sin(angle)
            vertices.append((x, y, z))
    top_index = len(vertices)
    vertices.append((0.0, 0.0, 0.68))

    faces = []
    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
    for ring in range(rings - 2):
        start = 1 + ring * segments
        next_start = start + segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((start + segment, next_start + segment, next_start + nxt, start + nxt))
    last_start = 1 + (rings - 2) * segments
    for segment in range(segments):
        faces.append((last_start + segment, top_index, last_start + (segment + 1) % segments))

    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(SHELL)
    obj.scale.z = flatten
    obj.rotation_euler[1] = lean
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    bevel = obj.modifiers.new("Soft shell bevel", "BEVEL")
    bevel.width = 0.008
    bevel.segments = 2
    return obj


def create_crack(name, collection, points, thickness=0.012):
    curve = bpy.data.curves.new(name + "Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = thickness
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for index, (x, z) in enumerate(points):
        radial = radius_at(z)
        y = -math.sqrt(max(0.001, radial * radial - x * x)) - 0.008
        spline.points[index].co = (x, y, z, 1.0)
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(CRACK)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def add_slight_damage(collection):
    egg = create_full_egg("Egg_SlightDamage", collection, flatten=0.965, lean=math.radians(3.5))
    create_crack("Main hairline crack", collection, [(-0.03, 0.38), (0.025, 0.27), (-0.015, 0.16), (0.07, 0.055), (0.04, -0.07)], 0.0065)
    create_crack("Left crack branch", collection, [(0.005, 0.27), (-0.12, 0.21), (-0.19, 0.12)], 0.005)
    create_crack("Right crack branch", collection, [(-0.005, 0.16), (0.13, 0.12), (0.19, 0.035)], 0.005)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0, location=(0.055, -0.468, 0.355))
    chip = bpy.context.object
    chip.name = "Small chipped shell"
    chip.scale = (0.052, 0.010, 0.034)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    chip.data.materials.append(INNER)
    for polygon in chip.data.polygons:
        polygon.use_smooth = True
    link_object(chip, collection)
    return egg


def create_broken_base(collection):
    rings = 42
    segments = 96
    top_normalized = 0.28
    vertices = [(0.0, 0.0, -0.68)]
    top_ring = []
    for ring in range(1, rings + 1):
        t = ring / rings
        normalized = -1.0 + (top_normalized + 1.0) * t
        base_z = normalized * 0.68
        for segment in range(segments):
            angle = 2.0 * math.pi * segment / segments
            jagged = 0.0
            if ring == rings:
                jagged = 0.035 * math.sin(angle * 5.0 + 0.7) + 0.018 * math.sin(angle * 11.0)
            z = base_z + jagged
            radius = radius_at(z)
            x = radius * math.cos(angle)
            y = radius * math.sin(angle)
            vertices.append((x, y, z))
            if ring == rings:
                top_ring.append(len(vertices) - 1)
    cap_center = len(vertices)
    vertices.append((0.0, 0.0, top_normalized * 0.68 - 0.035))

    faces = []
    material_indices = []
    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
        material_indices.append(0)
    for ring in range(rings - 1):
        start = 1 + ring * segments
        next_start = start + segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((start + segment, next_start + segment, next_start + nxt, start + nxt))
            material_indices.append(0)
    for segment in range(segments):
        faces.append((top_ring[segment], cap_center, top_ring[(segment + 1) % segments]))
        material_indices.append(1)

    mesh = bpy.data.meshes.new("Egg_MajorDamageMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Egg_MajorDamage", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(SHELL)
    obj.data.materials.append(INNER)
    obj.scale = (1.08, 1.04, 0.78)
    obj.rotation_euler[1] = math.radians(-7)
    for index, polygon in enumerate(mesh.polygons):
        polygon.material_index = material_indices[index]
        polygon.use_smooth = polygon.material_index == 0
    bevel = obj.modifiers.new("Broken rim bevel", "BEVEL")
    bevel.width = 0.009
    bevel.segments = 2
    return obj


def create_shard(name, collection, location, rotation, size):
    width, height = size
    vertices = [
        (-width * 0.55, 0.0, -height * 0.45),
        (width * 0.48, 0.025, -height * 0.34),
        (width * 0.32, -0.01, height * 0.52),
        (-width * 0.28, 0.018, height * 0.35),
    ]
    faces = [(0, 1, 2, 3)]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    obj.data.materials.append(SHELL_EDGE)
    solidify = obj.modifiers.new("Shell thickness", "SOLIDIFY")
    solidify.thickness = 0.028
    bevel = obj.modifiers.new("Rounded shard edge", "BEVEL")
    bevel.width = 0.012
    bevel.segments = 2
    return obj


def add_major_damage(collection):
    egg = create_broken_base(collection)
    create_crack("Large remaining crack", collection, [(-0.22, 0.11), (-0.15, 0.0), (-0.23, -0.13), (-0.17, -0.28)], 0.015)
    create_crack("Large crack branch", collection, [(-0.15, 0.0), (-0.02, -0.055), (0.09, -0.16)], 0.012)
    create_shard("Detached shell left", collection, (-0.57, -0.04, -0.49), (math.radians(72), math.radians(12), math.radians(-26)), (0.38, 0.42))
    create_shard("Detached shell right", collection, (0.59, 0.08, -0.51), (math.radians(66), math.radians(-18), math.radians(34)), (0.34, 0.38))
    create_shard("Detached shell back", collection, (0.20, 0.40, -0.55), (math.radians(84), math.radians(8), math.radians(-12)), (0.30, 0.33))
    create_shard("Detached shell front", collection, (-0.12, -0.52, -0.52), (math.radians(78), math.radians(-10), math.radians(18)), (0.27, 0.31))
    return egg


def create_variant(key):
    collection = bpy.data.collections.new("Impact egg - " + key)
    bpy.context.scene.collection.children.link(collection)
    if key == "none":
        create_full_egg("Egg_Intact", collection)
    elif key == "slight":
        add_slight_damage(collection)
    else:
        add_major_damage(collection)
    return collection


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_render():
    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.91, 0.96, 1.0, 1.0)
    background.inputs["Strength"].default_value = 0.72

    for location, energy, size, color in [
        ((-3.5, -4.0, 5.0), 900, 4.0, (1.0, 0.91, 0.78)),
        ((4.0, -1.0, 3.2), 620, 3.2, (0.72, 0.87, 1.0)),
        ((0.5, 4.0, 4.5), 760, 3.0, (0.86, 0.93, 1.0)),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color

    bpy.ops.object.camera_add(location=(2.15, -4.0, 1.5))
    camera = bpy.context.object
    camera.data.lens = 70
    look_at(camera, (0.0, 0.0, -0.02))
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"


def set_variant_visibility(collections, active_key):
    for key, collection in collections.items():
        hidden = key != active_key
        collection.hide_render = hidden
        collection.hide_viewport = hidden


def export_variant(key, collection):
    bpy.ops.object.select_all(action="DESELECT")
    export_objects = [obj for obj in collection.all_objects if obj.type in {"MESH", "CURVE"}]
    for obj in export_objects:
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    if export_objects:
        bpy.context.view_layer.objects.active = export_objects[0]
    output = os.path.join(MODEL_DIR, VARIANTS[key] + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.object.select_all(action="DESELECT")


clear_scene()
collections = {key: create_variant(key) for key in VARIANTS}
setup_render()

for key, collection in collections.items():
    set_variant_visibility(collections, key)
    bpy.context.scene.render.filepath = os.path.join(PREVIEW_DIR, VARIANTS[key] + ".png")
    bpy.ops.render.render(write_still=True)
    export_variant(key, collection)

for collection in collections.values():
    collection.hide_render = False
    collection.hide_viewport = False

bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
print("IMPACT_EGG_BUILD_COMPLETE")
for key in VARIANTS:
    print(os.path.join(MODEL_DIR, VARIANTS[key] + ".glb"))
