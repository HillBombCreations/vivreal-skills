# Version notes: 4.2 to 5.2 changes that break scripts

Installed and verified: **Blender 5.2.2 LTS** (built 2026-09-15). Release notes read via the
Wayback Machine from developer.blender.org (direct fetches return 403 here). Each item says what
the notes say, then what 5.2 actually does when run.

## The EEVEE engine id (changed twice)

- 4.2: "EEVEE identifier has been changed to BLENDER_EEVEE_NEXT"
  (https://developer.blender.org/docs/release_notes/4.2/python_api/, Render Settings).
- 5.0: "EEVEE's render engine identifier was changed from BLENDER_EEVEE_NEXT to BLENDER_EEVEE."
  (https://developer.blender.org/docs/release_notes/5.0/python_api/, Render).
- 5.2 verified: engine items are `BLENDER_EEVEE`, `BLENDER_WORKBENCH`, `CYCLES`; assigning
  `BLENDER_EEVEE_NEXT` raises `TypeError`.
- Portable pattern (what `duck.py` does):
  ```python
  items = [i.identifier for i in sc.render.bl_rna.properties['engine'].enum_items]
  sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in items else 'BLENDER_EEVEE'
  ```
  Static enum listing worked for `engine` in 5.2; if a build ever lists fewer items than it
  accepts, fall back to try and except on assignment.

## Material blend settings (4.2)

Source: 4.2 Python API notes, "EEVEE (pre 4.2) specific Material settings have been deprecated
or aliased where possible":
- `Material.blend_method` becomes `Material.surface_render_method`. "'Opaque' and 'Alpha Clip'
  maps to deferred." 5.2 values (verified): `DITHERED` (deferred) and `BLENDED` (forward).
- `show_transparent_back` renamed `use_transparency_overlap`.
- `use_screen_refraction` renamed `use_raytrace_refraction`.
- `shadow_cube_size`, `shadow_cascade_size` unused, to be removed.
- 5.2 verified: `blend_method` still exists, described as "(Deprecated: use
  'surface_render_method')". Do not write new code against it.
- 4.3 removed legacy EEVEE properties including `Material.shadow_method`, light contact shadow
  settings, and several `Scene.eevee` GI and SSR options
  (https://developer.blender.org/docs/release_notes/4.3/python_api/, EEVEE).
- 4.2 also deprecated EEVEE Bloom (`scene.eevee.use_bloom` and friends); use the compositor.
- 5.0: `use_gtao` and `gtao_quality` removed (did nothing since 4.2); `gtao_distance` moved to
  `view_layer.eevee.ambient_occlusion_distance`.

## `use_nodes` deprecation (5.0)

Source: 5.0 Python API notes, Deprecation, Shading:
- "material.use_nodes is deprecated and will be removed in 6.0. Currently it always returns True
  and setting it has no effect." A new material already has a default node tree.
- Same for `world.use_nodes`.
- `scene.use_nodes` is deprecated too, and **`scene.node_tree` was removed**; the compositor tree
  is `scene.compositing_node_group` (assign a node group you create).
- 5.2 verified: reading or writing `Material.use_nodes` prints `DeprecationWarning: 'Material.use_nodes'
  is expected to be removed in Blender 6.0`; `material.node_tree` exists on a fresh material.
- Script fix: drop the `use_nodes = True` line on 5.x. `duck.py` wraps it in
  `try/except AttributeError`, which keeps 6.0 working but does not silence the 5.x warning;
  guard with `if bpy.app.version < (5, 0, 0):` instead.

## Grease Pencil v3 (4.3)

Sources: https://developer.blender.org/docs/release_notes/4.3/grease_pencil/ and the migration
guide https://developer.blender.org/docs/release_notes/4.3/grease_pencil_migration/
- "Grease Pencil was rewritten"; "The Python API for Grease Pencil was rewritten".
- Old files are converted on load.
- Modifiers: `object.grease_pencil_modifiers` became `object.modifiers`, `bpy.types.GpencilModifier`
  became `bpy.types.Modifier`, type prefix `GP_*` became `GREASE_PENCIL_*`. Line Art's type is
  `LINEART` (verified in 5.2).
- Strokes are "always in World Space thickness mode"; Screen Space was removed. A geometry nodes
  group can emulate it.
- The layer "Thickness Scale" (`pixel_factor`) no longer exists.
- Stroke data lives on `frame.drawing` as attributes. `drawing.strokes` is a compatibility API;
  holding a stroke reference across `add_strokes` or `resize_strokes` is undefined behaviour.
- 5.2 verified: `bpy.data.grease_pencils` is the data collection, object type `GREASEPENCIL`,
  `bpy.ops.object.grease_pencil_add` takes `EMPTY`, `STROKE`, `MONKEY`, `LINEART_SCENE`,
  `LINEART_COLLECTION`, `LINEART_OBJECT`. Line Art width property is `radius`.

## Other 5.0 removals and changes that touch render scripts

Source: 5.0 Python API notes.
- **ImageFormatSettings now has `media_type`**, "that needs to be set to an appropriate type
  before setting the actual file_format member." `duck.py` sets `file_format = 'PNG'` without
  it and works in 5.2 because the default is `media_type = 'IMAGE'` (verified; items `IMAGE`,
  `MULTI_LAYER_IMAGE`, `VIDEO`). Set `media_type` first if you ever write video or multi-layer
  EXR.
- Render passes renamed to plain words, for example `'IndexMA'` to `'Material Index'`, `'Z'` to
  `'Depth'`. Compositor scripts keyed on old pass names break.
- The deprecated BGL module was removed (use `gpu`). `Image.bindcode` removed.
- Scene custom-property style access to add-on settings changed: `bpy.context.scene['cycles']`
  "will not give access to Cycles' scene settings"; use `scene.cycles`.
- Unused image texture filter properties removed (`filter_type`, `use_mipmap` and others).

## 5.1 and 5.2

- 5.1 Python notes (https://developer.blender.org/docs/release_notes/5.1/python_api/): nothing
  found that touches our pipeline (UI list, sculpt operator, sequencer strip time renames).
- 5.2 Python notes (https://developer.blender.org/docs/release_notes/5.2/python_api/): Geometry
  Nodes modifier inputs became real RNA properties instead of custom properties; a richer
  image-buffer API; IDProperty nesting capped at 1024. Nothing that touches our pipeline.

## Things that did NOT change (verified in 5.2)

- Freestyle still exists and renders with EEVEE headless: `render.use_freestyle`,
  `render.line_thickness_mode` (`ABSOLUTE`, `RELATIVE`), `view_layer.freestyle_settings`.
- `bpy.data.meshes.new_from_object`, `Object.evaluated_get`, `Object.to_mesh`,
  `Object.ray_cast`, `bmesh.ops.*` used by `duck.py`.
- `scene.eevee.taa_render_samples`, `render.filter_size`, `render.film_transparent`,
  `render.dither_intensity`.
- View transforms `Standard`, `AgX`, `Filmic` (deprecated in the manual), `Khronos PBR Neutral`,
  `Raw`, `False Color` all accepted. Factory default is `AgX`.
- `Matrix.LocRotScale` accepts Matrix 3x3, Quaternion or Euler.

## Unverified for 5.x

- Whether Freestyle and Line Art produce identical results on other GPUs.
- Any 6.0 behaviour; only the deprecation warnings are known.
