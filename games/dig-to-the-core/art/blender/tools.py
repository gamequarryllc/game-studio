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
from mathutils import Matrix, Vector, noise  # noqa: E402
from kit import (box, cyl, sphere, torus, from_profile, join, wobble, export, reset,  # noqa: E402
                 twist, bend, subdivide, bar, lathe, place, strut, glove, ao, smooth, tube, handle, tape_wrap, paint_by, grain, paint_rgb)
from kit import tube as ktube  # noqa: E402
from kit import mat as kit_mat  # noqa: E402

R90 = math.radians(90)


def mat(name, color=None, metal=0.0, rough=0.7, emit=0.0):
    """kit.mat with metal turned well down: the game has no reflections, so
    a highly metallic surface renders nearly black there and hides its paint
    (the worn bright edges, pits and scratches baked into the vertex colour).
    The wear does the work; a little metal keeps a sheen."""
    return kit_mat(name, color=color, metal=metal * 0.4, rough=rough, emit=emit)


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
def _edge_dist(p, outline):
    """Distance from (x, z) to the nearest edge of a closed outline."""
    best = 1e9
    n = len(outline)
    for i in range(n):
        ax, az = outline[i]
        bx, bz = outline[(i + 1) % n]
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2))
        ex, ez = ax + dx * t - p[0], az + dz * t - p[1]
        best = min(best, math.hypot(ex, ez))
    return best


