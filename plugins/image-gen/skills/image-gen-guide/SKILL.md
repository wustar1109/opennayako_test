---
name: image-gen-guide
description: Use before image or video generation. Covers tool parameters, non-blocking generation, provider routing, and result handling.
---

# Media Generation Tool Guide

Image and video generation is asynchronous. The tool returns a card immediately; generated media is registered into the current session when the background task completes.

## Non-Blocking Workflow

1. Call the generation tool with a complete prompt and parameters.
2. Tell the user the task has started and the result will appear in the card automatically.
3. Continue the conversation. Do not wait for completion.
4. When a background result notification arrives, summarize the result naturally.

## `image-gen_generate-image`

Use for text-to-image, image-to-image, reference redesign, and style transfer.

Parameters:

- `prompt`: required. Complete image prompt.
- `count`: number of images, 1 to 9.
- `image`: local reference image path for image-to-image or editing.
- `ratio`: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, or `21:9`.
- `resolution`: `2k` or `4k` when supported.
- `model`: provider-specific model id or version.
- `negative_prompt`: optional negative prompt, mainly used by workflow providers such as ComfyUI.
- `provider`: optional provider id. Use `comfyui` when the user asks for ComfyUI, local workflow, or z-image.

## `image-gen_generate-video`

Use for text-to-video and image-to-video.

Parameters:

- `prompt`: required. Complete video prompt with camera motion and temporal changes.
- `image`: local reference image path for image-to-video.
- `duration`: seconds.
- `ratio`: target aspect ratio.
- `model`: provider-specific model id or version.
- `provider`: optional provider id.

## Routing

- Plain image request: `image-gen_generate-image`.
- Edit or transform an attached image: `image-gen_generate-image` with `image`.
- Generate multiple variations: `image-gen_generate-image` with `count`.
- Animate an image: `image-gen_generate-video` with `image`.
- ComfyUI or workflow-backed generation: `image-gen_generate-image` with `provider: "comfyui"`.
- Image analysis or discussion only: do not call generation.

## Prompt Quality

Before calling generation, make the prompt explicit enough for a model:

- subject, scene, composition, shot, lighting, material, style, atmosphere
- use case and aspect ratio
- quality constraints and forbidden elements
- exact quoted text only when the user asked for text in the image

Avoid passing a vague one-line request directly when the user expects a designed result.
