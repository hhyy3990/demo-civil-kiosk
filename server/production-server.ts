import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQrProfileRelay } from '../src/server/qr-profile-relay.js';
import { createCivilProductionV2Middleware } from '../universal-layout/central-v2-production-relay.js';

process.env.NODE_ENV ??= 'production';

const rootDir = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const staticRoot = resolve(rootDir, 'dist');
const port = Number.parseInt(process.env.PORT ?? '5000', 10);

const qrRelay = createQrProfileRelay({
  accessToken: process.env.QR_PROFILE_PRODUCTION_ACCESS_TOKEN,
  logger: (message) => console.info(message),
});

const productionV2Relay = createCivilProductionV2Middleware({
  productionRuntime: process.env.NODE_ENV === 'production',
  enabled: process.env.CIVIL_UNIVERSAL_LAYOUT_V2_PRODUCTION_RELAY_ENABLED === 'true',
  hostPolicyVerified: process.env.CIVIL_UNIVERSAL_LAYOUT_V2_PRODUCTION_HOST_POLICY_VERIFIED === 'true',
  centralProductionUrl: process.env.CIVIL_UNIVERSAL_LAYOUT_CENTRAL_PRODUCTION_URL,
  hostAiToken: process.env.CIVIL_UNIVERSAL_LAYOUT_HOST_AI_TOKEN,
  sessionSecret: process.env.SESSION_SECRET,
  onDiagnostic: (stage, fields) => {
    console.info('[civil-production-v2]', JSON.stringify({ stage, ...fields }));
  },
});

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(body));
}

async function serveStatic(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://local.invalid').pathname);
  } catch {
    return sendJson(response, 400, { error: 'INVALID_PATH' });
  }
  if (pathname.includes('\0')) return sendJson(response, 400, { error: 'INVALID_PATH' });
  if (pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'NOT_FOUND' });

  const relativePath = normalize(pathname).replace(/^([/\\])+/, '');
  const candidate = resolve(staticRoot, relativePath || 'index.html');
  if (candidate !== staticRoot && !candidate.startsWith(`${staticRoot}${sep}`)) {
    return sendJson(response, 400, { error: 'INVALID_PATH' });
  }

  let filePath = candidate;
  try {
    await access(filePath);
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) throw new Error('NOT_FILE');
  } catch {
    if (extname(pathname)) return sendJson(response, 404, { error: 'NOT_FOUND' });
    filePath = resolve(staticRoot, 'index.html');
  }
  try {
    const fileInfo = await stat(filePath);
    response.statusCode = 200;
    response.setHeader('Content-Type', contentTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
    response.setHeader(
      'Cache-Control',
      filePath.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Length', fileInfo.size);
    if (request.method === 'HEAD') return response.end();
    createReadStream(filePath).on('error', () => {
      if (!response.headersSent) sendJson(response, 500, { error: 'STATIC_READ_FAILED' });
      else response.destroy();
    }).pipe(response);
  } catch {
    return sendJson(response, 503, { error: 'APP_BUILD_NOT_FOUND' });
  }
}

async function dispatchProductionRelay(
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) {
  try {
    await productionV2Relay(request, response, next);
  } catch {
    if (!response.headersSent) sendJson(response, 500, { error: 'INTERNAL_ERROR' });
    else response.destroy();
  }
}

const server = createServer((request, response) => {
  qrRelay(request, response, (error) => {
    if (error) return sendJson(response, 500, { error: 'INTERNAL_ERROR' });
    void dispatchProductionRelay(request, response, (relayError) => {
      if (relayError) return sendJson(response, 500, { error: 'INTERNAL_ERROR' });
      void serveStatic(request, response);
    });
  });
});

server.listen(port, '0.0.0.0', () => {
  console.info(`[civil-production-server] listening port=${port}`);
});
