#!/usr/bin/env node
// Minimal static HTTP server for local development.
// Serves the repo root so cn-search can reference ../data and ../bootstrap.
// Default port: 8000. Override with PORT env var.

import http from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(import.meta.url), '..');
const moduleRoot = resolve(here, '..');
const root = resolve(moduleRoot, '..');
const port = Number(process.env.PORT) || 8000;

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.htm':  'text/html; charset=utf-8',
	'.js':   'application/javascript; charset=utf-8',
	'.mjs':  'application/javascript; charset=utf-8',
	'.css':  'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png':  'image/png',
	'.jpg':  'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif':  'image/gif',
	'.svg':  'image/svg+xml',
	'.ico':  'image/x-icon',
	'.woff': 'font/woff',
	'.woff2':'font/woff2',
	'.ttf':  'font/ttf',
	'.eot':  'application/vnd.ms-fontobject',
};

http.createServer((req, res) => {
	let urlPath = decodeURIComponent(req.url.split('?')[0]);
	if (urlPath === '/' || urlPath === '') urlPath = '/cn-search/index.html';
	if (urlPath.endsWith('/')) urlPath += 'index.html';
	const filePath = resolve(root, '.' + urlPath);
	if (!filePath.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
	if (!existsSync(filePath) || !statSync(filePath).isFile()) {
		res.writeHead(404); res.end('not found: ' + urlPath); return;
	}
	const mime = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
	res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
	res.end(readFileSync(filePath));
}).listen(port, () => {
	console.log('Dev server listening at http://localhost:' + port + '/cn-search/');
	console.log('  Repo root: ' + root);
});
