import bpy
import math
import os
from mathutils import Vector


PROJECT = r"C:\Users\MuTon\OneDrive\Desktop\แผนการสอน\เค้าโครงวิจัย\simulation\education-game-web"
BLEND_PATH = os.path.join(PROJECT, "blender", "damaged_parcel_detailed.blend")
GLB_PATH = os.path.join(PROJECT, "public", "assets", "models", "damaged_box_blender.glb")
PREVIEW_PATH = os.path.join(PROJECT, "public", "assets", "models", "damaged_box_blender_preview.png")
TRACE_PATH = os.path.join(PROJECT, "blender", "damaged_parcel_build.log")


def trace(message):
    os.makedirs(os.path.dirname(TRACE_PATH), exist_ok=True)
    with open(TRACE_PATH, "a", encoding="utf-8") as handle:
        handle.write(message + "\n")
        handle.flush()


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name, color, roughness=0.75, metallic=0.0, procedural=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    # Keep the shader GLTF-compatible. Unsupported procedural links are exported as white by model-viewer.
    if False and procedural:
        noise = mat.node_tree.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 28.0
        noise.inputs["Detail"].default_value = 5.0
        noise.inputs["Roughness"].default_value = 0.72
        ramp = mat.node_tree.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (color[0] * 0.55, color[1] * 0.48, color[2] * 0.38, 1)
        ramp.color_ramp.elements[1].color = (min(1, color[0] * 1.24), min(1, color[1] * 1.20), min(1, color[2] * 1.12), 1)
        bump = mat.node_tree.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.18
        bump.inputs["Distance"].default_value = 0.035
        mat.node_tree.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        mat.node_tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        mat.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        mat.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def mark_export(obj):
    obj["export_model"] = True
    return obj


def apply_modifier(obj, name):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=name)
    obj.select_set(False)


