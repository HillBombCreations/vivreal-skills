# Headless Blender Python

Verified on Blender 5.2.2 LTS, bundled Python 3.13.13, bundled numpy 2.3.4. "Verified" below means
run against that build on 2026-10-08. Docs were read via the Wayback Machine because
docs.blender.org returns 403 here; the canonical URL is what is cited.

## Command line

Source: Command Line Arguments, 5.2 LTS manual,
https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html

| Flag | What the manual says | Use |
|---|---|---|
| `-b`, `--background` | "Run in background (often used for UI-less rendering)." Audio is disabled in background mode by default. | Always, for renders. |
| `-P`, `--python <file>` | "Run the given Python script file." | Our scripts. |
| `--python-expr <expr>` | "Run the given expression as a Python script." May be multi-line. | One-line API probes. |
| `--python-exit-code <code>` | "Set the exit-code in [0..255] to exit if a Python exception is raised (only for scripts executed from the command line), zero disables." | **Always pass `1`.** |
| `--factory-startup` | "Skip reading the startup.blend in the users home directory." | Always, for reproducible renders. |
| `--` | "End option processing, following arguments passed unchanged. Access via Python's sys.argv." | Pass pose, output path, size. |
| `-t`, `--threads <n>` | Thread count for rendering and other operations. | Rarely needed. |
| `-c`, `--command` | Runs a command consuming the remaining arguments; implies background. | Not used by us. |

- **Exit code trap (verified):** `blender -b --python-expr "raise RuntimeError()"` exits **0**.
  With `--python-exit-code 1` it exits 1. Any wrapper using `subprocess.run(check=True)` must
  pass the flag, or a crashed script looks like a success.
- **Argument order is execution order** (manual, "Argument Order"): flags run left to right,
  and loading a .blend overwrites render settings set before it. Put `-P script.py` after the
  file you load, and put `--` last.
