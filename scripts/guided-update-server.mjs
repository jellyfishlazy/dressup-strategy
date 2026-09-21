#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import http from 'node:http';
import {
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import {
  extname,
  join,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGuidedUpdateService } from './guided-update-service.mjs';
import {
  GUIDED_UPDATE_SERVER_SIGNATURE,
  guidedUpdateRuntimeFingerprint,
} from './guided-update-runtime.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const RUNTIME_FINGERPRINT = guidedUpdateRuntimeFingerprint();
const HOST = '127.0.0.1';
const DEFAULT_PORT = 8127;
const MAX_BODY_BYTES = 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function securityHeaders() {
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  };
}

function json(res, status, value) {
  res.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(value));
}

function text(res, status, value) {
  res.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end(String(value));
}

function parseRequestBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejectBody(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const textBody = Buffer.concat(chunks).toString('utf8');
        resolveBody(textBody ? JSON.parse(textBody) : {});
      } catch (error) {
        rejectBody(new Error('request body must be valid JSON: ' + error.message));
      }
    });
    req.on('error', rejectBody);
  });
}

function allowedStaticPath(urlPath) {
  if (urlPath === '/' || urlPath === '/guided-update' || urlPath === '/guided-update/') {
    return join(REPO_ROOT, 'guided-update', 'index.html');
  }
  if (urlPath === '/ui-foundation.css') {
    return join(REPO_ROOT, 'ui-foundation.css');
  }
  if (urlPath === '/favicon.ico') {
    return join(REPO_ROOT, 'favicon.ico');
  }
  if (urlPath.startsWith('/guided-update/')) {
    const relative = urlPath.slice('/guided-update/'.length);
    if (!relative || relative.includes('..') || relative.includes('\\')) return null;
    const path = resolve(REPO_ROOT, 'guided-update', relative);
    const root = resolve(REPO_ROOT, 'guided-update');
    if (!path.startsWith(root)) return null;
    return path;
  }
  return null;
}

function expectedOrigin(port) {
  return 'http://' + HOST + ':' + port;
}

function sameOriginRequest(req, port) {
  const origin = req.headers.origin;
  const fetchSite = req.headers['sec-fetch-site'];
  if (origin && origin !== expectedOrigin(port)) return false;
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return false;
  return true;
}

export function createGuidedUpdateServer({
  port = DEFAULT_PORT,
  service = createGuidedUpdateService(),
  token = randomBytes(32).toString('hex'),
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('invalid Guided Update port');
  }
  if (!service || typeof service.dispatch !== 'function') {
    throw new Error('invalid Guided Update service');
  }
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('invalid Guided Update token');
  }

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', expectedOrigin(port));
    const urlPath = decodeURIComponent(requestUrl.pathname);

    try {
      if (req.method === 'GET' && urlPath === '/__guided_update_health') {
        json(res, 200, {
          app: 'dressup-strategy',
          feature: 'guided-update',
          signature: GUIDED_UPDATE_SERVER_SIGNATURE,
          runtimeFingerprint: RUNTIME_FINGERPRINT,
          pid: process.pid,
          root: REPO_ROOT,
        });
        return;
      }

      if (req.method === 'GET' && urlPath === '/__guided_update_bootstrap') {
        if (!sameOriginRequest(req, port)) {
          json(res, 403, { ok: false, error: 'cross-origin bootstrap denied' });
          return;
        }
        json(res, 200, {
          ok: true,
          token,
          state: await service.dispatch('state', {}),
        });
        return;
      }

      if (urlPath === '/__guided_update_api') {
        if (req.method !== 'POST') {
          json(res, 405, { ok: false, error: 'POST required' });
          return;
        }
        if (!sameOriginRequest(req, port)) {
          json(res, 403, { ok: false, error: 'cross-origin request denied' });
          return;
        }
        if (req.headers['x-guided-update-token'] !== token) {
          json(res, 403, { ok: false, error: 'invalid Guided Update token' });
          return;
        }
        const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
        if (contentType !== 'application/json') {
          json(res, 415, { ok: false, error: 'application/json required' });
          return;
        }

        const body = await parseRequestBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)
          || typeof body.action !== 'string' || !body.action.trim()) {
          throw new Error('request requires action');
        }
        const result = await service.dispatch(body.action, body.payload || {});
        json(res, 200, { ok: true, result });
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        text(res, 405, 'method not allowed');
        return;
      }

      const filePath = allowedStaticPath(urlPath);
      if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
        text(res, 404, 'not found');
        return;
      }
      const mime = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
      const bytes = readFileSync(filePath);
      res.writeHead(200, {
        ...securityHeaders(),
        'Content-Type': mime,
        'Content-Length': bytes.length,
      });
      if (req.method === 'HEAD') res.end();
      else res.end(bytes);
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return {
    port,
    host: HOST,
    token,
    server,
    async start() {
      await new Promise((resolveStart, rejectStart) => {
        const onError = error => {
          server.off('listening', onListening);
          rejectStart(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolveStart();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, HOST);
      });
      return this;
    },
    async stop() {
      if (!server.listening) return;
      await new Promise((resolveStop, rejectStop) => {
        server.close(error => error ? rejectStop(error) : resolveStop());
      });
    },
    url: expectedOrigin(port) + '/guided-update/',
  };
}

function parseServerArgs(argv) {
  const options = {
    port: Number(process.env.GUIDED_UPDATE_PORT) || DEFAULT_PORT,
    workspace: null,
    outputRoot: null,
    wardrobeSource: null,
    levelsSource: null,
    canonicalWardrobe: null,
  };
  const seen = new Set();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/s.exec(arg);
    if (!match) throw new Error('expected --option=value: ' + arg);
    const [, key, value] = match;
    if (!['port', 'workspace', 'output-root', 'wardrobe-source', 'levels-source', 'canonical-wardrobe'].includes(key)) {
      throw new Error('unknown option: --' + key);
    }
    if (seen.has(key)) throw new Error('duplicate option: --' + key);
    seen.add(key);
    if (!value.trim()) throw new Error('--' + key + ' must not be empty');
    if (key === 'port') options.port = Number(value);
    else if (key === 'workspace') options.workspace = resolve(value);
    else if (key === 'output-root') options.outputRoot = resolve(value);
    else if (key === 'wardrobe-source') options.wardrobeSource = resolve(value);
    else if (key === 'levels-source') options.levelsSource = resolve(value);
    else options.canonicalWardrobe = resolve(value);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('invalid --port');
  }
  return options;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const options = parseServerArgs(process.argv.slice(2));
  const service = createGuidedUpdateService({
    ...(options.workspace ? { workspace: options.workspace } : {}),
    ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}),
    ...(options.wardrobeSource || options.levelsSource ? {
      sourceOptions: {
        ...(options.wardrobeSource ? { wardrobePath: options.wardrobeSource } : {}),
        ...(options.levelsSource ? { levelsPath: options.levelsSource } : {}),
      },
    } : {}),
    ...(options.canonicalWardrobe ? { canonicalWardrobePath: options.canonicalWardrobe } : {}),
  });
  const runtime = createGuidedUpdateServer({ port: options.port, service });
  runtime.start().then(() => {
    console.log('[Guided Update] listening on ' + runtime.url);
    console.log('[Guided Update] privileged local API enabled only on ' + HOST + ':' + options.port);
  }).catch(error => {
    console.error('[Guided Update] ERROR: ' + error.message);
    process.exitCode = 1;
  });
}
