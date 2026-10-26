import { CENTRAL_QR_ORIGIN, isValidProfileToken } from '@naebangsik/kiosk-accessibility-sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import {
  createValidatedCivilLayoutMock,
  UniversalLayoutValidationError,
} from './universal-layout/civil-layout-mock.js';
import { createCentralDevelopmentRelayPlugin } from './universal-layout/central-development-relay.js';

const replitHosts = [
  process.env.REPLIT_DEV_DOMAIN,
  ...(process.env.REPLIT_DOMAINS ?? '').split(',').map((host) => host.trim()),
].filter((host): host is string => Boolean(host));

const maxRequestBytes = 4096;

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(body));
}

function readRequestBody(request: IncomingMessage, bodyLimit = maxRequestBytes) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let oversized = false;

    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > bodyLimit) {
        if (!oversized) reject(new Error('BODY_TOO_LARGE'));
        oversized = true;
        return;
      }
      if (!oversized) chunks.push(buffer);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function qrProfileRelay() {
  return async (request: IncomingMessage, response: ServerResponse, next: (error?: any) => void) => {
    const pathname = (request.url ?? '/').split('?')[0];
    if (pathname !== '/api/qr-profile') return next();

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    if (!request.headers['content-type']?.toLowerCase().includes('application/json')) {
      return sendJson(response, 415, { error: 'JSON_REQUIRED' });
    }
    const contentLength = Number(request.headers['content-length'] ?? 0);
    if (contentLength > maxRequestBytes) {
      request.resume();
      return sendJson(response, 413, { error: 'REQUEST_TOO_LARGE' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse((await readRequestBody(request, 2048)).toString('utf8'));
    } catch (error) {
      return sendJson(response, error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400, {
        error: error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
      });
    }

    const token = isRecord(payload) && typeof payload.token === 'string' ? payload.token : '';
    if (!isValidProfileToken(token)) return sendJson(response, 400, { error: 'QR_UNAVAILABLE' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const upstream = await fetch(new URL('/api/profiles/resolve', CENTRAL_QR_ORIGIN), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ token }),
        signal: controller.signal,
      });

      if (!upstream.ok) {
        const status = [400, 401, 403, 404, 410, 422].includes(upstream.status) ? upstream.status : 502;
        return sendJson(response, status, { error: status === 502 ? 'PROFILE_LOOKUP_FAILED' : 'QR_UNAVAILABLE' });
      }

      const result: unknown = await upstream.json().catch(() => null);
      if (!isRecord(result)) return sendJson(response, 502, { error: 'PROFILE_LOOKUP_FAILED' });

      return sendJson(response, 200, {
        schemaVersion: result.schemaVersion,
        preferences: result.preferences,
        updatedAt: result.updatedAt,
      });
    } catch {
      return sendJson(response, controller.signal.aborted ? 504 : 502, { error: 'PROFILE_LOOKUP_FAILED' });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function universalLayoutMockRelay() {
  return async (request: IncomingMessage, response: ServerResponse, next: (error?: any) => void) => {
    const pathname = (request.url ?? '/').split('?')[0];
    if (pathname !== '/api/dev/universal-layout/mock') return next();

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    if (!request.headers['content-type']?.toLowerCase().includes('application/json')) {
      return sendJson(response, 415, { error: 'JSON_REQUIRED' });
    }
    const contentLength = Number(request.headers['content-length'] ?? 0);
    if (contentLength > 2048) {
      request.resume();
      return sendJson(response, 413, { error: 'REQUEST_TOO_LARGE' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse((await readRequestBody(request)).toString('utf8'));
    } catch (error) {
      return sendJson(response, error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400, {
        error: error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
      });
    }

    try {
      const result = createValidatedCivilLayoutMock(payload);
      return sendJson(response, 200, { accepted: true, plan: result.plan });
    } catch (error) {
      if (error instanceof UniversalLayoutValidationError) {
        return sendJson(response, 200, { accepted: false, error: error.code });
      }
      return sendJson(response, 400, { error: 'INVALID_MOCK_REQUEST' });
    }
  };
}

const qrProfileRelayPlugin: Plugin = {
  name: 'naebangsik-qr-profile-relay',
  configureServer(server) {
    server.middlewares.use(qrProfileRelay());
  },
  configurePreviewServer(server) {
    server.middlewares.use(qrProfileRelay());
  },
};

const universalLayoutMockPlugin: Plugin = {
  name: 'civil-kiosk-universal-layout-development-mock',
  configureServer(server) {
    server.middlewares.use(universalLayoutMockRelay());
  },
};

export default defineConfig({
  plugins: [
    react(),
    qrProfileRelayPlugin,
    universalLayoutMockPlugin,
    createCentralDevelopmentRelayPlugin(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: [...new Set(replitHosts)],
  },
});
