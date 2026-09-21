import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createGuidedUpdateService } from '../scripts/guided-update-service.mjs';
import { createGuidedUpdateServer } from '../scripts/guided-update-server.mjs';
import {
  GUIDED_UPDATE_SERVER_SIGNATURE,
  guidedUpdateRuntimeFingerprint,
} from '../scripts/guided-update-runtime.mjs';

function extWardrobeRow(name, type, id) {
  return [
    name, type, id, '3',
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    'POP', 'Store', 'Set', 'V1',
    'extra-a', 'extra-b',
  ];
}

function externalLevelsSource() {
  return [
    'var themeFilter = [["Test", "关卡: III-90-"]];',
    'var competitionsRaw = {};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {"III-90-1": [1,1,1,1,1]};',
    'var dreamWeavingRaw = {};',
    'var levelFilters = {};',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n');
}

function serviceFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12l-service-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const wardrobePath = join(root, 'wardrobe.js');
  const levelsPath = join(root, 'levels.js');
  const workspace = join(root, 'workspace');
  const outputRoot = join(root, 'staging');

  writeFileSync(
    wardrobePath,
    'var wardrobe = ' + JSON.stringify([
      extWardrobeRow('Alpha Hair', '发型', '001'),
      extWardrobeRow('Beta Shoes', '鞋子', '002'),
    ]) + ';\n',
    'utf8',
  );
  writeFileSync(levelsPath, externalLevelsSource(), 'utf8');

  const service = createGuidedUpdateService({
    workspace,
    outputRoot,
    sourceOptions: { wardrobePath, levelsPath },
  });
  return { root, workspace, outputRoot, service };
}

async function waitForHttp(url, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(url, {
        signal: globalThis.AbortSignal.timeout(500),
        cache: 'no-store',
      });
      if (response.ok) return;
    } catch {
      // Retry until the child listener is ready.
    }
    await new Promise(resolveWait => globalThis.setTimeout(resolveWait, 80));
  }
  throw new Error('timed out waiting for ' + url);
}

async function waitForPortClosed(port, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise(resolveOpen => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      const finish = value => {
        socket.removeAllListeners();
        socket.destroy();
        resolveOpen(value);
      };
      socket.setTimeout(250);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
    });
    if (!open) return;
    await new Promise(resolveWait => globalThis.setTimeout(resolveWait, 80));
  }
  throw new Error('port stayed open: ' + port);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address();
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}

test('Gate 12L service composes create/search/collect into one daily workflow', async t => {
  const fx = serviceFixture(t);

  let state = await fx.service.dispatch('state');
  assert.equal(state.current, null);

  const session = await fx.service.dispatch('session.create', {
    name: 'Guided test',
    note: 'daily flow',
  });
  assert.equal(session.status, 'draft');

  const wardrobe = await fx.service.dispatch('wardrobe.search', {
    query: 'Alpha',
  });
  assert.equal(wardrobe.items.length, 1);
  assert.equal(wardrobe.items[0].key, '发型|001');
  assert.equal(wardrobe.items[0].collected, false);

  const addedWardrobe = await fx.service.dispatch('wardrobe.collect', {
    keys: ['发型|001'],
  });
  assert.deepEqual(addedWardrobe.planned, ['发型|001']);
  assert.deepEqual(addedWardrobe.collected, ['发型|001']);

  const levels = await fx.service.dispatch('levels.search', {
    query: 'III-90-1',
  });
  assert.equal(levels.items.length, 1);
  assert.equal(levels.items[0].key, 'III-90-1');

  const addedLevel = await fx.service.dispatch('levels.collect', {
    keys: ['III-90-1'],
  });
  assert.deepEqual(addedLevel.planned, ['III-90-1']);
  assert.deepEqual(addedLevel.collected, ['III-90-1']);

  state = await fx.service.dispatch('state');
  assert.equal(state.current.id, session.id);
  assert.equal(state.collection.wardrobe.length, 1);
  assert.equal(state.collection.levels.length, 1);
  assert.equal(state.plan.wardrobe.length, 1);
  assert.equal(state.plan.levels.length, 1);
  assert.equal(state.completeness.complete, true);
  assert.deepEqual(state.completeness.overall, {
    planned: 2,
    completed: 2,
    missing: 0,
    percent: 100,
  });
});

