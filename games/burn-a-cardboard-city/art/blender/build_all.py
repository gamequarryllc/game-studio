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
import city_buildings  # noqa: E402
import nature_props  # noqa: E402
import tools  # noqa: E402
import vehicles  # noqa: E402

FAMILIES = [
    ("houses.glb", lambda: [f() for f in city_buildings.HOUSES]),
    ("offices.glb", lambda: [f() for f in city_buildings.OFFICES]),
    ("skyscrapers.glb", lambda: [f() for f in city_buildings.SKYSCRAPERS]),
    ("castle.glb", castle.build),
    ("vehicles.glb", vehicles.build_vehicles),
    ("helpers.glb", vehicles.build_helpers),
    ("trees.glb", nature_props.build_trees),
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
        kit.bake_ao(objs, distance=0.35 if filename != "castle.glb" else 0.8, samples=24)
        kit.export(objs, filename)
        print("%s: %d models, %d faces, %.1fs" % (filename, len(objs), sum(len(o.data.polygons) for o in objs),
                                                 time.time() - t))


if __name__ == "__main__":
    main()
