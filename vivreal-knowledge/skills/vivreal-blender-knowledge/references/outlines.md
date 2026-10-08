# Outlines: four methods compared

What the duck needs: one constant line width (`line_px`) around every visible part boundary,
including where parts **interpenetrate** (wings into the body, chin into the bandana, beak into
the head), no line inside a "line group" (two-tone beak, VR decal on the bandana, eyes on the
head), working on **zero-thickness sheets** (the bandana), headless.

All four were checked on Blender 5.2.2 LTS on 2026-10-08. Test scene: an orange sphere plus
either a flat plane or a second sphere pushed into it, EEVEE, ortho camera, 400 px. Docs read via
the Wayback Machine; canonical URLs cited.

## Summary

| Method | Sheets | Interpenetration lines | Line groups | Width control | Verdict |
|---|---|---|---|---|---|
| Freestyle | Yes (Border edge type) | **No** | Coarse (collections, face marks) | Pixels (Absolute) or scaled to 480 px (Relative) | Wrong for the duck |
| Line Art (GP modifier) | Partial (Loose, Contour) | **Yes** (Intersections) | Collection intersection masks, Line Art Usage | World units (`radius`), measure it | Viable alternative |
| Inverted hull | **No** | Only where a hull rim is visible | Per object | World units along normals | Abandoned |
| ID pass plus edge inking (ours) | Yes | **Yes** | Exact (`LINE_GROUPS`) | Exact pixels | Keep |

## 1. Freestyle

- Still present in 5.2 (verified): `scene.render.use_freestyle`, `render.line_thickness_mode`
  (`ABSOLUTE`, `RELATIVE`), `render.line_thickness`, `view_layer.freestyle_settings.linesets`,
  and it renders with EEVEE in background mode (verified).
