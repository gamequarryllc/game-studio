"""Renders each tool from the player's eye (the game's framing) with the
phone buttons drawn over it, to check the working end clears the buttons:
    python3 art/blender/viewmodel_preview.py out.png
"""
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from kit import MODELS, reset  # noqa: E402

W, H = 640, 360
TOOLS = ["tool_shovel", "tool_pickaxe", "tool_jackhammer", "tool_drill", "tool_dynamite", "tool_laser", "tool_borer"]


def render(name, out):
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + ".glb"))
    scene = bpy.context.scene
    cd = bpy.data.cameras.new("cam")
    cd.sensor_fit = "VERTICAL"
    cd.angle = math.radians(74)
    cd.clip_start = 0.01
    cam = bpy.data.objects.new("cam", cd)
    scene.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = cam
    for loc, energy, col in [((0.6, 0.3, 0.5), 40, (1.0, 0.8, 0.55)), ((-0.6, 0.2, 0.2), 10, (0.6, 0.65, 0.8))]:
        ld = bpy.data.lights.new("l", "POINT")
        ld.energy = energy
        ld.color = col
        lo = bpy.data.objects.new("l", ld)
        lo.location = loc
        scene.collection.objects.link(lo)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.03, 0.02, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 10
    scene.cycles.use_denoising = True
    scene.render.resolution_x = W
    scene.render.resolution_y = H
    scene.render.filepath = out
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    bpy.ops.render.render(write_still=True)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), "dig_viewmodels.png")
    only = sys.argv[2:]
    tmp = tempfile.mkdtemp()
    from PIL import Image, ImageDraw
    tiles = []
    for n in TOOLS:
        if only and n not in only:
            continue
        p = os.path.join(tmp, n + ".png")
        render(n, p)
        im = Image.open(p).convert("RGB")
        d = ImageDraw.Draw(im)
        s = W / 1280.0
        # Phone layout at 1280 x 720: Dig, Jump, context button, the tool plate, the stick.
        for (cx, cy, r) in [(1280 - 150, 720 - 150, 107), (1280 - 330, 720 - 70, 63), (1280 - 330, 720 - 250, 69), (170, 720 - 160, 86)]:
            d.ellipse([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], outline=(255, 80, 60), width=2)
        d.rectangle([410 * s, 622 * s, 870 * s, 708 * s], outline=(255, 200, 60), width=2)
        d.line([(W / 2 - 6, H / 2), (W / 2 + 6, H / 2)], fill=(255, 255, 255))
        d.line([(W / 2, H / 2 - 6), (W / 2, H / 2 + 6)], fill=(255, 255, 255))
        d.text((6, 6), n, fill=(255, 240, 200))
        tiles.append(im)
    cols = 2
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * W, rows * H), (20, 16, 12))
    for i, im in enumerate(tiles):
        sheet.paste(im, ((i % cols) * W, (i // cols) * H))
    sheet.save(out)
    print("viewmodel sheet:", out)


if __name__ == "__main__":
    main()