test('Gate 12L.1 service adds the full wardrobe search result set, not only the visible page', async t => {
  const fx = serviceFixture(t);
  await fx.service.dispatch('session.create', { name: 'Batch search test' });

  const search = await fx.service.dispatch('wardrobe.search', {
    filters: { source: 'Store' },
    limit: 1,
  });
  assert.equal(search.total, 2);
  assert.equal(search.items.length, 1);
  assert.equal(search.addable, 2);

  const added = await fx.service.dispatch('wardrobe.collect-search', {
    filters: search.filters,
    searchFingerprint: search.searchFingerprint,
  });
  assert.equal(added.matched, 2);
  assert.equal(added.added, 2);
  assert.equal(added.alreadyCollected, 0);
  assert.equal(added.nonselectable, 0);

  const state = await fx.service.dispatch('state');
  assert.equal(state.plan.wardrobe.length, 2);
  assert.equal(state.collection.wardrobe.length, 2);

  const repeated = await fx.service.dispatch('wardrobe.search', {
    filters: { source: 'Store' },
    limit: 1,
  });
  assert.equal(repeated.alreadyCollected, 2);
  assert.equal(repeated.addable, 0);

  const noOp = await fx.service.dispatch('wardrobe.collect-search', {
    filters: repeated.filters,
    searchFingerprint: repeated.searchFingerprint,
  });
  assert.equal(noOp.added, 0);
  assert.equal(noOp.alreadyCollected, 2);
});

test('Gate 12L service removes an item from both collection and plan', async t => {
  const fx = serviceFixture(t);
  await fx.service.dispatch('session.create', { name: 'Remove test' });
  await fx.service.dispatch('wardrobe.collect', { keys: ['发型|001'] });

  const removed = await fx.service.dispatch('wardrobe.remove', {
    keys: ['发型|001'],
  });
  assert.deepEqual(removed.collection, ['发型|001']);
  assert.deepEqual(removed.plan, ['发型|001']);

  const state = await fx.service.dispatch('state');
  assert.equal(state.collection.wardrobe.length, 0);
  assert.equal(state.plan.wardrobe.length, 0);
  assert.equal(state.completeness.planDefined, false);
});

test('Gate 12L service exposes session history and explicit activation/cancel', async t => {
  const fx = serviceFixture(t);
  const first = await fx.service.dispatch('session.create', { name: 'First update' });
  const second = await fx.service.dispatch('session.create', { name: 'Second update' });

  await fx.service.dispatch('session.activate', { id: first.id });
  let state = await fx.service.dispatch('state');
  assert.equal(state.current.id, first.id);
  assert.equal(state.sessions.length, 2);

  await fx.service.dispatch('session.cancel', { id: first.id });
  state = await fx.service.dispatch('state');
  assert.equal(state.current, null);
  assert.equal(state.sessions.find(item => item.id === first.id).status, 'cancelled');
  assert.equal(state.sessions.find(item => item.id === second.id).status, 'draft');
});

