#!/usr/bin/env node
/**
 * Cross-platform dev launcher
 * 解决 POSIX `VAR=val cmd` 语法和 `~` 在 Windows 上不工作的问题
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
process.env.HANA_HOME = join(homedir(), ".hanako-dev");
// 本地 Electron 再拉起 server 时，显式把当前 Node runtime 传下去。
// 这样开发模式的 server/source 进程就不会误用 Electron 自带 Node，避免 native addon ABI 漂移。
process.env.HANA_DEV_NODE_BIN = process.execPath;

const mode = process.argv[2];
const extra = process.argv.slice(3);

let bin, args;
let rendererDev = null;
switch (mode) {
  case "electron":
    bin = require("electron");
    args = [".", ...extra];
    break;
  case "electron-dev":
    bin = require("electron");
    args = [".", "--dev", ...extra];
    break;
  case "electron-vite":
    process.env.VITE_DEV_URL = "http://localhost:5173";
    rendererDev = await ensureRendererDevServer(process.env.VITE_DEV_URL);
    bin = require("electron");
    args = [".", "--dev", ...extra];
    break;
  case "cli":
    bin = process.execPath;
    args = ["index.js", ...extra];
    break;
  case "server":
    bin = process.execPath;
    args = ["server/index.js", ...extra];
    break;
  default:
    console.error("Usage: node scripts/launch.js <electron|electron-dev|electron-vite|cli|server>");
    process.exit(1);
}

// Electron 以子进程运行时（如 VS Code / Claude Code 终端），
// 父进程可能设了 ELECTRON_RUN_AS_NODE=1，会让 Electron 以纯 Node 模式启动，
// 导致 require('electron') 拿不到内置 API。spawn 前清掉。
delete process.env.ELECTRON_RUN_AS_NODE;

const child = spawn(bin, args, { stdio: "inherit", env: process.env });
child.on("exit", (code) => {
  if (rendererDev && !rendererDev.killed) rendererDev.kill();
  process.exit(code ?? 1);
});

async function ensureRendererDevServer(devUrl) {
  const readinessUrl = new URL("onboarding.html", `${devUrl.replace(/\/$/, "")}/`).href;
  if (await isRendererReady(readinessUrl)) return null;

  console.log(`[desktop] Starting renderer Vite dev server at ${devUrl}...`);
  const viteBin = join(dirname(require.resolve("vite/package.json")), "bin", "vite.js");
  const vite = spawn(process.execPath, [viteBin, "--config", "vite.config.ts"], {
    stdio: "inherit",
    env: { ...process.env, BROWSER: "none" },
  });

  let exitCode = null;
  vite.on("exit", (code) => {
    exitCode = code ?? 0;
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isRendererReady(readinessUrl)) return vite;
    if (exitCode !== null) {
      throw new Error(`Renderer Vite dev server exited before startup (code ${exitCode}).`);
    }
    await delay(250);
  }

  vite.kill();
  throw new Error(`Renderer Vite dev server did not become ready at ${readinessUrl}.`);
}

async function isRendererReady(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
