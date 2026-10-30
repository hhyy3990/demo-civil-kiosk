import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  canonicalUniversalJson,
  validateUniversalLayoutV2Plan,
  type UniversalLayoutV2Plan,
} from './v2/universal-v2-contract-export.js';
import {
  civilProductionV2Policies,
  createCivilProductionV2Model,
  type CivilProductionV2Request,
} from './civil-layout-v2-production.js';
import {
  CIVIL_V2_PRODUCTION_COMPONENT_ID,
  CIVIL_V2_PRODUCTION_HOST_ID,
  CIVIL_V2_PRODUCTION_OPTION_GROUP_ID,
  CIVIL_V2_PRODUCTION_OPTION_ID,
  CIVIL_V2_PRODUCTION_SCREEN_ID,
  CIVIL_V2_PRODUCTION_STRUCTURE_VERSION,
} from './civil-layout-v2-production-constants.js';
import {
  civilV2HostEligibilitySchema,
  getCivilV2HostSafetyFailure,
} from './civil-layout-v2-host-safety.js';

export const CIVIL_V2_PRODUCTION_PLAN_PATH = '/api/production/universal-layout/v2/openai-plan';
export const CIVIL_V2_PRODUCTION_STATUS_PATH = '/api/production/universal-layout/v2/status';

const maxBodyBytes = 12_288;
const maxResponseBytes = 16_384;
const requestTimeoutMs = 12_000;
const maxProviderAttemptsPerProcess = 30;
const idempotencyTtlMs = 30 * 60_000;
const sessionCookieName = 'civil_v2_ai_session';

const productionEnvelopeSchema = z.object({
  request: z.unknown(),
  eligibility: civilV2HostEligibilitySchema,
  qrProfile: z.unknown(),
}).strict();

const allowedCentralErrorCodes = new Set([
  'AUTH_REQUIRED',
  'INVALID_REQUEST',
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
  'HOST_NOT_ALLOWLISTED',
  'PROVIDER_CALL_LIMIT_REACHED',
]);

export type CivilProductionRelayResult = {
  status: number;
  body: Record<string, unknown>;
};

export type CivilProductionRelayConfig = {
  productionRuntime: boolean;
  enabled: boolean;
  hostPolicyVerified: boolean;
  centralProductionUrl?: string;
  hostAiToken?: string;
  sessionSecret?: string;
  fetcher?: typeof fetch;
  requestTimeoutMs?: number;
  onDiagnostic?: (stage: string, fields: Record<string, string | number | boolean>) => void;
};

type StoredResult = {
  fingerprint: string;
  expiresAt: number;
  result: CivilProductionRelayResult;
};

function isConfiguredSecret(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value && !/[\r\n]/.test(value);
}

function getSafeProductionOrigin(value?: string): URL | null {
  if (!value) return null;
  try {
    const origin = new URL(value);
    if (
      origin.protocol !== 'https:'
      || !origin.hostname
      || origin.username
      || origin.password
      || origin.search
      || origin.hash
      || (origin.pathname !== '/' && origin.pathname !== '')
      || origin.hostname === 'localhost'
      || origin.hostname.endsWith('.localhost')
      || /^\d+(?:\.\d+){3}$/.test(origin.hostname)
    ) return null;
    return origin;
  } catch {
    return null;
  }
}

export function isCivilProductionV2RelayReady(config: CivilProductionRelayConfig): boolean {
  return config.productionRuntime
    && config.enabled
    && config.hostPolicyVerified
    && Boolean(getSafeProductionOrigin(config.centralProductionUrl))
    && isConfiguredSecret(config.hostAiToken)
    && isConfiguredSecret(config.sessionSecret);
}

function jsonResponse(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(body));
}

function safeCentralErrorCode(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const code = (value as Record<string, unknown>).error;
  return typeof code === 'string' && allowedCentralErrorCodes.has(code) ? code : null;
}

