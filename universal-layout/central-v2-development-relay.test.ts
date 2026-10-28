import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import type { Plugin } from 'vite';
import {
  CIVIL_V2_ITEM_IDS,
  createValidatedCivilLayoutV2Fake,
} from './civil-layout-v2-fake';
import {
  createCentralV2DevelopmentRelayPlugin,
  createCentralV2PlanForwarder,
  formatCentralV2Diagnostic,
} from './central-v2-development-relay';

const request = {
  screenId: 'civil.main-menu',
  itemIds: CIVIL_V2_ITEM_IDS,
  viewport: { width: 1080, height: 1920, gridWidth: 470 },
  accessibility: {
    textScale: 'standard',
    buttonScale: 'standard',
    contrast: 'standard',
    viewportMode: null,
  },
  layoutCapabilities: ['reserved-bottom-controls'],
} as const;

const eligibility = {
  targetViewport: true,
  standardProfile: true,
  geometryKnown: true,
  footerInFlow: true,
  qrDockReservesBottom: true,
  menuClearOfFooter: true,
  menuClearOfQrDock: true,
  minimumTouchTarget: true,
  reservedBottomCapability: true,
} as const;

const relayRequest = { request, eligibility };
const centralPlan = createValidatedCivilLayoutV2Fake(request).plan;
const fakeConfig = {
  enabled: true,
  developmentUrl: 'https://central-civil-kiosk.replit.dev',
  externalAccessToken: 'test-protection-token',
  serviceToken: 'test-service-token',
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function validFakeFetch(
  onCall?: (input: RequestInfo | URL, init?: RequestInit) => void,
  response: () => Response = () => jsonResponse(centralPlan),
): typeof fetch {
  return async (input, init) => {
    onCall?.(input, init);
    return response();
  };
}

test('v2 central relay posts strict model envelope and validates the top-level plan', async () => {
  let calls = 0;
  const diagnostics: Parameters<typeof formatCentralV2Diagnostic>[0][] = [];
  const { model } = createValidatedCivilLayoutV2Fake(request);
  const forward = createCentralV2PlanForwarder(
    fakeConfig,
    validFakeFetch((input, init) => {
      calls += 1;
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://central-civil-kiosk.replit.dev');
      assert.equal(url.pathname, '/api/dev/universal-layout/v2/fake-plan');
      assert.equal(url.searchParams.getAll('project-protection-bypass').length, 1);
      assert.equal(url.searchParams.get('project-protection-bypass'), 'test-protection-token');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Authorization'), 'Bearer test-service-token');
      assert.equal(headers.get('Content-Type'), 'application/json');
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(body), ['model']);
      assert.deepEqual(body.model, model);
    }),
    (diagnostic) => diagnostics.push(diagnostic),
  );

  const result = await forward(relayRequest);
  assert.equal(calls, 1);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { accepted: true, model, plan: centralPlan });
  assert.deepEqual(
    diagnostics.map(({ stage }) => stage),
    ['browser-request', 'upstream-fetch-start', 'upstream-response'],
  );
  assert.equal(diagnostics.at(-1)?.responseReceived, true);
  assert.equal(diagnostics.at(-1)?.status, 200);
  assert.equal(diagnostics.at(-1)?.contentType, 'application/json');
  assert.equal(diagnostics.at(-1)?.timeout, false);
  assert.doesNotMatch(
    diagnostics.map(formatCentralV2Diagnostic).join('\n'),
    /central-civil-kiosk|test-protection-token|test-service-token|certificate-grid/,
  );
});

test('v2 central relay rejects invalid host context before upstream access', async (t) => {
  const variants: Array<[string, unknown]> = [
    ['viewport', { ...relayRequest, request: { ...request, viewport: { ...request.viewport, width: 390 } } }],
    ['profile', { ...relayRequest, request: { ...request, accessibility: { ...request.accessibility, contrast: 'high' } } }],
    ['capability', { ...relayRequest, request: { ...request, layoutCapabilities: [] } }],
    ['menu order', { ...relayRequest, request: { ...request, itemIds: [...CIVIL_V2_ITEM_IDS].reverse() } }],
    ['geometry claim', { ...relayRequest, eligibility: { ...eligibility, qrDockReservesBottom: false } }],
  ];

  for (const [name, input] of variants) {
    await t.test(name, async () => {
      let calls = 0;
      const forward = createCentralV2PlanForwarder(fakeConfig, validFakeFetch(() => { calls += 1; }));
      const result = await forward(input);
      assert.notEqual(result.status, 200);
      assert.equal(calls, 0);
    });
  }
});

