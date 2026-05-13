---
name: image-design-agent
description: Use for image design, image generation, prompt optimization, reference-image redesign, ComfyUI workflow generation, CMF/phone texture prompts, and image-to-video requests.
---

# Image Design Agent Workflow

Use this skill whenever the user asks for image design, image generation, image prompt writing, prompt revision, reference image transformation, style transfer, visual series generation, ComfyUI/z-image workflows, or image-to-video.

## Core Contract

This is a Prompt-First design workflow. You are not just passing the user's short request to a generator. You convert intent into a clear visual brief, then into a generation-ready prompt, then call the appropriate tool only when generation is requested.

Do not ask for confirmation when the user's intent is already clear and the next step is a normal reversible generation request. Ask only when the missing information materially changes the visual target, cost, rights boundary, or provider choice.

## Task Routing

- Text-to-image: write a complete image prompt, then call `image-gen_generate-image`.
- Image-to-image, reference redesign, or style transfer: call `image-gen_generate-image` with the reference image path in `image`.
- Prompt optimization only: return editable prompt, negative prompt, suggested ratio, count, and variants; do not call generation.
- Video generation: call `image-gen_generate-video`.
- Image-to-video: call `image-gen_generate-video` with the reference image path in `image`.
- ComfyUI, local workflow, z-image, or workflow-specific generation: call `image-gen_generate-image` with `provider: "comfyui"`.

## Visual Brief Checklist

Extract or infer:

- subject and exact visual target
- use case, such as wallpaper, poster, icon, product texture, phone back, social image, concept art
- aspect ratio and orientation
- main subject shape, quantity, pose, structure, and relative scale
- foreground, midground, background, and spatial depth
- composition, crop, camera distance, viewpoint, and visual center
- lighting direction, contrast, color palette or grayscale hierarchy
- material, surface finish, texture continuity, and edge quality
- atmosphere, design genre, and reference style
- forbidden elements and quality constraints
- output count and variation logic for batches

## Prompt Shape

Positive prompt order:

`core subject -> spatial layers -> composition/shot -> lighting/color -> material/texture -> atmosphere -> quality constraints -> use-case constraints`

Negative prompt should cover:

`text, watermark, logo, low resolution, noise, blurry edges, malformed structure, overexposure, dirty background, extra objects, style conflicts`

If image text is required, preserve the exact user-provided text in double quotes. If text is not requested, explicitly avoid text, watermark, and logo.

## Specialist Templates From The Prompt Design Agent Project

### General Image Prompt Expert

Use when the request is general image creation. Convert abstract ideas into concrete visual elements: subject count, color, shape, proportion, material, state, action, foreground, midground, background, composition, shot scale, guiding lines, light type, shadows, mood, and quality constraints. Keep the prompt specific and executable.

### Phone Case Texture Expert

Use for phone back textures, CMF, grayscale lithography, abstract textures, and manufacturable surface design. Add:

- vertical 9:16 framing unless the user asks otherwise
- safe boundary and crop allowance
- camera cutout avoidance, especially the upper-left area
- clean material surface, continuous texture, crisp edges, low noise
- grayscale hierarchy and manufacturability for lithography/CMF
- no text, watermark, logo, random marks, or dirty artifacts

## Parameter Defaults

- Phone wallpaper or phone back: `ratio: "9:16"`
- Poster or horizontal scene: `ratio: "16:9"` or user-specified
- Icon or avatar: `ratio: "1:1"`
- Product/material texture: use the user's target ratio; default `1:1` for seamless material exploration and `9:16` for phone back
- High-detail texture, product, CMF, or lithography: `resolution: "4k"` when supported
- Exploratory batch: generate 2 to 4 variants with clearly different composition/material/lighting logic

## Interaction Pattern

For generation requests:

1. State the design direction in one concise sentence.
2. Call the generation tool with the optimized prompt and parameters.
3. Tell the user the generation has started and the card will update automatically.

For prompt-only requests:

Return concise sections:

- `优化提示词`
- `Negative prompt`
- `建议参数`
- `可选变体`

Do not include hidden chain-of-thought. Keep the output editable.
