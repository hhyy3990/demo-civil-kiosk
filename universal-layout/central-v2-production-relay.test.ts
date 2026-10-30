import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CIVIL_V2_PRODUCTION_HOST_ID,
  CIVIL_V2_PRODUCTION_COMPONENT_ID,
  CIVIL_V2_PRODUCTION_ITEM_IDS,
  CIVIL_V2_PRODUCTION_OPTION_GROUP_ID,
  CIVIL_V2_PRODUCTION_OPTION_ID,
  CIVIL_V2_PRODUCTION_SCREEN_ID,
  CIVIL_V2_PRODUCTION_STRUCTURE_VERSION,
  createCivilProductionV2Model,
} from './civil-layout-v2-production.js';
import {
  createCivilProductionV2Forwarder,
  parseCivilProductionIdempotencyKey,
} from './central-v2-production-relay.js';
import {
  claimQrProfileResolveAttempt,
  formatCivilQrApplyIdempotencyKey,
  shouldStartCivilProductionQrPlan,
} from './civil-qr-apply-event.js';

const input = {
  request: {
    screenId: CIVIL_V2_PRODUCTION_SCREEN_ID,
    itemIds: [...CIVIL_V2_PRODUCTION_ITEM_IDS],
    viewport: { width: 1080, height: 1920, gridWidth: 470 },
    accessibility: {
      textScale: 'large',
      buttonScale: 'large',
      contrast: 'high',
      viewportMode: { mode: 'bottom', heightPercent: 70 },
    },
    layoutCapabilities: ['reserved-bottom-controls'],
  },
  eligibility: {
    screenIsMainMenu: true,
    viewportAllowed: true,
    geometryKnown: true,
    footerVisible: true,
    footerInFlow: true,
    qrDockVisible: true,
    qrDockReservesBottom: true,
    menuClearOfFooter: true,
    menuClearOfQrDock: true,
    minimumTouchTargetPx: 44,
    menuHitTestSafe: true,
    reservedBottomCapability: true,
    targetViewport: true,
    centralProfileAllowed: true,
  },
  qrProfile: {
    textSize: 'large',
    buttonSize: 'large',
    contrast: 'high',
    bottomControls: false,
    easyLanguage: true,
    smartGuide: true,
    scrollGuidance: true,
    voiceGuidance: false,
    viewportMode: { mode: 'bottom', heightPercent: 70 },
  },
};

