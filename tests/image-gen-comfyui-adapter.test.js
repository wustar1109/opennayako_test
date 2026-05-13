import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("../plugins/image-gen/lib/download.js", () => ({
  saveImage: vi.fn(async (_buf, _mime, _dir, customName) => ({
    filename: `${customName || "image"}-saved.png`,
    filePath: `/tmp/generated/${customName || "image"}-saved.png`,
  })),
}));

let mockFetch;
let tmpDir;

function makeCtx(configValues = {}) {
  return {
    dataDir: tmpDir,
    generatedDir: path.join(tmpDir, "generated"),
    pluginDir: path.join(process.cwd(), "plugins", "image-gen"),
    config: {
      get: vi.fn((key) => configValues[key]),
    },
    log: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe("ComfyUI image adapter", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-comfyui-"));
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("injects prompt, negative prompt, dimensions, and batch placeholders into workflow JSON", async () => {
    const { comfyuiImageAdapter } = await import("../plugins/image-gen/adapters/comfyui.js");
    const workflow = comfyuiImageAdapter._private.buildWorkflow(
      {
        workflow: {
          positive: { inputs: { text: "{{prompt}}" } },
          negative: { inputs: { text: "{{negative_prompt}}" } },
          latent: { inputs: { width: "{{width}}", height: "{{height}}", batch_size: "{{count}}" } },
        },
      },
      {
        prompt: "灰度山脉纹理",
        negative_prompt: "文字, 水印",
        ratio: "9:16",
        resolution: "4k",
        count: 3,
      },
    );

    expect(workflow.positive.inputs.text).toBe("灰度山脉纹理");
    expect(workflow.negative.inputs.text).toBe("文字, 水印");
    expect(workflow.latent.inputs.width).toBe(2160);
    expect(workflow.latent.inputs.height).toBe(3840);
    expect(workflow.latent.inputs.batch_size).toBe(3);
  });

  it("submits workflow to /prompt and returns the ComfyUI prompt id", async () => {
    const { comfyuiImageAdapter } = await import("../plugins/image-gen/adapters/comfyui.js");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prompt_id: "prompt-123" }),
    });

    const ctx = makeCtx({
      comfyui: {
        baseUrl: "http://comfy.local:8188",
        workflow: {
          node: { inputs: { text: "{{prompt}}", width: "{{width}}" } },
        },
      },
    });

    const result = await comfyuiImageAdapter.submit({
      prompt: "抽象花卉材质",
      ratio: "1:1",
    }, ctx);

    expect(result.taskId).toBe("prompt-123");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://comfy.local:8188/prompt",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.prompt.node.inputs.text).toBe("抽象花卉材质");
    expect(body.prompt.node.inputs.width).toBe(1024);
  });

  it("queries history, downloads completed images, and returns generated filenames", async () => {
    const { comfyuiImageAdapter } = await import("../plugins/image-gen/adapters/comfyui.js");
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "prompt-123": {
            outputs: {
              "9": {
                images: [
                  { filename: "ComfyUI_00001_.png", subfolder: "", type: "output" },
                ],
              },
            },
            status: { completed: true },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });

    const ctx = makeCtx({
      comfyui: { baseUrl: "http://comfy.local:8188" },
    });

    const result = await comfyuiImageAdapter.query("prompt-123", ctx);

    expect(result.status).toBe("success");
    expect(result.files).toEqual(["comfyui-ComfyUI_00001_-saved.png"]);
    expect(mockFetch.mock.calls[1][0]).toContain("/view?filename=ComfyUI_00001_.png");
  });
});
