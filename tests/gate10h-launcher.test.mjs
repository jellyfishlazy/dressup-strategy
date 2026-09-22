import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const launcherPath = resolve(root, 'scripts', 'launch-main.mjs');
const batPath = resolve(root, '開啟搭配器.bat');
const serverPath = resolve(root, 'cn-search', 'scripts', 'dev-server.mjs');

function runNode(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', rejectRun);
    child.once('exit', code => resolveRun({ code, stdout, stderr }));
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}

test('Gate 10H-H launcher keeps the batch entry ASCII-safe and workspace-relative', () => {
  const bat = readFileSync(batPath, 'utf8');
  const launcher = readFileSync(launcherPath, 'utf8');
  const server = readFileSync(serverPath, 'utf8');

  assert.doesNotMatch(bat, /[^\x00-\x7F]/);
  assert.match(bat, /cd \/d "%~dp0"/);
  assert.match(bat, /node scripts\\launch-main\.mjs %\*/);
  assert.match(launcher, /\/index\.html/);
  assert.match(launcher, /__dressup_health/);
  assert.match(launcher, /dressup-strategy-main-launcher-v1/);
  assert.doesNotMatch(launcher, /file:\/\//);
  assert.match(server, /const host = '127\.0\.0\.1';/);
  assert.match(server, /urlPath === '\/__dressup_health'/);
  assert.match(server, /\.listen\(port, host,/);
});

test('Gate 10H-H launcher can start and validate a fresh local server without opening a browser', async () => {
  const port = await freePort();
  const result = await runNode([
    launcherPath,
    '--no-open',
    '--ephemeral',
    '--port=' + port,
  ]);

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /本機伺服器已就緒/);
  assert.match(result.stdout, new RegExp('http://127\\.0\\.0\\.1:' + port + '/index\\.html'));
  assert.match(result.stdout, /測試伺服器已停止/);
});

test('Gate 10H-H launcher refuses a foreign service already occupying the port', async () => {
  const port = await freePort();
  const foreign = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('foreign-service');
  });

  await new Promise((resolveListen, rejectListen) => {
    foreign.once('error', rejectListen);
    foreign.listen(port, '127.0.0.1', resolveListen);
  });

  try {
    const result = await runNode([launcherPath, '--no-open', '--port=' + port]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /占用/);
  } finally {
    await new Promise(resolveClose => foreign.close(resolveClose));
  }
});
