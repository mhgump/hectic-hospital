---
name: scenario-api
description: Generate images, videos, 3D models, audio, and more using the Scenario API. Use when the user asks about Scenario, AI image generation, video generation, image editing, upscaling, background removal, or any creative AI asset generation via API.
---

# Scenario API

Scenario is a unified creative AI API that provides access to 100+ models for image generation, video generation, image editing, upscaling, 3D models, audio, and utility tools -- all through a single API with consistent patterns.

## Authentication & Setup

All requests use **Basic Auth** with API key + secret.

### Step 1: Get credentials

Your API key and secret will be provided to you by the team organizer. **Do not create your own key.**

Once you have the credentials, add them to a `.env` file in the project root:

```
VITE_SCENARIO_API_KEY=your_api_key_here
VITE_SCENARIO_API_SECRET=your_api_secret_here
```

A template is also available at `.claude/skills/scenario-api/.env.example`.

**Important**: The `.env` file is in `.gitignore` — never commit API keys to the repo.

### Step 2: Build auth headers

```typescript
// TypeScript / JavaScript
const apiKey = process.env.SCENARIO_API_KEY;    // or import.meta.env.VITE_SCENARIO_API_KEY
const apiSecret = process.env.SCENARIO_API_SECRET;
const credentials = btoa(`${apiKey}:${apiSecret}`);
const headers = {
  'Authorization': `Basic ${credentials}`,
  'Content-Type': 'application/json',
};
```

```python
# Python
import os, requests
from requests.auth import HTTPBasicAuth

auth = HTTPBasicAuth(
    os.environ["SCENARIO_API_KEY"],
    os.environ["SCENARIO_API_SECRET"],
)
```

## Base URL

```
https://api.cloud.scenario.com/v1
```

## Core Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/generate/custom/{modelId}` | POST | Generate images, videos, 3D, audio (all model types) |
| `/generate/remove-background` | POST | Remove image background |
| `/jobs/{jobId}` | GET | Poll job status |
| `/jobs/{jobId}/action` | POST | Cancel job (`{ "action": "cancel" }`) |
| `/assets/{assetId}` | GET | Get asset URL by ID |
| `/assets` | POST | Upload asset (base64 image) |

## Generation Pattern

All generation follows the same pattern:

1. **POST** to `/generate/custom/{modelId}` with model-specific params
2. Receive `{ job: { jobId, status } }`
3. **Poll** `/jobs/{jobId}` until `status` is `success` or `failure`
4. On success, get asset IDs from `job.metadata.assetIds`
5. **Fetch** asset URL via `/assets/{assetId}`

### IMPORTANT: Parameters are model-specific

**Every model has its own set of parameters.** When the user switches models or when building UI with multiple model options, you MUST:

1. **Look up the exact parameters** for each model by querying the models API (see "Fetching the Model Catalog" below). Never assume one model's params work for another.
2. **Adapt the payload dynamically** based on the selected model. For example:
   - Gemini uses `resolution: "2K"` but Flux uses `resolution: "1 MP"`
   - Some models use `image` for input, others use `images`, `startImage`, `imageUrl`, or `firstFrameImage`
   - Aspect ratio values differ between models (some use `16:9`, others use `1280:720` or `landscape_4_3`)
   - Duration can be `number` or `string` depending on the model
3. **When building UIs with model selection**, generate a parameter config/map per model so the form fields, dropdowns, and validation update when the user picks a different model.
4. **Validate allowed values** -- each model defines its own set of allowed aspect ratios, resolutions, durations, etc. Don't send values a model doesn't support.

### TypeScript example

```typescript
const BASE = 'https://api.cloud.scenario.com/v1';

async function generate(modelId: string, payload: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE}/generate/custom/${modelId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.job.jobId;
}

async function pollJob(jobId: string): Promise<string[]> {
  while (true) {
    const res = await fetch(`${BASE}/jobs/${jobId}`, { headers: getAuthHeaders() });
    const { job } = await res.json();
    if (job.status === 'success') return job.metadata.assetIds;
    if (job.status === 'failure' || job.status === 'canceled') throw new Error(`Job ${job.status}`);
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function getAssetUrl(assetId: string): Promise<string> {
  const res = await fetch(`${BASE}/assets/${assetId}`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data.asset.url;
}
```

