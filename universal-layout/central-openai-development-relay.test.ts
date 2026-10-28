import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCentralOpenAiDevelopmentRelayPlugin,
  createCentralOpenAiPlanForwarder,
} from './central-openai-development-relay.js';
import { createValidatedCivilLayoutMock } from './civil-layout-mock.js';

const itemIds = Array.from(
  { length: 18 },
  (_, index) => `civil.certificate.${String(index + 1).padStart(2, '0')}`,
);

function hostRequest(overrides: Record<string, unknown> = {}) {
  return {
    screenId: 'civil.main-menu',
    componentId: 'civil.certificate-grid',
    columns: 1,
    itemIds,
    viewport: { width: 1080, height: 1920, gridWidth: 470 },
    accessibility: {
      textScale: 'standard',
      buttonScale: 'standard',
      contrast: 'standard',
      bottomControls: false,
      viewportMode: null,
    },
    ...overrides,
  };
}

function relayInput(request = hostRequest()) {
  return {
    request,
    eligibility: {
      standardProfile: true,
      geometryKnown: true,
      hasFixedBottomControls: false,
    },
  };
}

const relayConfig = {
  enabled: true,
  mockRelayEnabled: false,
  developmentUrl: 'https://central-dev.example.replit.dev',
  externalAccessToken: 'test-external-access-token',
  serviceToken: 'test-service-bearer-token',
};

test('fake OpenAI relay forwards the strict model, validates a top-level one-column plan, and logs no secrets', async () => {
  const { model } = createValidatedCivilLayoutMock(hostRequest());
  const plan = createValidatedCivilLayoutMock(hostRequest()).plan;
  let upstreamCalls = 0;
  let observedUrl: URL | undefined;
  let observedMethod: string | undefined;
  let observedHeaders: Headers | undefined;
  let observedBody: unknown;
  const diagnostics: unknown[] = [];
  const forward = createCentralOpenAiPlanForwarder(relayConfig, async (input, init) => {
    upstreamCalls += 1;
    observedUrl = new URL(String(input));
    observedMethod = init?.method;
    observedHeaders = new Headers(init?.headers);
    observedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(plan), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }, (diagnostic) => diagnostics.push(diagnostic));

  const result = await forward(relayInput());

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { accepted: true, plan });
  assert.equal(upstreamCalls, 1);
  assert.equal(observedMethod, 'POST');
  assert.equal(observedUrl?.origin, new URL(relayConfig.developmentUrl).origin);
  assert.equal(observedUrl?.pathname, '/api/dev/universal-layout/openai-plan');
  assert.deepEqual(observedUrl?.searchParams.getAll('project-protection-bypass').length, 1);
  assert.deepEqual([...observedUrl!.searchParams.keys()], ['project-protection-bypass']);
  assert.equal(observedUrl?.searchParams.get('project-protection-bypass'), relayConfig.externalAccessToken);
  assert.equal(observedHeaders?.get('authorization'), `Bearer ${relayConfig.serviceToken}`);
  assert.deepEqual(observedBody, { model });
  assert.equal(JSON.stringify(diagnostics).includes(relayConfig.developmentUrl), false);
  assert.equal(JSON.stringify(diagnostics).includes(relayConfig.externalAccessToken), false);
  assert.equal(JSON.stringify(diagnostics).includes(relayConfig.serviceToken), false);
  assert.equal(JSON.stringify(diagnostics).includes(JSON.stringify(model)), false);
  assert.equal(JSON.stringify(diagnostics).includes(JSON.stringify(plan)), false);
});

