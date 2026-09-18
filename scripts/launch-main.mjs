#!/usr/bin/env node

import net from 'node:net';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAUNCHER_SIGNATURE = 'dressup-strategy-main-launcher-v1';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const serverScript = resolve(root, 'cn-search', 'scripts', 'dev-server.mjs');

function normalizeRoot(value) {
  const normalized = resolve(String(value || ''));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function parsePort() {
  const arg = process.argv.slice(2).find(value => value.startsWith('--port='));
  const raw = arg ? arg.slice('--port='.length) : process.env.PORT;
  const port = Number(raw) || 8000;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('無效的 PORT：' + raw);
  }
  return port;
}

async function isPortOpen(port) {
  return await new Promise(resolveOpen => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = value => {
      socket.removeAllListeners();
      socket.destroy();
      resolveOpen(value);
    };
    socket.setTimeout(700);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function fetchResponse(url, timeoutMs = 1500) {
  try {
    return await globalThis.fetch(url, { signal: globalThis.AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  } catch {
    return null;
  }
}

export async function detectServer(port) {
  const base = 'http://127.0.0.1:' + port;

  const health = await fetchResponse(base + '/__dressup_health');
  if (health?.ok) {
    try {
      const payload = await health.json();
      if (payload?.app === 'dressup-strategy') {
        return normalizeRoot(payload.root) === normalizeRoot(root) ? 'current' : 'foreign';
      }
    } catch {
      // Fall through to the static signature check.
    }
  }

  const open = await isPortOpen(port);
  if (!open) return 'down';

  const index = await fetchResponse(base + '/index.html');
  const helper = await fetchResponse(base + '/scripts/launch-main.mjs');
  if (index?.ok && helper?.ok) {
    const [indexText, helperText] = await Promise.all([index.text(), helper.text()]);
    if (
      indexText.includes('<title>奇迹暖暖搭配器</title>') &&
      indexText.includes("src='main.mjs'") &&
      helperText.includes(LAUNCHER_SIGNATURE)
    ) {
      return 'compatible';
    }
  }

  return 'foreign';
}

function startServer(port) {
  const child = spawn(process.execPath, [serverScript], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, PORT: String(port) },
  });
  child.unref();
  return child;
}

async function waitForServer(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await detectServer(port);
    if (state === 'current' || state === 'compatible') return state;
    if (state === 'foreign') throw new Error('連接埠 ' + port + ' 已被其他服務占用。');
    await new Promise(resolveWait => globalThis.setTimeout(resolveWait, 200));
  }
  throw new Error('本機伺服器啟動逾時。');
}

function openBrowser(url) {
  let child;
  if (process.platform === 'win32') {
    child = spawn('cmd.exe', ['/d', '/s', '/c', 'start "" "' + url + '"'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
  } else if (process.platform === 'darwin') {
    child = spawn('open', [url], { detached: true, stdio: 'ignore' });
  } else {
    child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  }
  child.unref();
}

export async function main() {
  const args = new Set(process.argv.slice(2));
  const noOpen = args.has('--no-open');
  const ephemeral = args.has('--ephemeral');
  const port = parsePort();
  const mainUrl = 'http://127.0.0.1:' + port + '/index.html';

  let state = await detectServer(port);
  let startedChild = null;

  if (state === 'foreign') {
    throw new Error(
      '連接埠 ' + port + ' 已被其他服務或不同工作區占用。' +
      ' 請先關閉該服務，再重新執行 launcher。'
    );
  }

  if (state === 'down') {
    console.log('[Launcher] 啟動本機伺服器…');
    startedChild = startServer(port);
    state = await waitForServer(port);
    console.log('[Launcher] 本機伺服器已就緒。');
  } else {
    console.log('[Launcher] 已偵測到可用的本機伺服器，直接沿用。');
  }

  if (!noOpen) {
    openBrowser(mainUrl);
    console.log('[Launcher] 已開啟搭配器。');
  } else {
    console.log('[Launcher] --no-open：略過瀏覽器開啟。');
  }
  console.log('[Launcher] Main: ' + mainUrl);

  if (ephemeral && startedChild) {
    startedChild.kill();
    console.log('[Launcher] --ephemeral：測試伺服器已停止。');
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch(error => {
    console.error('[Launcher] 啟動失敗：' + error.message);
    process.exitCode = 1;
  });
}
