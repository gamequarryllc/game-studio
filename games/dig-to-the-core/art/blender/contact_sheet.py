"""Renders every model in models/ with Cycles (CPU) and tiles them into one
contact sheet for review:
    python3 art/blender/contact_sheet.py [out.png] [name-filter]
"""
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from kit import MODELS, reset  # noqa: E402

TILE = int(os.environ.get("TILE", "320"))


# Pieces the game tints per copy (DigField: each layer's stone, the ore's
# colour, the crystal's): shown here with a typical tint, as in the game.
TINT = {"pebble": (0.5, 0.42, 0.34), "rubble": (0.44, 0.43, 0.44), "nugget": (1.0, 0.78, 0.2),
        "crystal_small": (0.42, 0.8, 0.72)}


def show_vertex_colour(objs, tint=None):
    """Godot multiplies a model's material by its vertex colour (COLOR_0:
    the painted colour, baked AO and edge wear); Blender's glTF import
    doesn't, so wire it in here or the sheet shows bare materials."""
    done = set()
    for o in objs:
        attrs = o.data.color_attributes
        if len(attrs) == 0:
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
            if any(n.type == "VERTEX_COLOR" for n in nt.nodes):
                # Already wired by the importer: only add the game's tint.
                if tint is not None and base.is_linked:
                    tm = nt.nodes.new("ShaderNodeMix")
                    tm.data_type = "RGBA"
                    tm.blend_type = "MULTIPLY"
                    tm.inputs["Factor"].default_value = 1.0
                    nt.links.new(base.links[0].from_socket, tm.inputs[6])
                    tm.inputs[7].default_value = [tint[i] ** 2.2 for i in range(3)] + [1.0]
                    nt.links.new(tm.outputs[2], base)
                continue
            vc = nt.nodes.new("ShaderNodeVertexColor")
            vc.layer_name = name
            mul = nt.nodes.new("ShaderNodeMix")
            mul.data_type = "RGBA"
            mul.blend_type = "MULTIPLY"
            mul.inputs["Factor"].default_value = 1.0
            if base.is_linked:
                nt.links.new(base.links[0].from_socket, mul.inputs[6])
            else:
                c = list(base.default_value)
                if tint is not None:
                    c = [c[i] * (tint[i] ** 2.2) for i in range(3)] + [1.0]
                mul.inputs[6].default_value = c
            nt.links.new(vc.outputs["Color"], mul.inputs[7])
            nt.links.new(mul.outputs[2], base)


def render_one(path, out):
    reset()
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    show_vertex_colour(objs, TINT.get(os.path.basename(path)[:-4]))
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
    cam_data.lens = 50
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    name = os.path.basename(path)[:-4]
    view = (1.0, -1.25, 0.75)
    if name in ("mole", "robomole") or name.startswith("find_"):
        view = (0.9, 1.3, 0.55)       # creatures and finds face +Y: look at their fronts
    elif name in ("shack",):
        view = (1.3, -0.9, 0.6)
    d = Vector(view).normalized() * size * 1.55
    cam.location = center + d
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    for loc, energy, col in [((2, -2, 3), 900, (1.0, 0.92, 0.8)), ((-3, -1, 1.5), 300, (0.6, 0.7, 1.0)), ((0, 3, 2), 500, (1.0, 0.8, 0.6))]:
        ld = bpy.data.lights.new("l", "AREA")
        ld.energy = energy * size * size
        ld.size = size
        ld.color = col
        lo_ = bpy.data.objects.new("l", ld)
        lo_.location = center + Vector(loc) * size
        lo_.rotation_euler = (center - lo_.location).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(lo_)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.16, 0.13, 0.11, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = int(os.environ.get("SAMPLES", "16"))
    scene.cycles.use_denoising = True
    scene.render.resolution_x = TILE
    scene.render.resolution_y = TILE
    scene.render.filepath = out
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    bpy.ops.render.render(write_still=True)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith(".png") else os.path.join(tempfile.gettempdir(), "dig_models.png")
    filt = sys.argv[2].split(",") if len(sys.argv) > 2 else [""]
    names = sorted(f for f in os.listdir(MODELS) if f.endswith(".glb") and any(x == f[:-4] or (x.endswith("*") and f.startswith(x[:-1])) or x == "" for x in filt))
    tmp = tempfile.mkdtemp()
    tiles = []
    for n in names:
        p = os.path.join(tmp, n.replace(".glb", ".png"))
        render_one(os.path.join(MODELS, n), p)
        tiles.append((n[:-4], p))
    from PIL import Image, ImageDraw
    cols = int(os.environ.get("COLS", "5"))
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * TILE, rows * (TILE + 24)), (30, 24, 20))
    draw = ImageDraw.Draw(sheet)
    for i, (n, p) in enumerate(tiles):
        im = Image.open(p).convert("RGB")
        x = (i % cols) * TILE
        y = (i // cols) * (TILE + 24)
        sheet.paste(im, (x, y))
        draw.text((x + 8, y + TILE + 4), n, fill=(240, 228, 200))
    sheet.save(out)
    print("contact sheet:", out)


if __name__ == "__main__":
    main()
