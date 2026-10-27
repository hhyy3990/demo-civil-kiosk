import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { z } from 'zod';
import { createValidatedCivilLayoutMock, civilLayoutMockPolicies } from './civil-layout-mock.js';
import { validateUniversalLayoutPlan, type UniversalLayoutPlan } from './universal-layout-contract.js';

const endpointPath = '/api/dev/universal-layout/plan';
const maxRequestBytes = 4096;
const maxResponseBytes = 16_384;
const requestTimeoutMs = 10_000;
const safeCentralErrorCodes = new Set([
  'INVALID_MODEL',
  'UNSUPPORTED_HOST_SCREEN',
  'POLICY_COMPONENT_INVALID',
  'STRUCTURE_HASH_MISMATCH',
  'CONSTRAINT_HASH_MISMATCH',
  'COMPONENT_POLICY_MISMATCH',
  'ACCESSIBILITY_CONSTRAINT_MISMATCH',
  'PLAN_MODEL_MISMATCH',
  'UNSUPPORTED_PLAN_OPERATION',
  'DISALLOWED_COLUMN_COUNT',
]);

type CentralDiagnostic =
  | {
    event: 'response';
    status: number;
    contentType: string;
    errorCode?: string;
  }
  | {
    event: 'transport-error';
    errorCode: 'CENTRAL_REQUEST_TIMEOUT' | 'CENTRAL_NETWORK_ERROR' | 'CLIENT_REQUEST_CANCELLED';
  };

type RelayConfig = {
  enabled: boolean;
  developmentUrl?: string;
  externalAccessToken?: string;
  serviceToken?: string;
  requestTimeoutMs?: number;
};

type RelayResult = {
  status: number;
  body: Record<string, unknown>;
};

const relayEnvelopeSchema = z.object({
  request: z.unknown(),
  eligibility: z.object({
    standardProfile: z.literal(true),
    geometryKnown: z.literal(true),
    hasFixedBottomControls: z.literal(false),
  }).strict(),
}).strict();

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeDevelopmentOrigin(value?: string): URL | null {
  if (!value) return null;
  try {
    const base = new URL(value);
    if (
      base.protocol !== 'https:'
      || !base.hostname
      || !base.hostname.endsWith('.replit.dev')
      || base.username
      || base.password
      || base.search
      || base.hash
      || (base.pathname !== '/' && base.pathname !== '')
      || base.hostname === 'localhost'
      || base.hostname.endsWith('.localhost')
      || /^\d+(?:\.\d+){3}$/.test(base.hostname)
      || base.hostname.includes(':')
    ) return null;
    return base;
  } catch {
    return null;
  }
}

function developmentUrlStatus(value?: string): 'missing' | 'invalid' | 'valid-development-origin' {
  if (!value) return 'missing';
  return safeDevelopmentOrigin(value) ? 'valid-development-origin' : 'invalid';
}

function safeEndpoint(config: RelayConfig): URL | null {
  if (!config.externalAccessToken) return null;
  const base = safeDevelopmentOrigin(config.developmentUrl);
  if (!base) return null;
  const endpoint = new URL(endpointPath, base.origin);
  endpoint.searchParams.set('project-protection-bypass', config.externalAccessToken);
  return endpoint;
}

function safeMediaType(headerValue: string | null): string {
  if (!headerValue) return 'missing';
  const mediaType = headerValue.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType)
    ? mediaType
    : 'invalid';
}

function isJsonMediaType(mediaType: string): boolean {
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

async function safeErrorCode(response: Response, mediaType: string): Promise<string | undefined> {
  if (!isJsonMediaType(mediaType)) {
    try {
      await response.body?.cancel();
    } catch {
      // Do not let diagnostic cleanup affect relay behavior.
    }
    return undefined;
  }

  try {
    const body = record(await readLimitedJson(response));
    const candidates = [body?.code, body?.errorCode, body?.error];
    return candidates.find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && safeCentralErrorCodes.has(candidate),
    );
  } catch {
    return undefined;
  }
}

function emitDiagnostic(
  sink: ((diagnostic: CentralDiagnostic) => void) | undefined,
  diagnostic: CentralDiagnostic,
) {
  try {
    sink?.(diagnostic);
  } catch {
    // Diagnostics must never change whether a plan is accepted.
  }
}