def shovel():
    wood = mat("hickory", rough=0.8)
    steel = mat("tool_steel", metal=0.45, rough=0.45)
    iron = mat("iron", metal=0.6, rough=0.6)
    grip = Vector((0.44, 0.32, -0.27))      # D-grip, right hand (low, by the hip)
    collar = Vector((0.33, 0.68, -0.31))    # where the blade starts
    d = (collar - grip).normalized()
    shaft = handle(grip, collar, 0.021, 0.023, wood, name="shaft")
    # darker and polished where the hands go
    paint_rgb(shaft, lambda p, n: (lambda t: (t, t * 0.97, t * 0.93))(
        0.72 + 0.28 * min(1.0, abs((p - grip).dot(d) - 0.26) / 0.12)))
    parts = [shaft]
    # D-grip: a cross bar and two cheeks, the same ash as the shaft.
    side = d.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(d).normalized()
    top = grip - d * 0.12
    parts.append(handle(top - side * 0.06, top + side * 0.06, 0.017, 0.017, wood, sides=8, rings=8, name="dbar"))
    parts.append(handle(grip - side * 0.012, top - side * 0.06, 0.012, 0.011, wood, sides=6, rings=6, name="cheek"))
    parts.append(handle(grip + side * 0.012, top + side * 0.06, 0.012, 0.011, wood, sides=6, rings=6, name="cheek"))
    parts.append(along(cyl(0.025, 0.06, (0, 0.03, 0), iron, (-R90, 0, 0), 10), grip - d * 0.01, grip + d * 0.05))
    # Collar (socket) with two brass rivets.
    parts.append(along(cyl(0.032, 0.16, (0, 0.08, 0), iron, (-R90, 0, 0), 10, r2=0.024), collar - d * 0.12, collar + d * 0.04))
    for s_ in (-1, 1):
        parts.append(sphere(0.006, tuple(collar - d * 0.05 + side * 0.026 * s_), mat("brass", metal=0.8, rough=0.35), segs=6, rings=4))
    # The blade: a cupped, pointed spade, oversized. Blackened steel worn back
    # to bright metal along the cutting edge, a few long scratches.
    outline = [(-0.14, 0.0), (-0.035, 0.0), (0.0, 0.026), (0.035, 0.0), (0.14, 0.0), (0.146, 0.2),
               (0.1, 0.315), (0.0, 0.375), (-0.1, 0.315), (-0.146, 0.2)]
    blade = from_profile(outline, 0.008, steel, bevel=0.003, name="blade")
    # Fan the flat faces into triangles first: subdividing an n-gon only
    # splits its edges, so the blade's face had no inside vertices and the
    # wear painted below came out as one flat grey.
    bpy.ops.object.select_all(action="DESELECT")
    blade.select_set(True)
    bpy.context.view_layer.objects.active = blade
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.poke()
    bpy.ops.mesh.subdivide(number_cuts=3)
    bpy.ops.object.mode_set(mode="OBJECT")
    cut = outline[4:] + outline[:1]

    def worn(p, n):
        # bright where the edge has been ground by stone, blackened and
        # pitted in the middle, rust in the pits, long scratches
        e = _edge_dist((p.x, p.z), outline)
        rim = max(0.0, 1.0 - e / 0.03) * (1.0 if p.z > 0.05 else 0.35)
        pit = noise.noise(Vector((p.x * 120.0, p.z * 120.0, 3.0)))
        rust = max(0.0, noise.noise(Vector((p.x * 18.0, p.z * 18.0, 7.0))) - 0.15) * 1.6
        scratch = 1.0 if math.sin(p.x * 140.0 + p.z * 31.0 + 3.0 * noise.noise(Vector((p.x * 9, p.z * 9, 1.0)))) > 0.93 else 0.0
        k = 0.52 + 0.55 * rim ** 0.7
        if pit > 0.45 and rim < 0.5:
            k *= 0.55
        k = min(1.0, k + 0.35 * scratch * (1.0 - rim))
        r = min(1.0, rust * (1.0 - rim))
        return (k * (1.0 + 0.35 * r), k * (1.0 - 0.05 * r), k * (1.0 - 0.35 * r))
    paint_rgb(blade, worn)
    bend(blade, math.radians(-35), "Z")
    bake(blade)
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
    wood = mat("hickory", rough=0.8)
    steel = mat("tool_steel", metal=0.55, rough=0.4)
    tape = mat("tape", rough=0.95)
    hand = Vector((0.26, 0.32, -0.25))
    head = Vector((0.22, 0.86, 0.05))
    d = (head - hand).normalized()
    L = (head - hand).length
    haft = handle(hand - d * 0.06, head, 0.022, 0.03, wood, name="haft")
    paint_rgb(haft, lambda p, n: (lambda t: (t, t * 0.97, t * 0.93))(0.7 + 0.3 * min(1.0, max(0.0, ((p - hand).dot(d) - 0.2) / 0.15))))
    parts = [haft]
    # Cloth grip tape wound round the end, a tail of it hanging loose.
    parts.append(tape_wrap(hand - d * 0.04, hand + d * 0.17, 0.0255, 8, tape, 0.0085))
    side = d.cross(Vector((0, 0, 1))).normalized()
    fwd = side.cross(d).normalized()        # the way the head points (forward/up)
    parts.append(ktube([hand + d * 0.17 + fwd * 0.026, hand + d * 0.19 + fwd * 0.03 - side * 0.01, hand + d * 0.2 + fwd * 0.012 - side * 0.03],
                       [0.007, 0.006, 0.005], tape, sides=4, flat=0.35, name="tail"))
    # Double-ended head, oversized: one forged piece, thick at the eye and
    # curving down to a point at each end (a sharp pick and a chisel end).
    # Blackened from the forge, worn bright at both working ends.
    pts = []
    rad = []
    for i in range(21):
        t = -1.0 + 2.0 * i / 20
        pts.append(Vector((t * 0.4, 0.0, 0.075 * (1.0 - t * t) - 0.035 * t * t)))
        rad.append(0.05 * (1.0 - 0.86 * abs(t) ** 0.9) + 0.005)
    hd = ktube(pts, rad, steel, sides=8, flat=0.72, name="pickhead")
    for v in hd.data.vertices:
        if v.co.x < -0.2:
            v.co.y *= 0.55
            v.co.z = v.co.z * 1.25 - 0.004
    eye = cyl(0.046, 0.075, (0, 0, 0.035), steel, (0, 0, 0), 10, bevel=0.01)
    bake(eye)
    wedge = box((0.05, 0.012, 0.012), (0, 0, 0.074), mat("iron", metal=0.6, rough=0.6), bevel=0.002)
    bake(wedge)
    hh = join([hd, eye, wedge], "head")
    def forged(p, n):
        # blackened from the forge and pitted at the eye, worn bright towards
        # both working ends, hammer facets catching the light
        bright = min(1.0, max(0.0, (abs(p.x) - 0.15) / 0.17)) ** 1.4
        pit = noise.noise(p * 140.0)
        k = 0.34 + 0.66 * bright + 0.05 * math.sin(p.x * 90.0)
        if pit > 0.4 and bright < 0.4:
            k *= 0.6
        return (k, k * 0.99, k * 0.97)
    paint_rgb(hh, forged)
    # two rivets through the eye, holding the wedge
    for s_ in (-1, 1):
        rv = sphere(0.007, (s_ * 0.03, 0.0, 0.07), mat("iron", metal=0.6, rough=0.5), scale=(1, 1, 0.6), segs=8, rings=5)
        bake(rv)
        hh = join([hh, rv], "head")
    smooth(hh, 55)
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
    gl = glove_on(hand + d * 0.17, d, (-0.55, -0.45, -1.0), -1, "GloveL", 0.7)
    parent_keep(gr, o)
    parent_keep(gl, o)
    return o