### Python example

```python
def generate(model_id, payload):
    r = requests.post(f"{BASE}/generate/custom/{model_id}", json=payload, auth=auth)
    r.raise_for_status()
    return r.json()["job"]["jobId"]

def poll_job(job_id):
    while True:
        r = requests.get(f"{BASE}/jobs/{job_id}", auth=auth)
        job = r.json()["job"]
        if job["status"] == "success":
            return job["metadata"]["assetIds"]
        if job["status"] in ("failure", "canceled"):
            raise Exception(f"Job {job['status']}")
        time.sleep(3)
```

When building a multi-model application, define model configs so parameters adapt automatically:

```typescript
const MODEL_CONFIGS = {
  'model_google-gemini-pro-image-t2i': {
    aspectRatios: ['21:9','16:9','3:2','4:3','5:4','1:1','4:5','3:4','2:3','9:16','auto'],
    resolutions: ['1K','2K','4K'],
    buildPayload: (opts) => ({
      prompt: opts.prompt,
      aspectRatio: opts.aspectRatio ?? 'auto',
      resolution: opts.resolution ?? '2K',
    }),
  },
  'model_bfl-flux-2-max': {
    aspectRatios: ['16:9','3:2','4:3','5:4','1:1','4:5','3:4','2:3','9:16'],
    resolutions: ['0.5 MP','1 MP','2 MP','4 MP'],
    buildPayload: (opts) => ({
      prompt: opts.prompt,
      aspectRatio: opts.aspectRatio ?? '4:3',
      resolution: opts.resolution ?? '1 MP',
    }),
  },
  // ... define for each model the user can select
};
```

## Asset Upload

To use images as input (reference images, first frames, etc.), upload them first:

```typescript
async function uploadAsset(base64Content: string, name: string): Promise<string> {
  const res = await fetch(`${BASE}/assets`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ image: base64Content, name }),
  });
  const data = await res.json();
  return data.asset.id; // e.g. "asset_GTrL3mq4SXWyMxkOHRxlpw"
}
```

Many models accept either `assetId` strings or Data URLs directly for image parameters.

## Recommended Default Models

When no specific model is requested, use these defaults:

| Category | Model | ID |
|----------|-------|----|
| Image Generation | Gemini 3.0 Pro | `model_google-gemini-pro-image-t2i` |
| Image Editing | Gemini 3.0 Pro Edit | `model_google-gemini-pro-image-editing` |
| Video (I2V) | Kling V3 I2V Pro | `model_kling-v3-i2v-pro` |
| Video (T2V) | Kling V3 T2V Pro | `model_kling-v3-t2v-pro` |
| Upscaling | Scenario Flux Upscale | `model_sc-upscale-flux` |
| Background Removal | Photoroom | `model_photoroom-background-removal` |
| 3D Generation | Tripo 3.0 Image to 3D | `model_tripo-v3-0-image-to-3d` |
| Lipsync | Kling Lipsync | `model_kling-lip-sync` |

### Default Model Parameters

**Gemini 3.0 Pro T2I** — `model_google-gemini-pro-image-t2i`

| Param | Type | Default | Values |
|-------|------|---------|--------|
| `prompt` | string | — | **Required**, max 4096 chars |
| `referenceImages` | assetId[] | — | Optional, max 14 |
| `aspectRatio` | string | auto | 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16, auto |
| `resolution` | string | 1K | 1K, 2K, 4K |
| `useGoogleSearch` | boolean | false | — |
| `seed` | number | — | 0–2147483647 |

**Gemini 3.0 Pro Edit** — `model_google-gemini-pro-image-editing`

| Param | Type | Default | Values |
|-------|------|---------|--------|
| `referenceImages` | assetId[] | — | **Required**, max 14 |
| `prompt` | string | — | **Required**, max 4096 chars |
| `aspectRatio` | string | auto | 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16, auto |
| `resolution` | string | 2K | 1K, 2K, 4K |
| `numOutputs` | number | 1 | 1–4 |
| `seed` | number | — | 0–2147483647 |

**Kling V3 I2V Pro** — `model_kling-v3-i2v-pro`