test('Gate 12L privileged server requires its token and same-origin request', async t => {
  const port = await freePort();
  const calls = [];
  const service = {
    async dispatch(action, payload) {
      calls.push({ action, payload });
      if (action === 'state') return { current: null, sessions: [] };
      return { action, payload };
    },
  };
  const runtime = createGuidedUpdateServer({
    port,
    service,
    token: 'a'.repeat(64),
  });
  await runtime.start();
  t.after(() => runtime.stop());

  const base = 'http://127.0.0.1:' + port;
  const health = await globalThis.fetch(base + '/__guided_update_health');
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.signature, GUIDED_UPDATE_SERVER_SIGNATURE);
  assert.equal(healthBody.runtimeFingerprint, guidedUpdateRuntimeFingerprint());
  assert.equal(healthBody.pid, process.pid);

  const bootstrap = await globalThis.fetch(base + '/__guided_update_bootstrap', {
    headers: { Origin: base },
  });
  assert.equal(bootstrap.status, 200);
  const boot = await bootstrap.json();
  assert.equal(boot.token, 'a'.repeat(64));
  assert.equal(boot.state.current, null);

  const denied = await globalThis.fetch(base + '/__guided_update_api', {
    method: 'POST',
    headers: {
      Origin: base,
      'Content-Type': 'application/json',
      'X-Guided-Update-Token': 'wrong',
    },
    body: JSON.stringify({ action: 'state' }),
  });
  assert.equal(denied.status, 403);

  const crossOrigin = await globalThis.fetch(base + '/__guided_update_api', {
    method: 'POST',
    headers: {
      Origin: 'https://example.invalid',
      'Content-Type': 'application/json',
      'X-Guided-Update-Token': 'a'.repeat(64),
    },
    body: JSON.stringify({ action: 'state' }),
  });
  assert.equal(crossOrigin.status, 403);

  const allowed = await globalThis.fetch(base + '/__guided_update_api', {
    method: 'POST',
    headers: {
      Origin: base,
      'Content-Type': 'application/json',
      'X-Guided-Update-Token': 'a'.repeat(64),
    },
    body: JSON.stringify({ action: 'example.action', payload: { x: 1 } }),
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual((await allowed.json()).result, {
    action: 'example.action',
    payload: { x: 1 },
  });
  assert.ok(calls.some(call => call.action === 'example.action'));
});

test('Gate 12L launcher replaces a stale same-repo server automatically', async t => {
  const port = await freePort();
  const repoRoot = resolve('.');
  const staleScript = [
    "const http = require('node:http');",
    "const port = Number(process.env.TEST_PORT);",
    "const root = process.env.TEST_ROOT;",
    "const server = http.createServer((req, res) => {",
    "  if (req.url === '/__guided_update_health') {",
    "    res.writeHead(200, {'Content-Type':'application/json'});",
    "    res.end(JSON.stringify({app:'dressup-strategy',feature:'guided-update',signature:'dressup-strategy-guided-update-v1',root,pid:process.pid}));",
    "    return;",
    "  }",
    "  res.writeHead(404); res.end('not found');",
    "});",
    "server.listen(port, '127.0.0.1');",
  ].join('\n');

  const stale = spawn(process.execPath, ['-e', staleScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      TEST_PORT: String(port),
      TEST_ROOT: repoRoot,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  t.after(() => {
    if (!stale.killed) {
      try { stale.kill(); } catch { /* already stopped by launcher */ }
    }
  });

  await waitForHttp('http://127.0.0.1:' + port + '/__guided_update_health');

  const result = spawnSync(process.execPath, [
    'scripts/launch-guided-update.mjs',
    '--no-open',
    '--ephemeral',
    '--port=' + port,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /偵測到舊版本機更新服務/);
  assert.match(result.stdout, /本機更新服務已就緒/);
  assert.match(result.stdout, /--ephemeral：測試服務已停止/);
  await waitForPortClosed(port);
});

test('Gate 12L privileged server exposes only Guided Update static assets', async t => {
  const port = await freePort();
  const runtime = createGuidedUpdateServer({
    port,
    service: { dispatch: async () => ({ current: null, sessions: [] }) },
    token: 'b'.repeat(64),
  });
  await runtime.start();
  t.after(() => runtime.stop());
  const base = 'http://127.0.0.1:' + port;

  const page = await globalThis.fetch(base + '/guided-update/');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Guided Update/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);

  assert.equal((await globalThis.fetch(base + '/guided-update/app.mjs')).status, 200);
  assert.equal((await globalThis.fetch(base + '/guided-update/guided-update.css')).status, 200);
  assert.equal((await globalThis.fetch(base + '/ui-foundation.css')).status, 200);
  assert.equal((await globalThis.fetch(base + '/favicon.ico')).status, 200);
  assert.equal((await globalThis.fetch(base + '/package.json')).status, 404);
  assert.equal((await globalThis.fetch(base + '/scripts/update-session.mjs')).status, 404);
});

test('Gate 12L static UI contains six guided steps and no inline event handlers', () => {
  const html = readFileSync(new URL('../guided-update/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../guided-update/app.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../guided-update/guided-update.css', import.meta.url), 'utf8');

  for (const id of [
    'step-session',
    'step-collect',
    'step-completeness',
    'step-review',
    'step-apply',
    'step-closeout',
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.match(html, /type="module" src="\/guided-update\/app\.mjs"/);
  assert.equal((html.match(/data-requires-session/g) || []).length, 5);
  assert.match(html, /請先完成 Step 1/);
  assert.match(html, /href="\/favicon\.ico"/);
  assert.match(html, /id="wardrobe-add-all"/);
  assert.match(html, /id="wardrobe-search-summary"/);
  assert.match(html, /id="wardrobe-category"/);
  assert.match(app, /SESSION_REQUIRED_ACTIONS/);
  assert.match(app, /wardrobe\.collect-search/);
  assert.match(app, /請先完成 Step 1：建立或啟用一個進行中的「本次更新」/);
  assert.match(app, /apply\.preview/);
  assert.match(app, /closeout\.complete/);
  assert.match(css, /\.gu-prerequisite/);
  assert.match(css, /\.gu-search-filters/);
  assert.match(css, /@media only screen and \(max-width: 650px\)/);
});

test('Gate 12L package and double-click launcher expose the daily entry point', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const bat = readFileSync(new URL('../開啟資料更新.bat', import.meta.url), 'utf8');
  assert.equal(pkg.scripts['start:update'], 'node scripts/launch-guided-update.mjs');
  assert.match(bat, /launch-guided-update\.mjs/);
});
