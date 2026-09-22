#!/usr/bin/env node

import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GUIDED_UPDATE_SERVER_SIGNATURE,
  guidedUpdateRepoRoot,
  guidedUpdateRuntimeFingerprint,
} from './guided-update-runtime.mjs';

const root = guidedUpdateRepoRoot();
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

function windowsListeningPid(port) {
  if (process.platform !== 'win32') return null;
  const result = spawnSync('netstat', ['-ano'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  const needle = ':' + port;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.includes(needle) || !/\bLISTENING\b/i.test(line)) continue;
    const columns = line.trim().split(/\s+/);
    const pid = Number(columns.at(-1));
    if (Number.isSafeInteger(pid) && pid > 0) return pid;
  }
  return null;
}

export async function inspectGuidedUpdateServer(
  port,
  expectedFingerprint = guidedUpdateRuntimeFingerprint(),
) {
  const base = 'http://127.0.0.1:' + port;
  try {
    const response = await globalThis.fetch(base + '/__guided_update_health', {
      signal: globalThis.AbortSignal.timeout(1200),
      cache: 'no-store',
    });
    if (response.ok) {
      const data = await response.json();
      const sameProduct = data?.app === 'dressup-strategy'
        && data?.feature === 'guided-update';
      const sameRoot = sameProduct
        && typeof data.root === 'string'
        && resolve(data.root) === root;

      if (sameRoot) {
        const pid = Number.isSafeInteger(Number(data.pid)) && Number(data.pid) > 0
          ? Number(data.pid)
          : windowsListeningPid(port);
        if (data.signature === GUIDED_UPDATE_SERVER_SIGNATURE
          && data.runtimeFingerprint === expectedFingerprint) {
          return { state: 'current', pid, health: data };
        }
        return { state: 'stale', pid, health: data };
      }
    }
  } catch {
    // Probe the port below.
  }

  return await isPortOpen(port)
    ? { state: 'foreign', pid: null, health: null }
    : { state: 'down', pid: null, health: null };
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

async function waitForPortDown(port, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!await isPortOpen(port)) return;
    await new Promise(resolveWait => globalThis.setTimeout(resolveWait, 120));
  }
  throw new Error('舊版 Guided Update server 未能停止，請手動結束占用 PORT ' + port + ' 的 node.exe。');
}

async function stopStaleServer(info, port) {
  if (!Number.isSafeInteger(info.pid) || info.pid <= 0) {
    throw new Error('偵測到舊版 Guided Update server，但無法取得 PID；請先關閉舊的 node.exe 再重試。');
  }

  try {
    process.kill(info.pid, 'SIGTERM');
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw new Error('無法停止舊版 Guided Update server (PID ' + info.pid + ')：' + error.message);
    }
  }

  try {
    await waitForPortDown(port, 3_000);
    return;
  } catch (error) {
    if (process.platform !== 'win32') throw error;
  }

  const killed = spawnSync('taskkill', ['/PID', String(info.pid), '/T', '/F'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (killed.status !== 0 && await isPortOpen(port)) {
    throw new Error('無法強制停止舊版 Guided Update server (PID ' + info.pid + ')。');
  }
  await waitForPortDown(port);
}

async function waitForServer(port, expectedFingerprint, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await inspectGuidedUpdateServer(port, expectedFingerprint);
    if (info.state === 'current') return info;
    if (info.state === 'foreign') {
      throw new Error('連接埠 ' + port + ' 已被其他服務占用。');
    }
    if (info.state === 'stale') {
      throw new Error('新啟動的 Guided Update server 仍回報舊版 runtime fingerprint。');
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
  const expectedFingerprint = guidedUpdateRuntimeFingerprint();

  let info = await inspectGuidedUpdateServer(port, expectedFingerprint);
  let startedChild = null;

  if (info.state === 'foreign') {
    throw new Error(
      '連接埠 ' + port + ' 已被其他服務占用。請關閉該服務或改用 --port=<port>。'
    );
  }

  if (info.state === 'stale') {
    console.log('[Guided Update] 偵測到舊版本機更新服務，正在重新啟動…');
    await stopStaleServer(info, port);
    info = { state: 'down' };
  }

  if (info.state === 'down') {
    console.log('[Guided Update] 啟動本機更新服務…');
    startedChild = startServer(port);
    await waitForServer(port, expectedFingerprint);
    console.log('[Guided Update] 本機更新服務已就緒。');
  } else {
    console.log('[Guided Update] 已偵測到相同版本的更新服務，直接沿用。');
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
    await waitForPortDown(port).catch(() => {});
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