function hasJsonContentType(value: string | null): boolean {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json'
    || (mediaType?.startsWith('application/') === true && mediaType.endsWith('+json'));
}

function safeSameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function readLimitedBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let rejected = false;
    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += buffer.byteLength;
      if (length > maxBodyBytes) {
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

function signedSessionId(sessionSecret: string, sessionId: string): string {
  const signature = createHmac('sha256', sessionSecret).update(sessionId).digest('base64url');
  return `${sessionId}.${signature}`;
}

function verifySessionCookie(value: string | undefined, sessionSecret: string | undefined): string | null {
  if (!value || !isConfiguredSecret(sessionSecret)) return null;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;
  const sessionId = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(sessionId) || !/^[A-Za-z0-9_-]{40,64}$/.test(suppliedSignature)) {
    return null;
  }
  const expected = signedSessionId(sessionSecret, sessionId).slice(separator + 1);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer)
    ? sessionId
    : null;
}

function cookieValue(request: IncomingMessage): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const [name, ...parts] = pair.trim().split('=');
    if (name === sessionCookieName) return parts.join('=');
  }
  return undefined;
}

function getOrCreateSession(
  request: IncomingMessage,
  response: ServerResponse,
  secret: string,
): string {
  const existing = verifySessionCookie(cookieValue(request), secret);
  if (existing) return existing;
  const sessionId = randomBytes(24).toString('base64url');
  const signed = signedSessionId(secret, sessionId);
  response.setHeader(
    'Set-Cookie',
    `${sessionCookieName}=${signed}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=1800`,
  );
  return sessionId;
}

