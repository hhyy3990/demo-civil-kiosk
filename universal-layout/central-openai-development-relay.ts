import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { canonicalUniversalJson, validateUniversalLayoutPlan, type UniversalLayoutPlan } from './universal-layout-contract.js';
import { civilLayoutMockPolicies } from './civil-layout-mock.js';
import { parseStandardCivilRequestModel, type RelayResult } from './central-development-relay.js';

const endpointPath = '/api/dev/universal-layout/openai-plan';
const maxRequestBytes = 4096;
const maxResponseBytes = 16_384;
const requestTimeoutMs = 20_000;
const successCacheMs = 15_000;

type RelayConfig = {
  enabled: boolean;
  mockRelayEnabled: boolean;
  developmentUrl?: string;
  externalAccessToken?: string;
  serviceToken?: string;
  requestTimeoutMs?: number;
  successCacheMs?: number;
};

type Diagnostic = {
  browserRequests: number;
  upstreamRequests: number;
  status?: number;
  contentType?: string;
  errorCode?: string;
};

type CacheEntry = {
  key: string;
  expiresAt: number;
  result: RelayResult;
};

function safeDevelopmentOrigin(value?: string): URL | null {
  if (!value) return null;
  try {
    const base = new URL(value);
    if (
      base.protocol !== 'https:'
      || !base.hostname.endsWith('.replit.dev')
      || base.username
      || base.password
      || base.search
      || base.hash
      || (base.pathname !== '/' && base.pathname !== '')
    ) return null;
    return base;
  } catch {
    return null;
  }
}

function safeEndpoint(config: RelayConfig): URL | null {
  if (!config.externalAccessToken) return null;
  const origin = safeDevelopmentOrigin(config.developmentUrl);
  if (!origin) return null;
  const endpoint = new URL(endpointPath, origin.origin);
  endpoint.searchParams.set('project-protection-bypass', config.externalAccessToken);
  return endpoint;
}

function safeMediaType(headerValue: string | null): string {
  if (!headerValue) return 'missing';
  const mediaType = headerValue.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType) ? mediaType : 'invalid';
}

function isJsonMediaType(mediaType: string): boolean {
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxResponseBytes || !response.body) throw new Error('INVALID_CENTRAL_PLAN');
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
        throw new Error('INVALID_CENTRAL_PLAN');
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