test('v2 central plan validation rejects changed identity, hashes, versions, options, and extra fields', async (t) => {
  const changes: Array<[string, (plan: typeof centralPlan) => unknown]> = [
    ['hostId', (plan) => ({ ...plan, hostId: 'civil-kiosk-mock' })],
    ['screenId', (plan) => ({ ...plan, screenId: 'civil.other-screen' })],
    ['structureVersion', (plan) => ({ ...plan, structureVersion: 'wrong.version' })],
    ['structure hash', (plan) => ({ ...plan, structureHash: '0'.repeat(64) })],
    ['constraint hash', (plan) => ({ ...plan, constraintHash: '0'.repeat(64) })],
    ['schema version', (plan) => ({ ...plan, schemaVersion: 1 })],
    ['contract version', (plan) => ({ ...plan, contractVersion: 'universal-layout.v1' })],
    ['option ID', (plan) => ({
      ...plan,
      operations: [{
        type: 'selectLayoutOption',
        targetId: 'civil.certificate-grid',
        groupId: 'arrangement',
        optionId: 'unregistered-option',
      }],
    })],
    ['extra style field', (plan) => ({ ...plan, css: '.certificate-grid { display:none }' })],
    ['wrapped envelope', (plan) => ({ accepted: true, plan })],
  ];

  for (const [name, mutate] of changes) {
    await t.test(name, async () => {
      const forward = createCentralV2PlanForwarder(
        fakeConfig,
        validFakeFetch(undefined, () => jsonResponse(mutate(centralPlan))),
      );
      const result = await forward(relayRequest);
      assert.equal(result.status, 502);
      assert.deepEqual(result.body, { accepted: false, error: 'INVALID_CENTRAL_PLAN' });
    });
  }
});

test('same model requests coalesce and cache only the validated success', async () => {
  let calls = 0;
  let releaseFetch!: () => void;
  const fetchGate = new Promise<void>((resolve) => { releaseFetch = resolve; });
  const forward = createCentralV2PlanForwarder(
    { ...fakeConfig, successCacheMs: 30 },
    async () => {
      calls += 1;
      await fetchGate;
      return jsonResponse(centralPlan);
    },
  );

  const first = forward(relayRequest);
  const second = forward(relayRequest);
  const incompatible = await forward({
    ...relayRequest,
    request: { ...request, accessibility: { ...request.accessibility, contrast: 'high' } },
  });
  assert.equal(incompatible.status, 409);
  assert.equal(calls, 1);

  releaseFetch();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);
  const cached = await forward(relayRequest);
  assert.deepEqual(cached, firstResult);
  assert.equal(calls, 1);

  await new Promise((resolve) => setTimeout(resolve, 40));
  const exhausted = await forward(relayRequest);
  assert.equal(exhausted.status, 429);
  assert.equal(calls, 1);
});