function parseIdempotencyKey(value: string | undefined): string | null {
  if (!value || value.length < 16 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) return null;
  return value;
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > maxResponseBytes) throw new Error('RESPONSE_TOO_LARGE');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('EMPTY_RESPONSE');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxResponseBytes) {
      await reader.cancel();
      throw new Error('RESPONSE_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function validateProductionRequest(value: unknown): {
  request: CivilProductionV2Request;
  model: ReturnType<typeof createCivilProductionV2Model>;
} | null {
  const envelope = productionEnvelopeSchema.safeParse(value);
  if (!envelope.success) return null;
  const request = {
    request: envelope.data.request,
    eligibility: envelope.data.eligibility,
    qrProfile: envelope.data.qrProfile,
  };
  try {
    const parsed = request as CivilProductionV2Request;
    if (!parsed.eligibility.targetViewport || !parsed.eligibility.centralProfileAllowed) return null;
    const model = createCivilProductionV2Model(parsed);
    if (getCivilV2HostSafetyFailure(parsed.request, parsed.eligibility)) return null;
    return { request: parsed, model };
  } catch {
    return null;
  }
}

export function createCivilProductionV2Forwarder(
  config: CivilProductionRelayConfig,
  fetcher: typeof fetch = config.fetcher ?? fetch,
) {
  const idempotency = new Map<string, StoredResult>();
  const inFlight = new Map<string, { fingerprint: string; promise: Promise<CivilProductionRelayResult> }>();
  const sessionAttempts = new Set<string>();
  let upstreamAttempts = 0;

  const diagnostic = (stage: string, fields: Record<string, string | number | boolean> = {}) => {
    config.onDiagnostic?.(stage, fields);
  };

  return async (
    input: unknown,
    idempotencyKey: string,
    sessionId: string,
  ): Promise<CivilProductionRelayResult> => {
    if (!isCivilProductionV2RelayReady(config)) {
      diagnostic('relay-blocked', { reason: 'not-ready', upstreamAttempts });
      return { status: 404, body: { error: 'PRODUCTION_RELAY_DISABLED' } };
    }
    const built = validateProductionRequest(input);
    if (!built) return { status: 409, body: { error: 'PRODUCTION_MODEL_REJECTED' } };

    const origin = getSafeProductionOrigin(config.centralProductionUrl);
    if (!origin || !config.hostAiToken) {
      return { status: 503, body: { error: 'PRODUCTION_RELAY_NOT_CONFIGURED' } };
    }
    const model = built.model;
    const fingerprint = canonicalUniversalJson(model);
    const currentTime = Date.now();
    for (const [key, entry] of idempotency) {
      if (entry.expiresAt <= currentTime) idempotency.delete(key);
    }

    const prior = idempotency.get(idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) return { status: 409, body: { error: 'IDEMPOTENCY_KEY_REUSED' } };
      return prior.result;
    }
    const pending = inFlight.get(idempotencyKey);
    if (pending) {
      if (pending.fingerprint !== fingerprint) return { status: 409, body: { error: 'IDEMPOTENCY_KEY_REUSED' } };
      return pending.promise;
    }
    if (sessionAttempts.has(sessionId)) {
      return { status: 429, body: { error: 'SESSION_AI_LIMIT_REACHED' } };
    }
    if (upstreamAttempts >= maxProviderAttemptsPerProcess) {
      return { status: 429, body: { error: 'HOST_PROVIDER_LIMIT_REACHED' } };
    }

    sessionAttempts.add(sessionId);
    upstreamAttempts += 1;
    const promise = (async (): Promise<CivilProductionRelayResult> => {
      const controller = new AbortController();
      const timeoutMs = config.requestTimeoutMs ?? requestTimeoutMs;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const endpoint = new URL('/api/production/universal-layout/v2/openai-plan', origin.origin);
        diagnostic('upstream-start', { upstreamAttempts });
        const upstream = await fetcher(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Host-AI-Token': config.hostAiToken!,
            'Idempotency-Key': idempotencyKey,
          },
          cache: 'no-store',
          redirect: 'error',
          body: JSON.stringify({ model }),
          signal: controller.signal,
        });
        const mediaType = upstream.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
        diagnostic('upstream-response', {
          status: upstream.status,
          contentType: mediaType === 'application/json' || mediaType.endsWith('+json') ? 'json' : 'non-json',
        });

        if (!upstream.ok) {
          const code = hasJsonContentType(upstream.headers.get('content-type'))
            ? safeCentralErrorCode(await readLimitedJson(upstream).catch(() => null))
            : null;
          const status = upstream.status === 429 ? 429
            : upstream.status === 401 || upstream.status === 403 ? 502
              : upstream.status >= 500 ? 502 : 422;
          const result = {
            status,
            body: { error: code ?? (status === 429 ? 'CENTRAL_RATE_LIMITED' : 'CENTRAL_PLAN_REJECTED') },
          };
          diagnostic('upstream-rejected', { status: upstream.status, errorCode: code ?? 'UNCLASSIFIED' });
          idempotency.set(idempotencyKey, {
            fingerprint,
            expiresAt: Date.now() + idempotencyTtlMs,
            result,
          });
          return result;
        }
        if (!hasJsonContentType(upstream.headers.get('content-type'))) {
          throw new Error('NON_JSON_RESPONSE');
        }

        const planValue = await readLimitedJson(upstream);
        let plan: UniversalLayoutV2Plan;
        try {
          plan = validateUniversalLayoutV2Plan(planValue, model, civilProductionV2Policies);
        } catch {
          throw new Error('INVALID_CENTRAL_PLAN');
        }
        const operation = plan.operations[0];
        if (
          plan.hostId !== CIVIL_V2_PRODUCTION_HOST_ID
          || plan.screenId !== CIVIL_V2_PRODUCTION_SCREEN_ID
          || plan.structureVersion !== CIVIL_V2_PRODUCTION_STRUCTURE_VERSION
          || plan.operations.length !== 1
          || operation?.type !== 'selectLayoutOption'
          || operation.targetId !== CIVIL_V2_PRODUCTION_COMPONENT_ID
          || operation.groupId !== CIVIL_V2_PRODUCTION_OPTION_GROUP_ID
          || operation.optionId !== CIVIL_V2_PRODUCTION_OPTION_ID
        ) throw new Error('INVALID_CENTRAL_PLAN');

        const result: CivilProductionRelayResult = {
          status: 200,
          body: { accepted: true, model, plan },
        };
        idempotency.set(idempotencyKey, {
          fingerprint,
          expiresAt: Date.now() + idempotencyTtlMs,
          result,
        });
        diagnostic('plan-validated', { optionId: CIVIL_V2_PRODUCTION_OPTION_ID });
        return result;
      } catch (error) {
        const timeout = controller.signal.aborted;
        const code = timeout ? 'CENTRAL_REQUEST_TIMEOUT'
          : error instanceof Error && error.message === 'INVALID_CENTRAL_PLAN'
            ? 'INVALID_CENTRAL_PLAN'
            : 'CENTRAL_PLAN_FAILED';
        const result = { status: timeout ? 504 : 502, body: { error: code } };
        idempotency.set(idempotencyKey, {
          fingerprint,
          expiresAt: Date.now() + idempotencyTtlMs,
          result,
        });
        diagnostic('upstream-failed', { errorCode: code, timeout });
        return result;
      } finally {
        clearTimeout(timeout);
      }
    })();
    inFlight.set(idempotencyKey, { fingerprint, promise });
    try {
      return await promise;
    } finally {
      if (inFlight.get(idempotencyKey)?.promise === promise) inFlight.delete(idempotencyKey);
    }
  };
}