function safePlanErrorCode(value: unknown): string | undefined {
  const body = record(value);
  const candidate = body?.code ?? body?.errorCode ?? body?.error;
  const allowed = new Set([
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
  return typeof candidate === 'string' && allowed.has(candidate) ? candidate : undefined;
}

function emitDiagnostic(
  sink: ((diagnostic: Diagnostic) => void) | undefined,
  diagnostic: Diagnostic,
) {
  try {
    sink?.(diagnostic);
  } catch {
    // Diagnostic failures must not affect plan validation or delivery.
  }
}

function safeErrorResult(status: number): RelayResult {
  if (status === 401 || status === 403) {
    return { status: 502, body: { accepted: false, error: 'CENTRAL_AUTH_FAILED' } };
  }
  if (status === 400 || status === 404 || status === 422) {
    return { status: 422, body: { accepted: false, error: 'CENTRAL_MODEL_REJECTED' } };
  }
  if (status === 503) {
    return { status: 503, body: { accepted: false, error: 'CENTRAL_API_UNAVAILABLE' } };
  }
  return { status: 502, body: { accepted: false, error: 'CENTRAL_PLAN_FAILED' } };
}

export function createCentralOpenAiPlanForwarder(
  config: RelayConfig,
  fetchImpl: typeof fetch = fetch,
  onDiagnostic?: (diagnostic: Diagnostic) => void,
) {
  let browserRequests = 0;
  let upstreamRequests = 0;
  let upstreamConsumed = false;
  let inFlight: { key: string; promise: Promise<RelayResult> } | null = null;
  let cache: CacheEntry | null = null;

  const reportCounts = () => emitDiagnostic(onDiagnostic, { browserRequests, upstreamRequests });

  return async (input: unknown): Promise<RelayResult> => {
    browserRequests += 1;
    reportCounts();
    if (!config.enabled || config.mockRelayEnabled) {
      return { status: 404, body: { error: 'NOT_FOUND' } };
    }
    if (!config.serviceToken) {
      return { status: 503, body: { accepted: false, error: 'CENTRAL_RELAY_NOT_CONFIGURED' } };
    }
    const endpoint = safeEndpoint(config);
    if (!endpoint) {
      return { status: 503, body: { accepted: false, error: 'CENTRAL_RELAY_NOT_CONFIGURED' } };
    }

    const parsed = parseStandardCivilRequestModel(input);
    if (!parsed.ok) return parsed.result;
    if (parsed.model.viewportClass !== 'wide') {
      return { status: 409, body: { accepted: false, error: 'OPENAI_WIDE_VIEWPORT_REQUIRED' } };
    }
    const key = canonicalUniversalJson(parsed.model);
    if (cache && cache.key === key && cache.expiresAt > Date.now()) return cache.result;
    if (cache && cache.expiresAt <= Date.now()) cache = null;

    if (inFlight) {
      if (inFlight.key === key) return inFlight.promise;
      return { status: 409, body: { accepted: false, error: 'DIFFERENT_MODEL_ALREADY_PENDING' } };
    }
    if (upstreamConsumed) {
      return { status: 429, body: { accepted: false, error: 'OPENAI_UPSTREAM_BUDGET_EXHAUSTED' } };
    }

    // Consume the process budget before starting fetch: failures and timeouts are not retried.
    upstreamConsumed = true;
    upstreamRequests += 1;
    reportCounts();

    const promise = (async (): Promise<RelayResult> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs ?? requestTimeoutMs);
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
          let errorCode: string | undefined;
          if (isJsonMediaType(contentType)) {
            try {
              errorCode = safePlanErrorCode(await readLimitedJson(upstream));
            } catch {
              // Central response bodies are never exposed to the browser or logs.
            }
          } else {
            try {
              await upstream.body?.cancel();
            } catch {
              // Diagnostic cleanup must not affect the sanitized result.
            }
          }
          emitDiagnostic(onDiagnostic, {
            browserRequests,
            upstreamRequests,
            status: upstream.status,
            contentType,
            ...(errorCode ? { errorCode } : {}),
          });
          return safeErrorResult(upstream.status);
        }

        let plan: UniversalLayoutPlan;
        try {
          if (!isJsonMediaType(contentType)) throw new Error('INVALID_CONTENT_TYPE');
          const rawPlan: unknown = await readLimitedJson(upstream);
          plan = validateUniversalLayoutPlan(rawPlan, parsed.model, [civilLayoutMockPolicies.standard]);
        } catch {
          emitDiagnostic(onDiagnostic, {
            browserRequests,
            upstreamRequests,
            status: upstream.status,
            contentType,
            errorCode: 'INVALID_CENTRAL_PLAN',
          });
          return { status: 502, body: { accepted: false, error: 'INVALID_CENTRAL_PLAN' } };
        }

        const result: RelayResult = { status: 200, body: { accepted: true, plan } };
        cache = {
          key,
          expiresAt: Date.now() + (config.successCacheMs ?? successCacheMs),
          result,
        };
        emitDiagnostic(onDiagnostic, { browserRequests, upstreamRequests, status: upstream.status, contentType });
        return result;
      } catch {
        emitDiagnostic(onDiagnostic, {
          browserRequests,
          upstreamRequests,
          errorCode: controller.signal.aborted ? 'CENTRAL_REQUEST_TIMEOUT' : 'CENTRAL_NETWORK_ERROR',
        });
        return {
          status: controller.signal.aborted ? 504 : 502,
          body: {
            accepted: false,
            error: controller.signal.aborted ? 'CENTRAL_REQUEST_TIMEOUT' : 'CENTRAL_PLAN_FAILED',
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    })();

    inFlight = { key, promise };
    try {
      return await promise;
    } finally {
      if (inFlight?.promise === promise) inFlight = null;
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

function relayMiddleware(forward: ReturnType<typeof createCentralOpenAiPlanForwarder>) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    if ((request.url ?? '/').split('?')[0] !== endpointPath) return next();
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    if (!sameOrigin(request)) return sendJson(response, 403, { error: 'ORIGIN_NOT_ALLOWED' });
    if (!request.headers['content-type']?.toLowerCase().includes('application/json')) {
      return sendJson(response, 415, { error: 'JSON_REQUIRED' });
    }
    if (Number(request.headers['content-length'] ?? 0) > maxRequestBytes) {
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

    const result = await forward(input);
    return sendJson(response, result.status, result.body);
  };
}

export function createCentralOpenAiDevelopmentRelayPlugin(
  env: NodeJS.ProcessEnv = process.env,
): Plugin {
  const enabled = env.CIVIL_UNIVERSAL_LAYOUT_OPENAI_RELAY_ENABLED === 'true';
  const mockRelayEnabled = env.CIVIL_UNIVERSAL_LAYOUT_CENTRAL_RELAY_ENABLED === 'true';
  const config: RelayConfig = {
    enabled,
    mockRelayEnabled,
    developmentUrl: env.CIVIL_UNIVERSAL_LAYOUT_CENTRAL_DEV_URL,
    externalAccessToken: env.CIVIL_UNIVERSAL_LAYOUT_EXTERNAL_ACCESS_TOKEN,
    serviceToken: env.AI_LAYOUT_SERVICE_TOKEN,
  };

  return {
    name: 'civil-kiosk-universal-layout-openai-development-relay',
    configureServer(server) {
      const state = mockRelayEnabled && enabled
        ? 'blocked-conflict'
        : enabled
          ? 'on'
          : 'off';
      server.config.logger.info(`[civil-universal-layout] openai-relay=${state}`);

      const forward = createCentralOpenAiPlanForwarder(config, fetch, (diagnostic) => {
        const counts = `browser-requests=${diagnostic.browserRequests} upstream-requests=${diagnostic.upstreamRequests}`;
        if (diagnostic.status !== undefined) {
          server.config.logger.info(
            `[civil-universal-layout-openai] ${counts} upstream-status=${diagnostic.status}`
            + ` content-type=${diagnostic.contentType ?? 'missing'}`
            + (diagnostic.errorCode ? ` error-code=${diagnostic.errorCode}` : ''),
          );
          return;
        }
        if (diagnostic.errorCode) {
          server.config.logger.info(
            `[civil-universal-layout-openai] ${counts} upstream-transport=${diagnostic.errorCode}`,
          );
          return;
        }
        server.config.logger.info(`[civil-universal-layout-openai] ${counts}`);
      });
      server.middlewares.use(relayMiddleware(forward));
    },
  };
}
