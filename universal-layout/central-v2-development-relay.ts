import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { z } from 'zod';
import {
  canonicalUniversalJson,
  type UniversalLayoutV2Model,
  type UniversalLayoutV2Plan,
  validateUniversalLayoutV2Plan,
} from './v2/universal-v2-contract-export.js';
import {
  CIVIL_V2_COMPONENT_ID,
  CIVIL_V2_FAKE_HOST_ID,
  CIVIL_V2_OPTION_GROUP_ID,
  CIVIL_V2_SAFE_LIST_OPTION_ID,
  CIVIL_V2_SCREEN_ID,
  CIVIL_V2_STRUCTURE_VERSION,
  civilLayoutV2FakePolicies,
  createValidatedCivilLayoutV2Fake,
} from './civil-layout-v2-fake.js';
import {
  civilV2CentralEligibilitySchema,
  getCivilV2HostSafetyFailure,
} from './civil-layout-v2-host-safety.js';

const endpointPath = '/api/dev/universal-layout/v2-central-plan';
const centralEndpointPath = '/api/dev/universal-layout/v2/fake-plan';
const openAiEndpointPath = '/api/dev/universal-layout/v2/openai-plan';
const openAiRelayPath = '/api/dev/universal-layout/v2-openai-plan';
const maxRequestBytes = 8192;
const maxResponseBytes = 16_384;
const requestTimeoutMs = 10_000;
const successCacheMs = 15_000;

const safeCentralErrorCodes = new Set([
  'INVALID_MODEL',
  'UNSUPPORTED_HOST_SCREEN',
  'POLICY_COMPONENT_INVALID',
  'STRUCTURE_HASH_MISMATCH',
  'CONSTRAINT_HASH_MISMATCH',
  'COMPONENT_POLICY_MISMATCH',
  'UNSUPPORTED_LAYOUT_CAPABILITY',
  'PLAN_MODEL_MISMATCH',
  'UNSUPPORTED_PLAN_OPERATION',
  'DISALLOWED_COLUMN_COUNT',
  'UNSUPPORTED_OPTION_SELECTION',
  'INVALID_OPTION_SELECTION',
]);

const safeFetchCauseCodes = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'ERR_HTTP_INVALID_REDIRECT',
  'ERR_UNSUPPORTED_REDIRECT',
  'UND_ERR_REDIRECT',
]);
const redirectCauseCodes = new Set([
  'ERR_HTTP_INVALID_REDIRECT',
  'ERR_UNSUPPORTED_REDIRECT',
  'UND_ERR_REDIRECT',
]);
const safeFetchErrorNames = new Set([
  'Error',
  'TypeError',
  'AbortError',
  'DOMException',
  'AggregateError',
]);

const centralRelayRequestSchema = z.object({
  request: z.unknown(),
  eligibility: civilV2CentralEligibilitySchema,
}).strict();

type CentralRelayConfig = {
  enabled: boolean;
  centralEndpointPath?: typeof centralEndpointPath | typeof openAiEndpointPath;
  developmentUrl?: string;
  externalAccessToken?: string;
  serviceToken?: string;
  requestTimeoutMs?: number;
  successCacheMs?: number;
};

export type CentralV2Diagnostic = {
  stage:
    | 'browser-request'
    | 'upstream-fetch-start'
    | 'upstream-response'
    | 'upstream-response-error-code'
    | 'upstream-plan-rejected'
    | 'upstream-fetch-error';
  browserRequests: number;
  upstreamRequests: number;
  responseReceived?: boolean;
  status?: number;
  contentType?: string;
  errorCode?: string;
  errorOccurred?: boolean;
  errorName?: string;
  causeCode?: string;
  timeout?: boolean;
  redirectError?: boolean | null;
};

export type CentralV2RelayResult = {
  status: number;
  body: Record<string, unknown>;
};

