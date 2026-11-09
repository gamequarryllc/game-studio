"""Render a contact sheet of every model in models/*.glb with Cycles on the CPU.

Each model gets its own cell, scaled to fit, labelled with its name and
triangle count. Lighting follows the art bible: cool moonlight from the upper
left, a warm rim from behind, plum shadows. Vertex colours drive the material;
the glow parts (vertex alpha 0.5) are emissive.

Run:  python3 art/blender/contact_sheet.py OUT.png [glb names...] [--samples N] [--res WxH] [--cols N]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))


def linear(hexstr):
    h = hexstr.lstrip("#")
    out = []
    for k in range(3):
        c = int(h[k * 2:k * 2 + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def vertex_material(layer="Color"):
    mat = bpy.data.materials.new("vcol_" + layer)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = layer
    bsdf = nt.nodes.new("ShaderNodeBsdfDiffuse")
    emit = nt.nodes.new("ShaderNodeEmission")
    add = nt.nodes.new("ShaderNodeAddShader")
    gt = nt.nodes.new("ShaderNodeMath")
    gt.operation = 'GREATER_THAN'
    gt.inputs[1].default_value = 0.25
    lt = nt.nodes.new("ShaderNodeMath")
    lt.operation = 'LESS_THAN'
    lt.inputs[1].default_value = 0.75
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = 'MULTIPLY'
    strength = nt.nodes.new("ShaderNodeMath")
    strength.operation = 'MULTIPLY'
    strength.inputs[1].default_value = 2.2
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Color"])
    nt.links.new(attr.outputs["Color"], emit.inputs["Color"])
    nt.links.new(attr.outputs["Alpha"], gt.inputs[0])
    nt.links.new(attr.outputs["Alpha"], lt.inputs[0])
    nt.links.new(gt.outputs[0], mul.inputs[0])
    nt.links.new(lt.outputs[0], mul.inputs[1])
    nt.links.new(mul.outputs[0], strength.inputs[0])
    nt.links.new(strength.outputs[0], emit.inputs["Strength"])
    nt.links.new(bsdf.outputs[0], add.inputs[0])
    nt.links.new(emit.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs["Surface"])
    return mat


def flat_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 1.0
    return mat


def main():
    args = sys.argv[1:]
    out = args[0] if args else "/tmp/contact_sheet.png"
    samples = 20
    res = (1800, 1100)
    cols = 0
    names = []
    i = 1
    while i < len(args):
        a = args[i]
        if a == "--samples":
            samples = int(args[i + 1])
            i += 2
            continue
        if a == "--res":
            w, h = args[i + 1].split("x")
            res = (int(w), int(h))
            i += 2
            continue
        if a == "--cols":
            cols = int(args[i + 1])
            i += 2
            continue
        names.append(a)
        i += 1
    if not names:
        names = sorted(f for f in os.listdir(MODELS) if f.endswith(".glb"))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    mats = {}
    items = []
    for fname in names:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=fname if os.path.isabs(fname) else os.path.join(MODELS, fname))
        new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        for o in sorted(new, key=lambda o: o.name):
            o.data.materials.clear()
            layer = o.data.color_attributes[0].name if len(o.data.color_attributes) else "Color"
            if layer not in mats:
                mats[layer] = vertex_material(layer)
            o.data.materials.append(mats[layer])
            o.parent = None
            o.location = (0, 0, 0)
            o.rotation_mode = 'XYZ'
            # tools point at the camera (the game's +Z); turn them side-on for the sheet
            o.rotation_euler = (0, 0, math.radians(90) if o.name.startswith("tool_") or o.name.startswith("salamander") else 0)
            items.append(o)
    n = len(items)
    if cols <= 0:
        cols = max(1, int(math.ceil(math.sqrt(n * res[0] / res[1] * 0.8))))
    rows = int(math.ceil(n / cols))
    cell = 4.0
    row_h = cell * 1.12
    ground_mat = flat_material("ground", linear("#3A2D44"))
    label_mat = flat_material("label", linear("#EFE3C8"))
    for k, o in enumerate(items):
        bpy.context.view_layer.update()
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = Vector((min(p.x for p in bb), min(p.y for p in bb), min(p.z for p in bb)))
        hi = Vector((max(p.x for p in bb), max(p.y for p in bb), max(p.z for p in bb)))
        size = max(hi.x - lo.x, hi.y - lo.y, (hi.z - lo.z) * 1.05, 1e-3)
        s = cell * 0.8 / size
        o.scale = (s, s, s)
        cx = (k % cols) * cell
        base = -(k // cols) * row_h
        center = (lo + hi) * 0.5
        o.location = (cx - center.x * s, -center.y * s, base - lo.z * s)
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        bpy.ops.object.text_add(location=(cx - cell * 0.44, -cell * 0.5, base - 0.32))
        t = bpy.context.object
        t.rotation_euler = (math.radians(90), 0, 0)
        t.data.body = "%s  %d" % (o.name.split(".")[0], tris)
        t.data.size = 0.24
        t.data.materials.append(label_mat)
    for r in range(rows):
        bpy.ops.mesh.primitive_cube_add(size=1, location=((cols - 1) * cell * 0.5, 0, -r * row_h - 0.05))
        g = bpy.context.object
        g.scale = (cols * cell, cell * 0.95, 0.1)
        g.data.materials.append(ground_mat)

    w = cols * cell
    h = rows * row_h
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = max(w * 1.03, h * 1.05 * res[0] / res[1])
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    target = Vector(((cols - 1) * cell * 0.5, 0, -(rows - 1) * row_h * 0.5 + cell * 0.38))
    tilt = math.radians(12)
    cam.location = target + Vector((0, -40 * math.cos(tilt), 40 * math.sin(tilt)))
    cam.rotation_euler = (math.radians(90) - tilt, 0, 0)
    scene.camera = cam

    # moonlight from the upper left, a warm rim behind, a cool fill
    def sun(name, color, energy, rot):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.color = color[:3]
        ld.energy = energy
        ld.angle = math.radians(8)
        lo_ = bpy.data.objects.new(name, ld)
        lo_.rotation_euler = [math.radians(r) for r in rot]
        scene.collection.objects.link(lo_)
    sun("moon", linear("#C9D6F2"), 3.2, (40, -35, -30))
    sun("rim", linear("#FFB070"), 2.0, (-60, 0, 160))
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = linear("#5B4A70")
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scene.world = world

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 3
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Standard'
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("contact sheet:", out, n, "models")


if __name__ == "__main__":
    main()