| Param | Type | Default | Values |
|-------|------|---------|--------|
| `prompt` | string | — | **Required** |
| `image` | assetId | — | **Required**, first frame |
| `lastFrameImage` | assetId | — | Optional |
| `duration` | string | 5 | 5, 10 |

**Kling V3 T2V Pro** — `model_kling-v3-t2v-pro`

| Param | Type | Default | Values |
|-------|------|---------|--------|
| `prompt` | string | — | **Required** |
| `aspectRatio` | string | 16:9 | 9:16, 1:1, 16:9 |
| `duration` | string | 5 | 5, 10 |

**Scenario Flux Upscale** — `model_sc-upscale-flux`

| Param | Type | Default | Values |
|-------|------|---------|--------|
| `image` | assetId | — | **Required** |
| `upscaleFactor` | number | — | 2–8 |
| `preset` | string | — | precise, balanced, creative |
| `loras` | modelId[] | — | Optional LoRA model IDs |
| `prompt` | string | — | Optional |
| `imagePrompt` | assetId[] | — | Up to 4 style images |
| `numInferenceSteps` | number | 28 | 1–50 |
| `baseModel` | string | — | FLUX.1-dev, FLUX.1-Krea-dev |
| `seed` | number | — | Optional |

**Photoroom Background Removal** — `model_photoroom-background-removal`

| Param | Type | Default | Values |
|-------|------|---------|--------|
| `image` | assetId | — | **Required** |
| `backgroundColor` | string | — | Any hex color, CSS name, or omit for transparent |

**Tripo 3.0 Image to 3D** — `model_tripo-v3-0-image-to-3d`

| Param | Type | Default | Values |
|-------|------|---------|--------|
| `image` | assetId | — | **Required** |
| `texture` | boolean | true | — |
| `textureQuality` | string | standard | standard, detailed |
| `geometryQuality` | string | standard | standard, detailed |
| `pbr` | boolean | true | Overrides texture params when true |
| `faceLimit` | number | — | Auto if unset |
| `orientation` | string | default | default, align_image |
| `autoSize` | boolean | false | Scale to real-world dimensions |
| `quad` | boolean | false | Quad mesh output |
| `smartLowPoly` | boolean | false | Hand-crafted low-poly topology |
| `generateParts` | boolean | false | Segmented parts (incompatible with texture/pbr/quad) |
| `seed` | number | — | Optional |

## Key Capabilities

### 1. Text-to-Image

Generate images from text prompts. Common models and their IDs:

| Model | ID | Key features |
|-------|----|-------------|
| Gemini 3.0 Pro | `model_google-gemini-pro-image-t2i` | 1K-4K resolution, Google Search |
| Flux 2 Max | `model_bfl-flux-2-max` | Up to 4MP, reference images |
| Flux 2 Pro | `model_bfl-flux-2-pro` | Prompt upsampling |
| GPT Image 1.5 | `model_openai-gpt-image-1-5` | Up to 10 outputs, transparent BG |
| Seedream 4.5 | `model_bytedance-seedream-4-5` | Up to 4K, sequential generation |
| Imagen 4 | `model_imagen4` | Simple, high quality |
| Ideogram V3 | `model_ideogram-v3-balanced` | Style presets, inpainting |
| Recraft v4 Pro | `model_recraft-v4-pro` | High-res, aspect ratios |

```typescript
// Text-to-image
generate('model_google-gemini-pro-image-t2i', {
  prompt: 'A futuristic city at sunset',
  aspectRatio: '16:9',
  resolution: '2K',
});
```

### 2. Image Editing

Edit images using reference images + text instructions. All editing models require `referenceImages`.

| Model | ID | Max refs |
|-------|----|---------|
| Gemini 3.0 Pro Edit | `model_google-gemini-pro-image-editing` | 14 |
| Flux Kontext Edit | `model_flux-kontext-editing` | 10 |
| GPT Image 1.5 Edit | `model_openai-gpt-image-1-5-editing` | 10 |
| Seedream 4.5 Edit | `model_bytedance-seedream-4-5-editing` | 14 |
| Flux 2 Max Edit | `model_bfl-flux-2-max-editing` | 8 |

