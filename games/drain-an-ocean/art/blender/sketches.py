"""Small engraved sketches of every species for the aquarium's register, drawn
from the creature models themselves: Freestyle line art in chart ink over a
pale, flat-shaded body with a little hatched shadow, on a clear background.
Unfound species get a flat silhouette instead.
    python3 art/blender/sketches.py [model names...]
Writes ui/sketches/<model>.png and ui/sketches/<model>_unknown.png.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from kit import MODELS, reset  # noqa: E402

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "ui", "sketches"))
SPECIES = ["crab", "starfish", "flounder", "seahorse", "bass", "urchin", "clownfish", "puffer", "octopus", "turtle", "moray",
           "lobster", "angler", "lantern", "coelacanth", "whale"]
INK = (0.012, 0.023, 0.033)        # chart ink, in linear
TOP = ("flounder", "starfish")


def sketch(name):
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + ".glb"))
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    paper = bpy.data.materials.new("paperwash")
    paper.use_nodes = True
    nt = paper.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    emit = nt.nodes.new("ShaderNodeEmission")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.78, 0.76, 0.7, 1)
    ramp.color_ramp.elements[1].position = 0.18
    ramp.color_ramp.elements[1].color = (0.97, 0.95, 0.9, 1)
    nt.links.new(diff.outputs[0], s2r.inputs[0])
    nt.links.new(s2r.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], emit.inputs[0])
    nt.links.new(emit.outputs[0], out.inputs[0])
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(paper)
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
    cd = bpy.data.cameras.new("cam")
    cd.type = "ORTHO"
    cd.ortho_scale = size * (1.05 if name not in ("seahorse",) else 1.25)
    cam = bpy.data.objects.new("cam", cd)
    scene.collection.objects.link(cam)
    # side-on, a touch from above: the natural-history plate's view
    view = Vector((1.0, -0.12, 0.35)).normalized() if name not in TOP else Vector((0.35, -0.25, 1.0)).normalized()
    cam.location = center + view * size * 2.0
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    ld = bpy.data.lights.new("sun", "SUN")
    ld.energy = 3.0
    lo_ = bpy.data.objects.new("sun", ld)
    lo_.rotation_euler = (math.radians(50), math.radians(-30), math.radians(30))
    scene.collection.objects.link(lo_)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.resolution_x = 220
    scene.render.resolution_y = 150
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = "ABSOLUTE"
    scene.render.line_thickness = 1.3
    vl = scene.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new("ink")
    ls.select_by_visibility = True
    ls.select_by_edge_types = True
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("ink")
    ls.linestyle.color = INK
    ls.linestyle.thickness = 1.4
    scene.view_settings.view_transform = "Standard"
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 1
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    # the unfound version: a flat ink silhouette, faint
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    a = im.split()[3]
    sil = Image.new("RGBA", im.size, (28, 42, 51, 0))
    sil.putalpha(a.point(lambda v: int(v * 0.32)))
    sil.save(os.path.join(OUT, name + "_unknown.png"))
    print("sketch", name)


if __name__ == "__main__":
    for n in (sys.argv[1:] or SPECIES):
        sketch(n)
