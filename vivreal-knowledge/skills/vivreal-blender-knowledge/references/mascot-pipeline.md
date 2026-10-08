# The Vivreal duck pipeline

Source of truth: `vivreal-hq/brand/mascot/`. Read `README.md` (rules), `model/poses.json` (every
number), `model/duck.py` (builds and renders), `model/render.py` (drives Blender and inks). This
file describes them as of 2026-10-08; if they disagree, the files win and this file is stale.

## The owner rules (from `brand/mascot/README.md` and the mascot-artist agent)

- **One duck.** Every pose is the same character from a different angle or doing a different
  thing. Parts never change between poses, only angle, size and position.
- **Same character 1:1 across poses.** Proportions, beak, eyes, bandana, VR monogram and foot
  come from the model, never from a new drawing.
- **Perspective must match the pose.** A standing duck's feet are flat on the ground (no soles);
  a sitting duck with legs out shows its soles. Pose the 3D model and let the camera decide;
  never fake an angle in 2D.
- **One foot.** `parts/foot.svg` is THE foot. The 3D model extrudes that exact bezier path.
- **No shadows.** Flat colours, one outline weight, transparent background. (`poses.json` at the
  mascot root also has `"shadows": false` for the 2D build.)
- **No em or en dashes** in anything a person reads (`brand/voice.md`).
- Colours live in `poses.json` `colours`. Do not hand-type hex elsewhere.

## End to end

```
model/poses.json --> blender -b --factory-startup -P model/duck.py -- <pose> <raw.png> <px>
                       | build(pose): procedural duck from numbers
                       | render(): colour pass  -> .work/model-<pose>-raw.png
                       | render_ids(): ID pass  -> .work/model-<pose>-raw-id.png
                       v
model/render.py (system Python, numpy + scipy + PIL)
                       | ink(): edges between ID labels, disk dilation, paint, LANCZOS 2x down
                       v
                 .work/model-<pose>.png  (1254 px)  --> build.py trace to SVG (see gap below)
```

`python brand/mascot/model/render.py [pose ...]` runs all of it; with no args it renders every
pose in `model/poses.json`. It renders at `SIZE * SS` = 2508 px and inks at that size.

## How the model is built (`duck.py build`)

Units: 1 = head radius. Ground is z = 0. The duck faces **-y** (toward the camera at azimuth 0).

- **Body**: UV sphere (64 x 40) scaled to `body.rx/ry/rz`, with a `pear` shape function that
  widens the bottom. Transforms are baked into the vertices with `bm.transform`, so every object
  has an identity `matrix_world`.
- **Head group**: an empty `neck` pivot; head, eyes, beak and beak top are parented to it, so
  `pose.head.yaw/pitch` turns them together. The neck rotation is applied after the bandana is
  draped.
- **Eyes**: flattened ellipsoids placed on the head surface; **beak**: two ellipsoids (orange and
  `beak_top`) tilted 8 degrees.
- **Bandana**: a 24 x 24 grid in the xz plane pinched into a downward triangle, then
  `project_front` moves each vertex onto the nearest body or head surface along +y with
  `ray_cast` (lift 0.07), then `thicken` solidifies it 0.05 backwards. Knot and tail are
  ellipsoids.
- **VR decal**: a grid with the `vr-decal.png` image (alpha) on an Emission and Transparent mix,
  `surface_render_method = 'BLENDED'`, projected onto the bandana's front with lift 0.012.
- **Wings**: `limb()` stretches a sphere from shoulder to tip (`wings.<rest|typing>`), x mirrored.
- **Feet**: `foot_mesh()` parses the single `d=` path of `parts/foot.svg` (must be `M` then
  cubic triples), builds a cyclic 2D bezier curve scaled by `foot_scale`, extrudes it 0.035 each
  side with bevel 0.02, evaluates it to a mesh with `new_from_object`. Each placement is
  `Translation(x, y) @ yaw about Z @ -tilt about X @ spin about Z`, then dropped so its lowest
  vertex sits at z = 0.005. Legs (cylinders) only when `lift > 0.05`.
- **Laptop prop**: beveled boxes plus a logo ellipsoid when `pose.prop == 'laptop'`.
- **Materials**: one Emission per colour, cached in `_mats`.

## How it renders (`duck.py render`, `render_ids`)

- Clean scene: `read_factory_settings(use_empty=True)`.
- Ortho camera at 30 units along azimuth and elevation, aimed at half the duck height,
  `ortho_scale = top * 1.22`.