def cube(name, location, scale, mat, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("Soft cardboard edges", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        apply_modifier(obj, mod.name)
    obj.data.materials.append(mat)
    return mark_export(obj)


def grid_surface(name, u_count, v_count, position_fn, mat, thickness=0.075, bevel=0.018):
    verts = []
    faces = []
    for v in range(v_count + 1):
        vv = v / v_count
        for u in range(u_count + 1):
            uu = u / u_count
            verts.append(position_fn(uu, vv))
    row = u_count + 1
    for v in range(v_count):
        for u in range(u_count):
            a = v * row + u
            faces.append((a, a + 1, a + 1 + row, a + row))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        vertex_index = loop.vertex_index
        uv_layer.data[loop.index].uv = (
            (vertex_index % row) / u_count,
            (vertex_index // row) / v_count,
        )
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    solid = obj.modifiers.new("Cardboard thickness", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 0.0
    solid.use_even_offset = True
    apply_modifier(obj, solid.name)
    if bevel:
        mod = obj.modifiers.new("Rounded fiber edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        apply_modifier(obj, mod.name)
    return mark_export(obj)


def curve_object(name, points, mat, bevel_depth=0.012, cyclic=False):
    curve = bpy.data.curves.new(name + "Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return mark_export(obj)


def add_box_body(cardboard, inside):
    cube("BoxBottom", (0, 0, -1.12), (3.4, 2.5, 0.16), cardboard, 0.035)
    cube("BackWall", (0, 1.25, -0.33), (3.4, 0.14, 1.72), cardboard, 0.03)

    def front_wall(u, v):
        x0 = -1.7 + 3.4 * u
        z0 = -1.19 + 1.72 * v
        corner = math.exp(-((x0 - 1.70) / 0.52) ** 2 - ((z0 + 0.88) / 0.42) ** 2)
        fold = math.sin(u * math.pi * 15) * math.sin(v * math.pi * 11) * corner * 0.025
        return (x0 - corner * 0.27, -1.25 + corner * 0.20 + fold, z0 + corner * 0.08)

    grid_surface("FrontWall_DentedCorner", 34, 20, front_wall, cardboard, 0.12, 0.015)

    def right_wall(u, v):
        y0 = -1.25 + 2.5 * u
        z0 = -1.19 + 1.72 * v
        corner = math.exp(-((y0 + 1.25) / 0.52) ** 2 - ((z0 + 0.88) / 0.42) ** 2)
        return (1.70 - corner * 0.27, y0 + corner * 0.20, z0 + corner * 0.08)

    grid_surface("RightWall_DentedCorner", 26, 20, right_wall, cardboard, 0.12, 0.015)

    left = cube("LeftWall_Torn", (-1.70, 0, -0.33), (0.14, 2.5, 1.72), cardboard, 0.022)
    tear_angles = [i / 12 * math.tau for i in range(12)]
    tear_radii = [0.78, 1.08, 0.84, 1.18, 0.86, 1.05, 0.76, 1.14, 0.90, 1.20, 0.82, 1.04]
    cutter_verts = []
    for x in (-1.94, -1.46):
        for angle, radius in zip(tear_angles, tear_radii):
            cutter_verts.append((x, 0.02 + math.cos(angle) * 0.48 * radius, -0.32 + math.sin(angle) * 0.38 * radius))
    cutter_faces = [tuple(range(11, -1, -1)), tuple(range(12, 24))]
    for i in range(12):
        j = (i + 1) % 12
        cutter_faces.append((i, j, 12 + j, 12 + i))
    cutter_mesh = bpy.data.meshes.new("TearBooleanCutterMesh")
    cutter_mesh.from_pydata(cutter_verts, [], cutter_faces)
    cutter = bpy.data.objects.new("TearBooleanCutter", cutter_mesh)
    bpy.context.collection.objects.link(cutter)
    boolean = left.modifiers.new("Actual torn hole", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.solver = "EXACT"
    boolean.object = cutter
    apply_modifier(left, boolean.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

    cube("InteriorFloor", (0, 0, -1.01), (3.15, 2.25, 0.04), inside, 0.015)


def add_flaps(cardboard, crease_mat):
    def front_flap(u, v):
        x = -1.7 + 3.4 * u
        y = -1.25 - 1.28 * v
        base_z = 0.50 - 0.30 * v
        dent = 0.54 * math.exp(-((x - 0.28) / 0.72) ** 2 - ((v - 0.50) / 0.30) ** 2)
        wrinkles = dent * 0.12 * math.sin(u * math.pi * 17) * math.cos(v * math.pi * 9)
        return (x, y, base_z - dent + wrinkles)

    grid_surface("FrontFlap_DeepCompressionDent", 40, 18, front_flap, cardboard, 0.085, 0.018)
    grid_surface("BackOpenFlap", 28, 10, lambda u, v: (-1.7 + 3.4*u, 1.25 + 1.18*v, 0.50 - 0.24*v), cardboard, 0.085, 0.018)
    grid_surface("LeftOpenFlap", 12, 20, lambda u, v: (-1.70 - 1.12*u, -1.25 + 2.5*v, 0.50 - 0.24*u), cardboard, 0.085, 0.018)
    grid_surface("RightOpenFlap", 12, 20, lambda u, v: (1.70 + 1.12*u, -1.25 + 2.5*v, 0.50 - 0.24*u), cardboard, 0.085, 0.018)
    curve_object("CompressionCrease_A", [(-0.42,-1.68,0.20),(-0.08,-1.82,-0.01),(0.28,-1.91,-0.12),(0.70,-2.05,0.06)], crease_mat, 0.012)
    curve_object("CompressionCrease_B", [(0.28,-1.91,-0.12),(0.10,-2.12,-0.13),(0.24,-2.34,0.02)], crease_mat, 0.011)
    curve_object("CompressionCrease_C", [(0.28,-1.91,-0.12),(0.55,-1.73,0.02),(0.86,-1.61,0.19)], crease_mat, 0.010)


def add_damage_details(wet_mat, dark_mat, fiber_mat):
    # Bake the stain into the cardboard's own opaque base-color texture. This avoids
    # alpha sorting, raised overlays and dark transparency artifacts in model-viewer.
    texture_path = os.path.join(PROJECT, "public", "assets", "models", "textures", "front_wall_wet_cardboard_procedural.png")
    os.makedirs(os.path.dirname(texture_path), exist_ok=True)
    width, height = 1024, 512
    old_image = bpy.data.images.get("BakedWetCardboardTexture")
    if old_image:
        bpy.data.images.remove(old_image)
    image = bpy.data.images.new("BakedWetCardboardTexture", width=width, height=height, alpha=False)
    pixels = [0.0] * (width * height * 4)

    def smoothstep(edge0, edge1, value):
        t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
        return t * t * (3.0 - 2.0 * t)

    # Several overlapping soak centres imitate water spreading through compressed fibres.
    blooms = [
        (.195, .56, .175, .285, .15),
        (.300, .705, .092, .120, 1.35),
        (.115, .315, .090, .125, 2.10),
        (.275, .365, .065, .095, .70),
    ]
    for py in range(height):
        v = py / (height - 1)
        for px in range(width):
            u = px / (width - 1)
            nearest = 10.0
            inner_nearest = 10.0
            for cx, cy, rx, ry, phase in blooms:
                dx = (u - cx) / rx
                dy = (v - cy) / ry
                angle = math.atan2(dy, dx)
                # Low and high frequency edge breakup; never forms a perfect circle.
                edge_noise = (
                    .070 * math.sin(angle * 5.0 + phase)
                    + .032 * math.sin(angle * 11.0 - phase * .8)
                    + .018 * math.sin(angle * 23.0 + phase * 1.7)
                )
                distance = math.sqrt(dx * dx + dy * dy) + edge_noise
                nearest = min(nearest, distance)
                inner_nearest = min(inner_nearest, distance / .72)

            # Fine and coarse mottling follows the cardboard grain rather than looking painted on.
            coarse = (
                math.sin(u * 113.0 + math.sin(v * 17.0) * 2.4)
                + math.sin(v * 41.0 - u * 13.0)
                + math.sin((u + v) * 157.0)
            ) / 3.0
            fibre = (
                math.sin(v * 460.0 + math.sin(u * 31.0) * 2.0)
                + math.sin(u * 730.0 + v * 23.0)
            ) * .5

            soft_body = 1.0 - smoothstep(.70, 1.055, nearest)
            outer_tide = math.exp(-((nearest - .93) / .055) ** 2)
            inner_tide = math.exp(-((inner_nearest - .90) / .075) ** 2)
            pooled = max(0.0, 1.0 - inner_nearest) ** 1.7
            wetness = soft_body * (.36 + .055 * coarse + .020 * fibre)
            wetness += outer_tide * .16 + inner_tide * .055 + pooled * .08
            wetness = max(0.0, min(.56, wetness))

            # Full cardboard texture: warm kraft base plus fine fibre variation.
            base_variation = .018 * coarse + .010 * fibre
            base_red = .63 + base_variation
            base_green = .31 + base_variation * .62
            base_blue = .105 + base_variation * .28
            # Water mainly lowers luminance; the ring receives a slightly warmer brown edge.
            red = base_red * (1.0 - wetness * .64) + outer_tide * .016
            green = base_green * (1.0 - wetness * .73)
            blue = base_blue * (1.0 - wetness * .70)
            offset = (py * width + px) * 4
            pixels[offset:offset + 4] = (red, green, blue, 1.0)

    image.pixels.foreach_set(pixels)
    image.filepath_raw = texture_path
    image.file_format = "PNG"
    image.save()

    # Prefer the photorealistic source generated specifically for this model.
    photoreal_path = os.path.join(PROJECT, "public", "assets", "models", "textures", "front_wall_wet_cardboard_photoreal.png")
    if os.path.exists(photoreal_path):
        image = bpy.data.images.load(photoreal_path, check_existing=False)

    stain_material = bpy.data.materials.new("WetCardboardBakedIntoSurface")
    stain_material.use_nodes = True
    stain_material.diffuse_color = (.63, .31, .105, 1.0)
    bsdf = stain_material.node_tree.nodes.get("Principled BSDF")
    texture = stain_material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Linear"
    stain_material.node_tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = .86

    front_wall = bpy.data.objects.get("FrontWall_DentedCorner")
    if front_wall is None:
        raise RuntimeError("FrontWall_DentedCorner was not found for wet-cardboard material assignment")
    front_wall.data.materials.clear()
    front_wall.data.materials.append(stain_material)

    # Fibrous flaps around the real Boolean opening.
    for index, points in enumerate([
        [(-1.77,-0.45,-0.58),(-1.77,-0.10,-0.68),(-2.02,-0.24,-0.46)],
        [(-1.77,0.22,-0.62),(-1.77,0.46,-0.32),(-2.00,0.33,-0.15)],
        [(-1.77,0.49,-0.10),(-1.77,0.30,0.10),(-1.98,0.52,0.14)],
        [(-1.77,-0.46,0.00),(-1.77,-0.48,-0.35),(-1.98,-0.60,-0.16)],
    ]):
        mesh = bpy.data.meshes.new(f"TornFiber{index}Mesh")
        mesh.from_pydata(points, [], [(0,1,2)])
        obj = bpy.data.objects.new(f"TornFiber{index}", mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(fiber_mat)
        mark_export(obj)

    # The corner damage is carried by the cardboard mesh itself; no light-colored overlay strips.


def add_packing(paper_mat):
    specs = [(-0.82,0.18,-0.38,0.62,0.56,0.43),(0.78,0.24,-0.42,0.58,0.55,0.40),(0.02,0.76,-0.58,0.75,0.44,0.33),(-0.18,-0.63,-0.62,0.70,0.42,0.34)]
    for i, (x,y,z,sx,sy,sz) in enumerate(specs):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1, location=(x,y,z))
        obj = bpy.context.object
        obj.name = f"CrumpledPaper_{i+1}"
        obj.scale = (sx,sy,sz)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        texture = bpy.data.textures.new(f"PaperNoise_{i}", type="CLOUDS")
        texture.noise_scale = 0.22
        texture.noise_depth = 2
        displace = obj.modifiers.new("Crumpled folds", "DISPLACE")
        displace.texture = texture
        displace.strength = 0.16
        displace.texture_coords = "GLOBAL"
        apply_modifier(obj, displace.name)
        obj.data.materials.append(paper_mat)
        mark_export(obj)


def create_mug(ceramic, inner_mat, crack_mat):
    cx, cy = 0.02, -0.12
    segments = 64
    rings = [(-0.72,0.31),(0.42,0.405),(0.70,0.43)]
    verts, faces = [], []
    for z, radius in rings:
        for i in range(segments):
            angle = i / segments * math.tau
            verts.append((cx + radius*math.cos(angle), cy + radius*math.sin(angle), z))
    chip = set(range(48, 51))
    for ring in range(2):
        for i in range(segments):
            if ring == 1 and i in chip:
                continue
            j = (i+1)%segments
            a = ring*segments+i; b=ring*segments+j; c=(ring+1)*segments+j; d=(ring+1)*segments+i
            faces.append((a,b,c,d))
    # Rim and short inner wall, with the same chipped section omitted.
    inner_start = len(verts)
    for z, radius in [(0.70,0.35),(0.54,0.35)]:
        for i in range(segments):
            angle=i/segments*math.tau
            verts.append((cx+radius*math.cos(angle),cy+radius*math.sin(angle),z))
    for i in range(segments):
        if i in chip: continue
        j=(i+1)%segments
        faces.append((2*segments+i,2*segments+j,inner_start+j,inner_start+i))
        faces.append((inner_start+i,inner_start+j,inner_start+segments+j,inner_start+segments+i))
    mesh=bpy.data.meshes.new("CrackedMugMesh")
    mesh.from_pydata(verts,[],faces); mesh.update()
    mug=bpy.data.objects.new("CrackedMug",mesh); bpy.context.collection.objects.link(mug)
    mug.data.materials.append(ceramic)
    bevel=mug.modifiers.new("Ceramic bevel","BEVEL"); bevel.width=.018; bevel.segments=3; apply_modifier(mug,bevel.name)
    mark_export(mug)

    # Interior shadow disk.
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.34,depth=.018,location=(cx,cy,.54))
    inside=bpy.context.object; inside.name="MugInterior"; inside.data.materials.append(inner_mat); mark_export(inside)

    # Handle as a smooth curve on the mug's right side.
    points=[]
    for i in range(20):
        angle=-math.pi/2 + math.pi*i/19
        points.append((cx+.38+.34*math.cos(angle),cy,.02+.34*math.sin(angle)))
    curve_object("MugHandle",points,ceramic,.065)

    def front_y(x):
        local=x-cx
        return cy-math.sqrt(max(.02,.405*.405-local*local))-.008
    paths=[[(.13,.48),(.03,.31),(.15,.14),(.01,-.05),(.14,-.33)],[(.03,.31),(-.18,.22)],[(.15,.14),(.31,.25)],[(.01,-.05),(-.17,-.17)]]
    for idx,path in enumerate(paths):
        curve_object(f"MugCrack_{idx+1}",[(x,front_y(x),z) for x,z in path],crack_mat,.010)

    # Chipped fragment on the packing material.
    mesh=bpy.data.meshes.new("BrokenCupPieceMesh")
    mesh.from_pydata([(0.45,-0.62,-0.30),(0.74,-0.54,-0.34),(0.59,-0.42,-0.16),(0.48,-0.50,-0.12)],[],[(0,1,2,3)])
    piece=bpy.data.objects.new("BrokenCupPiece",mesh); bpy.context.collection.objects.link(piece); piece.data.materials.append(ceramic); mark_export(piece)


def setup_render():
    world=bpy.context.scene.world
    world.use_nodes=True
    world.node_tree.nodes["Background"].inputs["Color"].default_value=(0.035,0.055,0.08,1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value=.55
    bpy.ops.object.light_add(type="AREA",location=(4,-4,6)); key=bpy.context.object; key.name="KeyLight"; key.data.energy=950; key.data.shape="DISK"; key.data.size=5
    bpy.ops.object.light_add(type="AREA",location=(-4,-1,3)); fill=bpy.context.object; fill.name="FillLight"; fill.data.energy=600; fill.data.size=4
    bpy.ops.object.light_add(type="AREA",location=(0,4,5)); rim=bpy.context.object; rim.name="RimLight"; rim.data.energy=750; rim.data.size=3
    bpy.ops.mesh.primitive_plane_add(size=20,location=(0,0,-1.24)); ground=bpy.context.object; ground.name="RenderGround"
    ground.data.materials.append(material("GroundMat",(.055,.075,.10),.75))
    bpy.ops.object.camera_add(location=(6.2,-7.2,5.4)); camera=bpy.context.object; camera.name="Camera"
    direction=Vector((0,-.15,-.15))-camera.location
    camera.rotation_euler=direction.to_track_quat("-Z","Y").to_euler(); camera.data.lens=58; bpy.context.scene.camera=camera
    scene=bpy.context.scene
    scene.render.engine="BLENDER_EEVEE"
    scene.render.resolution_x=960; scene.render.resolution_y=720; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"; scene.render.filepath=PREVIEW_PATH
    scene.render.film_transparent=False
    scene.view_settings.look="AgX - Medium High Contrast"


with open(TRACE_PATH, "w", encoding="utf-8") as handle:
    handle.write("start\n")
clear_scene()
trace("scene cleared")
cardboard=material("CardboardFiber",(.63,.31,.105),.92,procedural=True)
cardboard_inside=material("CardboardInside",(.38,.17,.055),.97,procedural=True)
fiber=material("TornFiber",(.80,.54,.27),1.0,procedural=True)
wet=material("WetCardboard",(.12,.045,.015),.38)
crease_mat=material("CardboardFold",(.46,.21,.065),.96)
paper=material("PackingPaper",(.88,.82,.68),1.0,procedural=True)
ceramic=material("WarmCeramic",(.91,.84,.70),.42)
ceramic_inner=material("CeramicInterior",(.34,.29,.23),.74)
crack=material("CrackDark",(.075,.022,.010),1.0)

trace("materials ready")
add_box_body(cardboard,cardboard_inside)
trace("box body ready")
add_flaps(cardboard,crease_mat)
trace("flaps ready")
add_damage_details(wet,crease_mat,fiber)
trace("damage details ready")
add_packing(paper)
trace("packing ready")
create_mug(ceramic,ceramic_inner,crack)
trace("mug ready")

# Hotspot empties are exported as extras and preserve the positions expected by the game.
for name,location in {
    "Hotspot_Crushed":(0.48,-1.94,.05),
    "Hotspot_Wet":(-1.05,-1.35,-.18),
    "Hotspot_Torn":(-1.84,.02,-.32),
    "Hotspot_DentedCorner":(1.42,-1.02,-.82),
}.items():
    empty=bpy.data.objects.new(name,None); empty.location=location; empty["hotspot"]=name; bpy.context.collection.objects.link(empty); mark_export(empty)

setup_render()
trace("render scene ready")
os.makedirs(os.path.dirname(BLEND_PATH),exist_ok=True)
os.makedirs(os.path.dirname(GLB_PATH),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
trace("blend saved before render")
bpy.ops.render.render(write_still=True)
trace("preview rendered")

bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.context.scene.objects:
    if obj.get("export_model"):
        obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_extras=True,
    export_yup=True,
    export_materials="EXPORT",
    export_lights=False,
)
trace("glb exported")
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
trace("finished")
result={
    "blend":BLEND_PATH,
    "glb":GLB_PATH,
    "preview":PREVIEW_PATH,
    "objects":len([obj for obj in bpy.context.scene.objects if obj.get("export_model")]),
}