type SuccessCacheEntry = {
  key: string;
  expiresAt: number;
  result: CentralV2RelayResult;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function classifyFetchError(error: unknown, timedOut: boolean, responseReceived: boolean) {
  try {
    const errorRecord = record(error);
    const rawName = typeof errorRecord?.name === 'string' ? errorRecord.name : '';
    const errorName = safeFetchErrorNames.has(rawName) ? rawName : 'Other';
    const cause = record(errorRecord?.cause);
    const rawCode = typeof cause?.code === 'string' ? cause.code : '';
    const causeCode = safeFetchCauseCodes.has(rawCode) ? rawCode : undefined;
    const redirectError = responseReceived || timedOut
      ? false
      : redirectCauseCodes.has(rawCode)
        ? true
        : causeCode
          ? false
          : null;

    return {
      errorName,
      ...(causeCode ? { causeCode } : {}),
      timeout: timedOut,
      redirectError,
    };
  } catch {
    return {
      errorName: 'Other',
      timeout: timedOut,
      redirectError: responseReceived || timedOut ? false : null,
    };
  }
}

export function formatCentralV2Diagnostic(diagnostic: CentralV2Diagnostic): string {
  const fields = [
    `[civil-universal-layout-v2] stage=${diagnostic.stage}`,
    `browser-requests=${diagnostic.browserRequests}`,
    `upstream-requests=${diagnostic.upstreamRequests}`,
  ];
  if (diagnostic.responseReceived !== undefined) {
    fields.push(`response-received=${diagnostic.responseReceived ? 'yes' : 'no'}`);
  }
  if (diagnostic.status !== undefined) fields.push(`upstream-status=${diagnostic.status}`);
  if (diagnostic.contentType !== undefined) fields.push(`content-type=${diagnostic.contentType}`);
  if (diagnostic.errorCode) fields.push(`error-code=${diagnostic.errorCode}`);
  if (diagnostic.errorOccurred !== undefined) fields.push(`error-occurred=${diagnostic.errorOccurred}`);
  if (diagnostic.errorName) fields.push(`error-name=${diagnostic.errorName}`);
  if (diagnostic.causeCode) fields.push(`cause-code=${diagnostic.causeCode}`);
  if (diagnostic.timeout !== undefined) fields.push(`timeout=${diagnostic.timeout}`);
  if (diagnostic.redirectError !== undefined) {
    fields.push(`redirect-error=${diagnostic.redirectError === null ? 'unknown' : diagnostic.redirectError}`);
  }
  return fields.join(' ');
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

function buildCentralEndpoint(config: CentralRelayConfig): URL | null {
  if (!config.externalAccessToken) return null;
  const origin = safeDevelopmentOrigin(config.developmentUrl);
  if (!origin) return null;
  const endpoint = new URL(config.centralEndpointPath ?? centralEndpointPath, origin.origin);
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

async function safeCentralErrorCode(response: Response, contentType: string): Promise<string | undefined> {
  if (!isJsonMediaType(contentType)) {
    try {
      await response.body?.cancel();
    } catch {
      // Diagnostics must not change relay behavior.
    }
    return undefined;
  }

  try {
    const body = record(await readLimitedJson(response));
    const candidate = body?.code ?? body?.errorCode ?? body?.error;
    return typeof candidate === 'string' && safeCentralErrorCodes.has(candidate)
      ? candidate
      : undefined;
  } catch {
    return undefined;
  }
}

function emitDiagnostic(
  sink: ((diagnostic: CentralV2Diagnostic) => void) | undefined,
  diagnostic: CentralV2Diagnostic,
) {
  try {
    sink?.(diagnostic);
  } catch {
    // Diagnostics must not change whether a plan is accepted.
  }
}

function createModelFromRelayRequest(input: unknown):
  | { ok: true; model: UniversalLayoutV2Model }
  | { ok: false; result: CentralV2RelayResult } {
  const envelope = centralRelayRequestSchema.safeParse(input);
  if (!envelope.success) {
    return { ok: false, result: { status: 400, body: { accepted: false, error: 'INVALID_RELAY_REQUEST' } } };
  }

  const request = record(envelope.data.request);
  const viewport = record(request?.viewport);
  const accessibility = record(request?.accessibility);
  const layoutCapabilities = request?.layoutCapabilities;
  const safetyFailure = getCivilV2HostSafetyFailure(
    request,
    envelope.data.eligibility,
  );
  if (safetyFailure) {
    return { ok: false, result: { status: 409, body: { accepted: false, error: safetyFailure } } };
  }
  if (
    !request
    || !viewport
    || !accessibility
    || viewport.width !== 1080
    || viewport.height !== 1920
    || request.screenId !== CIVIL_V2_SCREEN_ID
    || accessibility.textScale !== 'standard'
    || accessibility.buttonScale !== 'standard'
    || accessibility.contrast !== 'standard'
    || accessibility.viewportMode !== null
    || !Array.isArray(layoutCapabilities)
    || !layoutCapabilities.includes('reserved-bottom-controls')
  ) {
    return { ok: false, result: { status: 409, body: { accepted: false, error: 'CENTRAL_PROFILE_UNSUPPORTED' } } };
  }

  try {
    const { model } = createValidatedCivilLayoutV2Fake(request);
    if (
      model.hostId !== CIVIL_V2_FAKE_HOST_ID
      || model.screenId !== CIVIL_V2_SCREEN_ID
      || model.structureVersion !== CIVIL_V2_STRUCTURE_VERSION
      || model.components.length !== 1
      || model.components[0]?.id !== CIVIL_V2_COMPONENT_ID
      || model.components[0]?.minimumTouchTargetPx !== 44
    ) {
      return { ok: false, result: { status: 400, body: { accepted: false, error: 'INVALID_RELAY_MODEL' } } };
    }
    return { ok: true, model };
  } catch {
    return { ok: false, result: { status: 400, body: { accepted: false, error: 'INVALID_RELAY_MODEL' } } };
  }
}

function mapCentralFailure(status: number): CentralV2RelayResult {
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

export function createCentralV2PlanForwarder(
  config: CentralRelayConfig,
  fetchImpl: typeof fetch = fetch,
  onDiagnostic?: (diagnostic: CentralV2Diagnostic) => void,
) {
  let browserRequests = 0;
  let upstreamRequests = 0;
  let upstreamConsumed = false;
  let inFlight: { key: string; promise: Promise<CentralV2RelayResult> } | null = null;
  let cache: SuccessCacheEntry | null = null;

  const reportCounts = (
    stage: CentralV2Diagnostic['stage'],
    extra: Omit<Partial<CentralV2Diagnostic>, 'stage'> = {},
  ) => emitDiagnostic(onDiagnostic, { stage, browserRequests, upstreamRequests, ...extra });

  return async (input: unknown): Promise<CentralV2RelayResult> => {
    browserRequests += 1;
    reportCounts('browser-request');

    if (!config.enabled) return { status: 404, body: { accepted: false, error: 'RELAY_DISABLED' } };
    if (!config.serviceToken || !buildCentralEndpoint(config)) {
      return { status: 503, body: { accepted: false, error: 'CENTRAL_RELAY_NOT_CONFIGURED' } };
    }

    const created = createModelFromRelayRequest(input);
    if (!created.ok) return created.result;
    const model = created.model;
    const key = canonicalUniversalJson(model);

    if (cache && cache.key === key && cache.expiresAt > Date.now()) {
      return cache.result;
    }
    if (cache && cache.expiresAt <= Date.now()) cache = null;

    if (inFlight) {
      if (inFlight.key === key) return inFlight.promise;
      return { status: 409, body: { accepted: false, error: 'DIFFERENT_MODEL_ALREADY_PENDING' } };
    }
    if (upstreamConsumed) {
      return { status: 429, body: { accepted: false, error: 'CENTRAL_UPSTREAM_BUDGET_EXHAUSTED' } };
    }

    const endpoint = buildCentralEndpoint(config);
    if (!endpoint) return { status: 503, body: { accepted: false, error: 'CENTRAL_RELAY_NOT_CONFIGURED' } };

    // Consume the process-wide budget before fetch; failure and timeout are never retried.
    upstreamConsumed = true;
    upstreamRequests += 1;

    const promise = (async (): Promise<CentralV2RelayResult> => {
      const controller = new AbortController();
      let timedOut = false;
      let responseReceived = false;
      let responseStatus: number | undefined;
      let responseContentType: string | undefined;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, config.requestTimeoutMs ?? requestTimeoutMs);

      try {
        reportCounts('upstream-fetch-start');
        const upstream = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.serviceToken}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          redirect: 'error',
          body: JSON.stringify({ model }),
          signal: controller.signal,
        });
        responseReceived = true;
        responseStatus = upstream.status;
        const contentType = safeMediaType(upstream.headers.get('content-type'));
        responseContentType = contentType;
        reportCounts('upstream-response', {
          responseReceived: true,
          status: upstream.status,
          contentType,
          timeout: false,
        });

        if (!upstream.ok) {
          const errorCode = await safeCentralErrorCode(upstream, contentType);
          const result = mapCentralFailure(upstream.status);
          if (errorCode) {
            reportCounts('upstream-response-error-code', {
              responseReceived: true,
              status: upstream.status,
              contentType,
              errorCode,
              timeout: false,
            });
          }
          return result;
        }

        let plan: UniversalLayoutV2Plan;
        try {
          if (!isJsonMediaType(contentType)) throw new Error('INVALID_CONTENT_TYPE');
          const responseBody: unknown = await readLimitedJson(upstream);
          plan = validateUniversalLayoutV2Plan(responseBody, model, civilLayoutV2FakePolicies);
          if (
            plan.hostId !== CIVIL_V2_FAKE_HOST_ID
            || plan.screenId !== CIVIL_V2_SCREEN_ID
            || plan.structureVersion !== CIVIL_V2_STRUCTURE_VERSION
            || plan.operations.length !== 1
            || plan.operations[0]?.type !== 'selectLayoutOption'
            || plan.operations[0].targetId !== CIVIL_V2_COMPONENT_ID
            || plan.operations[0].groupId !== CIVIL_V2_OPTION_GROUP_ID
            || plan.operations[0].optionId !== CIVIL_V2_SAFE_LIST_OPTION_ID
          ) throw new Error('UNEXPECTED_CENTRAL_PLAN');
        } catch {
          reportCounts('upstream-plan-rejected', {
            responseReceived: true,
            status: upstream.status,
            contentType,
            errorCode: 'INVALID_CENTRAL_PLAN',
            timeout: false,
          });
          return { status: 502, body: { accepted: false, error: 'INVALID_CENTRAL_PLAN' } };
        }

        const result: CentralV2RelayResult = { status: 200, body: { accepted: true, model, plan } };
        cache = {
          key,
          expiresAt: Date.now() + (config.successCacheMs ?? successCacheMs),
          result,
        };
        return result;
      } catch (error) {
        const errorCode = timedOut ? 'CENTRAL_REQUEST_TIMEOUT' : 'CENTRAL_NETWORK_ERROR';
        reportCounts('upstream-fetch-error', {
          responseReceived,
          ...(responseStatus !== undefined ? { status: responseStatus } : {}),
          ...(responseContentType !== undefined ? { contentType: responseContentType } : {}),
          errorCode,
          errorOccurred: true,
          ...classifyFetchError(
            // Do not retain or emit the error message or stack; only allowlisted fields are extracted.
            error,
            timedOut,
            responseReceived,
          ),
        });
        return {
          status: timedOut ? 504 : 502,
          body: { accepted: false, error: timedOut ? 'CENTRAL_REQUEST_TIMEOUT' : 'CENTRAL_PLAN_FAILED' },
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

function centralV2Middleware(
  forward: ReturnType<typeof createCentralV2PlanForwarder>,
  localEndpointPath = endpointPath,
) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    if ((request.url ?? '/').split('?')[0] !== localEndpointPath) return next();
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { accepted: false, error: 'METHOD_NOT_ALLOWED' });
    }
    if (!sameOrigin(request)) return sendJson(response, 403, { accepted: false, error: 'ORIGIN_NOT_ALLOWED' });
    if (!request.headers['content-type']?.toLowerCase().includes('application/json')) {
      return sendJson(response, 415, { accepted: false, error: 'JSON_REQUIRED' });
    }
    if (Number(request.headers['content-length'] ?? 0) > maxRequestBytes) {
      request.resume();
      return sendJson(response, 413, { accepted: false, error: 'REQUEST_TOO_LARGE' });
    }

    let input: unknown;
    try {
      input = JSON.parse((await readRequestBody(request)).toString('utf8'));
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'BODY_TOO_LARGE';
      return sendJson(response, tooLarge ? 413 : 400, {
        accepted: false,
        error: tooLarge ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
      });
    }

    const result = await forward(input);
    return sendJson(response, result.status, result.body);
  };
}

function createCentralV2RelayPlugin(
  env: NodeJS.ProcessEnv,
  variant: 'central-fake' | 'central-openai',
): Plugin {
  const productionRuntime = env.NODE_ENV === 'production';
  const v1MockEnabled = env.CIVIL_UNIVERSAL_LAYOUT_CENTRAL_RELAY_ENABLED === 'true';
  const v1OpenAiEnabled = env.CIVIL_UNIVERSAL_LAYOUT_OPENAI_RELAY_ENABLED === 'true';
  const v2CentralEnabled = env.CIVIL_UNIVERSAL_LAYOUT_V2_CENTRAL_RELAY_ENABLED === 'true';
  const v2OpenAiEnabled = env.CIVIL_UNIVERSAL_LAYOUT_V2_OPENAI_RELAY_ENABLED === 'true';
  const optIn = variant === 'central-fake' ? v2CentralEnabled : v2OpenAiEnabled;
  const hasConflict = v1MockEnabled
    || v1OpenAiEnabled
    || (variant === 'central-fake' ? v2OpenAiEnabled : v2CentralEnabled);
  const config: CentralRelayConfig = {
    enabled: optIn && !productionRuntime && !hasConflict,
    centralEndpointPath: variant === 'central-openai' ? openAiEndpointPath : centralEndpointPath,
    developmentUrl: env.CIVIL_UNIVERSAL_LAYOUT_CENTRAL_DEV_URL,
    externalAccessToken: env.CIVIL_UNIVERSAL_LAYOUT_EXTERNAL_ACCESS_TOKEN,
    serviceToken: env.AI_LAYOUT_SERVICE_TOKEN,
  };

  return {
    name: variant === 'central-openai'
      ? 'civil-kiosk-universal-layout-v2-openai-development-relay'
      : 'civil-kiosk-universal-layout-v2-central-development-relay',
    apply: 'serve',
    configureServer(server) {
      if (productionRuntime || server.config.mode === 'production') return;
      const mode = !optIn ? 'off' : config.enabled ? 'on' : 'blocked-conflict';
      server.config.logger.info(
        `[civil-universal-layout-v2] ${variant === 'central-openai' ? 'openai-relay' : 'central-relay'}=${mode}`,
      );
      const forward = createCentralV2PlanForwarder(config, fetch, (diagnostic) => {
        server.config.logger.info(formatCentralV2Diagnostic(diagnostic));
      });
      server.middlewares.use(centralV2Middleware(
        forward,
        variant === 'central-openai' ? openAiRelayPath : endpointPath,
      ));
    },
  };
}

export function createCentralV2DevelopmentRelayPlugin(
  env: NodeJS.ProcessEnv = process.env,
): Plugin {
  return createCentralV2RelayPlugin(env, 'central-fake');
}

export function createCentralV2OpenAiDevelopmentRelayPlugin(
  env: NodeJS.ProcessEnv = process.env,
): Plugin {
  return createCentralV2RelayPlugin(env, 'central-openai');
}