- EEVEE (`BLENDER_EEVEE` on 5.x), `film_transparent`, `Standard`, look None, PNG RGBA.
- **ID pass**: every mesh gets a flat colour `#XX0000` with `XX = group * 4`; parts listed in
  `LINE_GROUPS` (beak_top to beak, vr to bandana, laptop_logo to laptop, both eyes to head) share
  a group so no line is drawn between them. `filter_size = 0`, `taa_render_samples = 1`.
- Depth and outline method: `outline_mode` in `model/poses.json` is `"edges"` (ID inking). The
  `"hull"` branch (inverted hull, `hull()`) is dead code kept from the failed first attempt; see
  `outlines.md` for why it failed on the bandana sheet.

## How it inks (`render.py ink`)

- Decode labels from the ID pass red channel (`round(R / 4)`), alpha 127 threshold.
- `absorb_specks`: islands under `0.00015 * pixels` (about 940 px at 2508) take the majority
  surrounding label. This removes slivers where parts interpenetrate.
- Edge where a label differs from its right or lower neighbour; dilate with a disk of radius
  `line_px * SS / 2`; paint `colours.outline`; LANCZOS down to 1254. So `line_px` (17) is the
  final line width in pixels at 1254.

## Hardening already in the scripts (fixed 2026-10-08, keep these)

1. **A crashed `duck.py` fails the build.** `render.py` passes `--python-exit-code 1` (without it a
   Python exception inside Blender exits 0) and deletes the two raw PNGs before rendering, so
   `ink()` can never read a previous run's images. Proven: a bad pose name exits 1.
2. **No dither.** `duck.py` sets `render.dither_intensity = 0`; brand colours come out exact
   (`#FD8304`, `#00287C`, `#FAFAFA` measured byte for byte on the raw render).
3. **`project_front` passes world coordinates to `ray_cast`**, which works in object space. It is
   correct only because the targets have identity transforms at that moment (baked meshes, neck
   not yet parented). If a target ever gets a non-identity `matrix_world`, transform the ray into
   its object space first. The docstring says so.

## Open gaps

1. **`build.py` does not consume model renders yet.** It traces the approved 2D drawings
   (`source/main.png`, `source/laptop.png`) via the root `poses.json`. Nothing wires
   `.work/model-<pose>.png` into `build.py`. Connect it when the owner approves the first model
   pose: a pose entry whose source is the model render, skipping foot replacement and shadow
   steps, then vtracer with defaults only (any option crashes vtracer on this machine's Python).
2. **`use_nodes` warning** on every material in 5.x; harmless until 6.0 (`version-notes.md`).

## Adding a pose

1. Add an entry under `poses` in `model/poses.json`: `camera.azimuth/elevation`, `lift` (0 for
   sitting), `head.yaw/pitch`, `wings` (a key of `character.wings`, add one if needed), `feet`
   (each `x`, `y`, `yaw`, optional `tilt` and `spin`), `prop` (null or a known prop).
2. If the pose needs a new part or behaviour, add it to `duck.py`, driven by a new key in
   `poses.json`. Never hard-code a number in `duck.py`. A new part that should not be outlined
   against its neighbour goes into `LINE_GROUPS`.
3. Render one pose: `python brand/mascot/model/render.py <pose>`.
4. Check perspective against the rule: feet flat when standing, soles visible only when the
   pose shows them; the camera elevation, not a 2D edit, decides what is visible.
5. Compose a side-by-side with the approved reference (`source/laptop.png`) in PIL and Read the
   image yourself before showing the owner.

## Iterating on owner feedback, piece by piece

- One note at a time: take the owner's note, map it to the smallest set of numbers (one part's
  keys in `poses.json`), change only those, re-render, show the side-by-side, name exactly what
  changed and what still looks off, ask for the next note.
- Shared parts change in `character` (all poses); pose-specific placement changes under
  `poses.<name>`. If a note is about "the duck" in general, it is almost always `character`.
- Check, every render: line weight constant, no specks, no part poking through another (lift the
  draped part or reposition), eyes not swallowed by the line, foot shape identical to
  `parts/foot.svg`, no shadow, transparent background.
- Keep each approved state: copy the PNG to a dated name in `.work/` before the next change, so
  a regression can be shown side by side.
- Commit only `brand/mascot/` paths and only when told to.
