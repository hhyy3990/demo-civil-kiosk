import {
  CENTRAL_QR_ORIGIN,
  isValidProfileToken,
} from '@naebangsik/kiosk-accessibility-sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';

const maxRequestBytes = 2048;

export type QrProfileRelayOptions = {
  accessToken?: string;
  fetcher?: typeof fetch;
  logger?: (message: string) => void;
};

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

function hasValidAccessToken(value: string | undefined): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.trim() === value
    && !/[\r\n]/.test(value);
}

function jsonContentType(value: string | null) {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json'
    || (mediaType?.startsWith('application/') === true && mediaType.endsWith('+json'));
}

function safeContentTypeLabel(value: string | null) {
  if (!value) return 'missing';
  return jsonContentType(value) ? 'json' : 'non-json';
}

export function createQrProfileRelay({
  accessToken,
  fetcher = fetch,
  logger,
}: QrProfileRelayOptions) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
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
    if (!hasValidAccessToken(accessToken)) {
      logger?.('[qr-profile-relay] request=blocked reason=production-access-token-not-configured');
      return sendJson(response, 503, { error: 'QR_PRODUCTION_ACCESS_TOKEN_NOT_CONFIGURED' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse((await readRequestBody(request)).toString('utf8'));
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
      const upstream = await fetcher(new URL('/api/profiles/resolve', CENTRAL_QR_ORIGIN), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        redirect: 'manual',
        body: JSON.stringify({ token }),
        signal: controller.signal,
      });

      const contentType = upstream.headers.get('content-type');
      const contentTypeLabel = safeContentTypeLabel(contentType);
      if (upstream.status >= 300 && upstream.status < 400) {
        logger?.(`[qr-profile-relay] upstream status=${upstream.status} content-type=${contentTypeLabel} result=redirect-blocked`);
        return sendJson(response, 502, { error: 'QR_UPSTREAM_REDIRECT_BLOCKED' });
      }
      if (upstream.status === 401 || upstream.status === 403) {
        logger?.(`[qr-profile-relay] upstream status=${upstream.status} content-type=${contentTypeLabel} result=production-access-denied`);
        return sendJson(response, 502, { error: 'QR_PRODUCTION_ACCESS_DENIED' });
      }
      if (!jsonContentType(contentType)) {
        logger?.(`[qr-profile-relay] upstream status=${upstream.status} content-type=${contentTypeLabel} result=non-json`);
        return sendJson(response, 502, { error: 'QR_UPSTREAM_NON_JSON' });
      }

      const result: unknown = await upstream.json().catch(() => null);
      if (!isRecord(result)) {
        logger?.(`[qr-profile-relay] upstream status=${upstream.status} content-type=${contentTypeLabel} result=invalid-json`);
        return sendJson(response, 502, { error: 'PROFILE_LOOKUP_FAILED' });
      }

      logger?.(`[qr-profile-relay] upstream status=${upstream.status} content-type=${contentTypeLabel} result=${upstream.ok ? 'accepted' : 'http-error'}`);
      if (upstream.status === 404) {
        return sendJson(response, 404, { error: 'QR_UNAVAILABLE' });
      }
      if (!upstream.ok) {
        const status = [400, 410, 422].includes(upstream.status) ? upstream.status : 502;
        return sendJson(response, status, { error: status === 502 ? 'PROFILE_LOOKUP_FAILED' : 'QR_UNAVAILABLE' });
      }

      return sendJson(response, 200, {
        schemaVersion: result.schemaVersion,
        preferences: result.preferences,
        updatedAt: result.updatedAt,
      });
    } catch {
      logger?.(`[qr-profile-relay] upstream result=${controller.signal.aborted ? 'timeout' : 'fetch-failed'}`);
      return sendJson(response, controller.signal.aborted ? 504 : 502, { error: 'PROFILE_LOOKUP_FAILED' });
    } finally {
      clearTimeout(timeout);
    }
  };
}
