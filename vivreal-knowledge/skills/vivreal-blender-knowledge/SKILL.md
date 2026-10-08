---
name: vivreal-blender-knowledge
description: 'Use when scripting or rendering in Blender for Vivreal, above all the Vivreal duck mascot in vivreal-hq/brand/mascot/model. Covers headless renders (blender -b -P script.py -- args, --factory-startup, --python-exit-code), bpy data versus ops, bmesh, depsgraph evaluated_get and new_from_object, mathutils transform gotchas, flat toon and NPR rendering in EEVEE (Emission plus the Standard view transform, exact sRGB hex, dither, filter size, transparent film, orthographic framing), outline methods compared (Freestyle, Grease Pencil Line Art, inverted hull, ID-pass edge inking), and the 4.2 to 5.2 API changes that break scripts (EEVEE engine id, blend_method, use_nodes, Grease Pencil v3). Triggers on: Blender, bpy, bmesh, headless render, background render, EEVEE, Workbench, Cycles, toon, cel, NPR, outline, inverted hull, Freestyle, Line Art, Grease Pencil, view transform, AgX, Filmic, mascot, the duck, duck.py, render.py, mascot-artist.'
---

# Blender knowledge: headless scripting and flat toon rendering

Last synced: 2026-10-08

Verified against **Blender 5.2.2 LTS** (portable install at
`%LOCALAPPDATA%\Programs\blender\blender.exe`, Windows 11, Intel Arc iGPU) by running it headless,
and against the 5.2 LTS manual, the current API docs and the developer release notes. This is a
lean selector; the depth lives in the references, read the one your task needs.

docs.blender.org and download.blender.org return HTTP 403 to automated fetches from this machine.
The docs were read through the Wayback Machine (`https://web.archive.org/web/2026id_/<url>`); the
API surface was confirmed by asking the installed Blender itself (RNA descriptions and
`__doc__`), which is what the API docs are generated from.

## The strongest rules

1. **Always pass `--python-exit-code 1`.** The default is zero, so a Python exception in a
   `-P` script still exits 0 and a caller's `check=True` never fires (verified in 5.2). Our
   `render.py` passes it and deletes the previous raw renders first; without both, a crashed
   `duck.py` silently inks the last run's PNGs.
2. **Order of arguments is execution order.** `-b --factory-startup -P script.py -- args`.
   Everything after `--` is ignored by Blender and reaches `sys.argv` unchanged.
3. **Flat colour = Emission (strength 1.0) + view transform `Standard`.** Factory settings
   default to `AgX`, which shifted brand orange `#FD8304` to `(210,127,55)` in our test;
   `Standard` reproduced it exactly. Feed the shader the **linear** value of the sRGB hex.
4. **Set `scene.render.dither_intensity = 0`** for flat art and ID passes. The default 1.0
   jittered about 20% of flat pixels by plus or minus 1 in our test; 0 made them exact.
5. **No anti-aliasing for an ID pass:** `render.filter_size = 0`, `eevee.taa_render_samples = 1`
   (plus dither 0). Result: exactly one value per part, verified.
6. **Engine id in 5.x is `BLENDER_EEVEE`.** `BLENDER_EEVEE_NEXT` existed only in 4.2 to 4.5 and
   is rejected by 5.2. Probe the enum on an instance, never on the class.
7. **Freestyle cannot draw lines where parts interpenetrate** ("No edges at face intersections
   are detected yet", manual; confirmed by render). The duck's parts interpenetrate everywhere,
   so Freestyle is the wrong tool. Line Art can (Intersections), ID-pass inking can.
8. **Data API over operators in background mode.** `bpy.data.*.new`, `bmesh`, direct property
   writes. Operators depend on context and fail their poll. Free every `bmesh` you create.
9. **Evaluated data needs the depsgraph.** `obj.evaluated_get(depsgraph)`, then
   `bpy.data.meshes.new_from_object(eval_obj)` for a persistent mesh. `Object.ray_cast` works in
   **object space**, not world space.
10. **Never invent an API.** Check it in the installed build:
    `blender -b --factory-startup --python-expr "import bpy; print('x' in bpy.types.Material.bl_rna.properties.keys())"`.
    `hasattr(bpy.types.X, 'prop')` returns False for RNA properties even when they exist.

## The five references: read the one you need

- **`references/mascot-pipeline.md`**: how OUR duck pipeline works end to end (`duck.py`,
  `render.py`, `poses.json`, `build.py`), the owner rules, how to add a pose, how to iterate on
  feedback one piece at a time, and the known defects in the current scripts. **Read first for
  any mascot task.**
- **`references/headless-python.md`**: CLI flags, `--` argv, data versus ops, bmesh patterns,
  depsgraph and `new_from_object`, mathutils transform gotchas, bundled numpy (no scipy),
  determinism, Windows paths and quoting. **Read when writing or debugging a bpy script.**
- **`references/flat-toon-rendering.md`**: Emission plus Standard, sRGB to linear, dither,
  transparent film, EEVEE versus Workbench versus Cycles for flat art, filter size and TAA,
  orthographic framing. **Read when a colour is off, edges are soft, or framing is wrong.**
- **`references/outlines.md`**: Freestyle, Line Art, inverted hull and ID-pass inking compared,
  with when to use each and how each fails, plus our measured results. **Read before changing
  how outlines are made.**
- **`references/version-notes.md`**: 4.2 to 5.2 changes that break scripts. **Read when a script
  written for an older Blender errors or warns.**

## Companions

- `vivreal-brand-voice` for any text a person reads (no em or en dashes).
- The `mascot-artist` agent (vivreal-content plugin) is the main consumer of this skill.
