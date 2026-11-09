"""The seven digging tools as you see them in first person, gloves and all.
Run: python3 art/blender/tools.py

Each model is composed in camera space: the camera sits at the origin looking
along +Y (Godot's forward), +Z up, +X right, vertical field of view 74 degrees.
The game puts the model at the camera as it is, so the framing is decided
here: the working end sits above the touch buttons, the gloves come in from
the bottom corners. Parts that move are their own nodes: "Bit" (spins about
its own +Y), "Muzzle" (where the laser beam starts).

Shape language: chunky, working ends oversized, bevelled hard edges, worn
paint (baked AO and edge wear). Colours: the art bible palette only."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from kit import (box, cyl, sphere, torus, from_profile, join, wobble, export, reset, mat,  # noqa: E402
                 twist, bend, subdivide, bar, lathe, place, strut, glove, ao, smooth)

R90 = math.radians(90)


def bake(o):
    """Applies an object's own transform to its mesh (primitives are created
    with their location and rotation on the object)."""
    bpy.context.view_layer.update()
    o.data.transform(o.matrix_world)
    o.matrix_world = Matrix.Identity(4)
    return o


def xform(o, m):
    bake(o)
    o.data.transform(m)
    return o


def frame(x, y, z):
    """Basis whose columns are the given axes."""
    return Matrix((x, y, z)).transposed()


def glove_on(p, d, back, side=1, name="Glove", sleeve=0.34):
    """A glove gripping a handle that runs along d at point p; `back` is
    roughly where the forearm goes (towards the bottom of the screen)."""
    g = bake(glove(name=name, sleeve_len=sleeve))
    if side < 0:
        g.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        g.data.flip_normals()
    x = Vector(d).normalized()
    f = Vector(back).normalized()
    f = (f - x * f.dot(x)).normalized()
    y = -f
    z = x.cross(y).normalized()
    m = frame(x, y, z).to_4x4()
    m.translation = Vector(p)
    g.data.transform(m)
    g.data.update()
    return g


def along(o, a, b):
    """Lays an object built along +Y from the origin onto the segment a->b."""
    a = Vector(a)
    b = Vector(b)
    d = b - a
    q = Vector((0, 1, 0)).rotation_difference(d.normalized())
    m = q.to_matrix().to_4x4()
    m.translation = a
    return xform(o, m)


def spinner(parts_along_y, at, axis, name):
    """Joins parts built along +Y from the origin into a node that turns
    about its own +Y, placed at `at` pointing along `axis`."""
    for p in parts_along_y:
        bake(p)
    o = join(parts_along_y, name)
    bake(o)
    q = Vector((0, 1, 0)).rotation_difference(Vector(axis).normalized())
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = q
    o.location = at
    return o


def parent_keep(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


# ---------------------------------------------------------------------------------------------
def shovel():
    wood = mat("wood", rough=0.8)
    steel = mat("bright_steel", metal=0.2, rough=0.55)
    iron = mat("iron", metal=0.6, rough=0.6)
    grip = Vector((0.44, 0.32, -0.27))      # D-grip, right hand (low, by the hip)
    collar = Vector((0.33, 0.68, -0.31))    # where the blade starts
    d = (collar - grip).normalized()
    parts = [along(cyl(0.021, (collar - grip).length, (0, (collar - grip).length / 2, 0), wood, (-R90, 0, 0), 10), grip, collar)]
    # D-grip: a cross bar and two cheeks.
    side = d.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(d).normalized()
    top = grip - d * 0.12
    parts.append(strut(top - side * 0.06, top + side * 0.06, 0.017, wood, sides=8))
    parts.append(strut(grip - side * 0.012, top - side * 0.06, 0.012, wood, sides=6))
    parts.append(strut(grip + side * 0.012, top + side * 0.06, 0.012, wood, sides=6))
    parts.append(along(cyl(0.025, 0.06, (0, 0.03, 0), iron, (-R90, 0, 0), 10), grip - d * 0.01, grip + d * 0.05))
    # Collar (socket) with two brass rivets.
    parts.append(along(cyl(0.032, 0.16, (0, 0.08, 0), iron, (-R90, 0, 0), 10, r2=0.024), collar - d * 0.12, collar + d * 0.04))
    for s in (-1, 1):
        parts.append(sphere(0.006, tuple(collar - d * 0.05 + side * 0.026 * s), mat("brass", metal=0.8, rough=0.35), segs=6, rings=4))
    # The blade: a cupped, pointed spade, oversized, with a worn bright edge.
    outline = [(-0.12, 0.0), (-0.03, 0.0), (0.0, 0.022), (0.03, 0.0), (0.12, 0.0), (0.125, 0.17),
               (0.085, 0.27), (0.0, 0.32), (-0.085, 0.27), (-0.125, 0.17)]
    blade = from_profile(outline, 0.008, steel, bevel=0.003, name="blade")
    subdivide(blade, 2)
    bend(blade, math.radians(-35), "Z")
    bake(blade)
    # The outline is drawn in x/z: z runs along the shaft. Tip it down a little.
    bm = frame(side, -up, d).to_4x4() @ Matrix.Rotation(math.radians(22), 4, "X")
    bm.translation = collar + d * 0.01
    xform(blade, bm)
    parts.append(blade)
    o = bake(join(parts, "Shovel"))
    wobble(o, 0.0012, 11)
    ao(o, 0.08)
    gr = glove_on(grip - d * 0.12, side, (0.3, -0.4, -1.0), 1, "GloveR", 0.22)
    gl = glove_on(grip + d * 0.22, d, (-0.35, -0.3, -1.0), -1, "GloveL", 0.4)
    parent_keep(gr, o)
    parent_keep(gl, o)
    return o


def pickaxe():
    wood = mat("wood", rough=0.8)
    steel = mat("steel", metal=0.45, rough=0.45)
    leather = mat("leather_dark", rough=0.9)
    hand = Vector((0.26, 0.32, -0.25))
    head = Vector((0.22, 0.86, 0.05))
    d = (head - hand).normalized()
    L = (head - hand).length
    parts = [along(cyl(0.022, L + 0.06, (0, (L + 0.06) / 2, 0), wood, (-R90, 0, 0), 10, r2=0.03), hand - d * 0.06, head + d * 0.0)]
    # Leather grip wrap near the end.
    for i in range(6):
        parts.append(along(torus(0.025, 0.006, (0, 0, 0), leather, (R90, 0, 0), 12, 4), hand + d * (0.015 + i * 0.025), hand + d * (0.03 + i * 0.025)))
    side = d.cross(Vector((0, 0, 1))).normalized()
    fwd = side.cross(d).normalized()        # the way the head points (forward/up)
    # Double-ended head: a curved pick each way, thick at the eye.
    pts = []
    for i in range(13):
        t = -1.0 + 2.0 * i / 12
        x = t * 0.36
        z = 0.06 * (1.0 - t * t) - 0.03 * t * t
        w = 0.042 * (1.0 - 0.82 * abs(t)) + 0.006
        pts.append((x, z, w))
    head_parts = []
    for i in range(len(pts) - 1):
        a = pts[i]
        b = pts[i + 1]
        seg = strut((a[0], 0, a[1]), (b[0], 0, b[1]), (a[2] + b[2]) * 0.5, steel, sides=6, name="headseg")
        head_parts.append(seg)
    head_parts.append(sphere(0.05, (0, 0, 0.05), steel, scale=(1.1, 0.9, 1.0), segs=10, rings=6))
    head_parts.append(cyl(0.008, 0.02, (0.36, 0, -0.03), steel, (0, R90, 0), 6, r2=0.0))
    head_parts.append(cyl(0.008, 0.02, (-0.36, 0, -0.03), steel, (0, -R90, 0), 6, r2=0.0))
    for hp_ in head_parts:
        bake(hp_)
    hh = join(head_parts, "head")
    # Turned a little about the handle so both points read from the eye.
    a = math.radians(38)
    pick = (fwd * math.cos(a) + side * math.sin(a)).normalized()
    across = d.cross(pick).normalized()
    m = frame(pick, across, d).to_4x4()
    m.translation = head - d * 0.04
    xform(hh, m)
    parts.append(hh)
    parts.append(along(cyl(0.014, 0.05, (0, 0.025, 0), mat("brass", metal=0.8, rough=0.35), (-R90, 0, 0), 8), head + d * 0.03, head + d * 0.07))
    o = bake(join(parts, "Pickaxe"))
    wobble(o, 0.0012, 12)
    ao(o, 0.1)
    gr = glove_on(hand + d * 0.06, d, (0.35, -0.3, -1.0), 1, "GloveR", 0.22)
    gl = glove_on(hand + d * 0.3, d, (-0.2, -0.6, -1.0), -1, "GloveL", 0.55)
    parent_keep(gr, o)
    parent_keep(gl, o)
    return o


def jackhammer():
    amber = mat("amber", rough=0.5)
    iron = mat("iron", metal=0.7, rough=0.5)
    steel = mat("bright_steel", metal=0.9, rough=0.35)
    soot = mat("rubber", rough=0.9)
    brass = mat("brass", metal=0.85, rough=0.35)
    top = Vector((0.36, 0.42, -0.25))       # where the T-handle meets the body
    tip = Vector((0.17, 1.0, -0.4))
    d = (tip - top).normalized()
    side = d.cross(Vector((0, 0, 1))).normalized()
    parts = []
    # Body: an enamelled cylinder with cooling fins, built along +Y then laid on the axis.
    body = [cyl(0.075, 0.36, (0, 0.18, 0), amber, (-R90, 0, 0), 16, bevel=0.012)]
    for i in range(5):
        body.append(torus(0.077, 0.008, (0, 0.05 + i * 0.045, 0), iron, (R90, 0, 0), 16, 4))
    body.append(cyl(0.07, 0.1, (0, 0.41, 0), iron, (-R90, 0, 0), 16, r2=0.035))
    body.append(cyl(0.05, 0.05, (0, -0.02, 0), iron, (-R90, 0, 0), 12))
    body.append(cyl(0.02, 0.32, (0, 0.6, 0), steel, (-R90, 0, 0), 6))
    body.append(cyl(0.02, 0.08, (0, 0.8, 0), steel, (-R90, 0, 0), 6, r2=0.003))
    # Air fitting with a brass coupling and a stub of hose.
    body.append(cyl(0.016, 0.07, (0.085, 0.08, 0.0), brass, (0, R90, 0), 8))
    body.append(torus(0.022, 0.007, (0.12, 0.08, 0.0), brass, (0, R90, 0), 10, 4))
    body.append(strut((0.12, 0.08, 0.0), (0.2, 0.0, -0.08), 0.017, soot, sides=8))
    for p in body:
        along(p, top, top + d)
    parts += body
    # T-handle across the top, with rubber grips.
    hpos = top - d * 0.07
    parts.append(strut(top, hpos, 0.022, iron, sides=10))
    parts.append(strut(hpos - side * 0.24, hpos + side * 0.24, 0.02, iron, sides=10))
    for s in (-1, 1):
        parts.append(strut(hpos + side * s * 0.12, hpos + side * s * 0.24, 0.029, soot, sides=10))
    o = bake(join(parts, "Jackhammer"))
    wobble(o, 0.001, 13)
    ao(o, 0.1)
    gr = glove_on(hpos + side * 0.18, side, (0.3, -0.5, -1.0), 1, "GloveR", 0.3)
    gl = glove_on(hpos - side * 0.18, -side, (-0.3, -0.5, -1.0), -1, "GloveL", 0.4)
    parent_keep(gr, o)
    parent_keep(gl, o)
    return o


def drill():
    red = mat("red", rough=0.45)
    soot = mat("rubber", rough=0.9)
    iron = mat("iron", metal=0.7, rough=0.5)
    brass = mat("brass", metal=0.85, rough=0.35)
    steel = mat("bright_steel", metal=0.9, rough=0.3)
    body_c = Vector((0.24, 0.56, -0.2))
    aim = (Vector((0.05, 1.5, -0.02)) - body_c).normalized()
    side = aim.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(aim).normalized()
    parts = []
    # Housing: a rounded red enamel shell with brass vents, built along +Y.
    shell = [lathe([(0.0, -0.14), (0.05, -0.135), (0.062, -0.1), (0.066, 0.0), (0.062, 0.08), (0.048, 0.12), (0.0, 0.125)], 14, "shell", red)]
    place(shell[0], (0, 0, 0), (-R90, 0, 0))
    for i in range(4):
        shell.append(box((0.006, 0.05, 0.01), (0.064, -0.06, 0.03 - i * 0.018), brass))
        shell.append(box((0.006, 0.05, 0.01), (-0.064, -0.06, 0.03 - i * 0.018), brass))
    shell.append(torus(0.064, 0.006, (0, 0.05, 0), brass, (R90, 0, 0), 14, 4))
    shell.append(cyl(0.04, 0.05, (0, 0.15, 0), iron, (-R90, 0, 0), 14, bevel=0.004))
    shell.append(cyl(0.04, 0.05, (0, 0.2, 0), steel, (-R90, 0, 0), 14, r2=0.02))
    # Pistol grip and trigger, then a battery-free crank boss (it's that era).
    shell.append(place(box((0.05, 0.065, 0.16), (0, 0, 0), soot, bevel=0.014), (0, -0.07, -0.12), (math.radians(16), 0, 0)))
    shell.append(box((0.016, 0.028, 0.04), (0, -0.01, -0.07), brass, bevel=0.004))
    shell.append(cyl(0.03, 0.03, (0, -0.15, -0.0), iron, (-R90, 0, 0), 10))
    m = frame(side, aim, up).to_4x4()
    m.translation = body_c
    for p in shell:
        xform(p, m)
    parts += shell
    o = bake(join(parts, "Drill"))
    wobble(o, 0.001, 14)
    ao(o, 0.08)
    # The spinning bit: a twisted fluted bar with a point, its own node.
    b = bar(4, 0.017, 0.32, 28, (0, 0, 0), steel, name="bitbar")
    twist(b, math.radians(1000), "Y")
    tip = cyl(0.017, 0.05, (0, 0.345, 0), steel, (-R90, 0, 0), 4, r2=0.0)
    bit = spinner([b, tip], tuple(body_c + aim * 0.22), aim, "Bit")
    ao(bit, 0.03, 8)
    parent_keep(bit, o)
    grip_at = body_c + m.to_3x3() @ Vector((0, -0.07, -0.1))
    g = glove_on(grip_at, (m.to_3x3() @ Vector((0, 0.28, -1))).normalized(), (0.5, -1.0, -0.3), 1, "GloveR", 0.22)
    parent_keep(g, o)
    return o


def dynamite():
    red = mat("red", rough=0.75)
    tape = mat("soot", rough=0.9)
    cream = mat("cream", rough=0.9)
    parts = []
    for (x, y) in [(-0.025, 0.0), (0.025, 0.0), (0.0, 0.042)]:
        parts.append(cyl(0.024, 0.22, (x, y, 0), red, (0, 0, 0), 12, bevel=0.004))
        parts.append(cyl(0.021, 0.004, (x, y, 0.111), cream, (0, 0, 0), 12))
        for z in (-0.055, 0.055):
            parts.append(cyl(0.0255, 0.022, (x, y, z), tape, (0, 0, 0), 12))
    bpy.ops.curve.primitive_bezier_curve_add(location=(0, 0.042, 0.11))
    c = bpy.context.active_object
    pts = c.data.splines[0].bezier_points
    pts[0].co = (0, 0, 0)
    pts[0].handle_right = (0.0, 0.0, 0.06)
    pts[1].co = (0.05, -0.02, 0.09)
    pts[1].handle_left = (0.01, 0.02, 0.1)
    c.data.bevel_depth = 0.0045
    c.data.bevel_resolution = 2
    bpy.ops.object.convert(target="MESH")
    fuse = bpy.context.active_object
    fuse.data.materials.append(cream)
    parts.append(fuse)
    parts.append(sphere(0.008, (0.05, 0.022, 0.2), mat("glow_red", rough=0.3, emit=4.0), segs=8, rings=6))
    o = bake(join(parts, "Dynamite"))
    wobble(o, 0.001, 15)
    ao(o, 0.06)
    return o


def dynamite_held():
    stick = dynamite()
    m = Matrix.Rotation(math.radians(-18), 4, "Y") @ Matrix.Rotation(math.radians(12), 4, "X")
    m.translation = Vector((0.24, 0.62, -0.17))
    xform(stick, m)
    stick.name = "DynamiteHeld"
    g = glove_on(Vector((0.24, 0.62, -0.19)), (m.to_3x3() @ Vector((0, 0, 1))), (0.3, -0.3, -1.0), 1, "GloveR", 0.4)
    parent_keep(g, stick)
    return stick


def laser():
    enamel = mat("cream", rough=0.35)
    brass = mat("brass", metal=0.85, rough=0.35)
    iron = mat("iron", metal=0.7, rough=0.5)
    soot = mat("rubber", rough=0.9)
    body_c = Vector((0.25, 0.66, -0.2))
    aim = (Vector((0.04, 1.6, -0.02)) - body_c).normalized()
    side = aim.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(aim).normalized()
    parts = [cyl(0.055, 0.32, (0, 0.0, 0), enamel, (-R90, 0, 0), 16, bevel=0.01)]
    for y in (-0.12, 0.0, 0.12):
        parts.append(torus(0.057, 0.008, (0, y, 0), brass, (R90, 0, 0), 16, 4))
    for i in range(6):
        parts.append(cyl(0.07, 0.006, (0, -0.21 + i * 0.016, 0), iron, (-R90, 0, 0), 16))
    parts.append(cyl(0.052, 0.13, (0, 0.225, 0), iron, (-R90, 0, 0), 14, r2=0.03))
    parts.append(cyl(0.026, 0.012, (0, 0.295, 0), mat("laser", rough=0.2, emit=4.0), (-R90, 0, 0), 14))
    parts.append(place(box((0.052, 0.068, 0.15), (0, 0, 0), soot, bevel=0.012), (0, -0.06, -0.11), (math.radians(16), 0, 0)))
    parts.append(cyl(0.021, 0.17, (0, 0.0, 0.07), mat("verdigris", rough=0.2, emit=1.4), (-R90, 0, 0), 10, bevel=0.005))
    for y in (-0.085, 0.085):
        parts.append(box((0.022, 0.014, 0.03), (0, y, 0.058), brass))
    m = frame(side, aim, up).to_4x4()
    m.translation = body_c
    for p in parts:
        xform(p, m)
    o = bake(join(parts, "Laser"))
    wobble(o, 0.001, 16)
    ao(o, 0.08)
    muzzle = bpy.data.objects.new("Muzzle", None)
    bpy.context.collection.objects.link(muzzle)
    muzzle.location = body_c + aim * 0.31
    parent_keep(muzzle, o)
    grip_at = body_c + m.to_3x3() @ Vector((0, -0.06, -0.1))
    g = glove_on(grip_at, (m.to_3x3() @ Vector((0, 0.28, -1))).normalized(), (0.5, -1.0, -0.3), 1, "GloveR", 0.22)
    parent_keep(g, o)
    return o


def borer():
    red = mat("red", rough=0.5)
    iron = mat("iron", metal=0.7, rough=0.5)
    brass = mat("brass", metal=0.85, rough=0.35)
    steel = mat("bright_steel", metal=0.9, rough=0.35)
    soot = mat("rubber", rough=0.9)
    c = Vector((0.3, 0.74, -0.34))
    aim = (Vector((-0.3, 1.36, -0.22)) - c).normalized()
    side = aim.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(aim).normalized()
    parts = [cyl(0.17, 0.34, (0, 0.0, 0), red, (-R90, 0, 0), 22, bevel=0.016)]
    for y in (-0.15, 0.15):
        parts.append(torus(0.172, 0.013, (0, y, 0), brass, (R90, 0, 0), 22, 4))
        for k in range(12):
            a = k / 12 * math.tau
            parts.append(sphere(0.008, (math.cos(a) * 0.173, y + (0.022 if y < 0 else -0.022), math.sin(a) * 0.173), brass, segs=6, rings=4))
    parts.append(cyl(0.13, 0.08, (0, -0.2, 0), iron, (-R90, 0, 0), 18, r2=0.09))
    # Side handles: iron loops with rubber grips.
    for s in (-1, 1):
        parts.append(strut((s * 0.16, -0.08, 0.0), (s * 0.27, -0.12, 0.0), 0.016, iron, sides=8))
        parts.append(strut((s * 0.16, 0.06, 0.0), (s * 0.27, 0.02, 0.0), 0.016, iron, sides=8))
        parts.append(strut((s * 0.27, -0.14, 0.0), (s * 0.27, 0.04, 0.0), 0.024, soot, sides=10))
    m = frame(side, aim, up).to_4x4()
    m.translation = c
    for p in parts:
        xform(p, m)
    o = bake(join(parts, "Borer"))
    wobble(o, 0.0015, 17)
    ao(o, 0.12)
    # The cutting head: a steel cone with rings of brass teeth and spiral flutes.
    head = [cyl(0.165, 0.34, (0, 0.17, 0), steel, (-R90, 0, 0), 16, r2=0.014)]
    for ring in range(4):
        y = 0.04 + ring * 0.075
        rr = 0.165 * (1.0 - y / 0.34) + 0.012
        n = 10 - ring * 2
        for k in range(n):
            a = k / n * math.tau + ring * 0.4
            tooth = cyl(0.016, 0.05, (0, 0.025, 0), brass, (-R90, 0, 0), 5, r2=0.0)
            tm = Matrix.Rotation(a, 4, "Y") @ Matrix.Translation((rr, y, 0)) @ Matrix.Rotation(math.radians(-55), 4, "Z")
            xform(tooth, tm)
            head.append(tooth)
    for k in range(3):
        fl = bar(3, 0.02, 0.34, 18, (0, 0, 0), iron, name="flute")
        for v in fl.data.vertices:
            t = v.co.y / 0.34
            rr = 0.16 * (1.0 - t) + 0.008
            ang = k / 3 * math.tau + t * 3.6
            v.co.x += math.cos(ang) * rr
            v.co.z += math.sin(ang) * rr
        head.append(fl)
    bit = spinner(head, tuple(c + aim * 0.17), aim, "Bit")
    ao(bit, 0.06, 8)
    parent_keep(bit, o)
    for s, name in ((1, "GloveR"), (-1, "GloveL")):
        hp = c + m.to_3x3() @ Vector((s * 0.27, -0.05, 0.0))
        g = glove_on(hp, (m.to_3x3() @ Vector((0, 1, 0))), (s * 0.3, -0.4, -1.0), s, name, 0.4)
        parent_keep(g, o)
    return o


if __name__ == "__main__":
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    for name, fn in [("tool_shovel", shovel), ("tool_pickaxe", pickaxe), ("tool_jackhammer", jackhammer),
                     ("tool_drill", drill), ("tool_dynamite", dynamite_held), ("dynamite_stick", dynamite),
                     ("tool_laser", laser), ("tool_borer", borer)]:
        if only and name not in only:
            continue
        reset()
        o = fn()
        export([o], name)
