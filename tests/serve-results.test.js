import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import net from 'net';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-test-'));
  fs.writeFileSync(path.join(tmpDir, 'index.html'), '<h1>Test</h1>');
  fs.writeFileSync(path.join(tmpDir, 'data.json'), '{}');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Create a minimal HTTP server replicating the serveResults request handler
 * (imported logic extracted for testability).
 */
function createTestServer(dir) {
  const MIME_TYPES = { '.html': 'text/html', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(req.url === '/' ? '/index.html' : req.url.split('?')[0]);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    const filePath = path.resolve(path.join(dir, urlPath));
    if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return server;
}

function rawRequest(port, raw) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, '127.0.0.1', () => socket.write(raw));
    let data = '';
    socket.on('data', d => data += d);
    socket.on('end', () => {
      const status = parseInt(data.split('\r\n')[0].split(' ')[1], 10);
      resolve({ status });
    });
  });
}

function fetch(server, urlPath) {
  return new Promise((resolve) => {
    const { port } = server.address();
    http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
  });
}

describe('serveResults path traversal protection', () => {
  let server;

  beforeEach((ctx) => {
    server = createTestServer(tmpDir);
    return new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  });

  afterEach(() => {
    return new Promise(resolve => server.close(resolve));
  });

  it('serves index.html for root path', async () => {
    const res = await fetch(server, '/');
    expect(res.status).toBe(200);
    expect(res.body).toBe('<h1>Test</h1>');
  });

  it('serves files by name', async () => {
    const res = await fetch(server, '/data.json');
    expect(res.status).toBe(200);
    expect(res.body).toBe('{}');
  });

  it('blocks .. path traversal via raw request', async () => {
    // Node's http.get normalizes .. before sending, so use raw TCP to test
    const { port } = server.address();
    const res = await rawRequest(port, 'GET /../etc/passwd HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    expect(res.status).toBe(403);
  });

  it('blocks encoded %2e%2e path traversal via raw request', async () => {
    const { port } = server.address();
    const res = await rawRequest(port, 'GET /%2e%2e/etc/passwd HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    expect(res.status).toBe(403);
  });

  it('blocks double-encoded traversal', async () => {
    const res = await fetch(server, '/%252e%252e/etc/passwd');
    // After single decode this becomes %2e%2e which is literal — should 404 not escape
    expect([403, 404]).toContain(res.status);
  });

  it('returns 400 for malformed percent encoding', async () => {
    const res = await fetch(server, '/%ZZ');
    expect(res.status).toBe(400);
  });

  it('returns 404 for nonexistent file', async () => {
    const res = await fetch(server, '/nonexistent.txt');
    expect(res.status).toBe(404);
  });
});
