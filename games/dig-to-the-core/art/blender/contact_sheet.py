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

TILE = 360


def render_one(path, out):
    reset()
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
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
    d = Vector((1.0, -1.25, 0.75)).normalized() * size * 1.55
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
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = TILE
    scene.render.resolution_y = TILE
    scene.render.filepath = out
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    bpy.ops.render.render(write_still=True)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith(".png") else os.path.join(tempfile.gettempdir(), "dig_models.png")
    filt = sys.argv[2] if len(sys.argv) > 2 else ""
    names = sorted(f for f in os.listdir(MODELS) if f.endswith(".glb") and filt in f)
    tmp = tempfile.mkdtemp()
    tiles = []
    for n in names:
        p = os.path.join(tmp, n.replace(".glb", ".png"))
        render_one(os.path.join(MODELS, n), p)
        tiles.append((n[:-4], p))
    from PIL import Image, ImageDraw
    cols = 4
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