def jackhammer():
    iron = mat("iron", metal=0.7, rough=0.5)
    steel = mat("bright_steel", metal=0.9, rough=0.35)
    soot = mat("rubber", rough=0.9)
    brass = mat("brass", metal=0.85, rough=0.35)
    top = Vector((0.36, 0.42, -0.25))       # where the T-handle meets the body
    tip = Vector((0.17, 1.0, -0.4))
    d = (tip - top).normalized()
    side = d.cross(Vector((0, 0, 1))).normalized()
    parts = []
    # Body: a blackened iron cylinder (an old pneumatic rock drill), with two
    # brass bands, close-set cooling ribs the same iron as the body, and a red
    # enamel maker's plate. Built along +Y then laid on the axis.
    red = mat("red", rough=0.5)
    body = [cyl(0.078, 0.36, (0, 0.18, 0), iron, (-R90, 0, 0), 16, bevel=0.012)]
    for i in range(7):
        body.append(torus(0.08, 0.006, (0, 0.13 + i * 0.026, 0), mat("dark_steel", metal=0.6, rough=0.55), (R90, 0, 0), 16, 4))
    for y in (0.03, 0.33):
        body.append(torus(0.081, 0.01, (0, y, 0), brass, (R90, 0, 0), 16, 4))
    body.append(place(box((0.075, 0.07, 0.012), (0, 0, 0), red, bevel=0.004), (0, 0.075, 0.074)))
    body.append(cyl(0.07, 0.1, (0, 0.41, 0), iron, (-R90, 0, 0), 16, r2=0.035))
    body.append(cyl(0.05, 0.05, (0, -0.02, 0), iron, (-R90, 0, 0), 12))
    body.append(cyl(0.022, 0.32, (0, 0.6, 0), steel, (-R90, 0, 0), 6))
    body.append(cyl(0.022, 0.08, (0, 0.8, 0), steel, (-R90, 0, 0), 6, r2=0.003))
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
    # What you see of it from behind: ribbed iron cooling rings round the
    # motor end, a riveted brass maker's plate on top, and the rubber cord
    # out of the back cap, looping down out of sight.
    for i in range(4):
        shell.append(torus(0.058 - i * 0.004, 0.0055, (0, -0.075 - i * 0.016, 0), iron, (R90, 0, 0), 16, 4))
    shell.append(box((0.034, 0.05, 0.004), (0, -0.02, 0.066), brass, bevel=0.0015))
    for sx in (-1, 1):
        for sy in (-1, 1):
            shell.append(sphere(0.0028, (sx * 0.013, -0.02 + sy * 0.02, 0.068), iron, segs=6, rings=4))
    shell.append(ktube([Vector((0, -0.16, 0.0)), Vector((0.0, -0.21, -0.01)), Vector((0.02, -0.24, -0.07)),
                        Vector((0.05, -0.22, -0.16)), Vector((0.08, -0.18, -0.3))], [0.009, 0.009, 0.009, 0.009, 0.009], soot, sides=6, name="cord"))
    shell.append(cyl(0.013, 0.03, (0, -0.17, 0), soot, (-R90, 0, 0), 8, r2=0.009))
    m = frame(side, aim, up).to_4x4()
    m.translation = body_c
    for p in shell:
        xform(p, m)
    parts += shell
    o = bake(join(parts, "Drill"))
    wobble(o, 0.001, 14)
    # Chipped enamel: dark iron showing through in scattered chips, the red
    # rubbed thin and darker towards the back where the hand goes.
    def chips(p_, n_):
        c = noise.noise(p_ * 70.0 + Vector((2.0, 5.0, 1.0)))
        k = 0.5 if c > 0.42 else (0.85 if c > 0.3 else 1.0)
        return (k, k * (1.05 if k < 1 else 1.0), k * (1.1 if k < 1 else 1.0))
    paint_rgb(o, chips)
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
    """The laser drill, nothing like a torch: a pistol-gripped brass and
    enamel body with a fat copper induction coil wound round its middle, a
    glass capacitor standing on top with a glowing filament, a pressure gauge
    on its flank, a ring of cooling fins, and a three-pronged emitter holding
    the red focusing crystal out in front."""
    enamel = mat("cream", rough=0.35)
    brass = mat("brass", metal=0.85, rough=0.35)
    copper = mat(None, color=(0.72, 0.4, 0.22), metal=0.8, rough=0.35)
    iron = mat("iron", metal=0.7, rough=0.5)
    wood = mat("wood_dark", rough=0.8)
    glass = mat("glass", rough=0.15, emit=0.6)
    body_c = Vector((0.25, 0.64, -0.21))
    aim = (Vector((0.04, 1.6, -0.02)) - body_c).normalized()
    side = aim.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(aim).normalized()
    parts = []
    # Body: a stepped enamel cylinder, brass bands at the steps.
    parts.append(lathe([(0.0, -0.17), (0.045, -0.17), (0.05, -0.14), (0.05, -0.05), (0.06, -0.04), (0.06, 0.08),
                        (0.048, 0.1), (0.048, 0.16), (0.0, 0.16)], 18, "body", enamel))
    parts[-1].data.transform(Matrix.Rotation(-R90, 4, "X"))
    for y in (-0.14, -0.045, 0.085):
        parts.append(torus(0.061 if y > -0.1 else 0.052, 0.007, (0, y, 0), brass, (R90, 0, 0), 18, 4))
    # The induction coil: copper wire wound tight round the middle.
    coil = []
    turns = 9
    for i in range(turns * 12 + 1):
        t = i / (turns * 12)
        ang = t * turns * math.tau
        coil.append(Vector((math.cos(ang) * 0.068, -0.035 + t * 0.11, math.sin(ang) * 0.068)))
    parts.append(ktube(coil, [0.0075] * len(coil), copper, sides=6, name="coil"))
    # Cooling fins and the emitter: three brass prongs round the crystal.
    for i in range(5):
        parts.append(cyl(0.056 - i * 0.003, 0.006, (0, 0.17 + i * 0.016, 0), iron, (-R90, 0, 0), 16))
    parts.append(cyl(0.032, 0.07, (0, 0.27, 0), iron, (-R90, 0, 0), 12, r2=0.024))
    for k in range(3):
        a = k / 3 * math.tau + 0.3
        base = Vector((math.cos(a) * 0.03, 0.29, math.sin(a) * 0.03))
        tipp = Vector((math.cos(a) * 0.022, 0.37, math.sin(a) * 0.022))
        parts.append(ktube([base, base + Vector((0, 0.04, 0)) + Vector((math.cos(a), 0, math.sin(a))) * 0.012, tipp], [0.007, 0.006, 0.004], brass, sides=6, name="prong"))
    parts.append(place(lathe([(0.0, -0.02), (0.016, -0.01), (0.018, 0.0), (0.012, 0.02), (0.0, 0.032)], 6, "crystal", mat("laser", rough=0.2, emit=4.0)), (0, 0.33, 0), (-R90, 0, 0)))
    # The capacitor on top: a glass tube in brass end caps, glowing inside.
    cap_c = Vector((0, -0.07, 0.1))
    parts.append(cyl(0.024, 0.1, tuple(cap_c), glass, (-R90, 0, 0), 12))
    parts.append(cyl(0.007, 0.09, tuple(cap_c), mat("laser", rough=0.3, emit=3.0), (-R90, 0, 0), 6))
    for dy in (-0.055, 0.055):
        parts.append(cyl(0.028, 0.016, tuple(cap_c + Vector((0, dy, 0))), brass, (-R90, 0, 0), 12, bevel=0.003))
        parts.append(box((0.012, 0.012, 0.05), tuple(cap_c + Vector((0, dy, -0.03))), brass))
    # A pressure gauge on the left flank.
    g_c = Vector((-0.064, -0.1, 0.01))
    parts.append(place(cyl(0.024, 0.014, (0, 0, 0), brass, (0, 0, 0), 14), tuple(g_c), (0, R90, 0)))
    parts.append(place(cyl(0.019, 0.004, (0, 0, 0), mat("cream", rough=0.4), (0, 0, 0), 14), tuple(g_c + Vector((-0.008, 0, 0))), (0, R90, 0)))
    parts.append(strut(g_c + Vector((-0.011, 0, 0)), g_c + Vector((-0.011, 0.012, 0.01)), 0.0018, mat("red"), sides=4))
    # Pistol grip with wooden plates and a trigger guard.
    parts.append(place(box((0.046, 0.06, 0.15), (0, 0, 0), iron, bevel=0.01), (0, -0.08, -0.11), (math.radians(16), 0, 0)))
    for s_ in (-1, 1):
        gp = place(box((0.008, 0.05, 0.12), (0, 0, 0), wood, bevel=0.003), (s_ * 0.026, -0.08, -0.115), (math.radians(16), 0, 0))
        grain(gp, (0, 0.27, -0.96), 0.3, 120, 5 + s_)
        parts.append(gp)
    parts.append(ktube([Vector((0, -0.04, -0.05)), Vector((0, -0.0, -0.08)), Vector((0, -0.035, -0.11))], [0.005] * 3, iron, sides=5, name="guard"))
    m = frame(side, aim, up).to_4x4()
    m.translation = body_c
    for p in parts:
        xform(p, m)
    o = bake(join(parts, "Laser"))
    wobble(o, 0.0008, 16)
    ao(o, 0.08)
    muzzle = bpy.data.objects.new("Muzzle", None)
    bpy.context.collection.objects.link(muzzle)
    muzzle.location = body_c + aim * 0.36
    parent_keep(muzzle, o)
    grip_at = body_c + m.to_3x3() @ Vector((0, -0.08, -0.1))
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