test('failed upstream attempts are not cached or retried', async () => {
  let calls = 0;
  const diagnostics: unknown[] = [];
  const forward = createCentralV2PlanForwarder(
    fakeConfig,
    validFakeFetch(() => { calls += 1; }, () => new Response('<private upstream body>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    })),
    (diagnostic) => diagnostics.push(diagnostic),
  );

  const first = await forward(relayRequest);
  const second = await forward(relayRequest);
  assert.deepEqual(first.body, { accepted: false, error: 'CENTRAL_MODEL_REJECTED' });
  assert.equal(second.status, 429);
  assert.equal(calls, 1);
  const serializedDiagnostics = JSON.stringify(diagnostics);
  assert.match(serializedDiagnostics, /404/);
  assert.match(serializedDiagnostics, /text\/html/);
  assert.doesNotMatch(serializedDiagnostics, /private upstream body|test-service-token|test-protection-token/);
});

test('fetch exceptions log only safe DNS, TCP, TLS, and redirect classifications', async (t) => {
  const cases = [
    ['DNS resolution', 'ENOTFOUND', false],
    ['TCP connection', 'ECONNREFUSED', false],
    ['TLS verification', 'ERR_TLS_CERT_ALTNAME_INVALID', false],
    ['redirect rejection', 'UND_ERR_REDIRECT', true],
  ] as const;

  for (const [label, causeCode, redirectError] of cases) {
    await t.test(label, async () => {
      const diagnostics: Parameters<typeof formatCentralV2Diagnostic>[0][] = [];
      const fakeFetch = async () => {
        throw Object.assign(new TypeError('PRIVATE URL, TOKEN, AND ERROR MESSAGE'), {
          cause: { code: causeCode, message: 'PRIVATE CAUSE MESSAGE' },
        });
      };
      const forward = createCentralV2PlanForwarder(
        fakeConfig,
        fakeFetch as typeof fetch,
        (diagnostic) => diagnostics.push(diagnostic),
      );

      const result = await forward(relayRequest);
      assert.equal(result.status, 502);
      assert.deepEqual(result.body, { accepted: false, error: 'CENTRAL_PLAN_FAILED' });
      assert.equal((await forward(relayRequest)).status, 429);
      const failure = diagnostics.find(({ stage }) => stage === 'upstream-fetch-error');
      assert.ok(failure);
      assert.equal(failure.responseReceived, false);
      assert.equal(failure.errorOccurred, true);
      assert.equal(failure.errorCode, 'CENTRAL_NETWORK_ERROR');
      assert.equal(failure.errorName, 'TypeError');
      assert.equal(failure.causeCode, causeCode);
      assert.equal(failure.timeout, false);
      assert.equal(failure.redirectError, redirectError);
      assert.equal(diagnostics.at(-1)?.upstreamRequests, 1);

      const safeLog = diagnostics.map(formatCentralV2Diagnostic).join('\n');
      assert.doesNotMatch(safeLog, /PRIVATE|test-service-token|test-protection-token|replit\.dev|certificate-grid/);
    });
  }
});

test('unrecognized fetch error details are omitted and redirect classification stays unknown', async () => {
  const diagnostics: Parameters<typeof formatCentralV2Diagnostic>[0][] = [];
  const fakeFetch = async () => {
    throw Object.assign(new TypeError('UNSAFE ERROR TEXT'), {
      name: 'UNSAFE ERROR NAME',
      cause: { code: 'UNSAFE_PRIVATE_CODE', message: 'UNSAFE CAUSE TEXT' },
    });
  };
  const forward = createCentralV2PlanForwarder(
    fakeConfig,
    fakeFetch as typeof fetch,
    (diagnostic) => diagnostics.push(diagnostic),
  );

  await forward(relayRequest);
  const failure = diagnostics.find(({ stage }) => stage === 'upstream-fetch-error');
  assert.ok(failure);
  assert.equal(failure.errorName, 'Other');
  assert.equal(failure.causeCode, undefined);
  assert.equal(failure.redirectError, null);
  assert.doesNotMatch(diagnostics.map(formatCentralV2Diagnostic).join('\n'), /UNSAFE/);
});

test('HTTP 401, 403, and 404 responses are logged without exposing response bodies', async (t) => {
  const cases = [
    [401, 502, 'CENTRAL_AUTH_FAILED'],
    [403, 502, 'CENTRAL_AUTH_FAILED'],
    [404, 422, 'CENTRAL_MODEL_REJECTED'],
  ] as const;

  for (const [upstreamStatus, hostStatus, hostError] of cases) {
    await t.test(`upstream ${upstreamStatus}`, async () => {
      let calls = 0;
      const diagnostics: Parameters<typeof formatCentralV2Diagnostic>[0][] = [];
      const upstreamBody = upstreamStatus === 404
        ? { error: 'UNSUPPORTED_HOST_SCREEN' }
        : { error: 'PRIVATE AUTH RESPONSE' };
      const forward = createCentralV2PlanForwarder(
        fakeConfig,
        validFakeFetch(
          () => { calls += 1; },
          () => jsonResponse(upstreamBody, upstreamStatus),
        ),
        (diagnostic) => diagnostics.push(diagnostic),
      );

      const result = await forward(relayRequest);
      assert.equal(calls, 1);
      assert.equal(result.status, hostStatus);
      assert.deepEqual(result.body, { accepted: false, error: hostError });
      const response = diagnostics.find(({ stage }) => stage === 'upstream-response');
      assert.ok(response);
      assert.equal(response.responseReceived, true);
      assert.equal(response.status, upstreamStatus);
      assert.equal(response.contentType, 'application/json');
      if (upstreamStatus === 404) {
        assert.equal(
          diagnostics.find(({ stage }) => stage === 'upstream-response-error-code')?.errorCode,
          'UNSUPPORTED_HOST_SCREEN',
        );
      }
      const safeLog = diagnostics.map(formatCentralV2Diagnostic).join('\n');
      assert.doesNotMatch(safeLog, /PRIVATE AUTH RESPONSE/);
      if (upstreamStatus === 404) assert.match(safeLog, /error-code=UNSUPPORTED_HOST_SCREEN/);
    });
  }
});

test('timeout consumes the single upstream attempt and is never retried', async () => {
  let calls = 0;
  const diagnostics: Parameters<typeof formatCentralV2Diagnostic>[0][] = [];
  const forward = createCentralV2PlanForwarder(
    { ...fakeConfig, requestTimeoutMs: 5 },
    async (_input, init) => {
      calls += 1;
      await new Promise<never>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(new Error('aborted'));
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
    (diagnostic) => diagnostics.push(diagnostic),
  );

  const result = await forward(relayRequest);
  assert.equal(result.status, 504);
  assert.deepEqual(result.body, { accepted: false, error: 'CENTRAL_REQUEST_TIMEOUT' });
  assert.equal((await forward(relayRequest)).status, 429);
  assert.equal(calls, 1);
  const failure = diagnostics.find(({ stage }) => stage === 'upstream-fetch-error');
  assert.equal(failure?.timeout, true);
  assert.equal(failure?.errorCode, 'CENTRAL_REQUEST_TIMEOUT');
  assert.equal(failure?.responseReceived, false);
});

test('relay OFF, invalid target, and missing credentials do not call upstream', async (t) => {
  const cases = [
    ['relay off', { ...fakeConfig, enabled: false }],
    ['non-development URL', { ...fakeConfig, developmentUrl: 'https://central.example.com' }],
    ['API path in base URL', { ...fakeConfig, developmentUrl: 'https://central-civil-kiosk.replit.dev/api/dev' }],
    ['missing service token', { ...fakeConfig, serviceToken: undefined }],
    ['missing protection token', { ...fakeConfig, externalAccessToken: undefined }],
  ] as const;

  for (const [name, config] of cases) {
    await t.test(name, async () => {
      let calls = 0;
      const forward = createCentralV2PlanForwarder(config, validFakeFetch(() => { calls += 1; }));
      const result = await forward(relayRequest);
      assert.notEqual(result.status, 200);
      assert.equal(calls, 0);
    });
  }
});

test('local Development plugin defaults OFF, conflicts with v1 relays, and is absent from preview', async (t) => {
  const cases = [
    ['default OFF', {}],
    ['v1 mock conflict', {
      CIVIL_UNIVERSAL_LAYOUT_V2_CENTRAL_RELAY_ENABLED: 'true',
      CIVIL_UNIVERSAL_LAYOUT_CENTRAL_RELAY_ENABLED: 'true',
    }],
    ['v1 OpenAI conflict', {
      CIVIL_UNIVERSAL_LAYOUT_V2_CENTRAL_RELAY_ENABLED: 'true',
      CIVIL_UNIVERSAL_LAYOUT_OPENAI_RELAY_ENABLED: 'true',
    }],
  ] as const;

  for (const [name, env] of cases) {
    await t.test(name, async () => {
      const plugin = createCentralV2DevelopmentRelayPlugin(env as NodeJS.ProcessEnv);
      assert.equal(plugin.apply, 'serve');
      assert.equal(typeof plugin.configureServer, 'function');
      assert.equal(plugin.configurePreviewServer, undefined);
      let middleware: ((request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => void) | undefined;
      const logged: string[] = [];
      plugin.configureServer?.({
        config: { logger: { info: (line: string) => logged.push(line) } },
        middlewares: { use: (handler: typeof middleware) => { middleware = handler; } },
      } as unknown as Parameters<NonNullable<Plugin['configureServer']>>[0]);
      assert.ok(middleware);

      const requestStream = Object.assign(
        Readable.from([Buffer.from(JSON.stringify(relayRequest))]),
        {
          url: '/api/dev/universal-layout/v2-central-plan',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        },
      );
      let status = 0;
      let bodyText = '';
      const response = {
        set statusCode(value: number) { status = value; },
        setHeader: () => undefined,
        end: (value: string) => { bodyText = value; },
      };
      await middleware(requestStream as IncomingMessage, response as unknown as ServerResponse, () => {
        throw new Error('relay middleware did not match');
      });
      assert.equal(status, 404);
      assert.equal(JSON.parse(bodyText).error, 'RELAY_DISABLED');
      assert.match(logged[0] ?? '', /central-relay=(off|blocked-conflict)/);
    });
  }
});

test('Production runtime installs no relay middleware or diagnostic logger', () => {
  const plugin = createCentralV2DevelopmentRelayPlugin({
    NODE_ENV: 'production',
    CIVIL_UNIVERSAL_LAYOUT_V2_CENTRAL_RELAY_ENABLED: 'true',
    CIVIL_UNIVERSAL_LAYOUT_CENTRAL_DEV_URL: 'https://central-civil-kiosk.replit.dev',
    CIVIL_UNIVERSAL_LAYOUT_EXTERNAL_ACCESS_TOKEN: 'test-protection-token',
    AI_LAYOUT_SERVICE_TOKEN: 'test-service-token',
  });
  assert.equal(plugin.apply, 'serve');

  let middlewareInstalled = false;
  const logged: string[] = [];
  plugin.configureServer?.({
    config: { logger: { info: (line: string) => logged.push(line) } },
    middlewares: { use: () => { middlewareInstalled = true; } },
  } as unknown as Parameters<NonNullable<Plugin['configureServer']>>[0]);

  assert.equal(middlewareInstalled, false);
  assert.deepEqual(logged, []);
  assert.equal(plugin.configurePreviewServer, undefined);
});

test('Production Vite mode suppresses relay diagnostics even when NODE_ENV is development', () => {
  const plugin = createCentralV2DevelopmentRelayPlugin({
    NODE_ENV: 'development',
    CIVIL_UNIVERSAL_LAYOUT_V2_CENTRAL_RELAY_ENABLED: 'true',
  });
  let middlewareInstalled = false;
  const logged: string[] = [];
  plugin.configureServer?.({
    config: {
      mode: 'production',
      logger: { info: (line: string) => logged.push(line) },
    },
    middlewares: { use: () => { middlewareInstalled = true; } },
  } as unknown as Parameters<NonNullable<Plugin['configureServer']>>[0]);

  assert.equal(middlewareInstalled, false);
  assert.deepEqual(logged, []);
});

test('Production runtime installs no relay middleware or diagnostic logger', () => {
  const plugin = createCentralV2DevelopmentRelayPlugin({
    NODE_ENV: 'production',
    CIVIL_UNIVERSAL_LAYOUT_V2_CENTRAL_RELAY_ENABLED: 'true',
    CIVIL_UNIVERSAL_LAYOUT_CENTRAL_DEV_URL: 'https://central-civil-kiosk.replit.dev',
    CIVIL_UNIVERSAL_LAYOUT_EXTERNAL_ACCESS_TOKEN: 'test-protection-token',
    AI_LAYOUT_SERVICE_TOKEN: 'test-service-token',
  });
  assert.equal(plugin.apply, 'serve');

  let middlewareInstalled = false;
  const logged: string[] = [];
  plugin.configureServer?.({
    config: { logger: { info: (line: string) => logged.push(line) } },
    middlewares: { use: () => { middlewareInstalled = true; } },
  } as unknown as Parameters<NonNullable<Plugin['configureServer']>>[0]);

  assert.equal(middlewareInstalled, false);
  assert.deepEqual(logged, []);
  assert.equal(plugin.configurePreviewServer, undefined);
});
