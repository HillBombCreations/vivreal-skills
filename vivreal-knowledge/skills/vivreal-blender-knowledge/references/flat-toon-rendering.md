# Flat toon rendering

Goal: every part renders as one exact brand colour, no lighting, no shadows, transparent
background, crisp edges, framed by an orthographic camera. Verified on Blender 5.2.2 LTS by test
renders on 2026-10-08 (sampled pixel values quoted below). Docs read via the Wayback Machine;
canonical URLs cited.

## Recipe (what `duck.py` does, plus the one setting it is missing)

```python
sc.render.engine = 'BLENDER_EEVEE'          # 5.x id; see version-notes.md
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
sc.render.film_transparent = True
sc.render.dither_intensity = 0.0            # MISSING from duck.py today, see below
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
# material: Emission (strength 1.0, colour = linear value of the sRGB hex) -> Material Output Surface
```

## Flat colour: Emission plus the Standard view transform

- Emission node, manual: for materials "a value of 1.0 will ensure that the object in the image
  has the exact same color as the Color input, i.e. make it 'shadeless'."
  https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/emission.html
- The view transform then maps scene linear to the display. Manual, Displays and Views
  (https://docs.blender.org/manual/en/latest/render/color_management/displays_views.html):
  - **Standard**: "Does no extra conversion besides the conversion for the display. Often used
    for non-photorealistic results."
  - **AgX**: "A tone mapping transform ... desaturates highly exposed colors to mimic film's
    natural response to light."
  - **Filmic**: "deprecated and is superseded by AgX".
  - **Khronos PBR Neutral**: aimed at matching base colour under grey lighting; still a tone
    map, not identity.
  - **Raw**: "Intended for inspecting the image but not for final export."
- **Factory default is AgX** (verified: `view_transform` reads `AgX` after
  `read_factory_settings`). Measured on an Emission sphere fed linear `#FD8304`:
  - Standard: `(253,131,4)`, exactly `#FD8304`.
  - AgX: `(210,127,55)`, a visibly different orange.
  - Navy `#00287C` under Standard: `(0,40,124)`, exact.
- So: any tone-mapping transform (AgX, Filmic, ACES, Khronos) shifts brand colours. Always set
  `Standard` and `look = 'None'`. Keep exposure 0 and gamma 1 (the defaults).

## sRGB hex to linear

Blender colour inputs on shader nodes are scene linear. The display conversion under Standard
applies the sRGB transfer function, so feed the inverse to land on the exact hex:

```python
def srgb_to_linear(hex_):
    out = []
    for i in (1, 3, 5):
        c = int(hex_[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)
```

This is the standard IEC 61966-2-1 sRGB decode, the same function `duck.py` uses. The round trip
is exact to 8 bits (verified by the pixel values above). The same applies to Workbench object
colours: an Object colour of `4/255` rendered as `34` in Workbench, because it was treated as
linear (verified).

## Dither: the hidden noise

- `render.dither_intensity` (5.2 description: "Amount of dithering noise added to the rendered
  image to break up banding"); default **1.0**. Manual, Post Processing:
  https://docs.blender.org/manual/en/latest/render/output/properties/post_processing.html
- Measured: with dither 1.0 the flat orange sphere had 63 distinct opaque colours, with about
  20% of pixels moved by plus or minus 1 (`(252,130,3)`, `(254,132,5)`). With 0 the interior was
  exactly one value; the only other colours were anti-aliased edge pixels.
- Dither also writes `(1,1,1,0)` into fully transparent pixels.
- Set `dither_intensity = 0` for flat art (cleaner vector tracing, exact hex) and always for an
  ID pass. Our ID decode survives dither only because it uses a step of 4 per group and rounds.

## Transparent film

- Film panel, manual: "Transparent: Render the background transparent, for compositing the image
  over another background after rendering."
  https://docs.blender.org/manual/en/latest/render/eevee/render_settings/film.html
- Save as PNG RGBA. Edge pixels carry partial alpha; PNG stores straight (unassociated) alpha.
  When compositing in PIL use `alpha_composite`, which expects straight alpha.

## Engine choice for flat art

| Engine | Flat colour | Notes |
|---|---|---|
| **EEVEE** (`BLENDER_EEVEE`) | Emission node, exact under Standard | Our choice. Fast (about 1.2 s per 400 px test frame on the Arc iGPU), supports image textures with alpha (the VR decal), Freestyle works on it in 5.2 (verified). |
| **Workbench** (`BLENDER_WORKBENCH`) | `display.shading.light = 'FLAT'` with `color_type` `OBJECT` or `MATERIAL` | Does not evaluate shader nodes: `MATERIAL` shows the material's viewport `diffuse_color` (5.2 enum description "Show material color"), so no Emission and no node-based decal. Has `display.render_aa` with `OFF`, `FXAA`, `5` to `32` samples (verified). A workable ID pass: Object colours plus `render_aa = 'OFF'` plus dither 0 gave exactly one value per object (verified). |
| **Cycles** (`CYCLES`) | Emission works | Path tracing; slow, noisy at low samples, and gains nothing for unlit flat colour. Use only if a feature is Cycles only. |

## Anti-aliasing and filter size

- EEVEE uses temporal anti-aliasing: "TAA is sample based so the more samples the more aliasing
  is reduced" (https://docs.blender.org/manual/en/latest/render/eevee/render_settings/sampling.html).
  Render samples: `scene.eevee.taa_render_samples`.
- Film Filter Size, manual: "lower values give more crisp renders, higher values are softer and
  reduce aliasing" (Film page above). Property `scene.render.filter_size`, default 1.5 px
  (verified).
- **Colour pass**: keep defaults (filter 1.5, TAA samples default) for smooth edges, render at 2x
  and downsample with LANCZOS (what `render.py` does).
- **ID pass**: `filter_size = 0`, `taa_render_samples = 1`, `dither_intensity = 0`. Verified:
  exactly one RGB value per object, binary alpha. Any other setting blends neighbouring IDs into
  new values that decode to a wrong group.
- Supersampling is cheaper than more TAA samples for line art because the inking step works on
  the 2x ID image anyway.

## No shadows, no lights

- An Emission-only material needs no lights and receives no shading, so nothing casts or shows
  shadows. Keep the scene free of lights and set no world (factory empty scene has none).
- EEVEE 5.x shadow options (`eevee.use_shadows`, `light.use_shadow`) are irrelevant without
  lights. Do not add a light "to see the shape"; that is what the outline is for.

## Orthographic camera framing

- Manual, Cameras (https://docs.blender.org/manual/en/latest/render/cameras.html):
  "With Orthographic perspective objects always appear at their actual size, regardless of
  distance." "Orthographic Scale ... controls the apparent size of objects projected on the
  image. Note that this is effectively the only setting which applies to orthographic
  perspective."
- Sensor Fit `AUTO` (default, verified) "Calculates a square sensor size based on the larger of
  the Resolution dimensions" (Cameras page), so `ortho_scale` spans the larger image dimension;
  on our square renders it is the visible width and height in scene units. `duck.py` uses
  `ortho_scale = top * 1.22` where `top` is the head top, so the duck fills about 82% of the
  frame height.
- Camera distance does not change size in ortho; it only has to sit outside the model and inside
  `clip_end` (camera data default 1000 in 5.2, verified). `duck.py` places it 30 units out along the azimuth and elevation.
- Aim: `cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()`.
- Elevation changes how much of the top of the feet and the head you see. Azimuth turns the
  duck. Keep the target at half the duck's height so poses frame consistently.
- Constant line width across poses depends on constant `ortho_scale` relative to the duck. If a
  pose changes `top` (sitting versus standing), the duck's scale in pixels changes too; decide
  deliberately whether poses share one scale.

## Alpha-textured decals in EEVEE

- `duck.py` mixes an Image Texture's alpha between Transparent BSDF and Emission and sets
  `material.surface_render_method = 'BLENDED'`. The 5.2 description of BLENDED: "Allows for
  colored transparency, but incompatible with render passes and raytracing." DITHERED is
  "grayscale hashed transparency" and would leave noise on the decal edge.
- Manual, material settings:
  https://docs.blender.org/manual/en/latest/render/eevee/material_settings.html
  Blended surfaces have a sorting problem; `use_transparency_overlap` off renders only the
  front-most fragments.
- Interpolation `Cubic` on the image texture keeps the monogram smooth when magnified.