```typescript
generate('model_google-gemini-pro-image-editing', {
  referenceImages: ['asset_xxx'],
  prompt: 'Change the sky to a dramatic sunset',
  aspectRatio: '16:9',
  resolution: '2K',
});
```

### 3. Video Generation

Generate videos from text or images. All async via job polling.

| Model | ID | Duration | Features |
|-------|----|----------|----------|
| **Kling V3 I2V Pro** | `model_kling-v3-i2v-pro` | -- | **Default I2V** |
| **Kling V3 T2V Pro** | `model_kling-v3-t2v-pro` | -- | **Default T2V** |
| VEO 3.1 | `model_veo3-1` | 4-8s | Audio, reference images, 1080p |
| VEO 3 | `model_veo3` | 4-8s | Audio generation |
| Sora 2 Pro | `model_open-ai-sora-2-pro` | 4-12s | High resolution |
| Kling O1 I2V | `model_kling-o1-i2v` | 5-10s | First/last frame |
| Seedance 1.5 Pro | `model_bytedance-seedance-1-5-pro` | 2-12s | Audio, 1080p |
| Luma Ray 2 720p | `model_luma-ray-2-720p` | 5s | Loop, camera concepts |
| Minimax Hailuo 2.3 | `model_minimax-hailuo-2-3` | 6-10s | 1080p |
| LTX-2 19b | `model_ltx-2-19b` | 3-20s | Camera motion, audio |
| Wan 2.6 I2V | `model_wan-2-6-i2v` | 5-15s | Audio sync |
| Pixverse v5 | `model_pixverse-v5` | 5s | Effects, first/last frame |

```typescript
// Text-to-video (default)
generate('model_kling-v3-t2v-pro', {
  prompt: 'A cat playing piano, cinematic',
  aspectRatio: '16:9',
  duration: 5,
});

// Image-to-video (default)
generate('model_kling-v3-i2v-pro', {
  prompt: 'The character starts walking forward',
  image: 'asset_xxx',
  duration: 5,
});
```

### 4. Image Upscaling

| Model | ID | Scale | Notes |
|-------|----|-------|-------|
| Scenario Flux Upscale | `model_sc-upscale-flux` | 2-8x | LoRA support, presets |
| Scenario Upscale V3 | `model_upscale-v3` | 1-16x | Style options |
| Topaz Upscale | `model_topaz-image-upscale` | 2-6x | Face enhancement |
| Recraft Crisp Upscale | `model_recraft-crisp-upscale` | 4x fixed | Fast, no params |
| Crystal Upscaler | `model_crystal-upscaler` | 1-16x | General purpose |

```typescript
generate('model_sc-upscale-flux', {
  image: 'asset_xxx',
  upscaleFactor: 4,
  preset: 'balanced',
});
```

### 5. Background Removal

Two approaches:

```typescript
// Dedicated endpoint
fetch(`${BASE}/generate/remove-background`, {
  method: 'POST',
  headers: getAuthHeaders(),
  body: JSON.stringify({ image: 'asset_xxx', format: 'png' }),
});

// Or via model
generate('model_photoroom-background-removal', { image: 'asset_xxx' });
generate('model_bria-remove-background', { image: 'asset_xxx' });
```

### 6. Utility Tools

| Tool | ID | Purpose |
|------|----|---------|
| Image Slicer | `model_scenario-image-slicer` | Split image into grid |
| Grid Maker | `model_scenario-grid-maker` | Combine images into grid |
| Image Seq to Video | `model_scenario-image-seq-to-video` | Images → video/GIF |
| Video Concat | `model_scenario-video-concat` | Merge videos |
| Resize Image | `model_scenario-resize-image` | Resize with constraints |
| Resize Video | `model_scenario-resize-video` | Resize with format conversion |
| Padding Remover | `model_scenario-padding-remover` | Remove image borders |
| Vectorize | `model_recraft-vectorize` | Raster → SVG |
| Text Remover | `model_photoroom-text-remover` | Remove text from images |
| Background Replacer | `model_photoroom-background-replacer` | Replace background with prompt |
| Relighting | `model_photoroom-relighting` | Adjust image lighting |
| SAM3 Image | `model_meta-sam-3-image` | Segment objects in images |
| SAM3 Video | `model_meta-sam-3-video` | Segment objects in video |

### 7. 3D Model Generation