export function createCivilProductionV2Middleware(config: CivilProductionRelayConfig) {
  const forward = createCivilProductionV2Forwarder(config);
  const logger = config.onDiagnostic;
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    const pathname = (request.url ?? '/').split('?', 1)[0];
    if (pathname !== CIVIL_V2_PRODUCTION_STATUS_PATH && pathname !== CIVIL_V2_PRODUCTION_PLAN_PATH) {
      return next();
    }
    if (!config.productionRuntime) return jsonResponse(response, 404, { error: 'NOT_FOUND' });
    if (pathname === CIVIL_V2_PRODUCTION_STATUS_PATH) {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return jsonResponse(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      }
      const enabled = isCivilProductionV2RelayReady(config);
      if (enabled && config.sessionSecret) getOrCreateSession(request, response, config.sessionSecret);
      response.setHeader('Cache-Control', 'no-store');
      return jsonResponse(response, 200, { enabled });
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return jsonResponse(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    if (!safeSameOrigin(request)) return jsonResponse(response, 403, { error: 'ORIGIN_NOT_ALLOWED' });
    if (!request.headers['content-type']?.toLowerCase().includes('application/json')) {
      return jsonResponse(response, 415, { error: 'JSON_REQUIRED' });
    }
    if (Number(request.headers['content-length'] ?? 0) > maxBodyBytes) {
      request.resume();
      return jsonResponse(response, 413, { error: 'REQUEST_TOO_LARGE' });
    }
    if (!isCivilProductionV2RelayReady(config) || !config.sessionSecret) {
      return jsonResponse(response, 404, { error: 'PRODUCTION_RELAY_DISABLED' });
    }
    const sessionId = verifySessionCookie(cookieValue(request), config.sessionSecret);
    if (!sessionId) return jsonResponse(response, 401, { error: 'PRODUCTION_SESSION_REQUIRED' });
    const idempotencyHeader = request.headers['idempotency-key'];
    const idempotencyKey = parseIdempotencyKey(
      Array.isArray(idempotencyHeader) ? idempotencyHeader[0] : idempotencyHeader,
    );
    if (!idempotencyKey) return jsonResponse(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });

    let input: unknown;
    try {
      input = JSON.parse((await readLimitedBody(request)).toString('utf8'));
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'BODY_TOO_LARGE';
      return jsonResponse(response, tooLarge ? 413 : 400, {
        error: tooLarge ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
      });
    }
    logger?.('browser-request', {});
    const result = await forward(input, idempotencyKey, sessionId);
    return jsonResponse(response, result.status, result.body);
  };
}