- Manual, Introduction (https://docs.blender.org/manual/en/latest/render/freestyle/introduction.html):
  "an edge/line-based non-photorealistic (NPR) rendering engine. It relies on mesh data and
  Z-depth information to draw lines on selected edge types." Known limitations: "Highly memory
  demanding", "Only faced mesh objects are supported", and **"No edges at face intersections are
  detected yet."**
- Thickness modes, manual, Render Properties
  (https://docs.blender.org/manual/en/latest/render/freestyle/render.html): **Absolute** is "a
  user-specified number of pixels"; **Relative** scales the unit thickness "by the proportion of
  the present vertical image resolution to 480 pixels" (1.0 at 480 px, 2.0 at 960 px). Measured:
  a line style thickness of 6 in Absolute mode drew a 6 px line.
- Edge types, manual, Line Set
  (https://docs.blender.org/manual/en/latest/render/freestyle/view_layer/line_set.html):
  Silhouette "cannot render open mesh objects like open cylinders and flat planes"; **Border**
  "shows open mesh edges, i.e. edges that belong to only one face ... a plane is open all
  around"; Contour separates an object "from other objects behind it, or the scene background";
  External Contour only from the background.
- Measured: Freestyle outlined a flat plane cleanly (Silhouette plus Border). On two
  interpenetrating spheres it drew **no line along the intersection curve**, so the inner edge of
  the smaller sphere was missing. That one gap is every wing, the chin and the beak on the duck.
- Script gotcha (verified): after `read_factory_settings(use_empty=True)` the default line set
  has no line style. `ls.linestyle = bpy.data.linestyles.new('ink')`.
- Use Freestyle when: models do not interpenetrate, you want stylised strokes (taper, noise),
  or a resolution-proportional line (Relative).

## 2. Grease Pencil Line Art modifier

- In 5.2 Line Art is a regular object modifier on a Grease Pencil v3 object (verified: type
  `LINEART` in `object.modifiers.new`, class `GreasePencilLineartModifier`). Since 4.3, "Grease
  Pencil modifiers are now regular modifiers" (`object.grease_pencil_modifiers` became
  `object.modifiers`, type prefix `GP_` became `GREASE_PENCIL_`), migration guide:
  https://developer.blender.org/docs/release_notes/4.3/grease_pencil_migration/
- Manual (https://docs.blender.org/manual/en/latest/grease_pencil/modifiers/generate/line_art.html):
  needs an active camera; only camera-visible lines are generated; "each Line Art modifier will
  run the entire occlusion calculation for itself" unless Use Cache is on. Edge types include
  Contour (with Silhouette and Individual Silhouette), Crease, **Intersections** ("Generate
  strokes where lines intersect between faces"), Loose, Light Contour, Cast Shadow.
- **Intersection control**: collections have `lineart_use_intersection_mask`,
  `lineart_intersection_mask`, and the modifier has `use_intersection_mask` and
  `use_intersection_match` (verified). Manual: "Allows you to select edges that intersect between
  two collections." That is how to suppress the beak-to-beak-top line: put both in one
  collection and mask. Objects have `lineart.usage` (verified).
- **Width**: 4.3 made strokes "always in World Space thickness mode", "Screen Space" was removed
  (https://developer.blender.org/docs/release_notes/4.3/grease_pencil/). The modifier property is
  `radius` in 5.2 (verified). In an ortho render, world width is a constant pixel width for a
  fixed `ortho_scale`, but the mapping is **not** the simple arithmetic: `radius = 0.03` at
  `ortho_scale = 3.4`, 400 px drew about 3 to 4 px, not 7. Measure a test render and scale.
- Measured: with `use_intersection = True` Line Art **did** draw the intersection curve between
  the two spheres. On a flat plane it drew only a faint partial edge; enable Loose or Border-like
  types and test before relying on it for sheets.
- Minimal headless setup (verified in 5.2):
  ```python
  gpd = bpy.data.grease_pencils.new('lines'); gpo = bpy.data.objects.new('lines', gpd)
  sc.collection.objects.link(gpo); gpd.layers.new('Lines')
  ink = bpy.data.materials.new('ink'); bpy.data.materials.create_gpencil_data(ink)
  ink.grease_pencil.color = (0, 0, 0, 1); gpd.materials.append(ink)
  md = gpo.modifiers.new('LA', 'LINEART'); md.source_type = 'SCENE'
  md.target_layer = 'Lines'; md.target_material = ink; md.radius = 0.03; md.use_intersection = True
  ```
- Failure modes: every Line Art modifier recomputes occlusion for the whole scene (manual), lines
  are strokes with ends and joins rather than a uniform band (chaining settings matter), and
  intersection lines appear between parts you wanted grouped unless masked. Unverified for 5.x:
  whether the stroke colour is affected by the view transform; set Standard anyway.

## 3. Inverted hull

- Technique (community, BNPR: https://bnpr.gitbook.io/bnpr/outline/inverse-hull-method): a
  copy of the mesh pushed out along its normals (Solidify with Flip, or bmesh), normals
  reversed, an emission black material with **Backface Culling** on. From the camera the hull's
  front faces now point away and are culled; only the far side of the hull shows, peeking out
  around the silhouette as a rim.
- Manual, Solidify (https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/solidify.html):
  Flip Normals "Reverse the normals of all geometry", Material Offset picks another slot for the
  new shell, and "The modifier thickness is calculated using local vertex coordinates" (non
  uniform object scale skews the line).
- EEVEE backface culling, manual, material settings
  (https://docs.blender.org/manual/en/latest/render/eevee/material_settings.html): "Backface
  Culling hides the back side of faces", separate toggles for Camera and Shadow. Property
  `material.use_backface_culling`.
- **Why it fails on sheets** (derived from how it works, matches what we saw): a sheet has no
  far side. Offsetting a plane along its normal yields a parallel plane; after flipping, it is
  either entirely culled (no line at all) or, seen from the other side, entirely visible (a black
  sheet). No rim exists because the rim comes from a closed surface curving away from the
  camera. Our `thicken()` (bmesh solidify) gave the bandana volume, but thin volumes give
  uneven rims.
- Other failure modes: width is in world units along normals, so it thins where the surface
  faces the camera obliquely and changes with perspective and object scale; no line at
  interpenetrations unless the hull happens to poke through; hard corners split unless normals
  are smoothed; doubles geometry.
- Use when: closed, well-separated meshes and a real-time viewport look are needed.

## 4. ID pass plus edge inking (our choice)

How it works (`duck.py render_ids`, `render.py ink`):
1. Second render with every mesh given a flat emission colour `R = group_index * 4`, where
   parts in one entry of `LINE_GROUPS` share an index. `filter_size = 0`,
   `taa_render_samples = 1` so no colour blends across edges.
2. In system Python: decode `label = round(R / 4)` where alpha > 127, else 0 (background).
3. Absorb islands smaller than `0.00015 * pixels` into the surrounding label (intersection
   slivers would otherwise each get a ring of ink).
4. Edge where a pixel's label differs from its right or lower neighbour.
5. Dilate edges with a disk of radius `line_px * SS / 2`, paint ink colour into the colour pass.
6. Downsample 2x with LANCZOS for smooth lines.

Why it wins for the duck:
- Interpenetration curves are just label changes, so they are inked like any silhouette.
- Sheets and closed meshes are treated the same.
- Width is exactly `line_px` pixels everywhere, independent of depth, scale or normals.
- Line groups are an exact list, not a mask or mark system.
- Fast: numpy and scipy, no Blender line engine.

Limits and how to handle them:
- No interior detail lines (creases, a wing fold) unless that region is a separate group or a
  separate object. Add a part, do not hand-draw.
- Line is centred on the boundary, so half the width eats into each part. Small parts (the eye
  at 0.125 head radii) can be swallowed; check eyes at the final size.
- Maximum 63 groups with step 4 (`assert len(groups) < 60`). Set `dither_intensity = 0` and the
  step could be 1 (verified exact IDs), but step 4 is harmless.
- The ID and colour passes must match pixel for pixel: same camera, resolution, and
  `film_transparent`. Never change geometry between them.
- Any anti-aliasing in the ID pass (filter size above 0, TAA samples above 1) creates blended
  values that decode to the wrong group and draw phantom lines.
- `absorb_specks` can also eat a genuine small part; if a part vanishes, lower `min_px`.

## Decision rule

- Duck or any interpenetrating model with exact width: **ID-pass inking**.
- Need lines but no Python image step, and parts interpenetrate: **Line Art** with Intersections
  and collection masks.
- Separate closed objects with stylised strokes: **Freestyle**.
- Real-time viewport look on closed meshes only: **inverted hull**.
