import bpy
import os
from mathutils import Vector


PROJECT = r"C:\Users\MuTon\OneDrive\Desktop\แผนการสอน\เค้าโครงวิจัย\simulation\education-game-web"
GLB_PATH = os.path.join(PROJECT, "public", "assets", "models", "damaged_box_blender.glb")
VERIFY_PATH = os.path.join(PROJECT, "public", "assets", "models", "water_stain_glb_verify.png")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.025, .04, .055, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .4

for location, energy, size in [((-3.5, -4.5, 4), 1050, 4), ((4, -3, 2), 650, 3), ((0, 3, 4), 700, 3)]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size

bpy.ops.mesh.primitive_plane_add(size=18, location=(0, 0, -1.24))
ground = bpy.context.object
ground_mat = bpy.data.materials.new("WaterVerifyGround")
ground_mat.diffuse_color = (.055, .07, .085, 1)
ground.data.materials.append(ground_mat)

# Low front-three-quarter camera exposes the vertical wall under the open flap.
bpy.ops.object.camera_add(location=(-4.9, -7.0, .55))
camera = bpy.context.object
target = Vector((-1.02, -1.25, -.24))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.lens = 66
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1100
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = VERIFY_PATH
scene.view_settings.look = "AgX - Medium High Contrast"
bpy.ops.render.render(write_still=True)

stain = bpy.data.objects.get("FrontWall_DentedCorner")
result = {
    "verify": VERIFY_PATH,
    "stain_found": stain is not None,
    "stain_material": stain.data.materials[0].name if stain and stain.data.materials else None,
}