- **Reading args** (manual, `--` row; Tips and Tricks,
  https://docs.blender.org/api/current/info_tips_and_tricks.html):
  ```python
  argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
  ```
  Verified: `sys.argv` holds Blender's own flags too, so always slice after `--`.
- **`--python-expr` for API checks**, the quickest way to confirm a property exists:
  `blender -b --factory-startup --python-expr "import bpy; print('surface_render_method' in bpy.types.Material.bl_rna.properties.keys())"`

## Data API versus operators

Source: Using Operators, https://docs.blender.org/api/current/info_gotchas_operators.html

- Operators "use the context instead" of taking data, return only a status, and their "poll
  function can fail where an API function would raise an exception giving details". In
  background there is no window or area, so view-dependent operators fail with
  `poll() failed, context is incorrect`.
- Prefer the data API: `bpy.data.meshes.new`, `bpy.data.objects.new`,
  `scene.collection.objects.link(ob)`, direct property assignment, `bmesh.ops.*`.
- Operators that are safe and used by us in background: `bpy.ops.wm.read_factory_settings(use_empty=True)`
  (clean scene) and `bpy.ops.render.render(write_still=True)`.
- After `read_factory_settings(use_empty=True)` (verified): the scene has no camera or world,
  the view transform is `AgX`, and the default Freestyle line set has **no line style**
  (`linesets.active.linestyle is None`); create one with `bpy.data.linestyles.new()` before use.

## Checking that an API exists (do this before claiming it)

- RNA properties are **not** Python class attributes. Verified: `hasattr(bpy.types.Material,
  'blend_method')` is False while the property exists. Use
  `'name' in bpy.types.Material.bl_rna.properties.keys()` or `hasattr(instance, 'name')`.
- Enums: read items from an instance, e.g.
  `[i.identifier for i in scene.render.bl_rna.properties['engine'].enum_items]`. Some enums are
  filled at runtime (engines, view transforms); the safest probe is to assign and catch
  `TypeError`. Verified: assigning `BLENDER_EEVEE_NEXT` in 5.2 raises
  `enum "BLENDER_EEVEE_NEXT" not found in ('BLENDER_EEVEE', 'BLENDER_WORKBENCH', 'CYCLES')`.
- Descriptions and signatures: `bpy.types.X.bl_rna.properties['p'].description`,
  `bpy.types.X.bl_rna.functions['f'].parameters`, `mathutils.Matrix.LocRotScale.__doc__`.

## bmesh patterns

Source: BMesh Module, https://docs.blender.org/api/current/bmesh.html

```python
me = bpy.data.meshes.new(name)
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=40, radius=1.0)
bm.transform(matrix)          # bake a transform into the vertices
for f in bm.faces: f.smooth = True
bm.to_mesh(me)
bm.free()                     # "free and prevent further access"
ob = bpy.data.objects.new(name, me)
bpy.context.scene.collection.objects.link(ob)
```

- Ops we use (all verified in 5.2 by our pipeline running): `create_uvsphere`, `create_cube`,
  `create_cone`, `create_grid` (with `calc_uvs=True`, needs a UV layer created first via
  `bm.loops.layers.uv.new()`), `bevel`, `solidify`, `reverse_faces`, `recalc_face_normals`.
- "Unlike Edit-Mode, the BMesh module can use multiple BMesh instances at once" (bmesh docs).
- Call `bm.normal_update()` before reading `v.normal` after edits.
- Index access like `bm.verts[i]` needs `bm.verts.ensure_lookup_table()`, which "needs to be
  called again after adding/removing data in this sequence" (5.2 docstring,
  https://docs.blender.org/api/current/bmesh.types.html).
- Edit-Mode has its own copy of mesh data; scripts on object data in background never enter
  Edit-Mode, so this does not bite us (https://docs.blender.org/api/current/info_gotchas_meshes.html).

## Depsgraph, evaluated data, `new_from_object`

Source: https://docs.blender.org/api/current/bpy.types.Depsgraph.html and the RNA descriptions
in 5.2.

- `dg = bpy.context.evaluated_depsgraph_get()` then `ob_eval = ob.evaluated_get(dg)`. The 5.2
  description: `evaluated_get` returns the evaluated ID but "does not ensure the dependency
  graph is fully evaluated". Call `bpy.context.view_layer.update()` after moving things if you
  then read evaluated positions.
- Curves, modifiers and text become a mesh only after evaluation. Persistent mesh:
  `bpy.data.meshes.new_from_object(ob_eval)` (5.2 parameters: `object`,
  `preserve_all_data_layers`, `depsgraph`). Temporary: `ob_eval.to_mesh()` then
  `to_mesh_clear()`; the docs warn that result "cannot be used by objects from the main
  database".
- `duck.py` `foot_mesh()` uses exactly this: a 2D bezier curve with `extrude` and
  `bevel_depth`, evaluated, then `new_from_object`, then the temporary curve object removed.
- `Object.ray_cast(origin, direction, distance=..., depsgraph=...)` casts "onto evaluated
  geometry, **in object space**" (5.2 description). Convert world points with
  `ob.matrix_world.inverted() @ p` unless the object's matrix is identity.

## mathutils transform gotchas

Source: https://docs.blender.org/api/current/mathutils.html, checked against 5.2 docstrings.

- `Matrix.LocRotScale(location, rotation, scale)`: rotation may be a **3x3 Matrix, Quaternion,
  or Euler**, or None; any argument may be None. Verified in 5.2: an `Euler` is accepted, and a
  4x4 raises an "inappropriate rotation matrix size" error asking for 3x3; pass `m.to_3x3()`.
- Compose with `@`, applied right to left: `T @ R @ S` scales first, then rotates, then
  translates. `duck.py` builds `Matrix.Translation(c) @ euler.to_matrix().to_4x4() @ Matrix.Diagonal((*radii, 1))`.
- `Matrix.Diagonal` needs 4 values for a 4x4 (hence the trailing `1`).
- `Vector.to_track_quat(track, up)` with `track` in `X Y Z -X -Y -Z` and `up` in `X Y Z`. A
  camera looks down its local `-Z` with `Y` up, so aim with
  `(target - cam.location).to_track_quat('-Z', 'Y').to_euler()`.
- `matrix_world` is stale until the depsgraph updates. Verified: after `ob.location = (1,0,0)`,
  `ob.matrix_world.translation` still reads `(0,0,0)` until `bpy.context.view_layer.update()`.
  Update between a write and any dependent read (our foot placement does).
- Parenting without a jump: set `child.parent = p` then
  `child.matrix_parent_inverse = p.matrix_world.inverted()`.

## Crashes and stale references

Source: https://docs.blender.org/api/current/info_gotchas_crashes.html

- "Do not keep direct references to Blender data (of any kind) when modifying the container of
  that data." Adding many items can reallocate a collection and invalidate earlier references.
  Removing an object you still hold a reference to and then touching it can crash.
- After `read_factory_settings`, every reference from before it is dead. Rebuild caches (our
  `_mats` material cache is module level and survives only because each process renders one
  pose).

## numpy, scipy and the split with system Python

- Bundled numpy 2.3.4 is importable inside Blender (verified). **scipy is not bundled**
  (verified `ImportError`). That is why inking runs in system Python (`render.py`) and Blender
  only writes PNGs. Do not `pip install` into Blender's Python for this pipeline.
- For bulk vertex reads inside Blender, `mesh.vertices.foreach_get('co', arr)` with a numpy
  float32 array is the fast path (verified in 5.2; API `bpy_prop_collection.foreach_get`,
  https://docs.blender.org/api/current/bpy.types.bpy_prop_collection.html).

## Determinism

- Verified: two EEVEE renders of the same script, same build, same machine, are byte-identical
  (dither on or off). Unverified across GPUs or Blender versions; expect differences there.
- Use `--factory-startup` so user preferences and add-ons never leak in.
- Cycles has `scene.cycles.seed` and `use_animated_seed` (present in 5.2); EEVEE has no seed.

## Windows paths and quoting

- Pass paths as separate `subprocess.run([...])` list items; never build a shell string.
- In Git Bash, `$LOCALAPPDATA/Programs/blender/blender.exe` works; MSYS rewrites arguments that
  look like POSIX paths, so pass Windows paths to Blender as `C:\...` or `C:/...`.
- `--python-expr` in PowerShell: wrap the expression in single quotes so `$` is literal; in
  bash, use double quotes and single quotes inside Python.
- `str(Path)` works for `scene.render.filepath`. A leading `//` means relative to the .blend
  (unverified how it resolves with no .blend loaded), so always pass absolute paths.
- Blender prints its banner, render progress and `Blender quit` to stdout; filter by your own
  prefix (`print('RESULT', ...)`) when parsing.