Many 3D models available: Tripo, Hunyuan, Meshy, Rodin, Sparc3D, Trellis, and more. Query the models API to see the full list.

```typescript
// Default: Tripo 3.0 Image to 3D
generate('model_tripo-v3-0-image-to-3d', {
  image: 'asset_xxx',
  texture: true,
  textureQuality: 'detailed',
  pbr: true,
  faceLimit: 30000,
});
```

### 8. Lipsync & AI Avatar

```typescript
// Lipsync
generate('model_kling-lip-sync', {
  videoUrl: 'asset_xxx',
  text: 'Hello, welcome to our demo',
  voiceId: 'en_AOT',
});

// AI Avatar
generate('model_kling-video-ai-avatar-pro', {
  imageUrl: 'asset_xxx',
  audioUrl: 'asset_yyy',
});
```

## Common Parameters Reference

Most models share these parameters (check model-specific docs for exact support):

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | string | Text description (required for most) |
| `referenceImages` | assetId[] | Input images for editing models |
| `image` | assetId | Single input image |
| `aspectRatio` | string | Output ratio (e.g. `16:9`, `1:1`, `9:16`) |
| `resolution` | string | Output quality (`1K`, `2K`, `4K`, `720p`, `1080p`) |
| `duration` | number | Video duration in seconds |
| `numOutputs` | number | Number of outputs to generate |
| `seed` | number | For reproducible results |
| `guidanceScale` | number | How closely to follow the prompt |
| `negativePrompt` | string | What to avoid |
| `generateAudio` | boolean | Generate audio with video |

## Error Handling

- **429** Too Many Requests -- implement exponential backoff
- **403** Access denied -- check API plan and model access
- **404** Model not found -- verify model ID
- Parse error JSON: `{ message, reason }` fields contain details

## Fetching the Model Catalog

The model list updates frequently. Fetch the live catalog using the **public auth token** (no API key required):

```bash
curl -s -H "Authorization: public-auth-token" \
  "https://api.cloud.scenario.com/v1/models" | jq '.models | length'
# Returns 400+ models
```

### Useful queries

```bash
# List all public models with id, name, type
curl -s -H "Authorization: public-auth-token" \
  "https://api.cloud.scenario.com/v1/models" | \
  jq '.models[] | select(.privacy == "public") | {id, name, type}'

# Find models by name (e.g., "gemini")
curl -s -H "Authorization: public-auth-token" \
  "https://api.cloud.scenario.com/v1/models" | \
  jq '.models[] | select(.name | test("gemini"; "i")) | {id, name, type}'

# Get model details including parameters
curl -s -H "Authorization: public-auth-token" \
  "https://api.cloud.scenario.com/v1/models" | \
  jq '.models[] | select(.id == "model_google-gemini-pro-image-t2i")'

# Group models by type
curl -s -H "Authorization: public-auth-token" \
  "https://api.cloud.scenario.com/v1/models" | \
  jq '[.models[] | select(.privacy == "public")] | group_by(.type) | .[] | {type: .[0].type, count: length}'
```

### TypeScript example

```typescript
async function fetchModels(): Promise<Model[]> {
  const res = await fetch('https://api.cloud.scenario.com/v1/models', {
    headers: { 'Authorization': 'public-auth-token' },
  });
  const data = await res.json();
  return data.models;
}

// Filter by capability
const imageModels = models.filter(m =>
  m.capabilities?.includes('txt2img') && m.privacy === 'public'
);
```

### Model response structure

Each model includes:
- `id` - Model ID to use in generation calls (e.g., `model_google-gemini-pro-image-t2i`)
- `name` - Human-readable name
- `type` - Model type (`custom`, `flux.1-lora`, `flux.1-composition`, etc.)
- `privacy` - `public` or `private`
- `capabilities` - Array of supported operations (`txt2img`, `img2img`, `inpaint`, etc.)
- `parameters` - Model-specific parameter definitions
- `shortDescription` - Brief description of the model

## API Documentation

- [Scenario API Docs](https://docs.scenario.com/docs/welcome-to-the-scenario-api)
- [OpenAPI Spec](https://cdn.cloud.scenario.com/static/api/swagger.yaml)
- [API Reference](https://docs.scenario.com/reference)
