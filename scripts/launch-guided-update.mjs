#!/usr/bin/env node

import net from 'node:net';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDED_UPDATE_SERVER_SIGNATURE } from './guided-update-server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const serverScript = resolve(root, 'scripts', 'guided-update-server.mjs');

function parsePort() {
  const arg = process.argv.slice(2).find(value => value.startsWith('--port='));
  const raw = arg ? arg.slice('--port='.length) : process.env.GUIDED_UPDATE_PORT;
  const port = Number(raw) || 8127;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('無效的 Guided Update PORT：' + raw);
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

async function detectServer(port) {
  const base = 'http://127.0.0.1:' + port;
  try {
    const response = await globalThis.fetch(base + '/__guided_update_health', {
      signal: globalThis.AbortSignal.timeout(1200),
      cache: 'no-store',
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.signature === GUIDED_UPDATE_SERVER_SIGNATURE) return 'current';
    }
  } catch {
    // Probe the port below.
  }
  return await isPortOpen(port) ? 'foreign' : 'down';
}

function startServer(port) {
  const child = spawn(process.execPath, [serverScript, '--port=' + port], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, GUIDED_UPDATE_PORT: String(port) },
  });
  child.unref();
  return child;
}

async function waitForServer(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await detectServer(port);
    if (state === 'current') return;
    if (state === 'foreign') {
      throw new Error('連接埠 ' + port + ' 已被其他服務占用。');
    }
    await new Promise(resolveWait => globalThis.setTimeout(resolveWait, 200));
  }
  throw new Error('Guided Update 本機伺服器啟動逾時。');
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
  const url = 'http://127.0.0.1:' + port + '/guided-update/';

  const state = await detectServer(port);
  let startedChild = null;
  if (state === 'foreign') {
    throw new Error(
      '連接埠 ' + port + ' 已被其他服務占用。請關閉該服務或改用 --port=<port>。'
    );
  }
  if (state === 'down') {
    console.log('[Guided Update] 啟動本機更新服務…');
    startedChild = startServer(port);
    await waitForServer(port);
    console.log('[Guided Update] 本機更新服務已就緒。');
  } else {
    console.log('[Guided Update] 已偵測到既有更新服務，直接沿用。');
  }

  if (!noOpen) {
    openBrowser(url);
    console.log('[Guided Update] 已開啟資料更新介面。');
  } else {
    console.log('[Guided Update] --no-open：略過瀏覽器開啟。');
  }
  console.log('[Guided Update] URL: ' + url);

  if (ephemeral && startedChild) {
    startedChild.kill();
    console.log('[Guided Update] --ephemeral：測試服務已停止。');
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch(error => {
    console.error('[Guided Update] 啟動失敗：' + error.message);
    process.exitCode = 1;
  });
}
