import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  createValidatedCivilLayoutV2Fake,
} from './civil-layout-v2-fake.js';
import { UniversalLayoutV2ValidationError } from './v2/universal-v2-contract-export.js';

const endpointPath = '/api/dev/universal-layout/v2-fake';
const maxBodyBytes = 4096;

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(value));
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let tooLarge = false;
    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBodyBytes) {
        if (!tooLarge) reject(new Error('BODY_TOO_LARGE'));
        tooLarge = true;
        return;
      }
      if (!tooLarge) chunks.push(buffer);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function civilLayoutV2FakeMiddleware() {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    if ((request.url ?? '/').split('?')[0] !== endpointPath) return next();
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { accepted: false, error: 'METHOD_NOT_ALLOWED' });
    }
    if (!request.headers['content-type']?.toLowerCase().includes('application/json')) {
      return sendJson(response, 415, { accepted: false, error: 'JSON_REQUIRED' });
    }
    if (Number(request.headers['content-length'] ?? 0) > maxBodyBytes) {
      request.resume();
      return sendJson(response, 413, { accepted: false, error: 'REQUEST_TOO_LARGE' });
    }

    let input: unknown;
    try {
      input = JSON.parse((await readBody(request)).toString('utf8'));
    } catch (error) {
      const oversized = error instanceof Error && error.message === 'BODY_TOO_LARGE';
      return sendJson(response, oversized ? 413 : 400, {
        accepted: false,
        error: oversized ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
      });
    }

    try {
      const result = createValidatedCivilLayoutV2Fake(input);
      return sendJson(response, 200, {
        accepted: true,
        model: result.model,
        plan: result.plan,
      });
    } catch (error) {
      if (error instanceof UniversalLayoutV2ValidationError) {
        return sendJson(response, 200, { accepted: false, error: error.code });
      }
      return sendJson(response, 400, { accepted: false, error: 'INVALID_FAKE_REQUEST' });
    }
  };
}

export const civilLayoutV2FakePlugin: Plugin = {
  name: 'civil-kiosk-universal-layout-v2-local-fake',
  configureServer(server) {
    server.middlewares.use(civilLayoutV2FakeMiddleware());
  },
};
