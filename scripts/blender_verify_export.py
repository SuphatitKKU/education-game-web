import bpy
import os
from mathutils import Vector


PROJECT = r"C:\Users\MuTon\OneDrive\Desktop\แผนการสอน\เค้าโครงวิจัย\simulation\education-game-web"
GLB_PATH = os.path.join(PROJECT, "public", "assets", "models", "damaged_box_blender.glb")
VERIFY_PATH = os.path.join(PROJECT, "public", "assets", "models", "damaged_box_blender_glb_verify.png")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.055, 0.08, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55

for location, energy, size in [((4, -4, 6), 1050, 5), ((-4, -1, 3), 720, 4), ((0, 4, 5), 800, 3)]:
    bpy.ops.object.light_add(type="AREA", location=location)
    bpy.context.object.data.energy = energy
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = size

bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -1.24))
ground = bpy.context.object
ground_mat = bpy.data.materials.new("VerifyGround")
ground_mat.diffuse_color = (0.055, 0.075, 0.10, 1)
ground.data.materials.append(ground_mat)

bpy.ops.object.camera_add(location=(6.2, -7.2, 5.4))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, -0.15, -0.15)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.lens = 58
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 960
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = VERIFY_PATH
scene.view_settings.look = "AgX - Medium High Contrast"
bpy.ops.render.render(write_still=True)

material_colors = {}
for material in bpy.data.materials:
    if material.use_nodes:
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            material_colors[material.name] = tuple(round(value, 4) for value in bsdf.inputs["Base Color"].default_value[:3])

result = {"verify": VERIFY_PATH, "materials": material_colors}