function parseRequestModel(input: unknown) {
  const envelope = relayEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return { ok: false as const, result: { status: 400, body: { accepted: false, error: 'INVALID_RELAY_REQUEST' } } };
  }

  const hostRequest = record(envelope.data.request);
  const viewport = record(hostRequest?.viewport);
  const accessibility = record(hostRequest?.accessibility);
  if (
    !hostRequest
    || !viewport
    || !accessibility
    || envelope.data.eligibility.hasFixedBottomControls
    || viewport.width <= 520
    || accessibility.textScale !== 'standard'
    || accessibility.buttonScale !== 'standard'
    || accessibility.contrast !== 'standard'
    || accessibility.bottomControls !== false
    || accessibility.viewportMode !== null
  ) {
    return { ok: false as const, result: { status: 409, body: { accepted: false, error: 'CENTRAL_PROFILE_UNSUPPORTED' } } };
  }

  try {
    // Reuse the host's checked v1 model builder; the local-only requested
    // column value is deliberately not sent to the central API.
    const { model } = createValidatedCivilLayoutMock(envelope.data.request);
    return { ok: true as const, model };
  } catch {
    return { ok: false as const, result: { status: 400, body: { accepted: false, error: 'INVALID_RELAY_MODEL' } } };
  }
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxResponseBytes) throw new Error('RESPONSE_TOO_LARGE');
  if (!response.body) throw new Error('EMPTY_RESPONSE');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxResponseBytes) {
        await reader.cancel();
        throw new Error('RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createCentralPlanForwarder(
  config: RelayConfig,
  fetchImpl: typeof fetch = fetch,
  onDiagnostic?: (diagnostic: CentralDiagnostic) => void,
) {
  const inFlight = new Set<string>();

  return async (input: unknown, clientSignal?: AbortSignal): Promise<RelayResult> => {
    if (!config.enabled) return { status: 404, body: { error: 'NOT_FOUND' } };
    if (!config.serviceToken) return { status: 503, body: { accepted: false, error: 'CENTRAL_RELAY_NOT_CONFIGURED' } };

    const endpoint = safeEndpoint(config);
    if (!endpoint) return { status: 503, body: { accepted: false, error: 'CENTRAL_RELAY_NOT_CONFIGURED' } };

    const parsed = parseRequestModel(input);
    if (!parsed.ok) return parsed.result;

    const requestKey = parsed.model.constraintHash + parsed.model.structureHash;
    if (inFlight.has(requestKey)) {
      return { status: 409, body: { accepted: false, error: 'DUPLICATE_REQUEST' } };
    }
    inFlight.add(requestKey);

    const controller = new AbortController();
    const abortForClient = () => controller.abort();
    if (clientSignal?.aborted) controller.abort();
    else clientSignal?.addEventListener('abort', abortForClient, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.requestTimeoutMs ?? requestTimeoutMs);

    try {
      const upstream = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.serviceToken}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        redirect: 'error',
        body: JSON.stringify({ model: parsed.model }),
        signal: controller.signal,
      });
      const contentType = safeMediaType(upstream.headers.get('content-type'));

      if (!upstream.ok) {
        const errorCode = await safeErrorCode(upstream, contentType);
        emitDiagnostic(onDiagnostic, {
          event: 'response',
          status: upstream.status,
          contentType,
          ...(errorCode ? { errorCode } : {}),
        });
        if (upstream.status === 401 || upstream.status === 403) {
          return { status: 502, body: { accepted: false, error: 'CENTRAL_AUTH_FAILED' } };
        }
        if (upstream.status === 400 || upstream.status === 404 || upstream.status === 422) {
          return { status: 422, body: { accepted: false, error: 'CENTRAL_MODEL_REJECTED' } };
        }
        if (upstream.status === 503) {
          return { status: 503, body: { accepted: false, error: 'CENTRAL_API_UNAVAILABLE' } };
        }
        return { status: 502, body: { accepted: false, error: 'CENTRAL_PLAN_FAILED' } };
      }

      let plan: UniversalLayoutPlan;
      try {
        if (!isJsonMediaType(contentType)) throw new Error('INVALID_CONTENT_TYPE');
        const responseBody: unknown = await readLimitedJson(upstream);
        plan = validateUniversalLayoutPlan(responseBody, parsed.model, [civilLayoutMockPolicies.standard]);
      } catch {
        emitDiagnostic(onDiagnostic, {
          event: 'response',
          status: upstream.status,
          contentType,
          errorCode: 'INVALID_CENTRAL_PLAN',
        });
        return { status: 502, body: { accepted: false, error: 'INVALID_CENTRAL_PLAN' } };
      }

      emitDiagnostic(onDiagnostic, {
        event: 'response',
        status: upstream.status,
        contentType,
      });
      return { status: 200, body: { accepted: true, plan } };
    } catch {
      const errorCode = clientSignal?.aborted
        ? 'CLIENT_REQUEST_CANCELLED'
        : timedOut
          ? 'CENTRAL_REQUEST_TIMEOUT'
          : 'CENTRAL_NETWORK_ERROR';
      emitDiagnostic(onDiagnostic, { event: 'transport-error', errorCode });
      return {
        status: controller.signal.aborted ? 504 : 502,
        body: { accepted: false, error: controller.signal.aborted ? 'CENTRAL_REQUEST_TIMEOUT' : 'CENTRAL_PLAN_FAILED' },
      };
    } finally {
      clearTimeout(timeout);
      clientSignal?.removeEventListener('abort', abortForClient);
      inFlight.delete(requestKey);
    }
  };
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(body));
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;

    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > maxRequestBytes) {
        if (!rejected) {
          rejected = true;
          reject(new Error('BODY_TOO_LARGE'));
        }
        return;
      }
      if (!rejected) chunks.push(buffer);
    });
    request.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
  });
}

