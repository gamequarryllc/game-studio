"""Renders a contact sheet of models with Cycles on the CPU, for reviewing them by eye.

    python3 art/blender/contact_sheet.py OUT.png [glb names...]

With no names, every .glb in models/ is laid out. The light is the game's:
a high cool skylight, a warm key, grey warehouse concrete underneath.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import kit  # noqa: E402
from mathutils import Vector  # noqa: E402


def load(names):
    objs = []
    for name in names:
        path = os.path.join(kit.MODELS, name)
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.context.scene.objects if o not in before and o.type == "MESH"]
        new.sort(key=lambda o: o.name)
        objs += new
    return objs


def drop_ink(objs):
    """Remove the held tools' ink-outline hull (vertex alpha 0.1): the game draws it with
    back-face culling as a cartoon outline; a path tracer would just see a black shell."""
    import bmesh
    for o in objs:
        me = o.data
        if not me.color_attributes:
            continue
        bm = bmesh.new()
        bm.from_mesh(me)
        layer = bm.loops.layers.color.get("Color") or bm.loops.layers.float_color.get("Color")
        if layer is None:
            bm.free()
            continue
        gone = [f for f in bm.faces if abs(f.loops[0][layer][3] - 0.1) < 0.04]
        if gone:
            bmesh.ops.delete(bm, geom=gone, context="FACES")
            bm.to_mesh(me)
        bm.free()


def fix_materials(objs):
    """The exported files carry no textures: put the marker sheet back on the decals."""
    img = bpy.data.images.load(kit.SHEET_PNG, check_existing=True)
    for o in objs:
        for slot in o.material_slots:
            mat = slot.material
            if mat is None:
                continue
            mat.use_nodes = True
            nt = mat.node_tree
            bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is None:
                continue
            for link in list(bsdf.inputs["Base Color"].links):
                nt.links.remove(link)
            if mat.name.startswith("decal"):
                tex = nt.nodes.new("ShaderNodeTexImage")
                tex.image = img
                nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
                nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            else:
                vc = nt.nodes.new("ShaderNodeVertexColor")
                vc.layer_name = "Color"
                nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
                bsdf.inputs["Roughness"].default_value = 0.8
                if os.environ.get("BACKFACE"):
                    # Cull back faces like the game does for the held tools (their ink outline is an inverted hull).
                    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
                    geo = nt.nodes.new("ShaderNodeNewGeometry")
                    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
                    mix = nt.nodes.new("ShaderNodeMixShader")
                    nt.links.new(geo.outputs["Backfacing"], mix.inputs[0])
                    nt.links.new(bsdf.outputs[0], mix.inputs[1])
                    nt.links.new(tr.outputs[0], mix.inputs[2])
                    nt.links.new(mix.outputs[0], out.inputs["Surface"])


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/contact.png"
    names = sys.argv[2:] or sorted(n for n in os.listdir(kit.MODELS) if n.endswith(".glb"))
    per_row = int(os.environ.get("PER_ROW", "6"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = load(names)
    if os.environ.get("BACKFACE"):
        drop_ink(objs)
    fix_materials(objs)
    kit.lay_out(objs, spacing=0.35, per_row=per_row)
    lo = Vector((min(o.location.x - o.dimensions.x / 2 for o in objs), min(o.location.y - o.dimensions.y / 2 for o in objs), 0))
    hi = Vector((max(o.location.x + o.dimensions.x / 2 for o in objs), max(o.location.y + o.dimensions.y / 2 for o in objs),
                 max(o.dimensions.z for o in objs)))
    center = (lo + hi) * 0.5
    span = max(hi.x - lo.x, (hi.y - lo.y) * 1.4, 1.0)
    bpy.ops.mesh.primitive_plane_add(size=span * 4, location=(center.x, center.y, 0))
    floor = bpy.context.active_object
    fm = bpy.data.materials.new("floor")
    fm.use_nodes = True
    fb = fm.node_tree.nodes.get("Principled BSDF")
    fb.inputs["Base Color"].default_value = (0.2, 0.23, 0.27, 1)
    fb.inputs["Roughness"].default_value = 0.6
    floor.data.materials.append(fm)
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    aspect = int(os.environ.get("RES_X", "1400")) / int(os.environ.get("RES_Y", "900"))
    fit = max(hi.x - lo.x, (hi.y - lo.y + hi.z) * aspect * 0.9, 1.0)
    d = fit * 1.42
    el = math.radians(float(os.environ.get("ELEV", "32")))
    cam.location = center + Vector((0, -math.cos(el) * d, math.sin(el) * d + hi.z * 0.3))
    direction = center + Vector((0, 0, hi.z * 0.2)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.color = (1.0, 0.93, 0.82)
    sun.angle = math.radians(8)
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(42), 0, math.radians(-35))
    scene.collection.objects.link(so)
    if scene.world is None:
        scene.world = bpy.data.worlds.new("w")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.42, 0.5, 0.62, 1)
    bg.inputs["Strength"].default_value = 0.55
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(os.environ.get("SAMPLES", "24"))
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    try:
        scene.cycles.use_denoising = True
    except Exception:
        pass
    scene.render.resolution_x = int(os.environ.get("RES_X", "1400"))
    scene.render.resolution_y = int(os.environ.get("RES_Y", "900"))
    scene.render.filepath = out
    scene.view_settings.view_transform = "Standard"
    bpy.ops.render.render(write_still=True)
    print("contact sheet:", out)


if __name__ == "__main__":
    main()
