import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createQrProfileRelay } from './src/server/qr-profile-relay.js';
import {
  createValidatedCivilLayoutMock,
  UniversalLayoutValidationError,
} from './universal-layout/civil-layout-mock.js';
import { createCentralDevelopmentRelayPlugin } from './universal-layout/central-development-relay.js';
import { createCentralOpenAiDevelopmentRelayPlugin } from './universal-layout/central-openai-development-relay.js';
import {
  createCentralV2DevelopmentRelayPlugin,
  createCentralV2OpenAiDevelopmentRelayPlugin,
} from './universal-layout/central-v2-development-relay.js';
import { civilLayoutV2FakePlugin } from './universal-layout/civil-layout-v2-fake-relay.js';

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
    server.middlewares.use(createQrProfileRelay({
      accessToken: process.env.QR_PROFILE_PRODUCTION_ACCESS_TOKEN,
      logger: (message) => server.config.logger.info(message),
    }));
  },
  configurePreviewServer(server) {
    server.middlewares.use(createQrProfileRelay({
      accessToken: process.env.QR_PROFILE_PRODUCTION_ACCESS_TOKEN,
      logger: (message) => server.config.logger.info(message),
    }));
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
    civilLayoutV2FakePlugin,
    createCentralDevelopmentRelayPlugin(),
    createCentralOpenAiDevelopmentRelayPlugin(),
    createCentralV2DevelopmentRelayPlugin(),
    createCentralV2OpenAiDevelopmentRelayPlugin(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: [...new Set(replitHosts)],
  },
});
