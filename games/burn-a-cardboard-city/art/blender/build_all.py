"""Builds every model in the game and exports them to models/*.glb.

    python3 art/blender/build_all.py            # then: python3 art/blender/contact_sheet.py /tmp/sheet.png

Each family is one .glb holding one mesh per model, named as the game looks
them up (see scripts/model_lib.gd).
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import castle  # noqa: E402
import downtown  # noqa: E402
import nature_props  # noqa: E402
import rubble  # noqa: E402
import skyline  # noqa: E402
import suburbs  # noqa: E402
import tools  # noqa: E402
import vehicles  # noqa: E402

FAMILIES = [
    ("houses.glb", lambda: [f() for f in suburbs.HOUSES]),
    ("trees.glb", lambda: [f() for f in suburbs.TREES]),
    ("offices.glb", lambda: [f() for f in downtown.OFFICES]),
    ("skyscrapers.glb", lambda: [f() for f in skyline.SKYSCRAPERS]),
    ("castle.glb", castle.build),
    ("rubble.glb", rubble.build),
    ("vehicles.glb", vehicles.build_vehicles),
    ("helpers.glb", vehicles.build_helpers),
    ("props.glb", nature_props.build_props),
    ("tools.glb", tools.build),
]


def main():
    only = set(sys.argv[1:])
    for filename, make in FAMILIES:
        if only and filename not in only:
            continue
        t = time.time()
        kit.reset()
        objs = make()
        dist = {"castle.glb": 0.8, "skyscrapers.glb": 0.6, "props.glb": 0.5}.get(filename, 0.35)
        if filename != "tools.glb":   # the held tools are shaded like a drawing in the game (and their outline would occlude them)
            kit.bake_ao(objs, distance=dist, samples=24)
        kit.export(objs, filename)
        print("%s: %d models, %d faces, %.1fs" % (filename, len(objs), sum(len(o.data.polygons) for o in objs),
                                                 time.time() - t))


if __name__ == "__main__":
    main()
