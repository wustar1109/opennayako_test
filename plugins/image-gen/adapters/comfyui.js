// plugins/image-gen/adapters/comfyui.js
import fs from "fs";
import path from "path";
import { saveImage } from "../lib/download.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:8188";
const DEFAULT_TIMEOUT_MS = 30_000;
const MOCK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

const RATIO_TO_SIZE = {
  "1:1": { normal: [1024, 1024], high: [2048, 2048] },
  "4:3": { normal: [1365, 1024], high: [2880, 2160] },
  "3:4": { normal: [1024, 1365], high: [2160, 2880] },
  "16:9": { normal: [1792, 1024], high: [3840, 2160] },
  "9:16": { normal: [1024, 1792], high: [2160, 3840] },
  "3:2": { normal: [1536, 1024], high: [3240, 2160] },
  "2:3": { normal: [1024, 1536], high: [2160, 3240] },
  "21:9": { normal: [1792, 768], high: [3840, 1646] },
};

function readConfig(ctx, key) {
  try {
    return ctx?.config?.get?.(key);
  } catch {
    return undefined;
  }
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function boolValue(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveSettings(ctx = {}) {
  const objectConfig = readConfig(ctx, "comfyui") || {};
  const providerDefaults = readConfig(ctx, "providerDefaults")?.comfyui || {};
  const timeoutSeconds = firstValue(
    objectConfig.timeoutSeconds,
    readConfig(ctx, "comfyuiTimeoutSeconds"),
    providerDefaults.timeoutSeconds,
    process.env.COMFYUI_TIMEOUT_SECONDS,
  );

  return {
    baseUrl: String(firstValue(
      objectConfig.baseUrl,
      readConfig(ctx, "comfyuiBaseUrl"),
      providerDefaults.baseUrl,
      providerDefaults.base_url,
      process.env.COMFYUI_BASE_URL,
      DEFAULT_BASE_URL,
    )).replace(/\/+$/, ""),
    workflow: objectConfig.workflow || readConfig(ctx, "comfyuiWorkflow") || providerDefaults.workflow || null,
    workflowPath: firstValue(
      objectConfig.workflowPath,
      readConfig(ctx, "comfyuiWorkflowPath"),
      providerDefaults.workflowPath,
      providerDefaults.workflow_path,
      process.env.COMFYUI_WORKFLOW_PATH,
    ),
    enabled: boolValue(firstValue(
      objectConfig.enabled,
      readConfig(ctx, "comfyuiEnabled"),
      providerDefaults.enabled,
      process.env.COMFYUI_ENABLED,
    ), true),
    mock: boolValue(firstValue(
      objectConfig.mock,
      readConfig(ctx, "comfyuiMock"),
      providerDefaults.mock,
      process.env.COMFYUI_MOCK,
    ), false),
    timeoutMs: numberValue(timeoutSeconds, DEFAULT_TIMEOUT_MS / 1000) * 1000,
    pluginDir: ctx.pluginDir || process.cwd(),
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function resolveWorkflowPath(workflowPath, pluginDir) {
  if (!workflowPath) return null;
  if (path.isAbsolute(workflowPath)) return workflowPath;
  const cwdPath = path.resolve(process.cwd(), workflowPath);
  if (fs.existsSync(cwdPath)) return cwdPath;
  return path.resolve(pluginDir || process.cwd(), workflowPath);
}

function cloneWorkflow(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadWorkflow(settings, params) {
  if (params.workflow && typeof params.workflow === "object") {
    return cloneWorkflow(params.workflow);
  }
  if (settings.workflow && typeof settings.workflow === "object") {
    return cloneWorkflow(settings.workflow);
  }
  const workflowPath = resolveWorkflowPath(settings.workflowPath, settings.pluginDir);
  if (!workflowPath) {
    throw new Error(
      "ComfyUI workflow is not configured. Set image-gen.comfyuiWorkflowPath, providerDefaults.comfyui.workflowPath, or COMFYUI_WORKFLOW_PATH.",
    );
  }
  const raw = fs.readFileSync(workflowPath, "utf-8");
  const workflow = JSON.parse(raw);
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    throw new Error(`ComfyUI workflow must be a JSON object: ${workflowPath}`);
  }
  return workflow;
}

function parseSize(size) {
  if (typeof size !== "string") return null;
  const match = size.match(/^(\d{2,5})\s*x\s*(\d{2,5})$/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function resolveDimensions(params) {
  if (Number.isFinite(params.width) && Number.isFinite(params.height)) {
    return { width: Number(params.width), height: Number(params.height) };
  }
  const explicitSize = parseSize(params.size);
  if (explicitSize) return { width: explicitSize[0], height: explicitSize[1] };

  const ratio = params.ratio || params.aspect_ratio || params.aspectRatio || "1:1";
  const quality = String(params.resolution || params.quality || "").toLowerCase();
  const high = quality === "4k" || quality === "high";
  const pair = RATIO_TO_SIZE[ratio]?.[high ? "high" : "normal"] || RATIO_TO_SIZE["1:1"].normal;
  return { width: pair[0], height: pair[1] };
}

function injectWorkflowValues(value, replacements) {
  if (Array.isArray(value)) {
    return value.map((item) => injectWorkflowValues(item, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, injectWorkflowValues(item, replacements)]),
    );
  }
  if (typeof value !== "string") return value;

  let output = value;
  for (const [key, replacement] of Object.entries(replacements)) {
    const placeholder = `{{${key}}}`;
    if (output.trim() === placeholder) return replacement;
    output = output.replaceAll(placeholder, String(replacement));
  }
  return output;
}

function buildWorkflow(settings, params) {
  const workflow = loadWorkflow(settings, params);
  const { width, height } = resolveDimensions(params);
  const count = Math.max(1, Math.min(Number(params.count || 1), 16));
  const negativePrompt = params.negative_prompt || params.negativePrompt || [
    "text",
    "watermark",
    "logo",
    "low resolution",
    "noise",
    "blurry edges",
    "distorted structure",
  ].join(", ");

  return injectWorkflowValues(workflow, {
    prompt: params.prompt,
    positive_prompt: params.prompt,
    negative_prompt: negativePrompt,
    width,
    height,
    count,
    batch_size: count,
  });
}

function historyEntry(history, taskId) {
  if (history && typeof history === "object") {
    if (history[taskId] && typeof history[taskId] === "object") return history[taskId];
    if (history.outputs || history.status) return history;
  }
  return null;
}

function historyReportsFailure(statusInfo) {
  if (!statusInfo || typeof statusInfo !== "object") return false;
  const status = String(statusInfo.status_str || statusInfo.status || "").toLowerCase();
  return ["error", "failed", "failure"].includes(status);
}

function historyReportsCompleted(statusInfo) {
  if (!statusInfo || typeof statusInfo !== "object") return false;
  if (statusInfo.completed === true) return true;
  const status = String(statusInfo.status_str || statusInfo.status || "").toLowerCase();
  return ["success", "completed", "complete"].includes(status);
}

function extractImages(entry) {
  const outputs = entry?.outputs;
  if (!outputs || typeof outputs !== "object") return [];
  const images = [];
  for (const output of Object.values(outputs)) {
    if (!output || typeof output !== "object") continue;
    for (const image of output.images || []) {
      if (image && typeof image === "object" && image.filename) images.push(image);
    }
  }
  return images;
}

function imageMimeFromResponse(res, filename) {
  const header = res.headers?.get?.("content-type")?.split(";")[0]?.trim();
  if (header?.startsWith("image/")) return header;
  const ext = path.extname(filename || "").toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

async function downloadComfyImage(settings, image, generatedDir) {
  const query = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder || "",
    type: image.type || "output",
  });
  const res = await fetchWithTimeout(`${settings.baseUrl}/view?${query}`, {}, settings.timeoutMs);
  if (!res.ok) throw new Error(`ComfyUI view failed ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = imageMimeFromResponse(res, image.filename);
  const baseName = path.basename(image.filename, path.extname(image.filename));
  const dataDir = path.dirname(generatedDir);
  const { filename } = await saveImage(buffer, mime, dataDir, `comfyui-${baseName}`);
  return filename;
}

export const comfyuiImageAdapter = {
  id: "comfyui",
  name: "ComfyUI",
  types: ["image"],
  capabilities: {
    ratios: Object.keys(RATIO_TO_SIZE),
    resolutions: ["2k", "4k"],
  },

  async checkAuth(ctx) {
    const settings = resolveSettings(ctx);
    if (settings.mock) return { ok: true, message: "mock" };
    if (!settings.enabled) return { ok: false, message: "ComfyUI provider disabled" };
    try {
      const res = await fetchWithTimeout(`${settings.baseUrl}/system_stats`, {}, settings.timeoutMs);
      if (!res.ok) return { ok: false, message: `ComfyUI unavailable: ${res.status}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message || String(err) };
    }
  },

  async submit(params, ctx) {
    const settings = resolveSettings(ctx);
    if (settings.mock) {
      const { filename } = await saveImage(MOCK_PNG, "image/png", ctx.dataDir, "comfyui-mock");
      return {
        taskId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        files: [filename],
      };
    }
    if (!settings.enabled) {
      throw new Error("ComfyUI provider is disabled.");
    }

    const workflow = buildWorkflow(settings, params);
    const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const res = await fetchWithTimeout(`${settings.baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    }, settings.timeoutMs);

    if (!res.ok) {
      let detail = "";
      try { detail = `: ${JSON.stringify(await res.json())}`; } catch {}
      throw new Error(`ComfyUI prompt submit failed ${res.status}${detail}`);
    }

    const data = await res.json();
    const taskId = String(data.prompt_id || data.number || clientId);
    return { taskId };
  },

  async query(taskId, ctx) {
    const settings = resolveSettings(ctx);
    const res = await fetchWithTimeout(`${settings.baseUrl}/history/${encodeURIComponent(taskId)}`, {}, settings.timeoutMs);
    if (!res.ok) {
      if (res.status === 404) return { status: "pending" };
      throw new Error(`ComfyUI history failed ${res.status}`);
    }

    const history = await res.json();
    const entry = historyEntry(history, taskId);
    if (!entry) return { status: "pending" };

    const images = extractImages(entry);
    if (images.length > 0) {
      const files = [];
      for (const image of images) {
        files.push(await downloadComfyImage(settings, image, ctx.generatedDir));
      }
      return { status: "success", files };
    }

    const statusInfo = entry.status;
    if (historyReportsFailure(statusInfo)) {
      return { status: "failed", failReason: `ComfyUI generation failed: ${JSON.stringify(statusInfo)}` };
    }
    if (historyReportsCompleted(statusInfo)) {
      return { status: "failed", failReason: "ComfyUI completed without image outputs." };
    }
    return { status: "pending" };
  },

  _private: {
    buildWorkflow,
    resolveDimensions,
    resolveSettings,
  },
};