function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function centralRelayMiddleware(forward: ReturnType<typeof createCentralPlanForwarder>) {
  return async (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
    const pathname = (request.url ?? '/').split('?')[0];
    if (pathname !== endpointPath) return next();
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    if (!sameOrigin(request)) return sendJson(response, 403, { error: 'ORIGIN_NOT_ALLOWED' });
    if (!request.headers['content-type']?.toLowerCase().includes('application/json')) {
      return sendJson(response, 415, { error: 'JSON_REQUIRED' });
    }
    const contentLength = Number(request.headers['content-length'] ?? 0);
    if (contentLength > maxRequestBytes) {
      request.resume();
      return sendJson(response, 413, { error: 'REQUEST_TOO_LARGE' });
    }

    let input: unknown;
    try {
      input = JSON.parse((await readRequestBody(request)).toString('utf8'));
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'BODY_TOO_LARGE';
      return sendJson(response, tooLarge ? 413 : 400, {
        error: tooLarge ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
      });
    }

    const clientController = new AbortController();
    response.on('close', () => {
      if (!response.writableEnded) clientController.abort();
    });
    const result = await forward(input, clientController.signal);
    return sendJson(response, result.status, result.body);
  };
}

export function createCentralDevelopmentRelayPlugin(
  env: NodeJS.ProcessEnv = process.env,
): Plugin {
  const enabled = env.CIVIL_UNIVERSAL_LAYOUT_CENTRAL_RELAY_ENABLED === 'true';
  const config: RelayConfig = {
    enabled,
    developmentUrl: env.CIVIL_UNIVERSAL_LAYOUT_CENTRAL_DEV_URL,
    externalAccessToken: env.CIVIL_UNIVERSAL_LAYOUT_EXTERNAL_ACCESS_TOKEN,
    serviceToken: env.AI_LAYOUT_SERVICE_TOKEN,
  };
  const forward = createCentralPlanForwarder(config);

  return {
    name: 'civil-kiosk-universal-layout-central-development-relay',
    configureServer(server) {
      const targetStatus = developmentUrlStatus(config.developmentUrl);
      server.config.logger.info(
        `[civil-universal-layout] relay=${enabled ? 'on' : 'off'} target-format=${targetStatus}`,
      );
      if (!enabled) return;
      const forward = createCentralPlanForwarder(config, fetch, (diagnostic) => {
        if (diagnostic.event === 'response') {
          server.config.logger.info(
            `[civil-universal-layout] upstream-status=${diagnostic.status} content-type=${diagnostic.contentType}`
            + (diagnostic.errorCode ? ` error-code=${diagnostic.errorCode}` : ''),
          );
          return;
        }
        server.config.logger.info(
          `[civil-universal-layout] upstream-transport=${diagnostic.errorCode}`,
        );
      });
      server.middlewares.use(centralRelayMiddleware(forward));
    },
  };
}
