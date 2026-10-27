import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCentralDevelopmentRelayPlugin,
  createCentralPlanForwarder,
} from './central-development-relay.js';
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
  developmentUrl: 'https://central-dev.example.replit.dev',
  externalAccessToken: 'test-external-access-token',
  serviceToken: 'test-service-bearer-token',
};

test('the central relay sends the strict model envelope and validates the top-level golden response', async () => {
  const expected = createValidatedCivilLayoutMock(hostRequest()).model;
  const localPlan = createValidatedCivilLayoutMock(hostRequest()).plan;
  let observedUrl: URL | undefined;
  let observedHeaders: Headers | undefined;
  let observedBody: unknown;
  const forward = createCentralPlanForwarder(relayConfig, async (input, init) => {
    observedUrl = new URL(String(input));
    observedHeaders = new Headers(init?.headers);
    observedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(localPlan), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const result = await forward(relayInput());

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { accepted: true, plan: localPlan });
  assert.equal(observedUrl?.pathname, '/api/dev/universal-layout/plan');
  assert.equal(observedUrl?.searchParams.get('project-protection-bypass'), relayConfig.externalAccessToken);
  assert.equal(observedHeaders?.get('authorization'), `Bearer ${relayConfig.serviceToken}`);
  assert.equal(observedHeaders?.get('content-type'), 'application/json');
  assert.deepEqual(observedBody, { model: expected });
  assert.deepEqual(Object.keys(observedBody as object), ['model']);
  assert.equal(expected.structureHash, '70dbb9c683297736d73f982a88c107394d7c643385a653c4c3480723a1a2419b');
  assert.equal(expected.constraintHash, '1b771f4cd9c43c7311cd95c27eb316aa96909cda355d13dc7c6cc24940a44463');
});

test('strict response fields and altered hashes are rejected before a plan is returned', async (t) => {
  const validPlan = createValidatedCivilLayoutMock(hostRequest()).plan;

  await t.test('rejects an extra plan field', async () => {
    const forward = createCentralPlanForwarder(relayConfig, async () => new Response(
      JSON.stringify({ ...validPlan, arbitraryCss: '.certificate-grid { display:none }' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const result = await forward(relayInput());
    assert.equal(result.status, 502);
    assert.deepEqual(result.body, { accepted: false, error: 'INVALID_CENTRAL_PLAN' });
  });

  await t.test('rejects a constraint hash mismatch', async () => {
    const forward = createCentralPlanForwarder(relayConfig, async () => new Response(
      JSON.stringify({ ...validPlan, constraintHash: '0'.repeat(64) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const result = await forward(relayInput());
    assert.equal(result.status, 502);
    assert.deepEqual(result.body, { accepted: false, error: 'INVALID_CENTRAL_PLAN' });
  });
});

test('strict host envelopes and invalid host models are rejected before upstream access', async () => {
  let upstreamCalls = 0;
  const forward = createCentralPlanForwarder(relayConfig, async () => {
    upstreamCalls += 1;
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const envelopeWithExtraField = await forward({
    ...relayInput(),
    extra: 'not part of the relay contract',
  });
  const wrongScreen = await forward(relayInput(hostRequest({ screenId: 'civil.payment' })));
  const wrongItemOrder = await forward(relayInput(hostRequest({ itemIds: [...itemIds].reverse() })));

  assert.equal(envelopeWithExtraField.status, 400);
  assert.deepEqual(envelopeWithExtraField.body, { accepted: false, error: 'INVALID_RELAY_REQUEST' });
  assert.equal(wrongScreen.status, 400);
  assert.deepEqual(wrongScreen.body, { accepted: false, error: 'INVALID_RELAY_MODEL' });
  assert.equal(wrongItemOrder.status, 400);
  assert.deepEqual(wrongItemOrder.body, { accepted: false, error: 'INVALID_RELAY_MODEL' });
  assert.equal(upstreamCalls, 0);
});

test('fixed-footer, mobile, and nonstandard profile contexts fail closed without an upstream call', async () => {
  let upstreamCalls = 0;
  const forward = createCentralPlanForwarder(relayConfig, async () => {
    upstreamCalls += 1;
    return new Response('{}', { status: 200 });
  });

  const fixedFooter = await forward({
    ...relayInput(),
    eligibility: { standardProfile: true, geometryKnown: true, hasFixedBottomControls: true },
  });
  const mobile = await forward(relayInput(hostRequest({
    viewport: { width: 390, height: 844, gridWidth: 360 },
  })));
  const largeText = await forward(relayInput(hostRequest({
    accessibility: {
      textScale: 'large',
      buttonScale: 'standard',
      contrast: 'standard',
      bottomControls: false,
      viewportMode: null,
    },
  })));
  const bottomControls = await forward(relayInput(hostRequest({
    accessibility: {
      textScale: 'standard',
      buttonScale: 'standard',
      contrast: 'standard',
      bottomControls: true,
      viewportMode: null,
    },
  })));

  assert.equal(fixedFooter.status, 400); // The strict eligibility schema rejects an unsafe claim.
  assert.equal(mobile.status, 409);
  assert.equal(largeText.status, 409);
  assert.equal(bottomControls.status, 409);
  assert.equal(upstreamCalls, 0);
});

test('central HTTP diagnostics distinguish errors without forwarding response details', async (t) => {
  await t.test('logs the 400 status and only an allow-listed JSON code', async () => {
    const diagnostics: unknown[] = [];
    const forward = createCentralPlanForwarder(relayConfig, async () => new Response(
      JSON.stringify({ error: 'INVALID_MODEL', detail: 'private upstream detail' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    ), (diagnostic) => diagnostics.push(diagnostic));
    const result = await forward(relayInput());
    assert.equal(result.status, 422);
    assert.deepEqual(result.body, { accepted: false, error: 'CENTRAL_MODEL_REJECTED' });
    assert.deepEqual(diagnostics, [{
      event: 'response',
      status: 400,
      contentType: 'application/json',
      errorCode: 'INVALID_MODEL',
    }]);
    assert.equal(JSON.stringify(diagnostics).includes('private upstream detail'), false);
  });

  await t.test('keeps 404 and 422 distinguishable in server diagnostics', async () => {
    for (const [status, code] of [[404, 'UNSUPPORTED_HOST_SCREEN'], [422, 'DISALLOWED_COLUMN_COUNT']] as const) {
      const diagnostics: unknown[] = [];
      const forward = createCentralPlanForwarder(relayConfig, async () => new Response(
        JSON.stringify({ code }),
        { status, headers: { 'Content-Type': 'application/json' } },
      ), (diagnostic) => diagnostics.push(diagnostic));
      const result = await forward(relayInput());
      assert.equal(result.status, 422);
      assert.deepEqual(diagnostics, [{
        event: 'response',
        status,
        contentType: 'application/json',
        errorCode: code,
      }]);
    }
  });

  await t.test('maps upstream authentication errors without forwarding response details', async () => {
    for (const status of [401, 403]) {
      const diagnostics: unknown[] = [];
      const forward = createCentralPlanForwarder(relayConfig, async () => new Response(
        JSON.stringify({ error: 'private-auth-detail' }),
        { status, headers: { 'Content-Type': 'application/json' } },
      ), (diagnostic) => diagnostics.push(diagnostic));
      const result = await forward(relayInput());
      assert.equal(result.status, 502);
      assert.deepEqual(result.body, { accepted: false, error: 'CENTRAL_AUTH_FAILED' });
      assert.deepEqual(diagnostics, [{
        event: 'response',
        status,
        contentType: 'application/json',
      }]);
      assert.equal(JSON.stringify(diagnostics).includes('private-auth-detail'), false);
    }
  });

  await t.test('logs HTML status and Content-Type without reading or logging its body', async () => {
    const diagnostics: unknown[] = [];
    const forward = createCentralPlanForwarder(relayConfig, async () => new Response(
      '<html>private gateway details</html>',
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    ), (diagnostic) => diagnostics.push(diagnostic));
    const result = await forward(relayInput());
    assert.equal(result.status, 422);
    assert.deepEqual(result.body, { accepted: false, error: 'CENTRAL_MODEL_REJECTED' });
    assert.deepEqual(diagnostics, [{
      event: 'response',
      status: 404,
      contentType: 'text/html',
    }]);
    assert.equal(JSON.stringify(diagnostics).includes('private gateway details'), false);
  });

  await t.test('does not pass through a sensitive plan-validation body', async () => {
    const diagnostics: unknown[] = [];
    const forward = createCentralPlanForwarder(relayConfig, async () => new Response(
      JSON.stringify({ ...createValidatedCivilLayoutMock(hostRequest()).plan, detail: 'private plan detail' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ), (diagnostic) => diagnostics.push(diagnostic));
    const result = await forward(relayInput());
    assert.equal(result.status, 502);
    assert.deepEqual(result.body, { accepted: false, error: 'INVALID_CENTRAL_PLAN' });
    assert.deepEqual(diagnostics, [{
      event: 'response',
      status: 200,
      contentType: 'application/json',
      errorCode: 'INVALID_CENTRAL_PLAN',
    }]);
    assert.equal(JSON.stringify(diagnostics).includes('private plan detail'), false);
  });

  await t.test('maps network errors and timeouts without logging exception text', async () => {
    const networkDiagnostics: unknown[] = [];
    const networkForward = createCentralPlanForwarder(relayConfig, async () => {
      throw new Error('private endpoint and token details');
    }, (diagnostic) => networkDiagnostics.push(diagnostic));
    const networkResult = await networkForward(relayInput());
    assert.equal(networkResult.status, 502);
    assert.deepEqual(networkDiagnostics, [{
      event: 'transport-error',
      errorCode: 'CENTRAL_NETWORK_ERROR',
    }]);

    const timeoutDiagnostics: unknown[] = [];
    const timeoutForward = createCentralPlanForwarder(
      { ...relayConfig, requestTimeoutMs: 5 },
      async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('private timeout detail')), { once: true });
      }),
      (diagnostic) => timeoutDiagnostics.push(diagnostic),
    );
    const timeoutResult = await timeoutForward(relayInput());
    assert.equal(timeoutResult.status, 504);
    assert.deepEqual(timeoutDiagnostics, [{
      event: 'transport-error',
      errorCode: 'CENTRAL_REQUEST_TIMEOUT',
    }]);
    assert.equal(JSON.stringify([...networkDiagnostics, ...timeoutDiagnostics]).includes('private'), false);
  });
});

test('off mode does not contact upstream and the plugin has no Vite preview registration', async () => {
  let upstreamCalls = 0;
  const off = createCentralPlanForwarder({ enabled: false }, async () => {
    upstreamCalls += 1;
    return new Response('{}');
  });
  const result = await off(relayInput());
  assert.equal(result.status, 404);
  assert.equal(upstreamCalls, 0);

  let disabledRegistrations = 0;
  const disabledLogs: string[] = [];
  const disabledPlugin = createCentralDevelopmentRelayPlugin({
    CIVIL_UNIVERSAL_LAYOUT_CENTRAL_DEV_URL: relayConfig.developmentUrl,
  });
  disabledPlugin.configureServer?.({
    config: { logger: { info: (message: string) => disabledLogs.push(message) } },
    middlewares: { use: () => { disabledRegistrations += 1; } },
  } as never);
  assert.equal(disabledRegistrations, 0);
  assert.equal(disabledPlugin.configurePreviewServer, undefined);
  assert.deepEqual(disabledLogs, [
    '[civil-universal-layout] relay=off target-format=valid-development-origin',
  ]);

  let enabledRegistrations = 0;
  const enabledLogs: string[] = [];
  const enabledPlugin = createCentralDevelopmentRelayPlugin({
    CIVIL_UNIVERSAL_LAYOUT_CENTRAL_RELAY_ENABLED: 'true',
    CIVIL_UNIVERSAL_LAYOUT_CENTRAL_DEV_URL: relayConfig.developmentUrl,
    CIVIL_UNIVERSAL_LAYOUT_EXTERNAL_ACCESS_TOKEN: relayConfig.externalAccessToken,
    AI_LAYOUT_SERVICE_TOKEN: relayConfig.serviceToken,
  });
  enabledPlugin.configureServer?.({
    config: { logger: { info: (message: string) => enabledLogs.push(message) } },
    middlewares: { use: () => { enabledRegistrations += 1; } },
  } as never);
  assert.equal(enabledRegistrations, 1);
  assert.equal(enabledPlugin.configurePreviewServer, undefined);
  assert.deepEqual(enabledLogs, [
    '[civil-universal-layout] relay=on target-format=valid-development-origin',
  ]);
  assert.equal(enabledLogs.join(' ').includes(relayConfig.developmentUrl), false);
  assert.equal(enabledLogs.join(' ').includes(relayConfig.externalAccessToken), false);
  assert.equal(enabledLogs.join(' ').includes(relayConfig.serviceToken), false);
});

test('the relay refuses production and non-Replit URL targets without fetching', async () => {
  for (const developmentUrl of [
    'https://civil-kiosk.replit.app',
    'https://central-dev.example.replit.dev/api/dev/universal-layout/plan',
    'https://example.com',
  ]) {
    let upstreamCalls = 0;
    const forward = createCentralPlanForwarder({
      ...relayConfig,
      developmentUrl,
    }, async () => {
      upstreamCalls += 1;
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const result = await forward(relayInput());
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { accepted: false, error: 'CENTRAL_RELAY_NOT_CONFIGURED' });
    assert.equal(upstreamCalls, 0);
  }
});

test('simultaneous duplicate requests do not create a second upstream call', async () => {
  let upstreamCalls = 0;
  let releaseUpstream: ((response: Response) => void) | undefined;
  const forward = createCentralPlanForwarder(relayConfig, () => {
    upstreamCalls += 1;
    return new Promise((resolve) => {
      releaseUpstream = resolve;
    });
  });

  const firstRequest = forward(relayInput());
  await new Promise((resolve) => setImmediate(resolve));
  const duplicate = await forward(relayInput());
  assert.equal(duplicate.status, 409);
  assert.deepEqual(duplicate.body, { accepted: false, error: 'DUPLICATE_REQUEST' });
  assert.equal(upstreamCalls, 1);

  releaseUpstream?.(new Response(
    JSON.stringify(createValidatedCivilLayoutMock(hostRequest()).plan),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
  assert.equal((await firstRequest).status, 200);
});