function eventKey(sequence: number): string {
  const eventId = `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
  const key = formatCivilQrApplyIdempotencyKey(eventId);
  assert.ok(key);
  return key;
}

function makePlan(model: ReturnType<typeof createCivilProductionV2Model>) {
  return {
    schemaVersion: model.schemaVersion,
    contractVersion: model.contractVersion,
    hostId: model.hostId,
    screenId: model.screenId,
    structureVersion: model.structureVersion,
    structureHash: model.structureHash,
    constraintHash: model.constraintHash,
    viewportClass: model.viewportClass,
    operations: [{
      type: 'selectLayoutOption',
      targetId: CIVIL_V2_PRODUCTION_COMPONENT_ID,
      groupId: CIVIL_V2_PRODUCTION_OPTION_GROUP_ID,
      optionId: CIVIL_V2_PRODUCTION_OPTION_ID,
    }],
  };
}

function readyConfig(fetcher: typeof fetch, extra: Record<string, unknown> = {}) {
  return {
    productionRuntime: true,
    enabled: true,
    hostPolicyVerified: true,
    centralProductionUrl: 'https://central-production.example',
    hostAiToken: 'not-a-real-host-token',
    productionExternalAccessToken: 'not-a-real-production-external-access-token',
    sessionSecret: 'not-a-real-session-secret',
    fetcher,
    ...extra,
  };
}

test('Production relay sends separate platform and app auth with idempotency; accepts a valid raw plan', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (inputUrl, init) => {
    calls += 1;
    const url = new URL(String(inputUrl));
    assert.equal(url.pathname, '/api/production/universal-layout/v2/openai-plan');
    assert.equal(init?.method, 'POST');
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer not-a-real-production-external-access-token',
    );
    assert.equal(new Headers(init?.headers).get('X-Host-AI-Token'), 'not-a-real-host-token');
    assert.equal(new Headers(init?.headers).get('Idempotency-Key'), eventKey(1));
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body), ['model']);
    const model = body.model as ReturnType<typeof createCivilProductionV2Model>;
    return new Response(JSON.stringify(makePlan(model)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
  const first = await forward(input, eventKey(1), 'session-1');
  const duplicate = await forward(input, eventKey(1), 'session-1');
  assert.equal(first.status, 200);
  assert.equal((first.body.plan as { operations: { optionId: string }[] }).operations[0]?.optionId, 'reserved-safe-list');
  assert.equal(duplicate.status, 200);
  assert.equal(calls, 1);
  assert.equal(first.body.model && (first.body.model as { hostId: string }).hostId, CIVIL_V2_PRODUCTION_HOST_ID);
  assert.equal((first.body.plan as { structureVersion: string }).structureVersion, CIVIL_V2_PRODUCTION_STRUCTURE_VERSION);
});

test('Production relay stays blocked before fetch unless all independent gates and registry verification are true', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    throw new Error('unexpected fake fetch');
  };
  for (const overrides of [
    { enabled: false },
    { productionRuntime: false },
    { hostPolicyVerified: false },
    { hostAiToken: '' },
    { productionExternalAccessToken: '' },
    { centralProductionUrl: 'https://central-production.example/api/path' },
  ]) {
    const forward = createCivilProductionV2Forwarder(readyConfig(fetcher, overrides));
    const result = await forward(input, eventKey(2), `session-${calls}-${Object.keys(overrides)[0]}`);
    assert.notEqual(result.status, 200);
  }
  assert.equal(calls, 0);
});

test('Production relay blocks non-target claimed viewport dimensions before provider fetch', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    throw new Error('unexpected fake fetch');
  };
  const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
  const viewports = [
    { width: 1080, height: 1919, gridWidth: 470 },
    { width: 1079, height: 1920, gridWidth: 470 },
    { width: 1200, height: 1920, gridWidth: 470 },
    { width: 1920, height: 1080, gridWidth: 470 },
  ];
  for (const [index, viewport] of viewports.entries()) {
    const result = await forward({
      ...input,
      request: { ...input.request, viewport },
    }, eventKey(60 + index), `session-viewport-${index}`);
    assert.equal(result.status, 409);
    assert.equal((result.body as { error: string }).error, 'PRODUCTION_MODEL_REJECTED');
  }
  assert.equal(calls, 0);
});

test('Production relay rejects unsafe host geometry and policy claims before provider fetch', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    throw new Error('unexpected fake fetch');
  };
  const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
  const cases = [
    { eligibility: { geometryKnown: false } },
    { eligibility: { footerVisible: false } },
    { eligibility: { footerInFlow: false } },
    { eligibility: { qrDockVisible: false } },
    { eligibility: { qrDockReservesBottom: false } },
    { eligibility: { menuClearOfFooter: false } },
    { eligibility: { menuClearOfQrDock: false } },
    { eligibility: { minimumTouchTargetPx: 43 } },
    { eligibility: { menuHitTestSafe: false } },
    { eligibility: { reservedBottomCapability: false } },
    { eligibility: { targetViewport: false } },
    { eligibility: { centralProfileAllowed: false } },
    { request: { layoutCapabilities: [] } },
    { request: { itemIds: [...input.request.itemIds].reverse() } },
  ];
  for (const [index, override] of cases.entries()) {
    const invalidInput = {
      ...input,
      ...('eligibility' in override
        ? { eligibility: { ...input.eligibility, ...override.eligibility } }
        : {}),
      ...('request' in override
        ? { request: { ...input.request, ...override.request } }
        : {}),
    };
    const result = await forward(invalidInput, eventKey(70 + index), `session-unsafe-${index}`);
    assert.equal(result.status, 409);
    assert.equal((result.body as { error: string }).error, 'PRODUCTION_MODEL_REJECTED');
  }
  assert.equal(calls, 0);
});

test('Production relay fails closed on invalid plan and does not retry the provider', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
  const first = await forward(input, eventKey(3), 'session-3');
  const duplicate = await forward(input, eventKey(3), 'session-3');
  assert.equal(first.status, 502);
  assert.equal((first.body as { error: string }).error, 'INVALID_CENTRAL_PLAN');
  assert.deepEqual(duplicate, first);
  assert.equal(calls, 1);
});

test('same event is deduplicated while a new QR event in the same session gets a new AI attempt', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls += 1;
    const model = JSON.parse(String(init?.body)).model as ReturnType<typeof createCivilProductionV2Model>;
    return new Response(JSON.stringify(makePlan(model)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
  const firstKey = eventKey(4);
  const first = await forward(input, firstKey, 'session-4');
  const sameEventDuplicate = await forward(input, firstKey, 'session-4');
  const newEvent = await forward(input, eventKey(5), 'session-4');
  assert.equal(first.status, 200);
  assert.deepEqual(sameEventDuplicate, first);
  assert.equal(newEvent.status, 200);
  assert.equal(calls, 2);
});

test('concurrent duplicate requests for one QR event share a single upstream attempt', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const model = JSON.parse(String(init?.body)).model as ReturnType<typeof createCivilProductionV2Model>;
    return new Response(JSON.stringify(makePlan(model)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
  const key = eventKey(56);
  const [first, duplicate] = await Promise.all([
    forward(input, key, 'session-concurrent'),
    forward(input, key, 'session-concurrent'),
  ]);
  assert.equal(first.status, 200);
  assert.deepEqual(duplicate, first);
  assert.equal(calls, 1);
});

test('Production relay maps authentication and allowlist errors safely without retrying', async (t) => {
  for (const [status, code, expectedStatus] of [
    [403, 'AUTH_REQUIRED', 502],
    [404, 'HOST_NOT_ALLOWLISTED', 422],
  ] as const) {
    await t.test(`central ${status}`, async () => {
      let calls = 0;
      const fetcher: typeof fetch = async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: code }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      };
      const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
      const result = await forward(input, eventKey(status), `session-${status}`);
      assert.equal(result.status, expectedStatus);
      assert.equal((result.body as { error: string }).error, code);
      assert.equal(calls, 1);
    });
  }
});

test('Production relay safely handles 401/403/429/502/503 and redirect failures without extra fetches', async (t) => {
  const cases = [
    {
      name: '401',
      status: 401,
      body: { error: 'AUTH_REQUIRED' },
      expectedStatus: 502,
      expectedCode: 'AUTH_REQUIRED',
    },
    {
      name: '403',
      status: 403,
      body: { error: 'AUTH_REQUIRED' },
      expectedStatus: 502,
      expectedCode: 'AUTH_REQUIRED',
    },
    {
      name: '429',
      status: 429,
      body: { error: 'PROVIDER_CALL_LIMIT_REACHED' },
      expectedStatus: 429,
      expectedCode: 'PROVIDER_CALL_LIMIT_REACHED',
    },
    {
      name: '502',
      status: 502,
      body: { error: 'UPSTREAM_PRIVATE_DETAIL' },
      expectedStatus: 502,
      expectedCode: 'CENTRAL_PLAN_REJECTED',
    },
    {
      name: '503',
      status: 503,
      body: { error: 'UPSTREAM_PRIVATE_DETAIL' },
      expectedStatus: 502,
      expectedCode: 'CENTRAL_PLAN_REJECTED',
    },
  ] as const;

  for (const [index, scenario] of cases.entries()) {
    await t.test(`HTTP ${scenario.name}`, async () => {
      let calls = 0;
      const fetcher: typeof fetch = async () => {
        calls += 1;
        return new Response(JSON.stringify(scenario.body), {
          status: scenario.status,
          headers: { 'Content-Type': 'application/json' },
        });
      };
      const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
      const key = eventKey(70 + index);
      const session = `session-error-${scenario.name}`;
      const first = await forward(input, key, session);
      const duplicate = await forward(input, key, session);
      assert.equal(first.status, scenario.expectedStatus);
      assert.equal((first.body as { error: string }).error, scenario.expectedCode);
      assert.deepEqual(duplicate, first);
      assert.equal(calls, 1);
      assert.equal(JSON.stringify(first).includes('UPSTREAM_PRIVATE_DETAIL'), false);
    });
  }

  await t.test('redirect rejection', async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (_url, init) => {
      calls += 1;
      assert.equal(init?.redirect, 'error');
      throw new TypeError('private redirect location must not be returned');
    };
    const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
    const key = eventKey(80);
    const first = await forward(input, key, 'session-redirect');
    const duplicate = await forward(input, key, 'session-redirect');
    assert.equal(first.status, 502);
    assert.equal((first.body as { error: string }).error, 'CENTRAL_PLAN_FAILED');
    assert.deepEqual(duplicate, first);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(first).includes('private redirect location'), false);
  });
});

test('Production relay times out once, sanitizes the failure, and does not retry', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls += 1;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('private request detail');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  };
  const forward = createCivilProductionV2Forwarder(
    readyConfig(fetcher, { requestTimeoutMs: 1 }),
  );
  const result = await forward(input, eventKey(50), 'session-timeout');
  assert.equal(result.status, 504);
  assert.equal((result.body as { error: string }).error, 'CENTRAL_REQUEST_TIMEOUT');
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes('private request detail'), false);
});

test('Production idempotency keys are strict UUIDv4 QR-event IDs and exclude other payload data', () => {
  const valid = eventKey(51);
  assert.equal(parseCivilProductionIdempotencyKey(valid), valid);
  assert.equal(parseCivilProductionIdempotencyKey(undefined), null);
  assert.equal(parseCivilProductionIdempotencyKey(''), null);
  assert.equal(parseCivilProductionIdempotencyKey(valid.replace('civil-qr-apply:', 'session-token:')), null);
  assert.equal(parseCivilProductionIdempotencyKey(`${valid}:qr-token`), null);
  assert.equal(
    parseCivilProductionIdempotencyKey('civil-qr-apply:00000000-0000-1000-8000-000000000001'),
    null,
  );
  assert.equal(formatCivilQrApplyIdempotencyKey('not-a-uuid'), null);
});

test('a page refresh has no persisted QR event; only a new explicit apply can start another plan', () => {
  const firstEvent = {
    id: 1,
    profile: input.qrProfile,
    productionIdempotencyKey: eventKey(52),
  };
  assert.equal(shouldStartCivilProductionQrPlan(null, null), false);
  assert.equal(shouldStartCivilProductionQrPlan(firstEvent, null), true);
  assert.equal(shouldStartCivilProductionQrPlan(firstEvent, firstEvent.id), false);
  const nextEvent = {
    id: 2,
    profile: input.qrProfile,
    productionIdempotencyKey: eventKey(53),
  };
  assert.equal(shouldStartCivilProductionQrPlan(nextEvent, firstEvent.id), true);
});

test('the same event key in a different session remains a separate user attempt', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls += 1;
    const model = JSON.parse(String(init?.body)).model as ReturnType<typeof createCivilProductionV2Model>;
    return new Response(JSON.stringify(makePlan(model)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const forward = createCivilProductionV2Forwarder(readyConfig(fetcher));
  const userOne = await forward(input, eventKey(54), 'session-user-one');
  const userTwo = await forward(input, eventKey(55), 'session-user-two');
  assert.equal(userOne.status, 200);
  assert.equal(userTwo.status, 200);
  assert.equal(calls, 2);
});

test('one QR resolver event cannot be claimed twice by repeated scanner callbacks', () => {
  const loadingState = { current: false };
  assert.equal(claimQrProfileResolveAttempt(loadingState), true);
  assert.equal(claimQrProfileResolveAttempt(loadingState), false);
  loadingState.current = false;
  assert.equal(claimQrProfileResolveAttempt(loadingState), true);
});