test('fake OpenAI relay accepts the common validator approved two-column plan', async () => {
  const plan = createValidatedCivilLayoutMock(hostRequest({ columns: 2 })).plan;
  const forward = createCentralOpenAiPlanForwarder(relayConfig, async () => new Response(
    JSON.stringify(plan),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
  const result = await forward(relayInput());
  assert.equal(result.status, 200);
  assert.deepEqual((result.body as { plan: typeof plan }).plan.operations[0], {
    type: 'setColumns',
    targetId: 'civil.certificate-grid',
    columns: 2,
  });
});

test('invalid plans and hash mismatches are rejected before they can reach the host', async (t) => {
  const validPlan = createValidatedCivilLayoutMock(hostRequest()).plan;
  for (const [name, responseBody] of [
    ['extra response field', { ...validPlan, css: '.certificate-grid { display:none }' }],
    ['mismatched hash', { ...validPlan, constraintHash: '0'.repeat(64) }],
  ] as const) {
    await t.test(name, async () => {
      const forward = createCentralOpenAiPlanForwarder(relayConfig, async () => new Response(
        JSON.stringify(responseBody),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
      const result = await forward(relayInput());
      assert.equal(result.status, 502);
      assert.deepEqual(result.body, { accepted: false, error: 'INVALID_CENTRAL_PLAN' });
    });
  }
});

test('same canonical concurrent model requests coalesce and successful results are briefly cached', async () => {
  const plan = createValidatedCivilLayoutMock(hostRequest()).plan;
  let upstreamCalls = 0;
  let releaseUpstream: ((response: Response) => void) | undefined;
  const forward = createCentralOpenAiPlanForwarder(relayConfig, () => {
    upstreamCalls += 1;
    return new Promise((resolve) => {
      releaseUpstream = resolve;
    });
  });

  const first = forward(relayInput());
  await new Promise((resolve) => setImmediate(resolve));
  const second = forward(relayInput());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(upstreamCalls, 1);

  releaseUpstream?.(new Response(JSON.stringify(plan), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(upstreamCalls, 1);

  const cachedResult = await forward(relayInput());
  assert.deepEqual(cachedResult, firstResult);
  assert.equal(upstreamCalls, 1);
});

test('non-wide models do not share an in-flight plan and cannot use the process upstream budget', async () => {
  let upstreamCalls = 0;
  let releaseUpstream: ((response: Response) => void) | undefined;
  const widePlan = createValidatedCivilLayoutMock(hostRequest()).plan;
  const forward = createCentralOpenAiPlanForwarder(relayConfig, () => {
    upstreamCalls += 1;
    return new Promise((resolve) => {
      releaseUpstream = resolve;
    });
  });
  const wideRequest = forward(relayInput());
  await new Promise((resolve) => setImmediate(resolve));

  const regularRequest = forward(relayInput(hostRequest({
    viewport: { width: 700, height: 1920, gridWidth: 470 },
  })));
  const regularResult = await regularRequest;
  assert.equal(regularResult.status, 409);
  assert.deepEqual(regularResult.body, { accepted: false, error: 'OPENAI_WIDE_VIEWPORT_REQUIRED' });
  assert.equal(upstreamCalls, 1);

  releaseUpstream?.(new Response(JSON.stringify(widePlan), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await wideRequest).status, 200);

  const anotherDifferentModel = await forward(relayInput(hostRequest({
    viewport: { width: 700, height: 1920, gridWidth: 470 },
  })));
  assert.equal(anotherDifferentModel.status, 409);
  assert.deepEqual(anotherDifferentModel.body, { accepted: false, error: 'OPENAI_WIDE_VIEWPORT_REQUIRED' });
  assert.equal(upstreamCalls, 1);
});

test('relay off, Mock/OpenAI conflict, mobile, footer, and nonstandard profile fail closed', async () => {
  let upstreamCalls = 0;
  const fetchFake = async () => {
    upstreamCalls += 1;
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const off = createCentralOpenAiPlanForwarder({ ...relayConfig, enabled: false }, fetchFake);
  const conflict = createCentralOpenAiPlanForwarder({ ...relayConfig, mockRelayEnabled: true }, fetchFake);
  const mobile = createCentralOpenAiPlanForwarder(relayConfig, fetchFake);
  const fixedFooter = createCentralOpenAiPlanForwarder(relayConfig, fetchFake);
  const nonstandard = createCentralOpenAiPlanForwarder(relayConfig, fetchFake);

  assert.equal((await off(relayInput())).status, 404);
  assert.equal((await conflict(relayInput())).status, 404);
  assert.equal((await mobile(relayInput(hostRequest({
    viewport: { width: 390, height: 844, gridWidth: 360 },
  })))).status, 409);
  assert.equal((await fixedFooter({
    ...relayInput(),
    eligibility: { standardProfile: true, geometryKnown: true, hasFixedBottomControls: true },
  })).status, 400);
  assert.equal((await nonstandard(relayInput(hostRequest({
    accessibility: {
      textScale: 'large',
      buttonScale: 'standard',
      contrast: 'standard',
      bottomControls: false,
      viewportMode: null,
    },
  })))).status, 409);
  assert.equal(upstreamCalls, 0);
});

test('upstream failures are sanitized, are never retried, and preserve only one attempt', async () => {
  let upstreamCalls = 0;
  const diagnostics: unknown[] = [];
  const forward = createCentralOpenAiPlanForwarder(relayConfig, async () => {
    upstreamCalls += 1;
    return new Response(JSON.stringify({
      error: 'INVALID_MODEL',
      detail: 'private prompt, token, and upstream response text',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }, (diagnostic) => diagnostics.push(diagnostic));

  const first = await forward(relayInput());
  const second = await forward(relayInput());
  assert.equal(first.status, 422);
  assert.deepEqual(first.body, { accepted: false, error: 'CENTRAL_MODEL_REJECTED' });
  assert.equal(second.status, 429);
  assert.equal(upstreamCalls, 1);
  assert.equal(JSON.stringify(diagnostics).includes('private prompt'), false);
  assert.equal(JSON.stringify(diagnostics).includes('token'), false);
  assert.equal(JSON.stringify(diagnostics).includes('upstream response text'), false);
});

test('invalid Production targets are rejected before fake fetch and timeout consumes the one-attempt budget', async (t) => {
  await t.test('Production URL does not reach fake fetch', async () => {
    let upstreamCalls = 0;
    const forward = createCentralOpenAiPlanForwarder({
      ...relayConfig,
      developmentUrl: 'https://civil-kiosk.replit.app',
    }, async () => {
      upstreamCalls += 1;
      return new Response('{}');
    });
    const result = await forward(relayInput());
    assert.equal(result.status, 503);
    assert.equal(upstreamCalls, 0);
  });

  await t.test('timeout is not retried', async () => {
    let upstreamCalls = 0;
    const diagnostics: unknown[] = [];
    const forward = createCentralOpenAiPlanForwarder(
      { ...relayConfig, requestTimeoutMs: 5 },
      async (_input, init) => new Promise((_resolve, reject) => {
        upstreamCalls += 1;
        init?.signal?.addEventListener('abort', () => reject(new Error('private timeout detail')), { once: true });
      }),
      (diagnostic) => diagnostics.push(diagnostic),
    );
    const first = await forward(relayInput());
    const second = await forward(relayInput());
    assert.equal(first.status, 504);
    assert.equal(second.status, 429);
    assert.equal(upstreamCalls, 1);
    assert.equal(JSON.stringify(diagnostics).includes('private timeout detail'), false);
  });
});

test('the Development plugin is opt-in, conflict-blocked, and absent from preview/production middleware', () => {
  let registrations = 0;
  const logs: string[] = [];
  const makeServer = () => ({
    config: { logger: { info: (message: string) => logs.push(message) } },
    middlewares: { use: () => { registrations += 1; } },
  }) as never;

  const off = createCentralOpenAiDevelopmentRelayPlugin({});
  off.configureServer?.(makeServer());
  assert.equal(registrations, 1);
  assert.equal(off.configurePreviewServer, undefined);

  const conflict = createCentralOpenAiDevelopmentRelayPlugin({
    CIVIL_UNIVERSAL_LAYOUT_OPENAI_RELAY_ENABLED: 'true',
    CIVIL_UNIVERSAL_LAYOUT_CENTRAL_RELAY_ENABLED: 'true',
  });
  conflict.configureServer?.(makeServer());
  assert.equal(registrations, 2);
  assert.ok(logs.some((message) => message.includes('openai-relay=blocked-conflict')));
  assert.equal(conflict.configurePreviewServer, undefined);

  const enabled = createCentralOpenAiDevelopmentRelayPlugin({
    CIVIL_UNIVERSAL_LAYOUT_OPENAI_RELAY_ENABLED: 'true',
  });
  enabled.configureServer?.(makeServer());
  assert.equal(registrations, 3);
  assert.ok(logs.some((message) => message.includes('openai-relay=on')));
  assert.equal(logs.join(' ').includes(relayConfig.developmentUrl), false);
  assert.equal(logs.join(' ').includes(relayConfig.externalAccessToken), false);
  assert.equal(logs.join(' ').includes(relayConfig.serviceToken), false);
});
