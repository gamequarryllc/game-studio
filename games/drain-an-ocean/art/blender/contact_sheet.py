"""Renders every model in models/ with Cycles (CPU) under the game's light (a
low warm key from one side, a cool teal fill, a warm rim) and tiles them into
one contact sheet for review:
    python3 art/blender/contact_sheet.py [out.png] [name,name,prefix*]
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from kit import MODELS, reset  # noqa: E402

TILE = int(os.environ.get("TILE", "300"))
# Buildings face Blender +Y like everything else, but their fronts (doors,
# windows) are what matters: show them from the front.
FRONT = ("house_", "town_", "lighthouse", "aquarium", "weir")


def render_one(path, out):
    reset()
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    # The game multiplies each material by the baked vertex colour; do the same here.
    done = set()
    for o in objs:
        attrs = o.data.color_attributes
        if not attrs:
            continue
        name = attrs[0].name
        for slot in o.material_slots:
            m = slot.material
            if m is None or m.name in done or not m.use_nodes:
                continue
            done.add(m.name)
            nt = m.node_tree
            bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is None:
                continue
            base = bsdf.inputs["Base Color"]
            src = base.links[0].from_socket if base.links else None
            ca = nt.nodes.new("ShaderNodeVertexColor")
            ca.layer_name = name
            mx = nt.nodes.new("ShaderNodeMix")
            mx.data_type = "RGBA"
            mx.blend_type = "MULTIPLY"
            mx.inputs["Factor"].default_value = 1.0
            if src is not None:
                nt.links.new(src, mx.inputs[6])
            else:
                mx.inputs[6].default_value = base.default_value
            nt.links.new(ca.outputs["Color"], mx.inputs[7])
            nt.links.new(mx.outputs[2], base)
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    center = (lo + hi) / 2
    size = max((hi - lo).length, 0.05)
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 55
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    # glTF import turns Blender +Y forward into -Y; look from the front-right, a little above.
    view = Vector((1.0, -1.35, 0.7))
    if any(os.path.basename(path).startswith(f) for f in FRONT):
        view = Vector((-1.0, 1.35, 0.8))
    d = view.normalized() * size * 1.5
    cam.location = center + d
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    for loc, energy, col in [((-2.5, -1.0, 1.4), 520, (1.0, 0.8, 0.58)), ((2.5, -2.0, 1.8), 130, (0.55, 0.78, 0.8)), ((0.5, 3.0, 1.5), 320, (1.0, 0.85, 0.65))]:
        ld = bpy.data.lights.new("l", "AREA")
        ld.energy = energy * size * size
        ld.size = size
        ld.color = col
        lo_ = bpy.data.objects.new("l", ld)
        lo_.location = center + Vector(loc) * size
        lo_.rotation_euler = (center - lo_.location).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(lo_)
    world = bpy.data.worlds.new("w")
    if hasattr(world, "use_nodes"):
        world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.16, 0.19, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
    scene.world = world
    scene.view_settings.view_transform = "Standard"
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(os.environ.get("SAMPLES", "12"))
    scene.cycles.use_denoising = True
    scene.render.resolution_x = TILE
    scene.render.resolution_y = TILE
    scene.render.filepath = out
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 1
    bpy.ops.render.render(write_still=True)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith(".png") else os.path.join(tempfile.gettempdir(), "ocean_models.png")
    filt = sys.argv[2].split(",") if len(sys.argv) > 2 else [""]
    names = sorted(f for f in os.listdir(MODELS) if f.endswith(".glb") and any(
        x == f[:-4] or (x.endswith("*") and f.startswith(x[:-1])) or x == "" for x in filt))
    tmp = tempfile.mkdtemp()
    tiles = []
    for n in names:
        p = os.path.join(tmp, n.replace(".glb", ".png"))
        render_one(os.path.join(MODELS, n), p)
        tiles.append((n[:-4], p))
    from PIL import Image, ImageDraw
    cols = int(os.environ.get("COLS", "6"))
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * TILE, rows * (TILE + 22)), (16, 42, 50))
    draw = ImageDraw.Draw(sheet)
    for i, (n, p) in enumerate(tiles):
        im = Image.open(p).convert("RGB")
        x = (i % cols) * TILE
        y = (i // cols) * (TILE + 22)
        sheet.paste(im, (x, y))
        draw.text((x + 8, y + TILE + 4), n, fill=(243, 234, 211))
    sheet.save(out)
    print("contact sheet:", out)


if __name__ == "__main__":
    main()
